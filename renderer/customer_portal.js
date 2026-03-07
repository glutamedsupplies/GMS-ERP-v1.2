const appClient = window.appClient;

const portalTitle = document.getElementById('portalTitle');
const portalSubtitle = document.getElementById('portalSubtitle');
const companyCodeInput = document.getElementById('companyCodeInput');
const clientNameInput = document.getElementById('clientNameInput');
const contactNumberInput = document.getElementById('contactNumberInput');
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
    brandingTimer: null
};

initialize();

function initialize() {
    const params = new URLSearchParams(window.location.search);
    const initialCompanyCode = String(params.get('companyCode') || '').trim();
    if (initialCompanyCode) {
        companyCodeInput.value = initialCompanyCode;
    }
    state.companyCode = initialCompanyCode;

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

async function createRequest() {
    const companyCode = readCompanyCode();
    const clientName = clientNameInput.value.trim();
    const contactNumber = contactNumberInput.value.trim();
    const requestDetails = requestDetailsInput.value.trim() || 'Customer chat thread';
    const initialMessage = initialMessageInput.value.trim();

    if (!companyCode || !clientName || !contactNumber) {
        setStatus('Company code, name, and contact number are required.', true);
        return;
    }

    if (!initialMessage) {
        setStatus('Please enter an initial message to start the chat.', true);
        return;
    }

    setBusy(createRequestBtn, true);
    setStatus('Starting chat...', false);

    try {
        const payload = await appClient.createPublicCustomerRequest({
            companyCode,
            clientName,
            contactNumber,
            requestDetails,
            initialMessage
        });
        applyThread(payload);
        requestCodeInput.value = payload?.request?.requestCode || '';
        lookupContactInput.value = payload?.request?.contactNumber || contactNumber;
        initialMessageInput.value = '';
        setStatus(`Chat started. Your code is ${payload?.request?.requestCode || '-'}.`, false);
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
        setStatus('Company code, request code, and contact number are required.', true);
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

    document.title = `${appName} Customer Chat`;
    portalTitle.textContent = `${appName} Customer Chat`;
    portalSubtitle.textContent = companyName
        ? `Company: ${companyName} | Chat directly with support.`
        : 'Send your message and chat directly with support.';
    document.documentElement.style.setProperty('--accent', primaryColor);
}
