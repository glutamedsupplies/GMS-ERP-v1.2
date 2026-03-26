const appClient = window.appClient;

const BOOKING_OPTION_LIST = ['Lalamove', 'Meet-Up', 'Client book', 'TOKTOK', 'MAXIM'];
const SHIPMENT_OPTION_LIST = ['LBC', 'J&T', 'SPX', 'Victory Liner', 'AP Cargo'];
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const AUTO_REFRESH_MS = 25000;
const THREAD_SEARCH_DEBOUNCE_MS = 180;
const FALLBACK_REFERENCES = {
    branches: ['Cubao', 'Pampanga'],
    cashBranches: ['Cubao', 'Pampanga'],
    couriers: [...BOOKING_OPTION_LIST, ...SHIPMENT_OPTION_LIST],
    admins: [],
    salesRepresentatives: [],
    paymentMethods: ['CASH', 'Online Payment', 'Bank Transfer', 'LBC Collection']
};
const STAGE_LABELS = {
    pending_head_admin: 'Waiting For Head Admin',
    for_correction: 'Needs Correction',
    rejected: 'Rejected',
    staff_receipt_pending: 'Waiting For Staff Receipt',
    prep_pending: 'Prep By Receipt',
    delivery_queue: 'Ready For Delivery',
    shipping_queue: 'Ready For Shipping'
};

const state = {
    session: null,
    bootstrap: null,
    role: '',
    assignedBranch: '',
    activeBranch: '',
    references: { ...FALLBACK_REFERENCES },
    clients: [],
    inventoryVariants: [],
    variantsByProduct: new Map(),
    products: [],
    itemRows: [],
    nextItemRowId: 1,
    entries: [],
    counts: {
        total: 0,
        pendingHeadAdmin: 0,
        correction: 0,
        rejected: 0,
        staffReceiptPending: 0,
        prepPending: 0,
        deliveryQueue: 0,
        shippingQueue: 0
    },
    selectedEntryId: '',
    selectedThread: null,
    search: '',
    searchTimer: null,
    loading: false,
    threadLoading: false,
    refreshTimer: null,
    invoiceModalOrder: null
};

const elements = {
    heroCopy: document.getElementById('heroCopy'),
    roleChip: document.getElementById('roleChip'),
    metricPending: document.getElementById('metricPending'),
    metricPrep: document.getElementById('metricPrep'),
    metricDispatch: document.getElementById('metricDispatch'),
    metricTotal: document.getElementById('metricTotal'),
    refreshBtn: document.getElementById('refreshBtn'),
    boardStatus: document.getElementById('boardStatus'),
    submissionSection: document.getElementById('submissionSection'),
    workflowForm: document.getElementById('workflowForm'),
    workflowStatus: document.getElementById('workflowStatus'),
    orderNumber: document.getElementById('orderNumber'),
    orderDate: document.getElementById('orderDate'),
    branchSelect: document.getElementById('branchSelect'),
    cashBranchSelect: document.getElementById('cashBranchSelect'),
    clientName: document.getElementById('clientName'),
    clientNameList: document.getElementById('clientNameList'),
    contactNumber: document.getElementById('contactNumber'),
    courierSelect: document.getElementById('courierSelect'),
    fulfillmentType: document.getElementById('fulfillmentType'),
    fulfillmentOption: document.getElementById('fulfillmentOption'),
    paymentMethod: document.getElementById('paymentMethod'),
    paymentType: document.getElementById('paymentType'),
    adminSelect: document.getElementById('adminSelect'),
    salesRepSelect: document.getElementById('salesRepSelect'),
    deliveryFee: document.getElementById('deliveryFee'),
    handlingFee: document.getElementById('handlingFee'),
    deliveryAddress: document.getElementById('deliveryAddress'),
    paymentReceipt: document.getElementById('paymentReceipt'),
    paymentReceiptPreview: document.getElementById('paymentReceiptPreview'),
    addItemRowBtn: document.getElementById('addItemRowBtn'),
    itemRows: document.getElementById('itemRows'),
    productNameList: document.getElementById('productNameList'),
    totalAmount: document.getElementById('totalAmount'),
    workspaceEyebrow: document.getElementById('workspaceEyebrow'),
    workspaceTitle: document.getElementById('workspaceTitle'),
    workspaceCopy: document.getElementById('workspaceCopy'),
    visibleThreadCount: document.getElementById('visibleThreadCount'),
    branchTabs: document.getElementById('branchTabs'),
    threadSearchInput: document.getElementById('threadSearchInput'),
    threadSidebarTitle: document.getElementById('threadSidebarTitle'),
    threadCountChip: document.getElementById('threadCountChip'),
    threadList: document.getElementById('threadList'),
    threadEmptyState: document.getElementById('threadEmptyState'),
    threadPanelContent: document.getElementById('threadPanelContent'),
    threadHeaderBadges: document.getElementById('threadHeaderBadges'),
    threadClientName: document.getElementById('threadClientName'),
    threadMeta: document.getElementById('threadMeta'),
    threadConfirmBtn: document.getElementById('threadConfirmBtn'),
    threadCorrectionBtn: document.getElementById('threadCorrectionBtn'),
    threadRejectBtn: document.getElementById('threadRejectBtn'),
    threadOpenPaymentReceiptBtn: document.getElementById('threadOpenPaymentReceiptBtn'),
    threadRefreshBtn: document.getElementById('threadRefreshBtn'),
    threadOpenInvoiceBtn: document.getElementById('threadOpenInvoiceBtn'),
    pinnedReceiptCard: document.getElementById('pinnedReceiptCard'),
    pinnedReceiptTitle: document.getElementById('pinnedReceiptTitle'),
    pinnedReceiptMeta: document.getElementById('pinnedReceiptMeta'),
    pinnedReceiptNote: document.getElementById('pinnedReceiptNote'),
    pinnedReceiptPreview: document.getElementById('pinnedReceiptPreview'),
    openPinnedReceiptBtn: document.getElementById('openPinnedReceiptBtn'),
    messageTimeline: document.getElementById('messageTimeline'),
    messageComposer: document.getElementById('messageComposer'),
    composerHelp: document.getElementById('composerHelp'),
    composerStatus: document.getElementById('composerStatus'),
    messageInput: document.getElementById('messageInput'),
    composerAttachmentField: document.getElementById('composerAttachmentField'),
    composerAttachmentLabel: document.getElementById('composerAttachmentLabel'),
    composerAttachmentInput: document.getElementById('composerAttachmentInput'),
    composerAttachmentHint: document.getElementById('composerAttachmentHint'),
    composerAttachmentPreview: document.getElementById('composerAttachmentPreview'),
    sendMessageBtn: document.getElementById('sendMessageBtn'),
    sendInvoiceBtn: document.getElementById('sendInvoiceBtn'),
    sendReceiptBtn: document.getElementById('sendReceiptBtn'),
    completePrepBtn: document.getElementById('completePrepBtn'),
    invoiceModal: document.getElementById('invoiceModal'),
    invoiceModalTitle: document.getElementById('invoiceModalTitle'),
    closeInvoiceModalBtn: document.getElementById('closeInvoiceModalBtn'),
    invoiceModalMeta: document.getElementById('invoiceModalMeta'),
    invoiceModalItems: document.getElementById('invoiceModalItems'),
    invoiceModalTotals: document.getElementById('invoiceModalTotals'),
    threadBranchBlock: document.querySelector('.thread-branch-block')
};

window.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
    const session = await appClient.ensureSession({
        role: 'head_admin',
        allowEmployeeFeature: 'order_form'
    });
    if (!session) {
        return;
    }

    state.session = session;
    state.role = normalizeRole(session.role);
    state.assignedBranch = normalizeBranchLabel(session.branchName || '');
    appClient.attachEmployeeBackButton?.(session, {
        label: state.role === 'staff' ? 'Back to Staff Workspace' : 'Back to Employee Workspace'
    });

    try {
        state.bootstrap = await appClient.getBootstrap();
        appClient.applyBootstrapBrandTheme(state.bootstrap);
        if (!state.assignedBranch) {
            state.assignedBranch = normalizeBranchLabel(state.bootstrap?.user?.branch_name || '');
        }
    } catch (error) {
        console.warn('Unable to load workflow bootstrap:', error);
    }

    await loadReferenceData();
    bindEvents();
    applyRoleView();
    setDefaultDate();
    await refreshOrderNumber();
    ensureItemRows();
    renderItemRows();
    handlePaymentMethodChange();
    handleFulfillmentTypeChange();
    await refreshWorkflow(true);
    startAutoRefresh();
}

