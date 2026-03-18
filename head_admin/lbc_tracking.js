const appClient = window.appClient;

const TRACKING_NUMBER_REGEX = /^[A-Za-z0-9]{1,12}$/;
const PANEL_COMPANY_CODES = new Set(['default', 'gms', 'gms-erp', 'gmserp', 'gwd', 'gwd-erp', 'gwderp']);
const TRACKING_TABLE_COLSPAN = 9;
const LBC_DELIVERY_STATUS_OPTIONS = Object.freeze([
    'Delivered',
    'In Transit',
    'RTS',
    'RTO',
    'W/ Concern',
    'Out for Delivery',
    'Pending',
    'Ready for Pick-up',
    'In Transfer',
    'Re-Deliver',
    'Pending for Pick-Up',
    'Delivery Attempt Failed',
    'Payment Issue During Delivery',
    'On Hold'
]);

const DELIVERY_STATUS_ALIAS_MAP = Object.freeze({
    'not delivered': 'Delivery Attempt Failed',
    undelivered: 'Delivery Attempt Failed',
    failed: 'Delivery Attempt Failed',
    cancelled: 'RTO',
    canceled: 'RTO',
    'w concern': 'W/ Concern',
    'w/concern': 'W/ Concern',
    'with concern': 'W/ Concern',
    concern: 'W/ Concern',
    'ready for pickup': 'Ready for Pick-up',
    'ready for pick up': 'Ready for Pick-up',
    'pending for pickup': 'Pending for Pick-Up',
    'pending for pick up': 'Pending for Pick-Up',
    redeliver: 'Re-Deliver',
    're deliver': 'Re-Deliver',
    'payment issue': 'Payment Issue During Delivery',
    'delivery attempt failed': 'Delivery Attempt Failed',
    'attempt failed': 'Delivery Attempt Failed'
});

const DELIVERY_SELECT_CLASS_NAMES = Object.freeze([
    'status-delivery-in-transit',
    'status-delivery-delivered',
    'status-delivery-rts',
    'status-delivery-rto',
    'status-delivery-concern',
    'status-delivery-out-for-delivery',
    'status-delivery-pending',
    'status-delivery-ready-pickup',
    'status-delivery-in-transfer',
    'status-delivery-re-deliver',
    'status-delivery-pending-pickup'
]);

const branchButtons = Array.from(document.querySelectorAll('#branchButtons .chip[data-branch]'));
const quickFilterButtons = Array.from(document.querySelectorAll('#quickFilterButtons .chip[data-quick-filter]'));
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const reloadBtn = document.getElementById('reloadBtn');
const refreshTrackingBtn = document.getElementById('refreshTrackingBtn');
const trackingScanInput = document.getElementById('trackingScanInput');
const orderLookupInput = document.getElementById('orderLookupInput');
const autoDetectBtn = document.getElementById('autoDetectBtn');
const saveTrackingBtn = document.getElementById('saveTrackingBtn');
const bulkTrackingInput = document.getElementById('bulkTrackingInput');
const saveBulkBtn = document.getElementById('saveBulkBtn');
const autoDetectResult = document.getElementById('autoDetectResult');
const panelStatus = document.getElementById('panelStatus');
const trackingTableBody = document.getElementById('trackingTableBody');
const summaryNoTracking = document.getElementById('summaryNoTracking');
const summaryRts = document.getElementById('summaryRts');
const summaryRto = document.getElementById('summaryRto');
const summaryInTransit = document.getElementById('summaryInTransit');
const summaryConcern = document.getElementById('summaryConcern');
const collectionFilterButtons = Array.from(document.querySelectorAll('#collectionFilterButtons .chip[data-collection-filter]'));
const collectionTableBody = document.getElementById('collectionTableBody');
const collectionPendingCount = document.getElementById('collectionPendingCount');
const collectionConfirmedCount = document.getElementById('collectionConfirmedCount');
const collectionPendingAmount = document.getElementById('collectionPendingAmount');
const collectionConfirmedAmount = document.getElementById('collectionConfirmedAmount');

const QUICK_FILTER_LABELS = Object.freeze({
    all: 'All Orders',
    in_transit: 'In Transit',
    delivered: 'Delivered',
    rts: 'RTS',
    rto: 'RTO',
    no_tracking: 'No Tracking Number',
    pending_shipment: 'Pending Shipment'
});

const COLLECTION_FILTER_LABELS = Object.freeze({
    all: 'All Delivered',
    pending: 'Pending Confirmation',
    confirmed: 'Confirmed'
});

const state = {
    session: null,
    assignedBranch: '',
    bootstrap: null,
    items: [],
    summary: {
        total: 0,
        baseTotal: 0,
        byBranch: { Pampanga: 0, Cubao: 0 },
        byStatus: {},
        quickFilters: {
            all: 0,
            in_transit: 0,
            delivered: 0,
            rts: 0,
            rto: 0,
            no_tracking: 0,
            pending_shipment: 0
        },
        problems: {
            noTrackingNumber: 0,
            rts: 0,
            rto: 0,
            inTransit: 0,
            concern: 0
        }
    },
    collectionItems: [],
    collectionSummary: {
        totalDelivered: 0,
        visibleTotal: 0,
        pendingCount: 0,
        confirmedCount: 0,
        pendingAmount: 0,
        confirmedAmount: 0,
        pendingAmountDisplay: 'PHP 0.00',
        confirmedAmountDisplay: 'PHP 0.00',
        filter: 'all'
    },
    filters: {
        branch: '',
        search: '',
        quickFilter: 'all',
        collectionStatus: 'all'
    },
    editingOrderKey: '',
    savingOrderKey: '',
    loading: false,
    locked: false
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({
        role: 'head_admin',
        allowEmployeeFeature: 'lbc_tracking'
    });
    if (!session) {
        return;
    }

    state.session = session;
    state.assignedBranch = normalizeBranchName(session.branchName || '');
    appClient.attachEmployeeBackButton(session);

    try {
        state.bootstrap = await appClient.getBootstrap();
    } catch (_error) {
        state.bootstrap = null;
    }

    if (!isAllowedCompany()) {
        lockPanel('LBC Tracking is available for GMS/GWD companies only.');
        return;
    }

    bindEvents();
    focusTrackingInput({ select: true });
    await loadRows();
}

