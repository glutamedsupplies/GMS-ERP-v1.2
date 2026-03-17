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
const { buildCompanyWorkbookBuffer, getMonthBounds, parseMonth, safeName } = require('./monthly-excel-export');
const { ROOT_DIR, readProjectRuntimeConfig } = require('./runtime-config');

const SESSION_COOKIE_NAME = 'attendance_session';
const DEVICE_COOKIE_NAME = 'attendance_device';
const COOKIE_DOMAIN_OVERRIDE = String(process.env.ATTENDANCE_COOKIE_DOMAIN || '').trim().toLowerCase();
const SESSION_TTL_MS = Math.max(60_000, Number(process.env.ATTENDANCE_SESSION_TTL_MS || 8 * 60 * 60 * 1000));
const LOGIN_WINDOW_MS = Math.max(60_000, Number(process.env.ATTENDANCE_LOGIN_WINDOW_MS || 15 * 60 * 1000));
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
    : 0.2;
const AI_CHAT_MAX_OUTPUT_TOKENS = Math.max(50, Number(process.env.ATTENDANCE_AI_CHAT_MAX_OUTPUT_TOKENS || 900));
const AI_CHAT_MAX_HISTORY = Math.max(2, Number(process.env.ATTENDANCE_AI_CHAT_MAX_HISTORY || 8));
const AI_CHAT_MAX_MESSAGE_CHARS = Math.max(200, Number(process.env.ATTENDANCE_AI_CHAT_MAX_MESSAGE_CHARS || 2000));
const AI_CHAT_TIMEOUT_MS = Math.max(1_500, Number(process.env.ATTENDANCE_AI_PROVIDER_TIMEOUT_MS || 6_500));
const AI_CHAT_MEMORY_MAX_MESSAGES = Math.max(6, Number(process.env.ATTENDANCE_AI_CHAT_MEMORY_MAX_MESSAGES || 16));
const AI_CHAT_MEMORY_KEEP_LAST = Math.max(4, Number(process.env.ATTENDANCE_AI_CHAT_MEMORY_KEEP_LAST || 8));
const AI_CHAT_MEMORY_MAX_SUMMARY_CHARS = Math.max(200, Number(process.env.ATTENDANCE_AI_CHAT_MEMORY_MAX_SUMMARY_CHARS || 1600));
const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Math.max(1, Number(process.env.SMTP_PORT || 587));
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim();
const SMTP_FROM = String(process.env.SMTP_FROM || SMTP_USER || '').trim();
const SMTP_SECURE = ['1', 'true', 'yes', 'on'].includes(String(process.env.SMTP_SECURE || '').trim().toLowerCase());
const EMAIL_CODE_TTL_MINUTES = Math.max(5, Number(process.env.EMAIL_CODE_TTL_MINUTES || 15));
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
    return /(kumusta|kamusta|salamat|po|opo|naka|mag-?|mga|yung|ano|saan|paano|bakit|pwede|puwede|dito|ganito|taglish)/.test(value);
}

