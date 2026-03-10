#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const {
    buildMissingDatabaseUrlMessage,
    getDatabaseConnectionString,
    sanitizeConnectionString
} = require('../lib/database-config');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_ROOT = process.env.ATTENDANCE_DATA_DIR
    ? path.resolve(process.env.ATTENDANCE_DATA_DIR)
    : ROOT_DIR;
const DATA_DIR = path.join(DATA_ROOT, 'data');
const TENANTS_DIR = path.join(DATA_DIR, 'tenants');
const MASTER_DB_PATH = path.join(DATA_DIR, 'master.db');
const LEGACY_USERS_DB_PATH = path.join(DATA_ROOT, 'head_admin', 'data', 'users.db');
const LEGACY_ATTENDANCE_DB_PATH = path.join(DATA_ROOT, 'employee', 'data', 'attendance.db');
const DATABASE_URL = getDatabaseConnectionString({ preferNonPooling: true });
const DATABASE_SSL_MODE = String(process.env.DATABASE_SSL_MODE || '').trim().toLowerCase();
const TARGET_SCHEMA = normalizeIdentifier(process.env.POSTGRES_IMPORT_SCHEMA || 'sqlite_import', 'sqlite_import');
const DEFAULT_BATCH_SIZE = Math.max(1, Number(process.env.POSTGRES_IMPORT_BATCH_SIZE || 250));

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const skipLegacy = args.has('--skip-legacy');

function normalizeIdentifier(value, fallback = 'sqlite_import') {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized || fallback;
}

function quotePostgresIdentifier(value) {
    return `"${String(value || '').replace(/"/g, '""')}"`;
}

function quoteSqliteIdentifier(value) {
    return `"${String(value || '').replace(/"/g, '""')}"`;
}

function buildPgConfig() {
    if (!DATABASE_URL) {
        throw new Error(buildMissingDatabaseUrlMessage('import'));
    }
    const sanitizedConnectionString = sanitizeConnectionString(DATABASE_URL);

    const config = {
        connectionString: sanitizedConnectionString,
        max: 1
    };

    if (DATABASE_SSL_MODE === 'require' || DATABASE_SSL_MODE === 'prefer') {
        config.ssl = { rejectUnauthorized: false };
    }

    return config;
}

function openSqliteDb(filePath) {
    return new Database(filePath, { readonly: true, fileMustExist: true });
}

