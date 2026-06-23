#!/usr/bin/env node

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMP_DATA_ROOT = path.join(os.tmpdir(), `attendance-order-edit-placeholder-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
process.env.ATTENDANCE_DATA_DIR = TEMP_DATA_ROOT;
process.env.ATTENDANCE_AUTO_SEED = '0';

const inventoryVariantStore = require('../lib/inventory-variants-store');
const salesStore = require('../lib/sales-store');
const store = require('../lib/sqlite');

function createVariant({ productName, itemCode, amount }) {
    inventoryVariantStore.createInventoryVariant({
        productName,
        itemCode,
        setName: 'M',
        price: amount,
        costPrice: Math.max(1, Math.round(amount / 2))
    });
}

function createOrder({ orderNumber, clientName, itemSold, itemCode, amount }) {
    return salesStore.addSaleEntry({
        orderNumber,
        saleDate: '2026-06-04',
        branch: 'Main Branch',
        cashBranch: 'Main Branch',
        courier: 'Meet-Up',
        adminName: 'QA Admin',
        salesRepresentative: 'QA Rep',
        clientName,
        clientContact: '09170000000',
        clientAddress: 'QA Address',
        inventoryDeducted: false,
        amountPaid: amount,
        paymentMethods: ['CASH'],
        paymentMethodBreakdown: [{
            method: 'CASH',
            amount
        }],
        items: [{
            itemSold,
            productName: itemSold,
            itemSet: 'M',
            itemCode,
            quantity: 1,
            unitPrice: amount
        }]
    });
}

function run() {
    store.ensureSystemReady();

    const plan = store.createPlan({
        id: 'qa_order_edit_placeholder',
        name: 'QA Order Edit Placeholder',
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
        name: 'Order Edit Placeholder QA',
        companyCode: 'order-edit-placeholder-qa',
        subdomain: 'order-edit-placeholder-qa',
        planId: plan.id,
        appName: 'Order Edit Placeholder QA',
        adminUsername: 'placeholder_admin',
        adminName: 'Placeholder Admin',
        adminPassword: 'Password123!'
    });

    const companyId = companyCreation.company.id;

    store.runWithTenantContextByCompany(companyId, () => {
        createVariant({ productName: 'Legacy Wrong Order', itemCode: 'LEGACY-WRONG', amount: 10500 });
        createVariant({ productName: 'Tirzepatide 15mg', itemCode: 'TZ15', amount: 7400 });
        createVariant({ productName: 'NAD+', itemCode: 'NAD', amount: 1200 });

        const first = createOrder({
            orderNumber: 'QA-JENNIFER-001',
            clientName: 'Jennifer G Monge',
            itemSold: 'Legacy Wrong Order',
            itemCode: 'LEGACY-WRONG',
            amount: 10500
        });
        const second = createOrder({
            orderNumber: 'QA-ARIANNE-001',
            clientName: 'Arianne Gayle Agdigos',
            itemSold: 'Tirzepatide 15mg',
            itemCode: 'TZ15',
            amount: 7400
        });

        const db = store.getTenantDb(companyId);
        db.prepare(`
            UPDATE sales_entries
            SET order_number = 'Auto on save'
            WHERE receipt_number IN (?, ?)
        `).run(first.receiptNumber, second.receiptNumber);

        const loadedSecond = salesStore.getSaleOrder(second.receiptNumber);
        assert.strictEqual(loadedSecond.clientName, 'Arianne Gayle Agdigos', 'receipt lookup should load the selected receipt customer');
        assert.strictEqual(loadedSecond.orderNumber, second.receiptNumber, 'placeholder order number should fall back to the selected receipt number');
        assert.strictEqual(loadedSecond.receiptNumber, second.receiptNumber, 'receipt number should remain the stable lookup');

        assert.throws(
            () => salesStore.getSaleOrder('Auto on save'),
            /Order not found/i,
            'placeholder order lookup should not load an arbitrary legacy order'
        );

        const generated = createOrder({
            orderNumber: 'Auto on save',
            clientName: 'Generated Order Client',
            itemSold: 'NAD+',
            itemCode: 'NAD',
            amount: 1200
        });
        assert.notStrictEqual(generated.orderNumber, 'Auto on save', 'new saves should not persist the placeholder order number');
        assert(/^ORD-20260604-\d{4}$/.test(generated.orderNumber), 'placeholder saves should generate a real order number');
    });

    console.log('order-edit-placeholder-lookup: all checks passed');
}

try {
    run();
} finally {
    store.closeAll?.();
    fs.rmSync(TEMP_DATA_ROOT, { recursive: true, force: true });
}
