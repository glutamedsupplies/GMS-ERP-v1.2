const appClient = window.appClient;

const invoiceDateInput = document.getElementById('invoiceDateInput');
const invoiceBranchFilter = document.getElementById('invoiceBranchFilter');
const invoiceTitleInput = document.getElementById('invoiceTitleInput');
const generateInvoiceBtn = document.getElementById('generateInvoiceBtn');
const copyInvoiceBtn = document.getElementById('copyInvoiceBtn');
const copyDiscrepancyBtn = document.getElementById('copyDiscrepancyBtn');
const reportTemplateType = document.getElementById('reportTemplateType');
const reportTemplateDateInput = document.getElementById('reportTemplateDateInput');
const copyReportTemplateBtn = document.getElementById('copyReportTemplateBtn');
const invoiceStatus = document.getElementById('invoiceStatus');
const invoicePreview = document.getElementById('invoicePreview');
const reportTemplatePreview = document.getElementById('reportTemplatePreview');
const invoiceClientsValue = document.getElementById('invoiceClientsValue');
const invoiceSalesValue = document.getElementById('invoiceSalesValue');
const invoiceBranchList = document.getElementById('invoiceBranchList');
const discrepancyCountValue = document.getElementById('discrepancyCountValue');
const discrepancyDifferenceValue = document.getElementById('discrepancyDifferenceValue');
const discrepancyInvoiceValue = document.getElementById('discrepancyInvoiceValue');
const discrepancyReportValue = document.getElementById('discrepancyReportValue');
const discrepancyPreview = document.getElementById('discrepancyPreview');
const discrepancyList = document.getElementById('discrepancyList');

const REPORT_TEMPLATE_BRANCHES = ['Cubao', 'Pampanga'];

const state = {
    branches: ['Cubao', 'Pampanga'],
    lastText: '',
    lastOrders: [],
    lastDiscrepancyText: '',
    lastDiscrepancies: [],
    lastReportTemplateText: '',
    serverDateKey: toDateInputValue(new Date()),
    reportTemplateRequestId: 0,
    session: null
};

initialize();

async function initialize() {
    bindReportTemplateEvents();
    if (reportTemplateDateInput) {
        reportTemplateDateInput.value = clampDateKey(reportTemplateDateInput.value || state.serverDateKey, state.serverDateKey);
        reportTemplateDateInput.max = state.serverDateKey;
    }
    void renderSelectedReportTemplate();

    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    state.session = session;
    if (!isGmsInvoiceCompany(session)) {
        lockInvoiceSummaryForNonGms();
        return;
    }

    state.serverDateKey = await resolveServerDateKey();
    invoiceDateInput.value = clampDateKey(invoiceDateInput.value || state.serverDateKey, state.serverDateKey);
    if (reportTemplateDateInput) {
        reportTemplateDateInput.value = clampDateKey(reportTemplateDateInput.value || state.serverDateKey, state.serverDateKey);
        reportTemplateDateInput.max = state.serverDateKey;
    }
    bindEvents();
    await loadReferenceData();
    await generateInvoiceSummary();
    await renderSelectedReportTemplate();
}

function isGmsInvoiceCompany(session) {
    const companyCode = normalizeCompanyCode(
        session?.company_code
        || session?.companyCode
    );
    return companyCode === 'gms'
        || companyCode === 'gms-erp'
        || companyCode === 'gmserp'
        || companyCode === 'default';
}

function normalizeCompanyCode(value) {
    return String(value || '').trim().toLowerCase();
}

function lockInvoiceSummaryForNonGms() {
    if (invoiceDateInput) invoiceDateInput.disabled = true;
    if (invoiceBranchFilter) invoiceBranchFilter.disabled = true;
    if (invoiceTitleInput) invoiceTitleInput.disabled = true;
    if (generateInvoiceBtn) generateInvoiceBtn.disabled = true;
    if (copyInvoiceBtn) copyInvoiceBtn.disabled = true;
    if (copyDiscrepancyBtn) copyDiscrepancyBtn.disabled = true;

    state.lastOrders = [];
    state.lastText = '';
    state.lastDiscrepancies = [];
    state.lastDiscrepancyText = '';

    invoicePreview.value = 'Invoice summary is available for GMS company only.';
    discrepancyPreview.value = 'Discrepancy list is available for GMS company only.';
    renderTotals([]);
    renderBranchBreakdown([]);
    renderDiscrepancySummary({
        discrepancyCount: 0,
        invoiceTotal: 0,
        reportTotal: 0,
        differenceTotal: 0
    });
    renderDiscrepancyList([]);
    setStatus('Invoice Summary is restricted to GMS company only. Report templates stay available below.', true);
}

function bindEvents() {
    generateInvoiceBtn?.addEventListener('click', generateInvoiceSummary);
    copyInvoiceBtn?.addEventListener('click', copyInvoiceSummary);
    copyDiscrepancyBtn?.addEventListener('click', copyDiscrepancyList);
    invoiceDateInput?.addEventListener('change', () => {
        invoiceDateInput.value = clampDateKey(invoiceDateInput.value || state.serverDateKey, state.serverDateKey);
        generateInvoiceSummary();
        void renderSelectedReportTemplate();
    });
    invoiceBranchFilter?.addEventListener('change', generateInvoiceSummary);
    invoiceTitleInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            generateInvoiceSummary();
        }
    });
}

function bindReportTemplateEvents() {
    reportTemplateType?.addEventListener('change', () => {
        void renderSelectedReportTemplate();
    });
    reportTemplateDateInput?.addEventListener('change', () => {
        reportTemplateDateInput.value = clampDateKey(reportTemplateDateInput.value || state.serverDateKey, state.serverDateKey);
        void renderSelectedReportTemplate();
    });
    copyReportTemplateBtn?.addEventListener('click', copyReportTemplate);
}

async function resolveServerDateKey() {
    try {
        const serverInfo = await appClient.getServerInfo();
        const dateKey = String(serverInfo?.dateKey || '').trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
            ? dateKey
            : toDateInputValue(new Date());
    } catch (_error) {
        return toDateInputValue(new Date());
    }
}