function bindEvents() {
    branchButtons.forEach((button) => {
        button.addEventListener('click', async () => {
            if (state.locked || state.loading) {
                return;
            }
            state.filters.branch = String(button.dataset.branch || '').trim();
            applyActiveBranchButton();
            await loadRows();
        });
    });

    quickFilterButtons.forEach((button) => {
        button.addEventListener('click', async () => {
            if (state.locked || state.loading) {
                return;
            }
            state.filters.quickFilter = normalizeQuickFilter(button.dataset.quickFilter);
            applyActiveQuickFilterButton();
            await loadRows();
        });
    });

    collectionFilterButtons.forEach((button) => {
        button.addEventListener('click', async () => {
            if (state.locked || state.loading) {
                return;
            }
            state.filters.collectionStatus = normalizeCollectionFilter(button.dataset.collectionFilter);
            applyActiveCollectionFilterButton();
            await loadRows();
        });
    });

    searchBtn?.addEventListener('click', async () => {
        if (state.locked) {
            return;
        }
        state.filters.search = normalizeText(searchInput?.value);
        await loadRows();
    });

    searchInput?.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter' || state.locked) {
            return;
        }
        event.preventDefault();
        state.filters.search = normalizeText(searchInput?.value);
        await loadRows();
    });

    reloadBtn?.addEventListener('click', async () => {
        if (state.locked) {
            return;
        }
        await loadRows();
    });

    refreshTrackingBtn?.addEventListener('click', async () => {
        await handleRefreshTracking();
    });

    autoDetectBtn?.addEventListener('click', () => {
        handleAutoDetectOrder();
    });

    saveTrackingBtn?.addEventListener('click', async () => {
        await handleSingleTrackingSave();
    });

    trackingScanInput?.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') {
            return;
        }
        event.preventDefault();
        await handleSingleTrackingSave();
    });

    saveBulkBtn?.addEventListener('click', async () => {
        await handleBulkTrackingSave();
    });

    trackingTableBody?.addEventListener('click', async (event) => {
        const target = event.target instanceof Element
            ? event.target.closest('button[data-action]')
            : null;
        if (!target) {
            return;
        }

        const action = normalizeText(target.getAttribute('data-action') || '');
        if (!action.startsWith('edit-tracking-row') && action !== 'save-tracking-row' && action !== 'cancel-tracking-row') {
            return;
        }

        const orderLookup = decodeOrderLookup(target.getAttribute('data-order-key') || '');
        if (!orderLookup) {
            setStatus('Order number is missing for edit action.', true);
            return;
        }

        if (action === 'edit-tracking-row') {
            startTrackingRowEdit(orderLookup);
            return;
        }

        if (action === 'cancel-tracking-row') {
            cancelTrackingRowEdit();
            return;
        }

        if (action === 'save-tracking-row') {
            const rowElement = target.closest('tr');
            await handleTrackingRowEditSave(orderLookup, rowElement);
        }
    });

    trackingTableBody?.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter' && event.key !== 'Escape') {
            return;
        }

        const rowElement = event.target instanceof Element
            ? event.target.closest('tr[data-editing="true"]')
            : null;
        if (!rowElement) {
            return;
        }

        const orderLookup = decodeOrderLookup(rowElement.getAttribute('data-order-key') || '');
        if (!orderLookup) {
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            cancelTrackingRowEdit();
            return;
        }

        event.preventDefault();
        await handleTrackingRowEditSave(orderLookup, rowElement);
    });

    trackingTableBody?.addEventListener('change', (event) => {
        const target = event.target instanceof Element
            ? event.target
            : null;
        if (!target?.matches('select[data-field="delivery-status"]')) {
            return;
        }
        applyDeliveryStatusSelectClass(target, target.value);
    });

    collectionTableBody?.addEventListener('click', async (event) => {
        const target = event.target instanceof Element
            ? event.target.closest('button[data-action]')
            : null;
        if (!target) {
            return;
        }

        const action = normalizeText(target.getAttribute('data-action') || '');
        if (action !== 'confirm-collection' && action !== 'undo-collection-confirm' && action !== 'return-in-transit') {
            return;
        }

        const orderLookup = decodeOrderLookup(target.getAttribute('data-order-key') || '');
        if (!orderLookup) {
            setStatus('Order key is missing for collection action.', true);
            return;
        }

        if (action === 'confirm-collection') {
            await handleConfirmCollection(orderLookup);
            return;
        }
        if (action === 'undo-collection-confirm') {
            await handleUndoCollectionConfirmation(orderLookup);
            return;
        }
        await handleCollectionReturnToTransit(orderLookup);
    });

    document.addEventListener('keydown', async (event) => {
        if (state.locked) {
            return;
        }
        if (!canUseTrackingWriteActions()) {
            return;
        }

        if (event.key === 'Enter' && !isTypingTarget(event.target) && normalizeText(trackingScanInput?.value)) {
            event.preventDefault();
            await handleSingleTrackingSave();
            return;
        }

        if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
            return;
        }

        if (isTypingTarget(event.target)) {
            return;
        }

        if (!trackingScanInput || event.key.length !== 1 || !/[A-Za-z0-9]/.test(event.key)) {
            return;
        }

        trackingScanInput.focus();
        trackingScanInput.setRangeText(
            event.key,
            trackingScanInput.selectionStart ?? trackingScanInput.value.length,
            trackingScanInput.selectionEnd ?? trackingScanInput.value.length,
            'end'
        );
        event.preventDefault();
    });

    window.addEventListener('focus', () => {
        focusTrackingInput();
    });
}

function isAllowedCompany() {
    const companyCode = normalizeCompanyCode(
        state.bootstrap?.company?.company_code
        || state.session?.company_code
        || state.session?.companyCode
    );
    return PANEL_COMPANY_CODES.has(companyCode);
}

function normalizeCompanyCode(value) {
    return normalizeText(value).toLowerCase();
}

function normalizeQuickFilter(value) {
    const normalized = normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_');
    return Object.prototype.hasOwnProperty.call(QUICK_FILTER_LABELS, normalized)
        ? normalized
        : 'all';
}

function normalizeCollectionFilter(value) {
    const normalized = normalizeText(value).toLowerCase();
    return Object.prototype.hasOwnProperty.call(COLLECTION_FILTER_LABELS, normalized)
        ? normalized
        : 'all';
}

function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeBranchName(value = '') {
    return normalizeText(value);
}

function sameBranch(left = '', right = '') {
    return normalizeBranchName(left).toLowerCase() === normalizeBranchName(right).toLowerCase();
}

