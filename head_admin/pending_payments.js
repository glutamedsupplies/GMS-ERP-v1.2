const appClient = window.appClient;

const periodFilter = document.getElementById('periodFilter');
const dateFromFilter = document.getElementById('dateFromFilter');
const dateToFilter = document.getElementById('dateToFilter');
const adminFilter = document.getElementById('adminFilter');
const applyFiltersBtn = document.getElementById('applyFiltersBtn');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const activeDateLabel = document.getElementById('activeDateLabel');
const panelStatus = document.getElementById('panelStatus');
const adminSummaryMeta = document.getElementById('adminSummaryMeta');
const adminSummaryBody = document.getElementById('adminSummaryBody');
const pendingListMeta = document.getElementById('pendingListMeta');
const pendingListBody = document.getElementById('pendingListBody');

const PAGE_SIZE = 2500;

const state = {
    syncingPeriod: false
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    bindEvents();
    await loadReferenceData();
    applyPeriodPreset(periodFilter.value || 'this_month', { load: false });
    await loadPendingPayments();
}

function bindEvents() {
    periodFilter?.addEventListener('change', () => applyPeriodPreset(periodFilter.value || 'this_month'));
    applyFiltersBtn?.addEventListener('click', loadPendingPayments);
    resetFiltersBtn?.addEventListener('click', resetFilters);
    pendingListBody?.addEventListener('click', handlePendingListClick);

    [dateFromFilter, dateToFilter].forEach((input) => {
        input?.addEventListener('change', () => {
            if (!state.syncingPeriod) {
                periodFilter.value = 'custom';
            }
        });
    });
}

async function loadReferenceData() {
    try {
        const references = await appClient.getSalesReferences();
        const adminOptions = Array.isArray(references?.admins) ? references.admins : [];
        populateSelect(adminFilter, adminOptions, true, 'All Admins');
        setPanelStatus('Reference data loaded.', false);
    } catch (error) {
        console.error('Failed to load pending payment references:', error);
        setPanelStatus(error.message || 'Unable to load reference data.', true);
    }
}

async function loadPendingPayments() {
    setPanelStatus('Loading pending payments...', false);

    try {
        const [salesPayload, cashIncomePayload] = await Promise.all([
            appClient.listSales({
                dateFrom: dateFromFilter.value,
                dateTo: dateToFilter.value,
                adminName: adminFilter.value,
                search: '',
                limit: PAGE_SIZE,
                offset: 0
            }),
            appClient.listCashIncome({
                dateFrom: dateFromFilter.value,
                dateTo: dateToFilter.value,
                search: ''
            })
        ]);

        const salesRows = Array.isArray(salesPayload?.items) ? salesPayload.items : [];
        const cashIncomeRows = Array.isArray(cashIncomePayload?.items) ? cashIncomePayload.items : [];
        const confirmedCashIncomeMap = buildConfirmedCashIncomeMap(cashIncomeRows, salesRows);
        const pendingItems = buildPendingItems(salesRows, confirmedCashIncomeMap);

        renderAdminSummary(pendingItems);
        renderPendingList(pendingItems);
        renderPendingMeta(pendingItems);
        activeDateLabel.textContent = buildActiveDateLabel();

        if (salesRows.length >= PAGE_SIZE) {
            setPanelStatus(`Loaded ${pendingItems.length} pending receipt(s) from the first ${PAGE_SIZE} sales rows. Refine the date range if older orders are missing.`, false);
            return;
        }

        setPanelStatus(`Loaded ${pendingItems.length} pending receipt(s).`, false);
    } catch (error) {
        console.error('Failed to load pending payments:', error);
        renderAdminSummary([]);
        renderPendingList([]);
        renderPendingMeta([]);
        activeDateLabel.textContent = buildActiveDateLabel();
        setPanelStatus(error.message || 'Unable to load pending payments.', true);
    }
}

