const fs = require('fs');
const path = require('path');

function loadEnvFile() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
        return;
    }
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            return;
        }
        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) {
            return;
        }
        const key = trimmed.slice(0, separatorIndex).trim();
        let value = trimmed.slice(separatorIndex + 1).trim();
        if (!key) {
            return;
        }
        if (
            (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined || process.env[key] === '') {
            process.env[key] = value;
        }
    });
}

loadEnvFile();

function isTruthyFlag(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function setEnvIfEmpty(key, value) {
    const normalizedValue = String(value ?? '').trim();
    if (!normalizedValue || (process.env[key] !== undefined && process.env[key] !== '')) {
        return;
    }
    process.env[key] = normalizedValue;
}

function loadLocalRuntimeConfig() {
    const isCloudRuntime = isTruthyFlag(process.env.VERCEL)
        || isTruthyFlag(process.env.RENDER)
        || Boolean(String(process.env.VERCEL_URL || '').trim())
        || Boolean(String(process.env.RENDER_EXTERNAL_HOSTNAME || '').trim());
    if (isCloudRuntime) {
        return;
    }

    const configPath = path.join(__dirname, 'local-runtime.config.json');
    if (!fs.existsSync(configPath)) {
        return;
    }

    let config;
    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
        console.warn(`Unable to read local runtime config: ${error.message}`);
        return;
    }

    setEnvIfEmpty('ATTENDANCE_DB_BACKEND', config.dbBackend || 'sqlite');
    if (config.dataDir) {
        setEnvIfEmpty('ATTENDANCE_DATA_DIR', path.resolve(__dirname, config.dataDir));
    }
    setEnvIfEmpty('ATTENDANCE_BIND_HOST', config.bindHost);
    setEnvIfEmpty('ATTENDANCE_PORT', config.port);
    setEnvIfEmpty('ATTENDANCE_TIME_ZONE', config.timeZone);
    setEnvIfEmpty('ATTENDANCE_TRUST_PROXY', config.trustProxy);
    setEnvIfEmpty('ATTENDANCE_SECURE_COOKIES', config.secureCookies);
    setEnvIfEmpty('ATTENDANCE_AUTO_SEED', '0');
    setEnvIfEmpty('DATABASE_URL', config.databaseUrl);
    setEnvIfEmpty('DATABASE_SSL_MODE', config.databaseSslMode);
    setEnvIfEmpty('ATTENDANCE_PUBLIC_URL', config.publicUrl);
}

loadLocalRuntimeConfig();

function reportStartupError(error) {
    const message = error?.message || String(error);
    console.error('Failed to start Attendance server:', error);
    if (process.versions?.electron) {
        try {
            require('electron').dialog.showErrorBox(
                'GMS ERP Error',
                `GMS ERP failed to start.\n\n${message}`
            );
        } catch (_dialogError) {
            // Fall through to exit below.
        }
    }
}

let store;
let startServer;
let SERVER_CONFIG;

try {
    store = require('./lib/sqlite');
    ({ startServer, SERVER_CONFIG } = require('./lib/http-server'));
} catch (error) {
    reportStartupError(error);
    process.exit(0);
}

let server = null;

console.log(`Starting GMS server on ${SERVER_CONFIG.bindHost}:${SERVER_CONFIG.port}`);

startServer()
    .then((info) => {
        server = info.server;
        console.log('Attendance server is running.');
        console.log(`Local URL: ${info.localUrl}`);
        console.log(`LAN URL:   ${info.lanUrl}`);
        if (Array.isArray(info.lanUrls) && info.lanUrls.length > 1) {
            console.log(`All LAN URLs: ${info.lanUrls.join(', ')}`);
        }
        if (info.publicUrl) {
            console.log(`Public URL: ${info.publicUrl}`);
        }
        if (info.hostnameUrl) {
            console.log(`Host URL: ${info.hostnameUrl}`);
        }
    })
    .catch((error) => {
        reportStartupError(error);
        process.exit(0);
    });

function shutdown(signal) {
    if (server) {
        server.close(() => {
            store.closeAll();
            process.exit(0);
        });
        return;
    }

    store.closeAll();
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

