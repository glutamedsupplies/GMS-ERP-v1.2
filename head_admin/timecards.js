const appClient = window.appClient;
const employeeListDiv = document.getElementById('employeeList');
const timecardTableBody = document.getElementById('timecardTableBody');
const employeeNameTitle = document.getElementById('employeeNameTitle');
const weekDateInput = document.getElementById('weekDate');
const weekRangeLabel = document.getElementById('weekRangeLabel');

let selectedEmployee = null;

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
        console.error('Failed to load head admin branding for time cards:', error);
    }

    const dateKey = await resolveServerDateKey();
    initSelectors(dateKey);
    await loadEmployees();
}

function initSelectors(dateKey) {
    const todayDate = parseInputDate(dateKey);
    weekDateInput.value = dateKey || formatDateKey(todayDate);
    updateWeekRangeLabel(todayDate);

    weekDateInput.addEventListener('change', () => {
        const selectedDate = parseInputDate(weekDateInput.value);
        updateWeekRangeLabel(selectedDate);
        if (selectedEmployee) {
            renderTimecard(selectedEmployee);
        }
    });
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
            return;
        }

        employees.forEach((employee, index) => {
            const div = document.createElement('div');
            div.className = 'employee-item';
            div.innerHTML = `<img src="${appClient.escapeHtml(employee.profile_picture || appClient.buildAvatarUrl(employee.name))}" alt="${appClient.escapeHtml(employee.name)}"><span>${appClient.escapeHtml(employee.name)}</span>`;
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
    } catch (error) {
        console.error('Failed to load employee list for time cards:', error);
        employeeListDiv.innerHTML = `<div class="empty-row is-error" style="padding:12px;">${appClient.escapeHtml(error.message)}</div>`;
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

async function renderTimecard(employee) {
    employeeNameTitle.innerText = `${employee.name}'s Weekly Time Card`;
    timecardTableBody.innerHTML = '<tr><td colspan="5" class="empty-row">Loading logs...</td></tr>';

    try {
        const selectedDate = parseInputDate(weekDateInput.value);
        updateWeekRangeLabel(selectedDate);

        const rows = await appClient.getUserWeeklyTimeCard(employee.id, {
            dateKey: formatDateKey(selectedDate)
        });

        timecardTableBody.innerHTML = '';

        if (!rows.length) {
            timecardTableBody.innerHTML = '<tr><td colspan="5" class="empty-row">No logs found for this week.</td></tr>';
            return;
        }

        rows.forEach((row) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${appClient.escapeHtml(row.displayDate)}</td>
                <td>${appClient.escapeHtml(row.dayLabel)}</td>
                <td>${appClient.escapeHtml(row.timeIn || '--:--')}</td>
                <td>${appClient.escapeHtml(row.timeOut || '--:--')}</td>
                <td class="${statusClass(row.status)}">${appClient.escapeHtml(row.status)}</td>
            `;
            timecardTableBody.appendChild(tr);
        });
    } catch (error) {
        console.error('Failed to render employee time card:', error);
        timecardTableBody.innerHTML = `<tr><td colspan="5" class="empty-row is-error">${appClient.escapeHtml(error.message)}</td></tr>`;
    }
}

function parseInputDate(value) {
    if (!value) {
        return new Date();
    }

    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function getWeekBounds(value) {
    const baseDate = new Date(value);
    const weekStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
    weekEnd.setDate(weekEnd.getDate() + 6);
    return { weekStart, weekEnd };
}

function updateWeekRangeLabel(value) {
    const { weekStart, weekEnd } = getWeekBounds(value);
    weekRangeLabel.textContent = `Week range: ${formatShortDate(weekStart)} - ${formatShortDate(weekEnd)}`;
}

function formatDateKey(value) {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatShortDate(value) {
    return new Date(value).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
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
        case 'day off':
            return 'status-day-off';
        default:
            return '';
    }
}
