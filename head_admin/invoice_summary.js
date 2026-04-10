const appClient = window.appClient;

const invoiceDateInput = document.getElementById('invoiceDateInput');
const invoiceBranchFilter = document.getElementById('invoiceBranchFilter');
const invoiceTitleInput = document.getElementById('invoiceTitleInput');
const generateInvoiceBtn = document.getElementById('generateInvoiceBtn');
const copyInvoiceBtn = document.getElementById('copyInvoiceBtn');
const copyDiscrepancyBtn = document.getElementById('copyDiscrepancyBtn');
const invoiceStatus = document.getElementById('invoiceStatus');
const invoicePreview = document.getElementById('invoicePreview');
const invoiceClientsValue = document.getElementById('invoiceClientsValue');
const invoiceSalesValue = document.getElementById('invoiceSalesValue');
const invoiceBranchList = document.getElementById('invoiceBranchList');
const discrepancyCountValue = document.getElementById('discrepancyCountValue');
const discrepancyDifferenceValue = document.getElementById('discrepancyDifferenceValue');
const discrepancyInvoiceValue = document.getElementById('discrepancyInvoiceValue');
const discrepancyReportValue = document.getElementById('discrepancyReportValue');
const discrepancyPreview = document.getElementById('discrepancyPreview');
const discrepancyList = document.getElementById('discrepancyList');

const state = {
    branches: ['Cubao', 'Pampanga'],
    lastText: '',
    lastOrders: [],
    lastDiscrepancyText: '',
    lastDiscrepancies: [],
    session: null
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    state.session = session;
    if (!isGmsInvoiceCompany(session)) {
        lockInvoiceSummaryForNonGms();
        return;
    }

    invoiceDateInput.value = toDateInputValue(new Date());
    bindEvents();
    await loadReferenceData();
    await generateInvoiceSummary();
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
    setStatus('Invoice Summary is restricted to GMS company only.', true);
}

function bindEvents() {
    generateInvoiceBtn?.addEventListener('click', generateInvoiceSummary);
    copyInvoiceBtn?.addEventListener('click', copyInvoiceSummary);
    copyDiscrepancyBtn?.addEventListener('click', copyDiscrepancyList);
    invoiceDateInput?.addEventListener('change', generateInvoiceSummary);
    invoiceBranchFilter?.addEventListener('change', generateInvoiceSummary);
    invoiceTitleInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            generateInvoiceSummary();
        }
    });
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
