const appClient = window.appClient;
const userIdDisplay = document.getElementById('userIdDisplay');
const nameInput = document.getElementById('name');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const profilePic = document.getElementById('profilePic');
const statusText = document.getElementById('statusText');
const fileInput = document.getElementById('fileInput');
const saveBtn = document.getElementById('saveBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginEmailInput = document.getElementById('loginEmailInput');
const loginEmailCodeInput = document.getElementById('loginEmailCodeInput');
const sendEmailCodeBtn = document.getElementById('sendEmailCodeBtn');
const verifyEmailCodeBtn = document.getElementById('verifyEmailCodeBtn');
const emailConnectStatus = document.getElementById('emailConnectStatus');
const googleConnectStatus = document.getElementById('googleConnectStatus');
const openGoogleModalBtn = document.getElementById('openGoogleModalBtn');
const googleConnectModal = document.getElementById('googleConnectModal');
const closeGoogleModalBtn = document.getElementById('closeGoogleModalBtn');
const googleModalStatus = document.getElementById('googleModalStatus');
const connectGoogleBtn = document.getElementById('connectGoogleBtn');
const unlinkEmailBtn = document.getElementById('unlinkEmailBtn');
const unlinkGoogleBtn = document.getElementById('unlinkGoogleBtn');

let session = null;
let connectionState = {
    login_email: '',
    login_email_verified: false,
    google_email: '',
    google_email_verified: false
};
let unlinkFlowState = {
    emailAwaitingCode: false,
    googleAwaitingCode: false
};

setupPasswordToggle('toggleNewPass', 'password');
setupPasswordToggle('toggleConfirmPass', 'confirmPassword');
syncUnlinkButtonLabels();
initialize();

async function initialize() {
    session = await appClient.ensureSession({ role: 'employee' });
    if (!session) {
        return;
    }

    try {
        const bootstrap = await appClient.getBootstrap();
        appClient.applyBootstrapBrandTheme(bootstrap);
    } catch (error) {
        console.error('Failed to load employee branding for settings:', error);
    }

    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = '/employee/employee.html';
    });

    saveBtn.addEventListener('click', saveSettings);
    logoutBtn.addEventListener('click', logout);
    sendEmailCodeBtn?.addEventListener('click', requestEmailCode);
    verifyEmailCodeBtn?.addEventListener('click', verifyEmailCode);
    openGoogleModalBtn?.addEventListener('click', openGoogleModal);
    closeGoogleModalBtn?.addEventListener('click', closeGoogleModal);
    googleConnectModal?.addEventListener('click', (event) => {
        if (event.target === googleConnectModal) {
            closeGoogleModal();
        }
    });
    connectGoogleBtn?.addEventListener('click', confirmGoogleConnect);
    unlinkEmailBtn?.addEventListener('click', unlinkEmailConnection);
    unlinkGoogleBtn?.addEventListener('click', unlinkGoogleConnection);
    await loadProfile();
}

window.loadImage = function loadImage(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        setStatus('Please choose a valid image file.', true);
        fileInput.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        profilePic.src = reader.result;
    };
    reader.readAsDataURL(file);
};

async function saveSettings() {
    const nameValue = nameInput.value.trim();
    const passwordValue = passwordInput.value.trim();
    const confirmValue = confirmPasswordInput.value.trim();

    if (!nameValue) {
        setStatus('Full name cannot be empty.', true);
        return;
    }

    if (passwordValue && passwordValue.length < 8) {
        setStatus('Password must be at least 8 characters.', true);
        return;
    }

    if ((passwordValue || confirmValue) && passwordValue !== confirmValue) {
        setStatus('Passwords do not match.', true);
        return;
    }

    saveBtn.disabled = true;

    try {
        const updatedUser = await appClient.saveUserProfile({
            id: session.userId,
            name: nameValue,
            password: passwordValue,
            profilePicture: profilePic.src
        });

        appClient.setSessionUser({
            id: updatedUser.id,
            name: updatedUser.name,
            role: updatedUser.role,
            company_id: updatedUser.company_id || session.companyId || '',
            company_code: updatedUser.company_code || session.companyCode || ''
        });

        passwordInput.value = '';
        confirmPasswordInput.value = '';
        setStatus('Changes saved successfully.', false);
    } catch (error) {
        console.error('Failed to save employee settings:', error);
        setStatus(error.message, true);
    } finally {
        saveBtn.disabled = false;
    }
}

async function logout() {
    await appClient.clearSession();
    appClient.redirectToLogin?.();
}