function bindEvents() {
    elements.refreshBtn?.addEventListener('click', () => refreshWorkflow(true));
    elements.threadRefreshBtn?.addEventListener('click', () => loadSelectedThread({ showFeedback: true }));
    elements.threadSearchInput?.addEventListener('input', handleThreadSearchInput);
    elements.branchTabs?.addEventListener('click', handleBranchTabClick);
    elements.threadList?.addEventListener('click', handleThreadListClick);
    elements.messageTimeline?.addEventListener('click', handleTimelineClick);
    elements.openPinnedReceiptBtn?.addEventListener('click', () => openAttachment(state.selectedThread?.pinnedReceipt?.attachment));
    elements.threadOpenPaymentReceiptBtn?.addEventListener('click', () => openAttachment(state.selectedThread?.entry?.paymentReceipt));
    elements.threadOpenInvoiceBtn?.addEventListener('click', handleOpenCurrentInvoice);
    elements.threadConfirmBtn?.addEventListener('click', handleConfirmThread);
    elements.threadCorrectionBtn?.addEventListener('click', handleRequestCorrection);
    elements.threadRejectBtn?.addEventListener('click', handleRejectThread);
    elements.messageComposer?.addEventListener('submit', handleSendMessage);
    elements.sendInvoiceBtn?.addEventListener('click', handleSendInvoice);
    elements.sendReceiptBtn?.addEventListener('click', handleSendReceipt);
    elements.completePrepBtn?.addEventListener('click', handleCompletePrep);
    elements.composerAttachmentInput?.addEventListener('change', handleComposerAttachmentChange);
    elements.workflowForm?.addEventListener('submit', handleWorkflowSubmit);
    elements.orderDate?.addEventListener('change', handleOrderDateChange);
    elements.branchSelect?.addEventListener('change', handleBranchSelectChange);
    elements.clientName?.addEventListener('change', handleClientSelection);
    elements.clientName?.addEventListener('blur', handleClientSelection);
    elements.courierSelect?.addEventListener('change', handleCourierChange);
    elements.fulfillmentType?.addEventListener('change', handleFulfillmentTypeChange);
    elements.paymentMethod?.addEventListener('change', handlePaymentMethodChange);
    elements.deliveryFee?.addEventListener('input', renderOrderTotals);
    elements.handlingFee?.addEventListener('input', renderOrderTotals);
    elements.paymentReceipt?.addEventListener('change', handlePaymentReceiptChange);
    elements.addItemRowBtn?.addEventListener('click', handleAddItemRow);
    elements.itemRows?.addEventListener('change', handleItemTableChange);
    elements.itemRows?.addEventListener('input', handleItemTableInput);
    elements.itemRows?.addEventListener('click', handleItemTableClick);
    elements.closeInvoiceModalBtn?.addEventListener('click', closeInvoiceModal);
    elements.invoiceModal?.addEventListener('click', (event) => {
        if (event.target === elements.invoiceModal) {
            closeInvoiceModal();
        }
    });
}

function startAutoRefresh() {
    stopAutoRefresh();
    state.refreshTimer = window.setInterval(() => {
        refreshWorkflow();
    }, AUTO_REFRESH_MS);
}

function stopAutoRefresh() {
    if (state.refreshTimer) {
        window.clearInterval(state.refreshTimer);
        state.refreshTimer = null;
    }
}

async function loadReferenceData() {
    try {
        const [references, variants, clientPayload] = await Promise.all([
            appClient.getSalesReferences(),
            appClient.listInventoryVariants(),
            appClient.listClients('')
        ]);
        state.references = normalizeReferences(references || {});
        state.inventoryVariants = Array.isArray(variants) ? variants : [];
        state.clients = Array.isArray(clientPayload?.items) ? clientPayload.items : [];
    } catch (error) {
        console.warn('Unable to load workflow references:', error);
        state.references = normalizeReferences({});
        state.inventoryVariants = [];
        state.clients = [];
    }

    buildInventoryVariantCache(state.inventoryVariants);
    state.activeBranch = resolveInitialBranch();
    renderBranchTabs();
    renderReferenceFields();
    renderClientDatalist();
    renderProductDatalist();
}

function normalizeReferences(references) {
    const bootstrapBranches = Array.isArray(state.bootstrap?.branches)
        ? state.bootstrap.branches.map((branch) => normalizeBranchLabel(branch?.branch_name || branch?.name || ''))
        : [];
    const branches = uniqueNonEmpty([...(Array.isArray(references.branches) ? references.branches : []), ...bootstrapBranches]);
    const cashBranches = uniqueNonEmpty(Array.isArray(references.cashBranches) ? references.cashBranches : []);
    const admins = uniqueNonEmpty(Array.isArray(references.admins) ? references.admins : []);
    const salesRepresentatives = uniqueNonEmpty(Array.isArray(references.salesRepresentatives) ? references.salesRepresentatives : []);
    const paymentMethods = uniqueNonEmpty(Array.isArray(references.paymentMethods) ? references.paymentMethods : []);
    const couriers = uniqueNonEmpty(Array.isArray(references.couriers) ? references.couriers : []);

    return {
        branches: branches.length ? branches : [...FALLBACK_REFERENCES.branches],
        cashBranches: cashBranches.length ? cashBranches : (branches.length ? branches : [...FALLBACK_REFERENCES.cashBranches]),
        couriers: couriers.length ? couriers : [...FALLBACK_REFERENCES.couriers],
        admins: admins.length ? admins : [state.session?.userName || 'Head Admin'],
        salesRepresentatives: salesRepresentatives.length ? salesRepresentatives : [state.session?.userName || 'Head Admin'],
        paymentMethods: paymentMethods.length ? paymentMethods : [...FALLBACK_REFERENCES.paymentMethods]
    };
}

function resolveInitialBranch() {
    if (state.assignedBranch && state.references.branches.some((branch) => sameText(branch, state.assignedBranch))) {
        return state.references.branches.find((branch) => sameText(branch, state.assignedBranch)) || state.assignedBranch;
    }
    return state.references.branches[0] || 'Cubao';
}

function applyRoleView() {
    const isEmployee = state.role === 'employee';
    const isStaff = state.role === 'staff';
    const isHeadAdmin = isHeadAdminRole(state.role);

    elements.submissionSection.hidden = !isEmployee;
    if (elements.threadBranchBlock) {
        elements.threadBranchBlock.hidden = isEmployee;
    }

    if (elements.heroCopy) {
        elements.heroCopy.textContent = isEmployee
            ? 'Submit a complete order first, then monitor that same order as a read-only conversation while Head Admin and Staff update the workflow.'
            : (isStaff
                ? 'Staff receives each order inside one conversation thread, sends the final receipt there, and marks prep complete before dispatch.'
                : 'Head Admin can confirm orders, send invoice cards, and keep every workflow step inside one conversation thread per order.');
    }

    if (elements.roleChip) {
        elements.roleChip.textContent = isEmployee
            ? 'Employee Read-Only Threads'
            : (isStaff ? 'Staff Thread Workspace' : 'Head Admin Thread Workspace');
    }

    if (elements.workspaceEyebrow) {
        elements.workspaceEyebrow.textContent = isEmployee ? 'My Orders' : (isStaff ? 'Staff Threads' : 'Coordination Threads');
    }
    if (elements.workspaceTitle) {
        elements.workspaceTitle.textContent = isEmployee
            ? 'My Order Conversations'
            : (isStaff ? 'Receipt And Prep Conversations' : 'Communication Panel');
    }
    if (elements.workspaceCopy) {
        elements.workspaceCopy.textContent = isEmployee
            ? 'Read-only view lang ito para makita mo ang latest status, invoice card, at final receipt sa isang thread per order.'
            : (isStaff
                ? 'Confirmed orders, final receipt sending, prep completion, at dispatch updates all stay inside one thread per order.'
                : 'Confirm pending orders, send invoice cards, and review the final receipt from staff without switching between separate boards.');
    }

    if (elements.composerHelp) {
        elements.composerHelp.textContent = isEmployee
            ? 'Read-only thread view for employee orders.'
            : 'Send chat updates here. Invoice and receipt actions appear only when this thread is ready for them.';
    }

    if (elements.threadSidebarTitle) {
        elements.threadSidebarTitle.textContent = isEmployee ? 'My Orders' : 'All Conversations';
    }

    if (!isHeadAdmin && !isStaff) {
        setComposerStatus('Employee thread view is read-only.', false, true);
    }
}

function renderReferenceFields() {
    renderSelect(elements.branchSelect, state.references.branches, '', 'Select branch');
    renderSelect(elements.cashBranchSelect, state.references.cashBranches, '', 'Select cash branch');
    renderSelect(elements.courierSelect, state.references.couriers, '', 'Select courier');
    renderSelect(elements.adminSelect, state.references.admins, state.references.admins[0] || state.session?.userName || '', 'Select admin');
    renderSelect(
        elements.salesRepSelect,
        state.references.salesRepresentatives,
        state.references.salesRepresentatives[0] || state.session?.userName || '',
        'Select sales representative'
    );
    renderSelect(elements.paymentMethod, state.references.paymentMethods, state.references.paymentMethods[0] || '', 'Select payment method');

    const assignedBranch = state.assignedBranch;
    if (elements.branchSelect) {
        elements.branchSelect.value = selectMatchingOption(state.references.branches, assignedBranch || state.activeBranch || state.references.branches[0] || '');
        elements.branchSelect.disabled = state.role === 'employee' && Boolean(assignedBranch);
    }
    if (elements.cashBranchSelect) {
        const cashDefault = assignedBranch || state.activeBranch || state.references.cashBranches[0] || '';
        elements.cashBranchSelect.value = selectMatchingOption(state.references.cashBranches, cashDefault);
        elements.cashBranchSelect.disabled = state.role === 'employee' && Boolean(assignedBranch);
    }
    handlePaymentMethodChange();
}

