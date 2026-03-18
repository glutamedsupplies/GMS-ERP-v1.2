const appClient = window.appClient;

const periodFilter = document.getElementById('periodFilter');
const dateFromFilter = document.getElementById('dateFromFilter');
const dateToFilter = document.getElementById('dateToFilter');
const branchFilter = document.getElementById('branchFilter');
const cashBranchFilter = document.getElementById('cashBranchFilter');
const paymentFilter = document.getElementById('paymentFilter');
const adminFilter = document.getElementById('adminFilter');
const salesRepFilter = document.getElementById('salesRepFilter');
const salesRepFilterList = document.getElementById('salesRepFilterList');
const searchFilter = document.getElementById('searchFilter');
const salesReportTitle = document.getElementById('salesReportTitle');
const salesReportCopy = document.getElementById('salesReportCopy');
const fieldCashBranchFilter = document.getElementById('fieldCashBranchFilter');
const fieldPaymentFilter = document.getElementById('fieldPaymentFilter');
const fieldAdminFilter = document.getElementById('fieldAdminFilter');
const fieldSalesRepFilter = document.getElementById('fieldSalesRepFilter');
const applyFiltersBtn = document.getElementById('applyFiltersBtn');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const reportStatus = document.getElementById('reportStatus');
const activeDateLabel = document.getElementById('activeDateLabel');

const totalSalesValue = document.getElementById('totalSalesValue');
const totalCostValue = document.getElementById('totalCostValue');
const grossProfitValue = document.getElementById('grossProfitValue');
const totalExpensesValue = document.getElementById('totalExpensesValue');
const totalCashIncomeValue = document.getElementById('totalCashIncomeValue');
const cashNetValue = document.getElementById('cashNetValue');
const netValue = document.getElementById('netValue');
const totalOrdersValue = document.getElementById('totalOrdersValue');
const totalPaymentsValue = document.getElementById('totalPaymentsValue');
const totalCollectionsValue = document.getElementById('totalCollectionsValue');

const branchChartBody = document.getElementById('branchChartBody');
const paymentChartBody = document.getElementById('paymentChartBody');
const paymentModeListBody = document.getElementById('paymentModeListBody');
const adminBreakdownBody = document.getElementById('adminBreakdownBody');
const salesRepBreakdownBody = document.getElementById('salesRepBreakdownBody');
const branchFinanceList = document.getElementById('branchFinanceList');
const salesTableScrollHelper = document.getElementById('salesTableScrollHelper');
const salesTableScrollProxy = document.getElementById('salesTableScrollProxy');
const salesTableScrollProxyInner = document.getElementById('salesTableScrollProxyInner');
const salesTableShell = document.getElementById('salesTableShell');
const salesTable = document.getElementById('salesTable');
const salesTableBody = document.getElementById('salesTableBody');
const receiptModal = document.getElementById('receiptModal');
const receiptModalMeta = document.getElementById('receiptModalMeta');
const receiptModalItems = document.getElementById('receiptModalItems');
const receiptModalTotals = document.getElementById('receiptModalTotals');
const receiptModalApproval = document.getElementById('receiptModalApproval');
const printReceiptBtn = document.getElementById('printReceiptBtn');
const saveReceiptPdfBtn = document.getElementById('saveReceiptPdfBtn');
const dismissReceiptBtn = document.getElementById('dismissReceiptBtn');
const closeReceiptBtn = document.getElementById('closeReceiptBtn');
let RECEIPT_LOGO_SRC = new URL('../logo.png', window.location.href).href;
let RECEIPT_SIGNATURE_SRC = new URL('../Signature_JHV.png', window.location.href).href;
const ZERO_AMOUNT_PAYMENT_METHODS = ['LBC Collection'];
const RECEIPT_APPROVER_LABEL = 'Approved & Verified By:';
let RECEIPT_APPROVER_NAME = 'Authorized Signatory';
let RECEIPT_APPROVER_TITLE = 'Operations';
let RECEIPT_APPROVER_COMPANY = 'Company Management';
let RECEIPT_BUSINESS_NAME = '';
let RECEIPT_BUSINESS_ADDRESS = '';
let RECEIPT_BUSINESS_CONTACT = '';
const PDF_LIB_URLS = Object.freeze({
    html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
});
const DEFAULT_RECEIPT_TEMPLATE = Object.freeze({
    title: 'Sales Receipt',
    subtitle: 'Official transaction summary',
    metaLayout: [
        'Receipt #|receiptNumber',
        'Order #|orderNumber',
        'Date|saleDate|date',
        'Invoice Branch|branch',
        'Cash Branch|cashBranch',
        'Courier|courier',
        'Payment Type|paymentType',
        'Payment Method|paymentMethod',
        'Admin|adminName',
        'Sales Representative|salesRepresentative',
        'Client|clientName',
        'Contact|clientContact',
        'Address|clientAddress'
    ].join('\n'),
    totalsLayout: [
        'Items Total|totals.baseTotal|money',
        'Total Due|totals.orderTotal|money',
        'Amount Paid|totals.amountPaid|money',
        'Collection|totals.collectionAmount|money',
        'Delivery Fee|totals.deliveryFee|money',
        'Overpayment|totals.overpaymentAmount|money',
        'Underpayment|totals.underpaymentAmount|money',
        'Note|note|text'
    ].join('\n'),
    footerNotes: '',
    terms: '',
    style: 'classic'
});

const SALES_REPORT_PAGE_SIZE = 500;
let salesReportOffset = 0;

const state = {
    references: null,
    syncingPeriod: false,
    lastReceipt: null,
    receiptSignatureSrc: RECEIPT_SIGNATURE_SRC,
    workspaceConfig: {},
    receiptTemplate: { ...DEFAULT_RECEIPT_TEMPLATE }
};
let salesTableScrollSyncLocked = false;
let salesTableResizeObserver = null;
let salesTableScrollHelperSyncFrame = 0;

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    await loadReceiptConfig();
    await hydrateReceiptSignatureAsset();
    applyWorkspaceConfigToView();
    bindEvents();
    setupSalesTableScrollHelper();
    await loadReferenceData();
    applyPeriodPreset(periodFilter.value || 'this_month', { load: false });
    await loadSalesReport();
}

async function loadReceiptConfig() {
    try {
        const bootstrap = await appClient.getBootstrap();
        const template = bootstrap?.invoiceTemplate || {};
        const branding = bootstrap?.branding || {};
        const company = bootstrap?.company || {};
        state.workspaceConfig = bootstrap?.workspaceConfig || {};

        RECEIPT_LOGO_SRC = resolveReceiptAssetPath(branding.logoPath || template.logo_path || '/logo.png', '/logo.png');
        RECEIPT_SIGNATURE_SRC = resolveReceiptAssetPath(template.signature_path || '/Signature_JHV.png', '/Signature_JHV.png');
        RECEIPT_APPROVER_NAME = template.signature_name || RECEIPT_APPROVER_NAME;
        RECEIPT_APPROVER_TITLE = template.signature_position || RECEIPT_APPROVER_TITLE;
        RECEIPT_APPROVER_COMPANY = template.business_name || company.name || RECEIPT_APPROVER_COMPANY;
        RECEIPT_BUSINESS_NAME = template.business_name || company.name || '';
        RECEIPT_BUSINESS_ADDRESS = template.address || '';
        RECEIPT_BUSINESS_CONTACT = template.contact || '';
        state.receiptTemplate = {
            title: normalizeReceiptTemplateText(template.receipt_title, DEFAULT_RECEIPT_TEMPLATE.title),
            subtitle: normalizeReceiptTemplateText(template.receipt_subtitle, DEFAULT_RECEIPT_TEMPLATE.subtitle),
            metaLayout: normalizeReceiptTemplateText(template.receipt_meta_layout, DEFAULT_RECEIPT_TEMPLATE.metaLayout),
            totalsLayout: normalizeReceiptTemplateText(template.receipt_totals_layout, DEFAULT_RECEIPT_TEMPLATE.totalsLayout),
            footerNotes: normalizeReceiptTemplateText(template.footer_notes, ''),
            terms: normalizeReceiptTemplateText(template.terms, ''),
            style: normalizeReceiptTemplateStyle(template.template_style)
        };
    } catch (error) {
        console.warn('Unable to load receipt configuration:', error);
        state.workspaceConfig = {};
        state.receiptTemplate = { ...DEFAULT_RECEIPT_TEMPLATE };
    }
}

