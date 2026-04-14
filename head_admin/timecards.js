const appClient = window.appClient;
const employeeListDiv = document.getElementById('employeeList');
const timecardTableBody = document.getElementById('timecardTableBody');
const employeeNameTitle = document.getElementById('employeeNameTitle');
const weekDateInput = document.getElementById('weekDate');
const weekRangeLabel = document.getElementById('weekRangeLabel');
const timecardPolicyNote = document.getElementById('timecardPolicyNote');
const tableShell = document.querySelector('.table-shell');
const DEFAULT_ATTENDANCE_POLICY = Object.freeze({
    dailyTargetHours: 9,
    overtimeThresholdHours: 1
});
const GMS_GWD_ATTENDANCE_POLICY = Object.freeze({
    dailyTargetHours: 8,
    overtimeThresholdHours: 1
});
const ACCOUNT_STATUS_LABELS = Object.freeze({
    active: 'Active',
    inactive: 'Inactive',
    suspended: 'Suspended'
});

let selectedEmployee = null;
let serverDateKey = formatDateKey(new Date());
let currentAttendancePolicy = DEFAULT_ATTENDANCE_POLICY;
let compactLayoutFrame = 0;

initialize();
window.addEventListener('resize', queueCompactLayoutCheck);

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    try {
        const bootstrap = await appClient.getBootstrap();
        appClient.applyBootstrapBrandTheme(bootstrap);
        applyAttendancePolicy(getAttendancePolicyForCompany(bootstrap?.company));
    } catch (error) {
        console.error('Failed to load head admin branding for time cards:', error);
        applyAttendancePolicy(DEFAULT_ATTENDANCE_POLICY);
    }

    serverDateKey = await resolveServerDateKey();
    initSelectors(serverDateKey);
    await loadEmployees();
}

function initSelectors(dateKey) {
    const initialDate = clampToServerDate(parseInputDate(dateKey));
    const initialDateKey = formatDateKey(initialDate);
    weekDateInput.value = initialDateKey;
    weekDateInput.max = serverDateKey || initialDateKey;
    updateCutoffRangeLabel(initialDate);

    weekDateInput.addEventListener('change', () => {
        const selectedDate = getSelectedDate();
        updateCutoffRangeLabel(selectedDate);
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

async function loadEmployees() {
    try {
        const employees = await listAttendanceUsers();
        employeeListDiv.innerHTML = '';

        if (!employees.length) {
            employeeListDiv.innerHTML = '<div class="empty-row" style="padding:12px;">No attendance accounts found.</div>';
            queueCompactLayoutCheck();
            return;
        }

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
                selectedEmployee = employee;
                renderTimecard(employee);
            });

            employeeListDiv.appendChild(div);

            if (index === 0) {
                div.classList.add('active');
                selectedEmployee = employee;
            }
        });

        if (selectedEmployee) {
            await renderTimecard(selectedEmployee);
        }
        queueCompactLayoutCheck();
    } catch (error) {
        console.error('Failed to load employee list for time cards:', error);
        employeeListDiv.innerHTML = `<div class="empty-row is-error" style="padding:12px;">${appClient.escapeHtml(error.message)}</div>`;
        queueCompactLayoutCheck();
    }
}

