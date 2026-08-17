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
    const frameShell = document.getElementById('frameShell');
    const initialPanelFrame = document.getElementById('panelFrame');
    const frameLoadingLabel = document.getElementById('frameLoadingLabel');
    const dashboardLogoMark = document.getElementById('dashboardLogoMark');
    const dashboardLogoIcon = document.getElementById('dashboardLogoIcon');
    const dashboardLogoText = document.getElementById('dashboardLogoText');
    const workspaceTag = document.getElementById('workspaceTag');
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
    let dashboardReady = false;
    const panelLabels = new Map();
    const panelIcons = new Map();
    const panelFrames = new Map();
    let reusableInitialFrame = initialPanelFrame || null;

    function markDashboardReady() {
        if (dashboardReady) {
            return;
        }
        dashboardReady = true;
        document.body?.classList.remove('dashboard-loading');
    }

    function setFrameLoading(isLoading, panel = '') {
        if (!frameShell) {
            return;
        }

        const panelLabel = panel
            ? (panelLabels.get(panel) || panel || 'panel')
            : (panelLabels.get(getCurrentActivePanel()) || 'panel');
        const loadingMessage = `Loading ${panelLabel}...`;

        frameShell.classList.toggle('is-loading', isLoading);
        frameShell.setAttribute('aria-busy', isLoading ? 'true' : 'false');

        if (frameLoadingLabel) {
            frameLoadingLabel.textContent = isLoading ? loadingMessage : '';
        }

        if (sidebarStatusText) {
            sidebarStatusText.textContent = isLoading ? loadingMessage : `${panelLabel} ready`;
        }
    }

    prepareInitialPanelFrame();

    const panelMap = {
        employees: 'employees.html',
        client_database: 'client_database.html',
        inventory_manager: 'inventory.html',
        inventory_levels: 'inventory_levels.html',
        inventory_tracking: 'inventory_tracking.html',
        sales_inventory_insight: 'sales_inventory_insight.html',
        composite_items: 'composite_items.html',
        order_form: 'order_form.html',
        sales_report: 'sales_report.html',
        pending_payments: 'pending_payments.html',
        customer_credits: 'customer_credits.html',
        lbc_tracking: 'lbc_tracking.html',
        invoice_summary: 'invoice_summary.html',
        expenses: 'expenses.html',
        timecards: 'timecards.html',
        timecards_salary: 'timecards_salary.html',
        today: 'today_present.html',
        time_in_out: 'time_in_time_out.html',
        reports: 'reports.html',
        kpi_evaluation: 'kpi_evaluation.html',
        incident_report: 'incident_report.html',
        daily_compiled_report: 'daily_compiled_report.html',
        settings: 'settings.html',
        users: 'users.html',
        branches: 'branches.html',
        company_bulletin: 'company_bulletin.html',
        company_profile: 'company_profile.html',
        invoice_template: 'invoice_template.html'
    };
    const panelRequirements = {
        employees: ['attendance'],
        client_database: ['sales'],
        inventory_manager: ['inventory'],
        inventory_levels: ['inventory'],
        inventory_tracking: ['sales', 'inventory'],
        sales_inventory_insight: ['sales', 'inventory'],
        composite_items: ['inventory'],
        order_form: ['invoicing'],
        sales_report: ['sales', 'reports'],
        pending_payments: ['sales', 'reports'],
        customer_credits: ['sales', 'invoicing'],
        lbc_tracking: ['sales'],
        invoice_summary: ['invoicing'],
        expenses: ['sales'],
        timecards: ['attendance'],
        timecards_salary: ['attendance'],
        today: ['attendance'],
        time_in_out: ['attendance'],
        reports: ['reports'],
        kpi_evaluation: ['attendance'],
        incident_report: ['attendance'],
        daily_compiled_report: [],
        settings: [],
        users: [],
        branches: [],
        company_bulletin: [],
        company_profile: [],
        invoice_template: ['invoicing']
    };
    const panelFeatureRequirements = {
        inventory_manager: ['inventory'],
        inventory_levels: ['inventory'],
        inventory_tracking: ['inventory'],
        composite_items: ['composite'],
        order_form: ['order_form'],
        customer_credits: ['order_form'],
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
                'inventory_tracking',
                'sales_inventory_insight',
                'order_form',
                'sales_report',
                'pending_payments',
                'customer_credits',
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
                'timecards_salary',
                'today',
                'time_in_out',
                'reports',
                'kpi_evaluation',
                'incident_report'
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
                'company_bulletin',
                'daily_compiled_report',
                'company_profile',
                'invoice_template',
                'settings'
            ]
        },
    ];
    const panelDescriptions = {
        employees: 'Create, update, and schedule employee accounts without losing readability on smaller screens.',
        client_database: 'Review client records, track account activity, and keep customer data organized.',
        inventory_manager: 'Maintain product pricing, labels, and inventory setup from a cleaner workspace.',
        inventory_levels: 'Monitor stock counts and inventory movement with less visual noise.',
        sales_inventory_insight: 'Review fast movers, slow movers, expired stock, and near-expiry items from one focused panel.',
        composite_items: 'Manage bundled and recipe-based items in a layout built for quick scanning.',
        order_form: 'Encode customer orders quickly while keeping important actions visible.',
        sales_report: 'Read sales performance summaries with faster navigation between report panels.',
        pending_payments: 'Follow up unpaid and partially paid orders from a separate non-LBC payment panel.',
        customer_credits: 'Track customer credits, overpayments, and manual credit adjustments from one dedicated panel.',
        lbc_tracking: 'Track shipment details and update records without leaving the admin shell.',
        invoice_summary: 'Review invoice activity with a simpler, more focused summary panel.',
        expenses: 'Capture expenses and cash flow entries in a cleaner transactional workspace.',
        timecards: 'Open employee time cards and attendance history from one organized section.',
        timecards_salary: 'Compute daily salary, deductions, and net cutoff pay from a dedicated attendance payroll panel.',
        today: 'Check who is present today with fewer clicks and a more readable layout.',
        time_in_out: 'Manage attendance station actions and live time controls.',
        reports: 'Generate attendance reports with better access to filters and output panels.',
        kpi_evaluation: 'Review private peer evaluations, issue encounters, rating trends, and required evaluation completion.',
        incident_report: 'Review employee incident submissions and update their resolution status.',
        daily_compiled_report: 'Build a polished manual daily report and copy it as a ready-to-share image.',
        settings: 'Adjust workspace settings and account preferences.',
        users: 'Control user access, feature permissions, and account setup.',
        branches: 'Manage branch structure, availability, and tenant branch data.',
        company_bulletin: 'Set holidays, date-based news, and company events that appear in employee notifications.',
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

    applyTenantShellIdentity();
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

    const initialPanel = getPreferredWorkspacePanel()
        || panelNav?.querySelector('li.active[data-panel]:not([data-disabled="true"]):not([data-hidden="true"])')?.dataset.panel
        || navItems.find((item) => isPanelEnabled(item.dataset.panel))?.dataset.panel
        || groupedFallbackPanel;

    if (initialPanel) {
        loadPanel(initialPanel);
    } else {
        setFrameLoading(false);
        markDashboardReady();
    }

    window.setTimeout(markDashboardReady, 1500);

    window.addEventListener('message', async (event) => {
        if (event.origin !== window.location.origin) {
            return;
        }

        if (event.data === 'logout') {
            await appClient.clearSession();
            appClient.redirectToLogin?.();
            return;
        }

        if (event.data?.type === 'open-order-form' && event.data.orderNumber) {
            loadPanel('order_form', { orderNumber: event.data.orderNumber });
        }
    });

    function loadPanel(panel, options = {}) {
        const fileName = panelMap[panel];
        if (!fileName || !frameShell || !isPanelEnabled(panel)) {
            return;
        }

        const targetSrc = buildPanelSrc(fileName, options);
        if (currentPanelSrc === targetSrc) {
            return;
        }

        currentPanelSrc = targetSrc;
        setActivePanel(panel);
        showPanelFrame(targetSrc, panel);
    }

    function prepareInitialPanelFrame() {
        if (!reusableInitialFrame) {
            return;
        }

        const frame = reusableInitialFrame;
        frame.classList.add('dashboard-panel-frame');
        frame.hidden = true;
        frame.addEventListener('load', () => {
            frame.dataset.loaded = 'true';
            if (frame.dataset.panelSrc === currentPanelSrc) {
                setFrameLoading(false);
                markDashboardReady();
            }
        });
    }

    function showPanelFrame(targetSrc, panel) {
        let frame = panelFrames.get(targetSrc);
        const isCachedPanel = Boolean(frame?.dataset.loaded === 'true');

        if (!frame) {
            frame = takeReusableFrame() || createPanelFrame(panel);
            frame.dataset.panelSrc = targetSrc;
            frame.dataset.panel = panel;
            panelFrames.set(targetSrc, frame);
            setFrameLoading(true, panel);
            frame.src = targetSrc;
        } else if (!isCachedPanel) {
            setFrameLoading(true, panel);
        } else {
            setFrameLoading(false, panel);
            markDashboardReady();
        }

        activatePanelFrame(frame);
    }

    function takeReusableFrame() {
        if (!reusableInitialFrame) {
            return null;
        }

        const frame = reusableInitialFrame;
        reusableInitialFrame = null;
        return frame;
    }

    function createPanelFrame(panel) {
        const frame = document.createElement('iframe');
        frame.className = 'dashboard-panel-frame';
        frame.title = `${panelLabels.get(panel) || panel || 'Head Admin'} Panel`;
        frame.hidden = true;
        frame.addEventListener('load', () => {
            frame.dataset.loaded = 'true';
            if (frame.dataset.panelSrc === currentPanelSrc) {
                setFrameLoading(false);
                markDashboardReady();
            }
        });
        frameShell.appendChild(frame);
        return frame;
    }

    function activatePanelFrame(activeFrame) {
        panelFrames.forEach((frame) => {
            frame.hidden = frame !== activeFrame;
        });
        activeFrame.hidden = false;
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

    function getWorkspaceShellConfig() {
        const shell = getWorkspaceConfig()?.shell;
        return (shell && typeof shell === 'object' && !Array.isArray(shell)) ? shell : {};
    }

    function getWorkspaceShellVariant() {
        const configuredVariant = normalizeCompanyCode(getWorkspaceShellConfig()?.variant).replace(/[\s-]+/g, '_');
        if (configuredVariant) {
            return configuredVariant;
        }
        return resolveCompanyCode() === 'chow' ? 'restaurant_chow' : 'default';
    }

    function isChowRestaurantShell() {
        return getWorkspaceShellVariant() === 'restaurant_chow' || resolveCompanyCode() === 'chow';
    }

    function isIglowWorkspaceShell() {
        const variant = getWorkspaceShellVariant();
        return variant === 'iglow'
            || variant === 'tenant_iglow'
            || variant === 'iglow_glow'
            || resolveCompanyCode() === 'iglow';
    }

    function getDashboardShellName() {
        const configuredName = String(getWorkspaceShellConfig()?.appShellName || '').trim();
        if (configuredName) {
            return configuredName;
        }
        if (isChowRestaurantShell()) {
            return 'Chow Control';
        }
        return String(bootstrap?.company?.app_name || '').trim() || 'Head Admin';
    }

    function getWorkspaceTagLabel() {
        const configuredTag = String(getWorkspaceShellConfig()?.workspaceTag || '').trim();
        if (configuredTag) {
            return configuredTag;
        }
        return isChowRestaurantShell() ? 'Restaurant Workspace' : 'Tenant Workspace';
    }

    function getWorkspaceSummaryCopy(companyCode = '') {
        const configuredCopy = String(getWorkspaceShellConfig()?.workspaceCopy || '').trim();
        if (configuredCopy) {
            return configuredCopy;
        }

        if (isAttendanceOnlyWorkspace()) {
            return companyCode
                ? `Tenant code: ${companyCode}. POS, customers, items, inventory, sales, full attendance tools, and full admin settings are available in this limited workspace.`
                : 'POS, customers, items, inventory, sales, full attendance tools, and full admin settings are available in this limited workspace.';
        }

        if (isChowRestaurantShell()) {
            return companyCode
                ? `Tenant code: ${companyCode}. Counter POS, menu recipes, ingredient stock sheet, crew attendance, and store setup all live inside this restaurant workspace.`
                : 'Counter POS, menu recipes, ingredient stock sheet, crew attendance, and store setup all live inside this restaurant workspace.';
        }

        return companyCode
            ? `Tenant code: ${companyCode}. Operations, staff tools, and setup panels are now available below.`
            : 'Operations, staff tools, and setup panels are now available below.';
    }

    function updatePanelDescription(panel, description) {
        if (!panel || !description) {
            return;
        }
        panelDescriptions[panel] = description;
    }

    function applyTenantShellIdentity() {
        const companyCode = resolveCompanyCode();
        const chowShell = isChowRestaurantShell();
        const iglowShell = isIglowWorkspaceShell();

        if (document.body) {
            document.body.dataset.companyCode = companyCode || '';
            document.body.dataset.shellVariant = getWorkspaceShellVariant();
            document.body.classList.toggle('tenant-shell-chow', chowShell);
            document.body.classList.toggle('tenant-shell-iglow', iglowShell);
        }

        if (dashboardLogoMark) {
            dashboardLogoMark.title = `${getDashboardShellName()} workspace`;
        }
        if (dashboardLogoIcon) {
            dashboardLogoIcon.className = chowShell
                ? 'fa-solid fa-bowl-food'
                : 'fa-solid fa-shield-halved';
        }
        if (dashboardLogoText) {
            dashboardLogoText.textContent = getDashboardShellName();
        }
        if (workspaceTag) {
            workspaceTag.textContent = getWorkspaceTagLabel();
        }
    }

    function isAttendanceOnlyWorkspace() {
        return String(getWorkspaceConfig()?.experience?.mode || '').trim().toLowerCase() === 'attendance_only';
    }

    function getAttendanceOnlyPanels() {
        return [
            'client_database',
            'inventory_manager',
            'inventory_levels',
            'order_form',
            'sales_report',
            'employees',
            'users',
            'branches',
            'company_profile',
            'invoice_template',
            'timecards',
            'timecards_salary',
            'today',
            'time_in_out',
            'reports',
            'kpi_evaluation',
            'incident_report',
            'daily_compiled_report',
            'settings'
        ];
    }

    function getPreferredWorkspacePanel() {
        if (isChowRestaurantShell()) {
            const preferredPanels = ['order_form', 'inventory_levels', 'time_in_out', 'sales_report', 'employees'];
            return preferredPanels.find((panel) => isPanelEnabled(panel) || isPanelVisibleByState(panel)) || null;
        }

        if (!isAttendanceOnlyWorkspace()) {
            return null;
        }

        const preferredPanels = ['order_form', 'client_database', 'inventory_manager', 'time_in_out', 'settings'];
        return preferredPanels.find((panel) => isPanelEnabled(panel) || isPanelVisibleByState(panel)) || null;
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

        if (isAttendanceOnlyWorkspace()) {
            return getAttendanceOnlyPanels().includes(panel);
        }
        if (panel === 'invoice_summary') {
            return Boolean(menu.showInvoiceSummary) && isGmsInvoiceCompany();
        }
        if (panel === 'lbc_tracking') {
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

        if (isChowRestaurantShell()) {
            const salesInventoryGroup = panelGroups.find((group) => group.id === 'sales_inventory');
            const attendanceGroup = panelGroups.find((group) => group.id === 'attendance');
            const adminSetupGroup = panelGroups.find((group) => group.id === 'admin_setup');
            if (salesInventoryGroup) {
                salesInventoryGroup.label = 'Counter & Menu';
                salesInventoryGroup.iconClass = 'fa-solid fa-bowl-food';
                salesInventoryGroup.panels = [
                    'order_form',
                    'client_database',
                    'inventory_manager',
                    'composite_items',
                    'inventory_levels',
                    'sales_inventory_insight',
                    'sales_report',
                    'pending_payments',
                    'customer_credits',
                    'invoice_summary',
                    'expenses',
                    'lbc_tracking'
                ];
            }
            if (attendanceGroup) {
                attendanceGroup.label = 'Crew Attendance';
                attendanceGroup.iconClass = 'fa-regular fa-clock';
            }
            if (adminSetupGroup) {
                adminSetupGroup.label = 'Store Setup';
                adminSetupGroup.iconClass = 'fa-solid fa-shop';
            }
            setNavItemLabel('employees', 'Crew Profiles');
            setNavItemLabel('client_database', 'Customers');
            setNavItemLabel('inventory_manager', inventoryLabel === 'Pricing' ? 'Menu Items' : inventoryLabel);
            setNavItemLabel('inventory_levels', labels.inventoryLevelsMenu || 'Ingredients Sheet');
            setNavItemLabel('composite_items', labels.compositeMenu || 'Recipes');
            setNavItemLabel('order_form', labels.orderFormMenu || 'Counter POS');
            setNavItemLabel('sales_report', labels.salesReportMenu || 'Sales & Profit');
            setNavItemLabel('pending_payments', 'Pending Bills');
            setNavItemLabel('customer_credits', 'Credits / Overpayment');
            setNavItemLabel('expenses', labels.expensesMenu || 'Cash Log');
            setNavItemLabel('timecards', 'Time Cards');
            setNavItemLabel('timecards_salary', 'Time Cards With Salary');
            setNavItemLabel('today', "Today's Crew");
            setNavItemLabel('reports', 'Attendance Reports');
            setNavItemLabel('users', 'User Access');
            setNavItemLabel('branches', 'Stores');
            setNavItemLabel('company_profile', 'Brand & Company');
            setNavItemLabel('invoice_template', 'Receipt Template');
            setNavItemLabel('settings', 'Preferences');

            updatePanelDescription('employees', 'Manage crew accounts, roles, and attendance-ready staff profiles for the restaurant team.');
            updatePanelDescription('client_database', 'Keep guest, reseller, and repeat-customer records organized for counter and pickup operations.');
            updatePanelDescription('inventory_manager', 'Maintain the Chow menu lineup, selling prices, and item visuals used by the counter POS.');
            updatePanelDescription('inventory_levels', 'Track ingredients with a restaurant sheet for beginning stock, purchased, used, ending stock, and food cost.');
            updatePanelDescription('sales_inventory_insight', 'Review fast movers, slow movers, and ingredient movement using the restaurant inventory view.');
            updatePanelDescription('composite_items', 'Connect each menu item to its ingredients so every sale deducts stock and snapshots true food cost.');
            updatePanelDescription('order_form', 'Run dine-in, takeout, and pickup orders from a tap-first fast-food counter layout.');
            updatePanelDescription('sales_report', 'Check daily sales, payment mix, food cost, and profit performance for the Chow counter.');
            updatePanelDescription('pending_payments', 'Follow up unpaid and partially paid counter orders without mixing in LBC delivery records.');
            updatePanelDescription('customer_credits', 'Track guest credits, old overpayments, and manual credit adjustments without crowding the POS view.');
            updatePanelDescription('expenses', 'Record cash-outs, petty cash, and operating expenses without leaving the restaurant workspace.');
            updatePanelDescription('timecards', 'Open crew time cards and shift history from the attendance section.');
            updatePanelDescription('timecards_salary', 'Compute crew cutoff pay, daily salary, and attendance deductions from a separate payroll view.');
            updatePanelDescription('today', 'See who is on shift today before the lunch or dinner rush starts.');
            updatePanelDescription('time_in_out', 'Launch the attendance station for quick crew time in and time out actions.');
            updatePanelDescription('reports', 'Generate attendance summaries for payroll, shift review, and compliance.');
            updatePanelDescription('users', 'Control user access for managers, cashiers, and support staff.');
            updatePanelDescription('branches', 'Manage store branches, service availability, and branch-specific setup.');
            updatePanelDescription('company_profile', 'Update the Chow brand, colors, logo, and company-facing details.');
            updatePanelDescription('invoice_template', 'Maintain the receipt layout, business info, and branded output for counter sales.');
            updatePanelDescription('settings', 'Adjust account preferences and restaurant workspace behavior.');
            return;
        }

        if (isAttendanceOnlyWorkspace()) {
            setNavItemLabel('client_database', 'Customers');
            setNavItemLabel('inventory_manager', 'Items');
            setNavItemLabel('inventory_levels', 'Inventory');
            setNavItemLabel('order_form', 'POS');
            setNavItemLabel('sales_report', 'Sales');
            setNavItemLabel('pending_payments', 'Pending Payments');
            setNavItemLabel('customer_credits', 'Credits / Overpayment');
            setNavItemLabel('branches', 'Stores');
            return;
        }

        setNavItemLabel('inventory_manager', inventoryLabel);
        setNavItemLabel('inventory_levels', labels.inventoryLevelsMenu || 'Inventory');
        setNavItemLabel('composite_items', compositeLabel);
        setNavItemLabel('order_form', labels.orderFormMenu || 'Order Form');
        setNavItemLabel('sales_report', labels.salesReportMenu || 'Sales Reports');
        setNavItemLabel('pending_payments', 'Pending Payments');
        setNavItemLabel('customer_credits', 'Credits / Overpayment');
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
        const companyName = String(bootstrap?.company?.app_name || bootstrap?.company?.name || '').trim() || 'Company Workspace';
        const companyCode = String(
            bootstrap?.company?.company_code
            || session?.company_code
            || session?.companyCode
            || ''
        ).trim();
        const normalizedRole = String(session?.role || 'head_admin').trim().toLowerCase();
        const roleLabel = normalizedRole === 'company_admin'
            ? 'Company Admin'
            : (normalizedRole === 'staff'
                ? 'Staff'
                : (normalizedRole === 'employee' ? 'Employee' : 'Head Admin'));
        const enabledModules = Object.entries(bootstrap?.modules || {}).filter(([, isEnabled]) => Boolean(isEnabled));
        const readyPanels = navItems.filter((item) => item.dataset.hidden !== 'true' && item.dataset.disabled !== 'true').length;

        if (workspaceName) {
            workspaceName.textContent = companyName;
        }
        if (workspaceCopy) {
            workspaceCopy.textContent = getWorkspaceSummaryCopy(companyCode);
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

        document.title = `${activeLabel} | ${getDashboardShellName()}`;
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

        const initialPanel = getPreferredWorkspacePanel()
            || getCurrentActivePanel()
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
