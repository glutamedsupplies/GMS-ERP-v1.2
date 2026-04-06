const appClient = window.appClient;
const tableBody = document.getElementById('employeeTableBody');
const addModal = document.getElementById('addModal');
const searchInput = document.getElementById('searchInput');
const newIdInput = document.getElementById('newId');
const newNameInput = document.getElementById('newName');
const newPasswordInput = document.getElementById('newPassword');
const weeklyScheduleGrid = document.getElementById('weeklyScheduleGrid');
const saveEmployeeButton = document.getElementById('saveEmployee');
const openModalButton = document.getElementById('openModal');
const closeModalButton = document.getElementById('closeModal');
const liveClock = document.getElementById('liveClock');
const employeeModalTitle = document.getElementById('employeeModalTitle');
const employeePasswordLabel = document.getElementById('employeePasswordLabel');
const employeePasswordHint = document.getElementById('employeePasswordHint');

const DAYS = [
    { key: 'sunday', label: 'Sunday' },
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
    { key: 'saturday', label: 'Saturday' }
];
const DEFAULT_TIME_IN = '08:00';
const DEFAULT_TIME_OUT = '17:00';

const state = {
    employees: [],
    editingId: null,
    currentUserId: ''
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }
    state.currentUserId = String(session.userId || '');

    try {
        const bootstrap = await appClient.getBootstrap();
        appClient.applyBootstrapBrandTheme(bootstrap);
    } catch (error) {
        console.error('Failed to load head admin branding for employees panel:', error);
    }

    await loadEmployees();
    updateClock();
    window.setInterval(updateClock, 1000);

    searchInput.addEventListener('input', (event) => {
        loadEmployees(event.target.value.trim());
    });

    openModalButton.addEventListener('click', () => {
        openEmployeeModal();
    });

    closeModalButton.addEventListener('click', closeEmployeeModal);
    saveEmployeeButton.addEventListener('click', saveEmployee);

    addModal.addEventListener('click', (event) => {
        if (event.target === addModal) {
            closeEmployeeModal();
        }
    });
}

function normalizeTime(value, fallback) {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{1,2}):(\d{2})/);
    if (!match) {
        return fallback;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return fallback;
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeBoolean(value, fallback = false) {
    if (typeof value === 'boolean') {
        return value;
    }

    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
        return fallback;
    }

    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
    }

    return fallback;
}

function normalizeWeeklySchedule(source, fallbackTimeIn = DEFAULT_TIME_IN, fallbackTimeOut = DEFAULT_TIME_OUT) {
    let payload = source;
    if (typeof payload === 'string') {
        const raw = payload.trim();
        if (!raw) {
            payload = {};
        } else {
            try {
                payload = JSON.parse(raw);
            } catch (_error) {
                payload = {};
            }
        }
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        payload = {};
    }

    const safeIn = normalizeTime(fallbackTimeIn, DEFAULT_TIME_IN);
    const safeOut = normalizeTime(fallbackTimeOut, DEFAULT_TIME_OUT);
    return DAYS.reduce((schedule, day) => {
        const sourceDay = payload[day.key] || payload[day.label] || {};
        const offSource = sourceDay.is_day_off ?? sourceDay.isDayOff ?? sourceDay.day_off ?? sourceDay.dayOff;
        const isDayOff = normalizeBoolean(offSource, day.key === 'sunday');
        schedule[day.key] = {
            is_day_off: isDayOff,
            time_in: isDayOff ? '' : normalizeTime(sourceDay.time_in ?? sourceDay.timeIn ?? safeIn, safeIn),
            time_out: isDayOff ? '' : normalizeTime(sourceDay.time_out ?? sourceDay.timeOut ?? safeOut, safeOut)
        };
        return schedule;
    }, {});
}