async function loadReferenceData() {
    try {
        const references = await appClient.getSalesReferences();
        const branches = Array.isArray(references?.branches) && references.branches.length
            ? references.branches
            : state.branches;

        state.branches = branches;
        populateBranchFilter(branches);
    } catch (error) {
        console.warn('Unable to load sales references for invoice summary:', error);
        populateBranchFilter(state.branches);
    }
}

function populateBranchFilter(branches) {
    invoiceBranchFilter.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All Branches';
    invoiceBranchFilter.appendChild(allOption);

    branches.forEach((branch) => {
        const option = document.createElement('option');
        option.value = branch;
        option.textContent = branch;
        invoiceBranchFilter.appendChild(option);
    });
}

async function generateInvoiceSummary() {
    const selectedDate = String(invoiceDateInput?.value || '').trim();
    if (!selectedDate) {
        setStatus('Select an invoice date first.', true);
        return;
    }

    setStatus('Loading invoice orders...', false);

    try {
        const payload = await appClient.listSales({
            dateFrom: selectedDate,
            dateTo: selectedDate,
            branch: invoiceBranchFilter.value
        });
        const rawRows = Array.isArray(payload?.items) ? payload.items : [];
        const filteredRows = filterRowsForSelectedDate(rawRows, selectedDate);
        const orders = buildOrderSummaries(filteredRows);
        const comparisonSummary = summarizeComparison(orders);
        const discrepancies = buildDiscrepancyEntries(orders);
        const text = buildClipboardText(orders, {
            title: invoiceTitleInput.value,
            date: selectedDate
        });
        const discrepancyText = buildDiscrepancyText(discrepancies, {
            date: selectedDate,
            branch: invoiceBranchFilter.value,
            invoiceTotal: comparisonSummary.invoiceTotal,
            reportTotal: comparisonSummary.reportTotal
        });

        state.lastOrders = orders;
        state.lastText = text;
        state.lastDiscrepancies = discrepancies;
        state.lastDiscrepancyText = discrepancyText;

        invoicePreview.value = text;
        copyInvoiceBtn.disabled = !text.trim();
        discrepancyPreview.value = discrepancyText;
        copyDiscrepancyBtn.disabled = !discrepancyText.trim();
        renderTotals(orders);
        renderBranchBreakdown(orders);
        renderDiscrepancySummary(comparisonSummary);
        renderDiscrepancyList(discrepancies);
        setStatus(`Generated ${orders.length} order(s) for ${formatDateLabel(selectedDate)}.`, false);
    } catch (error) {
        console.error('Failed to generate invoice summary:', error);
        state.lastOrders = [];
        state.lastText = '';
        state.lastDiscrepancies = [];
        state.lastDiscrepancyText = '';
        invoicePreview.value = '';
        copyInvoiceBtn.disabled = true;
        discrepancyPreview.value = '';
        copyDiscrepancyBtn.disabled = true;
        renderTotals([]);
        renderBranchBreakdown([]);
        renderDiscrepancySummary({
            discrepancyCount: 0,
            invoiceTotal: 0,
            reportTotal: 0,
            differenceTotal: 0
        });
        renderDiscrepancyList([]);
        setStatus(error.message || 'Unable to generate invoice summary.', true);
    }
}

function filterRowsForSelectedDate(rows, selectedDate) {
    const expectedDate = String(selectedDate || '').trim();
    if (!expectedDate || !Array.isArray(rows)) {
        return [];
    }

    return rows.filter((row) => resolveSaleDateValue(row) === expectedDate);
}

function resolveSaleDateValue(row) {
    const raw = String(row?.sale_date || row?.saleDate || '').trim();
    if (!raw) {
        return '';
    }

    const directMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (directMatch) {
        return directMatch[1];
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }

    return toDateInputValue(parsed);
}

function buildOrderSummaries(rows) {
    const groups = new Map();

    rows.forEach((row, index) => {
        const key = buildOrderKey(row, index);
        const existing = groups.get(key);

        if (!existing) {
            groups.set(key, {
                key,
                firstSeen: index,
                header: row,
                lines: [row],
                subtotalSum: Number(row.line_subtotal || 0)
            });
            return;
        }

        existing.lines.push(row);
        existing.subtotalSum += Number(row.line_subtotal || 0);
        if (shouldReplaceHeader(row, existing.header)) {
            existing.header = row;
        }
    });

    return Array.from(groups.values())
        .map((group) => finalizeOrderSummary(group))
        .sort(compareOrders);
}

function buildOrderKey(row, index) {
    const receipt = String(row?.receipt_number || '').trim();
    const order = String(row?.order_number || '').trim();
    const rowId = String(row?.id || '').trim();
    return receipt || order || rowId || `row-${index + 1}`;
}

function shouldReplaceHeader(candidate, current) {
    return scoreHeader(candidate) > scoreHeader(current);
}

function scoreHeader(row) {
    if (!row) {
        return -1;
    }

    let score = 0;
    if (Number(row.order_total || 0) > 0) score += 100;
    if (Number(row.base_total || 0) > 0) score += 60;
    if (Number(row.line_index || 0) === 1) score += 40;
    if (String(row.receipt_number || '').trim()) score += 20;
    if (String(row.order_number || '').trim()) score += 10;
    return score;
}

function finalizeOrderSummary(group) {
    const header = group.header || {};
    const orderTotal = resolveInvoiceOrderTotal(header, group.lines, group.subtotalSum);
    const reportTotal = resolveReportOrderTotal(header, group.lines, group.subtotalSum);
    const branch = String(header.branch || '').trim() || 'Unspecified';
    const clientName = String(header.client_name || '').trim() || 'Unnamed Client';
    const reference = String(header.receipt_number || header.order_number || group.key || '').trim();
    const difference = orderTotal - reportTotal;

    return {
        key: group.key,
        branch,
        clientName,
        orderTotal,
        reportTotal,
        difference,
        hasDiscrepancy: Math.abs(difference) > 0.0001,
        reference,
        firstSeen: group.firstSeen
    };
}

function resolveInvoiceOrderTotal(header, lines, subtotalSum) {
    const explicitTotal = Number(header?.order_total || header?.base_total || 0);
    if (explicitTotal > 0) {
        return explicitTotal;
    }

    const recomputedSubtotal = resolveSubtotal(lines, subtotalSum);
    return recomputedSubtotal > 0 ? recomputedSubtotal : Number(subtotalSum || 0);
}

