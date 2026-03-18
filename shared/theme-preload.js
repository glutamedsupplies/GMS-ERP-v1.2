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
        const primaryRgb = rgbTupleToCss(hexToRgb(primary));
        const primaryStrong = mixHexColors(primary, '#ffffff', 0.12);
        const primaryDeep = mixHexColors(primary, '#020617', 0.78);
        const buttonStrong = mixHexColors(primary, '#08111d', 0.32);
        const primarySoft = mixHexColors(primary, '#cbd5e1', 0.36);
        const primarySoftest = mixHexColors(primary, '#e2e8f0', 0.22);
        const text = mixHexColors(primary, '#cbd5e1', 0.82);
        const textStrong = mixHexColors(primary, '#f8fafc', 0.9);
        const muted = mixHexColors(primary, '#94a3b8', 0.78);
        const line = hexToRgba(primarySoftest, 0.18);
        const lineStrong = hexToRgba(primarySoft, 0.3);
        const bg = mixHexColors(primary, '#0b1220', 0.78);
        const bgAlt = mixHexColors(primary, '#111c32', 0.68);
        const panelStrong = hexToRgba(primaryDeep, 0.94);
        const panel = hexToRgba(primaryDeep, 0.8);
        const panelAlt = hexToRgba(primaryDeep, 0.66);
        const sidebarA = mixHexColors(primary, '#11253f', 0.68);
        const sidebarB = mixHexColors(primary, '#020617', 0.82);
        const onPrimary = getReadableTextColor(buttonStrong);
        const success = mixHexColors(primary, '#0f766e', 0.38);
        const danger = '#dc2626';
        const warning = '#d97706';
        const bgStart = mixHexColors(primary, '#08111d', 0.78);
        const bgEnd = mixHexColors(primary, '#13253e', 0.66);

        return {
            primary,
            primaryRgb,
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
                `radial-gradient(circle at 12% 18%, ${hexToRgba(primary, 0.28)} 0%, transparent 36%)`,
                `radial-gradient(circle at 88% 10%, rgba(251, 191, 36, 0.2) 0%, transparent 34%)`,
                `linear-gradient(140deg, ${bgStart} 0%, ${bgEnd} 56%, ${mixHexColors(bgEnd, '#020617', 0.16)} 100%)`
            ].join(', '),
            darkGradient: `linear-gradient(145deg, ${bgStart} 0%, ${bgEnd} 100%)`,
            buttonGradient: `linear-gradient(135deg, ${mixHexColors(primary, '#ffffff', 0.16)} 0%, ${primary} 56%, ${buttonStrong} 100%)`,
            ring: hexToRgba(primary, 0.26),
            glow: hexToRgba(primary, 0.34),
            shadowSoft: '0 22px 52px rgba(2, 6, 23, 0.42)',
            shadow: '0 36px 90px rgba(2, 6, 23, 0.55)',
            successBg: hexToRgba(success, 0.18),
            dangerBg: hexToRgba(danger, 0.16)
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
                primaryColor: normalizeHexColor(parsed.primaryColor, DEFAULT_PRIMARY_COLOR)
            };
        } catch (_error) {
            return null;
        }
    }

    function applyTheme(theme) {
        if (!theme || !document.documentElement) {
            return;
        }

        const rootStyle = document.documentElement.style;
        rootStyle.setProperty('--tenant-primary', theme.primary);
        rootStyle.setProperty('--tenant-primary-rgb', theme.primaryRgb);
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
        rootStyle.setProperty('--accent', theme.primary);
        rootStyle.setProperty('--accent-strong', theme.primaryStrong);
        rootStyle.setProperty('--text', theme.textStrong);
        rootStyle.setProperty('--muted', theme.muted);
        rootStyle.setProperty('--line', theme.line);
        rootStyle.setProperty('--panel', theme.panel);
        rootStyle.setProperty('--bg', theme.bg);
        rootStyle.setProperty('--shadow', theme.shadowSoft);
        rootStyle.setProperty('--bg-start', theme.bgStart);
        rootStyle.setProperty('--bg-end', theme.bgEnd);
        rootStyle.setProperty('--card-bg', hexToRgba(theme.primaryDeep, 0.88));
        rootStyle.setProperty('--card-border', hexToRgba(theme.primarySoft, 0.18));
        rootStyle.setProperty('--input-bg', hexToRgba(theme.primarySoftest, 0.1));
        rootStyle.setProperty('--input-muted', hexToRgba(theme.primarySoftest, 0.08));
        rootStyle.setProperty('--success', theme.success);
        rootStyle.setProperty('--danger', theme.danger);
        rootStyle.setProperty('--success-bg', theme.successBg);
        rootStyle.setProperty('--danger-bg', theme.dangerBg);
        rootStyle.setProperty('--page-gradient', theme.pageGradient);
        rootStyle.setProperty('--button-gradient', theme.buttonGradient);
        ensureThemeColorMeta()?.setAttribute('content', theme.primaryStrong);
    }

    if (isCachedThemeDisabled()) {
        return;
    }

    const cachedTheme = readCachedTheme();
    if (!cachedTheme) {
        return;
    }

    applyTheme(buildBrandTheme(cachedTheme.primaryColor));
}());
