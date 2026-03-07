const appClient = window.appClient;

const DEFAULT_LOGO_PATH = '/logo.png';
const DEFAULT_SIGNATURE_PATH = '/Signature_JHV.png';
const MAX_UPLOAD_BYTES = 700 * 1024;
const MAX_UPLOAD_DIMENSION = 900;
const DEFAULT_RECEIPT_TITLE = 'Sales Receipt';
const DEFAULT_RECEIPT_SUBTITLE = 'Official transaction summary';
const DEFAULT_RECEIPT_META_LAYOUT = [
    'Receipt #|receiptNumber',
    'Order #|orderNumber',
    'Date|saleDate|date',
    'Invoice Branch|branch',
    'Cash Branch|cashBranch',
    'Courier|courier',
    'Payment Type|paymentType',
    'Payment Method|paymentMethod',
    'Admin|adminName',
    'Sales Representative|salesRepresentative',
    'Client|clientName',
    'Contact|clientContact',
    'Address|clientAddress'
].join('\n');
const DEFAULT_RECEIPT_TOTALS_LAYOUT = [
    'Items Total|totals.baseTotal|money',
    'Total Due|totals.orderTotal|money',
    'Amount Paid|totals.amountPaid|money',
    'Collection|totals.collectionAmount|money',
    'Delivery Fee|totals.deliveryFee|money',
    'Overpayment|totals.overpaymentAmount|money',
    'Underpayment|totals.underpaymentAmount|money',
    'Note|note|text'
].join('\n');

const fields = {
    templateName: document.getElementById('templateName'),
    templateStyle: document.getElementById('templateStyle'),
    businessName: document.getElementById('businessName'),
    address: document.getElementById('address'),
    contact: document.getElementById('contact'),
    logoPath: document.getElementById('logoPath'),
    receiptTitle: document.getElementById('receiptTitle'),
    receiptSubtitle: document.getElementById('receiptSubtitle'),
    receiptMetaLayout: document.getElementById('receiptMetaLayout'),
    receiptTotalsLayout: document.getElementById('receiptTotalsLayout'),
    footerNotes: document.getElementById('footerNotes'),
    terms: document.getElementById('terms'),
    signatureName: document.getElementById('signatureName'),
    signaturePosition: document.getElementById('signaturePosition'),
    signaturePath: document.getElementById('signaturePath')
};

const logoUpload = document.getElementById('logoUpload');
const signatureUpload = document.getElementById('signatureUpload');
const logoPreview = document.getElementById('logoPreview');
const signaturePreview = document.getElementById('signaturePreview');
const logoMeta = document.getElementById('logoMeta');
const signatureMeta = document.getElementById('signatureMeta');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    bindEvents();
    await loadTemplate();
}

function bindEvents() {
    saveBtn.addEventListener('click', saveTemplate);
    logoUpload?.addEventListener('change', (event) => handleAssetUpload(event, {
        targetField: fields.logoPath,
        previewImage: logoPreview,
        previewMeta: logoMeta,
        fallbackPath: DEFAULT_LOGO_PATH,
        label: 'Logo'
    }));
    signatureUpload?.addEventListener('change', (event) => handleAssetUpload(event, {
        targetField: fields.signaturePath,
        previewImage: signaturePreview,
        previewMeta: signatureMeta,
        fallbackPath: DEFAULT_SIGNATURE_PATH,
        label: 'Signature'
    }));
    fields.logoPath?.addEventListener('input', () => updateAssetPreview({
        source: fields.logoPath.value,
        previewImage: logoPreview,
        previewMeta: logoMeta,
        fallbackPath: DEFAULT_LOGO_PATH,
        defaultLabel: 'No uploaded logo.'
    }));
    fields.signaturePath?.addEventListener('input', () => updateAssetPreview({
        source: fields.signaturePath.value,
        previewImage: signaturePreview,
        previewMeta: signatureMeta,
        fallbackPath: DEFAULT_SIGNATURE_PATH,
        defaultLabel: 'No uploaded signature.'
    }));
}

async function loadTemplate() {
    setStatus('Loading template...');
    try {
        const template = await appClient.getCompanyInvoiceTemplate();
        fields.templateName.value = template.template_name || '';
        fields.templateStyle.value = template.template_style || 'classic';
        fields.businessName.value = template.business_name || '';
        fields.address.value = template.address || '';
        fields.contact.value = template.contact || '';
        fields.logoPath.value = template.logo_path || '';
        fields.receiptTitle.value = template.receipt_title || DEFAULT_RECEIPT_TITLE;
        fields.receiptSubtitle.value = template.receipt_subtitle || DEFAULT_RECEIPT_SUBTITLE;
        fields.receiptMetaLayout.value = template.receipt_meta_layout || DEFAULT_RECEIPT_META_LAYOUT;
        fields.receiptTotalsLayout.value = template.receipt_totals_layout || DEFAULT_RECEIPT_TOTALS_LAYOUT;
        fields.footerNotes.value = template.footer_notes || '';
        fields.terms.value = template.terms || '';
        fields.signatureName.value = template.signature_name || '';
        fields.signaturePosition.value = template.signature_position || '';
        fields.signaturePath.value = template.signature_path || '';

        updateAssetPreview({
            source: fields.logoPath.value,
            previewImage: logoPreview,
            previewMeta: logoMeta,
            fallbackPath: DEFAULT_LOGO_PATH,
            defaultLabel: 'No uploaded logo.'
        });
        updateAssetPreview({
            source: fields.signaturePath.value,
            previewImage: signaturePreview,
            previewMeta: signatureMeta,
            fallbackPath: DEFAULT_SIGNATURE_PATH,
            defaultLabel: 'No uploaded signature.'
        });

        setStatus('Ready.');
    } catch (error) {
        console.error('Failed to load invoice template:', error);
        setStatus(error.message || 'Failed to load template.', true);
    }
}

