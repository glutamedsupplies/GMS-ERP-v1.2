const appClient = window.appClient;

const DEFAULT_PRICELIST_CONFIG = Object.freeze({
    audience_label: 'RESELLERS',
    header_title: 'Updated Price List',
    intro_line: 'ALL PRODUCTS AVAILABLE FOR PER SESSION OR HALF BOX',
    footer_note_primary: 'Prices may change without prior notice',
    footer_note_secondary: 'Bulk / reseller discounts available',
    products: {}
});

const PRICELIST_CATEGORY_ORDER = Object.freeze([
    'TRIO SET',
    'GLUTATHIONE / DRIPS',
    'AQUA SKIN SERIES',
    'GLUTAX SERIES',
    'DRIPS',
    'BOOSTERS / ADD ONS',
    'TOXINS',
    'MEDICAL SUPPLIES',
    'GENERAL PRODUCTS'
]);

const SET_RANK = Object.freeze(['M', 'P', 'P W C', 'T', 'D B 100', 'D B 50', 'D B', 'D C 100', 'D C 50', 'D C']);
const SET_PUBLIC_LABELS = Object.freeze({
    M: 'BOX',
    P: 'PUSH',
    'P W C': 'PUSH',
    T: 'PRICE',
    'D B 100': 'DRIP',
    'D B 50': 'DRIP',
    'D B': 'DRIP',
    'D C 100': 'DRIP',
    'D C 50': 'DRIP',
    'D C': 'DRIP'
});

const PRICELIST_CATEGORY_RULES = Object.freeze([
    { category: 'TRIO SET', patterns: [/\btrio\b/i] },
    { category: 'AQUA SKIN SERIES', patterns: [/\baqua\s*skin\b/i, /\bveniscy\b/i, /\btime\s*machine\b/i, /\bnc24\b/i] },
    { category: 'GLUTAX SERIES', patterns: [/\bglutax\b/i] },
    { category: 'DRIPS', patterns: [/\blumin\b/i, /\bsakura\s*kiyoshi\b/i, /\bseoul\s*drip\b/i] },
    { category: 'TOXINS', patterns: [/\bbotulax\b/i, /\bnabota\b/i, /\bneuronox\b/i, /\bwondertox\b/i, /\btox\b/i] },
    {
        category: 'MEDICAL SUPPLIES',
        patterns: [/\bbutterfly\b/i, /\bmacroset\b/i, /\bcannula\b/i, /\bsyringe\b/i, /\bsterile\s*water\b/i, /\bpnss\b/i, /\btourniquet\b/i]
    },
    {
        category: 'BOOSTERS / ADD ONS',
        patterns: [
            /\bradianz\b/i,
            /\bcartinex\b/i,
            /\bcarnitine\b/i,
            /\blaroscorbine\b/i,
            /\bbioswiss\b/i,
            /\bbioskin\b/i,
            /\blaennec\b/i,
            /\bneocell\b/i,
            /\bneutroskin\b/i,
            /\btraminex\b/i,
            /\bmelabio\b/i,
            /\blucchini\b/i,
            /\bvitamin\b/i,
            /\bcollagen\b/i,
            /\bpowercell\b/i
        ]
    },
    {
        category: 'GLUTATHIONE / DRIPS',
        patterns: [/\bsaluta\b/i, /\btationil\b/i, /\btatio\b/i, /\btad\b/i, /\bgluta\b/i, /\bshiro\b/i, /\bmiracle\s*white\b/i, /\bcindyrella\b/i]
    }
]);

