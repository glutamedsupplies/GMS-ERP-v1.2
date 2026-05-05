const appClient = window.appClient;
const employeeListDiv = document.getElementById('employeeList');
const timecardTableBody = document.getElementById('timecardTableBody');
const employeeNameTitle = document.getElementById('employeeNameTitle');
const weekDateInput = document.getElementById('weekDate');
const weekRangeLabel = document.getElementById('weekRangeLabel');
const timecardPolicyNote = document.getElementById('timecardPolicyNote');
const tableShell = document.querySelector('.table-shell');
const timecardHeaderRow = document.querySelector('#timecardTable thead tr');
const dailySalaryInput = document.getElementById('dailySalaryInput');
const saveDailySalaryButton = document.getElementById('saveDailySalaryButton');
const dailySalaryStatus = document.getElementById('dailySalaryStatus');
const presentDaysValue = document.getElementById('presentDaysValue');
const pendingDaysValue = document.getElementById('pendingDaysValue');
const totalDeductionsValue = document.getElementById('totalDeductionsValue');
const netCutoffSalaryValue = document.getElementById('netCutoffSalaryValue');
const cutoffPaymentStatusValue = document.getElementById('cutoffPaymentStatusValue');
const cutoffPaymentMeta = document.getElementById('cutoffPaymentMeta');
const toggleCutoffPaymentButton = document.getElementById('toggleCutoffPaymentButton');
const cutoffPaymentStatus = document.getElementById('cutoffPaymentStatus');
const normalTimeCardButton = document.getElementById('normalTimeCardButton');
const salaryTimeCardButton = document.getElementById('salaryTimeCardButton');
const salaryPanel = document.getElementById('salaryPanel');
const initialTimecardMode = String(document.body?.dataset.timecardMode || '').trim().toLowerCase();
const DEFAULT_ATTENDANCE_POLICY = Object.freeze({
    dailyTargetHours: 9,
    overtimeThresholdHours: 1
});
const GMS_GWD_ATTENDANCE_POLICY = Object.freeze({
    dailyTargetHours: 8,
    overtimeThresholdHours: 1
});
const TIMECARD_REFRESH_INTERVAL_MS = 10000;
const ACCOUNT_STATUS_LABELS = Object.freeze({
    active: 'Active',
    inactive: 'Inactive',
    suspended: 'Suspended'
});
const ZERO_PAY_STATUSES = new Set(['absent', 'day off', 'inactive', 'suspended']);
const PAYROLL_REQUIRED_HOURS = 8;
const PAYROLL_REQUIRED_MINUTES = PAYROLL_REQUIRED_HOURS * 60;
const PHP_CURRENCY_FORMATTER = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});
const PDF_LIB_URLS = Object.freeze({
    html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
});
const EXPORT_STYLE_ELEMENT_ID = 'timecardExportStyles';
const EXPORT_SANDBOX_ID = 'timecardExportSandbox';
const EXPORT_CONTROLS_ID = 'timecardExportControls';

let selectedEmployee = null;
let serverDateKey = formatDateKey(new Date());
let currentAttendancePolicy = DEFAULT_ATTENDANCE_POLICY;
let compactLayoutFrame = 0;
let employeeRefreshPromise = null;
let timecardRequestToken = 0;
let attendanceEmployees = [];
let currentTimecardRows = [];
let currentPayrollEmployeeId = '';
let payrollSaveInFlight = false;
let cutoffPaymentSaveInFlight = false;
let currentCutoffPaymentState = null;
let timecardViewMode = initialTimecardMode === 'salary' ? 'salary' : 'normal';
let currentBootstrap = null;
let exportPdfButton = null;
let exportImageButton = null;
let exportStatus = null;
let exportInFlight = false;
let html2CanvasLoadPromise = null;
let jsPdfLoadPromise = null;
const exportScriptCache = new Map();
const openPayrollDetailKeys = new Set();

initialize();
window.addEventListener('resize', queueCompactLayoutCheck);

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    const [bootstrap, resolvedDateKey] = await Promise.all([
        appClient.getBootstrap().catch((error) => {
            console.error('Failed to load head admin branding for time cards:', error);
            return null;
        }),
        resolveServerDateKey()
    ]);
    currentBootstrap = bootstrap;

    try {
        appClient.applyBootstrapBrandTheme(bootstrap);
        applyAttendancePolicy(getAttendancePolicyForCompany(bootstrap?.company));
    } catch (_error) {
        applyAttendancePolicy(DEFAULT_ATTENDANCE_POLICY);
    }

    serverDateKey = resolvedDateKey;
    initSelectors(serverDateKey);
    initializeTimecardViewMode();
    initializeTimecardExportControls();
    initializePayrollControls();
    await loadEmployees();
    setupAutoRefresh();
}

function initSelectors(dateKey) {
    const initialDate = clampToServerDate(parseInputDate(dateKey));
    const initialDateKey = formatDateKey(initialDate);
    weekDateInput.value = initialDateKey;
    weekDateInput.max = serverDateKey || initialDateKey;
    updateCutoffRangeLabel(initialDate);
    renderTimecardTableHeader();

    weekDateInput.addEventListener('change', () => {
        const selectedDate = getSelectedDate();
        updateCutoffRangeLabel(selectedDate);
        setCutoffPaymentFeedback('', '');
        setExportStatus('', '');
        if (selectedEmployee) {
            renderTimecard(selectedEmployee);
        }
    });
}

function getAttendancePolicyForCompany(company = {}) {
    const companyCode = String(company?.company_code || company?.companyCode || '').trim().toLowerCase();
    return companyCode === 'gms'
        ? GMS_GWD_ATTENDANCE_POLICY
        : DEFAULT_ATTENDANCE_POLICY;
}

function applyAttendancePolicy(policy = DEFAULT_ATTENDANCE_POLICY) {
    currentAttendancePolicy = policy;
    if (timecardPolicyNote) {
        timecardPolicyNote.textContent = `Cutoff attendance / ${policy.dailyTargetHours}h target`;
    }
}

function normalizeAccountStatusValue(value = '') {
    return String(value || '').trim().toLowerCase();
}

function getEmployeeAccountStatus(employee) {
    const normalized = normalizeAccountStatusValue(employee?.account_status);
    if (Object.prototype.hasOwnProperty.call(ACCOUNT_STATUS_LABELS, normalized)) {
        return normalized;
    }

    return employee?.is_active === false ? 'suspended' : 'active';
}

async function resolveServerDateKey() {
    try {
        const serverInfo = await appClient.getServerInfo();
        const dateKey = String(serverInfo?.dateKey || '').trim();
        return dateKey || formatDateKey(new Date());
    } catch (_error) {
        return formatDateKey(new Date());
    }
}

async function loadEmployees(preferredEmployeeId = '', { preserveTable = false } = {}) {
    try {
        const employees = await listAttendanceUsers();
        attendanceEmployees = employees;
        employeeListDiv.innerHTML = '';

        if (!employees.length) {
            selectedEmployee = null;
            currentTimecardRows = [];
            currentCutoffPaymentState = null;
            syncPayrollControlsForEmployee(null, { force: true });
            renderPayrollSummary(null, []);
            renderCutoffPaymentState(null);
            setExportStatus('', '');
            syncExportControls();
            employeeListDiv.innerHTML = '<div class="empty-row" style="padding:12px;">No attendance accounts found.</div>';
            queueCompactLayoutCheck();
            return;
        }

        const preferredId = String(preferredEmployeeId || selectedEmployee?.id || '').trim();
        let nextSelectedEmployee = null;
        let nextSelectedElement = null;
        let firstEmployee = null;
        let firstElement = null;
        const fragment = document.createDocumentFragment();

        employees.forEach((employee, index) => {
            const div = document.createElement('div');
            const accountStatus = getEmployeeAccountStatus(employee);
            const statusClass = accountStatus !== 'active' ? ` is-${accountStatus}` : '';
            div.className = `employee-item${statusClass}`;
            div.innerHTML = `
                <div class="employee-main">
                    <img src="${appClient.escapeHtml(employee.profile_picture || appClient.buildAvatarUrl(employee.name))}" alt="${appClient.escapeHtml(employee.name)}">
                    <div class="employee-copy">
                        <strong>${appClient.escapeHtml(employee.name)}</strong>
                        <small>${appClient.escapeHtml(employee.id || '')}</small>
                    </div>
                </div>
                <span class="account-pill ${accountStatus}">${ACCOUNT_STATUS_LABELS[accountStatus] || ACCOUNT_STATUS_LABELS.active}</span>
            `;
            div.addEventListener('click', () => {
                document.querySelectorAll('.employee-item').forEach((item) => item.classList.remove('active'));
                div.classList.add('active');
                selectedEmployee = getLoadedEmployeeById(employee.id) || employee;
                void renderTimecard(selectedEmployee);
            });

            fragment.appendChild(div);

            if (!firstEmployee) {
                firstEmployee = employee;
                firstElement = div;
            }

            if (preferredId && String(employee.id || '') === preferredId) {
                nextSelectedEmployee = employee;
                nextSelectedElement = div;
            }
        });

        employeeListDiv.appendChild(fragment);

        if (!nextSelectedEmployee) {
            nextSelectedEmployee = firstEmployee;
            nextSelectedElement = firstElement;
        }

        selectedEmployee = nextSelectedEmployee;
        if (nextSelectedElement) {
            nextSelectedElement.classList.add('active');
        }

        if (selectedEmployee) {
            await renderTimecard(selectedEmployee, { preserveTable });
        }
        queueCompactLayoutCheck();
    } catch (error) {
        console.error('Failed to load employee list for time cards:', error);
        employeeListDiv.innerHTML = `<div class="empty-row is-error" style="padding:12px;">${appClient.escapeHtml(error.message)}</div>`;
        queueCompactLayoutCheck();
    }
}

function setupAutoRefresh() {
    window.addEventListener('focus', handleForegroundRefresh);
    document.addEventListener('visibilitychange', handleForegroundRefresh);
    window.setInterval(() => {
        if (document.hidden) {
            return;
        }
        void refreshSelectedTimecard();
    }, TIMECARD_REFRESH_INTERVAL_MS);
}

