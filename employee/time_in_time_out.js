const appClient = window.appClient;
const backBtn = document.getElementById('backBtn');
const welcomeUser = document.getElementById('welcomeUser');
const statusText = document.getElementById('statusText');
const timeInBtn = document.getElementById('timeInBtn');
const timeOutBtn = document.getElementById('timeOutBtn');
const clockEl = document.getElementById('clock');
const dateEl = document.getElementById('date');

let session = null;

initialize();

async function initialize() {
    session = await appClient.ensureSession({ role: 'employee' });
    if (!session) {
        return;
    }

    welcomeUser.innerText = `Welcome, ${session.userName || 'Employee'}`;
    backBtn?.addEventListener('click', () => {
        window.location.href = '/employee/employee.html';
    });

    timeInBtn?.addEventListener('click', () => handleAction('in'));
    timeOutBtn?.addEventListener('click', () => handleAction('out'));

    window.setInterval(updateClock, 1000);
    updateClock();
    await refreshState();
}

async function handleAction(type) {
    setBusy(true);

    try {
        if (type === 'in') {
            const result = await appClient.recordTimeIn(session.userId);
            statusText.innerText = `${result.status} - timed in at ${result.time}`;
        } else {
            const result = await appClient.recordTimeOut(session.userId);
            statusText.innerText = `Timed out at ${result.time}. Total hours: ${result.workedHours}`;
        }

        await refreshState();
    } catch (error) {
        console.error('Attendance action failed:', error);
        statusText.innerText = error.message;
    } finally {
        setBusy(false);
    }
}

function updateClock() {
    const now = new Date();
    clockEl.innerText = now.toLocaleTimeString('en-GB', { hour12: false });
    dateEl.innerText = now.toDateString();
}

async function refreshState() {
    try {
        const record = await appClient.getTodayAttendanceRecord(session.userId);

        if (!record) {
            timeInBtn.disabled = false;
            timeOutBtn.disabled = true;
            statusText.innerText = 'Ready to time in.';
            return;
        }

        if (record.timeIn && !record.timeOut) {
            timeInBtn.disabled = true;
            timeOutBtn.disabled = false;
            statusText.innerText = `${record.status} - logged in at ${record.timeIn}`;
            return;
        }

        timeInBtn.disabled = true;
        timeOutBtn.disabled = true;
        statusText.innerText = `Shift ended. Total hours: ${record.workedHours}`;
    } catch (error) {
        console.error('Failed to refresh attendance state:', error);
        statusText.innerText = error.message;
    }
}

function setBusy(isBusy) {
    if (isBusy) {
        timeInBtn.disabled = true;
        timeOutBtn.disabled = true;
    }
}
