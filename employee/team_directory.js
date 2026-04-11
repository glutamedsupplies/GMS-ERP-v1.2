const appClient = window.appClient;

const backBtn = document.getElementById('backBtn');
const pageTitle = document.getElementById('pageTitle');
const companyBadge = document.getElementById('companyBadge');
const viewerBadge = document.getElementById('viewerBadge');
const visibleCount = document.getElementById('visibleCount');
const staffCount = document.getElementById('staffCount');
const branchCountLabel = document.getElementById('branchCountLabel');
const branchFilter = document.getElementById('branchFilter');
const roleFilter = document.getElementById('roleFilter');
const searchInput = document.getElementById('searchInput');
const refreshBtn = document.getElementById('refreshBtn');
const statusText = document.getElementById('statusText');
const directoryTableBody = document.getElementById('directoryTableBody');

const state = {
    rows: [],
    branches: []
};
const ACCOUNT_STATUS_LABELS = Object.freeze({
    active: 'Active',
    inactive: 'Inactive',
    suspended: 'Suspended'
});

initialize();

async function initialize() {
    const session = await appClient.ensureSession();
    if (!session) {
        return;
    }

    const normalizedRole = normalizeRole(session.role);
    if (!['employee', 'head_admin', 'company_admin', 'super_admin'].includes(normalizedRole)) {
        window.location.replace('/employee/employee.html');
        return;
    }

    bindEvents();

    try {
        const bootstrap = await appClient.getBootstrap();
        appClient.applyBootstrapBrandTheme(bootstrap);
        applyWorkspaceCopy(bootstrap, session);
        loadBranches(bootstrap);
    } catch (error) {
        console.error('Failed to load team directory bootstrap:', error);
        applyWorkspaceCopy(null, session);
        setStatus(error.message || 'Unable to load workspace branding.', true);
    }

    await loadRows();
}

function bindEvents() {
    backBtn?.addEventListener('click', () => {
        window.location.href = '/employee/employee.html';
    });
    refreshBtn?.addEventListener('click', loadRows);
    branchFilter?.addEventListener('change', renderRows);
    roleFilter?.addEventListener('change', renderRows);
    searchInput?.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            await loadRows();
        }
    });
}

function applyWorkspaceCopy(bootstrap, session) {
    const companyName = String(bootstrap?.company?.name || '').trim() || 'Your company';
    companyBadge.textContent = companyName;
    viewerBadge.textContent = String(session?.userName || '').trim() || 'Signed in';
    pageTitle.textContent = 'Team Directory';
    document.title = `${companyName} Team Directory`;
}

function loadBranches(bootstrap) {
    const bootstrapBranches = Array.isArray(bootstrap?.branches)
        ? bootstrap.branches
            .filter((row) => row && row.is_active !== false)
            .map((row) => String(row.branch_name || row.name || row.branch || '').trim())
            .filter(Boolean)
        : [];
    state.branches = Array.from(new Set(bootstrapBranches));
    renderBranchOptions();
}

function renderBranchOptions() {
    const currentValue = String(branchFilter?.value || '').trim();
    branchFilter.innerHTML = [
        '<option value="">All Branches</option>',
        ...state.branches.map((branch) => (
            `<option value="${appClient.escapeHtml(branch)}">${appClient.escapeHtml(branch)}</option>`
        ))
    ].join('');

    if (currentValue && state.branches.includes(currentValue)) {
        branchFilter.value = currentValue;
    }
}

async function loadRows() {
    refreshBtn.disabled = true;
    setStatus('Loading team directory...', false);

    try {
        const rows = await appClient.listEmployees(searchInput?.value.trim() || '');
        state.rows = Array.isArray(rows) ? rows : [];
        mergeBranchOptionsFromRows();
        renderRows();
    } catch (error) {
        console.error('Failed to load team directory:', error);
        state.rows = [];
        renderRows();
        setStatus(error.message || 'Unable to load team directory.', true);
    } finally {
        refreshBtn.disabled = false;
    }
}

