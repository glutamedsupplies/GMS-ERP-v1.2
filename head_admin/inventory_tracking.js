const appClient = window.appClient;

const rangePresetInput = document.getElementById('rangePreset');
const dateFromInput = document.getElementById('dateFrom');
const dateToInput = document.getElementById('dateTo');
const branchFilter = document.getElementById('branchFilter');
const itemSearchInput = document.getElementById('itemSearch');
const applyFiltersBtn = document.getElementById('applyFiltersBtn');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const panelStatus = document.getElementById('panelStatus');
const activeScopeLabel = document.getElementById('activeScopeLabel');
const activeScopeMeta = document.getElementById('activeScopeMeta');
const totalQtyOutValue = document.getElementById('totalQtyOutValue');
const invoiceCountValue = document.getElementById('invoiceCountValue');
const productCountValue = document.getElementById('productCountValue');
const activeDaysValue = document.getElementById('activeDaysValue');
const dailySummaryPill = document.getElementById('dailySummaryPill');
const productSummaryPill = document.getElementById('productSummaryPill');
const detailSummaryPill = document.getElementById('detailSummaryPill');
const dailySummaryBody = document.getElementById('dailySummaryBody');
const productSummaryBody = document.getElementById('productSummaryBody');
const trackingDetailBody = document.getElementById('trackingDetailBody');
const topProductCard = document.getElementById('topProductCard');

const state = {
    session: null,
    branches: [],
    serverDateKey: '',
    renderToken: 0
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) return;
    state.session = session;

    try {
        const [bootstrap, references, branchRows, serverInfo] = await Promise.all([
            appClient.getBootstrap(),
            appClient.getSalesReferences(),
            appClient.listBranches(),
            appClient.getServerInfo()
        ]);
        state.serverDateKey = normalizeDateKey(serverInfo?.dateKey) || toDateKey(new Date());
        state.branches = resolveBranchOptions(bootstrap, references, branchRows);
        appClient.applyBootstrapBrandTheme?.(bootstrap);
        populateBranchFilter();
        applyRangePreset('today', { render: false });
        bindEvents();
        await loadInventoryTracking();
    } catch (error) {
        console.error('Failed to initialize inventory tracking:', error);
        renderEmptyState();
        setStatus(error.message || 'Unable to load Inventory Tracking panel.', true);
    }
}

function bindEvents() {
    rangePresetInput?.addEventListener('change', () => {
        const preset = String(rangePresetInput.value || 'today').trim().toLowerCase();
        if (preset !== 'custom') applyRangePreset(preset, { render: true });
    });
    dateFromInput?.addEventListener('change', () => { rangePresetInput.value = 'custom'; });
    dateToInput?.addEventListener('change', () => { rangePresetInput.value = 'custom'; });
    branchFilter?.addEventListener('change', () => { void loadInventoryTracking(); });
    itemSearchInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            void loadInventoryTracking();
        }
    });
    applyFiltersBtn?.addEventListener('click', () => { void loadInventoryTracking(); });
    resetFiltersBtn?.addEventListener('click', () => {
        itemSearchInput.value = '';
        branchFilter.value = '';
        applyRangePreset('today', { render: true });
    });
    trackingDetailBody?.addEventListener('click', handleDetailClick);
}

