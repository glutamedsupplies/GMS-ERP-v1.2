const appClient = window.appClient;

const pageTitle = document.getElementById('pageTitle');
const pageCopy = document.getElementById('pageCopy');
const visibleCount = document.getElementById('visibleCount');
const lowStockCount = document.getElementById('lowStockCount');
const inventoryValueCard = document.getElementById('inventoryValueCard');
const inventoryValueTotal = document.getElementById('inventoryValueTotal');
const branchLabel = document.getElementById('branchLabel');
const branchFilter = document.getElementById('branchFilter');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const refreshBtn = document.getElementById('refreshBtn');
const statusText = document.getElementById('statusText');
const sheetGuide = document.getElementById('sheetGuide');
const inventoryTableHead = document.getElementById('inventoryTableHead');
const inventoryBody = document.getElementById('inventoryBody');

const LOW_STOCK_THRESHOLD = 5;
const NEAR_EXPIRY_DAYS = 7;
const ADJUSTMENT_TYPES = ['add', 'minus', 'damage', 'set'];
const RESTAURANT_CATEGORIES = [
    'Meat',
    'Seafood',
    'Vegetables',
    'Dry Goods',
    'Dairy',
    'Spices & Condiments',
    'Beverages'
];
const INVENTORY_SHEET_STORAGE_PREFIX = 'restaurant-inventory-sheet';

