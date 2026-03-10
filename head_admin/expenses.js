const appClient = window.appClient;
const expensesPageTitle = document.getElementById('expensesPageTitle');
const expensesPageCopy = document.getElementById('expensesPageCopy');

const MODULES = {
    expense: {
        key: 'expense',
        prefix: 'expense',
        label: 'Expense',
        pluralLabel: 'Expenses',
        columnCount: 6,
        dateColumn: 'expense_date',
        datePayloadKey: 'expenseDate',
        searchPlaceholder: 'expense',
        badgeWarn: false,
        list: (filters) => appClient.listExpenses(filters),
        add: (payload) => appClient.addExpense(payload),
        update: (entryId, payload) => appClient.updateExpense(entryId, payload),
        remove: (entryId) => appClient.deleteExpense(entryId),
        clear: () => appClient.clearExpenses()
    },
    cashIncome: {
        key: 'cashIncome',
        prefix: 'cashIncome',
        label: 'Cash Income',
        pluralLabel: 'Cash Income',
        columnCount: 7,
        dateColumn: 'income_date',
        datePayloadKey: 'incomeDate',
        searchPlaceholder: 'cash income',
        badgeWarn: true,
        list: (filters) => appClient.listCashIncome(filters),
        add: (payload) => appClient.addCashIncome(payload),
        update: (entryId, payload) => appClient.updateCashIncome(entryId, payload),
        remove: (entryId) => appClient.deleteCashIncome(entryId),
        clear: () => appClient.clearCashIncome()
    }
};

const state = {
    references: null,
    modules: {},
    workspaceConfig: {}
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({
        role: 'head_admin',
        allowEmployeeFeature: 'expenses'
    });
    if (!session) {
        return;
    }
    appClient.attachEmployeeBackButton(session);
    await applyWorkspaceConfig();

    Object.values(MODULES).forEach((module) => {
        state.modules[module.key] = {
            editingId: null,
            syncingPeriod: false,
            items: [],
            refs: getModuleRefs(module.prefix)
        };
    });

    bindEvents();
    await loadReferences();

    Object.values(MODULES).forEach((module) => {
        resetForm(module.key);
        applyPeriodPreset(module.key, 'this_month', { load: false });
    });

    await Promise.all(Object.keys(MODULES).map((moduleKey) => loadRecords(moduleKey)));
}

async function applyWorkspaceConfig() {
    try {
        const bootstrap = await appClient.getBootstrap();
        state.workspaceConfig = bootstrap?.workspaceConfig || {};
    } catch (_error) {
        state.workspaceConfig = {};
    }

    const labels = state.workspaceConfig?.labels || {};
    const expenses = state.workspaceConfig?.expenses || {};

    if (expensesPageTitle) {
        expensesPageTitle.textContent = expenses.title || labels.expensesPageTitle || 'Expenses and Cash Income';
    }
    if (expensesPageCopy) {
        expensesPageCopy.textContent = expenses.copy
            || 'Dito mo na puwedeng i-manage ang branch expenses at cash income records per branch, kasama ang sales-linked at manual entries. Puwede nang mag-add, edit, delete, at reset-all ng entries per module.';
    }
}

function getModuleRefs(prefix) {
    return {
        editorTitle: document.getElementById(`${prefix}EditorTitle`),
        modeBadge: document.getElementById(`${prefix}ModeBadge`),
        dateInput: document.getElementById(`${prefix}DateInput`),
        branchInput: document.getElementById(`${prefix}BranchInput`),
        aboutInput: document.getElementById(`${prefix}AboutInput`),
        amountInput: document.getElementById(`${prefix}AmountInput`),
        noteInput: document.getElementById(`${prefix}NoteInput`),
        statusInput: document.getElementById(`${prefix}StatusInput`),
        saveBtn: document.getElementById(`save${capitalize(prefix)}Btn`),
        resetBtn: document.getElementById(`reset${capitalize(prefix)}Btn`),
        clearBtn: document.getElementById(`clear${capitalize(prefix)}${prefix === 'expense' ? 's' : ''}Btn`) || document.getElementById(`clear${capitalize(prefix)}Btn`),
        formStatus: document.getElementById(`${prefix}FormStatus`),
        periodFilter: document.getElementById(`${prefix}PeriodFilter`),
        dateFromFilter: document.getElementById(`${prefix}DateFromFilter`),
        dateToFilter: document.getElementById(`${prefix}DateToFilter`),
        branchFilter: document.getElementById(`${prefix}BranchFilter`),
        searchInput: document.getElementById(`${prefix}SearchInput`),
        applyFiltersBtn: document.getElementById(`apply${capitalize(prefix)}FiltersBtn`),
        resetFiltersBtn: document.getElementById(`reset${capitalize(prefix)}FiltersBtn`),
        reportStatus: document.getElementById(`${prefix}ReportStatus`),
        summaryGrid: document.getElementById(`${prefix}SummaryGrid`),
        totalValue: document.getElementById(`${prefix}TotalValue`),
        pendingValue: document.getElementById(`${prefix}PendingValue`),
        tableBody: document.getElementById(`${prefix}TableBody`)
    };
}

