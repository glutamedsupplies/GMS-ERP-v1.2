const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const sqliteStore = require('./sqlite');
const inventoryVariantStore = require('./inventory-variants-store');

const ROOT_DIR = path.resolve(__dirname, '..');
let BRANCHES = [];
const SET_OPTIONS = ['M', 'P', 'P W C', 'T', 'D B 100', 'D B 50', 'D C 100', 'D C 50', 'D B', 'D C'];
const ADMIN_OPTIONS = [];
const SALES_REP_OPTIONS = [];
const CLIENT_DB_SALES_REP_OPTIONS = [];
const PAYMENT_METHOD_OPTIONS = ['CASH', 'LBC Collection'];
const PAYMENT_TYPE_OPTIONS = ['Full Paid', 'Partial'];
const ZERO_AMOUNT_PAYMENT_METHODS = ['LBC Collection'];
const CASH_INCOME_STATUS_OPTIONS = ['Pending', 'Confirmed', 'Cancelled'];
const CASH_INCOME_KIND_OPTIONS = ['sales_cash', 'lalamove_cod', 'lalamove_cash'];
const ORDER_STATUS_OPTIONS = ['Pending', 'Packed', 'Shipped', 'Completed', 'Cancelled'];
const COURIER_OPTIONS = ['LBC', 'Lalamove', 'Meet-Up', 'Client Book', 'J&T', 'Victory Liner', 'Toktok', 'AP Cargo', 'SPX', 'Ninja Van'];
const LBC_TRACKING_BRANCHES = ['Pampanga', 'Cubao'];
const LBC_TRACKING_STATUS_OPTIONS = [
    'Delivered',
    'In Transit',
    'RTS',
    'RTO',
    'W/ Concern',
    'Out for Delivery',
    'Pending',
    'Ready for Pick-up',
    'In Transfer',
    'Re-Deliver',
    'Pending for Pick-Up',
    'Delivery Attempt Failed',
    'Payment Issue During Delivery',
    'On Hold'
];
const LBC_TRACKING_STATUS_ALIASES = Object.freeze({
    'in transit': 'In Transit',
    intransit: 'In Transit',
    transit: 'In Transit',
    shipped: 'In Transit',
    packed: 'In Transit',
    'shipment picked up': 'In Transit',
    delivered: 'Delivered',
    completed: 'Delivered',
    rts: 'RTS',
    'returned to sender': 'RTS',
    'return to sender': 'RTS',
    rto: 'RTO',
    'return to origin': 'RTO',
    'returned to origin': 'RTO',
    cancelled: 'RTO',
    canceled: 'RTO',
    'w/concern': 'W/ Concern',
    'w concern': 'W/ Concern',
    'with concern': 'W/ Concern',
    concern: 'W/ Concern',
    'out for delivery': 'Out for Delivery',
    pending: 'Pending',
    'ready for pick-up': 'Ready for Pick-up',
    'ready for pick up': 'Ready for Pick-up',
    'ready for pickup': 'Ready for Pick-up',
    'in transfer': 'In Transfer',
    transferred: 'In Transfer',
    're-deliver': 'Re-Deliver',
    're deliver': 'Re-Deliver',
    redeliver: 'Re-Deliver',
    'pending for pick-up': 'Pending for Pick-Up',
    'pending for pick up': 'Pending for Pick-Up',
    'pending for pickup': 'Pending for Pick-Up',
    'delivery attempt failed': 'Delivery Attempt Failed',
    'attempt failed': 'Delivery Attempt Failed',
    'failed delivery': 'Delivery Attempt Failed',
    failed: 'Delivery Attempt Failed',
    'not delivered': 'Delivery Attempt Failed',
    undelivered: 'Delivery Attempt Failed',
    'payment issue during delivery': 'Payment Issue During Delivery',
    'payment issue': 'Payment Issue During Delivery',
    'payment problem': 'Payment Issue During Delivery',
    'on hold': 'On Hold',
    hold: 'On Hold'
});
const LBC_IN_TRANSIT_STATUS_SET = new Set([
    'In Transit',
    'Out for Delivery',
    'Pending',
    'Ready for Pick-up',
    'In Transfer',
    'Re-Deliver',
    'Pending for Pick-Up'
]);
const LBC_CONCERN_STATUS_SET = new Set([
    'W/ Concern',
    'Delivery Attempt Failed',
    'Payment Issue During Delivery',
    'On Hold'
]);
const LBC_SHIPMENT_STAGE_OPTIONS = ['Pending Packing', 'Packed', 'Handed to Courier', 'In Transit', 'Delivered', 'RTS', 'RTO'];
const LBC_QUICK_FILTER_OPTIONS = ['all', 'in_transit', 'delivered', 'rts', 'rto', 'no_tracking', 'pending_shipment'];
const LBC_CARRIER_STATUS_OPTIONS = ['Delivered', 'In Transit', 'Shipment Picked Up', 'Returned to Sender', 'Return to Origin'];
const LBC_COLLECTION_STATUS_OPTIONS = ['Pending', 'Confirmed'];
const LBC_TRACKING_NUMBER_REGEX = /^[A-Za-z0-9]{1,12}$/;
const PAYMENT_OPTIONS = PAYMENT_METHOD_OPTIONS;
const PROCESSING_FILE_NAME = 'February 2026 - PROCESSING.csv';
const INVENTORY_FILE_NAME = 'February 2026 - INVENTORY.csv';
const COMPOSITE_FILE_NAME = 'February 2026 - COMPOSITE ITEM.csv';
const SERVICE_KEYWORDS = ['FEE', 'OVERPAYMENT', 'DELIVERY', 'SHIPPING', 'APPLIED OVERPAYMENT'];
const PIECE_KEYWORDS = ['PNSS', 'SYRINGE', 'BUTTERFLY', 'MACROSET', 'CANNULA', 'STERILE WATER', 'VITAMIN C'];

const seedPathMap = {
    processing: buildSeedPathCandidates(PROCESSING_FILE_NAME, process.env.ATTENDANCE_PROCESSING_CSV),
    inventory: buildSeedPathCandidates(INVENTORY_FILE_NAME, process.env.ATTENDANCE_INVENTORY_CSV),
    composite: buildSeedPathCandidates(COMPOSITE_FILE_NAME, process.env.ATTENDANCE_COMPOSITE_CSV)
};

const schemaReadyDbs = new WeakSet();
const seedSyncCompleteDbs = new WeakSet();
const autoCashIncomeBackfillCompleteDbs = new WeakSet();
const inventoryMaintenanceCompleteDbs = new WeakSet();

function buildSeedPathCandidates(fileName, envOverride) {
    return [
        envOverride || '',
        path.join(ROOT_DIR, 'head_admin', 'data', fileName),
        path.join(ROOT_DIR, fileName),
        path.join(os.homedir(), 'Downloads', fileName)
    ].filter(Boolean);
}

function getSeedPath(type) {
    return (seedPathMap[type] || []).find((candidate) => fs.existsSync(candidate)) || '';
}

function isAutoSeedEnabled() {
    const rawValue = String(process.env.ATTENDANCE_AUTO_SEED || '').trim().toLowerCase();
    return rawValue === '1' || rawValue === 'true' || rawValue === 'yes';
}

function getBranchOptions() {
    try {
        const rows = sqliteStore.listBranches?.() || [];
        const names = rows
            .filter((row) => row && row.is_active !== false)
            .map((row) => normalizeText(row.branch_name || row.name || row.branch))
            .filter(Boolean);
        if (names.length) {
            BRANCHES = names;
            return BRANCHES;
        }
    } catch (_error) {
        // Fall back to cached/default branch options when context is not ready.
    }

    if (!BRANCHES.length) {
        BRANCHES = ['Main Branch'];
    }

    return BRANCHES;
}

function getDb() {
    sqliteStore.ensureSystemReady?.();
    getBranchOptions();
    const db = sqliteStore.getTenantDb();
    if (db.__isPostgresCompat) {
        schemaReady = true;
    } else {
        ensureSchema(db);
    }
    syncSeedData(db);
    ensureInventoryItemMaintenance(db);
    // Keep inventory rows aligned with the current catalog/composite data
    // even when CSV auto-seeding is disabled.
    syncInventoryItems(db);
    syncInventoryLevels(db);
    backfillLinkedCashIncomeEntries(db);
    return db;
}

