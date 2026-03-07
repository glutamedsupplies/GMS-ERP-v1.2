const appClient = window.appClient;

const pageTitle = document.getElementById('pageTitle');
const visibleCount = document.getElementById('visibleCount');
const lowStockCount = document.getElementById('lowStockCount');
const branchLabel = document.getElementById('branchLabel');
const branchFilter = document.getElementById('branchFilter');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const refreshBtn = document.getElementById('refreshBtn');
const statusText = document.getElementById('statusText');
const inventoryBody = document.getElementById('inventoryBody');

const LOW_STOCK_THRESHOLD = 5;
const NEAR_EXPIRY_DAYS = 7;
const ADJUSTMENT_TYPES = ['add', 'minus', 'damage', 'set'];

const state = {
    rows: [],
    branches: [],
    canEditInventory: false
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({
        role: 'head_admin',
        allowEmployeeFeature: 'inventory'
    });
    if (!session) {
        return;
    }
    state.canEditInventory = canRoleEditInventory(session.role);
    appClient.attachEmployeeBackButton(session);

    await applyWorkspaceConfig();
    bindEvents();
    await loadBranches();
    await loadInventory();
}

function bindEvents() {
    const debouncedLoadInventory = debounce(loadInventory, 180);

    refreshBtn.addEventListener('click', loadInventory);
    branchFilter.addEventListener('change', loadInventory);
    statusFilter.addEventListener('change', () => {
        renderRows();
        renderSummary();
        updateLoadedStatus();
    });
    searchInput.addEventListener('input', debouncedLoadInventory);
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            loadInventory();
        }
    });
    inventoryBody.addEventListener('click', handleTableClick);
    inventoryBody.addEventListener('input', handleTableInput);
    inventoryBody.addEventListener('change', handleTableChange);
    inventoryBody.addEventListener('keydown', (event) => {
        if (!state.canEditInventory || event.key !== 'Enter') {
            return;
        }

        const input = event.target.closest('input[data-field="adjustmentQuantity"], input[data-field="expirationDate"]');
        if (!input) {
            return;
        }
        event.preventDefault();
        applyAdjustment(input.dataset.inventoryId);
    });
}

async function applyWorkspaceConfig() {
    try {
        const bootstrap = await appClient.getBootstrap();
        const labels = bootstrap?.workspaceConfig?.labels || {};
        pageTitle.textContent = labels.inventoryLevelsPageTitle || 'Inventory Levels';
    } catch (_error) {
        pageTitle.textContent = 'Inventory Levels';
    }
}

