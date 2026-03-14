#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const store = require('../lib/sqlite');
const salesStore = require('../lib/sales-store');
const inventoryVariantStore = require('../lib/inventory-variants-store');

const DEFAULT_CURRENCY_FORMAT = '#,##0.00';
const DEFAULT_NUMBER_FORMAT = '#,##0.00';
const DEFAULT_INTEGER_FORMAT = '0';

function normalizeText(value) {
    return String(value || '').trim();
}

function pad(value) {
    return String(value).padStart(2, '0');
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

function parseMonth(input) {
    const value = normalizeText(input);
    if (!value) {
        return null;
    }

    const match = value.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!year || month < 1 || month > 12) {
        return null;
    }

    return { year, month };
}

function getMonthBounds(year, month) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return {
        dateFrom: `${year}-${pad(month)}-01`,
        dateTo: `${year}-${pad(month)}-${pad(end.getDate())}`
    };
}

function safeName(value, fallback = 'export') {
    const text = normalizeText(value) || fallback;
    return text.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim();
}

function ensureDirectory(targetPath) {
    fs.mkdirSync(targetPath, { recursive: true });
}

function applyHeaderStyle(row) {
    row.height = 22;
    row.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1F4E78' }
        };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
            left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
            bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
            right: { style: 'thin', color: { argb: 'FFB0B0B0' } }
        };
    });
}

function applyRowStripes(sheet) {
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) {
            return;
        }
        if (rowNumber % 2 === 0) {
            row.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF6F7FB' }
                };
            });
        }
    });
}

function applyColumnFormats(sheet, columns) {
    columns.forEach((column, index) => {
        const target = sheet.getColumn(index + 1);
        if (column.numFmt) {
            target.numFmt = column.numFmt;
        }
        if (column.alignment) {
            target.alignment = column.alignment;
        }
    });
}

function buildRows(items, columns) {
    return items.map((item) => {
        const row = {};
        columns.forEach((column) => {
            const raw = column.value ? column.value(item) : item[column.key];
            if (column.type === 'number') {
                const numeric = Number(raw);
                row[column.key] = Number.isFinite(numeric) ? numeric : null;
                return;
            }
            if (column.type === 'integer') {
                const numeric = Number(raw);
                row[column.key] = Number.isFinite(numeric) ? Math.round(numeric) : null;
                return;
            }
            if (column.type === 'text') {
                row[column.key] = raw == null ? '' : String(raw);
                return;
            }
            row[column.key] = raw == null ? '' : raw;
        });
        return row;
    });
}

function addSheet(workbook, name, columns, rows) {
    const safeSheetName = safeName(name).slice(0, 31);
    const sheet = workbook.addWorksheet(safeSheetName, {
        views: [{ state: 'frozen', ySplit: 1 }]
    });
    sheet.columns = columns.map((column) => ({
        header: column.header,
        key: column.key,
        width: column.width || Math.max(12, String(column.header || '').length + 2)
    }));
    sheet.addRows(rows);
    applyHeaderStyle(sheet.getRow(1));
    applyColumnFormats(sheet, columns);
    sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columns.length }
    };
    applyRowStripes(sheet);
    return sheet;
}

function addSummarySection(sheet, title, rows) {
    const titleRow = sheet.addRow([title]);
    titleRow.font = { bold: true, size: 12 };
    sheet.addRow([]);
    const headerRow = sheet.addRow(['Metric', 'Value']);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6EEF7' }
        };
    });
    rows.forEach((row) => sheet.addRow(row));
    sheet.addRow([]);
}

function addBreakdownSection(sheet, title, headers, rows) {
    const titleRow = sheet.addRow([title]);
    titleRow.font = { bold: true, size: 12 };
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6EEF7' }
        };
    });
    rows.forEach((row) => sheet.addRow(row));
    sheet.addRow([]);
}

function buildAttendanceSummary(rows) {
    const totals = {};
    rows.forEach((row) => {
        const status = normalizeText(row.status) || 'Unknown';
        totals[status] = (totals[status] || 0) + 1;
    });
    return Object.keys(totals)
        .sort((left, right) => left.localeCompare(right))
        .map((status) => [status, totals[status]]);
}

