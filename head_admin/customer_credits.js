const appClient = window.appClient;

const periodFilter = document.getElementById('periodFilter');
const dateFromFilter = document.getElementById('dateFromFilter');
const dateToFilter = document.getElementById('dateToFilter');
const searchFilter = document.getElementById('searchFilter');
const statusFilter = document.getElementById('statusFilter');
const applyFiltersBtn = document.getElementById('applyFiltersBtn');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const activeDateLabel = document.getElementById('activeDateLabel');
const panelStatus = document.getElementById('panelStatus');
const summaryMeta = document.getElementById('summaryMeta');
const summaryBody = document.getElementById('summaryBody');
const manualActionInput = document.getElementById('manualActionInput');
const manualClientNameInput = document.getElementById('manualClientNameInput');
const manualClientContactInput = document.getElementById('manualClientContactInput');
const manualClientAddressInput = document.getElementById('manualClientAddressInput');
const manualAmountInput = document.getElementById('manualAmountInput');
const manualNoteInput = document.getElementById('manualNoteInput');
const saveManualAdjustmentBtn = document.getElementById('saveManualAdjustmentBtn');
const clearManualAdjustmentBtn = document.getElementById('clearManualAdjustmentBtn');
const manualEditState = document.getElementById('manualEditState');
const clientBalancesMeta = document.getElementById('clientBalancesMeta');
const clientBalancesBody = document.getElementById('clientBalancesBody');
const creditActivityMeta = document.getElementById('creditActivityMeta');
const creditActivityBody = document.getElementById('creditActivityBody');
const adjustmentPanel = document.querySelector('.adjustment-panel');

const CLIENT_LIMIT = 250;
const ENTRY_LIMIT = 250;

const state = {
    syncingPeriod: false,
    loading: false,
    saving: false,
    lastPayload: null,
    editingEntryId: 0,
    editingEntryLabel: '',
    editingClientName: ''
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    bindEvents();
    applyPeriodPreset(periodFilter.value || 'this_month', { load: false });
    await loadCustomerCredits();
}

function bindEvents() {
    periodFilter?.addEventListener('change', () => applyPeriodPreset(periodFilter.value || 'this_month'));
    applyFiltersBtn?.addEventListener('click', loadCustomerCredits);
    resetFiltersBtn?.addEventListener('click', resetFilters);
    saveManualAdjustmentBtn?.addEventListener('click', saveManualAdjustment);
    clearManualAdjustmentBtn?.addEventListener('click', () => clearManualAdjustmentForm({ preserveClient: false }));
    clientBalancesBody?.addEventListener('click', handleFillClientClick);
    creditActivityBody?.addEventListener('click', handleFillClientClick);

    [dateFromFilter, dateToFilter].forEach((input) => {
        input?.addEventListener('change', () => {
            if (!state.syncingPeriod) {
                periodFilter.value = 'custom';
            }
        });
    });
}

function getFilters() {
    return {
        dateFrom: String(dateFromFilter?.value || '').trim(),
        dateTo: String(dateToFilter?.value || '').trim(),
        search: String(searchFilter?.value || '').trim(),
        status: String(statusFilter?.value || 'with_balance').trim(),
        limitClients: CLIENT_LIMIT,
        limitEntries: ENTRY_LIMIT
    };
}

async function loadCustomerCredits() {
    state.loading = true;
    syncActionButtons();
    setPanelStatus('Loading customer credits...', false);

    try {
        const payload = await appClient.listCustomerCredits(getFilters());
        state.lastPayload = payload || null;
        renderSummary(payload?.summary || {});
        renderClientBalances(payload?.clients || []);
        renderCreditActivity(payload?.entries || []);
        activeDateLabel.textContent = buildActiveDateLabel();
        setPanelStatus(
            `Loaded ${Number(payload?.summary?.matchingClientCount || 0)} matching client credit balance(s) and ${Number(payload?.summary?.activityEntriesCount || 0)} activity entr${Number(payload?.summary?.activityEntriesCount || 0) === 1 ? 'y' : 'ies'}.`,
            false
        );
    } catch (error) {
        console.error('Failed to load customer credits:', error);
        state.lastPayload = null;
        renderSummary({});
        renderClientBalances([]);
        renderCreditActivity([]);
        activeDateLabel.textContent = buildActiveDateLabel();
        setPanelStatus(error.message || 'Unable to load customer credits.', true);
    } finally {
        state.loading = false;
        syncActionButtons();
    }
}

