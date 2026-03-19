const path = require('path');
const Database = require('better-sqlite3');

const ROOT_DIR = path.resolve(__dirname, '..');
const MASTER_DB_PATH = path.join(ROOT_DIR, '.runtime-data', 'data', 'master.db');
const COMPANY_CODE = 'chow';
const SOURCE_TAG = 'seed_chow';

const CHOW_VARIANTS = [
    { productName: 'Beef and Mushroom', itemCode: 'CHW-BM', setName: 'M', price: 169, costPrice: 86 },
    { productName: 'Crispy Pork Chop', itemCode: 'CHW-CP', setName: 'M', price: 149, costPrice: 74 },
    { productName: 'Pork Korean Chili', itemCode: 'CHW-PKC', setName: 'M', price: 199, costPrice: 96 },
    { productName: 'Crispy Chicken Tender', itemCode: 'CHW-CCT', setName: 'M', price: 139, costPrice: 63 },
    { productName: 'Angry Pork Belly', itemCode: 'CHW-APB', setName: 'M', price: 159, costPrice: 78 },
    { productName: 'Chicken Curry', itemCode: 'CHW-CC', setName: 'M', price: 199, costPrice: 89 },
    { productName: 'Beef Supreme', itemCode: 'CHW-BS', setName: 'M', price: 199, costPrice: 102 },
    { productName: 'Pork Tenders', itemCode: 'CHW-PT', setName: 'M', price: 149, costPrice: 72 },
    { productName: 'Chowjin Rice', itemCode: 'CHW-CJR', setName: 'M', price: 199, costPrice: 108 },
    { productName: 'Chow Fan', itemCode: 'CHW-CF', setName: 'M', price: 99, costPrice: 44 },
    { productName: 'Jumbo Sharks Fin Siomai', itemCode: 'CHW-SFS', setName: 'T', price: 49, costPrice: 20 },
    { productName: 'Jumbo Pork Beef Siomai', itemCode: 'CHW-PBS', setName: 'T', price: 49, costPrice: 18 },
    { productName: 'Jumbo Japanese Siomai', itemCode: 'CHW-JPS', setName: 'T', price: 49, costPrice: 19 }
];

const CHOW_COMPOSITES = [
    recipe('Beef and Mushroom', 'CHW-BM', 'M', [
        part('Garlic Rice Base', 1),
        part('Fried Egg', 1),
        part('Pickled Radish', 1),
        part('Beef Mushroom Topping', 1)
    ]),
    recipe('Crispy Pork Chop', 'CHW-CP', 'M', [
        part('Garlic Rice Base', 1),
        part('Fried Egg', 1),
        part('Pickled Radish', 1),
        part('Crispy Pork Chop Cut', 1)
    ]),
    recipe('Pork Korean Chili', 'CHW-PKC', 'M', [
        part('Garlic Rice Base', 1),
        part('Fried Egg', 1),
        part('Pickled Radish', 1),
        part('Pork Korean Chili Topping', 1)
    ]),
    recipe('Crispy Chicken Tender', 'CHW-CCT', 'M', [
        part('Garlic Rice Base', 1),
        part('Fried Egg', 1),
        part('Pickled Radish', 1),
        part('Crispy Chicken Tender Pieces', 1)
    ]),
    recipe('Angry Pork Belly', 'CHW-APB', 'M', [
        part('Garlic Rice Base', 1),
        part('Fried Egg', 1),
        part('Pickled Radish', 1),
        part('Angry Pork Belly Topping', 1)
    ]),
    recipe('Chicken Curry', 'CHW-CC', 'M', [
        part('Steamed Rice Base', 1),
        part('Fried Egg', 1),
        part('Pickled Radish', 1),
        part('Chicken Curry Topping', 1)
    ]),
    recipe('Beef Supreme', 'CHW-BS', 'M', [
        part('Garlic Rice Base', 1),
        part('Fried Egg', 1),
        part('Pickled Radish', 1),
        part('Beef Supreme Topping', 1)
    ]),
    recipe('Pork Tenders', 'CHW-PT', 'M', [
        part('Garlic Rice Base', 1),
        part('Fried Egg', 1),
        part('Pickled Radish', 1),
        part('Pork Tenders Topping', 1)
    ]),
    recipe('Chowjin Rice', 'CHW-CJR', 'M', [
        part('Steamed Rice Base', 2),
        part('Fried Egg', 1),
        part('Pickled Radish', 2),
        part('Chowjin Sauce Base', 1)
    ]),
    recipe('Chow Fan', 'CHW-CF', 'M', [
        part('Chow Fan Rice Mix', 1),
        part('Fried Egg', 1),
        part('Pickled Radish', 1)
    ]),
    recipe('Jumbo Sharks Fin Siomai', 'CHW-SFS', 'T', [
        part('Sharks Fin Siomai', 1)
    ]),
    recipe('Jumbo Pork Beef Siomai', 'CHW-PBS', 'T', [
        part('Pork Beef Siomai', 1)
    ]),
    recipe('Jumbo Japanese Siomai', 'CHW-JPS', 'T', [
        part('Japanese Siomai', 1)
    ])
];