function ensureSchema(db) {
    if (schemaReadyDbs.has(db)) {
        return;
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS product_catalog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_name TEXT NOT NULL,
            item_code TEXT NOT NULL,
            item_set TEXT NOT NULL,
            helper TEXT NOT NULL UNIQUE,
            price REAL NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'manual',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS composite_components (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_name TEXT NOT NULL,
            item_code TEXT NOT NULL,
            item_set TEXT NOT NULL,
            component_name TEXT NOT NULL,
            component_quantity REAL NOT NULL DEFAULT 0,
            component_unit TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'manual',
            import_key TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS inventory_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_name TEXT NOT NULL,
            inventory_unit TEXT NOT NULL,
            item_type TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'manual',
            UNIQUE(item_name, inventory_unit)
        );

        CREATE TABLE IF NOT EXISTS inventory_levels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            branch TEXT NOT NULL,
            inventory_item_id INTEGER NOT NULL,
            quantity REAL NOT NULL DEFAULT 0,
            expiration_date TEXT,
            source TEXT NOT NULL DEFAULT 'manual',
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(branch, inventory_item_id),
            FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id)
        );

        CREATE TABLE IF NOT EXISTS sales_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_date TEXT NOT NULL,
            branch TEXT NOT NULL,
            cash_branch TEXT,
            courier TEXT NOT NULL,
            admin_name TEXT NOT NULL,
            sales_representative TEXT NOT NULL,
            client_name TEXT NOT NULL,
            client_code TEXT,
            item_sold TEXT NOT NULL,
            item_code TEXT,
            item_set TEXT,
            helper TEXT,
            quantity REAL NOT NULL DEFAULT 1,
            unit_price REAL NOT NULL DEFAULT 0,
            line_subtotal REAL NOT NULL DEFAULT 0,
            order_total REAL NOT NULL DEFAULT 0,
            payment_option TEXT,
            payment_amount REAL NOT NULL DEFAULT 0,
            collection_amount REAL NOT NULL DEFAULT 0,
            opayment TEXT,
            upayment TEXT,
            note TEXT,
            source TEXT NOT NULL DEFAULT 'manual',
            import_key TEXT UNIQUE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS expense_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            expense_date TEXT NOT NULL,
            branch TEXT NOT NULL,
            about TEXT NOT NULL,
            amount REAL NOT NULL DEFAULT 0,
            note TEXT,
            source TEXT NOT NULL DEFAULT 'manual',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS cash_income_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            income_date TEXT NOT NULL,
            branch TEXT NOT NULL,
            about TEXT NOT NULL,
            amount REAL NOT NULL DEFAULT 0,
            note TEXT,
            source TEXT NOT NULL DEFAULT 'manual',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS lbc_tracking_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_key TEXT NOT NULL UNIQUE,
            order_number TEXT,
            receipt_number TEXT,
            branch TEXT NOT NULL,
            assigned_user_id TEXT,
            assigned_to TEXT,
            tracking_number TEXT,
            amount_to_collect REAL NOT NULL DEFAULT 0,
            delivery_status TEXT NOT NULL DEFAULT 'In Transit',
            collection_status TEXT NOT NULL DEFAULT 'Pending',
            collection_confirmed_by TEXT,
            collection_confirmed_at TEXT,
            date_monitored TEXT,
            updated_by TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_product_catalog_name
        ON product_catalog (product_name);

        CREATE INDEX IF NOT EXISTS idx_product_catalog_code_set
        ON product_catalog (item_code, item_set);

        CREATE INDEX IF NOT EXISTS idx_composite_components_parent
        ON composite_components (product_name, item_code, item_set);

        CREATE INDEX IF NOT EXISTS idx_inventory_items_name
        ON inventory_items (item_name);

        CREATE INDEX IF NOT EXISTS idx_inventory_levels_branch
        ON inventory_levels (branch);

        CREATE INDEX IF NOT EXISTS idx_sales_entries_sale_date
        ON sales_entries (sale_date);

        CREATE INDEX IF NOT EXISTS idx_sales_entries_branch
        ON sales_entries (branch);

        CREATE INDEX IF NOT EXISTS idx_expense_entries_date
        ON expense_entries (expense_date);

        CREATE INDEX IF NOT EXISTS idx_expense_entries_branch
        ON expense_entries (branch);

        CREATE INDEX IF NOT EXISTS idx_cash_income_entries_date
        ON cash_income_entries (income_date);

        CREATE INDEX IF NOT EXISTS idx_cash_income_entries_branch
        ON cash_income_entries (branch);

        CREATE INDEX IF NOT EXISTS idx_lbc_tracking_entries_branch
        ON lbc_tracking_entries (branch);

        CREATE INDEX IF NOT EXISTS idx_lbc_tracking_entries_status
        ON lbc_tracking_entries (delivery_status);
    `);

    ensureTableColumn(db, 'inventory_levels', 'expiration_date', 'TEXT');
    ensureTableColumn(db, 'sales_entries', 'receipt_number', 'TEXT');
    ensureTableColumn(db, 'sales_entries', 'line_index', 'INTEGER NOT NULL DEFAULT 1');
    ensureTableColumn(db, 'sales_entries', 'client_contact', 'TEXT');
    ensureTableColumn(db, 'sales_entries', 'client_address', 'TEXT');
    ensureTableColumn(db, 'sales_entries', 'delivery_label', 'TEXT');
    ensureTableColumn(db, 'sales_entries', 'entry_unit', 'TEXT');
    ensureTableColumn(db, 'sales_entries', 'order_number', 'TEXT');
    ensureTableColumn(db, 'sales_entries', 'order_status', "TEXT NOT NULL DEFAULT 'Pending'");
    ensureTableColumn(db, 'sales_entries', 'payment_type', "TEXT NOT NULL DEFAULT 'Full Paid'");
    ensureTableColumn(db, 'sales_entries', 'payment_method', 'TEXT');
    ensureTableColumn(db, 'sales_entries', 'payment_method_breakdown', 'TEXT');
    ensureTableColumn(db, 'sales_entries', 'cash_branch', 'TEXT');
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sales_entries_cash_branch
        ON sales_entries (cash_branch)
    `);
    ensureTableColumn(db, 'sales_entries', 'base_total', 'REAL NOT NULL DEFAULT 0');
    ensureTableColumn(db, 'sales_entries', 'delivery_fee', 'REAL NOT NULL DEFAULT 0');
    ensureTableColumn(db, 'sales_entries', 'delivery_fee_to_collect', 'INTEGER NOT NULL DEFAULT 0');
    ensureTableColumn(db, 'sales_entries', 'overpayment_amount', 'REAL NOT NULL DEFAULT 0');
    ensureTableColumn(db, 'sales_entries', 'underpayment_amount', 'REAL NOT NULL DEFAULT 0');
    ensureTableColumn(db, 'sales_entries', 'inventory_deducted', 'INTEGER NOT NULL DEFAULT 1');
    ensureTableColumn(db, 'cash_income_entries', 'linked_order_number', 'TEXT');
    ensureTableColumn(db, 'cash_income_entries', 'linked_receipt_number', 'TEXT');
    ensureTableColumn(db, 'cash_income_entries', 'auto_generated', 'INTEGER NOT NULL DEFAULT 0');
    ensureTableColumn(db, 'cash_income_entries', 'confirmation_status', "TEXT NOT NULL DEFAULT 'Confirmed'");
    ensureTableColumn(db, 'cash_income_entries', 'income_kind', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'lbc_tracking_entries', 'order_number', 'TEXT');
    ensureTableColumn(db, 'lbc_tracking_entries', 'receipt_number', 'TEXT');
    ensureTableColumn(db, 'lbc_tracking_entries', 'assigned_user_id', 'TEXT');
    ensureTableColumn(db, 'lbc_tracking_entries', 'assigned_to', 'TEXT');
    ensureTableColumn(db, 'lbc_tracking_entries', 'tracking_number', 'TEXT');
    ensureTableColumn(db, 'lbc_tracking_entries', 'amount_to_collect', 'REAL NOT NULL DEFAULT 0');
    ensureTableColumn(db, 'lbc_tracking_entries', 'delivery_status', "TEXT NOT NULL DEFAULT 'In Transit'");
    ensureTableColumn(db, 'lbc_tracking_entries', 'collection_status', "TEXT NOT NULL DEFAULT 'Pending'");
    ensureTableColumn(db, 'lbc_tracking_entries', 'collection_confirmed_by', 'TEXT');
    ensureTableColumn(db, 'lbc_tracking_entries', 'collection_confirmed_at', 'TEXT');
    ensureTableColumn(db, 'lbc_tracking_entries', 'date_monitored', 'TEXT');
    ensureTableColumn(db, 'lbc_tracking_entries', 'updated_by', 'TEXT');
    ensureTableColumn(db, 'lbc_tracking_entries', 'created_at', 'TEXT');
    ensureTableColumn(db, 'lbc_tracking_entries', 'updated_at', 'TEXT');
    db.prepare(`
        UPDATE sales_entries
        SET cash_branch = branch
        WHERE TRIM(COALESCE(cash_branch, '')) = ''
    `).run();
    db.prepare(`
        UPDATE sales_entries
        SET inventory_deducted = 1
        WHERE inventory_deducted IS NULL
    `).run();
    db.prepare(`
        UPDATE cash_income_entries
        SET confirmation_status = 'Confirmed'
        WHERE TRIM(COALESCE(confirmation_status, '')) = ''
    `).run();
    db.prepare(`
        UPDATE cash_income_entries
        SET income_kind = 'lalamove_cod'
        WHERE auto_generated = 1
          AND TRIM(COALESCE(income_kind, '')) = ''
          AND UPPER(TRIM(COALESCE(about, ''))) LIKE 'LALAMOVE/%'
    `).run();
    db.prepare(`
        UPDATE cash_income_entries
        SET about = REPLACE(about, 'LALAMOVE/', 'LALAMOVE COD/')
        WHERE auto_generated = 1
          AND LOWER(COALESCE(income_kind, '')) = 'lalamove_cod'
          AND UPPER(TRIM(COALESCE(about, ''))) LIKE 'LALAMOVE/%'
          AND UPPER(TRIM(COALESCE(about, ''))) NOT LIKE 'LALAMOVE COD/%'
          AND UPPER(TRIM(COALESCE(about, ''))) NOT LIKE 'LALAMOVE CASH/%'
    `).run();
    db.prepare(`
        UPDATE lbc_tracking_entries
        SET collection_status = 'Pending'
        WHERE TRIM(COALESCE(collection_status, '')) = ''
    `).run();
    db.prepare(`
        UPDATE lbc_tracking_entries
        SET collection_status = 'Pending',
            collection_confirmed_by = '',
            collection_confirmed_at = ''
        WHERE LOWER(TRIM(COALESCE(delivery_status, ''))) != 'delivered'
    `).run();
    db.prepare(`
        DELETE FROM cash_income_entries
        WHERE auto_generated = 1
          AND (
            LOWER(COALESCE(income_kind, '')) = 'lbc_collection'
            OR UPPER(TRIM(COALESCE(about, ''))) LIKE 'LBC/%'
          )
    `).run();
    db.exec(`
        DROP INDEX IF EXISTS idx_cash_income_entries_linked_order;
    `);
    db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_income_entries_linked_order_kind
        ON cash_income_entries (linked_order_number, income_kind)
        WHERE auto_generated = 1
          AND linked_order_number IS NOT NULL
          AND TRIM(linked_order_number) != ''
          AND TRIM(COALESCE(income_kind, '')) != ''
    `);

    schemaReadyDbs.add(db);
}

function ensureTableColumn(db, tableName, columnName, definition) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (columns.some((column) => column.name === columnName)) {
        return;
    }

    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function syncSeedData(db) {
    if (seedSyncCompleteDbs.has(db)) {
        return;
    }

    if (!isAutoSeedEnabled()) {
        seedSyncCompleteDbs.add(db);
        return;
    }

    inventoryVariantStore.importInventoryVariantsFromCsv({ suppressMissingFile: true });
    syncCompositeComponents(db);
    syncInventoryItems(db);
    syncInventoryLevels(db);
    syncSalesEntries(db);

    seedSyncCompleteDbs.add(db);
}

function parseCsvRows(input) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;

    for (let index = 0; index < input.length; index += 1) {
        const character = input[index];
        const nextCharacter = input[index + 1];

        if (character === '"') {
            if (inQuotes && nextCharacter === '"') {
                currentField += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (character === ',' && !inQuotes) {
            currentRow.push(currentField);
            currentField = '';
            continue;
        }

        if ((character === '\n' || character === '\r') && !inQuotes) {
            if (character === '\r' && nextCharacter === '\n') {
                index += 1;
            }

            currentRow.push(currentField);
            rows.push(currentRow);
            currentRow = [];
            currentField = '';
            continue;
        }

        currentField += character;
    }

    if (currentField || currentRow.length) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }

    return rows;
}

function normalizeText(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getInventoryItemLookupKey(itemName = '', inventoryUnit = '') {
    return `${normalizeText(itemName).toLowerCase()}||${normalizeText(inventoryUnit).toLowerCase()}`;
}

function isUniqueConstraintError(error) {
    const code = String(error?.code || '').trim();
    if (code === '23505' || code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT') {
        return true;
    }
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('unique constraint')
        || message.includes('duplicate key value violates unique constraint')
        || message.includes('is not unique');
}

function runIgnoringUniqueConstraint(statement, ...params) {
    try {
        return statement.run(...params);
    } catch (error) {
        if (isUniqueConstraintError(error)) {
            return null;
        }
        throw error;
    }
}

function normalizeOption(value, options) {
    const text = normalizeText(value);
    if (!text) {
        return '';
    }

    const match = options.find((option) => option.toLowerCase() === text.toLowerCase());
    return match || text;
}

function normalizeStrictOption(value, options) {
    const text = normalizeText(value);
    if (!text) {
        return '';
    }

    return options.find((option) => option.toLowerCase() === text.toLowerCase()) || '';
}

function normalizeSet(value) {
    return normalizeOption(value, SET_OPTIONS);
}

function normalizeDate(value) {
    const text = normalizeText(value);
    if (!text) {
        return '';
    }

    return sqliteStore.getDateKey(text);
}

function normalizeInventoryExpirationDate(value, { allowEmpty = true } = {}) {
    const text = normalizeText(value);
    if (!text) {
        return allowEmpty ? '' : '';
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        const [year, month, day] = text.split('-').map(Number);
        const parsed = new Date(year, month - 1, day);
        if (
            parsed.getFullYear() === year
            && (parsed.getMonth() + 1) === month
            && parsed.getDate() === day
        ) {
            return text;
        }
        throw new Error('Expiration date is invalid.');
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error('Expiration date must be a valid date.');
    }

    return sqliteStore.getDateKey(parsed);
}

function parseNumber(value) {
    const cleaned = String(value || '').replace(/[^0-9.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') {
        return 0;
    }

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
}

function hasProvidedValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
}

function parseBoolean(value) {
    if (typeof value === 'boolean') {
        return value;
    }

    const normalized = normalizeText(value).toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function getConfiguredOrderFormList(key) {
    try {
        const config = sqliteStore.getCompanyWorkspaceConfig?.() || {};
        const orderForm = (config && typeof config.orderForm === 'object' && !Array.isArray(config.orderForm))
            ? config.orderForm
            : {};
        return Array.isArray(orderForm[key])
            ? orderForm[key].map((entry) => normalizeText(entry)).filter(Boolean)
            : [];
    } catch (_error) {
        return [];
    }
}

function normalizeReferencePaymentMethod(value, { courier = '' } = {}) {
    const normalized = normalizeText(value);
    const upperValue = normalized.toUpperCase();
    if (!normalized || upperValue === 'TOTAL') {
        return '';
    }

    if (upperValue === 'COD' || upperValue === 'COP') {
        return normalizeText(courier).toUpperCase() === 'LBC'
            ? 'LBC Collection'
            : '';
    }

    return normalized;
}

function getHistoricalPaymentMethodOptions(db = null) {
    try {
        const targetDb = db || getDb();
        const rows = targetDb.prepare(`
            SELECT payment_method_breakdown, payment_method, payment_option, courier,
                   payment_amount, collection_amount, underpayment_amount, base_total, order_total
            FROM sales_entries
            WHERE TRIM(COALESCE(payment_method_breakdown, '')) != ''
               OR TRIM(COALESCE(payment_method, '')) != ''
               OR TRIM(COALESCE(payment_option, '')) != ''
               OR UPPER(TRIM(COALESCE(courier, ''))) = 'LBC'
        `).all();

        const methods = [];
        rows.forEach((row) => {
            splitMultiValue(row.payment_method || row.payment_option)
                .map((entry) => normalizeReferencePaymentMethod(entry, { courier: row.courier }))
                .filter(Boolean)
                .forEach((entry) => pushUniqueLabel(methods, entry));

            const rawBreakdown = normalizeText(row.payment_method_breakdown);
            if (rawBreakdown) {
                try {
                    const parsedBreakdown = JSON.parse(rawBreakdown);
                    if (Array.isArray(parsedBreakdown)) {
                        parsedBreakdown.forEach((entry) => {
                            const method = normalizeReferencePaymentMethod(
                                entry?.method
                                || entry?.value
                                || entry?.paymentMethod
                                || entry?.label,
                                { courier: row.courier }
                            );
                            if (method) {
                                pushUniqueLabel(methods, method);
                            }
                        });
                    }
                } catch (_error) {
                    // Ignore malformed historical values and continue.
                }
            }

            const courier = normalizeText(row.courier).toUpperCase();
            const collectionAmount = Math.max(0, parseNumber(row.collection_amount));
            const underpaymentAmount = Math.max(0, parseNumber(row.underpayment_amount));
            const orderTotal = Math.max(0, parseNumber(row.order_total || row.base_total));
            const paymentAmount = Math.max(0, parseNumber(row.payment_amount));
            if (courier === 'LBC' && (collectionAmount > 0 || underpaymentAmount > 0 || orderTotal > paymentAmount)) {
                pushUniqueLabel(methods, 'LBC Collection');
            }
        });

        return uniqueSorted(methods);
    } catch (_error) {
        return [];
    }
}

function getHistoricalAdminOptions(db = null) {
    const values = [];

    try {
        const targetDb = db || getDb();
        const rows = targetDb.prepare(`
            SELECT DISTINCT admin_name AS value
            FROM sales_entries
            WHERE TRIM(COALESCE(admin_name, '')) != ''
            ORDER BY admin_name COLLATE NOCASE
        `).all();
        rows
            .map((row) => normalizeText(row.value))
            .filter(Boolean)
            .forEach((entry) => pushUniqueLabel(values, entry));
    } catch (_error) {
        // Keep fallback resilient when sales table/context is unavailable.
    }

    try {
        const users = sqliteStore.listUsers?.('company_admin', '') || [];
        users
            .map((user) => normalizeText(
                user.name
                || user.display_name
                || user.displayName
                || user.username
                || user.id
            ))
            .filter(Boolean)
            .forEach((entry) => pushUniqueLabel(values, entry));
    } catch (_error) {
        // User list access can fail outside tenant context.
    }

    return uniqueSorted(values);
}

function getConfiguredPaymentMethodOptions(db = null) {
    const methods = getConfiguredOrderFormList('paymentMethods');
    if (methods.length) {
        return uniqueSorted([...methods, 'LBC Collection']);
    }

    const historicalMethods = getHistoricalPaymentMethodOptions(db);
    if (historicalMethods.length) {
        return uniqueSorted([...historicalMethods, ...PAYMENT_METHOD_OPTIONS]);
    }

    // Neutral fallback while waiting for company-specific setup.
    return [...PAYMENT_METHOD_OPTIONS];
}

function normalizePaymentMethods(value) {
    const rawValues = splitMultiValue(value);
    const paymentOptions = getConfiguredPaymentMethodOptions();
    return uniqueSorted(rawValues.map((entry) => normalizeStrictOption(entry, paymentOptions)).filter(Boolean));
}

function normalizeStrictPaymentMethods(value) {
    const rawValues = splitMultiValue(value);
    const paymentOptions = getConfiguredPaymentMethodOptions();
    return uniqueSorted(rawValues.map((entry) => normalizeStrictOption(entry, paymentOptions)).filter(Boolean));
}

function joinPaymentMethods(value) {
    return normalizePaymentMethods(value).join(' + ');
}

function splitMultiValue(value) {
    return (Array.isArray(value) ? value : String(value || '').split('+'))
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
}

function pushUniqueLabel(values, nextValue) {
    const normalized = normalizeText(nextValue);
    if (!normalized) {
        return;
    }

    if (!values.some((value) => value.toLowerCase() === normalized.toLowerCase())) {
        values.push(normalized);
    }
}

function normalizePaymentTypeValue(value) {
    const normalized = normalizeText(value);
    if (!normalized) {
        return '';
    }

    if (['cod', 'cop'].includes(normalized.toLowerCase())) {
        return 'Partial';
    }

    return normalizeStrictOption(normalized, PAYMENT_TYPE_OPTIONS);
}

function normalizeCashIncomeStatus(value, fallback = 'Confirmed') {
    const normalized = normalizeText(value);
    if (!normalized) {
        return fallback;
    }

    return normalizeStrictOption(normalized, CASH_INCOME_STATUS_OPTIONS) || fallback;
}

function resolveLbcTrackingBranch(value = '') {
    const normalized = normalizeText(value).toLowerCase();
    if (!normalized) {
        return '';
    }

    return LBC_TRACKING_BRANCHES.find((branch) => branch.toLowerCase() === normalized) || '';
}

function normalizeLbcStatusToken(value = '') {
    return normalizeText(value)
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s*\/\s*/g, '/')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeLbcTrackingStatus(value, fallback = 'In Transit') {
    const token = normalizeLbcStatusToken(value);
    if (!token) {
        return fallback;
    }

    if (Object.prototype.hasOwnProperty.call(LBC_TRACKING_STATUS_ALIASES, token)) {
        return LBC_TRACKING_STATUS_ALIASES[token];
    }

    return normalizeStrictOption(value, LBC_TRACKING_STATUS_OPTIONS) || fallback;
}

function getLbcDeliveryStatusBucket(value = '') {
    const status = normalizeLbcTrackingStatus(value, 'In Transit');
    if (status === 'Delivered') {
        return 'delivered';
    }
    if (status === 'RTS') {
        return 'rts';
    }
    if (status === 'RTO') {
        return 'rto';
    }
    if (LBC_CONCERN_STATUS_SET.has(status)) {
        return 'concern';
    }
    if (LBC_IN_TRANSIT_STATUS_SET.has(status)) {
        return 'in_transit';
    }
    return 'in_transit';
}

function normalizeLbcCollectionStatus(value, fallback = 'Pending') {
    const normalized = normalizeText(value);
    if (!normalized) {
        return fallback;
    }

    return normalizeStrictOption(normalized, LBC_COLLECTION_STATUS_OPTIONS) || fallback;
}

function normalizeLbcQuickFilter(value = '') {
    const normalized = normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_');
    return LBC_QUICK_FILTER_OPTIONS.includes(normalized) ? normalized : 'all';
}

function isLbcPendingShipmentStage(value = '') {
    return ['pending packing', 'packed', 'handed to courier'].includes(normalizeText(value).toLowerCase());
}

function matchesLbcQuickFilter(row = {}, quickFilter = 'all') {
    const normalizedQuickFilter = normalizeLbcQuickFilter(quickFilter);
    if (normalizedQuickFilter === 'all') {
        return true;
    }

    const deliveryStatusBucket = getLbcDeliveryStatusBucket(row.deliveryStatus);
    const trackingNumber = normalizeText(row.trackingNumber);
    const shipmentStatus = normalizeText(row.shipmentStatus);

    if (normalizedQuickFilter === 'in_transit') {
        return deliveryStatusBucket === 'in_transit';
    }
    if (normalizedQuickFilter === 'delivered') {
        return deliveryStatusBucket === 'delivered';
    }
    if (normalizedQuickFilter === 'rts') {
        return deliveryStatusBucket === 'rts';
    }
    if (normalizedQuickFilter === 'rto') {
        return deliveryStatusBucket === 'rto';
    }
    if (normalizedQuickFilter === 'no_tracking') {
        return !trackingNumber;
    }
    if (normalizedQuickFilter === 'pending_shipment') {
        return isLbcPendingShipmentStage(shipmentStatus) || (!trackingNumber && deliveryStatusBucket === 'in_transit');
    }

    return true;
}

function isLbcConcernItem(row = {}) {
    const deliveryStatusBucket = getLbcDeliveryStatusBucket(row.deliveryStatus);
    const trackingNumber = normalizeText(row.trackingNumber);
    const shipmentStatus = normalizeText(row.shipmentStatus);

    if (deliveryStatusBucket === 'rts' || deliveryStatusBucket === 'rto' || deliveryStatusBucket === 'concern') {
        return true;
    }

    if (!trackingNumber) {
        return true;
    }

    return isLbcPendingShipmentStage(shipmentStatus);
}

function buildLbcQuickFilterSummary(items = []) {
    const summary = {
        all: Number(items.length || 0),
        in_transit: 0,
        delivered: 0,
        rts: 0,
        rto: 0,
        no_tracking: 0,
        pending_shipment: 0
    };

    (items || []).forEach((row) => {
        if (matchesLbcQuickFilter(row, 'in_transit')) {
            summary.in_transit += 1;
        }
        if (matchesLbcQuickFilter(row, 'delivered')) {
            summary.delivered += 1;
        }
        if (matchesLbcQuickFilter(row, 'rts')) {
            summary.rts += 1;
        }
        if (matchesLbcQuickFilter(row, 'rto')) {
            summary.rto += 1;
        }
        if (matchesLbcQuickFilter(row, 'no_tracking')) {
            summary.no_tracking += 1;
        }
        if (matchesLbcQuickFilter(row, 'pending_shipment')) {
            summary.pending_shipment += 1;
        }
    });

    return summary;
}

function computeDeterministicHash(value = '') {
    const input = String(value || '');
    let hashValue = 0;
    for (let index = 0; index < input.length; index += 1) {
        hashValue = ((hashValue << 5) - hashValue + input.charCodeAt(index)) | 0;
    }
    return Math.abs(hashValue);
}

function getElapsedDaysSince(value = '') {
    const raw = normalizeText(value);
    if (!raw) {
        return 0;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return 0;
    }

    const elapsedMs = Date.now() - parsed.getTime();
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
        return 0;
    }

    return Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
}

function mapCarrierStatusToLbcStatus(value, fallback = 'In Transit') {
    const normalized = normalizeText(value).toLowerCase();
    if (!normalized) {
        return normalizeLbcTrackingStatus(fallback, 'In Transit');
    }

    if (normalized === 'delivered') {
        return 'Delivered';
    }
    if (normalized === 'in transit') {
        return 'In Transit';
    }
    if (normalized === 'shipment picked up') {
        return 'In Transit';
    }
    if (normalized === 'returned to sender') {
        return 'RTS';
    }
    if (normalized === 'return to origin') {
        return 'RTO';
    }

    return normalizeLbcTrackingStatus(fallback, 'In Transit');
}

function simulateLbcCarrierStatus(row = {}) {
    const currentStatus = normalizeLbcTrackingStatus(row.deliveryStatus, 'In Transit');
    if (currentStatus === 'Delivered') {
        return 'Delivered';
    }
    if (currentStatus === 'RTS') {
        return 'Returned to Sender';
    }
    if (currentStatus === 'RTO') {
        return 'Return to Origin';
    }

    const trackingNumber = normalizeText(row.trackingNumber || row.orderKey);
    const elapsedDays = Math.max(
        getElapsedDaysSince(row.dateMonitored || ''),
        getElapsedDaysSince(row.saleDate || '')
    );
    const hashValue = computeDeterministicHash(`${trackingNumber}:${row.orderKey || ''}:${elapsedDays}`);
    const score = hashValue % 100;

    if (elapsedDays <= 1) {
        return 'Shipment Picked Up';
    }

    if (elapsedDays <= 3) {
        return score < 45 ? 'Shipment Picked Up' : 'In Transit';
    }

    if (elapsedDays <= 7) {
        if (score < 65) {
            return 'In Transit';
        }
        if (score < 84) {
            return 'Delivered';
        }
        return score < 93 ? 'Returned to Sender' : 'Return to Origin';
    }

    if (score < 78) {
        return 'Delivered';
    }
    return score < 90 ? 'Returned to Sender' : 'Return to Origin';
}

function deriveNextSalesOrderStatusFromTracking({ orderStatus = '', trackingNumber = '', deliveryStatus = '' } = {}) {
    const normalizedCurrentStatus = normalizeStrictOption(orderStatus, ORDER_STATUS_OPTIONS)
        || normalizeStrictOption(orderStatus, ORDER_STATUS_OPTIONS.map((entry) => entry.toLowerCase()))
        || normalizeText(orderStatus);
    const normalizedTrackingNumber = normalizeText(trackingNumber);
    const normalizedDeliveryStatus = normalizeLbcTrackingStatus(deliveryStatus, 'In Transit');

    if (normalizedDeliveryStatus === 'Delivered') {
        return 'Completed';
    }

    if (normalizedTrackingNumber) {
        return 'Shipped';
    }

    return normalizeStrictOption(normalizedCurrentStatus, ORDER_STATUS_OPTIONS) || '';
}

function syncSalesOrderStatusForOrderKey(db, orderKey = '', nextOrderStatus = '') {
    const normalizedOrderKey = normalizeText(orderKey);
    const normalizedNextStatus = normalizeStrictOption(nextOrderStatus, ORDER_STATUS_OPTIONS);
    if (!normalizedOrderKey || !normalizedNextStatus) {
        return;
    }

    db.prepare(`
        UPDATE sales_entries
        SET order_status = ?
        WHERE LOWER(TRIM(COALESCE(receipt_number, order_number, CAST(id AS TEXT)))) = LOWER(?)
    `).run(normalizedNextStatus, normalizedOrderKey);
}

function normalizeLbcTrackingNumber(value, { allowEmpty = true } = {}) {
    const normalized = normalizeText(value);
    if (!normalized) {
        if (!allowEmpty) {
            throw new Error('Tracking number is required.');
        }
        return '';
    }

    if (!LBC_TRACKING_NUMBER_REGEX.test(normalized)) {
        throw new Error('Tracking number must be alphanumeric and up to 12 characters.');
    }

    return normalized.toUpperCase();
}

function normalizeActorValue(value = '') {
    return normalizeText(value).toLowerCase();
}

function buildLbcTrackingCandidateLabels(order = {}, explicitAssignedTo = '') {
    const candidates = [
        explicitAssignedTo,
        order.sales_representative || '',
        order.admin_name || '',
        order.assigned_to || ''
    ].map((value) => normalizeText(value)).filter(Boolean);

    const seen = new Set();
    return candidates.filter((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function buildUserLookupMaps(users = []) {
    const byId = new Map();
    const byName = new Map();

    (users || []).forEach((user) => {
        const idKey = normalizeActorValue(user?.id || user?.username || '');
        if (idKey && !byId.has(idKey)) {
            byId.set(idKey, user);
        }

        const nameKey = normalizeActorValue(user?.name || '');
        if (nameKey && !byName.has(nameKey)) {
            byName.set(nameKey, user);
        }
    });

    return { byId, byName };
}

function resolveLbcTrackingAssignee(order = {}, userLookups = null) {
    const lookup = userLookups || buildUserLookupMaps(sqliteStore.listUsers?.('', '') || []);
    const labels = buildLbcTrackingCandidateLabels(order);

    for (const label of labels) {
        const key = normalizeActorValue(label);
        if (!key) {
            continue;
        }

        const matchedUser = lookup.byId.get(key) || lookup.byName.get(key);
        if (matchedUser) {
            return {
                assignedUserId: normalizeText(matchedUser.id || matchedUser.username || ''),
                assignedTo: normalizeText(matchedUser.name || label),
                assignmentSource: normalizeText(label)
            };
        }
    }

    return {
        assignedUserId: '',
        assignedTo: normalizeText(labels[0] || ''),
        assignmentSource: normalizeText(labels[0] || '')
    };
}

function deriveLbcTrackingFallbackStatus(order = {}) {
    const orderStatus = normalizeText(order.order_status || '').toLowerCase();
    if (!orderStatus) {
        return 'In Transit';
    }
    if (orderStatus === 'completed') {
        return 'Delivered';
    }
    if (orderStatus === 'cancelled' || orderStatus === 'canceled') {
        return 'RTO';
    }
    return 'In Transit';
}

function getLbcOrderCollectionAmount(order = {}) {
    return Math.max(0, parseNumber(order.collection_amount ?? order.collectionAmount));
}

function normalizeLbcTrackingAmountToCollect(value, fallback = 0) {
    if (!hasProvidedValue(value)) {
        return Number(Math.max(0, parseNumber(fallback)).toFixed(2));
    }

    const cleaned = String(value)
        .replace(/,/g, '')
        .replace(/[^0-9.-]/g, '')
        .trim();
    if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') {
        throw new Error('Amount to collect must be a valid non-negative number.');
    }

    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error('Amount to collect must be a valid non-negative number.');
    }

    return Number(parsed.toFixed(2));
}

function getCurrentMonthStartDateKey(referenceDate = new Date()) {
    const year = Number(referenceDate.getFullYear());
    const month = Number(referenceDate.getMonth()) + 1;
    const monthToken = String(month).padStart(2, '0');
    return `${year}-${monthToken}-01`;
}

function deriveLbcShipmentStatus({ orderStatus = '', deliveryStatus = 'In Transit', trackingNumber = '' } = {}) {
    const normalizedDeliveryStatus = normalizeLbcTrackingStatus(deliveryStatus, 'In Transit');
    const normalizedTrackingNumber = normalizeText(trackingNumber);
    if (normalizedDeliveryStatus === 'Delivered') {
        return 'Delivered';
    }
    if (normalizedDeliveryStatus === 'RTS') {
        return 'RTS';
    }
    if (normalizedDeliveryStatus === 'RTO') {
        return 'RTO';
    }
    if (normalizedTrackingNumber) {
        return 'In Transit';
    }

    const normalizedOrderStatus = normalizeText(orderStatus);
    if (!normalizedOrderStatus) {
        return 'Pending Packing';
    }

    const lowerOrderStatus = normalizedOrderStatus.toLowerCase();
    if (lowerOrderStatus === 'completed') {
        return 'Delivered';
    }
    if (lowerOrderStatus === 'cancelled' || lowerOrderStatus === 'canceled') {
        return 'RTO';
    }
    if (lowerOrderStatus === 'shipped') {
        return 'Handed to Courier';
    }
    if (lowerOrderStatus === 'packed') {
        return 'Packed';
    }
    if (lowerOrderStatus === 'pending') {
        return 'Pending Packing';
    }

    return normalizeStrictOption(normalizedOrderStatus, LBC_SHIPMENT_STAGE_OPTIONS) || normalizedOrderStatus;
}

function canActorUpdateLbcTracking({
    actorId = '',
    actorName = '',
    actorRole = '',
    order = {},
    assignedUserId = '',
    assignedTo = ''
} = {}) {
    if (sqliteStore.isCompanyAdminRole?.(actorRole)) {
        return true;
    }

    const actorKeys = uniqueSorted([actorId, actorName]).map((value) => normalizeActorValue(value)).filter(Boolean);
    if (!actorKeys.length) {
        return false;
    }

    const allowedKeys = uniqueSorted([
        assignedUserId,
        assignedTo,
        order.sales_representative || '',
        order.admin_name || ''
    ]).map((value) => normalizeActorValue(value)).filter(Boolean);

    if (!allowedKeys.length) {
        return false;
    }

    return actorKeys.some((actorKey) => allowedKeys.includes(actorKey));
}

function normalizeCashIncomeKind(value) {
    const normalized = normalizeText(value).toLowerCase();
    return CASH_INCOME_KIND_OPTIONS.find((entry) => entry === normalized) || '';
}

function getDisplayPaymentMethodLabel(method, row = {}) {
    return normalizeStrictOption(method, getConfiguredPaymentMethodOptions());
}

function isCourierCollectionManaged(courier) {
    const normalizedCourier = normalizeText(courier).toUpperCase();
    return normalizedCourier === 'LBC' || normalizedCourier === 'LALAMOVE';
}

function getSuggestedHandlingFee(courier, branch) {
    const normalizedCourier = normalizeText(courier).toLowerCase();
    const normalizedBranch = normalizeText(branch).toLowerCase();

    if (normalizedCourier !== 'meet-up') {
        return 0;
    }

    if (normalizedBranch === 'cubao') {
        return 50;
    }

    if (normalizedBranch === 'pampanga') {
        return 100;
    }

    return 0;
}

function shouldSaveClientProfileForSalesRep(salesRepresentative) {
    const configuredSalesRepresentatives = getConfiguredOrderFormList('salesRepresentatives');
    const allowedOptions = configuredSalesRepresentatives.length
        ? configuredSalesRepresentatives
        : CLIENT_DB_SALES_REP_OPTIONS;

    if (!allowedOptions.length) {
        return true;
    }

    return allowedOptions.some((option) => option.toLowerCase() === normalizeText(salesRepresentative).toLowerCase());
}

function shouldPersistClientProfile(saleEntryData = {}) {
    if (!shouldSaveClientProfileForSalesRep(saleEntryData.salesRepresentative)) {
        return false;
    }

    return Boolean(normalizeText(saleEntryData.clientContact));
}

function isZeroAmountPaymentMethod(method) {
    return ZERO_AMOUNT_PAYMENT_METHODS.some((entry) => entry.toLowerCase() === normalizeText(method).toLowerCase());
}

function sumPaymentMethodBreakdown(entries) {
    return (entries || []).reduce((total, entry) => total + parseNumber(entry.amount), 0);
}

function hasPositivePaymentEntry(entries = []) {
    return entries.some((entry) => !isZeroAmountPaymentMethod(entry.method) && parseNumber(entry.amount) > 0);
}

function buildLegacyPaymentMethodBreakdown(paymentMethods, totalAmount = 0) {
    const labels = normalizePaymentMethods(paymentMethods);
    const normalizedTotal = Math.max(0, parseNumber(totalAmount));
    let assignedAmount = false;

    return labels.map((method) => {
        if (isZeroAmountPaymentMethod(method)) {
            return { method, amount: 0 };
        }

        if (!assignedAmount) {
            assignedAmount = true;
            return { method, amount: normalizedTotal };
        }

        return { method, amount: 0 };
    });
}

function normalizePaymentMethodBreakdown(value, fallbackPaymentMethods, totalAmount = 0) {
    const paymentOptions = getConfiguredPaymentMethodOptions();
    let rawEntries = [];

    if (Array.isArray(value)) {
        rawEntries = value;
    } else {
        const rawText = normalizeText(value);
        if (rawText) {
            try {
                const parsed = JSON.parse(rawText);
                if (Array.isArray(parsed)) {
                    rawEntries = parsed;
                }
            } catch (_error) {
                rawEntries = [];
            }
        }
    }

    const normalizedEntries = [];
    rawEntries.forEach((entry) => {
        const rawMethod =
            entry?.method
            || entry?.value
            || entry?.paymentMethod
            || entry?.label;
        const method = normalizeStrictOption(rawMethod, paymentOptions) || normalizeText(rawMethod);
        if (!method) {
            return;
        }

        const existingEntry = normalizedEntries.find((item) => item.method.toLowerCase() === method.toLowerCase());
        const nextAmount = isZeroAmountPaymentMethod(method) ? 0 : Math.max(0, parseNumber(entry?.amount));
        if (existingEntry) {
            existingEntry.amount += nextAmount;
            return;
        }

        normalizedEntries.push({
            method,
            amount: nextAmount
        });
    });

    if (hasPositivePaymentEntry(normalizedEntries)) {
        return normalizedEntries.filter((entry) => !isZeroAmountPaymentMethod(entry.method) || parseNumber(entry.amount) > 0);
    }

    if (normalizedEntries.length) {
        return normalizedEntries;
    }

    const fallbackEntries = buildLegacyPaymentMethodBreakdown(fallbackPaymentMethods, totalAmount);
    if (hasPositivePaymentEntry(fallbackEntries)) {
        return fallbackEntries.filter((entry) => !isZeroAmountPaymentMethod(entry.method) || parseNumber(entry.amount) > 0);
    }

    return fallbackEntries;
}

function serializePaymentMethodBreakdown(entries) {
    const normalizedEntries = normalizePaymentMethodBreakdown(entries, [], 0);
    if (!normalizedEntries.length) {
        return '';
    }

    return JSON.stringify(normalizedEntries.map((entry) => ({
        method: entry.method,
        amount: Math.max(0, parseNumber(entry.amount))
    })));
}

function getPaymentMethodBreakdownAmount(entries, method) {
    const normalizedMethod = normalizeText(method).toLowerCase();
    if (!normalizedMethod) {
        return 0;
    }

    return normalizePaymentMethodBreakdown(entries, [], 0).reduce((total, entry) => (
        normalizeText(entry.method).toLowerCase() === normalizedMethod
            ? total + Math.max(0, parseNumber(entry.amount))
            : total
    ), 0);
}

function normalizeReportPaymentPart(value, row = {}) {
    const normalized = normalizeText(value);
    const upperValue = normalized.toUpperCase();
    const courier = normalizeText(row.courier).toUpperCase();

    if (!normalized || upperValue === 'TOTAL') {
        return '';
    }

    if ((upperValue === 'COD' || upperValue === 'COP') && courier === 'LBC') {
        return 'LBC Collection';
    }

    if (upperValue === 'COD' || upperValue === 'COP') {
        return '';
    }

    return getDisplayPaymentMethodLabel(normalized, row);
}

function buildReportPaymentParts(row = {}) {
    const parts = [];
    const paymentMethodBreakdown = normalizePaymentMethodBreakdown(
        row.payment_method_breakdown,
        row.payment_method || row.payment_option,
        row.payment_amount
    );

    paymentMethodBreakdown
        .filter((entry) => !isZeroAmountPaymentMethod(entry.method) && parseNumber(entry.amount) > 0)
        .map((entry) => getDisplayPaymentMethodLabel(entry.method, row))
        .filter(Boolean)
        .forEach((value) => pushUniqueLabel(parts, value));

    const rawValues = splitMultiValue(row.payment_method || row.payment_option);

    rawValues
        .map((value) => normalizeReportPaymentPart(value, row))
        .filter(Boolean)
        .forEach((value) => pushUniqueLabel(parts, value));

    const collectionMethod = resolveCollectionMethod(row.courier, getRemainingAllocationAmount(row));
    if (collectionMethod) {
        pushUniqueLabel(parts, collectionMethod);
    }

    if (parts.length) {
        return parts;
    }

    if (!parts.length) {
        const collectionAmount = Number(row.collection_amount || row.collectionAmount || 0);
        const underpaymentAmount = Number(row.underpayment_amount || row.underpaymentAmount || 0);
        const orderTotal = Number(row.order_total || row.orderTotal || row.base_total || row.baseTotal || 0);
        const paymentAmount = Number(row.payment_amount || row.paymentAmount || 0);
        const courier = normalizeText(row.courier).toUpperCase();

        if (courier === 'LBC' && (collectionAmount > 0 || underpaymentAmount > 0 || orderTotal > paymentAmount)) {
            pushUniqueLabel(parts, 'LBC Collection');
        }
    }

    return parts;
}

function buildReportPaymentLabel(row = {}) {
    const parts = buildReportPaymentParts(row);
    return parts.length ? parts.join(' + ') : 'Unspecified';
}

function resolveCollectionMethod(courier, amount = 0) {
    if (parseNumber(amount) <= 0) {
        return '';
    }

    const normalizedCourier = normalizeText(courier).toUpperCase();
    if (normalizedCourier === 'LBC') {
        return 'LBC Collection';
    }

    return '';
}

function getRemainingAllocationAmount(row = {}) {
    const orderTotal = Math.max(0, parseNumber(row.order_total || row.orderTotal || row.base_total || row.baseTotal));
    const paymentAmount = Math.max(0, parseNumber(row.payment_amount || row.paymentAmount));
    return Math.max(orderTotal - paymentAmount, 0);
}

function pushPaymentBreakdownEntry(entries, method, amount) {
    const normalizedMethod = normalizeText(method);
    const normalizedAmount = Math.max(0, parseNumber(amount));
    if (!normalizedMethod || normalizedAmount <= 0) {
        return;
    }

    const existingEntry = entries.find((entry) => entry.label.toLowerCase() === normalizedMethod.toLowerCase());
    if (existingEntry) {
        existingEntry.value += normalizedAmount;
        return;
    }

    entries.push({
        label: normalizedMethod,
        value: normalizedAmount
    });
}

function buildReportPaymentEntries(row = {}) {
    const entries = [];
    const paymentMethodBreakdown = normalizePaymentMethodBreakdown(
        row.payment_method_breakdown,
        row.payment_method || row.payment_option,
        row.payment_amount
    );

    paymentMethodBreakdown.forEach((entry) => {
        if (!isZeroAmountPaymentMethod(entry.method) && parseNumber(entry.amount) > 0) {
            pushPaymentBreakdownEntry(entries, getDisplayPaymentMethodLabel(entry.method, row), entry.amount);
        }
    });

    const collectionAmount = getRemainingAllocationAmount(row);
    const collectionMethod = resolveCollectionMethod(row.courier, collectionAmount);
    if (collectionMethod) {
        pushPaymentBreakdownEntry(entries, collectionMethod, collectionAmount);
    }

    return entries;
}

function resolvePaymentMethods({ paymentMethods, courier, paymentSummary }) {
    const resolved = [];

    normalizePaymentMethods(paymentMethods).forEach((value) => pushUniqueLabel(resolved, value));

    const collectionMethod = resolveCollectionMethod(courier, paymentSummary.remainingAmount);
    if (collectionMethod) {
        pushUniqueLabel(resolved, collectionMethod);
    }

    if (resolved.length) {
        return resolved;
    }

    if (!resolved.length && paymentSummary.amountPaid > 0 && normalizeText(courier).toUpperCase() === 'LALAMOVE') {
        pushUniqueLabel(resolved, 'CASH');
    }

    return resolved;
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatQuantity(value) {
    const amount = Number(value || 0);
    return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function buildImportKey(prefix, values) {
    return crypto
        .createHash('sha1')
        .update(`${prefix}|${values.map((value) => String(value || '')).join('|')}`)
        .digest('hex');
}

function buildAutoCashIncomeAbout({ courier, clientName, kind = '' }) {
    const normalizedCourier = normalizeText(courier).toUpperCase();
    const normalizedClient = normalizeText(clientName).toUpperCase();
    const normalizedKind = normalizeCashIncomeKind(kind);
    let prefix = normalizedCourier;

    if (normalizedKind === 'sales_cash') {
        prefix = 'SALES CASH';
    } else if (normalizedKind === 'lalamove_cod') {
        prefix = 'LALAMOVE COD';
    } else if (normalizedKind === 'lalamove_cash') {
        prefix = 'LALAMOVE CASH';
    }

    return [prefix, normalizedClient].filter(Boolean).join('/ ');
}

function getCashIncomeKind(row = {}) {
    const explicitKind = normalizeCashIncomeKind(row.income_kind || row.incomeKind);
    if (explicitKind) {
        return explicitKind;
    }

    const about = normalizeText(row.about).toUpperCase();
    if (about.startsWith('SALES CASH/')) {
        return 'sales_cash';
    }

    if (about.startsWith('LALAMOVE CASH/')) {
        return 'lalamove_cash';
    }

    if (about.startsWith('LALAMOVE COD/') || about.startsWith('LALAMOVE/')) {
        return 'lalamove_cod';
    }

    if (about.startsWith('LBC/')) {
        return 'lbc_collection';
    }

    return '';
}

function listLinkedCashIncomeEntries(db, orderNumber, receiptNumber = '') {
    const normalizedOrderNumber = normalizeText(orderNumber);
    const normalizedReceiptNumber = normalizeText(receiptNumber);
    if (!normalizedOrderNumber && !normalizedReceiptNumber) {
        return [];
    }

    return db.prepare(`
        SELECT *
        FROM cash_income_entries
        WHERE auto_generated = 1
          AND (
            LOWER(COALESCE(linked_order_number, '')) = LOWER(?)
            OR LOWER(COALESCE(linked_receipt_number, '')) = LOWER(?)
          )
        ORDER BY id ASC
    `).all(normalizedOrderNumber, normalizedReceiptNumber);
}

function findLinkedCashIncomeEntry(db, orderNumber, receiptNumber = '', kind = '') {
    const normalizedKind = normalizeCashIncomeKind(kind);
    if (!normalizedKind) {
        return null;
    }

    return listLinkedCashIncomeEntries(db, orderNumber, receiptNumber)
        .find((row) => getCashIncomeKind(row) === normalizedKind) || null;
}

function deleteLinkedCashIncomeEntries(db, orderNumber, receiptNumber = '') {
    listLinkedCashIncomeEntries(db, orderNumber, receiptNumber).forEach((row) => {
        db.prepare(`DELETE FROM cash_income_entries WHERE id = ?`).run(row.id);
    });
}

function buildAutoCashIncomeEntries(saleEntryData = {}) {
    const collectionAmount = Math.max(0, parseNumber(saleEntryData?.paymentSummary?.collectionAmount));
    const normalizedCourier = normalizeText(saleEntryData?.courier).toUpperCase();
    const paymentMethodBreakdown = normalizePaymentMethodBreakdown(
        saleEntryData?.paymentMethodBreakdown,
        saleEntryData?.paymentMethod || saleEntryData?.paymentMethods,
        saleEntryData?.paymentSummary?.amountPaid
    );
    const cashPaymentAmount = getPaymentMethodBreakdownAmount(paymentMethodBreakdown, 'CASH');
    const lalamoveCashAmount = normalizedCourier === 'LALAMOVE'
        ? cashPaymentAmount
        : 0;
    const entries = [];

    if (normalizedCourier !== 'LALAMOVE' && cashPaymentAmount > 0) {
        entries.push({
            kind: 'sales_cash',
            about: buildAutoCashIncomeAbout({ courier: saleEntryData?.courier, clientName: saleEntryData?.clientName, kind: 'sales_cash' }),
            amount: cashPaymentAmount,
            confirmationStatus: 'Confirmed'
        });
    }

    if (normalizedCourier === 'LALAMOVE' && collectionAmount > 0) {
        entries.push({
            kind: 'lalamove_cod',
            about: buildAutoCashIncomeAbout({ courier: saleEntryData?.courier, clientName: saleEntryData?.clientName, kind: 'lalamove_cod' }),
            amount: collectionAmount,
            confirmationStatus: 'Pending'
        });
    }

    if (normalizedCourier === 'LALAMOVE' && lalamoveCashAmount > 0) {
        entries.push({
            kind: 'lalamove_cash',
            about: buildAutoCashIncomeAbout({ courier: saleEntryData?.courier, clientName: saleEntryData?.clientName, kind: 'lalamove_cash' }),
            amount: lalamoveCashAmount,
            confirmationStatus: 'Pending'
        });
    }

    return entries;
}

function syncLinkedCashIncomeEntry(db, saleEntryData) {
    const orderNumber = normalizeText(saleEntryData?.orderNumber);
    const receiptNumber = normalizeText(saleEntryData?.receiptNumber);
    const expectedEntries = buildAutoCashIncomeEntries(saleEntryData);

    if (!expectedEntries.length) {
        deleteLinkedCashIncomeEntries(db, orderNumber, receiptNumber);
        return;
    }

    const existingEntries = listLinkedCashIncomeEntries(db, orderNumber, receiptNumber);
    const branch = normalizeStrictOption(saleEntryData?.cashBranch, BRANCHES) || normalizeStrictOption(saleEntryData?.branch, BRANCHES);
    const incomeDate = normalizeDate(saleEntryData?.saleDate || new Date());
    const expectedKinds = new Set(expectedEntries.map((entry) => entry.kind));

    expectedEntries.forEach((entry) => {
        const linkedEntry = existingEntries.find((row) => getCashIncomeKind(row) === entry.kind);

        if (linkedEntry) {
            const nextStatus = entry.confirmationStatus === 'Confirmed'
                ? 'Confirmed'
                : normalizeCashIncomeStatus(linkedEntry.confirmation_status || linkedEntry.confirmationStatus, entry.confirmationStatus);
            db.prepare(`
                UPDATE cash_income_entries
                SET income_date = ?,
                    branch = ?,
                    about = ?,
                    amount = ?,
                    confirmation_status = ?,
                    linked_order_number = ?,
                    linked_receipt_number = ?,
                    auto_generated = 1,
                    income_kind = ?
                WHERE id = ?
            `).run(
                incomeDate,
                branch,
                entry.about,
                entry.amount,
                nextStatus,
                orderNumber || linkedEntry.linked_order_number || null,
                receiptNumber || linkedEntry.linked_receipt_number || null,
                entry.kind,
                linkedEntry.id
            );
            return;
        }

        db.prepare(`
            INSERT INTO cash_income_entries (
                income_date, branch, about, amount, note, source,
                linked_order_number, linked_receipt_number, auto_generated, confirmation_status, income_kind
            )
            VALUES (?, ?, ?, ?, '', 'auto', ?, ?, 1, ?, ?)
        `).run(
            incomeDate,
            branch,
            entry.about,
            entry.amount,
            orderNumber || null,
            receiptNumber || null,
            entry.confirmationStatus,
            entry.kind
        );
    });

    existingEntries
        .filter((row) => !expectedKinds.has(getCashIncomeKind(row)))
        .forEach((row) => {
            db.prepare(`DELETE FROM cash_income_entries WHERE id = ?`).run(row.id);
        });
}

function backfillLinkedCashIncomeEntries(db) {
    if (autoCashIncomeBackfillCompleteDbs.has(db)) {
        return;
    }

    const headerRows = db.prepare(`
        SELECT sale_date, branch, cash_branch, courier, client_name, order_number, receipt_number, collection_amount,
               payment_method_breakdown, payment_method, payment_option, payment_amount
        FROM sales_entries
        WHERE LOWER(COALESCE(source, '')) = 'manual'
          AND (COALESCE(line_index, 1) = 1 OR COALESCE(order_total, 0) > 0)
          AND (TRIM(COALESCE(order_number, '')) != '' OR TRIM(COALESCE(receipt_number, '')) != '')
    `).all();

    headerRows.forEach((row) => {
        const orderNumber = normalizeText(row.order_number || row.receipt_number);
        const receiptNumber = normalizeText(row.receipt_number || row.order_number);
        const paymentMethodBreakdown = normalizePaymentMethodBreakdown(
            row.payment_method_breakdown,
            row.payment_method || row.payment_option,
            row.payment_amount
        );

        syncLinkedCashIncomeEntry(db, {
            saleDate: row.sale_date,
            branch: row.branch,
            cashBranch: row.cash_branch || row.branch,
            courier: row.courier,
            clientName: row.client_name,
            paymentMethodBreakdown,
            orderNumber,
            receiptNumber,
            paymentSummary: {
                collectionAmount: Math.max(0, parseNumber(row.collection_amount)),
                amountPaid: row.payment_amount
            }
        });
    });

    autoCashIncomeBackfillCompleteDbs.add(db);
}

function containsKeyword(value, keywords) {
    const text = normalizeText(value).toUpperCase();
    return keywords.some((keyword) => text.includes(keyword));
}

function inferInventoryUnit(itemName, itemSet = '') {
    if (containsKeyword(itemName, SERVICE_KEYWORDS)) {
        return 'Service';
    }

    if (normalizeSet(itemSet) === 'T' || containsKeyword(itemName, PIECE_KEYWORDS)) {
        return 'Pcs';
    }

    return 'Box';
}

function inferInventoryType(itemName, itemSet = '', catalogProductNames = new Set()) {
    if (containsKeyword(itemName, SERVICE_KEYWORDS)) {
        return 'service';
    }

    if (catalogProductNames.has(normalizeText(itemName).toLowerCase())) {
        return 'product';
    }

    return inferInventoryUnit(itemName, itemSet) === 'Pcs' ? 'component' : 'product';
}

function readInventorySeedRows() {
    const seedPath = getSeedPath('inventory');
    if (!seedPath) {
        return [];
    }

    let currentProductName = '';

    return parseCsvRows(fs.readFileSync(seedPath, 'utf8'))
        .slice(1)
        .map((columns) => {
            const productName = normalizeText(columns[0]) || currentProductName;
            if (productName) {
                currentProductName = productName;
            }

            const itemCode = normalizeText(columns[1]);
            const itemSet = normalizeSet(columns[2]);
            const helper = normalizeText(columns[3]) || [itemCode, itemSet].filter(Boolean).join(' | ');
            const price = parseNumber(columns[4]);

            return {
                productName: currentProductName,
                itemCode,
                itemSet,
                helper,
                price
            };
        })
        .filter((entry) => entry.productName && entry.itemCode && entry.itemSet && entry.helper);
}

function readCompositeComponentRows() {
    const seedPath = getSeedPath('composite');
    if (!seedPath) {
        return [];
    }

    let currentProductName = '';

    return parseCsvRows(fs.readFileSync(seedPath, 'utf8'))
        .slice(1)
        .map((columns) => {
            const productName = normalizeText(columns[0]) || currentProductName;
            if (productName) {
                currentProductName = productName;
            }

            const itemCode = normalizeText(columns[1]);
            const itemSet = normalizeSet(columns[2]);
            const componentName = normalizeText(columns[3]);
            const componentQuantity = parseNumber(columns[4]);

            return {
                productName: currentProductName,
                itemCode,
                itemSet,
                componentName,
                componentQuantity,
                componentUnit: inferInventoryUnit(componentName, componentName === currentProductName ? itemSet : '')
            };
        })
        .filter((entry) => entry.productName && entry.itemCode && entry.itemSet && entry.componentName && entry.componentQuantity > 0);
}

function readProcessingSeedRows() {
    const seedPath = getSeedPath('processing');
    if (!seedPath) {
        return [];
    }

    const rows = parseCsvRows(fs.readFileSync(seedPath, 'utf8'));
    const headerIndex = rows.findIndex((row) => normalizeText(row[0]).toUpperCase() === 'DATE' && normalizeText(row[1]).toUpperCase() === 'BRANCH');
    if (headerIndex === -1) {
        return [];
    }

    return rows
        .slice(headerIndex + 1)
        .map((columns) => {
            const itemSet = normalizeSet(columns[9]);

            return {
                saleDate: normalizeDate(columns[0]),
                branch: normalizeOption(columns[1], BRANCHES),
                courier: normalizeOption(columns[2], COURIER_OPTIONS),
                adminName: normalizeOption(columns[3], ADMIN_OPTIONS),
                salesRepresentative: normalizeText(columns[4]),
                clientName: normalizeText(columns[5]),
                clientCode: normalizeText(columns[6]),
                itemSold: normalizeText(columns[7]),
                itemCode: normalizeText(columns[6]),
                itemSet,
                helper: [normalizeText(columns[6]), itemSet].filter(Boolean).join(' | '),
                quantity: parseNumber(columns[8]) || 1,
                unitPrice: parseNumber(columns[10]),
                lineSubtotal: parseNumber(columns[11]),
                orderTotal: parseNumber(columns[12]),
                paymentOption: normalizeOption(columns[13], PAYMENT_OPTIONS),
                paymentAmount: parseNumber(columns[14]),
                collectionAmount: parseNumber(columns[15]),
                opayment: normalizeText(columns[16]),
                upayment: normalizeText(columns[17]),
                note: normalizeText(columns[18]),
                entryUnit: inferInventoryUnit(columns[7], itemSet),
                importKey: buildImportKey('processing', columns)
            };
        })
        .filter((entry) => entry.saleDate && entry.branch && entry.clientName && entry.itemSold);
}

function syncInventoryCatalog(db) {
    const rows = readInventorySeedRows();
    if (!rows.length) {
        return;
    }

    const insertRow = db.prepare(`
        INSERT INTO product_catalog (product_name, item_code, item_set, helper, price, source)
        VALUES (?, ?, ?, ?, ?, 'seed')
    `);

    db.transaction((entries) => {
        entries.forEach((entry) => {
            runIgnoringUniqueConstraint(insertRow, entry.productName, entry.itemCode, entry.itemSet, entry.helper, entry.price);
        });
    })(rows);
}

function syncCompositeComponents(db) {
    const rows = readCompositeComponentRows();
    if (!rows.length) {
        return;
    }

    const insertRow = db.prepare(`
        INSERT INTO composite_components (
            product_name, item_code, item_set, component_name, component_quantity, component_unit, source, import_key
        )
        VALUES (?, ?, ?, ?, ?, ?, 'seed', ?)
    `);

    db.transaction((entries) => {
        entries.forEach((entry) => {
            runIgnoringUniqueConstraint(
                insertRow,
                entry.productName,
                entry.itemCode,
                entry.itemSet,
                entry.componentName,
                entry.componentQuantity,
                entry.componentUnit,
                buildImportKey('composite-component', [
                    entry.productName,
                    entry.itemCode,
                    entry.itemSet,
                    entry.componentName,
                    entry.componentQuantity,
                    entry.componentUnit
                ])
            );
        });
    })(rows);
}

function syncInventoryItems(db) {
    const existingRows = db.prepare(`
        SELECT id, item_name, inventory_unit, item_type, source
        FROM inventory_items
        ORDER BY id ASC
    `).all();
    const existingByKey = new Map();
    existingRows.forEach((row) => {
        const key = getInventoryItemLookupKey(row.item_name, row.inventory_unit);
        if (!existingByKey.has(key)) {
            existingByKey.set(key, row);
        }
    });
    const catalogRows = db.prepare(`
        SELECT DISTINCT product_name, item_set
        FROM product_catalog
    `).all();
    const catalogProductNames = new Set(catalogRows.map((row) => normalizeText(row.product_name).toLowerCase()));
    const componentRows = db.prepare(`
        SELECT DISTINCT component_name, component_unit
        FROM composite_components
    `).all();

    const items = [];
    const seen = new Set();

    catalogRows.forEach((row) => {
        const itemName = normalizeText(row.product_name);
        const inventoryUnit = inferInventoryUnit(itemName, row.item_set);
        const itemType = inferInventoryType(itemName, row.item_set, catalogProductNames);
        if (itemType === 'service') {
            return;
        }

        const key = getInventoryItemLookupKey(itemName, inventoryUnit);
        if (!seen.has(key)) {
            seen.add(key);
            items.push({ itemName, inventoryUnit, itemType });
        }
    });

    componentRows.forEach((row) => {
        const itemName = normalizeText(row.component_name);
        const inventoryUnit = normalizeText(row.component_unit) || inferInventoryUnit(itemName);
        const itemType = inferInventoryType(itemName, '', catalogProductNames);
        if (itemType === 'service') {
            return;
        }

        const key = getInventoryItemLookupKey(itemName, inventoryUnit);
        if (!seen.has(key)) {
            seen.add(key);
            items.push({ itemName, inventoryUnit, itemType });
        }
    });

    const insertRow = buildInventoryItemInsertStatement(db);
    const updateRow = db.prepare(`
        UPDATE inventory_items
        SET item_name = ?,
            inventory_unit = ?,
            item_type = ?,
            source = ?
        WHERE id = ?
    `);

    db.transaction((entries) => {
        entries.forEach((entry) => {
            const key = getInventoryItemLookupKey(entry.itemName, entry.inventoryUnit);
            const existingRow = existingByKey.get(key);
            if (existingRow) {
                const currentItemType = normalizeText(existingRow.item_type);
                const nextItemType = currentItemType.toLowerCase() === 'service'
                    && normalizeText(entry.itemType).toLowerCase() !== 'service'
                    ? entry.itemType
                    : (currentItemType || entry.itemType || 'component');
                const currentSource = normalizeText(existingRow.source) || 'manual';
                const nextSource = currentSource.toLowerCase() !== 'seed'
                    ? currentSource
                    : 'seed';

                if (
                    existingRow.item_name !== entry.itemName
                    || existingRow.inventory_unit !== entry.inventoryUnit
                    || currentItemType !== nextItemType
                    || currentSource !== nextSource
                ) {
                    updateRow.run(
                        entry.itemName,
                        entry.inventoryUnit,
                        nextItemType,
                        nextSource,
                        existingRow.id
                    );
                    existingRow.item_name = entry.itemName;
                    existingRow.inventory_unit = entry.inventoryUnit;
                    existingRow.item_type = nextItemType;
                    existingRow.source = nextSource;
                }
                return;
            }

            const insertedRow = insertInventoryItemIfMissing(
                db,
                insertRow,
                entry.itemName,
                entry.inventoryUnit,
                entry.itemType,
                'seed'
            );
            if (insertedRow) {
                existingByKey.set(key, insertedRow);
            }
        });
    })(items);
}

function ensureInventoryItemMaintenance(db) {
    if (inventoryMaintenanceCompleteDbs.has(db)) {
        return;
    }

    dedupeInventoryItems(db);
    inventoryMaintenanceCompleteDbs.add(db);
}

function dedupeInventoryItems(db) {
    const rows = db.prepare(`
        SELECT id, item_name, inventory_unit, item_type, source
        FROM inventory_items
        ORDER BY id ASC
    `).all();
    if (rows.length < 2) {
        return;
    }

    const seen = new Map();
    const mergeInventoryLevel = db.prepare(`
        INSERT INTO inventory_levels (branch, inventory_item_id, quantity, expiration_date, source, updated_at)
        SELECT branch, ?, quantity, expiration_date, source, updated_at
        FROM inventory_levels
        WHERE inventory_item_id = ?
        ON CONFLICT(branch, inventory_item_id) DO UPDATE SET
            quantity = inventory_levels.quantity + excluded.quantity,
            expiration_date = CASE
                WHEN TRIM(COALESCE(excluded.expiration_date, '')) != '' THEN excluded.expiration_date
                ELSE inventory_levels.expiration_date
            END,
            source = CASE
                WHEN TRIM(COALESCE(excluded.source, '')) != ''
                  AND LOWER(TRIM(COALESCE(excluded.source, ''))) != 'seed'
                    THEN excluded.source
                ELSE inventory_levels.source
            END,
            updated_at = CASE
                WHEN COALESCE(excluded.updated_at, '') > COALESCE(inventory_levels.updated_at, '')
                    THEN excluded.updated_at
                ELSE inventory_levels.updated_at
            END
    `);
    const deleteInventoryLevel = db.prepare(`
        DELETE FROM inventory_levels
        WHERE inventory_item_id = ?
    `);
    const updateInventoryItem = db.prepare(`
        UPDATE inventory_items
        SET item_type = ?,
            source = ?
        WHERE id = ?
    `);
    const deleteInventoryItem = db.prepare(`
        DELETE FROM inventory_items
        WHERE id = ?
    `);

    db.transaction(() => {
        rows.forEach((row) => {
            const lookupKey = getInventoryItemLookupKey(row.item_name, row.inventory_unit);
            const primaryRow = seen.get(lookupKey);
            if (!primaryRow) {
                seen.set(lookupKey, row);
                return;
            }

            const mergedItemType = normalizeText(primaryRow.item_type).toLowerCase() === 'service'
                && normalizeText(row.item_type).toLowerCase() !== 'service'
                ? normalizeText(row.item_type)
                : (normalizeText(primaryRow.item_type) || normalizeText(row.item_type) || 'component');
            const mergedSource = normalizeText(primaryRow.source).toLowerCase() !== 'seed'
                ? normalizeText(primaryRow.source)
                : (normalizeText(row.source) || normalizeText(primaryRow.source) || 'manual');

            updateInventoryItem.run(mergedItemType, mergedSource, primaryRow.id);
            primaryRow.item_type = mergedItemType;
            primaryRow.source = mergedSource;
            mergeInventoryLevel.run(primaryRow.id, row.id);
            deleteInventoryLevel.run(row.id);
            deleteInventoryItem.run(row.id);
        });
    })();
}

function syncInventoryLevels(db) {
    const items = db.prepare(`
        SELECT id
        FROM inventory_items
        WHERE item_type != 'service'
    `).all();
    if (!items.length) {
        return;
    }

    const insertRow = db.prepare(`
        INSERT INTO inventory_levels (branch, inventory_item_id, quantity, source)
        VALUES (?, ?, 0, 'seed')
    `);

    db.transaction((entries) => {
        BRANCHES.forEach((branch) => {
            entries.forEach((entry) => {
                runIgnoringUniqueConstraint(insertRow, branch, entry.id);
            });
        });
    })(items);
}

function syncSalesEntries(db) {
    const rows = readProcessingSeedRows();
    if (!rows.length) {
        return;
    }

    const insertRow = db.prepare(`
        INSERT INTO sales_entries (
            sale_date, branch, cash_branch, courier, admin_name, sales_representative, client_name, client_code,
            item_sold, item_code, item_set, helper, quantity, unit_price, line_subtotal, order_total,
            payment_option, payment_amount, collection_amount, opayment, upayment, note, source, import_key,
            line_index, entry_unit
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, 1, ?)
    `);

    db.transaction((entries) => {
        entries.forEach((entry) => {
            runIgnoringUniqueConstraint(
                insertRow,
                entry.saleDate,
                entry.branch,
                entry.branch,
                entry.courier,
                entry.adminName,
                entry.salesRepresentative,
                entry.clientName,
                entry.clientCode,
                entry.itemSold,
                entry.itemCode,
                entry.itemSet,
                entry.helper,
                entry.quantity,
                entry.unitPrice,
                entry.lineSubtotal,
                entry.orderTotal,
                entry.paymentOption,
                entry.paymentAmount,
                entry.collectionAmount,
                entry.opayment,
                entry.upayment,
                entry.note,
                entry.importKey,
                entry.entryUnit
            );
        });
    })(rows);
}

function listProducts(filter = '') {
    const db = getDb();
    const query = normalizeText(filter);
    const params = [];
    let whereClause = '';

    if (query) {
        whereClause = `
            WHERE LOWER(product_name) LIKE LOWER(?)
               OR item_code LIKE ?
               OR LOWER(item_set) LIKE LOWER(?)
        `;
        params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }

    const rows = db.prepare(`
        SELECT product_name, item_code, item_set, helper, price, source
        FROM product_catalog
        ${whereClause}
        ORDER BY product_name COLLATE NOCASE, item_code COLLATE NOCASE
    `).all(...params);

    return rows
        .map((row) => ({
            ...row,
            inventory_unit: inferInventoryUnit(row.product_name, row.item_set)
        }))
        .sort(compareProductRows);
}

function compareProductRows(left, right) {
    const productCompare = String(left.product_name).localeCompare(String(right.product_name));
    if (productCompare !== 0) {
        return productCompare;
    }

    return getSetRank(left.item_set) - getSetRank(right.item_set);
}

function getSetRank(value) {
    const index = SET_OPTIONS.findIndex((option) => option === normalizeSet(value));
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function listInventory({ branch = '', filter = '' } = {}) {
    const db = getDb();
    const selectedBranch = normalizeOption(branch, BRANCHES) || BRANCHES[0];
    const query = normalizeText(filter);
    const params = [selectedBranch];
    let filterClause = '';

    if (query) {
        filterClause = `
            AND (
                LOWER(ii.item_name) LIKE LOWER(?)
                OR LOWER(ii.inventory_unit) LIKE LOWER(?)
                OR LOWER(ii.item_type) LIKE LOWER(?)
                OR EXISTS (
                    SELECT 1
                    FROM product_catalog pc2
                    WHERE LOWER(pc2.product_name) = LOWER(ii.item_name)
                      AND pc2.item_code LIKE ?
                )
            )
        `;
        params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
    }

    return db.prepare(`
        SELECT
            ii.id AS inventory_id,
            ii.item_name,
            ii.inventory_unit,
            ii.item_type,
            il.branch,
            il.quantity,
            il.expiration_date,
            il.source,
            il.updated_at,
            (
                SELECT pc.item_code
                FROM product_catalog pc
                WHERE LOWER(pc.product_name) = LOWER(ii.item_name)
                ORDER BY pc.item_code COLLATE NOCASE
                LIMIT 1
            ) AS item_code,
            (
                SELECT pc.price
                FROM product_catalog pc
                WHERE LOWER(pc.product_name) = LOWER(ii.item_name)
                ORDER BY pc.price DESC
                LIMIT 1
            ) AS catalog_price
        FROM inventory_levels il
        JOIN inventory_items ii ON ii.id = il.inventory_item_id
        WHERE il.branch = ?
          AND ii.item_type != 'service'
          ${filterClause}
        ORDER BY
            CASE ii.item_type WHEN 'product' THEN 0 ELSE 1 END,
            ii.item_name COLLATE NOCASE
    `).all(...params);
}

function updateInventoryQuantity({
    branch,
    inventoryId,
    quantity,
    adjustmentType = '',
    adjustmentQuantity,
    expirationDate,
    hasExpirationDateOverride = false
}) {
    const db = getDb();
    const selectedBranch = normalizeOption(branch, BRANCHES);
    const normalizedId = Number(inventoryId);
    const operation = normalizeText(adjustmentType).toLowerCase();
    const normalizedQuantity = parseNumber(quantity);

    if (!selectedBranch) {
        throw new Error('Branch is required.');
    }

    if (!normalizedId) {
        throw new Error('Inventory item is required.');
    }

    const currentRow = db.prepare(`
        SELECT quantity, expiration_date
        FROM inventory_levels
        WHERE branch = ? AND inventory_item_id = ?
        LIMIT 1
    `).get(selectedBranch, normalizedId);
    const currentQuantity = parseNumber(currentRow?.quantity);
    const currentExpirationDate = normalizeInventoryExpirationDate(currentRow?.expiration_date, { allowEmpty: true });
    const shouldApplyExpirationOverride = Boolean(hasExpirationDateOverride);
    const validOperations = ['add', 'minus', 'damage', 'set'];

    if (operation && !validOperations.includes(operation)) {
        throw new Error('Invalid inventory adjustment type.');
    }

    let nextQuantity = currentQuantity;
    let nextExpirationDate = currentExpirationDate;
    let source = 'manual_set';

    if (shouldApplyExpirationOverride) {
        nextExpirationDate = normalizeInventoryExpirationDate(expirationDate, { allowEmpty: true });
    }

    if (operation === 'add' || operation === 'minus' || operation === 'damage') {
        const delta = Math.abs(parseNumber(adjustmentQuantity));
        if (!(delta > 0)) {
            throw new Error('Adjustment quantity must be greater than zero.');
        }

        if (operation === 'add') {
            nextQuantity = currentQuantity + delta;
        } else {
            nextQuantity = currentQuantity - delta;
        }

        source = `manual_${operation}`;
    } else if (operation === 'set' || (!operation && hasProvidedValue(quantity))) {
        nextQuantity = normalizedQuantity;
        source = 'manual_set';
    } else if (shouldApplyExpirationOverride) {
        source = 'manual_expiration';
    } else {
        throw new Error('Quantity or expiration date is required.');
    }

    db.prepare(`
        INSERT INTO inventory_levels (branch, inventory_item_id, quantity, expiration_date, source, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(branch, inventory_item_id) DO UPDATE SET
            quantity = excluded.quantity,
            expiration_date = excluded.expiration_date,
            source = excluded.source,
            updated_at = CURRENT_TIMESTAMP
    `).run(selectedBranch, normalizedId, nextQuantity, nextExpirationDate || null, source);

    return db.prepare(`
        SELECT
            ii.id AS inventory_id,
            ii.item_name,
            ii.inventory_unit,
            ii.item_type,
            il.branch,
            il.quantity,
            il.expiration_date,
            il.updated_at
        FROM inventory_levels il
        JOIN inventory_items ii ON ii.id = il.inventory_item_id
        WHERE il.branch = ? AND il.inventory_item_id = ?
        LIMIT 1
    `).get(selectedBranch, normalizedId);
}

function deleteInventoryItem({ branch = '', inventoryId } = {}) {
    const db = getDb();
    const selectedBranch = normalizeOption(branch, BRANCHES);
    const normalizedId = Number(inventoryId);

    if (!selectedBranch) {
        throw new Error('Branch is required.');
    }

    if (!normalizedId) {
        throw new Error('Inventory item is required.');
    }

    const inventoryRow = db.prepare(`
        SELECT id, item_name, inventory_unit
        FROM inventory_items
        WHERE id = ?
        LIMIT 1
    `).get(normalizedId);

    if (!inventoryRow) {
        throw new Error('Inventory item not found.');
    }

    const branchLevelRow = db.prepare(`
        SELECT quantity
        FROM inventory_levels
        WHERE branch = ?
          AND inventory_item_id = ?
        LIMIT 1
    `).get(selectedBranch, normalizedId);

    if (!branchLevelRow) {
        throw new Error('Inventory item not found for the selected branch.');
    }

    const linkedCatalogCount = Number(db.prepare(`
        SELECT COUNT(1) AS total
        FROM product_catalog
        WHERE LOWER(product_name) = LOWER(?)
    `).get(inventoryRow.item_name)?.total || 0);

    const linkedCompositeCount = Number(db.prepare(`
        SELECT COUNT(1) AS total
        FROM composite_components
        WHERE LOWER(component_name) = LOWER(?)
          AND LOWER(component_unit) = LOWER(?)
    `).get(inventoryRow.item_name, inventoryRow.inventory_unit)?.total || 0);

    if (linkedCatalogCount > 0 || linkedCompositeCount > 0) {
        throw new Error('This item is linked to Pricing or Composite. Delete it there first.');
    }

    const deletionResult = db.transaction(() => {
        const levelResult = db.prepare(`
            DELETE FROM inventory_levels
            WHERE inventory_item_id = ?
        `).run(normalizedId);

        const itemResult = db.prepare(`
            DELETE FROM inventory_items
            WHERE id = ?
        `).run(normalizedId);

        return {
            deletedLevels: Number(levelResult.changes || 0),
            deletedItems: Number(itemResult.changes || 0)
        };
    })();

    return {
        deleted: deletionResult.deletedItems > 0,
        branch: selectedBranch,
        inventory_id: normalizedId,
        item_name: inventoryRow.item_name,
        inventory_unit: inventoryRow.inventory_unit,
        deleted_levels: deletionResult.deletedLevels,
        deleted_items: deletionResult.deletedItems
    };
}

function listCompositeItems(filter = '') {
    const db = getDb();
    const query = normalizeText(filter);
    const params = [];
    let whereClause = '';

    if (query) {
        whereClause = `
            WHERE LOWER(product_name) LIKE LOWER(?)
               OR item_code LIKE ?
               OR LOWER(item_set) LIKE LOWER(?)
               OR LOWER(component_name) LIKE LOWER(?)
        `;
        params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
    }

    const rows = db.prepare(`
        SELECT product_name, item_code, item_set, component_name, component_quantity, component_unit, source
        FROM composite_components
        ${whereClause}
        ORDER BY product_name COLLATE NOCASE, item_code COLLATE NOCASE
    `).all(...params);

    const grouped = new Map();

    rows.forEach((row) => {
        const key = [row.product_name, row.item_code, row.item_set].join('||');
        if (!grouped.has(key)) {
            grouped.set(key, {
                product_name: row.product_name,
                item_code: row.item_code,
                item_set: row.item_set,
                source: row.source,
                parts: [],
                components: []
            });
        }

        const currentGroup = grouped.get(key);
        currentGroup.parts.push(`${row.component_name} x${formatQuantity(row.component_quantity)} ${row.component_unit}`.trim());
        currentGroup.components.push({
            name: row.component_name,
            quantity: Number(row.component_quantity || 0),
            unit: row.component_unit || ''
        });
    });

    return Array.from(grouped.values())
        .map((entry) => ({
            composite_key: [entry.product_name, entry.item_code, entry.item_set].join('||'),
            product_name: entry.product_name,
            item_code: entry.item_code,
            item_set: entry.item_set,
            source: entry.source,
            detail_text: entry.parts.join(' | '),
            components: entry.components
        }))
        .sort(compareProductRows);
}

function normalizeCompositePayload(payload = {}) {
    const productName = normalizeText(payload.product_name || payload.productName);
    const itemCode = normalizeText(payload.item_code || payload.itemCode);
    const itemSet = normalizeSet(payload.item_set || payload.itemSet || payload.set_name || payload.setName);
    const rawComponents = Array.isArray(payload.components) ? payload.components : [];
    const components = rawComponents
        .map((entry) => {
            const name = normalizeText(entry.component_name || entry.name || entry.componentName);
            const quantity = parseNumber(entry.component_quantity ?? entry.quantity ?? entry.componentQuantity);
            const unit = normalizeText(entry.component_unit || entry.unit || entry.componentUnit) || inferInventoryUnit(name, itemSet);
            return {
                componentName: name,
                componentQuantity: quantity,
                componentUnit: unit
            };
        })
        .filter((entry) => entry.componentName && entry.componentQuantity > 0);

    if (!productName) {
        throw new Error('Composite product name is required.');
    }
    if (!itemCode) {
        throw new Error('Composite item code is required.');
    }
    if (!itemSet) {
        throw new Error('Composite set is required.');
    }
    if (!components.length) {
        throw new Error('At least one composite component is required.');
    }

    return {
        productName,
        itemCode,
        itemSet,
        components
    };
}

function upsertCompositeItem(payload = {}) {
    const db = getDb();
    const composite = normalizeCompositePayload(payload);
    const deleteByCodeAndSet = db.prepare(`
        DELETE FROM composite_components
        WHERE item_code = ?
          AND LOWER(item_set) = LOWER(?)
    `);
    const deleteByProductAndSet = db.prepare(`
        DELETE FROM composite_components
        WHERE LOWER(product_name) = LOWER(?)
          AND LOWER(item_set) = LOWER(?)
    `);
    const insertRow = db.prepare(`
        INSERT INTO composite_components (
            product_name, item_code, item_set, component_name, component_quantity, component_unit, source, import_key
        )
        VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)
    `);

    db.transaction(() => {
        deleteByCodeAndSet.run(composite.itemCode, composite.itemSet);
        deleteByProductAndSet.run(composite.productName, composite.itemSet);

        composite.components.forEach((component, index) => {
            insertRow.run(
                composite.productName,
                composite.itemCode,
                composite.itemSet,
                component.componentName,
                component.componentQuantity,
                component.componentUnit,
                buildImportKey('manual-composite-component', [
                    composite.productName,
                    composite.itemCode,
                    composite.itemSet,
                    component.componentName,
                    component.componentQuantity,
                    component.componentUnit,
                    index + 1,
                    Date.now()
                ])
            );
        });

        syncInventoryItems(db);
        syncInventoryLevels(db);
    })();

    const compositeKey = [composite.productName, composite.itemCode, composite.itemSet].join('||');
    return listCompositeItems('').find((entry) => entry.composite_key === compositeKey) || {
        composite_key: compositeKey,
        product_name: composite.productName,
        item_code: composite.itemCode,
        item_set: composite.itemSet,
        source: 'manual',
        detail_text: composite.components
            .map((component) => `${component.componentName} x${formatQuantity(component.componentQuantity)} ${component.componentUnit}`.trim())
            .join(' | '),
        components: composite.components.map((component) => ({
            name: component.componentName,
            quantity: component.componentQuantity,
            unit: component.componentUnit
        }))
    };
}

function deleteCompositeItem(compositeKey = '') {
    const [productName, itemCode, itemSet] = String(compositeKey || '').split('||').map((entry) => normalizeText(entry));
    if (!productName || !itemCode || !itemSet) {
        throw new Error('Composite key is required.');
    }

    const db = getDb();
    const result = db.prepare(`
        DELETE FROM composite_components
        WHERE LOWER(product_name) = LOWER(?)
          AND item_code = ?
          AND LOWER(item_set) = LOWER(?)
    `).run(productName, itemCode, itemSet);

    if (!Number(result.changes || 0)) {
        throw new Error('Composite item not found.');
    }

    return {
        deleted: true,
        changes: Number(result.changes || 0),
        composite_key: [productName, itemCode, itemSet].join('||')
    };
}

function getProductVariant(db, { helper = '', productName = '', itemSet = '', itemCode = '' }) {
    const normalizedHelper = normalizeText(helper);
    if (normalizedHelper) {
        return db.prepare(`
            SELECT product_name, item_code, item_set, helper, price, source
            FROM product_catalog
            WHERE helper = ?
            LIMIT 1
        `).get(normalizedHelper);
    }

    const normalizedProductName = normalizeText(productName);
    const normalizedSet = normalizeSet(itemSet);
    const normalizedCode = normalizeText(itemCode);

    if (normalizedProductName && normalizedSet) {
        return db.prepare(`
            SELECT product_name, item_code, item_set, helper, price, source
            FROM product_catalog
            WHERE LOWER(product_name) = LOWER(?)
              AND LOWER(item_set) = LOWER(?)
            LIMIT 1
        `).get(normalizedProductName, normalizedSet);
    }

    if (normalizedCode && normalizedSet) {
        return db.prepare(`
            SELECT product_name, item_code, item_set, helper, price, source
            FROM product_catalog
            WHERE item_code = ?
              AND LOWER(item_set) = LOWER(?)
            LIMIT 1
        `).get(normalizedCode, normalizedSet);
    }

    if (normalizedProductName) {
        return db.prepare(`
            SELECT product_name, item_code, item_set, helper, price, source
            FROM product_catalog
            WHERE LOWER(product_name) = LOWER(?)
            ORDER BY price DESC
            LIMIT 1
        `).get(normalizedProductName);
    }

    return null;
}

function getInventoryItemByNameUnit(db, itemName, inventoryUnit) {
    return db.prepare(`
        SELECT id, item_name, inventory_unit, item_type, source
        FROM inventory_items
        WHERE LOWER(item_name) = LOWER(?)
          AND LOWER(inventory_unit) = LOWER(?)
        ORDER BY id ASC
        LIMIT 1
    `).get(normalizeText(itemName), normalizeText(inventoryUnit));
}

function buildInventoryItemInsertStatement(db) {
    return db.prepare(`
        INSERT INTO inventory_items (item_name, inventory_unit, item_type, source)
        SELECT ?, ?, ?, ?
        WHERE NOT EXISTS (
            SELECT 1
            FROM inventory_items
            WHERE LOWER(item_name) = LOWER(?)
              AND LOWER(inventory_unit) = LOWER(?)
        )
    `);
}

function insertInventoryItemIfMissing(db, statement, itemName, inventoryUnit, itemType, source = 'manual') {
    const normalizedItemName = normalizeText(itemName);
    const normalizedInventoryUnit = normalizeText(inventoryUnit);
    const normalizedItemType = normalizeText(itemType) || 'component';
    const normalizedSource = normalizeText(source) || 'manual';

    if (!normalizedItemName || !normalizedInventoryUnit) {
        return null;
    }

    runIgnoringUniqueConstraint(
        statement,
        normalizedItemName,
        normalizedInventoryUnit,
        normalizedItemType,
        normalizedSource,
        normalizedItemName,
        normalizedInventoryUnit
    );

    return getInventoryItemByNameUnit(db, normalizedItemName, normalizedInventoryUnit);
}

function getOrCreateInventoryItem(db, itemName, inventoryUnit, itemType) {
    let row = getInventoryItemByNameUnit(db, itemName, inventoryUnit);
    if (row) {
        return row;
    }

    const insertInventoryItem = buildInventoryItemInsertStatement(db);
    row = insertInventoryItemIfMissing(
        db,
        insertInventoryItem,
        itemName,
        inventoryUnit,
        itemType,
        'manual'
    );
    return row;
}

function ensureInventoryLevelRow(db, branch, inventoryItemId) {
    const insertInventoryLevel = db.prepare(`
        INSERT INTO inventory_levels (branch, inventory_item_id, quantity, source)
        VALUES (?, ?, 0, 'manual')
    `);
    runIgnoringUniqueConstraint(insertInventoryLevel, branch, inventoryItemId);
}

function applyInventoryDelta(db, branch, itemName, inventoryUnit, itemType, deltaQuantity) {
    const inventoryItem = getOrCreateInventoryItem(db, itemName, inventoryUnit, itemType);
    if (!inventoryItem || inventoryItem.item_type === 'service') {
        return;
    }

    ensureInventoryLevelRow(db, branch, inventoryItem.id);
    db.prepare(`
        UPDATE inventory_levels
        SET quantity = quantity + ?,
            source = 'manual',
            updated_at = CURRENT_TIMESTAMP
        WHERE branch = ?
          AND inventory_item_id = ?
    `).run(deltaQuantity, branch, inventoryItem.id);
}

function getInventoryExpirationByNameUnit(db, branch, itemName, inventoryUnit) {
    return db.prepare(`
        SELECT il.expiration_date
        FROM inventory_levels il
        JOIN inventory_items ii ON ii.id = il.inventory_item_id
        WHERE LOWER(il.branch) = LOWER(?)
          AND LOWER(ii.item_name) = LOWER(?)
          AND LOWER(ii.inventory_unit) = LOWER(?)
        LIMIT 1
    `).get(
        normalizeText(branch),
        normalizeText(itemName),
        normalizeText(inventoryUnit)
    );
}

function assertInventoryNotExpiredForSale(db, branch, itemName, inventoryUnit) {
    const levelRow = getInventoryExpirationByNameUnit(db, branch, itemName, inventoryUnit);
    const expirationDate = normalizeInventoryExpirationDate(levelRow?.expiration_date, { allowEmpty: true });
    if (!expirationDate) {
        return;
    }

    const todayDateKey = sqliteStore.getDateKey(new Date());
    if (expirationDate < todayDateKey) {
        throw new Error(`Cannot sell expired stock: ${normalizeText(itemName)} (${normalizeText(inventoryUnit)}) expired on ${expirationDate}.`);
    }
}

function resolveRecipeRows(db, variant) {
    const rows = db.prepare(`
        SELECT component_name, component_quantity, component_unit
        FROM composite_components
        WHERE item_code = ?
          AND LOWER(item_set) = LOWER(?)
        ORDER BY id ASC
    `).all(variant.item_code, variant.item_set);

    if (rows.length) {
        return rows;
    }

    return db.prepare(`
        SELECT component_name, component_quantity, component_unit
        FROM composite_components
        WHERE LOWER(product_name) = LOWER(?)
          AND LOWER(item_set) = LOWER(?)
        ORDER BY id ASC
    `).all(variant.product_name, variant.item_set);
}

function buildCompositeReceiptDetailText(db, variant = {}, orderedQuantity = 1) {
    const productName = normalizeText(variant.product_name || variant.productName);
    const itemCode = normalizeText(variant.item_code || variant.itemCode);
    const itemSet = normalizeSet(variant.item_set || variant.itemSet);
    const normalizedOrderedQuantity = Math.max(0, Number(orderedQuantity || 0)) || 1;
    if (!productName || !itemSet) {
        return '';
    }

    const recipeRows = resolveRecipeRows(db, {
        product_name: productName,
        item_code: itemCode,
        item_set: itemSet
    });

    return recipeRows
        .map((row) => {
            const componentName = normalizeText(row.component_name);
            const componentQuantity = formatQuantity(Number(row.component_quantity || 0) * normalizedOrderedQuantity);
            const componentUnit = normalizeText(row.component_unit) || inferInventoryUnit(componentName, itemSet);
            return `${componentQuantity} ${componentUnit} - ${componentName}`.trim();
        })
        .filter(Boolean)
        .join('\n\n');
}

function applyInventoryForLine(db, branch, variant, quantity, direction = -1) {
    const normalizedQuantity = Math.abs(Number(quantity || 0));
    if (!normalizedQuantity) {
        return;
    }

    const recipeRows = resolveRecipeRows(db, variant);

    if (direction < 0) {
        if (!recipeRows.length) {
            const inventoryUnit = inferInventoryUnit(variant.product_name, variant.item_set);
            assertInventoryNotExpiredForSale(db, branch, variant.product_name, inventoryUnit);
        } else {
            recipeRows.forEach((component) => {
                const componentUnit = normalizeText(component.component_unit) || inferInventoryUnit(component.component_name);
                assertInventoryNotExpiredForSale(db, branch, component.component_name, componentUnit);
            });
        }
    }

    if (!recipeRows.length) {
        applyInventoryDelta(
            db,
            branch,
            variant.product_name,
            inferInventoryUnit(variant.product_name, variant.item_set),
            'product',
            direction * normalizedQuantity
        );
        return;
    }

    recipeRows.forEach((component) => {
        const componentUnit = normalizeText(component.component_unit) || inferInventoryUnit(component.component_name);
        applyInventoryDelta(
            db,
            branch,
            component.component_name,
            componentUnit,
            inferInventoryUnit(component.component_name) === 'Pcs' ? 'component' : 'product',
            direction * normalizedQuantity * Number(component.component_quantity || 0)
        );
    });
}

function deductInventoryForLine(db, branch, variant, quantity) {
    applyInventoryForLine(db, branch, variant, quantity, -1);
}

function restockInventoryForLine(db, branch, variant, quantity) {
    applyInventoryForLine(db, branch, variant, quantity, 1);
}

function buildOrderNumber(db, saleDate) {
    const compactDate = normalizeText(saleDate).replace(/-/g, '') || normalizeDate(new Date()).replace(/-/g, '');
    const prefix = `ORD-${compactDate}-`;
    const latestRow = db.prepare(`
        SELECT order_number
        FROM sales_entries
        WHERE order_number LIKE ?
        ORDER BY order_number DESC
        LIMIT 1
    `).get(`${prefix}%`);

    const latestSequence = latestRow?.order_number?.match(/-(\d{4})$/)?.[1];
    const nextSequence = Number(latestSequence || 0) + 1;
    return `${prefix}${String(nextSequence).padStart(4, '0')}`;
}

function previewNextOrderNumber(saleDate = '') {
    const db = getDb();
    return buildOrderNumber(db, normalizeDate(saleDate || new Date()));
}

function derivePaymentType({ orderTotal = 0, amountPaid = 0 }) {
    return Math.max(0, parseNumber(amountPaid)) >= Math.max(0, parseNumber(orderTotal))
        ? PAYMENT_TYPE_OPTIONS[0]
        : PAYMENT_TYPE_OPTIONS[1];
}

function computePaymentSummary({ paymentType, baseTotal, amountPaid, deliveryFee, deliveryFeeToCollect, courier }) {
    const normalizedBaseTotal = Math.max(0, parseNumber(baseTotal));
    const normalizedAmountPaid = Math.max(0, parseNumber(amountPaid));
    const normalizedDeliveryFee = Math.max(0, parseNumber(deliveryFee));
    const includeDeliveryFee = parseBoolean(deliveryFeeToCollect);
    const normalizedCourier = normalizeText(courier);

    const orderTotal = normalizedBaseTotal + (includeDeliveryFee ? normalizedDeliveryFee : 0);
    const remainingAmount = Math.max(orderTotal - normalizedAmountPaid, 0);
    const normalizedPaymentType = derivePaymentType({ orderTotal, amountPaid: normalizedAmountPaid });
    const useCourierCollection = isCourierCollectionManaged(normalizedCourier) && remainingAmount > 0;
    let underpaymentAmount = 0;
    let overpaymentAmount = 0;
    const collectionAmount = remainingAmount;

    underpaymentAmount = useCourierCollection ? 0 : remainingAmount;
    overpaymentAmount = Math.max(normalizedAmountPaid - orderTotal, 0);

    return {
        paymentType: normalizedPaymentType,
        baseTotal: normalizedBaseTotal,
        amountPaid: normalizedAmountPaid,
        deliveryFee: normalizedDeliveryFee,
        deliveryFeeToCollect: includeDeliveryFee,
        remainingAmount,
        orderTotal,
        collectionAmount,
        overpaymentAmount,
        underpaymentAmount
    };
}

function buildSaleEntryData(db, payload, existingOrder = null) {
    const saleDate = normalizeDate(payload.saleDate || existingOrder?.sale_date || new Date());
    const branchInput = normalizeText(payload.branch ?? existingOrder?.branch);
    const cashBranchInput = normalizeText(
        payload.cashBranch
        ?? payload.collectionBranch
        ?? existingOrder?.cash_branch
        ?? existingOrder?.branch
        ?? payload.branch
    );
    const courierInput = normalizeText(payload.courier ?? existingOrder?.courier);
    const adminInput = normalizeText(payload.adminName ?? existingOrder?.admin_name);
    const salesRepresentativeInput = normalizeText(payload.salesRepresentative ?? existingOrder?.sales_representative);
    const orderStatusInput = normalizeText(payload.orderStatus ?? existingOrder?.order_status);
    const branch = normalizeStrictOption(branchInput, BRANCHES);
    const cashBranch = cashBranchInput
        ? normalizeStrictOption(cashBranchInput, BRANCHES)
        : branch;
    const courier = normalizeStrictOption(courierInput, COURIER_OPTIONS);
    const configuredAdmins = getConfiguredOrderFormList('admins');
    const configuredSalesRepresentatives = getConfiguredOrderFormList('salesRepresentatives');
    const adminName = configuredAdmins.length
        ? normalizeStrictOption(adminInput, configuredAdmins)
        : normalizeText(adminInput);
    const salesRepresentative = configuredSalesRepresentatives.length
        ? normalizeStrictOption(salesRepresentativeInput, configuredSalesRepresentatives)
        : normalizeText(salesRepresentativeInput);
    const clientName = normalizeText(payload.clientName ?? existingOrder?.client_name);
    const clientContact = normalizeText(payload.clientContact ?? existingOrder?.client_contact);
    const clientAddress = normalizeText(payload.clientAddress ?? existingOrder?.client_address);
    const paymentMethodBreakdown = normalizePaymentMethodBreakdown(
        payload.paymentMethodBreakdown ?? existingOrder?.payment_method_breakdown,
        payload.paymentMethods
            || payload.paymentMethod
            || payload.paymentOption
            || existingOrder?.payment_method
            || existingOrder?.payment_option,
        payload.amountPaid ?? payload.paymentAmount ?? existingOrder?.payment_amount
    );
    const paymentAmount = paymentMethodBreakdown.length
        ? sumPaymentMethodBreakdown(paymentMethodBreakdown)
        : parseNumber(payload.amountPaid ?? payload.paymentAmount ?? existingOrder?.payment_amount);
    const hasExplicitDeliveryFee = normalizeText(payload.deliveryFee ?? existingOrder?.delivery_fee) !== '';
    const requestedDeliveryFee = hasExplicitDeliveryFee
        ? parseNumber(payload.deliveryFee ?? existingOrder?.delivery_fee)
        : getSuggestedHandlingFee(courier, branch);
    const deliveryFeeToCollect = parseBoolean(payload.deliveryFeeToCollect ?? existingOrder?.delivery_fee_to_collect);
    const inventoryDeductedInput = payload.inventoryDeducted ?? payload.deductInventory ?? existingOrder?.inventory_deducted;
    const inventoryDeducted = hasProvidedValue(inventoryDeductedInput)
        ? parseBoolean(inventoryDeductedInput)
        : true;
    const orderStatus = orderStatusInput
        ? normalizeStrictOption(orderStatusInput, ORDER_STATUS_OPTIONS)
        : '';
    const note = normalizeText(payload.note ?? existingOrder?.note);
    const lineItems = Array.isArray(payload.items) && payload.items.length ? payload.items : [payload];

    if (!saleDate) {
        throw new Error('Sale date is required.');
    }

    if (!branch) {
        throw new Error(branchInput ? 'Branch must match a valid option.' : 'Branch is required.');
    }

    if (!cashBranch) {
        throw new Error(cashBranchInput ? 'Cash branch must match a valid option.' : 'Cash branch is required.');
    }

    if (!courier) {
        throw new Error(courierInput ? 'Courier must match a valid option.' : 'Courier is required.');
    }

    if (!adminName) {
        throw new Error(
            adminInput
                ? (configuredAdmins.length ? 'Admin must match a valid option.' : 'Admin is required.')
                : 'Admin is required.'
        );
    }

    if (!salesRepresentative) {
        throw new Error(
            salesRepresentativeInput
                ? (configuredSalesRepresentatives.length ? 'Sales representative must match a valid option.' : 'Sales representative is required.')
                : 'Sales representative is required.'
        );
    }

    if (!clientName) {
        throw new Error('Client name is required.');
    }

    if (!lineItems.length) {
        throw new Error('At least one receipt item is required.');
    }

    const normalizedItems = lineItems.map((item, index) => {
        const variant = getProductVariant(db, {
            helper: item.helper,
            productName: item.itemSold || item.productName,
            itemSet: item.itemSet,
            itemCode: item.itemCode
        });

        if (!variant) {
            throw new Error(`Product variant not found for line ${index + 1}.`);
        }

        const quantity = parseNumber(item.quantity) || 1;
        if (quantity <= 0) {
            throw new Error(`Quantity must be greater than zero on line ${index + 1}.`);
        }

        const unitPrice = hasProvidedValue(item.unitPrice)
            ? parseNumber(item.unitPrice)
            : parseNumber(variant.price);
        const lineSubtotal = quantity * unitPrice;

        return {
            variant,
            quantity,
            unitPrice,
            lineSubtotal,
            itemSold: normalizeText(item.itemSold) || variant.product_name,
            itemCode: normalizeText(item.itemCode) || variant.item_code,
            itemSet: normalizeSet(item.itemSet) || variant.item_set,
            helper: normalizeText(item.helper) || variant.helper,
            entryUnit: normalizeText(item.entryUnit) || inferInventoryUnit(variant.product_name, variant.item_set)
        };
    });

    const baseTotal = hasProvidedValue(payload.baseTotal)
        ? parseNumber(payload.baseTotal)
        : normalizedItems.reduce((sum, item) => sum + item.lineSubtotal, 0);
    const paymentSummary = computePaymentSummary({
        baseTotal,
        amountPaid: paymentAmount,
        deliveryFee: requestedDeliveryFee,
        deliveryFeeToCollect,
        courier
    });
    const paymentMethods = resolvePaymentMethods({
        paymentMethods: paymentMethodBreakdown.map((entry) => entry.method),
        courier,
        paymentSummary
    });
    const paymentMethod = paymentMethods.join(' + ');

    if (paymentSummary.paymentType === 'Full Paid' && paymentSummary.remainingAmount > 0) {
        throw new Error('Full Paid orders cannot have an underpayment.');
    }

    if (paymentSummary.paymentType === 'Full Paid' && !paymentMethods.length) {
        throw new Error('Full Paid orders require at least one valid payment method.');
    }

    if (paymentSummary.paymentType === 'Partial' && paymentSummary.amountPaid > 0 && !paymentMethods.length) {
        throw new Error('Partial orders require at least one valid payment method.');
    }

    const orderNumber = normalizeText(payload.orderNumber)
        || normalizeText(existingOrder?.order_number)
        || normalizeText(existingOrder?.receipt_number)
        || buildOrderNumber(db, saleDate);
    const receiptNumber = normalizeText(payload.receiptNumber)
        || normalizeText(existingOrder?.receipt_number)
        || orderNumber;

    return {
        saleDate,
        branch,
        cashBranch,
        courier,
        adminName,
        salesRepresentative,
        clientName,
        clientContact,
        clientAddress,
        paymentMethodBreakdown,
        paymentMethods,
        paymentMethod,
        orderStatus,
        note,
        normalizedItems,
        paymentSummary,
        inventoryDeducted,
        orderNumber,
        receiptNumber
    };
}

function insertSaleRows(db, saleEntryData) {
    const insertRow = db.prepare(`
        INSERT INTO sales_entries (
            sale_date, branch, cash_branch, courier, admin_name, sales_representative, client_name, client_code,
            item_sold, item_code, item_set, helper, quantity, unit_price, line_subtotal, order_total,
            payment_option, payment_amount, collection_amount, opayment, upayment, note, source, import_key,
            receipt_number, line_index, client_contact, client_address, delivery_label, entry_unit,
            order_number, order_status, payment_type, payment_method, payment_method_breakdown, base_total, delivery_fee,
            delivery_fee_to_collect, overpayment_amount, underpayment_amount, inventory_deducted
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const {
        saleDate,
        branch,
        cashBranch,
        courier,
        adminName,
        salesRepresentative,
        clientName,
        clientContact,
        clientAddress,
        paymentMethod,
        paymentMethodBreakdown,
        orderStatus,
        note,
        normalizedItems,
        paymentSummary,
        inventoryDeducted,
        orderNumber,
        receiptNumber
    } = saleEntryData;
    const opayment = paymentSummary.overpaymentAmount > 0 ? formatMoney(paymentSummary.overpaymentAmount) : '';
    const upayment = paymentSummary.underpaymentAmount > 0 ? formatMoney(paymentSummary.underpaymentAmount) : '';
    const insertedEntries = [];

    normalizedItems.forEach((item, index) => {
        const result = insertRow.run(
            saleDate,
            branch,
            cashBranch,
            courier,
            adminName,
            salesRepresentative,
            clientName,
            item.itemCode,
            item.itemSold,
            item.itemCode,
            item.itemSet,
            item.helper,
            item.quantity,
            item.unitPrice,
            item.lineSubtotal,
            index === 0 ? paymentSummary.orderTotal : 0,
            paymentMethod,
            index === 0 ? paymentSummary.amountPaid : 0,
            index === 0 ? paymentSummary.collectionAmount : 0,
            opayment,
            upayment,
            note,
            'manual',
            buildImportKey('manual-sale', [orderNumber, index + 1, item.itemCode, item.itemSet, item.quantity, item.unitPrice]),
            receiptNumber,
            index + 1,
            clientContact,
            clientAddress,
            courier,
            item.entryUnit,
            orderNumber,
            orderStatus,
            paymentSummary.paymentType,
            paymentMethod,
            index === 0 ? serializePaymentMethodBreakdown(paymentMethodBreakdown) : '',
            index === 0 ? paymentSummary.baseTotal : 0,
            index === 0 ? paymentSummary.deliveryFee : 0,
            index === 0 ? (paymentSummary.deliveryFeeToCollect ? 1 : 0) : 0,
            index === 0 ? paymentSummary.overpaymentAmount : 0,
            index === 0 ? paymentSummary.underpaymentAmount : 0,
            inventoryDeducted ? 1 : 0
        );

        insertedEntries.push(db.prepare('SELECT * FROM sales_entries WHERE id = ? LIMIT 1').get(result.lastInsertRowid));
        if (inventoryDeducted) {
            deductInventoryForLine(db, branch, item.variant, item.quantity);
        }
    });

    return insertedEntries;
}