async function handleForegroundRefresh() {
    if (document.hidden) {
        return;
    }
    await refreshEmployeesPreservingSelection();
}

async function refreshEmployeesPreservingSelection() {
    if (employeeRefreshPromise) {
        return employeeRefreshPromise;
    }

    const preferredEmployeeId = String(selectedEmployee?.id || '').trim();
    employeeRefreshPromise = (async () => {
        serverDateKey = await resolveServerDateKey();
        if (weekDateInput) {
            weekDateInput.max = serverDateKey || weekDateInput.value;
        }
        await loadEmployees(preferredEmployeeId, { preserveTable: true });
    })();

    try {
        await employeeRefreshPromise;
    } finally {
        employeeRefreshPromise = null;
    }
}

async function refreshSelectedTimecard() {
    serverDateKey = await resolveServerDateKey();
    if (weekDateInput) {
        weekDateInput.max = serverDateKey || weekDateInput.value;
    }
    if (selectedEmployee) {
        await renderTimecard(selectedEmployee, { preserveTable: true });
    }
}

async function listAttendanceUsers() {
    const users = await appClient.listEmployees();
    return users.sort((left, right) => {
        const leftRank = getEmployeeAccountStatus(left) === 'active' ? 0 : 1;
        const rightRank = getEmployeeAccountStatus(right) === 'active' ? 0 : 1;
        if (leftRank !== rightRank) {
            return leftRank - rightRank;
        }
        return String(left.name || '').localeCompare(String(right.name || ''));
    });
}

function isHeadAdminRole(role) {
    const normalizedRole = String(role || '').trim().toLowerCase();
    return normalizedRole === 'head_admin' || normalizedRole === 'company_admin';
}

async function renderTimecard(employee, { preserveTable = false } = {}) {
    const resolvedEmployee = getLoadedEmployeeById(employee?.id) || employee;
    const previousEmployeeId = currentPayrollEmployeeId;
    selectedEmployee = resolvedEmployee;
    const requestToken = ++timecardRequestToken;
    setExportStatus('', '');
    syncExportControls();
    syncPayrollControlsForEmployee(resolvedEmployee);
    if (String(previousEmployeeId || '') !== String(resolvedEmployee?.id || '')) {
        currentTimecardRows = [];
        currentCutoffPaymentState = null;
        renderPayrollSummary(resolvedEmployee, []);
        renderCutoffPaymentState(null);
    }
    employeeNameTitle.innerText = `${resolvedEmployee.name}'s Semi-Monthly Time Card`;
    if (!preserveTable) {
        timecardTableBody.innerHTML = `<tr><td colspan="${getTimecardColumnCount()}" class="empty-row">Loading time card...</td></tr>`;
    }

    try {
        const selectedDate = getSelectedDate();
        if (weekDateInput) {
            weekDateInput.value = formatDateKey(selectedDate);
        }
        updateCutoffRangeLabel(selectedDate);

        const selectedDateKey = formatDateKey(selectedDate);
        const [rows, cutoffPaymentState] = await Promise.all([
            appClient.getUserCutoffTimeCard(resolvedEmployee.id, {
                dateKey: selectedDateKey
            }),
            isSalaryTimecardView()
                ? appClient.getUserCutoffPayrollStatus(resolvedEmployee.id, {
                    dateKey: selectedDateKey
                }).catch((error) => {
                    console.error('Failed to load cutoff payout status:', error);
                    return null;
                })
                : Promise.resolve(null)
        ]);
        if (requestToken !== timecardRequestToken) {
            return;
        }
        const normalizedRows = applySuspensionOverrides(rows, resolvedEmployee);
        currentTimecardRows = normalizedRows;
        currentCutoffPaymentState = cutoffPaymentState;
        renderPayrollSummary(resolvedEmployee, normalizedRows);
        renderCutoffPaymentState(cutoffPaymentState);
        renderTimecardRows(resolvedEmployee, normalizedRows);
        syncExportControls();
    } catch (error) {
        if (requestToken !== timecardRequestToken) {
            return;
        }
        console.error('Failed to render employee cutoff time card:', error);
        currentTimecardRows = [];
        currentCutoffPaymentState = null;
        renderPayrollSummary(resolvedEmployee, []);
        renderCutoffPaymentState(null);
        timecardTableBody.innerHTML = `<tr><td colspan="${getTimecardColumnCount()}" class="empty-row is-error">${appClient.escapeHtml(error.message)}</td></tr>`;
        syncExportControls();
        queueCompactLayoutCheck();
    }
}

function renderTimecardRows(employee, rows = []) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const showSalaryView = isSalaryTimecardView();
    timecardTableBody.innerHTML = '';

    if (!safeRows.length) {
        timecardTableBody.innerHTML = `<tr><td colspan="${getTimecardColumnCount()}" class="empty-row">No logs found for this cutoff.</td></tr>`;
        queueCompactLayoutCheck();
        return;
    }

    const fragment = document.createDocumentFragment();
    safeRows.forEach((row) => {
        const workHoursState = getWorkHoursState(row);
        const payrollState = getRowPayrollState(row, employee?.daily_salary);
        const payrollDetailKey = getPayrollDetailKey(employee, row);
        const statusLabel = getVisibleAttendanceStatusLabel(row?.status, row);
        const tr = document.createElement('tr');
        tr.innerHTML = showSalaryView
            ? `
                <td data-label="Date">${appClient.escapeHtml(row.displayDate)}</td>
                <td data-label="Time In">${appClient.escapeHtml(appClient.formatDisplayTime(row.timeIn, '-'))}</td>
                <td data-label="Time Out">${appClient.escapeHtml(appClient.formatDisplayTime(row.timeOut, '-'))}</td>
                <td data-label="Late Minutes" class="minutes-cell">
                    <span class="minutes-value ${payrollState.lateToneClass}">${appClient.escapeHtml(payrollState.lateMinutesLabel)}</span>
                </td>
                <td data-label="Early Out" class="minutes-cell">
                    <span class="minutes-value ${payrollState.earlyOutToneClass}">${appClient.escapeHtml(payrollState.earlyOutMinutesLabel)}</span>
                </td>
                <td data-label="Total Deduction" class="minutes-cell">
                    <span class="minutes-value ${payrollState.totalDeductionToneClass}">${appClient.escapeHtml(payrollState.totalDeductionMinutesLabel)}</span>
                </td>
                <td data-label="Final Pay" class="pay-cell">
                    <div class="pay-stack">
                        <span class="hours-pay ${payrollState.isPending ? 'pending' : ''}">${appClient.escapeHtml(payrollState.payLabel)}</span>
                        ${renderPayrollDetailsMarkup(payrollState.detailItems, payrollDetailKey)}
                    </div>
                </td>
                <td data-label="Status" class="${statusClass(statusLabel)}">${appClient.escapeHtml(statusLabel)}</td>
            `
            : `
                <td data-label="Date">${appClient.escapeHtml(row.displayDate)}</td>
                <td data-label="Day">${appClient.escapeHtml(row.dayLabel)}</td>
                <td data-label="Time In">${appClient.escapeHtml(appClient.formatDisplayTime(row.timeIn, '-'))}</td>
                <td data-label="Time Out">${appClient.escapeHtml(appClient.formatDisplayTime(row.timeOut, '-'))}</td>
                <td data-label="Work Hours" class="hours-cell">
                    <div class="hours-stack">
                        <span class="hours-value">${appClient.escapeHtml(workHoursState.valueLabel)}</span>
                        ${workHoursState.shortLabel
                            ? `<span class="hours-target ${workHoursState.shortTone}">${appClient.escapeHtml(workHoursState.shortLabel)}</span>`
                            : ''}
                    </div>
                </td>
                <td data-label="Status" class="${statusClass(statusLabel)}">${appClient.escapeHtml(statusLabel)}</td>
            `;
        fragment.appendChild(tr);
    });
    timecardTableBody.appendChild(fragment);
    bindRenderedPayrollDetails();
    queueCompactLayoutCheck();
}

function queueCompactLayoutCheck() {
    if (compactLayoutFrame) {
        cancelAnimationFrame(compactLayoutFrame);
    }

    compactLayoutFrame = window.requestAnimationFrame(() => {
        compactLayoutFrame = 0;
        syncCompactLayout();
    });
}

function syncCompactLayout() {
    if (!tableShell) {
        return;
    }

    document.body.classList.remove('layout-fit-tight', 'layout-fit-ultra');

    if (isTableOverflowing()) {
        document.body.classList.add('layout-fit-tight');
    }

    if (isTableOverflowing()) {
        document.body.classList.add('layout-fit-ultra');
    }
}

function isTableOverflowing() {
    if (!tableShell) {
        return false;
    }

    return tableShell.scrollWidth - tableShell.clientWidth > 1;
}

function getSelectedDate() {
    return clampToServerDate(parseInputDate(weekDateInput?.value || serverDateKey));
}

function clampToServerDate(value) {
    const selectedDate = new Date(value);
    const resolvedServerDate = parseInputDate(serverDateKey);
    return selectedDate > resolvedServerDate ? resolvedServerDate : selectedDate;
}

function parseInputDate(value) {
    if (!value) {
        return new Date();
    }

    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function getCutoffBounds(value) {
    const baseDate = new Date(value);
    const serverDate = parseInputDate(serverDateKey);
    const isFirstHalf = baseDate.getDate() <= 15;
    const rangeStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), isFirstHalf ? 1 : 16);
    const nominalRangeEnd = new Date(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        isFirstHalf ? 15 : new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate()
    );
    const rangeEnd = nominalRangeEnd > serverDate ? serverDate : nominalRangeEnd;
    return { rangeStart, rangeEnd };
}

function buildCutoffRangeLabel(value) {
    const { rangeStart, rangeEnd } = getCutoffBounds(value);
    return `Cutoff range: ${formatShortDate(rangeStart)} - ${formatShortDate(rangeEnd)}`;
}

function updateCutoffRangeLabel(value) {
    weekRangeLabel.textContent = buildCutoffRangeLabel(value);
}

