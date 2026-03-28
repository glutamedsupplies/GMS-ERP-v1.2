const appClient = window.appClient;

const EXACT_REFS = {
    branches: ['Main Branch'],
    cashBranches: ['Main Branch'],
    couriers: ['LBC', 'Lalamove', 'Meet-Up'],
    admins: [],
    salesRepresentatives: [],
    paymentMethods: ['CASH', 'LBC Collection'],
    paymentTypes: ['Full Paid', 'Partial'],
    orderStatuses: ['Pending', 'Packed', 'Shipped', 'Completed', 'Cancelled']
};

const SEARCH_DEBOUNCE_MS = 60;
const ORDER_FORM_DRAFT_STORAGE_PREFIX = 'gms:order-form-draft';
const ORDER_FORM_DRAFT_NEW_SCOPE = 'new';
const ORDER_FORM_DRAFT_VERSION = 1;
const ORDER_FORM_DRAFT_SAVE_MS = 180;
const MAX_SUGGESTIONS = 9;
const TOTAL_PULSE_MS = 220;
const NEAR_EXPIRY_DAYS = 7;
const HEADER_FOCUS_ORDER = ['branch', 'cashBranch', 'courier', 'admin', 'salesRep', 'paymentMethods', 'clientName'];
const ZERO_AMOUNT_PAYMENT_METHODS = ['LBC Collection'];
const MEDICAL_SUPPLY_HINTS = ['butterfly', '1cc insulin', '10cc syringe', '3cc syringe', 'cannula', '100ml pnss', '50ml pnss', '10ml sterile water'];
const CHOW_QUICK_POS_DEFAULTS = Object.freeze({
    companyCode: 'chow',
    clientName: 'Walk-in Customer',
    courier: 'Dine-In',
    salesRepresentative: 'Counter Staff',
    paymentMethods: ['CASH', 'GCash', 'Maya', 'Card']
});
const CHOW_QUICK_POS_FULFILLMENT_OPTIONS = Object.freeze(['Dine-In', 'Takeout', 'Grab Pickup', 'Foodpanda']);
const CHOW_QUICK_POS_PAYMENT_METHODS = Object.freeze(['CASH', 'GCash', 'Maya', 'Card']);
const CHOW_QUICK_POS_CATEGORIES = Object.freeze([
    { id: 'all', label: 'All Menu' },
    { id: 'signature', label: 'Signature Bowls' },
    { id: 'specials', label: 'Rice Specials' },
    { id: 'addons', label: 'Add-Ons' }
]);
const CHOW_QUICK_POS_MENU = Object.freeze([
    {
        productName: 'Beef and Mushroom',
        setName: 'M',
        category: 'signature',
        badge: 'Best Seller',
        description: 'Savory beef strips with garlic rice, egg, and mushroom sauce.',
        accent: 'beef'
    },
    {
        productName: 'Crispy Pork Chop',
        setName: 'M',
        category: 'signature',
        badge: 'Crunch Pick',
        description: 'Crispy pork chop with rice, egg, and house pickles.',
        accent: 'pork'
    },
    {
        productName: 'Pork Korean Chili',
        setName: 'M',
        category: 'signature',
        badge: 'Spicy',
        description: 'Sweet-spicy pork topping finished with egg and rice.',
        accent: 'spice'
    },
    {
        productName: 'Crispy Chicken Tender',
        setName: 'M',
        category: 'signature',
        badge: 'Value Meal',
        description: 'Golden chicken tenders with garlic rice and egg.',
        accent: 'chicken'
    },
    {
        productName: 'Angry Pork Belly',
        setName: 'M',
        category: 'signature',
        badge: 'Heat Wave',
        description: 'Bold pork belly rice bowl with egg and pickles.',
        accent: 'spice'
    },
    {
        productName: 'Chicken Curry',
        setName: 'M',
        category: 'signature',
        badge: 'Comfort',
        description: 'Rich curry chicken over rice with a soft fried egg.',
        accent: 'curry'
    },
    {
        productName: 'Beef Supreme',
        setName: 'M',
        category: 'signature',
        badge: 'Premium',
        description: 'Loaded beef rice bowl with egg and signature sauce.',
        accent: 'beef'
    },
    {
        productName: 'Pork Tenders',
        setName: 'M',
        category: 'signature',
        badge: 'Classic',
        description: 'Tender pork bites paired with garlic rice and egg.',
        accent: 'pork'
    },
    {
        productName: 'Chowjin Rice',
        setName: 'M',
        category: 'specials',
        badge: 'Good For Sharing',
        description: 'Saucy signature rice platter for a hungry table.',
        accent: 'curry'
    },
    {
        productName: 'Chow Fan',
        setName: 'M',
        category: 'specials',
        badge: 'Sulit',
        description: 'Chow fan rice bowl sized for quick dine-in or takeout.',
        accent: 'beef'
    },
    {
        productName: 'Jumbo Sharks Fin Siomai',
        setName: 'T',
        category: 'addons',
        badge: 'Add-On',
        description: 'Steamed siomai add-on for combo boosting.',
        accent: 'addons'
    },
    {
        productName: 'Jumbo Pork Beef Siomai',
        setName: 'T',
        category: 'addons',
        badge: 'Add-On',
        description: 'Pork and beef siomai side order.',
        accent: 'addons'
    },
    {
        productName: 'Jumbo Japanese Siomai',
        setName: 'T',
        category: 'addons',
        badge: 'Add-On',
        description: 'Japanese-style siomai side order.',
        accent: 'addons'
    }
]);
const PASTED_COURIER_ALIASES = [
    { courier: 'Meet-Up', phrases: ['pick up', 'pickup'] },
    { courier: 'Lalamove', phrases: ['own booking'] }
];
const PASTED_ADMIN_ALIASES = [];
const PASTED_SALES_REP_ALIASES = [];
const PASTED_PAYMENT_METHOD_ALIASES = [];
const SALES_REP_HIDE_CLIENT_DETAILS = new Set([
    'Jethro',
    'Claude',
    'Aaron',
    'Bless',
    'Kyle/Jayson',
    'James'
].map((value) => normalizeLooseLookup(value)));
const PASTED_SET_ALIASES = [
    {
        setName: 'M',
        patterns: [/\bmeds?\s*only\b/i, /\bmedical\s*supplies?\b/i]
    },
    {
        setName: 'T',
        patterns: [/\btinge\b/i]
    },
    {
        setName: 'P W C',
        patterns: [
            /\bpush(?:\s+set)?\s*w(?:\/|\s+)?\s*(?:(?:\d+\s*)?(?:box(?:es)?|bottles?|packs?|pcs?|pieces?)\s*)?vit(?:amin)?\s*c\b/i,
            /\bpush(?:\s+set)?\s*with\s*(?:(?:\d+\s*)?(?:box(?:es)?|bottles?|packs?|pcs?|pieces?)\s*)?vit(?:amin)?\s*c\b/i
        ]
    },
    {
        setName: 'P',
        patterns: [/\bpush(?:\s+set)?\b/i]
    },
    {
        setName: 'D B 100',
        patterns: [/\bd\s*b\s*100\b/i, /\bdrip\s*set\s*butterfly\s*100(?:\s*ml)?\b/i, /\bbutterfly\s*100(?:\s*ml)?\b/i]
    },
    {
        setName: 'D B 50',
        patterns: [/\bd\s*b\s*50\b/i, /\bdrip\s*set\s*butterfly\s*50(?:\s*ml)?\b/i, /\bbutterfly\s*50(?:\s*ml)?\b/i]
    },
    {
        setName: 'D B',
        patterns: [/\bd\s*b\b/i, /\bdrip\s*set\s*butterfly\b/i, /\bbutterfly\b/i]
    },
    {
        setName: 'D C 100',
        patterns: [/\bd\s*c\s*100\b/i, /\bdrip\s*set\s*cannula\s*100(?:\s*ml)?\b/i, /\bcannula\s*100(?:\s*ml)?\b/i]
    },
    {
        setName: 'D C 50',
        patterns: [/\bd\s*c\s*50\b/i, /\bdrip\s*set\s*cannula\s*50(?:\s*ml)?\b/i, /\bcannula\s*50(?:\s*ml)?\b/i]
    },
    {
        setName: 'D C',
        patterns: [/\bd\s*c\b/i, /\bdrip\s*set\s*cannula\b/i, /\bcannula\b/i]
    }
];
const EXCLUDED_ORDER_PRODUCT_LOOKUPS = new Set(['handlingfee']);
const VIRTUAL_T_VARIANT_SOURCE = 'virtual_t_set';

const pastedOrderInput = document.getElementById('pastedOrderInput');
const applyPastedOrderBtn = document.getElementById('applyPastedOrderBtn');
const orderHeroTitle = document.getElementById('orderHeroTitle');
const orderHeroCopy = document.getElementById('orderHeroCopy');
const orderDetailsTitle = document.getElementById('orderDetailsTitle');
const variantBuilderTitle = document.getElementById('variantBuilderTitle');
const branchLabel = document.getElementById('branchLabel');
const courierLabel = document.getElementById('courierLabel');
const adminLabel = document.getElementById('adminLabel');
const paymentMethodLabel = document.getElementById('paymentMethodLabel');
const clientNameLabel = document.getElementById('clientNameLabel');
const clientContactLabel = document.getElementById('clientContactLabel');
const clientAddressLabel = document.getElementById('clientAddressLabel');
const noteLabel = document.getElementById('noteLabel');
const orderNumberInput = document.getElementById('orderNumberInput');
const saleDateInput = document.getElementById('saleDateInput');
const clientContactInput = document.getElementById('clientContactInput');
const paymentTypeInput = document.getElementById('paymentTypeInput');
const deliveryFeeInput = document.getElementById('deliveryFeeInput');
const clientAddressInput = document.getElementById('clientAddressInput');
const deliveryFeeToggle = document.getElementById('deliveryFeeToggle');
const inventoryDeductToggle = document.getElementById('inventoryDeductToggle');
const amountPaidInput = document.getElementById('amountPaidInput');
const collectionInput = document.getElementById('collectionInput');
const underpaymentInput = document.getElementById('underpaymentInput');
const overpaymentInput = document.getElementById('overpaymentInput');
const noteInput = document.getElementById('noteInput');
const addItemRowBtn = document.getElementById('addItemRowBtn');
const quickPosSection = document.getElementById('quickPosSection');
const quickPosTitle = document.getElementById('quickPosTitle');
const quickPosCopy = document.getElementById('quickPosCopy');
const quickPosSearchInput = document.getElementById('quickPosSearchInput');
const quickPosCategoryTabs = document.getElementById('quickPosCategoryTabs');
const quickPosGrid = document.getElementById('quickPosGrid');
const quickPosClearPaymentBtn = document.getElementById('quickPosClearPaymentBtn');
const tableToggleRow = document.getElementById('tableToggleRow');
const toggleAdvancedRowsBtn = document.getElementById('toggleAdvancedRowsBtn');
const advancedRowsShell = document.getElementById('advancedRowsShell');
const viewReceiptBtn = document.getElementById('viewReceiptBtn');
const deleteOrderBtn = document.getElementById('deleteOrderBtn');
const newOrderBtn = document.getElementById('newOrderBtn');
const resetOrderBtn = document.getElementById('resetOrderBtn');
const submitOrderBtn = document.getElementById('submitOrderBtn');
const itemsTableBody = document.getElementById('itemsTableBody');
const orderTotalValue = document.getElementById('orderTotalValue');
const heroTotalCard = document.getElementById('heroTotalCard');
const heroTotalMeta = document.getElementById('heroTotalMeta');
const heroCollectionCard = document.getElementById('heroCollectionCard');
const heroCollectionValue = document.getElementById('heroCollectionValue');
const heroPaymentMeta = document.getElementById('heroPaymentMeta');
const footerTotalValue = document.getElementById('footerTotalValue');
const footerCollectionValue = document.getElementById('footerCollectionValue');
const statusText = document.getElementById('statusText');
const backToTopBtn = document.getElementById('backToTopBtn');
const aiUsageHint = document.getElementById('aiUsageHint');
const aiUsageTopIndicator = document.getElementById('aiUsageTopIndicator');
const aiUsageBottomIndicator = document.getElementById('aiUsageBottomIndicator');
const editModeBanner = document.getElementById('editModeBanner');
const receiptModal = document.getElementById('receiptModal');
const receiptModalMeta = document.getElementById('receiptModalMeta');
const receiptModalItems = document.getElementById('receiptModalItems');
const receiptModalTotals = document.getElementById('receiptModalTotals');
const receiptModalApproval = document.getElementById('receiptModalApproval');
const printReceiptBtn = document.getElementById('printReceiptBtn');
const saveReceiptPdfBtn = document.getElementById('saveReceiptPdfBtn');
const dismissReceiptBtn = document.getElementById('dismissReceiptBtn');
const closeReceiptBtn = document.getElementById('closeReceiptBtn');
const fieldQuickPaste = document.getElementById('fieldQuickPaste');
const fieldCashBranch = document.getElementById('fieldCashBranch');
const fieldSalesRep = document.getElementById('fieldSalesRep');
const fieldDeliveryFee = document.getElementById('fieldDeliveryFee');
const fieldDeliveryFeeRule = document.getElementById('fieldDeliveryFeeRule');
const fieldNote = document.getElementById('fieldNote');
const fieldClientContact = document.getElementById('fieldClientContact');
const fieldClientAddress = document.getElementById('fieldClientAddress');
const pendingClientAlert = document.getElementById('pendingClientAlert');
const pendingClientAlertTitle = document.getElementById('pendingClientAlertTitle');
const pendingClientAlertCopy = document.getElementById('pendingClientAlertCopy');
const pendingClientAlertBadge = document.getElementById('pendingClientAlertBadge');
const pendingClientAlertStats = document.getElementById('pendingClientAlertStats');
const pendingClientAlertList = document.getElementById('pendingClientAlertList');
const pendingClientRefreshBtn = document.getElementById('pendingClientRefreshBtn');
const openOrderFormSetupBtn = document.getElementById('openOrderFormSetupBtn');
const orderFormSetupModal = document.getElementById('orderFormSetupModal');
const closeOrderFormSetupBtn = document.getElementById('closeOrderFormSetupBtn');
const dismissOrderFormSetupBtn = document.getElementById('dismissOrderFormSetupBtn');
const saveOrderFormSetupBtn = document.getElementById('saveOrderFormSetupBtn');
const pendingClientConfirmModal = document.getElementById('pendingClientConfirmModal');
const closePendingClientConfirmBtn = document.getElementById('closePendingClientConfirmBtn');
const pendingClientConfirmCopy = document.getElementById('pendingClientConfirmCopy');
const pendingClientConfirmList = document.getElementById('pendingClientConfirmList');
const pendingClientConfirmStatus = document.getElementById('pendingClientConfirmStatus');
const proceedPendingClientBtn = document.getElementById('proceedPendingClientBtn');
const cancelPendingClientBtn = document.getElementById('cancelPendingClientBtn');
const orderSetupFields = {
    orderFormTitle: document.getElementById('ofsOrderFormTitle'),
    orderFormCopy: document.getElementById('ofsOrderFormCopy'),
    orderDetailsTitle: document.getElementById('ofsOrderDetailsTitle'),
    orderItemsTitle: document.getElementById('ofsOrderItemsTitle'),
    parseButton: document.getElementById('ofsParseButton'),
    addItemButton: document.getElementById('ofsAddItemButton'),
    submitButton: document.getElementById('ofsSubmitButton'),
    branches: document.getElementById('ofsBranches'),
    cashBranches: document.getElementById('ofsCashBranches'),
    couriers: document.getElementById('ofsCouriers'),
    admins: document.getElementById('ofsAdmins'),
    salesRepresentatives: document.getElementById('ofsSalesReps'),
    paymentMethods: document.getElementById('ofsPaymentMethods')
};
const orderSetupToggles = {
    quickPaste: document.getElementById('ofsShowQuickPaste'),
    cashBranch: document.getElementById('ofsShowCashBranch'),
    salesRepresentative: document.getElementById('ofsShowSalesRep'),
    deliveryFee: document.getElementById('ofsShowDeliveryFee'),
    note: document.getElementById('ofsShowNote')
};
let RECEIPT_LOGO_SRC = new URL('../logo.png', window.location.href).href;
let RECEIPT_SIGNATURE_SRC = new URL('../Signature_JHV.png', window.location.href).href;
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
const PENDING_CLIENT_CHECK_DEBOUNCE_MS = 220;
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

const state = {
    session: null,
    companyCode: '',
    companyName: '',
    references: { ...EXACT_REFS },
    clients: [],
    inventoryVariants: [],
    compositeItems: [],
    products: [],
    variantsByProduct: new Map(),
    compositeByVariant: new Map(),
    stockCacheByBranch: new Map(),
    rows: [],
    nextRowId: 1,
    controls: {},
    workspaceConfig: {},
    rowControls: new Map(),
    pendingFocus: null,
    lastReceipt: null,
    editingOrderNumber: '',
    editingReceiptNumber: '',
    editIntentOrderNumber: '',
    lastBranchValue: '',
    autoDeliveryFee: {
        suggested: 0,
        isManual: false
    },
    aiUsage: {
        monthKey: '',
        current: null,
        max: null,
        providers: [],
        lastProvider: ''
    },
    quickPos: {
        category: 'all',
        search: '',
        manualEditorExpanded: true
    },
    pendingClientCheck: createPendingClientCheckState(),
    receiptSignatureSrc: RECEIPT_SIGNATURE_SRC,
    receiptTemplate: { ...DEFAULT_RECEIPT_TEMPLATE },
    draftState: createOrderFormDraftState()
};

function createOrderFormDraftState() {
    return {
        ready: false,
        suspendCount: 0,
        saveTimerId: 0,
        lastStorageKey: '',
        lastSerialized: ''
    };
}

function createPendingClientCheckState() {
    return {
        timerId: 0,
        requestId: 0,
        lastSignature: '',
        approvedSignature: '',
        loading: false,
        errorMessage: '',
        items: [],
        historyItems: [],
        summary: {
            totalMatches: 0,
            strongCount: 0,
            possibleCount: 0,
            totalBalance: 0,
            totalBalanceDisplay: formatMoney(0),
            historyCount: 0,
            pendingCount: 0,
            settledCount: 0,
            latestProduct: '',
            latestSaleDate: '',
            latestOrderNumber: ''
        },
        selectedProfile: null
    };
}

initialize();

async function initialize() {
    const session = await appClient.ensureSession({
        role: 'head_admin',
        allowEmployeeFeature: 'order_form'
    });
    if (!session) {
        return;
    }
    state.session = session;
    state.companyCode = normalizeCompanyCode(session.companyCode || '');
    state.quickPos.manualEditorExpanded = !isChowQuickPosWorkspace();
    appClient.attachEmployeeBackButton(session);
    if (openOrderFormSetupBtn) {
        openOrderFormSetupBtn.hidden = !canCustomizeOrderForm(session.role);
    }

    await loadReceiptConfig();
    await hydrateReceiptSignatureAsset();
    const requestedOrderNumber = getRequestedOrderNumber();
    let restoredDraft = false;

    bindStaticEvents();
    await loadBootstrapData();
    await resetOrderForm('Order form ready.');

    if (requestedOrderNumber) {
        await loadOrderForEditing(requestedOrderNumber);
        restoredDraft = await restoreOrderFormDraft({ orderNumber: requestedOrderNumber });
    } else {
        restoredDraft = await restoreOrderFormDraft({ scope: ORDER_FORM_DRAFT_NEW_SCOPE });
    }

    state.draftState.ready = true;
    if (restoredDraft) {
        setStatus(
            requestedOrderNumber
                ? `Restored unsaved changes for ${requestedOrderNumber}.`
                : 'Restored your last order draft.',
            false
        );
    }
    scheduleOrderFormDraftSave();
}

function getWorkspaceLabels() {
    return state.workspaceConfig?.labels || {};
}

function normalizeCompanyCode(value = '') {
    return String(value || '').trim().toLowerCase();
}

function isChowQuickPosWorkspace() {
    return normalizeCompanyCode(state.companyCode) === CHOW_QUICK_POS_DEFAULTS.companyCode;
}

function canCustomizeOrderForm(role) {
    const normalizedRole = String(role || '').trim().toLowerCase().replace(/\s+/g, '_');
    return normalizedRole === 'head_admin'
        || normalizedRole === 'company_admin'
        || normalizedRole === 'super_admin';
}

function getOrderFormWorkspaceConfig() {
    return state.workspaceConfig?.orderForm || {};
}