function renderAdminSummary(items) {
    if (!adminSummaryBody) {
        return;
    }

    const summaries = buildAdminSummaries(items);
    if (adminSummaryMeta) {
        adminSummaryMeta.textContent = summaries.length
            ? `${summaries.length} admin(s) with pending receipts in the current filters. Cubao and Pampanga are separated below.`
            : 'No admin pending totals found for the selected filters.';
    }

    if (!summaries.length) {
        adminSummaryBody.innerHTML = '<div class="empty">No admin pending totals found.</div>';
        return;
    }

    adminSummaryBody.innerHTML = summaries.map((summary) => `
        <article class="admin-summary-card">
            <div class="admin-summary-head">
                <div>
                    <p class="eyebrow">Admin</p>
                    <h3>${appClient.escapeHtml(summary.adminName)}</h3>
                    <p class="admin-summary-copy">${appClient.escapeHtml(formatPendingCount(summary.totalCount))} | ${appClient.escapeHtml(formatMoney(summary.totalBalance))} remaining</p>
                </div>
            </div>

            <div class="admin-branch-grid">
                <div class="admin-branch-card">
                    <span>Cubao</span>
                    <strong>${appClient.escapeHtml(formatPendingCount(summary.cubao.count))}</strong>
                    <p>${appClient.escapeHtml(formatMoney(summary.cubao.balance))} remaining</p>
                </div>
                <div class="admin-branch-card">
                    <span>Pampanga</span>
                    <strong>${appClient.escapeHtml(formatPendingCount(summary.pampanga.count))}</strong>
                    <p>${appClient.escapeHtml(formatMoney(summary.pampanga.balance))} remaining</p>
                </div>
            </div>

            <div class="admin-summary-footer">
                <span>Total</span>
                <strong>${appClient.escapeHtml(formatPendingCount(summary.totalCount))} | ${appClient.escapeHtml(formatMoney(summary.totalBalance))}</strong>
            </div>
        </article>
    `).join('');
}

function renderPendingMeta(items) {
    if (!pendingListMeta) {
        return;
    }

    const unpaidCount = items.filter((item) => item.statusKey === 'unpaid').length;
    const partialCount = items.filter((item) => item.statusKey === 'partial').length;
    const balanceTotal = items.reduce((sum, item) => sum + Number(item.remainingAmount || 0), 0);

    pendingListMeta.textContent = items.length
        ? `${items.length} receipt-style pending order(s). ${unpaidCount} unpaid, ${partialCount} partially paid, ${formatMoney(balanceTotal)} remaining total.`
        : 'No pending or partially paid non-LBC orders found for the selected filters.';
}

function buildAdminSummaries(items = []) {
    const grouped = new Map();

    items.forEach((item) => {
        const adminName = String(item?.adminName || '').trim() || 'Unassigned Admin';
        const branchKey = normalizeSummaryBranch(item?.branch);
        const remainingAmount = Math.max(0, Number(item?.remainingAmount || 0));
        const summary = grouped.get(adminName) || {
            adminName,
            totalCount: 0,
            totalBalance: 0,
            cubao: { count: 0, balance: 0 },
            pampanga: { count: 0, balance: 0 }
        };

        summary.totalCount += 1;
        summary.totalBalance += remainingAmount;

        if (branchKey === 'cubao') {
            summary.cubao.count += 1;
            summary.cubao.balance += remainingAmount;
        } else if (branchKey === 'pampanga') {
            summary.pampanga.count += 1;
            summary.pampanga.balance += remainingAmount;
        }

        grouped.set(adminName, summary);
    });

    return Array.from(grouped.values()).sort((left, right) => {
        if (right.totalCount !== left.totalCount) {
            return right.totalCount - left.totalCount;
        }
        if (right.totalBalance !== left.totalBalance) {
            return right.totalBalance - left.totalBalance;
        }
        return left.adminName.localeCompare(right.adminName);
    });
}

function normalizeSummaryBranch(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'cubao') {
        return 'cubao';
    }
    if (normalized === 'pampanga') {
        return 'pampanga';
    }
    return '';
}

function formatPendingCount(count = 0) {
    const normalized = Math.max(0, Number(count || 0));
    return `${normalized} pending`;
}