function bindEvents() {
    Object.values(MODULES).forEach((module) => {
        const moduleState = state.modules[module.key];
        const refs = moduleState.refs;

        refs.saveBtn.addEventListener('click', () => saveEntry(module.key));
        refs.resetBtn.addEventListener('click', () => resetForm(module.key));
        refs.clearBtn.addEventListener('click', () => clearAllEntries(module.key));
        refs.applyFiltersBtn.addEventListener('click', () => loadRecords(module.key));
        refs.resetFiltersBtn.addEventListener('click', () => resetFilters(module.key));
        refs.periodFilter.addEventListener('change', () => applyPeriodPreset(module.key, refs.periodFilter.value || 'this_month'));
        refs.tableBody.addEventListener('click', (event) => handleTableAction(module.key, event));

        [refs.dateFromFilter, refs.dateToFilter].forEach((input) => {
            input.addEventListener('change', () => {
                if (moduleState.syncingPeriod) {
                    return;
                }

                refs.periodFilter.value = 'custom';
            });
        });

        refs.searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                loadRecords(module.key);
            }
        });
    });
}

async function loadReferences() {
    try {
        const references = await appClient.getSalesReferences();
        state.references = references || {};

        Object.values(MODULES).forEach((module) => {
            const refs = state.modules[module.key].refs;
            populateSelect(refs.branchInput, state.references.branches || []);
            populateSelect(refs.branchFilter, state.references.branches || [], true, 'All Branches');
            setFormStatus(module.key, `${module.label} form ready.`, false);
            setReportStatus(module.key, `${module.label} filters ready.`, false);
        });
    } catch (error) {
        console.error('Failed to load references:', error);
        Object.values(MODULES).forEach((module) => {
            setFormStatus(module.key, error.message || 'Unable to load references.', true);
            setReportStatus(module.key, error.message || 'Unable to load references.', true);
        });
    }
}

function populateSelect(select, values, includeBlank = false, blankLabel = 'Select option') {
    select.innerHTML = '';

    if (includeBlank) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = blankLabel;
        select.appendChild(option);
    }

    values.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
}

function resetForm(moduleKey) {
    const module = MODULES[moduleKey];
    const moduleState = state.modules[moduleKey];
    const refs = moduleState.refs;

    moduleState.editingId = null;
    refs.dateInput.value = new Date().toISOString().slice(0, 10);
    refs.dateInput.value = toDateInputValue(new Date());
    refs.branchInput.value = state.references?.branches?.[0] || '';
    refs.aboutInput.value = '';
    refs.amountInput.value = '';
    refs.noteInput.value = '';
    if (refs.statusInput) {
        refs.statusInput.value = 'Confirmed';
    }
    refs.editorTitle.textContent = `Add ${module.label}`;
    refs.saveBtn.textContent = `Save ${module.label}`;
    refs.resetBtn.textContent = 'Clear';
    updateModeBadge(moduleKey, false);
    setFormStatus(moduleKey, `${module.label} form cleared.`, false);
}

async function saveEntry(moduleKey) {
    const module = MODULES[moduleKey];
    const moduleState = state.modules[moduleKey];
    const refs = moduleState.refs;
    const payload = {
        branch: refs.branchInput.value,
        about: refs.aboutInput.value.trim(),
        amount: refs.amountInput.value,
        note: refs.noteInput.value.trim()
    };
    if (refs.statusInput) {
        payload.confirmationStatus = refs.statusInput.value;
    }
    payload[module.datePayloadKey] = refs.dateInput.value;

    if (!payload[module.datePayloadKey]) {
        setFormStatus(moduleKey, `${module.label} date is required.`, true);
        return;
    }

    if (!payload.branch) {
        setFormStatus(moduleKey, 'Branch is required.', true);
        return;
    }

    if (!payload.about) {
        setFormStatus(moduleKey, `${module.label} about is required.`, true);
        return;
    }

    if (Number(payload.amount || 0) <= 0) {
        setFormStatus(moduleKey, `${module.label} amount must be greater than zero.`, true);
        return;
    }

    refs.saveBtn.disabled = true;
    setFormStatus(moduleKey, moduleState.editingId ? `Updating ${module.searchPlaceholder}...` : `Saving ${module.searchPlaceholder}...`, false);

    try {
        if (moduleState.editingId) {
            await module.update(moduleState.editingId, payload);
            resetForm(moduleKey);
            setFormStatus(moduleKey, `${module.label} updated successfully.`, false);
        } else {
            await module.add(payload);
            resetForm(moduleKey);
            setFormStatus(moduleKey, `${module.label} saved successfully.`, false);
        }

        await loadRecords(moduleKey);
    } catch (error) {
        console.error(`Failed to save ${module.searchPlaceholder}:`, error);
        setFormStatus(moduleKey, error.message || `Unable to save ${module.searchPlaceholder}.`, true);
    } finally {
        refs.saveBtn.disabled = false;
    }
}

