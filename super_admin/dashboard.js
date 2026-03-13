const appClient = window.appClient;

const statusEl = document.getElementById('status');
const customerChatBtn = document.getElementById('customerChatBtn');
const refreshBtn = document.getElementById('refreshBtn');
const logoutBtn = document.getElementById('logoutBtn');
const metricCompanies = document.getElementById('metricCompanies');
const metricPlans = document.getElementById('metricPlans');
const metricUsers = document.getElementById('metricUsers');
const metricWhiteLabel = document.getElementById('metricWhiteLabel');

const companyPlan = document.getElementById('companyPlan');
const createCompanyBtn = document.getElementById('createCompanyBtn');
const companyName = document.getElementById('companyName');
const companyCode = document.getElementById('companyCode');
const companySubdomain = document.getElementById('companySubdomain');
const companyCustomDomain = document.getElementById('companyCustomDomain');
const companyAppName = document.getElementById('companyAppName');
const companyPrimaryColor = document.getElementById('companyPrimaryColor');
const companyPrimaryColorPicker = document.getElementById('companyPrimaryColorPicker');
const companyLogoFile = document.getElementById('companyLogoFile');
const companyLogoPreview = document.getElementById('companyLogoPreview');
const companyLogoMeta = document.getElementById('companyLogoMeta');
const companyWhiteLabel = document.getElementById('companyWhiteLabel');
const adminUsername = document.getElementById('adminUsername');
const adminPassword = document.getElementById('adminPassword');
const companyAddons = document.getElementById('companyAddons');

const createPlanBtn = document.getElementById('createPlanBtn');
const planId = document.getElementById('planId');
const planName = document.getElementById('planName');
const planPrice = document.getElementById('planPrice');
const planBranches = document.getElementById('planBranches');
const planUsers = document.getElementById('planUsers');
const planInvoices = document.getElementById('planInvoices');
const planAiQuota = document.getElementById('planAiQuota');
const mAttendance = document.getElementById('mAttendance');
const mSales = document.getElementById('mSales');
const mInventory = document.getElementById('mInventory');
const mInvoicing = document.getElementById('mInvoicing');
const mReports = document.getElementById('mReports');
const mAi = document.getElementById('mAi');

const companyFilter = document.getElementById('companyFilter');
const companySummary = document.getElementById('companySummary');
const companiesList = document.getElementById('companiesList');
const plansList = document.getElementById('plansList');
const auditList = document.getElementById('auditList');
const accessFilter = document.getElementById('accessFilter');
const accessSummary = document.getElementById('accessSummary');
const accessList = document.getElementById('accessList');
const blockedFilter = document.getElementById('blockedFilter');
const blockedSummary = document.getElementById('blockedSummary');
const blockedList = document.getElementById('blockedList');
const planEditModal = document.getElementById('planEditModal');
const planEditCloseBtn = document.getElementById('planEditCloseBtn');
const planEditCancelBtn = document.getElementById('planEditCancelBtn');
const planEditSaveBtn = document.getElementById('planEditSaveBtn');
const editPlanId = document.getElementById('editPlanId');
const editPlanName = document.getElementById('editPlanName');
const editPlanPrice = document.getElementById('editPlanPrice');
const editPlanBranches = document.getElementById('editPlanBranches');
const editPlanUsers = document.getElementById('editPlanUsers');
const editPlanInvoices = document.getElementById('editPlanInvoices');
const editPlanAiQuota = document.getElementById('editPlanAiQuota');
const editMAttendance = document.getElementById('editMAttendance');
const editMSales = document.getElementById('editMSales');
const editMInventory = document.getElementById('editMInventory');
const editMInvoicing = document.getElementById('editMInvoicing');
const editMReports = document.getElementById('editMReports');
const editMAi = document.getElementById('editMAi');

const DEFAULT_LOGO_PATH = '/logo.png';
const DEFAULT_PRIMARY_COLOR = '#2575fc';
const COMPANY_STATUS_OPTIONS = ['active', 'inactive', 'suspended'];
const MAX_LOGO_BYTES = 700 * 1024;
const MAX_LOGO_DIMENSION = 900;

const state = {
    bootstrap: null,
    companies: [],
    plans: [],
    logs: [],
    accessLogs: [],
    blockedDevices: [],
    editingPlanOriginalId: ''
};
let pendingCompanyLogoPath = '';

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'super_admin' });
    if (!session) {
        return;
    }

    refreshBtn.addEventListener('click', loadData);
    if (customerChatBtn) {
        customerChatBtn.addEventListener('click', () => {
            window.location.replace('/super_admin/customer_requests.html');
        });
    }
    logoutBtn.addEventListener('click', async () => {
        await appClient.clearSession();
        appClient.redirectToLogin?.();
    });
    createCompanyBtn.addEventListener('click', createCompany);
    createPlanBtn.addEventListener('click', createPlan);
    companiesList.addEventListener('click', handleCompanyAction);
    plansList.addEventListener('click', handlePlanAction);
    if (companyPrimaryColorPicker && companyPrimaryColor) {
        companyPrimaryColorPicker.addEventListener('input', onCreatePrimaryColorPickerInput);
        companyPrimaryColor.addEventListener('input', onCreatePrimaryColorHexInput);
        companyPrimaryColor.addEventListener('blur', onCreatePrimaryColorHexBlur);
    }
    if (companyLogoFile) {
        companyLogoFile.addEventListener('change', onCreateCompanyLogoFileChange);
    }
    planEditCloseBtn.addEventListener('click', closePlanEditModal);
    planEditCancelBtn.addEventListener('click', closePlanEditModal);
    planEditSaveBtn.addEventListener('click', savePlanEdit);
    planEditModal.addEventListener('click', (event) => {
        if (event.target === planEditModal) {
            closePlanEditModal();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && isPlanEditModalOpen()) {
            closePlanEditModal();
        }
    });
    if (companyFilter) {
        companyFilter.addEventListener('input', renderCompanies);
    }
    if (accessFilter) {
        accessFilter.addEventListener('input', renderAccessLogs);
    }
    if (blockedFilter) {
        blockedFilter.addEventListener('input', renderBlockedDevices);
    }
    if (accessList) {
        accessList.addEventListener('click', handleAccessAction);
    }
    if (blockedList) {
        blockedList.addEventListener('click', handleBlockedAction);
    }

    resetCreateCompanyBrandingInputs();
    await loadData();
}