function resolveCompanySelection(companies, selection) {
    const normalized = normalizeText(selection);
    if (!normalized || normalized.toLowerCase() === 'all') {
        return companies;
    }

    const needle = normalized.toLowerCase();
    const matches = companies.filter((company) => {
        return [
            company.id,
            company.company_code,
            company.name,
            company.app_name
        ].some((value) => normalizeText(value).toLowerCase() === needle);
    });

    if (!matches.length) {
        throw new Error(`Company "${selection}" was not found.`);
    }

    return matches;
}

function buildSalesColumns() {
    return [
        { header: 'Sale Date', key: 'sale_date', width: 12 },
        { header: 'Receipt #', key: 'receipt_number', width: 14 },
        { header: 'Order #', key: 'order_number', width: 14 },
        { header: 'Branch', key: 'branch', width: 14 },
        { header: 'Cash Branch', key: 'cash_branch', width: 14 },
        { header: 'Courier', key: 'courier', width: 14 },
        { header: 'Admin', key: 'admin_name', width: 16 },
        { header: 'Sales Rep', key: 'sales_representative', width: 16 },
        { header: 'Client', key: 'client_name', width: 20 },
        { header: 'Client Contact', key: 'client_contact', width: 16 },
        { header: 'Client Address', key: 'client_address', width: 26 },
        { header: 'Item', key: 'item_sold', width: 22 },
        { header: 'Item Code', key: 'item_code', width: 12 },
        { header: 'Item Set', key: 'item_set', width: 12 },
        { header: 'Qty', key: 'quantity', width: 8, type: 'number', numFmt: DEFAULT_NUMBER_FORMAT },
        { header: 'Unit', key: 'entry_unit', width: 10 },
        { header: 'Unit Price', key: 'unit_price', width: 12, type: 'number', numFmt: DEFAULT_CURRENCY_FORMAT },
        { header: 'Line Subtotal', key: 'line_subtotal', width: 14, type: 'number', numFmt: DEFAULT_CURRENCY_FORMAT },
        { header: 'Order Total', key: 'order_total', width: 14, type: 'number', numFmt: DEFAULT_CURRENCY_FORMAT },
        { header: 'Base Total', key: 'base_total', width: 12, type: 'number', numFmt: DEFAULT_CURRENCY_FORMAT },
        { header: 'Delivery Fee', key: 'delivery_fee', width: 12, type: 'number', numFmt: DEFAULT_CURRENCY_FORMAT },
        { header: 'Delivery Fee Collect', key: 'delivery_fee_to_collect', width: 14, type: 'integer', numFmt: DEFAULT_INTEGER_FORMAT },
        { header: 'Payment Type', key: 'payment_type', width: 14 },
        { header: 'Payment Method', key: 'payment_method', width: 16 },
        { header: 'Payment Option', key: 'payment_option', width: 16 },
        { header: 'Payment Amount', key: 'payment_amount', width: 14, type: 'number', numFmt: DEFAULT_CURRENCY_FORMAT },
        { header: 'Collection Amount', key: 'collection_amount', width: 16, type: 'number', numFmt: DEFAULT_CURRENCY_FORMAT },
        { header: 'Overpayment', key: 'overpayment_amount', width: 12, type: 'number', numFmt: DEFAULT_CURRENCY_FORMAT },
        { header: 'Underpayment', key: 'underpayment_amount', width: 12, type: 'number', numFmt: DEFAULT_CURRENCY_FORMAT },
        { header: 'Report Payment', key: 'report_payment_label', width: 18 },
        { header: 'Unit Cost', key: 'unit_cost_price', width: 12, type: 'number', numFmt: DEFAULT_CURRENCY_FORMAT },
        { header: 'Line Cost', key: 'line_cost_total', width: 12, type: 'number', numFmt: DEFAULT_CURRENCY_FORMAT },
        { header: 'Line Profit', key: 'line_profit', width: 12, type: 'number', numFmt: DEFAULT_CURRENCY_FORMAT },
        { header: 'Order Status', key: 'order_status', width: 14 },
        { header: 'Note', key: 'note', width: 20 },
        { header: 'Source', key: 'source', width: 10 },
        { header: 'Created At', key: 'created_at', width: 18 }
    ];
}

