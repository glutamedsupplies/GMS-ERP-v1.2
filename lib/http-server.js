const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const store = require('./sqlite');
const salesStore = require('./sales-store');
const inventoryVariantStore = require('./inventory-variants-store');
const geminiOrderParser = require('./gemini-order-parser');
const { getDatabaseConnectionString } = require('./database-config');
const { ROOT_DIR, readProjectRuntimeConfig } = require('./runtime-config');

const SESSION_COOKIE_NAME = 'attendance_session';
const SESSION_TTL_MS = Math.max(60_000, Number(process.env.ATTENDANCE_SESSION_TTL_MS || 8 * 60 * 60 * 1000));
const LOGIN_WINDOW_MS = Math.max(60_000, Number(process.env.ATTENDANCE_LOGIN_WINDOW_MS || 15 * 60 * 1000));
const LOGIN_MAX_ATTEMPTS = Math.max(1, Number(process.env.ATTENDANCE_LOGIN_MAX_ATTEMPTS || 10));
const PASSWORD_MIN_LENGTH = Math.max(8, Number(process.env.ATTENDANCE_PASSWORD_MIN_LENGTH || 8));
const PASSWORD_MAX_LENGTH = Math.max(PASSWORD_MIN_LENGTH, Number(process.env.ATTENDANCE_PASSWORD_MAX_LENGTH || 128));
const MAX_JSON_BODY_BYTES = Math.max(256 * 1024, Number(process.env.ATTENDANCE_MAX_JSON_BODY_BYTES || 4 * 1024 * 1024));
const SESSION_SECRET = String(
    process.env.ATTENDANCE_SESSION_SECRET
    || process.env.SESSION_SECRET
    || getDatabaseConnectionString()
    || 'attendanceapp-local-session-secret'
).trim();
const RUNTIME_CONFIG = readProjectRuntimeConfig();
const SECURE_COOKIES = RUNTIME_CONFIG.server.secureCookies;
const TRUST_PROXY = RUNTIME_CONFIG.server.trustProxy;
const USER_FEATURE_DEFAULTS = Object.freeze({
    expenses: true,
    order_form: true,
    inventory: true,
    composite: true,
    lbc_tracking: false
});
const FEATURE_LABELS = Object.freeze({
    expenses: 'Expenses',
    order_form: 'Order Form',
    inventory: 'Inventory',
    composite: 'Composite',
    lbc_tracking: 'LBC Tracking'
});
const SERVER_CONFIG = Object.freeze({
    bindHost: RUNTIME_CONFIG.server.bindHost,
    port: RUNTIME_CONFIG.server.port,
    lanHost: RUNTIME_CONFIG.server.lanHost,
    publicUrl: RUNTIME_CONFIG.publicUrl,
    timeZone: RUNTIME_CONFIG.server.timeZone
});
const LBC_AUTO_REFRESH_MINUTES = Math.max(0, Number(process.env.ATTENDANCE_LBC_AUTO_REFRESH_MINUTES || 30));
const LBC_AUTO_REFRESH_INTERVAL_MS = LBC_AUTO_REFRESH_MINUTES > 0
    ? LBC_AUTO_REFRESH_MINUTES * 60 * 1000
    : 0;
const LBC_AUTO_REFRESH_INITIAL_DELAY_MS = Math.max(
    5_000,
    Number(process.env.ATTENDANCE_LBC_AUTO_REFRESH_INITIAL_DELAY_MS || 20_000)
);

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

const loginAttempts = new Map();

function normalizeValue(value) {
    if (Buffer.isBuffer(value)) {
        return value.toString('utf8');
    }

    return value;
}

function serializeUser(user) {
    if (!user) {
        return null;
    }

    const { password: _password, ...rest } = user;

    return {
        ...rest,
        profile_picture: normalizeValue(user.profile_picture)
    };
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

function serializeSessionUser(user) {
    if (!user) {
        return null;
    }

    return {
        id: user.id,
        name: user.name,
        role: user.role,
        company_id: user.company_id || '',
        company_code: user.company_code || '',
        profile_picture: normalizeValue(user.profile_picture),
        feature_access: normalizeUserFeatureAccess(user.feature_access || {}),
        time_zone: store.ATTENDANCE_TIME_ZONE || SERVER_CONFIG.timeZone
    };
}

function serializeAttendanceRow(row) {
    if (!row) {
        return null;
    }

    return {
        ...row,
        avatarUrl: normalizeValue(row.avatarUrl)
    };
}

function serializeAttendanceRows(rows) {
    return rows.map(serializeAttendanceRow);
}

function serializeSnapshot(rows, dateKey) {
    return rows.map((row) => ({
        ...row,
        avatarUrl: normalizeValue(row.avatarUrl),
        displayDate: store.formatDisplayDate(dateKey || row.dateKey || store.getDateKey())
    }));
}

function applySecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    if (SECURE_COOKIES) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
}

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(payload));
}

function sendSuccess(res, data, statusCode = 200) {
    sendJson(res, statusCode, { success: true, data });
}

function sendError(res, statusCode, error, code = 'ERROR') {
    sendJson(res, statusCode, {
        success: false,
        error: String(error || 'Request failed.'),
        code: String(code || 'ERROR')
    });
}

function inferErrorCode(message = '') {
    const normalized = String(message || '').toLowerCase();
    if (normalized.includes('not included in the') || normalized.includes('upgrade')) {
        return 'FEATURE_NOT_INCLUDED';
    }
    if (normalized.includes('monthly invoice limit reached')) {
        return 'LIMIT_INVOICES_REACHED';
    }
    if (normalized.includes('branch limit reached')) {
        return 'LIMIT_BRANCHES_REACHED';
    }
    if (normalized.includes('user limit reached')) {
        return 'LIMIT_USERS_REACHED';
    }
    if (normalized.includes('quota reached')) {
        return 'LIMIT_AI_QUOTA_REACHED';
    }
    if (normalized.includes('forbidden')) {
        return 'FORBIDDEN';
    }
    if (normalized.includes('not found')) {
        return 'NOT_FOUND';
    }
    if (normalized.includes('already in use') || normalized.includes('already exists') || normalized.includes('conflict')) {
        return 'VALIDATION_ERROR';
    }
    if (normalized.includes('required') || normalized.includes('invalid')) {
        return 'VALIDATION_ERROR';
    }
    return 'REQUEST_FAILED';
}

function sendStoreError(res, error, fallbackStatus = 400) {
    const message = String(error?.message || error || 'Request failed.');
    const code = inferErrorCode(message);
    const statusCode = code === 'FORBIDDEN'
        ? 403
        : (code === 'NOT_FOUND'
            ? 404
            : (code === 'VALIDATION_ERROR' ? 400 : fallbackStatus));
    sendError(res, statusCode, message, code);
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let rawBody = '';

        req.on('data', (chunk) => {
            rawBody += chunk;
            if (rawBody.length > MAX_JSON_BODY_BYTES) {
                reject(new Error('Request body is too large.'));
                req.destroy();
            }
        });

        req.on('end', () => {
            if (!rawBody) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(rawBody));
            } catch (_error) {
                reject(new Error('Invalid JSON body.'));
            }
        });

        req.on('error', reject);
    });
}

function validateRequired(value, fieldName) {
    if (!String(value || '').trim()) {
        throw new Error(`${fieldName} is required.`);
    }
}

function validatePasswordPolicy(password, { required = true } = {}) {
    const normalizedPassword = String(password || '').trim();

    if (!normalizedPassword) {
        if (required) {
            throw new Error('Password is required.');
        }

        return '';
    }

    if (normalizedPassword.length < PASSWORD_MIN_LENGTH) {
        throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    }

    if (normalizedPassword.length > PASSWORD_MAX_LENGTH) {
        throw new Error(`Password must not exceed ${PASSWORD_MAX_LENGTH} characters.`);
    }

    return normalizedPassword;
}

function listLanHosts() {
    const hosts = [];
    const interfaces = os.networkInterfaces();

    Object.values(interfaces).forEach((entries) => {
        (entries || []).forEach((entry) => {
            if (!entry || entry.internal || entry.family !== 'IPv4') {
                return;
            }

            hosts.push(entry.address);
        });
    });

    const uniqueHosts = [...new Set(hosts)];
    if (SERVER_CONFIG.lanHost) {
        return [SERVER_CONFIG.lanHost, ...uniqueHosts.filter((host) => host !== SERVER_CONFIG.lanHost)];
    }

    return uniqueHosts;
}

function getServerInfoPayload() {
    const lanHosts = listLanHosts();
    const hostname = os.hostname();
    const hostnameUrl = hostname ? `http://${hostname}:${SERVER_CONFIG.port}/` : '';
    const lanUrls = lanHosts.map((host) => `http://${host}:${SERVER_CONFIG.port}/`);
    const lanUrl = lanUrls[0] || hostnameUrl || `http://127.0.0.1:${SERVER_CONFIG.port}/`;

    return {
        dateKey: store.getDateKey(),
        port: SERVER_CONFIG.port,
        lanHost: lanHosts[0] || '',
        lanHosts,
        lanUrl,
        lanUrls,
        publicUrl: SERVER_CONFIG.publicUrl,
        timeZone: store.ATTENDANCE_TIME_ZONE || SERVER_CONFIG.timeZone,
        hostname,
        hostnameUrl,
        dataRoot: store.activeDataRoot || store.paths?.dataRoot || '',
        usersDbPath: store.paths?.users || '',
        attendanceDbPath: store.paths?.attendance || '',
        aiOrderParsingConfigured: geminiOrderParser.isAiOrderParserConfigured()
    };
}

function readClientConfigPayload() {
    const runtimeConfig = readProjectRuntimeConfig();

    return {
        configPath: path.relative(ROOT_DIR, runtimeConfig.configPath).replace(/\\/g, '/'),
        publicUrl: runtimeConfig.publicUrl,
        remoteUrls: runtimeConfig.remoteUrls,
        remoteUrlCount: runtimeConfig.remoteUrls.length,
        server: runtimeConfig.server
    };
}

