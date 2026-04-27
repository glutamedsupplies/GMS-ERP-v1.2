const appClient = window.appClient;
const expensesPageTitle = document.getElementById('expensesPageTitle');
const expensesPageCopy = document.getElementById('expensesPageCopy');
const moduleSwitchButtons = Array.from(document.querySelectorAll('[data-module-switch]'));
const moduleJumpButtons = Array.from(document.querySelectorAll('[data-module-jump][data-jump-target]'));
const expenseCopySummaryBtn = document.getElementById('expenseCopySummaryBtn');
const expenseSavePdfBtn = document.getElementById('expenseSavePdfBtn');
const expenseExportExcelBtn = document.getElementById('expenseExportExcelBtn');
const expenseExportStatus = document.getElementById('expenseExportStatus');

const MODULES = {
    expense: {
        key: 'expense',
        prefix: 'expense',
        label: 'Expense',
        pluralLabel: 'Expenses',
        columnCount: 5,
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
        columnCount: 5,
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

const FINANCE_BRANCH_STORAGE_PREFIX = 'gms:last-finance-branch';

const state = {
    session: null,
    references: null,
    modules: {},
    workspaceConfig: {},
    activeModule: 'expense'
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
    state.session = session;

    Object.values(MODULES).forEach((module) => {
        state.modules[module.key] = {
            editingId: null,
            syncingPeriod: false,
            items: [],
            summary: {},
            preferredBranch: '',
            refs: getModuleRefs(module.prefix)
        };
    });

    bindEvents();
    await Promise.all([
        applyWorkspaceConfig(),
        loadReferences()
    ]);

    Object.values(MODULES).forEach((module) => {
        resetForm(module.key);
        applyPeriodPreset(module.key, 'this_month', { load: false });
    });

    setActiveModule(state.activeModule);
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
            || 'Dito mo na puwedeng i-manage ang branch expenses at cash income records per branch, kasama ang sales-linked at manual entries. Puwede nang mag-add, edit, at delete ng individual entries.';
    }
}

function getModuleRefs(prefix) {
    return {
        manager: document.getElementById(`${prefix}Manager`),
        formPanel: document.getElementById(`${prefix}FormPanel`),
        recordsPanel: document.getElementById(`${prefix}RecordsPanel`),
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
        countValue: document.getElementById(`${prefix}CountValue`),
        totalValue: document.getElementById(`${prefix}TotalValue`),
        cashLeftValue: document.getElementById(`${prefix}CashLeftValue`),
        pendingValue: document.getElementById(`${prefix}PendingValue`),
        tableBody: document.getElementById(`${prefix}TableBody`)
    };
}

function bindEvents() {
    moduleSwitchButtons.forEach((button) => {
        button.addEventListener('click', () => setActiveModule(button.dataset.moduleSwitch || 'expense', { scrollIntoView: true }));
    });

    moduleJumpButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const moduleKey = button.dataset.moduleJump || state.activeModule;
            const target = button.dataset.jumpTarget || 'form';
            setActiveModule(moduleKey);
            scrollModulePanelIntoView(moduleKey, target);
        });
    });

    expenseCopySummaryBtn?.addEventListener('click', copyExpenseBreakdownSummary);
    expenseSavePdfBtn?.addEventListener('click', saveExpenseBreakdownAsPdf);
    expenseExportExcelBtn?.addEventListener('click', downloadExpenseBreakdownExcel);

    Object.values(MODULES).forEach((module) => {
        const moduleState = state.modules[module.key];
        const refs = moduleState.refs;

        refs.saveBtn.addEventListener('click', () => saveEntry(module.key));
        refs.resetBtn.addEventListener('click', () => resetForm(module.key));
        refs.clearBtn.addEventListener('click', () => deleteSelectedEntry(module.key));
        syncSelectedDeleteButton(module.key);
        refs.applyFiltersBtn.addEventListener('click', () => loadRecords(module.key));
        refs.resetFiltersBtn.addEventListener('click', () => resetFilters(module.key));
        refs.periodFilter.addEventListener('change', () => applyPeriodPreset(module.key, refs.periodFilter.value || 'this_month'));
        refs.tableBody.addEventListener('click', (event) => handleTableAction(module.key, event));
        refs.branchInput.addEventListener('change', () => rememberBranchPreference(module.key, refs.branchInput.value));

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

function getPreferredBranch(moduleKey) {
    const branches = getAvailableBranches();
    if (!branches.length) {
        return '';
    }

    return findMatchingBranch(state.modules[moduleKey]?.preferredBranch)
        || findMatchingBranch(getStoredBranchPreference(moduleKey))
        || branches[0];
}

function rememberBranchPreference(moduleKey, branch) {
    const storageKey = getBranchPreferenceStorageKey(moduleKey);
    const matchedBranch = findMatchingBranch(branch);
    if (!storageKey || !matchedBranch) {
        return;
    }

    if (state.modules[moduleKey]) {
        state.modules[moduleKey].preferredBranch = matchedBranch;
    }

    try {
        window.localStorage?.setItem(storageKey, matchedBranch);
    } catch (_error) {
        // Ignore local storage errors and continue with the current page state.
    }
}

function getStoredBranchPreference(moduleKey) {
    const storageKey = getBranchPreferenceStorageKey(moduleKey);
    if (!storageKey) {
        return '';
    }

    try {
        return String(window.localStorage?.getItem(storageKey) || '').trim();
    } catch (_error) {
        return '';
    }
}

function getBranchPreferenceStorageKey(moduleKey) {
    const moduleScope = String(moduleKey || '').trim();
    if (!moduleScope) {
        return '';
    }

    const session = state.session || appClient.getSession?.() || {};
    const companyScope = String(session.companyId || session.companyCode || 'global').trim() || 'global';
    const userScope = String(session.userId || 'anon').trim() || 'anon';
    return `${FINANCE_BRANCH_STORAGE_PREFIX}:${companyScope}:${userScope}:${moduleScope}`;
}

function getAvailableBranches() {
    return Array.isArray(state.references?.branches)
        ? state.references.branches
            .map((value) => String(value || '').trim())
            .filter(Boolean)
        : [];
}

function findMatchingBranch(branch) {
    const normalizedBranch = String(branch || '').trim().toLowerCase();
    if (!normalizedBranch) {
        return '';
    }

    return getAvailableBranches().find((value) => value.toLowerCase() === normalizedBranch) || '';
}

function resetForm(moduleKey) {
    const module = MODULES[moduleKey];
    const moduleState = state.modules[moduleKey];
    const refs = moduleState.refs;

    moduleState.editingId = null;
    refs.dateInput.value = toDateInputValue(new Date());
    refs.branchInput.value = getPreferredBranch(moduleKey);
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
    syncSelectedDeleteButton(moduleKey);
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
            rememberBranchPreference(moduleKey, payload.branch);
            resetForm(moduleKey);
            setFormStatus(moduleKey, `${module.label} updated successfully.`, false);
        } else {
            await module.add(payload);
            rememberBranchPreference(moduleKey, payload.branch);
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
        state.modules[moduleKey].summary = payload.summary || {};
        renderSummary(moduleKey, payload.summary || {});
        renderTable(moduleKey, payload.items || []);
        setReportStatus(
            moduleKey,
            `Loaded ${payload.summary?.totalCount || 0} ${module.searchPlaceholder} entr${payload.summary?.totalCount === 1 ? 'y' : 'ies'}.`,
            false
        );
        return payload;
    } catch (error) {
        console.error(`Failed to load ${module.searchPlaceholder}:`, error);
        state.modules[moduleKey].items = [];
        state.modules[moduleKey].summary = {};
        renderSummary(moduleKey, {});
        renderTable(moduleKey, []);
        setReportStatus(moduleKey, error.message || `Unable to load ${module.searchPlaceholder} records.`, true);
        return null;
    }
}

function getModuleFilters(moduleKey) {
    const refs = state.modules[moduleKey]?.refs;
    if (!refs) {
        return {
            dateFrom: '',
            dateTo: '',
            branch: '',
            search: ''
        };
    }

    return {
        dateFrom: refs.dateFromFilter.value || '',
        dateTo: refs.dateToFilter.value || '',
        branch: refs.branchFilter.value || '',
        search: refs.searchInput.value.trim()
    };
}

function setExpenseExportStatus(message, isError = false) {
    if (!expenseExportStatus) {
        return;
    }

    expenseExportStatus.textContent = message || '';
    expenseExportStatus.classList.toggle('error', Boolean(isError));
}

function setExpenseExportBusy(isBusy) {
    [expenseCopySummaryBtn, expenseSavePdfBtn, expenseExportExcelBtn].forEach((button) => {
        if (button) {
            button.disabled = Boolean(isBusy);
        }
    });
}

function getExpenseBranchOrder(rows, branchFilter = '') {
    const matchedFilterBranch = findMatchingBranch(branchFilter) || String(branchFilter || '').trim();
    if (matchedFilterBranch) {
        return [matchedFilterBranch];
    }

    const rowBranchMap = new Map();
    (rows || []).forEach((row) => {
        const branchName = String(row?.branch || '').trim();
        if (branchName) {
            rowBranchMap.set(branchName.toLowerCase(), branchName);
        }
    });

    const availableBranches = getAvailableBranches();
    const orderedBranches = availableBranches.filter((branch) => rowBranchMap.has(branch.toLowerCase()));
    const remainingBranches = [...rowBranchMap.values()]
        .filter((branch) => !orderedBranches.some((candidate) => candidate.toLowerCase() === branch.toLowerCase()))
        .sort((left, right) => left.localeCompare(right));

    const finalOrder = [...orderedBranches, ...remainingBranches];
    if (finalOrder.length) {
        return finalOrder;
    }

    return availableBranches.length === 1 ? [availableBranches[0]] : ['All Branches'];
}

function buildExpenseBreakdownSections(rows, branchFilter = '') {
    return getExpenseBranchOrder(rows, branchFilter).map((branch) => {
        const scopedRows = branch === 'All Branches'
            ? rows
            : rows.filter((row) => String(row?.branch || '').trim().toLowerCase() === branch.toLowerCase());
        const grouped = new Map();

        scopedRows.forEach((row) => {
            const label = String(row?.about || '').trim() || 'Unlabeled Expense';
            const key = label.toLowerCase();
            const current = grouped.get(key) || {
                label,
                amount: 0,
                recordCount: 0
            };

            current.amount += Number(row?.amount || 0);
            current.recordCount += 1;
            grouped.set(key, current);
        });

        const expenseItems = [...grouped.values()].sort((left, right) => left.label.localeCompare(right.label));
        const totalAmount = expenseItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);

        return {
            branch,
            recordCount: scopedRows.length,
            uniqueItemCount: expenseItems.length,
            totalAmount,
            expenseItems
        };
    });
}

