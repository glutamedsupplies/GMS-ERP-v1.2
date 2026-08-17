const appClient = window.appClient;

const TRACKING_NUMBER_REGEX = /^[A-Za-z0-9]{1,12}$/;
const COLLECTION_FILTER_LABELS = Object.freeze({
    all: 'All Delivered',
    pending: 'Pending Confirmation',
    confirmed: 'Confirmed'
});

const state = {
    branch: '',
    dateScope: 'all_dates',
    search: '',
    collectionStatus: 'all',
    rows: [],
    scanPreview: null,
    scanBusy: false,
    loading: false,
    isCollectionAssignee: false
};

const branchButtons = Array.from(document.querySelectorAll('#branchButtons .lbccc-chip[data-branch]'));
const dateScopeButtons = Array.from(document.querySelectorAll('#dateScopeButtons .lbccc-chip[data-date-scope]'));
const collectionFilterButtons = Array.from(document.querySelectorAll('#collectionFilterButtons .lbccc-chip[data-collection-filter]'));
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const reloadBtn = document.getElementById('reloadBtn');
const refreshTrackingBtn = document.getElementById('refreshTrackingBtn');
const scanInput = document.getElementById('scanInput');
const scanConfirmBtn = document.getElementById('scanConfirmBtn');
const scanStatus = document.getElementById('scanStatus');
const statusLine = document.getElementById('statusLine');
const collectionTableBody = document.getElementById('collectionTableBody');
const pendingCount = document.getElementById('pendingCount');
const confirmedCount = document.getElementById('confirmedCount');
const pendingAmount = document.getElementById('pendingAmount');
const confirmedAmount = document.getElementById('confirmedAmount');
const confirmView = document.getElementById('confirmView');
const confirmTitle = document.getElementById('confirmTitle');
const confirmSubtitle = document.getElementById('confirmSubtitle');
const confirmDetails = document.getElementById('confirmDetails');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
const confirmSubmitBtn = document.getElementById('confirmSubmitBtn');
const toast = document.getElementById('toast');

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'employee' });
    if (!session) {
        return;
    }

    try {
        const bootstrap = await appClient.getBootstrap();
        appClient.applyBootstrapBrandTheme(bootstrap);
    } catch (_error) {
        // Page still works with cached/default tenant theme.
    }

    state.isCollectionAssignee = await loadCollectionAssigneeState();
    bindEvents();
    focusScanInput({ select: true });
    await loadRows();
}

async function loadCollectionAssigneeState() {
    try {
        const payload = await appClient.listLbcCollectionAssignees();
        return Boolean(payload?.isAssigned);
    } catch (error) {
        console.error('Failed to load LBC collection assignment:', error);
        return false;
    }
}

function bindEvents() {
    branchButtons.forEach((button) => {
        button.addEventListener('click', () => {
            setActiveButton(branchButtons, button);
            state.branch = button.dataset.branch || '';
            loadRows();
        });
    });

    dateScopeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            setActiveButton(dateScopeButtons, button);
            state.dateScope = button.dataset.dateScope || 'all_dates';
            loadRows();
        });
    });

    collectionFilterButtons.forEach((button) => {
        button.addEventListener('click', () => {
            setActiveButton(collectionFilterButtons, button);
            state.collectionStatus = normalizeCollectionFilter(button.dataset.collectionFilter);
            loadRows();
        });
    });

    searchBtn?.addEventListener('click', applySearch);
    searchInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            applySearch();
        }
    });

    reloadBtn?.addEventListener('click', () => loadRows());
    refreshTrackingBtn?.addEventListener('click', () => loadRows());
    scanConfirmBtn?.addEventListener('click', handleScanConfirm);
    scanInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleScanConfirm();
        }
    });

    collectionTableBody?.addEventListener('click', handleTableAction);
    confirmCancelBtn?.addEventListener('click', closeConfirmView);
    confirmSubmitBtn?.addEventListener('click', handleConfirmViewSubmit);
    confirmView?.querySelector('[data-confirm-close="true"]')?.addEventListener('click', closeConfirmView);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !confirmView.hidden) {
            closeConfirmView();
        }
        if (event.key === 'Enter' && !confirmView.hidden && document.activeElement === confirmSubmitBtn) {
            event.preventDefault();
            handleConfirmViewSubmit();
        }
    });
}

function applySearch() {
    state.search = normalizeText(searchInput?.value || '');
    loadRows();
}

function setActiveButton(buttons, activeButton) {
    buttons.forEach((button) => button.classList.toggle('active', button === activeButton));
}