async function loadData() {
    setStatus('Loading...');
    try {
        const [bootstrap, companies, plans, logs, accessLogs, blockedDevices] = await Promise.all([
            appClient.getSuperBootstrap(),
            appClient.listSuperCompanies(),
            appClient.listSuperPlans(),
            appClient.listSuperAuditLogs({ limit: 200 }),
            appClient.listSuperAccessLogs({ limit: 200 }),
            appClient.listSuperBlockedDevices({ limit: 200 })
        ]);

        state.bootstrap = bootstrap || {};
        state.companies = companies || [];
        state.plans = plans || [];
        state.logs = logs || [];
        state.accessLogs = accessLogs || [];
        state.blockedDevices = blockedDevices || [];

        renderOverviewStats();
        renderPlans();
        renderCompanies();
        renderLogs();
        renderAccessLogs();
        renderBlockedDevices();
        populatePlanSelect();

        const stats = state.bootstrap?.stats || {};
        setStatus(`Loaded ${state.companies.length} companies, ${state.plans.length} plans, ${Number(stats.users || 0)} users.`);
    } catch (error) {
        console.error('Failed to load super admin data:', error);
        setStatus(error.message || 'Failed to load data.', true);
    }
}

function renderOverviewStats() {
    const stats = state.bootstrap?.stats || {};
    const whiteLabelCount = state.companies.filter((company) => Boolean(company?.addons?.white_label?.is_active)).length;

    if (metricCompanies) {
        metricCompanies.textContent = String(state.companies.length);
    }
    if (metricPlans) {
        metricPlans.textContent = String(state.plans.length);
    }
    if (metricUsers) {
        metricUsers.textContent = String(Number(stats.users || 0));
    }
    if (metricWhiteLabel) {
        metricWhiteLabel.textContent = String(whiteLabelCount);
    }
}

function populatePlanSelect() {
    companyPlan.innerHTML = '';
    state.plans.forEach((plan) => {
        const option = document.createElement('option');
        option.value = plan.id;
        option.textContent = `${plan.name} (${plan.id})`;
        companyPlan.appendChild(option);
    });
}

function renderPlans() {
    if (!state.plans.length) {
        plansList.innerHTML = '<div class="row">No plans found.</div>';
        return;
    }

    plansList.innerHTML = state.plans.map((plan) => `
        <div class="row" data-plan-id="${escape(plan.id)}">
            <div class="row-head">
                <div class="plan-meta">
                    <div class="plan-title">
                        <strong>${escape(plan.name)}</strong>
                        <span class="inline-chip">${escape(plan.id)}</span>
                    </div>
                    <span class="muted">Price: ${Number(plan.price_monthly || 0)} | Branches: ${Number(plan.max_branches || 0)} | Users: ${Number(plan.max_users || 0)} | Invoices: ${Number(plan.max_invoices_monthly || 0)} | AI quota: ${Number(plan.ai_monthly_quota || 0)}</span>
                </div>
                <div class="plan-actions">
                    <button type="button" data-action="edit-plan" class="btn-soft">Edit</button>
                    <button type="button" data-action="delete-plan" class="btn-danger">Delete</button>
                </div>
            </div>
            <div class="chip-row">${buildPlanModuleChips(plan)}</div>
        </div>
    `).join('');
}

