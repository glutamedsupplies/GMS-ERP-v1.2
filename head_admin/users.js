const appClient = window.appClient;

const FEATURE_CONFIG = Object.freeze([
    { key: 'expenses', label: 'Expenses', defaultEnabled: true, requiredModules: ['sales'] },
    { key: 'order_form', label: 'Order Form', defaultEnabled: true, requiredModules: ['invoicing'] },
    { key: 'inventory', label: 'Inventory', defaultEnabled: true, requiredModules: ['inventory'] },
    { key: 'composite', label: 'Composite', defaultEnabled: true, requiredModules: ['inventory'] },
    { key: 'lbc_tracking', label: 'LBC Tracking', defaultEnabled: false, requiredModules: ['sales'], gmsOrGwdOnly: true },
    { key: 'lbc_collection_confirmation', label: 'LBC Collection Confirmation (use Assign on LBC Tracking)', defaultEnabled: false, requiredModules: ['sales'], gmsOrGwdOnly: true },
    { key: 'sales_report', label: 'Sales Report', defaultEnabled: false, requiredModules: ['sales', 'reports'] }
]);
const BASE_FEATURE_DEFAULTS = Object.freeze(FEATURE_CONFIG.reduce((defaults, feature) => {
    defaults[feature.key] = feature.defaultEnabled !== false;
    return defaults;
}, {}));
const USER_ACCOUNT_STATUS_LABELS = Object.freeze({
    active: 'Active',
    inactive: 'Inactive',
    suspended: 'Suspended'
});

const limitText = document.getElementById('limitText');
const statusEl = document.getElementById('status');
const roleFilter = document.getElementById('roleFilter');
const searchInput = document.getElementById('searchInput');
const tableBody = document.getElementById('userTableBody');

const userIdInput = document.getElementById('userId');
const userNameInput = document.getElementById('userName');
const userRoleInput = document.getElementById('userRole');
const userBranchInput = document.getElementById('userBranch');
const userPasswordInput = document.getElementById('userPassword');
const createUserBtn = document.getElementById('createUserBtn');
const createFeatureAccessContainer = document.getElementById('createFeatureAccess');
const createFeatureInputs = Array.from(document.querySelectorAll('input[data-feature-scope="create"][data-feature-key]'));
const taskNameInput = document.getElementById('taskNameInput');
const createTaskBtn = document.getElementById('createTaskBtn');
const taskList = document.getElementById('taskList');
const taskCreateModal = document.getElementById('taskCreateModal');
const taskCreateContext = document.getElementById('taskCreateContext');
const taskCreateStatus = document.getElementById('taskCreateStatus');
const closeTaskCreateModalBtn = document.getElementById('closeTaskCreateModalBtn');
const cancelTaskCreateBtn = document.getElementById('cancelTaskCreateBtn');
const saveTaskCreateBtn = document.getElementById('saveTaskCreateBtn');
const taskInputTypeInputs = Array.from(document.querySelectorAll('input[name="taskInputType"]'));

const editModal = document.getElementById('editUserModal');
const closeEditUserModalBtn = document.getElementById('closeEditUserModalBtn');
const cancelEditUserBtn = document.getElementById('cancelEditUserBtn');
const saveEditUserBtn = document.getElementById('saveEditUserBtn');
const editStatusEl = document.getElementById('editStatus');
const editUserIdInput = document.getElementById('editUserId');
const editUserNameInput = document.getElementById('editUserName');
const editUserRoleInput = document.getElementById('editUserRole');
const editUserBranchInput = document.getElementById('editUserBranch');
const editUserStatusInput = document.getElementById('editUserStatus');
const editUserPasswordInput = document.getElementById('editUserPassword');
const editFeatureAccessContainer = document.getElementById('editFeatureAccess');
const editFeatureInputs = Array.from(document.querySelectorAll('input[data-feature-scope="edit"][data-feature-key]'));
const pendingSignupList = document.getElementById('pendingSignupList');
const pendingSignupEmpty = document.getElementById('pendingSignupEmpty');
const pendingSignupCount = document.getElementById('pendingSignupCount');
const refreshSignupRequestsBtn = document.getElementById('refreshSignupRequestsBtn');

const state = {
    users: [],
    branches: [],
    tasks: [],
    bootstrap: null,
    taskCreateUserId: '',
    editingUserId: '',
    editingFeatureAccess: { ...BASE_FEATURE_DEFAULTS },
    allowedFeatureAccess: { ...BASE_FEATURE_DEFAULTS }
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    roleFilter.addEventListener('change', refreshData);
    searchInput.addEventListener('input', renderRows);
    createUserBtn.addEventListener('click', createUser);
    createTaskBtn?.addEventListener('click', () => openTaskCreateModal());
    saveTaskCreateBtn?.addEventListener('click', createTask);
    closeTaskCreateModalBtn?.addEventListener('click', closeTaskCreateModal);
    cancelTaskCreateBtn?.addEventListener('click', closeTaskCreateModal);
    taskNameInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            createTask();
        }
    });
    taskCreateModal?.addEventListener('click', (event) => {
        if (event.target === taskCreateModal) {
            closeTaskCreateModal();
        }
    });
    refreshSignupRequestsBtn?.addEventListener('click', loadSignupRequests);

    closeEditUserModalBtn?.addEventListener('click', closeEditModal);
    cancelEditUserBtn?.addEventListener('click', closeEditModal);
    saveEditUserBtn?.addEventListener('click', saveEditUser);
    editModal?.addEventListener('click', (event) => {
        if (event.target === editModal) {
            closeEditModal();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (taskCreateModal?.classList.contains('open')) {
                closeTaskCreateModal();
                return;
            }
            if (editModal?.classList.contains('open')) {
                closeEditModal();
            }
            closeTaskDropdowns();
        }
    });
    document.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('.task-dropdown')) {
            return;
        }
        closeTaskDropdowns();
    });

    applyFeatureAccessToInputs(getFeatureDefaults(), createFeatureInputs);
    await refreshData();
    await loadSignupRequests();
}

