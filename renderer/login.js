const appClient = window.appClient;
const loginBtn = document.getElementById('loginBtn');
const loginCardEl = document.getElementById('loginCard');
const logoContainerEl = document.getElementById('logoContainer');
const backgroundPhotoEl = document.getElementById('backgroundPhoto');
const messageDiv = document.getElementById('message');
const passwordInput = document.getElementById('password');
const emailInput = document.getElementById('email');
const companyCodeInput = document.getElementById('companyCode');
const companyCodeGroupEl = document.getElementById('companyCodeGroup');
const signUpBtn = document.getElementById('signUpBtn');
const registerCompanyIdBtn = document.getElementById('registerCompanyIdBtn');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const togglePassIcon = document.getElementById('togglePass')?.querySelector('i');
const loginTitleEl = document.getElementById('loginTitle');
const loginSubtitleEl = document.getElementById('loginSubtitle');
const brandingHintEl = document.getElementById('brandingHint');
const brandLogoEl = document.getElementById('brandLogo');
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const pageTitleEl = document.getElementById('pageTitle');
const welcomeOverlayEl = document.getElementById('welcomeOverlay');
const welcomeLogoEl = document.getElementById('welcomeLogo');
const welcomeRoleChipEl = document.getElementById('welcomeRoleChip');
const welcomeDestinationChipEl = document.getElementById('welcomeDestinationChip');
const welcomeTitleEl = document.getElementById('welcomeTitle');
const welcomeCopyEl = document.getElementById('welcomeCopy');
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
let currentBranding = { ...DEFAULT_BRANDING };
let welcomeTransitionActive = false;
let firebaseDisabled = false;
let lastBackgroundSource = '';

const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const WELCOME_TIMINGS = {
    enter: prefersReducedMotion ? 0 : 140,
    zoom: prefersReducedMotion ? 0 : 420,
    exit: prefersReducedMotion ? 0 : 120
};
const BOOTSTRAP_TIMEOUT_MS = 650;

const FIREBASE_FALLBACK_CODES = new Set([
    'auth/user-not-found',
    'auth/invalid-email',
    'auth/invalid-credential',
    'auth/invalid-login-credentials',
    'auth/wrong-password',
    'auth/user-disabled',
    'auth/operation-not-allowed',
    'auth/network-request-failed',
    'auth/internal-error',
    'auth/unauthorized-domain',
    'auth/invalid-api-key',
    'auth/app-not-authorized',
    'auth/too-many-requests'
]);
const FIREBASE_DISABLE_CODES = new Set([
    'auth/operation-not-allowed',
    'auth/internal-error',
    'auth/unauthorized-domain',
    'auth/invalid-api-key',
    'auth/app-not-authorized'
]);
const FIREBASE_POPUP_CANCEL_CODES = new Set([
    'auth/popup-closed-by-user',
    'auth/cancelled-popup-request'
]);
const FIREBASE_GOOGLE_REDIRECT_CODES = new Set([
    'auth/internal-error',
    'auth/operation-not-allowed',
    'auth/unauthorized-domain',
    'auth/app-not-authorized',
    'auth/invalid-api-key',
    'auth/network-request-failed',
    'auth/popup-blocked'
]);

applyQueryPrefill();
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

if (signUpBtn) {
    signUpBtn.addEventListener('click', () => {
        window.location.assign(getSignUpUrl());
    });
}

if (registerCompanyIdBtn) {
    registerCompanyIdBtn.addEventListener('click', () => {
        window.location.assign(getRegisterCompanyIdUrl());
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

if (emailInput) {
    emailInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            handleLogin();
        }
    });
}

