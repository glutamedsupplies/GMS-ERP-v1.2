const appClient = window.appClient;
const timeCardBtn = document.getElementById('timeCardBtn');
const timeInOutBtn = document.getElementById('timeInOutBtn');
const settingsBtn = document.getElementById('settingsBtn');
const featureAccessSection = document.getElementById('featureAccessSection');
const featureCards = document.getElementById('featureCards');
const dashboardKicker = document.getElementById('dashboardKicker');
const dashboardTitle = document.getElementById('dashboardTitle');
const dashboardCopy = document.getElementById('dashboardCopy');
const companyBadge = document.getElementById('companyBadge');
const userBadge = document.getElementById('userBadge');
const roleBadge = document.getElementById('roleBadge');
const heroDateLabel = document.getElementById('heroDateLabel');
const coreToolCount = document.getElementById('coreToolCount');
const featureCount = document.getElementById('featureCount');
const workspaceMode = document.getElementById('workspaceMode');
const featureAccessSummary = document.getElementById('featureAccessSummary');

const FEATURE_UI_CONFIG = Object.freeze([
    {
        key: 'order_form',
        module: 'invoicing',
        label: 'Order Form',
        iconClass: 'fa-solid fa-file-invoice',
        description: 'Encode and manage customer orders.',
        path: '/head_admin/order_form.html'
    },
    {
        key: 'expenses',
        module: 'sales',
        label: 'Expenses',
        iconClass: 'fa-solid fa-wallet',
        description: 'Track expense and cash income entries.',
        path: '/head_admin/expenses.html'
    },
    {
        key: 'inventory',
        module: 'inventory',
        label: 'Inventory',
        iconClass: 'fa-solid fa-boxes-stacked',
        description: 'View current stock levels (read-only).',
        path: '/employee/inventory_stock.html'
    },
    {
        key: 'composite',
        module: 'inventory',
        label: 'Composite Items',
        iconClass: 'fa-solid fa-layer-group',
        description: 'Browse composite item references.',
        path: '/head_admin/composite_items.html'
    },
    {
        key: 'lbc_tracking',
        module: 'sales',
        label: 'LBC Tracking',
        iconClass: 'fa-solid fa-truck-fast',
        description: 'Update assigned LBC tracking records.',
        path: '/head_admin/lbc_tracking.html'
    }
]);

initialize();

async function initialize() {
    const session = await appClient.ensureSession({ role: 'employee' });
    if (!session) {
        return;
    }

    const bootstrap = await loadBootstrap();
    bindCoreCards();
    renderWorkspaceOverview(session, bootstrap);
    await renderGrantedFeatureCards(session, bootstrap);
    bindLogoutListener();
}

async function loadBootstrap() {
    try {
        const bootstrap = await appClient.getBootstrap();
        appClient.applyBootstrapBrandTheme(bootstrap);
        return bootstrap || null;
    } catch (error) {
        console.error('Failed to load employee bootstrap:', error);
        return null;
    }
}

function bindCoreCards() {
    if (timeCardBtn) {
        timeCardBtn.addEventListener('click', () => {
            window.location.href = '/employee/time_card.html';
        });
    }

    if (timeInOutBtn) {
        timeInOutBtn.addEventListener('click', () => {
            window.location.href = '/employee/time_in_time_out.html';
        });
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            window.location.href = '/employee/settings.html';
        });
    }
}