function resolveReceiptAssetPath(value, fallbackPath = '/logo.png') {
    const raw = String(value || '').trim();
    if (!raw) {
        return new URL(fallbackPath, window.location.origin).href;
    }
    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) {
        return raw;
    }
    if (raw.startsWith('/')) {
        return new URL(raw, window.location.origin).href;
    }
    return new URL(raw, window.location.href).href;
}

function normalizeReceiptTemplateText(value, fallback = '') {
    const normalized = String(value ?? '')
        .replace(/\r\n/g, '\n')
        .trim();
    return normalized || String(fallback || '');
}

function normalizeReceiptTemplateStyle(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return ['classic', 'clean', 'minimal'].includes(normalized)
        ? normalized
        : DEFAULT_RECEIPT_TEMPLATE.style;
}

async function hydrateReceiptSignatureAsset() {
    try {
        const response = await fetch(RECEIPT_SIGNATURE_SRC);
        if (!response.ok) {
            throw new Error(`Failed to load receipt signature: ${response.status}`);
        }

        const blob = await response.blob();
        state.receiptSignatureSrc = await blobToDataUrl(blob);
    } catch (error) {
        console.warn('Unable to preload receipt signature asset:', error);
        state.receiptSignatureSrc = RECEIPT_SIGNATURE_SRC;
    }
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || RECEIPT_SIGNATURE_SRC));
        reader.onerror = () => reject(reader.error || new Error('Unable to read signature asset.'));
        reader.readAsDataURL(blob);
    });
}

function getReceiptSignatureSrc() {
    return state.receiptSignatureSrc || RECEIPT_SIGNATURE_SRC;
}

function getWorkspaceLabels() {
    return state.workspaceConfig?.labels || {};
}

function getSalesReportConfig() {
    return state.workspaceConfig?.salesReport || {};
}

function getOrderFormWorkspaceConfig() {
    return state.workspaceConfig?.orderForm || {};
}

function getWorkspaceOptionList(key) {
    const orderFormConfig = getOrderFormWorkspaceConfig();
    if (!Array.isArray(orderFormConfig?.[key])) {
        return [];
    }

    const seen = new Set();
    return orderFormConfig[key]
        .map((entry) => String(entry || '').trim())
        .filter((entry) => {
            if (!entry) {
                return false;
            }
            const token = entry.toLowerCase();
            if (seen.has(token)) {
                return false;
            }
            seen.add(token);
            return true;
        });
}

function isSalesReportFilterVisible(key, fallback = true) {
    const config = getSalesReportConfig();
    if (!Object.prototype.hasOwnProperty.call(config, key)) {
        return fallback;
    }
    return Boolean(config[key]);
}

function setElementVisibility(element, visible) {
    if (!element) {
        return;
    }
    element.style.display = visible ? '' : 'none';
}

function applyWorkspaceConfigToView() {
    const labels = getWorkspaceLabels();
    if (salesReportTitle) {
        salesReportTitle.textContent = labels.salesReportTitle || labels.salesReportMenu || 'Sales Report';
    }
    if (salesReportCopy) {
        salesReportCopy.textContent = labels.salesReportCopy
            || 'Full sales view with expense and cash income overlay, branch breakdown bars, and a detailed transaction table.';
    }

    setElementVisibility(fieldCashBranchFilter, isSalesReportFilterVisible('showCashBranchFilter', true));
    setElementVisibility(fieldPaymentFilter, isSalesReportFilterVisible('showPaymentFilter', true));
    setElementVisibility(fieldAdminFilter, isSalesReportFilterVisible('showAdminFilter', true));
    setElementVisibility(fieldSalesRepFilter, isSalesReportFilterVisible('showSalesRepresentativeFilter', true));
}

function bindEvents() {
    periodFilter.addEventListener('change', () => applyPeriodPreset(periodFilter.value || 'this_month'));
    applyFiltersBtn.addEventListener('click', loadSalesReport);
    resetFiltersBtn.addEventListener('click', resetFilters);
    salesTableBody.addEventListener('click', handleSalesTableClick);
    receiptModal?.addEventListener('click', (event) => {
        if (event.target === receiptModal) {
            closeReceiptModal();
        }
    });
    printReceiptBtn?.addEventListener('click', printReceipt);
    saveReceiptPdfBtn?.addEventListener('click', saveReceiptAsPdf);
    dismissReceiptBtn?.addEventListener('click', closeReceiptModal);
    closeReceiptBtn?.addEventListener('click', closeReceiptModal);
    salesTableShell?.addEventListener('scroll', () => syncSalesTableScroll(salesTableShell, salesTableScrollProxy));
    salesTableScrollProxy?.addEventListener('scroll', () => syncSalesTableScroll(salesTableScrollProxy, salesTableShell));

    [dateFromFilter, dateToFilter].forEach((input) => {
        input.addEventListener('change', () => {
            if (!state.syncingPeriod) {
                periodFilter.value = 'custom';
            }
        });
    });

    [searchFilter, salesRepFilter].forEach((input) => {
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                loadSalesReport();
            }
        });
    });
}

function setupSalesTableScrollHelper() {
    if (!salesTableShell || !salesTable || !salesTableScrollHelper || !salesTableScrollProxyInner) {
        return;
    }

    window.addEventListener('resize', scheduleSalesTableScrollHelperSync);
    window.addEventListener('load', scheduleSalesTableScrollHelperSync, { once: true });

    if ('ResizeObserver' in window) {
        salesTableResizeObserver = new ResizeObserver(() => {
            scheduleSalesTableScrollHelperSync();
        });
        salesTableResizeObserver.observe(salesTableShell);
        salesTableResizeObserver.observe(salesTable);
        salesTableResizeObserver.observe(salesTableBody);
    }

    if (document.fonts?.ready) {
        document.fonts.ready
            .then(() => {
                scheduleSalesTableScrollHelperSync();
            })
            .catch(() => {
                // Ignore font observer failures and keep layout sync resilient.
            });
    }

    syncSalesTableScrollHelper();
}

function syncSalesTableScroll(source, target) {
    if (!source || !target || salesTableScrollSyncLocked) {
        return;
    }

    salesTableScrollSyncLocked = true;
    target.scrollLeft = source.scrollLeft;
    window.requestAnimationFrame(() => {
        salesTableScrollSyncLocked = false;
    });
}

