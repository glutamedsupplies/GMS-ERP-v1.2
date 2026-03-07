#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const store = require('../lib/sqlite');

const SCHEMA_VERSION = '2026.03.04.01';
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_ROOT = process.env.ATTENDANCE_DATA_DIR
    ? path.resolve(process.env.ATTENDANCE_DATA_DIR)
    : ROOT_DIR;
const DATA_DIR = path.join(DATA_ROOT, 'data');
const TENANTS_DIR = path.join(DATA_DIR, 'tenants');
const MASTER_DB_PATH = path.join(DATA_DIR, 'master.db');
const MASTER_SCHEMA_PATH = path.join(__dirname, 'master_schema.sql');
const TENANT_SCHEMA_PATH = path.join(__dirname, 'tenant_schema.sql');

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const skipBackup = args.has('--skip-backup');

function ensureDirectory(targetPath) {
    fs.mkdirSync(targetPath, { recursive: true });
}

function copyIfExists(sourcePath, destinationPath) {
    if (!fs.existsSync(sourcePath)) {
        return false;
    }

    ensureDirectory(path.dirname(destinationPath));
    fs.copyFileSync(sourcePath, destinationPath);
    return true;
}

function collectTenantDbFiles() {
    if (!fs.existsSync(TENANTS_DIR)) {
        return [];
    }

    return fs.readdirSync(TENANTS_DIR)
        .filter((fileName) => /\.db(?:-wal|-shm)?$/i.test(fileName))
        .map((fileName) => path.join(TENANTS_DIR, fileName));
}

function backupDatabases() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupRoot = path.join(DATA_DIR, 'backups', `pre-migration-${timestamp}`);

    const copied = [];
    if (copyIfExists(MASTER_DB_PATH, path.join(backupRoot, 'master.db'))) {
        copied.push('master.db');
    }
    if (copyIfExists(`${MASTER_DB_PATH}-wal`, path.join(backupRoot, 'master.db-wal'))) {
        copied.push('master.db-wal');
    }
    if (copyIfExists(`${MASTER_DB_PATH}-shm`, path.join(backupRoot, 'master.db-shm'))) {
        copied.push('master.db-shm');
    }

    collectTenantDbFiles().forEach((sourcePath) => {
        const relative = path.relative(DATA_DIR, sourcePath);
        if (copyIfExists(sourcePath, path.join(backupRoot, relative))) {
            copied.push(relative.replace(/\\/g, '/'));
        }
    });

    const legacyUsersDb = path.join(DATA_ROOT, 'head_admin', 'data', 'users.db');
    const legacyAttendanceDb = path.join(DATA_ROOT, 'employee', 'data', 'attendance.db');
    if (copyIfExists(legacyUsersDb, path.join(backupRoot, 'legacy', 'users.db'))) {
        copied.push('legacy/users.db');
    }
    if (copyIfExists(legacyAttendanceDb, path.join(backupRoot, 'legacy', 'attendance.db'))) {
        copied.push('legacy/attendance.db');
    }

    return { backupRoot, copied };
}

function getCurrentSchemaVersion(masterDb) {
    const row = masterDb.prepare('SELECT value FROM system_meta WHERE key = ? LIMIT 1').get('schema_version');
    return row ? String(row.value || '') : '';
}

function setSchemaVersion(masterDb, version) {
    masterDb.prepare(`
        INSERT INTO system_meta (key, value)
        VALUES ('schema_version', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(String(version));

    masterDb.prepare(`
        INSERT INTO system_meta (key, value)
        VALUES ('schema_applied_at', CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run();
}

function listTenantIds(masterDb) {
    const ids = new Set(
        masterDb.prepare('SELECT id FROM companies ORDER BY created_at ASC, id ASC')
            .all()
            .map((row) => String(row.id || '').trim())
            .filter(Boolean)
    );

    if (fs.existsSync(TENANTS_DIR)) {
        fs.readdirSync(TENANTS_DIR)
            .filter((fileName) => fileName.endsWith('.db'))
            .forEach((fileName) => {
                const tenantId = fileName.replace(/\.db$/i, '').trim();
                if (tenantId) {
                    ids.add(tenantId);
                }
            });
    }

    return [...ids];
}

function run() {
    if (!skipBackup) {
        const { backupRoot, copied } = backupDatabases();
        if (copied.length) {
            console.log(`[backup] ${copied.length} file(s) copied to ${backupRoot}`);
        } else {
            console.log('[backup] no database files found to back up');
        }
    }

    const masterSchemaSql = fs.readFileSync(MASTER_SCHEMA_PATH, 'utf8');
    const tenantSchemaSql = fs.readFileSync(TENANT_SCHEMA_PATH, 'utf8');

    store.ensureSystemReady();
    const masterDb = store.getMasterDb();
    const previousVersion = getCurrentSchemaVersion(masterDb);

    if (!force && previousVersion === SCHEMA_VERSION) {
        console.log(`[migrate] schema is already at version ${SCHEMA_VERSION}`);
        return;
    }

    masterDb.exec(masterSchemaSql);
    const tenantIds = listTenantIds(masterDb);
    tenantIds.forEach((tenantId) => {
        store.getTenantDb(tenantId).exec(tenantSchemaSql);
    });

    setSchemaVersion(masterDb, SCHEMA_VERSION);

    console.log(`[migrate] master schema applied`);
    console.log(`[migrate] tenant schema applied to ${tenantIds.length} tenant database(s)`);
    console.log(`[migrate] schema_version set to ${SCHEMA_VERSION}`);
}

try {
    run();
} catch (error) {
    console.error('[migrate] failed:', error);
    process.exitCode = 1;
} finally {
    store.closeAll?.();
}
