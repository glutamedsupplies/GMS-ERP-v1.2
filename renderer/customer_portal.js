const appClient = window.appClient;

const portalTitle = document.getElementById('portalTitle');
const portalSubtitle = document.getElementById('portalSubtitle');
const primaryCardTitle = document.getElementById('primaryCardTitle');
const primaryCardCopy = document.getElementById('primaryCardCopy');
const secondaryCardTitle = document.getElementById('secondaryCardTitle');
const secondaryCardCopy = document.getElementById('secondaryCardCopy');
const secondaryCard = document.getElementById('secondaryCard');
const heroHeader = document.getElementById('heroHeader');
const signupHeader = document.getElementById('signupHeader');
const signupTitle = document.getElementById('signupTitle');
const signupSubtitle = document.getElementById('signupSubtitle');
const signupLogo = document.getElementById('signupLogo');
const signupBannerTitle = document.getElementById('signupBannerTitle');
const signupBannerCopy = document.getElementById('signupBannerCopy');
const companyCodeLabel = document.getElementById('companyCodeLabel');
const companyCodeInput = document.getElementById('companyCodeInput');
const clientNameLabel = document.getElementById('clientNameLabel');
const clientNameInput = document.getElementById('clientNameInput');
const contactNumberLabel = document.getElementById('contactNumberLabel');
const contactNumberInput = document.getElementById('contactNumberInput');
const signupEmailInput = document.getElementById('signupEmailInput');
const signupIdInput = document.getElementById('signupIdInput');
const signupRoleInput = document.getElementById('signupRoleInput');
const companyRequestBusinessNameInput = document.getElementById('companyRequestBusinessNameInput');
const companyRequestEmailInput = document.getElementById('companyRequestEmailInput');
const desiredCompanyIdInput = document.getElementById('desiredCompanyIdInput');
const adminIdInput = document.getElementById('adminIdInput');
const requestedPlanInput = document.getElementById('requestedPlanInput');
const requestedPlanHelper = document.getElementById('requestedPlanHelper');
const companyRegistrationPlanCatalog = document.getElementById('companyRegistrationPlanCatalog');
const paymentMethodInput = document.getElementById('paymentMethodInput');
const paymentReferenceInput = document.getElementById('paymentReferenceInput');
const companyRegistrationSteps = Array.from(document.querySelectorAll('#companyRegistrationSteps [data-step]'));
const companyRegistrationFormPanel = document.getElementById('companyRegistrationFormPanel');
const companyRegistrationReviewPanel = document.getElementById('companyRegistrationReviewPanel');
const companyRegistrationPaymentPanel = document.getElementById('companyRegistrationPaymentPanel');
const companyRegistrationSuccessPanel = document.getElementById('companyRegistrationSuccessPanel');
const companyRegistrationFormPanelTitle = companyRegistrationFormPanel ? companyRegistrationFormPanel.querySelector('.field-group-title') : null;
const companyRegistrationPaymentPanelTitle = companyRegistrationPaymentPanel ? companyRegistrationPaymentPanel.querySelector('.field-group-title') : null;
const companyRegistrationSuccessPanelTitle = companyRegistrationSuccessPanel ? companyRegistrationSuccessPanel.querySelector('.field-group-title') : null;
const companyRegistrationHeaderBackBtn = document.getElementById('companyRegistrationHeaderBackBtn');
const companyRegistrationReviewGrid = document.getElementById('companyRegistrationReviewGrid');
const companyRegistrationReviewBtn = document.getElementById('companyRegistrationReviewBtn');
const companyRegistrationReviewBackBtn = document.getElementById('companyRegistrationReviewBackBtn');
const companyRegistrationPaymentBtn = document.getElementById('companyRegistrationPaymentBtn');
const companyRegistrationPaymentBackBtn = document.getElementById('companyRegistrationPaymentBackBtn');
const companyRegistrationOpenRequestBtn = document.getElementById('companyRegistrationOpenRequestBtn');
const companyRegistrationSuccessTitle = document.getElementById('companyRegistrationSuccessTitle');
const companyRegistrationSuccessCopy = document.getElementById('companyRegistrationSuccessCopy');
const companyRegistrationSuccessMeta = document.getElementById('companyRegistrationSuccessMeta');
const companyRequestBusinessNameError = document.getElementById('companyRequestBusinessNameError');
const clientNameError = document.getElementById('clientNameError');
const contactNumberError = document.getElementById('contactNumberError');
const companyRequestEmailError = document.getElementById('companyRequestEmailError');
const desiredCompanyIdError = document.getElementById('desiredCompanyIdError');
const adminIdError = document.getElementById('adminIdError');
const requestedPlanError = document.getElementById('requestedPlanError');
const paymentMethodError = document.getElementById('paymentMethodError');
const paymentPreviewCard = document.getElementById('paymentPreviewCard');
const paymentPanelTitle = document.getElementById('paymentPanelTitle');
const paymentMethodBadge = document.getElementById('paymentMethodBadge');
const paymentPanelNotice = document.getElementById('paymentPanelNotice');
const paymentPlanSpotlight = document.getElementById('paymentPlanSpotlight');
const paymentPlanKicker = document.getElementById('paymentPlanKicker');
const paymentPlanTitle = document.getElementById('paymentPlanTitle');
const paymentPlanSubtitle = document.getElementById('paymentPlanSubtitle');
const paymentPlanPriceMain = document.getElementById('paymentPlanPriceMain');
const paymentPlanPriceNote = document.getElementById('paymentPlanPriceNote');
const paymentPlanBenefits = document.getElementById('paymentPlanBenefits');
const paymentQrShell = document.getElementById('paymentQrShell');
const paymentQrImage = document.getElementById('paymentQrImage');
const paymentQrFallback = document.getElementById('paymentQrFallback');
const paymentQrCaption = document.getElementById('paymentQrCaption');
const paymentPrimaryLabel = document.getElementById('paymentPrimaryLabel');
const paymentSecondaryLabel = document.getElementById('paymentSecondaryLabel');
const paymentAccountName = document.getElementById('paymentAccountName');
const paymentAccountNumber = document.getElementById('paymentAccountNumber');
const paymentPanelInstructions = document.getElementById('paymentPanelInstructions');
const generatePaymentQrBtn = document.getElementById('generatePaymentQrBtn');
const paymentGenerateStatus = document.getElementById('paymentGenerateStatus');
const requestDetailsLabel = document.getElementById('requestDetailsLabel');
const initialMessageLabel = document.getElementById('initialMessageLabel');
const requestDetailsInput = document.getElementById('requestDetailsInput');
const initialMessageInput = document.getElementById('initialMessageInput');
const createRequestBtn = document.getElementById('createRequestBtn');
const requestCodeInput = document.getElementById('requestCodeInput');
const lookupContactInput = document.getElementById('lookupContactInput');
const openRequestBtn = document.getElementById('openRequestBtn');
const portalStatus = document.getElementById('portalStatus');
const requestThreadSection = document.getElementById('requestThreadSection');
const requestCodeLabel = document.getElementById('requestCodeLabel');
const requestStatusLabel = document.getElementById('requestStatusLabel');
const requestEditableLabel = document.getElementById('requestEditableLabel');
const requestUpdatedLabel = document.getElementById('requestUpdatedLabel');
const editNameInput = document.getElementById('editNameInput');
const editContactInput = document.getElementById('editContactInput');
const editDetailsInput = document.getElementById('editDetailsInput');
const saveRequestBtn = document.getElementById('saveRequestBtn');
const refreshThreadBtn = document.getElementById('refreshThreadBtn');
const chatMessages = document.getElementById('chatMessages');
const chatMessageInput = document.getElementById('chatMessageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const refreshChatBtn = document.getElementById('refreshChatBtn');

const COMPANY_REGISTRATION_CHECKOUT_STORAGE_KEY = 'gms-company-registration-checkout';
const DEFAULT_COMPANY_REGISTRATION_PLAN_IDS = Object.freeze(new Set([
    'attendance_starter',
    'sales_growth',
    'business_suite'
]));

const state = {
    companyCode: '',
    requestCode: '',
    authContactNumber: '',
    thread: null,
    brandingTimer: null,
    intent: 'support',
    companyRegistrationConfig: null,
    companyRegistrationPlans: [],
    companyRegistrationPaymongoQr: null,
    companyRegistrationQrRequested: false,
    companyRegistrationQrMethodKey: '',
    companyRegistrationQrLoading: false,
    companyRegistrationCheckoutPollTimer: null,
    companyRegistrationStep: 1,
    companyRegistrationLastSubmission: null
};

initialize();

function initialize() {
    const params = new URLSearchParams(window.location.search);
    const initialCompanyCode = String(params.get('companyCode') || '').trim();
    const intent = normalizeIntent(params.get('intent'));

    if (initialCompanyCode) {
        companyCodeInput.value = initialCompanyCode;
    }

    state.companyCode = initialCompanyCode;
    state.intent = intent;
    applyIntentDefaults();

    createRequestBtn.addEventListener('click', createRequest);
    openRequestBtn.addEventListener('click', openRequestThread);
    saveRequestBtn.addEventListener('click', saveRequestEdits);
    refreshThreadBtn.addEventListener('click', refreshThread);
    refreshChatBtn.addEventListener('click', refreshThread);
    sendMessageBtn.addEventListener('click', sendMessage);
    if (companyRegistrationReviewBtn) {
        companyRegistrationReviewBtn.addEventListener('click', goToCompanyRegistrationPaymentStep);
    }
    if (companyRegistrationHeaderBackBtn) {
        companyRegistrationHeaderBackBtn.addEventListener('click', navigateBackFromCompanyRegistration);
    }
    if (companyRegistrationReviewBackBtn) {
        companyRegistrationReviewBackBtn.addEventListener('click', () => setCompanyRegistrationStep(1));
    }
    if (companyRegistrationPaymentBtn) {
        companyRegistrationPaymentBtn.addEventListener('click', goToCompanyRegistrationPaymentStep);
    }
    if (companyRegistrationPaymentBackBtn) {
        companyRegistrationPaymentBackBtn.addEventListener('click', () => setCompanyRegistrationStep(1));
    }
    if (companyRegistrationOpenRequestBtn) {
        companyRegistrationOpenRequestBtn.addEventListener('click', openLatestCompanyRegistrationRequestThread);
    }

    [contactNumberInput, lookupContactInput, editContactInput].forEach((input) => {
        input.addEventListener('input', () => {
            input.value = sanitizeContactInput(input.value);
        });
    });

    if (desiredCompanyIdInput) {
        desiredCompanyIdInput.addEventListener('input', () => {
            desiredCompanyIdInput.value = normalizeDesiredCompanyCode(desiredCompanyIdInput.value);
        });
    }
    if (adminIdInput) {
        adminIdInput.addEventListener('input', () => {
            adminIdInput.value = normalizeDesiredCompanyCode(adminIdInput.value);
        });
    }

    if (paymentMethodInput) {
        paymentMethodInput.addEventListener('change', async () => {
            stopCompanyRegistrationCheckoutPolling();
            clearCompanyRegistrationCheckoutState();
            resetCompanyRegistrationQrRequestState();
            validateCompanyRegistrationForm({ silent: true });
            renderCompanyRegistrationReview();
            renderCompanyRegistrationPaymentPreview();
        });
    }
    if (requestedPlanInput) {
        requestedPlanInput.addEventListener('change', () => {
            renderCompanyRegistrationPlanCatalog();
            updateCompanyRegistrationPaymentAvailability({ regenerateIfNeeded: true });
            validateCompanyRegistrationForm({ silent: true });
            renderCompanyRegistrationReview();
        });
    }
    if (companyRegistrationPlanCatalog) {
        companyRegistrationPlanCatalog.addEventListener('click', handleCompanyRegistrationPlanCatalogClick);
    }
    if (paymentQrImage) {
        paymentQrImage.addEventListener('error', handlePaymentQrImageError);
    }
    if (generatePaymentQrBtn) {
        generatePaymentQrBtn.addEventListener('click', () => {
            startCompanyRegistrationCheckout();
        });
    }
    [
        companyRequestBusinessNameInput,
        clientNameInput,
        contactNumberInput,
        companyRequestEmailInput,
        desiredCompanyIdInput,
        adminIdInput
    ].forEach((input) => {
        if (!input) {
            return;
        }
        input.addEventListener('input', () => {
            updateCompanyRegistrationPaymentAvailability({ regenerateIfNeeded: true });
            if (isCompanyRegistrationIntent()) {
                validateCompanyRegistrationForm({ silent: true });
                renderCompanyRegistrationReview();
            }
        });
    });

    companyCodeInput.addEventListener('input', () => {
        state.companyCode = companyCodeInput.value.trim();
        if (state.brandingTimer) {
            window.clearTimeout(state.brandingTimer);
        }
        state.brandingTimer = window.setTimeout(() => {
            refreshBranding();
        }, 180);
    });

    requestCodeInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            openRequestThread();
        }
    });
    lookupContactInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            openRequestThread();
        }
    });
    chatMessageInput.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            sendMessage();
        }
    });

    refreshBranding();
    if (isCompanyRegistrationIntent()) {
        state.companyRegistrationLastSubmission = null;
        loadCompanyRegistrationPlans();
        loadCompanyRegistrationConfig();
        setCompanyRegistrationStep(1);
        clearCompanyRegistrationFieldErrors();
        updateCompanyRegistrationPaymentAvailability();
        validateCompanyRegistrationForm({ silent: true });
        renderCompanyRegistrationPaymentPreview();
        handleCompanyRegistrationCheckoutReturn(params);
    }
}

function normalizeIntent(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'signup' || normalized === 'sign_up') {
        return 'signup';
    }
    if (
        normalized === 'register_company_id'
        || normalized === 'register-company-id'
        || normalized === 'company_registration'
        || normalized === 'company-registration'
        || normalized === 'company_signup'
        || normalized === 'company-signup'
    ) {
        return 'register_company_id';
    }
    return 'support';
}

function isSignupIntent() {
    return state.intent === 'signup';
}

function isCompanyRegistrationIntent() {
    return state.intent === 'register_company_id';
}

