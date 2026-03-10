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

    sessionTimeZone = session.timeZone || '';

    updateClock();
    window.setInterval(updateClock, 1000);

    timeInBtn.addEventListener('click', () => handleAction('in'));
    timeOutBtn.addEventListener('click', () => handleAction('out'));
    empIdInput.focus();
}

async function handleAction(type) {
    const employeeId = empIdInput.value.trim();
    if (!employeeId) {
        showMessage('Please enter an employee ID.', true);
        return;
    }

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
    }
}

function updateClock() {
    const now = new Date();
    clock.innerText = now.toLocaleTimeString('en-GB', buildTimeZoneOptions({ hour12: false }));
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
    msgBox.style.color = isError ? '#ff9aa5' : '#8df56a';
}

function buildTimeZoneOptions(options = {}) {
    return sessionTimeZone
        ? { ...options, timeZone: sessionTimeZone }
        : options;
}
