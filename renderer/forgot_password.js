const appClient = window.appClient;

const form = document.getElementById('forgotPasswordForm');
const companyCodeInput = document.getElementById('companyCodeInput');
const emailInput = document.getElementById('emailInput');
const submitBtn = document.getElementById('submitBtn');
const statusEl = document.getElementById('status');
const resultBox = document.getElementById('resultBox');
const forgotTitle = document.getElementById('forgotTitle');
const forgotSubtitle = document.getElementById('forgotSubtitle');
const openChatLink = document.getElementById('openChatLink');
const brandLogo = document.getElementById('brandLogo');
const backgroundPhoto = document.getElementById('backgroundPhoto');

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

}

async function handleSubmit(event) {
    event.preventDefault();

    const email = String(emailInput?.value || '').trim();

    if (!email) {
        setStatus('Email is required.', true);
        return;
    }

    const auth = window.firebaseAuth;
    const helpers = window.firebaseAuthHelpers;
    if (!auth || !helpers?.sendPasswordResetEmail) {
        setStatus('Firebase auth is not ready yet. Please refresh the page.', true);
        return;
    }

    setBusy(true);
    setStatus('Sending reset email...', false);

    try {
        await helpers.sendPasswordResetEmail(auth, email);
        resultBox.style.display = 'block';
        setStatus('Reset email sent. Please check your inbox.', false, true);
    } catch (error) {
        setStatus(resolveAuthErrorMessage(error), true);
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

function setBusy(isBusy) {
    if (!submitBtn) {
        return;
    }
    submitBtn.disabled = Boolean(isBusy);
    submitBtn.textContent = isBusy ? 'Sending...' : 'Send Reset Email';
}

function setStatus(message, isError = false, isOk = false) {
    if (!statusEl) {
        return;
    }
    statusEl.textContent = String(message || '');
    statusEl.classList.toggle('error', Boolean(isError));
    statusEl.classList.toggle('ok', Boolean(isOk));
}

function resolveAuthErrorMessage(error) {
    const code = String(error?.code || '').trim();
    if (!code.startsWith('auth/')) {
        return error?.message || 'Unable to send reset email.';
    }

    switch (code) {
        case 'auth/invalid-email':
            return 'Invalid email address.';
        case 'auth/user-not-found':
            return 'No account found for that email.';
        case 'auth/too-many-requests':
            return 'Too many requests. Please try again later.';
        case 'auth/network-request-failed':
            return 'Network error. Please check your connection.';
        case 'auth/internal-error':
            return 'Firebase error. Please check your Email/Password provider and authorized domains.';
        default:
            return error?.message || 'Unable to send reset email.';
    }
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
    const primaryColor = String(branding.primaryColor || '').trim() || '#0ea5a4';
    const logoPath = String(branding.logoPath || '').trim() || '/logo.png';
    const backgroundImagePath = String(branding.backgroundImagePath || '').trim();
    const rgb = appClient?.hexToRgb ? appClient.hexToRgb(primaryColor) : [14, 165, 164];

    document.title = `${appName} Forgot Password`;

    if (forgotTitle) {
        forgotTitle.textContent = `${appName} Forgot Password`;
    }

    if (forgotSubtitle) {
        forgotSubtitle.textContent = companyName
            ? `Reset your ${companyName} password using email.`
            : 'Enter your email and we will send a reset link.';
    }

    if (brandLogo) {
        brandLogo.src = logoPath;
    }

    document.documentElement.style.setProperty('--brand-primary', primaryColor);
    document.documentElement.style.setProperty('--brand-primary-rgb', rgb.join(', '));

    if (backgroundPhoto) {
        if (backgroundImagePath) {
            backgroundPhoto.style.backgroundImage = `url('${backgroundImagePath}')`;
            backgroundPhoto.classList.add('has-image');
        } else {
            backgroundPhoto.style.backgroundImage = 'none';
            backgroundPhoto.classList.remove('has-image');
        }
    }
}
