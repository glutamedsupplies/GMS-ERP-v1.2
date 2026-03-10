const appClient = window.appClient;

const BOOKING_OPTION_LIST = ['Lalamove', 'Meet-Up', 'Client book', 'TOKTOK', 'MAXIM'];
const SHIPMENT_OPTION_LIST = ['LBC', 'J&T', 'SPX', 'Victory Liner', 'AP Cargo'];
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const AUTO_REFRESH_MS = 25000;
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
    prep_pending: 'Waiting For Prep',
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
    refreshTimer: null,
    loading: false
};

const elements = {
    heroCopy: document.getElementById('heroCopy'),
    roleChip: document.getElementById('roleChip'),
    metricPending: document.getElementById('metricPending'),
    metricPrep: document.getElementById('metricPrep'),
    metricDispatch: document.getElementById('metricDispatch'),
    metricTotal: document.getElementById('metricTotal'),
    branchTabs: document.getElementById('branchTabs'),
    refreshBtn: document.getElementById('refreshBtn'),
    boardStatus: document.getElementById('boardStatus'),
    submissionSection: document.getElementById('submissionSection'),
    employeeBoardSection: document.getElementById('employeeBoardSection'),
    headAdminSection: document.getElementById('headAdminSection'),
    staffSection: document.getElementById('staffSection'),
    dispatchBoardSection: document.getElementById('dispatchBoardSection'),
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
    myOrdersFeed: document.getElementById('myOrdersFeed'),
    confirmationFeed: document.getElementById('confirmationFeed'),
    receiptFeed: document.getElementById('receiptFeed'),
    prepFeed: document.getElementById('prepFeed'),
    deliveryFeed: document.getElementById('deliveryFeed'),
    shippingFeed: document.getElementById('shippingFeed')
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
    await refreshWorkflow();
    startAutoRefresh();
}