function resolveBranchOptions(bootstrap, references, branchRows) {
    const workspaceBranches = Array.isArray(bootstrap?.workspaceConfig?.orderForm?.branches)
        ? bootstrap.workspaceConfig.orderForm.branches
        : [];
    const referenceBranches = Array.isArray(references?.branches) ? references.branches : [];
    const tenantBranches = Array.isArray(branchRows)
        ? branchRows.filter((branch) => Boolean(branch?.is_active)).map((branch) => branch.branch_name)
        : [];
    const seen = new Set();
    return [...tenantBranches, ...referenceBranches, ...workspaceBranches]
        .map((entry) => String(entry || '').trim())
        .filter((entry) => {
            if (!entry) return false;
            const key = entry.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function populateBranchFilter() {
    const currentValue = String(branchFilter?.value || '').trim();
    branchFilter.innerHTML = '<option value="">All Branches</option>';
    state.branches.forEach((branchName) => {
        const option = document.createElement('option');
        option.value = branchName;
        option.textContent = branchName;
        branchFilter.appendChild(option);
    });
    if (currentValue && state.branches.includes(currentValue)) branchFilter.value = currentValue;
}

function applyRangePreset(preset, { render = false } = {}) {
    const normalizedPreset = String(preset || 'today').trim().toLowerCase();
    const range = buildRangeFromPreset(normalizedPreset);
    rangePresetInput.value = normalizedPreset;
    dateFromInput.value = range.dateFrom;
    dateToInput.value = range.dateTo;
    if (render) void loadInventoryTracking();
}

function buildRangeFromPreset(preset) {
    const anchor = parseDateKey(state.serverDateKey) || new Date();
    const end = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    let start = new Date(end);
    if (preset === 'this_week') start.setDate(end.getDate() - end.getDay());
    if (preset === 'this_month') start = new Date(end.getFullYear(), end.getMonth(), 1);
    return { dateFrom: toDateKey(start), dateTo: toDateKey(end) };
}

function readFilters() {
    return {
        dateFrom: normalizeDateKey(dateFromInput?.value || ''),
        dateTo: normalizeDateKey(dateToInput?.value || ''),
        branch: String(branchFilter?.value || '').trim(),
        search: String(itemSearchInput?.value || '').trim()
    };
}

async function loadInventoryTracking() {
    const token = ++state.renderToken;
    const filters = readFilters();
    if (!filters.dateFrom || !filters.dateTo) {
        setStatus('Date from and date to are required.', true);
        return;
    }
    if (filters.dateFrom > filters.dateTo) {
        setStatus('Date from cannot be later than date to.', true);
        return;
    }

    setLoading(true);
    setStatus('Loading deducted inventory-out records...', false);
    try {
        const payload = await appClient.listInventoryOutTracking({ ...filters, limit: 0 });
        if (token !== state.renderToken) return;
        renderTracking(payload || {}, filters);
        const summary = payload?.summary || {};
        const searchNote = filters.search ? ` matching "${filters.search}"` : '';
        setStatus(`Loaded ${summary.totalRows || 0} deducted invoice line(s), ${summary.totalInvoices || 0} invoice(s), and ${summary.totalQuantityOutDisplay || '0'} total quantity out${searchNote}.`, false);
    } catch (error) {
        console.error('Failed to load inventory tracking:', error);
        renderEmptyState();
        setStatus(error.message || 'Unable to load inventory tracking.', true);
    } finally {
        setLoading(false);
    }
}

function renderTracking(payload, filters) {
    const items = Array.isArray(payload.items) ? payload.items : [];
    const dailyTotals = Array.isArray(payload.dailyTotals) ? payload.dailyTotals : [];
    const productTotals = Array.isArray(payload.productTotals) ? payload.productTotals : [];
    const summary = payload.summary || {};
    renderScope(filters, summary);
    renderMetrics(summary);
    renderDailyTotals(dailyTotals);
    renderProductTotals(productTotals);
    renderDetailRows(items);
    renderTopProduct(summary.topProduct || productTotals[0] || null);
}

function renderScope(filters, summary = {}) {
    activeScopeLabel.textContent = `${formatDate(filters.dateFrom)}${filters.dateFrom === filters.dateTo ? '' : ` - ${formatDate(filters.dateTo)}`}`;
    activeScopeMeta.textContent = `${filters.branch || 'All Branches'} | ${summary.totalRows || 0} deducted invoice line(s)`;
}

function renderMetrics(summary = {}) {
    totalQtyOutValue.textContent = summary.totalQuantityOutDisplay || formatQuantity(summary.totalQuantityOut || 0);
    invoiceCountValue.textContent = String(summary.totalInvoices || 0);
    productCountValue.textContent = String(summary.totalProducts || 0);
    activeDaysValue.textContent = String(summary.totalDays || 0);
}

function renderDailyTotals(rows) {
    dailySummaryPill.textContent = `${rows.length} day(s)`;
    if (!rows.length) {
        dailySummaryBody.innerHTML = '<tr><td colspan="4" class="empty">No inventory-out records for this date range.</td></tr>';
        return;
    }
    dailySummaryBody.innerHTML = rows.map((row) => `
        <tr><td><strong>${escapeHtml(formatDate(row.date))}</strong><small>${escapeHtml(row.date || '')}</small></td><td><span class="qty">${escapeHtml(row.quantityOutDisplay || formatQuantity(row.quantityOut || 0))}</span></td><td>${escapeHtml(String(row.productCount || 0))}<small>${escapeHtml(String(row.lineCount || 0))} invoice line(s)</small></td><td>${escapeHtml(String(row.invoiceCount || 0))}</td></tr>
    `).join('');
}

function renderProductTotals(rows) {
    productSummaryPill.textContent = `${rows.length} product row(s)`;
    if (!rows.length) {
        productSummaryBody.innerHTML = '<tr><td colspan="5" class="empty">No deducted product totals found.</td></tr>';
        return;
    }
    productSummaryBody.innerHTML = rows.map((row) => `
        <tr><td><strong>${escapeHtml(formatDate(row.date))}</strong><small>${escapeHtml(row.date || '')}</small></td><td><strong>${escapeHtml(row.productName || row.product || 'Unspecified product')}</strong><small>${escapeHtml(buildProductMeta(row))}</small></td><td>${escapeHtml(row.branch || '-')}</td><td><span class="qty">${escapeHtml(row.quantityOutDisplay || formatQuantity(row.quantityOut || 0))} ${escapeHtml(row.entryUnit || '')}</span><small>${escapeHtml(String(row.invoiceCount || 0))} invoice(s)</small></td><td><span class="remaining">${escapeHtml(row.remainingInventoryDisplay || formatQuantity(row.remainingInventory || 0))}</span></td></tr>
    `).join('');
}

function renderDetailRows(rows) {
    detailSummaryPill.textContent = `${rows.length} line(s)`;
    if (!rows.length) {
        trackingDetailBody.innerHTML = '<tr><td colspan="5" class="empty">No deducted invoice lines found. Only checked Ibawas sa Inventory sales rows appear here.</td></tr>';
        return;
    }
    trackingDetailBody.innerHTML = rows.map((row) => {
        const lookup = row.orderNumber || row.receiptNumber || '';
        const invoice = row.invoiceNumber || lookup || `SALE-${row.salesRecordId || row.id || ''}`;
        const invoiceMarkup = lookup
            ? `<button type="button" class="invoice-link" data-open-order="${escapeHtml(lookup)}">${escapeHtml(invoice)}</button>`
            : `<span class="invoice-link">${escapeHtml(invoice)}</span>`;
        return `<tr><td><strong>${escapeHtml(formatDate(row.date || row.saleDate))}</strong><small>${escapeHtml(row.branch || '-')}</small></td><td><strong>${escapeHtml(row.productName || row.product || 'Unspecified product')}</strong><small>${escapeHtml(buildProductMeta(row))}</small></td><td><span class="qty">${escapeHtml(row.quantityOutDisplay || formatQuantity(row.quantityOut || 0))} ${escapeHtml(row.entryUnit || '')}</span></td><td>${invoiceMarkup}<small>${escapeHtml([row.clientName, row.adminName ? `Admin: ${row.adminName}` : ''].filter(Boolean).join(' | ') || 'Sales record')}</small></td><td><span class="remaining">${escapeHtml(row.remainingInventoryDisplay || formatQuantity(row.remainingInventory || 0))}</span></td></tr>`;
    }).join('');
}

function renderTopProduct(row) {
    if (!row) {
        topProductCard.innerHTML = '<strong>No movement yet</strong><small>No deducted invoice items for the selected filters.</small>';
        return;
    }
    topProductCard.innerHTML = `<strong>${escapeHtml(row.productName || row.product || 'Unspecified product')}</strong><small>${escapeHtml(row.quantityOutDisplay || formatQuantity(row.quantityOut || 0))} ${escapeHtml(row.entryUnit || '')} out | ${escapeHtml(row.branch || 'All Branches')} | ${escapeHtml(formatDate(row.date || ''))}</small><small>Current remaining: ${escapeHtml(row.remainingInventoryDisplay || formatQuantity(row.remainingInventory || 0))}</small>`;
}

function renderEmptyState() {
    renderMetrics({});
    dailySummaryPill.textContent = '0 day(s)';
    productSummaryPill.textContent = '0 product row(s)';
    detailSummaryPill.textContent = '0 line(s)';
    dailySummaryBody.innerHTML = '<tr><td colspan="4" class="empty">No inventory-out records loaded.</td></tr>';
    productSummaryBody.innerHTML = '<tr><td colspan="5" class="empty">No product totals loaded.</td></tr>';
    trackingDetailBody.innerHTML = '<tr><td colspan="5" class="empty">No deducted invoice lines loaded.</td></tr>';
    renderTopProduct(null);
}

function handleDetailClick(event) {
    const button = event.target.closest('[data-open-order]');
    if (!button) return;
    const orderNumber = String(button.dataset.openOrder || '').trim();
    if (!orderNumber) return;
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'open-order-form', orderNumber }, window.location.origin);
        return;
    }
    window.location.href = `order_form.html?orderNumber=${encodeURIComponent(orderNumber)}`;
}

