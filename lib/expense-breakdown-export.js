const ExcelJS = require('exceljs');

const CURRENCY_FORMAT = '"PHP" #,##0.00';
const THIN_BORDER = {
    top: { style: 'thin', color: { argb: 'FF1F2937' } },
    left: { style: 'thin', color: { argb: 'FF1F2937' } },
    bottom: { style: 'thin', color: { argb: 'FF1F2937' } },
    right: { style: 'thin', color: { argb: 'FF1F2937' } }
};

function normalizeText(value) {
    return String(value || '').trim();
}

function safeName(value, fallback = 'export') {
    const text = normalizeText(value) || fallback;
    return text.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim();
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatDateLabel(value) {
    const text = normalizeText(value);
    if (!text) {
        return '';
    }

    const parsed = new Date(`${text}T00:00:00`);
    return Number.isNaN(parsed.getTime())
        ? text
        : parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
}

function buildDateScope(filters = {}) {
    const dateFrom = normalizeText(filters.dateFrom);
    const dateTo = normalizeText(filters.dateTo);

    if (dateFrom && dateTo) {
        return `${dateFrom}_to_${dateTo}`;
    }
    if (dateFrom) {
        return `from_${dateFrom}`;
    }
    if (dateTo) {
        return `until_${dateTo}`;
    }
    return 'all_dates';
}

function buildFilterSummaryText(filters = {}) {
    const parts = [];
    const branch = normalizeText(filters.branch);
    const search = normalizeText(filters.search);

    if (filters.dateFrom || filters.dateTo) {
        parts.push(`Period: ${formatDateLabel(filters.dateFrom) || 'Start'} to ${formatDateLabel(filters.dateTo) || 'End'}`);
    } else {
        parts.push('Period: All Dates');
    }

    parts.push(`Branch: ${branch || 'All Branches'}`);

    if (search) {
        parts.push(`Search: ${search}`);
    }

    return parts.join(' | ');
}

function getBranchOrder(items = [], branches = [], branchFilter = '') {
    const requestedBranch = normalizeText(branchFilter);
    if (requestedBranch) {
        return [requestedBranch];
    }

    const itemBranchMap = new Map();
    (items || []).forEach((row) => {
        const branchName = normalizeText(row.branch);
        if (branchName) {
            itemBranchMap.set(branchName.toLowerCase(), branchName);
        }
    });

    const configuredBranches = [...new Set(
        (branches || [])
            .map((value) => normalizeText(value))
            .filter(Boolean)
    )];
    const orderedBranches = configuredBranches.filter((branch) => itemBranchMap.has(branch.toLowerCase()));
    const remainingBranches = [...itemBranchMap.values()]
        .filter((branch) => !orderedBranches.some((candidate) => candidate.toLowerCase() === branch.toLowerCase()))
        .sort((left, right) => left.localeCompare(right));

    const finalOrder = [...orderedBranches, ...remainingBranches];
    if (finalOrder.length) {
        return finalOrder;
    }

    if (configuredBranches.length === 1) {
        return configuredBranches;
    }

    return ['All Branches'];
}

function buildBranchSections({ items = [], branches = [], branchFilter = '' } = {}) {
    return getBranchOrder(items, branches, branchFilter).map((branch) => {
        const scopedItems = branch === 'All Branches'
            ? items
            : items.filter((row) => normalizeText(row.branch).toLowerCase() === branch.toLowerCase());
        const grouped = new Map();

        scopedItems.forEach((row) => {
            const label = normalizeText(row.about) || 'Unlabeled Expense';
            const key = label.toLowerCase();
            const existing = grouped.get(key) || {
                label,
                amount: 0,
                recordCount: 0
            };

            existing.amount += Number(row.amount || 0);
            existing.recordCount += 1;
            grouped.set(key, existing);
        });

        const expenseItems = [...grouped.values()]
            .sort((left, right) => left.label.localeCompare(right.label));
        const totalAmount = expenseItems.reduce((sum, row) => sum + Number(row.amount || 0), 0);

        return {
            branch,
            recordCount: scopedItems.length,
            uniqueItemCount: expenseItems.length,
            totalAmount,
            expenseItems
        };
    });
}

function styleCell(cell, {
    font = null,
    fill = null,
    alignment = null,
    border = THIN_BORDER,
    numFmt = ''
} = {}) {
    if (font) {
        cell.font = font;
    }
    if (fill) {
        cell.fill = fill;
    }
    if (alignment) {
        cell.alignment = alignment;
    }
    if (border) {
        cell.border = border;
    }
    if (numFmt) {
        cell.numFmt = numFmt;
    }
}

function styleRowRange(sheet, rowNumber, startColumn, endColumn, options = {}) {
    for (let column = startColumn; column <= endColumn; column += 1) {
        styleCell(sheet.getCell(rowNumber, column), options);
    }
}

function renderBranchSection(sheet, section, startColumn, startRow, filterSummaryText) {
    const endColumn = startColumn + 1;
    let row = startRow;

    sheet.mergeCells(row, startColumn, row, endColumn);
    const titleCell = sheet.getCell(row, startColumn);
    titleCell.value = String(section.branch || 'Branch').toUpperCase();
    styleCell(titleCell, {
        font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE68A1F' } },
        alignment: { vertical: 'middle', horizontal: 'center' }
    });
    styleRowRange(sheet, row, startColumn, endColumn, {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE68A1F' } }
    });
    row += 1;

    sheet.mergeCells(row, startColumn, row, endColumn);
    const summaryCell = sheet.getCell(row, startColumn);
    summaryCell.value = filterSummaryText;
    styleCell(summaryCell, {
        font: { italic: true, color: { argb: 'FF9A3412' }, size: 9 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4EA' } },
        alignment: { vertical: 'middle', horizontal: 'left', wrapText: true }
    });
    styleRowRange(sheet, row, startColumn, endColumn, {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4EA' } }
    });
    row += 1;

    sheet.getCell(row, startColumn).value = 'Expense Item';
    sheet.getCell(row, endColumn).value = 'Amount';
    styleRowRange(sheet, row, startColumn, endColumn, {
        font: { bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } },
        alignment: { vertical: 'middle', horizontal: 'center' }
    });
    row += 1;

    if (!section.expenseItems.length) {
        sheet.getCell(row, startColumn).value = 'No expense entries recorded.';
        sheet.getCell(row, endColumn).value = 0;
        styleCell(sheet.getCell(row, startColumn), {
            alignment: { vertical: 'middle', horizontal: 'left' }
        });
        styleCell(sheet.getCell(row, endColumn), {
            alignment: { vertical: 'middle', horizontal: 'right' },
            numFmt: CURRENCY_FORMAT
        });
        row += 1;
    } else {
        section.expenseItems.forEach((item, index) => {
            sheet.getCell(row, startColumn).value = item.label;
            sheet.getCell(row, endColumn).value = Number(item.amount || 0);
            styleCell(sheet.getCell(row, startColumn), {
                alignment: { vertical: 'middle', horizontal: 'left' },
                fill: index % 2 === 0
                    ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
                    : null
            });
            styleCell(sheet.getCell(row, endColumn), {
                alignment: { vertical: 'middle', horizontal: 'right' },
                numFmt: CURRENCY_FORMAT,
                fill: index % 2 === 0
                    ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
                    : null
            });
            row += 1;
        });
    }

    sheet.getCell(row, startColumn).value = 'TOTAL EXPENSES';
    sheet.getCell(row, endColumn).value = Number(section.totalAmount || 0);
    styleRowRange(sheet, row, startColumn, endColumn, {
        font: { bold: true },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7D36B' } },
        alignment: { vertical: 'middle', horizontal: 'right' }
    });
    sheet.getCell(row, startColumn).alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getCell(row, endColumn).numFmt = CURRENCY_FORMAT;
    row += 1;

    sheet.mergeCells(row, startColumn, row, endColumn);
    const infoCell = sheet.getCell(row, startColumn);
    infoCell.value = `${section.recordCount} record${section.recordCount === 1 ? '' : 's'} | ${section.uniqueItemCount} grouped item${section.uniqueItemCount === 1 ? '' : 's'}`;
    styleCell(infoCell, {
        font: { italic: true, size: 9, color: { argb: 'FF6B7280' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } },
        alignment: { vertical: 'middle', horizontal: 'left' }
    });
    styleRowRange(sheet, row, startColumn, endColumn, {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } }
    });

    return row;
}