function renderWorkspaceOverview(session, bootstrap) {
    const normalizedRole = String(session?.role || '').trim().toLowerCase();
    const isStaffUser = normalizedRole === 'staff';
    const roleLabel = isStaffUser ? 'Staff' : 'Employee';
    const companyName = String(bootstrap?.company?.name || '').trim() || 'Your company';
    const activeModules = Object.values(bootstrap?.modules || {}).filter(Boolean).length;

    if (dashboardKicker) {
        dashboardKicker.textContent = isStaffUser ? 'Shared Staff Workspace' : 'Personal Employee Workspace';
    }
    if (dashboardTitle) {
        dashboardTitle.textContent = isStaffUser ? 'Staff Workspace' : 'Employee Workspace';
    }
    if (dashboardCopy) {
        dashboardCopy.textContent = isStaffUser
            ? 'Move between operational tools faster with a clearer layout that stays readable on phones, tablets, and desktop screens.'
            : 'Keep your attendance, records, and account details in one cleaner workspace built for both desktop and mobile use.';
    }
    if (companyBadge) {
        companyBadge.textContent = companyName;
    }
    if (userBadge) {
        userBadge.textContent = session?.userName ? `Signed in as ${session.userName}` : 'Signed in';
    }
    if (roleBadge) {
        roleBadge.textContent = `${roleLabel} access`;
    }
    if (heroDateLabel) {
        heroDateLabel.textContent = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric'
        });
    }
    if (coreToolCount) {
        coreToolCount.textContent = '3';
    }
    if (workspaceMode) {
        workspaceMode.textContent = isStaffUser ? 'Collaborative' : 'Focused';
    }

    document.title = `${roleLabel} Workspace`;

    if (activeModules && dashboardCopy) {
        dashboardCopy.textContent = `${dashboardCopy.textContent} ${activeModules} plan modules are active for this tenant.`;
    }
}

async function renderGrantedFeatureCards(session, bootstrap = null) {
    if (!featureAccessSection || !featureCards) {
        return;
    }

    featureCards.innerHTML = '';
    featureAccessSection.hidden = true;

    try {
        const modules = (bootstrap && typeof bootstrap.modules === 'object' && !Array.isArray(bootstrap.modules))
            ? bootstrap.modules
            : {};
        const featureAccess = appClient.normalizeUserFeatureAccess(
            bootstrap?.user?.feature_access || session?.feature_access || {}
        );

        const allowedCards = FEATURE_UI_CONFIG.filter((item) => (
            Boolean(modules[item.module])
            && Boolean(featureAccess[item.key])
        ));

        if (!allowedCards.length) {
            return;
        }

        const normalizedRole = String(session?.role || '').trim().toLowerCase();
        const isStaffUser = normalizedRole === 'staff';

        featureCards.innerHTML = allowedCards.map((item) => {
            const isInventoryCard = item.key === 'inventory';
            const targetPath = isInventoryCard && isStaffUser
                ? '/head_admin/inventory_levels.html'
                : item.path;
            const description = isInventoryCard && isStaffUser
                ? 'View and update current stock levels.'
                : item.description;

            return `
                <button type="button" class="action-card feature-card" data-target-path="${targetPath}">
                  <span class="action-icon"><i class="${item.iconClass}"></i></span>
                  <h3 class="action-title">${item.label}</h3>
                  <p class="action-copy">${description}</p>
                  <div class="action-footer">
                    <span>Open module</span>
                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                  </div>
                </button>
            `;
        }).join('');

        Array.from(featureCards.querySelectorAll('button[data-target-path]')).forEach((button) => {
            button.addEventListener('click', () => {
                window.location.href = button.dataset.targetPath;
            });
        });

        if (featureCount) {
            featureCount.textContent = String(allowedCards.length);
        }
        if (featureAccessSummary) {
            featureAccessSummary.innerHTML = `<i class="fa-solid fa-key"></i> ${allowedCards.length} extra tool${allowedCards.length === 1 ? '' : 's'}`;
        }
        featureAccessSection.hidden = false;
    } catch (error) {
        console.error('Failed to render employee feature access cards:', error);
        if (featureCount) {
            featureCount.textContent = '0';
        }
    }
}

function bindLogoutListener() {
    window.addEventListener('message', async (event) => {
        if (event.data === 'logout') {
            await appClient.clearSession();
            window.location.replace('/index.html');
        }
    });
}