function buildSaleResponse(db, saleEntryData, items) {
    return {
        orderNumber: saleEntryData.orderNumber,
        receiptNumber: saleEntryData.receiptNumber,
        cashBranch: saleEntryData.cashBranch,
        paymentType: saleEntryData.paymentSummary.paymentType,
        paymentMethod: saleEntryData.paymentMethod,
        paymentMethods: saleEntryData.paymentMethods,
        paymentMethodBreakdown: saleEntryData.paymentMethodBreakdown,
        totalItems: saleEntryData.normalizedItems.length,
        orderTotal: saleEntryData.paymentSummary.orderTotal,
        paymentAmount: saleEntryData.paymentSummary.amountPaid,
        remainingAmount: saleEntryData.paymentSummary.remainingAmount,
        collectionAmount: saleEntryData.paymentSummary.collectionAmount,
        deliveryFee: saleEntryData.paymentSummary.deliveryFee,
        inventoryDeducted: Boolean(saleEntryData.inventoryDeducted),
        overpaymentAmount: saleEntryData.paymentSummary.overpaymentAmount,
        underpaymentAmount: saleEntryData.paymentSummary.underpaymentAmount,
        items: saleEntryData.normalizedItems.map((item, index) => {
            const persistedRow = Array.isArray(items) ? (items[index] || {}) : {};
            const compositeDetailText = buildCompositeReceiptDetailText(db, {
                product_name: item.variant?.product_name || item.itemSold,
                item_code: item.itemCode,
                item_set: item.itemSet
            }, item.quantity);

            return {
                ...persistedRow,
                itemSold: item.itemSold,
                itemCode: item.itemCode,
                itemSet: item.itemSet,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                lineSubtotal: item.lineSubtotal,
                compositeDetailText,
                composite_detail_text: compositeDetailText
            };
        })
    };
}