function formatDateKey(value) {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeDateKey(value, fallback = '') {
    const text = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
}

function resolveSuspendedOn(employee, fallbackDateKey = serverDateKey) {
    return normalizeDateKey(employee?.suspended_on, fallbackDateKey);
}

function shouldOverrideAsSuspended(row, employee) {
    if (!row || !employee || getEmployeeAccountStatus(employee) !== 'suspended') {
        return false;
    }

    const fallbackDateKey = normalizeDateKey(serverDateKey, formatDateKey(new Date()));
    const targetDateKey = normalizeDateKey(row.dateKey, fallbackDateKey);
    const suspendedOn = resolveSuspendedOn(employee, fallbackDateKey);
    const hasClockActivity = Boolean(row.timeIn || row.timeOut);
    return Boolean(targetDateKey && suspendedOn && targetDateKey >= suspendedOn && !hasClockActivity);
}

function applySuspensionOverrides(rows, employee) {
    return (rows || []).map((row) => {
        if (!shouldOverrideAsSuspended(row, employee)) {
            return row;
        }

        return {
            ...row,
            timeIn: '',
            timeOut: '',
            lateMinutes: 0,
            lateDeductionMinutes: 0,
            earlyOutDeductionMinutes: 0,
            isPendingTimeout: false,
            totalSpanMinutes: 0,
            lunchBreakMinutes: 0,
            workedMinutes: 0,
            requiredMinutes: PAYROLL_REQUIRED_MINUTES,
            shortMinutes: 0,
            workedHours: '0.00',
            status: 'Suspended'
        };
    });
}

function formatShortDate(value) {
    return new Date(value).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function getWorkHoursState(row) {
    const workedMinutes = getWorkedMinutesForRow(row);
    const requiredMinutes = getRequiredMinutesForRow(row);
    const shortMinutes = getShortMinutesForRow(row, workedMinutes, requiredMinutes);
    const valueLabel = formatMinutesLabel(workedMinutes);
    const normalizedStatus = String(row?.status || '').trim().toLowerCase();
    const hasTimeIn = Boolean(String(row?.timeIn || '').trim());
    const hasTimeOut = Boolean(String(row?.timeOut || '').trim());
    const overtimeThresholdHours = Number(
        currentAttendancePolicy?.overtimeThresholdHours || DEFAULT_ATTENDANCE_POLICY.overtimeThresholdHours
    );
    const requiredHours = requiredMinutes / 60;
    const overtimeStartMinutes = requiredMinutes + Math.max(0, Math.round(overtimeThresholdHours * 60));

    if (normalizedStatus === 'day off') {
        return { valueLabel, shortLabel: 'Not scheduled', shortTone: 'neutral' };
    }

    if (normalizedStatus === 'holiday') {
        return { valueLabel, shortLabel: 'Holiday', shortTone: 'neutral' };
    }

    if (normalizedStatus === 'suspended') {
        return { valueLabel, shortLabel: 'Suspended', shortTone: 'neutral' };
    }

    if (normalizedStatus === 'inactive') {
        return { valueLabel, shortLabel: 'Inactive', shortTone: 'neutral' };
    }

    if (normalizedStatus === 'excuse') {
        return { valueLabel, shortLabel: 'Excused', shortTone: 'neutral' };
    }

    if (hasTimeIn && !hasTimeOut) {
        return { valueLabel, shortLabel: 'In progress', shortTone: 'progress' };
    }

    if (normalizedStatus === 'absent') {
        return { valueLabel, shortLabel: 'Absent', shortTone: 'missing' };
    }

    const overtimeMinutes = Math.max(workedMinutes - overtimeStartMinutes, 0);
    if (workedMinutes >= overtimeStartMinutes) {
        return {
            valueLabel,
            shortLabel: overtimeMinutes > 0
                ? `Overtime ${formatMinutesLabel(overtimeMinutes)}`
                : 'Overtime',
            shortTone: 'overtime'
        };
    }

    if (workedMinutes >= requiredMinutes) {
        return { valueLabel, shortLabel: `Met ${requiredHours}h target`, shortTone: 'met' };
    }

    const shortTone = !hasTimeIn && !hasTimeOut && normalizedStatus === 'absent'
        ? 'missing'
        : 'short';

    return {
        valueLabel,
        shortLabel: `Short ${formatMinutesLabel(shortMinutes)}`,
        shortTone
    };
}

function parseWorkedHours(value) {
    const parsed = Number.parseFloat(String(value ?? '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
}

function getWorkedMinutesForRow(row) {
    const directMinutes = Number(row?.workedMinutes);
    if (Number.isFinite(directMinutes) && directMinutes >= 0) {
        return Math.max(0, Math.round(directMinutes));
    }

    return Math.max(0, Math.round(parseWorkedHours(row?.workedHours) * 60));
}

function getRequiredMinutesForRow(row) {
    const directMinutes = Number(row?.requiredMinutes);
    if (Number.isFinite(directMinutes) && directMinutes > 0) {
        return Math.max(0, Math.round(directMinutes));
    }

    return PAYROLL_REQUIRED_MINUTES;
}

function getShortMinutesForRow(row, workedMinutes = getWorkedMinutesForRow(row), requiredMinutes = getRequiredMinutesForRow(row)) {
    const directMinutes = Number(row?.shortMinutes);
    if (Number.isFinite(directMinutes) && directMinutes >= 0) {
        return Math.max(0, Math.round(directMinutes));
    }

    return Math.max(0, requiredMinutes - workedMinutes);
}

function getTotalSpanMinutesForRow(row) {
    const directMinutes = Number(row?.totalSpanMinutes);
    return Number.isFinite(directMinutes) && directMinutes >= 0
        ? Math.max(0, Math.round(directMinutes))
        : 0;
}

function getLunchBreakMinutesForRow(row) {
    const directMinutes = Number(row?.lunchBreakMinutes);
    return Number.isFinite(directMinutes) && directMinutes >= 0
        ? Math.max(0, Math.round(directMinutes))
        : 0;
}

function getLateDeductionMinutesForRow(row) {
    const directMinutes = Number(row?.lateDeductionMinutes);
    if (Number.isFinite(directMinutes) && directMinutes >= 0) {
        return Math.max(0, Math.round(directMinutes));
    }

    return parseMinutesValue(row?.lateMinutes);
}

function getEarlyOutDeductionMinutesForRow(row) {
    const directMinutes = Number(row?.earlyOutDeductionMinutes);
    return Number.isFinite(directMinutes) && directMinutes >= 0
        ? Math.max(0, Math.round(directMinutes))
        : 0;
}

function getTotalDeductionMinutesForRow(
    row,
    lateDeductionMinutes = getLateDeductionMinutesForRow(row),
    earlyOutDeductionMinutes = getEarlyOutDeductionMinutesForRow(row)
) {
    const directMinutes = Number(row?.totalDeductionMinutes);
    if (Number.isFinite(directMinutes) && directMinutes >= 0) {
        return Math.max(0, Math.round(directMinutes));
    }

    return lateDeductionMinutes + earlyOutDeductionMinutes;
}

function initializePayrollControls() {
    if (saveDailySalaryButton && dailySalaryInput) {
        saveDailySalaryButton.addEventListener('click', () => {
            void saveDailySalary();
        });

        dailySalaryInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') {
                return;
            }

            event.preventDefault();
            void saveDailySalary();
        });

        dailySalaryInput.addEventListener('input', () => {
            if (payrollSaveInFlight) {
                return;
            }
            setDailySalaryStatus('', '');
        });
    }

    if (toggleCutoffPaymentButton) {
        toggleCutoffPaymentButton.addEventListener('click', () => {
            void toggleCutoffPaymentState();
        });
    }

    syncPayrollControlsForEmployee(null, { force: true });
    renderPayrollSummary(null, []);
    renderCutoffPaymentState(null);
}

function initializeTimecardViewMode() {
    syncTimecardViewMode();

    if (!normalTimeCardButton || !salaryTimeCardButton) {
        return;
    }

    normalTimeCardButton.addEventListener('click', () => {
        setTimecardViewMode('normal');
    });

    salaryTimeCardButton.addEventListener('click', () => {
        setTimecardViewMode('salary');
    });
}

function isSalaryTimecardView() {
    return timecardViewMode === 'salary';
}

function setTimecardViewMode(mode = 'normal') {
    const nextMode = mode === 'salary' ? 'salary' : 'normal';
    if (timecardViewMode === nextMode) {
        return;
    }

    timecardViewMode = nextMode;
    setExportStatus('', '');
    syncTimecardViewMode();
    if (selectedEmployee) {
        renderPayrollSummary(selectedEmployee, currentTimecardRows);
        renderTimecardRows(selectedEmployee, currentTimecardRows);
    }
}

function syncTimecardViewMode() {
    const showSalaryView = isSalaryTimecardView();
    renderTimecardTableHeader();
    document.body.classList.toggle('is-salary-timecard-view', showSalaryView);
    if (normalTimeCardButton) {
        normalTimeCardButton.classList.toggle('is-active', !showSalaryView);
        normalTimeCardButton.setAttribute('aria-pressed', String(!showSalaryView));
    }
    if (salaryTimeCardButton) {
        salaryTimeCardButton.classList.toggle('is-active', showSalaryView);
        salaryTimeCardButton.setAttribute('aria-pressed', String(showSalaryView));
    }
    if (salaryPanel) {
        salaryPanel.hidden = !showSalaryView;
    }
    syncExportControls();
}

function renderTimecardTableHeader() {
    if (!timecardHeaderRow) {
        return;
    }

    timecardHeaderRow.innerHTML = isSalaryTimecardView()
        ? `
            <th>Date</th>
            <th>Time In</th>
            <th>Time Out</th>
            <th>Late Minutes</th>
            <th>Early Out</th>
            <th>Total Deduction</th>
            <th>Final Pay</th>
            <th>Status</th>
        `
        : `
            <th>Date</th>
            <th>Day</th>
            <th>Time In</th>
            <th>Time Out</th>
            <th>Work Hours</th>
            <th>Status</th>
        `;
}

function getTimecardColumnCount() {
    return isSalaryTimecardView() ? 8 : 6;
}

function getLoadedEmployeeById(employeeId = '') {
    const targetId = String(employeeId || '').trim();
    if (!targetId) {
        return null;
    }

    return attendanceEmployees.find((employee) => String(employee?.id || '').trim() === targetId) || null;
}

function syncPayrollControlsForEmployee(employee, { force = false } = {}) {
    const employeeId = String(employee?.id || '').trim();
    const employeeChanged = employeeId !== currentPayrollEmployeeId;
    const controlsLocked = payrollSaveInFlight || cutoffPaymentSaveInFlight;
    currentPayrollEmployeeId = employeeId;

    if (dailySalaryInput) {
        const shouldRefreshValue = force || employeeChanged || document.activeElement !== dailySalaryInput;
        if (shouldRefreshValue) {
            dailySalaryInput.value = formatDailySalaryInputValue(employee?.daily_salary);
        }
        dailySalaryInput.disabled = !employeeId || controlsLocked;
    }

    if (saveDailySalaryButton) {
        saveDailySalaryButton.disabled = !employeeId || controlsLocked;
    }

    if (toggleCutoffPaymentButton) {
        toggleCutoffPaymentButton.disabled = !employeeId || controlsLocked;
    }

    if (employeeChanged) {
        setDailySalaryStatus('', '');
        setCutoffPaymentFeedback('', '');
    }

    syncExportControls();
}

function formatDailySalaryInputValue(value) {
    return roundCurrencyValue(value).toFixed(2);
}

function roundCurrencyValue(value = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return 0;
    }

    return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function normalizeCutoffPaymentStatusValue(value = '') {
    return String(value || '').trim().toLowerCase() === 'paid' ? 'paid' : 'pending';
}

function buildDefaultCutoffPaymentState(employee = selectedEmployee, dateValue = getSelectedDate()) {
    if (!employee?.id) {
        return null;
    }

    const { rangeStart, rangeEnd } = getCutoffBounds(dateValue);
    return {
        userId: String(employee.id || '').trim(),
        cutoffStartDateKey: formatDateKey(rangeStart),
        cutoffEndDateKey: formatDateKey(rangeEnd),
        payoutStatus: 'pending',
        paidAt: '',
        updatedAt: '',
        updatedBy: ''
    };
}

function formatCutoffPaymentDateTime(value = '') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }

    return parsed.toLocaleString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function setCutoffPaymentFeedback(message = '', tone = '') {
    if (!cutoffPaymentStatus) {
        return;
    }

    cutoffPaymentStatus.textContent = String(message || '');
    cutoffPaymentStatus.classList.remove('is-success', 'is-error');
    if (tone === 'success') {
        cutoffPaymentStatus.classList.add('is-success');
    } else if (tone === 'error') {
        cutoffPaymentStatus.classList.add('is-error');
    }
}

