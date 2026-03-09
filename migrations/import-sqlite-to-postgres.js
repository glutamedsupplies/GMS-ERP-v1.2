#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const SqliteDatabase = require('better-sqlite3');

process.env.ATTENDANCE_AUTO_SEED = '0';

const store = require('../lib/sqlite');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_ROOT = process.env.ATTENDANCE_DATA_DIR
    ? path.resolve(process.env.ATTENDANCE_DATA_DIR)
    : ROOT_DIR;
const DATA_DIR = path.join(DATA_ROOT, 'data');
const TENANTS_DIR = path.join(DATA_DIR, 'tenants');
const MASTER_DB_PATH = path.join(DATA_DIR, 'master.db');
const args = new Set(process.argv.slice(2));
const force = args.has('--force');

const MASTER_TABLES = [
    'system_meta',
    'plans',
    'companies',
    'subscriptions',
    'addons',
    'usage_monthly',
    'audit_logs',
    'company_admin_credentials',
    'users'
];
const TENANT_TABLES = [
    'tenant_meta',
    'branches',
    'attendance',
    'clients',
    'customer_requests',
    'customer_request_messages',
    'inventory_variants',
    'product_catalog',
    'composite_components',
    'inventory_items',
    'inventory_levels',
    'sales_entries',
    'expense_entries',
    'cash_income_entries',
    'invoice_templates',
    'lbc_tracking_entries'
];
const INSERT_CHUNK_SIZE = 100;

function normalizeText(value) {
    return String(value || '').trim();
}

function buildTenantSchemaName(companyId = '') {
    return `tenant_${String(companyId || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')}`;
}

function quoteIdentifier(value) {
    return `"${String(value || '').replace(/"/g, '""')}"`;
}

function openSqliteDatabase(filePath) {
    return new SqliteDatabase(filePath, {
        readonly: true,
        fileMustExist: true
    });
}

function getTableColumns(db, tableName) {
    try {
        return db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => String(column.name || ''));
    } catch (_error) {
        return [];
    }
}

function tableExists(db, tableName) {
    return getTableColumns(db, tableName).length > 0;
}

function readRows(db, tableName, selectedColumns) {
    if (!selectedColumns.length) {
        return [];
    }

    return db.prepare(`
        SELECT ${selectedColumns.map(quoteIdentifier).join(', ')}
        FROM ${quoteIdentifier(tableName)}
    `).all();
}

function syncIdentity(targetDb, tableName, columnName) {
    const sequenceRow = targetDb.prepare(`
        SELECT pg_get_serial_sequence('${tableName}', '${columnName}') AS sequence_name
    `).get();
    const sequenceName = normalizeText(sequenceRow?.sequence_name);
    if (!sequenceName) {
        return;
    }

    targetDb.prepare(`
        SELECT setval(
            '${sequenceName}',
            COALESCE((SELECT MAX(${quoteIdentifier(columnName)}) FROM ${quoteIdentifier(tableName)}), 1),
            COALESCE((SELECT MAX(${quoteIdentifier(columnName)}) FROM ${quoteIdentifier(tableName)}), 0) > 0
        )
    `).get();
}

function buildInsertStatement(tableName, columns, rowCount) {
    const valuesPerRow = `(${columns.map(() => '?').join(', ')})`;
    const valuesClause = Array.from({ length: rowCount }, () => valuesPerRow).join(', ');
    return `
        INSERT INTO ${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(', ')})
        VALUES ${valuesClause}
    `;
}

function chunkRows(rows, size) {
    const chunks = [];
    for (let index = 0; index < rows.length; index += size) {
        chunks.push(rows.slice(index, index + size));
    }
    return chunks;
}

function copyTable(sourceDb, targetDb, tableName, overrides = {}) {
    if (!tableExists(sourceDb, tableName) || !tableExists(targetDb, tableName)) {
        return 0;
    }

    const sourceColumns = getTableColumns(sourceDb, tableName);
    const targetColumns = getTableColumns(targetDb, tableName);
    const sharedColumns = targetColumns.filter((column) => sourceColumns.includes(column) && !(column in overrides));
    const targetInsertColumns = [...sharedColumns, ...Object.keys(overrides)];
    if (!targetInsertColumns.length) {
        return 0;
    }

    const rows = readRows(sourceDb, tableName, sharedColumns);
    if (!rows.length) {
        return 0;
    }

    const preparedRows = rows.map((row) => {
        const values = sharedColumns.map((column) => row[column]);
        Object.keys(overrides).forEach((column) => {
            const overrideValue = typeof overrides[column] === 'function'
                ? overrides[column](row)
                : overrides[column];
            values.push(overrideValue);
        });
        return values;
    });

    targetDb.transaction((entries) => {
        chunkRows(entries, INSERT_CHUNK_SIZE).forEach((chunk, chunkIndex, allChunks) => {
            const insert = targetDb.prepare(buildInsertStatement(tableName, targetInsertColumns, chunk.length));
            insert.run(...chunk.flat());
            if (allChunks.length > 1) {
                console.log(`[import] ${tableName}: chunk ${chunkIndex + 1}/${allChunks.length}`);
            }
        });
    })(preparedRows);

    if (targetColumns.includes('id') && sharedColumns.includes('id')) {
        syncIdentity(targetDb, tableName, 'id');
    }
    if (targetColumns.includes('row_id') && sharedColumns.includes('row_id')) {
        syncIdentity(targetDb, tableName, 'row_id');
    }

    return rows.length;
}

