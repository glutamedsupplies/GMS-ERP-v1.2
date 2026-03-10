const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const Database = require('better-sqlite3');
const { readProjectRuntimeConfig } = require('./runtime-config');

const rootDir = path.resolve(__dirname, '..');
const activeDataRoot = process.env.ATTENDANCE_DATA_DIR
    ? path.resolve(process.env.ATTENDANCE_DATA_DIR)
    : rootDir;
const dataDir = path.join(activeDataRoot, 'data');
const tenantsDir = path.join(dataDir, 'tenants');
const legacyPaths = {
    users: path.join(activeDataRoot, 'head_admin', 'data', 'users.db'),
    attendance: path.join(activeDataRoot, 'employee', 'data', 'attendance.db')
};
const paths = {
    dataRoot: activeDataRoot,
    dataDir,
    master: path.join(dataDir, 'master.db'),
    tenantsDir,
    legacyUsers: legacyPaths.users,
    legacyAttendance: legacyPaths.attendance
};

const PARENT_BRAND = Object.freeze({
    appName: 'GMS ERP',
    companyName: 'GMS ERP',
    logoPath: '/logo.png',
    primaryColor: '#2575fc',
    faviconPath: '/assets/icons/icon-192.png',
    subtitle: 'Multi-tenant attendance, sales, inventory, and invoicing'
});

const DEFAULT_COMPANY_CODE = 'default';
const DEFAULT_TEMPLATE_STYLE = 'classic';
const DEFAULT_RECEIPT_TITLE = 'Sales Receipt';
const DEFAULT_RECEIPT_SUBTITLE = 'Official transaction summary';
const DEFAULT_RECEIPT_META_LAYOUT = [
    'Receipt #|receiptNumber',
    'Order #|orderNumber',
    'Date|saleDate|date',
    'Invoice Branch|branch',
    'Cash Branch|cashBranch',
    'Courier|courier',
    'Payment Type|paymentType',
    'Payment Method|paymentMethod',
    'Admin|adminName',
    'Sales Representative|salesRepresentative',
    'Client|clientName',
    'Contact|clientContact',
    'Address|clientAddress'
].join('\n');
const DEFAULT_RECEIPT_TOTALS_LAYOUT = [
    'Items Total|totals.baseTotal|money',
    'Total Due|totals.orderTotal|money',
    'Amount Paid|totals.amountPaid|money',
    'Collection|totals.collectionAmount|money',
    'Delivery Fee|totals.deliveryFee|money',
    'Overpayment|totals.overpaymentAmount|money',
    'Underpayment|totals.underpaymentAmount|money',
    'Note|note|text'
].join('\n');
const DEFAULT_BRANCH_NAME = 'Main Branch';
const DEFAULT_AI_QUOTA = 50;
const PASSWORD_HASH_PREFIX = 'scrypt';
const PASSWORD_SCRYPT_COST = 16384;
const PASSWORD_SCRYPT_BLOCK_SIZE = 8;
const PASSWORD_SCRYPT_PARALLELIZATION = 1;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SALT_LENGTH = 16;
const COMPANY_ACTIVE_STATUS = 'active';
const ROLE_SUPER_ADMIN = 'super_admin';
const ROLE_COMPANY_ADMIN = 'company_admin';
const ROLE_EMPLOYEE = 'employee';
const ROLE_STAFF = 'staff';
const COMPANY_ADMIN_ROLE_ALIASES = new Set(['company_admin', 'head_admin']);
const DEFAULT_EMPLOYEE_TIME_IN = '08:00';
const DEFAULT_EMPLOYEE_TIME_OUT = '17:00';
const RUNTIME_CONFIG = readProjectRuntimeConfig();
const ATTENDANCE_TIME_ZONE = RUNTIME_CONFIG.server?.timeZone || 'Asia/Manila';
const ZONED_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: ATTENDANCE_TIME_ZONE,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
});
const WEEKLY_SCHEDULE_DAYS = Object.freeze([
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday'
]);
const WEEKLY_SCHEDULE_DAY_LABELS = Object.freeze({
    sunday: 'Sunday',
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday'
});
const USER_FEATURE_DEFAULTS = Object.freeze({
    expenses: true,
    order_form: true,
    inventory: true,
    composite: true,
    lbc_tracking: false
});
const USER_FEATURE_KEYS = Object.freeze(Object.keys(USER_FEATURE_DEFAULTS));
const CUSTOMER_REQUEST_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);
const WORKSPACE_CONFIG_META_KEY = 'workspace_config';
const WORKSPACE_CONFIG_DEFAULTS = Object.freeze({
    menu: {
        showInvoiceSummary: false,
        showCustomerRequests: false,
        showInventoryLevels: true
    },
    labels: {
        inventoryMenu: 'Product Pricing',
        inventoryPageTitle: 'Product Pricing',
        inventoryPageCopy: 'Manage product prices used by the order form. Search by product or set, import the latest CSV, and maintain item code and price in one place.',
        inventoryLevelsMenu: 'Inventory',
        inventoryLevelsPageTitle: 'Inventory Levels',
        compositeMenu: 'Composite Items',
        compositePageTitle: 'Composite Items',
        orderFormMenu: 'Order Form',
        orderFormTitle: 'High-Speed Order Encoding',
        orderFormCopy: 'Encode like a sheet: type, use arrow keys, press enter or tab, and keep moving. Inventory variants stay cached and totals update live while you work.',
        orderDetailsTitle: 'Order Details',
        orderItemsTitle: 'Variant Builder',
        orderParseButton: 'Parse Text',
        orderAddItemButton: 'Add Item',
        orderSubmitButton: 'Create Order',
        salesReportMenu: 'Sales Reports',
        salesReportTitle: 'Sales Report',
        salesReportCopy: 'Full sales view with expense and cash income overlay, branch breakdown bars, and a detailed transaction table.',
        expensesMenu: 'Expenses',
        expensesPageTitle: 'Expenses and Cash Income'
    },
    orderForm: {
        branches: [],
        cashBranches: [],
        couriers: [],
        admins: [],
        salesRepresentatives: [],
        paymentMethods: [],
        visibleFields: {
            quickPaste: true,
            cashBranch: true,
            salesRepresentative: true,
            deliveryFee: true,
            note: true
        }
    },
    salesReport: {
        showCashBranchFilter: true,
        showPaymentFilter: true,
        showAdminFilter: true,
        showSalesRepresentativeFilter: true
    },
    expenses: {
        title: '',
        copy: ''
    }
});

const dbCache = new Map();
const tenantContextStorage = new AsyncLocalStorage();

let systemReady = false;
let systemInitializing = false;