async function loadBranches() {
    try {
        const bootstrap = await appClient.getBootstrap();
        const branches = Array.isArray(bootstrap?.branches)
            ? bootstrap.branches.filter((branch) => Boolean(branch?.is_active))
            : [];
        state.branches = branches;
        branchFilter.innerHTML = branches.map((branch) =>
            `<option value="${appClient.escapeHtml(branch.branch_name || '')}">${appClient.escapeHtml(branch.branch_name || '')}</option>`
        ).join('');
        if (!branchFilter.value && branches.length) {
            branchFilter.value = String(branches[0].branch_name || '');
        }
    } catch (error) {
        console.error('Failed to load branches:', error);
        setStatus(error.message || 'Unable to load branch references.', true);
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
    setStatus('Loading inventory levels...', false);

    try {
        const rows = await appClient.listInventory({
            branch,
            filter: searchInput.value.trim()
        });

        state.rows = Array.isArray(rows) ? rows.map((row) => {
            const expirationDate = normalizeDateInput(row.expiration_date);
            return {
                ...row,
                expiration_date: expirationDate,
                draftAdjustmentType: 'add',
                draftAdjustmentQuantity: '',
                draftExpirationDate: expirationDate
            };
        }) : [];
        renderRows();
        renderSummary();
        updateLoadedStatus();
    } catch (error) {
        console.error('Failed to load inventory levels:', error);
        state.rows = [];
        renderRows();
        renderSummary();
        setStatus(error.message || 'Unable to load inventory levels.', true);
    } finally {
        refreshBtn.disabled = false;
    }
}

function getVisibleRows() {
    const filterValue = String(statusFilter?.value || 'all').trim().toLowerCase();
    if (!state.rows.length || filterValue === 'all') {
        return state.rows.slice();
    }

    return state.rows.filter((row) => {
        const meta = getInventoryStatusMeta(row);
        return meta.key === filterValue;
    });
}

function renderRows() {
    const rows = getVisibleRows();
    if (!rows.length) {
        inventoryBody.innerHTML = '<tr><td colspan="9" class="empty">No inventory items found for this filter.</td></tr>';
        return;
    }

    inventoryBody.innerHTML = rows.map((row) => {
        const quantity = Number(row.quantity ?? 0);
        const statusMeta = getInventoryStatusMeta(row);
        const readOnlyTag = '<span class="status-tag status-readonly">Read only</span>';
        const adjustmentType = normalizeAdjustmentType(row.draftAdjustmentType);
        const adjustmentQuantity = row.draftAdjustmentQuantity ?? '';
        const adjustmentMin = adjustmentType === 'set' ? '' : '0.01';

        const adjustmentCell = state.canEditInventory
            ? `
                    <div class="adjust-controls">
                        <select
                            class="adjust-select"
                            data-field="adjustmentType"
                            data-inventory-id="${appClient.escapeHtml(row.inventory_id)}">
                            ${renderAdjustmentOption('add', adjustmentType, 'Add')}
                            ${renderAdjustmentOption('minus', adjustmentType, 'Minus')}
                            ${renderAdjustmentOption('damage', adjustmentType, 'Damage')}
                            ${renderAdjustmentOption('set', adjustmentType, 'Set')}
                        </select>
                        <input
                            class="qty-input adjust-input"
                            data-field="adjustmentQuantity"
                            data-inventory-id="${appClient.escapeHtml(row.inventory_id)}"
                            type="number"
                            step="0.01"
                            ${adjustmentMin ? `min="${adjustmentMin}"` : ''}
                            placeholder="Qty"
                            value="${appClient.escapeHtml(String(adjustmentQuantity))}">
                    </div>
                `
            : readOnlyTag;

        const expirationCell = state.canEditInventory
            ? `
                    <input
                        type="date"
                        class="expiration-input"
                        data-field="expirationDate"
                        data-inventory-id="${appClient.escapeHtml(row.inventory_id)}"
                        value="${appClient.escapeHtml(normalizeDateInput(row.draftExpirationDate))}">
                `
            : `<span class="expiration-text">${appClient.escapeHtml(formatDateOnly(row.expiration_date))}</span>`;

        const actionCell = state.canEditInventory
            ? `
                <div class="row-actions">
                    <button type="button" class="primary-btn small-btn" data-action="apply" data-inventory-id="${appClient.escapeHtml(row.inventory_id)}">Apply</button>
                    <button type="button" class="danger-btn small-btn" data-action="delete" data-inventory-id="${appClient.escapeHtml(row.inventory_id)}">Delete</button>
                </div>
            `
            : readOnlyTag;

        return `
            <tr class="row-${statusMeta.rowClass}">
                <td><strong>${appClient.escapeHtml(row.item_name || '-')}</strong></td>
                <td>${appClient.escapeHtml(row.inventory_unit || '-')}</td>
                <td>${appClient.escapeHtml(row.item_type || '-')}</td>
                <td><strong>${appClient.escapeHtml(formatQuantity(quantity))}</strong></td>
                <td>${expirationCell}</td>
                <td>${adjustmentCell}</td>
                <td><span class="status-tag ${statusMeta.tagClass}">${statusMeta.iconHtml}${appClient.escapeHtml(statusMeta.label)}</span></td>
                <td>${appClient.escapeHtml(formatDateTime(row.updated_at))}</td>
                <td>${actionCell}</td>
            </tr>
        `;
    }).join('');
}

function renderSummary() {
    const rows = getVisibleRows();
    const lowCount = rows.reduce((count, row) => (
        Number(row.quantity ?? 0) > 0 && Number(row.quantity ?? 0) <= LOW_STOCK_THRESHOLD
            ? count + 1
            : count
    ), 0);

    visibleCount.textContent = String(rows.length);
    lowStockCount.textContent = String(lowCount);
    branchLabel.textContent = branchFilter.value || '-';
}

function updateLoadedStatus() {
    const modeLabel = state.canEditInventory ? 'edit mode' : 'read-only mode';
    const visibleRows = getVisibleRows().length;
    const totalRows = state.rows.length;
    if ((statusFilter?.value || 'all') === 'all') {
        setStatus(`Loaded ${totalRows} inventory item(s) (${modeLabel}).`, false);
        return;
    }
    setStatus(`Loaded ${visibleRows} of ${totalRows} inventory item(s) (${modeLabel}).`, false);
}

function handleTableClick(event) {
    if (!state.canEditInventory) {
        return;
    }
    const button = event.target.closest('button[data-action]');
    if (!button) {
        return;
    }

    const action = String(button.dataset.action || '').trim().toLowerCase();
    if (action === 'apply') {
        applyAdjustment(button.dataset.inventoryId);
        return;
    }

    if (action === 'delete') {
        deleteInventoryItem(button.dataset.inventoryId, button);
    }
}

function handleTableInput(event) {
    if (!state.canEditInventory) {
        return;
    }

    const qtyInput = event.target.closest('input[data-field="adjustmentQuantity"]');
    if (qtyInput) {
        const row = state.rows.find((entry) => String(entry.inventory_id) === String(qtyInput.dataset.inventoryId || ''));
        if (!row) {
            return;
        }
        row.draftAdjustmentQuantity = String(qtyInput.value || '').trim();
        return;
    }

    const expirationInput = event.target.closest('input[data-field="expirationDate"]');
    if (!expirationInput) {
        return;
    }
    const row = state.rows.find((entry) => String(entry.inventory_id) === String(expirationInput.dataset.inventoryId || ''));
    if (!row) {
        return;
    }
    row.draftExpirationDate = normalizeDateInput(expirationInput.value);
}

function handleTableChange(event) {
    if (!state.canEditInventory) {
        return;
    }
    const select = event.target.closest('select[data-field="adjustmentType"]');
    if (select) {
        const inventoryId = String(select.dataset.inventoryId || '');
        const row = state.rows.find((entry) => String(entry.inventory_id) === inventoryId);
        if (!row) {
            return;
        }
        row.draftAdjustmentType = normalizeAdjustmentType(select.value);

        const input = Array.from(inventoryBody.querySelectorAll('input[data-field="adjustmentQuantity"]'))
            .find((entry) => String(entry.dataset.inventoryId || '') === inventoryId);
        if (input) {
            if (row.draftAdjustmentType === 'set') {
                input.removeAttribute('min');
            } else {
                input.min = '0.01';
            }
        }
        return;
    }

    const expirationInput = event.target.closest('input[data-field="expirationDate"]');
    if (!expirationInput) {
        return;
    }
    const row = state.rows.find((entry) => String(entry.inventory_id) === String(expirationInput.dataset.inventoryId || ''));
    if (!row) {
        return;
    }
    row.draftExpirationDate = normalizeDateInput(expirationInput.value);
}

async function applyAdjustment(inventoryId) {
    if (!state.canEditInventory) {
        setStatus('Inventory editing is allowed for staff and company admins only.', true);
        return;
    }
    const branch = String(branchFilter.value || '').trim();
    const input = Array.from(inventoryBody.querySelectorAll('input[data-field="adjustmentQuantity"]'))
        .find((entry) => String(entry.dataset.inventoryId || '') === String(inventoryId || ''));
    const select = Array.from(inventoryBody.querySelectorAll('select[data-field="adjustmentType"]'))
        .find((entry) => String(entry.dataset.inventoryId || '') === String(inventoryId || ''));
    const expirationInput = Array.from(inventoryBody.querySelectorAll('input[data-field="expirationDate"]'))
        .find((entry) => String(entry.dataset.inventoryId || '') === String(inventoryId || ''));
    const button = Array.from(inventoryBody.querySelectorAll('button[data-action="apply"]'))
        .find((entry) => String(entry.dataset.inventoryId || '') === String(inventoryId || ''));

    if (!branch || !input) {
        return;
    }

    const row = state.rows.find((entry) => String(entry.inventory_id) === String(inventoryId));
    const itemName = row?.item_name || 'Item';
    const operation = normalizeAdjustmentType(select?.value || row?.draftAdjustmentType);
    const rawInputValue = String(input.value || '').trim();
    const hasQuantityValue = rawInputValue !== '';
    const rawAmount = Number(rawInputValue);
    const safeAmount = Number.isFinite(rawAmount) ? rawAmount : NaN;
    const isValidAmount = operation === 'set'
        ? Number.isFinite(safeAmount)
        : Number.isFinite(safeAmount) && safeAmount > 0;
    const nextExpirationDate = normalizeDateInput(expirationInput?.value || row?.draftExpirationDate);
    const previousExpirationDate = normalizeDateInput(row?.expiration_date);
    const expirationChanged = nextExpirationDate !== previousExpirationDate;

    if (hasQuantityValue && !isValidAmount) {
        setStatus(
            operation === 'set'
                ? 'Set quantity must be a valid number.'
                : 'Adjustment quantity must be greater than zero.',
            true
        );
        return;
    }

    if (!hasQuantityValue && !expirationChanged) {
        setStatus('Enter quantity or change expiration date before applying.', true);
        return;
    }

    const payload = {
        branch,
        expirationDate: nextExpirationDate,
        hasExpirationDateOverride: true
    };

    if (hasQuantityValue) {
        payload.adjustmentType = operation;
        if (operation === 'set') {
            payload.quantity = safeAmount;
        } else {
            payload.adjustmentQuantity = safeAmount;
        }
    }

    const actionLabel = hasQuantityValue
        ? `${operation} adjustment`
        : 'expiration update';
    setStatus(`Applying ${actionLabel} for ${itemName}...`, false);
    input.disabled = true;
    if (select) {
        select.disabled = true;
    }
    if (expirationInput) {
        expirationInput.disabled = true;
    }
    if (button) {
        button.disabled = true;
    }

    try {
        const updated = await appClient.updateInventoryQuantity(inventoryId, payload);

        if (row) {
            row.quantity = Number(updated?.quantity ?? row.quantity ?? 0);
            row.updated_at = updated?.updated_at || row.updated_at;
            row.expiration_date = normalizeDateInput(updated?.expiration_date || nextExpirationDate);
            row.draftExpirationDate = row.expiration_date;
            row.draftAdjustmentQuantity = '';
            row.draftAdjustmentType = operation;
        }

        renderRows();
        renderSummary();
        updateLoadedStatus();
    } catch (error) {
        console.error('Failed to update inventory quantity:', error);
        setStatus(error.message || 'Unable to update quantity.', true);
        input.disabled = false;
        if (select) {
            select.disabled = false;
        }
        if (expirationInput) {
            expirationInput.disabled = false;
        }
        if (button) {
            button.disabled = false;
        }
    }
}

async function deleteInventoryItem(inventoryId, triggerButton = null) {
    if (!state.canEditInventory) {
        setStatus('Inventory editing is allowed for staff and company admins only.', true);
        return;
    }

    const branch = String(branchFilter.value || '').trim();
    const row = state.rows.find((entry) => String(entry.inventory_id) === String(inventoryId || ''));
    if (!branch || !row) {
        return;
    }

    const itemLabel = `${row.item_name || 'Item'} (${row.inventory_unit || '-'})`;
    if (!window.confirm(`Delete inventory item "${itemLabel}" for all branches?`)) {
        return;
    }

    if (triggerButton) {
        triggerButton.disabled = true;
    }
    setStatus(`Deleting ${row.item_name || 'inventory item'}...`, false);

    try {
        await appClient.deleteInventoryItem(inventoryId, { branch });
        await loadInventory();
        setStatus(`Inventory item "${itemLabel}" deleted.`, false);
    } catch (error) {
        console.error('Failed to delete inventory item:', error);
        setStatus(error.message || 'Unable to delete inventory item.', true);
        if (triggerButton) {
            triggerButton.disabled = false;
        }
    }
}

function getInventoryStatusMeta(row) {
    const quantity = Number(row?.quantity ?? 0);
    const expirationDate = normalizeDateInput(row?.expiration_date || row?.draftExpirationDate);
    const daysUntilExpiration = getDaysUntilExpiration(expirationDate);

    if (expirationDate && daysUntilExpiration < 0) {
        return {
            key: 'expired',
            label: `Expired ${formatDateOnly(expirationDate)}`,
            tagClass: 'status-expired',
            rowClass: 'expired',
            iconHtml: '<i class="fa-solid fa-ban"></i>'
        };
    }

    if (quantity <= 0) {
        return {
            key: 'out_of_stock',
            label: 'Out of stock',
            tagClass: 'status-out',
            rowClass: 'out',
            iconHtml: '<i class="fa-solid fa-circle-exclamation"></i>'
        };
    }

    if (expirationDate && daysUntilExpiration <= NEAR_EXPIRY_DAYS) {
        return {
            key: 'near_expired',
            label: daysUntilExpiration === 0
                ? `Near expired (today)`
                : `Near expired (${daysUntilExpiration}d)`,
            tagClass: 'status-near',
            rowClass: 'near',
            iconHtml: '<i class="fa-solid fa-clock"></i>'
        };
    }

    if (quantity <= LOW_STOCK_THRESHOLD) {
        return {
            key: 'low_stock',
            label: 'Low stock',
            tagClass: 'status-low',
            rowClass: 'low',
            iconHtml: '<i class="fa-solid fa-triangle-exclamation"></i>'
        };
    }

    return {
        key: 'ok',
        label: 'OK',
        tagClass: 'status-ok',
        rowClass: 'ok',
        iconHtml: '<i class="fa-solid fa-check"></i>'
    };
}

function renderAdjustmentOption(value, selected, label) {
    const normalizedValue = normalizeAdjustmentType(value);
    const isSelected = normalizedValue === normalizeAdjustmentType(selected);
    return `<option value="${normalizedValue}"${isSelected ? ' selected' : ''}>${label}</option>`;
}

function normalizeAdjustmentType(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return ADJUSTMENT_TYPES.includes(normalized) ? normalized : 'add';
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

function formatDateOnly(value) {
    const normalized = normalizeDateInput(value);
    if (!normalized) {
        return '-';
    }

    const parsed = parseDateKey(normalized);
    if (!parsed) {
        return normalized;
    }
    return parsed.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: '2-digit'
    });
}