function buildPendingItems(rows, confirmedCashIncomeMap = new Map()) {
    const groupedRows = new Map();

    rows.forEach((row) => {
        const orderKey = getOrderKey(row);
        if (!orderKey) {
            return;
        }

        const currentRow = groupedRows.get(orderKey);
        groupedRows.set(orderKey, selectPreferredOrderRow(currentRow, row));
    });

    return Array.from(groupedRows.values())
        .map((row) => buildPendingItem(row))
        .filter(Boolean)
        .map((item) => applyConfirmedCashIncomeToPendingItem(item, confirmedCashIncomeMap))
        .filter((item) => Math.max(0, Number(item?.remainingAmount || 0)) > 0.009)
        .sort((left, right) => {
            if (String(right.saleDate || '') !== String(left.saleDate || '')) {
                return String(right.saleDate || '').localeCompare(String(left.saleDate || ''));
            }
            if (right.remainingAmount !== left.remainingAmount) {
                return right.remainingAmount - left.remainingAmount;
            }
            return String(left.clientName || '').localeCompare(String(right.clientName || ''));
        });
}

function buildConfirmedCashIncomeMap(rows = [], salesRows = []) {
    const lookupSet = buildPendingLookupSet(salesRows);
    const totals = new Map();
    if (!lookupSet.size) {
        return totals;
    }

    rows.forEach((row) => {
        if (!isCashIncomeSettlementCandidate(row)) {
            return;
        }

        const amount = Math.max(0, Number(row?.amount || 0));
        collectCashIncomeSettlementLookups(row, lookupSet).forEach((lookup) => {
            totals.set(lookup, Number(totals.get(lookup) || 0) + amount);
        });
    });

    return totals;
}

function buildPendingLookupSet(rows = []) {
    return new Set(
        (Array.isArray(rows) ? rows : [])
            .flatMap((row) => [row?.order_number, row?.receipt_number, row?.orderNumber, row?.receiptNumber])
            .map(normalizeLookupValue)
            .filter(Boolean)
    );
}

function isCashIncomeSettlementCandidate(row = {}) {
    const amount = Math.max(0, Number(row?.amount || 0));
    if (amount <= 0) {
        return false;
    }

    const status = normalizeCashIncomeStatus(row?.confirmation_status || row?.confirmationStatus);
    if (status !== 'Confirmed') {
        return false;
    }

    const isAutoGenerated = Number(row?.auto_generated || row?.autoGenerated || 0) === 1;
    if (!isAutoGenerated) {
        return true;
    }

    return getCashIncomeKind(row) === 'lalamove_cod';
}

function collectCashIncomeSettlementLookups(row = {}, lookupSet = new Set()) {
    const matches = new Set();
    [row?.linked_order_number, row?.linkedOrderNumber, row?.linked_receipt_number, row?.linkedReceiptNumber]
        .map(normalizeLookupValue)
        .filter(Boolean)
        .forEach((lookup) => {
            if (lookupSet.has(lookup)) {
                matches.add(lookup);
            }
        });

    const isAutoGenerated = Number(row?.auto_generated || row?.autoGenerated || 0) === 1;
    if (!isAutoGenerated) {
        const searchText = String([row?.about, row?.note].filter(Boolean).join(' | ')).trim().toLowerCase();
        if (searchText) {
            lookupSet.forEach((lookup) => {
                if (searchText.includes(String(lookup || '').toLowerCase())) {
                    matches.add(lookup);
                }
            });
        }
    }

    return Array.from(matches);
}

function isSettledViaConfirmedCashIncome(item, confirmedCashIncomeMap = new Map()) {
    const remainingAmount = Math.max(0, Number(item?.remainingAmount || 0));
    if (remainingAmount <= 0 || !confirmedCashIncomeMap.size) {
        return false;
    }

    const confirmedAmount = [item?.orderNumber, item?.receiptNumber]
        .map(normalizeLookupValue)
        .filter(Boolean)
        .reduce((maxAmount, lookup) => Math.max(maxAmount, Number(confirmedCashIncomeMap.get(lookup) || 0)), 0);

    return confirmedAmount + 0.009 >= remainingAmount;
}