function parseCookies(headerValue = '') {
    return String(headerValue || '')
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .reduce((cookies, part) => {
            const separatorIndex = part.indexOf('=');
            if (separatorIndex === -1) {
                return cookies;
            }

            const key = part.slice(0, separatorIndex).trim();
            const value = part.slice(separatorIndex + 1).trim();
            cookies[key] = decodeURIComponent(value);
            return cookies;
        }, {});
}

function appendSetCookie(res, value) {
    const existing = res.getHeader('Set-Cookie');
    if (!existing) {
        res.setHeader('Set-Cookie', value);
        return;
    }

    if (Array.isArray(existing)) {
        res.setHeader('Set-Cookie', [...existing, value]);
        return;
    }

    res.setHeader('Set-Cookie', [existing, value]);
}

function buildSessionCookie(token) {
    const parts = [
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
    ];

    if (SECURE_COOKIES) {
        parts.push('Secure');
    }

    return parts.join('; ');
}

function buildExpiredSessionCookie() {
    const parts = [
        `${SESSION_COOKIE_NAME}=`,
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        'Max-Age=0'
    ];

    if (SECURE_COOKIES) {
        parts.push('Secure');
    }

    return parts.join('; ');
}

function clearSessionCookie(res) {
    appendSetCookie(res, buildExpiredSessionCookie());
}

function cleanupExpiredSessions() {
    return null;
}

function createSessionSignature(encodedPayload) {
    return crypto
        .createHmac('sha256', SESSION_SECRET)
        .update(String(encodedPayload || ''))
        .digest('base64url');
}

