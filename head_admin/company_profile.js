const appClient = window.appClient;
const DEFAULT_LOGO_PATH = '/logo.png';
const DEFAULT_PRIMARY_COLOR = '#2575fc';
const MAX_LOGO_BYTES = 700 * 1024;
const MAX_LOGO_DIMENSION = 900;
const MAX_BACKGROUND_BYTES = 1600 * 1024;
const MAX_BACKGROUND_DIMENSION = 1800;

const fields = {
    name: document.getElementById('name'),
    companyCode: document.getElementById('companyCode'),
    subdomain: document.getElementById('subdomain'),
    customDomain: document.getElementById('customDomain'),
    primaryColor: document.getElementById('primaryColor'),
    primaryColorHex: document.getElementById('primaryColorHex'),
    appName: document.getElementById('appName'),
    address: document.getElementById('address'),
    contact: document.getElementById('contact'),
    inventoryMenuLabel: document.getElementById('inventoryMenuLabel'),
    inventoryLevelsMenuLabel: document.getElementById('inventoryLevelsMenuLabel'),
    expensesTitle: document.getElementById('expensesTitle'),
    expensesCopy: document.getElementById('expensesCopy'),
    orderFormTitle: document.getElementById('orderFormTitle'),
    orderFormCopy: document.getElementById('orderFormCopy'),
    salesReportTitle: document.getElementById('salesReportTitle'),
    salesReportCopy: document.getElementById('salesReportCopy'),
    orderPaymentMethods: document.getElementById('orderPaymentMethods'),
    orderBranches: document.getElementById('orderBranches'),
    orderCashBranches: document.getElementById('orderCashBranches'),
    orderCouriers: document.getElementById('orderCouriers'),
    orderAdmins: document.getElementById('orderAdmins'),
    orderSalesReps: document.getElementById('orderSalesReps')
};
const toggles = {
    showInvoiceSummary: document.getElementById('showInvoiceSummary'),
    showInventoryLevels: document.getElementById('showInventoryLevels'),
    ofQuickPaste: document.getElementById('ofQuickPaste'),
    ofCashBranch: document.getElementById('ofCashBranch'),
    ofSalesRep: document.getElementById('ofSalesRep'),
    ofDeliveryFee: document.getElementById('ofDeliveryFee'),
    ofNote: document.getElementById('ofNote'),
    srCashBranch: document.getElementById('srCashBranch'),
    srPayment: document.getElementById('srPayment'),
    srAdmin: document.getElementById('srAdmin'),
    srSalesRep: document.getElementById('srSalesRep')
};
const logoFileInput = document.getElementById('logoFile');
const logoPreview = document.getElementById('logoPreview');
const logoMeta = document.getElementById('logoMeta');
const backgroundImageFileInput = document.getElementById('backgroundImageFile');
const backgroundMeta = document.getElementById('backgroundMeta');
const clearBackgroundBtn = document.getElementById('clearBackgroundBtn');
const brandingPreview = document.getElementById('brandingPreview');
const brandingPreviewImage = document.getElementById('brandingPreviewImage');
const brandingPreviewLogo = document.getElementById('brandingPreviewLogo');
const brandingPreviewTitle = document.getElementById('brandingPreviewTitle');
const brandingPreviewSubtitle = document.getElementById('brandingPreviewSubtitle');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');
let currentLogoPath = '';
let pendingUploadedLogoPath = '';
let currentLoginBackgroundPath = '';
let pendingUploadedBackgroundPath = '';

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    saveBtn.addEventListener('click', saveProfile);
    fields.primaryColor.addEventListener('input', onPrimaryColorPickerInput);
    fields.primaryColorHex.addEventListener('input', onPrimaryColorHexInput);
    fields.primaryColorHex.addEventListener('blur', onPrimaryColorHexBlur);
    logoFileInput.addEventListener('change', onLogoFileChange);
    backgroundImageFileInput.addEventListener('change', onBackgroundImageFileChange);
    clearBackgroundBtn.addEventListener('click', clearBackgroundImage);
    [fields.name, fields.appName, fields.companyCode].forEach((field) => {
        field?.addEventListener('input', updateBrandingPreview);
    });
    setOrderFormWorkspaceFieldsReadonly();
    await loadProfile();
}

