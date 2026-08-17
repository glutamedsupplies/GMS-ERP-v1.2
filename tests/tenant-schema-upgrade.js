#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const BetterSqlite3 = require('better-sqlite3');

const TEMP_DATA_ROOT = path.join(os.tmpdir(), `tenant-schema-upgrade-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
process.env.ATTENDANCE_DATA_DIR = TEMP_DATA_ROOT;
process.env.ATTENDANCE_AUTO_SEED = '0';

const tenantId = 'legacy_company';
const tenantDbPath = path.join(TEMP_DATA_ROOT, 'data', 'tenants', `${tenantId}.db`);
fs.mkdirSync(path.dirname(tenantDbPath), { recursive: true });

const legacyDb = new BetterSqlite3(tenantDbPath);
legacyDb.exec(`
    CREATE TABLE attendance (
        id TEXT,
        branch_id TEXT,
        name TEXT,
        date TEXT,
        time_in TEXT,
        time_out TEXT,
        worked_hours TEXT,
        remarks TEXT
    );

    CREATE TABLE attendance_corrections (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        attendance_id INTEGER,
        correction_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE customer_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_code TEXT NOT NULL UNIQUE,
        normalized_contact_number TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open'
    );
`);
legacyDb.close();

const store = require('../lib/sqlite');

function columnNames(db, tableName) {
    return db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
}

function indexNames(db, tableName) {
    return db.prepare(`PRAGMA index_list(${tableName})`).all().map((index) => index.name);
}

function run() {
    const db = store.getTenantDb(tenantId);

    assert(columnNames(db, 'attendance').includes('updated_at'), 'attendance.updated_at should be added to legacy tenant DBs');
    assert(columnNames(db, 'attendance_corrections').includes('updated_at'), 'attendance_corrections.updated_at should be added to legacy tenant DBs');
    assert(columnNames(db, 'customer_requests').includes('updated_at'), 'customer_requests.updated_at should be added to legacy tenant DBs');
    assert(indexNames(db, 'attendance').includes('idx_attendance_updated_at'), 'attendance updated_at index should be created after upgrade');
    assert(indexNames(db, 'attendance_corrections').includes('idx_attendance_corrections_updated'), 'attendance_corrections updated_at index should be created after upgrade');
    assert(indexNames(db, 'customer_requests').includes('idx_customer_requests_status_updated'), 'customer_requests updated_at index should be created after upgrade');

    store.closeAll();
    console.log('tenant-schema-upgrade ok');
}

run();
