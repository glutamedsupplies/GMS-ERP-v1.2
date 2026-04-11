const appClient = window.appClient;
const tableBody = document.querySelector('#timeCardTable tbody');
const backBtn = document.getElementById('backBtn');
const title = document.getElementById('recordsTitle');
const subheading = document.getElementById('weekRange');
const weekDateInput = document.getElementById('weekDate');

let session = null;
let serverDateKey = formatDateKey(new Date());

initialize();

async function initialize() {
    session = await appClient.ensureSession({ role: 'employee' });
    if (!session) {
        return;
    }

    try {
        const bootstrap = await appClient.getBootstrap();
        appClient.applyBootstrapBrandTheme(bootstrap);
    } catch (error) {
        console.error('Failed to load employee branding for time card:', error);
    }

    backBtn?.addEventListener('click', () => {
        window.location.href = '/employee/employee.html';
    });

    serverDateKey = await resolveServerDateKey();
    initSelectors(serverDateKey);
    await renderRecords();
}

function initSelectors(dateKey) {
    const initialDate = clampToServerDate(parseInputDate(dateKey));
    const initialDateKey = formatDateKey(initialDate);

    if (weekDateInput) {
        weekDateInput.value = initialDateKey;
        weekDateInput.max = serverDateKey || initialDateKey;
        weekDateInput.addEventListener('change', () => {
            const selectedDate = getSelectedDate();
            updateWeekLabel(selectedDate);
            void renderRecords(selectedDate);
        });
    }

    updateWeekLabel(initialDate);
}

async function resolveServerDateKey() {
    try {
        const serverInfo = await appClient.getServerInfo();
        const dateKey = String(serverInfo?.dateKey || '').trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
            ? dateKey
            : formatDateKey(new Date());
    } catch (_error) {
        return formatDateKey(new Date());
    }
}

function getSelectedDate() {
    return clampToServerDate(parseInputDate(weekDateInput?.value || serverDateKey));
}

function clampToServerDate(value) {
    const selectedDate = new Date(value);
    const serverDate = parseInputDate(serverDateKey);
    return selectedDate > serverDate ? serverDate : selectedDate;
}

async function renderRecords(selectedDate = getSelectedDate()) {
    try {
        const normalizedDate = clampToServerDate(selectedDate);
        if (weekDateInput) {
            weekDateInput.value = formatDateKey(normalizedDate);
        }
        const rows = await appClient.getUserWeeklyTimeCard(session.userId, {
            dateKey: formatDateKey(normalizedDate)
        });
        updateWeekLabel(normalizedDate);

        if (title) {
            title.textContent = 'Attendance Records';
        }

        tableBody.innerHTML = '';

        if (!rows.length) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No records found for this week.</td></tr>';
            return;
        }

        rows.forEach((record) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td data-label="Date">${appClient.escapeHtml(`${record.dayLabel}, ${record.displayDate}`)}</td>
                <td data-label="Time In">${appClient.escapeHtml(appClient.formatDisplayTime(record.timeIn, '-'))}</td>
                <td data-label="Time Out">${appClient.escapeHtml(appClient.formatDisplayTime(record.timeOut, '-'))}</td>
                <td data-label="Total Hours">${appClient.escapeHtml(record.workedHours || '0.00')}</td>
                <td data-label="Status" class="${statusClass(record.status)}">${appClient.escapeHtml(record.status)}</td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Failed to load employee weekly time card:', error);
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#d50000;">${appClient.escapeHtml(error.message)}</td></tr>`;
    }
}

function updateWeekLabel(value) {
    if (!subheading) {
        return;
    }

    const { weekStart, weekEnd } = getWeekBounds(value);
    const serverDate = parseInputDate(serverDateKey);
    const rangeEnd = weekEnd > serverDate ? serverDate : weekEnd;
    const rangeLabel = `${formatShortDate(weekStart)} - ${formatShortDate(rangeEnd)}`;
    subheading.textContent = `Selected week: ${rangeLabel}`;
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
            return 'status-on-time';
        case 'late':
            return 'status-late';
        case 'absent':
            return 'status-absent';
        case 'excuse':
            return 'status-excuse';
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
