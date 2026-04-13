const appClient = window.appClient;

const searchInput = document.getElementById('searchInput');
const refreshBtn = document.getElementById('refreshBtn');
const openModalBtn = document.getElementById('openModalBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalCloseIconBtn = document.getElementById('modalCloseIconBtn');
const saveClientBtn = document.getElementById('saveClientBtn');
const clientModal = document.getElementById('clientModal');
const clientModalTitle = document.getElementById('clientModalTitle');
const clientModalDescription = document.getElementById('clientModalDescription');
const clientModalStatus = document.getElementById('clientModalStatus');
const clientNameInput = document.getElementById('clientNameInput');
const contactNumberInput = document.getElementById('contactNumberInput');
const clientTableBody = document.getElementById('clientTableBody');
const statusText = document.getElementById('statusText');
const visibleCount = document.getElementById('visibleCount');
const uniqueCount = document.getElementById('uniqueCount');
const filterLabel = document.getElementById('filterLabel');
const pageSubtitle = document.getElementById('pageSubtitle');
const clientInsightTitle = document.getElementById('clientInsightTitle');
const clientInsightCopy = document.getElementById('clientInsightCopy');
const clientInsightStats = document.getElementById('clientInsightStats');
const clientHistoryList = document.getElementById('clientHistoryList');
const editSelectedClientBtn = document.getElementById('editSelectedClientBtn');
const openLatestOrderBtn = document.getElementById('openLatestOrderBtn');
const CLIENT_BATCH_SIZE = 500;

const state = {
    clients: [],
    filter: '',
    editingClientId: null,
    loadRequestToken: 0,
    lastFocusedElement: null,
    selectedClientId: null,
    selectedHistoryRequestToken: 0,
    selectedHistoryLoading: false,
    selectedHistoryErrorMessage: '',
    selectedHistorySummary: null,
    selectedHistoryItems: []
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    const debouncedLoadClients = debounce(() => {
        void loadClients(state.filter);
    }, 180);

    searchInput.addEventListener('input', (event) => {
        state.filter = event.target.value.trim();
        debouncedLoadClients();
    });

    refreshBtn.addEventListener('click', () => {
        void loadClients(state.filter);
    });
    openModalBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    modalCloseIconBtn.addEventListener('click', closeModal);
    saveClientBtn.addEventListener('click', saveClient);
    editSelectedClientBtn?.addEventListener('click', handleEditSelectedClient);
    openLatestOrderBtn?.addEventListener('click', handleOpenLatestOrder);
    clientHistoryList?.addEventListener('click', handleHistoryListClick);

    contactNumberInput.addEventListener('input', () => {
        contactNumberInput.value = contactNumberInput.value.replace(/[^\d\s()+-]/g, '');
    });

    clientModal.addEventListener('click', (event) => {
        if (event.target === clientModal) {
            closeModal();
        }
    });
    clientTableBody.addEventListener('click', handleClientRowClick);
    window.addEventListener('keydown', handleWindowKeydown);

    [clientNameInput, contactNumberInput].forEach((input) => {
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                saveClient();
            }
        });
    });

    renderClientInsight();

    await Promise.all([
        applyCompanySubtitle(),
        loadClients()
    ]);
}

async function applyCompanySubtitle() {
    if (!pageSubtitle) {
        return;
    }

    try {
        const bootstrap = await appClient.getBootstrap();
        const companyName = String(bootstrap?.company?.name || '').trim();
        if (companyName) {
            pageSubtitle.textContent = `All client data for ${companyName}.`;
            return;
        }
    } catch (_error) {
        // Keep fallback subtitle when bootstrap is unavailable.
    }

    pageSubtitle.textContent = 'All client data for your company.';
}

