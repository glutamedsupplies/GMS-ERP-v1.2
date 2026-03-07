const appClient = window.appClient;

const STATUS_META = {
    submitted: { label: 'Order Submitted', className: 'status-submitted' },
    confirmed: { label: 'Confirmed by Head Admin', className: 'status-confirmed' },
    ready: { label: 'Booking Saved', className: 'status-ready' },
    in_transit: { label: 'In Transit', className: 'status-intransit' },
    own_booking: { label: 'Client Book', className: 'status-own-booking' }
};

const BOOKING_OPTION_LIST = ['Lalamove', 'Meet-Up', 'Client book', 'TOKTOK', 'MAXIM'];
const SHIPMENT_OPTION_LIST = ['LBC', 'J&T', 'SPX', 'Victory Liner', 'AP Cargo'];

const CHAT_ROOM_META = {
    delivery: { label: 'Booking', hint: 'Booking methods: Lalamove, Meet-Up, Client book, TOKTOK, MAXIM.', options: [...BOOKING_OPTION_LIST] },
    shipment: { label: 'Shipment', hint: 'Shipment couriers: LBC, J&T, SPX, Victory Liner, AP Cargo.', options: [...SHIPMENT_OPTION_LIST] }
};

const PANEL_KEYS = ['chat', 'order', 'workflow'];
const STORAGE_KEY_PREFIX = 'head-admin-communication-panel';
const STORAGE_VERSION = 2;
const MAX_PERSISTED_IMAGE_BYTES = 2 * 1024 * 1024;
const DELIVERY_OPTIONS = new Set(BOOKING_OPTION_LIST.map((option) => normalizeOptionToken(option)));
const SHIPMENT_OPTIONS = new Set(SHIPMENT_OPTION_LIST.map((option) => normalizeOptionToken(option)));
const MEET_UP_TOKENS = new Set(['meet-up', 'meet up', 'meetup']);
const FALLBACK_REFERENCES = {
    branches: ['Cubao', 'Pampanga'],
    cashBranches: ['Cubao', 'Pampanga'],
    couriers: [...BOOKING_OPTION_LIST, ...SHIPMENT_OPTION_LIST],
    admins: ['Head Admin'],
    salesRepresentatives: [],
    paymentMethods: ['Cash', 'Online Payment', 'Bank Transfer', 'LBC Collection']
};

const state = {
    activePanel: 'chat',
    activeBranch: 'cubao',
    activeRoom: 'delivery',
    workflowBranch: 'cubao',
    currentRole: 'head_admin',
    currentUserName: 'Head Admin',
    invoiceSequence: 1,
    storageKey: '',
    references: { ...FALLBACK_REFERENCES },
    clients: [],
    inventoryVariants: [],
    variantsByProduct: new Map(),
    products: [],
    itemRows: [],
    nextItemRowId: 1,
    pendingSalesSyncOrderIds: new Set(),
    mentionables: [],
    mentionContext: null,
    mentionMatches: [],
    mentionActiveIndex: 0,
    pastedPaymentReceiptFile: null,
    chats: { cubao: createEmptyChatRooms(), pampanga: createEmptyChatRooms() },
    orders: []
};

const elements = {
    panelSwitcher: document.getElementById('panelSwitcher'),
    panelSections: Array.from(document.querySelectorAll('[data-panel-view]')),
    chatTabs: document.getElementById('chatTabs'),
    chatRoomTabs: document.getElementById('chatRoomTabs'),
    chatRoomHint: document.getElementById('chatRoomHint'),
    chatMessages: document.getElementById('chatMessages'),
    chatForm: document.getElementById('chatForm'),
    chatInput: document.getElementById('chatInput'),
    mentionSuggestions: document.getElementById('mentionSuggestions'),
    chatFileInput: document.getElementById('chatFileInput'),
    chatFileName: document.getElementById('chatFileName'),
    chatFeedback: document.getElementById('chatFeedback'),
    sendOrderForm: document.getElementById('sendOrderForm'),
    orderNumber: document.getElementById('orderNumber'),
    orderDate: document.getElementById('orderDate'),
    clientName: document.getElementById('clientName'),
    clientNameList: document.getElementById('clientNameList'),
    contactNumber: document.getElementById('contactNumber'),
    deliveryAddress: document.getElementById('deliveryAddress'),
    orderItems: document.getElementById('orderItems'),
    quantity: document.getElementById('quantity'),
    totalAmount: document.getElementById('totalAmount'),
    addOrderItemBtn: document.getElementById('addOrderItemBtn'),
    orderItemsTableBody: document.getElementById('orderItemsTableBody'),
    branchSelect: document.getElementById('branchSelect'),
    cashBranchSelect: document.getElementById('cashBranchSelect'),
    courierSelect: document.getElementById('courierSelect'),
    paymentMethod: document.getElementById('paymentMethod'),
    paymentType: document.getElementById('paymentType'),
    adminSelect: document.getElementById('adminSelect'),
    salesRepSelect: document.getElementById('salesRepSelect'),
    paymentReceiptField: document.getElementById('paymentReceiptField'),
    paymentReceipt: document.getElementById('paymentReceipt'),
    paymentReceiptPasteZone: document.getElementById('paymentReceiptPasteZone'),
    paymentReceiptPasteStatus: document.getElementById('paymentReceiptPasteStatus'),
    clearPastedReceiptBtn: document.getElementById('clearPastedReceiptBtn'),
    fulfillmentType: document.getElementById('fulfillmentType'),
    fulfillmentOption: document.getElementById('fulfillmentOption'),
    deliveryFee: document.getElementById('deliveryFee'),
    handlingFee: document.getElementById('handlingFee'),
    orderFeedback: document.getElementById('orderFeedback'),
    confirmationQueue: document.getElementById('confirmationQueue'),
    invoiceFeed: document.getElementById('invoiceFeed'),
    workflowBranchTabs: document.getElementById('workflowBranchTabs'),
    bookingWorkflowFeed: document.getElementById('bookingWorkflowFeed'),
    shipmentWorkflowFeed: document.getElementById('shipmentWorkflowFeed'),
    pendingCount: document.getElementById('pendingCount'),
    readyCount: document.getElementById('readyCount'),
    invoiceCount: document.getElementById('invoiceCount'),
    queueCount: document.getElementById('queueCount'),
    orderProductNameList: document.getElementById('orderProductNameList')
};

window.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
    if (appClient?.ensureSession) {
        const session = await appClient.ensureSession({ role: 'head_admin' });
        if (!session) return;
        state.currentRole = String(session.role || 'head_admin').toLowerCase();
        state.currentUserName = String(session.userName || session.userId || 'Head Admin').trim() || 'Head Admin';
        state.storageKey = `${STORAGE_KEY_PREFIX}:${String(session.companyCode || session.companyId || 'default').toLowerCase()}`;
    }

    await hydrateOrderFormReferences();
    await hydrateOrderFormDataSources();
    await hydrateMentionables();
    loadPersistedState();
    if (!hasAnyMessages()) {
        seedInitialChats();
        persistState();
    }

    bindEvents();
    setDefaultOrderNumber();
    setDefaultOrderDate();
    setDefaultAdmin();
    handlePaymentMethodChange();
    handleFulfillmentTypeChange();
    ensureItemRowsInitialized();
    renderOrderItemRows();
    recalculateOrderTotalsFromItems();
    renderAll();
}

function bindEvents() {
    elements.panelSwitcher?.addEventListener('click', handlePanelSwitchClick);
    elements.chatTabs?.addEventListener('click', handleBranchTabClick);
    elements.chatRoomTabs?.addEventListener('click', handleRoomTabClick);
    elements.chatForm?.addEventListener('submit', handleChatSubmit);
    elements.chatFileInput?.addEventListener('change', handleChatFileSelected);
    elements.chatMessages?.addEventListener('click', handleChatMessageActionClick);
    elements.chatInput?.addEventListener('input', handleChatInputChange);
    elements.chatInput?.addEventListener('keydown', handleChatInputKeyDown);
    elements.chatInput?.addEventListener('blur', handleChatInputBlur);
    elements.mentionSuggestions?.addEventListener('mousedown', handleMentionSuggestionClick);
    elements.clientName?.addEventListener('change', handleClientSelectionChange);
    elements.clientName?.addEventListener('blur', handleClientSelectionChange);
    elements.deliveryFee?.addEventListener('input', handleDeliveryFeeInputChange);
    elements.handlingFee?.addEventListener('input', handleDeliveryFeeInputChange);
    elements.addOrderItemBtn?.addEventListener('click', handleAddOrderItemClick);
    elements.orderItemsTableBody?.addEventListener('change', handleOrderItemTableChange);
    elements.orderItemsTableBody?.addEventListener('input', handleOrderItemTableInput);
    elements.orderItemsTableBody?.addEventListener('click', handleOrderItemTableClick);
    elements.paymentReceipt?.addEventListener('change', handlePaymentReceiptFileChange);
    elements.paymentReceiptPasteZone?.addEventListener('paste', handlePaymentReceiptPaste);
    elements.paymentReceiptPasteZone?.addEventListener('click', handlePaymentReceiptPasteZoneClick);
    elements.clearPastedReceiptBtn?.addEventListener('click', handleClearPastedReceiptClick);
    elements.paymentMethod?.addEventListener('change', handlePaymentMethodChange);
    elements.courierSelect?.addEventListener('change', handleCourierChange);
    elements.fulfillmentType?.addEventListener('change', handleFulfillmentTypeChange);
    elements.sendOrderForm?.addEventListener('submit', handleOrderSubmit);
    elements.confirmationQueue?.addEventListener('click', handleQueueActionClick);
    elements.workflowBranchTabs?.addEventListener('click', handleWorkflowBranchTabClick);
    elements.invoiceFeed?.addEventListener('click', handleFeedActionClick);
    elements.invoiceFeed?.addEventListener('change', handleFeedFileChange);
    elements.invoiceFeed?.addEventListener('submit', handleFeedFormSubmit);
}

function handlePanelSwitchClick(event) {
    const button = event.target.closest('button[data-panel]');
    if (!button) return;
    state.activePanel = normalizePanelKey(button.dataset.panel);
    persistState();
    renderPanelSwitcher();
}

function handleBranchTabClick(event) {
    const tab = event.target.closest('button[data-branch]');
    if (!tab) return;
    state.activeBranch = tab.dataset.branch === 'pampanga' ? 'pampanga' : 'cubao';
    clearFeedback(elements.chatFeedback);
    persistState();
    renderChatRoomControls();
    renderChatMessages();
}

function handleRoomTabClick(event) {
    const tab = event.target.closest('button[data-room]');
    if (!tab) return;
    state.activeRoom = tab.dataset.room === 'shipment' ? 'shipment' : 'delivery';
    clearFeedback(elements.chatFeedback);
    persistState();
    renderChatRoomControls();
    renderChatMessages();
}

function handleWorkflowBranchTabClick(event) {
    const tab = event.target.closest('button[data-workflow-branch]');
    if (!tab) return;
    state.workflowBranch = tab.dataset.workflowBranch === 'pampanga' ? 'pampanga' : 'cubao';
    clearFeedback(elements.orderFeedback);
    persistState();
    renderWorkflowBranchControls();
    renderInvoiceFeed();
}

async function hydrateOrderFormDataSources() {
    try {
        const [clientPayload, inventoryVariants] = await Promise.all([
            appClient.listClients(''),
            appClient.listInventoryVariants()
        ]);
        state.clients = Array.isArray(clientPayload?.items) ? clientPayload.items : [];
        state.inventoryVariants = Array.isArray(inventoryVariants) ? inventoryVariants : [];
        buildInventoryVariantCache(state.inventoryVariants);
    } catch (error) {
        console.warn('Unable to load client and item data sources:', error);
        state.clients = [];
        state.inventoryVariants = [];
        state.variantsByProduct = new Map();
        state.products = [];
    }
    renderClientNameDatalist();
}

function buildInventoryVariantCache(rows = []) {
    const grouped = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
        const productName = String(row.product_name || row.productName || '').trim();
        const setName = String(row.set_name || row.setName || '').trim();
        if (!productName || !setName) return;

        const key = normalizeLookup(productName);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push({
            productName,
            setName,
            itemCode: String(row.item_code || row.itemCode || '').trim(),
            price: Number(row.price || 0),
            helper: String(row.helper || '').trim()
        });
    });

    grouped.forEach((variants) => {
        variants.sort((left, right) => String(left.setName || '').localeCompare(String(right.setName || ''), undefined, { numeric: true }));
    });

    state.variantsByProduct = grouped;
    state.products = Array.from(grouped.values())
        .map((variants) => variants[0]?.productName || '')
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right));
    renderOrderProductNameDatalist();
}

function renderClientNameDatalist() {
    if (!elements.clientNameList) return;
    const options = state.clients
        .map((client) => String(client?.name || '').trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right));
    elements.clientNameList.innerHTML = options.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
}

function renderOrderProductNameDatalist() {
    if (!elements.orderProductNameList) return;
    elements.orderProductNameList.innerHTML = state.products
        .map((productName) => `<option value="${escapeHtml(productName)}"></option>`)
        .join('');
}