function buildAttendanceColumns() {
    return [
        { header: 'Date', key: 'dateKey', width: 12 },
        { header: 'Employee ID', key: 'id', width: 12 },
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Branch', key: 'branch_id', width: 12 },
        { header: 'Scheduled In', key: 'scheduledTimeIn', width: 12 },
        { header: 'Scheduled Out', key: 'scheduledTimeOut', width: 12 },
        { header: 'Time In', key: 'timeIn', width: 10 },
        { header: 'Time Out', key: 'timeOut', width: 10 },
        { header: 'Worked Hours', key: 'workedHours', width: 12, type: 'number', numFmt: DEFAULT_NUMBER_FORMAT },
        { header: 'Late Minutes', key: 'lateMinutes', width: 12, type: 'number', numFmt: DEFAULT_INTEGER_FORMAT },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Remarks', key: 'displayRemarks', width: 28 }
    ];
}

function buildExpenseColumns() {
    return [
        { header: 'Expense Date', key: 'expense_date', width: 12 },
        { header: 'Branch', key: 'branch', width: 12 },
        { header: 'About', key: 'about', width: 24 },
        { header: 'Amount', key: 'amount', width: 12, type: 'number', numFmt: DEFAULT_CURRENCY_FORMAT },
        { header: 'Note', key: 'note', width: 22 },
        { header: 'Source', key: 'source', width: 10 },
        { header: 'Created At', key: 'created_at', width: 18 }
    ];
}

function buildCashIncomeColumns() {
    return [
        { header: 'Income Date', key: 'income_date', width: 12 },
        { header: 'Branch', key: 'branch', width: 12 },
        { header: 'About', key: 'about', width: 24 },
        { header: 'Amount', key: 'amount', width: 12, type: 'number', numFmt: DEFAULT_CURRENCY_FORMAT },
        { header: 'Status', key: 'confirmation_status', width: 14 },
        { header: 'Kind', key: 'income_kind', width: 16 },
        { header: 'Linked Order #', key: 'linked_order_number', width: 14 },
        { header: 'Linked Receipt #', key: 'linked_receipt_number', width: 16 },
        { header: 'Note', key: 'note', width: 22 },
        { header: 'Source', key: 'source', width: 10 },
        { header: 'Created At', key: 'created_at', width: 18 }
    ];
}

function buildInventoryColumns() {
    return [
        { header: 'Item', key: 'item_name', width: 22 },
        { header: 'Item Code', key: 'item_code', width: 12 },
        { header: 'Unit', key: 'inventory_unit', width: 10 },
        { header: 'Type', key: 'item_type', width: 10 },
        { header: 'Branch', key: 'branch', width: 12 },
        { header: 'Quantity', key: 'quantity', width: 12, type: 'number', numFmt: DEFAULT_NUMBER_FORMAT },
        { header: 'Expiration', key: 'expiration_date', width: 12 },
        { header: 'Catalog Price', key: 'catalog_price', width: 12, type: 'number', numFmt: DEFAULT_CURRENCY_FORMAT },
        { header: 'Updated At', key: 'updated_at', width: 18 },
        { header: 'Source', key: 'source', width: 10 }
    ];
}

function buildInventoryVariantColumns() {
    return [
        { header: 'Product', key: 'product_name', width: 24 },
        { header: 'Item Code', key: 'item_code', width: 12 },
        { header: 'Set', key: 'set_name', width: 12 },
        { header: 'Price', key: 'price', width: 12, type: 'number', numFmt: DEFAULT_CURRENCY_FORMAT },
        { header: 'Cost Price', key: 'cost_price', width: 12, type: 'number', numFmt: DEFAULT_CURRENCY_FORMAT },
        { header: 'Source', key: 'source', width: 10 },
        { header: 'Created At', key: 'created_at', width: 18 },
        { header: 'Updated At', key: 'updated_at', width: 18 }
    ];
}

