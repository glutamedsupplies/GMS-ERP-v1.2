#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_PORT = Number(process.env.INCIDENT_UI_TEST_PORT || 18128);
const STOP_FILE = String(process.env.INCIDENT_UI_TEST_STOP_FILE || '').trim();
const TEMP_DATA_ROOT = process.env.INCIDENT_UI_TEST_DATA_DIR || path.join(
    os.tmpdir(),
    `incident-report-ui-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
);

process.env.ATTENDANCE_DATA_DIR = TEMP_DATA_ROOT;
process.env.ATTENDANCE_AUTO_SEED = '0';
process.env.ATTENDANCE_BIND_HOST = '127.0.0.1';
process.env.ATTENDANCE_PORT = String(TEST_PORT);
process.env.ATTENDANCE_SECURE_COOKIES = '0';
process.env.ATTENDANCE_PUBLIC_URL = `http://127.0.0.1:${TEST_PORT}`;
process.env.ATTENDANCE_LBC_AUTO_REFRESH_MINUTES = '0';

const store = require('../lib/sqlite');
const { startServer } = require('../lib/http-server');

let server = null;
let stopFileTimer = null;

function seedTestData() {
    store.ensureSystemReady();
    const plan = store.createPlan({
        id: 'incident_ui_test',
        name: 'Incident UI Test',
        price_monthly: 0,
        max_branches: 2,
        max_users: 10,
        max_invoices_monthly: 0,
        ai_monthly_quota: 0,
        modules: {
            attendance: true,
            sales: false,
            inventory: false,
            invoicing: false,
            reports: true,
            ai_reader: false
        }
    });
    const company = store.createCompany({
        name: 'Incident UI Company',
        companyCode: 'incident-ui-company',
        subdomain: 'incident-ui-company',
        planId: plan.id,
        adminUsername: 'incident_ui_admin',
        adminName: 'Incident UI Admin',
        adminPassword: 'Password123!'
    }).company;

    store.runWithTenantContextByCompany(company.id, () => {
        const branch = store.listBranches()[0];
        store.addUser({
            id: 'incident_ui_employee',
            name: 'Incident UI Employee',
            password: 'Password123!',
            role: 'employee',
            branchId: branch.id
        });
        store.addUser({
            id: 'incident_ui_employee_two',
            name: 'Second Active Employee',
            password: 'Password123!',
            role: 'employee',
            branchId: branch.id
        });
    });
}

function shutdown(exitCode = 0) {
    if (stopFileTimer) {
        clearInterval(stopFileTimer);
        stopFileTimer = null;
    }
    const finish = () => {
        store.closeAll();
        fs.rmSync(TEMP_DATA_ROOT, { recursive: true, force: true });
        process.exit(exitCode);
    };
    if (server) {
        server.close(finish);
        return;
    }
    finish();
}

seedTestData();
startServer()
    .then((info) => {
        server = info.server;
        if (STOP_FILE) {
            stopFileTimer = setInterval(() => {
                if (fs.existsSync(STOP_FILE)) {
                    shutdown(0);
                }
            }, 150);
        }
        console.log(`incident-report-ui-server ready ${info.localUrl}`);
    })
    .catch((error) => {
        console.error(error);
        shutdown(1);
    });

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