function resolveReportOrderTotal(header, lines, subtotalSum) {
    const reference = String(header?.receipt_number || header?.order_number || '').trim();
    const explicitTotal = Number(header?.base_total || header?.order_total || 0);
    if (reference) {
        return explicitTotal > 0 ? explicitTotal : 0;
    }

    if (explicitTotal > 0) {
        return explicitTotal;
    }

    if (String(header?.source || '').toLowerCase() === 'seed') {
        return 0;
    }

    return resolveSubtotal(lines, subtotalSum);
}

function resolveSubtotal(lines, subtotalSum) {
    const recomputedSubtotal = (lines || []).reduce((sum, row) => sum + Number(row.line_subtotal || 0), 0);
    return recomputedSubtotal > 0 ? recomputedSubtotal : Number(subtotalSum || 0);
}

function compareOrders(left, right) {
    const branchOrder = getBranchSortIndex(left.branch) - getBranchSortIndex(right.branch);
    if (branchOrder !== 0) {
        return branchOrder;
    }

    const referenceOrder = String(left.reference || '').localeCompare(String(right.reference || ''), undefined, {
        numeric: true,
        sensitivity: 'base'
    });
    if (referenceOrder !== 0) {
        return referenceOrder;
    }

    return Number(left.firstSeen || 0) - Number(right.firstSeen || 0);
}