async function refreshData() {
    setStatus('Loading...', false);
    try {
        const role = roleFilter.value;
        const [bootstrap, users, branches, tasks] = await Promise.all([
            appClient.getBootstrap(),
            appClient.listUsers({ role, filter: '' }),
            appClient.listBranches(),
            appClient.listTasks()
        ]);
        state.bootstrap = bootstrap;
        state.allowedFeatureAccess = resolveFeatureAvailability();
        state.users = users || [];
        state.branches = (branches || []).filter((branch) => Boolean(branch.is_active));
        state.tasks = Array.isArray(tasks) ? tasks : [];
        applyFeatureInputAvailability(createFeatureInputs);
        applyFeatureInputAvailability(editFeatureInputs);
        applyFeatureAvailabilityHint(createFeatureAccessContainer, createFeatureInputs);
        applyFeatureAvailabilityHint(editFeatureAccessContainer, editFeatureInputs);
        applyFeatureAccessToInputs(getFeatureDefaults(), createFeatureInputs);
        if (!state.editingUserId) {
            state.editingFeatureAccess = getFeatureDefaults();
        }
        renderLimits();
        renderCreateBranchOptions();
        renderTaskList();
        renderRows();
        setStatus('');
    } catch (error) {
        console.error('Failed to load users:', error);
        setStatus(error.message || 'Failed to load users.', true);
    }
}

function renderLimits() {
    const limits = state.bootstrap?.limits?.users || { current: 0, max: 0 };
    limitText.textContent = `Active users: ${Number(limits.current || 0)} / ${Number(limits.max || 0)}`;
}

function renderCreateBranchOptions() {
    fillBranchOptions(userBranchInput, userBranchInput.value || state.branches[0]?.id || '');
}

function normalizeUserAccountStatusValue(value = '') {
    return String(value || '').trim().toLowerCase();
}

function getUserAccountStatus(user) {
    const normalized = normalizeUserAccountStatusValue(user?.account_status);
    if (Object.prototype.hasOwnProperty.call(USER_ACCOUNT_STATUS_LABELS, normalized)) {
        return normalized;
    }

    return user?.is_active === false ? 'suspended' : 'active';
}

function getUserStatusLabel(status = '') {
    return USER_ACCOUNT_STATUS_LABELS[normalizeUserAccountStatusValue(status)] || USER_ACCOUNT_STATUS_LABELS.active;
}

function fillBranchOptions(selectEl, selectedBranchId = '') {
    if (!selectEl) {
        return;
    }

    selectEl.innerHTML = '';
    if (!state.branches.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No active branch';
        selectEl.appendChild(option);
        return;
    }

    state.branches.forEach((branch) => {
        const option = document.createElement('option');
        option.value = branch.id;
        option.textContent = branch.branch_name;
        selectEl.appendChild(option);
    });

    const hasSelected = state.branches.some((branch) => String(branch.id) === String(selectedBranchId));
    selectEl.value = hasSelected
        ? String(selectedBranchId)
        : String(state.branches[0].id || '');
}

function renderRows() {
    const search = searchInput.value.trim().toLowerCase();
    const rows = state.users.filter((user) => {
        if (!search) {
            return true;
        }
        const haystack = `${user.id || ''} ${user.name || ''}`.toLowerCase();
        return haystack.includes(search);
    });

    if (!rows.length) {
        tableBody.innerHTML = '<tr><td class="empty-row" colspan="9">No users found.</td></tr>';
        return;
    }

    tableBody.innerHTML = rows.map((user) => {
        const accountStatus = getUserAccountStatus(user);
        const isActive = accountStatus === 'active';
        const safeId = appClient.escapeHtml(user.id || '');
        const toggleLabel = isActive ? 'Suspend user' : 'Reactivate user';
        const toggleIcon = isActive ? 'fa-user-slash' : 'fa-user-check';
        const toggleClass = isActive ? 'suspend' : 'reactivate';
        const statusLabel = appClient.escapeHtml(getUserStatusLabel(accountStatus));
        return `
            <tr>
              <td>${safeId}</td>
              <td>${appClient.escapeHtml(user.name || '')}</td>
              <td>${appClient.escapeHtml(user.role || '')}</td>
              <td>${appClient.escapeHtml(user.branch_name || '')}</td>
              <td>${renderFeaturePills(user.feature_access)}</td>
              <td class="task-cell">${renderTaskSelect(user, accountStatus)}</td>
              <td><span class="user-status-dot ${accountStatus}" role="img" title="${statusLabel}" aria-label="${statusLabel}"></span></td>
              <td>
                <div class="actions">
                  <button class="edit" type="button" data-action="edit" data-id="${safeId}" title="Edit user" aria-label="Edit user ${safeId}"><i class="fa-solid fa-pen"></i></button>
                  <button class="toggle ${toggleClass}" type="button" data-action="toggle" data-id="${safeId}" title="${toggleLabel}" aria-label="${toggleLabel} ${safeId}"><i class="fa-solid ${toggleIcon}"></i></button>
                  <button class="delete" type="button" data-action="delete" data-id="${safeId}" title="Delete user" aria-label="Delete user ${safeId}"><i class="fa-solid fa-trash-can"></i></button>
                </div>
              </td>
            </tr>
        `;
    }).join('');

    Array.from(tableBody.querySelectorAll('.actions button[data-action]')).forEach((button) => {
        button.addEventListener('click', () => handleRowAction(button.dataset.action, button.dataset.id));
    });
    Array.from(tableBody.querySelectorAll('button[data-action="toggle-task-dropdown"]')).forEach((button) => {
        button.addEventListener('click', () => toggleTaskDropdown(button.closest('.task-dropdown')));
    });
    Array.from(tableBody.querySelectorAll('input[data-action="assign-task-checkbox"], input[data-action="assign-custom-task-checkbox"]')).forEach((input) => {
        input.addEventListener('change', () => {
            const dropdown = input.closest('.task-dropdown');
            const user = state.users.find((item) => String(item.id) === String(dropdown?.dataset.userId || ''));
            const customTasks = readCustomTaskSelection(dropdown, user);
            updateTaskDropdownSummary(dropdown, [
                ...readTaskSelection(dropdown),
                ...customTasks.map((task) => task.id)
            ], user);
        });
    });
    Array.from(tableBody.querySelectorAll('button[data-action="apply-task-selection"]')).forEach((button) => {
        button.addEventListener('click', () => assignUserTask(button.dataset.id, button.closest('.task-dropdown')));
    });
    Array.from(tableBody.querySelectorAll('button[data-action="clear-task-selection"]')).forEach((button) => {
        button.addEventListener('click', () => clearUserTaskSelection(button.dataset.id, button.closest('.task-dropdown')));
    });
    Array.from(tableBody.querySelectorAll('button[data-action="show-task-create"]')).forEach((button) => {
        button.addEventListener('click', () => openTaskCreateModal(button.dataset.id));
    });
}