async function loadProfile() {
    try {
        const user = await appClient.getUser(session.userId);
        userIdDisplay.value = user.id;
        nameInput.value = user.name || '';
        profilePic.src = user.profile_picture || appClient.buildAvatarUrl(user.name, '2c2c2c', 'ffffff');
        applyConnectionState(user);
    } catch (error) {
        console.error('Failed to load employee profile:', error);
        setStatus(error.message, true);
    }
}

function applyConnectionState(user = {}) {
    connectionState = {
        login_email: String(user.login_email || '').trim(),
        login_email_verified: Boolean(user.login_email_verified),
        google_email: String(user.google_email || '').trim(),
        google_email_verified: Boolean(user.google_email_verified)
    };
    resetUnlinkFlowState();

    if (loginEmailInput) {
        loginEmailInput.value = connectionState.login_email || '';
    }

    if (connectionState.login_email_verified) {
        setConnectStatus(emailConnectStatus, `Email connected: ${connectionState.login_email}`, 'success');
    } else if (connectionState.login_email) {
        setConnectStatus(emailConnectStatus, `Email pending: ${connectionState.login_email}`, 'warning');
    } else {
        setConnectStatus(emailConnectStatus, 'Email not connected', 'default');
    }

    if (connectionState.google_email_verified) {
        setConnectStatus(googleConnectStatus, `Google connected: ${connectionState.google_email}`, 'success');
    } else {
        setConnectStatus(googleConnectStatus, 'Google not connected', 'default');
    }

    if (sendEmailCodeBtn) {
        sendEmailCodeBtn.disabled = connectionState.login_email_verified;
    }
    if (verifyEmailCodeBtn) {
        verifyEmailCodeBtn.disabled = connectionState.login_email_verified;
    }
    if (openGoogleModalBtn) {
        openGoogleModalBtn.disabled = false;
    }
    if (connectGoogleBtn) {
        connectGoogleBtn.disabled = connectionState.google_email_verified;
    }
    if (unlinkEmailBtn) {
        unlinkEmailBtn.disabled = !connectionState.login_email;
    }
    if (unlinkGoogleBtn) {
        unlinkGoogleBtn.disabled = !connectionState.google_email_verified;
    }
}

async function requestEmailCode() {
    if (!loginEmailInput || !sendEmailCodeBtn) {
        return;
    }
    const email = String(loginEmailInput.value || '').trim();
    if (!email) {
        setConnectStatus(emailConnectStatus, 'Email is required.', 'warning');
        setGoogleModalStatus('Email is required.', true);
        return;
    }

    sendEmailCodeBtn.disabled = true;
    const originalLabel = sendEmailCodeBtn.textContent;
    sendEmailCodeBtn.textContent = 'Sending...';

    try {
        const payload = await appClient.requestEmailConnectionCode({ email });
        if (payload?.alreadyLinked && payload?.verified) {
            setConnectStatus(emailConnectStatus, `Email connected: ${payload.email}`, 'success');
            setGoogleModalStatus(`Email already verified: ${payload.email}.`, false);
        } else {
            setConnectStatus(emailConnectStatus, `Email code sent to ${payload?.email || email}.`, 'warning');
            setGoogleModalStatus(`Code sent to ${payload?.email || email}.`, false);
            loginEmailCodeInput?.focus?.();
        }
    } catch (error) {
        console.error('Failed to request email code:', error);
        setConnectStatus(emailConnectStatus, error.message || 'Unable to send code.', 'warning');
        setGoogleModalStatus(error.message || 'Unable to send code.', true);
    } finally {
        sendEmailCodeBtn.disabled = false;
        sendEmailCodeBtn.textContent = originalLabel || 'Send Code';
    }
}

async function verifyEmailCode() {
    if (!loginEmailInput || !loginEmailCodeInput || !verifyEmailCodeBtn) {
        return;
    }
    const email = String(loginEmailInput.value || '').trim();
    const code = String(loginEmailCodeInput.value || '').trim();
    if (!email || !code) {
        setConnectStatus(emailConnectStatus, 'Email and code are required.', 'warning');
        setGoogleModalStatus('Email and code are required.', true);
        return;
    }

    verifyEmailCodeBtn.disabled = true;
    const originalLabel = verifyEmailCodeBtn.textContent;
    verifyEmailCodeBtn.textContent = 'Verifying...';

    try {
        const user = await appClient.verifyEmailConnectionCode({ email, code });
        loginEmailCodeInput.value = '';
        applyConnectionState(user);
        setGoogleModalStatus('Email verified. You can connect Google now.', false);
    } catch (error) {
        console.error('Failed to verify email code:', error);
        setConnectStatus(emailConnectStatus, error.message || 'Unable to verify code.', 'warning');
        setGoogleModalStatus(error.message || 'Unable to verify code.', true);
    } finally {
        verifyEmailCodeBtn.disabled = false;
        verifyEmailCodeBtn.textContent = originalLabel || 'Verify Email';
    }
}