function getBranchSortIndex(branch) {
    const normalized = String(branch || '').trim().toLowerCase();
    const index = state.branches.findIndex((entry) => String(entry || '').trim().toLowerCase() === normalized);
    return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function buildClipboardText(orders, { title = 'Today\'s Invoice', date = '' } = {}) {
    const safeTitle = String(title || '').trim() || 'Today\'s Invoice';
    const lines = [`*${safeTitle}*`, formatDateLabel(date), ''];
    const groupedOrders = groupOrdersByBranch(orders);
    let hasBranchContent = false;

    groupedOrders.forEach(({ branch, items }) => {
        if (!items.length) {
            return;
        }

        hasBranchContent = true;
        lines.push(`*${String(branch || '').toUpperCase()}*`);
        lines.push('');

        items.forEach((order, index) => {
            lines.push(`${index + 1}. ${order.clientName}${buildOrderStarSuffix(order.orderTotal)}`);
        });

        lines.push('');
    });

    if (!hasBranchContent) {
        lines.push('No orders found.');
        lines.push('');
    }

    lines.push(`Total Clients: ${orders.length}`);
    lines.push(`Total Sales: ${formatPesoWhole(orders.reduce((sum, order) => sum + Number(order.orderTotal || 0), 0))}`);

    return lines.join('\n');
}

function buildOrderStarSuffix(orderTotal) {
    const starCount = Math.floor(Math.max(0, Number(orderTotal) || 0) / 5000);
    return starCount > 0 ? ` ${'\u2B50'.repeat(starCount)}` : '';
}

function groupOrdersByBranch(orders) {
    const map = new Map();

    state.branches.forEach((branch) => {
        map.set(branch, []);
    });

    orders.forEach((order) => {
        const branch = order.branch || 'Unspecified';
        if (!map.has(branch)) {
            map.set(branch, []);
        }
        map.get(branch).push(order);
    });

    return Array.from(map.entries()).map(([branch, items]) => ({
        branch,
        items
    }));
}

function renderTotals(orders) {
    const totalSales = orders.reduce((sum, order) => sum + Number(order.orderTotal || 0), 0);
    invoiceClientsValue.textContent = String(orders.length);
    invoiceSalesValue.textContent = formatPesoWhole(totalSales);
}

function summarizeComparison(orders) {
    const invoiceTotal = orders.reduce((sum, order) => sum + Number(order.orderTotal || 0), 0);
    const reportTotal = orders.reduce((sum, order) => sum + Number(order.reportTotal || 0), 0);
    return {
        discrepancyCount: orders.filter((order) => order.hasDiscrepancy).length,
        invoiceTotal,
        reportTotal,
        differenceTotal: invoiceTotal - reportTotal
    };
}

function buildDiscrepancyEntries(orders) {
    return orders
        .filter((order) => order.hasDiscrepancy)
        .sort((left, right) => {
            const magnitudeOrder = Math.abs(Number(right.difference || 0)) - Math.abs(Number(left.difference || 0));
            if (magnitudeOrder !== 0) {
                return magnitudeOrder;
            }

            return compareOrders(left, right);
        });
}

function buildDiscrepancyText(discrepancies, {
    date = '',
    branch = '',
    invoiceTotal = 0,
    reportTotal = 0
} = {}) {
    const lines = ['DISCREPANCY LIST', `Date: ${formatDateLabel(date)}`];
    const safeBranch = String(branch || '').trim();
    if (safeBranch) {
        lines.push(`Branch Filter: ${safeBranch}`);
    }

    lines.push('');

    if (!discrepancies.length) {
        lines.push('No discrepancies found.');
        lines.push('');
    } else {
        discrepancies.forEach((entry, index) => {
            lines.push(`${index + 1}. ${entry.reference || entry.key}`);
            lines.push(`Client: ${entry.clientName}`);
            lines.push(`Branch: ${entry.branch}`);
            lines.push(`Today's Invoice: ${formatPesoWhole(entry.orderTotal)}`);
            lines.push(`Sales Report: ${formatPesoWhole(entry.reportTotal)}`);
            lines.push(`Difference: ${formatPesoWhole(entry.difference)}`);
            lines.push('');
        });
    }

    lines.push(`TOTAL DISCREPANCIES: ${discrepancies.length}`);
    lines.push(`TOTAL DIFFERENCE: ${formatPesoWhole(invoiceTotal - reportTotal)}`);
    lines.push(`Today's Invoice Total: ${formatPesoWhole(invoiceTotal)}`);
    lines.push(`Sales Report Total: ${formatPesoWhole(reportTotal)}`);

    return lines.join('\n');
}

function renderDiscrepancySummary(summary) {
    discrepancyCountValue.textContent = String(summary?.discrepancyCount || 0);
    discrepancyDifferenceValue.textContent = formatPesoWhole(summary?.differenceTotal || 0);
    discrepancyInvoiceValue.textContent = formatPesoWhole(summary?.invoiceTotal || 0);
    discrepancyReportValue.textContent = formatPesoWhole(summary?.reportTotal || 0);
}

function renderDiscrepancyList(discrepancies) {
    if (!discrepancies.length) {
        discrepancyList.innerHTML = `
            <div class="branch-row">
                <span>Discrepancies</span>
                <strong>No mismatches for this filter</strong>
                <small>Kapag may magkaibang invoice total at report total, lalabas sila rito.</small>
            </div>
        `;
        return;
    }

    discrepancyList.innerHTML = discrepancies.map((entry) => `
        <div class="branch-row">
            <span>${appClient.escapeHtml(entry.reference || entry.key)} | ${appClient.escapeHtml(String(entry.branch || '').toUpperCase())}</span>
            <strong>${appClient.escapeHtml(entry.clientName)}</strong>
            <small>Today's Invoice: ${appClient.escapeHtml(formatPesoWhole(entry.orderTotal))} | Sales Report: ${appClient.escapeHtml(formatPesoWhole(entry.reportTotal))} | Difference: ${appClient.escapeHtml(formatPesoWhole(entry.difference))}</small>
        </div>
    `).join('');
}

function renderBranchBreakdown(orders) {
    const grouped = groupOrdersByBranch(orders).filter((entry) => entry.items.length);

    if (!grouped.length) {
        invoiceBranchList.innerHTML = `
            <div class="branch-row">
                <span>Branches</span>
                <strong>No orders for this filter</strong>
                <small>Try another date or branch filter.</small>
            </div>
        `;
        return;
    }

    invoiceBranchList.innerHTML = grouped.map(({ branch, items }) => {
        const sales = items.reduce((sum, order) => sum + Number(order.orderTotal || 0), 0);
        const branchLabel = appClient.escapeHtml(String(branch || '').toUpperCase());
        const summaryLabel = `${items.length} client(s) &bull; ${appClient.escapeHtml(formatPesoWhole(sales))}`;
        const namesLabel = appClient.escapeHtml(items.map((order) => order.clientName).join(', '));

        return `
            <div class="branch-row">
                <span>${branchLabel}</span>
                <strong>${summaryLabel}</strong>
                <small>${namesLabel}</small>
            </div>
        `;
    }).join('');
}

async function renderSelectedReportTemplate() {
    const templateType = normalizeReportTemplateType(reportTemplateType?.value);
    if (reportTemplateType) {
        reportTemplateType.value = templateType;
    }

    const fallbackText = buildReportTemplateSkeleton(templateType);
    const requestId = ++state.reportTemplateRequestId;

    state.lastReportTemplateText = fallbackText;
    if (reportTemplatePreview) {
        reportTemplatePreview.value = fallbackText;
    }
    if (copyReportTemplateBtn) {
        copyReportTemplateBtn.disabled = true;
    }

    if (!state.session) {
        if (copyReportTemplateBtn) {
            copyReportTemplateBtn.disabled = !fallbackText.trim();
        }
        return;
    }

    const selectedDateKey = clampDateKey(
        reportTemplateDateInput?.value || invoiceDateInput?.value || state.serverDateKey,
        state.serverDateKey
    );
    if (reportTemplateDateInput) {
        reportTemplateDateInput.value = selectedDateKey;
    }

    const period = getReportTemplatePeriod(templateType, selectedDateKey, state.serverDateKey);
    if (reportTemplatePreview) {
        reportTemplatePreview.value = `Loading ${capitalizeLabel(templateType)} report...`;
    }

    try {
        const [salesPayload, expensePayload, cashIncomePayload, pendingPayload, attendancePayload] = await Promise.all([
            appClient.listSales({
                dateFrom: period.dateFrom,
                dateTo: period.dateTo,
                limit: 2500,
                offset: 0
            }),
            appClient.listExpenses({
                dateFrom: period.dateFrom,
                dateTo: period.dateTo
            }),
            appClient.listCashIncome({
                dateFrom: period.dateFrom,
                dateTo: period.dateTo
            }),
            appClient.listPendingPayments({
                dateFrom: period.dateFrom,
                dateTo: period.dateTo,
                limit: 2500,
                offset: 0
            }),
            appClient.getAttendanceReport({
                employeeId: 'all',
                range: templateType,
                dateKey: selectedDateKey
            })
        ]);

        if (requestId !== state.reportTemplateRequestId) {
            return;
        }

        const reportData = buildReportTemplateData({
            templateType,
            period,
            salesRows: Array.isArray(salesPayload?.items) ? salesPayload.items : [],
            expenseSummary: expensePayload?.summary || {},
            cashIncomeSummary: cashIncomePayload?.summary || {},
            pendingItems: Array.isArray(pendingPayload?.items) ? pendingPayload.items : [],
            attendanceRows: filterAttendanceRowsByPeriod(
                Array.isArray(attendancePayload) ? attendancePayload : [],
                period
            )
        });
        const text = buildReportTemplateText(templateType, reportData);

        state.lastReportTemplateText = text;
        if (reportTemplatePreview) {
            reportTemplatePreview.value = text;
        }
        if (copyReportTemplateBtn) {
            copyReportTemplateBtn.disabled = !text.trim();
        }
    } catch (error) {
        if (requestId !== state.reportTemplateRequestId) {
            return;
        }

        console.error('Unable to render report template data:', error);
        const errorText = `${fallbackText}\n\n[Unable to load report data: ${String(error.message || 'Unknown error')}]`;
        state.lastReportTemplateText = errorText;
        if (reportTemplatePreview) {
            reportTemplatePreview.value = errorText;
        }
        if (copyReportTemplateBtn) {
            copyReportTemplateBtn.disabled = false;
        }
    }
}

function normalizeReportTemplateType(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'weekly' || normalized === 'monthly') {
        return normalized;
    }
    return 'daily';
}

function getReportTemplateHeading(templateType = 'daily') {
    const normalizedType = normalizeReportTemplateType(templateType);
    if (normalizedType === 'weekly') {
        return 'WEEKLY REPORT 📆';
    }
    if (normalizedType === 'monthly') {
        return 'MONTHLY REPORT 🗓️';
    }
    return 'DAILY REPORT 📅';
}