function renderFeaturePills(featureAccess) {
    const normalized = normalizeFeatureAccess(featureAccess);
    const enabled = FEATURE_CONFIG.filter((feature) => isFeatureAvailable(feature.key) && normalized[feature.key]);

    if (!enabled.length) {
        return '<span class="feature-pill off">No Access</span>';
    }

    return enabled
        .map((feature) => `<span class="feature-pill">${appClient.escapeHtml(feature.label)}</span>`)
        .join('');
}

function renderTaskSelect(user, accountStatus) {
    if (accountStatus !== 'active') {
        return '<span class="task-muted">Active users only</span>';
    }

    const selectedTaskIds = getAssignedTaskIds(user);
    const customTasks = getCustomAssignedTasks(user);
    const safeId = appClient.escapeHtml(user.id || '');
    const summary = appClient.escapeHtml(formatTaskSelectionLabel([...selectedTaskIds, ...customTasks.map((task) => task.id)], user));
    const options = state.tasks.length
        ? `<div class="task-dropdown-header">Main Task</div>` +
        state.tasks.map((task) => {
            const taskId = String(task?.id || '').trim();
            const checked = selectedTaskIds.includes(taskId) ? ' checked' : '';
            return `
                <label class="task-option">
                  <input type="checkbox" data-action="assign-task-checkbox" value="${appClient.escapeHtml(taskId)}"${checked}>
                  <span class="task-option-name">${appClient.escapeHtml(task?.name || '')}</span>
                  <span class="task-option-type">${getTaskInputTypeIcon(task?.inputType || task?.input_type)}</span>
                </label>
            `;
        }).join('')
        : '<div class="task-dropdown-empty">No tasks yet.</div>';
    const customOptions = customTasks.length ? `
        <div class="task-dropdown-header">Specific Task</div>
        ${customTasks.map((task) => `
            <label class="task-option">
              <input type="checkbox" data-action="assign-custom-task-checkbox" value="${appClient.escapeHtml(task.id)}" checked>
              <span class="task-option-name">${appClient.escapeHtml(task.name || '')}</span>
              <span class="task-option-type">${getTaskInputTypeIcon(task.inputType || task.input_type)}</span>
            </label>
        `).join('')}
    ` : '';
    const addTaskControl = `
        <footer class="task-dropdown-footer">
          <button class="task-dropdown-add-toggle" type="button" data-action="show-task-create" data-id="${safeId}">
            <i class="fa-solid fa-plus"></i>
            <span>Add Employee Task</span>
          </button>
        </footer>
    `;
    const actions = (state.tasks.length || customTasks.length) ? `
        <div class="task-dropdown-actions">
          <button class="task-dropdown-clear" type="button" data-action="clear-task-selection" data-id="${safeId}">Clear</button>
          <button class="task-dropdown-apply" type="button" data-action="apply-task-selection" data-id="${safeId}">Apply</button>
        </div>
    ` : '';

    return `
        <div class="task-dropdown" data-user-id="${safeId}">
          <button class="task-dropdown-btn" type="button" data-action="toggle-task-dropdown" data-id="${safeId}" aria-expanded="false">
            <span class="task-summary">${summary}</span>
            <i class="fa-solid fa-chevron-down"></i>
          </button>
          <div class="task-dropdown-menu">
            <div class="task-dropdown-content">
              ${options}
              ${customOptions}
            </div>
            <footer class="task-dropdown-footer">
              ${addTaskControl}
              ${actions}
            </footer>
          </div>
        </div>
    `;
}

function getAssignedTaskIds(user = {}) {
    const ids = (Array.isArray(user.assigned_task_ids) ? user.assigned_task_ids : [])
        .map((taskId) => String(taskId || '').trim())
        .filter((taskId) => taskId && state.tasks.some((task) => String(task.id || '') === taskId));
    if (!ids.length && user.assigned_task_id) {
        const legacyId = String(user.assigned_task_id || '').trim();
        if (state.tasks.some((task) => String(task.id || '') === legacyId)) {
            ids.push(legacyId);
        }
    }
    return [...new Set(ids)];
}

function getCustomAssignedTasks(user = {}) {
    return (Array.isArray(user.assigned_tasks) ? user.assigned_tasks : [])
        .filter((task) => Boolean(task?.isCustom || task?.is_custom))
        .map((task) => ({
            id: String(task?.id || '').trim(),
            name: String(task?.name || '').trim(),
            inputType: task?.inputType || task?.input_type || 'numeric'
        }))
        .filter((task) => task.id && task.name);
}