function renderSummary(summary = {}) {
    if (!summaryBody) {
        return;
    }

    const cards = [
        {
            label: 'Live Available Credit',
            value: summary.totalAvailableCreditDisplay || formatMoney(0),
            copy: `${Number(summary.clientsWithBalanceCount || 0)} client(s) currently have usable credit balance.`,
            warn: false
        },
        {
            label: 'Clients In View',
            value: String(Number(summary.matchingClientCount || 0)),
            copy: 'Clients shown after search and balance filters.',
            warn: false
        },
        {
            label: 'Added In Range',
            value: summary.activityCreditAddedDisplay || formatMoney(0),
            copy: `${Number(summary.activityEntriesCount || 0)} credit movement entr${Number(summary.activityEntriesCount || 0) === 1 ? 'y' : 'ies'} in the selected activity range.`,
            warn: false
        },
        {
            label: 'Used / Removed In Range',
            value: summary.activityCreditRemovedDisplay || formatMoney(0),
            copy: `${Number(summary.activityClientCount || 0)} client(s) had credit usage or reversal activity in range.`,
            warn: Number(summary.activityCreditRemovedAmount || 0) > 0
        }
    ];

    summaryBody.innerHTML = cards.map((card) => `
        <article class="summary-card ${card.warn ? 'warn' : ''}">
            <span>${appClient.escapeHtml(card.label)}</span>
            <strong>${appClient.escapeHtml(card.value)}</strong>
            <p>${appClient.escapeHtml(card.copy)}</p>
        </article>
    `).join('');

    if (summaryMeta) {
        summaryMeta.textContent = Number(summary.matchingClientCount || 0) > 0
            ? `Live balance is all-time current credit. Added and used totals are based on the selected activity range.`
            : 'No client credit balances matched the current filters.';
    }
}

