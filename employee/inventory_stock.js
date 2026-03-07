const appClient = window.appClient;

const pageTitle = document.getElementById('pageTitle');
const visibleCount = document.getElementById('visibleCount');
const lowStockCount = document.getElementById('lowStockCount');
const branchLabel = document.getElementById('branchLabel');
const branchFilter = document.getElementById('branchFilter');
const searchInput = document.getElementById('searchInput');
const refreshBtn = document.getElementById('refreshBtn');
const statusText = document.getElementById('statusText');
const inventoryBody = document.getElementById('inventoryBody');
const backBtn = document.getElementById('backBtn');

const LOW_STOCK_THRESHOLD = 5;
const state = {
    rows: [],
    branches: []
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'employee' });
    if (!session) {
        return;
    }

    const bootstrap = await loadBootstrap();
    if (!bootstrap) {
        return;
    }

    const modules = (bootstrap.modules && typeof bootstrap.modules === 'object' && !Array.isArray(bootstrap.modules))
        ? bootstrap.modules
        : {};
    const featureAccess = appClient.normalizeUserFeatureAccess(
        bootstrap?.user?.feature_access || session?.feature_access || {}
    );

    if (!modules.inventory || !featureAccess.inventory) {
        window.location.replace('/employee/employee.html');
        return;
    }

    applyWorkspaceConfig(bootstrap);
    bindEvents();
    loadBranches(bootstrap);
    await loadInventory();
}

async function loadBootstrap() {
    try {
        return await appClient.getBootstrap();
    } catch (error) {
        console.error('Failed to load bootstrap data:', error);
        setStatus(error.message || 'Unable to load account access.', true);
        return null;
    }
}

function applyWorkspaceConfig(bootstrap) {
    const labels = bootstrap?.workspaceConfig?.labels || {};
    pageTitle.textContent = labels.inventoryLevelsPageTitle || 'Inventory Stock';
}

function bindEvents() {
    backBtn.addEventListener('click', () => {
        window.location.href = '/employee/employee.html';
    });
    refreshBtn.addEventListener('click', loadInventory);
    branchFilter.addEventListener('change', loadInventory);
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            loadInventory();
        }
    });
}

function loadBranches(bootstrap) {
    const rows = Array.isArray(bootstrap?.branches) ? bootstrap.branches : [];
    const names = rows
        .filter((row) => row && row.is_active !== false)
        .map((row) => String(row.branch_name || row.name || row.branch || '').trim())
        .filter(Boolean);

    const uniqueNames = Array.from(new Set(names));
    state.branches = uniqueNames;
    branchFilter.innerHTML = uniqueNames.map((name) =>
        `<option value="${appClient.escapeHtml(name)}">${appClient.escapeHtml(name)}</option>`
    ).join('');

    if (!branchFilter.value && uniqueNames.length) {
        branchFilter.value = uniqueNames[0];
    }
}

async function loadInventory() {
    const branch = String(branchFilter.value || '').trim();
    if (!branch) {
        state.rows = [];
        renderRows();
        renderSummary();
        setStatus('No branch available yet.', true);
        return;
    }

    refreshBtn.disabled = true;
    setStatus('Loading inventory stock...', false);

    try {
        const rows = await appClient.listInventory({
            branch,
            filter: searchInput.value.trim()
        });

        state.rows = Array.isArray(rows) ? rows : [];
        renderRows();
        renderSummary();
        setStatus(`Loaded ${state.rows.length} inventory item(s).`, false);
    } catch (error) {
        console.error('Failed to load inventory stock:', error);
        state.rows = [];
        renderRows();
        renderSummary();
        setStatus(error.message || 'Unable to load inventory stock.', true);
    } finally {
        refreshBtn.disabled = false;
    }
}

function renderRows() {
    if (!state.rows.length) {
        inventoryBody.innerHTML = '<tr><td colspan="7" class="empty">No inventory items found.</td></tr>';
        return;
    }

    inventoryBody.innerHTML = state.rows.map((row) => {
        const quantity = Number(row.quantity ?? 0);
        const isLow = quantity <= LOW_STOCK_THRESHOLD;
        const statusTag = isLow
            ? '<span class="low-tag">Low stock</span>'
            : '<span class="ok-tag">OK</span>';

        return `
            <tr>
                <td><strong>${appClient.escapeHtml(row.item_name || '-')}</strong></td>
                <td>${appClient.escapeHtml(row.item_code || '-')}</td>
                <td>${appClient.escapeHtml(row.inventory_unit || '-')}</td>
                <td>${appClient.escapeHtml(row.item_type || '-')}</td>
                <td><strong>${appClient.escapeHtml(formatQuantity(quantity))}</strong></td>
                <td>${statusTag}</td>
                <td>${appClient.escapeHtml(formatDateTime(row.updated_at))}</td>
            </tr>
        `;
    }).join('');
}

function renderSummary() {
    const lowCount = state.rows.reduce((count, row) => (
        Number(row.quantity ?? 0) <= LOW_STOCK_THRESHOLD
            ? count + 1
            : count
    ), 0);

    visibleCount.textContent = String(state.rows.length);
    lowStockCount.textContent = String(lowCount);
    branchLabel.textContent = branchFilter.value || '-';
}

function formatQuantity(value) {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed)) {
        return '0';
    }

    return parsed.toLocaleString('en-PH', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
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

function setStatus(message, isError) {
    statusText.textContent = message;
    statusText.classList.toggle('error', Boolean(isError));
}