function renderClientDatalist() {
    if (!elements.clientNameList) {
        return;
    }
    const options = uniqueNonEmpty(state.clients.map((client) => client?.name || ''));
    elements.clientNameList.innerHTML = options.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
}

function buildInventoryVariantCache(rows = []) {
    const grouped = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
        const productName = normalizeText(row?.product_name || row?.productName);
        const setName = normalizeText(row?.set_name || row?.setName || row?.item_set || row?.itemSet);
        if (!productName || !setName) {
            return;
        }
        const key = productName.toLowerCase();
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key).push({
            productName,
            setName,
            itemCode: normalizeText(row?.item_code || row?.itemCode),
            price: Math.max(0, Number(row?.price || 0)),
            helper: normalizeText(row?.helper || [row?.item_code || row?.itemCode, setName].filter(Boolean).join(' | '))
        });
    });

    grouped.forEach((variants) => {
        variants.sort((left, right) => left.setName.localeCompare(right.setName, undefined, { numeric: true }));
    });

    state.variantsByProduct = grouped;
    state.products = Array.from(grouped.values())
        .map((variants) => variants[0]?.productName || '')
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right));
}

function renderProductDatalist() {
    if (!elements.productNameList) {
        return;
    }
    elements.productNameList.innerHTML = state.products
        .map((productName) => `<option value="${escapeHtml(productName)}"></option>`)
        .join('');
}

async function refreshWorkflow(showFeedback = false) {
    if (state.loading) {
        return;
    }

    state.loading = true;
    setBoardStatus(showFeedback ? 'Refreshing workflow threads...' : 'Updating workflow threads...');

    try {
        const response = await appClient.listCommunicationWorkflow({
            branch: state.role === 'employee' ? '' : state.activeBranch,
            search: state.search
        });
        state.entries = Array.isArray(response?.items) ? response.items : [];
        state.counts = response?.counts || state.counts;
        renderMetrics();
        renderBranchTabs();
        renderThreadList();

        const nextSelectedId = state.entries.some((entry) => entry.id === state.selectedEntryId)
            ? state.selectedEntryId
            : (state.entries[0]?.id || '');
        const selectionChanged = nextSelectedId !== state.selectedEntryId;
        state.selectedEntryId = nextSelectedId;

        if (state.selectedEntryId) {
            await loadSelectedThread({ silent: !showFeedback && !selectionChanged });
        } else {
            clearSelectedThread();
        }

        setBoardStatus(`Updated ${formatDateTime(new Date().toISOString())}.`, false, true);
    } catch (error) {
        console.error('Failed to load workflow entries:', error);
        setBoardStatus(error.message || 'Unable to load workflow entries.', true);
    } finally {
        state.loading = false;
    }
}

function renderMetrics() {
    const counts = state.counts || {};
    if (elements.metricPending) {
        elements.metricPending.textContent = String(Number(counts.pendingHeadAdmin || 0) + Number(counts.correction || 0));
    }
    if (elements.metricPrep) {
        elements.metricPrep.textContent = String(Number(counts.staffReceiptPending || 0) + Number(counts.prepPending || 0));
    }
    if (elements.metricDispatch) {
        elements.metricDispatch.textContent = String(Number(counts.deliveryQueue || 0) + Number(counts.shippingQueue || 0));
    }
    if (elements.metricTotal) {
        elements.metricTotal.textContent = String(Number(counts.total || 0));
    }
    if (elements.visibleThreadCount) {
        elements.visibleThreadCount.textContent = String(state.entries.length);
    }
    if (elements.threadCountChip) {
        elements.threadCountChip.textContent = String(state.entries.length);
    }
    if (elements.threadSidebarTitle) {
        elements.threadSidebarTitle.textContent = state.role === 'employee'
            ? 'My Orders'
            : `${state.activeBranch || 'All'} Threads`;
    }
}

function renderBranchTabs() {
    if (!elements.branchTabs) {
        return;
    }
    const branches = state.references.branches || [];
    elements.branchTabs.innerHTML = branches.map((branch) => {
        const active = sameText(branch, state.activeBranch);
        const disabled = state.role === 'employee'
            ? true
            : (Boolean(state.assignedBranch) && state.role === 'staff' && !sameText(branch, state.assignedBranch));
        return `
            <button
              type="button"
              class="branch-tab ${active ? 'active' : ''}"
              data-branch-tab="${escapeHtml(branch)}"
              ${disabled ? 'disabled' : ''}
            >
              ${escapeHtml(branch)}
            </button>
        `;
    }).join('');
}

function renderThreadList() {
    if (!elements.threadList) {
        return;
    }

    if (!state.entries.length) {
        elements.threadList.innerHTML = '<div class="empty-state">No threads found for this branch view.</div>';
        return;
    }

    elements.threadList.innerHTML = state.entries.map((entry) => {
        const active = entry.id === state.selectedEntryId;
        const reference = escapeHtml(resolveEntryReference(entry));
        const preview = escapeHtml(entry.lastMessagePreview || 'No messages yet.');
        const timestamp = escapeHtml(formatDateTime(entry.lastMessageAt || entry.updatedAt || entry.createdAt));
        return `
            <button type="button" class="thread-item ${active ? 'active' : ''}" data-entry-id="${escapeHtml(entry.id)}">
              <div class="thread-item-top">
                <strong>${escapeHtml(entry.clientName || '-')}</strong>
                <span class="thread-item-time">${timestamp}</span>
              </div>
              <div class="badge-row">
                ${renderBadge(resolveStageLabel(entry.stage), resolveStageBadgeClass(entry.stage))}
                ${renderBadge(entry.branch || '-', 'branch')}
                ${entry.hasPinnedReceipt ? renderBadge('Receipt Ready', 'delivery') : ''}
              </div>
              <div class="thread-item-sub">${reference} | ${escapeHtml(entry.courier || entry.fulfillmentOption || '-')}</div>
              <div class="thread-item-preview">${preview}</div>
            </button>
        `;
    }).join('');
}

function handleThreadSearchInput() {
    state.search = normalizeText(elements.threadSearchInput?.value || '');
    if (state.searchTimer) {
        window.clearTimeout(state.searchTimer);
    }
    state.searchTimer = window.setTimeout(() => {
        refreshWorkflow(true);
    }, THREAD_SEARCH_DEBOUNCE_MS);
}

function handleBranchTabClick(event) {
    const button = event.target.closest('button[data-branch-tab]');
    if (!button || button.disabled) {
        return;
    }
    state.activeBranch = button.dataset.branchTab;
    renderBranchTabs();
    refreshWorkflow(true);
}

function handleThreadListClick(event) {
    const button = event.target.closest('button[data-entry-id]');
    if (!button) {
        return;
    }
    const entryId = String(button.dataset.entryId || '').trim();
    if (!entryId || entryId === state.selectedEntryId) {
        return;
    }
    state.selectedEntryId = entryId;
    renderThreadList();
    loadSelectedThread({ showFeedback: true });
}

async function loadSelectedThread({ silent = false, showFeedback = false } = {}) {
    if (!state.selectedEntryId) {
        clearSelectedThread();
        return;
    }
    if (state.threadLoading) {
        return;
    }

    state.threadLoading = true;
    if (!silent || showFeedback) {
        setComposerStatus('Loading thread...');
    }

    try {
        const payload = await appClient.getCommunicationWorkflowThread(state.selectedEntryId, { limit: 250 });
        commitThreadPayload(payload);
        if (!silent || showFeedback) {
            setComposerStatus('Thread ready.', false, true);
        }
    } catch (error) {
        console.error('Failed to load workflow thread:', error);
        setComposerStatus(error.message || 'Unable to load this thread.', true);
    } finally {
        state.threadLoading = false;
    }
}

function commitThreadPayload(payload) {
    if (!payload?.entry) {
        clearSelectedThread();
        return;
    }
    state.selectedThread = payload;
    state.selectedEntryId = payload.entry.id;
    mergeEntryIntoState(payload.entry);
    renderThreadList();
    renderSelectedThread();
}

function mergeEntryIntoState(entry) {
    const index = state.entries.findIndex((item) => item.id === entry.id);
    if (index >= 0) {
        state.entries[index] = {
            ...state.entries[index],
            ...entry
        };
    } else {
        state.entries.unshift(entry);
    }
    state.entries.sort((left, right) => {
        const rightTime = new Date(right.lastMessageAt || right.updatedAt || right.createdAt || 0).getTime();
        const leftTime = new Date(left.lastMessageAt || left.updatedAt || left.createdAt || 0).getTime();
        return rightTime - leftTime;
    });
}

