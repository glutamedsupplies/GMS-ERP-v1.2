const appClient = window.appClient;

const state = {
    session: null,
    rows: [],
    loading: false,
    searchTimer: null,
    toastTimer: null
};

const headerMeta = document.getElementById('headerMeta');
const refreshBtn = document.getElementById('refreshBtn');
const totalCount = document.getElementById('totalCount');
const unresolvedCount = document.getElementById('unresolvedCount');
const resolvedCount = document.getElementById('resolvedCount');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const dateFromFilter = document.getElementById('dateFromFilter');
const dateToFilter = document.getElementById('dateToFilter');
const incidentTableBody = document.getElementById('incidentTableBody');
const pageStatus = document.getElementById('pageStatus');
const toast = document.getElementById('toast');

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    state.session = session;
    applyIdentity(session);
    bindEvents();
    await loadReports();
}

function applyIdentity(session) {
    const name = getSessionName(session);
    if (headerMeta) {
        headerMeta.textContent = name ? `Head Admin: ${name}` : 'Head Admin';
    }
    appClient.getBootstrap()
        .then((bootstrap) => appClient.applyBootstrapBrandTheme(bootstrap))
        .catch(() => {});
}

function bindEvents() {
    refreshBtn?.addEventListener('click', () => loadReports());
    statusFilter?.addEventListener('change', () => loadReports());
    dateFromFilter?.addEventListener('change', () => loadReports());
    dateToFilter?.addEventListener('change', () => loadReports());
    searchInput?.addEventListener('input', () => {
        window.clearTimeout(state.searchTimer);
        state.searchTimer = window.setTimeout(() => loadReports(), 260);
    });
    incidentTableBody?.addEventListener('click', handleTableAction);
}

async function loadReports() {
    setLoading(true);
    setPageStatus('Loading incident reports...');
    renderLoading();

    try {
        const payload = await appClient.listIncidentReports({
            search: searchInput?.value || '',
            status: statusFilter?.value || '',
            dateFrom: dateFromFilter?.value || '',
            dateTo: dateToFilter?.value || '',
            limit: 2500
        });
        state.rows = Array.isArray(payload?.items) ? payload.items : [];
        renderSummary(payload?.summary);
        renderRows();
        setPageStatus(`${state.rows.length.toLocaleString('en-PH')} incident report(s) shown.`);
    } catch (error) {
        state.rows = [];
        renderSummary();
        renderRows(error?.message || 'Failed to load incident reports.');
        setPageStatus(error?.message || 'Failed to load incident reports.', true);
    } finally {
        setLoading(false);
    }
}

function renderSummary(summary = {}) {
    totalCount.textContent = Number(summary.total || 0).toLocaleString('en-PH');
    unresolvedCount.textContent = Number(summary.unresolved || 0).toLocaleString('en-PH');
    resolvedCount.textContent = Number(summary.resolved || 0).toLocaleString('en-PH');
}

function renderLoading() {
    incidentTableBody.innerHTML = '<tr><td class="incident-empty" colspan="9">Loading incident reports...</td></tr>';
}