function parseWorkspaceListText(value = '') {
    const seen = new Set();
    return String(value || '')
        .split(/\r?\n/)
        .map((entry) => String(entry || '').trim())
        .filter((entry) => {
            if (!entry) {
                return false;
            }
            const key = entry.toLowerCase();
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
}

function setMultilineField(field, values) {
    if (!field) {
        return;
    }
    field.value = Array.isArray(values) ? values.join('\n') : '';
}

function isOrderFieldVisible(fieldKey) {
    const visibility = getOrderFormWorkspaceConfig()?.visibleFields || {};
    if (!Object.prototype.hasOwnProperty.call(visibility, fieldKey)) {
        return true;
    }
    return Boolean(visibility[fieldKey]);
}

function setElementVisibility(element, visible) {
    if (!element) {
        return;
    }
    element.style.display = visible ? '' : 'none';
}

function isElementVisible(element) {
    return Boolean(element) && element.style.display !== 'none';
}

function shouldHideClientDetailsForSalesRepresentative(value = '') {
    const normalizedSalesRepresentative = normalizeLooseLookup(value);
    if (!normalizedSalesRepresentative) {
        return false;
    }

    return SALES_REP_HIDE_CLIENT_DETAILS.has(normalizedSalesRepresentative);
}

function syncClientDetailVisibility() {
    if (isChowQuickPosWorkspace()) {
        setElementVisibility(fieldClientContact, false);
        setElementVisibility(fieldClientAddress, false);
        return;
    }

    const salesRepresentativeFieldVisible = isOrderFieldVisible('salesRepresentative');
    const salesRepresentativeValue = state.controls.salesRep?.getValue?.() || '';
    const shouldHideClientDetails = salesRepresentativeFieldVisible
        && shouldHideClientDetailsForSalesRepresentative(salesRepresentativeValue);
    const shouldShowClientDetails = !shouldHideClientDetails;
    setElementVisibility(fieldClientContact, shouldShowClientDetails);
    setElementVisibility(fieldClientAddress, shouldShowClientDetails);
}

async function loadReceiptConfig() {
    try {
        const bootstrap = await appClient.getBootstrap();
        const template = bootstrap?.invoiceTemplate || {};
        const branding = bootstrap?.branding || {};
        const company = bootstrap?.company || {};
        state.workspaceConfig = bootstrap?.workspaceConfig || {};
        state.companyName = String(company.name || '').trim();
        if (!state.companyCode) {
            state.companyCode = normalizeCompanyCode(company.company_code || company.companyCode || '');
        }
        if (isChowQuickPosWorkspace()) {
            state.quickPos.manualEditorExpanded = false;
        }
        applyAiUsageFromBootstrap(bootstrap);

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
        renderAiUsageHint();
    }
}

function normalizeAiProviderName(value = '') {
    const raw = String(value || '').trim();
    const normalized = raw.toLowerCase();
    if (!normalized) {
        return '';
    }

    if (normalized === 'chatgpt') return 'OpenAI';
    if (normalized === 'openai') return 'OpenAI';
    if (normalized === 'gemini') return 'Gemini';
    return raw;
}

function applyAiUsageFromBootstrap(bootstrap) {
    const usage = bootstrap?.usage || {};
    const limits = bootstrap?.limits?.aiReads || {};
    const providers = Array.isArray(bootstrap?.aiOrderParserProviders)
        ? bootstrap.aiOrderParserProviders
            .map((value) => normalizeAiProviderName(value))
            .filter(Boolean)
        : [];
    const nextCurrent = Number(usage.ai_reads_count);
    const nextMax = Number(limits.max);

    state.aiUsage = {
        monthKey: String(usage.month_key || '').trim(),
        current: Number.isFinite(nextCurrent) ? Math.max(0, nextCurrent) : null,
        max: Number.isFinite(nextMax) ? Math.max(0, nextMax) : null,
        providers: dedupeValues(providers),
        lastProvider: state.aiUsage?.lastProvider || ''
    };
    renderAiUsageHint();
}

function getAiUsageProviderLabel() {
    const lastProvider = normalizeAiProviderName(state.aiUsage?.lastProvider || '');
    if (lastProvider) {
        return lastProvider;
    }

    const configuredProviders = dedupeValues(
        (Array.isArray(state.aiUsage?.providers) ? state.aiUsage.providers : [])
            .map((entry) => normalizeAiProviderName(entry))
            .filter(Boolean)
    );
    if (!configuredProviders.length) {
        return '';
    }
    if (configuredProviders.length <= 3) {
        return configuredProviders.join(' / ');
    }
    return `${configuredProviders.slice(0, 3).join(' / ')} +${configuredProviders.length - 3}`;
}

function updateAiUsageProviderFromParsed(parsed = null) {
    const provider = normalizeAiProviderName(parsed?.source || '');
    if (!provider) {
        return '';
    }
    state.aiUsage.lastProvider = provider;
    renderAiUsageHint();
    return provider;
}

function renderAiUsageHint() {
    const usageTargets = [aiUsageHint, aiUsageTopIndicator, aiUsageBottomIndicator].filter(Boolean);
    if (!usageTargets.length) {
        return;
    }

    const applyUsageMessage = (message, { warn = false } = {}) => {
        usageTargets.forEach((element) => {
            element.textContent = message;
            if (element !== aiUsageHint) {
                element.classList.toggle('warn', warn);
            }
        });
    };

    const providerLabel = getAiUsageProviderLabel();
    const aiTitle = providerLabel ? `AI (${providerLabel})` : 'AI';
    const current = Number(state.aiUsage?.current);
    const max = Number(state.aiUsage?.max);
    if (!Number.isFinite(current) || !Number.isFinite(max)) {
        applyUsageMessage(`${aiTitle} reads this month: -- / --`);
        return;
    }

    const clampedCurrent = Math.max(0, current);
    const clampedMax = Math.max(0, max);
    const remaining = Math.max(clampedMax - clampedCurrent, 0);
    const message = `${aiTitle} reads this month: ${clampedCurrent} / ${clampedMax} (remaining ${remaining})`;
    const isWarning = clampedMax > 0 && remaining <= 5;
    applyUsageMessage(message, { warn: isWarning });
}

function incrementAiUsageCounter() {
    const current = Number(state.aiUsage?.current);
    const max = Number(state.aiUsage?.max);
    if (!Number.isFinite(current) || !Number.isFinite(max)) {
        return;
    }

    const nextCurrent = Math.min(Math.max(0, max), Math.max(0, current) + 1);
    state.aiUsage.current = nextCurrent;
    renderAiUsageHint();
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

function bindStaticEvents() {
    document.addEventListener('input', handleOrderFormDraftInteraction, true);
    document.addEventListener('change', handleOrderFormDraftInteraction, true);
    window.addEventListener('pagehide', flushOrderFormDraftSave);
    window.addEventListener('beforeunload', flushOrderFormDraftSave);
    window.addEventListener('scroll', updateBackToTopButtonVisibility, { passive: true });

    backToTopBtn?.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    addItemRowBtn.addEventListener('click', () => {
        addOrderRow();
        state.pendingFocus = { rowId: state.rows[state.rows.length - 1].id, field: 'product' };
        renderRows();
    });

    resetOrderBtn.addEventListener('click', async () => {
        const message = state.editingOrderNumber
            ? 'Reload the saved order and discard unsaved changes?'
            : 'Reset this order draft?';
        if (!window.confirm(message)) {
            return;
        }

        if (state.editingOrderNumber) {
            clearOrderFormDraft({
                orderNumber: state.editingOrderNumber || state.editIntentOrderNumber || getRequestedOrderNumber()
            });
            await loadOrderForEditing(state.editingOrderNumber, { statusMessage: 'Saved order reloaded.' });
            return;
        }

        clearOrderFormDraft({ scope: ORDER_FORM_DRAFT_NEW_SCOPE });
        await resetOrderForm('Order form reset.');
    });

    newOrderBtn?.addEventListener('click', async () => {
        if (!window.confirm('Leave edit mode and start a new order?')) {
            return;
        }

        clearOrderFormDraft({
            orderNumber: state.editingOrderNumber || state.editIntentOrderNumber || getRequestedOrderNumber()
        });
        clearOrderFormDraft({ scope: ORDER_FORM_DRAFT_NEW_SCOPE });
        await resetOrderForm('Ready for a new order.');
    });
    viewReceiptBtn?.addEventListener('click', () => {
        if (state.lastReceipt) {
            openReceiptModal(state.lastReceipt);
        }
    });
    deleteOrderBtn?.addEventListener('click', deleteEditingOrder);

    applyPastedOrderBtn?.addEventListener('click', () => {
        handlePastedOrderApply();
    });
    submitOrderBtn.addEventListener('click', submitOrder);
    saleDateInput.addEventListener('change', handleSaleDateChange);
    deliveryFeeInput.addEventListener('input', handleDeliveryFeeInput);
    deliveryFeeToggle.addEventListener('change', () => renderTotals());
    clientContactInput.addEventListener('input', () => {
        clientContactInput.value = clientContactInput.value.replace(/[^\d\s()+-]/g, '');
        schedulePendingClientCheck();
    });
    clientAddressInput.addEventListener('input', () => schedulePendingClientCheck());
    pastedOrderInput?.addEventListener('paste', () => {
        window.setTimeout(() => {
            handlePastedOrderApply({ auto: true });
        }, 0);
    });
    pendingClientRefreshBtn?.addEventListener('click', () => {
        runPendingClientCheck({ force: true });
    });
    pendingClientAlert?.addEventListener('click', handlePendingClientAlertClick);
    pendingClientConfirmModal?.addEventListener('click', (event) => {
        if (event.target === pendingClientConfirmModal) {
            closePendingClientConfirmModal();
        }
    });
    closePendingClientConfirmBtn?.addEventListener('click', closePendingClientConfirmModal);
    cancelPendingClientBtn?.addEventListener('click', closePendingClientConfirmModal);
    proceedPendingClientBtn?.addEventListener('click', handleProceedPendingClientSubmit);
    pendingClientConfirmList?.addEventListener('click', handlePendingClientAlertClick);
    receiptModal?.addEventListener('click', (event) => {
        if (event.target === receiptModal) {
            closeReceiptModal();
        }
    });
    printReceiptBtn?.addEventListener('click', printReceipt);
    saveReceiptPdfBtn?.addEventListener('click', saveReceiptAsPdf);
    dismissReceiptBtn?.addEventListener('click', closeReceiptModal);
    closeReceiptBtn?.addEventListener('click', closeReceiptModal);

    openOrderFormSetupBtn?.addEventListener('click', () => {
        openOrderFormSetupModal();
    });
    orderFormSetupModal?.addEventListener('click', (event) => {
        if (event.target === orderFormSetupModal) {
            closeOrderFormSetupModal();
        }
    });
    closeOrderFormSetupBtn?.addEventListener('click', closeOrderFormSetupModal);
    dismissOrderFormSetupBtn?.addEventListener('click', closeOrderFormSetupModal);
    saveOrderFormSetupBtn?.addEventListener('click', saveOrderFormSetup);

    itemsTableBody.addEventListener('input', handleRowInput);
    itemsTableBody.addEventListener('focusin', handleRowFocusIn);
    itemsTableBody.addEventListener('keydown', handleRowKeydown);
    itemsTableBody.addEventListener('click', handleRowClick);
    quickPosSearchInput?.addEventListener('input', () => {
        state.quickPos.search = normalizeLooseLookup(quickPosSearchInput.value || '');
        renderQuickPos();
    });
    quickPosCategoryTabs?.addEventListener('click', handleQuickPosCategoryClick);
    quickPosGrid?.addEventListener('click', handleQuickPosGridClick);
    quickPosSection?.addEventListener('click', handleQuickPaymentClick);
    quickPosClearPaymentBtn?.addEventListener('click', clearQuickPaymentSelection);
    toggleAdvancedRowsBtn?.addEventListener('click', () => {
        state.quickPos.manualEditorExpanded = !state.quickPos.manualEditorExpanded;
        updateAdvancedRowsVisibility();
    });
    updateBackToTopButtonVisibility();
}

function updateBackToTopButtonVisibility() {
    if (!backToTopBtn) {
        return;
    }

    const shouldShow = window.scrollY > 320;
    backToTopBtn.classList.toggle('is-visible', shouldShow);
    backToTopBtn.tabIndex = shouldShow ? 0 : -1;
    backToTopBtn.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
}

function openOrderFormSetupModal() {
    if (!orderFormSetupModal) {
        return;
    }
    populateOrderFormSetupModal();
    orderFormSetupModal.hidden = false;
}

function closeOrderFormSetupModal() {
    if (!orderFormSetupModal) {
        return;
    }
    orderFormSetupModal.hidden = true;
}

function populateOrderFormSetupModal() {
    const labels = getWorkspaceLabels();
    const orderForm = getOrderFormWorkspaceConfig();
    const visibleFields = orderForm?.visibleFields || {};

    if (orderSetupFields.orderFormTitle) orderSetupFields.orderFormTitle.value = labels.orderFormTitle || '';
    if (orderSetupFields.orderFormCopy) orderSetupFields.orderFormCopy.value = labels.orderFormCopy || '';
    if (orderSetupFields.orderDetailsTitle) orderSetupFields.orderDetailsTitle.value = labels.orderDetailsTitle || '';
    if (orderSetupFields.orderItemsTitle) orderSetupFields.orderItemsTitle.value = labels.orderItemsTitle || '';
    if (orderSetupFields.parseButton) orderSetupFields.parseButton.value = labels.orderParseButton || '';
    if (orderSetupFields.addItemButton) orderSetupFields.addItemButton.value = labels.orderAddItemButton || '';
    if (orderSetupFields.submitButton) orderSetupFields.submitButton.value = labels.orderSubmitButton || '';

    setMultilineField(orderSetupFields.branches, orderForm.branches);
    setMultilineField(orderSetupFields.cashBranches, orderForm.cashBranches);
    setMultilineField(orderSetupFields.couriers, orderForm.couriers);
    setMultilineField(orderSetupFields.admins, orderForm.admins);
    setMultilineField(orderSetupFields.salesRepresentatives, orderForm.salesRepresentatives);
    setMultilineField(orderSetupFields.paymentMethods, orderForm.paymentMethods);

    if (orderSetupToggles.quickPaste) orderSetupToggles.quickPaste.checked = visibleFields.quickPaste !== false;
    if (orderSetupToggles.cashBranch) orderSetupToggles.cashBranch.checked = visibleFields.cashBranch !== false;
    if (orderSetupToggles.salesRepresentative) orderSetupToggles.salesRepresentative.checked = visibleFields.salesRepresentative !== false;
    if (orderSetupToggles.deliveryFee) orderSetupToggles.deliveryFee.checked = visibleFields.deliveryFee !== false;
    if (orderSetupToggles.note) orderSetupToggles.note.checked = visibleFields.note !== false;
}

function buildOrderFormSetupPayload(baseConfig = state.workspaceConfig || {}) {
    const labels = baseConfig?.labels || {};
    const orderForm = baseConfig?.orderForm || {};
    const currentVisibleFields = orderForm?.visibleFields || {};

    return {
        ...baseConfig,
        labels: {
            ...labels,
            orderFormTitle: String(orderSetupFields.orderFormTitle?.value || '').trim() || 'High-Speed Order Encoding',
            orderFormCopy: String(orderSetupFields.orderFormCopy?.value || '').trim()
                || 'Encode like a sheet: type, use arrow keys, press enter or tab, and keep moving. Inventory variants stay cached and totals update live while you work.',
            orderDetailsTitle: String(orderSetupFields.orderDetailsTitle?.value || '').trim() || 'Order Details',
            orderItemsTitle: String(orderSetupFields.orderItemsTitle?.value || '').trim() || 'Variant Builder',
            orderParseButton: String(orderSetupFields.parseButton?.value || '').trim() || 'Parse Text',
            orderAddItemButton: String(orderSetupFields.addItemButton?.value || '').trim() || 'Add Item',
            orderSubmitButton: String(orderSetupFields.submitButton?.value || '').trim() || 'Create Order'
        },
        orderForm: {
            ...orderForm,
            branches: parseWorkspaceListText(orderSetupFields.branches?.value || ''),
            cashBranches: parseWorkspaceListText(orderSetupFields.cashBranches?.value || ''),
            couriers: parseWorkspaceListText(orderSetupFields.couriers?.value || ''),
            admins: parseWorkspaceListText(orderSetupFields.admins?.value || ''),
            salesRepresentatives: parseWorkspaceListText(orderSetupFields.salesRepresentatives?.value || ''),
            paymentMethods: parseWorkspaceListText(orderSetupFields.paymentMethods?.value || ''),
            visibleFields: {
                ...currentVisibleFields,
                quickPaste: Boolean(orderSetupToggles.quickPaste?.checked),
                cashBranch: Boolean(orderSetupToggles.cashBranch?.checked),
                salesRepresentative: Boolean(orderSetupToggles.salesRepresentative?.checked),
                deliveryFee: Boolean(orderSetupToggles.deliveryFee?.checked),
                note: Boolean(orderSetupToggles.note?.checked)
            }
        }
    };
}

async function saveOrderFormSetup() {
    if (!saveOrderFormSetupBtn) {
        return;
    }

    saveOrderFormSetupBtn.disabled = true;
    const originalButtonLabel = saveOrderFormSetupBtn.textContent;
    saveOrderFormSetupBtn.textContent = 'Saving...';
    try {
        const latestConfig = await appClient.getCompanyWorkspaceConfig();
        const payload = buildOrderFormSetupPayload(
            (latestConfig && typeof latestConfig === 'object' && !Array.isArray(latestConfig))
                ? latestConfig
                : state.workspaceConfig
        );
        const updatedConfig = await appClient.updateCompanyWorkspaceConfig(payload);
        state.workspaceConfig = updatedConfig || payload;
        applyWorkspaceConfigToReferences();
        applyWorkspaceConfigToView();
        refreshOrderFormSetupControls();
        closeOrderFormSetupModal();
        setStatus('Order form setup saved.', false);
    } catch (error) {
        console.error('Failed to save order form setup:', error);
        setStatus(error.message || 'Unable to save order form setup.', true);
    } finally {
        saveOrderFormSetupBtn.disabled = false;
        saveOrderFormSetupBtn.textContent = originalButtonLabel || 'Save Setup';
    }
}

function refreshOrderFormSetupControls() {
    state.controls.branch?.refresh?.();
    state.controls.cashBranch?.refresh?.();
    state.controls.courier?.refresh?.();
    state.controls.admin?.refresh?.();
    state.controls.salesRep?.refresh?.();
    state.controls.paymentMethods?.refresh?.();
    syncFormMode();
    syncRowsForBranch();
    syncAutoDeliveryFee({ force: true });
    renderRows();
    renderTotals();
}

async function loadBootstrapData() {
    setStatus('Loading order form references...', false);

    try {
        const [references, inventoryVariants, clientPayload, compositeItems] = await Promise.all([
            appClient.getSalesReferences(),
            appClient.listInventoryVariants(),
            appClient.listClients(''),
            appClient.listCompositeItems('', 500, 0).catch(() => [])
        ]);

        state.references = {
            ...EXACT_REFS,
            ...(references || {})
        };
        if (!Array.isArray(state.references.branches) || !state.references.branches.length) {
            state.references.branches = [...EXACT_REFS.branches];
        }
        if (!Array.isArray(state.references.cashBranches) || !state.references.cashBranches.length) {
            state.references.cashBranches = [...state.references.branches];
        }
        if (!Array.isArray(state.references.couriers) || !state.references.couriers.length) {
            state.references.couriers = [...EXACT_REFS.couriers];
        }
        if (!Array.isArray(state.references.admins)) {
            state.references.admins = [...EXACT_REFS.admins];
        }
        if (!Array.isArray(state.references.salesRepresentatives)) {
            state.references.salesRepresentatives = [...EXACT_REFS.salesRepresentatives];
        }
        if (!Array.isArray(state.references.paymentMethods) || !state.references.paymentMethods.length) {
            state.references.paymentMethods = [...EXACT_REFS.paymentMethods];
        }
        if (!Array.isArray(state.references.paymentTypes) || !state.references.paymentTypes.length) {
            state.references.paymentTypes = [...EXACT_REFS.paymentTypes];
        }
        if (!Array.isArray(state.references.orderStatuses) || !state.references.orderStatuses.length) {
            state.references.orderStatuses = [...EXACT_REFS.orderStatuses];
        }
        applyWorkspaceConfigToReferences();

        state.inventoryVariants = Array.isArray(inventoryVariants) ? inventoryVariants : [];
        buildInventoryCache(state.inventoryVariants);
        state.compositeItems = Array.isArray(compositeItems) ? compositeItems : [];
        buildCompositeCache(state.compositeItems);
        state.clients = Array.isArray(clientPayload?.items) ? clientPayload.items : [];

        initializeStaticControls();
        applyWorkspaceConfigToView();
    } catch (error) {
        console.error('Failed to load order form bootstrap data:', error);
        setStatus(error.message || 'Unable to load order form references.', true);
    }
}

function applyWorkspaceConfigToReferences() {
    const customBranches = getReferenceOverrideList('branches');
    const customCashBranches = getReferenceOverrideList('cashBranches');
    const customCouriers = getReferenceOverrideList('couriers');
    const customAdmins = getReferenceOverrideList('admins');
    const customSalesRepresentatives = getReferenceOverrideList('salesRepresentatives');
    const customMethods = getReferenceOverrideList('paymentMethods');

    if (customBranches.length) {
        state.references.branches = customBranches;
    }
    if (customCashBranches.length) {
        state.references.cashBranches = customCashBranches;
    } else if (!Array.isArray(state.references.cashBranches) || !state.references.cashBranches.length) {
        state.references.cashBranches = [...(state.references.branches || [])];
    }
    if (customCouriers.length) {
        state.references.couriers = customCouriers;
    }
    if (customAdmins.length) {
        state.references.admins = customAdmins;
    } else if (!Array.isArray(state.references.admins)) {
        state.references.admins = [...EXACT_REFS.admins];
    }

    if (customSalesRepresentatives.length) {
        state.references.salesRepresentatives = customSalesRepresentatives;
    } else if (!Array.isArray(state.references.salesRepresentatives)) {
        state.references.salesRepresentatives = [...EXACT_REFS.salesRepresentatives];
    }

    if (customMethods.length) {
        state.references.paymentMethods = customMethods;
    } else if (!Array.isArray(state.references.paymentMethods) || !state.references.paymentMethods.length) {
        state.references.paymentMethods = [...EXACT_REFS.paymentMethods];
    }

    applyQuickPosReferenceDefaults();
}

function appendUniqueReferenceValues(list = [], values = []) {
    const seen = new Set();
    return [...list, ...values]
        .map((entry) => String(entry || '').trim())
        .filter((entry) => {
            if (!entry) {
                return false;
            }
            const key = entry.toLowerCase();
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
}

function filterReferenceValues(list = [], allowedValues = []) {
    const allowedLookup = new Set((allowedValues || []).map((entry) => normalizeLookup(entry)));
    return appendUniqueReferenceValues([], list).filter((entry) => allowedLookup.has(normalizeLookup(entry)));
}

function applyQuickPosReferenceDefaults() {
    if (!isChowQuickPosWorkspace()) {
        return;
    }

    state.references.paymentMethods = appendUniqueReferenceValues(
        filterReferenceValues(state.references.paymentMethods, CHOW_QUICK_POS_PAYMENT_METHODS),
        CHOW_QUICK_POS_PAYMENT_METHODS
    );
    state.references.couriers = appendUniqueReferenceValues(
        filterReferenceValues(state.references.couriers, CHOW_QUICK_POS_FULFILLMENT_OPTIONS),
        CHOW_QUICK_POS_FULFILLMENT_OPTIONS
    );
    state.references.admins = appendUniqueReferenceValues(
        state.references.admins,
        [state.session?.userName || '', 'Manager']
    );
    state.references.salesRepresentatives = appendUniqueReferenceValues(
        state.references.salesRepresentatives,
        [CHOW_QUICK_POS_DEFAULTS.salesRepresentative, 'Manager']
    );
}

function getReferenceOverrideList(key) {
    const orderFormConfig = getOrderFormWorkspaceConfig();
    if (!Array.isArray(orderFormConfig?.[key])) {
        return [];
    }
    return orderFormConfig[key]
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);
}

function getCashBranchOptions() {
    const cashBranches = Array.isArray(state.references.cashBranches)
        ? state.references.cashBranches
        : [];
    if (cashBranches.length) {
        return cashBranches;
    }
    return Array.isArray(state.references.branches) ? state.references.branches : [];
}

function applyWorkspaceConfigToView() {
    const labels = getWorkspaceLabels();

    if (orderHeroTitle) {
        orderHeroTitle.textContent = labels.orderFormTitle || 'Order Form';
    }
    if (orderHeroCopy) {
        orderHeroCopy.textContent = labels.orderFormCopy
            || 'Customize and encode orders based on your company workflow.';
    }
    if (orderDetailsTitle) {
        orderDetailsTitle.textContent = labels.orderDetailsTitle || 'Order Details';
    }
    if (variantBuilderTitle) {
        variantBuilderTitle.textContent = labels.orderItemsTitle || 'Variant Builder';
    }
    if (applyPastedOrderBtn) {
        applyPastedOrderBtn.textContent = labels.orderParseButton || 'Parse Text';
    }
    if (addItemRowBtn) {
        const addItemLabel = labels.orderAddItemButton || 'Add Item';
        addItemRowBtn.innerHTML = `<i class="fa-solid fa-plus"></i> ${appClient.escapeHtml(addItemLabel)}`;
    }

    const showQuickPaste = isOrderFieldVisible('quickPaste');
    const showCashBranch = isOrderFieldVisible('cashBranch');
    const showSalesRepresentative = isOrderFieldVisible('salesRepresentative');
    const showDeliveryFee = isOrderFieldVisible('deliveryFee');
    const showNote = isOrderFieldVisible('note');

    setElementVisibility(fieldQuickPaste, showQuickPaste);
    setElementVisibility(fieldCashBranch, showCashBranch);
    setElementVisibility(fieldSalesRep, showSalesRepresentative);
    setElementVisibility(fieldDeliveryFee, showDeliveryFee);
    setElementVisibility(fieldDeliveryFeeRule, showDeliveryFee);
    setElementVisibility(fieldNote, showNote);
    syncClientDetailVisibility();

    state.controls.cashBranch?.setDisabled?.(!showCashBranch);
    state.controls.salesRep?.setDisabled?.(!showSalesRepresentative);

    if (!showDeliveryFee) {
        deliveryFeeInput.value = '0';
        deliveryFeeToggle.checked = false;
    }
    syncFormMode();
    applyQuickPosModeToView();
    renderQuickPos();
}

function applyQuickPosModeToView() {
    const quickPosEnabled = isChowQuickPosWorkspace();
    document.body.classList.toggle('quick-pos-mode', quickPosEnabled);

    if (quickPosSection) {
        quickPosSection.hidden = !quickPosEnabled;
    }
    if (tableToggleRow) {
        tableToggleRow.hidden = !quickPosEnabled;
    }
    if (quickPosTitle) {
        quickPosTitle.textContent = quickPosEnabled
            ? `${state.companyName || 'Chow 2 Go'} Menu Board`
            : 'Quick POS';
    }
    if (quickPosCopy) {
        quickPosCopy.textContent = quickPosEnabled
            ? 'Tap a meal card, keep the cart moving, and open the manual editor only for special requests or overrides.'
            : 'Tap the menu cards to build the cart fast.';
    }
    if (branchLabel) {
        branchLabel.textContent = quickPosEnabled ? 'Store' : 'Invoice Branch';
    }
    if (courierLabel) {
        courierLabel.textContent = quickPosEnabled ? 'Order Mode' : 'Courier';
    }
    if (adminLabel) {
        adminLabel.textContent = quickPosEnabled ? 'Cashier' : 'Admin';
    }
    if (paymentMethodLabel) {
        paymentMethodLabel.textContent = quickPosEnabled ? 'Payment' : 'Payment Method';
    }
    if (clientNameLabel) {
        clientNameLabel.textContent = quickPosEnabled ? 'Guest Name' : 'Client Name';
    }
    if (clientContactLabel) {
        clientContactLabel.textContent = quickPosEnabled ? 'Guest Contact' : 'Contact Number';
    }
    if (clientAddressLabel) {
        clientAddressLabel.textContent = quickPosEnabled ? 'Table / Pickup Note' : 'Address';
    }
    if (noteLabel) {
        noteLabel.textContent = quickPosEnabled ? 'Kitchen Note' : 'Note';
    }
    updateAdvancedRowsVisibility();
}

function initializeStaticControls() {
    state.controls.branch = new SearchSelect({
        host: document.getElementById('branchCombobox'),
        placeholder: 'Type branch',
        getOptions: () => state.references.branches,
        onSelect: async (_option, _control, meta = {}) => {
            const nextBranch = state.controls.branch.getValue();
            const previousBranch = state.lastBranchValue || '';
            await ensureBranchStockLoaded(nextBranch);

            const currentCashBranch = state.controls.cashBranch?.getValue() || '';
            const cashBranchOptions = getCashBranchOptions();
            const suggestedCashBranch = cashBranchOptions.find((value) => normalizeLookup(value) === normalizeLookup(nextBranch))
                || cashBranchOptions[0]
                || nextBranch;
            if (!currentCashBranch || normalizeLookup(currentCashBranch) === normalizeLookup(previousBranch)) {
                state.controls.cashBranch?.setValue(suggestedCashBranch, { silent: true });
            }

            state.lastBranchValue = nextBranch;
            syncRowsForBranch();
            syncAutoDeliveryFee();
            renderRows();
            renderTotals();
            if (shouldAdvanceFocus(meta)) {
                focusNextHeaderField('branch');
            }
        }
    });

    state.controls.cashBranch = new SearchSelect({
        host: document.getElementById('cashBranchCombobox'),
        placeholder: 'Type cash branch',
        getOptions: () => getCashBranchOptions(),
        onSelect: (_option, _control, meta = {}) => {
            if (shouldAdvanceFocus(meta)) {
                focusNextHeaderField('cashBranch');
            }
        }
    });

    state.controls.courier = new SearchSelect({
        host: document.getElementById('courierCombobox'),
        placeholder: 'Type courier',
        getOptions: () => state.references.couriers,
        onSelect: (_option, _control, meta = {}) => {
            syncAutoDeliveryFee();
            renderTotals();
            if (shouldAdvanceFocus(meta)) {
                focusNextHeaderField('courier');
            }
        }
    });

    state.controls.admin = new SearchSelect({
        host: document.getElementById('adminCombobox'),
        placeholder: 'Type admin',
        allowCustom: true,
        getOptions: () => state.references.admins,
        onCommit: (_value, _option, _control, meta = {}) => {
            if (shouldAdvanceFocus(meta)) {
                focusNextHeaderField('admin');
            }
        }
    });

    state.controls.salesRep = new SearchSelect({
        host: document.getElementById('salesRepCombobox'),
        placeholder: 'Type sales representative',
        allowCustom: true,
        getOptions: () => state.references.salesRepresentatives,
        onCommit: (_value, _option, _control, meta = {}) => {
            syncClientDetailVisibility();
            if (shouldAdvanceFocus(meta)) {
                focusNextHeaderField('salesRep');
            }
        }
    });

    state.controls.paymentMethods = new SearchTagSelect({
        host: document.getElementById('paymentMethodCombobox'),
        placeholder: 'Type payment method',
        getOptions: () => state.references.paymentMethods,
        onChange: () => renderTotals(),
        onSelect: (_option, _control, meta = {}) => {
            if (shouldAdvanceFocus(meta)) {
                focusNextHeaderField('paymentMethods');
            }
        }
    });

    state.controls.clientName = new SearchSelect({
        host: document.getElementById('clientNameCombobox'),
        placeholder: 'Search or type client name',
        allowCustom: true,
        getOptions: () => buildClientSearchOptions(),
        onSelect: (option) => {
            if (option?.meta) {
                state.pendingClientCheck.selectedProfile = option.meta;
                applyClientProfile(option.meta);
            }
        },
        onCommit: (value, option) => {
            if (option?.meta) {
                state.pendingClientCheck.selectedProfile = option.meta;
            } else if (
                !normalizePendingClientLookup(value)
                || normalizePendingClientLookup(value) !== normalizePendingClientLookup(
                    state.pendingClientCheck.selectedProfile?.name || ''
                )
            ) {
                state.pendingClientCheck.selectedProfile = null;
            }
            schedulePendingClientCheck({ immediate: true });

            if (state.rows.length) {
                state.pendingFocus = { rowId: state.rows[0].id, field: 'product' };
                focusPendingField();
                return;
            }

            if (deliveryFeeInput && isOrderFieldVisible('deliveryFee')) {
                deliveryFeeInput.focus();
                deliveryFeeInput.select?.();
            }
        }
    });
    state.controls.clientName.input?.addEventListener('input', () => {
        const typedName = normalizePendingClientLookup(state.controls.clientName.input.value || '');
        const selectedProfileName = normalizePendingClientLookup(state.pendingClientCheck.selectedProfile?.name || '');

        if (!typedName) {
            resetPendingClientCheck({ clearSelectedProfile: true });
            return;
        }

        if (typedName !== selectedProfileName) {
            state.pendingClientCheck.selectedProfile = null;
        }
        schedulePendingClientCheck();
    });
}

async function resetOrderForm(statusMessage = '') {
    clearEditState();
    state.editIntentOrderNumber = '';
    state.lastReceipt = null;
    resetPendingClientCheck({ clearSelectedProfile: true });
    const today = new Date().toISOString().slice(0, 10);
    saleDateInput.value = today;
    noteInput.value = '';
    paymentTypeInput.value = '';
    amountPaidInput.value = '';
    deliveryFeeInput.value = '';
    deliveryFeeToggle.checked = true;
    if (inventoryDeductToggle) {
        inventoryDeductToggle.checked = true;
    }
    clientContactInput.value = '';
    clientAddressInput.value = '';
    collectionInput.value = formatMoney(0);
    underpaymentInput.value = formatMoney(0);
    overpaymentInput.value = formatMoney(0);
    if (pastedOrderInput) {
        pastedOrderInput.value = '';
    }
    if (quickPosSearchInput) {
        quickPosSearchInput.value = '';
    }
    state.quickPos.search = '';
    state.quickPos.category = 'all';
    state.autoDeliveryFee = {
        suggested: 0,
        isManual: false
    };

    state.controls.branch.clear({ silent: true });
    state.controls.cashBranch.clear({ silent: true });
    state.controls.courier.clear({ silent: true });
    state.controls.admin.clear({ silent: true });
    state.controls.salesRep.clear({ silent: true });
    state.controls.paymentMethods.clear({ silent: true });
    state.controls.clientName.clear({ silent: true });
    syncClientDetailVisibility();
    amountPaidInput.readOnly = true;

    state.rows = [];
    state.nextRowId = 1;
    state.lastBranchValue = state.controls.branch.getValue();
    await applyQuickPosDefaults({ force: true });
    await updateOrderNumberPreview();
    syncAutoDeliveryFee({ force: true });
    syncPaymentMethodAvailability();
    syncFormMode();

    addOrderRow();
    state.pendingFocus = { rowId: state.rows[0].id, field: 'product' };
    renderRows();
    renderTotals();

    if (statusMessage) {
        setStatus(statusMessage, false);
    }
}

async function handleSaleDateChange() {
    await updateOrderNumberPreview();
}

function syncFormMode() {
    const isEditing = Boolean(state.editingOrderNumber);
    const createButtonLabel = getWorkspaceLabels().orderSubmitButton || 'Create Order';
    submitOrderBtn.textContent = isEditing ? 'Update Order' : createButtonLabel;
    if (newOrderBtn) {
        newOrderBtn.hidden = !isEditing;
    }
    if (viewReceiptBtn) {
        viewReceiptBtn.hidden = !isEditing || !state.lastReceipt;
    }
    if (deleteOrderBtn) {
        deleteOrderBtn.hidden = !isEditing;
    }
    if (editModeBanner) {
        editModeBanner.hidden = !isEditing;
        editModeBanner.textContent = isEditing
            ? `Editing ${state.editingOrderNumber}${state.editingReceiptNumber ? ` | Receipt ${state.editingReceiptNumber}` : ''}`
            : '';
    }
}

function setEditState({ orderNumber = '', receiptNumber = '' } = {}) {
    state.editingOrderNumber = orderNumber || '';
    state.editingReceiptNumber = receiptNumber || '';
    syncOrderQuery(state.editingOrderNumber);
    syncFormMode();
}

function clearEditState() {
    setEditState({});
}

function getRequestedOrderNumber() {
    const params = new URLSearchParams(window.location.search);
    return String(params.get('orderNumber') || '').trim();
}

function syncOrderQuery(orderNumber = '') {
    const currentUrl = new URL(window.location.href);
    if (orderNumber) {
        currentUrl.searchParams.set('orderNumber', orderNumber);
    } else {
        currentUrl.searchParams.delete('orderNumber');
    }

    const nextValue = `${currentUrl.pathname}${currentUrl.search}`;
    window.history.replaceState({}, '', nextValue);
}

async function withDraftPersistenceSuspended(task) {
    state.draftState.suspendCount += 1;
    try {
        return await task();
    } finally {
        state.draftState.suspendCount = Math.max(0, Number(state.draftState.suspendCount || 0) - 1);
    }
}

function isDraftPersistenceSuspended() {
    return Number(state.draftState.suspendCount || 0) > 0;
}

function getOrderFormDraftStorage() {
    try {
        return window.sessionStorage;
    } catch (error) {
        console.warn('Unable to access session draft storage:', error);
        return null;
    }
}

function getOrderFormDraftScope({ orderNumber = '', scope = '' } = {}) {
    const explicitScope = String(scope || '').trim();
    if (explicitScope) {
        return explicitScope;
    }

    const explicitOrderNumber = String(orderNumber || '').trim();
    if (explicitOrderNumber) {
        return explicitOrderNumber;
    }

    return String(
        state.editingOrderNumber
        || state.editIntentOrderNumber
        || getRequestedOrderNumber()
        || ORDER_FORM_DRAFT_NEW_SCOPE
    ).trim();
}

function getOrderFormDraftStorageKey({ orderNumber = '', scope = '' } = {}) {
    const company = normalizeCompanyCode(state.companyCode || state.session?.companyCode || state.companyName || '') || 'default';
    const user = normalizeCompanyCode(state.session?.userName || 'head_admin') || 'head_admin';
    const draftScope = encodeURIComponent(getOrderFormDraftScope({ orderNumber, scope }));
    return [ORDER_FORM_DRAFT_STORAGE_PREFIX, encodeURIComponent(company), encodeURIComponent(user), draftScope].join(':');
}

function captureSearchControlSnapshot(control) {
    return {
        value: String(control?.getValue?.() || '').trim(),
        input: String(control?.input?.value || '').trim()
    };
}

function serializeOrderFormDraftRow(row) {
    return {
        productName: String(row?.productName || '').trim(),
        setName: String(row?.setName || '').trim(),
        itemCode: String(row?.itemCode || '').trim(),
        price: Math.max(0, Number(row?.price || 0)),
        quantity: Math.max(1, Number(row?.quantity || 1)),
        priceOverride: Boolean(row?.priceOverride)
    };
}

function hasOrderFormDraftRowContent(row) {
    return Boolean(
        row?.productName
        || row?.setName
        || row?.itemCode
        || Number(row?.price || 0) > 0
        || Number(row?.quantity || 1) > 1
    );
}

function buildOrderFormDraftSnapshot() {
    const rows = (state.rows || [])
        .map((row) => serializeOrderFormDraftRow(row))
        .filter((row) => hasOrderFormDraftRowContent(row));

    return {
        version: ORDER_FORM_DRAFT_VERSION,
        scope: getOrderFormDraftScope(),
        saleDate: String(saleDateInput?.value || '').trim(),
        deliveryFee: String(deliveryFeeInput?.value || '').trim(),
        deliveryFeeToCollect: Boolean(deliveryFeeToggle?.checked),
        inventoryDeducted: Boolean(inventoryDeductToggle?.checked ?? true),
        clientContact: String(clientContactInput?.value || '').trim(),
        clientAddress: String(clientAddressInput?.value || '').trim(),
        note: String(noteInput?.value || '').trim(),
        pastedOrderText: String(pastedOrderInput?.value || ''),
        controls: {
            branch: captureSearchControlSnapshot(state.controls.branch),
            cashBranch: captureSearchControlSnapshot(state.controls.cashBranch),
            courier: captureSearchControlSnapshot(state.controls.courier),
            admin: captureSearchControlSnapshot(state.controls.admin),
            salesRep: captureSearchControlSnapshot(state.controls.salesRep),
            clientName: captureSearchControlSnapshot(state.controls.clientName)
        },
        paymentMethods: state.controls.paymentMethods?.getEntries?.() || [],
        quickPos: {
            search: String(quickPosSearchInput?.value || ''),
            category: String(state.quickPos?.category || 'all').trim() || 'all',
            manualEditorExpanded: Boolean(state.quickPos?.manualEditorExpanded)
        },
        rows
    };
}

function hasOrderFormDraftSnapshotContent(snapshot = {}) {
    const controls = Object.values(snapshot.controls || {});
    return Boolean(
        controls.some((entry) => String(entry?.value || '').trim() || String(entry?.input || '').trim())
        || (snapshot.paymentMethods || []).length
        || String(snapshot.clientContact || '').trim()
        || String(snapshot.clientAddress || '').trim()
        || String(snapshot.note || '').trim()
        || String(snapshot.pastedOrderText || '').trim()
        || String(snapshot.deliveryFee || '').trim()
        || String(snapshot.quickPos?.search || '').trim()
        || (snapshot.rows || []).length
    );
}

function handleOrderFormDraftInteraction() {
    scheduleOrderFormDraftSave();
}

function scheduleOrderFormDraftSave() {
    if (!state.draftState.ready || isDraftPersistenceSuspended()) {
        return;
    }

    window.clearTimeout(state.draftState.saveTimerId);
    state.draftState.saveTimerId = window.setTimeout(() => {
        persistOrderFormDraft();
    }, ORDER_FORM_DRAFT_SAVE_MS);
}

function flushOrderFormDraftSave() {
    window.clearTimeout(state.draftState.saveTimerId);
    state.draftState.saveTimerId = 0;
    persistOrderFormDraft();
}

function persistOrderFormDraft({ orderNumber = '', scope = '' } = {}) {
    if (!state.draftState.ready || isDraftPersistenceSuspended()) {
        return;
    }

    const storage = getOrderFormDraftStorage();
    if (!storage) {
        return;
    }

    const storageKey = getOrderFormDraftStorageKey({ orderNumber, scope });
    const snapshot = buildOrderFormDraftSnapshot();
    if (!hasOrderFormDraftSnapshotContent(snapshot)) {
        storage.removeItem(storageKey);
        if (state.draftState.lastStorageKey === storageKey) {
            state.draftState.lastStorageKey = '';
            state.draftState.lastSerialized = '';
        }
        return;
    }

    const serialized = JSON.stringify(snapshot);
    if (state.draftState.lastStorageKey === storageKey && state.draftState.lastSerialized === serialized) {
        return;
    }

    try {
        storage.setItem(storageKey, JSON.stringify({
            ...snapshot,
            savedAt: new Date().toISOString()
        }));
        state.draftState.lastStorageKey = storageKey;
        state.draftState.lastSerialized = serialized;
    } catch (error) {
        console.warn('Unable to persist order draft:', error);
    }
}

function clearOrderFormDraft({ orderNumber = '', scope = '' } = {}) {
    const storage = getOrderFormDraftStorage();
    if (!storage) {
        return;
    }

    const storageKey = getOrderFormDraftStorageKey({ orderNumber, scope });
    storage.removeItem(storageKey);
    if (state.draftState.lastStorageKey === storageKey) {
        state.draftState.lastStorageKey = '';
        state.draftState.lastSerialized = '';
    }
}

function readOrderFormDraft({ orderNumber = '', scope = '' } = {}) {
    const storage = getOrderFormDraftStorage();
    if (!storage) {
        return null;
    }

    const storageKey = getOrderFormDraftStorageKey({ orderNumber, scope });
    const raw = storage.getItem(storageKey);
    if (!raw) {
        return null;
    }

    try {
        const draft = JSON.parse(raw);
        if (Number(draft?.version || 0) !== ORDER_FORM_DRAFT_VERSION) {
            storage.removeItem(storageKey);
            return null;
        }

        const comparable = { ...draft };
        delete comparable.savedAt;
        state.draftState.lastStorageKey = storageKey;
        state.draftState.lastSerialized = JSON.stringify(comparable);
        return draft;
    } catch (error) {
        console.warn('Unable to read saved order draft:', error);
        storage.removeItem(storageKey);
        return null;
    }
}

function restoreSearchControlSnapshot(control, snapshot = {}) {
    if (!control) {
        return;
    }

    const value = String(snapshot?.value || '').trim();
    const input = String(snapshot?.input || '').trim();
    if (value) {
        control.setValue(value, { silent: true });
        return;
    }

    control.clear({ silent: true });
    if (input) {
        control.input.value = input;
        if (control.allowCustom) {
            control.value = input;
        }
    }
}

async function restoreOrderFormDraft({ orderNumber = '', scope = '' } = {}) {
    const draft = readOrderFormDraft({ orderNumber, scope });
    if (!draft) {
        return false;
    }

    await withDraftPersistenceSuspended(async () => {
        saleDateInput.value = draft.saleDate || saleDateInput.value;

        const branchSnapshot = draft.controls?.branch || {};
        const cashBranchSnapshot = draft.controls?.cashBranch || {};
        const branchValue = String(branchSnapshot.value || '').trim();
        const cashBranchValue = String(cashBranchSnapshot.value || '').trim() || branchValue;

        if (branchValue) {
            await ensureBranchStockLoaded(branchValue);
        }
        restoreSearchControlSnapshot(state.controls.branch, branchSnapshot);
        state.lastBranchValue = state.controls.branch.getValue() || branchValue || '';

        if (cashBranchValue) {
            await ensureBranchStockLoaded(cashBranchValue);
        }
        restoreSearchControlSnapshot(state.controls.cashBranch, {
            ...cashBranchSnapshot,
            value: cashBranchSnapshot.value || cashBranchValue
        });
        restoreSearchControlSnapshot(state.controls.courier, draft.controls?.courier);
        restoreSearchControlSnapshot(state.controls.admin, draft.controls?.admin);
        restoreSearchControlSnapshot(state.controls.salesRep, draft.controls?.salesRep);
        restoreSearchControlSnapshot(state.controls.clientName, draft.controls?.clientName);

        syncClientDetailVisibility();

        clientContactInput.value = draft.clientContact ? formatContactNumber(draft.clientContact) : '';
        clientAddressInput.value = draft.clientAddress || '';
        noteInput.value = draft.note || '';
        deliveryFeeInput.value = draft.deliveryFee || '';
        if (deliveryFeeToggle) {
            deliveryFeeToggle.checked = parseBooleanLike(draft.deliveryFeeToCollect, true);
        }
        if (inventoryDeductToggle) {
            inventoryDeductToggle.checked = parseBooleanLike(draft.inventoryDeducted, true);
        }
        if (pastedOrderInput) {
            pastedOrderInput.value = draft.pastedOrderText || '';
        }
        if (quickPosSearchInput) {
            quickPosSearchInput.value = draft.quickPos?.search || '';
        }
        state.quickPos.search = normalizeLooseLookup(draft.quickPos?.search || '');
        state.quickPos.category = String(draft.quickPos?.category || 'all').trim() || 'all';
        if (typeof draft.quickPos?.manualEditorExpanded === 'boolean') {
            state.quickPos.manualEditorExpanded = draft.quickPos.manualEditorExpanded;
        }

        state.controls.paymentMethods.clear({ silent: true });
        if (Array.isArray(draft.paymentMethods) && draft.paymentMethods.length) {
            state.controls.paymentMethods.setEntries(draft.paymentMethods, { silent: true });
        }

        state.rows = [];
        state.nextRowId = 1;
        (Array.isArray(draft.rows) ? draft.rows : []).forEach((savedRow) => {
            const nextRow = createEmptyRow(state.nextRowId);
            state.nextRowId += 1;
            nextRow.productName = String(savedRow?.productName || '').trim();
            nextRow.setName = String(savedRow?.setName || '').trim();
            nextRow.itemCode = String(savedRow?.itemCode || '').trim();
            nextRow.quantity = Math.max(1, Number(savedRow?.quantity || 1));
            nextRow.price = Math.max(0, Number(savedRow?.price || 0));
            nextRow.priceOverride = Boolean(savedRow?.priceOverride);
            state.rows.push(nextRow);
        });
        if (!state.rows.length) {
            addOrderRow();
        }

        syncRowsForBranch();
        state.rows.forEach((row, index) => {
            const savedRow = draft.rows?.[index];
            if (!savedRow || !row.priceOverride) {
                return;
            }
            row.price = Math.max(0, Number(savedRow.price || 0));
            updateRowSubtotal(row);
        });

        state.autoDeliveryFee = {
            suggested: getSuggestedDeliveryFee(),
            isManual: Boolean(String(draft.deliveryFee || '').trim())
                && Number(draft.deliveryFee || 0) !== getSuggestedDeliveryFee()
        };
        if (!String(draft.deliveryFee || '').trim()) {
            syncAutoDeliveryFee({ force: true });
        }

        syncPaymentMethodAvailability();
        updateAdvancedRowsVisibility();
        await updateOrderNumberPreview();
        renderRows();
        renderTotals();
        resetItemsTableViewport();
        schedulePendingClientCheck({ immediate: true });
    });

    return true;
}

function buildInventoryCache(rows) {
    const grouped = new Map();

    rows.forEach((row) => {
        const normalizedRow = normalizeInventoryVariantEntry(row);
        const productName = normalizedRow.productName;
        const setName = normalizedRow.setName;
        if (!productName || !setName || isExcludedOrderProduct(productName)) {
            return;
        }

        const key = normalizeLookup(productName);
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }

        grouped.get(key).push({
            ...normalizedRow
        });
    });

    grouped.forEach((variants) => {
        const hasTrackedT = variants.some((variant) => normalizeLookup(variant.setName) === 't');
        const virtualTTemplate = pickVirtualTTemplateVariant(variants);
        if (!hasTrackedT && virtualTTemplate) {
            variants.push(buildVirtualTOrderFormVariant(virtualTTemplate));
        }
        variants.sort((left, right) => getSetRank(left.setName) - getSetRank(right.setName));
    });

    state.inventoryVariants = Array.from(grouped.values()).flatMap((variants) => variants);
    state.variantsByProduct = grouped;
    state.products = Array.from(grouped.values())
        .map((variants) => variants[0]?.productName || '')
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right));
}

function buildVariantLookupKey(productName = '', setName = '', itemCode = '') {
    return [
        normalizeLookup(productName),
        normalizeLookup(setName),
        normalizeLookup(itemCode)
    ].join('||');
}

function buildCompositeCache(rows) {
    const grouped = new Map();

    (rows || []).forEach((row) => {
        const productName = String(row.product_name || row.productName || '').trim();
        const setName = String(row.item_set || row.itemSet || '').trim();
        const itemCode = String(row.item_code || row.itemCode || '').trim();
        const components = Array.isArray(row.components) ? row.components : [];
        const normalizedComponents = components
            .map((component) => ({
                name: String(component.name || component.component_name || '').trim(),
                quantity: Math.max(0, Number(component.quantity || component.component_quantity || 0)),
                unit: String(component.unit || component.component_unit || '').trim()
            }))
            .filter((component) => component.name && component.quantity > 0);

        if (!productName || !setName || !normalizedComponents.length) {
            return;
        }

        grouped.set(buildVariantLookupKey(productName, setName, itemCode), normalizedComponents);
        grouped.set(buildVariantLookupKey(productName, setName, ''), normalizedComponents);
    });

    state.compositeByVariant = grouped;
}

function isExcludedOrderProduct(productName = '') {
    return EXCLUDED_ORDER_PRODUCT_LOOKUPS.has(normalizeCompactLookup(productName));
}

function getOrderableInventoryVariants() {
    return state.inventoryVariants
        .map(normalizeInventoryVariantEntry)
        .filter((entry) => entry.productName && entry.setName && !isExcludedOrderProduct(entry.productName));
}

function findFirstVariantByProduct(productName = '') {
    const variants = state.variantsByProduct.get(normalizeLookup(productName)) || [];
    return variants[0] || null;
}

function getQuickPosMenuItems() {
    if (!isChowQuickPosWorkspace()) {
        return [];
    }

    const cartQuantityByKey = new Map();
    state.rows.forEach((row) => {
        if (!row.productName || !row.setName) {
            return;
        }
        const key = buildVariantLookupKey(row.productName, row.setName, row.itemCode);
        cartQuantityByKey.set(key, (cartQuantityByKey.get(key) || 0) + Math.max(0, Number(row.quantity || 0)));
    });

    const mappedItems = CHOW_QUICK_POS_MENU.map((meta) => {
        const variant = findVariantForSelection(meta.productName, meta.setName) || findFirstVariantByProduct(meta.productName);
        if (!variant) {
            return null;
        }

        const stockMeta = getStockMeta(variant.productName, variant.setName, variant.itemCode);
        const key = buildVariantLookupKey(variant.productName, variant.setName, variant.itemCode);
        return {
            ...meta,
            productName: variant.productName,
            setName: variant.setName,
            itemCode: variant.itemCode,
            helper: variant.helper || [variant.itemCode, variant.setName].filter(Boolean).join(' | '),
            price: Number(variant.price || 0),
            stockMeta,
            cartQuantity: cartQuantityByKey.get(key) || 0
        };
    }).filter(Boolean);

    return mappedItems.filter((item) => {
        const matchesCategory = state.quickPos.category === 'all' || item.category === state.quickPos.category;
        const searchValue = state.quickPos.search;
        const matchesSearch = !searchValue || [
            item.productName,
            item.description,
            item.badge,
            item.category
        ].some((value) => normalizeLooseLookup(value).includes(searchValue));
        return matchesCategory && matchesSearch;
    });
}

function buildQuickPosCardInitials(value = '') {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase() || 'CG';
}

function renderQuickPos() {
    if (!quickPosSection || !quickPosGrid || !quickPosCategoryTabs) {
        return;
    }

    if (!isChowQuickPosWorkspace()) {
        quickPosSection.hidden = true;
        return;
    }

    quickPosSection.hidden = false;
    quickPosCategoryTabs.innerHTML = CHOW_QUICK_POS_CATEGORIES.map((category) => `
        <button
            type="button"
            class="quick-pos-tab ${state.quickPos.category === category.id ? 'is-active' : ''}"
            data-category="${appClient.escapeHtml(category.id)}"
        >
            ${appClient.escapeHtml(category.label)}
        </button>
    `).join('');

    const items = getQuickPosMenuItems();
    if (!items.length) {
        quickPosGrid.innerHTML = `
            <div class="quick-pos-empty">
                ${state.inventoryVariants.length
                    ? 'No Chow menu card matched the current filter.'
                    : 'No Chow menu variants found yet. Seed the Chow menu first so the quick POS can render.'}
            </div>
        `;
        updateQuickPaymentButtonState();
        return;
    }

    quickPosGrid.innerHTML = items.map((item) => {
        const stockClass = String(item.stockMeta?.className || 'na').replace(/[^a-z-]/g, '');
        const stockLabel = String(item.stockMeta?.label || 'Not tracked');
        const cartLabel = item.cartQuantity > 0 ? `${item.cartQuantity} in cart` : 'Tap to add';
        const isDisabled = stockClass === 'out' || stockClass === 'expired';
        return `
            <button
                type="button"
                class="quick-pos-card quick-pos-card-${appClient.escapeHtml(item.accent || 'beef')} ${item.cartQuantity > 0 ? 'is-in-cart' : ''}"
                data-action="quick-add-item"
                data-product-name="${appClient.escapeHtml(item.productName)}"
                data-set-name="${appClient.escapeHtml(item.setName)}"
                data-item-code="${appClient.escapeHtml(item.itemCode)}"
                ${isDisabled ? 'disabled' : ''}
            >
                <span class="quick-pos-badge">${appClient.escapeHtml(item.badge || 'Menu')}</span>
                <span class="quick-pos-thumb" aria-hidden="true">${appClient.escapeHtml(buildQuickPosCardInitials(item.productName))}</span>
                <span class="quick-pos-card-copy">
                    <strong>${appClient.escapeHtml(item.productName)}</strong>
                    <small>${appClient.escapeHtml(item.description || 'Quick service favorite.')}</small>
                </span>
                <span class="quick-pos-card-footer">
                    <span class="quick-pos-price">${appClient.escapeHtml(formatMoney(item.price))}</span>
                    <span class="stock-pill ${appClient.escapeHtml(stockClass)}">${appClient.escapeHtml(stockLabel)}</span>
                </span>
                <span class="quick-pos-cart-pill">${appClient.escapeHtml(cartLabel)}</span>
            </button>
        `;
    }).join('');

    updateQuickPaymentButtonState();
}

function updateAdvancedRowsVisibility() {
    if (!advancedRowsShell || !toggleAdvancedRowsBtn) {
        return;
    }

    const quickPosWorkspace = isChowQuickPosWorkspace();
    if (tableToggleRow) {
        tableToggleRow.hidden = !quickPosWorkspace;
    }

    if (!quickPosWorkspace) {
        advancedRowsShell.classList.remove('is-collapsed');
        return;
    }

    const shouldCollapse = !state.quickPos.manualEditorExpanded;
    advancedRowsShell.classList.toggle('is-collapsed', shouldCollapse);
    toggleAdvancedRowsBtn.textContent = shouldCollapse ? 'Show Manual Editor' : 'Hide Manual Editor';
}

function handleQuickPosCategoryClick(event) {
    const button = event.target.closest('button[data-category]');
    if (!button) {
        return;
    }
    state.quickPos.category = button.dataset.category || 'all';
    renderQuickPos();
}

async function handleQuickPosGridClick(event) {
    const button = event.target.closest('button[data-action="quick-add-item"]');
    if (!button) {
        return;
    }

    await addQuickPosItem({
        productName: button.dataset.productName || '',
        setName: button.dataset.setName || '',
        itemCode: button.dataset.itemCode || ''
    });
}

function updateQuickPaymentButtonState() {
    if (!quickPosSection) {
        return;
    }

    const summary = computeSummary();
    const entries = state.controls.paymentMethods?.getEntries?.() || [];
    quickPosSection.querySelectorAll('[data-quick-pay]').forEach((button) => {
        const method = String(button.dataset.quickPay || '').trim();
        const hasExactMethod = entries.some((entry) => normalizeLookup(entry.method) === normalizeLookup(method))
            && summary.orderTotal > 0
            && Math.abs(summary.amountPaid - summary.orderTotal) < 0.001;
        button.classList.toggle('is-active', hasExactMethod);
    });
}

async function applyQuickPosDefaults({ force = false } = {}) {
    if (!isChowQuickPosWorkspace() || !state.controls.branch) {
        return;
    }

    const branchOptions = Array.isArray(state.references.branches) ? state.references.branches : [];
    const cashBranchOptions = getCashBranchOptions();
    const courierOptions = Array.isArray(state.references.couriers) ? state.references.couriers : [];
    const adminOptions = Array.isArray(state.references.admins) ? state.references.admins : [];
    const salesRepOptions = Array.isArray(state.references.salesRepresentatives) ? state.references.salesRepresentatives : [];

    const branchValue = state.controls.branch.getValue() || branchOptions[0] || '';
    if ((force || !state.controls.branch.getValue()) && branchValue) {
        state.controls.branch.setValue(branchValue, { silent: true });
        await ensureBranchStockLoaded(branchValue);
    }

    if (isOrderFieldVisible('cashBranch')) {
        const cashBranchValue = state.controls.cashBranch.getValue() || cashBranchOptions[0] || branchValue;
        if ((force || !state.controls.cashBranch.getValue()) && cashBranchValue) {
            state.controls.cashBranch.setValue(cashBranchValue, { silent: true });
        }
    }

    const courierValue = courierOptions.find((entry) => normalizeLookup(entry) === normalizeLookup(CHOW_QUICK_POS_DEFAULTS.courier))
        || courierOptions[0]
        || CHOW_QUICK_POS_DEFAULTS.courier;
    if ((force || !state.controls.courier.getValue()) && courierValue) {
        state.controls.courier.setValue(courierValue, { silent: true });
    }

    const adminValue = adminOptions.find((entry) => normalizeLookup(entry) === normalizeLookup(state.session?.userName || ''))
        || adminOptions[0]
        || state.session?.userName
        || '';
    if ((force || !state.controls.admin.getValue()) && adminValue) {
        state.controls.admin.setValue(adminValue, { silent: true });
    }

    if (isOrderFieldVisible('salesRepresentative')) {
        const salesRepValue = salesRepOptions.find((entry) => normalizeLookup(entry) === normalizeLookup(CHOW_QUICK_POS_DEFAULTS.salesRepresentative))
            || salesRepOptions[0]
            || CHOW_QUICK_POS_DEFAULTS.salesRepresentative;
        if ((force || !state.controls.salesRep.getValue()) && salesRepValue) {
            state.controls.salesRep.setValue(salesRepValue, { silent: true });
        }
    }

    if ((force || !state.controls.clientName.getValue()) && CHOW_QUICK_POS_DEFAULTS.clientName) {
        state.controls.clientName.setValue(CHOW_QUICK_POS_DEFAULTS.clientName, { silent: true });
    }

    state.lastBranchValue = state.controls.branch.getValue();
    syncRowsForBranch();
    syncAutoDeliveryFee({ force: true });
    syncClientDetailVisibility();
    renderRows();
    renderTotals();
}

async function addQuickPosItem({ productName = '', setName = '', itemCode = '' } = {}) {
    if (!productName) {
        return;
    }

    await applyQuickPosDefaults();
    const variant = findVariantForSelection(productName, setName)
        || findVariantForSelection(productName, '')
        || findFirstVariantByProduct(productName);
    if (!variant) {
        setStatus(`No saved pricing variant was found for ${productName}.`, true);
        return;
    }

    const stockMeta = getStockMeta(variant.productName, variant.setName, itemCode || variant.itemCode);
    if (stockMeta.className === 'out' || stockMeta.className === 'expired') {
        setStatus(`${variant.productName} is currently ${stockMeta.label.toLowerCase()}.`, true);
        return;
    }

    const existingRow = state.rows.find((row) => (
        normalizeLookup(row.productName) === normalizeLookup(variant.productName)
        && normalizeLookup(row.setName) === normalizeLookup(variant.setName)
    ));

    if (existingRow) {
        existingRow.quantity = Math.max(1, Number(existingRow.quantity || 1)) + 1;
        syncRowVariant(existingRow, { preserveSelection: true });
        syncSubtotalInput(existingRow.id, existingRow.subtotal);
        renderTotals();
        setStatus(`${variant.productName} quantity updated.`, false);
        return;
    }

    let targetRow = state.rows.find((row) => (
        !row.productName
        && !row.setName
        && !row.itemCode
        && Number(row.price || 0) <= 0
    ));
    if (!targetRow) {
        addOrderRow();
        targetRow = state.rows[state.rows.length - 1];
    }

    targetRow.productName = variant.productName;
    targetRow.setName = variant.setName;
    targetRow.itemCode = variant.itemCode;
    targetRow.quantity = Math.max(1, Number(targetRow.quantity || 1));
    targetRow.priceOverride = false;
    targetRow.price = Number(variant.price || 0);
    targetRow.helper = variant.helper || [variant.itemCode, variant.setName].filter(Boolean).join(' | ');
    syncRowVariant(targetRow, { preserveSelection: true });
    state.pendingFocus = { rowId: targetRow.id, field: 'quantity' };
    renderRows();
    renderTotals();
    setStatus(`${variant.productName} added to cart.`, false);
}

function handleQuickPaymentClick(event) {
    const button = event.target.closest('[data-quick-pay]');
    if (!button) {
        return;
    }

    const method = String(button.dataset.quickPay || '').trim();
    if (method) {
        applyQuickPaymentSelection(method);
    }
}

function applyQuickPaymentSelection(method = '') {
    const normalizedMethod = String(method || '').trim();
    if (!normalizedMethod) {
        return;
    }

    const summary = computeSummary();
    if (summary.orderTotal <= 0) {
        setStatus('Add at least one item before assigning payment.', true);
        return;
    }

    const allowedMethod = (state.references.paymentMethods || []).find((entry) => normalizeLookup(entry) === normalizeLookup(normalizedMethod))
        || normalizedMethod;
    state.controls.paymentMethods.setEntries([
        {
            method: allowedMethod,
            amount: summary.orderTotal
        }
    ]);
    renderTotals();
    setStatus(`${allowedMethod} payment set to exact total.`, false);
}

function clearQuickPaymentSelection() {
    state.controls.paymentMethods?.clear?.();
    renderTotals();
    setStatus('Payment selection cleared.', false);
}

async function updateOrderNumberPreview() {
    if (state.editingOrderNumber) {
        orderNumberInput.value = state.editingOrderNumber;
        return;
    }

    try {
        orderNumberInput.value = await appClient.previewOrderNumber(saleDateInput.value);
    } catch (error) {
        console.error('Failed to preview order number:', error);
        orderNumberInput.value = 'Auto on save';
    }
}

async function loadOrderForEditing(orderNumber, { statusMessage = '' } = {}) {
    const lookupOrderNumber = String(orderNumber || '').trim();
    if (!lookupOrderNumber) {
        return;
    }

    state.editIntentOrderNumber = lookupOrderNumber;
    resetPendingClientCheck({ clearSelectedProfile: true });
    submitOrderBtn.disabled = true;
    setStatus(`Loading ${lookupOrderNumber}...`, false);

    await withDraftPersistenceSuspended(async () => {
        try {
            const order = await appClient.getOrder(lookupOrderNumber);
            const invoiceBranch = order.branch || state.references.branches[0] || '';
            const cashBranch = order.cashBranch || invoiceBranch;

            await ensureBranchStockLoaded(invoiceBranch);
            await ensureBranchStockLoaded(cashBranch);

            saleDateInput.value = order.saleDate || new Date().toISOString().slice(0, 10);
            orderNumberInput.value = order.orderNumber || lookupOrderNumber;
            noteInput.value = order.note || '';
            amountPaidInput.value = Number(order.amountPaid || 0) > 0 ? formatNumberInputValue(Number(order.amountPaid)) : '';
            deliveryFeeInput.value = Number(order.deliveryFee || 0) > 0 ? String(Number(order.deliveryFee)) : '';
            deliveryFeeToggle.checked = Boolean(order.deliveryFeeToCollect);
            if (inventoryDeductToggle) {
                inventoryDeductToggle.checked = parseBooleanLike(order.inventoryDeducted, true);
            }
            clientContactInput.value = formatContactNumber(order.clientContact || '');
            clientAddressInput.value = order.clientAddress || '';
            paymentTypeInput.value = order.paymentType || '';

            state.controls.branch.setValue(invoiceBranch, { silent: true });
            state.controls.cashBranch.setValue(cashBranch, { silent: true });
            state.controls.courier.setValue(order.courier || '', { silent: true });
            state.controls.admin.setValue(order.adminName || '', { silent: true });
            state.controls.salesRep.setValue(order.salesRepresentative || '', { silent: true });
            syncClientDetailVisibility();
            state.controls.paymentMethods.setEntries(order.paymentMethodBreakdown || [], { silent: true });
            state.controls.clientName.setValue(order.clientName || '', { silent: true });
            state.autoDeliveryFee = {
                suggested: getSuggestedDeliveryFee(),
                isManual: Number(order.deliveryFee || 0) !== getSuggestedDeliveryFee()
            };

            state.rows = (order.items || []).map((item) => buildLoadedOrderRow(item));
            state.nextRowId = state.rows.reduce((highest, row) => Math.max(highest, row.id), 0) + 1;
            state.lastBranchValue = invoiceBranch;
            if (!state.rows.length) {
                addOrderRow();
            }

            syncPaymentMethodAvailability();
            state.lastReceipt = buildReceiptSnapshotFromOrder(order);
            setEditState({
                orderNumber: order.orderNumber || lookupOrderNumber,
                receiptNumber: order.receiptNumber || order.orderNumber || lookupOrderNumber
            });
            state.editIntentOrderNumber = order.orderNumber || lookupOrderNumber;
            renderRows();
            renderTotals();
            resetItemsTableViewport();
            schedulePendingClientCheck({ immediate: true });
            setStatus(statusMessage || `Loaded ${order.orderNumber || lookupOrderNumber} for editing.`, false);
        } catch (error) {
            console.error('Failed to load saved order:', error);
            clearEditState();
            await updateOrderNumberPreview();
            setStatus(
                `${error.message || 'Unable to load saved order.'} Reload ${lookupOrderNumber} before saving so this edit does not create a new sale.`,
                true
            );
        } finally {
            submitOrderBtn.disabled = false;
        }
    });
}

function buildLoadedOrderRow(item) {
    const productName = String(item.itemSold || item.productName || '').trim();
    const setName = String(item.itemSet || '').trim();
    const variant = findVariantForSelection(productName, setName);
    const unitPrice = Number(item.unitPrice || 0);
    const referencePrice = Number(variant?.price || 0);
    const quantity = Math.max(1, Number(item.quantity || 1));

    return {
        id: state.nextRowId++,
        productName,
        setName,
        itemCode: String(item.itemCode || variant?.itemCode || '').trim(),
        price: unitPrice,
        quantity,
        subtotal: quantity * unitPrice,
        helper: String(item.helper || variant?.helper || '').trim(),
        variantSource: String(variant?.source || '').trim(),
        priceOverride: Math.abs(unitPrice - referencePrice) > 0.0001,
        stock: null
    };
}

function findVariantForSelection(productName, setName) {
    const variants = state.variantsByProduct.get(normalizeLookup(productName)) || [];
    return variants.find((entry) => normalizeLookup(entry.setName) === normalizeLookup(setName)) || null;
}

function invalidateStockCache(branch = '') {
    const normalizedBranch = String(branch || '').trim();
    if (!normalizedBranch) {
        state.stockCacheByBranch.clear();
        return;
    }

    state.stockCacheByBranch.delete(normalizedBranch);
}

async function ensureBranchStockLoaded(branch) {
    const normalizedBranch = String(branch || '').trim();
    if (!normalizedBranch || state.stockCacheByBranch.has(normalizedBranch)) {
        return;
    }

    const rows = await appClient.listInventory({ branch: normalizedBranch });
    const branchMap = new Map();

    (rows || []).forEach((row) => {
        branchMap.set(normalizeLookup(row.item_name), {
            quantity: Number(row.quantity || 0),
            source: String(row.source || '').trim(),
            inventoryUnit: String(row.inventory_unit || '').trim(),
            expirationDate: normalizeInventoryDateKey(row.expiration_date)
        });
    });

    state.stockCacheByBranch.set(normalizedBranch, branchMap);
}

function syncRowsForBranch() {
    state.rows.forEach((row) => {
        syncRowVariant(row, { preserveSelection: true });
    });
}

function addOrderRow() {
    state.rows.push(createEmptyRow(state.nextRowId));
    state.nextRowId += 1;
}

function createEmptyRow(id) {
    return {
        id,
        productName: '',
        setName: '',
        itemCode: '',
        price: 0,
        quantity: 1,
        subtotal: 0,
        helper: '',
        variantSource: '',
        priceOverride: false,
        stock: null
    };
}

function getItemsTableShell() {
    return itemsTableBody?.closest('.table-shell') || null;
}

function resetItemsTableViewport() {
    const shell = getItemsTableShell();
    if (!shell) {
        return;
    }

    shell.scrollLeft = 0;
}

function renderRows() {
    if (!state.rows.length) {
        state.rowControls = new Map();
        itemsTableBody.innerHTML = '<tr><td colspan="8" class="empty">No order rows yet.</td></tr>';
        renderQuickPos();
        return;
    }

    state.rowControls = new Map();
    itemsTableBody.innerHTML = state.rows.map((row, index) => {
        const stockMeta = getStockMeta(row.productName, row.setName, row.itemCode);
        const priceIcon = row.priceOverride ? 'fa-lock-open' : 'fa-lock';
        const priceTitle = row.priceOverride ? 'Lock price' : 'Unlock price override';
        const isVirtualTWithoutPrice = String(row.variantSource || '').trim() === VIRTUAL_T_VARIANT_SOURCE
            && !row.priceOverride
            && Number(row.price || 0) <= 0;
        const showPriceValue = Boolean(
            row.productName
            || row.setName
            || row.itemCode
            || row.priceOverride
            || Number(row.price || 0) > 0
        );
        const priceValue = isVirtualTWithoutPrice
            ? ''
            : (showPriceValue ? Number(row.price ?? 0).toFixed(2) : '');

        return `
            <tr data-row-id="${row.id}" data-row-number="${index + 1}">
                <td class="cell-product" data-label="Product Name"><div id="row-product-${row.id}" class="combo-host"></div></td>
                <td class="cell-set" data-label="Set"><div id="row-set-${row.id}" class="combo-host"></div></td>
                <td class="cell-stock" data-label="Stock"><span class="stock-pill ${stockMeta.className}">${appClient.escapeHtml(stockMeta.label)}</span></td>
                <td class="cell-code" data-label="Item Code"><input data-field="itemCode" type="text" value="${appClient.escapeHtml(row.itemCode || '')}" readonly></td>
                <td class="cell-price" data-label="Price">
                    <div class="price-shell">
                        <input data-field="price" type="number" min="0" step="0.01" value="${priceValue}" ${row.priceOverride ? '' : 'readonly'}>
                        <button type="button" class="icon-btn ${row.priceOverride ? 'is-unlocked' : ''}" data-action="toggle-price-override" title="${priceTitle}">
                            <i class="fa-solid ${priceIcon}"></i>
                        </button>
                    </div>
                </td>
                <td class="cell-qty" data-label="Qty"><input data-field="quantity" type="number" min="1" step="1" value="${Math.max(1, Number(row.quantity || 1))}"></td>
                <td class="cell-subtotal" data-label="Subtotal"><input data-field="subtotal" type="text" value="${formatMoney(row.subtotal)}" readonly></td>
                <td class="cell-actions" data-label="Actions"><button type="button" class="row-remove-btn" data-action="remove-row" title="Remove row"><i class="fa-solid fa-trash"></i></button></td>
            </tr>
        `;
    }).join('');

    state.rows.forEach((row) => attachRowCombos(row));
    focusPendingField();
    renderQuickPos();
    scheduleOrderFormDraftSave();
}

function attachRowCombos(row) {
    const productControl = new SearchSelect({
        host: document.getElementById(`row-product-${row.id}`),
        placeholder: 'Type product',
        getOptions: () => state.products,
        onSelect: (option, _control, meta = {}) => {
            row.productName = option?.value || '';
            row.setName = '';
            row.itemCode = '';
            row.price = 0;
            row.subtotal = 0;
            row.helper = '';
            row.priceOverride = false;
            syncRowVariant(row);
            state.pendingFocus = shouldAdvanceFocus(meta) ? { rowId: row.id, field: 'set' } : null;
            renderRows();
            renderTotals();
        }
    });

    const setControl = new SearchSelect({
        host: document.getElementById(`row-set-${row.id}`),
        placeholder: row.productName ? 'Type set' : 'Select product first',
        disabled: !row.productName,
        getOptions: () => applyDisplayLabelsToSetOptions(buildQuickPosAwareSetSearchOptions(row)),
        onSelect: (option, _control, meta = {}) => {
            row.setName = option?.value || '';
            syncRowVariant(row);
            state.pendingFocus = shouldAdvanceFocus(meta) ? { rowId: row.id, field: 'quantity' } : null;
            renderRows();
            renderTotals();
        }
    });

    productControl.setValue(row.productName, { silent: true });
    setControl.setValue(row.setName, { silent: true });
    state.rowControls.set(row.id, {
        product: productControl,
        set: setControl
    });
}

function buildSetOptions(row) {
    const variants = state.variantsByProduct.get(normalizeLookup(row.productName)) || [];
    const stockMeta = getStockMeta(row.productName);

    return variants.map((variant) => ({
        value: variant.setName,
        inputValue: getSetDisplayLabel(variant.setName),
        label: `${variant.setName} â€¢ ${stockMeta.label}`,
        description: getVariantSetOptionDescription(variant),
        disabled: stockMeta.disableSelection,
        meta: variant
    }));
}

function buildSetSearchOptions(row) {
    const variants = state.variantsByProduct.get(normalizeLookup(row.productName)) || [];
    const stockMeta = getStockMeta(row.productName);

    return variants.map((variant) => ({
        value: variant.setName,
        inputValue: getSetDisplayLabel(variant.setName),
        label: `${variant.setName} | ${stockMeta.label}`,
        description: getVariantSetOptionDescription(variant),
        disabled: stockMeta.disableSelection,
        meta: variant
    }));
}

function buildQuickPosAwareSetSearchOptions(row) {
    const variants = state.variantsByProduct.get(normalizeLookup(row.productName)) || [];

    return variants.map((variant) => {
        const stockMeta = getStockMeta(variant.productName, variant.setName, variant.itemCode);
        return {
            value: variant.setName,
            inputValue: getSetDisplayLabel(variant.setName),
            label: `${variant.setName} | ${stockMeta.label}`,
            description: getVariantSetOptionDescription(variant),
            disabled: stockMeta.disableSelection,
            meta: variant
        };
    });
}

function getSetDisplayLabel(setName = '') {
    const rawSetName = String(setName || '').trim();
    if (!isChowQuickPosWorkspace()) {
        return rawSetName;
    }

    const normalizedSetName = normalizeLookup(rawSetName);
    if (normalizedSetName === 'm') {
        return 'Regular Bowl';
    }
    if (normalizedSetName === 't') {
        return 'Add-On';
    }
    return rawSetName;
}

function applyDisplayLabelsToSetOptions(options = []) {
    return options.map((option) => {
        const rawValue = String(option?.value || '').trim();
        const displayValue = getSetDisplayLabel(rawValue) || rawValue;
        const rawLabel = String(option?.label || '').trim();

        let nextLabel = rawLabel;
        if (rawValue && displayValue && displayValue !== rawValue) {
            if (rawLabel.startsWith(`${rawValue} |`)) {
                nextLabel = `${displayValue}${rawLabel.slice(rawValue.length)}`;
            } else if (rawLabel.startsWith(`${rawValue} •`)) {
                nextLabel = `${displayValue}${rawLabel.slice(rawValue.length)}`;
            } else {
                nextLabel = rawLabel.replace(rawValue, displayValue);
            }
        }

        return {
            ...option,
            inputValue: displayValue,
            label: nextLabel
        };
    });
}

function syncRowVariant(row, { preserveSelection = false } = {}) {
    const variants = state.variantsByProduct.get(normalizeLookup(row.productName)) || [];
    const variant = variants.find((entry) => normalizeLookup(entry.setName) === normalizeLookup(row.setName));
    row.stock = getStockMeta(row.productName, row.setName, row.itemCode);

    if (!variant) {
        if (!preserveSelection) {
            row.setName = '';
        }
        row.itemCode = '';
        row.price = 0;
        row.helper = '';
        row.variantSource = '';
        row.subtotal = 0;
        return;
    }

    row.itemCode = variant.itemCode;
    row.helper = variant.helper || [variant.itemCode, variant.setName].filter(Boolean).join(' | ');
    row.variantSource = String(variant.source || '').trim();
    if (!row.priceOverride) {
        row.price = Number(variant.price || 0);
    }
    updateRowSubtotal(row);
}

function handleRowInput(event) {
    const row = getRowFromTarget(event.target);
    if (!row) {
        return;
    }

    if (event.target.dataset.field === 'quantity') {
        row.quantity = Math.max(1, Number(event.target.value || 1));
        updateRowSubtotal(row);
        syncSubtotalInput(row.id, row.subtotal);
        renderTotals();
        return;
    }

    if (event.target.dataset.field === 'price') {
        row.price = Math.max(0, Number(event.target.value || 0));
        updateRowSubtotal(row);
        syncSubtotalInput(row.id, row.subtotal);
        renderTotals();
    }
}

function handleRowFocusIn(event) {
    const field = event.target?.dataset?.field || '';
    if (field !== 'price' && field !== 'quantity') {
        return;
    }

    window.requestAnimationFrame(() => {
        event.target.select?.();
    });
}

function handleRowKeydown(event) {
    const row = getRowFromTarget(event.target);
    if (!row) {
        return;
    }

    const field = event.target.dataset.field || '';
    const currentIndex = state.rows.findIndex((entry) => entry.id === row.id);

    if (event.key === 'Enter') {
        event.preventDefault();

        if (field === 'price') {
            state.pendingFocus = { rowId: row.id, field: 'quantity' };
            focusPendingField();
            return;
        }

        if (field !== 'quantity') {
            return;
        }

        if (currentIndex === state.rows.length - 1) {
            addOrderRow();
        }

        const nextRow = state.rows[Math.min(currentIndex + 1, state.rows.length - 1)];
        state.pendingFocus = { rowId: nextRow.id, field: 'product' };
        renderRows();
        return;
    }

    if (event.key === 'ArrowRight' && field === 'price') {
        event.preventDefault();
        state.pendingFocus = { rowId: row.id, field: 'quantity' };
        focusPendingField();
        return;
    }

    if (event.key === 'ArrowLeft' && field === 'quantity') {
        event.preventDefault();
        state.pendingFocus = { rowId: row.id, field: 'price' };
        focusPendingField();
        return;
    }

    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && (field === 'price' || field === 'quantity')) {
        event.preventDefault();
        const nextIndex = event.key === 'ArrowDown'
            ? Math.min(currentIndex + 1, state.rows.length - 1)
            : Math.max(currentIndex - 1, 0);
        state.pendingFocus = { rowId: state.rows[nextIndex].id, field };
        focusPendingField();
    }
}