async function loadProfile() {
    setStatus('Loading profile...');
    try {
        const [profile, workspaceConfig] = await Promise.all([
            appClient.getCompanySettings(),
            appClient.getCompanyWorkspaceConfig()
        ]);
        fields.name.value = profile.name || '';
        fields.companyCode.value = profile.company_code || '';
        fields.subdomain.value = profile.subdomain || '';
        fields.customDomain.value = profile.custom_domain || '';
        const resolvedPrimaryColor = normalizeHexColor(profile.primary_color, DEFAULT_PRIMARY_COLOR);
        fields.primaryColor.value = resolvedPrimaryColor;
        fields.primaryColorHex.value = resolvedPrimaryColor;
        applyCompanyThemePreview(resolvedPrimaryColor, { cache: true });
        fields.appName.value = profile.app_name || '';
        currentLogoPath = String(profile.logo_path || '').trim();
        currentLoginBackgroundPath = String(profile.login_background_path || '').trim();
        pendingUploadedLogoPath = '';
        pendingUploadedBackgroundPath = '';
        fields.address.value = profile.address || '';
        fields.contact.value = profile.contact || '';
        applyWorkspaceConfig(workspaceConfig || {});
        updateLogoPreview(resolveLogoSourceForPreview());
        updateBackgroundMeta();
        updateBrandingPreview();
        if (logoFileInput) {
            logoFileInput.value = '';
        }
        if (backgroundImageFileInput) {
            backgroundImageFileInput.value = '';
        }
        if (isImageDataUrl(currentLogoPath)) {
            logoMeta.textContent = 'Current logo is an uploaded image.';
        } else if (currentLogoPath) {
            logoMeta.textContent = 'Current logo is loaded from saved company settings.';
        } else {
            logoMeta.textContent = 'Using default logo.';
        }
        setStatus('Ready.');
    } catch (error) {
        console.error('Failed to load company profile:', error);
        setStatus(error.message || 'Failed to load profile.', true);
    }
}

async function saveProfile() {
    saveBtn.disabled = true;
    setStatus('Saving profile...');
    try {
        const latestWorkspaceConfig = await appClient.getCompanyWorkspaceConfig();
        await appClient.updateCompanySettings({
            name: fields.name.value.trim(),
            company_code: fields.companyCode.value.trim(),
            subdomain: fields.subdomain.value.trim(),
            custom_domain: fields.customDomain.value.trim(),
            primary_color: getPrimaryColorForSave(),
            app_name: fields.appName.value.trim(),
            logo_path: buildLogoPathForSave(),
            login_background_path: buildLoginBackgroundPathForSave(),
            address: fields.address.value.trim(),
            contact: fields.contact.value.trim()
        });
        await appClient.updateCompanyWorkspaceConfig(buildWorkspacePayload(latestWorkspaceConfig || {}));
        await loadProfile();
        setStatus('Company profile saved.');
    } catch (error) {
        console.error('Failed to save company profile:', error);
        setStatus(error.message || 'Failed to save profile.', true);
    } finally {
        saveBtn.disabled = false;
    }
}

function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.style.color = isError ? 'var(--tenant-danger, #b91c1c)' : 'var(--tenant-text, #374151)';
}