function syncSalesTableScrollHelper() {
    if (!salesTableShell || !salesTable || !salesTableScrollHelper || !salesTableScrollProxy || !salesTableScrollProxyInner) {
        return;
    }

    const clientWidth = Math.ceil(salesTableShell.clientWidth);
    const tableScrollWidth = Math.ceil(salesTable.scrollWidth);
    const shellScrollWidth = Math.ceil(salesTableShell.scrollWidth);
    const scrollWidth = Math.max(tableScrollWidth, shellScrollWidth, clientWidth);
    const hasOverflow = scrollWidth - clientWidth > 1;

    salesTableScrollHelper.hidden = !hasOverflow;
    salesTableScrollProxyInner.style.width = `${scrollWidth}px`;

    if (!hasOverflow) {
        salesTableShell.scrollLeft = 0;
        salesTableScrollProxy.scrollLeft = 0;
        return;
    }

    if (Math.abs(salesTableScrollProxy.scrollLeft - salesTableShell.scrollLeft) > 1) {
        salesTableScrollProxy.scrollLeft = salesTableShell.scrollLeft;
    }
}

function scheduleSalesTableScrollHelperSync() {
    if (salesTableScrollHelperSyncFrame) {
        window.cancelAnimationFrame(salesTableScrollHelperSyncFrame);
    }

    salesTableScrollHelperSyncFrame = window.requestAnimationFrame(() => {
        salesTableScrollHelperSyncFrame = 0;
        syncSalesTableScrollHelper();
    });
}

async function loadReferenceData() {
    try {
        const references = await appClient.getSalesReferences();
        state.references = references || {};

        const workspaceBranches = getWorkspaceOptionList('branches');
        const workspaceCashBranches = getWorkspaceOptionList('cashBranches');
        const workspacePaymentMethods = getWorkspaceOptionList('paymentMethods');
        const workspaceAdmins = getWorkspaceOptionList('admins');
        const workspaceSalesRepresentatives = getWorkspaceOptionList('salesRepresentatives');

        const branchOptions = workspaceBranches.length
            ? workspaceBranches
            : (state.references.branches || []);
        const cashBranchOptions = workspaceCashBranches.length
            ? workspaceCashBranches
            : branchOptions;
        const paymentOptions = workspacePaymentMethods.length
            ? [...workspacePaymentMethods, ...(!workspacePaymentMethods.includes('LBC Collection') ? ['LBC Collection'] : [])]
            : (state.references.paymentOptions || []);
        const adminOptions = workspaceAdmins.length
            ? workspaceAdmins
            : (state.references.admins || []);
        const salesRepOptions = workspaceSalesRepresentatives.length
            ? workspaceSalesRepresentatives
            : (state.references.salesRepresentatives || []);

        populateSelect(branchFilter, branchOptions, true, 'All Branches');
        populateSelect(cashBranchFilter, cashBranchOptions, true, 'All Cash Branches');
        populateSelect(paymentFilter, paymentOptions, true, 'All Payment Options');
        populateSelect(adminFilter, adminOptions, true, 'All Admins');
        populateDatalist(salesRepFilterList, salesRepOptions);
        setReportStatus('Reference data loaded.', false);
    } catch (error) {
        console.error('Failed to load report references:', error);
        setReportStatus(error.message || 'Unable to load report references.', true);
    }
}