function renderCompanies() {
    const total = state.companies.length;
    if (!total) {
        companiesList.innerHTML = '<div class="row">No companies found.</div>';
        if (companySummary) {
            companySummary.textContent = '0 / 0';
        }
        return;
    }

    const query = normalizeSearchText(companyFilter?.value || '');
    const filteredCompanies = query
        ? state.companies.filter((company) => {
            const haystack = [
                company.name,
                company.company_code,
                company.subdomain,
                company.custom_domain,
                company.app_name,
                company.logo_path,
                company.admin_credentials?.username
            ].map((value) => normalizeSearchText(value)).join(' ');
            return haystack.includes(query);
        })
        : state.companies.slice();

    if (companySummary) {
        companySummary.textContent = `${filteredCompanies.length} / ${total}`;
    }

    if (!filteredCompanies.length) {
        companiesList.innerHTML = '<div class="row">No companies matched your search.</div>';
        return;
    }

    companiesList.innerHTML = filteredCompanies.map((company) => {
        const addons = company.addons || {};
        const aiAddon = addons.ai_reader || {};
        const whiteLabelAddon = addons.white_label || {};
        const customDomainAddon = addons.custom_domain || {};
        const usage = company.usage || {};
        const limits = company.limits || {};
        const rawLogoPath = String(company.logo_path || '').trim();
        const previewLogoPath = rawLogoPath || String(company.branding?.logoPath || '/logo.png').trim() || '/logo.png';
        const appName = String(company.app_name || '').trim();
        const primaryColor = String(company.primary_color || '').trim() || DEFAULT_PRIMARY_COLOR;
        const previewTheme = appClient.buildBrandTheme(primaryColor);
        const currentStatus = normalizeSearchText(company.status || 'active') || 'active';
        const statusOptions = COMPANY_STATUS_OPTIONS.includes(currentStatus)
            ? COMPANY_STATUS_OPTIONS
            : COMPANY_STATUS_OPTIONS.concat(currentStatus);
        const statusOptionsHtml = statusOptions.map((statusValue) => `
            <option value="${escape(statusValue)}" ${statusValue === currentStatus ? 'selected' : ''}>${escape(statusValue)}</option>
        `).join('');
        const optionsHtml = state.plans.map((plan) => `
            <option value="${escape(plan.id)}" ${plan.id === company.plan_id ? 'selected' : ''}>
              ${escape(plan.name)} (${escape(plan.id)})
            </option>
        `).join('');
        const adminCredentials = company.admin_credentials || {};
        const adminUsernameValue = String(adminCredentials.username || '').trim();
        const adminPasswordValue = String(adminCredentials.password_text || '').trim();
        const hasRecoveryPassword = Boolean(adminPasswordValue);
        const adminPasswordHint = hasRecoveryPassword
            ? 'Saved recovery password is available.'
            : 'No saved recovery password. Use Reset Admin Password.';
        const companyStatusClass = buildStatusPillClass(currentStatus);
        const usageChips = [
            `Users ${Number(company.counts?.users || 0)}/${Number(limits.max_users || 0)}`,
            `Branches ${Number(company.counts?.branches || 0)}/${Number(limits.max_branches || 0)}`,
            `Invoices ${Number(usage.invoices_count || 0)}/${Number(limits.max_invoices_monthly || 0)}`
        ].map((label) => `<span class="inline-chip">${escape(label)}</span>`).join('');
        const addonChips = [
            whiteLabelAddon.is_active ? 'White Label' : 'Parent Brand',
            customDomainAddon.is_active ? 'Custom Domain' : '',
            aiAddon.is_active ? 'AI Reader' : ''
        ].filter(Boolean).map((label) => `<span class="inline-chip">${escape(label)}</span>`).join('');

        return `
            <div class="row" data-company-id="${escape(company.id)}">
                <div class="company-header">
                    <div class="company-meta">
                        <div class="company-title-row">
                            <strong>${escape(company.name)}</strong>
                            <span class="${companyStatusClass}">${escape(company.status || 'active')}</span>
                            <span class="color-dot" style="background:${escape(primaryColor)};"></span>
                        </div>
                        <span class="muted">Code: ${escape(company.company_code)} | App: ${escape(appName || 'GMS ERP')}</span>
                        <div class="chip-row">${usageChips}</div>
                        <div class="chip-row">${addonChips}</div>
                    </div>
                    <div class="company-preview" style="background: linear-gradient(145deg, ${escape(previewTheme.primarySoftest)}, #ffffff); box-shadow: 0 0 0 1px ${escape(primaryColor)} inset;">
                        <img src="${escape(previewLogoPath)}" alt="Company logo preview">
                    </div>
                </div>

                <div class="company-edit-grid">
                    <div><label>Company Name</label><input data-role="edit-name" type="text" value="${escape(company.name || '')}"></div>
                    <div><label>Company Code</label><input data-role="edit-code" type="text" value="${escape(company.company_code || '')}"></div>
                    <div><label>Subdomain</label><input data-role="edit-subdomain" type="text" value="${escape(company.subdomain || '')}"></div>
                    <div><label>Custom Domain</label><input data-role="edit-custom-domain" type="text" value="${escape(company.custom_domain || '')}" placeholder="company.example.com"></div>
                    <div><label>App Name (Login Title)</label><input data-role="edit-app-name" type="text" value="${escape(appName)}" placeholder="GMS ERP"></div>
                    <div><label>Primary Color</label><input data-role="edit-primary-color" type="text" value="${escape(primaryColor)}" placeholder="${escape(DEFAULT_PRIMARY_COLOR)}"></div>
                    <div class="span-2"><label>Logo Path / URL</label><input data-role="edit-logo-path" type="text" value="${escape(rawLogoPath)}" placeholder="/assets/company/logo.png or https://..."></div>
                    <div><label>Status</label><select data-role="edit-status">${statusOptionsHtml}</select></div>
                    <div><label>Plan</label><select data-role="planSelect">${optionsHtml}</select></div>
                </div>

                <div class="company-edit-grid" style="margin-top:8px;">
                    <div><label>Admin Username</label><input data-role="admin-username" type="text" value="${escape(adminUsernameValue)}" readonly></div>
                    <div class="span-2">
                        <label>Admin Password (Recovery)</label>
                        <div style="display:flex; gap:8px; align-items:center;">
                            <input data-role="admin-password" type="password" value="${escape(adminPasswordValue)}" readonly placeholder="${escape(hasRecoveryPassword ? '' : 'No saved recovery password')}">
                            <button type="button" data-action="toggle-admin-password" class="btn-soft" ${hasRecoveryPassword ? '' : 'disabled'}>Show</button>
                        </div>
                        <span class="muted">${escape(adminPasswordHint)}</span>
                    </div>
                </div>

                <div class="company-actions">
                  <button type="button" data-action="save-company" class="btn-success">Save Company</button>
                  <button type="button" data-action="save-branding" class="btn-warn">Save + Enable Branding</button>
                  <button type="button" data-action="reset-admin-password" class="btn-soft">Reset Admin Password</button>
                  <button type="button" data-action="set-plan">Set Plan</button>
                  <button type="button" data-action="usage" class="btn-soft">Usage</button>
                  <button type="button" data-action="toggle-addon" data-addon="white_label">${whiteLabelAddon.is_active ? 'Disable' : 'Enable'} White Label</button>
                  <button type="button" data-action="toggle-addon" data-addon="custom_domain">${customDomainAddon.is_active ? 'Disable' : 'Enable'} Custom Domain</button>
                  <button type="button" data-action="toggle-addon" data-addon="ai_reader">${aiAddon.is_active ? 'Disable' : 'Enable'} AI Add-on</button>
                  <button type="button" data-action="delete-company" class="btn-danger">Delete Company</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderLogs() {
    if (!state.logs.length) {
        auditList.innerHTML = '<div class="row">No audit logs yet.</div>';
        return;
    }

    auditList.innerHTML = state.logs.map((log) => `
        <div class="row">
            <strong>${escape(log.action || '')}</strong> | ${escape(log.target_type || '')}:${escape(log.target_id || '')}<br>
            <span class="muted">${escape(log.company_id || 'global')} | ${escape(log.actor_user_id || '-')} | ${escape(log.created_at || '')}</span>
        </div>
    `).join('');
}

function buildPlanModuleChips(plan) {
    const modules = plan?.modules || {};
    const enabledModules = Object.entries(modules)
        .filter(([, isEnabled]) => Boolean(isEnabled))
        .map(([moduleKey]) => formatModuleLabel(moduleKey));

    if (!enabledModules.length) {
        return '<span class="inline-chip">No active modules</span>';
    }

    return enabledModules.map((label) => `<span class="inline-chip">${escape(label)}</span>`).join('');
}

function formatModuleLabel(moduleKey) {
    const labels = {
        attendance: 'Attendance',
        sales: 'Sales',
        inventory: 'Inventory',
        invoicing: 'Invoicing',
        reports: 'Reports',
        ai_reader: 'AI Reader'
    };
    return labels[moduleKey] || String(moduleKey || '').replace(/_/g, ' ');
}

function buildStatusPillClass(statusValue) {
    if (statusValue === 'inactive') {
        return 'status-pill status-pill--inactive';
    }
    if (statusValue === 'suspended') {
        return 'status-pill status-pill--suspended';
    }
    return 'status-pill status-pill--active';
}

async function createCompany() {
    const name = companyName.value.trim();
    const code = companyCode.value.trim();
    const subdomain = companySubdomain.value.trim();
    const customDomain = companyCustomDomain.value.trim();
    const planIdValue = companyPlan.value;
    const appName = companyAppName.value.trim();
    const primaryColor = normalizeHexColor(companyPrimaryColor.value, DEFAULT_PRIMARY_COLOR);
    const logoPath = String(pendingCompanyLogoPath || '').trim();
    const adminUser = adminUsername.value.trim();
    const adminPass = adminPassword.value.trim();
    if (!name || !planIdValue || !adminUser || !adminPass) {
        setStatus('Company name, plan, admin username, and admin password are required.', true);
        return;
    }

    let addons = [];
    const addonsRaw = companyAddons.value.trim();
    if (addonsRaw) {
        try {
            const parsed = JSON.parse(addonsRaw);
            addons = Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
            setStatus('Add-ons JSON is invalid.', true);
            return;
        }
    }

    addons = upsertAddonConfig(addons, {
        addon_key: 'white_label',
        is_active: companyWhiteLabel?.value === 'true'
    });

    createCompanyBtn.disabled = true;
    setStatus('Creating company...');
    try {
        await appClient.createSuperCompany({
            name,
            company_code: code,
            subdomain,
            custom_domain: customDomain,
            plan_id: planIdValue,
            app_name: appName,
            primary_color: primaryColor,
            logo_path: logoPath,
            admin_username: adminUser,
            admin_password: adminPass,
            addons
        });
        resetCreateCompanyForm();
        await loadData();
        setStatus('Company created.');
    } catch (error) {
        console.error('Failed to create company:', error);
        setStatus(error.message || 'Failed to create company.', true);
    } finally {
        createCompanyBtn.disabled = false;
    }
}

function resetCreateCompanyForm() {
    companyName.value = '';
    companyCode.value = '';
    companySubdomain.value = '';
    companyCustomDomain.value = '';
    companyAppName.value = '';
    companyWhiteLabel.value = 'false';
    adminUsername.value = '';
    adminPassword.value = '';
    companyAddons.value = '';
    resetCreateCompanyBrandingInputs();
}

function resetCreateCompanyBrandingInputs() {
    const defaultColor = normalizeHexColor(DEFAULT_PRIMARY_COLOR, DEFAULT_PRIMARY_COLOR);
    if (companyPrimaryColor) {
        companyPrimaryColor.value = defaultColor;
    }
    if (companyPrimaryColorPicker) {
        companyPrimaryColorPicker.value = defaultColor;
    }
    pendingCompanyLogoPath = '';
    if (companyLogoFile) {
        companyLogoFile.value = '';
    }
    if (companyLogoMeta) {
        companyLogoMeta.textContent = 'No logo uploaded yet. Default logo will be used.';
    }
    updateCreateCompanyLogoPreview(DEFAULT_LOGO_PATH);
}

function onCreatePrimaryColorPickerInput() {
    if (!companyPrimaryColorPicker || !companyPrimaryColor) {
        return;
    }
    companyPrimaryColor.value = normalizeHexColor(companyPrimaryColorPicker.value, DEFAULT_PRIMARY_COLOR);
}

function onCreatePrimaryColorHexInput() {
    if (!companyPrimaryColor || !companyPrimaryColorPicker) {
        return;
    }
    const normalized = normalizeHexColor(companyPrimaryColor.value, '');
    if (normalized) {
        companyPrimaryColorPicker.value = normalized;
    }
}

function onCreatePrimaryColorHexBlur() {
    if (!companyPrimaryColor) {
        return;
    }
    const fallbackColor = companyPrimaryColorPicker ? companyPrimaryColorPicker.value : DEFAULT_PRIMARY_COLOR;
    const normalized = normalizeHexColor(companyPrimaryColor.value, fallbackColor);
    companyPrimaryColor.value = normalized;
    if (companyPrimaryColorPicker) {
        companyPrimaryColorPicker.value = normalized;
    }
}

async function onCreateCompanyLogoFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
        return;
    }

    if (!String(file.type || '').startsWith('image/')) {
        setStatus('Please choose a valid image file.', true);
        if (companyLogoFile) {
            companyLogoFile.value = '';
        }
        return;
    }

    setStatus('Preparing logo upload...');
    try {
        const rawDataUrl = await readFileAsDataUrl(file);
        const optimizedDataUrl = await optimizeLogoDataUrl(rawDataUrl, {
            maxBytes: MAX_LOGO_BYTES,
            maxDimension: MAX_LOGO_DIMENSION
        });

        pendingCompanyLogoPath = optimizedDataUrl;
        updateCreateCompanyLogoPreview(pendingCompanyLogoPath);
        if (companyLogoMeta) {
            companyLogoMeta.textContent = `Logo selected: ${file.name} (${formatBytes(file.size)}).`;
        }
        setStatus('Logo uploaded. Ready to create company.');
    } catch (error) {
        console.error('Failed to process company logo upload:', error);
        setStatus(error.message || 'Failed to process logo file.', true);
    } finally {
        if (companyLogoFile) {
            companyLogoFile.value = '';
        }
    }
}

function updateCreateCompanyLogoPreview(source) {
    if (!(companyLogoPreview instanceof HTMLImageElement)) {
        return;
    }
    const nextSource = String(source || '').trim() || DEFAULT_LOGO_PATH;
    companyLogoPreview.onerror = () => {
        companyLogoPreview.onerror = null;
        companyLogoPreview.src = DEFAULT_LOGO_PATH;
    };
    companyLogoPreview.src = nextSource;
}

function upsertAddonConfig(addons, addon) {
    const list = Array.isArray(addons) ? addons.slice() : [];
    const key = String(addon?.addon_key || '').trim().toLowerCase();
    if (!key) {
        return list;
    }

    const index = list.findIndex((entry) => String(entry?.addon_key || '').trim().toLowerCase() === key);
    if (index >= 0) {
        const current = list[index] || {};
        list[index] = {
            ...current,
            ...addon,
            addon_key: key
        };
    } else {
        list.push({
            ...addon,
            addon_key: key
        });
    }

    return list;
}

function toBoolFromSelect(element) {
    return String(element?.value || '').trim() === 'true';
}

function setBoolSelectValue(element, value) {
    if (!element) {
        return;
    }
    element.value = value ? 'true' : 'false';
}

function buildPlanPayloadFromInputs(inputs = {}) {
    const id = String(inputs.idInput?.value || '').trim();
    const name = String(inputs.nameInput?.value || '').trim();
    if (!id || !name) {
        setStatus('Plan ID and plan name are required.', true);
        return null;
    }

    return {
        id,
        name,
        price_monthly: Number(inputs.priceInput?.value || 0),
        max_branches: Number(inputs.branchesInput?.value || 0),
        max_users: Number(inputs.usersInput?.value || 0),
        max_invoices_monthly: Number(inputs.invoicesInput?.value || 0),
        ai_monthly_quota: Number(inputs.aiQuotaInput?.value || 0),
        modules: {
            attendance: toBoolFromSelect(inputs.attendanceSelect),
            sales: toBoolFromSelect(inputs.salesSelect),
            inventory: toBoolFromSelect(inputs.inventorySelect),
            invoicing: toBoolFromSelect(inputs.invoicingSelect),
            reports: toBoolFromSelect(inputs.reportsSelect),
            ai_reader: toBoolFromSelect(inputs.aiSelect)
        }
    };
}

async function createPlan() {
    const payload = buildPlanPayloadFromInputs({
        idInput: planId,
        nameInput: planName,
        priceInput: planPrice,
        branchesInput: planBranches,
        usersInput: planUsers,
        invoicesInput: planInvoices,
        aiQuotaInput: planAiQuota,
        attendanceSelect: mAttendance,
        salesSelect: mSales,
        inventorySelect: mInventory,
        invoicingSelect: mInvoicing,
        reportsSelect: mReports,
        aiSelect: mAi
    });
    if (!payload) {
        return;
    }

    createPlanBtn.disabled = true;
    setStatus('Creating plan...');
    try {
        await appClient.createSuperPlan(payload);
        planId.value = '';
        planName.value = '';
        planPrice.value = '';
        planBranches.value = '';
        planUsers.value = '';
        planInvoices.value = '';
        planAiQuota.value = '';
        setBoolSelectValue(mAttendance, true);
        setBoolSelectValue(mSales, true);
        setBoolSelectValue(mInventory, true);
        setBoolSelectValue(mInvoicing, true);
        setBoolSelectValue(mReports, true);
        setBoolSelectValue(mAi, true);
        await loadData();
        setStatus('Plan created.');
    } catch (error) {
        console.error('Failed to create plan:', error);
        setStatus(error.message || 'Failed to create plan.', true);
    } finally {
        createPlanBtn.disabled = false;
    }
}

function isPlanEditModalOpen() {
    return planEditModal.classList.contains('is-open');
}

function openPlanEditModal(plan) {
    if (!plan) {
        return;
    }

    state.editingPlanOriginalId = String(plan.id || '').trim();
    editPlanId.value = String(plan.id || '').trim();
    editPlanName.value = String(plan.name || '').trim();
    editPlanPrice.value = String(Number(plan.price_monthly || 0));
    editPlanBranches.value = String(Number(plan.max_branches || 0));
    editPlanUsers.value = String(Number(plan.max_users || 0));
    editPlanInvoices.value = String(Number(plan.max_invoices_monthly || 0));
    editPlanAiQuota.value = String(Number(plan.ai_monthly_quota || 0));

    const modules = plan.modules || {};
    setBoolSelectValue(editMAttendance, Boolean(modules.attendance));
    setBoolSelectValue(editMSales, Boolean(modules.sales));
    setBoolSelectValue(editMInventory, Boolean(modules.inventory));
    setBoolSelectValue(editMInvoicing, Boolean(modules.invoicing));
    setBoolSelectValue(editMReports, Boolean(modules.reports));
    setBoolSelectValue(editMAi, Boolean(modules.ai_reader));

    planEditModal.classList.add('is-open');
    planEditModal.setAttribute('aria-hidden', 'false');
    editPlanId.focus();
    editPlanId.select();
}

function closePlanEditModal() {
    state.editingPlanOriginalId = '';
    planEditModal.classList.remove('is-open');
    planEditModal.setAttribute('aria-hidden', 'true');
}

async function savePlanEdit() {
    const originalPlanId = String(state.editingPlanOriginalId || '').trim();
    if (!originalPlanId) {
        setStatus('Select a plan to edit.', true);
        return;
    }

    const payload = buildPlanPayloadFromInputs({
        idInput: editPlanId,
        nameInput: editPlanName,
        priceInput: editPlanPrice,
        branchesInput: editPlanBranches,
        usersInput: editPlanUsers,
        invoicesInput: editPlanInvoices,
        aiQuotaInput: editPlanAiQuota,
        attendanceSelect: editMAttendance,
        salesSelect: editMSales,
        inventorySelect: editMInventory,
        invoicingSelect: editMInvoicing,
        reportsSelect: editMReports,
        aiSelect: editMAi
    });
    if (!payload) {
        return;
    }

    planEditSaveBtn.disabled = true;
    setStatus('Saving plan changes...');
    try {
        await appClient.updateSuperPlan(originalPlanId, payload);
        closePlanEditModal();
        await loadData();
        setStatus('Plan updated.');
    } catch (error) {
        console.error('Failed to update plan:', error);
        if (String(error.message || '').toLowerCase().includes('not found')) {
            closePlanEditModal();
            await loadData();
        }
        setStatus(error.message || 'Failed to update plan.', true);
    } finally {
        planEditSaveBtn.disabled = false;
    }
}

async function deletePlan(plan) {
    const confirmed = window.confirm(`Delete plan "${plan.name}" (${plan.id})? This works only when no company uses it.`);
    if (!confirmed) {
        return;
    }

    setStatus('Deleting plan...');
    try {
        await appClient.deleteSuperPlan(plan.id);
        if (String(state.editingPlanOriginalId || '') === String(plan.id || '')) {
            closePlanEditModal();
        }
        await loadData();
        setStatus('Plan deleted.');
    } catch (error) {
        console.error('Failed to delete plan:', error);
        if (String(error.message || '').toLowerCase().includes('not found')) {
            closePlanEditModal();
            await loadData();
        }
        setStatus(error.message || 'Failed to delete plan.', true);
    }
}

async function handlePlanAction(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
        return;
    }

    const action = target.dataset.action || '';
    if (!action) {
        return;
    }

    const row = target.closest('[data-plan-id]');
    if (!(row instanceof HTMLElement)) {
        return;
    }

    const planIdValue = row.getAttribute('data-plan-id') || '';
    if (!planIdValue) {
        return;
    }

    const plan = state.plans.find((item) => String(item.id) === String(planIdValue));
    if (!plan) {
        setStatus('Plan no longer exists. Reloading...', true);
        await loadData();
        return;
    }

    if (action === 'edit-plan') {
        openPlanEditModal(plan);
        return;
    }

    if (action !== 'delete-plan') {
        return;
    }

    target.setAttribute('disabled', 'true');
    try {
        await deletePlan(plan);
    } finally {
        target.removeAttribute('disabled');
    }
}

async function handleCompanyAction(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
        return;
    }

    const action = target.dataset.action || '';
    if (!action) {
        return;
    }

    const row = target.closest('[data-company-id]');
    if (!(row instanceof HTMLElement)) {
        return;
    }

    const companyId = row.getAttribute('data-company-id') || '';
    if (!companyId) {
        return;
    }

    const company = state.companies.find((item) => String(item.id) === String(companyId));
    if (!company) {
        return;
    }

    if (action === 'toggle-admin-password') {
        toggleAdminPasswordVisibility(row, target);
        return;
    }

    target.setAttribute('disabled', 'true');
    try {
        if (action === 'save-company') {
            await saveCompanyEdits(company, row, { enableWhiteLabel: false });
            return;
        }

        if (action === 'save-branding') {
            await saveCompanyEdits(company, row, { enableWhiteLabel: true });
            return;
        }

        if (action === 'set-plan') {
            const select = row.querySelector('select[data-role="planSelect"]');
            const planIdValue = select ? String(select.value || '').trim() : '';
            if (!planIdValue) {
                setStatus('Plan selection is required.', true);
                return;
            }
            await setCompanyPlan(companyId, planIdValue);
            return;
        }

        if (action === 'usage') {
            await showCompanyUsage(companyId);
            return;
        }

        if (action === 'reset-admin-password') {
            await resetCompanyAdminPassword(company, row);
            return;
        }

        if (action === 'delete-company') {
            await deleteCompany(company);
            return;
        }

        if (action === 'toggle-addon') {
            const addonKey = target.dataset.addon || '';
            if (!addonKey) {
                return;
            }
            await toggleAddon(company, addonKey);
        }
    } finally {
        target.removeAttribute('disabled');
    }
}

async function saveCompanyEdits(company, row, { enableWhiteLabel = false } = {}) {
    const payload = buildCompanyUpdatePayload(company, row);
    if (!payload) {
        return;
    }

    setStatus(enableWhiteLabel ? 'Saving branding and enabling white label...' : 'Saving company details...');
    try {
        await appClient.updateSuperCompany(company.id, payload);
        if (enableWhiteLabel) {
            await appClient.updateSuperCompanyAddon(company.id, 'white_label', {
                is_active: true
            });
        }

        await loadData();

        if (!enableWhiteLabel && !company.addons?.white_label?.is_active) {
            setStatus('Company saved. Enable White Label para lumabas ang custom logo/design sa login UI.');
            return;
        }

        setStatus(enableWhiteLabel ? 'Company branding saved and white label enabled.' : 'Company details saved.');
    } catch (error) {
        console.error('Failed to save company details:', error);
        setStatus(error.message || 'Failed to save company details.', true);
    }
}

function buildCompanyUpdatePayload(company, row) {
    const name = readEditorValue(row, 'edit-name');
    const code = readEditorValue(row, 'edit-code');
    const subdomain = readEditorValue(row, 'edit-subdomain');
    const customDomain = readEditorValue(row, 'edit-custom-domain');
    const appName = readEditorValue(row, 'edit-app-name');
    const primaryColor = readEditorValue(row, 'edit-primary-color');
    const logoPath = readEditorValue(row, 'edit-logo-path');
    const status = readEditorValue(row, 'edit-status') || String(company.status || 'active').trim().toLowerCase() || 'active';
    const planIdValue = readEditorValue(row, 'planSelect') || String(company.plan_id || '').trim();

    if (!name) {
        setStatus('Company name is required.', true);
        return null;
    }
    if (!code) {
        setStatus('Company code is required.', true);
        return null;
    }

    return {
        name,
        company_code: code,
        subdomain,
        custom_domain: customDomain,
        app_name: appName,
        primary_color: primaryColor || DEFAULT_PRIMARY_COLOR,
        logo_path: logoPath,
        status,
        plan_id: planIdValue
    };
}

function readEditorValue(row, role) {
    const element = row.querySelector(`[data-role="${role}"]`);
    if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLSelectElement) && !(element instanceof HTMLTextAreaElement)) {
        return '';
    }
    return String(element.value || '').trim();
}

function toggleAdminPasswordVisibility(row, target) {
    const input = row.querySelector('input[data-role="admin-password"]');
    if (!(input instanceof HTMLInputElement)) {
        return;
    }

    const nextType = input.type === 'password' ? 'text' : 'password';
    input.type = nextType;
    target.textContent = nextType === 'password' ? 'Show' : 'Hide';
}

async function resetCompanyAdminPassword(company, row) {
    const adminUser = readEditorValue(row, 'admin-username') || String(company.admin_credentials?.username || '').trim();
    if (!adminUser) {
        setStatus('Company admin account not found.', true);
        return;
    }

    const nextPasswordRaw = window.prompt(`Set new password for ${adminUser}:`);
    if (nextPasswordRaw === null) {
        return;
    }

    const nextPassword = String(nextPasswordRaw || '').trim();
    if (!nextPassword) {
        setStatus('Admin password is required.', true);
        return;
    }

    setStatus('Updating admin password...');
    try {
        await appClient.updateSuperCompanyAdminCredentials(company.id, {
            password: nextPassword
        });
        await loadData();
        setStatus('Admin password updated.');
    } catch (error) {
        console.error('Failed to update admin password:', error);
        setStatus(error.message || 'Failed to update admin password.', true);
    }
}

async function deleteCompany(company) {
    const companyLabel = `${company.name} (${company.company_code})`;
    const confirmed = window.confirm(`Delete company "${companyLabel}"? This will permanently remove its users and data.`);
    if (!confirmed) {
        return;
    }

    setStatus('Deleting company...');
    try {
        await appClient.deleteSuperCompany(company.id);
        await loadData();
        setStatus('Company deleted.');
    } catch (error) {
        console.error('Failed to delete company:', error);
        setStatus(error.message || 'Failed to delete company.', true);
    }
}

async function setCompanyPlan(companyId, planIdValue) {
    setStatus('Updating subscription...');
    try {
        await appClient.updateSuperCompanySubscription(companyId, {
            plan_id: planIdValue,
            start_date: new Date().toISOString().slice(0, 10)
        });
        await loadData();
        setStatus('Subscription updated.');
    } catch (error) {
        console.error('Failed to update subscription:', error);
        setStatus(error.message || 'Failed to update subscription.', true);
    }
}

async function showCompanyUsage(companyId) {
    setStatus('Loading usage...');
    try {
        const month = new Date().toISOString().slice(0, 7);
        const usage = await appClient.getSuperCompanyUsage(companyId, month);
        const details = [
            `Month: ${usage.month_key || month}`,
            `Invoices: ${Number(usage.invoices_count || 0)}`,
            `AI Reads: ${Number(usage.ai_reads_count || 0)}`,
            `Storage (MB): ${Number(usage.storage_mb_used || 0)}`
        ].join('\n');
        window.alert(details);
        setStatus('Usage loaded.');
    } catch (error) {
        console.error('Failed to load usage:', error);
        setStatus(error.message || 'Failed to load usage.', true);
    }
}

async function toggleAddon(company, addonKey) {
    const current = company.addons?.[addonKey];
    const nextState = !Boolean(current?.is_active);
    const payload = { is_active: nextState };

    if (addonKey === 'ai_reader' && nextState) {
        const currentQuota = Number(current?.quota?.monthlyQuota || company.limits?.ai_monthly_quota || 100);
        const rawQuota = window.prompt('AI monthly quota:', String(currentQuota));
        if (rawQuota === null) {
            return;
        }
        payload.quota = {
            monthlyQuota: Math.max(0, Number(rawQuota || 0))
        };
    }

    setStatus(`${nextState ? 'Enabling' : 'Disabling'} ${addonKey}...`);
    try {
        await appClient.updateSuperCompanyAddon(company.id, addonKey, payload);
        await loadData();
        setStatus(`Addon ${addonKey} updated.`);
    } catch (error) {
        console.error('Failed to update add-on:', error);
        setStatus(error.message || 'Failed to update add-on.', true);
    }
}

function normalizeHexColor(value, fallback = DEFAULT_PRIMARY_COLOR) {
    const text = String(value || '').trim();
    const longMatch = text.match(/^#?([0-9a-f]{6})$/i);
    if (longMatch) {
        return `#${longMatch[1].toLowerCase()}`;
    }

    const shortMatch = text.match(/^#?([0-9a-f]{3})$/i);
    if (shortMatch) {
        const expanded = shortMatch[1]
            .toLowerCase()
            .split('')
            .map((character) => character + character)
            .join('');
        return `#${expanded}`;
    }

    return fallback ? String(fallback).trim().toLowerCase() : '';
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Unable to read image file.'));
        reader.readAsDataURL(file);
    });
}

