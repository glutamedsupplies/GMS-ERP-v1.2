#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const store = require('../lib/sqlite');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_ROOT = process.env.ATTENDANCE_DATA_DIR
    ? path.resolve(process.env.ATTENDANCE_DATA_DIR)
    : ROOT_DIR;
const DATA_DIR = path.join(DATA_ROOT, 'data');

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

function backupLegacySources() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupRoot = path.join(DATA_DIR, 'backups', `pre-legacy-import-${timestamp}`);

    const usersDb = path.join(DATA_ROOT, 'head_admin', 'data', 'users.db');
    const attendanceDb = path.join(DATA_ROOT, 'employee', 'data', 'attendance.db');
    const copied = [];

    if (copyIfExists(usersDb, path.join(backupRoot, 'legacy', 'users.db'))) {
        copied.push('legacy/users.db');
    }
    if (copyIfExists(attendanceDb, path.join(backupRoot, 'legacy', 'attendance.db'))) {
        copied.push('legacy/attendance.db');
    }

    return { backupRoot, copied };
}

function getSystemMeta(masterDb, key) {
    const row = masterDb.prepare('SELECT value FROM system_meta WHERE key = ? LIMIT 1').get(String(key));
    return row ? String(row.value || '') : '';
}

function run() {
    const { backupRoot, copied } = backupLegacySources();
    if (copied.length) {
        console.log(`[backup] ${copied.length} legacy file(s) copied to ${backupRoot}`);
    } else {
        console.log('[backup] no legacy databases found');
    }

    // This runs the built-in one-time migration path:
    // head_admin/data/users.db + employee/data/attendance.db -> master/tenant DBs.
    store.ensureSystemReady();

    const masterDb = store.getMasterDb();
    const migrationFlag = getSystemMeta(masterDb, 'legacy_migration_v1');
    const migratedCompanyId = getSystemMeta(masterDb, 'legacy_migration_company_id');

    console.log(`[legacy-import] legacy_migration_v1=${migrationFlag || 'unset'}`);
    if (migratedCompanyId) {
        console.log(`[legacy-import] migrated company id: ${migratedCompanyId}`);
    }
}

try {
    run();
} catch (error) {
    console.error('[legacy-import] failed:', error);
    process.exitCode = 1;
} finally {
    store.closeAll?.();
}
