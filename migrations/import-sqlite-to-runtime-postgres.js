#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

process.env.ATTENDANCE_AUTO_SEED = '0';

const store = require('../lib/sqlite');

const ROOT_DIR = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const force = args.includes('--force');

function readArgValue(flagName) {
    const index = args.indexOf(flagName);
    if (index === -1 || index === args.length - 1) {
        return '';
    }
    return String(args[index + 1] || '').trim();
}

function normalizeText(value) {
    return String(value || '').trim();
}

function resolveSourceRoot() {
    const explicitSourceRoot = readArgValue('--source-root');
    const candidates = [
        explicitSourceRoot,
        process.env.SQLITE_SOURCE_ROOT,
        process.env.ATTENDANCE_SOURCE_DIR,
        process.env.ATTENDANCE_DATA_DIR,
        ROOT_DIR,
        path.join(os.homedir(), 'AttendanceApp')
    ]
        .map((value) => normalizeText(value))
        .filter(Boolean)
        .map((value) => path.resolve(value));

    const uniqueCandidates = [...new Set(candidates)];
    const resolved = uniqueCandidates.find((candidate) => fs.existsSync(path.join(candidate, 'data', 'master.db')));
    if (!resolved) {
        throw new Error(`Source SQLite master.db not found. Checked: ${uniqueCandidates.join(', ')}`);
    }
    return resolved;
}

function quoteIdentifier(value) {
    return `"${String(value || '').replace(/"/g, '""')}"`;
}

function openSqliteDb(filePath) {
    return new Database(filePath, { readonly: true, fileMustExist: true });
}