function createSessionToken(payload) {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encodedPayload}.${createSessionSignature(encodedPayload)}`;
}

function verifySessionToken(token = '') {
    const parts = String(token || '').split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return null;
    }

    const [encodedPayload, providedSignature] = parts;
    const expectedSignature = createSessionSignature(encodedPayload);
    const providedBuffer = Buffer.from(providedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
        if (!payload || typeof payload !== 'object') {
            return null;
        }
        if (Number(payload.expiresAt || 0) <= Date.now()) {
            return null;
        }
        return payload;
    } catch (_error) {
        return null;
    }
}

function cleanupExpiredLoginAttempts(now = Date.now()) {
    for (const [key, value] of loginAttempts.entries()) {
        if (!value) {
            loginAttempts.delete(key);
            continue;
        }

        const expiredWindow = now - value.firstFailureAt > LOGIN_WINDOW_MS;
        const expiredBlock = !value.blockedUntil || value.blockedUntil <= now;
        if (expiredWindow && expiredBlock) {
            loginAttempts.delete(key);
        }
    }
}

function createSession(user) {
    return createSessionToken({
        userKey: user.user_key || '',
        username: user.id,
        companyId: user.company_id || '',
        role: user.role,
        expiresAt: Date.now() + SESSION_TTL_MS
    });
}

function invalidateSession() {
    return null;
}

function getClientIp(req) {
    if (TRUST_PROXY) {
        const forwarded = String(req.headers['x-forwarded-for'] || '')
            .split(',')[0]
            .trim();

        if (forwarded) {
            return forwarded;
        }
    }

    return req.socket.remoteAddress || 'unknown';
}

function getLoginAttemptState(key, now = Date.now()) {
    const state = loginAttempts.get(key);
    if (!state) {
        return null;
    }

    if (state.blockedUntil && state.blockedUntil > now) {
        return state;
    }

    if (now - state.firstFailureAt > LOGIN_WINDOW_MS) {
        loginAttempts.delete(key);
        return null;
    }

    return state;
}

function recordLoginFailure(key) {
    const now = Date.now();
    const currentState = getLoginAttemptState(key, now);
    const nextState = currentState || {
        count: 0,
        firstFailureAt: now,
        blockedUntil: 0
    };

    nextState.count += 1;
    if (nextState.count >= LOGIN_MAX_ATTEMPTS) {
        nextState.blockedUntil = now + LOGIN_WINDOW_MS;
    }

    loginAttempts.set(key, nextState);
    return nextState;
}

function clearLoginFailures(key) {
    loginAttempts.delete(key);
}

function getRequestSession(req, res) {
    cleanupExpiredSessions();
    cleanupExpiredLoginAttempts();

    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token) {
        return null;
    }

    const session = verifySessionToken(token);
    if (!session) {
        invalidateSession(token);
        clearSessionCookie(res);
        return null;
    }

    let user = null;
    try {
        if (session.companyId) {
            user = store.runWithTenantContextByCompany(session.companyId, () => store.getUserById(session.username));
        } else {
            user = store.getUserById(session.username);
        }
    } catch (_error) {
        user = null;
    }

    if (!user) {
        invalidateSession(token);
        clearSessionCookie(res);
        return null;
    }

    let company = null;
    if (session.companyId) {
        company = store.getCompanyById(session.companyId) || null;
    }

    return {
        token,
        userKey: session.userKey || '',
        userId: user.id,
        username: user.id,
        companyId: user.company_id || session.companyId || '',
        companyCode: company?.company_code || '',
        role: user.role,
        user
    };
}

function isHeadAdmin(session) {
    return Boolean(store.isCompanyAdminRole(session?.role));
}

function isStaff(session) {
    return String(session?.role || '').toLowerCase() === String(store.ROLE_STAFF || 'staff').toLowerCase();
}

function isSuperAdmin(session) {
    return String(session?.role || '').toLowerCase() === 'super_admin';
}

function requireSession(res, session) {
    if (!session) {
        sendError(res, 401, 'Authentication required.', 'UNAUTHENTICATED');
        return false;
    }

    return true;
}

function requireHeadAdmin(res, session) {
    if (!requireSession(res, session)) {
        return false;
    }

    if (!isHeadAdmin(session)) {
        sendError(res, 403, 'Forbidden.', 'FORBIDDEN');
        return false;
    }

    return true;
}

function requireHeadAdminOrStaff(res, session) {
    if (!requireSession(res, session)) {
        return false;
    }

    if (isHeadAdmin(session) || isStaff(session)) {
        return true;
    }

    sendError(res, 403, 'Forbidden.', 'FORBIDDEN');
    return false;
}

function requireHeadAdminOrFeatureAccess(res, session, featureKey) {
    if (isHeadAdmin(session)) {
        return true;
    }

    return requireFeatureAccess(res, session, featureKey);
}

function requireHeadAdminOrAnyFeatureAccess(res, session, featureKeys = []) {
    if (isHeadAdmin(session)) {
        return true;
    }

    return requireAnyFeatureAccess(res, session, featureKeys);
}

function requireSuperAdmin(res, session) {
    if (!requireSession(res, session)) {
        return false;
    }

    if (!isSuperAdmin(session)) {
        sendError(res, 403, 'Forbidden.', 'FORBIDDEN');
        return false;
    }

    return true;
}

function requireSelfOrHeadAdmin(res, session, userId) {
    if (!requireSession(res, session)) {
        return false;
    }

    if (isHeadAdmin(session) || String(session.userId) === String(userId)) {
        return true;
    }

    sendError(res, 403, 'Forbidden.', 'FORBIDDEN');
    return false;
}

function requireSelf(res, session, userId) {
    if (!requireSession(res, session)) {
        return false;
    }

    if (String(session.userId) === String(userId)) {
        return true;
    }

    sendError(res, 403, 'Forbidden.', 'FORBIDDEN');
    return false;
}

function requireTenantSession(res, session) {
    if (!requireSession(res, session)) {
        return false;
    }

    if (!session.companyId) {
        sendError(res, 403, 'Tenant context is required.', 'TENANT_REQUIRED');
        return false;
    }

    return true;
}

function runInTenantContext(session, fn) {
    if (!session?.companyId) {
        return fn();
    }

    return store.runWithTenantContextByCompany(session.companyId, () => {
        const context = store.getCurrentContext();
        if (context) {
            context.requestUserId = session.userId;
            context.actorUserId = session.userId;
        }
        return fn();
    });
}

function hasUserFeatureAccess(session, featureKey) {
    if (isSuperAdmin(session)) {
        return true;
    }

    const key = String(featureKey || '').trim().toLowerCase();
    if (!key) {
        return true;
    }

    const access = normalizeUserFeatureAccess(session?.user?.feature_access || {});
    return Boolean(access[key]);
}

function requireFeatureAccess(res, session, featureKey) {
    if (!requireSession(res, session)) {
        return false;
    }

    if (hasUserFeatureAccess(session, featureKey)) {
        return true;
    }

    const label = FEATURE_LABELS[String(featureKey || '').trim().toLowerCase()] || 'This feature';
    sendError(res, 403, `${label} is not allowed for your account. Contact your administrator.`, 'FORBIDDEN');
    return false;
}

function requireAnyFeatureAccess(res, session, featureKeys = []) {
    if (!requireSession(res, session)) {
        return false;
    }

    if (isSuperAdmin(session)) {
        return true;
    }

    const normalizedKeys = Array.isArray(featureKeys)
        ? featureKeys.map((key) => String(key || '').trim().toLowerCase()).filter(Boolean)
        : [];
    if (!normalizedKeys.length) {
        return true;
    }

    if (normalizedKeys.some((key) => hasUserFeatureAccess(session, key))) {
        return true;
    }

    const labels = normalizedKeys
        .map((key) => FEATURE_LABELS[key] || key)
        .filter(Boolean);
    const message = labels.length > 1
        ? `At least one of these features is required: ${labels.join(', ')}.`
        : `${labels[0] || 'This feature'} is not allowed for your account.`;
    sendError(res, 403, `${message} Contact your administrator.`, 'FORBIDDEN');
    return false;
}

function requireModuleAccess(res, session, moduleKey) {
    if (isSuperAdmin(session)) {
        return true;
    }

    if (!requireTenantSession(res, session)) {
        return false;
    }

    try {
        runInTenantContext(session, () => store.assertModuleAccess(moduleKey));
        return true;
    } catch (error) {
        sendStoreError(res, error, 403);
        return false;
    }
}

function requireInvoiceCreationAccess(res, session) {
    if (isSuperAdmin(session)) {
        return true;
    }

    if (!requireTenantSession(res, session)) {
        return false;
    }

    try {
        runInTenantContext(session, () => {
            store.assertModuleAccess('invoicing');
            store.assertInvoiceLimit();
        });
        return true;
    } catch (error) {
        sendStoreError(res, error, 403);
        return false;
    }
}

function requireAiReaderAccess(res, session) {
    if (isSuperAdmin(session)) {
        return true;
    }

    if (!requireTenantSession(res, session)) {
        return false;
    }

    try {
        runInTenantContext(session, () => store.assertAiAccess());
        return true;
    } catch (error) {
        sendStoreError(res, error, 403);
        return false;
    }
}

function normalizeCompanyCode(value = '') {
    return String(value || '').trim().toLowerCase();
}

function isGmsOrGwdCompanyCode(value = '') {
    const companyCode = normalizeCompanyCode(value);
    return companyCode === 'default'
        || companyCode === 'gms'
        || companyCode === 'gms-erp'
        || companyCode === 'gmserp'
        || companyCode === 'gwd'
        || companyCode === 'gwd-erp'
        || companyCode === 'gwderp';
}

function listAutoRefreshEligibleCompanies() {
    return store.listCompanies()
        .filter((row) => String(row.status || '').toLowerCase() === 'active')
        .filter((row) => isGmsOrGwdCompanyCode(row.company_code))
        .map((row) => ({
            id: row.id,
            name: row.name,
            company_code: row.company_code
        }));
}

function requireGmsOrGwdCompany(res, session) {
    if (isSuperAdmin(session)) {
        return true;
    }

    const companyCode = normalizeCompanyCode(session?.companyCode || session?.user?.company_code || '');
    if (isGmsOrGwdCompanyCode(companyCode)) {
        return true;
    }

    sendError(res, 403, 'LBC Tracking is available for GMS/GWD company only.', 'FORBIDDEN');
    return false;
}

function resolvePublicCompany(req, companyCode = '') {
    const company = store.getCompanyByCodeOrHost(companyCode, req.headers.host || '');
    const status = String(company?.status || '').toLowerCase();
    if (!company || status !== 'active') {
        throw new Error('Company not found.');
    }

    return company;
}

function resolveSuperAdminCompany(companyId = '') {
    const normalizedCompanyId = String(companyId || '').trim();
    validateRequired(normalizedCompanyId, 'Company');
    const company = store.getCompanyById(normalizedCompanyId);
    if (!company) {
        throw new Error('Company not found.');
    }
    return company;
}

async function handleApiRequest(req, res, urlObject, contextReady = false) {
    const pathname = urlObject.pathname;
    const searchParams = urlObject.searchParams;
    const session = getRequestSession(req, res);
    const tenantContextOptionalPaths = new Set([
        '/api/server-info',
        '/api/public-branding',
        '/api/session',
        '/api/login',
        '/api/logout',
        '/api/client-config'
    ]);

    if (
        !contextReady
        && session?.companyId
        && !pathname.startsWith('/api/super/')
        && !tenantContextOptionalPaths.has(pathname)
    ) {
        return runInTenantContext(session, () => handleApiRequest(req, res, urlObject, true));
    }

    if (req.method === 'GET' && pathname === '/api/server-info') {
        sendSuccess(res, getServerInfoPayload());
        return;
    }

    if (req.method === 'GET' && pathname === '/api/public-branding') {
        sendSuccess(res, store.getPublicBranding({
            companyCode: searchParams.get('companyCode') || '',
            host: req.headers.host || ''
        }));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/public/customer-requests') {
        const body = await readJsonBody(req);
        const companyCode = String(body.companyCode || body.company_code || searchParams.get('companyCode') || '').trim();
        const company = resolvePublicCompany(req, companyCode);

        const payload = store.runWithTenantContextByCompany(company.id, () => store.createCustomerRequest({
            clientName: String(body.clientName || body.name || '').trim(),
            contactNumber: String(body.contactNumber || body.contact_number || '').trim(),
            requestDetails: body.requestDetails ?? body.requestedChanges ?? body.details ?? '',
            initialMessage: body.initialMessage ?? body.message ?? '',
            source: 'customer_portal'
        }));

        sendSuccess(res, {
            ...payload,
            companyCode: company.company_code || '',
            companyName: company.name || ''
        }, 201);
        return;
    }

    const publicCustomerRequestMessageMatch = pathname.match(/^\/api\/public\/customer-requests\/([^/]+)\/messages$/);
    if (publicCustomerRequestMessageMatch && req.method === 'POST') {
        const body = await readJsonBody(req);
        const companyCode = String(body.companyCode || body.company_code || searchParams.get('companyCode') || '').trim();
        const company = resolvePublicCompany(req, companyCode);
        const authContactNumber = String(
            body.authContactNumber
            || body.contactNumber
            || body.contact_number
            || searchParams.get('contactNumber')
            || ''
        ).trim();
        validateRequired(authContactNumber, 'Contact number');

        const payload = store.runWithTenantContextByCompany(company.id, () => store.addCustomerRequestMessageByCode(
            decodeURIComponent(publicCustomerRequestMessageMatch[1]),
            {
                senderName: String(body.senderName || body.clientName || '').trim(),
                message: body.message ?? body.text ?? '',
                source: 'customer_portal'
            },
            {
                actor: 'customer',
                contactNumber: authContactNumber
            }
        ));

        sendSuccess(res, {
            ...payload,
            companyCode: company.company_code || '',
            companyName: company.name || ''
        });
        return;
    }

    const publicCustomerRequestMatch = pathname.match(/^\/api\/public\/customer-requests\/([^/]+)$/);
    if (publicCustomerRequestMatch && req.method === 'GET') {
        const companyCode = String(searchParams.get('companyCode') || '').trim();
        const company = resolvePublicCompany(req, companyCode);
        const authContactNumber = String(searchParams.get('contactNumber') || '').trim();
        validateRequired(authContactNumber, 'Contact number');

        const payload = store.runWithTenantContextByCompany(company.id, () => store.getCustomerRequestThreadByCode(
            decodeURIComponent(publicCustomerRequestMatch[1]),
            { contactNumber: authContactNumber }
        ));

        sendSuccess(res, {
            ...payload,
            companyCode: company.company_code || '',
            companyName: company.name || ''
        });
        return;
    }

    if (publicCustomerRequestMatch && req.method === 'PUT') {
        const body = await readJsonBody(req);
        const companyCode = String(body.companyCode || body.company_code || searchParams.get('companyCode') || '').trim();
        const company = resolvePublicCompany(req, companyCode);
        const authContactNumber = String(
            body.authContactNumber
            || body.currentContactNumber
            || body.contactNumberForAuth
            || searchParams.get('contactNumber')
            || body.contactNumber
            || body.contact_number
            || ''
        ).trim();
        validateRequired(authContactNumber, 'Contact number');

        const payload = store.runWithTenantContextByCompany(company.id, () => store.updateCustomerRequestByCode(
            decodeURIComponent(publicCustomerRequestMatch[1]),
            {
                clientName: body.clientName ?? body.name,
                contactNumber: body.contactNumber ?? body.contact_number,
                requestDetails: body.requestDetails ?? body.requestedChanges ?? body.details
            },
            {
                actor: 'customer',
                contactNumber: authContactNumber
            }
        ));

        sendSuccess(res, {
            ...payload,
            companyCode: company.company_code || '',
            companyName: company.name || ''
        });
        return;
    }

    if (req.method === 'GET' && pathname === '/api/session') {
        sendSuccess(res, session ? serializeSessionUser({
            ...session.user,
            company_code: session.companyCode || ''
        }) : null);
        return;
    }

    if (req.method === 'POST' && pathname === '/api/logout') {
        if (session?.token) {
            invalidateSession(session.token);
        }

        clearSessionCookie(res);
        sendSuccess(res, { loggedOut: true });
        return;
    }

    if (req.method === 'POST' && pathname === '/api/login') {
        const clientIp = getClientIp(req);
        const attemptState = getLoginAttemptState(clientIp);
        if (attemptState?.blockedUntil && attemptState.blockedUntil > Date.now()) {
            const retryAfterSeconds = Math.max(1, Math.ceil((attemptState.blockedUntil - Date.now()) / 1000));
            res.setHeader('Retry-After', String(retryAfterSeconds));
            sendError(res, 429, 'Too many failed login attempts. Please try again later.', 'RATE_LIMITED');
            return;
        }

        const body = await readJsonBody(req);
        const username = String(body.username || body.id || '').trim();
        const companyCode = String(body.companyCode || body.company_code || '').trim();
        validateRequired(username, 'Username');
        validateRequired(body.password, 'Password');

        const user = store.getUserByCredentials({
            companyCode,
            username,
            password: String(body.password || '').trim(),
            host: req.headers.host || ''
        });
        if (!user) {
            recordLoginFailure(clientIp);
            sendError(res, 401, 'Invalid credentials.', 'INVALID_CREDENTIALS');
            return;
        }

        clearLoginFailures(clientIp);
        if (session?.token) {
            invalidateSession(session.token);
        }

        appendSetCookie(res, buildSessionCookie(createSession(user)));
        sendSuccess(res, serializeSessionUser(user));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/bootstrap') {
        if (!requireSession(res, session)) {
            return;
        }

        if (isSuperAdmin(session)) {
            sendSuccess(res, {
                user: serializeSessionUser(session.user),
                role: store.ROLE_SUPER_ADMIN,
                superAdmin: true,
                branding: { ...store.PARENT_BRAND }
            });
            return;
        }

        if (!requireTenantSession(res, session)) {
            return;
        }

        const tenantBootstrap = runInTenantContext(session, () => store.getTenantBootstrap(session.userId));
        sendSuccess(res, {
            ...tenantBootstrap,
            aiOrderParserProviders: geminiOrderParser.getConfiguredAiOrderParserProviders(),
            aiOrderParserProviderStatus: geminiOrderParser.getAiOrderParserProviderStatus()
        });
        return;
    }

    if (req.method === 'GET' && pathname === '/api/super/bootstrap') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        sendSuccess(res, store.getSuperAdminBootstrap());
        return;
    }

    if (req.method === 'GET' && pathname === '/api/super/companies') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        sendSuccess(res, store.listCompanies());
        return;
    }

    if (req.method === 'GET' && pathname === '/api/super/customer-requests') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        const company = resolveSuperAdminCompany(
            searchParams.get('companyId')
            || searchParams.get('company_id')
            || ''
        );
        const payload = store.runWithTenantContextByCompany(company.id, () => store.listCustomerRequests({
            filter: searchParams.get('filter') || '',
            status: searchParams.get('status') || '',
            limit: searchParams.get('limit') || 200
        }));
        sendSuccess(res, payload);
        return;
    }

    const superCustomerRequestMessageMatch = pathname.match(/^\/api\/super\/customer-requests\/([^/]+)\/messages$/);
    if (superCustomerRequestMessageMatch && req.method === 'POST') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        const company = resolveSuperAdminCompany(
            body.companyId
            || body.company_id
            || searchParams.get('companyId')
            || searchParams.get('company_id')
            || ''
        );
        const payload = store.runWithTenantContextByCompany(company.id, () => store.addCustomerRequestMessageByCode(
            decodeURIComponent(superCustomerRequestMessageMatch[1]),
            {
                senderName: String(body.senderName || session?.user?.name || session?.userId || 'Super Admin').trim(),
                message: body.message ?? body.text ?? '',
                source: 'super_admin_panel'
            },
            { actor: 'admin' }
        ));
        sendSuccess(res, payload);
        return;
    }

    const superCustomerRequestMatch = pathname.match(/^\/api\/super\/customer-requests\/([^/]+)$/);
    if (superCustomerRequestMatch && req.method === 'GET') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        const company = resolveSuperAdminCompany(
            searchParams.get('companyId')
            || searchParams.get('company_id')
            || ''
        );
        const payload = store.runWithTenantContextByCompany(company.id, () => store.getCustomerRequestThreadByCode(
            decodeURIComponent(superCustomerRequestMatch[1])
        ));
        sendSuccess(res, payload);
        return;
    }

    if (superCustomerRequestMatch && req.method === 'PATCH') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        const company = resolveSuperAdminCompany(
            body.companyId
            || body.company_id
            || searchParams.get('companyId')
            || searchParams.get('company_id')
            || ''
        );
        const payload = store.runWithTenantContextByCompany(company.id, () => store.updateCustomerRequestByCode(
            decodeURIComponent(superCustomerRequestMatch[1]),
            {
                clientName: body.clientName ?? body.name,
                contactNumber: body.contactNumber ?? body.contact_number,
                requestDetails: body.requestDetails ?? body.requestedChanges ?? body.details,
                status: body.status,
                allowCustomerEdit: body.allowCustomerEdit ?? body.allow_customer_edit
            },
            { actor: 'admin' }
        ));
        sendSuccess(res, payload);
        return;
    }

    if (req.method === 'POST' && pathname === '/api/super/companies') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        sendSuccess(res, store.createCompany({
            name: body.name,
            companyCode: body.company_code || body.companyCode,
            subdomain: body.subdomain,
            customDomain: body.custom_domain || body.customDomain,
            planId: body.plan_id || body.planId,
            logoPath: body.logo_path || body.logoPath,
            primaryColor: body.primary_color || body.primaryColor,
            appName: body.app_name || body.appName,
            defaultBranchName: body.default_branch_name || body.defaultBranchName,
            defaultBranchAddress: body.default_branch_address || body.defaultBranchAddress,
            adminUsername: body.admin_username || body.adminUsername,
            adminName: body.admin_name || body.adminName,
            adminPassword: body.admin_password || body.adminPassword,
            addons: body.addons
        }), 201);
        return;
    }

    const superCompanyMatch = pathname.match(/^\/api\/super\/companies\/([^/]+)$/);
    if (superCompanyMatch && req.method === 'PUT') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }
        const body = await readJsonBody(req);
        sendSuccess(res, store.updateCompanyById(decodeURIComponent(superCompanyMatch[1]), body));
        return;
    }
    if (superCompanyMatch && req.method === 'DELETE') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }
        sendSuccess(res, store.deleteCompanyById(decodeURIComponent(superCompanyMatch[1])));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/super/plans') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }
        sendSuccess(res, store.listPlans());
        return;
    }

    if (req.method === 'POST' && pathname === '/api/super/plans') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }
        const body = await readJsonBody(req);
        sendSuccess(res, store.createPlan(body), 201);
        return;
    }

    const superPlanMatch = pathname.match(/^\/api\/super\/plans\/([^/]+)$/);
    if (superPlanMatch && req.method === 'PUT') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }
        const body = await readJsonBody(req);
        sendSuccess(res, store.updatePlan(decodeURIComponent(superPlanMatch[1]), body));
        return;
    }
    if (superPlanMatch && req.method === 'DELETE') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }
        sendSuccess(res, store.deletePlan(decodeURIComponent(superPlanMatch[1])));
        return;
    }

    const superCompanySubscriptionMatch = pathname.match(/^\/api\/super\/companies\/([^/]+)\/subscription$/);
    if (superCompanySubscriptionMatch && req.method === 'PUT') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }
        const body = await readJsonBody(req);
        sendSuccess(res, store.setCompanySubscription(decodeURIComponent(superCompanySubscriptionMatch[1]), body));
        return;
    }

    const superCompanyAddonMatch = pathname.match(/^\/api\/super\/companies\/([^/]+)\/addons\/([^/]+)$/);
    if (superCompanyAddonMatch && req.method === 'PUT') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }
        const body = await readJsonBody(req);
        sendSuccess(res, store.upsertCompanyAddon(
            decodeURIComponent(superCompanyAddonMatch[1]),
            decodeURIComponent(superCompanyAddonMatch[2]),
            body
        ));
        return;
    }

    const superCompanyAdminCredentialsMatch = pathname.match(/^\/api\/super\/companies\/([^/]+)\/admin-credentials$/);
    if (superCompanyAdminCredentialsMatch && req.method === 'PUT') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }
        const body = await readJsonBody(req);
        sendSuccess(res, store.updateCompanyAdminCredentials(
            decodeURIComponent(superCompanyAdminCredentialsMatch[1]),
            body
        ));
        return;
    }

    const superCompanyUsageMatch = pathname.match(/^\/api\/super\/companies\/([^/]+)\/usage$/);
    if (superCompanyUsageMatch && req.method === 'GET') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }
        const monthKey = String(searchParams.get('month') || '').trim() || store.getMonthKey();
        sendSuccess(res, store.getCompanyUsage(decodeURIComponent(superCompanyUsageMatch[1]), monthKey));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/super/audit-logs') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }
        sendSuccess(res, store.listAuditLogs({
            companyId: searchParams.get('companyId') || '',
            limit: searchParams.get('limit') || 200,
            offset: searchParams.get('offset') || 0
        }));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/company/settings') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        sendSuccess(res, store.getCompanySettings());
        return;
    }

    if (req.method === 'PUT' && pathname === '/api/company/settings') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        const body = await readJsonBody(req);
        sendSuccess(res, store.updateCompanySettings(body));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/company/workspace-config') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        sendSuccess(res, store.getCompanyWorkspaceConfig());
        return;
    }

    if (req.method === 'PUT' && pathname === '/api/company/workspace-config') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        const body = await readJsonBody(req);
        sendSuccess(res, store.updateCompanyWorkspaceConfig(body));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/company/invoice-template') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        sendSuccess(res, store.getInvoiceTemplate());
        return;
    }

    if (req.method === 'PUT' && pathname === '/api/company/invoice-template') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        const body = await readJsonBody(req);
        sendSuccess(res, store.updateInvoiceTemplate(body));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/branches') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        sendSuccess(res, store.listBranches());
        return;
    }

    if (req.method === 'POST' && pathname === '/api/branches') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        const body = await readJsonBody(req);
        sendSuccess(res, store.addBranch({
            branchName: body.branch_name || body.branchName || body.name,
            address: body.address || ''
        }), 201);
        return;
    }

    const branchMatch = pathname.match(/^\/api\/branches\/([^/]+)$/);
    if (branchMatch && req.method === 'PUT') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        const body = await readJsonBody(req);
        sendSuccess(res, store.updateBranch(decodeURIComponent(branchMatch[1]), body));
        return;
    }

    if (branchMatch && req.method === 'DELETE') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        sendSuccess(res, store.deleteBranch(decodeURIComponent(branchMatch[1])));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/users') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }

        const role = searchParams.get('role') || '';
        const filter = searchParams.get('filter') || '';
        sendSuccess(res, store.listUsers(role, filter).map(serializeUser));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/users') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        sendSuccess(res, serializeUser(store.addUser({
            id: String(body.id || body.username || '').trim(),
            username: String(body.username || body.id || '').trim(),
            name: String(body.name || body.display_name || '').trim(),
            password: validatePasswordPolicy(body.password, { required: true }),
            role: String(body.role || '').trim() || 'employee',
            branchId: String(body.branch_id || body.branchId || '').trim(),
            branchName: String(body.branch_name || body.branchName || '').trim(),
            is_active: body.is_active,
            timeIn: String(body.timeIn || body.time_in || '').trim(),
            timeOut: String(body.timeOut || body.time_out || '').trim(),
            weeklySchedule: body.weeklySchedule ?? body.weekly_schedule ?? body.schedule ?? body.schedule_json,
            feature_access: normalizeUserFeatureAccess(body.feature_access || body.featureAccess || {})
        })), 201);
        return;
    }

    if (req.method === 'GET' && pathname === '/api/employees') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }

        const filter = searchParams.get('filter') || '';
        const attendanceUsers = store.listUsers('', filter).filter((user) => {
            const normalizedRole = String(user?.role || '').trim().toLowerCase();
            if (!normalizedRole) {
                return true;
            }
            if (normalizedRole === String(store.ROLE_SUPER_ADMIN || 'super_admin').toLowerCase()) {
                return false;
            }
            return !store.isCompanyAdminRole(normalizedRole);
        });
        sendSuccess(res, attendanceUsers.map(serializeUser));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/clients') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }

        const filter = searchParams.get('filter') || '';
        sendSuccess(res, {
            items: store.listClients(filter),
            filter
        });
        return;
    }

    if (req.method === 'GET' && pathname === '/api/client-config') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }

        sendSuccess(res, readClientConfigPayload());
        return;
    }

    if (req.method === 'POST' && pathname === '/api/employees') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        validateRequired(body.id, 'Employee ID');
        validateRequired(body.name, 'Employee name');

        store.addEmployee({
            id: String(body.id).trim(),
            name: String(body.name).trim(),
            password: validatePasswordPolicy(body.password, { required: true }),
            timeIn: String(body.timeIn || '').trim() || '08:00',
            timeOut: String(body.timeOut || '').trim() || '17:00',
            weeklySchedule: body.weeklySchedule ?? body.weekly_schedule ?? body.schedule ?? body.schedule_json
        });

        sendSuccess(res, serializeUser(store.getUserById(String(body.id).trim())), 201);
        return;
    }

    if (req.method === 'POST' && pathname === '/api/clients') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }

        const body = await readJsonBody(req);
        validateRequired(body.name, 'Client name');
        validateRequired(body.contactNumber, 'Contact number');

        const client = store.addClient({
            name: String(body.name).trim(),
            contactNumber: String(body.contactNumber).trim(),
            source: 'manual'
        });

        sendSuccess(res, client, client.action === 'updated' ? 200 : 201);
        return;
    }

    const clientMatch = pathname.match(/^\/api\/clients\/([^/]+)$/);
    if (clientMatch && req.method === 'PUT') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }

        const body = await readJsonBody(req);
        validateRequired(body.name, 'Client name');
        validateRequired(body.contactNumber, 'Contact number');

        sendSuccess(res, store.updateClient(
            decodeURIComponent(clientMatch[1]),
            {
                name: String(body.name).trim(),
                contactNumber: String(body.contactNumber).trim(),
                source: 'manual'
            }
        ));
        return;
    }

    if (clientMatch && req.method === 'DELETE') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }

        sendSuccess(res, store.deleteClient(decodeURIComponent(clientMatch[1])));
        return;
    }

    if (
        pathname === '/api/customer-requests'
        || /^\/api\/customer-requests\/[^/]+(?:\/messages)?$/.test(pathname)
    ) {
        if (!requireSession(res, session)) {
            return;
        }
        sendError(res, 403, 'Customer chat inbox is available in Super Admin only.');
        return;
    }

    if (req.method === 'GET' && pathname === '/api/sales/references') {
        if (!requireHeadAdminOrAnyFeatureAccess(res, session, ['order_form', 'expenses'])) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }

        sendSuccess(res, salesStore.getReferenceData());
        return;
    }

    if (req.method === 'POST' && pathname === '/api/order-form/ai-parse') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!requireAiReaderAccess(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        validateRequired(body.rawText, 'Order text');

        const parsed = await geminiOrderParser.parseOrderDraftWithAi({
            rawText: String(body.rawText || ''),
            localParse: body.localParse || null,
            references: salesStore.getReferenceData(),
            inventoryVariants: inventoryVariantStore.listInventoryVariants()
        });
        if (!isSuperAdmin(session)) {
            runInTenantContext(session, () => {
                store.recordAiRead();
            });
        }
        sendSuccess(res, parsed);
        return;
    }

    if (req.method === 'GET' && pathname === '/api/products') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'inventory')) {
            return;
        }

        const filter = searchParams.get('filter') || '';
        sendSuccess(res, salesStore.listProducts(filter));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/inventory-variants') {
        if (!requireHeadAdminOrAnyFeatureAccess(res, session, ['inventory', 'order_form'])) {
            return;
        }
        if (!requireModuleAccess(res, session, 'inventory')) {
            return;
        }
        if (!requireAnyFeatureAccess(res, session, ['inventory', 'order_form'])) {
            return;
        }

        sendSuccess(res, inventoryVariantStore.listInventoryVariants({
            productName: searchParams.get('productName') || '',
            setName: searchParams.get('setName') || '',
            search: searchParams.get('search') || ''
        }));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/inventory-variants') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'inventory')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'inventory')) {
            return;
        }

        const body = await readJsonBody(req);
        sendSuccess(res, inventoryVariantStore.createInventoryVariant(body), 201);
        return;
    }

    if (req.method === 'POST' && pathname === '/api/inventory-variants/import') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'inventory')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'inventory')) {
            return;
        }

        const body = await readJsonBody(req);
        sendSuccess(res, inventoryVariantStore.importInventoryVariantsFromCsv({
            filePath: String(body.filePath || '').trim()
        }));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/inventory-variants/products') {
        if (!requireHeadAdminOrAnyFeatureAccess(res, session, ['inventory', 'order_form'])) {
            return;
        }
        if (!requireModuleAccess(res, session, 'inventory')) {
            return;
        }
        if (!requireAnyFeatureAccess(res, session, ['inventory', 'order_form'])) {
            return;
        }

        sendSuccess(res, inventoryVariantStore.listInventoryProductNames());
        return;
    }

    if (req.method === 'GET' && pathname === '/api/inventory-variants/sets') {
        if (!requireHeadAdminOrAnyFeatureAccess(res, session, ['inventory', 'order_form'])) {
            return;
        }
        if (!requireModuleAccess(res, session, 'inventory')) {
            return;
        }
        if (!requireAnyFeatureAccess(res, session, ['inventory', 'order_form'])) {
            return;
        }

        sendSuccess(res, inventoryVariantStore.listInventorySetsByProduct(searchParams.get('productName') || ''));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/inventory-variants/resolve') {
        if (!requireHeadAdminOrAnyFeatureAccess(res, session, ['inventory', 'order_form'])) {
            return;
        }
        if (!requireModuleAccess(res, session, 'inventory')) {
            return;
        }
        if (!requireAnyFeatureAccess(res, session, ['inventory', 'order_form'])) {
            return;
        }

        sendSuccess(res, inventoryVariantStore.resolveInventoryVariant({
            productName: searchParams.get('productName') || '',
            setName: searchParams.get('setName') || ''
        }));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/inventory') {
        if (!requireHeadAdminOrAnyFeatureAccess(res, session, ['inventory', 'order_form'])) {
            return;
        }
        if (!requireModuleAccess(res, session, 'inventory')) {
            return;
        }
        if (!requireAnyFeatureAccess(res, session, ['inventory', 'order_form'])) {
            return;
        }

        const branch = searchParams.get('branch') || '';
        const filter = searchParams.get('filter') || '';
        sendSuccess(res, salesStore.listInventory({ branch, filter }));
        return;
    }

    const inventoryItemMatch = pathname.match(/^\/api\/inventory-items\/([^/]+)$/);
    if (inventoryItemMatch && req.method === 'PATCH') {
        if (!requireHeadAdminOrStaff(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'inventory')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'inventory')) {
            return;
        }

        const inventoryId = decodeURIComponent(inventoryItemMatch[1]);
        const body = await readJsonBody(req);
        validateRequired(body.inventoryUnit ?? body.inventory_unit, 'Unit');
        validateRequired(body.itemType ?? body.item_type, 'Type');

        sendSuccess(res, salesStore.updateInventoryItem({
            inventoryId,
            inventoryUnit: body.inventoryUnit ?? body.inventory_unit,
            itemType: body.itemType ?? body.item_type
        }));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/composite-items') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'composite')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'inventory')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'composite')) {
            return;
        }

        const filter = searchParams.get('filter') || '';
        sendSuccess(res, salesStore.listCompositeItems(filter));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/composite-items') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'inventory')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'composite')) {
            return;
        }

        const body = await readJsonBody(req);
        sendSuccess(res, salesStore.upsertCompositeItem(body), 201);
        return;
    }

    const compositeItemMatch = pathname.match(/^\/api\/composite-items\/([^/]+)$/);
    if (compositeItemMatch && req.method === 'DELETE') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'inventory')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'composite')) {
            return;
        }

        sendSuccess(res, salesStore.deleteCompositeItem(
            decodeURIComponent(compositeItemMatch[1])
        ));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/sales') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }

        sendSuccess(res, salesStore.listSales({
            dateFrom: searchParams.get('dateFrom') || '',
            dateTo: searchParams.get('dateTo') || '',
            branch: searchParams.get('branch') || '',
            cashBranch: searchParams.get('cashBranch') || '',
            paymentOption: searchParams.get('paymentOption') || '',
            adminName: searchParams.get('adminName') || '',
            salesRepresentative: searchParams.get('salesRepresentative') || '',
            search: searchParams.get('search') || ''
        }));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/sales') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!requireInvoiceCreationAccess(res, session)) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'order_form')) {
            return;
        }

        const body = await readJsonBody(req);
        const entry = salesStore.addSaleEntry(body);
        if (!isSuperAdmin(session)) {
            runInTenantContext(session, () => {
                store.recordInvoiceCreated();
            });
        }
        sendSuccess(res, entry, 201);
        return;
    }

    if (req.method === 'GET' && pathname === '/api/lbc-tracking') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'lbc_tracking')) {
            return;
        }
        if (!requireTenantSession(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }
        if (!requireGmsOrGwdCompany(res, session)) {
            return;
        }

        sendSuccess(res, salesStore.listLbcTracking({
            branch: searchParams.get('branch') || '',
            search: searchParams.get('search') || '',
            deliveryStatus: searchParams.get('deliveryStatus') || '',
            quickFilter: searchParams.get('quickFilter') || searchParams.get('quick_filter') || ''
        }));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/lbc-tracking/collections') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'lbc_tracking')) {
            return;
        }
        if (!requireTenantSession(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }
        if (!requireGmsOrGwdCompany(res, session)) {
            return;
        }

        sendSuccess(res, salesStore.listLbcCollections({
            branch: searchParams.get('branch') || '',
            search: searchParams.get('search') || '',
            status: searchParams.get('status') || ''
        }));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/lbc-tracking/bulk-assign') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'lbc_tracking')) {
            return;
        }
        if (!requireTenantSession(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }
        if (!requireGmsOrGwdCompany(res, session)) {
            return;
        }
        if (!requireSession(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        sendSuccess(res, salesStore.bulkAssignLbcTracking({
            branch: body.branch ?? body.selectedBranch ?? '',
            items: body.items ?? body.entries ?? body.trackingItems ?? [],
            requestUserId: session.userId || session.user?.id || '',
            requestUserName: session.user?.name || session.username || '',
            requestRole: session.role || '',
            enforceAssignedUser: false
        }));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/lbc-tracking/refresh') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'lbc_tracking')) {
            return;
        }
        if (!requireTenantSession(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }
        if (!requireGmsOrGwdCompany(res, session)) {
            return;
        }
        if (!requireSession(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        sendSuccess(res, salesStore.refreshLbcTrackingStatuses({
            branch: body.branch ?? body.selectedBranch ?? '',
            requestUserId: session.userId || session.user?.id || '',
            requestUserName: session.user?.name || session.username || '',
            requestRole: session.role || '',
            enforceAssignedUser: false
        }));
        return;
    }

    const lbcCollectionConfirmMatch = pathname.match(/^\/api\/lbc-tracking\/collections\/([^/]+)\/confirm$/);
    if (lbcCollectionConfirmMatch && req.method === 'POST') {
        if (!isSuperAdmin(session) && !requireHeadAdmin(res, session)) {
            return;
        }
        if (!requireTenantSession(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }
        if (!requireGmsOrGwdCompany(res, session)) {
            return;
        }
        if (!requireSession(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        sendSuccess(res, salesStore.setLbcCollectionStatus(
            decodeURIComponent(lbcCollectionConfirmMatch[1]),
            {
                collectionStatus: body.collectionStatus ?? body.collection_status ?? body.status ?? 'Confirmed',
                requestUserId: session.userId || session.user?.id || '',
                requestUserName: session.user?.name || session.username || '',
                requestRole: session.role || '',
                enforceAssignedUser: false
            }
        ));
        return;
    }

    const lbcTrackingMatch = pathname.match(/^\/api\/lbc-tracking\/([^/]+)$/);
    if (lbcTrackingMatch && req.method === 'PUT') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'lbc_tracking')) {
            return;
        }
        if (!requireTenantSession(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }
        if (!requireGmsOrGwdCompany(res, session)) {
            return;
        }
        if (!requireSession(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        const payload = {
            requestUserId: session.userId || session.user?.id || '',
            requestUserName: session.user?.name || session.username || '',
            requestRole: session.role || '',
            enforceAssignedUser: false
        };
        if (body && typeof body === 'object') {
            if (Object.prototype.hasOwnProperty.call(body, 'trackingNumber') || Object.prototype.hasOwnProperty.call(body, 'tracking_number')) {
                payload.trackingNumber = body.trackingNumber ?? body.tracking_number;
            }
            if (Object.prototype.hasOwnProperty.call(body, 'amountToCollect') || Object.prototype.hasOwnProperty.call(body, 'amount_to_collect')) {
                payload.amountToCollect = body.amountToCollect ?? body.amount_to_collect;
            }
            if (
                Object.prototype.hasOwnProperty.call(body, 'deliveryStatus')
                || Object.prototype.hasOwnProperty.call(body, 'delivery_status')
                || Object.prototype.hasOwnProperty.call(body, 'status')
            ) {
                payload.deliveryStatus = body.deliveryStatus ?? body.delivery_status ?? body.status;
            }
            if (Object.prototype.hasOwnProperty.call(body, 'dateMonitored') || Object.prototype.hasOwnProperty.call(body, 'date_monitored')) {
                payload.dateMonitored = body.dateMonitored ?? body.date_monitored;
            }
        }
        sendSuccess(res, salesStore.updateLbcTracking(
            decodeURIComponent(lbcTrackingMatch[1]),
            payload
        ));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/expenses') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'expenses')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'expenses')) {
            return;
        }

        sendSuccess(res, salesStore.listExpenses({
            dateFrom: searchParams.get('dateFrom') || '',
            dateTo: searchParams.get('dateTo') || '',
            branch: searchParams.get('branch') || '',
            search: searchParams.get('search') || ''
        }));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/expenses') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'expenses')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'expenses')) {
            return;
        }

        const body = await readJsonBody(req);
        const entry = salesStore.addExpenseEntry(body);
        sendSuccess(res, entry, 201);
        return;
    }

    if (req.method === 'DELETE' && pathname === '/api/expenses') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'expenses')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'expenses')) {
            return;
        }

        sendSuccess(res, salesStore.clearExpenseEntries());
        return;
    }

    const expenseMatch = pathname.match(/^\/api\/expenses\/([^/]+)$/);
    if (expenseMatch && req.method === 'PUT') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'expenses')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'expenses')) {
            return;
        }

        const body = await readJsonBody(req);
        sendSuccess(res, salesStore.updateExpenseEntry(
            decodeURIComponent(expenseMatch[1]),
            body
        ));
        return;
    }

    if (expenseMatch && req.method === 'DELETE') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'expenses')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'expenses')) {
            return;
        }

        sendSuccess(res, salesStore.deleteExpenseEntry(
            decodeURIComponent(expenseMatch[1])
        ));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/cash-income') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'expenses')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'expenses')) {
            return;
        }

        sendSuccess(res, salesStore.listCashIncome({
            dateFrom: searchParams.get('dateFrom') || '',
            dateTo: searchParams.get('dateTo') || '',
            branch: searchParams.get('branch') || '',
            search: searchParams.get('search') || ''
        }));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/cash-income') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'expenses')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'expenses')) {
            return;
        }

        const body = await readJsonBody(req);
        const entry = salesStore.addCashIncomeEntry(body);
        sendSuccess(res, entry, 201);
        return;
    }

    if (req.method === 'DELETE' && pathname === '/api/cash-income') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'expenses')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'expenses')) {
            return;
        }

        sendSuccess(res, salesStore.clearCashIncomeEntries());
        return;
    }

    const cashIncomeMatch = pathname.match(/^\/api\/cash-income\/([^/]+)$/);
    if (cashIncomeMatch && req.method === 'PUT') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'expenses')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'expenses')) {
            return;
        }

        const body = await readJsonBody(req);
        sendSuccess(res, salesStore.updateCashIncomeEntry(
            decodeURIComponent(cashIncomeMatch[1]),
            body
        ));
        return;
    }

    if (cashIncomeMatch && req.method === 'DELETE') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'expenses')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'expenses')) {
            return;
        }

        sendSuccess(res, salesStore.deleteCashIncomeEntry(
            decodeURIComponent(cashIncomeMatch[1])
        ));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/orders/next-number') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'invoicing')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'order_form')) {
            return;
        }

        sendSuccess(res, salesStore.previewNextOrderNumber(searchParams.get('saleDate') || ''));
        return;
    }

    const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (orderMatch && req.method === 'GET') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'invoicing')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'order_form')) {
            return;
        }

        sendSuccess(res, salesStore.getSaleOrder(
            decodeURIComponent(orderMatch[1])
        ));
        return;
    }

    if (orderMatch && req.method === 'PUT') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'invoicing')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'order_form')) {
            return;
        }

        const body = await readJsonBody(req);
        sendSuccess(res, salesStore.updateSaleOrder(
            decodeURIComponent(orderMatch[1]),
            body
        ));
        return;
    }

    if (orderMatch && req.method === 'DELETE') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'invoicing')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'order_form')) {
            return;
        }

        sendSuccess(res, salesStore.deleteSaleOrder(
            decodeURIComponent(orderMatch[1])
        ));
        return;
    }

    const inventoryMatch = pathname.match(/^\/api\/inventory\/(.+)$/);
    if (inventoryMatch && req.method === 'PATCH') {
        if (!requireHeadAdminOrStaff(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'inventory')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'inventory')) {
            return;
        }

        const helper = decodeURIComponent(inventoryMatch[1]);
        const body = await readJsonBody(req);
        validateRequired(body.branch, 'Branch');
        const hasExpirationDateOverride = Object.prototype.hasOwnProperty.call(body, 'expirationDate')
            || Object.prototype.hasOwnProperty.call(body, 'expiration_date')
            || Boolean(body.hasExpirationDateOverride);

        const row = salesStore.updateInventoryQuantity({
            branch: String(body.branch).trim(),
            inventoryId: helper,
            quantity: body.quantity,
            adjustmentType: body.adjustmentType,
            adjustmentQuantity: body.adjustmentQuantity,
            expirationDate: body.expirationDate ?? body.expiration_date,
            hasExpirationDateOverride
        });

        sendSuccess(res, row);
        return;
    }

    if (inventoryMatch && req.method === 'DELETE') {
        if (!requireHeadAdminOrStaff(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'inventory')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'inventory')) {
            return;
        }

        const helper = decodeURIComponent(inventoryMatch[1]);
        const branch = String(searchParams.get('branch') || '').trim();
        validateRequired(branch, 'Branch');
        sendSuccess(res, salesStore.deleteInventoryItem({
            branch,
            inventoryId: helper
        }));
        return;
    }

    const inventoryVariantMatch = pathname.match(/^\/api\/inventory-variants\/([^/]+)$/);
    if (inventoryVariantMatch && req.method === 'PUT') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'inventory')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'inventory')) {
            return;
        }

        const body = await readJsonBody(req);
        sendSuccess(res, inventoryVariantStore.updateInventoryVariant(
            decodeURIComponent(inventoryVariantMatch[1]),
            body
        ));
        return;
    }

    if (inventoryVariantMatch && req.method === 'DELETE') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'inventory')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'inventory')) {
            return;
        }

        sendSuccess(res, inventoryVariantStore.deleteInventoryVariant(
            decodeURIComponent(inventoryVariantMatch[1])
        ));
        return;
    }

    const employeeMatch = pathname.match(/^\/api\/employees\/([^/]+)$/);
    if (employeeMatch && req.method === 'PUT') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }

        const employeeId = decodeURIComponent(employeeMatch[1]);
        const body = await readJsonBody(req);
        validateRequired(body.name, 'Employee name');

        store.updateEmployee({
            id: employeeId,
            name: String(body.name).trim(),
            password: validatePasswordPolicy(body.password, { required: false }),
            timeIn: String(body.timeIn || '').trim() || '08:00',
            timeOut: String(body.timeOut || '').trim() || '17:00',
            weeklySchedule: body.weeklySchedule ?? body.weekly_schedule ?? body.schedule ?? body.schedule_json
        });

        sendSuccess(res, serializeUser(store.getUserById(employeeId)));
        return;
    }

    if (employeeMatch && req.method === 'DELETE') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }

        const employeeId = decodeURIComponent(employeeMatch[1]);
        store.deleteEmployee(employeeId);
        sendSuccess(res, { deleted: true });
        return;
    }

    const employeeScheduleMatch = pathname.match(/^\/api\/employees\/([^/]+)\/schedule$/);
    if (employeeScheduleMatch && req.method === 'PATCH') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }

        const employeeId = decodeURIComponent(employeeScheduleMatch[1]);
        const body = await readJsonBody(req);
        const hasWeeklySchedule = Object.prototype.hasOwnProperty.call(body, 'weeklySchedule')
            || Object.prototype.hasOwnProperty.call(body, 'weekly_schedule')
            || Object.prototype.hasOwnProperty.call(body, 'schedule')
            || Object.prototype.hasOwnProperty.call(body, 'schedule_json');
        if (hasWeeklySchedule) {
            const weeklySchedule = body.weeklySchedule ?? body.weekly_schedule ?? body.schedule ?? body.schedule_json;
            store.updateEmployeeSchedule(employeeId, 'weekly_schedule', weeklySchedule);
        } else {
            validateRequired(body.field, 'Schedule field');
            validateRequired(body.value, 'Schedule value');
            store.updateEmployeeSchedule(employeeId, String(body.field).trim(), String(body.value).trim());
        }
        sendSuccess(res, serializeUser(store.getUserById(employeeId)));
        return;
    }

    const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
    if (userMatch && req.method === 'PUT') {
        const userId = decodeURIComponent(userMatch[1]);
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        const hasNameOverride = Object.prototype.hasOwnProperty.call(body, 'name')
            || Object.prototype.hasOwnProperty.call(body, 'display_name');
        const hasRoleOverride = Object.prototype.hasOwnProperty.call(body, 'role');
        const hasBranchIdOverride = Object.prototype.hasOwnProperty.call(body, 'branch_id')
            || Object.prototype.hasOwnProperty.call(body, 'branchId');
        const hasBranchNameOverride = Object.prototype.hasOwnProperty.call(body, 'branch_name')
            || Object.prototype.hasOwnProperty.call(body, 'branchName');
        const hasActiveOverride = Object.prototype.hasOwnProperty.call(body, 'is_active');
        const hasTimeInOverride = Object.prototype.hasOwnProperty.call(body, 'timeIn')
            || Object.prototype.hasOwnProperty.call(body, 'time_in');
        const hasTimeOutOverride = Object.prototype.hasOwnProperty.call(body, 'timeOut')
            || Object.prototype.hasOwnProperty.call(body, 'time_out');
        const hasWeeklyScheduleOverride = Object.prototype.hasOwnProperty.call(body, 'weeklySchedule')
            || Object.prototype.hasOwnProperty.call(body, 'weekly_schedule')
            || Object.prototype.hasOwnProperty.call(body, 'schedule')
            || Object.prototype.hasOwnProperty.call(body, 'schedule_json');
        const hasFeatureAccessOverride = Object.prototype.hasOwnProperty.call(body, 'feature_access')
            || Object.prototype.hasOwnProperty.call(body, 'featureAccess');
        const featureAccessPayload = hasFeatureAccessOverride
            ? (body.feature_access ?? body.featureAccess)
            : undefined;
        const weeklySchedulePayload = hasWeeklyScheduleOverride
            ? (body.weeklySchedule ?? body.weekly_schedule ?? body.schedule ?? body.schedule_json)
            : undefined;
        sendSuccess(res, serializeUser(store.updateUser(userId, {
            name: hasNameOverride ? String(body.name || body.display_name || '').trim() : undefined,
            role: hasRoleOverride ? String(body.role || '').trim() : undefined,
            password: validatePasswordPolicy(body.password, { required: false }),
            branchId: hasBranchIdOverride ? String(body.branch_id || body.branchId || '').trim() : undefined,
            branchName: hasBranchNameOverride ? String(body.branch_name || body.branchName || '').trim() : undefined,
            is_active: hasActiveOverride ? body.is_active : undefined,
            timeIn: hasTimeInOverride ? String(body.timeIn || body.time_in || '').trim() : undefined,
            timeOut: hasTimeOutOverride ? String(body.timeOut || body.time_out || '').trim() : undefined,
            weeklySchedule: hasWeeklyScheduleOverride ? weeklySchedulePayload : undefined,
            feature_access: hasFeatureAccessOverride
                ? featureAccessPayload
                : undefined
        })));
        return;
    }

    if (userMatch && req.method === 'DELETE') {
        const userId = decodeURIComponent(userMatch[1]);
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }

        sendSuccess(res, store.deleteUser(userId));
        return;
    }

    if (userMatch && req.method === 'GET') {
        const userId = decodeURIComponent(userMatch[1]);
        if (!requireSelfOrHeadAdmin(res, session, userId)) {
            return;
        }

        const user = store.getUserById(userId);
        if (!user) {
            sendError(res, 404, 'User not found.', 'NOT_FOUND');
            return;
        }

        sendSuccess(res, serializeUser(user));
        return;
    }

    const userProfileMatch = pathname.match(/^\/api\/users\/([^/]+)\/profile$/);
    if (userProfileMatch && req.method === 'PUT') {
        const userId = decodeURIComponent(userProfileMatch[1]);
        if (!requireSelf(res, session, userId)) {
            return;
        }

        const body = await readJsonBody(req);
        validateRequired(body.name, 'Full name');

        store.saveUserProfile({
            id: userId,
            name: String(body.name).trim(),
            password: validatePasswordPolicy(body.password, { required: false }),
            profilePicture: body.profilePicture || null
        });

        sendSuccess(res, serializeUser(store.getUserById(userId)));
        return;
    }

    const attendanceUserMatch = pathname.match(/^\/api\/attendance\/user\/([^/]+)$/);
    if (attendanceUserMatch && req.method === 'GET') {
        if (!requireModuleAccess(res, session, 'attendance')) {
            return;
        }
        const userId = decodeURIComponent(attendanceUserMatch[1]);
        if (!requireSelfOrHeadAdmin(res, session, userId)) {
            return;
        }

        sendSuccess(res, serializeAttendanceRows(store.getAttendanceByUser(userId)));
        return;
    }

    const attendanceUserTimeCardMatch = pathname.match(/^\/api\/attendance\/user\/([^/]+)\/time-card$/);
    if (attendanceUserTimeCardMatch && req.method === 'GET') {
        if (!requireModuleAccess(res, session, 'attendance')) {
            return;
        }
        const userId = decodeURIComponent(attendanceUserTimeCardMatch[1]);
        if (!requireSelfOrHeadAdmin(res, session, userId)) {
            return;
        }

        const year = Number(searchParams.get('year')) || new Date().getFullYear();
        const month = Number(searchParams.get('month')) || (new Date().getMonth() + 1);

        sendSuccess(res, serializeAttendanceRows(store.getUserTimeCard(userId, year, month)));
        return;
    }

    const attendanceUserWeeklyCardMatch = pathname.match(/^\/api\/attendance\/user\/([^/]+)\/weekly-card$/);
    if (attendanceUserWeeklyCardMatch && req.method === 'GET') {
        if (!requireModuleAccess(res, session, 'attendance')) {
            return;
        }
        const userId = decodeURIComponent(attendanceUserWeeklyCardMatch[1]);
        if (!requireSelfOrHeadAdmin(res, session, userId)) {
            return;
        }

        const dateKey = searchParams.get('dateKey') || store.getDateKey();

        sendSuccess(res, serializeAttendanceRows(store.getUserWeeklyTimeCard(userId, dateKey)));
        return;
    }

    const attendanceUserTodayMatch = pathname.match(/^\/api\/attendance\/user\/([^/]+)\/today$/);
    if (attendanceUserTodayMatch && req.method === 'GET') {
        if (!requireModuleAccess(res, session, 'attendance')) {
            return;
        }
        const userId = decodeURIComponent(attendanceUserTodayMatch[1]);
        if (!requireSelfOrHeadAdmin(res, session, userId)) {
            return;
        }

        sendSuccess(res, serializeAttendanceRow(store.findAttendanceRecord(userId)));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/attendance/month') {
        if (!requireModuleAccess(res, session, 'attendance')) {
            return;
        }
        const userId = searchParams.get('userId') || '';
        if (!requireSelfOrHeadAdmin(res, session, userId)) {
            return;
        }

        const year = Number(searchParams.get('year'));
        const month = Number(searchParams.get('month'));

        validateRequired(userId, 'User ID');
        if (!year || !month) {
            throw new Error('Year and month are required.');
        }

        sendSuccess(res, serializeAttendanceRows(store.getAttendanceForMonth(userId, year, month)));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/attendance/snapshot') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'reports')) {
            return;
        }

        const dateKey = searchParams.get('dateKey') || store.getDateKey();
        sendSuccess(res, serializeSnapshot(store.getDailyAttendanceSnapshot(dateKey), dateKey));
        return;
    }

    const attendanceStatusMatch = pathname.match(/^\/api\/attendance\/status\/([^/]+)$/);
    if (attendanceStatusMatch && req.method === 'PATCH') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'attendance')) {
            return;
        }

        const userId = decodeURIComponent(attendanceStatusMatch[1]);
        const body = await readJsonBody(req);
        validateRequired(body.status, 'Attendance status');

        const dateKey = String(body.dateKey || '').trim() || store.getDateKey();
        const updatedRow = store.setDailyAttendanceStatus(userId, String(body.status).trim(), dateKey);
        sendSuccess(res, serializeAttendanceRow(updatedRow));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/attendance/report') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'reports')) {
            return;
        }

        const employeeId = searchParams.get('employeeId') || 'all';
        const range = searchParams.get('range') || 'daily';
        const dateKey = searchParams.get('dateKey') || '';

        if (range === 'daily' && dateKey) {
            const rows = store.getDailyAttendanceSnapshot(dateKey)
                .filter((row) => employeeId === 'all' || row.id === employeeId)
                .map((row) => ({
                    ...row,
                    displayDate: store.formatDisplayDate(dateKey)
                }));

            sendSuccess(res, serializeSnapshot(rows, dateKey));
            return;
        }

        sendSuccess(res, serializeAttendanceRows(store.getAttendanceReport({ employeeId, range, dateKey })));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/attendance/time-in') {
        if (!requireSession(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'attendance')) {
            return;
        }

        const body = await readJsonBody(req);
        const requestedUserId = String(body.userId || '').trim();
        const targetUserId = isHeadAdmin(session) ? requestedUserId : session.userId;

        validateRequired(targetUserId, 'User ID');
        if (!isHeadAdmin(session) && requestedUserId && requestedUserId !== session.userId) {
            sendError(res, 403, 'Forbidden.');
            return;
        }

        const result = store.recordTimeIn(targetUserId);
        sendSuccess(res, {
            user: serializeUser(result.user),
            time: result.time,
            status: result.status,
            record: serializeAttendanceRow(result.record)
        });
        return;
    }

    if (req.method === 'POST' && pathname === '/api/attendance/time-out') {
        if (!requireSession(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'attendance')) {
            return;
        }

        const body = await readJsonBody(req);
        const requestedUserId = String(body.userId || '').trim();
        const targetUserId = isHeadAdmin(session) ? requestedUserId : session.userId;

        validateRequired(targetUserId, 'User ID');
        if (!isHeadAdmin(session) && requestedUserId && requestedUserId !== session.userId) {
            sendError(res, 403, 'Forbidden.');
            return;
        }

        const result = store.recordTimeOut(targetUserId);
        sendSuccess(res, {
            user: serializeUser(result.user),
            time: result.time,
            workedHours: result.workedHours,
            record: serializeAttendanceRow(result.record)
        });
        return;
    }

    sendError(res, 404, 'API route not found.');
}

function normalizePublicPathname(pathname) {
    const decodedPathname = decodeURI(String(pathname || '/'));
    const normalizedPathname = path.posix.normalize(decodedPathname);

    if (!normalizedPathname || normalizedPathname === '.') {
        return '/';
    }

    return normalizedPathname.startsWith('/') ? normalizedPathname : `/${normalizedPathname}`;
}

function isAllowedPublicPath(pathname) {
    const blockedPrefixes = ['/employee/data/', '/head_admin/data/', '/data/'];
    const blockedExtensions = ['.db', '.db-wal', '.db-shm'];
    const allowedRootFiles = new Set(['/', '/index.html', '/logo.png', '/Signature_JHV.png', '/manifest.webmanifest', '/service-worker.js']);

    if (blockedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
        return false;
    }

    if (blockedExtensions.some((extension) => pathname.endsWith(extension))) {
        return false;
    }

    if (allowedRootFiles.has(pathname)) {
        return true;
    }

    return ['/renderer/', '/employee/', '/head_admin/', '/super_admin/', '/shared/', '/assets/'].some((prefix) => pathname.startsWith(prefix));
}

async function serveStaticFile(res, pathname) {
    const normalizedPublicPath = normalizePublicPathname(pathname);

    if (!isAllowedPublicPath(normalizedPublicPath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
    }

    const normalizedPath = normalizedPublicPath === '/' ? '/index.html' : normalizedPublicPath;
    const absolutePath = path.resolve(ROOT_DIR, `.${normalizedPath}`);

    if (!absolutePath.startsWith(ROOT_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    try {
        let filePath = absolutePath;
        const fileStat = await fs.promises.stat(filePath);
        if (fileStat.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }

        const extension = path.extname(filePath).toLowerCase();
        const fileContents = await fs.promises.readFile(filePath);
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        res.end(fileContents);
    } catch (_error) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
    }
}

function createRequestListener() {
    return (req, res) => {
        applySecurityHeaders(res);

        const urlObject = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

        Promise.resolve()
            .then(async () => {
                if (urlObject.pathname.startsWith('/api/')) {
                    await handleApiRequest(req, res, urlObject);
                    return;
                }

                await serveStaticFile(res, urlObject.pathname);
            })
            .catch((error) => {
                console.error('HTTP server error:', error);
                if (!res.headersSent) {
                    sendStoreError(res, error, 500);
                }
            });
    };
}

function createLbcAutoRefreshJob() {
    if (!LBC_AUTO_REFRESH_INTERVAL_MS) {
        return {
            start() {},
            stop() {}
        };
    }

    let intervalHandle = null;
    let startupHandle = null;
    let tickInProgress = false;

    const runTick = async () => {
        if (tickInProgress) {
            return;
        }

        tickInProgress = true;
        const startedAt = Date.now();
        let eligibleCompaniesCount = 0;
        let refreshedCompaniesCount = 0;
        let skippedModuleCount = 0;
        let checkedCount = 0;
        let changedCount = 0;
        let skippedCount = 0;

        try {
            const companies = listAutoRefreshEligibleCompanies();
            eligibleCompaniesCount = companies.length;

            for (const company of companies) {
                try {
                    const refreshResult = store.runWithTenantContextByCompany(company.id, () => {
                        const context = store.getCurrentContext();
                        if (!context?.modules?.sales) {
                            return null;
                        }

                        return salesStore.refreshLbcTrackingStatuses({
                            requestUserId: 'system:lbc-auto-refresh',
                            requestUserName: 'System Auto Refresh',
                            requestRole: 'system'
                        });
                    });

                    if (!refreshResult) {
                        skippedModuleCount += 1;
                        continue;
                    }

                    refreshedCompaniesCount += 1;
                    checkedCount += Number(refreshResult.checkedCount || 0);
                    changedCount += Number(refreshResult.changedCount || 0);
                    skippedCount += Number(refreshResult.skippedCount || 0);
                } catch (error) {
                    skippedCount += 1;
                    console.error(`[LBC Auto Refresh] Failed for company ${company.id}:`, error);
                }
            }
        } catch (error) {
            console.error('[LBC Auto Refresh] Tick failed:', error);
        } finally {
            tickInProgress = false;
            const elapsedMs = Date.now() - startedAt;
            if (eligibleCompaniesCount || refreshedCompaniesCount || checkedCount || changedCount || skippedCount) {
                console.log(
                    `[LBC Auto Refresh] ${elapsedMs}ms | eligible ${eligibleCompaniesCount} | refreshed ${refreshedCompaniesCount} | skipped module ${skippedModuleCount} | checked ${checkedCount} | changed ${changedCount} | skipped ${skippedCount}`
                );
            }
        }
    };

    return {
        start() {
            if (intervalHandle || startupHandle) {
                return;
            }

            console.log(`[LBC Auto Refresh] Enabled every ${LBC_AUTO_REFRESH_MINUTES} minute(s).`);
            startupHandle = setTimeout(() => {
                startupHandle = null;
                runTick().catch((error) => {
                    console.error('[LBC Auto Refresh] Startup tick failed:', error);
                });
            }, LBC_AUTO_REFRESH_INITIAL_DELAY_MS);

            intervalHandle = setInterval(() => {
                runTick().catch((error) => {
                    console.error('[LBC Auto Refresh] Interval tick failed:', error);
                });
            }, LBC_AUTO_REFRESH_INTERVAL_MS);
        },
        stop() {
            if (startupHandle) {
                clearTimeout(startupHandle);
                startupHandle = null;
            }
            if (intervalHandle) {
                clearInterval(intervalHandle);
                intervalHandle = null;
            }
        }
    };
}

function startServer() {
    return new Promise((resolve, reject) => {
        store.ensureSystemReady?.();
        const lbcAutoRefreshJob = createLbcAutoRefreshJob();
        const server = http.createServer(createRequestListener());
        server.on('error', reject);
        server.on('clientError', (error, socket) => {
            console.error('HTTP client error:', error);
            socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        });
        server.on('close', () => {
            lbcAutoRefreshJob.stop();
        });

        server.listen(SERVER_CONFIG.port, SERVER_CONFIG.bindHost, () => {
            lbcAutoRefreshJob.start();
            const info = getServerInfoPayload();
            resolve({
                server,
                localUrl: `http://127.0.0.1:${SERVER_CONFIG.port}/index.html`,
                lanUrl: info.lanUrl,
                lanUrls: info.lanUrls,
                lanHosts: info.lanHosts,
                hostname: info.hostname,
                hostnameUrl: info.hostnameUrl,
                config: SERVER_CONFIG
            });
        });
    });
}

module.exports = {
    SERVER_CONFIG,
    createRequestListener,
    startServer
};
