const appClient = window.appClient;

const companySelect = document.getElementById('companySelect');
const employeeSelect = document.getElementById('employeeSelect');
const cutoffDateInput = document.getElementById('cutoffDateInput');
const loadBtn = document.getElementById('loadBtn');
const refreshBtn = document.getElementById('refreshBtn');
const logoutBtn = document.getElementById('logoutBtn');
const statusLine = document.getElementById('statusLine');
const timecardTableBody = document.getElementById('timecardTableBody');
const tableTitle = document.getElementById('tableTitle');
const editorScopePill = document.getElementById('editorScopePill');
const summaryCompany = document.getElementById('summaryCompany');
const summaryEmployee = document.getElementById('summaryEmployee');
const summaryCutoff = document.getElementById('summaryCutoff');
const summaryPresent = document.getElementById('summaryPresent');
const summaryHours = document.getElementById('summaryHours');

const LAST_COMPANY_KEY = 'superTimeCardEditorCompanyId';
const LAST_EMPLOYEE_KEY = 'superTimeCardEditorEmployeeId';
const ZERO_HOUR_STATUSES = new Set(['absent', 'day off', 'inactive', 'suspended']);

const state = {
    session: null,
    companies: [],
    employees: [],
    rows: [],
    loading: false
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'super_admin' });
    if (!session) {
        return;
    }
    state.session = session;

    bindEvents();
    await primeCutoffDate();
    await loadCompanies();
}

function bindEvents() {
    companySelect.addEventListener('change', () => {
        persistSelection(LAST_COMPANY_KEY, companySelect.value);
        state.rows = [];
        renderRows();
        updateSummary();
        void loadEmployees();
    });

    employeeSelect.addEventListener('change', () => {
        persistSelection(LAST_EMPLOYEE_KEY, employeeSelect.value);
        void loadTimecard();
    });

    cutoffDateInput.addEventListener('change', () => {
        void loadTimecard();
    });

    loadBtn.addEventListener('click', () => {
        void loadTimecard();
    });

    refreshBtn.addEventListener('click', () => {
        void loadCompanies({ preserveSelection: true });
    });

    logoutBtn.addEventListener('click', async () => {
        await appClient.clearSession();
        appClient.redirectToLogin?.();
    });

    timecardTableBody.addEventListener('click', (event) => {
        const button = event.target?.closest?.('button[data-action="save-row"]');
        if (button) {
            void saveRow(button);
        }
    });

    timecardTableBody.addEventListener('input', (event) => {
        const row = event.target?.closest?.('tr[data-date-key]');
        const rowStatus = row?.querySelector?.('[data-role="row-status"]');
        if (rowStatus) {
            rowStatus.textContent = 'Unsaved';
        }
    });
}

async function primeCutoffDate() {
    const fallback = formatDateKey(new Date());
    try {
        const serverInfo = await appClient.getServerInfo();
        cutoffDateInput.value = String(serverInfo?.dateKey || '').trim() || fallback;
        cutoffDateInput.max = String(serverInfo?.dateKey || '').trim() || fallback;
    } catch (_error) {
        cutoffDateInput.value = fallback;
        cutoffDateInput.max = fallback;
    }
}

async function loadCompanies({ preserveSelection = false } = {}) {
    setBusy(true);
    setStatus('Loading companies...');
    try {
        const previousCompanyId = preserveSelection
            ? getSelectedCompanyId()
            : readSelection(LAST_COMPANY_KEY);
        const companies = await appClient.listSuperCompanies();
        state.companies = sortCompanies(companies || []);
        renderCompanyOptions(previousCompanyId);
        await loadEmployees({ preserveSelection });
        setStatus('Ready.');
    } catch (error) {
        console.error('Failed to load companies for time card editor:', error);
        setStatus(error.message || 'Failed to load companies.', true);
        renderEmptyRows(error.message || 'Failed to load companies.');
    } finally {
        setBusy(false);
    }
}

