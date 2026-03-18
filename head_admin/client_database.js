const appClient = window.appClient;

const searchInput = document.getElementById('searchInput');
const refreshBtn = document.getElementById('refreshBtn');
const openModalBtn = document.getElementById('openModalBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const saveClientBtn = document.getElementById('saveClientBtn');
const clientModal = document.getElementById('clientModal');
const clientModalTitle = document.getElementById('clientModalTitle');
const clientModalDescription = document.getElementById('clientModalDescription');
const clientNameInput = document.getElementById('clientNameInput');
const contactNumberInput = document.getElementById('contactNumberInput');
const clientTableBody = document.getElementById('clientTableBody');
const statusText = document.getElementById('statusText');
const visibleCount = document.getElementById('visibleCount');
const uniqueCount = document.getElementById('uniqueCount');
const filterLabel = document.getElementById('filterLabel');
const pageSubtitle = document.getElementById('pageSubtitle');

const state = {
    clients: [],
    filter: '',
    editingClientId: null,
    loadRequestToken: 0
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    const debouncedLoadClients = debounce(() => {
        void loadClients(state.filter);
    }, 180);

    searchInput.addEventListener('input', (event) => {
        state.filter = event.target.value.trim();
        debouncedLoadClients();
    });

    refreshBtn.addEventListener('click', () => {
        void loadClients(state.filter);
    });
    openModalBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    saveClientBtn.addEventListener('click', saveClient);

    contactNumberInput.addEventListener('input', () => {
        contactNumberInput.value = contactNumberInput.value.replace(/[^\d\s()+-]/g, '');
    });

    clientModal.addEventListener('click', (event) => {
        if (event.target === clientModal) {
            closeModal();
        }
    });
    clientTableBody.addEventListener('click', handleClientRowClick);

    [clientNameInput, contactNumberInput].forEach((input) => {
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                saveClient();
            }
        });
    });

    await Promise.all([
        applyCompanySubtitle(),
        loadClients()
    ]);
}

async function applyCompanySubtitle() {
    if (!pageSubtitle) {
        return;
    }

    try {
        const bootstrap = await appClient.getBootstrap();
        const companyName = String(bootstrap?.company?.name || '').trim();
        if (companyName) {
            pageSubtitle.textContent = `All client data for ${companyName}.`;
            return;
        }
    } catch (_error) {
        // Keep fallback subtitle when bootstrap is unavailable.
    }

    pageSubtitle.textContent = 'All client data for your company.';
}

async function loadClients(filter = '') {
    const requestToken = ++state.loadRequestToken;
    refreshBtn.disabled = true;
    setStatus('Loading client records...', false);

    try {
        const payload = await appClient.listClients(filter);
        if (requestToken !== state.loadRequestToken) {
            return;
        }
        state.clients = Array.isArray(payload.items) ? payload.items : [];
        renderClients(state.clients);
        updateSummary(filter, state.clients);
        setStatus(`Loaded ${state.clients.length} client record(s).`, false);
    } catch (error) {
        if (requestToken !== state.loadRequestToken) {
            return;
        }
        console.error('Failed to load clients:', error);
        state.clients = [];
        renderClients([]);
        updateSummary(filter, []);
        setStatus(error.message || 'Unable to load client records.', true);
    } finally {
        if (requestToken === state.loadRequestToken) {
            refreshBtn.disabled = false;
        }
    }
}