function renderCutoffPaymentState(paymentState = currentCutoffPaymentState) {
    const hasPaymentUi = cutoffPaymentStatusValue || cutoffPaymentMeta || toggleCutoffPaymentButton;
    if (!hasPaymentUi || !isSalaryTimecardView()) {
        return;
    }

    const fallbackState = buildDefaultCutoffPaymentState(selectedEmployee, getSelectedDate());
    const resolvedState = paymentState || fallbackState;
    const normalizedStatus = normalizeCutoffPaymentStatusValue(resolvedState?.payoutStatus);
    const paidAtLabel = formatCutoffPaymentDateTime(resolvedState?.paidAt);
    const updatedByLabel = String(resolvedState?.updatedBy || '').trim();

    if (cutoffPaymentStatusValue) {
        cutoffPaymentStatusValue.textContent = normalizedStatus === 'paid' ? 'Paid' : 'Pending';
        cutoffPaymentStatusValue.classList.toggle('is-paid', normalizedStatus === 'paid');
        cutoffPaymentStatusValue.classList.toggle('is-pending', normalizedStatus !== 'paid');
    }

    if (cutoffPaymentMeta) {
        if (!selectedEmployee) {
            cutoffPaymentMeta.textContent = 'Select an account to manage cutoff payout.';
        } else if (normalizedStatus === 'paid') {
            cutoffPaymentMeta.textContent = updatedByLabel && paidAtLabel
                ? `Paid ${paidAtLabel} by ${updatedByLabel}`
                : (paidAtLabel ? `Paid ${paidAtLabel}` : 'Marked as paid.');
        } else {
            cutoffPaymentMeta.textContent = 'Not yet marked as paid.';
        }
    }

    if (toggleCutoffPaymentButton) {
        toggleCutoffPaymentButton.textContent = normalizedStatus === 'paid' ? 'Mark Pending' : 'Mark Paid';
        toggleCutoffPaymentButton.setAttribute('aria-pressed', String(normalizedStatus === 'paid'));
    }

    queueCompactLayoutCheck();
}

function parseMinutesValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizePayrollStatus(status = '') {
    return String(status || '').trim().toLowerCase();
}

function formatPayrollMoney(value = 0) {
    return PHP_CURRENCY_FORMATTER.format(roundCurrencyValue(value));
}

function formatMinutesLabel(totalMinutes = 0) {
    const normalizedMinutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
    const hours = Math.floor(normalizedMinutes / 60);
    const minutes = normalizedMinutes % 60;
    if (hours > 0 && minutes > 0) {
        return `${hours}h ${minutes}m`;
    }
    if (hours > 0) {
        return `${hours}h`;
    }
    return `${minutes}m`;
}

function formatMinutesOnlyLabel(totalMinutes = 0) {
    const normalizedMinutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
    return `${normalizedMinutes}m`;
}

function formatExactMinutesLabel(totalMinutes = 0) {
    const normalizedMinutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
    return `${formatMinutesLabel(normalizedMinutes)} (${normalizedMinutes}m)`;
}

function formatDecimalHours(totalMinutes = 0) {
    const normalizedMinutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
    return `${(normalizedMinutes / 60).toFixed(2)}h`;
}

function getVisibleAttendanceStatusLabel(status = '', row = null) {
    const normalizedStatus = normalizePayrollStatus(status);
    const hasTimeIn = Boolean(String(row?.timeIn || '').trim());
    const hasTimeOut = Boolean(String(row?.timeOut || '').trim());
    const isPending = Boolean(row?.isPendingTimeout) || (hasTimeIn && !hasTimeOut);
    const lateMinutes = row
        ? Math.max(getLateDeductionMinutesForRow(row), parseMinutesValue(row?.lateMinutes))
        : 0;
    if (lateMinutes > 0) {
        return 'Late';
    }
    if (isPending) {
        return 'In Progress';
    }

    if (new Set(['day off', 'holiday', 'inactive', 'suspended', 'absent', 'excuse']).has(normalizedStatus)) {
        switch (normalizedStatus) {
            case 'day off':
                return 'Day Off';
            case 'holiday':
                return 'Holiday';
            case 'inactive':
                return 'Inactive';
            case 'suspended':
                return 'Suspended';
            case 'absent':
                return 'Absent';
            case 'excuse':
                return 'Excused';
            default:
                break;
        }
    }

    if (hasTimeIn && hasTimeOut) {
        return 'On Time';
    }

    switch (normalizedStatus) {
        case 'present':
        case 'on time':
            return 'On Time';
        default:
            return normalizedStatus
                ? normalizedStatus.replace(/\b\w/g, (character) => character.toUpperCase())
                : '-';
    }
}

function getShortMinutesState(row) {
    const normalizedStatus = normalizePayrollStatus(row?.status);
    const workedMinutes = getWorkedMinutesForRow(row);
    const requiredMinutes = getRequiredMinutesForRow(row);
    const shortMinutes = getShortMinutesForRow(row, workedMinutes, requiredMinutes);
    const hasTimeIn = Boolean(String(row?.timeIn || '').trim());
    const hasTimeOut = Boolean(String(row?.timeOut || '').trim());
    const isPending = Boolean(row?.isPendingTimeout) || (hasTimeIn && !hasTimeOut);
    if (new Set(['day off', 'holiday', 'inactive', 'suspended', 'excuse']).has(normalizedStatus)
        || isPending
        || shortMinutes <= 0) {
        return {
            valueLabel: '-',
            toneClass: 'is-empty'
        };
    }

    return {
        valueLabel: formatMinutesOnlyLabel(shortMinutes),
        toneClass: !hasTimeIn && !hasTimeOut && normalizedStatus === 'absent'
            ? 'is-missing'
            : 'is-short'
    };
}

function buildPayrollDetailItems({
    totalSpanMinutes = 0,
    lunchBreakMinutes = 0,
    workedMinutes = 0,
    shortMinutes = 0,
    dailySalary = 0,
    hourlyRate = 0
} = {}) {
    const detailItems = [];
    if (totalSpanMinutes > 0) {
        detailItems.push({
            label: 'Span',
            value: formatExactMinutesLabel(totalSpanMinutes)
        });
    }
    if (lunchBreakMinutes > 0) {
        detailItems.push({
            label: 'Lunch break',
            value: formatExactMinutesLabel(lunchBreakMinutes)
        });
    }
    if (workedMinutes > 0) {
        detailItems.push({
            label: 'Worked hours',
            value: formatMinutesLabel(workedMinutes)
        });
        detailItems.push({
            label: 'Worked minutes',
            value: formatExactMinutesLabel(workedMinutes)
        });
    }
    if (shortMinutes > 0) {
        detailItems.push({
            label: 'Short time',
            value: `${formatMinutesOnlyLabel(shortMinutes)} (${formatDecimalHours(shortMinutes)})`
        });
    }
    if (dailySalary > 0) {
        detailItems.push({
            label: 'Daily rate',
            value: formatPayrollMoney(dailySalary)
        });
    }
    if (hourlyRate > 0) {
        detailItems.push({
            label: 'Hourly rate',
            value: formatPayrollMoney(hourlyRate)
        });
    }
    return detailItems;
}

