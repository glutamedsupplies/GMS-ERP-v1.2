const appClient = window.appClient;

const NEAR_EXPIRY_DAYS = 7;
const LOW_SALES_THRESHOLD = 2;
const MOVEMENT_VIEW_TOP = 'top_sellers';
const MOVEMENT_VIEW_UNSOLD = 'unsold_products';

const rangePresetInput = document.getElementById('rangePreset');
const dateFromInput = document.getElementById('dateFrom');
const dateToInput = document.getElementById('dateTo');
const branchFilter = document.getElementById('branchFilter');
const itemSearchInput = document.getElementById('itemSearch');
const applyFiltersBtn = document.getElementById('applyFiltersBtn');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const copyUnsoldReportBtn = document.getElementById('copyUnsoldReportBtn');
const panelStatus = document.getElementById('panelStatus');

const activeScopeLabel = document.getElementById('activeScopeLabel');
const activeSummaryLabel = document.getElementById('activeSummaryLabel');
const totalSoldQtyValue = document.getElementById('totalSoldQtyValue');
const stockLinesValue = document.getElementById('stockLinesValue');
const slowMoverValue = document.getElementById('slowMoverValue');
const unsoldQtyValue = document.getElementById('unsoldQtyValue');
const unsoldValueValue = document.getElementById('unsoldValueValue');
const expiredValue = document.getElementById('expiredValue');
const nearExpiryValue = document.getElementById('nearExpiryValue');
const bestSellerValue = document.getElementById('bestSellerValue');
const bestSellerMeta = document.getElementById('bestSellerMeta');

const movementPanelTitle = document.getElementById('movementPanelTitle');
const movementPanelCopy = document.getElementById('movementPanelCopy');
const movementPanelMeta = document.getElementById('movementPanelMeta');
const movementSummary = document.getElementById('movementSummary');
const movementTableHead = document.getElementById('movementTableHead');
const movementTableBody = document.getElementById('movementTableBody');
const movementViewButtons = Array.from(document.querySelectorAll('[data-movement-view]'));
const expiredBody = document.getElementById('expiredBody');
const nearExpiryBody = document.getElementById('nearExpiryBody');

const state = {
    bootstrap: null,
    branchOptions: [],
    renderToken: 0,
    serverDateKey: '',
    activeMovementView: MOVEMENT_VIEW_TOP,
    lastMovementData: {
        topSellers: [],
        productMovementRows: [],
        productMovementSummary: null,
        slowMovers: [],
        slowMoverSummary: null
    },
    lastUnsoldReportText: '',
    lastUnsoldFilters: null
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    try {
        const [bootstrap, references, branchRows, serverInfo] = await Promise.all([
            appClient.getBootstrap(),
            appClient.getSalesReferences(),
            appClient.listBranches(),
            appClient.getServerInfo()
        ]);

        state.bootstrap = bootstrap || {};
        state.serverDateKey = normalizeDateKey(serverInfo?.dateKey) || toDateKey(new Date());
        state.branchOptions = resolveBranchOptions(bootstrap, references, branchRows);
        appClient.applyBootstrapBrandTheme(bootstrap);

        populateBranchFilter();
        applyRangePreset('this_month', { render: false });
        wireEvents();
        await renderInsights();
    } catch (error) {
        console.error('Failed to initialize sales and inventory insight panel:', error);
        setStatus(error.message || 'Unable to load sales and inventory insight panel.', true);
        clearTables();
    }
}

function wireEvents() {
    movementViewButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const requestedView = String(button.dataset.movementView || '').trim().toLowerCase();
            const nextView = requestedView === MOVEMENT_VIEW_UNSOLD ? MOVEMENT_VIEW_UNSOLD : MOVEMENT_VIEW_TOP;
            if (nextView === state.activeMovementView) {
                return;
            }
            state.activeMovementView = nextView;
            renderMovementPanel();
        });
    });

    rangePresetInput?.addEventListener('change', () => {
        const preset = String(rangePresetInput.value || 'this_month').trim().toLowerCase();
        if (preset === 'custom') {
            return;
        }
        applyRangePreset(preset, { render: true });
    });

    dateFromInput?.addEventListener('change', () => {
        rangePresetInput.value = 'custom';
    });

    dateToInput?.addEventListener('change', () => {
        rangePresetInput.value = 'custom';
    });

    branchFilter?.addEventListener('change', () => {
        void renderInsights();
    });

    itemSearchInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            void renderInsights();
        }
    });

    applyFiltersBtn?.addEventListener('click', () => {
        void renderInsights();
    });

    resetFiltersBtn?.addEventListener('click', () => {
        itemSearchInput.value = '';
        branchFilter.value = '';
        applyRangePreset('this_month', { render: true });
    });

    copyUnsoldReportBtn?.addEventListener('click', () => {
        void copyUnsoldReport();
    });
}