function renderClients(rows) {
    if (!rows.length) {
        clientTableBody.innerHTML = '<tr><td colspan="5" class="empty">No client records found.</td></tr>';
        return;
    }

    clientTableBody.innerHTML = rows.map((client) => `
        <tr data-client-id="${appClient.escapeHtml(client.id)}" title="Click to edit this client">
            <td><strong>${appClient.escapeHtml(client.name)}</strong></td>
            <td>${appClient.escapeHtml(formatContactNumber(client.contact_number))}</td>
            <td><span class="source-tag">${appClient.escapeHtml(formatSource(client.source))}</span></td>
            <td>${appClient.escapeHtml(formatCreatedAt(client.created_at))}</td>
            <td class="actions-cell">
                <div class="row-actions">
                    <button type="button" class="danger-btn" data-action="delete" data-client-id="${appClient.escapeHtml(client.id)}">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function updateSummary(filter, rows) {
    const uniqueNumbers = new Set(
        rows
            .map((client) => normalizePhContactNumber(client.normalized_contact_number || client.contact_number))
            .filter(Boolean)
    );

    visibleCount.textContent = String(rows.length);
    uniqueCount.textContent = String(uniqueNumbers.size);
    filterLabel.textContent = filter ? `Filter: ${filter}` : 'All Records';
}

function openModal(client = null) {
    state.editingClientId = client?.id ?? null;
    clientNameInput.value = client?.name || '';
    contactNumberInput.value = formatContactNumber(client?.contact_number || '');
    clientModalTitle.textContent = state.editingClientId ? 'Update Client' : 'Add Client';
    clientModalDescription.textContent = state.editingClientId
        ? 'I-update ang napiling client record. Kapag binago ang number sa existing number ng ibang client, magpapakita ito ng malinaw na validation error.'
        : 'Mag-add ng bagong client record. Kapag existing na ang number, io-update ang existing record sa halip na mag-error.';
    saveClientBtn.textContent = state.editingClientId ? 'Update Client' : 'Save Client';
    clientModal.style.display = 'flex';
    clientNameInput.focus();
}

function closeModal() {
    state.editingClientId = null;
    clientModal.style.display = 'none';
}

async function saveClient() {
    const name = clientNameInput.value.trim();
    const contactNumber = contactNumberInput.value.trim();
    const isEditing = state.editingClientId !== null && state.editingClientId !== undefined;

    if (!name || !contactNumber) {
        setStatus('Client name and contact number are required.', true);
        return;
    }

    saveClientBtn.disabled = true;
    setStatus(isEditing ? 'Updating client record...' : 'Saving client record...', false);

    try {
        const result = isEditing
            ? await appClient.updateClient(state.editingClientId, { name, contactNumber })
            : await appClient.addClient({ name, contactNumber });
        closeModal();
        await loadClients(state.filter);
        const action = result?.action === 'updated' || isEditing ? 'updated' : 'added';
        setStatus(`Client "${name}" ${action} successfully.`, false);
    } catch (error) {
        console.error('Failed to add client:', error);
        setStatus(error.message || 'Unable to save client record.', true);
    } finally {
        saveClientBtn.disabled = false;
    }
}

async function handleClientRowClick(event) {
    const deleteButton = event.target.closest('button[data-action="delete"]');
    if (deleteButton) {
        const targetClientId = deleteButton.dataset.clientId
            || deleteButton.closest('tr[data-client-id]')?.dataset.clientId;
        const targetClient = state.clients.find((entry) => String(entry.id) === String(targetClientId));
        if (!targetClient) {
            return;
        }

        await deleteClientRecord(targetClient, deleteButton);
        return;
    }

    const row = event.target.closest('tr[data-client-id]');
    if (!row) {
        return;
    }

    const client = state.clients.find((entry) => String(entry.id) === String(row.dataset.clientId));
    if (!client) {
        return;
    }

    openModal(client);
}

async function deleteClientRecord(client, triggerButton = null) {
    const clientName = String(client?.name || '').trim() || 'this client';
    const contactNumber = formatContactNumber(client?.contact_number || '');
    const confirmed = window.confirm(`Delete client "${clientName}" (${contactNumber})? This action cannot be undone.`);
    if (!confirmed) {
        return;
    }

    if (triggerButton) {
        triggerButton.disabled = true;
    }

    setStatus('Deleting client record...', false);

    try {
        await appClient.deleteClient(client.id);
        closeModal();
        await loadClients(state.filter);
        setStatus(`Client "${clientName}" deleted successfully.`, false);
    } catch (error) {
        console.error('Failed to delete client:', error);
        setStatus(error.message || 'Unable to delete client record.', true);
    } finally {
        if (triggerButton) {
            triggerButton.disabled = false;
        }
    }
}

function formatSource(source) {
    return String(source || '').toLowerCase() === 'seed' ? 'CSV Import' : 'Manual Add';
}

function normalizePhContactNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) {
        return '';
    }

    if (/^639\d{9}$/.test(digits)) {
        return digits;
    }

    if (/^09\d{9}$/.test(digits)) {
        return `63${digits.slice(1)}`;
    }

    if (/^9\d{9}$/.test(digits)) {
        return `63${digits}`;
    }

    if (/^00639\d{9}$/.test(digits)) {
        return digits.slice(2);
    }

    return digits;
}

function formatContactNumber(value) {
    const normalized = normalizePhContactNumber(value);
    if (/^639\d{9}$/.test(normalized)) {
        return `0${normalized.slice(2)}`;
    }

    return String(value || '').trim() || '-';
}

function formatCreatedAt(value) {
    if (!value) {
        return '-';
    }

    const parsed = new Date(value.replace(' ', 'T'));
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

function setStatus(message, isError) {
    statusText.textContent = message;
    statusText.classList.toggle('error', Boolean(isError));
}

function debounce(callback, delay) {
    let timerId = 0;

    return function debouncedCallback(...args) {
        window.clearTimeout(timerId);
        timerId = window.setTimeout(() => {
            callback(...args);
        }, delay);
    };
}
