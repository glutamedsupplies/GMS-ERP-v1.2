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

let session = null;

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
    } catch (error) {
        console.error('Failed to load employee profile:', error);
        setStatus(error.message, true);
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
    statusText.innerText = message;
    statusText.classList.toggle('is-error', Boolean(isError));
    statusText.classList.toggle('is-success', Boolean(message) && !isError);
}