if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', handleGoogleLogin);
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
    if (welcomeTransitionActive) {
        return;
    }

    const email = emailInput?.value.trim() || '';
    const password = passwordInput.value.trim();
    const companyCode = String(companyCodeInput?.value || '').trim();

    if (!email || !password) {
        setMessage('Please enter email and password.', '#ffffff');
        return;
    }

    loginBtn.disabled = true;
    setMessage('Signing in...', '#ffffff');

    try {
        const firebase = getFirebaseContext();
        let user = null;

        if (firebase) {
            try {
                const credential = await firebase.helpers.signInWithEmailAndPassword(
                    firebase.auth,
                    email,
                    password
                );
                const idToken = await firebase.helpers.getIdToken(credential.user, true);
                user = await appClient.loginWithFirebase({ idToken, companyCode });
            } catch (firebaseError) {
                if (!shouldFallbackToLegacy(firebaseError)) {
                    throw firebaseError;
                }
                if (shouldDisableFirebase(firebaseError)) {
                    firebaseDisabled = true;
                }
                user = await appClient.login({
                    companyCode,
                    username: email,
                    password
                });
            }
        } else {
            user = await appClient.login({
                companyCode,
                username: email,
                password
            });
        }
        const welcomeContext = await buildWelcomeContext(user, {
            companyCode,
            loginId: email
        });
        await playWelcomeTransition(welcomeContext);
        redirectByRole(user.role, { bootstrap: welcomeContext.bootstrap });
    } catch (error) {
        console.error('Login failed:', error);
        welcomeTransitionActive = false;
        resetWelcomeTransitionState();
        setMessage(resolveAuthErrorMessage(error), '#ff7a7a');
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
        if (String(user.role || '').toLowerCase() === 'super_admin') {
            redirectByRole(user.role);
            return;
        }

        let bootstrap = null;
        try {
            bootstrap = await appClient.getBootstrap();
        } catch (error) {
            console.error('Failed to load bootstrap for session redirect:', error);
        }
        redirectByRole(user.role, { bootstrap });
    } catch (error) {
        console.error('Failed to restore session:', error);
    }
}

function redirectByRole(role, { bootstrap = null } = {}) {
    const normalizedRole = String(role || '').toLowerCase();
    if (normalizedRole === 'super_admin') {
        window.location.replace('/super_admin/dashboard.html');
        return;
    }

    const attendanceOnlyMode = String(bootstrap?.workspaceConfig?.experience?.mode || '').trim().toLowerCase() === 'attendance_only';
    const path = attendanceOnlyMode
        ? ((normalizedRole === 'head_admin' || normalizedRole === 'company_admin')
            ? '/head_admin/dashboard.html'
            : '/employee/employee.html')
        : ((normalizedRole === 'head_admin' || normalizedRole === 'company_admin')
            ? '/head_admin/dashboard.html'
            : '/employee/employee.html');
    const tenantHost = resolveTenantHost(bootstrap);
    if (tenantHost) {
        const currentHost = normalizeHost(window.location.hostname);
        if (currentHost && currentHost !== tenantHost) {
            window.location.replace(`${window.location.protocol}//${tenantHost}${path}`);
            return;
        }
    }
    window.location.replace(path);
}

async function buildWelcomeContext(user, { companyCode = '', loginId = '' } = {}) {
    const bootstrap = await getBootstrapWithTimeout();

    const fallbackBranding = {
        ...currentBranding,
        companyName: currentBranding.companyName || String(companyCode || '').trim().toUpperCase()
    };
    const branding = normalizeBranding({
        ...fallbackBranding,
        ...(bootstrap?.branding || {}),
        companyName: bootstrap?.company?.name || bootstrap?.branding?.companyName || fallbackBranding.companyName,
        appName: bootstrap?.company?.app_name || bootstrap?.branding?.appName || fallbackBranding.appName,
        primaryColor: bootstrap?.company?.primary_color || bootstrap?.branding?.primaryColor || fallbackBranding.primaryColor,
        logoPath: bootstrap?.company?.logo_path || bootstrap?.branding?.logoPath || fallbackBranding.logoPath
    });
    const userName = String(user?.name || loginId || user?.id || 'User').trim() || 'User';
    const destination = resolveRoleDestination(user?.role);
    const roleLabel = resolveRoleLabel(user?.role);
    const companyName = String(bootstrap?.company?.name || branding.companyName || '').trim();
    const appName = String(branding.appName || DEFAULT_BRANDING.appName).trim() || DEFAULT_BRANDING.appName;

    applyBranding(branding, { companyCode });

    return {
        userName,
        displayName: userName,
        roleLabel,
        destination,
        companyName,
        appName,
        branding,
        bootstrap
    };
}

function normalizeHost(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .split(':')[0];
}