function openGoogleModal() {
    if (!googleConnectModal) {
        return;
    }
    googleConnectModal.classList.add('is-open');
    googleConnectModal.setAttribute('aria-hidden', 'false');
    if (loginEmailInput) {
        loginEmailInput.value = connectionState.login_email || '';
    }
    if (loginEmailCodeInput) {
        loginEmailCodeInput.value = '';
    }
    resetUnlinkFlowState();
    setGoogleModalStatus('', false);
}

function closeGoogleModal() {
    if (!googleConnectModal) {
        return;
    }
    googleConnectModal.classList.remove('is-open');
    googleConnectModal.setAttribute('aria-hidden', 'true');
    resetUnlinkFlowState();
}

async function confirmGoogleConnect() {
    const email = String(loginEmailInput?.value || '').trim();
    const code = String(loginEmailCodeInput?.value || '').trim();
    const matchesVerifiedEmail = connectionState.login_email_verified
        && String(connectionState.login_email || '').trim().toLowerCase() === email.toLowerCase();
    if (!email) {
        setGoogleModalStatus('Email is required.', true);
        return;
    }
    if (!code && !matchesVerifiedEmail) {
        setGoogleModalStatus('Verification code is required.', true);
        return;
    }

    connectGoogleBtn.disabled = true;
    setGoogleModalStatus('Verifying code...', false);

    try {
        if (code) {
            const user = await appClient.verifyEmailConnectionCode({ email, code });
            applyConnectionState(user);
            if (loginEmailCodeInput) {
                loginEmailCodeInput.value = '';
            }
        }
    } catch (error) {
        console.error('Failed to verify email code for Google connect:', error);
        setGoogleModalStatus(error.message || 'Unable to verify code.', true);
        connectGoogleBtn.disabled = false;
        return;
    }

    await connectGoogleAccountWithModal(email);
}

async function unlinkEmailConnection() {
    if (!connectionState.login_email) {
        setGoogleModalStatus('No linked email to unbind.', true);
        return;
    }

    const code = String(loginEmailCodeInput?.value || '').trim();
    if (!unlinkFlowState.emailAwaitingCode || !code) {
        unlinkEmailBtn.disabled = true;
        unlinkGoogleBtn && (unlinkGoogleBtn.disabled = true);
        setGoogleModalStatus(`Sending unlink code to ${connectionState.login_email}...`, false);

        try {
            const payload = await appClient.requestEmailUnlinkCode();
            unlinkFlowState = {
                emailAwaitingCode: true,
                googleAwaitingCode: false
            };
            syncUnlinkButtonLabels();
            setGoogleModalStatus(`Unlink code sent to ${payload?.email || connectionState.login_email}. Enter it above, then click Confirm Unbind Email.`, false);
            loginEmailCodeInput?.focus?.();
        } catch (error) {
            console.error('Failed to send email unlink code:', error);
            setGoogleModalStatus(error.message || 'Unable to send unlink code.', true);
        } finally {
            unlinkEmailBtn.disabled = !connectionState.login_email;
            if (unlinkGoogleBtn) {
                unlinkGoogleBtn.disabled = !connectionState.google_email_verified;
            }
        }
        return;
    }

    unlinkEmailBtn.disabled = true;
    setGoogleModalStatus('Checking unlink verification code...', false);

    try {
        const user = await appClient.unlinkEmailConnection({ code });
        if (loginEmailCodeInput) {
            loginEmailCodeInput.value = '';
        }
        applyConnectionState(user);
        setGoogleModalStatus('Email connection removed after verification.', false);
    } catch (error) {
        console.error('Failed to unlink email connection:', error);
        setGoogleModalStatus(error.message || 'Unable to remove email connection.', true);
    } finally {
        unlinkEmailBtn.disabled = !connectionState.login_email;
        syncUnlinkButtonLabels();
    }
}