function handleRowClick(event) {
    const row = getRowFromTarget(event.target);
    if (!row) {
        return;
    }

    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) {
        return;
    }

    if (action === 'remove-row') {
        removeOrderRow(row.id);
        return;
    }

    if (action === 'toggle-price-override') {
        row.priceOverride = !row.priceOverride;
        if (!row.priceOverride) {
            syncRowVariant(row, { preserveSelection: true });
        }
        renderRows();
        renderTotals();
    }
}

function removeOrderRow(rowId) {
    if (state.rows.length === 1) {
        state.rows[0] = createEmptyRow(state.rows[0].id);
    } else {
        state.rows = state.rows.filter((row) => row.id !== rowId);
    }

    renderRows();
    renderTotals();
}

function focusPendingField() {
    if (!state.pendingFocus) {
        return;
    }

    const { rowId, field } = state.pendingFocus;
    state.pendingFocus = null;

    window.requestAnimationFrame(() => {
        const rowElement = document.querySelector(`tr[data-row-id="${rowId}"]`);
        rowElement?.scrollIntoView({ block: 'nearest' });

        if (field === 'product') {
            resetItemsTableViewport();
            const input = document.querySelector(`#row-product-${rowId} .combo-input`);
            input?.focus();
            input?.select();
            return;
        }

        if (field === 'set') {
            resetItemsTableViewport();
            const input = document.querySelector(`#row-set-${rowId} .combo-input`);
            input?.focus();
            input?.select();
            return;
        }

        if (field === 'quantity') {
            const input = document.querySelector(`tr[data-row-id="${rowId}"] input[data-field="quantity"]`);
            input?.focus();
            input?.select();
            return;
        }

        if (field === 'price') {
            const input = document.querySelector(`tr[data-row-id="${rowId}"] input[data-field="price"]`);
            input?.focus();
            input?.select();
        }
    });
}