function buildOverviewSheet(workbook, {
    companyName = '',
    filters = {},
    result = {},
    sections = []
} = {}) {
    const sheet = workbook.addWorksheet('Overview', {
        views: [{ state: 'frozen', ySplit: 6 }]
    });

    sheet.columns = [
        { width: 28 },
        { width: 28 },
        { width: 18 }
    ];

    sheet.mergeCells('A1:C1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Business Costs Breakdown';
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:C2');
    const companyCell = sheet.getCell('A2');
    companyCell.value = companyName || 'GMS ERP';
    companyCell.font = { bold: true, size: 11, color: { argb: 'FF374151' } };
    companyCell.alignment = { horizontal: 'center' };

    const rows = [
        ['Generated At', new Date().toLocaleString('en-PH')],
        ['Period', filters.dateFrom || filters.dateTo
            ? `${formatDateLabel(filters.dateFrom) || 'Start'} to ${formatDateLabel(filters.dateTo) || 'End'}`
            : 'All Dates'],
        ['Branch Filter', normalizeText(filters.branch) || 'All Branches'],
        ['Search Filter', normalizeText(filters.search) || 'None'],
        ['Visible Records', Number(result.summary?.totalCount || result.items?.length || 0)],
        ['Total Expenses', Number(result.summary?.totalAmount || 0)],
        ['Cash Left', Number(result.summary?.cashLeftAmount || 0)]
    ];

    let rowNumber = 4;
    rows.forEach(([label, value]) => {
        sheet.getCell(rowNumber, 1).value = label;
        sheet.getCell(rowNumber, 2).value = value;
        styleCell(sheet.getCell(rowNumber, 1), {
            font: { bold: true },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } },
            alignment: { horizontal: 'left' }
        });
        styleCell(sheet.getCell(rowNumber, 2), {
            alignment: { horizontal: typeof value === 'number' ? 'right' : 'left' },
            numFmt: label === 'Total Expenses' || label === 'Cash Left' ? CURRENCY_FORMAT : ''
        });
        rowNumber += 1;
    });

    rowNumber += 1;
    sheet.getCell(rowNumber, 1).value = 'Branch';
    sheet.getCell(rowNumber, 2).value = 'Grouped Items';
    sheet.getCell(rowNumber, 3).value = 'Total';
    styleRowRange(sheet, rowNumber, 1, 3, {
        font: { bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } },
        alignment: { horizontal: 'center' }
    });
    rowNumber += 1;

    (sections || []).forEach((section, index) => {
        sheet.getCell(rowNumber, 1).value = section.branch;
        sheet.getCell(rowNumber, 2).value = section.uniqueItemCount;
        sheet.getCell(rowNumber, 3).value = Number(section.totalAmount || 0);
        styleCell(sheet.getCell(rowNumber, 1), {
            fill: index % 2 === 0
                ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
                : null
        });
        styleCell(sheet.getCell(rowNumber, 2), {
            alignment: { horizontal: 'center' },
            fill: index % 2 === 0
                ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
                : null
        });
        styleCell(sheet.getCell(rowNumber, 3), {
            alignment: { horizontal: 'right' },
            numFmt: CURRENCY_FORMAT,
            fill: index % 2 === 0
                ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
                : null
        });
        rowNumber += 1;
    });

    return sheet;
}