const CHOW_COMPONENT_STOCK = {
    'Garlic Rice Base': 160,
    'Steamed Rice Base': 120,
    'Fried Egg': 180,
    'Pickled Radish': 220,
    'Beef Mushroom Topping': 60,
    'Crispy Pork Chop Cut': 70,
    'Pork Korean Chili Topping': 55,
    'Crispy Chicken Tender Pieces': 90,
    'Angry Pork Belly Topping': 65,
    'Chicken Curry Topping': 58,
    'Beef Supreme Topping': 45,
    'Pork Tenders Topping': 72,
    'Chowjin Sauce Base': 38,
    'Chow Fan Rice Mix': 84,
    'Sharks Fin Siomai': 120,
    'Pork Beef Siomai': 120,
    'Japanese Siomai': 120
};

function part(name, quantity, unit = 'Pcs') {
    return { name, quantity, unit };
}

function recipe(productName, itemCode, itemSet, components) {
    return { productName, itemCode, itemSet, components };
}

function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeSet(value) {
    return normalizeText(value).toUpperCase();
}

function buildHelper(itemCode, setName) {
    return [normalizeText(itemCode), normalizeSet(setName)].filter(Boolean).join(' | ');
}

function readWorkspaceConfig(db) {
    const row = db.prepare(`
        SELECT value
        FROM tenant_meta
        WHERE key = 'workspace_config'
        LIMIT 1
    `).get();

    if (!row?.value) {
        return {};
    }

    try {
        const parsed = JSON.parse(row.value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function writeWorkspaceConfig(db, nextConfig) {
    db.prepare(`
        INSERT INTO tenant_meta (key, value)
        VALUES ('workspace_config', ?)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value
    `).run(JSON.stringify(nextConfig));
}

function upsertVariant(db, variant) {
    const existing = db.prepare(`
        SELECT id
        FROM inventory_variants
        WHERE LOWER(product_name) = LOWER(?)
          AND LOWER(set_name) = LOWER(?)
        LIMIT 1
    `).get(variant.productName, variant.setName);

    if (existing) {
        db.prepare(`
            UPDATE inventory_variants
            SET item_code = ?,
                price = ?,
                cost_price = ?,
                source = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            variant.itemCode,
            Number(variant.price || 0),
            Number(variant.costPrice || 0),
            SOURCE_TAG,
            existing.id
        );
    } else {
        db.prepare(`
            INSERT INTO inventory_variants (
                product_name, item_code, set_name, price, cost_price, source
            ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            variant.productName,
            variant.itemCode,
            variant.setName,
            Number(variant.price || 0),
            Number(variant.costPrice || 0),
            SOURCE_TAG
        );
    }

    const helper = buildHelper(variant.itemCode, variant.setName);
    const existingCatalog = db.prepare(`
        SELECT id
        FROM product_catalog
        WHERE LOWER(product_name) = LOWER(?)
          AND LOWER(item_set) = LOWER(?)
        LIMIT 1
    `).get(variant.productName, variant.setName);

    if (existingCatalog) {
        db.prepare(`
            UPDATE product_catalog
            SET item_code = ?,
                helper = ?,
                price = ?,
                source = ?
            WHERE id = ?
        `).run(
            variant.itemCode,
            helper,
            Number(variant.price || 0),
            SOURCE_TAG,
            existingCatalog.id
        );
    } else {
        db.prepare(`
            INSERT INTO product_catalog (
                product_name, item_code, item_set, helper, price, source
            ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            variant.productName,
            variant.itemCode,
            variant.setName,
            helper,
            Number(variant.price || 0),
            SOURCE_TAG
        );
    }
}

function upsertComposite(db, composite) {
    db.prepare(`
        DELETE FROM composite_components
        WHERE LOWER(product_name) = LOWER(?)
          AND LOWER(item_set) = LOWER(?)
    `).run(composite.productName, composite.itemSet);

    const insertComponent = db.prepare(`
        INSERT INTO composite_components (
            product_name,
            item_code,
            item_set,
            component_name,
            component_quantity,
            component_unit,
            source,
            import_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    composite.components.forEach((component, index) => {
        insertComponent.run(
            composite.productName,
            composite.itemCode,
            composite.itemSet,
            component.name,
            Number(component.quantity || 0),
            normalizeText(component.unit || 'Pcs') || 'Pcs',
            SOURCE_TAG,
            [
                SOURCE_TAG,
                composite.itemCode,
                composite.itemSet,
                index + 1,
                normalizeText(component.name)
            ].join('::')
        );
    });
}

function getOrCreateInventoryItem(db, itemName, inventoryUnit = 'Pcs') {
    const normalizedName = normalizeText(itemName);
    const normalizedUnit = normalizeText(inventoryUnit) || 'Pcs';
    const existing = db.prepare(`
        SELECT id
        FROM inventory_items
        WHERE LOWER(item_name) = LOWER(?)
          AND LOWER(inventory_unit) = LOWER(?)
        LIMIT 1
    `).get(normalizedName, normalizedUnit);

    if (existing) {
        return existing.id;
    }

    const inserted = db.prepare(`
        INSERT INTO inventory_items (item_name, inventory_unit, item_type, source)
        VALUES (?, ?, 'component', ?)
    `).run(normalizedName, normalizedUnit, SOURCE_TAG);
    return inserted.lastInsertRowid;
}

function upsertInventoryLevel(db, branchName, inventoryItemId, quantity) {
    db.prepare(`
        INSERT INTO inventory_levels (
            branch,
            inventory_item_id,
            quantity,
            expiration_date,
            source,
            updated_at
        ) VALUES (?, ?, ?, NULL, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(branch, inventory_item_id) DO UPDATE SET
            quantity = excluded.quantity,
            source = excluded.source,
            updated_at = CURRENT_TIMESTAMP
    `).run(branchName, inventoryItemId, Number(quantity || 0), SOURCE_TAG);
}

function upsertClient(db, clientName) {
    const normalizedName = normalizeText(clientName);
    if (!normalizedName) {
        return;
    }

    const existing = db.prepare(`
        SELECT id
        FROM clients
        WHERE LOWER(name) = LOWER(?)
        LIMIT 1
    `).get(normalizedName);

    if (existing) {
        db.prepare(`
            UPDATE clients
            SET source = ?
            WHERE id = ?
        `).run(SOURCE_TAG, existing.id);
        return;
    }

    db.prepare(`
        INSERT INTO clients (
            name,
            contact_number,
            normalized_contact_number,
            address,
            source
        ) VALUES (?, '', '', '', ?)
    `).run(normalizedName, SOURCE_TAG);
}

function buildWorkspaceConfig(currentConfig, branches, admins) {
    const currentLabels = currentConfig?.labels && typeof currentConfig.labels === 'object' ? currentConfig.labels : {};
    const currentMenu = currentConfig?.menu && typeof currentConfig.menu === 'object' ? currentConfig.menu : {};
    const currentOrderForm = currentConfig?.orderForm && typeof currentConfig.orderForm === 'object' ? currentConfig.orderForm : {};
    const currentSalesReport = currentConfig?.salesReport && typeof currentConfig.salesReport === 'object' ? currentConfig.salesReport : {};
    const currentExpenses = currentConfig?.expenses && typeof currentConfig.expenses === 'object' ? currentConfig.expenses : {};
    const currentShell = currentConfig?.shell && typeof currentConfig.shell === 'object' ? currentConfig.shell : {};
    const currentVisibleFields = currentOrderForm?.visibleFields && typeof currentOrderForm.visibleFields === 'object'
        ? currentOrderForm.visibleFields
        : {};

    return {
        ...currentConfig,
        experience: {
            ...(currentConfig?.experience || {}),
            mode: 'default'
        },
        shell: {
            ...currentShell,
            variant: 'restaurant_chow',
            appShellName: 'Chow Control',
            workspaceTag: 'Restaurant Workspace',
            workspaceCopy: 'Counter POS, menu recipes, ingredient stock sheet, crew attendance, and store setup all stay inside this Chow shell.'
        },
        menu: {
            showInvoiceSummary: Boolean(currentMenu.showInvoiceSummary),
            showCustomerRequests: Boolean(currentMenu.showCustomerRequests),
            showInventoryLevels: true
        },
        labels: {
            ...currentLabels,
            inventoryMenu: 'Menu Items',
            inventoryPageTitle: 'Menu Items',
            inventoryPageCopy: 'Maintain the Chow 2 Go menu board, selling prices, and cost snapshots used by the counter POS.',
            inventoryLevelsMenu: 'Ingredients Stock',
            inventoryLevelsPageTitle: 'Ingredients Stock',
            compositeMenu: 'Recipes',
            compositePageTitle: 'Recipes',
            orderFormMenu: 'Counter POS',
            orderFormTitle: 'Chow 2 Go Counter POS',
            orderFormCopy: 'Tap menu cards for fast counter sales, keep the manual editor for special requests, and let recipes handle inventory deduction.',
            orderDetailsTitle: 'Counter Details',
            orderItemsTitle: 'Fast-Food Cart',
            orderParseButton: 'Parse Text',
            orderAddItemButton: 'Manual Line',
            orderSubmitButton: 'Save Sale',
            salesReportMenu: 'Sales & Profit',
            salesReportTitle: 'Sales and Profit Report',
            salesReportCopy: 'Track daily sales, profit, payment mix, and item performance for the Chow counter.',
            expensesMenu: currentLabels.expensesMenu || 'Expenses and Cash Income',
            expensesPageTitle: currentLabels.expensesPageTitle || 'Expenses and Cash Income'
        },
        orderForm: {
            ...currentOrderForm,
            branches,
            cashBranches: branches,
            couriers: ['Dine-In', 'Takeout', 'Grab Pickup', 'Foodpanda'],
            admins,
            salesRepresentatives: ['Counter Staff', 'Manager'],
            paymentMethods: ['CASH', 'GCash', 'Maya', 'Card'],
            visibleFields: {
                ...currentVisibleFields,
                quickPaste: false,
                cashBranch: false,
                salesRepresentative: false,
                deliveryFee: false,
                note: true
            }
        },
        salesReport: {
            ...currentSalesReport,
            showCashBranchFilter: true,
            showPaymentFilter: true,
            showAdminFilter: true,
            showSalesRepresentativeFilter: true
        },
        expenses: {
            ...currentExpenses
        }
    };
}

function main() {
    const masterDb = new Database(MASTER_DB_PATH, { readonly: true });
    const company = masterDb.prepare(`
        SELECT id, name, company_code
        FROM companies
        WHERE LOWER(company_code) = LOWER(?)
        LIMIT 1
    `).get(COMPANY_CODE);

    if (!company) {
        throw new Error(`Company code "${COMPANY_CODE}" was not found in master.db.`);
    }

    const tenantDbPath = path.join(ROOT_DIR, '.runtime-data', 'data', 'tenants', `${company.id}.db`);
    const tenantDb = new Database(tenantDbPath);
    const branches = tenantDb.prepare(`
        SELECT branch_name
        FROM branches
        WHERE is_active = 1
        ORDER BY branch_name COLLATE NOCASE
    `).all().map((row) => normalizeText(row.branch_name)).filter(Boolean);
    const admins = masterDb.prepare(`
        SELECT COALESCE(NULLIF(display_name, ''), username) AS label
        FROM users
        WHERE company_id = ?
          AND is_active = 1
        ORDER BY created_at ASC
    `).all(company.id).map((row) => normalizeText(row.label)).filter(Boolean);
    const currentWorkspaceConfig = readWorkspaceConfig(tenantDb);
    const nextWorkspaceConfig = buildWorkspaceConfig(
        currentWorkspaceConfig,
        branches.length ? branches : ['Main Branch'],
        admins.length ? admins : ['Chow123']
    );

    const componentNames = new Set();
    CHOW_COMPOSITES.forEach((composite) => {
        composite.components.forEach((component) => componentNames.add(normalizeText(component.name)));
    });

    tenantDb.transaction(() => {
        CHOW_VARIANTS.forEach((variant) => upsertVariant(tenantDb, variant));
        CHOW_COMPOSITES.forEach((composite) => upsertComposite(tenantDb, composite));

        const inventoryItemIds = new Map();
        Array.from(componentNames).forEach((componentName) => {
            const inventoryItemId = getOrCreateInventoryItem(tenantDb, componentName, 'Pcs');
            inventoryItemIds.set(componentName, inventoryItemId);
        });

        (branches.length ? branches : ['Main Branch']).forEach((branchName) => {
            inventoryItemIds.forEach((inventoryItemId, componentName) => {
                const quantity = CHOW_COMPONENT_STOCK[componentName] || 0;
                upsertInventoryLevel(tenantDb, branchName, inventoryItemId, quantity);
            });
        });

        upsertClient(tenantDb, 'Walk-in Customer');
        writeWorkspaceConfig(tenantDb, nextWorkspaceConfig);
    })();

    const summary = {
        company: {
            id: company.id,
            name: company.name,
            companyCode: company.company_code
        },
        tenantDbPath,
        branches: branches.length ? branches : ['Main Branch'],
        variantsSeeded: CHOW_VARIANTS.length,
        compositeRecipesSeeded: CHOW_COMPOSITES.length,
        componentStockItemsSeeded: Object.keys(CHOW_COMPONENT_STOCK).length,
        admins: admins.length ? admins : ['Chow123']
    };

    console.log(JSON.stringify(summary, null, 2));
}

try {
    main();
} catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
}
