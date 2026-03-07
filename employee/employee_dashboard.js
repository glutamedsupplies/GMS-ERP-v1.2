const appClient = window.appClient;
const timeCardBtn = document.getElementById('timeCardBtn');
const timeInOutBtn = document.getElementById('timeInOutBtn');
const settingsBtn = document.getElementById('settingsBtn');
const featureAccessSection = document.getElementById('featureAccessSection');
const featureCards = document.getElementById('featureCards');

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

    bindCoreCards();
    await renderGrantedFeatureCards(session);
    bindLogoutListener();
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

async function renderGrantedFeatureCards(session) {
    if (!featureAccessSection || !featureCards) {
        return;
    }

    featureCards.innerHTML = '';
    featureAccessSection.hidden = true;

    try {
        const bootstrap = await appClient.getBootstrap();
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
            <button type="button" class="card feature-card" data-target-path="${targetPath}">
              <i class="${item.iconClass}"></i>
              <h3>${item.label}</h3>
              <p>${description}</p>
            </button>
        `;
        }).join('');

        Array.from(featureCards.querySelectorAll('button[data-target-path]')).forEach((button) => {
            button.addEventListener('click', () => {
                window.location.href = button.dataset.targetPath;
            });
        });

        featureAccessSection.hidden = false;
    } catch (error) {
        console.error('Failed to render employee feature access cards:', error);
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