function listSqliteTables(db) {
    return db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name COLLATE NOCASE
    `).all().map((row) => String(row.name || '').trim()).filter(Boolean);
}

function listSqliteColumns(db, tableName) {
    return db.prepare(`PRAGMA table_info(${quoteSqliteIdentifier(tableName)})`).all().map((row) => ({
        name: String(row.name || '').trim(),
        type: String(row.type || '').trim()
    })).filter((column) => column.name);
}

function mapSqliteTypeToPostgres(type = '') {
    const normalized = String(type || '').trim().toUpperCase();
    if (!normalized) {
        return 'TEXT';
    }
    if (normalized.includes('INT')) {
        return 'BIGINT';
    }
    if (normalized.includes('REAL') || normalized.includes('FLOA') || normalized.includes('DOUB')) {
        return 'DOUBLE PRECISION';
    }
    if (normalized.includes('NUMERIC') || normalized.includes('DECIMAL')) {
        return 'NUMERIC';
    }
    if (normalized.includes('BLOB')) {
        return 'BYTEA';
    }
    if (normalized.includes('BOOL')) {
        return 'BOOLEAN';
    }
    return 'TEXT';
}

function normalizePgValue(value) {
    if (value === undefined) {
        return null;
    }
    if (value instanceof Uint8Array && !Buffer.isBuffer(value)) {
        return Buffer.from(value);
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
        return null;
    }
    return value;
}

function collectTenantSources() {
    if (!fs.existsSync(TENANTS_DIR)) {
        return [];
    }

    return fs.readdirSync(TENANTS_DIR)
        .filter((fileName) => /\.db$/i.test(fileName))
        .filter((fileName) => !/\.backup-\d{8}-\d{6}\.db$/i.test(fileName))
        .sort((left, right) => left.localeCompare(right))
        .map((fileName) => ({
            kind: 'tenant',
            sourceId: fileName.replace(/\.db$/i, '').trim(),
            filePath: path.join(TENANTS_DIR, fileName)
        }))
        .filter((source) => source.sourceId);
}

function collectStandaloneSources() {
    const sources = [];

    if (fs.existsSync(MASTER_DB_PATH)) {
        sources.push({
            kind: 'master',
            sourceId: 'master',
            filePath: MASTER_DB_PATH
        });
    }

    if (!skipLegacy && fs.existsSync(LEGACY_USERS_DB_PATH)) {
        sources.push({
            kind: 'legacy_users',
            sourceId: 'legacy_users',
            filePath: LEGACY_USERS_DB_PATH
        });
    }

    if (!skipLegacy && fs.existsSync(LEGACY_ATTENDANCE_DB_PATH)) {
        sources.push({
            kind: 'legacy_attendance',
            sourceId: 'legacy_attendance',
            filePath: LEGACY_ATTENDANCE_DB_PATH
        });
    }

    return sources;
}

function buildTargetTableName(sourceKind, tableName) {
    if (sourceKind === 'tenant') {
        return `tenants__${tableName}`;
    }
    if (sourceKind === 'legacy_users') {
        return `legacy_users__${tableName}`;
    }
    if (sourceKind === 'legacy_attendance') {
        return `legacy_attendance__${tableName}`;
    }
    return `master__${tableName}`;
}

function mergeColumnSpecs(targetColumns, nextColumns) {
    nextColumns.forEach((column) => {
        const existing = targetColumns.find((entry) => entry.name === column.name);
        if (!existing) {
            targetColumns.push({ ...column });
            return;
        }

        if (!existing.type && column.type) {
            existing.type = column.type;
        }
    });
}

function buildTenantTableSpecs(tenantSources) {
    const specs = new Map();

    tenantSources.forEach((source) => {
        const db = openSqliteDb(source.filePath);
        try {
            listSqliteTables(db).forEach((tableName) => {
                const columns = listSqliteColumns(db, tableName);
                if (!specs.has(tableName)) {
                    specs.set(tableName, []);
                }
                mergeColumnSpecs(specs.get(tableName), columns);
            });
        } finally {
            db.close();
        }
    });

    return specs;
}

async function prepareTargetSchema(client) {
    if (force) {
        await client.query(`DROP SCHEMA IF EXISTS ${quotePostgresIdentifier(TARGET_SCHEMA)} CASCADE`);
        await client.query(`CREATE SCHEMA ${quotePostgresIdentifier(TARGET_SCHEMA)}`);
        return;
    }

    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quotePostgresIdentifier(TARGET_SCHEMA)}`);
    const result = await client.query(`
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = $1
        LIMIT 1
    `, [TARGET_SCHEMA]);

    if (result.rowCount) {
        throw new Error(`Target schema "${TARGET_SCHEMA}" already contains tables. Re-run with --force to replace the previous import.`);
    }
}

async function createTargetTable(client, targetTableName, columns, { includeTenantId = false } = {}) {
    const definitions = [];

    if (includeTenantId) {
        definitions.push(`${quotePostgresIdentifier('tenant_id')} TEXT NOT NULL`);
    }

    columns.forEach((column) => {
        definitions.push(`${quotePostgresIdentifier(column.name)} ${mapSqliteTypeToPostgres(column.type)}`);
    });

    const createSql = `
        CREATE TABLE IF NOT EXISTS ${quotePostgresIdentifier(TARGET_SCHEMA)}.${quotePostgresIdentifier(targetTableName)} (
            ${definitions.join(',\n            ')}
        )
    `;
    await client.query(createSql);

    if (includeTenantId) {
        await client.query(`
            CREATE INDEX IF NOT EXISTS ${quotePostgresIdentifier(`${targetTableName}__tenant_id_idx`)}
            ON ${quotePostgresIdentifier(TARGET_SCHEMA)}.${quotePostgresIdentifier(targetTableName)} (${quotePostgresIdentifier('tenant_id')})
        `);
    }
}

function getBatchSize(columnCount) {
    const maxParameters = 65535;
    const safeColumnCount = Math.max(1, columnCount);
    return Math.max(1, Math.min(DEFAULT_BATCH_SIZE, Math.floor(maxParameters / safeColumnCount)));
}

async function insertBatch(client, targetTableName, targetColumns, rows, { tenantId = '' } = {}) {
    if (!rows.length) {
        return;
    }

    const insertColumns = tenantId
        ? ['tenant_id', ...targetColumns.map((column) => column.name)]
        : targetColumns.map((column) => column.name);

    let parameterIndex = 1;
    const values = [];
    const placeholders = rows.map((row) => {
        const rowPlaceholders = [];

        if (tenantId) {
            values.push(tenantId);
            rowPlaceholders.push(`$${parameterIndex++}`);
        }

        targetColumns.forEach((column) => {
            const value = Object.prototype.hasOwnProperty.call(row, column.name)
                ? row[column.name]
                : null;
            values.push(normalizePgValue(value));
            rowPlaceholders.push(`$${parameterIndex++}`);
        });

        return `(${rowPlaceholders.join(', ')})`;
    });

    await client.query(`
        INSERT INTO ${quotePostgresIdentifier(TARGET_SCHEMA)}.${quotePostgresIdentifier(targetTableName)}
        (${insertColumns.map((columnName) => quotePostgresIdentifier(columnName)).join(', ')})
        VALUES ${placeholders.join(',\n        ')}
    `, values);
}