async function loadRecords(moduleKey) {
    const module = MODULES[moduleKey];
    const refs = state.modules[moduleKey].refs;

    setReportStatus(moduleKey, `Loading ${module.searchPlaceholder} records...`, false);

    try {
        const payload = await module.list({
            dateFrom: refs.dateFromFilter.value,
            dateTo: refs.dateToFilter.value,
            branch: refs.branchFilter.value,
            search: refs.searchInput.value.trim()
        });

        state.modules[moduleKey].items = payload.items || [];
        renderSummary(moduleKey, payload.summary || {});
        renderTable(moduleKey, payload.items || []);
        setReportStatus(
            moduleKey,
            `Loaded ${payload.summary?.totalCount || 0} ${module.searchPlaceholder} entr${payload.summary?.totalCount === 1 ? 'y' : 'ies'}.`,
            false
        );
    } catch (error) {
        console.error(`Failed to load ${module.searchPlaceholder}:`, error);
        state.modules[moduleKey].items = [];
        renderSummary(moduleKey, {});
        renderTable(moduleKey, []);
        setReportStatus(moduleKey, error.message || `Unable to load ${module.searchPlaceholder} records.`, true);
    }
}

function renderSummary(moduleKey, summary) {
    const refs = state.modules[moduleKey].refs;
    refs.totalValue.textContent = summary.totalAmountDisplay || formatMoney(0);
    renderBranchSummaryCards(moduleKey, summary);
    if (refs.pendingValue) {
        refs.pendingValue.textContent = summary.pendingAmountDisplay || formatMoney(0);
    }
}

function renderBranchSummaryCards(moduleKey, summary) {
    const refs = state.modules[moduleKey].refs;
    const grid = refs.summaryGrid;
    if (!grid) {
        return;
    }

    grid.querySelectorAll('[data-branch-card="true"]').forEach((card) => card.remove());

    const branchRows = getBranchSummaryRows(summary);
    if (!branchRows.length) {
        return;
    }

    const insertionPoint = grid.querySelector('[data-static-card="pending"]') || null;
    const fragment = document.createDocumentFragment();

    branchRows.forEach((row) => {
        const card = document.createElement('article');
        card.className = `summary-card${moduleKey === 'cashIncome' ? ' warn' : ''}`;
        card.dataset.branchCard = 'true';

        const label = document.createElement('span');
        label.textContent = row.label || 'Branch';

        const value = document.createElement('strong');
        value.textContent = row.displayValue || formatMoney(row.value || 0);

        card.appendChild(label);
        card.appendChild(value);
        fragment.appendChild(card);
    });

    grid.insertBefore(fragment, insertionPoint);
}

function getBranchSummaryRows(summary) {
    if (Array.isArray(summary.branchBreakdown) && summary.branchBreakdown.length) {
        return summary.branchBreakdown
            .filter((item) => String(item?.label || '').trim())
            .map((item) => ({
                label: String(item.label || '').trim(),
                value: Number(item.value || 0),
                displayValue: item.displayValue || formatMoney(item.value || 0)
            }));
    }

    const byBranch = summary.byBranch && typeof summary.byBranch === 'object'
        ? summary.byBranch
        : {};

    return Object.entries(byBranch)
        .filter(([label]) => String(label || '').trim())
        .map(([label, value]) => ({
            label: String(label || '').trim(),
            value: Number(value || 0),
            displayValue: formatMoney(value || 0)
        }));
}