function populateSelect(select, values, includeBlank = false, blankLabel = 'Select option') {
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

function populateDatalist(datalist, values) {
    datalist.innerHTML = values.map((value) => `<option value="${appClient.escapeHtml(value)}"></option>`).join('');
}

async function loadSalesReport() {
    setReportStatus('Loading report...', false);

    try {
        const payload = await appClient.listSales({
            dateFrom: dateFromFilter.value,
            dateTo: dateToFilter.value,
            branch: branchFilter.value,
            cashBranch: isSalesReportFilterVisible('showCashBranchFilter', true) ? cashBranchFilter.value : '',
            paymentOption: isSalesReportFilterVisible('showPaymentFilter', true) ? paymentFilter.value : '',
            adminName: isSalesReportFilterVisible('showAdminFilter', true) ? adminFilter.value : '',
            salesRepresentative: isSalesReportFilterVisible('showSalesRepresentativeFilter', true) ? salesRepFilter.value.trim() : '',
            search: searchFilter.value.trim(),
            limit: SALES_REPORT_PAGE_SIZE,
            offset: salesReportOffset
        });

        renderSummary(payload.summary || {});
        renderBranchChart(payload.summary?.branchFinancialBreakdown || []);
        renderPaymentChart(payload.summary?.paymentBreakdown || []);
        renderPaymentModeList(payload.summary?.paymentBreakdown || []);
        renderBreakdownList(adminBreakdownBody, payload.summary?.adminBreakdown || []);
        renderBreakdownList(salesRepBreakdownBody, payload.summary?.salesRepBreakdown || []);
        renderBranchFinanceList(payload.summary?.branchFinancialBreakdown || []);
        renderSalesTable(payload.items || []);
        activeDateLabel.textContent = buildActiveDateLabel();
        setReportStatus(`Loaded ${payload.summary?.totalOrders || 0} order(s) / ${(payload.items || []).length} sales row(s).`, false);
    } catch (error) {
        console.error('Failed to load sales report:', error);
        renderSummary({});
        renderBranchChart([]);
        renderPaymentChart([]);
        renderPaymentModeList([]);
        renderBreakdownList(adminBreakdownBody, []);
        renderBreakdownList(salesRepBreakdownBody, []);
        renderBranchFinanceList([]);
        renderSalesTable([]);
        activeDateLabel.textContent = buildActiveDateLabel();
        setReportStatus(error.message || 'Unable to load report.', true);
    }
}

function renderSummary(summary) {
    totalSalesValue.textContent = summary.totalSalesDisplay || formatMoney(0);
    totalCostValue.textContent = summary.totalCostDisplay || formatMoney(0);
    grossProfitValue.textContent = summary.grossProfitDisplay || formatMoney(0);
    totalExpensesValue.textContent = summary.expenseSummary?.totalAmountDisplay || formatMoney(0);
    totalCashIncomeValue.textContent = summary.cashIncomeSummary?.totalAmountDisplay || formatMoney(0);
    cashNetValue.textContent = summary.cashNetAmountDisplay || formatMoney(0);
    netValue.textContent = summary.netProfitAmountDisplay || summary.netAmountDisplay || formatMoney(0);
    totalOrdersValue.textContent = String(summary.totalOrders || 0);
    totalPaymentsValue.textContent = summary.totalPaymentsDisplay || formatMoney(0);
    totalCollectionsValue.textContent = summary.totalCollectionsDisplay || formatMoney(0);
}

function renderBranchChart(rows) {
    if (!rows.length) {
        branchChartBody.innerHTML = '<div class="empty">No branch breakdown available.</div>';
        return;
    }

    const maxValue = rows.reduce((highest, row) => Math.max(
        highest,
        Math.abs(Number(row.sales || 0)),
        Math.abs(Number(row.expenses || 0)),
        Math.abs(Number(row.cashIncome || 0)),
        Math.abs(Number(row.cashNet || 0)),
        Math.abs(Number(row.net || 0))
    ), 0) || 1;

    branchChartBody.innerHTML = rows.map((row) => `
        <article class="branch-group">
            <h3>${appClient.escapeHtml(row.label)}</h3>
            <div class="branch-total">Cost: ${appClient.escapeHtml(row.costDisplay || formatMoney(0))} | Gross Profit: ${appClient.escapeHtml(row.grossProfitDisplay || formatMoney(0))} | Cash Net: ${appClient.escapeHtml(row.cashNetDisplay || formatMoney(0))} | Net Profit: ${appClient.escapeHtml(row.netDisplay || formatMoney(0))}</div>
            <div class="bar-list">
                ${renderBarRow('Sales', row.sales, row.salesDisplay, '#2f7d5a', maxValue)}
                ${renderBarRow('Expenses', row.expenses, row.expensesDisplay, '#d06b6b', maxValue)}
                ${renderBarRow('Cash Income', row.cashIncome, row.cashIncomeDisplay, '#d29d2e', maxValue)}
                ${renderBarRow('Cash Net', row.cashNet, row.cashNetDisplay, '#205c68', maxValue)}
                ${renderBarRow('Net', row.net, row.netDisplay, '#516d7a', maxValue)}
            </div>
        </article>
    `).join('');
}

function renderPaymentChart(rows) {
    if (!rows.length) {
        paymentChartBody.innerHTML = '<div class="empty">No payment breakdown available.</div>';
        return;
    }

    const limitedRows = rows.slice(0, 8);
    const maxValue = limitedRows.reduce((highest, row) => Math.max(highest, Number(row.value || 0)), 0) || 1;

    paymentChartBody.innerHTML = limitedRows.map((row) => renderBarRow(
        row.label || 'Unspecified',
        row.value,
        row.displayValue,
        '#2f7d5a',
        maxValue
    )).join('');
}

function renderPaymentModeList(rows) {
    if (!rows.length) {
        paymentModeListBody.innerHTML = '<div class="empty">No payment mode totals available.</div>';
        return;
    }

    paymentModeListBody.innerHTML = rows.map((row) => `
        <div class="simple-row">
            <span>${appClient.escapeHtml(row.label || 'Unspecified')}</span>
            <strong>${appClient.escapeHtml(row.displayValue || formatMoney(row.value || 0))}</strong>
        </div>
    `).join('');
}

function renderBarRow(label, value, displayValue, color, maxValue) {
    const safeValue = Number(value || 0);
    const magnitude = Math.abs(safeValue);
    const width = magnitude <= 0 ? 0 : Math.max(6, Math.min(100, (magnitude / maxValue) * 100));
    const opacity = safeValue < 0 ? 0.55 : 1;
    return `
        <div class="bar-row">
            <span>${appClient.escapeHtml(label)}</span>
            <div class="bar-track">
                <div class="bar-fill" style="width:${width}%;background:${color};opacity:${opacity}"></div>
            </div>
            <strong>${appClient.escapeHtml(displayValue || formatMoney(safeValue))}</strong>
        </div>
    `;
}

function renderBreakdownList(container, rows) {
    if (!rows.length) {
        container.innerHTML = '<div class="empty">No breakdown available.</div>';
        return;
    }

    container.innerHTML = rows.slice(0, 8).map((row) => `
        <div class="simple-row">
            <span>${appClient.escapeHtml(row.label || 'Unspecified')}</span>
            <strong>${appClient.escapeHtml(row.displayValue || formatMoney(row.value || 0))}</strong>
        </div>
    `).join('');
}

function renderBranchFinanceList(rows) {
    if (!rows.length) {
        branchFinanceList.innerHTML = '<div class="empty">No branch finance data available.</div>';
        return;
    }

    branchFinanceList.innerHTML = rows.map((row) => `
        <div class="simple-row">
            <span>${appClient.escapeHtml(row.label)} | Cost: ${appClient.escapeHtml(row.costDisplay || formatMoney(0))} | Gross Profit: ${appClient.escapeHtml(row.grossProfitDisplay || formatMoney(0))} | Expense: ${appClient.escapeHtml(row.expensesDisplay)} | Cash Income: ${appClient.escapeHtml(row.cashIncomeDisplay)} | Net Profit: ${appClient.escapeHtml(row.netDisplay)}</span>
            <strong>${appClient.escapeHtml(row.netDisplay || formatMoney(0))}</strong>
        </div>
    `).join('');
}

function renderSalesTable(rows) {
    if (!rows.length) {
        salesTableBody.innerHTML = '<tr><td colspan="19" class="empty">No sales records found for the selected filters.</td></tr>';
        scheduleSalesTableScrollHelperSync();
        return;
    }

    salesTableBody.innerHTML = rows.map((row) => `
        <tr>
            <td>${appClient.escapeHtml(formatDate(row.sale_date))}</td>
            <td>${appClient.escapeHtml(row.receipt_number || '-')}</td>
            <td>${appClient.escapeHtml(row.order_number || '-')}</td>
            <td>${appClient.escapeHtml(row.client_name || '-')}</td>
            <td>${appClient.escapeHtml(row.branch || '-')}</td>
            <td>${appClient.escapeHtml(row.cash_branch || row.branch || '-')}</td>
            <td>${appClient.escapeHtml(formatMoney(row.order_total || row.line_subtotal || 0))}</td>
            <td>${appClient.escapeHtml(formatMoney(row.line_cost_total || 0))}</td>
            <td>${appClient.escapeHtml(formatMoney(row.line_profit || 0))}</td>
            <td>${appClient.escapeHtml(row.report_payment_label || row.payment_method || row.payment_option || '-')}</td>
            <td>${appClient.escapeHtml(formatMoney(row.payment_amount || 0))}</td>
            <td>${appClient.escapeHtml(formatMoney(row.collection_amount || 0))}</td>
            <td>${appClient.escapeHtml(row.admin_name || '-')}</td>
            <td>${appClient.escapeHtml(row.sales_representative || '-')}</td>
            <td>${appClient.escapeHtml(row.courier || '-')}</td>
            <td>${appClient.escapeHtml(row.item_sold || '-')}</td>
            <td>${appClient.escapeHtml(String(row.quantity || 0))}</td>
            <td class="note-cell">${appClient.escapeHtml(row.note || '-')}</td>
            <td class="action-cell">
                <div class="action-group">
                    <button
                        type="button"
                        class="table-action-btn receipt-btn"
                        data-order-action="receipt"
                        data-order-number="${appClient.escapeHtml(row.order_number || row.receipt_number || '')}"
                        ${canViewReceiptRow(row) ? '' : 'disabled'}
                    >
                        Receipt
                    </button>
                    <button
                        type="button"
                        class="table-action-btn"
                        data-order-action="edit"
                        data-order-number="${appClient.escapeHtml(row.order_number || row.receipt_number || '')}"
                        ${canEditRow(row) ? '' : 'disabled'}
                    >
                        Edit
                    </button>
                    <button
                        type="button"
                        class="table-action-btn delete-btn"
                        data-order-action="delete"
                        data-order-number="${appClient.escapeHtml(row.order_number || row.receipt_number || '')}"
                        ${canDeleteRow(row) ? '' : 'disabled'}
                    >
                        Delete
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    if (rows.length >= SALES_REPORT_PAGE_SIZE) {
        setReportStatus(`Showing first ${SALES_REPORT_PAGE_SIZE} rows. Refine filters for faster load or load fewer rows.`, false);
    }

    scheduleSalesTableScrollHelperSync();
}

function resetFilters() {
    salesReportOffset = 0;
    applyPeriodPreset('this_month', { load: false });
    branchFilter.value = '';
    cashBranchFilter.value = '';
    paymentFilter.value = '';
    adminFilter.value = '';
    salesRepFilter.value = '';
    searchFilter.value = '';
    loadSalesReport();
}

async function handleSalesTableClick(event) {
    const button = event.target.closest('[data-order-action]');
    if (!button || button.disabled) {
        return;
    }

    const action = String(button.dataset.orderAction || '').trim();
    const orderNumber = String(button.dataset.orderNumber || '').trim();
    if (!orderNumber) {
        return;
    }

    if (action === 'receipt') {
        await showSavedReceipt(orderNumber);
        return;
    }

    if (action === 'delete') {
        await deleteSavedOrder(orderNumber);
        return;
    }

    if (action !== 'edit') {
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

function canEditRow(row) {
    return Boolean((row.order_number || row.receipt_number) && String(row.source || '').toLowerCase() === 'manual');
}

function canDeleteRow(row) {
    return canEditRow(row);
}

function canViewReceiptRow(row) {
    return Boolean(row.order_number || row.receipt_number);
}

async function showSavedReceipt(orderNumber) {
    setReportStatus(`Loading receipt for ${orderNumber}...`, false);

    try {
        const order = await appClient.getOrder(orderNumber);
        openReceiptModal(buildReceiptSnapshot(order));
        setReportStatus(`Receipt ready for ${order.receiptNumber || order.orderNumber || orderNumber}.`, false);
    } catch (error) {
        console.error('Failed to load saved receipt:', error);
        setReportStatus(error.message || 'Unable to load receipt.', true);
    }
}

async function deleteSavedOrder(orderNumber) {
    if (!window.confirm(`Delete saved order ${orderNumber}? This will also restore its stock quantities.`)) {
        return;
    }

    setReportStatus(`Deleting ${orderNumber}...`, false);

    try {
        const result = await appClient.deleteOrder(orderNumber);
        if (state.lastReceipt && [state.lastReceipt.orderNumber, state.lastReceipt.receiptNumber].includes(orderNumber)) {
            closeReceiptModal();
        }
        await loadSalesReport();
        setReportStatus(`Deleted ${result.orderNumber || result.receiptNumber || orderNumber}.`, false);
    } catch (error) {
        console.error('Failed to delete order:', error);
        setReportStatus(error.message || 'Unable to delete order.', true);
    }
}

function applyPeriodPreset(period, { load = true } = {}) {
    const preset = getPeriodRange(period);

    salesReportOffset = 0;
    state.syncingPeriod = true;
    periodFilter.value = preset.period;
    dateFromFilter.value = preset.dateFrom;
    dateToFilter.value = preset.dateTo;
    state.syncingPeriod = false;

    if (load) {
        loadSalesReport();
    }
}

function getPeriodRange(period) {
    const today = new Date();
    const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (period === 'all') {
        return {
            period: 'all',
            dateFrom: '',
            dateTo: ''
        };
    }

    if (period === 'this_week') {
        const weekStart = new Date(currentDate.getTime());
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weekEnd = new Date(weekStart.getTime());
        weekEnd.setDate(weekEnd.getDate() + 6);
        return {
            period: 'this_week',
            dateFrom: toDateInputValue(weekStart),
            dateTo: toDateInputValue(weekEnd)
        };
    }

    if (period === 'custom') {
        return {
            period: 'custom',
            dateFrom: dateFromFilter.value || '',
            dateTo: dateToFilter.value || ''
        };
    }

    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    return {
        period: 'this_month',
        dateFrom: toDateInputValue(monthStart),
        dateTo: toDateInputValue(monthEnd)
    };
}

function buildActiveDateLabel() {
    const from = dateFromFilter.value.trim();
    const to = dateToFilter.value.trim();

    if (from && to && from === to) {
        return formatDate(from);
    }

    if (from && to) {
        return `${formatDate(from)} - ${formatDate(to)}`;
    }

    if (from) {
        return `From ${formatDate(from)}`;
    }

    if (to) {
        return `Until ${formatDate(to)}`;
    }

    return 'All Dates';
}

function toDateInputValue(value) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function isZeroAmountPaymentMethod(method) {
    return ZERO_AMOUNT_PAYMENT_METHODS.includes(String(method || '').trim());
}

function buildPaymentMethodDisplay(entries = [], labels = []) {
    const normalizedLabels = labels.length
        ? labels
        : entries.map((entry) => entry.method || entry.value).filter(Boolean);
    const entryMap = new Map(
        entries.map((entry) => [
            String(entry.method || entry.value || '').trim().toLowerCase(),
            {
                method: String(entry.method || entry.value || '').trim(),
                amount: Math.max(0, Number(entry.amount || 0))
            }
        ]).filter((entry) => entry[0])
    );

    return normalizedLabels.map((label) => {
        const entry = entryMap.get(String(label || '').trim().toLowerCase());
        if (!entry) {
            return label;
        }

        return `${label} (${formatMoney(entry.amount)})`;
    }).filter(Boolean).join(' + ');
}

function getDisplayPaymentMethodLabel(method, courier = '') {
    const normalizedMethod = String(method || '').trim();
    return normalizedMethod;
}

function resolveCollectionMethod(courier, amount = 0) {
    if (Number(amount || 0) <= 0) {
        return '';
    }

    const normalizedCourier = String(courier || '').trim().toUpperCase();
    if (normalizedCourier === 'LBC') {
        return 'LBC Collection';
    }

    return '';
}

function buildDisplayPaymentEntries(entries = [], { courier = '', baseTotal = 0, orderTotal = 0, amountPaid = 0, remainingAmount = null } = {}) {
    const normalizedEntries = (entries || []).map((entry) => ({
        method: getDisplayPaymentMethodLabel(entry.method || entry.value || '', courier),
        amount: Math.max(0, Number(entry.amount || 0))
    })).filter((entry) => entry.method);
    const nextRemainingAmount = remainingAmount === null || remainingAmount === undefined
        ? Math.max(Number(orderTotal || baseTotal || 0) - Number(amountPaid || 0), 0)
        : Math.max(0, Number(remainingAmount || 0));
    const collectionMethod = resolveCollectionMethod(courier, nextRemainingAmount);

    if (!collectionMethod || nextRemainingAmount <= 0) {
        return normalizedEntries;
    }

    const existingEntry = normalizedEntries.find((entry) => entry.method.toLowerCase() === collectionMethod.toLowerCase());
    if (existingEntry) {
        existingEntry.amount += nextRemainingAmount;
        return normalizedEntries;
    }

    normalizedEntries.push({
        method: collectionMethod,
        amount: nextRemainingAmount
    });
    return normalizedEntries;
}

function buildReceiptSnapshot(order) {
    const paymentMethodBreakdown = Array.isArray(order?.paymentMethodBreakdown)
        ? order.paymentMethodBreakdown
        : [];
    const paymentMethods = Array.isArray(order?.paymentMethods)
        ? order.paymentMethods
        : [];
    const baseTotal = Number(order?.baseTotal ?? order?.orderTotal ?? 0);
    const orderTotal = Number(order?.orderTotal ?? order?.baseTotal ?? 0);
    const amountPaid = Number(order?.amountPaid ?? order?.paymentAmount ?? 0);
    const remainingAmount = Number(order?.remainingAmount ?? Math.max(orderTotal - amountPaid, 0));
    const displayPaymentEntries = buildDisplayPaymentEntries(paymentMethodBreakdown, {
        courier: order?.courier || '',
        baseTotal,
        orderTotal,
        amountPaid,
        remainingAmount
    });
    const displayPaymentLabels = paymentMethods.map((method) => getDisplayPaymentMethodLabel(method, order?.courier || ''));

    return {
        receiptNumber: order?.receiptNumber || order?.orderNumber || 'Receipt',
        orderNumber: order?.orderNumber || order?.receiptNumber || '-',
        saleDate: order?.saleDate || '',
        branch: order?.branch || '',
        cashBranch: order?.cashBranch || order?.branch || '',
        courier: order?.courier || '',
        paymentType: order?.paymentType || '-',
        paymentMethod: buildPaymentMethodDisplay(displayPaymentEntries, displayPaymentLabels) || order?.paymentMethod || '-',
        paymentMethodBreakdown,
        adminName: order?.adminName || '',
        salesRepresentative: order?.salesRepresentative || '',
        clientName: order?.clientName || '',
        clientContact: order?.clientContact || '',
        clientAddress: order?.clientAddress || '',
        note: order?.note || '',
        items: (order?.items || []).map((item) => ({
            itemSold: item.itemSold || item.productName || '-',
            itemSet: item.itemSet || '-',
            itemCode: item.itemCode || '-',
            compositeDetailText: String(item.compositeDetailText || item.composite_detail_text || ''),
            quantity: Number(item.quantity ?? 0),
            unitPrice: Number(item.unitPrice ?? 0),
            subtotal: Number(item.lineSubtotal ?? (Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0)))
        })),
        totals: {
            baseTotal,
            orderTotal,
            amountPaid,
            remainingAmount,
            collectionAmount: Number(order?.collectionAmount ?? 0),
            deliveryFee: Number(order?.deliveryFee ?? 0),
            overpaymentAmount: Number(order?.overpaymentAmount ?? 0),
            underpaymentAmount: Number(order?.underpaymentAmount ?? 0)
        }
    };
}

function openReceiptModal(receipt) {
    if (!receiptModal || !receiptModalMeta || !receiptModalItems || !receiptModalTotals || !receiptModalApproval) {
        return;
    }

    const template = state.receiptTemplate || DEFAULT_RECEIPT_TEMPLATE;
    state.lastReceipt = receipt;
    receiptModalMeta.innerHTML = `
        <div class="receipt-brand-card">
            <img class="receipt-brand-logo" src="${appClient.escapeHtml(RECEIPT_LOGO_SRC)}" alt="Company logo">
            <div class="receipt-brand-copy">
                <strong>${appClient.escapeHtml(template.title || DEFAULT_RECEIPT_TEMPLATE.title)}</strong>
                <small>${appClient.escapeHtml(template.subtitle || DEFAULT_RECEIPT_TEMPLATE.subtitle)}</small>
            </div>
        </div>
        ${buildReceiptRowsHtml(receipt, template.metaLayout)}
    `;

    receiptModalItems.innerHTML = receipt.items.map((item) => `
        <div class="receipt-item-row">
            <div class="receipt-item-copy">
                <strong>${appClient.escapeHtml(formatReceiptItemDisplayName(item))}</strong>
                <small>${appClient.escapeHtml(buildReceiptItemMetaText(item))}</small>
                ${buildReceiptCompositeDetailHtml(item)}
            </div>
            <strong>${appClient.escapeHtml(formatMoney(item.subtotal))}</strong>
        </div>
    `).join('');

    receiptModalTotals.innerHTML = [
        buildReceiptRowsHtml(receipt, template.totalsLayout),
        buildReceiptTemplateTextBlockHtml(template.terms, 'Terms'),
        buildReceiptTemplateTextBlockHtml(template.footerNotes, 'Footer Notes')
    ].filter(Boolean).join('');
    receiptModalApproval.innerHTML = buildReceiptApprovalHtml();

    receiptModal.hidden = false;
}

function closeReceiptModal() {
    if (receiptModal) {
        receiptModal.hidden = true;
    }
}

function openReceiptPrintPopup(receipt, { autoPrint = false, blockedMessage = '' } = {}) {
    const popup = window.open('', '_blank', 'width=900,height=900');
    if (!popup) {
        if (blockedMessage) {
            setReportStatus(blockedMessage, true);
        }
        return null;
    }

    popup.document.write(buildReceiptPrintHtml(receipt));
    popup.document.close();
    popup.focus();

    if (autoPrint) {
        const triggerPrint = () => {
            try {
                popup.focus();
                popup.print();
            } catch (_error) {
                // Ignore print errors in popup.
            }
        };
        popup.addEventListener('load', triggerPrint, { once: true });
        setTimeout(triggerPrint, 300);
    }

    return popup;
}

function buildReceiptPdfFileName(receipt) {
    const raw = String(receipt?.receiptNumber || receipt?.orderNumber || 'receipt');
    const sanitized = raw
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
    return `${sanitized || 'receipt'}.pdf`;
}

function createHiddenPrintFrame(html) {
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.left = '-10000px';
    frame.style.top = '0';
    frame.style.width = '1200px';
    frame.style.height = '1600px';
    frame.style.border = '0';
    frame.style.visibility = 'hidden';
    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
    }

    return frame;
}

function waitForFrameReady(frame) {
    return new Promise((resolve) => {
        if (!frame) {
            resolve();
            return;
        }

        const doc = frame.contentDocument;
        if (doc?.readyState === 'complete') {
            resolve();
            return;
        }

        frame.addEventListener('load', () => resolve(), { once: true });
    });
}

function waitForImages(doc) {
    if (!doc) {
        return Promise.resolve();
    }

    const images = Array.from(doc.images || []);
    if (!images.length) {
        return Promise.resolve();
    }

    return Promise.all(images.map((img) => new Promise((resolve) => {
        if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
        }
        const finalize = () => resolve();
        img.addEventListener('load', finalize, { once: true });
        img.addEventListener('error', finalize, { once: true });
    }))).then(() => undefined);
}

async function renderReceiptPrintCanvas(receipt) {
    const printHtml = buildReceiptPrintHtml(receipt);
    const frame = createHiddenPrintFrame(printHtml);

    try {
        await waitForFrameReady(frame);
        const doc = frame.contentDocument;
        await waitForImages(doc);

        const sheet = doc?.querySelector('.sheet') || doc?.body;
        if (!sheet) {
            return null;
        }

        return await html2canvas(sheet, {
            useCORS: true,
            backgroundColor: '#ffffff',
            scale: 2
        });
    } finally {
        if (frame?.parentNode) {
            frame.parentNode.removeChild(frame);
        }
    }
}

const pdfLibScriptCache = new Map();
let pdfLibLoadPromise = null;

function loadExternalScript(src) {
    if (pdfLibScriptCache.has(src)) {
        return pdfLibScriptCache.get(src);
    }

    const loadPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing && existing.dataset.loaded === 'true') {
            resolve();
            return;
        }

        if (existing) {
            existing.addEventListener('load', () => {
                existing.dataset.loaded = 'true';
                resolve();
            }, { once: true });
            existing.addEventListener('error', () => {
                reject(new Error(`Failed to load ${src}`));
            }, { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.dataset.loaded = 'false';
        script.addEventListener('load', () => {
            script.dataset.loaded = 'true';
            resolve();
        }, { once: true });
        script.addEventListener('error', () => {
            reject(new Error(`Failed to load ${src}`));
        }, { once: true });
        document.head.appendChild(script);
    });

    pdfLibScriptCache.set(src, loadPromise);
    return loadPromise;
}

async function ensurePdfLibraries() {
    if (typeof html2canvas !== 'undefined' && typeof jspdf !== 'undefined') {
        return true;
    }

    if (!pdfLibLoadPromise) {
        pdfLibLoadPromise = Promise.all([
            loadExternalScript(PDF_LIB_URLS.html2canvas),
            loadExternalScript(PDF_LIB_URLS.jspdf)
        ]).catch((error) => {
            console.error('Failed to load PDF libraries:', error);
        }).finally(() => {
            if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
                pdfLibLoadPromise = null;
            }
        });
    }

    await pdfLibLoadPromise;
    return typeof html2canvas !== 'undefined' && typeof jspdf !== 'undefined';
}

function printReceipt() {
    if (!state.lastReceipt) {
        return;
    }

    openReceiptPrintPopup(state.lastReceipt, {
        blockedMessage: 'Allow pop-ups to print the receipt.'
    });
}

async function saveReceiptAsPdf() {
    if (!state.lastReceipt) {
        setReportStatus('Open a receipt first.', true);
        return;
    }

    const fallbackToPrint = () => {
        setReportStatus('Opening print dialog for PDF...', false);
        openReceiptPrintPopup(state.lastReceipt, {
            autoPrint: true,
            blockedMessage: 'Allow pop-ups to save the receipt as PDF.'
        });
    };

    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
        setReportStatus('Loading PDF tools...', false);
        const librariesReady = await ensurePdfLibraries();
        if (!librariesReady) {
            fallbackToPrint();
            return;
        }
    }

    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
        fallbackToPrint();
        return;
    }

    try {
        setReportStatus('Preparing PDF...', false);
        const canvas = await renderReceiptPrintCanvas(state.lastReceipt);
        if (!canvas) {
            setReportStatus('Receipt layout not found. Opening print dialog instead.', true);
            fallbackToPrint();
            return;
        }
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'pt',
            format: 'a4'
        });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 18;
        const usableWidth = pageWidth - margin * 2;
        const usableHeight = pageHeight - margin * 2;
        const imgWidth = usableWidth;
        const imgHeight = canvas.height * (imgWidth / canvas.width);
        let heightLeft = imgHeight;
        let position = margin;

        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= usableHeight;

        while (heightLeft > 0) {
            pdf.addPage();
            position = margin - (imgHeight - heightLeft);
            pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
            heightLeft -= usableHeight;
        }
        pdf.save(buildReceiptPdfFileName(state.lastReceipt));
        setReportStatus('PDF saved.', false);
    } catch (error) {
        console.error('Failed to generate PDF:', error);
        setReportStatus('Failed to generate PDF. Opening print dialog instead.', true);
        fallbackToPrint();
    }
}

function buildReceiptPrintHtml(receipt) {
    const template = state.receiptTemplate || DEFAULT_RECEIPT_TEMPLATE;
    const itemsHtml = receipt.items.map((item) => `
        <tr>
            <td>
                <div>${escapeReceiptHtml(formatReceiptItemDisplayName(item))}</div>
                ${buildReceiptCompositeDetailHtml(item, { print: true })}
            </td>
            <td>${escapeReceiptHtml(item.itemSet)}</td>
            <td>${escapeReceiptHtml(item.itemCode)}</td>
            <td>${escapeReceiptHtml(String(item.quantity))}</td>
            <td>${escapeReceiptHtml(formatMoney(item.unitPrice))}</td>
            <td>${escapeReceiptHtml(formatMoney(item.subtotal))}</td>
        </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeReceiptHtml(receipt.receiptNumber)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Aptos, Arial, sans-serif; color: #111827; }
  .sheet { width: 100%; max-width: 190mm; margin: 0 auto; padding: 8mm; border: 1px solid #d1d5db; }
  .brand { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .brand-copy h1 { margin: 0 0 4px; font-size: 22px; font-family: Georgia, "Times New Roman", serif; letter-spacing: 0.03em; }
  .brand-copy p { margin: 0; font-size: 11px; color: #475569; }
  .logo { width: 72px; height: 72px; object-fit: contain; }
  .header { display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; margin-bottom: 10px; font-size: 11px; }
  .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 12px; margin-bottom: 10px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 7px; text-align: left; font-size: 10px; vertical-align: top; }
  th { background: #f8fafc; text-transform: uppercase; letter-spacing: 0.05em; }
  .totals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 12px; margin-top: 8px; font-size: 11px; }
  .meta .wide, .totals .wide { grid-column: 1 / -1; line-height: 1.5; }
  .approval { margin-top: 14px; padding-top: 10px; display: flex; justify-content: flex-end; }
  .receipt-approval-card { min-width: 260px; max-width: 320px; text-align: center; }
  .receipt-approval-label { margin-bottom: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.01em; color: #1f2937; }
  .receipt-approval-signature-wrap { width: 220px; margin: 6px auto 8px; }
  .receipt-approval-signature { display: block; width: 100%; height: 90px; margin: 0 auto -28px; object-fit: contain; object-position: center bottom; position: relative; top: 16px; z-index: 1; }
  .receipt-approval-line { width: 100%; margin: 0; border-top: 1px solid rgba(15, 23, 42, 0.55); }
  .receipt-approval-name { font-size: 12px; font-weight: 700; font-family: Georgia, "Times New Roman", serif; }
  .receipt-approval-role, .receipt-approval-company { font-size: 11px; }
</style>
<script>
  (() => {
    let didPrint = false;
    const triggerPrint = () => {
      if (didPrint) {
        return;
      }

      didPrint = true;
      window.print();
    };

    window.addEventListener('afterprint', () => window.close());
    window.addEventListener('load', () => {
      const images = Array.from(document.images || []);
      const pending = images.filter((image) => !image.complete);

      if (!pending.length) {
        triggerPrint();
        return;
      }

      let remaining = pending.length;
      const resolveImage = () => {
        remaining -= 1;
        if (remaining <= 0) {
          triggerPrint();
        }
      };

      pending.forEach((image) => {
        image.addEventListener('load', resolveImage, { once: true });
        image.addEventListener('error', resolveImage, { once: true });
      });

      window.setTimeout(triggerPrint, 1500);
    });
  })();
</script>
</head>
<body>
  <div class="sheet">
    <div class="brand">
      <div class="brand-copy">
        <h1>${escapeReceiptHtml(template.title || DEFAULT_RECEIPT_TEMPLATE.title)}</h1>
        <p>${escapeReceiptHtml(template.subtitle || DEFAULT_RECEIPT_TEMPLATE.subtitle)}</p>
      </div>
      <img class="logo" src="${escapeReceiptHtml(RECEIPT_LOGO_SRC)}" alt="Company logo">
    </div>
    <div class="meta">${buildReceiptRowsHtml(receipt, template.metaLayout, { print: true })}</div>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Set</th>
          <th>Code</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Subtotal</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="totals">${buildReceiptRowsHtml(receipt, template.totalsLayout, { print: true })}${buildReceiptTemplateTextBlockHtml(template.terms, 'Terms', { print: true })}${buildReceiptTemplateTextBlockHtml(template.footerNotes, 'Footer Notes', { print: true })}</div>
    <div class="approval">${buildReceiptApprovalHtml({ print: true })}</div>
  </div>
</body>
</html>
    `;
}

function buildReceiptRowsHtml(receipt, layoutText, { print = false } = {}) {
    const escape = print ? escapeReceiptHtml : appClient.escapeHtml;
    const rows = parseReceiptLayoutRows(layoutText);

    if (!rows.length) {
        return `<div><strong>${escape('Template')}:</strong> ${escape('No rows configured.')}</div>`;
    }

    return rows.map((row) => {
        const rawValue = resolveReceiptTemplateValue(receipt, row.key);
        const formattedValue = formatReceiptTemplateValue(rawValue, row.key, row.format);
        return `<div><strong>${escape(row.label)}:</strong> ${escape(formattedValue)}</div>`;
    }).join('');
}

function parseReceiptLayoutRows(layoutText) {
    const lines = String(layoutText || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    return lines.map((line) => {
        const [label = '', key = '', format = ''] = line.split('|').map((part) => String(part || '').trim());
        if (!label || !key) {
            return null;
        }
        return {
            label,
            key,
            format: format.toLowerCase()
        };
    }).filter(Boolean);
}

function resolveReceiptTemplateValue(receipt, key) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) {
        return '';
    }

    const totals = receipt?.totals || {};
    const directMap = {
        receiptNumber: receipt?.receiptNumber || '',
        orderNumber: receipt?.orderNumber || '',
        saleDate: receipt?.saleDate || '',
        branch: receipt?.branch || '',
        cashBranch: receipt?.cashBranch || receipt?.branch || '',
        courier: receipt?.courier || '',
        paymentType: receipt?.paymentType || '',
        paymentMethod: receipt?.paymentMethod || '',
        adminName: receipt?.adminName || '',
        salesRepresentative: receipt?.salesRepresentative || '',
        clientName: receipt?.clientName || '',
        clientContact: receipt?.clientContact || '',
        clientAddress: receipt?.clientAddress || '',
        note: receipt?.note || '',
        businessName: RECEIPT_BUSINESS_NAME || RECEIPT_APPROVER_COMPANY || '',
        businessAddress: RECEIPT_BUSINESS_ADDRESS || '',
        businessContact: RECEIPT_BUSINESS_CONTACT || '',
        signatureName: RECEIPT_APPROVER_NAME || '',
        signaturePosition: RECEIPT_APPROVER_TITLE || '',
        'totals.baseTotal': Number(totals.baseTotal ?? 0),
        'totals.orderTotal': Number(totals.orderTotal ?? totals.baseTotal ?? 0),
        'totals.amountPaid': Number(totals.amountPaid ?? 0),
        'totals.remainingAmount': Number(totals.remainingAmount ?? 0),
        'totals.collectionAmount': Number(totals.collectionAmount ?? 0),
        'totals.deliveryFee': Number(totals.deliveryFee ?? 0),
        'totals.overpaymentAmount': Number(totals.overpaymentAmount ?? 0),
        'totals.underpaymentAmount': Number(totals.underpaymentAmount ?? 0)
    };

    if (Object.prototype.hasOwnProperty.call(directMap, normalizedKey)) {
        return directMap[normalizedKey];
    }

    const pathTokens = normalizedKey.split('.').filter(Boolean);
    let current = receipt;
    for (const token of pathTokens) {
        if (!current || typeof current !== 'object') {
            return '';
        }
        current = current[token];
    }
    return current;
}

function formatReceiptTemplateValue(rawValue, key, format) {
    const normalizedFormat = String(format || '').trim().toLowerCase();
    const normalizedKey = String(key || '').trim();

    if (normalizedFormat === 'money') {
        return formatMoney(Number(rawValue || 0));
    }
    if (normalizedFormat === 'date') {
        return formatDate(rawValue);
    }
    if (normalizedFormat === 'upper') {
        return String(rawValue || '-').toUpperCase();
    }

    if (normalizedKey === 'saleDate') {
        return formatDate(rawValue);
    }

    if (normalizedKey.startsWith('totals.') && normalizedFormat !== 'text') {
        return formatMoney(Number(rawValue || 0));
    }

    if (rawValue === null || rawValue === undefined) {
        return '-';
    }
    if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        return trimmed || '-';
    }
    return String(rawValue);
}

function formatReceiptItemDisplayName(item) {
    const itemSold = String(item?.itemSold || '').trim() || '-';
    const itemSet = String(item?.itemSet || '').trim();
    return itemSet && itemSet !== '-' ? `${itemSold} (${itemSet})` : itemSold;
}

function buildReceiptItemMetaText(item) {
    const parts = [`${Number(item?.quantity || 0)} x ${formatMoney(item?.unitPrice || 0)}`];
    const itemSet = String(item?.itemSet || '').trim();
    const itemCode = String(item?.itemCode || '').trim();
    if (itemSet && itemSet !== '-') {
        parts.push(`Set ${itemSet}`);
    }
    if (itemCode && itemCode !== '-') {
        parts.push(`Code ${itemCode}`);
    }
    return parts.join(' | ');
}

function buildReceiptCompositeDetailHtml(item, { print = false } = {}) {
    const detail = String(item?.compositeDetailText || item?.composite_detail_text || '').trim();
    if (!detail) {
        return '';
    }

    const escaped = (print ? escapeReceiptHtml(detail) : appClient.escapeHtml(detail)).replace(/\n/g, '<br>');
    if (print) {
        return `<div style="margin-top:4px; color:#475569; font-size:9px; line-height:1.4;">${escaped}</div>`;
    }
    return `<small style="display:block; margin-top:4px; line-height:1.5;">${escaped}</small>`;
}

function buildReceiptTemplateTextBlockHtml(text, label, { print = false } = {}) {
    const normalized = String(text || '').trim();
    if (!normalized) {
        return '';
    }

    const escape = print ? escapeReceiptHtml : appClient.escapeHtml;
    return `<div class="wide"><strong>${escape(label)}:</strong> ${escape(normalized).replace(/\n/g, '<br>')}</div>`;
}

function buildReceiptApprovalHtml({ print = false } = {}) {
    const escape = print ? escapeReceiptHtml : appClient.escapeHtml;
    const signatureSrc = getReceiptSignatureSrc();

    return `
        <div class="receipt-approval-card">
            <div class="receipt-approval-label">${escape(RECEIPT_APPROVER_LABEL)}</div>
            <div class="receipt-approval-signature-wrap">
                <img class="receipt-approval-signature" src="${escape(signatureSrc)}" alt="${escape('Signature')}" onerror="this.style.display='none';">
                <div class="receipt-approval-line"></div>
            </div>
            <div class="receipt-approval-name">${escape(RECEIPT_APPROVER_NAME)}</div>
            <div class="receipt-approval-role">${escape(RECEIPT_APPROVER_TITLE)}</div>
            <div class="receipt-approval-company">${escape(RECEIPT_APPROVER_COMPANY)}</div>
        </div>
    `;
}

function escapeReceiptHtml(value) {
    return appClient.escapeHtml(value ?? '');
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

function setReportStatus(message, isError) {
    reportStatus.textContent = message;
    reportStatus.classList.toggle('error', Boolean(isError));
}