function clearSelectedThread() {
    state.selectedThread = null;
    elements.threadEmptyState.hidden = false;
    elements.threadPanelContent.hidden = true;
    elements.messageTimeline.innerHTML = '';
    elements.pinnedReceiptCard.hidden = true;
    closeInvoiceModal();
    clearComposerInputs();
    setComposerStatus('');
}

function renderSelectedThread() {
    const thread = state.selectedThread;
    const entry = thread?.entry;
    if (!entry) {
        clearSelectedThread();
        return;
    }

    elements.threadEmptyState.hidden = true;
    elements.threadPanelContent.hidden = false;
    elements.threadHeaderBadges.innerHTML = [
        renderBadge(resolveStageLabel(entry.stage), resolveStageBadgeClass(entry.stage)),
        renderBadge(entry.branch || '-', 'branch'),
        renderBadge(entry.paymentMethod || '-', 'stage'),
        renderBadge(entry.dispatchPanel === 'shipping' ? 'Shipping' : 'Delivery', entry.dispatchPanel === 'shipping' ? 'shipping' : 'delivery')
    ].join('');
    elements.threadClientName.textContent = entry.clientName || '-';
    elements.threadMeta.textContent = [
        resolveEntryReference(entry),
        formatDate(entry.orderDate),
        `${entry.fulfillmentType || '-'} / ${entry.fulfillmentOption || entry.courier || '-'}`,
        entry.contactNumber || '-'
    ].filter(Boolean).join(' | ');

    configureHeaderActions(thread);
    renderPinnedReceipt(thread.pinnedReceipt);
    renderMessages(thread.messages || []);
    configureComposer(thread);
}

function configureHeaderActions(thread) {
    const entry = thread?.entry || {};
    const availableActions = thread?.availableActions || {};
    const orderLookup = entry.salesOrderNumber || entry.receiptNumber || entry.orderNumber || '';

    toggleActionButton(elements.threadConfirmBtn, availableActions.canConfirm);
    toggleActionButton(elements.threadCorrectionBtn, availableActions.canRequestCorrection);
    toggleActionButton(elements.threadRejectBtn, availableActions.canReject);
    toggleActionButton(elements.threadOpenPaymentReceiptBtn, Boolean(entry.paymentReceipt));
    toggleActionButton(elements.threadOpenInvoiceBtn, Boolean(orderLookup));

    elements.threadOpenPaymentReceiptBtn.disabled = !resolveAttachmentSource(entry.paymentReceipt);
    elements.threadOpenInvoiceBtn.dataset.orderLookup = orderLookup;
}

function renderPinnedReceipt(pinnedReceipt) {
    if (!pinnedReceipt?.attachment) {
        elements.pinnedReceiptCard.hidden = true;
        return;
    }

    elements.pinnedReceiptCard.hidden = false;
    elements.pinnedReceiptTitle.textContent = pinnedReceipt.attachment.name || 'Final Staff Receipt';
    elements.pinnedReceiptMeta.textContent = [
        pinnedReceipt.receiptNumber || pinnedReceipt.orderNumber || '-',
        pinnedReceipt.sentAt ? `Sent ${formatDateTime(pinnedReceipt.sentAt)}` : '',
        pinnedReceipt.senderName ? `by ${pinnedReceipt.senderName}` : ''
    ].filter(Boolean).join(' ');

    const note = normalizeText(pinnedReceipt.note);
    elements.pinnedReceiptNote.hidden = !note;
    elements.pinnedReceiptNote.textContent = note;
    renderAttachmentTarget(
        elements.pinnedReceiptPreview,
        pinnedReceipt.attachment,
        'Receipt preview is not available for this file.'
    );
    elements.openPinnedReceiptBtn.disabled = !resolveAttachmentSource(pinnedReceipt.attachment);
}

function renderMessages(messages = []) {
    if (!messages.length) {
        elements.messageTimeline.innerHTML = '<div class="empty-state">No messages yet for this order.</div>';
        return;
    }

    elements.messageTimeline.innerHTML = messages.map((message) => renderMessageRow(message)).join('');
    elements.messageTimeline.scrollTop = elements.messageTimeline.scrollHeight;
}

function renderMessageRow(message) {
    if (message.messageType === 'system') {
        return `
            <div class="message-row system">
              <div class="system-event">
                <strong>${escapeHtml(message.message || 'Workflow updated.')}</strong>
                <time>${escapeHtml(formatDateTime(message.createdAt))}</time>
              </div>
            </div>
        `;
    }

    const direction = resolveMessageDirection(message);
    if (message.messageType === 'invoice') {
        return renderInvoiceMessage(message, direction);
    }
    if (message.messageType === 'receipt') {
        return renderReceiptMessage(message, direction);
    }
    return `
        <div class="message-row ${direction}">
          <article class="message-bubble">
            <div class="message-meta">${escapeHtml(buildMessageMeta(message))}</div>
            <div class="message-text">${escapeHtml(message.message || '').replace(/\n/g, '<br>')}</div>
          </article>
        </div>
    `;
}

function renderInvoiceMessage(message, direction) {
    const payload = message.payload || {};
    const lookup = payload.orderLookup || payload.receiptNumber || payload.orderNumber || '';
    return `
        <div class="message-row ${direction}">
          <article class="message-card invoice-card">
            <div class="message-meta">${escapeHtml(buildMessageMeta(message))}</div>
            <div class="message-card-head">
              <div>
                <strong>Invoice Card</strong>
                <div class="thread-item-sub">${escapeHtml(payload.receiptNumber || payload.orderNumber || 'Linked invoice')}</div>
              </div>
              ${renderBadge('Invoice', 'shipping')}
            </div>
            <div class="message-card-grid">
              ${renderMessageDetail('Order', payload.orderNumber || '-')}
              ${renderMessageDetail('Receipt', payload.receiptNumber || '-')}
              ${renderMessageDetail('Sale Date', formatDate(payload.saleDate))}
              ${renderMessageDetail('Branch', payload.branch || '-')}
              ${renderMessageDetail('Payment', payload.paymentMethod || '-')}
              ${renderMessageDetail('Total', formatCurrency(payload.orderTotal || 0))}
            </div>
            <div class="message-card-actions">
              <button type="button" class="secondary-btn" data-open-invoice="${escapeHtml(lookup)}">Open Invoice</button>
            </div>
          </article>
        </div>
    `;
}

function renderReceiptMessage(message, direction) {
    const payload = message.payload || {};
    const attachment = payload.attachment || null;
    const source = resolveAttachmentSource(attachment);
    const note = normalizeText(payload.note || message.message || '');
    return `
        <div class="message-row ${direction}">
          <article class="message-card receipt-card">
            <div class="message-meta">${escapeHtml(buildMessageMeta(message))}</div>
            <div class="message-card-head">
              <div>
                <strong>Final Receipt</strong>
                <div class="thread-item-sub">${escapeHtml(payload.receiptNumber || payload.orderNumber || 'Receipt')}</div>
              </div>
              ${renderBadge('Receipt', 'delivery')}
            </div>
            <div class="attachment-preview ${attachment ? '' : 'empty'}">
              ${renderAttachmentPreview(attachment, 'Receipt preview is not available for this file.')}
            </div>
            ${note ? `<div class="notes-box">${escapeHtml(note)}</div>` : ''}
            <div class="message-card-actions">
              ${source
        ? `<a class="secondary-btn" href="${escapeHtml(source)}" target="_blank" rel="noopener">Open Receipt</a>`
        : '<button type="button" class="secondary-btn" disabled>Open Receipt</button>'}
            </div>
          </article>
        </div>
    `;
}

function configureComposer(thread) {
    const availableActions = thread?.availableActions || {};
    const isReadOnly = Boolean(availableActions.readOnly);
    const hasSpecialAttachmentAction = Boolean(availableActions.canSendReceipt || availableActions.canCompletePrep);

    elements.messageInput.disabled = isReadOnly;
    elements.messageInput.placeholder = isReadOnly
        ? 'Employee view is read-only.'
        : 'Type your update...';

    toggleActionButton(elements.sendMessageBtn, availableActions.canSendText);
    toggleActionButton(elements.sendInvoiceBtn, availableActions.canSendInvoice);
    toggleActionButton(elements.sendReceiptBtn, availableActions.canSendReceipt);
    toggleActionButton(elements.completePrepBtn, availableActions.canCompletePrep);
    elements.composerAttachmentField.hidden = !hasSpecialAttachmentAction;
    elements.composerAttachmentLabel.textContent = availableActions.canSendReceipt
        ? 'Final Receipt Attachment'
        : 'Prep Photo (Optional)';
    elements.composerAttachmentHint.textContent = availableActions.canSendReceipt
        ? 'Attach the final receipt file here. Required before sending.'
        : 'Optional prep photo before moving this order to delivery or shipping.';

    elements.composerHelp.textContent = isReadOnly
        ? 'Read-only thread view for employee orders.'
        : (availableActions.canSendReceipt
            ? 'Use the same note field below for any receipt note, then attach the final receipt file.'
            : (availableActions.canCompletePrep
                ? 'Optional prep photo lang ang attachment dito. The note field becomes the prep note.'
                : 'Send chat updates here. Invoice and receipt actions appear only when this thread is ready for them.'));
}