function isFocusedIntent() {
    return isSignupIntent() || isCompanyRegistrationIntent();
}

function applyIntentDefaults() {
    const focusedIntent = isFocusedIntent();
    const companyRegistration = isCompanyRegistrationIntent();

    document.body.classList.toggle('is-signup', focusedIntent);
    document.body.classList.toggle('is-company-id-request', companyRegistration);

    if (heroHeader) {
        heroHeader.hidden = focusedIntent;
    }
    if (signupHeader) {
        signupHeader.hidden = !focusedIntent;
    }
    if (secondaryCard) {
        secondaryCard.hidden = focusedIntent;
    }

    if (!focusedIntent) {
        setStatus('Fill up the form to continue.', false);
        if (primaryCardTitle) {
            primaryCardTitle.textContent = 'New Support Request';
        }
        if (primaryCardCopy) {
            primaryCardCopy.textContent = 'Send your concern so Customer Service can reply in the same request thread.';
        }
        if (createRequestBtn) {
            createRequestBtn.textContent = 'Send Request';
        }
        if (companyCodeLabel) {
            companyCodeLabel.textContent = 'Company ID';
        }
        if (clientNameLabel) {
            clientNameLabel.textContent = 'Name';
        }
        if (contactNumberLabel) {
            contactNumberLabel.textContent = 'Contact Number';
        }
        if (clientNameInput) {
            clientNameInput.placeholder = 'Your name';
        }
        if (contactNumberInput) {
            contactNumberInput.placeholder = '0917...';
        }
        if (requestDetailsLabel) {
            requestDetailsLabel.textContent = 'Topic (optional)';
        }
        if (requestDetailsInput) {
            requestDetailsInput.placeholder = 'Short topic/title ng concern mo';
        }
        if (initialMessageLabel) {
            initialMessageLabel.textContent = 'Initial Message (optional)';
        }
        if (initialMessageInput) {
            initialMessageInput.placeholder = 'Extra context or question...';
        }
        if (secondaryCardTitle) {
            secondaryCardTitle.textContent = 'Open Existing Request';
        }
        if (secondaryCardCopy) {
            secondaryCardCopy.textContent = 'Use your request code and contact number to reopen and continue an existing Customer Service conversation.';
        }
        return;
    }

    if (companyRegistration) {
        setStatus('Complete the form to request a Company ID and subscription review.', false);
        if (primaryCardTitle) {
            primaryCardTitle.textContent = 'Register Company ID';
        }
        if (primaryCardCopy) {
            primaryCardCopy.textContent = 'Compare the plans first, fill up the registration details, generate the payment QR, then wait for automatic Company ID setup once the transfer is confirmed.';
        }
        if (createRequestBtn) {
            createRequestBtn.textContent = 'Submit Manual Request Only';
        }
        if (clientNameLabel) {
            clientNameLabel.textContent = 'Contact Person / Owner';
        }
        if (contactNumberLabel) {
            contactNumberLabel.textContent = 'Contact Number';
        }
        if (clientNameInput) {
            clientNameInput.placeholder = 'Owner or main contact person';
        }
        if (contactNumberInput) {
            contactNumberInput.placeholder = '0917...';
        }
        if (signupBannerTitle) {
            signupBannerTitle.textContent = 'Compare plans first.';
        }
        if (signupBannerCopy) {
            signupBannerCopy.textContent = 'You can review the packages first without scrolling to the payment step. After choosing one, continue with the form and payment flow.';
        }
        if (companyRegistrationFormPanelTitle) {
            companyRegistrationFormPanelTitle.textContent = 'Step 1 - Choose Plan & Company Details';
        }
        if (companyRegistrationPaymentPanelTitle) {
            companyRegistrationPaymentPanelTitle.textContent = 'Step 2 - Payment / Approval';
        }
        if (companyRegistrationSuccessPanelTitle) {
            companyRegistrationSuccessPanelTitle.textContent = 'Step 3 - Submitted';
        }
        if (companyRegistrationReviewBtn) {
            companyRegistrationReviewBtn.textContent = 'Next - Mode of Payment';
        }
        if (companyRegistrationSteps[0]) {
            const stepTitle = companyRegistrationSteps[0].querySelector('strong');
            const stepCopy = companyRegistrationSteps[0].querySelector('span');
            if (stepTitle) {
                stepTitle.textContent = '1. Choose Plan & Fill Up';
            }
            if (stepCopy) {
                stepCopy.textContent = 'Compare packages first, then complete the required company registration details.';
            }
        }
        if (requestDetailsLabel) {
            requestDetailsLabel.textContent = 'Subscription Notes (optional)';
        }
        if (requestDetailsInput) {
            requestDetailsInput.placeholder = 'Preferred package, billing note, or setup request.';
        }
        if (initialMessageLabel) {
            initialMessageLabel.textContent = 'Extra Message (optional)';
        }
        if (initialMessageInput) {
            initialMessageInput.placeholder = 'Anything else the team should know?';
        }
        if (paymentReferenceInput && !paymentReferenceInput.value.trim()) {
            paymentReferenceInput.placeholder = 'Optional note, reference number, or fallback payment detail';
        }
        if (requestedPlanHelper) {
            requestedPlanHelper.textContent = 'Compare the plans below first, then pick the package that fits before filling the rest of the form.';
        }
        renderCompanyRegistrationPlanCatalog();
        renderCompanyRegistrationPaymentPreview();
        return;
    }

    setStatus('Complete the sign up form to request access.', false);
    if (primaryCardTitle) {
        primaryCardTitle.textContent = 'Sign Up Request';
    }
    if (primaryCardCopy) {
        primaryCardCopy.textContent = 'Submit a sign up request so the team can create your access.';
    }
    if (createRequestBtn) {
        createRequestBtn.textContent = 'Submit Sign Up';
    }
    if (clientNameLabel) {
        clientNameLabel.textContent = 'Name';
    }
    if (contactNumberLabel) {
        contactNumberLabel.textContent = 'Contact Number';
    }
    if (clientNameInput) {
        clientNameInput.placeholder = 'Your name';
    }
    if (contactNumberInput) {
        contactNumberInput.placeholder = '0917...';
    }
    if (signupBannerTitle) {
        signupBannerTitle.textContent = 'Company admin approval required.';
    }
    if (signupBannerCopy) {
        signupBannerCopy.textContent = 'Para sa security, kailangang i-approve muna ng head admin bago ma-activate ang account.';
    }
    if (requestDetailsInput && !requestDetailsInput.value.trim()) {
        requestDetailsInput.value = 'Account sign up request';
    }
    if (requestDetailsLabel) {
        requestDetailsLabel.textContent = 'Access Notes (optional)';
    }
    if (requestDetailsInput) {
        requestDetailsInput.placeholder = 'Optional notes for the head admin.';
    }
    if (initialMessageLabel) {
        initialMessageLabel.textContent = 'Approval Note (optional)';
    }
    if (initialMessageInput) {
        initialMessageInput.placeholder = 'Add extra details for approval (modules, branch, schedule).';
    }
}

function escapeHtml(value = '') {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatPhpAmount(value = 0, { suffix = '' } = {}) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
        return suffix ? `Custom${suffix}` : 'Custom';
    }

    const formatted = new Intl.NumberFormat('en-PH', {
        minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2
    }).format(amount);
    return `PHP ${formatted}${suffix}`;
}

function getPlanModuleLabels(modules = {}) {
    const labels = [];
    if (modules.attendance) labels.push('Attendance');
    if (modules.sales) labels.push('Sales');
    if (modules.inventory) labels.push('Inventory');
    if (modules.invoicing) labels.push('Invoicing');
    if (modules.reports) labels.push('Reports');
    if (modules.ai_reader) labels.push('AI Reader');
    return labels;
}

function buildPublicPlanDescription(plan = {}) {
    const branches = Math.max(0, Number(plan.max_branches || 0));
    const users = Math.max(0, Number(plan.max_users || 0));
    const invoices = Math.max(0, Number(plan.max_invoices_monthly || 0));
    const modules = getPlanModuleLabels(plan.modules || {});
    const summaryParts = [
        branches ? `${branches} branch${branches === 1 ? '' : 'es'}` : '',
        users ? `${users} user${users === 1 ? '' : 's'}` : '',
        invoices ? `${invoices} invoices / month` : ''
    ].filter(Boolean);

    const lines = [];
    if (summaryParts.length) {
        lines.push(summaryParts.join(' | '));
    }
    if (modules.length) {
        lines.push(`Modules: ${modules.join(', ')}`);
    }
    if (Number(plan.ai_monthly_quota || 0) > 0) {
        lines.push(`AI quota: ${Number(plan.ai_monthly_quota || 0)} / month`);
    }

    return lines.join('\n') || 'Core ERP access package.';
}

function getCompanyRegistrationSubscriptionOptions() {
    const planOptions = Array.isArray(state.companyRegistrationPlans)
        ? state.companyRegistrationPlans.map((plan) => ({
            key: String(plan.id || '').trim() || String(plan.name || '').trim(),
            value: String(plan.id || '').trim() || String(plan.name || '').trim(),
            title: String(plan.name || '').trim() || String(plan.id || '').trim() || 'Plan',
            priceLabel: `${formatPhpAmount(plan.price_monthly)} / month`,
            copy: buildPublicPlanDescription(plan),
            meta: `Plan ID: ${String(plan.id || '').trim() || '-'}`
        })).filter((entry) => entry.value)
        : [];

    planOptions.push({
        key: 'lifetime_access',
        value: 'Lifetime Access',
        title: 'Lifetime Access',
        priceLabel: 'Custom one-time price',
        copy: 'One-time payment option with no monthly renewal.\nLifetime pricing is separate from monthly subscriptions and may depend on your final setup.',
        meta: 'Best for long-term use with one-time payment approval.'
    });

    return planOptions;
}

function getFeaturedCompanyRegistrationPlanKey(options = getCompanyRegistrationSubscriptionOptions()) {
    const regularOptions = (Array.isArray(options) ? options : []).filter((entry) => entry && entry.key !== 'lifetime_access');
    if (!regularOptions.length) {
        return '';
    }

    const featuredIndex = regularOptions.length >= 3 ? 1 : 0;
    return String(regularOptions[Math.min(featuredIndex, regularOptions.length - 1)]?.key || '').trim();
}

function splitCompanyRegistrationMultilineText(value = '', limit = 6) {
    return String(value || '')
        .split(/\r?\n/)
        .map((line) => String(line || '').trim())
        .filter(Boolean)
        .slice(0, Math.max(0, Number(limit || 0)));
}

function splitCompanyRegistrationPriceLabel(priceLabel = '') {
    const normalized = String(priceLabel || '').trim();
    if (!normalized) {
        return {
            main: '-',
            note: ''
        };
    }

    if (normalized.toLowerCase() === 'custom one-time price') {
        return {
            main: 'Custom price',
            note: 'One-time payment'
        };
    }

    const recurringMatch = normalized.match(/^(.+?)(\s*\/\s*.+)$/);
    if (recurringMatch) {
        return {
            main: recurringMatch[1].trim(),
            note: recurringMatch[2].trim()
        };
    }

    return {
        main: normalized,
        note: normalized.toLowerCase().includes('one-time') ? 'One-time payment' : ''
    };
}

function getSelectedCompanyRegistrationSubscriptionOption() {
    const selectedValue = getSelectedCompanyRegistrationSubscriptionValue();
    if (!selectedValue) {
        return null;
    }

    return getCompanyRegistrationSubscriptionOptions().find((entry) => entry.value === selectedValue) || null;
}

function getSelectedCompanyRegistrationSubscriptionValue() {
    return String(requestedPlanInput?.value || '').trim();
}

function getSelectedCompanyRegistrationSubscriptionLabel() {
    const selectedPlan = getSelectedCompanyRegistrationSubscriptionOption();
    if (selectedPlan) {
        return String(selectedPlan.title || '').trim();
    }

    return '';
}

function isSelectedCompanyRegistrationAdminQuotePlan() {
    const selectedPlan = getSelectedCompanyRegistrationSubscriptionOption();
    return Boolean(selectedPlan && selectedPlan.key === 'lifetime_access');
}