function buildBreakdownSheet(workbook, {
    companyName = '',
    filters = {},
    sections = []
} = {}) {
    const sheet = workbook.addWorksheet('Breakdown', {
        pageSetup: {
            orientation: 'landscape',
            paperSize: 9,
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0
        }
    });

    sheet.columns = [
        { width: 34 },
        { width: 16 },
        { width: 4 },
        { width: 34 },
        { width: 16 }
    ];

    sheet.mergeCells('A1:E1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'BUSINESS COSTS BREAKDOWN';
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:E2');
    const companyCell = sheet.getCell('A2');
    companyCell.value = companyName || 'GMS ERP';
    companyCell.font = { bold: true, size: 11, color: { argb: 'FF374151' } };
    companyCell.alignment = { horizontal: 'center' };

    sheet.mergeCells('A3:E3');
    const filterCell = sheet.getCell('A3');
    filterCell.value = buildFilterSummaryText(filters);
    filterCell.font = { italic: true, color: { argb: 'FF7C2D12' } };
    filterCell.alignment = { horizontal: 'center' };

    let currentRow = 5;
    const filterSummaryText = buildFilterSummaryText(filters);
    const safeSections = sections.length
        ? sections
        : [{
            branch: normalizeText(filters.branch) || 'All Branches',
            recordCount: 0,
            uniqueItemCount: 0,
            totalAmount: 0,
            expenseItems: []
        }];

    for (let index = 0; index < safeSections.length; index += 2) {
        const left = safeSections[index];
        const right = safeSections[index + 1] || null;
        const leftEndRow = renderBranchSection(sheet, left, 1, currentRow, filterSummaryText);
        const rightEndRow = right
            ? renderBranchSection(sheet, right, 4, currentRow, filterSummaryText)
            : currentRow;
        currentRow = Math.max(leftEndRow, rightEndRow) + 2;
    }

    return sheet;
}

function buildTransactionsSheet(workbook, { items = [] } = {}) {
    const sheet = workbook.addWorksheet('Transactions', {
        views: [{ state: 'frozen', ySplit: 1 }]
    });

    sheet.columns = [
        { header: 'Date', key: 'expense_date', width: 14 },
        { header: 'Branch', key: 'branch', width: 18 },
        { header: 'About', key: 'about', width: 30 },
        { header: 'Amount', key: 'amount', width: 16 },
        { header: 'Note', key: 'note', width: 28 },
        { header: 'Source', key: 'source', width: 14 },
        { header: 'Created At', key: 'created_at', width: 20 }
    ];

    const headerRow = sheet.getRow(1);
    styleRowRange(sheet, 1, 1, sheet.columnCount, {
        font: { bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } },
        alignment: { horizontal: 'center' }
    });

    (items || []).forEach((row, index) => {
        const targetRow = sheet.addRow({
            expense_date: normalizeText(row.expense_date),
            branch: normalizeText(row.branch),
            about: normalizeText(row.about),
            amount: Number(row.amount || 0),
            note: normalizeText(row.note),
            source: normalizeText(row.source),
            created_at: normalizeText(row.created_at)
        });

        styleRowRange(sheet, targetRow.number, 1, sheet.columnCount, {
            fill: index % 2 === 0
                ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
                : null
        });
        targetRow.getCell('amount').numFmt = CURRENCY_FORMAT;
        targetRow.getCell('amount').alignment = { horizontal: 'right' };
    });

    if (!items.length) {
        const emptyRow = sheet.addRow({
            expense_date: '',
            branch: '',
            about: 'No expense entries recorded for the selected filters.',
            amount: 0,
            note: '',
            source: '',
            created_at: ''
        });
        emptyRow.getCell('amount').numFmt = CURRENCY_FORMAT;
    }

    sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheet.columnCount }
    };
    headerRow.commit();
    return sheet;
}

async function buildExpenseBreakdownWorkbookBuffer({
    companyName = '',
    filters = {},
    branches = [],
    result = {}
} = {}) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GMS ERP';
    workbook.created = new Date();
    workbook.modified = new Date();

    const items = Array.isArray(result.items) ? result.items : [];
    const sections = buildBranchSections({
        items,
        branches,
        branchFilter: filters.branch
    });

    buildOverviewSheet(workbook, {
        companyName,
        filters,
        result,
        sections
    });
    buildBreakdownSheet(workbook, {
        companyName,
        filters,
        sections
    });
    buildTransactionsSheet(workbook, { items });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

function buildExpenseBreakdownFilename({ companyName = '', filters = {} } = {}) {
    const safeCompanyName = safeName(companyName, 'company');
    const dateScope = buildDateScope(filters);
    const branchScope = normalizeText(filters.branch)
        ? `_${safeName(filters.branch, 'branch')}`
        : '';
    return `GMS_${safeCompanyName}_expense_breakdown_${dateScope}${branchScope}.xlsx`;
}

module.exports = {
    buildExpenseBreakdownFilename,
    buildExpenseBreakdownWorkbookBuffer,
    buildBranchSections,
    buildFilterSummaryText,
    formatMoney
};
