const appClient = window.appClient;

const portalTitle = document.getElementById('portalTitle');
const portalSubtitle = document.getElementById('portalSubtitle');
const primaryCardTitle = document.getElementById('primaryCardTitle');
const primaryCardCopy = document.getElementById('primaryCardCopy');
const companyCodeInput = document.getElementById('companyCodeInput');
const clientNameInput = document.getElementById('clientNameInput');
const contactNumberInput = document.getElementById('contactNumberInput');
const signupEmailInput = document.getElementById('signupEmailInput');
const signupIdInput = document.getElementById('signupIdInput');
const signupRoleInput = document.getElementById('signupRoleInput');
const requestDetailsLabel = document.getElementById('requestDetailsLabel');
const initialMessageLabel = document.getElementById('initialMessageLabel');
const requestDetailsInput = document.getElementById('requestDetailsInput');
const initialMessageInput = document.getElementById('initialMessageInput');
const createRequestBtn = document.getElementById('createRequestBtn');
const requestCodeInput = document.getElementById('requestCodeInput');
const lookupContactInput = document.getElementById('lookupContactInput');
const openRequestBtn = document.getElementById('openRequestBtn');
const portalStatus = document.getElementById('portalStatus');
const requestThreadSection = document.getElementById('requestThreadSection');
const requestCodeLabel = document.getElementById('requestCodeLabel');
const requestStatusLabel = document.getElementById('requestStatusLabel');
const requestEditableLabel = document.getElementById('requestEditableLabel');
const requestUpdatedLabel = document.getElementById('requestUpdatedLabel');
const editNameInput = document.getElementById('editNameInput');
const editContactInput = document.getElementById('editContactInput');
const editDetailsInput = document.getElementById('editDetailsInput');
const saveRequestBtn = document.getElementById('saveRequestBtn');
const refreshThreadBtn = document.getElementById('refreshThreadBtn');
const chatMessages = document.getElementById('chatMessages');
const chatMessageInput = document.getElementById('chatMessageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const refreshChatBtn = document.getElementById('refreshChatBtn');

const state = {
    companyCode: '',
    requestCode: '',
    authContactNumber: '',
    thread: null,
    brandingTimer: null,
    intent: 'support'
};

initialize();

function initialize() {
    const params = new URLSearchParams(window.location.search);
    const initialCompanyCode = String(params.get('companyCode') || '').trim();
    const intent = String(params.get('intent') || '').trim().toLowerCase();
    if (initialCompanyCode) {
        companyCodeInput.value = initialCompanyCode;
    }
    state.companyCode = initialCompanyCode;
    state.intent = intent === 'signup' ? 'signup' : 'support';
    applyIntentDefaults();
    document.body.classList.toggle('is-signup', state.intent === 'signup');

    createRequestBtn.addEventListener('click', createRequest);
    openRequestBtn.addEventListener('click', openRequestThread);
    saveRequestBtn.addEventListener('click', saveRequestEdits);
    refreshThreadBtn.addEventListener('click', refreshThread);
    refreshChatBtn.addEventListener('click', refreshThread);
    sendMessageBtn.addEventListener('click', sendMessage);

    [contactNumberInput, lookupContactInput, editContactInput].forEach((input) => {
        input.addEventListener('input', () => {
            input.value = sanitizeContactInput(input.value);
        });
    });

    companyCodeInput.addEventListener('input', () => {
        state.companyCode = companyCodeInput.value.trim();
        if (state.brandingTimer) {
            window.clearTimeout(state.brandingTimer);
        }
        state.brandingTimer = window.setTimeout(() => {
            refreshBranding();
        }, 180);
    });

    requestCodeInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            openRequestThread();
        }
    });
    lookupContactInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            openRequestThread();
        }
    });
    chatMessageInput.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            sendMessage();
        }
    });

    refreshBranding();
}