function renderPayrollDetailsMarkup(detailItems = [], detailKeyValue = '') {
    if (!Array.isArray(detailItems) || !detailItems.length) {
        return '';
    }

    const detailKey = String(detailKeyValue || '').trim();
    const shouldOpen = detailKey && openPayrollDetailKeys.has(detailKey);
    const detailRowsMarkup = detailItems.map((detailItem) => `
        <div class="hours-detail-row">
            <span>${appClient.escapeHtml(detailItem.label)}</span>
            <strong>${appClient.escapeHtml(detailItem.value)}</strong>
        </div>
    `).join('');
    return `
        <details class="hours-details" data-detail-key="${appClient.escapeHtml(detailKey)}" ${shouldOpen ? 'open' : ''}>
            <summary>View details</summary>
            <div class="hours-details-list">${detailRowsMarkup}</div>
        </details>
    `;
}

function getPayrollDetailKey(employee, row) {
    const employeeId = String(employee?.id || selectedEmployee?.id || '').trim();
    const dateKey = String(row?.dateKey || row?.displayDate || '').trim();
    if (!employeeId || !dateKey) {
        return '';
    }

    return `${employeeId}:${dateKey}`;
}

function bindRenderedPayrollDetails() {
    if (!timecardTableBody) {
        return;
    }

    const detailElements = timecardTableBody.querySelectorAll('details.hours-details[data-detail-key]');
    detailElements.forEach((detailElement) => {
        if (detailElement.dataset.toggleBound === 'true') {
            return;
        }

        detailElement.dataset.toggleBound = 'true';
        detailElement.addEventListener('toggle', () => {
            const detailKey = String(detailElement.dataset.detailKey || '').trim();
            if (!detailKey) {
                return;
            }

            if (detailElement.open) {
                openPayrollDetailKeys.add(detailKey);
                return;
            }

            openPayrollDetailKeys.delete(detailKey);
        });
    });
}

function getRowPayrollState(row, dailySalaryValue = 0) {
    const dailySalary = roundCurrencyValue(dailySalaryValue);
    const totalSpanMinutes = getTotalSpanMinutesForRow(row);
    const lunchBreakMinutes = getLunchBreakMinutesForRow(row);
    const workedMinutes = getWorkedMinutesForRow(row);
    const requiredMinutes = getRequiredMinutesForRow(row);
    const shortMinutes = getShortMinutesForRow(row, workedMinutes, requiredMinutes);
    const lateDeductionMinutes = getLateDeductionMinutesForRow(row);
    const earlyOutDeductionMinutes = getEarlyOutDeductionMinutesForRow(row);
    const totalDeductionMinutes = getTotalDeductionMinutesForRow(
        row,
        lateDeductionMinutes,
        earlyOutDeductionMinutes
    );
    const hasTimeIn = Boolean(String(row?.timeIn || '').trim());
    const hasTimeOut = Boolean(String(row?.timeOut || '').trim());
    const isPending = Boolean(row?.isPendingTimeout) || (hasTimeIn && !hasTimeOut);
    const normalizedStatus = normalizePayrollStatus(row?.status);
    const hasCompletedAttendance = hasTimeIn && hasTimeOut;
    const isPayableDay = hasCompletedAttendance
        && !ZERO_PAY_STATUSES.has(normalizedStatus);
    const rawHourlyRate = dailySalary / PAYROLL_REQUIRED_HOURS;
    const uncappedDeductionAmount = (totalDeductionMinutes / 60) * rawHourlyRate;
    const rowPay = roundCurrencyValue(Math.max(0, dailySalary - uncappedDeductionAmount));
    const deductionAmount = roundCurrencyValue(Math.max(0, dailySalary - rowPay));
    const detailItems = buildPayrollDetailItems({
        totalSpanMinutes,
        lunchBreakMinutes,
        workedMinutes,
        shortMinutes,
        dailySalary,
        hourlyRate: rawHourlyRate
    });
    const lateMinutesLabel = hasTimeIn ? formatMinutesOnlyLabel(lateDeductionMinutes) : '-';
    const earlyOutMinutesLabel = hasTimeOut ? formatMinutesOnlyLabel(earlyOutDeductionMinutes) : '-';
    const totalDeductionMinutesLabel = hasTimeOut
        ? formatMinutesOnlyLabel(totalDeductionMinutes)
        : '-';
    const lateToneClass = lateDeductionMinutes > 0 ? 'is-late' : (hasTimeIn ? 'is-empty' : 'is-empty');
    const earlyOutToneClass = earlyOutDeductionMinutes > 0 ? 'is-warning' : (hasTimeOut ? 'is-empty' : 'is-empty');
    const totalDeductionToneClass = totalDeductionMinutes > 0 ? 'is-deduction' : (hasTimeOut ? 'is-empty' : 'is-empty');

    if (isPending) {
        return {
            isPending: true,
            isPayableDay: false,
            rowPay: 0,
            deductionAmount: 0,
            lateDeductionMinutes,
            earlyOutDeductionMinutes,
            totalDeductionMinutes,
            lateMinutesLabel,
            earlyOutMinutesLabel,
            totalDeductionMinutesLabel,
            lateToneClass,
            earlyOutToneClass,
            totalDeductionToneClass,
            payLabel: 'Pending',
            detailItems
        };
    }

    if (!isPayableDay || dailySalary <= 0) {
        return {
            isPending: false,
            isPayableDay,
            rowPay: 0,
            deductionAmount: 0,
            lateDeductionMinutes,
            earlyOutDeductionMinutes,
            totalDeductionMinutes,
            lateMinutesLabel,
            earlyOutMinutesLabel,
            totalDeductionMinutesLabel,
            lateToneClass,
            earlyOutToneClass,
            totalDeductionToneClass,
            payLabel: formatPayrollMoney(0),
            detailItems
        };
    }

    return {
        isPending: false,
        isPayableDay: true,
        rowPay,
        deductionAmount,
        lateDeductionMinutes,
        earlyOutDeductionMinutes,
        totalDeductionMinutes,
        lateMinutesLabel,
        earlyOutMinutesLabel,
        totalDeductionMinutesLabel,
        lateToneClass,
        earlyOutToneClass,
        totalDeductionToneClass,
        payLabel: formatPayrollMoney(rowPay),
        detailItems
    };
}

function isPresentAttendanceDay(row) {
    const normalizedStatus = normalizePayrollStatus(row?.status);
    const hasTimeIn = Boolean(String(row?.timeIn || '').trim());
    const hasTimeOut = Boolean(String(row?.timeOut || '').trim());
    const isPending = Boolean(row?.isPendingTimeout) || (hasTimeIn && !hasTimeOut);
    if (!hasTimeIn || !hasTimeOut || isPending) {
        return false;
    }

    return !ZERO_PAY_STATUSES.has(normalizedStatus)
        && normalizedStatus !== 'holiday'
        && normalizedStatus !== 'excuse';
}

function buildPayrollSummaryState(employee, rows = []) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const dailySalary = roundCurrencyValue(employee?.daily_salary);
    return safeRows.reduce((totals, row) => {
        const payrollState = getRowPayrollState(row, dailySalary);
        if (isPresentAttendanceDay(row)) {
            totals.presentDays += 1;
        }
        if (payrollState.isPayableDay) {
            totals.totalDeductions = roundCurrencyValue(totals.totalDeductions + payrollState.deductionAmount);
            totals.netCutoffSalary = roundCurrencyValue(totals.netCutoffSalary + payrollState.rowPay);
        }
        if (payrollState.isPending) {
            totals.pendingDays += 1;
        }
        return totals;
    }, {
        presentDays: 0,
        pendingDays: 0,
        totalDeductions: 0,
        netCutoffSalary: 0
    });
}

function renderPayrollSummary(employee, rows = []) {
    if (!isSalaryTimecardView()) {
        if (presentDaysValue) {
            presentDaysValue.textContent = '0';
        }
        if (pendingDaysValue) {
            pendingDaysValue.textContent = '0';
        }
        if (totalDeductionsValue) {
            totalDeductionsValue.textContent = formatPayrollMoney(0);
        }
        if (netCutoffSalaryValue) {
            netCutoffSalaryValue.textContent = formatPayrollMoney(0);
        }
        return;
    }

    const summary = buildPayrollSummaryState(employee, rows);

    if (presentDaysValue) {
        presentDaysValue.textContent = String(summary.presentDays);
    }
    if (pendingDaysValue) {
        pendingDaysValue.textContent = String(summary.pendingDays);
    }
    if (totalDeductionsValue) {
        totalDeductionsValue.textContent = formatPayrollMoney(summary.totalDeductions);
    }
    if (netCutoffSalaryValue) {
        netCutoffSalaryValue.textContent = formatPayrollMoney(summary.netCutoffSalary);
    }

    queueCompactLayoutCheck();
}

function setDailySalaryStatus(message = '', tone = '') {
    if (!dailySalaryStatus) {
        return;
    }

    dailySalaryStatus.textContent = String(message || '');
    dailySalaryStatus.classList.remove('is-success', 'is-error');
    if (tone === 'success') {
        dailySalaryStatus.classList.add('is-success');
    } else if (tone === 'error') {
        dailySalaryStatus.classList.add('is-error');
    }
}

function parseDailySalaryInput() {
    if (!dailySalaryInput) {
        throw new Error('Daily salary input is unavailable.');
    }

    const rawValue = String(dailySalaryInput.value || '').trim();
    if (!rawValue) {
        throw new Error('Daily salary must be a non-negative number.');
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error('Daily salary must be a non-negative number.');
    }

    return roundCurrencyValue(parsed);
}

async function saveDailySalary() {
    if (!selectedEmployee || payrollSaveInFlight) {
        return;
    }

    let nextDailySalary = 0;
    try {
        nextDailySalary = parseDailySalaryInput();
    } catch (error) {
        setDailySalaryStatus(error.message || 'Invalid daily salary.', 'error');
        dailySalaryInput?.focus();
        dailySalaryInput?.select();
        return;
    }

    payrollSaveInFlight = true;
    syncPayrollControlsForEmployee(selectedEmployee);
    setDailySalaryStatus('Saving rate...', '');

    try {
        const updatedUser = await appClient.updateUser(selectedEmployee.id, {
            dailySalary: nextDailySalary
        });
        attendanceEmployees = attendanceEmployees.map((employee) => (
            String(employee?.id || '') === String(updatedUser?.id || '')
                ? { ...employee, ...updatedUser }
                : employee
        ));
        selectedEmployee = getLoadedEmployeeById(updatedUser.id) || updatedUser;
        syncPayrollControlsForEmployee(selectedEmployee, { force: true });
        renderPayrollSummary(selectedEmployee, currentTimecardRows);
        setDailySalaryStatus('Rate saved.', 'success');
    } catch (error) {
        setDailySalaryStatus(error.message || 'Failed to save daily salary.', 'error');
    } finally {
        payrollSaveInFlight = false;
        syncPayrollControlsForEmployee(selectedEmployee, { force: true });
    }
}