async function loadEmployees({ preserveSelection = false } = {}) {
    const companyId = getSelectedCompanyId();
    state.employees = [];
    state.rows = [];
    renderEmployeeOptions('');
    renderRows();
    updateSummary();

    if (!companyId) {
        renderEmptyRows('No company selected.');
        return;
    }

    setBusy(true);
    setStatus('Loading employees...');
    try {
        const previousEmployeeId = preserveSelection
            ? getSelectedEmployeeId()
            : readSelection(LAST_EMPLOYEE_KEY);
        const employees = await appClient.listSuperAttendanceEmployees({ companyId });
        state.employees = sortEmployees(employees || []);
        renderEmployeeOptions(previousEmployeeId);
        await loadTimecard({ silent: true });
        setStatus('Ready.');
    } catch (error) {
        console.error('Failed to load attendance employees:', error);
        setStatus(error.message || 'Failed to load employees.', true);
        renderEmptyRows(error.message || 'Failed to load employees.');
    } finally {
        setBusy(false);
    }
}

async function loadTimecard({ silent = false } = {}) {
    const companyId = getSelectedCompanyId();
    const employeeId = getSelectedEmployeeId();
    const dateKey = getSelectedDateKey();
    state.rows = [];
    renderRows();
    updateSummary();

    if (!companyId || !employeeId || !dateKey) {
        renderEmptyRows('Select company, employee, and cutoff date.');
        return;
    }

    setBusy(true);
    if (!silent) {
        setStatus('Loading time card...');
    }

    try {
        const rows = await appClient.getSuperUserCutoffTimeCard(companyId, employeeId, { dateKey });
        state.rows = sortRows(rows || []);
        renderRows();
        updateSummary();
        if (!silent) {
            setStatus('Time card loaded.');
        }
    } catch (error) {
        console.error('Failed to load super admin time card:', error);
        setStatus(error.message || 'Failed to load time card.', true);
        renderEmptyRows(error.message || 'Failed to load time card.');
    } finally {
        setBusy(false);
    }
}

async function saveRow(button) {
    const rowElement = button.closest('tr[data-date-key]');
    if (!rowElement) {
        return;
    }

    const companyId = getSelectedCompanyId();
    const employeeId = getSelectedEmployeeId();
    const dateKey = rowElement.dataset.dateKey || '';
    const rowStatus = rowElement.querySelector('[data-role="row-status"]');
    const timeInInput = rowElement.querySelector('[data-role="time-in"]');
    const timeOutInput = rowElement.querySelector('[data-role="time-out"]');
    const workedHoursInput = rowElement.querySelector('[data-role="worked-hours"]');
    const remarksInput = rowElement.querySelector('[data-role="remarks"]');

    if (!companyId || !employeeId || !dateKey) {
        setStatus('Company, employee, and date are required.', true);
        return;
    }

    const payload = {
        dateKey,
        timeIn: String(timeInInput?.value || '').trim(),
        timeOut: String(timeOutInput?.value || '').trim(),
        remarks: String(remarksInput?.value || '').trim()
    };
    const workedHours = String(workedHoursInput?.value || '').trim();
    if (workedHours) {
        payload.workedHours = workedHours;
    }

    button.disabled = true;
    if (rowStatus) {
        rowStatus.textContent = 'Saving...';
    }
    setStatus(`Saving ${formatDisplayDate(dateKey)}...`);

    try {
        const updatedRow = await appClient.updateSuperTimeCardEntry(companyId, employeeId, payload);
        replaceRow(updatedRow);
        renderRows();
        updateSummary();
        setStatus(`Saved ${formatDisplayDate(dateKey)}.`);
    } catch (error) {
        console.error('Failed to save manual time card entry:', error);
        setStatus(error.message || 'Failed to save row.', true);
        if (rowStatus) {
            rowStatus.textContent = 'Save failed';
        }
        button.disabled = false;
    }
}

function renderCompanyOptions(preferredCompanyId = '') {
    const preferred = String(preferredCompanyId || '').trim();
    companySelect.innerHTML = '';

    if (!state.companies.length) {
        companySelect.disabled = true;
        companySelect.innerHTML = '<option value="">No companies</option>';
        return;
    }

    companySelect.disabled = false;
    state.companies.forEach((company) => {
        const option = document.createElement('option');
        option.value = company.id || '';
        option.textContent = buildCompanyLabel(company);
        companySelect.appendChild(option);
    });

    const preferredExists = state.companies.some((company) => String(company.id || '') === preferred);
    companySelect.value = preferredExists ? preferred : String(state.companies[0]?.id || '');
    persistSelection(LAST_COMPANY_KEY, companySelect.value);
}