function listTables(db) {
    return db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name COLLATE NOCASE
    `).all().map((row) => String(row.name || '').trim()).filter(Boolean);
}

function listColumns(db, tableName) {
    return db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all().map((row) => ({
        name: String(row.name || '').trim(),
        type: String(row.type || '').trim()
    })).filter((column) => column.name);
}

function getSharedColumns(sourceDb, targetDb, tableName) {
    const sourceColumns = listColumns(sourceDb, tableName);
    const targetColumnNames = new Set(listColumns(targetDb, tableName).map((column) => column.name));
    return sourceColumns
        .map((column) => column.name)
        .filter((columnName) => targetColumnNames.has(columnName));
}

function normalizeDbValue(value) {
    if (value === undefined) {
        return null;
    }
    if (value instanceof Uint8Array && !Buffer.isBuffer(value)) {
        return Buffer.from(value);
    }
    return value;
}

function countRows(db, tableName) {
    return Number(db.prepare(`SELECT COUNT(*) AS total FROM ${quoteIdentifier(tableName)}`).get()?.total || 0);
}

function clearTables(targetDb, tableNames) {
    const uniqueTableNames = [...new Set((tableNames || []).filter(Boolean))];
    if (!uniqueTableNames.length) {
        return;
    }

    targetDb.transaction((names) => {
        names.forEach((tableName) => {
            targetDb.prepare(`DELETE FROM ${quoteIdentifier(tableName)}`).run();
        });
    })(uniqueTableNames);
}

function resetSequenceIfNeeded(targetDb, tableName, columnNames) {
    if (!targetDb?.__isPostgresCompat) {
        return;
    }

    const candidateColumn = ['id', 'row_id'].find((columnName) => columnNames.includes(columnName));
    if (!candidateColumn) {
        return;
    }

    const schemaName = String(targetDb.schema || 'public').trim() || 'public';
    const sequenceLookup = targetDb.prepare(`
        SELECT pg_get_serial_sequence(?, ?) AS sequence_name
    `).get(`"${schemaName}"."${tableName}"`, candidateColumn);
    const sequenceName = String(sequenceLookup?.sequence_name || '').trim();
    if (!sequenceName) {
        return;
    }

    const maxRow = targetDb.prepare(`
        SELECT MAX(${quoteIdentifier(candidateColumn)}) AS value
        FROM ${quoteIdentifier(tableName)}
    `).get();
    const maxValue = Number(maxRow?.value || 0);
    const nextValue = maxValue > 0 ? maxValue : 1;
    const isCalled = maxValue > 0 ? 'true' : 'false';
    const escapedSequenceName = sequenceName.replace(/'/g, "''");
    targetDb.exec(`SELECT setval('${escapedSequenceName}', ${nextValue}, ${isCalled})`);
}

function copyTable(sourceDb, targetDb, tableName) {
    const sharedColumns = getSharedColumns(sourceDb, targetDb, tableName);
    if (!sharedColumns.length) {
        console.log(`[runtime-import] skip ${tableName}: no shared columns`);
        return 0;
    }

    const insertSql = `
        INSERT INTO ${quoteIdentifier(tableName)} (${sharedColumns.map((columnName) => quoteIdentifier(columnName)).join(', ')})
        VALUES (${sharedColumns.map(() => '?').join(', ')})
    `;
    const insertRow = targetDb.prepare(insertSql);
    const sourceRows = sourceDb.prepare(`SELECT * FROM ${quoteIdentifier(tableName)}`).iterate();

    let importedRows = 0;
    let batch = [];
    const flushBatch = targetDb.transaction((rows) => {
        rows.forEach((row) => {
            insertRow.run(...sharedColumns.map((columnName) => normalizeDbValue(row[columnName])));
        });
    });

    for (const row of sourceRows) {
        batch.push(row);
        if (batch.length >= 250) {
            flushBatch(batch);
            importedRows += batch.length;
            batch = [];
        }
    }

    if (batch.length) {
        flushBatch(batch);
        importedRows += batch.length;
    }

    resetSequenceIfNeeded(targetDb, tableName, sharedColumns);
    return importedRows;
}

function collectTenantDbFiles(sourceRoot) {
    const tenantsDir = path.join(sourceRoot, 'data', 'tenants');
    if (!fs.existsSync(tenantsDir)) {
        return [];
    }

    return fs.readdirSync(tenantsDir)
        .filter((fileName) => /\.db$/i.test(fileName))
        .filter((fileName) => !/\.backup-\d{8}-\d{6}\.db$/i.test(fileName))
        .sort((left, right) => left.localeCompare(right))
        .map((fileName) => ({
            companyId: fileName.replace(/\.db$/i, '').trim(),
            filePath: path.join(tenantsDir, fileName)
        }))
        .filter((entry) => entry.companyId);
}

function importMaster(sourceRoot) {
    const sourceMasterPath = path.join(sourceRoot, 'data', 'master.db');
    const sourceMasterDb = openSqliteDb(sourceMasterPath);

    try {
        const sourceTables = listTables(sourceMasterDb);
        const targetMasterDb = store.getMasterDb();
        const targetTables = listTables(targetMasterDb);

        if (!force) {
            const targetUserCount = targetTables.includes('users') ? countRows(targetMasterDb, 'users') : 0;
            const targetCompanyCount = targetTables.includes('companies') ? countRows(targetMasterDb, 'companies') : 0;
            const seededOnlyTarget = targetCompanyCount === 0 && targetUserCount <= 1;
            if (!seededOnlyTarget) {
                throw new Error('Target PostgreSQL master schema already contains data. Re-run with --force to replace it.');
            }
        }

        clearTables(targetMasterDb, [...targetTables].reverse());

        const stats = [];
        sourceTables.forEach((tableName) => {
            const rowCount = copyTable(sourceMasterDb, targetMasterDb, tableName);
            stats.push({ tableName, rowCount });
            console.log(`[runtime-import] master.${tableName}: ${rowCount} row(s)`);
        });
        return stats;
    } finally {
        sourceMasterDb.close();
    }
}

function importTenants(sourceRoot) {
    const tenantSources = collectTenantDbFiles(sourceRoot);
    const stats = [];

    tenantSources.forEach((tenantSource) => {
        const sourceTenantDb = openSqliteDb(tenantSource.filePath);
        try {
            const targetTenantDb = store.getTenantDb(tenantSource.companyId);
            const sourceTables = listTables(sourceTenantDb);
            const targetTables = listTables(targetTenantDb);
            clearTables(targetTenantDb, [...targetTables].reverse());

            sourceTables.forEach((tableName) => {
                const rowCount = copyTable(sourceTenantDb, targetTenantDb, tableName);
                stats.push({
                    companyId: tenantSource.companyId,
                    tableName,
                    rowCount
                });
                console.log(`[runtime-import] ${tenantSource.companyId}.${tableName}: ${rowCount} row(s)`);
            });
        } finally {
            sourceTenantDb.close();
        }
    });

    return stats;
}

function run() {
    const sourceRoot = resolveSourceRoot();
    console.log(`[runtime-import] source root: ${sourceRoot}`);
    store.ensureSystemReady();

    const masterStats = importMaster(sourceRoot);
    const tenantStats = importTenants(sourceRoot);
    const totalRows = masterStats.reduce((sum, row) => sum + row.rowCount, 0)
        + tenantStats.reduce((sum, row) => sum + row.rowCount, 0);

    console.log(`[runtime-import] completed: ${totalRows} total row(s) imported`);
}

try {
    run();
} catch (error) {
    console.error('[runtime-import] failed:', error);
    process.exitCode = 1;
} finally {
    store.closeAll?.();
}