async function loadClients(filter = '') {
    const requestToken = ++state.loadRequestToken;
    refreshBtn.disabled = true;
    setStatus('Loading client records...', false);

    try {
        const payload = await loadAllClientPages(filter, requestToken);
        if (requestToken !== state.loadRequestToken) {
            return;
        }
        state.clients = Array.isArray(payload.items) ? payload.items : [];
        renderClients(state.clients);
        updateSummary(filter, state.clients);
        syncSelectedClientAfterLoad();
        setStatus(`Loaded ${state.clients.length} client record(s).`, false);
    } catch (error) {
        if (requestToken !== state.loadRequestToken) {
            return;
        }
        console.error('Failed to load clients:', error);
        state.clients = [];
        renderClients([]);
        updateSummary(filter, []);
        clearSelectedClientInsight({ rerenderRows: false });
        setStatus(error.message || 'Unable to load client records.', true);
    } finally {
        if (requestToken === state.loadRequestToken) {
            refreshBtn.disabled = false;
        }
    }
}

async function loadAllClientPages(filter = '', requestToken) {
    const normalizedFilter = String(filter || '').trim();
    const allItems = [];
    let offset = 0;

    while (true) {
        if (requestToken !== state.loadRequestToken) {
            return { items: [] };
        }

        // Load the client directory in pages so the screen is not capped at the default API batch size.
        const payload = await appClient.listClients(normalizedFilter, CLIENT_BATCH_SIZE, offset);
        const items = Array.isArray(payload?.items) ? payload.items : [];

        allItems.push(...items);
        if (items.length < CLIENT_BATCH_SIZE) {
            return {
                ...payload,
                items: allItems
            };
        }

        offset += items.length;
    }
}

