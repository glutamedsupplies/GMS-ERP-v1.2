const appClient = window.appClient;
const profilePic = document.getElementById('profilePic');
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const adminIdDisplay = document.getElementById('adminIdDisplay');
const adminName = document.getElementById('adminName');
const newPass = document.getElementById('newPass');
const confirmPass = document.getElementById('confirmPass');
const saveBtn = document.getElementById('saveBtn');
const logoutBtn = document.getElementById('logoutBtn');
const statusText = document.getElementById('statusText');
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

let session = null;
let connectionState = {
    login_email: '',
    login_email_verified: false,
    google_email: '',
    google_email_verified: false
};

setupPasswordToggle('togglePass1', 'newPass');
setupPasswordToggle('togglePass2', 'confirmPass');
initialize();

async function initialize() {
    session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    fileInput.addEventListener('change', loadImage);
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
    await loadProfile();
}

async function loadProfile() {
    try {
        const user = await appClient.getUser(session.userId);
        adminIdDisplay.value = user.id || '';
        adminName.value = user.name || '';
        profilePic.src = user.profile_picture || appClient.buildAvatarUrl(user.name || 'Head Admin', '1f2937', 'ffffff');
        fileName.textContent = 'No new photo selected';
        applyConnectionState(user);
        setStatus('Ready for changes.', false, false);
    } catch (error) {
        console.error('Failed to load head admin profile:', error);
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

    if (loginEmailInput && connectionState.login_email) {
        loginEmailInput.value = connectionState.login_email;
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
        verifyEmailCodeBtn.textContent = originalLabel || 'Verify';
    }
}

function openGoogleModal() {
    if (!googleConnectModal) {
        return;
    }
    googleConnectModal.classList.add('is-open');
    googleConnectModal.setAttribute('aria-hidden', 'false');
    if (loginEmailInput) {
        loginEmailInput.value = loginEmailInput.value || connectionState.login_email || '';
    }
    if (loginEmailCodeInput) {
        loginEmailCodeInput.value = '';
    }
    setGoogleModalStatus('', false);
}

function closeGoogleModal() {
    if (!googleConnectModal) {
        return;
    }
    googleConnectModal.classList.remove('is-open');
    googleConnectModal.setAttribute('aria-hidden', 'true');
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
    googleModalStatus.textContent = message || '';
    googleModalStatus.classList.toggle('is-error', Boolean(isError));
}

function loadImage(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
        fileName.textContent = 'No new photo selected';
        return;
    }

    if (!file.type.startsWith('image/')) {
        fileInput.value = '';
        fileName.textContent = 'No new photo selected';
        setStatus('Please choose a valid image file.', true);
        return;
    }

    fileName.textContent = file.name;

    const reader = new FileReader();
    reader.onload = () => {
        profilePic.src = reader.result;
        setStatus('Photo preview updated.', false, false);
    };
    reader.readAsDataURL(file);
}

async function saveSettings() {
    const nameValue = adminName.value.trim();
    const passwordValue = newPass.value.trim();
    const confirmValue = confirmPass.value.trim();

    if (!nameValue) {
        setStatus('Full name cannot be empty.', true);
        adminName.focus();
        return;
    }

    if (passwordValue && passwordValue.length < 8) {
        setStatus('Password must be at least 8 characters.', true);
        newPass.focus();
        return;
    }

    if ((passwordValue || confirmValue) && passwordValue !== confirmValue) {
        setStatus('Passwords do not match.', true);
        confirmPass.focus();
        return;
    }

    saveBtn.disabled = true;
    setStatus('Saving changes...', false, false);

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
            role: updatedUser.role
        });

        newPass.value = '';
        confirmPass.value = '';
        setStatus('Changes saved successfully.', false, true);
    } catch (error) {
        console.error('Failed to save head admin settings:', error);
        setStatus(error.message, true);
    } finally {
        saveBtn.disabled = false;
    }
}

async function logout() {
    await appClient.clearSession();

    if (window.parent && window.parent !== window) {
        window.parent.postMessage('logout', window.location.origin);
        return;
    }

    appClient.redirectToLogin?.();
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

function setStatus(message, isError, isSuccess = false) {
    statusText.textContent = message;
    statusText.classList.toggle('is-error', Boolean(isError));
    statusText.classList.toggle('is-success', Boolean(isSuccess));
}