function deriveDefaultTimesFromSchedule(schedule) {
    const priority = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const dayKey of priority) {
        const daySchedule = schedule[dayKey];
        if (!daySchedule || daySchedule.is_day_off) {
            continue;
        }

        const timeIn = normalizeTime(daySchedule.time_in, '');
        const timeOut = normalizeTime(daySchedule.time_out, '');
        if (timeIn && timeOut) {
            return { timeIn, timeOut };
        }
    }

    return { timeIn: DEFAULT_TIME_IN, timeOut: DEFAULT_TIME_OUT };
}

function setTimeRowState(row) {
    const dayOffInput = row.querySelector('[data-role="dayOff"]');
    const timeInInput = row.querySelector('[data-role="timeIn"]');
    const timeOutInput = row.querySelector('[data-role="timeOut"]');
    const isDayOff = Boolean(dayOffInput?.checked);
    if (!timeInInput || !timeOutInput) {
        return;
    }

    timeInInput.disabled = isDayOff;
    timeOutInput.disabled = isDayOff;
    if (!isDayOff) {
        timeInInput.value = normalizeTime(timeInInput.value, DEFAULT_TIME_IN);
        timeOutInput.value = normalizeTime(timeOutInput.value, DEFAULT_TIME_OUT);
    }
}

function renderWeeklyScheduleEditor(schedule) {
    if (!weeklyScheduleGrid) {
        return;
    }

    weeklyScheduleGrid.innerHTML = '';
    DAYS.forEach((day) => {
        const daySchedule = schedule[day.key] || {
            is_day_off: day.key === 'sunday',
            time_in: day.key === 'sunday' ? '' : DEFAULT_TIME_IN,
            time_out: day.key === 'sunday' ? '' : DEFAULT_TIME_OUT
        };

        const row = document.createElement('div');
        row.className = 'schedule-row';
        row.dataset.day = day.key;
        row.innerHTML = `
            <div class="schedule-day">${day.label}</div>
            <label class="schedule-off">
                <input type="checkbox" data-role="dayOff" ${daySchedule.is_day_off ? 'checked' : ''}>
                Day Off
            </label>
            <input type="time" data-role="timeIn" value="${appClient.escapeHtml(normalizeTime(daySchedule.time_in, DEFAULT_TIME_IN))}">
            <input type="time" data-role="timeOut" value="${appClient.escapeHtml(normalizeTime(daySchedule.time_out, DEFAULT_TIME_OUT))}">
        `;

        const dayOffInput = row.querySelector('[data-role="dayOff"]');
        dayOffInput?.addEventListener('change', () => setTimeRowState(row));
        setTimeRowState(row);
        weeklyScheduleGrid.appendChild(row);
    });
}

function collectWeeklySchedule() {
    const rows = weeklyScheduleGrid ? Array.from(weeklyScheduleGrid.querySelectorAll('.schedule-row')) : [];
    return rows.reduce((schedule, row) => {
        const dayKey = String(row.dataset.day || '');
        const dayOffInput = row.querySelector('[data-role="dayOff"]');
        const timeInInput = row.querySelector('[data-role="timeIn"]');
        const timeOutInput = row.querySelector('[data-role="timeOut"]');
        const isDayOff = Boolean(dayOffInput?.checked);
        const safeTimeIn = normalizeTime(timeInInput?.value, DEFAULT_TIME_IN);
        const safeTimeOut = normalizeTime(timeOutInput?.value, DEFAULT_TIME_OUT);

        schedule[dayKey] = {
            is_day_off: isDayOff,
            time_in: isDayOff ? '' : safeTimeIn,
            time_out: isDayOff ? '' : safeTimeOut
        };
        return schedule;
    }, {});
}

async function loadEmployees(filter = '') {
    try {
        const rows = await appClient.listUsers({ role: '', filter });
        rows.sort((left, right) => {
            const leftRank = left.is_active === false ? 1 : 0;
            const rightRank = right.is_active === false ? 1 : 0;
            if (leftRank !== rightRank) {
                return leftRank - rightRank;
            }
            return String(left.name || '').localeCompare(String(right.name || ''));
        });
        state.employees = rows;
        renderEmployees(rows);
    } catch (error) {
        console.error('Failed to load employees:', error);
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:red;">${appClient.escapeHtml(error.message)}</td></tr>`;
    }
}

