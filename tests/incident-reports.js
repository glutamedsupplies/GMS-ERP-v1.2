#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMP_DATA_ROOT = path.join(
    os.tmpdir(),
    `incident-reports-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
);
process.env.ATTENDANCE_DATA_DIR = TEMP_DATA_ROOT;
process.env.ATTENDANCE_AUTO_SEED = '0';

const store = require('../lib/sqlite');

function run() {
    try {
        store.ensureSystemReady();
        const plan = store.createPlan({
            id: 'incident_report_test',
            name: 'Incident Report Test',
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
            name: 'Incident Report Company',
            companyCode: 'incident-report-company',
            subdomain: 'incident-report-company',
            planId: plan.id,
            adminUsername: 'incident_admin',
            adminName: 'Incident Admin',
            adminPassword: 'Password123!'
        }).company;

        store.runWithTenantContextByCompany(company.id, () => {
            const branch = store.listBranches()[0];
            const firstEmployee = store.addUser({
                id: 'incident_alpha',
                name: 'Incident Alpha',
                password: 'Password123!',
                role: 'employee',
                branchId: branch.id
            });
            const secondEmployee = store.addUser({
                id: 'incident_bravo',
                name: 'Incident Bravo',
                password: 'Password123!',
                role: 'employee',
                branchId: branch.id
            });

            const db = store.getTenantDb();
            const table = db.prepare(`
                SELECT name
                FROM sqlite_master
                WHERE type = 'table'
                  AND name = 'incident_reports'
            `).get();
            assert(table, 'incident_reports table should be created for every tenant');

            const created = store.createIncidentReport({
                date: '2026-07-28',
                department: 'Warehouse',
                reasonIncident: 'Damaged outer carton found during receiving.',
                actionTaken: 'Separated the damaged carton and replaced the packaging.',
                preparedBy: firstEmployee.name,
                resolved: false
            }, {
                actorUserId: firstEmployee.id,
                ownerEmployeeId: firstEmployee.id
            });
            assert(created.id, 'created incident should have an ID');
            assert.strictEqual(created.ownerEmployeeId, firstEmployee.id);
            assert.strictEqual(created.resolved, false);
            assert(created.actionTaken.includes('replaced the packaging'));

            assert.strictEqual(store.listIncidentReports().length, 1);
            assert.strictEqual(
                store.listIncidentReports({ ownerEmployeeId: firstEmployee.id }).length,
                1
            );
            assert.strictEqual(
                store.listIncidentReports({ ownerEmployeeId: secondEmployee.id }).length,
                0
            );
            assert.deepStrictEqual(
                store.getIncidentReportSummary({ ownerEmployeeId: firstEmployee.id }),
                { total: 1, unresolved: 1, resolved: 0 }
            );

            const adminResolved = store.updateIncidentReport(created.id, {
                resolved: true,
                checkedBy: 'Incident Admin',
                dateChecked: '2026-07-28'
            }, { actorUserId: 'incident_admin' });
            assert.strictEqual(adminResolved.resolved, true);
            assert.strictEqual(adminResolved.checkedBy, 'Incident Admin');
            assert(adminResolved.resolvedAt);

            const reopened = store.updateIncidentReport(created.id, {
                ownerEmployeeId: secondEmployee.id,
                resolved: false,
                checkedBy: '',
                dateChecked: ''
            }, { actorUserId: 'incident_admin' });
            assert.strictEqual(reopened.ownerEmployeeId, firstEmployee.id);
            assert.strictEqual(reopened.resolved, false);
            assert.strictEqual(reopened.resolvedAt, '');
            assert.strictEqual(
                store.listIncidentReports({ ownerEmployeeId: firstEmployee.id }).length,
                1
            );
            assert.strictEqual(
                store.listIncidentReports({ ownerEmployeeId: secondEmployee.id }).length,
                0
            );
            assert.strictEqual(
                store.listIncidentReports({ status: 'unresolved', search: 'warehouse' }).length,
                1
            );

            const secondCreated = store.createIncidentReport({
                date: '2026-07-28',
                department: 'Sales',
                reasonIncident: 'Point of sale terminal briefly lost its connection.',
                preparedBy: secondEmployee.name,
                resolved: false
            }, {
                actorUserId: secondEmployee.id,
                ownerEmployeeId: secondEmployee.id
            });
            assert.strictEqual(secondCreated.ownerEmployeeId, secondEmployee.id);
            assert.deepStrictEqual(
                store.getIncidentReportSummary({ ownerEmployeeId: secondEmployee.id }),
                { total: 1, unresolved: 1, resolved: 0 }
            );
        });

        console.log('incident-reports ok');
    } finally {
        store.closeAll();
        fs.rmSync(TEMP_DATA_ROOT, { recursive: true, force: true });
    }
}

run();