async function toggleCutoffPaymentState() {
    if (!selectedEmployee || cutoffPaymentSaveInFlight) {
        return;
    }

    const selectedDateKey = formatDateKey(getSelectedDate());
    const baseState = currentCutoffPaymentState || buildDefaultCutoffPaymentState(selectedEmployee, getSelectedDate());
    const currentStatus = normalizeCutoffPaymentStatusValue(baseState?.payoutStatus);
    const nextStatus = currentStatus === 'paid' ? 'pending' : 'paid';

    cutoffPaymentSaveInFlight = true;
    syncPayrollControlsForEmployee(selectedEmployee, { force: true });
    setCutoffPaymentFeedback(
        nextStatus === 'paid' ? 'Marking cutoff as paid...' : 'Returning cutoff to pending...',
        ''
    );

    try {
        const updatedState = await appClient.setUserCutoffPayrollStatus(selectedEmployee.id, {
            dateKey: selectedDateKey,
            status: nextStatus
        });
        currentCutoffPaymentState = updatedState;
        renderCutoffPaymentState(updatedState);
        setCutoffPaymentFeedback(
            nextStatus === 'paid' ? 'Cutoff marked as paid.' : 'Cutoff set to pending.',
            'success'
        );
    } catch (error) {
        renderCutoffPaymentState(currentCutoffPaymentState);
        setCutoffPaymentFeedback(error.message || 'Failed to update cutoff payout status.', 'error');
    } finally {
        cutoffPaymentSaveInFlight = false;
        syncPayrollControlsForEmployee(selectedEmployee, { force: true });
        renderCutoffPaymentState(currentCutoffPaymentState);
    }
}

function statusClass(status) {
    switch (String(status).toLowerCase()) {
        case 'present':
        case 'on time':
            return 'status-present';
        case 'late':
            return 'status-late';
        case 'absent':
            return 'status-absent';
        case 'excuse':
            return 'status-excuse';
        case 'holiday':
            return 'status-holiday';
        case 'day off':
            return 'status-day-off';
        case 'inactive':
            return 'status-inactive';
        case 'suspended':
            return 'status-suspended';
        default:
            return '';
    }
}

function initializeTimecardExportControls() {
    ensureTimecardExportStyles();

    const selectorsBar = document.querySelector('.selectors');
    if (!selectorsBar) {
        return;
    }

    let controls = document.getElementById(EXPORT_CONTROLS_ID);
    if (!controls) {
        controls = document.createElement('div');
        controls.id = EXPORT_CONTROLS_ID;
        controls.className = 'payroll-controls timecard-export-controls';
        controls.innerHTML = `
            <button type="button" class="payroll-save-button" data-export-action="pdf">Save PDF</button>
            <button type="button" class="payroll-secondary-button" data-export-action="image">Save Picture</button>
            <span class="payroll-status" data-export-status aria-live="polite"></span>
        `;
        selectorsBar.appendChild(controls);
    }

    exportPdfButton = controls.querySelector('[data-export-action="pdf"]');
    exportImageButton = controls.querySelector('[data-export-action="image"]');
    exportStatus = controls.querySelector('[data-export-status]');

    if (exportPdfButton && !exportPdfButton.dataset.bound) {
        exportPdfButton.dataset.bound = 'true';
        exportPdfButton.addEventListener('click', () => {
            void saveCurrentCutoffAsPdf();
        });
    }

    if (exportImageButton && !exportImageButton.dataset.bound) {
        exportImageButton.dataset.bound = 'true';
        exportImageButton.addEventListener('click', () => {
            void saveCurrentCutoffAsImage();
        });
    }

    syncExportControls();
}

function ensureTimecardExportStyles() {
    if (document.getElementById(EXPORT_STYLE_ELEMENT_ID)) {
        return;
    }

    const style = document.createElement('style');
    style.id = EXPORT_STYLE_ELEMENT_ID;
    style.textContent = getTimecardExportStylesheet();
    document.head.appendChild(style);
}

function getTimecardExportStylesheet() {
    return `
        .payroll-secondary-button {
            min-height: 36px;
            padding: 0 14px;
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 14px;
            background: rgba(255, 255, 255, 0.1);
            color: var(--surface-text-strong, #ffffff);
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            transition: transform 160ms ease, opacity 160ms ease, background 160ms ease;
        }

        .payroll-secondary-button:hover:not(:disabled) {
            transform: translateY(-1px);
            background: rgba(255, 255, 255, 0.16);
        }

        .payroll-secondary-button:disabled {
            cursor: wait;
            opacity: 0.7;
            transform: none;
        }

        .payroll-status:empty {
            display: none;
        }

        .timecard-export-controls {
            margin-left: auto;
            gap: 8px;
            justify-content: flex-end;
            min-width: 0;
        }

        body.is-salary-timecard-view .timecard-export-controls {
            grid-column: 1 / -1;
            justify-self: end;
            margin-left: 0;
        }

        .timecard-export-controls .payroll-status {
            min-width: 170px;
            text-align: right;
        }

        #${EXPORT_SANDBOX_ID} {
            position: fixed;
            left: -20000px;
            top: 0;
            z-index: -1;
            opacity: 0;
            pointer-events: none;
            padding: 24px;
        }

        .timecard-export-document {
            margin: 0;
            padding: 16px;
            background: #f3f6fb;
            color: #0f172a;
        }

        .timecard-export-sheet {
            position: relative;
            overflow: hidden;
            background: linear-gradient(180deg, #f8fbff 0%, #ffffff 56%, #f8fafc 100%);
            border: 1px solid #dbe5f1;
            border-radius: 24px;
            box-shadow: 0 22px 46px rgba(15, 23, 42, 0.12);
            padding: 24px;
            color: #0f172a;
            font-family: "Segoe UI", Aptos, Arial, sans-serif;
        }

        .timecard-export-sheet::before {
            content: "";
            position: absolute;
            inset: 0 0 auto;
            height: 6px;
            background: linear-gradient(90deg, #2563eb 0%, #38bdf8 52%, #0f766e 100%);
        }

        .timecard-export-sheet--normal {
            width: 820px;
            max-width: 820px;
        }

        .timecard-export-sheet--salary {
            width: 1120px;
            max-width: 1120px;
        }

        .timecard-export-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 20px;
            margin-bottom: 18px;
        }

        .timecard-export-eyebrow {
            margin: 0 0 8px;
            color: #1d4ed8;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.12em;
            text-transform: uppercase;
        }

        .timecard-export-title {
            margin: 0;
            color: #0f172a;
            font-size: 28px;
            font-weight: 700;
            line-height: 1.08;
        }

        .timecard-export-subtitle {
            margin: 8px 0 0;
            color: #475569;
            font-size: 13px;
            line-height: 1.6;
            max-width: 720px;
        }

        .timecard-export-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 36px;
            padding: 0 14px;
            border-radius: 999px;
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            color: #1d4ed8;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            white-space: nowrap;
        }

        .timecard-export-meta,
        .timecard-export-summary {
            display: grid;
            gap: 10px;
            margin-bottom: 16px;
        }

        .timecard-export-meta {
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .timecard-export-summary {
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .timecard-export-card {
            min-width: 0;
            padding: 12px 14px;
            border-radius: 18px;
            border: 1px solid #dbe5f1;
            background: rgba(248, 250, 252, 0.92);
        }

        .timecard-export-label {
            display: block;
            color: #64748b;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .timecard-export-value {
            display: block;
            margin-top: 6px;
            color: #0f172a;
            font-size: 16px;
            font-weight: 700;
            line-height: 1.2;
            overflow-wrap: anywhere;
        }

        .timecard-export-note {
            display: block;
            margin-top: 6px;
            color: #64748b;
            font-size: 11px;
            line-height: 1.45;
        }

        .timecard-export-table-wrap {
            overflow: hidden;
            border-radius: 20px;
            border: 1px solid #dbe5f1;
            background: #ffffff;
        }

        .timecard-export-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }

        .timecard-export-table th,
        .timecard-export-table td {
            padding: 9px 10px;
            border-bottom: 1px solid #e2e8f0;
            text-align: center;
            vertical-align: middle;
        }

        .timecard-export-table th {
            background: #eff6ff;
            color: #334155;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .timecard-export-table tbody tr:nth-child(even) {
            background: #f8fafc;
        }

        .timecard-export-table tbody tr:last-child td {
            border-bottom: 0;
        }

        .timecard-export-table td {
            color: #0f172a;
            font-size: 12px;
            line-height: 1.45;
            overflow-wrap: anywhere;
        }

        .timecard-export-main {
            display: block;
            font-weight: 700;
            color: #0f172a;
        }

        .timecard-export-sub {
            display: block;
            margin-top: 3px;
            color: #64748b;
            font-size: 10px;
            line-height: 1.4;
        }

        .timecard-export-status {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 28px;
            min-width: 92px;
            padding: 0 10px;
            border-radius: 999px;
            border: 1px solid transparent;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            white-space: nowrap;
        }

        .timecard-export-status.is-positive {
            background: #dcfce7;
            border-color: #86efac;
            color: #166534;
        }

        .timecard-export-status.is-late {
            background: #fef3c7;
            border-color: #fcd34d;
            color: #92400e;
        }

        .timecard-export-status.is-absent {
            background: #fee2e2;
            border-color: #fca5a5;
            color: #991b1b;
        }

        .timecard-export-status.is-progress {
            background: #dbeafe;
            border-color: #93c5fd;
            color: #1d4ed8;
        }

        .timecard-export-status.is-muted {
            background: #e2e8f0;
            border-color: #cbd5e1;
            color: #475569;
        }

        .timecard-export-status.is-neutral {
            background: #f1f5f9;
            border-color: #cbd5e1;
            color: #334155;
        }

        .timecard-export-empty {
            padding: 44px 18px;
            border-radius: 20px;
            border: 1px dashed #cbd5e1;
            background: #f8fafc;
            color: #475569;
            text-align: center;
            font-size: 13px;
            line-height: 1.6;
        }

        @media print {
            .timecard-export-document {
                padding: 0;
                background: #ffffff;
            }

            .timecard-export-sheet {
                box-shadow: none;
                border-color: #cbd5e1;
            }
        }
    `;
}