async function unlinkGoogleConnection() {
    if (!connectionState.google_email_verified) {
        setGoogleModalStatus('No linked Google account to unbind.', true);
        return;
    }

    const code = String(loginEmailCodeInput?.value || '').trim();
    if (!unlinkFlowState.googleAwaitingCode || !code) {
        unlinkGoogleBtn.disabled = true;
        unlinkEmailBtn && (unlinkEmailBtn.disabled = true);
        setGoogleModalStatus(`Sending unlink code to ${connectionState.google_email}...`, false);

        try {
            const payload = await appClient.requestGoogleUnlinkCode();
            unlinkFlowState = {
                emailAwaitingCode: false,
                googleAwaitingCode: true
            };
            syncUnlinkButtonLabels();
            setGoogleModalStatus(`Unlink code sent to ${payload?.email || connectionState.google_email}. Enter it above, then click Confirm Unbind Google.`, false);
            loginEmailCodeInput?.focus?.();
        } catch (error) {
            console.error('Failed to send Google unlink code:', error);
            setGoogleModalStatus(error.message || 'Unable to send unlink code.', true);
        } finally {
            if (unlinkEmailBtn) {
                unlinkEmailBtn.disabled = !connectionState.login_email;
            }
            unlinkGoogleBtn.disabled = !connectionState.google_email_verified;
        }
        return;
    }

    unlinkGoogleBtn.disabled = true;
    setGoogleModalStatus('Checking unlink verification code...', false);

    try {
        const user = await appClient.unlinkGoogleAccount({ code });
        if (loginEmailCodeInput) {
            loginEmailCodeInput.value = '';
        }
        applyConnectionState(user);
        setGoogleModalStatus('Google connection removed after verification.', false);
    } catch (error) {
        console.error('Failed to unlink Google connection:', error);
        setGoogleModalStatus(error.message || 'Unable to remove Google connection.', true);
    } finally {
        unlinkGoogleBtn.disabled = !connectionState.google_email_verified;
        syncUnlinkButtonLabels();
    }
}

async function connectGoogleAccountWithModal(email) {
    const normalizedEmail = String(email || loginEmailInput?.value || '').trim();
    if (!normalizedEmail) {
        setGoogleModalStatus('Email is required.', true);
        connectGoogleBtn.disabled = false;
        return;
    }

    setGoogleModalStatus('Connecting Google...', false);

    try {
        const user = await appClient.connectGoogleAccount({ email: normalizedEmail });
        applyConnectionState(user);
        setGoogleModalStatus('Google connected successfully.', false);
        closeGoogleModal();
    } catch (error) {
        console.error('Failed to connect Google account:', error);
        setGoogleModalStatus(error.message || 'Unable to connect Google.', true);
    } finally {
        connectGoogleBtn.disabled = connectionState.google_email_verified;
    }
}

function setConnectStatus(element, message, variant = 'default') {
    if (!element) {
        return;
    }
    element.textContent = String(message || '');
    element.classList.toggle('is-success', variant === 'success');
    element.classList.toggle('is-warning', variant === 'warning');
}

function setGoogleModalStatus(message, isError) {
    if (!googleModalStatus) {
        return;
    }
    const text = String(message || '').trim();
    googleModalStatus.textContent = text;
    googleModalStatus.hidden = !text;
    googleModalStatus.classList.toggle('is-error', Boolean(isError));
}

function resetUnlinkFlowState() {
    unlinkFlowState = {
        emailAwaitingCode: false,
        googleAwaitingCode: false
    };
    syncUnlinkButtonLabels();
}

function syncUnlinkButtonLabels() {
    if (unlinkEmailBtn) {
        unlinkEmailBtn.textContent = unlinkFlowState.emailAwaitingCode
            ? 'Confirm Unbind Email'
            : 'Unbind Email';
    }
    if (unlinkGoogleBtn) {
        unlinkGoogleBtn.textContent = unlinkFlowState.googleAwaitingCode
            ? 'Confirm Unbind Google'
            : 'Unbind Google';
    }
}

function setupPasswordToggle(toggleId, inputId) {
    const toggleIcon = document.getElementById(toggleId);
    const input = document.getElementById(inputId);
    if (!toggleIcon || !input) return;

    toggleIcon.addEventListener('click', () => {
        const showText = input.type === 'password';
        input.type = showText ? 'text' : 'password';
        toggleIcon.classList.toggle('fa-eye', !showText);
        toggleIcon.classList.toggle('fa-eye-slash', showText);
    });
}

function setStatus(message, isError) {
    const text = String(message || '').trim();
    statusText.textContent = text;
    statusText.hidden = !text;
    statusText.classList.toggle('is-error', Boolean(text) && Boolean(isError));
    statusText.classList.toggle('is-success', Boolean(text) && !isError);
}
