const appClient = window.appClient;
const empIdInput = document.getElementById('empIdInput');
const timeInBtn = document.getElementById('timeInBtn');
const timeOutBtn = document.getElementById('timeOutBtn');
const msgBox = document.getElementById('msgBox');
const clock = document.getElementById('clock');
const dateLabel = document.getElementById('date');
let sessionTimeZone = '';

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
        console.error('Failed to load head admin branding for attendance station:', error);
    }

    sessionTimeZone = session.timeZone || '';

    updateClock();
    window.setInterval(updateClock, 1000);

    timeInBtn.addEventListener('click', () => handleAction('in'));
    timeOutBtn.addEventListener('click', () => handleAction('out'));
    empIdInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleAction('in');
        }
    });
    empIdInput.focus();
}

async function handleAction(type) {
    const employeeId = empIdInput.value.trim();
    if (!employeeId) {
        showMessage('Please enter an employee ID.', true);
        return;
    }

    setButtonsDisabled(true);

    try {
        const result = type === 'in'
            ? await appClient.recordTimeIn(employeeId)
            : await appClient.recordTimeOut(employeeId);

        if (type === 'in') {
            showMessage(`${result.user.name} timed in at ${result.time}.`, false);
        } else {
            showMessage(`${result.user.name} timed out at ${result.time}. Total hours: ${result.workedHours}.`, false);
        }

        empIdInput.value = '';
        empIdInput.focus();
    } catch (error) {
        console.error('Failed to record station attendance action:', error);
        showMessage(error.message, true);
    } finally {
        setButtonsDisabled(false);
    }
}

function updateClock() {
    const now = new Date();
    clock.innerText = now.toLocaleTimeString('en-GB', buildTimeZoneOptions({
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }));
    dateLabel.innerText = now
        .toLocaleDateString('en-US', buildTimeZoneOptions({
            weekday: 'short',
            month: 'short',
            day: '2-digit',
            year: 'numeric'
        }))
        .replace(/,/g, '');
}

function showMessage(message, isError) {
    msgBox.textContent = message;
    msgBox.className = `status ${isError ? 'is-error' : 'is-success'}`.trim();
}

function setButtonsDisabled(disabled) {
    timeInBtn.disabled = disabled;
    timeOutBtn.disabled = disabled;
}

function buildTimeZoneOptions(options = {}) {
    return sessionTimeZone
        ? { ...options, timeZone: sessionTimeZone }
        : options;
}
