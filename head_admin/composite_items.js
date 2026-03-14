const appClient = window.appClient;

const pageTitle = document.getElementById('pageTitle');
const pageCopy = document.getElementById('pageCopy');
const searchInput = document.getElementById('searchInput');
const refreshBtn = document.getElementById('refreshBtn');
const openModalBtn = document.getElementById('openModalBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const saveCompositeBtn = document.getElementById('saveCompositeBtn');
const addComponentBtn = document.getElementById('addComponentBtn');
const statusText = document.getElementById('statusText');
const compositeTableBody = document.getElementById('compositeTableBody');
const rowCount = document.getElementById('rowCount');
const compositeModal = document.getElementById('compositeModal');
const compositeModalTitle = document.getElementById('compositeModalTitle');
const compositeModalCopy = document.getElementById('compositeModalCopy');
const productNameInput = document.getElementById('productNameInput');
const itemCodeInput = document.getElementById('itemCodeInput');
const itemSetInput = document.getElementById('itemSetInput');
const componentList = document.getElementById('componentList');
const compositeComponentList = document.getElementById('compositeComponentList');

const state = {
    rows: [],
    componentRows: [],
    nextComponentRowId: 1,
    componentCatalog: [],
    editingKey: ''
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({
        role: 'head_admin',
        allowEmployeeFeature: 'composite'
    });
    if (!session) {
        return;
    }
    appClient.attachEmployeeBackButton(session);

    await applyWorkspaceConfig();
    await loadComponentCatalog();

    const debouncedLoadCompositeItems = debounce(loadCompositeItems, 180);

    refreshBtn.addEventListener('click', loadCompositeItems);
    searchInput.addEventListener('input', debouncedLoadCompositeItems);
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            loadCompositeItems();
        }
    });
    openModalBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    addComponentBtn.addEventListener('click', () => {
        addComponentRow();
        renderComponentRows();
    });
    saveCompositeBtn.addEventListener('click', saveComposite);
    compositeModal.addEventListener('click', (event) => {
        if (event.target === compositeModal) {
            closeModal();
        }
    });
    componentList.addEventListener('click', handleComponentListClick);
    componentList.addEventListener('input', handleComponentListInput);
    componentList.addEventListener('change', handleComponentListInput);
    compositeTableBody.addEventListener('click', handleTableClick);

    await loadCompositeItems();
}

async function applyWorkspaceConfig() {
    try {
        const bootstrap = await appClient.getBootstrap();
        const labels = bootstrap?.workspaceConfig?.labels || {};
        pageTitle.textContent = labels.compositePageTitle || labels.compositeMenu || 'Composite Items';
        pageCopy.textContent = 'I-set up ang product composite recipe. Kapag na-order ang composite item, automatic na mababawas ang components sa inventory levels.';
    } catch (_error) {
        pageTitle.textContent = 'Composite Items';
    }
}

async function loadComponentCatalog() {
    try {
        const rows = await appClient.listProducts('');
        buildComponentCatalog(Array.isArray(rows) ? rows : []);
    } catch (error) {
        console.warn('Failed to load component catalog:', error);
        buildComponentCatalog([]);
    }
}

function buildComponentCatalog(rows = []) {
    const grouped = new Map();

    rows.forEach((row) => {
        const productName = String(row.product_name || row.productName || '').trim();
        const inventoryUnit = String(row.inventory_unit || row.inventoryUnit || '').trim();
        const itemCode = String(row.item_code || row.itemCode || '').trim();
        const itemSet = String(row.item_set || row.itemSet || '').trim();
        if (!productName) {
            return;
        }

        const key = normalizeLookup(productName);
        if (!grouped.has(key)) {
            grouped.set(key, {
                productName,
                units: new Set(),
                itemCodes: new Set(),
                itemSets: new Set()
            });
        }

        const entry = grouped.get(key);
        if (inventoryUnit) {
            entry.units.add(inventoryUnit);
        }
        if (itemCode) {
            entry.itemCodes.add(itemCode);
        }
        if (itemSet) {
            entry.itemSets.add(itemSet);
        }
    });

    state.componentCatalog = Array.from(grouped.values())
        .map((entry) => ({
            productName: entry.productName,
            units: Array.from(entry.units).sort((left, right) => left.localeCompare(right)),
            itemCodes: Array.from(entry.itemCodes).sort((left, right) => left.localeCompare(right)),
            itemSets: Array.from(entry.itemSets).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
        }))
        .sort((left, right) => left.productName.localeCompare(right.productName));

    renderComponentSuggestions();
}

function renderComponentSuggestions() {
    if (!compositeComponentList) {
        return;
    }

    compositeComponentList.innerHTML = state.componentCatalog
        .map((entry) => {
            const details = [
                entry.itemSets.length ? `Set ${entry.itemSets.join(', ')}` : '',
                entry.itemCodes.length ? `Code ${entry.itemCodes.slice(0, 3).join(', ')}` : '',
                entry.units.length ? `Unit ${entry.units.join('/')}` : ''
            ].filter(Boolean).join(' | ');
            return `<option value="${appClient.escapeHtml(entry.productName)}" label="${appClient.escapeHtml(details)}"></option>`;
        })
        .join('');
}