function getReportTemplatePeriodLineLabel(templateType = 'daily') {
    const normalizedType = normalizeReportTemplateType(templateType);
    if (normalizedType === 'weekly') {
        return '📆 Week';
    }
    if (normalizedType === 'monthly') {
        return '🗓️ Month';
    }
    return '📅 Date';
}

function buildReportTemplateSkeleton(templateType = 'daily') {
    const heading = getReportTemplateHeading(templateType);
    const periodLabel = getReportTemplatePeriodLineLabel(templateType);

    return [
        heading,
        '',
        `${periodLabel}:`,
        '👤 Prepared by:',
        '',
        '💼 SALES / FINANCE',
        '',
        '📍 CUBAO',
        '💰 Sales:',
        '💸 Expenses:',
        '💵 Cash Income:',
        '🏦 Net Cash Remaining:',
        '🪙 Overpayment:',
        '⏳ Pending Payments:',
        '📦 LBC Collection:',
        '👥 Client:',
        '',
        '📍 PAMPANGA',
        '💰 Sales:',
        '💸 Expenses:',
        '💵 Cash Income:',
        '🏦 Net Cash Remaining:',
        '🪙 Overpayment:',
        '⏳ Pending Payments:',
        '📦 LBC Collection:',
        '👥 Client:',
        '',
        '📊 TOTAL BOTH BRANCH',
        '💰 Total Sales:',
        '💸 Total Expenses:',
        '💵 Total Cash Income:',
        '🏦 Total Net Cash Remaining:',
        '🪙 Total Overpayment:',
        '⏳ Total Pending Payments:',
        '📦 Total LBC Collection:',
        '👥 Total Client:',
        '',
        '🧑‍💼 ATTENDANCE',
        '✅ Attendance:',
        '❌ Absent: ___',
        'Names of Absent:',
        '-',
        '-',
        '',
        '⏰ Late: ___',
        'Names of Late:',
        '-',
        '-',
        '',
        '📝 Excuse: ___',
        'Names of Excuse:',
        '-',
        '-',
        '',
        '⛔ Suspended: ___',
        'Names of Suspended:',
        '-',
        '-',
        '',
        '🗒️ Remarks:',
        '- Sales, collections, at attendance summary will appear here.',
        '- Follow up pending payments and attendance concerns when needed.'
    ].join('\n');
}

function getReportTemplatePeriod(templateType, selectedDateKey, serverDateKey) {
    const normalizedType = normalizeReportTemplateType(templateType);
    const selectedDate = parseDateValue(selectedDateKey) || parseDateValue(serverDateKey) || new Date();
    const serverDate = parseDateValue(serverDateKey) || new Date();
    const clampedDate = selectedDate > serverDate ? serverDate : selectedDate;

    let startDate = new Date(clampedDate);
    let endDate = new Date(clampedDate);

    if (normalizedType === 'weekly') {
        startDate = new Date(clampedDate.getFullYear(), clampedDate.getMonth(), clampedDate.getDate());
        startDate.setDate(startDate.getDate() - startDate.getDay());
        endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        endDate.setDate(endDate.getDate() + 6);
    } else if (normalizedType === 'monthly') {
        startDate = new Date(clampedDate.getFullYear(), clampedDate.getMonth(), 1);
        endDate = new Date(clampedDate.getFullYear(), clampedDate.getMonth() + 1, 0);
    }

    if (endDate > serverDate) {
        endDate = serverDate;
    }

    return {
        anchorDate: clampedDate,
        startDate,
        endDate,
        dateFrom: toDateInputValue(startDate),
        dateTo: toDateInputValue(endDate)
    };
}

function buildReportTemplateData({
    templateType = 'daily',
    period = null,
    salesRows = [],
    expenseSummary = {},
    cashIncomeSummary = {},
    pendingItems = [],
    attendanceRows = []
} = {}) {
    const branches = createReportTemplateBranchMetrics();
    const orders = buildReportOrderSummaries(salesRows);

    orders.forEach((order) => {
        const branchKey = normalizeReportBranch(order.branch);
        if (!branchKey || !branches[branchKey]) {
            return;
        }

        branches[branchKey].sales += Number(order.orderTotal || 0);
        branches[branchKey].overpayment += Number(order.overpaymentAmount || 0);
        branches[branchKey].lbcCollection += Number(order.lbcCollectionAmount || 0);
        branches[branchKey].clientKeys.add(buildReportClientLookup(order));
    });

    REPORT_TEMPLATE_BRANCHES.forEach((branchLabel) => {
        const branchKey = normalizeReportBranch(branchLabel);
        if (!branchKey || !branches[branchKey]) {
            return;
        }

        branches[branchKey].expenses = Number(expenseSummary?.byBranch?.[branchLabel] || 0);
        branches[branchKey].cashIncome = Number(cashIncomeSummary?.byBranch?.[branchLabel] || 0);
        branches[branchKey].netCashRemaining = branches[branchKey].cashIncome - branches[branchKey].expenses;
    });

    (pendingItems || []).forEach((item) => {
        const branchKey = normalizeReportBranch(item?.branch || item?.cashBranch || '');
        if (!branchKey || !branches[branchKey]) {
            return;
        }

        branches[branchKey].pendingPayments += Math.max(0, Number(item?.remainingAmount || 0));
    });

    const finalizedBranches = Object.fromEntries(
        Object.entries(branches).map(([branchKey, metrics]) => [branchKey, finalizeReportBranchMetrics(metrics)])
    );
    const totals = finalizeReportBranchMetrics({
        label: 'Total Both Branch',
        sales: Object.values(branches).reduce((sum, metrics) => sum + Number(metrics.sales || 0), 0),
        expenses: Object.values(branches).reduce((sum, metrics) => sum + Number(metrics.expenses || 0), 0),
        cashIncome: Object.values(branches).reduce((sum, metrics) => sum + Number(metrics.cashIncome || 0), 0),
        netCashRemaining: Object.values(branches).reduce((sum, metrics) => sum + Number(metrics.netCashRemaining || 0), 0),
        overpayment: Object.values(branches).reduce((sum, metrics) => sum + Number(metrics.overpayment || 0), 0),
        pendingPayments: Object.values(branches).reduce((sum, metrics) => sum + Number(metrics.pendingPayments || 0), 0),
        lbcCollection: Object.values(branches).reduce((sum, metrics) => sum + Number(metrics.lbcCollection || 0), 0),
        clientKeys: {
            size: Object.values(branches).reduce((sum, metrics) => sum + Number(metrics.clientKeys?.size || 0), 0)
        }
    });

    return {
        preparedBy: String(state.session?.userName || '').trim(),
        periodLabel: buildReportTemplatePeriodLabel(templateType, period),
        branches: finalizedBranches,
        totals,
        attendance: summarizeAttendanceRows(attendanceRows, templateType)
    };
}