function focusNextHeaderField(currentField) {
    const currentIndex = HEADER_FOCUS_ORDER.indexOf(currentField);
    if (currentIndex === -1) {
        return;
    }

    for (let index = currentIndex + 1; index < HEADER_FOCUS_ORDER.length; index += 1) {
        if (focusStaticField(HEADER_FOCUS_ORDER[index])) {
            return;
        }
    }
}

function focusStaticField(field) {
    const control = state.controls[field];
    const input = control?.input || null;
    if (!input || input.disabled) {
        return false;
    }

    window.requestAnimationFrame(() => {
        input.focus();
        input.select?.();
    });
    return true;
}

function shouldAdvanceFocus(meta = {}) {
    const reason = String(meta?.reason || '').toLowerCase();
    return reason === 'keyboard' || reason === 'tab';
}

function getRowFromTarget(target) {
    const rowElement = target.closest('tr[data-row-id]');
    if (!rowElement) {
        return null;
    }

    return state.rows.find((row) => row.id === Number(rowElement.dataset.rowId)) || null;
}

function updateRowSubtotal(row) {
    row.subtotal = Math.max(1, Number(row.quantity || 1)) * Math.max(0, Number(row.price || 0));
}

function syncSubtotalInput(rowId, value) {
    const input = document.querySelector(`tr[data-row-id="${rowId}"] input[data-field="subtotal"]`);
    if (input) {
        input.value = formatMoney(value);
    }
}

function buildClientOptions() {
    return state.clients.map((client) => {
        const contact = formatContactNumber(client.contact_number || '');
        const address = String(client.address || '').trim();
        const description = [contact, address].filter(Boolean).join(' â€¢ ');
        return {
            value: String(client.name || '').trim(),
            inputValue: String(client.name || '').trim(),
            label: description ? `${client.name} â€¢ ${description}` : String(client.name || '').trim(),
            description: client.source ? `Source: ${String(client.source).trim()}` : '',
            searchText: [client.name, client.contact_number, client.address].filter(Boolean).join(' '),
            meta: client
        };
    });
}

function buildClientSearchOptions() {
    return state.clients.map((client) => {
        const contact = formatContactNumber(client.contact_number || '');
        const address = String(client.address || '').trim();
        const description = [contact, address].filter(Boolean).join(' | ');
        const name = String(client.name || '').trim();

        return {
            value: name,
            inputValue: name,
            label: description ? `${name} | ${description}` : name,
            description: client.source ? `Source: ${String(client.source).trim()}` : '',
            searchText: [client.name, client.contact_number, client.address].filter(Boolean).join(' '),
            meta: client
        };
    });
}

function applyClientProfile(client) {
    clientContactInput.value = formatContactNumber(client.contact_number || '');
    clientAddressInput.value = String(client.address || '').trim();
}

