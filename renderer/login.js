const appClient = window.appClient;
const loginBtn = document.getElementById('loginBtn');
const messageDiv = document.getElementById('message');
const passwordInput = document.getElementById('password');
const idInput = document.getElementById('idNumber');
const companyCodeInput = document.getElementById('companyCode');
const customerPortalBtn = document.getElementById('customerPortalBtn');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
const togglePassIcon = document.getElementById('togglePass')?.querySelector('i');
const loginTitleEl = document.getElementById('loginTitle');
const loginSubtitleEl = document.getElementById('loginSubtitle');
const brandLogoEl = document.getElementById('brandLogo');
const DEFAULT_LOGO_PATH = '/logo.png';

let brandingTimer = null;

redirectIfSessionExists();
refreshBranding();

if (togglePassIcon) {
    togglePassIcon.parentElement.addEventListener('click', () => {
        const isHidden = passwordInput.type === 'password';
        passwordInput.type = isHidden ? 'text' : 'password';
        togglePassIcon.classList.toggle('fa-eye', !isHidden);
        togglePassIcon.classList.toggle('fa-eye-slash', isHidden);
    });
}

if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
}

if (customerPortalBtn) {
    customerPortalBtn.addEventListener('click', () => {
        window.location.assign(getCustomerPortalUrl());
    });
}

if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener('click', (event) => {
        event.preventDefault();
        window.location.assign(getForgotPasswordUrl());
    });
}

if (passwordInput) {
    passwordInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            handleLogin();
        }
    });
}

if (idInput) {
    idInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            handleLogin();
        }
    });
}

if (companyCodeInput) {
    companyCodeInput.addEventListener('input', () => {
        if (brandingTimer) {
            window.clearTimeout(brandingTimer);
        }
        brandingTimer = window.setTimeout(() => {
            refreshBranding();
        }, 180);
    });

    companyCodeInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            handleLogin();
        }
    });
}

async function handleLogin() {
    const id = idInput.value.trim();
    const password = passwordInput.value.trim();
    const companyCode = String(companyCodeInput?.value || '').trim();

    if (!id || !password) {
        setMessage('Please enter username and password.', '#ffffff');
        return;
    }

    loginBtn.disabled = true;
    setMessage('Signing in...', '#ffffff');

    try {
        const user = await appClient.login({
            companyCode,
            username: id,
            password
        });
        redirectByRole(user.role);
    } catch (error) {
        console.error('Login failed:', error);
        setMessage(error.message, '#ff6b6b');
    } finally {
        loginBtn.disabled = false;
    }
}

async function redirectIfSessionExists() {
    try {
        const user = await appClient.getCurrentSession();
        if (!user) {
            return;
        }

        redirectByRole(user.role);
    } catch (error) {
        console.error('Failed to restore session:', error);
    }
}

function redirectByRole(role) {
    const normalizedRole = String(role || '').toLowerCase();
    if (normalizedRole === 'super_admin') {
        window.location.replace('/super_admin/dashboard.html');
        return;
    }

    if (normalizedRole === 'head_admin' || normalizedRole === 'company_admin') {
        window.location.replace('/head_admin/dashboard.html');
        return;
    }

    window.location.replace('/employee/employee.html');
}

function setMessage(message, color) {
    if (!messageDiv) return;
    messageDiv.innerText = message;
    messageDiv.style.color = color;
}

function getCustomerPortalUrl() {
    const companyCode = String(companyCodeInput?.value || '').trim();
    return companyCode
        ? `/renderer/customer_portal.html?companyCode=${encodeURIComponent(companyCode)}`
        : '/renderer/customer_portal.html';
}

function getForgotPasswordUrl() {
    const companyCode = String(companyCodeInput?.value || '').trim();
    return companyCode
        ? `/renderer/forgot_password.html?companyCode=${encodeURIComponent(companyCode)}`
        : '/renderer/forgot_password.html';
}

async function refreshBranding() {
    try {
        const branding = await appClient.getPublicBranding({
            companyCode: String(companyCodeInput?.value || '').trim()
        });
        applyBranding(branding || {});
    } catch (_error) {
        applyBranding({});
    }
}

function applyBranding(branding) {
    const appName = String(branding.appName || '').trim() || 'GMS ERP';
    const companyName = String(branding.companyName || '').trim();
    const primaryColor = String(branding.primaryColor || '').trim() || '#2575fc';
    const logoPath = String(branding.logoPath || '').trim() || DEFAULT_LOGO_PATH;

    document.title = `${appName} Login`;
    if (loginTitleEl) {
        loginTitleEl.textContent = `${appName} Login`;
    }
    if (loginSubtitleEl) {
        loginSubtitleEl.textContent = companyName
            ? `Company: ${companyName}`
            : 'Sign in to continue';
    }
    if (brandLogoEl) {
        brandLogoEl.onerror = () => {
            brandLogoEl.onerror = null;
            brandLogoEl.src = DEFAULT_LOGO_PATH;
        };
        brandLogoEl.src = logoPath;
    }

    document.body.style.background = `linear-gradient(135deg, ${primaryColor}, #1f2937)`;
}
