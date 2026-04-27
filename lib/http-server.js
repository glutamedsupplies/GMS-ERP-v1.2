const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const store = require('./sqlite');
const salesStore = require('./sales-store');
const communicationWorkflowStore = require('./communication-workflow-store');
const inventoryVariantStore = require('./inventory-variants-store');
let nodemailer = null;
const geminiOrderParser = require('./gemini-order-parser');
const { buildAssistantSystemPrompt } = require('./ai-assistant');
const { getDatabaseConnectionString } = require('./database-config');
const { buildExpenseBreakdownFilename, buildExpenseBreakdownWorkbookBuffer } = require('./expense-breakdown-export');
const { buildCompanyWorkbookBuffer, getMonthBounds, parseMonth, safeName } = require('./monthly-excel-export');
const { getServerBuildToken } = require('./build-info');
const { ROOT_DIR, readProjectRuntimeConfig } = require('./runtime-config');

const SESSION_COOKIE_NAME = 'attendance_session';
const DEVICE_COOKIE_NAME = 'attendance_device';
const COOKIE_DOMAIN_OVERRIDE = String(process.env.ATTENDANCE_COOKIE_DOMAIN || '').trim().toLowerCase();
const SESSION_TTL_MS = Math.max(60_000, Number(process.env.ATTENDANCE_SESSION_TTL_MS || 8 * 60 * 60 * 1000));
const LOGIN_ATTEMPT_WINDOW_MS = Math.max(
    60_000,
    Number(process.env.ATTENDANCE_LOGIN_ATTEMPT_WINDOW_MS || process.env.ATTENDANCE_LOGIN_WINDOW_MS || 15 * 60 * 1000)
);
const LOGIN_LOCKOUT_MS = Math.max(1_000, Number(process.env.ATTENDANCE_LOGIN_LOCKOUT_MS || 30 * 1000));
const LOGIN_MAX_ATTEMPTS = Math.max(1, Number(process.env.ATTENDANCE_LOGIN_MAX_ATTEMPTS || 10));
const DEVICE_COOKIE_MAX_AGE_SEC = Math.max(86_400, Number(process.env.ATTENDANCE_DEVICE_COOKIE_MAX_AGE_SEC || 31536000));
const PASSWORD_MIN_LENGTH = Math.max(8, Number(process.env.ATTENDANCE_PASSWORD_MIN_LENGTH || 8));
const PASSWORD_MAX_LENGTH = Math.max(PASSWORD_MIN_LENGTH, Number(process.env.ATTENDANCE_PASSWORD_MAX_LENGTH || 128));
const MAX_JSON_BODY_BYTES = Math.max(256 * 1024, Number(process.env.ATTENDANCE_MAX_JSON_BODY_BYTES || 4 * 1024 * 1024));
const GOOGLE_OAUTH_CLIENT_ID = String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
const GOOGLE_OAUTH_CLIENT_SECRET = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
const GOOGLE_OAUTH_REDIRECT_URI = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim();
const GOOGLE_OAUTH_STATE_TTL_MS = Math.max(60_000, Number(process.env.GOOGLE_OAUTH_STATE_TTL_MS || 10 * 60 * 1000));
const GOOGLE_OAUTH_SCOPES = 'openid email profile';
const FIREBASE_PROJECT_ID = String(process.env.FIREBASE_PROJECT_ID || '').trim();
const FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const GEMINI_CHAT_MODEL = String(
    process.env.ATTENDANCE_GEMINI_CHAT_MODEL
    || process.env.ATTENDANCE_GEMINI_MODEL
    || 'gemini-2.5-flash'
).trim() || 'gemini-2.5-flash';
const AI_CHAT_PROVIDER = String(process.env.ATTENDANCE_AI_CHAT_PROVIDER || '').trim().toLowerCase();
const GEMINI_CHAT_API_KEY = String(process.env.ATTENDANCE_GEMINI_API_KEY || '').trim();
const GEMINI_CHAT_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const LOCAL_AI_CHAT_URL = String(
    process.env.ATTENDANCE_LOCAL_AI_URL
    || process.env.ATTENDANCE_OLLAMA_URL
    || ''
).trim();
const LOCAL_AI_CHAT_MODEL = String(
    process.env.ATTENDANCE_LOCAL_AI_MODEL
    || process.env.ATTENDANCE_OLLAMA_MODEL
    || ''
).trim();
const LOCAL_AI_CHAT_KEEP_ALIVE = String(process.env.ATTENDANCE_LOCAL_AI_KEEP_ALIVE || '').trim();
const LOCAL_AI_CHAT_NUM_CTX = Number(process.env.ATTENDANCE_LOCAL_AI_NUM_CTX || '');
const AI_CHAT_TEMPERATURE = Number.isFinite(Number(process.env.ATTENDANCE_AI_CHAT_TEMPERATURE))
    ? Number(process.env.ATTENDANCE_AI_CHAT_TEMPERATURE)
    : 0.1;
const AI_CHAT_MAX_OUTPUT_TOKENS = Math.max(200, Number(process.env.ATTENDANCE_AI_CHAT_MAX_OUTPUT_TOKENS || 1800));
const AI_CHAT_MAX_HISTORY = Math.max(2, Number(process.env.ATTENDANCE_AI_CHAT_MAX_HISTORY || 8));
const AI_CHAT_MAX_MESSAGE_CHARS = Math.max(200, Number(process.env.ATTENDANCE_AI_CHAT_MAX_MESSAGE_CHARS || 4000));
const AI_CHAT_TIMEOUT_MS = Math.max(1_500, Number(process.env.ATTENDANCE_AI_PROVIDER_TIMEOUT_MS || 14_000));
const AI_CHAT_MEMORY_MAX_MESSAGES = Math.max(6, Number(process.env.ATTENDANCE_AI_CHAT_MEMORY_MAX_MESSAGES || 16));
const AI_CHAT_MEMORY_KEEP_LAST = Math.max(4, Number(process.env.ATTENDANCE_AI_CHAT_MEMORY_KEEP_LAST || 8));
const AI_CHAT_MEMORY_MAX_SUMMARY_CHARS = Math.max(200, Number(process.env.ATTENDANCE_AI_CHAT_MEMORY_MAX_SUMMARY_CHARS || 1600));
const AI_CHAT_HANDOFF_TRANSCRIPT_LIMIT = Math.max(
    AI_CHAT_MAX_HISTORY,
    Number(process.env.ATTENDANCE_AI_CHAT_HANDOFF_TRANSCRIPT_LIMIT || 24)
);
const AI_CHAT_HANDOFF_REQUESTS = new Map();
const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Math.max(1, Number(process.env.SMTP_PORT || 587));
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim();
const SMTP_FROM = String(process.env.SMTP_FROM || SMTP_USER || '').trim();
const SMTP_SECURE = ['1', 'true', 'yes', 'on'].includes(String(process.env.SMTP_SECURE || '').trim().toLowerCase());
const EMAIL_CODE_TTL_MINUTES = Math.max(5, Number(process.env.EMAIL_CODE_TTL_MINUTES || 15));
const PAYMONGO_SECRET_KEY = String(process.env.PAYMONGO_SECRET_KEY || '').trim();
const PAYMONGO_PUBLIC_KEY = String(process.env.PAYMONGO_PUBLIC_KEY || '').trim();
const PAYMONGO_QRPH_API_URL = 'https://api.paymongo.com/v1/qrph/generate';
const PAYMONGO_CHECKOUT_API_URL = 'https://api.paymongo.com/v1/checkout_sessions';
const PAYMONGO_QRPH_KIND = ['instore', 'webqr'].includes(String(process.env.PAYMONGO_QRPH_KIND || '').trim().toLowerCase())
    ? String(process.env.PAYMONGO_QRPH_KIND || '').trim().toLowerCase()
    : 'instore';
const PAYMONGO_QRPH_NOTES = String(process.env.PAYMONGO_QRPH_NOTES || 'GMS ERP Company ID Registration').trim() || 'GMS ERP Company ID Registration';
const PAYMONGO_QRPH_MOBILE_NUMBER = String(process.env.PAYMONGO_QRPH_MOBILE_NUMBER || '').trim();
const PAYMONGO_STATIC_QR_TIMEOUT_MS = Math.max(5_000, Number(process.env.PAYMONGO_STATIC_QR_TIMEOUT_MS || 15_000));
const PAYMONGO_STATIC_QR_CACHE_TTL_MS = Math.max(60_000, Number(process.env.PAYMONGO_STATIC_QR_CACHE_TTL_MS || 12 * 60 * 60 * 1000));
const PAYMONGO_CHECKOUT_TIMEOUT_MS = Math.max(5_000, Number(process.env.PAYMONGO_CHECKOUT_TIMEOUT_MS || 15_000));
const PAYMONGO_QR_SUPPORTED_METHODS = Object.freeze(['gcash', 'maya', 'instapay', 'bdo', 'bpi', 'other_bank']);
const PAYMONGO_CHECKOUT_METHODS = Object.freeze({
    gcash: Object.freeze({ label: 'GCash', paymentMethodTypes: Object.freeze(['gcash']) }),
    maya: Object.freeze({ label: 'Maya', paymentMethodTypes: Object.freeze(['paymaya']) }),
    instapay: Object.freeze({ label: 'InstaPay', paymentMethodTypes: Object.freeze(['qrph']) }),
    bdo: Object.freeze({ label: 'BDO Online Banking', paymentMethodTypes: Object.freeze(['dob']) }),
    bpi: Object.freeze({ label: 'BPI Online Banking', paymentMethodTypes: Object.freeze(['dob']) }),
    other_bank: Object.freeze({ label: 'QR Ph / Online Banking', paymentMethodTypes: Object.freeze(['qrph']) })
});
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
const googleLoginStates = new Map();
const firebaseCertCache = { certs: null, expiresAt: 0 };
const paymongoStaticQrCache = {
    cacheKey: '',
    payload: null,
    expiresAt: 0
};

function normalizeValue(value) {
    if (Buffer.isBuffer(value)) {
        return value.toString('utf8');
    }

    return value;
}

function sanitizeChatText(value = '') {
    const text = String(value || '');
    if (!text) {
        return '';
    }
    return text.trim();
}

function sanitizeChatThreadId(value = '') {
    const raw = String(value || '').trim();
    if (!raw) {
        return '';
    }
    return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function isLikelyFilipino(text = '') {
    const value = String(text || '').toLowerCase();
    if (!value) {
        return false;
    }
    return /(kumusta|kamusta|salamat|po|opo|naka|mag-?|mga|yung|ano|saan|paano|bakit|pwede|puwede|dito|ganito|taglish|\bba\b|\bmo\b|\bko\b|\blang\b|\bnaman\b|kba|ka\s*ba)/.test(value);
}

function getPaymongoKeyMode(secretKey = PAYMONGO_SECRET_KEY) {
    const normalized = String(secretKey || '').trim().toLowerCase();
    if (normalized.startsWith('sk_live_')) {
        return 'live';
    }
    if (normalized.startsWith('sk_test_')) {
        return 'test';
    }
    return '';
}

function normalizePaymongoMobileNumber(value = '') {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) {
        return '';
    }
    if (digits.startsWith('63') && digits.length === 12) {
        return `+${digits}`;
    }
    if (digits.startsWith('0') && digits.length === 11) {
        return `+63${digits.slice(1)}`;
    }
    if (digits.length === 10 && digits.startsWith('9')) {
        return `+63${digits}`;
    }
    return '';
}

function extractPaymongoErrorMessage(payload = null) {
    if (!payload || typeof payload !== 'object') {
        return '';
    }

    const errors = Array.isArray(payload.errors) ? payload.errors : [];
    const firstError = errors[0];
    if (firstError && typeof firstError === 'object') {
        return String(firstError.detail || firstError.title || firstError.code || '').trim();
    }

    return String(payload.message || payload.error || '').trim();
}

function buildDisabledPaymongoQrPayload(reason = '') {
    return {
        enabled: false,
        provider: 'paymongo',
        providerLabel: 'PayMongo QR Ph',
        mode: getPaymongoKeyMode(),
        publishableKeyConfigured: Boolean(PAYMONGO_PUBLIC_KEY),
        supportedMethods: [...PAYMONGO_QR_SUPPORTED_METHODS],
        warning: getPaymongoKeyMode() === 'test'
            ? 'PayMongo test mode is active. Do not collect live customer payments yet.'
            : '',
        error: String(reason || '').trim()
    };
}

function buildPaymongoStaticQrCacheKey({ mobileNumber = '', notes = PAYMONGO_QRPH_NOTES, kind = PAYMONGO_QRPH_KIND } = {}) {
    return JSON.stringify({
        mode: getPaymongoKeyMode(),
        mobileNumber: String(mobileNumber || '').trim(),
        notes: String(notes || '').trim(),
        kind: String(kind || '').trim(),
        hasSecret: Boolean(PAYMONGO_SECRET_KEY),
        hasPublishable: Boolean(PAYMONGO_PUBLIC_KEY)
    });
}

async function generatePaymongoStaticQrPayload(customerServiceConfig = null) {
    if (!PAYMONGO_SECRET_KEY) {
        return buildDisabledPaymongoQrPayload('PayMongo secret key is not configured on this server.');
    }

    const config = (customerServiceConfig && typeof customerServiceConfig === 'object' && !Array.isArray(customerServiceConfig))
        ? customerServiceConfig
        : getCustomerServiceConfigForAi();
    const fallbackPhone = Array.isArray(config.phones) ? String(config.phones[0] || '').trim() : '';
    const normalizedMobileNumber = normalizePaymongoMobileNumber(PAYMONGO_QRPH_MOBILE_NUMBER || fallbackPhone);
    const requestBody = {
        data: {
            attributes: {
                kind: PAYMONGO_QRPH_KIND,
                notes: PAYMONGO_QRPH_NOTES
            }
        }
    };

    if (normalizedMobileNumber) {
        requestBody.data.attributes.mobile_number = normalizedMobileNumber;
    }

    const response = await fetch(PAYMONGO_QRPH_API_URL, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64')}`
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(PAYMONGO_STATIC_QR_TIMEOUT_MS)
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(
            extractPaymongoErrorMessage(payload)
            || `PayMongo QR request failed with status ${response.status}.`
        );
    }

    const data = payload?.data || {};
    const attributes = (data.attributes && typeof data.attributes === 'object' && !Array.isArray(data.attributes))
        ? data.attributes
        : {};
    const rawQrImage = String(attributes.qr_image || attributes.qrImage || '').trim();
    const qrImage = rawQrImage && !/^https?:\/\//i.test(rawQrImage) && !/^data:/i.test(rawQrImage)
        ? `data:image/png;base64,${rawQrImage}`
        : rawQrImage;
    const mode = getPaymongoKeyMode();

    return {
        enabled: Boolean(qrImage),
        provider: 'paymongo',
        providerLabel: 'PayMongo QR Ph',
        mode,
        publishableKeyConfigured: Boolean(PAYMONGO_PUBLIC_KEY),
        supportedMethods: [...PAYMONGO_QR_SUPPORTED_METHODS],
        codeId: String(data.id || '').trim(),
        qrImage,
        displayName: String(attributes.name || '').trim() || 'Gluta Med Supplies',
        notes: String(attributes.notes || PAYMONGO_QRPH_NOTES).trim() || PAYMONGO_QRPH_NOTES,
        mobileNumber: String(attributes.mobile_number || attributes.mobileNumber || normalizedMobileNumber).trim(),
        kind: String(attributes.kind || PAYMONGO_QRPH_KIND).trim() || PAYMONGO_QRPH_KIND,
        warning: mode === 'test'
            ? 'PayMongo test mode is active. Use this QR for testing only and do not collect live customer payments yet.'
            : ''
    };
}

async function getCachedPaymongoStaticQrPayload(customerServiceConfig = null) {
    const config = (customerServiceConfig && typeof customerServiceConfig === 'object' && !Array.isArray(customerServiceConfig))
        ? customerServiceConfig
        : getCustomerServiceConfigForAi();
    const fallbackPhone = Array.isArray(config.phones) ? String(config.phones[0] || '').trim() : '';
    const cacheKey = buildPaymongoStaticQrCacheKey({
        mobileNumber: normalizePaymongoMobileNumber(PAYMONGO_QRPH_MOBILE_NUMBER || fallbackPhone)
    });

    if (
        paymongoStaticQrCache.payload
        && paymongoStaticQrCache.cacheKey === cacheKey
        && paymongoStaticQrCache.expiresAt > Date.now()
    ) {
        return paymongoStaticQrCache.payload;
    }

    const payload = await generatePaymongoStaticQrPayload(config);
    paymongoStaticQrCache.cacheKey = cacheKey;
    paymongoStaticQrCache.payload = payload;
    paymongoStaticQrCache.expiresAt = Date.now() + PAYMONGO_STATIC_QR_CACHE_TTL_MS;
    return payload;
}

function normalizeCompanyRegistrationPaymentMethodKey(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
        return '';
    }
    if (normalized === 'gcash') {
        return 'gcash';
    }
    if (normalized === 'maya') {
        return 'maya';
    }
    if (normalized === 'instapay' || normalized === 'insta pay') {
        return 'instapay';
    }
    if (normalized === 'bdo') {
        return 'bdo';
    }
    if (normalized === 'bpi') {
        return 'bpi';
    }
    if (normalized === 'other bank' || normalized === 'other_bank') {
        return 'other_bank';
    }
    return normalized.replace(/\s+/g, '_');
}

function normalizeDesiredCompanyCode(value = '') {
    return String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9-\s]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 40);
}

function resolveCompanyRegistrationPlanCheckout(requestedPlan = '') {
    const normalizedRequestedPlan = String(requestedPlan || '').trim();
    if (!normalizedRequestedPlan) {
        throw new Error('Subscription / package is required.');
    }

    const normalizedLookup = normalizedRequestedPlan.toLowerCase();
    if (normalizedLookup === 'lifetime access' || normalizedLookup === 'lifetime_access') {
        throw new Error('Lifetime Access needs an exact one-time price before secure checkout can be used.');
    }

    const plans = typeof store.listPlans === 'function' ? store.listPlans() : [];
    const match = plans.find((plan) => {
        const planId = String(plan?.id || '').trim().toLowerCase();
        const planName = String(plan?.name || '').trim().toLowerCase();
        return normalizedLookup === planId || normalizedLookup === planName;
    });

    if (!match) {
        throw new Error('Selected subscription plan was not found. Please refresh the page and try again.');
    }

    const amountPhp = Number(match.price_monthly || 0);
    if (!Number.isFinite(amountPhp) || amountPhp <= 0) {
        throw new Error('Selected subscription does not have a valid price yet.');
    }

    return {
        planId: String(match.id || '').trim(),
        planName: String(match.name || match.id || normalizedRequestedPlan).trim() || normalizedRequestedPlan,
        amountPhp,
        amountMinor: Math.round(amountPhp * 100)
    };
}

function assertCompanyRegistrationProvisioningAvailability({
    desiredCompanyCode = ''
} = {}) {
    const normalizedCompanyCode = normalizeDesiredCompanyCode(desiredCompanyCode);
    if (!normalizedCompanyCode) {
        return;
    }

    const existingCompany = store.getMasterDb().prepare(`
        SELECT id
        FROM companies
        WHERE LOWER(company_code) = LOWER(?)
        LIMIT 1
    `).get(normalizedCompanyCode);
    if (existingCompany) {
        throw new Error('Desired Company ID is already in use. Please choose another one.');
    }
}

function getPaymongoCheckoutMethodConfig(method = '') {
    const methodKey = normalizeCompanyRegistrationPaymentMethodKey(method);
    const config = PAYMONGO_CHECKOUT_METHODS[methodKey];
    if (!config) {
        throw new Error('Selected payment method is not supported for secure checkout yet.');
    }

    return {
        methodKey,
        label: String(config.label || method || 'Payment').trim() || 'Payment',
        paymentMethodTypes: Array.isArray(config.paymentMethodTypes) ? [...config.paymentMethodTypes] : []
    };
}

function buildCompanyRegistrationReturnUrl(req, state = 'success', requestCode = '', contactNumber = '') {
    const params = new URLSearchParams({
        intent: 'register_company_id',
        checkout: String(state || 'success').trim() || 'success'
    });
    if (requestCode) {
        params.set('requestCode', requestCode);
    }
    if (contactNumber) {
        params.set('contactNumber', String(contactNumber || '').trim());
    }
    return `${resolveBaseUrl(req)}/renderer/customer_portal.html?${params.toString()}`;
}

function buildCompanyRegistrationRequestDetails({
    businessName = '',
    adminId = '',
    clientName = '',
    contactNumber = '',
    email = '',
    desiredCompanyCode = '',
    requestedPlan = '',
    paymentMethod = '',
    paymentReference = '',
    amountPhp = 0
} = {}) {
    const lines = [
        'Company ID / subscription request:',
        `Company / Business Name: ${businessName || '-'}`,
        `Desired Company ID: ${desiredCompanyCode || '-'}`,
        `Admin ID: ${adminId || '-'}`,
        `Contact Person: ${clientName || '-'}`,
        `Contact Number: ${contactNumber || '-'}`,
        `Email: ${email || '-'}`,
        `Subscription / Package: ${requestedPlan || '-'}`,
        `Mode of Payment: ${paymentMethod || '-'}`,
        `Quoted Amount: PHP ${Number(amountPhp || 0).toFixed(2)}`
    ];
    if (paymentReference) {
        lines.push(`Payment Note / Reference: ${paymentReference}`);
    }
    return lines.join('\n');
}

function buildCompanyRegistrationInitialMessage({
    requestDetails = '',
    notes = '',
    extraMessage = ''
} = {}) {
    const lines = [String(requestDetails || '').trim()].filter(Boolean);
    if (notes) {
        lines.push(`Subscription Notes: ${String(notes || '').trim()}`);
    }
    if (extraMessage) {
        lines.push(`Extra Message: ${String(extraMessage || '').trim()}`);
    }
    return lines.join('\n');
}

async function createPaymongoCompanyRegistrationCheckoutSession(req, {
    requestCode = '',
    businessName = '',
    clientName = '',
    contactNumber = '',
    email = '',
    desiredCompanyCode = '',
    requestedPlan = '',
    amountMinor = 0,
    paymentMethod = ''
} = {}) {
    if (!PAYMONGO_SECRET_KEY) {
        throw new Error('PayMongo secret key is not configured on this server.');
    }

    const checkoutMethod = getPaymongoCheckoutMethodConfig(paymentMethod);
    const successUrl = buildCompanyRegistrationReturnUrl(req, 'success', requestCode, contactNumber);
    const cancelUrl = buildCompanyRegistrationReturnUrl(req, 'cancel', requestCode, contactNumber);
    const requestBody = {
        data: {
            attributes: {
                billing: {
                    name: String(clientName || '').trim() || 'Customer',
                    email: String(email || '').trim() || undefined,
                    phone: String(contactNumber || '').trim() || undefined
                },
                description: `Gluta Med Supplies Company ID Registration - ${String(requestedPlan || '').trim() || 'Subscription'}`,
                line_items: [
                    {
                        currency: 'PHP',
                        amount: Math.max(1, Math.round(Number(amountMinor || 0))),
                        name: `Gluta Med Supplies - ${String(requestedPlan || '').trim() || 'Subscription'}`,
                        quantity: 1,
                        description: `Company ID registration for ${String(businessName || '').trim() || 'New company'}${desiredCompanyCode ? ` (${desiredCompanyCode})` : ''}`
                    }
                ],
                payment_method_types: checkoutMethod.paymentMethodTypes,
                reference_number: String(requestCode || '').trim() || undefined,
                send_email_receipt: true,
                show_description: true,
                show_line_items: true,
                success_url: successUrl,
                cancel_url: cancelUrl,
                metadata: {
                    request_code: String(requestCode || '').trim(),
                    company_name: String(businessName || '').trim(),
                    desired_company_id: String(desiredCompanyCode || '').trim(),
                    requested_plan: String(requestedPlan || '').trim(),
                    checkout_method: checkoutMethod.methodKey
                }
            }
        }
    };

    const response = await fetch(PAYMONGO_CHECKOUT_API_URL, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64')}`
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(PAYMONGO_CHECKOUT_TIMEOUT_MS)
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(
            extractPaymongoErrorMessage(payload)
            || `PayMongo checkout request failed with status ${response.status}.`
        );
    }

    const data = payload?.data || {};
    const attributes = (data.attributes && typeof data.attributes === 'object' && !Array.isArray(data.attributes))
        ? data.attributes
        : {};
    const checkoutUrl = String(
        attributes.checkout_url
        || attributes.checkoutUrl
        || attributes.url
        || attributes.access_url
        || ''
    ).trim();

    if (!checkoutUrl) {
        throw new Error('PayMongo did not return a checkout URL.');
    }

    return {
        checkoutUrl,
        checkoutSessionId: String(data.id || '').trim(),
        paymentMethodTypes: checkoutMethod.paymentMethodTypes,
        paymentMethodLabel: checkoutMethod.label,
        warning: getPaymongoKeyMode() === 'test'
            ? 'PayMongo test mode is active. Use this checkout for testing only and do not collect live customer payments yet.'
            : ''
    };
}

async function retrievePaymongoCheckoutSession(checkoutSessionId = '') {
    const normalizedSessionId = String(checkoutSessionId || '').trim();
    if (!normalizedSessionId) {
        throw new Error('Checkout session ID is required.');
    }
    if (!PAYMONGO_SECRET_KEY) {
        throw new Error('PayMongo secret key is not configured on this server.');
    }

    const response = await fetch(`${PAYMONGO_CHECKOUT_API_URL}/${encodeURIComponent(normalizedSessionId)}`, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            Authorization: `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64')}`
        },
        signal: AbortSignal.timeout(PAYMONGO_CHECKOUT_TIMEOUT_MS)
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(
            extractPaymongoErrorMessage(payload)
            || `PayMongo checkout lookup failed with status ${response.status}.`
        );
    }

    const data = payload?.data || {};
    const attributes = (data.attributes && typeof data.attributes === 'object' && !Array.isArray(data.attributes))
        ? data.attributes
        : {};
    const paymentIntent = (attributes.payment_intent && typeof attributes.payment_intent === 'object' && !Array.isArray(attributes.payment_intent))
        ? attributes.payment_intent
        : {};
    const paymentIntentAttributes = (paymentIntent.attributes && typeof paymentIntent.attributes === 'object' && !Array.isArray(paymentIntent.attributes))
        ? paymentIntent.attributes
        : {};
    const checkoutStatus = String(attributes.status || '').trim().toLowerCase();
    const paymentIntentStatus = String(paymentIntentAttributes.status || paymentIntent.status || '').trim().toLowerCase();
    const payments = Array.isArray(paymentIntentAttributes.payments)
        ? paymentIntentAttributes.payments
        : (Array.isArray(attributes.payments) ? attributes.payments : []);
    const paymentStatuses = payments
        .map((entry) => String(entry?.attributes?.status || entry?.status || '').trim().toLowerCase())
        .filter(Boolean);
    const paid = checkoutStatus === 'paid'
        || checkoutStatus === 'completed'
        || paymentIntentStatus === 'succeeded'
        || paymentStatuses.includes('paid')
        || paymentStatuses.includes('succeeded');
    const paidAtSource = payments.find((entry) => String(entry?.attributes?.status || entry?.status || '').trim().toLowerCase() === 'paid')
        || payments.find((entry) => String(entry?.attributes?.status || entry?.status || '').trim().toLowerCase() === 'succeeded')
        || null;

    return {
        id: String(data.id || normalizedSessionId).trim(),
        checkoutStatus,
        paymentIntentStatus,
        paymentStatuses,
        paid,
        amountMinor: Math.max(
            0,
            Number(
                paymentIntentAttributes.amount
                || attributes.amount
                || attributes.total_amount
                || 0
            )
        ),
        paidAt: String(
            paidAtSource?.attributes?.paid_at
            || paymentIntentAttributes.updated_at
            || attributes.paid_at
            || ''
        ).trim(),
        raw: payload || null
    };
}

