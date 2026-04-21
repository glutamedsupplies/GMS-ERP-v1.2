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
const resetSectionBadge = document.getElementById('resetSectionBadge');
const resetSectionCopy = document.getElementById('resetSectionCopy');
const newPasswordGroup = document.getElementById('newPasswordGroup');
const confirmPasswordGroup = document.getElementById('confirmPasswordGroup');

const RESET_CODE_LENGTH = 6;
const RESET_SECTION_BADGE_DEFAULT = 'Verification required';
const RESET_SECTION_BADGE_VERIFYING = 'Verifying code...';
const RESET_SECTION_BADGE_READY = 'Code verified';
const RESET_SECTION_COPY_DEFAULT = 'Enter the verification code from your inbox. The new password fields unlock only after the code is verified.';
const RESET_SECTION_COPY_READY = 'Code verified. You can now enter and confirm a new password.';

let brandingTimer = null;
let codeVerificationTimer = null;
let codeVerificationRequestId = 0;
let resetCodeVerificationState = 'idle';
let verifiedResetCodeSignature = '';

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
    codeInput?.addEventListener('input', handleCodeInputChange);
    codeInput?.addEventListener('blur', () => {
        verifyResetCode({ focusPasswordOnSuccess: false });
    });

    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            resetFeedback();
        }
    });

    companyCodeInput?.addEventListener('input', () => {
        invalidateResetCodeVerification();
        resetFeedback();
        updateNavigationLinks();
        if (brandingTimer) {
            window.clearTimeout(brandingTimer);
        }
        brandingTimer = window.setTimeout(() => {
            refreshBranding();
        }, 180);
    });

    emailInput?.addEventListener('input', () => {
        invalidateResetCodeVerification();
        resetFeedback();
    });
    newPasswordInput?.addEventListener('input', resetFeedback);
    confirmPasswordInput?.addEventListener('input', resetFeedback);
}

function updatePasswordInputs() {
    const hasVerifiedCode = isCurrentResetCodeVerified();
    if (newPasswordInput) {
        newPasswordInput.disabled = !hasVerifiedCode;
    }
    if (confirmPasswordInput) {
        confirmPasswordInput.disabled = !hasVerifiedCode;
    }
    if (resetPasswordBtn) {
        resetPasswordBtn.disabled = !hasVerifiedCode;
    }
    if (resetSection) {
        resetSection.classList.toggle('is-active', hasVerifiedCode);
        resetSection.setAttribute('aria-disabled', hasVerifiedCode ? 'false' : 'true');
    }
    if (newPasswordGroup) {
        newPasswordGroup.classList.toggle('is-disabled', !hasVerifiedCode);
    }
    if (confirmPasswordGroup) {
        confirmPasswordGroup.classList.toggle('is-disabled', !hasVerifiedCode);
    }
    if (resetSectionBadge) {
        resetSectionBadge.textContent = resetCodeVerificationState === 'verified'
            ? RESET_SECTION_BADGE_READY
            : resetCodeVerificationState === 'verifying'
                ? RESET_SECTION_BADGE_VERIFYING
                : RESET_SECTION_BADGE_DEFAULT;
    }
    if (resetSectionCopy) {
        resetSectionCopy.textContent = hasVerifiedCode
            ? RESET_SECTION_COPY_READY
            : RESET_SECTION_COPY_DEFAULT;
    }
}

async function requestResetCode() {
    invalidateResetCodeVerification();
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
        if (codeInput) {
            codeInput.value = '';
        }
        showSuccessMessage('Verification Code Sent', 'Check your inbox for the 6-digit code.');
        setStatus('Code sent. Enter the 6-digit code to unlock the password fields.', false, true);
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
    if (!isCurrentResetCodeVerified()) {
        const verified = await verifyResetCode({ focusPasswordOnSuccess: false });
        if (!verified) {
            return;
        }
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
        invalidateResetCodeVerification({ clearPasswords: false });
        updatePasswordInputs();
    } catch (error) {
        setStatus(error.message || 'Unable to reset password.', true);
    } finally {
        setButtonBusy(resetPasswordBtn, false, 'Reset Password');
        updatePasswordInputs();
    }
}

function handleCodeInputChange() {
    if (codeInput) {
        const compactCode = String(codeInput.value || '').replace(/\s+/g, '');
        if (compactCode !== codeInput.value) {
            codeInput.value = compactCode;
        }
    }
    invalidateResetCodeVerification();
    resetFeedback();
    queueResetCodeVerification();
}

function queueResetCodeVerification() {
    clearPendingCodeVerification();
    const { email, code } = getResetCodePayload();
    if (!email || code.length < RESET_CODE_LENGTH) {
        return;
    }
    codeVerificationTimer = window.setTimeout(() => {
        codeVerificationTimer = null;
        verifyResetCode();
    }, 280);
}

async function verifyResetCode({ focusPasswordOnSuccess = true } = {}) {
    clearPendingCodeVerification();

    const payload = getResetCodePayload();
    if (!payload.email || payload.code.length < RESET_CODE_LENGTH) {
        return false;
    }

    const signature = buildResetCodeSignature(payload);
    if (verifiedResetCodeSignature && verifiedResetCodeSignature === signature) {
        return true;
    }

    const requestId = ++codeVerificationRequestId;
    resetCodeVerificationState = 'verifying';
    updatePasswordInputs();
    setStatus('Verifying code...', false);

    try {
        await appClient.verifyPasswordResetCode(payload);
        if (requestId !== codeVerificationRequestId) {
            return false;
        }
        verifiedResetCodeSignature = signature;
        resetCodeVerificationState = 'verified';
        updatePasswordInputs();
        setStatus('Code verified. You can set a new password now.', false, true);
        if (focusPasswordOnSuccess) {
            newPasswordInput?.focus?.();
        }
        return true;
    } catch (error) {
        if (requestId !== codeVerificationRequestId) {
            return false;
        }
        verifiedResetCodeSignature = '';
        resetCodeVerificationState = 'idle';
        clearPasswordFields();
        updatePasswordInputs();
        setStatus(error.message || 'Unable to verify code.', true);
        return false;
    }
}

function getResetCodePayload() {
    return {
        companyCode: String(companyCodeInput?.value || '').trim(),
        email: String(emailInput?.value || '').trim(),
        code: String(codeInput?.value || '').trim()
    };
}

function buildResetCodeSignature({ companyCode = '', email = '', code = '' } = {}) {
    return `${String(companyCode || '').trim().toLowerCase()}|${String(email || '').trim().toLowerCase()}|${String(code || '').trim()}`;
}

function isCurrentResetCodeVerified() {
    if (!verifiedResetCodeSignature) {
        return false;
    }
    return verifiedResetCodeSignature === buildResetCodeSignature(getResetCodePayload());
}

function invalidateResetCodeVerification({ clearPasswords = true } = {}) {
    clearPendingCodeVerification();
    codeVerificationRequestId += 1;
    verifiedResetCodeSignature = '';
    resetCodeVerificationState = 'idle';
    if (clearPasswords) {
        clearPasswordFields();
    }
    updatePasswordInputs();
}

function clearPendingCodeVerification() {
    if (codeVerificationTimer) {
        window.clearTimeout(codeVerificationTimer);
        codeVerificationTimer = null;
    }
}

function clearPasswordFields() {
    if (newPasswordInput) {
        newPasswordInput.value = '';
    }
    if (confirmPasswordInput) {
        confirmPasswordInput.value = '';
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
    appClient?.applyBrandFavicon?.(branding);

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
