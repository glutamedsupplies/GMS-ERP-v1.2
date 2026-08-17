const appClient = window.appClient;

const FEATURE_CONFIG = Object.freeze([
    { key: 'expenses', label: 'Expenses', defaultEnabled: true, requiredModules: ['sales'] },
    { key: 'order_form', label: 'Order Form', defaultEnabled: true, requiredModules: ['invoicing'] },
    { key: 'inventory', label: 'Inventory', defaultEnabled: true, requiredModules: ['inventory'] },
    { key: 'composite', label: 'Composite', defaultEnabled: true, requiredModules: ['inventory'] },
    { key: 'lbc_tracking', label: 'LBC Tracking', defaultEnabled: false, requiredModules: ['sales'], gmsOrGwdOnly: true }
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
    bootstrap: null,
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
        if (event.key === 'Escape' && editModal?.classList.contains('open')) {
            closeEditModal();
        }
    });

    applyFeatureAccessToInputs(getFeatureDefaults(), createFeatureInputs);
    await refreshData();
    await loadSignupRequests();
}

async function refreshData() {
    setStatus('Loading...', false);
    try {
        const role = roleFilter.value;
        const [bootstrap, users, branches] = await Promise.all([
            appClient.getBootstrap(),
            appClient.listUsers({ role, filter: '' }),
            appClient.listBranches()
        ]);
        state.bootstrap = bootstrap;
        state.allowedFeatureAccess = resolveFeatureAvailability();
        state.users = users || [];
        state.branches = (branches || []).filter((branch) => Boolean(branch.is_active));
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
        tableBody.innerHTML = '<tr><td class="empty-row" colspan="7">No users found.</td></tr>';
        return;
    }

    tableBody.innerHTML = rows.map((user) => {
        const accountStatus = getUserAccountStatus(user);
        const isActive = accountStatus === 'active';
        const safeId = appClient.escapeHtml(user.id || '');
        return `
            <tr>
              <td>${safeId}</td>
              <td>${appClient.escapeHtml(user.name || '')}</td>
              <td>${appClient.escapeHtml(user.role || '')}</td>
              <td>${appClient.escapeHtml(user.branch_name || '')}</td>
              <td>${renderFeaturePills(user.feature_access)}</td>
              <td><span class="pill ${accountStatus}">${getUserStatusLabel(accountStatus)}</span></td>
              <td>
                <div class="actions">
                  <button class="edit" type="button" data-action="edit" data-id="${safeId}">Edit</button>
                  <button class="toggle" type="button" data-action="toggle" data-id="${safeId}">${isActive ? 'Suspend' : 'Reactivate'}</button>
                  <button class="delete" type="button" data-action="delete" data-id="${safeId}">Delete</button>
                </div>
              </td>
            </tr>
        `;
    }).join('');

    Array.from(tableBody.querySelectorAll('button[data-action]')).forEach((button) => {
        button.addEventListener('click', () => handleRowAction(button.dataset.action, button.dataset.id));
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
        await appClient.updateUser(targetUserId, {
            name: nextName,
            role: nextRole,
            password: password || '',
            branch_id: branchId,
            is_active: isActive,
            account_status: accountStatus,
            feature_access: featureAccess
        });
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