function normalizeCompanyRegistrationPlanName(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function scoreCompanyRegistrationPlanForDisplay(plan = {}, index = 0) {
    const planId = String(plan?.id || '').trim().toLowerCase();
    const priceMonthly = Number(plan?.price_monthly || 0);

    return {
        prefersCustomPlan: DEFAULT_COMPANY_REGISTRATION_PLAN_IDS.has(planId) ? 0 : 1,
        priceMonthly: Number.isFinite(priceMonthly) ? priceMonthly : -1,
        index: Number(index || 0)
    };
}

function shouldReplaceCompanyRegistrationPlan(existing = {}, candidate = {}) {
    if (candidate.prefersCustomPlan !== existing.prefersCustomPlan) {
        return candidate.prefersCustomPlan > existing.prefersCustomPlan;
    }
    if (candidate.priceMonthly !== existing.priceMonthly) {
        return candidate.priceMonthly > existing.priceMonthly;
    }
    return candidate.index > existing.index;
}

function dedupeCompanyRegistrationPlans(plans = []) {
    const entries = Array.isArray(plans) ? plans : [];
    const byName = new Map();

    entries.forEach((plan, index) => {
        if (!plan || typeof plan !== 'object') {
            return;
        }

        const nameKey = normalizeCompanyRegistrationPlanName(plan.name || plan.id || '');
        if (!nameKey) {
            return;
        }

        const candidate = {
            plan,
            score: scoreCompanyRegistrationPlanForDisplay(plan, index)
        };
        const existing = byName.get(nameKey);
        if (!existing || shouldReplaceCompanyRegistrationPlan(existing.score, candidate.score)) {
            byName.set(nameKey, candidate);
        }
    });

    return Array.from(byName.values())
        .map((entry) => entry.plan)
        .sort((left, right) => {
            const leftPrice = Number(left?.price_monthly || 0);
            const rightPrice = Number(right?.price_monthly || 0);
            if (leftPrice !== rightPrice) {
                return leftPrice - rightPrice;
            }
            return String(left?.name || '').localeCompare(String(right?.name || ''), undefined, { sensitivity: 'base' });
        });
}

function getSelectedCompanyRegistrationCheckoutDetails() {
    const selectedPlan = getSelectedCompanyRegistrationSubscriptionOption();
    if (!selectedPlan) {
        return {
            selectedPlan: null,
            amountPhp: 0,
            amountMinor: 0,
            amountLabel: '-',
            checkoutSupported: false,
            reason: 'Choose a subscription first to continue to secure checkout.'
        };
    }

    if (selectedPlan.key === 'lifetime_access') {
        return {
            selectedPlan,
            amountPhp: 0,
            amountMinor: 0,
            amountLabel: 'Custom one-time price',
            checkoutSupported: false,
            reason: 'Lifetime Access needs an exact one-time price before secure checkout can be used.'
        };
    }

    const matchingPlan = Array.isArray(state.companyRegistrationPlans)
        ? state.companyRegistrationPlans.find((plan) => {
            const planId = String(plan?.id || '').trim();
            return selectedPlan.value === planId;
        })
        : null;
    const amountPhp = Number(matchingPlan?.price_monthly || 0);

    if (!Number.isFinite(amountPhp) || amountPhp <= 0) {
        return {
            selectedPlan,
            amountPhp: 0,
            amountMinor: 0,
            amountLabel: selectedPlan.priceLabel || 'Price unavailable',
            checkoutSupported: false,
            reason: 'This subscription does not have a valid exact price yet.'
        };
    }

    return {
        selectedPlan,
        amountPhp,
        amountMinor: Math.round(amountPhp * 100),
        amountLabel: formatPhpAmount(amountPhp),
        checkoutSupported: true,
        reason: ''
    };
}

function setCompanyRegistrationStep(step = 1) {
    const normalizedStep = Math.max(1, Math.min(3, Number(step || 1)));
    state.companyRegistrationStep = normalizedStep;

    const panels = [
        { element: companyRegistrationFormPanel, step: 1 },
        { element: companyRegistrationPaymentPanel, step: 2 },
        { element: companyRegistrationSuccessPanel, step: 3 }
    ];
    panels.forEach(({ element, step: panelStep }) => {
        if (element) {
            element.classList.toggle('is-active', normalizedStep === panelStep);
        }
    });

    companyRegistrationSteps.forEach((element) => {
        const stepValue = Number(element.dataset.step || 0);
        element.classList.toggle('is-active', stepValue === normalizedStep);
        element.classList.toggle('is-complete', stepValue > 0 && stepValue < normalizedStep);
    });

    if (normalizedStep === 2) {
        renderCompanyRegistrationPaymentPreview();
    }
    if (normalizedStep === 3) {
        renderCompanyRegistrationSuccessState();
    }
}

function setCompanyRegistrationFieldError(element, message = '') {
    if (!element) {
        return;
    }
    element.textContent = String(message || '').trim();
}

function navigateBackFromCompanyRegistration() {
    if (window.history.length > 1) {
        window.history.back();
        return;
    }

    window.location.assign('/login.html');
}

function clearCompanyRegistrationFieldErrors() {
    [
        companyRequestBusinessNameError,
        clientNameError,
        contactNumberError,
        companyRequestEmailError,
        desiredCompanyIdError,
        adminIdError,
        requestedPlanError,
        paymentMethodError
    ].forEach((element) => setCompanyRegistrationFieldError(element, ''));
}

function collectCompanyRegistrationFormData() {
    const businessName = String(companyRequestBusinessNameInput?.value || '').trim();
    const clientName = String(clientNameInput?.value || '').trim();
    const contactNumber = String(contactNumberInput?.value || '').trim();
    const email = String(companyRequestEmailInput?.value || '').trim();
    const desiredCompanyCode = normalizeDesiredCompanyCode(desiredCompanyIdInput?.value || '');
    const adminId = normalizeDesiredCompanyCode(adminIdInput?.value || '');
    const requestedPlan = getSelectedCompanyRegistrationSubscriptionLabel();
    const paymentMethod = String(paymentMethodInput?.value || '').trim();
    const paymentReference = String(paymentReferenceInput?.value || '').trim();
    const notes = String(requestDetailsInput?.value || '').trim();
    const extraMessage = String(initialMessageInput?.value || '').trim();

    return {
        businessName,
        clientName,
        contactNumber,
        email,
        desiredCompanyCode,
        adminId,
        requestedPlan,
        paymentMethod,
        paymentReference,
        notes,
        extraMessage
    };
}

function buildCompanyRegistrationPaymentPreviewPayload() {
    const data = collectCompanyRegistrationFormData();
    const requestedPlanKey = getSelectedCompanyRegistrationSubscriptionValue();

    return {
        businessName: data.businessName,
        clientName: data.clientName,
        contactNumber: data.contactNumber,
        email: data.email,
        desiredCompanyCode: data.desiredCompanyCode,
        adminId: data.adminId,
        requestedPlan: requestedPlanKey || data.requestedPlan,
        paymentMethod: data.paymentMethod,
        paymentReference: data.paymentReference,
        notes: data.notes,
        extraMessage: data.extraMessage
    };
}

function isValidContactNumber(value = '') {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 13;
}

function validateCompanyRegistrationForm({ silent = false, requirePaymentMethod = false } = {}) {
    if (!isCompanyRegistrationIntent()) {
        return { valid: false, data: {}, errors: {} };
    }

    const data = collectCompanyRegistrationFormData();
    const errors = {};

    if (!data.businessName) {
        errors.businessName = 'Company name is required.';
    }
    if (!data.clientName) {
        errors.clientName = 'Name is required.';
    }
    if (!data.contactNumber) {
        errors.contactNumber = 'Contact number is required.';
    } else if (!isValidContactNumber(data.contactNumber)) {
        errors.contactNumber = 'Enter a valid contact number.';
    }
    if (!data.email) {
        errors.email = 'Email is required.';
    } else if (!isValidEmail(data.email)) {
        errors.email = 'Enter a valid email address.';
    }
    if (!data.desiredCompanyCode) {
        errors.desiredCompanyCode = 'Company ID is required.';
    }
    if (!data.adminId) {
        errors.adminId = 'Admin ID is required.';
    }
    if (!data.requestedPlan) {
        errors.requestedPlan = 'Select a subscription package.';
    }
    if (requirePaymentMethod && !data.paymentMethod && !isSelectedCompanyRegistrationAdminQuotePlan()) {
        errors.paymentMethod = 'Select a mode of payment.';
    }

    if (!silent) {
        setCompanyRegistrationFieldError(companyRequestBusinessNameError, errors.businessName);
        setCompanyRegistrationFieldError(clientNameError, errors.clientName);
        setCompanyRegistrationFieldError(contactNumberError, errors.contactNumber);
        setCompanyRegistrationFieldError(companyRequestEmailError, errors.email);
        setCompanyRegistrationFieldError(desiredCompanyIdError, errors.desiredCompanyCode);
        setCompanyRegistrationFieldError(adminIdError, errors.adminId);
        setCompanyRegistrationFieldError(requestedPlanError, errors.requestedPlan);
        setCompanyRegistrationFieldError(paymentMethodError, errors.paymentMethod);
    } else {
        clearCompanyRegistrationFieldErrors();
        setCompanyRegistrationFieldError(companyRequestBusinessNameError, errors.businessName);
        setCompanyRegistrationFieldError(clientNameError, errors.clientName);
        setCompanyRegistrationFieldError(contactNumberError, errors.contactNumber);
        setCompanyRegistrationFieldError(companyRequestEmailError, errors.email);
        setCompanyRegistrationFieldError(desiredCompanyIdError, errors.desiredCompanyCode);
        setCompanyRegistrationFieldError(adminIdError, errors.adminId);
        setCompanyRegistrationFieldError(requestedPlanError, errors.requestedPlan);
        setCompanyRegistrationFieldError(paymentMethodError, errors.paymentMethod);
    }

    if (desiredCompanyIdInput) {
        desiredCompanyIdInput.value = data.desiredCompanyCode;
    }
    if (adminIdInput) {
        adminIdInput.value = data.adminId;
    }
    if (companyRegistrationReviewBtn) {
        companyRegistrationReviewBtn.disabled = Object.keys(errors).length > 0;
    }

    return {
        valid: Object.keys(errors).length === 0,
        data,
        errors
    };
}

function renderCompanyRegistrationReview() {
    if (!companyRegistrationReviewGrid || !isCompanyRegistrationIntent()) {
        return;
    }

    const data = collectCompanyRegistrationFormData();
    const checkoutDetails = getSelectedCompanyRegistrationCheckoutDetails();
    const requiresAdminQuote = Boolean(checkoutDetails.selectedPlan && checkoutDetails.selectedPlan.key === 'lifetime_access');
    const reviewItems = [
        ['Company ID', data.desiredCompanyCode || '-'],
        ['Company Name', data.businessName || '-'],
        ['Admin ID', data.adminId || '-'],
        ['Name', data.clientName || '-'],
        ['Contact Number', data.contactNumber || '-'],
        ['Email', data.email || '-'],
        ['Subscription', data.requestedPlan || '-'],
        ['Mode of Payment', requiresAdminQuote ? 'Admin quote required' : (data.paymentMethod || '-')],
        ['Amount', checkoutDetails.amountLabel || '-']
    ];

    companyRegistrationReviewGrid.innerHTML = reviewItems.map(([label, value]) => `
        <div class="review-item">
            <div class="review-item-label">${escapeHtml(label)}</div>
            <div class="review-item-value">${escapeHtml(value)}</div>
        </div>
    `).join('');

    if (companyRegistrationPaymentBtn) {
        companyRegistrationPaymentBtn.disabled = !checkoutDetails.checkoutSupported && !requiresAdminQuote;
    }
}

function renderCompanyRegistrationSuccessState() {
    if (!companyRegistrationSuccessTitle || !companyRegistrationSuccessCopy || !companyRegistrationSuccessMeta) {
        return;
    }

    const submission = state.companyRegistrationLastSubmission || {};
    if (submission.isAdminQuotePlan) {
        companyRegistrationSuccessTitle.textContent = 'Waiting for Admin Quote';
        companyRegistrationSuccessCopy.textContent = 'Your Lifetime Access request has been submitted. Please wait for the website admin to confirm the final one-time price and approval steps.';
        companyRegistrationSuccessMeta.textContent = [
            `Request Code: ${submission.requestCode || '-'}`,
            `Plan: ${submission.requestedPlan || 'Lifetime Access'}`,
            'Payment Flow: Admin quote required',
            'Approval Status: Waiting for admin response'
        ].filter(Boolean).join('\n');
        return;
    }

    if (submission.fullyProvisioned) {
        const emailTarget = submission.email || 'your email address';
        companyRegistrationSuccessTitle.textContent = 'Company ID Ready';
        companyRegistrationSuccessCopy.textContent = submission.emailSent
            ? `Payment confirmed and your company account is now active. The admin account details were sent to ${emailTarget}.`
            : `Payment confirmed and your company account is now active. The admin account email was not sent automatically, so the admin team may follow up manually.`;
        companyRegistrationSuccessMeta.textContent = [
            `Request Code: ${submission.requestCode || '-'}`,
            `Company ID: ${submission.companyCode || '-'}`,
            `Plan: ${submission.requestedPlan || '-'}`,
            `Admin Username: ${submission.adminUsername || '-'}`,
            'Payment Status: Paid',
            'Approval Status: Completed',
            submission.amountLabel ? `Amount: ${submission.amountLabel}` : '',
            submission.emailSent
                ? `Email Delivery: Sent to ${emailTarget}`
                : `Email Delivery: ${submission.emailDeliveryError || 'Not sent automatically'}`
        ].filter(Boolean).join('\n');
        return;
    }

    if (submission.requiresManualReview) {
        companyRegistrationSuccessTitle.textContent = 'Payment Received';
        companyRegistrationSuccessCopy.textContent = 'Your payment was confirmed, but the Company ID still needs a quick admin review before the account can be released.';
        companyRegistrationSuccessMeta.textContent = [
            `Request Code: ${submission.requestCode || '-'}`,
            `Plan: ${submission.requestedPlan || '-'}`,
            `Payment Method: ${submission.paymentMethod || '-'}`,
            `Reference: ${submission.referenceId || '-'}`,
            'Payment Status: Paid',
            `Next Step: ${submission.manualReviewReason || 'Admin review required'}`
        ].filter(Boolean).join('\n');
        return;
    }

    companyRegistrationSuccessTitle.textContent = 'Waiting for Payment Confirmation';
    companyRegistrationSuccessCopy.textContent = 'Your payment QR has been prepared. Once PayMongo confirms the transfer, this page will move your request here automatically.';
    companyRegistrationSuccessMeta.textContent = [
        `Request Code: ${submission.requestCode || '-'}`,
        `Payment Method: ${submission.paymentMethod || '-'}`,
        `Reference: ${submission.referenceId || '-'}`,
        'Payment Status: Waiting for confirmation',
        submission.amountLabel ? `Amount: ${submission.amountLabel}` : ''
    ].filter(Boolean).join('\n');
}

function goToCompanyRegistrationReviewStep() {
    goToCompanyRegistrationPaymentStep();
}

function goToCompanyRegistrationPaymentStep() {
    const validation = validateCompanyRegistrationForm();
    if (!validation.valid) {
        setCompanyRegistrationStep(1);
        setStatus('Please complete the required fields before continuing to payment.', true);
        return;
    }

    setCompanyRegistrationStep(2);
    prepareCompanyRegistrationPaymentStep();
}

async function openLatestCompanyRegistrationRequestThread() {
    const submission = state.companyRegistrationLastSubmission || {};
    if (requestCodeInput && submission.requestCode) {
        requestCodeInput.value = submission.requestCode;
    }
    if (lookupContactInput && submission.contactNumber) {
        lookupContactInput.value = submission.contactNumber;
    }
    await openRequestThread();
}

function isCompanyRegistrationPaymentReady() {
    if (!isCompanyRegistrationIntent()) {
        return false;
    }

    const businessName = String(companyRequestBusinessNameInput?.value || '').trim();
    const clientName = String(clientNameInput?.value || '').trim();
    const contactNumber = String(contactNumberInput?.value || '').trim();
    const email = String(companyRequestEmailInput?.value || '').trim();
    const desiredCompanyCode = normalizeDesiredCompanyCode(desiredCompanyIdInput?.value || '');
    const adminId = normalizeDesiredCompanyCode(adminIdInput?.value || '');
    const requestedPlan = String(requestedPlanInput?.value || '').trim();

    return Boolean(
        businessName
        && clientName
        && contactNumber
        && email
        && desiredCompanyCode
        && adminId
        && requestedPlan
        && isValidEmail(email)
        && isValidContactNumber(contactNumber)
    );
}

function updateCompanyRegistrationPaymentAvailability({ regenerateIfNeeded = false } = {}) {
    if (!isCompanyRegistrationIntent() || !paymentMethodInput) {
        return;
    }

    const paymentReady = isCompanyRegistrationPaymentReady();
    const requiresAdminQuote = isSelectedCompanyRegistrationAdminQuotePlan();
    paymentMethodInput.disabled = !paymentReady || requiresAdminQuote;
    if (companyRegistrationReviewBtn) {
        companyRegistrationReviewBtn.disabled = !paymentReady;
    }

    if (!paymentReady || requiresAdminQuote) {
        if (paymentMethodInput.value) {
            paymentMethodInput.value = '';
        }
        stopCompanyRegistrationCheckoutPolling();
        clearCompanyRegistrationCheckoutState();
        resetCompanyRegistrationQrRequestState();
        renderCompanyRegistrationPaymentPreview();
        return;
    }

    if (regenerateIfNeeded) {
        stopCompanyRegistrationCheckoutPolling();
        clearCompanyRegistrationCheckoutState();
        resetCompanyRegistrationQrRequestState();
    }

    renderCompanyRegistrationPaymentPreview();
}

function saveCompanyRegistrationCheckoutState(value = {}) {
    try {
        window.sessionStorage.setItem(COMPANY_REGISTRATION_CHECKOUT_STORAGE_KEY, JSON.stringify(value || {}));
    } catch (_error) {
        // Ignore storage issues and continue with the visible flow.
    }
}

function readCompanyRegistrationCheckoutState() {
    try {
        const raw = window.sessionStorage.getItem(COMPANY_REGISTRATION_CHECKOUT_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (_error) {
        return null;
    }
}

function clearCompanyRegistrationCheckoutState() {
    try {
        window.sessionStorage.removeItem(COMPANY_REGISTRATION_CHECKOUT_STORAGE_KEY);
    } catch (_error) {
        // Ignore storage issues.
    }
}

function stopCompanyRegistrationCheckoutPolling() {
    if (state.companyRegistrationCheckoutPollTimer) {
        window.clearTimeout(state.companyRegistrationCheckoutPollTimer);
        state.companyRegistrationCheckoutPollTimer = null;
    }
}

function scheduleCompanyRegistrationCheckoutPolling(delayMs = 5000) {
    stopCompanyRegistrationCheckoutPolling();
    const requestCode = String(state.companyRegistrationPaymongoQr?.requestCode || readCompanyRegistrationCheckoutState()?.requestCode || '').trim();
    if (!requestCode || !isCompanyRegistrationIntent()) {
        return;
    }

    state.companyRegistrationCheckoutPollTimer = window.setTimeout(() => {
        state.companyRegistrationCheckoutPollTimer = null;
        const stored = readCompanyRegistrationCheckoutState();
        void finalizeCompanyRegistrationCheckout({
            requestCode,
            contactNumber: String(stored?.contactNumber || '').trim(),
            silent: true
        });
    }, Math.max(1500, Number(delayMs || 5000)));
}

function applyCompanyRegistrationCheckoutCompletion(payload = {}) {
    const request = payload?.request || null;
    const requestMeta = (request?.requestMeta && typeof request.requestMeta === 'object' && !Array.isArray(request.requestMeta))
        ? request.requestMeta
        : {};
    const company = payload?.company || null;
    const admin = payload?.admin || null;
    const emailDelivery = payload?.emailDelivery || {};
    const amountPhp = Number(requestMeta.quotedAmountPhp || payload?.amountPhp || 0);

    if (request) {
        applyThread({
            request,
            messages: Array.isArray(payload?.messages) ? payload.messages : []
        });
    }

    state.companyRegistrationLastSubmission = {
        requestCode: String(request?.requestCode || '').trim(),
        contactNumber: String(request?.contactNumber || '').trim(),
        paymentMethod: String(requestMeta.paymentMethod || '').trim(),
        referenceId: String(requestMeta.checkoutSessionId || '').trim() || '-',
        amountLabel: amountPhp > 0 ? formatPhpAmount(amountPhp) : '',
        requestedPlan: String(requestMeta.requestedPlan || '').trim(),
        isAdminQuotePlan: false,
        fullyProvisioned: Boolean(payload?.completed && company),
        requiresManualReview: Boolean(payload?.requiresManualReview),
        manualReviewReason: String(payload?.error || requestMeta.provisioningError || '').trim(),
        companyCode: String(company?.company_code || requestMeta.provisionedCompanyCode || '').trim(),
        adminUsername: String(admin?.username || requestMeta.provisionedAdminUsername || '').trim(),
        email: String(admin?.email || requestMeta.email || '').trim(),
        emailSent: Boolean(emailDelivery.sent),
        emailDeliveryError: String(emailDelivery.reason || requestMeta.emailDeliveryError || '').trim()
    };
}

async function finalizeCompanyRegistrationCheckout({
    requestCode = '',
    contactNumber = '',
    silent = false
} = {}) {
    const stored = readCompanyRegistrationCheckoutState();
    const normalizedRequestCode = String(requestCode || stored?.requestCode || '').trim().toUpperCase();
    const normalizedContactNumber = String(contactNumber || stored?.contactNumber || lookupContactInput?.value || '').trim();

    if (!normalizedRequestCode || !normalizedContactNumber) {
        return null;
    }

    try {
        const payload = await appClient.completePublicCompanyRegistrationCheckout({
            requestCode: normalizedRequestCode,
            contactNumber: normalizedContactNumber
        });

        if (payload?.completed || payload?.requiresManualReview) {
            stopCompanyRegistrationCheckoutPolling();
            applyCompanyRegistrationCheckoutCompletion(payload);
            clearCompanyRegistrationCheckoutState();
            resetCompanyRegistrationQrRequestState();
            setCompanyRegistrationStep(3);
            if (payload.completed) {
                const companyCode = state.companyRegistrationLastSubmission?.companyCode || '-';
                const emailTarget = state.companyRegistrationLastSubmission?.email || 'the provided email';
                const emailStatus = state.companyRegistrationLastSubmission?.emailSent
                    ? `Admin credentials were sent to ${emailTarget}.`
                    : 'Admin credentials email could not be sent automatically.';
                setPaymentGenerateStatus(`Payment confirmed. Company ID ${companyCode} is ready.`, false);
                setStatus(`Payment confirmed. Company ID ${companyCode} is ready. ${emailStatus}`, false);
            } else {
                setPaymentGenerateStatus('Payment confirmed. Automatic setup now needs admin review.', false);
                setStatus('Payment confirmed. Automatic setup now needs admin review before the Company ID is released.', false);
            }
            return payload;
        }

        if (!silent) {
            setPaymentGenerateStatus('Waiting for PayMongo to confirm the payment. This page will continue automatically once it is reflected.', false);
            setStatus(`Payment QR ready for request ${normalizedRequestCode}. Once the transfer is confirmed, your Company ID will be created automatically.`, false);
        }
        scheduleCompanyRegistrationCheckoutPolling();
        return payload;
    } catch (error) {
        if (!silent) {
            const message = error?.message || 'Unable to finalize this checkout yet.';
            setPaymentGenerateStatus(message, true);
            setStatus(message, true);
        }
        return null;
    }
}

async function handleCompanyRegistrationCheckoutReturn(params = new URLSearchParams(window.location.search)) {
    if (!isCompanyRegistrationIntent()) {
        return;
    }

    const checkoutState = String(params.get('checkout') || '').trim().toLowerCase();
    if (!checkoutState) {
        return;
    }

    const stored = readCompanyRegistrationCheckoutState();
    const requestCode = String(params.get('requestCode') || stored?.requestCode || '').trim();
    const contactNumber = String(params.get('contactNumber') || stored?.contactNumber || '').trim();

    if (requestCodeInput && requestCode) {
        requestCodeInput.value = requestCode;
    }
    if (lookupContactInput && contactNumber) {
        lookupContactInput.value = contactNumber;
    }

    if (checkoutState === 'success') {
        setCompanyRegistrationStep(2);
        setStatus(
            requestCode
                ? `Payment completed. Finalizing request ${requestCode}...`
                : 'Payment completed. Finalizing your company registration...',
            false
        );
        if (requestCode && contactNumber) {
            const payload = await finalizeCompanyRegistrationCheckout({
                requestCode,
                contactNumber,
                silent: false
            });
            if (!payload?.completed && !payload?.requiresManualReview) {
                setPaymentGenerateStatus('Payment was detected. Waiting for PayMongo confirmation before automatic company setup continues.', false);
            }
        } else {
            setStatus('Payment completed. Open your request thread so we can continue the setup.', false);
        }
    } else if (checkoutState === 'cancel') {
        setCompanyRegistrationStep(2);
        stopCompanyRegistrationCheckoutPolling();
        clearCompanyRegistrationCheckoutState();
        resetCompanyRegistrationQrRequestState();
        setStatus('Checkout was canceled. You can change the payment method or continue again when ready.', true);
        renderCompanyRegistrationPaymentPreview();
    }

    const cleanUrl = `${window.location.pathname}?intent=register_company_id`;
    window.history.replaceState({}, document.title, cleanUrl);
}

function renderCompanyRegistrationPlanCatalog() {
    if (!requestedPlanInput || !companyRegistrationPlanCatalog || !isCompanyRegistrationIntent()) {
        return;
    }

    const options = getCompanyRegistrationSubscriptionOptions();
    const selectedValue = String(requestedPlanInput.value || '').trim();
    requestedPlanInput.innerHTML = ['<option value="">Select subscription</option>']
        .concat(options.map((entry) => `<option value="${escapeHtml(entry.value)}">${escapeHtml(`${entry.title} | ${entry.priceLabel}`)}</option>`))
        .join('');

    if (selectedValue && options.some((entry) => entry.value === selectedValue)) {
        requestedPlanInput.value = selectedValue;
    }

    if (!options.length) {
        companyRegistrationPlanCatalog.innerHTML = `
            <div class="subscription-card">
                <div class="subscription-card-head">
                    <div class="subscription-card-title">No subscriptions available yet</div>
                </div>
                <div class="subscription-card-copy">Ask the admin to set up at least one plan before using this form.</div>
            </div>
        `;
        return;
    }

    const featuredKey = getFeaturedCompanyRegistrationPlanKey(options);
    companyRegistrationPlanCatalog.innerHTML = options.map((entry) => {
        const isSelected = entry.value === requestedPlanInput.value;
        const isFeatured = entry.key === featuredKey;
        const isCustom = entry.key === 'lifetime_access';
        const selectedClass = isSelected ? ' is-selected' : '';
        const featuredClass = isFeatured ? ' is-featured' : '';
        const customClass = isCustom ? ' is-custom' : '';
        const priceParts = splitCompanyRegistrationPriceLabel(entry.priceLabel);
        const detailLines = splitCompanyRegistrationMultilineText(entry.copy, 5);
        const summaryLine = detailLines[0] || (isCustom ? 'One-time payment with custom final pricing.' : 'Monthly subscription plan.');
        const featureLines = (detailLines.slice(1).length ? detailLines.slice(1) : [summaryLine]).slice(0, 3);
        const badgeLabel = isSelected
            ? 'Selected'
            : isFeatured
            ? 'Most Popular'
            : isCustom
            ? 'One-time'
            : 'Monthly';
        const kickerLabel = isCustom ? 'Flexible setup' : 'Subscription plan';
        const ctaLead = isSelected
            ? 'Ready for payment'
            : isCustom
            ? 'Ask for final quote'
            : 'Choose this plan';
        const ctaState = isSelected ? 'Selected plan' : 'Tap to select';

        return `
            <button type="button" class="subscription-card${selectedClass}${featuredClass}${customClass}" data-plan-value="${escapeHtml(entry.value)}">
                <div class="subscription-card-badge-row">
                    <span class="subscription-card-badge${isSelected ? ' is-selected' : ''}${isFeatured ? ' is-featured' : ''}${isCustom ? ' is-custom' : ''}">${escapeHtml(badgeLabel)}</span>
                    <span class="subscription-card-kicker">${escapeHtml(kickerLabel)}</span>
                </div>
                <div class="subscription-card-head">
                    <div class="subscription-card-title-wrap">
                        <div class="subscription-card-title">${escapeHtml(entry.title)}</div>
                        <div class="subscription-card-summary">${escapeHtml(summaryLine)}</div>
                    </div>
                </div>
                <div class="subscription-card-price-block">
                    <div class="subscription-card-value">${escapeHtml(priceParts.main)}</div>
                    <div class="subscription-card-term">${escapeHtml(priceParts.note || (isCustom ? 'Final pricing by approval' : 'Recurring monthly rate'))}</div>
                </div>
                <div class="subscription-card-copy">${escapeHtml(entry.copy)}</div>
                <div class="subscription-card-outline">Includes</div>
                <div class="subscription-card-features">
                    ${featureLines.map((line) => `
                        <div class="subscription-card-feature">
                            <span class="subscription-card-feature-icon">${isCustom ? '*' : '+'}</span>
                            <span class="subscription-card-feature-text">${escapeHtml(line)}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="subscription-card-meta">${escapeHtml(entry.meta)}</div>
                <div class="subscription-card-cta">
                    <span class="subscription-card-cta-label">${escapeHtml(ctaLead)}</span>
                    <span class="subscription-card-cta-state">${escapeHtml(ctaState)}</span>
                </div>
            </button>
        `;
    }).join('');

    updateCompanyRegistrationPaymentAvailability();
}

function handleCompanyRegistrationPlanCatalogClick(event) {
    const target = event.target instanceof HTMLElement
        ? event.target.closest('[data-plan-value]')
        : null;
    if (!(target instanceof HTMLElement) || !requestedPlanInput) {
        return;
    }

    const value = String(target.dataset.planValue || '').trim();
    if (!value) {
        return;
    }

    requestedPlanInput.value = value;
    renderCompanyRegistrationPlanCatalog();
    updateCompanyRegistrationPaymentAvailability({ regenerateIfNeeded: true });
    validateCompanyRegistrationForm({ silent: true });
    renderCompanyRegistrationReview();
    const selectedPlanLabel = getSelectedCompanyRegistrationSubscriptionLabel();
    if (selectedPlanLabel) {
        setStatus(`${selectedPlanLabel} selected. You can keep comparing or continue filling the form when ready.`, false);
    }
}

async function loadCompanyRegistrationPlans() {
    if (!isCompanyRegistrationIntent()) {
        return;
    }

    try {
        const payload = await appClient.getPublicCompanyRegistrationPlans();
        state.companyRegistrationPlans = dedupeCompanyRegistrationPlans(payload);
    } catch (_error) {
        state.companyRegistrationPlans = [];
    }

    renderCompanyRegistrationPlanCatalog();
}

async function createRequest() {
    if (isCompanyRegistrationIntent()) {
        await createCompanyRegistrationRequest();
        return;
    }

    await createCustomerSupportRequest();
}

async function createCustomerSupportRequest() {
    const companyCode = readCompanyCode();
    const clientName = clientNameInput.value.trim();
    const contactNumber = contactNumberInput.value.trim();
    const signupEmail = signupEmailInput ? signupEmailInput.value.trim() : '';
    const signupId = signupIdInput ? signupIdInput.value.trim() : '';
    const signupRole = signupRoleInput ? signupRoleInput.value.trim() : '';
    const defaultDetails = isSignupIntent() ? 'Account sign up request' : 'Customer chat thread';
    const requestDetails = requestDetailsInput.value.trim() || defaultDetails;
    const initialMessage = initialMessageInput.value.trim();

    if (!companyCode || !clientName || !contactNumber) {
        setStatus('Company ID, name, and contact number are required.', true);
        return;
    }

    if (isSignupIntent()) {
        if (!signupEmail || !signupId) {
            setStatus('Email and desired employee ID are required for sign up.', true);
            return;
        }
        if (!isValidEmail(signupEmail)) {
            setStatus('Please provide a valid email address.', true);
            return;
        }
    }

    if (!initialMessage && !isSignupIntent()) {
        setStatus('Please enter an initial message to start the chat.', true);
        return;
    }

    setBusy(createRequestBtn, true);
    setStatus(isSignupIntent() ? 'Submitting sign up request...' : 'Starting chat...', false);

    try {
        const requestMeta = isSignupIntent()
            ? {
                intent: 'signup',
                name: clientName,
                email: signupEmail,
                role: signupRole || 'employee',
                desiredId: signupId,
                contactNumber
            }
            : {};
        const signupMessage = isSignupIntent()
            ? buildSignupMessage({
                name: clientName,
                email: signupEmail,
                role: signupRole || 'employee',
                desiredId: signupId,
                contactNumber,
                notes: requestDetails
            })
            : '';
        const finalInitialMessage = initialMessage || signupMessage;
        const payload = await appClient.createPublicCustomerRequest({
            companyCode,
            clientName,
            contactNumber,
            requestDetails,
            initialMessage: finalInitialMessage,
            requestMeta
        });
        applyThread(payload);
        requestCodeInput.value = payload?.request?.requestCode || '';
        lookupContactInput.value = payload?.request?.contactNumber || contactNumber;
        initialMessageInput.value = '';
        setStatus(
            isSignupIntent()
                ? `Sign up request submitted. Your code is ${payload?.request?.requestCode || '-'}. Wait for admin approval.`
                : `Chat started. Your code is ${payload?.request?.requestCode || '-'}.`,
            false
        );
    } catch (error) {
        setStatus(error.message || 'Unable to submit request.', true);
    } finally {
        setBusy(createRequestBtn, false);
    }
}

async function createCompanyRegistrationRequest() {
    const businessName = companyRequestBusinessNameInput ? companyRequestBusinessNameInput.value.trim() : '';
    const clientName = clientNameInput.value.trim();
    const contactNumber = contactNumberInput.value.trim();
    const email = companyRequestEmailInput ? companyRequestEmailInput.value.trim() : '';
    const desiredCompanyCode = normalizeDesiredCompanyCode(desiredCompanyIdInput ? desiredCompanyIdInput.value : '');
    const adminId = normalizeDesiredCompanyCode(adminIdInput ? adminIdInput.value : '');
    const requestedPlan = getSelectedCompanyRegistrationSubscriptionLabel();
    const requestedPlanKey = getSelectedCompanyRegistrationSubscriptionValue();
    const paymentMethod = paymentMethodInput ? paymentMethodInput.value.trim() : '';
    const paymentReference = paymentReferenceInput ? paymentReferenceInput.value.trim() : '';
    const notes = requestDetailsInput.value.trim();
    const extraMessage = initialMessageInput.value.trim();

    if (desiredCompanyIdInput) {
        desiredCompanyIdInput.value = desiredCompanyCode;
    }

    if (!businessName || !clientName || !contactNumber || !email || !desiredCompanyCode || !adminId || !requestedPlanKey || !paymentMethod) {
        setStatus('Company name, Company ID, Admin ID, contact person, contact number, email, subscription, and mode of payment are required.', true);
        return;
    }

    if (!isValidEmail(email)) {
        setStatus('Please provide a valid email address.', true);
        return;
    }

    const requestDetails = buildCompanyRegistrationSummary({
        businessName,
        adminId,
        contactName: clientName,
        email,
        desiredCompanyCode,
        requestedPlan,
        paymentMethod,
        paymentReference,
        contactNumber
    });
    const finalInitialMessage = buildCompanyRegistrationMessage({
        businessName,
        adminId,
        contactName: clientName,
        email,
        desiredCompanyCode,
        requestedPlan,
        paymentMethod,
        paymentReference,
        contactNumber,
        notes,
        extraMessage
    });

    setBusy(createRequestBtn, true);
    setStatus('Submitting manual company ID request...', false);

    try {
        const payload = await appClient.createPublicCompanyRegistrationRequest({
            clientName,
            contactNumber,
            requestDetails,
            initialMessage: finalInitialMessage,
            requestMeta: {
                intent: 'register_company_id',
                companyName: businessName,
                email,
                desiredCompanyCode,
                adminId,
                requestedPlan,
                requestedPlanKey,
                paymentMethod,
                paymentReference
            }
        });
        applyThread(payload);
        requestCodeInput.value = payload?.request?.requestCode || '';
        lookupContactInput.value = payload?.request?.contactNumber || contactNumber;
        initialMessageInput.value = '';
        setStatus(
            `Manual company ID request submitted. Your code is ${payload?.request?.requestCode || '-'}. The team will review your details and payment note.`,
            false
        );
    } catch (error) {
        setStatus(error.message || 'Unable to submit company ID request.', true);
    } finally {
        setBusy(createRequestBtn, false);
    }
}

async function prepareCompanyRegistrationPaymentStep() {
    if (!isCompanyRegistrationIntent()) {
        return;
    }

    const validation = validateCompanyRegistrationForm();
    if (!validation.valid) {
        setCompanyRegistrationStep(1);
        setStatus('Please complete the required fields before continuing to payment.', true);
        return;
    }

    const checkoutDetails = getSelectedCompanyRegistrationCheckoutDetails();
    const requiresAdminQuote = Boolean(checkoutDetails.selectedPlan && checkoutDetails.selectedPlan.key === 'lifetime_access');
    renderCompanyRegistrationPaymentPreview();
    if (requiresAdminQuote) {
        stopCompanyRegistrationCheckoutPolling();
        clearCompanyRegistrationCheckoutState();
        resetCompanyRegistrationQrRequestState();
        const message = 'Lifetime Access is handled manually. Submit the request and wait for the website admin to confirm the final one-time price and approval.';
        setPaymentGenerateStatus(message, false);
        setStatus(message, false);
        return;
    }

    if (!checkoutDetails.checkoutSupported) {
        const message = checkoutDetails.reason || 'This subscription is not ready for payment yet.';
        setStatus(message, true);
        setPaymentGenerateStatus(message, true);
        return;
    }

    if (!String(paymentMethodInput?.value || '').trim()) {
        setPaymentGenerateStatus('Choose a mode of payment, then generate the payment QR when you are ready.', false);
        setStatus('Step 2 is ready. Choose a mode of payment to continue.', false);
        return;
    }

    const selectedMethodKey = normalizeCompanyRegistrationPaymentMethodKey(paymentMethodInput.value);
    const activeCheckout = getCompanyRegistrationPaymongoQrState(selectedMethodKey);
    if (activeCheckout && String(activeCheckout.requestCode || '').trim()) {
        setPaymentGenerateStatus(`Payment QR ready for ${paymentMethodInput.value}. Once PayMongo confirms the transfer, this page will finish your Company ID automatically.`, false);
        setStatus(`Payment QR ready for request ${activeCheckout.requestCode}. Complete the payment and wait for automatic confirmation.`, false);
        scheduleCompanyRegistrationCheckoutPolling();
        return;
    }

    setPaymentGenerateStatus('Review the amount, then click Generate Payment QR when you are ready to pay.', false);
    setStatus('Step 2 is ready. Generate the payment QR when you want to continue.', false);
}

async function startCompanyRegistrationCheckout() {
    if (!isCompanyRegistrationIntent()) {
        return;
    }

    const businessName = companyRequestBusinessNameInput ? companyRequestBusinessNameInput.value.trim() : '';
    const clientName = clientNameInput.value.trim();
    const contactNumber = contactNumberInput.value.trim();
    const email = companyRequestEmailInput ? companyRequestEmailInput.value.trim() : '';
    const desiredCompanyCode = normalizeDesiredCompanyCode(desiredCompanyIdInput ? desiredCompanyIdInput.value : '');
    const adminId = normalizeDesiredCompanyCode(adminIdInput ? adminIdInput.value : '');
    const requestedPlan = getSelectedCompanyRegistrationSubscriptionLabel();
    const requestedPlanKey = getSelectedCompanyRegistrationSubscriptionValue();
    const paymentMethod = paymentMethodInput ? paymentMethodInput.value.trim() : '';
    const paymentReference = paymentReferenceInput ? paymentReferenceInput.value.trim() : '';
    const notes = requestDetailsInput.value.trim();
    const extraMessage = initialMessageInput.value.trim();
    const checkoutDetails = getSelectedCompanyRegistrationCheckoutDetails();
    const requiresAdminQuote = Boolean(checkoutDetails.selectedPlan && checkoutDetails.selectedPlan.key === 'lifetime_access');
    const paymentMethodKey = normalizeCompanyRegistrationPaymentMethodKey(paymentMethod);

    if (desiredCompanyIdInput) {
        desiredCompanyIdInput.value = desiredCompanyCode;
    }
    if (adminIdInput) {
        adminIdInput.value = adminId;
    }

    if (!businessName || !clientName || !contactNumber || !email || !desiredCompanyCode || !adminId || !requestedPlanKey || (!requiresAdminQuote && !paymentMethod)) {
        const message = requiresAdminQuote
            ? 'Complete the required company details and subscription first before submitting the Lifetime Access request.'
            : 'Complete the required company details, Company ID, Admin ID, subscription, and payment method first.';
        setStatus(message, true);
        setPaymentGenerateStatus(message, true);
        return;
    }

    if (!isValidEmail(email)) {
        const message = 'Please provide a valid email address.';
        setStatus(message, true);
        setPaymentGenerateStatus(message, true);
        return;
    }

    if (requiresAdminQuote) {
        state.companyRegistrationQrLoading = true;
        setPaymentGenerateStatus('Submitting Lifetime Access request...', false);
        renderCompanyRegistrationPaymentPreview();
        setStatus('Submitting Lifetime Access request...', false);

        try {
            const paymentSummary = 'Admin quote required';
            const requestDetails = buildCompanyRegistrationSummary({
                businessName,
                adminId,
                contactName: clientName,
                email,
                desiredCompanyCode,
                requestedPlan,
                paymentMethod: paymentSummary,
                paymentReference,
                contactNumber
            });
            const finalInitialMessage = buildCompanyRegistrationMessage({
                businessName,
                adminId,
                contactName: clientName,
                email,
                desiredCompanyCode,
                requestedPlan,
                paymentMethod: paymentSummary,
                paymentReference,
                contactNumber,
                notes,
                extraMessage
            });
            const payload = await appClient.createPublicCompanyRegistrationRequest({
                clientName,
                contactNumber,
                requestDetails,
                initialMessage: finalInitialMessage,
                requestMeta: {
                    intent: 'register_company_id',
                    companyName: businessName,
                    email,
                    desiredCompanyCode,
                    adminId,
                    requestedPlan,
                    requestedPlanKey,
                    paymentMethod: paymentSummary,
                    paymentReference
                }
            });
            const requestCode = String(payload?.request?.requestCode || '').trim();
            state.companyRegistrationLastSubmission = {
                requestCode,
                contactNumber,
                paymentMethod: paymentSummary,
                referenceId: '-',
                amountLabel: 'Custom one-time price',
                requestedPlan,
                isAdminQuotePlan: true
            };
            if (requestCodeInput) {
                requestCodeInput.value = requestCode;
            }
            if (lookupContactInput) {
                lookupContactInput.value = payload?.request?.contactNumber || contactNumber;
            }
            applyThread(payload);
            setCompanyRegistrationStep(3);
            setPaymentGenerateStatus('Lifetime Access request submitted. Waiting for admin quote and approval.', false);
            setStatus(`Lifetime Access request submitted. Your request code is ${requestCode || '-'}. Waiting for admin quote and approval.`, false);
        } catch (error) {
            const message = error?.message || 'Unable to submit the Lifetime Access request right now.';
            setPaymentGenerateStatus(message, true);
            setStatus(message, true);
        } finally {
            state.companyRegistrationQrLoading = false;
            renderCompanyRegistrationPaymentPreview();
        }
        return;
    }

    if (!checkoutDetails.checkoutSupported) {
        const message = checkoutDetails.reason || 'This subscription is not ready for secure checkout yet.';
        setStatus(message, true);
        setPaymentGenerateStatus(message, true);
        return;
    }

    if (state.companyRegistrationQrLoading) {
        const message = 'Please wait while we generate the payment QR code.';
        setStatus(message, true);
        setPaymentGenerateStatus(message, true);
        return;
    }

    const activeCheckout = getCompanyRegistrationPaymongoQrState(paymentMethodKey);
    if (activeCheckout && String(activeCheckout.requestCode || '').trim()) {
        saveCompanyRegistrationCheckoutState({
            requestCode: String(activeCheckout.requestCode || '').trim(),
            contactNumber: String(activeCheckout.contactNumber || contactNumber).trim(),
            checkoutSessionId: String(activeCheckout.checkoutSessionId || '').trim(),
            checkoutUrl: String(activeCheckout.checkoutUrl || '').trim(),
            paymentMethod,
            requestedPlan,
            amountLabel: checkoutDetails.amountLabel
        });
        setPaymentGenerateStatus(`Payment QR ready for ${paymentMethod}. Once PayMongo confirms the transfer, this page will continue automatically.`, false);
        setStatus(`Payment QR ready for request ${activeCheckout.requestCode || '-'}. Complete the exact-amount payment and wait for automatic confirmation.`, false);
        scheduleCompanyRegistrationCheckoutPolling();
        return;
    }

    state.companyRegistrationQrLoading = true;
    setPaymentGenerateStatus('Creating secure payment QR...', false);
    renderCompanyRegistrationPaymentPreview();
    setStatus('Creating secure payment QR...', false);

    try {
        const payload = await appClient.createPublicCompanyRegistrationCheckoutSession(
            buildCompanyRegistrationPaymentPreviewPayload()
        );
        const checkoutUrl = String(payload?.checkoutUrl || '').trim();
        const requestCode = String(payload?.requestCode || payload?.request?.requestCode || '').trim();
        state.companyRegistrationPaymongoQr = payload
            ? {
                ...payload,
                enabled: Boolean(checkoutUrl),
                qrImage: checkoutUrl ? buildCompanyRegistrationQrImageUrl(checkoutUrl) : '',
                supportedMethods: Array.isArray(payload.supportedMethods) ? payload.supportedMethods : (paymentMethodKey ? [paymentMethodKey] : []),
                requestCode,
                contactNumber: String(payload?.request?.contactNumber || contactNumber).trim()
            }
            : null;
        state.companyRegistrationQrRequested = Boolean(checkoutUrl);
        state.companyRegistrationQrMethodKey = paymentMethodKey;
        if (requestCodeInput) {
            requestCodeInput.value = requestCode || '';
        }
        if (lookupContactInput) {
            lookupContactInput.value = payload?.request?.contactNumber || contactNumber;
        }
        applyThread({
            request: payload?.request || null,
            messages: Array.isArray(payload?.messages) ? payload.messages : []
        });
        saveCompanyRegistrationCheckoutState({
            requestCode,
            contactNumber: String(payload?.request?.contactNumber || contactNumber).trim(),
            checkoutSessionId: String(payload?.checkoutSessionId || '').trim(),
            checkoutUrl,
            paymentMethod,
            requestedPlan,
            amountLabel: checkoutDetails.amountLabel
        });
        scheduleCompanyRegistrationCheckoutPolling();
        setPaymentGenerateStatus(`Payment QR ready for ${paymentMethod}. Once the payment is reflected, this page will move to the submitted state automatically.`, false);
        setStatus(`Payment QR ready. Request ${requestCode || '-'}. Scan the QR to pay the exact amount, then wait for automatic company setup.`, false);
    } catch (error) {
        stopCompanyRegistrationCheckoutPolling();
        clearCompanyRegistrationCheckoutState();
        resetCompanyRegistrationQrRequestState();
        const message = error?.message || 'Unable to create the secure checkout right now.';
        setPaymentGenerateStatus(message, true);
        setStatus(message, true);
    } finally {
        state.companyRegistrationQrLoading = false;
        renderCompanyRegistrationPaymentPreview();
    }
}

async function openRequestThread() {
    const requestCode = requestCodeInput.value.trim().toUpperCase();
    const contactNumber = lookupContactInput.value.trim();

    if (isCompanyRegistrationIntent()) {
        if (!requestCode || !contactNumber) {
            setStatus('Request code and contact number are required.', true);
            return;
        }

        setBusy(openRequestBtn, true);
        setStatus(`Loading ${requestCode}...`, false);

        try {
            const payload = await appClient.getPublicCompanyRegistrationRequest({
                requestCode,
                contactNumber
            });
            applyThread(payload);
            setStatus(`Loaded request ${payload?.request?.requestCode || requestCode}.`, false);
        } catch (error) {
            setStatus(error.message || 'Unable to open request.', true);
        } finally {
            setBusy(openRequestBtn, false);
        }
        return;
    }

    const companyCode = readCompanyCode();
    if (!companyCode || !requestCode || !contactNumber) {
        setStatus('Company ID, request code, and contact number are required.', true);
        return;
    }

    setBusy(openRequestBtn, true);
    setStatus(`Loading ${requestCode}...`, false);

    try {
        const payload = await appClient.getPublicCustomerRequest({
            companyCode,
            requestCode,
            contactNumber
        });
        applyThread(payload);
        setStatus(`Loaded request ${payload?.request?.requestCode || requestCode}.`, false);
    } catch (error) {
        setStatus(error.message || 'Unable to open request.', true);
    } finally {
        setBusy(openRequestBtn, false);
    }
}

async function refreshThread() {
    if (!state.requestCode || !state.authContactNumber) {
        setStatus('Open a request first.', true);
        return;
    }

    setStatus('Refreshing request thread...', false);
    try {
        const payload = isCompanyRegistrationIntent()
            ? await appClient.getPublicCompanyRegistrationRequest({
                requestCode: state.requestCode,
                contactNumber: state.authContactNumber
            })
            : await appClient.getPublicCustomerRequest({
                companyCode: state.companyCode,
                requestCode: state.requestCode,
                contactNumber: state.authContactNumber
            });
        applyThread(payload);
        setStatus('Thread updated.', false);
    } catch (error) {
        setStatus(error.message || 'Unable to refresh thread.', true);
    }
}

async function saveRequestEdits() {
    if (!state.thread?.request?.requestCode) {
        setStatus('Open a request first.', true);
        return;
    }

    if (!state.thread.request.allowCustomerEdit) {
        setStatus('This request is currently locked for customer edits.', true);
        return;
    }

    const requestCode = state.thread.request.requestCode;
    const nextName = editNameInput.value.trim();
    const nextContact = editContactInput.value.trim();
    const nextDetails = editDetailsInput.value.trim();

    if (!nextName || !nextContact) {
        setStatus('Name and contact number are required.', true);
        return;
    }

    setBusy(saveRequestBtn, true);
    setStatus(`Saving edits for ${requestCode}...`, false);

    try {
        const payload = isCompanyRegistrationIntent()
            ? await appClient.updatePublicCompanyRegistrationRequest(
                requestCode,
                {
                    clientName: nextName,
                    contactNumber: nextContact,
                    requestDetails: nextDetails,
                    authContactNumber: state.authContactNumber
                },
                {
                    contactNumber: state.authContactNumber
                }
            )
            : await appClient.updatePublicCustomerRequest(
                requestCode,
                {
                    clientName: nextName,
                    contactNumber: nextContact,
                    requestDetails: nextDetails,
                    authContactNumber: state.authContactNumber
                },
                {
                    companyCode: state.companyCode,
                    contactNumber: state.authContactNumber
                }
            );
        applyThread(payload);
        lookupContactInput.value = payload?.request?.contactNumber || nextContact;
        setStatus(`Request ${requestCode} updated.`, false);
    } catch (error) {
        setStatus(error.message || 'Unable to save request edits.', true);
    } finally {
        setBusy(saveRequestBtn, false);
    }
}

async function sendMessage() {
    if (!state.thread?.request?.requestCode) {
        setStatus('Open a request first.', true);
        return;
    }

    const message = chatMessageInput.value.trim();
    if (!message) {
        setStatus('Message cannot be empty.', true);
        return;
    }

    setBusy(sendMessageBtn, true);
    setStatus('Sending message...', false);

    try {
        const payload = isCompanyRegistrationIntent()
            ? await appClient.sendPublicCompanyRegistrationRequestMessage(
                state.thread.request.requestCode,
                {
                    message,
                    senderName: editNameInput.value.trim() || state.thread.request.clientName,
                    authContactNumber: state.authContactNumber
                },
                {
                    contactNumber: state.authContactNumber
                }
            )
            : await appClient.sendPublicCustomerRequestMessage(
                state.thread.request.requestCode,
                {
                    message,
                    senderName: editNameInput.value.trim() || state.thread.request.clientName,
                    authContactNumber: state.authContactNumber
                },
                {
                    companyCode: state.companyCode,
                    contactNumber: state.authContactNumber
                }
            );
        chatMessageInput.value = '';
        applyThread(payload);
        setStatus('Message sent.', false);
    } catch (error) {
        setStatus(error.message || 'Unable to send message.', true);
    } finally {
        setBusy(sendMessageBtn, false);
    }
}

function applyThread(payload) {
    if (!payload?.request) {
        return;
    }

    const request = payload.request;
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const requestIntent = normalizeIntent(request?.requestMeta?.intent || state.intent);

    if (requestIntent !== state.intent) {
        state.intent = requestIntent;
        applyIntentDefaults();
    }

    state.thread = payload;
    state.requestCode = String(request.requestCode || '').trim();
    state.authContactNumber = String(request.contactNumber || state.authContactNumber || '').trim();

    if (isCompanyRegistrationIntent()) {
        state.companyCode = '';
        companyCodeInput.value = '';
    } else {
        state.companyCode = payload.companyCode || state.companyCode || readCompanyCode();
        companyCodeInput.value = state.companyCode;
    }

    requestThreadSection.style.display = 'block';
    requestCodeLabel.textContent = request.requestCode || '-';
    requestEditableLabel.textContent = request.allowCustomerEdit ? 'Yes' : 'No (locked by admin)';
    requestUpdatedLabel.textContent = formatDateTime(request.updatedAt || request.createdAt);
    requestCodeInput.value = request.requestCode || '';

    requestStatusLabel.innerHTML = '';
    const statusPill = document.createElement('span');
    statusPill.className = `pill ${request.status || 'open'}`;
    statusPill.textContent = formatStatus(request.status);
    requestStatusLabel.appendChild(statusPill);

    editNameInput.value = request.clientName || '';
    editContactInput.value = request.contactNumber || '';
    editDetailsInput.value = request.requestDetails || '';

    const allowEdit = Boolean(request.allowCustomerEdit);
    [editNameInput, editContactInput, editDetailsInput, saveRequestBtn].forEach((input) => {
        input.disabled = !allowEdit;
    });

    renderMessages(messages);
}

function renderMessages(messages) {
    if (!messages.length) {
        chatMessages.innerHTML = '<div class="chat-empty">No messages yet.</div>';
        return;
    }

    chatMessages.innerHTML = '';
    messages.forEach((entry) => {
        const messageEl = document.createElement('div');
        const senderType = entry.senderType === 'admin' ? 'admin' : 'customer';
        messageEl.className = `chat-message ${senderType}`;

        const metaEl = document.createElement('div');
        metaEl.className = 'chat-meta';
        metaEl.textContent = `${entry.senderName || (senderType === 'admin' ? 'Admin' : 'Customer')} | ${formatDateTime(entry.createdAt)}`;

        const textEl = document.createElement('div');
        textEl.textContent = entry.message || '';
        textEl.style.whiteSpace = 'pre-wrap';

        messageEl.appendChild(metaEl);
        messageEl.appendChild(textEl);
        chatMessages.appendChild(messageEl);
    });

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function readCompanyCode() {
    state.companyCode = companyCodeInput.value.trim();
    return state.companyCode;
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function buildSignupMessage({ name, email, role, desiredId, contactNumber, notes } = {}) {
    const lines = [
        'Signup request details:',
        `Name: ${name || '-'}`,
        `Email: ${email || '-'}`,
        `Role: ${formatRoleLabel(role)}`,
        `Desired ID: ${desiredId || '-'}`,
        `Contact: ${contactNumber || '-'}`
    ];
    if (notes) {
        lines.push(`Notes: ${notes}`);
    }
    return lines.join('\n');
}

function buildCompanyRegistrationSummary({
    businessName,
    adminId,
    contactName,
    email,
    desiredCompanyCode,
    requestedPlan,
    paymentMethod,
    paymentReference,
    contactNumber
} = {}) {
    const lines = [
        'Company ID / subscription request:',
        `Company / Business Name: ${businessName || '-'}`,
        `Desired Company ID: ${desiredCompanyCode || '-'}`,
        `Admin ID: ${adminId || '-'}`,
        `Contact Person: ${contactName || '-'}`,
        `Contact Number: ${contactNumber || '-'}`,
        `Email: ${email || '-'}`,
        `Subscription / Package: ${requestedPlan || '-'}`,
        `Mode of Payment: ${paymentMethod || '-'}`,
        'Payment Status: Pending verification'
    ];
    if (paymentReference) {
        lines.push(`Payment Reference: ${paymentReference}`);
    }
    return lines.join('\n');
}

function buildCompanyRegistrationMessage({
    businessName,
    adminId,
    contactName,
    email,
    desiredCompanyCode,
    requestedPlan,
    paymentMethod,
    paymentReference,
    contactNumber,
    notes,
    extraMessage
} = {}) {
    const lines = [
        buildCompanyRegistrationSummary({
            businessName,
            adminId,
            contactName,
            email,
            desiredCompanyCode,
            requestedPlan,
            paymentMethod,
            paymentReference,
            contactNumber
        })
    ];

    if (notes) {
        lines.push(`Subscription Notes: ${notes}`);
    }
    if (extraMessage) {
        lines.push(`Extra Message: ${extraMessage}`);
    }

    return lines.join('\n');
}

function normalizeCompanyRegistrationPaymentMethodKey(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
        return '';
    }
    if (normalized === 'gcash') {
        return 'gcash';
    }
    if (normalized === 'maya') {
        return 'maya';
    }
    if (normalized === 'instapay' || normalized === 'insta pay') {
        return 'instapay';
    }
    if (normalized === 'bdo') {
        return 'bdo';
    }
    if (normalized === 'bpi') {
        return 'bpi';
    }
    if (normalized === 'other bank' || normalized === 'other_bank') {
        return 'other_bank';
    }
    return normalized.replace(/\s+/g, '_');
}

function buildCompanyRegistrationQrText({
    methodLabel = '',
    accountName = '',
    accountNumber = '',
    instructions = '',
    qrText = ''
} = {}) {
    const configuredQrText = String(qrText || '').trim();
    if (configuredQrText) {
        return configuredQrText;
    }
    return '';
}

function buildCompanyRegistrationQrImageUrl(payload = '') {
    const normalized = String(payload || '').trim();
    if (!normalized) {
        return '';
    }

    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(normalized)}`;
}

function canUsePaymongoCompanyRegistrationQr(methodKey = '') {
    return ['gcash', 'maya', 'instapay', 'bdo', 'bpi', 'other_bank'].includes(String(methodKey || '').trim());
}

function resolveConfiguredCompanyRegistrationQrImageSrc(value = '') {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return '';
    }
    if (/^data:/i.test(normalized) || /^https?:\/\//i.test(normalized)) {
        return normalized;
    }
    return buildCompanyRegistrationQrImageUrl(normalized);
}

function resolvePaymongoQrImageSrc(value = '') {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return '';
    }
    if (/^data:/i.test(normalized) || /^https?:\/\//i.test(normalized)) {
        return normalized;
    }
    return `data:image/png;base64,${normalized}`;
}

function getCompanyRegistrationPaymongoQrState(methodKey = '') {
    const payload = state.companyRegistrationPaymongoQr;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
    }

    const supportedMethods = Array.isArray(payload.supportedMethods) ? payload.supportedMethods : [];
    if (!payload.enabled || !payload.qrImage || !supportedMethods.includes(methodKey)) {
        return null;
    }

    return payload;
}

function resetCompanyRegistrationQrRequestState() {
    stopCompanyRegistrationCheckoutPolling();
    state.companyRegistrationQrRequested = false;
    state.companyRegistrationQrMethodKey = '';
    state.companyRegistrationQrLoading = false;
    state.companyRegistrationPaymongoQr = null;
}

function setPaymentGenerateStatus(message = '', isError = false) {
    if (!paymentGenerateStatus) {
        return;
    }

    paymentGenerateStatus.textContent = String(message || '').trim();
    paymentGenerateStatus.classList.toggle('is-error', Boolean(isError));
}

async function generateCompanyRegistrationQr({ force = false, auto = false } = {}) {
    if (!isCompanyRegistrationIntent()) {
        return;
    }

    const checkoutDetails = getSelectedCompanyRegistrationCheckoutDetails();
    const requiresAdminQuote = Boolean(checkoutDetails.selectedPlan && checkoutDetails.selectedPlan.key === 'lifetime_access');
    if (!checkoutDetails.checkoutSupported) {
        resetCompanyRegistrationQrRequestState();
        const message = requiresAdminQuote
            ? 'Lifetime Access is handled manually by the website admin. No QR payment is available here.'
            : (checkoutDetails.reason || 'This subscription is not ready for QR payment yet.');
        setPaymentGenerateStatus(message, !requiresAdminQuote);
        if (!auto) {
            setStatus(message, !requiresAdminQuote);
        }
        renderCompanyRegistrationPaymentPreview();
        return;
    }

    const selectedMethodLabel = String(paymentMethodInput?.value || '').trim();
    const selectedMethodKey = normalizeCompanyRegistrationPaymentMethodKey(selectedMethodLabel);
    if (!selectedMethodKey) {
        resetCompanyRegistrationQrRequestState();
        setPaymentGenerateStatus(
            auto
                ? 'Select a payment method and the QR will load automatically.'
                : 'Select a mode of payment first before refreshing the QR code.',
            Boolean(!auto)
        );
        if (!auto) {
            setStatus('Select a mode of payment first before refreshing the QR code.', true);
        }
        renderCompanyRegistrationPaymentPreview();
        return;
    }

    state.companyRegistrationQrRequested = true;
    state.companyRegistrationQrMethodKey = selectedMethodKey;

    const paymentConfig = state.companyRegistrationConfig || {};
    const methods = (paymentConfig.methods && typeof paymentConfig.methods === 'object' && !Array.isArray(paymentConfig.methods))
        ? paymentConfig.methods
        : {};
    const selectedMethodConfig = methods[selectedMethodKey] || {};
    const configuredQrSource = resolveConfiguredCompanyRegistrationQrImageSrc(selectedMethodConfig.qr_text);
    const cachedPaymongoQr = getCompanyRegistrationPaymongoQrState(selectedMethodKey);
    const supportsPaymongoQr = canUsePaymongoCompanyRegistrationQr(selectedMethodKey);

    if (!force && cachedPaymongoQr) {
        state.companyRegistrationQrLoading = false;
        setPaymentGenerateStatus(`Checkout QR ready for ${selectedMethodLabel}.`, false);
        renderCompanyRegistrationPaymentPreview();
        return;
    }

    if (!supportsPaymongoQr && configuredQrSource) {
        state.companyRegistrationQrLoading = false;
        setPaymentGenerateStatus(`QR ready for ${selectedMethodLabel}.`, false);
        renderCompanyRegistrationPaymentPreview();
        return;
    }

    if (!supportsPaymongoQr) {
        state.companyRegistrationQrLoading = false;
        setPaymentGenerateStatus('No QR generator is available for this payment method yet.', true);
        renderCompanyRegistrationPaymentPreview();
        return;
    }

    state.companyRegistrationQrLoading = true;
    setPaymentGenerateStatus(
        `${force ? 'Refreshing' : 'Loading'} secure checkout QR for ${selectedMethodLabel}...`,
        false
    );
    renderCompanyRegistrationPaymentPreview();

    try {
        const payload = await loadCompanyRegistrationPaymongoQr({ force, silent: true });
        if (state.companyRegistrationQrMethodKey !== selectedMethodKey) {
            return;
        }
        const livePaymongoQr = getCompanyRegistrationPaymongoQrState(selectedMethodKey);
        if (livePaymongoQr) {
            setPaymentGenerateStatus(`Checkout QR ready for ${selectedMethodLabel}.`, false);
            return;
        }

        const message = String(payload?.error || '').trim() || 'Unable to prepare secure checkout QR right now.';
        setPaymentGenerateStatus(message, true);
        setStatus(message, true);
    } catch (error) {
        if (state.companyRegistrationQrMethodKey !== selectedMethodKey) {
            return;
        }
        const message = error?.message || 'Unable to prepare secure checkout QR right now.';
        setPaymentGenerateStatus(message, true);
        setStatus(message, true);
    } finally {
        if (state.companyRegistrationQrMethodKey === selectedMethodKey) {
            state.companyRegistrationQrLoading = false;
            renderCompanyRegistrationPaymentPreview();
        }
    }
}

function handlePaymentQrImageError() {
    if (paymentQrImage) {
        paymentQrImage.hidden = true;
        paymentQrImage.removeAttribute('src');
    }
    if (paymentQrShell) {
        paymentQrShell.classList.remove('has-qr');
    }
    if (paymentQrFallback) {
        paymentQrFallback.hidden = false;
        paymentQrFallback.textContent = 'Unable to load the QR image right now. Refresh the page or change the payment method to generate a new QR.';
    }
    if (paymentQrCaption) {
        paymentQrCaption.hidden = true;
        paymentQrCaption.textContent = '';
    }
    setPaymentGenerateStatus('Unable to load the QR image right now. Refresh the page or generate a new payment QR.', true);
}

function renderCompanyRegistrationPaymentPreview() {
    if (!paymentPreviewCard || !isCompanyRegistrationIntent()) {
        return;
    }

    const paymentConfig = state.companyRegistrationConfig || {};
    const methods = (paymentConfig.methods && typeof paymentConfig.methods === 'object' && !Array.isArray(paymentConfig.methods))
        ? paymentConfig.methods
        : {};
    const selectedMethodLabel = String(paymentMethodInput?.value || '').trim();
    const selectedMethodKey = normalizeCompanyRegistrationPaymentMethodKey(selectedMethodLabel);
    const paymentReady = isCompanyRegistrationPaymentReady();
    const checkoutDetails = getSelectedCompanyRegistrationCheckoutDetails();
    const selectedPlan = checkoutDetails.selectedPlan;
    const selectedPlanLabel = selectedPlan
        ? `${selectedPlan.title}${selectedPlan.priceLabel ? ` (${selectedPlan.priceLabel})` : ''}`
        : '';
    const selectedPlanLines = selectedPlan ? splitCompanyRegistrationMultilineText(selectedPlan.copy, 5) : [];
    const selectedPlanSummary = selectedPlanLines[0]
        || (selectedPlan ? String(selectedPlan.meta || '').trim() : '')
        || 'Choose a subscription in Step 1 to unlock the payment details.';
    const selectedPlanHighlights = (selectedPlanLines.slice(1).length ? selectedPlanLines.slice(1) : [selectedPlanSummary]).slice(0, 4);
    const selectedPlanPriceParts = splitCompanyRegistrationPriceLabel(
        selectedPlan
            ? (checkoutDetails.amountLabel && checkoutDetails.amountLabel !== '-' ? checkoutDetails.amountLabel : selectedPlan.priceLabel)
            : '-'
    );
    const requiresAdminQuote = Boolean(selectedPlan && selectedPlan.key === 'lifetime_access');
    const featuredPlanKey = getFeaturedCompanyRegistrationPlanKey();
    const selectedMethodConfig = selectedMethodKey ? (methods[selectedMethodKey] || {}) : {};
    const displayMethodLabel = requiresAdminQuote
        ? 'Admin quote required'
        : (String(selectedMethodConfig.label || selectedMethodLabel || 'Waiting').trim() || 'Waiting');
    const accountName = String(selectedMethodConfig.account_name || '').trim();
    const accountNumber = String(selectedMethodConfig.account_number || '').trim();
    const instructions = String(selectedMethodConfig.instructions || '').trim();
    const hasSelectedPaymentMethod = !requiresAdminQuote && Boolean(selectedMethodLabel);
    const configuredQrPayload = buildCompanyRegistrationQrText({
        methodLabel: displayMethodLabel,
        accountName,
        accountNumber,
        instructions,
        qrText: selectedMethodConfig.qr_text
    });
    const configuredQrImageUrl = resolveConfiguredCompanyRegistrationQrImageSrc(configuredQrPayload);
    const paymongoStatus = (state.companyRegistrationPaymongoQr && typeof state.companyRegistrationPaymongoQr === 'object' && !Array.isArray(state.companyRegistrationPaymongoQr))
        ? state.companyRegistrationPaymongoQr
        : null;
    const paymongoQr = getCompanyRegistrationPaymongoQrState(selectedMethodKey);
    const supportsPaymongoQr = !requiresAdminQuote && canUsePaymongoCompanyRegistrationQr(selectedMethodKey);
    const paymongoError = !paymongoQr && paymongoStatus && supportsPaymongoQr
        ? String(paymongoStatus.error || '').trim()
        : '';
    const shouldUsePaymongoQr = !requiresAdminQuote && hasSelectedPaymentMethod && Boolean(paymongoQr);
    const shouldShowConfiguredQr = !requiresAdminQuote && hasSelectedPaymentMethod && !shouldUsePaymongoQr && Boolean(configuredQrImageUrl);
    const qrImageUrl = shouldShowConfiguredQr
        ? configuredQrImageUrl
        : (shouldUsePaymongoQr ? resolvePaymongoQrImageSrc(paymongoQr.qrImage) : '');
    const paymongoWarning = String((shouldUsePaymongoQr ? paymongoQr?.warning : '') || '').trim();
    const hasQrReady = !requiresAdminQuote && Boolean(qrImageUrl);
    const activeCheckoutRequestCode = String(paymongoQr?.requestCode || '').trim();
    const hasActiveCheckout = !requiresAdminQuote && Boolean(activeCheckoutRequestCode);
    const checkoutBlockedReason = checkoutDetails.reason || '';
    const selectedPlanNotice = selectedPlanLabel ? `Selected subscription: ${selectedPlanLabel}.` : '';
    const noQrConfiguredMessage = requiresAdminQuote
        ? 'Lifetime Access is handled manually by the website admin.'
        : 'Click Generate Payment QR to create the exact-amount checkout here.';

    if (paymentPlanSpotlight) {
        paymentPlanSpotlight.classList.toggle('is-empty', !selectedPlan);
        paymentPlanSpotlight.classList.toggle('is-custom', Boolean(selectedPlan && selectedPlan.key === 'lifetime_access'));
        paymentPlanSpotlight.classList.toggle('is-featured', Boolean(selectedPlan && selectedPlan.key === featuredPlanKey));
    }
    if (paymentPlanKicker) {
        paymentPlanKicker.textContent = !selectedPlan
            ? 'Selected subscription'
            : selectedPlan.key === 'lifetime_access'
            ? 'One-time setup'
            : selectedPlan.key === featuredPlanKey
            ? 'Most popular plan'
            : 'Selected subscription';
    }
    if (paymentPlanTitle) {
        paymentPlanTitle.textContent = selectedPlan ? selectedPlan.title : 'Choose a subscription first';
    }
    if (paymentPlanSubtitle) {
        paymentPlanSubtitle.textContent = selectedPlan
            ? selectedPlanSummary
            : 'Your selected package, amount, and included highlights will appear here before payment.';
    }
    if (paymentPlanPriceMain) {
        paymentPlanPriceMain.textContent = selectedPlan ? selectedPlanPriceParts.main : '-';
    }
    if (paymentPlanPriceNote) {
        paymentPlanPriceNote.textContent = selectedPlan
            ? (selectedPlanPriceParts.note || (selectedPlan.key === 'lifetime_access' ? 'Final pricing by approval' : 'Recurring monthly rate'))
            : 'Waiting for plan';
    }
    if (paymentPlanBenefits) {
        paymentPlanBenefits.innerHTML = selectedPlan
            ? selectedPlanHighlights.map((line) => `
                <div class="payment-plan-benefit">
                    <span class="payment-plan-benefit-icon">${selectedPlan.key === 'lifetime_access' ? '*' : '+'}</span>
                    <span class="payment-plan-benefit-text">${escapeHtml(line)}</span>
                </div>
            `).join('')
            : `
                <div class="payment-plan-benefit is-placeholder">
                    <span class="payment-plan-benefit-icon">+</span>
                    <span class="payment-plan-benefit-text">Pick a subscription in Step 1 so the payment amount and highlights appear here.</span>
                </div>
            `;
    }

    if (paymentPrimaryLabel) {
        paymentPrimaryLabel.textContent = 'Amount Due';
    }
    if (paymentSecondaryLabel) {
        paymentSecondaryLabel.textContent = 'Selected Mode';
    }
    if (paymentPanelTitle) {
        paymentPanelTitle.textContent = !paymentReady
            ? 'Complete Step 1 first'
            : requiresAdminQuote
            ? 'Contact admin for Lifetime Access'
            : !hasSelectedPaymentMethod
            ? 'Choose payment mode'
            : !checkoutDetails.checkoutSupported
            ? 'Payment unavailable'
            : state.companyRegistrationQrLoading
            ? `Generating ${displayMethodLabel} QR`
            : hasActiveCheckout
            ? `${displayMethodLabel} QR Ready`
            : `Generate ${displayMethodLabel} QR`;
    }
    if (paymentMethodBadge) {
        paymentMethodBadge.textContent = !paymentReady
            ? 'Step 1 first'
            : requiresAdminQuote
            ? 'Admin quote'
            : (hasSelectedPaymentMethod ? displayMethodLabel : 'Waiting');
    }
    if (paymentPanelNotice) {
        paymentPanelNotice.textContent = !paymentReady
            ? 'Complete the company details, contact info, email, desired Company ID, Admin ID, and subscription first.'
            : requiresAdminQuote
            ? `${selectedPlanNotice ? `${selectedPlanNotice} ` : ''}Lifetime Access is not paid by QR here. Submit the request and wait for the website admin to confirm the final one-time price.`.trim()
            : !hasSelectedPaymentMethod
            ? `${selectedPlanNotice ? `${selectedPlanNotice} ` : ''}Select a mode of payment first.`.trim()
            : !checkoutDetails.checkoutSupported
            ? `${selectedPlanNotice ? `${selectedPlanNotice} ` : ''}${checkoutBlockedReason}`.trim()
            : hasActiveCheckout
            ? `${selectedPlanNotice ? `${selectedPlanNotice} ` : ''}Scan the QR code to open the exact-amount PayMongo checkout. After the transfer is confirmed, this page will finish your Company ID automatically.${paymongoWarning ? ` ${paymongoWarning}` : ''}`.trim()
            : `${selectedPlanNotice ? `${selectedPlanNotice} ` : ''}Generate the exact-amount PayMongo QR when you are ready to pay.${paymongoWarning ? ` ${paymongoWarning}` : ''}`.trim();
    }
    if (paymentAccountName) {
        paymentAccountName.textContent = paymentReady && selectedPlan
            ? (requiresAdminQuote ? 'Custom quote by admin' : checkoutDetails.amountLabel)
            : '-';
    }
    if (paymentAccountNumber) {
        paymentAccountNumber.textContent = !paymentReady
            ? '-'
            : requiresAdminQuote
            ? 'Website admin will contact you'
            : hasSelectedPaymentMethod
            ? displayMethodLabel
            : 'Waiting for payment method';
    }
    if (paymentPanelInstructions) {
        paymentPanelInstructions.textContent = !paymentReady
            ? 'Finish Step 1 first, then continue to the payment step.'
            : requiresAdminQuote
            ? 'Lifetime Access uses manual approval. Submit this request first, then wait for the website admin to send the final one-time price and payment steps.'
            : !hasSelectedPaymentMethod
            ? 'Select a mode of payment to unlock the secure checkout flow for your chosen plan.'
            : !checkoutDetails.checkoutSupported
            ? checkoutBlockedReason
            : hasActiveCheckout
            ? `${selectedPlanLabel ? `Pay for ${selectedPlanLabel}. ` : ''}${instructions || 'Please scan the QR code to open the PayMongo checkout with the exact amount for your selected plan.'} Once PayMongo confirms the transfer, this page will submit the request and provision the Company ID automatically.${paymongoWarning ? ` ${paymongoWarning}` : ''}`
            : 'Review the amount, then click Generate Payment QR when you are ready to create the exact-amount checkout.';
    }
    if (paymentReferenceInput && selectedMethodLabel) {
        paymentReferenceInput.placeholder = `Optional note or fallback detail for ${displayMethodLabel}`;
    }

    if (paymentQrImage) {
        if (qrImageUrl) {
            paymentQrImage.src = qrImageUrl;
            paymentQrImage.hidden = false;
        } else {
            paymentQrImage.hidden = true;
            paymentQrImage.removeAttribute('src');
        }
    }
    if (paymentQrShell) {
        paymentQrShell.classList.toggle('has-qr', hasQrReady);
    }
    if (paymentQrFallback) {
        paymentQrFallback.hidden = hasQrReady;
        paymentQrFallback.textContent = !paymentReady
            ? 'Complete Step 1 first, then continue here for payment.'
            : requiresAdminQuote
            ? 'Lifetime Access is not paid by QR. Submit the request and wait for the website admin to send the final one-time price and payment instructions.'
            : !selectedMethodLabel
            ? 'Choose a mode of payment first.'
            : !checkoutDetails.checkoutSupported
            ? checkoutBlockedReason
            : state.companyRegistrationQrLoading
            ? `Preparing exact-amount checkout QR for ${displayMethodLabel}...`
            : hasActiveCheckout
            ? 'Checkout is ready, but the QR image could not be shown. Refresh the page or change the payment method to generate a new QR.'
            : (paymongoError || noQrConfiguredMessage);
    }
    if (paymentQrCaption) {
        paymentQrCaption.hidden = true;
        paymentQrCaption.textContent = '';
    }
    if (generatePaymentQrBtn) {
        generatePaymentQrBtn.disabled = requiresAdminQuote
            ? (!paymentReady || state.companyRegistrationQrLoading)
            : (!paymentReady || !hasSelectedPaymentMethod || !checkoutDetails.checkoutSupported || state.companyRegistrationQrLoading || hasActiveCheckout);
        generatePaymentQrBtn.textContent = state.companyRegistrationQrLoading
            ? (requiresAdminQuote ? 'Submitting request...' : 'Generating QR...')
            : (requiresAdminQuote ? 'Submit Lifetime Request' : (hasActiveCheckout ? 'Waiting for payment...' : 'Generate Payment QR'));
    }
    if (!state.companyRegistrationQrLoading) {
        if (!paymentReady) {
            setPaymentGenerateStatus('Fill out Step 1 first before moving to payment.', false);
        } else if (requiresAdminQuote) {
            setPaymentGenerateStatus('Lifetime Access needs admin quote first. Submit this request and wait for admin approval.', false);
        } else if (!hasSelectedPaymentMethod) {
            setPaymentGenerateStatus('Choose a mode of payment first.', false);
        } else if (!checkoutDetails.checkoutSupported) {
            setPaymentGenerateStatus(checkoutBlockedReason, true);
        } else if (hasActiveCheckout) {
            setPaymentGenerateStatus(`Payment QR ready for ${displayMethodLabel}. Once PayMongo confirms the transfer, this page will continue automatically.`, false);
        } else if (paymongoError) {
            setPaymentGenerateStatus(paymongoError, true);
        } else {
            setPaymentGenerateStatus(`Review the amount, then click Generate Payment QR for ${displayMethodLabel} when you are ready.`, false);
        }
    }
}

async function loadCompanyRegistrationConfig() {
    if (!isCompanyRegistrationIntent()) {
        return;
    }

    try {
        const payload = await appClient.getPublicCompanyRegistrationConfig();
        state.companyRegistrationConfig = payload?.company_registration_payment
            || payload?.companyRegistrationPayment
            || payload
            || null;
    } catch (_error) {
        state.companyRegistrationConfig = null;
    }

    renderCompanyRegistrationPaymentPreview();
}

async function loadCompanyRegistrationPaymongoQr({ force = false, silent = false } = {}) {
    if (!isCompanyRegistrationIntent()) {
        return null;
    }

    try {
        if (!force && state.companyRegistrationPaymongoQr) {
            return state.companyRegistrationPaymongoQr;
        }
        const payload = await appClient.createPublicCompanyRegistrationPaymentPreview(
            buildCompanyRegistrationPaymentPreviewPayload()
        );
        const checkoutUrl = String(payload?.checkoutUrl || '').trim();
        state.companyRegistrationPaymongoQr = payload
            ? {
                ...payload,
                enabled: Boolean(checkoutUrl),
                qrImage: checkoutUrl ? buildCompanyRegistrationQrImageUrl(checkoutUrl) : '',
                supportedMethods: Array.isArray(payload.supportedMethods) ? payload.supportedMethods : []
            }
            : null;
        return state.companyRegistrationPaymongoQr;
    } catch (error) {
        if (!state.companyRegistrationPaymongoQr) {
            state.companyRegistrationPaymongoQr = {
                enabled: false,
                error: error?.message || 'Unable to prepare secure checkout QR right now.',
                supportedMethods: []
            };
        }
        throw error;
    } finally {
        if (!silent) {
            renderCompanyRegistrationPaymentPreview();
        }
    }
}

function normalizeDesiredCompanyCode(value = '') {
    return String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9-\s]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 40);
}