function getConfirmedCashIncomeAmount(item, confirmedCashIncomeMap = new Map()) {
    if (!(confirmedCashIncomeMap instanceof Map) || !confirmedCashIncomeMap.size) {
        return 0;
    }

    return [item?.orderNumber, item?.receiptNumber]
        .map(normalizeLookupValue)
        .filter(Boolean)
        .reduce((maxAmount, lookup) => Math.max(maxAmount, Number(confirmedCashIncomeMap.get(lookup) || 0)), 0);
}

function applyConfirmedCashIncomeToPendingItem(item, confirmedCashIncomeMap = new Map()) {
    const confirmedAmount = getConfirmedCashIncomeAmount(item, confirmedCashIncomeMap);
    if (confirmedAmount <= 0) {
        return item;
    }

    const amountPaid = Math.max(0, Number(item?.amountPaid || item?.paymentAmount || 0)) + confirmedAmount;
    const orderTotal = Math.max(0, Number(item?.orderTotal || 0));
    const remainingAmount = Math.max(orderTotal - amountPaid, 0);

    return {
        ...item,
        paymentAmount: amountPaid,
        amountPaid,
        remainingAmount,
        statusKey: amountPaid <= 0 ? 'unpaid' : 'partial',
        statusLabel: amountPaid <= 0 ? 'Pending' : 'Partially Paid'
    };
}

function getOrderKey(row) {
    return String(row?.receipt_number || row?.order_number || row?.id || '').trim();
}

function selectPreferredOrderRow(currentRow, candidateRow) {
    if (!currentRow) {
        return candidateRow;
    }

    const currentIsHeader = Number(currentRow.line_index || 0) === 1 || Number(currentRow.order_total || 0) > 0 || Number(currentRow.base_total || 0) > 0;
    const candidateIsHeader = Number(candidateRow.line_index || 0) === 1 || Number(candidateRow.order_total || 0) > 0 || Number(candidateRow.base_total || 0) > 0;
    if (!currentIsHeader && candidateIsHeader) {
        return candidateRow;
    }
    if (currentIsHeader && !candidateIsHeader) {
        return currentRow;
    }

    const currentTotal = Number(currentRow.order_total || currentRow.base_total || 0);
    const candidateTotal = Number(candidateRow.order_total || candidateRow.base_total || 0);
    if (candidateTotal > currentTotal) {
        return candidateRow;
    }

    if (String(candidateRow.sale_date || '') > String(currentRow.sale_date || '')) {
        return candidateRow;
    }

    if (Number(candidateRow.id || 0) > Number(currentRow.id || 0)) {
        return candidateRow;
    }

    return currentRow;
}

function buildPendingItem(row) {
    if (isLbcLabel(row?.courier)) {
        return null;
    }

    const orderTotal = Math.max(0, Number(row?.order_total || row?.base_total || 0));
    const amountPaid = Math.max(0, Number(row?.payment_amount || 0));
    const remainingAmount = Math.max(orderTotal - amountPaid, Number(row?.underpayment_amount || 0), 0);
    if (remainingAmount <= 0) {
        return null;
    }

    return {
        saleDate: row?.sale_date || '',
        receiptNumber: row?.receipt_number || '',
        orderNumber: row?.order_number || '',
        clientName: row?.client_name || '',
        clientContact: row?.client_contact || '',
        clientAddress: row?.client_address || '',
        branch: row?.cash_branch || row?.branch || '',
        paymentMethod: buildPaymentModeText(row),
        amountPaid,
        orderTotal,
        remainingAmount,
        adminName: row?.admin_name || '',
        salesRepresentative: row?.sales_representative || '',
        note: row?.note || '',
        statusKey: amountPaid <= 0 ? 'unpaid' : 'partial',
        statusLabel: amountPaid <= 0 ? 'Pending' : 'Partially Paid'
    };
}