function applyIntentDefaults() {
    if (state.intent !== 'signup') {
        if (requestDetailsLabel) {
            requestDetailsLabel.textContent = 'Topic (optional)';
        }
        if (initialMessageLabel) {
            initialMessageLabel.textContent = 'Initial Message (optional)';
        }
        return;
    }

    if (primaryCardTitle) {
        primaryCardTitle.textContent = 'Sign Up Request';
    }
    if (primaryCardCopy) {
        primaryCardCopy.textContent = 'Submit a sign up request so the team can create your access.';
    }
    if (createRequestBtn) {
        createRequestBtn.textContent = 'Submit Sign Up';
    }
    if (requestDetailsInput && !requestDetailsInput.value.trim()) {
        requestDetailsInput.value = 'Account sign up request';
    }
    if (requestDetailsInput) {
        requestDetailsInput.placeholder = 'Optional notes for the head admin.';
    }
    if (requestDetailsLabel) {
        requestDetailsLabel.textContent = 'Access Notes (optional)';
    }
    if (initialMessageLabel) {
        initialMessageLabel.textContent = 'Approval Note (optional)';
    }
    if (initialMessageInput) {
        initialMessageInput.placeholder = 'Add extra details for approval (modules, branch, schedule).';
    }
}

async function createRequest() {
    const companyCode = readCompanyCode();
    const clientName = clientNameInput.value.trim();
    const contactNumber = contactNumberInput.value.trim();
    const signupEmail = signupEmailInput ? signupEmailInput.value.trim() : '';
    const signupId = signupIdInput ? signupIdInput.value.trim() : '';
    const signupRole = signupRoleInput ? signupRoleInput.value.trim() : '';
    const defaultDetails = state.intent === 'signup' ? 'Account sign up request' : 'Customer chat thread';
    const requestDetails = requestDetailsInput.value.trim() || defaultDetails;
    const initialMessage = initialMessageInput.value.trim();

    if (!companyCode || !clientName || !contactNumber) {
        setStatus('Company ID, name, and contact number are required.', true);
        return;
    }

    if (state.intent === 'signup') {
        if (!signupEmail || !signupId) {
            setStatus('Email and desired employee ID are required for sign up.', true);
            return;
        }
        if (!isValidEmail(signupEmail)) {
            setStatus('Please provide a valid email address.', true);
            return;
        }
    }

    if (!initialMessage && state.intent !== 'signup') {
        setStatus(
            state.intent === 'signup'
                ? 'Please enter your sign up details to continue.'
                : 'Please enter an initial message to start the chat.',
            true
        );
        return;
    }

    setBusy(createRequestBtn, true);
    setStatus(state.intent === 'signup' ? 'Submitting sign up request...' : 'Starting chat...', false);

    try {
        const requestMeta = state.intent === 'signup'
            ? {
                intent: 'signup',
                name: clientName,
                email: signupEmail,
                role: signupRole || 'employee',
                desiredId: signupId,
                contactNumber
            }
            : {};
        const signupMessage = state.intent === 'signup'
            ? buildSignupMessage({
                name: clientName,
                email: signupEmail,
                role: signupRole || 'employee',
                desiredId: signupId,
                contactNumber,
                notes: requestDetails
            })
            : '';
        const finalInitialMessage = initialMessage || signupMessage;
        const payload = await appClient.createPublicCustomerRequest({
            companyCode,
            clientName,
            contactNumber,
            requestDetails,
            initialMessage: finalInitialMessage,
            requestMeta
        });
        applyThread(payload);
        requestCodeInput.value = payload?.request?.requestCode || '';
        lookupContactInput.value = payload?.request?.contactNumber || contactNumber;
        initialMessageInput.value = '';
        setStatus(
            state.intent === 'signup'
                ? `Sign up request submitted. Your code is ${payload?.request?.requestCode || '-'}. Wait for admin approval.`
                : `Chat started. Your code is ${payload?.request?.requestCode || '-'}.`,
            false
        );
    } catch (error) {
        setStatus(error.message || 'Unable to submit request.', true);
    } finally {
        setBusy(createRequestBtn, false);
    }
}

async function openRequestThread() {
    const companyCode = readCompanyCode();
    const requestCode = requestCodeInput.value.trim().toUpperCase();
    const contactNumber = lookupContactInput.value.trim();

    if (!companyCode || !requestCode || !contactNumber) {
        setStatus('Company ID, request code, and contact number are required.', true);
        return;
    }

    setBusy(openRequestBtn, true);
    setStatus(`Loading ${requestCode}...`, false);

    try {
        const payload = await appClient.getPublicCustomerRequest({
            companyCode,
            requestCode,
            contactNumber
        });
        applyThread(payload);
        setStatus(`Loaded request ${payload?.request?.requestCode || requestCode}.`, false);
    } catch (error) {
        setStatus(error.message || 'Unable to open request.', true);
    } finally {
        setBusy(openRequestBtn, false);
    }
}