function buildExpenseFilterSummaryText(filters = {}) {
    const parts = [];
    const branch = String(filters.branch || '').trim();
    const search = String(filters.search || '').trim();

    if (filters.dateFrom || filters.dateTo) {
        parts.push(`Period: ${formatFilterDate(filters.dateFrom) || 'Start'} to ${formatFilterDate(filters.dateTo) || 'End'}`);
    } else {
        parts.push('Period: All Dates');
    }

    parts.push(`Branch: ${branch || 'All Branches'}`);

    if (search) {
        parts.push(`Search: ${search}`);
    }

    return parts.join(' | ');
}

function buildExpenseBreakdownData() {
    const filters = getModuleFilters('expense');
    const items = Array.isArray(state.modules.expense?.items) ? state.modules.expense.items : [];
    const summary = state.modules.expense?.summary || {};
    const sections = buildExpenseBreakdownSections(items, filters.branch);
    const companyName = String(
        state.workspaceConfig?.company?.name
        || state.session?.companyName
        || state.session?.companyCode
        || 'GMS ERP'
    ).trim() || 'GMS ERP';
    const totalAmount = Number(summary.totalAmount || items.reduce((sum, row) => sum + Number(row.amount || 0), 0));

    return {
        companyName,
        title: 'Business Costs Breakdown',
        filterSummary: buildExpenseFilterSummaryText(filters),
        filters,
        items,
        summary: {
            ...summary,
            totalAmount
        },
        sections
    };
}