function renderClientBalances(clients = []) {
    if (!clientBalancesBody) {
        return;
    }

    if (clientBalancesMeta) {
        clientBalancesMeta.textContent = clients.length
            ? `${clients.length} client balance card(s) loaded. Click "Use This Client" to prefill the manual adjustment form, or edit the latest manual credit when available.`
            : 'No client balances matched the current filters.';
    }

    if (!clients.length) {
        clientBalancesBody.innerHTML = '<div class="empty">No customer credit balances found for the selected filters.</div>';
        return;
    }

    clientBalancesBody.innerHTML = clients.map((client) => {
        const clientMeta = [client.clientContact, client.clientAddress].filter(Boolean).join(' | ');
        const lastOrderLookup = String(client.lastRelatedOrderNumber || client.lastRelatedReceiptNumber || '').trim();
        const lastOrderLabel = client.lastRelatedReceiptNumber && client.lastRelatedOrderNumber && client.lastRelatedReceiptNumber !== client.lastRelatedOrderNumber
            ? `${client.lastRelatedReceiptNumber} / ${client.lastRelatedOrderNumber}`
            : (client.lastRelatedReceiptNumber || client.lastRelatedOrderNumber || 'No linked order');

        return `
            <article class="client-card">
                <div class="card-actions">
                    <div>
                        <p class="eyebrow">Client</p>
                        <h3>${appClient.escapeHtml(client.clientName || 'Unnamed Client')}</h3>
                        <p class="client-subtitle">${appClient.escapeHtml(clientMeta || 'No contact or address recorded.')}</p>
                    </div>
                    <span class="balance-pill">${appClient.escapeHtml(client.availableCreditDisplay || formatMoney(0))}</span>
                </div>

                <div class="detail-grid">
                    <div class="detail-card">
                        <span>Available Balance</span>
                        <strong>${appClient.escapeHtml(client.availableCreditDisplay || formatMoney(0))}</strong>
                        <p>Live usable customer credit</p>
                    </div>
                    <div class="detail-card">
                        <span>Total Added</span>
                        <strong>${appClient.escapeHtml(client.totalAddedDisplay || formatMoney(0))}</strong>
                        <p>Credits received from overpayment or manual add</p>
                    </div>
                    <div class="detail-card">
                        <span>Total Used / Removed</span>
                        <strong>${appClient.escapeHtml(client.totalRemovedDisplay || formatMoney(0))}</strong>
                        <p>Applied credits and manual removals</p>
                    </div>
                    <div class="detail-card">
                        <span>Latest Linked Order</span>
                        <strong>${appClient.escapeHtml(lastOrderLabel)}</strong>
                        <p>${appClient.escapeHtml(formatDate(client.lastActivityDate || client.lastActivityAt || ''))}</p>
                    </div>
                </div>

                ${(client.lastNote || client.lastSourceLabel) ? `
                    <div class="client-note">
                        <span>Latest Activity</span>
                        <p>${appClient.escapeHtml([client.lastSourceLabel, client.lastNote].filter(Boolean).join(' | ') || 'No note saved.')}</p>
                    </div>
                ` : ''}

                <div class="card-actions" style="margin-top: 18px;">
                    <div class="entry-meta">${appClient.escapeHtml([client.lastBranch, client.lastAdminName].filter(Boolean).join(' | ') || 'No linked branch or admin details saved.')}</div>
                    <div class="card-actions">
                        <button
                            type="button"
                            class="secondary-btn"
                            data-fill-credit-client="true"
                            data-client-name="${appClient.escapeHtml(encodeURIComponent(client.clientName || ''))}"
                            data-client-contact="${appClient.escapeHtml(encodeURIComponent(client.clientContact || ''))}"
                            data-client-address="${appClient.escapeHtml(encodeURIComponent(client.clientAddress || ''))}"
                        >
                            Use This Client
                        </button>
                        ${client.lastEntryEditable ? `
                            <button
                                type="button"
                                class="ghost-btn"
                                data-edit-credit-entry="true"
                                data-entry-id="${appClient.escapeHtml(String(client.lastEntryId || ''))}"
                                data-entry-action="${appClient.escapeHtml(client.lastEntryAction || 'add')}"
                                data-entry-amount="${appClient.escapeHtml(String(client.lastEntryAmount || '0'))}"
                                data-entry-note="${appClient.escapeHtml(encodeURIComponent(client.lastNote || ''))}"
                                data-entry-source-label="${appClient.escapeHtml(encodeURIComponent(client.lastSourceLabel || 'Manual Adjustment'))}"
                                data-client-name="${appClient.escapeHtml(encodeURIComponent(client.clientName || ''))}"
                                data-client-contact="${appClient.escapeHtml(encodeURIComponent(client.clientContact || ''))}"
                                data-client-address="${appClient.escapeHtml(encodeURIComponent(client.clientAddress || ''))}"
                            >
                                Edit Latest Manual
                            </button>
                        ` : ''}
                        <button
                            type="button"
                            class="ghost-btn"
                            data-open-order="${appClient.escapeHtml(lastOrderLookup)}"
                            ${lastOrderLookup ? '' : 'disabled'}
                        >
                            Open Order
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

function renderCreditActivity(entries = []) {
    if (!creditActivityBody) {
        return;
    }

    if (creditActivityMeta) {
        creditActivityMeta.textContent = entries.length
            ? `${entries.length} activity entr${entries.length === 1 ? 'y' : 'ies'} in the selected date range.`
            : 'No credit activity found in the selected date range.';
    }

    if (!entries.length) {
        creditActivityBody.innerHTML = '<div class="empty">No customer credit activity found in the selected date range.</div>';
        return;
    }

    creditActivityBody.innerHTML = entries.map((entry) => {
        const clientMeta = [entry.clientContact, entry.clientAddress].filter(Boolean).join(' | ');
        const orderLookup = String(entry.relatedOrderNumber || entry.relatedReceiptNumber || '').trim();
        const orderLabel = entry.relatedReceiptNumber && entry.relatedOrderNumber && entry.relatedReceiptNumber !== entry.relatedOrderNumber
            ? `${entry.relatedReceiptNumber} / ${entry.relatedOrderNumber}`
            : (entry.relatedReceiptNumber || entry.relatedOrderNumber || 'No linked order');

        return `
            <article class="activity-card">
                <div class="entry-actions">
                    <div>
                        <p class="eyebrow">${appClient.escapeHtml(entry.sourceLabel || 'Credit Entry')}</p>
                        <h3>${appClient.escapeHtml(entry.clientName || 'Unnamed Client')}</h3>
                        <p class="activity-subtitle">${appClient.escapeHtml(clientMeta || 'No contact or address recorded.')}</p>
                    </div>
                    <span class="entry-pill ${Number(entry.amount || 0) < 0 ? 'is-negative' : 'is-positive'}">${appClient.escapeHtml(entry.amountDisplay || formatMoney(0))}</span>
                </div>

                <div class="detail-grid">
                    <div class="detail-card">
                        <span>When</span>
                        <strong>${appClient.escapeHtml(formatDateTime(entry.createdAt || ''))}</strong>
                        <p>${appClient.escapeHtml(formatDate(entry.saleDate || ''))}</p>
                    </div>
                    <div class="detail-card">
                        <span>Order</span>
                        <strong>${appClient.escapeHtml(orderLabel)}</strong>
                        <p>${appClient.escapeHtml(entry.branch || 'No branch recorded')}</p>
                    </div>
                    <div class="detail-card">
                        <span>Admin</span>
                        <strong>${appClient.escapeHtml(entry.adminName || 'No admin')}</strong>
                        <p>${appClient.escapeHtml(entry.salesRepresentative || 'No sales representative')}</p>
                    </div>
                    <div class="detail-card">
                        <span>Effect</span>
                        <strong>${appClient.escapeHtml(Number(entry.amount || 0) < 0 ? 'Credit Reduced' : 'Credit Added')}</strong>
                        <p>${appClient.escapeHtml(entry.sourceLabel || 'Credit Entry')}</p>
                    </div>
                </div>

                ${entry.note ? `
                    <div class="activity-note">
                        <span>Note</span>
                        <p>${appClient.escapeHtml(entry.note)}</p>
                    </div>
                ` : ''}

                <div class="entry-actions" style="margin-top: 18px;">
                    <div class="entry-meta">${appClient.escapeHtml(entry.lookupType === 'contact' ? 'Matched by contact number' : 'Matched by exact name and address')}</div>
                    <div class="entry-actions">
                        <button
                            type="button"
                            class="secondary-btn"
                            data-fill-credit-client="true"
                            data-client-name="${appClient.escapeHtml(encodeURIComponent(entry.clientName || ''))}"
                            data-client-contact="${appClient.escapeHtml(encodeURIComponent(entry.clientContact || ''))}"
                            data-client-address="${appClient.escapeHtml(encodeURIComponent(entry.clientAddress || ''))}"
                        >
                            Use This Client
                        </button>
                        ${entry.editable ? `
                            <button
                                type="button"
                                class="ghost-btn"
                                data-edit-credit-entry="true"
                                data-entry-id="${appClient.escapeHtml(String(entry.id || ''))}"
                                data-entry-action="${appClient.escapeHtml(entry.action || 'add')}"
                                data-entry-amount="${appClient.escapeHtml(String(entry.amountAbsolute || '0'))}"
                                data-entry-note="${appClient.escapeHtml(encodeURIComponent(entry.note || ''))}"
                                data-entry-source-label="${appClient.escapeHtml(encodeURIComponent(entry.sourceLabel || 'Manual Adjustment'))}"
                                data-client-name="${appClient.escapeHtml(encodeURIComponent(entry.clientName || ''))}"
                                data-client-contact="${appClient.escapeHtml(encodeURIComponent(entry.clientContact || ''))}"
                                data-client-address="${appClient.escapeHtml(encodeURIComponent(entry.clientAddress || ''))}"
                            >
                                Edit
                            </button>
                        ` : ''}
                        <button
                            type="button"
                            class="ghost-btn"
                            data-open-order="${appClient.escapeHtml(orderLookup)}"
                            ${orderLookup ? '' : 'disabled'}
                        >
                            Open Order
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

function handleFillClientClick(event) {
    const editButton = event.target.closest('[data-edit-credit-entry]');
    if (editButton) {
        beginManualAdjustmentEdit({
            entryId: Number(editButton.dataset.entryId || 0),
            action: String(editButton.dataset.entryAction || 'add'),
            amount: Number(editButton.dataset.entryAmount || 0),
            note: decodeURIComponent(String(editButton.dataset.entryNote || '')),
            sourceLabel: decodeURIComponent(String(editButton.dataset.entrySourceLabel || 'Manual Adjustment')),
            clientName: decodeURIComponent(String(editButton.dataset.clientName || '')),
            clientContact: decodeURIComponent(String(editButton.dataset.clientContact || '')),
            clientAddress: decodeURIComponent(String(editButton.dataset.clientAddress || ''))
        });
        return;
    }

    const fillButton = event.target.closest('[data-fill-credit-client]');
    if (fillButton) {
        populateManualAdjustmentForm({
            clientName: decodeURIComponent(String(fillButton.dataset.clientName || '')),
            clientContact: decodeURIComponent(String(fillButton.dataset.clientContact || '')),
            clientAddress: decodeURIComponent(String(fillButton.dataset.clientAddress || ''))
        });
        manualClientNameInput?.focus();
        return;
    }

    const openButton = event.target.closest('[data-open-order]');
    if (!openButton || openButton.disabled) {
        return;
    }

    const orderNumber = String(openButton.dataset.openOrder || '').trim();
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

function beginManualAdjustmentEdit(data = {}) {
    const entryId = Math.max(0, Number(data.entryId || 0));
    if (!entryId) {
        return;
    }

    state.editingEntryId = entryId;
    state.editingEntryLabel = String(data.sourceLabel || 'Manual Adjustment').trim() || 'Manual Adjustment';
    state.editingClientName = String(data.clientName || '').trim();

    if (manualActionInput) {
        manualActionInput.value = String(data.action || 'add').trim().toLowerCase() === 'remove'
            ? 'remove'
            : 'add';
    }
    populateManualAdjustmentForm({
        clientName: data.clientName || '',
        clientContact: data.clientContact || '',
        clientAddress: data.clientAddress || ''
    });
    if (manualAmountInput) {
        manualAmountInput.value = formatAmountInput(data.amount || 0);
    }
    if (manualNoteInput) {
        manualNoteInput.value = data.note || '';
    }

    syncManualAdjustmentUi();
    setPanelStatus(`Editing ${state.editingEntryLabel.toLowerCase()} for ${state.editingClientName || 'this client'}. Save the form to update the credit entry.`, false);
    adjustmentPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    manualAmountInput?.focus();
}

function resetManualAdjustmentEditState() {
    state.editingEntryId = 0;
    state.editingEntryLabel = '';
    state.editingClientName = '';
}

function populateManualAdjustmentForm(data = {}) {
    if (manualClientNameInput && data.clientName !== undefined) {
        manualClientNameInput.value = data.clientName || '';
    }
    if (manualClientContactInput && data.clientContact !== undefined) {
        manualClientContactInput.value = data.clientContact || '';
    }
    if (manualClientAddressInput && data.clientAddress !== undefined) {
        manualClientAddressInput.value = data.clientAddress || '';
    }
}

function getManualAdjustmentPayload() {
    return {
        action: String(manualActionInput?.value || 'add').trim().toLowerCase() === 'remove' ? 'remove' : 'add',
        clientName: String(manualClientNameInput?.value || '').trim(),
        clientContact: String(manualClientContactInput?.value || '').trim(),
        clientAddress: String(manualClientAddressInput?.value || '').trim(),
        amount: Math.max(0, Number(manualAmountInput?.value || 0)),
        note: String(manualNoteInput?.value || '').trim()
    };
}

function validateManualAdjustmentPayload(payload = {}) {
    if (!payload.clientName) {
        return 'Client name is required.';
    }
    if (payload.amount <= 0) {
        return 'Credit amount must be greater than zero.';
    }
    const hasContact = Boolean(normalizeClientContact(payload.clientContact));
    const hasAddressMatch = Boolean(normalizeClientLookup(payload.clientName) && normalizeClientLookup(payload.clientAddress));
    if (!hasContact && !hasAddressMatch) {
        return 'Credit adjustment needs a contact number or the exact client address.';
    }
    return '';
}

async function saveManualAdjustment() {
    const payload = getManualAdjustmentPayload();
    const validationError = validateManualAdjustmentPayload(payload);
    if (validationError) {
        setPanelStatus(validationError, true);
        return;
    }

    state.saving = true;
    syncActionButtons();
    const isEditing = Boolean(state.editingEntryId);
    setPanelStatus(
        isEditing
            ? 'Updating customer credit...'
            : (payload.action === 'remove' ? 'Removing customer credit...' : 'Saving customer credit...'),
        false
    );

    try {
        const result = isEditing
            ? await appClient.updateManualCustomerCredit(state.editingEntryId, payload)
            : await appClient.addManualCustomerCredit(payload);
        clearManualAdjustmentForm({ preserveClient: !isEditing });
        setPanelStatus(
            `${isEditing ? 'Updated' : (payload.action === 'remove' ? 'Removed' : 'Saved')} ${result.amountDisplay || formatMoney(payload.amount)} for ${result.clientName || payload.clientName}. Remaining available credit: ${result.availableCreditDisplay || formatMoney(0)}.`,
            false
        );
        await loadCustomerCredits();
    } catch (error) {
        console.error('Failed to save customer credit adjustment:', error);
        setPanelStatus(error.message || 'Unable to save the customer credit adjustment.', true);
    } finally {
        state.saving = false;
        syncActionButtons();
    }
}

function clearManualAdjustmentForm({ preserveClient = false, preserveEdit = false } = {}) {
    if (!preserveClient) {
        if (manualClientNameInput) manualClientNameInput.value = '';
        if (manualClientContactInput) manualClientContactInput.value = '';
        if (manualClientAddressInput) manualClientAddressInput.value = '';
    }
    if (manualAmountInput) manualAmountInput.value = '';
    if (manualNoteInput) manualNoteInput.value = '';
    if (manualActionInput) manualActionInput.value = 'add';
    if (!preserveEdit) {
        resetManualAdjustmentEditState();
    }
    syncManualAdjustmentUi();
}

function syncActionButtons() {
    const disabled = state.loading || state.saving;
    if (applyFiltersBtn) applyFiltersBtn.disabled = disabled;
    if (resetFiltersBtn) resetFiltersBtn.disabled = disabled;
    if (saveManualAdjustmentBtn) saveManualAdjustmentBtn.disabled = disabled;
    if (clearManualAdjustmentBtn) clearManualAdjustmentBtn.disabled = disabled;
    syncManualAdjustmentUi();
}

function syncManualAdjustmentUi() {
    const isEditing = Boolean(state.editingEntryId);
    if (saveManualAdjustmentBtn) {
        saveManualAdjustmentBtn.textContent = isEditing ? 'Update Adjustment' : 'Save Adjustment';
    }
    if (clearManualAdjustmentBtn) {
        clearManualAdjustmentBtn.textContent = isEditing ? 'Cancel Edit' : 'Clear Form';
    }
    if (manualEditState) {
        if (!isEditing) {
            manualEditState.hidden = true;
            manualEditState.innerHTML = '';
            return;
        }

        manualEditState.hidden = false;
        manualEditState.innerHTML = `
            <strong>Edit Mode</strong>
            You are editing ${appClient.escapeHtml(state.editingEntryLabel || 'a manual credit entry')} for ${appClient.escapeHtml(state.editingClientName || 'this client')}. Click "Update Adjustment" to save changes, or "Cancel Edit" to exit without saving.
        `;
    }
}

function resetFilters() {
    applyPeriodPreset('this_month', { load: false });
    if (searchFilter) searchFilter.value = '';
    if (statusFilter) statusFilter.value = 'with_balance';
    loadCustomerCredits();
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
        loadCustomerCredits();
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

function formatAmountInput(value) {
    const numericValue = Number(value || 0);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return '';
    }
    return String(roundAmountInput(numericValue));
}

function roundAmountInput(value) {
    return Math.round(Number(value || 0) * 100) / 100;
}

function formatDate(value) {
    if (!value) {
        return '-';
    }

    const normalizedValue = String(value).slice(0, 10);
    const parsed = new Date(`${normalizedValue}T00:00:00`);
    return Number.isNaN(parsed.getTime())
        ? String(value)
        : parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateTime(value) {
    if (!value) {
        return '-';
    }

    const normalized = String(value).trim().replace(' ', 'T');
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime())
        ? String(value)
        : parsed.toLocaleString('en-PH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
}

function normalizeClientLookup(value = '') {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeClientContact(value = '') {
    return String(value || '').replace(/[^\d]/g, '');
}

function setPanelStatus(message, isError) {
    if (!panelStatus) {
        return;
    }

    panelStatus.textContent = message;
    panelStatus.classList.toggle('error', Boolean(isError));
}
