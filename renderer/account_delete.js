const appClient = window.appClient;
const companyCodeInput = document.getElementById('companyCode');
const emailInput = document.getElementById('email');
const codeInput = document.getElementById('code');
const requestCodeBtn = document.getElementById('requestCodeBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const statusBanner = document.getElementById('statusBanner');
const signedInBanner = document.getElementById('signedInBanner');
const panelCopy = document.getElementById('panelCopy');
const companyPreviewChip = document.getElementById('companyPreviewChip');
const backToLoginLink = document.getElementById('backToLoginLink');

const state = {
    session: null,
    user: null,
    sessionMode: false,
    brandingTimer: null,
    brandingRequestId: 0,
    submitting: false
};

bindEvents();
initialize();

function bindEvents() {
    requestCodeBtn?.addEventListener('click', handleRequestCode);
    confirmDeleteBtn?.addEventListener('click', handleConfirmDeletion);
    companyCodeInput?.addEventListener('input', handleCompanyCodeInput);
    emailInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            handleRequestCode();
        }
    });
    codeInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            handleConfirmDeletion();
        }
    });
}

async function initialize() {
    const params = new URLSearchParams(window.location.search);
    const companyCode = String(params.get('companyCode') || '').trim();
    const email = String(params.get('email') || '').trim();

    if (companyCodeInput) {
        companyCodeInput.value = companyCode;
    }
    if (emailInput) {
        emailInput.value = email;
    }

    try {
        const session = await appClient.getCurrentSession();
        if (session) {
            state.session = session;
            state.sessionMode = true;
            state.user = await appClient.getUser(session.id || session.userId || '');
            applySessionContext();
        }
    } catch (error) {
        console.error('Unable to restore session for account deletion page:', error);
    }

    if (!state.sessionMode) {
        setStatus('Use your company ID and verified email to receive a deletion code.', false, false);
    }

    if (companyCodeInput?.value.trim()) {
        refreshBranding();
    }
}

function applySessionContext() {
    const companyCode = String(
        state.session?.company_code
        || state.session?.companyCode
        || window.localStorage?.getItem('companyCode')
        || companyCodeInput?.value
        || ''
    ).trim();
    const verifiedEmail = getPreferredVerifiedEmail(state.user);

    if (companyCodeInput && companyCode) {
        companyCodeInput.value = companyCode;
        companyCodeInput.readOnly = true;
    }

    if (emailInput && verifiedEmail) {
        emailInput.value = verifiedEmail;
        emailInput.readOnly = true;
    }

    if (signedInBanner) {
        const displayName = String(state.user?.name || state.session?.name || state.session?.id || 'Current user').trim();
        signedInBanner.hidden = false;
        signedInBanner.textContent = verifiedEmail
            ? `Signed in as ${displayName}. We will send the deletion code to ${verifiedEmail}.`
            : `Signed in as ${displayName}. Connect and verify an email first if you need to continue with account deletion.`;
    }

    if (panelCopy) {
        panelCopy.textContent = verifiedEmail
            ? 'Because you are already signed in, this page can use your current tenant session and verified email automatically.'
            : 'You are signed in, but this account still needs a verified login or Google email before deletion can continue.';
    }

    if (companyCode) {
        backToLoginLink.href = `/login.html?companyCode=${encodeURIComponent(companyCode)}`;
    }
}

function handleCompanyCodeInput() {
    if (state.sessionMode) {
        return;
    }

    if (state.brandingTimer) {
        window.clearTimeout(state.brandingTimer);
    }

    state.brandingTimer = window.setTimeout(() => {
        refreshBranding();
    }, 160);
}

async function refreshBranding() {
    const requestId = ++state.brandingRequestId;
    const companyCode = String(companyCodeInput?.value || '').trim();
    if (!companyCode) {
        companyPreviewChip.textContent = state.sessionMode ? 'Signed-in deletion flow' : 'Public deletion flow';
        return;
    }

    try {
        const branding = await appClient.getPublicBranding({ companyCode });
        if (requestId !== state.brandingRequestId) {
            return;
        }

        const theme = appClient.buildBrandTheme(branding?.primaryColor || branding?.primary_color || '#2575fc');
        appClient.applyBrandTheme(theme, {
            companyCode,
            shellVariant: ''
        });

        const appName = String(branding?.appName || branding?.app_name || 'GMS ERP').trim();
        const companyName = String(branding?.companyName || branding?.company_name || companyCode).trim();
        companyPreviewChip.textContent = `${appName} - ${companyName}`;
        if (!state.sessionMode) {
            backToLoginLink.href = `/login.html?companyCode=${encodeURIComponent(companyCode)}`;
        }
    } catch (error) {
        console.error('Failed to load account deletion branding:', error);
    }
}