function buildExpenseBreakdownText(data) {
    const lines = [
        String(data.title || 'Business Costs Breakdown').toUpperCase(),
        data.companyName || 'GMS ERP',
        data.filterSummary || '',
        ''
    ];

    (data.sections || []).forEach((section, index) => {
        lines.push(String(section.branch || 'Branch').toUpperCase());
        if (!section.expenseItems.length) {
            lines.push('- No expense entries recorded.');
        } else {
            section.expenseItems.forEach((item) => {
                lines.push(`- ${item.label}: ${formatMoney(item.amount || 0)}`);
            });
        }
        lines.push(`Total Expenses: ${formatMoney(section.totalAmount || 0)}`);
        lines.push(`Records: ${section.recordCount || 0}`);
        if (index < data.sections.length - 1) {
            lines.push('');
        }
    });

    lines.push('');
    lines.push(`Overall Total Expenses: ${formatMoney(data.summary?.totalAmount || 0)}`);
    lines.push(`Cash Left: ${formatMoney(data.summary?.cashLeftAmount || 0)}`);
    return lines.join('\n').trim();
}

async function copyExpenseBreakdownSummary() {
    setExpenseExportBusy(true);
    setExpenseExportStatus('Refreshing expense data before copying...', false);

    try {
        const payload = await loadRecords('expense');
        if (!payload) {
            throw new Error('Unable to refresh expense records for copying.');
        }
        const data = buildExpenseBreakdownData();
        await copyTextToClipboard(buildExpenseBreakdownText(data));
        setExpenseExportStatus('Expense breakdown copied. Ready na siyang i-paste sa message or chat.', false);
    } catch (error) {
        console.error('Failed to copy expense breakdown:', error);
        setExpenseExportStatus(error.message || 'Unable to copy the expense breakdown.', true);
    } finally {
        setExpenseExportBusy(false);
    }
}

