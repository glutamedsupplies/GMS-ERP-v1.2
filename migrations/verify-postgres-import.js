#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const SqliteDatabase = require('better-sqlite3');

process.env.ATTENDANCE_AUTO_SEED = '0';

const store = require('../lib/sqlite');

const ROOT_DIR = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const DATA_ROOT = resolveSourceRoot();
const DATA_DIR = path.join(DATA_ROOT, 'data');
const TENANTS_DIR = path.join(DATA_DIR, 'tenants');
const MASTER_DB_PATH = path.join(DATA_DIR, 'master.db');

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

function normalizeText(value) {
    return String(value || '').trim();
}

function readArgValue(flagName) {
    const index = args.indexOf(flagName);
    if (index === -1 || index === args.length - 1) {
        return '';
    }
    return String(args[index + 1] || '').trim();
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

function tableExists(db, tableName) {
    try {
        return db.prepare(`PRAGMA table_info(${tableName})`).all().length > 0;
    } catch (_error) {
        return false;
    }
}

function countRows(db, tableName) {
    if (!tableExists(db, tableName)) {
        return 0;
    }

    return Number(db.prepare(`SELECT COUNT(*) AS total FROM "${tableName}"`).get()?.total || 0);
}

function openSourceDb(filePath) {
    return new SqliteDatabase(filePath, {
        readonly: true,
        fileMustExist: true
    });
}

function ensureTargetTenantSchema(companyId) {
    store.getTenantDb(companyId);
}

function verifyMasterTables(sourceMasterDb, targetMasterDb) {
    const mismatches = [];
    MASTER_TABLES.forEach((tableName) => {
        const sourceCount = countRows(sourceMasterDb, tableName);
        const targetCount = countRows(targetMasterDb, tableName);
        if (sourceCount !== targetCount) {
            mismatches.push(`master.${tableName}: source=${sourceCount}, target=${targetCount}`);
        }
    });
    return mismatches;
}

function verifyTenantTables(sourceMasterDb) {
    const mismatches = [];
    const companies = tableExists(sourceMasterDb, 'companies')
        ? sourceMasterDb.prepare('SELECT id FROM companies ORDER BY created_at ASC, id ASC').all()
        : [];

    companies.forEach((company) => {
        const companyId = normalizeText(company.id);
        if (!companyId) {
            return;
        }

        const sourceTenantPath = path.join(TENANTS_DIR, `${companyId}.db`);
        ensureTargetTenantSchema(companyId);
        const targetTenantDb = store.getTenantDb(companyId);
        const sourceTenantDb = fs.existsSync(sourceTenantPath)
            ? openSourceDb(sourceTenantPath)
            : null;

        try {
            TENANT_TABLES.forEach((tableName) => {
                const sourceCount = sourceTenantDb ? countRows(sourceTenantDb, tableName) : 0;
                const targetCount = countRows(targetTenantDb, tableName);
                if (sourceCount !== targetCount) {
                    mismatches.push(`${companyId}.${tableName}: source=${sourceCount}, target=${targetCount}`);
                }
            });
        } finally {
            sourceTenantDb?.close();
        }
    });

    return mismatches;
}

function run() {
    if (!fs.existsSync(MASTER_DB_PATH)) {
        throw new Error(`Source SQLite database not found at ${MASTER_DB_PATH}`);
    }

    const sourceMasterDb = openSourceDb(MASTER_DB_PATH);
    try {
        store.ensureSystemReady();
        const targetMasterDb = store.getMasterDb();
        const mismatches = [
            ...verifyMasterTables(sourceMasterDb, targetMasterDb),
            ...verifyTenantTables(sourceMasterDb)
        ];

        if (mismatches.length) {
            console.error('[verify] mismatches found:');
            mismatches.forEach((mismatch) => console.error(`  - ${mismatch}`));
            process.exitCode = 1;
            return;
        }

        console.log('[verify] source SQLite and target PostgreSQL row counts match.');
    } finally {
        sourceMasterDb.close();
        store.closeAll?.();
    }
}

try {
    run();
} catch (error) {
    console.error('[verify] failed:', error);
    process.exitCode = 1;
}