async function refreshThread() {
    if (!state.requestCode || !state.authContactNumber) {
        setStatus('Open a request first.', true);
        return;
    }

    setStatus('Refreshing request thread...', false);
    try {
        const payload = await appClient.getPublicCustomerRequest({
            companyCode: state.companyCode,
            requestCode: state.requestCode,
            contactNumber: state.authContactNumber
        });
        applyThread(payload);
        setStatus('Thread updated.', false);
    } catch (error) {
        setStatus(error.message || 'Unable to refresh thread.', true);
    }
}

async function saveRequestEdits() {
    if (!state.thread?.request?.requestCode) {
        setStatus('Open a request first.', true);
        return;
    }

    if (!state.thread.request.allowCustomerEdit) {
        setStatus('This request is currently locked for customer edits.', true);
        return;
    }

    const requestCode = state.thread.request.requestCode;
    const nextName = editNameInput.value.trim();
    const nextContact = editContactInput.value.trim();
    const nextDetails = editDetailsInput.value.trim();

    if (!nextName || !nextContact) {
        setStatus('Name and contact number are required.', true);
        return;
    }

    setBusy(saveRequestBtn, true);
    setStatus(`Saving edits for ${requestCode}...`, false);

    try {
        const payload = await appClient.updatePublicCustomerRequest(
            requestCode,
            {
                clientName: nextName,
                contactNumber: nextContact,
                requestDetails: nextDetails,
                authContactNumber: state.authContactNumber
            },
            {
                companyCode: state.companyCode,
                contactNumber: state.authContactNumber
            }
        );
        applyThread(payload);
        lookupContactInput.value = payload?.request?.contactNumber || nextContact;
        setStatus(`Request ${requestCode} updated.`, false);
    } catch (error) {
        setStatus(error.message || 'Unable to save request edits.', true);
    } finally {
        setBusy(saveRequestBtn, false);
    }
}

async function sendMessage() {
    if (!state.thread?.request?.requestCode) {
        setStatus('Open a request first.', true);
        return;
    }

    const message = chatMessageInput.value.trim();
    if (!message) {
        setStatus('Message cannot be empty.', true);
        return;
    }

    setBusy(sendMessageBtn, true);
    setStatus('Sending message...', false);

    try {
        const payload = await appClient.sendPublicCustomerRequestMessage(
            state.thread.request.requestCode,
            {
                message,
                senderName: editNameInput.value.trim() || state.thread.request.clientName,
                authContactNumber: state.authContactNumber
            },
            {
                companyCode: state.companyCode,
                contactNumber: state.authContactNumber
            }
        );
        chatMessageInput.value = '';
        applyThread(payload);
        setStatus('Message sent.', false);
    } catch (error) {
        setStatus(error.message || 'Unable to send message.', true);
    } finally {
        setBusy(sendMessageBtn, false);
    }
}

function applyThread(payload) {
    if (!payload?.request) {
        return;
    }

    const request = payload.request;
    const messages = Array.isArray(payload.messages) ? payload.messages : [];

    state.thread = payload;
    state.requestCode = String(request.requestCode || '').trim();
    state.authContactNumber = String(request.contactNumber || state.authContactNumber || '').trim();
    state.companyCode = payload.companyCode || state.companyCode || readCompanyCode();
    companyCodeInput.value = state.companyCode;

    requestThreadSection.style.display = 'block';
    requestCodeLabel.textContent = request.requestCode || '-';
    requestEditableLabel.textContent = request.allowCustomerEdit ? 'Yes' : 'No (locked by admin)';
    requestUpdatedLabel.textContent = formatDateTime(request.updatedAt || request.createdAt);
    requestCodeInput.value = request.requestCode || '';

    requestStatusLabel.innerHTML = '';
    const statusPill = document.createElement('span');
    statusPill.className = `pill ${request.status || 'open'}`;
    statusPill.textContent = formatStatus(request.status);
    requestStatusLabel.appendChild(statusPill);

    editNameInput.value = request.clientName || '';
    editContactInput.value = request.contactNumber || '';
    editDetailsInput.value = request.requestDetails || '';

    const allowEdit = Boolean(request.allowCustomerEdit);
    [editNameInput, editContactInput, editDetailsInput, saveRequestBtn].forEach((input) => {
        input.disabled = !allowEdit;
    });

    renderMessages(messages);
}