function generateProvisioningPassword() {
    const seed = crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
    const nextPassword = `GMS${seed}9a!`.slice(0, 18);
    return validatePasswordPolicy(nextPassword, { required: true });
}

function buildProvisionedCompanyLoginUrl(req, companyCode = '') {
    const params = new URLSearchParams();
    const normalizedCompanyCode = String(companyCode || '').trim();
    if (normalizedCompanyCode) {
        params.set('companyCode', normalizedCompanyCode);
    }
    const query = params.toString();
    return `${resolveBaseUrl(req)}/login.html${query ? `?${query}` : ''}`;
}

async function sendProvisionedCompanyAdminEmail(req, {
    to = '',
    companyName = '',
    companyCode = '',
    planName = '',
    adminUsername = '',
    adminPassword = '',
    contactName = ''
} = {}) {
    if (!isEmailDeliveryConfigured()) {
        return {
            sent: false,
            reason: 'Email delivery is not configured.'
        };
    }

    const recipient = String(to || '').trim();
    if (!recipient) {
        return {
            sent: false,
            reason: 'Recipient email is missing.'
        };
    }

    const loginUrl = buildProvisionedCompanyLoginUrl(req, companyCode);
    const subject = `${String(companyName || 'GMS ERP').trim() || 'GMS ERP'} admin account is ready`;
    const safeContactName = String(contactName || 'Customer').trim() || 'Customer';
    const safePlanName = String(planName || '').trim();
    const safeCompanyCode = String(companyCode || '').trim() || '-';
    const safeAdminUsername = String(adminUsername || '').trim() || '-';
    const safeAdminPassword = String(adminPassword || '').trim() || '-';
    const text = [
        `Hi ${safeContactName},`,
        '',
        `Your company registration for ${companyName || 'your company'} is now active.`,
        `Company ID: ${safeCompanyCode}`,
        safePlanName ? `Plan: ${safePlanName}` : '',
        '',
        'Admin login credentials:',
        `Username: ${safeAdminUsername}`,
        `Temporary Password: ${safeAdminPassword}`,
        '',
        `Login URL: ${loginUrl}`,
        '',
        'Please log in and change the password as soon as possible.'
    ].filter(Boolean).join('\n');
    const html = `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
            <h2 style="margin: 0 0 12px;">Your GMS admin account is ready</h2>
            <p style="margin: 0 0 12px;">Hi <strong>${safeContactName}</strong>,</p>
            <p style="margin: 0 0 12px;">Your company registration for <strong>${companyName || 'your company'}</strong> is now active.</p>
            <div style="margin: 0 0 16px; padding: 14px 16px; background: #f8fafc; border: 1px solid #dbe4f0; border-radius: 12px;">
                <div><strong>Company ID:</strong> ${safeCompanyCode}</div>
                ${safePlanName ? `<div><strong>Plan:</strong> ${safePlanName}</div>` : ''}
                <div style="margin-top: 12px;"><strong>Admin Username:</strong> ${safeAdminUsername}</div>
                <div><strong>Temporary Password:</strong> ${safeAdminPassword}</div>
            </div>
            <p style="margin: 0 0 12px;">
                <a href="${loginUrl}" style="display: inline-block; padding: 10px 16px; background: #0f766e; color: #ffffff; text-decoration: none; border-radius: 10px;">Open Login Page</a>
            </p>
            <p style="margin: 0; font-size: 13px; color: #475569;">Please log in and change the password as soon as possible.</p>
        </div>
    `;

    await getSmtpTransport().sendMail({
        from: SMTP_FROM,
        to: recipient,
        subject,
        text,
        html
    });

    return {
        sent: true,
        loginUrl
    };
}

function persistCompanyRegistrationRequestState(requestCode, {
    requestMeta = null,
    status = '',
    allowCustomerEdit = false
} = {}) {
    const thread = store.getCompanyRegistrationRequestThreadByCode(requestCode);
    const request = thread?.request || null;
    if (!request) {
        throw new Error('Company registration request not found.');
    }

    const nextMeta = requestMeta && typeof requestMeta === 'object' && !Array.isArray(requestMeta)
        ? requestMeta
        : request.requestMeta || {};
    const nextStatus = String(status || request.status || 'open').trim().toLowerCase() || 'open';

    store.getMasterDb().prepare(`
        UPDATE company_registration_requests
        SET request_meta_json = ?,
            status = ?,
            allow_customer_edit = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE request_code = ?
    `).run(
        JSON.stringify(nextMeta || {}),
        nextStatus,
        allowCustomerEdit ? 1 : 0,
        String(requestCode || '').trim().toUpperCase()
    );

    return store.getCompanyRegistrationRequestThreadByCode(requestCode);
}

async function completeProvisionedCompanyRegistrationCheckout(req, { requestCode = '' } = {}) {
    const normalizedRequestCode = String(requestCode || '').trim().toUpperCase();
    if (!normalizedRequestCode) {
        throw new Error('Request code is required.');
    }

    const thread = store.getCompanyRegistrationRequestThreadByCode(normalizedRequestCode);
    const request = thread?.request || null;
    if (!request) {
        throw new Error('Company registration request not found.');
    }

    const requestMeta = (request.requestMeta && typeof request.requestMeta === 'object' && !Array.isArray(request.requestMeta))
        ? { ...request.requestMeta }
        : {};
    if (requestMeta.provisionedCompanyId) {
        return {
            request: thread.request,
            company: requestMeta.provisionedCompanyId ? store.getCompanyById(requestMeta.provisionedCompanyId) : null,
            admin: {
                username: String(requestMeta.provisionedAdminUsername || '').trim()
            },
            emailDelivery: {
                sent: Boolean(requestMeta.emailSentAt)
            },
            alreadyProvisioned: true
        };
    }

    const checkoutSessionId = String(requestMeta.checkoutSessionId || '').trim();
    if (!checkoutSessionId) {
        throw new Error('This request is missing its checkout session reference.');
    }

    const checkoutState = await retrievePaymongoCheckoutSession(checkoutSessionId);
    if (!checkoutState.paid) {
        throw new Error('Payment has not been confirmed by PayMongo yet.');
    }

    const companyName = String(requestMeta.companyName || '').trim();
    const email = String(requestMeta.email || '').trim();
    const desiredCompanyCode = normalizeDesiredCompanyCode(requestMeta.desiredCompanyCode || '');
    const adminId = normalizeDesiredCompanyCode(requestMeta.adminId || '');
    const requestedPlanLookup = String(requestMeta.requestedPlanId || requestMeta.requestedPlanKey || requestMeta.requestedPlan || '').trim();
    const resolvedPlan = resolveCompanyRegistrationPlanCheckout(requestedPlanLookup);
    const adminPassword = generateProvisioningPassword();
    const companyCreation = store.createCompany({
        name: companyName,
        companyCode: desiredCompanyCode,
        planId: resolvedPlan.planId,
        adminUsername: adminId,
        adminName: request.clientName || adminId,
        adminPassword
    });
    const company = companyCreation?.company || null;
    const admin = companyCreation?.admin || null;

    if (!company || !admin) {
        throw new Error('Unable to provision the company account.');
    }

    if (email) {
        store.runWithTenantContextByCompany(company.id, () => store.setUserLoginEmail({
            userId: admin.username || adminId,
            email,
            verified: true
        }));
    }

    let emailDelivery = {
        sent: false,
        reason: 'Recipient email is missing.'
    };
    try {
        emailDelivery = await sendProvisionedCompanyAdminEmail(req, {
            to: email,
            companyName: company.name,
            companyCode: company.company_code,
            planName: resolvedPlan.planName,
            adminUsername: admin.username || admin.id || adminId,
            adminPassword,
            contactName: request.clientName
        });
    } catch (error) {
        emailDelivery = {
            sent: false,
            reason: error?.message || 'Unable to send the admin credentials email.'
        };
    }

    const completedAt = new Date().toISOString();
    const updatedThread = persistCompanyRegistrationRequestState(normalizedRequestCode, {
        requestMeta: {
            ...requestMeta,
            requestedPlan: resolvedPlan.planName,
            requestedPlanId: resolvedPlan.planId,
            paymentStatus: 'paid',
            quotedAmountPhp: Number(requestMeta.quotedAmountPhp || resolvedPlan.amountPhp || 0),
            checkoutSessionId,
            completedAt,
            provisionedCompanyId: company.id,
            provisionedCompanyCode: company.company_code,
            provisionedAdminUsername: admin.username || admin.id || adminId,
            emailSentAt: emailDelivery.sent ? completedAt : '',
            emailDeliveryError: emailDelivery.sent ? '' : String(emailDelivery.reason || '').trim()
        },
        status: 'resolved',
        allowCustomerEdit: false
    });

    try {
        store.addCompanyRegistrationRequestMessageByCode(normalizedRequestCode, {
            senderName: 'System',
            message: [
                'Payment verified automatically.',
                `Company ID: ${company.company_code}`,
                `Admin Username: ${admin.username || admin.id || adminId}`,
                `Plan: ${resolvedPlan.planName}`,
                emailDelivery.sent
                    ? `Admin credentials email sent to ${email || '-'}`
                    : `Admin credentials email not sent automatically${emailDelivery.reason ? `: ${emailDelivery.reason}` : '.'}`
            ].join('\n'),
            source: 'system_auto_provision'
        }, { actor: 'admin' });
    } catch (_error) {
        // Provisioning succeeded; ignore message log issues.
    }

    return {
        request: updatedThread.request,
        company,
        admin: {
            username: admin.username || admin.id || adminId,
            email
        },
        emailDelivery,
        alreadyProvisioned: false
    };
}

function buildAssistantBrandingContext({ appName = '', companyName = '' } = {}) {
    const resolvedAppName = String(appName || store.PARENT_BRAND.appName || 'GMS ERP').trim() || 'GMS ERP';
    const resolvedCompanyName = String(companyName || '').trim();
    return {
        appName: resolvedAppName,
        companyName: resolvedCompanyName,
        assistantName: resolvedCompanyName ? `${resolvedCompanyName} Assistant` : 'GMS AI Assistant',
        workspaceLabel: resolvedCompanyName || resolvedAppName || 'this app'
    };
}

function getQuickChatReply(message = '', branding = {}) {
    const trimmed = String(message || '').trim();
    if (!trimmed) {
        return '';
    }
    const lower = trimmed.toLowerCase();
    const isGreeting = /^(hi|hello|hey|yo|kumusta|kamusta|good\s*(morning|afternoon|evening))\b/.test(lower);
    if (!isGreeting) {
        return '';
    }
    const context = buildAssistantBrandingContext(branding);
    return `Hi! Pwede kitang tulungan sa login, sales, orders, tracking, payments, reports, users, inventory, at common issues sa ${context.workspaceLabel}. Anong task o problem ang gusto mong ayusin?`;
}

function getSmallTalkReply(message = '', branding = {}) {
    const trimmed = String(message || '').trim();
    if (!trimmed) {
        return '';
    }

    const lower = trimmed.toLowerCase();
    const filipino = isLikelyFilipino(lower);
    const context = buildAssistantBrandingContext(branding);

    if (/(perfect|perpekto).*(ka|mo)?|\bikaw ba perfect\b|\bare you perfect\b/.test(lower)) {
        return filipino
            ? [
                `Hindi naman ako perfect, pero pwede kitang tulungan mag-isip nang malinaw at step by step sa ${context.workspaceLabel}.`,
                'Sabihin mo lang kung login, sales, tracking, inventory, users, reports, o settings ang concern mo.'
            ].join('\n')
            : [
                `I am not perfect, but I can help you reason through ${context.workspaceLabel} clearly and step by step.`,
                'Tell me if your concern is login, sales, tracking, inventory, users, reports, or settings.'
            ].join('\n');
    }

    if (/^(sino ka|who are you|ano ka|what are you)\b/.test(lower)) {
        return filipino
            ? [
                context.companyName ? `Ako ang AI assistant ng ${context.companyName}.` : `Ako ang ${context.assistantName}.`,
                `Parang support teammate ako para sa login, app steps, troubleshooting, at module guidance ng ${context.workspaceLabel}.`
            ].join('\n')
            : [
                context.companyName ? `I am the AI assistant for ${context.companyName}.` : `I am the ${context.assistantName}.`,
                `I work like a support teammate for login, app steps, troubleshooting, and module guidance in ${context.workspaceLabel}.`
            ].join('\n');
    }

    if (/(salamat|thank you|thanks)\b/.test(lower)) {
        return filipino
            ? `Walang anuman. Sabihin mo lang kung anong next na part sa ${context.workspaceLabel} ang gusto mong ayusin.`
            : `You are welcome. Tell me which next part of ${context.workspaceLabel} you want to fix.`;
    }

    return '';
}

function getAgentOverviewReply(message = '') {
    const trimmed = String(message || '').trim();
    if (!trimmed) {
        return '';
    }

    const lower = trimmed.toLowerCase();
    const asksAboutAgents = /(mga\s+agent|talk agent|specialist|anong agent|ano.*agent|what agents|what specialist|agent modes|may agent ba)/.test(lower);
    if (!asksAboutAgents) {
        return '';
    }

    const filipino = isLikelyFilipino(lower);
    if (filipino) {
        return [
            'Oo, pwede ko siyang i-handle parang may specialist modes sa loob ng isang chatbot:',
            '1. Access Agent: para sa login, Google login, forgot password, sign up, at Register Company ID.',
            '2. Sales Agent: para sa Order Form, items, totals, payments, at sales flow.',
            '3. Tracking Agent: para sa Communication Panel, courier updates, at LBC Tracking.',
            '4. Report Agent: para sa Sales Reports, Invoice Summary, at attendance reports.',
            '5. Inventory Agent: para sa Pricing, Inventory, stock, at composite items.',
            '6. Admin Agent: para sa users, branches, company profile, settings, plans, at super admin setup.',
            '7. Support Agent: para sa customer requests, customer chat desk, at support sessions.',
            'Sabihin mo lang kung anong concern at doon ako magfofocus.'
        ].join('\n');
    }

    return [
        'Yes, it can work like one chatbot with specialist modes inside it:',
        '1. Access Agent: for login, Google login, forgot password, sign up, and Register Company ID.',
        '2. Sales Agent: for Order Form, items, totals, payments, and sales flow.',
        '3. Tracking Agent: for Communication Panel, courier updates, and LBC Tracking.',
        '4. Report Agent: for Sales Reports, Invoice Summary, and attendance reports.',
        '5. Inventory Agent: for Pricing, Inventory, stock, and composite items.',
        '6. Admin Agent: for users, branches, company profile, settings, plans, and super admin setup.',
        '7. Support Agent: for customer requests, customer chat desk, and support sessions.',
        'Tell me the concern and I will focus on the right mode.'
    ].join('\n');
}

function getPublicFlowReply(message = '') {
    const trimmed = String(message || '').trim();
    if (!trimmed) {
        return '';
    }

    const lower = trimmed.toLowerCase();
    const filipino = isLikelyFilipino(lower);

    if (/(forgot password|reset password|nakalimutan.*password|forgot.*password|reset.*password)/.test(lower)) {
        return filipino
            ? [
                'Sa Forgot Password page ito:',
                '1. Buksan ang Forgot Password.',
                '2. Ilagay ang Company ID at Email.',
                '3. I-click ang Send Code.',
                '4. Ilagay ang verification code.',
                '5. Ilagay ang bagong password at confirm password, tapos i-click ang Reset Password.'
            ].join('\n')
            : [
                'This is on the Forgot Password page:',
                '1. Open Forgot Password.',
                '2. Enter the Company ID and Email.',
                '3. Click Send Code.',
                '4. Enter the verification code.',
                '5. Enter the new password and confirm password, then click Reset Password.'
            ].join('\n');
    }

    if (/(register company id|company id registration|avail.*company id|company id.*avail|mag avail.*company id|pag avail.*company id|create.*company id|new company id|wala.*company id|no company id|subscription.*company id|company id.*subscription)/.test(lower)) {
        return filipino
            ? [
                'Sa Register Company ID flow ito:',
                '1. Sa Login page, i-click ang Register Company ID.',
                '2. Ilagay ang Company or Business Name, Contact Person, Contact Number, Email, at Desired Company ID.',
                '3. Ilagay ang preferred subscription or package kung meron.',
                '4. Piliin ang mode of payment: GCash, Maya, BDO, InstaPay, BPI, o Other Bank.',
                '5. Maglagay ng payment reference o notes kung meron, tapos i-submit ang request.',
                '6. Hintayin ang review at confirmation ng team bago ibigay ang Company ID at access setup.'
            ].join('\n')
            : [
                'This is the Register Company ID flow:',
                '1. On the Login page, click Register Company ID.',
                '2. Enter the Company or Business Name, Contact Person, Contact Number, Email, and Desired Company ID.',
                '3. Add the preferred subscription or package if needed.',
                '4. Choose a payment method: GCash, Maya, BDO, InstaPay, BPI, or Other Bank.',
                '5. Add the payment reference or notes if available, then submit the request.',
                '6. Wait for review and confirmation before the Company ID and access setup are released.'
            ].join('\n');
    }

    if (/(sign up|signup|register|registration|magregister|mag register|gumawa.*account|create.*account|request.*account|apply.*account|wala.*account|no account)/.test(lower)) {
        return filipino
            ? [
                'Sa Sign up flow ito. Yung actual button sa Login page ay Sign up:',
                '1. Sa Login page, i-click ang Sign up.',
                '2. Ilagay ang Company ID, Name, Contact Number, Email, at Desired Employee ID.',
                '3. Piliin ang Requested Role.',
                '4. Ilagay ang Topic at Initial Message.',
                '5. I-submit ang request at hintayin ang approval ng admin.',
                'Register at Sign up ang ibig sabihin dito, pero Sign up ang nakalagay sa app.'
            ].join('\n')
            : [
                'This is the Sign up flow. The actual button on the Login page is Sign up:',
                '1. On the Login page, click Sign up.',
                '2. Enter the Company ID, Name, Contact Number, Email, and Desired Employee ID.',
                '3. Choose the Requested Role.',
                '4. Add the Topic and Initial Message.',
                '5. Submit the request and wait for admin approval.',
                'Register and Sign up mean the same flow here, but the app label is Sign up.'
            ].join('\n');
    }

    if (/(customer portal|customer chat|chat portal|support request|request code|open request)/.test(lower)) {
        return filipino
            ? [
                'Sa Customer Portal ito:',
                '1. Para sa new request, ilagay ang Company ID, Name, Contact Number, Topic, at Initial Message, tapos i-click ang Start Chat.',
                '2. Para sa existing request, ilagay ang Request Code at Contact Number, tapos i-click ang Open Request.',
                '3. Kapag open na ang thread, pwede kang mag-send ng messages at mag-refresh ng chat.'
            ].join('\n')
            : [
                'This is on the Customer Portal:',
                '1. For a new request, enter the Company ID, Name, Contact Number, Topic, and Initial Message, then click Start Chat.',
                '2. For an existing request, enter the Request Code and Contact Number, then click Open Request.',
                '3. Once the thread is open, you can send messages and refresh the chat.'
            ].join('\n');
    }

    return '';
}

function detectAssistantMode(message = '', role = '') {
    const lower = String(message || '').trim().toLowerCase();
    const normalizedRole = String(role || '').trim().toLowerCase();

    if (!lower) {
        return normalizedRole === 'super_admin'
            ? 'Admin Agent'
            : 'General GMS Assistant';
    }

    if (/(login|log in|sign in|google login|forgot password|reset password|signup|sign up|customer portal|register company id|company id registration)/.test(lower)) {
        return 'Access Agent';
    }
    if (/(payment|amount paid|remaining|balance|overpayment|underpayment|full paid|partial)/.test(lower)) {
        return 'Payment Agent';
    }
    if (/(lbc|tracking|courier|communication panel|dispatch|delivery status|collection)/.test(lower)) {
        return 'Tracking Agent';
    }
    if (/(sales report|invoice summary|attendance report|report|export|filtered totals)/.test(lower)) {
        return 'Report Agent';
    }
    if (/(inventory|pricing|stock|composite|movement insight)/.test(lower)) {
        return 'Inventory Agent';
    }
    if (/(order form|sale|sales|receipt|client data base|client database|customer order)/.test(lower)) {
        return 'Sales Agent';
    }
    if (/(user management|users|branches|branch management|company profile|settings|plan|subscription|super admin|customer chat desk|support session)/.test(lower)) {
        return 'Admin Agent';
    }

    return normalizedRole === 'super_admin'
        ? 'Admin Agent'
        : 'General GMS Assistant';
}

function getGenericLoginIssueReply(message = '') {
    const trimmed = String(message || '').trim();
    if (!trimmed) {
        return '';
    }

    const lower = trimmed.toLowerCase();
    const soundsLikeLoginIssue = /(paano.*log\s*in|how.*log\s*in|how.*sign\s*in|how to login|how to log in|how to sign in|nahihirapan.*log\s*in|nahihirapan.*sign\s*in|login issue|issue sa login|problem sa login|trouble logging in|can'?t log\s*in|cannot log\s*in|can'?t sign\s*in|cannot sign\s*in|di\s+maka(log|sign)|hindi\s+maka(log|sign)|di\s+makapasok|hindi\s+makapasok|ayaw.*login|ayaw.*sign\s*in)/.test(lower);
    if (!soundsLikeLoginIssue) {
        return '';
    }

    const filipino = isLikelyFilipino(lower);
    if (filipino) {
        return [
            'Ganito mag-login sa GMS ERP:',
            '1. Buksan ang app at pumunta sa login page.',
            '2. Piliin kung email at password ang gamit mo o Google login.',
            '3. Ilagay ang Company ID.',
            '4. Kung email login, ilagay ang email at password mo, tapos i-click ang Login.',
            '5. Kung Google login, ilagay muna ang Company ID, tapos i-click ang Continue with Google.',
            '6. Kapag tama ang details, papasok ka sa workspace mo base sa role mo.',
            'May error ka bang nae-experience?'
        ].join('\n');
    }

    return [
        'Here is how to log in to GMS ERP:',
        '1. Open the app and go to the login page.',
        '2. Choose whether you will use email and password or Google login.',
        '3. Enter the Company ID.',
        '4. If you use email login, enter your email and password, then click Login.',
        '5. If you use Google login, enter the Company ID first, then click Continue with Google.',
        '6. If the details are correct, you should enter your workspace based on your role.',
        'Are you getting any error?'
    ].join('\n');
}

function getCustomerServiceConfigForAi() {
    try {
        if (typeof store.getCustomerServiceConfig === 'function') {
            return store.getCustomerServiceConfig();
        }
    } catch (_error) {
        // Ignore config read issues and fall back to generic wording.
    }
    return {
        handoff_message: '',
        emails: [],
        phones: [],
        company_registration_payment: {
            notice: '',
            methods: {}
        }
    };
}

function buildPublicCompanyRegistrationConfigPayload(customerServiceConfig = null) {
    const config = (customerServiceConfig && typeof customerServiceConfig === 'object' && !Array.isArray(customerServiceConfig))
        ? customerServiceConfig
        : getCustomerServiceConfigForAi();

    return {
        company_registration_payment: config.company_registration_payment || config.companyRegistrationPayment || {
            notice: '',
            methods: {}
        }
    };
}

function buildCustomerServiceHandoffMessage({ message = '', customerServiceConfig = null } = {}) {
    const filipino = isLikelyFilipino(message);
    const config = (customerServiceConfig && typeof customerServiceConfig === 'object' && !Array.isArray(customerServiceConfig))
        ? customerServiceConfig
        : getCustomerServiceConfigForAi();
    const handoffLead = String(config.handoff_message || config.handoffMessage || '').trim();
    const emails = Array.isArray(config.emails) ? config.emails.filter(Boolean) : [];
    const phones = Array.isArray(config.phones) ? config.phones.filter(Boolean) : [];
    const contactLines = [
        ...emails.map((email) => filipino ? `Email: ${email}` : `Email: ${email}`),
        ...phones.map((phone) => filipino ? `Call/Text: ${phone}` : `Call/Text: ${phone}`)
    ];

    if (filipino) {
        return [
            handoffLead || 'Mukhang mas okay ito i-handoff sa Customer Service para may actual tao kang makausap.',
            'Pwede mo silang kontakin dito:',
            ...contactLines,
            'Kung gusto mo, pwede mo ring i-send dito ang exact concern mo para may context sila agad.'
        ].filter(Boolean).join('\n');
    }

    return [
        handoffLead || 'This is better handled by Customer Service so you can talk to a real person.',
        'You can reach them here:',
        ...contactLines,
        'If you want, you can also send your exact concern here first so they have the context.'
    ].filter(Boolean).join('\n');
}

function resolveAiConversationCompanyId(session = null, company = null) {
    return String(session?.companyId || company?.id || '').trim();
}

function buildAiConversationCustomerName(session = null) {
    const resolvedName = String(session?.user?.name || session?.userId || session?.username || '').trim();
    if (resolvedName) {
        return resolvedName;
    }

    const email = String(session?.user?.login_email || '').trim();
    if (email) {
        return email;
    }

    return 'Ask AI Visitor';
}

function buildAiHandoffThreadKey({ session = null, company = null, threadId = '' } = {}) {
    const companyId = resolveAiConversationCompanyId(session, company);
    const normalizedThreadId = sanitizeChatThreadId(threadId);
    if (!companyId || !normalizedThreadId) {
        return '';
    }

    const userScope = String(session?.userId || session?.username || '').trim().toLowerCase() || 'public';
    return `${companyId}:${userScope}:${normalizedThreadId}`.slice(0, 180);
}