function handleClientSelectionChange() {
    const selectedName = String(elements.clientName?.value || '').trim();
    if (!selectedName) return;
    const client = findClientByName(selectedName);
    if (!client) return;

    if (elements.contactNumber) {
        elements.contactNumber.value = formatContactNumber(client.contact_number || client.normalized_contact_number || elements.contactNumber.value || '');
    }
    if (elements.deliveryAddress) {
        const address = String(client.address || '').trim();
        if (address) elements.deliveryAddress.value = address;
    }
}

function findClientByName(name) {
    const target = normalizeLookup(name);
    if (!target) return null;
    return state.clients.find((client) => normalizeLookup(client?.name || '') === target) || null;
}

function formatContactNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
    if (/^09\d{9}$/.test(digits)) return digits;
    return String(value || '').trim();
}

function normalizeLookup(value) {
    return String(value || '').trim().toLowerCase();
}

function handleAddOrderItemClick() {
    addOrderItemRow();
    renderOrderItemRows();
    recalculateOrderTotalsFromItems();
}

function handleDeliveryFeeInputChange() {
    recalculateOrderTotalsFromItems();
}

function ensureItemRowsInitialized() {
    if (state.itemRows.length) return;
    addOrderItemRow();
}

function addOrderItemRow() {
    state.itemRows.push(createEmptyOrderItemRow(state.nextItemRowId));
    state.nextItemRowId += 1;
}

function createEmptyOrderItemRow(id) {
    return {
        id,
        productName: '',
        setName: '',
        itemCode: '',
        helper: '',
        price: 0,
        quantity: 1,
        subtotal: 0
    };
}

function getOrderItemRowFromTarget(target) {
    const rowElement = target?.closest?.('tr[data-item-row-id]');
    if (!rowElement) return null;
    const rowId = Number(rowElement.dataset.itemRowId || 0);
    if (!rowId) return null;
    return state.itemRows.find((row) => row.id === rowId) || null;
}

function handleOrderItemTableChange(event) {
    const row = getOrderItemRowFromTarget(event.target);
    if (!row) return;
    const field = String(event.target.dataset.itemField || '').trim();
    if (!field) return;

    if (field === 'product') {
        row.productName = String(event.target.value || '').trim();
        row.setName = '';
        row.itemCode = '';
        row.helper = '';
        row.price = 0;
        row.subtotal = 0;
    } else if (field === 'set') {
        row.setName = String(event.target.value || '').trim();
    } else if (field === 'price') {
        row.price = Math.max(0, Number(event.target.value || 0));
    } else if (field === 'quantity') {
        row.quantity = Math.max(1, Number(event.target.value || 1));
    }

    syncOrderItemVariant(row);
    renderOrderItemRows();
    recalculateOrderTotalsFromItems();
}

function handleOrderItemTableInput(event) {
    const row = getOrderItemRowFromTarget(event.target);
    if (!row) return;
    const field = String(event.target.dataset.itemField || '').trim();
    if (field === 'price') {
        row.price = Math.max(0, Number(event.target.value || 0));
        updateOrderItemSubtotal(row);
        recalculateOrderTotalsFromItems();
        syncRowSubtotalInput(row.id, row.subtotal);
    }
    if (field === 'quantity') {
        row.quantity = Math.max(1, Number(event.target.value || 1));
        updateOrderItemSubtotal(row);
        recalculateOrderTotalsFromItems();
        syncRowSubtotalInput(row.id, row.subtotal);
    }
}

function handleOrderItemTableClick(event) {
    const removeButton = event.target.closest('button[data-item-action="remove"]');
    if (!removeButton) return;
    const row = getOrderItemRowFromTarget(removeButton);
    if (!row) return;
    state.itemRows = state.itemRows.filter((entry) => entry.id !== row.id);
    ensureItemRowsInitialized();
    renderOrderItemRows();
    recalculateOrderTotalsFromItems();
}

function syncOrderItemVariant(row) {
    const variants = state.variantsByProduct.get(normalizeLookup(row.productName)) || [];
    const variant = variants.find((entry) => normalizeLookup(entry.setName) === normalizeLookup(row.setName)) || null;
    if (!variant) {
        row.itemCode = '';
        row.helper = '';
        if (!row.setName) row.price = 0;
        updateOrderItemSubtotal(row);
        return;
    }

    row.itemCode = String(variant.itemCode || '').trim();
    row.helper = String(variant.helper || '').trim();
    if (!(Number(row.price || 0) > 0)) {
        row.price = Number(variant.price || 0);
    }
    updateOrderItemSubtotal(row);
}

function updateOrderItemSubtotal(row) {
    row.subtotal = Math.max(1, Number(row.quantity || 1)) * Math.max(0, Number(row.price || 0));
}

function syncRowSubtotalInput(rowId, subtotal) {
    const input = document.querySelector(`tr[data-item-row-id="${rowId}"] input[data-item-field="subtotal"]`);
    if (input) input.value = formatMoneyInput(subtotal);
}

function renderOrderItemRows() {
    if (!elements.orderItemsTableBody) return;
    ensureItemRowsInitialized();
    elements.orderItemsTableBody.innerHTML = state.itemRows.map((row) => {
        const setOptions = buildSetSelectOptions(row.productName, row.setName);
        return `
            <tr data-item-row-id="${row.id}">
              <td><input data-item-field="product" type="text" list="orderProductNameList" placeholder="Type product name" value="${escapeHtml(row.productName || '')}"></td>
              <td><select data-item-field="set" ${row.productName ? '' : 'disabled'}>${setOptions}</select></td>
              <td><input data-item-field="itemCode" type="text" value="${escapeHtml(row.itemCode || '')}" readonly></td>
              <td><input data-item-field="price" type="number" min="0" step="0.01" value="${Number(row.price || 0).toFixed(2)}"></td>
              <td><input data-item-field="quantity" type="number" min="1" step="1" value="${Math.max(1, Number(row.quantity || 1))}"></td>
              <td><input data-item-field="subtotal" type="text" value="${formatMoneyInput(row.subtotal)}" readonly></td>
              <td><button type="button" class="mini-remove-btn" data-item-action="remove" title="Remove item"><i class="fa-solid fa-trash"></i></button></td>
            </tr>
        `;
    }).join('');
}

function buildSetSelectOptions(productName = '', selectedValue = '') {
    const selected = String(selectedValue || '').trim();
    const options = [`<option value="">${productName ? 'Select set' : 'Select product first'}</option>`];
    const variants = state.variantsByProduct.get(normalizeLookup(productName)) || [];
    variants.forEach((variant) => {
        const label = String(variant.setName || '').trim();
        if (!label) return;
        options.push(`<option value="${escapeHtml(label)}" ${label === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`);
    });
    return options.join('');
}

function getPreparedOrderItems() {
    return state.itemRows
        .map((row) => ({
            productName: String(row.productName || '').trim(),
            setName: String(row.setName || '').trim(),
            itemCode: String(row.itemCode || '').trim(),
            helper: String(row.helper || '').trim(),
            price: Math.max(0, Number(row.price || 0)),
            quantity: Math.max(1, Number(row.quantity || 1)),
            subtotal: Math.max(0, Number(row.subtotal || 0))
        }))
        .filter((item) => item.productName && item.setName && item.itemCode && item.quantity > 0);
}

function buildOrderItemsSummaryText(items) {
    if (!items.length) return '';
    return items.map((item, index) => (
        `${index + 1}. ${item.productName} (${item.setName})${item.itemCode ? ` [${item.itemCode}]` : ''} x${item.quantity} @ ${formatMoneyInput(item.price)} = ${formatMoneyInput(item.subtotal)}`
    )).join('\n');
}

function recalculateOrderTotalsFromItems() {
    const preparedItems = getPreparedOrderItems();
    const totalQuantity = preparedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const itemsTotal = preparedItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const deliveryFee = Math.max(0, Number(elements.deliveryFee?.value || 0));
    const handlingFee = Math.max(0, Number(elements.handlingFee?.value || 0));
    const orderTotal = itemsTotal + deliveryFee + handlingFee;
    if (elements.quantity) {
        elements.quantity.value = totalQuantity > 0 ? String(totalQuantity) : '';
    }
    if (elements.totalAmount) {
        elements.totalAmount.value = formatNumberInputValue(orderTotal);
    }
    if (elements.orderItems) {
        elements.orderItems.value = buildOrderItemsSummaryText(preparedItems);
    }
}