function formatTaskSelectionLabel(taskIds = [], user = null) {
    const ids = [...new Set((Array.isArray(taskIds) ? taskIds : [])
        .map((taskId) => String(taskId || '').trim())
        .filter(Boolean))];
    if (!ids.length) {
        return 'No task';
    }
    if (ids.length === 1) {
        const task = state.tasks.find((item) => String(item.id || '') === ids[0]);
        const customTask = user ? getCustomAssignedTasks(user).find((item) => String(item.id || '') === ids[0]) : null;
        return task?.name || customTask?.name || '1 task';
    }
    return `${ids.length} tasks`;
}

function renderTaskList() {
    if (!taskList) {
        return;
    }

    if (!state.tasks.length) {
        taskList.innerHTML = '<div class="task-empty">No tasks yet.</div>';
        return;
    }

    taskList.innerHTML = state.tasks.map((task) => `
        <span class="task-chip">
          ${appClient.escapeHtml(task.name || '')}
          <span class="task-type-badge">${appClient.escapeHtml(formatTaskInputType(task.inputType || task.input_type))}</span>
          <button type="button" data-action="delete-task" data-task-id="${appClient.escapeHtml(task.id || '')}" aria-label="Remove ${appClient.escapeHtml(task.name || 'task')}">&times;</button>
        </span>
    `).join('');

    Array.from(taskList.querySelectorAll('button[data-action="delete-task"]')).forEach((button) => {
        button.addEventListener('click', () => deleteTask(button.dataset.taskId));
    });
}

async function createUser() {
    const id = userIdInput.value.trim();
    const name = userNameInput.value.trim();
    const role = userRoleInput.value;
    const branchId = userBranchInput.value;
    const password = userPasswordInput.value.trim();
    const featureAccess = readFeatureAccessFromInputs(createFeatureInputs);

    if (!id || !name || !password) {
        setStatus('Username, display name, and password are required.', true);
        return;
    }
    if (password.length < 8) {
        setStatus('Password must be at least 8 characters.', true);
        return;
    }
    if (!branchId) {
        setStatus('Branch is required.', true);
        return;
    }

    createUserBtn.disabled = true;
    setStatus('Creating user...');
    try {
        await appClient.createUser({
            id,
            name,
            role,
            branch_id: branchId,
            password,
            feature_access: featureAccess
        });
        userIdInput.value = '';
        userNameInput.value = '';
        userPasswordInput.value = '';
        await refreshData();
        setStatus('User created.');
    } catch (error) {
        console.error('Failed to create user:', error);
        if (error.code === 'LIMIT_USERS_REACHED') {
            setStatus('User limit reached. Upgrade your plan to add more users.', true);
            return;
        }
        setStatus(error.message || 'Failed to create user.', true);
    } finally {
        createUserBtn.disabled = false;
    }
}

async function createTask() {
    const name = taskNameInput?.value.trim() || '';
    const inputType = readSelectedTaskInputType();
    const userId = String(state.taskCreateUserId || '').trim();
    const user = userId
        ? state.users.find((item) => String(item.id) === userId)
        : null;
    if (!name) {
        setTaskCreateStatus('Task name is required.', true);
        taskNameInput?.focus();
        return;
    }

    setTaskCreateBusy(true);
    setTaskCreateStatus(user ? 'Adding employee task...' : 'Adding task...');
    try {
        if (user) {
            const customTasks = [
                ...getCustomAssignedTasks(user),
                { name, inputType, isCustom: true }
            ];
            const updatedUser = await appClient.assignUserTask(userId, {
                taskIds: getAssignedTaskIds(user),
                customTasks
            });
            state.users = state.users.map((item) => String(item.id) === userId ? updatedUser : item);
        } else {
            const task = await appClient.createTask({ name, inputType });
            state.tasks = [...state.tasks, task].sort((left, right) => (
                String(left?.name || '').localeCompare(String(right?.name || ''), undefined, { sensitivity: 'base' })
            ));
        }

        renderTaskList();
        renderRows();
        closeTaskCreateModal();
        setStatus(user ? `Employee task saved for ${user.name || user.id}.` : 'Task added.');
    } catch (error) {
        console.error('Failed to add task:', error);
        setTaskCreateStatus(error.message || 'Failed to add task.', true);
    } finally {
        setTaskCreateBusy(false);
    }
}

async function deleteTask(taskId) {
    const task = state.tasks.find((item) => String(item.id) === String(taskId));
    if (!task) {
        return;
    }

    const confirmed = window.confirm(`Remove task "${task.name}"? Active user assignments using this task will be cleared.`);
    if (!confirmed) {
        return;
    }

    setStatus('Removing task...');
    try {
        await appClient.deleteTask(taskId);
        await refreshData();
        setStatus('Task removed.');
    } catch (error) {
        console.error('Failed to remove task:', error);
        setStatus(error.message || 'Failed to remove task.', true);
    }
}

async function assignUserTask(userId, dropdownEl) {
    const user = state.users.find((item) => String(item.id) === String(userId));
    if (!user || !dropdownEl) {
        return;
    }

    const previousTaskIds = getAssignedTaskIds(user);
    const previousCustomTasks = getCustomAssignedTasks(user);
    const taskIds = readTaskSelection(dropdownEl);
    const customTasks = readCustomTaskSelection(dropdownEl, user);
    setTaskDropdownBusy(dropdownEl, true);
    setStatus(taskIds.length || customTasks.length ? 'Assigning tasks...' : 'Clearing tasks...');
    try {
        const updatedUser = await appClient.assignUserTask(userId, { taskIds, customTasks });
        state.users = state.users.map((item) => (
            String(item.id) === String(userId) ? updatedUser : item
        ));
        renderRows();
        setStatus(taskIds.length || customTasks.length ? 'Tasks assigned.' : 'Tasks cleared.');
    } catch (error) {
        console.error('Failed to assign task:', error);
        restoreTaskSelection(dropdownEl, previousTaskIds);
        restoreCustomTaskSelection(dropdownEl, previousCustomTasks);
        updateTaskDropdownSummary(dropdownEl, [...previousTaskIds, ...previousCustomTasks.map((task) => task.id)], user);
        setStatus(error.message || 'Failed to assign task.', true);
    } finally {
        setTaskDropdownBusy(dropdownEl, false);
    }
}

