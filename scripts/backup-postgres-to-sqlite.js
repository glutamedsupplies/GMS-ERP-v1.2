#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Pool } = require('pg');
const SqliteDatabase = require('better-sqlite3');
const {
    buildMissingDatabaseUrlMessage,
    getDatabaseConnectionString,
    sanitizeConnectionString
} = require('../lib/database-config');

const DEFAULT_BATCH_SIZE = Math.max(1, Number(process.env.POSTGRES_SQLITE_BACKUP_BATCH || 1000));

function normalizeText(value) {
    return String(value || '').trim();
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function formatTimestamp(date = new Date()) {
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join('')
        + '-'
        + [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('');
}

function quoteIdentifier(value) {
    return `"${String(value || '').replace(/"/g, '""')}"`;
}

function normalizeSchemaIdentifier(value = '') {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized || 'tenant_default';
}

function buildTenantSchemaName(companyId = '') {
    return `tenant_${normalizeSchemaIdentifier(companyId)}`;
}

function normalizeSslSetting(connectionString) {
    const rawMode = String(process.env.DATABASE_SSL_MODE || 'auto').trim().toLowerCase();
    if (['disable', 'off', 'false', '0'].includes(rawMode)) {
        return false;
    }

    if (['require', 'on', 'true', '1'].includes(rawMode)) {
        return { rejectUnauthorized: false };
    }

    const parsed = new URL(connectionString);
    const hostname = String(parsed.hostname || '').trim().toLowerCase();
    if (
        hostname === 'localhost'
        || hostname === '127.0.0.1'
        || hostname === '::1'
        || hostname.endsWith('.local')
    ) {
        return false;
    }

    return { rejectUnauthorized: false };
}

function parseArgs(argv = []) {
    const args = new Map();
    for (let index = 0; index < argv.length; index += 1) {
        const entry = argv[index];
        if (!entry.startsWith('--')) {
            continue;
        }
        const key = entry.slice(2);
        const next = argv[index + 1];
        if (!next || next.startsWith('--')) {
            args.set(key, true);
            continue;
        }
        args.set(key, next);
        index += 1;
    }
    return args;
}

function resolveBackupRoot(args) {
    const repoRoot = path.resolve(__dirname, '..');
    const explicit = normalizeText(args.get('out-dir'));
    if (explicit) {
        return path.resolve(explicit);
    }

    const dataDir = normalizeText(process.env.ATTENDANCE_DATA_DIR);
    const baseRoot = normalizeText(process.env.POSTGRES_SQLITE_BACKUP_DIR)
        || normalizeText(process.env.ATTENDANCE_BACKUP_DIR)
        || (dataDir ? path.join(path.resolve(dataDir), 'backups') : path.join(repoRoot, 'backups'));

    return path.resolve(baseRoot);
}

function ensureDirectory(targetPath) {
    fs.mkdirSync(targetPath, { recursive: true });
}

function mapPostgresTypeToSqlite(type = '') {
    const normalized = String(type || '').trim().toLowerCase();
    if (!normalized) {
        return 'TEXT';
    }
    if (normalized.includes('int')) {
        return 'INTEGER';
    }
    if (normalized.includes('numeric') || normalized.includes('decimal')) {
        return 'NUMERIC';
    }
    if (normalized.includes('double') || normalized.includes('real') || normalized.includes('float')) {
        return 'REAL';
    }
    if (normalized.includes('bool')) {
        return 'INTEGER';
    }
    if (normalized.includes('bytea')) {
        return 'BLOB';
    }
    return 'TEXT';
}

function normalizeSqliteValue(value, dataType = '') {
    if (value === undefined || value === null) {
        return null;
    }
    if (Buffer.isBuffer(value)) {
        return value;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === 'boolean') {
        return value ? 1 : 0;
    }
    const normalizedType = String(dataType || '').toLowerCase();
    if (normalizedType.includes('json')) {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return JSON.stringify(value);
    }
    return value;
}

async function listTables(client, schema) {
    const result = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
    `, [schema]);
    return result.rows.map((row) => String(row.table_name || '').trim()).filter(Boolean);
}

async function listColumns(client, schema, table) {
    const result = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
        ORDER BY ordinal_position
    `, [schema, table]);
    return result.rows.map((row) => ({
        name: String(row.column_name || '').trim(),
        type: String(row.data_type || '').trim(),
        nullable: String(row.is_nullable || '').trim().toUpperCase() !== 'NO'
    })).filter((column) => column.name);
}

async function listPrimaryKeys(client, schema, table) {
    const result = await client.query(`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = $1
          AND tc.table_name = $2
          AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position
    `, [schema, table]);
    return result.rows.map((row) => String(row.column_name || '').trim()).filter(Boolean);
}

function createSqliteTable(db, tableName, columns, primaryKeys) {
    if (!columns.length) {
        return;
    }
    const columnDefs = columns.map((column) => {
        const colType = mapPostgresTypeToSqlite(column.type);
        const nullable = column.nullable ? '' : ' NOT NULL';
        return `${quoteIdentifier(column.name)} ${colType}${nullable}`;
    });
    if (primaryKeys.length) {
        columnDefs.push(`PRIMARY KEY (${primaryKeys.map((key) => quoteIdentifier(key)).join(', ')})`);
    }
    const createSql = `
        CREATE TABLE IF NOT EXISTS ${quoteIdentifier(tableName)} (
            ${columnDefs.join(',\n            ')}
        )
    `;
    db.exec(createSql);
}

async function exportTable(client, db, schema, tableName, columns, batchSize) {
    const columnNames = columns.map((column) => column.name);
    if (!columnNames.length) {
        return 0;
    }

    const columnTypes = new Map(columns.map((column) => [column.name, column.type]));
    const selectColumns = columnNames
        .map((name) => `${quoteIdentifier(name)} AS ${quoteIdentifier(name)}`)
        .join(', ');
    const selectSql = `SELECT ${selectColumns} FROM ${quoteIdentifier(schema)}.${quoteIdentifier(tableName)}`;

    const insertSql = `
        INSERT INTO ${quoteIdentifier(tableName)} (
            ${columnNames.map((name) => quoteIdentifier(name)).join(', ')}
        ) VALUES (
            ${columnNames.map(() => '?').join(', ')}
        )
    `;
    const insertStmt = db.prepare(insertSql);
    const insertBatch = db.transaction((rows) => {
        rows.forEach((row) => {
            const values = columnNames.map((name) => normalizeSqliteValue(row[name], columnTypes.get(name)));
            insertStmt.run(values);
        });
    });

    let totalRows = 0;
    await client.query('BEGIN');
    try {
        await client.query(`DECLARE export_cursor CURSOR FOR ${selectSql}`);
        while (true) {
            const fetchResult = await client.query(`FETCH ${batchSize} FROM export_cursor`);
            if (!fetchResult.rowCount) {
                break;
            }
            insertBatch(fetchResult.rows);
            totalRows += fetchResult.rowCount;
        }
        await client.query('CLOSE export_cursor');
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }

    return totalRows;
}

async function exportSchema(client, outputPath, schema, label, batchSize) {
    const db = new SqliteDatabase(outputPath);

    try {
        const tables = await listTables(client, schema);
        const stats = [];

        for (const tableName of tables) {
            const columns = await listColumns(client, schema, tableName);
            const primaryKeys = await listPrimaryKeys(client, schema, tableName);
            createSqliteTable(db, tableName, columns, primaryKeys);
            const rowCount = await exportTable(client, db, schema, tableName, columns, batchSize);
            stats.push({ tableName, rowCount });
            console.log(`[backup] ${label}.${tableName}: ${rowCount} row(s)`);
        }

        return stats;
    } finally {
        db.close();
    }
}

async function run() {
    const args = parseArgs(process.argv.slice(2));
    const batchSize = Math.max(1, Number(args.get('batch') || DEFAULT_BATCH_SIZE || 1000));
    const backupRoot = resolveBackupRoot(args);
    const timestamp = formatTimestamp();
    const outputRoot = path.join(backupRoot, `postgres-sqlite-${timestamp}`);
    const tenantsDir = path.join(outputRoot, 'tenants');

    ensureDirectory(outputRoot);
    ensureDirectory(tenantsDir);

    const rawConnectionString = getDatabaseConnectionString();
    if (!rawConnectionString) {
        throw new Error(buildMissingDatabaseUrlMessage('runtime'));
    }
    const connectionString = sanitizeConnectionString(rawConnectionString);

    const pool = new Pool({
        connectionString,
        ssl: normalizeSslSetting(rawConnectionString),
        max: 1
    });

    const client = await pool.connect();
    const meta = {
        startedAt: new Date().toISOString(),
        hostname: os.hostname(),
        outputRoot,
        schemas: [],
        tenants: []
    };

    try {
        console.log(`[backup] output: ${outputRoot}`);
        console.log('[backup] exporting master schema...');
        const masterStats = await exportSchema(client, path.join(outputRoot, 'master.db'), 'public', 'master', batchSize);
        meta.schemas.push({ schema: 'public', kind: 'master', tables: masterStats });

        let companies = [];
        try {
            const companyResult = await client.query(`
                SELECT id, db_schema
                FROM public.companies
                ORDER BY id
            `);
            companies = companyResult.rows.map((row) => ({
                id: normalizeText(row.id),
                db_schema: normalizeText(row.db_schema)
            })).filter((entry) => entry.id);
        } catch (error) {
            console.warn('[backup] skipping tenants: companies table not available.');
        }

        const schemaMap = new Map();
        companies.forEach((company) => {
            const schema = normalizeSchemaIdentifier(company.db_schema || buildTenantSchemaName(company.id));
            if (!schemaMap.has(schema)) {
                schemaMap.set(schema, []);
            }
            schemaMap.get(schema).push(company.id);
        });

        for (const [schema, companyIds] of schemaMap.entries()) {
            const primaryCompanyId = companyIds[0];
            const tenantPath = path.join(tenantsDir, `${primaryCompanyId}.db`);
            console.log(`[backup] exporting tenant schema ${schema} -> ${primaryCompanyId}.db`);
            const tenantStats = await exportSchema(client, tenantPath, schema, primaryCompanyId, batchSize);
            meta.schemas.push({ schema, kind: 'tenant', tables: tenantStats });
            companyIds.forEach((companyId) => {
                meta.tenants.push({ companyId, schema });
                if (companyId !== primaryCompanyId) {
                    const targetPath = path.join(tenantsDir, `${companyId}.db`);
                    fs.copyFileSync(tenantPath, targetPath);
                }
            });
        }

        meta.completedAt = new Date().toISOString();
        fs.writeFileSync(path.join(outputRoot, 'meta.json'), JSON.stringify(meta, null, 2));
        console.log('[backup] completed successfully.');
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch((error) => {
    console.error('[backup] failed:', error);
    process.exitCode = 1;
});