function getBaseDomain(hostname = '') {
    const normalized = normalizeHost(hostname);
    if (!normalized || normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1') {
        return '';
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
        return '';
    }
    const parts = normalized.split('.').filter(Boolean);
    if (parts.length < 2) {
        return '';
    }
    return parts.slice(-2).join('.');
}

function normalizeSubdomain(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function resolveTenantHost(bootstrap) {
    const company = bootstrap?.company || {};
    const customDomain = normalizeHost(company.custom_domain || '');
    if (customDomain) {
        return customDomain;
    }
    const subdomain = normalizeSubdomain(company.subdomain || '');
    if (!subdomain) {
        return '';
    }
    const baseDomain = getBaseDomain(window.location.hostname);
    if (!baseDomain) {
        return '';
    }
    return `${subdomain}.${baseDomain}`;
}

function resolveRoleLabel(role) {
    const normalizedRole = String(role || '').trim().toLowerCase();
    if (normalizedRole === 'super_admin') {
        return 'Super Admin';
    }
    if (normalizedRole === 'head_admin' || normalizedRole === 'company_admin') {
        return 'Head Admin';
    }
    if (normalizedRole === 'staff') {
        return 'Staff';
    }
    return 'Employee';
}

function resolveRoleDestination(role) {
    const normalizedRole = String(role || '').trim().toLowerCase();
    if (normalizedRole === 'super_admin') {
        return 'Super Admin Console';
    }
    if (normalizedRole === 'head_admin' || normalizedRole === 'company_admin') {
        return 'Head Admin Panel';
    }
    if (normalizedRole === 'staff') {
        return 'Staff Workspace';
    }
    return 'Employee Workspace';
}

async function playWelcomeTransition(context = {}) {
    if (!welcomeOverlayEl) {
        return;
    }

    welcomeTransitionActive = true;
    const branding = normalizeBranding(context.branding || currentBranding);

    if (welcomeLogoEl) {
        welcomeLogoEl.onerror = () => {
            welcomeLogoEl.onerror = null;
            welcomeLogoEl.src = DEFAULT_LOGO_PATH;
        };
        welcomeLogoEl.src = branding.logoPath || DEFAULT_LOGO_PATH;
    }
    if (welcomeRoleChipEl) {
        welcomeRoleChipEl.textContent = context.displayName || context.userName || 'User';
    }
    if (welcomeDestinationChipEl) {
        welcomeDestinationChipEl.textContent = context.roleLabel || context.destination || 'Opening panel';
    }
    if (welcomeTitleEl) {
        welcomeTitleEl.textContent = `Welcome, ${context.displayName || context.userName || 'User'}`;
    }
    if (welcomeCopyEl) {
        welcomeCopyEl.textContent = buildWelcomeCopy(context);
    }

    welcomeOverlayEl.hidden = false;
    welcomeOverlayEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-welcome-active');
    welcomeOverlayEl.classList.remove('is-zooming', 'is-exiting');
    void welcomeOverlayEl.offsetWidth;
    welcomeOverlayEl.classList.add('is-visible');

    await wait(WELCOME_TIMINGS.enter);
    welcomeOverlayEl.classList.add('is-zooming');
    await wait(WELCOME_TIMINGS.zoom);
    welcomeOverlayEl.classList.add('is-exiting');
    await wait(WELCOME_TIMINGS.exit);
}

function resetWelcomeTransitionState() {
    if (welcomeOverlayEl) {
        welcomeOverlayEl.classList.remove('is-visible', 'is-zooming', 'is-exiting');
        welcomeOverlayEl.hidden = true;
        welcomeOverlayEl.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('is-welcome-active');
}

function buildWelcomeCopy(context = {}) {
    const destination = context.destination || 'your workspace';
    const appName = context.appName || DEFAULT_BRANDING.appName;
    const companyName = String(context.companyName || '').trim();
    const displayName = String(context.displayName || context.userName || 'User').trim() || 'User';

    if (companyName) {
        return `${displayName}, loading your ${destination}. Workspace: ${companyName} on ${appName}.`;
    }

    return `${displayName}, loading your ${destination} in ${appName}.`;
}

function wait(durationMs) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, durationMs);
    });
}

