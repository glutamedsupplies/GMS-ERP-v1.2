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
    connectGoogleBtn?.addEventListener('click', connectGoogleAccount);
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
        setConnectStatus(emailConnectStatus, `Connected: ${connectionState.login_email}`, 'success');
    } else if (connectionState.login_email) {
        setConnectStatus(emailConnectStatus, `Pending verification for ${connectionState.login_email}`, 'warning');
    } else {
        setConnectStatus(emailConnectStatus, 'Not connected', 'default');
    }

    if (connectionState.google_email_verified) {
        setConnectStatus(googleConnectStatus, `Connected: ${connectionState.google_email}`, 'success');
    } else {
        setConnectStatus(googleConnectStatus, 'Not connected', 'default');
    }

    if (sendEmailCodeBtn) {
        sendEmailCodeBtn.disabled = connectionState.login_email_verified;
    }
    if (verifyEmailCodeBtn) {
        verifyEmailCodeBtn.disabled = connectionState.login_email_verified;
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
        return;
    }

    sendEmailCodeBtn.disabled = true;
    const originalLabel = sendEmailCodeBtn.textContent;
    sendEmailCodeBtn.textContent = 'Sending...';

    try {
        const payload = await appClient.requestEmailConnectionCode({ email });
        if (payload?.alreadyLinked && payload?.verified) {
            setConnectStatus(emailConnectStatus, `Connected: ${payload.email}`, 'success');
        } else {
            setConnectStatus(emailConnectStatus, `Code sent to ${payload?.email || email}.`, 'warning');
            loginEmailCodeInput?.focus?.();
        }
    } catch (error) {
        console.error('Failed to request email code:', error);
        setConnectStatus(emailConnectStatus, error.message || 'Unable to send code.', 'warning');
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
        return;
    }

    verifyEmailCodeBtn.disabled = true;
    const originalLabel = verifyEmailCodeBtn.textContent;
    verifyEmailCodeBtn.textContent = 'Verifying...';

    try {
        const user = await appClient.verifyEmailConnectionCode({ email, code });
        loginEmailCodeInput.value = '';
        applyConnectionState(user);
    } catch (error) {
        console.error('Failed to verify email code:', error);
        setConnectStatus(emailConnectStatus, error.message || 'Unable to verify code.', 'warning');
    } finally {
        verifyEmailCodeBtn.disabled = false;
        verifyEmailCodeBtn.textContent = originalLabel || 'Verify';
    }
}

async function connectGoogleAccount() {
    if (!connectGoogleBtn) {
        return;
    }
    const firebase = getFirebaseContext();
    if (!firebase) {
        setConnectStatus(googleConnectStatus, 'Firebase auth is not ready yet.', 'warning');
        return;
    }

    connectGoogleBtn.disabled = true;
    setConnectStatus(googleConnectStatus, 'Opening Google...', 'warning');
    const provider = new firebase.helpers.GoogleAuthProvider();

    try {
        const result = await firebase.helpers.signInWithPopup(firebase.auth, provider);
        const idToken = await firebase.helpers.getIdToken(result.user, true);
        const user = await appClient.connectGoogleAccount({ idToken });
        applyConnectionState(user);
    } catch (error) {
        console.error('Failed to connect Google account:', error);
        setConnectStatus(googleConnectStatus, resolveFirebaseError(error), 'warning');
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