function isEmployeeLikeRole(role = '') {
    const normalized = normalizeText(role).toLowerCase();
    return normalized === 'employee' || normalized === 'staff';
}

function canEditTrackingRow(row = {}) {
    const role = normalizeText(state.session?.role).toLowerCase();
    if (role === 'head_admin' || role === 'company_admin' || role === 'super_admin') {
        return true;
    }
    if (!isEmployeeLikeRole(role)) {
        return false;
    }
    return sameBranch(row.branch, state.assignedBranch);
}

function canUseTrackingWriteActions() {
    const role = normalizeText(state.session?.role).toLowerCase();
    if (role === 'head_admin' || role === 'company_admin' || role === 'super_admin') {
        return true;
    }
    if (!isEmployeeLikeRole(role)) {
        return false;
    }
    const selectedBranch = normalizeText(state.filters.branch);
    return !selectedBranch || sameBranch(selectedBranch, state.assignedBranch);
}

function getLbcEditRestrictionMessage(branch = '') {
    if (!isEmployeeLikeRole(state.session?.role)) {
        return 'LBC editing is not available for this account.';
    }
    if (!sameBranch(branch, state.assignedBranch)) {
        return `You can edit LBC records only in ${state.assignedBranch || 'your assigned branch'}.`;
    }
    return 'LBC editing is not available for this branch.';
}

function decodeOrderLookup(value) {
    const encoded = normalizeText(value);
    if (!encoded) {
        return '';
    }
    try {
        return decodeURIComponent(encoded);
    } catch (_error) {
        return encoded;
    }
}

function resolveOrderLookup(row = {}) {
    return normalizeText(row.orderKey || row.orderNumber || row.receiptNumber);
}

function normalizeDeliveryStatusToken(value) {
    return normalizeText(value)
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s*\/\s*/g, '/')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeDeliveryStatus(value, fallback = 'In Transit') {
    const token = normalizeDeliveryStatusToken(value);
    if (!token) {
        return fallback;
    }

    if (Object.prototype.hasOwnProperty.call(DELIVERY_STATUS_ALIAS_MAP, token)) {
        return DELIVERY_STATUS_ALIAS_MAP[token];
    }

    const matched = LBC_DELIVERY_STATUS_OPTIONS.find((status) => normalizeDeliveryStatusToken(status) === token);
    return matched || fallback;
}

function formatAmountInput(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return '0.00';
    }
    return parsed.toFixed(2);
}

