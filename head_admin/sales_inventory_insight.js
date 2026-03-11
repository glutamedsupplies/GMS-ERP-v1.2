const appClient = window.appClient;

const NEAR_EXPIRY_DAYS = 7;
const LOW_SALES_THRESHOLD = 2;

const rangePresetInput = document.getElementById('rangePreset');
const dateFromInput = document.getElementById('dateFrom');
const dateToInput = document.getElementById('dateTo');
const branchFilter = document.getElementById('branchFilter');
const itemSearchInput = document.getElementById('itemSearch');
const applyFiltersBtn = document.getElementById('applyFiltersBtn');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const panelStatus = document.getElementById('panelStatus');

const activeScopeLabel = document.getElementById('activeScopeLabel');
const activeSummaryLabel = document.getElementById('activeSummaryLabel');
const totalSoldQtyValue = document.getElementById('totalSoldQtyValue');
const stockLinesValue = document.getElementById('stockLinesValue');
const slowMoverValue = document.getElementById('slowMoverValue');
const expiredValue = document.getElementById('expiredValue');
const nearExpiryValue = document.getElementById('nearExpiryValue');
const bestSellerValue = document.getElementById('bestSellerValue');
const bestSellerMeta = document.getElementById('bestSellerMeta');

const topSellerBody = document.getElementById('topSellerBody');
const slowMoverBody = document.getElementById('slowMoverBody');
const expiredBody = document.getElementById('expiredBody');
const nearExpiryBody = document.getElementById('nearExpiryBody');

const state = {
    bootstrap: null,
    branchOptions: [],
    renderToken: 0,
    serverDateKey: ''
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
        const expiredRows = buildExpiryRows(scopedInventory, 'expired');
        const nearExpiryRows = buildExpiryRows(scopedInventory, 'near');
        const bestSeller = salesAnalytics.topSellers[0] || null;

        renderScope(filters, bestSeller);
        renderMetrics({
            totalSoldQty: salesAnalytics.totalSoldQty,
            stockLines: scopedInventory.filter((row) => Number(row.quantity || 0) > 0).length,
            slowMovers: slowMovers.length,
            expired: expiredRows.length,
            nearExpiry: nearExpiryRows.length,
            bestSeller
        });
        renderTopSellers(salesAnalytics.topSellers);
        renderSlowMovers(slowMovers);
        renderExpired(expiredRows);
        renderNearExpiry(nearExpiryRows);

        const searchNote = filters.search ? ` matching "${filters.search}"` : '';
        setStatus(
            `Loaded ${salesAnalytics.topSellers.length} sold item group(s), ${slowMovers.length} slow mover(s), ${expiredRows.length} expired row(s), and ${nearExpiryRows.length} near-expiry row(s)${searchNote}.`,
            false
        );
    } catch (error) {
        console.error('Failed to render sales and inventory insight panel:', error);
        setStatus(error.message || 'Unable to load movement and expiry insights.', true);
        clearTables();
        renderMetrics({
            totalSoldQty: 0,
            stockLines: 0,
            slowMovers: 0,
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
        byBranchProduct,
        topSellers
    };
}

function buildSlowMovers(rows, byBranchProduct) {
    return rows
        .filter((row) => Number(row.quantity || 0) > 0)
        .map((row) => {
            const branchKey = `${normalizeToken(row.branch)}::${buildProductKey(row.item_code, row.item_name)}`;
            const salesMeta = byBranchProduct.get(branchKey) || { qtySold: 0 };
            const soldQty = Number(salesMeta.qtySold || 0);
            const onHand = Number(row.quantity || 0);

            let signal = 'Moving';
            let signalClass = 'good';
            if (soldQty <= 0) {
                signal = 'No sales';
                signalClass = 'danger';
            } else if (soldQty <= LOW_SALES_THRESHOLD) {
                signal = 'Very low sales';
                signalClass = 'warn';
            } else if (soldQty < onHand) {
                signal = 'Slow vs stock';
                signalClass = 'muted';
            }

            return {
                itemName: row.item_name || 'Unspecified item',
                itemCode: row.item_code || '',
                branch: row.branch || '-',
                onHand,
                soldQty,
                signal,
                signalClass,
                flagged: soldQty <= LOW_SALES_THRESHOLD || soldQty < onHand
            };
        })
        .filter((row) => row.flagged)
        .sort((left, right) => {
            if (left.soldQty !== right.soldQty) {
                return left.soldQty - right.soldQty;
            }
            if (right.onHand !== left.onHand) {
                return right.onHand - left.onHand;
            }
            return left.itemName.localeCompare(right.itemName);
        })
        .slice(0, 16);
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

function renderTopSellers(rows) {
    if (!rows.length) {
        topSellerBody.innerHTML = '<tr><td colspan="6" class="empty">No sold items found for the selected period.</td></tr>';
        return;
    }

    topSellerBody.innerHTML = rows.slice(0, 15).map((row, index) => `
        <tr>
            <td>${index + 1}</td>
            <td class="item-cell">
                <strong>${appClient.escapeHtml(row.itemName)}</strong>
                <small>${appClient.escapeHtml(row.itemCode || 'No item code')}</small>
            </td>
            <td class="qty">${appClient.escapeHtml(formatQuantity(row.qtySold || 0))}</td>
            <td class="money">${appClient.escapeHtml(formatMoney(row.lineSales || 0))}</td>
            <td>${appClient.escapeHtml(formatBranches(row.branches))}</td>
            <td>${appClient.escapeHtml(formatDate(row.lastSoldDate))}</td>
        </tr>
    `).join('');
}

function renderSlowMovers(rows) {
    if (!rows.length) {
        slowMoverBody.innerHTML = '<tr><td colspan="5" class="empty">No slow-moving items found in the selected scope.</td></tr>';
        return;
    }

    slowMoverBody.innerHTML = rows.map((row) => `
        <tr>
            <td class="item-cell">
                <strong>${appClient.escapeHtml(row.itemName)}</strong>
                <small>${appClient.escapeHtml(row.itemCode || 'No item code')}</small>
            </td>
            <td>${appClient.escapeHtml(row.branch)}</td>
            <td class="qty">${appClient.escapeHtml(formatQuantity(row.onHand))}</td>
            <td class="qty">${appClient.escapeHtml(formatQuantity(row.soldQty))}</td>
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
    topSellerBody.innerHTML = '<tr><td colspan="6" class="empty">No data available.</td></tr>';
    slowMoverBody.innerHTML = '<tr><td colspan="5" class="empty">No data available.</td></tr>';
    expiredBody.innerHTML = '<tr><td colspan="5" class="empty">No data available.</td></tr>';
    nearExpiryBody.innerHTML = '<tr><td colspan="5" class="empty">No data available.</td></tr>';
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