function buildPaymentModeText(row) {
    const breakdown = parsePaymentMethodBreakdown(row?.payment_method_breakdown);
    if (breakdown.length) {
        return breakdown.map((entry) => {
            if (Number(entry.amount || 0) > 0) {
                return `${entry.method} (${formatMoney(entry.amount)})`;
            }
            return entry.method;
        }).join(' + ');
    }

    const labels = splitPaymentMethodLabels(row?.payment_method || row?.payment_option || row?.report_payment_label || '');
    return labels.filter((label) => !isLbcLabel(label)).join(' + ') || 'Unspecified';
}

function parsePaymentMethodBreakdown(rawValue) {
    if (!rawValue) {
        return [];
    }

    try {
        const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((entry) => ({
                method: String(entry?.method || entry?.value || entry?.paymentMethod || entry?.label || '').trim(),
                amount: Math.max(0, Number(entry?.amount || 0))
            }))
            .filter((entry) => entry.method && !isLbcLabel(entry.method));
    } catch (_error) {
        return [];
    }
}

function splitPaymentMethodLabels(value = '') {
    return String(value || '')
        .split(/(?:\r?\n|,|\+)/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function normalizeCashIncomeStatus(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'pending') {
        return 'Pending';
    }
    if (normalized === 'cancelled') {
        return 'Cancelled';
    }
    return 'Confirmed';
}

function getCashIncomeKind(row = {}) {
    const explicitKind = normalizeCashIncomeKind(row?.income_kind || row?.incomeKind);
    if (explicitKind) {
        return explicitKind;
    }

    const about = String(row?.about || '').trim().toUpperCase();
    if (about.startsWith('SALES CASH/')) {
        return 'sales_cash';
    }
    if (about.startsWith('LALAMOVE CASH/')) {
        return 'lalamove_cash';
    }
    if (about.startsWith('LALAMOVE COD/') || about.startsWith('LALAMOVE/')) {
        return 'lalamove_cod';
    }
    if (about.startsWith('LBC/')) {
        return 'lbc_collection';
    }

    return '';
}

function normalizeCashIncomeKind(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
        return '';
    }

    if (normalized === 'sales_cash') {
        return 'sales_cash';
    }
    if (normalized === 'lalamove_cash') {
        return 'lalamove_cash';
    }
    if (normalized === 'lalamove_cod') {
        return 'lalamove_cod';
    }
    if (normalized === 'lbc_collection') {
        return 'lbc_collection';
    }

    return '';
}

function normalizeLookupValue(value = '') {
    return String(value || '').trim().toLowerCase();
}

function renderPendingList(items) {
    if (!pendingListBody) {
        return;
    }

    if (!items.length) {
        pendingListBody.innerHTML = '<div class="empty">No pending or partially paid non-LBC orders found.</div>';
        return;
    }

    pendingListBody.innerHTML = items.map((item) => {
        const orderLookup = String(item.orderNumber || item.receiptNumber || '').trim();
        const orderLabel = item.receiptNumber && item.orderNumber && item.receiptNumber !== item.orderNumber
            ? `${item.receiptNumber} / ${item.orderNumber}`
            : (item.receiptNumber || item.orderNumber || '-');
        const customerMeta = [item.clientContact, item.clientAddress].filter(Boolean).join(' | ');
        const ownerMeta = [item.adminName || 'No admin', item.salesRepresentative || 'No sales rep'].join(' | ');

        return `
            <article class="pending-card">
                <div class="pending-head">
                    <div>
                        <p class="eyebrow">Customer</p>
                        <h3>${appClient.escapeHtml(item.clientName || 'Unnamed Customer')}</h3>
                        <p class="pending-subtitle">${appClient.escapeHtml(customerMeta || 'No contact or address recorded.')}</p>
                    </div>
                    <span class="status-badge is-${appClient.escapeHtml(item.statusKey || 'partial')}">${appClient.escapeHtml(item.statusLabel || 'Partially Paid')}</span>
                </div>

                <div class="pending-grid">
                    <div class="pending-field">
                        <span>Receipt / Order</span>
                        <strong>${appClient.escapeHtml(orderLabel)}</strong>
                        <p>${appClient.escapeHtml(formatDate(item.saleDate))}</p>
                    </div>
                    <div class="pending-field">
                        <span>Branch</span>
                        <strong>${appClient.escapeHtml(item.branch || '-')}</strong>
                        <p>${appClient.escapeHtml(item.paymentMethod || 'Unspecified')}</p>
                    </div>
                    <div class="pending-field">
                        <span>Exact Paid</span>
                        <strong>${appClient.escapeHtml(formatMoney(item.amountPaid || 0))}</strong>
                        <p>Confirmed paid amount</p>
                    </div>
                    <div class="pending-field balance">
                        <span>Remaining</span>
                        <strong>${appClient.escapeHtml(formatMoney(item.remainingAmount || 0))}</strong>
                        <p>Total due: ${appClient.escapeHtml(formatMoney(item.orderTotal || 0))}</p>
                    </div>
                </div>

                ${item.note ? `
                    <div class="pending-note">
                        <span>Note</span>
                        <p>${appClient.escapeHtml(item.note)}</p>
                    </div>
                ` : ''}

                <div class="pending-foot">
                    <div class="pending-meta">${appClient.escapeHtml(ownerMeta)}</div>
                    <button
                        type="button"
                        class="ghost-btn"
                        data-open-order="${appClient.escapeHtml(orderLookup)}"
                        ${orderLookup ? '' : 'disabled'}
                    >
                        Edit
                    </button>
                </div>
            </article>
        `;
    }).join('');
}