async function importStandaloneSource(client, source) {
    const db = openSqliteDb(source.filePath);
    const stats = [];

    try {
        listSqliteTables(db).forEach((tableName) => {
            const columns = listSqliteColumns(db, tableName);
            const targetTableName = buildTargetTableName(source.kind, tableName);
            stats.push({ tableName, targetTableName, columns });
        });

        for (const table of stats) {
            await createTargetTable(client, table.targetTableName, table.columns);
            const iterator = db.prepare(`SELECT * FROM ${quoteSqliteIdentifier(table.tableName)}`).iterate();
            const batchSize = getBatchSize(table.columns.length);
            let importedRows = 0;
            let batch = [];

            for (const row of iterator) {
                batch.push(row);
                if (batch.length >= batchSize) {
                    await insertBatch(client, table.targetTableName, table.columns, batch);
                    importedRows += batch.length;
                    batch = [];
                }
            }

            if (batch.length) {
                await insertBatch(client, table.targetTableName, table.columns, batch);
                importedRows += batch.length;
            }

            table.rowCount = importedRows;
            console.log(`[import] ${source.sourceId}:${table.tableName} -> ${TARGET_SCHEMA}.${table.targetTableName} (${importedRows} row(s))`);
        }
    } finally {
        db.close();
    }

    return stats;
}

async function importTenantSources(client, tenantSources) {
    const tenantTableSpecs = buildTenantTableSpecs(tenantSources);
    const tableEntries = [...tenantTableSpecs.entries()].sort(([left], [right]) => left.localeCompare(right));

    for (const [tableName, columns] of tableEntries) {
        const targetTableName = buildTargetTableName('tenant', tableName);
        await createTargetTable(client, targetTableName, columns, { includeTenantId: true });
    }

    const stats = [];
    for (const source of tenantSources) {
        const db = openSqliteDb(source.filePath);
        try {
            for (const tableName of listSqliteTables(db)) {
                const columns = tenantTableSpecs.get(tableName) || [];
                const targetTableName = buildTargetTableName('tenant', tableName);
                const iterator = db.prepare(`SELECT * FROM ${quoteSqliteIdentifier(tableName)}`).iterate();
                const batchSize = getBatchSize(columns.length + 1);
                let importedRows = 0;
                let batch = [];

                for (const row of iterator) {
                    batch.push(row);
                    if (batch.length >= batchSize) {
                        await insertBatch(client, targetTableName, columns, batch, { tenantId: source.sourceId });
                        importedRows += batch.length;
                        batch = [];
                    }
                }

                if (batch.length) {
                    await insertBatch(client, targetTableName, columns, batch, { tenantId: source.sourceId });
                    importedRows += batch.length;
                }

                stats.push({
                    sourceId: source.sourceId,
                    tableName,
                    targetTableName,
                    rowCount: importedRows
                });
                console.log(`[import] tenant:${source.sourceId}:${tableName} -> ${TARGET_SCHEMA}.${targetTableName} (${importedRows} row(s))`);
            }
        } finally {
            db.close();
        }
    }

    return stats;
}

async function run() {
    const standaloneSources = collectStandaloneSources();
    const tenantSources = collectTenantSources();

    if (!standaloneSources.length && !tenantSources.length) {
        throw new Error(`No SQLite database files found under ${DATA_ROOT}`);
    }

    const pool = new Pool(buildPgConfig());
    const client = await pool.connect();

    try {
        await prepareTargetSchema(client);

        let importedTables = 0;
        let importedRows = 0;

        for (const source of standaloneSources) {
            const sourceStats = await importStandaloneSource(client, source);
            importedTables += sourceStats.length;
            importedRows += sourceStats.reduce((total, table) => total + Number(table.rowCount || 0), 0);
        }

        if (tenantSources.length) {
            const tenantStats = await importTenantSources(client, tenantSources);
            importedTables += new Set(tenantStats.map((entry) => entry.targetTableName)).size;
            importedRows += tenantStats.reduce((total, entry) => total + Number(entry.rowCount || 0), 0);
        }

        console.log(`[import] completed into schema ${TARGET_SCHEMA}`);
        console.log(`[import] source root: ${DATA_ROOT}`);
        console.log(`[import] tenant database(s): ${tenantSources.length}`);
        console.log(`[import] table(s) imported: ${importedTables}`);
        console.log(`[import] total row(s) imported: ${importedRows}`);
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch((error) => {
    console.error('[import] failed:', error);
    process.exitCode = 1;
});
