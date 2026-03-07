const appClient = window.appClient;

const pageStatus = document.getElementById('pageStatus');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const refreshBtn = document.getElementById('refreshBtn');
const requestList = document.getElementById('requestList');
const detailCode = document.getElementById('detailCode');
const detailCreated = document.getElementById('detailCreated');
const detailUpdated = document.getElementById('detailUpdated');
const detailMessages = document.getElementById('detailMessages');
const detailName = document.getElementById('detailName');
const detailContact = document.getElementById('detailContact');
const detailRequest = document.getElementById('detailRequest');
const detailStatus = document.getElementById('detailStatus');
const allowEditCheckbox = document.getElementById('allowEditCheckbox');
const saveDetailBtn = document.getElementById('saveDetailBtn');
const chatBox = document.getElementById('chatBox');
const adminMessageInput = document.getElementById('adminMessageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const reloadThreadBtn = document.getElementById('reloadThreadBtn');

const state = {
    session: null,
    requests: [],
    selectedCode: '',
    selectedThread: null,
    filter: '',
    status: '',
    searchTimer: null
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }
    state.session = session;

    searchInput.addEventListener('input', () => {
        state.filter = searchInput.value.trim();
        if (state.searchTimer) {
            window.clearTimeout(state.searchTimer);
        }
        state.searchTimer = window.setTimeout(() => {
            loadRequests({ keepSelection: true });
        }, 170);
    });
    statusFilter.addEventListener('change', () => {
        state.status = statusFilter.value;
        loadRequests({ keepSelection: true });
    });
    refreshBtn.addEventListener('click', () => loadRequests({ keepSelection: true }));
    saveDetailBtn.addEventListener('click', saveRequestUpdate);
    sendMessageBtn.addEventListener('click', sendAdminReply);
    reloadThreadBtn.addEventListener('click', () => {
        if (!state.selectedCode) {
            setStatus('Select a request first.', true);
            return;
        }
        loadThread(state.selectedCode);
    });
    requestList.addEventListener('click', (event) => {
        const item = event.target.closest('.request-item[data-code]');
        if (!item) {
            return;
        }
        const requestCode = String(item.dataset.code || '').trim();
        if (!requestCode) {
            return;
        }
        loadThread(requestCode);
    });

    detailContact.addEventListener('input', () => {
        detailContact.value = sanitizeContactInput(detailContact.value);
    });
    adminMessageInput.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            sendAdminReply();
        }
    });

    setDetailEnabled(false);
    await loadRequests({ keepSelection: true });
}

async function loadRequests({ keepSelection = true } = {}) {
    setBusy(refreshBtn, true);
    setStatus('Loading customer requests...', false);

    try {
        const rows = await appClient.listCustomerRequests({
            filter: state.filter,
            status: state.status,
            limit: 300
        });
        state.requests = Array.isArray(rows) ? rows : [];
        renderRequestList();

        if (!state.requests.length) {
            state.selectedCode = '';
            state.selectedThread = null;
            setDetailEnabled(false);
            setStatus('No customer requests found.', false);
            return;
        }

        const hasSelected = keepSelection
            && state.selectedCode
            && state.requests.some((entry) => entry.requestCode === state.selectedCode);
        const nextCode = hasSelected ? state.selectedCode : state.requests[0].requestCode;
        if (nextCode) {
            await loadThread(nextCode, { silent: true });
        }
        setStatus(`Loaded ${state.requests.length} customer request(s).`, false);
    } catch (error) {
        console.error('Failed to load customer requests:', error);
        state.requests = [];
        state.selectedCode = '';
        state.selectedThread = null;
        renderRequestList();
        setDetailEnabled(false);
        setStatus(error.message || 'Unable to load customer requests.', true);
    } finally {
        setBusy(refreshBtn, false);
    }
}

function renderRequestList() {
    if (!state.requests.length) {
        requestList.innerHTML = '<div class="empty">No requests yet.</div>';
        return;
    }

    requestList.innerHTML = state.requests.map((entry) => {
        const activeClass = entry.requestCode === state.selectedCode ? 'active' : '';
        const detailPreview = truncateText(entry.requestDetails || '', 92);
        return `
            <div class="request-item ${activeClass}" data-code="${appClient.escapeHtml(entry.requestCode || '')}">
                <div class="request-title">
                    <span>${appClient.escapeHtml(entry.requestCode || '-')}</span>
                    <span class="pill ${appClient.escapeHtml(entry.status || 'open')}">${appClient.escapeHtml(formatStatus(entry.status))}</span>
                </div>
                <div class="request-sub">
                    ${appClient.escapeHtml(entry.clientName || '-')} • ${appClient.escapeHtml(entry.contactNumber || '-')}
                </div>
                <div class="request-sub">
                    Messages: ${appClient.escapeHtml(String(entry.messageCount || 0))} • ${appClient.escapeHtml(formatDateTime(entry.updatedAt || entry.createdAt))}
                </div>
                <div class="request-preview">${appClient.escapeHtml(detailPreview || 'No request details.')}</div>
            </div>
        `;
    }).join('');
}