function buildLbcColumns() {
    return [
        { header: 'Sale Date', key: 'saleDate', width: 12 },
        { header: 'Order #', key: 'orderNumber', width: 14 },
        { header: 'Receipt #', key: 'receiptNumber', width: 14 },
        { header: 'Client', key: 'clientName', width: 20 },
        { header: 'Branch', key: 'branch', width: 12 },
        { header: 'Courier', key: 'courier', width: 12 },
        { header: 'Payment Method', key: 'paymentMethod', width: 16 },
        { header: 'Order Status', key: 'orderStatus', width: 14 },
        { header: 'Delivery Status', key: 'deliveryStatus', width: 14 },
        { header: 'Shipment Status', key: 'shipmentStatus', width: 14 },
        { header: 'Tracking #', key: 'trackingNumber', width: 16 },
        { header: 'Amount To Collect', key: 'amountToCollect', width: 16, type: 'number', numFmt: DEFAULT_CURRENCY_FORMAT },
        { header: 'Collection Status', key: 'collectionStatus', width: 14 },
        { header: 'Assigned To', key: 'assignedTo', width: 16 },
        { header: 'Admin', key: 'adminName', width: 16 },
        { header: 'Sales Rep', key: 'salesRepresentative', width: 16 },
        { header: 'Updated At', key: 'updatedAt', width: 18 }
    ];
}

