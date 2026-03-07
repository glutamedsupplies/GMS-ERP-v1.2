const appClient = window.appClient;

const form = document.getElementById('forgotPasswordForm');
const companyCodeInput = document.getElementById('companyCodeInput');
const usernameInput = document.getElementById('usernameInput');
const nameInput = document.getElementById('nameInput');
const contactInput = document.getElementById('contactInput');
const messageInput = document.getElementById('messageInput');
const submitBtn = document.getElementById('submitBtn');
const statusEl = document.getElementById('status');
const resultBox = document.getElementById('resultBox');
const requestCodeLabel = document.getElementById('requestCodeLabel');
const forgotTitle = document.getElementById('forgotTitle');
const forgotSubtitle = document.getElementById('forgotSubtitle');
const openChatLink = document.getElementById('openChatLink');

let brandingTimer = null;

initialize();

function initialize() {
    const params = new URLSearchParams(window.location.search);
    const initialCompanyCode = String(params.get('companyCode') || '').trim();
    if (initialCompanyCode) {
        companyCodeInput.value = initialCompanyCode;
    }

    updateOpenChatLink();
    refreshBranding();

    form?.addEventListener('submit', handleSubmit);

    companyCodeInput?.addEventListener('input', () => {
        updateOpenChatLink();
        if (brandingTimer) {
            window.clearTimeout(brandingTimer);
        }
        brandingTimer = window.setTimeout(() => {
            refreshBranding();
        }, 180);
    });

    contactInput?.addEventListener('input', () => {
        contactInput.value = sanitizeContact(contactInput.value);
    });
}

async function handleSubmit(event) {
    event.preventDefault();

    const companyCode = String(companyCodeInput?.value || '').trim();
    const username = String(usernameInput?.value || '').trim();
    const clientName = String(nameInput?.value || '').trim();
    const contactNumber = String(contactInput?.value || '').trim();
    const note = String(messageInput?.value || '').trim();

    if (!companyCode || !username || !clientName || !contactNumber) {
        setStatus('Company code, ID/Username, full name, and contact number are required.', true);
        return;
    }

    const requestDetails = `Forgot password request for user: ${username}`;
    const initialMessage = note || `Please help reset the password for user ${username}.`;

    setBusy(true);
    setStatus('Submitting recovery request...', false);

    try {
        const payload = await appClient.createPublicCustomerRequest({
            companyCode,
            clientName,
            contactNumber,
            requestDetails,
            initialMessage
        });

        const requestCode = String(payload?.request?.requestCode || '').trim();
        requestCodeLabel.textContent = requestCode || '-';
        resultBox.style.display = 'block';
        setStatus('Recovery request submitted. Keep your request code for follow-up.', false, true);
        messageInput.value = '';
    } catch (error) {
        setStatus(error?.message || 'Unable to submit recovery request.', true);
    } finally {
        setBusy(false);
    }
}

function updateOpenChatLink() {
    if (!openChatLink) {
        return;
    }
    const companyCode = String(companyCodeInput?.value || '').trim();
    openChatLink.href = companyCode
        ? `/renderer/customer_portal.html?companyCode=${encodeURIComponent(companyCode)}`
        : '/renderer/customer_portal.html';
}

function sanitizeContact(value = '') {
    return String(value)
        .replace(/[^\d+]/g, '')
        .replace(/(?!^)\+/g, '');
}

function setBusy(isBusy) {
    if (!submitBtn) {
        return;
    }
    submitBtn.disabled = Boolean(isBusy);
    submitBtn.textContent = isBusy ? 'Submitting...' : 'Send Recovery Request';
}

function setStatus(message, isError = false, isOk = false) {
    if (!statusEl) {
        return;
    }
    statusEl.textContent = String(message || '');
    statusEl.classList.toggle('error', Boolean(isError));
    statusEl.classList.toggle('ok', Boolean(isOk));
}

async function refreshBranding() {
    try {
        const companyCode = String(companyCodeInput?.value || '').trim();
        const branding = await appClient.getPublicBranding({ companyCode });
        applyBranding(branding || {});
    } catch (_error) {
        applyBranding({});
    }
}

function applyBranding(branding) {
    const appName = String(branding.appName || '').trim() || 'GMS ERP';
    const companyName = String(branding.companyName || '').trim();
    const primaryColor = String(branding.primaryColor || '').trim() || '#2575fc';

    document.title = `${appName} Forgot Password`;

    if (forgotTitle) {
        forgotTitle.textContent = `${appName} Forgot Password`;
    }

    if (forgotSubtitle) {
        forgotSubtitle.textContent = companyName
            ? `Submit a password recovery request for ${companyName}.`
            : 'Submit a recovery request and support will help reset your password.';
    }

    document.documentElement.style.setProperty('--primary', primaryColor);
    document.body.style.background = `radial-gradient(circle at top left, ${withAlpha(primaryColor, 0.2)}, transparent 28%), linear-gradient(145deg, #f8fbff, #ebf1ff)`;
}

function withAlpha(hexColor = '', alpha = 0.2) {
    const safeAlpha = Math.min(1, Math.max(0, Number(alpha) || 0));
    const hex = String(hexColor || '').trim().replace('#', '');

    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
        const expanded = hex.split('').map((char) => char + char).join('');
        const intValue = Number.parseInt(expanded, 16);
        const r = (intValue >> 16) & 255;
        const g = (intValue >> 8) & 255;
        const b = intValue & 255;
        return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
    }

    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
        const intValue = Number.parseInt(hex, 16);
        const r = (intValue >> 16) & 255;
        const g = (intValue >> 8) & 255;
        const b = intValue & 255;
        return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
    }

    return `rgba(37, 117, 252, ${safeAlpha})`;
}
