const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_SERVER_CONFIG = Object.freeze({
    bindHost: '0.0.0.0',
    lanHost: '',
    port: 3000,
    trustProxy: false,
    secureCookies: false
});

function readJsonFile(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_error) {
        return null;
    }
}

function normalizeBoolean(value, fallback = false) {
    if (typeof value === 'boolean') {
        return value;
    }

    const normalizedValue = String(value ?? '').trim().toLowerCase();
    if (!normalizedValue) {
        return fallback;
    }

    if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) {
        return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalizedValue)) {
        return false;
    }

    return fallback;
}

function normalizePort(value, fallback = DEFAULT_SERVER_CONFIG.port) {
    const parsedValue = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsedValue) || parsedValue < 1 || parsedValue > 65535) {
        return fallback;
    }

    return parsedValue;
}

function normalizeHost(value, fallback = '') {
    const normalizedValue = String(value ?? '').trim();
    return normalizedValue || fallback;
}

function normalizeUrl(value) {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) {
        return '';
    }

    try {
        const url = new URL(rawValue);
        url.hash = '';
        return url.toString();
    } catch (_error) {
        return '';
    }
}

function normalizeRemoteUrlList(values = []) {
    const flattenedValues = [];

    values.forEach((value) => {
        if (Array.isArray(value)) {
            flattenedValues.push(...value);
            return;
        }

        flattenedValues.push(value);
    });

    return [...new Set(flattenedValues.map(normalizeUrl).filter(Boolean))];
}

function getProjectConfigPath() {
    return path.join(ROOT_DIR, 'client-config.json');
}

function readProjectRuntimeConfig() {
    const configPath = getProjectConfigPath();
    const fileConfig = readJsonFile(configPath) || {};
    const fileServerConfig = fileConfig.server && typeof fileConfig.server === 'object'
        ? fileConfig.server
        : {};

    const publicUrl = normalizeUrl(process.env.ATTENDANCE_PUBLIC_URL || fileConfig.publicUrl);

    return {
        configPath,
        publicUrl,
        remoteUrls: normalizeRemoteUrlList([
            publicUrl,
            fileConfig.remoteUrls,
            fileConfig.remoteUrl
        ]),
        server: {
            bindHost: normalizeHost(
                process.env.ATTENDANCE_BIND_HOST,
                normalizeHost(fileServerConfig.bindHost, DEFAULT_SERVER_CONFIG.bindHost)
            ),
            lanHost: normalizeHost(
                process.env.ATTENDANCE_LAN_HOST,
                normalizeHost(fileServerConfig.lanHost, DEFAULT_SERVER_CONFIG.lanHost)
            ),
            port: normalizePort(
                process.env.ATTENDANCE_PORT || fileServerConfig.port,
                DEFAULT_SERVER_CONFIG.port
            ),
            trustProxy: normalizeBoolean(
                process.env.ATTENDANCE_TRUST_PROXY,
                normalizeBoolean(fileServerConfig.trustProxy, DEFAULT_SERVER_CONFIG.trustProxy)
            ),
            secureCookies: normalizeBoolean(
                process.env.ATTENDANCE_SECURE_COOKIES,
                normalizeBoolean(fileServerConfig.secureCookies, DEFAULT_SERVER_CONFIG.secureCookies)
            )
        }
    };
}

module.exports = {
    ROOT_DIR,
    DEFAULT_SERVER_CONFIG,
    getProjectConfigPath,
    normalizeRemoteUrlList,
    normalizeUrl,
    readJsonFile,
    readProjectRuntimeConfig
};