function formatRoleLabel(role) {
    const normalized = String(role || '').trim().toLowerCase();
    if (normalized === 'staff') {
        return 'Staff';
    }
    if (normalized === 'company_admin' || normalized === 'admin') {
        return 'Company Admin';
    }
    return 'Employee';
}

function sanitizeContactInput(value) {
    return String(value || '').replace(/[^\d\s()+-]/g, '');
}

function setBusy(button, busy) {
    if (!button) {
        return;
    }
    button.disabled = Boolean(busy);
}

function setStatus(message, isError) {
    portalStatus.textContent = message || '';
    portalStatus.classList.toggle('error', Boolean(isError));
}

function formatStatus(status) {
    const normalized = String(status || '').trim();
    if (!normalized) {
        return 'Open';
    }
    return normalized
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value) {
    if (!value) {
        return '-';
    }

    const parsed = new Date(String(value).replace(' ', 'T'));
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

async function refreshBranding() {
    const companyCode = isCompanyRegistrationIntent() ? '' : readCompanyCode();
    try {
        const branding = await appClient.getPublicBranding({ companyCode });
        applyBranding(branding || {});
    } catch (_error) {
        applyBranding({});
    }
}

function applyBranding(branding) {
    const appName = String(branding.appName || 'GMS ERP').trim() || 'GMS ERP';
    const companyName = String(branding.companyName || '').trim();
    const primaryColor = String(branding.primaryColor || '').trim() || '#0b7285';
    const logoPath = String(branding.logoPath || '').trim() || '/logo.png';
    const backgroundImagePath = String(branding.backgroundImagePath || '').trim();
    const focusedIntent = isFocusedIntent();
    const companyRegistration = isCompanyRegistrationIntent();
    const titleLabel = companyRegistration ? 'Register Company ID' : (isSignupIntent() ? 'Sign Up' : 'Customer Service');

    document.title = `${appName} ${titleLabel}`;
    portalTitle.textContent = `${appName} ${titleLabel}`;

    if (companyRegistration) {
        portalSubtitle.textContent = companyName
            ? `Powered by ${companyName} | Submit your company ID and subscription request for review.`
            : 'Submit your company ID and subscription request for review.';
    } else if (isSignupIntent()) {
        portalSubtitle.textContent = companyName
            ? `Company: ${companyName} | Submit your access request for approval.`
            : 'Submit your sign up request for admin approval.';
    } else {
        portalSubtitle.textContent = companyName
            ? `Company: ${companyName} | Start a new request or reopen an existing Customer Service conversation.`
            : 'Start a new support request or reopen an existing Customer Service conversation.';
    }

    document.documentElement.style.setProperty('--accent', primaryColor);
    if (appClient?.mixHexColors && appClient?.hexToRgba) {
        const strong = appClient.mixHexColors(primaryColor, '#0f172a', 0.2);
        const soft = appClient.mixHexColors(primaryColor, '#ffffff', 0.85);
        document.documentElement.style.setProperty('--accent-strong', strong);
        document.documentElement.style.setProperty('--accent-soft', soft);
        document.documentElement.style.setProperty('--accent-glow', appClient.hexToRgba(primaryColor, 0.24));
    }

    if (signupTitle) {
        signupTitle.textContent = `${appName} ${titleLabel}`;
    }
    if (signupSubtitle) {
        signupSubtitle.textContent = companyRegistration
            ? 'Submit your company details, preferred payment method, and subscription request for review.'
            : (companyName
                ? `Company: ${companyName} | Submit your access request for approval.`
                : 'Submit your sign up request for admin approval.');
    }
    if (signupLogo) {
        signupLogo.src = logoPath;
    }

    if (appClient?.hexToRgb) {
        const rgb = appClient.hexToRgb(primaryColor);
        document.documentElement.style.setProperty('--signup-primary-rgb', rgb.join(', '));
    }

    if (focusedIntent) {
        if (backgroundImagePath) {
            document.documentElement.style.setProperty('--signup-background-image', `url('${backgroundImagePath}')`);
            document.body.classList.add('has-background');
        } else {
            document.documentElement.style.setProperty('--signup-background-image', 'none');
            document.body.classList.remove('has-background');
        }
    } else {
        document.body.classList.remove('has-background');
    }
}