function normalizePendingClientLookup(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function normalizePendingClientContact(value = '') {
    const digits = String(value || '').replace(/\D+/g, '');
    if (digits.length === 12 && digits.startsWith('63')) {
        return `0${digits.slice(2)}`;
    }
    return digits;
}

function getPendingClientContactValue() {
    const typedContact = normalizePendingClientContact(clientContactInput.value || '');
    if (typedContact) {
        return typedContact;
    }

    const currentClientName = normalizePendingClientLookup(state.controls.clientName?.getValue?.() || '');
    const selectedProfileName = normalizePendingClientLookup(state.pendingClientCheck.selectedProfile?.name || '');
    if (!currentClientName || currentClientName !== selectedProfileName) {
        return '';
    }

    return normalizePendingClientContact(
        state.pendingClientCheck.selectedProfile?.contact_number
        || state.pendingClientCheck.selectedProfile?.contactNumber
        || ''
    );
}

function getPendingClientAddressValue() {
    const typedAddress = String(clientAddressInput.value || '').trim();
    if (typedAddress) {
        return typedAddress;
    }

    const currentClientName = normalizePendingClientLookup(state.controls.clientName?.getValue?.() || '');
    const selectedProfileName = normalizePendingClientLookup(state.pendingClientCheck.selectedProfile?.name || '');
    if (!currentClientName || currentClientName !== selectedProfileName) {
        return '';
    }

    return String(
        state.pendingClientCheck.selectedProfile?.address
        || state.pendingClientCheck.selectedProfile?.client_address
        || ''
    ).trim();
}

function getPendingClientCheckPayload() {
    return {
        clientName: state.controls.clientName?.getValue?.() || '',
        clientContact: getPendingClientContactValue(),
        clientAddress: getPendingClientAddressValue(),
        excludeOrderNumber: state.editingOrderNumber || ''
    };
}

function buildPendingClientCheckSignature(payload = {}) {
    return [
        normalizePendingClientLookup(payload.clientName),
        normalizePendingClientContact(payload.clientContact),
        normalizePendingClientLookup(payload.clientAddress),
        normalizePendingClientLookup(payload.excludeOrderNumber)
    ].join('||');
}

function resetPendingClientCheck({ clearSelectedProfile = false } = {}) {
    window.clearTimeout(state.pendingClientCheck.timerId);
    state.pendingClientCheck.timerId = 0;
    state.pendingClientCheck.requestId += 1;
    state.pendingClientCheck.lastSignature = '';
    state.pendingClientCheck.approvedSignature = '';
    state.pendingClientCheck.loading = false;
    state.pendingClientCheck.errorMessage = '';
    state.pendingClientCheck.items = [];
    state.pendingClientCheck.historyItems = [];
    state.pendingClientCheck.summary = {
        totalMatches: 0,
        strongCount: 0,
        possibleCount: 0,
        totalBalance: 0,
        totalBalanceDisplay: formatMoney(0),
        historyCount: 0,
        pendingCount: 0,
        settledCount: 0,
        latestProduct: '',
        latestSaleDate: '',
        latestOrderNumber: ''
    };
    if (clearSelectedProfile) {
        state.pendingClientCheck.selectedProfile = null;
    }
    closePendingClientConfirmModal();
    renderPendingClientAlert();
}

function schedulePendingClientCheck({ immediate = false, force = false } = {}) {
    window.clearTimeout(state.pendingClientCheck.timerId);
    state.pendingClientCheck.timerId = 0;

    if (immediate) {
        return runPendingClientCheck({ force });
    }

    state.pendingClientCheck.timerId = window.setTimeout(() => {
        runPendingClientCheck({ force });
    }, PENDING_CLIENT_CHECK_DEBOUNCE_MS);
    return Promise.resolve(state.pendingClientCheck);
}

async function runPendingClientCheck({ force = false } = {}) {
    const payload = getPendingClientCheckPayload();
    const signature = buildPendingClientCheckSignature(payload);
    if (!normalizePendingClientLookup(payload.clientName)) {
        resetPendingClientCheck();
        return state.pendingClientCheck;
    }

    if (!force && signature === state.pendingClientCheck.lastSignature && !state.pendingClientCheck.errorMessage) {
        renderPendingClientAlert();
        return state.pendingClientCheck;
    }

    if (state.pendingClientCheck.approvedSignature && state.pendingClientCheck.approvedSignature !== signature) {
        state.pendingClientCheck.approvedSignature = '';
    }

    const requestId = state.pendingClientCheck.requestId + 1;
    state.pendingClientCheck.requestId = requestId;
    state.pendingClientCheck.loading = true;
    state.pendingClientCheck.errorMessage = '';
    renderPendingClientAlert();

    try {
        const result = await appClient.checkOrderClientPending({
            ...payload,
            limit: 8
        });
        if (requestId !== state.pendingClientCheck.requestId) {
            return state.pendingClientCheck;
        }

        state.pendingClientCheck.lastSignature = signature;
        state.pendingClientCheck.loading = false;
        state.pendingClientCheck.errorMessage = '';
        state.pendingClientCheck.items = Array.isArray(result?.items) ? result.items : [];
        state.pendingClientCheck.historyItems = Array.isArray(result?.historyItems)
            ? result.historyItems
            : state.pendingClientCheck.items;
        state.pendingClientCheck.summary = {
            totalMatches: Number(result?.summary?.totalMatches || 0),
            strongCount: Number(result?.summary?.strongCount || 0),
            possibleCount: Number(result?.summary?.possibleCount || 0),
            totalBalance: Number(result?.summary?.totalBalance || 0),
            totalBalanceDisplay: result?.summary?.totalBalanceDisplay || formatMoney(0),
            historyCount: Number(result?.summary?.historyCount || state.pendingClientCheck.historyItems.length || 0),
            pendingCount: Number(result?.summary?.pendingCount || state.pendingClientCheck.items.length || 0),
            settledCount: Number(result?.summary?.settledCount || 0),
            latestProduct: String(result?.summary?.latestProduct || ''),
            latestSaleDate: String(result?.summary?.latestSaleDate || ''),
            latestOrderNumber: String(result?.summary?.latestOrderNumber || '')
        };
        renderPendingClientAlert();
        return state.pendingClientCheck;
    } catch (error) {
        if (requestId !== state.pendingClientCheck.requestId) {
            return state.pendingClientCheck;
        }

        console.error('Failed to check pending client receipts:', error);
        state.pendingClientCheck.lastSignature = signature;
        state.pendingClientCheck.loading = false;
        state.pendingClientCheck.errorMessage = error.message || 'Unable to check previous pending receipts.';
        state.pendingClientCheck.items = [];
        state.pendingClientCheck.historyItems = [];
        state.pendingClientCheck.summary = {
            totalMatches: 0,
            strongCount: 0,
            possibleCount: 0,
            totalBalance: 0,
            totalBalanceDisplay: formatMoney(0),
            historyCount: 0,
            pendingCount: 0,
            settledCount: 0,
            latestProduct: '',
            latestSaleDate: '',
            latestOrderNumber: ''
        };
        renderPendingClientAlert();
        return state.pendingClientCheck;
    }
}

function renderPendingClientAlert() {
    if (!pendingClientAlert) {
        return;
    }

    const payload = getPendingClientCheckPayload();
    const hasClientName = Boolean(normalizePendingClientLookup(payload.clientName));
    const hasMatches = Array.isArray(state.pendingClientCheck.items) && state.pendingClientCheck.items.length > 0;
    const historyItems = Array.isArray(state.pendingClientCheck.historyItems) ? state.pendingClientCheck.historyItems : [];
    const hasHistory = historyItems.length > 0;
    const banner = pendingClientAlert.querySelector('.client-pending-banner');
    const hasStrongMatches = Number(state.pendingClientCheck.summary?.strongCount || 0) > 0;
    const hasStrongHistory = historyItems.some((item) => item.matchLevel === 'strong');
    const hasPendingHistory = Number(state.pendingClientCheck.summary?.pendingCount || 0) > 0 || hasMatches;

    if (!hasClientName || (!state.pendingClientCheck.loading && !state.pendingClientCheck.errorMessage && !hasMatches && !hasHistory)) {
        pendingClientAlert.hidden = true;
        if (banner) {
            banner.classList.remove('is-possible', 'is-clear');
        }
        return;
    }

    pendingClientAlert.hidden = false;
    if (banner) {
        banner.classList.toggle('is-possible', !hasStrongHistory && hasHistory && !state.pendingClientCheck.loading);
        banner.classList.toggle('is-clear', !hasPendingHistory && hasHistory && !state.pendingClientCheck.loading);
    }

    if (state.pendingClientCheck.loading) {
        if (pendingClientAlertTitle) pendingClientAlertTitle.textContent = 'Checking client order history...';
        if (pendingClientAlertCopy) pendingClientAlertCopy.textContent = 'Looking for previous orders and any unpaid or partially paid receipts under this client.';
        if (pendingClientAlertBadge) {
            pendingClientAlertBadge.textContent = 'Checking';
            pendingClientAlertBadge.className = 'pending-check-badge is-loading';
        }
        if (pendingClientAlertStats) pendingClientAlertStats.innerHTML = '';
        if (pendingClientAlertList) pendingClientAlertList.innerHTML = '<div class="client-pending-empty">Checking recent client order history...</div>';
        return;
    }

    if (state.pendingClientCheck.errorMessage) {
        if (pendingClientAlertTitle) pendingClientAlertTitle.textContent = 'Client history unavailable';
        if (pendingClientAlertCopy) pendingClientAlertCopy.textContent = state.pendingClientCheck.errorMessage;
        if (pendingClientAlertBadge) {
            pendingClientAlertBadge.textContent = 'Check Failed';
            pendingClientAlertBadge.className = 'pending-check-badge';
        }
        if (pendingClientAlertStats) pendingClientAlertStats.innerHTML = '';
        if (pendingClientAlertList) pendingClientAlertList.innerHTML = '<div class="client-pending-empty">You can still continue, or refresh the check first.</div>';
        return;
    }

    if (hasPendingHistory) {
        if (pendingClientAlertTitle) pendingClientAlertTitle.textContent = 'This client has previous orders with pending balance.';
        if (pendingClientAlertCopy) pendingClientAlertCopy.textContent = hasStrongHistory
            ? `Pending balance: ${state.pendingClientCheck.summary?.totalBalanceDisplay || formatMoney(0)}. Recent past orders are listed below. Review the old receipt first before creating a new order.`
            : `Possible pending balance: ${state.pendingClientCheck.summary?.totalBalanceDisplay || formatMoney(0)}. Name-only match lang ito, pero makikita mo rin sa ibaba ang recent past orders para ma-verify mo agad.`;
        if (pendingClientAlertBadge) {
            pendingClientAlertBadge.textContent = 'Pending Found';
            pendingClientAlertBadge.className = 'pending-check-badge is-strong';
        }
    } else {
        if (pendingClientAlertTitle) pendingClientAlertTitle.textContent = 'Latest saved order found for this client.';
        if (pendingClientAlertCopy) pendingClientAlertCopy.textContent = hasStrongHistory
            ? `No pending balance found. Ipinapakita lang sa ibaba ang pinaka-latest na saved order para makita mo agad ang product at petsa.`
            : `Name-only match lang ito. Ipinapakita lang sa ibaba ang pinaka-latest na saved order para ma-check mo agad ang product at petsa.`;
        if (pendingClientAlertBadge) {
            pendingClientAlertBadge.textContent = 'No Pending';
            pendingClientAlertBadge.className = 'pending-check-badge is-clear';
        }
    }

    if (pendingClientAlertStats) {
        pendingClientAlertStats.innerHTML = buildPendingClientStatsHtml(state.pendingClientCheck.summary);
    }
    if (pendingClientAlertList) {
        pendingClientAlertList.innerHTML = buildPendingClientMatchListHtml(
            state.pendingClientCheck.historyItems,
            { limit: 6 }
        );
    }
}

function buildPendingClientStatsHtml(summary = {}) {
    const hasPending = Number(summary.pendingCount || 0) > 0;
    const statEntries = hasPending
        ? [
            { label: 'Past Orders', value: `${Number(summary.historyCount || 0)}` },
            { label: 'With Pending', value: `${Number(summary.pendingCount || 0)}` },
            { label: 'Settled', value: `${Number(summary.settledCount || 0)}` },
            { label: 'Pending Balance', value: String(summary.totalBalanceDisplay || formatMoney(0)) }
        ]
        : [
            { label: 'Past Orders', value: `${Number(summary.historyCount || 0)}` },
            { label: 'Last Product', value: String(summary.latestProduct || 'No saved product') },
            { label: 'Last Order Date', value: summary.latestSaleDate ? formatDisplayDate(summary.latestSaleDate) : '-' },
            { label: 'Pending Balance', value: String(summary.totalBalanceDisplay || formatMoney(0)) }
        ];

    return statEntries.map((entry) => `
        <div class="client-pending-stat">
            <span>${appClient.escapeHtml(entry.label)}</span>
            <strong>${appClient.escapeHtml(entry.value)}</strong>
        </div>
    `).join('');
}

function buildPendingClientMatchListHtml(items = [], { limit = 8 } = {}) {
    const safeItems = Array.isArray(items) ? items.slice(0, limit) : [];
    if (!safeItems.length) {
        return '<div class="client-pending-empty">No previous client orders found.</div>';
    }

    return safeItems.map((item) => {
        const orderLookup = String(item.orderNumber || item.receiptNumber || '').trim();
        const orderLabel = item.receiptNumber && item.orderNumber && item.receiptNumber !== item.orderNumber
            ? `${item.receiptNumber} / ${item.orderNumber}`
            : (item.receiptNumber || item.orderNumber || 'Saved order');
        const metaLine = [
            formatDisplayDate(item.saleDate),
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
                item.settledByCashIncome ? 'Cleared via confirmed cash income' : (item.adminName || 'No admin')
            ].join(' | ');
        const statusClass = item.hasPending ? 'is-pending' : 'is-settled';
        const statusLabel = item.hasPending
            ? (item.statusLabel || 'Pending')
            : (item.statusLabel || 'Settled');
        const amountPillLabel = item.hasPending ? formatMoney(item.remainingAmount || 0) : 'No Balance';
        const actionButtonHtml = orderLookup ? `
                    <button
                        type="button"
                        class="secondary-btn secondary-btn-compact"
                        data-review-pending-order="${appClient.escapeHtml(orderLookup)}"
                    >
                        ${appClient.escapeHtml(item.hasPending ? 'Review Old Receipt' : 'Open Receipt')}
                    </button>
                ` : '';

        return `
            <div class="client-pending-item ${appClient.escapeHtml(statusClass)}">
                <div class="client-pending-item-copy">
                    <strong>${appClient.escapeHtml(orderLabel)}</strong>
                    <small>${appClient.escapeHtml(item.matchLabel || 'Possible match')}</small>
                    <span>${appClient.escapeHtml(metaLine)}</span>
                    <span>${appClient.escapeHtml(productLine)}</span>
                    <span>${appClient.escapeHtml(detailLine)}</span>
                </div>
                <div class="client-pending-item-actions">
                    <span class="history-status-pill ${appClient.escapeHtml(statusClass)}">
                        ${appClient.escapeHtml(statusLabel)}
                    </span>
                    <span class="pending-amount-pill ${appClient.escapeHtml(statusClass)}">${appClient.escapeHtml(amountPillLabel)}</span>
                    ${actionButtonHtml}
                </div>
            </div>
        `;
    }).join('');
}

function openPendingClientConfirmModal() {
    if (!pendingClientConfirmModal || !pendingClientConfirmList || !pendingClientConfirmCopy || !pendingClientConfirmStatus) {
        return;
    }

    const summary = state.pendingClientCheck.summary || {};
    const strongCount = Number(summary.strongCount || 0);
    pendingClientConfirmCopy.textContent = strongCount > 1
        ? `There are ${strongCount} strong matches with previous pending receipts. Review the old receipt first if the past balance was already paid.`
        : 'There is a strong match with a previous pending receipt. Review the old receipt first if the past balance was already paid.';
    pendingClientConfirmStatus.textContent = `Pending balance found: ${summary.totalBalanceDisplay || formatMoney(0)}. Continue only if you already verified the old balance.`;
    pendingClientConfirmList.innerHTML = buildPendingClientMatchListHtml(
        state.pendingClientCheck.items.filter((item) => item.matchLevel === 'strong')
    );
    pendingClientConfirmModal.hidden = false;
}

function closePendingClientConfirmModal() {
    if (pendingClientConfirmModal) {
        pendingClientConfirmModal.hidden = true;
    }
}

function handlePendingClientAlertClick(event) {
    const button = event.target.closest('[data-review-pending-order]');
    if (!button) {
        return;
    }

    const orderLookup = String(button.dataset.reviewPendingOrder || '').trim();
    if (!orderLookup) {
        return;
    }

    handleReviewPendingClientOrder(orderLookup);
}

async function handleReviewPendingClientOrder(orderLookup = '') {
    if (!orderLookup) {
        return;
    }

    const hasDraft = hasDraftContent({ ignorePasteText: true });
    const shouldOpen = !hasDraft || window.confirm(
        `Open ${orderLookup} first? This will replace the current draft so you can review and update the old pending payment.`
    );
    if (!shouldOpen) {
        return;
    }

    flushOrderFormDraftSave();
    closePendingClientConfirmModal();
    await loadOrderForEditing(orderLookup, { statusMessage: `Loaded ${orderLookup} for pending payment review.` });
}

function handleProceedPendingClientSubmit() {
    state.pendingClientCheck.approvedSignature = state.pendingClientCheck.lastSignature
        || buildPendingClientCheckSignature(getPendingClientCheckPayload());
    closePendingClientConfirmModal();
    submitOrder();
}

async function ensurePendingClientSubmitAllowed() {
    if (state.editingOrderNumber) {
        return true;
    }

    const result = await runPendingClientCheck({ force: true });
    const currentSignature = buildPendingClientCheckSignature(getPendingClientCheckPayload());
    if (Number(result.summary?.strongCount || 0) > 0 && state.pendingClientCheck.approvedSignature !== currentSignature) {
        openPendingClientConfirmModal();
        return false;
    }

    return true;
}

function hasDraftContent({ ignorePasteText = false } = {}) {
    const items = getPreparedItems({ allowIncomplete: true });
    return Boolean(
        state.editingOrderNumber
        || state.controls.branch?.getValue?.()
        || state.controls.cashBranch?.getValue?.()
        || state.controls.courier?.getValue?.()
        || state.controls.admin?.getValue?.()
        || state.controls.salesRep?.getValue?.()
        || state.controls.paymentMethods?.getEntries?.().length
        || state.controls.clientName?.getValue?.()
        || clientContactInput.value.trim()
        || clientAddressInput.value.trim()
        || noteInput.value.trim()
        || items.length
        || (!ignorePasteText && pastedOrderInput?.value.trim())
    );
}

async function handlePastedOrderApply({ auto = false } = {}) {
    const rawText = String(pastedOrderInput?.value || '').trim();
    if (!rawText) {
        if (!auto) {
            setStatus('Paste the order text first.', true);
        }
        return;
    }

    if (!getOrderableInventoryVariants().length || !state.controls.branch) {
        setStatus('Order references are still loading. Try again in a moment.', true);
        return;
    }

    const shouldConfirmReplace = state.editingOrderNumber || hasDraftContent({ ignorePasteText: true });
    if (shouldConfirmReplace && !window.confirm('Replace the current draft with the pasted order text?')) {
        return;
    }

    setStatus('Parsing pasted order...', false);

    let parsed = parsePastedOrderText(rawText);
    let usedAi = false;
    let aiProviderLabel = '';

    if (shouldUseAiOrderParsing(parsed)) {
        const aiParsed = await tryEnrichParsedOrderWithAi(rawText, parsed);
        if (aiParsed) {
            parsed = mergeParsedOrderResults(parsed, aiParsed);
            usedAi = true;
            aiProviderLabel = updateAiUsageProviderFromParsed(aiParsed);
        }
    }

    if (!parsed.rows.length) {
        const reason = parsed.unmatchedItemLines.length
            ? `Unable to match item lines: ${parsed.unmatchedItemLines.join(' | ')}`
            : 'No order lines were found in the pasted text.';
        setStatus(reason, true);
        return;
    }

    await applyParsedOrder(parsed);
    if (usedAi) {
        incrementAiUsageCounter();
    }
    setStatus(buildPastedOrderStatus(parsed, { usedAi, aiProviderLabel }), parsed.rows.length === 0);
}

function shouldUseAiOrderParsing(parsed) {
    return Boolean(
        !parsed.rows.length
        || parsed.unmatchedItemLines.length
        || parsed.warnings.length
        || !parsed.admin
        || !parsed.salesRepresentative
        || !parsed.courier
        || !parsed.branch
    );
}

function serializeParsedOrderForAi(parsed) {
    return {
        saleDate: parsed.saleDate || '',
        branch: parsed.branch || '',
        cashBranch: parsed.cashBranch || '',
        courier: parsed.courier || '',
        admin: parsed.admin || '',
        salesRepresentative: parsed.salesRepresentative || '',
        clientName: parsed.clientName || '',
        clientContact: parsed.clientContact || '',
        clientAddress: parsed.clientAddress || '',
        note: parsed.note || '',
        deliveryFee: parsed.deliveryFee,
        deliveryFeeToCollect: parsed.deliveryFeeToCollect,
        paymentEntries: Array.isArray(parsed.paymentEntries) ? parsed.paymentEntries : [],
        rows: Array.isArray(parsed.rows) ? parsed.rows.map((row) => ({
            productName: row.productName || '',
            setName: row.setName || '',
            quantity: Number(row.quantity || 1),
            price: Number(row.price || 0)
        })) : [],
        unmatchedItemLines: Array.isArray(parsed.unmatchedItemLines) ? parsed.unmatchedItemLines : [],
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : []
    };
}

async function tryEnrichParsedOrderWithAi(rawText, parsed) {
    try {
        return await appClient.parseOrderDraftWithAi({
            rawText,
            localParse: serializeParsedOrderForAi(parsed)
        });
    } catch (error) {
        const message = String(error?.message || error || '');
        if (
            /not configured/i.test(message)
            || /no compatible ai parser/i.test(message)
        ) {
            console.warn('AI order parsing unavailable:', error);
            return null;
        }

        console.error('AI order parsing failed:', error);
        return null;
    }
}

function mergeParsedOrderResults(baseParsed, aiParsed) {
    const merged = {
        ...baseParsed,
        saleDate: baseParsed.saleDate || aiParsed.saleDate || '',
        branch: baseParsed.branch || aiParsed.branch || '',
        cashBranch: baseParsed.cashBranch || aiParsed.cashBranch || baseParsed.branch || aiParsed.branch || '',
        courier: baseParsed.courier || aiParsed.courier || '',
        admin: baseParsed.admin || aiParsed.admin || '',
        salesRepresentative: baseParsed.salesRepresentative || aiParsed.salesRepresentative || '',
        clientName: baseParsed.clientName || aiParsed.clientName || '',
        clientContact: baseParsed.clientContact || aiParsed.clientContact || '',
        clientAddress: baseParsed.clientAddress || aiParsed.clientAddress || '',
        note: baseParsed.note || aiParsed.note || '',
        deliveryFee: baseParsed.deliveryFee !== null && baseParsed.deliveryFee !== undefined ? baseParsed.deliveryFee : aiParsed.deliveryFee,
        deliveryFeeToCollect: baseParsed.deliveryFeeToCollect !== null && baseParsed.deliveryFeeToCollect !== undefined
            ? baseParsed.deliveryFeeToCollect
            : aiParsed.deliveryFeeToCollect,
        paymentEntries: mergeParsedPaymentEntries(baseParsed.paymentEntries, aiParsed.paymentEntries),
        rows: mergeParsedRows(baseParsed, aiParsed),
        warnings: dedupeValues([...(baseParsed.warnings || []), ...(aiParsed.warnings || [])]),
        unmatchedItemLines: []
    };

    return merged;
}

function mergeParsedPaymentEntries(baseEntries = [], aiEntries = []) {
    if (Array.isArray(baseEntries) && baseEntries.some((entry) => Number(entry?.amount || 0) > 0 || isZeroAmountPaymentMethod(entry?.method))) {
        return baseEntries;
    }

    return Array.isArray(aiEntries) ? aiEntries : [];
}

function mergeParsedRows(baseParsed, aiParsed) {
    const baseRows = Array.isArray(baseParsed.rows) ? baseParsed.rows : [];
    const aiRows = Array.isArray(aiParsed?.rows) ? aiParsed.rows : [];

    if (!aiRows.length) {
        return baseRows;
    }

    if (!baseRows.length || (baseParsed.unmatchedItemLines || []).length || aiRows.length > baseRows.length) {
        return aiRows;
    }

    return baseRows;
}

async function applyParsedOrder(parsed) {
    const rawText = parsed.rawText || '';
    await resetOrderForm('');
    if (pastedOrderInput) {
        pastedOrderInput.value = rawText;
    }

    if (parsed.saleDate) {
        saleDateInput.value = parsed.saleDate;
    }

    await updateOrderNumberPreview();

    if (parsed.branch) {
        await ensureBranchStockLoaded(parsed.branch);
        state.controls.branch.setValue(parsed.branch, { silent: true });
        state.lastBranchValue = parsed.branch;
    }

    const cashBranch = parsed.cashBranch || parsed.branch || '';
    if (cashBranch) {
        await ensureBranchStockLoaded(cashBranch);
        state.controls.cashBranch.setValue(cashBranch, { silent: true });
    }

    if (parsed.courier) {
        state.controls.courier.setValue(parsed.courier, { silent: true });
    }
    if (parsed.admin) {
        state.controls.admin.setValue(parsed.admin, { silent: true });
    }
    if (parsed.salesRepresentative) {
        state.controls.salesRep.setValue(parsed.salesRepresentative, { silent: true });
    }
    syncClientDetailVisibility();
    if (parsed.clientName) {
        state.controls.clientName.setValue(parsed.clientName, { silent: true });
    }

    clientContactInput.value = parsed.clientContact ? formatContactNumber(parsed.clientContact) : '';
    clientAddressInput.value = parsed.clientAddress || '';
    noteInput.value = parsed.note || '';
    schedulePendingClientCheck({ immediate: true });

    if (parsed.paymentEntries.length) {
        state.controls.paymentMethods.setEntries(parsed.paymentEntries, { silent: true });
    }

    if (parsed.deliveryFee !== null) {
        deliveryFeeInput.value = parsed.deliveryFee > 0 ? String(parsed.deliveryFee) : '';
        state.autoDeliveryFee = {
            suggested: getSuggestedDeliveryFee(),
            isManual: true
        };
    } else {
        syncAutoDeliveryFee({ force: true });
    }

    if (parsed.deliveryFeeToCollect !== null) {
        deliveryFeeToggle.checked = Boolean(parsed.deliveryFeeToCollect);
    }

    state.rows = parsed.rows.length
        ? parsed.rows.map((row) => ({
            ...row,
            id: state.nextRowId++,
            stock: null
        }))
        : [];

    if (!state.rows.length) {
        addOrderRow();
    }

    syncRowsForBranch();
    syncPaymentMethodAvailability();
    renderRows();
    renderTotals();
    resetItemsTableViewport();
}

function parsePastedOrderText(rawText) {
    const text = normalizePastedMultilineText(rawText);
    const warnings = [];
    const rawBranch = extractTaggedValue(text, ['BRANCH', 'INVOICE BRANCH']);
    const rawCourier = extractTaggedValue(text, ['COURIER', 'TYPE OF DELIVERY']);
    const rawAdmin = extractTaggedValue(text, ['ADMIN']);
    const rawSalesRepresentative = extractTaggedValue(text, ['SALES REPRESENTATIVE', 'SALES REP']);
    const rawClientName = extractTaggedValue(text, ['NAME', 'FULL NAME']) || extractTaggedValue(text, ['VIBER']);
    const rawPaymentMethod = extractTaggedValue(text, ['MODE OF PAYMENT', 'PAYMENT METHOD']);
    const deliveryFee = parsePastedDeliveryFee(text);
    const totalAmount = parseMoneyValue(extractTaggedValue(text, ['TOTAL', 'TOTAL PURCHASE']));
    const parsedItems = parsePastedOrderItems(text);
    const fallbackTotalAmount = parsedItems.rows.reduce((sum, row) => sum + Number(row.subtotal || 0), 0);
    const paymentSignals = parsePastedPaymentSignals({
        text,
        rawPaymentText: rawPaymentMethod,
        courier: resolvePastedCourier(rawCourier),
        totalAmount: totalAmount === null ? (fallbackTotalAmount || null) : totalAmount
    });
    const overpaymentAmount = paymentSignals.overpaymentAmount;
    const underpaymentAmount = paymentSignals.underpaymentAmount;

    warnings.push(...parsedItems.warnings);

    const branch = matchReferenceValue(rawBranch, state.references.branches);
    if (rawBranch && !branch) {
        warnings.push(`Branch not matched: ${rawBranch}`);
    }

    const courier = resolvePastedCourier(rawCourier);
    if (rawCourier && !courier) {
        warnings.push(`Courier not matched: ${rawCourier}`);
    }

    const adminResolution = resolvePastedAdmin(rawAdmin);
    const admin = adminResolution.admin;
    if (rawAdmin && !admin) {
        warnings.push(`Admin not matched: ${rawAdmin}`);
    }

    const salesRepresentative = resolvePastedSalesRepresentative({
        rawSalesRepresentative,
        text,
        adminResolution
    });
    if (rawSalesRepresentative && !salesRepresentative) {
        warnings.push(`Sales representative not matched: ${rawSalesRepresentative}`);
    }

    const paymentResolution = resolvePastedPaymentEntries({
        rawPaymentText: rawPaymentMethod,
        paymentSignals,
        totalAmount: totalAmount === null ? (fallbackTotalAmount || null) : totalAmount,
        overpaymentAmount,
        underpaymentAmount,
        courier
    });
    warnings.push(...paymentResolution.warnings);
    const cashBranch = resolvePastedCashBranch({
        rawPaymentText: rawPaymentMethod,
        branch
    });

    if (paymentResolution.entries.some((entry) => entry.method === 'CASH') && !cashBranch.explicitlyMatched) {
        warnings.push('Review cash branch for CASH orders.');
    }

    return {
        rawText: text,
        saleDate: parseTemplateDate(extractTaggedValue(text, ['DATE'])),
        branch,
        cashBranch: cashBranch.value || branch,
        courier,
        admin,
        salesRepresentative,
        clientName: rawClientName,
        clientContact: extractTaggedValue(text, ['CONTACT', 'CONTACT NUMBER']),
        clientAddress: extractTaggedValue(text, ['ADDRESS', 'COMPLETE ADDRESS']),
        note: parsePastedOrderNote(text),
        deliveryFee,
        deliveryFeeToCollect: deliveryFee === null ? null : true,
        paymentEntries: paymentResolution.entries,
        rawPaymentMethod,
        rows: parsedItems.rows,
        unmatchedItemLines: parsedItems.unmatchedLines,
        warnings
    };
}

function parsePastedOrderItems(text) {
    const lines = extractSectionLines(text, ['FINAL ORDER LIST', 'ORDER LIST'], ['TOTAL', 'TOTAL PURCHASE', 'ADMIN', 'REMINDER', 'DEAR CUSTOMERS']);
    const rows = [];
    const warnings = [];
    const unmatchedLines = [];

    lines.forEach((line) => {
        const parsedLine = parsePastedItemLine(line);
        if (!parsedLine) {
            return;
        }

        if (!parsedLine.row) {
            unmatchedLines.push(parsedLine.sourceLine);
            return;
        }

        rows.push(parsedLine.row);
        if (parsedLine.warning) {
            warnings.push(parsedLine.warning);
        }
    });

    const specialRuleResult = applyPastedSpecialItemRules({
        rows,
        lines,
        warnings
    });
    if (specialRuleResult?.resolvedSourceLines?.length) {
        const resolvedLineKeys = new Set(
            specialRuleResult.resolvedSourceLines
                .map((line) => normalizeLooseLookup(line))
                .filter(Boolean)
        );
        for (let index = unmatchedLines.length - 1; index >= 0; index -= 1) {
            if (resolvedLineKeys.has(normalizeLooseLookup(unmatchedLines[index]))) {
                unmatchedLines.splice(index, 1);
            }
        }
    }

    return {
        rows,
        warnings,
        unmatchedLines
    };
}

function applyPastedSpecialItemRules({ rows = [], lines = [], warnings = [] } = {}) {
    const listText = normalizeLooseLookup((lines || []).join('\n'));
    const hasButterfly = normalizedTextIncludes(listText, 'butterfly');
    const resolvedSourceLines = [];

    const tirzepResult = applyTirzepatideCompleteSetRule({
        rows,
        lines,
        hasButterfly,
        warnings
    });
    if (tirzepResult?.resolvedLine) {
        resolvedSourceLines.push(tirzepResult.resolvedLine);
    }

    applyLuminSakuraPairSetRule({
        rows,
        lines,
        hasButterfly
    });

    return {
        resolvedSourceLines: dedupeValues(resolvedSourceLines)
    };
}

function applyLuminSakuraPairSetRule({ rows = [], lines = [], hasButterfly = false } = {}) {
    const pairedLine = (lines || []).find((line) => hasLuminSeoulSignal(line) && hasSakuraKiyoshiSignal(line));
    if (!pairedLine) {
        return;
    }

    const pairedRow = rows.find((row) => isLuminSeoulDripProduct(row?.productName) || isSakuraKiyoshiDripProduct(row?.productName));
    const quantity = Math.max(1, Number(pairedRow?.quantity || findLeadingQuantityFromLine(pairedLine) || 1));
    const preferredSet = hasButterfly ? 'D B' : 'D C';

    const luminVariant = findOrderableVariantByProductAndSet('Lumin Seoul Drip', preferredSet);
    if (luminVariant) {
        upsertParsedRowWithVariant(rows, luminVariant, { quantity });
    }

    const sakuraVariant = findOrderableVariantByProductAndSet('Sakura Kiyoshi Drip', preferredSet);
    if (sakuraVariant) {
        upsertParsedRowWithVariant(rows, sakuraVariant, { quantity });
    }
}

function applyTirzepatideCompleteSetRule({ rows = [], lines = [], hasButterfly = false, warnings = [] } = {}) {
    const completeSetLine = (lines || []).find((line) => isTirzepatideCompleteSetDescriptor(line));
    if (!completeSetLine) {
        return { resolvedLine: '' };
    }

    const quantity = findLeadingQuantityFromLine(completeSetLine);
    const tirzepVariant = findOrderableVariantByProductAndSet('Tirzepatide 30mg', 'M');
    if (tirzepVariant) {
        upsertParsedRowWithVariant(rows, tirzepVariant, { quantity });
    } else {
        warnings.push('Tirzepatide 30mg variant was not found while parsing a complete-set line.');
    }

    const preferredDripSet = hasButterfly ? 'D B' : 'D C';
    const sakuraVariant = findOrderableVariantByProductAndSet('Sakura Kiyoshi Drip', preferredDripSet)
        || findOrderableVariantByProductAndSet('Sakura Kiyoshi Drip');
    if (sakuraVariant) {
        upsertParsedRowWithVariant(rows, sakuraVariant, { quantity });
    } else {
        warnings.push('Sakura Kiyoshi Drip variant was not found while parsing a complete-set line.');
    }

    const hasRequiredRows = rows.some((row) => isTirzepatide30mgProduct(row?.productName))
        && rows.some((row) => isSakuraKiyoshiDripProduct(row?.productName));
    return {
        resolvedLine: hasRequiredRows ? completeSetLine : ''
    };
}

function findOrderableVariantByProductAndSet(productText, setName = '') {
    const productNeedle = normalizeCompactLookup(productText);
    if (!productNeedle) {
        return null;
    }

    const variants = getOrderableInventoryVariants().filter((variant) => {
        const productCompact = normalizeCompactLookup(variant.productName);
        if (!productCompact) {
            return false;
        }

        return productCompact === productNeedle
            || productCompact.includes(productNeedle)
            || productNeedle.includes(productCompact);
    });
    if (!variants.length) {
        return null;
    }

    const setNeedle = normalizeCompactLookup(setName);
    if (setNeedle) {
        const setMatch = variants.find((variant) => normalizeCompactLookup(variant.setName) === setNeedle);
        if (setMatch) {
            return setMatch;
        }
    }

    const exactProductMatch = variants.find((variant) => normalizeCompactLookup(variant.productName) === productNeedle);
    if (exactProductMatch) {
        return exactProductMatch;
    }

    return [...variants].sort((left, right) => getSetRank(left.setName) - getSetRank(right.setName))[0] || null;
}

function upsertParsedRowWithVariant(rows = [], variant = null, { quantity = 1 } = {}) {
    if (!variant) {
        return false;
    }

    const variantProduct = normalizeCompactLookup(variant.productName);
    const variantSet = normalizeCompactLookup(variant.setName);
    const exactIndex = rows.findIndex((row) => (
        normalizeCompactLookup(row?.productName) === variantProduct
        && normalizeCompactLookup(row?.setName) === variantSet
    ));
    if (exactIndex >= 0) {
        return false;
    }

    const productIndex = rows.findIndex((row) => normalizeCompactLookup(row?.productName) === variantProduct);
    if (productIndex >= 0) {
        const existingRow = rows[productIndex];
        rows[productIndex] = buildParsedRowFromVariant(variant, {
            quantity: Math.max(1, Number(existingRow?.quantity || quantity || 1)),
            price: Number(existingRow?.price || 0),
            priceOverride: Boolean(existingRow?.priceOverride)
        });
        return true;
    }

    rows.push(buildParsedRowFromVariant(variant, { quantity }));
    return true;
}

function buildParsedRowFromVariant(variant, { quantity = 1, price = 0, priceOverride = false } = {}) {
    const normalizedQuantity = Math.max(1, Number(quantity || 1));
    const usePriceOverride = Boolean(priceOverride);
    const resolvedPrice = usePriceOverride
        ? Math.max(0, Number(price || 0))
        : Math.max(0, Number(variant?.price || 0));

    return {
        productName: String(variant?.productName || ''),
        setName: String(variant?.setName || ''),
        itemCode: String(variant?.itemCode || ''),
        price: resolvedPrice,
        quantity: normalizedQuantity,
        subtotal: normalizedQuantity * resolvedPrice,
        helper: String(variant?.helper || [variant?.itemCode, variant?.setName].filter(Boolean).join(' | ')),
        priceOverride: usePriceOverride
    };
}

function hasLuminSeoulSignal(value = '') {
    const normalizedValue = normalizeLooseLookup(value);
    return normalizedTextIncludes(normalizedValue, 'lumin seoul drip')
        || normalizedTextIncludes(normalizedValue, 'lumin seoul');
}

function hasSakuraKiyoshiSignal(value = '') {
    const normalizedValue = normalizeLooseLookup(value);
    return normalizedTextIncludes(normalizedValue, 'sakura kiyoshi drip')
        || normalizedTextIncludes(normalizedValue, 'sakura kiyoshi');
}

function isLuminSeoulDripProduct(value = '') {
    const normalizedProduct = normalizeCompactLookup(value);
    return normalizedProduct === normalizeCompactLookup('Lumin Seoul Drip');
}

function isSakuraKiyoshiDripProduct(value = '') {
    const normalizedProduct = normalizeCompactLookup(value);
    return normalizedProduct === normalizeCompactLookup('Sakura Kiyoshi Drip');
}

function isTirzepatide30mgProduct(value = '') {
    const normalizedProduct = normalizeLooseLookup(value);
    return normalizedTextIncludes(normalizedProduct, 'tirzepatide 30mg');
}

function isTirzepatideCompleteSetDescriptor(value = '') {
    const normalizedValue = normalizeLooseLookup(value);
    if (!normalizedValue) {
        return false;
    }

    const hasTirzepatide = normalizedTextIncludes(normalizedValue, 'tirzepatide 30mg');
    if (!hasTirzepatide) {
        return false;
    }

    return hasSakuraKiyoshiSignal(normalizedValue);
}

function findLeadingQuantityFromLine(value = '') {
    const normalizedValue = stripLeadingDecorators(value);
    const quantityMatch = normalizedValue.match(/^\s*(\d+(?:\.\d+)?)\s*(?:vials?|bottles?|case(?:s)?|box(?:es)?|pcs?|pieces?|sets?|units?)?\b/i);
    return quantityMatch ? Math.max(1, Number(quantityMatch[1] || 1)) : 1;
}

function parsePastedItemLine(line) {
    const sourceLine = normalizeWhitespace(line);
    if (!sourceLine || startsWithSectionMarker(sourceLine, ['TOTAL', 'ADMIN', 'REMINDER'])) {
        return null;
    }

    const trimmedLine = sourceLine.replace(/^[\-\*\u2022]+\s*/, '');
    const lineTotalMatch = trimmedLine.match(/-\s*(?:PHP|P|â‚±)?\s*([\d,]+(?:\.\d{1,2})?)\s*$/i);
    const unitPriceMatch = trimmedLine.match(/\((?:PHP|P|â‚±)?\s*([\d,]+(?:\.\d{1,2})?)\)/i);
    const quantityMatch = trimmedLine.match(/^\s*(\d+(?:\.\d+)?)\s*(case(?:s)?|box(?:es)?|bottles?|pcs?|pieces?|sets?|units?)?\s+/i);
    const parsedQuantity = quantityMatch ? Math.max(1, Number(quantityMatch[1])) : 1;
    const quantityUnit = quantityMatch ? normalizeLooseLookup(quantityMatch[2] || '') : '';
    const unitPrice = unitPriceMatch ? parseMoneyValue(unitPriceMatch[1]) : null;
    const lineTotal = lineTotalMatch ? parseMoneyValue(lineTotalMatch[1]) : null;

    let descriptor = trimmedLine;
    if (quantityMatch) {
        descriptor = descriptor.slice(quantityMatch[0].length);
    }
    descriptor = descriptor.replace(/\((?:PHP|P|â‚±)?\s*[\d,]+(?:\.\d{1,2})?\)/ig, ' ');
    descriptor = descriptor.replace(/-\s*(?:PHP|P|â‚±)?\s*[\d,]+(?:\.\d{1,2})?\s*$/i, ' ');
    descriptor = normalizeWhitespace(descriptor);

    if (!descriptor) {
        return {
            row: null,
            sourceLine
        };
    }

    const variant = resolvePastedVariant(descriptor, unitPrice);
    if (!variant) {
        return {
            row: null,
            sourceLine
        };
    }

    const quantity = normalizeCasePackQuantity(parsedQuantity, quantityUnit, variant.productName);
    const resolvedUnitPrice = unitPrice !== null ? unitPrice : Number(variant.price || 0);
    const referencePrice = Number(variant.price || 0);

    return {
        sourceLine,
        row: {
            productName: variant.productName,
            setName: variant.setName,
            itemCode: variant.itemCode,
            price: resolvedUnitPrice,
            quantity,
            subtotal: Math.max(1, quantity) * Math.max(0, resolvedUnitPrice),
            helper: variant.helper || [variant.itemCode, variant.setName].filter(Boolean).join(' | '),
            priceOverride: unitPrice !== null && Math.abs(resolvedUnitPrice - referencePrice) > 0.0001
        },
        warning: lineTotal !== null && resolvedUnitPrice > 0 && Math.abs((resolvedUnitPrice * quantity) - lineTotal) > 0.01
            ? `Line total mismatch for "${sourceLine}".`
            : ''
    };
}

function resolvePastedVariant(descriptor, unitPrice = null) {
    const variantEntries = getOrderableInventoryVariants();
    if (!variantEntries.length) {
        return null;
    }

    const setHint = extractPastedSetHint(descriptor);
    const productHint = normalizeWhitespace(setHint.productText || descriptor);

    let bestMatch = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    variantEntries.forEach((variant) => {
        const score = scorePastedVariantMatch(variant, {
            descriptor,
            productHint,
            setHint: setHint.setName,
            unitPrice
        });

        if (score > bestScore) {
            bestScore = score;
            bestMatch = variant;
        }
    });

    return bestScore >= 60 ? bestMatch : null;
}

function scorePastedVariantMatch(variant, { descriptor = '', productHint = '', setHint = '', unitPrice = null } = {}) {
    const descriptorCompact = normalizeCompactLookup(descriptor);
    const productCompact = normalizeCompactLookup(productHint || descriptor);
    const variantProductCompact = normalizeCompactLookup(variant.productName);
    const variantSetCompact = normalizeCompactLookup(variant.setName);
    const variantLineCompact = normalizeCompactLookup(`${variant.productName} ${variant.setName}`);

    if (!variantProductCompact || !descriptorCompact) {
        return Number.NEGATIVE_INFINITY;
    }

    let score = 0;

    if (productCompact === variantProductCompact) {
        score += 120;
    } else if (productCompact.includes(variantProductCompact)) {
        score += 90;
    } else if (variantProductCompact.includes(productCompact) && productCompact) {
        score += 65;
    }

    if (descriptorCompact.includes(variantLineCompact)) {
        score += 70;
    }

    const hintTokens = normalizeLooseLookup(productHint || descriptor).split(' ').filter(Boolean);
    const variantTokens = new Set(normalizeLooseLookup(variant.productName).split(' ').filter(Boolean));
    hintTokens.forEach((token) => {
        if (variantTokens.has(token)) {
            score += 10;
        }
    });

    if (setHint) {
        if (normalizeCompactLookup(setHint) === variantSetCompact) {
            score += 45;
        } else {
            score -= 18;
        }
    }

    if (unitPrice !== null && Number.isFinite(unitPrice)) {
        if (Math.abs(Number(variant.price || 0) - Number(unitPrice)) < 0.0001) {
            score += 28;
        } else {
            score -= Math.min(24, Math.abs(Number(variant.price || 0) - Number(unitPrice)) / 40);
        }
    }

    return score;
}

function extractPastedSetHint(descriptor) {
    const normalizedDescriptor = normalizeWhitespace(descriptor);
    const compactDescriptor = normalizeCompactLookup(normalizedDescriptor);
    const looseDescriptor = normalizeLooseLookup(normalizedDescriptor);
    const setValues = [...new Set(
        getOrderableInventoryVariants()
            .map((variant) => variant.setName)
            .filter(Boolean)
    )].sort((left, right) => normalizeCompactLookup(right).length - normalizeCompactLookup(left).length);

    const exactSet = setValues.find((setName) => {
        const compactSet = normalizeCompactLookup(setName);
        if (!compactSet) {
            return false;
        }

        if (compactSet.length >= 2 && compactDescriptor.includes(compactSet)) {
            return true;
        }

        return matchesLooseSetToken(looseDescriptor, setName);
    });
    if (exactSet) {
        return {
            setName: exactSet,
            productText: stripPastedProductDecorators(normalizedDescriptor)
        };
    }

    for (const alias of PASTED_SET_ALIASES) {
        const matchedPattern = alias.patterns.find((pattern) => pattern.test(normalizedDescriptor));
        if (!matchedPattern) {
            continue;
        }

        return {
            setName: alias.setName,
            productText: stripPastedProductDecorators(normalizeWhitespace(normalizedDescriptor.replace(matchedPattern, ' ')))
        };
    }

    if (hasSakuraKiyoshiSignal(normalizedDescriptor)) {
        return {
            setName: normalizedTextIncludes(looseDescriptor, 'butterfly') ? 'D B' : 'D C',
            productText: stripPastedProductDecorators(normalizedDescriptor)
        };
    }

    return {
        setName: '',
        productText: normalizedDescriptor
    };
}

function resolvePastedPaymentEntries({ rawPaymentText = '', totalAmount = null, overpaymentAmount = 0, underpaymentAmount = 0, courier = '' } = {}) {
    const warnings = [];
    const matchedMethods = matchPaymentMethods(rawPaymentText, courier);
    const payableAmount = totalAmount === null
        ? 0
        : Math.max(Number(totalAmount || 0) + Number(overpaymentAmount || 0) - Number(underpaymentAmount || 0), 0);
    const payableMethods = matchedMethods.filter((method) => !isZeroAmountPaymentMethod(method));
    let methodsToUse = matchedMethods;

    if (payableMethods.length > 1 && payableAmount > 0) {
        warnings.push('Multiple payment methods detected in pasted text; amount was assigned to the first method only.');
        methodsToUse = methodsToUse.filter((method, index) => {
            if (isZeroAmountPaymentMethod(method)) {
                return true;
            }

            return method === payableMethods[0] && index === methodsToUse.indexOf(payableMethods[0]);
        });
    }

    const firstPayableMethod = methodsToUse.find((method) => !isZeroAmountPaymentMethod(method)) || '';
    const entries = dedupeValues(methodsToUse).map((method) => ({
        method,
        amount: method === firstPayableMethod ? payableAmount : 0
    }));

    if (rawPaymentText && !entries.length) {
        warnings.push(`Payment method not matched: ${rawPaymentText}`);
    }

    return {
        entries,
        warnings
    };
}

function matchPaymentMethods(rawPaymentText, courier = '') {
    const rawText = String(rawPaymentText || '').trim();
    if (!rawText) {
        return [];
    }

    const methods = [];
    const normalizedRaw = normalizeCompactLookup(rawText);
    const knownMethods = [...(state.references.paymentMethods || [])]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .sort((left, right) => normalizeCompactLookup(right).length - normalizeCompactLookup(left).length);

    knownMethods.forEach((method) => {
        const normalizedMethod = normalizeCompactLookup(method);
        if (!normalizedMethod || !normalizedRaw.includes(normalizedMethod) || methods.includes(method)) {
            return;
        }

        methods.push(method);
    });

    PASTED_PAYMENT_METHOD_ALIASES.forEach((alias) => {
        if (methods.includes(alias.method)) {
            return;
        }

        if ((alias.patterns || []).some((pattern) => pattern.test(rawText))) {
            methods.push(alias.method);
        }
    });

    const normalizedCourier = String(courier || '').trim().toUpperCase();
    if (/\bcod\b/i.test(rawText) && normalizedCourier === 'LBC' && !methods.includes('LBC Collection')) {
        methods.push('LBC Collection');
    }
    if (normalizedCourier === 'LALAMOVE' && /\bcash\b/i.test(rawText) && !/\bcod\b/i.test(rawText) && !methods.includes('CASH')) {
        methods.push('CASH');
    }

    if (methods.length) {
        return methods;
    }

    const splitParts = rawText.split(/\s*(?:\+|\/|,|&|\band\b)\s*/i).map((part) => part.trim()).filter(Boolean);
    return dedupeValues(splitParts.map((part) => matchReferenceValue(part, state.references.paymentMethods)).filter(Boolean));
}

function parsePastedOrderNote(text) {
    const lines = extractSectionLines(text, ['TOTAL', 'TOTAL PURCHASE'], ['ADMIN', 'REMINDER', 'DEAR CUSTOMERS']);
    const noteLines = lines
        .map((line) => normalizeWhitespace(line))
        .filter(Boolean)
        .filter((line) => !startsWithSectionMarker(line, ['TOTAL', 'OVERPAYMENT', 'UNDERPAYMENT', 'BALANCE']));

    return noteLines.map(stripWrappingBrackets).filter(Boolean).join(' | ');
}

function resolvePastedCashBranch({ rawPaymentText = '', branch = '' } = {}) {
    const hasCash = matchPaymentMethods(rawPaymentText).includes('CASH');
    if (!hasCash) {
        return {
            value: branch,
            explicitlyMatched: false
        };
    }

    const matchedBranch = matchReferenceValue(rawPaymentText, state.references.branches);
    return {
        value: matchedBranch || branch,
        explicitlyMatched: Boolean(matchedBranch)
    };
}

function resolvePastedAdmin(rawAdmin = '') {
    const normalizedRawAdmin = normalizeLooseLookup(rawAdmin);
    if (normalizedRawAdmin) {
        const aliasMatch = PASTED_ADMIN_ALIASES.find((alias) => (alias.phrases || []).some((phrase) => normalizedTextIncludes(normalizedRawAdmin, phrase)));
        if (aliasMatch) {
            return {
                admin: aliasMatch.admin,
                impliedSalesRepresentative: aliasMatch.salesRepresentative || ''
            };
        }
    }

    return {
        admin: matchReferenceValue(rawAdmin, state.references.admins),
        impliedSalesRepresentative: ''
    };
}

function resolvePastedCourier(rawCourier = '') {
    const normalizedRawCourier = normalizeLooseLookup(rawCourier);
    if (normalizedRawCourier) {
        const aliasMatch = PASTED_COURIER_ALIASES.find((alias) => (alias.phrases || []).some((phrase) => normalizedTextIncludes(normalizedRawCourier, phrase)));
        if (aliasMatch) {
            return aliasMatch.courier;
        }
    }

    return matchReferenceValue(rawCourier, state.references.couriers);
}

function resolvePastedSalesRepresentative({ rawSalesRepresentative = '', text = '', adminResolution = null } = {}) {
    const exactMatch = matchReferenceValue(rawSalesRepresentative, state.references.salesRepresentatives);
    if (exactMatch) {
        return exactMatch;
    }

    const normalizedRawSalesRepresentative = normalizeLooseLookup(rawSalesRepresentative);
    if (normalizedRawSalesRepresentative) {
        const aliasFromField = PASTED_SALES_REP_ALIASES.find((alias) => (alias.phrases || []).some((phrase) => normalizedTextIncludes(normalizedRawSalesRepresentative, phrase)));
        if (aliasFromField) {
            return aliasFromField.salesRepresentative;
        }
    }

    const normalizedText = normalizeLooseLookup(text);
    if (normalizedText) {
        const aliasFromText = PASTED_SALES_REP_ALIASES.find((alias) => (alias.phrases || []).some((phrase) => normalizedTextIncludes(normalizedText, phrase)));
        if (aliasFromText) {
            return aliasFromText.salesRepresentative;
        }
    }

    return adminResolution?.impliedSalesRepresentative || '';
}

function extractSectionLines(text, startMarkers, endMarkers) {
    const lines = String(text || '').split('\n');
    const startIndex = lines.findIndex((line) => startsWithSectionMarker(line, startMarkers));
    if (startIndex === -1) {
        return [];
    }

    let endIndex = lines.length;
    for (let index = startIndex + 1; index < lines.length; index += 1) {
        if (startsWithSectionMarker(lines[index], endMarkers)) {
            endIndex = index;
            break;
        }
    }

    return lines.slice(startIndex + 1, endIndex);
}

function startsWithSectionMarker(line, markers) {
    return (markers || []).some((marker) => new RegExp(`^\\s*${escapeRegExp(marker)}\\b`, 'i').test(String(line || '')));
}

function extractTaggedValue(text, labels) {
    const labelPattern = (labels || []).map(escapeRegExp).join('|');
    if (!labelPattern) {
        return '';
    }

    const match = String(text || '').match(new RegExp(`(?:^|\\n)\\s*(?:${labelPattern})\\s*:\\s*(.+)$`, 'im'));
    return match ? match[1].trim() : '';
}

function extractTaggedLineValue(text, labels) {
    return extractTaggedValue(text, labels);
}

function extractSectionLines(text, startMarkers, endMarkers) {
    const lines = String(text || '').split('\n');
    const startIndex = lines.findIndex((line) => startsWithSectionMarker(line, startMarkers));
    if (startIndex === -1) {
        return [];
    }

    let endIndex = lines.length;
    for (let index = startIndex + 1; index < lines.length; index += 1) {
        if (startsWithSectionMarker(lines[index], endMarkers)) {
            endIndex = index;
            break;
        }
    }

    return lines.slice(startIndex + 1, endIndex);
}

function startsWithSectionMarker(line, markers) {
    const normalizedLine = normalizeLooseLookup(stripLeadingDecorators(line));
    return (markers || []).some((marker) => {
        const normalizedMarker = normalizeLooseLookup(marker);
        return normalizedLine === normalizedMarker || normalizedLine.startsWith(`${normalizedMarker} `);
    });
}

function extractTaggedValue(text, labels) {
    const normalizedLabels = (labels || []).map((label) => normalizeLooseLookup(label)).filter(Boolean);
    if (!normalizedLabels.length) {
        return '';
    }

    const stopMarkers = [
        'FINAL ORDER LIST',
        'ORDER LIST',
        'TOTAL',
        'TOTAL PURCHASE',
        'OVERPAYMENT',
        'UNDERPAYMENT',
        'BALANCE',
        'REMINDER',
        'DEAR CUSTOMERS'
    ];
    const rawLabelPatterns = (labels || [])
        .map((label) => String(label || '').trim())
        .filter(Boolean)
        .map((label) => ({
            label: normalizeLooseLookup(label),
            pattern: new RegExp(`^\\s*${escapeRegExp(label)}\\s*(?:(?:[:\\uFF1A-])\\s*(.*)|\\s+(.+))$`, 'i')
        }));

    const lines = String(text || '').split('\n');
    for (let index = 0; index < lines.length; index += 1) {
        const strippedLine = stripLeadingDecorators(lines[index]);
        if (!strippedLine) {
            continue;
        }

        let matchedLabel = '';
        let valuePart = '';

        for (const entry of rawLabelPatterns) {
            const directMatch = strippedLine.match(entry.pattern);
            if (!directMatch) {
                continue;
            }

            matchedLabel = entry.label;
            valuePart = String(directMatch[1] || directMatch[2] || '').trim();
            break;
        }

        if (!matchedLabel) {
            const separatorMatch = strippedLine.match(/^(.+?)\s*(?:[:\uFF1A-])\s*(.*)$/);
            if (!separatorMatch) {
                continue;
            }

            const labelPart = normalizeLooseLookup(separatorMatch[1]);
            const alignedLabel = normalizedLabels.find((label) => labelPart === label || labelPart.endsWith(` ${label}`));
            if (!alignedLabel) {
                continue;
            }

            matchedLabel = alignedLabel;
            valuePart = String(separatorMatch[2] || '').trim();
        }

        if (!normalizedLabels.includes(matchedLabel)) {
            continue;
        }

        if (valuePart) {
            return valuePart;
        }

        for (let lookAhead = index + 1; lookAhead < lines.length; lookAhead += 1) {
            const nextLine = stripLeadingDecorators(lines[lookAhead]);
            if (!nextLine) {
                continue;
            }

            if (startsWithSectionMarker(nextLine, stopMarkers)) {
                break;
            }

            const nextLabelMatch = nextLine.match(/^(.+?)\s*(?:[:\uFF1A-])\s*(.*)$/);
            if (nextLabelMatch) {
                const nextLabel = normalizeLooseLookup(nextLabelMatch[1]);
                const isAnotherTagLine = normalizedLabels.some((label) => nextLabel === label || nextLabel.endsWith(` ${label}`));
                if (isAnotherTagLine) {
                    break;
                }
            }

            return nextLine;
        }
    }

    return '';
}
function extractTaggedLineValue(text, labels) {
    const normalizedLabels = (labels || []).map((label) => normalizeLooseLookup(label)).filter(Boolean);
    if (!normalizedLabels.length) {
        return '';
    }

    const lines = String(text || '').split('\n');
    for (const line of lines) {
        const strippedLine = stripLeadingDecorators(line);
        const normalizedLine = normalizeLooseLookup(strippedLine);
        if (!normalizedLine) {
            continue;
        }

        const matchedLabel = normalizedLabels.find((label) => normalizedLine.startsWith(label));
        if (!matchedLabel) {
            continue;
        }

        return strippedLine;
    }

    return '';
}

function parseTemplateDate(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) {
        return '';
    }

    const parsed = new Date(rawValue);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseMoneyValue(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) {
        return null;
    }

    const normalized = rawValue.replace(/[^\d.-]/g, '');
    if (!normalized) {
        return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseBooleanLike(value, fallback = false) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return fallback;
    }
    if (typeof value === 'boolean') {
        return value;
    }

    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parsePastedDeliveryFee(text) {
    const taggedFee = parseMoneyValue(extractTaggedValue(text, ['DELIVERY FEE', 'DF']));
    if (taggedFee !== null) {
        return taggedFee;
    }

    const lines = String(text || '').split('\n');
    for (const line of lines) {
        const strippedLine = stripLeadingDecorators(line);
        const normalizedLine = normalizeLooseLookup(strippedLine);
        if (!normalizedLine) {
            continue;
        }

        const looksLikeDeliveryFee = normalizedLine.includes('df only')
            || normalizedLine.startsWith('df ')
            || normalizedLine.includes('delivery fee')
            || normalizedLine.includes('shipping fee')
            || normalizedLine.includes('+sf')
            || normalizedLine.endsWith(' sf')
            || normalizedLine.includes(' sf ');
        if (!looksLikeDeliveryFee) {
            continue;
        }

        const amount = parseMoneyValue(strippedLine);
        if (amount !== null) {
            return amount;
        }
    }

    return null;
}

function parsePastedPaymentSignals({ text = '', rawPaymentText = '', courier = '', totalAmount = null } = {}) {
    const entries = [];
    let overpaymentAmount = parseMoneyValue(extractTaggedLineValue(text, ['OVERPAYMENT'])) || 0;
    let underpaymentAmount = parseMoneyValue(extractTaggedLineValue(text, ['UNDERPAYMENT'])) || 0;
    const lines = String(text || '').split('\n');

    lines.forEach((line) => {
        const strippedLine = stripLeadingDecorators(line);
        const normalizedLine = normalizeLooseLookup(strippedLine);
        if (!normalizedLine) {
            return;
        }

        const amount = parseMoneyValue(strippedLine);
        if (amount === null) {
            return;
        }

        if (normalizedLine.startsWith('dp ') || normalizedLine.includes(' down payment') || normalizedLine.includes(' downpayment')) {
            const payableMethods = matchPaymentMethods(strippedLine, courier).filter((method) => !isZeroAmountPaymentMethod(method));
            const fallbackMethod = matchPaymentMethods(rawPaymentText, courier).filter((method) => !isZeroAmountPaymentMethod(method))[0] || '';
            const method = payableMethods[0] || fallbackMethod;
            if (method) {
                entries.push({ method, amount });
            }
            return;
        }

        if (normalizedLine.startsWith('total cod') || normalizedLine.startsWith('cod ')) {
            underpaymentAmount = amount;
        }

        if (normalizedLine.startsWith('balance')) {
            underpaymentAmount = amount;
        }
    });

    if (!underpaymentAmount && totalAmount !== null) {
        const paidAmount = entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
        if (paidAmount > 0 && paidAmount < Number(totalAmount || 0)) {
            underpaymentAmount = Math.max(Number(totalAmount || 0) - paidAmount, 0);
        }
    }

    return {
        entries,
        overpaymentAmount,
        underpaymentAmount
    };
}

function resolvePastedPaymentEntries({ rawPaymentText = '', paymentSignals = null, totalAmount = null, overpaymentAmount = 0, underpaymentAmount = 0, courier = '' } = {}) {
    const warnings = [];
    const matchedMethods = matchPaymentMethods(rawPaymentText, courier);
    const signalEntries = Array.isArray(paymentSignals?.entries) ? paymentSignals.entries : [];
    const signalEntriesMap = new Map();

    signalEntries.forEach((entry) => {
        const method = String(entry?.method || '').trim();
        if (!method || signalEntriesMap.has(method)) {
            return;
        }

        signalEntriesMap.set(method, {
            method,
            amount: Math.max(0, Number(entry?.amount || 0))
        });
    });

    matchedMethods.forEach((method) => {
        if (!signalEntriesMap.has(method)) {
            signalEntriesMap.set(method, {
                method,
                amount: 0
            });
        }
    });

    const payableEntries = [...signalEntriesMap.values()].filter((entry) => !isZeroAmountPaymentMethod(entry.method) && entry.amount > 0);
    if (payableEntries.length) {
        return {
            entries: [...signalEntriesMap.values()],
            warnings
        };
    }

    const payableAmount = totalAmount === null
        ? 0
        : Math.max(Number(totalAmount || 0) + Number(overpaymentAmount || 0) - Number(underpaymentAmount || 0), 0);
    const payableMethods = matchedMethods.filter((method) => !isZeroAmountPaymentMethod(method));
    let methodsToUse = matchedMethods;

    if (payableMethods.length > 1 && payableAmount > 0) {
        warnings.push('Multiple payment methods detected in pasted text; amount was assigned to the first method only.');
        methodsToUse = methodsToUse.filter((method, index) => {
            if (isZeroAmountPaymentMethod(method)) {
                return true;
            }

            return method === payableMethods[0] && index === methodsToUse.indexOf(payableMethods[0]);
        });
    }

    const firstPayableMethod = methodsToUse.find((method) => !isZeroAmountPaymentMethod(method)) || '';
    const entries = dedupeValues(methodsToUse).map((method) => ({
        method,
        amount: method === firstPayableMethod ? payableAmount : 0
    }));

    if (rawPaymentText && !entries.length) {
        warnings.push(`Payment method not matched: ${rawPaymentText}`);
    }

    return {
        entries,
        warnings
    };
}

function parsePastedItemLine(line) {
    const sourceLine = normalizeWhitespace(line);
    if (!sourceLine || startsWithSectionMarker(sourceLine, ['TOTAL', 'ADMIN', 'REMINDER'])) {
        return null;
    }

    const trimmedLine = sourceLine.replace(/^[\-\*\u2022]+\s*/, '');
    const moneyPattern = '(?:PHP|P|\\u20b1)?\\s*([\\d,]+(?:\\.\\d{1,2})?)';
    const lineTotalMatch = trimmedLine.match(new RegExp(`-\\s*${moneyPattern}\\s*$`, 'i'));
    const freeLineMatch = trimmedLine.match(/-\s*free\s*$/i);
    const unitPriceMatch = trimmedLine.match(new RegExp(`\\(${moneyPattern}\\)`, 'i'));
    const quantityMatch = trimmedLine.match(/^\s*(\d+(?:\.\d+)?)\s*(case(?:s)?|box(?:es)?|bottles?|pcs?|pieces?|sets?|units?)?\s+/i);

    const parsedQuantity = quantityMatch ? Math.max(1, Number(quantityMatch[1])) : 1;
    const quantityUnit = quantityMatch ? normalizeLooseLookup(quantityMatch[2] || '') : '';
    const unitPrice = unitPriceMatch ? parseMoneyValue(unitPriceMatch[1]) : null;
    const lineTotal = lineTotalMatch ? parseMoneyValue(lineTotalMatch[1]) : (freeLineMatch ? 0 : null);

    let descriptor = trimmedLine;
    if (quantityMatch) {
        descriptor = descriptor.slice(quantityMatch[0].length);
    }
    descriptor = descriptor.replace(new RegExp(`\\(${moneyPattern}\\)`, 'ig'), ' ');
    descriptor = descriptor.replace(new RegExp(`-\\s*${moneyPattern}\\s*$`, 'i'), ' ');
    descriptor = descriptor.replace(/-\s*free\s*$/i, ' ');
    descriptor = normalizeWhitespace(descriptor);

    if (!descriptor) {
        return { row: null, sourceLine };
    }

    const variant = resolvePastedVariant(descriptor, {
        unitPrice,
        quantity: parsedQuantity,
        quantityUnit,
        lineTotal
    });
    if (!variant) {
        return { row: null, sourceLine };
    }

    const quantity = normalizeCasePackQuantity(parsedQuantity, quantityUnit, variant.productName);
    const resolvedUnitPrice = unitPrice !== null
        ? unitPrice
        : (lineTotal !== null && quantity > 0 ? lineTotal / quantity : Number(variant.price || 0));
    const referencePrice = Number(variant.price || 0);

    return {
        sourceLine,
        row: {
            productName: variant.productName,
            setName: variant.setName,
            itemCode: variant.itemCode,
            price: resolvedUnitPrice,
            quantity,
            subtotal: Math.max(1, quantity) * Math.max(0, resolvedUnitPrice),
            helper: variant.helper || [variant.itemCode, variant.setName].filter(Boolean).join(' | '),
            priceOverride: Math.abs(resolvedUnitPrice - referencePrice) > 0.0001
        },
        warning: lineTotal !== null && resolvedUnitPrice > 0 && Math.abs((resolvedUnitPrice * quantity) - lineTotal) > 0.01
            ? `Line total mismatch for "${sourceLine}".`
            : ''
    };
}

function resolvePastedVariant(descriptor, options = {}) {
    const variantEntries = getOrderableInventoryVariants();
    if (!variantEntries.length) {
        return null;
    }

    const setHint = extractPastedSetHint(descriptor, options);
    const productHint = stripPastedProductDecorators(normalizeWhitespace(setHint.productText || descriptor));
    const exactProductMatches = findExactPastedProductMatches(variantEntries, productHint);
    const candidateVariants = exactProductMatches.length ? exactProductMatches : variantEntries;

    let bestMatch = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    candidateVariants.forEach((variant) => {
        const score = scorePastedVariantMatch(variant, {
            descriptor,
            productHint,
            setHint: setHint.setName,
            unitPrice: options.unitPrice,
            quantity: options.quantity,
            quantityUnit: options.quantityUnit,
            lineTotal: options.lineTotal
        });

        if (score > bestScore) {
            bestScore = score;
            bestMatch = variant;
        }
    });

    return bestScore >= 60 ? bestMatch : null;
}

function findExactPastedProductMatches(variantEntries = [], productHint = '') {
    const normalizedHint = normalizeLooseLookup(productHint);
    if (!normalizedHint) {
        return [];
    }

    return variantEntries.filter((variant) => normalizeLooseLookup(variant.productName) === normalizedHint);
}

function scorePastedVariantMatch(variant, { descriptor = '', productHint = '', setHint = '', unitPrice = null, quantity = 1, quantityUnit = '', lineTotal = null } = {}) {
    const descriptorCompact = normalizeCompactLookup(descriptor);
    const productCompact = normalizeCompactLookup(productHint || descriptor);
    const variantProductCompact = normalizeCompactLookup(variant.productName);
    const variantSetCompact = normalizeCompactLookup(variant.setName);
    const variantLineCompact = normalizeCompactLookup(`${variant.productName} ${variant.setName}`);

    if (!variantProductCompact || !descriptorCompact) {
        return Number.NEGATIVE_INFINITY;
    }

    let score = 0;

    if (productCompact === variantProductCompact) {
        score += 120;
    } else if (productCompact.includes(variantProductCompact)) {
        score += 90;
    } else if (variantProductCompact.includes(productCompact) && productCompact) {
        score += 65;
    }

    if (descriptorCompact.includes(variantLineCompact)) {
        score += 70;
    }

    const hintTokens = normalizeLooseLookup(productHint || descriptor).split(' ').filter(Boolean);
    const variantTokens = new Set(normalizeLooseLookup(variant.productName).split(' ').filter(Boolean));
    hintTokens.forEach((token) => {
        if (variantTokens.has(token)) {
            score += 10;
        }
    });

    if (setHint) {
        if (normalizeCompactLookup(setHint) === variantSetCompact) {
            score += 70;
        } else {
            score -= 24;
        }
    }

    const candidateUnitPrice = unitPrice !== null
        ? Number(unitPrice)
        : (lineTotal !== null && Number(quantity || 0) > 0 ? Number(lineTotal) / Number(quantity) : null);
    if (candidateUnitPrice !== null && Number.isFinite(candidateUnitPrice)) {
        if (Math.abs(Number(variant.price || 0) - candidateUnitPrice) < 0.0001) {
            score += 28;
        } else {
            score -= Math.min(24, Math.abs(Number(variant.price || 0) - candidateUnitPrice) / 40);
        }
    }

    if (isMedicalSupplyDescriptor(descriptor) && quantityUnit && ['pc', 'pcs', 'piece', 'pieces'].includes(quantityUnit)) {
        score += normalizeCompactLookup(variant.setName) === normalizeCompactLookup(Number(quantity || 0) >= 100 ? 'M' : 'T') ? 38 : -22;
    }

    return score;
}

function extractPastedSetHint(descriptor, { quantity = 1, quantityUnit = '' } = {}) {
    const normalizedDescriptor = normalizeWhitespace(descriptor);
    const compactDescriptor = normalizeCompactLookup(normalizedDescriptor);
    const looseDescriptor = normalizeLooseLookup(normalizedDescriptor);
    const setValues = [...new Set(
        getOrderableInventoryVariants()
            .map((variant) => variant.setName)
            .filter(Boolean)
    )].sort((left, right) => normalizeCompactLookup(right).length - normalizeCompactLookup(left).length);

    const exactSet = setValues.find((setName) => {
        const compactSet = normalizeCompactLookup(setName);
        if (!compactSet) {
            return false;
        }

        if (compactSet.length >= 2 && compactDescriptor.includes(compactSet)) {
            return true;
        }

        return matchesLooseSetToken(looseDescriptor, setName);
    });
    if (exactSet) {
        return {
            setName: exactSet,
            productText: normalizedDescriptor
        };
    }

    for (const alias of PASTED_SET_ALIASES) {
        const matchedPattern = alias.patterns.find((pattern) => pattern.test(normalizedDescriptor));
        if (!matchedPattern) {
            continue;
        }

        return {
            setName: alias.setName,
            productText: normalizeWhitespace(normalizedDescriptor.replace(matchedPattern, ' '))
        };
    }

    if (hasSakuraKiyoshiSignal(normalizedDescriptor)) {
        return {
            setName: normalizedTextIncludes(looseDescriptor, 'butterfly') ? 'D B' : 'D C',
            productText: stripPastedProductDecorators(normalizedDescriptor)
        };
    }

    if (isMedicalSupplyDescriptor(normalizedDescriptor) && ['pc', 'pcs', 'piece', 'pieces', 'box', 'boxes'].includes(quantityUnit)) {
        const inferredSet = ['pc', 'pcs', 'piece', 'pieces'].includes(quantityUnit)
            ? (Number(quantity || 0) >= 100 ? 'M' : 'T')
            : 'M';
        return {
            setName: inferredSet,
            productText: stripPastedProductDecorators(normalizedDescriptor)
        };
    }

    return {
        setName: '',
        productText: stripPastedProductDecorators(normalizedDescriptor)
    };
}

function buildPastedOrderStatus(parsed, { usedAi = false, aiProviderLabel = '' } = {}) {
    const parts = [`Pasted order applied with ${parsed.rows.length} item line${parsed.rows.length === 1 ? '' : 's'}.`];
    const reviewItems = [];

    if (usedAi) {
        parts.push(aiProviderLabel ? `AI assist was used (${aiProviderLabel}).` : 'AI assist was used.');
    }
    if (!parsed.salesRepresentative) {
        reviewItems.push('sales representative');
    }
    if (parsed.unmatchedItemLines.length) {
        reviewItems.push(`${parsed.unmatchedItemLines.length} unmatched item line${parsed.unmatchedItemLines.length === 1 ? '' : 's'}`);
    }
    if (parsed.warnings.length) {
        reviewItems.push(parsed.warnings[0]);
    }

    if (reviewItems.length) {
        parts.push(`Review ${reviewItems.join(' and ')}.`);
    }

    return parts.join(' ');
}

function matchReferenceValue(rawValue, options) {
    const normalizedRaw = normalizeLooseLookup(rawValue);
    const compactRaw = normalizeCompactLookup(rawValue);
    if (!normalizedRaw || !compactRaw) {
        return '';
    }

    const entries = (options || [])
        .map((option) => normalizeOption(option).value)
        .filter(Boolean)
        .map((value) => ({
            value,
            loose: normalizeLooseLookup(value),
            compact: normalizeCompactLookup(value)
        }))
        .sort((left, right) => right.compact.length - left.compact.length);

    const exactMatch = entries.find((entry) => entry.loose === normalizedRaw || entry.compact === compactRaw);
    if (exactMatch) {
        return exactMatch.value;
    }

    const containsMatch = entries.find((entry) => compactRaw.includes(entry.compact) || entry.compact.includes(compactRaw));
    return containsMatch ? containsMatch.value : '';
}

function normalizeInventoryVariantEntry(variant) {
    return {
        productName: String(variant.productName || variant.product_name || '').trim(),
        setName: String(variant.setName || variant.set_name || '').trim(),
        itemCode: String(variant.itemCode || variant.item_code || '').trim(),
        price: Number(variant.price || 0),
        helper: String(variant.helper || '').trim(),
        source: String(variant.source || '').trim()
    };
}

function pickVirtualTTemplateVariant(variants = []) {
    return [...variants]
        .filter((variant) => normalizeLookup(variant.setName) !== 't')
        .sort((left, right) => getSetRank(left.setName) - getSetRank(right.setName))[0] || null;
}

function buildVirtualTOrderFormVariant(variant) {
    return {
        ...variant,
        setName: 'T',
        price: 0,
        helper: '',
        source: VIRTUAL_T_VARIANT_SOURCE
    };
}

function getVariantSetOptionDescription(variant = {}) {
    if (String(variant.source || '').trim() === VIRTUAL_T_VARIANT_SOURCE) {
        return 'Order form only';
    }
    return variant.itemCode ? `Code ${variant.itemCode}` : '';
}

function normalizePastedMultilineText(value) {
    return String(value || '')
        .replace(/\r\n?/g, '\n')
        .replace(/\u00a0/g, ' ')
        .trim();
}

function normalizeCompatibilityText(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '');
}