const state = {
    rows: [],
    branches: [],
    session: null,
    companyCode: '',
    assignedBranch: '',
    canEditInventory: false,
    canDeleteInventory: false
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
    state.session = session;
    state.companyCode = normalizeCompanyCode(session.companyCode || session.company_code || '');
    state.assignedBranch = normalizeBranchName(session.branchName || '');
    state.canEditInventory = canRoleEditInventory(session.role);
    state.canDeleteInventory = canRoleDeleteInventory(session.role);
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
        if (!canEditSelectedBranch() || event.key !== 'Enter') {
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
        const restaurantMode = isChowRestaurantInventoryMode();
        pageTitle.textContent = restaurantMode
            ? (labels.inventoryLevelsPageTitle || 'Ingredients Stock')
            : (labels.inventoryLevelsPageTitle || 'Inventory Levels');
        if (pageCopy) {
            pageCopy.textContent = restaurantMode
                ? 'Use this as the Chow restaurant inventory sheet. Encode beginning stock, purchases, kitchen usage, ending stock, unit cost, supplier, expiry date, and notes in one place.'
                : 'Manage branch stock movements here. Gumamit ng Add, Minus, Damage, or Set para controlled ang galaw ng quantity bawat item.';
        }
        if (inventoryValueCard) {
            inventoryValueCard.hidden = !restaurantMode;
        }
        if (sheetGuide) {
            sheetGuide.hidden = !restaurantMode;
        }
        renderTableHead();
    } catch (_error) {
        pageTitle.textContent = 'Inventory Levels';
        if (pageCopy) {
            pageCopy.textContent = 'Manage branch stock movements here. Gumamit ng Add, Minus, Damage, or Set para controlled ang galaw ng quantity bawat item.';
        }
        if (inventoryValueCard) {
            inventoryValueCard.hidden = false;
        }
        if (sheetGuide) {
            sheetGuide.hidden = true;
        }
        renderTableHead();
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
        const sheetDrafts = isChowRestaurantInventoryMode() ? readInventorySheetDrafts(branch) : {};

        state.rows = Array.isArray(rows) ? rows.map((row) => {
            const expirationDate = normalizeDateInput(row.expiration_date);
            const nextRow = {
                ...row,
                expiration_date: expirationDate,
                draftAdjustmentType: 'add',
                draftAdjustmentQuantity: '',
                draftExpirationDate: expirationDate,
                draftInventoryUnit: String(row.inventory_unit || '').trim(),
                draftItemType: String(row.item_type || '').trim()
            };
            if (isChowRestaurantInventoryMode()) {
                nextRow.sheet = buildInventorySheetState(nextRow, sheetDrafts[String(row.inventory_id || '')] || {});
            }
            return nextRow;
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

function renderTableHead() {
    if (!inventoryTableHead) {
        return;
    }

    if (isChowRestaurantInventoryMode()) {
        inventoryTableHead.innerHTML = `
            <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th>Unit</th>
                <th>Beginning Stock</th>
                <th>Purchased</th>
                <th>Used</th>
                <th>Ending Stock</th>
                <th>Unit Cost</th>
                <th>Total Value</th>
                <th>Supplier</th>
                <th>Expiry Date</th>
                <th>Notes</th>
                <th>Action</th>
            </tr>
        `;
        return;
    }

    inventoryTableHead.innerHTML = `
        <tr>
            <th>Item Name</th>
            <th>Unit</th>
            <th>Type</th>
            <th>Branch Qty</th>
            <th>Expiration</th>
            <th>Adjustment</th>
            <th>Status</th>
            <th>Updated</th>
            <th>Action</th>
        </tr>
    `;
}

function renderRows() {
    if (isChowRestaurantInventoryMode()) {
        renderRestaurantInventorySheetRows();
        return;
    }

    const rows = getVisibleRows();
    if (!rows.length) {
        inventoryBody.innerHTML = '<tr><td colspan="9" class="empty">No inventory items found for this filter.</td></tr>';
        return;
    }

    inventoryBody.innerHTML = rows.map((row) => {
        const quantity = Number(row.quantity ?? 0);
        const statusMeta = getInventoryStatusMeta(row);
        const canEditBranch = canEditSelectedBranch(row.branch || branchFilter?.value || '');
        const canDeleteBranch = canDeleteSelectedBranch(row.branch || branchFilter?.value || '');
        const readOnlyTag = '<span class="status-tag status-readonly">Read only</span>';
        const adjustmentType = normalizeAdjustmentType(row.draftAdjustmentType);
        const adjustmentQuantity = row.draftAdjustmentQuantity ?? '';
        const adjustmentMin = adjustmentType === 'set' ? '' : '0.01';

        const unitCell = canEditBranch
            ? `
                    <input
                        class="inline-input"
                        data-field="inventoryUnit"
                        data-inventory-id="${appClient.escapeHtml(row.inventory_id)}"
                        type="text"
                        value="${appClient.escapeHtml(String(row.draftInventoryUnit ?? row.inventory_unit ?? '').trim())}">
                `
            : appClient.escapeHtml(row.inventory_unit || '-');

        const typeCell = canEditBranch
            ? `
                    <input
                        class="inline-input"
                        data-field="itemType"
                        data-inventory-id="${appClient.escapeHtml(row.inventory_id)}"
                        type="text"
                        value="${appClient.escapeHtml(String(row.draftItemType ?? row.item_type ?? '').trim())}">
                `
            : appClient.escapeHtml(row.item_type || '-');

        const adjustmentCell = canEditBranch
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

        const expirationCell = canEditBranch
            ? `
                    <input
                        type="date"
                        class="expiration-input"
                        data-field="expirationDate"
                        data-inventory-id="${appClient.escapeHtml(row.inventory_id)}"
                        value="${appClient.escapeHtml(normalizeDateInput(row.draftExpirationDate))}">
                `
            : `<span class="expiration-text">${appClient.escapeHtml(formatDateOnly(row.expiration_date))}</span>`;

        const actionCell = canEditBranch
            ? `
                <div class="row-actions">
                    <button type="button" class="primary-btn small-btn" data-action="apply" data-inventory-id="${appClient.escapeHtml(row.inventory_id)}">Apply</button>
                    ${canDeleteBranch
                        ? `<button type="button" class="danger-btn small-btn" data-action="delete" data-inventory-id="${appClient.escapeHtml(row.inventory_id)}">Delete</button>`
                        : ''}
                </div>
            `
            : readOnlyTag;

        return `
            <tr class="row-${statusMeta.rowClass}">
                <td><strong>${appClient.escapeHtml(row.item_name || '-')}</strong></td>
                <td>${unitCell}</td>
                <td>${typeCell}</td>
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

function renderRestaurantInventorySheetRows() {
    const rows = getVisibleRows();
    if (!rows.length) {
        inventoryBody.innerHTML = '<tr><td colspan="13" class="empty">No ingredient rows found for this filter.</td></tr>';
        return;
    }

    inventoryBody.innerHTML = rows.map((row) => {
        const canEditBranch = canEditSelectedBranch(row.branch || branchFilter?.value || '');
        const canDeleteBranch = canDeleteSelectedBranch(row.branch || branchFilter?.value || '');
        const readOnlyTag = '<span class="status-tag status-readonly">Read only</span>';
        const expirationDate = normalizeDateInput(row.draftExpirationDate || row.expiration_date);
        const statusMeta = getInventoryStatusMeta(row);
        const sheet = ensureInventorySheetState(row);
        const endingStock = getSheetEndingStock(row);
        const totalValue = getSheetTotalValue(row);
        const actionCell = canEditBranch
            ? `
                <div class="row-actions">
                    <button type="button" class="primary-btn small-btn" data-action="apply" data-inventory-id="${appClient.escapeHtml(row.inventory_id)}">Apply</button>
                    ${canDeleteBranch
                        ? `<button type="button" class="danger-btn small-btn" data-action="delete" data-inventory-id="${appClient.escapeHtml(row.inventory_id)}">Delete</button>`
                        : ''}
                </div>
            `
            : readOnlyTag;

        return `
            <tr class="row-${statusMeta.rowClass}" data-inventory-id="${appClient.escapeHtml(String(row.inventory_id || ''))}">
                <td>
                    <div class="sheet-item">
                        <strong>${appClient.escapeHtml(row.item_name || '-')}</strong>
                        <small>${appClient.escapeHtml(row.item_code ? `Code ${row.item_code}` : `Updated ${formatDateTime(row.updated_at)}`)}</small>
                    </div>
                </td>
                <td>
                    ${canEditBranch
                        ? `
                            <select class="sheet-select" data-field="categoryLabel" data-inventory-id="${appClient.escapeHtml(row.inventory_id)}">
                                ${renderCategoryOptions(sheet.categoryLabel)}
                            </select>
                        `
                        : appClient.escapeHtml(sheet.categoryLabel || '-')
                    }
                </td>
                <td>${appClient.escapeHtml(row.inventory_unit || '-')}</td>
                <td>
                    ${renderSheetNumberInput({
                        inventoryId: row.inventory_id,
                        field: 'beginningStock',
                        value: sheet.beginningStock,
                        canEdit: canEditBranch
                    })}
                </td>
                <td>
                    ${renderSheetNumberInput({
                        inventoryId: row.inventory_id,
                        field: 'purchasedQuantity',
                        value: sheet.purchasedQuantity,
                        canEdit: canEditBranch
                    })}
                </td>
                <td>
                    ${renderSheetNumberInput({
                        inventoryId: row.inventory_id,
                        field: 'usedQuantity',
                        value: sheet.usedQuantity,
                        canEdit: canEditBranch
                    })}
                </td>
                <td>
                    <div class="sheet-ending">
                        <strong data-cell="endingStock" data-inventory-id="${appClient.escapeHtml(row.inventory_id)}">${appClient.escapeHtml(formatQuantity(endingStock))}</strong>
                        <span class="status-tag ${statusMeta.tagClass} sheet-inline-status" data-cell="sheetStatus" data-inventory-id="${appClient.escapeHtml(row.inventory_id)}">${statusMeta.iconHtml}${appClient.escapeHtml(statusMeta.label)}</span>
                    </div>
                </td>
                <td>
                    ${renderSheetNumberInput({
                        inventoryId: row.inventory_id,
                        field: 'unitCost',
                        value: sheet.unitCost,
                        canEdit: canEditBranch,
                        step: '0.01',
                        className: 'sheet-input sheet-number sheet-money'
                    })}
                </td>
                <td><span class="sheet-value" data-cell="totalValue" data-inventory-id="${appClient.escapeHtml(row.inventory_id)}">${appClient.escapeHtml(formatMoney(totalValue))}</span></td>
                <td>
                    ${renderSheetTextInput({
                        inventoryId: row.inventory_id,
                        field: 'supplierName',
                        value: sheet.supplierName,
                        canEdit: canEditBranch,
                        placeholder: 'Supplier'
                    })}
                </td>
                <td>
                    ${canEditBranch
                        ? `
                            <input
                                type="date"
                                class="expiration-input"
                                data-field="expirationDate"
                                data-inventory-id="${appClient.escapeHtml(row.inventory_id)}"
                                value="${appClient.escapeHtml(expirationDate)}">
                        `
                        : `<span class="expiration-text">${appClient.escapeHtml(formatDateOnly(expirationDate))}</span>`
                    }
                </td>
                <td>
                    ${renderSheetTextInput({
                        inventoryId: row.inventory_id,
                        field: 'notes',
                        value: sheet.notes,
                        canEdit: canEditBranch,
                        placeholder: 'Notes',
                        className: 'sheet-input sheet-text sheet-notes'
                    })}
                </td>
                <td>${actionCell}</td>
            </tr>
        `;
    }).join('');
}

function renderCategoryOptions(selectedValue = '') {
    const categories = [...RESTAURANT_CATEGORIES];
    const normalizedSelected = String(selectedValue || '').trim();
    if (normalizedSelected && !categories.includes(normalizedSelected)) {
        categories.unshift(normalizedSelected);
    }

    return categories.map((category) => `
        <option value="${appClient.escapeHtml(category)}"${category === normalizedSelected ? ' selected' : ''}>${appClient.escapeHtml(category)}</option>
    `).join('');
}

function renderSheetNumberInput({ inventoryId, field, value, canEdit, step = '1', className = 'sheet-input sheet-number' }) {
    if (!canEdit) {
        return `<span>${appClient.escapeHtml(formatQuantity(value))}</span>`;
    }

    return `
        <input
            class="${className}"
            type="number"
            step="${appClient.escapeHtml(step)}"
            min="0"
            data-field="${appClient.escapeHtml(field)}"
            data-inventory-id="${appClient.escapeHtml(inventoryId)}"
            value="${appClient.escapeHtml(formatDraftNumber(value, step === '1' ? 0 : 2))}">
    `;
}

function renderSheetTextInput({ inventoryId, field, value, canEdit, placeholder = '', className = 'sheet-input sheet-text' }) {
    if (!canEdit) {
        return `<span>${appClient.escapeHtml(String(value || '').trim() || '-')}</span>`;
    }

    return `
        <input
            class="${className}"
            type="text"
            data-field="${appClient.escapeHtml(field)}"
            data-inventory-id="${appClient.escapeHtml(inventoryId)}"
            value="${appClient.escapeHtml(String(value || '').trim())}"
            placeholder="${appClient.escapeHtml(placeholder)}">
    `;
}

function ensureInventorySheetState(row) {
    if (!row.sheet || typeof row.sheet !== 'object') {
        row.sheet = buildInventorySheetState(row, {});
    }
    return row.sheet;
}

function buildInventorySheetState(row, savedDraft = {}) {
    const currentQuantity = Math.max(0, Number(row.quantity ?? 0));
    return {
        categoryLabel: String(savedDraft.categoryLabel || inferRestaurantCategory(row)).trim() || 'Dry Goods',
        beginningStock: sanitizeSheetNumber(savedDraft.beginningStock, currentQuantity),
        purchasedQuantity: sanitizeSheetNumber(savedDraft.purchasedQuantity, 0),
        usedQuantity: sanitizeSheetNumber(savedDraft.usedQuantity, 0),
        unitCost: sanitizeSheetNumber(savedDraft.unitCost, 0),
        supplierName: String(savedDraft.supplierName || '').trim(),
        notes: String(savedDraft.notes || '').trim()
    };
}

function sanitizeSheetNumber(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return Math.max(0, Number(fallback || 0));
    }
    return Math.max(0, parsed);
}

function readInventorySheetDrafts(branchName = '') {
    const storageKey = getInventorySheetStorageKey(branchName);
    if (!storageKey) {
        return {};
    }

    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function writeInventorySheetDrafts(branchName = '', drafts = {}) {
    const storageKey = getInventorySheetStorageKey(branchName);
    if (!storageKey) {
        return;
    }

    try {
        window.localStorage.setItem(storageKey, JSON.stringify(drafts));
    } catch (_error) {
        // Ignore storage write failures and keep the live worksheet usable.
    }
}

function persistInventorySheetDraft(row) {
    if (!isChowRestaurantInventoryMode() || !row) {
        return;
    }

    const branchName = String(row.branch || branchFilter?.value || '').trim();
    const drafts = readInventorySheetDrafts(branchName);
    drafts[String(row.inventory_id || '')] = ensureInventorySheetState(row);
    writeInventorySheetDrafts(branchName, drafts);
}

function getInventorySheetStorageKey(branchName = '') {
    const normalizedCompanyCode = normalizeCompanyCode(state.companyCode);
    const normalizedBranch = normalizeBranchName(branchName || branchFilter?.value || '');
    if (!normalizedCompanyCode || !normalizedBranch) {
        return '';
    }
    return `${INVENTORY_SHEET_STORAGE_PREFIX}:${normalizedCompanyCode}:${normalizedBranch.toLowerCase()}`;
}

function getSheetEndingStock(row) {
    const sheet = ensureInventorySheetState(row);
    return Math.max(0, Number(sheet.beginningStock || 0) + Number(sheet.purchasedQuantity || 0) - Number(sheet.usedQuantity || 0));
}

function getSheetTotalValue(row) {
    const sheet = ensureInventorySheetState(row);
    return Math.max(0, getSheetEndingStock(row) * Number(sheet.unitCost || 0));
}

function getDisplayInventoryQuantity(row) {
    return isChowRestaurantInventoryMode() ? getSheetEndingStock(row) : Number(row?.quantity ?? 0);
}

function inferRestaurantCategory(row = {}) {
    const lookup = `${row.item_name || ''} ${row.item_type || ''}`.toLowerCase();
    if (/(beef|pork|chicken|siomai|meat)/.test(lookup)) return 'Meat';
    if (/(fish|tuna|shrimp|seafood)/.test(lookup)) return 'Seafood';
    if (/(radish|vegetable|veg|lettuce|cabbage|carrot)/.test(lookup)) return 'Vegetables';
    if (/(egg|milk|dairy|cheese)/.test(lookup)) return 'Dairy';
    if (/(sauce|condiment|spice|curry|pickled)/.test(lookup)) return 'Spices & Condiments';
    if (/(juice|drink|tea|coffee|soda|beverage)/.test(lookup)) return 'Beverages';
    return 'Dry Goods';
}

function updateRestaurantSheetPreview(row) {
    const inventoryId = String(row?.inventory_id || '').trim();
    if (!inventoryId) {
        return;
    }

    const endingStockLabel = inventoryBody.querySelector(`[data-cell="endingStock"][data-inventory-id="${inventoryId}"]`);
    const totalValueLabel = inventoryBody.querySelector(`[data-cell="totalValue"][data-inventory-id="${inventoryId}"]`);
    const statusLabel = inventoryBody.querySelector(`[data-cell="sheetStatus"][data-inventory-id="${inventoryId}"]`);
    const rowElement = inventoryBody.querySelector(`tr[data-inventory-id="${inventoryId}"]`);
    const endingStock = getSheetEndingStock(row);
    const totalValue = getSheetTotalValue(row);
    const statusMeta = getInventoryStatusMeta(row);

    if (endingStockLabel) {
        endingStockLabel.textContent = formatQuantity(endingStock);
    }
    if (totalValueLabel) {
        totalValueLabel.textContent = formatMoney(totalValue);
    }
    if (statusLabel) {
        statusLabel.className = `status-tag ${statusMeta.tagClass} sheet-inline-status`;
        statusLabel.innerHTML = `${statusMeta.iconHtml}${appClient.escapeHtml(statusMeta.label)}`;
    }
    if (rowElement) {
        rowElement.className = `row-${statusMeta.rowClass}`;
    }

    renderSummary();
}

function renderSummary() {
    const rows = getVisibleRows();
    const lowCount = rows.reduce((count, row) => (
        getDisplayInventoryQuantity(row) > 0 && getDisplayInventoryQuantity(row) <= LOW_STOCK_THRESHOLD
            ? count + 1
            : count
    ), 0);
    const totalValue = rows.reduce((sum, row) => sum + getSheetTotalValue(row), 0);

    visibleCount.textContent = String(rows.length);
    lowStockCount.textContent = String(lowCount);
    branchLabel.textContent = branchFilter.value || '-';
    if (inventoryValueTotal) {
        inventoryValueTotal.textContent = formatMoney(totalValue);
    }
}

function updateLoadedStatus() {
    const modeLabel = canEditSelectedBranch()
        ? 'edit mode'
        : (state.canEditInventory ? 'read-only mode for other branch' : 'read-only mode');
    const visibleRows = getVisibleRows().length;
    const totalRows = state.rows.length;
    const sheetSuffix = isChowRestaurantInventoryMode() ? ' restaurant sheet' : '';
    if ((statusFilter?.value || 'all') === 'all') {
        setStatus(`Loaded ${totalRows} inventory item(s)${sheetSuffix} (${modeLabel}).`, false);
        return;
    }
    setStatus(`Loaded ${visibleRows} of ${totalRows} inventory item(s)${sheetSuffix} (${modeLabel}).`, false);
}

function handleTableClick(event) {
    if (!canEditSelectedBranch()) {
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
    if (!canEditSelectedBranch()) {
        return;
    }

    if (isChowRestaurantInventoryMode()) {
        const sheetInput = event.target.closest('input[data-field]');
        if (!sheetInput) {
            return;
        }

        const row = state.rows.find((entry) => String(entry.inventory_id) === String(sheetInput.dataset.inventoryId || ''));
        if (!row) {
            return;
        }

        const sheet = ensureInventorySheetState(row);
        const field = String(sheetInput.dataset.field || '').trim();

        if (field === 'expirationDate') {
            row.draftExpirationDate = normalizeDateInput(sheetInput.value);
            return;
        }

        if (field === 'supplierName' || field === 'notes') {
            sheet[field] = String(sheetInput.value || '').trim();
            persistInventorySheetDraft(row);
            return;
        }

        if (field === 'beginningStock' || field === 'purchasedQuantity' || field === 'usedQuantity' || field === 'unitCost') {
            sheet[field] = sanitizeSheetNumber(sheetInput.value, 0);
            persistInventorySheetDraft(row);
            updateRestaurantSheetPreview(row);
        }
        return;
    }

    const unitInput = event.target.closest('input[data-field="inventoryUnit"]');
    if (unitInput) {
        const row = state.rows.find((entry) => String(entry.inventory_id) === String(unitInput.dataset.inventoryId || ''));
        if (!row) {
            return;
        }
        row.draftInventoryUnit = String(unitInput.value || '').trim();
        return;
    }

    const typeInput = event.target.closest('input[data-field="itemType"]');
    if (typeInput) {
        const row = state.rows.find((entry) => String(entry.inventory_id) === String(typeInput.dataset.inventoryId || ''));
        if (!row) {
            return;
        }
        row.draftItemType = String(typeInput.value || '').trim();
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
    if (!canEditSelectedBranch()) {
        return;
    }

    if (isChowRestaurantInventoryMode()) {
        const categorySelect = event.target.closest('select[data-field="categoryLabel"]');
        if (categorySelect) {
            const row = state.rows.find((entry) => String(entry.inventory_id) === String(categorySelect.dataset.inventoryId || ''));
            if (!row) {
                return;
            }
            ensureInventorySheetState(row).categoryLabel = String(categorySelect.value || '').trim();
            persistInventorySheetDraft(row);
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
    const branch = String(branchFilter.value || '').trim();
    if (!canEditSelectedBranch(branch)) {
        setStatus(getInventoryEditRestrictionMessage(branch), true);
        return;
    }
    const row = state.rows.find((entry) => String(entry.inventory_id) === String(inventoryId));

    if (isChowRestaurantInventoryMode()) {
        if (!branch || !row) {
            return;
        }

        const expirationInput = Array.from(inventoryBody.querySelectorAll('input[data-field="expirationDate"]'))
            .find((entry) => String(entry.dataset.inventoryId || '') === String(inventoryId || ''));
        const button = Array.from(inventoryBody.querySelectorAll('button[data-action="apply"]'))
            .find((entry) => String(entry.dataset.inventoryId || '') === String(inventoryId || ''));
        const nextExpirationDate = normalizeDateInput(expirationInput?.value || row.draftExpirationDate || row.expiration_date);
        const endingStock = getSheetEndingStock(row);

        setStatus(`Syncing ending stock for ${row.item_name || 'ingredient'}...`, false);
        if (expirationInput) {
            expirationInput.disabled = true;
        }
        if (button) {
            button.disabled = true;
        }

        try {
            const updated = await appClient.updateInventoryQuantity(inventoryId, {
                branch,
                quantity: endingStock,
                adjustmentType: 'set',
                expirationDate: nextExpirationDate,
                hasExpirationDateOverride: true
            });

            row.quantity = Number(updated?.quantity ?? endingStock);
            row.updated_at = updated?.updated_at || row.updated_at;
            row.expiration_date = normalizeDateInput(updated?.expiration_date || nextExpirationDate);
            row.draftExpirationDate = row.expiration_date;
            row.sheet.beginningStock = row.quantity;
            row.sheet.purchasedQuantity = 0;
            row.sheet.usedQuantity = 0;
            persistInventorySheetDraft(row);

            renderRows();
            renderSummary();
            updateLoadedStatus();
        } catch (error) {
            console.error('Failed to sync restaurant inventory sheet:', error);
            setStatus(error.message || 'Unable to sync ending stock.', true);
            if (expirationInput) {
                expirationInput.disabled = false;
            }
            if (button) {
                button.disabled = false;
            }
        }
        return;
    }
    const unitInput = Array.from(inventoryBody.querySelectorAll('input[data-field="inventoryUnit"]'))
        .find((entry) => String(entry.dataset.inventoryId || '') === String(inventoryId || ''));
    const typeInput = Array.from(inventoryBody.querySelectorAll('input[data-field="itemType"]'))
        .find((entry) => String(entry.dataset.inventoryId || '') === String(inventoryId || ''));
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

    const itemName = row?.item_name || 'Item';
    const unitValue = normalizeInlineText(unitInput?.value ?? row?.draftInventoryUnit ?? row?.inventory_unit);
    const typeValue = normalizeInlineText(typeInput?.value ?? row?.draftItemType ?? row?.item_type);
    const hasUnitTypeChange = row
        ? normalizeInlineText(row.inventory_unit) !== unitValue
            || normalizeInlineText(row.item_type) !== typeValue
        : false;
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

    if (hasUnitTypeChange && (!unitValue || !typeValue)) {
        setStatus('Unit and type are required.', true);
        return;
    }

    if (hasQuantityValue && !isValidAmount) {
        setStatus(
            operation === 'set'
                ? 'Set quantity must be a valid number.'
                : 'Adjustment quantity must be greater than zero.',
            true
        );
        return;
    }

    if (!hasQuantityValue && !expirationChanged && !hasUnitTypeChange) {
        setStatus('Enter quantity, change expiration date, or update unit/type before applying.', true);
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

    const actionLabels = [];
    if (hasUnitTypeChange) {
        actionLabels.push('unit/type update');
    }
    if (hasQuantityValue) {
        actionLabels.push(`${operation} adjustment`);
    } else if (expirationChanged) {
        actionLabels.push('expiration update');
    }
    setStatus(`Applying ${actionLabels.join(' and ')} for ${itemName}...`, false);
    input.disabled = true;
    if (select) {
        select.disabled = true;
    }
    if (unitInput) {
        unitInput.disabled = true;
    }
    if (typeInput) {
        typeInput.disabled = true;
    }
    if (expirationInput) {
        expirationInput.disabled = true;
    }
    if (button) {
        button.disabled = true;
    }

    try {
        if (hasUnitTypeChange) {
            const updatedItem = await appClient.updateInventoryItem(inventoryId, {
                inventoryUnit: unitValue,
                itemType: typeValue
            });
            if (row && updatedItem) {
                row.inventory_unit = updatedItem.inventory_unit;
                row.item_type = updatedItem.item_type;
                row.draftInventoryUnit = updatedItem.inventory_unit;
                row.draftItemType = updatedItem.item_type;
            }
        }

        if (hasQuantityValue || expirationChanged) {
            const updated = await appClient.updateInventoryQuantity(inventoryId, payload);

            if (row) {
                row.quantity = Number(updated?.quantity ?? row.quantity ?? 0);
                row.updated_at = updated?.updated_at || row.updated_at;
                row.expiration_date = normalizeDateInput(updated?.expiration_date || nextExpirationDate);
                row.draftExpirationDate = row.expiration_date;
                row.draftAdjustmentQuantity = '';
                row.draftAdjustmentType = operation;
            }
        }

        renderRows();
        renderSummary();
        updateLoadedStatus();
    } catch (error) {
        console.error('Failed to update inventory entry:', error);
        setStatus(error.message || 'Unable to update inventory item.', true);
        input.disabled = false;
        if (select) {
            select.disabled = false;
        }
        if (unitInput) {
            unitInput.disabled = false;
        }
        if (typeInput) {
            typeInput.disabled = false;
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
    const branch = String(branchFilter.value || '').trim();
    if (!canDeleteSelectedBranch(branch)) {
        setStatus(getInventoryDeleteRestrictionMessage(branch), true);
        return;
    }
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
        if (isChowRestaurantInventoryMode()) {
            const drafts = readInventorySheetDrafts(branch);
            delete drafts[String(inventoryId || '')];
            writeInventorySheetDrafts(branch, drafts);
        }
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
    const quantity = getDisplayInventoryQuantity(row);
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

function formatDraftNumber(value, fractionDigits = 0) {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed)) {
        return '';
    }
    return fractionDigits > 0
        ? parsed.toFixed(fractionDigits)
        : String(Math.round(parsed * 100) / 100).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function formatMoney(value) {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 'PHP 0.00';
    }
    return parsed.toLocaleString('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).replace('₱', 'PHP ');
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
        minute: '2-digit',
        hour12: true
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

function normalizeInlineText(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
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

function canRoleDeleteInventory(role) {
    const normalizedRole = String(role || '').trim().toLowerCase();
    return normalizedRole === 'head_admin'
        || normalizedRole === 'company_admin'
        || normalizedRole === 'super_admin';
}

function isStaffRole(role) {
    return String(role || '').trim().toLowerCase() === 'staff';
}

function normalizeBranchName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeCompanyCode(value) {
    return String(value || '').trim().toLowerCase();
}

function isChowRestaurantInventoryMode() {
    return normalizeCompanyCode(state.companyCode) === 'chow';
}

function sameBranch(left, right) {
    return normalizeBranchName(left).toLowerCase() === normalizeBranchName(right).toLowerCase();
}

function canEditSelectedBranch(branchName = '') {
    if (!state.canEditInventory) {
        return false;
    }
    if (!isStaffRole(state.session?.role)) {
        return true;
    }
    return sameBranch(branchName, state.assignedBranch);
}

function canDeleteSelectedBranch(branchName = '') {
    return state.canDeleteInventory && canEditSelectedBranch(branchName);
}

function getInventoryEditRestrictionMessage(branchName = '') {
    if (!state.canEditInventory) {
        return 'Inventory editing is allowed for staff and company admins only.';
    }
    if (isStaffRole(state.session?.role) && !sameBranch(branchName, state.assignedBranch)) {
        return `Staff can edit inventory only in ${state.assignedBranch || 'their assigned branch'}.`;
    }
    return 'Inventory editing is not available for this branch.';
}

function getInventoryDeleteRestrictionMessage(branchName = '') {
    if (!state.canDeleteInventory) {
        return 'Only company admins can delete inventory items.';
    }
    if (isStaffRole(state.session?.role) && !sameBranch(branchName, state.assignedBranch)) {
        return `Staff can delete inventory only in ${state.assignedBranch || 'their assigned branch'}.`;
    }
    return 'Inventory deletion is not available for this branch.';
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
