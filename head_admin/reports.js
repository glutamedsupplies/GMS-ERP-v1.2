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
        dateFilter.value = String(serverInfo?.dateKey || '').trim() || new Date().toISOString().slice(0, 10);
    } catch (_error) {
        dateFilter.value = new Date().toISOString().slice(0, 10);
    }

    filterBtn.addEventListener('click', renderReport);
    employeeFilter.addEventListener('change', renderReport);
    rangeFilter.addEventListener('change', renderReport);
    dateFilter.addEventListener('change', renderReport);

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

async function renderReport() {
    try {
        const records = await appClient.getAttendanceReport({
            employeeId: employeeFilter.value,
            range: rangeFilter.value,
            dateKey: dateFilter.value
        });

        reportBody.innerHTML = '';
        setReportStatus('', false);

        if (!records.length) {
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
        recordCount.innerText = String(records.length);

        records.forEach((record) => {
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
        case 'suspended':
            return 'status-suspended';
        default:
            return 'status-excused';
    }
}

function setReportStatus(message, isError) {
    if (!reportStatus) {
        return;
    }

    reportStatus.textContent = message || '';
    reportStatus.className = `report-status${isError ? ' is-error' : ''}`;
}
