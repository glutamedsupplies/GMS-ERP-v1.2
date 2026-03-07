const appClient = window.appClient;

const productFilterInput = document.getElementById('productFilterInput');
const setFilterInput = document.getElementById('setFilterInput');
const refreshBtn = document.getElementById('refreshBtn');
const importCsvBtn = document.getElementById('importCsvBtn');
const openModalBtn = document.getElementById('openModalBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const saveVariantBtn = document.getElementById('saveVariantBtn');
const statusText = document.getElementById('statusText');
const inventoryTableBody = document.getElementById('inventoryTableBody');
const variantCount = document.getElementById('variantCount');
const productCount = document.getElementById('productCount');
const averagePrice = document.getElementById('averagePrice');
const pageTitle = document.getElementById('pageTitle');
const pageCopy = document.getElementById('pageCopy');

const variantModal = document.getElementById('variantModal');
const modalTitle = document.getElementById('modalTitle');
const productNameInput = document.getElementById('productNameInput');
const itemCodeInput = document.getElementById('itemCodeInput');
const setNameInput = document.getElementById('setNameInput');
const priceInput = document.getElementById('priceInput');

const state = {
    rows: [],
    editingId: null
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }
    appClient.attachEmployeeBackButton(session);

    await applyWorkspaceConfig();
    bindEvents();
    await loadVariants();
}

async function applyWorkspaceConfig() {
    try {
        const bootstrap = await appClient.getBootstrap();
        const labels = bootstrap?.workspaceConfig?.labels || {};
        if (pageTitle) {
            pageTitle.textContent = labels.inventoryPageTitle || labels.inventoryMenu || 'Product Pricing';
        }
        if (pageCopy) {
            pageCopy.textContent = labels.inventoryPageCopy
                || 'Manage product variants used by the order form. Search by product or set, import the latest CSV, and maintain item code and price in one place.';
        }
    } catch (_error) {
        if (pageTitle) {
            pageTitle.textContent = 'Product Pricing';
        }
    }
}

function bindEvents() {
    const debouncedLoadVariants = debounce(loadVariants, 180);
    productFilterInput.addEventListener('input', debouncedLoadVariants);
    setFilterInput.addEventListener('input', debouncedLoadVariants);
    [productFilterInput, setFilterInput].forEach((input) => {
        input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') {
                return;
            }
            event.preventDefault();
            loadVariants();
        });
    });
    refreshBtn.addEventListener('click', loadVariants);
    importCsvBtn.addEventListener('click', importCsv);
    openModalBtn.addEventListener('click', () => openModal());
    closeModalBtn.addEventListener('click', closeModal);
    saveVariantBtn.addEventListener('click', saveVariant);

    variantModal.addEventListener('click', (event) => {
        if (event.target === variantModal) {
            closeModal();
        }
    });

    inventoryTableBody.addEventListener('click', handleTableClick);
}

async function loadVariants() {
    refreshBtn.disabled = true;
    setStatus('Loading inventory variants...', false);

    try {
        const search = productFilterInput.value.trim();
        const rows = await appClient.listInventoryVariants({
            setName: setFilterInput.value.trim(),
            search
        });

        state.rows = Array.isArray(rows) ? rows : [];
        renderTable();
        renderSummary();
        setStatus(`Loaded ${state.rows.length} inventory variant(s).`, false);
    } catch (error) {
        console.error('Failed to load inventory variants:', error);
        state.rows = [];
        renderTable();
        renderSummary();
        setStatus(error.message || 'Unable to load inventory variants.', true);
    } finally {
        refreshBtn.disabled = false;
    }
}