function formatMoneyInput(value) {
    return `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumberInputValue(value) {
    return Number(value || 0).toFixed(2);
}

function handleChatFileSelected() {
    const file = elements.chatFileInput?.files?.[0];
    if (elements.chatFileName) elements.chatFileName.textContent = file ? file.name : 'No file selected';
}

async function handleChatSubmit(event) {
    event.preventDefault();
    const text = String(elements.chatInput?.value || '').trim();
    const attachedFile = elements.chatFileInput?.files?.[0] || null;
    if (!text && !attachedFile) {
        setFeedback(elements.chatFeedback, 'Enter a message or attach a file before sending.', true);
        return;
    }

    state.chats[state.activeBranch][state.activeRoom].push({
        id: createLocalId(),
        sender: state.currentUserName || 'Head Admin',
        text,
        branch: state.activeBranch,
        room: state.activeRoom,
        provider: '',
        senderRole: state.currentRole || 'head_admin',
        kind: 'message',
        createdAt: new Date().toISOString(),
        system: false,
        attachment: await buildFilePayload(attachedFile)
    });
    persistState();

    elements.chatForm?.reset();
    hideMentionSuggestions();
    if (elements.chatFileName) elements.chatFileName.textContent = 'No file selected';
    setFeedback(elements.chatFeedback, `Message sent to ${state.activeBranch === 'cubao' ? 'Cubao' : 'Pampanga'} ${CHAT_ROOM_META[state.activeRoom].label} Chat.`);
    renderChatMessages();
}

function handlePaymentMethodChange() {
    const paymentMethod = String(elements.paymentMethod?.value || '').trim();
    const isOnline = paymentMethod === 'Online Payment';
    if (elements.paymentReceiptField) elements.paymentReceiptField.hidden = !isOnline;
    if (elements.paymentReceipt) {
        elements.paymentReceipt.required = isOnline;
        if (!isOnline) elements.paymentReceipt.value = '';
    }
    if (!isOnline) clearPastedPaymentReceipt(true);
    updatePaymentReceiptPasteUI();
    if (elements.paymentType) {
        elements.paymentType.value = derivePaymentType(paymentMethod);
    }
}

function handlePaymentReceiptFileChange() {
    const file = elements.paymentReceipt?.files?.[0] || null;
    if (file && state.pastedPaymentReceiptFile) {
        state.pastedPaymentReceiptFile = null;
    }
    updatePaymentReceiptPasteUI();
}

function handlePaymentReceiptPasteZoneClick() {
    elements.paymentReceiptPasteZone?.focus();
}

function handlePaymentReceiptPaste(event) {
    const clipboardItems = Array.from(event.clipboardData?.items || []);
    const imageItem = clipboardItems.find((item) => String(item.type || '').startsWith('image/'));
    if (!imageItem) return;

    event.preventDefault();
    const pastedFile = imageItem.getAsFile();
    if (!pastedFile) return;

    const extension = String(pastedFile.type || '').includes('png') ? 'png' : 'jpg';
    const normalizedName = `payment-receipt-${Date.now()}.${extension}`;
    const normalizedFile = new File([pastedFile], normalizedName, {
        type: pastedFile.type || 'image/png',
        lastModified: Date.now()
    });
    state.pastedPaymentReceiptFile = normalizedFile;
    if (elements.paymentReceipt) elements.paymentReceipt.value = '';
    updatePaymentReceiptPasteUI();
    setFeedback(elements.orderFeedback, 'Pasted receipt image attached.');
}

function handleClearPastedReceiptClick() {
    clearPastedPaymentReceipt();
    updatePaymentReceiptPasteUI();
    setFeedback(elements.orderFeedback, 'Pasted receipt image cleared.');
}

function clearPastedPaymentReceipt(silent = false) {
    state.pastedPaymentReceiptFile = null;
    if (!silent && elements.paymentReceipt) elements.paymentReceipt.value = '';
}

function resolveSelectedPaymentReceiptFile() {
    return elements.paymentReceipt?.files?.[0]
        || state.pastedPaymentReceiptFile
        || null;
}

function updatePaymentReceiptPasteUI() {
    if (!elements.paymentReceiptPasteStatus || !elements.paymentReceiptPasteZone) return;
    const selectedUpload = elements.paymentReceipt?.files?.[0] || null;
    const pastedImage = state.pastedPaymentReceiptFile;
    const active = selectedUpload || pastedImage;
    const label = selectedUpload
        ? `Selected file: ${selectedUpload.name}`
        : (pastedImage ? `Pasted image: ${pastedImage.name}` : 'No pasted receipt image.');
    elements.paymentReceiptPasteStatus.textContent = label;
    elements.paymentReceiptPasteZone.classList.toggle('ready', Boolean(active));
    if (elements.clearPastedReceiptBtn) {
        elements.clearPastedReceiptBtn.hidden = !pastedImage;
    }
}

function handleCourierChange() {
    const courier = String(elements.courierSelect?.value || '').trim();
    if (!courier || !elements.fulfillmentType || !elements.fulfillmentOption) return;
    if (isShipmentOption(courier)) {
        elements.fulfillmentType.value = 'Shipment';
        handleFulfillmentTypeChange();
        elements.fulfillmentOption.value = courier;
    } else if (isBookingOption(courier)) {
        elements.fulfillmentType.value = 'Booking';
        handleFulfillmentTypeChange();
        elements.fulfillmentOption.value = courier;
    }
}

function handleFulfillmentTypeChange() {
    const selectedType = normalizeFulfillmentType(elements.fulfillmentType?.value);
    const room = selectedType === 'Shipment' ? 'shipment' : 'delivery';
    const options = selectedType ? CHAT_ROOM_META[room].options : [];
    if (!elements.fulfillmentOption) return;

    elements.fulfillmentOption.innerHTML = '';
    if (!selectedType) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select fulfillment type first';
        elements.fulfillmentOption.appendChild(placeholder);
        elements.fulfillmentOption.disabled = true;
        return;
    }

    const firstOption = document.createElement('option');
    firstOption.value = '';
    firstOption.textContent = `Select ${CHAT_ROOM_META[room].label.toLowerCase()} option`;
    elements.fulfillmentOption.appendChild(firstOption);
    options.forEach((label) => {
        const option = document.createElement('option');
        option.value = label;
        option.textContent = label;
        elements.fulfillmentOption.appendChild(option);
    });
    elements.fulfillmentOption.disabled = false;
}

async function handleOrderSubmit(event) {
    event.preventDefault();
    const rawPaymentMethod = String(elements.paymentMethod?.value || '').trim();
    const preparedItems = getPreparedOrderItems();
    const orderItemsSummary = buildOrderItemsSummaryText(preparedItems);
    const computedQuantity = preparedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const computedItemsTotal = preparedItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const values = {
        orderNumber: String(elements.orderNumber?.value || '').trim() || generateOrderNumber(),
        orderDate: String(elements.orderDate?.value || '').trim(),
        paymentType: String(elements.paymentType?.value || '').trim() || derivePaymentType(rawPaymentMethod),
        clientName: String(elements.clientName?.value || '').trim(),
        contactNumber: String(elements.contactNumber?.value || '').trim(),
        deliveryAddress: String(elements.deliveryAddress?.value || '').trim(),
        branch: String(elements.branchSelect?.value || '').trim(),
        cashBranch: String(elements.cashBranchSelect?.value || '').trim(),
        courier: String(elements.courierSelect?.value || '').trim(),
        adminName: String(elements.adminSelect?.value || '').trim(),
        salesRepresentative: String(elements.salesRepSelect?.value || '').trim(),
        orderItems: orderItemsSummary,
        quantity: computedQuantity,
        fulfillmentType: normalizeFulfillmentType(elements.fulfillmentType?.value),
        fulfillmentOption: String(elements.fulfillmentOption?.value || '').trim(),
        deliveryFee: Number(elements.deliveryFee?.value || 0),
        handlingFee: Number(elements.handlingFee?.value || 0),
        totalAmount: computedItemsTotal
            + Math.max(0, Number(elements.deliveryFee?.value || 0))
            + Math.max(0, Number(elements.handlingFee?.value || 0)),
        paymentMethod: rawPaymentMethod
    };

    const paymentReceiptFile = resolveSelectedPaymentReceiptFile();

    if (!values.orderDate) return setFeedback(elements.orderFeedback, 'Order date is required.', true);
    if (!values.branch) return setFeedback(elements.orderFeedback, 'Invoice branch is required.', true);
    if (!values.cashBranch) return setFeedback(elements.orderFeedback, 'Cash branch is required.', true);
    if (!values.adminName) return setFeedback(elements.orderFeedback, 'Admin is required.', true);
    if (!values.courier) return setFeedback(elements.orderFeedback, 'Courier is required.', true);
    if (!preparedItems.length) return setFeedback(elements.orderFeedback, 'Add at least one complete item row (product, set, item code, qty).', true);
    if (values.paymentMethod === 'Online Payment' && !paymentReceiptFile) {
        return setFeedback(elements.orderFeedback, 'Payment receipt is required when payment method is Online Payment.', true);
    }
    if (!values.fulfillmentType || !values.fulfillmentOption) {
        return setFeedback(elements.orderFeedback, 'Select fulfillment type and booking/shipment option.', true);
    }
    if (values.fulfillmentType === 'Shipment' && !isShipmentOption(values.fulfillmentOption)) {
        return setFeedback(elements.orderFeedback, 'Selected option is not valid for Shipment workflow.', true);
    }
    if (values.fulfillmentType === 'Booking' && !isBookingOption(values.fulfillmentOption)) {
        return setFeedback(elements.orderFeedback, 'Selected option is not valid for Booking workflow.', true);
    }
    values.courier = values.fulfillmentOption || values.courier;

    const nextOrder = {
        id: createLocalId(),
        invoiceNumber: generateInvoiceNumber(),
        ...values,
        items: preparedItems.map((item) => ({
            itemSold: item.productName,
            productName: item.productName,
            itemSet: item.setName,
            itemCode: item.itemCode,
            helper: item.helper,
            unitPrice: item.price,
            quantity: item.quantity,
            subtotal: item.subtotal
        })),
        receipt: await buildFilePayload(paymentReceiptFile),
        status: 'submitted',
        adminStatus: 'pending',
        assignedStaff: 'Head Admin Review',
        trackingStatus: 'Pending Confirmation',
        createdAt: new Date().toISOString(),
        salesSyncStatus: 'not_synced',
        salesOrderNumber: '',
        salesSyncedAt: '',
        salesSyncError: '',
        booking: null,
        shipment: null
    };

    state.orders.unshift(nextOrder);
    postInvoiceToChat(nextOrder);
    persistState();

    elements.sendOrderForm?.reset();
    clearPastedPaymentReceipt(true);
    updatePaymentReceiptPasteUI();
    state.itemRows = [];
    state.nextItemRowId = 1;
    ensureItemRowsInitialized();
    renderOrderItemRows();
    setDefaultOrderNumber();
    setDefaultOrderDate();
    setDefaultAdmin();
    handlePaymentMethodChange();
    handleFulfillmentTypeChange();
    recalculateOrderTotalsFromItems();
    setFeedback(elements.orderFeedback, `Order submitted. ${nextOrder.invoiceNumber} added to Head Admin Confirmation Queue.`);
    renderAll();
}

async function handleQueueActionClick(event) {
    const button = event.target.closest('button[data-queue-action][data-order-id]');
    if (!button) return;
    const action = String(button.dataset.queueAction || '').trim().toLowerCase();
    if (action === 'delete') {
        if (!canDeleteTransactions()) {
            setFeedback(elements.orderFeedback, 'Only Head Admin can delete transactions.', true);
            return;
        }
        deleteOrderTransaction(button.dataset.orderId, 'queue');
        return;
    }
    button.disabled = true;
    try {
        await applyAdminAction(button.dataset.orderId, action);
    } finally {
        button.disabled = false;
    }
}

async function handleFeedActionClick(event) {
    const button = event.target.closest('button[data-feed-action][data-order-id]');
    if (!button) return;
    const action = String(button.dataset.feedAction || '').trim().toLowerCase();
    if (action === 'delete') {
        if (!canDeleteTransactions()) {
            setFeedback(elements.orderFeedback, 'Only Head Admin can delete transactions.', true);
            return;
        }
        deleteOrderTransaction(button.dataset.orderId, 'workflow');
        return;
    }
    if (action === 'confirm' || action === 'reject' || action === 'correction') {
        button.disabled = true;
        try {
            await applyAdminAction(button.dataset.orderId, action);
        } finally {
            button.disabled = false;
        }
    }
}

function handleFeedFileChange(event) {
    const bookingMethod = event.target.closest('select[name="bookingMethod"]');
    if (bookingMethod) {
        const form = bookingMethod.closest('form[data-role="booking-form"]');
        if (form) updateBookingMeetUpFieldState(form, bookingMethod.value);
        return;
    }
    const input = event.target.closest('input[data-role="shipment-receipt"][data-order-id]');
    if (!input) return;
    const marker = input.closest('.field')?.querySelector('[data-role="shipment-receipt-name"]');
    if (marker) marker.textContent = input.files?.[0]?.name || 'No receipt selected';
}

async function handleFeedFormSubmit(event) {
    const form = event.target.closest('form[data-order-id]');
    if (!form) return;
    event.preventDefault();
    const order = findOrder(form.dataset.orderId);
    if (!order) return;

    const formData = new FormData(form);
    if (form.dataset.role === 'booking-form') {
        const selectedMethod = String(formData.get('bookingMethod') || '').trim();
        const meetUpMode = isMeetUpMethod(selectedMethod);
        const booking = {
            method: selectedMethod,
            riderName: String(formData.get('riderName') || '').trim(),
            riderContact: String(formData.get('riderContact') || '').trim(),
            deliveryFee: Number(formData.get('deliveryFee') || 0),
            handlingFee: Number(formData.get('handlingFee') || 0),
            receiver: String(formData.get('receiver') || '').trim(),
            trackingLink: String(formData.get('trackingLink') || '').trim()
        };
        if (!booking.method) {
            return setFeedback(elements.orderFeedback, 'Select a booking method before saving booking.', true);
        }
        if (!meetUpMode && (!booking.riderName || !booking.riderContact || !booking.receiver || !booking.trackingLink)) {
            return setFeedback(elements.orderFeedback, 'Complete booking method, rider name, contact, receiver, and tracking link before saving booking.', true);
        }
        if (meetUpMode) {
            booking.riderName = '';
            booking.riderContact = '';
        }

        order.booking = booking;
        order.shipment = null;
        order.fulfillmentType = 'Booking';
        order.fulfillmentOption = booking.method;
        order.courier = booking.method;
        order.deliveryFee = Number(booking.deliveryFee || 0);
        order.handlingFee = Number(booking.handlingFee || 0);
        recalculateStoredOrderTotal(order);
        order.status = isClientBookMethod(booking.method) ? 'own_booking' : 'ready';
        order.assignedStaff = meetUpMode
            ? 'Meet-Up Coordination'
            : (booking.riderName ? `Rider: ${booking.riderName}` : 'Booking Team');
        order.trackingStatus = meetUpMode ? 'Meet-Up Scheduled' : 'Booking Assigned';
        postOrderActionToChat(
            order,
            meetUpMode
                ? `${order.invoiceNumber} booking updated to Meet-Up.`
                : `${order.invoiceNumber} booking assigned via ${booking.method} to ${booking.riderName}. Receiver: ${booking.receiver}.`
        );
        persistState();
        setFeedback(elements.orderFeedback, `${order.invoiceNumber} booking details saved.`);
        return renderAll();
    }

    if (form.dataset.role === 'invoice-edit-form') {
        const nextClientName = String(formData.get('clientName') || '').trim();
        if (!nextClientName) {
            return setFeedback(elements.orderFeedback, 'Client name is required.', true);
        }

        order.clientName = nextClientName;
        order.contactNumber = String(formData.get('contactNumber') || '').trim();
        order.deliveryAddress = String(formData.get('deliveryAddress') || '').trim();
        order.paymentMethod = String(formData.get('paymentMethod') || '').trim() || order.paymentMethod;
        order.paymentType = derivePaymentType(order.paymentMethod);
        order.courier = String(formData.get('courier') || '').trim() || order.courier;
        order.deliveryFee = Number(formData.get('deliveryFee') || 0);
        order.handlingFee = Number(formData.get('handlingFee') || 0);
        if (order.booking) {
            order.booking.deliveryFee = Number(order.deliveryFee || 0);
            order.booking.handlingFee = Number(order.handlingFee || 0);
        }
        recalculateStoredOrderTotal(order);
        postOrderActionToChat(order, `${order.invoiceNumber} invoice details were edited in workflow panel.`);
        persistState();
        setFeedback(elements.orderFeedback, `${order.invoiceNumber} invoice details saved.`);
        return renderAll();
    }

    if (form.dataset.role === 'shipment-booking-form') {
        const uploadedReceipt = await buildFilePayload(form.querySelector('input[name="shipmentReceipt"]')?.files?.[0] || null);
        const shipment = {
            courier: String(formData.get('shipmentCourier') || '').trim(),
            receiver: String(formData.get('shipmentReceiver') || '').trim(),
            trackingLink: String(formData.get('shipmentTrackingLink') || '').trim(),
            receipt: uploadedReceipt || (order.shipment?.receipt ? { ...order.shipment.receipt } : null)
        };
        if (!shipment.courier || !shipment.receiver || !shipment.trackingLink) {
            return setFeedback(elements.orderFeedback, 'Complete courier, receiver, and tracking link before saving shipment.', true);
        }

        order.shipment = shipment;
        order.booking = null;
        order.fulfillmentType = 'Shipment';
        order.fulfillmentOption = shipment.courier;
        order.courier = shipment.courier;
        if (shipment.courier.toUpperCase() === 'LBC') {
            order.status = 'in_transit';
            order.trackingStatus = 'In Transit';
            await syncLbcTracking(order, shipment);
        } else {
            order.status = 'ready';
            order.trackingStatus = 'Shipment Scheduled';
        }
        order.assignedStaff = `${shipment.courier} Shipment Desk`;
        postOrderActionToChat(order, `${order.invoiceNumber} shipment sent via ${shipment.courier}. Receiver: ${shipment.receiver}.`, shipment.receipt);
        persistState();
        setFeedback(elements.orderFeedback, `${order.invoiceNumber} shipment details saved.`);
        renderAll();
    }
}

async function applyAdminAction(orderId, action) {
    const order = findOrder(orderId);
    if (!order) return;

    if (action === 'confirm') {
        if (isOrderSyncing(order)) {
            setFeedback(elements.orderFeedback, `Sales sync is still running for ${order.invoiceNumber}. Please wait.`);
            return;
        }

        if (!appClient?.createOrder) {
            setFeedback(elements.orderFeedback, 'Sales API is unavailable. Cannot confirm order right now.', true);
            return;
        }

        setFeedback(elements.orderFeedback, `Syncing ${order.invoiceNumber} to Sales and Inventory...`);
        const syncResult = await syncOrderToSales(order);
        if (!syncResult.ok) {
            const errorText = String(syncResult.error || 'Unable to sync order to Sales.').trim();
            if (syncResult.inProgress) {
                setFeedback(elements.orderFeedback, errorText, true);
                return;
            }
            order.salesSyncStatus = 'failed';
            order.salesSyncError = errorText;
            persistState();
            renderAll();
            setFeedback(elements.orderFeedback, `${order.invoiceNumber} not confirmed. ${order.salesSyncError}`, true);
            return;
        }

        order.adminStatus = 'confirmed';
        order.status = 'confirmed';
        order.assignedStaff = resolveWorkflowLane(order) === 'shipment' ? 'Shipment Team' : 'Booking Team';
        order.trackingStatus = 'For Dispatch';
        order.salesSyncStatus = 'synced';
        order.salesSyncError = '';
        postOrderActionToChat(order, `${order.invoiceNumber} confirmed by Head Admin. Continue in ${resolveWorkflowLane(order) === 'shipment' ? 'Shipment Panel' : 'Booking Panel'}.`);
        setFeedback(elements.orderFeedback, `${order.invoiceNumber} confirmed and synced to Sales (${order.salesOrderNumber || syncResult.orderNumber || order.orderNumber || '-'}) with inventory deduction.`);
    }
    if (action === 'reject') {
        order.adminStatus = 'rejected';
        order.assignedStaff = 'Head Admin - Rejected';
        order.trackingStatus = 'Rejected';
        postOrderActionToChat(order, `${order.invoiceNumber} was rejected by Head Admin.`);
        setFeedback(elements.orderFeedback, `${order.invoiceNumber} rejected.`);
    }
    if (action === 'correction') {
        order.adminStatus = 'correction';
        order.assignedStaff = 'Awaiting Employee Correction';
        order.trackingStatus = 'Correction Requested';
        postOrderActionToChat(order, `${order.invoiceNumber} marked for correction by Head Admin.`);
        setFeedback(elements.orderFeedback, `${order.invoiceNumber} marked: Request Correction.`);
    }

    persistState();
    renderAll();
}

function isOrderSyncing(order) {
    const orderId = String(order?.id || '').trim();
    if (!orderId) return false;
    return state.pendingSalesSyncOrderIds.has(orderId);
}

async function syncOrderToSales(order) {
    const orderId = String(order?.id || '').trim();
    if (!orderId) {
        return { ok: false, error: 'Order is missing a local ID.' };
    }

    if (isOrderSyncing(order)) {
        return { ok: false, inProgress: true, error: 'Sales sync is already in progress for this order.' };
    }

    if (normalizeSalesSyncStatus(order.salesSyncStatus) === 'synced') {
        return {
            ok: true,
            alreadySynced: true,
            orderNumber: String(order.salesOrderNumber || order.orderNumber || '').trim()
        };
    }

    state.pendingSalesSyncOrderIds.add(orderId);
    try {
        const payload = buildSalesPayloadFromOrder(order);
        const result = await appClient.createOrder(payload);
        const syncedOrderNumber = String(result?.orderNumber || result?.receiptNumber || payload.orderNumber || '').trim();
        order.salesOrderNumber = syncedOrderNumber;
        order.salesSyncedAt = new Date().toISOString();
        order.salesSyncStatus = 'synced';
        order.salesSyncError = '';
        return { ok: true, orderNumber: syncedOrderNumber, result };
    } catch (error) {
        return { ok: false, error: error?.message || 'Unable to sync order to Sales.' };
    } finally {
        state.pendingSalesSyncOrderIds.delete(orderId);
    }
}

function buildSalesPayloadFromOrder(order) {
    const saleDate = String(order?.orderDate || '').trim() || formatDateInputValue(new Date());
    const branch = matchConfiguredOption(order?.branch, state.references.branches) || String(order?.branch || '').trim();
    const cashBranch = matchConfiguredOption(order?.cashBranch || order?.branch, state.references.cashBranches) || String(order?.cashBranch || order?.branch || '').trim();
    const courier = matchConfiguredOption(order?.courier || order?.fulfillmentOption, state.references.couriers) || String(order?.courier || order?.fulfillmentOption || '').trim();
    const adminName = matchConfiguredOption(order?.adminName, state.references.admins) || String(order?.adminName || '').trim();
    const salesRepresentative = resolveOrderSalesRepresentative(order);
    const clientName = String(order?.clientName || '').trim();
    const clientContact = String(order?.contactNumber || '').trim();
    const clientAddress = String(order?.deliveryAddress || '').trim();
    const items = normalizeStoredOrderItems(order?.items)
        .map((item) => normalizeOrderItemForSales(item))
        .filter((item) => item.itemSold && item.itemSet && item.itemCode);

    if (!branch) throw new Error('Invoice branch is required.');
    if (!cashBranch) throw new Error('Cash branch is required.');
    if (!courier) throw new Error('Courier is required.');
    if (!adminName) throw new Error('Admin is required.');
    if (!salesRepresentative) throw new Error('Sales representative is required before confirmation.');
    if (!clientName) throw new Error('Client name is required.');
    if (!items.length) throw new Error('At least one valid item row is required before confirmation.');

    const baseTotal = items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0);
    const deliveryFee = Math.max(0, Number(order?.deliveryFee || 0));
    const handlingFee = Math.max(0, Number(order?.handlingFee || 0));
    const logisticsFee = deliveryFee + handlingFee;
    const deliveryFeeToCollect = logisticsFee > 0;
    const orderTotal = baseTotal + (deliveryFeeToCollect ? logisticsFee : 0);
    const paymentMethod = resolveOrderPaymentMethod(order);
    const paymentMethodBreakdown = buildPaymentMethodBreakdownForSales(paymentMethod, orderTotal);
    const amountPaid = paymentMethodBreakdown.reduce((sum, entry) => sum + Math.max(0, Number(entry?.amount || 0)), 0);
    const paymentMethods = paymentMethod ? [paymentMethod] : [];
    const paymentMethodLabel = paymentMethods.join(' + ');

    return {
        orderNumber: String(order?.orderNumber || '').trim() || generateOrderNumber(),
        saleDate,
        branch,
        cashBranch,
        courier,
        paymentType: amountPaid >= orderTotal ? 'Full Paid' : 'Partial',
        paymentMethods,
        paymentMethod: paymentMethodLabel,
        paymentOption: paymentMethodLabel,
        paymentMethodBreakdown,
        adminName,
        salesRepresentative,
        clientName,
        clientContact,
        clientAddress,
        amountPaid,
        paymentAmount: amountPaid,
        deliveryFee: logisticsFee,
        handlingFee,
        deliveryFeeToCollect,
        collectionAmount: Math.max(orderTotal - amountPaid, 0),
        overpaymentAmount: Math.max(amountPaid - orderTotal, 0),
        underpaymentAmount: Math.max(orderTotal - amountPaid, 0),
        baseTotal,
        orderTotal,
        note: String(order?.orderItems || '').trim(),
        items
    };
}

function normalizeOrderItemForSales(item) {
    const itemSold = String(item?.itemSold || item?.productName || '').trim();
    const itemSet = String(item?.itemSet || item?.setName || '').trim();
    const itemCode = String(item?.itemCode || '').trim();
    const helper = String(item?.helper || [itemCode, itemSet].filter(Boolean).join(' | ')).trim();
    return {
        itemSold,
        productName: itemSold,
        itemSet,
        itemCode,
        helper,
        quantity: Math.max(1, Number(item?.quantity || 1)),
        unitPrice: Math.max(0, Number(item?.unitPrice || item?.price || 0))
    };
}

function resolveOrderSalesRepresentative(order) {
    const direct = String(order?.salesRepresentative || '').trim();
    const configured = uniqueNonEmpty(state.references.salesRepresentatives || []);
    if (direct) {
        const matched = matchConfiguredOption(direct, configured);
        if (matched) return matched;
        if (!configured.length) return direct;
    }
    if (configured.length) return configured[0];
    return String(order?.adminName || state.currentUserName || '').trim();
}

function resolveOrderPaymentMethod(order) {
    const direct = String(order?.paymentMethod || '').trim();
    const configured = uniqueNonEmpty(state.references.paymentMethods || []);
    if (direct) {
        const match = matchConfiguredOption(direct, configured);
        if (match) return match;
        if (!configured.length) return direct;
    }
    return configured[0] || direct || 'Cash';
}

function matchConfiguredOption(value, options) {
    const input = String(value || '').trim();
    if (!input) return '';
    const normalizedOptions = uniqueNonEmpty(options);
    const directMatch = normalizedOptions.find((entry) => normalizeOptionToken(entry) === normalizeOptionToken(input));
    return directMatch || '';
}

function buildPaymentMethodBreakdownForSales(paymentMethod, orderTotal) {
    const method = String(paymentMethod || '').trim();
    if (!method) return [];
    if (normalizeOptionToken(method) === 'lbc collection') {
        return [{ method, amount: 0 }];
    }
    return [{ method, amount: Math.max(0, Number(orderTotal || 0)) }];
}

function renderAll() {
    renderPanelSwitcher();
    renderChatRoomControls();
    renderWorkflowBranchControls();
    renderChatMessages();
    renderQueue();
    renderInvoiceFeed();
    renderCounters();
}

function renderPanelSwitcher() {
    if (elements.panelSwitcher) {
        Array.from(elements.panelSwitcher.querySelectorAll('button[data-panel]')).forEach((button) => {
            const isActive = normalizePanelKey(button.dataset.panel) === state.activePanel;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }
    elements.panelSections.forEach((section) => {
        section.hidden = normalizePanelKey(section.dataset.panelView) !== state.activePanel;
    });
}

function renderChatRoomControls() {
    if (elements.chatTabs) {
        Array.from(elements.chatTabs.querySelectorAll('button[data-branch]')).forEach((button) => {
            const isActive = button.dataset.branch === state.activeBranch;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }
    if (elements.chatRoomTabs) {
        Array.from(elements.chatRoomTabs.querySelectorAll('button[data-room]')).forEach((button) => {
            const isActive = button.dataset.room === state.activeRoom;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }
    if (elements.chatRoomHint) {
        elements.chatRoomHint.textContent = CHAT_ROOM_META[state.activeRoom]?.hint || '';
    }
}

function renderWorkflowBranchControls() {
    if (!elements.workflowBranchTabs) return;
    Array.from(elements.workflowBranchTabs.querySelectorAll('button[data-workflow-branch]')).forEach((button) => {
        const isActive = button.dataset.workflowBranch === state.workflowBranch;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
}

function renderChatMessages() {
    const messages = state.chats[state.activeBranch]?.[state.activeRoom] || [];
    if (!messages.length) {
        elements.chatMessages.innerHTML = '<div class="empty-state">No chat messages yet.</div>';
        return;
    }

    elements.chatMessages.innerHTML = messages.map((message) => {
        const rowClass = message.system ? 'system' : (isOwnMessage(message) ? 'outgoing' : 'incoming');
        const bubbleClasses = ['chat-item'];
        if (message.system) bubbleClasses.push('system');
        if (message.kind === 'invoice') bubbleClasses.push('invoice');

        return `
            <article class="chat-row ${rowClass}">
              <div class="${bubbleClasses.join(' ')}">
                <div class="chat-meta">
                  <strong>${escapeHtml(message.sender)}</strong>
                  <span>${formatDateTime(message.createdAt)}</span>
                </div>
                <div class="chat-text ${message.deletedAt ? 'deleted-text' : ''}">${formatMessageWithMentions(resolveMessageText(message))}</div>
                ${renderChatProviderTag(message)}
                ${renderChatInvoiceMeta(message)}
                ${renderChatAttachment(message.attachment)}
                ${renderChatMessageActions(message)}
                ${renderChatTrace(message)}
              </div>
            </article>
        `;
    }).join('');

    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function renderChatProviderTag(message) {
    return message.provider ? `<div class="chat-provider-tag">${escapeHtml(message.provider)}</div>` : '';
}

function renderChatInvoiceMeta(message) {
    if (message.kind !== 'invoice' || !message.invoice) return '';
    return `
        <div class="chat-invoice-meta">
          Invoice: <strong>${escapeHtml(message.invoice.invoiceNumber)}</strong><br>
          Client: ${escapeHtml(message.invoice.clientName)}<br>
          Branch: ${escapeHtml(message.invoice.branch)}<br>
          Type: ${escapeHtml(message.invoice.fulfillmentType)} (${escapeHtml(message.invoice.fulfillmentOption)})<br>
          Amount: ${formatCurrency(message.invoice.totalAmount)}
        </div>
    `;
}

function renderChatAttachment(attachment) {
    if (!attachment?.name) return '';
    const source = resolveAttachmentSource(attachment);
    const isImage = String(attachment.type || '').startsWith('image/') && source;
    return `
        <div class="chat-attachment">
          <i class="fa-solid fa-paperclip"></i> ${escapeHtml(attachment.name)}
          ${isImage ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(attachment.name)}">` : ''}
          ${source ? `<div><a class="inline-link" href="${escapeHtml(source)}" target="_blank" rel="noopener">Open attachment</a></div>` : ''}
        </div>
    `;
}

function renderChatMessageActions(message) {
    if (!canHeadAdminManageMessage(message)) return '';
    return `
        <div class="chat-actions-row">
          <button type="button" class="message-action-btn edit" data-chat-action="edit" data-message-id="${escapeHtml(message.id)}">Edit</button>
          <button type="button" class="message-action-btn delete" data-chat-action="delete" data-message-id="${escapeHtml(message.id)}">Delete</button>
        </div>
    `;
}

function renderChatTrace(message) {
    const traces = [];
    if (message.editedAt) traces.push(`Edited by Head Admin (${formatDateTime(message.editedAt)})`);
    if (message.deletedAt) traces.push(`Deleted by Head Admin (${formatDateTime(message.deletedAt)})`);
    if (!traces.length) return '';
    return `<div class="chat-trace">${escapeHtml(traces.join(' | '))}</div>`;
}

function resolveMessageText(message) {
    return message.deletedAt ? '[Message deleted by Head Admin]' : (message.text || '');
}

function handleChatMessageActionClick(event) {
    const button = event.target.closest('button[data-chat-action][data-message-id]');
    if (!button) return;
    const message = findChatMessageById(button.dataset.messageId);
    if (!message) return;
    if (!canHeadAdminManageMessage(message)) {
        setFeedback(elements.chatFeedback, 'Only Head Admin can edit or delete active chat messages.', true);
        return;
    }

    if (button.dataset.chatAction === 'edit') {
        const nextText = window.prompt('Edit message:', resolveMessageText(message));
        if (nextText === null) return;
        const trimmed = String(nextText).trim();
        if (!trimmed) return setFeedback(elements.chatFeedback, 'Edited message cannot be empty.', true);
        if (!message.originalText) message.originalText = message.text || '';
        message.text = trimmed;
        message.editedAt = new Date().toISOString();
        message.editedBy = 'head_admin';
        persistState();
        setFeedback(elements.chatFeedback, 'Message updated by Head Admin.');
        return renderChatMessages();
    }

    if (button.dataset.chatAction === 'delete') {
        if (!window.confirm('Delete this message? This action keeps an audit trace.')) return;
        message.deletedAt = new Date().toISOString();
        message.deletedBy = 'head_admin';
        message.attachment = null;
        persistState();
        setFeedback(elements.chatFeedback, 'Message deleted by Head Admin (trace retained).');
        renderChatMessages();
    }
}

function renderQueue() {
    const queueOrders = state.orders.filter((order) => order.adminStatus === 'pending' || order.adminStatus === 'correction');
    if (elements.queueCount) elements.queueCount.textContent = `${queueOrders.length} Pending`;
    if (!queueOrders.length) {
        elements.confirmationQueue.innerHTML = '<div class="empty-state">No pending orders in confirmation queue.</div>';
        return;
    }

    elements.confirmationQueue.innerHTML = queueOrders.map((order) => `
            <article class="queue-item">
              <div class="queue-meta">
                <strong>${escapeHtml(order.invoiceNumber)}</strong>
                <span class="pill">${escapeHtml(order.branch)}</span>
              </div>
              <p class="queue-sub">
                <strong>${escapeHtml(order.clientName)}</strong><br>
                Order No: ${escapeHtml(order.orderNumber || '-')} | Date: ${escapeHtml(order.orderDate || '')}<br>
                Branch: ${escapeHtml(order.branch || '-')} | Cash Branch: ${escapeHtml(order.cashBranch || '-')}<br>
                Fulfillment: ${escapeHtml(order.fulfillmentType || '-')} (${escapeHtml(order.fulfillmentOption || '-')}) | Courier: ${escapeHtml(order.courier || '-')}<br>
                Items: ${Number(Array.isArray(order.items) ? order.items.length : 0)} | Payment: ${escapeHtml(order.paymentMethod)} (${escapeHtml(order.paymentType || '-')}) | Receipt: ${order.receipt ? 'Uploaded' : 'None'} | Delivery Fee: ${formatCurrency(order.deliveryFee)} | Handling Fee: ${formatCurrency(order.handlingFee)} | Total: ${formatCurrency(order.totalAmount)}<br>
                Sales Sync: ${escapeHtml(resolveSalesSyncLabel(order))}
              </p>
              <div class="queue-actions">
                <button type="button" class="action-btn confirm" data-queue-action="confirm" data-order-id="${escapeHtml(order.id)}" ${isOrderSyncing(order) ? 'disabled' : ''}>${isOrderSyncing(order) ? 'Confirming...' : 'Confirm Order'}</button>
                <button type="button" class="action-btn reject" data-queue-action="reject" data-order-id="${escapeHtml(order.id)}">Reject Order</button>
                <button type="button" class="action-btn" data-queue-action="correction" data-order-id="${escapeHtml(order.id)}">Request Correction</button>
                ${canDeleteTransactions() ? `<button type="button" class="action-btn reject" data-queue-action="delete" data-order-id="${escapeHtml(order.id)}">Delete Transaction</button>` : ''}
              </div>
            </article>
        `).join('');
}

function renderInvoiceFeed() {
    const selectedWorkflowBranch = state.workflowBranch === 'pampanga' ? 'pampanga' : 'cubao';
    const selectedWorkflowBranchLabel = selectedWorkflowBranch === 'pampanga' ? 'Pampanga' : 'Cubao';
    const branchOrders = state.orders.filter((order) => {
        const normalized = String(order?.branch || '').trim().toLowerCase();
        if (normalized.includes('pampanga')) return selectedWorkflowBranch === 'pampanga';
        if (normalized.includes('cubao')) return selectedWorkflowBranch === 'cubao';
        return true;
    });
    const bookingOrders = branchOrders.filter((order) => resolveWorkflowLane(order) === 'booking');
    const shipmentOrders = branchOrders.filter((order) => resolveWorkflowLane(order) === 'shipment');
    if (elements.bookingWorkflowFeed) {
        elements.bookingWorkflowFeed.innerHTML = bookingOrders.length
            ? bookingOrders.map((order) => renderInvoiceCard(order)).join('')
            : `<div class="empty-state">No booking cards yet for ${selectedWorkflowBranchLabel}. Confirm a booking order to continue.</div>`;
    }
    if (elements.shipmentWorkflowFeed) {
        elements.shipmentWorkflowFeed.innerHTML = shipmentOrders.length
            ? shipmentOrders.map((order) => renderInvoiceCard(order)).join('')
            : `<div class="empty-state">No shipment cards yet for ${selectedWorkflowBranchLabel}. Confirm a shipment order to continue.</div>`;
    }
}

function renderInvoiceCard(order) {
    return `
            <article class="invoice-card ${resolveStatusClass(order)}">
              <div class="invoice-top">
                <div><strong>${escapeHtml(order.invoiceNumber)}</strong><p class="sub">${escapeHtml(order.clientName)} | ${escapeHtml(order.branch)}</p></div>
                <span class="status-badge">${escapeHtml(resolveStatusLabel(order))}</span>
              </div>
              <div class="invoice-grid">
                <div class="data-point"><span>Order No.</span><strong>${escapeHtml(order.orderNumber || '-')}</strong></div>
                <div class="data-point"><span>Date</span><strong>${escapeHtml(order.orderDate || '-')}</strong></div>
                <div class="data-point"><span>Cash Branch</span><strong>${escapeHtml(order.cashBranch || '-')}</strong></div>
                <div class="data-point"><span>Courier</span><strong>${escapeHtml(order.courier || '-')}</strong></div>
                <div class="data-point"><span>Fulfillment</span><strong>${escapeHtml(order.fulfillmentType || 'Booking')} (${escapeHtml(order.fulfillmentOption || '-')})</strong></div>
                <div class="data-point"><span>Tracking Status</span><strong>${escapeHtml(order.trackingStatus || 'Pending')}</strong></div>
                <div class="data-point"><span>Payment Method</span><strong>${escapeHtml(order.paymentMethod || '-')}</strong></div>
                <div class="data-point"><span>Payment Type</span><strong>${escapeHtml(order.paymentType || '-')}</strong></div>
                <div class="data-point"><span>Delivery Fee</span><strong>${formatCurrency(order.deliveryFee)}</strong></div>
                <div class="data-point"><span>Handling Fee</span><strong>${formatCurrency(order.handlingFee)}</strong></div>
                <div class="data-point"><span>Total Amount</span><strong>${formatCurrency(order.totalAmount)}</strong></div>
                <div class="data-point"><span>Item Count</span><strong>${Number(Array.isArray(order.items) ? order.items.length : 0)}</strong></div>
                <div class="data-point"><span>Contact Number</span><strong>${escapeHtml(order.contactNumber)}</strong></div>
                <div class="data-point"><span>Admin</span><strong>${escapeHtml(order.adminName || '-')}</strong></div>
                <div class="data-point"><span>Sales Rep</span><strong>${escapeHtml(order.salesRepresentative || '-')}</strong></div>
                <div class="data-point"><span>Sales Sync</span><strong>${escapeHtml(resolveSalesSyncLabel(order))}</strong></div>
                <div class="data-point"><span>Assigned Staff</span><strong>${escapeHtml(order.assignedStaff || '-')}</strong></div>
              </div>
              <div class="receipt-preview"><div class="block-title">Payment Receipt</div>${renderAttachmentPreview(order.receipt, 'No payment receipt uploaded.')}</div>
              ${renderInvoiceEditPanel(order)}
              ${renderHeadAdminControls(order)}
              ${renderFulfillmentPanel(order)}
              ${renderFulfillmentSummary(order)}
              ${renderTransactionDeleteAction(order)}
            </article>
        `;
}

function renderAttachmentPreview(attachment, emptyMessage) {
    if (!attachment) return escapeHtml(emptyMessage);
    const source = resolveAttachmentSource(attachment);
    const isImage = String(attachment.type || '').startsWith('image/') && source;
    if (!source) return `<span><i class="fa-regular fa-file-lines"></i> ${escapeHtml(attachment.name)}</span>`;
    return `<span>${escapeHtml(attachment.name)}</span>${isImage ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(attachment.name)}">` : ''}<div><a class="inline-link" href="${escapeHtml(source)}" target="_blank" rel="noopener">Open attachment</a></div>`;
}

