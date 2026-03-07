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

let session = null;

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
    await loadProfile();
}

async function loadProfile() {
    try {
        const user = await appClient.getUser(session.userId);
        adminIdDisplay.value = user.id || '';
        adminName.value = user.name || '';
        profilePic.src = user.profile_picture || appClient.buildAvatarUrl(user.name || 'Head Admin', '1f2937', 'ffffff');
        fileName.textContent = 'No new photo selected';
        setStatus('Ready for changes.', false, false);
    } catch (error) {
        console.error('Failed to load head admin profile:', error);
        setStatus(error.message, true);
    }
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

    window.location.replace('/index.html');
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