async function loadThread(requestCode, { silent = false } = {}) {
    if (!requestCode) {
        return;
    }

    if (!silent) {
        setStatus(`Loading ${requestCode}...`, false);
    }

    try {
        const payload = await appClient.getCustomerRequestThread(requestCode);
        state.selectedCode = requestCode;
        state.selectedThread = payload;
        applyThread(payload);
        renderRequestList();
        if (!silent) {
            setStatus(`Loaded ${requestCode}.`, false);
        }
    } catch (error) {
        console.error('Failed to load request thread:', error);
        if (!silent) {
            setStatus(error.message || 'Unable to load request thread.', true);
        }
    }
}

function applyThread(payload) {
    const request = payload?.request;
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    if (!request) {
        setDetailEnabled(false);
        return;
    }

    setDetailEnabled(true);
    detailCode.textContent = request.requestCode || '-';
    detailCreated.textContent = formatDateTime(request.createdAt);
    detailUpdated.textContent = formatDateTime(request.updatedAt || request.createdAt);
    detailMessages.textContent = String(messages.length);
    detailName.value = request.clientName || '';
    detailContact.value = request.contactNumber || '';
    detailRequest.value = request.requestDetails || '';
    detailStatus.value = request.status || 'open';
    allowEditCheckbox.checked = Boolean(request.allowCustomerEdit);

    renderMessages(messages);
}

function renderMessages(messages) {
    if (!messages.length) {
        chatBox.innerHTML = '<div class="empty">No messages yet.</div>';
        return;
    }

    chatBox.innerHTML = '';
    messages.forEach((message) => {
        const messageEl = document.createElement('div');
        const senderType = message.senderType === 'admin' ? 'admin' : 'customer';
        messageEl.className = `chat-message ${senderType}`;

        const metaEl = document.createElement('div');
        metaEl.className = 'chat-meta';
        metaEl.textContent = `${message.senderName || (senderType === 'admin' ? 'Admin' : 'Customer')} • ${formatDateTime(message.createdAt)}`;

        const contentEl = document.createElement('div');
        contentEl.textContent = message.message || '';
        contentEl.style.whiteSpace = 'pre-wrap';

        messageEl.appendChild(metaEl);
        messageEl.appendChild(contentEl);
        chatBox.appendChild(messageEl);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function saveRequestUpdate() {
    if (!state.selectedCode) {
        setStatus('Select a request first.', true);
        return;
    }

    const clientName = detailName.value.trim();
    const contactNumber = detailContact.value.trim();
    const requestDetails = detailRequest.value.trim();
    const status = detailStatus.value;
    const allowCustomerEdit = allowEditCheckbox.checked;

    if (!clientName || !contactNumber) {
        setStatus('Name and contact number are required.', true);
        return;
    }

    setBusy(saveDetailBtn, true);
    setStatus(`Saving ${state.selectedCode}...`, false);

    try {
        const payload = await appClient.updateCustomerRequestByCode(state.selectedCode, {
            clientName,
            contactNumber,
            requestDetails,
            status,
            allowCustomerEdit
        });
        state.selectedThread = payload;
        applyThread(payload);
        await loadRequests({ keepSelection: true });
        setStatus(`Request ${state.selectedCode} updated.`, false);
    } catch (error) {
        console.error('Failed to update customer request:', error);
        setStatus(error.message || 'Unable to update request.', true);
    } finally {
        setBusy(saveDetailBtn, false);
    }
}

async function sendAdminReply() {
    if (!state.selectedCode) {
        setStatus('Select a request first.', true);
        return;
    }

    const message = adminMessageInput.value.trim();
    if (!message) {
        setStatus('Reply message cannot be empty.', true);
        return;
    }

    setBusy(sendMessageBtn, true);
    setStatus(`Sending reply to ${state.selectedCode}...`, false);

    try {
        const payload = await appClient.sendCustomerRequestMessage(state.selectedCode, {
            message,
            senderName: state.session?.userName || 'Admin'
        });
        adminMessageInput.value = '';
        state.selectedThread = payload;
        applyThread(payload);
        await loadRequests({ keepSelection: true });
        setStatus('Reply sent.', false);
    } catch (error) {
        console.error('Failed to send admin reply:', error);
        setStatus(error.message || 'Unable to send reply.', true);
    } finally {
        setBusy(sendMessageBtn, false);
    }
}

function setDetailEnabled(enabled) {
    const disabled = !enabled;
    [
        detailName,
        detailContact,
        detailRequest,
        detailStatus,
        allowEditCheckbox,
        saveDetailBtn,
        adminMessageInput,
        sendMessageBtn,
        reloadThreadBtn
    ].forEach((node) => {
        node.disabled = disabled;
    });

    if (disabled) {
        detailCode.textContent = '-';
        detailCreated.textContent = '-';
        detailUpdated.textContent = '-';
        detailMessages.textContent = '0';
        detailName.value = '';
        detailContact.value = '';
        detailRequest.value = '';
        detailStatus.value = 'open';
        allowEditCheckbox.checked = false;
        chatBox.innerHTML = '<div class="empty">Select a request to view messages.</div>';
    }
}

function setBusy(button, busy) {
    if (!button) {
        return;
    }
    button.disabled = Boolean(busy);
}

function setStatus(message, isError) {
    pageStatus.textContent = message || '';
    pageStatus.classList.toggle('error', Boolean(isError));
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

function truncateText(value, maxLength = 90) {
    const text = String(value || '').trim();
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength - 1)}…`;
}

function sanitizeContactInput(value) {
    return String(value || '').replace(/[^\d\s()+-]/g, '');
}