function buildAiHandoffContactNumber({ session = null, company = null, threadId = '' } = {}) {
    const companyId = resolveAiConversationCompanyId(session, company);
    const rawCandidates = [
        session?.user?.contact_number,
        session?.user?.contactNumber,
        session?.user?.mobile,
        session?.user?.mobile_number,
        session?.user?.phone,
        session?.user?.phone_number
    ];
    for (const candidate of rawCandidates) {
        const digits = String(candidate || '').replace(/\D/g, '');
        if (digits.length >= 7) {
            return digits.slice(0, 15);
        }
    }

    const seed = [
        companyId,
        String(session?.userId || session?.username || '').trim(),
        String(session?.user?.login_email || '').trim().toLowerCase(),
        sanitizeChatThreadId(threadId)
    ].filter(Boolean).join('|') || `guest|${Date.now()}`;
    const digest = crypto.createHash('sha1').update(seed).digest();
    const digits = Array.from(digest)
        .map((byte) => String(byte % 10))
        .join('')
        .slice(0, 9)
        .padEnd(9, '0');
    return `09${digits}`;
}

function buildAiHandoffRequestDetails({ session = null, company = null, threadId = '', userMessage = '' } = {}) {
    const lines = ['AI handoff from Ask AI.'];
    const companyName = String(company?.name || '').trim();
    const companyCode = String(company?.company_code || '').trim().toUpperCase();
    const userName = buildAiConversationCustomerName(session);
    const role = String(session?.role || session?.user?.role || '').trim();
    const email = String(session?.user?.login_email || '').trim();
    const normalizedThreadId = sanitizeChatThreadId(threadId);
    const concern = sanitizeChatText(userMessage);
    const companyLabel = companyName && companyCode
        ? `${companyName} (${companyCode})`
        : (companyName || companyCode);

    if (companyLabel) {
        lines.push(`Company: ${companyLabel}`);
    }
    lines.push('Channel: Ask AI');
    if (userName) {
        lines.push(`User: ${userName}`);
    }
    if (role) {
        lines.push(`Role: ${role}`);
    }
    if (email) {
        lines.push(`Login Email: ${email}`);
    }
    if (normalizedThreadId) {
        lines.push(`Thread ID: ${normalizedThreadId}`);
    }
    if (concern) {
        lines.push(`Latest concern: ${concern}`);
    }
    lines.push('Transcript: see the chat thread below.');

    return lines.join('\n');
}

function buildAiHandoffRequestMeta({ session = null, company = null, threadId = '' } = {}) {
    return {
        intent: 'ai_handoff',
        channel: 'ask_ai',
        email: String(session?.user?.login_email || '').trim(),
        desiredId: String(session?.userId || session?.username || '').trim(),
        aiThreadId: sanitizeChatThreadId(threadId),
        aiThreadKey: buildAiHandoffThreadKey({ session, company, threadId }),
        aiCompanyCode: String(company?.company_code || '').trim(),
        aiCompanyName: String(company?.name || '').trim(),
        isPublicVisitor: !Boolean(session?.companyId)
    };
}

function runAiConversationInTenantContext({ session = null, company = null } = {}, work) {
    const companyId = resolveAiConversationCompanyId(session, company);
    if (!companyId || typeof work !== 'function') {
        return null;
    }

    if (session?.companyId) {
        return runInTenantContext(session, work);
    }

    return store.runWithTenantContextByCompany(companyId, work);
}

function getChatHistoryEntryText(entry = null) {
    if (!entry || typeof entry !== 'object') {
        return '';
    }

    const partsText = Array.isArray(entry.parts)
        ? entry.parts.map((part) => sanitizeChatText(part?.text || '')).filter(Boolean).join('\n')
        : '';
    return sanitizeChatText(entry.text || entry.message || entry.content || partsText);
}

function buildAiConversationTranscriptEntries({
    history = [],
    userMessage = '',
    assistantReply = '',
    customerName = '',
    assistantName = ''
} = {}) {
    const resolvedCustomerName = String(customerName || '').trim() || 'Ask AI Visitor';
    const resolvedAssistantName = String(assistantName || '').trim() || 'GMS AI Assistant';
    const currentExchange = [];
    const normalizedUserMessage = sanitizeChatText(userMessage);
    const normalizedAssistantReply = sanitizeChatText(assistantReply);

    if (normalizedUserMessage) {
        currentExchange.push({ role: 'user', text: normalizedUserMessage });
    }
    if (normalizedAssistantReply) {
        currentExchange.push({ role: 'model', text: normalizedAssistantReply });
    }

    return mergeAiTranscriptHistory(history, currentExchange)
        .map((entry) => {
            const role = entry?.role === 'model' ? 'admin' : 'customer';
            const message = getChatHistoryEntryText(entry);
            if (!message) {
                return null;
            }

            return {
                senderType: role,
                senderName: role === 'admin' ? resolvedAssistantName : resolvedCustomerName,
                message,
                source: 'ai_assistant'
            };
        })
        .filter(Boolean);
}

function syncAiConversationToCustomerServiceInbox({
    session = null,
    company = null,
    threadId = '',
    conversationHistory = [],
    userMessage = '',
    assistantReply = '',
    assistantName = '',
    forceCreate = false
} = {}) {
    const companyId = resolveAiConversationCompanyId(session, company);
    const normalizedThreadId = sanitizeChatThreadId(threadId);
    if (!companyId || !normalizedThreadId) {
        return null;
    }

    const threadKey = buildAiHandoffThreadKey({
        session,
        company,
        threadId: normalizedThreadId
    });
    if (!threadKey) {
        return null;
    }

    const senderName = buildAiConversationCustomerName(session);
    const contactNumber = buildAiHandoffContactNumber({
        session,
        company,
        threadId: normalizedThreadId
    });
    const transcriptEntries = buildAiConversationTranscriptEntries({
        history: conversationHistory,
        userMessage,
        assistantReply,
        customerName: senderName,
        assistantName
    });
    let existingCode = String(AI_CHAT_HANDOFF_REQUESTS.get(threadKey) || '').trim();

    try {
        const thread = runAiConversationInTenantContext({ session, company }, () => {
            if (existingCode) {
                try {
                    return store.appendCustomerRequestTranscriptByCode(existingCode, transcriptEntries);
                } catch (_error) {
                    AI_CHAT_HANDOFF_REQUESTS.delete(threadKey);
                    existingCode = '';
                }
            }

            if (!forceCreate) {
                return null;
            }

            const created = store.createCustomerRequest({
                clientName: senderName,
                contactNumber,
                requestDetails: buildAiHandoffRequestDetails({
                    session,
                    company,
                    threadId: normalizedThreadId,
                    userMessage
                }),
                requestMeta: buildAiHandoffRequestMeta({
                    session,
                    company,
                    threadId: normalizedThreadId
                }),
                source: 'ai_assistant'
            });

            let nextThread = created;
            if (created?.request?.requestCode && transcriptEntries.length) {
                nextThread = store.appendCustomerRequestTranscriptByCode(
                    created.request.requestCode,
                    transcriptEntries
                );
            }

            if (created?.request?.requestCode) {
                if (AI_CHAT_HANDOFF_REQUESTS.size > 1_000) {
                    AI_CHAT_HANDOFF_REQUESTS.clear();
                }
                AI_CHAT_HANDOFF_REQUESTS.set(threadKey, created.request.requestCode);
            }

            return nextThread;
        });

        return thread && typeof thread === 'object' ? thread : null;
    } catch (error) {
        console.error('Failed to sync AI conversation to customer service inbox:', error);
        return null;
    }
}

function appendAiHandoffConfirmation(reply = '', requestCode = '', userMessage = '') {
    const normalizedReply = String(reply || '').trim();
    const normalizedCode = String(requestCode || '').trim();
    if (!normalizedReply || !normalizedCode) {
        return normalizedReply;
    }

    if (normalizedReply.includes(normalizedCode)) {
        return normalizedReply;
    }

    const filipino = isLikelyFilipino(userMessage || normalizedReply);
    const confirmationLine = filipino
        ? `Na-forward ko na rin ito sa Super Admin support inbox. Reference code: ${normalizedCode}.`
        : `I also forwarded this to the Super Admin support inbox. Reference code: ${normalizedCode}.`;
    return `${normalizedReply}\n${confirmationLine}`.trim();
}

function finalizeAiReplyForDelivery({
    reply = '',
    session = null,
    company = null,
    threadId = '',
    conversationHistory = [],
    userMessage = '',
    customerServiceConfig = null,
    assistantName = ''
} = {}) {
    const normalizedReply = String(reply || '').trim();
    if (!normalizedReply) {
        return {
            reply: '',
            handoffRequestCode: ''
        };
    }

    const handoffReply = buildCustomerServiceHandoffMessage({
        message: userMessage,
        customerServiceConfig
    });
    const shouldCreateHandoff = normalizedReply === handoffReply;
    const threadKey = buildAiHandoffThreadKey({ session, company, threadId });
    const hasExistingHandoff = Boolean(threadKey && AI_CHAT_HANDOFF_REQUESTS.get(threadKey));
    const syncedThread = (shouldCreateHandoff || hasExistingHandoff)
        ? syncAiConversationToCustomerServiceInbox({
            session,
            company,
            threadId,
            conversationHistory,
            userMessage,
            assistantReply: normalizedReply,
            assistantName,
            forceCreate: shouldCreateHandoff
        })
        : null;
    const handoffRequestCode = String(syncedThread?.request?.requestCode || '').trim();

    if (!shouldCreateHandoff) {
        return {
            reply: normalizedReply,
            handoffRequestCode
        };
    }

    return {
        reply: appendAiHandoffConfirmation(normalizedReply, handoffRequestCode, userMessage),
        handoffRequestCode
    };
}

function getDirectCustomerServiceReply(message = '', customerServiceConfig = null) {
    const lower = String(message || '').trim().toLowerCase();
    if (!lower) {
        return '';
    }

    const wantsHumanHelp = /(customer\s*service|support\s+team|support\s+agent|live\s+agent|real person|human|tao\s+kausap|pa[- ]?transfer|makausap|contact\s+them|reach\s+them|email\s+sila|tawagan|tumawag)/.test(lower);
    if (!wantsHumanHelp) {
        return '';
    }

    return buildCustomerServiceHandoffMessage({
        message,
        customerServiceConfig
    });
}

function getFeatureOverviewReply(message = '', role = '') {
    const trimmed = String(message || '').trim();
    if (!trimmed) {
        return '';
    }

    const lower = trimmed.toLowerCase();
    const wantsOverview = /(ano.*function|mga function|features? ng app|ano.*apps mo|ano.*ginagawa.*app|lahat.*function|paano.*gamitin.*lahat|overview ng app|tour ng app|\bwhat\s+functions?\b|\bwhat\s+can\s+you\s+do\b|\bwhat\s+features?\b|\bwhat\s+modules?\b|\bhow\s+to\s+use\b|\bapp\s+overview\b|\bwhat\s+is\s+this\s+app\b|\bwhat\s+function\??$|(?:^|\s)function\??$)/.test(lower);
    if (!wantsOverview) {
        return '';
    }

    const filipino = isLikelyFilipino(lower);
    const normalizedRole = String(role || '').trim().toLowerCase();
    let roleHint = '';
    if (filipino) {
        if (normalizedRole === 'super_admin') {
            roleHint = 'Since Super Admin ka, may extra access ka rin sa Plans and Subscriptions, Audit Logs, Access Logs, at Customer Chat Desk.';
        } else if (normalizedRole === 'head_admin' || normalizedRole === 'company_admin') {
            roleHint = 'Since Head Admin ka, kasama rin sa side mo ang Users, Employees, Branches, Settings, at ibang company tools.';
        } else if (normalizedRole === 'employee' || normalizedRole === 'staff') {
            roleHint = 'If employee or staff login ang gamit mo, mas konti lang ang modules na makikita mo kaysa sa Head Admin.';
        } else {
            roleHint = 'Depende sa role mo, may ibang modules na pwede o hindi pwede makita.';
        }
    } else if (normalizedRole === 'super_admin') {
        roleHint = 'Since you are a Super Admin, you also have access to Plans and Subscriptions, Audit Logs, Access Logs, and the Customer Chat Desk.';
    } else if (normalizedRole === 'head_admin' || normalizedRole === 'company_admin') {
        roleHint = 'Since you are a Head Admin, your side also includes Users, Employees, Branches, Settings, and other company tools.';
    } else if (normalizedRole === 'employee' || normalizedRole === 'staff') {
        roleHint = 'If you are using an employee or staff login, you will see fewer modules than Head Admin.';
    } else {
        roleHint = 'Available modules still depend on the role you log in with.';
    }

    if (filipino) {
        return [
            'Ganito ang main functions ng GMS ERP:',
            '1. Sales at Order Management: para sa Order Form, item rows, totals, payments, at receipts.',
            '2. Delivery at Tracking: para sa Communication Panel, courier flow, LBC Tracking, at collection updates.',
            '3. Client Records: para sa Client Data Base at customer details used in orders and sales.',
            '4. Reports: para sa Sales Reports, Invoice Summary, attendance reports, at filtered totals.',
            '5. Operations at Setup: para sa Employee Accounts, User Management, Branch Management, Company Profile, Settings, Expenses, Inventory, at attendance tools.',
            '6. Super Admin only: para sa companies, plans, customer service setup, audit logs, access logs, at customer chat desk.',
            roleHint,
            'Kung gusto mo, pili ka lang ng isang module at tuturuan kita nang malinaw step by step.'
        ].filter(Boolean).join('\n');
    }

    return [
        'Here is the main function overview of GMS ERP:',
        '1. Sales and Order Management: for Order Form, item rows, totals, payments, and receipts.',
        '2. Delivery and Tracking: for Communication Panel, courier flow, LBC Tracking, and collection updates.',
        '3. Client Records: for Client Data Base and customer details used in orders and sales.',
        '4. Reports: for Sales Reports, Invoice Summary, attendance reports, and filtered totals.',
        '5. Operations and Setup: for Employee Accounts, User Management, Branch Management, Company Profile, Settings, Expenses, Inventory, and attendance tools.',
        '6. Super Admin only: for companies, plans, customer service setup, audit logs, access logs, and the customer chat desk.',
        roleHint,
        'If you want, pick one module and I will explain it clearly step by step.'
    ].filter(Boolean).join('\n');
}

function getGoogleLoginHelpReply(message = '') {
    const trimmed = String(message || '').trim();
    if (!trimmed) {
        return '';
    }

    const lower = trimmed.toLowerCase();
    const mentionsGoogle = /(google|gmail)/.test(lower);
    const soundsLikeLoginIssue = /(login|log in|sign in|account|gumagana|gumana|ayaw|error|failed|not working|can'?t|cannot|di\s+gumagana|hindi\s+gumagana|di\s+maka|hindi\s+maka|di\s+makapasok|hindi\s+makapasok)/.test(lower);
    if (!mentionsGoogle || !soundsLikeLoginIssue) {
        return '';
    }

    const filipino = isLikelyFilipino(lower);
    if (filipino) {
        return [
            'Kung Google login ang gamit mo, ito muna ang i-check:',
            '1. May Company ID ka bang nailagay?',
            '2. Yung Google email mo ba ay naka-link sa mismong GMS account mo?',
            '3. May exact error message bang lumalabas?',
            'Kung ang lumalabas ay parang no account matched o hindi linked, mas safe na mag-login ka muna gamit ang email at password.',
            'Kung may exact error ka, i-send mo dito para ma-guide kita nang mas specific.'
        ].join('\n');
    }

    return [
        'If you are using Google login, check these first:',
        '1. Did you enter the Company ID?',
        '2. Is your Google email linked to the matching GMS account?',
        '3. What exact error message do you see?',
        'If the message looks like no account matched or not linked, the safer next step is to log in first with email and password.',
        'Send the exact error here and I can guide you more specifically.'
    ].join('\n');
}

function getWebsiteSetupReply(message = '', role = '') {
    const trimmed = String(message || '').trim();
    if (!trimmed) {
        return '';
    }

    const lower = trimmed.toLowerCase();
    const asksWebsiteSetup = /(sariling\s+website|own\s+website|website\s+setup|set[- ]?up.*website|setup.*website|pagawa.*website|gawa.*website|website\s+builder|web\s+hosting|hosting|cms|landing\s+page|public\s+website|custom\s+domain|subdomain|white\s+label|sariling\s+domain|own\s+domain)/.test(lower);
    if (!asksWebsiteSetup) {
        return '';
    }

    const filipino = isLikelyFilipino(lower);
    const normalizedRole = String(role || '').trim().toLowerCase();
    let roleHint = filipino
        ? 'Usually admin-side ito: sa Head Admin, makikita ito sa Company Profile, at sa Super Admin, nasa Create Company at company editor din ito.'
        : 'This is usually admin-side: on Head Admin, you can check this in Company Profile, and on Super Admin, it is also in Create Company and the company editor.';
    if (normalizedRole === 'super_admin') {
        roleHint = filipino
            ? 'Sa Super Admin, makikita ito sa Create Company at sa company editor.'
            : 'On Super Admin, you can check this in Create Company and the company editor.';
    } else if (normalizedRole === 'head_admin' || normalizedRole === 'company_admin') {
        roleHint = filipino
            ? 'Sa Head Admin side, makikita ito sa Company Profile.'
            : 'On the Head Admin side, you can check this in Company Profile.';
    } else if (normalizedRole === 'employee' || normalizedRole === 'staff') {
        roleHint = filipino
            ? 'Admin-side setup ito, so kailangan i-check ito sa Head Admin o Super Admin.'
            : 'This is an admin-side setup, so it needs to be checked by Head Admin or Super Admin.';
    }

    if (filipino) {
        return [
            'Base sa available na app info, may support dito para sa Subdomain, Custom Domain, App Name, Logo, Primary Color, at White Label.',
            'Ibig sabihin, pwede ang branded app or login setup at sariling domain connection kung enabled sa setup ninyo.',
            roleHint,
            'Pero wala akong confirmed info dito na may full website builder, web hosting, CMS, o hiwalay na public website creator.',
            'Kung full website talaga ang gusto mo, mas safe na i-confirm sa admin o Customer Service kung offered iyon sa setup ninyo.'
        ].join('\n');
    }

    return [
        'Based on the available app info, this supports Subdomain, Custom Domain, App Name, Logo, Primary Color, and White Label.',
        'That means branded app or login setup and custom domain connection can be supported when enabled in your setup.',
        roleHint,
        'But I do not have confirmed info here for a full website builder, web hosting service, CMS, or separate public website creator.',
        'If you need a full website, the safer next step is to confirm with your admin or Customer Service whether that is offered in your setup.'
    ].join('\n');
}

function getStaticKnowledgeReply(message = '') {
    const trimmed = String(message || '').trim();
    if (!trimmed) {
        return '';
    }
    const lower = trimmed.toLowerCase();
    const wantsModules = /(module|modules|listahan|list\b|mga module)/.test(lower);
    if (!wantsModules) {
        return '';
    }
    const filipino = isLikelyFilipino(lower);
    const headAdminMatch = /(head\s*admin|company\s*admin|company admin)/.test(lower);
    const employeeMatch = /(employee|staff)/.test(lower);
    const superAdminMatch = /(super\s*admin)/.test(lower);

    if (headAdminMatch) {
        return filipino
            ? [
                'Ito ang modules ng Head Admin sa GMS ERP:',
                '1. Employee Accounts',
                '2. Client Data Base',
                '3. Pricing',
                '4. Composite Recipe',
                '5. Inventory',
                '6. Movement Insight',
                '7. Order Form',
                '8. Communication Panel',
                '9. Sales Reports',
                '10. LBC Tracking',
                '11. Invoice Summary',
                '12. Expenses',
                '13. Time Cards',
                '14. Today Present',
                '15. Time In/Out',
                '16. Attendance Reports',
                '17. User Management',
                '18. Branch Management',
                '19. Company Profile',
                '20. Invoice Template',
                '21. Settings',
                'Kung gusto mo, sabihin mo lang kung anong module at bibigyan kita ng steps.'
            ].join('\n')
            : [
                'Here are the Head Admin modules:',
                '1. Employee Accounts',
                '2. Client Data Base',
                '3. Pricing',
                '4. Composite Recipe',
                '5. Inventory',
                '6. Movement Insight',
                '7. Order Form',
                '8. Communication Panel',
                '9. Sales Reports',
                '10. LBC Tracking',
                '11. Invoice Summary',
                '12. Expenses',
                '13. Time Cards',
                '14. Today Present',
                '15. Time In/Out',
                '16. Attendance Reports',
                '17. User Management',
                '18. Branch Management',
                '19. Company Profile',
                '20. Invoice Template',
                '21. Settings',
                'Do you want details for any specific module?'
            ].join('\n');
    }

    if (employeeMatch) {
        return filipino
            ? [
                'Ito ang usual tools ng Employee o Staff sa GMS ERP:',
                '1. Time Card',
                '2. Time In/Out',
                '3. Settings',
                '4. Optional granted tools: Order Form, Expenses, Inventory, Composite Items, at LBC Tracking',
                'Sabihin mo lang kung aling module ang gusto mong i-check.'
            ].join('\n')
            : [
                'Here are the usual Employee or Staff tools:',
                '1. Time Card',
                '2. Time In/Out',
                '3. Settings',
                '4. Optional granted tools: Order Form, Expenses, Inventory, Composite Items, and LBC Tracking',
                'Do you want details for any specific module?'
            ].join('\n');
    }

    if (superAdminMatch) {
        return filipino
            ? [
                'Ito ang main areas ng Super Admin sa GMS ERP:',
                '1. Dashboard',
                '2. Create Company',
                '3. Create Plan',
                '4. Customer Service Contacts',
                '5. Customer Service Accounts',
                '6. Companies',
                '7. Plans',
                '8. Audit Logs',
                '9. Access Logs',
                '10. Customer Chat Desk',
                'Sabihin mo lang kung anong part ang gusto mong i-open o maintindihan.'
            ].join('\n')
            : [
                'Here are the main Super Admin areas:',
                '1. Dashboard',
                '2. Create Company',
                '3. Create Plan',
                '4. Customer Service Contacts',
                '5. Customer Service Accounts',
                '6. Companies',
                '7. Plans',
                '8. Audit Logs',
                '9. Access Logs',
                '10. Customer Chat Desk',
                'Do you want details for any specific module?'
            ].join('\n');
    }

    return '';
}

function isReplyLikelyIncomplete(reply = '') {
    const normalized = String(reply || '').replace(/\r\n/g, '\n').trim();
    if (!normalized) {
        return true;
    }

    const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
    const lastLine = lines[lines.length - 1] || normalized;
    if (!lastLine) {
        return true;
    }

    if (/^\d+([.)])?\s*$/.test(lastLine)) {
        return true;
    }
    if (/[:;,/-]\s*$/.test(lastLine)) {
        return true;
    }
    if (/[([{]\s*$/.test(lastLine)) {
        return true;
    }
    if (/(^|\s)(and|or|at|ng|sa|para|with)\s*$/i.test(lastLine)) {
        return true;
    }

    return false;
}

function isReplyLikelyNeedsHumanHandoff(reply = '') {
    const normalized = String(reply || '').replace(/\r\n/g, '\n').trim().toLowerCase();
    if (!normalized) {
        return true;
    }

    return [
        /\bi do not know\b/,
        /\bi don't know\b/,
        /\bi am not sure\b/,
        /\bi'm not sure\b/,
        /\bi cannot answer\b/,
        /\bi can't answer\b/,
        /\bi do not have enough (information|context)\b/,
        /\bi don't have enough (information|context)\b/,
        /\bi do not have access\b/,
        /\bi don't have access\b/,
        /\bunable to (answer|help|assist|confirm|determine)\b/,
        /\bcannot (help|assist|confirm|determine)\b/,
        /\bhindi ko alam\b/,
        /\bhindi ako sigurado\b/,
        /\bwala akong sapat na (impormasyon|detalye|context)\b/,
        /\bwala akong access\b/,
        /\bhindi ko ma(?:sagot|confirm|determine|tukoy)\b/
    ].some((pattern) => pattern.test(normalized));
}

function normalizeChatReplyForDelivery(reply = '', { userMessage = '', customerServiceConfig = null } = {}) {
    const normalized = String(reply || '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (!normalized || isReplyLikelyIncomplete(normalized) || isReplyLikelyNeedsHumanHandoff(normalized)) {
        return buildCustomerServiceHandoffMessage({
            message: userMessage,
            customerServiceConfig
        });
    }

    return normalized;
}

function areChatHistoryEntriesEqual(left = null, right = null) {
    const leftRole = left?.role === 'model' || left?.role === 'assistant' ? 'model' : 'user';
    const rightRole = right?.role === 'model' || right?.role === 'assistant' ? 'model' : 'user';
    if (leftRole !== rightRole) {
        return false;
    }

    const leftText = sanitizeChatText(left?.text || left?.message || left?.content);
    const rightText = sanitizeChatText(right?.text || right?.message || right?.content);
    return leftText === rightText;
}

function normalizeChatHistory(history = []) {
    if (!Array.isArray(history)) {
        return [];
    }

    return history
        .map((entry) => {
            if (!entry || typeof entry !== 'object') {
                return null;
            }
            const role = entry.role === 'model' || entry.role === 'assistant' ? 'model' : 'user';
            const text = sanitizeChatText(entry.text || entry.message || entry.content);
            if (!text) {
                return null;
            }

            return {
                role,
                parts: [{ text: text.slice(0, AI_CHAT_MAX_MESSAGE_CHARS) }]
            };
        })
        .filter(Boolean)
        .slice(-AI_CHAT_MAX_HISTORY);
}

function mergeChatHistory(memoryHistory = [], requestHistory = []) {
    const primary = normalizeChatHistory(memoryHistory);
    const secondary = normalizeChatHistory(requestHistory);

    if (!primary.length) {
        return secondary;
    }
    if (!secondary.length) {
        return primary;
    }

    let overlap = Math.min(primary.length, secondary.length);
    while (overlap > 0) {
        let matches = true;
        for (let index = 0; index < overlap; index += 1) {
            const left = primary[primary.length - overlap + index];
            const right = secondary[index];
            if (!areChatHistoryEntriesEqual(left, right)) {
                matches = false;
                break;
            }
        }
        if (matches) {
            break;
        }
        overlap -= 1;
    }

    return [...primary, ...secondary.slice(overlap)].slice(-AI_CHAT_MAX_HISTORY);
}

function normalizeAiTranscriptHistory(history = [], limit = AI_CHAT_HANDOFF_TRANSCRIPT_LIMIT) {
    if (!Array.isArray(history)) {
        return [];
    }

    return history
        .map((entry) => {
            if (!entry || typeof entry !== 'object') {
                return null;
            }

            const role = entry.role === 'model' || entry.role === 'assistant' ? 'model' : 'user';
            const text = getChatHistoryEntryText(entry);
            if (!text) {
                return null;
            }

            return { role, text };
        })
        .filter(Boolean)
        .slice(-Math.max(1, Number(limit || AI_CHAT_HANDOFF_TRANSCRIPT_LIMIT)));
}

function mergeAiTranscriptHistory(memoryHistory = [], requestHistory = [], limit = AI_CHAT_HANDOFF_TRANSCRIPT_LIMIT) {
    const primary = normalizeAiTranscriptHistory(memoryHistory, limit);
    const secondary = normalizeAiTranscriptHistory(requestHistory, limit);

    if (!primary.length) {
        return secondary;
    }
    if (!secondary.length) {
        return primary;
    }

    let overlap = Math.min(primary.length, secondary.length);
    while (overlap > 0) {
        let matches = true;
        for (let index = 0; index < overlap; index += 1) {
            const left = primary[primary.length - overlap + index];
            const right = secondary[index];
            if (!areChatHistoryEntriesEqual(left, right)) {
                matches = false;
                break;
            }
        }
        if (matches) {
            break;
        }
        overlap -= 1;
    }

    return [...primary, ...secondary.slice(overlap)]
        .slice(-Math.max(1, Number(limit || AI_CHAT_HANDOFF_TRANSCRIPT_LIMIT)));
}

function normalizeChatMessages(messages = []) {
    if (!Array.isArray(messages)) {
        return [];
    }

    return messages
        .map((entry) => {
            if (!entry || typeof entry !== 'object') {
                return null;
            }
            const role = entry.role === 'assistant' || entry.role === 'model' ? 'assistant' : 'user';
            const content = sanitizeChatText(entry.content || entry.text || entry.message || '');
            if (!content) {
                return null;
            }
            return { role, content };
        })
        .filter(Boolean);
}

function toChatMessagesFromHistory(history = []) {
    if (!Array.isArray(history)) {
        return [];
    }
    return history.map((entry) => {
        if (!entry) {
            return null;
        }
        const role = entry.role === 'model' ? 'assistant' : 'user';
        const text = Array.isArray(entry.parts)
            ? entry.parts.map((part) => String(part?.text || '')).join('')
            : String(entry.text || entry.message || entry.content || '');
        const content = sanitizeChatText(text);
        if (!content) {
            return null;
        }
        return { role, content };
    }).filter(Boolean);
}

function buildChatMemoryKey(threadId = '', session = null) {
    const normalizedThread = sanitizeChatThreadId(threadId);
    if (!normalizedThread) {
        return '';
    }
    const companyId = String(session?.companyId || '').trim();
    if (!companyId) {
        return normalizedThread;
    }
    return `${companyId}:${normalizedThread}`.slice(0, 120);
}

function extractGeminiChatText(payload) {
    const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
    for (const candidate of candidates) {
        const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
        const text = parts.map((part) => String(part?.text || '')).join('').trim();
        if (text) {
            return text;
        }
    }

    return '';
}

function resolveChatProvider() {
    if (AI_CHAT_PROVIDER) {
        return AI_CHAT_PROVIDER;
    }
    if (isLocalChatConfigured()) {
        return 'local';
    }
    if (GEMINI_CHAT_API_KEY) {
        return 'gemini';
    }
    return '';
}

function isLocalChatConfigured() {
    return Boolean(LOCAL_AI_CHAT_URL && LOCAL_AI_CHAT_MODEL);
}

function buildLocalChatMessages({ history = [], message = '', systemPrompt = '' }) {
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    for (const entry of Array.isArray(history) ? history : []) {
        const role = entry?.role === 'model' ? 'assistant' : 'user';
        const text = Array.isArray(entry?.parts)
            ? entry.parts.map((part) => String(part?.text || '')).join('')
            : '';
        if (!text) {
            continue;
        }
        messages.push({ role, content: text });
    }
    if (message) {
        messages.push({ role: 'user', content: message });
    }
    return messages;
}

function extractLocalChatText(payload) {
    const messageText = String(payload?.message?.content || '').trim();
    if (messageText) {
        return messageText;
    }
    const directText = String(payload?.response || '').trim();
    if (directText) {
        return directText;
    }
    const choiceText = String(payload?.choices?.[0]?.message?.content || '').trim();
    if (choiceText) {
        return choiceText;
    }
    return '';
}

function getLocalChatEndpoint() {
    const base = LOCAL_AI_CHAT_URL.replace(/\/+$/, '');
    return base ? `${base}/api/chat` : '';
}

function buildMemorySummaryPrompt({ previousSummary = '', messages = [] } = {}) {
    const normalizedSummary = String(previousSummary || '').trim();
    const transcript = normalizeChatMessages(messages)
        .map((entry) => `${entry.role === 'assistant' ? 'Assistant' : 'User'}: ${entry.content}`)
        .join('\n');

    return [
        'Summarize the conversation memory for future replies.',
        'Keep only important context, preferences, goals, decisions, and constraints.',
        'Do not invent details. Do not include passwords or secrets.',
        `Keep it under ${AI_CHAT_MEMORY_MAX_SUMMARY_CHARS} characters.`,
        'Use the same language as the user.',
        'No markdown, no emojis.',
        '',
        normalizedSummary ? 'Existing memory summary:' : 'Existing memory summary: (none)',
        normalizedSummary || '',
        '',
        'New conversation chunk:',
        transcript
    ].join('\n');
}

async function requestChatCompletion({
    provider,
    systemPrompt = '',
    messages = [],
    temperature = AI_CHAT_TEMPERATURE,
    maxOutputTokens = 700
} = {}) {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    const normalizedMessages = normalizeChatMessages(messages);
    if (!normalizedMessages.length) {
        throw new Error('No chat messages to send.');
    }

    if (normalizedProvider === 'ollama' || normalizedProvider === 'local') {
        if (!isLocalChatConfigured()) {
            throw new Error('Local AI chat is not configured.');
        }
        const endpoint = getLocalChatEndpoint();
        if (!endpoint) {
            throw new Error('Local AI endpoint is missing.');
        }
        const payloadMessages = [];
        if (systemPrompt) {
            payloadMessages.push({ role: 'system', content: systemPrompt });
        }
        payloadMessages.push(...normalizedMessages);

        const options = {
            temperature,
            num_predict: maxOutputTokens
        };
        if (Number.isFinite(LOCAL_AI_CHAT_NUM_CTX) && LOCAL_AI_CHAT_NUM_CTX > 0) {
            options.num_ctx = Math.floor(LOCAL_AI_CHAT_NUM_CTX);
        }

        const body = {
            model: LOCAL_AI_CHAT_MODEL,
            stream: false,
            options,
            messages: payloadMessages
        };
        if (LOCAL_AI_CHAT_KEEP_ALIVE) {
            body.keep_alive = LOCAL_AI_CHAT_KEEP_ALIVE;
        }

        const response = await withTimeout(
            fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }),
            AI_CHAT_TIMEOUT_MS,
            'Local AI'
        );

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const remoteMessage = payload?.error || payload?.message || `Local AI request failed (${response.status}).`;
            throw new Error(remoteMessage);
        }
        const reply = extractLocalChatText(payload);
        if (!reply) {
            throw new Error('AI did not return a response.');
        }
        return {
            reply,
            model: LOCAL_AI_CHAT_MODEL,
            provider: normalizedProvider === 'ollama' ? 'ollama' : 'local'
        };
    }

    if (normalizedProvider !== 'gemini') {
        throw new Error('AI chat is not configured.');
    }
    if (!GEMINI_CHAT_API_KEY) {
        throw new Error('Gemini chat is not configured on this server.');
    }

    const contents = normalizedMessages.map((entry) => ({
        role: entry.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: entry.content }]
    }));

    const response = await withTimeout(
        fetch(`${GEMINI_CHAT_API_URL}/${encodeURIComponent(GEMINI_CHAT_MODEL)}:generateContent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': GEMINI_CHAT_API_KEY
            },
            body: JSON.stringify({
                system_instruction: systemPrompt
                    ? { parts: [{ text: systemPrompt }] }
                    : undefined,
                generationConfig: {
                    temperature,
                    maxOutputTokens,
                    responseMimeType: 'text/plain'
                },
                contents
            })
        }),
        AI_CHAT_TIMEOUT_MS,
        'Gemini'
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const remoteMessage = payload?.error?.message || `Gemini request failed (${response.status}).`;
        throw new Error(remoteMessage);
    }

    const reply = extractGeminiChatText(payload);
    if (!reply) {
        throw new Error('AI did not return a response.');
    }

    return {
        reply,
        model: GEMINI_CHAT_MODEL,
        provider: 'gemini'
    };
}

async function requestCompleteChatCompletion({
    provider,
    systemPrompt = '',
    messages = [],
    temperature = AI_CHAT_TEMPERATURE,
    maxOutputTokens = AI_CHAT_MAX_OUTPUT_TOKENS
} = {}) {
    const normalizedMessages = normalizeChatMessages(messages);
    const initialTokenBudget = Math.max(200, Number(maxOutputTokens || AI_CHAT_MAX_OUTPUT_TOKENS));
    const firstResponse = await requestChatCompletion({
        provider,
        systemPrompt,
        messages: normalizedMessages,
        temperature,
        maxOutputTokens: initialTokenBudget
    });

    if (!isReplyLikelyIncomplete(firstResponse.reply)) {
        return firstResponse;
    }

    const retryInstruction = [
        'Your previous answer was cut off.',
        'Reply again from the start as one complete message.',
        'Do not end mid-sentence, after a colon, or with an unfinished numbered list.'
    ].join(' ');
    const retryTokenBudget = Math.max(initialTokenBudget + 400, Math.round(initialTokenBudget * 1.6));
    const retryResponse = await requestChatCompletion({
        provider,
        systemPrompt,
        messages: [
            ...normalizedMessages,
            { role: 'user', content: retryInstruction }
        ],
        temperature,
        maxOutputTokens: retryTokenBudget
    });

    return isReplyLikelyIncomplete(retryResponse.reply)
        ? firstResponse
        : retryResponse;
}

async function summarizeChatMemory({ provider, previousSummary = '', messages = [] } = {}) {
    const normalizedMessages = normalizeChatMessages(messages);
    if (!normalizedMessages.length) {
        return String(previousSummary || '').trim();
    }

    const summaryPrompt = buildMemorySummaryPrompt({
        previousSummary,
        messages: normalizedMessages
    });

    const response = await requestChatCompletion({
        provider,
        systemPrompt: 'You are a concise memory summarizer.',
        messages: [{ role: 'user', content: summaryPrompt }],
        temperature: 0.1,
        maxOutputTokens: 240
    });

    return String(response.reply || '')
        .trim()
        .slice(0, AI_CHAT_MEMORY_MAX_SUMMARY_CHARS);
}

function withTimeout(promise, timeoutMs, providerLabel = 'AI provider') {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return promise;
    }

    let timeoutHandle = null;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(new Error(`${providerLabel} request timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    });
}

