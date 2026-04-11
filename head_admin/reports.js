const appClient = window.appClient;
const employeeFilter = document.getElementById('employeeFilter');
const rangeFilter = document.getElementById('rangeFilter');
const dateFilter = document.getElementById('dateFilter');
const filterBtn = document.getElementById('filterBtn');
const reportBody = document.getElementById('reportBody');
const recordCount = document.getElementById('recordCount');
const totalLate = document.getElementById('totalLate');
const totalAbsent = document.getElementById('totalAbsent');
const totalSuspended = document.getElementById('totalSuspended');
const reportStatus = document.getElementById('reportStatus');
const exportMonthInput = document.getElementById('exportMonth');
const exportExcelBtn = document.getElementById('exportExcelBtn');
const exportStatus = document.getElementById('exportStatus');
let serverDateKey = new Date().toISOString().slice(0, 10);
const ACCOUNT_STATUS_LABELS = Object.freeze({
    active: 'Active',
    inactive: 'Inactive',
    suspended: 'Suspended'
});

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    try {
        const bootstrap = await appClient.getBootstrap();
        appClient.applyBootstrapBrandTheme(bootstrap);
    } catch (error) {
        console.error('Failed to load head admin branding for attendance reports:', error);
    }

    try {
        const serverInfo = await appClient.getServerInfo();
        serverDateKey = String(serverInfo?.dateKey || '').trim() || new Date().toISOString().slice(0, 10);
        dateFilter.value = serverDateKey;
        setExportMonth(serverDateKey);
    } catch (_error) {
        serverDateKey = new Date().toISOString().slice(0, 10);
        dateFilter.value = serverDateKey;
        setExportMonth(serverDateKey);
    }

    filterBtn.addEventListener('click', renderReport);
    employeeFilter.addEventListener('change', renderReport);
    rangeFilter.addEventListener('change', renderReport);
    dateFilter.addEventListener('change', renderReport);
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', handleExportExcel);
    }

    await populateEmployees();
    await renderReport();
}