function applyWorkspaceConfig(config) {
    const labels = config?.labels || {};
    const menu = config?.menu || {};
    const orderForm = config?.orderForm || {};
    const visibleFields = orderForm?.visibleFields || {};
    const salesReport = config?.salesReport || {};
    const expenses = config?.expenses || {};

    fields.inventoryMenuLabel.value = labels.inventoryMenu || '';
    fields.inventoryLevelsMenuLabel.value = labels.inventoryLevelsMenu || '';
    fields.expensesTitle.value = expenses.title || labels.expensesPageTitle || '';
    fields.expensesCopy.value = expenses.copy || '';
    fields.orderFormTitle.value = labels.orderFormTitle || '';
    fields.orderFormCopy.value = labels.orderFormCopy || '';
    fields.salesReportTitle.value = labels.salesReportTitle || '';
    fields.salesReportCopy.value = labels.salesReportCopy || '';
    fields.orderBranches.value = Array.isArray(orderForm.branches)
        ? orderForm.branches.join('\n')
        : '';
    fields.orderCashBranches.value = Array.isArray(orderForm.cashBranches)
        ? orderForm.cashBranches.join('\n')
        : '';
    fields.orderCouriers.value = Array.isArray(orderForm.couriers)
        ? orderForm.couriers.join('\n')
        : '';
    fields.orderAdmins.value = Array.isArray(orderForm.admins)
        ? orderForm.admins.join('\n')
        : '';
    fields.orderSalesReps.value = Array.isArray(orderForm.salesRepresentatives)
        ? orderForm.salesRepresentatives.join('\n')
        : '';
    fields.orderPaymentMethods.value = Array.isArray(orderForm.paymentMethods)
        ? orderForm.paymentMethods.join('\n')
        : '';

    toggles.showInvoiceSummary.checked = Boolean(menu.showInvoiceSummary);
    toggles.showInventoryLevels.checked = menu.showInventoryLevels !== false;

    toggles.ofQuickPaste.checked = visibleFields.quickPaste !== false;
    toggles.ofCashBranch.checked = visibleFields.cashBranch !== false;
    toggles.ofSalesRep.checked = visibleFields.salesRepresentative !== false;
    toggles.ofDeliveryFee.checked = visibleFields.deliveryFee !== false;
    toggles.ofNote.checked = visibleFields.note !== false;

    toggles.srCashBranch.checked = salesReport.showCashBranchFilter !== false;
    toggles.srPayment.checked = salesReport.showPaymentFilter !== false;
    toggles.srAdmin.checked = salesReport.showAdminFilter !== false;
    toggles.srSalesRep.checked = salesReport.showSalesRepresentativeFilter !== false;
}

function buildWorkspacePayload(baseConfig = {}) {
    const baseMenu = (baseConfig?.menu && typeof baseConfig.menu === 'object' && !Array.isArray(baseConfig.menu))
        ? baseConfig.menu
        : {};
    const baseExperience = (baseConfig?.experience && typeof baseConfig.experience === 'object' && !Array.isArray(baseConfig.experience))
        ? baseConfig.experience
        : {};
    const baseLabels = (baseConfig?.labels && typeof baseConfig.labels === 'object' && !Array.isArray(baseConfig.labels))
        ? baseConfig.labels
        : {};
    const baseOrderForm = (baseConfig?.orderForm && typeof baseConfig.orderForm === 'object' && !Array.isArray(baseConfig.orderForm))
        ? baseConfig.orderForm
        : {};
    const baseVisibleFields = (baseOrderForm?.visibleFields && typeof baseOrderForm.visibleFields === 'object' && !Array.isArray(baseOrderForm.visibleFields))
        ? baseOrderForm.visibleFields
        : {};

    return {
        experience: {
            mode: String(baseExperience.mode || '').trim().toLowerCase() === 'attendance_only'
                ? 'attendance_only'
                : 'default'
        },
        menu: {
            showInvoiceSummary: Boolean(toggles.showInvoiceSummary.checked),
            showCustomerRequests: Boolean(baseMenu.showCustomerRequests),
            showInventoryLevels: Boolean(toggles.showInventoryLevels.checked)
        },
        labels: {
            inventoryMenu: fields.inventoryMenuLabel.value.trim() || 'Product Pricing',
            inventoryPageTitle: fields.inventoryMenuLabel.value.trim() || 'Product Pricing',
            inventoryLevelsMenu: fields.inventoryLevelsMenuLabel.value.trim() || 'Inventory',
            inventoryLevelsPageTitle: fields.inventoryLevelsMenuLabel.value.trim() || 'Inventory Levels',
            orderFormTitle: String(baseLabels.orderFormTitle || 'High-Speed Order Encoding').trim() || 'High-Speed Order Encoding',
            orderFormCopy: String(baseLabels.orderFormCopy || '').trim(),
            orderDetailsTitle: String(baseLabels.orderDetailsTitle || 'Order Details').trim() || 'Order Details',
            orderItemsTitle: String(baseLabels.orderItemsTitle || 'Variant Builder').trim() || 'Variant Builder',
            orderParseButton: String(baseLabels.orderParseButton || 'Parse Text').trim() || 'Parse Text',
            orderAddItemButton: String(baseLabels.orderAddItemButton || 'Add Item').trim() || 'Add Item',
            orderSubmitButton: String(baseLabels.orderSubmitButton || 'Create Order').trim() || 'Create Order',
            salesReportTitle: fields.salesReportTitle.value.trim() || 'Sales Report',
            salesReportCopy: fields.salesReportCopy.value.trim(),
            expensesMenu: fields.expensesTitle.value.trim() || 'Expenses',
            expensesPageTitle: fields.expensesTitle.value.trim() || 'Expenses and Cash Income'
        },
        orderForm: {
            branches: Array.isArray(baseOrderForm.branches) ? baseOrderForm.branches : [],
            cashBranches: Array.isArray(baseOrderForm.cashBranches) ? baseOrderForm.cashBranches : [],
            couriers: Array.isArray(baseOrderForm.couriers) ? baseOrderForm.couriers : [],
            admins: Array.isArray(baseOrderForm.admins) ? baseOrderForm.admins : [],
            salesRepresentatives: Array.isArray(baseOrderForm.salesRepresentatives) ? baseOrderForm.salesRepresentatives : [],
            paymentMethods: Array.isArray(baseOrderForm.paymentMethods) ? baseOrderForm.paymentMethods : [],
            visibleFields: {
                quickPaste: baseVisibleFields.quickPaste !== false,
                cashBranch: baseVisibleFields.cashBranch !== false,
                salesRepresentative: baseVisibleFields.salesRepresentative !== false,
                deliveryFee: baseVisibleFields.deliveryFee !== false,
                note: baseVisibleFields.note !== false
            }
        },
        salesReport: {
            showCashBranchFilter: Boolean(toggles.srCashBranch.checked),
            showPaymentFilter: Boolean(toggles.srPayment.checked),
            showAdminFilter: Boolean(toggles.srAdmin.checked),
            showSalesRepresentativeFilter: Boolean(toggles.srSalesRep.checked)
        },
        expenses: {
            title: fields.expensesTitle.value.trim(),
            copy: fields.expensesCopy.value.trim()
        }
    };
}