async function saveExpenseBreakdownAsPdf() {
    setExpenseExportBusy(true);
    setExpenseExportStatus('Preparing print-friendly expense breakdown...', false);

    try {
        const payload = await loadRecords('expense');
        if (!payload) {
            throw new Error('Unable to refresh expense records for PDF.');
        }
        const data = buildExpenseBreakdownData();
        const popup = window.open('', '_blank', 'width=1200,height=900');

        if (!popup) {
            setExpenseExportStatus('Allow pop-ups to save the expense breakdown as PDF.', true);
            return;
        }

        popup.document.write(buildExpenseBreakdownPrintHtml(data));
        popup.document.close();
        popup.focus();

        const triggerPrint = () => {
            try {
                popup.focus();
                popup.print();
            } catch (_error) {
                // Ignore popup print errors.
            }
        };

        popup.addEventListener('load', triggerPrint, { once: true });
        setTimeout(triggerPrint, 300);
        setExpenseExportStatus('Print dialog opened. Piliin ang Save as PDF para ma-send sa owner.', false);
    } catch (error) {
        console.error('Failed to prepare expense breakdown PDF:', error);
        setExpenseExportStatus(error.message || 'Unable to prepare the PDF view.', true);
    } finally {
        setExpenseExportBusy(false);
    }
}