function formatDateTimeLocal(value) {
    const raw = normalizeText(value);
    if (!raw) {
        return '';
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }
    const timezoneOffsetMs = parsed.getTimezoneOffset() * 60 * 1000;
    return new Date(parsed.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function lockPanel(message) {
    state.locked = true;
    [
        ...branchButtons,
        ...quickFilterButtons,
        ...collectionFilterButtons,
        searchInput,
        searchBtn,
        reloadBtn,
        refreshTrackingBtn,
        trackingScanInput,
        orderLookupInput,
        autoDetectBtn,
        saveTrackingBtn,
        bulkTrackingInput,
        saveBulkBtn
    ].forEach((control) => {
        if (control) {
            control.disabled = true;
        }
    });

    trackingTableBody.innerHTML = `<tr><td class="empty-row" colspan="${TRACKING_TABLE_COLSPAN}">LBC tracking is not available for this company.</td></tr>`;
    if (collectionTableBody) {
        collectionTableBody.innerHTML = '<tr><td class="empty-row" colspan="8">Collection confirmation is not available for this company.</td></tr>';
    }
    setStatus(message, true);
}

function applyActiveBranchButton() {
    const activeBranch = normalizeText(state.filters.branch);
    branchButtons.forEach((button) => {
        button.classList.toggle('active', normalizeText(button.dataset.branch) === activeBranch);
    });
}

function applyActiveQuickFilterButton() {
    const activeFilter = normalizeQuickFilter(state.filters.quickFilter);
    quickFilterButtons.forEach((button) => {
        button.classList.toggle('active', normalizeQuickFilter(button.dataset.quickFilter) === activeFilter);
    });
}

function applyActiveCollectionFilterButton() {
    const activeFilter = normalizeCollectionFilter(state.filters.collectionStatus);
    collectionFilterButtons.forEach((button) => {
        button.classList.toggle('active', normalizeCollectionFilter(button.dataset.collectionFilter) === activeFilter);
    });
}

async function loadRows({ keepStatus = false } = {}) {
    if (state.loading || state.locked) {
        return;
    }

    state.loading = true;
    if (!keepStatus) {
        setStatus('Loading LBC tracking data...');
    }

    try {
        const [payload, collectionPayload] = await Promise.all([
            appClient.listLbcTracking({
                branch: state.filters.branch,
                search: state.filters.search,
                quickFilter: state.filters.quickFilter
            }),
            appClient.listLbcCollections({
                branch: state.filters.branch,
                search: state.filters.search,
                status: state.filters.collectionStatus
            })
        ]);

        state.items = Array.isArray(payload?.items) ? payload.items : [];
        state.summary = payload?.summary || state.summary;
        state.collectionItems = Array.isArray(collectionPayload?.items) ? collectionPayload.items : [];
        state.collectionSummary = collectionPayload?.summary || state.collectionSummary;
        if (
            state.editingOrderKey
            && !state.items.some((item) => resolveOrderLookup(item) === state.editingOrderKey)
        ) {
            state.editingOrderKey = '';
        }

        renderBranchCounts();
        renderQuickFilterCounts();
        renderSummaryCards();
        renderRows();
        renderCollectionSummary();
        renderCollectionRows();
        applyActiveBranchButton();
        applyActiveQuickFilterButton();
        applyActiveCollectionFilterButton();

        const visibleCount = Number(state.summary?.total || state.items.length || 0);
        const baseCount = Number(state.summary?.baseTotal || visibleCount || 0);
        const modeLabel = canUseTrackingWriteActions()
            ? 'edit enabled'
            : (isEmployeeLikeRole(state.session?.role) ? 'read-only for other branch' : 'read only');
        if (!state.items.length) {
            setStatus(`No orders found for "${QUICK_FILTER_LABELS[normalizeQuickFilter(state.filters.quickFilter)]}" (${modeLabel}).`);
        } else {
            setStatus(`Showing ${visibleCount} of ${baseCount} LBC order(s) (${modeLabel}).`);
        }
    } catch (error) {
        console.error('Failed to load LBC tracking rows:', error);
        trackingTableBody.innerHTML = `<tr><td class="empty-row" colspan="${TRACKING_TABLE_COLSPAN}">Unable to load tracking rows.</td></tr>`;
        if (collectionTableBody) {
            collectionTableBody.innerHTML = '<tr><td class="empty-row" colspan="8">Unable to load collection confirmation rows.</td></tr>';
        }
        setStatus(error.message || 'Failed to load LBC tracking rows.', true);
    } finally {
        state.loading = false;
        setActionLoading(false);
    }
}

function renderBranchCounts() {
    const byBranch = state.summary?.byBranch || {};
    const allCount = Number(state.summary?.baseTotal || 0);
    const counts = {
        all: allCount,
        pampanga: Number(byBranch.Pampanga || 0),
        cubao: Number(byBranch.Cubao || 0)
    };

    branchButtons.forEach((button) => {
        const branch = normalizeText(button.dataset.branch).toLowerCase();
        const key = branch || 'all';
        const count = Number(counts[key] || 0);
        const label = branch ? (branch === 'pampanga' ? 'Pampanga' : 'Cubao') : 'All Branches';
        button.textContent = `${label} (${count})`;
    });
}

function renderQuickFilterCounts() {
    const quickSummary = state.summary?.quickFilters || {};
    quickFilterButtons.forEach((button) => {
        const quickFilter = normalizeQuickFilter(button.dataset.quickFilter);
        const label = QUICK_FILTER_LABELS[quickFilter] || quickFilter;
        const count = Number(quickSummary[quickFilter] || 0);
        button.textContent = `${label} (${count})`;
    });
}

function renderSummaryCards() {
    const problems = state.summary?.problems || {};
    if (summaryNoTracking) summaryNoTracking.textContent = Number(problems.noTrackingNumber || 0).toLocaleString('en-PH');
    if (summaryRts) summaryRts.textContent = Number(problems.rts || 0).toLocaleString('en-PH');
    if (summaryRto) summaryRto.textContent = Number(problems.rto || 0).toLocaleString('en-PH');
    if (summaryInTransit) summaryInTransit.textContent = Number(problems.inTransit || 0).toLocaleString('en-PH');
    if (summaryConcern) summaryConcern.textContent = Number(problems.concern || 0).toLocaleString('en-PH');
}

function renderRows() {
    if (!state.items.length) {
        trackingTableBody.innerHTML = `<tr><td class="empty-row" colspan="${TRACKING_TABLE_COLSPAN}">No matching LBC orders.</td></tr>`;
        return;
    }

    trackingTableBody.innerHTML = state.items.map((row) => {
        const orderLookup = resolveOrderLookup(row);
        const encodedOrderLookup = encodeURIComponent(orderLookup);
        const trackingNumber = normalizeText(row.trackingNumber);
        const orderNumber = normalizeText(row.orderNumber || row.receiptNumber || row.orderKey || '-');
        const missingTrackingRow = Boolean(row.missingTrackingAfterShipment);
        const canEditRow = Boolean(orderLookup) && canEditTrackingRow(row);
        const isEditing = canEditRow && state.editingOrderKey === orderLookup;
        const isSaving = canEditRow && state.savingOrderKey === orderLookup;
        const deliveryStatus = normalizeDeliveryStatus(row.deliveryStatus, 'In Transit');
        const dateMonitoredValue = formatDateTimeLocal(row.dateMonitored || row.updatedAt);
        const deliveryStatusOptions = LBC_DELIVERY_STATUS_OPTIONS.map((status) => {
            const selected = status === deliveryStatus ? ' selected' : '';
            return `<option value="${appClient.escapeHtml(status)}"${selected}>${appClient.escapeHtml(status)}</option>`;
        }).join('');

        const trackingCell = isEditing
            ? `<input class="field field-inline field-tracking-number" type="text" maxlength="12" data-field="tracking-number" value="${appClient.escapeHtml(trackingNumber)}" placeholder="Tracking #">`
            : `<span class="tracking-text ${trackingNumber ? '' : 'empty'}">${appClient.escapeHtml(trackingNumber || 'NO TRACKING')}</span>`;
        const amountCell = isEditing
            ? `<input class="field field-inline field-amount" type="number" min="0" step="0.01" data-field="amount-to-collect" value="${appClient.escapeHtml(formatAmountInput(row.amountToCollect))}">`
            : appClient.escapeHtml(formatAmount(row.amountToCollect));
        const deliveryClass = deliveryClassName(deliveryStatus);
        const deliveryCell = isEditing
            ? `<select class="field field-inline field-status status-${deliveryClass}" data-field="delivery-status">${deliveryStatusOptions}</select>`
            : `<span class="pill ${deliveryClass}">${appClient.escapeHtml(deliveryStatus)}</span>`;
        const actionCell = !orderLookup
            ? '<span class="collection-note">No order key</span>'
            : !canEditRow
            ? '<span class="collection-note">Read only</span>'
            : (isEditing
            ? `
                <div class="row-action-group">
                  <input class="field field-inline field-date-monitored" type="datetime-local" data-field="date-monitored" value="${appClient.escapeHtml(dateMonitoredValue)}">
                  <button class="btn primary btn-inline" type="button" data-action="save-tracking-row" data-order-key="${appClient.escapeHtml(encodedOrderLookup)}" ${isSaving ? 'disabled' : ''}>${isSaving ? 'Saving...' : 'Save'}</button>
                  <button class="btn secondary btn-inline" type="button" data-action="cancel-tracking-row" data-order-key="${appClient.escapeHtml(encodedOrderLookup)}" ${isSaving ? 'disabled' : ''}>Cancel</button>
                </div>
              `
            : `<button class="btn secondary btn-inline" type="button" data-action="edit-tracking-row" data-order-key="${appClient.escapeHtml(encodedOrderLookup)}">Edit</button>`);
        return `
            <tr class="${missingTrackingRow ? 'row-missing-tracking' : ''}" data-order-key="${appClient.escapeHtml(encodedOrderLookup)}" data-editing="${isEditing ? 'true' : 'false'}">
              <td>${appClient.escapeHtml(formatDate(row.saleDate))}</td>
              <td>${trackingCell}</td>
              <td>${appClient.escapeHtml(orderNumber)}</td>
              <td>${appClient.escapeHtml(normalizeText(row.clientName) || '-')}</td>
              <td>${amountCell}</td>
              <td>${deliveryCell}</td>
              <td><span class="pill ${branchClassName(row.branch)}">${appClient.escapeHtml(normalizeText(row.branch) || '-')}</span></td>
              <td>${appClient.escapeHtml(normalizeText(row.assignedTo || row.salesRepresentative || row.adminName) || '-')}</td>
              <td>${actionCell}</td>
            </tr>
        `;
    }).join('');
}

function renderCollectionSummary() {
    const summary = state.collectionSummary || {};
    if (collectionPendingCount) collectionPendingCount.textContent = Number(summary.pendingCount || 0).toLocaleString('en-PH');
    if (collectionConfirmedCount) collectionConfirmedCount.textContent = Number(summary.confirmedCount || 0).toLocaleString('en-PH');
    if (collectionPendingAmount) collectionPendingAmount.textContent = normalizeText(summary.pendingAmountDisplay) || formatAmount(summary.pendingAmount || 0);
    if (collectionConfirmedAmount) collectionConfirmedAmount.textContent = normalizeText(summary.confirmedAmountDisplay) || formatAmount(summary.confirmedAmount || 0);
}

function renderCollectionRows() {
    if (!collectionTableBody) {
        return;
    }

    if (!state.collectionItems.length) {
        const label = COLLECTION_FILTER_LABELS[normalizeCollectionFilter(state.filters.collectionStatus)] || 'Delivered';
        collectionTableBody.innerHTML = `<tr><td class="empty-row" colspan="8">No ${appClient.escapeHtml(label)} collection rows.</td></tr>`;
        return;
    }

    const ownerCanConfirm = canOwnerConfirmCollection();
    collectionTableBody.innerHTML = state.collectionItems.map((row) => {
        const orderLookup = resolveOrderLookup(row);
        const orderNumber = normalizeText(row.orderNumber || row.receiptNumber || row.orderKey || '-');
        const trackingNumber = normalizeText(row.trackingNumber || '-');
        const collectionStatus = normalizeText(row.collectionStatus) || 'Pending';
        const encodedOrderLookup = encodeURIComponent(orderLookup);
        const confirmedBy = normalizeText(row.collectionConfirmedBy);
        const confirmedAt = formatDateTime(row.collectionConfirmedAt);
        const hasOrderLookup = Boolean(orderLookup);
        const canManageCollection = ownerCanConfirm && hasOrderLookup;
        const isConfirmed = collectionStatus.toLowerCase() === 'confirmed';

        const actionMarkup = isConfirmed
            ? (
                canManageCollection
                    ? `
                        <div class="collection-action-stack">
                          <span class="collection-note">Confirmed${confirmedBy ? ` by ${appClient.escapeHtml(confirmedBy)}` : ''}${confirmedAt ? ` on ${appClient.escapeHtml(confirmedAt)}` : ''}</span>
                          <div class="collection-action-buttons">
                            <button class="btn secondary btn-inline" type="button" data-action="undo-collection-confirm" data-order-key="${appClient.escapeHtml(encodedOrderLookup)}">Undo Confirm</button>
                            <button class="btn warning btn-inline" type="button" data-action="return-in-transit" data-order-key="${appClient.escapeHtml(encodedOrderLookup)}">Return to In Transit</button>
                          </div>
                        </div>
                      `
                    : `<span class="collection-note">Confirmed${confirmedBy ? ` by ${appClient.escapeHtml(confirmedBy)}` : ''}${confirmedAt ? ` on ${appClient.escapeHtml(confirmedAt)}` : ''}</span>`
            )
            : (
                canManageCollection
                    ? `
                        <div class="collection-action-stack">
                          <div class="collection-action-buttons">
                            <button class="btn primary btn-inline" type="button" data-action="confirm-collection" data-order-key="${appClient.escapeHtml(encodedOrderLookup)}">Confirm Collected</button>
                            <button class="btn warning btn-inline" type="button" data-action="return-in-transit" data-order-key="${appClient.escapeHtml(encodedOrderLookup)}">Return to In Transit</button>
                          </div>
                        </div>
                      `
                    : '<span class="collection-note">Owner confirmation required</span>'
            );

        return `
            <tr>
              <td>${appClient.escapeHtml(formatDate(row.saleDate))}</td>
              <td>${appClient.escapeHtml(orderNumber)}</td>
              <td>${appClient.escapeHtml(normalizeText(row.clientName) || '-')}</td>
              <td><span class="tracking-text">${appClient.escapeHtml(trackingNumber)}</span></td>
              <td><span class="pill ${branchClassName(row.branch)}">${appClient.escapeHtml(normalizeText(row.branch) || '-')}</span></td>
              <td>${appClient.escapeHtml(formatAmount(row.amountToCollect))}</td>
              <td><span class="pill ${collectionStatusClassName(collectionStatus)}">${appClient.escapeHtml(collectionStatus)}</span></td>
              <td><div class="collection-action">${actionMarkup}</div></td>
            </tr>
        `;
    }).join('');
}

function deliveryClassName(status) {
    const normalizedStatus = normalizeDeliveryStatus(status, 'In Transit');
    if (normalizedStatus === 'Delivered') {
        return 'delivery-delivered';
    }
    if (normalizedStatus === 'RTS') {
        return 'delivery-rts';
    }
    if (normalizedStatus === 'RTO') {
        return 'delivery-rto';
    }
    if (
        normalizedStatus === 'W/ Concern'
        || normalizedStatus === 'Delivery Attempt Failed'
        || normalizedStatus === 'Payment Issue During Delivery'
        || normalizedStatus === 'On Hold'
    ) {
        return 'delivery-concern';
    }
    if (normalizedStatus === 'Out for Delivery') {
        return 'delivery-out-for-delivery';
    }
    if (normalizedStatus === 'Pending') {
        return 'delivery-pending';
    }
    if (normalizedStatus === 'Ready for Pick-up') {
        return 'delivery-ready-pickup';
    }
    if (normalizedStatus === 'In Transfer') {
        return 'delivery-in-transfer';
    }
    if (normalizedStatus === 'Re-Deliver') {
        return 'delivery-re-deliver';
    }
    if (normalizedStatus === 'Pending for Pick-Up') {
        return 'delivery-pending-pickup';
    }
    return 'delivery-in-transit';
}

function applyDeliveryStatusSelectClass(selectElement, statusValue = '') {
    if (!(selectElement instanceof Element)) {
        return;
    }
    selectElement.classList.remove(...DELIVERY_SELECT_CLASS_NAMES);
    selectElement.classList.add(`status-${deliveryClassName(statusValue)}`);
}

function branchClassName(branch) {
    const normalized = normalizeText(branch).toLowerCase();
    if (normalized === 'pampanga') return 'branch-pampanga';
    if (normalized === 'cubao') return 'branch-cubao';
    return 'branch-default';
}

function collectionStatusClassName(status) {
    const normalized = normalizeText(status).toLowerCase();
    if (normalized === 'confirmed') {
        return 'collection-confirmed';
    }
    return 'collection-pending';
}

function formatDate(value) {
    const raw = normalizeText(value);
    if (!raw) {
        return '-';
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return raw;
    }

    return parsed.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: '2-digit'
    });
}