function formatRoleLabel(role) {
    const normalized = String(role || '').trim().toLowerCase();
    if (!normalized) {
        return '-';
    }
    if (normalized === 'company_admin' || normalized === 'head_admin') {
        return 'Company Admin';
    }
    if (normalized === 'staff') {
        return 'Staff';
    }
    if (normalized === 'employee') {
        return 'Employee';
    }
    return normalized.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderEmployees(rows) {
    tableBody.innerHTML = '';

    if (!rows.length) {
        tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#999;">No accounts found</td></tr>';
        return;
    }

    rows.forEach((emp) => {
        const safeId = appClient.escapeHtml(emp.id);
        const safeName = appClient.escapeHtml(emp.name);
        const safeRole = appClient.escapeHtml(formatRoleLabel(emp.role));
        const safeTimeIn = appClient.escapeHtml(appClient.formatDisplayTime(normalizeTime(emp.time_in, DEFAULT_TIME_IN)));
        const safeTimeOut = appClient.escapeHtml(appClient.formatDisplayTime(normalizeTime(emp.time_out, DEFAULT_TIME_OUT)));
        const isActive = Boolean(emp.is_active);
        const isCurrentUser = String(emp.id || '') === state.currentUserId;
        const statusLabel = isActive ? 'Active' : 'Suspended';
        const toggleLabel = isCurrentUser ? 'Current User' : (isActive ? 'Suspend' : 'Reactivate');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="id-label">${safeId}</span></td>
            <td><strong>${safeName}</strong></td>
            <td>${safeRole}</td>
            <td><span class="status-pill ${isActive ? 'active' : 'suspended'}">${statusLabel}</span></td>
            <td><span class="time-field">${safeTimeIn}</span></td>
            <td><span class="time-field">${safeTimeOut}</span></td>
            <td style="text-align:center">
                <button class="state-btn ${isActive ? 'suspend' : 'reactivate'}" type="button" onclick="toggleEmployeeStatus('${safeId}')"${isCurrentUser ? ' disabled' : ''}>${toggleLabel}</button>
            </td>
            <td style="text-align:center">
                <button class="action-btn" onclick="deleteEmployee('${safeId}')"><i class="fas fa-trash-alt"></i></button>
            </td>
            <td style="text-align:center">
                <button class="action-btn" onclick="editEmployee('${safeId}')"><i class="fas fa-edit"></i></button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

window.deleteEmployee = async function deleteEmployee(id) {
    if (!confirm(`Delete account ${id}?`)) {
        return;
    }

    try {
        await appClient.deleteUser(id);
        await loadEmployees(searchInput.value.trim());
    } catch (error) {
        console.error('Failed to delete employee:', error);
        alert(error.message);
    }
};

window.editEmployee = function editEmployee(id) {
    const employee = state.employees.find((item) => String(item.id) === String(id));
    if (!employee) {
        return;
    }

    openEmployeeModal(employee);
};

window.toggleEmployeeStatus = async function toggleEmployeeStatus(id) {
    const employee = state.employees.find((item) => String(item.id) === String(id));
    if (!employee) {
        return;
    }
    if (String(employee.id || '') === state.currentUserId) {
        alert('You cannot suspend the account you are currently using.');
        return;
    }

    const nextActive = !Boolean(employee.is_active);
    const verb = nextActive ? 'reactivate' : 'suspend';
    const confirmed = window.confirm(`${verb.charAt(0).toUpperCase() + verb.slice(1)} account "${employee.name || employee.id}"?`);
    if (!confirmed) {
        return;
    }

    try {
        await appClient.updateUser(employee.id, {
            is_active: nextActive
        });
        await loadEmployees(searchInput.value.trim());
    } catch (error) {
        console.error('Failed to update employee status:', error);
        alert(error.message);
    }
};

function openEmployeeModal(employee = null) {
    const isEditing = Boolean(employee);
    const normalizedRole = String(employee?.role || '').trim().toLowerCase();
    const isEmployeeRole = !normalizedRole || normalizedRole === 'employee';
    state.editingId = isEditing ? employee.id : null;
    newIdInput.disabled = isEditing;
    newIdInput.value = isEditing ? employee.id : '';
    newNameInput.value = isEditing ? employee.name : '';
    newPasswordInput.value = '';
    newPasswordInput.placeholder = isEditing
        ? 'Leave blank to keep current password'
        : 'Set password (minimum 8 characters)';

    const weeklySchedule = normalizeWeeklySchedule(
        employee?.weekly_schedule,
        employee?.time_in || DEFAULT_TIME_IN,
        employee?.time_out || DEFAULT_TIME_OUT
    );
    renderWeeklyScheduleEditor(weeklySchedule);
    saveEmployeeButton.textContent = isEditing ? 'Update Account' : 'Save Employee';

    if (employeeModalTitle) {
        employeeModalTitle.textContent = isEditing
            ? (isEmployeeRole ? 'Edit Employee' : 'Edit Account')
            : 'Add Employee';
    }

    if (employeePasswordLabel) {
        employeePasswordLabel.textContent = isEditing ? 'New Password' : 'Password';
    }

    if (employeePasswordHint) {
        employeePasswordHint.textContent = isEditing
            ? 'Leave blank to keep the current password.'
            : 'Use at least 8 characters.';
    }

    addModal.style.display = 'flex';
}

function closeEmployeeModal() {
    state.editingId = null;
    newIdInput.disabled = false;
    newIdInput.value = '';
    newNameInput.value = '';
    newPasswordInput.value = '';
    newPasswordInput.placeholder = 'Set password (minimum 8 characters)';
    renderWeeklyScheduleEditor(normalizeWeeklySchedule({}, DEFAULT_TIME_IN, DEFAULT_TIME_OUT));
    saveEmployeeButton.textContent = 'Save Employee';

    if (employeeModalTitle) {
        employeeModalTitle.textContent = 'Add Employee';
    }

    if (employeePasswordLabel) {
        employeePasswordLabel.textContent = 'Password';
    }

    if (employeePasswordHint) {
        employeePasswordHint.textContent = 'Use at least 8 characters.';
    }

    addModal.style.display = 'none';
}

async function saveEmployee() {
    const isEditing = Boolean(state.editingId);
    const weeklySchedule = collectWeeklySchedule();
    const defaultTimes = deriveDefaultTimesFromSchedule(weeklySchedule);
    const payload = {
        id: newIdInput.value.trim(),
        name: newNameInput.value.trim(),
        password: newPasswordInput.value.trim(),
        timeIn: defaultTimes.timeIn,
        timeOut: defaultTimes.timeOut,
        weeklySchedule
    };

    if (!payload.id || !payload.name || (!isEditing && !payload.password)) {
        alert('Please fill up all required fields.');
        return;
    }

    if (payload.password && payload.password.length < 8) {
        alert('Password must be at least 8 characters.');
        return;
    }

    try {
        if (isEditing) {
            await appClient.updateUser(state.editingId, {
                name: payload.name,
                password: payload.password || '',
                timeIn: payload.timeIn,
                timeOut: payload.timeOut,
                weeklySchedule: payload.weeklySchedule
            });
            alert('Account updated successfully.');
        } else {
            await appClient.addEmployee(payload);
            alert('Employee added successfully.');
        }

        closeEmployeeModal();
        await loadEmployees(searchInput.value.trim());
    } catch (error) {
        console.error('Failed to save employee:', error);
        alert(error.message);
    }
}

function updateClock() {
    if (liveClock) {
        liveClock.innerText = new Date().toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    }
}