function renderInvoiceEditPanel(order) {
    const paymentMethodOptions = buildSelectOptionMarkup(state.references.paymentMethods || [], order.paymentMethod || '', 'Select payment method');
    return `
        <form class="booking-panel" data-role="invoice-edit-form" data-order-id="${escapeHtml(order.id)}">
          <div class="block-title">Edit Invoice</div>
          <div class="fulfillment-grid">
            <label class="field"><span>Client Name</span><input name="clientName" value="${escapeHtml(order.clientName || '')}" required></label>
            <label class="field"><span>Contact Number</span><input name="contactNumber" value="${escapeHtml(order.contactNumber || '')}"></label>
            <label class="field field-span-2"><span>Address</span><textarea name="deliveryAddress" rows="2">${escapeHtml(order.deliveryAddress || '')}</textarea></label>
            <label class="field"><span>Payment Method</span><select name="paymentMethod">${paymentMethodOptions}</select></label>
            <label class="field"><span>Courier</span><input name="courier" value="${escapeHtml(order.courier || '')}"></label>
            <label class="field"><span>Delivery Fee</span><input name="deliveryFee" type="number" min="0" step="0.01" value="${sanitizeMoneyInput(order.deliveryFee)}"></label>
            <label class="field"><span>Handling Fee</span><input name="handlingFee" type="number" min="0" step="0.01" value="${sanitizeMoneyInput(order.handlingFee)}"></label>
            <button type="submit" class="primary-btn">Save Invoice Changes</button>
          </div>
        </form>
    `;
}