function createReportTemplateBranchMetrics() {
    return REPORT_TEMPLATE_BRANCHES.reduce((metrics, branchLabel) => {
        const key = normalizeReportBranch(branchLabel);
        metrics[key] = {
            label: branchLabel,
            sales: 0,
            expenses: 0,
            cashIncome: 0,
            netCashRemaining: 0,
            overpayment: 0,
            pendingPayments: 0,
            lbcCollection: 0,
            clientKeys: new Set()
        };
        return metrics;
    }, {});
}

function buildReportOrderSummaries(rows = []) {
    const groups = new Map();

    rows.forEach((row, index) => {
        const key = buildOrderKey(row, index);
        const existing = groups.get(key);

        if (!existing) {
            groups.set(key, {
                key,
                firstSeen: index,
                header: row,
                lines: [row],
                subtotalSum: Number(row.line_subtotal || 0)
            });
            return;
        }

        existing.lines.push(row);
        existing.subtotalSum += Number(row.line_subtotal || 0);
        if (shouldReplaceHeader(row, existing.header)) {
            existing.header = row;
        }
    });

    return Array.from(groups.values())
        .map((group) => finalizeReportOrderSummary(group))
        .sort(compareOrders);
}

function finalizeReportOrderSummary(group) {
    const header = group.header || {};
    const orderTotal = resolveInvoiceOrderTotal(header, group.lines, group.subtotalSum);
    const amountPaid = Math.max(0, Number(header.payment_amount ?? header.paymentAmount ?? 0));
    const underpaymentAmount = Math.max(0, Number(header.underpayment_amount ?? header.underpaymentAmount ?? 0));
    const collectionAmount = Math.max(0, Number(header.collection_amount ?? header.collectionAmount ?? 0));
    const overpaymentAmount = Math.max(0, Number(header.overpayment_amount ?? header.overpaymentAmount ?? 0));

    return {
        key: group.key,
        branch: header.branch || header.cash_branch || header.cashBranch || '',
        clientName: String(header.client_name || header.clientName || '').trim(),
        orderTotal,
        amountPaid,
        overpaymentAmount,
        lbcCollectionAmount: resolveLbcCollectionAmount({
            courier: header.courier || '',
            orderTotal,
            amountPaid,
            underpaymentAmount,
            collectionAmount
        })
    };
}

function resolveLbcCollectionAmount({
    courier = '',
    orderTotal = 0,
    amountPaid = 0,
    underpaymentAmount = 0,
    collectionAmount = 0
} = {}) {
    if (String(courier || '').trim().toUpperCase() !== 'LBC') {
        return 0;
    }

    return Math.max(
        0,
        Number(collectionAmount || 0),
        Number(underpaymentAmount || 0),
        Number(orderTotal || 0) - Number(amountPaid || 0)
    );
}

function buildReportClientLookup(order = {}) {
    const name = normalizeNameLookup(order.clientName);
    return name || `order:${String(order.key || '').trim()}`;
}

function finalizeReportBranchMetrics(metrics = {}) {
    const clientCount = Number(metrics.clientKeys?.size || 0);
    return {
        label: String(metrics.label || '').trim(),
        sales: Number(metrics.sales || 0),
        expenses: Number(metrics.expenses || 0),
        cashIncome: Number(metrics.cashIncome || 0),
        netCashRemaining: Number(metrics.netCashRemaining || 0),
        overpayment: Number(metrics.overpayment || 0),
        pendingPayments: Number(metrics.pendingPayments || 0),
        lbcCollection: Number(metrics.lbcCollection || 0),
        clientCount,
        salesDisplay: formatReportMoney(metrics.sales || 0),
        expensesDisplay: formatReportMoney(metrics.expenses || 0),
        cashIncomeDisplay: formatReportMoney(metrics.cashIncome || 0),
        netCashRemainingDisplay: formatReportMoney(metrics.netCashRemaining || 0),
        overpaymentDisplay: formatReportMoney(metrics.overpayment || 0),
        pendingPaymentsDisplay: formatReportMoney(metrics.pendingPayments || 0),
        lbcCollectionDisplay: formatReportMoney(metrics.lbcCollection || 0),
        clientCountDisplay: formatCount(clientCount)
    };
}

function summarizeAttendanceRows(rows = [], templateType = 'daily') {
    const normalizedType = normalizeReportTemplateType(templateType);
    const useOccurrenceCounts = normalizedType === 'weekly' || normalizedType === 'monthly';
    const absentCounts = new Map();
    const lateCounts = new Map();
    const excuseCounts = new Map();
    const suspendedCounts = new Map();
    let attendanceCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    let excuseCount = 0;
    let suspendedCount = 0;

    (rows || []).forEach((row) => {
        const name = String(row?.name || '').trim();
        if (!name) {
            return;
        }

        const normalizedStatus = normalizeAttendanceStatus(row?.status);
        if (normalizedStatus === 'absent') {
            absentCount += 1;
            incrementNamedCount(absentCounts, name);
            return;
        }
        if (normalizedStatus === 'late') {
            attendanceCount += 1;
            lateCount += 1;
            incrementNamedCount(lateCounts, name);
            return;
        }
        if (normalizedStatus === 'excuse') {
            excuseCount += 1;
            incrementNamedCount(excuseCounts, name);
            return;
        }
        if (normalizedStatus === 'suspended') {
            suspendedCount += 1;
            incrementNamedCount(suspendedCounts, name);
            return;
        }
        if (normalizedStatus === 'present' || normalizedStatus === 'on time') {
            attendanceCount += 1;
        }
    });

    return {
        attendanceCount,
        absentCount,
        lateCount,
        excuseCount,
        suspendedCount,
        attendanceCountDisplay: formatCount(attendanceCount),
        absentCountDisplay: formatCount(absentCount),
        lateCountDisplay: formatCount(lateCount),
        excuseCountDisplay: formatCount(excuseCount),
        suspendedCountDisplay: formatCount(suspendedCount),
        absentNames: formatAttendanceNameList(absentCounts, { useOccurrenceCounts }),
        lateNames: formatAttendanceNameList(lateCounts, { useOccurrenceCounts }),
        excuseNames: formatAttendanceNameList(excuseCounts, { useOccurrenceCounts }),
        suspendedNames: formatAttendanceNameList(suspendedCounts, { useOccurrenceCounts })
    };
}

