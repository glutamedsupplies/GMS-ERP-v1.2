const appClient = window.appClient;
const empIdInput = document.getElementById('empIdInput');
const timeInBtn = document.getElementById('timeInBtn');
const timeOutBtn = document.getElementById('timeOutBtn');
const msgBox = document.getElementById('msgBox');
const clock = document.getElementById('clock');
const dateLabel = document.getElementById('date');
const taskTimeoutModal = document.getElementById('taskTimeoutModal');
const taskTimeoutLabel = document.getElementById('taskTimeoutLabel');
const taskChecklist = document.getElementById('taskChecklist');
const taskTimeoutError = document.getElementById('taskTimeoutError');
const cancelTaskTimeoutBtn = document.getElementById('cancelTaskTimeoutBtn');
const submitTaskTimeoutBtn = document.getElementById('submitTaskTimeoutBtn');
const kpiTimeoutRoot = document.getElementById('kpiTimeoutRoot');
const timeOutPreview = document.getElementById('timeOutPreview');
const employeeTaskAdd = document.getElementById('employeeTaskAdd');
const addEmployeeTaskBtn = document.getElementById('addEmployeeTaskBtn');
const employeeTaskModal = document.getElementById('employeeTaskModal');
const employeeTaskNameInput = document.getElementById('employeeTaskNameInput');
const employeeTaskModalError = document.getElementById('employeeTaskModalError');
const saveEmployeeTaskBtn = document.getElementById('saveEmployeeTaskBtn');
const cancelEmployeeTaskBtn = document.getElementById('cancelEmployeeTaskBtn');
const closeEmployeeTaskModalBtn = document.getElementById('closeEmployeeTaskModalBtn');
const employeeTaskInputTypeInputs = Array.from(document.querySelectorAll('input[name="employeeTaskInputType"]'));
const kpiTimeoutController = window.createKpiTimeoutController({ appClient, root: kpiTimeoutRoot });
let sessionTimeZone = '';
let pendingTimeOut = null;

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
    cancelTaskTimeoutBtn?.addEventListener('click', closeTaskTimeoutModal);
    submitTaskTimeoutBtn?.addEventListener('click', submitTaskTimeout);
    addEmployeeTaskBtn?.addEventListener('click', openEmployeeTaskModal);
    saveEmployeeTaskBtn?.addEventListener('click', addEmployeeTask);
    cancelEmployeeTaskBtn?.addEventListener('click', closeEmployeeTaskModal);
    closeEmployeeTaskModalBtn?.addEventListener('click', closeEmployeeTaskModal);
    employeeTaskNameInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            addEmployeeTask();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            closeEmployeeTaskModal();
        }
    });
    employeeTaskModal?.addEventListener('click', (event) => {
        if (event.target === employeeTaskModal) {
            closeEmployeeTaskModal();
        }
    });
    taskTimeoutModal?.addEventListener('click', (event) => {
        if (event.target === taskTimeoutModal) {
            closeTaskTimeoutModal();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && employeeTaskModal?.classList.contains('open')) {
            closeEmployeeTaskModal();
            return;
        }
        if (event.key === 'Escape' && taskTimeoutModal?.classList.contains('open')) {
            closeTaskTimeoutModal();
        }
    });
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

    if (type === 'out') {
        await prepareTimeOut(employeeId);
        return;
    }

    await recordTimeIn(employeeId);
}

async function recordTimeIn(employeeId) {
    setButtonsDisabled(true);

    try {
        const result = await appClient.recordTimeIn(employeeId);
        showMessage(`${result.user.name} timed in at ${appClient.formatDisplayTime(result.time)}.`, false);
        empIdInput.value = '';
        empIdInput.focus();
    } catch (error) {
        console.error('Failed to record station attendance action:', error);
        showMessage(error.message, true);
    } finally {
        setButtonsDisabled(false);
    }
}

async function prepareTimeOut(employeeId) {
    setButtonsDisabled(true);
    try {
        const user = await appClient.getUser(employeeId);
        const assignedTasks = getAssignedTasks(user);
        await openTaskTimeoutModal({
            employeeId,
            userName: user?.name || employeeId,
            tasks: assignedTasks
        });
    } catch (error) {
        console.error('Failed to prepare station time out:', error);
        showMessage(error.message, true);
    } finally {
        if (!taskTimeoutModal?.classList.contains('open')) {
            setButtonsDisabled(false);
        }
    }
}