function renderHeadAdminControls(order) {
    if (order.adminStatus !== 'pending' && order.adminStatus !== 'correction') {
        return order.adminStatus === 'rejected'
            ? '<section class="prep-actions"><div class="block-title">Head Admin Decision</div><p class="queue-sub">Order was rejected. Employee must resubmit with corrected data.</p></section>'
            : '';
    }
    const confirming = isOrderSyncing(order);
    return `
        <section class="prep-actions">
          <div class="block-title">Head Admin Controls</div>
          <div class="queue-actions">
            <button type="button" class="action-btn confirm" data-feed-action="confirm" data-order-id="${escapeHtml(order.id)}" ${confirming ? 'disabled' : ''}>${confirming ? 'Confirming...' : 'Confirm Order'}</button>
            <button type="button" class="action-btn reject" data-feed-action="reject" data-order-id="${escapeHtml(order.id)}">Reject Order</button>
            <button type="button" class="action-btn" data-feed-action="correction" data-order-id="${escapeHtml(order.id)}">Request Correction</button>
          </div>
        </section>
    `;
}

function renderTransactionDeleteAction(order) {
    if (!canDeleteTransactions()) return '';
    return `
        <section class="prep-actions">
          <div class="block-title">Transaction Controls</div>
          <div class="queue-actions">
            <button type="button" class="action-btn reject" data-feed-action="delete" data-order-id="${escapeHtml(order.id)}">Delete Transaction</button>
          </div>
        </section>
    `;
}