function renderTable() {
    if (!state.rows.length) {
        inventoryTableBody.innerHTML = '<tr><td colspan="6" class="empty">No inventory variants found.</td></tr>';
        return;
    }

    inventoryTableBody.innerHTML = state.rows.map((row) => `
        <tr>
            <td><strong>${appClient.escapeHtml(row.product_name)}</strong></td>
            <td>${appClient.escapeHtml(row.item_code)}</td>
            <td>${appClient.escapeHtml(row.set_name)}</td>
            <td class="price-cell">${appClient.escapeHtml(formatMoney(row.price))}</td>
            <td>${appClient.escapeHtml(formatDateTime(row.updated_at || row.created_at))}</td>
            <td>
                <div class="row-actions">
                    <button type="button" class="secondary-btn small-btn" data-action="edit" data-id="${row.id}">Edit</button>
                    <button type="button" class="delete-btn small-btn" data-action="delete" data-id="${row.id}">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderSummary() {
    const uniqueProducts = new Set(state.rows.map((row) => String(row.product_name || '').toLowerCase()).filter(Boolean));
    const average = state.rows.length
        ? state.rows.reduce((sum, row) => sum + Number(row.price || 0), 0) / state.rows.length
        : 0;

    variantCount.textContent = String(state.rows.length);
    productCount.textContent = String(uniqueProducts.size);
    averagePrice.textContent = formatMoney(average);
}

function handleTableClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) {
        return;
    }

    const rowId = Number(button.dataset.id);
    const action = button.dataset.action;
    const row = state.rows.find((entry) => Number(entry.id) === rowId);
    if (!row) {
        return;
    }

    if (action === 'edit') {
        openModal(row);
        return;
    }

    if (action === 'delete') {
        deleteVariant(row);
    }
}

function openModal(row = null) {
    state.editingId = row ? Number(row.id) : null;
    modalTitle.textContent = row ? 'Edit Variant' : 'Add Variant';
    productNameInput.value = row ? row.product_name : '';
    itemCodeInput.value = row ? row.item_code : '';
    setNameInput.value = row ? row.set_name : '';
    priceInput.value = row ? String(Number(row.price || 0).toFixed(2)) : '';
    variantModal.classList.add('is-open');
    variantModal.setAttribute('aria-hidden', 'false');
    productNameInput.focus();
}

function closeModal() {
    state.editingId = null;
    modalTitle.textContent = 'Add Variant';
    productNameInput.value = '';
    itemCodeInput.value = '';
    setNameInput.value = '';
    priceInput.value = '';
    variantModal.classList.remove('is-open');
    variantModal.setAttribute('aria-hidden', 'true');
}

async function saveVariant() {
    const payload = {
        product_name: productNameInput.value.trim(),
        item_code: itemCodeInput.value.trim(),
        set_name: setNameInput.value.trim(),
        price: priceInput.value
    };

    saveVariantBtn.disabled = true;
    setStatus(state.editingId ? 'Updating variant...' : 'Creating variant...', false);

    try {
        if (state.editingId) {
            await appClient.updateInventoryVariant(state.editingId, payload);
            setStatus('Inventory variant updated.', false);
        } else {
            await appClient.createInventoryVariant(payload);
            setStatus('Inventory variant added.', false);
        }

        closeModal();
        await loadVariants();
    } catch (error) {
        console.error('Failed to save inventory variant:', error);
        setStatus(error.message || 'Unable to save inventory variant.', true);
    } finally {
        saveVariantBtn.disabled = false;
    }
}

async function deleteVariant(row) {
    if (!window.confirm(`Delete variant "${row.product_name}" (${row.set_name})?`)) {
        return;
    }

    setStatus('Deleting variant...', false);

    try {
        await appClient.deleteInventoryVariant(row.id);
        await loadVariants();
        setStatus('Inventory variant deleted.', false);
    } catch (error) {
        console.error('Failed to delete inventory variant:', error);
        setStatus(error.message || 'Unable to delete inventory variant.', true);
    }
}

async function importCsv() {
    importCsvBtn.disabled = true;
    setStatus('Importing inventory CSV...', false);

    try {
        const result = await appClient.importInventoryVariants({});
        await loadVariants();
        setStatus(
            `Import complete. ${result.inserted} inserted, ${result.updated} updated, ${result.unchanged} unchanged.`,
            false
        );
    } catch (error) {
        console.error('Failed to import inventory CSV:', error);
        setStatus(error.message || 'Unable to import inventory CSV.', true);
    } finally {
        importCsvBtn.disabled = false;
    }
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatDateTime(value) {
    if (!value) {
        return '-';
    }

    const parsedValue = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(parsedValue.getTime())) {
        return String(value);
    }

    return parsedValue.toLocaleString('en-PH', {
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

    return function debouncedCallback() {
        window.clearTimeout(timerId);
        timerId = window.setTimeout(() => {
            callback();
        }, delay);
    };
}