function ensureTargetTenantSchema(companyId) {
    console.log(`[import] ensuring tenant schema for ${companyId}`);
    store.getTenantDb(companyId);
}

function clearTargetDatabase(masterDb) {
    const existingCompanies = tableExists(masterDb, 'companies')
        ? masterDb.prepare('SELECT id, db_schema FROM companies').all()
        : [];

    existingCompanies.forEach((row) => {
        const companyId = normalizeText(row.id);
        if (!companyId) {
            return;
        }
        const schemaName = normalizeText(row.db_schema) || buildTenantSchemaName(companyId);
        store.closeTenantDb?.(companyId);
        masterDb.exec(`DROP SCHEMA IF EXISTS "${schemaName.replace(/"/g, '""')}" CASCADE`);
    });

    masterDb.prepare(`
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\'
    `).all().forEach((row) => {
        const schemaName = normalizeText(row?.schema_name);
        if (!schemaName) {
            return;
        }
        masterDb.exec(`DROP SCHEMA IF EXISTS "${schemaName.replace(/"/g, '""')}" CASCADE`);
    });

    [
        'lbc_tracking_entries',
        'invoice_templates',
        'cash_income_entries',
        'expense_entries',
        'sales_entries',
        'inventory_levels',
        'inventory_items',
        'composite_components',
        'product_catalog',
        'inventory_variants',
        'customer_request_messages',
        'customer_requests',
        'clients',
        'attendance',
        'branches',
        'tenant_meta',
        'company_admin_credentials',
        'subscriptions',
        'addons',
        'usage_monthly',
        'audit_logs',
        'users',
        'companies',
        'plans',
        'system_meta'
    ].forEach((tableName) => {
        if (tableExists(masterDb, tableName)) {
            masterDb.prepare(`DELETE FROM ${quoteIdentifier(tableName)}`).run();
        }
    });
}

function importMasterTables(sourceMasterDb, targetMasterDb) {
    const importedCounts = {};
    MASTER_TABLES.forEach((tableName) => {
        console.log(`[import] copying master table ${tableName}`);
        const overrides = tableName === 'companies'
            ? {
                db_schema: (row) => normalizeText(row.db_schema) || buildTenantSchemaName(row.id)
            }
            : {};
        importedCounts[tableName] = copyTable(sourceMasterDb, targetMasterDb, tableName, overrides);
    });
    return importedCounts;
}

function importTenantDatabases(sourceMasterDb) {
    if (!tableExists(sourceMasterDb, 'companies')) {
        return {};
    }

    const importedCounts = {};
    const companies = sourceMasterDb.prepare(`
        SELECT id
        FROM companies
        ORDER BY created_at ASC, id ASC
    `).all();

    companies.forEach((company) => {
        const companyId = normalizeText(company.id);
        if (!companyId) {
            return;
        }

        console.log(`[import] copying tenant ${companyId}`);
        const sourceTenantPath = path.join(TENANTS_DIR, `${companyId}.db`);
        if (!fs.existsSync(sourceTenantPath)) {
            importedCounts[companyId] = {};
            ensureTargetTenantSchema(companyId);
            console.log(`[import] tenant ${companyId} has no local sqlite file; schema ensured only`);
            return;
        }

        ensureTargetTenantSchema(companyId);
        const sourceTenantDb = openSqliteDatabase(sourceTenantPath);
        const targetTenantDb = store.getTenantDb(companyId);
        const tenantCounts = {};
        try {
            TENANT_TABLES.forEach((tableName) => {
                console.log(`[import] ${companyId}.${tableName}`);
                tenantCounts[tableName] = copyTable(sourceTenantDb, targetTenantDb, tableName);
            });
            console.log(`[import] tenant ${companyId} complete`);
        } finally {
            sourceTenantDb.close();
        }
        importedCounts[companyId] = tenantCounts;
    });

    return importedCounts;
}

function assertSourceDataExists() {
    if (!fs.existsSync(MASTER_DB_PATH)) {
        throw new Error(`Source SQLite database not found at ${MASTER_DB_PATH}`);
    }
}

function run() {
    assertSourceDataExists();

    const sourceMasterDb = openSqliteDatabase(MASTER_DB_PATH);
    try {
        store.ensureSystemReady();
        const targetMasterDb = store.getMasterDb();
        const targetCompanyCount = Number(targetMasterDb.prepare(`
            SELECT COUNT(*) AS total
            FROM companies
        `).get()?.total || 0);

        if (targetCompanyCount > 0 && !force) {
            throw new Error('Target PostgreSQL database already contains companies. Re-run with --force to clear it before import.');
        }

        clearTargetDatabase(targetMasterDb);
        const masterCounts = importMasterTables(sourceMasterDb, targetMasterDb);
        const tenantCounts = importTenantDatabases(sourceMasterDb);

        console.log('[import] master tables copied:');
        Object.entries(masterCounts).forEach(([tableName, count]) => {
            console.log(`  - ${tableName}: ${count}`);
        });

        console.log('[import] tenant tables copied:');
        Object.entries(tenantCounts).forEach(([companyId, counts]) => {
            const totalRows = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
            console.log(`  - ${companyId}: ${totalRows}`);
        });
    } finally {
        sourceMasterDb.close();
        store.closeAll?.();
    }
}

try {
    run();
} catch (error) {
    console.error('[import] failed:', error);
    process.exitCode = 1;
}
