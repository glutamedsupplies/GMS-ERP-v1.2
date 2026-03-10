const appClient = window.appClient;

window.addEventListener('DOMContentLoaded', async () => {
    const session = await appClient.ensureSession({ role: 'head_admin' });
    if (!session) {
        return;
    }

    const panelNav = document.getElementById('panelNav');
    const groupNav = document.getElementById('groupNav');
    const topPanelBar = document.getElementById('topPanelBar');
    const topPanelTitle = document.getElementById('topPanelTitle');
    const topPanelItems = document.getElementById('topPanelItems');
    const navItems = Array.from(panelNav?.querySelectorAll('li[data-panel]') || []);
    const navItemByPanel = new Map(navItems.map((item) => [item.dataset.panel, item]));
    const panelFrame = document.getElementById('panelFrame');
    const workspaceName = document.getElementById('workspaceName');
    const workspaceCopy = document.getElementById('workspaceCopy');
    const workspaceUser = document.getElementById('workspaceUser');
    const workspaceRole = document.getElementById('workspaceRole');
    const sidebarStatusText = document.getElementById('sidebarStatusText');
    const heroKicker = document.getElementById('heroKicker');
    const heroTitle = document.getElementById('heroTitle');
    const heroCopy = document.getElementById('heroCopy');
    const moduleBadge = document.getElementById('moduleBadge');
    const featureBadge = document.getElementById('featureBadge');
    let currentPanelSrc = '';
    let bootstrap = null;
    let useGroupedNavigation = false;
    let activeGroupId = null;
    const panelLabels = new Map();
    const panelIcons = new Map();

    const panelMap = {
        employees: 'employees.html',
        client_database: 'client_database.html',
        inventory_manager: 'inventory.html',
        inventory_levels: 'inventory_levels.html',
        composite_items: 'composite_items.html',
        order_form: 'order_form.html',
        communication_panel: 'communication_panel.html',
        sales_report: 'sales_report.html',
        lbc_tracking: 'lbc_tracking.html',
        invoice_summary: 'invoice_summary.html',
        expenses: 'expenses.html',
        timecards: 'timecards.html',
        today: 'today_present.html',
        time_in_out: 'time_in_time_out.html',
        reports: 'reports.html',
        settings: 'settings.html',
        users: 'users.html',
        branches: 'branches.html',
        company_profile: 'company_profile.html',
        invoice_template: 'invoice_template.html'
    };
    const panelRequirements = {
        employees: ['attendance'],
        client_database: ['sales'],
        inventory_manager: ['inventory'],
        inventory_levels: ['inventory'],
        composite_items: ['inventory'],
        order_form: ['invoicing'],
        communication_panel: [],
        sales_report: ['sales', 'reports'],
        lbc_tracking: ['sales'],
        invoice_summary: ['invoicing'],
        expenses: ['sales'],
        timecards: ['attendance'],
        today: ['attendance'],
        time_in_out: ['attendance'],
        reports: ['reports'],
        settings: [],
        users: [],
        branches: [],
        company_profile: [],
        invoice_template: ['invoicing']
    };
    const panelFeatureRequirements = {
        inventory_manager: ['inventory'],
        inventory_levels: ['inventory'],
        composite_items: ['composite'],
        order_form: ['order_form'],
        expenses: ['expenses']
    };
    const panelGroups = [
        {
            id: 'sales_inventory',
            iconClass: 'fa-solid fa-store',
            label: 'Sales & Inventory',
            panels: [
                'client_database',
                'inventory_manager',
                'composite_items',
                'inventory_levels',
                'order_form',
                'sales_report',
                'invoice_summary',
                'expenses',
                'lbc_tracking'
            ]
        },
        {
            id: 'attendance',
            iconClass: 'fa-regular fa-clock',
            label: 'Attendance',
            panels: [
                'timecards',
                'today',
                'time_in_out',
                'reports'
            ]
        },
        {
            id: 'admin_setup',
            iconClass: 'fa-solid fa-screwdriver-wrench',
            label: 'Admin & Setup',
            panels: [
                'employees',
                'users',
                'branches',
                'company_profile',
                'invoice_template',
                'settings'
            ]
        },
        {
            id: 'communication_panel',
            iconClass: 'fa-solid fa-comments',
            label: 'Communication Panel',
            panels: [
                'communication_panel'
            ]
        }
    ];
    const panelDescriptions = {
        employees: 'Create, update, and schedule employee accounts without losing readability on smaller screens.',
        client_database: 'Review client records, track account activity, and keep customer data organized.',
        inventory_manager: 'Maintain product pricing, labels, and inventory setup from a cleaner workspace.',
        inventory_levels: 'Monitor stock counts and inventory movement with less visual noise.',
        composite_items: 'Manage bundled and recipe-based items in a layout built for quick scanning.',
        order_form: 'Encode customer orders quickly while keeping important actions visible.',
        communication_panel: 'Stay on top of tenant and customer messages from a dedicated communication view.',
        sales_report: 'Read sales performance summaries with faster navigation between report panels.',
        lbc_tracking: 'Track shipment details and update records without leaving the admin shell.',
        invoice_summary: 'Review invoice activity with a simpler, more focused summary panel.',
        expenses: 'Capture expenses and cash flow entries in a cleaner transactional workspace.',
        timecards: 'Open employee time cards and attendance history from one organized section.',
        today: 'Check who is present today with fewer clicks and a more readable layout.',
        time_in_out: 'Manage attendance station actions and live time controls.',
        reports: 'Generate attendance reports with better access to filters and output panels.',
        settings: 'Adjust workspace settings and account preferences.',
        users: 'Control user access, feature permissions, and account setup.',
        branches: 'Manage branch structure, availability, and tenant branch data.',
        company_profile: 'Customize tenant branding, logo, and company profile details.',
        invoice_template: 'Maintain invoice template visuals and output settings.'
    };
    const groupByPanel = panelGroups.reduce((lookup, group) => {
        group.panels.forEach((panel) => lookup.set(panel, group.id));
        return lookup;
    }, new Map());

    try {
        bootstrap = await appClient.getBootstrap();
        appClient.applyBootstrapBrandTheme(bootstrap);
    } catch (error) {
        console.error('Failed to load bootstrap:', error);
    }

    applyWorkspaceConfig();
    cachePanelMetadata();

    navItems.forEach((item) => {
        item.addEventListener('click', () => {
            if (item.dataset.disabled === 'true') {
                return;
            }
            loadPanel(item.dataset.panel);
        });
    });

    applyPanelGating();
    populateWorkspaceSummary();

    useGroupedNavigation = true;
    let groupedFallbackPanel = null;
    if (useGroupedNavigation) {
        groupedFallbackPanel = initializeGroupedNavigation();
    } else {
        showSinglePanelNavigation();
    }

    const initialPanel = panelNav?.querySelector('li.active[data-panel]:not([data-disabled="true"]):not([data-hidden="true"])')?.dataset.panel
        || navItems.find((item) => isPanelEnabled(item.dataset.panel))?.dataset.panel
        || groupedFallbackPanel;

    if (initialPanel) {
        loadPanel(initialPanel);
    }

    window.addEventListener('message', async (event) => {
        if (event.origin !== window.location.origin) {
            return;
        }

        if (event.data === 'logout') {
            await appClient.clearSession();
            window.location.replace('/index.html');
            return;
        }

        if (event.data?.type === 'open-order-form' && event.data.orderNumber) {
            loadPanel('order_form', { orderNumber: event.data.orderNumber });
        }
    });

    function loadPanel(panel, options = {}) {
        const fileName = panelMap[panel];
        if (!fileName || !panelFrame) {
            return;
        }

        const targetSrc = buildPanelSrc(fileName, options);
        if (currentPanelSrc === targetSrc) {
            return;
        }

        currentPanelSrc = targetSrc;
        setActivePanel(panel);
        panelFrame.src = targetSrc;
    }

    function setActivePanel(panel) {
        let activeItem = null;

        navItems.forEach((item) => {
            if (item.dataset.disabled === 'true') {
                item.classList.remove('active');
                return;
            }
            const isActive = item.dataset.panel === panel;
            item.classList.toggle('active', isActive);

            if (isActive) {
                activeItem = item;
            }
        });

        activeItem?.scrollIntoView({
            block: 'nearest',
            inline: 'center',
            behavior: 'smooth'
        });

        if (!useGroupedNavigation) {
            updateActivePanelSummary(panel);
            return;
        }

        const nextGroupId = groupByPanel.get(panel);
        if (!nextGroupId) {
            updateActivePanelSummary(panel);
            return;
        }

        if (nextGroupId !== activeGroupId) {
            activeGroupId = nextGroupId;
            setActiveGroupItem(activeGroupId);
            renderTopPanelItems(activeGroupId);
        }

        setActiveTopPanelButton(panel);
        updateActivePanelSummary(panel);
    }

    function buildPanelSrc(fileName, options = {}) {
        if (fileName !== 'order_form.html' || !options.orderNumber) {
            return fileName;
        }

        return `${fileName}?orderNumber=${encodeURIComponent(options.orderNumber)}`;
    }

    function hasModuleAccess(panel) {
        const requiredModules = panelRequirements[panel] || [];
        if (!requiredModules.length) {
            return true;
        }

        const modules = bootstrap?.modules || {};
        return requiredModules.every((moduleKey) => Boolean(modules[moduleKey]));
    }

    function normalizeUserFeatureAccess(value = {}) {
        const defaults = {
            expenses: true,
            order_form: true,
            inventory: true,
            composite: true,
            lbc_tracking: false
        };
        const source = (value && typeof value === 'object') ? value : {};
        return Object.keys(defaults).reduce((access, key) => {
            access[key] = Object.prototype.hasOwnProperty.call(source, key)
                ? Boolean(source[key])
                : defaults[key];
            return access;
        }, {});
    }

    function hasFeatureAccess(panel) {
        const requiredFeatures = panelFeatureRequirements[panel] || [];
        if (!requiredFeatures.length) {
            return true;
        }

        const featureAccess = normalizeUserFeatureAccess(bootstrap?.user?.feature_access || {});
        return requiredFeatures.every((featureKey) => Boolean(featureAccess[featureKey]));
    }

    function getWorkspaceConfig() {
        return bootstrap?.workspaceConfig || {};
    }

    function normalizeCompanyCode(value) {
        return String(value || '').trim().toLowerCase();
    }

    function resolveCompanyCode() {
        return normalizeCompanyCode(
            bootstrap?.company?.company_code
            || session?.company_code
            || session?.companyCode
        );
    }

    function isGmsInvoiceCompany() {
        const companyCode = resolveCompanyCode();
        return companyCode === 'gms'
            || companyCode === 'gms-erp'
            || companyCode === 'gmserp'
            || companyCode === 'default';
    }

    function isGmsOrGwdCompany() {
        const companyCode = resolveCompanyCode();
        return companyCode === 'default'
            || companyCode === 'gms'
            || companyCode === 'gms-erp'
            || companyCode === 'gmserp'
            || companyCode === 'gwd'
            || companyCode === 'gwd-erp'
            || companyCode === 'gwderp';
    }

    function isPanelVisible(panel) {
        const workspace = getWorkspaceConfig();
        const menu = workspace?.menu || {};

        if (panel === 'invoice_summary') {
            return Boolean(menu.showInvoiceSummary) && isGmsInvoiceCompany();
        }
        if (panel === 'lbc_tracking') {
            return isGmsOrGwdCompany();
        }
        if (panel === 'communication_panel') {
            return isGmsOrGwdCompany();
        }
        if (panel === 'customer_requests') {
            return false;
        }
        if (panel === 'inventory_levels') {
            return menu.showInventoryLevels !== false;
        }
        return true;
    }

    function setNavItemLabel(panel, label) {
        const item = navItemByPanel.get(panel);
        if (!item || !label) {
            return;
        }

        const icon = item.querySelector('i');
        if (!icon) {
            item.textContent = label;
            return;
        }

        const preservedIcon = icon.cloneNode(true);
        item.innerHTML = '';
        item.appendChild(preservedIcon);
        item.appendChild(document.createTextNode(` ${label}`));
    }

    function applyWorkspaceConfig() {
        const workspace = getWorkspaceConfig();
        const labels = workspace?.labels || {};
        const inventoryLabel = labels.inventoryMenu === 'Product Pricing'
            ? 'Pricing'
            : (labels.inventoryMenu || 'Pricing');
        const compositeLabel = labels.compositeMenu === 'Composite Items'
            ? 'Composite Recipe'
            : (labels.compositeMenu || 'Composite Recipe');

        setNavItemLabel('inventory_manager', inventoryLabel);
        setNavItemLabel('inventory_levels', labels.inventoryLevelsMenu || 'Inventory');
        setNavItemLabel('composite_items', compositeLabel);
        setNavItemLabel('order_form', labels.orderFormMenu || 'Order Form');
        setNavItemLabel('sales_report', labels.salesReportMenu || 'Sales Reports');
        setNavItemLabel('expenses', labels.expensesMenu || 'Expenses');
    }

    function applyPanelGating() {
        navItems.forEach((item) => {
            const panel = item.dataset.panel;
            const visible = isPanelVisible(panel);
            if (!visible) {
                item.dataset.hidden = 'true';
                item.dataset.disabled = 'true';
                item.classList.remove('active');
                item.style.display = 'none';
                return;
            }

            item.dataset.hidden = 'false';
            item.style.display = '';
            const moduleAccess = hasModuleAccess(panel);
            const featureAccess = hasFeatureAccess(panel);
            if (moduleAccess && featureAccess) {
                item.dataset.disabled = 'false';
                item.style.opacity = '1';
                item.style.cursor = 'pointer';
                item.title = '';
                return;
            }

            item.dataset.disabled = 'true';
            item.classList.remove('active');
            item.style.opacity = '0.45';
            item.style.cursor = 'not-allowed';
            item.title = moduleAccess
                ? 'Not allowed for this user account.'
                : 'Not available in your current plan.';
        });
    }

    function populateWorkspaceSummary() {
        const companyName = String(bootstrap?.company?.name || '').trim() || 'Company Workspace';
        const companyCode = String(
            bootstrap?.company?.company_code
            || session?.company_code
            || session?.companyCode
            || ''
        ).trim();
        const normalizedRole = String(session?.role || 'head_admin').trim().toLowerCase();
        const roleLabel = normalizedRole === 'company_admin' ? 'Company Admin' : 'Head Admin';
        const enabledModules = Object.entries(bootstrap?.modules || {}).filter(([, isEnabled]) => Boolean(isEnabled));
        const readyPanels = navItems.filter((item) => item.dataset.hidden !== 'true' && item.dataset.disabled !== 'true').length;

        if (workspaceName) {
            workspaceName.textContent = companyName;
        }
        if (workspaceCopy) {
            workspaceCopy.textContent = companyCode
                ? `Tenant code: ${companyCode}. Operations, staff tools, and setup panels are now available below.`
                : 'Operations, staff tools, and setup panels are now available below.';
        }
        if (workspaceUser) {
            workspaceUser.textContent = session?.userName || 'Admin User';
        }
        if (workspaceRole) {
            workspaceRole.textContent = roleLabel;
        }
        if (moduleBadge) {
            moduleBadge.textContent = `${enabledModules.length} module${enabledModules.length === 1 ? '' : 's'} active`;
        }
        if (featureBadge) {
            featureBadge.textContent = `${readyPanels} panel${readyPanels === 1 ? '' : 's'} ready`;
        }
        if (sidebarStatusText) {
            sidebarStatusText.textContent = `${readyPanels} panel${readyPanels === 1 ? '' : 's'} available`;
        }
    }

    function updateActivePanelSummary(panel) {
        const activeLabel = panelLabels.get(panel) || panel || 'Workspace';
        const activeGroupLabel = panelGroups.find((group) => group.id === groupByPanel.get(panel))?.label || 'Operations Control';

        if (heroKicker) {
            heroKicker.textContent = activeGroupLabel;
        }
        if (heroTitle) {
            heroTitle.textContent = activeLabel;
        }
        if (heroCopy) {
            heroCopy.textContent = panelDescriptions[panel] || 'Manage this workspace panel from a more responsive shell.';
        }
        if (sidebarStatusText) {
            sidebarStatusText.textContent = `${activeLabel} ready`;
        }

        document.title = `${activeLabel} | Head Admin`;
    }

    function initializeGroupedNavigation() {
        if (!panelNav || !groupNav || !topPanelBar || !topPanelItems || !topPanelTitle) {
            useGroupedNavigation = false;
            showSinglePanelNavigation();
            return null;
        }

        const visibleGroups = panelGroups.filter((group) => hasVisiblePanel(group.panels));
        if (!visibleGroups.length) {
            useGroupedNavigation = false;
            showSinglePanelNavigation();
            return null;
        }

        groupNav.innerHTML = '';

        visibleGroups.forEach((group) => {
            const item = document.createElement('li');
            item.dataset.group = group.id;
            item.innerHTML = `<i class="${group.iconClass}"></i> ${group.label}`;
            item.addEventListener('click', () => {
                activateGroup(group.id, { loadDefaultPanel: true });
            });
            groupNav.appendChild(item);
        });

        panelNav.hidden = true;
        groupNav.hidden = false;
        topPanelBar.hidden = false;

        const initialPanel = getCurrentActivePanel()
            || navItems.find((item) => isPanelEnabled(item.dataset.panel))?.dataset.panel
            || navItems.find((item) => isPanelVisibleByState(item.dataset.panel))?.dataset.panel
            || null;
        const preferredGroupId = initialPanel
            ? groupByPanel.get(initialPanel)
            : visibleGroups[0].id;
        const fallbackGroupId = visibleGroups.find((group) => group.id === preferredGroupId)?.id
            || visibleGroups[0].id;

        activeGroupId = fallbackGroupId;
        setActiveGroupItem(activeGroupId);
        renderTopPanelItems(activeGroupId);
        setActiveTopPanelButton(initialPanel);

        return getFirstPanelForGroup(activeGroupId, { enabledOnly: true })
            || getFirstPanelAcrossGroups({ enabledOnly: true })
            || getFirstPanelAcrossGroups({ enabledOnly: false });
    }

    function showSinglePanelNavigation() {
        if (panelNav) {
            panelNav.hidden = false;
        }
        if (groupNav) {
            groupNav.hidden = true;
            groupNav.innerHTML = '';
        }
        if (topPanelBar) {
            topPanelBar.hidden = true;
        }
        if (topPanelItems) {
            topPanelItems.innerHTML = '';
        }
        activeGroupId = null;
    }

    function activateGroup(groupId, { loadDefaultPanel = false } = {}) {
        if (!useGroupedNavigation) {
            return;
        }

        activeGroupId = groupId;
        setActiveGroupItem(groupId);
        renderTopPanelItems(groupId);

        const currentPanel = getCurrentActivePanel();
        if (currentPanel && groupByPanel.get(currentPanel) === groupId && isPanelEnabled(currentPanel)) {
            setActiveTopPanelButton(currentPanel);
            return;
        }

        const targetPanel = getFirstPanelForGroup(groupId, { enabledOnly: true })
            || getFirstPanelAcrossGroups({ enabledOnly: true });
        if (loadDefaultPanel && targetPanel) {
            loadPanel(targetPanel);
        }
    }

    function setActiveGroupItem(groupId) {
        if (!groupNav) {
            return;
        }

        Array.from(groupNav.querySelectorAll('li[data-group]')).forEach((item) => {
            item.classList.toggle('active', item.dataset.group === groupId);
        });
    }

    function renderTopPanelItems(groupId) {
        if (!topPanelBar || !topPanelItems || !topPanelTitle) {
            return;
        }

        const group = panelGroups.find((entry) => entry.id === groupId);
        if (!group) {
            topPanelItems.innerHTML = '';
            topPanelBar.hidden = true;
            return;
        }

        const panels = group.panels.filter((panel) => isPanelVisibleByState(panel));
        topPanelItems.innerHTML = '';
        topPanelTitle.textContent = `${group.label} Panels`;

        panels.forEach((panel) => {
            const item = navItemByPanel.get(panel);
            if (!item) {
                return;
            }

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'top-panel-button';
            button.dataset.panel = panel;

            const iconClass = panelIcons.get(panel);
            const label = panelLabels.get(panel) || getPanelLabel(item) || panel;
            button.innerHTML = iconClass
                ? `<i class="${iconClass}"></i><span>${label}</span>`
                : `<span>${label}</span>`;

            const disabled = item.dataset.disabled === 'true';
            button.disabled = disabled;
            button.title = item.title || '';

            button.addEventListener('click', () => {
                if (button.disabled) {
                    return;
                }
                loadPanel(panel);
            });

            topPanelItems.appendChild(button);
        });

        topPanelBar.hidden = panels.length === 0;
    }

    function setActiveTopPanelButton(panel) {
        if (!topPanelItems) {
            return;
        }

        const buttons = Array.from(topPanelItems.querySelectorAll('button[data-panel]'));
        buttons.forEach((button) => {
            button.classList.toggle('active', button.dataset.panel === panel);
        });

        const activeButton = buttons.find((button) => button.dataset.panel === panel);
        activeButton?.scrollIntoView({
            block: 'nearest',
            inline: 'center',
            behavior: 'smooth'
        });
    }

    function cachePanelMetadata() {
        navItems.forEach((item) => {
            const panel = item.dataset.panel;
            if (!panel) {
                return;
            }

            panelLabels.set(panel, getPanelLabel(item));
            panelIcons.set(panel, item.querySelector('i')?.className || '');
        });
    }

    function getPanelLabel(item) {
        return String(item?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function getCurrentActivePanel() {
        return navItems.find((item) => item.classList.contains('active') && isPanelVisibleByState(item.dataset.panel))?.dataset.panel || null;
    }

    function hasVisiblePanel(panels) {
        return panels.some((panel) => isPanelVisibleByState(panel));
    }

    function getFirstPanelForGroup(groupId, { enabledOnly = false } = {}) {
        const group = panelGroups.find((entry) => entry.id === groupId);
        if (!group) {
            return null;
        }

        return group.panels.find((panel) => {
            if (!isPanelVisibleByState(panel)) {
                return false;
            }
            if (!enabledOnly) {
                return true;
            }
            return isPanelEnabled(panel);
        }) || null;
    }

    function getFirstPanelAcrossGroups({ enabledOnly = false } = {}) {
        for (const group of panelGroups) {
            const panel = getFirstPanelForGroup(group.id, { enabledOnly });
            if (panel) {
                return panel;
            }
        }
        return null;
    }

    function isPanelVisibleByState(panel) {
        const item = navItemByPanel.get(panel);
        return Boolean(item) && item.dataset.hidden !== 'true';
    }

    function isPanelEnabled(panel) {
        const item = navItemByPanel.get(panel);
        return Boolean(item)
            && item.dataset.hidden !== 'true'
            && item.dataset.disabled !== 'true';
    }
});