function syncExportControls() {
    const disabled = !selectedEmployee?.id || exportInFlight;
    if (exportPdfButton) {
        exportPdfButton.disabled = disabled;
    }
    if (exportImageButton) {
        exportImageButton.disabled = disabled;
    }
}

function setExportBusy(isBusy = false) {
    exportInFlight = Boolean(isBusy);
    syncExportControls();
}

function setExportStatus(message = '', tone = '') {
    if (!exportStatus) {
        return;
    }

    exportStatus.textContent = String(message || '');
    exportStatus.classList.remove('is-success', 'is-error');
    if (tone === 'success') {
        exportStatus.classList.add('is-success');
    } else if (tone === 'error') {
        exportStatus.classList.add('is-error');
    }
}

function loadExternalScript(src) {
    if (!src) {
        return Promise.reject(new Error('Script source is required.'));
    }

    if (exportScriptCache.has(src)) {
        return exportScriptCache.get(src);
    }

    const loadPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing && existing.dataset.loaded === 'true') {
            resolve();
            return;
        }

        if (existing) {
            existing.addEventListener('load', () => {
                existing.dataset.loaded = 'true';
                resolve();
            }, { once: true });
            existing.addEventListener('error', () => {
                reject(new Error(`Failed to load ${src}`));
            }, { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.dataset.loaded = 'false';
        script.addEventListener('load', () => {
            script.dataset.loaded = 'true';
            resolve();
        }, { once: true });
        script.addEventListener('error', () => {
            reject(new Error(`Failed to load ${src}`));
        }, { once: true });
        document.head.appendChild(script);
    }).catch((error) => {
        exportScriptCache.delete(src);
        throw error;
    });

    exportScriptCache.set(src, loadPromise);
    return loadPromise;
}

async function ensureHtml2Canvas() {
    if (typeof html2canvas !== 'undefined') {
        return true;
    }

    if (!html2CanvasLoadPromise) {
        html2CanvasLoadPromise = loadExternalScript(PDF_LIB_URLS.html2canvas)
            .catch((error) => {
                console.error('Failed to load html2canvas:', error);
            })
            .finally(() => {
                if (typeof html2canvas === 'undefined') {
                    html2CanvasLoadPromise = null;
                }
            });
    }

    await html2CanvasLoadPromise;
    return typeof html2canvas !== 'undefined';
}

async function ensureJsPdf() {
    if (typeof jspdf !== 'undefined') {
        return true;
    }

    if (!jsPdfLoadPromise) {
        jsPdfLoadPromise = loadExternalScript(PDF_LIB_URLS.jspdf)
            .catch((error) => {
                console.error('Failed to load jsPDF:', error);
            })
            .finally(() => {
                if (typeof jspdf === 'undefined') {
                    jsPdfLoadPromise = null;
                }
            });
    }

    await jsPdfLoadPromise;
    return typeof jspdf !== 'undefined';
}

async function ensurePdfLibraries() {
    const [canvasReady, pdfReady] = await Promise.all([
        ensureHtml2Canvas(),
        ensureJsPdf()
    ]);
    return canvasReady && pdfReady;
}

function buildCurrentTimecardExportPayload() {
    if (!selectedEmployee?.id) {
        return null;
    }

    const selectedDate = getSelectedDate();
    const { rangeStart, rangeEnd } = getCutoffBounds(selectedDate);
    const salaryView = isSalaryTimecardView();
    return {
        companyName: String(currentBootstrap?.company?.name || currentBootstrap?.branding?.companyName || 'GMS ERP').trim() || 'GMS ERP',
        companyCode: String(currentBootstrap?.company?.company_code || '').trim(),
        employee: selectedEmployee,
        accountStatusLabel: ACCOUNT_STATUS_LABELS[getEmployeeAccountStatus(selectedEmployee)] || ACCOUNT_STATUS_LABELS.active,
        salaryView,
        rows: Array.isArray(currentTimecardRows) ? currentTimecardRows : [],
        dailySalary: roundCurrencyValue(selectedEmployee?.daily_salary),
        payrollSummary: buildPayrollSummaryState(selectedEmployee, currentTimecardRows),
        cutoffPaymentState: salaryView
            ? (currentCutoffPaymentState || buildDefaultCutoffPaymentState(selectedEmployee, selectedDate))
            : null,
        rangeStart,
        rangeEnd,
        cutoffLabel: buildCutoffRangeLabel(selectedDate),
        attendanceTargetHours: Number(
            currentAttendancePolicy?.dailyTargetHours || DEFAULT_ATTENDANCE_POLICY.dailyTargetHours
        ),
        generatedAt: new Date()
    };
}

function sanitizeFileToken(value = '', fallback = 'timecard') {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || fallback;
}

function buildTimecardExportFileName(payload, extension = 'pdf') {
    const employeeToken = sanitizeFileToken(payload?.employee?.name || payload?.employee?.id, 'employee');
    const startKey = formatDateKey(payload?.rangeStart || new Date());
    const endKey = formatDateKey(payload?.rangeEnd || new Date());
    const modeToken = payload?.salaryView ? 'salary-timecard' : 'timecard';
    return `${modeToken}-${employeeToken}-${startKey}-to-${endKey}.${extension}`;
}

function escapeExportHtml(value = '') {
    return appClient.escapeHtml(String(value ?? ''));
}

function formatExportTimestamp(value = new Date()) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }

    return parsed.toLocaleString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function getTimecardExportStatusTone(statusLabel = '') {
    switch (String(statusLabel || '').trim().toLowerCase()) {
        case 'on time':
        case 'present':
            return 'is-positive';
        case 'late':
            return 'is-late';
        case 'absent':
            return 'is-absent';
        case 'in progress':
            return 'is-progress';
        case 'inactive':
        case 'suspended':
            return 'is-muted';
        default:
            return 'is-neutral';
    }
}

function buildTimecardExportStatusBadge(statusLabel = '-') {
    return `<span class="timecard-export-status ${getTimecardExportStatusTone(statusLabel)}">${escapeExportHtml(statusLabel || '-')}</span>`;
}

function buildTimecardExportSummaryMarkup(payload) {
    if (!payload?.salaryView) {
        return '';
    }

    const summary = payload.payrollSummary || buildPayrollSummaryState(payload.employee, payload.rows);
    const paymentState = payload.cutoffPaymentState || buildDefaultCutoffPaymentState(payload.employee, payload.rangeEnd);
    const normalizedPayoutStatus = normalizeCutoffPaymentStatusValue(paymentState?.payoutStatus);
    const paidAtLabel = formatCutoffPaymentDateTime(paymentState?.paidAt);
    const updatedByLabel = String(paymentState?.updatedBy || '').trim();
    const payoutNote = normalizedPayoutStatus === 'paid'
        ? (
            updatedByLabel && paidAtLabel
                ? `Paid ${paidAtLabel} by ${updatedByLabel}`
                : (paidAtLabel ? `Paid ${paidAtLabel}` : 'Marked as paid.')
        )
        : 'Not yet marked as paid.';

    return `
        <section class="timecard-export-summary">
            <article class="timecard-export-card">
                <span class="timecard-export-label">Daily Salary</span>
                <strong class="timecard-export-value">${escapeExportHtml(formatPayrollMoney(payload.dailySalary))}</strong>
            </article>
            <article class="timecard-export-card">
                <span class="timecard-export-label">Present Days</span>
                <strong class="timecard-export-value">${escapeExportHtml(String(summary.presentDays || 0))}</strong>
            </article>
            <article class="timecard-export-card">
                <span class="timecard-export-label">Pending Days</span>
                <strong class="timecard-export-value">${escapeExportHtml(String(summary.pendingDays || 0))}</strong>
            </article>
            <article class="timecard-export-card">
                <span class="timecard-export-label">Total Deductions</span>
                <strong class="timecard-export-value">${escapeExportHtml(formatPayrollMoney(summary.totalDeductions || 0))}</strong>
            </article>
            <article class="timecard-export-card">
                <span class="timecard-export-label">Net Cutoff Salary</span>
                <strong class="timecard-export-value">${escapeExportHtml(formatPayrollMoney(summary.netCutoffSalary || 0))}</strong>
            </article>
            <article class="timecard-export-card">
                <span class="timecard-export-label">Payout Status</span>
                <strong class="timecard-export-value">${escapeExportHtml(normalizedPayoutStatus === 'paid' ? 'Paid' : 'Pending')}</strong>
                <span class="timecard-export-note">${escapeExportHtml(payoutNote)}</span>
            </article>
        </section>
    `;
}