function buildProductMeta(row = {}) {
    return [row.itemCode ? `Code: ${row.itemCode}` : '', row.itemSet ? `Set: ${row.itemSet}` : '', row.entryUnit ? `Unit: ${row.entryUnit}` : ''].filter(Boolean).join(' | ') || 'Invoice item';
}
function setLoading(isLoading) { if (applyFiltersBtn) applyFiltersBtn.disabled = isLoading; if (resetFiltersBtn) resetFiltersBtn.disabled = isLoading; }
function setStatus(message, isError = false) { if (!panelStatus) return; panelStatus.textContent = message; panelStatus.classList.toggle('error', Boolean(isError)); }
function normalizeDateKey(value) { const text = String(value || '').trim(); if (!text) return ''; const direct = text.match(/^\d{4}-\d{2}-\d{2}/); if (direct) return direct[0]; const parsed = new Date(text); return Number.isNaN(parsed.getTime()) ? '' : toDateKey(parsed); }
function parseDateKey(value) { const key = normalizeDateKey(value); if (!key) return null; const [year, month, day] = key.split('-').map(Number); return new Date(year, month - 1, day); }
function toDateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function formatDate(value) { const parsed = parseDateKey(value); return parsed ? parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : String(value || ''); }
function formatQuantity(value) { const amount = Number(value || 0); return Number.isInteger(amount) ? String(amount) : amount.toFixed(2); }
function escapeHtml(value) { return appClient.escapeHtml(String(value ?? '')); }