async function recordTimeOut(employeeId, payload = {}) {
    setButtonsDisabled(true);
    try {
        const result = await appClient.recordTimeOut(employeeId, payload);
        const taskText = formatTaskResults(result?.record?.taskResults || [])
            ? ` Tasks: ${formatTaskResults(result.record.taskResults)}.`
            : '';
        showMessage(`${result.user.name} timed out at ${appClient.formatDisplayTime(result.time)}. Total hours: ${result.workedHours}.${taskText}`, false);
        empIdInput.value = '';
        empIdInput.focus();
        return result;
    } catch (error) {
        console.error('Failed to record station attendance action:', error);
        showMessage(error.message, true);
        throw error;
    } finally {
        setButtonsDisabled(false);
    }
}

function getAssignedTasks(user) {
    const tasks = Array.isArray(user?.assigned_tasks) ? user.assigned_tasks : [];
    const normalizedTasks = tasks
        .map((task) => ({
            id: String(task?.id || '').trim(),
            name: String(task?.name || '').trim(),
            inputType: normalizeTaskInputType(task?.inputType || task?.input_type)
        }))
        .filter((task) => task.id && task.name);
    if (normalizedTasks.length) {
        return normalizedTasks;
    }

    const assignedTask = user?.assigned_task || null;
    const taskId = String(assignedTask?.id || user?.assigned_task_id || '').trim();
    const taskName = String(assignedTask?.name || user?.assigned_task_name || '').trim();
    return taskId && taskName ? [{
        id: taskId,
        name: taskName,
        inputType: normalizeTaskInputType(assignedTask?.inputType || assignedTask?.input_type)
    }] : [];
}

async function openTaskTimeoutModal({ employeeId, userName, tasks }) {
    pendingTimeOut = { employeeId, userName, tasks };
    if (taskTimeoutLabel) {
        taskTimeoutLabel.textContent = `${userName}: review today’s work before submitting time out.`;
    }
    renderTaskChecklist(tasks);
    closeEmployeeTaskModal();
    if (timeOutPreview) {
        timeOutPreview.textContent = new Date().toLocaleTimeString('en-US', buildTimeZoneOptions({
            hour: 'numeric',
            minute: '2-digit'
        }));
    }
    setTaskModalError('');
    setTaskModalBusy(true);
    taskTimeoutModal?.classList.add('open');
    taskTimeoutModal?.setAttribute('aria-hidden', 'false');
    try {
        await kpiTimeoutController.load(employeeId);
        setTaskModalBusy(false);
        window.setTimeout(() => (
            taskChecklist?.querySelector('.task-entry-input:not(:disabled), [data-role="taskCheck"]:not(:disabled)')
            || submitTaskTimeoutBtn
        )?.focus(), 30);
    } catch (error) {
        console.error('Failed to prepare station KPI evaluation:', error);
        setTaskModalError(error.message || 'Unable to load KPI evaluation details.');
        setTaskModalBusy(true);
        if (cancelTaskTimeoutBtn) cancelTaskTimeoutBtn.disabled = false;
    }
}

function renderTaskChecklist(tasks = []) {
    if (!taskChecklist) {
        return;
    }

    if (!tasks.length) {
        taskChecklist.innerHTML = '<div class="kpi-empty-state">No assigned tasks for this shift.</div>';
        return;
    }

    taskChecklist.innerHTML = tasks.map(createTaskChecklistRow).join('');
    bindTaskChecklistRows();
}

function createTaskChecklistRow(task = {}) {
    const isCustom = Boolean(task?.isCustom || task?.custom || !String(task?.id || '').trim());
    const inputType = normalizeTaskInputType(task?.inputType || task?.input_type);
    const taskName = appClient.escapeHtml(task?.name || '');
    let control = '';
    if (inputType === 'checklist') {
        control = `
          <label class="task-check-only">
            <input type="checkbox" data-role="taskCheck">
            <span data-role="taskName">${taskName}</span>
          </label>
        `;
    } else {
        const isNumeric = inputType === 'numeric';
        control = `
          <div class="task-row-title">
            <i class="fa-solid ${isNumeric ? 'fa-arrow-up-9-1' : 'fa-font'}"></i>
            <span data-role="taskName">${taskName}</span>
          </div>
          <input class="task-entry-input" data-role="taskValue" type="text" ${isNumeric ? 'inputmode="numeric" pattern="[0-9]*" placeholder="Completed quantity"' : 'maxlength="500" placeholder="Enter task details"'} autocomplete="off">
        `;
    }
    return `
        <div class="task-check-row" data-task-id="${appClient.escapeHtml(task?.id || '')}" data-task-custom="${isCustom ? 'true' : 'false'}" data-task-input-type="${inputType}">
          ${control}
        </div>
    `;
}