function mergeBranchOptionsFromRows() {
    const rowBranches = state.rows
        .map((row) => String(row.branch_name || row.branch || '').trim())
        .filter(Boolean);
    state.branches = Array.from(new Set([...state.branches, ...rowBranches]));
    renderBranchOptions();
}

function getVisibleRows() {
    const selectedBranch = String(branchFilter?.value || '').trim();
    const selectedRole = normalizeRole(roleFilter?.value);

    return state.rows.filter((row) => {
        const rowBranch = String(row.branch_name || row.branch || '').trim();
        const rowRole = normalizeRole(row.role);
        if (selectedBranch && !sameText(selectedBranch, rowBranch)) {
            return false;
        }
        if (selectedRole && rowRole !== selectedRole) {
            return false;
        }
        return true;
    }).sort((left, right) => {
        const leftBranch = String(left.branch_name || '').trim();
        const rightBranch = String(right.branch_name || '').trim();
        const branchCompare = leftBranch.localeCompare(rightBranch);
        if (branchCompare !== 0) {
            return branchCompare;
        }
        return String(left.name || '').localeCompare(String(right.name || ''));
    });
}

function renderRows() {
    const rows = getVisibleRows();
    visibleCount.textContent = String(rows.length);
    staffCount.textContent = String(rows.filter((row) => normalizeRole(row.role) === 'staff').length);
    branchCountLabel.textContent = branchFilter?.value || 'All Branches';

    if (!rows.length) {
        directoryTableBody.innerHTML = '<tr><td colspan="6" class="empty-row">No matching accounts found.</td></tr>';
        setStatus('No matching accounts found for the current filters.', false);
        return;
    }

    directoryTableBody.innerHTML = rows.map((row) => {
        const role = normalizeRole(row.role);
        const accountStatus = getAccountStatus(row);
        const statusClass = accountStatus;
        const statusLabel = ACCOUNT_STATUS_LABELS[accountStatus] || ACCOUNT_STATUS_LABELS.active;
        return `
            <tr>
                <td><strong>${appClient.escapeHtml(row.name || '-')}</strong></td>
                <td>${appClient.escapeHtml(row.id || '-')}</td>
                <td>${appClient.escapeHtml(formatRoleLabel(role))}</td>
                <td><span class="meta-pill branch">${appClient.escapeHtml(row.branch_name || '-')}</span></td>
                <td><span class="meta-pill ${statusClass}">${appClient.escapeHtml(statusLabel)}</span></td>
                <td>${appClient.escapeHtml(formatShift(row.time_in, row.time_out))}</td>
            </tr>
        `;
    }).join('');

    setStatus(`Showing ${rows.length} account(s) across the selected filters.`, false);
}

function formatRoleLabel(role) {
    if (role === 'staff') {
        return 'Staff';
    }
    if (role === 'employee') {
        return 'Employee';
    }
    if (role === 'company_admin' || role === 'head_admin') {
        return 'Company Admin';
    }
    return role ? role.replace(/_/g, ' ') : '-';
}

function formatShift(timeIn, timeOut) {
    const start = String(timeIn || '').trim();
    const end = String(timeOut || '').trim();
    if (!start && !end) {
        return '-';
    }
    return `${start || '--:--'} - ${end || '--:--'}`;
}

function normalizeRole(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizeAccountStatusValue(value = '') {
    return String(value || '').trim().toLowerCase();
}

function getAccountStatus(row) {
    const normalized = normalizeAccountStatusValue(row?.account_status);
    if (Object.prototype.hasOwnProperty.call(ACCOUNT_STATUS_LABELS, normalized)) {
        return normalized;
    }
    return row?.is_active === false ? 'suspended' : 'active';
}

function sameText(left, right) {
    return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

function setStatus(message, isError) {
    statusText.textContent = message;
    statusText.classList.toggle('error', Boolean(isError));
}
