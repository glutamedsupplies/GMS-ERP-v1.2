const OpenAI = require('openai');

const DEFAULT_GEMINI_MODEL = String(process.env.ATTENDANCE_GEMINI_MODEL || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';
const DEFAULT_OPENAI_MODEL = String(process.env.ATTENDANCE_OPENAI_MODEL || 'gpt-5-nano').trim() || 'gpt-5-nano';
const DEFAULT_PROVIDER_TIMEOUT_MS = Math.max(1_500, Number(process.env.ATTENDANCE_AI_PROVIDER_TIMEOUT_MS || 6_500));
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const SUPPORTED_PROVIDER_KEYS = ['openai', 'gemini'];

function getGeminiApiKey() {
    return String(process.env.ATTENDANCE_GEMINI_API_KEY || '').trim();
}

function getOpenAiApiKey() {
    return String(process.env.ATTENDANCE_OPENAI_API_KEY || '').trim();
}

function isGeminiOrderParserConfigured() {
    return Boolean(getGeminiApiKey());
}

function isOpenAiOrderParserConfigured() {
    return Boolean(getOpenAiApiKey());
}

function isAiOrderParserConfigured() {
    return isOpenAiOrderParserConfigured() || isGeminiOrderParserConfigured();
}

function getConfiguredAiOrderParserProviders() {
    const providers = [];
    if (isOpenAiOrderParserConfigured()) {
        providers.push('OpenAI');
    }
    if (isGeminiOrderParserConfigured()) {
        providers.push('Gemini');
    }
    return providers;
}

function getAiOrderParserProviderStatus() {
    return [
        { name: 'OpenAI', configured: isOpenAiOrderParserConfigured() },
        { name: 'Gemini', configured: isGeminiOrderParserConfigured() }
    ];
}

function sanitizeText(value) {
    return String(value || '').trim();
}

function normalizeProviderKey(value = '') {
    const normalized = sanitizeText(value).toLowerCase();
    if (!normalized || normalized === 'auto') {
        return '';
    }
    if (normalized === 'chatgpt' || normalized === 'openai') return 'openai';
    if (normalized === 'gemini') return 'gemini';
    return '';
}

function normalizeApiKeyOverrides(apiKeys = null) {
    const source = apiKeys && typeof apiKeys === 'object' ? apiKeys : {};
    return SUPPORTED_PROVIDER_KEYS.reduce((accumulator, key) => {
        const value = sanitizeText(source[key]);
        if (value) {
            accumulator[key] = value;
        }
        return accumulator;
    }, {});
}

function getProviderApiKey(providerKey = '', apiKeys = null) {
    const normalizedProviderKey = normalizeProviderKey(providerKey);
    const normalizedOverrides = normalizeApiKeyOverrides(apiKeys);
    if (normalizedOverrides[normalizedProviderKey]) {
        return normalizedOverrides[normalizedProviderKey];
    }

    if (normalizedProviderKey === 'openai') return getOpenAiApiKey();
    if (normalizedProviderKey === 'gemini') return getGeminiApiKey();
    return '';
}

function sanitizeCurrency(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.max(0, numericValue) : null;
}

function sanitizeBooleanOrNull(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    return Boolean(value);
}

function sanitizeAiRows(rows = []) {
    return (Array.isArray(rows) ? rows : []).map((row) => ({
        productName: sanitizeText(row?.productName || row?.product_name),
        setName: sanitizeText(row?.setName || row?.set_name),
        itemCode: '',
        price: sanitizeCurrency(row?.price) || 0,
        quantity: Math.max(1, Number(row?.quantity || 1)),
        subtotal: 0,
        helper: '',
        priceOverride: sanitizeCurrency(row?.price) !== null
    })).filter((row) => row.productName && row.setName);
}

function sanitizePaymentEntries(entries = []) {
    return (Array.isArray(entries) ? entries : []).map((entry) => ({
        method: sanitizeText(entry?.method),
        amount: sanitizeCurrency(entry?.amount) || 0
    })).filter((entry) => entry.method);
}

function buildVariantReferenceRows(inventoryVariants = []) {
    return inventoryVariants.map((variant) => ({
        productName: sanitizeText(variant.product_name || variant.productName),
        setName: sanitizeText(variant.set_name || variant.setName),
        price: sanitizeCurrency(variant.price) || 0
    })).filter((variant) => variant.productName && variant.setName);
}

function buildPrompt({ rawText, localParse = null, references, inventoryVariants }) {
    const allowedSetOptions = Array.isArray(references?.setOptions)
        ? references.setOptions.map((option) => sanitizeText(option)).filter(Boolean)
        : [];
    const allowsTSet = allowedSetOptions.some((option) => option.toUpperCase() === 'T');

    return [
        'Parse the pasted order form into normalized JSON for an internal sales encoder.',
        'Use exact values from the provided references whenever possible.',
        'Do not invent branches, couriers, admins, sales representatives, payment methods, products, or sets.',
        'If the existing deterministic parse already has a non-empty field, prefer that value unless the raw text clearly contradicts it.',
        'Important rules:',
        '- Keep product names intact when they include "w/ Vit C" or "Vitamin C". Do not split Vitamin C into a separate item.',
        '- "push set" usually means set "P". Use "P W C" only when the text explicitly says push with vit c.',
        '- Canonicalize equivalent product text such as "2,000,000gx" -> "2M GX", "1,800mg" -> "1800mg", and similar formatting variants.',
        '- Product aliases include "Lumin Seoul" -> "Lumin Seoul Drip" and "Sakura Kiyoshi" -> "Sakura Kiyoshi Drip" when those are the closest allowed inventory names.',
        '- Quantity conversion: 1 case of "Sakura Kiyoshi Drip" means 20 bottles, and 1 case of "Lumin Seoul Drip" means 25 bottles.',
        '- When both "Lumin Seoul Drip" and "Sakura Kiyoshi Drip" are present in an order, default both sets to "D C". Use "D B" only if the order list explicitly mentions "butterfly".',
        '- If a line says "1 Vial Tirzepatide 30mg Complete Set with Sakura Kiyoshi Drip", include both "Tirzepatide 30mg" and "Sakura Kiyoshi Drip" rows.',
        '- If an item says "with free macroset and cannula", treat the freebie text as non-product decoration, but use "cannula" as a strong hint for set "D C".',
        allowsTSet
            ? '- For medical supplies sold in pcs/pieces: if quantity is below 100, prefer set "T"; if quantity is 100 or more, prefer set "M", unless the text explicitly says another set.'
            : '- Set "T" is not available for this workspace. For medical supplies sold in pcs/pieces, prefer set "M" unless the text explicitly matches another allowed set.',
        '- DP/down payment is upfront payment. COD/balance/total cod is remaining collection and should not be counted as upfront payment.',
        '- "ORDER LIST" is the same as "FINAL ORDER LIST", and "TOTAL PURCHASE" is the same as "TOTAL".',
        '- For courier COD on LBC, use payment method "LBC Collection" only as a zero-amount collection method when applicable.',
        '- Common aliases already used by the encoder include MARK -> JAYSON, JETT -> JETHRO, NATS -> KYLE, JAMES -> JAMES, PICK UP -> MEET-UP, OWN BOOKING -> LALAMOVE.',
        '- If the raw text contains a recognizable item line and there is a close allowed inventory match, rows must include that item even when you also add a warning about ambiguity.',
        '- Prefer the textual set hint (for example push set -> P) over a conflicting price match. Use warnings for price mismatches instead of dropping the row.',
        '- Return saleDate in YYYY-MM-DD if confidently parsed, otherwise empty string.',
        '- Return warnings for uncertain assumptions or unmatched content.',
        '- Return a JSON object with this shape exactly: { saleDate, branch, cashBranch, courier, admin, salesRepresentative, clientName, clientContact, clientAddress, note, deliveryFee, deliveryFeeToCollect, paymentEntries, rows, warnings }.',
        '',
        'Allowed references:',
        JSON.stringify(references),
        '',
        'Allowed inventory variants:',
        JSON.stringify(buildVariantReferenceRows(inventoryVariants)),
        '',
        'Existing deterministic parse:',
        JSON.stringify(localParse || {}),
        '',
        'Raw pasted text:',
        rawText
    ].join('\n');
}

function buildPromptInput({ rawText, localParse = null, references, inventoryVariants }) {
    return buildPrompt({
        rawText: sanitizeText(rawText),
        localParse,
        references,
        inventoryVariants
    });
}

function extractCandidateText(responsePayload) {
    const candidates = Array.isArray(responsePayload?.candidates) ? responsePayload.candidates : [];
    for (const candidate of candidates) {
        const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
        const text = parts.map((part) => String(part?.text || '')).join('').trim();
        if (text) {
            return text;
        }
    }

    return '';
}

function extractOpenAiText(responsePayload) {
    const outputText = sanitizeText(responsePayload?.output_text);
    if (outputText) {
        return outputText;
    }

    const outputs = Array.isArray(responsePayload?.output) ? responsePayload.output : [];
    for (const output of outputs) {
        const contentParts = Array.isArray(output?.content) ? output.content : [];
        const text = contentParts.map((part) => sanitizeText(part?.text || part?.value || '')).join('\n').trim();
        if (text) {
            return text;
        }
    }

    return '';
}

function extractJsonPayload(candidateText) {
    const text = sanitizeText(candidateText);
    if (!text) {
        return '';
    }

    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch && fencedMatch[1]) {
        return sanitizeText(fencedMatch[1]);
    }

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        return text.slice(firstBrace, lastBrace + 1);
    }

    return text;
}