function toggleActionButton(button, visible) {
    if (!button) {
        return;
    }
    button.hidden = !visible;
}

function buildMessageMeta(message) {
    const senderName = message.senderName || (message.senderRole === 'staff' ? 'Staff' : 'Head Admin');
    return `${senderName} | ${formatDateTime(message.createdAt)}`;
}

function resolveMessageDirection(message) {
    const currentUserId = normalizeText(state.session?.userId || state.session?.id || state.session?.user_id);
    const currentName = normalizeText(state.session?.userName || state.session?.name);
    if (currentUserId && currentUserId === normalizeText(message.senderUserId)) {
        return 'own';
    }
    if (currentName && sameText(currentName, message.senderName)) {
        return 'own';
    }
    return 'other';
}

function renderBadge(label, variant = 'stage') {
    return `<span class="badge ${escapeHtml(variant)}">${escapeHtml(label || '-')}</span>`;
}

function resolveStageBadgeClass(stage) {
    if (stage === 'rejected') {
        return 'error';
    }
    if (stage === 'shipping_queue') {
        return 'shipping';
    }
    if (stage === 'delivery_queue' || stage === 'prep_pending' || stage === 'staff_receipt_pending') {
        return 'delivery';
    }
    return 'stage';
}

function resolveEntryReference(entry) {
    return entry.receiptNumber || entry.salesOrderNumber || entry.orderNumber || '-';
}

function renderMessageDetail(label, value) {
    return `
        <div class="message-detail">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value || '-')}</strong>
        </div>
    `;
}

function handleTimelineClick(event) {
    const openInvoiceButton = event.target.closest('button[data-open-invoice]');
    if (openInvoiceButton) {
        openInvoiceModalForLookup(openInvoiceButton.dataset.openInvoice);
    }
}

async function handleOpenCurrentInvoice() {
    const orderLookup = String(elements.threadOpenInvoiceBtn.dataset.orderLookup || '').trim();
    if (!orderLookup) {
        setComposerStatus('Linked invoice is not ready yet.', true);
        return;
    }
    await openInvoiceModalForLookup(orderLookup);
}

async function handleSendMessage(event) {
    event.preventDefault();
    if (!state.selectedEntryId || elements.sendMessageBtn.hidden || elements.sendMessageBtn.disabled) {
        return;
    }

    const message = String(elements.messageInput.value || '').trim();
    if (!message) {
        setComposerStatus('Type a message first.', true);
        return;
    }

    setComposerStatus('Sending message...');
    try {
        const payload = await appClient.sendCommunicationWorkflowMessage(state.selectedEntryId, {
            type: 'text',
            message
        });
        commitThreadPayload(payload);
        clearComposerInputs();
        setComposerStatus('Message sent.', false, true);
    } catch (error) {
        console.error('Failed to send workflow message:', error);
        setComposerStatus(error.message || 'Unable to send message.', true);
    }
}

async function handleSendInvoice() {
    if (!state.selectedEntryId) {
        return;
    }
    setComposerStatus('Sending invoice card...');
    try {
        const payload = await appClient.sendCommunicationWorkflowMessage(state.selectedEntryId, {
            type: 'invoice'
        });
        commitThreadPayload(payload);
        setComposerStatus('Invoice card sent.', false, true);
    } catch (error) {
        console.error('Failed to send invoice card:', error);
        setComposerStatus(error.message || 'Unable to send invoice card.', true);
    }
}

async function handleSendReceipt() {
    const thread = state.selectedThread;
    const entry = thread?.entry;
    if (!entry || !thread?.availableActions?.canSendReceipt) {
        return;
    }

    const file = elements.composerAttachmentInput.files?.[0] || null;
    if (!file) {
        setComposerStatus('Attach the final receipt first.', true);
        return;
    }

    setComposerStatus('Uploading final receipt...');
    try {
        const attachment = await buildFilePayload(file);
        await updateWorkflowEntry(entry.id, {
            action: 'staff_receipt',
            staffReceipt: attachment,
            note: elements.messageInput.value || ''
        }, 'Final receipt sent.');
        clearComposerInputs();
        setComposerStatus('Final receipt sent.', false, true);
    } catch (error) {
        console.error('Failed to send staff receipt:', error);
        setComposerStatus(error.message || 'Unable to send the final receipt.', true);
    }
}

async function handleCompletePrep() {
    const thread = state.selectedThread;
    const entry = thread?.entry;
    if (!entry || !thread?.availableActions?.canCompletePrep) {
        return;
    }

    setComposerStatus('Completing prep...');
    try {
        const file = elements.composerAttachmentInput.files?.[0] || null;
        const attachment = file ? await buildFilePayload(file) : null;
        await updateWorkflowEntry(entry.id, {
            action: 'prep_complete',
            prepPhoto: attachment,
            note: elements.messageInput.value || ''
        }, 'Prep completed and moved to final dispatch.');
        clearComposerInputs();
        setComposerStatus('Prep completed.', false, true);
    } catch (error) {
        console.error('Failed to complete prep:', error);
        setComposerStatus(error.message || 'Unable to complete prep.', true);
    }
}

async function handleConfirmThread() {
    const entry = state.selectedThread?.entry;
    if (!entry) {
        return;
    }

    try {
        const payload = buildSalesPayloadFromEntry(entry);
        setComposerStatus('Confirming order...');
        await updateWorkflowEntry(entry.id, {
            action: 'confirm',
            salesPayload: payload
        }, 'Order confirmed and moved to staff receipt queue.');
        setComposerStatus('Order confirmed.', false, true);
    } catch (error) {
        console.error('Failed to confirm workflow entry:', error);
        setComposerStatus(error.message || 'Unable to confirm this order.', true);
    }
}

async function handleRequestCorrection() {
    const entry = state.selectedThread?.entry;
    if (!entry) {
        return;
    }

    const note = window.prompt('Enter the correction note for this order.', entry.correctionNote || '');
    if (note === null) {
        return;
    }

    try {
        setComposerStatus('Requesting correction...');
        await updateWorkflowEntry(entry.id, {
            action: 'request_correction',
            note
        }, 'Correction requested.');
        setComposerStatus('Correction requested.', false, true);
    } catch (error) {
        console.error('Failed to request correction:', error);
        setComposerStatus(error.message || 'Unable to request correction.', true);
    }
}

async function handleRejectThread() {
    const entry = state.selectedThread?.entry;
    if (!entry) {
        return;
    }

    const note = window.prompt('Enter the rejection reason for this order.', entry.correctionNote || '');
    if (note === null) {
        return;
    }

    try {
        setComposerStatus('Rejecting order...');
        await updateWorkflowEntry(entry.id, {
            action: 'reject',
            note
        }, 'Order rejected.');
        setComposerStatus('Order rejected.', false, true);
    } catch (error) {
        console.error('Failed to reject workflow entry:', error);
        setComposerStatus(error.message || 'Unable to reject this order.', true);
    }
}

function handleComposerAttachmentChange() {
    const file = elements.composerAttachmentInput.files?.[0] || null;
    if (!file) {
        renderAttachmentTarget(elements.composerAttachmentPreview, null, 'No attachment selected.');
        return;
    }
    renderAttachmentTarget(elements.composerAttachmentPreview, {
        name: file.name,
        type: file.type || '',
        size: Number(file.size || 0)
    }, 'No attachment selected.');
}

async function openInvoiceModalForLookup(orderLookup) {
    const lookup = normalizeText(orderLookup);
    if (!lookup) {
        setComposerStatus('Linked invoice is not ready yet.', true);
        return;
    }

    try {
        setComposerStatus('Loading invoice preview...');
        const order = await appClient.getOrder(lookup);
        state.invoiceModalOrder = order || null;
        renderInvoiceModal(order || null);
        elements.invoiceModal.hidden = false;
        setComposerStatus('Invoice preview ready.', false, true);
    } catch (error) {
        console.error('Failed to load invoice preview:', error);
        setComposerStatus(error.message || 'Unable to load invoice preview.', true);
    }
}

