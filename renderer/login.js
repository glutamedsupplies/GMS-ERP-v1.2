const appClient = window.appClient;
const loginBtn = document.getElementById('loginBtn');
const loginCardEl = document.getElementById('loginCard');
const logoContainerEl = document.getElementById('logoContainer');
const backgroundPhotoEl = document.getElementById('backgroundPhoto');
const messageDiv = document.getElementById('message');
const passwordInput = document.getElementById('password');
const idInput = document.getElementById('idNumber');
const companyCodeInput = document.getElementById('companyCode');
const companyCodeGroupEl = document.getElementById('companyCodeGroup');
const customerPortalBtn = document.getElementById('customerPortalBtn');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
const togglePassIcon = document.getElementById('togglePass')?.querySelector('i');
const loginTitleEl = document.getElementById('loginTitle');
const loginSubtitleEl = document.getElementById('loginSubtitle');
const brandingBadgeEl = document.getElementById('brandingBadge');
const brandingHintEl = document.getElementById('brandingHint');
const brandLogoEl = document.getElementById('brandLogo');
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const pageTitleEl = document.getElementById('pageTitle');
const DEFAULT_LOGO_PATH = '/logo.png';
const DEFAULT_PRIMARY_COLOR = '#2575fc';
const DEFAULT_BRANDING = Object.freeze({
    appName: 'GMS ERP',
    companyName: '',
    primaryColor: DEFAULT_PRIMARY_COLOR,
    logoPath: DEFAULT_LOGO_PATH,
    backgroundImagePath: '',
    whiteLabel: false
});

let brandingTimer = null;
let brandingRequestId = 0;
let backgroundImageRequestId = 0;
let lastBrandingSignature = '';

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
        setBrandingSearchState(Boolean(String(companyCodeInput.value || '').trim()));
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
        setMessage(error.message, '#ff7a7a');
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
    if (!messageDiv) {
        return;
    }
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
    const requestId = ++brandingRequestId;
    const companyCode = String(companyCodeInput?.value || '').trim();

    try {
        const branding = await appClient.getPublicBranding({ companyCode });
        if (requestId !== brandingRequestId) {
            return;
        }
        applyBranding(branding || {}, { companyCode });
    } catch (_error) {
        if (requestId !== brandingRequestId) {
            return;
        }
        applyBranding({}, { companyCode });
    } finally {
        if (requestId === brandingRequestId) {
            setBrandingSearchState(false);
        }
    }
}

function applyBranding(rawBranding, { companyCode = '' } = {}) {
    const branding = normalizeBranding(rawBranding);
    const palette = buildThemePalette(branding.primaryColor);
    const signature = JSON.stringify([
        branding.appName,
        branding.companyName,
        branding.primaryColor,
        branding.logoPath,
        branding.backgroundImagePath,
        branding.whiteLabel
    ]);
    const shouldAnimate = signature !== lastBrandingSignature;

    lastBrandingSignature = signature;
    applyThemePalette(palette);
    applyThemeCopy(branding, companyCode);
    applyThemeLogo(branding.logoPath);
    applyBackgroundImage(branding.backgroundImagePath);

    if (shouldAnimate) {
        triggerTransientClass(loginCardEl, 'is-branding-updating');
        triggerTransientClass(logoContainerEl, 'is-branding-updating');
    }
}

function normalizeBranding(rawBranding = {}) {
    return {
        appName: String(rawBranding.appName || '').trim() || DEFAULT_BRANDING.appName,
        companyName: String(rawBranding.companyName || '').trim(),
        primaryColor: normalizeHexColor(rawBranding.primaryColor, DEFAULT_BRANDING.primaryColor),
        logoPath: String(rawBranding.logoPath || '').trim() || DEFAULT_BRANDING.logoPath,
        backgroundImagePath: String(
            rawBranding.backgroundImagePath
            || rawBranding.loginBackgroundPath
            || ''
        ).trim(),
        whiteLabel: Boolean(rawBranding.whiteLabel)
    };
}

function applyThemeCopy(branding, companyCode) {
    const appName = branding.appName;
    const companyName = branding.companyName;

    document.title = `${appName} Login`;
    if (pageTitleEl) {
        pageTitleEl.textContent = `${appName} Login`;
    }
    if (loginTitleEl) {
        loginTitleEl.textContent = `${appName} Login`;
    }
    if (loginSubtitleEl) {
        loginSubtitleEl.textContent = companyName
            ? `Company: ${companyName}`
            : 'Sign in to continue';
    }
    if (brandingBadgeEl) {
        brandingBadgeEl.textContent = companyName
            ? 'Active Company'
            : 'Default Sign-In Theme';
    }
    if (brandingHintEl) {
        brandingHintEl.textContent = resolveBrandingHint(branding, companyCode);
    }
    if (companyCodeGroupEl) {
        companyCodeGroupEl.classList.toggle('is-brand-loaded', Boolean(companyName));
    }
}

function applyThemeLogo(logoPath) {
    if (!brandLogoEl) {
        return;
    }

    brandLogoEl.onerror = () => {
        brandLogoEl.onerror = null;
        brandLogoEl.src = DEFAULT_LOGO_PATH;
    };
    brandLogoEl.src = String(logoPath || '').trim() || DEFAULT_LOGO_PATH;
}