function buildTimecardExportRowsMarkup(payload) {
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    if (!rows.length) {
        return '';
    }

    return rows.map((row) => {
        const statusLabel = getVisibleAttendanceStatusLabel(row?.status, row);
        if (payload.salaryView) {
            const payrollState = getRowPayrollState(row, payload.dailySalary);
            const payNote = payrollState.isPending
                ? 'Pending timeout'
                : (payrollState.isPayableDay
                    ? `${formatPayrollMoney(payrollState.deductionAmount)} deduction`
                    : 'No payable hours');

            return `
                <tr>
                    <td>${escapeExportHtml(row.displayDate || row.dateKey || '-')}</td>
                    <td>${escapeExportHtml(appClient.formatDisplayTime(row.timeIn, '-'))}</td>
                    <td>${escapeExportHtml(appClient.formatDisplayTime(row.timeOut, '-'))}</td>
                    <td>${escapeExportHtml(payrollState.lateMinutesLabel)}</td>
                    <td>${escapeExportHtml(payrollState.earlyOutMinutesLabel)}</td>
                    <td>${escapeExportHtml(payrollState.totalDeductionMinutesLabel)}</td>
                    <td>
                        <span class="timecard-export-main">${escapeExportHtml(payrollState.payLabel)}</span>
                        <span class="timecard-export-sub">${escapeExportHtml(payNote)}</span>
                    </td>
                    <td>${buildTimecardExportStatusBadge(statusLabel)}</td>
                </tr>
            `;
        }

        const workHoursState = getWorkHoursState(row);
        return `
            <tr>
                <td>${escapeExportHtml(row.displayDate || row.dateKey || '-')}</td>
                <td>${escapeExportHtml(row.dayLabel || '-')}</td>
                <td>${escapeExportHtml(appClient.formatDisplayTime(row.timeIn, '-'))}</td>
                <td>${escapeExportHtml(appClient.formatDisplayTime(row.timeOut, '-'))}</td>
                <td>
                    <span class="timecard-export-main">${escapeExportHtml(workHoursState.valueLabel)}</span>
                    ${workHoursState.shortLabel ? `<span class="timecard-export-sub">${escapeExportHtml(workHoursState.shortLabel)}</span>` : ''}
                </td>
                <td>${buildTimecardExportStatusBadge(statusLabel)}</td>
            </tr>
        `;
    }).join('');
}

function buildTimecardExportTableMarkup(payload) {
    const rowsMarkup = buildTimecardExportRowsMarkup(payload);
    if (!rowsMarkup) {
        return `
            <div class="timecard-export-empty">
                No logs found for this cutoff.
            </div>
        `;
    }

    const headerMarkup = payload.salaryView
        ? `
            <tr>
                <th>Date</th>
                <th>Time In</th>
                <th>Time Out</th>
                <th>Late Minutes</th>
                <th>Early Out</th>
                <th>Total Deduction</th>
                <th>Final Pay</th>
                <th>Status</th>
            </tr>
        `
        : `
            <tr>
                <th>Date</th>
                <th>Day</th>
                <th>Time In</th>
                <th>Time Out</th>
                <th>Work Hours</th>
                <th>Status</th>
            </tr>
        `;

    return `
        <div class="timecard-export-table-wrap">
            <table class="timecard-export-table">
                <thead>${headerMarkup}</thead>
                <tbody>${rowsMarkup}</tbody>
            </table>
        </div>
    `;
}

function buildTimecardExportMarkup(payload) {
    const companyLine = payload.companyCode
        ? `${payload.companyName} (${payload.companyCode})`
        : payload.companyName;
    const subtitle = payload.salaryView
        ? 'Semi-monthly cutoff time card with payroll-ready salary summary.'
        : 'Semi-monthly cutoff attendance time card.';

    return `
        <section class="timecard-export-sheet ${payload.salaryView ? 'timecard-export-sheet--salary' : 'timecard-export-sheet--normal'}">
            <div class="timecard-export-header">
                <div>
                    <p class="timecard-export-eyebrow">${escapeExportHtml(companyLine)}</p>
                    <h1 class="timecard-export-title">Employee Time Card Report</h1>
                    <p class="timecard-export-subtitle">${escapeExportHtml(subtitle)}</p>
                </div>
                <div class="timecard-export-badge">${escapeExportHtml(payload.salaryView ? 'Salary View' : 'Time Card View')}</div>
            </div>

            <section class="timecard-export-meta">
                <article class="timecard-export-card">
                    <span class="timecard-export-label">Employee</span>
                    <strong class="timecard-export-value">${escapeExportHtml(payload.employee?.name || '-')}</strong>
                </article>
                <article class="timecard-export-card">
                    <span class="timecard-export-label">Account ID</span>
                    <strong class="timecard-export-value">${escapeExportHtml(payload.employee?.id || '-')}</strong>
                </article>
                <article class="timecard-export-card">
                    <span class="timecard-export-label">Account Status</span>
                    <strong class="timecard-export-value">${escapeExportHtml(payload.accountStatusLabel || '-')}</strong>
                </article>
                <article class="timecard-export-card">
                    <span class="timecard-export-label">Cutoff Range</span>
                    <strong class="timecard-export-value">${escapeExportHtml(`${formatShortDate(payload.rangeStart)} - ${formatShortDate(payload.rangeEnd)}`)}</strong>
                </article>
                <article class="timecard-export-card">
                    <span class="timecard-export-label">Generated</span>
                    <strong class="timecard-export-value">${escapeExportHtml(formatExportTimestamp(payload.generatedAt))}</strong>
                </article>
                <article class="timecard-export-card">
                    <span class="timecard-export-label">Daily Target</span>
                    <strong class="timecard-export-value">${escapeExportHtml(`${payload.attendanceTargetHours}h / day`)}</strong>
                    <span class="timecard-export-note">${escapeExportHtml(payload.cutoffLabel)}</span>
                </article>
            </section>

            ${buildTimecardExportSummaryMarkup(payload)}
            ${buildTimecardExportTableMarkup(payload)}
        </section>
    `;
}

function ensureTimecardExportSandbox() {
    let sandbox = document.getElementById(EXPORT_SANDBOX_ID);
    if (!sandbox) {
        sandbox = document.createElement('div');
        sandbox.id = EXPORT_SANDBOX_ID;
        document.body.appendChild(sandbox);
    }
    return sandbox;
}

function waitForNextPaint() {
    return new Promise((resolve) => {
        requestAnimationFrame(() => {
            requestAnimationFrame(resolve);
        });
    });
}

async function renderTimecardExportCanvas(payload) {
    if (typeof html2canvas === 'undefined') {
        throw new Error('Export image library is unavailable.');
    }

    const sandbox = ensureTimecardExportSandbox();
    sandbox.innerHTML = buildTimecardExportMarkup(payload);

    try {
        const sheet = sandbox.querySelector('.timecard-export-sheet');
        if (!sheet) {
            throw new Error('Time card export layout is unavailable.');
        }

        await waitForNextPaint();
        return await html2canvas(sheet, {
            backgroundColor: '#f3f6fb',
            scale: Math.max(2, Math.min(3, window.devicePixelRatio || 1)),
            useCORS: true,
            logging: false
        });
    } finally {
        sandbox.innerHTML = '';
    }
}

function canvasToBlob(canvas, type = 'image/png') {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
                return;
            }
            reject(new Error('Failed to prepare the export file.'));
        }, type);
    });
}

function downloadBlob(blob, fileName) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
    }, 1000);
}

function buildTimecardExportDocumentHtml(payload, { autoPrint = false } = {}) {
    const autoPrintScript = autoPrint
        ? `
            <script>
                window.addEventListener('load', function () {
                    window.setTimeout(function () {
                        window.focus();
                        window.print();
                    }, 180);
                });
            </script>
        `
        : '';
    const orientation = payload.salaryView ? 'landscape' : 'portrait';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeExportHtml(buildTimecardExportFileName(payload, 'pdf'))}</title>
<style>
  @page { size: A4 ${orientation}; margin: 10mm; }
  ${getTimecardExportStylesheet()}
</style>
</head>
<body class="timecard-export-document">
${buildTimecardExportMarkup(payload)}
${autoPrintScript}
</body>
</html>
    `;
}

function openTimecardExportPrintView(payload, { autoPrint = false } = {}) {
    const popup = window.open('', '_blank', 'width=1280,height=960');
    if (!popup) {
        setExportStatus('Allow pop-ups to save the report as PDF.', 'error');
        return false;
    }

    popup.document.open();
    popup.document.write(buildTimecardExportDocumentHtml(payload, { autoPrint }));
    popup.document.close();
    return true;
}

async function saveCurrentCutoffAsPdf() {
    const payload = buildCurrentTimecardExportPayload();
    if (!payload) {
        setExportStatus('Select an account first.', 'error');
        return;
    }

    const fallbackToPrint = () => {
        if (openTimecardExportPrintView(payload, { autoPrint: true })) {
            setExportStatus('Print dialog opened. Choose Save as PDF.', '');
        }
    };

    setExportBusy(true);
    try {
        if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
            setExportStatus('Loading PDF tools...', '');
            const librariesReady = await ensurePdfLibraries();
            if (!librariesReady) {
                fallbackToPrint();
                return;
            }
        }

        setExportStatus('Preparing PDF...', '');
        const canvas = await renderTimecardExportCanvas(payload);
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: payload.salaryView ? 'l' : 'p',
            unit: 'pt',
            format: 'a4'
        });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 20;
        const usableWidth = pageWidth - margin * 2;
        const usableHeight = pageHeight - margin * 2;
        const imgWidth = usableWidth;
        const imgHeight = canvas.height * (imgWidth / canvas.width);
        let heightLeft = imgHeight;
        let position = margin;

        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= usableHeight;

        while (heightLeft > 0) {
            pdf.addPage();
            position = margin - (imgHeight - heightLeft);
            pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
            heightLeft -= usableHeight;
        }

        pdf.save(buildTimecardExportFileName(payload, 'pdf'));
        setExportStatus('PDF saved.', 'success');
    } catch (error) {
        console.error('Failed to generate time card PDF:', error);
        fallbackToPrint();
    } finally {
        setExportBusy(false);
    }
}

async function saveCurrentCutoffAsImage() {
    const payload = buildCurrentTimecardExportPayload();
    if (!payload) {
        setExportStatus('Select an account first.', 'error');
        return;
    }

    setExportBusy(true);
    try {
        if (typeof html2canvas === 'undefined') {
            setExportStatus('Loading image tools...', '');
            const canvasReady = await ensureHtml2Canvas();
            if (!canvasReady) {
                setExportStatus('Picture export is unavailable right now.', 'error');
                return;
            }
        }

        setExportStatus('Preparing picture...', '');
        const canvas = await renderTimecardExportCanvas(payload);
        const blob = await canvasToBlob(canvas, 'image/png');
        downloadBlob(blob, buildTimecardExportFileName(payload, 'png'));
        setExportStatus('Picture saved.', 'success');
    } catch (error) {
        console.error('Failed to save time card picture:', error);
        setExportStatus(error.message || 'Failed to save picture.', 'error');
    } finally {
        setExportBusy(false);
    }
}