function setOrderFormWorkspaceFieldsReadonly() {
    const orderFormInputs = [
        fields.orderFormTitle,
        fields.orderFormCopy,
        fields.orderPaymentMethods,
        fields.orderBranches,
        fields.orderCashBranches,
        fields.orderCouriers,
        fields.orderAdmins,
        fields.orderSalesReps
    ];
    orderFormInputs.forEach((input) => {
        if (!input) {
            return;
        }
        if (typeof input.readOnly === 'boolean') {
            input.readOnly = true;
        }
        input.classList.add('readonly-field');
    });

    const orderFormToggles = [
        toggles.ofQuickPaste,
        toggles.ofCashBranch,
        toggles.ofSalesRep,
        toggles.ofDeliveryFee,
        toggles.ofNote
    ];
    orderFormToggles.forEach((toggle) => {
        if (toggle) {
            toggle.disabled = true;
        }
    });
}

function onPrimaryColorPickerInput() {
    fields.primaryColorHex.value = normalizeHexColor(fields.primaryColor.value, DEFAULT_PRIMARY_COLOR);
    applyCompanyThemePreview(fields.primaryColorHex.value);
    updateBrandingPreview();
}

function onPrimaryColorHexInput() {
    const normalized = normalizeHexColor(fields.primaryColorHex.value, '');
    if (normalized) {
        fields.primaryColor.value = normalized;
        applyCompanyThemePreview(normalized);
        updateBrandingPreview();
    }
}

function onPrimaryColorHexBlur() {
    const normalized = normalizeHexColor(fields.primaryColorHex.value, fields.primaryColor.value || DEFAULT_PRIMARY_COLOR);
    fields.primaryColor.value = normalized;
    fields.primaryColorHex.value = normalized;
    applyCompanyThemePreview(normalized);
    updateBrandingPreview();
}

function getPrimaryColorForSave() {
    const normalized = normalizeHexColor(fields.primaryColorHex.value, fields.primaryColor.value || DEFAULT_PRIMARY_COLOR);
    fields.primaryColor.value = normalized;
    fields.primaryColorHex.value = normalized;
    return normalized;
}