function handlePendingListClick(event) {
    const button = event.target.closest('[data-open-order]');
    if (!button || button.disabled) {
        return;
    }

    const orderNumber = String(button.dataset.openOrder || '').trim();
    if (!orderNumber) {
        return;
    }

    if (window.parent && window.parent !== window) {
        window.parent.postMessage({
            type: 'open-order-form',
            orderNumber
        }, window.location.origin);
        return;
    }

    window.location.href = `order_form.html?orderNumber=${encodeURIComponent(orderNumber)}`;
}

function populateSelect(select, values, includeBlank = false, blankLabel = 'Select option') {
    if (!select) {
        return;
    }

    select.innerHTML = '';

    if (includeBlank) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = blankLabel;
        select.appendChild(option);
    }

    values.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
}

function isLbcLabel(value) {
    return String(value || '').trim().toUpperCase().includes('LBC');
}

function resetFilters() {
    applyPeriodPreset('this_month', { load: false });
    adminFilter.value = '';
    loadPendingPayments();
}

function applyPeriodPreset(period, { load = true } = {}) {
    const today = new Date();
    state.syncingPeriod = true;

    if (period === 'all') {
        dateFromFilter.value = '';
        dateToFilter.value = '';
    } else if (period === 'this_month') {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        dateFromFilter.value = formatDateInput(start);
        dateToFilter.value = formatDateInput(end);
    } else if (period === 'this_week') {
        const start = new Date(today);
        const day = (start.getDay() + 6) % 7;
        start.setDate(start.getDate() - day);
        dateFromFilter.value = formatDateInput(start);
        dateToFilter.value = formatDateInput(today);
    }

    state.syncingPeriod = false;

    if (load) {
        loadPendingPayments();
    }
}

function buildActiveDateLabel() {
    if (!dateFromFilter.value && !dateToFilter.value) {
        return 'All Dates';
    }
    if (dateFromFilter.value && dateToFilter.value) {
        return `${formatDate(dateFromFilter.value)} to ${formatDate(dateToFilter.value)}`;
    }
    if (dateFromFilter.value) {
        return `From ${formatDate(dateFromFilter.value)}`;
    }
    return `Until ${formatDate(dateToFilter.value)}`;
}

function formatDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString('en-PH', {
        style: 'currency',
        currency: 'PHP'
    });
}

function formatDate(value) {
    if (!value) {
        return '-';
    }

    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime())
        ? String(value)
        : parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function setPanelStatus(message, isError) {
    if (!panelStatus) {
        return;
    }

    panelStatus.textContent = message;
    panelStatus.classList.toggle('error', Boolean(isError));
}