function bindTaskChecklistRows(root = taskChecklist) {
    Array.from(root?.querySelectorAll('.task-check-row:not([data-bound])') || []).forEach((row) => {
        row.dataset.bound = 'true';
        const checkbox = row.querySelector('[data-role="taskCheck"]');
        checkbox?.addEventListener('change', () => {
            setTaskModalError('');
        });
        const valueInput = row.querySelector('[data-role="taskValue"]');
        valueInput?.addEventListener('input', () => {
            if (row.dataset.taskInputType === 'numeric') {
                valueInput.value = valueInput.value.replace(/\D+/g, '');
            }
            setTaskModalError('');
        });
        valueInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                submitTaskTimeout();
            }
        });
    });
}

function openEmployeeTaskModal() {
    if (employeeTaskNameInput) employeeTaskNameInput.value = '';
    const numericOption = employeeTaskInputTypeInputs.find((input) => input.value === 'numeric');
    if (numericOption) numericOption.checked = true;
    setEmployeeTaskModalError('');
    setTaskModalError('');
    employeeTaskModal?.classList.add('open');
    employeeTaskModal?.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => employeeTaskNameInput?.focus(), 0);
}

function closeEmployeeTaskModal() {
    if (employeeTaskNameInput) employeeTaskNameInput.value = '';
    setEmployeeTaskModalError('');
    employeeTaskModal?.classList.remove('open');
    employeeTaskModal?.setAttribute('aria-hidden', 'true');
}

function setEmployeeTaskModalError(message = '') {
    if (employeeTaskModalError) employeeTaskModalError.textContent = message;
}

function addEmployeeTask() {
    if (!pendingTimeOut || !taskChecklist) {
        return;
    }

    const taskName = String(employeeTaskNameInput?.value || '').trim();
    const inputType = employeeTaskInputTypeInputs.find((input) => input.checked)?.value || 'numeric';
    if (!taskName) {
        setEmployeeTaskModalError('Enter a task name.');
        employeeTaskNameInput?.focus();
        return;
    }

    const existingRow = Array.from(taskChecklist.querySelectorAll('.task-check-row')).find((row) => (
        String(row.querySelector('[data-role="taskName"]')?.textContent || '').trim().toLowerCase() === taskName.toLowerCase()
    ));
    if (existingRow) {
        const targetControl = existingRow.querySelector('[data-role="taskCheck"], [data-role="taskValue"]');
        if (targetControl?.matches('[data-role="taskCheck"]')) targetControl.checked = true;
        targetControl?.focus();
        closeEmployeeTaskModal();
        setTaskModalError('');
        return;
    }

    const customTask = { id: '', name: taskName, inputType, isCustom: true };
    pendingTimeOut.tasks.push(customTask);
    taskChecklist.querySelector('.kpi-empty-state')?.remove();
    taskChecklist.insertAdjacentHTML('beforeend', createTaskChecklistRow(customTask));
    bindTaskChecklistRows();

    const row = taskChecklist.lastElementChild;
    const targetControl = row?.querySelector('[data-role="taskCheck"], [data-role="taskValue"]');
    if (targetControl?.matches('[data-role="taskCheck"]')) targetControl.checked = true;
    targetControl?.focus();
    closeEmployeeTaskModal();
    setTaskModalError('');
}

function closeTaskTimeoutModal() {
    pendingTimeOut = null;
    kpiTimeoutController.reset();
    closeEmployeeTaskModal();
    taskTimeoutModal?.classList.remove('open');
    taskTimeoutModal?.setAttribute('aria-hidden', 'true');
    setTaskModalError('');
    setTaskModalBusy(false);
    setButtonsDisabled(false);
    empIdInput.focus();
}