function getQuickChatReply(message = '') {
    const trimmed = String(message || '').trim();
    if (!trimmed) {
        return '';
    }
    const lower = trimmed.toLowerCase();
    const isGreeting = /^(hi|hello|hey|yo|kumusta|kamusta|good\s*(morning|afternoon|evening))\b/.test(lower);
    if (!isGreeting) {
        return '';
    }
    if (isLikelyFilipino(lower)) {
        return 'Hi! Pwede mo akong tanungin tungkol sa attendance, sales, inventory, users, at reports sa GMS ERP. Ano ang gusto mong hanapin?';
    }
    return 'Hi! Ask me about attendance, sales, inventory, users, and reports. What would you like to know?';
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
        phones: []
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

function getDirectCustomerServiceReply(message = '', customerServiceConfig = null) {
    const lower = String(message || '').trim().toLowerCase();
    if (!lower) {
        return '';
    }

    const wantsHumanHelp = /(customer\s*service|support|agent|real person|human|tao\s+kausap|pa[- ]?transfer|makausap|contact\s+them|reach\s+them|email\s+sila|tawagan|tumawag)/.test(lower);
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
    const wantsOverview = /(ano.*function|mga function|features? ng app|ano.*apps mo|ano.*ginagawa.*app|lahat.*function|paano.*gamitin.*lahat|overview ng app|tour ng app)/.test(lower);
    if (!wantsOverview) {
        return '';
    }

    const filipino = isLikelyFilipino(lower);
    const normalizedRole = String(role || '').trim().toLowerCase();
    let roleHint = '';
    if (filipino) {
        if (normalizedRole === 'super_admin') {
            roleHint = 'Since Super Admin ka, may extra access ka rin sa Plans and Subscriptions, Audit Logs, Access Logs, at Blocked Devices.';
        } else if (normalizedRole === 'head_admin' || normalizedRole === 'company_admin') {
            roleHint = 'Since Head Admin ka, kasama rin sa side mo ang Users, Employees, Branches, Settings, at ibang company tools.';
        } else if (normalizedRole === 'employee' || normalizedRole === 'staff') {
            roleHint = 'If employee or staff login ang gamit mo, mas konti lang ang modules na makikita mo kaysa sa Head Admin.';
        } else {
            roleHint = 'Depende sa role mo, may ibang modules na pwede o hindi pwede makita.';
        }
    } else if (normalizedRole === 'super_admin') {
        roleHint = 'Since you are a Super Admin, you also have access to Plans and Subscriptions, Audit Logs, Access Logs, and Blocked Devices.';
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
            '1. Attendance: Time In/Out, Timecards, at Today Present.',
            '2. Sales: Create Sales, Sales Report, Invoice Summary, Invoice Template, at Order Form.',
            '3. Inventory: Inventory, Inventory Levels, at Composite Items.',
            '4. Account management: Users, Employees, Branches, at Settings.',
            '5. Reports and tools: Reports, Sales Inventory Insight, Customer Requests, Communication Panel, at LBC Tracking.',
            '6. Super Admin side: Dashboard, Customer Requests, Plans and Subscriptions, Audit Logs, Access Logs, at Blocked Devices.',
            roleHint,
            'Kung gusto mo, pili ka lang ng isang module at tuturuan kita step by step.'
        ].filter(Boolean).join('\n');
    }

    return [
        'Here is the main function overview of GMS ERP:',
        '1. Attendance: Time In/Out, Timecards, and Today Present.',
        '2. Sales: Create Sales, Sales Report, Invoice Summary, Invoice Template, and Order Form.',
        '3. Inventory: Inventory, Inventory Levels, and Composite Items.',
        '4. Account management: Users, Employees, Branches, and Settings.',
        '5. Reports and tools: Reports, Sales Inventory Insight, Customer Requests, Communication Panel, and LBC Tracking.',
        '6. Super Admin side: Dashboard, Customer Requests, Plans and Subscriptions, Audit Logs, Access Logs, and Blocked Devices.',
        roleHint,
        'If you want, pick one module and I will walk you through it step by step.'
    ].filter(Boolean).join('\n');
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
                '1. Dashboard',
                '2. Company Profile',
                '3. Users',
                '4. Employees',
                '5. Branches',
                '6. Time In/Out (attendance station)',
                '7. Timecards',
                '8. Today Present',
                '9. Sales: Create Sales, Sales Report, Invoice Summary, Invoice Template, Order Form',
                '10. Inventory: Inventory, Inventory Levels, Composite Items',
                '11. Expenses',
                '12. Reports',
                '13. Sales Inventory Insight',
                '14. Customer Requests',
                '15. Communication Panel',
                '16. LBC Tracking',
                '17. Settings',
                'Kung gusto mo, sabihin mo lang kung anong module at bibigyan kita ng steps.'
            ].join('\n')
            : [
                'Here are the Head Admin modules:',
                '1. Dashboard',
                '2. Company Profile',
                '3. Users',
                '4. Employees',
                '5. Branches',
                '6. Time In/Out (attendance station)',
                '7. Timecards',
                '8. Today Present',
                '9. Sales: Create Sales, Sales Report, Invoice Summary, Invoice Template, Order Form',
                '10. Inventory: Inventory, Inventory Levels, Composite Items',
                '11. Expenses',
                '12. Reports',
                '13. Sales Inventory Insight',
                '14. Customer Requests',
                '15. Communication Panel',
                '16. LBC Tracking',
                '17. Settings',
                'Do you want details for any specific module?'
            ].join('\n');
    }

    if (employeeMatch) {
        return filipino
            ? [
                'Ito ang modules ng Employee sa GMS ERP:',
                '1. Employee Dashboard',
                '2. Time In/Out',
                '3. Time Card',
                '4. Inventory Stock',
                '5. Settings',
                'Sabihin mo lang kung aling module ang gusto mong i-check.'
            ].join('\n')
            : [
                'Here are the Employee modules:',
                '1. Employee Dashboard',
                '2. Time In/Out',
                '3. Time Card',
                '4. Inventory Stock',
                '5. Settings',
                'Do you want details for any specific module?'
            ].join('\n');
    }

    if (superAdminMatch) {
        return filipino
            ? [
                'Ito ang modules ng Super Admin sa GMS ERP:',
                '1. Dashboard',
                '2. Customer Requests',
                '3. Plans and Subscriptions',
                '4. Audit Logs',
                '5. Access Logs',
                '6. Blocked Devices',
                'Sabihin mo lang kung anong part ang gusto mong i-open o maintindihan.'
            ].join('\n')
            : [
                'Here are the Super Admin modules:',
                '1. Dashboard',
                '2. Customer Requests',
                '3. Plans and Subscriptions',
                '4. Audit Logs',
                '5. Access Logs',
                '6. Blocked Devices',
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

function normalizeChatReplyForDelivery(reply = '', { userMessage = '', customerServiceConfig = null } = {}) {
    const normalized = String(reply || '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (!normalized || isReplyLikelyIncomplete(normalized)) {
        return buildCustomerServiceHandoffMessage({
            message: userMessage,
            customerServiceConfig
        });
    }

    return normalized;
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

    if (SECURE_COOKIES) {
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

    if (SECURE_COOKIES) {
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

    if (SECURE_COOKIES) {
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
        message: String(message || '').trim()
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

    return SECURE_COOKIES ? 'https' : 'http';
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

async function sendVerificationEmail({ to, code, companyName = '', appName = '' } = {}) {
    if (!isEmailDeliveryConfigured()) {
        throw new Error('Email delivery is not configured.');
    }

    const resolvedApp = String(appName || 'GMS ERP').trim();
    const resolvedCompany = String(companyName || '').trim();
    const subjectBase = resolvedCompany ? `${resolvedCompany} - ${resolvedApp}` : resolvedApp;
    const subject = `${subjectBase} verification code`;
    const ttlLabel = `${EMAIL_CODE_TTL_MINUTES} minutes`;
    const safeCode = String(code || '').trim();
    const text = `Your ${resolvedApp} verification code is ${safeCode}. It expires in ${ttlLabel}.`;
    const html = `
        <div style="font-family: Arial, sans-serif; color: #0f172a;">
            <h2 style="margin: 0 0 12px; font-size: 20px;">${resolvedApp} verification code</h2>
            ${resolvedCompany ? `<p style="margin: 0 0 12px;">Company: <strong>${resolvedCompany}</strong></p>` : ''}
            <p style="margin: 0 0 12px;">Use this code to finish connecting your account:</p>
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
    const session = getCachedRequestSession(req, res);
    const tenantContextOptionalPaths = new Set([
        '/api/server-info',
        '/api/public-branding',
        '/api/session',
        '/api/login',
        '/api/login/firebase',
        '/api/logout',
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

        const history = normalizeChatHistory([
            ...memoryMessages,
            ...(body.history || body.messages || [])
        ]);
        const trimmedMessage = message.slice(0, AI_CHAT_MAX_MESSAGE_CHARS);
        const customerServiceConfig = getCustomerServiceConfigForAi();
        const staticReply = getDirectCustomerServiceReply(trimmedMessage, customerServiceConfig)
            || getFeatureOverviewReply(trimmedMessage, session?.role)
            || getStaticKnowledgeReply(trimmedMessage);
        const quickReply = staticReply || getQuickChatReply(trimmedMessage);
        if (quickReply) {
            const finalQuickReply = normalizeChatReplyForDelivery(quickReply, {
                userMessage: trimmedMessage,
                customerServiceConfig
            });
            if (memoryKey) {
                const updatedMessages = [
                    ...memoryMessages,
                    { role: 'user', text: trimmedMessage },
                    { role: 'model', text: finalQuickReply }
                ];
                const nextMessages = updatedMessages.length > AI_CHAT_MEMORY_MAX_MESSAGES
                    ? updatedMessages.slice(-AI_CHAT_MEMORY_KEEP_LAST)
                    : updatedMessages;
                try {
                    store.saveAiChatMemory(memoryKey, {
                        summary: memorySummary,
                        messages: nextMessages
                    });
                } catch (_error) {
                    // Ignore memory errors for quick replies
                }
            }
            sendSuccess(res, {
                reply: finalQuickReply,
                model: 'static',
                provider: 'static'
            });
            return;
        }
        const provider = resolveChatProvider();
        const systemPrompt = buildAssistantSystemPrompt({
            role: session?.role,
            memorySummary,
            customerServiceConfig
        });

        if (!provider) {
            sendSuccess(res, {
                reply: buildCustomerServiceHandoffMessage({
                    message: trimmedMessage,
                    customerServiceConfig
                }),
                model: 'customer_service_handoff',
                provider: 'fallback'
            });
            return;
        }

        if (provider === 'ollama' || provider === 'local') {
            if (!isLocalChatConfigured()) {
                sendSuccess(res, {
                    reply: buildCustomerServiceHandoffMessage({
                        message: trimmedMessage,
                        customerServiceConfig
                    }),
                    model: 'customer_service_handoff',
                    provider: 'fallback'
                });
                return;
            }
        }

        if (provider === 'gemini' && !GEMINI_CHAT_API_KEY) {
            sendSuccess(res, {
                reply: buildCustomerServiceHandoffMessage({
                    message: trimmedMessage,
                    customerServiceConfig
                }),
                model: 'customer_service_handoff',
                provider: 'fallback'
            });
            return;
        }

        if (!['gemini', 'local', 'ollama'].includes(provider)) {
            sendSuccess(res, {
                reply: buildCustomerServiceHandoffMessage({
                    message: trimmedMessage,
                    customerServiceConfig
                }),
                model: 'customer_service_handoff',
                provider: 'fallback'
            });
            return;
        }

        try {
            const chatMessages = [
                ...toChatMessagesFromHistory(history),
                { role: 'user', content: trimmedMessage }
            ];
            const response = await requestChatCompletion({
                provider,
                systemPrompt,
                messages: chatMessages,
                temperature: AI_CHAT_TEMPERATURE,
                maxOutputTokens: AI_CHAT_MAX_OUTPUT_TOKENS
            });
            const finalReply = normalizeChatReplyForDelivery(response.reply, {
                userMessage: trimmedMessage,
                customerServiceConfig
            });

            if (memoryKey) {
                try {
                    const updatedMessages = [
                        ...memoryMessages,
                        { role: 'user', text: trimmedMessage },
                        { role: 'model', text: finalReply }
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
                reply: finalReply
            });
            return;
        } catch (error) {
            console.error('AI chat failed, handing off to customer service:', error);
            const fallbackReply = buildCustomerServiceHandoffMessage({
                message: trimmedMessage,
                customerServiceConfig
            });
            if (memoryKey) {
                try {
                    const updatedMessages = [
                        ...memoryMessages,
                        { role: 'user', text: trimmedMessage },
                        { role: 'model', text: fallbackReply }
                    ];
                    const nextMessages = updatedMessages.length > AI_CHAT_MEMORY_MAX_MESSAGES
                        ? updatedMessages.slice(-AI_CHAT_MEMORY_KEEP_LAST)
                        : updatedMessages;
                    store.saveAiChatMemory(memoryKey, {
                        summary: memorySummary,
                        messages: nextMessages
                    });
                } catch (_error) {
                    // Ignore memory save errors for handoff replies
                }
            }
            sendSuccess(res, {
                reply: fallbackReply,
                model: 'customer_service_handoff',
                provider: 'fallback'
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
        sendSuccess(res, session ? serializeSessionUser({
            ...session.user,
            company_code: session.companyCode || ''
        }) : null);
        return;
    }

    if (req.method === 'POST' && pathname === '/api/logout') {
        if (session) {
            recordAuthAuditEvent(req, res, {
                action: 'auth.logout',
                session,
                actorUserId: session.userId || '',
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

    if (req.method === 'POST' && pathname === '/api/account/connect/google') {
        if (!requireTenantSession(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        const idToken = String(body.idToken || body.id_token || '').trim();
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

        const email = String(tokenPayload?.email || '').trim();
        if (!email) {
            sendError(res, 400, 'Google token is missing email.', 'INVALID_CREDENTIALS');
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
        const clientIp = getClientIp(req);
        const attemptState = getLoginAttemptState(clientIp);
        if (attemptState?.blockedUntil && attemptState.blockedUntil > Date.now()) {
            const retryAfterSeconds = Math.max(1, Math.ceil((attemptState.blockedUntil - Date.now()) / 1000));
            res.setHeader('Retry-After', String(retryAfterSeconds));
            recordAuthAuditEvent(req, res, {
                action: 'auth.login.rate_limited',
                loginMethod: 'password',
                status: 'blocked',
                message: 'Too many failed login attempts. Please try again later.'
            });
            sendError(res, 429, 'Too many failed login attempts. Please try again later.', 'RATE_LIMITED');
            return;
        }

        const body = await readJsonBody(req);
        const username = String(body.username || body.id || '').trim();
        let companyCode = String(body.companyCode || body.company_code || '').trim();
        validateRequired(username, 'Username');
        validateRequired(body.password, 'Password');

        if (!companyCode) {
            const hostCompany = store.getCompanyByHost(req.headers.host || '');
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

        const user = store.getUserByCredentials({
            companyCode,
            username,
            password: String(body.password || '').trim(),
            host: req.headers.host || ''
        });
        if (!user) {
            recordLoginFailure(clientIp);
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

        clearLoginFailures(clientIp);
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
            phones: body.phones || []
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
            is_active: body.is_active
        })), 201);
        return;
    }

    const superCustomerServiceUserMatch = pathname.match(/^\/api\/super\/customer-service-users\/([^/]+)$/);
    if (superCustomerServiceUserMatch && req.method === 'PUT') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }

        const body = await readJsonBody(req);
        sendSuccess(res, serializeUser(store.updateSuperAdminUser(
            decodeURIComponent(superCustomerServiceUserMatch[1]),
            {
                name: String(body.name || body.display_name || '').trim(),
                password: validatePasswordPolicy(body.password, { required: false }),
                login_email: String(body.login_email || body.loginEmail || body.email || '').trim(),
                is_active: body.is_active
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

    if (req.method === 'GET' && pathname === '/api/super/blocked-devices') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }
        sendSuccess(res, store.listBlockedDevices({
            filter: searchParams.get('filter') || '',
            limit: searchParams.get('limit') || 200,
            offset: searchParams.get('offset') || 0
        }));
        return;
    }

    if (req.method === 'POST' && pathname === '/api/super/blocked-devices') {
        if (!requireSuperAdmin(res, session)) {
            return;
        }
        const body = await readJsonBody(req);
        sendSuccess(res, store.blockDevice({
            deviceId: body.device_id || body.deviceId || '',
            ipAddress: body.ip_address || body.ipAddress || '',
            userAgent: body.user_agent || body.userAgent || '',
            host: body.host || '',
            reason: body.reason || '',
            blockedBy: session?.userId || ''
        }));
        return;
    }

    const blockedDeviceMatch = pathname.match(/^\/api\/super\/blocked-devices\/([^/]+)$/);
    if (req.method === 'DELETE' && blockedDeviceMatch) {
        if (!requireSuperAdmin(res, session)) {
            return;
        }
        sendSuccess(res, store.unblockDevice(decodeURIComponent(blockedDeviceMatch[1])));
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

        sendSuccess(res, sanitizeInventoryVariantListForSession(session, inventoryVariantStore.listInventoryVariants({
            productName: searchParams.get('productName') || '',
            setName: searchParams.get('setName') || '',
            search: searchParams.get('search') || ''
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
        sendSuccess(res, salesStore.listInventory({ branch, filter }));
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

async function serveStaticFile(res, pathname, { host = '', method = '', deviceId = '', ipAddress = '', userAgent = '', session = null } = {}) {
    const normalizedPublicPath = normalizePublicPathname(pathname);

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
        if (hostCompany && String(hostCompany.status || '').toLowerCase() === 'active') {
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
        const requestMeta = getRequestMeta(req, res);
        const deviceId = requestMeta.deviceId;
        const clientIp = requestMeta.ipAddress;
        const requestSession = getCachedRequestSession(req, res);

        if (store.isDeviceBlocked({ deviceId, ipAddress: clientIp })) {
            if (urlObject.pathname.startsWith('/api/')) {
                sendError(res, 403, 'Device blocked.', 'DEVICE_BLOCKED');
                return;
            }

            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Device blocked.');
            return;
        }

        Promise.resolve()
            .then(async () => {
                if (urlObject.pathname.startsWith('/api/')) {
                    await handleApiRequest(req, res, urlObject);
                    return;
                }

                await serveStaticFile(res, urlObject.pathname, {
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