function getPreferredVerifiedEmail(user = null) {
    const loginEmail = String(user?.login_email || '').trim();
    const googleEmail = String(user?.google_email || '').trim();

    if (user?.login_email_verified && loginEmail) {
        return loginEmail;
    }
    if (user?.google_email_verified && googleEmail) {
        return googleEmail;
    }
    return '';
}

function buildPayload({ includeCode = false } = {}) {
    const payload = {};

    if (!state.sessionMode) {
        const companyCode = String(companyCodeInput?.value || '').trim();
        const email = String(emailInput?.value || '').trim();
        if (!companyCode) {
            throw new Error('Company ID is required.');
        }
        if (!email) {
            throw new Error('Verified email is required.');
        }
        payload.companyCode = companyCode;
        payload.email = email;
    } else {
        const email = String(emailInput?.value || '').trim();
        if (email) {
            payload.email = email;
        }
    }

    if (includeCode) {
        const code = String(codeInput?.value || '').trim();
        if (!code) {
            throw new Error('Verification code is required.');
        }
        payload.code = code;
    }

    return payload;
}

async function handleRequestCode() {
    if (state.submitting) {
        return;
    }

    let payload = null;
    try {
        payload = buildPayload();
    } catch (error) {
        setStatus(error.message || 'Unable to continue.', true, false);
        return;
    }

    state.submitting = true;
    requestCodeBtn.disabled = true;
    confirmDeleteBtn.disabled = true;
    setStatus('Sending account deletion code...', false, false);

    try {
        const response = await appClient.requestAccountDeletion(payload);
        if (emailInput && response?.email && !state.sessionMode) {
            emailInput.value = response.email;
        }
        setStatus(`Account deletion code sent to ${response?.email || payload.email || 'your verified email'}.`, false, true);
        codeInput?.focus?.();
    } catch (error) {
        console.error('Failed to request account deletion code:', error);
        setStatus(error.message || 'Unable to send deletion code.', true, false);
    } finally {
        state.submitting = false;
        requestCodeBtn.disabled = false;
        confirmDeleteBtn.disabled = false;
    }
}

async function handleConfirmDeletion() {
    if (state.submitting) {
        return;
    }

    let payload = null;
    try {
        payload = buildPayload({ includeCode: true });
    } catch (error) {
        setStatus(error.message || 'Unable to continue.', true, false);
        return;
    }

    state.submitting = true;
    requestCodeBtn.disabled = true;
    confirmDeleteBtn.disabled = true;
    setStatus('Deleting account...', false, false);

    try {
        const response = await appClient.confirmAccountDeletion(payload);
        const loginUrl = String(response?.loginUrl || backToLoginLink?.href || '/login.html').trim() || '/login.html';
        if (backToLoginLink) {
            backToLoginLink.href = loginUrl;
        }
        setStatus('Account deleted. Redirecting to login...', false, true);
        codeInput.value = '';

        window.setTimeout(() => {
            try {
                if (window.top && window.top !== window) {
                    window.top.location.assign(loginUrl);
                    return;
                }
            } catch (_error) {
                // Fall back to current window navigation.
            }
            window.location.assign(loginUrl);
        }, 1200);
    } catch (error) {
        console.error('Failed to confirm account deletion:', error);
        setStatus(error.message || 'Unable to delete account.', true, false);
        requestCodeBtn.disabled = false;
        confirmDeleteBtn.disabled = false;
        state.submitting = false;
        return;
    }

    state.submitting = false;
}

function setStatus(message, isError = false, isSuccess = false) {
    if (!statusBanner) {
        return;
    }

    const text = String(message || '').trim();
    statusBanner.textContent = text;
    statusBanner.hidden = !text;
    statusBanner.classList.toggle('is-error', Boolean(text) && Boolean(isError));
    statusBanner.classList.toggle('is-success', Boolean(text) && Boolean(isSuccess));
}
