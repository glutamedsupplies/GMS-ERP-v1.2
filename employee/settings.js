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

let session = null;
let connectionState = {
    login_email: '',
    login_email_verified: false,
    google_email: '',
    google_email_verified: false
};

setupPasswordToggle('toggleNewPass', 'password');
setupPasswordToggle('toggleConfirmPass', 'confirmPassword');
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
    if (!email) {
        setGoogleModalStatus('Email is required.', true);
        return;
    }
    if (!code && !connectionState.login_email_verified) {
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

    await connectGoogleAccountWithModal();
}

async function connectGoogleAccountWithModal() {
    const firebase = getFirebaseContext();
    if (!firebase) {
        setGoogleModalStatus('Firebase auth is not ready yet.', true);
        connectGoogleBtn.disabled = false;
        return;
    }

    setGoogleModalStatus('Opening Google...', false);
    const provider = new firebase.helpers.GoogleAuthProvider();

    try {
        const result = await firebase.helpers.signInWithPopup(firebase.auth, provider);
        const idToken = await firebase.helpers.getIdToken(result.user, true);
        const user = await appClient.connectGoogleAccount({ idToken });
        applyConnectionState(user);
        setGoogleModalStatus('Google connected successfully.', false);
        closeGoogleModal();
    } catch (error) {
        console.error('Failed to connect Google account:', error);
        setGoogleModalStatus(resolveFirebaseError(error), true);
    } finally {
        connectGoogleBtn.disabled = connectionState.google_email_verified;
    }
}

function getFirebaseContext() {
    const auth = window.firebaseAuth;
    const helpers = window.firebaseAuthHelpers;
    if (!auth || !helpers) {
        return null;
    }
    return { auth, helpers };
}

function resolveFirebaseError(error) {
    const code = String(error?.code || '').trim();
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return 'Google sign-in canceled.';
    }
    if (code === 'auth/popup-blocked') {
        return 'Popup blocked. Allow popups and try again.';
    }
    return error?.message || 'Google sign-in failed.';
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
    statusText.innerText = message;
    statusText.classList.toggle('is-error', Boolean(isError));
    statusText.classList.toggle('is-success', Boolean(message) && !isError);
}
