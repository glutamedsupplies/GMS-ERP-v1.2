const appClient = window.appClient;
const savingUsers = new Set();
let statusClearTimer = null;

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
        console.error('Failed to load head admin branding for today attendance:', error);
    }

    const timeZone = session.timeZone || '';

    const tbody = document.getElementById('todayTableBody');
    const clock = document.getElementById('clock');
    const dateLabel = document.getElementById('dateLabel');
    const totalCount = document.getElementById('totalCount');
    const onTimeCount = document.getElementById('onTimeCount');
    const lateCount = document.getElementById('lateCount');
    const absentCount = document.getElementById('absentCount');
    const suspendedCount = document.getElementById('suspendedCount');
    const excuseCount = document.getElementById('excuseCount');
    const statusNote = document.getElementById('statusNote');

    updateClock();
    updateDateLabel();
    await refreshTodayAttendance();

    window.setInterval(updateClock, 1000);
    window.setInterval(async () => {
        updateDateLabel();
        await refreshTodayAttendance();
    }, 5000);

    async function refreshTodayAttendance() {
        try {
            const rows = sortTodayRows(await appClient.getDailyAttendanceSnapshot());
            tbody.innerHTML = '';
            updateSummary(rows);

            if (!rows.length) {
                tbody.innerHTML = '<tr><td colspan="11" class="no-data">No employee accounts found. Add employees first so today\'s list can show Suspended, Absent, Late, On Time, or Excuse status for the current date.</td></tr>';
                return;
            }

            rows.forEach((row) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td data-label="Employee ID">${appClient.escapeHtml(row.id)}</td>
                    <td data-label="Name">${appClient.escapeHtml(row.name)}</td>
                    <td data-label="Photo"><img src="${appClient.escapeHtml(row.avatarUrl)}" class="employee-img" alt="${appClient.escapeHtml(row.name)}"></td>
                    <td data-label="Scheduled In">${formatTime(row.scheduledTimeIn)}</td>
                    <td data-label="Time In">${formatTime(row.timeIn)}</td>
                    <td data-label="Scheduled Out">${formatTime(row.scheduledTimeOut)}</td>
                    <td data-label="Actual Out">${formatTime(row.timeOut)}</td>
                    <td data-label="Late Minutes">${row.statusGroup === 'late' ? row.lateMinutes : 0}</td>
                    <td data-label="Status"><span class="status-pill ${statusClass(row.statusGroup)}">${appClient.escapeHtml(row.status)}</span></td>
                    <td data-label="Remarks">${appClient.escapeHtml(row.displayRemarks || '-')}</td>
                    <td data-label="Action">${buildActionCell(row)}</td>
                `;

                const select = tr.querySelector('.status-editor');
                if (select) {
                    select.addEventListener('change', async (event) => {
                        const nextStatus = event.target.value;
                        const userId = row.id;
                        savingUsers.add(userId);
                        event.target.disabled = true;
                        showStatus(`Updating ${row.name}...`, false, false);

                        try {
                            await appClient.updateDailyAttendanceStatus(userId, nextStatus);
                            showStatus(`${row.name} marked as ${nextStatus}.`, false, true);
                            await refreshTodayAttendance();
                        } catch (error) {
                            console.error('Failed to update daily attendance status:', error);
                            showStatus(error.message, true, true);
                            savingUsers.delete(userId);
                            await refreshTodayAttendance();
                        }
                    });
                }

                tbody.appendChild(tr);
            });
        } catch (error) {
            console.error('Failed to load today attendance snapshot:', error);
            tbody.innerHTML = `<tr><td colspan="11" class="no-data">${appClient.escapeHtml(error.message)}</td></tr>`;
            updateSummary([]);
            showStatus(error.message, true, true);
        }
    }

    function updateSummary(rows) {
        const counts = {
            total: rows.length,
            on_time: 0,
            late: 0,
            absent: 0,
            suspended: 0,
            excuse: 0
        };

        rows.forEach((row) => {
            if (Object.prototype.hasOwnProperty.call(counts, row.statusGroup)) {
                counts[row.statusGroup] += 1;
            }
        });

        totalCount.textContent = String(counts.total);
        onTimeCount.textContent = String(counts.on_time);
        lateCount.textContent = String(counts.late);
        absentCount.textContent = String(counts.absent);
        suspendedCount.textContent = String(counts.suspended);
        excuseCount.textContent = String(counts.excuse);
    }

    function updateClock() {
        const now = new Date();
        clock.textContent = now.toLocaleTimeString('en-GB', buildTimeZoneOptions({ hour12: false }));
    }

    function updateDateLabel() {
        dateLabel.textContent = new Date().toLocaleDateString('en-US', buildTimeZoneOptions({
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }));
    }

    function buildActionCell(row) {
        if (!row.canEditStatus) {
            return '<span class="no-data">Locked</span>';
        }

        const currentValue = row.statusGroup === 'excuse' ? 'Excuse' : 'Absent';
        const disabled = savingUsers.has(row.id) ? ' disabled' : '';

        return `
            <select class="status-editor"${disabled} data-user-id="${appClient.escapeHtml(row.id)}">
                <option value="Absent"${currentValue === 'Absent' ? ' selected' : ''}>Absent</option>
                <option value="Excuse"${currentValue === 'Excuse' ? ' selected' : ''}>Excuse</option>
            </select>
        `;
    }

    function showStatus(message, isError, autoClear) {
        if (!statusNote) {
            return;
        }

        statusNote.textContent = message || '';
        statusNote.className = `status-note ${isError ? 'note-error' : 'note-success'}`.trim();

        if (statusClearTimer) {
            clearTimeout(statusClearTimer);
            statusClearTimer = null;
        }

        if (autoClear && message) {
            statusClearTimer = setTimeout(() => {
                statusNote.textContent = '';
                statusNote.className = 'status-note';
            }, 3000);
        }
    }

    function buildTimeZoneOptions(options = {}) {
        return timeZone
            ? { ...options, timeZone }
            : options;
    }
}

function formatTime(value) {
    return appClient.formatDisplayTime(value);
}

function sortTodayRows(rows) {
    const priority = {
        suspended: 0,
        late: 1,
        absent: 2,
        excuse: 3,
        on_time: 4,
        day_off: 5
    };

    return [...rows].sort((left, right) => {
        const leftPriority = Object.prototype.hasOwnProperty.call(priority, left.statusGroup)
            ? priority[left.statusGroup]
            : 99;
        const rightPriority = Object.prototype.hasOwnProperty.call(priority, right.statusGroup)
            ? priority[right.statusGroup]
            : 99;

        if (leftPriority !== rightPriority) {
            return leftPriority - rightPriority;
        }

        return String(left.name || '').localeCompare(String(right.name || ''));
    });
}

function statusClass(statusGroup) {
    switch (String(statusGroup).toLowerCase()) {
        case 'on_time':
            return 'status-on-time';
        case 'late':
            return 'status-late';
        case 'absent':
            return 'status-absent';
        case 'suspended':
            return 'status-suspended';
        case 'excuse':
            return 'status-excuse';
        case 'day_off':
            return 'status-day-off';
        default:
            return '';
    }
}