async function clearUserTaskSelection(userId, dropdownEl) {
    if (!dropdownEl) {
        return;
    }
    restoreTaskSelection(dropdownEl, []);
    restoreCustomTaskSelection(dropdownEl, []);
    updateTaskDropdownSummary(dropdownEl, []);
    await assignUserTask(userId, dropdownEl);
}

function openTaskCreateModal(userId = '') {
    const normalizedUserId = String(userId || '').trim();
    const user = normalizedUserId
        ? state.users.find((item) => String(item.id) === normalizedUserId)
        : null;
    state.taskCreateUserId = user ? normalizedUserId : '';
    if (taskNameInput) taskNameInput.value = '';
    const numericOption = taskInputTypeInputs.find((input) => input.value === 'numeric');
    if (numericOption) numericOption.checked = true;
    if (taskCreateContext) {
        taskCreateContext.textContent = user
            ? `Assigning to: ${user.name || user.id}`
            : 'Task library';
    }
    setTaskCreateStatus('');
    closeTaskDropdowns();
    taskCreateModal?.classList.add('open');
    taskCreateModal?.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => taskNameInput?.focus(), 0);
}

function closeTaskCreateModal() {
    state.taskCreateUserId = '';
    if (taskNameInput) taskNameInput.value = '';
    setTaskCreateStatus('');
    taskCreateModal?.classList.remove('open');
    taskCreateModal?.setAttribute('aria-hidden', 'true');
}

function readSelectedTaskInputType() {
    return taskInputTypeInputs.find((input) => input.checked)?.value || 'numeric';
}

function setTaskCreateBusy(isBusy) {
    Array.from(taskCreateModal?.querySelectorAll('button, input') || []).forEach((control) => {
        control.disabled = Boolean(isBusy);
    });
}

function setTaskCreateStatus(message, isError = false) {
    if (!taskCreateStatus) {
        return;
    }
    taskCreateStatus.textContent = message || '';
    taskCreateStatus.style.color = isError ? '#b91c1c' : '#1f2937';
}

function formatTaskInputType(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'checklist') return 'Checklist';
    if (normalized === 'text') return 'Text';
    return 'Numeric';
}

function getTaskInputTypeIcon(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'checklist') return '<i class="fa-solid fa-list-check"></i>';
    if (normalized === 'text') return '<i class="fa-solid fa-font"></i>';
    return '<i class="fa-solid fa-calculator"></i>';
}

function readTaskSelection(dropdownEl) {
    if (!dropdownEl) {
        return [];
    }
    return [...new Set(Array.from(dropdownEl.querySelectorAll('input[data-action="assign-task-checkbox"]'))
        .filter((input) => input.checked)
        .map((input) => String(input.value || '').trim())
        .filter(Boolean))];
}

function readCustomTaskSelection(dropdownEl, user = {}) {
    if (!dropdownEl) {
        return [];
    }
    const selectedIds = new Set(Array.from(dropdownEl.querySelectorAll('input[data-action="assign-custom-task-checkbox"]'))
        .filter((input) => input.checked)
        .map((input) => String(input.value || '').trim())
        .filter(Boolean));
    return getCustomAssignedTasks(user).filter((task) => selectedIds.has(String(task.id || '')));
}

function restoreTaskSelection(dropdownEl, taskIds = []) {
    if (!dropdownEl) {
        return;
    }
    const selectedTaskIds = new Set((Array.isArray(taskIds) ? taskIds : [])
        .map((taskId) => String(taskId || '').trim())
        .filter(Boolean));
    Array.from(dropdownEl.querySelectorAll('input[data-action="assign-task-checkbox"]')).forEach((input) => {
        input.checked = selectedTaskIds.has(String(input.value || '').trim());
    });
}

function restoreCustomTaskSelection(dropdownEl, customTasks = []) {
    if (!dropdownEl) {
        return;
    }
    const selectedTaskIds = new Set((Array.isArray(customTasks) ? customTasks : [])
        .map((task) => String(task?.id || '').trim())
        .filter(Boolean));
    Array.from(dropdownEl.querySelectorAll('input[data-action="assign-custom-task-checkbox"]')).forEach((input) => {
        input.checked = selectedTaskIds.has(String(input.value || '').trim());
    });
}

function updateTaskDropdownSummary(dropdownEl, taskIds = [], user = null) {
    if (!dropdownEl) {
        return;
    }
    const summaryEl = dropdownEl.querySelector('.task-summary');
    if (summaryEl) {
        summaryEl.textContent = formatTaskSelectionLabel(taskIds, user);
    }
}

function setTaskDropdownBusy(dropdownEl, isBusy) {
    if (!dropdownEl) {
        return;
    }
    dropdownEl.classList.toggle('is-saving', Boolean(isBusy));
    Array.from(dropdownEl.querySelectorAll('button, input')).forEach((control) => {
        control.disabled = Boolean(isBusy);
    });
}

function toggleTaskDropdown(dropdownEl) {
    if (!dropdownEl) {
        return;
    }
    const willOpen = !dropdownEl.classList.contains('open');
    closeTaskDropdowns(dropdownEl);
    dropdownEl.classList.toggle('open', willOpen);
    const button = dropdownEl.querySelector('button[data-action="toggle-task-dropdown"]');
    if (button) {
        button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    }
}