function resolveBranchOptions(bootstrap, references, branchRows) {
    const workspaceBranches = Array.isArray(bootstrap?.workspaceConfig?.orderForm?.branches)
        ? bootstrap.workspaceConfig.orderForm.branches
        : [];
    const referenceBranches = Array.isArray(references?.branches)
        ? references.branches
        : [];
    const tenantBranches = Array.isArray(branchRows)
        ? branchRows
            .filter((branch) => Boolean(branch?.is_active))
            .map((branch) => branch.branch_name)
        : [];

    const seen = new Set();
    return [...workspaceBranches, ...referenceBranches, ...tenantBranches]
        .map((entry) => String(entry || '').trim())
        .filter((entry) => {
            if (!entry) {
                return false;
            }
            const token = entry.toLowerCase();
            if (seen.has(token)) {
                return false;
            }
            seen.add(token);
            return true;
        });
}

function populateBranchFilter() {
    if (!branchFilter) {
        return;
    }

    const currentValue = String(branchFilter.value || '').trim();
    branchFilter.innerHTML = '<option value="">All Branches</option>';
    state.branchOptions.forEach((branchName) => {
        const option = document.createElement('option');
        option.value = branchName;
        option.textContent = branchName;
        branchFilter.appendChild(option);
    });

    if (currentValue && state.branchOptions.includes(currentValue)) {
        branchFilter.value = currentValue;
    }
}

function applyRangePreset(preset, { render = false } = {}) {
    const normalizedPreset = String(preset || 'this_month').trim().toLowerCase();
    const range = buildRangeFromPreset(normalizedPreset);

    rangePresetInput.value = normalizedPreset;
    dateFromInput.value = range.dateFrom;
    dateToInput.value = range.dateTo;

    if (render) {
        void renderInsights();
    }
}

function buildRangeFromPreset(preset) {
    const anchor = parseDateKey(state.serverDateKey) || new Date();
    const end = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    let start = new Date(end);

    if (preset === 'last_30_days') {
        start.setDate(start.getDate() - 29);
    } else if (preset === 'this_quarter') {
        const quarterMonth = Math.floor(end.getMonth() / 3) * 3;
        start = new Date(end.getFullYear(), quarterMonth, 1);
    } else {
        start = new Date(end.getFullYear(), end.getMonth(), 1);
    }

    return {
        dateFrom: toDateKey(start),
        dateTo: toDateKey(end)
    };
}

async function renderInsights() {
    const renderToken = ++state.renderToken;
    const filters = readFilters();

    if (!filters.dateFrom || !filters.dateTo) {
        setStatus('Date from and date to are required.', true);
        return;
    }
    if (filters.dateFrom > filters.dateTo) {
        setStatus('Date from cannot be later than date to.', true);
        return;
    }

    setStatus('Loading movement and expiry insights...', false);

    try {
        const [salesPayload, inventoryRows] = await Promise.all([
            appClient.listSales({
                dateFrom: filters.dateFrom,
                dateTo: filters.dateTo,
                branch: filters.branch
            }),
            fetchInventoryRows(filters.branch)
        ]);

        if (renderToken !== state.renderToken) {
            return;
        }

        const salesRows = filterSalesRows(Array.isArray(salesPayload?.items) ? salesPayload.items : [], filters.search);
        const scopedInventory = filterInventoryRows(inventoryRows, filters.search);
        const salesAnalytics = buildSalesAnalytics(salesRows);
        const slowMovers = buildSlowMovers(scopedInventory, salesAnalytics.byBranchProduct);
        const slowMoverTotals = summarizeSlowMovers(slowMovers);
        const productMovementRows = buildProductMovementRows(scopedInventory, salesAnalytics.byProduct);
        const productMovementSummary = summarizeProductMovementRows(productMovementRows);
        const expiredRows = buildExpiryRows(scopedInventory, 'expired');
        const nearExpiryRows = buildExpiryRows(scopedInventory, 'near');
        const bestSeller = salesAnalytics.topSellers[0] || null;

        renderScope(filters, bestSeller);
        renderMetrics({
            totalSoldQty: salesAnalytics.totalSoldQty,
            stockLines: scopedInventory.filter((row) => Number(row.quantity || 0) > 0).length,
            slowMovers: slowMovers.length,
            unsoldQty: slowMoverTotals.totalOnHand,
            unsoldValue: slowMoverTotals.totalValue,
            expired: expiredRows.length,
            nearExpiry: nearExpiryRows.length,
            bestSeller
        });
        state.lastMovementData = {
            topSellers: salesAnalytics.topSellers,
            productMovementRows,
            productMovementSummary,
            slowMovers,
            slowMoverSummary: slowMoverTotals
        };
        updateUnsoldReportState(filters, slowMoverTotals, slowMovers);
        renderMovementPanel();
        renderExpired(expiredRows);
        renderNearExpiry(nearExpiryRows);

        const searchNote = filters.search ? ` matching "${filters.search}"` : '';
        setStatus(
            `Loaded ${productMovementRows.length} product movement row(s), ${slowMovers.length} unsold product row(s), ${expiredRows.length} expired row(s), and ${nearExpiryRows.length} near-expiry row(s)${searchNote}.`,
            false
        );
    } catch (error) {
        console.error('Failed to render sales and inventory insight panel:', error);
        setStatus(error.message || 'Unable to load movement and expiry insights.', true);
        state.lastMovementData = {
            topSellers: [],
            productMovementRows: [],
            productMovementSummary: null,
            slowMovers: [],
            slowMoverSummary: null
        };
        clearTables();
        updateUnsoldReportState(null, null, []);
        renderMetrics({
            totalSoldQty: 0,
            stockLines: 0,
            slowMovers: 0,
            unsoldQty: 0,
            unsoldValue: 0,
            expired: 0,
            nearExpiry: 0,
            bestSeller: null
        });
    }
}