function buildExpenseBreakdownPrintHtml(data) {
    const sectionsHtml = (data.sections || []).map((section) => {
        const itemRows = section.expenseItems.length
            ? section.expenseItems.map((item) => `
                <tr>
                    <td>${appClient.escapeHtml(item.label)}</td>
                    <td class="amount">${appClient.escapeHtml(formatMoney(item.amount || 0))}</td>
                </tr>
            `).join('')
            : `
                <tr>
                    <td>No expense entries recorded.</td>
                    <td class="amount">${appClient.escapeHtml(formatMoney(0))}</td>
                </tr>
            `;

        return `
            <section class="branch-card">
                <div class="branch-head">${appClient.escapeHtml(String(section.branch || 'Branch').toUpperCase())}</div>
                <div class="branch-copy">${appClient.escapeHtml(data.filterSummary || '')}</div>
                <table>
                    <thead>
                        <tr>
                            <th>Expense Item</th>
                            <th>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemRows}
                        <tr class="total-row">
                            <td>Total Expenses</td>
                            <td class="amount">${appClient.escapeHtml(formatMoney(section.totalAmount || 0))}</td>
                        </tr>
                    </tbody>
                </table>
                <p class="branch-meta">${appClient.escapeHtml(`${section.recordCount || 0} record${section.recordCount === 1 ? '' : 's'} | ${section.uniqueItemCount || 0} grouped item${section.uniqueItemCount === 1 ? '' : 's'}`)}</p>
            </section>
        `;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${appClient.escapeHtml(`${data.companyName || 'GMS ERP'} Expense Breakdown`)}</title>
<style>
  :root {
    color-scheme: light;
    --ink: #111827;
    --muted: #7c2d12;
    --line: #111827;
    --paper: #ffffff;
    --accent: #e68a1f;
    --accent-soft: #fff4ea;
    --total: #f7d36b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    font-family: Arial, sans-serif;
    color: var(--ink);
    background: #f3f4f6;
  }
  .sheet {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;
    background: var(--paper);
  }
  h1 {
    margin: 0;
    text-align: center;
    font-size: 28px;
    letter-spacing: 0.04em;
  }
  .company {
    margin: 8px 0 4px;
    text-align: center;
    font-weight: 700;
  }
  .copy {
    margin: 0 0 22px;
    text-align: center;
    color: var(--muted);
    font-style: italic;
    font-size: 13px;
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    margin-bottom: 18px;
  }
  .summary-card {
    padding: 12px 14px;
    border: 1px solid var(--line);
    background: #fafaf9;
  }
  .summary-card span,
  .summary-card strong {
    display: block;
  }
  .summary-card span {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .summary-card strong {
    margin-top: 6px;
    font-size: 18px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .branch-card {
    border: 1px solid var(--line);
    break-inside: avoid;
  }
  .branch-head {
    padding: 10px 12px;
    background: var(--accent);
    color: #ffffff;
    text-align: center;
    font-weight: 700;
  }
  .branch-copy {
    padding: 8px 12px;
    background: var(--accent-soft);
    color: var(--muted);
    font-size: 12px;
    font-style: italic;
    border-bottom: 1px solid var(--line);
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 8px 10px;
    border: 1px solid var(--line);
    font-size: 13px;
  }
  th {
    background: #111827;
    color: #ffffff;
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.08em;
  }
  td.amount {
    text-align: right;
    white-space: nowrap;
  }
  .total-row td {
    background: var(--total);
    font-weight: 700;
  }
  .branch-meta {
    margin: 0;
    padding: 10px 12px;
    color: #4b5563;
    font-size: 12px;
    border-top: 1px solid var(--line);
    background: #fffbeb;
  }
  @media print {
    body {
        padding: 0;
        background: #ffffff;
    }
    .sheet {
        max-width: none;
        padding: 0;
        box-shadow: none;
    }
  }
  @media (max-width: 900px) {
    .grid {
        grid-template-columns: 1fr;
    }
  }
</style>
</head>
<body>
  <main class="sheet">
    <h1>${appClient.escapeHtml(String(data.title || 'Business Costs Breakdown').toUpperCase())}</h1>
    <p class="company">${appClient.escapeHtml(data.companyName || 'GMS ERP')}</p>
    <p class="copy">${appClient.escapeHtml(data.filterSummary || '')}</p>

    <section class="summary">
      <article class="summary-card">
        <span>Total Expenses</span>
        <strong>${appClient.escapeHtml(formatMoney(data.summary?.totalAmount || 0))}</strong>
      </article>
      <article class="summary-card">
        <span>Cash Left</span>
        <strong>${appClient.escapeHtml(formatMoney(data.summary?.cashLeftAmount || 0))}</strong>
      </article>
      <article class="summary-card">
        <span>Visible Records</span>
        <strong>${appClient.escapeHtml(String(data.summary?.totalCount || data.items?.length || 0))}</strong>
      </article>
    </section>

    <section class="grid">
      ${sectionsHtml}
    </section>
  </main>
</body>
</html>`;
}

async function downloadExpenseBreakdownExcel() {
    const filters = getModuleFilters('expense');
    setExpenseExportBusy(true);
    setExpenseExportStatus('Preparing Excel export. Please wait...', false);

    try {
        const { blob, filename } = await fetchExpenseBreakdownExcel(filters);
        triggerBlobDownload(blob, filename || 'expense-breakdown.xlsx');
        setExpenseExportStatus('Excel export ready. Check your downloads.', false);
    } catch (error) {
        console.error('Failed to export expense breakdown Excel:', error);
        setExpenseExportStatus(error.message || 'Failed to export the expense breakdown.', true);
    } finally {
        setExpenseExportBusy(false);
    }
}

async function fetchExpenseBreakdownExcel(filters = {}) {
    const query = new URLSearchParams({
        dateFrom: filters.dateFrom || '',
        dateTo: filters.dateTo || '',
        branch: filters.branch || '',
        search: filters.search || ''
    });
    const response = await fetch(`/api/expenses/export-excel?${query.toString()}`, {
        credentials: 'same-origin'
    });
    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
        if (contentType.includes('application/json')) {
            const payload = await response.json();
            throw new Error(payload.error || `Export failed (${response.status}).`);
        }

        const text = await response.text();
        throw new Error(text || `Export failed (${response.status}).`);
    }

    if (contentType.includes('application/json')) {
        const payload = await response.json();
        throw new Error(payload.error || 'Unexpected response when downloading the Excel file.');
    }

    const blob = await response.blob();
    const filename = parseFilenameFromHeader(response.headers.get('content-disposition'));
    return { blob, filename };
}

function triggerBlobDownload(blob, filename) {
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = filename || 'download.xlsx';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function parseFilenameFromHeader(headerValue) {
    const header = String(headerValue || '');
    const encodedMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (encodedMatch) {
        try {
            return decodeURIComponent(encodedMatch[1]);
        } catch (_error) {
            return encodedMatch[1];
        }
    }

    const match = header.match(/filename=\"?([^\";]+)\"?/i);
    return match ? match[1] : '';
}

async function copyTextToClipboard(text) {
    const value = String(text || '');
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) {
        throw new Error('Copy is not available in this browser.');
    }
}

function renderSummary(moduleKey, summary) {
    const refs = state.modules[moduleKey].refs;
    if (refs.countValue) {
        refs.countValue.textContent = String(summary.totalCount || state.modules[moduleKey].items.length || 0);
    }
    refs.totalValue.textContent = summary.totalAmountDisplay || formatMoney(0);
    if (refs.cashLeftValue) {
        refs.cashLeftValue.textContent = summary.cashLeftAmountDisplay || formatMoney(0);
    }
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

    const branchRows = getBranchSummaryRows(summary, moduleKey);
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
        if (row.detailText) {
            const detail = document.createElement('small');
            detail.textContent = row.detailText;
            card.appendChild(detail);
        }
        fragment.appendChild(card);
    });

    grid.insertBefore(fragment, insertionPoint);
}

function getBranchSummaryRows(summary, moduleKey = '') {
    if (moduleKey === 'expense' && Array.isArray(summary.cashLeftBranchBreakdown) && summary.cashLeftBranchBreakdown.length) {
        return summary.cashLeftBranchBreakdown
            .filter((item) => String(item?.label || '').trim())
            .map((item) => ({
                label: `${String(item.label || '').trim()} Cash Left`,
                value: Number(item.value || 0),
                displayValue: item.displayValue || formatMoney(item.value || 0),
                detailText: String(item.detailText || '').trim()
            }));
    }

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
            const sourceLabel = isAuto ? 'Auto-linked' : 'Manual';
            const linkedLabel = isAuto
                ? `Linked ${row.linked_order_number || row.linked_receipt_number || 'sales entry'}`
                : (row.note || 'Manual cash income entry');
            return `
                <tr>
                    <td>${appClient.escapeHtml(formatDate(row[module.dateColumn]))}</td>
                    <td>${appClient.escapeHtml(row.branch || '-')}</td>
                    <td class="details-cell">
                        <div class="cell-copy">
                            <strong>${appClient.escapeHtml(row.about || '-')}</strong>
                            <small>${appClient.escapeHtml(linkedLabel)}</small>
                            <div class="meta-row">
                                <span class="status-pill ${status.toLowerCase()}">${appClient.escapeHtml(status)}</span>
                                <span class="source-pill">${appClient.escapeHtml(sourceLabel)}</span>
                            </div>
                        </div>
                    </td>
                    <td class="amount-cell">${appClient.escapeHtml(formatMoney(row.amount || 0))}</td>
                    <td>
                        <div class="table-actions">
                            ${status === 'Pending' ? `<button type="button" class="primary-btn tiny-btn" data-action="confirm" data-id="${row.id}">Confirm</button>` : ''}
                            <button type="button" class="secondary-btn tiny-btn" data-action="edit" data-id="${row.id}">Edit</button>
                            <button type="button" class="danger-btn tiny-btn" data-action="delete" data-id="${row.id}">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        }

        return `
            <tr>
                <td>${appClient.escapeHtml(formatDate(row[module.dateColumn]))}</td>
                <td>${appClient.escapeHtml(row.branch || '-')}</td>
                <td class="details-cell">
                    <div class="cell-copy">
                        <strong>${appClient.escapeHtml(row.about || '-')}</strong>
                        <small>${appClient.escapeHtml(row.note || 'No note')}</small>
                    </div>
                </td>
                <td class="amount-cell">${appClient.escapeHtml(formatMoney(row.amount || 0))}</td>
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
    syncSelectedDeleteButton(moduleKey, row);
    setFormStatus(moduleKey, `Editing ${module.searchPlaceholder} entry #${row.id}.`, false);
    setActiveModule(moduleKey);
    scrollModulePanelIntoView(moduleKey, 'form');
    refs.aboutInput.focus();
}

function syncSelectedDeleteButton(moduleKey) {
    const module = MODULES[moduleKey];
    const moduleState = state.modules[moduleKey];
    const refs = moduleState?.refs;
    if (!module || !refs?.clearBtn) {
        return;
    }

    const selectedId = Number(moduleState.editingId || 0);
    const canDelete = Number.isInteger(selectedId) && selectedId > 0;
    refs.clearBtn.hidden = !canDelete;
    refs.clearBtn.disabled = !canDelete;
    refs.clearBtn.textContent = canDelete
        ? `Delete Selected ${module.label} #${selectedId}`
        : `Delete Selected ${module.label}`;
    if (canDelete) {
        refs.clearBtn.removeAttribute('aria-hidden');
    } else {
        refs.clearBtn.setAttribute('aria-hidden', 'true');
    }
}

async function deleteSelectedEntry(moduleKey) {
    const module = MODULES[moduleKey];
    const moduleState = state.modules[moduleKey];
    const selectedId = Number(moduleState?.editingId || 0);
    if (!Number.isInteger(selectedId) || selectedId <= 0) {
        setFormStatus(moduleKey, `Pumili muna ng ${module.searchPlaceholder} sa records table bago mag-delete.`, true);
        return;
    }

    await deleteEntry(moduleKey, selectedId);
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
    if (moduleKey === 'cashIncome') {
        const message = 'Bulk delete ng manual cash income ay disabled. Gamitin ang Delete button sa table para individual entry lang ang mabura.';
        setFormStatus(moduleKey, message, true);
        setReportStatus(moduleKey, message, true);
        return;
    }

    const promptMessage = `Delete all ${module.pluralLabel.toLowerCase()} records? This cannot be undone.`;

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

function setActiveModule(moduleKey, { scrollIntoView = false } = {}) {
    if (!MODULES[moduleKey]) {
        return;
    }

    state.activeModule = moduleKey;

    moduleSwitchButtons.forEach((button) => {
        const isActive = button.dataset.moduleSwitch === moduleKey;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    Object.values(MODULES).forEach((module) => {
        const refs = state.modules[module.key]?.refs;
        if (!refs?.manager) {
            return;
        }
        refs.manager.hidden = module.key !== moduleKey;
    });

    if (scrollIntoView) {
        const activeRefs = state.modules[moduleKey]?.refs;
        activeRefs?.manager?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function scrollModulePanelIntoView(moduleKey, target = 'form') {
    const refs = state.modules[moduleKey]?.refs;
    if (!refs) {
        return;
    }

    const panel = target === 'records' ? refs.recordsPanel : refs.formPanel;
    panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function formatFilterDate(value) {
    return value ? formatDate(value) : '';
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