function getOrderRowsByLookup(db, orderLookup) {
    const lookupValue = normalizeText(orderLookup);
    if (!lookupValue) {
        return [];
    }

    return db.prepare(`
        SELECT *
        FROM sales_entries
        WHERE LOWER(COALESCE(order_number, '')) = LOWER(?)
           OR LOWER(COALESCE(receipt_number, '')) = LOWER(?)
        ORDER BY line_index ASC, id ASC
    `).all(lookupValue, lookupValue);
}

function getSaleOrder(orderLookup) {
    const db = getDb();
    const rows = getOrderRowsByLookup(db, orderLookup);
    if (!rows.length) {
        throw new Error('Order not found.');
    }

    const header = rows.find((row) => Number(row.line_index || 0) === 1) || rows[0];
    const paymentMethodBreakdown = normalizePaymentMethodBreakdown(
        header.payment_method_breakdown,
        header.payment_method || header.payment_option,
        header.payment_amount
    );
    const paymentSummary = computePaymentSummary({
        baseTotal: Number(header.base_total ?? header.order_total ?? 0),
        amountPaid: Number(header.payment_amount ?? 0),
        deliveryFee: Number(header.delivery_fee ?? 0),
        deliveryFeeToCollect: Boolean(Number(header.delivery_fee_to_collect ?? 0)),
        courier: header.courier || ''
    });

    return {
        orderNumber: header.order_number || header.receipt_number || normalizeText(orderLookup),
        receiptNumber: header.receipt_number || header.order_number || normalizeText(orderLookup),
        saleDate: header.sale_date || '',
        branch: header.branch || '',
        cashBranch: header.cash_branch || header.branch || '',
        courier: header.courier || '',
        adminName: header.admin_name || '',
        salesRepresentative: header.sales_representative || '',
        clientName: header.client_name || '',
        clientContact: header.client_contact || '',
        clientAddress: header.client_address || '',
        paymentType: paymentSummary.paymentType,
        paymentMethod: buildReportPaymentLabel(header),
        paymentMethods: paymentMethodBreakdown.map((entry) => entry.method),
        paymentMethodBreakdown,
        orderStatus: header.order_status || '',
        note: header.note || '',
        baseTotal: Number(header.base_total ?? header.order_total ?? 0),
        orderTotal: Number(header.order_total ?? header.base_total ?? 0),
        paymentAmount: Number(header.payment_amount ?? 0),
        amountPaid: Number(header.payment_amount ?? 0),
        remainingAmount: paymentSummary.remainingAmount,
        collectionAmount: Number(header.collection_amount ?? paymentSummary.collectionAmount ?? 0),
        deliveryFee: paymentSummary.deliveryFee,
        deliveryFeeToCollect: paymentSummary.deliveryFeeToCollect,
        inventoryDeducted: parseBoolean(header.inventory_deducted ?? 1),
        overpaymentAmount: Number(header.overpayment_amount ?? paymentSummary.overpaymentAmount ?? 0),
        underpaymentAmount: Number(header.underpayment_amount ?? paymentSummary.underpaymentAmount ?? 0),
        items: rows.map((row) => ({
            lineId: row.id,
            itemSold: row.item_sold || '',
            productName: row.item_sold || '',
            itemCode: row.item_code || '',
            itemSet: row.item_set || '',
            helper: row.helper || '',
            quantity: Number(row.quantity ?? 0),
            unitPrice: Number(row.unit_price ?? 0),
            lineSubtotal: Number(row.line_subtotal ?? 0),
            entryUnit: row.entry_unit || '',
            compositeDetailText: buildCompositeReceiptDetailText(db, {
                product_name: row.item_sold,
                item_code: row.item_code,
                item_set: row.item_set
            }, row.quantity)
        }))
    };
}