async function onLogoFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
        return;
    }

    if (!String(file.type || '').startsWith('image/')) {
        setStatus('Please choose a valid image file.', true);
        logoFileInput.value = '';
        return;
    }

    setStatus('Preparing logo upload...');
    try {
        const rawDataUrl = await readFileAsDataUrl(file);
        const optimizedDataUrl = await optimizeImageDataUrl(rawDataUrl, {
            maxBytes: MAX_LOGO_BYTES,
            maxDimension: MAX_LOGO_DIMENSION,
            label: 'Logo'
        });

        pendingUploadedLogoPath = optimizedDataUrl;
        updateLogoPreview(pendingUploadedLogoPath);
        updateBrandingPreview();
        logoMeta.textContent = `New logo selected: ${file.name} (${formatBytes(file.size)}). Click Save Profile to apply.`;
        setStatus('Logo ready. Click Save Profile to apply.');
    } catch (error) {
        console.error('Failed to process logo upload:', error);
        setStatus(error.message || 'Failed to process logo file.', true);
        logoFileInput.value = '';
    }
}

async function onBackgroundImageFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
        return;
    }

    if (!String(file.type || '').startsWith('image/')) {
        setStatus('Please choose a valid background image file.', true);
        backgroundImageFileInput.value = '';
        return;
    }

    setStatus('Preparing login background...');
    try {
        const rawDataUrl = await readFileAsDataUrl(file);
        const optimizedDataUrl = await optimizeImageDataUrl(rawDataUrl, {
            maxBytes: MAX_BACKGROUND_BYTES,
            maxDimension: MAX_BACKGROUND_DIMENSION,
            label: 'Background image'
        });

        pendingUploadedBackgroundPath = optimizedDataUrl;
        updateBackgroundMeta(`New background selected: ${file.name} (${formatBytes(file.size)}). Click Save Profile to apply.`);
        updateBrandingPreview();
        setStatus('Login background ready. Click Save Profile to apply.');
    } catch (error) {
        console.error('Failed to process login background upload:', error);
        setStatus(error.message || 'Failed to process background image.', true);
        backgroundImageFileInput.value = '';
    }
}

function resolveLogoSourceForPreview() {
    return pendingUploadedLogoPath
        || currentLogoPath
        || DEFAULT_LOGO_PATH;
}

function updateLogoPreview(source) {
    const nextSource = String(source || '').trim() || DEFAULT_LOGO_PATH;
    logoPreview.onerror = () => {
        logoPreview.onerror = null;
        logoPreview.src = DEFAULT_LOGO_PATH;
    };
    logoPreview.src = nextSource;
}

function buildLogoPathForSave() {
    return pendingUploadedLogoPath || currentLogoPath || '';
}

function resolveLoginBackgroundSourceForPreview() {
    return pendingUploadedBackgroundPath
        || currentLoginBackgroundPath
        || '';
}

function buildLoginBackgroundPathForSave() {
    return pendingUploadedBackgroundPath || currentLoginBackgroundPath || '';
}

function clearBackgroundImage() {
    if (!pendingUploadedBackgroundPath && !currentLoginBackgroundPath) {
        updateBackgroundMeta();
        setStatus('Gradient background is already active.');
        return;
    }

    pendingUploadedBackgroundPath = '';
    currentLoginBackgroundPath = '';
    updateBackgroundMeta('Custom login background removed. Click Save Profile to apply.');
    updateBrandingPreview();
    setStatus('Login background removed. Click Save Profile to apply.');
}

function updateBackgroundMeta(customMessage = '') {
    if (!backgroundMeta) {
        return;
    }

    if (customMessage) {
        backgroundMeta.textContent = customMessage;
        return;
    }

    const backgroundSource = resolveLoginBackgroundSourceForPreview();
    if (pendingUploadedBackgroundPath) {
        backgroundMeta.textContent = 'New login background selected. Click Save Profile to apply.';
        return;
    }
    if (isImageDataUrl(backgroundSource)) {
        backgroundMeta.textContent = 'Current login background is an uploaded image. Blur is applied automatically on the login page.';
        return;
    }
    if (backgroundSource) {
        backgroundMeta.textContent = 'Current login background is loaded from saved company settings. Blur is applied automatically on the login page.';
        return;
    }
    backgroundMeta.textContent = 'No custom login background image. Gradient background will be used.';
}