function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Invalid image content.'));
        image.src = dataUrl;
    });
}

async function optimizeLogoDataUrl(dataUrl, { maxBytes, maxDimension }) {
    const originalSize = dataUrlByteLength(dataUrl);
    if (originalSize <= maxBytes) {
        return dataUrl;
    }

    const image = await loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Your browser does not support image processing.');
    }

    let width = image.naturalWidth || image.width || 0;
    let height = image.naturalHeight || image.height || 0;
    if (!width || !height) {
        throw new Error('Invalid logo size.');
    }

    const initialScale = Math.min(1, maxDimension / Math.max(width, height));
    width = Math.max(1, Math.round(width * initialScale));
    height = Math.max(1, Math.round(height * initialScale));

    for (let attempt = 0; attempt < 5; attempt += 1) {
        canvas.width = width;
        canvas.height = height;
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        for (let quality = 0.9; quality >= 0.5; quality -= 0.1) {
            const candidate = canvas.toDataURL('image/webp', quality);
            if (dataUrlByteLength(candidate) <= maxBytes) {
                return candidate;
            }
        }

        width = Math.max(1, Math.round(width * 0.85));
        height = Math.max(1, Math.round(height * 0.85));
    }

    throw new Error('Logo is too large after optimization. Please use a smaller image.');
}

function dataUrlByteLength(dataUrl) {
    const text = String(dataUrl || '');
    const commaIndex = text.indexOf(',');
    if (commaIndex < 0) {
        return text.length;
    }
    const base64 = text.slice(commaIndex + 1);
    const padding = base64.endsWith('==') ? 2 : (base64.endsWith('=') ? 1 : 0);
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function formatBytes(value) {
    const bytes = Math.max(0, Number(value || 0));
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#b91c1c' : '#1d4ed8';
}

function normalizeSearchText(value) {
    return String(value || '').trim().toLowerCase();
}

function escape(value) {
    return appClient.escapeHtml(value);
}