function addSaleEntry(payload) {
    const db = getDb();
    const saleEntryData = buildSaleEntryData(db, payload);
    let insertedEntries = [];

    db.transaction(() => {
        insertedEntries = insertSaleRows(db, saleEntryData);
        syncLinkedCashIncomeEntry(db, saleEntryData);
        if (shouldPersistClientProfile(saleEntryData)) {
            sqliteStore.saveClientProfile({
                name: saleEntryData.clientName,
                contactNumber: saleEntryData.clientContact,
                address: saleEntryData.clientAddress,
                source: 'manual'
            });
        }
    })();

    return buildSaleResponse(db, saleEntryData, insertedEntries);
}

function updateSaleOrder(orderLookup, payload) {
    const db = getDb();
    const existingRows = getOrderRowsByLookup(db, orderLookup);
    if (!existingRows.length) {
        throw new Error('Order not found.');
    }

    const existingHeader = existingRows.find((row) => Number(row.line_index || 0) === 1) || existingRows[0];
    const saleEntryData = buildSaleEntryData(db, payload, existingHeader);
    const existingIds = existingRows.map((row) => Number(row.id)).filter(Boolean);
    const deleteRows = existingIds.length
        ? db.prepare(`DELETE FROM sales_entries WHERE id IN (${existingIds.map(() => '?').join(', ')})`)
        : null;
    let insertedEntries = [];

    db.transaction(() => {
        existingRows.forEach((row) => {
            if (!parseBoolean(row.inventory_deducted ?? 1)) {
                return;
            }
            const variant = getProductVariant(db, {
                helper: row.helper,
                productName: row.item_sold,
                itemSet: row.item_set,
                itemCode: row.item_code
            }) || {
                product_name: row.item_sold,
                item_code: row.item_code,
                item_set: row.item_set
            };

            restockInventoryForLine(db, row.branch, variant, Number(row.quantity || 0));
        });

        if (deleteRows) {
            deleteRows.run(...existingIds);
        }

        insertedEntries = insertSaleRows(db, saleEntryData);
        syncLinkedCashIncomeEntry(db, saleEntryData);
        if (shouldPersistClientProfile(saleEntryData)) {
            sqliteStore.saveClientProfile({
                name: saleEntryData.clientName,
                contactNumber: saleEntryData.clientContact,
                address: saleEntryData.clientAddress,
                source: 'manual'
            });
        }
    })();

    return buildSaleResponse(db, saleEntryData, insertedEntries);
}