function findComponentCatalogEntry(name = '') {
    const lookup = normalizeLookup(name);
    if (!lookup) {
        return null;
    }

    return state.componentCatalog.find((entry) => normalizeLookup(entry.productName) === lookup) || null;
}

function handleComponentListInput(event) {
    const input = event.target.closest('input[data-field]');
    if (!input) {
        return;
    }

    const row = input.closest('.component-row[data-component-id]');
    if (!row) {
        return;
    }

    const componentId = Number(row.dataset.componentId);
    const entry = state.componentRows.find((item) => Number(item.id) === componentId);
    if (!entry) {
        return;
    }

    const field = String(input.dataset.field || '').trim();
    if (!field) {
        return;
    }

    entry[field] = String(input.value || '').trim();

    if (field === 'name') {
        syncComponentUnit(row, entry);
    }
}

function syncComponentUnit(rowElement, entry) {
    const catalogEntry = findComponentCatalogEntry(entry.name);
    if (!catalogEntry || catalogEntry.units.length !== 1) {
        return;
    }

    entry.unit = catalogEntry.units[0];
    const unitInput = rowElement.querySelector('input[data-field="unit"]');
    if (unitInput) {
        unitInput.value = entry.unit;
    }
}

async function loadCompositeItems() {
    refreshBtn.disabled = true;
    setStatus('Loading composite items...', false);

    try {
        const rows = await appClient.listCompositeItems(searchInput.value.trim());
        state.rows = Array.isArray(rows) ? rows : [];
        renderRows();
        setStatus(`Loaded ${state.rows.length} composite row(s).`, false);
    } catch (error) {
        console.error('Failed to load composite items:', error);
        state.rows = [];
        renderRows();
        setStatus(error.message || 'Unable to load composite items.', true);
    } finally {
        refreshBtn.disabled = false;
    }
}

function renderRows() {
    rowCount.textContent = String(state.rows.length);

    if (!state.rows.length) {
        compositeTableBody.innerHTML = '<tr><td colspan="6" class="empty">No composite rows found.</td></tr>';
        return;
    }

    compositeTableBody.innerHTML = state.rows.map((row) => `
        <tr>
            <td>${appClient.escapeHtml(row.product_name || '-')}</td>
            <td>${appClient.escapeHtml(row.item_code || '-')}</td>
            <td>${appClient.escapeHtml(row.item_set || '-')}</td>
            <td>${appClient.escapeHtml(row.detail_text || '-')}</td>
            <td>${appClient.escapeHtml(formatSource(row.source))}</td>
            <td>
                <button type="button" class="action-btn edit-btn" data-action="edit" data-key="${appClient.escapeHtml(row.composite_key || '')}">
                    Edit
                </button>
                <button type="button" class="action-btn delete-btn" data-action="delete" data-key="${appClient.escapeHtml(row.composite_key || '')}">
                    Delete
                </button>
            </td>
        </tr>
    `).join('');
}

function openModal(options = {}) {
    const row = options.row || null;
    const isEdit = Boolean(row);
    state.editingKey = row?.composite_key || '';
    productNameInput.value = '';
    itemCodeInput.value = '';
    itemSetInput.value = '';
    state.componentRows = [];
    state.nextComponentRowId = 1;
    if (isEdit) {
        productNameInput.value = row.product_name || '';
        itemCodeInput.value = row.item_code || '';
        itemSetInput.value = row.item_set || '';
        const components = Array.isArray(row.components) ? row.components : [];
        components.forEach((component) => {
            const qtyValue = component.quantity ?? component.component_quantity;
            state.componentRows.push({
                id: state.nextComponentRowId++,
                name: String(component.name || component.component_name || ''),
                quantity: qtyValue == null ? '1' : String(qtyValue),
                unit: String(component.unit || component.component_unit || '')
            });
        });
    }
    if (!state.componentRows.length) {
        addComponentRow();
    }
    renderComponentRows();
    if (compositeModalTitle) {
        compositeModalTitle.textContent = isEdit ? 'Edit Composite Setup' : 'Add Composite Setup';
    }
    if (compositeModalCopy) {
        compositeModalCopy.textContent = isEdit
            ? 'I-update ang components ng composite item. Mag-save para ma-apply sa inventory deduction.'
            : 'Ilagay ang product variant at mga component na ibabawas kapag na-order ang composite item.';
    }
    saveCompositeBtn.textContent = isEdit ? 'Update Composite' : 'Save Composite';
    compositeModal.classList.add('is-open');
    compositeModal.setAttribute('aria-hidden', 'false');
    productNameInput.focus();
}

function closeModal() {
    compositeModal.classList.remove('is-open');
    compositeModal.setAttribute('aria-hidden', 'true');
    state.editingKey = '';
}