async function warmLocalAiModel() {
    if (!isLocalChatConfigured()) {
        return;
    }
    const endpoint = getLocalChatEndpoint();
    if (!endpoint) {
        return;
    }

    const body = {
        model: LOCAL_AI_CHAT_MODEL,
        stream: false,
        options: {
            num_predict: 1
        },
        messages: [{ role: 'user', content: 'ping' }]
    };
    if (LOCAL_AI_CHAT_KEEP_ALIVE) {
        body.keep_alive = LOCAL_AI_CHAT_KEEP_ALIVE;
    }
    if (Number.isFinite(LOCAL_AI_CHAT_NUM_CTX) && LOCAL_AI_CHAT_NUM_CTX > 0) {
        body.options.num_ctx = Math.floor(LOCAL_AI_CHAT_NUM_CTX);
    }

    try {
        await withTimeout(
            fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }),
            Math.min(Math.max(AI_CHAT_TIMEOUT_MS, 5_000), 30_000),
            'Local AI warmup'
        );
    } catch (error) {
        console.warn('Local AI warmup failed:', error?.message || error);
    }
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

    const branchName = user.branch_name || user.branchName || '';
    const branchId = user.branch_id || user.branchId || '';
    return {
        id: user.id,
        name: user.name,
        role: user.role,
        company_id: user.company_id || '',
        company_code: user.company_code || '',
        branch_id: branchId,
        branch_name: branchName,
        profile_picture: normalizeValue(user.profile_picture),
        feature_access: normalizeUserFeatureAccess(user.feature_access || {}),
        time_zone: store.ATTENDANCE_TIME_ZONE || SERVER_CONFIG.timeZone
    };
}