function updateBrandingPreview() {
    if (!brandingPreview) {
        return;
    }

    const primaryColor = normalizeHexColor(fields.primaryColorHex.value, fields.primaryColor.value || DEFAULT_PRIMARY_COLOR);
    const previewLogoSource = resolveLogoSourceForPreview();
    const previewBackgroundSource = resolveLoginBackgroundSourceForPreview();
    const appName = fields.appName.value.trim() || fields.name.value.trim() || 'GMS ERP';
    const companyName = fields.name.value.trim() || fields.companyCode.value.trim();

    brandingPreview.style.setProperty('--preview-primary', primaryColor);

    if (brandingPreviewLogo) {
        brandingPreviewLogo.onerror = () => {
            brandingPreviewLogo.onerror = null;
            brandingPreviewLogo.src = DEFAULT_LOGO_PATH;
        };
        brandingPreviewLogo.src = previewLogoSource || DEFAULT_LOGO_PATH;
    }

    if (brandingPreviewTitle) {
        brandingPreviewTitle.textContent = `${appName} Login`;
    }
    if (brandingPreviewSubtitle) {
        brandingPreviewSubtitle.textContent = companyName
            ? `Company: ${companyName}`
            : 'Sign in to continue';
    }

    if (!brandingPreviewImage) {
        return;
    }

    if (!previewBackgroundSource) {
        brandingPreview.classList.remove('has-image');
        brandingPreviewImage.removeAttribute('src');
        return;
    }

    brandingPreviewImage.onerror = () => {
        brandingPreviewImage.onerror = null;
        brandingPreview.classList.remove('has-image');
        brandingPreviewImage.removeAttribute('src');
    };
    brandingPreview.classList.add('has-image');
    brandingPreviewImage.src = previewBackgroundSource;
}

function isImageDataUrl(value) {
    return /^data:image\//i.test(String(value || '').trim());
}

function normalizeHexColor(value, fallback = DEFAULT_PRIMARY_COLOR) {
    const text = String(value || '').trim();
    const longMatch = text.match(/^#?([0-9a-f]{6})$/i);
    if (longMatch) {
        return `#${longMatch[1].toLowerCase()}`;
    }

    const shortMatch = text.match(/^#?([0-9a-f]{3})$/i);
    if (shortMatch) {
        const expanded = shortMatch[1]
            .toLowerCase()
            .split('')
            .map((character) => character + character)
            .join('');
        return `#${expanded}`;
    }

    return fallback ? String(fallback).trim().toLowerCase() : '';
}

function applyCompanyThemePreview(primaryColor, { cache = false } = {}) {
    if (!appClient?.applyBrandTheme) {
        return;
    }

    appClient.applyBrandTheme({
        primaryColor: normalizeHexColor(primaryColor, DEFAULT_PRIMARY_COLOR)
    }, { cache });
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Unable to read image file.'));
        reader.readAsDataURL(file);
    });
}

function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Invalid image content.'));
        image.src = dataUrl;
    });
}

async function optimizeImageDataUrl(dataUrl, { maxBytes, maxDimension, label = 'Image' }) {
    const originalSize = dataUrlByteLength(dataUrl);
    const image = await loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Your browser does not support image processing.');
    }

    let width = image.naturalWidth || image.width || 0;
    let height = image.naturalHeight || image.height || 0;
    if (!width || !height) {
        throw new Error(`Invalid ${String(label || 'image').toLowerCase()} size.`);
    }

    if (originalSize <= maxBytes && Math.max(width, height) <= maxDimension) {
        return dataUrl;
    }

    const initialScale = Math.min(1, maxDimension / Math.max(width, height));
    width = Math.max(1, Math.round(width * initialScale));
    height = Math.max(1, Math.round(height * initialScale));

    for (let attempt = 0; attempt < 5; attempt += 1) {
        canvas.width = width;
        canvas.height = height;
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        for (let quality = 0.9; quality >= 0.5; quality -= 0.1) {
            const candidate = canvas.toDataURL('image/webp', quality);
            if (dataUrlByteLength(candidate) <= maxBytes) {
                return candidate;
            }
        }

        width = Math.max(1, Math.round(width * 0.85));
        height = Math.max(1, Math.round(height * 0.85));
    }

    throw new Error(`${label} is too large after optimization. Please use a smaller image.`);
}

function dataUrlByteLength(dataUrl) {
    const text = String(dataUrl || '');
    const commaIndex = text.indexOf(',');
    if (commaIndex < 0) {
        return text.length;
    }
    const base64 = text.slice(commaIndex + 1);
    const padding = base64.endsWith('==') ? 2 : (base64.endsWith('=') ? 1 : 0);
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function formatBytes(value) {
    const bytes = Math.max(0, Number(value || 0));
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