function applyBackgroundImage(source) {
    if (!backgroundPhotoEl) {
        return;
    }

    const nextSource = String(source || '').trim();
    const requestId = ++backgroundImageRequestId;

    if (!nextSource) {
        backgroundPhotoEl.classList.remove('has-image');
        backgroundPhotoEl.style.backgroundImage = 'none';
        return;
    }

    const probe = new Image();
    probe.onload = () => {
        if (requestId !== backgroundImageRequestId) {
            return;
        }
        backgroundPhotoEl.style.backgroundImage = toCssUrl(nextSource);
        backgroundPhotoEl.classList.add('has-image');
    };
    probe.onerror = () => {
        if (requestId !== backgroundImageRequestId) {
            return;
        }
        backgroundPhotoEl.style.backgroundImage = 'none';
        backgroundPhotoEl.classList.remove('has-image');
    };
    probe.src = nextSource;
}

function setBrandingSearchState(isSearching) {
    if (!companyCodeGroupEl) {
        return;
    }
    companyCodeGroupEl.classList.toggle('is-searching', Boolean(isSearching));
}

function applyThemePalette(palette) {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--brand-primary', palette.primary);
    rootStyle.setProperty('--brand-primary-rgb', palette.primaryRgb);
    rootStyle.setProperty('--page-gradient', palette.pageGradient);
    rootStyle.setProperty('--button-gradient', palette.buttonGradient);
    rootStyle.setProperty('--card-border', `rgba(${palette.primaryRgb}, 0.2)`);
    rootStyle.setProperty('--input-border', `rgba(${palette.primaryRgb}, 0.15)`);

    if (themeColorMeta) {
        themeColorMeta.setAttribute('content', palette.primary);
    }
}

function resolveBrandingHint(branding, companyCode) {
    if (branding.companyName && branding.whiteLabel && branding.backgroundImagePath) {
        return 'Custom login background, logo, and color are loaded from Company Profile.';
    }
    if (branding.companyName && branding.whiteLabel) {
        return 'Custom company color and logo are loaded live while you type the company code.';
    }
    if (branding.companyName) {
        return 'Company found. Default parent branding is active until White Label is enabled.';
    }
    if (companyCode) {
        return 'No custom company theme found for this code yet. Showing the default sign-in style.';
    }
    return 'Type your company code to preview your company theme before logging in.';
}

function buildThemePalette(primaryColor) {
    const primary = normalizeHexColor(primaryColor, DEFAULT_PRIMARY_COLOR);
    const primaryRgb = rgbTupleToCss(hexToRgb(primary));
    const bright = mixHexColors(primary, '#ffffff', 0.28);
    const accent = mixHexColors(primary, '#8b5cf6', 0.34);
    const rose = mixHexColors(primary, '#ec4899', 0.42);
    const deep = mixHexColors(primary, '#020617', 0.78);
    const dusk = mixHexColors(primary, '#0f172a', 0.58);
    const lead = mixHexColors(primary, '#0f172a', 0.34);

    return {
        primary,
        primaryRgb,
        pageGradient: [
            `radial-gradient(circle at 15% 20%, ${hexToRgba(bright, 0.3)} 0%, transparent 34%)`,
            `radial-gradient(circle at 85% 0%, ${hexToRgba(accent, 0.24)} 0%, transparent 28%)`,
            `linear-gradient(140deg, ${lead} 0%, ${dusk} 56%, ${deep} 100%)`
        ].join(', '),
        buttonGradient: `linear-gradient(135deg, ${bright} 0%, ${accent} 56%, ${rose} 100%)`
    };
}

function triggerTransientClass(element, className) {
    if (!element) {
        return;
    }
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
}

function normalizeHexColor(value, fallback = DEFAULT_PRIMARY_COLOR) {
    const text = String(value || '').trim();
    const longMatch = text.match(/^#?([0-9a-f]{6})$/i);
    if (longMatch) {
        return `#${longMatch[1].toLowerCase()}`;
    }

    const shortMatch = text.match(/^#?([0-9a-f]{3})$/i);
    if (shortMatch) {
        return `#${shortMatch[1].toLowerCase().split('').map((part) => part + part).join('')}`;
    }

    return fallback;
}

function hexToRgb(hex) {
    const normalized = normalizeHexColor(hex, DEFAULT_PRIMARY_COLOR).slice(1);
    return [
        Number.parseInt(normalized.slice(0, 2), 16),
        Number.parseInt(normalized.slice(2, 4), 16),
        Number.parseInt(normalized.slice(4, 6), 16)
    ];
}

function hexToRgba(hex, alpha) {
    const [red, green, blue] = hexToRgb(hex);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function mixHexColors(baseHex, mixHex, weight = 0.5) {
    const baseRgb = hexToRgb(baseHex);
    const mixRgb = hexToRgb(mixHex);
    const finalRgb = baseRgb.map((value, index) => {
        return Math.round(value + ((mixRgb[index] - value) * clamp(weight, 0, 1)));
    });
    return `#${finalRgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value || 0)));
}

function rgbTupleToCss(tuple) {
    return tuple.join(', ');
}

function toCssUrl(value) {
    return `url("${String(value || '').replace(/["\\]/g, '\\$&')}")`;
}