function renderInvoiceModal(order) {
    if (!order) {
        elements.invoiceModalTitle.textContent = 'Invoice Preview';
        elements.invoiceModalMeta.innerHTML = '<div class="empty-state">Invoice data is not available.</div>';
        elements.invoiceModalItems.innerHTML = '';
        elements.invoiceModalTotals.innerHTML = '';
        return;
    }

    elements.invoiceModalTitle.textContent = order.receiptNumber || order.orderNumber || 'Invoice Preview';
    elements.invoiceModalMeta.innerHTML = [
        renderInvoiceDetail('Order No.', order.orderNumber || '-'),
        renderInvoiceDetail('Receipt No.', order.receiptNumber || '-'),
        renderInvoiceDetail('Sale Date', formatDate(order.saleDate)),
        renderInvoiceDetail('Branch', order.branch || '-'),
        renderInvoiceDetail('Cash Branch', order.cashBranch || '-'),
        renderInvoiceDetail('Courier', order.courier || '-'),
        renderInvoiceDetail('Client', order.clientName || '-'),
        renderInvoiceDetail('Contact', order.clientContact || '-'),
        renderInvoiceDetail('Payment', order.paymentMethod || '-'),
        renderInvoiceDetail('Status', order.orderStatus || '-'),
        renderInvoiceDetail('Admin', order.adminName || '-'),
        renderInvoiceDetail('Sales Rep', order.salesRepresentative || '-'),
        renderInvoiceDetail('Address', order.clientAddress || '-', 'wide'),
        renderInvoiceDetail('Note', order.note || '-', 'wide')
    ].join('');

    elements.invoiceModalItems.innerHTML = Array.isArray(order.items) && order.items.length
        ? order.items.map((item) => `
            <div class="invoice-item-row">
              <div class="invoice-item-copy">
                <strong>${escapeHtml(item.itemSold || item.productName || '-')}</strong>
                <small>${escapeHtml(buildInvoiceItemMeta(item))}</small>
              </div>
              <strong>${escapeHtml(formatCurrency(item.lineSubtotal ?? item.subtotal ?? (Number(item.quantity || 0) * Number(item.unitPrice || 0))))}</strong>
            </div>
        `).join('')
        : '<div class="empty-state">No saved items for this invoice.</div>';

    elements.invoiceModalTotals.innerHTML = [
        renderInvoiceDetail('Base Total', formatCurrency(order.baseTotal || 0)),
        renderInvoiceDetail('Order Total', formatCurrency(order.orderTotal || 0)),
        renderInvoiceDetail('Amount Paid', formatCurrency(order.amountPaid || 0)),
        renderInvoiceDetail('Remaining', formatCurrency(order.remainingAmount || 0)),
        renderInvoiceDetail('Collection', formatCurrency(order.collectionAmount || 0)),
        renderInvoiceDetail('Delivery Fee', formatCurrency(order.deliveryFee || 0))
    ].join('');
}

function renderInvoiceDetail(label, value, extraClass = '') {
    return `
        <div class="invoice-detail ${escapeHtml(extraClass)}">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value || '-')}</strong>
        </div>
    `;
}

function buildInvoiceItemMeta(item) {
    const parts = [`${Number(item.quantity || 0)} x ${formatCurrency(item.unitPrice || 0)}`];
    if (item.itemSet) {
        parts.push(`Set ${item.itemSet}`);
    }
    if (item.itemCode) {
        parts.push(`Code ${item.itemCode}`);
    }
    return parts.join(' | ');
}

function closeInvoiceModal() {
    elements.invoiceModal.hidden = true;
    state.invoiceModalOrder = null;
}

async function handleWorkflowSubmit(event) {
    event.preventDefault();

    try {
        const payload = await buildWorkflowPayload();
        await appClient.createCommunicationWorkflowEntry(payload);
        setWorkflowStatus(`Order ${payload.orderNumber} submitted for head admin review.`, false, true);
        resetWorkflowForm();
        await refreshWorkflow(true);
    } catch (error) {
        console.error('Workflow order submit failed:', error);
        setWorkflowStatus(error.message || 'Unable to submit workflow order.', true);
    }
}

async function buildWorkflowPayload() {
    const orderNumber = normalizeText(elements.orderNumber.value || '');
    const orderDate = normalizeText(elements.orderDate.value || '');
    const branch = normalizeText(elements.branchSelect.value || '');
    const cashBranch = normalizeText(elements.cashBranchSelect.value || '');
    const clientName = normalizeText(elements.clientName.value || '');
    const contactNumber = normalizeText(elements.contactNumber.value || '');
    const courier = normalizeText(elements.courierSelect.value || '');
    const fulfillmentType = normalizeText(elements.fulfillmentType.value || '');
    const fulfillmentOption = normalizeText(elements.fulfillmentOption.value || '');
    const paymentMethod = normalizeText(elements.paymentMethod.value || '');
    const paymentType = normalizeText(elements.paymentType.value || '');
    const adminName = normalizeText(elements.adminSelect.value || '');
    const salesRepresentative = normalizeText(elements.salesRepSelect.value || '');
    const deliveryAddress = normalizeText(elements.deliveryAddress.value || '');
    const deliveryFee = Math.max(0, Number(elements.deliveryFee.value || 0));
    const handlingFee = Math.max(0, Number(elements.handlingFee.value || 0));
    const items = getPreparedItems();
    const totalAmount = computeOrderTotal(items);
    const paymentReceiptFile = elements.paymentReceipt.files?.[0] || null;
    const requiresReceipt = requiresPaymentReceipt(paymentMethod);

    if (!orderNumber) throw new Error('Order number is required.');
    if (!orderDate) throw new Error('Order date is required.');
    if (!branch) throw new Error('Invoice branch is required.');
    if (!cashBranch) throw new Error('Cash branch is required.');
    if (!clientName) throw new Error('Client name is required.');
    if (!contactNumber) throw new Error('Contact number is required.');
    if (!courier) throw new Error('Courier is required.');
    if (!fulfillmentType || !fulfillmentOption) throw new Error('Select fulfillment type and specific option.');
    if (!paymentMethod) throw new Error('Payment method is required.');
    if (!adminName) throw new Error('Admin is required.');
    if (!salesRepresentative) throw new Error('Sales representative is required.');
    if (!deliveryAddress) throw new Error('Delivery address is required.');
    if (!items.length) throw new Error('Add at least one valid item.');
    if (requiresReceipt && !paymentReceiptFile) throw new Error('Payment receipt is required for this payment method.');

    return {
        orderNumber,
        orderDate,
        branch,
        cashBranch,
        clientName,
        contactNumber,
        courier: fulfillmentOption || courier,
        fulfillmentType,
        fulfillmentOption,
        paymentMethod,
        paymentType,
        adminName,
        salesRepresentative,
        deliveryAddress,
        deliveryFee,
        handlingFee,
        totalAmount,
        orderItems: buildOrderItemsSummary(items),
        items,
        paymentReceipt: await buildFilePayload(paymentReceiptFile)
    };
}

function getPreparedItems() {
    return state.itemRows
        .map((row) => {
            const productName = normalizeText(row.productName);
            const setName = normalizeText(row.setName);
            const itemCode = normalizeText(row.itemCode);
            const helper = normalizeText(row.helper);
            const quantity = Math.max(1, Number(row.quantity || 1));
            const unitPrice = Math.max(0, Number(row.price || 0));
            return {
                productName,
                setName,
                itemCode,
                helper,
                quantity,
                unitPrice,
                subtotal: quantity * unitPrice
            };
        })
        .filter((item) => item.productName && item.setName && item.itemCode);
}

function buildOrderItemsSummary(items = []) {
    return (Array.isArray(items) ? items : [])
        .map((item) => `${item.quantity} x ${item.productName} (${item.setName}) [${item.itemCode}]`)
        .join('\n');
}

function computeOrderTotal(items = []) {
    const itemsTotal = (Array.isArray(items) ? items : []).reduce((sum, item) => (
        sum + Number(item.subtotal || 0)
    ), 0);
    return itemsTotal
        + Math.max(0, Number(elements.deliveryFee.value || 0))
        + Math.max(0, Number(elements.handlingFee.value || 0));
}