function normalizeSupportSession(value = null) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const companyId = String(value.companyId || value.company_id || '').trim();
    const operatorUserId = String(value.operatorUserId || value.operator_user_id || '').trim();
    if (!companyId || !operatorUserId) {
        return null;
    }

    return {
        active: true,
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

function serializeSupportSession(value = null) {
    const supportSession = normalizeSupportSession(value);
    if (!supportSession) {
        return null;
    }

    return {
        active: true,
        company_id: supportSession.companyId,
        company_code: supportSession.companyCode,
        company_name: supportSession.companyName,
        operator_user_id: supportSession.operatorUserId,
        operator_name: supportSession.operatorName,
        operator_role: supportSession.operatorRole,
        target_user_id: supportSession.targetUserId,
        target_role: supportSession.targetRole,
        started_at: supportSession.startedAt
    };
}

function buildSupportSessionFromSession(session) {
    return normalizeSupportSession(session?.supportSession || null);
}

function serializeSessionResponse(session) {
    if (!session?.user) {
        return null;
    }

    const payload = serializeSessionUser({
        ...session.user,
        company_code: session.companyCode || ''
    });
    const supportSession = serializeSupportSession(session?.supportSession);
    if (supportSession) {
        payload.support_session = supportSession;
    }
    return payload;
}

function getSessionAuditActorUserId(session) {
    return String(session?.supportSession?.operatorUserId || session?.userId || '').trim();
}

function buildSupportAuditDetails({
    req,
    res,
    session = null,
    supportSession = null,
    targetUserId = '',
    targetUserName = '',
    targetRole = '',
    message = '',
    endedAt = ''
} = {}) {
    const requestMeta = getRequestMeta(req, res);
    const resolvedSupportSession = normalizeSupportSession(supportSession || session?.supportSession || null);

    return {
        accountId: String(targetUserId || resolvedSupportSession?.targetUserId || session?.userId || '').trim(),
        accountName: String(targetUserName || session?.user?.name || '').trim(),
        accountRole: String(targetRole || resolvedSupportSession?.targetRole || session?.role || '').trim(),
        companyId: String(resolvedSupportSession?.companyId || session?.companyId || '').trim(),
        companyCode: String(resolvedSupportSession?.companyCode || session?.companyCode || '').trim(),
        companyName: String(resolvedSupportSession?.companyName || '').trim(),
        loginMethod: 'support_session',
        deviceId: requestMeta.deviceId,
        ipAddress: requestMeta.ipAddress,
        networkKey: buildNetworkFingerprint(requestMeta.ipAddress),
        userAgent: requestMeta.userAgent,
        host: requestMeta.host,
        path: String(req?.url || '').trim(),
        status: 'success',
        message: String(message || '').trim(),
        supportMode: true,
        supportOperatorId: String(resolvedSupportSession?.operatorUserId || session?.userId || '').trim(),
        supportOperatorName: String(resolvedSupportSession?.operatorName || session?.user?.name || session?.userId || '').trim(),
        supportOperatorRole: String(resolvedSupportSession?.operatorRole || session?.role || '').trim(),
        supportStartedAt: String(resolvedSupportSession?.startedAt || '').trim(),
        supportEndedAt: String(endedAt || '').trim()
    };
}

function recordSupportAuditEvent(req, res, {
    action = '',
    session = null,
    supportSession = null,
    targetUserId = '',
    targetUserName = '',
    targetRole = '',
    message = '',
    endedAt = ''
} = {}) {
    const details = buildSupportAuditDetails({
        req,
        res,
        session,
        supportSession,
        targetUserId,
        targetUserName,
        targetRole,
        message,
        endedAt
    });

    store.recordAuditEvent({
        companyId: details.companyId || '',
        actorUserId: String(details.supportOperatorId || getSessionAuditActorUserId(session) || '').trim(),
        action,
        targetType: 'user',
        targetId: String(targetUserId || details.accountId || '').trim(),
        details: Object.entries(details).reduce((payload, [key, value]) => {
            if (value !== '') {
                payload[key] = value;
            }
            return payload;
        }, {})
    });
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

    if (SECURE_COOKIES && String(SERVER_CONFIG.publicUrl || '').trim().toLowerCase().startsWith('https://')) {
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
        buildToken: getServerBuildToken(),
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

function resolveDeviceId(req, res) {
    const cookies = parseCookies(req.headers.cookie);
    let deviceId = String(cookies[DEVICE_COOKIE_NAME] || '').trim();
    if (!deviceId) {
        deviceId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
        appendSetCookie(res, buildDeviceCookie(deviceId, { host: req.headers.host || '' }));
    }

    return deviceId;
}

function normalizeHostName(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .split(':')[0];
}

function isIpHost(host = '') {
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

function getBaseCookieDomain(host = '') {
    const normalizedHost = normalizeHostName(host);
    if (!normalizedHost) {
        return '';
    }

    if (['localhost', '127.0.0.1', '::1'].includes(normalizedHost) || isIpHost(normalizedHost)) {
        return '';
    }

    const parts = normalizedHost.split('.').filter(Boolean);
    if (parts.length < 2) {
        return '';
    }

    return parts.slice(-2).join('.');
}

function resolveCookieDomain(host = '') {
    if (COOKIE_DOMAIN_OVERRIDE) {
        return COOKIE_DOMAIN_OVERRIDE;
    }

    return getBaseCookieDomain(host);
}

function shouldUseSecureCookiesForHost(host = '') {
    if (!SECURE_COOKIES) {
        return false;
    }

    const normalizedHost = normalizeHostName(host);
    if (!normalizedHost) {
        return false;
    }

    if (['localhost', '127.0.0.1', '::1'].includes(normalizedHost) || isIpHost(normalizedHost)) {
        return false;
    }

    return true;
}

function buildDeviceCookie(deviceId, { host = '' } = {}) {
    const parts = [
        `${DEVICE_COOKIE_NAME}=${encodeURIComponent(deviceId)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        `Max-Age=${DEVICE_COOKIE_MAX_AGE_SEC}`
    ];

    const cookieDomain = resolveCookieDomain(host);
    if (cookieDomain) {
        parts.push(`Domain=${cookieDomain}`);
    }

    if (shouldUseSecureCookiesForHost(host)) {
        parts.push('Secure');
    }

    return parts.join('; ');
}

function buildSessionCookie(token, { host = '' } = {}) {
    const parts = [
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
    ];

    const cookieDomain = resolveCookieDomain(host);
    if (cookieDomain) {
        parts.push(`Domain=${cookieDomain}`);
    }

    if (shouldUseSecureCookiesForHost(host)) {
        parts.push('Secure');
    }

    return parts.join('; ');
}

function buildExpiredSessionCookie({ host = '', forceHostOnly = false } = {}) {
    const parts = [
        `${SESSION_COOKIE_NAME}=`,
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        'Max-Age=0'
    ];

    const cookieDomain = forceHostOnly ? '' : resolveCookieDomain(host);
    if (cookieDomain) {
        parts.push(`Domain=${cookieDomain}`);
    }

    if (shouldUseSecureCookiesForHost(host)) {
        parts.push('Secure');
    }

    return parts.join('; ');
}

function clearSessionCookie(res, { host = '' } = {}) {
    appendSetCookie(res, buildExpiredSessionCookie({ host }));

    if (resolveCookieDomain(host)) {
        appendSetCookie(res, buildExpiredSessionCookie({ host, forceHostOnly: true }));
    }
}

function getRequestMeta(req, res) {
    if (req?.__gmsRequestMeta) {
        return req.__gmsRequestMeta;
    }

    const meta = {
        deviceId: req && res ? resolveDeviceId(req, res) : '',
        ipAddress: req ? getClientIp(req) : '',
        userAgent: String(req?.headers?.['user-agent'] || '').trim(),
        host: String(req?.headers?.host || '').trim()
    };

    if (req) {
        req.__gmsRequestMeta = meta;
    }

    return meta;
}

function getCachedRequestSession(req, res) {
    if (req && Object.prototype.hasOwnProperty.call(req, '__gmsSession')) {
        return req.__gmsSession;
    }

    const session = getRequestSession(req, res);
    if (req) {
        req.__gmsSession = session;
    }
    return session;
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

        const expiredWindow = now - value.firstFailureAt > LOGIN_ATTEMPT_WINDOW_MS;
        const expiredBlock = Boolean(value.blockedUntil) && value.blockedUntil <= now;
        if (expiredWindow || expiredBlock) {
            loginAttempts.delete(key);
        }
    }
}

function createSession(user, { supportSession = null } = {}) {
    const payload = {
        userKey: user.user_key || '',
        username: user.id,
        companyId: user.company_id || '',
        role: user.role,
        expiresAt: Date.now() + SESSION_TTL_MS
    };
    const normalizedSupportSession = normalizeSupportSession(supportSession);
    if (normalizedSupportSession) {
        payload.supportMode = true;
        payload.supportSession = normalizedSupportSession;
    }
    return createSessionToken(payload);
}

function invalidateSession() {
    return null;
}

function getClientIp(req) {
    let candidate = '';
    if (TRUST_PROXY) {
        candidate = String(req.headers['x-forwarded-for'] || '')
            .split(',')[0]
            .trim();
    }

    if (!candidate) {
        candidate = req.socket.remoteAddress || 'unknown';
    }

    const normalized = String(candidate || '').trim().replace(/^\[|\]$/g, '');
    if (!normalized || normalized.toLowerCase() === 'unknown') {
        return 'unknown';
    }
    if (normalized.toLowerCase() === '::1') {
        return '127.0.0.1';
    }
    if (normalized.toLowerCase().startsWith('::ffff:')) {
        return normalized.slice(7);
    }
    return normalized;
}

function normalizeLoginAttemptSegment(value = '') {
    return String(value || '').trim().toLowerCase();
}

function buildLoginAttemptKey({ companyCode = '', username = '', host = '' } = {}) {
    const normalizedUsername = normalizeLoginAttemptSegment(username);
    if (!normalizedUsername) {
        return '';
    }

    const hostCompany = store.getCompanyByHost(host);
    const normalizedCompanyCode = normalizeLoginAttemptSegment(
        hostCompany?.company_code || companyCode
    );
    const scope = normalizedCompanyCode || 'super_admin';
    return `${scope}::${normalizedUsername}`;
}

function getLoginRetryAfterSeconds(blockedUntil = 0, now = Date.now()) {
    const blockedUntilMs = Number(blockedUntil || 0);
    if (!Number.isFinite(blockedUntilMs)) {
        return 30;
    }
    const remainingMs = blockedUntilMs - now;
    return Math.max(1, Math.ceil(remainingMs / 1000));
}

function buildLoginAttemptBlockedMessage(retryAfterSeconds = 30) {
    const numericSeconds = Number(retryAfterSeconds);
    const seconds = Number.isFinite(numericSeconds) && numericSeconds > 0
        ? Math.ceil(numericSeconds)
        : 30;
    return `Too many failed login attempts for this account. Please try again in ${seconds} seconds.`;
}

function buildNetworkFingerprint(ipAddress = '') {
    const normalized = String(ipAddress || '').trim().replace(/^::ffff:/i, '');
    if (!normalized || normalized.toLowerCase() === 'unknown') {
        return '';
    }

    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) {
        const parts = normalized.split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
    }

    if (normalized.includes(':')) {
        const parts = normalized.split(':').filter(Boolean);
        return parts.length ? `${parts.slice(0, 4).join(':')}::*` : normalized;
    }

    return normalized;
}

function buildAuthAuditDetails({
    req,
    res,
    user = null,
    session = null,
    companyId = '',
    companyCode = '',
    companyName = '',
    loginMethod = '',
    loginHandle = '',
    status = '',
    message = ''
} = {}) {
    const requestMeta = getRequestMeta(req, res);
    const resolvedCompany = store.getCompanyByHost(requestMeta.host)
        || (companyCode ? store.getCompanyByCodeOrHost(companyCode, requestMeta.host) : null);
    const supportSession = buildSupportSessionFromSession(session);
    const accountId = String(user?.id || session?.userId || loginHandle || '').trim();
    const accountName = String(user?.name || session?.user?.name || '').trim();
    const accountRole = String(user?.role || session?.role || '').trim();
    const resolvedCompanyId = String(companyId || session?.companyId || user?.company_id || resolvedCompany?.id || '').trim();
    const resolvedCompanyCode = String(companyCode || session?.companyCode || user?.company_code || resolvedCompany?.company_code || '').trim();
    const resolvedCompanyName = String(companyName || user?.company_name || resolvedCompany?.name || '').trim();

    return {
        accountId,
        accountName,
        accountRole,
        companyId: resolvedCompanyId,
        companyCode: resolvedCompanyCode,
        companyName: resolvedCompanyName,
        loginMethod: String(loginMethod || '').trim(),
        loginHandle: String(loginHandle || accountId).trim(),
        deviceId: requestMeta.deviceId,
        ipAddress: requestMeta.ipAddress,
        networkKey: buildNetworkFingerprint(requestMeta.ipAddress),
        userAgent: requestMeta.userAgent,
        host: requestMeta.host,
        path: String(req?.url || '').trim(),
        status: String(status || '').trim() || 'success',
        message: String(message || '').trim(),
        supportMode: supportSession ? 'true' : '',
        supportOperatorId: String(supportSession?.operatorUserId || '').trim(),
        supportOperatorName: String(supportSession?.operatorName || '').trim(),
        supportOperatorRole: String(supportSession?.operatorRole || '').trim(),
        supportStartedAt: String(supportSession?.startedAt || '').trim()
    };
}

function recordAuthAuditEvent(req, res, {
    action = '',
    user = null,
    session = null,
    actorUserId = '',
    targetId = '',
    companyId = '',
    companyCode = '',
    companyName = '',
    loginMethod = '',
    loginHandle = '',
    status = '',
    message = ''
} = {}) {
    const details = buildAuthAuditDetails({
        req,
        res,
        user,
        session,
        companyId,
        companyCode,
        companyName,
        loginMethod,
        loginHandle,
        status,
        message
    });
    const resolvedActorUserId = String(actorUserId || user?.id || session?.userId || '').trim();
    const resolvedTargetId = String(targetId || details.accountId || details.loginHandle || '').trim();
    const resolvedCompanyId = String(companyId || details.companyId || '').trim();

    store.recordAuditEvent({
        companyId: resolvedCompanyId,
        actorUserId: resolvedActorUserId,
        action,
        targetType: 'user',
        targetId: resolvedTargetId,
        details: Object.entries(details).reduce((payload, [key, value]) => {
            if (value !== '') {
                payload[key] = value;
            }
            return payload;
        }, {})
    });
}

function getLoginAttemptState(key, now = Date.now()) {
    const state = loginAttempts.get(key);
    if (!state) {
        return null;
    }

    if (state.blockedUntil && state.blockedUntil > now) {
        return state;
    }

    const blockExpired = Boolean(state.blockedUntil) && state.blockedUntil <= now;
    const windowExpired = now - state.firstFailureAt > LOGIN_ATTEMPT_WINDOW_MS;
    if (blockExpired || windowExpired) {
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
        nextState.blockedUntil = now + LOGIN_LOCKOUT_MS;
    }

    loginAttempts.set(key, nextState);
    return nextState;
}

function clearLoginFailures(key) {
    loginAttempts.delete(key);
}

function cleanupExpiredGoogleLoginStates(now = Date.now()) {
    for (const [key, value] of googleLoginStates.entries()) {
        if (!value || (now - value.createdAt) > GOOGLE_OAUTH_STATE_TTL_MS) {
            googleLoginStates.delete(key);
        }
    }
}

function createGoogleLoginState({ companyCode = '' } = {}) {
    cleanupExpiredGoogleLoginStates();
    const state = crypto.randomBytes(24).toString('base64url');
    googleLoginStates.set(state, {
        companyCode: String(companyCode || '').trim(),
        createdAt: Date.now()
    });
    return state;
}

function consumeGoogleLoginState(state) {
    cleanupExpiredGoogleLoginStates();
    const entry = googleLoginStates.get(state);
    googleLoginStates.delete(state);
    return entry || null;
}

function isGoogleOauthConfigured() {
    return Boolean(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET);
}

function resolveRequestProtocol(req) {
    if (TRUST_PROXY) {
        const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
        if (forwardedProto) {
            return forwardedProto;
        }
    }

    if (req.socket?.encrypted) {
        return 'https';
    }

    return shouldUseSecureCookiesForHost(req.headers.host || '') ? 'https' : 'http';
}

function resolveBaseUrl(req) {
    const configured = String(SERVER_CONFIG.publicUrl || RUNTIME_CONFIG.publicUrl || '').trim();
    if (configured) {
        return configured.replace(/\/+$/, '');
    }

    const host = String(req.headers.host || '127.0.0.1').trim();
    return `${resolveRequestProtocol(req)}://${host}`.replace(/\/+$/, '');
}

function resolveGoogleRedirectUri(req) {
    if (GOOGLE_OAUTH_REDIRECT_URI) {
        return GOOGLE_OAUTH_REDIRECT_URI;
    }

    return `${resolveBaseUrl(req)}/api/auth/google/callback`;
}

function buildGoogleAuthUrl({ redirectUri, state }) {
    const params = new URLSearchParams({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: GOOGLE_OAUTH_SCOPES,
        state,
        access_type: 'online',
        prompt: 'select_account'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    let payload = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch (_error) {
        payload = null;
    }

    if (!response.ok) {
        const message = payload?.error_description || payload?.error || text || 'Request failed.';
        const error = new Error(message);
        error.statusCode = response.status;
        throw error;
    }

    return payload;
}

async function exchangeGoogleCodeForTokens({ code, redirectUri }) {
    const body = new URLSearchParams({
        code,
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
    });

    return fetchJson('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });
}

async function fetchGoogleTokenInfo(idToken) {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    return fetchJson(url);
}

function redirectToLoginWithError(res, message, companyCode = '') {
    const params = new URLSearchParams();
    if (message) {
        params.set('authError', message);
    }
    if (companyCode) {
        params.set('companyCode', companyCode);
    }
    const query = params.toString();
    const location = query ? `/login.html?${query}` : '/login.html';
    res.writeHead(302, { Location: location });
    res.end();
}

function isFirebaseConfigured() {
    return Boolean(FIREBASE_PROJECT_ID);
}

function decodeJwtPart(value = '') {
    const text = Buffer.from(value, 'base64url').toString('utf8');
    return JSON.parse(text);
}

function parseCacheMaxAge(value = '') {
    const match = String(value || '').match(/max-age=(\d+)/i);
    return match ? Number(match[1]) : 0;
}

function isEmailDeliveryConfigured() {
    return Boolean(SMTP_HOST && SMTP_FROM);
}

function getNodemailer() {
    if (!nodemailer) {
        // Lazy-load so non-email features still work without the dependency.
        nodemailer = require('nodemailer');
    }
    return nodemailer;
}

let smtpTransport = null;
function getSmtpTransport() {
    if (!smtpTransport) {
        const transporter = getNodemailer().createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_SECURE,
            auth: SMTP_USER
                ? {
                    user: SMTP_USER,
                    pass: SMTP_PASS
                }
                : undefined
        });
        smtpTransport = transporter;
    }
    return smtpTransport;
}

async function sendVerificationEmail({
    to,
    code,
    companyName = '',
    appName = '',
    actionText = 'finish connecting your account',
    contextLabel = 'verification code'
} = {}) {
    if (!isEmailDeliveryConfigured()) {
        throw new Error('Email delivery is not configured.');
    }

    const resolvedApp = String(appName || 'GMS ERP').trim();
    const resolvedCompany = String(companyName || '').trim();
    const resolvedActionText = String(actionText || 'finish connecting your account').trim();
    const resolvedContextLabel = String(contextLabel || 'verification code').trim();
    const subjectBase = resolvedCompany ? `${resolvedCompany} - ${resolvedApp}` : resolvedApp;
    const subject = `${subjectBase} ${resolvedContextLabel}`;
    const ttlLabel = `${EMAIL_CODE_TTL_MINUTES} minutes`;
    const safeCode = String(code || '').trim();
    const text = `Your ${resolvedApp} ${resolvedContextLabel} is ${safeCode}. It expires in ${ttlLabel}.`;
    const html = `
        <div style="font-family: Arial, sans-serif; color: #0f172a;">
            <h2 style="margin: 0 0 12px; font-size: 20px;">${resolvedApp} ${resolvedContextLabel}</h2>
            ${resolvedCompany ? `<p style="margin: 0 0 12px;">Company: <strong>${resolvedCompany}</strong></p>` : ''}
            <p style="margin: 0 0 12px;">Use this code to ${resolvedActionText}:</p>
            <div style="font-size: 28px; font-weight: 700; letter-spacing: 0.12em; padding: 10px 16px; background: #f1f5f9; border-radius: 10px; display: inline-block;">
                ${safeCode}
            </div>
            <p style="margin: 14px 0 0; font-size: 13px; color: #475569;">
                This code expires in ${ttlLabel}. If you did not request this, you can ignore this email.
            </p>
        </div>
    `;

    await getSmtpTransport().sendMail({
        from: SMTP_FROM,
        to,
        subject,
        text,
        html
    });
}

async function sendPasswordResetCodeEmail({ to, code, companyName = '', appName = '' } = {}) {
    if (!isEmailDeliveryConfigured()) {
        throw new Error('Email delivery is not configured.');
    }

    const resolvedApp = String(appName || 'GMS ERP').trim();
    const resolvedCompany = String(companyName || '').trim();
    const subjectBase = resolvedCompany ? `${resolvedCompany} - ${resolvedApp}` : resolvedApp;
    const subject = `${subjectBase} password reset code`;
    const ttlLabel = `${EMAIL_CODE_TTL_MINUTES} minutes`;
    const safeCode = String(code || '').trim();
    const text = `Your ${resolvedApp} password reset code is ${safeCode}. It expires in ${ttlLabel}.`;
    const html = `
        <div style="font-family: Arial, sans-serif; color: #0f172a;">
            <h2 style="margin: 0 0 12px; font-size: 20px;">${resolvedApp} password reset</h2>
            ${resolvedCompany ? `<p style="margin: 0 0 12px;">Company: <strong>${resolvedCompany}</strong></p>` : ''}
            <p style="margin: 0 0 12px;">Use this code to reset your password:</p>
            <div style="font-size: 28px; font-weight: 700; letter-spacing: 0.12em; padding: 10px 16px; background: #f1f5f9; border-radius: 10px; display: inline-block;">
                ${safeCode}
            </div>
            <p style="margin: 14px 0 0; font-size: 13px; color: #475569;">
                This code expires in ${ttlLabel}. If you did not request this, you can ignore this email.
            </p>
        </div>
    `;

    await getSmtpTransport().sendMail({
        from: SMTP_FROM,
        to,
        subject,
        text,
        html
    });
}

async function getFirebaseCerts() {
    const now = Date.now();
    if (firebaseCertCache.certs && firebaseCertCache.expiresAt > now) {
        return firebaseCertCache.certs;
    }

    const response = await fetch(FIREBASE_CERTS_URL);
    if (!response.ok) {
        throw new Error('Unable to fetch Firebase certificates.');
    }

    const certs = await response.json();
    const maxAge = parseCacheMaxAge(response.headers.get('cache-control') || '');
    firebaseCertCache.certs = certs;
    firebaseCertCache.expiresAt = now + Math.max(0, maxAge) * 1000;
    return certs;
}

async function verifyFirebaseIdToken(idToken = '') {
    if (!isFirebaseConfigured()) {
        throw new Error('Firebase project is not configured.');
    }

    const parts = String(idToken || '').split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid Firebase token.');
    }

    const [headerPart, payloadPart, signaturePart] = parts;
    const header = decodeJwtPart(headerPart);
    const payload = decodeJwtPart(payloadPart);

    if (!header?.kid || header.alg !== 'RS256') {
        throw new Error('Invalid Firebase token header.');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!payload?.exp || Number(payload.exp) < nowSeconds) {
        throw new Error('Firebase token expired.');
    }

    const expectedIssuer = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
    if (payload.aud !== FIREBASE_PROJECT_ID || payload.iss !== expectedIssuer) {
        throw new Error('Firebase token audience mismatch.');
    }

    const certs = await getFirebaseCerts();
    const cert = certs[header.kid];
    if (!cert) {
        throw new Error('Firebase token certificate not found.');
    }

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerPart}.${payloadPart}`);
    verifier.end();
    const signature = Buffer.from(signaturePart, 'base64url');
    const isValid = verifier.verify(cert, signature);
    if (!isValid) {
        throw new Error('Invalid Firebase token signature.');
    }

    return payload;
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
        clearSessionCookie(res, { host: req.headers.host || '' });
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
        clearSessionCookie(res, { host: req.headers.host || '' });
        return null;
    }

    let company = null;
    if (session.companyId) {
        company = store.getCompanyById(session.companyId) || null;
    }
    const supportSession = normalizeSupportSession(session.supportSession || null);

    return {
        token,
        userKey: session.userKey || '',
        userId: user.id,
        username: user.id,
        companyId: user.company_id || session.companyId || '',
        companyCode: company?.company_code || '',
        role: user.role,
        user,
        supportSession
    };
}

function isHeadAdmin(session) {
    return Boolean(store.isCompanyAdminRole(session?.role));
}

function isEmployee(session) {
    return String(session?.role || '').toLowerCase() === String(store.ROLE_EMPLOYEE || 'employee').toLowerCase();
}

function isStaff(session) {
    return String(session?.role || '').toLowerCase() === String(store.ROLE_STAFF || 'staff').toLowerCase();
}

function isSuperAdmin(session) {
    return String(session?.role || '').toLowerCase() === 'super_admin';
}

function canViewInventoryCostPrice(session) {
    return isSuperAdmin(session) || isHeadAdmin(session);
}

function sanitizeInventoryVariantForSession(session, row) {
    if (!row || canViewInventoryCostPrice(session)) {
        return row;
    }

    const sanitizedRow = { ...row };
    delete sanitizedRow.cost_price;
    delete sanitizedRow.costPrice;
    return sanitizedRow;
}

function sanitizeInventoryVariantListForSession(session, rows = []) {
    return Array.isArray(rows)
        ? rows.map((row) => sanitizeInventoryVariantForSession(session, row))
        : [];
}

function sanitizeSaleItemForSession(session, item) {
    if (!item || isSuperAdmin(session) || isHeadAdmin(session)) {
        return item;
    }

    const sanitizedItem = { ...item };
    delete sanitizedItem.unit_cost_price;
    delete sanitizedItem.unitCostPrice;
    delete sanitizedItem.line_cost_total;
    delete sanitizedItem.lineCostTotal;
    delete sanitizedItem.line_profit;
    delete sanitizedItem.lineProfit;
    return sanitizedItem;
}

function sanitizeSaleOrderForSession(session, order) {
    if (!order || isSuperAdmin(session) || isHeadAdmin(session)) {
        return order;
    }

    return {
        ...order,
        items: Array.isArray(order.items)
            ? order.items.map((item) => sanitizeSaleItemForSession(session, item))
            : []
    };
}

function normalizeBranchName(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getSessionBranchName(session) {
    const directBranchName = String(session?.user?.branch_name || session?.branchName || '').trim();
    if (directBranchName) {
        return directBranchName;
    }

    const branchId = String(session?.user?.branch_id || session?.branchId || '').trim();
    const companyId = String(session?.user?.company_id || session?.companyId || '').trim();
    if (!branchId) {
        return '';
    }

    try {
        return String(store.getBranchById(branchId, companyId)?.branch_name || '').trim();
    } catch (_error) {
        return '';
    }
}

function canSessionEditAssignedBranch(session, branchName = '') {
    if (isSuperAdmin(session) || isHeadAdmin(session)) {
        return true;
    }

    if (!isEmployee(session) && !isStaff(session)) {
        return false;
    }

    const requestedBranch = normalizeBranchName(branchName);
    const assignedBranch = normalizeBranchName(getSessionBranchName(session));
    return Boolean(requestedBranch && assignedBranch && requestedBranch === assignedBranch);
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

function requireAssignedBranchEditAccess(res, session, branchName, actionLabel = 'This action') {
    if (!requireSession(res, session)) {
        return false;
    }

    if (canSessionEditAssignedBranch(session, branchName)) {
        return true;
    }

    sendError(res, 403, `${actionLabel} is only allowed for your assigned branch.`, 'FORBIDDEN');
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
            context.actorUserId = session.supportSession?.operatorUserId || session.userId;
            context.supportSession = session.supportSession || null;
        }
        return fn();
    });
}

function buildWorkflowRequestContext(session) {
    return {
        requestUserId: session?.userId || session?.user?.id || '',
        requestUserName: session?.user?.name || session?.username || session?.userId || '',
        requestRole: session?.role || session?.user?.role || '',
        requestBranchId: session?.user?.branch_id || '',
        requestBranchName: session?.user?.branch_name || ''
    };
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

function normalizeEmailAddress(value = '') {
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

function resolveSuperAdminCompanyByCode(companyCode = '') {
    const normalizedCompanyCode = String(companyCode || '').trim();
    validateRequired(normalizedCompanyCode, 'Company code');
    const company = store.getCompanyByCodeOrHost(normalizedCompanyCode, '');
    if (!company) {
        throw new Error('Company not found.');
    }
    return company;
}

function startSuperAdminSupportSession(req, res, session, company) {
    const targetAdmin = store.getPrimaryCompanyAdminUser(company.id);
    if (!targetAdmin) {
        sendError(res, 404, 'Company admin account not found.', 'NOT_FOUND');
        return true;
    }

    const supportSession = normalizeSupportSession({
        companyId: company.id,
        companyCode: company.company_code || '',
        companyName: company.name || '',
        operatorUserId: session.userId || '',
        operatorUserKey: session.userKey || '',
        operatorName: session.user?.name || session.userId || '',
        operatorRole: session.role || store.ROLE_SUPER_ADMIN,
        targetUserId: targetAdmin.username || '',
        targetRole: targetAdmin.role || '',
        startedAt: new Date().toISOString()
    });

    appendSetCookie(res, buildSessionCookie(createSession({
        user_key: targetAdmin.id || '',
        id: targetAdmin.username || '',
        role: targetAdmin.role || store.ROLE_COMPANY_ADMIN || 'company_admin',
        company_id: company.id || '',
        company_code: company.company_code || '',
        company_name: company.name || '',
        name: targetAdmin.display_name || targetAdmin.username || ''
    }, {
        supportSession
    }), { host: req.headers.host || '' }));

    if (req) {
        req.__gmsSession = null;
    }

    recordSupportAuditEvent(req, res, {
        action: 'support_access.start',
        session,
        supportSession,
        targetUserId: targetAdmin.username || '',
        targetUserName: targetAdmin.display_name || targetAdmin.username || '',
        targetRole: targetAdmin.role || '',
        message: 'Super admin started a logged support session.'
    });

    sendSuccess(res, {
        redirectPath: '/head_admin/dashboard.html',
        company: {
            id: company.id,
            company_code: company.company_code || '',
            name: company.name || ''
        },
        support_session: serializeSupportSession(supportSession)
    });
    return true;
}

async function handleApiRequest(req, res, urlObject, contextReady = false) {
    const pathname = urlObject.pathname;
    const searchParams = urlObject.searchParams;
    const session = getCachedRequestSession(req, res);
    const tenantContextOptionalPaths = new Set([
        '/api/server-info',
        '/api/public-branding',
        '/api/session',
        '/api/login',
        '/api/login/firebase',
        '/api/logout',
        '/api/support-session/end',
        '/api/auth/google',
        '/api/auth/google/callback',
        '/api/client-config'
    ]);

    if (
        !contextReady
        && session?.companyId
        && !pathname.startsWith('/api/super/')
        && !pathname.startsWith('/api/public/')
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

    if (req.method === 'POST' && pathname === '/api/public/ai/chat') {
        const body = await readJsonBody(req);
        const message = sanitizeChatText(body.message || body.prompt || '');
        if (!message) {
            sendError(res, 400, 'Message is required.', 'VALIDATION_ERROR');
            return;
        }

        const threadId = sanitizeChatThreadId(body.threadId || body.conversationId || body.chatId || '');
        const memoryKey = buildChatMemoryKey(threadId, session);
        const memory = memoryKey ? store.getAiChatMemory(memoryKey) : null;
        const memorySummary = memory?.summary || '';
        const memoryMessages = Array.isArray(memory?.messages) ? memory.messages : [];

        const history = mergeChatHistory(memoryMessages, body.history || body.messages || []);
        const transcriptHistory = mergeAiTranscriptHistory(
            memoryMessages,
            body.transcriptHistory || body.conversationHistory || body.history || body.messages || []
        );
        const trimmedMessage = message.slice(0, AI_CHAT_MAX_MESSAGE_CHARS);
        const customerServiceConfig = getCustomerServiceConfigForAi();
        const requestedCompanyCode = String(body.companyCode || body.company_code || '').trim();
        let aiCompany = session?.companyId ? store.getCompanyById(session.companyId) : null;
        if (!aiCompany) {
            try {
                aiCompany = resolvePublicCompany(req, requestedCompanyCode);
            } catch (_error) {
                aiCompany = null;
            }
        }
        const assistantBranding = {
            appName: aiCompany?.app_name || store.PARENT_BRAND.appName,
            companyName: aiCompany?.name || ''
        };
        const assistantIdentity = buildAssistantBrandingContext(assistantBranding);
        const directCustomerServiceReply = getDirectCustomerServiceReply(trimmedMessage, customerServiceConfig);
        const staticReply = directCustomerServiceReply
            || getSmallTalkReply(trimmedMessage, assistantBranding)
            || getAgentOverviewReply(trimmedMessage)
            || getGoogleLoginHelpReply(trimmedMessage)
            || getPublicFlowReply(trimmedMessage)
            || getGenericLoginIssueReply(trimmedMessage)
            || getWebsiteSetupReply(trimmedMessage, session?.role)
            || getFeatureOverviewReply(trimmedMessage, session?.role)
            || getStaticKnowledgeReply(trimmedMessage);
        const quickReply = staticReply || getQuickChatReply(trimmedMessage, assistantBranding);
        if (quickReply) {
            const normalizedQuickReply = normalizeChatReplyForDelivery(quickReply, {
                userMessage: trimmedMessage,
                customerServiceConfig
            });
            const finalizedQuickReply = finalizeAiReplyForDelivery({
                reply: normalizedQuickReply,
                session,
                company: aiCompany,
                threadId,
                conversationHistory: transcriptHistory,
                userMessage: trimmedMessage,
                customerServiceConfig,
                assistantName: assistantIdentity.assistantName
            });
            if (memoryKey) {
                const updatedMessages = [
                    ...memoryMessages,
                    { role: 'user', text: trimmedMessage },
                    { role: 'model', text: finalizedQuickReply.reply }
                ];
                const nextMessages = updatedMessages.length > AI_CHAT_MEMORY_MAX_MESSAGES
                    ? updatedMessages.slice(-AI_CHAT_MEMORY_KEEP_LAST)
                    : updatedMessages;
                try {
                    store.saveAiChatMemory({
                        id: memoryKey,
                        companyId: session?.companyId || '',
                        userId: session?.userId || '',
                        summary: memorySummary,
                        messages: nextMessages
                    });
                } catch (_error) {
                    // Ignore memory errors for quick replies
                }
            }
            sendSuccess(res, {
                reply: finalizedQuickReply.reply,
                model: 'static',
                provider: 'static',
                handoffRequestCode: finalizedQuickReply.handoffRequestCode
            });
            return;
        }
        const provider = resolveChatProvider();
        const specialistMode = detectAssistantMode(trimmedMessage, session?.role);
        const systemPrompt = buildAssistantSystemPrompt({
            role: session?.role,
            memorySummary,
            customerServiceConfig,
            specialistMode,
            appName: aiCompany?.app_name || store.PARENT_BRAND.appName,
            companyName: aiCompany?.name || ''
        });

        if (!provider) {
            const finalizedFallbackReply = finalizeAiReplyForDelivery({
                reply: buildCustomerServiceHandoffMessage({
                    message: trimmedMessage,
                    customerServiceConfig
                }),
                session,
                company: aiCompany,
                threadId,
                conversationHistory: transcriptHistory,
                userMessage: trimmedMessage,
                customerServiceConfig,
                assistantName: assistantIdentity.assistantName
            });
            sendSuccess(res, {
                reply: finalizedFallbackReply.reply,
                model: 'customer_service_handoff',
                provider: 'fallback',
                handoffRequestCode: finalizedFallbackReply.handoffRequestCode
            });
            return;
        }

        if (provider === 'ollama' || provider === 'local') {
            if (!isLocalChatConfigured()) {
                const finalizedFallbackReply = finalizeAiReplyForDelivery({
                    reply: buildCustomerServiceHandoffMessage({
                        message: trimmedMessage,
                        customerServiceConfig
                    }),
                    session,
                    company: aiCompany,
                    threadId,
                    conversationHistory: transcriptHistory,
                    userMessage: trimmedMessage,
                    customerServiceConfig,
                    assistantName: assistantIdentity.assistantName
                });
                sendSuccess(res, {
                    reply: finalizedFallbackReply.reply,
                    model: 'customer_service_handoff',
                    provider: 'fallback',
                    handoffRequestCode: finalizedFallbackReply.handoffRequestCode
                });
                return;
            }
        }

        if (provider === 'gemini' && !GEMINI_CHAT_API_KEY) {
            const finalizedFallbackReply = finalizeAiReplyForDelivery({
                reply: buildCustomerServiceHandoffMessage({
                    message: trimmedMessage,
                    customerServiceConfig
                }),
                session,
                company: aiCompany,
                threadId,
                conversationHistory: transcriptHistory,
                userMessage: trimmedMessage,
                customerServiceConfig,
                assistantName: assistantIdentity.assistantName
            });
            sendSuccess(res, {
                reply: finalizedFallbackReply.reply,
                model: 'customer_service_handoff',
                provider: 'fallback',
                handoffRequestCode: finalizedFallbackReply.handoffRequestCode
            });
            return;
        }

        if (!['gemini', 'local', 'ollama'].includes(provider)) {
            const finalizedFallbackReply = finalizeAiReplyForDelivery({
                reply: buildCustomerServiceHandoffMessage({
                    message: trimmedMessage,
                    customerServiceConfig
                }),
                session,
                company: aiCompany,
                threadId,
                conversationHistory: transcriptHistory,
                userMessage: trimmedMessage,
                customerServiceConfig,
                assistantName: assistantIdentity.assistantName
            });
            sendSuccess(res, {
                reply: finalizedFallbackReply.reply,
                model: 'customer_service_handoff',
                provider: 'fallback',
                handoffRequestCode: finalizedFallbackReply.handoffRequestCode
            });
            return;
        }

        try {
            const chatMessages = [
                ...toChatMessagesFromHistory(history),
                { role: 'user', content: trimmedMessage }
            ];
            const response = await requestCompleteChatCompletion({
                provider,
                systemPrompt,
                messages: chatMessages,
                temperature: AI_CHAT_TEMPERATURE,
                maxOutputTokens: AI_CHAT_MAX_OUTPUT_TOKENS
            });
            const normalizedReply = normalizeChatReplyForDelivery(response.reply, {
                userMessage: trimmedMessage,
                customerServiceConfig
            });
            const finalizedReply = finalizeAiReplyForDelivery({
                reply: normalizedReply,
                session,
                company: aiCompany,
                threadId,
                conversationHistory: transcriptHistory,
                userMessage: trimmedMessage,
                customerServiceConfig,
                assistantName: assistantIdentity.assistantName
            });

            if (memoryKey) {
                try {
                    const updatedMessages = [
                        ...memoryMessages,
                        { role: 'user', text: trimmedMessage },
                        { role: 'model', text: finalizedReply.reply }
                    ];
                    let nextSummary = memorySummary;
                    let nextMessages = updatedMessages;
                    if (updatedMessages.length > AI_CHAT_MEMORY_MAX_MESSAGES) {
                        const overflow = updatedMessages.slice(0, -AI_CHAT_MEMORY_KEEP_LAST);
                        try {
                            nextSummary = await summarizeChatMemory({
                                provider,
                                previousSummary: memorySummary,
                                messages: overflow.map((entry) => ({
                                    role: entry.role === 'model' ? 'assistant' : 'user',
                                    content: entry.text || ''
                                }))
                            });
                        } catch (_error) {
                            nextSummary = memorySummary;
                        }
                        nextMessages = updatedMessages.slice(-AI_CHAT_MEMORY_KEEP_LAST);
                    }
                    store.saveAiChatMemory({
                        id: memoryKey,
                        companyId: session?.companyId || '',
                        userId: session?.userId || '',
                        summary: nextSummary,
                        messages: nextMessages
                    });
                } catch (_error) {
                    // Ignore memory save errors so chat still works.
                }
            }

            sendSuccess(res, {
                ...response,
                reply: finalizedReply.reply,
                handoffRequestCode: finalizedReply.handoffRequestCode
            });
            return;
        } catch (error) {
            console.error('AI chat failed, handing off to customer service:', error);
            const fallbackReply = finalizeAiReplyForDelivery({
                reply: buildCustomerServiceHandoffMessage({
                    message: trimmedMessage,
                    customerServiceConfig
                }),
                session,
                company: aiCompany,
                threadId,
                conversationHistory: transcriptHistory,
                userMessage: trimmedMessage,
                customerServiceConfig,
                assistantName: assistantIdentity.assistantName
            });
            if (memoryKey) {
                try {
                    const updatedMessages = [
                        ...memoryMessages,
                        { role: 'user', text: trimmedMessage },
                        { role: 'model', text: fallbackReply.reply }
                    ];
                    const nextMessages = updatedMessages.length > AI_CHAT_MEMORY_MAX_MESSAGES
                        ? updatedMessages.slice(-AI_CHAT_MEMORY_KEEP_LAST)
                        : updatedMessages;
                    store.saveAiChatMemory({
                        id: memoryKey,
                        companyId: session?.companyId || '',
                        userId: session?.userId || '',
                        summary: memorySummary,
                        messages: nextMessages
                    });
                } catch (_error) {
                    // Ignore memory save errors for handoff replies
                }
            }
            sendSuccess(res, {
                reply: fallbackReply.reply,
                model: 'customer_service_handoff',
                provider: 'fallback',
                handoffRequestCode: fallbackReply.handoffRequestCode
            });
            return;
        }
    }

    if (req.method === 'GET' && pathname === '/api/auth/google') {
        const companyCode = String(searchParams.get('companyCode') || '').trim();

        if (!companyCode) {
            redirectToLoginWithError(res, 'Company ID is required for Google login.');
            return;
        }

        if (!isGoogleOauthConfigured()) {
            redirectToLoginWithError(res, 'Google login is not configured yet.', companyCode);
            return;
        }

        try {
            resolvePublicCompany(req, companyCode);
        } catch (error) {
            redirectToLoginWithError(res, error.message || 'Company not found.', companyCode);
            return;
        }

        const state = createGoogleLoginState({ companyCode });
        const redirectUri = resolveGoogleRedirectUri(req);
        const authUrl = buildGoogleAuthUrl({ redirectUri, state });
        res.writeHead(302, { Location: authUrl });
        res.end();
        return;
    }

    if (req.method === 'GET' && pathname === '/api/auth/google/callback') {
        const authError = String(searchParams.get('error') || '').trim();
        const code = String(searchParams.get('code') || '').trim();
        const state = String(searchParams.get('state') || '').trim();

        if (authError) {
            const entry = state ? consumeGoogleLoginState(state) : null;
            recordAuthAuditEvent(req, res, {
                action: 'auth.login.failed',
                companyCode: entry?.companyCode || '',
                loginMethod: 'google_oauth',
                status: 'failed',
                message: 'Google login canceled.'
            });
            redirectToLoginWithError(res, 'Google login canceled.', entry?.companyCode || '');
            return;
        }

        if (!code || !state) {
            recordAuthAuditEvent(req, res, {
                action: 'auth.login.failed',
                loginMethod: 'google_oauth',
                status: 'failed',
                message: 'Missing Google login response.'
            });
            redirectToLoginWithError(res, 'Missing Google login response.');
            return;
        }

        const entry = consumeGoogleLoginState(state);
        if (!entry) {
            recordAuthAuditEvent(req, res, {
                action: 'auth.login.failed',
                loginMethod: 'google_oauth',
                status: 'failed',
                message: 'Login session expired. Please try again.'
            });
            redirectToLoginWithError(res, 'Login session expired. Please try again.');
            return;
        }

        if (!isGoogleOauthConfigured()) {
            redirectToLoginWithError(res, 'Google login is not configured yet.', entry.companyCode);
            return;
        }

        try {
            const redirectUri = resolveGoogleRedirectUri(req);
            const tokenPayload = await exchangeGoogleCodeForTokens({ code, redirectUri });
            const idToken = String(tokenPayload?.id_token || '').trim();

            if (!idToken) {
                throw new Error('Google login token is missing.');
            }

            const tokenInfo = await fetchGoogleTokenInfo(idToken);
            const email = String(tokenInfo?.email || '').trim();
            const emailVerified = String(tokenInfo?.email_verified || '').toLowerCase() === 'true';
            const audience = String(tokenInfo?.aud || '').trim();
            const issuer = String(tokenInfo?.iss || '').trim();

            if (!email) {
                throw new Error('Google account email is missing.');
            }
            if (!emailVerified) {
                throw new Error('Google account email is not verified.');
            }
            if (audience && audience !== GOOGLE_OAUTH_CLIENT_ID) {
                throw new Error('Google login audience mismatch.');
            }
            if (issuer && issuer !== 'https://accounts.google.com' && issuer !== 'accounts.google.com') {
                throw new Error('Google login issuer mismatch.');
            }

            const user = store.getUserByLoginHandle({
                companyCode: entry.companyCode,
                username: email,
                host: req.headers.host || '',
                loginType: 'google'
            });

            if (!user) {
                throw new Error('No account matched for this Google email.');
            }

            appendSetCookie(res, buildSessionCookie(createSession(user), { host: req.headers.host || '' }));
            recordAuthAuditEvent(req, res, {
                action: 'auth.login.success',
                user,
                actorUserId: user.id,
                targetId: user.id,
                companyId: user.company_id || '',
                companyCode: user.company_code || entry.companyCode || '',
                companyName: user.company_name || '',
                loginMethod: 'google_oauth',
                loginHandle: email,
                status: 'success'
            });
            res.writeHead(302, { Location: '/login.html' });
            res.end();
            return;
        } catch (error) {
            console.error('Google login failed:', error);
            recordAuthAuditEvent(req, res, {
                action: 'auth.login.failed',
                companyCode: entry.companyCode || '',
                loginMethod: 'google_oauth',
                status: 'failed',
                message: error.message || 'Google login failed.'
            });
            redirectToLoginWithError(res, error.message || 'Google login failed.', entry.companyCode);
            return;
        }
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
            requestMeta: body.requestMeta ?? body.request_meta ?? {},
            source: 'customer_portal'
        }));

        sendSuccess(res, {
            ...payload,
            companyCode: company.company_code || '',
            companyName: company.name || ''
        }, 201);
        return;
    }

    if (req.method === 'GET' && pathname === '/api/public/company-registration-config') {
        sendSuccess(res, buildPublicCompanyRegistrationConfigPayload(store.getCustomerServiceConfig()));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/public/company-registration-plans') {
        sendSuccess(res, store.listPlans());
        return;
    }

    if (req.method === 'POST' && pathname === '/api/public/company-registration-payment-preview') {
        const body = await readJsonBody(req);
        const businessName = String(body.businessName || body.companyName || body.business_name || '').trim();
        const clientName = String(body.clientName || body.name || '').trim();
        const contactNumber = String(body.contactNumber || body.contact_number || '').trim();
        const email = String(body.email || '').trim();
        const desiredCompanyCode = normalizeDesiredCompanyCode(body.desiredCompanyCode || body.desired_company_code || '');
        const requestedPlan = String(body.requestedPlan || body.subscriptionPlan || body.plan || '').trim();
        const paymentMethod = String(body.paymentMethod || body.payment_method || '').trim();

        try {
            validateRequired(businessName, 'Company / business name');
            validateRequired(clientName, 'Contact person');
            validateRequired(contactNumber, 'Contact number');
            validateRequired(email, 'Email');
            validateRequired(desiredCompanyCode, 'Desired Company ID');
            validateRequired(requestedPlan, 'Subscription / package');
            validateRequired(paymentMethod, 'Mode of payment');

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                throw new Error('Please provide a valid email address.');
            }

            const planCheckout = resolveCompanyRegistrationPlanCheckout(requestedPlan);
            const checkout = await createPaymongoCompanyRegistrationCheckoutSession(req, {
                requestCode: '',
                businessName,
                clientName,
                contactNumber,
                email,
                desiredCompanyCode,
                requestedPlan: planCheckout.planName,
                amountMinor: planCheckout.amountMinor,
                paymentMethod
            });
            const paymentMethodKey = normalizeCompanyRegistrationPaymentMethodKey(paymentMethod);

            sendSuccess(res, {
                enabled: Boolean(checkout.checkoutUrl),
                provider: 'paymongo',
                providerLabel: 'PayMongo Checkout',
                mode: getPaymongoKeyMode(),
                publishableKeyConfigured: Boolean(PAYMONGO_PUBLIC_KEY),
                supportedMethods: paymentMethodKey ? [paymentMethodKey] : [],
                codeId: checkout.checkoutSessionId || '',
                checkoutUrl: checkout.checkoutUrl,
                paymentMethodKey,
                paymentMethodLabel: checkout.paymentMethodLabel || paymentMethod,
                requestedPlan: planCheckout.planName,
                requestedPlanId: planCheckout.planId,
                amountPhp: planCheckout.amountPhp,
                amountMinor: planCheckout.amountMinor,
                warning: checkout.warning || ''
            });
        } catch (error) {
            const message = error?.message || 'Unable to prepare secure checkout preview right now.';
            sendError(res, 400, message, 'PAYMENT_PREVIEW_FAILED');
        }
        return;
    }

    if (req.method === 'POST' && pathname === '/api/public/company-registration-checkout-session') {
        const body = await readJsonBody(req);
        const businessName = String(body.businessName || body.companyName || body.business_name || '').trim();
        const clientName = String(body.clientName || body.name || '').trim();
        const contactNumber = String(body.contactNumber || body.contact_number || '').trim();
        const email = String(body.email || '').trim();
        const desiredCompanyCode = normalizeDesiredCompanyCode(body.desiredCompanyCode || body.desired_company_code || '');
        const adminId = normalizeDesiredCompanyCode(body.adminId || body.admin_id || body.adminUsername || '');
        const requestedPlan = String(body.requestedPlan || body.subscriptionPlan || body.plan || '').trim();
        const paymentMethod = String(body.paymentMethod || body.payment_method || '').trim();
        const paymentReference = String(body.paymentReference || body.payment_reference || '').trim();
        const notes = String(body.notes || body.requestDetails || body.requestedChanges || body.details || '').trim();
        const extraMessage = String(body.extraMessage || body.initialMessage || body.message || '').trim();

        try {
            validateRequired(businessName, 'Company / business name');
            validateRequired(clientName, 'Contact person');
            validateRequired(contactNumber, 'Contact number');
            validateRequired(email, 'Email');
            validateRequired(desiredCompanyCode, 'Desired Company ID');
            validateRequired(adminId, 'Admin ID');
            validateRequired(requestedPlan, 'Subscription / package');
            validateRequired(paymentMethod, 'Mode of payment');

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                throw new Error('Please provide a valid email address.');
            }

            assertCompanyRegistrationProvisioningAvailability({
                desiredCompanyCode
            });

            const planCheckout = resolveCompanyRegistrationPlanCheckout(requestedPlan);
            const requestDetails = buildCompanyRegistrationRequestDetails({
                businessName,
                adminId,
                clientName,
                contactNumber,
                email,
                desiredCompanyCode,
                requestedPlan: planCheckout.planName,
                paymentMethod,
                paymentReference,
                amountPhp: planCheckout.amountPhp
            });
            const initialMessage = buildCompanyRegistrationInitialMessage({
                requestDetails,
                notes,
                extraMessage
            });

            const requestPayload = store.createCompanyRegistrationRequest({
                clientName,
                contactNumber,
                requestDetails,
                initialMessage,
                requestMeta: {
                    intent: 'register_company_id',
                    companyName: businessName,
                    email,
                    desiredCompanyCode,
                    adminId,
                    requestedPlan: planCheckout.planName,
                    requestedPlanId: planCheckout.planId,
                    paymentMethod,
                    paymentReference,
                    quotedAmountPhp: planCheckout.amountPhp,
                    paymentStatus: 'checkout_creating'
                },
                source: 'public_checkout'
            });
            const requestCode = String(requestPayload?.request?.requestCode || '').trim();
            let checkout = null;

            try {
                checkout = await createPaymongoCompanyRegistrationCheckoutSession(req, {
                    requestCode,
                    businessName,
                    clientName,
                    contactNumber,
                    email,
                    desiredCompanyCode,
                    requestedPlan: planCheckout.planName,
                    amountMinor: planCheckout.amountMinor,
                    paymentMethod
                });
            } catch (error) {
                if (requestCode && typeof store.addCompanyRegistrationRequestMessageByCode === 'function') {
                    try {
                        store.addCompanyRegistrationRequestMessageByCode(requestCode, {
                            senderName: 'System',
                            message: [
                                'Secure checkout creation failed.',
                                `Reason: ${error?.message || 'Unknown error'}`
                            ].join('\n'),
                            source: 'public_checkout'
                        }, { actor: 'admin' });
                    } catch (_error) {
                        // Ignore note failures so the original error can continue.
                    }
                }
                throw error;
            }

            const paymentMethodKey = normalizeCompanyRegistrationPaymentMethodKey(paymentMethod);
            const updatedThread = persistCompanyRegistrationRequestState(requestCode, {
                requestMeta: {
                    ...((requestPayload?.request?.requestMeta && typeof requestPayload.request.requestMeta === 'object' && !Array.isArray(requestPayload.request.requestMeta))
                        ? requestPayload.request.requestMeta
                        : {}),
                    checkoutSessionId: checkout.checkoutSessionId || '',
                    paymentStatus: 'checkout_pending'
                },
                status: 'open',
                allowCustomerEdit: true
            });

            if (requestCode && typeof store.addCompanyRegistrationRequestMessageByCode === 'function') {
                try {
                    store.addCompanyRegistrationRequestMessageByCode(requestCode, {
                        senderName: 'System',
                        message: [
                            'Secure checkout created.',
                            `Checkout Session ID: ${checkout.checkoutSessionId || '-'}`,
                            `Payment Method Preference: ${checkout.paymentMethodLabel || paymentMethod}`,
                            `Quoted Amount: PHP ${planCheckout.amountPhp.toFixed(2)}`
                        ].join('\n'),
                        source: 'public_checkout'
                    }, { actor: 'admin' });
                } catch (_error) {
                    // Ignore checkout note issues so the hosted payment can continue.
                }
            }

            const responseThread = requestCode
                ? store.getCompanyRegistrationRequestThreadByCode(requestCode)
                : updatedThread;
            sendSuccess(res, {
                request: responseThread?.request || updatedThread?.request || requestPayload?.request || null,
                messages: Array.isArray(responseThread?.messages) ? responseThread.messages : [],
                requestCode,
                checkoutUrl: checkout.checkoutUrl,
                checkoutSessionId: checkout.checkoutSessionId,
                paymentMethodKey,
                paymentMethodLabel: checkout.paymentMethodLabel,
                supportedMethods: paymentMethodKey ? [paymentMethodKey] : [],
                amountPhp: planCheckout.amountPhp,
                amountMinor: planCheckout.amountMinor,
                warning: checkout.warning || ''
            }, 201);
        } catch (error) {
            const message = error?.message || 'Unable to prepare secure checkout right now.';
            sendError(res, 400, message, 'PAYMENT_CHECKOUT_FAILED');
        }
        return;
    }

    if (req.method === 'POST' && pathname === '/api/public/company-registration-checkout-complete') {
        const body = await readJsonBody(req);
        const requestCode = String(body.requestCode || body.request_code || '').trim().toUpperCase();
        const contactNumber = String(body.contactNumber || body.contact_number || '').trim();

        try {
            validateRequired(requestCode, 'Request code');
            validateRequired(contactNumber, 'Contact number');

            const thread = store.getCompanyRegistrationRequestThreadByCode(requestCode, { contactNumber });
            const request = thread?.request || null;
            const requestMeta = (request?.requestMeta && typeof request.requestMeta === 'object' && !Array.isArray(request.requestMeta))
                ? { ...request.requestMeta }
                : {};
            const provisionedCompanyId = String(requestMeta.provisionedCompanyId || '').trim();

            if (provisionedCompanyId) {
                sendSuccess(res, {
                    completed: true,
                    paid: true,
                    alreadyProvisioned: true,
                    request: thread.request,
                    messages: thread.messages,
                    company: store.getCompanyById(provisionedCompanyId),
                    admin: {
                        username: String(requestMeta.provisionedAdminUsername || '').trim(),
                        email: String(requestMeta.email || '').trim()
                    },
                    emailDelivery: {
                        sent: Boolean(requestMeta.emailSentAt),
                        reason: String(requestMeta.emailDeliveryError || '').trim()
                    }
                });
                return;
            }

            const checkoutSessionId = String(requestMeta.checkoutSessionId || '').trim();
            if (!checkoutSessionId) {
                throw new Error('This request does not have an active checkout session yet.');
            }

            const checkoutState = await retrievePaymongoCheckoutSession(checkoutSessionId);
            if (!checkoutState.paid) {
                sendSuccess(res, {
                    completed: false,
                    paid: false,
                    request: thread.request,
                    messages: thread.messages,
                    paymentStatus: String(requestMeta.paymentStatus || 'checkout_pending').trim() || 'checkout_pending',
                    checkoutStatus: checkoutState.checkoutStatus,
                    paymentIntentStatus: checkoutState.paymentIntentStatus
                });
                return;
            }

            try {
                const completion = await completeProvisionedCompanyRegistrationCheckout(req, { requestCode });
                const completedThread = store.getCompanyRegistrationRequestThreadByCode(requestCode, { contactNumber });
                sendSuccess(res, {
                    completed: true,
                    paid: true,
                    alreadyProvisioned: Boolean(completion?.alreadyProvisioned),
                    request: completedThread.request,
                    messages: completedThread.messages,
                    company: completion?.company || null,
                    admin: completion?.admin || null,
                    emailDelivery: completion?.emailDelivery || {
                        sent: false,
                        reason: ''
                    }
                });
            } catch (provisioningError) {
                const message = provisioningError?.message || 'Payment was confirmed, but automatic company setup still needs admin review.';
                const updatedThread = persistCompanyRegistrationRequestState(requestCode, {
                    requestMeta: {
                        ...requestMeta,
                        paymentStatus: 'paid',
                        provisioningError: message
                    },
                    status: request?.status || 'open',
                    allowCustomerEdit: false
                });
                try {
                    store.addCompanyRegistrationRequestMessageByCode(requestCode, {
                        senderName: 'System',
                        message: [
                            'Payment verified automatically.',
                            `Automatic provisioning needs admin review: ${message}`
                        ].join('\n'),
                        source: 'system_auto_provision'
                    }, { actor: 'admin' });
                } catch (_error) {
                    // Ignore message log issues so the customer can still continue.
                }
                const reviewedThread = store.getCompanyRegistrationRequestThreadByCode(requestCode, { contactNumber });
                sendSuccess(res, {
                    completed: false,
                    paid: true,
                    requiresManualReview: true,
                    request: reviewedThread?.request || updatedThread?.request || thread.request,
                    messages: reviewedThread?.messages || updatedThread?.messages || thread.messages,
                    error: message
                });
            }
        } catch (error) {
            const message = error?.message || 'Unable to finalize this checkout yet.';
            sendError(res, 400, message, 'PAYMENT_COMPLETION_FAILED');
        }
        return;
    }

    if (req.method === 'GET' && pathname === '/api/public/company-registration-paymongo-qr') {
        const customerServiceConfig = store.getCustomerServiceConfig();
        try {
            const payload = await getCachedPaymongoStaticQrPayload(customerServiceConfig);
            sendSuccess(res, payload);
        } catch (error) {
            console.error('Failed to generate PayMongo QR Ph code:', error);
            sendSuccess(res, buildDisabledPaymongoQrPayload(error.message || 'Unable to generate PayMongo QR code right now.'));
        }
        return;
    }

    if (req.method === 'POST' && pathname === '/api/public/company-registration-requests') {
        const body = await readJsonBody(req);
        const payload = store.createCompanyRegistrationRequest({
            clientName: String(body.clientName || body.name || '').trim(),
            contactNumber: String(body.contactNumber || body.contact_number || '').trim(),
            requestDetails: body.requestDetails ?? body.requestedChanges ?? body.details ?? '',
            initialMessage: body.initialMessage ?? body.message ?? '',
            requestMeta: body.requestMeta ?? body.request_meta ?? {},
            source: 'public_portal'
        });

        sendSuccess(res, payload, 201);
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

    const publicCompanyRegistrationRequestMessageMatch = pathname.match(/^\/api\/public\/company-registration-requests\/([^/]+)\/messages$/);
    if (publicCompanyRegistrationRequestMessageMatch && req.method === 'POST') {
        const body = await readJsonBody(req);
        const authContactNumber = String(
            body.authContactNumber
            || body.contactNumber
            || body.contact_number
            || searchParams.get('contactNumber')
            || ''
        ).trim();
        validateRequired(authContactNumber, 'Contact number');

        const payload = store.addCompanyRegistrationRequestMessageByCode(
            decodeURIComponent(publicCompanyRegistrationRequestMessageMatch[1]),
            {
                senderName: String(body.senderName || body.clientName || '').trim(),
                message: body.message ?? body.text ?? '',
                source: 'public_portal'
            },
            {
                actor: 'customer',
                contactNumber: authContactNumber
            }
        );

        sendSuccess(res, payload);
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

    const publicCompanyRegistrationRequestMatch = pathname.match(/^\/api\/public\/company-registration-requests\/([^/]+)$/);
    if (publicCompanyRegistrationRequestMatch && req.method === 'GET') {
        const authContactNumber = String(searchParams.get('contactNumber') || '').trim();
        validateRequired(authContactNumber, 'Contact number');

        const payload = store.getCompanyRegistrationRequestThreadByCode(
            decodeURIComponent(publicCompanyRegistrationRequestMatch[1]),
            { contactNumber: authContactNumber }
        );

        sendSuccess(res, payload);
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

    if (publicCompanyRegistrationRequestMatch && req.method === 'PUT') {
        const body = await readJsonBody(req);
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

        const payload = store.updateCompanyRegistrationRequestByCode(
            decodeURIComponent(publicCompanyRegistrationRequestMatch[1]),
            {
                clientName: body.clientName ?? body.name,
                contactNumber: body.contactNumber ?? body.contact_number,
                requestDetails: body.requestDetails ?? body.requestedChanges ?? body.details
            },
            {
                actor: 'customer',
                contactNumber: authContactNumber
            }
        );

        sendSuccess(res, payload);
        return;
    }

    if (req.method === 'POST' && pathname === '/api/public/password-reset/request') {
        const body = await readJsonBody(req);
        const companyCode = String(body.companyCode || body.company_code || searchParams.get('companyCode') || '').trim();
        const email = String(body.email || '').trim();
        validateRequired(email, 'Email');

        if (!isEmailDeliveryConfigured()) {
            sendError(res, 400, 'Email delivery is not configured.');
            return;
        }

        const company = resolvePublicCompany(req, companyCode);

        try {
            const payload = store.runWithTenantContextByCompany(company.id, () => store.requestPasswordResetCode({
                email,
                ttlMinutes: EMAIL_CODE_TTL_MINUTES
            }));
            await sendPasswordResetCodeEmail({
                to: payload.email,
                code: payload.code,
                companyName: company.name || '',
                appName: company.app_name || store.PARENT_BRAND.appName
            });
            sendSuccess(res, {
                email: payload.email,
                expiresAt: payload.expiresAt
            });
        } catch (error) {
            sendStoreError(res, error);
        }
        return;
    }

    if (req.method === 'POST' && pathname === '/api/public/password-reset/verify') {
        const body = await readJsonBody(req);
        const companyCode = String(body.companyCode || body.company_code || searchParams.get('companyCode') || '').trim();
        const email = String(body.email || '').trim();
        const code = String(body.code || '').trim();
        validateRequired(email, 'Email');
        validateRequired(code, 'Verification code');

        const company = resolvePublicCompany(req, companyCode);

        try {
            const payload = store.runWithTenantContextByCompany(company.id, () => store.verifyPasswordResetCode({
                email,
                code
            }));
            sendSuccess(res, {
                verified: true,
                email: payload.email,
                expiresAt: payload.expiresAt
            });
        } catch (error) {
            sendStoreError(res, error);
        }
        return;
    }

    if (req.method === 'POST' && pathname === '/api/public/password-reset/confirm') {
        const body = await readJsonBody(req);
        const companyCode = String(body.companyCode || body.company_code || searchParams.get('companyCode') || '').trim();
        const email = String(body.email || '').trim();
        const code = String(body.code || '').trim();
        const password = validatePasswordPolicy(body.password, { required: true });
        validateRequired(email, 'Email');
        validateRequired(code, 'Verification code');

        const company = resolvePublicCompany(req, companyCode);

        try {
            store.runWithTenantContextByCompany(company.id, () => store.resetPasswordWithCode({
                email,
                code,
                password
            }));
            sendSuccess(res, { reset: true });
        } catch (error) {
            sendStoreError(res, error);
        }
        return;
    }

    if (req.method === 'GET' && pathname === '/api/session') {
        sendSuccess(res, session ? serializeSessionResponse(session) : null);
        return;
    }

    if (req.method === 'POST' && pathname === '/api/logout') {
        if (session) {
            if (session.supportSession) {
                recordSupportAuditEvent(req, res, {
                    action: 'support_access.end',
                    session,
                    targetUserId: session.userId || '',
                    targetUserName: session.user?.name || '',
                    targetRole: session.role || '',
                    message: 'Support session ended by logout.',
                    endedAt: new Date().toISOString()
                });
            }
            recordAuthAuditEvent(req, res, {
                action: 'auth.logout',
                session,
                actorUserId: getSessionAuditActorUserId(session),
                targetId: session.userId || session.username || '',
                companyId: session.companyId || '',
                companyCode: session.companyCode || '',
                loginMethod: 'session',
                loginHandle: session.userId || session.username || '',
                status: 'success'
            });
        }

        if (session?.token) {
            invalidateSession(session.token);
        }

        if (req) {
            req.__gmsSession = null;
        }
        clearSessionCookie(res, { host: req.headers.host || '' });
        sendSuccess(res, { loggedOut: true });
        return;
    }

    if (req.method === 'POST' && pathname === '/api/support-session/end') {
        if (!requireSession(res, session)) {
            return;
        }

        const supportSession = buildSupportSessionFromSession(session);
        if (!supportSession) {
            sendError(res, 400, 'No active support session found.', 'SUPPORT_SESSION_INACTIVE');
            return;
        }

        const endedAt = new Date().toISOString();
        recordSupportAuditEvent(req, res, {
            action: 'support_access.end',
            session,
            supportSession,
            targetUserId: session.userId || '',
            targetUserName: session.user?.name || '',
            targetRole: session.role || '',
            endedAt,
            message: 'Support session ended and super admin access was restored.'
        });

        const restoredSessionToken = createSession({
            user_key: supportSession.operatorUserKey || session.userKey || '',
            id: supportSession.operatorUserId,
            role: supportSession.operatorRole || store.ROLE_SUPER_ADMIN,
            company_id: ''
        });
        appendSetCookie(res, buildSessionCookie(restoredSessionToken, { host: req.headers.host || '' }));
        if (req) {
            req.__gmsSession = null;
        }

        const restoredUser = store.getUserById(supportSession.operatorUserId);
        sendSuccess(res, {
            restored: true,
            redirectPath: '/super_admin/dashboard.html',
            user: restoredUser ? serializeSessionUser(restoredUser) : null
        });
        return;
    }

    if (req.method === 'GET' && pathname === '/api/signup-requests') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }

        const status = String(searchParams.get('status') || 'open').trim();
        const filter = String(searchParams.get('filter') || '').trim();
        const limit = Math.max(1, Math.min(500, Number(searchParams.get('limit') || 200)));
        sendSuccess(res, store.listSignupRequests({ status, filter, limit }));
        return;
    }

    const signupApproveMatch = pathname.match(/^\/api\/signup-requests\/([^/]+)\/approve$/);
    if (signupApproveMatch && req.method === 'POST') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        const requestCode = decodeURIComponent(signupApproveMatch[1]);
        const userId = String(body.userId || body.username || body.id || '').trim();
        const name = String(body.name || body.fullName || '').trim();
        const role = String(body.role || '').trim() || 'employee';
        const password = validatePasswordPolicy(body.password, { required: true });
        const email = String(body.email || '').trim();

        try {
            const payload = store.approveSignupRequest({
                requestCode,
                userId,
                name,
                role,
                password,
                email
            });
            sendSuccess(res, payload);
        } catch (error) {
            sendStoreError(res, error);
        }
        return;
    }

    const signupRejectMatch = pathname.match(/^\/api\/signup-requests\/([^/]+)\/reject$/);
    if (signupRejectMatch && req.method === 'POST') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        const requestCode = decodeURIComponent(signupRejectMatch[1]);
        const reason = String(body.reason || body.message || '').trim();

        try {
            const payload = store.rejectSignupRequest({ requestCode, reason });
            sendSuccess(res, payload);
        } catch (error) {
            sendStoreError(res, error);
        }
        return;
    }

    if (req.method === 'POST' && pathname === '/api/account/connect/email/request') {
        if (!requireTenantSession(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        const email = String(body.email || '').trim();
        validateRequired(email, 'Email');

        if (!isEmailDeliveryConfigured()) {
            sendError(res, 400, 'Email delivery is not configured.', 'EMAIL_NOT_CONFIGURED');
            return;
        }

        let result = null;
        try {
            result = store.requestUserEmailVerification({
                userId: session.userId,
                email,
                purpose: 'login_email',
                ttlMinutes: EMAIL_CODE_TTL_MINUTES
            });
        } catch (error) {
            sendStoreError(res, error);
            return;
        }

        if (!result.alreadyLinked) {
            try {
                const company = session.companyId ? store.getCompanyById(session.companyId) : null;
                await sendVerificationEmail({
                    to: result.email,
                    code: result.code,
                    companyName: company?.name || '',
                    appName: company?.app_name || ''
                });
            } catch (error) {
                console.error('Failed to send verification email:', error);
                sendError(res, 500, 'Failed to send verification email.', 'EMAIL_SEND_FAILED');
                return;
            }
        }

        const { code: _code, ...payload } = result;
        sendSuccess(res, payload);
        return;
    }

    if (req.method === 'POST' && pathname === '/api/account/connect/email/verify') {
        if (!requireTenantSession(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        const email = String(body.email || '').trim();
        const code = String(body.code || '').trim();
        validateRequired(email, 'Email');
        validateRequired(code, 'Verification code');

        try {
            const user = store.verifyUserEmailVerification({
                userId: session.userId,
                email,
                code,
                purpose: 'login_email'
            });
            sendSuccess(res, serializeUser(user));
        } catch (error) {
            sendStoreError(res, error);
        }
        return;
    }

    if (req.method === 'POST' && pathname === '/api/account/connect/email/unlink') {
        if (!requireTenantSession(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        const code = String(body.code || '').trim();
        validateRequired(code, 'Verification code');

        try {
            const user = store.verifyUserConnectionUnlinkVerification({
                userId: session.userId,
                code,
                purpose: 'login_email'
            });
            sendSuccess(res, serializeUser(user));
        } catch (error) {
            sendStoreError(res, error);
        }
        return;
    }

    if (req.method === 'POST' && pathname === '/api/account/connect/email/unlink/request') {
        if (!requireTenantSession(res, session)) {
            return;
        }

        if (!isEmailDeliveryConfigured()) {
            sendError(res, 400, 'Email delivery is not configured.', 'EMAIL_NOT_CONFIGURED');
            return;
        }

        let result = null;
        try {
            result = store.requestUserConnectionUnlinkVerification({
                userId: session.userId,
                purpose: 'login_email',
                ttlMinutes: EMAIL_CODE_TTL_MINUTES
            });
        } catch (error) {
            sendStoreError(res, error);
            return;
        }

        try {
            const company = session.companyId ? store.getCompanyById(session.companyId) : null;
            await sendVerificationEmail({
                to: result.email,
                code: result.code,
                companyName: company?.name || '',
                appName: company?.app_name || '',
                actionText: 'remove your linked email access',
                contextLabel: 'unlink verification code'
            });
        } catch (error) {
            console.error('Failed to send unlink verification email:', error);
            sendError(res, 500, 'Failed to send verification email.', 'EMAIL_SEND_FAILED');
            return;
        }

        const { code: _code, ...payload } = result;
        sendSuccess(res, payload);
        return;
    }

    if (req.method === 'POST' && pathname === '/api/account/connect/google') {
        if (!requireTenantSession(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        const email = normalizeEmailAddress(body.email || '');
        const idToken = String(body.idToken || body.id_token || '').trim();

        if (email) {
            const currentUser = store.getUserById(session.userId);
            const verifiedLoginEmail = normalizeEmailAddress(currentUser?.login_email || '');
            const loginEmailVerified = Boolean(currentUser?.login_email_verified);
            if (!loginEmailVerified || verifiedLoginEmail !== email) {
                sendError(res, 400, 'Verify this email first before connecting Google.', 'VALIDATION_ERROR');
                return;
            }

            try {
                const user = store.linkUserGoogleEmail({
                    userId: session.userId,
                    email
                });
                sendSuccess(res, serializeUser(user));
            } catch (error) {
                sendStoreError(res, error);
            }
            return;
        }

        validateRequired(idToken, 'Firebase token');

        let tokenPayload = null;
        try {
            tokenPayload = await verifyFirebaseIdToken(idToken);
        } catch (error) {
            sendError(res, 401, error.message || 'Invalid Firebase token.', 'INVALID_CREDENTIALS');
            return;
        }

        const provider = String(tokenPayload?.firebase?.sign_in_provider || '').trim();
        if (provider !== 'google.com') {
            sendError(res, 400, 'Google sign-in token is required.', 'INVALID_CREDENTIALS');
            return;
        }

        const firebaseEmail = String(tokenPayload?.email || '').trim();
        if (!firebaseEmail) {
            sendError(res, 400, 'Google token is missing email.', 'INVALID_CREDENTIALS');
            return;
        }

        try {
            const user = store.linkUserGoogleEmail({
                userId: session.userId,
                email: firebaseEmail
            });
            sendSuccess(res, serializeUser(user));
        } catch (error) {
            sendStoreError(res, error);
        }
        return;
    }

    if (req.method === 'POST' && pathname === '/api/account/connect/google/unlink') {
        if (!requireTenantSession(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        const code = String(body.code || '').trim();
        validateRequired(code, 'Verification code');

        try {
            const user = store.verifyUserConnectionUnlinkVerification({
                userId: session.userId,
                code,
                purpose: 'google_email'
            });
            sendSuccess(res, serializeUser(user));
        } catch (error) {
            sendStoreError(res, error);
        }
        return;
    }

    if (req.method === 'POST' && pathname === '/api/account/connect/google/unlink/request') {
        if (!requireTenantSession(res, session)) {
            return;
        }

        if (!isEmailDeliveryConfigured()) {
            sendError(res, 400, 'Email delivery is not configured.', 'EMAIL_NOT_CONFIGURED');
            return;
        }

        let result = null;
        try {
            result = store.requestUserConnectionUnlinkVerification({
                userId: session.userId,
                purpose: 'google_email',
                ttlMinutes: EMAIL_CODE_TTL_MINUTES
            });
        } catch (error) {
            sendStoreError(res, error);
            return;
        }

        try {
            const company = session.companyId ? store.getCompanyById(session.companyId) : null;
            await sendVerificationEmail({
                to: result.email,
                code: result.code,
                companyName: company?.name || '',
                appName: company?.app_name || '',
                actionText: 'remove your linked Google access',
                contextLabel: 'unlink verification code'
            });
        } catch (error) {
            console.error('Failed to send unlink verification email:', error);
            sendError(res, 500, 'Failed to send verification email.', 'EMAIL_SEND_FAILED');
            return;
        }

        const { code: _code, ...payload } = result;
        sendSuccess(res, payload);
        return;
    }

    if (req.method === 'POST' && pathname === '/api/login/firebase') {
        const body = await readJsonBody(req);
        const idToken = String(body.idToken || body.id_token || '').trim();
        const companyCodeInput = String(body.companyCode || body.company_code || '').trim();

        validateRequired(idToken, 'Firebase token');

        let tokenPayload = null;
        try {
            tokenPayload = await verifyFirebaseIdToken(idToken);
        } catch (error) {
            recordAuthAuditEvent(req, res, {
                action: 'auth.login.failed',
                companyCode: companyCodeInput,
                loginMethod: 'firebase',
                status: 'failed',
                message: error.message || 'Invalid Firebase token.'
            });
            sendError(res, 401, error.message || 'Invalid Firebase token.', 'INVALID_CREDENTIALS');
            return;
        }

        const email = String(tokenPayload?.email || '').trim();
        if (!email) {
            recordAuthAuditEvent(req, res, {
                action: 'auth.login.failed',
                companyCode: companyCodeInput,
                loginMethod: 'firebase',
                status: 'failed',
                message: 'Firebase token is missing email.'
            });
            sendError(res, 401, 'Firebase token is missing email.', 'INVALID_CREDENTIALS');
            return;
        }

        const signInProvider = String(tokenPayload?.firebase?.sign_in_provider || '').trim();
        const loginType = signInProvider === 'google.com'
            ? 'google'
            : (signInProvider === 'password' ? 'email' : 'any');

        let resolvedCompanyCode = companyCodeInput;
        if (!resolvedCompanyCode) {
            const companyCodes = store.listActiveCompanyCodesByUsername(email);
            if (companyCodes.length === 1) {
                resolvedCompanyCode = companyCodes[0];
            } else if (companyCodes.length > 1) {
                recordAuthAuditEvent(req, res, {
                    action: 'auth.login.failed',
                    loginMethod: 'firebase',
                    loginHandle: email,
                    status: 'failed',
                    message: 'Multiple companies found for this email. Please enter company ID.'
                });
                sendError(res, 400, 'Multiple companies found for this email. Please enter company ID.', 'VALIDATION_ERROR');
                return;
            }
        }

        const user = store.getUserByLoginHandle({
            companyCode: resolvedCompanyCode,
            username: email,
            host: req.headers.host || '',
            loginType
        });
        if (!user) {
            recordAuthAuditEvent(req, res, {
                action: 'auth.login.failed',
                companyCode: resolvedCompanyCode || companyCodeInput,
                loginMethod: signInProvider === 'google.com' ? 'google' : 'firebase',
                loginHandle: email,
                status: 'failed',
                message: 'No account matched for this email.'
            });
            sendError(res, 401, 'No account matched for this email.', 'INVALID_CREDENTIALS');
            return;
        }

        if (session?.token) {
            invalidateSession(session.token);
        }

        appendSetCookie(res, buildSessionCookie(createSession(user), { host: req.headers.host || '' }));
        recordAuthAuditEvent(req, res, {
            action: 'auth.login.success',
            user,
            actorUserId: user.id,
            targetId: user.id,
            companyId: user.company_id || '',
            companyCode: user.company_code || resolvedCompanyCode || companyCodeInput,
            companyName: user.company_name || '',
            loginMethod: signInProvider === 'google.com' ? 'google' : 'firebase',
            loginHandle: email,
            status: 'success'
        });
        sendSuccess(res, serializeSessionUser(user));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/login') {
        const body = await readJsonBody(req);
        const username = String(body.username || body.id || '').trim();
        let companyCode = String(body.companyCode || body.company_code || '').trim();
        const requestHost = req.headers.host || '';
        validateRequired(username, 'Username');
        validateRequired(body.password, 'Password');

        if (!companyCode) {
            const hostCompany = store.getCompanyByHost(requestHost);
            if (!hostCompany) {
                const companyCodes = store.listActiveCompanyCodesByUsername(username);
                if (companyCodes.length === 1) {
                    companyCode = companyCodes[0];
                } else if (companyCodes.length > 1) {
                    recordAuthAuditEvent(req, res, {
                        action: 'auth.login.failed',
                        loginMethod: 'password',
                        loginHandle: username,
                        status: 'failed',
                        message: 'Multiple companies found for this email. Please enter company ID.'
                    });
                    sendError(res, 400, 'Multiple companies found for this email. Please enter company ID.', 'VALIDATION_ERROR');
                    return;
                }
            }
        }

        const attemptKey = buildLoginAttemptKey({
            companyCode,
            username,
            host: requestHost
        });
        const attemptState = attemptKey ? getLoginAttemptState(attemptKey) : null;
        if (attemptState?.blockedUntil && attemptState.blockedUntil > Date.now()) {
            const retryAfterSeconds = getLoginRetryAfterSeconds(attemptState.blockedUntil);
            const rateLimitMessage = buildLoginAttemptBlockedMessage(retryAfterSeconds);
            res.setHeader('Retry-After', String(retryAfterSeconds));
            recordAuthAuditEvent(req, res, {
                action: 'auth.login.rate_limited',
                companyCode,
                loginMethod: 'password',
                loginHandle: username,
                status: 'blocked',
                message: rateLimitMessage
            });
            sendError(res, 429, rateLimitMessage, 'RATE_LIMITED');
            return;
        }

        const user = store.getUserByCredentials({
            companyCode,
            username,
            password: String(body.password || '').trim(),
            host: requestHost
        });
        if (!user) {
            const nextAttemptState = attemptKey ? recordLoginFailure(attemptKey) : null;
            if (nextAttemptState?.blockedUntil && nextAttemptState.blockedUntil > Date.now()) {
                const retryAfterSeconds = getLoginRetryAfterSeconds(nextAttemptState.blockedUntil);
                const rateLimitMessage = buildLoginAttemptBlockedMessage(retryAfterSeconds);
                res.setHeader('Retry-After', String(retryAfterSeconds));
                recordAuthAuditEvent(req, res, {
                    action: 'auth.login.rate_limited',
                    companyCode,
                    loginMethod: 'password',
                    loginHandle: username,
                    status: 'blocked',
                    message: rateLimitMessage
                });
                sendError(res, 429, rateLimitMessage, 'RATE_LIMITED');
                return;
            }

            recordAuthAuditEvent(req, res, {
                action: 'auth.login.failed',
                companyCode,
                loginMethod: 'password',
                loginHandle: username,
                status: 'failed',
                message: 'Invalid credentials.'
            });
            sendError(res, 401, 'Invalid credentials.', 'INVALID_CREDENTIALS');
            return;
        }

        if (attemptKey) {
            clearLoginFailures(attemptKey);
        }
        if (session?.token) {
            invalidateSession(session.token);
        }

        appendSetCookie(res, buildSessionCookie(createSession(user), { host: req.headers.host || '' }));
        recordAuthAuditEvent(req, res, {
            action: 'auth.login.success',
            user,
            actorUserId: user.id,
            targetId: user.id,
            companyId: user.company_id || '',
            companyCode: user.company_code || companyCode,
            companyName: user.company_name || '',
            loginMethod: 'password',
            loginHandle: username,
            status: 'success'
        });
        sendSuccess(res, serializeSessionUser(user));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/bootstrap') {
        if (!requireSession(res, session)) {
            return;
        }

        if (isSuperAdmin(session)) {
            sendSuccess(res, {
                user: serializeSessionResponse(session),
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
        const serializedSupportSession = serializeSupportSession(session?.supportSession);
        sendSuccess(res, {
            ...tenantBootstrap,
            user: serializedSupportSession
                ? {
                    ...(tenantBootstrap.user || {}),
                    support_session: serializedSupportSession
                }
                : tenantBootstrap.user,
            support_session: serializedSupportSession,
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

    if (req.method === 'GET' && pathname === '/api/super/customer-service-config') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        sendSuccess(res, store.getCustomerServiceConfig());
        return;
    }

    if (req.method === 'PUT' && pathname === '/api/super/customer-service-config') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        sendSuccess(res, store.updateCustomerServiceConfig({
            handoff_message: body.handoff_message || body.handoffMessage || '',
            emails: body.emails || [],
            phones: body.phones || [],
            company_registration_payment: body.company_registration_payment || body.companyRegistrationPayment || {}
        }));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/super/customer-service-users') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        sendSuccess(res, store.listSuperAdminUsers(searchParams.get('filter') || '').map(serializeUser));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/super/customer-service-users') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        sendSuccess(res, serializeUser(store.createSuperAdminUser({
            username: String(body.username || body.id || '').trim(),
            name: String(body.name || body.display_name || '').trim(),
            password: validatePasswordPolicy(body.password, { required: true }),
            login_email: String(body.login_email || body.loginEmail || body.email || '').trim(),
            is_active: body.is_active,
            account_status: String(body.account_status ?? body.accountStatus ?? '').trim()
        })), 201);
        return;
    }

    const superCustomerServiceUserMatch = pathname.match(/^\/api\/super\/customer-service-users\/([^/]+)$/);
    if (superCustomerServiceUserMatch && req.method === 'PUT') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        const hasAccountStatusOverride = Object.prototype.hasOwnProperty.call(body, 'account_status')
            || Object.prototype.hasOwnProperty.call(body, 'accountStatus');
        sendSuccess(res, serializeUser(store.updateSuperAdminUser(
            decodeURIComponent(superCustomerServiceUserMatch[1]),
            {
                name: String(body.name || body.display_name || '').trim(),
                password: validatePasswordPolicy(body.password, { required: false }),
                login_email: String(body.login_email || body.loginEmail || body.email || '').trim(),
                is_active: body.is_active,
                account_status: hasAccountStatusOverride
                    ? String(body.account_status ?? body.accountStatus ?? '').trim()
                    : undefined
            }
        )));
        return;
    }

    if (superCustomerServiceUserMatch && req.method === 'DELETE') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        const targetUserId = decodeURIComponent(superCustomerServiceUserMatch[1]);
        if (String(session?.userId || '').trim().toLowerCase() === String(targetUserId || '').trim().toLowerCase()) {
            sendError(res, 400, 'You cannot delete the current logged in customer service account.', 'VALIDATION_ERROR');
            return;
        }

        sendSuccess(res, store.deleteSuperAdminUser(targetUserId));
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

    if (req.method === 'GET' && pathname === '/api/super/company-registration-requests') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        sendSuccess(res, store.listCompanyRegistrationRequests({
            filter: searchParams.get('filter') || '',
            status: searchParams.get('status') || '',
            limit: searchParams.get('limit') || 200
        }));
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

    const superCompanyRegistrationRequestMessageMatch = pathname.match(/^\/api\/super\/company-registration-requests\/([^/]+)\/messages$/);
    if (superCompanyRegistrationRequestMessageMatch && req.method === 'POST') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        const payload = store.addCompanyRegistrationRequestMessageByCode(
            decodeURIComponent(superCompanyRegistrationRequestMessageMatch[1]),
            {
                senderName: String(body.senderName || session?.user?.name || session?.userId || 'Super Admin').trim(),
                message: body.message ?? body.text ?? '',
                source: 'super_admin_panel'
            },
            { actor: 'admin' }
        );
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

    const superCompanyRegistrationRequestMatch = pathname.match(/^\/api\/super\/company-registration-requests\/([^/]+)$/);
    if (superCompanyRegistrationRequestMatch && req.method === 'GET') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        sendSuccess(res, store.getCompanyRegistrationRequestThreadByCode(
            decodeURIComponent(superCompanyRegistrationRequestMatch[1])
        ));
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

    if (superCompanyRegistrationRequestMatch && req.method === 'PATCH') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        const payload = store.updateCompanyRegistrationRequestByCode(
            decodeURIComponent(superCompanyRegistrationRequestMatch[1]),
            {
                clientName: body.clientName ?? body.name,
                contactNumber: body.contactNumber ?? body.contact_number,
                requestDetails: body.requestDetails ?? body.requestedChanges ?? body.details,
                status: body.status,
                allowCustomerEdit: body.allowCustomerEdit ?? body.allow_customer_edit
            },
            { actor: 'admin' }
        );
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
            loginBackgroundPath: body.login_background_path || body.loginBackgroundPath,
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

    const superCompanySupportSessionMatch = pathname.match(/^\/api\/super\/companies\/([^/]+)\/support-session$/);
    if (superCompanySupportSessionMatch && req.method === 'POST') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        const company = resolveSuperAdminCompany(decodeURIComponent(superCompanySupportSessionMatch[1]));
        startSuperAdminSupportSession(req, res, session, company);
        return;
    }

    if (req.method === 'POST' && pathname === '/api/super/support-session') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        const company = resolveSuperAdminCompanyByCode(body.companyCode || body.company_code || '');
        startSuperAdminSupportSession(req, res, session, company);
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

    if (req.method === 'GET' && pathname === '/api/super/access-logs') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }
        sendSuccess(res, store.listAccessLogs({
            filter: searchParams.get('filter') || '',
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

    if (req.method === 'GET' && pathname === '/api/company/bulletin') {
        if (!requireTenantSession(res, session)) {
            return;
        }
        sendSuccess(res, store.getCompanyBulletin());
        return;
    }

    if (req.method === 'PUT' && pathname === '/api/company/bulletin/announcement') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        const body = await readJsonBody(req);
        sendSuccess(res, store.updateCompanyAnnouncement(body));
        return;
    }

    if (req.method === 'DELETE' && pathname === '/api/company/bulletin/announcement') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        sendSuccess(res, store.clearCompanyAnnouncement());
        return;
    }

    if (req.method === 'POST' && pathname === '/api/company/bulletin/holidays') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        const body = await readJsonBody(req);
        sendSuccess(res, store.addCompanyHoliday(body), 201);
        return;
    }

    const companyBulletinHolidayMatch = pathname.match(/^\/api\/company\/bulletin\/holidays\/([^/]+)$/);
    if (companyBulletinHolidayMatch && req.method === 'PUT') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        const body = await readJsonBody(req);
        sendSuccess(res, store.updateCompanyHoliday(
            decodeURIComponent(companyBulletinHolidayMatch[1]),
            body
        ));
        return;
    }

    if (companyBulletinHolidayMatch && req.method === 'DELETE') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        sendSuccess(res, store.deleteCompanyHoliday(decodeURIComponent(companyBulletinHolidayMatch[1])));
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

    if (req.method === 'GET' && pathname === '/api/company/pricelist-config') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        sendSuccess(res, store.getCompanyPricelistConfig());
        return;
    }

    if (req.method === 'PUT' && pathname === '/api/company/pricelist-config') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        const body = await readJsonBody(req);
        sendSuccess(res, store.updateCompanyPricelistConfig(body));
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

        const limit = Number(searchParams.get('limit') || 500);
        const offset = Number(searchParams.get('offset') || 0);

        sendSuccess(res, store.listBranches({
            limit: Number.isFinite(limit) && limit > 0 ? Math.min(2500, limit) : 500,
            offset: Number.isFinite(offset) && offset >= 0 ? offset : 0
        }));
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
        const limit = Number(searchParams.get('limit') || 500);
        const offset = Number(searchParams.get('offset') || 0);

        sendSuccess(res, store.listUsers(role, filter, {
            limit: Number.isFinite(limit) && limit > 0 ? Math.min(2500, limit) : 500,
            offset: Number.isFinite(offset) && offset >= 0 ? offset : 0
        }).map(serializeUser));
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
            account_status: String(body.account_status ?? body.accountStatus ?? '').trim(),
            timeIn: String(body.timeIn || body.time_in || '').trim(),
            timeOut: String(body.timeOut || body.time_out || '').trim(),
            weeklySchedule: body.weeklySchedule ?? body.weekly_schedule ?? body.schedule ?? body.schedule_json,
            feature_access: normalizeUserFeatureAccess(body.feature_access || body.featureAccess || {}),
            dailySalary: Object.prototype.hasOwnProperty.call(body, 'dailySalary')
                || Object.prototype.hasOwnProperty.call(body, 'daily_salary')
                ? (body.dailySalary ?? body.daily_salary)
                : undefined
        })), 201);
        return;
    }

    if (req.method === 'GET' && pathname === '/api/employees') {
        if (!requireTenantSession(res, session)) {
            return;
        }

        if (!isHeadAdmin(session) && !isEmployee(session)) {
            sendError(res, 403, 'Forbidden.', 'FORBIDDEN');
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
        const limit = Number(searchParams.get('limit') || 500);
        const offset = Number(searchParams.get('offset') || 0);

        sendSuccess(res, {
            items: store.listClients(filter, {
                limit: Number.isFinite(limit) && limit > 0 ? Math.min(2500, limit) : 500,
                offset: Number.isFinite(offset) && offset >= 0 ? offset : 0
            }),
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
            timeIn: String(body.timeIn || '').trim() || '09:00',
            timeOut: String(body.timeOut || '').trim() || '18:00',
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

    if (req.method === 'GET' && pathname === '/api/communication-workflow') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'invoicing')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'order_form')) {
            return;
        }

        sendSuccess(res, runInTenantContext(session, () => communicationWorkflowStore.listEntries({
            branch: searchParams.get('branch') || '',
            search: searchParams.get('search') || ''
        }, buildWorkflowRequestContext(session))));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/communication-workflow') {
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
        sendSuccess(res, runInTenantContext(session, () => communicationWorkflowStore.createEntry(
            body,
            buildWorkflowRequestContext(session)
        )), 201);
        return;
    }

    const communicationWorkflowThreadMatch = pathname.match(/^\/api\/communication-workflow\/([^/]+)\/thread$/);
    if (communicationWorkflowThreadMatch && req.method === 'GET') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'invoicing')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'order_form')) {
            return;
        }

        sendSuccess(res, runInTenantContext(session, () => communicationWorkflowStore.getEntryThread(
            decodeURIComponent(communicationWorkflowThreadMatch[1]),
            { limit: searchParams.get('limit') || 200 },
            buildWorkflowRequestContext(session)
        )));
        return;
    }

    const communicationWorkflowMessageMatch = pathname.match(/^\/api\/communication-workflow\/([^/]+)\/messages$/);
    if (communicationWorkflowMessageMatch && req.method === 'POST') {
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
        sendSuccess(res, runInTenantContext(session, () => communicationWorkflowStore.addMessage(
            decodeURIComponent(communicationWorkflowMessageMatch[1]),
            body,
            buildWorkflowRequestContext(session)
        )), 201);
        return;
    }

    const communicationWorkflowMatch = pathname.match(/^\/api\/communication-workflow\/([^/]+)$/);
    if (communicationWorkflowMatch && req.method === 'PATCH') {
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
        const action = String(body.action || '').trim().toLowerCase();
        if (action === 'confirm' && !requireInvoiceCreationAccess(res, session)) {
            return;
        }

        sendSuccess(res, runInTenantContext(session, () => communicationWorkflowStore.updateEntry(
            decodeURIComponent(communicationWorkflowMatch[1]),
            body,
            buildWorkflowRequestContext(session)
        )));
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

        const limit = Number(searchParams.get('limit') || 500);
        const offset = Number(searchParams.get('offset') || 0);
        salesStore.syncCompositeVariantsToInventory();

        sendSuccess(res, sanitizeInventoryVariantListForSession(session, inventoryVariantStore.listInventoryVariants({
            productName: searchParams.get('productName') || '',
            setName: searchParams.get('setName') || '',
            search: searchParams.get('search') || '',
            limit: Number.isFinite(limit) && limit > 0 ? Math.min(2500, limit) : 500,
            offset: Number.isFinite(offset) && offset >= 0 ? offset : 0
        })));
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

        sendSuccess(res, sanitizeInventoryVariantForSession(session, inventoryVariantStore.resolveInventoryVariant({
            productName: searchParams.get('productName') || '',
            setName: searchParams.get('setName') || ''
        })));
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
        const limit = Number(searchParams.get('limit') || 500);
        const offset = Number(searchParams.get('offset') || 0);

        sendSuccess(res, salesStore.listInventory({
            branch,
            filter,
            limit: Number.isFinite(limit) && limit > 0 ? Math.min(2500, limit) : 500,
            offset: Number.isFinite(offset) && offset >= 0 ? offset : 0
        }));
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
        const limit = Number(searchParams.get('limit') || 500);
        const offset = Number(searchParams.get('offset') || 0);

        sendSuccess(res, salesStore.listCompositeItems(filter, {
            limit: Number.isFinite(limit) && limit > 0 ? Math.min(2500, limit) : 500,
            offset: Number.isFinite(offset) && offset >= 0 ? offset : 0
        }));
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

        const limit = Number(searchParams.get('limit') || 500);
        const offset = Number(searchParams.get('offset') || 0);

        sendSuccess(res, salesStore.listSales({
            dateFrom: searchParams.get('dateFrom') || '',
            dateTo: searchParams.get('dateTo') || '',
            branch: searchParams.get('branch') || '',
            cashBranch: searchParams.get('cashBranch') || '',
            paymentOption: searchParams.get('paymentOption') || '',
            adminName: searchParams.get('adminName') || '',
            salesRepresentative: searchParams.get('salesRepresentative') || '',
            search: searchParams.get('search') || '',
            limit: Number.isFinite(limit) && limit > 0 ? Math.min(2500, limit) : 500,
            offset: Number.isFinite(offset) && offset >= 0 ? offset : 0
        }));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/sales/pending-payments') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }

        const limit = Number(searchParams.get('limit') || 500);
        const offset = Number(searchParams.get('offset') || 0);

        sendSuccess(res, salesStore.listPendingPayments({
            dateFrom: searchParams.get('dateFrom') || '',
            dateTo: searchParams.get('dateTo') || '',
            branch: searchParams.get('branch') || '',
            cashBranch: searchParams.get('cashBranch') || '',
            paymentOption: searchParams.get('paymentOption') || '',
            adminName: searchParams.get('adminName') || '',
            salesRepresentative: searchParams.get('salesRepresentative') || '',
            search: searchParams.get('search') || '',
            status: searchParams.get('status') || '',
            limit: Number.isFinite(limit) && limit > 0 ? Math.min(2500, limit) : 500,
            offset: Number.isFinite(offset) && offset >= 0 ? offset : 0
        }));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/sales/customer-credits') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }

        sendSuccess(res, salesStore.listCustomerCredits({
            dateFrom: searchParams.get('dateFrom') || '',
            dateTo: searchParams.get('dateTo') || '',
            search: searchParams.get('search') || '',
            status: searchParams.get('status') || '',
            limitClients: searchParams.get('limitClients') || '250',
            limitEntries: searchParams.get('limitEntries') || '250'
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
        sendSuccess(res, sanitizeSaleOrderForSession(session, entry), 201);
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
            quickFilter: searchParams.get('quickFilter') || searchParams.get('quick_filter') || '',
            dateFrom: searchParams.get('dateFrom') || searchParams.get('date_from') || ''
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
            status: searchParams.get('status') || '',
            dateFrom: searchParams.get('dateFrom') || searchParams.get('date_from') || ''
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
        const requestedBranch = String(body.branch ?? body.selectedBranch ?? '').trim();
        if (!isHeadAdmin(session) && requestedBranch) {
            if (!requireAssignedBranchEditAccess(res, session, requestedBranch, 'LBC updates')) {
                return;
            }
        }

        sendSuccess(res, salesStore.bulkAssignLbcTracking({
            branch: isHeadAdmin(session)
                ? requestedBranch
                : (requestedBranch || getSessionBranchName(session)),
            dateFrom: body.dateFrom ?? body.date_from ?? '',
            items: body.items ?? body.entries ?? body.trackingItems ?? [],
            requestUserId: session.userId || session.user?.id || '',
            requestUserName: session.user?.name || session.username || '',
            requestRole: session.role || '',
            requestBranchName: getSessionBranchName(session),
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
            dateFrom: body.dateFrom ?? body.date_from ?? '',
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
                trackingEntryId: body.trackingEntryId ?? body.tracking_entry_id ?? body.entryId ?? body.entry_id ?? '',
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
            requestBranchName: getSessionBranchName(session),
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
            if (
                Object.prototype.hasOwnProperty.call(body, 'trackingEntryId')
                || Object.prototype.hasOwnProperty.call(body, 'tracking_entry_id')
                || Object.prototype.hasOwnProperty.call(body, 'entryId')
                || Object.prototype.hasOwnProperty.call(body, 'entry_id')
            ) {
                payload.trackingEntryId = body.trackingEntryId ?? body.tracking_entry_id ?? body.entryId ?? body.entry_id;
            }
            if (
                Object.prototype.hasOwnProperty.call(body, 'appendTracking')
                || Object.prototype.hasOwnProperty.call(body, 'append_tracking')
                || Object.prototype.hasOwnProperty.call(body, 'addTracking')
                || Object.prototype.hasOwnProperty.call(body, 'add_tracking')
            ) {
                payload.appendTracking = body.appendTracking ?? body.append_tracking ?? body.addTracking ?? body.add_tracking;
            }
            if (
                Object.prototype.hasOwnProperty.call(body, 'deleteTracking')
                || Object.prototype.hasOwnProperty.call(body, 'delete_tracking')
                || Object.prototype.hasOwnProperty.call(body, 'removeTracking')
                || Object.prototype.hasOwnProperty.call(body, 'remove_tracking')
            ) {
                payload.deleteTracking = body.deleteTracking ?? body.delete_tracking ?? body.removeTracking ?? body.remove_tracking;
            }
        }
        sendSuccess(res, salesStore.updateLbcTracking(
            decodeURIComponent(lbcTrackingMatch[1]),
            payload
        ));
        return;
    }

    if (req.method === 'GET' && pathname === '/api/expenses/export-excel') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'expenses')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'sales')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'expenses')) {
            return;
        }
        if (!requireTenantSession(res, session)) {
            return;
        }

        const filters = {
            dateFrom: searchParams.get('dateFrom') || '',
            dateTo: searchParams.get('dateTo') || '',
            branch: searchParams.get('branch') || '',
            search: searchParams.get('search') || ''
        };
        const company = store.getCompanyById(session.companyId);
        if (!company) {
            sendError(res, 404, 'Company not found.', 'NOT_FOUND');
            return;
        }

        const expenseResult = salesStore.listExpenses(filters);
        const branches = salesStore.getReferenceData().branches || [];
        const companyName = company.name || company.app_name || company.id || 'GMS ERP';
        const buffer = await buildExpenseBreakdownWorkbookBuffer({
            companyName,
            filters,
            branches,
            result: expenseResult
        });
        const filename = buildExpenseBreakdownFilename({
            companyName,
            filters
        });

        res.writeHead(200, {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': buffer.length,
            'Cache-Control': 'no-store'
        });
        res.end(buffer);
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

        sendError(
            res,
            400,
            'Bulk delete for expenses is disabled. Delete individual rows from the records table instead.',
            'VALIDATION_ERROR'
        );
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

        sendError(
            res,
            400,
            'Bulk delete for manual cash income is disabled. Delete individual rows from the records table instead.',
            'VALIDATION_ERROR'
        );
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

    if (
        req.method === 'GET'
        && (pathname === '/api/order-client-pending-check' || pathname === '/api/orders/pending-client-check')
    ) {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'invoicing')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'order_form')) {
            return;
        }

        sendSuccess(res, salesStore.checkPendingPaymentsByClient({
            clientName: searchParams.get('clientName') || '',
            clientContact: searchParams.get('clientContact') || '',
            clientAddress: searchParams.get('clientAddress') || '',
            excludeOrderNumber: searchParams.get('excludeOrderNumber') || '',
            limit: searchParams.get('limit') || '12'
        }));
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

    if (req.method === 'GET' && pathname === '/api/orders/customer-credit-backfill/preview') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'invoicing')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!isHeadAdmin(session) && !isSuperAdmin(session)) {
            sendError(res, 403, 'Only admins can backfill old customer credits.', 'FORBIDDEN');
            return;
        }

        sendSuccess(res, salesStore.previewCustomerCreditBackfill({
            dateFrom: searchParams.get('dateFrom') || '',
            dateTo: searchParams.get('dateTo') || ''
        }));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/orders/customer-credit-backfill') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'invoicing')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!isHeadAdmin(session) && !isSuperAdmin(session)) {
            sendError(res, 403, 'Only admins can backfill old customer credits.', 'FORBIDDEN');
            return;
        }

        const body = await readJsonBody(req);
        sendSuccess(res, salesStore.applyCustomerCreditBackfill(body || {}));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/orders/customer-credit/manual-entry') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'invoicing')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!isHeadAdmin(session) && !isSuperAdmin(session)) {
            sendError(res, 403, 'Only admins can create manual customer credit entries.', 'FORBIDDEN');
            return;
        }

        const body = await readJsonBody(req);
        sendSuccess(res, salesStore.addManualCustomerCreditEntry(body || {}));
        return;
    }

    const manualCustomerCreditEntryMatch = pathname.match(/^\/api\/orders\/customer-credit\/manual-entry\/([^/]+)$/);
    if (manualCustomerCreditEntryMatch && req.method === 'PUT') {
        if (!requireHeadAdminOrFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!requireModuleAccess(res, session, 'invoicing')) {
            return;
        }
        if (!requireFeatureAccess(res, session, 'order_form')) {
            return;
        }
        if (!isHeadAdmin(session) && !isSuperAdmin(session)) {
            sendError(res, 403, 'Only admins can edit manual customer credit entries.', 'FORBIDDEN');
            return;
        }

        const body = await readJsonBody(req);
        sendSuccess(
            res,
            salesStore.updateManualCustomerCreditEntry(decodeURIComponent(manualCustomerCreditEntryMatch[1]), body || {})
        );
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

        sendSuccess(res, sanitizeSaleOrderForSession(session, salesStore.getSaleOrder(
            decodeURIComponent(orderMatch[1])
        )));
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
        sendSuccess(res, sanitizeSaleOrderForSession(session, salesStore.updateSaleOrder(
            decodeURIComponent(orderMatch[1]),
            body
        )));
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
        if (!requireAssignedBranchEditAccess(res, session, body.branch, 'Inventory updates')) {
            return;
        }
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
        if (!requireHeadAdmin(res, session)) {
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
            timeIn: String(body.timeIn || '').trim() || '09:00',
            timeOut: String(body.timeOut || '').trim() || '18:00',
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
        const hasAccountStatusOverride = Object.prototype.hasOwnProperty.call(body, 'account_status')
            || Object.prototype.hasOwnProperty.call(body, 'accountStatus');
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
        const hasDailySalaryOverride = Object.prototype.hasOwnProperty.call(body, 'daily_salary')
            || Object.prototype.hasOwnProperty.call(body, 'dailySalary');
        const featureAccessPayload = hasFeatureAccessOverride
            ? (body.feature_access ?? body.featureAccess)
            : undefined;
        const weeklySchedulePayload = hasWeeklyScheduleOverride
            ? (body.weeklySchedule ?? body.weekly_schedule ?? body.schedule ?? body.schedule_json)
            : undefined;
        const updatePayload = {};
        if (hasNameOverride) {
            updatePayload.name = String(body.name || body.display_name || '').trim();
        }
        if (hasRoleOverride) {
            updatePayload.role = String(body.role || '').trim();
        }
        if (body.password !== undefined) {
            updatePayload.password = validatePasswordPolicy(body.password, { required: false });
        }
        if (hasBranchIdOverride) {
            updatePayload.branchId = String(body.branch_id || body.branchId || '').trim();
        }
        if (hasBranchNameOverride) {
            updatePayload.branchName = String(body.branch_name || body.branchName || '').trim();
        }
        if (hasActiveOverride) {
            updatePayload.is_active = body.is_active;
        }
        if (hasAccountStatusOverride) {
            updatePayload.account_status = String(body.account_status ?? body.accountStatus ?? '').trim();
        }
        if (hasTimeInOverride) {
            updatePayload.timeIn = String(body.timeIn || body.time_in || '').trim();
        }
        if (hasTimeOutOverride) {
            updatePayload.timeOut = String(body.timeOut || body.time_out || '').trim();
        }
        if (hasWeeklyScheduleOverride) {
            updatePayload.weeklySchedule = weeklySchedulePayload;
        }
        if (hasFeatureAccessOverride) {
            updatePayload.feature_access = featureAccessPayload;
        }
        if (hasDailySalaryOverride) {
            updatePayload.dailySalary = body.dailySalary ?? body.daily_salary;
        }
        sendSuccess(res, serializeUser(store.updateUser(userId, updatePayload)));
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

    const attendanceUserCutoffCardMatch = pathname.match(/^\/api\/attendance\/user\/([^/]+)\/cutoff-card$/);
    if (attendanceUserCutoffCardMatch && req.method === 'GET') {
        if (!requireModuleAccess(res, session, 'attendance')) {
            return;
        }
        const userId = decodeURIComponent(attendanceUserCutoffCardMatch[1]);
        if (!requireSelfOrHeadAdmin(res, session, userId)) {
            return;
        }

        const dateKey = searchParams.get('dateKey') || store.getDateKey();

        sendSuccess(res, serializeAttendanceRows(store.getUserSemiMonthlyTimeCard(userId, dateKey)));
        return;
    }

    const attendanceUserCutoffPayrollMatch = pathname.match(/^\/api\/attendance\/user\/([^/]+)\/cutoff-payroll$/);
    if (attendanceUserCutoffPayrollMatch && req.method === 'GET') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'attendance')) {
            return;
        }

        const userId = decodeURIComponent(attendanceUserCutoffPayrollMatch[1]);
        const dateKey = searchParams.get('dateKey') || store.getDateKey();

        sendSuccess(res, store.getUserCutoffPayrollStatus(userId, dateKey));
        return;
    }

    if (attendanceUserCutoffPayrollMatch && req.method === 'PATCH') {
        if (!requireHeadAdmin(res, session) || !requireTenantSession(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'attendance')) {
            return;
        }

        const userId = decodeURIComponent(attendanceUserCutoffPayrollMatch[1]);
        const body = await readJsonBody(req);
        const dateKey = String(body.dateKey || '').trim() || store.getDateKey();
        const payoutStatus = body.status ?? body.payoutStatus ?? body.payout_status;
        validateRequired(payoutStatus, 'Payout status');

        sendSuccess(res, store.setUserCutoffPayrollStatus(userId, dateKey, payoutStatus));
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

        sendSuccess(res, serializeAttendanceRow(store.getAttendanceRecordForDate(userId)));
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

    if (req.method === 'GET' && pathname === '/api/reports/export-excel') {
        if (!requireHeadAdmin(res, session)) {
            return;
        }
        if (!requireModuleAccess(res, session, 'reports')) {
            return;
        }
        if (!requireTenantSession(res, session)) {
            return;
        }

        const monthInput = searchParams.get('month') || searchParams.get('monthKey') || '';
        const parsedMonth = parseMonth(monthInput);
        if (!parsedMonth) {
            sendError(res, 400, 'Month is required. Use YYYY-MM.', 'VALIDATION_ERROR');
            return;
        }

        const monthKey = `${parsedMonth.year}-${String(parsedMonth.month).padStart(2, '0')}`;
        const { dateFrom, dateTo } = getMonthBounds(parsedMonth.year, parsedMonth.month);
        const company = store.getCompanyById(session.companyId);
        if (!company) {
            sendError(res, 404, 'Company not found.', 'NOT_FOUND');
            return;
        }

        const buffer = await buildCompanyWorkbookBuffer({
            company,
            monthKey,
            dateFrom,
            dateTo
        });
        const safeCompanyName = safeName(company.name || company.app_name || company.id, 'company');
        const filename = `GMS_${safeCompanyName}_${monthKey}.xlsx`;

        res.writeHead(200, {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': buffer.length,
            'Cache-Control': 'no-store'
        });
        res.end(buffer);
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
    const allowedRootFiles = new Set([
        '/',
        '/index.html',
        '/login',
        '/login.html',
        '/privacy',
        '/privacy/',
        '/privacy/index.html',
        '/logo.png',
        '/Signature_JHV.png',
        '/manifest.webmanifest',
        '/service-worker.js'
    ]);

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

function escapeHtmlAttribute(value = '') {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function isSocialPreviewBotUserAgent(userAgent = '') {
    return /(discordbot|slackbot|twitterbot|facebookexternalhit|linkedinbot|whatsapp|telegrambot|skypeuripreview|embedly|pinterest|vkshare|bitlybot|googlebot)/i
        .test(String(userAgent || '').trim());
}

function buildPublicSocialPreviewMeta(pathname, branding = {}) {
    const normalizedPath = normalizePublicPathname(pathname);
    const appName = String(branding.appName || store.PARENT_BRAND?.appName || 'GMS ERP').trim() || 'GMS ERP';
    const companyName = String(branding.companyName || '').trim();
    const imagePath = String(
        branding.logoPath
        || branding.faviconPath
        || store.PARENT_BRAND?.logoPath
        || '/logo.png'
    ).trim() || '/logo.png';
    const platformDescription = companyName
        ? `${companyName} uses ${appName} to manage attendance, sales, inventory, invoicing, and daily operations in one secure workspace.`
        : `${appName} helps teams manage attendance, sales, inventory, invoicing, and daily operations in one secure workspace.`;

    if (normalizedPath === '/' || normalizedPath === '/index.html') {
        return {
            canonicalPath: '/',
            title: appName,
            description: platformDescription,
            imagePath
        };
    }

    if (normalizedPath === '/login.html') {
        return {
            canonicalPath: '/login.html',
            title: `${appName} Login`,
            description: companyName
                ? `Secure sign-in for ${companyName} on ${appName}. Access attendance, sales, inventory, and operations from one workspace.`
                : `Secure sign-in to ${appName}. Access attendance, sales, inventory, and operations from one workspace.`,
            imagePath
        };
    }

    if (normalizedPath === '/privacy' || normalizedPath === '/privacy/' || normalizedPath === '/privacy/index.html') {
        return {
            canonicalPath: '/privacy/',
            title: `Privacy Policy | ${appName}`,
            description: `Read the privacy policy for ${appName} and understand how account, attendance, sales, and business data are handled.`,
            imagePath
        };
    }

    if (normalizedPath === '/renderer/forgot_password.html') {
        return {
            canonicalPath: '/renderer/forgot_password.html',
            title: `${appName} Forgot Password`,
            description: companyName
                ? `Recover your ${appName} access for ${companyName} and securely reset your password.`
                : `Recover your ${appName} access and securely reset your password.`,
            imagePath
        };
    }

    if (normalizedPath === '/renderer/customer_portal.html') {
        return {
            canonicalPath: '/renderer/customer_portal.html',
            title: `${appName} Customer Portal`,
            description: companyName
                ? `Contact ${companyName} through ${appName} for support, sign-up requests, and company onboarding.`
                : `Use ${appName} for support requests, sign-up requests, and company onboarding.`,
            imagePath
        };
    }

    return null;
}

function resolveAbsolutePublicUrl(baseUrl = '', targetPath = '') {
    const normalizedTarget = String(targetPath || '').trim();
    if (!normalizedTarget) {
        return '';
    }

    const normalizedBaseUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!normalizedBaseUrl) {
        return normalizedTarget;
    }

    try {
        return new URL(normalizedTarget, `${normalizedBaseUrl}/`).toString();
    } catch (_error) {
        return normalizedTarget;
    }
}

function buildSocialPreviewMetaBlock({ pathname = '/', baseUrl = '', host = '' } = {}) {
    const branding = store.getPublicBranding({ host });
    const pageMeta = buildPublicSocialPreviewMeta(pathname, branding);
    if (!pageMeta) {
        return '';
    }

    const pageUrl = resolveAbsolutePublicUrl(baseUrl, pageMeta.canonicalPath);
    const imageUrl = resolveAbsolutePublicUrl(baseUrl, pageMeta.imagePath);
    const escapedTitle = escapeHtmlAttribute(pageMeta.title);
    const escapedDescription = escapeHtmlAttribute(pageMeta.description);
    const escapedPageUrl = escapeHtmlAttribute(pageUrl);
    const escapedImageUrl = escapeHtmlAttribute(imageUrl);
    const escapedImageAlt = escapeHtmlAttribute(`${pageMeta.title} logo`);
    const escapedSiteName = escapeHtmlAttribute(String(branding.appName || store.PARENT_BRAND?.appName || 'GMS ERP').trim() || 'GMS ERP');

    return [
        '  <!-- social-preview:start -->',
        `  <meta name="description" content="${escapedDescription}">`,
        `  <link rel="canonical" href="${escapedPageUrl}">`,
        '  <meta property="og:type" content="website">',
        `  <meta property="og:site_name" content="${escapedSiteName}">`,
        `  <meta property="og:title" content="${escapedTitle}">`,
        `  <meta property="og:description" content="${escapedDescription}">`,
        `  <meta property="og:url" content="${escapedPageUrl}">`,
        `  <meta property="og:image" content="${escapedImageUrl}">`,
        '  <meta property="og:image:type" content="image/png">',
        '  <meta property="og:image:width" content="512">',
        '  <meta property="og:image:height" content="512">',
        `  <meta property="og:image:alt" content="${escapedImageAlt}">`,
        '  <meta name="twitter:card" content="summary">',
        `  <meta name="twitter:title" content="${escapedTitle}">`,
        `  <meta name="twitter:description" content="${escapedDescription}">`,
        `  <meta name="twitter:image" content="${escapedImageUrl}">`,
        `  <meta name="twitter:image:alt" content="${escapedImageAlt}">`,
        '  <!-- social-preview:end -->'
    ].join('\n');
}

function injectSocialPreviewMeta(html, options = {}) {
    const markerPattern = /[ \t]*<!-- social-preview:start -->[\s\S]*?<!-- social-preview:end -->/i;
    if (!markerPattern.test(String(html || ''))) {
        return html;
    }

    const block = buildSocialPreviewMetaBlock(options);
    if (!block) {
        return html;
    }

    return String(html).replace(markerPattern, block);
}

async function serveStaticFile(req, res, pathname, { host = '', method = '', deviceId = '', ipAddress = '', userAgent = '', session = null } = {}) {
    const normalizedPublicPath = normalizePublicPathname(pathname);
    const isSocialPreviewBot = isSocialPreviewBotUserAgent(userAgent);

    if (normalizedPublicPath === '/login') {
        res.writeHead(302, {
            Location: '/login.html',
            'Cache-Control': 'no-store'
        });
        res.end();
        return;
    }

    if (normalizedPublicPath === '/' && (!method || method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD')) {
        const hostCompany = store.getCompanyByHost(host);
        if (hostCompany && String(hostCompany.status || '').toLowerCase() === 'active' && !isSocialPreviewBot) {
            res.writeHead(302, {
                Location: '/head_admin/dashboard.html',
                'Cache-Control': 'no-store'
            });
            res.end();
            return;
        }
    }

    if (!isAllowedPublicPath(normalizedPublicPath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
    }

    const methodUpper = String(method || '').toUpperCase();
    const shouldLogAccess = methodUpper === 'GET'
        && (normalizedPublicPath === '/' || normalizedPublicPath.endsWith('.html'));
    if (shouldLogAccess) {
        const hostCompany = store.getCompanyByHost(host);
        store.logAccessEvent({
            deviceId,
            ipAddress,
            userAgent,
            host: String(host || ''),
            path: normalizedPublicPath,
            method: methodUpper,
            companyId: session?.companyId || hostCompany?.id || '',
            userId: session?.userId || ''
        });
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
        let fileContents = await fs.promises.readFile(filePath);
        if (extension === '.html') {
            fileContents = Buffer.from(injectSocialPreviewMeta(fileContents.toString('utf8'), {
                pathname: normalizedPublicPath,
                baseUrl: resolveBaseUrl(req),
                host
            }), 'utf8');
        }
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
        const requestMeta = getRequestMeta(req, res);
        const deviceId = requestMeta.deviceId;
        const clientIp = requestMeta.ipAddress;
        const requestSession = getCachedRequestSession(req, res);

        Promise.resolve()
            .then(async () => {
                if (urlObject.pathname.startsWith('/api/')) {
                    await handleApiRequest(req, res, urlObject);
                    return;
                }

                await serveStaticFile(req, res, urlObject.pathname, {
                    host: requestMeta.host,
                    method: req.method || '',
                    deviceId,
                    ipAddress: clientIp,
                    userAgent: requestMeta.userAgent,
                    session: requestSession
                });
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
            if (AI_CHAT_PROVIDER === 'ollama' || AI_CHAT_PROVIDER === 'local') {
                warmLocalAiModel();
            }
            resolve({
                server,
                localUrl: `http://127.0.0.1:${SERVER_CONFIG.port}/login.html`,
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