function deleteOrderTransaction(orderId, source = '') {
    if (!canDeleteTransactions()) {
        setFeedback(elements.orderFeedback, 'Only Head Admin can delete transactions.', true);
        return;
    }
    const order = findOrder(orderId);
    if (!order) {
        setFeedback(elements.orderFeedback, 'Transaction not found or already removed.', true);
        return;
    }

    const label = String(order.invoiceNumber || order.orderNumber || 'this transaction');
    const confirmed = window.confirm(`Delete ${label}? This will remove it from queue, workflow, and related chat logs.`);
    if (!confirmed) return;

    const beforeCount = state.orders.length;
    state.orders = state.orders.filter((entry) => entry.id !== order.id);
    const removedChats = removeOrderFromChats(order);
    if (beforeCount === state.orders.length) {
        setFeedback(elements.orderFeedback, 'Transaction was not deleted.', true);
        return;
    }

    persistState();
    renderAll();
    setFeedback(elements.orderFeedback, `${label} deleted from communication panel (${removedChats} related chat entr${removedChats === 1 ? 'y' : 'ies'} removed).`);
    if (source === 'queue') {
        clearFeedback(elements.chatFeedback);
    }
}

function removeOrderFromChats(order) {
    let removed = 0;
    const targetOrderId = String(order?.id || '');
    const targetInvoice = String(order?.invoiceNumber || '').trim();
    if (!targetOrderId && !targetInvoice) return removed;

    ['cubao', 'pampanga'].forEach((branch) => {
        ['delivery', 'shipment'].forEach((room) => {
            const messages = Array.isArray(state.chats?.[branch]?.[room]) ? state.chats[branch][room] : [];
            const kept = messages.filter((message) => {
                if (!message || typeof message !== 'object') return true;
                const messageOrderId = String(message.orderId || '').trim();
                const messageInvoice = String(message?.invoice?.invoiceNumber || '').trim();
                const text = String(message.text || '');
                const byOrderId = Boolean(targetOrderId && messageOrderId && messageOrderId === targetOrderId);
                const byInvoiceObject = Boolean(targetInvoice && messageInvoice && messageInvoice === targetInvoice);
                const bySystemText = Boolean(targetInvoice && message.system && text.includes(targetInvoice));
                const shouldRemove = byOrderId || byInvoiceObject || bySystemText;
                if (shouldRemove) removed += 1;
                return !shouldRemove;
            });
            state.chats[branch][room] = kept;
        });
    });
    return removed;
}

function renderFulfillmentPanel(order) {
    if (order.adminStatus !== 'confirmed') return '';
    return resolveWorkflowLane(order) === 'shipment'
        ? renderShipmentPanel(order)
        : renderBookingPanel(order);
}

function renderBookingPanel(order) {
    const booking = order.booking || {};
    const activeMethod = booking.method || order.fulfillmentOption || order.courier || '';
    const meetUpMode = isMeetUpMethod(activeMethod);
    const riderNameValue = booking.riderName || '';
    const riderContactValue = booking.riderContact || '';
    const receiverValue = booking.receiver || '';
    const trackingLinkValue = booking.trackingLink || '';
    return `
        <form class="booking-panel" data-role="booking-form" data-order-id="${escapeHtml(order.id)}">
          <div class="block-title">Booking Panel</div>
          <div class="fulfillment-grid">
            <label class="field"><span>Booking Method</span><select name="bookingMethod" required><option value="">Select method</option>${BOOKING_OPTION_LIST.map((method) => `<option value="${escapeHtml(method)}" ${method === activeMethod ? 'selected' : ''}>${escapeHtml(method)}</option>`).join('')}</select></label>
            <label class="field" data-booking-detail="rider-name" ${meetUpMode ? 'hidden' : ''}><span>Rider Name</span><input name="riderName" value="${escapeHtml(riderNameValue)}" ${meetUpMode ? '' : 'required'}></label>
            <label class="field" data-booking-detail="rider-contact" ${meetUpMode ? 'hidden' : ''}><span>Contact Number</span><input name="riderContact" value="${escapeHtml(riderContactValue)}" ${meetUpMode ? '' : 'required'}></label>
            <label class="field"><span>Delivery Fee</span><input name="deliveryFee" type="number" min="0" step="0.01" value="${Number.isFinite(Number(booking.deliveryFee)) ? Number(booking.deliveryFee) : Number(order.deliveryFee || 0)}"></label>
            <label class="field"><span>Handling Fee</span><input name="handlingFee" type="number" min="0" step="0.01" value="${Number.isFinite(Number(booking.handlingFee)) ? Number(booking.handlingFee) : Number(order.handlingFee || 0)}"></label>
            <label class="field" data-booking-detail="receiver" ${meetUpMode ? 'hidden' : ''}><span>Receiver</span><input name="receiver" value="${escapeHtml(receiverValue)}" ${meetUpMode ? '' : 'required'}></label>
            <label class="field field-span-2" data-booking-detail="tracking-link" ${meetUpMode ? 'hidden' : ''}><span>Tracking Link</span><input name="trackingLink" type="url" value="${escapeHtml(trackingLinkValue)}" placeholder="https://" ${meetUpMode ? '' : 'required'}></label>
            ${meetUpMode ? '<p class="queue-sub field-span-2">Meet-Up selected: rider details are optional.</p>' : ''}
            <button type="submit" class="primary-btn">Save Booking Details</button>
          </div>
        </form>
    `;
}

function renderShipmentPanel(order) {
    const shipment = order.shipment || {};
    const activeCourier = shipment.courier || order.courier || order.fulfillmentOption || '';
    const shipmentCouriers = getShipmentCourierOptions();
    return `
        <form class="booking-panel" data-role="shipment-booking-form" data-order-id="${escapeHtml(order.id)}">
          <div class="block-title">Shipment Panel</div>
          <div class="fulfillment-grid">
            <label class="field"><span>Courier</span><select name="shipmentCourier" required><option value="">Select courier</option>${shipmentCouriers.map((courier) => `<option value="${escapeHtml(courier)}" ${courier === activeCourier ? 'selected' : ''}>${escapeHtml(courier)}</option>`).join('')}</select></label>
            <label class="field"><span>Receiver</span><input name="shipmentReceiver" value="${escapeHtml(shipment.receiver || '')}" required></label>
            <label class="field field-span-2"><span>Tracking Link</span><input name="shipmentTrackingLink" type="url" value="${escapeHtml(shipment.trackingLink || '')}" placeholder="https://" required></label>
            <label class="field field-span-2"><span>Receipt Picture</span><input type="file" name="shipmentReceipt" accept="image/*,.pdf" data-role="shipment-receipt" data-order-id="${escapeHtml(order.id)}"><small data-role="shipment-receipt-name">${escapeHtml(shipment.receipt?.name || 'No receipt selected')}</small></label>
            <button type="submit" class="primary-btn">Save Shipment Details</button>
          </div>
        </form>
    `;
}