function normalizeDateInput(value) {
    const raw = String(value || '').trim();
    if (!raw) {
        return '';
    }

    const directMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (directMatch) {
        const year = Number(directMatch[1]);
        const month = Number(directMatch[2]);
        const day = Number(directMatch[3]);
        if (!isValidDateParts(year, month, day)) {
            return '';
        }
        return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }
    return toDateKey(parsed);
}

function getDaysUntilExpiration(expirationDate) {
    const normalizedExpiration = normalizeDateInput(expirationDate);
    if (!normalizedExpiration) {
        return Number.POSITIVE_INFINITY;
    }

    const expiration = parseDateKey(normalizedExpiration);
    const today = parseDateKey(toDateKey(new Date()));
    if (!expiration || !today) {
        return Number.POSITIVE_INFINITY;
    }

    const diffMs = expiration.getTime() - today.getTime();
    return Math.floor(diffMs / 86400000);
}

function parseDateKey(value) {
    const normalized = normalizeDateInput(value);
    if (!normalized) {
        return null;
    }
    const [year, month, day] = normalized.split('-').map(Number);
    if (!isValidDateParts(year, month, day)) {
        return null;
    }
    return new Date(year, month - 1, day);
}

function toDateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return '';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function isValidDateParts(year, month, day) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return false;
    }
    if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
        return false;
    }
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && (date.getMonth() + 1) === month && date.getDate() === day;
}

function setStatus(message, isError) {
    statusText.textContent = message;
    statusText.classList.toggle('error', Boolean(isError));
}

function canRoleEditInventory(role) {
    const normalizedRole = String(role || '').trim().toLowerCase();
    return normalizedRole === 'staff'
        || normalizedRole === 'head_admin'
        || normalizedRole === 'company_admin'
        || normalizedRole === 'super_admin';
}

function debounce(callback, delay) {
    let timerId = 0;

    return function debouncedCallback() {
        window.clearTimeout(timerId);
        timerId = window.setTimeout(() => {
            callback();
        }, delay);
    };
}