function readFilters() {
    return {
        dateFrom: normalizeDateKey(dateFromInput?.value || ''),
        dateTo: normalizeDateKey(dateToInput?.value || ''),
        branch: String(branchFilter?.value || '').trim(),
        search: String(itemSearchInput?.value || '').trim()
    };
}

async function fetchInventoryRows(selectedBranch) {
    const branchName = String(selectedBranch || '').trim();
    if (branchName) {
        return normalizeInventoryRows(await appClient.listInventory({ branch: branchName }), branchName);
    }

    const branches = state.branchOptions.length ? state.branchOptions : [''];
    const results = await Promise.allSettled(
        branches.map((branch) => appClient.listInventory({ branch }))
    );
    const fulfilledRows = [];
    const failures = [];

    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            fulfilledRows.push(...normalizeInventoryRows(result.value, branches[index]));
            return;
        }
        failures.push(result.reason);
    });

    if (!fulfilledRows.length && failures.length) {
        throw failures[0];
    }

    return dedupeInventoryRows(fulfilledRows);
}

function normalizeInventoryRows(rows, fallbackBranch = '') {
    if (!Array.isArray(rows)) {
        return [];
    }

    return rows.map((row) => ({
        ...row,
        branch: String(row?.branch || fallbackBranch || '').trim(),
        quantity: Number(row?.quantity || 0),
        catalog_price: Number(row?.catalog_price || 0),
        expiration_date: normalizeDateKey(row?.expiration_date || ''),
        item_name: String(row?.item_name || '').trim(),
        item_code: String(row?.item_code || '').trim(),
        inventory_unit: String(row?.inventory_unit || '').trim(),
        item_type: String(row?.item_type || '').trim()
    }));
}

