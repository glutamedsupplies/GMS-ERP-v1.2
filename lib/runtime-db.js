const { getDatabaseConnectionString } = require('./database-config');

function normalizeMode(value = '') {
    return String(value || '').trim().toLowerCase();
}

function isTruthyFlag(value = '') {
    return ['1', 'true', 'yes', 'on'].includes(normalizeMode(value));
}

function resolveBackendMode() {
    const explicitMode = normalizeMode(process.env.ATTENDANCE_DB_BACKEND || process.env.ATTENDANCE_DB_MODE);
    if (explicitMode === 'postgres' || explicitMode === 'cloud') {
        return 'postgres';
    }
    if (explicitMode === 'sqlite' || explicitMode === 'local') {
        return 'sqlite';
    }

    const isCloudRuntime = isTruthyFlag(process.env.VERCEL)
        || Boolean(String(process.env.VERCEL_URL || '').trim())
        || isTruthyFlag(process.env.RENDER)
        || Boolean(String(process.env.RENDER_EXTERNAL_HOSTNAME || '').trim());

    if (isCloudRuntime && getDatabaseConnectionString()) {
        return 'postgres';
    }

    return 'sqlite';
}

const backendMode = resolveBackendMode();
const Database = backendMode === 'postgres'
    ? require('./postgres-sync')
    : require('./local-sqlite-sync');

Database.BACKEND_MODE = backendMode;

module.exports = Database;
