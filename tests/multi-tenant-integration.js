#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMP_DATA_ROOT = path.join(os.tmpdir(), `attendance-mt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
process.env.ATTENDANCE_DATA_DIR = TEMP_DATA_ROOT;

const inventoryVariantStore = require('../lib/inventory-variants-store');
const salesStore = require('../lib/sales-store');
const store = require('../lib/sqlite');

function expectThrows(fn, messagePattern, label) {
    let thrownError = null;
    try {
        fn();
    } catch (error) {
        thrownError = error;
    }

    assert(thrownError, `${label} should throw`);
    if (messagePattern) {
        assert(
            messagePattern.test(String(thrownError.message || thrownError)),
            `${label} expected message to match ${messagePattern}, received "${thrownError.message || thrownError}"`
        );
    }
}

function run() {
    store.ensureSystemReady();

    const limitsPlan = store.createPlan({
        id: 'qa_limits',
        name: 'QA Limits',
        price_monthly: 0,
        max_branches: 1,
        max_users: 2,
        max_invoices_monthly: 1,
        ai_monthly_quota: 0,
        modules: {
            attendance: true,
            sales: true,
            inventory: true,
            invoicing: true,
            reports: true,
            ai_reader: false
        }
    });

    const restrictedPlan = store.createPlan({
        id: 'qa_restricted',
        name: 'QA Restricted',
        price_monthly: 0,
        max_branches: 2,
        max_users: 5,
        max_invoices_monthly: 0,
        ai_monthly_quota: 0,
        modules: {
            attendance: true,
            sales: false,
            inventory: false,
            invoicing: false,
            reports: false,
            ai_reader: false
        }
    });

    const companyA = store.createCompany({
        name: 'Company A',
        companyCode: 'company-a',
        subdomain: 'company-a',
        customDomain: 'erp.company-a.example',
        planId: limitsPlan.id,
        appName: 'Company A ERP',
        adminUsername: 'admin_a',
        adminName: 'Admin A',
        adminPassword: 'Password123!'
    });

    const companyB = store.createCompany({
        name: 'Company B',
        companyCode: 'company-b',
        subdomain: 'company-b',
        planId: restrictedPlan.id,
        appName: 'Company B ERP',
        adminUsername: 'admin_b',
        adminName: 'Admin B',
        adminPassword: 'Password123!'
    });

    const companyC = store.createCompany({
        name: 'Company C',
        companyCode: 'company-c',
        subdomain: 'company-c',
        planId: restrictedPlan.id,
        appName: 'Company C ERP',
        adminUsername: 'admin_c',
        adminName: 'Admin C',
        adminPassword: 'Password123!'
    });

    assert.strictEqual(companyB.company.custom_domain, null, 'blank custom domain should be stored as NULL');
    assert.strictEqual(companyC.company.custom_domain, null, 'blank custom domain should allow multiple companies');

    const companyAId = companyA.company.id;
    const companyBId = companyB.company.id;
    const companyCId = companyC.company.id;

    const renamedLimitsPlanId = 'qa-limits-v2';
    const updatedLimitsPlan = store.updatePlan(limitsPlan.id, {
        id: renamedLimitsPlanId,
        name: 'QA Limits V2'
    });
    assert.strictEqual(updatedLimitsPlan.id, renamedLimitsPlanId, 'updated plan id should use renamed value');
    assert.strictEqual(updatedLimitsPlan.name, 'QA Limits V2', 'updated plan should persist new name');

    const companyAAfterPlanRename = store.getCompanyById(companyAId);
    assert.strictEqual(companyAAfterPlanRename.plan_id, renamedLimitsPlanId, 'company plan_id should follow renamed plan id');

    const activeSubAfterPlanRename = store.getActiveSubscription(companyAId);
    assert(activeSubAfterPlanRename, 'company should have an active subscription row');
    assert.strictEqual(activeSubAfterPlanRename.plan_id, renamedLimitsPlanId, 'active subscription should follow renamed plan id');

    expectThrows(
        () => store.createPlan({
            id: restrictedPlan.id,
            name: 'Duplicate Restricted ID'
        }),
        /plan id is already in use|unique constraint/i,
        'duplicate plan id on create'
    );

    expectThrows(
        () => store.updatePlan(restrictedPlan.id, {
            id: renamedLimitsPlanId,
            name: 'Should Fail Duplicate ID'
        }),
        /plan id is already in use|unique constraint/i,
        'duplicate plan id on update'
    );

    expectThrows(
        () => store.deletePlan(renamedLimitsPlanId),
        /in use/i,
        'delete in-use plan'
    );

    const disposablePlan = store.createPlan({
        id: 'qa_disposable',
        name: 'QA Disposable',
        price_monthly: 0,
        max_branches: 1,
        max_users: 1,
        max_invoices_monthly: 0,
        ai_monthly_quota: 0,
        modules: {
            attendance: true,
            sales: false,
            inventory: false,
            invoicing: false,
            reports: false,
            ai_reader: false
        }
    });
    const deletedDisposable = store.deletePlan(disposablePlan.id);
    assert.strictEqual(deletedDisposable.deleted, true, 'unused plan should be deleted');
    assert.strictEqual(store.getPlanById(disposablePlan.id), undefined, 'deleted plan should not be found');

    expectThrows(
        () => store.createCompany({
            name: 'Company D',
            companyCode: 'company-d',
            subdomain: 'company-d',
            customDomain: 'ERP.COMPANY-A.EXAMPLE',
            planId: restrictedPlan.id,
            appName: 'Company D ERP',
            adminUsername: 'admin_d',
            adminName: 'Admin D',
            adminPassword: 'Password123!'
        }),
        /custom domain is already in use/i,
        'duplicate custom domain on create'
    );

    expectThrows(
        () => store.updateCompanyById(companyBId, {
            custom_domain: 'erp.company-a.example'
        }),
        /custom domain is already in use/i,
        'duplicate custom domain on update'
    );

    // Isolation seed data in Company A.
    store.runWithTenantContextByCompany(companyAId, () => {
        store.addClient({
            name: 'Alice Customer',
            contactNumber: '09171234567'
        });
    });

    store.runWithTenantContextByCompany(companyBId, () => {
        const clients = store.listClients();
        assert.strictEqual(clients.length, 0, 'Company B should not see Company A clients');
    });

    // Inventory schema and seed state must stay isolated per tenant DB.
    store.runWithTenantContextByCompany(companyAId, () => {
        inventoryVariantStore.createInventoryVariant({
            productName: 'Tenant A Inventory Box',
            itemCode: 'TA-001',
            setName: 'M',
            price: 100
        });

        const rows = salesStore.listInventory({ branch: 'Main Branch' });
        assert(
            rows.some((row) => row.item_name === 'Tenant A Inventory Box' && row.inventory_unit === 'Box'),
            'Company A inventory should include its own seeded variant'
        );
    });

    store.runWithTenantContextByCompany(companyCId, () => {
        inventoryVariantStore.createInventoryVariant({
            productName: 'Tenant C Inventory Box',
            itemCode: 'TC-001',
            setName: 'M',
            price: 120
        });

        const rows = salesStore.listInventory({ branch: 'Main Branch' });
        assert(
            rows.some((row) => row.item_name === 'Tenant C Inventory Box' && row.inventory_unit === 'Box'),
            'Company C inventory should include its own seeded variant'
        );
        assert(
            !rows.some((row) => row.item_name === 'Tenant A Inventory Box'),
            'Company C inventory should not include Company A variants'
        );
    });

    store.runWithTenantContextByCompany(companyAId, () => {
        const rows = salesStore.listInventory({ branch: 'Main Branch' });
        assert(
            !rows.some((row) => row.item_name === 'Tenant C Inventory Box'),
            'Company A inventory should not include Company C variants'
        );
    });

    // Branch/user/invoice limits in Company A.
    store.runWithTenantContextByCompany(companyAId, () => {
        expectThrows(
            () => store.addBranch({ branchName: 'A-Branch-2', address: 'N/A' }),
            /Branch limit reached/i,
            'branch limit'
        );

        store.addUser({
            id: 'a_user_1',
            username: 'a_user_1',
            name: 'A User 1',
            password: 'Password123!',
            role: 'employee'
        });

        expectThrows(
            () => store.addUser({
                id: 'a_user_2',
                username: 'a_user_2',
                name: 'A User 2',
                password: 'Password123!',
                role: 'employee'
            }),
            /User limit reached/i,
            'user limit'
        );

        store.assertInvoiceLimit();
        store.recordInvoiceCreated();
        expectThrows(
            () => store.assertInvoiceLimit(),
            /invoice limit reached/i,
            'invoice limit'
        );
    });

    // Branch delete guards in Company B.
    store.runWithTenantContextByCompany(companyBId, () => {
        const extraBranch = store.addBranch({
            branchName: 'B-Branch-2',
            address: 'N/A'
        });

        store.addUser({
            id: 'b_branch_user',
            username: 'b_branch_user',
            name: 'B Branch User',
            password: 'Password123!',
            role: 'employee',
            branchId: extraBranch.id
        });

        expectThrows(
            () => store.deleteBranch(extraBranch.id),
            /reassign users before deleting/i,
            'delete branch with assigned users'
        );

        store.deleteUser('b_branch_user');

        const deletedBranch = store.deleteBranch(extraBranch.id);
        assert.strictEqual(deletedBranch.deleted, true, 'branch should be deleted when no users are assigned');

        const remainingBranches = store.listBranches();
        assert.strictEqual(remainingBranches.length, 1, 'company should keep one branch after deleting an extra branch');

        expectThrows(
            () => store.deleteBranch(remainingBranches[0].id),
            /at least one branch must remain/i,
            'delete last branch'
        );
    });

    // AI quota checks (addon enabled for Company A with quota 1).
    store.upsertCompanyAddon(companyAId, 'ai_reader', {
        is_active: true,
        quota: { monthlyQuota: 1 }
    });

    store.runWithTenantContextByCompany(companyAId, () => {
        store.assertAiAccess();
        store.recordAiRead();
        expectThrows(
            () => store.assertAiAccess(),
            /quota reached/i,
            'ai quota limit'
        );
    });

    // Restricted modules in Company B.
    store.runWithTenantContextByCompany(companyBId, () => {
        expectThrows(
            () => store.assertModuleAccess('sales'),
            /not included in the/i,
            'module sales gate'
        );
        expectThrows(
            () => store.assertModuleAccess('inventory'),
            /not included in the/i,
            'module inventory gate'
        );
    });

    // Suspended attendance accounts should stay visible in attendance views and reject attendance actions.
    store.runWithTenantContextByCompany(companyBId, () => {
        store.addUser({
            id: 'b_suspended_user',
            username: 'b_suspended_user',
            name: 'B Suspended User',
            password: 'Password123!',
            role: 'employee'
        });

        const todayKey = store.getDateKey();
        const previousDate = new Date(`${todayKey}T00:00:00`);
        previousDate.setDate(previousDate.getDate() - 1);
        const previousDateKey = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, '0')}-${String(previousDate.getDate()).padStart(2, '0')}`;

        store.setDailyAttendanceStatus('b_suspended_user', 'Absent', previousDateKey);
        store.updateUser('b_suspended_user', {
            is_active: false
        });

        const weeklyRows = store.getUserWeeklyTimeCard('b_suspended_user', todayKey);
        const previousRow = weeklyRows.find((row) => row.dateKey === previousDateKey);
        const todayRow = weeklyRows.find((row) => row.dateKey === todayKey);
        assert(previousRow, 'weekly time card should include the day before suspension');
        assert(todayRow, 'weekly time card should include the suspension day');
        assert.strictEqual(previousRow.status, 'Absent', 'dates before suspension should keep their prior absent status');
        assert.strictEqual(todayRow.status, 'Suspended', 'suspension day should show Suspended');
        assert(
            weeklyRows.some((row) => row.status === 'Suspended'),
            'weekly time card should surface Suspended for inactive users without attendance rows'
        );

        const snapshotRow = store.getDailyAttendanceSnapshot(todayKey)
            .find((row) => row.id === 'b_suspended_user');
        assert(snapshotRow, 'daily attendance snapshot should include suspended accounts');
        assert.strictEqual(snapshotRow.status, 'Suspended', 'suspended account should show Suspended status');
        assert.strictEqual(snapshotRow.displayRemarks, 'Account suspended', 'suspended account should explain the inactive state');
        assert.strictEqual(snapshotRow.canEditStatus, false, 'suspended account should not allow daily status editing');

        expectThrows(
            () => store.recordTimeIn('b_suspended_user'),
            /suspended/i,
            'time in suspended account'
        );

        expectThrows(
            () => store.setDailyAttendanceStatus('b_suspended_user', 'Absent'),
            /suspended/i,
            'manual attendance edit suspended account'
        );
    });

    // Custom domain must be ignored if add-on inactive.
    const unresolved = store.getCompanyByCodeOrHost('', 'erp.company-a.example');
    assert(
        !unresolved || unresolved.id !== companyAId,
        'custom domain should not resolve while custom_domain add-on is inactive'
    );

    store.upsertCompanyAddon(companyAId, 'custom_domain', { is_active: true });
    const resolved = store.getCompanyByCodeOrHost('', 'erp.company-a.example');
    assert(resolved && resolved.id === companyAId, 'custom domain should resolve when add-on is active');

    // White-label branding applies only when add-on is active.
    const defaultBranding = store.getPublicBranding({ companyCode: 'company-a' });
    assert.strictEqual(defaultBranding.whiteLabel, false, 'white-label should be off by default');

    store.upsertCompanyAddon(companyAId, 'white_label', { is_active: true });
    const customBranding = store.getPublicBranding({ companyCode: 'company-a' });
    assert.strictEqual(customBranding.whiteLabel, true, 'white-label should be on after addon activation');
    assert.strictEqual(customBranding.appName, 'Company A ERP', 'custom app name should be visible with white-label');

    // Last-plan guard: make one plan active for all companies, then remove all other plans.
    [companyAId, companyBId, companyCId].forEach((companyId) => {
        store.setCompanySubscription(companyId, {
            plan_id: renamedLimitsPlanId,
            start_date: store.getDateKey()
        });
    });

    store.listPlans().forEach((plan) => {
        if (plan.id === renamedLimitsPlanId) {
            return;
        }
        store.deletePlan(plan.id);
    });

    const remainingPlans = store.listPlans();
    assert.strictEqual(remainingPlans.length, 1, 'exactly one plan should remain after cleanup');
    assert.strictEqual(remainingPlans[0].id, renamedLimitsPlanId, 'remaining plan should be the keeper plan');

    expectThrows(
        () => store.deletePlan(renamedLimitsPlanId),
        /at least one plan must remain/i,
        'delete last remaining plan'
    );

    console.log('PASS multi-tenant integration scenarios');
    console.log(`Data root: ${TEMP_DATA_ROOT}`);
}

try {
    run();
} finally {
    store.closeAll?.();
    try {
        fs.rmSync(TEMP_DATA_ROOT, { recursive: true, force: true });
    } catch (_error) {
        // Ignore cleanup errors.
    }
}