function renderFulfillmentSummary(order) {
    if (order.booking) {
        const bookingMethod = order.booking.method || order.fulfillmentOption || '-';
        const meetUpMode = isMeetUpMethod(bookingMethod);
        const trackingLink = String(order.booking.trackingLink || '').trim();
        return `
            <section class="booking-summary">
              <div class="block-title">Booking Details</div>
              <p class="queue-sub"><span class="fulfillment-tag">Booking</span><br>Method: <strong>${escapeHtml(bookingMethod)}</strong>${meetUpMode ? '<br>Rider details: <strong>Not required for Meet-Up</strong>' : `<br>Rider: <strong>${escapeHtml(order.booking.riderName)}</strong><br>Contact: ${escapeHtml(order.booking.riderContact)}<br>Receiver: ${escapeHtml(order.booking.receiver)}${trackingLink ? `<br>Tracking: <a class="inline-link" href="${escapeHtml(trackingLink)}" target="_blank" rel="noopener">${escapeHtml(trackingLink)}</a>` : ''}`}</p>
              <p class="queue-sub">Delivery Fee: ${formatCurrency(order.booking.deliveryFee)} | Handling Fee: ${formatCurrency(order.booking.handlingFee)}</p>
            </section>
        `;
    }
    if (order.shipment) {
        const source = resolveAttachmentSource(order.shipment.receipt);
        return `
            <section class="booking-summary">
              <div class="block-title">Shipment Details</div>
              <p class="queue-sub"><span class="fulfillment-tag">Shipment</span><br>Courier: <strong>${escapeHtml(order.shipment.courier)}</strong><br>Receiver: ${escapeHtml(order.shipment.receiver)}<br>Tracking: <a class="inline-link" href="${escapeHtml(order.shipment.trackingLink)}" target="_blank" rel="noopener">${escapeHtml(order.shipment.trackingLink)}</a><br>Status: <strong>${escapeHtml(order.trackingStatus || '')}</strong></p>
              ${order.shipment.receipt?.name ? `<p class="queue-sub">Receipt: ${escapeHtml(order.shipment.receipt.name)}</p>` : ''}
              ${source && String(order.shipment.receipt?.type || '').startsWith('image/') ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(order.shipment.receipt.name || 'Shipment receipt')}">` : ''}
            </section>
        `;
    }
    return '';
}

function renderCounters() {
    const pending = state.orders.filter((order) => order.adminStatus === 'pending' || order.adminStatus === 'correction').length;
    const ready = state.orders.filter((order) => order.adminStatus === 'confirmed' && (order.booking || order.shipment)).length;
    const total = state.orders.length;
    if (elements.pendingCount) elements.pendingCount.textContent = String(pending);
    if (elements.readyCount) elements.readyCount.textContent = String(ready);
    if (elements.invoiceCount) elements.invoiceCount.textContent = String(total);
}

function resolveStatusClass(order) {
    if (order.adminStatus === 'rejected') return '';
    return STATUS_META[order.status]?.className || STATUS_META.submitted.className;
}

function resolveStatusLabel(order) {
    if (order.adminStatus === 'pending') return 'Awaiting Head Admin Confirmation';
    if (order.adminStatus === 'correction') return 'Correction Requested';
    if (order.adminStatus === 'rejected') return 'Rejected';
    if (order.status === 'in_transit' && String(order.shipment?.courier || '').toUpperCase() === 'LBC') return 'In Transit (LBC)';
    return STATUS_META[order.status]?.label || 'In Progress';
}

function normalizeSalesSyncStatus(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'synced') return 'synced';
    if (normalized === 'failed') return 'failed';
    if (normalized === 'syncing') return 'syncing';
    return 'not_synced';
}

function resolveSalesSyncLabel(order) {
    const status = normalizeSalesSyncStatus(order?.salesSyncStatus);
    if (status === 'synced') {
        const orderNumber = String(order?.salesOrderNumber || '').trim();
        return orderNumber ? `Synced (${orderNumber})` : 'Synced';
    }
    if (status === 'failed') {
        const error = String(order?.salesSyncError || '').trim();
        return error ? `Failed: ${error}` : 'Failed';
    }
    if (status === 'syncing') return 'Syncing...';
    return 'Not Synced';
}

function findOrder(orderId) {
    return state.orders.find((order) => order.id === orderId) || null;
}

function findChatMessageById(messageId) {
    for (const rooms of Object.values(state.chats)) {
        for (const messages of Object.values(rooms)) {
            const found = messages.find((message) => message.id === messageId);
            if (found) return found;
        }
    }
    return null;
}

function canHeadAdminManageMessage(message) {
    if (!message || state.currentRole !== 'head_admin') return false;
    if (message.system || message.deletedAt) return false;
    return true;
}

function canDeleteTransactions() {
    return String(state.currentRole || '').trim().toLowerCase() === 'head_admin';
}

function isOwnMessage(message) {
    if (!message || message.system) return false;
    const senderRole = String(message.senderRole || '').trim().toLowerCase();
    if (senderRole && senderRole === state.currentRole) return true;

    const normalizedSender = String(message.sender || '').trim().toLowerCase();
    const normalizedCurrent = String(state.currentUserName || '').trim().toLowerCase();
    if (normalizedSender && normalizedCurrent && normalizedSender === normalizedCurrent) return true;
    if (state.currentRole === 'head_admin' && ['head admin', 'head_admin', 'admin'].includes(normalizedSender)) return true;
    return false;
}

function createEmptyChatRooms() {
    return { delivery: [], shipment: [] };
}

function hasAnyMessages() {
    return Object.values(state.chats || {}).some((rooms) => (
        Object.values(rooms || {}).some((messages) => Array.isArray(messages) && messages.length)
    ));
}

function seedInitialChats() {
    const now = new Date().toISOString();
    pushSeedMessage('cubao', 'delivery', 'Cubao Booking room is active. Coordinate Lalamove, Meet-Up, Client book, TOKTOK, and MAXIM requests here.', now);
    pushSeedMessage('cubao', 'shipment', 'Cubao Shipment room is active. Coordinate LBC, J&T, SPX, Victory Liner, and AP Cargo updates here.', now);
    pushSeedMessage('pampanga', 'delivery', 'Pampanga Booking room is active. Coordinate Lalamove, Meet-Up, Client book, TOKTOK, and MAXIM requests here.', now);
    pushSeedMessage('pampanga', 'shipment', 'Pampanga Shipment room is active. Coordinate LBC, J&T, SPX, Victory Liner, and AP Cargo updates here.', now);
}

function pushSeedMessage(branch, room, text, createdAt) {
    state.chats[branch][room].push({
        id: createLocalId(),
        sender: 'System',
        text,
        branch,
        room,
        provider: '',
        senderRole: 'system',
        kind: 'message',
        createdAt,
        system: true,
        attachment: null
    });
}

function resolveBranchKey(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized.includes('pampanga')) return 'pampanga';
    if (normalized.includes('cubao')) return 'cubao';
    return state.activeBranch;
}

function resolveRoomKey(value) {
    const normalized = normalizeOptionToken(value);
    if (normalized === 'shipment' || SHIPMENT_OPTIONS.has(normalized)) return 'shipment';
    if (normalized === 'delivery' || normalized === 'booking' || DELIVERY_OPTIONS.has(normalized)) return 'delivery';
    return 'delivery';
}

function normalizeFulfillmentType(value) {
    const normalized = normalizeOptionToken(value);
    if (normalized === 'shipment' || SHIPMENT_OPTIONS.has(normalized)) return 'Shipment';
    if (normalized === 'booking' || normalized === 'delivery' || DELIVERY_OPTIONS.has(normalized)) return 'Booking';
    return '';
}

function resolveWorkflowLane(order) {
    const normalizedType = normalizeFulfillmentType(order?.fulfillmentType || '');
    if (normalizedType === 'Shipment') return 'shipment';
    if (normalizedType === 'Booking') return 'booking';
    const fallback = String(order?.fulfillmentOption || order?.courier || '').trim();
    return isShipmentOption(fallback) ? 'shipment' : 'booking';
}

function normalizeOptionToken(value) {
    return String(value || '').trim().toLowerCase();
}

function isShipmentOption(value) {
    return SHIPMENT_OPTIONS.has(normalizeOptionToken(value));
}

function isBookingOption(value) {
    return DELIVERY_OPTIONS.has(normalizeOptionToken(value));
}

function getShipmentCourierOptions() {
    const configured = uniqueNonEmpty(state.references.couriers || []).filter((courier) => isShipmentOption(courier));
    return configured.length ? configured : [...SHIPMENT_OPTION_LIST];
}

function isClientBookMethod(value) {
    const normalized = normalizeOptionToken(value);
    return normalized === 'client book' || normalized === 'own booking';
}

function postInvoiceToChat(order) {
    const branchKey = resolveBranchKey(order.branch);
    const roomKey = resolveRoomKey(order.fulfillmentType);
    state.chats[branchKey][roomKey].push({
        id: createLocalId(),
        orderId: order.id,
        sender: 'Invoice Bot',
        text: `${order.invoiceNumber} submitted for ${order.clientName}.`,
        branch: branchKey,
        room: roomKey,
        provider: order.fulfillmentOption,
        senderRole: 'system',
        kind: 'invoice',
        createdAt: new Date().toISOString(),
        system: true,
        attachment: order.receipt ? { ...order.receipt } : null,
        invoice: {
            invoiceNumber: order.invoiceNumber,
            clientName: order.clientName,
            branch: order.branch,
            fulfillmentType: order.fulfillmentType,
            fulfillmentOption: order.fulfillmentOption,
            totalAmount: order.totalAmount
        }
    });
}

function postOrderActionToChat(order, text, attachment = null) {
    const branchKey = resolveBranchKey(order.branch);
    const roomKey = resolveRoomKey(order.fulfillmentType);
    state.chats[branchKey][roomKey].push({
        id: createLocalId(),
        orderId: order.id,
        sender: 'System',
        text,
        branch: branchKey,
        room: roomKey,
        provider: order.fulfillmentOption,
        senderRole: 'system',
        kind: 'message',
        createdAt: new Date().toISOString(),
        system: true,
        attachment: attachment ? { ...attachment } : null
    });
}

function handleChatInputChange() {
    refreshMentionSuggestions();
}

function handleChatInputKeyDown(event) {
    if (elements.mentionSuggestions?.hidden) return;
    if (!state.mentionMatches.length) return;

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        state.mentionActiveIndex = (state.mentionActiveIndex + 1) % state.mentionMatches.length;
        renderMentionSuggestions();
        return;
    }

    if (event.key === 'ArrowUp') {
        event.preventDefault();
        state.mentionActiveIndex = (state.mentionActiveIndex - 1 + state.mentionMatches.length) % state.mentionMatches.length;
        renderMentionSuggestions();
        return;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        applyMentionFromIndex(state.mentionActiveIndex);
        return;
    }

    if (event.key === 'Escape') {
        hideMentionSuggestions();
    }
}

function handleChatInputBlur() {
    window.setTimeout(() => hideMentionSuggestions(), 120);
}

function handleMentionSuggestionClick(event) {
    const option = event.target.closest('button[data-mention-index]');
    if (!option) return;
    event.preventDefault();
    const index = Number(option.dataset.mentionIndex || 0);
    applyMentionFromIndex(index);
}

function refreshMentionSuggestions() {
    const context = resolveMentionContext();
    if (!context) {
        hideMentionSuggestions();
        return;
    }

    const query = context.query;
    const matches = state.mentionables
        .filter((entry) => !query || entry.handle.toLowerCase().includes(query) || entry.label.toLowerCase().includes(query))
        .sort((a, b) => {
            const aStarts = a.handle.toLowerCase().startsWith(query) || a.label.toLowerCase().startsWith(query);
            const bStarts = b.handle.toLowerCase().startsWith(query) || b.label.toLowerCase().startsWith(query);
            if (aStarts !== bStarts) return aStarts ? -1 : 1;
            return a.label.localeCompare(b.label);
        })
        .slice(0, 12);

    if (!matches.length) {
        hideMentionSuggestions();
        return;
    }

    state.mentionContext = context;
    state.mentionMatches = matches;
    state.mentionActiveIndex = Math.min(state.mentionActiveIndex, matches.length - 1);
    renderMentionSuggestions();
}

function renderMentionSuggestions() {
    if (!elements.mentionSuggestions) return;
    if (!state.mentionMatches.length) {
        hideMentionSuggestions();
        return;
    }

    elements.mentionSuggestions.innerHTML = state.mentionMatches.map((entry, index) => `
        <button
          type="button"
          class="mention-option ${index === state.mentionActiveIndex ? 'active' : ''}"
          data-mention-index="${index}"
        >
          <strong>@${escapeHtml(entry.handle)}</strong>
          <span>${escapeHtml(entry.label)}</span>
        </button>
    `).join('');
    elements.mentionSuggestions.hidden = false;
}

function hideMentionSuggestions() {
    if (!elements.mentionSuggestions) return;
    elements.mentionSuggestions.hidden = true;
    elements.mentionSuggestions.innerHTML = '';
    state.mentionContext = null;
    state.mentionMatches = [];
    state.mentionActiveIndex = 0;
}

function resolveMentionContext() {
    const textarea = elements.chatInput;
    if (!textarea) return null;
    const text = String(textarea.value || '');
    const caret = Number(textarea.selectionStart || 0);
    const beforeCaret = text.slice(0, caret);
    const match = beforeCaret.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/);
    if (!match) return null;

    const query = String(match[1] || '').toLowerCase();
    const tokenStart = caret - query.length - 1;
    if (tokenStart < 0) return null;
    return { tokenStart, caret, query };
}

function applyMentionFromIndex(index) {
    const entry = state.mentionMatches[index];
    if (!entry || !state.mentionContext || !elements.chatInput) return;
    const textarea = elements.chatInput;
    const text = String(textarea.value || '');
    const before = text.slice(0, state.mentionContext.tokenStart);
    const after = text.slice(state.mentionContext.caret);
    const inserted = `@${entry.handle} `;
    textarea.value = `${before}${inserted}${after}`;
    const nextCaret = before.length + inserted.length;
    textarea.setSelectionRange(nextCaret, nextCaret);
    textarea.focus();
    hideMentionSuggestions();
}

async function buildFilePayload(file) {
    if (!file) return null;
    const payload = {
        name: file.name,
        type: file.type || '',
        size: Number(file.size || 0),
        dataUrl: '',
        previewUrl: ''
    };

    if (!payload.type.startsWith('image/') || payload.size > MAX_PERSISTED_IMAGE_BYTES) return payload;
    try {
        const dataUrl = await readFileAsDataUrl(file);
        payload.dataUrl = dataUrl;
        payload.previewUrl = dataUrl;
    } catch (error) {
        console.warn('Unable to read attachment:', error);
    }
    return payload;
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
        reader.readAsDataURL(file);
    });
}

function resolveAttachmentSource(attachment) {
    if (!attachment) return '';
    if (String(attachment.dataUrl || '').startsWith('data:')) return String(attachment.dataUrl);
    if (String(attachment.previewUrl || '').startsWith('data:')) return String(attachment.previewUrl);
    return '';
}

async function syncLbcTracking(order, shipment) {
    if (!appClient?.updateLbcTracking) return;
    const trackingNumber = extractTrackingNumber(shipment.trackingLink);
    if (!trackingNumber) return;
    const orderLookup = String(
        order?.salesOrderNumber || order?.orderNumber || order?.receiptNumber || order?.invoiceNumber || ''
    ).trim();
    if (!orderLookup) return;
    try {
        await appClient.updateLbcTracking(orderLookup, {
            trackingNumber
        });
    } catch (error) {
        console.warn('Unable to sync LBC tracking:', error);
    }
}

function extractTrackingNumber(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const url = new URL(raw);
        const fromQuery = String(url.searchParams.get('tracking') || url.searchParams.get('trackingNumber') || url.searchParams.get('waybill') || '').trim();
        if (fromQuery) return sanitizeTrackingToken(fromQuery);
        const segments = url.pathname.split('/').map((entry) => entry.trim()).filter(Boolean);
        if (segments.length) return sanitizeTrackingToken(segments[segments.length - 1]);
    } catch (_error) {
        return sanitizeTrackingToken(raw);
    }
    return sanitizeTrackingToken(raw);
}

function sanitizeTrackingToken(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);
}

function formatMessageWithMentions(text) {
    const safeText = escapeHtml(text || '');
    if (!safeText) return '<span class="queue-sub">Attachment only</span>';
    return safeText.replace(/(^|[\s(])(@[a-zA-Z0-9._-]+)/g, '$1<span class="mention">$2</span>');
}

function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateInputValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatCurrency(value) {
    const amount = Number(value || 0);
    return `PHP ${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function sanitizeMoneyInput(value) {
    const amount = Math.max(0, Number(value || 0));
    if (!Number.isFinite(amount)) return 0;
    return amount;
}

function isMeetUpMethod(value) {
    const normalized = normalizeOptionToken(value).replace(/\s+/g, ' ');
    return MEET_UP_TOKENS.has(normalized);
}

function calculateOrderItemsSubtotal(order) {
    return normalizeStoredOrderItems(order?.items).reduce((sum, item) => (
        sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0))
    ), 0);
}

function recalculateStoredOrderTotal(order) {
    if (!order || typeof order !== 'object') return 0;
    order.deliveryFee = Math.max(0, Number(order.deliveryFee || 0));
    order.handlingFee = Math.max(0, Number(order.handlingFee || 0));
    const itemsTotal = calculateOrderItemsSubtotal(order);
    const total = itemsTotal + order.deliveryFee + order.handlingFee;
    order.totalAmount = total;
    return total;
}

function updateBookingMeetUpFieldState(form, methodValue) {
    if (!form) return;
    const meetUpMode = isMeetUpMethod(methodValue);
    const details = Array.from(form.querySelectorAll('[data-booking-detail]'));
    details.forEach((label) => {
        label.hidden = meetUpMode;
        label.querySelectorAll('input').forEach((input) => {
            input.required = !meetUpMode;
            if (meetUpMode) input.removeAttribute('aria-invalid');
        });
    });
}

function buildSelectOptionMarkup(options = [], selectedValue = '', placeholder = 'Select option') {
    const current = String(selectedValue || '').trim();
    const normalized = uniqueNonEmpty(options);
    const optionMarkup = [`<option value="">${escapeHtml(placeholder)}</option>`];
    normalized.forEach((entry) => {
        optionMarkup.push(`<option value="${escapeHtml(entry)}" ${entry === current ? 'selected' : ''}>${escapeHtml(entry)}</option>`);
    });
    if (current && !normalized.some((entry) => entry.toLowerCase() === current.toLowerCase())) {
        optionMarkup.push(`<option value="${escapeHtml(current)}" selected>${escapeHtml(current)}</option>`);
    }
    return optionMarkup.join('');
}