async function populateEmployees() {
    try {
        const employees = await listAttendanceUsers();
        employeeFilter.innerHTML = '<option value="all">All Accounts</option>';

        employees.forEach((employee) => {
            const option = document.createElement('option');
            option.value = employee.id;
            option.textContent = employee.name;
            employeeFilter.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to populate employees for reports:', error);
        reportBody.innerHTML = `<tr><td colspan="6" class="empty-row is-error">${appClient.escapeHtml(error.message)}</td></tr>`;
        setReportStatus(error.message, true);
    }
}

async function listAttendanceUsers() {
    const users = await appClient.listUsers();
    return users.filter((user) => !isHeadAdminRole(user.role));
}

function isHeadAdminRole(role) {
    const normalizedRole = String(role || '').trim().toLowerCase();
    return normalizedRole === 'head_admin' || normalizedRole === 'company_admin';
}

function normalizeAccountStatusValue(value = '') {
    return String(value || '').trim().toLowerCase();
}

function getUserAccountStatus(user) {
    const normalized = normalizeAccountStatusValue(user?.account_status);
    if (Object.prototype.hasOwnProperty.call(ACCOUNT_STATUS_LABELS, normalized)) {
        return normalized;
    }

    return user?.is_active === false ? 'suspended' : 'active';
}

async function renderReport() {
    try {
        const [records, attendanceUsers] = await Promise.all([
            appClient.getAttendanceReport({
                employeeId: employeeFilter.value,
                range: rangeFilter.value,
                dateKey: dateFilter.value
            }),
            listAttendanceUsers()
        ]);
        const normalizedRecords = applySuspensionOverrides(records, attendanceUsers, dateFilter.value || serverDateKey);

        reportBody.innerHTML = '';
        setReportStatus('', false);

        if (!normalizedRecords.length) {
            reportBody.innerHTML = '<tr><td colspan="6" class="empty-row">No attendance records found for the selected filter.</td></tr>';
            recordCount.innerText = '0';
            totalLate.innerText = '0';
            totalAbsent.innerText = '0';
            totalSuspended.innerText = '0';
            return;
        }

        let lateTotal = 0;
        let absentTotal = 0;
        let suspendedTotal = 0;
        recordCount.innerText = String(normalizedRecords.length);

        normalizedRecords.forEach((record) => {
            lateTotal += Number(record.lateMinutes || 0);
            const normalizedStatus = String(record.status).toLowerCase();
            if (normalizedStatus === 'absent') {
                absentTotal += 1;
            }
            if (normalizedStatus === 'suspended') {
                suspendedTotal += 1;
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td data-label="Date">${appClient.escapeHtml(record.displayDate || record.dateKey || '-')}</td>
                <td data-label="Account">${appClient.escapeHtml(record.name)}</td>
                <td data-label="Time In">${appClient.escapeHtml(appClient.formatDisplayTime(record.timeIn, '-'))}</td>
                <td data-label="Time Out">${appClient.escapeHtml(appClient.formatDisplayTime(record.timeOut, '-'))}</td>
                <td data-label="Minutes Late">${appClient.escapeHtml(String(record.lateMinutes || 0))}</td>
                <td data-label="Status" class="${statusClass(record.status)}">${appClient.escapeHtml(record.status)}</td>
            `;
            reportBody.appendChild(row);
        });

        totalLate.innerText = String(lateTotal);
        totalAbsent.innerText = String(absentTotal);
        totalSuspended.innerText = String(suspendedTotal);
    } catch (error) {
        console.error('Failed to render attendance report:', error);
        reportBody.innerHTML = `<tr><td colspan="6" class="empty-row is-error">${appClient.escapeHtml(error.message)}</td></tr>`;
        recordCount.innerText = '0';
        totalLate.innerText = '0';
        totalAbsent.innerText = '0';
        totalSuspended.innerText = '0';
        setReportStatus(error.message, true);
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
        case 'inactive':
            return 'status-inactive';
        case 'suspended':
            return 'status-suspended';
        default:
            return 'status-excused';
    }
}

function normalizeDateKey(value, fallback = '') {
    const text = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
}

function resolveSuspendedOn(user, fallbackDateKey) {
    return normalizeDateKey(user?.suspended_on, fallbackDateKey);
}

function shouldOverrideAsSuspended(record, user, fallbackDateKey) {
    if (!record || !user || getUserAccountStatus(user) !== 'suspended') {
        return false;
    }

    const targetDateKey = normalizeDateKey(record.dateKey, fallbackDateKey);
    const suspendedOn = resolveSuspendedOn(user, fallbackDateKey);
    const hasClockActivity = Boolean(record.timeIn || record.timeOut);
    return Boolean(targetDateKey && suspendedOn && targetDateKey >= suspendedOn && !hasClockActivity);
}

function applySuspensionOverrides(records, users, fallbackDateKey) {
    const userMap = new Map((users || []).map((user) => [String(user.id || ''), user]));
    return (records || []).map((record) => {
        const matchedUser = userMap.get(String(record.id || ''));
        if (!shouldOverrideAsSuspended(record, matchedUser, fallbackDateKey)) {
            return record;
        }

        return {
            ...record,
            timeIn: '',
            timeOut: '',
            lateMinutes: 0,
            status: 'Suspended'
        };
    });
}

function setReportStatus(message, isError) {
    if (!reportStatus) {
        return;
    }

    reportStatus.textContent = message || '';
    reportStatus.className = `report-status${isError ? ' is-error' : ''}`;
}

function setExportMonth(dateKey) {
    if (!exportMonthInput) {
        return;
    }

    const monthKey = normalizeMonthKey(dateKey);
    if (monthKey) {
        exportMonthInput.value = monthKey;
    }
}

function normalizeMonthKey(value, fallback = '') {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
    if (match) {
        const year = match[1];
        const month = match[2];
        const monthNumber = Number(month);
        if (monthNumber >= 1 && monthNumber <= 12) {
            return `${year}-${month}`;
        }
    }

    if (fallback) {
        return normalizeMonthKey(fallback, '');
    }

    return '';
}

function setExportStatus(message, isError) {
    if (!exportStatus) {
        return;
    }

    exportStatus.textContent = message || '';
    exportStatus.className = `report-status${isError ? ' is-error' : ''}`;
}

async function handleExportExcel() {
    if (!exportExcelBtn || !exportMonthInput) {
        return;
    }

    const monthKey = normalizeMonthKey(exportMonthInput.value, serverDateKey);
    if (!monthKey) {
        setExportStatus('Please choose a valid month (YYYY-MM).', true);
        return;
    }

    exportExcelBtn.disabled = true;
    setExportStatus('Preparing Excel export. Please wait...', false);

    try {
        const { blob, filename } = await fetchMonthlyExcel(monthKey);
        const finalName = filename || `GMS_Reports_${monthKey}.xlsx`;
        triggerExcelDownload(blob, finalName);
        setExportStatus(`Excel export ready for ${monthKey}. Check your downloads.`, false);
    } catch (error) {
        console.error('Failed to export monthly Excel:', error);
        setExportStatus(error.message || 'Failed to export Excel.', true);
    } finally {
        exportExcelBtn.disabled = false;
    }
}

async function fetchMonthlyExcel(monthKey) {
    const response = await fetch(`/api/reports/export-excel?month=${encodeURIComponent(monthKey)}`, {
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
        if (payload?.success === false) {
            throw new Error(payload.error || 'Export failed.');
        }
        throw new Error('Unexpected response when downloading the Excel file.');
    }

    const blob = await response.blob();
    const filename = parseFilenameFromHeader(response.headers.get('content-disposition'));
    return { blob, filename };
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

function triggerExcelDownload(blob, filename) {
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = filename || 'monthly-report.xlsx';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