function buildSalesPayloadFromEntry(entry) {
    const branch = matchConfiguredOption(entry.branch, state.references.branches) || entry.branch;
    const cashBranch = matchConfiguredOption(entry.cashBranch, state.references.cashBranches) || entry.cashBranch || branch;
    const courier = matchConfiguredOption(entry.courier || entry.fulfillmentOption, state.references.couriers) || entry.courier || entry.fulfillmentOption;
    const adminName = matchConfiguredOption(entry.adminName, state.references.admins) || entry.adminName;
    const salesRepresentative = matchConfiguredOption(entry.salesRepresentative, state.references.salesRepresentatives) || entry.salesRepresentative;
    const paymentMethod = matchConfiguredOption(entry.paymentMethod, state.references.paymentMethods) || entry.paymentMethod;
    const baseTotal = (Array.isArray(entry.items) ? entry.items : []).reduce((sum, item) => (
        sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0))
    ), 0);
    const logisticsFee = Math.max(0, Number(entry.deliveryFee || 0)) + Math.max(0, Number(entry.handlingFee || 0));
    const orderTotal = baseTotal + logisticsFee;
    const isCollection = sameText(paymentMethod, 'LBC Collection');
    const amountPaid = isCollection ? 0 : orderTotal;
    const paymentType = isCollection ? 'Partial' : 'Full Paid';
    const paymentMethodBreakdown = paymentMethod ? [{ method: paymentMethod, amount: amountPaid }] : [];

    if (!branch) throw new Error('Invoice branch is required before confirmation.');
    if (!cashBranch) throw new Error('Cash branch is required before confirmation.');
    if (!courier) throw new Error('Courier is required before confirmation.');
    if (!adminName) throw new Error('Admin is required before confirmation.');
    if (!salesRepresentative) throw new Error('Sales representative is required before confirmation.');
    if (!paymentMethod) throw new Error('Payment method is required before confirmation.');

    return {
        orderNumber: entry.orderNumber,
        receiptNumber: entry.receiptNumber || entry.orderNumber,
        saleDate: entry.orderDate,
        branch,
        cashBranch,
        courier,
        paymentType,
        paymentMethods: paymentMethod ? [paymentMethod] : [],
        paymentMethod,
        paymentOption: paymentMethod,
        paymentMethodBreakdown,
        adminName,
        salesRepresentative,
        clientName: entry.clientName,
        clientContact: entry.contactNumber,
        clientAddress: entry.deliveryAddress,
        amountPaid,
        paymentAmount: amountPaid,
        deliveryFee: logisticsFee,
        deliveryFeeToCollect: logisticsFee > 0,
        collectionAmount: Math.max(orderTotal - amountPaid, 0),
        overpaymentAmount: Math.max(amountPaid - orderTotal, 0),
        underpaymentAmount: Math.max(orderTotal - amountPaid, 0),
        baseTotal,
        orderTotal,
        note: entry.orderItems || buildOrderItemsSummary(entry.items),
        inventoryDeducted: false,
        orderStatus: 'Pending',
        items: (Array.isArray(entry.items) ? entry.items : []).map((item) => ({
            itemSold: item.productName || item.itemSold,
            productName: item.productName || item.itemSold,
            itemSet: item.setName || item.itemSet,
            itemCode: item.itemCode,
            helper: item.helper,
            quantity: Number(item.quantity || 0),
            unitPrice: Number(item.unitPrice || 0)
        }))
    };
}

async function updateWorkflowEntry(entryId, payload, successMessage = '') {
    await appClient.updateCommunicationWorkflowEntry(entryId, payload);
    if (successMessage) {
        setBoardStatus(successMessage, false, true);
    }
    await refreshWorkflow();
}

async function refreshOrderNumber() {
    try {
        const preview = await appClient.previewOrderNumber(elements.orderDate.value || '');
        elements.orderNumber.value = normalizeText(preview?.orderNumber || preview?.nextOrderNumber || '');
    } catch (error) {
        console.warn('Unable to preview next order number:', error);
        elements.orderNumber.value = buildFallbackOrderNumber(elements.orderDate.value || '');
    }
}

function setDefaultDate() {
    if (!elements.orderDate.value) {
        elements.orderDate.value = formatDateInputValue(new Date());
    }
}

function resetWorkflowForm() {
    elements.workflowForm.reset();
    elements.branchSelect.value = selectMatchingOption(state.references.branches, state.assignedBranch || state.activeBranch || state.references.branches[0] || '');
    elements.cashBranchSelect.value = selectMatchingOption(state.references.cashBranches, state.assignedBranch || state.activeBranch || state.references.cashBranches[0] || '');
    elements.adminSelect.value = selectMatchingOption(state.references.admins, state.references.admins[0] || state.session?.userName || '');
    elements.salesRepSelect.value = selectMatchingOption(state.references.salesRepresentatives, state.references.salesRepresentatives[0] || state.session?.userName || '');
    elements.paymentMethod.value = state.references.paymentMethods[0] || '';
    elements.deliveryFee.value = '0';
    elements.handlingFee.value = '0';
    renderAttachmentTarget(elements.paymentReceiptPreview, null, 'No payment receipt uploaded yet.');
    setDefaultDate();
    refreshOrderNumber();
    handlePaymentMethodChange();
    handleFulfillmentTypeChange();
    state.itemRows = [createEmptyItemRow()];
    state.nextItemRowId = state.itemRows[0].id + 1;
    renderItemRows();
    clearStatus(elements.workflowStatus);
}

function ensureItemRows() {
    if (!state.itemRows.length) {
        state.itemRows = [createEmptyItemRow()];
        state.nextItemRowId = state.itemRows[0].id + 1;
    }
}

function createEmptyItemRow() {
    return {
        id: state.nextItemRowId++,
        productName: '',
        setName: '',
        itemCode: '',
        helper: '',
        price: 0,
        quantity: 1
    };
}

function addItemRow(initial = {}) {
    state.itemRows.push({
        ...createEmptyItemRow(),
        ...initial
    });
}

function renderItemRows() {
    elements.itemRows.innerHTML = state.itemRows.map((row) => {
        const variants = getVariantsForProduct(row.productName);
        const setOptions = variants.map((variant) => variant.setName);
        const subtotal = Number(row.quantity || 0) * Number(row.price || 0);
        return `
            <tr data-row-id="${escapeHtml(row.id)}">
              <td><input type="text" list="productNameList" data-field="product" value="${escapeHtml(row.productName || '')}" placeholder="Search product"></td>
              <td>
                <select data-field="set">
                  <option value="">Select set</option>
                  ${setOptions.map((setName) => `
                    <option value="${escapeHtml(setName)}" ${sameText(setName, row.setName) ? 'selected' : ''}>${escapeHtml(setName)}</option>
                  `).join('')}
                </select>
              </td>
              <td><input type="text" data-field="code" value="${escapeHtml(row.itemCode || '')}" readonly></td>
              <td><input type="number" min="0" step="0.01" data-field="price" value="${escapeHtml(sanitizeNumberInput(row.price))}"></td>
              <td><input type="number" min="1" step="1" data-field="quantity" value="${escapeHtml(sanitizeIntegerInput(row.quantity))}"></td>
              <td><strong>${escapeHtml(formatCurrency(subtotal))}</strong></td>
              <td><button type="button" class="row-remove-btn" data-row-action="remove" data-row-id="${escapeHtml(row.id)}">Remove</button></td>
            </tr>
        `;
    }).join('');
    renderOrderTotals();
}

function applyVariantDefaults(row, { resetSet = false } = {}) {
    const variants = getVariantsForProduct(row.productName);
    if (!variants.length) {
        row.setName = resetSet ? '' : row.setName;
        row.itemCode = '';
        row.helper = '';
        row.price = 0;
        row.quantity = Math.max(1, Number(row.quantity || 1));
        renderOrderTotals();
        return;
    }

    let selectedVariant = null;
    if (!resetSet && row.setName) {
        selectedVariant = variants.find((variant) => sameText(variant.setName, row.setName)) || null;
    }
    if (!selectedVariant) {
        selectedVariant = variants[0];
        row.setName = selectedVariant.setName;
    }

    row.productName = selectedVariant.productName;
    row.itemCode = selectedVariant.itemCode;
    row.helper = selectedVariant.helper;
    row.price = Math.max(0, Number(selectedVariant.price || row.price || 0));
    row.quantity = Math.max(1, Number(row.quantity || 1));
    renderOrderTotals();
}

function getVariantsForProduct(productName) {
    const key = normalizeText(productName).toLowerCase();
    return key ? (state.variantsByProduct.get(key) || []) : [];
}

function renderOrderTotals() {
    elements.totalAmount.textContent = formatCurrency(computeOrderTotal(getPreparedItems()));
}

function handleOrderDateChange() {
    refreshOrderNumber();
}

function handleBranchSelectChange() {
    if (!elements.cashBranchSelect.value) {
        const matched = selectMatchingOption(state.references.cashBranches, elements.branchSelect.value);
        elements.cashBranchSelect.value = matched || elements.branchSelect.value;
    }
}

function handleClientSelection() {
    const selected = normalizeText(elements.clientName.value || '');
    if (!selected) {
        return;
    }
    const client = state.clients.find((entry) => sameText(entry?.name, selected));
    if (!client) {
        return;
    }
    if (!elements.contactNumber.value) {
        elements.contactNumber.value = formatContactNumber(client.contact_number || client.normalized_contact_number || '');
    }
    if (!elements.deliveryAddress.value) {
        elements.deliveryAddress.value = normalizeText(client.address || '');
    }
}

function handleCourierChange() {
    const courier = normalizeText(elements.courierSelect.value || '');
    if (!courier) {
        return;
    }
    elements.fulfillmentType.value = SHIPMENT_OPTION_LIST.some((option) => sameText(option, courier)) ? 'Shipment' : 'Booking';
    handleFulfillmentTypeChange();
    elements.fulfillmentOption.value = selectMatchingOption(
        elements.fulfillmentType.value === 'Shipment' ? SHIPMENT_OPTION_LIST : BOOKING_OPTION_LIST,
        courier
    );
}

function handleFulfillmentTypeChange() {
    const type = normalizeText(elements.fulfillmentType.value || '');
    const options = type === 'Shipment' ? SHIPMENT_OPTION_LIST : (type === 'Booking' ? BOOKING_OPTION_LIST : []);
    renderSelect(elements.fulfillmentOption, options, '', type ? 'Select specific option' : 'Select fulfillment type first');
    elements.fulfillmentOption.disabled = !options.length;
}