async function saveTemplate() {
    saveBtn.disabled = true;
    setStatus('Saving template...');
    try {
        await appClient.updateCompanyInvoiceTemplate({
            template_name: fields.templateName.value.trim(),
            template_style: fields.templateStyle.value,
            business_name: fields.businessName.value.trim(),
            address: fields.address.value.trim(),
            contact: fields.contact.value.trim(),
            logo_path: fields.logoPath.value.trim(),
            receipt_title: fields.receiptTitle.value.trim(),
            receipt_subtitle: fields.receiptSubtitle.value.trim(),
            receipt_meta_layout: normalizeMultiline(fields.receiptMetaLayout.value),
            receipt_totals_layout: normalizeMultiline(fields.receiptTotalsLayout.value),
            footer_notes: normalizeMultiline(fields.footerNotes.value),
            terms: normalizeMultiline(fields.terms.value),
            signature_name: fields.signatureName.value.trim(),
            signature_position: fields.signaturePosition.value.trim(),
            signature_path: fields.signaturePath.value.trim()
        });
        setStatus('Invoice template saved.');
    } catch (error) {
        console.error('Failed to save invoice template:', error);
        setStatus(error.message || 'Failed to save template.', true);
    } finally {
        saveBtn.disabled = false;
    }
}

async function handleAssetUpload(event, {
    targetField,
    previewImage,
    previewMeta,
    fallbackPath,
    label
}) {
    const file = event?.target?.files?.[0];
    if (!file) {
        return;
    }

    if (!String(file.type || '').startsWith('image/')) {
        setStatus('Please choose a valid image file.', true);
        event.target.value = '';
        return;
    }

    setStatus(`Preparing ${label.toLowerCase()} upload...`);

    try {
        const rawDataUrl = await readFileAsDataUrl(file);
        const optimizedDataUrl = await optimizeImageDataUrl(rawDataUrl, {
            maxBytes: MAX_UPLOAD_BYTES,
            maxDimension: MAX_UPLOAD_DIMENSION
        });
        targetField.value = optimizedDataUrl;
        updateAssetPreview({
            source: optimizedDataUrl,
            previewImage,
            previewMeta,
            fallbackPath,
            defaultLabel: `No uploaded ${label.toLowerCase()}.`
        });
        setStatus(`${label} ready. Click Save Template to apply.`);
    } catch (error) {
        console.error(`Failed to process ${label.toLowerCase()} file:`, error);
        setStatus(error.message || `Failed to process ${label.toLowerCase()} file.`, true);
    } finally {
        event.target.value = '';
    }
}

function updateAssetPreview({
    source,
    previewImage,
    previewMeta,
    fallbackPath,
    defaultLabel
}) {
    const raw = String(source || '').trim();
    const resolved = resolveAssetPath(raw, fallbackPath);

    if (previewImage) {
        previewImage.onerror = () => {
            previewImage.onerror = null;
            previewImage.src = resolveAssetPath(fallbackPath, fallbackPath);
        };
        previewImage.src = resolved;
    }

    if (previewMeta) {
        if (!raw) {
            previewMeta.textContent = defaultLabel;
        } else if (raw.startsWith('data:image/')) {
            previewMeta.textContent = 'Uploaded image is ready.';
        } else {
            previewMeta.textContent = 'Using saved path / URL image.';
        }
    }
}

function resolveAssetPath(value, fallbackPath = '/logo.png') {
    const raw = String(value || '').trim();
    if (!raw) {
        return new URL(fallbackPath, window.location.origin).href;
    }
    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) {
        return raw;
    }
    if (raw.startsWith('/')) {
        return new URL(raw, window.location.origin).href;
    }
    return new URL(raw, window.location.href).href;
}

function normalizeMultiline(value) {
    return String(value ?? '')
        .replace(/\r\n/g, '\n')
        .trim();
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Unable to read image file.'));
        reader.readAsDataURL(file);
    });
}

function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Invalid image content.'));
        image.src = dataUrl;
    });
}

async function optimizeImageDataUrl(dataUrl, { maxBytes, maxDimension }) {
    if (dataUrlByteLength(dataUrl) <= maxBytes) {
        return dataUrl;
    }

    const image = await loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Your browser does not support image processing.');
    }

    let width = image.naturalWidth || image.width || 0;
    let height = image.naturalHeight || image.height || 0;
    if (!width || !height) {
        throw new Error('Invalid image size.');
    }

    const initialScale = Math.min(1, maxDimension / Math.max(width, height));
    width = Math.max(1, Math.round(width * initialScale));
    height = Math.max(1, Math.round(height * initialScale));

    for (let attempt = 0; attempt < 6; attempt += 1) {
        canvas.width = width;
        canvas.height = height;
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        for (let quality = 0.92; quality >= 0.5; quality -= 0.1) {
            const candidate = canvas.toDataURL('image/webp', quality);
            if (dataUrlByteLength(candidate) <= maxBytes) {
                return candidate;
            }
        }

        width = Math.max(1, Math.round(width * 0.86));
        height = Math.max(1, Math.round(height * 0.86));
    }

    throw new Error('Image is too large even after optimization. Please use a smaller file.');
}

function dataUrlByteLength(dataUrl) {
    const text = String(dataUrl || '');
    const commaIndex = text.indexOf(',');
    if (commaIndex < 0) {
        return text.length;
    }
    const base64 = text.slice(commaIndex + 1);
    const padding = base64.endsWith('==') ? 2 : (base64.endsWith('=') ? 1 : 0);
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#b91c1c' : '#374151';
}