const productFilterInput = document.getElementById('productFilterInput');
const setFilterInput = document.getElementById('setFilterInput');
const refreshBtn = document.getElementById('refreshBtn');
const importCsvBtn = document.getElementById('importCsvBtn');
const openModalBtn = document.getElementById('openModalBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const saveVariantBtn = document.getElementById('saveVariantBtn');
const savePricelistSettingsBtn = document.getElementById('savePricelistSettingsBtn');
const copyPricelistBtn = document.getElementById('copyPricelistBtn');
const statusText = document.getElementById('statusText');
const inventoryTableBody = document.getElementById('inventoryTableBody');
const variantCount = document.getElementById('variantCount');
const productCount = document.getElementById('productCount');
const averagePrice = document.getElementById('averagePrice');
const costPriceCount = document.getElementById('costPriceCount');
const totalCostPrice = document.getElementById('totalCostPrice');
const pageTitle = document.getElementById('pageTitle');
const pageCopy = document.getElementById('pageCopy');
const audienceLabelInput = document.getElementById('audienceLabelInput');
const headerTitleInput = document.getElementById('headerTitleInput');
const introLineInput = document.getElementById('introLineInput');
const footerNotePrimaryInput = document.getElementById('footerNotePrimaryInput');
const footerNoteSecondaryInput = document.getElementById('footerNoteSecondaryInput');
const pricelistTextOutput = document.getElementById('pricelistTextOutput');

const variantModal = document.getElementById('variantModal');
const modalTitle = document.getElementById('modalTitle');
const productNameInput = document.getElementById('productNameInput');
const itemCodeInput = document.getElementById('itemCodeInput');
const setNameInput = document.getElementById('setNameInput');
const priceInput = document.getElementById('priceInput');
const costPriceInput = document.getElementById('costPriceInput');
const pricelistCategoryInput = document.getElementById('pricelistCategoryInput');
const pricelistDisplayNameInput = document.getElementById('pricelistDisplayNameInput');
const pricelistPackLabelInput = document.getElementById('pricelistPackLabelInput');
const pricelistLineLabelInput = document.getElementById('pricelistLineLabelInput');
const pricelistSortOrderInput = document.getElementById('pricelistSortOrderInput');
const pricelistHiddenInput = document.getElementById('pricelistHiddenInput');

const state = {
    rows: [],
    editingId: null,
    pricelistConfig: clonePricelistConfig(DEFAULT_PRICELIST_CONFIG),
    generatedSections: []
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }
    appClient.attachEmployeeBackButton(session);

    bindEvents();
    await Promise.all([
        applyWorkspaceConfig(),
        loadPricelistConfig({ showStatus: false }),
        loadVariants({ showStatus: false })
    ]);
    syncPricelistStudio();
    setStatus(`Loaded ${state.rows.length} inventory variant(s).`, false);
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
                || 'Manage product variants used by the order form. Search by product or set, import the latest CSV, and maintain item code, selling price, and cost price in one place.';
        }
    } catch (_error) {
        if (pageTitle) {
            pageTitle.textContent = 'Product Pricing';
        }
    }
}

function bindEvents() {
    const debouncedLoadVariants = debounce(() => loadVariants(), 180);
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

    refreshBtn.addEventListener('click', () => loadVariants());
    importCsvBtn.addEventListener('click', importCsv);
    openModalBtn.addEventListener('click', () => openModal());
    closeModalBtn.addEventListener('click', closeModal);
    saveVariantBtn.addEventListener('click', saveVariant);
    savePricelistSettingsBtn.addEventListener('click', savePricelistSettings);
    copyPricelistBtn.addEventListener('click', copyPricelistText);

    [
        audienceLabelInput,
        headerTitleInput,
        introLineInput,
        footerNotePrimaryInput,
        footerNoteSecondaryInput
    ].forEach((input) => {
        input.addEventListener('input', () => {
            syncPricelistSettingsFromInputs();
            syncPricelistStudio();
        });
    });

    variantModal.addEventListener('click', (event) => {
        if (event.target === variantModal) {
            closeModal();
        }
    });

    inventoryTableBody.addEventListener('click', handleTableClick);
}

async function loadVariants({ showStatus = true } = {}) {
    refreshBtn.disabled = true;
    if (showStatus) {
        setStatus('Loading inventory variants...', false);
    }

    try {
        const search = productFilterInput.value.trim();
        const rows = await appClient.listInventoryVariants({
            setName: setFilterInput.value.trim(),
            search,
            bypassCache: true
        });

        state.rows = Array.isArray(rows) ? rows : [];
        renderTable();
        renderSummary();
        syncPricelistStudio();
        if (showStatus) {
            setStatus(`Loaded ${state.rows.length} inventory variant(s).`, false);
        }
    } catch (error) {
        console.error('Failed to load inventory variants:', error);
        state.rows = [];
        renderTable();
        renderSummary();
        syncPricelistStudio();
        setStatus(error.message || 'Unable to load inventory variants.', true);
    } finally {
        refreshBtn.disabled = false;
    }
}