function canonicalizeLookupText(value) {
    let normalized = normalizeCompatibilityText(value).toLowerCase();
    normalized = normalized.replace(/(\d[\d,]{6,})\s*(gx|gs|gr|gh)\b/g, (_match, digits, suffix) => {
        const numericValue = Number(String(digits).replace(/,/g, ''));
        if (!Number.isFinite(numericValue) || numericValue % 1000000 !== 0) {
            return `${digits} ${suffix}`;
        }

        return `${numericValue / 1000000}m ${suffix}`;
    });
    normalized = normalized.replace(/\baquaskin\b/g, 'aqua skin');
    normalized = normalized.replace(/\blumin\s+seoul\b(?!\s+drip)/g, 'lumin seoul drip');
    normalized = normalized.replace(/\bsakura\s+kiyoshi\b(?!\s+drip)/g, 'sakura kiyoshi drip');
    normalized = normalized.replace(/\bmacro\s*set\b/g, 'macroset');
    normalized = normalized.replace(/\bvit(?:amin)?\s*b\s*12\b/g, 'vitamin b');
    normalized = normalized.replace(/\bwith\s+(?:(?:\d+\s*)?(?:box(?:es)?|bottles?|packs?|pcs?|pieces?)\s+)?vit(?:amin)?\s+c\b/g, ' vit c ');
    normalized = normalized.replace(/\bwith\s+vitamin\s+c\b/g, ' vit c ');
    normalized = normalized.replace(/\bwith\s+vit\s+c\b/g, ' vit c ');
    normalized = normalized.replace(/\bw\/\s*(?:(?:\d+\s*)?(?:box(?:es)?|bottles?|packs?|pcs?|pieces?)\s*)?vit(?:amin)?\s*c\b/g, ' vit c ');
    normalized = normalized.replace(/\bw\/\s*vit(?:amin)?\s*c\b/g, ' vit c ');
    normalized = normalized.replace(/\bvit\b/g, 'vitamin');
    normalized = normalized.replace(/\bpush\s+set\b/g, ' push ');
    return normalized;
}