function closeTaskDropdowns(exceptDropdown = null) {
    Array.from(document.querySelectorAll('.task-dropdown.open')).forEach((dropdown) => {
        if (dropdown === exceptDropdown) {
            return;
        }
        dropdown.classList.remove('open');
        const button = dropdown.querySelector('button[data-action="toggle-task-dropdown"]');
        if (button) {
            button.setAttribute('aria-expanded', 'false');
        }
    });
}

async function handleRowAction(action, userId) {
    const user = state.users.find((item) => String(item.id) === String(userId));
    if (!user) {
        return;
    }

    if (action === 'edit') {
        openEditModal(user);
        return;
    }
    if (action === 'toggle') {
        await toggleUser(user);
        return;
    }
    if (action === 'delete') {
        await deleteUser(user);
    }
}

function openEditModal(user) {
    state.editingUserId = String(user.id || '');
    state.editingFeatureAccess = normalizeFeatureAccess(user.feature_access || getFeatureDefaults());
    editUserIdInput.value = String(user.id || '');
    editUserNameInput.value = String(user.name || '');
    editUserRoleInput.value = String(user.role || 'employee');
    fillBranchOptions(editUserBranchInput, user.branch_id || '');
    editUserStatusInput.value = getUserAccountStatus(user);
    editUserPasswordInput.value = '';
    applyFeatureAccessToInputs(state.editingFeatureAccess, editFeatureInputs);
    setEditStatus('', false);
    editModal.classList.add('open');
    editModal.setAttribute('aria-hidden', 'false');
    editUserNameInput.focus();
}

function closeEditModal() {
    state.editingUserId = '';
    state.editingFeatureAccess = getFeatureDefaults();
    setEditStatus('', false);
    editModal.classList.remove('open');
    editModal.setAttribute('aria-hidden', 'true');
}

async function saveEditUser() {
    const targetUserId = state.editingUserId;
    const user = state.users.find((item) => String(item.id) === String(targetUserId));
    if (!user) {
        setEditStatus('User not found.', true);
        return;
    }

    const nextName = editUserNameInput.value.trim();
    const nextRole = String(editUserRoleInput.value || '').trim().toLowerCase();
    const branchId = String(editUserBranchInput.value || '').trim();
    const password = String(editUserPasswordInput.value || '').trim();
    const accountStatus = normalizeUserAccountStatusValue(editUserStatusInput.value) || 'active';
    const isActive = accountStatus === 'active';
    const featureAccess = readFeatureAccessFromInputs(editFeatureInputs, state.editingFeatureAccess);

    if (!nextName) {
        setEditStatus('Display name is required.', true);
        return;
    }
    if (!['employee', 'staff', 'company_admin'].includes(nextRole)) {
        setEditStatus('Role must be employee, staff, or company_admin.', true);
        return;
    }
    if (!branchId) {
        setEditStatus('Branch is required.', true);
        return;
    }
    if (password && password.length < 8) {
        setEditStatus('Password must be at least 8 characters.', true);
        return;
    }

    saveEditUserBtn.disabled = true;
    setEditStatus('Saving user...', false);
    try {
        const updatePayload = {
            name: nextName,
            role: nextRole,
            password: password || '',
            branch_id: branchId,
            is_active: isActive,
            account_status: accountStatus,
            feature_access: featureAccess
        };
        await appClient.updateUser(targetUserId, updatePayload);
        await refreshData();
        closeEditModal();
        setStatus('User updated.', false);
    } catch (error) {
        console.error('Failed to update user:', error);
        setEditStatus(error.message || 'Failed to update user.', true);
    } finally {
        saveEditUserBtn.disabled = false;
    }
}

async function toggleUser(user) {
    const nextActive = getUserAccountStatus(user) !== 'active';
    setStatus(nextActive ? 'Reactivating user...' : 'Suspending user...');
    try {
        await appClient.updateUser(user.id, {
            is_active: nextActive,
            account_status: nextActive ? 'active' : 'suspended'
        });
        await refreshData();
        setStatus(nextActive ? 'User reactivated.' : 'User suspended.');
    } catch (error) {
        console.error('Failed to toggle user:', error);
        if (error.code === 'LIMIT_USERS_REACHED') {
            setStatus('User limit reached. Upgrade your plan to reactivate this user.', true);
            return;
        }
        setStatus(error.message || 'Failed to update user.', true);
    }
}

async function deleteUser(user) {
    const confirmed = window.confirm(`Delete user "${user.id}"?`);
    if (!confirmed) {
        return;
    }

    setStatus('Deleting user...');
    try {
        await appClient.deleteUser(user.id);
        await refreshData();
        setStatus('User deleted.');
    } catch (error) {
        console.error('Failed to delete user:', error);
        setStatus(error.message || 'Failed to delete user.', true);
    }
}

function normalizeFeatureAccess(value = {}) {
    const defaults = getFeatureDefaults();
    const source = (value && typeof value === 'object' && !Array.isArray(value))
        ? value
        : {};

    return FEATURE_CONFIG.reduce((access, feature) => {
        if (!isFeatureAvailable(feature.key)) {
            access[feature.key] = false;
            return access;
        }
        access[feature.key] = Object.prototype.hasOwnProperty.call(source, feature.key)
            ? Boolean(source[feature.key])
            : Boolean(defaults[feature.key]);
        return access;
    }, {});
}

function applyFeatureAccessToInputs(featureAccess, inputs) {
    const normalized = normalizeFeatureAccess(featureAccess);
    inputs.forEach((input) => {
        const key = String(input.dataset.featureKey || '').trim();
        input.checked = isFeatureAvailable(key) && Boolean(normalized[key]);
    });
}