function addComponentRow() {
    state.componentRows.push({
        id: state.nextComponentRowId++,
        name: '',
        quantity: '1',
        unit: ''
    });
}

function renderComponentRows() {
    if (!state.componentRows.length) {
        componentList.innerHTML = '<div class="empty">No components yet.</div>';
        return;
    }

    componentList.innerHTML = state.componentRows.map((entry) => `
        <div class="component-row" data-component-id="${entry.id}">
            <input data-field="name" type="text" list="compositeComponentList" autocomplete="off" placeholder="Type component product" value="${appClient.escapeHtml(entry.name)}">
            <input data-field="quantity" type="number" min="0.01" step="0.01" placeholder="Qty" value="${appClient.escapeHtml(entry.quantity)}">
            <input data-field="unit" type="text" placeholder="Unit (Box/Pcs)" value="${appClient.escapeHtml(entry.unit)}">
            <button type="button" class="action-btn delete-btn" data-action="remove-component" data-component-id="${entry.id}">
                Remove
            </button>
        </div>
    `).join('');
}

function handleComponentListClick(event) {
    const button = event.target.closest('button[data-action="remove-component"]');
    if (!button) {
        return;
    }

    const componentId = Number(button.dataset.componentId);
    if (!Number.isFinite(componentId)) {
        return;
    }

    state.componentRows = state.componentRows.filter((entry) => Number(entry.id) !== componentId);
    if (!state.componentRows.length) {
        addComponentRow();
    }
    renderComponentRows();
}

function collectComponentValues() {
    const rows = [];
    const components = componentList.querySelectorAll('.component-row[data-component-id]');
    components.forEach((row) => {
        const componentId = Number(row.dataset.componentId);
        const entry = state.componentRows.find((item) => Number(item.id) === componentId);
        if (!entry) {
            return;
        }

        const nameInput = row.querySelector('input[data-field="name"]');
        const quantityInput = row.querySelector('input[data-field="quantity"]');
        const unitInput = row.querySelector('input[data-field="unit"]');
        entry.name = String(nameInput?.value || '').trim();
        entry.quantity = String(quantityInput?.value || '').trim();
        entry.unit = String(unitInput?.value || '').trim();

        rows.push({
            component_name: entry.name,
            component_quantity: entry.quantity,
            component_unit: entry.unit
        });
    });
    return rows;
}

async function saveComposite() {
    const productName = productNameInput.value.trim();
    const itemCode = itemCodeInput.value.trim();
    const itemSet = itemSetInput.value.trim();
    const components = collectComponentValues().filter((entry) =>
        String(entry.component_name || '').trim()
        && Number(entry.component_quantity || 0) > 0
    );

    if (!productName || !itemCode || !itemSet) {
        setStatus('Product name, item code, and set are required.', true);
        return;
    }
    if (!components.length) {
        setStatus('Add at least one valid component.', true);
        return;
    }

    saveCompositeBtn.disabled = true;
    setStatus('Saving composite setup...', false);

    try {
        const currentKey = [productName, itemCode, itemSet].join('||');
        if (state.editingKey && state.editingKey !== currentKey) {
            try {
                await appClient.deleteCompositeItem(state.editingKey);
            } catch (error) {
                console.warn('Unable to delete previous composite setup before saving:', error);
            }
        }
        await appClient.upsertCompositeItem({
            product_name: productName,
            item_code: itemCode,
            item_set: itemSet,
            components
        });
        closeModal();
        await loadCompositeItems();
        setStatus(`Composite setup saved for ${productName} (${itemSet}).`, false);
    } catch (error) {
        console.error('Failed to save composite:', error);
        setStatus(error.message || 'Unable to save composite setup.', true);
    } finally {
        saveCompositeBtn.disabled = false;
    }
}

async function handleTableClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) {
        return;
    }

    const action = String(button.dataset.action || '').trim();
    if (action === 'edit') {
        const compositeKey = String(button.dataset.key || '').trim();
        const row = state.rows.find((entry) => String(entry.composite_key || '') === compositeKey);
        if (!row) {
            setStatus('Composite item not found for editing.', true);
            return;
        }
        openModal({ row });
        return;
    }

    if (action !== 'delete') {
        return;
    }

    const compositeKey = String(button.dataset.key || '').trim();
    if (!compositeKey) {
        return;
    }

    if (!window.confirm('Delete this composite setup?')) {
        return;
    }

    setStatus('Deleting composite setup...', false);
    try {
        await appClient.deleteCompositeItem(compositeKey);
        await loadCompositeItems();
        setStatus('Composite setup deleted.', false);
    } catch (error) {
        console.error('Failed to delete composite:', error);
        setStatus(error.message || 'Unable to delete composite setup.', true);
    }
}

function formatSource(value) {
    return String(value || '').toLowerCase() === 'seed' ? 'CSV Import' : 'Manual';
}

function setStatus(message, isError) {
    statusText.textContent = message;
    statusText.classList.toggle('error', Boolean(isError));
}

function normalizeLookup(value) {
    return String(value || '').trim().toLowerCase();
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