function renderClients(rows) {
    if (!rows.length) {
        clientTableBody.innerHTML = '<tr><td colspan="5" class="empty">No client records found.</td></tr>';
        return;
    }

    clientTableBody.innerHTML = rows.map((client) => `
        <tr
            data-client-id="${appClient.escapeHtml(client.id)}"
            class="${String(client.id) === String(state.selectedClientId) ? 'is-selected' : ''}"
            title="Click to review this client's order history"
        >
            <td><strong>${appClient.escapeHtml(client.name)}</strong></td>
            <td>${appClient.escapeHtml(formatContactNumber(client.contact_number))}</td>
            <td><span class="source-tag">${appClient.escapeHtml(formatSource(client.source))}</span></td>
            <td>${appClient.escapeHtml(formatCreatedAt(client.created_at))}</td>
            <td class="actions-cell">
                <div class="row-actions">
                    <button type="button" class="action-btn" data-action="edit" data-client-id="${appClient.escapeHtml(client.id)}">Edit</button>
                    <button type="button" class="danger-btn" data-action="delete" data-client-id="${appClient.escapeHtml(client.id)}">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function updateSummary(filter, rows) {
    const uniqueNumbers = new Set(
        rows
            .map((client) => normalizePhContactNumber(client.normalized_contact_number || client.contact_number))
            .filter(Boolean)
    );

    visibleCount.textContent = String(rows.length);
    uniqueCount.textContent = String(uniqueNumbers.size);
    filterLabel.textContent = filter ? `Filter: ${filter}` : 'All Records';
}

function getSelectedClient() {
    return state.clients.find((client) => String(client.id) === String(state.selectedClientId)) || null;
}

function syncSelectedClientAfterLoad() {
    if (!state.selectedClientId) {
        renderClientInsight();
        return;
    }

    const selectedClient = getSelectedClient();
    if (!selectedClient) {
        clearSelectedClientInsight();
        return;
    }

    void loadSelectedClientHistory(selectedClient);
}

function clearSelectedClientInsight({ rerenderRows = true } = {}) {
    state.selectedClientId = null;
    state.selectedHistoryRequestToken += 1;
    state.selectedHistoryLoading = false;
    state.selectedHistoryErrorMessage = '';
    state.selectedHistorySummary = null;
    state.selectedHistoryItems = [];
    if (rerenderRows) {
        renderClients(state.clients);
    }
    renderClientInsight();
}

async function selectClient(client) {
    if (!client?.id) {
        clearSelectedClientInsight();
        return;
    }

    state.selectedClientId = client.id;
    state.selectedHistoryErrorMessage = '';
    renderClients(state.clients);
    await loadSelectedClientHistory(client);
}

async function loadSelectedClientHistory(client) {
    if (!client?.id) {
        clearSelectedClientInsight();
        return;
    }

    const clientId = String(client.id);
    const requestToken = ++state.selectedHistoryRequestToken;
    state.selectedHistoryLoading = true;
    state.selectedHistoryErrorMessage = '';
    state.selectedHistorySummary = null;
    state.selectedHistoryItems = [];
    renderClientInsight();

    try {
        const payload = await appClient.checkOrderClientPending({
            clientName: client.name || '',
            clientContact: client.contact_number || '',
            clientAddress: client.address || '',
            limit: 20
        });
        if (requestToken !== state.selectedHistoryRequestToken || String(state.selectedClientId) !== clientId) {
            return;
        }

        state.selectedHistorySummary = payload?.summary || {};
        state.selectedHistoryItems = Array.isArray(payload?.historyItems) ? payload.historyItems : [];
    } catch (error) {
        if (requestToken !== state.selectedHistoryRequestToken || String(state.selectedClientId) !== clientId) {
            return;
        }

        console.error('Failed to load selected client history:', error);
        state.selectedHistoryErrorMessage = error.message || 'Unable to load this client history right now.';
        state.selectedHistorySummary = null;
        state.selectedHistoryItems = [];
    } finally {
        if (requestToken === state.selectedHistoryRequestToken && String(state.selectedClientId) === clientId) {
            state.selectedHistoryLoading = false;
            renderClientInsight();
        }
    }
}

function renderClientInsight() {
    if (!clientInsightTitle || !clientInsightCopy || !clientInsightStats || !clientHistoryList) {
        return;
    }

    const selectedClient = getSelectedClient();
    const summary = state.selectedHistorySummary || {};
    const latestOrderLookup = String(
        summary.latestOrderNumber
        || state.selectedHistoryItems[0]?.orderNumber
        || state.selectedHistoryItems[0]?.receiptNumber
        || ''
    ).trim();

    if (!selectedClient) {
        clientInsightTitle.textContent = 'Select a client to review order history.';
        clientInsightCopy.textContent = 'Click any client row below to load their saved orders, repeat count, and receipt status.';
        clientInsightStats.innerHTML = '';
        clientHistoryList.innerHTML = '<div class="client-history-empty">No client selected yet. Pili lang ng row sa list para makita agad ang saved orders nila.</div>';
        if (editSelectedClientBtn) {
            editSelectedClientBtn.disabled = true;
        }
        if (openLatestOrderBtn) {
            openLatestOrderBtn.hidden = true;
            openLatestOrderBtn.disabled = true;
            delete openLatestOrderBtn.dataset.orderLookup;
        }
        return;
    }

    if (editSelectedClientBtn) {
        editSelectedClientBtn.disabled = false;
    }

    if (openLatestOrderBtn) {
        openLatestOrderBtn.hidden = !latestOrderLookup;
        openLatestOrderBtn.disabled = !latestOrderLookup;
        if (latestOrderLookup) {
            openLatestOrderBtn.dataset.orderLookup = latestOrderLookup;
            openLatestOrderBtn.innerHTML = `<i class="fa-solid fa-receipt"></i> Open ${appClient.escapeHtml(latestOrderLookup)}`;
        } else {
            delete openLatestOrderBtn.dataset.orderLookup;
        }
    }

    clientInsightTitle.textContent = selectedClient.name || 'Selected client';
    clientInsightCopy.textContent = buildSelectedClientInsightCopy(selectedClient, summary);

    if (state.selectedHistoryLoading) {
        clientInsightStats.innerHTML = buildClientInsightStatsHtml([
            { label: 'Total Orders', value: 'Loading...' },
            { label: 'Pending Orders', value: 'Loading...' },
            { label: 'Settled Orders', value: 'Loading...' },
            { label: 'Latest Order Date', value: 'Loading...' }
        ]);
        clientHistoryList.innerHTML = '<div class="client-history-empty">Checking saved orders and receipt status for this client...</div>';
        return;
    }

    if (state.selectedHistoryErrorMessage) {
        clientInsightStats.innerHTML = '';
        clientHistoryList.innerHTML = `<div class="client-history-empty">${appClient.escapeHtml(state.selectedHistoryErrorMessage)}</div>`;
        return;
    }

    clientInsightStats.innerHTML = buildClientInsightStatsHtml([
        { label: 'Total Orders', value: `${Number(summary.historyCount || 0)}` },
        { label: 'Pending Orders', value: `${Number(summary.pendingCount || 0)}` },
        { label: 'Settled Orders', value: `${Number(summary.settledCount || 0)}` },
        { label: 'Latest Order Date', value: summary.latestSaleDate ? formatSaleDate(summary.latestSaleDate) : '-' }
    ]);
    clientHistoryList.innerHTML = buildClientHistoryListHtml(state.selectedHistoryItems, summary);
}

function buildSelectedClientInsightCopy(client, summary = {}) {
    const metaParts = [
        formatContactNumber(client?.contact_number || ''),
        formatSource(client?.source),
        formatCreatedAt(client?.created_at)
    ];
    const metaText = metaParts.join(' | ');
    const historyCount = Number(summary.historyCount || 0);
    const visibleHistoryCount = Array.isArray(state.selectedHistoryItems) ? state.selectedHistoryItems.length : 0;

    if (state.selectedHistoryLoading) {
        return `${metaText} | Loading recent order history...`;
    }

    if (state.selectedHistoryErrorMessage) {
        return `${metaText} | Client history is temporarily unavailable.`;
    }

    if (!historyCount) {
        return `${metaText} | No saved orders found yet for this client.`;
    }

    const historyNote = historyCount > visibleHistoryCount && visibleHistoryCount > 0
        ? `Showing latest ${visibleHistoryCount} of ${historyCount} saved orders.`
        : `Showing ${visibleHistoryCount || historyCount} saved order${historyCount === 1 ? '' : 's'}.`;

    return `${metaText} | ${historyNote}`;
}

function buildClientInsightStatsHtml(entries = []) {
    return entries.map((entry) => `
        <div class="client-insight-stat">
            <span>${appClient.escapeHtml(entry.label)}</span>
            <strong>${appClient.escapeHtml(entry.value)}</strong>
        </div>
    `).join('');
}

function buildClientHistoryListHtml(items = [], summary = {}) {
    const safeItems = Array.isArray(items) ? items : [];
    if (!safeItems.length) {
        return '<div class="client-history-empty">No previous client orders found for this saved record.</div>';
    }

    const cardsHtml = safeItems.map((item) => {
        const orderLookup = String(item.orderNumber || item.receiptNumber || '').trim();
        const orderLabel = item.receiptNumber && item.orderNumber && item.receiptNumber !== item.orderNumber
            ? `${item.receiptNumber} / ${item.orderNumber}`
            : (item.receiptNumber || item.orderNumber || 'Saved order');
        const metaLine = [
            formatSaleDate(item.saleDate),
            item.cashBranch || item.branch || '-',
            item.paymentMethod || 'Unspecified'
        ].filter(Boolean).join(' | ');
        const productLine = item.productSummary
            ? `Product: ${item.productSummary}`
            : 'Product: No saved product';
        const detailLine = item.hasPending
            ? [
                `Remaining ${formatMoney(item.remainingAmount || 0)}`,
                `Paid ${formatMoney(item.amountPaid || 0)} / ${formatMoney(item.orderTotal || 0)}`,
                item.adminName || 'No admin'
            ].join(' | ')
            : [
                `Paid ${formatMoney(item.amountPaid || 0)} / ${formatMoney(item.orderTotal || 0)}`,
                item.settledByCashIncome ? 'Cleared via cash income' : (item.adminName || 'No admin')
            ].join(' | ');
        const statusClass = item.hasPending ? 'is-pending' : 'is-settled';
        const statusLabel = item.hasPending
            ? (item.statusLabel || 'Pending')
            : (item.statusLabel || 'Settled');
        const amountLabel = item.hasPending ? formatMoney(item.remainingAmount || 0) : 'No Balance';
        const actionButtonHtml = orderLookup
            ? `<button type="button" class="action-btn" data-open-order="${appClient.escapeHtml(orderLookup)}">Open Order</button>`
            : '';

        return `
            <div class="client-history-item">
                <div class="client-history-copy">
                    <strong>${appClient.escapeHtml(orderLabel)}</strong>
                    <small>${appClient.escapeHtml(item.matchLabel || 'Saved order')}</small>
                    <span>${appClient.escapeHtml(metaLine)}</span>
                    <span>${appClient.escapeHtml(productLine)}</span>
                    <span>${appClient.escapeHtml(detailLine)}</span>
                </div>
                <div class="client-history-actions">
                    <span class="history-status-pill ${appClient.escapeHtml(statusClass)}">${appClient.escapeHtml(statusLabel)}</span>
                    <span class="history-amount-pill ${appClient.escapeHtml(statusClass)}">${appClient.escapeHtml(amountLabel)}</span>
                    ${actionButtonHtml}
                </div>
            </div>
        `;
    }).join('');

    if (Number(summary.historyCount || 0) > safeItems.length) {
        return `${cardsHtml}<div class="client-history-note">Showing the latest ${safeItems.length} saved orders out of ${Number(summary.historyCount || 0)} total matches for this client.</div>`;
    }

    return cardsHtml;
}

function openModal(client = null) {
    state.lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    state.editingClientId = client?.id ?? null;
    clientNameInput.value = client?.name || '';
    contactNumberInput.value = formatContactNumber(client?.contact_number || '');
    clientModalTitle.textContent = state.editingClientId ? 'Update Client' : 'Add Client';
    clientModalDescription.textContent = state.editingClientId
        ? 'I-update ang napiling client record. Kapag binago ang number sa existing number ng ibang client, magpapakita ito ng malinaw na validation error.'
        : 'Mag-add ng bagong client record. Kapag existing na ang number, io-update ang existing record sa halip na mag-error.';
    saveClientBtn.textContent = state.editingClientId ? 'Update Client' : 'Save Client';
    setModalStatus('', false);
    clientModal.classList.add('is-open');
    clientModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    clientNameInput.focus();
}

function closeModal() {
    state.editingClientId = null;
    setModalStatus('', false);
    clientModal.classList.remove('is-open');
    clientModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');

    if (state.lastFocusedElement && typeof state.lastFocusedElement.focus === 'function') {
        try {
            state.lastFocusedElement.focus();
        } catch (_error) {
            // Ignore focus restore failures when the trigger is no longer in the DOM.
        }
    }

    state.lastFocusedElement = null;
}

async function saveClient() {
    const name = clientNameInput.value.trim();
    const contactNumber = contactNumberInput.value.trim();
    const isEditing = state.editingClientId !== null && state.editingClientId !== undefined;

    if (!name || !contactNumber) {
        setModalStatus('Client name and contact number are required.', true);
        setStatus('Client name and contact number are required.', true);
        (!name ? clientNameInput : contactNumberInput).focus();
        return;
    }

    saveClientBtn.disabled = true;
    setModalStatus(isEditing ? 'Updating client record...' : 'Saving client record...', false);
    setStatus(isEditing ? 'Updating client record...' : 'Saving client record...', false);

    try {
        const result = isEditing
            ? await appClient.updateClient(state.editingClientId, { name, contactNumber })
            : await appClient.addClient({ name, contactNumber });
        closeModal();
        await loadClients(state.filter);
        const action = result?.action === 'updated' || isEditing ? 'updated' : 'added';
        setStatus(`Client "${name}" ${action} successfully.`, false);
    } catch (error) {
        console.error('Failed to add client:', error);
        setModalStatus(error.message || 'Unable to save client record.', true);
        setStatus(error.message || 'Unable to save client record.', true);
    } finally {
        saveClientBtn.disabled = false;
    }
}

async function handleClientRowClick(event) {
    const deleteButton = event.target.closest('button[data-action="delete"]');
    if (deleteButton) {
        const targetClientId = deleteButton.dataset.clientId
            || deleteButton.closest('tr[data-client-id]')?.dataset.clientId;
        const targetClient = state.clients.find((entry) => String(entry.id) === String(targetClientId));
        if (!targetClient) {
            return;
        }

        await deleteClientRecord(targetClient, deleteButton);
        return;
    }

    const editButton = event.target.closest('button[data-action="edit"]');
    if (editButton) {
        const targetClientId = editButton.dataset.clientId
            || editButton.closest('tr[data-client-id]')?.dataset.clientId;
        const targetClient = state.clients.find((entry) => String(entry.id) === String(targetClientId));
        if (!targetClient) {
            return;
        }

        openModal(targetClient);
        return;
    }

    const row = event.target.closest('tr[data-client-id]');
    if (!row) {
        return;
    }

    const client = state.clients.find((entry) => String(entry.id) === String(row.dataset.clientId));
    if (!client) {
        return;
    }

    await selectClient(client);
}

async function deleteClientRecord(client, triggerButton = null) {
    const clientName = String(client?.name || '').trim() || 'this client';
    const contactNumber = formatContactNumber(client?.contact_number || '');
    const confirmed = window.confirm(`Delete client "${clientName}" (${contactNumber})? This action cannot be undone.`);
    if (!confirmed) {
        return;
    }

    if (triggerButton) {
        triggerButton.disabled = true;
    }

    setStatus('Deleting client record...', false);

    try {
        await appClient.deleteClient(client.id);
        closeModal();
        await loadClients(state.filter);
        setStatus(`Client "${clientName}" deleted successfully.`, false);
    } catch (error) {
        console.error('Failed to delete client:', error);
        setStatus(error.message || 'Unable to delete client record.', true);
    } finally {
        if (triggerButton) {
            triggerButton.disabled = false;
        }
    }
}

function handleEditSelectedClient() {
    const selectedClient = getSelectedClient();
    if (!selectedClient) {
        return;
    }

    openModal(selectedClient);
}

function handleOpenLatestOrder() {
    const orderLookup = String(openLatestOrderBtn?.dataset.orderLookup || '').trim();
    if (!orderLookup) {
        return;
    }

    openOrderFormForLookup(orderLookup);
}

function handleHistoryListClick(event) {
    const orderButton = event.target.closest('[data-open-order]');
    if (!orderButton) {
        return;
    }

    const orderLookup = String(orderButton.dataset.openOrder || '').trim();
    if (!orderLookup) {
        return;
    }

    openOrderFormForLookup(orderLookup);
}

function formatSource(source) {
    return String(source || '').toLowerCase() === 'seed' ? 'CSV Import' : 'Manual Add';
}

function normalizePhContactNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) {
        return '';
    }

    if (/^639\d{9}$/.test(digits)) {
        return digits;
    }

    if (/^09\d{9}$/.test(digits)) {
        return `63${digits.slice(1)}`;
    }

    if (/^9\d{9}$/.test(digits)) {
        return `63${digits}`;
    }

    if (/^00639\d{9}$/.test(digits)) {
        return digits.slice(2);
    }

    return digits;
}

function formatContactNumber(value) {
    const normalized = normalizePhContactNumber(value);
    if (/^639\d{9}$/.test(normalized)) {
        return `0${normalized.slice(2)}`;
    }

    return String(value || '').trim() || '-';
}

function formatCreatedAt(value) {
    if (!value) {
        return '-';
    }

    const parsed = new Date(value.replace(' ', 'T'));
    if (Number.isNaN(parsed.getTime())) {
        return String(value);
    }

    return parsed.toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

function formatSaleDate(value) {
    if (!value) {
        return '-';
    }

    const parsed = new Date(`${String(value).trim()}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
        return String(value);
    }

    return parsed.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: '2-digit'
    });
}

function formatMoney(value) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(Number(value || 0));
}

function openOrderFormForLookup(orderLookup) {
    if (!orderLookup) {
        return;
    }

    window.location.href = `order_form.html?orderNumber=${encodeURIComponent(orderLookup)}`;
}

function setStatus(message, isError) {
    statusText.textContent = message;
    statusText.classList.toggle('error', Boolean(isError));
}

function setModalStatus(message, isError) {
    if (!clientModalStatus) {
        return;
    }

    clientModalStatus.textContent = message;
    clientModalStatus.hidden = !message;
    clientModalStatus.classList.toggle('error', Boolean(isError));
}

function handleWindowKeydown(event) {
    if (event.key === 'Escape' && clientModal.classList.contains('is-open')) {
        closeModal();
    }
}

function debounce(callback, delay) {
    let timerId = 0;

    return function debouncedCallback(...args) {
        window.clearTimeout(timerId);
        timerId = window.setTimeout(() => {
            callback(...args);
        }, delay);
    };
}