function readFeatureAccessFromInputs(inputs, fallbackAccess = getFeatureDefaults()) {
    const access = normalizeFeatureAccess(fallbackAccess);
    inputs.forEach((input) => {
        const key = String(input.dataset.featureKey || '').trim();
        if (!Object.prototype.hasOwnProperty.call(access, key)) {
            return;
        }
        access[key] = isFeatureAvailable(key) && Boolean(input.checked);
    });
    return access;
}

function normalizeCompanyCode(value = '') {
    return String(value || '').trim().toLowerCase();
}

function isGmsOrGwdCompanyCode(value = '') {
    const companyCode = normalizeCompanyCode(value);
    return companyCode === 'default'
        || companyCode === 'gms'
        || companyCode === 'gms-erp'
        || companyCode === 'gmserp'
        || companyCode === 'gwd'
        || companyCode === 'gwd-erp'
        || companyCode === 'gwderp';
}

function resolveFeatureAvailability() {
    const policy = state.bootstrap?.userFeaturePolicy;
    if (policy && typeof policy === 'object' && !Array.isArray(policy)) {
        return FEATURE_CONFIG.reduce((availability, feature) => {
            availability[feature.key] = Boolean(policy[feature.key]);
            return availability;
        }, {});
    }

    const modules = state.bootstrap?.modules || {};
    const companyCode = normalizeCompanyCode(
        state.bootstrap?.company?.company_code
        || state.bootstrap?.user?.company_code
        || ''
    );
    return FEATURE_CONFIG.reduce((availability, feature) => {
        const requiredModules = Array.isArray(feature.requiredModules) ? feature.requiredModules : [];
        const moduleAllowed = requiredModules.every((moduleKey) => Boolean(modules[moduleKey]));
        const companyAllowed = feature.gmsOrGwdOnly ? isGmsOrGwdCompanyCode(companyCode) : true;
        availability[feature.key] = Boolean(moduleAllowed && companyAllowed);
        return availability;
    }, {});
}

function isFeatureAvailable(featureKey = '') {
    const key = String(featureKey || '').trim();
    if (!key) {
        return false;
    }
    return Object.prototype.hasOwnProperty.call(state.allowedFeatureAccess, key)
        ? Boolean(state.allowedFeatureAccess[key])
        : false;
}

function getFeatureDefaults() {
    return FEATURE_CONFIG.reduce((defaults, feature) => {
        defaults[feature.key] = isFeatureAvailable(feature.key)
            ? Boolean(feature.defaultEnabled !== false)
            : false;
        return defaults;
    }, {});
}

function applyFeatureInputAvailability(inputs) {
    inputs.forEach((input) => {
        const key = String(input.dataset.featureKey || '').trim();
        const available = isFeatureAvailable(key);
        input.disabled = !available;
        if (!available) {
            input.checked = false;
        }
        const label = input.closest('label');
        if (label) {
            label.style.display = available ? '' : 'none';
        }
    });
}

function applyFeatureAvailabilityHint(container, inputs) {
    if (!container) {
        return;
    }

    const hasVisibleInput = inputs.some((input) => {
        const key = String(input.dataset.featureKey || '').trim();
        return isFeatureAvailable(key);
    });
    const existingNote = container.querySelector('.feature-empty-note');

    if (hasVisibleInput) {
        if (existingNote) {
            existingNote.remove();
        }
        return;
    }

    if (existingNote) {
        return;
    }

    const note = document.createElement('div');
    note.className = 'feature-empty-note';
    note.textContent = 'No assignable features are available for this company.';
    container.appendChild(note);
}

function setStatus(message, isError = false) {
    statusEl.textContent = message || '';
    statusEl.style.color = isError ? '#b91c1c' : '#1f2937';
}

function setEditStatus(message, isError = false) {
    if (!editStatusEl) {
        return;
    }
    editStatusEl.textContent = message || '';
    editStatusEl.style.color = isError ? '#b91c1c' : '#1f2937';
}

async function loadSignupRequests() {
    if (!pendingSignupList || !pendingSignupEmpty) {
        return;
    }

    pendingSignupList.innerHTML = '';
    pendingSignupEmpty.textContent = 'Loading signup requests...';
    pendingSignupEmpty.style.display = 'block';

    try {
        const requests = await appClient.listSignupRequests({ status: 'open', limit: 200 });
        renderSignupRequests(Array.isArray(requests) ? requests : []);
    } catch (error) {
        console.error('Failed to load signup requests:', error);
        pendingSignupEmpty.textContent = error?.message || 'Unable to load signup requests.';
        pendingSignupEmpty.style.display = 'block';
        if (pendingSignupCount) {
            pendingSignupCount.textContent = '0';
        }
    }
}

function renderSignupRequests(requests) {
    if (!pendingSignupList || !pendingSignupEmpty) {
        return;
    }

    pendingSignupList.innerHTML = '';
    const total = requests.length;
    if (pendingSignupCount) {
        pendingSignupCount.textContent = String(total);
    }

    if (!total) {
        pendingSignupEmpty.textContent = 'No pending signup requests.';
        pendingSignupEmpty.style.display = 'block';
        return;
    }

    pendingSignupEmpty.style.display = 'none';
    requests.forEach((request) => {
        pendingSignupList.appendChild(buildSignupCard(request));
    });
}