function deleteSaleOrder(orderLookup) {
    const db = getDb();
    const existingRows = getOrderRowsByLookup(db, orderLookup);
    if (!existingRows.length) {
        throw new Error('Order not found.');
    }

    const existingHeader = existingRows.find((row) => Number(row.line_index || 0) === 1) || existingRows[0];
    const existingIds = existingRows.map((row) => Number(row.id)).filter(Boolean);
    const deleteRows = existingIds.length
        ? db.prepare(`DELETE FROM sales_entries WHERE id IN (${existingIds.map(() => '?').join(', ')})`)
        : null;

    db.transaction(() => {
        existingRows.forEach((row) => {
            if (!parseBoolean(row.inventory_deducted ?? 1)) {
                return;
            }
            const variant = getProductVariant(db, {
                helper: row.helper,
                productName: row.item_sold,
                itemSet: row.item_set,
                itemCode: row.item_code
            }) || {
                product_name: row.item_sold,
                item_code: row.item_code,
                item_set: row.item_set
            };

            restockInventoryForLine(db, row.branch, variant, Number(row.quantity || 0));
        });

        if (deleteRows) {
            deleteRows.run(...existingIds);
        }

        deleteLinkedCashIncomeEntries(
            db,
            existingHeader.order_number || normalizeText(orderLookup),
            existingHeader.receipt_number || existingHeader.order_number || normalizeText(orderLookup)
        );
    })();

    return {
        orderNumber: existingHeader.order_number || existingHeader.receipt_number || normalizeText(orderLookup),
        receiptNumber: existingHeader.receipt_number || existingHeader.order_number || normalizeText(orderLookup),
        deletedRows: existingRows.length
    };
}

function addExpenseEntry(payload) {
    return saveFinancialEntry({
        tableName: 'expense_entries',
        dateField: 'expense_date',
        dateValue: payload.expenseDate || payload.date || new Date(),
        branch: payload.branch,
        about: payload.about || payload.description || payload.purpose,
        amount: payload.amount,
        note: payload.note,
        entryLabel: 'Expense'
    });
}

function updateExpenseEntry(entryId, payload) {
    return updateFinancialEntry({
        tableName: 'expense_entries',
        dateField: 'expense_date',
        entryId,
        payload,
        entryLabel: 'Expense'
    });
}

function deleteExpenseEntry(entryId) {
    return deleteFinancialEntry({
        tableName: 'expense_entries',
        entryId,
        entryLabel: 'Expense'
    });
}

function clearExpenseEntries() {
    return clearFinancialEntries({
        tableName: 'expense_entries',
        entryLabel: 'Expense'
    });
}

function addCashIncomeEntry(payload) {
    return saveFinancialEntry({
        tableName: 'cash_income_entries',
        dateField: 'income_date',
        dateValue: payload.incomeDate || payload.cashIncomeDate || payload.date || new Date(),
        branch: payload.branch,
        about: payload.about || payload.description || payload.purpose,
        amount: payload.amount,
        confirmationStatus: payload.confirmationStatus || payload.status,
        note: payload.note,
        entryLabel: 'Cash income'
    });
}

function updateCashIncomeEntry(entryId, payload) {
    return updateFinancialEntry({
        tableName: 'cash_income_entries',
        dateField: 'income_date',
        entryId,
        payload,
        entryLabel: 'Cash income'
    });
}

function deleteCashIncomeEntry(entryId) {
    return deleteFinancialEntry({
        tableName: 'cash_income_entries',
        entryId,
        entryLabel: 'Cash income'
    });
}

function clearCashIncomeEntries() {
    return clearFinancialEntries({
        tableName: 'cash_income_entries',
        entryLabel: 'Cash income',
        whereClause: 'WHERE COALESCE(auto_generated, 0) = 0',
        successMessage: 'Manual cash income records cleared.'
    });
}