function buildReportTemplateText(templateType = 'daily', reportData = null) {
    if (!reportData) {
        return buildReportTemplateSkeleton(templateType);
    }

    const heading = getReportTemplateHeading(templateType);
    const periodLabel = getReportTemplatePeriodLineLabel(templateType);
    const cubao = reportData.branches?.cubao || finalizeReportBranchMetrics({ label: 'Cubao', clientKeys: new Set() });
    const pampanga = reportData.branches?.pampanga || finalizeReportBranchMetrics({ label: 'Pampanga', clientKeys: new Set() });
    const totals = reportData.totals || finalizeReportBranchMetrics({ label: 'Total Both Branch', clientKeys: { size: 0 } });
    const attendance = reportData.attendance || summarizeAttendanceRows([]);
    const remarkLines = buildReportRemarkLines(reportData, templateType);

    return [
        heading,
        '',
        `${periodLabel}: ${reportData.periodLabel || ''}`,
        `👤 Prepared by: ${reportData.preparedBy || ''}`,
        '',
        '💼 SALES / FINANCE',
        '',
        ...buildReportTemplateBranchLines('📍 CUBAO', cubao),
        '',
        ...buildReportTemplateBranchLines('📍 PAMPANGA', pampanga),
        '',
        '📊 TOTAL BOTH BRANCH',
        `💰 Total Sales: ${totals.salesDisplay}`,
        `💸 Total Expenses: ${totals.expensesDisplay}`,
        `💵 Total Cash Income: ${totals.cashIncomeDisplay}`,
        `🏦 Total Net Cash Remaining: ${totals.netCashRemainingDisplay}`,
        `🪙 Total Overpayment: ${totals.overpaymentDisplay}`,
        `⏳ Total Pending Payments: ${totals.pendingPaymentsDisplay}`,
        `📦 Total LBC Collection: ${totals.lbcCollectionDisplay}`,
        `👥 Total Client: ${totals.clientCountDisplay}`,
        '',
        '🧑‍💼 ATTENDANCE',
        `✅ Attendance: ${attendance.attendanceCountDisplay}`,
        `❌ Absent: ${attendance.absentCountDisplay}`,
        'Names of Absent:',
        ...formatReportNameLines(attendance.absentNames),
        '',
        `⏰ Late: ${attendance.lateCountDisplay}`,
        'Names of Late:',
        ...formatReportNameLines(attendance.lateNames),
        '',
        `📝 Excuse: ${attendance.excuseCountDisplay}`,
        'Names of Excuse:',
        ...formatReportNameLines(attendance.excuseNames),
        '',
        `⛔ Suspended: ${attendance.suspendedCountDisplay}`,
        'Names of Suspended:',
        ...formatReportNameLines(attendance.suspendedNames),
        '',
        '🗒️ Remarks:',
        ...remarkLines
    ].join('\n');
}

function buildReportTemplateBranchLines(label, metrics = {}) {
    return [
        label,
        `💰 Sales: ${metrics.salesDisplay || formatReportMoney(0)}`,
        `💸 Expenses: ${metrics.expensesDisplay || formatReportMoney(0)}`,
        `💵 Cash Income: ${metrics.cashIncomeDisplay || formatReportMoney(0)}`,
        `🏦 Net Cash Remaining: ${metrics.netCashRemainingDisplay || formatReportMoney(0)}`,
        `🪙 Overpayment: ${metrics.overpaymentDisplay || formatReportMoney(0)}`,
        `⏳ Pending Payments: ${metrics.pendingPaymentsDisplay || formatReportMoney(0)}`,
        `📦 LBC Collection: ${metrics.lbcCollectionDisplay || formatReportMoney(0)}`,
        `👥 Client: ${metrics.clientCountDisplay || '0'}`
    ];
}

function buildReportTemplatePeriodLabel(templateType, period = null) {
    if (!period) {
        return '';
    }

    const normalizedType = normalizeReportTemplateType(templateType);
    if (normalizedType === 'weekly') {
        return `${formatDateLabel(period.dateFrom)} - ${formatDateLabel(period.dateTo)}`;
    }
    if (normalizedType === 'monthly') {
        return formatMonthLabel(period.anchorDate);
    }
    return formatDateLabel(period.dateFrom);
}