function bindEvents() {
    elements.refreshBtn?.addEventListener('click', () => refreshWorkflow(true));
    elements.branchTabs?.addEventListener('click', handleBranchTabClick);
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
    document.body.addEventListener('click', handleBoardActionClick);
    document.body.addEventListener('submit', handleInlineFormSubmit);
    document.body.addEventListener('change', handleInlineFileChange);
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
    const role = state.role;
    const isEmployee = role === 'employee';
    const isStaff = role === 'staff';
    const isHeadAdmin = role === 'head_admin' || role === 'company_admin';

    elements.submissionSection.hidden = !isEmployee;
    elements.employeeBoardSection.hidden = !isEmployee;
    elements.headAdminSection.hidden = !isHeadAdmin;
    elements.staffSection.hidden = !(isStaff || isHeadAdmin);
    elements.dispatchBoardSection.hidden = !(isStaff || isHeadAdmin);

    if (elements.heroCopy) {
        elements.heroCopy.textContent = isEmployee
            ? 'Send a complete order with payment receipt, then monitor whether it is under review, returned for correction, already in prep, or moved to delivery or shipping.'
            : (isStaff
                ? 'Staff handles the middle of the workflow: wait for confirmed orders, send the final receipt, upload prep photo, deduct inventory, then move the order to delivery or shipping.'
                : 'Head Admin verifies payment and totals first, then oversees staff receipt, prep progress, and the separated Cubao and Pampanga dispatch lanes.');
    }
    if (elements.roleChip) {
        elements.roleChip.textContent = isEmployee
            ? 'Employee Intake View'
            : (isStaff ? 'Staff Operations View' : 'Head Admin Control View');
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
    setBoardStatus(showFeedback ? 'Refreshing workflow data...' : 'Updating workflow board...');

    try {
        const shouldFilterByBranch = state.role !== 'employee';
        const response = await appClient.listCommunicationWorkflow({
            branch: shouldFilterByBranch ? state.activeBranch : '',
            search: ''
        });
        state.entries = Array.isArray(response?.items) ? response.items : [];
        state.counts = response?.counts || state.counts;
        renderMetrics();
        renderBoards();
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
        elements.metricPending.textContent = String(Number(counts.pendingHeadAdmin || 0));
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
}

function renderBoards() {
    const entries = filterEntriesForBranch(state.entries);
    if (!elements.myOrdersFeed || !elements.confirmationFeed || !elements.receiptFeed || !elements.prepFeed || !elements.deliveryFeed || !elements.shippingFeed) {
        return;
    }

    const pendingEntries = entries.filter((entry) => entry.stage === 'pending_head_admin' || entry.stage === 'for_correction');
    const receiptEntries = entries.filter((entry) => entry.stage === 'staff_receipt_pending');
    const prepEntries = entries.filter((entry) => entry.stage === 'prep_pending');
    const deliveryEntries = entries.filter((entry) => entry.stage === 'delivery_queue');
    const shippingEntries = entries.filter((entry) => entry.stage === 'shipping_queue');

    elements.myOrdersFeed.innerHTML = state.role === 'employee'
        ? renderFeed(entries, renderEmployeeCard, 'No submitted orders yet.')
        : '';
    elements.confirmationFeed.innerHTML = renderFeed(pendingEntries, renderHeadAdminCard, 'No orders are waiting for head admin confirmation in this branch.');
    elements.receiptFeed.innerHTML = renderFeed(receiptEntries, renderStaffReceiptCard, 'No confirmed orders are waiting for a staff receipt right now.');
    elements.prepFeed.innerHTML = renderFeed(prepEntries, renderPrepCard, 'No orders are waiting for prep.');
    elements.deliveryFeed.innerHTML = renderFeed(deliveryEntries, renderDispatchCard, 'No orders are ready for the delivery panel yet.');
    elements.shippingFeed.innerHTML = renderFeed(shippingEntries, renderDispatchCard, 'No orders are ready for the shipping panel yet.');
}

function renderFeed(entries, renderer, emptyText) {
    if (!entries.length) {
        return `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
    }
    return entries.map((entry) => renderer(entry)).join('');
}

function renderEmployeeCard(entry) {
    return renderEntryShell(entry, {
        body: [
            renderSummaryGrid(entry),
            renderItemsBlock(entry),
            renderNotesBlock([
                entry.correctionNote ? `Correction note: ${entry.correctionNote}` : '',
                renderTrailText(entry)
            ].filter(Boolean).join('\n'))
        ].join('')
    });
}

function renderHeadAdminCard(entry) {
    return renderEntryShell(entry, {
        body: [
            renderSummaryGrid(entry),
            renderItemsBlock(entry),
            renderAttachmentBlock('Payment Receipt', entry.paymentReceipt, 'Employee did not upload a payment receipt.'),
            entry.correctionNote ? renderNotesBlock(`Correction note: ${entry.correctionNote}`) : '',
            `
                <div class="action-row">
                  <button type="button" class="action-btn confirm" data-entry-action="confirm" data-entry-id="${escapeHtml(entry.id)}">Confirm Order</button>
                  <button type="button" class="action-btn warn" data-entry-action="request_correction" data-entry-id="${escapeHtml(entry.id)}">Request Correction</button>
                  <button type="button" class="action-btn danger" data-entry-action="reject" data-entry-id="${escapeHtml(entry.id)}">Reject</button>
                </div>
            `
        ].join('')
    });
}

function renderStaffReceiptCard(entry) {
    return renderEntryShell(entry, {
        body: [
            renderSummaryGrid(entry),
            renderItemsBlock(entry),
            renderAttachmentBlock('Payment Receipt', entry.paymentReceipt, 'Payment receipt was not uploaded.'),
            renderInlineAttachmentForm(entry.id, 'staff_receipt', 'Send Final Receipt', 'Staff Receipt File', 'Attach the final sales receipt here.', 'Staff note')
        ].join('')
    });
}

function renderPrepCard(entry) {
    return renderEntryShell(entry, {
        body: [
            renderSummaryGrid(entry),
            renderItemsBlock(entry),
            renderAttachmentBlock('Staff Receipt', entry.staffReceipt, 'Staff receipt has not been attached.'),
            entry.staffReceiptNote ? renderNotesBlock(`Staff note: ${entry.staffReceiptNote}`) : '',
            renderInlineAttachmentForm(entry.id, 'prep_complete', 'Complete Prep And Deduct Inventory', 'Prep Photo', 'Attach the prep photo here.', 'Prep note')
        ].join('')
    });
}

function renderDispatchCard(entry) {
    return renderEntryShell(entry, {
        body: [
            renderSummaryGrid(entry),
            renderItemsBlock(entry),
            renderAttachmentBlock('Staff Receipt', entry.staffReceipt, 'No staff receipt attachment.'),
            renderAttachmentBlock('Prep Photo', entry.prepPhoto, 'Prep photo is missing.'),
            renderNotesBlock(renderTrailText(entry))
        ].join('')
    });
}

function renderEntryShell(entry, { body = '' } = {}) {
    const stageClass = `stage-${escapeHtml(entry.stage)}`;
    const dispatchClass = entry.dispatchPanel === 'shipping' ? 'shipping' : 'delivery';
    const receiptLabel = entry.receiptNumber || entry.salesOrderNumber || entry.orderNumber;
    return `
        <article class="entry-card ${stageClass}">
          <div class="entry-top">
            <div>
              <div class="badge-row">
                <span class="badge stage">${escapeHtml(resolveStageLabel(entry.stage))}</span>
                <span class="badge branch">${escapeHtml(entry.branch || '-')}</span>
                <span class="badge ${dispatchClass}">${escapeHtml(entry.dispatchPanel === 'shipping' ? 'Shipping' : 'Delivery')}</span>
              </div>
              <h3>${escapeHtml(receiptLabel)}</h3>
              <p>${escapeHtml(entry.clientName)} | ${escapeHtml(entry.courier || entry.fulfillmentOption || '-')}</p>
            </div>
            <div class="badge-row">
              <span class="badge">${escapeHtml(entry.paymentMethod || '-')}</span>
              ${entry.inventoryDeducted ? '<span class="badge delivery">Inventory Deducted</span>' : '<span class="badge error">Inventory Not Deducted</span>'}
            </div>
          </div>
          ${body}
        </article>
    `;
}

function renderSummaryGrid(entry) {
    return `
        <div class="detail-grid">
          ${renderDetail('Order No.', entry.orderNumber)}
          ${renderDetail('Receipt No.', entry.receiptNumber || 'Pending')}
          ${renderDetail('Date', formatDate(entry.orderDate))}
          ${renderDetail('Cash Branch', entry.cashBranch || '-')}
          ${renderDetail('Fulfillment', `${entry.fulfillmentType || '-'} / ${entry.fulfillmentOption || '-'}`)}
          ${renderDetail('Payment Type', entry.paymentType || deriveDisplayPaymentType(entry.paymentMethod))}
          ${renderDetail('Contact', entry.contactNumber || '-')}
          ${renderDetail('Admin / Sales Rep', `${entry.adminName || '-'} / ${entry.salesRepresentative || '-'}`)}
          ${renderDetail('Address', entry.deliveryAddress || '-')}
          ${renderDetail('Delivery Fee', formatCurrency(entry.deliveryFee))}
          ${renderDetail('Handling Fee', formatCurrency(entry.handlingFee))}
          ${renderDetail('Total Amount', formatCurrency(entry.totalAmount))}
        </div>
    `;
}

function renderDetail(label, value) {
    return `
        <div class="detail-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value || '-')}</strong>
        </div>
    `;
}

function renderItemsBlock(entry) {
    const items = Array.isArray(entry.items) ? entry.items : [];
    if (!items.length) {
        return '<div class="empty-state">No items saved for this order.</div>';
    }
    return `
        <div class="item-summary">
          ${items.map((item) => `
            <div class="item-summary-row">
              <div>
                <strong>${escapeHtml(item.productName || item.itemSold || '-')}</strong>
                <small>${escapeHtml(`${item.quantity} x ${formatCurrency(item.unitPrice)} | ${item.setName || item.itemSet || '-'} | ${item.itemCode || '-'}`)}</small>
              </div>
              <strong>${escapeHtml(formatCurrency(item.subtotal || (Number(item.quantity || 0) * Number(item.unitPrice || 0))))}</strong>
            </div>
          `).join('')}
        </div>
    `;
}

function renderAttachmentBlock(label, attachment, emptyText) {
    return `
        <div>
          <div class="detail-card">
            <span>${escapeHtml(label)}</span>
          </div>
          <div class="attachment-preview ${attachment ? '' : 'empty'}">
            ${renderAttachmentPreview(attachment, emptyText)}
          </div>
        </div>
    `;
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
    return escapeHtml(attachment.name || emptyText);
}

function renderInlineAttachmentForm(entryId, action, buttonLabel, fieldLabel, helperText, noteLabel) {
    return `
        <form class="inline-form" data-inline-action="${escapeHtml(action)}" data-entry-id="${escapeHtml(entryId)}">
          <div class="inline-form-grid">
            <label class="field field-span-2">
              <span>${escapeHtml(fieldLabel)}</span>
              <input type="file" name="attachment" accept="image/*,.pdf" required>
              <small data-file-name>${escapeHtml(helperText)}</small>
            </label>
            <label class="field field-span-2">
              <span>${escapeHtml(noteLabel)}</span>
              <textarea name="note" rows="3" placeholder="Optional note for this stage..."></textarea>
            </label>
          </div>
          <div class="action-row">
            <button type="submit" class="primary-btn">${escapeHtml(buttonLabel)}</button>
          </div>
        </form>
    `;
}

function renderNotesBlock(text) {
    if (!String(text || '').trim()) {
        return '';
    }
    return `<div class="notes-box">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
}

function renderTrailText(entry) {
    const bits = [
        entry.createdAt ? `Submitted ${formatDateTime(entry.createdAt)} by ${entry.createdByName || 'Employee'}.` : '',
        entry.confirmedAt ? `Confirmed ${formatDateTime(entry.confirmedAt)} by ${entry.confirmedByName || 'Head Admin'}.` : '',
        entry.staffReceiptSentAt ? `Staff receipt sent ${formatDateTime(entry.staffReceiptSentAt)} by ${entry.staffReceiptSentByName || 'Staff'}.` : '',
        entry.prepCompletedAt ? `Prep completed ${formatDateTime(entry.prepCompletedAt)} by ${entry.prepCompletedByName || 'Staff'}.` : ''
    ].filter(Boolean);
    return bits.join(' ');
}

function filterEntriesForBranch(entries = []) {
    if (state.role === 'employee') {
        return entries;
    }
    return entries.filter((entry) => !state.activeBranch || sameText(entry.branch, state.activeBranch));
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

function handleBranchTabClick(event) {
    const button = event.target.closest('button[data-branch-tab]');
    if (!button || button.disabled) {
        return;
    }
    state.activeBranch = button.dataset.branchTab;
    renderBranchTabs();
    refreshWorkflow(true);
}

async function handleOrderDateChange() {
    await refreshOrderNumber();
}

function handleBranchSelectChange() {
    if (!elements.branchSelect || !elements.cashBranchSelect) {
        return;
    }
    if (!elements.cashBranchSelect.value) {
        const matched = selectMatchingOption(state.references.cashBranches, elements.branchSelect.value);
        elements.cashBranchSelect.value = matched || elements.branchSelect.value;
    }
}

function handleClientSelection() {
    const selected = normalizeText(elements.clientName?.value || '');
    if (!selected) {
        return;
    }
    const client = state.clients.find((entry) => sameText(entry?.name, selected));
    if (!client) {
        return;
    }
    if (elements.contactNumber && !elements.contactNumber.value) {
        elements.contactNumber.value = formatContactNumber(client.contact_number || client.normalized_contact_number || '');
    }
    if (elements.deliveryAddress && !elements.deliveryAddress.value) {
        elements.deliveryAddress.value = normalizeText(client.address || '');
    }
}

function handleCourierChange() {
    const courier = normalizeText(elements.courierSelect?.value || '');
    if (!courier || !elements.fulfillmentType) {
        return;
    }
    if (SHIPMENT_OPTION_LIST.some((option) => sameText(option, courier))) {
        elements.fulfillmentType.value = 'Shipment';
    } else {
        elements.fulfillmentType.value = 'Booking';
    }
    handleFulfillmentTypeChange();
    if (elements.fulfillmentOption) {
        elements.fulfillmentOption.value = selectMatchingOption(
            elements.fulfillmentType.value === 'Shipment' ? SHIPMENT_OPTION_LIST : BOOKING_OPTION_LIST,
            courier
        );
    }
}

function handleFulfillmentTypeChange() {
    if (!elements.fulfillmentOption) {
        return;
    }
    const type = normalizeText(elements.fulfillmentType?.value || '');
    const options = type === 'Shipment' ? SHIPMENT_OPTION_LIST : (type === 'Booking' ? BOOKING_OPTION_LIST : []);
    renderSelect(elements.fulfillmentOption, options, '', type ? 'Select specific option' : 'Select fulfillment type first');
    elements.fulfillmentOption.disabled = !options.length;
}

function handlePaymentMethodChange() {
    const method = normalizeText(elements.paymentMethod?.value || '');
    if (elements.paymentType) {
        elements.paymentType.value = deriveDisplayPaymentType(method);
    }
}

function handlePaymentReceiptChange() {
    const file = elements.paymentReceipt?.files?.[0] || null;
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

function handleBoardActionClick(event) {
    const button = event.target.closest('button[data-entry-action][data-entry-id]');
    if (!button) {
        return;
    }
    const entryId = button.dataset.entryId;
    const action = button.dataset.entryAction;
    const entry = state.entries.find((item) => item.id === entryId);
    if (!entry) {
        return;
    }

    if (action === 'confirm') {
        confirmEntry(entry);
        return;
    }

    if (action === 'request_correction' || action === 'reject') {
        const note = window.prompt(
            action === 'request_correction'
                ? 'Enter the correction note for this order.'
                : 'Enter the rejection reason for this order.',
            entry.correctionNote || ''
        );
        if (note === null) {
            return;
        }
        updateWorkflowEntry(entryId, { action, note }, action === 'reject' ? 'Order rejected.' : 'Correction requested.');
    }
}

function handleInlineFileChange(event) {
    const input = event.target.closest('form[data-inline-action] input[type="file"][name="attachment"]');
    if (!input) {
        return;
    }
    const label = input.closest('label')?.querySelector('[data-file-name]');
    if (label) {
        label.textContent = input.files?.[0]?.name || label.textContent;
    }
}

async function handleInlineFormSubmit(event) {
    const form = event.target.closest('form[data-inline-action][data-entry-id]');
    if (!form) {
        return;
    }
    event.preventDefault();

    const entryId = form.dataset.entryId;
    const action = form.dataset.inlineAction;
    const fileInput = form.querySelector('input[name="attachment"]');
    const noteInput = form.querySelector('textarea[name="note"]');
    const file = fileInput?.files?.[0] || null;

    if (!file) {
        setBoardStatus('Attachment is required for this step.', true);
        return;
    }

    try {
        const attachment = await buildFilePayload(file);
        if (!attachment) {
            throw new Error('Unable to read the selected file.');
        }
        const payload = action === 'staff_receipt'
            ? { action, staffReceipt: attachment, note: noteInput?.value || '' }
            : { action, prepPhoto: attachment, note: noteInput?.value || '' };

        await updateWorkflowEntry(
            entryId,
            payload,
            action === 'staff_receipt'
                ? 'Staff receipt attached.'
                : 'Prep complete. Inventory deducted and order moved to final panel.'
        );
    } catch (error) {
        console.error('Workflow inline form failed:', error);
        setBoardStatus(error.message || 'Unable to save workflow step.', true);
    }
}

async function handleWorkflowSubmit(event) {
    event.preventDefault();

    try {
        const payload = await buildWorkflowPayload();
        await appClient.createCommunicationWorkflowEntry(payload);
        setWorkflowStatus(`Order ${payload.orderNumber} submitted for head admin review.`, false, true);
        resetWorkflowForm();
        await refreshWorkflow();
    } catch (error) {
        console.error('Workflow order submit failed:', error);
        setWorkflowStatus(error.message || 'Unable to submit workflow order.', true);
    }
}

async function buildWorkflowPayload() {
    const orderNumber = normalizeText(elements.orderNumber?.value || '');
    const orderDate = normalizeText(elements.orderDate?.value || '');
    const branch = normalizeText(elements.branchSelect?.value || '');
    const cashBranch = normalizeText(elements.cashBranchSelect?.value || '');
    const clientName = normalizeText(elements.clientName?.value || '');
    const contactNumber = normalizeText(elements.contactNumber?.value || '');
    const courier = normalizeText(elements.courierSelect?.value || '');
    const fulfillmentType = normalizeText(elements.fulfillmentType?.value || '');
    const fulfillmentOption = normalizeText(elements.fulfillmentOption?.value || '');
    const paymentMethod = normalizeText(elements.paymentMethod?.value || '');
    const paymentType = normalizeText(elements.paymentType?.value || '');
    const adminName = normalizeText(elements.adminSelect?.value || '');
    const salesRepresentative = normalizeText(elements.salesRepSelect?.value || '');
    const deliveryAddress = normalizeText(elements.deliveryAddress?.value || '');
    const deliveryFee = Math.max(0, Number(elements.deliveryFee?.value || 0));
    const handlingFee = Math.max(0, Number(elements.handlingFee?.value || 0));
    const items = getPreparedItems();
    const totalAmount = computeOrderTotal(items);
    const paymentReceiptFile = elements.paymentReceipt?.files?.[0] || null;
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
        sum + (Number(item.subtotal || 0))
    ), 0);
    return itemsTotal
        + Math.max(0, Number(elements.deliveryFee?.value || 0))
        + Math.max(0, Number(elements.handlingFee?.value || 0));
}

async function confirmEntry(entry) {
    try {
        const payload = buildSalesPayloadFromEntry(entry);
        await updateWorkflowEntry(entry.id, {
            action: 'confirm',
            salesPayload: payload
        }, 'Order confirmed and moved to staff receipt queue.');
    } catch (error) {
        console.error('Failed to confirm workflow entry:', error);
        setBoardStatus(error.message || 'Unable to confirm this order.', true);
    }
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
    const paymentMethodBreakdown = paymentMethod
        ? [{ method: paymentMethod, amount: amountPaid }]
        : [];

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
    if (!elements.orderNumber) {
        return;
    }

    try {
        const preview = await appClient.previewOrderNumber(elements.orderDate?.value || '');
        elements.orderNumber.value = normalizeText(preview?.orderNumber || preview?.nextOrderNumber || '');
    } catch (error) {
        console.warn('Unable to preview next order number:', error);
        elements.orderNumber.value = buildFallbackOrderNumber(elements.orderDate?.value || '');
    }
}

function setDefaultDate() {
    if (elements.orderDate && !elements.orderDate.value) {
        elements.orderDate.value = formatDateInputValue(new Date());
    }
}

function resetWorkflowForm() {
    elements.workflowForm?.reset();
    if (elements.branchSelect) {
        elements.branchSelect.value = selectMatchingOption(state.references.branches, state.assignedBranch || state.activeBranch || state.references.branches[0] || '');
    }
    if (elements.cashBranchSelect) {
        elements.cashBranchSelect.value = selectMatchingOption(state.references.cashBranches, state.assignedBranch || state.activeBranch || state.references.cashBranches[0] || '');
    }
    if (elements.adminSelect) {
        elements.adminSelect.value = selectMatchingOption(state.references.admins, state.references.admins[0] || state.session?.userName || '');
    }
    if (elements.salesRepSelect) {
        elements.salesRepSelect.value = selectMatchingOption(state.references.salesRepresentatives, state.references.salesRepresentatives[0] || state.session?.userName || '');
    }
    if (elements.paymentMethod) {
        elements.paymentMethod.value = state.references.paymentMethods[0] || '';
    }
    if (elements.deliveryFee) {
        elements.deliveryFee.value = '0';
    }
    if (elements.handlingFee) {
        elements.handlingFee.value = '0';
    }
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
    if (!elements.itemRows) {
        return;
    }

    elements.itemRows.innerHTML = state.itemRows.map((row) => {
        const variants = getVariantsForProduct(row.productName);
        const setOptions = variants.map((variant) => variant.setName);
        const subtotal = Number(row.quantity || 0) * Number(row.price || 0);
        return `
            <tr data-row-id="${escapeHtml(row.id)}">
              <td>
                <input type="text" list="productNameList" data-field="product" value="${escapeHtml(row.productName || '')}" placeholder="Search product">
              </td>
              <td>
                <select data-field="set">
                  <option value="">Select set</option>
                  ${setOptions.map((setName) => `
                    <option value="${escapeHtml(setName)}" ${sameText(setName, row.setName) ? 'selected' : ''}>${escapeHtml(setName)}</option>
                  `).join('')}
                </select>
              </td>
              <td>
                <input type="text" data-field="code" value="${escapeHtml(row.itemCode || '')}" readonly>
              </td>
              <td>
                <input type="number" min="0" step="0.01" data-field="price" value="${escapeHtml(sanitizeNumberInput(row.price))}">
              </td>
              <td>
                <input type="number" min="1" step="1" data-field="quantity" value="${escapeHtml(sanitizeIntegerInput(row.quantity))}">
              </td>
              <td><strong>${escapeHtml(formatCurrency(subtotal))}</strong></td>
              <td>
                <button type="button" class="row-remove-btn" data-row-action="remove" data-row-id="${escapeHtml(row.id)}">Remove</button>
              </td>
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
    if (!elements.totalAmount) {
        return;
    }
    const total = computeOrderTotal(getPreparedItems());
    elements.totalAmount.textContent = formatCurrency(total);
}

function renderSelect(selectElement, options = [], selectedValue = '', placeholder = 'Select option') {
    if (!selectElement) {
        return;
    }
    const list = uniqueNonEmpty(options);
    const activeValue = selectMatchingOption(list, selectedValue);
    selectElement.innerHTML = [`<option value="">${escapeHtml(placeholder)}</option>`]
        .concat(list.map((option) => (
            `<option value="${escapeHtml(option)}" ${sameText(option, activeValue) ? 'selected' : ''}>${escapeHtml(option)}</option>`
        )))
        .join('');
}

function renderAttachmentTarget(target, attachment, emptyText) {
    if (!target) {
        return;
    }
    target.classList.toggle('empty', !attachment);
    target.innerHTML = attachment ? renderAttachmentPreview(attachment, emptyText) : escapeHtml(emptyText);
}

function setBoardStatus(message, isError = false, isSuccess = false) {
    setStatus(elements.boardStatus, message, isError, isSuccess);
}

function setWorkflowStatus(message, isError = false, isSuccess = false) {
    setStatus(elements.workflowStatus, message, isError, isSuccess);
}

function setStatus(target, message, isError = false, isSuccess = false) {
    if (!target) {
        return;
    }
    target.textContent = message || '';
    target.classList.toggle('error', Boolean(isError));
    target.classList.toggle('success', Boolean(isSuccess && !isError));
}

function clearStatus(target) {
    if (!target) {
        return;
    }
    target.textContent = '';
    target.classList.remove('error', 'success');
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
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `ORD-${year}${month}${day}-0001`;
}

function formatDateInputValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value || '-';
    }
    return date.toLocaleDateString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
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
    return `PHP ${amount.toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
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
    return normalized.includes('online')
        || normalized.includes('bank')
        || normalized.includes('transfer');
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