function dedupeInventoryRows(rows) {
    const seen = new Set();
    return rows.filter((row) => {
        const key = `${normalizeToken(row.branch)}::${normalizeToken(row.inventory_id)}::${normalizeToken(row.item_code || row.item_name)}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function filterSalesRows(rows, search) {
    const query = normalizeToken(search);
    if (!query) {
        return rows;
    }

    return rows.filter((row) => {
        const haystack = [
            row.item_sold,
            row.item_code,
            row.branch,
            row.cash_branch,
            row.sales_representative,
            row.admin_name
        ].map((value) => normalizeToken(value)).join(' ');
        return haystack.includes(query);
    });
}

function filterInventoryRows(rows, search) {
    const query = normalizeToken(search);
    if (!query) {
        return rows;
    }

    return rows.filter((row) => {
        const haystack = [
            row.item_name,
            row.item_code,
            row.branch,
            row.inventory_unit,
            row.item_type
        ].map((value) => normalizeToken(value)).join(' ');
        return haystack.includes(query);
    });
}

function buildSalesAnalytics(rows) {
    const byProduct = new Map();
    const byBranchProduct = new Map();
    let totalSoldQty = 0;

    rows.forEach((row) => {
        const productKey = buildProductKey(row.item_code, row.item_sold);
        const branchKey = `${normalizeToken(row.branch)}::${productKey}`;
        const quantity = Math.max(0, Number(row.quantity || 0));
        const lineSales = Math.max(0, Number(row.line_subtotal || 0));
        const saleDate = normalizeDateKey(row.sale_date || '');

        totalSoldQty += quantity;

        const productMeta = byProduct.get(productKey) || {
            itemName: String(row.item_sold || 'Unspecified item').trim() || 'Unspecified item',
            itemCode: String(row.item_code || '').trim(),
            qtySold: 0,
            lineSales: 0,
            branches: new Set(),
            lastSoldDate: ''
        };
        productMeta.qtySold += quantity;
        productMeta.lineSales += lineSales;
        if (row.branch) {
            productMeta.branches.add(String(row.branch).trim());
        }
        if (saleDate && saleDate > productMeta.lastSoldDate) {
            productMeta.lastSoldDate = saleDate;
        }
        byProduct.set(productKey, productMeta);

        const branchMeta = byBranchProduct.get(branchKey) || {
            qtySold: 0,
            lineSales: 0,
            lastSoldDate: ''
        };
        branchMeta.qtySold += quantity;
        branchMeta.lineSales += lineSales;
        if (saleDate && saleDate > branchMeta.lastSoldDate) {
            branchMeta.lastSoldDate = saleDate;
        }
        byBranchProduct.set(branchKey, branchMeta);
    });

    const topSellers = Array.from(byProduct.values()).sort((left, right) => {
        if (right.qtySold !== left.qtySold) {
            return right.qtySold - left.qtySold;
        }
        if (right.lineSales !== left.lineSales) {
            return right.lineSales - left.lineSales;
        }
        return left.itemName.localeCompare(right.itemName);
    });

    return {
        totalSoldQty,
        byProduct,
        byBranchProduct,
        topSellers
    };
}

function buildSlowMovers(rows, byBranchProduct) {
    return rows
        .filter((row) => Number(row.quantity || 0) > 0 && isUnsoldProductRow(row))
        .map((row) => {
            const branchKey = `${normalizeToken(row.branch)}::${buildProductKey(row.item_code, row.item_name)}`;
            const salesMeta = byBranchProduct.get(branchKey) || { qtySold: 0 };
            const soldQty = Number(salesMeta.qtySold || 0);
            const onHand = Number(row.quantity || 0);
            const unitPrice = Math.max(0, Number(row.catalog_price || 0));
            const remainingValue = onHand * unitPrice;

            let signal = 'With remaining stock';
            let signalClass = 'good';
            if (soldQty <= 0) {
                signal = 'No recorded sales';
                signalClass = 'danger';
            } else if (soldQty <= LOW_SALES_THRESHOLD) {
                signal = 'Minimal movement';
                signalClass = 'warn';
            } else if (soldQty < onHand) {
                signal = 'Slow-moving inventory';
                signalClass = 'muted';
            }

            return {
                itemName: row.item_name || 'Unspecified item',
                itemCode: row.item_code || '',
                inventoryUnit: row.inventory_unit || '',
                branch: row.branch || '-',
                onHand,
                soldQty,
                unitPrice,
                remainingValue,
                signal,
                signalClass
            };
        })
        .sort((left, right) => {
            if (left.soldQty !== right.soldQty) {
                return left.soldQty - right.soldQty;
            }
            if (right.remainingValue !== left.remainingValue) {
                return right.remainingValue - left.remainingValue;
            }
            if (right.onHand !== left.onHand) {
                return right.onHand - left.onHand;
            }
            return left.itemName.localeCompare(right.itemName);
        });
}

function summarizeSlowMovers(rows = []) {
    const byBranch = new Map();
    let totalOnHand = 0;
    let totalValue = 0;
    let totalItems = 0;

    rows.forEach((row) => {
        const branchName = String(row.branch || '-').trim() || '-';
        const branchMeta = byBranch.get(branchName) || {
            branch: branchName,
            itemCount: 0,
            totalOnHand: 0,
            totalValue: 0
        };

        totalItems += 1;
        totalOnHand += Number(row.onHand || 0);
        totalValue += Number(row.remainingValue || 0);

        branchMeta.itemCount += 1;
        branchMeta.totalOnHand += Number(row.onHand || 0);
        branchMeta.totalValue += Number(row.remainingValue || 0);
        byBranch.set(branchName, branchMeta);
    });

    return {
        totalItems,
        totalOnHand,
        totalValue,
        byBranch: Array.from(byBranch.values()).sort((left, right) => left.branch.localeCompare(right.branch))
    };
}

function buildProductMovementRows(rows, byProduct) {
    const movementMap = new Map();
    const salesMap = byProduct instanceof Map ? byProduct : new Map();

    salesMap.forEach((productMeta, productKey) => {
        movementMap.set(productKey, {
            itemName: productMeta.itemName || 'Unspecified item',
            itemCode: productMeta.itemCode || '',
            inventoryUnit: '',
            qtySold: Number(productMeta.qtySold || 0),
            lineSales: Number(productMeta.lineSales || 0),
            onHand: 0,
            remainingValue: 0,
            unitPrice: 0,
            branches: new Set(productMeta.branches || []),
            lastSoldDate: productMeta.lastSoldDate || '',
            signal: 'Moving product',
            signalClass: 'good'
        });
    });

    rows
        .filter((row) => isUnsoldProductRow(row))
        .forEach((row) => {
            const productKey = buildProductKey(row.item_code, row.item_name);
            const movementMeta = movementMap.get(productKey) || {
                itemName: row.item_name || 'Unspecified item',
                itemCode: row.item_code || '',
                inventoryUnit: row.inventory_unit || '',
                qtySold: 0,
                lineSales: 0,
                onHand: 0,
                remainingValue: 0,
                unitPrice: 0,
                branches: new Set(),
                lastSoldDate: '',
                signal: 'No recorded sales',
                signalClass: 'danger'
            };

            const quantityOnHand = Math.max(0, Number(row.quantity || 0));
            const unitPrice = Math.max(0, Number(row.catalog_price || 0));
            movementMeta.itemName = movementMeta.itemName || row.item_name || 'Unspecified item';
            movementMeta.itemCode = movementMeta.itemCode || row.item_code || '';
            movementMeta.inventoryUnit = movementMeta.inventoryUnit || row.inventory_unit || '';
            movementMeta.onHand += quantityOnHand;
            movementMeta.remainingValue += quantityOnHand * unitPrice;
            movementMeta.unitPrice = Math.max(Number(movementMeta.unitPrice || 0), unitPrice);
            if (row.branch) {
                movementMeta.branches.add(String(row.branch).trim());
            }
            movementMap.set(productKey, movementMeta);
        });

    return Array.from(movementMap.values())
        .map((row) => {
            const qtySold = Number(row.qtySold || 0);
            const onHand = Number(row.onHand || 0);
            let signal = 'Moving product';
            let signalClass = 'good';

            if (qtySold <= 0) {
                signal = 'No recorded sales';
                signalClass = 'danger';
            } else if (qtySold <= LOW_SALES_THRESHOLD) {
                signal = 'Minimal movement';
                signalClass = 'warn';
            } else if (onHand > 0 && qtySold < onHand) {
                signal = 'Slow-moving inventory';
                signalClass = 'muted';
            }

            return {
                itemName: row.itemName || 'Unspecified item',
                itemCode: row.itemCode || '',
                inventoryUnit: row.inventoryUnit || '',
                qtySold,
                lineSales: Number(row.lineSales || 0),
                onHand,
                remainingValue: Number(row.remainingValue || 0),
                unitPrice: Number(row.unitPrice || 0),
                branches: row.branches instanceof Set ? row.branches : new Set(),
                lastSoldDate: row.lastSoldDate || '',
                signal,
                signalClass
            };
        })
        .sort((left, right) => {
            if (right.qtySold !== left.qtySold) {
                return right.qtySold - left.qtySold;
            }
            if (right.lineSales !== left.lineSales) {
                return right.lineSales - left.lineSales;
            }
            if (right.remainingValue !== left.remainingValue) {
                return right.remainingValue - left.remainingValue;
            }
            return left.itemName.localeCompare(right.itemName);
        });
}

function summarizeProductMovementRows(rows = []) {
    const summary = {
        totalProducts: 0,
        withSales: 0,
        noSales: 0,
        slowMoving: 0
    };

    rows.forEach((row) => {
        summary.totalProducts += 1;
        if (Number(row.qtySold || 0) > 0) {
            summary.withSales += 1;
        } else {
            summary.noSales += 1;
        }

        if (row.signal === 'Minimal movement' || row.signal === 'Slow-moving inventory') {
            summary.slowMoving += 1;
        }
    });

    return summary;
}

function buildExpiryRows(rows, mode) {
    return rows
        .filter((row) => Number(row.quantity || 0) > 0)
        .map((row) => ({
            itemName: row.item_name || 'Unspecified item',
            itemCode: row.item_code || '',
            branch: row.branch || '-',
            quantity: Number(row.quantity || 0),
            expirationDate: normalizeDateKey(row.expiration_date || ''),
            daysUntilExpiration: getDaysUntilExpiration(row.expiration_date)
        }))
        .filter((row) => row.expirationDate)
        .filter((row) => (
            mode === 'expired'
                ? row.daysUntilExpiration < 0
                : row.daysUntilExpiration >= 0 && row.daysUntilExpiration <= NEAR_EXPIRY_DAYS
        ))
        .sort((left, right) => {
            if (left.daysUntilExpiration !== right.daysUntilExpiration) {
                return left.daysUntilExpiration - right.daysUntilExpiration;
            }
            return right.quantity - left.quantity;
        })
        .slice(0, 16);
}

function renderScope(filters, bestSeller) {
    activeScopeLabel.textContent = `${formatDate(filters.dateFrom)} - ${formatDate(filters.dateTo)}`;

    const details = [filters.branch || 'All Branches'];
    if (filters.search) {
        details.push(`Filter: ${filters.search}`);
    }
    if (bestSeller?.itemName) {
        details.push(`Best seller: ${bestSeller.itemName}`);
    }
    activeSummaryLabel.textContent = details.join(' | ');
}

function renderMetrics(metrics) {
    totalSoldQtyValue.textContent = formatQuantity(metrics.totalSoldQty || 0);
    stockLinesValue.textContent = formatQuantity(metrics.stockLines || 0);
    slowMoverValue.textContent = formatQuantity(metrics.slowMovers || 0);
    if (unsoldQtyValue) {
        unsoldQtyValue.textContent = formatQuantity(metrics.unsoldQty || 0);
    }
    if (unsoldValueValue) {
        unsoldValueValue.textContent = formatMoney(metrics.unsoldValue || 0);
    }
    expiredValue.textContent = formatQuantity(metrics.expired || 0);
    nearExpiryValue.textContent = formatQuantity(metrics.nearExpiry || 0);

    if (metrics.bestSeller?.itemName) {
        bestSellerValue.textContent = formatQuantity(metrics.bestSeller.qtySold || 0);
        bestSellerMeta.textContent = `${metrics.bestSeller.itemName}${metrics.bestSeller.itemCode ? ` (${metrics.bestSeller.itemCode})` : ''}`;
        return;
    }

    bestSellerValue.textContent = '-';
    bestSellerMeta.textContent = 'Top moving product in the selected period.';
}

function renderMovementPanel() {
    const movementData = state.lastMovementData || {
        topSellers: [],
        productMovementRows: [],
        productMovementSummary: null,
        slowMovers: [],
        slowMoverSummary: null
    };

    if (state.activeMovementView === MOVEMENT_VIEW_UNSOLD) {
        renderMovementPanelChrome({
            title: 'Unsold Products',
            copy: 'Product stock na may natitira pa sa branch. Kita rito ang remaining quantity, nabenta sa selected period, at estimated remaining value.',
            metaIconClass: 'fa-solid fa-box-open',
            metaLabel: 'On Hand by Branch',
            showSummary: true,
            showCopyButton: true
        });
        renderSlowMoverSummary(movementData.slowMoverSummary);
        renderSlowMovers(Array.isArray(movementData.slowMovers) ? movementData.slowMovers : []);
        return;
    }

    renderMovementPanelChrome({
        title: 'Mabenta',
        copy: 'Complete product movement list ranked by sales, with slow-moving and no-sales products included.',
        metaIconClass: 'fa-solid fa-arrow-trend-up',
        metaLabel: 'Complete Movement',
        showSummary: true,
        showCopyButton: false
    });
    renderProductMovementSummary(movementData.productMovementSummary);
    renderTopSellers(Array.isArray(movementData.productMovementRows) ? movementData.productMovementRows : []);
}

function renderMovementPanelChrome({
    title,
    copy,
    metaIconClass,
    metaLabel,
    showSummary,
    showCopyButton
}) {
    if (movementPanelTitle) {
        movementPanelTitle.textContent = title || 'Product Movement';
    }
    if (movementPanelCopy) {
        movementPanelCopy.textContent = copy || '';
    }
    if (movementPanelMeta) {
        movementPanelMeta.innerHTML = `<i class="${metaIconClass}"></i> ${appClient.escapeHtml(metaLabel || 'Movement')}`;
    }
    if (movementSummary) {
        movementSummary.classList.toggle('hidden-section', !showSummary);
        if (!showSummary) {
            movementSummary.innerHTML = '';
        }
    }
    if (copyUnsoldReportBtn) {
        copyUnsoldReportBtn.classList.toggle('hidden-section', !showCopyButton);
        copyUnsoldReportBtn.disabled = showCopyButton
            ? !String(state.lastUnsoldReportText || '').trim()
            : true;
    }

    movementViewButtons.forEach((button) => {
        const buttonView = String(button.dataset.movementView || '').trim().toLowerCase();
        button.classList.toggle('active', buttonView === state.activeMovementView);
        button.setAttribute('aria-pressed', buttonView === state.activeMovementView ? 'true' : 'false');
    });
}

function renderMovementTableHead(labels = []) {
    if (!movementTableHead) {
        return;
    }

    movementTableHead.innerHTML = `
        <tr>
            ${labels.map((label) => `<th>${appClient.escapeHtml(label)}</th>`).join('')}
        </tr>
    `;
}

function renderProductMovementSummary(summary = null) {
    if (!movementSummary) {
        return;
    }

    const safeSummary = summary && typeof summary === 'object'
        ? summary
        : { totalProducts: 0, withSales: 0, slowMoving: 0, noSales: 0 };

    const cards = [
        {
            label: 'Tracked Products',
            value: safeSummary.totalProducts || 0,
            meta: 'Products seen from sales or current stock scope.'
        },
        {
            label: 'With Sales',
            value: safeSummary.withSales || 0,
            meta: 'Products with recorded sales in the selected period.'
        },
        {
            label: 'Slow Movement',
            value: safeSummary.slowMoving || 0,
            meta: 'Products with minimal or slow movement signals.'
        },
        {
            label: 'No Sales',
            value: safeSummary.noSales || 0,
            meta: 'Products with zero recorded sales in the selected period.'
        }
    ];

    movementSummary.innerHTML = cards.map((row) => `
        <div class="summary-card">
            <span>${appClient.escapeHtml(row.label)}</span>
            <strong>${appClient.escapeHtml(formatQuantity(row.value || 0))}</strong>
            <small>${appClient.escapeHtml(row.meta)}</small>
        </div>
    `).join('');
}

function renderSlowMoverSummary(summary = null) {
    if (!movementSummary) {
        return;
    }

    const safeSummary = summary && typeof summary === 'object'
        ? summary
        : { totalItems: 0, totalOnHand: 0, totalValue: 0, byBranch: [] };

    const cards = [
        {
            label: 'Overall',
            totalOnHand: safeSummary.totalOnHand || 0,
            totalValue: safeSummary.totalValue || 0,
            itemCount: safeSummary.totalItems || 0
        },
        ...(Array.isArray(safeSummary.byBranch) ? safeSummary.byBranch : [])
    ];

    movementSummary.innerHTML = cards.map((row) => `
        <div class="summary-card">
            <span>${appClient.escapeHtml(row.branch || row.label || 'Summary')}</span>
            <strong>${appClient.escapeHtml(formatQuantity(row.totalOnHand || 0))}</strong>
            <small>${appClient.escapeHtml(`${formatMoney(row.totalValue || 0)} | ${formatQuantity(row.itemCount || 0)} item row(s)`)}</small>
        </div>
    `).join('');
}

function updateUnsoldReportState(filters = null, summary = null, rows = []) {
    state.lastUnsoldFilters = filters ? { ...filters } : null;
    state.lastUnsoldReportText = buildUnsoldReportText(filters, summary, rows);
    if (copyUnsoldReportBtn) {
        copyUnsoldReportBtn.disabled = !String(state.lastUnsoldReportText || '').trim();
    }
}

function renderTopSellers(rows) {
    renderMovementTableHead(['#', 'Item', 'Qty Sold', 'Line Sales', 'On Hand', 'Remaining Value', 'Branches', 'Last Sold', 'Signal']);

    if (!rows.length) {
        movementTableBody.innerHTML = '<tr><td colspan="9" class="empty">No product movement rows found for the selected period.</td></tr>';
        return;
    }

    movementTableBody.innerHTML = rows.map((row, index) => `
        <tr>
            <td>${index + 1}</td>
            <td class="item-cell">
                <strong>${appClient.escapeHtml(row.itemName)}</strong>
                <small>${appClient.escapeHtml(buildUnsoldProductMeta(row))}</small>
            </td>
            <td class="qty">${appClient.escapeHtml(formatQuantity(row.qtySold || 0))}</td>
            <td class="money">${appClient.escapeHtml(formatMoney(row.lineSales || 0))}</td>
            <td class="qty">${appClient.escapeHtml(formatQuantity(row.onHand || 0))}</td>
            <td class="money">${appClient.escapeHtml(formatMoney(row.remainingValue || 0))}</td>
            <td>${appClient.escapeHtml(formatBranches(row.branches))}</td>
            <td>${appClient.escapeHtml(formatDate(row.lastSoldDate))}</td>
            <td><span class="pill ${appClient.escapeHtml(row.signalClass || 'good')}">${appClient.escapeHtml(row.signal || 'Moving product')}</span></td>
        </tr>
    `).join('');
}

function renderSlowMovers(rows) {
    renderMovementTableHead(['Item', 'Branch', 'Remaining Qty', 'Qty Sold', 'Unit Price', 'Remaining Value', 'Signal']);

    if (!rows.length) {
        movementTableBody.innerHTML = '<tr><td colspan="7" class="empty">No unsold product rows found in the selected scope.</td></tr>';
        return;
    }

    movementTableBody.innerHTML = rows.map((row) => `
        <tr>
            <td class="item-cell">
                <strong>${appClient.escapeHtml(row.itemName)}</strong>
                <small>${appClient.escapeHtml(buildUnsoldProductMeta(row))}</small>
            </td>
            <td>${appClient.escapeHtml(row.branch)}</td>
            <td class="qty">${appClient.escapeHtml(formatQuantity(row.onHand))}</td>
            <td class="qty">${appClient.escapeHtml(formatQuantity(row.soldQty))}</td>
            <td class="money">${appClient.escapeHtml(formatOptionalMoney(row.unitPrice))}</td>
            <td class="money">${appClient.escapeHtml(formatMoney(row.remainingValue || 0))}</td>
            <td><span class="pill ${appClient.escapeHtml(row.signalClass)}">${appClient.escapeHtml(row.signal)}</span></td>
        </tr>
    `).join('');
}

function renderExpired(rows) {
    if (!rows.length) {
        expiredBody.innerHTML = '<tr><td colspan="5" class="empty">No expired stock rows with quantity on hand.</td></tr>';
        return;
    }

    expiredBody.innerHTML = rows.map((row) => `
        <tr>
            <td class="item-cell">
                <strong>${appClient.escapeHtml(row.itemName)}</strong>
                <small>${appClient.escapeHtml(row.itemCode || 'No item code')}</small>
            </td>
            <td>${appClient.escapeHtml(row.branch)}</td>
            <td class="qty">${appClient.escapeHtml(formatQuantity(row.quantity))}</td>
            <td>${appClient.escapeHtml(formatDate(row.expirationDate))}</td>
            <td><span class="pill danger">${appClient.escapeHtml(`${Math.abs(row.daysUntilExpiration)} day(s)`)}</span></td>
        </tr>
    `).join('');
}

function renderNearExpiry(rows) {
    if (!rows.length) {
        nearExpiryBody.innerHTML = '<tr><td colspan="5" class="empty">No stock rows expiring within the next 7 days.</td></tr>';
        return;
    }

    nearExpiryBody.innerHTML = rows.map((row) => `
        <tr>
            <td class="item-cell">
                <strong>${appClient.escapeHtml(row.itemName)}</strong>
                <small>${appClient.escapeHtml(row.itemCode || 'No item code')}</small>
            </td>
            <td>${appClient.escapeHtml(row.branch)}</td>
            <td class="qty">${appClient.escapeHtml(formatQuantity(row.quantity))}</td>
            <td>${appClient.escapeHtml(formatDate(row.expirationDate))}</td>
            <td><span class="pill warn">${appClient.escapeHtml(buildNearExpiryLabel(row.daysUntilExpiration))}</span></td>
        </tr>
    `).join('');
}

function clearTables() {
    renderMovementPanel();
    expiredBody.innerHTML = '<tr><td colspan="5" class="empty">No data available.</td></tr>';
    nearExpiryBody.innerHTML = '<tr><td colspan="5" class="empty">No data available.</td></tr>';
}

async function copyUnsoldReport() {
    const text = String(state.lastUnsoldReportText || '').trim();
    if (!text) {
        setStatus('Nothing to copy yet for the unsold products report.', true);
        return;
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            copyTextFallback(text);
        }
        setStatus('Unsold products report copied to clipboard.', false);
    } catch (error) {
        console.error('Unable to copy unsold products report:', error);
        setStatus('Copy failed. Please try again.', true);
    }
}

function copyTextFallback(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    document.execCommand('copy');
    textarea.remove();
}

function buildNearExpiryLabel(daysUntilExpiration) {
    if (daysUntilExpiration <= 0) {
        return 'Today';
    }
    return `${daysUntilExpiration} day(s)`;
}

function formatBranches(branches) {
    const values = Array.from(branches || []);
    if (!values.length) {
        return '-';
    }
    if (values.length <= 2) {
        return values.join(', ');
    }
    return `${values.slice(0, 2).join(', ')} +${values.length - 2}`;
}

function buildProductKey(itemCode, itemName) {
    const codeToken = normalizeToken(itemCode);
    if (codeToken) {
        return `code:${codeToken}`;
    }
    return `name:${normalizeToken(itemName)}`;
}

function isUnsoldProductRow(row = {}) {
    const itemType = normalizeToken(row.item_type);
    if (itemType === 'service') {
        return false;
    }
    return itemType === 'product' || Number(row.catalog_price || 0) > 0;
}

function buildUnsoldProductMeta(row = {}) {
    const details = [];
    if (row.itemCode) {
        details.push(row.itemCode);
    } else {
        details.push('No item code');
    }
    if (row.inventoryUnit) {
        details.push(row.inventoryUnit);
    }
    return details.join(' | ');
}

function buildUnsoldReportText(filters = null, summary = null, rows = []) {
    const safeFilters = filters && typeof filters === 'object' ? filters : null;
    const safeSummary = summary && typeof summary === 'object'
        ? summary
        : { totalItems: 0, totalOnHand: 0, totalValue: 0, byBranch: [] };
    const safeRows = Array.isArray(rows) ? rows : [];

    const lines = [
        'UNSOLD AND SLOW-MOVING INVENTORY REPORT',
        `Period Reviewed: ${formatDate(safeFilters?.dateFrom || '')} to ${formatDate(safeFilters?.dateTo || '')}`,
        `Branch Scope: ${String(safeFilters?.branch || '').trim() || 'All Branches'}`
    ];

    if (safeFilters?.search) {
        lines.push(`Search Filter: ${safeFilters.search}`);
    }

    lines.push('');
    lines.push('SUMMARY');
    lines.push(`- Product rows with remaining stock: ${formatQuantity(safeSummary.totalItems || 0)}`);
    lines.push(`- Total remaining quantity: ${formatQuantity(safeSummary.totalOnHand || 0)}`);
    lines.push(`- Estimated remaining value: ${formatMoney(safeSummary.totalValue || 0)}`);
    lines.push('');

    const branchRows = Array.isArray(safeSummary.byBranch) ? safeSummary.byBranch : [];
    if (branchRows.length) {
        lines.push('BRANCH BREAKDOWN');
        branchRows.forEach((row, index) => {
            lines.push(`${index + 1}. ${row.branch}`);
            lines.push(`   Rows with remaining stock: ${formatQuantity(row.itemCount || 0)}`);
            lines.push(`   Remaining quantity: ${formatQuantity(row.totalOnHand || 0)}`);
            lines.push(`   Estimated remaining value: ${formatMoney(row.totalValue || 0)}`);
        });
        lines.push('');
    }

    lines.push('DETAILED LISTING');
    if (!safeRows.length) {
        lines.push('No product rows with remaining stock were found in the selected scope.');
        return lines.join('\n');
    }

    safeRows.slice(0, 40).forEach((row, index) => {
        const unitLabel = row.inventoryUnit ? ` ${row.inventoryUnit}` : '';
        lines.push(`${String(index + 1).padStart(2, '0')}. ${row.itemName}${row.itemCode ? ` (${row.itemCode})` : ''}`);
        lines.push(`    Branch: ${row.branch}`);
        lines.push(`    On-hand quantity: ${formatQuantity(row.onHand || 0)}${unitLabel}`);
        lines.push(`    Quantity sold during period: ${formatQuantity(row.soldQty || 0)}`);
        lines.push(`    Unit price: ${formatOptionalMoney(row.unitPrice, 'Not set')}`);
        lines.push(`    Estimated remaining value: ${formatMoney(row.remainingValue || 0)}`);
        lines.push(`    Movement status: ${row.signal}`);
        lines.push('');
    });

    if (safeRows.length > 40) {
        lines.push(`Additional rows not shown: ${formatQuantity(safeRows.length - 40)}`);
    }

    return lines.join('\n');
}

function getDaysUntilExpiration(expirationDate) {
    const expiration = parseDateKey(normalizeDateKey(expirationDate));
    const today = parseDateKey(state.serverDateKey) || new Date();
    if (!expiration) {
        return Number.POSITIVE_INFINITY;
    }

    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.floor((expiration.getTime() - todayStart.getTime()) / 86400000);
}

function parseDateKey(value) {
    const normalized = normalizeDateKey(value);
    if (!normalized) {
        return null;
    }
    const [year, month, day] = normalized.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function normalizeDateKey(value) {
    const raw = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function toDateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return '';
    }
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function formatDate(value) {
    const parsed = parseDateKey(value);
    if (!parsed) {
        return '-';
    }
    return parsed.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatQuantity(value) {
    return Number(value || 0).toLocaleString('en-PH', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

function formatMoney(value) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Number(value || 0));
}

function formatOptionalMoney(value, fallback = '-') {
    const amount = Number(value || 0);
    if (!(amount > 0)) {
        return fallback;
    }
    return formatMoney(amount);
}

function normalizeToken(value) {
    return String(value || '').trim().toLowerCase();
}

function setStatus(message, isError) {
    if (!panelStatus) {
        return;
    }
    panelStatus.textContent = message || '';
    panelStatus.className = `status${isError ? ' error' : ''}`;
}