async function listAttendanceUsers() {
    const users = await appClient.listUsers();
    return users
        .filter((user) => !isHeadAdminRole(user.role))
        .sort((left, right) => {
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

async function renderTimecard(employee) {
    employeeNameTitle.innerText = `${employee.name}'s Semi-Monthly Time Card`;
    timecardTableBody.innerHTML = '';

    try {
        const selectedDate = getSelectedDate();
        if (weekDateInput) {
            weekDateInput.value = formatDateKey(selectedDate);
        }
        updateCutoffRangeLabel(selectedDate);

        const rows = await appClient.getUserCutoffTimeCard(employee.id, {
            dateKey: formatDateKey(selectedDate)
        });
        const normalizedRows = applySuspensionOverrides(rows, employee);

        timecardTableBody.innerHTML = '';

        if (!normalizedRows.length) {
            timecardTableBody.innerHTML = '<tr><td colspan="6" class="empty-row">No logs found for this cutoff.</td></tr>';
            queueCompactLayoutCheck();
            return;
        }

        normalizedRows.forEach((row) => {
            const workHoursState = getWorkHoursState(row);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Date">${appClient.escapeHtml(row.displayDate)}</td>
                <td data-label="Day">${appClient.escapeHtml(row.dayLabel)}</td>
                <td data-label="Time In">${appClient.escapeHtml(appClient.formatDisplayTime(row.timeIn))}</td>
                <td data-label="Time Out">${appClient.escapeHtml(appClient.formatDisplayTime(row.timeOut))}</td>
                <td data-label="Work Hours" class="hours-cell">
                    <div class="hours-stack">
                        <span class="hours-value">${appClient.escapeHtml(workHoursState.valueLabel)}</span>
                        <span class="hours-target ${workHoursState.tone}">${appClient.escapeHtml(workHoursState.targetLabel)}</span>
                    </div>
                </td>
                <td data-label="Status" class="${statusClass(row.status)}">${appClient.escapeHtml(row.status)}</td>
            `;
            timecardTableBody.appendChild(tr);
        });
        queueCompactLayoutCheck();
    } catch (error) {
        console.error('Failed to render employee cutoff time card:', error);
        timecardTableBody.innerHTML = `<tr><td colspan="6" class="empty-row is-error">${appClient.escapeHtml(error.message)}</td></tr>`;
        queueCompactLayoutCheck();
    }
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

    return tableShell.scrollHeight - tableShell.clientHeight > 1;
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

function updateCutoffRangeLabel(value) {
    const { rangeStart, rangeEnd } = getCutoffBounds(value);
    weekRangeLabel.textContent = `Cutoff range: ${formatShortDate(rangeStart)} - ${formatShortDate(rangeEnd)}`;
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
    const workedHours = parseWorkedHours(row?.workedHours);
    const valueLabel = `${workedHours.toFixed(2)} hrs`;
    const normalizedStatus = String(row?.status || '').trim().toLowerCase();
    const hasTimeIn = Boolean(String(row?.timeIn || '').trim());
    const hasTimeOut = Boolean(String(row?.timeOut || '').trim());
    const dailyTargetHours = Number(currentAttendancePolicy?.dailyTargetHours || DEFAULT_ATTENDANCE_POLICY.dailyTargetHours);
    const overtimeThresholdHours = Number(
        currentAttendancePolicy?.overtimeThresholdHours || DEFAULT_ATTENDANCE_POLICY.overtimeThresholdHours
    );
    const overtimeStartHours = dailyTargetHours + overtimeThresholdHours;

    if (normalizedStatus === 'day off') {
        return { valueLabel, targetLabel: 'Not scheduled', tone: 'neutral' };
    }

    if (normalizedStatus === 'holiday') {
        return { valueLabel, targetLabel: 'Holiday', tone: 'neutral' };
    }

    if (normalizedStatus === 'suspended') {
        return { valueLabel, targetLabel: 'Suspended', tone: 'neutral' };
    }

    if (normalizedStatus === 'inactive') {
        return { valueLabel, targetLabel: 'Inactive', tone: 'neutral' };
    }

    if (normalizedStatus === 'excuse') {
        return { valueLabel, targetLabel: 'Excused', tone: 'neutral' };
    }

    if (hasTimeIn && !hasTimeOut) {
        return { valueLabel, targetLabel: 'In progress', tone: 'progress' };
    }

    if (normalizedStatus === 'absent') {
        return { valueLabel, targetLabel: 'Absent', tone: 'missing' };
    }

    const overtimeHours = Math.max(workedHours - overtimeStartHours, 0);
    if (workedHours >= overtimeStartHours) {
        return {
            valueLabel,
            targetLabel: overtimeHours > 0
                ? `Overtime ${overtimeHours.toFixed(2)}h`
                : 'Overtime',
            tone: 'overtime'
        };
    }

    if (workedHours >= dailyTargetHours) {
        return { valueLabel, targetLabel: `Met ${dailyTargetHours}h target`, tone: 'met' };
    }

    const shortHours = Math.max(dailyTargetHours - workedHours, 0);
    const tone = !hasTimeIn && !hasTimeOut && normalizedStatus === 'absent'
        ? 'missing'
        : 'short';

    return {
        valueLabel,
        targetLabel: `Short ${shortHours.toFixed(2)}h`,
        tone
    };
}

function parseWorkedHours(value) {
    const parsed = Number.parseFloat(String(value ?? '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
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