async function loadPricelistConfig({ showStatus = false } = {}) {
    try {
        const config = await appClient.getCompanyPricelistConfig();
        state.pricelistConfig = normalizePricelistConfig(config);
        applyPricelistConfigToInputs();
        syncPricelistStudio();
        if (showStatus) {
            setStatus('Pricelist setup loaded.', false);
        }
    } catch (error) {
        console.error('Failed to load pricelist config:', error);
        state.pricelistConfig = normalizePricelistConfig(DEFAULT_PRICELIST_CONFIG);
        applyPricelistConfigToInputs();
        syncPricelistStudio();
        if (showStatus) {
            setStatus(error.message || 'Unable to load pricelist setup.', true);
        }
    }
}

function renderTable() {
    if (!state.rows.length) {
        inventoryTableBody.innerHTML = '<tr><td colspan="7" class="empty">No inventory variants found.</td></tr>';
        return;
    }

    inventoryTableBody.innerHTML = state.rows.map((row) => `
        <tr>
            <td><strong>${appClient.escapeHtml(row.product_name)}</strong></td>
            <td>${appClient.escapeHtml(row.item_code)}</td>
            <td>${appClient.escapeHtml(row.set_name)}</td>
            <td class="price-cell">${appClient.escapeHtml(formatMoney(row.price))}</td>
            <td class="price-cell cost-price-cell">${appClient.escapeHtml(formatOptionalMoney(row.cost_price))}</td>
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
    const uniqueProducts = new Set(state.rows.map((row) => normalizeText(row.product_name).toLowerCase()).filter(Boolean));
    const average = state.rows.length
        ? state.rows.reduce((sum, row) => sum + Number(row.price || 0), 0) / state.rows.length
        : 0;
    const rowsWithCost = state.rows.filter((row) => Number(row.cost_price || 0) > 0);
    const totalCost = rowsWithCost.reduce((sum, row) => sum + Number(row.cost_price || 0), 0);

    variantCount.textContent = String(state.rows.length);
    productCount.textContent = String(uniqueProducts.size);
    averagePrice.textContent = formatMoney(average);
    costPriceCount.textContent = String(rowsWithCost.length);
    totalCostPrice.textContent = formatMoney(totalCost);
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
    const isEditing = Boolean(row);
    const resolvedProductName = row ? row.product_name : '';
    const resolvedSetName = row ? row.set_name : '';
    const storedMeta = getStoredProductMeta(resolvedProductName);
    const meta = getResolvedProductMeta(resolvedProductName);

    state.editingId = row ? Number(row.id) : null;
    modalTitle.textContent = row ? 'Edit Variant' : 'Add Variant';
    productNameInput.value = row ? row.product_name : '';
    itemCodeInput.value = row ? row.item_code : '';
    setNameInput.value = row ? row.set_name : '';
    priceInput.value = row ? String(Number(row.price || 0).toFixed(2)) : '';
    costPriceInput.value = row ? String(Number(row.cost_price || 0).toFixed(2)) : '';
    pricelistCategoryInput.value = isEditing ? (storedMeta.category || meta.category || '') : '';
    pricelistDisplayNameInput.value = isEditing ? (storedMeta.display_name || resolvedProductName) : '';
    pricelistPackLabelInput.value = isEditing ? (storedMeta.pack_label || '') : '';
    pricelistLineLabelInput.value = isEditing ? getStoredOrDefaultLineLabel(resolvedProductName, resolvedSetName) : '';
    pricelistSortOrderInput.value = isEditing && meta.sort_order ? String(meta.sort_order) : '';
    pricelistHiddenInput.checked = isEditing ? Boolean(meta.hidden) : false;

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
    costPriceInput.value = '';
    pricelistCategoryInput.value = '';
    pricelistDisplayNameInput.value = '';
    pricelistPackLabelInput.value = '';
    pricelistLineLabelInput.value = '';
    pricelistSortOrderInput.value = '';
    pricelistHiddenInput.checked = false;
    variantModal.classList.remove('is-open');
    variantModal.setAttribute('aria-hidden', 'true');
}

async function saveVariant() {
    const payload = {
        product_name: productNameInput.value.trim(),
        item_code: itemCodeInput.value.trim(),
        set_name: setNameInput.value.trim(),
        price: priceInput.value,
        cost_price: costPriceInput.value
    };

    saveVariantBtn.disabled = true;
    setStatus(state.editingId ? 'Updating variant...' : 'Creating variant...', false);

    try {
        const savedRow = state.editingId
            ? await appClient.updateInventoryVariant(state.editingId, payload)
            : await appClient.createInventoryVariant(payload);

        applyModalPricelistMetadata(savedRow?.product_name || payload.product_name, savedRow?.set_name || payload.set_name);
        await persistPricelistConfig({ successMessage: '' });

        closeModal();
        await loadVariants({ showStatus: false });
        setStatus(state.editingId ? 'Inventory variant updated. Pricelist preview refreshed.' : 'Inventory variant added. Pricelist preview refreshed.', false);
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
        await loadVariants({ showStatus: false });
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
        await loadVariants({ showStatus: false });
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

function syncPricelistStudio() {
    syncPricelistSettingsFromInputs();
    state.generatedSections = buildPricelistSections();
    renderPricelistTextOutput();
}

function buildPricelistSections() {
    const groupedProducts = new Map();

    state.rows.forEach((row) => {
        const productName = normalizeText(row?.product_name);
        if (!productName) {
            return;
        }

        const key = normalizeProductKey(productName);
        const bucket = groupedProducts.get(key) || {
            productName,
            rows: []
        };
        bucket.rows.push(row);
        groupedProducts.set(key, bucket);
    });

    const sectionsByName = new Map();

    groupedProducts.forEach((group) => {
        const meta = getResolvedProductMeta(group.productName);
        if (meta.hidden) {
            return;
        }

        const lines = buildPricelistLines(group.rows, meta.line_labels);
        if (!lines.length) {
            return;
        }

        const category = meta.category || inferPricelistCategory(group.productName);
        const section = sectionsByName.get(category) || {
            category,
            items: []
        };

        section.items.push({
            productName: group.productName,
            displayName: meta.display_name || group.productName,
            packLabel: meta.pack_label || '',
            sortOrder: meta.sort_order || 0,
            lines
        });

        sectionsByName.set(category, section);
    });

    return Array.from(sectionsByName.values())
        .map((section) => ({
            ...section,
            items: section.items.sort((left, right) => {
                const orderCompare = Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
                if (orderCompare !== 0) {
                    return orderCompare;
                }
                return String(left.displayName || '').localeCompare(String(right.displayName || ''), 'en', { sensitivity: 'base' });
            })
        }))
        .sort((left, right) => {
            const leftRank = getCategoryRank(left.category);
            const rightRank = getCategoryRank(right.category);
            if (leftRank !== rightRank) {
                return leftRank - rightRank;
            }
            return String(left.category || '').localeCompare(String(right.category || ''), 'en', { sensitivity: 'base' });
        });
}

function buildPricelistLines(rows = [], lineLabels = {}) {
    const initialLines = rows
        .map((row) => {
            const setName = normalizeText(row?.set_name);
            const configuredLabel = normalizeText(lineLabels?.[setName]);
            const defaultLabel = getDefaultPricelistLineLabel(setName);
            return {
                setName,
                label: configuredLabel || defaultLabel,
                price: Number(row?.price || 0),
                rank: getSetRank(setName)
            };
        })
        .filter((entry) => Number.isFinite(entry.price) && entry.price > 0)
        .sort((left, right) => {
            if (left.rank !== right.rank) {
                return left.rank - right.rank;
            }
            return left.label.localeCompare(right.label, 'en', { sensitivity: 'base' });
        });

    const duplicateCount = initialLines.reduce((counts, line) => {
        counts[line.label] = (counts[line.label] || 0) + 1;
        return counts;
    }, {});

    return initialLines.map((line) => ({
        ...line,
        label: duplicateCount[line.label] > 1 && line.setName
            ? `${line.label} (${line.setName})`
            : line.label
    }));
}

function renderPricelistTextOutput() {
    pricelistTextOutput.value = buildPricelistText(state.generatedSections);
}

function buildPricelistText(sections = []) {
    const config = state.pricelistConfig || DEFAULT_PRICELIST_CONFIG;
    const lines = [];

    if (config.audience_label) {
        lines.push(`**${config.audience_label}**`);
    }
    if (config.header_title) {
        lines.push(config.header_title);
    }
    if (config.intro_line) {
        lines.push('');
        lines.push(config.intro_line);
    }

    sections.forEach((section, sectionIndex) => {
        lines.push('', '---', '', `**${section.category}**`, '');

        section.items.forEach((item) => {
            lines.push(`- ${item.displayName}${item.packLabel ? ` (${item.packLabel})` : ''}`);
            item.lines.forEach((line) => {
                lines.push(`  ${line.label}: ${formatCompactMoney(line.price)}`);
            });
            lines.push('');
        });

        if (sectionIndex === sections.length - 1 && lines[lines.length - 1] === '') {
            while (lines.length && lines[lines.length - 1] === '') {
                lines.pop();
            }
        }
    });

    if (config.footer_note_primary || config.footer_note_secondary) {
        lines.push('', '---');
        if (config.footer_note_primary) {
            lines.push('', `- ${config.footer_note_primary}`);
        }
        if (config.footer_note_secondary) {
            lines.push(`- ${config.footer_note_secondary}`);
        }
    }

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function savePricelistSettings() {
    savePricelistSettingsBtn.disabled = true;
    setStatus('Saving pricelist setup...', false);

    try {
        await persistPricelistConfig({ successMessage: 'Pricelist setup saved.' });
    } catch (error) {
        console.error('Failed to save pricelist setup:', error);
        setStatus(error.message || 'Unable to save pricelist setup.', true);
    } finally {
        savePricelistSettingsBtn.disabled = false;
    }
}

async function persistPricelistConfig({ successMessage = '' } = {}) {
    syncPricelistSettingsFromInputs();
    const savedConfig = await appClient.updateCompanyPricelistConfig(buildPricelistConfigPayload());
    state.pricelistConfig = normalizePricelistConfig(savedConfig);
    applyPricelistConfigToInputs();
    syncPricelistStudio();
    if (successMessage) {
        setStatus(successMessage, false);
    }
    return state.pricelistConfig;
}

async function copyPricelistText() {
    const text = String(pricelistTextOutput.value || '').trim();
    if (!text) {
        setStatus('Nothing to copy yet for the pricelist.', true);
        return;
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            pricelistTextOutput.focus();
            pricelistTextOutput.select();
            document.execCommand('copy');
        }
        setStatus('Pricelist text copied to clipboard.', false);
    } catch (error) {
        console.error('Unable to copy pricelist text:', error);
        setStatus('Unable to copy pricelist text.', true);
    }
}

function applyPricelistConfigToInputs() {
    const config = state.pricelistConfig || DEFAULT_PRICELIST_CONFIG;
    audienceLabelInput.value = config.audience_label || DEFAULT_PRICELIST_CONFIG.audience_label;
    headerTitleInput.value = config.header_title || DEFAULT_PRICELIST_CONFIG.header_title;
    introLineInput.value = config.intro_line || DEFAULT_PRICELIST_CONFIG.intro_line;
    footerNotePrimaryInput.value = config.footer_note_primary || DEFAULT_PRICELIST_CONFIG.footer_note_primary;
    footerNoteSecondaryInput.value = config.footer_note_secondary || DEFAULT_PRICELIST_CONFIG.footer_note_secondary;
}

function syncPricelistSettingsFromInputs() {
    state.pricelistConfig = normalizePricelistConfig({
        ...state.pricelistConfig,
        audience_label: normalizeText(audienceLabelInput.value) || DEFAULT_PRICELIST_CONFIG.audience_label,
        header_title: normalizeText(headerTitleInput.value) || DEFAULT_PRICELIST_CONFIG.header_title,
        intro_line: normalizeText(introLineInput.value) || DEFAULT_PRICELIST_CONFIG.intro_line,
        footer_note_primary: normalizeText(footerNotePrimaryInput.value) || DEFAULT_PRICELIST_CONFIG.footer_note_primary,
        footer_note_secondary: normalizeText(footerNoteSecondaryInput.value) || DEFAULT_PRICELIST_CONFIG.footer_note_secondary,
        products: state.pricelistConfig.products || {}
    });
}

function buildPricelistConfigPayload() {
    return normalizePricelistConfig(state.pricelistConfig);
}

function applyModalPricelistMetadata(productName, setName) {
    const normalizedProductName = normalizeText(productName);
    const normalizedSetName = normalizeText(setName);
    if (!normalizedProductName) {
        return;
    }

    const key = normalizeProductKey(normalizedProductName);
    const currentMeta = getStoredProductMeta(normalizedProductName);
    const defaultCategory = inferPricelistCategory(normalizedProductName);
    const defaultDisplayName = normalizedProductName;
    const defaultLineLabel = getDefaultPricelistLineLabel(normalizedSetName);
    const nextDisplayName = normalizeText(pricelistDisplayNameInput.value);
    const nextCategory = normalizeText(pricelistCategoryInput.value);
    const nextPackLabel = normalizeText(pricelistPackLabelInput.value);
    const nextLineLabel = normalizeText(pricelistLineLabelInput.value);
    const nextSortOrder = Number(pricelistSortOrderInput.value || 0);
    const lineLabels = { ...(currentMeta.line_labels || {}) };

    if (nextLineLabel && nextLineLabel !== defaultLineLabel) {
        lineLabels[normalizedSetName] = nextLineLabel;
    } else {
        delete lineLabels[normalizedSetName];
    }

    const nextMeta = normalizePricelistProductMeta({
        ...currentMeta,
        product_name: normalizedProductName,
        display_name: nextDisplayName && nextDisplayName !== defaultDisplayName ? nextDisplayName : '',
        category: nextCategory && nextCategory !== defaultCategory ? nextCategory : '',
        pack_label: nextPackLabel,
        sort_order: Number.isFinite(nextSortOrder) ? nextSortOrder : 0,
        hidden: Boolean(pricelistHiddenInput.checked),
        line_labels: lineLabels
    }, normalizedProductName);

    if (isEmptyPricelistProductMeta(nextMeta)) {
        delete state.pricelistConfig.products[key];
        return;
    }

    state.pricelistConfig.products[key] = nextMeta;
}

function getStoredProductMeta(productName = '') {
    const key = normalizeProductKey(productName);
    return normalizePricelistProductMeta(state.pricelistConfig?.products?.[key] || {}, productName);
}

function getResolvedProductMeta(productName = '') {
    const stored = getStoredProductMeta(productName);
    return {
        ...stored,
        product_name: normalizeText(productName),
        display_name: stored.display_name || normalizeText(productName),
        category: stored.category || inferPricelistCategory(productName),
        pack_label: stored.pack_label || '',
        sort_order: stored.sort_order || 0,
        hidden: Boolean(stored.hidden),
        line_labels: { ...(stored.line_labels || {}) }
    };
}

function getStoredOrDefaultLineLabel(productName = '', setName = '') {
    const stored = getStoredProductMeta(productName);
    return normalizeText(stored?.line_labels?.[normalizeText(setName)]) || getDefaultPricelistLineLabel(setName);
}

function normalizePricelistConfig(config = {}) {
    const source = (config && typeof config === 'object' && !Array.isArray(config))
        ? config
        : {};
    const defaults = clonePricelistConfig(DEFAULT_PRICELIST_CONFIG);
    const normalizedProducts = {};
    const sourceProducts = (source.products && typeof source.products === 'object' && !Array.isArray(source.products))
        ? source.products
        : {};

    Object.entries(sourceProducts).forEach(([rawKey, value]) => {
        const productName = normalizeText(value?.product_name || value?.productName || rawKey);
        const key = normalizeProductKey(productName);
        if (!key) {
            return;
        }
        normalizedProducts[key] = normalizePricelistProductMeta(value, productName);
    });

    return {
        audience_label: normalizeText(source.audience_label || source.audienceLabel || defaults.audience_label) || defaults.audience_label,
        header_title: normalizeText(source.header_title || source.headerTitle || defaults.header_title) || defaults.header_title,
        intro_line: normalizeText(source.intro_line || source.introLine || defaults.intro_line) || defaults.intro_line,
        footer_note_primary: normalizeText(source.footer_note_primary || source.footerNotePrimary || defaults.footer_note_primary) || defaults.footer_note_primary,
        footer_note_secondary: normalizeText(source.footer_note_secondary || source.footerNoteSecondary || defaults.footer_note_secondary) || defaults.footer_note_secondary,
        products: normalizedProducts
    };
}

function normalizePricelistProductMeta(meta = {}, fallbackProductName = '') {
    const source = (meta && typeof meta === 'object' && !Array.isArray(meta))
        ? meta
        : {};
    const sortOrder = Number(source.sort_order ?? source.sortOrder ?? 0);
    const rawLineLabels = (source.line_labels && typeof source.line_labels === 'object' && !Array.isArray(source.line_labels))
        ? source.line_labels
        : ((source.lineLabels && typeof source.lineLabels === 'object' && !Array.isArray(source.lineLabels)) ? source.lineLabels : {});

    return {
        product_name: normalizeText(source.product_name || source.productName || fallbackProductName),
        display_name: normalizeText(source.display_name || source.displayName || ''),
        category: normalizeText(source.category || ''),
        pack_label: normalizeText(source.pack_label || source.packLabel || ''),
        sort_order: Number.isFinite(sortOrder) ? Math.max(-9999, Math.min(9999, Math.round(sortOrder))) : 0,
        hidden: Boolean(source.hidden || source.isHidden),
        line_labels: Object.entries(rawLineLabels).reduce((labels, [key, value]) => {
            const normalizedKey = normalizeText(key);
            const normalizedValue = normalizeText(value);
            if (normalizedKey && normalizedValue) {
                labels[normalizedKey] = normalizedValue.slice(0, 40);
            }
            return labels;
        }, {})
    };
}

function isEmptyPricelistProductMeta(meta = {}) {
    return !normalizeText(meta.display_name)
        && !normalizeText(meta.category)
        && !normalizeText(meta.pack_label)
        && !Number(meta.sort_order || 0)
        && !Boolean(meta.hidden)
        && !Object.keys(meta.line_labels || {}).length;
}

function clonePricelistConfig(config = DEFAULT_PRICELIST_CONFIG) {
    return JSON.parse(JSON.stringify(config));
}

function normalizeProductKey(value = '') {
    return normalizeText(value).toLowerCase();
}

function inferPricelistCategory(productName = '') {
    const normalized = normalizeText(productName);
    if (!normalized) {
        return 'GENERAL PRODUCTS';
    }

    const matchedRule = PRICELIST_CATEGORY_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(normalized)));
    return matchedRule ? matchedRule.category : 'GENERAL PRODUCTS';
}

function getCategoryRank(category = '') {
    const index = PRICELIST_CATEGORY_ORDER.findIndex((entry) => entry === category);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function getDefaultPricelistLineLabel(setName = '') {
    const normalized = normalizeText(setName).toUpperCase();
    return SET_PUBLIC_LABELS[normalized] || normalized || 'PRICE';
}

function getSetRank(setName = '') {
    const normalized = normalizeText(setName).toUpperCase();
    const index = SET_RANK.findIndex((entry) => entry === normalized);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatCompactMoney(value) {
    const amount = Number(value || 0);
    const hasDecimal = Math.abs(amount % 1) > 0.0001;
    return `\u20b1${amount.toLocaleString('en-PH', {
        minimumFractionDigits: hasDecimal ? 2 : 0,
        maximumFractionDigits: 2
    })}`;
}

function formatOptionalMoney(value) {
    const amount = Number(value || 0);
    if (!(amount > 0)) {
        return '-';
    }
    return formatMoney(amount);
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
        minute: '2-digit',
        hour12: true
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

function normalizeText(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}