function normalizeCollectionFilter(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(COLLECTION_FILTER_LABELS, normalized) ? normalized : 'all';
}

function normalizeText(value) {
    return String(value || '').trim();
}

function getDateFromScope(dateScope) {
    if (dateScope === 'this_month') {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
    return '';
}

function formatAmount(value) {
    const numericValue = Number(value || 0);
    if (!Number.isFinite(numericValue)) {
        return 'PHP 0.00';
    }
    return `PHP ${numericValue.toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function formatDate(value) {
    const text = normalizeText(value);
    if (!text) {
        return '-';
    }
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
        return text;
    }
    return date.toLocaleDateString('en-PH', {
        month: 'short',
        day: '2-digit',
        year: 'numeric'
    });
}

function setStatus(message = '', isError = false) {
    if (!statusLine) {
        return;
    }
    statusLine.textContent = message;
    statusLine.classList.toggle('is-error', Boolean(isError));
}

function setScanStatus(message = '', isError = false) {
    if (!scanStatus) {
        return;
    }
    const text = normalizeText(message);
    scanStatus.hidden = !text;
    scanStatus.textContent = text;
    scanStatus.classList.toggle('is-error', Boolean(isError));
}

function setLoading(isLoading) {
    state.loading = Boolean(isLoading);
    [reloadBtn, refreshTrackingBtn, searchBtn, scanConfirmBtn].forEach((button) => {
        if (button) {
            button.disabled = state.loading || state.scanBusy;
        }
    });
}

async function loadRows() {
    if (!state.isCollectionAssignee) {
        renderEmpty('You are not assigned to confirm LBC collections.');
        setStatus('LBC Collection Confirmation is not allowed for this account.', true);
        return;
    }

    setLoading(true);
    setStatus('Loading collection rows...');
    renderLoading();

    try {
        const payload = await appClient.listLbcCollections({
            branch: state.branch,
            search: state.search,
            status: state.collectionStatus,
            dateFrom: getDateFromScope(state.dateScope)
        });
        const rows = Array.isArray(payload?.items) ? payload.items : [];
        const summary = normalizeSummary(payload?.summary, rows);

        state.rows = rows;
        renderSummary(summary);
        renderRows(rows);

        const label = COLLECTION_FILTER_LABELS[state.collectionStatus] || 'Delivered';
        setStatus(`Showing ${rows.length.toLocaleString('en-PH')} ${label.toLowerCase()} row(s).`);
    } catch (error) {
        console.error('Failed to load LBC collection rows:', error);
        renderEmpty(error?.message || 'Failed to load LBC collection rows.');
        setStatus(error?.message || 'Failed to load LBC collection rows.', true);
    } finally {
        setLoading(false);
    }
}

function normalizeSummary(summary, rows) {
    if (summary && typeof summary === 'object') {
        return {
            pendingCount: Number(summary.pendingCount || 0),
            confirmedCount: Number(summary.confirmedCount || 0),
            pendingAmountDisplay: summary.pendingAmountDisplay || formatAmount(summary.pendingAmount || 0),
            confirmedAmountDisplay: summary.confirmedAmountDisplay || formatAmount(summary.confirmedAmount || 0)
        };
    }

    return rows.reduce((result, row) => {
        const amount = Number(row.amountToCollect || 0);
        if (normalizeText(row.collectionStatus).toLowerCase() === 'confirmed') {
            result.confirmedCount += 1;
            result.confirmedAmount += amount;
        } else {
            result.pendingCount += 1;
            result.pendingAmount += amount;
        }
        result.pendingAmountDisplay = formatAmount(result.pendingAmount);
        result.confirmedAmountDisplay = formatAmount(result.confirmedAmount);
        return result;
    }, {
        pendingCount: 0,
        confirmedCount: 0,
        pendingAmount: 0,
        confirmedAmount: 0,
        pendingAmountDisplay: formatAmount(0),
        confirmedAmountDisplay: formatAmount(0)
    });
}

function renderSummary(summary) {
    pendingCount.textContent = Number(summary.pendingCount || 0).toLocaleString('en-PH');
    confirmedCount.textContent = Number(summary.confirmedCount || 0).toLocaleString('en-PH');
    pendingAmount.textContent = summary.pendingAmountDisplay || formatAmount(0);
    confirmedAmount.textContent = summary.confirmedAmountDisplay || formatAmount(0);
}

function renderLoading() {
    if (collectionTableBody) {
        collectionTableBody.innerHTML = '<tr><td class="lbccc-empty" colspan="8">Loading delivered collection rows...</td></tr>';
    }
}

function renderEmpty(message) {
    renderSummary({
        pendingCount: 0,
        confirmedCount: 0,
        pendingAmountDisplay: formatAmount(0),
        confirmedAmountDisplay: formatAmount(0)
    });
    if (collectionTableBody) {
        collectionTableBody.innerHTML = `<tr><td class="lbccc-empty" colspan="8">${appClient.escapeHtml(message)}</td></tr>`;
    }
}

function renderRows(rows) {
    if (!collectionTableBody) {
        return;
    }
    if (!rows.length) {
        const label = COLLECTION_FILTER_LABELS[state.collectionStatus] || 'Delivered';
        collectionTableBody.innerHTML = `<tr><td class="lbccc-empty" colspan="8">No ${appClient.escapeHtml(label.toLowerCase())} collection rows.</td></tr>`;
        return;
    }

    collectionTableBody.innerHTML = rows.map((row, index) => {
        const orderLookup = normalizeText(row.orderKey || row.orderNumber || row.receiptNumber);
        const trackingEntryId = normalizeText(row.trackingEntryId || '');
        const trackingNumber = normalizeText(row.trackingNumber || row.tracking_no || '-');
        const orderNumber = normalizeText(row.orderNumber || row.receiptNumber || row.orderKey || '-');
        const collectionStatus = normalizeText(row.collectionStatus || 'Pending');
        const isConfirmed = collectionStatus.toLowerCase() === 'confirmed';
        const confirmedBy = normalizeText(row.collectionConfirmedBy || '');
        const confirmedAt = normalizeText(row.collectionConfirmedAt || '');
        const branch = normalizeText(row.branch || '-');
        const confirmationNote = isConfirmed
            ? `Confirmed${confirmedBy ? ` by ${confirmedBy}` : ''}${confirmedAt ? ` on ${formatDate(confirmedAt)}` : ''}`
            : 'Waiting for owner confirmation';

        return `
            <tr>
              <td>${appClient.escapeHtml(formatDate(row.saleDate))}</td>
              <td class="lbccc-order">${appClient.escapeHtml(orderNumber)}</td>
              <td>${appClient.escapeHtml(normalizeText(row.clientName || '-'))}</td>
              <td><span class="lbccc-tracking">${appClient.escapeHtml(trackingNumber)}</span></td>
              <td><span class="lbccc-pill ${branchClassName(branch)}">${appClient.escapeHtml(branch)}</span></td>
              <td class="lbccc-amount">${appClient.escapeHtml(formatAmount(row.amountToCollect))}</td>
              <td><span class="lbccc-pill ${statusClassName(collectionStatus)}">${appClient.escapeHtml(collectionStatus)}</span></td>
              <td>
                <div class="lbccc-action-stack">
                  <span class="lbccc-action-note">${appClient.escapeHtml(confirmationNote)}</span>
                  <div class="lbccc-table-actions">
                    ${isConfirmed
                        ? `<button class="lbccc-btn" type="button" data-action="undo" data-order-key="${appClient.escapeHtml(orderLookup)}" data-tracking-entry-id="${appClient.escapeHtml(trackingEntryId)}" data-tracking-number="${appClient.escapeHtml(trackingNumber)}">Undo Confirm</button>`
                        : `<button class="lbccc-btn primary" type="button" data-action="review" data-row-index="${appClient.escapeHtml(String(index))}">Review Confirm</button>`
                    }
                    <button class="lbccc-btn warning" type="button" data-action="return" data-order-key="${appClient.escapeHtml(orderLookup)}" data-tracking-entry-id="${appClient.escapeHtml(trackingEntryId)}" data-tracking-number="${appClient.escapeHtml(trackingNumber)}">Return to In Transit</button>
                  </div>
                </div>
              </td>
            </tr>
        `;
    }).join('');
}

function branchClassName(branch) {
    const normalized = normalizeText(branch).toLowerCase();
    if (normalized === 'pampanga') {
        return 'branch-pampanga';
    }
    if (normalized === 'cubao') {
        return 'branch-cubao';
    }
    return 'branch-default';
}

function statusClassName(status) {
    return normalizeText(status).toLowerCase() === 'confirmed' ? 'status-confirmed' : 'status-pending';
}

async function handleScanConfirm() {
    if (!state.isCollectionAssignee) {
        setScanStatus('You are not assigned to confirm LBC collections.', true);
        return;
    }
    if (state.scanBusy || !confirmView.hidden) {
        return;
    }

    const trackingNumber = normalizeText(scanInput?.value).toUpperCase();
    if (!trackingNumber) {
        setScanStatus('Tracking number is required for collection confirmation.', true);
        focusScanInput({ select: true });
        return;
    }
    if (!TRACKING_NUMBER_REGEX.test(trackingNumber)) {
        setScanStatus('Tracking number must be alphanumeric and up to 12 characters.', true);
        focusScanInput({ select: true });
        return;
    }

    state.scanBusy = true;
    scanConfirmBtn.disabled = true;
    scanConfirmBtn.textContent = 'Looking up...';
    setScanStatus(`Looking up delivered tracking ${trackingNumber}...`);

    try {
        const payload = await appClient.listLbcCollections({
            branch: state.branch,
            search: trackingNumber,
            status: 'all',
            dateFrom: getDateFromScope(state.dateScope)
        });
        const matches = (Array.isArray(payload?.items) ? payload.items : []).filter((row) =>
            normalizeText(row.trackingNumber || '').toUpperCase() === trackingNumber
        );

        if (!matches.length) {
            setScanStatus(`No delivered collection row found for ${trackingNumber} in the current branch/date scope.`, true);
            return;
        }

        const pendingMatches = matches.filter((row) => normalizeText(row.collectionStatus).toLowerCase() !== 'confirmed');
        if (pendingMatches.length > 1 || (!pendingMatches.length && matches.length > 1)) {
            setScanStatus(`Multiple delivered rows matched ${trackingNumber}. Choose the correct row from the table.`, true);
            return;
        }

        const targetRow = pendingMatches[0] || matches[0];
        if (normalizeText(targetRow.collectionStatus).toLowerCase() === 'confirmed') {
            setScanStatus(`${trackingNumber} is already collection-confirmed.`);
            scanInput.value = '';
            return;
        }

        openConfirmView(targetRow);
        setScanStatus(`Scanned ${trackingNumber}. Review the details, then confirm collection.`);
    } catch (error) {
        console.error('Failed to confirm collection by tracking scan:', error);
        setScanStatus(error?.message || 'Failed to confirm collection by tracking.', true);
    } finally {
        state.scanBusy = false;
        scanConfirmBtn.disabled = false;
        scanConfirmBtn.textContent = 'Confirm by Tracking';
    }
}

function handleTableAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) {
        return;
    }
    const action = button.dataset.action;
    if (action === 'review') {
        const row = state.rows[Number(button.dataset.rowIndex)];
        if (row) {
            openConfirmView(row);
        }
        return;
    }
    if (action === 'undo') {
        updateCollectionStatus(button, 'Pending');
        return;
    }
    if (action === 'return') {
        returnToTransit(button);
    }
}

function openConfirmView(row) {
    state.scanPreview = row;
    renderConfirmView(row);
    confirmView.hidden = false;
    confirmView.setAttribute('aria-hidden', 'false');
    try {
        confirmSubmitBtn.focus({ preventScroll: true });
    } catch (_error) {
        confirmSubmitBtn.focus();
    }
}

function closeConfirmView() {
    state.scanPreview = null;
    confirmView.hidden = true;
    confirmView.setAttribute('aria-hidden', 'true');
    confirmSubmitBtn.disabled = false;
    confirmSubmitBtn.textContent = 'Confirm Collection';
    focusScanInput({ select: true });
}

function renderConfirmView(row) {
    const trackingNumber = normalizeText(row.trackingNumber || 'Scanned tracking');
    const clientName = normalizeText(row.clientName || 'this client');
    confirmTitle.textContent = `${trackingNumber} ready for confirmation`;
    confirmSubtitle.textContent = `Review ${clientName}'s delivery details below, then confirm the collected payment.`;

    const details = [
        ['Client', normalizeText(row.clientName) || '-'],
        ['Amount', formatAmount(row.amountToCollect)],
        ['Date', formatDate(row.saleDate)],
        ['Tracking Number', normalizeText(row.trackingNumber) || '-'],
        ['Order Number', normalizeText(row.orderNumber || row.receiptNumber || row.orderKey) || '-'],
        ['Receipt Number', normalizeText(row.receiptNumber || row.orderNumber || row.orderKey) || '-'],
        ['Branch', normalizeText(row.branch) || '-'],
        ['Courier', normalizeText(row.courier) || '-'],
        ['Payment Method', normalizeText(row.paymentMethod) || '-'],
        ['Collection Status', normalizeText(row.collectionStatus) || '-']
    ];

    confirmDetails.innerHTML = details.map(([label, value]) => `
        <article class="lbccc-confirm-detail">
          <span class="lbccc-confirm-label">${appClient.escapeHtml(label)}</span>
          <span class="lbccc-confirm-value">${appClient.escapeHtml(value)}</span>
        </article>
    `).join('');
}

async function handleConfirmViewSubmit() {
    if (!state.scanPreview || state.scanBusy) {
        return;
    }
    const row = state.scanPreview;
    const orderLookup = normalizeText(row.orderKey || row.orderNumber || row.receiptNumber);
    const trackingEntryId = normalizeText(row.trackingEntryId || '');
    const trackingNumber = normalizeText(row.trackingNumber || '');
    if (!orderLookup) {
        showToast('Order key is missing for collection confirmation.', 'error');
        return;
    }

    state.scanBusy = true;
    confirmSubmitBtn.disabled = true;
    confirmSubmitBtn.textContent = 'Confirming...';

    try {
        const updated = await appClient.confirmLbcCollection(orderLookup, {
            status: 'Confirmed',
            trackingEntryId
        });
        if (scanInput) {
            scanInput.value = '';
        }
        closeConfirmView();
        await loadRows();
        const orderLabel = updated?.orderNumber || updated?.receiptNumber || orderLookup;
        showToast(`Collection confirmed for ${trackingNumber || orderLabel}.`);
    } catch (error) {
        console.error('Failed to confirm LBC collection:', error);
        showToast(error?.message || 'Failed to confirm LBC collection.', 'error');
        confirmSubmitBtn.disabled = false;
        confirmSubmitBtn.textContent = 'Confirm Collection';
    } finally {
        state.scanBusy = false;
    }
}

async function updateCollectionStatus(button, status) {
    const orderLookup = normalizeText(button.dataset.orderKey || '');
    const trackingEntryId = normalizeText(button.dataset.trackingEntryId || '');
    const trackingNumber = normalizeText(button.dataset.trackingNumber || '');
    if (!orderLookup) {
        showToast('Order key is missing for collection confirmation.', 'error');
        return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = status === 'Confirmed' ? 'Confirming...' : 'Reverting...';

    try {
        const updated = await appClient.confirmLbcCollection(orderLookup, {
            status,
            trackingEntryId
        });
        await loadRows();
        const orderLabel = updated?.orderNumber || updated?.receiptNumber || orderLookup;
        const message = status === 'Confirmed'
            ? `Collection confirmed for ${trackingNumber || orderLabel}.`
            : `Collection confirmation reverted for ${trackingNumber || orderLabel}.`;
        showToast(message);
    } catch (error) {
        console.error('Failed to update collection confirmation:', error);
        button.disabled = false;
        button.textContent = originalText;
        showToast(error?.message || 'Failed to update collection confirmation.', 'error');
    }
}

async function returnToTransit(button) {
    const orderLookup = normalizeText(button.dataset.orderKey || '');
    const trackingEntryId = normalizeText(button.dataset.trackingEntryId || '');
    const trackingNumber = normalizeText(button.dataset.trackingNumber || '');
    if (!orderLookup) {
        showToast('Order key is missing for return action.', 'error');
        return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Returning...';

    try {
        const updated = await appClient.updateLbcTracking(orderLookup, {
            deliveryStatus: 'In Transit',
            dateMonitored: new Date().toISOString(),
            trackingEntryId
        });
        await loadRows();
        const orderLabel = updated?.orderNumber || updated?.receiptNumber || orderLookup;
        showToast(`${trackingNumber || orderLabel} moved back to In Transit.`);
    } catch (error) {
        console.error('Failed to return LBC row to In Transit:', error);
        button.disabled = false;
        button.textContent = originalText;
        showToast(error?.message || 'Failed to return row to In Transit.', 'error');
    }
}

function focusScanInput({ select = false } = {}) {
    if (!scanInput || !confirmView.hidden) {
        return;
    }
    try {
        scanInput.focus({ preventScroll: true });
    } catch (_error) {
        scanInput.focus();
    }
    if (select) {
        scanInput.select();
    }
}

function showToast(message, type = 'success') {
    if (!toast) {
        return;
    }
    toast.textContent = message;
    toast.classList.toggle('is-error', type === 'error');
    toast.hidden = false;
    clearTimeout(showToast.timeoutId);
    showToast.timeoutId = setTimeout(() => {
        toast.hidden = true;
    }, 3800);
}