function buildReportRemarkLines(reportData = null, templateType = 'daily') {
    if (!reportData) {
        return ['- No remarks available.'];
    }

    const cubao = reportData.branches?.cubao || null;
    const pampanga = reportData.branches?.pampanga || null;
    const totals = reportData.totals || null;
    const attendance = reportData.attendance || {};
    const normalizedType = normalizeReportTemplateType(templateType);
    const periodPhrase = normalizedType === 'weekly'
        ? 'this week'
        : normalizedType === 'monthly'
            ? 'this month'
            : 'today';
    const lines = [];

    if (cubao && pampanga) {
        if (Number(cubao.sales || 0) > Number(pampanga.sales || 0)) {
            lines.push(`- Cubao led sales ${periodPhrase} at ${cubao.salesDisplay}.`);
        } else if (Number(pampanga.sales || 0) > Number(cubao.sales || 0)) {
            lines.push(`- Pampanga led sales ${periodPhrase} at ${pampanga.salesDisplay}.`);
        } else {
            lines.push(`- Cubao and Pampanga posted the same sales ${periodPhrase} at ${cubao.salesDisplay}.`);
        }
    }

    if (totals && Number(totals.pendingPayments || 0) > 0) {
        lines.push(`- Pending payments reached ${totals.pendingPaymentsDisplay} and need follow-up.`);
    }

    if (totals && Number(totals.lbcCollection || 0) > 0) {
        lines.push(`- LBC collection total for ${periodPhrase} is ${totals.lbcCollectionDisplay}.`);
    }

    const attendanceAlerts = [];
    if (Number(attendance.absentCount || 0) > 0) {
        attendanceAlerts.push(`${attendance.absentCountDisplay} absent`);
    }
    if (Number(attendance.lateCount || 0) > 0) {
        attendanceAlerts.push(`${attendance.lateCountDisplay} late`);
    }
    if (Number(attendance.excuseCount || 0) > 0) {
        attendanceAlerts.push(`${attendance.excuseCountDisplay} excuse`);
    }
    if (Number(attendance.suspendedCount || 0) > 0) {
        attendanceAlerts.push(`${attendance.suspendedCountDisplay} suspended`);
    }

    if (attendanceAlerts.length) {
        lines.push(`- Attendance watch ${periodPhrase}: ${attendanceAlerts.join(', ')}.`);
    } else if (Number(attendance.attendanceCount || 0) > 0) {
        lines.push(`- Attendance stayed clean ${periodPhrase} with ${attendance.attendanceCountDisplay} recorded present/on-time entries.`);
    }

    if (!lines.length) {
        lines.push(`- No major remarks for ${periodPhrase}.`);
    }

    return lines;
}

function filterAttendanceRowsByPeriod(rows = [], period = null) {
    if (!period?.dateFrom || !period?.dateTo) {
        return Array.isArray(rows) ? rows : [];
    }

    return (rows || []).filter((row) => {
        const dateKey = String(row?.dateKey || row?.date || '').trim();
        return dateKey && dateKey >= period.dateFrom && dateKey <= period.dateTo;
    });
}

function normalizeReportBranch(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'cubao') {
        return 'cubao';
    }
    if (normalized === 'pampanga') {
        return 'pampanga';
    }
    return '';
}

function normalizeAttendanceStatus(value = '') {
    return String(value || '').trim().toLowerCase();
}

function normalizeNameLookup(value = '') {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function incrementNamedCount(map, name) {
    const safeName = String(name || '').trim();
    if (!safeName) {
        return;
    }

    map.set(safeName, Number(map.get(safeName) || 0) + 1);
}

function formatAttendanceNameList(countMap = new Map(), { useOccurrenceCounts = false } = {}) {
    return Array.from(countMap.entries())
        .sort((left, right) => {
            if (right[1] !== left[1]) {
                return right[1] - left[1];
            }
            return left[0].localeCompare(right[0]);
        })
        .map(([name, count]) => useOccurrenceCounts ? `- ${name} - ${count}` : `- ${name}`);
}

function formatReportNameLines(names = []) {
    return names.length ? names : ['- None'];
}

function formatReportMoney(value) {
    return Number(value || 0).toLocaleString('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatCount(value) {
    return Number(value || 0).toLocaleString('en-PH');
}

function formatMonthLabel(value) {
    const date = value instanceof Date ? value : parseDateValue(value);
    if (!date) {
        return '';
    }

    return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric'
    }).format(date);
}

function clampDateKey(value = '', fallback = '') {
    const selectedDate = parseDateValue(value) || parseDateValue(fallback) || new Date();
    const serverDate = parseDateValue(fallback) || new Date();
    const clamped = selectedDate > serverDate ? serverDate : selectedDate;
    return toDateInputValue(clamped);
}

function capitalizeLabel(value = '') {
    const text = String(value || '').trim();
    return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : '';
}

async function copyInvoiceSummary() {
    const text = String(state.lastText || '').trim();
    if (!text) {
        setStatus('Nothing to copy yet.', true);
        return;
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(state.lastText);
        } else {
            copyTextFallback(state.lastText, invoicePreview);
        }
        setStatus('Invoice summary copied to clipboard.', false);
    } catch (error) {
        console.error('Unable to copy invoice summary:', error);
        setStatus('Copy failed. You can still copy the preview manually.', true);
    }
}

async function copyDiscrepancyList() {
    const text = String(state.lastDiscrepancyText || '').trim();
    if (!text) {
        setStatus('Nothing to copy yet.', true);
        return;
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(state.lastDiscrepancyText);
        } else {
            copyTextFallback(state.lastDiscrepancyText, discrepancyPreview);
        }
        setStatus('Discrepancy list copied to clipboard.', false);
    } catch (error) {
        console.error('Unable to copy discrepancy list:', error);
        setStatus('Copy failed. You can still copy the discrepancy preview manually.', true);
    }
}

async function copyReportTemplate() {
    const text = String(state.lastReportTemplateText || '').trim();
    if (!text) {
        setStatus('Nothing to copy yet.', true);
        return;
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(state.lastReportTemplateText);
        } else {
            copyTextFallback(state.lastReportTemplateText, reportTemplatePreview);
        }

        const label = normalizeReportTemplateType(reportTemplateType?.value);
        setStatus(`${label.charAt(0).toUpperCase()}${label.slice(1)} report template copied to clipboard.`, false);
    } catch (error) {
        console.error('Unable to copy report template:', error);
        setStatus('Copy failed. You can still copy the report template manually.', true);
    }
}

function copyTextFallback(text, target) {
    const textarea = target || invoicePreview;
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    document.execCommand('copy');
}

function formatDateLabel(value) {
    const date = parseDateValue(value);
    if (!date) {
        return 'No Date';
    }

    return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: '2-digit',
        year: 'numeric'
    }).format(date);
}

function parseDateValue(value) {
    const text = String(value || '').trim();
    if (!text) {
        return null;
    }

    const parts = text.split('-').map((part) => Number(part));
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
        return null;
    }

    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatPesoWhole(value) {
    return Number(value || 0).toLocaleString('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

function toDateInputValue(value) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function setStatus(message, isError) {
    invoiceStatus.textContent = message;
    invoiceStatus.classList.toggle('error', Boolean(isError));
}