function normalizeText(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeCompanyCode(value = '') {
    return normalizeText(value).toLowerCase();
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

function normalizeMultilineText(value, { maxLength = 5000 } = {}) {
    const normalized = String(value ?? '')
        .replace(/\r\n/g, '\n')
        .trim();

    if (!normalized) {
        return '';
    }

    return normalized.length > maxLength
        ? normalized.slice(0, maxLength).trim()
        : normalized;
}

function normalizeTemplateLayoutText(value, fallback) {
    const normalized = normalizeMultilineText(value, { maxLength: 12000 });
    return normalized || String(fallback || '').trim();
}

function normalizeIdentifier(value) {
    return normalizeText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function normalizeOptionalDomain(value) {
    const normalized = normalizeText(value).toLowerCase();
    if (!normalized) {
        return null;
    }

    let host = normalized
        .replace(/^https?:\/\//, '')
        .split(/[/?#]/)[0]
        .replace(/\.$/, '');

    if (host.includes(':')) {
        host = host.split(':')[0];
    }

    return host || null;
}

function normalizeAddonKey(value) {
    return normalizeText(value)
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function mapCompanyConstraintError(error) {
    const message = String(error?.message || error || '');
    if (!/unique constraint failed/i.test(message)) {
        return error;
    }

    if (message.includes('companies.company_code')) {
        return new Error('Company code is already in use.');
    }
    if (message.includes('companies.subdomain')) {
        return new Error('Subdomain is already in use.');
    }
    if (message.includes('companies.custom_domain')) {
        return new Error('Custom domain is already in use.');
    }

    return new Error('Company details conflict with an existing company.');
}

function runCompanyWrite(operation) {
    try {
        return operation();
    } catch (error) {
        throw mapCompanyConstraintError(error);
    }
}

function mapPlanConstraintError(error) {
    const message = String(error?.message || error || '');
    if (!/unique constraint failed/i.test(message)) {
        return error;
    }

    if (message.includes('plans.id')) {
        return new Error('Plan id is already in use.');
    }

    return new Error('Plan details conflict with an existing plan.');
}

function runPlanWrite(operation) {
    try {
        return operation();
    } catch (error) {
        throw mapPlanConstraintError(error);
    }
}

function assertUniqueCompanyFields({
    companyId = '',
    companyCode = '',
    subdomain = '',
    customDomain = null
}) {
    const db = getMasterDb();
    const excludedCompanyId = normalizeText(companyId) || null;
    const exclusionClause = 'AND (? IS NULL OR id <> ?)';

    if (companyCode) {
        const duplicateCode = db.prepare(`
            SELECT id
            FROM companies
            WHERE LOWER(company_code) = LOWER(?)
              ${exclusionClause}
            LIMIT 1
        `).get(companyCode, excludedCompanyId, excludedCompanyId);
        if (duplicateCode) {
            throw new Error('Company code is already in use.');
        }
    }

    if (subdomain) {
        const duplicateSubdomain = db.prepare(`
            SELECT id
            FROM companies
            WHERE LOWER(COALESCE(subdomain, '')) = LOWER(?)
              ${exclusionClause}
            LIMIT 1
        `).get(subdomain, excludedCompanyId, excludedCompanyId);
        if (duplicateSubdomain) {
            throw new Error('Subdomain is already in use.');
        }
    }

    if (customDomain) {
        const duplicateCustomDomain = db.prepare(`
            SELECT id
            FROM companies
            WHERE LOWER(COALESCE(custom_domain, '')) = LOWER(?)
              ${exclusionClause}
            LIMIT 1
        `).get(customDomain, excludedCompanyId, excludedCompanyId);
        if (duplicateCustomDomain) {
            throw new Error('Custom domain is already in use.');
        }
    }
}

function ensureDirectory(targetPath) {
    fs.mkdirSync(targetPath, { recursive: true });
}

function openDb(cacheKey, filePath, initializer) {
    if (!dbCache.has(cacheKey)) {
        ensureDirectory(path.dirname(filePath));
        const db = new Database(filePath);
        db.pragma('journal_mode = WAL');
        initializer(db);
        dbCache.set(cacheKey, db);
    }

    return dbCache.get(cacheKey);
}

function ensureTableColumn(db, tableName, columnName, definition) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (!columns.some((column) => column.name === columnName)) {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
}

function getMasterDb() {
    return openDb('master', paths.master, initMasterSchema);
}

function getTenantDbPath(companyId) {
    return path.join(tenantsDir, `${companyId}.db`);
}

function getTenantDb(companyId = '') {
    const context = getCurrentContext();
    const targetCompanyId = companyId || context?.companyId || '';
    if (!targetCompanyId) {
        throw new Error('Tenant database requires a company context.');
    }

    const cacheKey = `tenant:${targetCompanyId}`;
    return openDb(cacheKey, getTenantDbPath(targetCompanyId), initTenantSchema);
}

function closeTenantDb(companyId = '') {
    const normalizedCompanyId = normalizeText(companyId);
    if (!normalizedCompanyId) {
        return;
    }

    const cacheKey = `tenant:${normalizedCompanyId}`;
    const tenantDb = dbCache.get(cacheKey);
    if (!tenantDb) {
        return;
    }

    tenantDb.close();
    dbCache.delete(cacheKey);
}

function closeAll() {
    for (const db of dbCache.values()) {
        db.close();
    }
    dbCache.clear();
    systemReady = false;
}

function initMasterSchema(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS system_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS companies (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            plan_id TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            company_code TEXT NOT NULL UNIQUE,
            subdomain TEXT UNIQUE,
            custom_domain TEXT UNIQUE,
            logo_path TEXT NOT NULL DEFAULT '',
            primary_color TEXT NOT NULL DEFAULT '#2575fc',
            app_name TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            company_id TEXT,
            branch_id TEXT,
            username TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            display_name TEXT NOT NULL DEFAULT '',
            profile_picture TEXT NOT NULL DEFAULT '',
            time_in TEXT NOT NULL DEFAULT '08:00',
            time_out TEXT NOT NULL DEFAULT '17:00',
            schedule_json TEXT NOT NULL DEFAULT '{}',
            feature_access_json TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS company_admin_credentials (
            company_id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            password_text TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS plans (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            price_monthly REAL NOT NULL DEFAULT 0,
            max_branches INTEGER NOT NULL DEFAULT 1,
            max_users INTEGER NOT NULL DEFAULT 1,
            max_invoices_monthly INTEGER NOT NULL DEFAULT 0,
            modules_json TEXT NOT NULL DEFAULT '{}',
            ai_enabled_default INTEGER NOT NULL DEFAULT 0,
            ai_monthly_quota INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id TEXT NOT NULL,
            plan_id TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT,
            is_active INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS addons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id TEXT NOT NULL,
            addon_key TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            quota_json TEXT NOT NULL DEFAULT '{}',
            UNIQUE(company_id, addon_key)
        );

        CREATE TABLE IF NOT EXISTS usage_monthly (
            company_id TEXT NOT NULL,
            month_key TEXT NOT NULL,
            invoices_count INTEGER NOT NULL DEFAULT 0,
            ai_reads_count INTEGER NOT NULL DEFAULT 0,
            storage_mb_used REAL NOT NULL DEFAULT 0,
            PRIMARY KEY (company_id, month_key)
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id TEXT,
            actor_user_id TEXT,
            action TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL DEFAULT '',
            details_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_master_users_scope
        ON users (COALESCE(company_id, ''), username);
    `);
}

function initTenantSchema(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS tenant_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS branches (
            id TEXT PRIMARY KEY,
            branch_name TEXT NOT NULL UNIQUE,
            address TEXT NOT NULL DEFAULT '',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS attendance (
            id TEXT,
            branch_id TEXT,
            name TEXT,
            date TEXT,
            time_in TEXT,
            time_out TEXT,
            worked_hours TEXT,
            remarks TEXT
        );

        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            contact_number TEXT NOT NULL,
            normalized_contact_number TEXT NOT NULL UNIQUE,
            address TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT 'manual',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS customer_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_code TEXT NOT NULL UNIQUE,
            client_id INTEGER,
            client_name TEXT NOT NULL,
            contact_number TEXT NOT NULL,
            normalized_contact_number TEXT NOT NULL,
            request_details TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'open',
            allow_customer_edit INTEGER NOT NULL DEFAULT 1,
            source TEXT NOT NULL DEFAULT 'customer_portal',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS customer_request_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            sender_type TEXT NOT NULL,
            sender_name TEXT NOT NULL DEFAULT '',
            message_text TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'customer_portal',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS inventory_variants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_name TEXT NOT NULL,
            item_code TEXT NOT NULL,
            set_name TEXT NOT NULL,
            price REAL NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'manual',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(product_name, set_name)
        );

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
            component_unit TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT 'manual',
            import_key TEXT UNIQUE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    db.exec(`
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
            source TEXT NOT NULL DEFAULT 'manual',
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(branch, inventory_item_id)
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
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            receipt_number TEXT,
            line_index INTEGER NOT NULL DEFAULT 1,
            client_contact TEXT,
            client_address TEXT,
            delivery_label TEXT,
            entry_unit TEXT,
            order_number TEXT,
            order_status TEXT NOT NULL DEFAULT 'Pending',
            payment_type TEXT NOT NULL DEFAULT 'Full Paid',
            payment_method TEXT,
            payment_method_breakdown TEXT,
            base_total REAL NOT NULL DEFAULT 0,
            delivery_fee REAL NOT NULL DEFAULT 0,
            delivery_fee_to_collect INTEGER NOT NULL DEFAULT 0,
            overpayment_amount REAL NOT NULL DEFAULT 0,
            underpayment_amount REAL NOT NULL DEFAULT 0
        );
    `);

    db.exec(`
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
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            linked_order_number TEXT,
            linked_receipt_number TEXT,
            auto_generated INTEGER NOT NULL DEFAULT 0,
            confirmation_status TEXT NOT NULL DEFAULT 'Confirmed',
            income_kind TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS invoice_templates (
            id TEXT PRIMARY KEY,
            template_name TEXT NOT NULL DEFAULT 'default',
            business_name TEXT NOT NULL DEFAULT '',
            address TEXT NOT NULL DEFAULT '',
            contact TEXT NOT NULL DEFAULT '',
            logo_path TEXT NOT NULL DEFAULT '',
            footer_notes TEXT NOT NULL DEFAULT '',
            terms TEXT NOT NULL DEFAULT '',
            signature_name TEXT NOT NULL DEFAULT '',
            signature_position TEXT NOT NULL DEFAULT '',
            signature_path TEXT NOT NULL DEFAULT '',
            receipt_title TEXT NOT NULL DEFAULT '',
            receipt_subtitle TEXT NOT NULL DEFAULT '',
            receipt_meta_layout TEXT NOT NULL DEFAULT '',
            receipt_totals_layout TEXT NOT NULL DEFAULT '',
            template_style TEXT NOT NULL DEFAULT 'classic',
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    ensureTableColumn(db, 'invoice_templates', 'signature_path', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'invoice_templates', 'receipt_title', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'invoice_templates', 'receipt_subtitle', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'invoice_templates', 'receipt_meta_layout', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'invoice_templates', 'receipt_totals_layout', "TEXT NOT NULL DEFAULT ''");

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_customer_requests_contact
        ON customer_requests (normalized_contact_number);

        CREATE INDEX IF NOT EXISTS idx_customer_requests_status_updated
        ON customer_requests (status, updated_at DESC, id DESC);

        CREATE INDEX IF NOT EXISTS idx_customer_request_messages_request
        ON customer_request_messages (request_id, created_at, id);
    `);
}

function setSystemMeta(key, value) {
    getMasterDb().prepare(`
        INSERT INTO system_meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(String(key), String(value));
}

function getSystemMeta(key) {
    const row = getMasterDb().prepare('SELECT value FROM system_meta WHERE key = ? LIMIT 1').get(String(key));
    return row ? row.value : '';
}

function getTenantMeta(key) {
    const row = getTenantDb().prepare(`
        SELECT value
        FROM tenant_meta
        WHERE key = ?
        LIMIT 1
    `).get(String(key));
    return row ? String(row.value || '') : '';
}

function setTenantMeta(key, value) {
    getTenantDb().prepare(`
        INSERT INTO tenant_meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(String(key), String(value ?? ''));
}

function generateId(prefix) {
    return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function getSeedPlans() {
    return [
        {
            id: 'attendance_starter',
            name: 'Attendance Starter',
            price_monthly: 19,
            max_branches: 1,
            max_users: 15,
            max_invoices_monthly: 0,
            modules_json: JSON.stringify({
                attendance: true,
                sales: false,
                inventory: false,
                invoicing: false,
                reports: true,
                ai_reader: false
            }),
            ai_enabled_default: 0,
            ai_monthly_quota: 0
        },
        {
            id: 'sales_growth',
            name: 'Sales Growth',
            price_monthly: 49,
            max_branches: 2,
            max_users: 25,
            max_invoices_monthly: 150,
            modules_json: JSON.stringify({
                attendance: true,
                sales: true,
                inventory: true,
                invoicing: true,
                reports: true,
                ai_reader: false
            }),
            ai_enabled_default: 0,
            ai_monthly_quota: 0
        },
        {
            id: 'business_suite',
            name: 'Business Suite',
            price_monthly: 99,
            max_branches: 10,
            max_users: 100,
            max_invoices_monthly: 1000,
            modules_json: JSON.stringify({
                attendance: true,
                sales: true,
                inventory: true,
                invoicing: true,
                reports: true,
                ai_reader: true
            }),
            ai_enabled_default: 1,
            ai_monthly_quota: 250
        }
    ];
}

function seedDefaultPlans() {
    const db = getMasterDb();
    const insertPlan = db.prepare(`
        INSERT INTO plans (
            id, name, price_monthly, max_branches, max_users, max_invoices_monthly,
            modules_json, ai_enabled_default, ai_monthly_quota
        )
        VALUES (
            @id, @name, @price_monthly, @max_branches, @max_users, @max_invoices_monthly,
            @modules_json, @ai_enabled_default, @ai_monthly_quota
        )
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            price_monthly = excluded.price_monthly,
            max_branches = excluded.max_branches,
            max_users = excluded.max_users,
            max_invoices_monthly = excluded.max_invoices_monthly,
            modules_json = excluded.modules_json,
            ai_enabled_default = excluded.ai_enabled_default,
            ai_monthly_quota = excluded.ai_monthly_quota
    `);

    db.transaction((plans) => {
        plans.forEach((plan) => insertPlan.run(plan));
    })(getSeedPlans());
}

function isPasswordHash(value) {
    return String(value || '').startsWith(`${PASSWORD_HASH_PREFIX}$`);
}

function hashPassword(password) {
    const normalizedPassword = String(password || '');
    const salt = crypto.randomBytes(PASSWORD_SALT_LENGTH);
    const derivedKey = crypto.scryptSync(normalizedPassword, salt, PASSWORD_KEY_LENGTH, {
        N: PASSWORD_SCRYPT_COST,
        r: PASSWORD_SCRYPT_BLOCK_SIZE,
        p: PASSWORD_SCRYPT_PARALLELIZATION
    });

    return [
        PASSWORD_HASH_PREFIX,
        PASSWORD_SCRYPT_COST,
        PASSWORD_SCRYPT_BLOCK_SIZE,
        PASSWORD_SCRYPT_PARALLELIZATION,
        salt.toString('base64url'),
        derivedKey.toString('base64url')
    ].join('$');
}

function normalizePasswordForStorage(password) {
    const normalizedPassword = String(password || '').trim();
    if (!normalizedPassword) {
        throw new Error('Password is required.');
    }

    return isPasswordHash(normalizedPassword)
        ? normalizedPassword
        : hashPassword(normalizedPassword);
}

function verifyPassword(password, storedValue) {
    const normalizedStoredValue = String(storedValue || '');

    if (!normalizedStoredValue) {
        return { matches: false, needsUpgrade: false };
    }

    if (!isPasswordHash(normalizedStoredValue)) {
        return {
            matches: String(password || '') === normalizedStoredValue,
            needsUpgrade: true
        };
    }

    const parts = normalizedStoredValue.split('$');
    if (parts.length !== 6 || parts[0] !== PASSWORD_HASH_PREFIX) {
        return { matches: false, needsUpgrade: false };
    }

    const [, cost, blockSize, parallelization, saltValue, hashValue] = parts;

    try {
        const salt = Buffer.from(saltValue, 'base64url');
        const expectedHash = Buffer.from(hashValue, 'base64url');
        const derivedKey = crypto.scryptSync(String(password || ''), salt, expectedHash.length, {
            N: Number(cost),
            r: Number(blockSize),
            p: Number(parallelization)
        });

        if (derivedKey.length !== expectedHash.length) {
            return { matches: false, needsUpgrade: false };
        }

        return {
            matches: crypto.timingSafeEqual(derivedKey, expectedHash),
            needsUpgrade: false
        };
    } catch (_error) {
        return { matches: false, needsUpgrade: false };
    }
}

function parseDateValue(value) {
    if (!value) return null;
    if (value instanceof Date) return new Date(value.getTime());

    const text = String(value).trim();
    if (!text) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        const isoDate = new Date(`${text}T00:00:00`);
        return Number.isNaN(isoDate.getTime()) ? null : isoDate;
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function getZonedDateTimeParts(input = new Date()) {
    const date = input instanceof Date ? new Date(input.getTime()) : (parseDateValue(input) || new Date(input));
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return ZONED_DATE_TIME_FORMATTER.formatToParts(date).reduce((parts, part) => {
        if (part.type !== 'literal') {
            parts[part.type] = part.value;
        }
        return parts;
    }, {});
}

function getDateKey(input = new Date()) {
    const parts = getZonedDateTimeParts(input);
    if (!parts?.year || !parts.month || !parts.day) {
        return String(input || '').trim();
    }

    return `${parts.year}-${parts.month}-${parts.day}`;
}

function getMonthKey(input = new Date()) {
    const parts = getZonedDateTimeParts(input);
    if (!parts?.year || !parts.month) {
        return String(input || '').trim().slice(0, 7);
    }

    return `${parts.year}-${parts.month}`;
}

function formatDisplayDate(value) {
    const parsed = parseDateValue(value);
    return parsed
        ? parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : (value || '-');
}

function parseTimeToMinutes(value) {
    const text = String(value || '').trim();
    const parts = parseTimeToParts(text);
    if (!parts) {
        return null;
    }

    return (parts.hours * 60) + parts.minutes;
}

function parseTimeToParts(value) {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) {
        return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = match[3] === undefined ? null : Number(match[3]);

    if (!Number.isFinite(hours) || hours < 0 || hours > 23) {
        return null;
    }

    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
        return null;
    }

    if (seconds !== null && (!Number.isFinite(seconds) || seconds < 0 || seconds > 59)) {
        return null;
    }

    return {
        hours,
        minutes,
        seconds
    };
}

function formatTimeValue(value) {
    if (!value) {
        return '';
    }

    if (value instanceof Date) {
        const parts = getZonedDateTimeParts(value);
        if (!parts?.hour || !parts.minute) {
            return '';
        }

        if (parts.second) {
            return `${parts.hour}:${parts.minute}:${parts.second}`;
        }

        return `${parts.hour}:${parts.minute}`;
    }

    const text = String(value).trim();
    const parsedParts = parseTimeToParts(text);
    if (parsedParts) {
        const normalized = `${pad(parsedParts.hours)}:${pad(parsedParts.minutes)}`;
        return parsedParts.seconds === null
            ? normalized
            : `${normalized}:${pad(parsedParts.seconds)}`;
    }

    const parsedDate = new Date(text);
    if (!Number.isNaN(parsedDate.getTime())) {
        const parts = getZonedDateTimeParts(parsedDate);
        if (!parts?.hour || !parts.minute) {
            return text;
        }

        if (parts.second) {
            return `${parts.hour}:${parts.minute}:${parts.second}`;
        }

        return `${parts.hour}:${parts.minute}`;
    }

    return text;
}

function normalizeBooleanValue(value, fallback = false) {
    if (typeof value === 'boolean') {
        return value;
    }
 
    if (typeof value === 'number') {
        return value !== 0;
    }
 
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
        return fallback;
    }
 
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
    }
 
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
    }
 
    return fallback;
}

function normalizeScheduleDayValue(value, fallbackTimeIn, fallbackTimeOut, defaultDayOff = false) {
    const source = (value && typeof value === 'object' && !Array.isArray(value))
        ? value
        : {};
    const dayOffSource = source.is_day_off ?? source.isDayOff ?? source.day_off ?? source.dayOff;
    const isDayOff = normalizeBooleanValue(dayOffSource, defaultDayOff);
    const timeIn = formatTimeValue(source.time_in ?? source.timeIn ?? fallbackTimeIn) || fallbackTimeIn;
    const timeOut = formatTimeValue(source.time_out ?? source.timeOut ?? fallbackTimeOut) || fallbackTimeOut;
 
    return {
        is_day_off: isDayOff,
        time_in: isDayOff ? '' : timeIn,
        time_out: isDayOff ? '' : timeOut
    };
}

function parseWeeklySchedulePayload(payload, fallbackTimeIn = DEFAULT_EMPLOYEE_TIME_IN, fallbackTimeOut = DEFAULT_EMPLOYEE_TIME_OUT) {
    let source = payload;
    if (typeof source === 'string') {
        const raw = source.trim();
        if (!raw) {
            source = {};
        } else {
            try {
                source = JSON.parse(raw);
            } catch (_error) {
                source = {};
            }
        }
    }
 
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
        source = {};
    }
 
    const normalizedTimeIn = formatTimeValue(fallbackTimeIn) || DEFAULT_EMPLOYEE_TIME_IN;
    const normalizedTimeOut = formatTimeValue(fallbackTimeOut) || DEFAULT_EMPLOYEE_TIME_OUT;
    const schedule = {};
    WEEKLY_SCHEDULE_DAYS.forEach((dayKey) => {
        const fallbackDayOff = dayKey === 'sunday';
        const directValue = source[dayKey];
        const titleKey = WEEKLY_SCHEDULE_DAY_LABELS[dayKey];
        const dayValue = directValue !== undefined ? directValue : source[titleKey];
        schedule[dayKey] = normalizeScheduleDayValue(dayValue, normalizedTimeIn, normalizedTimeOut, fallbackDayOff);
    });
 
    return schedule;
}

function getUserWeeklySchedule(user) {
    return parseWeeklySchedulePayload(
        user?.schedule_json,
        user?.time_in || DEFAULT_EMPLOYEE_TIME_IN,
        user?.time_out || DEFAULT_EMPLOYEE_TIME_OUT
    );
}

function getDayKeyForDate(input = new Date()) {
    const parts = getZonedDateTimeParts(input);
    const weekday = String(parts?.weekday || '').toLowerCase();
    if (!weekday) {
        return '';
    }

    return WEEKLY_SCHEDULE_DAYS.includes(weekday) ? weekday : '';
}

function getUserScheduleForDate(user, input = new Date()) {
    const schedule = getUserWeeklySchedule(user);
    const dayKey = getDayKeyForDate(input);
    const fallbackTimeIn = formatTimeValue(user?.time_in || '') || DEFAULT_EMPLOYEE_TIME_IN;
    const fallbackTimeOut = formatTimeValue(user?.time_out || '') || DEFAULT_EMPLOYEE_TIME_OUT;
    const daySchedule = dayKey && schedule[dayKey]
        ? schedule[dayKey]
        : normalizeScheduleDayValue({}, fallbackTimeIn, fallbackTimeOut, dayKey === 'sunday');
 
    return {
        day_key: dayKey,
        day_label: dayKey ? (WEEKLY_SCHEDULE_DAY_LABELS[dayKey] || dayKey) : '',
        is_day_off: Boolean(daySchedule.is_day_off),
        time_in: formatTimeValue(daySchedule.time_in || ''),
        time_out: formatTimeValue(daySchedule.time_out || '')
    };
}

function stringifyWeeklySchedule(schedulePayload, fallbackTimeIn = DEFAULT_EMPLOYEE_TIME_IN, fallbackTimeOut = DEFAULT_EMPLOYEE_TIME_OUT) {
    return JSON.stringify(parseWeeklySchedulePayload(schedulePayload, fallbackTimeIn, fallbackTimeOut));
}

function applyTimeToWorkingDays(schedulePayload, field, value) {
    if (!['time_in', 'time_out'].includes(field)) {
        return parseWeeklySchedulePayload(schedulePayload);
    }
 
    const formattedValue = formatTimeValue(value);
    const schedule = parseWeeklySchedulePayload(schedulePayload);
    if (!formattedValue) {
        return schedule;
    }
 
    WEEKLY_SCHEDULE_DAYS.forEach((dayKey) => {
        const existing = schedule[dayKey];
        if (existing?.is_day_off) {
            return;
        }
 
        schedule[dayKey] = {
            ...existing,
            [field]: formattedValue
        };
    });
 
    return schedule;
}

function pickDefaultScheduleTime(schedulePayload, field, fallbackValue) {
    const schedule = parseWeeklySchedulePayload(schedulePayload);
    for (const dayKey of WEEKLY_SCHEDULE_DAYS) {
        const daySchedule = schedule[dayKey];
        if (daySchedule?.is_day_off) {
            continue;
        }
 
        const value = formatTimeValue(daySchedule[field] || '');
        if (value) {
            return value;
        }
    }
 
    return formatTimeValue(fallbackValue) || (field === 'time_in' ? DEFAULT_EMPLOYEE_TIME_IN : DEFAULT_EMPLOYEE_TIME_OUT);
}

function calculateWorkedHours(timeIn, timeOut) {
    const timeInMinutes = parseTimeToMinutes(timeIn);
    const timeOutMinutes = parseTimeToMinutes(timeOut);

    if (timeInMinutes === null || timeOutMinutes === null || timeOutMinutes < timeInMinutes) {
        return '';
    }

    return ((timeOutMinutes - timeInMinutes) / 60).toFixed(2);
}

function calculateLateMinutes(timeIn, scheduledTimeIn) {
    const timeInMinutes = parseTimeToMinutes(timeIn);
    const scheduledMinutes = parseTimeToMinutes(scheduledTimeIn);
    if (timeInMinutes === null || scheduledMinutes === null) {
        return 0;
    }

    return Math.max(0, timeInMinutes - scheduledMinutes);
}

function normalizeStatus(remarks, lateMinutes, hasTimeIn) {
    const text = normalizeText(remarks);
    const lowered = text.toLowerCase();

    if (text) {
        if (['late', 'present', 'absent', 'excuse', 'day off'].includes(lowered)) {
            return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
        }
        return text;
    }

    if (!hasTimeIn) {
        return 'Absent';
    }

    return lateMinutes > 0 ? 'Late' : 'Present';
}

function buildAvatarUrl(name, background = '4e73df', color = 'ffffff') {
    return `https://ui-avatars.com/api/?background=${background}&color=${color}&name=${encodeURIComponent(name || 'User')}`;
}

function normalizeRole(role) {
    const normalized = normalizeText(role).toLowerCase();
    if (normalized === 'head_admin' || normalized === 'company_admin') {
        return ROLE_COMPANY_ADMIN;
    }
    if (normalized === ROLE_STAFF) {
        return ROLE_STAFF;
    }
    if (normalized === 'super_admin') {
        return ROLE_SUPER_ADMIN;
    }
    return ROLE_EMPLOYEE;
}

function isCompanyAdminRole(role) {
    return COMPANY_ADMIN_ROLE_ALIASES.has(normalizeText(role).toLowerCase());
}

function isEmployeeLikeRole(role) {
    const normalizedRole = normalizeRole(role);
    return normalizedRole === ROLE_EMPLOYEE || normalizedRole === ROLE_STAFF;
}

function listEmployeeLikeUsers(filter = '') {
    return listUsers('', filter).filter((user) => isEmployeeLikeRole(user?.role));
}

function parseModules(modulesJson) {
    try {
        const parsed = JSON.parse(String(modulesJson || '{}'));
        return {
            attendance: Boolean(parsed.attendance),
            sales: Boolean(parsed.sales),
            inventory: Boolean(parsed.inventory),
            invoicing: Boolean(parsed.invoicing),
            reports: Boolean(parsed.reports),
            ai_reader: Boolean(parsed.ai_reader)
        };
    } catch (_error) {
        return {
            attendance: false,
            sales: false,
            inventory: false,
            invoicing: false,
            reports: false,
            ai_reader: false
        };
    }
}

function parseUserFeatureAccess(featureAccessJson) {
    let parsed = null;

    if (featureAccessJson && typeof featureAccessJson === 'object' && !Buffer.isBuffer(featureAccessJson)) {
        parsed = featureAccessJson;
    } else {
        const rawValue = String(featureAccessJson ?? '').trim();
        if (!rawValue) {
            return { ...USER_FEATURE_DEFAULTS };
        }

        try {
            parsed = JSON.parse(rawValue);
        } catch (_error) {
            return { ...USER_FEATURE_DEFAULTS };
        }
    }

    const source = (parsed && typeof parsed === 'object') ? parsed : {};
    return USER_FEATURE_KEYS.reduce((access, key) => {
        access[key] = Object.prototype.hasOwnProperty.call(source, key)
            ? Boolean(source[key])
            : Boolean(USER_FEATURE_DEFAULTS[key]);
        return access;
    }, {});
}

function normalizeUserFeatureAccessPayload(value = {}, fallback = USER_FEATURE_DEFAULTS) {
    const source = (value && typeof value === 'object' && !Array.isArray(value))
        ? value
        : {};
    const fallbackAccess = parseUserFeatureAccess(fallback);

    return USER_FEATURE_KEYS.reduce((access, key) => {
        access[key] = Object.prototype.hasOwnProperty.call(source, key)
            ? Boolean(source[key])
            : Boolean(fallbackAccess[key]);
        return access;
    }, {});
}

function getAllowedUserFeatureAccessByContext(context = requireTenantContext()) {
    const modules = context?.modules || {};
    const companyCode = normalizeCompanyCode(context?.company?.company_code || '');

    return {
        expenses: Boolean(modules.sales),
        order_form: Boolean(modules.invoicing),
        inventory: Boolean(modules.inventory),
        composite: Boolean(modules.inventory),
        lbc_tracking: Boolean(modules.sales && isGmsOrGwdCompanyCode(companyCode))
    };
}

function getDefaultUserFeatureAccessByContext(context = requireTenantContext()) {
    const allowed = getAllowedUserFeatureAccessByContext(context);

    return USER_FEATURE_KEYS.reduce((access, key) => {
        access[key] = Boolean(allowed[key]) && Boolean(USER_FEATURE_DEFAULTS[key]);
        return access;
    }, {});
}

function sanitizeUserFeatureAccessPayload(value = {}, fallback = USER_FEATURE_DEFAULTS) {
    const normalized = normalizeUserFeatureAccessPayload(value, fallback);
    const allowed = getAllowedUserFeatureAccessByContext();

    return USER_FEATURE_KEYS.reduce((access, key) => {
        access[key] = Boolean(allowed[key]) ? Boolean(normalized[key]) : false;
        return access;
    }, {});
}

function parseQuotaJson(quotaJson) {
    try {
        return JSON.parse(String(quotaJson || '{}')) || {};
    } catch (_error) {
        return {};
    }
}

function cloneWorkspaceConfigDefaults() {
    return JSON.parse(JSON.stringify(WORKSPACE_CONFIG_DEFAULTS));
}

function normalizeStringArray(value = []) {
    if (!Array.isArray(value)) {
        return [];
    }

    return [...new Set(
        value
            .map((entry) => normalizeText(entry))
            .filter(Boolean)
    )];
}

function parseWorkspaceConfig(value = null) {
    let parsed = null;

    if (value && typeof value === 'object' && !Buffer.isBuffer(value) && !Array.isArray(value)) {
        parsed = value;
    } else {
        const rawValue = String(value || '').trim();
        if (!rawValue) {
            return cloneWorkspaceConfigDefaults();
        }

        try {
            parsed = JSON.parse(rawValue);
        } catch (_error) {
            return cloneWorkspaceConfigDefaults();
        }
    }

    const source = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    const defaults = cloneWorkspaceConfigDefaults();

    const labels = (source.labels && typeof source.labels === 'object' && !Array.isArray(source.labels))
        ? source.labels
        : {};
    Object.keys(defaults.labels).forEach((key) => {
        const candidate = normalizeText(labels[key]);
        if (candidate) {
            defaults.labels[key] = candidate;
        }
    });

    const menu = (source.menu && typeof source.menu === 'object' && !Array.isArray(source.menu))
        ? source.menu
        : {};
    defaults.menu.showInvoiceSummary = Object.prototype.hasOwnProperty.call(menu, 'showInvoiceSummary')
        ? Boolean(menu.showInvoiceSummary)
        : defaults.menu.showInvoiceSummary;
    defaults.menu.showCustomerRequests = Object.prototype.hasOwnProperty.call(menu, 'showCustomerRequests')
        ? Boolean(menu.showCustomerRequests)
        : defaults.menu.showCustomerRequests;
    defaults.menu.showInventoryLevels = Object.prototype.hasOwnProperty.call(menu, 'showInventoryLevels')
        ? Boolean(menu.showInventoryLevels)
        : defaults.menu.showInventoryLevels;

    const orderForm = (source.orderForm && typeof source.orderForm === 'object' && !Array.isArray(source.orderForm))
        ? source.orderForm
        : {};
    defaults.orderForm.branches = normalizeStringArray(orderForm.branches);
    defaults.orderForm.cashBranches = normalizeStringArray(orderForm.cashBranches);
    defaults.orderForm.couriers = normalizeStringArray(orderForm.couriers);
    defaults.orderForm.admins = normalizeStringArray(orderForm.admins);
    defaults.orderForm.salesRepresentatives = normalizeStringArray(orderForm.salesRepresentatives);
    defaults.orderForm.paymentMethods = normalizeStringArray(orderForm.paymentMethods);
    const visibleFields = (orderForm.visibleFields && typeof orderForm.visibleFields === 'object' && !Array.isArray(orderForm.visibleFields))
        ? orderForm.visibleFields
        : {};
    Object.keys(defaults.orderForm.visibleFields).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(visibleFields, key)) {
            defaults.orderForm.visibleFields[key] = Boolean(visibleFields[key]);
        }
    });

    const salesReport = (source.salesReport && typeof source.salesReport === 'object' && !Array.isArray(source.salesReport))
        ? source.salesReport
        : {};
    Object.keys(defaults.salesReport).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(salesReport, key)) {
            defaults.salesReport[key] = Boolean(salesReport[key]);
        }
    });

    const expenses = (source.expenses && typeof source.expenses === 'object' && !Array.isArray(source.expenses))
        ? source.expenses
        : {};
    defaults.expenses.title = normalizeText(expenses.title);
    defaults.expenses.copy = normalizeMultilineText(expenses.copy, { maxLength: 600 });

    return defaults;
}

function serializePlan(plan) {
    if (!plan) {
        return null;
    }

    return {
        id: plan.id,
        name: plan.name,
        price_monthly: Number(plan.price_monthly || 0),
        max_branches: Number(plan.max_branches || 0),
        max_users: Number(plan.max_users || 0),
        max_invoices_monthly: Number(plan.max_invoices_monthly || 0),
        modules: parseModules(plan.modules_json),
        ai_enabled_default: Boolean(Number(plan.ai_enabled_default || 0)),
        ai_monthly_quota: Number(plan.ai_monthly_quota || 0)
    };
}

function serializeAddon(addon) {
    const addonKey = normalizeAddonKey(addon.addon_key);
    return {
        addon_key: addonKey,
        is_active: Boolean(Number(addon.is_active || 0)),
        quota: parseQuotaJson(addon.quota_json)
    };
}

function countRows(db, sql, ...params) {
    const row = db.prepare(sql).get(...params);
    return Number(row?.total || 0);
}

function getCurrentContext() {
    return tenantContextStorage.getStore() || null;
}

function requireTenantContext() {
    const context = getCurrentContext();
    if (!context?.companyId) {
        throw new Error('Tenant context is required.');
    }

    return context;
}

function getCompanyById(companyId) {
    ensureSystemReady();
    return getMasterDb().prepare(`
        SELECT *
        FROM companies
        WHERE id = ?
        LIMIT 1
    `).get(String(companyId || ''));
}

function getPlanById(planId) {
    ensureSystemReady();
    return getMasterDb().prepare(`
        SELECT *
        FROM plans
        WHERE id = ?
        LIMIT 1
    `).get(String(planId || ''));
}

function listPlans() {
    ensureSystemReady();
    return getMasterDb().prepare(`
        SELECT *
        FROM plans
        ORDER BY price_monthly ASC, name COLLATE NOCASE
    `).all().map(serializePlan);
}

function normalizeModulesPayload(value = {}) {
    const source = (value && typeof value === 'object') ? value : {};
    return {
        attendance: Boolean(source.attendance),
        sales: Boolean(source.sales),
        inventory: Boolean(source.inventory),
        invoicing: Boolean(source.invoicing),
        reports: Boolean(source.reports),
        ai_reader: Boolean(source.ai_reader)
    };
}

function createPlan(payload = {}) {
    ensureSystemReady();
    const id = normalizeIdentifier(payload.id || payload.name);
    const name = normalizeText(payload.name);
    if (!id) {
        throw new Error('Plan id is required.');
    }
    if (!name) {
        throw new Error('Plan name is required.');
    }

    const modules = normalizeModulesPayload(payload.modules || payload.modules_json || {});
    const priceMonthly = Number(payload.price_monthly || payload.priceMonthly || 0);
    const maxBranches = Math.max(0, Number(payload.max_branches || payload.maxBranches || 0));
    const maxUsers = Math.max(0, Number(payload.max_users || payload.maxUsers || 0));
    const maxInvoicesMonthly = Math.max(0, Number(payload.max_invoices_monthly || payload.maxInvoicesMonthly || 0));
    const aiEnabledDefault = (payload.ai_enabled_default || payload.aiEnabledDefault || modules.ai_reader) ? 1 : 0;
    const aiMonthlyQuota = Math.max(0, Number(payload.ai_monthly_quota || payload.aiMonthlyQuota || 0));
    const db = getMasterDb();
    runPlanWrite(() => {
        db.prepare(`
            INSERT INTO plans (
                id, name, price_monthly, max_branches, max_users, max_invoices_monthly,
                modules_json, ai_enabled_default, ai_monthly_quota
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            name,
            priceMonthly,
            maxBranches,
            maxUsers,
            maxInvoicesMonthly,
            JSON.stringify(modules),
            aiEnabledDefault,
            aiMonthlyQuota
        );
    });

    logAudit('plan.create', 'plan', id, {
        id,
        name,
        price_monthly: priceMonthly,
        max_branches: maxBranches,
        max_users: maxUsers,
        max_invoices_monthly: maxInvoicesMonthly,
        modules,
        ai_enabled_default: Boolean(aiEnabledDefault),
        ai_monthly_quota: aiMonthlyQuota
    });

    return serializePlan(getPlanById(id));
}

function updatePlan(planId, payload = {}) {
    ensureSystemReady();
    const existing = getPlanById(planId);
    if (!existing) {
        throw new Error('Plan not found.');
    }

    const modules = normalizeModulesPayload(
        payload.modules
        || payload.modules_json
        || parseModules(existing.modules_json)
    );
    const requestedId = normalizeText(payload.id);
    const id = requestedId ? normalizeIdentifier(requestedId) : String(existing.id || '');
    const name = normalizeText(payload.name || existing.name);
    if (!id) {
        throw new Error('Plan id is required.');
    }
    if (!name) {
        throw new Error('Plan name is required.');
    }

    const priceMonthly = Number(payload.price_monthly ?? payload.priceMonthly ?? existing.price_monthly ?? 0);
    const maxBranches = Math.max(0, Number(payload.max_branches ?? payload.maxBranches ?? existing.max_branches ?? 0));
    const maxUsers = Math.max(0, Number(payload.max_users ?? payload.maxUsers ?? existing.max_users ?? 0));
    const maxInvoicesMonthly = Math.max(0, Number(payload.max_invoices_monthly ?? payload.maxInvoicesMonthly ?? existing.max_invoices_monthly ?? 0));
    const aiEnabledDefault = (payload.ai_enabled_default ?? payload.aiEnabledDefault ?? existing.ai_enabled_default ?? modules.ai_reader) ? 1 : 0;
    const aiMonthlyQuota = Math.max(0, Number(payload.ai_monthly_quota ?? payload.aiMonthlyQuota ?? existing.ai_monthly_quota ?? 0));

    runPlanWrite(() => {
        getMasterDb().prepare(`
            UPDATE plans
            SET id = ?,
                name = ?,
                price_monthly = ?,
                max_branches = ?,
                max_users = ?,
                max_invoices_monthly = ?,
                modules_json = ?,
                ai_enabled_default = ?,
                ai_monthly_quota = ?
            WHERE id = ?
        `).run(
            id,
            name,
            priceMonthly,
            maxBranches,
            maxUsers,
            maxInvoicesMonthly,
            JSON.stringify(modules),
            aiEnabledDefault,
            aiMonthlyQuota,
            existing.id
        );

        if (existing.id !== id) {
            getMasterDb().prepare(`
                UPDATE companies
                SET plan_id = ?
                WHERE plan_id = ?
            `).run(id, existing.id);

            getMasterDb().prepare(`
                UPDATE subscriptions
                SET plan_id = ?
                WHERE plan_id = ?
            `).run(id, existing.id);
        }
    });

    logAudit('plan.update', 'plan', id, {
        previous_id: existing.id,
        id,
        name,
        price_monthly: priceMonthly,
        max_branches: maxBranches,
        max_users: maxUsers,
        max_invoices_monthly: maxInvoicesMonthly,
        modules,
        ai_enabled_default: Boolean(aiEnabledDefault),
        ai_monthly_quota: aiMonthlyQuota
    });

    return serializePlan(getPlanById(id));
}

function deletePlan(planId) {
    ensureSystemReady();
    const id = normalizeText(planId).toLowerCase();
    if (!id) {
        throw new Error('Plan id is required.');
    }

    const existing = getPlanById(id);
    if (!existing) {
        throw new Error('Plan not found.');
    }

    const db = getMasterDb();
    const totalPlans = Number(db.prepare('SELECT COUNT(*) AS total FROM plans').get()?.total || 0);
    if (totalPlans <= 1) {
        throw new Error('At least one plan must remain.');
    }

    const companiesCount = Number(db.prepare(`
        SELECT COUNT(*) AS total
        FROM companies
        WHERE plan_id = ?
    `).get(existing.id)?.total || 0);
    const activeSubscriptionsCount = Number(db.prepare(`
        SELECT COUNT(*) AS total
        FROM subscriptions
        WHERE plan_id = ?
          AND is_active = 1
    `).get(existing.id)?.total || 0);

    if (companiesCount > 0 || activeSubscriptionsCount > 0) {
        throw new Error(
            `Plan is currently in use by ${companiesCount} companies and ${activeSubscriptionsCount} active subscriptions. Reassign companies first.`
        );
    }

    db.prepare(`
        DELETE FROM plans
        WHERE id = ?
    `).run(existing.id);

    logAudit('plan.delete', 'plan', existing.id, {
        id: existing.id,
        name: existing.name
    });

    return {
        id: existing.id,
        deleted: true
    };
}

function getActiveSubscription(companyId) {
    return getMasterDb().prepare(`
        SELECT *
        FROM subscriptions
        WHERE company_id = ?
          AND is_active = 1
        ORDER BY start_date DESC, id DESC
        LIMIT 1
    `).get(String(companyId || ''));
}

function listAddonsByCompany(companyId) {
    return getMasterDb().prepare(`
        SELECT addon_key, is_active, quota_json
        FROM addons
        WHERE company_id = ?
        ORDER BY addon_key COLLATE NOCASE
    `).all(String(companyId || '')).map(serializeAddon);
}

function getAddonMap(companyId) {
    return listAddonsByCompany(companyId).reduce((map, addon) => {
        const addonKey = normalizeAddonKey(addon.addon_key);
        if (!addonKey) {
            return map;
        }
        map[addonKey] = {
            ...addon,
            addon_key: addonKey
        };
        return map;
    }, {});
}

function getUsageRow(companyId, monthKey = getMonthKey()) {
    const db = getMasterDb();
    db.prepare(`
        INSERT INTO usage_monthly (company_id, month_key)
        VALUES (?, ?)
        ON CONFLICT(company_id, month_key) DO NOTHING
    `).run(String(companyId || ''), String(monthKey || getMonthKey()));

    return db.prepare(`
        SELECT *
        FROM usage_monthly
        WHERE company_id = ?
          AND month_key = ?
        LIMIT 1
    `).get(String(companyId || ''), String(monthKey || getMonthKey()));
}

function incrementUsage(companyId, field, amount = 1, monthKey = getMonthKey()) {
    const allowedFields = new Set(['invoices_count', 'ai_reads_count', 'storage_mb_used']);
    if (!allowedFields.has(field)) {
        throw new Error('Invalid usage field.');
    }

    getUsageRow(companyId, monthKey);
    getMasterDb().prepare(`
        UPDATE usage_monthly
        SET ${field} = COALESCE(${field}, 0) + ?
        WHERE company_id = ?
          AND month_key = ?
    `).run(Number(amount || 0), String(companyId || ''), String(monthKey || getMonthKey()));

    return getUsageRow(companyId, monthKey);
}

function getScopedUser(companyId, username) {
    ensureSystemReady();
    return getMasterDb().prepare(`
        SELECT *
        FROM users
        WHERE COALESCE(company_id, '') = COALESCE(?, '')
          AND LOWER(username) = LOWER(?)
        LIMIT 1
    `).get(companyId || '', normalizeText(username));
}

function getPrimaryCompanyAdminUser(companyId = '') {
    const normalizedCompanyId = normalizeText(companyId);
    if (!normalizedCompanyId) {
        return null;
    }

    return getMasterDb().prepare(`
        SELECT *
        FROM users
        WHERE company_id = ?
          AND LOWER(role) IN ('company_admin', 'head_admin')
        ORDER BY
            CASE WHEN LOWER(role) = 'company_admin' THEN 0 ELSE 1 END,
            created_at ASC,
            username COLLATE NOCASE
        LIMIT 1
    `).get(normalizedCompanyId);
}

function getCompanyAdminCredential(companyId = '') {
    const normalizedCompanyId = normalizeText(companyId);
    if (!normalizedCompanyId) {
        return null;
    }

    return getMasterDb().prepare(`
        SELECT company_id, username, password_text, updated_at
        FROM company_admin_credentials
        WHERE company_id = ?
        LIMIT 1
    `).get(normalizedCompanyId);
}

function upsertCompanyAdminCredential(companyId = '', username = '', passwordText = '') {
    const normalizedCompanyId = normalizeText(companyId);
    const normalizedUsername = normalizeText(username);
    if (!normalizedCompanyId || !normalizedUsername) {
        return null;
    }

    getMasterDb().prepare(`
        INSERT INTO company_admin_credentials (company_id, username, password_text, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(company_id) DO UPDATE SET
            username = excluded.username,
            password_text = excluded.password_text,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        normalizedCompanyId,
        normalizedUsername,
        String(passwordText || '')
    );

    return getCompanyAdminCredential(normalizedCompanyId);
}

function getUserByInternalId(internalId) {
    ensureSystemReady();
    return getMasterDb().prepare(`
        SELECT *
        FROM users
        WHERE id = ?
        LIMIT 1
    `).get(String(internalId || ''));
}

function createUserInternalId(companyId, username) {
    return `${companyId || 'global'}::${normalizeText(username)}`;
}

function getBranchById(branchId, companyId = '') {
    const context = getCurrentContext();
    const targetCompanyId = companyId || context?.companyId || '';
    if (!targetCompanyId || !branchId) {
        return null;
    }

    return getTenantDb(targetCompanyId).prepare(`
        SELECT *
        FROM branches
        WHERE id = ?
        LIMIT 1
    `).get(String(branchId));
}

function serializeUser(user, { includeInternalId = false } = {}) {
    if (!user) {
        return null;
    }

    const branch = user.company_id ? getBranchById(user.branch_id, user.company_id) : null;
    const weeklySchedule = getUserWeeklySchedule(user);
    const payload = {
        id: user.username,
        username: user.username,
        name: user.display_name || user.username,
        role: normalizeRole(user.role),
        branch_id: user.branch_id || '',
        branch_name: branch?.branch_name || '',
        profile_picture: user.profile_picture || '',
        time_in: formatTimeValue(user.time_in || '') || DEFAULT_EMPLOYEE_TIME_IN,
        time_out: formatTimeValue(user.time_out || '') || DEFAULT_EMPLOYEE_TIME_OUT,
        weekly_schedule: weeklySchedule,
        schedule_json: stringifyWeeklySchedule(weeklySchedule),
        feature_access: parseUserFeatureAccess(user.feature_access_json),
        is_active: Boolean(Number(user.is_active || 0)),
        company_id: user.company_id || '',
        created_at: user.created_at || ''
    };

    if (includeInternalId) {
        payload.user_key = user.id;
    }

    return payload;
}

function getBranchRows(companyId = '') {
    const context = getCurrentContext();
    const targetCompanyId = companyId || context?.companyId || '';
    if (!targetCompanyId) {
        return [];
    }

    return getTenantDb(targetCompanyId).prepare(`
        SELECT *
        FROM branches
        ORDER BY branch_name COLLATE NOCASE
    `).all();
}

function listBranches() {
    return getBranchRows().map((branch) => ({
        id: branch.id,
        branch_name: branch.branch_name,
        address: branch.address || '',
        is_active: Boolean(Number(branch.is_active || 0))
    }));
}

function getDefaultBranch() {
    const branches = listBranches();
    return branches.find((branch) => branch.is_active) || branches[0] || null;
}

function ensureDefaultTenantTemplate(companyId, company = null) {
    const tenantDb = getTenantDb(companyId);
    const targetCompany = company || getCompanyById(companyId);

    tenantDb.prepare(`
        INSERT INTO invoice_templates (
            id, template_name, business_name, address, contact, logo_path,
            footer_notes, terms, signature_name, signature_position, signature_path,
            receipt_title, receipt_subtitle, receipt_meta_layout, receipt_totals_layout,
            template_style, updated_at
        )
        VALUES (
            'default', 'Default Template', ?, '', '', ?, 'Thank you for your business.', '',
            '', '', '', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
        )
        ON CONFLICT(id) DO NOTHING
    `).run(
        targetCompany?.name || '',
        targetCompany?.logo_path || '',
        DEFAULT_RECEIPT_TITLE,
        DEFAULT_RECEIPT_SUBTITLE,
        DEFAULT_RECEIPT_META_LAYOUT,
        DEFAULT_RECEIPT_TOTALS_LAYOUT,
        DEFAULT_TEMPLATE_STYLE
    );
}

function getTenantFeatureState(companyId) {
    const company = getCompanyById(companyId);
    if (!company) {
        throw new Error('Company not found.');
    }

    const plan = getPlanById(company.plan_id) || getPlanById(getActiveSubscription(companyId)?.plan_id || '');
    if (!plan) {
        throw new Error('Plan not found for company.');
    }

    const tenantDb = getTenantDb(companyId);
    const addons = getAddonMap(companyId);
    const modules = parseModules(plan.modules_json);
    const usage = getUsageRow(companyId);
    const branchCount = countRows(tenantDb, 'SELECT COUNT(*) AS total FROM branches WHERE is_active = 1');
    const userCount = countRows(getMasterDb(), `
        SELECT COUNT(*) AS total
        FROM users
        WHERE company_id = ?
          AND is_active = 1
          AND LOWER(role) != 'super_admin'
    `, companyId);
    const extraBranches = Number(addons.extra_branches?.quota?.count || 0);
    const aiAddonQuota = Number(addons.ai_reader?.quota?.monthlyQuota || 0);
    const aiEnabled = Boolean(
        modules.ai_reader
        || Number(plan.ai_enabled_default || 0)
        || addons.ai_reader?.is_active
    );
    const aiQuota = aiEnabled
        ? Math.max(
            Number(plan.ai_monthly_quota || 0),
            addons.ai_reader?.is_active ? (aiAddonQuota || DEFAULT_AI_QUOTA) : 0
        )
        : 0;

    return {
        companyId,
        company,
        plan: serializePlan(plan),
        addons,
        usage: {
            month_key: usage.month_key,
            invoices_count: Number(usage.invoices_count || 0),
            ai_reads_count: Number(usage.ai_reads_count || 0),
            storage_mb_used: Number(usage.storage_mb_used || 0)
        },
        limits: {
            max_branches: Math.max(0, Number(plan.max_branches || 0) + extraBranches),
            max_users: Math.max(0, Number(plan.max_users || 0)),
            max_invoices_monthly: Math.max(0, Number(plan.max_invoices_monthly || 0)),
            ai_monthly_quota: Math.max(0, aiQuota)
        },
        counts: {
            branches: branchCount,
            users: userCount
        },
        modules: {
            ...modules,
            ai_reader: aiEnabled
        }
    };
}

function runWithTenantContextByCompany(companyId, fn) {
    ensureSystemReady();
    const featureState = getTenantFeatureState(companyId);
    const context = {
        companyId,
        company: featureState.company,
        plan: featureState.plan,
        addons: featureState.addons,
        usage: featureState.usage,
        limits: featureState.limits,
        counts: featureState.counts,
        modules: featureState.modules
    };

    return tenantContextStorage.run(context, fn);
}

function getCurrentBranding(context = getCurrentContext()) {
    if (!context?.company) {
        return { ...PARENT_BRAND };
    }

    const whiteLabelEnabled = Boolean(context.addons.white_label?.is_active);
    if (!whiteLabelEnabled) {
        return {
            ...PARENT_BRAND,
            companyName: context.company.name,
            subtitle: context.company.name
        };
    }

    return {
        appName: context.company.app_name || context.company.name || PARENT_BRAND.appName,
        companyName: context.company.name || PARENT_BRAND.companyName,
        logoPath: context.company.logo_path || PARENT_BRAND.logoPath,
        primaryColor: context.company.primary_color || PARENT_BRAND.primaryColor,
        faviconPath: PARENT_BRAND.faviconPath,
        subtitle: context.company.name || PARENT_BRAND.subtitle
    };
}

function buildUpgradeMessage(moduleKey, planName) {
    const moduleLabelMap = {
        attendance: 'Attendance',
        sales: 'Sales',
        inventory: 'Inventory',
        invoicing: 'Invoicing',
        reports: 'Reports',
        ai_reader: 'AI Reader'
    };
    const label = moduleLabelMap[moduleKey] || 'This feature';
    return `${label} is not included in the ${planName || 'current'} plan. Upgrade the subscription to continue.`;
}

function assertModuleAccess(moduleKey) {
    const context = requireTenantContext();
    if (context.modules[moduleKey]) {
        return true;
    }

    throw new Error(buildUpgradeMessage(moduleKey, context.plan?.name));
}

function assertUserLimit() {
    const context = requireTenantContext();
    const currentUsers = countRows(getMasterDb(), `
        SELECT COUNT(*) AS total
        FROM users
        WHERE company_id = ?
          AND is_active = 1
          AND LOWER(role) != 'super_admin'
    `, context.companyId);

    if (currentUsers >= Number(context.limits.max_users || 0)) {
        throw new Error(`User limit reached for the ${context.plan?.name || 'current'} plan.`);
    }
}

function assertBranchLimit() {
    const context = requireTenantContext();
    const currentBranches = countRows(getTenantDb(), 'SELECT COUNT(*) AS total FROM branches WHERE is_active = 1');

    if (currentBranches >= Number(context.limits.max_branches || 0)) {
        throw new Error(`Branch limit reached for the ${context.plan?.name || 'current'} plan.`);
    }
}

function assertInvoiceLimit() {
    const context = requireTenantContext();
    const usage = getUsageRow(context.companyId);
    if (Number(context.limits.max_invoices_monthly || 0) <= 0) {
        throw new Error(`Monthly invoice creation is not available on the ${context.plan?.name || 'current'} plan.`);
    }

    if (Number(usage.invoices_count || 0) >= Number(context.limits.max_invoices_monthly || 0)) {
        throw new Error('Monthly invoice limit reached. Upgrade the subscription to create more invoices.');
    }
}

function assertAiAccess() {
    const context = requireTenantContext();
    if (!context.modules.ai_reader) {
        throw new Error(buildUpgradeMessage('ai_reader', context.plan?.name));
    }

    const usage = getUsageRow(context.companyId);
    const quota = Number(context.limits.ai_monthly_quota || 0);
    if (quota <= 0) {
        throw new Error('AI reading is not currently available for this subscription.');
    }

    if (Number(usage.ai_reads_count || 0) >= quota) {
        throw new Error('Monthly AI reader quota reached. Upgrade or add more AI reads to continue.');
    }
}

function recordInvoiceCreated() {
    const context = requireTenantContext();
    return incrementUsage(context.companyId, 'invoices_count', 1);
}

function recordAiRead() {
    const context = requireTenantContext();
    return incrementUsage(context.companyId, 'ai_reads_count', 1);
}

function getCompanyCodeCandidates(inputCode, host = '') {
    const codes = new Set();
    const normalizedInput = normalizeIdentifier(inputCode);
    if (normalizedInput) {
        codes.add(normalizedInput);
    }

    const normalizedHost = normalizeText(host).split(':')[0].toLowerCase();
    if (
        normalizedHost
        && !['127.0.0.1', 'localhost'].includes(normalizedHost)
        && !/^\d+\.\d+\.\d+\.\d+$/.test(normalizedHost)
    ) {
        const hostParts = normalizedHost.split('.').filter(Boolean);
        if (hostParts.length >= 3) {
            codes.add(normalizeIdentifier(hostParts[0]));
        }
    }

    return [...codes].filter(Boolean);
}

function getCompanyByCodeOrHost(companyCode = '', host = '') {
    ensureSystemReady();
    const db = getMasterDb();
    const candidates = getCompanyCodeCandidates(companyCode, host);

    for (const code of candidates) {
        const row = db.prepare(`
            SELECT *
            FROM companies
            WHERE LOWER(company_code) = LOWER(?)
               OR LOWER(COALESCE(subdomain, '')) = LOWER(?)
            LIMIT 1
        `).get(code, code);
        if (row) {
            return row;
        }
    }

    const normalizedHost = normalizeText(host).split(':')[0].toLowerCase();
    if (normalizedHost && !['127.0.0.1', 'localhost'].includes(normalizedHost)) {
        const customDomainMatch = db.prepare(`
            SELECT *
            FROM companies
            WHERE LOWER(COALESCE(custom_domain, '')) = LOWER(?)
            LIMIT 1
        `).get(normalizedHost);

        if (customDomainMatch) {
            const addons = getAddonMap(customDomainMatch.id);
            if (addons.custom_domain?.is_active) {
                return customDomainMatch;
            }
        }
    }

    const activeCompanies = db.prepare(`
        SELECT *
        FROM companies
        WHERE status = 'active'
        ORDER BY created_at ASC, name COLLATE NOCASE
    `).all();

    return activeCompanies.length === 1 ? activeCompanies[0] : null;
}

function getPublicBranding({ companyCode = '', host = '' } = {}) {
    const company = getCompanyByCodeOrHost(companyCode, host);
    if (!company) {
        return {
            ...PARENT_BRAND,
            companyCode: '',
            companyName: '',
            whiteLabel: false
        };
    }

    const addons = getAddonMap(company.id);
    const whiteLabelEnabled = Boolean(addons.white_label?.is_active);

    return {
        appName: whiteLabelEnabled
            ? (company.app_name || company.name || PARENT_BRAND.appName)
            : PARENT_BRAND.appName,
        companyName: company.name,
        logoPath: whiteLabelEnabled
            ? (company.logo_path || PARENT_BRAND.logoPath)
            : PARENT_BRAND.logoPath,
        primaryColor: whiteLabelEnabled
            ? (company.primary_color || PARENT_BRAND.primaryColor)
            : PARENT_BRAND.primaryColor,
        faviconPath: PARENT_BRAND.faviconPath,
        subtitle: whiteLabelEnabled
            ? (company.name || PARENT_BRAND.subtitle)
            : `${PARENT_BRAND.appName} for ${company.name}`,
        companyCode: company.company_code,
        whiteLabel: whiteLabelEnabled
    };
}

function getUserByCredentials({ companyCode = '', username = '', password = '', host = '' } = {}) {
    ensureSystemReady();
    const normalizedUsername = normalizeText(username);
    if (!normalizedUsername) {
        return null;
    }

    if (!normalizeText(companyCode)) {
        const superAdmin = getScopedUser('', normalizedUsername);
        if (superAdmin && normalizeRole(superAdmin.role) === ROLE_SUPER_ADMIN) {
            const verification = verifyPassword(password, superAdmin.password_hash);
            if (!verification.matches) {
                return null;
            }

            if (verification.needsUpgrade) {
                getMasterDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?')
                    .run(hashPassword(password), superAdmin.id);
            }

            return {
                ...serializeUser(superAdmin, { includeInternalId: true }),
                company_code: '',
                company_name: '',
                branding: { ...PARENT_BRAND }
            };
        }
    }

    const company = getCompanyByCodeOrHost(companyCode, host);
    if (!company || company.status !== COMPANY_ACTIVE_STATUS) {
        return null;
    }

    const user = getScopedUser(company.id, normalizedUsername);
    if (!user || !Boolean(Number(user.is_active || 0))) {
        return null;
    }

    const verification = verifyPassword(password, user.password_hash);
    if (!verification.matches) {
        return null;
    }

    if (verification.needsUpgrade) {
        getMasterDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            .run(hashPassword(password), user.id);
    }

    return {
        ...serializeUser(user, { includeInternalId: true }),
        company_code: company.company_code,
        company_name: company.name,
        branding: getPublicBranding({ companyCode: company.company_code })
    };
}

function getUserById(id) {
    ensureSystemReady();
    const context = getCurrentContext();

    if (context?.companyId) {
        return serializeUser(getScopedUser(context.companyId, id));
    }

    return serializeUser(getScopedUser('', id));
}

function getTenantBootstrap(userId = '') {
    const context = requireTenantContext();
    const user = getUserById(userId);
    const branding = getCurrentBranding(context);
    const template = getInvoiceTemplate();
    const usage = getUsageRow(context.companyId);
    const branches = listBranches();

    return {
        user,
        branding,
        company: {
            id: context.company.id,
            name: context.company.name,
            company_code: context.company.company_code,
            subdomain: context.company.subdomain || '',
            custom_domain: context.company.custom_domain || '',
            status: context.company.status,
            logo_path: context.company.logo_path || '',
            primary_color: context.company.primary_color || PARENT_BRAND.primaryColor,
            app_name: context.company.app_name || ''
        },
        plan: context.plan,
        modules: context.modules,
        userFeaturePolicy: getAllowedUserFeatureAccessByContext(context),
        addons: Object.values(context.addons),
        usage: {
            month_key: usage.month_key,
            invoices_count: Number(usage.invoices_count || 0),
            ai_reads_count: Number(usage.ai_reads_count || 0),
            storage_mb_used: Number(usage.storage_mb_used || 0)
        },
        limits: {
            branches: {
                current: branches.filter((branch) => branch.is_active).length,
                max: Number(context.limits.max_branches || 0)
            },
            users: {
                current: countRows(getMasterDb(), `
                    SELECT COUNT(*) AS total
                    FROM users
                    WHERE company_id = ?
                      AND is_active = 1
                      AND LOWER(role) != 'super_admin'
                `, context.companyId),
                max: Number(context.limits.max_users || 0)
            },
            invoices: {
                current: Number(usage.invoices_count || 0),
                max: Number(context.limits.max_invoices_monthly || 0)
            },
            aiReads: {
                current: Number(usage.ai_reads_count || 0),
                max: Number(context.limits.ai_monthly_quota || 0)
            }
        },
        branches,
        invoiceTemplate: template,
        workspaceConfig: getCompanyWorkspaceConfig()
    };
}

function logAudit(action, targetType, targetId, details = {}) {
    const context = getCurrentContext();
    const actorId = context?.actorUserId || context?.requestUserId || '';
    getMasterDb().prepare(`
        INSERT INTO audit_logs (company_id, actor_user_id, action, target_type, target_id, details_json)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        context?.companyId || null,
        actorId || null,
        action,
        targetType,
        String(targetId || ''),
        JSON.stringify(details || {})
    );
}

function resolveBranchId(branchId = '', branchName = '') {
    if (branchId) {
        const branch = getBranchById(branchId);
        if (branch) {
            return branch.id;
        }
    }

    if (branchName) {
        const row = getTenantDb().prepare(`
            SELECT *
            FROM branches
            WHERE LOWER(branch_name) = LOWER(?)
            LIMIT 1
        `).get(normalizeText(branchName));
        if (row) {
            return row.id;
        }
    }

    return getDefaultBranch()?.id || '';
}

function listUsers(role = '', filter = '') {
    const context = requireTenantContext();
    const normalizedRole = normalizeText(role)
        ? normalizeRole(role)
        : '';
    const clauses = ['company_id = ?'];
    const params = [context.companyId];

    if (normalizedRole === ROLE_EMPLOYEE) {
        clauses.push("LOWER(role) = 'employee'");
    } else if (normalizedRole === ROLE_STAFF) {
        clauses.push("LOWER(role) = 'staff'");
    } else if (normalizedRole === ROLE_COMPANY_ADMIN) {
        clauses.push("LOWER(role) IN ('company_admin', 'head_admin')");
    }

    if (normalizeText(filter)) {
        clauses.push('(LOWER(username) LIKE LOWER(?) OR LOWER(display_name) LIKE LOWER(?))');
        params.push(`%${filter}%`, `%${filter}%`);
    }

    return getMasterDb().prepare(`
        SELECT *
        FROM users
        WHERE ${clauses.join(' AND ')}
        ORDER BY display_name COLLATE NOCASE, username COLLATE NOCASE
    `).all(...params).map((row) => serializeUser(row));
}

function addEmployee({
    id,
    name,
    password,
    timeIn = DEFAULT_EMPLOYEE_TIME_IN,
    timeOut = DEFAULT_EMPLOYEE_TIME_OUT,
    weeklySchedule = undefined,
    weekly_schedule = undefined,
    schedule = undefined,
    schedule_json = undefined,
    branchId = '',
    branchName = '',
    feature_access = undefined,
    featureAccess = undefined
}) {
    const context = requireTenantContext();
    assertUserLimit();

    const username = normalizeText(id);
    if (!username) {
        throw new Error('Employee ID is required.');
    }

    if (getScopedUser(context.companyId, username)) {
        throw new Error('Employee ID already exists.');
    }

    const resolvedBranchId = resolveBranchId(branchId, branchName);
    const featureAccessPayload = sanitizeUserFeatureAccessPayload(
        feature_access || featureAccess || {},
        getDefaultUserFeatureAccessByContext(context)
    );
    const rawSchedulePayload = weeklySchedule ?? weekly_schedule ?? schedule ?? schedule_json ?? {};
    const normalizedWeeklySchedule = parseWeeklySchedulePayload(rawSchedulePayload, timeIn, timeOut);
    const defaultTimeIn = pickDefaultScheduleTime(normalizedWeeklySchedule, 'time_in', timeIn);
    const defaultTimeOut = pickDefaultScheduleTime(normalizedWeeklySchedule, 'time_out', timeOut);
    getMasterDb().prepare(`
        INSERT INTO users (
            id, company_id, branch_id, username, password_hash, role, is_active,
            display_name, profile_picture, time_in, time_out, schedule_json, feature_access_json
        )
        VALUES (?, ?, ?, ?, ?, 'employee', 1, ?, '', ?, ?, ?, ?)
    `).run(
        createUserInternalId(context.companyId, username),
        context.companyId,
        resolvedBranchId || null,
        username,
        normalizePasswordForStorage(password),
        normalizeText(name),
        defaultTimeIn,
        defaultTimeOut,
        JSON.stringify(normalizedWeeklySchedule),
        JSON.stringify(featureAccessPayload)
    );

    logAudit('user.create', 'user', username, {
        username,
        branch_id: resolvedBranchId || ''
    });

    return getUserById(username);
}

function addUser(payload = {}) {
    const role = normalizeRole(payload.role || ROLE_EMPLOYEE);
    if (role === ROLE_EMPLOYEE) {
        return addEmployee(payload);
    }
    if (role === ROLE_STAFF) {
        const context = requireTenantContext();
        assertUserLimit();

        const username = normalizeText(payload.id || payload.username);
        const displayName = normalizeText(payload.name || payload.display_name || username);
        if (!username) {
            throw new Error('User ID is required.');
        }
        if (!displayName) {
            throw new Error('User name is required.');
        }
        if (getScopedUser(context.companyId, username)) {
            throw new Error('User ID already exists.');
        }

        const resolvedBranchId = resolveBranchId(payload.branch_id || payload.branchId || '', payload.branch_name || payload.branchName || '');
        const featureAccessPayload = sanitizeUserFeatureAccessPayload(
            payload.feature_access || payload.featureAccess || {},
            getDefaultUserFeatureAccessByContext(context)
        );
        const rawSchedulePayload = payload.weeklySchedule
            ?? payload.weekly_schedule
            ?? payload.schedule
            ?? payload.schedule_json
            ?? {};
        const normalizedWeeklySchedule = parseWeeklySchedulePayload(
            rawSchedulePayload,
            payload.timeIn || payload.time_in || DEFAULT_EMPLOYEE_TIME_IN,
            payload.timeOut || payload.time_out || DEFAULT_EMPLOYEE_TIME_OUT
        );
        const defaultTimeIn = pickDefaultScheduleTime(normalizedWeeklySchedule, 'time_in', payload.timeIn || payload.time_in);
        const defaultTimeOut = pickDefaultScheduleTime(normalizedWeeklySchedule, 'time_out', payload.timeOut || payload.time_out);
        getMasterDb().prepare(`
            INSERT INTO users (
                id, company_id, branch_id, username, password_hash, role, is_active,
                display_name, profile_picture, time_in, time_out, schedule_json, feature_access_json
            )
            VALUES (?, ?, ?, ?, ?, 'staff', ?, ?, '', ?, ?, ?, ?)
        `).run(
            createUserInternalId(context.companyId, username),
            context.companyId,
            resolvedBranchId || null,
            username,
            normalizePasswordForStorage(payload.password),
            payload.is_active === false ? 0 : 1,
            displayName,
            defaultTimeIn,
            defaultTimeOut,
            JSON.stringify(normalizedWeeklySchedule),
            JSON.stringify(featureAccessPayload)
        );

        logAudit('user.create', 'user', username, {
            username,
            role: ROLE_STAFF,
            branch_id: resolvedBranchId || ''
        });

        return getUserById(username);
    }

    if (role !== ROLE_COMPANY_ADMIN) {
        throw new Error('Unsupported user role.');
    }

    const context = requireTenantContext();
    assertUserLimit();

    const username = normalizeText(payload.id || payload.username);
    const displayName = normalizeText(payload.name || payload.display_name || username);
    if (!username) {
        throw new Error('User ID is required.');
    }
    if (!displayName) {
        throw new Error('User name is required.');
    }
    if (getScopedUser(context.companyId, username)) {
        throw new Error('User ID already exists.');
    }

    const resolvedBranchId = resolveBranchId(payload.branch_id || payload.branchId || '', payload.branch_name || payload.branchName || '');
    const featureAccessPayload = sanitizeUserFeatureAccessPayload(
        payload.feature_access || payload.featureAccess || {},
        getDefaultUserFeatureAccessByContext(context)
    );
    const rawSchedulePayload = payload.weeklySchedule
        ?? payload.weekly_schedule
        ?? payload.schedule
        ?? payload.schedule_json
        ?? {};
    const normalizedWeeklySchedule = parseWeeklySchedulePayload(
        rawSchedulePayload,
        payload.timeIn || payload.time_in || DEFAULT_EMPLOYEE_TIME_IN,
        payload.timeOut || payload.time_out || DEFAULT_EMPLOYEE_TIME_OUT
    );
    const defaultTimeIn = pickDefaultScheduleTime(normalizedWeeklySchedule, 'time_in', payload.timeIn || payload.time_in);
    const defaultTimeOut = pickDefaultScheduleTime(normalizedWeeklySchedule, 'time_out', payload.timeOut || payload.time_out);
    getMasterDb().prepare(`
        INSERT INTO users (
            id, company_id, branch_id, username, password_hash, role, is_active,
            display_name, profile_picture, time_in, time_out, schedule_json, feature_access_json
        )
        VALUES (?, ?, ?, ?, ?, 'company_admin', ?, ?, '', ?, ?, ?, ?)
    `).run(
        createUserInternalId(context.companyId, username),
        context.companyId,
        resolvedBranchId || null,
        username,
        normalizePasswordForStorage(payload.password),
        payload.is_active === false ? 0 : 1,
        displayName,
        defaultTimeIn,
        defaultTimeOut,
        JSON.stringify(normalizedWeeklySchedule),
        JSON.stringify(featureAccessPayload)
    );

    logAudit('user.create', 'user', username, {
        username,
        role: ROLE_COMPANY_ADMIN,
        branch_id: resolvedBranchId || ''
    });

    return getUserById(username);
}

function updateEmployee(payload = {}) {
    const {
        id,
        name,
        password,
        branchId = '',
        branchName = ''
    } = payload;
    const context = requireTenantContext();
    const user = getScopedUser(context.companyId, id);
    if (!user || normalizeRole(user.role) !== ROLE_EMPLOYEE) {
        throw new Error('Employee not found.');
    }

    const resolvedBranchId = resolveBranchId(branchId || user.branch_id, branchName);
    const finalPassword = normalizeText(password)
        ? normalizePasswordForStorage(password)
        : user.password_hash;
    const hasTimeInOverride = Object.prototype.hasOwnProperty.call(payload, 'timeIn')
        || Object.prototype.hasOwnProperty.call(payload, 'time_in');
    const hasTimeOutOverride = Object.prototype.hasOwnProperty.call(payload, 'timeOut')
        || Object.prototype.hasOwnProperty.call(payload, 'time_out');
    const nextTimeIn = formatTimeValue(payload.timeIn ?? payload.time_in ?? user.time_in) || DEFAULT_EMPLOYEE_TIME_IN;
    const nextTimeOut = formatTimeValue(payload.timeOut ?? payload.time_out ?? user.time_out) || DEFAULT_EMPLOYEE_TIME_OUT;
    const rawSchedulePayload = payload.weeklySchedule
        ?? payload.weekly_schedule
        ?? payload.schedule
        ?? payload.schedule_json;
    const hasScheduleOverride = rawSchedulePayload !== undefined;
    let nextWeeklySchedule = hasScheduleOverride
        ? parseWeeklySchedulePayload(rawSchedulePayload, nextTimeIn, nextTimeOut)
        : getUserWeeklySchedule(user);
    if (!hasScheduleOverride) {
        if (hasTimeInOverride) {
            nextWeeklySchedule = applyTimeToWorkingDays(nextWeeklySchedule, 'time_in', nextTimeIn);
        }
        if (hasTimeOutOverride) {
            nextWeeklySchedule = applyTimeToWorkingDays(nextWeeklySchedule, 'time_out', nextTimeOut);
        }
    }
    const defaultTimeIn = pickDefaultScheduleTime(nextWeeklySchedule, 'time_in', nextTimeIn);
    const defaultTimeOut = pickDefaultScheduleTime(nextWeeklySchedule, 'time_out', nextTimeOut);

    getMasterDb().prepare(`
        UPDATE users
        SET display_name = ?,
            password_hash = ?,
            branch_id = ?,
            time_in = ?,
            time_out = ?,
            schedule_json = ?
        WHERE id = ?
    `).run(
        normalizeText(name) || user.display_name,
        finalPassword,
        resolvedBranchId || null,
        defaultTimeIn,
        defaultTimeOut,
        JSON.stringify(nextWeeklySchedule),
        user.id
    );

    logAudit('user.update', 'user', id, {
        branch_id: resolvedBranchId || ''
    });

    return getUserById(id);
}

function updateEmployeeSchedule(id, field, value) {
    const context = requireTenantContext();
    const user = getScopedUser(context.companyId, id);
    if (!user || normalizeRole(user.role) !== ROLE_EMPLOYEE) {
        throw new Error('Employee not found.');
    }
    const rawSchedulePayload = (field === 'weekly_schedule' || field === 'schedule_json')
        ? value
        : null;
    const allowedFields = new Set(['time_in', 'time_out', 'weekly_schedule', 'schedule_json']);
    if (!allowedFields.has(field)) {
        throw new Error('Invalid schedule field.');
    }
 
    if (field === 'weekly_schedule' || field === 'schedule_json') {
        const nextWeeklySchedule = parseWeeklySchedulePayload(rawSchedulePayload, user.time_in, user.time_out);
        const defaultTimeIn = pickDefaultScheduleTime(nextWeeklySchedule, 'time_in', user.time_in);
        const defaultTimeOut = pickDefaultScheduleTime(nextWeeklySchedule, 'time_out', user.time_out);
        getMasterDb().prepare(`
            UPDATE users
            SET schedule_json = ?,
                time_in = ?,
                time_out = ?
            WHERE id = ?
        `).run(JSON.stringify(nextWeeklySchedule), defaultTimeIn, defaultTimeOut, user.id);
        return getUserById(id);
    }
 
    const formattedValue = formatTimeValue(value);
    if (!formattedValue) {
        throw new Error('Invalid schedule time.');
    }
    const nextWeeklySchedule = applyTimeToWorkingDays(getUserWeeklySchedule(user), field, formattedValue);
    const defaultTimeIn = pickDefaultScheduleTime(nextWeeklySchedule, 'time_in', user.time_in);
    const defaultTimeOut = pickDefaultScheduleTime(nextWeeklySchedule, 'time_out', user.time_out);
    getMasterDb().prepare(`
        UPDATE users
        SET schedule_json = ?,
            time_in = ?,
            time_out = ?
        WHERE id = ?
    `).run(JSON.stringify(nextWeeklySchedule), defaultTimeIn, defaultTimeOut, user.id);

    return getUserById(id);
}

function deleteEmployee(id) {
    const context = requireTenantContext();
    const user = getScopedUser(context.companyId, id);
    if (!user || normalizeRole(user.role) !== ROLE_EMPLOYEE) {
        throw new Error('Employee not found.');
    }

    getMasterDb().prepare('DELETE FROM users WHERE id = ?').run(user.id);
    logAudit('user.delete', 'user', id, {});
    return { deleted: true, id };
}

function updateUser(id, payload = {}) {
    const context = requireTenantContext();
    const user = getScopedUser(context.companyId, id);
    if (!user) {
        throw new Error('User not found.');
    }

    const normalizedRole = normalizeRole(user.role);
    if (normalizedRole === ROLE_SUPER_ADMIN) {
        throw new Error('Super admin user cannot be modified here.');
    }

    const nextIsActive = payload.is_active === undefined ? Boolean(Number(user.is_active || 0)) : Boolean(payload.is_active);
    const wasActive = Boolean(Number(user.is_active || 0));
    if (!wasActive && nextIsActive) {
        assertUserLimit();
    }

    const requestedRole = payload.role === undefined ? user.role : payload.role;
    const nextRole = normalizeRole(requestedRole);
    if (nextRole === ROLE_SUPER_ADMIN) {
        throw new Error('Super admin user cannot be modified here.');
    }

    const resolvedBranchId = resolveBranchId(payload.branch_id || payload.branchId || user.branch_id || '', payload.branch_name || payload.branchName || '');
    const nextName = normalizeText(payload.name || payload.display_name || user.display_name || user.username);
    const finalPassword = normalizeText(payload.password)
        ? normalizePasswordForStorage(payload.password)
        : user.password_hash;
    const currentFeatureAccess = parseUserFeatureAccess(user.feature_access_json);
    const nextFeatureAccess = sanitizeUserFeatureAccessPayload(
        payload.feature_access || payload.featureAccess || {},
        currentFeatureAccess
    );
    const hasTimeInOverride = Object.prototype.hasOwnProperty.call(payload, 'timeIn')
        || Object.prototype.hasOwnProperty.call(payload, 'time_in');
    const hasTimeOutOverride = Object.prototype.hasOwnProperty.call(payload, 'timeOut')
        || Object.prototype.hasOwnProperty.call(payload, 'time_out');
    const nextTimeIn = formatTimeValue(payload.timeIn ?? payload.time_in ?? user.time_in) || DEFAULT_EMPLOYEE_TIME_IN;
    const nextTimeOut = formatTimeValue(payload.timeOut ?? payload.time_out ?? user.time_out) || DEFAULT_EMPLOYEE_TIME_OUT;
    const rawSchedulePayload = payload.weeklySchedule
        ?? payload.weekly_schedule
        ?? payload.schedule
        ?? payload.schedule_json;
    const hasScheduleOverride = rawSchedulePayload !== undefined;
    let nextWeeklySchedule = hasScheduleOverride
        ? parseWeeklySchedulePayload(rawSchedulePayload, nextTimeIn, nextTimeOut)
        : getUserWeeklySchedule(user);
    if (!hasScheduleOverride) {
        if (hasTimeInOverride) {
            nextWeeklySchedule = applyTimeToWorkingDays(nextWeeklySchedule, 'time_in', nextTimeIn);
        }
        if (hasTimeOutOverride) {
            nextWeeklySchedule = applyTimeToWorkingDays(nextWeeklySchedule, 'time_out', nextTimeOut);
        }
    }
    const defaultTimeIn = pickDefaultScheduleTime(nextWeeklySchedule, 'time_in', nextTimeIn);
    const defaultTimeOut = pickDefaultScheduleTime(nextWeeklySchedule, 'time_out', nextTimeOut);

    getMasterDb().prepare(`
        UPDATE users
        SET display_name = ?,
            role = ?,
            password_hash = ?,
            branch_id = ?,
            is_active = ?,
            time_in = ?,
            time_out = ?,
            schedule_json = ?,
            feature_access_json = ?
        WHERE id = ?
    `).run(
        nextName,
        nextRole,
        finalPassword,
        resolvedBranchId || null,
        nextIsActive ? 1 : 0,
        defaultTimeIn,
        defaultTimeOut,
        JSON.stringify(nextWeeklySchedule),
        JSON.stringify(nextFeatureAccess),
        user.id
    );

    logAudit('user.update', 'user', id, {
        role: nextRole,
        is_active: nextIsActive
    });

    return getUserById(id);
}

function deleteUser(id) {
    const context = requireTenantContext();
    const user = getScopedUser(context.companyId, id);
    if (!user) {
        throw new Error('User not found.');
    }

    const normalizedRole = normalizeRole(user.role);
    if (normalizedRole === ROLE_SUPER_ADMIN) {
        throw new Error('Super admin user cannot be deleted here.');
    }

    getMasterDb().prepare('DELETE FROM users WHERE id = ?').run(user.id);
    logAudit('user.delete', 'user', id, {});
    return { deleted: true, id };
}

function saveUserProfile({ id, name, password, profilePicture }) {
    const context = getCurrentContext();
    const companyId = context?.companyId || '';
    const user = getScopedUser(companyId, id);
    if (!user) {
        throw new Error('User not found.');
    }

    const finalPassword = normalizeText(password)
        ? normalizePasswordForStorage(password)
        : user.password_hash;

    getMasterDb().prepare(`
        UPDATE users
        SET display_name = ?,
            password_hash = ?,
            profile_picture = ?
        WHERE id = ?
    `).run(
        normalizeText(name) || user.display_name,
        finalPassword,
        String(profilePicture || user.profile_picture || ''),
        user.id
    );

    return getUserById(id);
}

function addBranch({ branchName, address = '' }) {
    assertBranchLimit();
    const name = normalizeText(branchName);
    if (!name) {
        throw new Error('Branch name is required.');
    }

    const db = getTenantDb();
    const existing = db.prepare(`
        SELECT id
        FROM branches
        WHERE LOWER(branch_name) = LOWER(?)
        LIMIT 1
    `).get(name);
    if (existing) {
        throw new Error('Branch already exists.');
    }

    const id = generateId('branch');
    db.prepare(`
        INSERT INTO branches (id, branch_name, address, is_active)
        VALUES (?, ?, ?, 1)
    `).run(id, name, normalizeText(address));

    logAudit('branch.create', 'branch', id, {
        branch_name: name
    });

    return getBranchById(id);
}

function updateBranch(branchId, payload = {}) {
    const branch = getBranchById(branchId);
    if (!branch) {
        throw new Error('Branch not found.');
    }

    const nextName = normalizeText(payload.branch_name || payload.branchName || branch.branch_name);
    const nextAddress = normalizeText(payload.address ?? branch.address);
    const nextIsActive = payload.is_active === undefined
        ? Boolean(Number(branch.is_active || 0))
        : Boolean(payload.is_active);
    const wasActive = Boolean(Number(branch.is_active || 0));

    if (!nextName) {
        throw new Error('Branch name is required.');
    }
    if (!wasActive && nextIsActive) {
        assertBranchLimit();
    }

    getTenantDb().prepare(`
        UPDATE branches
        SET branch_name = ?,
            address = ?,
            is_active = ?
        WHERE id = ?
    `).run(nextName, nextAddress, nextIsActive ? 1 : 0, branch.id);

    logAudit('branch.update', 'branch', branch.id, {
        branch_name: nextName,
        is_active: nextIsActive
    });

    return getBranchById(branch.id);
}

function deleteBranch(branchId) {
    const context = requireTenantContext();
    const branch = getBranchById(branchId, context.companyId);
    if (!branch) {
        throw new Error('Branch not found.');
    }

    const db = getTenantDb();
    const branchCount = countRows(db, 'SELECT COUNT(*) AS total FROM branches');
    if (branchCount <= 1) {
        throw new Error('At least one branch must remain.');
    }

    const assignedUsers = countRows(getMasterDb(), `
        SELECT COUNT(*) AS total
        FROM users
        WHERE company_id = ?
          AND branch_id = ?
    `, context.companyId, branch.id);
    if (assignedUsers > 0) {
        throw new Error('Branch is assigned to users. Reassign users before deleting.');
    }

    db.prepare('DELETE FROM branches WHERE id = ?').run(branch.id);

    logAudit('branch.delete', 'branch', branch.id, {
        branch_name: branch.branch_name
    });

    return {
        deleted: true,
        id: branch.id
    };
}

function getCompanySettings() {
    const context = requireTenantContext();
    const template = getInvoiceTemplate();

    return {
        id: context.company.id,
        name: context.company.name,
        company_code: context.company.company_code,
        subdomain: context.company.subdomain || '',
        custom_domain: context.company.custom_domain || '',
        logo_path: context.company.logo_path || '',
        primary_color: context.company.primary_color || PARENT_BRAND.primaryColor,
        app_name: context.company.app_name || '',
        address: template.address || '',
        contact: template.contact || ''
    };
}

function getCompanyWorkspaceConfig() {
    requireTenantContext();
    return parseWorkspaceConfig(getTenantMeta(WORKSPACE_CONFIG_META_KEY));
}

function updateCompanyWorkspaceConfig(payload = {}) {
    requireTenantContext();
    const normalizedConfig = parseWorkspaceConfig(payload);
    setTenantMeta(WORKSPACE_CONFIG_META_KEY, JSON.stringify(normalizedConfig));
    logAudit('workspace_config.update', 'workspace_config', WORKSPACE_CONFIG_META_KEY, {
        hasCustomPaymentMethods: Boolean(normalizedConfig.orderForm?.paymentMethods?.length)
    });
    return normalizedConfig;
}

function updateCompanySettings(payload = {}) {
    const context = requireTenantContext();
    const customDomainInput = payload.custom_domain === undefined
        ? context.company.custom_domain
        : payload.custom_domain;
    const name = normalizeText(payload.name || context.company.name);
    const companyCode = normalizeIdentifier(payload.company_code || context.company.company_code || context.company.subdomain || DEFAULT_COMPANY_CODE);
    const subdomain = normalizeIdentifier(payload.subdomain || companyCode);
    const customDomain = normalizeOptionalDomain(customDomainInput);
    const primaryColor = normalizeText(payload.primary_color || context.company.primary_color || PARENT_BRAND.primaryColor);
    const logoPath = String(payload.logo_path || context.company.logo_path || '');
    const appName = normalizeText(payload.app_name || context.company.app_name);

    assertUniqueCompanyFields({
        companyId: context.company.id,
        companyCode,
        subdomain,
        customDomain
    });

    runCompanyWrite(() => {
        getMasterDb().prepare(`
            UPDATE companies
            SET name = ?,
                company_code = ?,
                subdomain = ?,
                custom_domain = ?,
                logo_path = ?,
                primary_color = ?,
                app_name = ?
            WHERE id = ?
        `).run(name, companyCode, subdomain, customDomain, logoPath, primaryColor, appName, context.company.id);
    });

    const currentTemplate = getInvoiceTemplate();
    getTenantDb().prepare(`
        UPDATE invoice_templates
        SET business_name = ?,
            address = ?,
            contact = ?,
            logo_path = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'default'
    `).run(
        normalizeText(payload.business_name || currentTemplate.business_name || name),
        normalizeText(payload.address ?? currentTemplate.address),
        normalizeText(payload.contact ?? currentTemplate.contact),
        logoPath || currentTemplate.logo_path || ''
    );

    logAudit('company.update', 'company', context.company.id, {
        company_code: companyCode
    });

    return getCompanySettings();
}

function getInvoiceTemplate() {
    const row = getTenantDb().prepare(`
        SELECT *
        FROM invoice_templates
        WHERE id = 'default'
        LIMIT 1
    `).get();

    if (!row) {
        ensureDefaultTenantTemplate(requireTenantContext().companyId, requireTenantContext().company);
        return getInvoiceTemplate();
    }

    return {
        id: row.id,
        template_name: row.template_name,
        business_name: row.business_name || '',
        address: row.address || '',
        contact: row.contact || '',
        logo_path: row.logo_path || '',
        footer_notes: row.footer_notes || '',
        terms: row.terms || '',
        signature_name: row.signature_name || '',
        signature_position: row.signature_position || '',
        signature_path: row.signature_path || '',
        receipt_title: row.receipt_title || DEFAULT_RECEIPT_TITLE,
        receipt_subtitle: row.receipt_subtitle || DEFAULT_RECEIPT_SUBTITLE,
        receipt_meta_layout: normalizeTemplateLayoutText(row.receipt_meta_layout, DEFAULT_RECEIPT_META_LAYOUT),
        receipt_totals_layout: normalizeTemplateLayoutText(row.receipt_totals_layout, DEFAULT_RECEIPT_TOTALS_LAYOUT),
        template_style: row.template_style || DEFAULT_TEMPLATE_STYLE,
        updated_at: row.updated_at || ''
    };
}

function updateInvoiceTemplate(payload = {}) {
    const currentTemplate = getInvoiceTemplate();
    const nextTemplate = {
        template_name: normalizeText(payload.template_name || currentTemplate.template_name || 'Default Template'),
        business_name: normalizeText(payload.business_name || currentTemplate.business_name),
        address: normalizeText(payload.address ?? currentTemplate.address),
        contact: normalizeText(payload.contact ?? currentTemplate.contact),
        logo_path: String(payload.logo_path || currentTemplate.logo_path || ''),
        footer_notes: normalizeMultilineText(payload.footer_notes ?? currentTemplate.footer_notes, { maxLength: 4000 }),
        terms: normalizeMultilineText(payload.terms ?? currentTemplate.terms, { maxLength: 4000 }),
        signature_name: normalizeText(payload.signature_name ?? currentTemplate.signature_name),
        signature_position: normalizeText(payload.signature_position ?? currentTemplate.signature_position),
        signature_path: String((payload.signature_path ?? currentTemplate.signature_path) || ''),
        receipt_title: normalizeText((payload.receipt_title ?? currentTemplate.receipt_title) || DEFAULT_RECEIPT_TITLE),
        receipt_subtitle: normalizeText((payload.receipt_subtitle ?? currentTemplate.receipt_subtitle) || DEFAULT_RECEIPT_SUBTITLE),
        receipt_meta_layout: normalizeTemplateLayoutText(payload.receipt_meta_layout ?? currentTemplate.receipt_meta_layout, DEFAULT_RECEIPT_META_LAYOUT),
        receipt_totals_layout: normalizeTemplateLayoutText(payload.receipt_totals_layout ?? currentTemplate.receipt_totals_layout, DEFAULT_RECEIPT_TOTALS_LAYOUT),
        template_style: normalizeIdentifier(payload.template_style || currentTemplate.template_style || DEFAULT_TEMPLATE_STYLE) || DEFAULT_TEMPLATE_STYLE
    };

    getTenantDb().prepare(`
        UPDATE invoice_templates
        SET template_name = ?,
            business_name = ?,
            address = ?,
            contact = ?,
            logo_path = ?,
            footer_notes = ?,
            terms = ?,
            signature_name = ?,
            signature_position = ?,
            signature_path = ?,
            receipt_title = ?,
            receipt_subtitle = ?,
            receipt_meta_layout = ?,
            receipt_totals_layout = ?,
            template_style = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'default'
    `).run(
        nextTemplate.template_name,
        nextTemplate.business_name,
        nextTemplate.address,
        nextTemplate.contact,
        nextTemplate.logo_path,
        nextTemplate.footer_notes,
        nextTemplate.terms,
        nextTemplate.signature_name,
        nextTemplate.signature_position,
        nextTemplate.signature_path,
        nextTemplate.receipt_title,
        nextTemplate.receipt_subtitle,
        nextTemplate.receipt_meta_layout,
        nextTemplate.receipt_totals_layout,
        nextTemplate.template_style
    );

    logAudit('invoice_template.update', 'invoice_template', 'default', {
        template_style: nextTemplate.template_style
    });

    return getInvoiceTemplate();
}

function normalizeContactNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) {
        return '';
    }

    if (/^639\d{9}$/.test(digits)) {
        return digits;
    }

    if (/^09\d{9}$/.test(digits)) {
        return `63${digits.slice(1)}`;
    }

    if (/^9\d{9}$/.test(digits)) {
        return `63${digits}`;
    }

    if (/^00639\d{9}$/.test(digits)) {
        return digits.slice(2);
    }

    return digits;
}

function formatContactNumber(value) {
    const normalized = normalizeContactNumber(value);
    if (/^639\d{9}$/.test(normalized)) {
        return `0${normalized.slice(2)}`;
    }

    return normalizeText(value) || normalized;
}

function getClientById(id) {
    return getTenantDb().prepare(`
        SELECT id, name, contact_number, normalized_contact_number, address, source, created_at
        FROM clients
        WHERE id = ?
        LIMIT 1
    `).get(Number(id));
}

function getClientByContactNumber(contactNumber) {
    const normalizedContactNumber = normalizeContactNumber(contactNumber);
    if (!normalizedContactNumber) {
        return null;
    }

    return getTenantDb().prepare(`
        SELECT id, name, contact_number, normalized_contact_number, address, source, created_at
        FROM clients
        WHERE normalized_contact_number = ?
        LIMIT 1
    `).get(normalizedContactNumber);
}

function listClients(filter = '') {
    const db = getTenantDb();
    const normalizedFilter = normalizeText(filter);

    if (!normalizedFilter) {
        return db.prepare(`
            SELECT id, name, contact_number, normalized_contact_number, address, source, created_at
            FROM clients
            ORDER BY name COLLATE NOCASE, contact_number
        `).all();
    }

    const contactPattern = `%${normalizeContactNumber(normalizedFilter) || normalizedFilter}%`;
    return db.prepare(`
        SELECT id, name, contact_number, normalized_contact_number, address, source, created_at
        FROM clients
        WHERE LOWER(name) LIKE LOWER(?)
           OR contact_number LIKE ?
           OR normalized_contact_number LIKE ?
           OR LOWER(address) LIKE LOWER(?)
        ORDER BY name COLLATE NOCASE, contact_number
    `).all(`%${normalizedFilter}%`, `%${normalizedFilter}%`, contactPattern, `%${normalizedFilter}%`);
}

function addClient({ name, contactNumber, address = '', source = 'manual' }) {
    const normalizedName = normalizeText(name);
    const normalizedContactNumber = normalizeContactNumber(contactNumber);
    const formattedContactNumber = formatContactNumber(contactNumber);
    const normalizedAddress = normalizeText(address);

    if (!normalizedName) {
        throw new Error('Client name is required.');
    }

    if (!normalizedContactNumber) {
        throw new Error('Contact number is required.');
    }

    const existingClient = getClientByContactNumber(normalizedContactNumber);
    if (existingClient) {
        return {
            ...updateClient(existingClient.id, {
                name: normalizedName,
                contactNumber: formattedContactNumber,
                address: normalizedAddress,
                source
            }),
            action: 'updated'
        };
    }

    const result = getTenantDb().prepare(`
        INSERT INTO clients (name, contact_number, normalized_contact_number, address, source)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        normalizedName,
        formattedContactNumber,
        normalizedContactNumber,
        normalizedAddress,
        normalizeText(source) || 'manual'
    );

    return {
        ...getClientById(result.lastInsertRowid),
        action: 'created'
    };
}

function updateClient(id, { name, contactNumber, address = '', source = 'manual' }) {
    const client = getClientById(id);
    if (!client) {
        throw new Error('Client not found.');
    }

    const normalizedName = normalizeText(name);
    const normalizedContactNumber = normalizeContactNumber(contactNumber);
    const formattedContactNumber = formatContactNumber(contactNumber);
    const normalizedAddress = normalizeText(address);

    if (!normalizedName) {
        throw new Error('Client name is required.');
    }

    if (!normalizedContactNumber) {
        throw new Error('Contact number is required.');
    }

    const duplicate = getClientByContactNumber(normalizedContactNumber);
    if (duplicate && Number(duplicate.id) !== Number(id)) {
        throw new Error('Another client already uses that contact number.');
    }

    getTenantDb().prepare(`
        UPDATE clients
        SET name = ?,
            contact_number = ?,
            normalized_contact_number = ?,
            address = ?,
            source = ?
        WHERE id = ?
    `).run(
        normalizedName,
        formattedContactNumber,
        normalizedContactNumber,
        normalizedAddress,
        normalizeText(source) || 'manual',
        Number(id)
    );

    return getClientById(id);
}

function deleteClient(id) {
    const client = getClientById(id);
    if (!client) {
        throw new Error('Client not found.');
    }

    const clientId = Number(id);
    const db = getTenantDb();

    db.prepare(`
        UPDATE customer_requests
        SET client_id = NULL
        WHERE client_id = ?
    `).run(clientId);

    db.prepare(`
        DELETE FROM clients
        WHERE id = ?
    `).run(clientId);

    return client;
}

function saveClientProfile({ name, contactNumber, address = '', source = 'manual' }) {
    const existing = getClientByContactNumber(contactNumber);
    return existing
        ? updateClient(existing.id, { name, contactNumber, address, source })
        : addClient({ name, contactNumber, address, source });
}

function normalizeCustomerRequestStatus(status, fallback = 'open') {
    const normalized = normalizeText(status)
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
    if (!normalized) {
        return fallback;
    }

    return CUSTOMER_REQUEST_STATUSES.has(normalized)
        ? normalized
        : fallback;
}

function normalizeCustomerRequestActor(actor, fallback = 'customer') {
    const normalized = normalizeText(actor).toLowerCase();
    if (normalized === 'admin') {
        return 'admin';
    }
    if (normalized === 'customer') {
        return 'customer';
    }
    return fallback;
}

function buildCustomerRequestCode() {
    const now = new Date();
    const dateStamp = [
        String(now.getUTCFullYear()).slice(-2),
        String(now.getUTCMonth() + 1).padStart(2, '0'),
        String(now.getUTCDate()).padStart(2, '0')
    ].join('');
    const randomPart = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `REQ-${dateStamp}-${randomPart}`;
}

function serializeCustomerRequest(row) {
    if (!row) {
        return null;
    }

    return {
        id: Number(row.id),
        requestCode: String(row.request_code || ''),
        clientId: row.client_id === null || row.client_id === undefined
            ? null
            : Number(row.client_id),
        clientName: String(row.client_name || ''),
        contactNumber: String(row.contact_number || ''),
        normalizedContactNumber: String(row.normalized_contact_number || ''),
        requestDetails: String(row.request_details || ''),
        status: normalizeCustomerRequestStatus(row.status, 'open'),
        allowCustomerEdit: Boolean(Number(row.allow_customer_edit || 0)),
        source: String(row.source || ''),
        createdAt: String(row.created_at || ''),
        updatedAt: String(row.updated_at || ''),
        messageCount: Number(row.message_count || 0),
        lastMessageAt: String(row.last_message_at || row.updated_at || row.created_at || '')
    };
}

function serializeCustomerRequestMessage(row) {
    if (!row) {
        return null;
    }

    return {
        id: Number(row.id),
        requestId: Number(row.request_id),
        senderType: normalizeCustomerRequestActor(row.sender_type, 'customer'),
        senderName: String(row.sender_name || ''),
        message: String(row.message_text || ''),
        source: String(row.source || ''),
        createdAt: String(row.created_at || '')
    };
}

function getCustomerRequestByCode(requestCode) {
    const normalizedCode = normalizeText(requestCode).toUpperCase();
    if (!normalizedCode) {
        return null;
    }

    const row = getTenantDb().prepare(`
        SELECT
            requests.*,
            COALESCE((
                SELECT COUNT(*)
                FROM customer_request_messages messages
                WHERE messages.request_id = requests.id
            ), 0) AS message_count,
            COALESCE((
                SELECT messages.created_at
                FROM customer_request_messages messages
                WHERE messages.request_id = requests.id
                ORDER BY messages.id DESC
                LIMIT 1
            ), requests.updated_at, requests.created_at) AS last_message_at
        FROM customer_requests requests
        WHERE UPPER(requests.request_code) = ?
        LIMIT 1
    `).get(normalizedCode);

    return serializeCustomerRequest(row);
}

function listCustomerRequests({ filter = '', status = '', limit = 200 } = {}) {
    const db = getTenantDb();
    const normalizedFilter = normalizeText(filter);
    const normalizedStatus = normalizeCustomerRequestStatus(status, '');
    const safeLimit = Math.max(1, Math.min(500, Number(limit || 200)));
    const where = [];
    const params = [];

    if (normalizedStatus) {
        where.push('LOWER(requests.status) = ?');
        params.push(normalizedStatus);
    }

    if (normalizedFilter) {
        const contactPattern = `%${normalizeContactNumber(normalizedFilter) || normalizedFilter}%`;
        where.push(`(
            LOWER(requests.request_code) LIKE LOWER(?)
            OR LOWER(requests.client_name) LIKE LOWER(?)
            OR requests.contact_number LIKE ?
            OR requests.normalized_contact_number LIKE ?
            OR LOWER(requests.request_details) LIKE LOWER(?)
        )`);
        params.push(
            `%${normalizedFilter}%`,
            `%${normalizedFilter}%`,
            `%${normalizedFilter}%`,
            contactPattern,
            `%${normalizedFilter}%`
        );
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.prepare(`
        SELECT
            requests.*,
            COALESCE((
                SELECT COUNT(*)
                FROM customer_request_messages messages
                WHERE messages.request_id = requests.id
            ), 0) AS message_count,
            COALESCE((
                SELECT messages.created_at
                FROM customer_request_messages messages
                WHERE messages.request_id = requests.id
                ORDER BY messages.id DESC
                LIMIT 1
            ), requests.updated_at, requests.created_at) AS last_message_at
        FROM customer_requests requests
        ${whereClause}
        ORDER BY datetime(requests.updated_at) DESC, requests.id DESC
        LIMIT ?
    `).all(...params, safeLimit);

    return rows.map(serializeCustomerRequest);
}

function getCustomerRequestMessages(requestId, { limit = 200 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit || 200)));
    const rows = getTenantDb().prepare(`
        SELECT id, request_id, sender_type, sender_name, message_text, source, created_at
        FROM customer_request_messages
        WHERE request_id = ?
        ORDER BY id DESC
        LIMIT ?
    `).all(Number(requestId), safeLimit);

    return rows.reverse().map(serializeCustomerRequestMessage);
}

function assertCustomerRequestContact(request, contactNumber) {
    const normalizedInput = normalizeContactNumber(contactNumber);
    if (!normalizedInput) {
        throw new Error('Contact number is required.');
    }

    if (normalizedInput !== String(request?.normalizedContactNumber || '')) {
        throw new Error('Contact number does not match this request.');
    }
}

function getCustomerRequestThreadByCode(requestCode, { contactNumber = '', limit = 200 } = {}) {
    const request = getCustomerRequestByCode(requestCode);
    if (!request) {
        throw new Error('Customer request not found.');
    }

    if (contactNumber) {
        assertCustomerRequestContact(request, contactNumber);
    }

    return {
        request,
        messages: getCustomerRequestMessages(request.id, { limit })
    };
}

function createCustomerRequest({
    clientName = '',
    contactNumber = '',
    requestDetails = '',
    initialMessage = '',
    source = 'customer_portal'
} = {}) {
    const normalizedName = normalizeText(clientName);
    const normalizedContactNumber = normalizeContactNumber(contactNumber);
    const formattedContactNumber = formatContactNumber(contactNumber);
    const normalizedRequestDetails = normalizeMultilineText(requestDetails, { maxLength: 10000 });
    const normalizedInitialMessage = normalizeMultilineText(initialMessage, { maxLength: 3000 });
    const normalizedSource = normalizeText(source) || 'customer_portal';

    if (!normalizedName) {
        throw new Error('Client name is required.');
    }

    if (!normalizedContactNumber) {
        throw new Error('Contact number is required.');
    }

    if (!normalizedRequestDetails && !normalizedInitialMessage) {
        throw new Error('Request details or initial message is required.');
    }

    const client = saveClientProfile({
        name: normalizedName,
        contactNumber: formattedContactNumber,
        source: normalizedSource
    });
    const db = getTenantDb();
    let requestCode = '';

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = buildCustomerRequestCode();
        if (!getCustomerRequestByCode(candidate)) {
            requestCode = candidate;
            break;
        }
    }

    if (!requestCode) {
        throw new Error('Unable to generate request code. Please try again.');
    }

    const insertRequestResult = db.prepare(`
        INSERT INTO customer_requests (
            request_code, client_id, client_name, contact_number, normalized_contact_number,
            request_details, status, allow_customer_edit, source
        )
        VALUES (?, ?, ?, ?, ?, ?, 'open', 1, ?)
    `).run(
        requestCode,
        client?.id ?? null,
        normalizedName,
        formattedContactNumber,
        normalizedContactNumber,
        normalizedRequestDetails,
        normalizedSource
    );

    if (normalizedInitialMessage) {
        db.prepare(`
            INSERT INTO customer_request_messages (
                request_id, sender_type, sender_name, message_text, source
            )
            VALUES (?, 'customer', ?, ?, ?)
        `).run(
            Number(insertRequestResult.lastInsertRowid),
            normalizedName || 'Customer',
            normalizedInitialMessage,
            normalizedSource
        );

        db.prepare(`
            UPDATE customer_requests
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(Number(insertRequestResult.lastInsertRowid));
    }

    return getCustomerRequestThreadByCode(requestCode);
}

function updateCustomerRequestByCode(requestCode, payload = {}, { actor = 'admin', contactNumber = '' } = {}) {
    const request = getCustomerRequestByCode(requestCode);
    if (!request) {
        throw new Error('Customer request not found.');
    }

    const normalizedActor = normalizeCustomerRequestActor(actor, 'admin');
    if (normalizedActor === 'customer') {
        assertCustomerRequestContact(request, contactNumber);
        if (!request.allowCustomerEdit) {
            throw new Error('This request is locked for customer edits.');
        }
    }

    const hasClientName = Object.prototype.hasOwnProperty.call(payload, 'clientName')
        || Object.prototype.hasOwnProperty.call(payload, 'name');
    const hasContactNumber = Object.prototype.hasOwnProperty.call(payload, 'contactNumber')
        || Object.prototype.hasOwnProperty.call(payload, 'contact_number');
    const hasRequestDetails = Object.prototype.hasOwnProperty.call(payload, 'requestDetails')
        || Object.prototype.hasOwnProperty.call(payload, 'requestedChanges')
        || Object.prototype.hasOwnProperty.call(payload, 'details');
    const hasStatus = Object.prototype.hasOwnProperty.call(payload, 'status');
    const hasAllowCustomerEdit = Object.prototype.hasOwnProperty.call(payload, 'allowCustomerEdit')
        || Object.prototype.hasOwnProperty.call(payload, 'allow_customer_edit');

    const nextClientName = hasClientName
        ? normalizeText(payload.clientName ?? payload.name)
        : request.clientName;
    const nextContactNumberRaw = hasContactNumber
        ? (payload.contactNumber ?? payload.contact_number)
        : request.contactNumber;
    const nextContactNumber = formatContactNumber(nextContactNumberRaw);
    const nextNormalizedContactNumber = normalizeContactNumber(nextContactNumberRaw);
    const nextRequestDetails = hasRequestDetails
        ? normalizeMultilineText(payload.requestDetails ?? payload.requestedChanges ?? payload.details, { maxLength: 10000 })
        : request.requestDetails;

    if (!nextClientName) {
        throw new Error('Client name is required.');
    }

    if (!nextNormalizedContactNumber) {
        throw new Error('Contact number is required.');
    }

    let nextStatus = request.status;
    if (normalizedActor === 'admin' && hasStatus) {
        nextStatus = normalizeCustomerRequestStatus(payload.status, '');
        if (!nextStatus) {
            throw new Error('Invalid request status.');
        }
    } else if (
        normalizedActor === 'customer'
        && (hasClientName || hasContactNumber || hasRequestDetails)
        && request.status !== 'open'
        && request.status !== 'closed'
    ) {
        nextStatus = 'open';
    }

    let nextAllowCustomerEdit = request.allowCustomerEdit;
    if (normalizedActor === 'admin' && hasAllowCustomerEdit) {
        nextAllowCustomerEdit = Boolean(payload.allowCustomerEdit ?? payload.allow_customer_edit);
    }

    const syncedClient = saveClientProfile({
        name: nextClientName,
        contactNumber: nextContactNumber,
        source: normalizedActor === 'admin' ? 'manual' : 'customer_portal'
    });

    getTenantDb().prepare(`
        UPDATE customer_requests
        SET
            client_id = ?,
            client_name = ?,
            contact_number = ?,
            normalized_contact_number = ?,
            request_details = ?,
            status = ?,
            allow_customer_edit = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        syncedClient?.id ?? request.clientId ?? null,
        nextClientName,
        nextContactNumber,
        nextNormalizedContactNumber,
        nextRequestDetails,
        nextStatus,
        nextAllowCustomerEdit ? 1 : 0,
        request.id
    );

    return getCustomerRequestThreadByCode(request.requestCode);
}

function addCustomerRequestMessageByCode(requestCode, payload = {}, { actor = 'customer', contactNumber = '' } = {}) {
    const request = getCustomerRequestByCode(requestCode);
    if (!request) {
        throw new Error('Customer request not found.');
    }

    const normalizedActor = normalizeCustomerRequestActor(actor, 'customer');
    if (normalizedActor === 'customer') {
        assertCustomerRequestContact(request, contactNumber);
    }

    const message = normalizeMultilineText(payload.message ?? payload.text ?? '', { maxLength: 3000 });
    if (!message) {
        throw new Error('Message is required.');
    }

    const senderType = normalizedActor === 'admin' ? 'admin' : 'customer';
    const senderName = normalizeText(payload.senderName)
        || (senderType === 'admin' ? 'Admin' : request.clientName || 'Customer');
    const source = normalizeText(payload.source)
        || (senderType === 'admin' ? 'admin_panel' : 'customer_portal');

    getTenantDb().prepare(`
        INSERT INTO customer_request_messages (
            request_id, sender_type, sender_name, message_text, source
        )
        VALUES (?, ?, ?, ?, ?)
    `).run(
        request.id,
        senderType,
        senderName,
        message,
        source
    );

    let nextStatus = request.status;
    if (senderType === 'admin' && request.status === 'open') {
        nextStatus = 'in_progress';
    } else if (senderType === 'customer' && (request.status === 'resolved' || request.status === 'closed')) {
        nextStatus = 'open';
    }

    getTenantDb().prepare(`
        UPDATE customer_requests
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(nextStatus, request.id);

    return getCustomerRequestThreadByCode(request.requestCode);
}

function getUsersMap() {
    return new Map(listUsers('').map((user) => [String(user.id), user]));
}

function normalizeAttendanceRow(row, userMap) {
    const user = userMap.get(String(row.id)) || null;
    const name = row.name || user?.name || row.id || 'Unknown';
    const scheduleForDate = getUserScheduleForDate(user, row.date);
    const scheduledTimeIn = scheduleForDate.is_day_off ? '' : scheduleForDate.time_in;
    const scheduledTimeOut = scheduleForDate.is_day_off ? '' : scheduleForDate.time_out;
    const timeIn = formatTimeValue(row.time_in || '');
    const timeOut = formatTimeValue(row.time_out || '');
    const lateMinutes = calculateLateMinutes(timeIn, scheduledTimeIn);
    const hasClockActivity = Boolean(timeIn || timeOut);
    const status = scheduleForDate.is_day_off && !hasClockActivity
        ? 'Day Off'
        : normalizeStatus(row.remarks, lateMinutes, Boolean(timeIn));
    const workedHours = row.worked_hours || calculateWorkedHours(timeIn, timeOut) || '0.00';
    const dateKey = getDateKey(row.date);
    const parsedDate = parseDateValue(row.date);

    return {
        rowId: row.row_id,
        id: row.id,
        name,
        date: row.date,
        dateKey,
        displayDate: formatDisplayDate(row.date),
        timeIn,
        timeOut,
        workedHours,
        status,
        lateMinutes,
        remarksRaw: row.remarks || '',
        scheduledTimeIn,
        scheduledTimeOut,
        isDayOff: scheduleForDate.is_day_off,
        avatarUrl: user?.profile_picture || buildAvatarUrl(name),
        dayLabel: parsedDate ? parsedDate.toLocaleDateString('en-US', { weekday: 'long' }) : '-',
        sortDate: parsedDate ? parsedDate.getTime() : 0,
        branch_id: row.branch_id || user?.branch_id || ''
    };
}

function compareAttendance(a, b) {
    if (a.dateKey !== b.dateKey) {
        return a.dateKey < b.dateKey ? 1 : -1;
    }

    if (a.timeIn !== b.timeIn) {
        return a.timeIn < b.timeIn ? 1 : -1;
    }

    return String(a.id).localeCompare(String(b.id));
}

function listAttendanceEntries() {
    const rows = getTenantDb().prepare('SELECT rowid AS row_id, * FROM attendance').all();
    const userMap = getUsersMap();
    return rows.map((row) => normalizeAttendanceRow(row, userMap)).sort(compareAttendance);
}

function getAttendanceByUser(userId) {
    return listAttendanceEntries().filter((entry) => String(entry.id) === String(userId));
}

function getAttendanceForMonth(userId, year, month) {
    const monthKey = `${year}-${pad(month)}`;
    return getAttendanceByUser(userId).filter((entry) => entry.dateKey.startsWith(monthKey));
}

function buildAbsentEntry(user, dateKey) {
    const parsedDate = parseDateValue(dateKey);
    const scheduleForDate = getUserScheduleForDate(user, dateKey);
    const status = scheduleForDate.is_day_off ? 'Day Off' : 'Absent';

    return {
        rowId: null,
        id: user.id,
        name: user.name,
        date: dateKey,
        dateKey,
        displayDate: formatDisplayDate(dateKey),
        timeIn: '',
        timeOut: '',
        workedHours: '0.00',
        status,
        lateMinutes: 0,
        remarksRaw: status,
        scheduledTimeIn: scheduleForDate.is_day_off ? '' : formatTimeValue(scheduleForDate.time_in || ''),
        scheduledTimeOut: scheduleForDate.is_day_off ? '' : formatTimeValue(scheduleForDate.time_out || ''),
        isDayOff: scheduleForDate.is_day_off,
        avatarUrl: user.profile_picture || buildAvatarUrl(user.name),
        dayLabel: parsedDate ? parsedDate.toLocaleDateString('en-US', { weekday: 'long' }) : '-',
        sortDate: parsedDate ? parsedDate.getTime() : 0,
        branch_id: user.branch_id || ''
    };
}

function getMonthDateKeys(year, month) {
    const normalizedYear = Number(year);
    const normalizedMonth = Number(month);
    if (!normalizedYear || normalizedMonth < 1 || normalizedMonth > 12) {
        return [];
    }

    const selectedMonthKey = `${normalizedYear}-${pad(normalizedMonth)}`;
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
    if (selectedMonthKey > currentMonthKey) {
        return [];
    }

    const lastDayOfMonth = new Date(normalizedYear, normalizedMonth, 0).getDate();
    const lastDayToRender = selectedMonthKey === currentMonthKey ? today.getDate() : lastDayOfMonth;
    const dateKeys = [];

    for (let day = 1; day <= lastDayToRender; day += 1) {
        dateKeys.push(`${selectedMonthKey}-${pad(day)}`);
    }

    return dateKeys;
}

function getWeekBounds(input = new Date()) {
    const baseDate = input instanceof Date ? new Date(input.getTime()) : (parseDateValue(input) || new Date(input));
    if (Number.isNaN(baseDate.getTime())) {
        throw new Error('Invalid date.');
    }

    const weekStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
    weekEnd.setDate(weekEnd.getDate() + 6);
    return { weekStart, weekEnd };
}

function getWeeklyDateKeys(input = new Date()) {
    const { weekStart, weekEnd } = getWeekBounds(input);
    const today = new Date();
    const currentDateKey = getDateKey(today);
    const lastDateKey = getDateKey(weekEnd) > currentDateKey ? currentDateKey : getDateKey(weekEnd);
    const dateKeys = [];

    for (let current = new Date(weekStart.getTime()); getDateKey(current) <= lastDateKey; current.setDate(current.getDate() + 1)) {
        dateKeys.push(getDateKey(current));
    }

    return dateKeys;
}

function buildAttendanceReportRows({ employees, dateKeys }) {
    const employeeIds = new Set(employees.map((user) => String(user.id)));
    const requestedDateKeys = new Set(dateKeys);
    const attendanceMap = new Map();

    listAttendanceEntries().forEach((entry) => {
        if (employeeIds.has(String(entry.id)) && requestedDateKeys.has(entry.dateKey)) {
            attendanceMap.set(`${entry.id}::${entry.dateKey}`, entry);
        }
    });

    const rows = [];
    employees.forEach((user) => {
        dateKeys.forEach((requestedDateKey) => {
            rows.push(attendanceMap.get(`${user.id}::${requestedDateKey}`) || buildAbsentEntry(user, requestedDateKey));
        });
    });

    return rows.sort(compareAttendance);
}

function getUserTimeCard(userId, year = new Date().getFullYear(), month = new Date().getMonth() + 1) {
    const user = getUserById(userId);
    if (!user) {
        throw new Error('User not found.');
    }

    const attendanceMap = new Map(
        getAttendanceForMonth(userId, Number(year), Number(month)).map((entry) => [entry.dateKey, entry])
    );

    return getMonthDateKeys(Number(year), Number(month))
        .map((dateKey) => attendanceMap.get(dateKey) || buildAbsentEntry(user, dateKey))
        .sort(compareAttendance);
}

function getUserWeeklyTimeCard(userId, input = new Date()) {
    const user = getUserById(userId);
    if (!user) {
        throw new Error('User not found.');
    }

    const attendanceMap = new Map(
        getAttendanceByUser(userId).map((entry) => [entry.dateKey, entry])
    );

    return getWeeklyDateKeys(input)
        .map((dateKey) => attendanceMap.get(dateKey) || buildAbsentEntry(user, dateKey))
        .sort(compareAttendance);
}

function getTodayAttendance() {
    const todayKey = getDateKey();
    return listAttendanceEntries().filter((entry) => entry.dateKey === todayKey);
}

function getDailyAttendanceSnapshot(dateKey = getDateKey()) {
    const employees = listEmployeeLikeUsers();
    const attendanceMap = new Map();

    listAttendanceEntries().forEach((entry) => {
        if (entry.dateKey === dateKey && !attendanceMap.has(entry.id)) {
            attendanceMap.set(entry.id, entry);
        }
    });

    return employees.map((user) => {
        const scheduleForDate = getUserScheduleForDate(user, dateKey);
        const scheduledTimeIn = scheduleForDate.is_day_off ? '' : formatTimeValue(scheduleForDate.time_in || '');
        const scheduledTimeOut = scheduleForDate.is_day_off ? '' : formatTimeValue(scheduleForDate.time_out || '');
        const entry = attendanceMap.get(user.id) || null;
        if (!entry) {
            const inferredStatus = scheduleForDate.is_day_off ? 'Day Off' : 'Absent';
            return {
                id: user.id,
                name: user.name,
                dateKey,
                avatarUrl: user.profile_picture || buildAvatarUrl(user.name),
                scheduledTimeIn,
                scheduledTimeOut,
                timeIn: '',
                timeOut: '',
                workedHours: '0.00',
                lateMinutes: 0,
                status: inferredStatus,
                statusGroup: inferredStatus.toLowerCase().replace(/\s+/g, '_'),
                remarksRaw: '',
                displayRemarks: scheduleForDate.is_day_off ? 'Scheduled day off' : 'No attendance record',
                canEditStatus: !scheduleForDate.is_day_off,
                isDayOff: scheduleForDate.is_day_off,
                branch_id: user.branch_id || ''
            };
        }

        const hasClockActivity = Boolean(entry.timeIn || entry.timeOut);
        const isScheduledDayOffWithoutLogs = scheduleForDate.is_day_off && !hasClockActivity;
        return {
            id: user.id,
            name: user.name,
            dateKey: entry.dateKey,
            avatarUrl: entry.avatarUrl,
            scheduledTimeIn,
            scheduledTimeOut,
            timeIn: entry.timeIn,
            timeOut: entry.timeOut,
            workedHours: entry.workedHours,
            lateMinutes: entry.lateMinutes,
            status: entry.status,
            statusGroup: String(entry.status || '').toLowerCase().replace(/\s+/g, '_'),
            remarksRaw: entry.remarksRaw,
            displayRemarks: isScheduledDayOffWithoutLogs ? 'Scheduled day off' : (entry.remarksRaw || entry.status),
            canEditStatus: !scheduleForDate.is_day_off && ['Absent', 'Excuse'].includes(entry.status),
            isDayOff: scheduleForDate.is_day_off,
            branch_id: entry.branch_id || user.branch_id || ''
        };
    });
}

function findAttendanceRecord(userId, dateKey = getDateKey()) {
    return getAttendanceByUser(userId).find((entry) => entry.dateKey === dateKey) || null;
}

function setDailyAttendanceStatus(userId, status, dateKey = getDateKey()) {
    const user = getUserById(userId);
    if (!user || !isEmployeeLikeRole(user.role)) {
        throw new Error('Employee not found.');
    }

    const scheduleForDate = getUserScheduleForDate(user, dateKey);
    if (scheduleForDate.is_day_off) {
        throw new Error('Cannot mark absent or excuse on a scheduled day off.');
    }

    const normalizedStatus = normalizeText(status).toLowerCase();
    if (!['absent', 'excuse'].includes(normalizedStatus)) {
        throw new Error('Invalid attendance status.');
    }

    const finalStatus = normalizedStatus === 'excuse' ? 'Excuse' : 'Absent';
    const existing = findAttendanceRecord(userId, dateKey);
    const db = getTenantDb();

    if (existing && (existing.timeIn || existing.timeOut)) {
        throw new Error('Only employees without time-in can be marked absent or excuse.');
    }

    if (existing) {
        db.prepare(`
            UPDATE attendance
            SET name = ?, date = ?, time_in = ?, time_out = ?, worked_hours = ?, remarks = ?, branch_id = ?
            WHERE rowid = ?
        `).run(user.name, dateKey, '', '', '', finalStatus, user.branch_id || null, existing.rowId);
    } else {
        db.prepare(`
            INSERT INTO attendance (id, branch_id, name, date, time_in, time_out, worked_hours, remarks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(user.id, user.branch_id || null, user.name, dateKey, '', '', '', finalStatus);
    }

    return getDailyAttendanceSnapshot(dateKey).find((entry) => entry.id === userId) || null;
}

function getAttendanceReport({ employeeId = 'all', range = 'daily', dateKey = '' }) {
    const employees = employeeId && employeeId !== 'all'
        ? listEmployeeLikeUsers().filter((user) => String(user.id) === String(employeeId))
        : listEmployeeLikeUsers();

    if (!dateKey) {
        let entries = listAttendanceEntries();
        if (employeeId && employeeId !== 'all') {
            entries = entries.filter((entry) => String(entry.id) === String(employeeId));
        }
        return entries;
    }

    if (range === 'daily') {
        return buildAttendanceReportRows({ employees, dateKeys: [getDateKey(dateKey)] });
    }

    if (range === 'weekly') {
        return buildAttendanceReportRows({ employees, dateKeys: getWeeklyDateKeys(dateKey) });
    }

    if (range === 'monthly') {
        const selected = parseDateValue(dateKey);
        if (!selected) {
            return [];
        }

        return buildAttendanceReportRows({
            employees,
            dateKeys: getMonthDateKeys(selected.getFullYear(), selected.getMonth() + 1)
        });
    }

    return listAttendanceEntries();
}

function recordTimeIn(userId, at = new Date()) {
    const user = getUserById(userId);
    if (!user || !isEmployeeLikeRole(user.role)) {
        throw new Error('Employee not found.');
    }

    const dateKey = getDateKey(at);
    const timeNow = formatTimeValue(at);
    const existing = findAttendanceRecord(userId, dateKey);
    if (existing && existing.timeIn) {
        throw new Error(`${user.name} already timed in today.`);
    }

    const scheduleForDate = getUserScheduleForDate(user, dateKey);
    const remarks = calculateLateMinutes(timeNow, scheduleForDate.time_in) > 0 ? 'Late' : 'Present';
    const db = getTenantDb();

    if (existing) {
        db.prepare(`
            UPDATE attendance
            SET name = ?, branch_id = ?, date = ?, time_in = ?, remarks = ?
            WHERE rowid = ?
        `).run(user.name, user.branch_id || null, dateKey, timeNow, remarks, existing.rowId);
    } else {
        db.prepare(`
            INSERT INTO attendance (id, branch_id, name, date, time_in, time_out, worked_hours, remarks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(user.id, user.branch_id || null, user.name, dateKey, timeNow, '', '', remarks);
    }

    return {
        user,
        time: timeNow,
        status: remarks,
        record: findAttendanceRecord(userId, dateKey)
    };
}

function recordTimeOut(userId, at = new Date()) {
    const user = getUserById(userId);
    if (!user || !isEmployeeLikeRole(user.role)) {
        throw new Error('Employee not found.');
    }

    const dateKey = getDateKey(at);
    const timeNow = formatTimeValue(at);
    const existing = findAttendanceRecord(userId, dateKey);

    if (!existing || !existing.timeIn) {
        throw new Error('No time-in record found for today.');
    }

    if (existing.timeOut) {
        throw new Error(`${user.name} already timed out today.`);
    }

    const workedHours = calculateWorkedHours(existing.timeIn, timeNow) || '0.00';
    getTenantDb().prepare(`
        UPDATE attendance
        SET name = ?, time_out = ?, worked_hours = ?, remarks = ?
        WHERE rowid = ?
    `).run(user.name, timeNow, workedHours, existing.remarksRaw || existing.status || 'Present', existing.rowId);

    return {
        user,
        time: timeNow,
        workedHours,
        record: findAttendanceRecord(userId, dateKey)
    };
}

function tableExists(db, tableName) {
    const row = db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = ?
        LIMIT 1
    `).get(tableName);
    return Boolean(row);
}

function getTableColumns(db, tableName) {
    try {
        return db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
    } catch (_error) {
        return [];
    }
}

function copySharedColumns(sourceDb, targetDb, sourceTable, targetTable, overrides = {}) {
    if (!tableExists(sourceDb, sourceTable) || !tableExists(targetDb, targetTable)) {
        return 0;
    }

    const sourceColumns = getTableColumns(sourceDb, sourceTable);
    const targetColumns = getTableColumns(targetDb, targetTable);
    const sharedColumns = targetColumns.filter((column) => sourceColumns.includes(column) && !(column in overrides));
    const allTargetColumns = [...sharedColumns, ...Object.keys(overrides)];
    if (!allTargetColumns.length) {
        return 0;
    }

    const rows = sourceDb.prepare(`SELECT ${sharedColumns.join(', ')} FROM ${sourceTable}`).all();
    if (!rows.length) {
        return 0;
    }

    const placeholders = allTargetColumns.map(() => '?').join(', ');
    const insert = targetDb.prepare(`
        INSERT OR IGNORE INTO ${targetTable} (${allTargetColumns.join(', ')})
        VALUES (${placeholders})
    `);

    targetDb.transaction((entries) => {
        entries.forEach((row) => {
            const values = sharedColumns.map((column) => row[column]);
            Object.keys(overrides).forEach((column) => {
                const overrideValue = typeof overrides[column] === 'function'
                    ? overrides[column](row)
                    : overrides[column];
                values.push(overrideValue);
            });
            insert.run(...values);
        });
    })(rows);

    return rows.length;
}

function collectLegacyBranchNames(legacyUsersDb) {
    const names = new Set();
    ['sales_entries', 'inventory_levels', 'expense_entries', 'cash_income_entries'].forEach((tableName) => {
        if (!tableExists(legacyUsersDb, tableName)) {
            return;
        }

        const columns = getTableColumns(legacyUsersDb, tableName);
        if (columns.includes('branch')) {
            legacyUsersDb.prepare(`
                SELECT DISTINCT branch
                FROM ${tableName}
                WHERE TRIM(COALESCE(branch, '')) != ''
            `).all().forEach((row) => names.add(normalizeText(row.branch)));
        }

        if (columns.includes('cash_branch')) {
            legacyUsersDb.prepare(`
                SELECT DISTINCT cash_branch
                FROM ${tableName}
                WHERE TRIM(COALESCE(cash_branch, '')) != ''
            `).all().forEach((row) => names.add(normalizeText(row.cash_branch)));
        }
    });

    if (!names.size) {
        names.add(DEFAULT_BRANCH_NAME);
    }

    return [...names].filter(Boolean).sort((left, right) => left.localeCompare(right));
}

function countDistinctInvoicesForMonth(tenantDb, monthKey = getMonthKey()) {
    if (!tableExists(tenantDb, 'sales_entries')) {
        return 0;
    }

    const rows = tenantDb.prepare(`
        SELECT receipt_number, order_number, id
        FROM sales_entries
        WHERE sale_date LIKE ?
    `).all(`${monthKey}%`);
    const uniqueKeys = new Set();
    rows.forEach((row) => {
        const key = normalizeText(row.receipt_number || row.order_number || row.id);
        if (key) {
            uniqueKeys.add(key.toLowerCase());
        }
    });
    return uniqueKeys.size;
}

function ensureSuperAdminSeed() {
    const db = getMasterDb();
    const existing = db.prepare(`
        SELECT id
        FROM users
        WHERE LOWER(role) = 'super_admin'
        LIMIT 1
    `).get();
    if (existing) {
        return;
    }

    const username = normalizeText(process.env.ATTENDANCE_SUPER_ADMIN_USERNAME || 'superadmin') || 'superadmin';
    const password = normalizeText(process.env.ATTENDANCE_SUPER_ADMIN_PASSWORD || 'superadmin123') || 'superadmin123';

    db.prepare(`
        INSERT INTO users (
            id, company_id, branch_id, username, password_hash, role, is_active,
            display_name, profile_picture, time_in, time_out
        )
        VALUES (?, NULL, NULL, ?, ?, ?, 1, ?, '', '08:00', '17:00')
    `).run(
        createUserInternalId('', username),
        username,
        normalizePasswordForStorage(password),
        ROLE_SUPER_ADMIN,
        'Super Admin'
    );
}

function createCompany({
    name,
    companyCode = '',
    subdomain = '',
    customDomain = '',
    planId,
    logoPath = '',
    primaryColor = PARENT_BRAND.primaryColor,
    appName = '',
    defaultBranchName = DEFAULT_BRANCH_NAME,
    defaultBranchAddress = '',
    adminUsername,
    adminName,
    adminPassword,
    addons = []
}) {
    ensureSystemReady();
    const plan = getPlanById(planId);
    if (!plan) {
        throw new Error('Selected plan does not exist.');
    }

    const normalizedName = normalizeText(name);
    const normalizedCompanyCode = normalizeIdentifier(companyCode || subdomain || normalizedName);
    const normalizedSubdomain = normalizeIdentifier(subdomain || normalizedCompanyCode);
    const normalizedCustomDomain = normalizeOptionalDomain(customDomain);
    const normalizedAdminUsername = normalizeText(adminUsername);
    if (!normalizedName) {
        throw new Error('Company name is required.');
    }
    if (!normalizedCompanyCode) {
        throw new Error('Company code is required.');
    }
    if (!normalizedAdminUsername) {
        throw new Error('Company admin username is required.');
    }

    const companyId = generateId('company');
    const branchId = generateId('branch');
    const db = getMasterDb();

    assertUniqueCompanyFields({
        companyCode: normalizedCompanyCode,
        subdomain: normalizedSubdomain,
        customDomain: normalizedCustomDomain
    });

    const insertCompanyWithSubscription = db.transaction(() => {
        db.prepare(`
            INSERT INTO companies (
                id, name, status, plan_id, company_code, subdomain, custom_domain,
                logo_path, primary_color, app_name
            )
            VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
        `).run(
            companyId,
            normalizedName,
            plan.id,
            normalizedCompanyCode,
            normalizedSubdomain,
            normalizedCustomDomain,
            String(logoPath || ''),
            normalizeText(primaryColor) || PARENT_BRAND.primaryColor,
            normalizeText(appName)
        );

        db.prepare(`
            INSERT INTO subscriptions (company_id, plan_id, start_date, end_date, is_active)
            VALUES (?, ?, ?, '', 1)
        `).run(companyId, plan.id, getDateKey());
    });

    runCompanyWrite(() => {
        insertCompanyWithSubscription();
    });

    const tenantDb = getTenantDb(companyId);
    tenantDb.prepare(`
        INSERT INTO branches (id, branch_name, address, is_active)
        VALUES (?, ?, ?, 1)
    `).run(branchId, normalizeText(defaultBranchName) || DEFAULT_BRANCH_NAME, normalizeText(defaultBranchAddress));

    ensureDefaultTenantTemplate(companyId, getCompanyById(companyId));

    getMasterDb().prepare(`
        INSERT INTO users (
            id, company_id, branch_id, username, password_hash, role, is_active,
            display_name, profile_picture, time_in, time_out
        )
        VALUES (?, ?, ?, ?, ?, 'company_admin', 1, ?, '', '08:00', '17:00')
    `).run(
        createUserInternalId(companyId, normalizedAdminUsername),
        companyId,
        branchId,
        normalizedAdminUsername,
        normalizePasswordForStorage(adminPassword),
        normalizeText(adminName) || normalizedAdminUsername
    );
    upsertCompanyAdminCredential(companyId, normalizedAdminUsername, String(adminPassword || '').trim());

    (Array.isArray(addons) ? addons : []).forEach((addon) => {
        const key = normalizeAddonKey(addon?.addon_key || addon?.key);
        if (!key) {
            return;
        }

        getMasterDb().prepare(`
            INSERT INTO addons (company_id, addon_key, is_active, quota_json)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(company_id, addon_key) DO UPDATE SET
                is_active = excluded.is_active,
                quota_json = excluded.quota_json
        `).run(
            companyId,
            key,
            addon?.is_active === false ? 0 : 1,
            JSON.stringify(addon?.quota || addon?.quota_json || {})
        );
    });

    return {
        company: getCompanyById(companyId),
        admin: getScopedUser(companyId, normalizedAdminUsername)
    };
}

function listCompanies() {
    ensureSystemReady();
    const rows = getMasterDb().prepare(`
        SELECT c.*, p.name AS plan_name
        FROM companies c
        LEFT JOIN plans p ON p.id = c.plan_id
        ORDER BY c.created_at DESC, c.name COLLATE NOCASE
    `).all();

    return rows.map((row) => {
        const features = getTenantFeatureState(row.id);
        const adminUser = getPrimaryCompanyAdminUser(row.id);
        const adminCredential = getCompanyAdminCredential(row.id);
        const recoveryPassword = String(adminCredential?.password_text || '').trim();
        const legacyPlainPassword = (!recoveryPassword && adminUser && !isPasswordHash(adminUser.password_hash))
            ? String(adminUser.password_hash || '')
            : '';
        const adminPassword = recoveryPassword || legacyPlainPassword;

        return {
            id: row.id,
            name: row.name,
            status: row.status,
            plan_id: row.plan_id,
            plan_name: row.plan_name || '',
            company_code: row.company_code,
            subdomain: row.subdomain || '',
            custom_domain: row.custom_domain || '',
            logo_path: row.logo_path || '',
            primary_color: row.primary_color || '',
            app_name: row.app_name || '',
            created_at: row.created_at,
            limits: features.limits,
            modules: features.modules,
            usage: features.usage,
            counts: features.counts,
            addons: features.addons,
            branding: getPublicBranding({ companyCode: row.company_code }),
            admin_credentials: {
                username: adminCredential?.username || adminUser?.username || '',
                password_text: adminPassword,
                has_recovery_password: Boolean(adminPassword),
                updated_at: adminCredential?.updated_at || ''
            }
        };
    });
}

function updateCompanyById(companyId, payload = {}) {
    ensureSystemReady();
    const existing = getCompanyById(companyId);
    if (!existing) {
        throw new Error('Company not found.');
    }

    const customDomainInput = payload.custom_domain !== undefined
        ? payload.custom_domain
        : (payload.customDomain !== undefined ? payload.customDomain : existing.custom_domain);
    const name = normalizeText(payload.name || existing.name);
    const companyCode = normalizeIdentifier(payload.company_code || payload.companyCode || existing.company_code);
    const subdomain = normalizeIdentifier(payload.subdomain || existing.subdomain || companyCode);
    const customDomain = normalizeOptionalDomain(customDomainInput);
    const logoPath = String(payload.logo_path || payload.logoPath || existing.logo_path || '');
    const primaryColor = normalizeText(payload.primary_color || payload.primaryColor || existing.primary_color || PARENT_BRAND.primaryColor);
    const appName = normalizeText(payload.app_name || payload.appName || existing.app_name);
    const status = normalizeText(payload.status || existing.status || COMPANY_ACTIVE_STATUS).toLowerCase() || COMPANY_ACTIVE_STATUS;
    const planId = normalizeText(payload.plan_id || payload.planId || existing.plan_id);

    if (!name) {
        throw new Error('Company name is required.');
    }
    if (!companyCode) {
        throw new Error('Company code is required.');
    }
    if (planId && !getPlanById(planId)) {
        throw new Error('Selected plan does not exist.');
    }

    assertUniqueCompanyFields({
        companyId: existing.id,
        companyCode,
        subdomain,
        customDomain
    });

    runCompanyWrite(() => {
        getMasterDb().prepare(`
            UPDATE companies
            SET name = ?,
                status = ?,
                plan_id = ?,
                company_code = ?,
                subdomain = ?,
                custom_domain = ?,
                logo_path = ?,
                primary_color = ?,
                app_name = ?
            WHERE id = ?
        `).run(
            name,
            status,
            planId || existing.plan_id,
            companyCode,
            subdomain,
            customDomain,
            logoPath,
            primaryColor,
            appName,
            existing.id
        );
    });

    return getCompanyById(existing.id);
}

function updateCompanyAdminCredentials(companyId, payload = {}) {
    ensureSystemReady();
    const normalizedCompanyId = normalizeText(companyId);
    if (!normalizedCompanyId) {
        throw new Error('Company id is required.');
    }

    const company = getCompanyById(normalizedCompanyId);
    if (!company) {
        throw new Error('Company not found.');
    }

    const adminUser = getPrimaryCompanyAdminUser(company.id);
    if (!adminUser) {
        throw new Error('Company admin account not found.');
    }

    const password = normalizeText(payload.password || payload.admin_password || payload.adminPassword);
    if (!password) {
        throw new Error('Admin password is required.');
    }

    getMasterDb().prepare(`
        UPDATE users
        SET password_hash = ?
        WHERE id = ?
    `).run(normalizePasswordForStorage(password), adminUser.id);
    upsertCompanyAdminCredential(company.id, adminUser.username, password);

    logAudit('company_admin.password_reset', 'user', adminUser.username, {
        company_id: company.id,
        company_code: company.company_code
    });

    return {
        company_id: company.id,
        company_code: company.company_code,
        username: adminUser.username,
        password_text: password
    };
}

function deleteCompanyById(companyId) {
    ensureSystemReady();
    const normalizedCompanyId = normalizeText(companyId);
    if (!normalizedCompanyId) {
        throw new Error('Company id is required.');
    }

    const existing = getCompanyById(normalizedCompanyId);
    if (!existing) {
        throw new Error('Company not found.');
    }

    const tenantDbPath = getTenantDbPath(existing.id);
    closeTenantDb(existing.id);

    const db = getMasterDb();
    db.transaction(() => {
        db.prepare('DELETE FROM company_admin_credentials WHERE company_id = ?').run(existing.id);
        db.prepare('DELETE FROM subscriptions WHERE company_id = ?').run(existing.id);
        db.prepare('DELETE FROM addons WHERE company_id = ?').run(existing.id);
        db.prepare('DELETE FROM usage_monthly WHERE company_id = ?').run(existing.id);
        db.prepare('DELETE FROM users WHERE company_id = ?').run(existing.id);
        db.prepare('DELETE FROM audit_logs WHERE company_id = ?').run(existing.id);
        db.prepare('DELETE FROM companies WHERE id = ?').run(existing.id);
    })();

    [tenantDbPath, `${tenantDbPath}-wal`, `${tenantDbPath}-shm`].forEach((targetPath) => {
        if (!fs.existsSync(targetPath)) {
            return;
        }

        try {
            fs.unlinkSync(targetPath);
        } catch (_error) {
            // Keep delete operation successful even if file cleanup is blocked.
        }
    });

    logAudit('company.delete', 'company', existing.id, {
        company_id: existing.id,
        company_name: existing.name,
        company_code: existing.company_code
    });

    return {
        id: existing.id,
        name: existing.name,
        company_code: existing.company_code,
        deleted: true
    };
}

function setCompanySubscription(companyId, payload = {}) {
    ensureSystemReady();
    const company = getCompanyById(companyId);
    if (!company) {
        throw new Error('Company not found.');
    }

    const planId = normalizeText(payload.plan_id || payload.planId || company.plan_id);
    if (!planId || !getPlanById(planId)) {
        throw new Error('Plan not found.');
    }
    const startDate = normalizeText(payload.start_date || payload.startDate || getDateKey()) || getDateKey();
    const endDate = normalizeText(payload.end_date || payload.endDate || '');

    const db = getMasterDb();
    db.transaction(() => {
        db.prepare(`
            UPDATE subscriptions
            SET is_active = 0
            WHERE company_id = ?
        `).run(company.id);

        db.prepare(`
            INSERT INTO subscriptions (company_id, plan_id, start_date, end_date, is_active)
            VALUES (?, ?, ?, ?, 1)
        `).run(company.id, planId, startDate, endDate);

        db.prepare(`
            UPDATE companies
            SET plan_id = ?
            WHERE id = ?
        `).run(planId, company.id);
    })();

    return {
        company: getCompanyById(company.id),
        subscription: getActiveSubscription(company.id)
    };
}

function upsertCompanyAddon(companyId, addonKey, payload = {}) {
    ensureSystemReady();
    const company = getCompanyById(companyId);
    if (!company) {
        throw new Error('Company not found.');
    }

    const key = normalizeAddonKey(addonKey || payload.addon_key || payload.key);
    if (!key) {
        throw new Error('Addon key is required.');
    }

    getMasterDb().prepare(`
        INSERT INTO addons (company_id, addon_key, is_active, quota_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(company_id, addon_key) DO UPDATE SET
            is_active = excluded.is_active,
            quota_json = excluded.quota_json
    `).run(
        company.id,
        key,
        payload.is_active === false ? 0 : 1,
        JSON.stringify(payload.quota || payload.quota_json || {})
    );

    return getAddonMap(company.id)[key] || null;
}

function getCompanyUsage(companyId, monthKey = getMonthKey()) {
    ensureSystemReady();
    if (!getCompanyById(companyId)) {
        throw new Error('Company not found.');
    }

    return getUsageRow(companyId, monthKey);
}

function listAuditLogs({ companyId = '', limit = 200, offset = 0 } = {}) {
    ensureSystemReady();
    const normalizedLimit = Math.max(1, Math.min(1000, Number(limit || 200)));
    const normalizedOffset = Math.max(0, Number(offset || 0));
    const clauses = [];
    const params = [];

    if (normalizeText(companyId)) {
        clauses.push('company_id = ?');
        params.push(normalizeText(companyId));
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return getMasterDb().prepare(`
        SELECT id, company_id, actor_user_id, action, target_type, target_id, details_json, created_at
        FROM audit_logs
        ${whereClause}
        ORDER BY id DESC
        LIMIT ?
        OFFSET ?
    `).all(...params, normalizedLimit, normalizedOffset);
}

function getSuperAdminBootstrap() {
    ensureSystemReady();
    const plans = listPlans();
    const companies = listCompanies();
    const userCount = countRows(getMasterDb(), `
        SELECT COUNT(*) AS total
        FROM users
        WHERE LOWER(role) != 'super_admin'
    `);
    return {
        plans,
        companies,
        stats: {
            companies: companies.length,
            users: userCount
        }
    };
}

function migrateLegacySingleCompany() {
    if (getSystemMeta('legacy_migration_v1') === 'done') {
        return;
    }

    const companyCount = countRows(getMasterDb(), 'SELECT COUNT(*) AS total FROM companies');
    if (companyCount > 0) {
        setSystemMeta('legacy_migration_v1', 'done');
        return;
    }

    if (!fs.existsSync(legacyPaths.users) && !fs.existsSync(legacyPaths.attendance)) {
        setSystemMeta('legacy_migration_v1', 'done');
        return;
    }

    const legacyUsersDb = fs.existsSync(legacyPaths.users)
        ? new Database(legacyPaths.users, { readonly: true, fileMustExist: true })
        : null;
    const legacyAttendanceDb = fs.existsSync(legacyPaths.attendance)
        ? new Database(legacyPaths.attendance, { readonly: true, fileMustExist: true })
        : null;

    try {
        const companyCreation = createCompany({
            name: 'Default Company',
            companyCode: DEFAULT_COMPANY_CODE,
            subdomain: DEFAULT_COMPANY_CODE,
            planId: 'business_suite',
            defaultBranchName: legacyUsersDb ? collectLegacyBranchNames(legacyUsersDb)[0] : DEFAULT_BRANCH_NAME,
            adminUsername: 'admin',
            adminName: 'Company Admin',
            adminPassword: normalizeText(process.env.ATTENDANCE_MIGRATED_ADMIN_PASSWORD || 'admin12345')
        });
        const companyId = companyCreation.company.id;
        const tenantDb = getTenantDb(companyId);
        const branchNames = legacyUsersDb ? collectLegacyBranchNames(legacyUsersDb) : [DEFAULT_BRANCH_NAME];
        const insertedBranches = new Map();

        tenantDb.prepare('DELETE FROM branches').run();
        branchNames.forEach((branchName, index) => {
            const branchId = index === 0 ? companyCreation.admin.branch_id : generateId('branch');
            tenantDb.prepare(`
                INSERT INTO branches (id, branch_name, address, is_active)
                VALUES (?, ?, '', 1)
            `).run(branchId, branchName);
            insertedBranches.set(branchName.toLowerCase(), branchId);
        });

        if (legacyUsersDb && tableExists(legacyUsersDb, 'users')) {
            const legacyUsers = legacyUsersDb.prepare(`
                SELECT *
                FROM users
                ORDER BY CASE WHEN LOWER(role) IN ('head_admin', 'company_admin') THEN 0 ELSE 1 END, id ASC
            `).all();

            getMasterDb().prepare('DELETE FROM users WHERE company_id = ?').run(companyId);
            legacyUsers.forEach((row, index) => {
                const publicId = normalizeText(row.id || `user-${index + 1}`);
                getMasterDb().prepare(`
                    INSERT INTO users (
                        id, company_id, branch_id, username, password_hash, role, is_active,
                        display_name, profile_picture, time_in, time_out
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
                `).run(
                    createUserInternalId(companyId, publicId),
                    companyId,
                    insertedBranches.values().next().value || null,
                    publicId,
                    normalizePasswordForStorage(row.password || 'password123'),
                    normalizeRole(row.role),
                    normalizeText(row.name) || publicId,
                    String(row.profile_picture || ''),
                    formatTimeValue(row.time_in) || '08:00',
                    formatTimeValue(row.time_out) || '17:00'
                );
            });
        }

        if (legacyUsersDb) {
            copySharedColumns(legacyUsersDb, tenantDb, 'clients', 'clients');
            copySharedColumns(legacyUsersDb, tenantDb, 'inventory_variants', 'inventory_variants');
            copySharedColumns(legacyUsersDb, tenantDb, 'product_catalog', 'product_catalog');
            copySharedColumns(legacyUsersDb, tenantDb, 'composite_components', 'composite_components');
            copySharedColumns(legacyUsersDb, tenantDb, 'inventory_items', 'inventory_items');
            copySharedColumns(legacyUsersDb, tenantDb, 'inventory_levels', 'inventory_levels');
            copySharedColumns(legacyUsersDb, tenantDb, 'sales_entries', 'sales_entries');
            copySharedColumns(legacyUsersDb, tenantDb, 'expense_entries', 'expense_entries');
            copySharedColumns(legacyUsersDb, tenantDb, 'cash_income_entries', 'cash_income_entries');
        }

        if (legacyAttendanceDb) {
            copySharedColumns(legacyAttendanceDb, tenantDb, 'attendance', 'attendance', {
                branch_id: insertedBranches.values().next().value || null
            });
        }

        ensureDefaultTenantTemplate(companyId, getCompanyById(companyId));
        const currentMonthInvoices = countDistinctInvoicesForMonth(tenantDb, getMonthKey());
        if (currentMonthInvoices > 0) {
            getUsageRow(companyId, getMonthKey());
            getMasterDb().prepare(`
                UPDATE usage_monthly
                SET invoices_count = ?
                WHERE company_id = ?
                  AND month_key = ?
            `).run(currentMonthInvoices, companyId, getMonthKey());
        }

        setSystemMeta('legacy_migration_company_id', companyId);
        setSystemMeta('legacy_migration_v1', 'done');
    } finally {
        legacyUsersDb?.close();
        legacyAttendanceDb?.close();
    }
}

function ensureUserWeeklySchedules(masterDb = getMasterDb()) {
    const rows = masterDb.prepare(`
        SELECT id, time_in, time_out, schedule_json
        FROM users
    `).all();
    if (!rows.length) {
        return;
    }

    const update = masterDb.prepare(`
        UPDATE users
        SET schedule_json = ?,
            time_in = ?,
            time_out = ?
        WHERE id = ?
    `);
    const transaction = masterDb.transaction((entries) => {
        entries.forEach((row) => {
            const normalizedSchedule = parseWeeklySchedulePayload(
                row.schedule_json,
                row.time_in || DEFAULT_EMPLOYEE_TIME_IN,
                row.time_out || DEFAULT_EMPLOYEE_TIME_OUT
            );
            const nextTimeIn = pickDefaultScheduleTime(normalizedSchedule, 'time_in', row.time_in);
            const nextTimeOut = pickDefaultScheduleTime(normalizedSchedule, 'time_out', row.time_out);
            const serializedSchedule = JSON.stringify(normalizedSchedule);
            const currentSchedule = String(row.schedule_json || '').trim();
            const currentTimeIn = formatTimeValue(row.time_in || '') || DEFAULT_EMPLOYEE_TIME_IN;
            const currentTimeOut = formatTimeValue(row.time_out || '') || DEFAULT_EMPLOYEE_TIME_OUT;
            if (currentSchedule === serializedSchedule && currentTimeIn === nextTimeIn && currentTimeOut === nextTimeOut) {
                return;
            }
            update.run(serializedSchedule, nextTimeIn, nextTimeOut, row.id);
        });
    });

    transaction(rows);
}

function ensureSystemReady() {
    if (systemReady || systemInitializing) {
        return;
    }

    systemInitializing = true;
    try {
        ensureDirectory(dataDir);
        ensureDirectory(tenantsDir);
        const masterDb = getMasterDb();
        ensureTableColumn(masterDb, 'users', 'feature_access_json', "TEXT NOT NULL DEFAULT '{}'");
        ensureTableColumn(masterDb, 'users', 'schedule_json', "TEXT NOT NULL DEFAULT '{}'");
        seedDefaultPlans();
        ensureSuperAdminSeed();
        migrateLegacySingleCompany();
        ensureUserWeeklySchedules(masterDb);
        systemReady = true;
    } finally {
        systemInitializing = false;
    }
}

module.exports = {
    ROLE_SUPER_ADMIN,
    ROLE_COMPANY_ADMIN,
    ROLE_EMPLOYEE,
    ROLE_STAFF,
    PARENT_BRAND,
    activeDataRoot,
    paths,
    addBranch,
    addClient,
    addCustomerRequestMessageByCode,
    addEmployee,
    addUser,
    assertAiAccess,
    assertBranchLimit,
    assertInvoiceLimit,
    assertModuleAccess,
    assertUserLimit,
    buildAvatarUrl,
    calculateLateMinutes,
    calculateWorkedHours,
    closeAll,
    createCompany,
    createCustomerRequest,
    createPlan,
    deleteCompanyById,
    deleteBranch,
    deletePlan,
    deleteEmployee,
    deleteUser,
    ensureSystemReady,
    findAttendanceRecord,
    formatDisplayDate,
    formatTimeValue,
    getAttendanceByUser,
    getAttendanceForMonth,
    getAttendanceReport,
    getBranchById,
    getClientById,
    getCompanyByCodeOrHost,
    getCompanyById,
    getCompanySettings,
    getCompanyWorkspaceConfig,
    getCustomerRequestThreadByCode,
    getCurrentBranding,
    getCurrentContext,
    getDailyAttendanceSnapshot,
    getDateKey,
    getInvoiceTemplate,
    getMasterDb,
    getMonthKey,
    getPlanById,
    getPublicBranding,
    getScopedUser,
    getSuperAdminBootstrap,
    getTenantBootstrap,
    getTenantDb,
    getTenantFeatureState,
    getTodayAttendance,
    getUsageRow,
    getUserByCredentials,
    getUserById,
    getUserByInternalId,
    getUserTimeCard,
    getUserWeeklyTimeCard,
    incrementUsage,
    isCompanyAdminRole,
    listAttendanceEntries,
    listAuditLogs,
    listBranches,
    listClients,
    listCompanies,
    listCustomerRequests,
    listPlans,
    listUsers,
    logAudit,
    parseDateValue,
    recordAiRead,
    recordInvoiceCreated,
    recordTimeIn,
    recordTimeOut,
    runWithTenantContextByCompany,
    saveClientProfile,
    saveUserProfile,
    setCompanySubscription,
    setDailyAttendanceStatus,
    upsertCompanyAddon,
    updateCompanyById,
    updateCompanyAdminCredentials,
    updateBranch,
    updateClient,
    deleteClient,
    updateCompanySettings,
    updateCompanyWorkspaceConfig,
    updateCustomerRequestByCode,
    updateEmployee,
    updateEmployeeSchedule,
    updateInvoiceTemplate,
    updatePlan,
    updateUser,
    getCompanyUsage
};