async function getBootstrapWithTimeout() {
    let completed = false;
    const timeout = wait(BOOTSTRAP_TIMEOUT_MS).then(() => {
        if (completed) {
            return null;
        }
        return null;
    });
    const fetchBootstrap = appClient.getBootstrap()
        .then((payload) => {
            completed = true;
            return payload;
        })
        .catch((error) => {
            console.error('Failed to load bootstrap for welcome intro:', error);
            completed = true;
            return null;
        });
    return Promise.race([fetchBootstrap, timeout]);
}

function setMessage(message, color) {
    if (!messageDiv) {
        return;
    }
    messageDiv.innerText = message;
    messageDiv.style.color = color;
}

function getFirebaseContext() {
    if (firebaseDisabled) {
        return null;
    }
    const auth = window.firebaseAuth;
    const helpers = window.firebaseAuthHelpers;
    if (!auth || !helpers) {
        return null;
    }
    return { auth, helpers };
}

function resolveAuthErrorMessage(error) {
    const code = String(error?.code || '').trim();
    const host = (typeof window !== 'undefined' && window.location && window.location.hostname)
        ? window.location.hostname
        : 'your domain';
    if (!code.startsWith('auth/')) {
        return error?.message || 'Sign in failed.';
    }

    switch (code) {
        case 'auth/invalid-email':
            return 'Invalid email address.';
        case 'auth/user-not-found':
            return 'No account found for that email.';
        case 'auth/wrong-password':
            return 'Incorrect password.';
        case 'auth/invalid-credential':
        case 'auth/invalid-login-credentials':
            return 'Invalid login credentials.';
        case 'auth/operation-not-allowed':
            return 'Email/Password sign-in is disabled in Firebase.';
        case 'auth/too-many-requests':
            return 'Too many attempts. Please try again later.';
        case 'auth/network-request-failed':
            return 'Network error. Please check your connection.';
        case 'auth/unauthorized-domain':
            return `Domain not authorized (${host}). Add ${host} in Firebase Auth > Authorized domains.`;
        case 'auth/internal-error':
            return `Firebase error for ${host}. Enable Email/Password + Google in Firebase, add ${host} to Authorized domains, and add your email under OAuth consent screen > Test users if in Testing.`;
        default:
            return error?.message || 'Sign in failed.';
    }
}

function shouldFallbackToLegacy(error) {
    const code = String(error?.code || '').trim();
    if (!code) {
        return true;
    }
    return FIREBASE_FALLBACK_CODES.has(code);
}

function shouldDisableFirebase(error) {
    const code = String(error?.code || '').trim();
    return FIREBASE_DISABLE_CODES.has(code);
}

function isFirebasePopupCancelled(error) {
    const code = String(error?.code || '').trim();
    return FIREBASE_POPUP_CANCEL_CODES.has(code);
}

function shouldRedirectGoogleLoginToServer(error) {
    const code = String(error?.code || '').trim();
    if (!code) {
        return true;
    }
    return FIREBASE_GOOGLE_REDIRECT_CODES.has(code);
}

function getForgotPasswordUrl() {
    const companyCode = String(companyCodeInput?.value || '').trim();
    return companyCode
        ? `/renderer/forgot_password.html?companyCode=${encodeURIComponent(companyCode)}`
        : '/renderer/forgot_password.html';
}

function getSignUpUrl() {
    const companyCode = String(companyCodeInput?.value || '').trim();
    return companyCode
        ? `/renderer/customer_portal.html?companyCode=${encodeURIComponent(companyCode)}&intent=signup`
        : '/renderer/customer_portal.html?intent=signup';
}

function getRegisterCompanyIdUrl() {
    return '/renderer/customer_portal.html?intent=register_company_id';
}

function getGoogleLoginUrl() {
    const companyCode = String(companyCodeInput?.value || '').trim();
    return companyCode
        ? `/api/auth/google?companyCode=${encodeURIComponent(companyCode)}`
        : '/api/auth/google';
}

function redirectGoogleLoginToServer() {
    setMessage('Redirecting to Google...', '#ffffff');
    window.location.assign(getGoogleLoginUrl());
}

