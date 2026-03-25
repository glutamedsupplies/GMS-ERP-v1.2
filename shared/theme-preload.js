(function preloadTenantTheme() {
    const STORAGE_KEY = 'appBrandThemeV1';
    const DEFAULT_PRIMARY_COLOR = '#2575fc';

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

    function applyThemeIdentity(identity = {}) {
        const companyCode = normalizeIdentityToken(identity.companyCode || identity.company_code);
        const shellVariant = normalizeIdentityToken(identity.shellVariant || identity.shell_variant);
        const html = document.documentElement;

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

    function isCachedThemeDisabled() {
        return document.querySelector('meta[name="gms-disable-cached-brand-theme"][content="true"]') !== null;
    }

    function readCachedTheme() {
        try {
            const raw = window.sessionStorage?.getItem(STORAGE_KEY);
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

    function applyTheme(theme, identity = {}) {
        if (!theme || !document.documentElement) {
            return;
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
        applyThemeIdentity(identity);
        ensureThemeColorMeta()?.setAttribute('content', theme.interactionStrong || theme.primaryStrong);
    }

    if (isCachedThemeDisabled()) {
        return;
    }

    const cachedTheme = readCachedTheme();
    if (!cachedTheme) {
        return;
    }

    applyTheme(buildBrandTheme(cachedTheme.primaryColor), cachedTheme);
}());
