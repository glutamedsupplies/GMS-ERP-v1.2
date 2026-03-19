const appClient = window.appClient;
const backBtn = document.getElementById('backBtn');
const welcomeUser = document.getElementById('welcomeUser');
const statusText = document.getElementById('statusText');
const timeInBtn = document.getElementById('timeInBtn');
const timeOutBtn = document.getElementById('timeOutBtn');
const clockEl = document.getElementById('clock');
const dateEl = document.getElementById('date');

let session = null;
let sessionTimeZone = '';

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
        console.error('Failed to load employee branding for attendance station:', error);
    }

    sessionTimeZone = session.timeZone || '';
    welcomeUser.innerText = `Welcome, ${session.userName || 'Employee'}`;
    if (backBtn && !backBtn.dataset.bound) {
        backBtn.dataset.bound = 'true';
        backBtn.addEventListener('click', () => {
            window.location.href = '/employee/employee.html';
        });
    }

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
            setStatusMessage(`${result.status} - timed in at ${appClient.formatDisplayTime(result.time)}`, false);
        } else {
            const result = await appClient.recordTimeOut(session.userId);
            setStatusMessage(`Timed out at ${appClient.formatDisplayTime(result.time)}. Total hours: ${result.workedHours}`, false);
        }

        await refreshState();
    } catch (error) {
        console.error('Attendance action failed:', error);
        setStatusMessage(error.message, true);
    } finally {
        setBusy(false);
    }
}

function updateClock() {
    const now = new Date();
    clockEl.innerText = now.toLocaleTimeString('en-GB', buildTimeZoneOptions({ hour12: false }));
    dateEl.innerText = now
        .toLocaleDateString('en-US', buildTimeZoneOptions({
            weekday: 'short',
            month: 'short',
            day: '2-digit',
            year: 'numeric'
        }))
        .replace(/,/g, '');
}

async function refreshState() {
    try {
        const record = await appClient.getTodayAttendanceRecord(session.userId);

        if (!record) {
            timeInBtn.disabled = false;
            timeOutBtn.disabled = true;
            setStatusMessage('Ready to time in.', false);
            return;
        }

        if (record.timeIn && !record.timeOut) {
            timeInBtn.disabled = true;
            timeOutBtn.disabled = false;
            setStatusMessage(`${record.status} - logged in at ${appClient.formatDisplayTime(record.timeIn)}`, false);
            return;
        }

        timeInBtn.disabled = true;
        timeOutBtn.disabled = true;
        setStatusMessage(`Shift ended. Total hours: ${record.workedHours}`, false);
    } catch (error) {
        console.error('Failed to refresh attendance state:', error);
        setStatusMessage(error.message, true);
    }
}

function setBusy(isBusy) {
    if (isBusy) {
        timeInBtn.disabled = true;
        timeOutBtn.disabled = true;
    }
}

function buildTimeZoneOptions(options = {}) {
    return sessionTimeZone
        ? { ...options, timeZone: sessionTimeZone }
        : options;
}

function setStatusMessage(message, isError) {
    statusText.innerText = message;
    statusText.classList.toggle('is-error', Boolean(isError));
    statusText.classList.toggle('is-success', Boolean(message) && !isError);
}