function normalizeParsedResult(parsed, { source = '', model = '' } = {}) {
    return {
        source: sanitizeText(source),
        model: sanitizeText(model),
        saleDate: sanitizeText(parsed?.saleDate),
        branch: sanitizeText(parsed?.branch),
        cashBranch: sanitizeText(parsed?.cashBranch),
        courier: sanitizeText(parsed?.courier),
        admin: sanitizeText(parsed?.admin),
        salesRepresentative: sanitizeText(parsed?.salesRepresentative),
        clientName: sanitizeText(parsed?.clientName),
        clientContact: sanitizeText(parsed?.clientContact),
        clientAddress: sanitizeText(parsed?.clientAddress),
        note: sanitizeText(parsed?.note),
        deliveryFee: sanitizeCurrency(parsed?.deliveryFee),
        deliveryFeeToCollect: sanitizeBooleanOrNull(parsed?.deliveryFeeToCollect),
        paymentEntries: sanitizePaymentEntries(parsed?.paymentEntries),
        rows: sanitizeAiRows(parsed?.rows),
        warnings: (Array.isArray(parsed?.warnings) ? parsed.warnings : []).map((value) => sanitizeText(value)).filter(Boolean)
    };
}

function formatProviderError(provider, error) {
    const prefix = sanitizeText(provider) || 'AI provider';
    const message = sanitizeText(error?.message || error);
    return message ? `${prefix}: ${message}` : `${prefix}: request failed.`;
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

async function parseOrderDraftWithGemini({ rawText, localParse = null, references, inventoryVariants, apiKeys = null }) {
    const apiKey = getProviderApiKey('gemini', apiKeys);
    if (!apiKey) {
        throw new Error('Gemini parsing is not configured on this server.');
    }

    const model = DEFAULT_GEMINI_MODEL;
    const response = await fetch(`${GEMINI_API_URL}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
            generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json'
            },
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text: buildPromptInput({
                                rawText,
                                localParse,
                                references,
                                inventoryVariants
                            })
                        }
                    ]
                }
            ]
        })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const remoteMessage = payload?.error?.message || `Gemini request failed (${response.status}).`;
        throw new Error(remoteMessage);
    }

    const candidateText = extractCandidateText(payload);
    if (!candidateText) {
        throw new Error('Gemini did not return a parse result.');
    }

    let parsed;
    try {
        parsed = JSON.parse(extractJsonPayload(candidateText));
    } catch (_error) {
        throw new Error('Gemini returned invalid JSON.');
    }

    return normalizeParsedResult(parsed, { source: 'gemini', model });
}

async function parseOrderDraftWithOpenAi({ rawText, localParse = null, references, inventoryVariants, apiKeys = null }) {
    const apiKey = getProviderApiKey('openai', apiKeys);
    if (!apiKey) {
        throw new Error('OpenAI parsing is not configured on this server.');
    }

    const model = DEFAULT_OPENAI_MODEL;
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
        model,
        input: buildPromptInput({
            rawText,
            localParse,
            references,
            inventoryVariants
        }),
        store: false
    });

    const candidateText = extractOpenAiText(response);
    if (!candidateText) {
        throw new Error('OpenAI did not return a parse result.');
    }

    let parsed;
    try {
        parsed = JSON.parse(extractJsonPayload(candidateText));
    } catch (_error) {
        throw new Error('OpenAI returned invalid JSON.');
    }

    return normalizeParsedResult(parsed, { source: 'openai', model });
}

async function parseOrderDraftWithAi({
    rawText,
    localParse = null,
    references,
    inventoryVariants,
    apiKeys = null
}) {
    const normalizedApiKeys = normalizeApiKeyOverrides(apiKeys);
    const providerRuns = [];

    if (getProviderApiKey('openai', normalizedApiKeys)) {
        providerRuns.push({
            name: 'OpenAI',
            run: () => parseOrderDraftWithOpenAi({ rawText, localParse, references, inventoryVariants, apiKeys: normalizedApiKeys })
        });
    }
    if (getProviderApiKey('gemini', normalizedApiKeys)) {
        providerRuns.push({
            name: 'Gemini',
            run: () => parseOrderDraftWithGemini({ rawText, localParse, references, inventoryVariants, apiKeys: normalizedApiKeys })
        });
    }

    if (!providerRuns.length) {
        throw new Error('AI parsing is not configured on this server.');
    }

    const errors = [];
    for (const provider of providerRuns) {
        try {
            return await withTimeout(
                provider.run(),
                DEFAULT_PROVIDER_TIMEOUT_MS,
                provider.name
            );
        } catch (error) {
            errors.push(formatProviderError(provider.name, error));
        }
    }

    throw new Error(errors.join(' | ') || 'AI parsing failed.');
}

module.exports = {
    getAiOrderParserProviderStatus,
    getConfiguredAiOrderParserProviders,
    isAiOrderParserConfigured,
    isGeminiOrderParserConfigured,
    isOpenAiOrderParserConfigured,
    parseOrderDraftWithAi,
    parseOrderDraftWithGemini,
    parseOrderDraftWithOpenAi
};