function renderTable(moduleKey, rows) {
    const module = MODULES[moduleKey];
    const refs = state.modules[moduleKey].refs;

    if (!rows.length) {
        refs.tableBody.innerHTML = `<tr><td colspan="${module.columnCount || 6}" class="empty">No ${module.searchPlaceholder} records found for the selected filters.</td></tr>`;
        return;
    }

    refs.tableBody.innerHTML = rows.map((row) => {
        if (moduleKey === 'cashIncome') {
            const status = normalizeCashIncomeStatus(row.confirmation_status || row.confirmationStatus || 'Confirmed');
            const isAuto = Number(row.auto_generated || 0) === 1 || String(row.source || '').toLowerCase() === 'auto';
            return `
                <tr>
                    <td>${appClient.escapeHtml(formatDate(row[module.dateColumn]))}</td>
                    <td>${appClient.escapeHtml(row.branch || '-')}</td>
                    <td>
                        <div class="cell-copy">
                            <strong>${appClient.escapeHtml(row.about || '-')}</strong>
                            <small>${appClient.escapeHtml(isAuto ? `Auto-linked ${row.linked_order_number || row.linked_receipt_number || ''}`.trim() : 'Manual entry')}</small>
                        </div>
                    </td>
                    <td>${appClient.escapeHtml(formatMoney(row.amount || 0))}</td>
                    <td><span class="status-pill ${status.toLowerCase()}">${appClient.escapeHtml(status)}</span></td>
                    <td class="note-cell">${appClient.escapeHtml(row.note || '-')}</td>
                    <td>
                        <div class="table-actions">
                            ${status === 'Pending' ? `<button type="button" class="primary-btn tiny-btn" data-action="confirm" data-id="${row.id}">Confirm</button>` : ''}
                            <button type="button" class="secondary-btn tiny-btn" data-action="edit" data-id="${row.id}">Edit</button>
                            ${isAuto ? '' : `<button type="button" class="danger-btn tiny-btn" data-action="delete" data-id="${row.id}">Delete</button>`}
                        </div>
                    </td>
                </tr>
            `;
        }

        return `
            <tr>
                <td>${appClient.escapeHtml(formatDate(row[module.dateColumn]))}</td>
                <td>${appClient.escapeHtml(row.branch || '-')}</td>
                <td>${appClient.escapeHtml(row.about || '-')}</td>
                <td>${appClient.escapeHtml(formatMoney(row.amount || 0))}</td>
                <td class="note-cell">${appClient.escapeHtml(row.note || '-')}</td>
                <td>
                    <div class="table-actions">
                        <button type="button" class="secondary-btn tiny-btn" data-action="edit" data-id="${row.id}">Edit</button>
                        <button type="button" class="danger-btn tiny-btn" data-action="delete" data-id="${row.id}">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function handleTableAction(moduleKey, event) {
    const button = event.target.closest('button[data-action][data-id]');
    if (!button) {
        return;
    }

    const action = button.dataset.action;
    const entryId = Number(button.dataset.id);

    if (!Number.isInteger(entryId) || entryId <= 0) {
        return;
    }

    if (action === 'edit') {
        beginEdit(moduleKey, entryId);
        return;
    }

    if (action === 'confirm') {
        confirmCashIncomeEntry(entryId);
        return;
    }

    if (action === 'delete') {
        deleteEntry(moduleKey, entryId);
    }
}

function beginEdit(moduleKey, entryId) {
    const module = MODULES[moduleKey];
    const moduleState = state.modules[moduleKey];
    const refs = moduleState.refs;
    const row = moduleState.items.find((item) => Number(item.id) === Number(entryId));

    if (!row) {
        setFormStatus(moduleKey, `${module.label} entry not found.`, true);
        return;
    }

    moduleState.editingId = entryId;
    refs.dateInput.value = row[module.dateColumn] || new Date().toISOString().slice(0, 10);
    refs.dateInput.value = row[module.dateColumn] || toDateInputValue(new Date());
    refs.branchInput.value = row.branch || '';
    refs.aboutInput.value = row.about || '';
    refs.amountInput.value = String(Number(row.amount || 0));
    refs.noteInput.value = row.note || '';
    if (refs.statusInput) {
        refs.statusInput.value = normalizeCashIncomeStatus(row.confirmation_status || row.confirmationStatus || 'Confirmed');
    }
    refs.editorTitle.textContent = `Edit ${module.label}`;
    refs.saveBtn.textContent = `Update ${module.label}`;
    refs.resetBtn.textContent = 'Cancel Edit';
    updateModeBadge(moduleKey, true, row.id);
    setFormStatus(moduleKey, `Editing ${module.searchPlaceholder} entry #${row.id}.`, false);
    refs.aboutInput.focus();
}

async function deleteEntry(moduleKey, entryId) {
    const module = MODULES[moduleKey];

    if (!window.confirm(`Delete this ${module.searchPlaceholder} entry?`)) {
        return;
    }

    try {
        await module.remove(entryId);
        if (state.modules[moduleKey].editingId === entryId) {
            resetForm(moduleKey);
        }
        setReportStatus(moduleKey, `${module.label} entry deleted.`, false);
        await loadRecords(moduleKey);
    } catch (error) {
        console.error(`Failed to delete ${module.searchPlaceholder}:`, error);
        setReportStatus(moduleKey, error.message || `Unable to delete ${module.searchPlaceholder}.`, true);
    }
}

async function confirmCashIncomeEntry(entryId) {
    try {
        await MODULES.cashIncome.update(entryId, { confirmationStatus: 'Confirmed' });
        await loadRecords('cashIncome');
        if (state.modules.cashIncome.editingId === entryId) {
            beginEdit('cashIncome', entryId);
        }
        setReportStatus('cashIncome', 'Cash income entry confirmed.', false);
    } catch (error) {
        console.error('Failed to confirm cash income:', error);
        setReportStatus('cashIncome', error.message || 'Unable to confirm cash income entry.', true);
    }
}

async function clearAllEntries(moduleKey) {
    const module = MODULES[moduleKey];
    const promptMessage = moduleKey === 'cashIncome'
        ? 'Delete all manual cash income records? Auto-linked sales cash and collection entries will stay.'
        : `Delete all ${module.pluralLabel.toLowerCase()} records? This cannot be undone.`;

    if (!window.confirm(promptMessage)) {
        return;
    }

    try {
        const result = await module.clear();
        resetForm(moduleKey);
        await loadRecords(moduleKey);
        setReportStatus(moduleKey, result.message || `${module.pluralLabel} records cleared.`, false);
    } catch (error) {
        console.error(`Failed to clear ${module.searchPlaceholder}:`, error);
        setReportStatus(moduleKey, error.message || `Unable to clear ${module.pluralLabel.toLowerCase()} records.`, true);
    }
}

function resetFilters(moduleKey) {
    const refs = state.modules[moduleKey].refs;
    refs.branchFilter.value = '';
    refs.searchInput.value = '';
    applyPeriodPreset(moduleKey, 'this_month', { load: false });
    loadRecords(moduleKey);
}

function applyPeriodPreset(moduleKey, period, { load = true } = {}) {
    const moduleState = state.modules[moduleKey];
    const refs = moduleState.refs;
    const preset = getPeriodRange(moduleKey, period);

    moduleState.syncingPeriod = true;
    refs.periodFilter.value = preset.period;
    refs.dateFromFilter.value = preset.dateFrom;
    refs.dateToFilter.value = preset.dateTo;
    moduleState.syncingPeriod = false;

    if (load) {
        loadRecords(moduleKey);
    }
}

function getPeriodRange(moduleKey, period) {
    const refs = state.modules[moduleKey].refs;
    const today = new Date();
    const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (period === 'all') {
        return {
            period: 'all',
            dateFrom: '',
            dateTo: ''
        };
    }

    if (period === 'this_week') {
        const weekStart = new Date(currentDate.getTime());
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weekEnd = new Date(weekStart.getTime());
        weekEnd.setDate(weekEnd.getDate() + 6);
        return {
            period: 'this_week',
            dateFrom: toDateInputValue(weekStart),
            dateTo: toDateInputValue(weekEnd)
        };
    }

    if (period === 'custom') {
        return {
            period: 'custom',
            dateFrom: refs.dateFromFilter.value || '',
            dateTo: refs.dateToFilter.value || ''
        };
    }

    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    return {
        period: 'this_month',
        dateFrom: toDateInputValue(monthStart),
        dateTo: toDateInputValue(monthEnd)
    };
}

function updateModeBadge(moduleKey, isEditing, entryId = '') {
    const module = MODULES[moduleKey];
    const refs = state.modules[moduleKey].refs;

    refs.modeBadge.textContent = isEditing ? `Edit Mode #${entryId}` : 'Add Mode';
    refs.modeBadge.classList.toggle('warn', Boolean(module.badgeWarn || isEditing));
}

function setFormStatus(moduleKey, message, isError) {
    const status = state.modules[moduleKey].refs.formStatus;
    status.textContent = message;
    status.classList.toggle('error', Boolean(isError));
}

function setReportStatus(moduleKey, message, isError) {
    const status = state.modules[moduleKey].refs.reportStatus;
    status.textContent = message;
    status.classList.toggle('error', Boolean(isError));
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatDate(value) {
    if (!value) {
        return '-';
    }

    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime())
        ? String(value)
        : parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
}

function toDateInputValue(value) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeCashIncomeStatus(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'pending') {
        return 'Pending';
    }
    if (normalized === 'cancelled') {
        return 'Cancelled';
    }
    return 'Confirmed';
}
