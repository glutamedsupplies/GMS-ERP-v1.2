const appClient = window.appClient;

const branchNameInput = document.getElementById('branchName');
const branchAddressInput = document.getElementById('branchAddress');
const addBranchBtn = document.getElementById('addBranchBtn');
const limitText = document.getElementById('limitText');
const statusEl = document.getElementById('status');
const tableBody = document.getElementById('branchTableBody');

const state = {
    branches: [],
    bootstrap: null
};

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    addBranchBtn.addEventListener('click', createBranch);
    await refreshData();
}

async function refreshData() {
    setStatus('Loading...', false);
    try {
        const [bootstrap, branches] = await Promise.all([
            appClient.getBootstrap(),
            appClient.listBranches()
        ]);
        state.bootstrap = bootstrap;
        state.branches = branches || [];
        renderLimits();
        renderRows();
        setStatus('');
    } catch (error) {
        console.error('Failed to load branches:', error);
        setStatus(error.message || 'Failed to load branches.', true);
    }
}

function renderLimits() {
    const limits = state.bootstrap?.limits?.branches || { current: 0, max: 0 };
    limitText.textContent = `Active branches: ${Number(limits.current || 0)} / ${Number(limits.max || 0)}`;
}

function renderRows() {
    if (!state.branches.length) {
        tableBody.innerHTML = '<tr><td class="empty-row" colspan="4">No branches found.</td></tr>';
        return;
    }

    tableBody.innerHTML = state.branches.map((branch) => {
        const isActive = Boolean(branch.is_active);
        return `
            <tr>
              <td>${appClient.escapeHtml(branch.branch_name || '')}</td>
              <td>${appClient.escapeHtml(branch.address || '')}</td>
              <td><span class="pill ${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span></td>
              <td>
                <div class="actions">
                  <button class="edit" type="button" data-action="edit" data-id="${appClient.escapeHtml(branch.id)}">Edit</button>
                  <button class="toggle" type="button" data-action="toggle" data-id="${appClient.escapeHtml(branch.id)}">${isActive ? 'Deactivate' : 'Activate'}</button>
                  <button class="delete" type="button" data-action="delete" data-id="${appClient.escapeHtml(branch.id)}">Delete</button>
                </div>
              </td>
            </tr>
        `;
    }).join('');

    Array.from(tableBody.querySelectorAll('button[data-action]')).forEach((button) => {
        button.addEventListener('click', () => handleRowAction(button.dataset.action, button.dataset.id));
    });
}

async function createBranch() {
    const branchName = branchNameInput.value.trim();
    const address = branchAddressInput.value.trim();
    if (!branchName) {
        setStatus('Branch name is required.', true);
        return;
    }

    addBranchBtn.disabled = true;
    setStatus('Creating branch...');
    try {
        await appClient.createBranch({
            branch_name: branchName,
            address
        });
        branchNameInput.value = '';
        branchAddressInput.value = '';
        await refreshData();
        setStatus('Branch created.');
    } catch (error) {
        console.error('Failed to create branch:', error);
        if (error.code === 'LIMIT_BRANCHES_REACHED') {
            setStatus('Branch limit reached. Upgrade your plan to add more branches.', true);
            return;
        }
        setStatus(error.message || 'Failed to create branch.', true);
    } finally {
        addBranchBtn.disabled = false;
    }
}

async function handleRowAction(action, branchId) {
    const branch = state.branches.find((item) => String(item.id) === String(branchId));
    if (!branch) {
        return;
    }

    if (action === 'edit') {
        await editBranch(branch);
        return;
    }

    if (action === 'toggle') {
        await toggleBranch(branch);
        return;
    }

    if (action === 'delete') {
        await deleteBranch(branch);
    }
}

async function editBranch(branch) {
    const nextName = window.prompt('Branch name:', branch.branch_name || '');
    if (nextName === null) {
        return;
    }

    const nextAddress = window.prompt('Branch address:', branch.address || '');
    if (nextAddress === null) {
        return;
    }

    setStatus('Saving branch...');
    try {
        await appClient.updateBranch(branch.id, {
            branch_name: nextName.trim(),
            address: nextAddress.trim(),
            is_active: Boolean(branch.is_active)
        });
        await refreshData();
        setStatus('Branch updated.');
    } catch (error) {
        console.error('Failed to edit branch:', error);
        setStatus(error.message || 'Failed to update branch.', true);
    }
}

async function toggleBranch(branch) {
    const nextActive = !Boolean(branch.is_active);
    setStatus(nextActive ? 'Activating branch...' : 'Deactivating branch...');
    try {
        await appClient.updateBranch(branch.id, {
            branch_name: branch.branch_name,
            address: branch.address || '',
            is_active: nextActive
        });
        await refreshData();
        setStatus(nextActive ? 'Branch activated.' : 'Branch deactivated.');
    } catch (error) {
        console.error('Failed to toggle branch:', error);
        if (error.code === 'LIMIT_BRANCHES_REACHED') {
            setStatus('Branch limit reached. Upgrade your plan to reactivate this branch.', true);
            return;
        }
        setStatus(error.message || 'Failed to update branch.', true);
    }
}

async function deleteBranch(branch) {
    const confirmed = window.confirm(`Delete branch "${branch.branch_name || 'this branch'}"? This action cannot be undone.`);
    if (!confirmed) {
        return;
    }

    setStatus('Deleting branch...');
    try {
        await appClient.deleteBranch(branch.id);
        await refreshData();
        setStatus('Branch deleted.');
    } catch (error) {
        console.error('Failed to delete branch:', error);
        setStatus(error.message || 'Failed to delete branch.', true);
    }
}

function setStatus(message, isError = false) {
    statusEl.textContent = message || '';
    statusEl.style.color = isError ? '#b91c1c' : '#1f2937';
}