function parseEntryId(value, entryLabel) {
    const parsed = Number.parseInt(String(value || ''), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${entryLabel} id is invalid.`);
    }

    return parsed;
}

function saveFinancialEntry({ tableName, dateField, dateValue, branch, about, amount, confirmationStatus, note, entryLabel }) {
    const db = getDb();
    const normalizedDate = normalizeDate(dateValue);
    const branchInput = normalizeText(branch);
    const normalizedBranch = normalizeStrictOption(branchInput, BRANCHES);
    const normalizedAbout = normalizeText(about);
    const normalizedAmount = parseNumber(amount);
    const normalizedNote = normalizeText(note);

    if (!normalizedDate) {
        throw new Error(`${entryLabel} date is required.`);
    }

    if (!normalizedBranch) {
        throw new Error(branchInput ? 'Branch must match a valid option.' : 'Branch is required.');
    }

    if (!normalizedAbout) {
        throw new Error(`${entryLabel} about is required.`);
    }

    if (normalizedAmount <= 0) {
        throw new Error(`${entryLabel} amount must be greater than zero.`);
    }

    const isCashIncomeTable = tableName === 'cash_income_entries';
    const normalizedConfirmationStatus = isCashIncomeTable
        ? normalizeCashIncomeStatus(confirmationStatus, 'Confirmed')
        : '';
    const result = isCashIncomeTable
        ? db.prepare(`
            INSERT INTO ${tableName} (${dateField}, branch, about, amount, note, source, auto_generated, confirmation_status)
            VALUES (?, ?, ?, ?, ?, 'manual', 0, ?)
        `).run(normalizedDate, normalizedBranch, normalizedAbout, normalizedAmount, normalizedNote, normalizedConfirmationStatus)
        : db.prepare(`
            INSERT INTO ${tableName} (${dateField}, branch, about, amount, note, source)
            VALUES (?, ?, ?, ?, ?, 'manual')
        `).run(normalizedDate, normalizedBranch, normalizedAbout, normalizedAmount, normalizedNote);

    return db.prepare(`
        SELECT *
        FROM ${tableName}
        WHERE id = ?
        LIMIT 1
    `).get(result.lastInsertRowid);
}

function updateFinancialEntry({ tableName, dateField, entryId, payload, entryLabel }) {
    const db = getDb();
    const id = parseEntryId(entryId, entryLabel);
    const existing = db.prepare(`
        SELECT *
        FROM ${tableName}
        WHERE id = ?
        LIMIT 1
    `).get(id);

    if (!existing) {
        throw new Error(`${entryLabel} entry not found.`);
    }

    const nextDate = payload.expenseDate
        ?? payload.incomeDate
        ?? payload.cashIncomeDate
        ?? payload.date
        ?? existing[dateField];
    const nextBranch = payload.branch ?? existing.branch;
    const nextAbout = payload.about ?? payload.description ?? payload.purpose ?? existing.about;
    const nextAmount = payload.amount ?? existing.amount;
    const nextNote = payload.note ?? existing.note;
    const nextConfirmationStatus = tableName === 'cash_income_entries'
        ? normalizeCashIncomeStatus(
            payload.confirmationStatus
            ?? payload.status
            ?? existing.confirmation_status
            ?? existing.confirmationStatus,
            'Confirmed'
        )
        : '';

    const normalizedDate = normalizeDate(nextDate);
    const branchInput = normalizeText(nextBranch);
    const normalizedBranch = normalizeStrictOption(branchInput, BRANCHES);
    const normalizedAbout = normalizeText(nextAbout);
    const normalizedAmount = parseNumber(nextAmount);
    const normalizedNote = normalizeText(nextNote);

    if (!normalizedDate) {
        throw new Error(`${entryLabel} date is required.`);
    }

    if (!normalizedBranch) {
        throw new Error(branchInput ? 'Branch must match a valid option.' : 'Branch is required.');
    }

    if (!normalizedAbout) {
        throw new Error(`${entryLabel} about is required.`);
    }

    if (normalizedAmount <= 0) {
        throw new Error(`${entryLabel} amount must be greater than zero.`);
    }

    if (tableName === 'cash_income_entries') {
        db.prepare(`
            UPDATE ${tableName}
            SET ${dateField} = ?, branch = ?, about = ?, amount = ?, note = ?, confirmation_status = ?
            WHERE id = ?
        `).run(normalizedDate, normalizedBranch, normalizedAbout, normalizedAmount, normalizedNote, nextConfirmationStatus, id);
    } else {
        db.prepare(`
            UPDATE ${tableName}
            SET ${dateField} = ?, branch = ?, about = ?, amount = ?, note = ?
            WHERE id = ?
        `).run(normalizedDate, normalizedBranch, normalizedAbout, normalizedAmount, normalizedNote, id);
    }

    return db.prepare(`
        SELECT *
        FROM ${tableName}
        WHERE id = ?
        LIMIT 1
    `).get(id);
}

function deleteFinancialEntry({ tableName, entryId, entryLabel }) {
    const db = getDb();
    const id = parseEntryId(entryId, entryLabel);
    const result = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(id);

    if (!result.changes) {
        throw new Error(`${entryLabel} entry not found.`);
    }

    return {
        deleted: true,
        id
    };
}

function clearFinancialEntries({ tableName, entryLabel, whereClause = '', successMessage = '' }) {
    const db = getDb();
    const result = db.prepare(`DELETE FROM ${tableName} ${whereClause}`).run();

    return {
        cleared: true,
        deletedCount: result.changes,
        message: successMessage || `${entryLabel} records cleared.`
    };
}

function getFinancialSummaryAmount(row, tableName = '') {
    if (tableName === 'cash_income_entries') {
        const status = normalizeCashIncomeStatus(row.confirmation_status || row.confirmationStatus, 'Confirmed');
        if (status !== 'Confirmed') {
            return 0;
        }
    }

    return Number(row.amount || 0);
}

function summarizeFinancialRows(rows, branches = BRANCHES, { tableName = '' } = {}) {
    const branchTotals = branches.reduce((totals, branch) => {
        totals[branch] = 0;
        return totals;
    }, {});
    const kindTotals = tableName === 'cash_income_entries'
        ? CASH_INCOME_KIND_OPTIONS.reduce((totals, kind) => {
            totals[kind] = {
                totalAmount: 0,
                confirmedAmount: 0,
                pendingAmount: 0
            };
            return totals;
        }, {})
        : null;

    rows.forEach((row) => {
        const branch = normalizeStrictOption(row.branch, branches);
        const summaryAmount = getFinancialSummaryAmount(row, tableName);
        if (branch) {
            branchTotals[branch] += summaryAmount;
        }

        if (kindTotals) {
            const kind = getCashIncomeKind(row);
            if (kind && kindTotals[kind]) {
                kindTotals[kind].totalAmount += Number(row.amount || 0);
                kindTotals[kind].confirmedAmount += summaryAmount;
                if (normalizeCashIncomeStatus(row.confirmation_status || row.confirmationStatus, 'Confirmed') === 'Pending') {
                    kindTotals[kind].pendingAmount += Number(row.amount || 0);
                }
            }
        }
    });

    const totalAmount = rows.reduce((sum, row) => sum + getFinancialSummaryAmount(row, tableName), 0);
    const pendingAmount = tableName === 'cash_income_entries'
        ? rows.reduce((sum, row) => sum + (normalizeCashIncomeStatus(row.confirmation_status || row.confirmationStatus, 'Confirmed') === 'Pending'
            ? Number(row.amount || 0)
            : 0), 0)
        : 0;

    const kindBreakdown = kindTotals
        ? Object.fromEntries(
            Object.entries(kindTotals).map(([kind, values]) => [
                kind,
                {
                    totalAmount: values.totalAmount,
                    totalAmountDisplay: formatMoney(values.totalAmount),
                    confirmedAmount: values.confirmedAmount,
                    confirmedAmountDisplay: formatMoney(values.confirmedAmount),
                    pendingAmount: values.pendingAmount,
                    pendingAmountDisplay: formatMoney(values.pendingAmount)
                }
            ])
        )
        : {};

    return {
        totalCount: rows.length,
        totalAmount,
        totalAmountDisplay: formatMoney(totalAmount),
        pendingAmount,
        pendingAmountDisplay: formatMoney(pendingAmount),
        byBranch: branchTotals,
        kindBreakdown,
        branchBreakdown: branches.map((branch) => ({
            label: branch,
            value: branchTotals[branch] || 0,
            displayValue: formatMoney(branchTotals[branch] || 0)
        }))
    };
}

function listFinancialEntries({ tableName, dateField, filters = {} }) {
    const db = getDb();
    const clauses = [];
    const params = [];

    if (tableName === 'cash_income_entries') {
        clauses.push(`
            NOT (
                auto_generated = 1
                AND (
                    LOWER(COALESCE(income_kind, '')) = 'lbc_collection'
                    OR UPPER(TRIM(COALESCE(about, ''))) LIKE 'LBC/%'
                )
            )
        `);
    }

    if (normalizeText(filters.dateFrom)) {
        clauses.push(`${dateField} >= ?`);
        params.push(normalizeDate(filters.dateFrom));
    }

    if (normalizeText(filters.dateTo)) {
        clauses.push(`${dateField} <= ?`);
        params.push(normalizeDate(filters.dateTo));
    }

    if (normalizeText(filters.branch)) {
        clauses.push('LOWER(branch) = LOWER(?)');
        params.push(normalizeText(filters.branch));
    }

    if (normalizeText(filters.search)) {
        clauses.push(`
            (
                LOWER(about) LIKE LOWER(?)
                OR LOWER(note) LIKE LOWER(?)
            )
        `);
        params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const items = db.prepare(`
        SELECT *
        FROM ${tableName}
        ${whereClause}
        ORDER BY ${dateField} DESC, id DESC
    `).all(...params);

    return {
        items,
        summary: summarizeFinancialRows(items, BRANCHES, { tableName })
    };
}

function getSalesAmount(row) {
    const receiptNumber = normalizeText(row.receipt_number);
    const orderTotal = Number(row.base_total || row.order_total || 0);

    if (receiptNumber) {
        return orderTotal > 0 ? orderTotal : 0;
    }

    if (orderTotal > 0) {
        return orderTotal;
    }

    return String(row.source || '').toLowerCase() === 'seed'
        ? 0
        : Number(row.line_subtotal || 0);
}

function getSalesOrderGroupKey(row = {}) {
    return normalizeText(row.receipt_number || row.order_number || row.id || '');
}

function buildBreakdown(rows, field) {
    const totals = new Map();

    rows.forEach((row) => {
        const key = normalizeText(row[field]) || 'Unspecified';
        totals.set(key, (totals.get(key) || 0) + getSalesAmount(row));
    });

    return Array.from(totals.entries())
        .map(([label, value]) => ({ label, value, displayValue: formatMoney(value) }))
        .sort((left, right) => right.value - left.value);
}

function buildPaymentBreakdown(rows) {
    const totals = new Map();

    rows.forEach((row) => {
        buildReportPaymentEntries(row).forEach((entry) => {
            totals.set(entry.label, (totals.get(entry.label) || 0) + entry.value);
        });
    });

    return Array.from(totals.entries())
        .map(([label, value]) => ({ label, value, displayValue: formatMoney(value) }))
        .sort((left, right) => right.value - left.value);
}

function countOrders(rows) {
    const receipts = new Set();
    let singleOrderCount = 0;

    rows.forEach((row) => {
        const receiptNumber = normalizeText(row.receipt_number);
        if (receiptNumber) {
            receipts.add(receiptNumber);
            return;
        }

        if (Number(row.order_total || 0) > 0 || String(row.source || '').toLowerCase() === 'manual') {
            singleOrderCount += 1;
        }
    });

    return receipts.size + singleOrderCount;
}

function listSales(filters = {}) {
    const db = getDb();
    const clauses = [];
    const params = [];
    const useCashBranchMetrics = !normalizeText(filters.branch) && Boolean(normalizeText(filters.cashBranch));
    const salesBranchField = useCashBranchMetrics ? 'cash_branch' : 'branch';

    if (normalizeText(filters.dateFrom)) {
        clauses.push('sale_date >= ?');
        params.push(normalizeDate(filters.dateFrom));
    }

    if (normalizeText(filters.dateTo)) {
        clauses.push('sale_date <= ?');
        params.push(normalizeDate(filters.dateTo));
    }

    if (normalizeText(filters.branch)) {
        clauses.push('LOWER(branch) = LOWER(?)');
        params.push(normalizeText(filters.branch));
    }

    if (normalizeText(filters.cashBranch)) {
        clauses.push('LOWER(COALESCE(cash_branch, branch)) = LOWER(?)');
        params.push(normalizeText(filters.cashBranch));
    }

    if (normalizeText(filters.adminName)) {
        clauses.push('LOWER(admin_name) = LOWER(?)');
        params.push(normalizeText(filters.adminName));
    }

    if (normalizeText(filters.salesRepresentative)) {
        clauses.push('LOWER(sales_representative) = LOWER(?)');
        params.push(normalizeText(filters.salesRepresentative));
    }

    if (normalizeText(filters.search)) {
        clauses.push(`
            (
                LOWER(client_name) LIKE LOWER(?)
                OR LOWER(item_sold) LIKE LOWER(?)
                OR item_code LIKE ?
                OR LOWER(note) LIKE LOWER(?)
                OR LOWER(receipt_number) LIKE LOWER(?)
                OR LOWER(order_number) LIKE LOWER(?)
                OR LOWER(COALESCE(cash_branch, branch)) LIKE LOWER(?)
            )
        `);
        params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rawItems = db.prepare(`
        SELECT *
        FROM sales_entries
        ${whereClause}
        ORDER BY sale_date DESC, receipt_number DESC, line_index ASC, id DESC
    `).all(...params);
    const paymentContextByGroup = new Map();

    rawItems.forEach((row) => {
        const key = getSalesOrderGroupKey(row);
        if (!key) {
            return;
        }

        const currentHeader = paymentContextByGroup.get(key);
        if (!currentHeader || Number(row.order_total || 0) > 0 || Number(row.line_index || 0) === 1) {
            paymentContextByGroup.set(key, row);
        }
    });

    const requestedPayment = normalizeText(filters.paymentOption);
    const items = rawItems
        .map((row) => {
            const paymentContext = paymentContextByGroup.get(getSalesOrderGroupKey(row)) || row;
            return {
                ...row,
                report_payment_label: buildReportPaymentLabel(paymentContext),
                report_payment_parts: buildReportPaymentParts(paymentContext)
            };
        })
        .filter((row) => {
            if (!requestedPayment) {
                return true;
            }

            return normalizeText(row.report_payment_label) === requestedPayment
                || (row.report_payment_parts || []).some((label) => normalizeText(label) === requestedPayment);
        });

    const totalSales = items.reduce((sum, row) => sum + getSalesAmount(row), 0);
    const totalPayments = items.reduce((sum, row) => sum + Number(row.payment_amount || 0), 0);
    const totalCollections = items.reduce((sum, row) => sum + Number(row.collection_amount || 0), 0);
    const branchSalesTotals = BRANCHES.reduce((totals, branch) => {
        totals[branch] = 0;
        return totals;
    }, {});

    items.forEach((row) => {
        const branch = normalizeStrictOption(row[salesBranchField], BRANCHES);
        if (branch) {
            branchSalesTotals[branch] += getSalesAmount(row);
        }
    });

    const financialBranchFilter = normalizeText(filters.branch) || normalizeText(filters.cashBranch);

    const expenseSummary = listFinancialEntries({
        tableName: 'expense_entries',
        dateField: 'expense_date',
        filters: {
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
            branch: financialBranchFilter
        }
    }).summary;
    const cashIncomeSummary = listFinancialEntries({
        tableName: 'cash_income_entries',
        dateField: 'income_date',
        filters: {
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
            branch: financialBranchFilter
        }
    }).summary;
    const cashNetAmount = cashIncomeSummary.totalAmount - expenseSummary.totalAmount;
    const netAmount = totalSales + cashIncomeSummary.totalAmount - expenseSummary.totalAmount;
    const branchFinancialBreakdown = BRANCHES.map((branch) => {
        const sales = branchSalesTotals[branch] || 0;
        const expenses = expenseSummary.byBranch?.[branch] || 0;
        const cashIncome = cashIncomeSummary.byBranch?.[branch] || 0;
        const cashNet = cashIncome - expenses;
        const net = sales + cashIncome - expenses;

        return {
            label: branch,
            sales,
            salesDisplay: formatMoney(sales),
            expenses,
            expensesDisplay: formatMoney(expenses),
            cashIncome,
            cashIncomeDisplay: formatMoney(cashIncome),
            cashNet,
            cashNetDisplay: formatMoney(cashNet),
            net,
            netDisplay: formatMoney(net)
        };
    });

    return {
        items,
        summary: {
            totalOrders: countOrders(items),
            totalSales,
            totalSalesDisplay: formatMoney(totalSales),
            totalPayments,
            totalPaymentsDisplay: formatMoney(totalPayments),
            totalCollections,
            totalCollectionsDisplay: formatMoney(totalCollections),
            branchBreakdown: buildBreakdown(items, salesBranchField),
            cashBranchBreakdown: buildBreakdown(items, 'cash_branch'),
            paymentBreakdown: buildPaymentBreakdown(items),
            adminBreakdown: buildBreakdown(items, 'admin_name'),
            salesRepBreakdown: buildBreakdown(items, 'sales_representative'),
            expenseSummary,
            cashIncomeSummary,
            cashNetAmount,
            cashNetAmountDisplay: formatMoney(cashNetAmount),
            netAmount,
            netAmountDisplay: formatMoney(netAmount),
            branchFinancialBreakdown
        }
    };
}

function selectPreferredLbcOrderHeader(currentHeader, candidateHeader) {
    if (!currentHeader) {
        return candidateHeader;
    }

    const currentIsHeader = Number(currentHeader.line_index || 0) === 1;
    const candidateIsHeader = Number(candidateHeader.line_index || 0) === 1;
    if (!currentIsHeader && candidateIsHeader) {
        return candidateHeader;
    }

    const currentOrderTotal = Number(currentHeader.order_total || 0);
    const candidateOrderTotal = Number(candidateHeader.order_total || 0);
    if (candidateOrderTotal > currentOrderTotal) {
        return candidateHeader;
    }

    if (String(candidateHeader.sale_date || '') > String(currentHeader.sale_date || '')) {
        return candidateHeader;
    }

    if (Number(candidateHeader.id || 0) > Number(currentHeader.id || 0)) {
        return candidateHeader;
    }

    return currentHeader;
}

function listLbcOrderHeaders(db, { branch = '', dateFrom = '' } = {}) {
    const selectedBranch = resolveLbcTrackingBranch(branch);
    const normalizedDateFrom = normalizeDate(dateFrom);
    const clauses = [
        `UPPER(TRIM(COALESCE(courier, ''))) = 'LBC'`,
        `(LOWER(branch) = LOWER(?) OR LOWER(branch) = LOWER(?))`
    ];
    const params = [LBC_TRACKING_BRANCHES[0], LBC_TRACKING_BRANCHES[1]];

    if (selectedBranch) {
        clauses.push('LOWER(branch) = LOWER(?)');
        params.push(selectedBranch);
    }
    if (normalizedDateFrom) {
        clauses.push('sale_date >= ?');
        params.push(normalizedDateFrom);
    }

    const rows = db.prepare(`
        SELECT *
        FROM sales_entries
        WHERE ${clauses.join(' AND ')}
        ORDER BY sale_date DESC, id DESC
    `).all(...params);

    const groupedHeaders = new Map();
    rows.forEach((row) => {
        const orderKey = getSalesOrderGroupKey(row);
        if (!orderKey) {
            return;
        }

        const currentHeader = groupedHeaders.get(orderKey);
        groupedHeaders.set(orderKey, selectPreferredLbcOrderHeader(currentHeader, row));
    });

    return Array.from(groupedHeaders.values())
        .sort((left, right) => {
            if (String(right.sale_date || '') !== String(left.sale_date || '')) {
                return String(right.sale_date || '').localeCompare(String(left.sale_date || ''));
            }
            return Number(right.id || 0) - Number(left.id || 0);
        });
}

function getLbcTrackingRowMap(db, orderKeys = []) {
    if (!orderKeys.length) {
        return new Map();
    }

    const placeholders = orderKeys.map(() => '?').join(', ');
    const rows = db.prepare(`
        SELECT *
        FROM lbc_tracking_entries
        WHERE order_key IN (${placeholders})
           OR order_number IN (${placeholders})
           OR receipt_number IN (${placeholders})
    `).all(...orderKeys, ...orderKeys, ...orderKeys);

    const rowMap = new Map();
    rows.forEach((row) => {
        const rowSortKey = normalizeText(row.updated_at || row.updatedAt || row.created_at || row.createdAt || '');
        [
            row.order_key,
            row.orderKey,
            row.order_number,
            row.orderNumber,
            row.receipt_number,
            row.receiptNumber
        ].forEach((value) => {
            const key = normalizeActorValue(value);
            if (!key) {
                return;
            }

            const currentRow = rowMap.get(key);
            const currentSortKey = normalizeText(
                currentRow?.updated_at || currentRow?.updatedAt || currentRow?.created_at || currentRow?.createdAt || ''
            );
            if (!currentRow || rowSortKey >= currentSortKey) {
                rowMap.set(key, row);
            }
        });
    });

    return rowMap;
}

function buildLbcTrackingItem({ orderRow, trackingRow = null, assignee = null } = {}) {
    const orderKey = getSalesOrderGroupKey(orderRow);
    const resolvedBranch = resolveLbcTrackingBranch(orderRow.branch) || normalizeText(orderRow.branch);
    const normalizedOrderStatus = normalizeStrictOption(orderRow.order_status, ORDER_STATUS_OPTIONS)
        || normalizeText(orderRow.order_status);
    const trackingNumber = normalizeText(trackingRow?.tracking_number || trackingRow?.trackingNumber || '');
    const rawDeliveryStatus = normalizeLbcTrackingStatus(
        trackingRow?.delivery_status || trackingRow?.deliveryStatus,
        trackingNumber ? 'In Transit' : 'Pending'
    );
    const collectionStatus = normalizeLbcCollectionStatus(
        trackingRow?.collection_status || trackingRow?.collectionStatus,
        'Pending'
    );
    const trackedAmountSource = trackingRow?.amount_to_collect ?? trackingRow?.amountToCollect;
    const amountToCollect = hasProvidedValue(trackedAmountSource)
        ? Number(Math.max(0, parseNumber(trackedAmountSource)).toFixed(2))
        : Number(getLbcOrderCollectionAmount(orderRow).toFixed(2));
    const resolvedAssignee = assignee || resolveLbcTrackingAssignee(orderRow);
    const assignedUserId = normalizeText(trackingRow?.assigned_user_id || resolvedAssignee.assignedUserId || '');
    const assignedTo = normalizeText(trackingRow?.assigned_to || resolvedAssignee.assignedTo || resolvedAssignee.assignmentSource || '');
    const hasTrackingNumber = Boolean(trackingNumber);
    const deliveryStatus = hasTrackingNumber ? rawDeliveryStatus : 'Pending';
    const shipmentStatus = deriveLbcShipmentStatus({
        orderStatus: orderRow.order_status || '',
        deliveryStatus,
        trackingNumber
    });
    const missingTrackingAfterShipment = !hasTrackingNumber && normalizeText(normalizedOrderStatus).toLowerCase() === 'shipped';
    const collectionStatusEffective = normalizeLbcTrackingStatus(deliveryStatus, 'In Transit') === 'Delivered'
        ? collectionStatus
        : 'Pending';

    return {
        orderKey,
        orderNumber: normalizeText(orderRow.order_number || orderRow.receipt_number || orderKey),
        receiptNumber: normalizeText(orderRow.receipt_number || orderRow.order_number || orderKey),
        saleDate: normalizeText(orderRow.sale_date || ''),
        branch: resolvedBranch,
        clientName: normalizeText(orderRow.client_name || ''),
        courier: normalizeText(orderRow.courier || ''),
        paymentMethod: buildReportPaymentLabel(orderRow),
        orderStatus: normalizedOrderStatus,
        shipmentStatus,
        shipmentStage: shipmentStatus,
        trackingNumber,
        hasTrackingNumber,
        missingTrackingAfterShipment,
        amountToCollect,
        amountToCollectDisplay: formatMoney(amountToCollect),
        deliveryStatus,
        collectionStatus: collectionStatusEffective,
        collectionConfirmedBy: normalizeText(trackingRow?.collection_confirmed_by || trackingRow?.collectionConfirmedBy || ''),
        collectionConfirmedAt: normalizeText(trackingRow?.collection_confirmed_at || trackingRow?.collectionConfirmedAt || ''),
        collectionActionRequired: normalizeLbcTrackingStatus(deliveryStatus, 'In Transit') === 'Delivered' && collectionStatusEffective !== 'Confirmed',
        dateMonitored: normalizeText(trackingRow?.date_monitored || trackingRow?.dateMonitored || ''),
        assignedTo,
        assignedUserId,
        adminName: normalizeText(orderRow.admin_name || ''),
        salesRepresentative: normalizeText(orderRow.sales_representative || ''),
        updatedBy: normalizeText(trackingRow?.updated_by || trackingRow?.updatedBy || ''),
        updatedAt: normalizeText(trackingRow?.updated_at || trackingRow?.updatedAt || '')
    };
}

function listLbcTracking({ branch = '', search = '', deliveryStatus = '', quickFilter = 'all', dateFrom = '' } = {}) {
    const db = getDb();
    const users = sqliteStore.listUsers?.('', '') || [];
    const userLookups = buildUserLookupMaps(users);
    const effectiveDateFrom = normalizeDate(dateFrom) || getCurrentMonthStartDateKey();
    const headers = listLbcOrderHeaders(db, { branch, dateFrom: effectiveDateFrom });
    const orderKeys = headers.map((row) => getSalesOrderGroupKey(row)).filter(Boolean);
    const trackingRowMap = getLbcTrackingRowMap(db, orderKeys);

    const requestedStatus = normalizeLbcTrackingStatus(deliveryStatus, '');
    const requestedSearch = normalizeText(search).toLowerCase();
    const requestedQuickFilter = normalizeLbcQuickFilter(quickFilter);
    const visibleItems = headers
        .map((row) => {
            const orderKey = getSalesOrderGroupKey(row);
            const trackingRow = trackingRowMap.get(normalizeActorValue(orderKey)) || null;
            const assignee = resolveLbcTrackingAssignee(row, userLookups);
            return buildLbcTrackingItem({
                orderRow: row,
                trackingRow,
                assignee
            });
        })
        .filter((row) => {
            if (requestedStatus && normalizeLbcTrackingStatus(row.deliveryStatus, '') !== requestedStatus) {
                return false;
            }

            if (!requestedSearch) {
                return true;
            }

            const haystack = [
                row.orderNumber,
                row.receiptNumber,
                row.clientName,
                row.branch,
                row.trackingNumber,
                row.assignedTo,
                row.adminName,
                row.salesRepresentative,
                row.deliveryStatus
            ].join(' ').toLowerCase();

            return haystack.includes(requestedSearch);
        });
    const quickFilterSummary = buildLbcQuickFilterSummary(visibleItems);
    const items = visibleItems.filter((row) => matchesLbcQuickFilter(row, requestedQuickFilter));

    const byBranch = LBC_TRACKING_BRANCHES.reduce((totals, branchName) => {
        totals[branchName] = 0;
        return totals;
    }, {});
    const byStatus = LBC_TRACKING_STATUS_OPTIONS.reduce((totals, status) => {
        totals[status] = 0;
        return totals;
    }, {});
    const byShipmentStage = LBC_SHIPMENT_STAGE_OPTIONS.reduce((totals, stage) => {
        totals[stage] = 0;
        return totals;
    }, {});
    const problemSummary = {
        noTrackingNumber: 0,
        rts: 0,
        rto: 0,
        inTransit: 0,
        pendingShipment: 0,
        delivered: 0,
        concern: 0
    };

    visibleItems.forEach((row) => {
        if (Object.prototype.hasOwnProperty.call(byBranch, row.branch)) {
            byBranch[row.branch] += 1;
        }
        if (Object.prototype.hasOwnProperty.call(byStatus, row.deliveryStatus)) {
            byStatus[row.deliveryStatus] += 1;
        }
        if (Object.prototype.hasOwnProperty.call(byShipmentStage, row.shipmentStatus)) {
            byShipmentStage[row.shipmentStatus] += 1;
        }
        if (!row.hasTrackingNumber) {
            problemSummary.noTrackingNumber += 1;
        }
        const deliveryStatusBucket = getLbcDeliveryStatusBucket(row.deliveryStatus);
        if (deliveryStatusBucket === 'rts') {
            problemSummary.rts += 1;
        }
        if (deliveryStatusBucket === 'rto') {
            problemSummary.rto += 1;
        }
        if (deliveryStatusBucket === 'in_transit') {
            problemSummary.inTransit += 1;
        }
        if (deliveryStatusBucket === 'delivered') {
            problemSummary.delivered += 1;
        }
        if (isLbcPendingShipmentStage(row.shipmentStatus) || (!row.hasTrackingNumber && deliveryStatusBucket === 'in_transit')) {
            problemSummary.pendingShipment += 1;
        }
        if (isLbcConcernItem(row)) {
            problemSummary.concern += 1;
        }
    });

    return {
        items,
        references: {
            branches: [...LBC_TRACKING_BRANCHES],
            deliveryStatuses: [...LBC_TRACKING_STATUS_OPTIONS],
            quickFilters: [...LBC_QUICK_FILTER_OPTIONS],
            shipmentStages: [...LBC_SHIPMENT_STAGE_OPTIONS],
            carrierStatuses: [...LBC_CARRIER_STATUS_OPTIONS]
        },
        summary: {
            total: items.length,
            baseTotal: visibleItems.length,
            quickFilter: requestedQuickFilter,
            byBranch,
            byStatus,
            byShipmentStage,
            quickFilters: quickFilterSummary,
            problems: problemSummary
        }
    };
}

function normalizeLbcCollectionFilter(value = '') {
    const normalized = normalizeText(value).toLowerCase();
    if (normalized === 'pending' || normalized === 'confirmed') {
        return normalized;
    }
    return 'all';
}

function listLbcCollections({ branch = '', search = '', status = 'all' } = {}) {
    const baseResult = listLbcTracking({
        branch,
        search,
        quickFilter: 'delivered'
    });
    const allDelivered = Array.isArray(baseResult.items) ? baseResult.items : [];
    const filter = normalizeLbcCollectionFilter(status);
    const filteredItems = allDelivered.filter((row) => {
        const collectionStatus = normalizeLbcCollectionStatus(row.collectionStatus, 'Pending');
        if (filter === 'pending') {
            return collectionStatus === 'Pending';
        }
        if (filter === 'confirmed') {
            return collectionStatus === 'Confirmed';
        }
        return true;
    });

    const summary = {
        totalDelivered: allDelivered.length,
        visibleTotal: filteredItems.length,
        pendingCount: 0,
        confirmedCount: 0,
        pendingAmount: 0,
        confirmedAmount: 0,
        filter
    };

    allDelivered.forEach((row) => {
        const collectionStatus = normalizeLbcCollectionStatus(row.collectionStatus, 'Pending');
        const amount = Math.max(0, Number(row.amountToCollect || 0));
        if (collectionStatus === 'Confirmed') {
            summary.confirmedCount += 1;
            summary.confirmedAmount += amount;
            return;
        }
        summary.pendingCount += 1;
        summary.pendingAmount += amount;
    });

    return {
        items: filteredItems,
        summary: {
            ...summary,
            pendingAmountDisplay: formatMoney(summary.pendingAmount),
            confirmedAmountDisplay: formatMoney(summary.confirmedAmount)
        }
    };
}

function setLbcCollectionStatus(orderLookup, payload = {}) {
    const requestedStatus = normalizeLbcCollectionStatus(
        payload.collectionStatus ?? payload.collection_status ?? payload.status ?? '',
        'Pending'
    );

    return updateLbcTracking(orderLookup, {
        collectionStatus: requestedStatus,
        requestUserId: payload.requestUserId || payload.userId || '',
        requestUserName: payload.requestUserName || payload.userName || '',
        requestRole: payload.requestRole || payload.role || '',
        enforceAssignedUser: Boolean(payload.enforceAssignedUser)
    });
}

function getLbcOrderHeaderByLookup(db, orderLookup = '') {
    const lookup = normalizeText(orderLookup);
    if (!lookup) {
        return null;
    }

    let rows = db.prepare(`
        SELECT *
        FROM sales_entries
        WHERE (
            LOWER(COALESCE(order_number, '')) = LOWER(?)
            OR LOWER(COALESCE(receipt_number, '')) = LOWER(?)
        )
          AND UPPER(TRIM(COALESCE(courier, ''))) = 'LBC'
          AND (LOWER(branch) = LOWER(?) OR LOWER(branch) = LOWER(?))
        ORDER BY sale_date DESC, id DESC
    `).all(lookup, lookup, LBC_TRACKING_BRANCHES[0], LBC_TRACKING_BRANCHES[1]);

    if (!rows.length && /^\d+$/.test(lookup)) {
        rows = db.prepare(`
            SELECT *
            FROM sales_entries
            WHERE id = ?
              AND UPPER(TRIM(COALESCE(courier, ''))) = 'LBC'
              AND (LOWER(branch) = LOWER(?) OR LOWER(branch) = LOWER(?))
            LIMIT 1
        `).all(Number(lookup), LBC_TRACKING_BRANCHES[0], LBC_TRACKING_BRANCHES[1]);
    }

    if (!rows.length) {
        return null;
    }

    return rows.reduce((header, row) => selectPreferredLbcOrderHeader(header, row), null);
}

function updateLbcTracking(orderLookup, payload = {}) {
    const db = getDb();
    const orderHeader = getLbcOrderHeaderByLookup(db, orderLookup);
    if (!orderHeader) {
        throw new Error('LBC tracking order not found.');
    }

    const orderKey = getSalesOrderGroupKey(orderHeader);
    if (!orderKey) {
        throw new Error('LBC tracking order key is missing.');
    }

    const existingTrackingRow = db.prepare(`
        SELECT *
        FROM lbc_tracking_entries
        WHERE LOWER(order_key) = LOWER(?)
        LIMIT 1
    `).get(orderKey);

    const assignee = resolveLbcTrackingAssignee(orderHeader);
    const assignedUserId = normalizeText(existingTrackingRow?.assigned_user_id || assignee.assignedUserId || '');
    const assignedTo = normalizeText(existingTrackingRow?.assigned_to || assignee.assignedTo || assignee.assignmentSource || '');
    const actorId = normalizeText(payload.requestUserId || payload.userId || '');
    const actorName = normalizeText(payload.requestUserName || payload.userName || '');
    const actorRole = normalizeText(payload.requestRole || payload.role || '');
    const shouldEnforceAssignee = Boolean(payload.enforceAssignedUser);

    if (
        shouldEnforceAssignee
        && !canActorUpdateLbcTracking({
            actorId,
            actorName,
            actorRole,
            order: orderHeader,
            assignedUserId,
            assignedTo
        })
    ) {
        throw new Error('Only the assigned user can update this LBC tracking entry.');
    }

    const hasTrackingNumberOverride = Object.prototype.hasOwnProperty.call(payload, 'trackingNumber')
        || Object.prototype.hasOwnProperty.call(payload, 'tracking_number');
    const hasAmountOverride = Object.prototype.hasOwnProperty.call(payload, 'amountToCollect')
        || Object.prototype.hasOwnProperty.call(payload, 'amount_to_collect');
    const hasStatusOverride = Object.prototype.hasOwnProperty.call(payload, 'deliveryStatus')
        || Object.prototype.hasOwnProperty.call(payload, 'delivery_status')
        || Object.prototype.hasOwnProperty.call(payload, 'status');
    const hasCollectionStatusOverride = Object.prototype.hasOwnProperty.call(payload, 'collectionStatus')
        || Object.prototype.hasOwnProperty.call(payload, 'collection_status')
        || Object.prototype.hasOwnProperty.call(payload, 'collection');
    const hasDateMonitoredOverride = Object.prototype.hasOwnProperty.call(payload, 'dateMonitored')
        || Object.prototype.hasOwnProperty.call(payload, 'date_monitored');

    const trackingNumber = hasTrackingNumberOverride
        ? normalizeLbcTrackingNumber(payload.trackingNumber ?? payload.tracking_number, { allowEmpty: true })
        : normalizeText(existingTrackingRow?.tracking_number || '');
    const fallbackAmountToCollect = getLbcOrderCollectionAmount(orderHeader);
    const existingAmountToCollectSource = existingTrackingRow?.amount_to_collect ?? existingTrackingRow?.amountToCollect;
    const existingAmountToCollect = hasProvidedValue(existingAmountToCollectSource)
        ? Number(Math.max(0, parseNumber(existingAmountToCollectSource)).toFixed(2))
        : Number(fallbackAmountToCollect.toFixed(2));
    const amountToCollect = hasAmountOverride
        ? normalizeLbcTrackingAmountToCollect(payload.amountToCollect ?? payload.amount_to_collect, existingAmountToCollect)
        : existingAmountToCollect;
    const existingTrackingNumber = normalizeText(existingTrackingRow?.tracking_number || existingTrackingRow?.trackingNumber || '');
    const hadTrackingNumberBefore = Boolean(existingTrackingNumber);
    const fallbackStatus = normalizeLbcTrackingStatus(
        existingTrackingRow?.delivery_status || existingTrackingRow?.deliveryStatus,
        trackingNumber ? 'In Transit' : 'Pending'
    );
    let deliveryStatus = hasStatusOverride
        ? normalizeLbcTrackingStatus(
            payload.deliveryStatus ?? payload.delivery_status ?? payload.status,
            fallbackStatus
        )
        : fallbackStatus;
    if (!trackingNumber) {
        deliveryStatus = 'Pending';
    } else if (!hasStatusOverride && hasTrackingNumberOverride && !hadTrackingNumberBefore) {
        deliveryStatus = 'In Transit';
    }
    const normalizedDeliveryStatus = normalizeLbcTrackingStatus(deliveryStatus, 'In Transit');
    const nowIso = new Date().toISOString();
    const existingCollectionStatus = normalizeLbcCollectionStatus(
        existingTrackingRow?.collection_status || existingTrackingRow?.collectionStatus,
        'Pending'
    );
    const requestedCollectionStatus = hasCollectionStatusOverride
        ? normalizeLbcCollectionStatus(
            payload.collectionStatus ?? payload.collection_status ?? payload.collection,
            'Pending'
        )
        : '';
    if (requestedCollectionStatus === 'Confirmed' && normalizedDeliveryStatus !== 'Delivered') {
        throw new Error('Collection can be confirmed only after delivery status is Delivered.');
    }
    let collectionStatus = hasCollectionStatusOverride
        ? requestedCollectionStatus
        : existingCollectionStatus;
    if (normalizedDeliveryStatus !== 'Delivered') {
        collectionStatus = 'Pending';
    }
    const existingCollectionConfirmedBy = normalizeText(
        existingTrackingRow?.collection_confirmed_by || existingTrackingRow?.collectionConfirmedBy || ''
    );
    const existingCollectionConfirmedAt = normalizeText(
        existingTrackingRow?.collection_confirmed_at || existingTrackingRow?.collectionConfirmedAt || ''
    );
    const explicitCollectionConfirmedAt = normalizeText(
        payload.collectionConfirmedAt ?? payload.collection_confirmed_at
    );
    const collectionConfirmedBy = collectionStatus === 'Confirmed'
        ? normalizeText(actorName || actorId || payload.collectionConfirmedBy || existingCollectionConfirmedBy)
        : '';
    const collectionConfirmedAt = collectionStatus === 'Confirmed'
        ? (explicitCollectionConfirmedAt || existingCollectionConfirmedAt || nowIso)
        : '';
    const hasEditableUpdate = hasTrackingNumberOverride || hasAmountOverride || hasStatusOverride;
    const explicitDateMonitored = normalizeText(payload.dateMonitored ?? payload.date_monitored);
    const dateMonitored = hasDateMonitoredOverride
        ? (explicitDateMonitored || nowIso)
        : (hasEditableUpdate ? nowIso : normalizeText(existingTrackingRow?.date_monitored));
    const updatedBy = normalizeText(actorName || actorId || payload.updatedBy || '');
    const nextOrderStatus = deriveNextSalesOrderStatusFromTracking({
        orderStatus: orderHeader.order_status || '',
        trackingNumber,
        deliveryStatus
    });

    db.transaction(() => {
        db.prepare(`
            INSERT INTO lbc_tracking_entries (
                order_key, order_number, receipt_number, branch, assigned_user_id, assigned_to,
                tracking_number, amount_to_collect, delivery_status,
                collection_status, collection_confirmed_by, collection_confirmed_at,
                date_monitored, updated_by, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(order_key) DO UPDATE SET
                order_number = excluded.order_number,
                receipt_number = excluded.receipt_number,
                branch = excluded.branch,
                assigned_user_id = excluded.assigned_user_id,
                assigned_to = excluded.assigned_to,
                tracking_number = excluded.tracking_number,
                amount_to_collect = excluded.amount_to_collect,
                delivery_status = excluded.delivery_status,
                collection_status = excluded.collection_status,
                collection_confirmed_by = excluded.collection_confirmed_by,
                collection_confirmed_at = excluded.collection_confirmed_at,
                date_monitored = excluded.date_monitored,
                updated_by = excluded.updated_by,
                updated_at = CURRENT_TIMESTAMP
        `).run(
            orderKey,
            normalizeText(orderHeader.order_number || ''),
            normalizeText(orderHeader.receipt_number || ''),
            resolveLbcTrackingBranch(orderHeader.branch) || normalizeText(orderHeader.branch || ''),
            assignedUserId,
            assignedTo,
            trackingNumber,
            amountToCollect,
            deliveryStatus,
            collectionStatus,
            collectionConfirmedBy,
            collectionConfirmedAt,
            dateMonitored,
            updatedBy
        );
        syncSalesOrderStatusForOrderKey(db, orderKey, nextOrderStatus);
    })();

    const nextTrackingRow = db.prepare(`
        SELECT *
        FROM lbc_tracking_entries
        WHERE order_key = ?
        LIMIT 1
    `).get(orderKey);

    return buildLbcTrackingItem({
        orderRow: orderHeader,
        trackingRow: nextTrackingRow,
        assignee: {
            assignedUserId,
            assignedTo,
            assignmentSource: assignedTo
        }
    });
}

function bulkAssignLbcTracking(payload = {}) {
    const db = getDb();
    const requestedBranch = resolveLbcTrackingBranch(payload.branch || '');
    const effectiveDateFrom = normalizeDate(payload.dateFrom) || getCurrentMonthStartDateKey();
    const rawItems = Array.isArray(payload.items)
        ? payload.items
        : (Array.isArray(payload.entries) ? payload.entries : []);

    if (!rawItems.length) {
        return {
            assignedCount: 0,
            skippedCount: 0,
            totalRequested: 0,
            items: [],
            skipped: []
        };
    }

    const headers = listLbcOrderHeaders(db, { branch: requestedBranch, dateFrom: effectiveDateFrom });
    const orderKeys = headers.map((row) => getSalesOrderGroupKey(row)).filter(Boolean);
    const trackingRowMap = getLbcTrackingRowMap(db, orderKeys);
    const sequentialQueue = headers
        .map((header) => {
            const orderKey = getSalesOrderGroupKey(header);
            return {
                orderKey,
                header,
                trackingRow: trackingRowMap.get(normalizeActorValue(orderKey)) || null
            };
        })
        .filter((entry) => entry.orderKey && !normalizeText(entry.trackingRow?.tracking_number))
        .sort((left, right) => {
            if (String(left.header.sale_date || '') !== String(right.header.sale_date || '')) {
                return String(left.header.sale_date || '').localeCompare(String(right.header.sale_date || ''));
            }
            return Number(left.header.id || 0) - Number(right.header.id || 0);
        });

    const items = [];
    const skipped = [];

    rawItems.forEach((rawItem, index) => {
        const rawTrackingValue = normalizeText(
            rawItem?.trackingNumber
            ?? rawItem?.tracking_number
            ?? rawItem?.tracking
            ?? rawItem
        );
        const explicitOrderLookup = normalizeText(
            rawItem?.orderLookup
            ?? rawItem?.order_lookup
            ?? rawItem?.orderNumber
            ?? rawItem?.order_number
            ?? rawItem?.receiptNumber
            ?? rawItem?.receipt_number
        );

        if (!rawTrackingValue) {
            skipped.push({
                index: index + 1,
                reason: 'Tracking number is missing.'
            });
            return;
        }

        let normalizedTrackingNumber = '';
        try {
            normalizedTrackingNumber = normalizeLbcTrackingNumber(rawTrackingValue, { allowEmpty: false });
        } catch (error) {
            skipped.push({
                index: index + 1,
                trackingNumber: rawTrackingValue,
                reason: error.message || 'Tracking number is invalid.'
            });
            return;
        }

        let targetLookup = explicitOrderLookup;
        if (!targetLookup) {
            const nextSequential = sequentialQueue.shift();
            if (!nextSequential?.orderKey) {
                skipped.push({
                    index: index + 1,
                    trackingNumber: normalizedTrackingNumber,
                    reason: 'No available LBC order without tracking number.'
                });
                return;
            }
            targetLookup = nextSequential.orderKey;
        }

        try {
            const updated = updateLbcTracking(targetLookup, {
                trackingNumber: normalizedTrackingNumber,
                requestUserId: payload.requestUserId || payload.userId || '',
                requestUserName: payload.requestUserName || payload.userName || '',
                requestRole: payload.requestRole || payload.role || '',
                enforceAssignedUser: Boolean(payload.enforceAssignedUser)
            });
            items.push(updated);
        } catch (error) {
            skipped.push({
                index: index + 1,
                trackingNumber: normalizedTrackingNumber,
                orderLookup: targetLookup,
                reason: error.message || 'Failed to assign tracking number.'
            });
        }
    });

    return {
        assignedCount: items.length,
        skippedCount: skipped.length,
        totalRequested: rawItems.length,
        items,
        skipped
    };
}

function refreshLbcTrackingStatuses(payload = {}) {
    const requestedBranch = resolveLbcTrackingBranch(payload.branch || '');
    const listResult = listLbcTracking({
        branch: requestedBranch
    });
    const trackedItems = (listResult.items || []).filter((row) => normalizeText(row.trackingNumber));

    return {
        checkedCount: trackedItems.length,
        updatedCount: 0,
        changedCount: 0,
        unchangedCount: trackedItems.length,
        skippedCount: 0,
        statusMap: {},
        items: trackedItems,
        skipped: []
    };
}

function listExpenses(filters = {}) {
    return listFinancialEntries({
        tableName: 'expense_entries',
        dateField: 'expense_date',
        filters
    });
}

function listCashIncome(filters = {}) {
    return listFinancialEntries({
        tableName: 'cash_income_entries',
        dateField: 'income_date',
        filters
    });
}

function getReferenceData() {
    const db = getDb();
    const distinctValues = (field) => db.prepare(`
        SELECT DISTINCT ${field} AS value
        FROM sales_entries
        WHERE TRIM(COALESCE(${field}, '')) != ''
        ORDER BY ${field} COLLATE NOCASE
    `).all().map((row) => normalizeText(row.value)).filter(Boolean);

    const products = db.prepare(`
        SELECT DISTINCT product_name
        FROM product_catalog
        ORDER BY product_name COLLATE NOCASE
    `).all().map((row) => row.product_name);

    const configuredBranches = getConfiguredOrderFormList('branches');
    const configuredCashBranches = getConfiguredOrderFormList('cashBranches');
    const configuredCouriers = getConfiguredOrderFormList('couriers');
    const configuredAdmins = getConfiguredOrderFormList('admins');
    const configuredSalesRepresentatives = getConfiguredOrderFormList('salesRepresentatives');
    const paymentMethodOptions = getConfiguredPaymentMethodOptions(db);

    const branches = configuredBranches.length
        ? uniqueSorted(configuredBranches)
        : uniqueSorted(getBranchOptions());
    const cashBranches = configuredCashBranches.length
        ? uniqueSorted(configuredCashBranches)
        : branches;
    const couriers = configuredCouriers.length
        ? uniqueSorted(configuredCouriers)
        : uniqueSorted([...distinctValues('courier'), ...COURIER_OPTIONS]);
    const admins = configuredAdmins.length
        ? uniqueSorted(configuredAdmins)
        : getHistoricalAdminOptions(db);
    const salesRepresentatives = configuredSalesRepresentatives.length
        ? uniqueSorted(configuredSalesRepresentatives)
        : uniqueSorted(distinctValues('sales_representative'));
    const paymentFilterValues = uniqueSorted(paymentMethodOptions);

    return {
        branches,
        cashBranches,
        setOptions: SET_OPTIONS,
        inputAdmins: admins,
        inputSalesRepresentatives: salesRepresentatives,
        inputPaymentTypes: PAYMENT_TYPE_OPTIONS,
        inputCouriers: couriers,
        inputOrderStatuses: ORDER_STATUS_OPTIONS,
        admins,
        paymentOptions: paymentFilterValues,
        paymentMethods: paymentFilterValues,
        paymentTypes: uniqueSorted([...PAYMENT_TYPE_OPTIONS, ...distinctValues('payment_type').map((value) => normalizePaymentTypeValue(value) || value)]),
        orderStatuses: uniqueSorted([...ORDER_STATUS_OPTIONS, ...distinctValues('order_status')]),
        couriers,
        salesRepresentatives,
        products,
        inputPaymentOptions: paymentMethodOptions,
        inputPaymentMethods: paymentMethodOptions
    };
}

function uniqueSorted(values) {
    return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right));
}

module.exports = {
    addExpenseEntry,
    addCashIncomeEntry,
    addSaleEntry,
    bulkAssignLbcTracking,
    clearCashIncomeEntries,
    clearExpenseEntries,
    deleteCompositeItem,
    deleteCashIncomeEntry,
    deleteExpenseEntry,
    deleteInventoryItem,
    deleteSaleOrder,
    getReferenceData,
    listLbcCollections,
    listLbcTracking,
    getSaleOrder,
    listCompositeItems,
    listCashIncome,
    listExpenses,
    listInventory,
    listProducts,
    listSales,
    previewNextOrderNumber,
    refreshLbcTrackingStatuses,
    setLbcCollectionStatus,
    upsertCompositeItem,
    updateCashIncomeEntry,
    updateExpenseEntry,
    updateLbcTracking,
    updateSaleOrder,
    updateInventoryQuantity
};
