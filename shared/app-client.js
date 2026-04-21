(function attachAppClient() {
    const SESSION_KEYS = ['userId', 'userName', 'role', 'companyId', 'companyCode'];
    const KNOWN_SECTIONS = new Set(['employee', 'head_admin', 'super_admin']);
    const USER_FEATURE_DEFAULTS = Object.freeze({
        expenses: true,
        order_form: true,
        inventory: true,
        composite: true,
        lbc_tracking: false
    });
    const mobileTableObservers = new WeakMap();
    const mobileTableRefreshFrames = new WeakMap();
    let mobileTableDocumentObserver = null;
    let redirectPending = false;
    const DEFAULT_PRIMARY_COLOR = '#2575fc';
    const DEFAULT_FAVICON_PATH = '/logo.png';
    const BRAND_THEME_STORAGE_KEY = 'appBrandThemeV1';
    const SUPPORT_SESSION_BANNER_ID = 'appSupportSessionBanner';
    const COMPANY_ANNOUNCEMENT_BANNER_ID = 'appCompanyAnnouncementBanner';
    const REQUEST_CACHE_STORAGE_PREFIX = 'appRequestCacheV1';
    const AUTO_NAVIGATION_GUARD_KEY = 'appAutoNavigationGuardV1';
    const CURRENT_SESSION_CACHE_KEY = 'current-session';
    const inFlightRequestCache = new Map();

    ensureResponsiveDocumentSetup();

    function ensureResponsiveDocumentSetup() {
        const metadata = getPathMetadata();
        ensureViewportMeta();
        applyBrandFavicon();
        applyAppDataAttributes(metadata);
        ensureMobileStylesheet(metadata);
        applyCachedBrandTheme(metadata);
        ensureMobileTableCardMode();
    }

    function getPathMetadata() {
        const normalizedPath = String(window.location.pathname || '').replace(/\\/g, '/');
        const segments = normalizedPath.split('/').filter(Boolean);
        const fileName = segments[segments.length - 1] || 'index.html';
        const parentSegment = segments[segments.length - 2] || '';

        return {
            page: fileName.replace(/\.html$/i, '') || 'index',
            section: KNOWN_SECTIONS.has(parentSegment) ? parentSegment : 'root'
        };
    }

    function ensureViewportMeta() {
        if (document.querySelector('meta[name="viewport"]')) {
            return;
        }

        const viewportMeta = document.createElement('meta');
        viewportMeta.name = 'viewport';
        viewportMeta.content = 'width=device-width, initial-scale=1.0';
        document.head?.appendChild(viewportMeta);
    }

    function normalizeAssetPath(value, fallback = '') {
        const text = String(value || '').trim();
        return text || fallback;
    }

    function ensureManagedHeadLink(rel, managedKey) {
        let link = document.querySelector(`link[data-app-favicon="${managedKey}"]`) || document.querySelector(`link[rel="${rel}"]`);
        if (link) {
            link.setAttribute('rel', rel);
        } else {
            link = document.createElement('link');
            link.setAttribute('rel', rel);
            document.head?.appendChild(link);
        }
        link.dataset.appFavicon = managedKey;
        return link;
    }

    function resolveBrandFaviconPath(source = {}) {
        return normalizeAssetPath(
            source.logoPath
            || source.logo_path
            || source.branding?.logoPath
            || source.branding?.logo_path
            || source.company?.logo_path
            || source.faviconPath
            || source.favicon_path
            || source.branding?.faviconPath
            || source.branding?.favicon_path
            || source.company?.favicon_path,
            DEFAULT_FAVICON_PATH
        );
    }

    function applyBrandFavicon(source = {}) {
        const faviconPath = resolveBrandFaviconPath(source);
        const primaryIcon = ensureManagedHeadLink('icon', 'primary');
        const shortcutIcon = ensureManagedHeadLink('shortcut icon', 'shortcut');
        const appleTouchIcon = ensureManagedHeadLink('apple-touch-icon', 'apple-touch');

        primaryIcon.href = faviconPath;
        primaryIcon.type = 'image/png';

        shortcutIcon.href = faviconPath;
        shortcutIcon.type = 'image/png';

        appleTouchIcon.href = faviconPath;

        return faviconPath;
    }

    function isCachedBrandThemeDisabled() {
        return document.querySelector('meta[name="gms-disable-cached-brand-theme"][content="true"]') !== null;
    }

    function applyAppDataAttributes(metadata) {
        document.documentElement.dataset.appPage = metadata.page;
        document.documentElement.dataset.appSection = metadata.section;
        document.documentElement.dataset.appMobile = 'true';

        if (!document.body) {
            return;
        }

        document.body.dataset.appPage = metadata.page;
        document.body.dataset.appSection = metadata.section;
        document.body.dataset.appMobile = 'true';
    }

    function ensureMobileStylesheet(metadata) {
        if (document.querySelector('link[data-app-mobile-stylesheet="true"]')) {
            return;
        }

        const stylesheet = document.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.dataset.appMobileStylesheet = 'true';
        stylesheet.href = resolveMobileStylesheetHref(metadata.section);
        document.head?.appendChild(stylesheet);
    }

    function resolveMobileStylesheetHref(section) {
        const scriptSource = getAppClientScriptSource();

        if (scriptSource) {
            return new URL('mobile.css', scriptSource).href;
        }

        return section === 'root' ? 'shared/mobile.css' : '../shared/mobile.css';
    }

    function getAppClientScriptSource() {
        const activeScript = document.currentScript;
        if (activeScript?.src) {
            return activeScript.src;
        }

        const matchingScript = Array.from(document.scripts).find((script) =>
            /app-client\.js(?:\?|$)/i.test(script.src || '')
        );

        return matchingScript?.src || '';
    }

    function shouldApplyCachedBrandTheme(section) {
        return section === 'employee' || section === 'head_admin';
    }

    function applyCachedBrandTheme(metadata) {
        if (!shouldApplyCachedBrandTheme(metadata?.section)) {
            return null;
        }

        if (isCachedBrandThemeDisabled()) {
            return null;
        }

        const cachedTheme = readCachedBrandTheme();
        if (!cachedTheme) {
            return null;
        }

        return applyBrandTheme({
            primaryColor: cachedTheme.primaryColor,
            companyCode: cachedTheme.companyCode,
            shellVariant: cachedTheme.shellVariant
        }, {
            cache: false
        });
    }

    function ensureThemeColorMeta() {
        let meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            return meta;
        }

        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head?.appendChild(meta);
        return meta;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, Number(value || 0)));
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

    function normalizeIdentityToken(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^\w-]+/g, '_');
    }

    function applyBrandIdentity(identity = {}) {
        const companyCode = normalizeIdentityToken(identity.companyCode || identity.company_code);
        const shellVariant = normalizeIdentityToken(identity.shellVariant || identity.shell_variant);
        const html = document.documentElement;
        const body = document.body;

        if (!html) {
            return { companyCode, shellVariant };
        }

        if (companyCode) {
            html.dataset.companyCode = companyCode;
        } else {
            delete html.dataset.companyCode;
        }

        if (shellVariant) {
            html.dataset.shellVariant = shellVariant;
        } else {
            delete html.dataset.shellVariant;
        }

        if (body) {
            if (companyCode) {
                body.dataset.companyCode = companyCode;
            } else {
                delete body.dataset.companyCode;
            }

            if (shellVariant) {
                body.dataset.shellVariant = shellVariant;
            } else {
                delete body.dataset.shellVariant;
            }
        }

        return { companyCode, shellVariant };
    }

    function hexToRgb(hex) {
        const normalized = normalizeHexColor(hex, DEFAULT_PRIMARY_COLOR).slice(1);
        return [
            Number.parseInt(normalized.slice(0, 2), 16),
            Number.parseInt(normalized.slice(2, 4), 16),
            Number.parseInt(normalized.slice(4, 6), 16)
        ];
    }

    function rgbTupleToCss(tuple) {
        return tuple.join(', ');
    }

    function hexToRgba(hex, alpha) {
        const [red, green, blue] = hexToRgb(hex);
        return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`;
    }

    function mixHexColors(baseHex, mixHex, weight = 0.5) {
        const baseRgb = hexToRgb(baseHex);
        const mixRgb = hexToRgb(mixHex);
        const normalizedWeight = clamp(weight, 0, 1);
        const finalRgb = baseRgb.map((value, index) => (
            Math.round(value + ((mixRgb[index] - value) * normalizedWeight))
        ));
        return `#${finalRgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    }

    function rgbToHsl(tuple) {
        const [rawRed, rawGreen, rawBlue] = tuple.map((value) => clamp(value, 0, 255) / 255);
        const max = Math.max(rawRed, rawGreen, rawBlue);
        const min = Math.min(rawRed, rawGreen, rawBlue);
        const lightness = (max + min) / 2;
        const delta = max - min;

        if (delta === 0) {
            return {
                hue: 0,
                saturation: 0,
                lightness
            };
        }

        const saturation = lightness > 0.5
            ? delta / (2 - max - min)
            : delta / (max + min);

        let hue;
        if (max === rawRed) {
            hue = ((rawGreen - rawBlue) / delta) + (rawGreen < rawBlue ? 6 : 0);
        } else if (max === rawGreen) {
            hue = ((rawBlue - rawRed) / delta) + 2;
        } else {
            hue = ((rawRed - rawGreen) / delta) + 4;
        }

        return {
            hue: hue * 60,
            saturation,
            lightness
        };
    }

    function getColorProfile(hex) {
        const rgb = hexToRgb(hex);
        const max = Math.max(...rgb);
        const min = Math.min(...rgb);
        const variance = (max - min) / 255;
        const { hue, saturation, lightness } = rgbToHsl(rgb);

        return {
            hue,
            saturation,
            lightness,
            variance,
            isNeutral: saturation <= 0.18 || variance <= 0.14
        };
    }

    function toRgbUnit(channel) {
        const normalized = Number(channel || 0) / 255;
        if (normalized <= 0.03928) {
            return normalized / 12.92;
        }
        return ((normalized + 0.055) / 1.055) ** 2.4;
    }

    function getRelativeLuminance(hex) {
        const [red, green, blue] = hexToRgb(hex);
        return (0.2126 * toRgbUnit(red)) + (0.7152 * toRgbUnit(green)) + (0.0722 * toRgbUnit(blue));
    }

    function getContrastRatio(firstHex, secondHex) {
        const firstLuminance = getRelativeLuminance(firstHex);
        const secondLuminance = getRelativeLuminance(secondHex);
        const lighter = Math.max(firstLuminance, secondLuminance);
        const darker = Math.min(firstLuminance, secondLuminance);
        return (lighter + 0.05) / (darker + 0.05);
    }

    function getReadableTextColor(backgroundHex, light = '#ffffff', dark = '#0f172a') {
        return getContrastRatio(backgroundHex, dark) >= getContrastRatio(backgroundHex, light)
            ? dark
            : light;
    }

    function buildBrandTheme(primaryColor = DEFAULT_PRIMARY_COLOR) {
        const primary = normalizeHexColor(primaryColor, DEFAULT_PRIMARY_COLOR);
        const profile = getColorProfile(primary);
        const supportsNeutralAccent = profile.isNeutral;
        const interaction = supportsNeutralAccent
            ? mixHexColors(primary, '#14b8a6', profile.lightness < 0.46 ? 0.56 : 0.64)
            : primary;
        const interactionRgb = rgbTupleToCss(hexToRgb(interaction));
        const interactionStrong = mixHexColors(interaction, '#0f172a', supportsNeutralAccent ? 0.26 : 0.18);
        const interactionGlow = mixHexColors(interaction, '#67e8f9', supportsNeutralAccent ? 0.24 : 0.12);
        const softBase = supportsNeutralAccent ? interaction : primary;
        const primaryRgb = rgbTupleToCss(hexToRgb(primary));
        const primaryStrong = mixHexColors(primary, '#0f172a', supportsNeutralAccent ? 0.22 : 0.18);
        const primaryDeep = mixHexColors(primary, '#0f172a', supportsNeutralAccent ? 0.4 : 0.34);
        const buttonStrong = mixHexColors(supportsNeutralAccent ? interaction : primary, '#0f172a', supportsNeutralAccent ? 0.32 : 0.26);
        const primarySoft = mixHexColors(softBase, supportsNeutralAccent ? '#ecfeff' : '#dbeafe', supportsNeutralAccent ? 0.78 : 0.72);
        const primarySoftest = mixHexColors(softBase, supportsNeutralAccent ? '#f8fafc' : '#f8fbff', supportsNeutralAccent ? 0.92 : 0.9);
        const text = mixHexColors(primary, '#475569', supportsNeutralAccent ? 0.82 : 0.88);
        const textStrong = mixHexColors(primary, '#10233f', supportsNeutralAccent ? 0.88 : 0.92);
        const muted = mixHexColors(primary, '#64748b', supportsNeutralAccent ? 0.76 : 0.82);
        const line = hexToRgba(mixHexColors(supportsNeutralAccent ? interaction : primary, '#cbd5e1', supportsNeutralAccent ? 0.74 : 0.82), supportsNeutralAccent ? 0.62 : 0.56);
        const lineStrong = hexToRgba(mixHexColors(supportsNeutralAccent ? interaction : primary, '#94a3b8', supportsNeutralAccent ? 0.48 : 0.54), supportsNeutralAccent ? 0.56 : 0.48);
        const bg = mixHexColors(softBase, '#f8fbff', supportsNeutralAccent ? 0.9 : 0.92);
        const bgAlt = mixHexColors(softBase, supportsNeutralAccent ? '#eef7f8' : '#eef5ff', supportsNeutralAccent ? 0.8 : 0.84);
        const panelStrong = hexToRgba(mixHexColors(softBase, '#ffffff', supportsNeutralAccent ? 0.92 : 0.9), 0.98);
        const panel = hexToRgba(mixHexColors(softBase, '#ffffff', supportsNeutralAccent ? 0.86 : 0.84), supportsNeutralAccent ? 0.9 : 0.86);
        const panelAlt = hexToRgba(mixHexColors(softBase, '#ffffff', supportsNeutralAccent ? 0.8 : 0.78), supportsNeutralAccent ? 0.82 : 0.74);
        const sidebarA = mixHexColors(primary, '#173450', supportsNeutralAccent ? 0.5 : 0.58);
        const sidebarB = mixHexColors(primary, '#0f2339', supportsNeutralAccent ? 0.68 : 0.72);
        const onPrimary = getReadableTextColor(supportsNeutralAccent ? interaction : primary);
        const success = mixHexColors(supportsNeutralAccent ? interaction : primary, '#0f766e', supportsNeutralAccent ? 0.46 : 0.58);
        const danger = '#dc2626';
        const warning = '#d97706';
        const bgStart = mixHexColors(softBase, '#f8fbff', supportsNeutralAccent ? 0.88 : 0.9);
        const bgEnd = mixHexColors(softBase, supportsNeutralAccent ? '#eef7f8' : '#edf5ff', supportsNeutralAccent ? 0.78 : 0.84);

        return {
            primary,
            primaryRgb,
            interaction,
            interactionRgb,
            interactionStrong,
            primaryStrong,
            primaryDeep,
            primarySoft,
            primarySoftest,
            text,
            textStrong,
            muted,
            line,
            lineStrong,
            bg,
            bgAlt,
            panel,
            panelAlt,
            panelStrong,
            sidebarA,
            sidebarB,
            onPrimary,
            success,
            danger,
            warning,
            bgStart,
            bgEnd,
            pageGradient: [
                `radial-gradient(circle at 12% 18%, ${hexToRgba(supportsNeutralAccent ? interaction : primary, supportsNeutralAccent ? 0.2 : 0.16)} 0%, transparent 34%)`,
                `radial-gradient(circle at 88% 10%, ${hexToRgba(supportsNeutralAccent ? interactionGlow : primaryStrong, supportsNeutralAccent ? 0.14 : 0.1)} 0%, transparent 30%)`,
                `linear-gradient(145deg, ${bgStart} 0%, ${bgEnd} 58%, ${mixHexColors(bgEnd, '#ffffff', 0.22)} 100%)`
            ].join(', '),
            darkGradient: `linear-gradient(145deg, ${sidebarA} 0%, ${sidebarB} 100%)`,
            buttonGradient: `linear-gradient(135deg, ${mixHexColors(supportsNeutralAccent ? interactionGlow : primary, '#ffffff', supportsNeutralAccent ? 0.18 : 0.22)} 0%, ${supportsNeutralAccent ? interaction : primary} 60%, ${buttonStrong} 100%)`,
            ring: hexToRgba(supportsNeutralAccent ? interaction : primary, supportsNeutralAccent ? 0.22 : 0.18),
            glow: hexToRgba(supportsNeutralAccent ? interactionGlow : primary, supportsNeutralAccent ? 0.28 : 0.22),
            shadowSoft: '0 18px 40px rgba(15, 23, 42, 0.12)',
            shadow: '0 24px 58px rgba(15, 23, 42, 0.16)',
            successBg: hexToRgba(success, 0.14),
            dangerBg: hexToRgba(danger, 0.12)
        };
    }

    function writeBrandThemeVariables(theme) {
        if (!theme || !document.documentElement) {
            return null;
        }

        const rootStyle = document.documentElement.style;
        rootStyle.setProperty('--tenant-primary', theme.primary);
        rootStyle.setProperty('--tenant-primary-rgb', theme.primaryRgb);
        rootStyle.setProperty('--tenant-interaction', theme.interaction);
        rootStyle.setProperty('--tenant-interaction-rgb', theme.interactionRgb);
        rootStyle.setProperty('--tenant-interaction-strong', theme.interactionStrong);
        rootStyle.setProperty('--tenant-primary-strong', theme.primaryStrong);
        rootStyle.setProperty('--tenant-primary-deep', theme.primaryDeep);
        rootStyle.setProperty('--tenant-primary-soft', theme.primarySoft);
        rootStyle.setProperty('--tenant-primary-softest', theme.primarySoftest);
        rootStyle.setProperty('--tenant-on-primary', theme.onPrimary);
        rootStyle.setProperty('--tenant-text', theme.text);
        rootStyle.setProperty('--tenant-text-strong', theme.textStrong);
        rootStyle.setProperty('--tenant-muted', theme.muted);
        rootStyle.setProperty('--tenant-line', theme.line);
        rootStyle.setProperty('--tenant-line-strong', theme.lineStrong);
        rootStyle.setProperty('--tenant-bg', theme.bg);
        rootStyle.setProperty('--tenant-bg-alt', theme.bgAlt);
        rootStyle.setProperty('--tenant-panel', theme.panel);
        rootStyle.setProperty('--tenant-panel-alt', theme.panelAlt);
        rootStyle.setProperty('--tenant-panel-strong', theme.panelStrong);
        rootStyle.setProperty('--tenant-sidebar-a', theme.sidebarA);
        rootStyle.setProperty('--tenant-sidebar-b', theme.sidebarB);
        rootStyle.setProperty('--tenant-shadow', theme.shadow);
        rootStyle.setProperty('--tenant-shadow-soft', theme.shadowSoft);
        rootStyle.setProperty('--tenant-glow', theme.glow);
        rootStyle.setProperty('--tenant-ring', theme.ring);
        rootStyle.setProperty('--tenant-success', theme.success);
        rootStyle.setProperty('--tenant-danger', theme.danger);
        rootStyle.setProperty('--tenant-warning', theme.warning);
        rootStyle.setProperty('--tenant-page-gradient', theme.pageGradient);
        rootStyle.setProperty('--tenant-dark-gradient', theme.darkGradient);
        rootStyle.setProperty('--tenant-button-gradient', theme.buttonGradient);

        // Compatibility aliases for existing pages that already use generic color tokens.
        rootStyle.setProperty('--primary', theme.primary);
        rootStyle.setProperty('--primary-soft', theme.primarySoftest);
        rootStyle.setProperty('--accent', theme.interaction);
        rootStyle.setProperty('--accent-strong', theme.interactionStrong);
        rootStyle.setProperty('--text', theme.text);
        rootStyle.setProperty('--muted', theme.muted);
        rootStyle.setProperty('--line', theme.line);
        rootStyle.setProperty('--panel', theme.panel);
        rootStyle.setProperty('--bg', theme.bg);
        rootStyle.setProperty('--shadow', theme.shadowSoft);
        rootStyle.setProperty('--bg-start', theme.bgStart);
        rootStyle.setProperty('--bg-end', theme.bgEnd);
        rootStyle.setProperty('--card-bg', theme.panelStrong);
        rootStyle.setProperty('--card-border', theme.lineStrong);
        rootStyle.setProperty('--input-bg', hexToRgba(theme.interaction, 0.06));
        rootStyle.setProperty('--input-muted', hexToRgba(theme.interaction, 0.04));
        rootStyle.setProperty('--success', theme.success);
        rootStyle.setProperty('--danger', theme.danger);
        rootStyle.setProperty('--success-bg', theme.successBg);
        rootStyle.setProperty('--danger-bg', theme.dangerBg);
        rootStyle.setProperty('--page-gradient', theme.pageGradient);
        rootStyle.setProperty('--button-gradient', theme.buttonGradient);

        const themeColorMeta = ensureThemeColorMeta();
        themeColorMeta?.setAttribute('content', theme.interactionStrong || theme.primaryStrong);
        return theme;
    }

    function cacheBrandTheme(identity = {}) {
        try {
            sessionStorage.setItem(BRAND_THEME_STORAGE_KEY, JSON.stringify({
                primaryColor: normalizeHexColor(identity.primaryColor, DEFAULT_PRIMARY_COLOR),
                companyCode: normalizeIdentityToken(identity.companyCode || identity.company_code),
                shellVariant: normalizeIdentityToken(identity.shellVariant || identity.shell_variant)
            }));
        } catch (_error) {
            // Ignore storage errors so theming does not block navigation.
        }
    }

    function readCachedBrandTheme() {
        try {
            const raw = sessionStorage.getItem(BRAND_THEME_STORAGE_KEY);
            if (!raw) {
                return null;
            }

            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                return null;
            }

            return {
                primaryColor: normalizeHexColor(parsed.primaryColor, DEFAULT_PRIMARY_COLOR),
                companyCode: normalizeIdentityToken(parsed.companyCode || parsed.company_code),
                shellVariant: normalizeIdentityToken(parsed.shellVariant || parsed.shell_variant)
            };
        } catch (_error) {
            return null;
        }
    }

    function applyBrandTheme(source = {}, { cache = true } = {}) {
        const primaryColor = normalizeHexColor(
            source.primaryColor
            || source.primary_color
            || source.branding?.primaryColor
            || source.company?.primary_color
            || DEFAULT_PRIMARY_COLOR,
            DEFAULT_PRIMARY_COLOR
        );
        const companyCode = normalizeIdentityToken(
            source.companyCode
            || source.company_code
            || source.company?.company_code
        );
        const shellVariant = normalizeIdentityToken(
            source.shellVariant
            || source.shell_variant
            || source.workspaceConfig?.shell?.variant
            || source.shell?.variant
        );
        const theme = buildBrandTheme(primaryColor);
        writeBrandThemeVariables(theme);
        applyBrandFavicon(source);
        applyBrandIdentity({ companyCode, shellVariant });
        if (cache) {
            cacheBrandTheme({
                primaryColor,
                companyCode,
                shellVariant
            });
        }
        return theme;
    }

    function applyBootstrapBrandTheme(bootstrap = {}, options = {}) {
        return applyBrandTheme({
            primaryColor: bootstrap?.branding?.primaryColor || bootstrap?.company?.primary_color || options.primaryColor,
            companyCode: bootstrap?.company?.company_code || options.companyCode,
            shellVariant: bootstrap?.workspaceConfig?.shell?.variant || options.shellVariant,
            logoPath: bootstrap?.branding?.logoPath || bootstrap?.company?.logo_path || options.logoPath,
            faviconPath: bootstrap?.branding?.faviconPath || bootstrap?.company?.favicon_path || options.faviconPath
        }, options);
    }

    function ensureMobileTableCardMode() {
        const bootstrap = () => {
            enhanceTablesForMobile(document);
            observeDocumentForMobileTables();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
            return;
        }

        bootstrap();
    }

    function observeDocumentForMobileTables() {
        if (mobileTableDocumentObserver || !document.body) {
            return;
        }

        mobileTableDocumentObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (!(node instanceof Element)) {
                        return;
                    }

                    if (node.matches('table')) {
                        prepareTableForMobileCards(node);
                    }

                    node.querySelectorAll('table').forEach((table) => {
                        prepareTableForMobileCards(table);
                    });
                });
            });
        });

        mobileTableDocumentObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function enhanceTablesForMobile(rootNode) {
        if (!rootNode || !rootNode.querySelectorAll) {
            return;
        }

        rootNode.querySelectorAll('table').forEach((table) => {
            prepareTableForMobileCards(table);
        });
    }

    function prepareTableForMobileCards(table) {
        if (!(table instanceof HTMLTableElement)) {
            return;
        }

        observeTableForMobileRows(table);

        if (!isTableEligibleForMobileCards(table)) {
            table.removeAttribute('data-mobile-card-ready');
            return;
        }

        applyMobileLabelsToTable(table);
    }

    function observeTableForMobileRows(table) {
        if (mobileTableObservers.has(table)) {
            return;
        }

        const observer = new MutationObserver(() => {
            scheduleMobileTableRefresh(table);
        });

        observer.observe(table, {
            childList: true,
            subtree: true
        });
        mobileTableObservers.set(table, observer);
    }

    function scheduleMobileTableRefresh(table) {
        if (mobileTableRefreshFrames.has(table)) {
            return;
        }

        const frameHandle = window.requestAnimationFrame(() => {
            mobileTableRefreshFrames.delete(table);
            if (!table.isConnected) {
                return;
            }

            prepareTableForMobileCards(table);
        });

        mobileTableRefreshFrames.set(table, frameHandle);
    }

    function isTableEligibleForMobileCards(table) {
        if (table.dataset.mobileCard === 'off' || table.closest('[data-mobile-card="off"]')) {
            return false;
        }

        return Boolean(extractTableHeaderLabels(table).length);
    }

    function applyMobileLabelsToTable(table) {
        const headerLabels = extractTableHeaderLabels(table);
        if (!headerLabels.length) {
            table.removeAttribute('data-mobile-card-ready');
            return;
        }

        const bodyRows = getTableBodyRows(table);
        if (!bodyRows.length) {
            table.removeAttribute('data-mobile-card-ready');
            return;
        }

        table.dataset.mobileCardReady = 'true';

        bodyRows.forEach((row) => {
            applyMobileLabelsToRow(row, headerLabels);
        });
    }

    function extractTableHeaderLabels(table) {
        let headerRow = null;

        if (table.tHead && table.tHead.rows.length) {
            headerRow = table.tHead.rows[table.tHead.rows.length - 1];
        } else {
            headerRow = Array.from(table.rows).find((row) =>
                Array.from(row.cells).some((cell) => cell.tagName === 'TH')
            ) || null;
        }

        if (!headerRow) {
            return [];
        }

        const labels = [];
        Array.from(headerRow.cells).forEach((cell) => {
            if (cell.tagName !== 'TH') {
                return;
            }

            const normalizedLabel = normalizeTableHeaderLabel(cell);
            const columnSpan = getCellSpan(cell);

            for (let index = 0; index < columnSpan; index += 1) {
                labels.push(normalizedLabel || `Column ${labels.length + 1}`);
            }
        });

        return labels;
    }

    function normalizeTableHeaderLabel(headerCell) {
        const explicitLabel = headerCell.getAttribute('data-mobile-label');
        if (explicitLabel) {
            return String(explicitLabel).replace(/\s+/g, ' ').trim();
        }

        return String(headerCell.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function getTableBodyRows(table) {
        if (table.tBodies && table.tBodies.length) {
            return Array.from(table.tBodies).flatMap((tbody) => Array.from(tbody.rows));
        }

        return Array.from(table.rows).filter((row) => row.closest('thead') === null);
    }

    function applyMobileLabelsToRow(row, headerLabels) {
        let columnIndex = 0;

        Array.from(row.cells).forEach((cell) => {
            const columnSpan = getCellSpan(cell);

            if (cell.tagName !== 'TD') {
                columnIndex += columnSpan;
                return;
            }

            const labelSource = String(cell.dataset.appMobileLabel || '').trim().toLowerCase();
            const existingLabel = String(cell.dataset.label || '').trim();
            const shouldAutoLabel = !existingLabel || labelSource === 'auto';

            if (labelSource !== 'custom' && shouldAutoLabel) {
                cell.dataset.label = resolveTableCellLabel(headerLabels, columnIndex, columnSpan);
                cell.dataset.appMobileLabel = 'auto';
            }

            columnIndex += columnSpan;
        });
    }

    function resolveTableCellLabel(headerLabels, columnIndex, columnSpan) {
        const spanLabels = headerLabels
            .slice(columnIndex, columnIndex + columnSpan)
            .filter(Boolean);

        if (!spanLabels.length) {
            return `Column ${columnIndex + 1}`;
        }

        if (spanLabels.length === 1) {
            return spanLabels[0];
        }

        return `${spanLabels[0]} to ${spanLabels[spanLabels.length - 1]}`;
    }

    function getCellSpan(cell) {
        const rawSpan = Number.parseInt(cell.getAttribute('colspan') || '1', 10);
        return Number.isFinite(rawSpan) && rawSpan > 0 ? rawSpan : 1;
    }

    async function callElectronOrHttp(electronCall, httpCall) {
        if (typeof electronCall === 'function') {
            try {
                const result = await electronCall();
                if (result !== undefined) {
                    return result;
                }
            } catch (error) {
                const message = String(error && error.message ? error.message : error || '');
                if (!message.includes('No handler registered')) {
                    throw error;
                }
            }
        }

        return httpCall();
    }

    async function request(path, options = {}) {
        const requestOptions = {
            method: options.method || 'GET',
            headers: { ...(options.headers || {}) },
            credentials: 'same-origin'
        };

        if (options.body !== undefined) {
            requestOptions.headers['Content-Type'] = 'application/json';
            requestOptions.body = typeof options.body === 'string'
                ? options.body
                : JSON.stringify(options.body);
        }

        const response = await fetch(path, requestOptions);
        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
            ? await response.json()
            : { success: response.ok, data: await response.text() };

        if (!response.ok || payload.success === false) {
            const errorMessage = payload.error || `Request failed (${response.status})`;

            if (response.status === 401 && !options.skipAuthRedirect) {
                handleUnauthorized();
            }
            const error = new Error(errorMessage);
            error.code = payload.code || `HTTP_${response.status}`;
            throw error;
        }

        return Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
    }

    function buildScopedRequestCacheKey(cacheKey = '') {
        const session = getSession();
        return [
            REQUEST_CACHE_STORAGE_PREFIX,
            session.companyId || 'anon',
            session.role || 'anon',
            String(cacheKey || '').trim()
        ].join(':');
    }

    function readRequestCache(cacheKey, maxAgeMs) {
        if (!maxAgeMs || maxAgeMs <= 0) {
            return null;
        }

        try {
            const rawValue = sessionStorage.getItem(buildScopedRequestCacheKey(cacheKey));
            if (!rawValue) {
                return null;
            }

            const parsedValue = JSON.parse(rawValue);
            const storedAt = Number(parsedValue?.storedAt || 0);
            if (!storedAt || (Date.now() - storedAt) > maxAgeMs) {
                sessionStorage.removeItem(buildScopedRequestCacheKey(cacheKey));
                return null;
            }

            return parsedValue.value ?? null;
        } catch (_error) {
            return null;
        }
    }

    function writeRequestCache(cacheKey, value) {
        try {
            sessionStorage.setItem(buildScopedRequestCacheKey(cacheKey), JSON.stringify({
                storedAt: Date.now(),
                value
            }));
        } catch (_error) {
            // Ignore storage quota and serialization issues.
        }
    }

    async function requestWithSessionCache(cacheKey, maxAgeMs, factory, { bypassCache = false } = {}) {
        const scopedKey = buildScopedRequestCacheKey(cacheKey);
        if (!bypassCache) {
            const cachedValue = readRequestCache(cacheKey, maxAgeMs);
            if (cachedValue !== null) {
                return cachedValue;
            }
        }

        if (inFlightRequestCache.has(scopedKey)) {
            return inFlightRequestCache.get(scopedKey);
        }

        const pendingRequest = Promise.resolve()
            .then(() => factory())
            .then((result) => {
                writeRequestCache(cacheKey, result);
                return result;
            })
            .finally(() => {
                inFlightRequestCache.delete(scopedKey);
            });

        inFlightRequestCache.set(scopedKey, pendingRequest);
        return pendingRequest;
    }

    function invalidateRequestCacheByPrefix(cacheKeyPrefix = '') {
        const scopedPrefix = buildScopedRequestCacheKey(cacheKeyPrefix);
        const exactOrNestedMatch = (key = '') => key === scopedPrefix || key.startsWith(`${scopedPrefix}:`);

        try {
            const keysToRemove = [];
            for (let index = 0; index < sessionStorage.length; index += 1) {
                const key = sessionStorage.key(index);
                if (key && exactOrNestedMatch(key)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach((key) => sessionStorage.removeItem(key));
        } catch (_error) {
            // Ignore storage enumeration issues.
        }

        Array.from(inFlightRequestCache.keys()).forEach((key) => {
            if (exactOrNestedMatch(key)) {
                inFlightRequestCache.delete(key);
            }
        });
    }

    function shouldUseDefaultQueryCache(filters = {}) {
        return Object.values(filters).every((value) => {
            if (typeof value === 'number') {
                return Number(value || 0) === 0;
            }
            return String(value || '').trim() === '';
        });
    }

    function invalidateReferenceCaches(cacheKeyPrefixes = []) {
        cacheKeyPrefixes.forEach((cacheKeyPrefix) => invalidateRequestCacheByPrefix(cacheKeyPrefix));
    }

    function setSessionUser(user) {
        if (!user || !user.id) {
            clearStoredSession();
            return;
        }

        localStorage.setItem('userId', user.id);
        localStorage.setItem('userName', user.name || '');
        localStorage.setItem('role', user.role || 'employee');
        localStorage.setItem('companyId', user.company_id || '');
        localStorage.setItem('companyCode', user.company_code || '');
    }

    function clearStoredSession() {
        clearSupportSessionBanner();
        clearEmployeeAnnouncementBanner();
        SESSION_KEYS.forEach((key) => {
            localStorage.removeItem(key);
        });
        sessionStorage.clear();
        inFlightRequestCache.clear();
    }

    async function clearSession() {
        clearStoredSession();

        try {
            await request('/api/logout', {
                method: 'POST',
                skipAuthRedirect: true
            });
        } catch (_error) {
            // Ignore logout transport errors after the local session is cleared.
        }
    }

    function getSession() {
        return {
            userId: localStorage.getItem('userId'),
            userName: localStorage.getItem('userName') || '',
            role: localStorage.getItem('role') || '',
            companyId: localStorage.getItem('companyId') || '',
            companyCode: localStorage.getItem('companyCode') || ''
        };
    }

    function normalizeSupportSessionPayload(value = null) {
        if (!value || typeof value !== 'object') {
            return null;
        }

        const companyId = String(value.companyId || value.company_id || '').trim();
        const operatorUserId = String(value.operatorUserId || value.operator_user_id || '').trim();
        if (!companyId || !operatorUserId) {
            return null;
        }

        return {
            active: value.active !== false,
            companyId,
            companyCode: String(value.companyCode || value.company_code || '').trim(),
            companyName: String(value.companyName || value.company_name || '').trim(),
            operatorUserId,
            operatorUserKey: String(value.operatorUserKey || value.operator_user_key || '').trim(),
            operatorName: String(value.operatorName || value.operator_name || '').trim(),
            operatorRole: String(value.operatorRole || value.operator_role || '').trim(),
            targetUserId: String(value.targetUserId || value.target_user_id || '').trim(),
            targetRole: String(value.targetRole || value.target_role || '').trim(),
            startedAt: String(value.startedAt || value.started_at || '').trim()
        };
    }

    function formatSupportSessionTimestamp(value = '') {
        const text = String(value || '').trim();
        if (!text) {
            return '';
        }

        const date = new Date(text);
        if (Number.isNaN(date.getTime())) {
            return text;
        }

        return date.toLocaleString();
    }

    function clearSupportSessionBanner() {
        const existing = document.getElementById(SUPPORT_SESSION_BANNER_ID);
        if (existing) {
            existing.remove();
        }
    }

    async function endActiveSupportSession(button = null) {
        const previousLabel = button?.textContent || 'End Support Session';
        if (button) {
            button.disabled = true;
            button.textContent = 'Ending...';
        }

        try {
            const payload = await request('/api/support-session/end', {
                method: 'POST',
                skipAuthRedirect: true
            });

            clearSupportSessionBanner();
            if (payload?.user?.id) {
                setSessionUser(payload.user);
            } else {
                clearStoredSession();
            }

            navigateTo(payload?.redirectPath || '/super_admin/dashboard.html');
            return payload;
        } catch (error) {
            window.alert(error.message || 'Failed to end support session.');
            throw error;
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = previousLabel;
            }
        }
    }

    function syncSupportSessionBanner(value = null) {
        const supportSession = normalizeSupportSessionPayload(value);
        if (!supportSession || !supportSession.active) {
            clearSupportSessionBanner();
            return null;
        }

        const mountBanner = () => {
            if (!(document.body instanceof HTMLElement)) {
                return null;
            }

            let banner = document.getElementById(SUPPORT_SESSION_BANNER_ID);
            if (!(banner instanceof HTMLElement)) {
                banner = document.createElement('section');
                banner.id = SUPPORT_SESSION_BANNER_ID;
                banner.dataset.appSupportSession = 'true';
                Object.assign(banner.style, {
                    margin: '12px',
                    padding: '14px 16px',
                    borderRadius: '18px',
                    border: '1px solid rgba(14, 116, 144, 0.18)',
                    background: 'linear-gradient(135deg, rgba(224, 242, 254, 0.96), rgba(240, 249, 255, 0.98))',
                    boxShadow: '0 18px 34px rgba(8, 47, 73, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '14px',
                    color: '#0f172a'
                });

                const copy = document.createElement('div');
                copy.style.display = 'grid';
                copy.style.gap = '4px';
                copy.style.minWidth = '0';

                const title = document.createElement('strong');
                title.dataset.role = 'support-title';
                title.style.fontSize = '14px';

                const meta = document.createElement('div');
                meta.dataset.role = 'support-meta';
                meta.style.fontSize = '12px';
                meta.style.lineHeight = '1.5';
                meta.style.color = '#0f4c5c';

                const action = document.createElement('button');
                action.type = 'button';
                action.textContent = 'End Support Session';
                action.dataset.role = 'support-end';
                Object.assign(action.style, {
                    border: '0',
                    borderRadius: '999px',
                    padding: '10px 14px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    background: 'linear-gradient(135deg, #0f766e, #155e75)',
                    color: '#ffffff',
                    whiteSpace: 'nowrap'
                });
                action.addEventListener('click', () => {
                    endActiveSupportSession(action);
                });

                copy.appendChild(title);
                copy.appendChild(meta);
                banner.appendChild(copy);
                banner.appendChild(action);
                document.body.prepend(banner);
            }

            const title = banner.querySelector('[data-role="support-title"]');
            const meta = banner.querySelector('[data-role="support-meta"]');
            if (title instanceof HTMLElement) {
                title.textContent = 'Support Session Active';
            }
            if (meta instanceof HTMLElement) {
                const details = [
                    `Super Admin: ${supportSession.operatorName || supportSession.operatorUserId}`,
                    `Company: ${supportSession.companyName || supportSession.companyCode || supportSession.companyId}`,
                    supportSession.targetUserId ? `Logged in as: ${supportSession.targetUserId}` : '',
                    supportSession.startedAt ? `Started: ${formatSupportSessionTimestamp(supportSession.startedAt)}` : ''
                ].filter(Boolean);
                meta.textContent = details.join(' | ');
            }

            return banner;
        };

        if (document.readyState === 'loading' || !(document.body instanceof HTMLElement)) {
            document.addEventListener('DOMContentLoaded', mountBanner, { once: true });
            return null;
        }

        return mountBanner();
    }

    function formatDisplayDate(value, fallback = '') {
        const text = String(value || '').trim();
        if (!text) {
            return fallback;
        }

        const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text)
            ? new Date(`${text}T12:00:00`)
            : new Date(text);
        if (Number.isNaN(parsed.getTime())) {
            return text;
        }

        return parsed.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    function normalizeCompanyAnnouncement(value = null) {
        if (!value || typeof value !== 'object') {
            return null;
        }

        const title = String(value.title || value.subject || '').trim();
        const message = String(value.message || value.body || '').trim();
        if (!title && !message) {
            return null;
        }

        return {
            title: title || 'Company Announcement',
            message,
            startsOn: String(value.starts_on || value.startsOn || '').trim(),
            endsOn: String(value.ends_on || value.endsOn || '').trim(),
            windowLabel: String(value.window_label || value.windowLabel || '').trim(),
            isActive: value.is_active !== false
        };
    }

    function normalizeCompanyCalendarItem(value = null) {
        if (!value || typeof value !== 'object') {
            return null;
        }

        const name = String(value.name || value.title || '').trim();
        if (!name) {
            return null;
        }

        const startDate = String(value.start_date || value.startDate || value.date || '').trim();
        const endDate = String(value.end_date || value.endDate || value.date || value.start_date || value.startDate || '').trim() || startDate;

        return {
            id: String(value.id || '').trim(),
            name,
            note: String(value.note || value.description || '').trim(),
            date: startDate,
            startDate,
            endDate,
            timeLabel: String(value.time_label || value.timeLabel || value.when || '').trim(),
            type: String(value.type || '').trim().toLowerCase()
        };
    }

    function getCompanyCalendarItemStartDate(item = {}) {
        return String(item?.startDate || item?.start_date || item?.date || '').trim();
    }

    function getCompanyCalendarItemEndDate(item = {}) {
        return String(item?.endDate || item?.end_date || item?.date || item?.startDate || item?.start_date || '').trim();
    }

    function doesCompanyCalendarItemCoverDate(item = {}, dateKey = '') {
        const normalizedDate = String(dateKey || '').trim();
        const startDate = getCompanyCalendarItemStartDate(item);
        const endDate = getCompanyCalendarItemEndDate(item) || startDate;
        if (!normalizedDate || !startDate) {
            return false;
        }

        return normalizedDate >= startDate && normalizedDate <= endDate;
    }

    function getCompanyCalendarItemTypeLabel(type = '') {
        const normalized = String(type || '').trim().toLowerCase();
        if (normalized === 'news_update') {
            return 'Company News';
        }
        if (normalized === 'company_event') {
            return 'Company Event';
        }
        if (normalized === 'special_holiday') {
            return 'Special Holiday';
        }
        return 'Regular Holiday';
    }

    function getCompanyAnnouncementWindowLabel(announcement = null) {
        if (!announcement) {
            return '';
        }

        if (announcement.windowLabel) {
            return announcement.windowLabel;
        }

        if (announcement.startsOn && announcement.endsOn) {
            return `${formatDisplayDate(announcement.startsOn)} to ${formatDisplayDate(announcement.endsOn)}`;
        }

        if (announcement.startsOn) {
            return `Starts ${formatDisplayDate(announcement.startsOn)}`;
        }

        if (announcement.endsOn) {
            return `Until ${formatDisplayDate(announcement.endsOn)}`;
        }

        return 'Visible until cleared';
    }

    function getCompanyCalendarItemWindowLabel(item = null) {
        if (!item) {
            return '';
        }

        const startDate = getCompanyCalendarItemStartDate(item);
        const endDate = getCompanyCalendarItemEndDate(item) || startDate;
        const dateLabel = startDate && endDate && startDate !== endDate
            ? `${formatDisplayDate(startDate)} to ${formatDisplayDate(endDate)}`
            : formatDisplayDate(startDate || endDate);

        return [
            dateLabel,
            item.timeLabel
        ].filter(Boolean).join(' | ');
    }

    function clearEmployeeAnnouncementBanner() {
        const existing = document.getElementById(COMPANY_ANNOUNCEMENT_BANNER_ID);
        if (existing) {
            existing.remove();
        }
    }

    function syncEmployeeAnnouncementBanner(value = null) {
        if (getPathMetadata().section !== 'employee') {
            clearEmployeeAnnouncementBanner();
            return null;
        }

        const source = (value && typeof value === 'object') ? value : {};
        const notificationItems = Array.isArray(source.notificationItems)
            ? source.notificationItems.map((item) => normalizeCompanyCalendarItem(item)).filter(Boolean)
            : [];
        const activeAnnouncement = normalizeCompanyAnnouncement(
            source.activeAnnouncement
            || (source.announcement?.is_active ? source.announcement : null)
        );

        if (!notificationItems.length && (!activeAnnouncement || !activeAnnouncement.isActive)) {
            clearEmployeeAnnouncementBanner();
            return null;
        }

        const mountBanner = () => {
            if (!(document.body instanceof HTMLElement)) {
                return null;
            }

            let banner = document.getElementById(COMPANY_ANNOUNCEMENT_BANNER_ID);
            if (!(banner instanceof HTMLElement)) {
                banner = document.createElement('section');
                banner.id = COMPANY_ANNOUNCEMENT_BANNER_ID;
                banner.dataset.appCompanyAnnouncement = 'true';
                Object.assign(banner.style, {
                    margin: '14px auto 0',
                    width: 'min(calc(100% - 28px), 1180px)',
                    padding: '16px 18px',
                    borderRadius: '24px',
                    border: '1px solid rgba(37, 99, 235, 0.18)',
                    background: 'linear-gradient(135deg, rgba(239, 246, 255, 0.96), rgba(219, 234, 254, 0.9))',
                    boxShadow: '0 20px 38px rgba(37, 99, 235, 0.12)',
                    color: '#0f172a',
                    display: 'grid',
                    gap: '8px',
                    position: 'relative',
                    zIndex: '2'
                });

                const label = document.createElement('div');
                label.dataset.role = 'announcement-label';
                label.style.fontSize = '12px';
                label.style.fontWeight = '800';
                label.style.letterSpacing = '0.12em';
                label.style.textTransform = 'uppercase';
                label.style.color = '#1d4ed8';

                const title = document.createElement('strong');
                title.dataset.role = 'announcement-title';
                title.style.fontSize = '18px';
                title.style.lineHeight = '1.35';

                const message = document.createElement('div');
                message.dataset.role = 'announcement-message';
                message.style.fontSize = '14px';
                message.style.lineHeight = '1.65';
                message.style.color = '#1e293b';
                message.style.whiteSpace = 'pre-wrap';

                const meta = document.createElement('div');
                meta.dataset.role = 'announcement-meta';
                meta.style.fontSize = '12px';
                meta.style.fontWeight = '700';
                meta.style.color = '#475569';

                banner.appendChild(label);
                banner.appendChild(title);
                banner.appendChild(message);
                banner.appendChild(meta);
                document.body.prepend(banner);
            }

            const label = banner.querySelector('[data-role="announcement-label"]');
            const title = banner.querySelector('[data-role="announcement-title"]');
            const message = banner.querySelector('[data-role="announcement-message"]');
            const meta = banner.querySelector('[data-role="announcement-meta"]');
            const primaryCalendarItem = notificationItems[0] || null;
            const hasCalendarNotification = Boolean(primaryCalendarItem);
            const todayKey = String(source.todayKey || source.today_key || '').trim();
            const isTodayCalendarItem = hasCalendarNotification
                ? doesCompanyCalendarItemCoverDate(primaryCalendarItem, todayKey)
                : false;

            if (label instanceof HTMLElement) {
                label.textContent = hasCalendarNotification
                    ? (isTodayCalendarItem
                        ? 'Today in Company Calendar'
                        : 'Upcoming Company Notice')
                    : 'Company Announcement';
            }
            if (title instanceof HTMLElement) {
                title.textContent = hasCalendarNotification
                    ? primaryCalendarItem.name
                    : activeAnnouncement.title;
            }
            if (message instanceof HTMLElement) {
                if (hasCalendarNotification) {
                    const extraCount = Math.max(0, notificationItems.length - 1);
                    const details = [
                        primaryCalendarItem.note,
                        extraCount > 0 ? `${extraCount} more item${extraCount === 1 ? '' : 's'} on the company calendar.` : ''
                    ].filter(Boolean);
                    message.textContent = details.join(' ') || 'Check the company calendar for details.';
                } else {
                    message.textContent = activeAnnouncement.message;
                }
            }
            if (meta instanceof HTMLElement) {
                if (hasCalendarNotification) {
                    meta.textContent = [
                        getCompanyCalendarItemWindowLabel(primaryCalendarItem),
                        getCompanyCalendarItemTypeLabel(primaryCalendarItem.type)
                    ].filter(Boolean).join(' | ');
                } else {
                    meta.textContent = getCompanyAnnouncementWindowLabel(activeAnnouncement);
                }
            }

            return banner;
        };

        if (document.readyState === 'loading' || !(document.body instanceof HTMLElement)) {
            document.addEventListener('DOMContentLoaded', mountBanner, { once: true });
            return null;
        }

        return mountBanner();
    }

    function buildAvatarUrl(name, background = '4e73df', color = 'ffffff') {
        return `https://ui-avatars.com/api/?background=${background}&color=${color}&name=${encodeURIComponent(name || 'User')}`;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatDisplayTime(value, fallback = '--:--') {
        const text = String(value ?? '').trim();
        if (!text) {
            return fallback;
        }

        const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!match) {
            return text;
        }

        const hours = Number.parseInt(match[1], 10);
        const minutes = match[2];
        if (!Number.isFinite(hours)) {
            return text;
        }

        const period = hours >= 12 ? 'PM' : 'AM';
        const displayHour = hours % 12 || 12;
        return `${displayHour}:${minutes} ${period}`;
    }

    function navigateTo(path) {
        const targetWindow = window.top && window.top !== window
            ? window.top
            : window;
        if (!shouldAllowAutoNavigation(path)) {
            return false;
        }

        if (/^https?:\/\//i.test(path)) {
            targetWindow.location.replace(path);
            return true;
        }

        if (targetWindow.location.pathname !== path) {
            targetWindow.location.replace(path);
            return true;
        }

        return false;
    }

    function shouldAllowAutoNavigation(path) {
        const targetPath = String(path || '').trim();
        if (!targetPath || typeof sessionStorage === 'undefined') {
            return true;
        }

        const now = Date.now();
        const windowMs = 8000;
        const maxTransitions = 4;

        try {
            const rawValue = sessionStorage.getItem(AUTO_NAVIGATION_GUARD_KEY);
            const previousState = rawValue ? JSON.parse(rawValue) : {};
            const recentEvents = Array.isArray(previousState.events)
                ? previousState.events
                    .map((entry) => (typeof entry === 'number'
                        ? {
                            at: entry,
                            path: String(previousState.lastPath || '').trim()
                        }
                        : {
                            at: Number(entry?.at || 0),
                            path: String(entry?.path || '').trim()
                        }))
                    .filter((entry) => Number.isFinite(entry.at) && (now - entry.at) <= windowMs)
                : [];
            const sameTargetEvents = recentEvents.filter((entry) => entry.path === targetPath);

            if (sameTargetEvents.length >= 1) {
                console.error(`Blocked repeated auto-navigation to ${targetPath} to prevent a redirect loop.`);
                sessionStorage.setItem(AUTO_NAVIGATION_GUARD_KEY, JSON.stringify({
                    events: recentEvents.slice(-maxTransitions),
                    lastPath: targetPath,
                    lastAt: now,
                    blockedAt: now
                }));
                return false;
            }

            recentEvents.push({
                at: now,
                path: targetPath
            });

            sessionStorage.setItem(AUTO_NAVIGATION_GUARD_KEY, JSON.stringify({
                events: recentEvents.slice(-maxTransitions),
                lastPath: targetPath,
                lastAt: now
            }));

            if (recentEvents.length >= maxTransitions) {
                console.error(`Blocked repeated auto-navigation to ${targetPath} to prevent a redirect loop.`);
                return false;
            }
        } catch (_error) {
            return true;
        }

        return true;
    }

    function getLoginUrl() {
        return '/login.html';
    }

    function redirectToLogin() {
        return navigateTo(getLoginUrl());
    }

    function normalizeRole(role) {
        return String(role || '').trim().toLowerCase();
    }

    function isEmployeeLikeRole(role) {
        const normalizedRole = normalizeRole(role);
        return normalizedRole === 'employee' || normalizedRole === 'staff';
    }

    function normalizeWorkspaceExperienceMode(value = '') {
        return String(value || '').trim().toLowerCase() === 'attendance_only'
            ? 'attendance_only'
            : 'default';
    }

    function getWorkspaceExperienceMode(bootstrap = null) {
        return normalizeWorkspaceExperienceMode(bootstrap?.workspaceConfig?.experience?.mode);
    }

    function getAttendanceOnlyAllowedPaths(role, bootstrap = null) {
        if (getWorkspaceExperienceMode(bootstrap) !== 'attendance_only') {
            return [];
        }

        const normalizedRole = normalizeRole(role);
        if (normalizedRole === 'head_admin' || normalizedRole === 'company_admin') {
            return [
                '/head_admin/dashboard.html',
                '/head_admin/client_database.html',
                '/head_admin/inventory.html',
                '/head_admin/inventory_levels.html',
                '/head_admin/order_form.html',
                '/head_admin/sales_report.html',
                '/head_admin/employees.html',
                '/head_admin/users.html',
                '/head_admin/branches.html',
                '/head_admin/company_bulletin.html',
                '/head_admin/company_profile.html',
                '/head_admin/invoice_template.html',
                '/head_admin/timecards.html',
                '/head_admin/timecards_salary.html',
                '/head_admin/today_present.html',
                '/head_admin/time_in_time_out.html',
                '/head_admin/reports.html',
                '/head_admin/settings.html'
            ];
        }

        if (isEmployeeLikeRole(normalizedRole)) {
            return [
                '/employee/employee.html',
                '/employee/time_card.html',
                '/employee/time_in_time_out.html',
                '/employee/settings.html'
            ];
        }

        return [];
    }

    function resolveWorkspaceHomePath(role, bootstrap = null) {
        const normalizedRole = normalizeRole(role);
        if (normalizedRole === 'super_admin') {
            return '/super_admin/dashboard.html';
        }

        if (getWorkspaceExperienceMode(bootstrap) === 'attendance_only') {
            if (normalizedRole === 'head_admin' || normalizedRole === 'company_admin') {
                return '/head_admin/dashboard.html';
            }
            if (isEmployeeLikeRole(normalizedRole)) {
                return '/employee/employee.html';
            }
        }

        if (normalizedRole === 'head_admin' || normalizedRole === 'company_admin') {
            return '/head_admin/dashboard.html';
        }

        return '/employee/employee.html';
    }

    function getBootstrapWithSessionCache() {
        return requestWithSessionCache('bootstrap', 30000, () => request('/api/bootstrap')).then((payload) => {
            syncSupportSessionBanner(payload?.support_session || payload?.user?.support_session || payload?.user?.supportSession || null);
            syncEmployeeAnnouncementBanner(payload?.companyBulletin || payload?.company_bulletin || null);
            return payload;
        });
    }

    async function enforceWorkspaceRestrictions(user) {
        const normalizedRole = normalizeRole(user?.role);
        if (!normalizedRole || normalizedRole === 'super_admin') {
            return true;
        }

        const metadata = getPathMetadata();
        if (metadata.section !== 'head_admin' && metadata.section !== 'employee') {
            return true;
        }

        let bootstrap = null;
        try {
            bootstrap = await getBootstrapWithSessionCache();
        } catch (error) {
            console.error('Failed to load bootstrap for workspace restriction check:', error);
            return true;
        }

        const allowedPaths = getAttendanceOnlyAllowedPaths(normalizedRole, bootstrap);
        const targetPath = resolveWorkspaceHomePath(normalizedRole, bootstrap);
        const currentPath = String(window.location.pathname || '').replace(/\\/g, '/');
        if (!targetPath || currentPath === targetPath) {
            return true;
        }

        if (!allowedPaths.length || allowedPaths.includes(currentPath)) {
            return true;
        }

        navigateTo(targetPath);
        return false;
    }

    function redirectByRole(role, { bootstrap = null } = {}) {
        return navigateTo(resolveWorkspaceHomePath(role, bootstrap));
    }

    function attachEmployeeBackButton(session, {
        id = 'appEmployeeBackButton',
        label = 'Back to Employee Dashboard',
        path = '/employee/employee.html',
        top = '14px',
        right = '14px'
    } = {}) {
        if (!isEmployeeLikeRole(session?.role)) {
            return null;
        }

        const existing = document.getElementById(id);
        if (existing) {
            return existing;
        }

        if (!document.body) {
            return null;
        }

        const button = document.createElement('button');
        button.id = id;
        button.type = 'button';
        button.textContent = String(label || 'Back');
        button.dataset.appEmployeeBackButton = 'true';
        Object.assign(button.style, {
            position: 'fixed',
            top: String(top || '14px'),
            right: String(right || '14px'),
            zIndex: '2147483647',
            padding: '10px 14px',
            borderRadius: '999px',
            border: '1px solid var(--tenant-line-strong, rgba(17, 24, 39, 0.16))',
            background: 'var(--tenant-button-gradient, linear-gradient(135deg, #3b82f6, #1d4ed8))',
            color: 'var(--tenant-on-primary, #ffffff)',
            fontSize: '13px',
            fontWeight: '700',
            lineHeight: '1',
            cursor: 'pointer',
            boxShadow: 'var(--tenant-shadow-soft, 0 12px 28px rgba(15, 23, 42, 0.22))'
        });
        button.addEventListener('click', () => {
            navigateTo(path);
        });
        document.body.appendChild(button);
        return button;
    }

    function isCompanyAdminRole(role) {
        const normalizedRole = normalizeRole(role);
        return normalizedRole === 'head_admin' || normalizedRole === 'company_admin';
    }

    function normalizeUserFeatureAccess(value = {}) {
        const source = (value && typeof value === 'object' && !Array.isArray(value))
            ? value
            : {};

        return Object.keys(USER_FEATURE_DEFAULTS).reduce((access, key) => {
            access[key] = Object.prototype.hasOwnProperty.call(source, key)
                ? Boolean(source[key])
                : Boolean(USER_FEATURE_DEFAULTS[key]);
            return access;
        }, {});
    }

    function normalizeFeatureList(value = []) {
        if (Array.isArray(value)) {
            return value
                .map((item) => String(item || '').trim().toLowerCase())
                .filter(Boolean);
        }

        if (typeof value === 'string') {
            return value
                .split(',')
                .map((item) => item.trim().toLowerCase())
                .filter(Boolean);
        }

        return [];
    }

    function hasUserFeatureAccess(user, featureKey) {
        const key = String(featureKey || '').trim().toLowerCase();
        if (!key) {
            return true;
        }

        const access = normalizeUserFeatureAccess(user?.feature_access || {});
        return Boolean(access[key]);
    }

    function canEmployeeAccessCompanyAdminView({ expectedRole = '', user = null, allowedFeatures = [] } = {}) {
        const normalizedExpectedRole = String(expectedRole || '').trim().toLowerCase();
        if (!['head_admin', 'company_admin'].includes(normalizedExpectedRole)) {
            return false;
        }

        if (!isEmployeeLikeRole(user?.role)) {
            return false;
        }

        const featureKeys = normalizeFeatureList(allowedFeatures);
        if (!featureKeys.length) {
            return false;
        }

        return featureKeys.every((featureKey) => hasUserFeatureAccess(user, featureKey));
    }

    function roleMatches(expectedRole, actualRole) {
        const normalizedExpected = normalizeRole(expectedRole);
        const normalizedActual = normalizeRole(actualRole);
        if (!normalizedExpected) {
            return true;
        }
        if (normalizedExpected === normalizedActual) {
            return true;
        }
        if (normalizedExpected === 'employee' && isEmployeeLikeRole(normalizedActual)) {
            return true;
        }
        if ((normalizedExpected === 'head_admin' || normalizedExpected === 'company_admin') && isCompanyAdminRole(normalizedActual)) {
            return true;
        }
        return false;
    }

    function handleUnauthorized() {
        clearStoredSession();

        if (redirectPending) {
            return;
        }

        redirectPending = true;
        window.setTimeout(() => {
            redirectPending = false;
            redirectToLogin();
        }, 0);
    }

    async function getCurrentSession({ bypassCache = false } = {}) {
        if (!bypassCache) {
            const cachedUser = readRequestCache(CURRENT_SESSION_CACHE_KEY, 15000);
            if (cachedUser && cachedUser.id) {
                setSessionUser(cachedUser);
                syncSupportSessionBanner(cachedUser.support_session || cachedUser.supportSession || null);
                return cachedUser;
            }
        }

        let user = null;
        try {
            user = await requestWithSessionCache(CURRENT_SESSION_CACHE_KEY, 15000, () => request('/api/session', {
                skipAuthRedirect: true
            }), {
                bypassCache
            });
        } catch (error) {
            if (error?.code === 'HTTP_401') {
                clearStoredSession();
                return null;
            }
            throw error;
        }

        if (user && user.id) {
            setSessionUser(user);
            syncSupportSessionBanner(user.support_session || user.supportSession || null);
            return user;
        }

        clearStoredSession();
        return null;
    }

    async function ensureSession({ role = '', allowEmployeeFeature = '', allowEmployeeFeatures = [] } = {}) {
        const user = await getCurrentSession({ bypassCache: true });
        if (!user) {
            redirectToLogin();
            return null;
        }

        const allowedFeatures = Array.from(new Set([
            ...normalizeFeatureList(allowEmployeeFeature),
            ...normalizeFeatureList(allowEmployeeFeatures)
        ]));
        const employeeOverrideAllowed = canEmployeeAccessCompanyAdminView({
            expectedRole: role,
            user,
            allowedFeatures
        });

        if (role && !roleMatches(role, user.role) && !employeeOverrideAllowed) {
            redirectByRole(user.role);
            return null;
        }

        const workspaceAllowed = await enforceWorkspaceRestrictions(user);
        if (!workspaceAllowed) {
            return null;
        }

        return {
            userId: user.id,
            userName: user.name || '',
            role: user.role || '',
            companyId: user.company_id || '',
            companyCode: user.company_code || '',
            branchId: user.branch_id || '',
            branchName: user.branch_name || '',
            timeZone: user.time_zone || user.timezone || user.timeZone || '',
            feature_access: normalizeUserFeatureAccess(user.feature_access || {}),
            support_session: normalizeSupportSessionPayload(user.support_session || user.supportSession || null)
        };
    }

    window.appClient = {
        request,
        buildAvatarUrl,
        clearSession,
        getLoginUrl,
        redirectToLogin,
        redirectByRole,
        escapeHtml,
        formatDisplayTime,
        getSession,
        getCurrentSession,
        ensureSession,
        attachEmployeeBackButton,
        hasUserFeatureAccess,
        getWorkspaceExperienceMode,
        normalizeUserFeatureAccess,
        normalizeHexColor,
        hexToRgb,
        hexToRgba,
        mixHexColors,
        buildBrandTheme,
        applyBrandFavicon,
        applyBrandTheme,
        applyBootstrapBrandTheme,
        readCachedBrandTheme,
        setSessionUser,
        getServerInfo: () => requestWithSessionCache('server-info', 30000, () => request('/api/server-info', {
            skipAuthRedirect: true
        })),
        getClientConfig: () => request('/api/client-config'),
        getPublicBranding: ({ companyCode = '' } = {}) => request(`/api/public-branding?companyCode=${encodeURIComponent(companyCode)}`, {
            skipAuthRedirect: true
        }),
        getPublicCompanyRegistrationConfig: () => request('/api/public/company-registration-config', {
            skipAuthRedirect: true
        }),
        getPublicCompanyRegistrationPlans: () => request('/api/public/company-registration-plans', {
            skipAuthRedirect: true
        }),
        getPublicCompanyRegistrationPaymongoQr: () => request('/api/public/company-registration-paymongo-qr', {
            skipAuthRedirect: true
        }),
        createPublicCompanyRegistrationPaymentPreview: (payload) => request('/api/public/company-registration-payment-preview', {
            method: 'POST',
            body: payload,
            skipAuthRedirect: true
        }),
        createPublicCompanyRegistrationCheckoutSession: (payload) => request('/api/public/company-registration-checkout-session', {
            method: 'POST',
            body: payload,
            skipAuthRedirect: true
        }),
        completePublicCompanyRegistrationCheckout: (payload) => request('/api/public/company-registration-checkout-complete', {
            method: 'POST',
            body: payload,
            skipAuthRedirect: true
        }),
        createPublicCustomerRequest: (payload) => request('/api/public/customer-requests', {
            method: 'POST',
            body: payload,
            skipAuthRedirect: true
        }),
        createPublicCompanyRegistrationRequest: (payload) => request('/api/public/company-registration-requests', {
            method: 'POST',
            body: payload,
            skipAuthRedirect: true
        }),
        getPublicCustomerRequest: ({ companyCode = '', requestCode = '', contactNumber = '' } = {}) => request(
            `/api/public/customer-requests/${encodeURIComponent(requestCode)}?companyCode=${encodeURIComponent(companyCode)}&contactNumber=${encodeURIComponent(contactNumber)}`,
            { skipAuthRedirect: true }
        ),
        getPublicCompanyRegistrationRequest: ({ requestCode = '', contactNumber = '' } = {}) => request(
            `/api/public/company-registration-requests/${encodeURIComponent(requestCode)}?contactNumber=${encodeURIComponent(contactNumber)}`,
            { skipAuthRedirect: true }
        ),
        updatePublicCustomerRequest: (requestCode, payload = {}, { companyCode = '', contactNumber = '' } = {}) => request(
            `/api/public/customer-requests/${encodeURIComponent(requestCode)}?companyCode=${encodeURIComponent(companyCode)}&contactNumber=${encodeURIComponent(contactNumber)}`,
            {
                method: 'PUT',
                body: {
                    ...payload,
                    companyCode,
                    authContactNumber: payload.authContactNumber || contactNumber
                },
                skipAuthRedirect: true
            }
        ),
        updatePublicCompanyRegistrationRequest: (requestCode, payload = {}, { contactNumber = '' } = {}) => request(
            `/api/public/company-registration-requests/${encodeURIComponent(requestCode)}?contactNumber=${encodeURIComponent(contactNumber)}`,
            {
                method: 'PUT',
                body: {
                    ...payload,
                    authContactNumber: payload.authContactNumber || contactNumber
                },
                skipAuthRedirect: true
            }
        ),
        sendPublicCustomerRequestMessage: (requestCode, payload = {}, { companyCode = '', contactNumber = '' } = {}) => request(
            `/api/public/customer-requests/${encodeURIComponent(requestCode)}/messages?companyCode=${encodeURIComponent(companyCode)}`,
            {
                method: 'POST',
                body: {
                    ...payload,
                    companyCode,
                    authContactNumber: payload.authContactNumber || contactNumber
                },
                skipAuthRedirect: true
            }
        ),
        sendPublicCompanyRegistrationRequestMessage: (requestCode, payload = {}, { contactNumber = '' } = {}) => request(
            `/api/public/company-registration-requests/${encodeURIComponent(requestCode)}/messages`,
            {
                method: 'POST',
                body: {
                    ...payload,
                    authContactNumber: payload.authContactNumber || contactNumber
                },
                skipAuthRedirect: true
            }
        ),
        requestPasswordResetCode: ({ companyCode = '', email = '' } = {}) => request('/api/public/password-reset/request', {
            method: 'POST',
            body: {
                companyCode,
                email
            },
            skipAuthRedirect: true
        }),
        verifyPasswordResetCode: ({ companyCode = '', email = '', code = '' } = {}) => request('/api/public/password-reset/verify', {
            method: 'POST',
            body: {
                companyCode,
                email,
                code
            },
            skipAuthRedirect: true
        }),
        confirmPasswordReset: ({ companyCode = '', email = '', code = '', password = '' } = {}) => request('/api/public/password-reset/confirm', {
            method: 'POST',
            body: {
                companyCode,
                email,
                code,
                password
            },
            skipAuthRedirect: true
        }),
        getBootstrap: () => getBootstrapWithSessionCache(),
        parseOrderDraftWithAi: (payload) => request('/api/order-form/ai-parse', {
            method: 'POST',
            body: payload
        }),
        listClients: (filter = '', limit = 500, offset = 0) => {
            const normalizedFilter = String(filter || '').trim();
            const normalizedLimit = Math.max(1, Number(limit) || 500);
            const normalizedOffset = Math.max(0, Number(offset) || 0);
            const requestFactory = () => request(
                `/api/clients?filter=${encodeURIComponent(normalizedFilter)}&limit=${encodeURIComponent(normalizedLimit)}&offset=${encodeURIComponent(normalizedOffset)}`
            );

            if (shouldUseDefaultQueryCache({ filter: normalizedFilter, offset: normalizedOffset })) {
                return requestWithSessionCache(
                    `clients:filter=${normalizedFilter}:limit=${normalizedLimit}:offset=${normalizedOffset}`,
                    30000,
                    requestFactory
                );
            }

            return requestFactory();
        },
        addClient: (payload) => request('/api/clients', {
            method: 'POST',
            body: payload
        }).then((result) => {
            invalidateReferenceCaches(['clients']);
            return result;
        }),
        updateClient: (id, payload) => request(`/api/clients/${encodeURIComponent(id)}`, {
            method: 'PUT',
            body: payload
        }).then((result) => {
            invalidateReferenceCaches(['clients']);
            return result;
        }),
        deleteClient: (id) => request(`/api/clients/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        }).then((result) => {
            invalidateReferenceCaches(['clients']);
            return result;
        }),
        listCustomerRequests: ({ filter = '', status = '', limit = 200 } = {}) => request(
            `/api/customer-requests?filter=${encodeURIComponent(filter)}&status=${encodeURIComponent(status)}&limit=${encodeURIComponent(limit)}`
        ),
        getCustomerRequestThread: (requestCode) => request(`/api/customer-requests/${encodeURIComponent(requestCode)}`),
        updateCustomerRequestByCode: (requestCode, payload) => request(`/api/customer-requests/${encodeURIComponent(requestCode)}`, {
            method: 'PATCH',
            body: payload
        }),
        sendCustomerRequestMessage: (requestCode, payload) => request(`/api/customer-requests/${encodeURIComponent(requestCode)}/messages`, {
            method: 'POST',
            body: payload
        }),
        getSalesReferences: () => requestWithSessionCache('sales-references', 30000, () => request('/api/sales/references')),
        listProducts: (filter = '') => request(`/api/products?filter=${encodeURIComponent(filter)}`),
        listInventoryVariants: ({ productName = '', setName = '', search = '', limit = 500, offset = 0, bypassCache = false } = {}) => {
            const normalizedProductName = String(productName || '').trim();
            const normalizedSetName = String(setName || '').trim();
            const normalizedSearch = String(search || '').trim();
            const normalizedLimit = Math.max(1, Number(limit) || 500);
            const normalizedOffset = Math.max(0, Number(offset) || 0);
            const requestFactory = () => callElectronOrHttp(
                () => window.electronAPI?.inventoryVariants?.list({
                    productName: normalizedProductName,
                    setName: normalizedSetName,
                    search: normalizedSearch,
                    limit: normalizedLimit,
                    offset: normalizedOffset
                }),
                () => request(
                    `/api/inventory-variants?productName=${encodeURIComponent(normalizedProductName)}&setName=${encodeURIComponent(normalizedSetName)}&search=${encodeURIComponent(normalizedSearch)}&limit=${encodeURIComponent(normalizedLimit)}&offset=${encodeURIComponent(normalizedOffset)}`
                )
            );

            if (shouldUseDefaultQueryCache({
                productName: normalizedProductName,
                setName: normalizedSetName,
                search: normalizedSearch,
                offset: normalizedOffset
            })) {
                return requestWithSessionCache(
                    `inventory-variants:product=${normalizedProductName}:set=${normalizedSetName}:search=${normalizedSearch}:limit=${normalizedLimit}:offset=${normalizedOffset}`,
                    30000,
                    requestFactory,
                    { bypassCache }
                );
            }

            return requestFactory();
        },
        createInventoryVariant: (payload) => request('/api/inventory-variants', {
            method: 'POST',
            body: payload
        }).then((result) => {
            invalidateReferenceCaches(['inventory-variants']);
            return result;
        }),
        updateInventoryVariant: (id, payload) => request(`/api/inventory-variants/${encodeURIComponent(id)}`, {
            method: 'PUT',
            body: payload
        }).then((result) => {
            invalidateReferenceCaches(['inventory-variants']);
            return result;
        }),
        deleteInventoryVariant: (id) => request(`/api/inventory-variants/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        }).then((result) => {
            invalidateReferenceCaches(['inventory-variants']);
            return result;
        }),
        importInventoryVariants: (payload = {}) => request('/api/inventory-variants/import', {
            method: 'POST',
            body: payload
        }).then((result) => {
            invalidateReferenceCaches(['inventory-variants']);
            return result;
        }),
        listInventoryVariantProducts: () => callElectronOrHttp(
            () => window.electronAPI?.inventoryVariants?.listProducts(),
            () => request('/api/inventory-variants/products')
        ),
        listInventoryVariantSets: (productName) => callElectronOrHttp(
            () => window.electronAPI?.inventoryVariants?.listSetsByProduct(productName),
            () => request(`/api/inventory-variants/sets?productName=${encodeURIComponent(productName || '')}`)
        ),
        resolveInventoryVariant: ({ productName = '', setName = '' } = {}) => callElectronOrHttp(
            () => window.electronAPI?.inventoryVariants?.resolve({ productName, setName }),
            () => request(`/api/inventory-variants/resolve?productName=${encodeURIComponent(productName)}&setName=${encodeURIComponent(setName)}`)
        ),
        listInventory: ({ branch = '', filter = '', limit = 500, offset = 0 } = {}) => request(`/api/inventory?branch=${encodeURIComponent(branch)}&filter=${encodeURIComponent(filter)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`),
        updateInventoryItem: (inventoryId, payload) => request(`/api/inventory-items/${encodeURIComponent(inventoryId)}`, {
            method: 'PATCH',
            body: payload
        }),
        updateInventoryQuantity: (helper, payload) => request(`/api/inventory/${encodeURIComponent(helper)}`, {
            method: 'PATCH',
            body: payload
        }),
        deleteInventoryItem: (inventoryId, { branch = '' } = {}) => request(
            `/api/inventory/${encodeURIComponent(inventoryId)}?branch=${encodeURIComponent(branch)}`,
            { method: 'DELETE' }
        ),
        listCompositeItems: (filter = '', limit = 500, offset = 0) => request(`/api/composite-items?filter=${encodeURIComponent(filter)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`),
        upsertCompositeItem: (payload) => request('/api/composite-items', {
            method: 'POST',
            body: payload
        }).then((result) => {
            invalidateReferenceCaches(['inventory-variants']);
            return result;
        }),
        deleteCompositeItem: (compositeKey) => request(`/api/composite-items/${encodeURIComponent(compositeKey)}`, {
            method: 'DELETE'
        }).then((result) => {
            invalidateReferenceCaches(['inventory-variants']);
            return result;
        }),
        listSales: ({ dateFrom = '', dateTo = '', branch = '', cashBranch = '', paymentOption = '', adminName = '', salesRepresentative = '', search = '', limit = 500, offset = 0 } = {}) => request(
            `/api/sales?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&branch=${encodeURIComponent(branch)}&cashBranch=${encodeURIComponent(cashBranch)}&paymentOption=${encodeURIComponent(paymentOption)}&adminName=${encodeURIComponent(adminName)}&salesRepresentative=${encodeURIComponent(salesRepresentative)}&search=${encodeURIComponent(search)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`
        ),
        listPendingPayments: ({ dateFrom = '', dateTo = '', branch = '', cashBranch = '', paymentOption = '', adminName = '', salesRepresentative = '', search = '', status = '', limit = 500, offset = 0 } = {}) => request(
            `/api/sales/pending-payments?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&branch=${encodeURIComponent(branch)}&cashBranch=${encodeURIComponent(cashBranch)}&paymentOption=${encodeURIComponent(paymentOption)}&adminName=${encodeURIComponent(adminName)}&salesRepresentative=${encodeURIComponent(salesRepresentative)}&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`
        ),
        listCustomerCredits: ({ dateFrom = '', dateTo = '', search = '', status = 'with_balance', limitClients = 250, limitEntries = 250 } = {}) => {
            const query = `dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&limitClients=${encodeURIComponent(limitClients)}&limitEntries=${encodeURIComponent(limitEntries)}`;
            return requestWithSessionCache(
                `customer-credits:${query}`,
                15000,
                () => request(`/api/sales/customer-credits?${query}`)
            );
        },
        addSale: (payload) => request('/api/sales', {
            method: 'POST',
            body: payload
        }),
        listCommunicationWorkflow: ({ branch = '', search = '' } = {}) => request(
            `/api/communication-workflow?branch=${encodeURIComponent(branch)}&search=${encodeURIComponent(search)}`
        ),
        createCommunicationWorkflowEntry: (payload) => request('/api/communication-workflow', {
            method: 'POST',
            body: payload
        }),
        getCommunicationWorkflowThread: (entryId, { limit = 200 } = {}) => request(
            `/api/communication-workflow/${encodeURIComponent(entryId)}/thread?limit=${encodeURIComponent(limit)}`
        ),
        sendCommunicationWorkflowMessage: (entryId, payload) => request(`/api/communication-workflow/${encodeURIComponent(entryId)}/messages`, {
            method: 'POST',
            body: payload
        }),
        updateCommunicationWorkflowEntry: (entryId, payload) => request(`/api/communication-workflow/${encodeURIComponent(entryId)}`, {
            method: 'PATCH',
            body: payload
        }),
        listLbcTracking: ({ branch = '', search = '', deliveryStatus = '', quickFilter = 'all', dateFrom = '' } = {}) => request(
            `/api/lbc-tracking?branch=${encodeURIComponent(branch)}&search=${encodeURIComponent(search)}&deliveryStatus=${encodeURIComponent(deliveryStatus)}&quickFilter=${encodeURIComponent(quickFilter)}&dateFrom=${encodeURIComponent(dateFrom)}`
        ),
        listLbcCollections: ({ branch = '', search = '', status = 'all', dateFrom = '' } = {}) => request(
            `/api/lbc-tracking/collections?branch=${encodeURIComponent(branch)}&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&dateFrom=${encodeURIComponent(dateFrom)}`
        ),
        updateLbcTracking: (orderKey, payload) => request(`/api/lbc-tracking/${encodeURIComponent(orderKey)}`, {
            method: 'PUT',
            body: payload
        }),
        confirmLbcCollection: (orderKey, payload = {}) => request(`/api/lbc-tracking/collections/${encodeURIComponent(orderKey)}/confirm`, {
            method: 'POST',
            body: payload
        }),
        bulkAssignLbcTracking: (payload = {}) => request('/api/lbc-tracking/bulk-assign', {
            method: 'POST',
            body: payload
        }),
        refreshLbcTrackingStatuses: (payload = {}) => request('/api/lbc-tracking/refresh', {
            method: 'POST',
            body: payload
        }),
        listExpenses: ({ dateFrom = '', dateTo = '', branch = '', search = '' } = {}) => request(
            `/api/expenses?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&branch=${encodeURIComponent(branch)}&search=${encodeURIComponent(search)}`
        ),
        addExpense: (payload) => request('/api/expenses', {
            method: 'POST',
            body: payload
        }),
        updateExpense: (entryId, payload) => request(`/api/expenses/${encodeURIComponent(entryId)}`, {
            method: 'PUT',
            body: payload
        }),
        deleteExpense: (entryId) => request(`/api/expenses/${encodeURIComponent(entryId)}`, {
            method: 'DELETE'
        }),
        clearExpenses: () => request('/api/expenses', {
            method: 'DELETE'
        }),
        listCashIncome: ({ dateFrom = '', dateTo = '', branch = '', search = '' } = {}) => request(
            `/api/cash-income?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&branch=${encodeURIComponent(branch)}&search=${encodeURIComponent(search)}`
        ),
        addCashIncome: (payload) => request('/api/cash-income', {
            method: 'POST',
            body: payload
        }),
        updateCashIncome: (entryId, payload) => request(`/api/cash-income/${encodeURIComponent(entryId)}`, {
            method: 'PUT',
            body: payload
        }),
        deleteCashIncome: (entryId) => request(`/api/cash-income/${encodeURIComponent(entryId)}`, {
            method: 'DELETE'
        }),
        clearCashIncome: () => request('/api/cash-income', {
            method: 'DELETE'
        }),
        createOrder: (payload) => request('/api/sales', {
            method: 'POST',
            body: payload
        }),
        getOrder: (orderNumber) => callElectronOrHttp(
            () => window.electronAPI?.orders?.get(orderNumber),
            () => request(`/api/orders/${encodeURIComponent(orderNumber)}`)
        ),
        updateOrder: (orderNumber, payload) => request(`/api/orders/${encodeURIComponent(orderNumber)}`, {
            method: 'PUT',
            body: payload
        }),
        deleteOrder: (orderNumber) => request(`/api/orders/${encodeURIComponent(orderNumber)}`, {
            method: 'DELETE'
        }),
        previewOrderNumber: (saleDate = '') => callElectronOrHttp(
            () => window.electronAPI?.orders?.preview(saleDate),
            () => request(`/api/orders/next-number?saleDate=${encodeURIComponent(saleDate)}`)
        ),
        previewCustomerCreditBackfill: ({ dateFrom = '', dateTo = '' } = {}) => request(
            `/api/orders/customer-credit-backfill/preview?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`
        ),
        applyCustomerCreditBackfill: ({ dateFrom = '', dateTo = '' } = {}) => request('/api/orders/customer-credit-backfill', {
            method: 'POST',
            body: {
                dateFrom,
                dateTo
            }
        }).then((result) => {
            invalidateReferenceCaches(['customer-credits', 'orders:pending-client']);
            return result;
        }),
        addManualCustomerCredit: ({ clientName = '', clientContact = '', clientAddress = '', amount = 0, note = '', action = 'add' } = {}) => request('/api/orders/customer-credit/manual-entry', {
            method: 'POST',
            body: {
                clientName,
                clientContact,
                clientAddress,
                amount,
                note,
                action
            }
        }).then((result) => {
            invalidateReferenceCaches(['customer-credits', 'orders:pending-client']);
            return result;
        }),
        checkOrderClientPending: ({ clientName = '', clientContact = '', clientAddress = '', excludeOrderNumber = '', limit = 12 } = {}) => {
            const query = `clientName=${encodeURIComponent(clientName)}&clientContact=${encodeURIComponent(clientContact)}&clientAddress=${encodeURIComponent(clientAddress)}&excludeOrderNumber=${encodeURIComponent(excludeOrderNumber)}&limit=${encodeURIComponent(limit)}`;
            return requestWithSessionCache(
                `orders:pending-client:${query}`,
                8000,
                () => callElectronOrHttp(
                    () => window.electronAPI?.orders?.checkPendingClient?.({
                        clientName,
                        clientContact,
                        clientAddress,
                        excludeOrderNumber,
                        limit
                    }),
                    async () => {
                        try {
                            return await request(`/api/order-client-pending-check?${query}`);
                        } catch (error) {
                            if (error.code === 'HTTP_404' || /order not found/i.test(String(error.message || ''))) {
                                return request(`/api/orders/pending-client-check?${query}`);
                            }
                            throw error;
                        }
                    }
                )
            );
        },
        login: async (idOrPayload, password = '') => {
            const payload = typeof idOrPayload === 'object' && idOrPayload
                ? {
                    companyCode: String(idOrPayload.companyCode || idOrPayload.company_code || '').trim(),
                    username: String(idOrPayload.username || idOrPayload.id || '').trim(),
                    password: String(idOrPayload.password || '').trim()
                }
                : {
                    companyCode: '',
                    username: String(idOrPayload || '').trim(),
                    password: String(password || '').trim()
                };

            const user = await request('/api/login', {
                method: 'POST',
                body: payload,
                skipAuthRedirect: true
            });

            setSessionUser(user);
            return user;
        },
        loginWithFirebase: async ({ idToken = '', companyCode = '' } = {}) => {
            const user = await request('/api/login/firebase', {
                method: 'POST',
                body: {
                    idToken: String(idToken || '').trim(),
                    companyCode: String(companyCode || '').trim()
                },
                skipAuthRedirect: true
            });

            setSessionUser(user);
            return user;
        },
        requestEmailConnectionCode: async ({ email = '' } = {}) => request('/api/account/connect/email/request', {
            method: 'POST',
            body: {
                email: String(email || '').trim()
            }
        }),
        verifyEmailConnectionCode: async ({ email = '', code = '' } = {}) => request('/api/account/connect/email/verify', {
            method: 'POST',
            body: {
                email: String(email || '').trim(),
                code: String(code || '').trim()
            }
        }),
        connectGoogleAccount: async ({ idToken = '', email = '' } = {}) => request('/api/account/connect/google', {
            method: 'POST',
            body: {
                idToken: String(idToken || '').trim(),
                email: String(email || '').trim()
            }
        }),
        requestEmailUnlinkCode: () => request('/api/account/connect/email/unlink/request', {
            method: 'POST'
        }),
        unlinkEmailConnection: async ({ code = '' } = {}) => request('/api/account/connect/email/unlink', {
            method: 'POST',
            body: {
                code: String(code || '').trim()
            }
        }),
        requestGoogleUnlinkCode: () => request('/api/account/connect/google/unlink/request', {
            method: 'POST'
        }),
        unlinkGoogleAccount: async ({ code = '' } = {}) => request('/api/account/connect/google/unlink', {
            method: 'POST',
            body: {
                code: String(code || '').trim()
            }
        }),
        listSignupRequests: ({ status = 'open', filter = '', limit = 200 } = {}) => request(
            `/api/signup-requests?status=${encodeURIComponent(status)}&filter=${encodeURIComponent(filter)}&limit=${encodeURIComponent(limit)}`
        ),
        approveSignupRequest: (requestCode, payload = {}) => request(
            `/api/signup-requests/${encodeURIComponent(requestCode)}/approve`,
            {
                method: 'POST',
                body: payload
            }
        ),
        rejectSignupRequest: (requestCode, payload = {}) => request(
            `/api/signup-requests/${encodeURIComponent(requestCode)}/reject`,
            {
                method: 'POST',
                body: payload
            }
        ),
        getCompanySettings: () => request('/api/company/settings'),
        updateCompanySettings: (payload) => request('/api/company/settings', {
            method: 'PUT',
            body: payload
        }).then((result) => {
            invalidateReferenceCaches(['bootstrap']);
            return result;
        }),
        getCompanyBulletin: () => requestWithSessionCache('company-bulletin', 30000, () => request('/api/company/bulletin')).then((result) => {
            syncEmployeeAnnouncementBanner(result);
            return result;
        }),
        updateCompanyAnnouncement: (payload) => request('/api/company/bulletin/announcement', {
            method: 'PUT',
            body: payload
        }).then((result) => {
            invalidateReferenceCaches(['bootstrap', 'company-bulletin']);
            syncEmployeeAnnouncementBanner(result);
            return result;
        }),
        clearCompanyAnnouncement: () => request('/api/company/bulletin/announcement', {
            method: 'DELETE'
        }).then((result) => {
            invalidateReferenceCaches(['bootstrap', 'company-bulletin']);
            syncEmployeeAnnouncementBanner(result);
            return result;
        }),
        createCompanyHoliday: (payload) => request('/api/company/bulletin/holidays', {
            method: 'POST',
            body: payload
        }).then((result) => {
            invalidateReferenceCaches(['bootstrap', 'company-bulletin']);
            return result;
        }),
        updateCompanyHoliday: (holidayId, payload) => request(`/api/company/bulletin/holidays/${encodeURIComponent(holidayId)}`, {
            method: 'PUT',
            body: payload
        }).then((result) => {
            invalidateReferenceCaches(['bootstrap', 'company-bulletin']);
            return result;
        }),
        deleteCompanyHoliday: (holidayId) => request(`/api/company/bulletin/holidays/${encodeURIComponent(holidayId)}`, {
            method: 'DELETE'
        }).then((result) => {
            invalidateReferenceCaches(['bootstrap', 'company-bulletin']);
            return result;
        }),
        getCompanyWorkspaceConfig: () => request('/api/company/workspace-config'),
        updateCompanyWorkspaceConfig: (payload) => request('/api/company/workspace-config', {
            method: 'PUT',
            body: payload
        }).then((result) => {
            invalidateReferenceCaches(['bootstrap', 'sales-references']);
            return result;
        }),
        getCompanyInvoiceTemplate: () => request('/api/company/invoice-template'),
        updateCompanyInvoiceTemplate: (payload) => request('/api/company/invoice-template', {
            method: 'PUT',
            body: payload
        }).then((result) => {
            invalidateReferenceCaches(['bootstrap']);
            return result;
        }),
        listBranches: (limit = 500, offset = 0) => {
            const normalizedLimit = Math.max(1, Number(limit) || 500);
            const normalizedOffset = Math.max(0, Number(offset) || 0);
            const requestFactory = () => request(
                `/api/branches?limit=${encodeURIComponent(normalizedLimit)}&offset=${encodeURIComponent(normalizedOffset)}`
            );

            if (shouldUseDefaultQueryCache({ offset: normalizedOffset })) {
                return requestWithSessionCache(
                    `branches:limit=${normalizedLimit}:offset=${normalizedOffset}`,
                    30000,
                    requestFactory
                );
            }

            return requestFactory();
        },
        createBranch: (payload) => request('/api/branches', {
            method: 'POST',
            body: payload
        }).then((result) => {
            invalidateReferenceCaches(['branches', 'bootstrap', 'sales-references']);
            return result;
        }),
        updateBranch: (branchId, payload) => request(`/api/branches/${encodeURIComponent(branchId)}`, {
            method: 'PUT',
            body: payload
        }).then((result) => {
            invalidateReferenceCaches(['branches', 'bootstrap', 'sales-references']);
            return result;
        }),
        deleteBranch: (branchId) => request(`/api/branches/${encodeURIComponent(branchId)}`, {
            method: 'DELETE'
        }).then((result) => {
            invalidateReferenceCaches(['branches', 'bootstrap', 'sales-references']);
            return result;
        }),
        listUsers: ({ role = '', filter = '', limit = 500, offset = 0 } = {}) => request(`/api/users?role=${encodeURIComponent(role)}&filter=${encodeURIComponent(filter)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`),
        createUser: (payload) => request('/api/users', {
            method: 'POST',
            body: payload
        }),
        updateUser: (userId, payload) => request(`/api/users/${encodeURIComponent(userId)}`, {
            method: 'PUT',
            body: payload
        }),
        deleteUser: (userId) => request(`/api/users/${encodeURIComponent(userId)}`, {
            method: 'DELETE'
        }),
        getSuperBootstrap: () => request('/api/super/bootstrap'),
        getSuperCustomerServiceConfig: () => request('/api/super/customer-service-config'),
        updateSuperCustomerServiceConfig: (payload) => request('/api/super/customer-service-config', {
            method: 'PUT',
            body: payload
        }),
        listSuperCustomerServiceUsers: ({ filter = '' } = {}) => request(
            `/api/super/customer-service-users?filter=${encodeURIComponent(filter)}`
        ),
        createSuperCustomerServiceUser: (payload) => request('/api/super/customer-service-users', {
            method: 'POST',
            body: payload
        }),
        updateSuperCustomerServiceUser: (userId, payload) => request(`/api/super/customer-service-users/${encodeURIComponent(userId)}`, {
            method: 'PUT',
            body: payload
        }),
        deleteSuperCustomerServiceUser: (userId) => request(`/api/super/customer-service-users/${encodeURIComponent(userId)}`, {
            method: 'DELETE'
        }),
        listSuperCompanies: () => request('/api/super/companies'),
        listSuperCustomerRequests: ({ companyId = '', filter = '', status = '', limit = 200 } = {}) => request(
            `/api/super/customer-requests?companyId=${encodeURIComponent(companyId)}&filter=${encodeURIComponent(filter)}&status=${encodeURIComponent(status)}&limit=${encodeURIComponent(limit)}`
        ),
        listSuperCompanyRegistrationRequests: ({ filter = '', status = '', limit = 200 } = {}) => request(
            `/api/super/company-registration-requests?filter=${encodeURIComponent(filter)}&status=${encodeURIComponent(status)}&limit=${encodeURIComponent(limit)}`
        ),
        getSuperCustomerRequestThread: (companyId, requestCode) => request(
            `/api/super/customer-requests/${encodeURIComponent(requestCode)}?companyId=${encodeURIComponent(companyId)}`
        ),
        getSuperCompanyRegistrationRequestThread: (requestCode) => request(
            `/api/super/company-registration-requests/${encodeURIComponent(requestCode)}`
        ),
        updateSuperCustomerRequestByCode: (companyId, requestCode, payload = {}) => request(
            `/api/super/customer-requests/${encodeURIComponent(requestCode)}`,
            {
                method: 'PATCH',
                body: {
                    ...payload,
                    companyId
                }
            }
        ),
        updateSuperCompanyRegistrationRequestByCode: (requestCode, payload = {}) => request(
            `/api/super/company-registration-requests/${encodeURIComponent(requestCode)}`,
            {
                method: 'PATCH',
                body: payload
            }
        ),
        sendSuperCustomerRequestMessage: (companyId, requestCode, payload = {}) => request(
            `/api/super/customer-requests/${encodeURIComponent(requestCode)}/messages`,
            {
                method: 'POST',
                body: {
                    ...payload,
                    companyId
                }
            }
        ),
        sendSuperCompanyRegistrationRequestMessage: (requestCode, payload = {}) => request(
            `/api/super/company-registration-requests/${encodeURIComponent(requestCode)}/messages`,
            {
                method: 'POST',
                body: payload
            }
        ),
        createSuperCompany: (payload) => request('/api/super/companies', {
            method: 'POST',
            body: payload
        }),
        updateSuperCompany: (companyId, payload) => request(`/api/super/companies/${encodeURIComponent(companyId)}`, {
            method: 'PUT',
            body: payload
        }),
        deleteSuperCompany: (companyId) => request(`/api/super/companies/${encodeURIComponent(companyId)}`, {
            method: 'DELETE'
        }),
        startSuperCompanySupportSessionByCode: (companyCode) => request('/api/super/support-session', {
            method: 'POST',
            body: {
                companyCode: String(companyCode || '').trim()
            }
        }),
        startSuperCompanySupportSession: (companyId) => request(`/api/super/companies/${encodeURIComponent(companyId)}/support-session`, {
            method: 'POST'
        }),
        updateSuperCompanyAdminCredentials: (companyId, payload) => request(`/api/super/companies/${encodeURIComponent(companyId)}/admin-credentials`, {
            method: 'PUT',
            body: payload
        }),
        listSuperPlans: () => request('/api/super/plans'),
        createSuperPlan: (payload) => request('/api/super/plans', {
            method: 'POST',
            body: payload
        }),
        updateSuperPlan: (planId, payload) => request(`/api/super/plans/${encodeURIComponent(planId)}`, {
            method: 'PUT',
            body: payload
        }),
        deleteSuperPlan: (planId) => request(`/api/super/plans/${encodeURIComponent(planId)}`, {
            method: 'DELETE'
        }),
        updateSuperCompanySubscription: (companyId, payload) => request(`/api/super/companies/${encodeURIComponent(companyId)}/subscription`, {
            method: 'PUT',
            body: payload
        }),
        updateSuperCompanyAddon: (companyId, addonKey, payload) => request(`/api/super/companies/${encodeURIComponent(companyId)}/addons/${encodeURIComponent(addonKey)}`, {
            method: 'PUT',
            body: payload
        }),
        getSuperCompanyUsage: (companyId, month = '') => request(`/api/super/companies/${encodeURIComponent(companyId)}/usage?month=${encodeURIComponent(month)}`),
        listSuperAuditLogs: ({ companyId = '', limit = 200, offset = 0 } = {}) => request(`/api/super/audit-logs?companyId=${encodeURIComponent(companyId)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`),
        listSuperAccessLogs: ({ filter = '', limit = 200, offset = 0 } = {}) => request(
            `/api/super/access-logs?filter=${encodeURIComponent(filter)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`
        ),
        endSupportSession: () => endActiveSupportSession(),
        syncSupportSessionBanner,
        getUser: (userId) => request(`/api/users/${encodeURIComponent(userId)}`),
        saveUserProfile: (payload) => request(`/api/users/${encodeURIComponent(payload.id)}/profile`, {
            method: 'PUT',
            body: payload
        }),
        listEmployees: (filter = '') => request(`/api/employees?filter=${encodeURIComponent(filter)}`),
        addEmployee: (payload) => request('/api/employees', {
            method: 'POST',
            body: payload
        }),
        updateEmployee: (employeeId, payload) => request(`/api/employees/${encodeURIComponent(employeeId)}`, {
            method: 'PUT',
            body: payload
        }),
        updateEmployeeTime: (employeeId, field, value) => request(`/api/employees/${encodeURIComponent(employeeId)}/schedule`, {
            method: 'PATCH',
            body: { field, value }
        }),
        updateEmployeeSchedule: (employeeId, weeklySchedule) => request(`/api/employees/${encodeURIComponent(employeeId)}/schedule`, {
            method: 'PATCH',
            body: { weeklySchedule }
        }),
        deleteEmployee: (employeeId) => request(`/api/employees/${encodeURIComponent(employeeId)}`, {
            method: 'DELETE'
        }),
        getAttendanceByUser: (userId) => request(`/api/attendance/user/${encodeURIComponent(userId)}`),
        getUserTimeCard: (userId, { year, month }) => request(`/api/attendance/user/${encodeURIComponent(userId)}/time-card?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`),
        getUserWeeklyTimeCard: (userId, { dateKey = '' } = {}) => request(`/api/attendance/user/${encodeURIComponent(userId)}/weekly-card?dateKey=${encodeURIComponent(dateKey)}`),
        getUserCutoffTimeCard: (userId, { dateKey = '' } = {}) => request(`/api/attendance/user/${encodeURIComponent(userId)}/cutoff-card?dateKey=${encodeURIComponent(dateKey)}`),
        getUserCutoffPayrollStatus: (userId, { dateKey = '' } = {}) => request(`/api/attendance/user/${encodeURIComponent(userId)}/cutoff-payroll?dateKey=${encodeURIComponent(dateKey)}`),
        setUserCutoffPayrollStatus: (userId, { dateKey = '', status = '' } = {}) => request(`/api/attendance/user/${encodeURIComponent(userId)}/cutoff-payroll`, {
            method: 'PATCH',
            body: { dateKey, status }
        }),
        getTodayAttendanceRecord: (userId) => request(`/api/attendance/user/${encodeURIComponent(userId)}/today`),
        getAttendanceForMonth: ({ userId, year, month }) => request(`/api/attendance/month?userId=${encodeURIComponent(userId)}&year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`),
        getAttendanceReport: ({ employeeId = 'all', range = 'daily', dateKey = '' }) => request(`/api/attendance/report?employeeId=${encodeURIComponent(employeeId)}&range=${encodeURIComponent(range)}&dateKey=${encodeURIComponent(dateKey)}`),
        getDailyAttendanceSnapshot: (dateKey = '') => request(`/api/attendance/snapshot?dateKey=${encodeURIComponent(dateKey)}`),
        updateDailyAttendanceStatus: (userId, status, dateKey = '') => request(`/api/attendance/status/${encodeURIComponent(userId)}`, {
            method: 'PATCH',
            body: { status, dateKey }
        }),
        recordTimeIn: (userId) => request('/api/attendance/time-in', {
            method: 'POST',
            body: { userId }
        }),
        recordTimeOut: (userId) => request('/api/attendance/time-out', {
            method: 'POST',
            body: { userId }
        })
    };
})();

(function loadAiAssistantWidget() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
    }
    if (window.top && window.top !== window.self) {
        return;
    }
    if (window.GMS_DISABLE_AI_ASSISTANT) {
        return;
    }

    const scriptId = 'gmsAiAssistantScript';
    const loadScript = () => {
        if (document.getElementById(scriptId)) {
            return;
        }
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = '/shared/ai-assistant.js';
        script.defer = true;
        (document.body || document.head).appendChild(script);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadScript);
    } else {
        loadScript();
    }
})();