function renderRows(emptyMessage = 'No employee incident reports found.') {
    if (!state.rows.length) {
        incidentTableBody.innerHTML = `<tr><td class="incident-empty" colspan="9">${escapeHtml(emptyMessage)}</td></tr>`;
        return;
    }

    incidentTableBody.innerHTML = state.rows.map((row) => {
        const checkedText = [
            row.checkedBy || '',
            row.dateChecked ? formatDate(row.dateChecked) : ''
        ].filter(Boolean).join(' - ');
        const ownerName = row.ownerEmployeeName || row.preparedBy || row.ownerEmployeeId || '-';
        return `
          <tr class="${row.resolved ? '' : 'is-unresolved'}" data-report-id="${escapeHtml(row.id)}">
            <td>
              <span class="incident-cell-title">${escapeHtml(formatDate(row.date))}</span>
              <span class="incident-cell-subtitle">${escapeHtml(formatDateTime(row.updatedAt))}</span>
            </td>
            <td>
              <span class="incident-cell-title">${escapeHtml(ownerName)}</span>
              ${row.ownerEmployeeId ? `<span class="incident-cell-subtitle">${escapeHtml(row.ownerEmployeeId)}</span>` : ''}
            </td>
            <td><span class="incident-cell-title">${escapeHtml(row.department || '-')}</span></td>
            <td><span class="incident-cell-copy">${escapeHtml(row.reasonIncident || '-')}</span></td>
            <td><span class="incident-cell-copy">${escapeHtml(row.actionTaken || 'No action recorded')}</span></td>
            <td><span class="incident-cell-title">${escapeHtml(row.preparedBy || '-')}</span></td>
            <td><span class="incident-cell-title">${escapeHtml(checkedText || 'Not checked')}</span></td>
            <td>
              <span class="incident-status incident-status--${row.resolved ? 'resolved' : 'unresolved'}">
                <i class="fa-solid ${row.resolved ? 'fa-circle-check' : 'fa-circle-exclamation'}" aria-hidden="true"></i>
                ${row.resolved ? 'Resolved' : 'Not resolved'}
              </span>
            </td>
            <td>
              <button class="incident-icon-button ${row.resolved ? 'incident-icon-button--reopen' : 'incident-icon-button--resolve'}" type="button" data-action="toggle-status" title="${row.resolved ? 'Mark as not resolved' : 'Mark as resolved'}" aria-label="${row.resolved ? 'Mark as not resolved' : 'Mark as resolved'}">
                <i class="fa-solid ${row.resolved ? 'fa-arrow-rotate-left' : 'fa-check'}" aria-hidden="true"></i>
              </button>
            </td>
          </tr>
        `;
    }).join('');
}

function handleTableAction(event) {
    const button = event.target.closest('button[data-action="toggle-status"]');
    if (!button || state.loading) {
        return;
    }
    const rowElement = button.closest('tr[data-report-id]');
    const row = state.rows.find((item) => item.id === rowElement?.dataset.reportId);
    if (row) {
        toggleResolution(row);
    }
}

async function toggleResolution(row) {
    const nextResolved = !row.resolved;
    setLoading(true);
    setPageStatus(nextResolved ? 'Marking incident as resolved...' : 'Reopening incident...');
    try {
        await appClient.updateIncidentReport(row.id, { resolved: nextResolved });
        showToast(nextResolved ? 'Incident marked as resolved.' : 'Incident marked as not resolved.');
        await loadReports();
    } catch (error) {
        setPageStatus(error?.message || 'Failed to update incident status.', true);
        showToast(error?.message || 'Failed to update incident status.', true);
        setLoading(false);
    }
}

function setLoading(isLoading) {
    state.loading = Boolean(isLoading);
    if (refreshBtn) {
        refreshBtn.disabled = state.loading;
    }
    incidentTableBody?.querySelectorAll('button').forEach((button) => {
        button.disabled = state.loading;
    });
}

function setPageStatus(message = '', isError = false) {
    pageStatus.textContent = message;
    pageStatus.classList.toggle('is-error', Boolean(isError));
}

function showToast(message, isError = false) {
    window.clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.classList.toggle('is-error', Boolean(isError));
    toast.hidden = false;
    state.toastTimer = window.setTimeout(() => {
        toast.hidden = true;
    }, 3200);
}

function getSessionName(session = {}) {
    return String(
        session?.name
        || session?.display_name
        || session?.userName
        || session?.user?.name
        || session?.username
        || session?.id
        || ''
    ).trim();
}

function formatDate(value) {
    const text = String(value || '').trim();
    if (!text) {
        return '-';
    }
    const parts = text.slice(0, 10).split('-').map(Number);
    const date = parts.length === 3
        ? new Date(parts[0], parts[1] - 1, parts[2])
        : new Date(text);
    if (Number.isNaN(date.getTime())) {
        return text;
    }
    return date.toLocaleDateString('en-PH', {
        month: 'short',
        day: '2-digit',
        year: 'numeric'
    });
}

function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return date.toLocaleString('en-PH', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(value) {
    if (typeof appClient.escapeHtml === 'function') {
        return appClient.escapeHtml(String(value ?? ''));
    }
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