function buildSignupCard(request) {
    const meta = request?.requestMeta || {};
    const requestCode = String(request?.requestCode || '').trim();
    const nameValue = String(meta.name || request?.clientName || '').trim();
    const emailValue = String(meta.email || '').trim();
    const desiredIdValue = String(meta.desiredId || meta.userId || meta.employeeId || '').trim();
    const roleValue = String(meta.role || 'employee').trim().toLowerCase();
    const contactValue = String(request?.contactNumber || '').trim();
    const detailsValue = String(request?.requestDetails || '').trim();

    const card = document.createElement('div');
    card.className = 'pending-card';

    const header = document.createElement('div');
    header.className = 'pending-header';

    const title = document.createElement('div');
    title.className = 'pending-title';
    title.textContent = nameValue || 'Signup Request';

    const code = document.createElement('span');
    code.className = 'pending-count';
    code.textContent = requestCode || 'REQ';

    header.appendChild(title);
    header.appendChild(code);

    const metaBlock = document.createElement('div');
    metaBlock.className = 'pending-meta';
    metaBlock.textContent = [
        `Submitted: ${formatDateTime(request?.createdAt)}`,
        contactValue ? `Contact: ${contactValue}` : null,
        detailsValue ? `Notes: ${detailsValue}` : null
    ].filter(Boolean).join(' | ');

    const grid = document.createElement('div');
    grid.className = 'pending-grid';

    const nameField = buildPendingField('Full Name', buildInput('text', 'Full name', nameValue));
    const idField = buildPendingField('User ID', buildInput('text', 'EMP-...', desiredIdValue));
    const emailField = buildPendingField('Email', buildInput('email', 'name@company.com', emailValue));
    const roleField = buildPendingField('Role', buildRoleSelect(roleValue));
    const passwordField = buildPendingField('Temp Password', buildInput('password', 'At least 8 chars', ''));

    grid.appendChild(nameField);
    grid.appendChild(idField);
    grid.appendChild(emailField);
    grid.appendChild(roleField);
    grid.appendChild(passwordField);

    const reasonField = buildPendingField('Rejection Reason (optional)', buildTextarea('Why is it rejected?'));

    const actions = document.createElement('div');
    actions.className = 'pending-actions';
    const approveBtn = document.createElement('button');
    approveBtn.className = 'pending-btn pending-approve';
    approveBtn.type = 'button';
    approveBtn.textContent = 'Approve';
    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'pending-btn pending-reject';
    rejectBtn.type = 'button';
    rejectBtn.textContent = 'Reject';
    actions.appendChild(approveBtn);
    actions.appendChild(rejectBtn);

    const status = document.createElement('div');
    status.className = 'pending-status';

    card.appendChild(header);
    card.appendChild(metaBlock);
    card.appendChild(grid);
    card.appendChild(reasonField);
    card.appendChild(actions);
    card.appendChild(status);

    approveBtn.addEventListener('click', async () => {
        const payload = {
            userId: idField.querySelector('input')?.value.trim(),
            name: nameField.querySelector('input')?.value.trim(),
            email: emailField.querySelector('input')?.value.trim(),
            role: roleField.querySelector('select')?.value || 'employee',
            password: passwordField.querySelector('input')?.value || ''
        };

        if (!payload.userId || !payload.name) {
            setPendingStatus(status, 'Name and User ID are required.', true);
            return;
        }

        if (!payload.password || payload.password.length < 8) {
            setPendingStatus(status, 'Password must be at least 8 characters.', true);
            return;
        }

        if (payload.email && !isValidEmail(payload.email)) {
            setPendingStatus(status, 'Please provide a valid email address.', true);
            return;
        }

        setPendingBusy(card, true);
        setPendingStatus(status, 'Approving signup request...', false);

        try {
            await appClient.approveSignupRequest(requestCode, payload);
            setStatus(`Signup approved for ${payload.name}.`, false);
            await Promise.all([loadSignupRequests(), refreshData()]);
        } catch (error) {
            console.error('Approve signup failed:', error);
            setPendingStatus(status, error?.message || 'Unable to approve signup.', true);
        } finally {
            setPendingBusy(card, false);
        }
    });

    rejectBtn.addEventListener('click', async () => {
        const reason = reasonField.querySelector('textarea')?.value.trim() || '';
        setPendingBusy(card, true);
        setPendingStatus(status, 'Rejecting signup request...', false);

        try {
            await appClient.rejectSignupRequest(requestCode, { reason });
            setStatus(`Signup request ${requestCode} rejected.`, false);
            await loadSignupRequests();
        } catch (error) {
            console.error('Reject signup failed:', error);
            setPendingStatus(status, error?.message || 'Unable to reject signup.', true);
        } finally {
            setPendingBusy(card, false);
        }
    });

    return card;
}

function buildPendingField(labelText, fieldEl) {
    const wrapper = document.createElement('div');
    wrapper.className = 'pending-field';
    const label = document.createElement('label');
    label.textContent = labelText;
    wrapper.appendChild(label);
    wrapper.appendChild(fieldEl);
    return wrapper;
}

function buildInput(type, placeholder, value) {
    const input = document.createElement('input');
    input.type = type;
    input.placeholder = placeholder || '';
    if (value) {
        input.value = value;
    }
    return input;
}

function buildTextarea(placeholder) {
    const textarea = document.createElement('textarea');
    textarea.placeholder = placeholder || '';
    return textarea;
}

function buildRoleSelect(selected) {
    const select = document.createElement('select');
    const roles = [
        { value: 'employee', label: 'Employee' },
        { value: 'staff', label: 'Staff' }
    ];

    roles.forEach((role) => {
        const option = document.createElement('option');
        option.value = role.value;
        option.textContent = role.label;
        if (role.value === selected) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    return select;
}

function setPendingStatus(element, message, isError) {
    if (!element) {
        return;
    }
    element.textContent = message || '';
    element.classList.toggle('is-error', Boolean(isError));
}

function setPendingBusy(card, busy) {
    if (!card) {
        return;
    }
    card.querySelectorAll('input, textarea, select, button').forEach((el) => {
        el.disabled = Boolean(busy);
    });
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function formatDateTime(value) {
    if (!value) {
        return '-';
    }

    const parsed = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(parsed.getTime())) {
        return String(value);
    }

    return parsed.toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}