function formatDateTime(value) {
    const raw = normalizeText(value);
    if (!raw) {
        return '';
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return raw;
    }

    return parsed.toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatAmount(value) {
    const numericValue = Number(value || 0);
    if (!Number.isFinite(numericValue)) {
        return 'PHP 0.00';
    }
    return numericValue.toLocaleString('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function startTrackingRowEdit(orderLookup = '') {
    if (state.locked || state.loading) {
        return;
    }

    const normalizedOrderLookup = normalizeText(orderLookup);
    if (!normalizedOrderLookup) {
        setStatus('Order number is missing for edit action.', true);
        return;
    }

    const targetRow = state.items.find((item) => resolveOrderLookup(item) === normalizedOrderLookup);
    if (targetRow && !canEditTrackingRow(targetRow)) {
        setStatus(getLbcEditRestrictionMessage(targetRow.branch), true);
        return;
    }

    state.editingOrderKey = normalizedOrderLookup;
    state.savingOrderKey = '';
    renderRows();
}

function cancelTrackingRowEdit() {
    state.editingOrderKey = '';
    state.savingOrderKey = '';
    renderRows();
}

function normalizeDateMonitoredInput(value) {
    const normalized = normalizeText(value);
    if (!normalized) {
        return '';
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
        return normalized;
    }
    return parsed.toISOString();
}

async function handleTrackingRowEditSave(orderLookup = '', rowElement = null) {
    if (state.locked || state.loading) {
        return;
    }

    const normalizedOrderLookup = normalizeText(orderLookup);
    if (!normalizedOrderLookup) {
        setStatus('Order number is missing for save action.', true);
        return;
    }

    const currentRow = state.items.find((item) => resolveOrderLookup(item) === normalizedOrderLookup);
    if (!currentRow) {
        setStatus('Tracking row is no longer visible. Reload and try again.', true);
        return;
    }
    if (!canEditTrackingRow(currentRow)) {
        setStatus(getLbcEditRestrictionMessage(currentRow.branch), true);
        return;
    }

    const editRow = rowElement instanceof Element
        ? rowElement
        : Array.from(trackingTableBody?.querySelectorAll('tr') || []).find(
            (element) => decodeOrderLookup(element.getAttribute('data-order-key') || '') === normalizedOrderLookup
        );
    if (!(editRow instanceof Element)) {
        setStatus('Unable to read editable row values.', true);
        return;
    }

    const trackingInput = editRow.querySelector('input[data-field="tracking-number"]');
    const amountInput = editRow.querySelector('input[data-field="amount-to-collect"]');
    const statusInput = editRow.querySelector('select[data-field="delivery-status"]');
    const dateMonitoredInput = editRow.querySelector('input[data-field="date-monitored"]');

    const trackingNumber = normalizeText(trackingInput?.value).toUpperCase();
    if (trackingNumber && !TRACKING_NUMBER_REGEX.test(trackingNumber)) {
        setStatus('Tracking number must be alphanumeric and up to 12 characters.', true);
        trackingInput?.focus();
        return;
    }

    const parsedAmount = Number(amountInput?.value);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
        setStatus('Amount to collect must be a valid non-negative number.', true);
        amountInput?.focus();
        return;
    }

    const deliveryStatus = normalizeDeliveryStatus(statusInput?.value, normalizeDeliveryStatus(currentRow.deliveryStatus, 'In Transit'));
    const payload = {
        trackingNumber,
        amountToCollect: Number(parsedAmount.toFixed(2)),
        deliveryStatus,
        dateMonitored: normalizeDateMonitoredInput(dateMonitoredInput?.value)
    };

    setActionLoading(true);
    state.savingOrderKey = normalizedOrderLookup;
    setStatus(`Saving updates for ${normalizeText(currentRow.orderNumber || currentRow.receiptNumber || currentRow.orderKey || normalizedOrderLookup)}...`);

    try {
        const updatedRow = await appClient.updateLbcTracking(normalizedOrderLookup, payload);
        state.editingOrderKey = '';
        await loadRows({ keepStatus: true });
        const orderLabel = normalizeText(updatedRow?.orderNumber || updatedRow?.receiptNumber || normalizedOrderLookup);
        const nextStatus = normalizeDeliveryStatus(updatedRow?.deliveryStatus, deliveryStatus);
        setStatus(`Updated ${orderLabel}: ${nextStatus}${trackingNumber ? ` / ${trackingNumber}` : ' / NO TRACKING'}.`);
    } catch (error) {
        console.error('Failed to update LBC tracking row:', error);
        setStatus(error.message || 'Failed to save tracking row update.', true);
    } finally {
        state.savingOrderKey = '';
        setActionLoading(false);
    }
}

function canOwnerConfirmCollection() {
    const role = normalizeText(state.session?.role).toLowerCase();
    return role === 'head_admin' || role === 'company_admin' || role === 'super_admin';
}

function setAutoDetectResult(message, isError = false) {
    if (!autoDetectResult) {
        return;
    }
    autoDetectResult.textContent = normalizeText(message);
    autoDetectResult.style.color = isError ? '#b91c1c' : '#0f766e';
}

function resolveAutoDetectedOrder(orderLookup = '') {
    const lookup = normalizeText(orderLookup).toLowerCase();
    if (lookup) {
        const exact = state.items.find((item) => {
            const values = [
                item.orderNumber,
                item.receiptNumber,
                item.orderKey
            ].map((value) => normalizeText(value).toLowerCase()).filter(Boolean);
            return values.includes(lookup) && canEditTrackingRow(item);
        });
        if (exact) {
            return exact;
        }

        const partial = state.items.find((item) => {
            const values = [
                item.orderNumber,
                item.receiptNumber,
                item.orderKey
            ].map((value) => normalizeText(value).toLowerCase()).filter(Boolean);
            return values.some((value) => value.includes(lookup)) && canEditTrackingRow(item);
        });
        if (partial) {
            return partial;
        }
    }

    const queue = [...state.items]
        .filter((item) => !normalizeText(item.trackingNumber))
        .filter((item) => canEditTrackingRow(item))
        .sort((left, right) => {
            const leftDate = Date.parse(normalizeText(left.saleDate)) || 0;
            const rightDate = Date.parse(normalizeText(right.saleDate)) || 0;
            return leftDate - rightDate;
        });

    return queue[0] || null;
}

function handleAutoDetectOrder() {
    const trackingValue = normalizeText(trackingScanInput?.value).toUpperCase();
    const orderLookup = normalizeText(orderLookupInput?.value);

    if (trackingValue && !TRACKING_NUMBER_REGEX.test(trackingValue)) {
        setAutoDetectResult('Tracking number must be alphanumeric and up to 12 characters.', true);
        return;
    }

    const targetOrder = resolveAutoDetectedOrder(orderLookup);
    if (!targetOrder) {
        if (!orderLookup) {
            setAutoDetectResult('No visible queue item in current filter. Save will still assign sequentially on the server.');
            return;
        }
        setAutoDetectResult('No available LBC order found for auto-detect.', true);
        return;
    }

    const previewLabel = normalizeText(targetOrder.orderNumber || targetOrder.receiptNumber || targetOrder.orderKey);
    const previewClient = normalizeText(targetOrder.clientName) || 'Unknown client';
    setAutoDetectResult(`Detected order ${previewLabel} (${previewClient}).`);
}

async function handleSingleTrackingSave() {
    if (state.locked) {
        return;
    }

    const trackingNumber = normalizeText(trackingScanInput?.value).toUpperCase();
    const orderLookup = normalizeText(orderLookupInput?.value);

    if (!trackingNumber) {
        setStatus('Tracking number is required.', true);
        focusTrackingInput({ select: true });
        return;
    }

    if (!TRACKING_NUMBER_REGEX.test(trackingNumber)) {
        setStatus('Tracking number must be alphanumeric and up to 12 characters.', true);
        focusTrackingInput({ select: true });
        return;
    }

    if (orderLookup) {
        const targetRow = state.items.find((item) => resolveOrderLookup(item) === orderLookup);
        if (targetRow && !canEditTrackingRow(targetRow)) {
            setStatus(getLbcEditRestrictionMessage(targetRow.branch), true);
            focusTrackingInput({ select: true });
            return;
        }
    } else if (!canUseTrackingWriteActions()) {
        setStatus(getLbcEditRestrictionMessage(state.filters.branch), true);
        focusTrackingInput({ select: true });
        return;
    }

    const payload = {
        branch: state.filters.branch,
        items: [
            orderLookup
                ? { orderLookup, trackingNumber }
                : { trackingNumber }
        ]
    };

    setActionLoading(true);
    setStatus('Saving tracking number...');

    try {
        const result = await appClient.bulkAssignLbcTracking(payload);
        const assignedCount = Number(result?.assignedCount || 0);
        const skippedCount = Number(result?.skippedCount || 0);

        await loadRows({ keepStatus: true });

        if (assignedCount > 0) {
            const item = Array.isArray(result?.items) ? result.items[0] : null;
            const orderNumber = normalizeText(item?.orderNumber || item?.receiptNumber || item?.orderKey || '');
            const savedStatus = normalizeDeliveryStatus(item?.deliveryStatus, 'Pending');
            setStatus(`Saved ${trackingNumber} to ${orderNumber || 'an order'}. Current status: ${savedStatus}.`);
            if (trackingScanInput) trackingScanInput.value = '';
            if (!orderLookup && orderLookupInput) {
                orderLookupInput.value = '';
            }
            setAutoDetectResult('');
        } else {
            const reason = normalizeText(result?.skipped?.[0]?.reason || 'No order could be assigned.');
            setStatus(reason, true);
        }

        if (skippedCount > 0 && assignedCount > 0) {
            const reason = normalizeText(result?.skipped?.[0]?.reason || '');
            if (reason) {
                setStatus(`Saved 1 tracking number. ${skippedCount} skipped: ${reason}`);
            }
        }
    } catch (error) {
        console.error('Failed to save tracking number:', error);
        setStatus(error.message || 'Failed to save tracking number.', true);
    } finally {
        setActionLoading(false);
        focusTrackingInput({ select: true });
    }
}

function parseBulkTrackingEntries(rawText = '') {
    const lines = String(rawText || '').split(/\r?\n/);
    const entries = [];

    lines.forEach((line) => {
        const cleanedLine = normalizeText(line);
        if (!cleanedLine) {
            return;
        }

        const tokens = cleanedLine.split(/[\s,;|:=]+/).map((token) => normalizeText(token)).filter(Boolean);
        if (!tokens.length) {
            return;
        }

        if (tokens.length === 1) {
            entries.push({
                trackingNumber: tokens[0]
            });
            return;
        }

        const firstToken = tokens[0];
        const lastToken = tokens[tokens.length - 1];
        const firstIsTracking = TRACKING_NUMBER_REGEX.test(firstToken);
        const lastIsTracking = TRACKING_NUMBER_REGEX.test(lastToken);

        if (firstIsTracking && !lastIsTracking) {
            entries.push({
                orderLookup: lastToken,
                trackingNumber: firstToken
            });
            return;
        }

        entries.push({
            orderLookup: firstToken,
            trackingNumber: lastToken
        });
    });

    return entries;
}

async function handleBulkTrackingSave() {
    if (state.locked) {
        return;
    }

    const entries = parseBulkTrackingEntries(bulkTrackingInput?.value);
    if (!entries.length) {
        setStatus('Add at least one tracking number for bulk input.', true);
        return;
    }
    if (!canUseTrackingWriteActions()) {
        setStatus(getLbcEditRestrictionMessage(state.filters.branch), true);
        return;
    }

    setActionLoading(true);
    setStatus(`Processing ${entries.length} bulk tracking line(s)...`);

    try {
        const result = await appClient.bulkAssignLbcTracking({
            branch: state.filters.branch,
            items: entries
        });
        const assignedCount = Number(result?.assignedCount || 0);
        const skippedCount = Number(result?.skippedCount || 0);
        const skippedReason = normalizeText(result?.skipped?.[0]?.reason || '');

        await loadRows({ keepStatus: true });

        if (assignedCount > 0) {
            if (bulkTrackingInput) {
                bulkTrackingInput.value = '';
            }
            setStatus(`Bulk complete: ${assignedCount} assigned, ${skippedCount} skipped${skippedReason ? ` (${skippedReason})` : ''}.`);
        } else {
            setStatus(skippedReason || 'No tracking number was assigned.', true);
        }
    } catch (error) {
        console.error('Failed bulk tracking assignment:', error);
        setStatus(error.message || 'Failed to process bulk tracking input.', true);
    } finally {
        setActionLoading(false);
        focusTrackingInput();
    }
}

async function handleRefreshTracking() {
    if (state.locked) {
        return;
    }

    setActionLoading(true);
    setStatus('Reloading tracking rows...');

    try {
        const result = await appClient.refreshLbcTrackingStatuses({
            branch: state.filters.branch
        });

        await loadRows({ keepStatus: true });

        const checkedCount = Number(result?.checkedCount || 0);
        const changedCount = Number(result?.changedCount || 0);
        const unchangedCount = Number(result?.unchangedCount || 0);
        const skippedCount = Number(result?.skippedCount || 0);
        setStatus(`Tracking reload complete: checked ${checkedCount}, changed ${changedCount}, unchanged ${unchangedCount}, skipped ${skippedCount}.`);
    } catch (error) {
        console.error('Failed to reload tracking rows:', error);
        setStatus(error.message || 'Failed to reload tracking rows.', true);
    } finally {
        setActionLoading(false);
    }
}

async function handleConfirmCollection(orderKey = '') {
    if (state.locked) {
        return;
    }

    if (!canOwnerConfirmCollection()) {
        setStatus('Owner confirmation is required for this action.', true);
        return;
    }

    const normalizedOrderKey = normalizeText(orderKey);
    if (!normalizedOrderKey) {
        setStatus('Order key is missing for collection confirmation.', true);
        return;
    }

    setActionLoading(true);
    setStatus('Confirming LBC collection...');

    try {
        const updated = await appClient.confirmLbcCollection(normalizedOrderKey, {
            status: 'Confirmed'
        });
        await loadRows({ keepStatus: true });
        const orderLabel = normalizeText(updated?.orderNumber || updated?.receiptNumber || normalizedOrderKey);
        setStatus(`Collection confirmed for ${orderLabel}.`);
    } catch (error) {
        console.error('Failed to confirm LBC collection:', error);
        setStatus(error.message || 'Failed to confirm LBC collection.', true);
    } finally {
        setActionLoading(false);
    }
}

async function handleUndoCollectionConfirmation(orderKey = '') {
    if (state.locked) {
        return;
    }

    if (!canOwnerConfirmCollection()) {
        setStatus('Owner confirmation is required for this action.', true);
        return;
    }

    const normalizedOrderKey = normalizeText(orderKey);
    if (!normalizedOrderKey) {
        setStatus('Order key is missing for undo confirmation.', true);
        return;
    }

    setActionLoading(true);
    setStatus('Reverting collection confirmation...');

    try {
        const updated = await appClient.confirmLbcCollection(normalizedOrderKey, {
            status: 'Pending'
        });
        await loadRows({ keepStatus: true });
        const orderLabel = normalizeText(updated?.orderNumber || updated?.receiptNumber || normalizedOrderKey);
        setStatus(`Collection confirmation reverted for ${orderLabel}.`);
    } catch (error) {
        console.error('Failed to revert collection confirmation:', error);
        setStatus(error.message || 'Failed to revert collection confirmation.', true);
    } finally {
        setActionLoading(false);
    }
}

async function handleCollectionReturnToTransit(orderKey = '') {
    if (state.locked) {
        return;
    }

    if (!canOwnerConfirmCollection()) {
        setStatus('Owner confirmation is required for this action.', true);
        return;
    }

    const normalizedOrderKey = normalizeText(orderKey);
    if (!normalizedOrderKey) {
        setStatus('Order key is missing for return action.', true);
        return;
    }

    setActionLoading(true);
    setStatus('Returning delivery status to In Transit...');

    try {
        const updated = await appClient.updateLbcTracking(normalizedOrderKey, {
            deliveryStatus: 'In Transit',
            dateMonitored: new Date().toISOString()
        });
        await loadRows({ keepStatus: true });
        const orderLabel = normalizeText(updated?.orderNumber || updated?.receiptNumber || normalizedOrderKey);
        setStatus(`${orderLabel} moved back to In Transit.`);
    } catch (error) {
        console.error('Failed to return delivery status to In Transit:', error);
        setStatus(error.message || 'Failed to return delivery status to In Transit.', true);
    } finally {
        setActionLoading(false);
    }
}

function setActionLoading(isLoading) {
    const disabled = Boolean(isLoading || state.locked || state.loading);
    const writeDisabled = Boolean(disabled || !canUseTrackingWriteActions());
    [
        ...branchButtons,
        ...quickFilterButtons,
        ...collectionFilterButtons,
        searchBtn,
        reloadBtn,
        refreshTrackingBtn
    ].forEach((button) => {
        if (button) {
            button.disabled = disabled;
        }
    });

    [
        trackingScanInput,
        orderLookupInput,
        bulkTrackingInput,
        autoDetectBtn,
        saveTrackingBtn,
        saveBulkBtn
    ].forEach((button) => {
        if (button) {
            button.disabled = writeDisabled;
        }
    });

    document.querySelectorAll('button[data-action="confirm-collection"], button[data-action="undo-collection-confirm"], button[data-action="return-in-transit"]').forEach((button) => {
        button.disabled = disabled;
    });

    document.querySelectorAll('button[data-action="edit-tracking-row"], button[data-action="save-tracking-row"], button[data-action="cancel-tracking-row"]').forEach((button) => {
        button.disabled = disabled;
    });
    document.querySelectorAll('#trackingTableBody input[data-field], #trackingTableBody select[data-field]').forEach((field) => {
        field.disabled = disabled;
    });
}

function focusTrackingInput({ select = false } = {}) {
    if (!trackingScanInput || state.locked) {
        return;
    }
    trackingScanInput.focus();
    if (select) {
        trackingScanInput.select();
    }
}

function isTypingTarget(target) {
    if (!target || !(target instanceof Element)) {
        return false;
    }

    const tagName = String(target.tagName || '').toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
}

function setStatus(message, isError = false) {
    if (!panelStatus) {
        return;
    }
    panelStatus.textContent = normalizeText(message);
    panelStatus.classList.toggle('error', Boolean(isError));
}