function renderEmployeeOptions(preferredEmployeeId = '') {
    const preferred = String(preferredEmployeeId || '').trim();
    employeeSelect.innerHTML = '';

    if (!state.employees.length) {
        employeeSelect.disabled = true;
        employeeSelect.innerHTML = '<option value="">No employees</option>';
        return;
    }

    employeeSelect.disabled = false;
    state.employees.forEach((employee) => {
        const option = document.createElement('option');
        option.value = employee.id || '';
        option.textContent = buildEmployeeLabel(employee);
        employeeSelect.appendChild(option);
    });

    const preferredExists = state.employees.some((employee) => String(employee.id || '') === preferred);
    employeeSelect.value = preferredExists ? preferred : String(state.employees[0]?.id || '');
    persistSelection(LAST_EMPLOYEE_KEY, employeeSelect.value);
}

function renderRows() {
    if (!state.rows.length) {
        renderEmptyRows('No cutoff rows loaded.');
        return;
    }

    timecardTableBody.innerHTML = state.rows.map((row) => {
        const dateKey = String(row.dateKey || row.date || '').trim();
        const currentStatus = String(row.status || '').trim() || '-';
        const currentRemarks = String(row.displayRemarks || row.remarksRaw || '').trim();
        const remarksValue = String(row.remarksRaw || row.status || '').trim();
        const workedHours = String(row.workedHours || '').trim();
        return `
            <tr data-date-key="${escapeHtml(dateKey)}">
                <td>
                    <div class="date-cell">
                        <strong>${escapeHtml(row.displayDate || formatDisplayDate(dateKey))}</strong>
                        <span>${escapeHtml(row.dayLabel || '')}</span>
                    </div>
                </td>
                <td><input class="time-input" data-role="time-in" type="time" value="${escapeHtml(row.timeIn || '')}"></td>
                <td><input class="time-input" data-role="time-out" type="time" value="${escapeHtml(row.timeOut || '')}"></td>
                <td>
                    <input class="hours-input" data-role="worked-hours" type="number" min="0" max="24" step="0.01" placeholder="${escapeHtml(workedHours || 'auto')}">
                </td>
                <td>
                    <input class="remarks-input" data-role="remarks" list="statusOptions" value="${escapeHtml(remarksValue)}" maxlength="240">
                </td>
                <td>
                    <div class="status-preview">
                        <strong>${escapeHtml(currentStatus)}</strong>
                        ${currentRemarks && currentRemarks !== currentStatus ? `<span>${escapeHtml(currentRemarks)}</span>` : ''}
                    </div>
                </td>
                <td>
                    <div class="row-actions">
                        <button type="button" data-action="save-row">Save</button>
                    </div>
                    <span class="row-status" data-role="row-status">Ready</span>
                </td>
            </tr>
        `;
    }).join('');
}

function renderEmptyRows(message) {
    timecardTableBody.innerHTML = `<tr><td colspan="7" class="empty-row">${escapeHtml(message || 'No rows.')}</td></tr>`;
}

function replaceRow(updatedRow) {
    const dateKey = String(updatedRow?.dateKey || updatedRow?.date || '').trim();
    if (!dateKey) {
        return;
    }

    const nextRows = state.rows.slice();
    const index = nextRows.findIndex((row) => String(row.dateKey || row.date || '') === dateKey);
    if (index >= 0) {
        nextRows[index] = updatedRow;
    } else {
        nextRows.push(updatedRow);
    }
    state.rows = sortRows(nextRows);
}

function updateSummary() {
    const company = getSelectedCompany();
    const employee = getSelectedEmployee();
    const cutoffBounds = getCutoffBounds(getSelectedDateKey());
    const totalHours = state.rows.reduce((sum, row) => {
        const value = Number(row.workedHours || 0);
        return Number.isFinite(value) ? sum + value : sum;
    }, 0);
    const presentCount = state.rows.filter((row) => {
        const status = String(row.status || '').trim().toLowerCase();
        if (ZERO_HOUR_STATUSES.has(status)) {
            return false;
        }
        return Boolean(row.timeIn || row.timeOut || Number(row.workedHours || 0) > 0);
    }).length;

    summaryCompany.textContent = company ? (company.company_code || company.name || '-') : '-';
    summaryEmployee.textContent = employee ? (employee.name || employee.id || '-') : '-';
    summaryCutoff.textContent = cutoffBounds
        ? `${formatDisplayDate(cutoffBounds.start)} - ${formatDisplayDate(cutoffBounds.end)}`
        : '-';
    summaryPresent.textContent = String(presentCount);
    summaryHours.textContent = totalHours.toFixed(2);
    tableTitle.textContent = employee
        ? `${employee.name || employee.id} - Cutoff Rows`
        : 'Cutoff Rows';
    editorScopePill.classList.toggle('is-error', false);
    editorScopePill.textContent = 'Super admin only';
}

