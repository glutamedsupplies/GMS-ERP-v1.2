const appClient = window.appClient;

const form = document.getElementById('forgotPasswordForm');
const companyCodeInput = document.getElementById('companyCodeInput');
const emailInput = document.getElementById('emailInput');
const codeInput = document.getElementById('codeInput');
const newPasswordInput = document.getElementById('newPasswordInput');
const confirmPasswordInput = document.getElementById('confirmPasswordInput');
const sendCodeBtn = document.getElementById('sendCodeBtn');
const resetPasswordBtn = document.getElementById('resetPasswordBtn');
const statusEl = document.getElementById('status');
const resultBox = document.getElementById('resultBox');
const forgotTitle = document.getElementById('forgotTitle');
const forgotSubtitle = document.getElementById('forgotSubtitle');
const brandingHint = document.getElementById('brandingHint');
const openChatLink = document.getElementById('openChatLink');
const backToLoginLink = document.getElementById('backToLoginLink');
const brandLogo = document.getElementById('brandLogo');
const backgroundPhoto = document.getElementById('backgroundPhoto');
const resetSection = document.getElementById('resetSection');
const newPasswordGroup = document.getElementById('newPasswordGroup');
const confirmPasswordGroup = document.getElementById('confirmPasswordGroup');

let brandingTimer = null;

initialize();

function initialize() {
    resetFeedback();

    const params = new URLSearchParams(window.location.search);
    const initialCompanyCode = String(params.get('companyCode') || '').trim();
    if (initialCompanyCode) {
        companyCodeInput.value = initialCompanyCode;
    }

    updateNavigationLinks();
    refreshBranding();
    updatePasswordInputs();

    form?.addEventListener('submit', (event) => event.preventDefault());
    sendCodeBtn?.addEventListener('click', requestResetCode);
    resetPasswordBtn?.addEventListener('click', submitPasswordReset);
    codeInput?.addEventListener('input', updatePasswordInputs);

    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            resetFeedback();
        }
    });

    companyCodeInput?.addEventListener('input', () => {
        resetFeedback();
        updateNavigationLinks();
        if (brandingTimer) {
            window.clearTimeout(brandingTimer);
        }
        brandingTimer = window.setTimeout(() => {
            refreshBranding();
        }, 180);
    });

    [emailInput, codeInput, newPasswordInput, confirmPasswordInput].forEach((input) => {
        input?.addEventListener('input', resetFeedback);
    });
}

function updatePasswordInputs() {
    const hasCode = Boolean(String(codeInput?.value || '').trim());
    if (newPasswordInput) {
        newPasswordInput.disabled = !hasCode;
    }
    if (confirmPasswordInput) {
        confirmPasswordInput.disabled = !hasCode;
    }
    if (resetPasswordBtn) {
        resetPasswordBtn.disabled = !hasCode;
    }
    if (resetSection) {
        resetSection.classList.toggle('is-active', hasCode);
        resetSection.setAttribute('aria-disabled', hasCode ? 'false' : 'true');
    }
    if (newPasswordGroup) {
        newPasswordGroup.classList.toggle('is-disabled', !hasCode);
    }
    if (confirmPasswordGroup) {
        confirmPasswordGroup.classList.toggle('is-disabled', !hasCode);
    }
}

async function requestResetCode() {
    resetFeedback();

    const email = String(emailInput?.value || '').trim();
    const companyCode = String(companyCodeInput?.value || '').trim();

    if (!email) {
        setStatus('Email is required.', true);
        return;
    }

    setButtonBusy(sendCodeBtn, true, 'Sending...');
    setStatus('Sending verification code...', false);

    try {
        await appClient.requestPasswordResetCode({ companyCode, email });
        showSuccessMessage('Verification Code Sent', 'Check your inbox for the 6-digit code.');
        setStatus('Code sent. Enter it to reset your password.', false, true);
        codeInput?.focus?.();
    } catch (error) {
        setStatus(error.message || 'Unable to send reset code.', true);
    } finally {
        setButtonBusy(sendCodeBtn, false, 'Send Code');
    }
}

async function submitPasswordReset() {
    resetFeedback();

    const email = String(emailInput?.value || '').trim();
    const companyCode = String(companyCodeInput?.value || '').trim();
    const code = String(codeInput?.value || '').trim();
    const password = String(newPasswordInput?.value || '').trim();
    const confirmPassword = String(confirmPasswordInput?.value || '').trim();

    if (!email) {
        setStatus('Email is required.', true);
        return;
    }
    if (!code) {
        setStatus('Verification code is required.', true);
        return;
    }
    if (!password || password.length < 8) {
        setStatus('Password must be at least 8 characters.', true);
        return;
    }
    if (password !== confirmPassword) {
        setStatus('Passwords do not match.', true);
        return;
    }

    setButtonBusy(resetPasswordBtn, true, 'Resetting...');
    setStatus('Resetting password...', false);

    try {
        await appClient.confirmPasswordReset({
            companyCode,
            email,
            code,
            password
        });
        showSuccessMessage('Password Reset', 'You can log in with your new password.');
        setStatus('Password reset successful. You can log in now.', false, true);
        if (codeInput) {
            codeInput.value = '';
        }
        if (newPasswordInput) {
            newPasswordInput.value = '';
        }
        if (confirmPasswordInput) {
            confirmPasswordInput.value = '';
        }
        updatePasswordInputs();
    } catch (error) {
        setStatus(error.message || 'Unable to reset password.', true);
    } finally {
        setButtonBusy(resetPasswordBtn, false, 'Reset Password');
    }
}

function updateNavigationLinks() {
    const companyCode = String(companyCodeInput?.value || '').trim();
    const encodedCompanyCode = companyCode ? encodeURIComponent(companyCode) : '';

    if (openChatLink) {
        openChatLink.href = encodedCompanyCode
            ? `/renderer/customer_portal.html?companyCode=${encodedCompanyCode}`
            : '/renderer/customer_portal.html';
    }

    if (backToLoginLink) {
        backToLoginLink.href = encodedCompanyCode
            ? `/login.html?companyCode=${encodedCompanyCode}`
            : '/login.html';
    }
}

function setButtonBusy(button, isBusy, label) {
    if (!button) {
        return;
    }
    button.disabled = Boolean(isBusy);
    if (label) {
        button.textContent = label;
    }
}

function setStatus(message, isError = false, isOk = false) {
    if (!statusEl) {
        return;
    }
    statusEl.textContent = String(message || '');
    statusEl.classList.toggle('error', Boolean(isError));
    statusEl.classList.toggle('ok', Boolean(isOk));
}

function resetFeedback() {
    if (resultBox) {
        resultBox.style.display = 'none';
    }
    if (statusEl) {
        statusEl.textContent = '';
        statusEl.classList.remove('error', 'ok');
    }
}

function showSuccessMessage(title, message) {
    if (resultBox) {
        resultBox.style.display = 'block';
        const strong = resultBox.querySelector('strong');
        const span = resultBox.querySelector('span');
        if (strong) {
            strong.textContent = title || 'Success';
        }
        if (span) {
            span.textContent = message || '';
        }
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
            ? `Company: ${companyName} | Request a reset code.`
            : 'Enter your email to receive a reset code.';
    }

    if (brandingHint) {
        brandingHint.textContent = companyName
            ? `Theme preview loaded for ${companyName}. Use the same company ID while resetting your password.`
            : 'Type your company ID to preview your company theme.';
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
