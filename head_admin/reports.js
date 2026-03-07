const appClient = window.appClient;
const employeeFilter = document.getElementById('employeeFilter');
const rangeFilter = document.getElementById('rangeFilter');
const dateFilter = document.getElementById('dateFilter');
const filterBtn = document.getElementById('filterBtn');
const reportBody = document.getElementById('reportBody');
const totalLate = document.getElementById('totalLate');
const totalAbsent = document.getElementById('totalAbsent');

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    dateFilter.value = new Date().toISOString().slice(0, 10);

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
        reportBody.innerHTML = `<tr><td colspan="6">${appClient.escapeHtml(error.message)}</td></tr>`;
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

        if (!records.length) {
            reportBody.innerHTML = '<tr><td colspan="6">No attendance records found for the selected filter.</td></tr>';
            totalLate.innerText = '0';
            totalAbsent.innerText = '0';
            return;
        }

        let lateTotal = 0;
        let absentTotal = 0;

        records.forEach((record) => {
            lateTotal += Number(record.lateMinutes || 0);
            if (String(record.status).toLowerCase() === 'absent') {
                absentTotal += 1;
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${appClient.escapeHtml(record.displayDate || record.dateKey || '-')}</td>
                <td>${appClient.escapeHtml(record.name)}</td>
                <td>${appClient.escapeHtml(record.timeIn || '-')}</td>
                <td>${appClient.escapeHtml(record.timeOut || '-')}</td>
                <td>${appClient.escapeHtml(String(record.lateMinutes || 0))}</td>
                <td class="${statusClass(record.status)}">${appClient.escapeHtml(record.status)}</td>
            `;
            reportBody.appendChild(row);
        });

        totalLate.innerText = String(lateTotal);
        totalAbsent.innerText = String(absentTotal);
    } catch (error) {
        console.error('Failed to render attendance report:', error);
        reportBody.innerHTML = `<tr><td colspan="6">${appClient.escapeHtml(error.message)}</td></tr>`;
        totalLate.innerText = '0';
        totalAbsent.innerText = '0';
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
        default:
            return 'status-excused';
    }
}
