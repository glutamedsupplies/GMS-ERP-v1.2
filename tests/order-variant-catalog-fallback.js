#!/usr/bin/env node

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMP_DATA_ROOT = path.join(os.tmpdir(), `attendance-order-fallback-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
process.env.ATTENDANCE_DATA_DIR = TEMP_DATA_ROOT;
process.env.ATTENDANCE_AUTO_SEED = '0';

const inventoryVariantStore = require('../lib/inventory-variants-store');
const salesStore = require('../lib/sales-store');
const store = require('../lib/sqlite');

function run() {
    store.ensureSystemReady();

    const plan = store.createPlan({
        id: 'qa_order_variant_fallback',
        name: 'QA Order Variant Fallback',
        price_monthly: 0,
        max_branches: 1,
        max_users: 2,
        max_invoices_monthly: 10,
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

    const companyCreation = store.createCompany({
        name: 'Fallback QA Company',
        companyCode: 'fallback-qa',
        subdomain: 'fallback-qa',
        planId: plan.id,
        appName: 'Fallback QA ERP',
        adminUsername: 'fallback_admin',
        adminName: 'Fallback Admin',
        adminPassword: 'Password123!'
    });

    const companyId = companyCreation.company.id;

    store.runWithTenantContextByCompany(companyId, () => {
        inventoryVariantStore.createInventoryVariant({
            productName: 'NAD+ 500mg',
            itemCode: 'NAD500',
            setName: 'M',
            price: 6000,
            costPrice: 2500
        });

        const db = store.getTenantDb(companyId);
        db.prepare(`
            DELETE FROM product_catalog
            WHERE LOWER(product_name) = LOWER(?)
              AND LOWER(item_set) = LOWER(?)
        `).run('NAD+ 500mg', 'M');

        const catalogRow = db.prepare(`
            SELECT id
            FROM product_catalog
            WHERE LOWER(product_name) = LOWER(?)
              AND LOWER(item_set) = LOWER(?)
            LIMIT 1
        `).get('NAD+ 500mg', 'M');
        assert.strictEqual(catalogRow, undefined, 'product_catalog row should be missing for the regression setup');

        const result = salesStore.addSaleEntry({
            saleDate: '2026-04-13',
            branch: 'Main Branch',
            cashBranch: 'Main Branch',
            courier: 'Meet-Up',
            adminName: 'Fallback Admin',
            salesRepresentative: 'Fallback Rep',
            clientName: 'Fallback Client',
            inventoryDeducted: false,
            amountPaid: 0,
            items: [{
                itemSold: 'NAD+ 500mg',
                productName: 'NAD+ 500mg',
                itemSet: 'M',
                itemCode: 'NAD500',
                quantity: 1,
                unitPrice: 6000
            }]
        });

        assert.strictEqual(result.totalItems, 1, 'order should save one line item');
        assert.strictEqual(result.items[0].itemSold, 'NAD+ 500mg', 'saved item should keep the selected product');
        assert.strictEqual(result.items[0].itemSet, 'M', 'saved item should keep the selected set');

        const savedRow = db.prepare(`
            SELECT item_sold, item_code, item_set
            FROM sales_entries
            WHERE order_number = ?
            LIMIT 1
        `).get(result.orderNumber);

        assert(savedRow, 'sales row should be inserted');
        assert.strictEqual(savedRow.item_sold, 'NAD+ 500mg', 'inserted sales row should match the fallback variant');
        assert.strictEqual(savedRow.item_code, 'NAD500', 'inserted sales row should keep the variant item code');
        assert.strictEqual(savedRow.item_set, 'M', 'inserted sales row should keep the variant set');
    });

    console.log('order-variant-catalog-fallback: all checks passed');
}

try {
    run();
} finally {
    store.closeAll?.();
    fs.rmSync(TEMP_DATA_ROOT, { recursive: true, force: true });
}