function handlePaymentMethodChange() {
    elements.paymentType.value = deriveDisplayPaymentType(normalizeText(elements.paymentMethod.value || ''));
}

function handlePaymentReceiptChange() {
    const file = elements.paymentReceipt.files?.[0] || null;
    renderAttachmentTarget(elements.paymentReceiptPreview, file ? { name: file.name, type: file.type } : null, 'No payment receipt uploaded yet.');
}

function handleAddItemRow() {
    addItemRow();
    renderItemRows();
}

function handleItemTableChange(event) {
    const rowElement = event.target.closest('tr[data-row-id]');
    if (!rowElement) {
        return;
    }
    const rowId = Number(rowElement.dataset.rowId || 0);
    const row = state.itemRows.find((entry) => entry.id === rowId);
    if (!row) {
        return;
    }

    if (event.target.matches('input[data-field="product"]')) {
        row.productName = normalizeText(event.target.value);
        applyVariantDefaults(row, { resetSet: true });
        renderItemRows();
        return;
    }
    if (event.target.matches('select[data-field="set"]')) {
        row.setName = normalizeText(event.target.value);
        applyVariantDefaults(row, { resetSet: false });
        renderItemRows();
        return;
    }
    if (event.target.matches('input[data-field="price"]')) {
        row.price = Math.max(0, Number(event.target.value || 0));
    }
    if (event.target.matches('input[data-field="quantity"]')) {
        row.quantity = Math.max(1, Number(event.target.value || 1));
    }
    renderOrderTotals();
}

function handleItemTableInput(event) {
    const rowElement = event.target.closest('tr[data-row-id]');
    if (!rowElement) {
        return;
    }
    const rowId = Number(rowElement.dataset.rowId || 0);
    const row = state.itemRows.find((entry) => entry.id === rowId);
    if (!row) {
        return;
    }

    if (event.target.matches('input[data-field="price"]')) {
        row.price = Math.max(0, Number(event.target.value || 0));
        renderOrderTotals();
    }
    if (event.target.matches('input[data-field="quantity"]')) {
        row.quantity = Math.max(1, Number(event.target.value || 1));
        renderOrderTotals();
    }
}

function handleItemTableClick(event) {
    const button = event.target.closest('button[data-row-action="remove"]');
    if (!button) {
        return;
    }
    const rowId = Number(button.dataset.rowId || 0);
    if (state.itemRows.length === 1) {
        state.itemRows[0] = createEmptyItemRow();
    } else {
        state.itemRows = state.itemRows.filter((row) => row.id !== rowId);
    }
    renderItemRows();
}

function renderSelect(selectElement, options = [], selectedValue = '', placeholder = 'Select option') {
    const list = uniqueNonEmpty(options);
    const activeValue = selectMatchingOption(list, selectedValue);
    selectElement.innerHTML = [`<option value="">${escapeHtml(placeholder)}</option>`]
        .concat(list.map((option) => (
            `<option value="${escapeHtml(option)}" ${sameText(option, activeValue) ? 'selected' : ''}>${escapeHtml(option)}</option>`
        )))
        .join('');
}

function renderAttachmentTarget(target, attachment, emptyText) {
    target.classList.toggle('empty', !attachment);
    target.innerHTML = attachment ? renderAttachmentPreview(attachment, emptyText) : escapeHtml(emptyText);
}

function renderAttachmentPreview(attachment, emptyText) {
    if (!attachment) {
        return escapeHtml(emptyText);
    }
    const source = resolveAttachmentSource(attachment);
    if (source && String(attachment.type || '').startsWith('image/')) {
        return `
            <strong>${escapeHtml(attachment.name || 'Attachment')}</strong>
            <img src="${escapeHtml(source)}" alt="${escapeHtml(attachment.name || 'Attachment')}">
            <a class="muted-link" href="${escapeHtml(source)}" target="_blank" rel="noopener">Open attachment</a>
        `;
    }
    if (source) {
        return `
            <strong>${escapeHtml(attachment.name || 'Attachment')}</strong>
            <a class="muted-link" href="${escapeHtml(source)}" target="_blank" rel="noopener">Open attachment</a>
        `;
    }
    return `<strong>${escapeHtml(attachment.name || emptyText)}</strong>`;
}

function openAttachment(attachment) {
    const source = resolveAttachmentSource(attachment);
    if (!source) {
        setComposerStatus('This attachment has no inline preview available.', true);
        return;
    }
    window.open(source, '_blank', 'noopener');
}

function setBoardStatus(message, isError = false, isSuccess = false) {
    setStatus(elements.boardStatus, message, isError, isSuccess);
}

function setWorkflowStatus(message, isError = false, isSuccess = false) {
    setStatus(elements.workflowStatus, message, isError, isSuccess);
}

function setComposerStatus(message, isError = false, isSuccess = false) {
    setStatus(elements.composerStatus, message, isError, isSuccess);
}

function setStatus(target, message, isError = false, isSuccess = false) {
    target.textContent = message || '';
    target.classList.toggle('error', Boolean(isError));
    target.classList.toggle('success', Boolean(isSuccess && !isError));
}

function clearStatus(target) {
    target.textContent = '';
    target.classList.remove('error', 'success');
}

function clearComposerInputs() {
    elements.messageInput.value = '';
    elements.composerAttachmentInput.value = '';
    renderAttachmentTarget(elements.composerAttachmentPreview, null, 'No attachment selected.');
}

async function buildFilePayload(file) {
    if (!file) {
        return null;
    }

    const payload = {
        name: file.name,
        type: file.type || '',
        size: Number(file.size || 0),
        dataUrl: '',
        previewUrl: ''
    };

    if (payload.size > MAX_ATTACHMENT_BYTES) {
        return payload;
    }

    const dataUrl = await readFileAsDataUrl(file);
    payload.dataUrl = dataUrl;
    payload.previewUrl = dataUrl;
    return payload;
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Unable to read the selected file.'));
        reader.readAsDataURL(file);
    });
}

function resolveAttachmentSource(attachment) {
    if (!attachment) {
        return '';
    }
    if (String(attachment.dataUrl || '').startsWith('data:')) {
        return String(attachment.dataUrl);
    }
    if (String(attachment.previewUrl || '').startsWith('data:')) {
        return String(attachment.previewUrl);
    }
    return '';
}

function buildFallbackOrderNumber(saleDate = '') {
    const value = saleDate ? new Date(saleDate) : new Date();
    return `ORD-${value.getFullYear()}${String(value.getMonth() + 1).padStart(2, '0')}${String(value.getDate()).padStart(2, '0')}-0001`;
}

function formatDateInputValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(value) {
    if (!value) {
        return '-';
    }
    const date = String(value).includes('T') ? new Date(value) : new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return value || '-';
    }
    return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return date.toLocaleString('en-PH', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatCurrency(value) {
    const amount = Number(value || 0);
    return `PHP ${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatContactNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (/^639\d{9}$/.test(digits)) {
        return `0${digits.slice(2)}`;
    }
    return String(value || '').trim();
}

function deriveDisplayPaymentType(paymentMethod) {
    return sameText(paymentMethod, 'LBC Collection') ? 'For Collection' : 'Full Paid';
}

function requiresPaymentReceipt(paymentMethod) {
    const normalized = normalizeText(paymentMethod).toLowerCase();
    return normalized.includes('online') || normalized.includes('bank') || normalized.includes('transfer');
}

function resolveStageLabel(stage) {
    return STAGE_LABELS[String(stage || '').trim()] || 'In Progress';
}

function selectMatchingOption(options = [], value = '') {
    const list = Array.isArray(options) ? options : [];
    const target = normalizeText(value).toLowerCase();
    if (!target) {
        return '';
    }
    return list.find((entry) => normalizeText(entry).toLowerCase() === target) || '';
}

function matchConfiguredOption(value, options = []) {
    return selectMatchingOption(options, value) || normalizeText(value);
}

function sameText(left, right) {
    return normalizeText(left).toLowerCase() === normalizeText(right).toLowerCase();
}

function uniqueNonEmpty(values = []) {
    const seen = new Set();
    return (Array.isArray(values) ? values : [])
        .map((value) => normalizeText(value))
        .filter((value) => {
            if (!value) {
                return false;
            }
            const key = value.toLowerCase();
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
}

function normalizeRole(value) {
    return normalizeText(value).toLowerCase();
}

function isHeadAdminRole(value) {
    const role = normalizeRole(value);
    return role === 'head_admin' || role === 'company_admin';
}

function normalizeText(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeBranchLabel(value) {
    return normalizeText(value);
}

function sanitizeNumberInput(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? String(number) : '0';
}

function sanitizeIntegerInput(value) {
    const number = Math.max(1, Number(value || 1));
    return Number.isFinite(number) ? String(Math.round(number)) : '1';
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