function handleGoogleLogin() {
    if (welcomeTransitionActive) {
        return;
    }

    const companyCode = String(companyCodeInput?.value || '').trim();
    const firebase = getFirebaseContext();

    if (!companyCode) {
        setMessage('Please enter company ID to continue with Google.', '#ffffff');
        companyCodeInput?.focus?.();
        return;
    }

    if (!firebase) {
        redirectGoogleLoginToServer();
        return;
    }

    loginBtn.disabled = true;
    setMessage('Opening Google...', '#ffffff');
    const provider = new firebase.helpers.GoogleAuthProvider();

    firebase.helpers.signInWithPopup(firebase.auth, provider)
        .then(async (result) => {
            const idToken = await firebase.helpers.getIdToken(result.user, true);
            const user = await appClient.loginWithFirebase({ idToken, companyCode });
            const welcomeContext = await buildWelcomeContext(user, {
                companyCode,
                loginId: result.user?.email || user?.id || ''
            });
            await playWelcomeTransition(welcomeContext);
            redirectByRole(user.role, { bootstrap: welcomeContext.bootstrap });
        })
        .catch((error) => {
            console.error('Google login failed:', error);
            if (isFirebasePopupCancelled(error)) {
                setMessage('Google sign-in canceled.', '#ffffff');
                return;
            }

            const message = String(error?.message || '');
            if (error?.code === 'INVALID_CREDENTIALS' && /no account matched/i.test(message)) {
                setMessage('Your Google account is not linked yet. Please sign in with email and password first.', '#ff7a7a');
                return;
            }

            if (shouldRedirectGoogleLoginToServer(error)) {
                if (shouldDisableFirebase(error)) {
                    firebaseDisabled = true;
                }
                redirectGoogleLoginToServer();
                return;
            }

            setMessage(resolveAuthErrorMessage(error), '#ff7a7a');
        })
        .finally(() => {
            loginBtn.disabled = false;
        });
}

function applyQueryPrefill() {
    const params = new URLSearchParams(window.location.search);
    const companyCode = String(params.get('companyCode') || '').trim();
    const authError = String(params.get('authError') || '').trim();

    if (companyCode && companyCodeInput) {
        companyCodeInput.value = companyCode;
    }

    if (authError) {
        if (/google login is not configured/i.test(authError)) {
            setMessage('Google login is not ready yet. Please add your domain in Firebase or use email and password.', '#ff7a7a');
        } else {
            setMessage(authError, '#ff7a7a');
        }
        const cleaned = window.location.pathname;
        window.history.replaceState({}, '', cleaned);
    }
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
    currentBranding = { ...branding };
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
        lastBackgroundSource = '';
        return;
    }

    if (nextSource === lastBackgroundSource) {
        return;
    }
    lastBackgroundSource = nextSource;

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
        return 'Custom company color and logo are loaded live while you type the company ID.';
    }
    if (branding.companyName) {
        return 'Company found. Default parent branding is active until White Label is enabled.';
    }
    if (companyCode) {
        return 'No custom company theme found for this ID yet. Showing the default sign-in style.';
    }
    return 'Type your company ID to preview your company theme before logging in.';
}

function buildThemePalette(primaryColor) {
    const primary = normalizeHexColor(primaryColor, DEFAULT_PRIMARY_COLOR);
    const primaryRgb = rgbTupleToCss(hexToRgb(primary));
    const bright = mixHexColors(primary, '#ffffff', 0.28);
    const accent = mixHexColors(primary, '#14b8a6', 0.32);
    const sun = mixHexColors(primary, '#f59e0b', 0.34);
    const deep = mixHexColors(primary, '#020617', 0.78);
    const dusk = mixHexColors(primary, '#0f172a', 0.58);
    const lead = mixHexColors(primary, '#0f172a', 0.34);

    return {
        primary,
        primaryRgb,
        pageGradient: [
            `radial-gradient(circle at 15% 20%, ${hexToRgba(bright, 0.3)} 0%, transparent 34%)`,
            `radial-gradient(circle at 85% 0%, ${hexToRgba(sun, 0.2)} 0%, transparent 30%)`,
            `linear-gradient(140deg, ${lead} 0%, ${dusk} 56%, ${deep} 100%)`
        ].join(', '),
        buttonGradient: `linear-gradient(135deg, ${bright} 0%, ${accent} 56%, ${sun} 100%)`
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