async function buildCompanyWorkbook({ company, monthKey, dateFrom, dateTo, outputPath }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GMS ERP';
    workbook.created = new Date();
    workbook.modified = new Date();

    const salesResult = salesStore.listSales({ dateFrom, dateTo });
    const expensesResult = salesStore.listExpenses({ dateFrom, dateTo });
    const cashIncomeResult = salesStore.listCashIncome({ dateFrom, dateTo });
    const attendanceRows = store.getAttendanceReport({ range: 'monthly', dateKey: dateFrom });
    const branches = store.listBranches();
    const inventoryRows = branches.length
        ? branches.flatMap((branch) => salesStore.listInventory({ branch: branch.branch_name }))
        : salesStore.listInventory();
    const variantRows = inventoryVariantStore.listInventoryVariants({});
    const lbcResult = salesStore.listLbcTracking({ dateFrom });
    const lbcRows = (lbcResult.items || []).filter((row) => row.saleDate >= dateFrom && row.saleDate <= dateTo);

    const summarySheet = workbook.addWorksheet('Summary', {
        views: [{ state: 'frozen', ySplit: 1 }]
    });
    summarySheet.addRow([`Monthly Export - ${company.name || company.app_name || company.id}`]);
    summarySheet.getRow(1).font = { bold: true, size: 14 };
    summarySheet.addRow(['Month', monthKey]);
    summarySheet.addRow(['Generated At', new Date().toLocaleString('en-US')]);
    summarySheet.addRow([]);

    const salesSummary = salesResult.summary || {};
    addSummarySection(summarySheet, 'Sales Summary', [
        ['Total Orders', salesSummary.totalOrders || 0],
        ['Total Sales', salesSummary.totalSalesDisplay || salesSummary.totalSales || 0],
        ['Total Cost', salesSummary.totalCostDisplay || salesSummary.totalCost || 0],
        ['Gross Profit', salesSummary.grossProfitDisplay || salesSummary.grossProfit || 0],
        ['Net Profit', salesSummary.netProfitAmountDisplay || salesSummary.netProfitAmount || 0]
    ]);

    const expenseTotal = (expensesResult.items || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const cashIncomeTotal = (cashIncomeResult.items || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    addSummarySection(summarySheet, 'Cash Flow Summary', [
        ['Total Cash Income', cashIncomeTotal],
        ['Total Expenses', expenseTotal],
        ['Net Cash', cashIncomeTotal - expenseTotal]
    ]);

    const attendanceSummaryRows = buildAttendanceSummary(attendanceRows);
    addBreakdownSection(summarySheet, 'Attendance Summary', ['Status', 'Count'], attendanceSummaryRows);

    const branchBreakdownRows = (salesSummary.branchBreakdown || []).map((entry) => [entry.label, entry.displayValue || entry.value]);
    addBreakdownSection(summarySheet, 'Sales by Branch', ['Branch', 'Total'], branchBreakdownRows);

    const paymentBreakdownRows = (salesSummary.paymentBreakdown || []).map((entry) => [entry.label, entry.displayValue || entry.value]);
    addBreakdownSection(summarySheet, 'Sales by Payment Method', ['Payment', 'Total'], paymentBreakdownRows);

    const salesColumns = buildSalesColumns();
    const attendanceColumns = buildAttendanceColumns();
    const expenseColumns = buildExpenseColumns();
    const cashIncomeColumns = buildCashIncomeColumns();
    const inventoryColumns = buildInventoryColumns();
    const variantColumns = buildInventoryVariantColumns();
    const lbcColumns = buildLbcColumns();

    addSheet(workbook, 'Sales', salesColumns, buildRows(salesResult.items || [], salesColumns));
    addSheet(workbook, 'Attendance', attendanceColumns, buildRows(attendanceRows || [], attendanceColumns));
    addSheet(workbook, 'Expenses', expenseColumns, buildRows(expensesResult.items || [], expenseColumns));
    addSheet(workbook, 'Cash Income', cashIncomeColumns, buildRows(cashIncomeResult.items || [], cashIncomeColumns));
    addSheet(workbook, 'Inventory', inventoryColumns, buildRows(inventoryRows || [], inventoryColumns));
    addSheet(workbook, 'Inventory Variants', variantColumns, buildRows(variantRows || [], variantColumns));

    if (lbcRows.length) {
        addSheet(workbook, 'LBC Tracking', lbcColumns, buildRows(lbcRows || [], lbcColumns));
    }

    await workbook.xlsx.writeFile(outputPath);
}

async function run() {
    const args = parseArgs(process.argv.slice(2));
    const fallbackMonth = store.getMonthKey(new Date()) || '';
    const monthInput = normalizeText(args.get('month')) || fallbackMonth;
    const parsedMonth = parseMonth(monthInput);
    if (!parsedMonth) {
        throw new Error('Invalid --month value. Use YYYY-MM.');
    }

    store.ensureSystemReady();

    const { dateFrom, dateTo } = getMonthBounds(parsedMonth.year, parsedMonth.month);
    const monthKey = `${parsedMonth.year}-${pad(parsedMonth.month)}`;

    const companies = resolveCompanySelection(store.listCompanies(), args.get('company'));
    if (!companies.length) {
        throw new Error('No companies found to export.');
    }

    const repoRoot = path.resolve(__dirname, '..');
    const baseExportRoot = normalizeText(args.get('out-dir'))
        || normalizeText(process.env.ATTENDANCE_EXPORT_DIR)
        || path.join(repoRoot, 'exports');
    const monthDir = path.join(baseExportRoot, `excel-${monthKey}`);
    ensureDirectory(monthDir);

    for (const company of companies) {
        const safeCompanyName = safeName(company.name || company.app_name || company.company_code || company.id);
        const companyDir = path.join(monthDir, `${safeCompanyName}-${company.id}`);
        ensureDirectory(companyDir);
        const outputPath = path.join(companyDir, `GMS_${safeCompanyName}_${monthKey}.xlsx`);

        await store.runWithTenantContextByCompany(company.id, () => {
            return buildCompanyWorkbook({
                company,
                monthKey,
                dateFrom,
                dateTo,
                outputPath
            });
        });

        console.log(`[excel] exported ${company.name || company.id} -> ${outputPath}`);
    }
}

run().catch((error) => {
    console.error('[excel] export failed:', error);
    process.exitCode = 1;
}).finally(() => {
    store.closeAll?.();
});