function normalizeWhitespace(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeLooseLookup(value) {
    return normalizeWhitespace(canonicalizeLookupText(value).replace(/[^a-z0-9]+/g, ' '));
}

function normalizeCompactLookup(value) {
    return normalizeLooseLookup(value).replace(/\s+/g, '');
}

function normalizedTextIncludes(normalizedText, phrase) {
    const normalizedPhrase = normalizeLooseLookup(phrase);
    if (!normalizedText || !normalizedPhrase) {
        return false;
    }

    return normalizedText.includes(normalizedPhrase);
}

function matchesLooseSetToken(looseDescriptor, setName) {
    const normalizedDescriptor = normalizeLooseLookup(looseDescriptor);
    const normalizedSet = normalizeLooseLookup(setName);
    if (!normalizedDescriptor || !normalizedSet) {
        return false;
    }

    const pattern = new RegExp(`(?:^|\\s)${normalizedSet.split(' ').map(escapeRegExp).join('\\s+')}(?:$|\\s)`, 'i');
    return pattern.test(normalizedDescriptor);
}

function stripLeadingDecorators(value) {
    return normalizeWhitespace(normalizeCompatibilityText(value).replace(/^[^A-Za-z0-9]+/, ''));
}

function stripPastedProductDecorators(value) {
    return normalizeWhitespace(
        String(value || '')
            .replace(/\bwith\s+free\s+.+$/i, ' ')
            .replace(/\bfree\s+macro\s*set\b/ig, ' ')
            .replace(/\bfree\s+macroset\b/ig, ' ')
            .replace(/\bfree\b/ig, ' ')
            .replace(/\band\s*$/i, ' ')
    );
}

function isMedicalSupplyDescriptor(value) {
    const normalizedValue = normalizeLooseLookup(value);
    return MEDICAL_SUPPLY_HINTS.some((hint) => normalizedTextIncludes(normalizedValue, hint));
}

function normalizeCasePackQuantity(quantity = 1, quantityUnit = '', productName = '') {
    const normalizedQuantity = Math.max(1, Number(quantity || 1));
    const normalizedUnit = normalizeLooseLookup(quantityUnit);
    if (!['case', 'cases'].includes(normalizedUnit)) {
        return normalizedQuantity;
    }

    if (isSakuraKiyoshiDripProduct(productName)) {
        return normalizedQuantity * 20;
    }
    if (isLuminSeoulDripProduct(productName)) {
        return normalizedQuantity * 25;
    }

    return normalizedQuantity;
}

function stripWrappingBrackets(value) {
    return String(value || '').replace(/^\((.*)\)$/, '$1').trim();
}

function dedupeValues(values = []) {
    return [...new Set((values || []).filter(Boolean))];
}

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isZeroAmountPaymentMethod(method) {
    return ZERO_AMOUNT_PAYMENT_METHODS.includes(String(method || '').trim());
}

function sumPaymentMethodBreakdown(entries = []) {
    return entries.reduce((total, entry) => total + Math.max(0, Number(entry?.amount || 0)), 0);
}

function formatNumberInputValue(value) {
    const normalized = Number(value || 0);
    return normalized > 0 ? normalized.toFixed(2) : '';
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

function syncPaymentMethodAvailability() {
    state.controls.paymentMethods.setDisabled(false);
    amountPaidInput.readOnly = true;
    paymentTypeInput.readOnly = true;
}

function commitSelectionInputs() {
    ['branch', 'cashBranch', 'courier', 'admin', 'salesRep', 'clientName'].forEach((key) => {
        state.controls[key]?.commitTypedValue?.();
    });
}

function commitRowSelectionInputs() {
    const rowControls = state.rows
        .map((row) => state.rowControls.get(row.id))
        .filter(Boolean);

    rowControls.forEach((controls) => {
        controls.product?.commitTypedValue?.({ reason: 'submit' });
    });

    rowControls.forEach((controls) => {
        controls.set?.commitTypedValue?.({ reason: 'submit' });
    });
}

function getSuggestedDeliveryFee() {
    const courier = state.controls.courier?.getValue() || '';
    const branch = state.controls.branch?.getValue() || '';

    if (courier !== 'Meet-Up') {
        return 0;
    }

    if (branch === 'Cubao') {
        return 50;
    }

    if (branch === 'Pampanga') {
        return 100;
    }

    return 0;
}

function syncAutoDeliveryFee({ force = false } = {}) {
    const suggested = getSuggestedDeliveryFee();
    const rawValue = deliveryFeeInput.value.trim();
    const currentValue = rawValue ? Number(rawValue) : null;
    const previousSuggested = Number(state.autoDeliveryFee.suggested || 0);
    const matchesPreviousSuggestion = rawValue === ''
        ? previousSuggested === 0
        : Number.isFinite(currentValue) && currentValue === previousSuggested;

    if (force || !state.autoDeliveryFee.isManual || matchesPreviousSuggestion) {
        deliveryFeeInput.value = suggested > 0 ? String(suggested) : '';
        state.autoDeliveryFee.isManual = false;
    }

    state.autoDeliveryFee.suggested = suggested;
}

function handleDeliveryFeeInput() {
    const suggested = getSuggestedDeliveryFee();
    const rawValue = deliveryFeeInput.value.trim();

    state.autoDeliveryFee.suggested = suggested;
    state.autoDeliveryFee.isManual = rawValue !== '' && Number(rawValue) !== suggested;
    renderTotals();
}

function isCourierCollectionManaged(courier) {
    const normalizedCourier = String(courier || '').trim().toUpperCase();
    return normalizedCourier === 'LBC' || normalizedCourier === 'LALAMOVE';
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

function resolvePaymentMethods(summary) {
    const methods = state.controls.paymentMethods.getEntries().map((entry) => entry.method);
    const collectionMethod = resolveCollectionMethod(state.controls.courier.getValue(), summary.remainingAmount);

    if (collectionMethod && !methods.includes(collectionMethod)) {
        methods.push(collectionMethod);
    }

    if (!methods.length && summary.amountPaid > 0 && state.controls.courier.getValue() === 'Lalamove') {
        methods.push('CASH');
    }

    return methods;
}

function isAllowedValue(value, options) {
    return (options || []).some((option) => normalizeLookup(normalizeOption(option).value) === normalizeLookup(value));
}

function hasReferenceOptions(options) {
    return Array.isArray(options) && options.length > 0;
}

function renderTotals() {
    const summary = computeSummary();
    const totalDisplay = formatMoney(summary.orderTotal);
    const collectionDisplay = formatMoney(summary.collectionAmount);
    const collectionMethod = resolveCollectionMethod(state.controls.courier.getValue(), summary.remainingAmount);
    const hasBalanceAlert = summary.underpaymentAmount > 0 || summary.collectionAmount > 0;

    orderTotalValue.textContent = totalDisplay;
    footerTotalValue.textContent = totalDisplay;
    heroCollectionValue.textContent = collectionDisplay;
    footerCollectionValue.textContent = collectionDisplay;
    paymentTypeInput.value = summary.paymentType || '';
    amountPaidInput.value = formatNumberInputValue(summary.amountPaid);
    collectionInput.value = collectionDisplay;
    underpaymentInput.value = formatMoney(summary.underpaymentAmount);
    overpaymentInput.value = formatMoney(summary.overpaymentAmount);

    heroTotalMeta.textContent = summary.baseTotal > 0
        ? `${summary.itemCount} item row${summary.itemCount === 1 ? '' : 's'} ready`
        : 'Add at least one item';
    heroPaymentMeta.textContent = summary.collectionAmount > 0
        ? collectionMethod
            ? `${collectionMethod} ${formatMoney(summary.collectionAmount)}`
            : `Balance ${formatMoney(summary.collectionAmount)}`
        : summary.overpaymentAmount > 0
            ? `Overpayment ${formatMoney(summary.overpaymentAmount)}`
            : 'No balance';

    heroTotalCard.classList.toggle('warn', hasBalanceAlert);
    heroCollectionCard.classList.toggle('warn', hasBalanceAlert);

    pulseCard(heroTotalCard);
    pulseCard(heroCollectionCard);
    renderQuickPos();
    scheduleOrderFormDraftSave();
}

function computeSummary() {
    const baseTotal = state.rows.reduce((sum, row) => sum + Number(row.subtotal || 0), 0);
    const itemCount = getPreparedItems({ allowIncomplete: false }).filter((item) => item.isComplete).length;
    const amountPaid = sumPaymentMethodBreakdown(state.controls.paymentMethods.getEntries());
    const deliveryFee = Math.max(0, Number(deliveryFeeInput.value || 0));
    const orderTotal = baseTotal + (deliveryFeeToggle.checked ? deliveryFee : 0);
    const remainingAmount = Math.max(orderTotal - amountPaid, 0);
    const useCourierCollection = isCourierCollectionManaged(state.controls.courier.getValue()) && remainingAmount > 0;
    const paymentType = resolvePaymentType({ itemCount, orderTotal, amountPaid });

    let underpaymentAmount = 0;
    let overpaymentAmount = 0;
    const collectionAmount = remainingAmount;

    underpaymentAmount = useCourierCollection ? 0 : remainingAmount;
    overpaymentAmount = Math.max(amountPaid - orderTotal, 0);

    return {
        itemCount,
        baseTotal,
        orderTotal,
        amountPaid,
        deliveryFee,
        remainingAmount,
        collectionAmount,
        underpaymentAmount,
        overpaymentAmount,
        paymentType,
        deliveryFeeToCollect: deliveryFeeToggle.checked
    };
}

function resolvePaymentType({ itemCount = 0, orderTotal = 0, amountPaid = 0 } = {}) {
    const normalizedItemCount = Number(itemCount || 0);
    const normalizedOrderTotal = Number(orderTotal || 0);
    const normalizedAmountPaid = Number(amountPaid || 0);

    if (normalizedItemCount <= 0 && normalizedOrderTotal <= 0 && normalizedAmountPaid <= 0) {
        return '';
    }

    return normalizedAmountPaid >= normalizedOrderTotal ? 'Full Paid' : 'Partial';
}

function getPreparedItems({ allowIncomplete = false } = {}) {
    return state.rows
        .filter((row) => {
            const hasAnyValue = row.productName || row.setName || row.itemCode || Number(row.price || 0) > 0;
            if (!allowIncomplete && !hasAnyValue) {
                return false;
            }
            return true;
        })
        .map((row) => ({
            row,
            isComplete: Boolean(row.productName && row.setName && row.itemCode && Number(row.quantity || 0) > 0)
        }));
}

function validateOrder() {
    commitSelectionInputs();
    commitRowSelectionInputs();

    const requiresCashBranch = isOrderFieldVisible('cashBranch');
    const requiresSalesRepresentative = isOrderFieldVisible('salesRepresentative');

    if (!state.controls.branch.getValue()) return 'Invoice branch is required.';
    if (!isAllowedValue(state.controls.branch.getValue(), state.references.branches)) return 'Select a valid invoice branch.';
    if (requiresCashBranch && !state.controls.cashBranch.getValue()) return 'Cash branch is required.';
    if (requiresCashBranch && !isAllowedValue(state.controls.cashBranch.getValue(), getCashBranchOptions())) return 'Select a valid cash branch.';
    if (!state.controls.courier.getValue()) return 'Courier is required.';
    if (!isAllowedValue(state.controls.courier.getValue(), state.references.couriers)) return 'Select a valid courier.';
    if (!state.controls.admin.getValue()) return 'Admin is required.';
    if (hasReferenceOptions(state.references.admins) && !isAllowedValue(state.controls.admin.getValue(), state.references.admins)) return 'Select a valid admin.';
    if (requiresSalesRepresentative && !state.controls.salesRep.getValue()) return 'Sales representative is required.';
    if (requiresSalesRepresentative && hasReferenceOptions(state.references.salesRepresentatives) && !isAllowedValue(state.controls.salesRep.getValue(), state.references.salesRepresentatives)) return 'Select a valid sales representative.';
    if (!state.controls.clientName.getValue()) return 'Client name is required.';

    const items = getPreparedItems({ allowIncomplete: true });
    const completeItems = items.filter((item) => item.isComplete);
    const incompleteItem = items.find((item) => !item.isComplete);

    if (!completeItems.length) return 'Add at least one complete product row before creating the order.';
    if (incompleteItem) return `Complete or remove item row ${state.rows.findIndex((entry) => entry.id === incompleteItem.row.id) + 1}.`;

    const summary = computeSummary();
    const paymentEntries = state.controls.paymentMethods.getEntries();
    const resolvedPaymentMethods = resolvePaymentMethods(summary);
    const invalidPaymentEntry = paymentEntries.find((entry) => !isZeroAmountPaymentMethod(entry.method) && Number(entry.amount || 0) <= 0);

    if (invalidPaymentEntry) {
        return `Enter amount for ${invalidPaymentEntry.method}.`;
    }

    if (summary.paymentType === 'Full Paid') {
        if (!resolvedPaymentMethods.length) return 'Full Paid orders require at least one payment method.';
        if (summary.remainingAmount > 0) return 'Full Paid orders cannot have an underpayment.';
    }

    if (summary.paymentType === 'Partial' && summary.amountPaid > 0) {
        if (!resolvedPaymentMethods.length) return 'Partial orders require at least one payment method.';
    }
    return '';
}

async function submitOrder() {
    if (state.editIntentOrderNumber && !state.editingOrderNumber) {
        setStatus(
            `Reload ${state.editIntentOrderNumber} before saving. Edit mode was not restored, and saving now would create a new sale.`,
            true
        );
        return;
    }

    const validationError = validateOrder();
    if (validationError) {
        setStatus(validationError, true);
        return;
    }

    if (!(await ensurePendingClientSubmitAllowed())) {
        setStatus('Review the previous pending receipt first, or continue only after confirming the old balance.', true);
        return;
    }

    const summary = computeSummary();
    const preparedItems = getPreparedItems({ allowIncomplete: true }).map((entry) => ({
        itemSold: entry.row.productName,
        productName: entry.row.productName,
        itemSet: entry.row.setName,
        itemCode: entry.row.itemCode,
        helper: entry.row.helper,
        quantity: Math.max(1, Number(entry.row.quantity || 1)),
        unitPrice: Math.max(0, Number(entry.row.price || 0))
    }));

    const paymentMethods = resolvePaymentMethods(summary);
    const paymentMethodBreakdown = state.controls.paymentMethods.getEntries();
    const isEditing = Boolean(state.editingOrderNumber);
    const cashBranchValue = isOrderFieldVisible('cashBranch')
        ? (state.controls.cashBranch.getValue() || state.controls.branch.getValue())
        : state.controls.branch.getValue();
    const salesRepresentativeValue = isOrderFieldVisible('salesRepresentative')
        ? state.controls.salesRep.getValue()
        : (state.references.salesRepresentatives?.[0] || '');
    const noteValue = isOrderFieldVisible('note') ? noteInput.value.trim() : '';
    const shouldIncludeClientContact = isElementVisible(fieldClientContact);
    const shouldIncludeClientAddress = isElementVisible(fieldClientAddress);
    const payload = {
        orderNumber: orderNumberInput.value.trim(),
        saleDate: saleDateInput.value,
        branch: state.controls.branch.getValue(),
        cashBranch: cashBranchValue,
        courier: state.controls.courier.getValue(),
        paymentType: summary.paymentType,
        paymentMethods,
        paymentMethod: paymentMethods.join(' + '),
        paymentOption: paymentMethods.join(' + '),
        paymentMethodBreakdown,
        adminName: state.controls.admin.getValue(),
        salesRepresentative: salesRepresentativeValue,
        clientName: state.controls.clientName.getValue(),
        clientContact: shouldIncludeClientContact ? clientContactInput.value.trim() : '',
        clientAddress: shouldIncludeClientAddress ? clientAddressInput.value.trim() : '',
        amountPaid: summary.amountPaid,
        paymentAmount: summary.amountPaid,
        deliveryFee: summary.deliveryFee,
        deliveryFeeToCollect: summary.deliveryFeeToCollect,
        collectionAmount: summary.collectionAmount,
        overpaymentAmount: summary.overpaymentAmount,
        underpaymentAmount: summary.underpaymentAmount,
        baseTotal: summary.baseTotal,
        orderTotal: summary.orderTotal,
        inventoryDeducted: Boolean(inventoryDeductToggle?.checked ?? true),
        note: noteValue,
        items: preparedItems
    };

    submitOrderBtn.disabled = true;
    setStatus(isEditing ? 'Updating order...' : 'Creating order...', false);

    try {
        const result = isEditing
            ? await appClient.updateOrder(state.editingOrderNumber, payload)
            : await appClient.createOrder(payload);
        invalidateStockCache();
        clearOrderFormDraft({
            orderNumber: isEditing ? (state.editingOrderNumber || state.editIntentOrderNumber) : '',
            scope: isEditing ? '' : ORDER_FORM_DRAFT_NEW_SCOPE
        });
        const receiptSnapshot = buildReceiptSnapshot(payload, result);
        await loadClientsFresh();
        openReceiptModal(receiptSnapshot);
        await loadOrderForEditing(
            result.orderNumber || result.receiptNumber || state.editingOrderNumber || payload.orderNumber,
            { statusMessage: '' }
        );
        setStatus(`${isEditing ? 'Order updated successfully.' : 'Order created successfully.'} ${result.orderNumber || result.receiptNumber || ''}`.trim(), false);
    } catch (error) {
        console.error(`Failed to ${isEditing ? 'update' : 'create'} order:`, error);
        setStatus(error.message || `Unable to ${isEditing ? 'update' : 'create'} order.`, true);
    } finally {
        submitOrderBtn.disabled = false;
    }
}

async function loadClientsFresh() {
    try {
        const payload = await appClient.listClients('');
        state.clients = Array.isArray(payload?.items) ? payload.items : state.clients;
    } catch (error) {
        console.error('Failed to refresh clients after save:', error);
    }
}

async function deleteEditingOrder() {
    if (!state.editingOrderNumber) {
        return;
    }

    const orderNumber = state.editingOrderNumber;
    if (!window.confirm(`Delete saved order ${orderNumber}? This will also restore its stock quantities.`)) {
        return;
    }

    submitOrderBtn.disabled = true;
    deleteOrderBtn.disabled = true;
    setStatus(`Deleting ${orderNumber}...`, false);

    try {
        const result = await appClient.deleteOrder(orderNumber);
        invalidateStockCache();
        clearOrderFormDraft({ orderNumber });
        await resetOrderForm('');
        setStatus(`Deleted ${result.orderNumber || result.receiptNumber || orderNumber}.`, false);
    } catch (error) {
        console.error('Failed to delete order:', error);
        setStatus(error.message || 'Unable to delete order.', true);
    } finally {
        submitOrderBtn.disabled = false;
        deleteOrderBtn.disabled = false;
    }
}

function buildReceiptSnapshot(payload, result) {
    const paymentMethodBreakdown = Array.isArray(result?.paymentMethodBreakdown) && result.paymentMethodBreakdown.length
        ? result.paymentMethodBreakdown
        : Array.isArray(payload.paymentMethodBreakdown)
            ? payload.paymentMethodBreakdown
            : [];
    const paymentMethods = Array.isArray(result?.paymentMethods) && result.paymentMethods.length
        ? result.paymentMethods
        : Array.isArray(payload.paymentMethods)
            ? payload.paymentMethods
            : [];
    const baseTotal = Number(payload.baseTotal ?? payload.orderTotal ?? 0);
    const orderTotal = Number(result?.orderTotal ?? payload.orderTotal ?? payload.baseTotal ?? 0);
    const amountPaid = Number(result?.paymentAmount ?? payload.paymentAmount ?? payload.amountPaid ?? 0);
    const remainingAmount = Number(result?.remainingAmount ?? Math.max(orderTotal - amountPaid, 0));
    const displayPaymentEntries = buildDisplayPaymentEntries(paymentMethodBreakdown, {
        courier: payload.courier,
        baseTotal,
        orderTotal,
        amountPaid,
        remainingAmount
    });
    const displayPaymentLabels = paymentMethods.map((method) => getDisplayPaymentMethodLabel(method, payload.courier));

    return {
        receiptNumber: result?.receiptNumber || payload.orderNumber || 'Receipt',
        orderNumber: result?.orderNumber || payload.orderNumber || '-',
        saleDate: payload.saleDate,
        branch: payload.branch,
        cashBranch: result?.cashBranch || payload.cashBranch || payload.branch,
        courier: payload.courier,
        paymentType: result?.paymentType || payload.paymentType,
        paymentMethod: buildPaymentMethodDisplay(displayPaymentEntries, displayPaymentLabels) || result?.paymentMethod || payload.paymentMethod || payload.paymentOption || '-',
        paymentMethodBreakdown,
        adminName: payload.adminName,
        salesRepresentative: payload.salesRepresentative,
        clientName: payload.clientName,
        clientContact: payload.clientContact,
        clientAddress: payload.clientAddress,
        note: payload.note,
        items: (payload.items || []).map((item, index) => ({
            itemSold: item.itemSold || item.productName || '-',
            itemSet: item.itemSet || '-',
            itemCode: item.itemCode || '-',
            compositeDetailText: Array.isArray(result?.items)
                ? String(result.items[index]?.compositeDetailText || result.items[index]?.composite_detail_text || '')
                : '',
            quantity: Number(item.quantity ?? 0),
            unitPrice: Number(item.unitPrice ?? 0),
            subtotal: Number(item.quantity || 0) * Number(item.unitPrice || 0)
        })),
        totals: {
            baseTotal,
            orderTotal,
            amountPaid,
            remainingAmount,
            collectionAmount: Number(result?.collectionAmount ?? payload.collectionAmount ?? 0),
            deliveryFee: Number(result?.deliveryFee ?? payload.deliveryFee ?? 0),
            overpaymentAmount: Number(result?.overpaymentAmount ?? payload.overpaymentAmount ?? 0),
            underpaymentAmount: Number(result?.underpaymentAmount ?? payload.underpaymentAmount ?? 0)
        }
    };
}

function buildReceiptSnapshotFromOrder(order) {
    const baseTotal = Number(order?.baseTotal ?? order?.orderTotal ?? 0);
    const orderTotal = Number(order?.orderTotal ?? order?.baseTotal ?? 0);
    const amountPaid = Number(order?.amountPaid ?? order?.paymentAmount ?? 0);
    const remainingAmount = Number(order?.remainingAmount ?? Math.max(orderTotal - amountPaid, 0));
    const displayPaymentEntries = buildDisplayPaymentEntries(order?.paymentMethodBreakdown || [], {
        courier: order?.courier || '',
        baseTotal,
        orderTotal,
        amountPaid,
        remainingAmount
    });
    const displayPaymentLabels = (order?.paymentMethods || []).map((method) => getDisplayPaymentMethodLabel(method, order?.courier || ''));
    return {
        receiptNumber: order?.receiptNumber || order?.orderNumber || 'Receipt',
        orderNumber: order?.orderNumber || order?.receiptNumber || '-',
        saleDate: order?.saleDate || '',
        branch: order?.branch || '',
        cashBranch: order?.cashBranch || order?.branch || '',
        courier: order?.courier || '',
        paymentType: order?.paymentType || '-',
        paymentMethod: buildPaymentMethodDisplay(displayPaymentEntries, displayPaymentLabels) || order?.paymentMethod || '-',
        paymentMethodBreakdown: Array.isArray(order?.paymentMethodBreakdown) ? order.paymentMethodBreakdown : [],
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
            setStatus(blockedMessage, true);
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
        setStatus('Open a receipt first.', true);
        return;
    }

    const fallbackToPrint = () => {
        setStatus('Opening print dialog for PDF...', false);
        openReceiptPrintPopup(state.lastReceipt, {
            autoPrint: true,
            blockedMessage: 'Allow pop-ups to save the receipt as PDF.'
        });
    };

    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
        setStatus('Loading PDF tools...', false);
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
        setStatus('Preparing PDF...', false);
        const canvas = await renderReceiptPrintCanvas(state.lastReceipt);
        if (!canvas) {
            setStatus('Receipt layout not found. Opening print dialog instead.', true);
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
        setStatus('PDF saved.', false);
    } catch (error) {
        console.error('Failed to generate PDF:', error);
        setStatus('Failed to generate PDF. Opening print dialog instead.', true);
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
        return formatDisplayDate(rawValue);
    }
    if (normalizedFormat === 'upper') {
        return String(rawValue || '-').toUpperCase();
    }

    if (normalizedKey === 'saleDate') {
        return formatDisplayDate(rawValue);
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

function formatDisplayDate(value) {
    if (!value) {
        return '-';
    }

    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime())
        ? String(value)
        : parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
}

function normalizeInventoryDateKey(value) {
    const text = String(value || '').trim();
    if (!text) {
        return '';
    }

    const directMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (directMatch) {
        const parsed = new Date(Number(directMatch[1]), Number(directMatch[2]) - 1, Number(directMatch[3]));
        if (
            parsed.getFullYear() === Number(directMatch[1])
            && (parsed.getMonth() + 1) === Number(directMatch[2])
            && parsed.getDate() === Number(directMatch[3])
        ) {
            return text;
        }
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseInventoryDateKey(value) {
    const normalized = normalizeInventoryDateKey(value);
    if (!normalized) {
        return null;
    }
    const [year, month, day] = normalized.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function getTodayDateKey() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getDaysUntilInventoryExpiry(expirationDate) {
    const expiryKey = normalizeInventoryDateKey(expirationDate);
    if (!expiryKey) {
        return Number.POSITIVE_INFINITY;
    }

    const expiryDate = parseInventoryDateKey(expiryKey);
    const todayDate = parseInventoryDateKey(getTodayDateKey());
    if (!expiryDate || !todayDate) {
        return Number.POSITIVE_INFINITY;
    }

    const diffMs = expiryDate.getTime() - todayDate.getTime();
    return Math.floor(diffMs / 86400000);
}

function isInventoryExpiryWithinCurrentYear(expirationDate) {
    const expiryKey = normalizeInventoryDateKey(expirationDate);
    if (!expiryKey) {
        return false;
    }

    const expiryDate = parseInventoryDateKey(expiryKey);
    const todayDate = parseInventoryDateKey(getTodayDateKey());
    if (!expiryDate || !todayDate) {
        return false;
    }

    return expiryDate >= todayDate && expiryDate.getFullYear() === todayDate.getFullYear();
}

function getDirectStockMetaFromEntry(stockEntry = null) {
    if (!stockEntry) {
        return { label: 'Not tracked', className: 'na', disableSelection: false };
    }

    const quantity = Number(stockEntry.quantity || 0);
    const expirationDate = normalizeInventoryDateKey(stockEntry.expirationDate);
    const daysUntilExpiry = getDaysUntilInventoryExpiry(expirationDate);

    if (expirationDate && daysUntilExpiry < 0) {
        return {
            label: `Expired ${formatDisplayDate(expirationDate)}`,
            className: 'expired',
            disableSelection: true
        };
    }
    if (quantity <= 0) {
        return { label: 'Out of stock', className: 'out', disableSelection: false };
    }
    if (expirationDate && isInventoryExpiryWithinCurrentYear(expirationDate)) {
        return {
            label: daysUntilExpiry === 0
                ? `Near expiry today (${formatDisplayDate(expirationDate)})`
                : (daysUntilExpiry <= NEAR_EXPIRY_DAYS
                    ? `Near expiry ${daysUntilExpiry}d (${formatDisplayDate(expirationDate)})`
                    : `Expires this year (${formatDisplayDate(expirationDate)})`),
            className: 'near-expired',
            disableSelection: false
        };
    }
    if (quantity <= 5) {
        return { label: `Low ${formatQuantity(quantity)}`, className: 'low', disableSelection: false };
    }
    return { label: `In stock ${formatQuantity(quantity)}`, className: 'good', disableSelection: false };
}

function getCompositeRecipeForVariant(productName = '', setName = '', itemCode = '') {
    if (!productName || !setName) {
        return [];
    }

    return state.compositeByVariant.get(buildVariantLookupKey(productName, setName, itemCode))
        || state.compositeByVariant.get(buildVariantLookupKey(productName, setName, ''))
        || [];
}

function getCompositeStockMeta(branchMap, productName = '', setName = '', itemCode = '') {
    const recipe = getCompositeRecipeForVariant(productName, setName, itemCode);
    if (!recipe.length) {
        return null;
    }

    let minReadyQuantity = Number.POSITIVE_INFINITY;
    let hasNearExpiryComponent = false;
    let nearestExpiryLabel = '';

    for (const component of recipe) {
        const stockEntry = branchMap.get(normalizeLookup(component.name));
        if (!stockEntry) {
            return { label: 'Recipe missing stock', className: 'na', disableSelection: false };
        }

        const componentMeta = getDirectStockMetaFromEntry(stockEntry);
        if (componentMeta.className === 'expired') {
            return componentMeta;
        }

        const quantityOnHand = Math.max(0, Number(stockEntry.quantity || 0));
        const requiredQuantity = Math.max(0, Number(component.quantity || 0));
        const readyQuantity = requiredQuantity > 0
            ? Math.floor(quantityOnHand / requiredQuantity)
            : 0;
        minReadyQuantity = Math.min(minReadyQuantity, readyQuantity);

        if (componentMeta.className === 'near-expired') {
            hasNearExpiryComponent = true;
            nearestExpiryLabel = componentMeta.label;
        }
    }

    if (!Number.isFinite(minReadyQuantity)) {
        return { label: 'Recipe not tracked', className: 'na', disableSelection: false };
    }
    if (minReadyQuantity <= 0) {
        return { label: 'Recipe out of stock', className: 'out', disableSelection: false };
    }
    if (hasNearExpiryComponent) {
        return { label: nearestExpiryLabel || 'Recipe near expiry', className: 'near-expired', disableSelection: false };
    }
    if (minReadyQuantity <= 5) {
        return { label: `Recipe low ${formatQuantity(minReadyQuantity)}`, className: 'low', disableSelection: false };
    }
    return { label: `Recipe ready ${formatQuantity(minReadyQuantity)}`, className: 'good', disableSelection: false };
}

function getStockMeta(productName, setName = '', itemCode = '') {
    if (!productName) {
        return { label: 'Select product', className: 'na', disableSelection: false };
    }

    const branch = state.controls.branch?.getValue?.() || '';
    if (!branch) {
        return { label: 'Select branch', className: 'na', disableSelection: false };
    }

    const branchMap = state.stockCacheByBranch.get(branch);
    if (!branchMap) {
        return { label: 'Loading stock...', className: 'na', disableSelection: false };
    }

    const directStockEntry = branchMap.get(normalizeLookup(productName));
    const recipeMeta = getCompositeStockMeta(branchMap, productName, setName, itemCode);
    if (recipeMeta) {
        if (!directStockEntry || Number(directStockEntry.quantity || 0) <= 0) {
            return recipeMeta;
        }
        const directMeta = getDirectStockMetaFromEntry(directStockEntry);
        return directMeta.className === 'good' ? directMeta : recipeMeta;
    }

    return getDirectStockMetaFromEntry(directStockEntry);
}

function pulseCard(element) {
    element.classList.remove('pulse');
    window.clearTimeout(element.__pulseTimer);
    void element.offsetWidth;
    element.classList.add('pulse');
    element.__pulseTimer = window.setTimeout(() => element.classList.remove('pulse'), TOTAL_PULSE_MS);
}

function normalizeLookup(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizeSearch(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function normalizeOption(option) {
    if (typeof option === 'string') {
        return {
            value: option,
            inputValue: option,
            label: option,
            description: '',
            searchText: option,
            disabled: false,
            meta: null
        };
    }

    return {
        value: String(option?.value ?? option?.inputValue ?? ''),
        inputValue: String(option?.inputValue ?? option?.value ?? ''),
        label: String(option?.label ?? option?.value ?? option?.inputValue ?? ''),
        description: String(option?.description ?? ''),
        searchText: String(option?.searchText ?? [option?.label, option?.value, option?.description].filter(Boolean).join(' ')),
        disabled: Boolean(option?.disabled),
        meta: option?.meta ?? null
    };
}

function searchOptions(rawOptions, query) {
    const options = (rawOptions || []).map(normalizeOption).filter((option) => option.value);
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) {
        return options.slice(0, MAX_SUGGESTIONS);
    }

    const tokens = normalizedQuery.split(' ').filter(Boolean);
    return options
        .map((option) => {
            const haystack = normalizeSearch(option.searchText || option.label || option.value);
            if (!tokens.every((token) => haystack.includes(token))) {
                return null;
            }

            let score = 0;
            if (haystack === normalizedQuery) score += 600;
            if (normalizeSearch(option.value) === normalizedQuery) score += 400;
            if (haystack.startsWith(normalizedQuery)) score += 250;
            if (normalizeSearch(option.value).startsWith(normalizedQuery)) score += 180;
            score -= haystack.indexOf(tokens[0]);

            return { option, score };
        })
        .filter(Boolean)
        .sort((left, right) => right.score - left.score || left.option.label.localeCompare(right.option.label))
        .slice(0, MAX_SUGGESTIONS)
        .map((entry) => entry.option);
}

class SearchSelect {
    constructor({ host, placeholder, getOptions, allowCustom = false, disabled = false, onSelect = null, onCommit = null }) {
        this.host = host;
        this.placeholder = placeholder;
        this.getOptions = getOptions;
        this.allowCustom = allowCustom;
        this.onSelect = onSelect;
        this.onCommit = onCommit;
        this.disabled = Boolean(disabled);
        this.value = '';
        this.options = [];
        this.activeIndex = -1;
        this.searchTimer = null;

        this.host.innerHTML = `
            <div class="combo ${this.disabled ? 'is-disabled' : ''}">
                <input type="text" class="combo-input" autocomplete="off" spellcheck="false" placeholder="${appClient.escapeHtml(this.placeholder)}" ${this.disabled ? 'disabled' : ''}>
                <button type="button" class="combo-trigger" tabindex="-1"><i class="fa-solid fa-chevron-down"></i></button>
                <div class="combo-panel" hidden></div>
            </div>
        `;

        this.wrapper = this.host.querySelector('.combo');
        this.input = this.host.querySelector('.combo-input');
        this.trigger = this.host.querySelector('.combo-trigger');
        this.panel = this.host.querySelector('.combo-panel');

        this.bindEvents();
    }

    bindEvents() {
        this.input.addEventListener('focus', () => this.refresh(true));
        this.input.addEventListener('input', () => {
            if (!this.allowCustom && normalizeLookup(this.input.value) !== normalizeLookup(this.value)) {
                this.value = '';
            }
            window.clearTimeout(this.searchTimer);
            this.searchTimer = window.setTimeout(() => this.refresh(true), SEARCH_DEBOUNCE_MS);
        });
        this.input.addEventListener('keydown', (event) => this.handleKeydown(event));
        this.trigger.addEventListener('click', () => {
            if (this.panel.hidden) {
                this.refresh(true);
                this.input.focus();
            } else {
                this.close();
            }
        });
        this.host.addEventListener('focusout', () => {
            window.setTimeout(() => {
                if (!this.host.contains(document.activeElement)) {
                    this.commitTypedValue();
                    this.close();
                }
            }, 0);
        });
        this.panel.addEventListener('mousedown', (event) => event.preventDefault());
    }

    handleKeydown(event) {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (this.panel.hidden) {
                this.refresh(true);
            } else {
                this.moveActive(1);
            }
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (this.panel.hidden) {
                this.refresh(true);
            } else {
                this.moveActive(-1);
            }
            return;
        }

        if (event.key === 'Enter') {
            if (this.panel.hidden) {
                this.refresh(true);
            }

            const activeOption = this.options[this.activeIndex];
            event.preventDefault();
            if (activeOption) {
                this.choose(activeOption, { reason: 'keyboard' });
            } else {
                this.commitTypedValue({ reason: 'keyboard' });
            }
            return;
        }

        if (event.key === 'Tab') {
            this.commitTypedValue({ reason: 'tab' });
            this.close();
            return;
        }

        if (event.key === 'Escape') {
            this.close();
        }
    }

    refresh(openPanel = false) {
        this.options = searchOptions(this.getOptions(), this.input.value);
        this.activeIndex = this.options.findIndex((option) => !option.disabled);
        this.renderPanel();
        if (openPanel) {
            this.open();
        }
    }

    renderPanel() {
        if (!this.options.length) {
            this.panel.innerHTML = '<div class="combo-empty">No matches found.</div>';
            return;
        }

        this.panel.innerHTML = this.options.map((option, index) => `
            <button type="button" class="combo-option ${index === this.activeIndex ? 'is-active' : ''} ${option.disabled ? 'is-disabled' : ''}" data-index="${index}" ${option.disabled ? 'disabled' : ''}>
                ${appClient.escapeHtml(option.label)}
                ${option.description ? `<small>${appClient.escapeHtml(option.description)}</small>` : ''}
            </button>
        `).join('');

        this.panel.querySelectorAll('.combo-option').forEach((button) => {
            button.addEventListener('click', () => {
                const option = this.options[Number(button.dataset.index)];
                if (option) {
                    this.choose(option, { reason: 'mouse' });
                }
            });
        });

        const activeButton = this.panel.querySelector('.combo-option.is-active');
        activeButton?.scrollIntoView({ block: 'nearest' });
    }

    moveActive(direction) {
        if (!this.options.length) {
            return;
        }

        let nextIndex = this.activeIndex;
        for (let attempts = 0; attempts < this.options.length; attempts += 1) {
            nextIndex = (nextIndex + direction + this.options.length) % this.options.length;
            if (!this.options[nextIndex].disabled) {
                this.activeIndex = nextIndex;
                this.renderPanel();
                return;
            }
        }
    }

    choose(option, { silent = false, reason = 'programmatic' } = {}) {
        if (!option || option.disabled) {
            return;
        }

        this.value = option.value;
        this.input.value = option.inputValue || option.value;
        this.close();
        if (!silent && typeof this.onSelect === 'function') {
            this.onSelect(option, this, { reason });
        }
        if (!silent && typeof this.onCommit === 'function') {
            this.onCommit(this.value, option, this, { reason });
        }
    }

    commitTypedValue({ reason = 'blur' } = {}) {
        const typedValue = this.input.value.trim();
        if (!typedValue) {
            this.clear();
            return;
        }

        const exactOption = (this.getOptions() || [])
            .map(normalizeOption)
            .find((option) => normalizeLookup(option.inputValue) === normalizeLookup(typedValue) || normalizeLookup(option.value) === normalizeLookup(typedValue));

        if (exactOption) {
            if (normalizeLookup(this.value) === normalizeLookup(exactOption.value)) {
                this.input.value = exactOption.inputValue || exactOption.value;
                return;
            }
            this.choose(exactOption, { reason });
            return;
        }

        if (this.allowCustom) {
            this.value = typedValue;
            if (typeof this.onCommit === 'function') {
                this.onCommit(this.value, null, this, { reason });
            }
            return;
        }

        this.input.value = this.value || '';
    }

    open() {
        if (this.disabled) {
            return;
        }
        this.wrapper.classList.add('is-open');
        this.panel.hidden = false;
    }

    close() {
        this.wrapper.classList.remove('is-open');
        this.panel.hidden = true;
    }

    setValue(value, { silent = false } = {}) {
        const option = (this.getOptions() || [])
            .map(normalizeOption)
            .find((entry) => normalizeLookup(entry.value) === normalizeLookup(value));

        if (option) {
            if (option.disabled && silent) {
                this.value = option.value;
                this.input.value = option.inputValue || option.value;
                return;
            }
            this.choose(option, { silent });
            return;
        }

        this.value = value || '';
        this.input.value = value || '';
    }

    clear({ silent = false } = {}) {
        this.value = '';
        this.input.value = '';
        if (!silent && typeof this.onSelect === 'function') {
            this.onSelect(null, this, { reason: 'clear' });
        }
    }

    getValue() {
        return this.allowCustom ? (this.input.value.trim() || this.value) : this.value;
    }

    setDisabled(disabled) {
        this.disabled = Boolean(disabled);
        this.wrapper.classList.toggle('is-disabled', this.disabled);
        this.input.disabled = this.disabled;
        this.trigger.disabled = this.disabled;
        if (this.disabled) {
            this.close();
        }
    }
}

class SearchTagSelect {
    constructor({ host, placeholder, getOptions, maxEntries = Number.POSITIVE_INFINITY, onChange = null, onSelect = null }) {
        this.host = host;
        this.placeholder = placeholder;
        this.getOptions = getOptions;
        this.maxEntries = Number.isFinite(maxEntries) ? Math.max(1, Number(maxEntries)) : Number.POSITIVE_INFINITY;
        this.onChange = onChange;
        this.onSelect = onSelect;
        this.entries = [];
        this.options = [];
        this.activeIndex = -1;
        this.disabled = false;
        this.searchTimer = null;

        this.host.innerHTML = `
            <div class="combo">
                <div class="tag-shell">
                    <div class="tag-chip-list"></div>
                    <input type="text" class="tag-input" autocomplete="off" spellcheck="false" placeholder="${appClient.escapeHtml(this.placeholder)}">
                </div>
                <button type="button" class="combo-trigger" tabindex="-1"><i class="fa-solid fa-chevron-down"></i></button>
                <div class="combo-panel" hidden></div>
            </div>
        `;

        this.wrapper = this.host.querySelector('.combo');
        this.shell = this.host.querySelector('.tag-shell');
        this.chipList = this.host.querySelector('.tag-chip-list');
        this.input = this.host.querySelector('.tag-input');
        this.trigger = this.host.querySelector('.combo-trigger');
        this.panel = this.host.querySelector('.combo-panel');

        this.bindEvents();
        this.renderChips();
    }

    bindEvents() {
        this.input.addEventListener('focus', () => this.refresh(true));
        this.input.addEventListener('input', () => {
            window.clearTimeout(this.searchTimer);
            this.searchTimer = window.setTimeout(() => this.refresh(true), SEARCH_DEBOUNCE_MS);
        });
        this.input.addEventListener('keydown', (event) => this.handleKeydown(event));
        this.trigger.addEventListener('click', () => {
            if (this.panel.hidden) {
                this.refresh(true);
                this.input.focus();
            } else {
                this.close();
            }
        });
        this.host.addEventListener('focusout', () => {
            window.setTimeout(() => {
                if (!this.host.contains(document.activeElement)) {
                    this.close();
                }
            }, 0);
        });
        this.panel.addEventListener('mousedown', (event) => event.preventDefault());
    }

    handleKeydown(event) {
        if (this.disabled) {
            return;
        }

        if (event.key === 'Tab') {
            this.close();
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (this.panel.hidden) {
                this.refresh(true);
            } else {
                this.moveActive(1);
            }
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (this.panel.hidden) {
                this.refresh(true);
            } else {
                this.moveActive(-1);
            }
            return;
        }

        if (event.key === 'Enter') {
            if (this.panel.hidden) {
                this.refresh(true);
            }

            const activeOption = this.options[this.activeIndex];
            if (!activeOption) {
                return;
            }

            event.preventDefault();
            this.choose(activeOption, { reason: 'keyboard' });
            return;
        }

        if (event.key === 'Escape') {
            this.close();
        }
    }

    refresh(openPanel = false) {
        const selectedValues = this.getValues();
        const availableOptions = (this.getOptions() || []).filter((option) => !selectedValues.includes(normalizeOption(option).value));
        this.options = searchOptions(availableOptions, this.input.value);
        this.activeIndex = this.options.findIndex((option) => !option.disabled);
        this.renderPanel();
        if (openPanel) {
            this.open();
        }
    }

    renderPanel() {
        if (!this.options.length) {
            this.panel.innerHTML = '<div class="combo-empty">No methods available.</div>';
            return;
        }

        this.panel.innerHTML = this.options.map((option, index) => `
            <button type="button" class="combo-option ${index === this.activeIndex ? 'is-active' : ''}" data-index="${index}">
                ${appClient.escapeHtml(option.label)}
            </button>
        `).join('');

        this.panel.querySelectorAll('.combo-option').forEach((button) => {
            button.addEventListener('click', () => {
                const option = this.options[Number(button.dataset.index)];
                if (option) {
                    this.choose(option, { reason: 'mouse' });
                }
            });
        });

        const activeButton = this.panel.querySelector('.combo-option.is-active');
        activeButton?.scrollIntoView({ block: 'nearest' });
    }

    renderChips() {
        this.chipList.innerHTML = this.entries.map((entry) => `
            <div class="payment-entry-chip">
                <span class="payment-entry-label">${appClient.escapeHtml(entry.value)}</span>
                <input
                    type="number"
                    min="0"
                    step="0.01"
                    class="payment-entry-amount"
                    data-value="${appClient.escapeHtml(entry.value)}"
                    value="${entry.amount > 0 ? Number(entry.amount).toFixed(2) : ''}"
                    placeholder="${isZeroAmountPaymentMethod(entry.value) ? 'Auto 0.00' : '0.00'}"
                    ${isZeroAmountPaymentMethod(entry.value) ? 'readonly' : ''}
                >
                <button type="button" data-value="${appClient.escapeHtml(entry.value)}" title="Remove payment method"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `).join('');

        this.chipList.querySelectorAll('input[data-value]').forEach((input) => {
            input.addEventListener('input', () => {
                const entry = this.entries.find((item) => item.value === input.dataset.value);
                if (!entry || isZeroAmountPaymentMethod(entry.value)) {
                    return;
                }

                entry.amount = Math.max(0, Number(input.value || 0));
                this.notifyChange();
            });
        });

        this.chipList.querySelectorAll('button[data-value]').forEach((button) => {
            button.addEventListener('click', () => {
                this.entries = this.entries.filter((entry) => entry.value !== button.dataset.value);
                this.renderChips();
                this.notifyChange();
                this.refresh(true);
            });
        });
    }

    choose(option, { reason = 'programmatic' } = {}) {
        if (!option || this.entries.some((entry) => entry.value === option.value)) {
            return;
        }

        const previousAmount = this.maxEntries === 1 && this.entries.length
            ? Math.max(0, Number(this.entries[0].amount || 0))
            : 0;
        const nextEntry = {
            value: option.value,
            amount: previousAmount
        };

        if (this.entries.length >= this.maxEntries) {
            this.entries = [nextEntry];
        } else {
            this.entries.push(nextEntry);
        }
        this.input.value = '';
        this.renderChips();
        this.notifyChange();
        this.refresh(true);
        if (typeof this.onSelect === 'function') {
            this.onSelect(option, this, { reason });
        }
    }

    moveActive(direction) {
        if (!this.options.length) {
            return;
        }

        this.activeIndex = (this.activeIndex + direction + this.options.length) % this.options.length;
        this.renderPanel();
    }

    open() {
        if (this.disabled) {
            return;
        }
        this.wrapper.classList.add('is-open');
        this.panel.hidden = false;
    }

    close() {
        this.wrapper.classList.remove('is-open');
        this.panel.hidden = true;
    }

    clear({ silent = false } = {}) {
        this.entries = [];
        this.input.value = '';
        this.renderChips();
        if (!silent) {
            this.notifyChange();
        }
    }

    setEntries(entries, { silent = false } = {}) {
        const normalizedEntries = [];
        const allowedOptions = (typeof this.getOptions === 'function' ? this.getOptions() : [])
            .map(normalizeOption)
            .filter((option) => option.value);

        (entries || []).forEach((entry) => {
            const rawValue = String(entry?.method || entry?.value || '').trim();
            const value = allowedOptions.find((option) => normalizeLookup(option.value) === normalizeLookup(rawValue))?.value || '';
            if (!value || normalizedEntries.some((item) => item.value === value)) {
                return;
            }

            normalizedEntries.push({
                value,
                amount: isZeroAmountPaymentMethod(value) ? 0 : Math.max(0, Number(entry?.amount || 0))
            });
        });

        this.entries = normalizedEntries;
        this.input.value = '';
        this.renderChips();
        if (!silent) {
            this.notifyChange();
        }
    }

    setValues(values, { silent = false } = {}) {
        this.setEntries((values || []).map((value) => ({ value, amount: 0 })), { silent });
    }

    setDisabled(disabled) {
        this.disabled = Boolean(disabled);
        this.wrapper.classList.toggle('is-disabled', this.disabled);
        this.input.disabled = this.disabled;
        this.trigger.disabled = this.disabled;
        if (this.disabled) {
            this.close();
        }
    }

    getValues() {
        return this.entries.map((entry) => entry.value);
    }

    getEntries() {
        return this.entries.map((entry) => ({
            method: entry.value,
            amount: Math.max(0, Number(entry.amount || 0))
        }));
    }

    notifyChange() {
        if (typeof this.onChange === 'function') {
            this.onChange(this.getEntries(), this);
        }
    }
}

function getSetRank(value) {
    const index = (state.references.setOptions || []).findIndex((option) => option === value);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatQuantity(value) {
    const numberValue = Number(value || 0);
    return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(2);
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

    return String(value || '').trim() || normalized;
}

function setStatus(message, isError) {
    statusText.textContent = message;
    statusText.classList.toggle('error', Boolean(isError));
}