function setBusy(isBusy) {
    state.loading = Boolean(isBusy);
    loadBtn.disabled = state.loading;
    refreshBtn.disabled = state.loading;
    companySelect.disabled = state.loading || !state.companies.length;
    employeeSelect.disabled = state.loading || !state.employees.length;
}

function setStatus(message = '', isError = false) {
    statusLine.textContent = message;
    statusLine.classList.toggle('is-error', Boolean(isError));
}

function sortCompanies(companies = []) {
    return companies.slice().sort((left, right) => {
        const leftStatus = String(left.status || 'active').toLowerCase() === 'active' ? 0 : 1;
        const rightStatus = String(right.status || 'active').toLowerCase() === 'active' ? 0 : 1;
        if (leftStatus !== rightStatus) {
            return leftStatus - rightStatus;
        }
        return String(left.name || '').localeCompare(String(right.name || ''));
    });
}

function sortEmployees(employees = []) {
    return employees.slice().sort((left, right) => {
        const leftStatus = String(left.account_status || 'active').toLowerCase() === 'active' ? 0 : 1;
        const rightStatus = String(right.account_status || 'active').toLowerCase() === 'active' ? 0 : 1;
        if (leftStatus !== rightStatus) {
            return leftStatus - rightStatus;
        }
        return String(left.name || '').localeCompare(String(right.name || ''));
    });
}

function sortRows(rows = []) {
    return rows.slice().sort((left, right) => (
        String(left.dateKey || left.date || '').localeCompare(String(right.dateKey || right.date || ''))
    ));
}

function buildCompanyLabel(company) {
    const code = String(company.company_code || '').trim();
    const name = String(company.name || '').trim();
    return code && name ? `${code} - ${name}` : (name || code || company.id || 'Company');
}

function buildEmployeeLabel(employee) {
    const name = String(employee.name || '').trim();
    const id = String(employee.id || '').trim();
    const status = String(employee.account_status || '').trim();
    const base = name && id ? `${name} (${id})` : (name || id || 'Employee');
    return status && status.toLowerCase() !== 'active' ? `${base} - ${status}` : base;
}

function getSelectedCompanyId() {
    return String(companySelect.value || '').trim();
}

function getSelectedEmployeeId() {
    return String(employeeSelect.value || '').trim();
}

function getSelectedDateKey() {
    return String(cutoffDateInput.value || '').trim();
}

function getSelectedCompany() {
    const companyId = getSelectedCompanyId();
    return state.companies.find((company) => String(company.id || '') === companyId) || null;
}

function getSelectedEmployee() {
    const employeeId = getSelectedEmployeeId();
    return state.employees.find((employee) => String(employee.id || '') === employeeId) || null;
}

function getCutoffBounds(dateKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) {
        return null;
    }

    const date = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const year = date.getFullYear();
    const monthIndex = date.getMonth();
    const day = date.getDate();
    const startDay = day <= 15 ? 1 : 16;
    const endDay = day <= 15 ? 15 : new Date(year, monthIndex + 1, 0).getDate();
    return {
        start: formatDateKey(new Date(year, monthIndex, startDay)),
        end: formatDateKey(new Date(year, monthIndex, endDay))
    };
}

function formatDateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return '';
    }

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function formatDisplayDate(dateKey) {
    const date = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return dateKey || '-';
    }
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function persistSelection(key, value) {
    try {
        localStorage.setItem(key, String(value || ''));
    } catch (_error) {
        // Ignore storage restrictions.
    }
}

function readSelection(key) {
    try {
        return String(localStorage.getItem(key) || '').trim();
    } catch (_error) {
        return '';
    }
}

function escapeHtml(value) {
    return appClient.escapeHtml(String(value ?? ''));
}