function renderMessages(messages) {
    if (!messages.length) {
        chatMessages.innerHTML = '<div class="chat-empty">No messages yet.</div>';
        return;
    }

    chatMessages.innerHTML = '';
    messages.forEach((entry) => {
        const messageEl = document.createElement('div');
        const senderType = entry.senderType === 'admin' ? 'admin' : 'customer';
        messageEl.className = `chat-message ${senderType}`;

        const metaEl = document.createElement('div');
        metaEl.className = 'chat-meta';
        metaEl.textContent = `${entry.senderName || (senderType === 'admin' ? 'Admin' : 'Customer')} | ${formatDateTime(entry.createdAt)}`;

        const textEl = document.createElement('div');
        textEl.textContent = entry.message || '';
        textEl.style.whiteSpace = 'pre-wrap';

        messageEl.appendChild(metaEl);
        messageEl.appendChild(textEl);
        chatMessages.appendChild(messageEl);
    });

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function readCompanyCode() {
    state.companyCode = companyCodeInput.value.trim();
    return state.companyCode;
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function buildSignupMessage({ name, email, role, desiredId, contactNumber, notes } = {}) {
    const lines = [
        'Signup request details:',
        `Name: ${name || '-'}`,
        `Email: ${email || '-'}`,
        `Role: ${formatRoleLabel(role)}`,
        `Desired ID: ${desiredId || '-'}`,
        `Contact: ${contactNumber || '-'}`
    ];
    if (notes) {
        lines.push(`Notes: ${notes}`);
    }
    return lines.join('\n');
}

function formatRoleLabel(role) {
    const normalized = String(role || '').trim().toLowerCase();
    if (normalized === 'staff') {
        return 'Staff';
    }
    if (normalized === 'company_admin' || normalized === 'admin') {
        return 'Company Admin';
    }
    return 'Employee';
}

function sanitizeContactInput(value) {
    return String(value || '').replace(/[^\d\s()+-]/g, '');
}

function setBusy(button, busy) {
    if (!button) {
        return;
    }
    button.disabled = Boolean(busy);
}

function setStatus(message, isError) {
    portalStatus.textContent = message || '';
    portalStatus.classList.toggle('error', Boolean(isError));
}

function formatStatus(status) {
    const normalized = String(status || '').trim();
    if (!normalized) {
        return 'Open';
    }
    return normalized
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value) {
    if (!value) {
        return '-';
    }

    const parsed = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(parsed.getTime())) {
        return String(value);
    }

    return parsed.toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function refreshBranding() {
    const companyCode = readCompanyCode();
    try {
        const branding = await appClient.getPublicBranding({ companyCode });
        applyBranding(branding || {});
    } catch (_error) {
        applyBranding({});
    }
}

function applyBranding(branding) {
    const appName = String(branding.appName || 'GMS ERP').trim() || 'GMS ERP';
    const companyName = String(branding.companyName || '').trim();
    const primaryColor = String(branding.primaryColor || '').trim() || '#0b7285';
    const isSignup = state.intent === 'signup';

    document.title = `${appName} ${isSignup ? 'Sign Up' : 'Customer Chat'}`;
    portalTitle.textContent = `${appName} ${isSignup ? 'Sign Up' : 'Customer Chat'}`;
    portalSubtitle.textContent = isSignup
        ? (companyName
            ? `Company: ${companyName} | Submit your access request.`
            : 'Submit your sign up request and we will get back to you.')
        : (companyName
            ? `Company: ${companyName} | Chat directly with support.`
            : 'Send your message and chat directly with support.');
    document.documentElement.style.setProperty('--accent', primaryColor);
    if (appClient?.mixHexColors && appClient?.hexToRgba) {
        const strong = appClient.mixHexColors(primaryColor, '#0f172a', 0.2);
        const soft = appClient.mixHexColors(primaryColor, '#ffffff', 0.85);
        document.documentElement.style.setProperty('--accent-strong', strong);
        document.documentElement.style.setProperty('--accent-soft', soft);
        document.documentElement.style.setProperty('--accent-glow', appClient.hexToRgba(primaryColor, 0.24));
    }
}