function derivePaymentType(paymentMethod) {
    const normalized = normalizeOptionToken(paymentMethod);
    if (!normalized) return '';
    if (normalized === 'cash') return 'Cash Payment';
    if (normalized === 'lbc collection') return 'For Collection';
    return 'Online / Transfer';
}

function generateInvoiceNumber() {
    const now = new Date();
    const datePart = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('');
    const sequence = String(state.invoiceSequence).padStart(3, '0');
    state.invoiceSequence += 1;
    return `INV-${datePart}-${sequence}`;
}

function generateOrderNumber() {
    const now = new Date();
    const datePart = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('');
    const sequence = String(Math.max(1, state.invoiceSequence)).padStart(4, '0');
    return `ORD-${datePart}-${sequence}`;
}

function createLocalId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2, 9)}`;
}

function setFeedback(target, message, isError = false) {
    if (!target) return;
    target.textContent = message;
    target.classList.toggle('error', Boolean(isError));
}

function clearFeedback(target) {
    if (!target) return;
    target.textContent = '';
    target.classList.remove('error');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizePanelKey(value) {
    const key = String(value || '').trim().toLowerCase();
    return PANEL_KEYS.includes(key) ? key : 'chat';
}

function setDefaultOrderDate() {
    if (elements.orderDate && !elements.orderDate.value) {
        elements.orderDate.value = formatDateInputValue(new Date());
    }
}

function setDefaultOrderNumber() {
    if (elements.orderNumber && !elements.orderNumber.value) {
        elements.orderNumber.value = generateOrderNumber();
    }
}

function setDefaultAdmin() {
    if (!elements.adminSelect || elements.adminSelect.value) return;
    const normalizedCurrentUserName = String(state.currentUserName || '').trim().toLowerCase();
    if (!normalizedCurrentUserName) return;
    const options = Array.from(elements.adminSelect.options || []);
    const match = options.find((option) => String(option.value || '').trim().toLowerCase() === normalizedCurrentUserName);
    if (match) elements.adminSelect.value = match.value;
}

function loadPersistedState() {
    if (!state.storageKey) return;
    try {
        const raw = window.localStorage.getItem(state.storageKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || Number(parsed.version || 0) !== STORAGE_VERSION) return;

        state.activePanel = normalizePanelKey(parsed.activePanel);
        state.activeBranch = parsed.activeBranch === 'pampanga' ? 'pampanga' : 'cubao';
        state.activeRoom = parsed.activeRoom === 'shipment' ? 'shipment' : 'delivery';
        state.workflowBranch = parsed.workflowBranch === 'pampanga' ? 'pampanga' : 'cubao';
        state.invoiceSequence = Math.max(Number(parsed.invoiceSequence || 1), 1);

        const chats = parsed.chats || {};
        ['cubao', 'pampanga'].forEach((branch) => {
            ['delivery', 'shipment'].forEach((room) => {
                const entries = Array.isArray(chats?.[branch]?.[room]) ? chats[branch][room] : [];
                state.chats[branch][room] = entries.map((entry) => ({
                    ...entry,
                    branch: resolveBranchKey(entry.branch || branch),
                    room: resolveRoomKey(entry.room || room),
                    attachment: normalizeStoredAttachment(entry.attachment)
                }));
            });
        });

        state.orders = (Array.isArray(parsed.orders) ? parsed.orders : []).map((order) => ({
            ...order,
            id: String(order.id || createLocalId()),
            status: STATUS_META[String(order.status || '').toLowerCase()] ? String(order.status).toLowerCase() : 'submitted',
            adminStatus: ['pending', 'confirmed', 'rejected', 'correction'].includes(String(order.adminStatus || '').toLowerCase()) ? String(order.adminStatus).toLowerCase() : 'pending',
            orderNumber: String(order.orderNumber || '').trim(),
            fulfillmentType: normalizeFulfillmentType(order.fulfillmentType || order.fulfillmentOption || order.courier || ''),
            fulfillmentOption: String(order.fulfillmentOption || order.courier || '').trim(),
            courier: String(order.courier || order.fulfillmentOption || '').trim(),
            cashBranch: String(order.cashBranch || order.branch || '').trim(),
            paymentType: String(order.paymentType || derivePaymentType(order.paymentMethod || '')).trim(),
            adminName: String(order.adminName || '').trim(),
            salesRepresentative: String(order.salesRepresentative || '').trim(),
            items: normalizeStoredOrderItems(order.items),
            deliveryFee: Math.max(0, Number(order.deliveryFee || 0)),
            handlingFee: Math.max(0, Number(order.handlingFee || 0)),
            salesSyncStatus: normalizeSalesSyncStatus(order.salesSyncStatus),
            salesOrderNumber: String(order.salesOrderNumber || '').trim(),
            salesSyncedAt: String(order.salesSyncedAt || '').trim(),
            salesSyncError: String(order.salesSyncError || '').trim(),
            receipt: normalizeStoredAttachment(order.receipt),
            invoiceAttachment: normalizeStoredAttachment(order.invoiceAttachment),
            booking: order.booking
                ? {
                    ...order.booking,
                    deliveryFee: Math.max(0, Number(order.booking.deliveryFee ?? order.deliveryFee ?? 0)),
                    handlingFee: Math.max(0, Number(order.booking.handlingFee ?? order.handlingFee ?? 0))
                }
                : null,
            shipment: order.shipment
                ? { ...order.shipment, receipt: normalizeStoredAttachment(order.shipment.receipt) }
                : null
        }));

        state.orders.forEach((order) => recalculateStoredOrderTotal(order));
        state.invoiceSequence = Math.max(state.invoiceSequence, deriveInvoiceSequenceFromOrders(state.orders));
    } catch (error) {
        console.warn('Unable to hydrate communication panel state:', error);
    }
}

function persistState() {
    if (!state.storageKey) return;
    try {
        window.localStorage.setItem(state.storageKey, JSON.stringify({
            version: STORAGE_VERSION,
            activePanel: state.activePanel,
            activeBranch: state.activeBranch,
            activeRoom: state.activeRoom,
            workflowBranch: state.workflowBranch,
            invoiceSequence: state.invoiceSequence,
            chats: state.chats,
            orders: state.orders
        }));
    } catch (error) {
        console.warn('Unable to persist communication panel state:', error);
    }
}

function normalizeStoredAttachment(attachment) {
    if (!attachment || typeof attachment !== 'object') return null;
    const dataUrl = String(attachment.dataUrl || '').startsWith('data:') ? String(attachment.dataUrl) : '';
    const previewUrl = String(attachment.previewUrl || '').startsWith('data:') ? String(attachment.previewUrl) : '';
    return {
        name: String(attachment.name || ''),
        type: String(attachment.type || ''),
        size: Number(attachment.size || 0),
        dataUrl,
        previewUrl: dataUrl || previewUrl
    };
}

function normalizeStoredOrderItems(items) {
    return (Array.isArray(items) ? items : [])
        .map((item) => {
            const productName = String(item.itemSold || item.productName || '').trim();
            const itemSet = String(item.itemSet || item.setName || '').trim();
            const itemCode = String(item.itemCode || '').trim();
            const unitPrice = Math.max(0, Number(item.unitPrice || item.price || 0));
            const quantity = Math.max(1, Number(item.quantity || 1));
            const normalizedSubtotal = Number(item.subtotal || 0);
            return {
                itemSold: productName,
                productName,
                itemSet,
                itemCode,
                helper: String(item.helper || [itemCode, itemSet].filter(Boolean).join(' | ')).trim(),
                unitPrice,
                quantity,
                subtotal: normalizedSubtotal > 0 ? normalizedSubtotal : quantity * unitPrice
            };
        })
        .filter((item) => item.productName && item.itemSet && item.itemCode);
}

function deriveInvoiceSequenceFromOrders(orders) {
    let max = 0;
    (orders || []).forEach((order) => {
        const match = String(order.invoiceNumber || '').match(/^INV-\d{8}-(\d+)$/i);
        if (!match) return;
        max = Math.max(max, Number(match[1] || 0));
    });
    return max + 1;
}

async function hydrateOrderFormReferences() {
    const refs = { ...FALLBACK_REFERENCES };
    try {
        const bootstrap = await appClient.getBootstrap();
        const orderForm = bootstrap?.workspaceConfig?.orderForm || {};
        const bootstrapBranches = Array.isArray(bootstrap?.branches)
            ? bootstrap.branches.map((branch) => String(branch?.branch_name || branch?.name || branch?.branch || '').trim()).filter(Boolean)
            : [];
        const orderFormBranches = Array.isArray(orderForm.branches) ? orderForm.branches : [];
        const orderFormCashBranches = Array.isArray(orderForm.cashBranches) ? orderForm.cashBranches : [];
        const orderFormCouriers = Array.isArray(orderForm.couriers) ? orderForm.couriers : [];
        const orderFormAdmins = Array.isArray(orderForm.admins) ? orderForm.admins : [];
        const orderFormSalesReps = Array.isArray(orderForm.salesRepresentatives) ? orderForm.salesRepresentatives : [];
        const orderFormPaymentMethods = Array.isArray(orderForm.paymentMethods) ? orderForm.paymentMethods : [];
        refs.branches = uniqueNonEmpty([...orderFormBranches, ...bootstrapBranches, ...FALLBACK_REFERENCES.branches]);
        refs.cashBranches = uniqueNonEmpty([...orderFormCashBranches, ...refs.branches, ...FALLBACK_REFERENCES.cashBranches]);
        refs.couriers = uniqueNonEmpty([...orderFormCouriers, ...FALLBACK_REFERENCES.couriers]);
        refs.admins = uniqueNonEmpty([state.currentUserName, ...orderFormAdmins, ...FALLBACK_REFERENCES.admins]);
        refs.salesRepresentatives = uniqueNonEmpty([...orderFormSalesReps, ...FALLBACK_REFERENCES.salesRepresentatives]);
        refs.paymentMethods = uniqueNonEmpty([...orderFormPaymentMethods, ...FALLBACK_REFERENCES.paymentMethods]);
    } catch (error) {
        console.warn('Unable to load workspace references for communication panel:', error);
    }
    state.references = refs;
    setSelectOptions(elements.branchSelect, refs.branches, 'Select branch');
    setSelectOptions(elements.cashBranchSelect, refs.cashBranches, 'Select cash branch');
    setSelectOptions(elements.courierSelect, refs.couriers, 'Select courier');
    setSelectOptions(elements.adminSelect, refs.admins, 'Select admin');
    setSelectOptions(elements.salesRepSelect, refs.salesRepresentatives, 'Select sales representative');
    setSelectOptions(elements.paymentMethod, refs.paymentMethods, 'Select payment method');
}

async function hydrateMentionables() {
    const mentionableMap = new Map();
    const addMentionable = (handle, label) => {
        const normalizedHandle = sanitizeMentionHandle(handle || label);
        if (!normalizedHandle) return;
        const key = normalizedHandle.toLowerCase();
        if (mentionableMap.has(key)) return;
        mentionableMap.set(key, {
            handle: normalizedHandle,
            label: String(label || handle || normalizedHandle).trim() || normalizedHandle
        });
    };

    addMentionable(state.currentUserName, state.currentUserName);
    addMentionable('Head_Admin', 'Head Admin');
    (state.references.admins || []).forEach((admin) => addMentionable(admin, admin));
    (state.references.salesRepresentatives || []).forEach((salesRep) => addMentionable(salesRep, salesRep));

    try {
        if (appClient?.listUsers) {
            const users = await appClient.listUsers({ role: '', filter: '' });
            (Array.isArray(users) ? users : []).forEach((user) => {
                addMentionable(user?.id || user?.username || user?.name || '', user?.name || user?.display_name || user?.id || user?.username || '');
            });
        }
    } catch (error) {
        console.warn('Unable to load mentionable users:', error);
    }

    try {
        if (appClient?.listEmployees) {
            const employees = await appClient.listEmployees('');
            (Array.isArray(employees) ? employees : []).forEach((employee) => {
                addMentionable(employee?.id || employee?.name || '', employee?.name || employee?.id || '');
            });
        }
    } catch (error) {
        console.warn('Unable to load mentionable employees:', error);
    }

    state.mentionables = Array.from(mentionableMap.values())
        .sort((a, b) => a.label.localeCompare(b.label));
}

function sanitizeMentionHandle(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
}

function setSelectOptions(select, options, placeholder) {
    if (!select) return;
    const normalized = uniqueNonEmpty(options);
    const current = String(select.value || '').trim();
    select.innerHTML = '';
    const first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    select.appendChild(first);
    normalized.forEach((entry) => {
        const option = document.createElement('option');
        option.value = entry;
        option.textContent = entry;
        select.appendChild(option);
    });
    if (current && normalized.includes(current)) select.value = current;
}

function uniqueNonEmpty(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : [])
        .map((value) => String(value || '').trim())
        .filter((value) => {
            if (!value) return false;
            const key = value.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}