async function submitTaskTimeout() {
    if (!pendingTimeOut) {
        closeTaskTimeoutModal();
        return;
    }

    const taskResults = collectTaskResults();
    if (taskResults === null) {
        return;
    }
    if (pendingTimeOut.tasks.length && !taskResults.length) {
        setTaskModalError('Check at least one task.');
        return;
    }

    let kpiPayload = null;
    try {
        kpiPayload = kpiTimeoutController.collect();
    } catch (error) {
        setTaskModalError(error.message || 'Complete the KPI evaluation fields.');
        error.focusElement?.focus?.();
        error.focusElement?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        return;
    }

    setTaskModalBusy(true);
    try {
        await recordTimeOut(pendingTimeOut.employeeId, {
            taskResults,
            ...kpiPayload
        });
        pendingTimeOut = null;
        kpiTimeoutController.reset();
        taskTimeoutModal?.classList.remove('open');
        taskTimeoutModal?.setAttribute('aria-hidden', 'true');
        setTaskModalError('');
    } catch (error) {
        setTaskModalError(error.message || 'Unable to time out. Check the message on the station.');
    } finally {
        setTaskModalBusy(false);
        if (taskTimeoutModal?.classList.contains('open')) {
            setButtonsDisabled(true);
        }
    }
}

function collectTaskResults() {
    const rows = Array.from(taskChecklist?.querySelectorAll('.task-check-row') || []);
    const results = [];
    for (const row of rows) {
        const inputType = normalizeTaskInputType(row.dataset.taskInputType);
        const checkbox = row.querySelector('[data-role="taskCheck"]');
        const valueInput = row.querySelector('[data-role="taskValue"]');
        const rawValue = String(valueInput?.value || '').trim();
        const isCompleted = inputType === 'checklist' ? Boolean(checkbox?.checked) : Boolean(rawValue);
        if (!isCompleted) {
            continue;
        }

        const taskId = String(row.dataset.taskId || '').trim();
        const taskName = String(row.querySelector('[data-role="taskName"]')?.textContent || '').trim();
        const isCustom = row.dataset.taskCustom === 'true';
        if (!taskId && (!isCustom || !taskName)) {
            setTaskModalError('Selected task is invalid.');
            return null;
        }
        if (inputType === 'numeric' && !/^\d+$/.test(rawValue)) {
            setTaskModalError('Enter numbers only for numeric tasks.');
            valueInput?.focus();
            return null;
        }
        const result = isCustom
            ? { taskName, inputType, isCustom: true }
            : { taskId };
        result.taskValue = inputType === 'checklist' ? true : rawValue;
        results.push(result);
    }
    return results;
}

function formatTaskResults(taskResults = []) {
    return (Array.isArray(taskResults) ? taskResults : [])
        .map((task) => {
            const name = String(task?.name || task?.taskName || '').trim();
            if (!name) {
                return '';
            }
            const inputType = normalizeTaskInputType(task?.inputType || task?.input_type);
            if (inputType === 'checklist') {
                return `${name}: Completed`;
            }
            if (inputType === 'text') {
                return `${name}: ${String(task?.value ?? task?.text ?? '').trim()}`;
            }
            return `${name}: ${Number(task?.value ?? task?.count ?? task?.taskCount ?? 0)}`;
        })
        .filter(Boolean)
        .join(', ');
}

function setTaskModalError(message) {
    if (taskTimeoutError) {
        taskTimeoutError.textContent = message || '';
    }
}

function setTaskModalBusy(disabled) {
    kpiTimeoutController.setBusy(disabled);
    Array.from(taskChecklist?.querySelectorAll('input') || []).forEach((input) => {
        input.disabled = disabled;
    });
    Array.from(employeeTaskAdd?.querySelectorAll('button') || []).forEach((control) => {
        control.disabled = disabled;
    });
    Array.from(employeeTaskModal?.querySelectorAll('button, input') || []).forEach((control) => {
        control.disabled = disabled;
    });
    if (cancelTaskTimeoutBtn) {
        cancelTaskTimeoutBtn.disabled = disabled;
    }
    if (submitTaskTimeoutBtn) {
        submitTaskTimeoutBtn.disabled = disabled;
    }
}

function normalizeTaskInputType(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'checklist' || normalized === 'text') {
        return normalized;
    }
    return 'numeric';
}

function updateClock() {
    const now = new Date();
    clock.innerText = now.toLocaleTimeString('en-US', buildTimeZoneOptions({
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
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
