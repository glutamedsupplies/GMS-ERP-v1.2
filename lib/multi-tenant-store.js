const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const Database = require('./runtime-db');

let SqliteDatabase = null;

const rootDir = path.resolve(__dirname, '..');
const isVercelRuntime = ['1', 'true', 'yes', 'on'].includes(String(process.env.VERCEL || '').trim().toLowerCase())
    || Boolean(String(process.env.VERCEL_URL || '').trim());
const desktopDataRoot = path.join(os.homedir(), 'AttendanceApp');
const defaultDataRoot = isVercelRuntime
    ? path.join(os.tmpdir(), 'attendanceapp')
    : (fs.existsSync(path.join(desktopDataRoot, 'data', 'master.db')) ? desktopDataRoot : rootDir);
const activeDataRoot = process.env.ATTENDANCE_DATA_DIR
    ? path.resolve(process.env.ATTENDANCE_DATA_DIR)
    : defaultDataRoot;
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
    backgroundImagePath: '',
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
    'Delivery Fee|totals.deliveryFee|money',
    'Applied Credit|totals.appliedCreditAmount|money',
    'Total Due|totals.orderTotal|money',
    'Amount Paid|totals.amountPaid|money',
    'Collection|totals.collectionAmount|money',
    'Overpayment|totals.overpaymentAmount|money',
    'Underpayment|totals.underpaymentAmount|money',
    'Note|note|text'
].join('\n');
const DEFAULT_BRANCH_NAME = 'Main Branch';
const DEFAULT_AI_QUOTA = null;
const PASSWORD_HASH_PREFIX = 'scrypt';
const PASSWORD_SCRYPT_COST = 16384;
const PASSWORD_SCRYPT_BLOCK_SIZE = 8;
const PASSWORD_SCRYPT_PARALLELIZATION = 1;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SALT_LENGTH = 16;
const ATTENDANCE_CORRECTION_STATUSES = new Set(['pending', 'approved', 'rejected']);
const ATTENDANCE_CORRECTION_REASON_MAX_LENGTH = 500;
const COMPANY_ACTIVE_STATUS = 'active';
const ROLE_SUPER_ADMIN = 'super_admin';
const ROLE_COMPANY_ADMIN = 'company_admin';
const ROLE_EMPLOYEE = 'employee';
const ROLE_STAFF = 'staff';
const USER_ACCOUNT_STATUS_ACTIVE = 'active';
const USER_ACCOUNT_STATUS_INACTIVE = 'inactive';
const USER_ACCOUNT_STATUS_SUSPENDED = 'suspended';
const USER_ACCOUNT_STATUS_RESIGNED = 'resigned';
const USER_ACCOUNT_STATUS_BANNED = 'banned';
const USER_ACCOUNT_STATUS_TERMINATED = 'terminated';
const USER_ACCOUNT_STATUSES = new Set([
    USER_ACCOUNT_STATUS_ACTIVE,
    USER_ACCOUNT_STATUS_INACTIVE,
    USER_ACCOUNT_STATUS_SUSPENDED,
    USER_ACCOUNT_STATUS_RESIGNED,
    USER_ACCOUNT_STATUS_BANNED,
    USER_ACCOUNT_STATUS_TERMINATED
]);
const PAYROLL_CUTOFF_PAYOUT_PENDING = 'pending';
const PAYROLL_CUTOFF_PAYOUT_PAID = 'paid';
const PAYROLL_CUTOFF_PAYOUT_STATUSES = new Set([
    PAYROLL_CUTOFF_PAYOUT_PENDING,
    PAYROLL_CUTOFF_PAYOUT_PAID
]);
const PAYSLIP_PHOTO_MAX_BYTES = 900 * 1024;
const COMPANY_ADMIN_ROLE_ALIASES = new Set(['company_admin', 'head_admin']);
const CUSTOMER_SERVICE_META_KEY = 'customer_service_config';
const DEFAULT_CUSTOMER_SERVICE_HANDOFF_MESSAGE = 'Mukhang mas okay ito i-handoff sa Customer Service para may actual tao kang makausap.';
const DEFAULT_CUSTOMER_SERVICE_CONFIG = Object.freeze({
    handoff_message: DEFAULT_CUSTOMER_SERVICE_HANDOFF_MESSAGE,
    emails: Object.freeze([
        'villarealjethro07@gmail.com',
        'gms.pampanga@gmail.com'
    ]),
    phones: Object.freeze([
        '09972652170'
    ]),
    company_registration_payment: Object.freeze({
        notice: 'Scan the QR code or use the payment details below before submitting your Company ID request.',
        methods: Object.freeze({
            gcash: Object.freeze({ label: 'GCash', account_name: '', account_number: '', qr_text: '', instructions: '' }),
            maya: Object.freeze({ label: 'Maya', account_name: '', account_number: '', qr_text: '', instructions: '' }),
            instapay: Object.freeze({ label: 'InstaPay', account_name: '', account_number: '', qr_text: '', instructions: '' }),
            bdo: Object.freeze({ label: 'BDO', account_name: '', account_number: '', qr_text: '', instructions: '' }),
            bpi: Object.freeze({ label: 'BPI', account_name: '', account_number: '', qr_text: '', instructions: '' }),
            other_bank: Object.freeze({ label: 'Other Bank', account_name: '', account_number: '', qr_text: '', instructions: '' })
        })
    })
});
const COMPANY_REGISTRATION_PAYMENT_METHOD_KEYS = Object.freeze([
    'gcash',
    'maya',
    'instapay',
    'bdo',
    'bpi',
    'other_bank'
]);
const DEFAULT_EMPLOYEE_TIME_IN = '09:00';
const DEFAULT_EMPLOYEE_TIME_OUT = '18:00';
const MAX_TASK_COMPLETION_COUNT = 999999;
const TASK_INPUT_TYPE_ALIASES = Object.freeze({
    checklist: 'checklist',
    checkbox: 'checklist',
    numeric: 'numeric',
    number: 'numeric',
    text: 'text'
});
const KPI_SETTINGS_ID = 'default';
const KPI_FREQUENCIES = new Set(['daily', 'weekly', 'monthly', 'custom']);
const KPI_MODES = new Set(['required_all', 'optional_issue_only', 'required_plus_issue']);
const KPI_CUSTOM_SCHEDULE_TYPES = new Set(['interval', 'date_range']);
const KPI_EVALUATION_TYPES = new Set(['required_evaluation', 'issue_encounter', 'admin_evaluation']);
const KPI_REVIEW_STATUSES = new Set(['submitted', 'reviewed', 'flagged']);
const KPI_RATING_GUIDE = Object.freeze({
    1: Object.freeze({ label: 'Very Bad', tone: 'critical' }),
    2: Object.freeze({ label: 'Bad', tone: 'negative' }),
    3: Object.freeze({ label: 'Neutral', tone: 'neutral' }),
    4: Object.freeze({ label: 'Good', tone: 'positive' }),
    5: Object.freeze({ label: 'Very Good', tone: 'excellent' })
});
const KPI_SCORE_WEIGHTS = Object.freeze({
    attendance: 15,
    punctuality: 15,
    taskCompletion: 20,
    taskQuality: 25,
    peerEvaluation: 15,
    initiative: 10
});
const KPI_DAY_OFF_HISTORY_START_DATE_KEY = '2026-07-01';
const ATTENDANCE_TIME_ZONE = 'Asia/Manila';
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
    lbc_tracking: false,
    lbc_collection_confirmation: false,
    sales_report: false
});
const USER_FEATURE_KEYS = Object.freeze(Object.keys(USER_FEATURE_DEFAULTS));
const CUSTOMER_REQUEST_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);
const WORKSPACE_CONFIG_META_KEY = 'workspace_config';
const LBC_COLLECTION_ASSIGNEES_META_KEY = 'lbc_collection_assignees';
const PRICELIST_CONFIG_META_KEY = 'pricelist_config';
const COMPANY_BULLETIN_META_KEY = 'company_bulletin';
const COMPANY_HOLIDAY_TYPES = Object.freeze([
    'regular_holiday',
    'special_holiday',
    'company_event',
    'news_update'
]);
const WORKSPACE_CONFIG_DEFAULTS = Object.freeze({
    experience: {
        mode: 'default'
    },
    menu: {
        showInvoiceSummary: false,
        showCustomerRequests: false,
        showInventoryLevels: true
    },
    labels: {
        inventoryMenu: 'Product Pricing',
        inventoryPageTitle: 'Product Pricing',
        inventoryPageCopy: 'Manage product variants used by the order form. Search by product or set, import the latest CSV, and maintain item code, selling price, and cost price in one place.',
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
    shell: {
        variant: 'default',
        appShellName: '',
        workspaceTag: '',
        workspaceCopy: ''
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
const PRICELIST_CONFIG_DEFAULTS = Object.freeze({
    audience_label: 'RESELLERS',
    header_title: 'Updated Price List',
    intro_line: 'ALL PRODUCTS AVAILABLE FOR PER SESSION OR HALF BOX',
    footer_note_primary: 'Prices may change without prior notice',
    footer_note_secondary: 'Bulk / reseller discounts available',
    poster_title: 'GMS PRICELIST',
    poster_subtitle: '',
    products: {}
});

const dbCache = new Map();
const tenantContextStorage = new AsyncLocalStorage();
const tenantSchemaEnsured = new WeakSet();

let systemReady = false;
let systemInitializing = false;

function getLegacySqliteDatabase() {
    if (!SqliteDatabase) {
        SqliteDatabase = require('better-sqlite3');
    }

    return SqliteDatabase;
}

function normalizeText(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeMultilineText(value, maxLength = 0) {
    const normalized = String(value ?? '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => String(line || '').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (maxLength > 0) {
        return normalized.slice(0, maxLength);
    }
    return normalized;
}

function normalizeDateKey(value = '') {
    const text = String(value || '').trim();
    if (!text) {
        return '';
    }

    const exactMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (exactMatch) {
        const year = Number(exactMatch[1]);
        const month = Number(exactMatch[2]);
        const day = Number(exactMatch[3]);
        const utcDate = new Date(Date.UTC(year, month - 1, day));
        if (
            utcDate.getUTCFullYear() === year
            && (utcDate.getUTCMonth() + 1) === month
            && utcDate.getUTCDate() === day
        ) {
            return `${exactMatch[1]}-${exactMatch[2]}-${exactMatch[3]}`;
        }
        return '';
    }

    const parsed = parseDateValue(text);
    return parsed ? getDateKey(parsed) : '';
}

function createEmptyCompanyAnnouncement() {
    return {
        title: '',
        message: '',
        starts_on: '',
        ends_on: '',
        updated_at: '',
        updated_by: ''
    };
}

function createDefaultCompanyBulletin() {
    return {
        announcement: createEmptyCompanyAnnouncement(),
        holidays: []
    };
}

function normalizeCompanyHolidayType(value = '') {
    const normalized = normalizeIdentifier(value || 'regular_holiday').replace(/-/g, '_');
    return COMPANY_HOLIDAY_TYPES.includes(normalized)
        ? normalized
        : 'regular_holiday';
}

function normalizeStoredCompanyHoliday(value = {}) {
    const source = (value && typeof value === 'object' && !Array.isArray(value))
        ? value
        : {};
    const startDate = normalizeDateKey(
        source.start_date
        || source.startDate
        || source.date
        || source.date_key
        || source.dateKey
        || ''
    );
    const endDate = normalizeDateKey(
        source.end_date
        || source.endDate
        || source.range_end
        || source.rangeEnd
        || source.until
        || ''
    ) || startDate;
    const name = normalizeText(source.name || source.title || source.label || '').slice(0, 120);

    if (!startDate || !name) {
        return null;
    }

    const idSource = normalizeIdentifier(source.id || source.holiday_id || source.holidayId || '');
    return {
        id: idSource || generateId('holiday'),
        date: startDate,
        start_date: startDate,
        end_date: endDate,
        name,
        type: normalizeCompanyHolidayType(source.type || source.category || ''),
        time_label: normalizeText(source.time_label || source.timeLabel || source.when || '').slice(0, 60),
        note: normalizeMultilineText(source.note || source.description || '', 320),
        created_at: String(source.created_at || source.createdAt || source.updated_at || source.updatedAt || ''),
        updated_at: String(source.updated_at || source.updatedAt || source.created_at || source.createdAt || '')
    };
}

function sanitizeCompanyHolidayInput(payload = {}, currentHoliday = null) {
    const source = (payload && typeof payload === 'object' && !Array.isArray(payload))
        ? payload
        : {};
    const normalized = normalizeStoredCompanyHoliday({
        ...(currentHoliday || {}),
        ...source
    });

    if (!normalized?.start_date) {
        throw new Error('Start date is required.');
    }

    if (!normalized?.name) {
        throw new Error('Holiday name is required.');
    }

    if (normalized.end_date && normalized.end_date < normalized.start_date) {
        throw new Error('End date cannot be earlier than the start date.');
    }

    const timestamp = new Date().toISOString();
    return {
        ...normalized,
        date: normalized.start_date,
        id: currentHoliday?.id || normalized.id || generateId('holiday'),
        created_at: currentHoliday?.created_at || normalized.created_at || timestamp,
        updated_at: timestamp
    };
}

function normalizeStoredCompanyAnnouncement(value = {}) {
    const source = (value && typeof value === 'object' && !Array.isArray(value))
        ? value
        : {};

    return {
        title: normalizeText(source.title || source.subject || '').slice(0, 140),
        message: normalizeMultilineText(source.message || source.body || source.notice || '', 2000),
        starts_on: normalizeDateKey(source.starts_on || source.startsOn || ''),
        ends_on: normalizeDateKey(source.ends_on || source.endsOn || ''),
        updated_at: String(source.updated_at || source.updatedAt || ''),
        updated_by: normalizeText(source.updated_by || source.updatedBy || '').slice(0, 80)
    };
}

function sanitizeCompanyAnnouncementInput(payload = {}, currentAnnouncement = null) {
    const source = (payload && typeof payload === 'object' && !Array.isArray(payload))
        ? payload
        : {};
    const normalized = normalizeStoredCompanyAnnouncement({
        ...(currentAnnouncement || {}),
        ...source
    });

    if (!normalized.message) {
        throw new Error('Announcement message is required.');
    }

    const startsOn = normalized.starts_on || getDateKey();
    if (normalized.ends_on && normalized.ends_on < startsOn) {
        throw new Error('Announcement end date cannot be earlier than the start date.');
    }

    return {
        title: normalized.title || 'Company Announcement',
        message: normalized.message,
        starts_on: startsOn,
        ends_on: normalized.ends_on,
        updated_at: new Date().toISOString(),
        updated_by: normalized.updated_by
    };
}

function sortCompanyHolidays(items = []) {
    return [...items].sort((left, right) => (
        String(left?.start_date || left?.date || '').localeCompare(String(right?.start_date || right?.date || ''))
        || String(left?.end_date || left?.date || '').localeCompare(String(right?.end_date || right?.date || ''))
        || String(left?.time_label || '').localeCompare(String(right?.time_label || ''))
        || String(left?.name || '').localeCompare(String(right?.name || ''))
    ));
}

function parseCompanyBulletin(value = '') {
    const fallback = createDefaultCompanyBulletin();
    if (!value) {
        return fallback;
    }

    try {
        const parsed = JSON.parse(value);
        const announcement = normalizeStoredCompanyAnnouncement(parsed?.announcement || {});
        const holidays = Array.isArray(parsed?.holidays)
            ? sortCompanyHolidays(parsed.holidays.map((item) => normalizeStoredCompanyHoliday(item)).filter(Boolean))
            : [];

        return {
            announcement,
            holidays
        };
    } catch (_error) {
        return fallback;
    }
}

function getCompanyAnnouncementState(announcement = null, todayKey = getDateKey()) {
    const normalizedAnnouncement = normalizeStoredCompanyAnnouncement(announcement || {});
    const hasContent = Boolean(normalizedAnnouncement.title || normalizedAnnouncement.message);
    const isScheduled = Boolean(hasContent && normalizedAnnouncement.starts_on && normalizedAnnouncement.starts_on > todayKey);
    const isExpired = Boolean(hasContent && normalizedAnnouncement.ends_on && normalizedAnnouncement.ends_on < todayKey);
    const isActive = Boolean(hasContent && !isScheduled && !isExpired);
    const windowLabel = normalizedAnnouncement.starts_on && normalizedAnnouncement.ends_on
        ? `${formatDisplayDate(normalizedAnnouncement.starts_on)} to ${formatDisplayDate(normalizedAnnouncement.ends_on)}`
        : (normalizedAnnouncement.starts_on
            ? `Starts ${formatDisplayDate(normalizedAnnouncement.starts_on)}`
            : (normalizedAnnouncement.ends_on
                ? `Until ${formatDisplayDate(normalizedAnnouncement.ends_on)}`
                : 'Visible until cleared'));

    return {
        ...normalizedAnnouncement,
        has_content: hasContent,
        is_active: isActive,
        is_scheduled: isScheduled,
        is_expired: isExpired,
        audience: 'employees',
        window_label: hasContent ? windowLabel : ''
    };
}

function isNewsLikeCalendarType(value = '') {
    return String(value || '').trim() === 'news_update';
}

function isHolidayCalendarType(value = '') {
    const normalized = String(value || '').trim();
    return normalized === 'regular_holiday' || normalized === 'special_holiday';
}

function getCompanyCalendarItemStartDate(item = {}) {
    return String(item?.start_date || item?.date || '').trim();
}

function getCompanyCalendarItemEndDate(item = {}) {
    return String(item?.end_date || item?.date || item?.start_date || '').trim();
}

function doesCompanyCalendarItemCoverDate(item = {}, dateKey = '') {
    const normalizedDate = String(dateKey || '').trim();
    if (!normalizedDate) {
        return false;
    }

    const startDate = getCompanyCalendarItemStartDate(item);
    const endDate = getCompanyCalendarItemEndDate(item);
    if (!startDate) {
        return false;
    }

    return normalizedDate >= startDate && normalizedDate <= endDate;
}

function buildCompanyCalendarNotificationItems(items = [], todayKey = getDateKey(), limit = 3) {
    const todayItems = items.filter((item) => doesCompanyCalendarItemCoverDate(item, todayKey));
    if (todayItems.length) {
        return todayItems.slice(0, limit);
    }

    const upcomingItems = items.filter((item) => getCompanyCalendarItemEndDate(item) >= todayKey);
    return upcomingItems.slice(0, limit);
}

function getCompanyHolidayForDate(dateKey = '') {
    const normalizedDateKey = normalizeDateKey(dateKey);
    if (!normalizedDateKey) {
        return null;
    }

    const bulletin = parseCompanyBulletin(getTenantMeta(COMPANY_BULLETIN_META_KEY));
    const holidayItems = Array.isArray(bulletin.holidays)
        ? bulletin.holidays.filter((item) => isHolidayCalendarType(item.type))
        : [];

    return holidayItems.find((item) => doesCompanyCalendarItemCoverDate(item, normalizedDateKey)) || null;
}

function getAttendanceHolidayStatus(dateKey = '') {
    return getCompanyHolidayForDate(dateKey) ? 'Holiday' : '';
}

function setCompanyBulletin(bulletin = {}) {
    setTenantMeta(COMPANY_BULLETIN_META_KEY, JSON.stringify({
        announcement: normalizeStoredCompanyAnnouncement(bulletin.announcement || {}),
        holidays: sortCompanyHolidays(
            Array.isArray(bulletin.holidays)
                ? bulletin.holidays.map((item) => normalizeStoredCompanyHoliday(item)).filter(Boolean)
                : []
        )
    }));
}

function assertCompanyHolidayUniqueness(holidays = [], candidateHoliday = {}, { ignoreId = '' } = {}) {
    const candidateName = String(candidateHoliday.name || '').trim().toLowerCase();
    const duplicate = holidays.find((holiday) => (
        String(holiday.id || '') !== String(ignoreId || '')
        && getCompanyCalendarItemStartDate(holiday) === getCompanyCalendarItemStartDate(candidateHoliday)
        && getCompanyCalendarItemEndDate(holiday) === getCompanyCalendarItemEndDate(candidateHoliday)
        && String(holiday.name || '').trim().toLowerCase() === candidateName
    ));

    if (duplicate) {
        throw new Error('A holiday with the same date and name already exists.');
    }
}

function normalizeIpAddress(value = '') {
    const normalized = String(value || '').trim().replace(/^\[|\]$/g, '');
    if (!normalized) {
        return '';
    }

    const lower = normalized.toLowerCase();
    if (lower === '::1') {
        return '127.0.0.1';
    }
    if (lower.startsWith('::ffff:')) {
        return normalized.slice(7);
    }

    return normalized;
}

function buildIpMatchCandidates(value = '') {
    const normalized = normalizeIpAddress(value);
    if (!normalized) {
        return [];
    }

    const candidates = new Set([normalized]);
    if (normalized === '127.0.0.1') {
        candidates.add('::1');
        candidates.add('::ffff:127.0.0.1');
    }
    if (normalized.includes(':')) {
        candidates.add(normalized.toLowerCase());
    }

    return [...candidates];
}

function normalizeEmail(value = '') {
    return String(value || '').trim().toLowerCase();
}

function isValidEmail(value = '') {
    const normalized = normalizeEmail(value);
    return Boolean(normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized));
}

function normalizeCompanyCode(value = '') {
    return normalizeText(value).toLowerCase();
}

function parseRequestMeta(rawValue) {
    if (!rawValue) {
        return {};
    }
    try {
        const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function sanitizeRequestMeta(meta = {}) {
    const source = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
    const intent = normalizeText(source.intent).toLowerCase();
    const role = normalizeText(source.role).toLowerCase();
    const email = normalizeEmail(source.email);
    const desiredId = normalizeText(source.desiredId || source.userId || source.employeeId || '');
    const companyName = normalizeText(source.companyName || source.businessName || source.company || '');
    const desiredCompanyCode = normalizeText(
        source.desiredCompanyCode
        || source.companyCodeRequest
        || source.companyIdRequest
        || source.requestedCompanyCode
        || ''
    ).toUpperCase();
    const adminId = normalizeText(source.adminId || source.adminUsername || source.companyAdminId || '');
    const paymentMethod = normalizeText(source.paymentMethod || source.modeOfPayment || '');
    const paymentReference = normalizeText(source.paymentReference || source.referenceNumber || '');
    const requestedPlan = normalizeText(source.requestedPlan || source.subscriptionPlan || source.plan || '');
    const requestedPlanId = normalizeText(source.requestedPlanId || source.planId || source.subscriptionPlanId || '');
    const requestedPlanKey = normalizeText(source.requestedPlanKey || source.planKey || source.subscriptionPlanKey || '');
    const paymentStatus = normalizeText(source.paymentStatus || source.payment_state || '');
    const checkoutSessionId = normalizeText(source.checkoutSessionId || source.checkout_session_id || '');
    const paymentQrReference = normalizeText(source.paymentQrReference || source.payment_qr_reference || '');
    const provisionedCompanyId = normalizeText(source.provisionedCompanyId || source.companyId || '');
    const provisionedCompanyCode = normalizeText(source.provisionedCompanyCode || source.companyCode || '').toUpperCase();
    const provisionedAdminUsername = normalizeText(source.provisionedAdminUsername || source.adminUsernameProvisioned || '');
    const quotedAmountPhp = Number(source.quotedAmountPhp ?? source.amountPhp ?? source.quoted_amount_php ?? 0);
    const completedAt = normalizeText(source.completedAt || source.checkoutCompletedAt || source.checkout_completed_at || '');

    const payload = {};
    if (intent) {
        payload.intent = intent;
    }
    if (role) {
        payload.role = role;
    }
    if (email) {
        payload.email = email;
    }
    if (desiredId) {
        payload.desiredId = desiredId;
    }
    if (companyName) {
        payload.companyName = companyName;
    }
    if (desiredCompanyCode) {
        payload.desiredCompanyCode = desiredCompanyCode;
    }
    if (adminId) {
        payload.adminId = adminId;
    }
    if (paymentMethod) {
        payload.paymentMethod = paymentMethod;
    }
    if (paymentReference) {
        payload.paymentReference = paymentReference;
    }
    if (requestedPlan) {
        payload.requestedPlan = requestedPlan;
    }
    if (requestedPlanId) {
        payload.requestedPlanId = requestedPlanId;
    }
    if (requestedPlanKey) {
        payload.requestedPlanKey = requestedPlanKey;
    }
    if (paymentStatus) {
        payload.paymentStatus = paymentStatus;
    }
    if (checkoutSessionId) {
        payload.checkoutSessionId = checkoutSessionId;
    }
    if (paymentQrReference) {
        payload.paymentQrReference = paymentQrReference;
    }
    if (Number.isFinite(quotedAmountPhp) && quotedAmountPhp > 0) {
        payload.quotedAmountPhp = quotedAmountPhp;
    }
    if (provisionedCompanyId) {
        payload.provisionedCompanyId = provisionedCompanyId;
    }
    if (provisionedCompanyCode) {
        payload.provisionedCompanyCode = provisionedCompanyCode;
    }
    if (provisionedAdminUsername) {
        payload.provisionedAdminUsername = provisionedAdminUsername;
    }
    if (completedAt) {
        payload.completedAt = completedAt;
    }

    return payload;
}

function isSignupRequest(request = {}) {
    const meta = request.requestMeta || {};
    if (String(meta.intent || '').toLowerCase() === 'signup') {
        return true;
    }
    const details = String(request.requestDetails || '').toLowerCase();
    return details.includes('sign up') || details.includes('signup');
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

function createCodedError(code, message, status = 400) {
    const error = new Error(message);
    error.code = String(code || 'ERROR');
    error.status = Number(status || 400);
    return error;
}

function normalizeDeviceId(value = '') {
    return String(value ?? '')
        .replace(/\s+/g, '')
        .trim()
        .slice(0, 80);
}

function normalizeCorrectionId(value = '') {
    return String(value ?? '').trim().slice(0, 160);
}

function normalizeAttendanceType(value = '') {
    const normalized = String(value || '').trim().toUpperCase();
    return normalized === 'TIME_IN' || normalized === 'TIME_OUT' ? normalized : '';
}

function normalizeTaskName(value = '') {
    return normalizeText(value).slice(0, 80);
}

function normalizeTaskInputType(value = '', { fallback = 'numeric', strict = false } = {}) {
    const key = String(value || '').trim().toLowerCase();
    const normalized = TASK_INPUT_TYPE_ALIASES[key];
    if (normalized) {
        return normalized;
    }
    if (strict && key) {
        throw new Error('Task input type must be checklist, numeric, or text.');
    }
    return fallback;
}

function normalizeTaskTextResponse(value = '', { required = false } = {}) {
    const text = normalizeText(value).slice(0, 500);
    if (required && !text) {
        throw new Error('Task text is required before time out.');
    }
    return text;
}

function normalizeTaskChecklistValue(value, { required = false } = {}) {
    const normalized = value === true
        || value === 1
        || ['true', '1', 'yes', 'checked', 'complete', 'completed'].includes(String(value || '').trim().toLowerCase());
    if (required && !normalized) {
        throw new Error('Check the completed task before time out.');
    }
    return normalized;
}

function normalizeTaskId(value = '') {
    const text = String(value ?? '').trim();
    if (!text) {
        return '';
    }

    const numericValue = Number(text);
    if (!Number.isInteger(numericValue) || numericValue < 1) {
        return '';
    }

    return String(numericValue);
}

function normalizeTaskCompletionCount(value, { required = false } = {}) {
    const text = String(value ?? '').trim();
    if (!text) {
        if (required) {
            throw new Error('Task count is required before time out.');
        }
        return 0;
    }

    if (!/^\d+$/.test(text)) {
        throw new Error('Task count must use numbers only.');
    }

    const count = Number(text);
    if (!Number.isSafeInteger(count) || count < 0 || count > MAX_TASK_COMPLETION_COUNT) {
        throw new Error(`Task count must be between 0 and ${MAX_TASK_COMPLETION_COUNT}.`);
    }

    return count;
}

function parseAttendanceTaskResults(value, legacy = {}) {
    let source = value;
    if (typeof source === 'string') {
        const text = source.trim();
        if (!text) {
            source = [];
        } else {
            try {
                source = JSON.parse(text);
            } catch (_error) {
                source = [];
            }
        }
    }

    if (!Array.isArray(source)) {
        source = [];
    }

    const results = source
        .map((item) => {
            const id = normalizeAssignedTaskId(item?.id ?? item?.taskId ?? item?.task_id ?? '');
            const name = normalizeTaskName(item?.name ?? item?.taskName ?? item?.task_name ?? '');
            const inputType = normalizeTaskInputType(item?.inputType ?? item?.input_type ?? '');
            const rawValue = item?.value ?? item?.taskValue ?? item?.task_value;
            const isCustom = Boolean(item?.isCustom ?? item?.is_custom);
            if (!name) {
                return null;
            }
            if (inputType === 'checklist') {
                const value = normalizeTaskChecklistValue(rawValue ?? item?.completed ?? item?.count);
                return { id, name, inputType, value, count: value ? 1 : 0, ...(isCustom ? { isCustom: true } : {}) };
            }
            if (inputType === 'text') {
                const value = normalizeTaskTextResponse(rawValue ?? item?.text ?? item?.response ?? '');
                return { id, name, inputType, value, count: 0, ...(isCustom ? { isCustom: true } : {}) };
            }
            const count = Math.max(0, Number(rawValue ?? item?.count ?? item?.taskCount ?? item?.task_count ?? 0) || 0);
            return { id, name, inputType, value: count, count, ...(isCustom ? { isCustom: true } : {}) };
        })
        .filter(Boolean);

    if (results.length) {
        return results;
    }

    const legacyName = normalizeTaskName(legacy.taskName || legacy.task_name || '');
    if (!legacyName) {
        return [];
    }

    return [{
        id: normalizeAssignedTaskId(legacy.taskId || legacy.task_id || ''),
        name: legacyName,
        inputType: 'numeric',
        value: Math.max(0, Number(legacy.taskCount ?? legacy.task_count ?? 0) || 0),
        count: Math.max(0, Number(legacy.taskCount ?? legacy.task_count ?? 0) || 0)
    }];
}

function normalizeSchemaIdentifier(value = '') {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized || 'tenant_default';
}

function buildTenantSchemaName(companyId = '') {
    return `tenant_${normalizeSchemaIdentifier(companyId)}`;
}

function getTenantSchema(companyId = '') {
    const normalizedCompanyId = normalizeText(companyId);
    if (!normalizedCompanyId) {
        throw new Error('Tenant schema requires a company id.');
    }

    const cachedMaster = dbCache.get('master');
    if (!cachedMaster) {
        return buildTenantSchemaName(normalizedCompanyId);
    }

    try {
        const row = cachedMaster.prepare(`
            SELECT db_schema
            FROM companies
            WHERE id = ?
            LIMIT 1
        `).get(normalizedCompanyId);
        return normalizeSchemaIdentifier(row?.db_schema || buildTenantSchemaName(normalizedCompanyId));
    } catch (_error) {
        return buildTenantSchemaName(normalizedCompanyId);
    }
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

function ensureTenantSchemaColumns(db) {
    if (tenantSchemaEnsured.has(db)) {
        return;
    }
    ensureTableColumn(db, 'attendance', 'task_id', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'attendance', 'task_name', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'attendance', 'task_count', 'INTEGER NOT NULL DEFAULT 0');
    ensureTableColumn(db, 'attendance', 'task_results_json', "TEXT NOT NULL DEFAULT '[]'");
    ensureTableColumn(db, 'attendance', 'timeout_issues', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'attendance', 'timeout_remarks', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'attendance', 'created_at', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'attendance', 'updated_at', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'attendance_corrections', 'updated_at', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'customer_requests', 'request_meta_json', "TEXT NOT NULL DEFAULT '{}'");
    ensureTableColumn(db, 'customer_requests', 'updated_at', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'task_definitions', 'input_type', "TEXT NOT NULL DEFAULT 'numeric'");
    db.exec(`
        UPDATE attendance
        SET created_at = CURRENT_TIMESTAMP
        WHERE TRIM(COALESCE(created_at, '')) = '';

        UPDATE attendance
        SET updated_at = CURRENT_TIMESTAMP
        WHERE TRIM(COALESCE(updated_at, '')) = '';

        UPDATE attendance_corrections
        SET updated_at = CURRENT_TIMESTAMP
        WHERE TRIM(COALESCE(updated_at, '')) = '';

        UPDATE customer_requests
        SET updated_at = CURRENT_TIMESTAMP
        WHERE TRIM(COALESCE(updated_at, '')) = '';

        CREATE TABLE IF NOT EXISTS task_definitions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_name TEXT NOT NULL UNIQUE,
            input_type TEXT NOT NULL DEFAULT 'numeric',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_task_definitions_active_name
        ON task_definitions (is_active, task_name);

        CREATE TABLE IF NOT EXISTS kpi_evaluation_settings (
            id TEXT PRIMARY KEY,
            frequency TEXT NOT NULL DEFAULT 'daily',
            custom_schedule_type TEXT NOT NULL DEFAULT 'interval',
            custom_interval_days INTEGER NOT NULL DEFAULT 15,
            custom_start_date TEXT NOT NULL DEFAULT '',
            custom_end_date TEXT NOT NULL DEFAULT '',
            mode TEXT NOT NULL DEFAULT 'required_all',
            comment_required_for_all_required_evaluations INTEGER NOT NULL DEFAULT 0,
            comment_required_for_issue_encounter_low_rating INTEGER NOT NULL DEFAULT 0,
            comment_required_for_all_issue_encounters INTEGER NOT NULL DEFAULT 0,
            allow_employee_view INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS kpi_evaluation_records (
            id TEXT PRIMARY KEY,
            submission_id TEXT NOT NULL,
            evaluator_employee_id TEXT NOT NULL,
            evaluator_name TEXT NOT NULL DEFAULT '',
            rated_employee_id TEXT NOT NULL,
            rated_employee_name TEXT NOT NULL DEFAULT '',
            rated_employee_role TEXT NOT NULL DEFAULT '',
            rating INTEGER NOT NULL,
            rating_label TEXT NOT NULL,
            comment TEXT NOT NULL DEFAULT '',
            evaluation_type TEXT NOT NULL,
            evaluation_frequency TEXT NOT NULL DEFAULT '',
            evaluation_period_start TEXT NOT NULL,
            evaluation_period_end TEXT NOT NULL,
            submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            visible_to_admin_only INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'submitted',
            reviewed_by_admin_id TEXT NOT NULL DEFAULT '',
            reviewed_at TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS kpi_evaluation_submissions (
            id TEXT PRIMARY KEY,
            evaluator_employee_id TEXT NOT NULL,
            evaluation_type TEXT NOT NULL,
            evaluation_period_start TEXT NOT NULL,
            evaluation_period_end TEXT NOT NULL,
            required_period_key TEXT UNIQUE,
            submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS kpi_evaluation_audit_logs (
            id TEXT PRIMARY KEY,
            record_id TEXT NOT NULL,
            actor_user_id TEXT NOT NULL,
            action TEXT NOT NULL,
            previous_status TEXT NOT NULL DEFAULT '',
            next_status TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS incident_reports (
            id TEXT PRIMARY KEY,
            incident_date TEXT NOT NULL,
            department TEXT NOT NULL DEFAULT '',
            reason_incident TEXT NOT NULL DEFAULT '',
            action_taken TEXT NOT NULL DEFAULT '',
            prepared_by TEXT NOT NULL DEFAULT '',
            checked_by TEXT NOT NULL DEFAULT '',
            date_checked TEXT NOT NULL DEFAULT '',
            resolved INTEGER NOT NULL DEFAULT 0,
            assigned_employee_id TEXT NOT NULL DEFAULT '',
            assigned_employee_name TEXT NOT NULL DEFAULT '',
            created_by_user_id TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            resolved_at TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS attendance_corrections (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            attendance_id INTEGER,
            correction_id TEXT NOT NULL,
            user_id TEXT NOT NULL DEFAULT '',
            requested_date TEXT NOT NULL DEFAULT '',
            requested_type TEXT NOT NULL,
            requested_scanned_at TEXT NOT NULL,
            reason TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT 'device',
            requested_by TEXT NOT NULL DEFAULT '',
            requested_by_device_id TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            reviewed_by_user_id TEXT NOT NULL DEFAULT '',
            reviewed_at TEXT NOT NULL DEFAULT '',
            rejection_reason TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(company_id, correction_id)
        );

        CREATE TABLE IF NOT EXISTS attendance_audit_logs (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            attendance_id INTEGER,
            correction_id TEXT NOT NULL DEFAULT '',
            action TEXT NOT NULL,
            old_value_json TEXT NOT NULL DEFAULT '{}',
            new_value_json TEXT NOT NULL DEFAULT '{}',
            reason TEXT NOT NULL DEFAULT '',
            actor_type TEXT NOT NULL DEFAULT '',
            actor_id TEXT NOT NULL DEFAULT '',
            device_id TEXT NOT NULL DEFAULT '',
            ip_address TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_kpi_records_period_evaluator
        ON kpi_evaluation_records (evaluation_type, evaluation_period_start, evaluation_period_end, evaluator_employee_id);

        CREATE INDEX IF NOT EXISTS idx_kpi_submissions_period_evaluator
        ON kpi_evaluation_submissions (evaluation_type, evaluation_period_start, evaluation_period_end, evaluator_employee_id);

        CREATE INDEX IF NOT EXISTS idx_kpi_records_rated_submitted
        ON kpi_evaluation_records (rated_employee_id, submitted_at);

        CREATE INDEX IF NOT EXISTS idx_kpi_records_status_rating
        ON kpi_evaluation_records (status, rating);

        CREATE INDEX IF NOT EXISTS idx_kpi_audit_record_created
        ON kpi_evaluation_audit_logs (record_id, created_at);

        CREATE INDEX IF NOT EXISTS idx_incident_reports_assignment_status
        ON incident_reports (assigned_employee_id, resolved, incident_date);

        CREATE INDEX IF NOT EXISTS idx_incident_reports_date
        ON incident_reports (incident_date, updated_at);

        CREATE TABLE IF NOT EXISTS payroll_cutoff_statuses (
            user_id TEXT NOT NULL,
            cutoff_start_date TEXT NOT NULL,
            cutoff_end_date TEXT NOT NULL,
            payout_status TEXT NOT NULL DEFAULT 'pending',
            paid_at TEXT NOT NULL DEFAULT '',
            payslip_photo_data_url TEXT NOT NULL DEFAULT '',
            payslip_photo_name TEXT NOT NULL DEFAULT '',
            payslip_photo_uploaded_at TEXT NOT NULL DEFAULT '',
            payslip_photo_uploaded_by TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_by TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (user_id, cutoff_start_date, cutoff_end_date)
        );

        CREATE INDEX IF NOT EXISTS idx_payroll_cutoff_statuses_cutoff
        ON payroll_cutoff_statuses (cutoff_start_date, cutoff_end_date, user_id);

        CREATE INDEX IF NOT EXISTS idx_attendance_user_date
        ON attendance (id, date);

        CREATE INDEX IF NOT EXISTS idx_attendance_date_user
        ON attendance (date, id);

        CREATE INDEX IF NOT EXISTS idx_attendance_updated_at
        ON attendance (updated_at, date, id);

        CREATE INDEX IF NOT EXISTS idx_attendance_corrections_attendance
        ON attendance_corrections (company_id, attendance_id);

        CREATE INDEX IF NOT EXISTS idx_attendance_corrections_status_updated
        ON attendance_corrections (company_id, status, updated_at);

        CREATE INDEX IF NOT EXISTS idx_attendance_corrections_updated
        ON attendance_corrections (company_id, updated_at);

        CREATE INDEX IF NOT EXISTS idx_attendance_audit_attendance
        ON attendance_audit_logs (company_id, attendance_id, created_at);

        CREATE INDEX IF NOT EXISTS idx_attendance_audit_correction
        ON attendance_audit_logs (company_id, correction_id, created_at);
    `);
    ensureTableColumn(db, 'payroll_cutoff_statuses', 'payslip_photo_data_url', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'payroll_cutoff_statuses', 'payslip_photo_name', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'payroll_cutoff_statuses', 'payslip_photo_uploaded_at', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'payroll_cutoff_statuses', 'payslip_photo_uploaded_by', "TEXT NOT NULL DEFAULT ''");
    tenantSchemaEnsured.add(db);
}

function openDb(cacheKey, schema, initializer) {
    if (!dbCache.has(cacheKey)) {
        const db = new Database({
            key: cacheKey,
            schema
        });
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
    return openDb('master', 'public', initMasterSchema);
}

function sanitizeAiChatMemoryText(value = '') {
    return String(value || '').trim();
}

function parseAiChatMemoryMessages(rawValue = '') {
    if (!rawValue) {
        return [];
    }
    try {
        const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .map((entry) => ({
                role: entry?.role === 'model' ? 'model' : 'user',
                text: sanitizeAiChatMemoryText(entry?.text || '')
            }))
            .filter((entry) => entry.text);
    } catch (_error) {
        return [];
    }
}

function getAiChatMemory(id = '') {
    const normalizedId = sanitizeAiChatMemoryText(id);
    if (!normalizedId) {
        return null;
    }
    const row = getMasterDb().prepare(`
        SELECT id, company_id, user_id, summary_text, messages_json
        FROM ai_chat_memory
        WHERE id = ?
    `).get(normalizedId);
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        companyId: row.company_id || '',
        userId: row.user_id || '',
        summary: sanitizeAiChatMemoryText(row.summary_text || ''),
        messages: parseAiChatMemoryMessages(row.messages_json || '[]')
    };
}

function saveAiChatMemory({
    id = '',
    companyId = '',
    userId = '',
    summary = '',
    messages = []
} = {}) {
    const normalizedId = sanitizeAiChatMemoryText(id);
    if (!normalizedId) {
        return null;
    }

    const normalizedMessages = Array.isArray(messages) ? messages : [];
    const sanitizedMessages = normalizedMessages
        .map((entry) => ({
            role: entry?.role === 'model' ? 'model' : 'user',
            text: sanitizeAiChatMemoryText(entry?.text || '')
        }))
        .filter((entry) => entry.text);
    const payload = JSON.stringify(sanitizedMessages);
    const normalizedSummary = sanitizeAiChatMemoryText(summary);

    getMasterDb().prepare(`
        INSERT INTO ai_chat_memory (
            id,
            company_id,
            user_id,
            summary_text,
            messages_json,
            created_at,
            updated_at
        ) VALUES (
            @id,
            @company_id,
            @user_id,
            @summary_text,
            @messages_json,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT(id) DO UPDATE SET
            company_id = excluded.company_id,
            user_id = excluded.user_id,
            summary_text = excluded.summary_text,
            messages_json = excluded.messages_json,
            updated_at = CURRENT_TIMESTAMP
    `).run({
        id: normalizedId,
        company_id: sanitizeAiChatMemoryText(companyId),
        user_id: sanitizeAiChatMemoryText(userId),
        summary_text: normalizedSummary,
        messages_json: payload
    });

    return getAiChatMemory(normalizedId);
}

function getTenantDb(companyId = '') {
    const context = getCurrentContext();
    const targetCompanyId = companyId || context?.companyId || '';
    if (!targetCompanyId) {
        throw new Error('Tenant database requires a company context.');
    }

    const cacheKey = `tenant:${targetCompanyId}`;
    const db = openDb(cacheKey, getTenantSchema(targetCompanyId), initTenantSchema);
    ensureTenantSchemaColumns(db);
    return db;
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
    Database.closeAllConnections?.();
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
            login_background_path TEXT NOT NULL DEFAULT '',
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
            account_status TEXT NOT NULL DEFAULT 'active',
            suspended_on TEXT NOT NULL DEFAULT '',
            inactive_on TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            display_name TEXT NOT NULL DEFAULT '',
            profile_picture TEXT NOT NULL DEFAULT '',
            login_email TEXT NOT NULL DEFAULT '',
            login_email_verified INTEGER NOT NULL DEFAULT 0,
            google_email TEXT NOT NULL DEFAULT '',
            google_email_verified INTEGER NOT NULL DEFAULT 0,
            time_in TEXT NOT NULL DEFAULT '09:00',
            time_out TEXT NOT NULL DEFAULT '18:00',
            schedule_json TEXT NOT NULL DEFAULT '{}',
            feature_access_json TEXT NOT NULL DEFAULT '{}',
            assigned_task_id TEXT NOT NULL DEFAULT '',
            assigned_task_ids_json TEXT NOT NULL DEFAULT '[]',
            custom_assigned_tasks_json TEXT NOT NULL DEFAULT '[]',
            daily_salary REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS user_email_verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            company_id TEXT,
            email TEXT NOT NULL,
            purpose TEXT NOT NULL,
            code TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_user_email_verifications_user
        ON user_email_verifications (user_id, purpose, created_at);

        CREATE INDEX IF NOT EXISTS idx_user_email_verifications_email
        ON user_email_verifications (email);

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

        CREATE TABLE IF NOT EXISTS access_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            ip_address TEXT NOT NULL,
            user_agent TEXT NOT NULL,
            host TEXT NOT NULL,
            path TEXT NOT NULL,
            method TEXT NOT NULL,
            company_id TEXT,
            user_id TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_access_logs_created_at
        ON access_logs (created_at);

        CREATE INDEX IF NOT EXISTS idx_access_logs_device_id
        ON access_logs (device_id);


        CREATE TABLE IF NOT EXISTS ai_chat_memory (
            id TEXT PRIMARY KEY,
            company_id TEXT,
            user_id TEXT,
            summary_text TEXT NOT NULL DEFAULT '',
            messages_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS company_registration_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_code TEXT NOT NULL UNIQUE,
            client_name TEXT NOT NULL,
            contact_number TEXT NOT NULL,
            normalized_contact_number TEXT NOT NULL,
            request_details TEXT NOT NULL DEFAULT '',
            request_meta_json TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'open',
            allow_customer_edit INTEGER NOT NULL DEFAULT 1,
            source TEXT NOT NULL DEFAULT 'public_portal',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS company_registration_request_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            sender_type TEXT NOT NULL,
            sender_name TEXT NOT NULL DEFAULT '',
            message_text TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'public_portal',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_ai_chat_memory_updated
        ON ai_chat_memory (updated_at);

        CREATE INDEX IF NOT EXISTS idx_company_registration_requests_contact
        ON company_registration_requests (normalized_contact_number);

        CREATE INDEX IF NOT EXISTS idx_company_registration_requests_status_updated
        ON company_registration_requests (status, updated_at DESC, id DESC);

        CREATE UNIQUE INDEX IF NOT EXISTS idx_master_users_scope
        ON users (COALESCE(company_id, ''), username);

        CREATE INDEX IF NOT EXISTS idx_master_users_company_name
        ON users (company_id, display_name COLLATE NOCASE, username COLLATE NOCASE);
    `);

    ensureTableColumn(db, 'companies', 'db_schema', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'companies', 'login_background_path', "TEXT NOT NULL DEFAULT ''");
    db.prepare(`
        SELECT id
        FROM companies
        WHERE TRIM(COALESCE(db_schema, '')) = ''
    `).all().forEach((row) => {
        const companyId = normalizeText(row.id);
        if (!companyId) {
            return;
        }

        db.prepare(`
            UPDATE companies
            SET db_schema = ?
            WHERE id = ?
        `).run(buildTenantSchemaName(companyId), companyId);
    });
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
            remarks TEXT,
            task_id TEXT NOT NULL DEFAULT '',
            task_name TEXT NOT NULL DEFAULT '',
            task_count INTEGER NOT NULL DEFAULT 0,
            task_results_json TEXT NOT NULL DEFAULT '[]',
            timeout_issues TEXT NOT NULL DEFAULT '',
            timeout_remarks TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS task_definitions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_name TEXT NOT NULL UNIQUE,
            input_type TEXT NOT NULL DEFAULT 'numeric',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_task_definitions_active_name
        ON task_definitions (is_active, task_name);

        CREATE TABLE IF NOT EXISTS kpi_evaluation_settings (
            id TEXT PRIMARY KEY,
            frequency TEXT NOT NULL DEFAULT 'daily',
            custom_schedule_type TEXT NOT NULL DEFAULT 'interval',
            custom_interval_days INTEGER NOT NULL DEFAULT 15,
            custom_start_date TEXT NOT NULL DEFAULT '',
            custom_end_date TEXT NOT NULL DEFAULT '',
            mode TEXT NOT NULL DEFAULT 'required_all',
            comment_required_for_all_required_evaluations INTEGER NOT NULL DEFAULT 0,
            comment_required_for_issue_encounter_low_rating INTEGER NOT NULL DEFAULT 0,
            comment_required_for_all_issue_encounters INTEGER NOT NULL DEFAULT 0,
            allow_employee_view INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS kpi_evaluation_records (
            id TEXT PRIMARY KEY,
            submission_id TEXT NOT NULL,
            evaluator_employee_id TEXT NOT NULL,
            evaluator_name TEXT NOT NULL DEFAULT '',
            rated_employee_id TEXT NOT NULL,
            rated_employee_name TEXT NOT NULL DEFAULT '',
            rated_employee_role TEXT NOT NULL DEFAULT '',
            rating INTEGER NOT NULL,
            rating_label TEXT NOT NULL,
            comment TEXT NOT NULL DEFAULT '',
            evaluation_type TEXT NOT NULL,
            evaluation_frequency TEXT NOT NULL DEFAULT '',
            evaluation_period_start TEXT NOT NULL,
            evaluation_period_end TEXT NOT NULL,
            submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            visible_to_admin_only INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'submitted',
            reviewed_by_admin_id TEXT NOT NULL DEFAULT '',
            reviewed_at TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS kpi_evaluation_submissions (
            id TEXT PRIMARY KEY,
            evaluator_employee_id TEXT NOT NULL,
            evaluation_type TEXT NOT NULL,
            evaluation_period_start TEXT NOT NULL,
            evaluation_period_end TEXT NOT NULL,
            required_period_key TEXT UNIQUE,
            submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS kpi_evaluation_audit_logs (
            id TEXT PRIMARY KEY,
            record_id TEXT NOT NULL,
            actor_user_id TEXT NOT NULL,
            action TEXT NOT NULL,
            previous_status TEXT NOT NULL DEFAULT '',
            next_status TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS incident_reports (
            id TEXT PRIMARY KEY,
            incident_date TEXT NOT NULL,
            department TEXT NOT NULL DEFAULT '',
            reason_incident TEXT NOT NULL DEFAULT '',
            action_taken TEXT NOT NULL DEFAULT '',
            prepared_by TEXT NOT NULL DEFAULT '',
            checked_by TEXT NOT NULL DEFAULT '',
            date_checked TEXT NOT NULL DEFAULT '',
            resolved INTEGER NOT NULL DEFAULT 0,
            assigned_employee_id TEXT NOT NULL DEFAULT '',
            assigned_employee_name TEXT NOT NULL DEFAULT '',
            created_by_user_id TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            resolved_at TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS attendance_corrections (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            attendance_id INTEGER,
            correction_id TEXT NOT NULL,
            user_id TEXT NOT NULL DEFAULT '',
            requested_date TEXT NOT NULL DEFAULT '',
            requested_type TEXT NOT NULL,
            requested_scanned_at TEXT NOT NULL,
            reason TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT 'device',
            requested_by TEXT NOT NULL DEFAULT '',
            requested_by_device_id TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            reviewed_by_user_id TEXT NOT NULL DEFAULT '',
            reviewed_at TEXT NOT NULL DEFAULT '',
            rejection_reason TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(company_id, correction_id)
        );

        CREATE TABLE IF NOT EXISTS attendance_audit_logs (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            attendance_id INTEGER,
            correction_id TEXT NOT NULL DEFAULT '',
            action TEXT NOT NULL,
            old_value_json TEXT NOT NULL DEFAULT '{}',
            new_value_json TEXT NOT NULL DEFAULT '{}',
            reason TEXT NOT NULL DEFAULT '',
            actor_type TEXT NOT NULL DEFAULT '',
            actor_id TEXT NOT NULL DEFAULT '',
            device_id TEXT NOT NULL DEFAULT '',
            ip_address TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            contact_number TEXT NOT NULL,
            normalized_contact_number TEXT NOT NULL UNIQUE,
            address TEXT NOT NULL DEFAULT '',
            client_type TEXT NOT NULL DEFAULT 'regular',
            source TEXT NOT NULL DEFAULT 'manual',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_clients_name_contact
        ON clients(name COLLATE NOCASE, contact_number);

        CREATE TABLE IF NOT EXISTS customer_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_code TEXT NOT NULL UNIQUE,
            client_id INTEGER,
            client_name TEXT NOT NULL,
            contact_number TEXT NOT NULL,
            normalized_contact_number TEXT NOT NULL,
            request_details TEXT NOT NULL DEFAULT '',
            request_meta_json TEXT NOT NULL DEFAULT '{}',
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
            cost_price REAL NOT NULL DEFAULT 0,
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
            expiration_date TEXT,
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
            underpayment_amount REAL NOT NULL DEFAULT 0,
            inventory_deducted INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS customer_credit_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_name TEXT NOT NULL DEFAULT '',
            normalized_client_name TEXT NOT NULL DEFAULT '',
            client_contact TEXT NOT NULL DEFAULT '',
            normalized_contact_number TEXT NOT NULL DEFAULT '',
            client_address TEXT NOT NULL DEFAULT '',
            normalized_client_address TEXT NOT NULL DEFAULT '',
            client_lookup_type TEXT NOT NULL DEFAULT '',
            client_lookup_key TEXT NOT NULL DEFAULT '',
            entry_type TEXT NOT NULL DEFAULT 'credit',
            amount REAL NOT NULL DEFAULT 0,
            related_order_number TEXT NOT NULL DEFAULT '',
            related_receipt_number TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
            payment_method TEXT NOT NULL DEFAULT '',
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
            payment_method TEXT NOT NULL DEFAULT '',
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
    `);

    ensureTableColumn(db, 'invoice_templates', 'signature_path', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'invoice_templates', 'receipt_title', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'invoice_templates', 'receipt_subtitle', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'invoice_templates', 'receipt_meta_layout', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'invoice_templates', 'receipt_totals_layout', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'clients', 'client_type', "TEXT NOT NULL DEFAULT 'regular'");
    ensureTableColumn(db, 'inventory_levels', 'expiration_date', 'TEXT');
    ensureTableColumn(db, 'sales_entries', 'applied_credit_amount', 'REAL NOT NULL DEFAULT 0');
    ensureTableColumn(db, 'sales_entries', 'inventory_deducted', 'INTEGER NOT NULL DEFAULT 1');
    ensureTableColumn(db, 'expense_entries', 'payment_method', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'cash_income_entries', 'payment_method', "TEXT NOT NULL DEFAULT ''");
    ensureTenantSchemaColumns(db);
    db.prepare(`
        UPDATE clients
        SET client_type = 'regular'
        WHERE TRIM(COALESCE(client_type, '')) = ''
    `).run();

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_customer_requests_contact
        ON customer_requests (normalized_contact_number);

        CREATE INDEX IF NOT EXISTS idx_customer_requests_status_updated
        ON customer_requests (status, updated_at DESC, id DESC);

        CREATE INDEX IF NOT EXISTS idx_customer_request_messages_request
        ON customer_request_messages (request_id, created_at, id);

        CREATE INDEX IF NOT EXISTS idx_attendance_user_date
        ON attendance (id, date);

        CREATE INDEX IF NOT EXISTS idx_attendance_date_user
        ON attendance (date, id);

        CREATE INDEX IF NOT EXISTS idx_attendance_updated_at
        ON attendance (updated_at, date, id);

        CREATE INDEX IF NOT EXISTS idx_attendance_corrections_attendance
        ON attendance_corrections (company_id, attendance_id);

        CREATE INDEX IF NOT EXISTS idx_attendance_corrections_status_updated
        ON attendance_corrections (company_id, status, updated_at);

        CREATE INDEX IF NOT EXISTS idx_attendance_corrections_updated
        ON attendance_corrections (company_id, updated_at);

        CREATE INDEX IF NOT EXISTS idx_attendance_audit_attendance
        ON attendance_audit_logs (company_id, attendance_id, created_at);

        CREATE INDEX IF NOT EXISTS idx_attendance_audit_correction
        ON attendance_audit_logs (company_id, correction_id, created_at);

        CREATE INDEX IF NOT EXISTS idx_inventory_variants_product_name
        ON inventory_variants (product_name);

        CREATE INDEX IF NOT EXISTS idx_inventory_variants_set_name
        ON inventory_variants (set_name);

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

        CREATE INDEX IF NOT EXISTS idx_sales_entries_order_number
        ON sales_entries (order_number);

        CREATE INDEX IF NOT EXISTS idx_sales_entries_cash_branch
        ON sales_entries (cash_branch);

        CREATE INDEX IF NOT EXISTS idx_customer_credit_ledger_lookup
        ON customer_credit_ledger (client_lookup_type, client_lookup_key, created_at);

        CREATE INDEX IF NOT EXISTS idx_customer_credit_ledger_order_lookup
        ON customer_credit_ledger (related_order_number, related_receipt_number, created_at);

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

function normalizePhoneNumber(value = '') {
    return String(value || '')
        .trim()
        .replace(/[^\d+]/g, '');
}

function sanitizeCustomerServiceContacts(values = [], { type = 'email' } = {}) {
    const normalizedValues = Array.isArray(values) ? values : [values];
    const seen = new Set();

    return normalizedValues.reduce((list, value) => {
        const normalized = type === 'phone'
            ? normalizePhoneNumber(value)
            : normalizeEmail(value);

        if (!normalized) {
            return list;
        }

        if (type === 'email' && !isValidEmail(normalized)) {
            return list;
        }

        if (type === 'phone' && normalized.replace(/\D/g, '').length < 7) {
            return list;
        }

        const key = normalized.toLowerCase();
        if (seen.has(key)) {
            return list;
        }

        seen.add(key);
        list.push(normalized);
        return list;
    }, []);
}

function sanitizeCustomerServiceConfig(payload = {}) {
    const source = (payload && typeof payload === 'object' && !Array.isArray(payload))
        ? payload
        : {};
    const fallback = DEFAULT_CUSTOMER_SERVICE_CONFIG;
    const handoffMessage = normalizeText(source.handoff_message || source.handoffMessage || fallback.handoff_message)
        || fallback.handoff_message;
    const emails = sanitizeCustomerServiceContacts(source.emails || fallback.emails, { type: 'email' });
    const phones = sanitizeCustomerServiceContacts(source.phones || fallback.phones, { type: 'phone' });
    const companyRegistrationPayment = sanitizeCompanyRegistrationPaymentConfig(
        source.company_registration_payment
        || source.companyRegistrationPayment
        || fallback.company_registration_payment
    );

    return {
        handoff_message: handoffMessage,
        emails: emails.length ? emails : [...fallback.emails],
        phones: phones.length ? phones : [...fallback.phones],
        company_registration_payment: companyRegistrationPayment
    };
}

function sanitizeCompanyRegistrationPaymentConfig(payload = {}) {
    const source = (payload && typeof payload === 'object' && !Array.isArray(payload))
        ? payload
        : {};
    const fallback = DEFAULT_CUSTOMER_SERVICE_CONFIG.company_registration_payment;
    const methodsSource = (source.methods && typeof source.methods === 'object' && !Array.isArray(source.methods))
        ? source.methods
        : {};
    const methods = COMPANY_REGISTRATION_PAYMENT_METHOD_KEYS.reduce((result, methodKey) => {
        result[methodKey] = sanitizeCompanyRegistrationPaymentMethodConfig(
            methodKey,
            methodsSource[methodKey] ?? source[methodKey]
        );
        return result;
    }, {});

    return {
        notice: normalizeMultilineText(source.notice || source.message || fallback.notice, 600) || fallback.notice,
        methods
    };
}

function sanitizeCompanyRegistrationPaymentMethodConfig(methodKey, payload = {}) {
    const resolvedMethodKey = COMPANY_REGISTRATION_PAYMENT_METHOD_KEYS.includes(methodKey)
        ? methodKey
        : 'other_bank';
    const fallback = DEFAULT_CUSTOMER_SERVICE_CONFIG.company_registration_payment.methods[resolvedMethodKey]
        || DEFAULT_CUSTOMER_SERVICE_CONFIG.company_registration_payment.methods.other_bank;
    const source = (payload && typeof payload === 'object' && !Array.isArray(payload))
        ? payload
        : {};

    return {
        label: normalizeText(source.label || source.name || fallback.label) || fallback.label,
        account_name: normalizeText(source.account_name || source.accountName || fallback.account_name).slice(0, 160),
        account_number: normalizeText(source.account_number || source.accountNumber || fallback.account_number).slice(0, 160),
        qr_text: normalizeMultilineText(source.qr_text || source.qrText || fallback.qr_text, 2000),
        instructions: normalizeMultilineText(source.instructions || source.note || fallback.instructions, 1200)
    };
}

function getCustomerServiceConfig() {
    ensureSystemReady();
    const rawValue = getSystemMeta(CUSTOMER_SERVICE_META_KEY);
    if (!rawValue) {
        return sanitizeCustomerServiceConfig(DEFAULT_CUSTOMER_SERVICE_CONFIG);
    }

    try {
        return sanitizeCustomerServiceConfig(JSON.parse(rawValue));
    } catch (_error) {
        return sanitizeCustomerServiceConfig(DEFAULT_CUSTOMER_SERVICE_CONFIG);
    }
}

function updateCustomerServiceConfig(payload = {}) {
    ensureSystemReady();
    const nextConfig = sanitizeCustomerServiceConfig(payload);
    setSystemMeta(CUSTOMER_SERVICE_META_KEY, JSON.stringify(nextConfig));
    logAudit('customer_service.config_update', 'system', CUSTOMER_SERVICE_META_KEY, {
        email_count: nextConfig.emails.length,
        phone_count: nextConfig.phones.length,
        payment_method_count: Object.keys(nextConfig.company_registration_payment?.methods || {}).length
    });
    return nextConfig;
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

        return `${parts.hour}:${parts.minute}`;
    }

    const text = String(value).trim();
    const parsedParts = parseTimeToParts(text);
    if (parsedParts) {
        return `${pad(parsedParts.hours)}:${pad(parsedParts.minutes)}`;
    }

    const parsedDate = new Date(text);
    if (!Number.isNaN(parsedDate.getTime())) {
        const parts = getZonedDateTimeParts(parsedDate);
        if (!parts?.hour || !parts.minute) {
            return text;
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

const DEFAULT_ATTENDANCE_POLICY = Object.freeze({
    dailyTargetHours: 9,
    overtimeThresholdHours: 1,
    countFromScheduledStart: false,
    lunchBreakStartMinutes: null,
    lunchBreakEndMinutes: null
});
const GMS_GWD_ATTENDANCE_POLICY = Object.freeze({
    dailyTargetHours: 8,
    overtimeThresholdHours: 1,
    countFromScheduledStart: true,
    lunchBreakStartMinutes: 12 * 60,
    lunchBreakEndMinutes: 13 * 60
});
const PAYROLL_REQUIRED_HOURS = 8;
const PAYROLL_REQUIRED_MINUTES = PAYROLL_REQUIRED_HOURS * 60;

function resolveAttendancePolicy({ company = null, companyId = '', user = null } = {}) {
    const context = getCurrentContext();
    const resolvedCompany = company
        || context?.company
        || (companyId ? getCompanyById(companyId) : null)
        || (user?.company_id ? getCompanyById(user.company_id) : null);
    const companyCode = normalizeCompanyCode(resolvedCompany?.company_code || '');
    return companyCode === 'gms'
        ? GMS_GWD_ATTENDANCE_POLICY
        : DEFAULT_ATTENDANCE_POLICY;
}

function calculateAttendanceTimeMetrics(timeIn = '', timeOut = '', options = {}) {
    const normalizedTimeIn = formatTimeValue(timeIn);
    const normalizedTimeOut = formatTimeValue(timeOut);
    const timeInMinutes = parseTimeToMinutes(normalizedTimeIn);
    const timeOutMinutes = parseTimeToMinutes(normalizedTimeOut);
    const attendancePolicy = resolveAttendancePolicy(options);
    if (timeInMinutes === null || timeOutMinutes === null || timeOutMinutes < timeInMinutes) {
        return {
            isComplete: false,
            totalSpanMinutes: 0,
            lunchBreakMinutes: 0,
            workedMinutes: 0
        };
    }

    const totalSpanMinutes = Math.max(0, timeOutMinutes - timeInMinutes);
    const lunchBreakMinutes = calculateBreakMinutesForRange(timeInMinutes, timeOutMinutes, attendancePolicy);
    const workedMinutes = Math.max(0, totalSpanMinutes - lunchBreakMinutes);
    return {
        isComplete: true,
        totalSpanMinutes,
        lunchBreakMinutes,
        workedMinutes
    };
}

function calculateWorkedMinutes(timeIn, timeOut, scheduledTimeIn = '', scheduledTimeOut = '', options = {}) {
    const metrics = calculateAttendanceTimeMetrics(timeIn, timeOut, options);
    return metrics.isComplete ? metrics.workedMinutes : null;
}

function calculateAttendancePayrollSnapshot({
    timeIn = '',
    timeOut = '',
    scheduledTimeIn = '',
    scheduledTimeOut = '',
    dailyRate = 0,
    requiredMinutes = PAYROLL_REQUIRED_MINUTES,
    options = {}
} = {}) {
    const normalizedRequiredMinutes = Number.isFinite(Number(requiredMinutes))
        ? Math.max(0, Math.round(Number(requiredMinutes)))
        : PAYROLL_REQUIRED_MINUTES;
    const timeMetrics = calculateAttendanceTimeMetrics(timeIn, timeOut, options);
    const normalizedDailyRate = coerceDailySalaryValue(dailyRate);
    const lateDeductionMinutes = calculateLateDeductionMinutes(timeIn, scheduledTimeIn, scheduledTimeOut, options);
    const earlyOutDeductionMinutes = calculateEarlyOutDeductionMinutes(timeOut, scheduledTimeIn, scheduledTimeOut, options);
    const totalDeductionMinutes = lateDeductionMinutes + earlyOutDeductionMinutes;
    const hourlyRate = normalizedDailyRate / PAYROLL_REQUIRED_HOURS;
    const payableMinutes = Math.max(0, normalizedRequiredMinutes - totalDeductionMinutes);
    const uncappedDeductionAmount = (totalDeductionMinutes / 60) * hourlyRate;
    const finalPay = roundCurrencyAmount(Math.max(0, normalizedDailyRate - uncappedDeductionAmount));
    const deductionAmount = roundCurrencyAmount(Math.max(0, normalizedDailyRate - finalPay));

    return {
        ...timeMetrics,
        requiredMinutes: normalizedRequiredMinutes,
        shortMinutes: Math.max(0, normalizedRequiredMinutes - timeMetrics.workedMinutes),
        payableMinutes,
        dailyRate: normalizedDailyRate,
        lateDeductionMinutes,
        earlyOutDeductionMinutes,
        totalDeductionMinutes,
        hourlyRate: roundCurrencyAmount(hourlyRate),
        deductionAmount,
        finalPay
    };
}

function calculateWorkedHours(timeIn, timeOut, scheduledTimeIn = '', scheduledTimeOut = '', options = {}) {
    const workedMinutes = calculateWorkedMinutes(timeIn, timeOut, scheduledTimeIn, scheduledTimeOut, options);
    if (workedMinutes === null) {
        return '';
    }

    return (workedMinutes / 60).toFixed(2);
}

function getLateGraceMinutes(_options = {}) {
    return 0;
}

function calculateScheduledLateMinutes(timeIn, scheduledTimeIn) {
    const timeInMinutes = parseTimeToMinutes(timeIn);
    const scheduledMinutes = parseTimeToMinutes(scheduledTimeIn);
    if (timeInMinutes === null || scheduledMinutes === null) {
        return 0;
    }

    return Math.max(0, timeInMinutes - scheduledMinutes);
}

function calculateLateMinutes(timeIn, scheduledTimeIn, options = {}) {
    return Math.max(0, calculateScheduledLateMinutes(timeIn, scheduledTimeIn) - getLateGraceMinutes(options));
}

function buildClockAttendanceRemark(timeIn, scheduledTimeIn, options = {}) {
    if (!formatTimeValue(timeIn)) {
        return '';
    }

    return calculateLateMinutes(timeIn, scheduledTimeIn, options) > 0 ? 'Late' : 'On Time';
}

function buildAttendanceDisplayRemark(rawRemarks = '', timeIn = '', scheduledTimeIn = '', options = {}) {
    const normalizedRemarks = normalizeText(rawRemarks);
    if (!normalizedRemarks) {
        return '';
    }

    const loweredRemarks = normalizedRemarks.toLowerCase();
    if (
        ['on time', 'late', 'present'].includes(loweredRemarks)
        || loweredRemarks === 'grace period'
        || loweredRemarks.startsWith('grace period (')
    ) {
        return calculateLateMinutes(timeIn, scheduledTimeIn, options) > 0 ? 'Late' : 'On Time';
    }

    return normalizedRemarks;
}

function calculateRangeOverlapMinutes(startMinutes, endMinutes, rangeStartMinutes, rangeEndMinutes) {
    if (
        !Number.isFinite(startMinutes)
        || !Number.isFinite(endMinutes)
        || !Number.isFinite(rangeStartMinutes)
        || !Number.isFinite(rangeEndMinutes)
    ) {
        return 0;
    }

    if (endMinutes <= startMinutes || rangeEndMinutes <= rangeStartMinutes) {
        return 0;
    }

    return Math.max(0, Math.min(endMinutes, rangeEndMinutes) - Math.max(startMinutes, rangeStartMinutes));
}

function getAttendancePolicyBreakWindows(attendancePolicy = DEFAULT_ATTENDANCE_POLICY) {
    const lunchBreakStartMinutes = Number.isFinite(attendancePolicy?.lunchBreakStartMinutes)
        ? attendancePolicy.lunchBreakStartMinutes
        : null;
    const lunchBreakEndMinutes = Number.isFinite(attendancePolicy?.lunchBreakEndMinutes)
        ? attendancePolicy.lunchBreakEndMinutes
        : null;
    if (lunchBreakStartMinutes === null || lunchBreakEndMinutes === null || lunchBreakEndMinutes <= lunchBreakStartMinutes) {
        return [];
    }

    return [{
        startMinutes: lunchBreakStartMinutes,
        endMinutes: lunchBreakEndMinutes
    }];
}

function calculateBreakMinutesForRange(startMinutes, endMinutes, attendancePolicy = DEFAULT_ATTENDANCE_POLICY) {
    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
        return 0;
    }

    return getAttendancePolicyBreakWindows(attendancePolicy).reduce((sum, breakWindow) => (
        sum + calculateRangeOverlapMinutes(
            startMinutes,
            endMinutes,
            breakWindow.startMinutes,
            breakWindow.endMinutes
        )
    ), 0);
}

function calculatePaidMinutesForRange(startMinutes, endMinutes, attendancePolicy = DEFAULT_ATTENDANCE_POLICY) {
    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
        return 0;
    }

    const totalMinutes = endMinutes - startMinutes;
    const unpaidBreakMinutes = calculateBreakMinutesForRange(startMinutes, endMinutes, attendancePolicy);

    return Math.max(0, totalMinutes - unpaidBreakMinutes);
}

function calculateScheduledPaidMinutes(scheduledTimeIn, scheduledTimeOut, options = {}) {
    const scheduledStartMinutes = parseTimeToMinutes(scheduledTimeIn);
    const scheduledEndMinutes = parseTimeToMinutes(scheduledTimeOut);
    if (scheduledStartMinutes === null || scheduledEndMinutes === null || scheduledEndMinutes <= scheduledStartMinutes) {
        return 0;
    }

    return calculatePaidMinutesForRange(
        scheduledStartMinutes,
        scheduledEndMinutes,
        resolveAttendancePolicy(options)
    );
}

function calculateLateDeductionMinutes(timeIn, scheduledTimeIn, scheduledTimeOut, options = {}) {
    const actualTimeInMinutes = parseTimeToMinutes(timeIn);
    const scheduledStartMinutes = parseTimeToMinutes(scheduledTimeIn);
    const scheduledEndMinutes = parseTimeToMinutes(scheduledTimeOut);
    const lateStartMinutes = scheduledStartMinutes === null
        ? null
        : scheduledStartMinutes + getLateGraceMinutes(options);
    if (
        actualTimeInMinutes === null
        || lateStartMinutes === null
        || scheduledEndMinutes === null
        || scheduledEndMinutes <= lateStartMinutes
        || actualTimeInMinutes <= lateStartMinutes
    ) {
        return 0;
    }

    return calculatePaidMinutesForRange(
        lateStartMinutes,
        Math.min(actualTimeInMinutes, scheduledEndMinutes),
        resolveAttendancePolicy(options)
    );
}

function calculateEarlyOutDeductionMinutes(timeOut, scheduledTimeIn, scheduledTimeOut, options = {}) {
    const actualTimeOutMinutes = parseTimeToMinutes(timeOut);
    const scheduledStartMinutes = parseTimeToMinutes(scheduledTimeIn);
    const scheduledEndMinutes = parseTimeToMinutes(scheduledTimeOut);
    if (
        actualTimeOutMinutes === null
        || scheduledStartMinutes === null
        || scheduledEndMinutes === null
        || scheduledEndMinutes <= scheduledStartMinutes
        || actualTimeOutMinutes >= scheduledEndMinutes
    ) {
        return 0;
    }

    return calculatePaidMinutesForRange(
        Math.max(actualTimeOutMinutes, scheduledStartMinutes),
        scheduledEndMinutes,
        resolveAttendancePolicy(options)
    );
}

function buildAttendancePayrollMetadata({
    timeIn = '',
    timeOut = '',
    scheduledTimeIn = '',
    scheduledTimeOut = '',
    options = {}
} = {}) {
    const normalizedTimeIn = formatTimeValue(timeIn);
    const normalizedTimeOut = formatTimeValue(timeOut);
    const hasTimeIn = Boolean(normalizedTimeIn);
    const hasTimeOut = Boolean(normalizedTimeOut);
    const payrollSnapshot = calculateAttendancePayrollSnapshot({
        timeIn: normalizedTimeIn,
        timeOut: normalizedTimeOut,
        scheduledTimeIn,
        scheduledTimeOut,
        options
    });

    return {
        scheduledPaidMinutes: calculateScheduledPaidMinutes(scheduledTimeIn, scheduledTimeOut, options),
        lateDeductionMinutes: payrollSnapshot.lateDeductionMinutes,
        earlyOutDeductionMinutes: payrollSnapshot.earlyOutDeductionMinutes,
        totalDeductionMinutes: payrollSnapshot.totalDeductionMinutes,
        isPendingTimeout: hasTimeIn && !hasTimeOut,
        totalSpanMinutes: payrollSnapshot.totalSpanMinutes,
        lunchBreakMinutes: payrollSnapshot.lunchBreakMinutes,
        workedMinutes: payrollSnapshot.workedMinutes,
        requiredMinutes: payrollSnapshot.requiredMinutes,
        shortMinutes: payrollSnapshot.shortMinutes
    };
}

function roundCurrencyAmount(value = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return 0;
    }

    return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function coerceDailySalaryValue(value = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0;
    }

    return roundCurrencyAmount(parsed);
}

function normalizeDailySalaryValue(value, { required = false } = {}) {
    if (value === undefined) {
        if (required) {
            throw new Error('Daily salary is required.');
        }
        return undefined;
    }

    if (value === null) {
        throw new Error('Daily salary must be a non-negative number.');
    }

    if (typeof value === 'string' && !value.trim()) {
        throw new Error('Daily salary must be a non-negative number.');
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error('Daily salary must be a non-negative number.');
    }

    return roundCurrencyAmount(parsed);
}

function getUserSuspendedOn(user) {
    const normalized = String(user?.suspended_on || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function getUserInactiveOn(user) {
    const normalized = String(user?.inactive_on || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function normalizeUserAccountStatusValue(value = '') {
    return String(value || '').trim().toLowerCase();
}

function getUserAccountStatus(user) {
    if (!user || typeof user !== 'object') {
        return USER_ACCOUNT_STATUS_ACTIVE;
    }

    const normalized = normalizeUserAccountStatusValue(user.account_status);
    if (USER_ACCOUNT_STATUSES.has(normalized)) {
        return normalized;
    }

    return user.is_active === false || Number(user.is_active || 0) === 0
        ? USER_ACCOUNT_STATUS_SUSPENDED
        : USER_ACCOUNT_STATUS_ACTIVE;
}

function resolveUserAccountStatusPayload(payload = {}, currentStatus = USER_ACCOUNT_STATUS_ACTIVE) {
    const hasAccountStatusOverride = Object.prototype.hasOwnProperty.call(payload, 'account_status')
        || Object.prototype.hasOwnProperty.call(payload, 'accountStatus');
    if (hasAccountStatusOverride) {
        const requestedStatusValue = payload.account_status ?? payload.accountStatus;
        if (requestedStatusValue === undefined) {
            return currentStatus;
        }
        const requestedStatus = normalizeUserAccountStatusValue(requestedStatusValue);
        if (USER_ACCOUNT_STATUSES.has(requestedStatus)) {
            return requestedStatus;
        }
    }

    const hasActiveOverride = Object.prototype.hasOwnProperty.call(payload, 'is_active')
        || Object.prototype.hasOwnProperty.call(payload, 'isActive');
    if (!hasActiveOverride || (payload.is_active ?? payload.isActive) === undefined) {
        return currentStatus;
    }

    const nextIsActive = Boolean(payload.is_active ?? payload.isActive);
    if (nextIsActive) {
        return USER_ACCOUNT_STATUS_ACTIVE;
    }

    return currentStatus !== USER_ACCOUNT_STATUS_ACTIVE
        ? currentStatus
        : USER_ACCOUNT_STATUS_SUSPENDED;
}

function isSuspendedAttendanceUser(user, dateKey = getDateKey()) {
    if (!user || getUserAccountStatus(user) !== USER_ACCOUNT_STATUS_SUSPENDED) {
        return false;
    }

    const suspendedOn = getUserSuspendedOn(user) || getDateKey();
    const targetDateKey = String(dateKey || getDateKey()).trim() || getDateKey();
    return targetDateKey >= suspendedOn;
}

function isInactiveAttendanceUser(user, dateKey = getDateKey()) {
    if (!user || getUserAccountStatus(user) !== USER_ACCOUNT_STATUS_INACTIVE) {
        return false;
    }

    const inactiveOn = getUserInactiveOn(user) || getDateKey();
    const targetDateKey = String(dateKey || getDateKey()).trim() || getDateKey();
    return targetDateKey >= inactiveOn;
}

function getAttendanceAccountStatusForDate(user, dateKey = getDateKey()) {
    const accountStatus = getUserAccountStatus(user);
    if (isSuspendedAttendanceUser(user, dateKey)) {
        return USER_ACCOUNT_STATUS_SUSPENDED;
    }
    if (accountStatus === USER_ACCOUNT_STATUS_SUSPENDED) {
        return USER_ACCOUNT_STATUS_ACTIVE;
    }
    if (isInactiveAttendanceUser(user, dateKey)) {
        return USER_ACCOUNT_STATUS_INACTIVE;
    }
    if (accountStatus === USER_ACCOUNT_STATUS_INACTIVE) {
        return USER_ACCOUNT_STATUS_ACTIVE;
    }
    if (accountStatus !== USER_ACCOUNT_STATUS_ACTIVE) {
        return accountStatus;
    }
    return USER_ACCOUNT_STATUS_ACTIVE;
}

function getAttendanceAccountStatusLabel(user, dateKey = getDateKey()) {
    const accountStatus = getAttendanceAccountStatusForDate(user, dateKey);
    if (accountStatus === USER_ACCOUNT_STATUS_SUSPENDED) {
        return 'Suspended';
    }
    if (accountStatus === USER_ACCOUNT_STATUS_INACTIVE) {
        return 'Inactive';
    }
    if (accountStatus === USER_ACCOUNT_STATUS_RESIGNED) {
        return 'Resigned';
    }
    if (accountStatus === USER_ACCOUNT_STATUS_BANNED) {
        return 'Banned';
    }
    if (accountStatus === USER_ACCOUNT_STATUS_TERMINATED) {
        return 'Terminated';
    }
    return '';
}

function assertAttendanceAccountAvailable(user, dateKey = getDateKey(), action = 'recording attendance') {
    const accountStatus = getAttendanceAccountStatusForDate(user, dateKey);
    if (accountStatus === USER_ACCOUNT_STATUS_SUSPENDED) {
        throw new Error(`This account is suspended. Reactivate it before ${action}.`);
    }
    if (accountStatus === USER_ACCOUNT_STATUS_INACTIVE) {
        throw new Error(`This account is inactive. Reactivate it before ${action}.`);
    }
    if (accountStatus !== USER_ACCOUNT_STATUS_ACTIVE) {
        throw new Error(`This account is ${accountStatus}. Reactivate it before ${action}.`);
    }
}

function materializeSuspendedAttendanceHistory(user, {
    fromDateKey = '',
    untilDateKeyExclusive = '',
    branchId = ''
} = {}) {
    const suspendedOn = normalizeDateKey(fromDateKey, getUserSuspendedOn(user));
    const endDateKeyExclusive = normalizeDateKey(untilDateKeyExclusive, getDateKey());
    if (!user || !suspendedOn || !endDateKeyExclusive || suspendedOn >= endDateKeyExclusive) {
        return 0;
    }

    const startDate = parseDateValue(suspendedOn);
    const endDate = parseDateValue(endDateKeyExclusive);
    if (!startDate || !endDate) {
        return 0;
    }

    const db = getTenantDb();
    const existingRows = db.prepare(`
        SELECT rowid AS row_id, date, time_in, time_out
        FROM attendance
        WHERE id = ?
          AND date >= ?
          AND date < ?
    `).all(user.id, suspendedOn, endDateKeyExclusive);
    const existingMap = new Map(existingRows.map((row) => [String(row.date), row]));
    const displayName = normalizeText(user.display_name || user.name || user.username) || user.username;
    const resolvedBranchId = normalizeText(branchId || user.branch_id || '');
    const insertRow = db.prepare(`
        INSERT INTO attendance (id, branch_id, name, date, time_in, time_out, worked_hours, remarks, created_at, updated_at)
        VALUES (?, ?, ?, ?, '', '', '0.00', 'Suspended', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    const updateRow = db.prepare(`
        UPDATE attendance
        SET branch_id = ?,
            name = ?,
            time_in = '',
            time_out = '',
            worked_hours = '0.00',
            remarks = 'Suspended',
            updated_at = CURRENT_TIMESTAMP
        WHERE rowid = ?
    `);

    let changedCount = 0;
    for (const cursor = new Date(startDate.getTime()); getDateKey(cursor) < endDateKeyExclusive; cursor.setDate(cursor.getDate() + 1)) {
        const dateKey = getDateKey(cursor);
        const existing = existingMap.get(dateKey);
        if (existing && (String(existing.time_in || '').trim() || String(existing.time_out || '').trim())) {
            continue;
        }

        if (existing) {
            updateRow.run(resolvedBranchId || null, displayName, existing.row_id);
        } else {
            insertRow.run(user.id, resolvedBranchId || null, displayName, dateKey);
        }
        changedCount += 1;
    }

    return changedCount;
}

function normalizeStatus(remarks, lateMinutes, hasTimeIn) {
    const text = normalizeText(remarks);
    const lowered = text.toLowerCase();

    if (text) {
        if (
            lowered === 'present'
            || lowered === 'on time'
            || lowered === 'late'
            || lowered === 'grace period'
            || lowered.startsWith('grace period (')
        ) {
            return lateMinutes > 0 ? 'Late' : 'On Time';
        }
        if (['absent', 'excuse', 'day off', 'suspended', 'inactive'].includes(lowered)) {
            return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
        }
        return text;
    }

    if (!hasTimeIn) {
        return 'Absent';
    }

    return lateMinutes > 0 ? 'Late' : 'On Time';
}

function syncAttendanceRowsForUser(user) {
    if (!user || !isEmployeeLikeRole(user.role)) {
        return 0;
    }

    const db = getTenantDb();
    const rows = db.prepare(`
        SELECT rowid AS row_id, branch_id, name, date, time_in, time_out, worked_hours, remarks
        FROM attendance
        WHERE id = ?
    `).all(user.id);
    if (!rows.length) {
        return 0;
    }

    const displayName = normalizeText(user.display_name || user.name || user.username) || user.username;
    const resolvedBranchId = normalizeText(user.branch_id || '');
    const updateRow = db.prepare(`
        UPDATE attendance
        SET branch_id = ?,
            name = ?,
            worked_hours = ?,
            remarks = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE rowid = ?
    `);

    let changedCount = 0;
    const transaction = db.transaction((entries) => {
        entries.forEach((row) => {
            const timeIn = formatTimeValue(row.time_in || '');
            const timeOut = formatTimeValue(row.time_out || '');
            const hasClockActivity = Boolean(timeIn || timeOut);
            const dateKey = getDateKey(row.date);
            const scheduleForDate = getUserScheduleForDate(user, row.date);
            const unavailableStatus = getAttendanceAccountStatusLabel(user, dateKey);
            const isUnavailableWithoutLogs = Boolean(unavailableStatus) && !hasClockActivity;
            const scheduledTimeIn = scheduleForDate.is_day_off || isUnavailableWithoutLogs
                ? ''
                : formatTimeValue(scheduleForDate.time_in || '');
            const scheduledTimeOut = scheduleForDate.is_day_off || isUnavailableWithoutLogs
                ? ''
                : formatTimeValue(scheduleForDate.time_out || '');

            let nextWorkedHours = String(row.worked_hours || '').trim();
            let nextRemarks = normalizeText(row.remarks);

            if (hasClockActivity) {
                const attendanceTimingOptions = { user, dateKey };
                const lateMinutes = calculateLateMinutes(timeIn, scheduledTimeIn, attendanceTimingOptions);
                nextWorkedHours = timeOut
                    ? (calculateWorkedHours(timeIn, timeOut, scheduledTimeIn, scheduledTimeOut, { user }) || '0.00')
                    : '';
                nextRemarks = buildClockAttendanceRemark(timeIn, scheduledTimeIn, attendanceTimingOptions)
                    || normalizeStatus(row.remarks, lateMinutes, Boolean(timeIn));
            } else if (isUnavailableWithoutLogs) {
                nextWorkedHours = '0.00';
                nextRemarks = unavailableStatus;
            }

            const currentBranchId = normalizeText(row.branch_id || '');
            const currentName = normalizeText(row.name);
            const currentWorkedHours = String(row.worked_hours || '').trim();
            const currentRemarks = normalizeText(row.remarks);
            if (
                currentBranchId === resolvedBranchId
                && currentName === displayName
                && currentWorkedHours === nextWorkedHours
                && currentRemarks === nextRemarks
            ) {
                return;
            }

            updateRow.run(
                resolvedBranchId || null,
                displayName,
                nextWorkedHours,
                nextRemarks,
                row.row_id
            );
            changedCount += 1;
        });
    });

    transaction(rows);
    return changedCount;
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
        lbc_tracking: Boolean(modules.sales && isGmsOrGwdCompanyCode(companyCode)),
        lbc_collection_confirmation: Boolean(modules.sales && isGmsOrGwdCompanyCode(companyCode)),
        sales_report: Boolean(modules.sales && modules.reports)
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

function clonePricelistConfigDefaults() {
    return JSON.parse(JSON.stringify(PRICELIST_CONFIG_DEFAULTS));
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

    const experience = (source.experience && typeof source.experience === 'object' && !Array.isArray(source.experience))
        ? source.experience
        : {};
    defaults.experience.mode = String(experience.mode || '').trim().toLowerCase() === 'attendance_only'
        ? 'attendance_only'
        : defaults.experience.mode;

    const labels = (source.labels && typeof source.labels === 'object' && !Array.isArray(source.labels))
        ? source.labels
        : {};
    Object.keys(defaults.labels).forEach((key) => {
        const candidate = normalizeText(labels[key]);
        if (candidate) {
            defaults.labels[key] = candidate;
        }
    });

    const shell = (source.shell && typeof source.shell === 'object' && !Array.isArray(source.shell))
        ? source.shell
        : {};
    const shellVariant = normalizeText(shell.variant).toLowerCase().replace(/[\s-]+/g, '_');
    if (shellVariant) {
        defaults.shell.variant = shellVariant;
    }
    defaults.shell.appShellName = normalizeText(shell.appShellName || shell.app_shell_name);
    defaults.shell.workspaceTag = normalizeText(shell.workspaceTag || shell.workspace_tag);
    defaults.shell.workspaceCopy = normalizeMultilineText(shell.workspaceCopy || shell.workspace_copy, 400);

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

function normalizePricelistProductKey(value = '') {
    return normalizeText(value).toLowerCase();
}

function parsePricelistLineLabels(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return Object.entries(value).reduce((labels, [rawKey, rawValue]) => {
        const normalizedKey = normalizeText(rawKey);
        const normalizedValue = normalizeText(rawValue);
        if (!normalizedKey || !normalizedValue) {
            return labels;
        }
        if (Object.keys(labels).length >= 30) {
            return labels;
        }
        labels[normalizedKey] = normalizedValue.slice(0, 40);
        return labels;
    }, {});
}

function parsePricelistProducts(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return Object.entries(value).reduce((products, [rawKey, rawProduct]) => {
        if (Object.keys(products).length >= 600) {
            return products;
        }

        const source = (rawProduct && typeof rawProduct === 'object' && !Array.isArray(rawProduct))
            ? rawProduct
            : {};
        const productName = normalizeText(source.product_name || source.productName || rawKey);
        const key = normalizePricelistProductKey(productName);

        if (!key) {
            return products;
        }

        const sortOrderValue = Number(source.sort_order ?? source.sortOrder ?? 0);
        products[key] = {
            product_name: productName,
            display_name: normalizeText(source.display_name || source.displayName || ''),
            category: normalizeText(source.category || ''),
            pack_label: normalizeText(source.pack_label || source.packLabel || ''),
            sort_order: Number.isFinite(sortOrderValue) ? Math.max(-9999, Math.min(9999, Math.round(sortOrderValue))) : 0,
            hidden: normalizeBooleanValue(source.hidden ?? source.isHidden ?? false),
            line_labels: parsePricelistLineLabels(source.line_labels || source.lineLabels || {})
        };
        return products;
    }, {});
}

function parsePricelistConfig(value = null) {
    let parsed = null;

    if (value && typeof value === 'object' && !Buffer.isBuffer(value) && !Array.isArray(value)) {
        parsed = value;
    } else {
        const rawValue = String(value || '').trim();
        if (!rawValue) {
            return clonePricelistConfigDefaults();
        }

        try {
            parsed = JSON.parse(rawValue);
        } catch (_error) {
            return clonePricelistConfigDefaults();
        }
    }

    const source = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    const defaults = clonePricelistConfigDefaults();

    defaults.audience_label = normalizeText(source.audience_label || source.audienceLabel || defaults.audience_label) || defaults.audience_label;
    defaults.header_title = normalizeText(source.header_title || source.headerTitle || defaults.header_title) || defaults.header_title;
    defaults.intro_line = normalizeText(source.intro_line || source.introLine || defaults.intro_line) || defaults.intro_line;
    defaults.footer_note_primary = normalizeText(
        source.footer_note_primary || source.footerNotePrimary || defaults.footer_note_primary
    ) || defaults.footer_note_primary;
    defaults.footer_note_secondary = normalizeText(
        source.footer_note_secondary || source.footerNoteSecondary || defaults.footer_note_secondary
    ) || defaults.footer_note_secondary;
    defaults.poster_title = normalizeText(source.poster_title || source.posterTitle || defaults.poster_title) || defaults.poster_title;
    defaults.poster_subtitle = normalizeText(source.poster_subtitle || source.posterSubtitle || '');
    defaults.products = parsePricelistProducts(source.products);

    return defaults;
}

function isProtectedSkeletonCompanyCode(value = '') {
    const normalized = normalizeCompanyCode(value);
    return normalized === 'default'
        || normalized === 'gms'
        || normalized === 'gms-erp'
        || normalized === 'gmserp';
}

function buildRecommendedWorkspaceConfigForPlan(plan = {}, {
    companyName = '',
    companyCode = '',
    appName = ''
} = {}) {
    if (isProtectedSkeletonCompanyCode(companyCode)) {
        return null;
    }

    const defaults = cloneWorkspaceConfigDefaults();
    const modules = parseModules(plan?.modules_json || plan?.modules || {});
    const normalizedPlanId = normalizeIdentifier(plan?.id || plan?.name || '');
    const brandLabel = normalizeText(appName || companyName) || 'GMS ERP';
    const companyCodeLabel = normalizeText(companyCode).toUpperCase();

    defaults.menu.showInventoryLevels = Boolean(modules.inventory);
    defaults.menu.showInvoiceSummary = Boolean(modules.invoicing);
    defaults.salesReport.showCashBranchFilter = Boolean(modules.sales);
    defaults.salesReport.showPaymentFilter = Boolean(modules.sales || modules.invoicing);
    defaults.salesReport.showAdminFilter = true;
    defaults.salesReport.showSalesRepresentativeFilter = Boolean(modules.sales);

    if (
        normalizedPlanId === 'attendance_starter'
        || (modules.attendance && !modules.sales && !modules.inventory && !modules.invoicing)
    ) {
        defaults.experience.mode = 'attendance_only';
        defaults.shell.appShellName = `${brandLabel} Time Hub`;
        defaults.shell.workspaceTag = 'Attendance Workspace';
        defaults.shell.workspaceCopy = companyCodeLabel
            ? `Tenant code: ${companyCodeLabel}. Start with branches, users, schedules, and attendance policies. This workspace keeps timekeeping front and center for a smaller SaaS subscription.`
            : 'Start with branches, users, schedules, and attendance policies. This workspace keeps timekeeping front and center for a smaller SaaS subscription.';
        defaults.expenses.title = 'Expenses';
        defaults.expenses.copy = 'Track petty cash, reimbursements, or attendance-related operating costs in one place.';
        defaults.menu.showInventoryLevels = false;
        defaults.menu.showInvoiceSummary = false;
        defaults.salesReport.showCashBranchFilter = false;
        defaults.salesReport.showPaymentFilter = false;
        defaults.salesReport.showSalesRepresentativeFilter = false;
        return defaults;
    }

    if (
        normalizedPlanId === 'business_suite'
        || (modules.sales && modules.inventory && modules.invoicing && modules.ai_reader)
    ) {
        defaults.shell.appShellName = `${brandLabel} Business Hub`;
        defaults.shell.workspaceTag = 'Business Suite Workspace';
        defaults.shell.workspaceCopy = companyCodeLabel
            ? `Tenant code: ${companyCodeLabel}. This tenant starts with a fuller ERP skeleton for inventory, invoicing, reports, and optional AI-assisted workflows.`
            : 'This tenant starts with a fuller ERP skeleton for inventory, invoicing, reports, and optional AI-assisted workflows.';
        defaults.expenses.title = 'Operations Expenses';
        defaults.expenses.copy = 'Use this page for expense tracking, cash movement, and operational insights across the full workspace.';
        defaults.labels.salesReportTitle = 'Business Reports';
        defaults.labels.salesReportCopy = 'Use the report center for revenue, payment mix, admin accountability, and sales rep performance across the subscription lifecycle.';
        return defaults;
    }

    defaults.shell.appShellName = `${brandLabel} Ops Desk`;
    defaults.shell.workspaceTag = 'Sales Workspace';
    defaults.shell.workspaceCopy = companyCodeLabel
        ? `Tenant code: ${companyCodeLabel}. Set up pricing, inventory levels, order encoding, and payment methods first. This skeleton fits recurring SaaS tenants that need day-to-day sales operations.`
        : 'Set up pricing, inventory levels, order encoding, and payment methods first. This skeleton fits recurring SaaS tenants that need day-to-day sales operations.';
    defaults.expenses.title = 'Expenses';
    defaults.expenses.copy = 'Track cash outflow and operating expenses alongside daily sales movement.';
    defaults.labels.salesReportTitle = 'Sales Report';
    defaults.labels.salesReportCopy = 'Review branch, payment, admin, and sales rep performance with a layout built for monthly SaaS operations.';
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

function getScopedUserByLoginIdentifier(companyId, identifier) {
    ensureSystemReady();
    const normalized = normalizeText(identifier);
    if (!normalized) {
        return null;
    }
    return getMasterDb().prepare(`
        SELECT *
        FROM users
        WHERE COALESCE(company_id, '') = COALESCE(?, '')
          AND (
              LOWER(username) = LOWER(?)
              OR LOWER(COALESCE(login_email, '')) = LOWER(?)
              OR LOWER(COALESCE(google_email, '')) = LOWER(?)
          )
        LIMIT 1
    `).get(companyId || '', normalized, normalized, normalized);
}

function getScopedUserByLoginEmail(companyId, email) {
    ensureSystemReady();
    const normalized = normalizeEmail(email);
    if (!normalized) {
        return null;
    }
    return getMasterDb().prepare(`
        SELECT *
        FROM users
        WHERE COALESCE(company_id, '') = COALESCE(?, '')
          AND LOWER(COALESCE(login_email, '')) = LOWER(?)
        LIMIT 1
    `).get(companyId || '', normalized);
}

function getScopedUserByGoogleEmail(companyId, email) {
    ensureSystemReady();
    const normalized = normalizeEmail(email);
    if (!normalized) {
        return null;
    }
    return getMasterDb().prepare(`
        SELECT *
        FROM users
        WHERE COALESCE(company_id, '') = COALESCE(?, '')
          AND LOWER(COALESCE(google_email, '')) = LOWER(?)
        LIMIT 1
    `).get(companyId || '', normalized);
}

function findUserByLinkedEmail(companyId, email, excludeInternalId = '') {
    ensureSystemReady();
    const normalized = normalizeEmail(email);
    if (!normalized) {
        return null;
    }
    return getMasterDb().prepare(`
        SELECT *
        FROM users
        WHERE COALESCE(company_id, '') = COALESCE(?, '')
          AND id != COALESCE(?, '')
          AND (
              LOWER(username) = LOWER(?)
              OR LOWER(COALESCE(login_email, '')) = LOWER(?)
              OR LOWER(COALESCE(google_email, '')) = LOWER(?)
          )
        LIMIT 1
    `).get(companyId || '', excludeInternalId || '', normalized, normalized, normalized);
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
            CASE WHEN COALESCE(is_active, 0) = 1 THEN 0 ELSE 1 END,
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
    const globalAssignedTasks = user.company_id
        ? getTasksByIds(parseTaskIdList(user.assigned_task_ids_json || '[]', [user.assigned_task_id || '']), user.company_id)
        : [];
    const customAssignedTasks = parseCustomAssignedTasks(user.custom_assigned_tasks_json || '[]');
    const assignedTasks = [...globalAssignedTasks, ...customAssignedTasks];
    const assignedTask = assignedTasks[0] || null;
    const weeklySchedule = getUserWeeklySchedule(user);
    const dailySalary = coerceDailySalaryValue(user.daily_salary);
    const payload = {
        id: user.username,
        username: user.username,
        name: user.display_name || user.username,
        role: normalizeRole(user.role),
        branch_id: user.branch_id || '',
        branch_name: branch?.branch_name || '',
        profile_picture: user.profile_picture || '',
        login_email: user.login_email || '',
        login_email_verified: Boolean(Number(user.login_email_verified || 0)),
        google_email: user.google_email || '',
        google_email_verified: Boolean(Number(user.google_email_verified || 0)),
        time_in: formatTimeValue(user.time_in || '') || DEFAULT_EMPLOYEE_TIME_IN,
        time_out: formatTimeValue(user.time_out || '') || DEFAULT_EMPLOYEE_TIME_OUT,
        weekly_schedule: weeklySchedule,
        schedule_json: stringifyWeeklySchedule(weeklySchedule),
        feature_access: parseUserFeatureAccess(user.feature_access_json),
        assigned_task_ids: assignedTasks.map((task) => task.id),
        assigned_tasks: assignedTasks.map((task) => ({
            id: task.id,
            name: task.name,
            inputType: task.inputType,
            isCustom: Boolean(task.isCustom)
        })),
        assigned_task_id: assignedTask ? assignedTask.id : '',
        assigned_task_name: assignedTask ? assignedTask.name : '',
        assigned_task: assignedTask
            ? {
                id: assignedTask.id,
                name: assignedTask.name,
                inputType: assignedTask.inputType
            }
            : null,
        is_active: Boolean(Number(user.is_active || 0)),
        account_status: getUserAccountStatus(user),
        suspended_on: getUserSuspendedOn(user),
        inactive_on: getUserInactiveOn(user),
        company_id: user.company_id || '',
        daily_salary: dailySalary,
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

function listBranches({ limit = 500, offset = 0 } = {}) {
    const normalizedOffset = Math.max(0, Number(offset) || 0);
    const normalizedLimit = Math.min(2500, Math.max(1, Number(limit) || 500));
    const rows = getTenantDb().prepare(`
        SELECT id, branch_name, address, is_active
        FROM branches
        ORDER BY branch_name COLLATE NOCASE
        LIMIT ? OFFSET ?
    `).all(normalizedLimit, normalizedOffset);

    return rows.map((branch) => ({
        id: branch.id,
        branch_name: branch.branch_name,
        address: branch.address || '',
        is_active: Boolean(Number(branch.is_active || 0))
    }));
}

function serializeTask(row) {
    if (!row) {
        return null;
    }

    return {
        id: String(row.id || '').trim(),
        name: normalizeTaskName(row.task_name || ''),
        inputType: normalizeTaskInputType(row.input_type || row.inputType || ''),
        is_active: Boolean(Number(row.is_active || 0)),
        created_at: row.created_at || '',
        updated_at: row.updated_at || ''
    };
}

function parseTaskIdList(value, fallback = []) {
    const fallbackItems = Array.isArray(fallback) ? fallback : [fallback];
    let source = value;
    if (typeof source === 'string') {
        const text = source.trim();
        if (!text) {
            source = [];
        } else if (text.startsWith('[')) {
            try {
                source = JSON.parse(text);
            } catch (_error) {
                source = [];
            }
        } else {
            source = [text];
        }
    }

    if (!Array.isArray(source)) {
        source = [source];
    }

    const normalized = [...source, ...fallbackItems]
        .map((item) => normalizeTaskId(item))
        .filter(Boolean);

    return [...new Set(normalized)];
}

function normalizeAssignedTaskId(value = '') {
    return String(value ?? '').trim().slice(0, 100);
}

function parseCustomAssignedTasks(value = []) {
    let source = value;
    if (typeof source === 'string') {
        const text = source.trim();
        if (!text) {
            source = [];
        } else {
            try {
                source = JSON.parse(text);
            } catch (_error) {
                source = [];
            }
        }
    }
    if (!Array.isArray(source)) {
        return [];
    }

    const seen = new Set();
    return source.map((item) => {
        const name = normalizeTaskName(item?.name ?? item?.taskName ?? item?.task_name ?? '');
        const inputType = normalizeTaskInputType(item?.inputType ?? item?.input_type ?? '');
        const id = normalizeAssignedTaskId(item?.id || '');
        return { id, name, inputType, isCustom: true };
    }).filter((task) => {
        if (!task.id || !task.name || seen.has(task.id)) {
            return false;
        }
        seen.add(task.id);
        return true;
    });
}

function getTaskById(taskId = '', companyId = '') {
    const normalizedTaskId = normalizeTaskId(taskId);
    if (!normalizedTaskId) {
        return null;
    }

    const context = getCurrentContext();
    const targetCompanyId = companyId || context?.companyId || '';
    if (!targetCompanyId) {
        return null;
    }

    return serializeTask(getTenantDb(targetCompanyId).prepare(`
        SELECT id, task_name, input_type, is_active, created_at, updated_at
        FROM task_definitions
        WHERE id = ?
        LIMIT 1
    `).get(normalizedTaskId));
}

function getTasksByIds(taskIds = [], companyId = '') {
    const ids = parseTaskIdList(taskIds);
    if (!ids.length) {
        return [];
    }

    return ids
        .map((taskId) => getTaskById(taskId, companyId))
        .filter((task) => task?.is_active);
}

function normalizeTaskResultsPayload(taskPayload = {}, assignedTasks = []) {
    const source = taskPayload && typeof taskPayload === 'object' && !Array.isArray(taskPayload)
        ? taskPayload
        : {};
    let rawResults = source.taskResults ?? source.task_results;
    if (!Array.isArray(rawResults)) {
        const legacyTaskId = source.taskId ?? source.task_id;
        const legacyTaskCount = source.taskCount ?? source.task_count;
        rawResults = legacyTaskId || legacyTaskCount !== undefined
            ? [{ taskId: legacyTaskId, taskCount: legacyTaskCount }]
            : [];
    }

    const assignedMap = new Map((assignedTasks || []).map((task) => [String(task.id), task]));
    if (assignedMap.size && !rawResults.length) {
        throw new Error('Select at least one task before time out.');
    }

    const merged = new Map();
    rawResults.forEach((item) => {
        const taskId = normalizeAssignedTaskId(item?.taskId ?? item?.task_id ?? item?.id ?? '');
        let task = null;
        let isCustom = false;
        if (taskId) {
            task = assignedMap.get(taskId);
            if (!task) {
                throw new Error('Selected task is not assigned to this user.');
            }
        } else {
            const rawCustomFlag = item?.isCustom ?? item?.is_custom ?? item?.employeeAdded ?? item?.employee_added;
            isCustom = rawCustomFlag === true
                || rawCustomFlag === 1
                || String(rawCustomFlag || '').trim().toLowerCase() === 'true';
            if (!isCustom) {
                throw new Error('Selected task is required.');
            }
            const taskName = normalizeTaskName(item?.taskName ?? item?.task_name ?? item?.name ?? '');
            if (!taskName) {
                throw new Error('Employee-added task name is required.');
            }
            task = {
                id: '',
                name: taskName,
                inputType: normalizeTaskInputType(
                    item?.inputType ?? item?.input_type ?? item?.taskType ?? item?.task_type ?? '',
                    { strict: true }
                )
            };
        }

        const inputType = normalizeTaskInputType(task?.inputType ?? task?.input_type ?? '');
        const rawValue = item?.taskValue ?? item?.task_value ?? item?.value;
        let result;
        if (inputType === 'checklist') {
            const value = normalizeTaskChecklistValue(
                rawValue ?? item?.completed ?? item?.taskCompleted ?? item?.task_completed,
                { required: true }
            );
            result = { id: task.id, name: task.name, inputType, value, count: 1 };
        } else if (inputType === 'text') {
            const value = normalizeTaskTextResponse(
                rawValue ?? item?.taskText ?? item?.task_text ?? item?.text ?? item?.response,
                { required: true }
            );
            result = { id: task.id, name: task.name, inputType, value, count: 0 };
        } else {
            const count = normalizeTaskCompletionCount(
                rawValue ?? item?.taskCount ?? item?.task_count ?? item?.count,
                { required: true }
            );
            result = { id: task.id, name: task.name, inputType, value: count, count };
        }
        if (isCustom || task?.isCustom) {
            result.isCustom = true;
        }

        const resultKey = isCustom
            ? `custom:${task.name.toLowerCase()}`
            : `assigned:${task.id}`;
        const existing = merged.get(resultKey);
        if (!existing) {
            merged.set(resultKey, result);
            return;
        }
        if (existing.inputType !== result.inputType) {
            throw new Error('Duplicate task input types do not match.');
        }
        if (inputType === 'numeric') {
            existing.count += result.count;
            existing.value = existing.count;
        } else {
            existing.value = result.value;
            existing.count = result.count;
        }
    });

    const results = [...merged.values()];
    if (assignedMap.size && !results.length) {
        throw new Error('Select at least one task before time out.');
    }

    return results;
}

function getAssignedTasksForSerializedUser(user = {}) {
    if (Array.isArray(user?.assigned_tasks) && user.assigned_tasks.length) {
        return user.assigned_tasks
            .map((task) => ({
                id: normalizeAssignedTaskId(task?.id || ''),
                name: normalizeTaskName(task?.name || ''),
                inputType: normalizeTaskInputType(task?.inputType || task?.input_type || ''),
                isCustom: Boolean(task?.isCustom || task?.is_custom)
            }))
            .filter((task) => task.id && task.name);
    }

    const taskIds = parseTaskIdList(user?.assigned_task_ids || [], [user?.assigned_task_id || '']);
    if (!taskIds.length) {
        return [];
    }

    return getTasksByIds(taskIds, user?.company_id || '');
}

function getTaskByName(taskName = '') {
    const normalizedTaskName = normalizeTaskName(taskName);
    if (!normalizedTaskName) {
        return null;
    }

    return serializeTask(getTenantDb().prepare(`
        SELECT id, task_name, input_type, is_active, created_at, updated_at
        FROM task_definitions
        WHERE LOWER(task_name) = LOWER(?)
        LIMIT 1
    `).get(normalizedTaskName));
}

function listTasks({ includeInactive = false } = {}) {
    const rows = getTenantDb().prepare(`
        SELECT id, task_name, input_type, is_active, created_at, updated_at
        FROM task_definitions
        ${includeInactive ? '' : 'WHERE is_active = 1'}
        ORDER BY task_name COLLATE NOCASE
    `).all();

    return rows.map(serializeTask).filter(Boolean);
}

function addTask(payload = {}) {
    requireTenantContext();
    const taskName = normalizeTaskName(payload.name || payload.task_name || payload.taskName || '');
    const inputType = normalizeTaskInputType(
        payload.inputType ?? payload.input_type ?? payload.type ?? '',
        { strict: true }
    );
    if (!taskName) {
        throw new Error('Task name is required.');
    }

    const existing = getTaskByName(taskName);
    if (existing) {
        if (!existing.is_active) {
            getTenantDb().prepare(`
                UPDATE task_definitions
                SET is_active = 1,
                    task_name = ?,
                    input_type = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(taskName, inputType, existing.id);
            return getTaskById(existing.id);
        }
        throw new Error('Task already exists.');
    }

    getTenantDb().prepare(`
        INSERT INTO task_definitions (task_name, input_type, is_active)
        VALUES (?, ?, 1)
    `).run(taskName, inputType);

    const created = getTaskByName(taskName);
    logAudit('task.create', 'task', created?.id || taskName, {
        task_name: taskName,
        input_type: inputType
    });

    return created;
}

function deleteTask(taskId = '') {
    const task = getTaskById(taskId);
    if (!task) {
        throw new Error('Task not found.');
    }

    getTenantDb().prepare(`
        UPDATE task_definitions
        SET is_active = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(task.id);

    const context = requireTenantContext();
    const masterDb = getMasterDb();
    const assignedRows = masterDb.prepare(`
        SELECT id, assigned_task_id, assigned_task_ids_json
        FROM users
        WHERE company_id = ?
          AND (
            assigned_task_id = ?
            OR assigned_task_ids_json LIKE ?
          )
    `).all(context.companyId, task.id, `%${task.id}%`);
    const updateAssignments = masterDb.prepare(`
        UPDATE users
        SET assigned_task_id = ?,
            assigned_task_ids_json = ?
        WHERE id = ?
    `);
    const transaction = masterDb.transaction((rows) => {
        rows.forEach((row) => {
            const nextIds = parseTaskIdList(row.assigned_task_ids_json || '[]', [row.assigned_task_id || ''])
                .filter((taskId) => taskId !== task.id);
            updateAssignments.run(nextIds[0] || '', JSON.stringify(nextIds), row.id);
        });
    });
    transaction(assignedRows);

    logAudit('task.delete', 'task', task.id, {
        task_name: task.name
    });

    return { deleted: true, id: task.id };
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
        backgroundImagePath: context.company.login_background_path || PARENT_BRAND.backgroundImagePath,
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

function getCompanyByHost(host = '') {
    ensureSystemReady();
    const db = getMasterDb();
    const normalizedHost = normalizeText(host).split(':')[0].toLowerCase();
    if (!normalizedHost || ['127.0.0.1', 'localhost'].includes(normalizedHost) || /^\d+\.\d+\.\d+\.\d+$/.test(normalizedHost)) {
        return null;
    }

    const hostParts = normalizedHost.split('.').filter(Boolean);
    if (hostParts.length >= 3) {
        const subdomain = normalizeIdentifier(hostParts[0]);
        if (subdomain) {
            const subdomainMatch = db.prepare(`
                SELECT *
                FROM companies
                WHERE LOWER(company_code) = LOWER(?)
                   OR LOWER(COALESCE(subdomain, '')) = LOWER(?)
                LIMIT 1
            `).get(subdomain, subdomain);
            if (subdomainMatch) {
                return subdomainMatch;
            }
        }
    }

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

    return null;
}

function getPublicBranding({ companyCode = '', host = '' } = {}) {
    const hostCompany = getCompanyByHost(host);
    const company = hostCompany || getCompanyByCodeOrHost(companyCode, host);
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
        backgroundImagePath: whiteLabelEnabled
            ? (company.login_background_path || PARENT_BRAND.backgroundImagePath)
            : PARENT_BRAND.backgroundImagePath,
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

    const hostCompany = getCompanyByHost(host);

    if (!normalizeText(companyCode) && !hostCompany) {
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

    const company = hostCompany || getCompanyByCodeOrHost(companyCode, host);
    if (!company || company.status !== COMPANY_ACTIVE_STATUS) {
        return null;
    }

    const user = getScopedUserByLoginIdentifier(company.id, normalizedUsername);
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

function getUserByLoginHandle({ companyCode = '', username = '', host = '', loginType = 'any' } = {}) {
    ensureSystemReady();
    const normalizedUsername = normalizeText(username);
    if (!normalizedUsername) {
        return null;
    }

    const company = getCompanyByCodeOrHost(companyCode, host);
    if (!company || company.status !== COMPANY_ACTIVE_STATUS) {
        return null;
    }

    let user = null;
    const normalizedLoginType = String(loginType || 'any').toLowerCase();
    if (normalizedLoginType === 'google') {
        user = getScopedUserByGoogleEmail(company.id, normalizedUsername);
    } else if (normalizedLoginType === 'email') {
        user = getScopedUserByLoginEmail(company.id, normalizedUsername);
    } else {
        user = getScopedUserByLoginIdentifier(company.id, normalizedUsername);
    }
    if (!user || !Boolean(Number(user.is_active || 0))) {
        return null;
    }

    return {
        ...serializeUser(user, { includeInternalId: true }),
        company_code: company.company_code,
        company_name: company.name,
        branding: getPublicBranding({ companyCode: company.company_code })
    };
}

function listActiveCompanyCodesByUsername(username = '') {
    ensureSystemReady();
    const normalizedUsername = normalizeText(username);
    if (!normalizedUsername) {
        return [];
    }

    const rows = getMasterDb().prepare(`
        SELECT companies.company_code AS company_code
        FROM users
        JOIN companies ON users.company_id = companies.id
        WHERE (
            LOWER(users.username) = LOWER(?)
            OR LOWER(COALESCE(users.login_email, '')) = LOWER(?)
            OR LOWER(COALESCE(users.google_email, '')) = LOWER(?)
        )
          AND COALESCE(users.is_active, 0) = 1
          AND LOWER(companies.status) = ?
    `).all(normalizedUsername, normalizedUsername, normalizedUsername, COMPANY_ACTIVE_STATUS);

    return rows.map((row) => row.company_code).filter(Boolean);
}

function buildVerificationCode(length = 6) {
    const size = Math.max(4, Math.min(8, Number(length) || 6));
    const min = 10 ** (size - 1);
    const max = (10 ** size) - 1;
    return String(Math.floor(min + Math.random() * (max - min + 1)));
}

function requestUserEmailVerification({ userId = '', email = '', purpose = 'login_email', ttlMinutes = 15 } = {}) {
    const context = requireTenantContext();
    const user = getScopedUser(context.companyId, userId);
    if (!user) {
        throw new Error('User not found.');
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
        throw new Error('Invalid email address.');
    }

    const normalizedPurpose = String(purpose || 'login_email').trim().toLowerCase();
    if (normalizedPurpose !== 'login_email' && normalizedPurpose !== 'google_email') {
        throw new Error('Invalid verification purpose.');
    }

    if (normalizedPurpose === 'login_email'
        && normalizeEmail(user.login_email) === normalizedEmail
        && Boolean(Number(user.login_email_verified || 0))
    ) {
        return { email: normalizedEmail, verified: true, alreadyLinked: true };
    }

    if (normalizedPurpose === 'google_email'
        && normalizeEmail(user.google_email) === normalizedEmail
        && Boolean(Number(user.google_email_verified || 0))
    ) {
        return { email: normalizedEmail, verified: true, alreadyLinked: true };
    }

    const conflict = findUserByLinkedEmail(context.companyId, normalizedEmail, user.id);
    if (conflict) {
        throw new Error('Email is already linked to another account.');
    }

    const code = buildVerificationCode();
    const expiresAt = new Date(Date.now() + Math.max(5, Number(ttlMinutes) || 15) * 60 * 1000).toISOString();
    const db = getMasterDb();
    db.prepare(`
        DELETE FROM user_email_verifications
        WHERE user_id = ?
          AND purpose = ?
    `).run(user.id, normalizedPurpose);

    db.prepare(`
        INSERT INTO user_email_verifications (user_id, company_id, email, purpose, code, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(user.id, context.companyId, normalizedEmail, normalizedPurpose, code, expiresAt);

    return {
        email: normalizedEmail,
        purpose: normalizedPurpose,
        expiresAt,
        code
    };
}

function verifyUserEmailVerification({ userId = '', email = '', code = '', purpose = 'login_email' } = {}) {
    const context = requireTenantContext();
    const user = getScopedUser(context.companyId, userId);
    if (!user) {
        throw new Error('User not found.');
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
        throw new Error('Invalid email address.');
    }

    const normalizedPurpose = String(purpose || 'login_email').trim().toLowerCase();
    if (normalizedPurpose !== 'login_email' && normalizedPurpose !== 'google_email') {
        throw new Error('Invalid verification purpose.');
    }

    const db = getMasterDb();
    const entry = db.prepare(`
        SELECT *
        FROM user_email_verifications
        WHERE user_id = ?
          AND purpose = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
    `).get(user.id, normalizedPurpose);

    if (!entry) {
        throw new Error('No verification code requested.');
    }

    const storedEmail = normalizeEmail(entry.email);
    if (storedEmail !== normalizedEmail) {
        throw new Error('Verification email mismatch.');
    }

    const normalizedCode = String(code || '').trim();
    if (!normalizedCode || normalizedCode !== String(entry.code || '').trim()) {
        throw new Error('Invalid verification code.');
    }

    const expiresAt = new Date(entry.expires_at || 0).getTime();
    if (!expiresAt || expiresAt < Date.now()) {
        throw new Error('Verification code expired.');
    }

    const conflict = findUserByLinkedEmail(context.companyId, normalizedEmail, user.id);
    if (conflict) {
        throw new Error('Email is already linked to another account.');
    }

    if (normalizedPurpose === 'google_email') {
        db.prepare(`
            UPDATE users
            SET google_email = ?,
                google_email_verified = 1
            WHERE id = ?
        `).run(normalizedEmail, user.id);
    } else {
        db.prepare(`
            UPDATE users
            SET login_email = ?,
                login_email_verified = 1
            WHERE id = ?
        `).run(normalizedEmail, user.id);
    }

    db.prepare(`
        DELETE FROM user_email_verifications
        WHERE user_id = ?
          AND purpose = ?
    `).run(user.id, normalizedPurpose);

    return getUserById(user.username);
}

function normalizeUserConnectionPurpose(purpose = 'login_email') {
    const normalizedPurpose = String(purpose || 'login_email').trim().toLowerCase();
    if (normalizedPurpose !== 'login_email' && normalizedPurpose !== 'google_email') {
        throw new Error('Invalid connection purpose.');
    }
    return normalizedPurpose;
}

function getUserLinkedConnectionEmail(user, purpose = 'login_email') {
    const normalizedPurpose = normalizeUserConnectionPurpose(purpose);
    const isGoogleConnection = normalizedPurpose === 'google_email';
    const email = normalizeEmail(isGoogleConnection ? user?.google_email : user?.login_email);
    const verified = Boolean(Number(
        isGoogleConnection ? user?.google_email_verified : user?.login_email_verified
    ));

    if (!email) {
        throw new Error(isGoogleConnection ? 'No linked Google account found.' : 'No linked email found.');
    }

    if (isGoogleConnection && !verified) {
        throw new Error('No linked Google account found.');
    }

    return {
        email,
        verified,
        normalizedPurpose
    };
}

function getUserConnectionUnlinkVerificationPurpose(purpose = 'login_email') {
    const normalizedPurpose = normalizeUserConnectionPurpose(purpose);
    return normalizedPurpose === 'google_email'
        ? 'unlink_google_email'
        : 'unlink_login_email';
}

function requestUserConnectionUnlinkVerification({ userId = '', purpose = 'login_email', ttlMinutes = 15 } = {}) {
    const context = requireTenantContext();
    const user = getScopedUser(context.companyId, userId);
    if (!user) {
        throw new Error('User not found.');
    }

    const target = getUserLinkedConnectionEmail(user, purpose);
    const verificationPurpose = getUserConnectionUnlinkVerificationPurpose(target.normalizedPurpose);
    const code = buildVerificationCode();
    const expiresAt = new Date(Date.now() + Math.max(5, Number(ttlMinutes) || 15) * 60 * 1000).toISOString();
    const db = getMasterDb();

    db.prepare(`
        DELETE FROM user_email_verifications
        WHERE user_id = ?
          AND purpose = ?
    `).run(user.id, verificationPurpose);

    db.prepare(`
        INSERT INTO user_email_verifications (user_id, company_id, email, purpose, code, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(user.id, context.companyId, target.email, verificationPurpose, code, expiresAt);

    return {
        email: target.email,
        purpose: verificationPurpose,
        expiresAt,
        code
    };
}

function verifyUserConnectionUnlinkVerification({ userId = '', code = '', purpose = 'login_email' } = {}) {
    const context = requireTenantContext();
    const user = getScopedUser(context.companyId, userId);
    if (!user) {
        throw new Error('User not found.');
    }

    const target = getUserLinkedConnectionEmail(user, purpose);
    const verificationPurpose = getUserConnectionUnlinkVerificationPurpose(target.normalizedPurpose);
    const db = getMasterDb();
    const entry = db.prepare(`
        SELECT *
        FROM user_email_verifications
        WHERE user_id = ?
          AND purpose = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
    `).get(user.id, verificationPurpose);

    if (!entry) {
        throw new Error('No unlink verification code requested.');
    }

    const storedEmail = normalizeEmail(entry.email);
    if (storedEmail !== target.email) {
        throw new Error('Linked email changed. Request a new verification code.');
    }

    const normalizedCode = String(code || '').trim();
    if (!normalizedCode || normalizedCode !== String(entry.code || '').trim()) {
        throw new Error('Invalid verification code.');
    }

    const expiresAt = new Date(entry.expires_at || 0).getTime();
    if (!expiresAt || expiresAt < Date.now()) {
        throw new Error('Verification code expired.');
    }

    if (target.normalizedPurpose === 'google_email') {
        return unlinkUserGoogleEmail({ userId });
    }

    return unlinkUserLoginEmail({ userId });
}

function requestPasswordResetCode({ email = '', ttlMinutes = 15 } = {}) {
    const context = requireTenantContext();
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
        throw new Error('Invalid email address.');
    }

    const user = findUserByLinkedEmail(context.companyId, normalizedEmail);
    if (!user) {
        throw new Error('No account found for that email.');
    }

    const code = buildVerificationCode();
    const expiresAt = new Date(Date.now() + Math.max(5, Number(ttlMinutes) || 15) * 60 * 1000).toISOString();
    const db = getMasterDb();

    db.prepare(`
        DELETE FROM user_email_verifications
        WHERE user_id = ?
          AND purpose = 'password_reset'
    `).run(user.id);

    db.prepare(`
        INSERT INTO user_email_verifications (user_id, company_id, email, purpose, code, expires_at)
        VALUES (?, ?, ?, 'password_reset', ?, ?)
    `).run(user.id, context.companyId, normalizedEmail, code, expiresAt);

    return {
        email: normalizedEmail,
        expiresAt,
        code
    };
}

function verifyPasswordResetCode({ email = '', code = '' } = {}) {
    const context = requireTenantContext();
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
        throw new Error('Invalid email address.');
    }

    const user = findUserByLinkedEmail(context.companyId, normalizedEmail);
    if (!user) {
        throw new Error('No account found for that email.');
    }

    const db = getMasterDb();
    const entry = db.prepare(`
        SELECT *
        FROM user_email_verifications
        WHERE user_id = ?
          AND purpose = 'password_reset'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
    `).get(user.id);

    if (!entry) {
        throw new Error('No verification code requested.');
    }

    const storedEmail = normalizeEmail(entry.email);
    if (storedEmail !== normalizedEmail) {
        throw new Error('Verification email mismatch.');
    }

    const normalizedCode = String(code || '').trim();
    if (!normalizedCode || normalizedCode !== String(entry.code || '').trim()) {
        throw new Error('Invalid verification code.');
    }

    const expiresAt = new Date(entry.expires_at || 0).getTime();
    if (!expiresAt || expiresAt < Date.now()) {
        throw new Error('Verification code expired.');
    }

    return {
        user,
        email: normalizedEmail,
        expiresAt: entry.expires_at
    };
}

function resetPasswordWithCode({ email = '', code = '', password = '' } = {}) {
    const verification = verifyPasswordResetCode({ email, code });
    const normalizedEmail = verification.email;
    const user = verification.user;

    const db = getMasterDb();

    db.prepare(`
        UPDATE users
        SET password_hash = ?
        WHERE id = ?
    `).run(normalizePasswordForStorage(password), user.id);

    db.prepare(`
        DELETE FROM user_email_verifications
        WHERE user_id = ?
          AND purpose = 'password_reset'
    `).run(user.id);

    return getUserById(user.username);
}

function linkUserGoogleEmail({ userId = '', email = '' } = {}) {
    const context = requireTenantContext();
    const user = getScopedUser(context.companyId, userId);
    if (!user) {
        throw new Error('User not found.');
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
        throw new Error('Invalid email address.');
    }

    const conflict = findUserByLinkedEmail(context.companyId, normalizedEmail, user.id);
    if (conflict) {
        throw new Error('Email is already linked to another account.');
    }

    getMasterDb().prepare(`
        UPDATE users
        SET google_email = ?,
            google_email_verified = 1
        WHERE id = ?
    `).run(normalizedEmail, user.id);

    return getUserById(user.username);
}

function unlinkUserLoginEmail({ userId = '' } = {}) {
    const context = requireTenantContext();
    const user = getScopedUser(context.companyId, userId);
    if (!user) {
        throw new Error('User not found.');
    }

    const db = getMasterDb();
    db.prepare(`
        UPDATE users
        SET login_email = '',
            login_email_verified = 0
        WHERE id = ?
    `).run(user.id);

    db.prepare(`
        DELETE FROM user_email_verifications
        WHERE user_id = ?
          AND purpose IN ('login_email', 'unlink_login_email')
    `).run(user.id);

    return getUserById(user.username);
}

function unlinkUserGoogleEmail({ userId = '' } = {}) {
    const context = requireTenantContext();
    const user = getScopedUser(context.companyId, userId);
    if (!user) {
        throw new Error('User not found.');
    }

    const db = getMasterDb();
    db.prepare(`
        UPDATE users
        SET google_email = '',
            google_email_verified = 0
        WHERE id = ?
    `).run(user.id);

    db.prepare(`
        DELETE FROM user_email_verifications
        WHERE user_id = ?
          AND purpose IN ('google_email', 'unlink_google_email')
    `).run(user.id);

    return getUserById(user.username);
}

function clearUserLoginConnectionsByInternalId(userInternalId = '', masterDb = getMasterDb()) {
    const normalizedUserInternalId = String(userInternalId || '').trim();
    if (!normalizedUserInternalId) {
        return { updated: 0, clearedVerifications: 0 };
    }

    const updateResult = masterDb.prepare(`
        UPDATE users
        SET login_email = '',
            login_email_verified = 0,
            google_email = '',
            google_email_verified = 0
        WHERE id = ?
    `).run(normalizedUserInternalId);

    const deleteResult = masterDb.prepare(`
        DELETE FROM user_email_verifications
        WHERE user_id = ?
    `).run(normalizedUserInternalId);

    return {
        updated: Number(updateResult?.changes || 0),
        clearedVerifications: Number(deleteResult?.changes || 0)
    };
}

function clearInactiveUserLoginConnections(masterDb = getMasterDb()) {
    const inactiveUsers = masterDb.prepare(`
        SELECT id
        FROM users
        WHERE LOWER(TRIM(COALESCE(account_status, ''))) = ?
    `).all(USER_ACCOUNT_STATUS_INACTIVE);

    if (!inactiveUsers.length) {
        return { updated: 0, clearedVerifications: 0 };
    }

    const transaction = masterDb.transaction((rows) => rows.reduce((summary, row) => {
        const result = clearUserLoginConnectionsByInternalId(row.id, masterDb);
        summary.updated += result.updated;
        summary.clearedVerifications += result.clearedVerifications;
        return summary;
    }, { updated: 0, clearedVerifications: 0 }));

    return transaction(inactiveUsers);
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
            login_background_path: context.company.login_background_path || '',
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
        workspaceConfig: getCompanyWorkspaceConfig(),
        companyBulletin: getCompanyBulletinFeed()
    };
}

function recordAuditEvent({
    companyId = '',
    actorUserId = '',
    action = '',
    targetType = '',
    targetId = '',
    details = {}
} = {}) {
    ensureSystemReady();
    getMasterDb().prepare(`
        INSERT INTO audit_logs (company_id, actor_user_id, action, target_type, target_id, details_json)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        normalizeText(companyId) || null,
        normalizeText(actorUserId) || null,
        String(action || ''),
        String(targetType || 'event'),
        String(targetId || ''),
        JSON.stringify(details || {})
    );
}

function logAudit(action, targetType, targetId, details = {}) {
    const context = getCurrentContext();
    const actorId = context?.actorUserId || context?.requestUserId || '';
    recordAuditEvent({
        companyId: context?.companyId || '',
        actorUserId: actorId,
        action,
        targetType,
        targetId,
        details
    });
}

function logAccessEvent({
    deviceId = '',
    ipAddress = '',
    userAgent = '',
    host = '',
    path = '',
    method = '',
    companyId = '',
    userId = ''
} = {}) {
    ensureSystemReady();
    const normalizedDeviceId = normalizeText(deviceId);
    const normalizedIp = normalizeIpAddress(ipAddress);
    if (!normalizedDeviceId && !normalizedIp) {
        return null;
    }

    getMasterDb().prepare(`
        INSERT INTO access_logs (device_id, ip_address, user_agent, host, path, method, company_id, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        normalizedDeviceId || '',
        normalizedIp || '',
        String(userAgent || ''),
        String(host || ''),
        String(path || ''),
        String(method || ''),
        normalizeText(companyId) || null,
        normalizeText(userId) || null
    );

    return { logged: true };
}

function listAccessLogs({ limit = 200, offset = 0, filter = '' } = {}) {
    ensureSystemReady();
    const normalizedFilter = normalizeText(filter);
    const params = [];
    let whereClause = '';

    if (normalizedFilter) {
        const like = `%${normalizedFilter}%`;
        whereClause = `
            WHERE LOWER(COALESCE(access_logs.device_id, '')) LIKE LOWER(?)
               OR LOWER(COALESCE(access_logs.ip_address, '')) LIKE LOWER(?)
               OR LOWER(COALESCE(access_logs.host, '')) LIKE LOWER(?)
               OR LOWER(COALESCE(access_logs.path, '')) LIKE LOWER(?)
               OR LOWER(COALESCE(access_logs.user_agent, '')) LIKE LOWER(?)
               OR LOWER(COALESCE(access_logs.user_id, '')) LIKE LOWER(?)
               OR LOWER(COALESCE(users.username, '')) LIKE LOWER(?)
               OR LOWER(COALESCE(users.display_name, '')) LIKE LOWER(?)
               OR LOWER(COALESCE(users.role, '')) LIKE LOWER(?)
               OR LOWER(COALESCE(companies.name, '')) LIKE LOWER(?)
               OR LOWER(COALESCE(companies.company_code, '')) LIKE LOWER(?)
        `;
        params.push(like, like, like, like, like, like, like, like, like, like, like);
    }

    const normalizedLimit = Math.max(1, Math.min(1000, Number(limit || 200)));
    const normalizedOffset = Math.max(0, Number(offset || 0));
    const rows = getMasterDb().prepare(`
        SELECT access_logs.*, companies.name AS company_name
             , companies.company_code AS company_code
             , COALESCE(NULLIF(users.display_name, ''), users.username, access_logs.user_id) AS user_name
             , COALESCE(NULLIF(users.role, ''), '') AS user_role
        FROM access_logs
        LEFT JOIN companies
          ON companies.id = access_logs.company_id
        LEFT JOIN users
          ON COALESCE(users.company_id, '') = COALESCE(access_logs.company_id, '')
         AND LOWER(users.username) = LOWER(COALESCE(access_logs.user_id, ''))
        ${whereClause}
        ORDER BY access_logs.created_at DESC, access_logs.id DESC
        LIMIT ?
        OFFSET ?
    `).all(...params, normalizedLimit, normalizedOffset);

    const deviceIds = [...new Set(
        rows
            .map((row) => normalizeText(row.device_id))
            .filter(Boolean)
    )];
    const deviceStatsById = new Map();

    if (deviceIds.length) {
        const placeholders = deviceIds.map(() => '?').join(', ');
        getMasterDb().prepare(`
            SELECT device_id,
                   COUNT(*) AS access_count,
                   COUNT(DISTINCT CASE WHEN TRIM(COALESCE(ip_address, '')) != '' THEN ip_address END) AS ip_count,
                   MIN(created_at) AS first_seen_at,
                   MAX(created_at) AS last_seen_at
            FROM access_logs
            WHERE device_id IN (${placeholders})
            GROUP BY device_id
        `).all(...deviceIds).forEach((row) => {
            deviceStatsById.set(String(row.device_id || ''), row);
        });
    }

    return rows.map((row) => {
        const stats = deviceStatsById.get(normalizeText(row.device_id)) || null;
        return {
            ...row,
            user_name: row.user_name || row.user_id || '',
            user_role: row.user_role || '',
            device_access_count: Number(stats?.access_count || 0),
            device_ip_count: Number(stats?.ip_count || 0),
            device_first_seen_at: String(stats?.first_seen_at || row.created_at || ''),
            device_last_seen_at: String(stats?.last_seen_at || row.created_at || '')
        };
    });
}

function encodeAttendanceCursor(cursor = {}) {
    const updatedAt = String(cursor.updatedAt || cursor.updated_at || '').trim();
    const rowId = Number(cursor.rowId ?? cursor.row_id ?? cursor.id ?? 0);
    if (!updatedAt || !Number.isFinite(rowId) || rowId <= 0) {
        return '';
    }

    return Buffer.from(JSON.stringify({ updatedAt, rowId }), 'utf8').toString('base64url');
}

function decodeAttendanceCursor(value = '') {
    const raw = String(value || '').trim();
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
        const updatedAt = String(parsed.updatedAt || '').trim();
        const rowId = Number(parsed.rowId || 0);
        if (!updatedAt || !Number.isFinite(rowId) || rowId <= 0) {
            throw new Error('Invalid cursor.');
        }
        return { updatedAt, rowId };
    } catch (_error) {
        throw createCodedError('INVALID_CURSOR', 'Cursor is invalid.', 400);
    }
}

function normalizeSyncTimestamp(value = '') {
    const raw = String(value || '').trim();
    if (!raw) {
        return '';
    }
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
        return raw;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        throw createCodedError('INVALID_CURSOR', 'updatedSince is invalid.', 400);
    }
    return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

function getAttendanceRawByRowId(attendanceId = '') {
    const rowId = Number(attendanceId || 0);
    if (!Number.isInteger(rowId) || rowId <= 0) {
        return null;
    }

    return getTenantDb().prepare(`
        SELECT rowid AS row_id, *
        FROM attendance
        WHERE rowid = ?
        LIMIT 1
    `).get(rowId) || null;
}

function getApprovedAttendanceCorrectionsByAttendanceIds(attendanceIds = []) {
    const ids = [...new Set(
        (Array.isArray(attendanceIds) ? attendanceIds : [attendanceIds])
            .map((value) => Number(value || 0))
            .filter((value) => Number.isInteger(value) && value > 0)
    )];
    if (!ids.length) {
        return new Map();
    }

    const context = requireTenantContext();
    const placeholders = ids.map(() => '?').join(', ');
    const rows = getTenantDb().prepare(`
        SELECT *
        FROM attendance_corrections
        WHERE company_id = ?
          AND status = 'approved'
          AND attendance_id IN (${placeholders})
        ORDER BY reviewed_at DESC, updated_at DESC, created_at DESC
    `).all(context.companyId, ...ids);

    const byAttendanceId = new Map();
    rows.forEach((row) => {
        const attendanceId = Number(row.attendance_id || 0);
        const requestedType = normalizeAttendanceType(row.requested_type || '');
        if (!attendanceId || !requestedType) {
            return;
        }
        if (!byAttendanceId.has(attendanceId)) {
            byAttendanceId.set(attendanceId, {});
        }
        const corrections = byAttendanceId.get(attendanceId);
        if (!corrections[requestedType]) {
            corrections[requestedType] = serializeAttendanceCorrection(row);
        }
    });

    return byAttendanceId;
}

function applyApprovedCorrectionsToAttendanceRow(row = {}, corrections = {}) {
    const timeInCorrection = corrections.TIME_IN || null;
    const timeOutCorrection = corrections.TIME_OUT || null;
    const effectiveTimeIn = timeInCorrection
        ? formatTimeValue(timeInCorrection.requestedScannedAt || '')
        : (row.timeIn || '');
    const effectiveTimeOut = timeOutCorrection
        ? formatTimeValue(timeOutCorrection.requestedScannedAt || '')
        : (row.timeOut || '');
    const user = getUserById(row.id);
    const scheduleForDate = getUserScheduleForDate(user, row.dateKey || row.date);
    const scheduledTimeIn = scheduleForDate.is_day_off ? '' : formatTimeValue(scheduleForDate.time_in || row.scheduledTimeIn || '');
    const scheduledTimeOut = scheduleForDate.is_day_off ? '' : formatTimeValue(scheduleForDate.time_out || row.scheduledTimeOut || '');
    const effectiveWorkedHours = calculateWorkedHours(
        effectiveTimeIn,
        effectiveTimeOut,
        scheduledTimeIn,
        scheduledTimeOut,
        { user, dateKey: row.dateKey || row.date }
    ) || (effectiveTimeIn && effectiveTimeOut ? '0.00' : (row.workedHours || ''));

    return {
        ...row,
        originalTimeIn: row.timeIn || '',
        originalTimeOut: row.timeOut || '',
        effectiveTimeIn,
        effectiveTimeOut,
        effectiveWorkedHours,
        hasCorrections: Boolean(timeInCorrection || timeOutCorrection),
        corrections: {
            timeIn: timeInCorrection,
            timeOut: timeOutCorrection
        }
    };
}

function serializeAttendanceCorrection(row = null) {
    if (!row) {
        return null;
    }

    const requestedType = normalizeAttendanceType(row.requested_type || '');
    const status = String(row.status || 'pending').trim().toLowerCase();
    return {
        id: String(row.id || ''),
        companyId: String(row.company_id || ''),
        attendanceId: row.attendance_id == null ? null : Number(row.attendance_id || 0),
        correctionId: String(row.correction_id || ''),
        userId: String(row.user_id || ''),
        requestedDate: String(row.requested_date || ''),
        requestedType,
        requestedScannedAt: String(row.requested_scanned_at || ''),
        requestedTime: formatTimeValue(row.requested_scanned_at || ''),
        reason: String(row.reason || ''),
        source: String(row.source || 'device'),
        requestedBy: String(row.requested_by || ''),
        requestedByDeviceId: String(row.requested_by_device_id || ''),
        status: ATTENDANCE_CORRECTION_STATUSES.has(status) ? status : 'pending',
        reviewedByUserId: String(row.reviewed_by_user_id || ''),
        reviewedAt: String(row.reviewed_at || ''),
        rejectionReason: String(row.rejection_reason || ''),
        createdAt: String(row.created_at || ''),
        updatedAt: String(row.updated_at || '')
    };
}

function getAttendanceCorrectionRaw(correctionId = '') {
    const context = requireTenantContext();
    const normalizedCorrectionId = normalizeCorrectionId(correctionId);
    if (!normalizedCorrectionId) {
        return null;
    }

    return getTenantDb().prepare(`
        SELECT *
        FROM attendance_corrections
        WHERE company_id = ?
          AND correction_id = ?
        LIMIT 1
    `).get(context.companyId, normalizedCorrectionId) || null;
}

function serializeAttendanceAuditLog(row = null) {
    if (!row) {
        return null;
    }

    const parseJson = (value) => {
        try {
            const parsed = JSON.parse(String(value || '{}'));
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_error) {
            return {};
        }
    };

    return {
        id: String(row.id || ''),
        companyId: String(row.company_id || ''),
        attendanceId: row.attendance_id == null ? null : Number(row.attendance_id || 0),
        correctionId: String(row.correction_id || ''),
        action: String(row.action || ''),
        oldValue: parseJson(row.old_value_json),
        newValue: parseJson(row.new_value_json),
        reason: String(row.reason || ''),
        actorType: String(row.actor_type || ''),
        actorId: String(row.actor_id || ''),
        deviceId: String(row.device_id || ''),
        ipAddress: String(row.ip_address || ''),
        createdAt: String(row.created_at || '')
    };
}

function appendAttendanceAuditLog({
    attendanceId = null,
    correctionId = '',
    action = '',
    oldValue = {},
    newValue = {},
    reason = '',
    actorType = '',
    actorId = '',
    deviceId = '',
    ipAddress = ''
} = {}) {
    const context = requireTenantContext();
    const normalizedAction = normalizeText(action).toLowerCase();
    if (!normalizedAction) {
        return null;
    }

    const id = generateId('attendance_audit');
    getTenantDb().prepare(`
        INSERT INTO attendance_audit_logs (
            id, company_id, attendance_id, correction_id, action,
            old_value_json, new_value_json, reason, actor_type, actor_id,
            device_id, ip_address, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
        id,
        context.companyId,
        attendanceId == null ? null : Number(attendanceId || 0),
        normalizeCorrectionId(correctionId),
        normalizedAction,
        JSON.stringify(oldValue || {}),
        JSON.stringify(newValue || {}),
        normalizeMultilineText(reason, { maxLength: ATTENDANCE_CORRECTION_REASON_MAX_LENGTH }),
        normalizeText(actorType).toLowerCase(),
        normalizeText(actorId),
        normalizeDeviceId(deviceId),
        normalizeText(ipAddress).slice(0, 80)
    );

    return serializeAttendanceAuditLog(getTenantDb().prepare(`
        SELECT *
        FROM attendance_audit_logs
        WHERE id = ?
        LIMIT 1
    `).get(id));
}

function ensureCorrectionReason(value = '') {
    const reason = normalizeMultilineText(value, { maxLength: ATTENDANCE_CORRECTION_REASON_MAX_LENGTH });
    if (!reason) {
        throw createCodedError('CORRECTION_REASON_REQUIRED', 'Correction reason is required.', 400);
    }
    return reason;
}

function validateCorrectionScanTime(value = '') {
    const raw = String(value || '').trim();
    const parsed = parseDateValue(raw);
    if (!raw || !parsed || Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() < 2000) {
        throw createCodedError('INVALID_SCAN_TIME', 'Scan time is invalid.', 400);
    }
    return {
        raw,
        parsed,
        dateKey: getDateKey(parsed),
        time: formatTimeValue(parsed)
    };
}

function getCorrectionTargetFromPayload(payload = {}, { branchId = '' } = {}) {
    const attendanceId = Number(payload.attendanceId ?? payload.attendance_id ?? 0);
    if (Number.isInteger(attendanceId) && attendanceId > 0) {
        const attendance = getAttendanceRawByRowId(attendanceId);
        if (!attendance) {
            throw createCodedError('ATTENDANCE_NOT_FOUND', 'Attendance record not found.', 404);
        }
        if (branchId && String(attendance.branch_id || '').trim() !== String(branchId || '').trim()) {
            throw createCodedError('BRANCH_RESTRICTED', 'Device is restricted to another branch.', 403);
        }
        return {
            attendance,
            attendanceId: Number(attendance.row_id || attendanceId),
            userId: String(attendance.id || ''),
            requestedDate: getDateKey(attendance.date || '')
        };
    }

    throw createCodedError('ATTENDANCE_NOT_FOUND', 'Attendance record is required for corrections.', 404);
}

function isSameCorrectionRequest(existing = {}, prepared = {}) {
    return String(existing.company_id || '') === String(prepared.companyId || '')
        && String(existing.correction_id || '') === String(prepared.correctionId || '')
        && String(existing.user_id || '') === String(prepared.userId || '')
        && Number(existing.attendance_id || 0) === Number(prepared.attendanceId || 0)
        && String(existing.requested_date || '') === String(prepared.requestedDate || '')
        && normalizeAttendanceType(existing.requested_type || '') === String(prepared.requestedType || '')
        && String(existing.requested_scanned_at || '') === String(prepared.requestedScannedAt || '')
        && String(existing.reason || '') === String(prepared.reason || '')
        && String(existing.requested_by_device_id || '') === String(prepared.deviceId || '');
}

function assertNoPendingCorrectionConflict(prepared = {}) {
    const db = getTenantDb();
    const params = [
        prepared.companyId,
        prepared.requestedType,
        prepared.correctionId
    ];
    let targetClause = '';
    if (prepared.attendanceId) {
        targetClause = 'attendance_id = ?';
        params.push(prepared.attendanceId);
    } else {
        targetClause = '(COALESCE(attendance_id, 0) = 0 AND user_id = ? AND requested_date = ?)';
        params.push(prepared.userId, prepared.requestedDate);
    }

    const conflict = db.prepare(`
        SELECT correction_id
        FROM attendance_corrections
        WHERE company_id = ?
          AND requested_type = ?
          AND correction_id <> ?
          AND status = 'pending'
          AND ${targetClause}
        LIMIT 1
    `).get(...params);

    if (conflict) {
        throw createCodedError('CORRECTION_CONFLICT', 'A pending correction already exists for this attendance value.', 409);
    }
}

function createAttendanceCorrectionRequest(payload = {}, {
    deviceId = '',
    branchId = '',
    ipAddress = ''
} = {}) {
    const context = requireTenantContext();
    const correctionId = normalizeCorrectionId(payload.correctionId ?? payload.correction_id ?? payload.eventId ?? payload.event_id);
    if (!correctionId) {
        throw createCodedError('CORRECTION_CONFLICT', 'Correction ID is required.', 400);
    }
    const requestedType = normalizeAttendanceType(payload.requestedType ?? payload.requested_type ?? payload.type);
    if (!requestedType) {
        throw createCodedError('INVALID_ATTENDANCE_TYPE', 'Attendance type must be TIME_IN or TIME_OUT.', 400);
    }
    const scan = validateCorrectionScanTime(payload.requestedScannedAt ?? payload.requested_scanned_at ?? payload.scannedAt ?? payload.scanned_at);
    const reason = ensureCorrectionReason(payload.reason);
    const target = getCorrectionTargetFromPayload(payload, { branchId });
    const requestedDate = target.requestedDate || scan.dateKey;
    const existingForDate = target.attendanceId
        ? target.attendance
        : findAttendanceRecord(target.userId, requestedDate);
    const attendanceId = target.attendanceId || (existingForDate?.rowId ? Number(existingForDate.rowId) : null);
    const prepared = {
        companyId: context.companyId,
        attendanceId,
        correctionId,
        userId: target.userId,
        requestedDate,
        requestedType,
        requestedScannedAt: scan.raw,
        reason,
        deviceId: normalizeDeviceId(deviceId)
    };

    const existing = getAttendanceCorrectionRaw(correctionId);
    if (existing) {
        if (!isSameCorrectionRequest(existing, prepared)) {
            throw createCodedError('CORRECTION_CONFLICT', 'Correction ID already belongs to a different request.', 409);
        }
        return {
            duplicate: true,
            correction: serializeAttendanceCorrection(existing)
        };
    }

    assertNoPendingCorrectionConflict(prepared);
    const id = generateId('attendance_correction');
    getTenantDb().prepare(`
        INSERT INTO attendance_corrections (
            id, company_id, attendance_id, correction_id, user_id, requested_date,
            requested_type, requested_scanned_at, reason, source, requested_by,
            requested_by_device_id, status, reviewed_by_user_id, reviewed_at,
            rejection_reason, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'device', ?, ?, 'pending', '', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
        id,
        context.companyId,
        attendanceId,
        correctionId,
        target.userId,
        requestedDate,
        requestedType,
        scan.raw,
        reason,
        prepared.deviceId ? `device:${prepared.deviceId}` : 'device',
        prepared.deviceId
    );

    appendAttendanceAuditLog({
        attendanceId,
        correctionId,
        action: 'correction_requested',
        oldValue: existingForDate || null,
        newValue: {
            requestedType,
            requestedScannedAt: scan.raw,
            requestedDate
        },
        reason,
        actorType: 'device',
        actorId: prepared.deviceId,
        deviceId: prepared.deviceId,
        ipAddress
    });

    return {
        duplicate: false,
        correction: serializeAttendanceCorrection(getAttendanceCorrectionRaw(correctionId))
    };
}

function createMissingAttendanceShellForCorrection(correction = {}) {
    const user = getUserById(correction.user_id || '');
    if (!user || !isEmployeeLikeRole(user.role)) {
        throw createCodedError('EMPLOYEE_NOT_FOUND', 'Employee not found.', 404);
    }
    if (!user.is_active || String(user.account_status || '').toLowerCase() !== USER_ACCOUNT_STATUS_ACTIVE) {
        throw createCodedError('EMPLOYEE_INACTIVE', 'Employee is inactive.', 403);
    }
    const dateKey = normalizeDateKey(correction.requested_date || '');
    if (!dateKey) {
        throw createCodedError('INVALID_SCAN_TIME', 'Correction date is invalid.', 400);
    }

    const existing = findAttendanceRecord(user.id, dateKey);
    if (existing?.rowId) {
        return Number(existing.rowId);
    }

    const displayName = normalizeText(user.display_name || user.name || user.username) || user.id;
    getTenantDb().prepare(`
        INSERT INTO attendance (
            id, branch_id, name, date, time_in, time_out, worked_hours, remarks,
            created_at, updated_at
        )
        VALUES (?, ?, ?, ?, '', '', '', 'Correction Approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(user.id, user.branch_id || null, displayName, dateKey);

    const inserted = findAttendanceRecord(user.id, dateKey);
    if (!inserted?.rowId) {
        throw createCodedError('ATTENDANCE_NOT_FOUND', 'Attendance record could not be created.', 404);
    }
    return Number(inserted.rowId);
}

function touchAttendanceUpdatedAt(attendanceId = null) {
    const rowId = Number(attendanceId || 0);
    if (!Number.isInteger(rowId) || rowId <= 0) {
        return;
    }
    getTenantDb().prepare(`
        UPDATE attendance
        SET updated_at = CURRENT_TIMESTAMP
        WHERE rowid = ?
    `).run(rowId);
}

function approveAttendanceCorrection(correctionId = '', { reviewedByUserId = '' } = {}) {
    const context = requireTenantContext();
    const correction = getAttendanceCorrectionRaw(correctionId);
    if (!correction) {
        throw createCodedError('ATTENDANCE_NOT_FOUND', 'Correction request not found.', 404);
    }
    if (String(correction.status || '').toLowerCase() !== 'pending') {
        throw createCodedError('CORRECTION_ALREADY_REVIEWED', 'Correction request was already reviewed.', 409);
    }

    let attendanceId = Number(correction.attendance_id || 0) || null;
    if (!attendanceId) {
        attendanceId = createMissingAttendanceShellForCorrection(correction);
    }
    const attendance = getAttendanceRawByRowId(attendanceId);
    if (!attendance) {
        throw createCodedError('ATTENDANCE_NOT_FOUND', 'Attendance record not found.', 404);
    }

    const approvedConflict = getTenantDb().prepare(`
        SELECT correction_id
        FROM attendance_corrections
        WHERE company_id = ?
          AND correction_id <> ?
          AND attendance_id = ?
          AND requested_type = ?
          AND status = 'approved'
        LIMIT 1
    `).get(context.companyId, correction.correction_id, attendanceId, correction.requested_type);
    if (approvedConflict) {
        throw createCodedError('CORRECTION_CONFLICT', 'An approved correction already exists for this attendance value.', 409);
    }

    const reviewer = normalizeText(reviewedByUserId);
    const reviewedAt = new Date().toISOString();
    getTenantDb().transaction(() => {
        getTenantDb().prepare(`
            UPDATE attendance_corrections
            SET attendance_id = ?,
                status = 'approved',
                reviewed_by_user_id = ?,
                reviewed_at = ?,
                rejection_reason = '',
                updated_at = CURRENT_TIMESTAMP
            WHERE company_id = ?
              AND correction_id = ?
              AND status = 'pending'
        `).run(attendanceId, reviewer, reviewedAt, context.companyId, correction.correction_id);
        touchAttendanceUpdatedAt(attendanceId);
        appendAttendanceAuditLog({
            attendanceId,
            correctionId: correction.correction_id,
            action: 'correction_approved',
            oldValue: {
                time_in: attendance.time_in || '',
                time_out: attendance.time_out || '',
                worked_hours: attendance.worked_hours || '',
                remarks: attendance.remarks || ''
            },
            newValue: {
                requested_type: correction.requested_type || '',
                requested_scanned_at: correction.requested_scanned_at || '',
                requested_time: formatTimeValue(correction.requested_scanned_at || '')
            },
            reason: correction.reason || '',
            actorType: 'user',
            actorId: reviewer
        });
    })();

    logAudit('attendance_correction.approve', 'attendance_correction', correction.correction_id, {
        attendance_id: attendanceId,
        requested_type: correction.requested_type || '',
        requested_scanned_at: correction.requested_scanned_at || ''
    });

    return serializeAttendanceCorrection(getAttendanceCorrectionRaw(correction.correction_id));
}

function rejectAttendanceCorrection(correctionId = '', { reviewedByUserId = '', reason = '' } = {}) {
    const context = requireTenantContext();
    const correction = getAttendanceCorrectionRaw(correctionId);
    if (!correction) {
        throw createCodedError('ATTENDANCE_NOT_FOUND', 'Correction request not found.', 404);
    }
    if (String(correction.status || '').toLowerCase() !== 'pending') {
        throw createCodedError('CORRECTION_ALREADY_REVIEWED', 'Correction request was already reviewed.', 409);
    }

    const rejectionReason = ensureCorrectionReason(reason);
    const reviewer = normalizeText(reviewedByUserId);
    const reviewedAt = new Date().toISOString();
    getTenantDb().transaction(() => {
        getTenantDb().prepare(`
            UPDATE attendance_corrections
            SET status = 'rejected',
                reviewed_by_user_id = ?,
                reviewed_at = ?,
                rejection_reason = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE company_id = ?
              AND correction_id = ?
              AND status = 'pending'
        `).run(reviewer, reviewedAt, rejectionReason, context.companyId, correction.correction_id);
        appendAttendanceAuditLog({
            attendanceId: correction.attendance_id,
            correctionId: correction.correction_id,
            action: 'correction_rejected',
            oldValue: {
                status: correction.status || 'pending'
            },
            newValue: {
                status: 'rejected',
                rejection_reason: rejectionReason
            },
            reason: rejectionReason,
            actorType: 'user',
            actorId: reviewer
        });
    })();

    logAudit('attendance_correction.reject', 'attendance_correction', correction.correction_id, {
        attendance_id: correction.attendance_id || null,
        requested_type: correction.requested_type || '',
        rejection_reason: rejectionReason
    });

    return serializeAttendanceCorrection(getAttendanceCorrectionRaw(correction.correction_id));
}

function listAttendanceCorrections({ status = '', limit, offset = 0 } = {}) {
    const context = requireTenantContext();
    const normalizedStatus = String(status || '').trim().toLowerCase();
    const clauses = ['company_id = ?'];
    const params = [context.companyId];
    if (normalizedStatus) {
        if (!ATTENDANCE_CORRECTION_STATUSES.has(normalizedStatus)) {
            throw createCodedError('CORRECTION_CONFLICT', 'Correction status is invalid.', 400);
        }
        clauses.push('status = ?');
        params.push(normalizedStatus);
    }

    const normalizedLimit = Math.min(250, Math.max(1, Number(limit) || 100));
    const normalizedOffset = Math.max(0, Number(offset) || 0);
    const whereClause = `WHERE ${clauses.join(' AND ')}`;
    const db = getTenantDb();
    const items = db.prepare(`
        SELECT *
        FROM attendance_corrections
        ${whereClause}
        ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC, correction_id DESC
        LIMIT ? OFFSET ?
    `).all(...params, normalizedLimit, normalizedOffset).map(serializeAttendanceCorrection);
    const total = Number(db.prepare(`
        SELECT COUNT(*) AS total
        FROM attendance_corrections
        ${whereClause}
    `).get(...params)?.total || 0);

    return {
        items,
        total,
        limit: normalizedLimit,
        offset: normalizedOffset
    };
}

function listAttendanceAuditLogs({ attendanceId = '', correctionId = '', branchId = '', limit, offset = 0 } = {}) {
    const context = requireTenantContext();
    const clauses = ['company_id = ?'];
    const params = [context.companyId];
    const normalizedAttendanceId = Number(attendanceId || 0);
    if (Number.isInteger(normalizedAttendanceId) && normalizedAttendanceId > 0) {
        clauses.push('attendance_id = ?');
        params.push(normalizedAttendanceId);
    }
    const normalizedBranchId = normalizeOptionalBranchId(branchId);
    if (normalizedBranchId) {
        clauses.push(`attendance_id IN (
            SELECT rowid
            FROM attendance
            WHERE branch_id = ?
        )`);
        params.push(normalizedBranchId);
    }
    const normalizedCorrectionId = normalizeCorrectionId(correctionId);
    if (normalizedCorrectionId) {
        clauses.push('correction_id = ?');
        params.push(normalizedCorrectionId);
    }
    const normalizedLimit = Math.min(250, Math.max(1, Number(limit) || 100));
    const normalizedOffset = Math.max(0, Number(offset) || 0);
    const whereClause = `WHERE ${clauses.join(' AND ')}`;

    return {
        items: getTenantDb().prepare(`
            SELECT *
            FROM attendance_audit_logs
            ${whereClause}
            ORDER BY datetime(created_at) DESC, id DESC
            LIMIT ? OFFSET ?
        `).all(...params, normalizedLimit, normalizedOffset).map(serializeAttendanceAuditLog),
        limit: normalizedLimit,
        offset: normalizedOffset
    };
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

function listUsers(role = '', filter = '', { limit = 500, offset = 0, includeInactive = true } = {}) {
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

    if (includeInactive === false) {
        clauses.push("LOWER(TRIM(COALESCE(account_status, 'active'))) <> 'inactive'");
    }

    const rows = getMasterDb().prepare(`
        SELECT *
        FROM users
        WHERE ${clauses.join(' AND ')}
        ORDER BY display_name COLLATE NOCASE, username COLLATE NOCASE
    `).all(...params).map((row) => serializeUser(row));

    const normalizedOffset = Math.max(0, Number(offset) || 0);
    const normalizedLimit = Math.min(2500, Math.max(1, Number(limit) || 500));
    return rows.slice(normalizedOffset, normalizedOffset + normalizedLimit);
}

function addEmployee({
    id,
    name,
    password,
    is_active = undefined,
    account_status = undefined,
    timeIn = DEFAULT_EMPLOYEE_TIME_IN,
    timeOut = DEFAULT_EMPLOYEE_TIME_OUT,
    weeklySchedule = undefined,
    weekly_schedule = undefined,
    schedule = undefined,
    schedule_json = undefined,
    branchId = '',
    branchName = '',
    feature_access = undefined,
    featureAccess = undefined,
    daily_salary = undefined,
    dailySalary = undefined
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
    const nextAccountStatus = resolveUserAccountStatusPayload({
        is_active,
        account_status
    });
    const nextDailySalary = normalizeDailySalaryValue(dailySalary ?? daily_salary) ?? 0;
    const nextIsActive = nextAccountStatus === USER_ACCOUNT_STATUS_ACTIVE;
    const nextSuspendedOn = nextAccountStatus === USER_ACCOUNT_STATUS_SUSPENDED ? getDateKey() : '';
    const nextInactiveOn = nextAccountStatus === USER_ACCOUNT_STATUS_INACTIVE ? getDateKey() : '';
    getMasterDb().prepare(`
        INSERT INTO users (
            id, company_id, branch_id, username, password_hash, role, is_active,
            account_status, suspended_on, inactive_on, display_name, profile_picture,
            time_in, time_out, schedule_json, feature_access_json, daily_salary
        )
        VALUES (?, ?, ?, ?, ?, 'employee', ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)
    `).run(
        createUserInternalId(context.companyId, username),
        context.companyId,
        resolvedBranchId || null,
        username,
        normalizePasswordForStorage(password),
        nextIsActive ? 1 : 0,
        nextAccountStatus,
        nextSuspendedOn,
        nextInactiveOn,
        normalizeText(name),
        defaultTimeIn,
        defaultTimeOut,
        JSON.stringify(normalizedWeeklySchedule),
        JSON.stringify(featureAccessPayload),
        nextDailySalary
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
        const nextAccountStatus = resolveUserAccountStatusPayload(payload);
        const nextDailySalary = normalizeDailySalaryValue(payload.dailySalary ?? payload.daily_salary) ?? 0;
        const nextIsActive = nextAccountStatus === USER_ACCOUNT_STATUS_ACTIVE;
        const nextSuspendedOn = nextAccountStatus === USER_ACCOUNT_STATUS_SUSPENDED ? getDateKey() : '';
        const nextInactiveOn = nextAccountStatus === USER_ACCOUNT_STATUS_INACTIVE ? getDateKey() : '';
        getMasterDb().prepare(`
            INSERT INTO users (
                id, company_id, branch_id, username, password_hash, role, is_active,
                account_status, suspended_on, inactive_on, display_name, profile_picture,
                time_in, time_out, schedule_json, feature_access_json, daily_salary
            )
            VALUES (?, ?, ?, ?, ?, 'staff', ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)
        `).run(
            createUserInternalId(context.companyId, username),
            context.companyId,
            resolvedBranchId || null,
            username,
            normalizePasswordForStorage(payload.password),
            nextIsActive ? 1 : 0,
            nextAccountStatus,
            nextSuspendedOn,
            nextInactiveOn,
            displayName,
            defaultTimeIn,
            defaultTimeOut,
            JSON.stringify(normalizedWeeklySchedule),
            JSON.stringify(featureAccessPayload),
            nextDailySalary
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
    const nextAccountStatus = resolveUserAccountStatusPayload(payload);
    const nextDailySalary = normalizeDailySalaryValue(payload.dailySalary ?? payload.daily_salary) ?? 0;
    const nextIsActive = nextAccountStatus === USER_ACCOUNT_STATUS_ACTIVE;
    const nextSuspendedOn = nextAccountStatus === USER_ACCOUNT_STATUS_SUSPENDED ? getDateKey() : '';
    const nextInactiveOn = nextAccountStatus === USER_ACCOUNT_STATUS_INACTIVE ? getDateKey() : '';
    getMasterDb().prepare(`
        INSERT INTO users (
            id, company_id, branch_id, username, password_hash, role, is_active,
            account_status, suspended_on, inactive_on, display_name, profile_picture, time_in, time_out, schedule_json, feature_access_json, daily_salary
        )
        VALUES (?, ?, ?, ?, ?, 'company_admin', ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)
    `).run(
        createUserInternalId(context.companyId, username),
        context.companyId,
        resolvedBranchId || null,
        username,
        normalizePasswordForStorage(payload.password),
        nextIsActive ? 1 : 0,
        nextAccountStatus,
        nextSuspendedOn,
        nextInactiveOn,
        displayName,
        defaultTimeIn,
        defaultTimeOut,
        JSON.stringify(normalizedWeeklySchedule),
        JSON.stringify(featureAccessPayload),
        nextDailySalary
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

    const updatedUser = getUserById(id);
    syncAttendanceRowsForUser(updatedUser);
    return updatedUser;
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
        const updatedUser = getUserById(id);
        syncAttendanceRowsForUser(updatedUser);
        return updatedUser;
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

    const updatedUser = getUserById(id);
    syncAttendanceRowsForUser(updatedUser);
    return updatedUser;
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

function setUserAssignedTask(userId = '', taskPayload = '') {
    const context = requireTenantContext();
    const user = getScopedUser(context.companyId, userId);
    if (!user) {
        throw new Error('User not found.');
    }

    const accountStatus = getUserAccountStatus(user);
    if (accountStatus !== USER_ACCOUNT_STATUS_ACTIVE) {
        throw new Error('Tasks can be assigned to active users only.');
    }

    const requestedTaskIds = Array.isArray(taskPayload)
        ? parseTaskIdList(taskPayload)
        : parseTaskIdList(
            taskPayload?.taskIds
            ?? taskPayload?.task_ids
            ?? taskPayload?.taskId
            ?? taskPayload?.task_id
            ?? taskPayload
        );
    const tasks = requestedTaskIds.map((taskId) => {
        const task = getTaskById(taskId, context.companyId);
        if (!task || !task.is_active) {
            throw new Error('Task not found.');
        }
        return task;
    });
    const taskIds = tasks.map((task) => task.id);
    const hasCustomTaskPayload = taskPayload && typeof taskPayload === 'object' && !Array.isArray(taskPayload)
        && (
            Object.prototype.hasOwnProperty.call(taskPayload, 'customTasks')
            || Object.prototype.hasOwnProperty.call(taskPayload, 'custom_tasks')
        );
    const existingCustomTasks = parseCustomAssignedTasks(user.custom_assigned_tasks_json || '[]');
    const existingCustomByKey = new Map(existingCustomTasks.map((task) => [
        `${task.name.toLowerCase()}:${task.inputType}`,
        task
    ]));
    const requestedCustomTasks = hasCustomTaskPayload
        ? (taskPayload.customTasks ?? taskPayload.custom_tasks)
        : existingCustomTasks;
    const customTasks = (Array.isArray(requestedCustomTasks) ? requestedCustomTasks : [])
        .map((item) => {
            const name = normalizeTaskName(item?.name ?? item?.taskName ?? item?.task_name ?? '');
            const inputType = normalizeTaskInputType(item?.inputType ?? item?.input_type ?? '');
            if (!name) {
                return null;
            }
            const existing = existingCustomByKey.get(`${name.toLowerCase()}:${inputType}`);
            return {
                id: normalizeAssignedTaskId(item?.id || '') || existing?.id || generateId('custom_task'),
                name,
                inputType,
                isCustom: true
            };
        })
        .filter(Boolean);

    getMasterDb().prepare(`
        UPDATE users
        SET assigned_task_id = ?,
            assigned_task_ids_json = ?,
            custom_assigned_tasks_json = ?
        WHERE id = ?
    `).run(taskIds[0] || '', JSON.stringify(taskIds), JSON.stringify(customTasks), user.id);

    logAudit('user.task.update', 'user', user.username, {
        task_ids: taskIds,
        task_names: tasks.map((task) => task.name),
        custom_task_names: customTasks.map((task) => task.name)
    });

    return getUserById(user.username);
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

    const currentAccountStatus = getUserAccountStatus(user);
    const nextAccountStatus = resolveUserAccountStatusPayload(payload, currentAccountStatus);
    const nextIsActive = nextAccountStatus === USER_ACCOUNT_STATUS_ACTIVE;
    const wasActive = currentAccountStatus === USER_ACCOUNT_STATUS_ACTIVE;
    const wasSuspended = currentAccountStatus === USER_ACCOUNT_STATUS_SUSPENDED;
    const wasInactive = currentAccountStatus === USER_ACCOUNT_STATUS_INACTIVE;
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
    const nextSuspendedOn = nextAccountStatus === USER_ACCOUNT_STATUS_SUSPENDED
        ? (wasSuspended ? (getUserSuspendedOn(user) || getDateKey()) : getDateKey())
        : '';
    const nextInactiveOn = nextAccountStatus === USER_ACCOUNT_STATUS_INACTIVE
        ? (wasInactive ? (getUserInactiveOn(user) || getDateKey()) : getDateKey())
        : '';
    const finalPassword = normalizeText(payload.password)
        ? normalizePasswordForStorage(payload.password)
        : user.password_hash;
    const currentFeatureAccess = parseUserFeatureAccess(user.feature_access_json);
    const nextFeatureAccess = sanitizeUserFeatureAccessPayload(
        payload.feature_access || payload.featureAccess || {},
        currentFeatureAccess
    );
    const hasDailySalaryOverride = Object.prototype.hasOwnProperty.call(payload, 'dailySalary')
        || Object.prototype.hasOwnProperty.call(payload, 'daily_salary');
    const nextDailySalary = hasDailySalaryOverride
        ? normalizeDailySalaryValue(payload.dailySalary ?? payload.daily_salary)
        : coerceDailySalaryValue(user.daily_salary);
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
            account_status = ?,
            suspended_on = ?,
            inactive_on = ?,
            time_in = ?,
            time_out = ?,
            schedule_json = ?,
            feature_access_json = ?,
            assigned_task_id = ?,
            assigned_task_ids_json = ?,
            custom_assigned_tasks_json = ?,
            daily_salary = ?
        WHERE id = ?
    `).run(
        nextName,
        nextRole,
        finalPassword,
        resolvedBranchId || null,
        nextIsActive ? 1 : 0,
        nextAccountStatus,
        nextSuspendedOn,
        nextInactiveOn,
        defaultTimeIn,
        defaultTimeOut,
        JSON.stringify(nextWeeklySchedule),
        JSON.stringify(nextFeatureAccess),
        nextIsActive ? String(user.assigned_task_id || '').trim() : '',
        nextIsActive ? JSON.stringify(parseTaskIdList(user.assigned_task_ids_json || '[]', [user.assigned_task_id || ''])) : '[]',
        nextIsActive ? JSON.stringify(parseCustomAssignedTasks(user.custom_assigned_tasks_json || '[]')) : '[]',
        nextDailySalary,
        user.id
    );
    logAudit('user.update', 'user', id, {
        role: nextRole,
        is_active: nextIsActive,
        account_status: nextAccountStatus
    });

    if (nextAccountStatus === USER_ACCOUNT_STATUS_INACTIVE) {
        clearUserLoginConnectionsByInternalId(user.id);
    }

    const updatedUser = getUserById(id);
    syncAttendanceRowsForUser(updatedUser);
    return updatedUser;
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
        login_background_path: context.company.login_background_path || '',
        primary_color: context.company.primary_color || PARENT_BRAND.primaryColor,
        app_name: context.company.app_name || '',
        address: template.address || '',
        contact: template.contact || ''
    };
}

function getCompanyBulletin() {
    requireTenantContext();
    const storedBulletin = parseCompanyBulletin(getTenantMeta(COMPANY_BULLETIN_META_KEY));
    const todayKey = getDateKey();
    const announcement = getCompanyAnnouncementState(storedBulletin.announcement, todayKey);
    const calendarItems = sortCompanyHolidays(storedBulletin.holidays);
    const upcomingItems = calendarItems.filter((item) => getCompanyCalendarItemEndDate(item) >= todayKey);
    const recentItems = calendarItems.filter((item) => getCompanyCalendarItemEndDate(item) < todayKey);
    const todayItems = calendarItems.filter((item) => doesCompanyCalendarItemCoverDate(item, todayKey));
    const notificationItems = buildCompanyCalendarNotificationItems(calendarItems, todayKey, 3);
    const newsItems = calendarItems.filter((item) => isNewsLikeCalendarType(item.type));
    const holidayItems = calendarItems.filter((item) => !isNewsLikeCalendarType(item.type));

    return {
        announcement,
        activeAnnouncement: announcement.is_active ? announcement : null,
        holidays: calendarItems,
        calendarItems,
        holidayItems,
        newsItems,
        upcomingHolidays: upcomingItems,
        upcomingItems,
        recentHolidays: recentItems,
        recentItems,
        todayItems,
        notificationItems,
        todayKey
    };
}

function getCompanyBulletinFeed({ upcomingLimit = 6 } = {}) {
    const bulletin = getCompanyBulletin();
    const normalizedLimit = Math.max(1, Number(upcomingLimit) || 6);
    return {
        announcement: bulletin.announcement,
        activeAnnouncement: bulletin.activeAnnouncement,
        holidays: bulletin.holidays.slice(0, normalizedLimit),
        calendarItems: bulletin.calendarItems.slice(0, normalizedLimit),
        upcomingHolidays: bulletin.upcomingHolidays.slice(0, normalizedLimit),
        upcomingItems: bulletin.upcomingItems.slice(0, normalizedLimit),
        todayItems: bulletin.todayItems,
        notificationItems: bulletin.notificationItems,
        todayKey: bulletin.todayKey
    };
}

function updateCompanyAnnouncement(payload = {}) {
    const context = requireTenantContext();
    const bulletin = parseCompanyBulletin(getTenantMeta(COMPANY_BULLETIN_META_KEY));
    const nextAnnouncement = sanitizeCompanyAnnouncementInput({
        ...payload,
        updated_by: payload.updated_by || payload.updatedBy || context.requestUserId || context.actorUserId || ''
    }, bulletin.announcement);

    setCompanyBulletin({
        ...bulletin,
        announcement: nextAnnouncement
    });

    logAudit('company_bulletin.announcement_update', 'company_bulletin', COMPANY_BULLETIN_META_KEY, {
        starts_on: nextAnnouncement.starts_on,
        ends_on: nextAnnouncement.ends_on,
        has_title: Boolean(nextAnnouncement.title)
    });

    return getCompanyBulletin();
}

function clearCompanyAnnouncement() {
    requireTenantContext();
    const bulletin = parseCompanyBulletin(getTenantMeta(COMPANY_BULLETIN_META_KEY));
    setCompanyBulletin({
        ...bulletin,
        announcement: createEmptyCompanyAnnouncement()
    });

    logAudit('company_bulletin.announcement_clear', 'company_bulletin', COMPANY_BULLETIN_META_KEY, {});
    return getCompanyBulletin();
}

function addCompanyHoliday(payload = {}) {
    requireTenantContext();
    const bulletin = parseCompanyBulletin(getTenantMeta(COMPANY_BULLETIN_META_KEY));
    const nextHoliday = sanitizeCompanyHolidayInput(payload);
    assertCompanyHolidayUniqueness(bulletin.holidays, nextHoliday);

    setCompanyBulletin({
        ...bulletin,
        holidays: [...bulletin.holidays, nextHoliday]
    });

    logAudit('company_bulletin.holiday_add', 'company_holiday', nextHoliday.id, {
        start_date: nextHoliday.start_date,
        end_date: nextHoliday.end_date,
        type: nextHoliday.type
    });

    return getCompanyBulletin();
}

function updateCompanyHoliday(holidayId = '', payload = {}) {
    requireTenantContext();
    const normalizedHolidayId = normalizeIdentifier(holidayId);
    if (!normalizedHolidayId) {
        throw new Error('Holiday ID is required.');
    }

    const bulletin = parseCompanyBulletin(getTenantMeta(COMPANY_BULLETIN_META_KEY));
    const holidayIndex = bulletin.holidays.findIndex((holiday) => String(holiday.id || '') === normalizedHolidayId);
    if (holidayIndex === -1) {
        throw new Error('Holiday not found.');
    }

    const currentHoliday = bulletin.holidays[holidayIndex];
    const nextHoliday = sanitizeCompanyHolidayInput(payload, currentHoliday);
    assertCompanyHolidayUniqueness(bulletin.holidays, nextHoliday, {
        ignoreId: normalizedHolidayId
    });

    const nextHolidays = [...bulletin.holidays];
    nextHolidays[holidayIndex] = nextHoliday;

    setCompanyBulletin({
        ...bulletin,
        holidays: nextHolidays
    });

    logAudit('company_bulletin.holiday_update', 'company_holiday', normalizedHolidayId, {
        start_date: nextHoliday.start_date,
        end_date: nextHoliday.end_date,
        type: nextHoliday.type
    });

    return getCompanyBulletin();
}

function deleteCompanyHoliday(holidayId = '') {
    requireTenantContext();
    const normalizedHolidayId = normalizeIdentifier(holidayId);
    if (!normalizedHolidayId) {
        throw new Error('Holiday ID is required.');
    }

    const bulletin = parseCompanyBulletin(getTenantMeta(COMPANY_BULLETIN_META_KEY));
    const existingHoliday = bulletin.holidays.find((holiday) => String(holiday.id || '') === normalizedHolidayId);
    if (!existingHoliday) {
        throw new Error('Holiday not found.');
    }

    setCompanyBulletin({
        ...bulletin,
        holidays: bulletin.holidays.filter((holiday) => String(holiday.id || '') !== normalizedHolidayId)
    });

    logAudit('company_bulletin.holiday_delete', 'company_holiday', normalizedHolidayId, {
        start_date: existingHoliday.start_date || existingHoliday.date,
        end_date: existingHoliday.end_date || existingHoliday.date,
        type: existingHoliday.type
    });

    return getCompanyBulletin();
}

function normalizeLbcCollectionAssignee(entry = {}) {
    const id = String(entry?.id || entry?.userId || entry?.user_id || '').trim();
    if (!id) {
        return null;
    }
    const name = String(entry?.name || entry?.display_name || entry?.displayName || id).trim() || id;
    return { id, name };
}

function parseLbcCollectionAssignees(rawValue) {
    if (!rawValue) {
        return [];
    }
    try {
        const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        const rows = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed?.employees) ? parsed.employees : (Array.isArray(parsed?.items) ? parsed.items : []));
        const seen = new Set();
        const assignees = [];
        rows.forEach((entry) => {
            const normalized = normalizeLbcCollectionAssignee(entry);
            if (!normalized || seen.has(normalized.id)) {
                return;
            }
            seen.add(normalized.id);
            assignees.push(normalized);
        });
        return assignees;
    } catch (_error) {
        return [];
    }
}

function getLbcCollectionAssignees() {
    requireTenantContext();
    return parseLbcCollectionAssignees(getTenantMeta(LBC_COLLECTION_ASSIGNEES_META_KEY));
}

function setLbcCollectionAssignees(payload = {}) {
    requireTenantContext();
    const rows = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload?.employees) ? payload.employees : (Array.isArray(payload?.items) ? payload.items : []));
    const assignees = parseLbcCollectionAssignees(rows);
    setTenantMeta(LBC_COLLECTION_ASSIGNEES_META_KEY, JSON.stringify(assignees));
    logAudit('lbc_collection_assignees.update', 'lbc_collection_assignees', LBC_COLLECTION_ASSIGNEES_META_KEY, {
        count: assignees.length,
        user_ids: assignees.map((entry) => entry.id)
    });
    return assignees;
}

function isLbcCollectionAssignee(userId) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) {
        return false;
    }
    return getLbcCollectionAssignees().some((entry) => String(entry.id || '').trim() === normalizedUserId);
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

function getCompanyPricelistConfig() {
    requireTenantContext();
    return parsePricelistConfig(getTenantMeta(PRICELIST_CONFIG_META_KEY));
}

function updateCompanyPricelistConfig(payload = {}) {
    requireTenantContext();
    const normalizedConfig = parsePricelistConfig(payload);
    setTenantMeta(PRICELIST_CONFIG_META_KEY, JSON.stringify(normalizedConfig));
    logAudit('pricelist_config.update', 'pricelist_config', PRICELIST_CONFIG_META_KEY, {
        product_count: Object.keys(normalizedConfig.products || {}).length
    });
    return normalizedConfig;
}

function updateCompanySettings(payload = {}) {
    const context = requireTenantContext();
    const customDomainInput = payload.custom_domain === undefined
        ? context.company.custom_domain
        : payload.custom_domain;
    const hasLoginBackgroundPath = Object.prototype.hasOwnProperty.call(payload, 'login_background_path')
        || Object.prototype.hasOwnProperty.call(payload, 'loginBackgroundPath');
    const name = normalizeText(payload.name || context.company.name);
    const companyCode = normalizeIdentifier(payload.company_code || context.company.company_code || context.company.subdomain || DEFAULT_COMPANY_CODE);
    const subdomain = normalizeIdentifier(payload.subdomain || companyCode);
    const customDomain = normalizeOptionalDomain(customDomainInput);
    const primaryColor = normalizeText(payload.primary_color || context.company.primary_color || PARENT_BRAND.primaryColor);
    const logoPath = String(payload.logo_path || context.company.logo_path || '');
    const loginBackgroundPath = hasLoginBackgroundPath
        ? String(payload.login_background_path ?? payload.loginBackgroundPath ?? '')
        : String(context.company.login_background_path || '');
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
                login_background_path = ?,
                primary_color = ?,
                app_name = ?
            WHERE id = ?
        `).run(name, companyCode, subdomain, customDomain, logoPath, loginBackgroundPath, primaryColor, appName, context.company.id);
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
        SELECT id, name, contact_number, normalized_contact_number, address, client_type, source, created_at
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
        SELECT id, name, contact_number, normalized_contact_number, address, client_type, source, created_at
        FROM clients
        WHERE normalized_contact_number = ?
        LIMIT 1
    `).get(normalizedContactNumber);
}

function normalizeClientType(value, fallback = 'regular') {
    const normalizedValue = normalizeText(value).toLowerCase();
    if (normalizedValue === 'distributor') {
        return 'distributor';
    }
    if (normalizedValue === 'regular') {
        return 'regular';
    }
    return normalizeText(fallback).toLowerCase() === 'distributor' ? 'distributor' : 'regular';
}

function listClients(filter = '', { limit = 500, offset = 0, clientType = '' } = {}) {
    const db = getTenantDb();
    const normalizedFilter = normalizeText(filter);
    const normalizedOffset = Math.max(0, Number(offset) || 0);
    const normalizedLimit = Math.min(2500, Math.max(1, Number(limit) || 500));
    const normalizedClientType = normalizeText(clientType).toLowerCase() === 'distributor'
        ? 'distributor'
        : (normalizeText(clientType).toLowerCase() === 'regular' ? 'regular' : '');

    let rows;
    if (!normalizedFilter && !normalizedClientType) {
        rows = db.prepare(`
            SELECT id, name, contact_number, normalized_contact_number, address, client_type, source, created_at
            FROM clients
            ORDER BY name COLLATE NOCASE, contact_number
            LIMIT ? OFFSET ?
        `).all(normalizedLimit, normalizedOffset);
    } else {
        const contactPattern = `%${normalizeContactNumber(normalizedFilter) || normalizedFilter}%`;
        const clauses = [];
        const params = [];

        if (normalizedFilter) {
            clauses.push(`
                (
                    LOWER(name) LIKE LOWER(?)
                    OR contact_number LIKE ?
                    OR normalized_contact_number LIKE ?
                    OR LOWER(address) LIKE LOWER(?)
                    OR LOWER(client_type) LIKE LOWER(?)
                )
            `);
            params.push(
                `%${normalizedFilter}%`,
                `%${normalizedFilter}%`,
                contactPattern,
                `%${normalizedFilter}%`,
                `%${normalizedFilter}%`
            );
        }

        if (normalizedClientType) {
            clauses.push('LOWER(COALESCE(client_type, \'regular\')) = ?');
            params.push(normalizedClientType);
        }

        rows = db.prepare(`
            SELECT id, name, contact_number, normalized_contact_number, address, client_type, source, created_at
            FROM clients
            WHERE ${clauses.join(' AND ')}
            ORDER BY name COLLATE NOCASE, contact_number
            LIMIT ? OFFSET ?
        `).all(...params, normalizedLimit, normalizedOffset);
    }

    return rows;
}

function addClient({ name, contactNumber, address = '', source = 'manual', clientType = 'regular' }) {
    const normalizedName = normalizeText(name);
    const normalizedContactNumber = normalizeContactNumber(contactNumber);
    const formattedContactNumber = formatContactNumber(contactNumber);
    const normalizedAddress = normalizeText(address);
    const normalizedClientType = normalizeClientType(clientType);

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
                source,
                clientType: normalizedClientType
            }),
            action: 'updated'
        };
    }

    const result = getTenantDb().prepare(`
        INSERT INTO clients (name, contact_number, normalized_contact_number, address, client_type, source)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        normalizedName,
        formattedContactNumber,
        normalizedContactNumber,
        normalizedAddress,
        normalizedClientType,
        normalizeText(source) || 'manual'
    );

    return {
        ...getClientById(result.lastInsertRowid),
        action: 'created'
    };
}

function updateClient(id, { name, contactNumber, address = '', source = 'manual', clientType } = {}) {
    const client = getClientById(id);
    if (!client) {
        throw new Error('Client not found.');
    }

    const normalizedName = normalizeText(name);
    const normalizedContactNumber = normalizeContactNumber(contactNumber);
    const formattedContactNumber = formatContactNumber(contactNumber);
    const normalizedAddress = normalizeText(address);
    const normalizedClientType = clientType === undefined
        ? normalizeClientType(client.client_type, 'regular')
        : normalizeClientType(clientType, client.client_type);

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
            client_type = ?,
            source = ?
        WHERE id = ?
    `).run(
        normalizedName,
        formattedContactNumber,
        normalizedContactNumber,
        normalizedAddress,
        normalizedClientType,
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

function saveClientProfile({ name, contactNumber, address = '', source = 'manual', clientType } = {}) {
    const existing = getClientByContactNumber(contactNumber);
    return existing
        ? updateClient(existing.id, { name, contactNumber, address, source, clientType })
        : addClient({ name, contactNumber, address, source, clientType });
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

function buildCompanyRegistrationRequestCode() {
    const now = new Date();
    const dateStamp = [
        String(now.getUTCFullYear()).slice(-2),
        String(now.getUTCMonth() + 1).padStart(2, '0'),
        String(now.getUTCDate()).padStart(2, '0')
    ].join('');
    const randomPart = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `CID-${dateStamp}-${randomPart}`;
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
        requestMeta: parseRequestMeta(row.request_meta_json),
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
    requestMeta = {},
    source = 'customer_portal'
} = {}) {
    const normalizedName = normalizeText(clientName);
    const normalizedContactNumber = normalizeContactNumber(contactNumber);
    const formattedContactNumber = formatContactNumber(contactNumber);
    const normalizedRequestDetails = normalizeMultilineText(requestDetails, { maxLength: 10000 });
    const normalizedInitialMessage = normalizeMultilineText(initialMessage, { maxLength: 3000 });
    const normalizedRequestMeta = sanitizeRequestMeta(requestMeta);
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
            request_details, request_meta_json, status, allow_customer_edit, source
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 1, ?)
    `).run(
        requestCode,
        client?.id ?? null,
        normalizedName,
        formattedContactNumber,
        normalizedContactNumber,
        normalizedRequestDetails,
        JSON.stringify(normalizedRequestMeta || {}),
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

function listSignupRequests({ status = 'open', filter = '', limit = 200 } = {}) {
    const normalizedStatus = normalizeCustomerRequestStatus(status, '');
    const items = listCustomerRequests({
        status: normalizedStatus,
        filter,
        limit: Math.max(1, Math.min(500, Number(limit || 200)))
    });

    return items.filter((item) => isSignupRequest(item));
}

function setUserLoginEmail({ userId = '', email = '', verified = false } = {}) {
    const context = requireTenantContext();
    const user = getScopedUser(context.companyId, userId);
    if (!user) {
        throw new Error('User not found.');
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
        throw new Error('Invalid email address.');
    }

    const conflict = findUserByLinkedEmail(context.companyId, normalizedEmail, user.id);
    if (conflict) {
        throw new Error('Email is already linked to another account.');
    }

    getMasterDb().prepare(`
        UPDATE users
        SET login_email = ?,
            login_email_verified = ?
        WHERE id = ?
    `).run(normalizedEmail, verified ? 1 : 0, user.id);

    return getUserById(userId);
}

function approveSignupRequest({
    requestCode = '',
    userId = '',
    name = '',
    role = 'employee',
    password = '',
    email = ''
} = {}) {
    const request = getCustomerRequestByCode(requestCode);
    if (!request) {
        throw new Error('Signup request not found.');
    }
    if (!isSignupRequest(request)) {
        throw new Error('Request is not a signup request.');
    }

    const meta = request.requestMeta || {};
    const resolvedName = normalizeText(name || request.clientName || meta.name || meta.fullName);
    if (!resolvedName) {
        throw new Error('Name is required.');
    }

    const desiredId = normalizeText(userId || meta.desiredId || meta.userId || meta.employeeId || meta.email || '');
    if (!desiredId) {
        throw new Error('User ID is required.');
    }

    const normalizedRole = normalizeRole(role || meta.role || ROLE_EMPLOYEE);
    if (normalizedRole !== ROLE_EMPLOYEE && normalizedRole !== ROLE_STAFF && normalizedRole !== ROLE_COMPANY_ADMIN) {
        throw new Error('Invalid role for signup approval.');
    }

    const newUser = addUser({
        id: desiredId,
        name: resolvedName,
        password,
        role: normalizedRole
    });

    const normalizedEmail = normalizeEmail(email || meta.email || '');
    if (normalizedEmail) {
        setUserLoginEmail({ userId: newUser.id, email: normalizedEmail, verified: false });
    }

    const thread = updateCustomerRequestByCode(request.requestCode, {
        status: 'resolved',
        allowCustomerEdit: false
    }, { actor: 'admin' });

    addCustomerRequestMessageByCode(request.requestCode, {
        senderName: 'Head Admin',
        message: `Signup approved. User ID: ${newUser.id}. Role: ${newUser.role}.`,
        source: 'admin'
    }, { actor: 'admin' });

    return {
        user: getUserById(newUser.id),
        request: thread.request
    };
}

function rejectSignupRequest({ requestCode = '', reason = '' } = {}) {
    const request = getCustomerRequestByCode(requestCode);
    if (!request) {
        throw new Error('Signup request not found.');
    }
    if (!isSignupRequest(request)) {
        throw new Error('Request is not a signup request.');
    }

    const thread = updateCustomerRequestByCode(request.requestCode, {
        status: 'closed',
        allowCustomerEdit: false
    }, { actor: 'admin' });

    const message = normalizeText(reason)
        ? `Signup rejected. ${normalizeText(reason)}`
        : 'Signup rejected by admin.';

    addCustomerRequestMessageByCode(request.requestCode, {
        senderName: 'Head Admin',
        message,
        source: 'admin'
    }, { actor: 'admin' });

    return thread;
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

function appendCustomerRequestTranscriptByCode(requestCode, entries = []) {
    const request = getCustomerRequestByCode(requestCode);
    if (!request) {
        throw new Error('Customer request not found.');
    }

    const normalizedEntries = (Array.isArray(entries) ? entries : [])
        .map((entry) => {
            const roleHint = normalizeText(
                entry?.senderType
                || entry?.actor
                || entry?.role
                || entry?.type
            ).toLowerCase();
            const senderType = roleHint === 'assistant'
                ? 'admin'
                : normalizeCustomerRequestActor(roleHint, 'customer');
            const senderName = normalizeText(entry?.senderName || entry?.name || '')
                || (senderType === 'admin' ? 'Admin' : request.clientName || 'Customer');
            const message = normalizeMultilineText(
                entry?.message ?? entry?.text ?? entry?.content ?? '',
                { maxLength: 3000 }
            );
            const source = normalizeText(entry?.source)
                || (senderType === 'admin' ? 'admin_panel' : 'customer_portal');

            if (!message) {
                return null;
            }

            return {
                senderType,
                senderName,
                message,
                source
            };
        })
        .filter(Boolean);

    if (!normalizedEntries.length) {
        return getCustomerRequestThreadByCode(request.requestCode);
    }

    const db = getTenantDb();
    const insertMessage = db.prepare(`
        INSERT INTO customer_request_messages (
            request_id, sender_type, sender_name, message_text, source
        )
        VALUES (?, ?, ?, ?, ?)
    `);

    db.transaction((items) => {
        items.forEach((item) => {
            insertMessage.run(
                request.id,
                item.senderType,
                item.senderName,
                item.message,
                item.source
            );
        });
    })(normalizedEntries);

    db.prepare(`
        UPDATE customer_requests
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(request.id);

    return getCustomerRequestThreadByCode(request.requestCode);
}

function serializeCompanyRegistrationRequest(row) {
    if (!row) {
        return null;
    }

    return {
        id: Number(row.id),
        requestCode: String(row.request_code || ''),
        clientId: null,
        clientName: String(row.client_name || ''),
        contactNumber: String(row.contact_number || ''),
        normalizedContactNumber: String(row.normalized_contact_number || ''),
        requestDetails: String(row.request_details || ''),
        requestMeta: parseRequestMeta(row.request_meta_json),
        status: normalizeCustomerRequestStatus(row.status, 'open'),
        allowCustomerEdit: Boolean(Number(row.allow_customer_edit || 0)),
        source: String(row.source || ''),
        createdAt: String(row.created_at || ''),
        updatedAt: String(row.updated_at || ''),
        messageCount: Number(row.message_count || 0),
        lastMessageAt: String(row.last_message_at || row.updated_at || row.created_at || '')
    };
}

function getCompanyRegistrationRequestByCode(requestCode) {
    ensureSystemReady();
    const normalizedCode = normalizeText(requestCode).toUpperCase();
    if (!normalizedCode) {
        return null;
    }

    const row = getMasterDb().prepare(`
        SELECT
            requests.*,
            COALESCE((
                SELECT COUNT(*)
                FROM company_registration_request_messages messages
                WHERE messages.request_id = requests.id
            ), 0) AS message_count,
            COALESCE((
                SELECT messages.created_at
                FROM company_registration_request_messages messages
                WHERE messages.request_id = requests.id
                ORDER BY messages.id DESC
                LIMIT 1
            ), requests.updated_at, requests.created_at) AS last_message_at
        FROM company_registration_requests requests
        WHERE UPPER(requests.request_code) = ?
        LIMIT 1
    `).get(normalizedCode);

    return serializeCompanyRegistrationRequest(row);
}

function listCompanyRegistrationRequests({ filter = '', status = '', limit = 200 } = {}) {
    ensureSystemReady();
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
            OR LOWER(COALESCE(requests.request_meta_json, '')) LIKE LOWER(?)
        )`);
        params.push(
            `%${normalizedFilter}%`,
            `%${normalizedFilter}%`,
            `%${normalizedFilter}%`,
            contactPattern,
            `%${normalizedFilter}%`,
            `%${normalizedFilter}%`
        );
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = getMasterDb().prepare(`
        SELECT
            requests.*,
            COALESCE((
                SELECT COUNT(*)
                FROM company_registration_request_messages messages
                WHERE messages.request_id = requests.id
            ), 0) AS message_count,
            COALESCE((
                SELECT messages.created_at
                FROM company_registration_request_messages messages
                WHERE messages.request_id = requests.id
                ORDER BY messages.id DESC
                LIMIT 1
            ), requests.updated_at, requests.created_at) AS last_message_at
        FROM company_registration_requests requests
        ${whereClause}
        ORDER BY datetime(requests.updated_at) DESC, requests.id DESC
        LIMIT ?
    `).all(...params, safeLimit);

    return rows.map(serializeCompanyRegistrationRequest);
}

function getCompanyRegistrationRequestMessages(requestId, { limit = 200 } = {}) {
    ensureSystemReady();
    const safeLimit = Math.max(1, Math.min(500, Number(limit || 200)));
    const rows = getMasterDb().prepare(`
        SELECT id, request_id, sender_type, sender_name, message_text, source, created_at
        FROM company_registration_request_messages
        WHERE request_id = ?
        ORDER BY id DESC
        LIMIT ?
    `).all(Number(requestId), safeLimit);

    return rows.reverse().map(serializeCustomerRequestMessage);
}

function assertCompanyRegistrationRequestContact(request, contactNumber) {
    const normalizedInput = normalizeContactNumber(contactNumber);
    if (!normalizedInput) {
        throw new Error('Contact number is required.');
    }

    if (normalizedInput !== String(request?.normalizedContactNumber || '')) {
        throw new Error('Contact number does not match this request.');
    }
}

function getCompanyRegistrationRequestThreadByCode(requestCode, { contactNumber = '', limit = 200 } = {}) {
    const request = getCompanyRegistrationRequestByCode(requestCode);
    if (!request) {
        throw new Error('Company registration request not found.');
    }

    if (contactNumber) {
        assertCompanyRegistrationRequestContact(request, contactNumber);
    }

    return {
        request,
        messages: getCompanyRegistrationRequestMessages(request.id, { limit })
    };
}

function createCompanyRegistrationRequest({
    clientName = '',
    contactNumber = '',
    requestDetails = '',
    initialMessage = '',
    requestMeta = {},
    source = 'public_portal'
} = {}) {
    ensureSystemReady();
    const normalizedName = normalizeText(clientName);
    const normalizedContactNumber = normalizeContactNumber(contactNumber);
    const formattedContactNumber = formatContactNumber(contactNumber);
    const normalizedRequestDetails = normalizeMultilineText(requestDetails, { maxLength: 10000 });
    const normalizedInitialMessage = normalizeMultilineText(initialMessage, { maxLength: 3000 });
    const normalizedRequestMeta = sanitizeRequestMeta(requestMeta);
    const normalizedSource = normalizeText(source) || 'public_portal';
    let requestCode = '';

    if (!normalizedName) {
        throw new Error('Contact person is required.');
    }

    if (!normalizedContactNumber) {
        throw new Error('Contact number is required.');
    }

    if (!normalizedRequestDetails && !normalizedInitialMessage) {
        throw new Error('Request details or initial message is required.');
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = buildCompanyRegistrationRequestCode();
        if (!getCompanyRegistrationRequestByCode(candidate)) {
            requestCode = candidate;
            break;
        }
    }

    if (!requestCode) {
        throw new Error('Unable to generate request code. Please try again.');
    }

    const insertRequestResult = getMasterDb().prepare(`
        INSERT INTO company_registration_requests (
            request_code, client_name, contact_number, normalized_contact_number,
            request_details, request_meta_json, status, allow_customer_edit, source
        )
        VALUES (?, ?, ?, ?, ?, ?, 'open', 1, ?)
    `).run(
        requestCode,
        normalizedName,
        formattedContactNumber,
        normalizedContactNumber,
        normalizedRequestDetails,
        JSON.stringify(normalizedRequestMeta || {}),
        normalizedSource
    );

    if (normalizedInitialMessage) {
        getMasterDb().prepare(`
            INSERT INTO company_registration_request_messages (
                request_id, sender_type, sender_name, message_text, source
            )
            VALUES (?, 'customer', ?, ?, ?)
        `).run(
            Number(insertRequestResult.lastInsertRowid),
            normalizedName || 'Customer',
            normalizedInitialMessage,
            normalizedSource
        );

        getMasterDb().prepare(`
            UPDATE company_registration_requests
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(Number(insertRequestResult.lastInsertRowid));
    }

    return getCompanyRegistrationRequestThreadByCode(requestCode);
}

function updateCompanyRegistrationRequestByCode(requestCode, payload = {}, { actor = 'admin', contactNumber = '' } = {}) {
    ensureSystemReady();
    const request = getCompanyRegistrationRequestByCode(requestCode);
    if (!request) {
        throw new Error('Company registration request not found.');
    }

    const normalizedActor = normalizeCustomerRequestActor(actor, 'admin');
    if (normalizedActor === 'customer') {
        assertCompanyRegistrationRequestContact(request, contactNumber);
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
        throw new Error('Contact person is required.');
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

    getMasterDb().prepare(`
        UPDATE company_registration_requests
        SET
            client_name = ?,
            contact_number = ?,
            normalized_contact_number = ?,
            request_details = ?,
            status = ?,
            allow_customer_edit = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        nextClientName,
        nextContactNumber,
        nextNormalizedContactNumber,
        nextRequestDetails,
        nextStatus,
        nextAllowCustomerEdit ? 1 : 0,
        request.id
    );

    return getCompanyRegistrationRequestThreadByCode(request.requestCode);
}

function addCompanyRegistrationRequestMessageByCode(requestCode, payload = {}, { actor = 'customer', contactNumber = '' } = {}) {
    ensureSystemReady();
    const request = getCompanyRegistrationRequestByCode(requestCode);
    if (!request) {
        throw new Error('Company registration request not found.');
    }

    const normalizedActor = normalizeCustomerRequestActor(actor, 'customer');
    if (normalizedActor === 'customer') {
        assertCompanyRegistrationRequestContact(request, contactNumber);
    }

    const message = normalizeMultilineText(payload.message ?? payload.text ?? '', { maxLength: 3000 });
    if (!message) {
        throw new Error('Message is required.');
    }

    const senderType = normalizedActor === 'admin' ? 'admin' : 'customer';
    const senderName = normalizeText(payload.senderName)
        || (senderType === 'admin' ? 'Admin' : request.clientName || 'Customer');
    const source = normalizeText(payload.source)
        || (senderType === 'admin' ? 'admin_panel' : 'public_portal');

    getMasterDb().prepare(`
        INSERT INTO company_registration_request_messages (
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

    getMasterDb().prepare(`
        UPDATE company_registration_requests
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(nextStatus, request.id);

    return getCompanyRegistrationRequestThreadByCode(request.requestCode);
}

function getUsersMap() {
    return new Map(listUsers('').map((user) => [String(user.id), user]));
}

function normalizeAttendanceRow(row, userMap) {
    const user = userMap.get(String(row.id)) || null;
    const name = row.name || user?.name || row.id || 'Unknown';
    const dateKey = getDateKey(row.date);
    const scheduleForDate = getUserScheduleForDate(user, row.date);
    const timeIn = formatTimeValue(row.time_in || '');
    const timeOut = formatTimeValue(row.time_out || '');
    const hasClockActivity = Boolean(timeIn || timeOut);
    const unavailableStatus = getAttendanceAccountStatusLabel(user, dateKey);
    const holidayStatus = getAttendanceHolidayStatus(dateKey);
    const isUnavailableWithoutLogs = Boolean(unavailableStatus) && !hasClockActivity;
    const isHolidayWithoutLogs = Boolean(holidayStatus) && !hasClockActivity;
    const scheduledTimeIn = scheduleForDate.is_day_off || isUnavailableWithoutLogs || isHolidayWithoutLogs ? '' : scheduleForDate.time_in;
    const scheduledTimeOut = scheduleForDate.is_day_off || isUnavailableWithoutLogs || isHolidayWithoutLogs ? '' : scheduleForDate.time_out;
    const attendanceTimingOptions = { user, dateKey };
    const lateMinutes = calculateLateMinutes(timeIn, scheduledTimeIn, attendanceTimingOptions);
    const status = isUnavailableWithoutLogs
        ? unavailableStatus
        : (isHolidayWithoutLogs
            ? holidayStatus
        : (scheduleForDate.is_day_off && !hasClockActivity
        ? 'Day Off'
        : normalizeStatus(row.remarks, lateMinutes, Boolean(timeIn))));
    const displayRemarks = buildAttendanceDisplayRemark(
        row.remarks || '',
        timeIn,
        scheduledTimeIn,
        attendanceTimingOptions
    );
    const taskResults = parseAttendanceTaskResults(row.task_results_json || '[]', {
        taskId: row.task_id,
        taskName: row.task_name,
        taskCount: row.task_count
    });
    const primaryTaskResult = taskResults[0] || null;
    const workedHours = calculateWorkedHours(timeIn, timeOut, scheduledTimeIn, scheduledTimeOut, { user })
        || String(row.worked_hours || '').trim()
        || '0.00';
    const parsedDate = parseDateValue(row.date);
    const payrollMetadata = buildAttendancePayrollMetadata({
        timeIn,
        timeOut,
        scheduledTimeIn,
        scheduledTimeOut,
        options: { user, dateKey }
    });

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
        displayRemarks,
        timeoutIssues: String(row.timeout_issues || ''),
        timeoutRemarks: String(row.timeout_remarks || ''),
        createdAt: String(row.created_at || ''),
        updatedAt: String(row.updated_at || ''),
        taskResults,
        taskId: primaryTaskResult?.id || '',
        taskName: primaryTaskResult?.name || '',
        taskCount: primaryTaskResult ? Math.max(0, Number(primaryTaskResult.count || 0) || 0) : 0,
        scheduledTimeIn,
        scheduledTimeOut,
        ...payrollMetadata,
        isHoliday: Boolean(holidayStatus),
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

function compareAttendanceChronological(a, b) {
    if (a.dateKey !== b.dateKey) {
        return a.dateKey < b.dateKey ? -1 : 1;
    }

    if (a.timeIn !== b.timeIn) {
        return a.timeIn < b.timeIn ? -1 : 1;
    }

    return String(a.id).localeCompare(String(b.id));
}

function getUsersMapByIds(userIds = []) {
    const normalizedIds = [...new Set(
        (Array.isArray(userIds) ? userIds : [userIds])
            .map((userId) => normalizeText(userId))
            .filter(Boolean)
    )];
    const userMap = new Map();

    normalizedIds.forEach((userId) => {
        const user = getUserById(userId);
        if (user) {
            userMap.set(String(user.id), user);
        }
    });

    return userMap;
}

function normalizeAttendanceRows(rows, userMap = null) {
    const resolvedUserMap = userMap instanceof Map ? userMap : getUsersMap();
    return rows.map((row) => normalizeAttendanceRow(row, resolvedUserMap)).sort(compareAttendance);
}

function queryAttendanceRows({ userIds = [], startDateKey = '', endDateKey = '', limit = 0 } = {}) {
    const clauses = [];
    const params = [];
    const normalizedUserIds = [...new Set(
        (Array.isArray(userIds) ? userIds : [userIds])
            .map((userId) => normalizeText(userId))
            .filter(Boolean)
    )];
    const normalizedStartDateKey = normalizeDateKey(startDateKey);
    const normalizedEndDateKey = normalizeDateKey(endDateKey);

    if (normalizedUserIds.length === 1) {
        clauses.push('id = ?');
        params.push(normalizedUserIds[0]);
    } else if (normalizedUserIds.length > 1) {
        clauses.push(`id IN (${normalizedUserIds.map(() => '?').join(', ')})`);
        params.push(...normalizedUserIds);
    }

    if (normalizedStartDateKey) {
        clauses.push('date >= ?');
        params.push(normalizedStartDateKey);
    }

    if (normalizedEndDateKey) {
        clauses.push('date <= ?');
        params.push(normalizedEndDateKey);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const normalizedLimit = Math.max(0, Number(limit) || 0);
    const limitClause = normalizedLimit > 0 ? `LIMIT ${Math.floor(normalizedLimit)}` : '';

    return getTenantDb().prepare(`
        SELECT rowid AS row_id, *
        FROM attendance
        ${whereClause}
        ORDER BY date DESC, time_in DESC, id COLLATE NOCASE
        ${limitClause}
    `).all(...params);
}

function getAttendanceEntriesByFilters({ userIds = [], startDateKey = '', endDateKey = '', userMap = null, limit = 0 } = {}) {
    const rows = queryAttendanceRows({ userIds, startDateKey, endDateKey, limit });
    return normalizeAttendanceRows(
        rows,
        userMap || (Array.isArray(userIds) && userIds.length ? getUsersMapByIds(userIds) : null)
    );
}

function listAttendanceEntries() {
    return getAttendanceEntriesByFilters();
}

function getAttendanceByUser(userId) {
    return getAttendanceEntriesByFilters({ userIds: [userId] });
}

function getAttendanceForMonth(userId, year, month) {
    const dateKeys = getMonthDateKeys(Number(year), Number(month));
    if (!dateKeys.length) {
        return [];
    }
    return getAttendanceEntriesByFilters({
        userIds: [userId],
        startDateKey: dateKeys[0],
        endDateKey: dateKeys[dateKeys.length - 1]
    });
}

function buildAbsentEntry(user, dateKey) {
    const parsedDate = parseDateValue(dateKey);
    const scheduleForDate = getUserScheduleForDate(user, dateKey);
    const unavailableStatus = getAttendanceAccountStatusLabel(user, dateKey);
    const holidayStatus = getAttendanceHolidayStatus(dateKey);
    const status = unavailableStatus || holidayStatus || (scheduleForDate.is_day_off ? 'Day Off' : 'Absent');
    const scheduledTimeIn = scheduleForDate.is_day_off || unavailableStatus || holidayStatus ? '' : formatTimeValue(scheduleForDate.time_in || '');
    const scheduledTimeOut = scheduleForDate.is_day_off || unavailableStatus || holidayStatus ? '' : formatTimeValue(scheduleForDate.time_out || '');
    const payrollMetadata = buildAttendancePayrollMetadata({
        scheduledTimeIn,
        scheduledTimeOut,
        options: { user, dateKey }
    });

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
        displayRemarks: '',
        taskResults: [],
        taskId: '',
        taskName: '',
        taskCount: 0,
        scheduledTimeIn,
        scheduledTimeOut,
        ...payrollMetadata,
        isHoliday: Boolean(holidayStatus),
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

function getSemiMonthlyDateKeys(input = new Date()) {
    const selectedDate = parseDateValue(input);
    if (!selectedDate) {
        throw new Error('Invalid date.');
    }

    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth() + 1;
    const dayOfMonth = selectedDate.getDate();
    const rangeStartDay = dayOfMonth <= 15 ? 1 : 16;
    const rangeEndDay = dayOfMonth <= 15 ? 15 : new Date(year, month, 0).getDate();

    return getMonthDateKeys(year, month).filter((dateKey) => {
        const dateDay = Number(String(dateKey).slice(-2));
        return dateDay >= rangeStartDay && dateDay <= rangeEndDay;
    });
}

function getSemiMonthlyBounds(input = new Date()) {
    const dateKeys = getSemiMonthlyDateKeys(input);
    if (!dateKeys.length) {
        throw new Error('Invalid cutoff date.');
    }

    return {
        cutoffStartDateKey: dateKeys[0],
        cutoffEndDateKey: dateKeys[dateKeys.length - 1]
    };
}

function coercePayrollCutoffPayoutStatus(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    return PAYROLL_CUTOFF_PAYOUT_STATUSES.has(normalized)
        ? normalized
        : PAYROLL_CUTOFF_PAYOUT_PENDING;
}

function normalizePayrollCutoffPayoutStatus(value, { required = false } = {}) {
    if (value === undefined) {
        if (required) {
            throw new Error('Payout status is required.');
        }
        return PAYROLL_CUTOFF_PAYOUT_PENDING;
    }

    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
        if (required) {
            throw new Error('Payout status is required.');
        }
        return PAYROLL_CUTOFF_PAYOUT_PENDING;
    }

    if (!PAYROLL_CUTOFF_PAYOUT_STATUSES.has(normalized)) {
        throw new Error('Payout status must be pending or paid.');
    }

    return normalized;
}

function getDataUrlByteLength(dataUrl = '') {
    const text = String(dataUrl || '');
    const commaIndex = text.indexOf(',');
    if (commaIndex < 0) {
        return text.length;
    }

    const base64 = text.slice(commaIndex + 1);
    const padding = base64.endsWith('==') ? 2 : (base64.endsWith('=') ? 1 : 0);
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function normalizePayslipPhotoPayload(payload = {}) {
    const removePayslipPhoto = normalizeBooleanValue(
        payload.removePayslipPhoto ?? payload.remove_payslip_photo,
        false
    );
    if (removePayslipPhoto) {
        return {
            dataUrl: '',
            name: '',
            isRemove: true
        };
    }

    const dataUrl = String(
        payload.payslipPhotoDataUrl
        ?? payload.payslip_photo_data_url
        ?? payload.photoDataUrl
        ?? payload.dataUrl
        ?? ''
    ).trim();
    if (!dataUrl) {
        throw new Error('Payslip photo is required.');
    }
    if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)) {
        throw new Error('Payslip upload must be an image file.');
    }
    if (getDataUrlByteLength(dataUrl) > PAYSLIP_PHOTO_MAX_BYTES) {
        throw new Error('Payslip photo is too large. Please upload a smaller image.');
    }

    const name = normalizeText(
        payload.payslipPhotoName
        ?? payload.payslip_photo_name
        ?? payload.fileName
        ?? payload.name
        ?? ''
    ).slice(0, 160) || 'Payslip photo';

    return {
        dataUrl,
        name,
        isRemove: false
    };
}

function buildDefaultPayrollCutoffStatus(userId = '', {
    cutoffStartDateKey = '',
    cutoffEndDateKey = ''
} = {}) {
    return {
        userId: String(userId || '').trim(),
        cutoffStartDateKey,
        cutoffEndDateKey,
        payoutStatus: PAYROLL_CUTOFF_PAYOUT_PENDING,
        paidAt: '',
        updatedAt: '',
        updatedBy: '',
        payslipPhotoDataUrl: '',
        payslipPhotoName: '',
        payslipPhotoUploadedAt: '',
        payslipPhotoUploadedBy: ''
    };
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
    if (!employees.length || !dateKeys.length) {
        return [];
    }
    const employeeIds = new Set(employees.map((user) => String(user.id)));
    const requestedDateKeys = new Set(dateKeys);
    const attendanceMap = new Map();
    const sortedDateKeys = [...requestedDateKeys].sort();
    const userMap = new Map(employees.map((user) => [String(user.id), user]));

    getAttendanceEntriesByFilters({
        userIds: [...employeeIds],
        startDateKey: sortedDateKeys[0],
        endDateKey: sortedDateKeys[sortedDateKeys.length - 1],
        userMap
    }).forEach((entry) => {
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

    const dateKeys = getMonthDateKeys(Number(year), Number(month));
    const attendanceMap = new Map(
        (dateKeys.length
            ? getAttendanceEntriesByFilters({
                userIds: [userId],
                startDateKey: dateKeys[0],
                endDateKey: dateKeys[dateKeys.length - 1],
                userMap: new Map([[String(user.id), user]])
            })
            : []
        ).map((entry) => [entry.dateKey, entry])
    );

    return dateKeys
        .map((dateKey) => attendanceMap.get(dateKey) || buildAbsentEntry(user, dateKey))
        .sort(compareAttendance);
}

function getUserWeeklyTimeCard(userId, input = new Date()) {
    const user = getUserById(userId);
    if (!user) {
        throw new Error('User not found.');
    }

    const dateKeys = getWeeklyDateKeys(input);
    const attendanceMap = new Map(
        (dateKeys.length
            ? getAttendanceEntriesByFilters({
                userIds: [userId],
                startDateKey: dateKeys[0],
                endDateKey: dateKeys[dateKeys.length - 1],
                userMap: new Map([[String(user.id), user]])
            })
            : []
        ).map((entry) => [entry.dateKey, entry])
    );

    return dateKeys
        .map((dateKey) => attendanceMap.get(dateKey) || buildAbsentEntry(user, dateKey))
        .sort(compareAttendance);
}

function getUserSemiMonthlyTimeCard(userId, input = new Date()) {
    const user = getUserById(userId);
    if (!user) {
        throw new Error('User not found.');
    }

    const dateKeys = getSemiMonthlyDateKeys(input);
    const attendanceMap = new Map(
        (dateKeys.length
            ? getAttendanceEntriesByFilters({
                userIds: [userId],
                startDateKey: dateKeys[0],
                endDateKey: dateKeys[dateKeys.length - 1],
                userMap: new Map([[String(user.id), user]])
            })
            : []
        ).map((entry) => [entry.dateKey, entry])
    );

    return dateKeys
        .map((dateKey) => attendanceMap.get(dateKey) || buildAbsentEntry(user, dateKey))
        .sort(compareAttendanceChronological);
}

function getUserCutoffPayrollStatus(userId, input = new Date()) {
    const user = getUserById(userId);
    if (!user || !isEmployeeLikeRole(user.role)) {
        throw new Error('Employee not found.');
    }

    const { cutoffStartDateKey, cutoffEndDateKey } = getSemiMonthlyBounds(input);
    const row = getTenantDb().prepare(`
        SELECT
            user_id,
            cutoff_start_date,
            cutoff_end_date,
            payout_status,
            paid_at,
            updated_at,
            updated_by,
            payslip_photo_data_url,
            payslip_photo_name,
            payslip_photo_uploaded_at,
            payslip_photo_uploaded_by
        FROM payroll_cutoff_statuses
        WHERE user_id = ?
          AND cutoff_start_date = ?
          AND cutoff_end_date = ?
        LIMIT 1
    `).get(user.id, cutoffStartDateKey, cutoffEndDateKey);

    if (!row) {
        return buildDefaultPayrollCutoffStatus(user.id, {
            cutoffStartDateKey,
            cutoffEndDateKey
        });
    }

    return {
        userId: String(row.user_id || user.id || '').trim(),
        cutoffStartDateKey: String(row.cutoff_start_date || cutoffStartDateKey || '').trim(),
        cutoffEndDateKey: String(row.cutoff_end_date || cutoffEndDateKey || '').trim(),
        payoutStatus: coercePayrollCutoffPayoutStatus(row.payout_status),
        paidAt: String(row.paid_at || '').trim(),
        updatedAt: String(row.updated_at || '').trim(),
        updatedBy: String(row.updated_by || '').trim(),
        payslipPhotoDataUrl: String(row.payslip_photo_data_url || '').trim(),
        payslipPhotoName: String(row.payslip_photo_name || '').trim(),
        payslipPhotoUploadedAt: String(row.payslip_photo_uploaded_at || '').trim(),
        payslipPhotoUploadedBy: String(row.payslip_photo_uploaded_by || '').trim()
    };
}

function setUserCutoffPayrollStatus(userId, input = new Date(), status = PAYROLL_CUTOFF_PAYOUT_PENDING) {
    const user = getUserById(userId);
    if (!user || !isEmployeeLikeRole(user.role)) {
        throw new Error('Employee not found.');
    }

    const normalizedStatus = normalizePayrollCutoffPayoutStatus(status, { required: true });
    const { cutoffStartDateKey, cutoffEndDateKey } = getSemiMonthlyBounds(input);
    const nowIso = new Date().toISOString();
    const updatedBy = normalizeText(getCurrentContext()?.actorUserId || getCurrentContext()?.requestUserId || '');
    const paidAt = normalizedStatus === PAYROLL_CUTOFF_PAYOUT_PAID ? nowIso : '';

    getTenantDb().prepare(`
        INSERT INTO payroll_cutoff_statuses (
            user_id, cutoff_start_date, cutoff_end_date, payout_status, paid_at, updated_at, updated_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, cutoff_start_date, cutoff_end_date) DO UPDATE SET
            payout_status = excluded.payout_status,
            paid_at = excluded.paid_at,
            updated_at = excluded.updated_at,
            updated_by = excluded.updated_by
    `).run(
        user.id,
        cutoffStartDateKey,
        cutoffEndDateKey,
        normalizedStatus,
        paidAt,
        nowIso,
        updatedBy
    );

    logAudit('attendance.cutoff_payout_status.update', 'payroll_cutoff', `${user.id}:${cutoffStartDateKey}:${cutoffEndDateKey}`, {
        user_id: user.id,
        cutoff_start_date: cutoffStartDateKey,
        cutoff_end_date: cutoffEndDateKey,
        payout_status: normalizedStatus,
        paid_at: paidAt,
        updated_by: updatedBy
    });

    return getUserCutoffPayrollStatus(user.id, cutoffEndDateKey);
}

function setUserCutoffPayslipPhoto(userId, input = new Date(), payload = {}) {
    const user = getUserById(userId);
    if (!user || !isEmployeeLikeRole(user.role)) {
        throw new Error('Employee not found.');
    }

    const { dataUrl, name, isRemove } = normalizePayslipPhotoPayload(payload);
    const { cutoffStartDateKey, cutoffEndDateKey } = getSemiMonthlyBounds(input);
    const nowIso = new Date().toISOString();
    const updatedBy = normalizeText(getCurrentContext()?.actorUserId || getCurrentContext()?.requestUserId || '');
    const uploadedAt = isRemove ? '' : nowIso;
    const uploadedBy = isRemove ? '' : updatedBy;

    getTenantDb().prepare(`
        INSERT INTO payroll_cutoff_statuses (
            user_id,
            cutoff_start_date,
            cutoff_end_date,
            payout_status,
            paid_at,
            payslip_photo_data_url,
            payslip_photo_name,
            payslip_photo_uploaded_at,
            payslip_photo_uploaded_by,
            updated_at,
            updated_by
        )
        VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, cutoff_start_date, cutoff_end_date) DO UPDATE SET
            payslip_photo_data_url = excluded.payslip_photo_data_url,
            payslip_photo_name = excluded.payslip_photo_name,
            payslip_photo_uploaded_at = excluded.payslip_photo_uploaded_at,
            payslip_photo_uploaded_by = excluded.payslip_photo_uploaded_by,
            updated_at = excluded.updated_at,
            updated_by = excluded.updated_by
    `).run(
        user.id,
        cutoffStartDateKey,
        cutoffEndDateKey,
        PAYROLL_CUTOFF_PAYOUT_PENDING,
        dataUrl,
        name,
        uploadedAt,
        uploadedBy,
        nowIso,
        updatedBy
    );

    logAudit('attendance.cutoff_payslip_photo.update', 'payroll_cutoff', `${user.id}:${cutoffStartDateKey}:${cutoffEndDateKey}`, {
        user_id: user.id,
        cutoff_start_date: cutoffStartDateKey,
        cutoff_end_date: cutoffEndDateKey,
        has_photo: Boolean(dataUrl),
        photo_name: name,
        removed: Boolean(isRemove),
        updated_by: updatedBy
    });

    return getUserCutoffPayrollStatus(user.id, cutoffEndDateKey);
}

function getTodayAttendance() {
    const todayKey = getDateKey();
    return getAttendanceEntriesByFilters({
        startDateKey: todayKey,
        endDateKey: todayKey
    });
}

function getDailyAttendanceSnapshot(dateKey = getDateKey()) {
    const employees = listEmployeeLikeUsers();
    const attendanceMap = new Map();
    const holidayItem = getCompanyHolidayForDate(dateKey);
    const holidayStatus = holidayItem ? 'Holiday' : '';
    const holidayRemarks = holidayItem?.name
        ? `Company holiday: ${holidayItem.name}`
        : 'Company holiday';

    getAttendanceEntriesByFilters({
        startDateKey: dateKey,
        endDateKey: dateKey
    }).forEach((entry) => {
        if (entry.dateKey === dateKey && !attendanceMap.has(entry.id)) {
            attendanceMap.set(entry.id, entry);
        }
    });

    return employees.map((user) => {
        const scheduleForDate = getUserScheduleForDate(user, dateKey);
        const unavailableStatus = getAttendanceAccountStatusLabel(user, dateKey);
        const isUnavailableAccount = Boolean(unavailableStatus);
        const scheduledTimeIn = scheduleForDate.is_day_off || isUnavailableAccount || holidayStatus ? '' : formatTimeValue(scheduleForDate.time_in || '');
        const scheduledTimeOut = scheduleForDate.is_day_off || isUnavailableAccount || holidayStatus ? '' : formatTimeValue(scheduleForDate.time_out || '');
        const entry = attendanceMap.get(user.id) || null;
        if (!entry) {
            const inferredStatus = unavailableStatus || holidayStatus || (scheduleForDate.is_day_off ? 'Day Off' : 'Absent');
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
                taskResults: [],
                taskId: '',
                taskName: '',
                taskCount: 0,
                status: inferredStatus,
                statusGroup: inferredStatus.toLowerCase().replace(/\s+/g, '_'),
                remarksRaw: '',
                displayRemarks: isUnavailableAccount
                    ? `Account ${unavailableStatus.toLowerCase()}`
                    : (holidayStatus
                        ? holidayRemarks
                        : (scheduleForDate.is_day_off ? 'Scheduled day off' : 'No attendance record')),
                canEditStatus: !isUnavailableAccount && !scheduleForDate.is_day_off && !holidayStatus,
                isHoliday: Boolean(holidayStatus),
                isDayOff: scheduleForDate.is_day_off,
                branch_id: user.branch_id || ''
            };
        }

        const hasClockActivity = Boolean(entry.timeIn || entry.timeOut);
        const isScheduledDayOffWithoutLogs = scheduleForDate.is_day_off && !hasClockActivity;
        const isHolidayWithoutLogs = Boolean(holidayStatus) && !hasClockActivity;
        const isUnavailableWithoutLogs = isUnavailableAccount && !hasClockActivity;
        const status = isUnavailableWithoutLogs
            ? unavailableStatus
            : (isHolidayWithoutLogs ? holidayStatus : entry.status);
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
            taskResults: Array.isArray(entry.taskResults) ? entry.taskResults : [],
            taskId: entry.taskId || '',
            taskName: entry.taskName || '',
            taskCount: Number(entry.taskCount || 0),
            status,
            statusGroup: String(status || '').toLowerCase().replace(/\s+/g, '_'),
            remarksRaw: entry.remarksRaw,
            displayRemarks: isUnavailableWithoutLogs
                ? `Account ${unavailableStatus.toLowerCase()}`
                : (isHolidayWithoutLogs
                    ? holidayRemarks
                    : (isScheduledDayOffWithoutLogs
                    ? 'Scheduled day off'
                    : (entry.displayRemarks || normalizeStatus(entry.remarksRaw, entry.lateMinutes, Boolean(entry.timeIn)) || entry.status))),
            canEditStatus: !isUnavailableAccount && !scheduleForDate.is_day_off && !holidayStatus && ['Absent', 'Excuse'].includes(entry.status),
            isHoliday: Boolean(isHolidayWithoutLogs),
            isDayOff: scheduleForDate.is_day_off,
            branch_id: entry.branch_id || user.branch_id || ''
        };
    });
}

function findAttendanceRecord(userId, dateKey = getDateKey()) {
    const targetDateKey = getDateKey(dateKey);
    return getAttendanceEntriesByFilters({
        userIds: [userId],
        startDateKey: targetDateKey,
        endDateKey: targetDateKey,
        limit: 1
    })[0] || null;
}

function getAttendanceRecordForDate(userId, dateKey = getDateKey()) {
    const targetDateKey = getDateKey(dateKey);
    const existing = findAttendanceRecord(userId, targetDateKey);
    if (existing) {
        return existing;
    }

    const user = getUserById(userId);
    if (!user || !isEmployeeLikeRole(user.role)) {
        return null;
    }
    if (!['Inactive', 'Suspended'].includes(getAttendanceAccountStatusLabel(user, targetDateKey))) {
        return null;
    }

    return buildAbsentEntry(user, targetDateKey);
}

function setDailyAttendanceStatus(userId, status, dateKey = getDateKey()) {
    const user = getUserById(userId);
    if (!user || !isEmployeeLikeRole(user.role)) {
        throw new Error('Employee not found.');
    }
    assertAttendanceAccountAvailable(user, dateKey, 'editing attendance');

    const scheduleForDate = getUserScheduleForDate(user, dateKey);
    if (scheduleForDate.is_day_off) {
        throw new Error('Cannot mark absent or excuse on a scheduled day off.');
    }
    if (getAttendanceHolidayStatus(dateKey)) {
        throw new Error('Cannot mark absent or excuse on a company holiday.');
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
            SET name = ?, date = ?, time_in = ?, time_out = ?, worked_hours = ?, remarks = ?, branch_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE rowid = ?
        `).run(user.name, dateKey, '', '', '', finalStatus, user.branch_id || null, existing.rowId);
    } else {
        db.prepare(`
            INSERT INTO attendance (id, branch_id, name, date, time_in, time_out, worked_hours, remarks, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(user.id, user.branch_id || null, user.name, dateKey, '', '', '', finalStatus);
    }

    return getDailyAttendanceSnapshot(dateKey).find((entry) => entry.id === userId) || null;
}

function normalizeManualTimeCardTime(value = '', label = 'Time') {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) {
        return '';
    }

    const formattedValue = formatTimeValue(rawValue);
    if (parseTimeToMinutes(formattedValue) === null) {
        throw new Error(`${label} must use HH:MM format.`);
    }

    return formattedValue;
}

function normalizeManualWorkedHours(value) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return '';
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 24) {
        throw new Error('Worked hours must be between 0 and 24.');
    }

    return numericValue.toFixed(2);
}

function resolveManualAttendanceRemarks({
    status = '',
    remarks = '',
    timeIn = '',
    scheduledTimeIn = '',
    user = null,
    dateKey = ''
} = {}) {
    const normalizedRemarks = normalizeMultilineText(remarks, 240);
    if (normalizedRemarks) {
        return normalizedRemarks;
    }

    const normalizedStatus = normalizeText(status);
    if (normalizedStatus) {
        return normalizedStatus;
    }

    if (timeIn) {
        return buildClockAttendanceRemark(timeIn, scheduledTimeIn, { user, dateKey }) || 'On Time';
    }

    return 'Absent';
}

function setManualTimeCardEntry(userId, payload = {}) {
    const user = getUserById(userId);
    if (!user || !isEmployeeLikeRole(user.role)) {
        throw new Error('Employee not found.');
    }

    const dateKey = normalizeDateKey(payload.dateKey ?? payload.date ?? '');
    if (!dateKey) {
        throw new Error('Valid date is required.');
    }

    const timeIn = normalizeManualTimeCardTime(payload.timeIn ?? payload.time_in ?? '', 'Time in');
    const timeOut = normalizeManualTimeCardTime(payload.timeOut ?? payload.time_out ?? '', 'Time out');
    const timeInMinutes = parseTimeToMinutes(timeIn);
    const timeOutMinutes = parseTimeToMinutes(timeOut);
    if (timeInMinutes !== null && timeOutMinutes !== null && timeOutMinutes < timeInMinutes) {
        throw new Error('Time out must be later than time in.');
    }

    const scheduleForDate = getUserScheduleForDate(user, dateKey);
    const scheduledTimeIn = scheduleForDate.is_day_off ? '' : formatTimeValue(scheduleForDate.time_in || '');
    const scheduledTimeOut = scheduleForDate.is_day_off ? '' : formatTimeValue(scheduleForDate.time_out || '');
    const explicitWorkedHours = Object.prototype.hasOwnProperty.call(payload, 'workedHours')
        || Object.prototype.hasOwnProperty.call(payload, 'worked_hours');
    let workedHours = explicitWorkedHours
        ? normalizeManualWorkedHours(payload.workedHours ?? payload.worked_hours)
        : '';
    if (!workedHours && timeIn && timeOut) {
        workedHours = calculateWorkedHours(timeIn, timeOut, scheduledTimeIn, scheduledTimeOut, { user, dateKey }) || '0.00';
    }

    const remarks = resolveManualAttendanceRemarks({
        status: payload.status ?? '',
        remarks: payload.remarks ?? payload.note ?? '',
        timeIn,
        scheduledTimeIn,
        user,
        dateKey
    });
    const existing = findAttendanceRecord(user.id, dateKey);
    const db = getTenantDb();
    const displayName = normalizeText(user.display_name || user.name || user.username) || user.id;

    if (existing) {
        db.prepare(`
            UPDATE attendance
            SET name = ?, date = ?, time_in = ?, time_out = ?, worked_hours = ?, remarks = ?, branch_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE rowid = ?
        `).run(
            displayName,
            dateKey,
            timeIn,
            timeOut,
            workedHours,
            remarks,
            user.branch_id || null,
            existing.rowId
        );
    } else {
        db.prepare(`
            INSERT INTO attendance (id, branch_id, name, date, time_in, time_out, worked_hours, remarks, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(
            user.id,
            user.branch_id || null,
            displayName,
            dateKey,
            timeIn,
            timeOut,
            workedHours,
            remarks
        );
    }

    logAudit('attendance.manual_timecard.update', 'attendance', `${user.id}:${dateKey}`, {
        user_id: user.id,
        date: dateKey,
        previous: existing
            ? {
                time_in: existing.timeIn || '',
                time_out: existing.timeOut || '',
                worked_hours: existing.workedHours || '',
                remarks: existing.remarksRaw || ''
            }
            : null,
        next: {
            time_in: timeIn,
            time_out: timeOut,
            worked_hours: workedHours,
            remarks
        }
    });

    return findAttendanceRecord(user.id, dateKey) || getAttendanceRecordForDate(user.id, dateKey);
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

function normalizeKpiBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') {
        return Boolean(fallback);
    }
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function serializeKpiSettings(row = {}) {
    return {
        id: String(row.id || KPI_SETTINGS_ID),
        frequency: 'daily',
        customScheduleType: KPI_CUSTOM_SCHEDULE_TYPES.has(String(row.custom_schedule_type || '').toLowerCase())
            ? String(row.custom_schedule_type).toLowerCase()
            : 'interval',
        customIntervalDays: Math.min(3650, Math.max(1, Number(row.custom_interval_days) || 15)),
        customStartDate: normalizeDateKey(row.custom_start_date),
        customEndDate: normalizeDateKey(row.custom_end_date),
        mode: 'required_all',
        commentRequiredForAllRequiredEvaluations: false,
        commentRequiredForIssueEncounterLowRating: false,
        commentRequiredForAllIssueEncounters: false,
        allowEmployeeView: normalizeKpiBoolean(row.allow_employee_view),
        active: true,
        createdAt: String(row.created_at || ''),
        updatedAt: String(row.updated_at || '')
    };
}

function getKpiEvaluationSettings() {
    const db = getTenantDb();
    db.prepare(`
        INSERT INTO kpi_evaluation_settings (id)
        VALUES (?)
        ON CONFLICT(id) DO NOTHING
    `).run(KPI_SETTINGS_ID);
    db.prepare(`
        UPDATE kpi_evaluation_settings
        SET frequency = 'daily',
            mode = 'required_all',
            comment_required_for_all_required_evaluations = 0,
            comment_required_for_issue_encounter_low_rating = 0,
            comment_required_for_all_issue_encounters = 0,
            active = 1
        WHERE id = ?
          AND (
            frequency <> 'daily'
            OR mode <> 'required_all'
            OR comment_required_for_all_required_evaluations <> 0
            OR comment_required_for_issue_encounter_low_rating <> 0
            OR comment_required_for_all_issue_encounters <> 0
            OR active <> 1
          )
    `).run(KPI_SETTINGS_ID);
    return serializeKpiSettings(db.prepare(`
        SELECT *
        FROM kpi_evaluation_settings
        WHERE id = ?
        LIMIT 1
    `).get(KPI_SETTINGS_ID));
}

function updateKpiEvaluationSettings(payload = {}) {
    const current = getKpiEvaluationSettings();
    const allowEmployeeView = normalizeKpiBoolean(
        payload.allowEmployeeView ?? payload.allow_employee_view,
        current.allowEmployeeView
    );

    getTenantDb().prepare(`
        UPDATE kpi_evaluation_settings
        SET frequency = 'daily',
            mode = 'required_all',
            comment_required_for_all_required_evaluations = 0,
            comment_required_for_issue_encounter_low_rating = 0,
            comment_required_for_all_issue_encounters = 0,
            allow_employee_view = ?,
            active = 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        allowEmployeeView ? 1 : 0,
        KPI_SETTINGS_ID
    );
    const next = getKpiEvaluationSettings();
    logAudit('kpi.settings.update', 'kpi_evaluation_settings', KPI_SETTINGS_ID, {
        previous: current,
        next
    });
    return next;
}

function parseKpiDateKeyParts(dateKey = '') {
    const normalized = normalizeDateKey(dateKey);
    if (!normalized) {
        return null;
    }
    const [year, month, day] = normalized.split('-').map(Number);
    return { year, month, day };
}

function kpiDateKeyToUtc(dateKey = '') {
    const parts = parseKpiDateKeyParts(dateKey);
    return parts ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day)) : null;
}

function formatKpiUtcDateKey(date) {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function shiftKpiDateKey(dateKey, days) {
    const date = kpiDateKeyToUtc(dateKey);
    if (!date) {
        return '';
    }
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return formatKpiUtcDateKey(date);
}

function getKpiEvaluationPeriod(settings = getKpiEvaluationSettings(), at = new Date()) {
    const dateKey = getDateKey(at);
    const currentDate = kpiDateKeyToUtc(dateKey);
    if (!currentDate) {
        throw new Error('Unable to resolve the KPI evaluation date.');
    }

    if (settings.frequency === 'daily') {
        return { frequency: 'daily', start: dateKey, end: dateKey, active: true };
    }
    if (settings.frequency === 'weekly') {
        const dayIndex = currentDate.getUTCDay();
        const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
        const start = shiftKpiDateKey(dateKey, mondayOffset);
        return { frequency: 'weekly', start, end: shiftKpiDateKey(start, 6), active: true };
    }
    if (settings.frequency === 'monthly') {
        const start = `${currentDate.getUTCFullYear()}-${pad(currentDate.getUTCMonth() + 1)}-01`;
        const monthEnd = new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() + 1, 0));
        return { frequency: 'monthly', start, end: formatKpiUtcDateKey(monthEnd), active: true };
    }

    if (settings.customScheduleType === 'date_range') {
        const start = settings.customStartDate;
        const end = settings.customEndDate;
        return {
            frequency: 'custom',
            start: start || dateKey,
            end: end || dateKey,
            active: Boolean(start && end && dateKey >= start && dateKey <= end)
        };
    }

    const createdDate = normalizeDateKey(String(settings.createdAt || '').slice(0, 10));
    const anchor = settings.customStartDate || createdDate || dateKey;
    const anchorDate = kpiDateKeyToUtc(anchor);
    if (!anchorDate || dateKey < anchor) {
        return { frequency: 'custom', start: anchor, end: shiftKpiDateKey(anchor, settings.customIntervalDays - 1), active: false };
    }
    const elapsedDays = Math.floor((currentDate.getTime() - anchorDate.getTime()) / 86400000);
    const intervalIndex = Math.floor(elapsedDays / settings.customIntervalDays);
    const start = shiftKpiDateKey(anchor, intervalIndex * settings.customIntervalDays);
    return {
        frequency: 'custom',
        start,
        end: shiftKpiDateKey(start, settings.customIntervalDays - 1),
        active: true
    };
}

function listActiveKpiEmployees() {
    const context = requireTenantContext();
    return getMasterDb().prepare(`
        SELECT *
        FROM users
        WHERE company_id = ?
          AND is_active = 1
          AND LOWER(TRIM(COALESCE(account_status, 'active'))) = 'active'
          AND LOWER(TRIM(COALESCE(role, ''))) IN ('employee', 'staff')
        ORDER BY display_name COLLATE NOCASE, username COLLATE NOCASE
    `).all(context.companyId).map((user) => serializeUser(user));
}

function listPresentKpiEmployees(dateKey = getDateKey()) {
    const targetDateKey = normalizeDateKey(dateKey) || getDateKey();
    const employees = listActiveKpiEmployees();
    if (!employees.length) {
        return [];
    }

    const presentIds = new Set(getAttendanceEntriesByFilters({
        userIds: employees.map((employee) => employee.id),
        startDateKey: targetDateKey,
        endDateKey: targetDateKey
    })
        .filter((entry) => entry.dateKey === targetDateKey && Boolean(entry.timeIn))
        .map((entry) => String(entry.id)));

    return employees.filter((employee) => presentIds.has(String(employee.id)));
}

function getActiveKpiEmployee(employeeId = '') {
    return listActiveKpiEmployees().find((employee) => String(employee.id) === String(employeeId)) || null;
}

function buildKpiEmployeeSummary(employee = {}) {
    return {
        id: String(employee.id || ''),
        name: String(employee.name || employee.id || ''),
        role: String(employee.role || ''),
        branchName: String(employee.branch_name || ''),
        profilePicture: String(employee.profile_picture || '')
    };
}

function buildKpiRequiredPeriodKey(evaluatorId, period) {
    return [String(evaluatorId), 'required_evaluation', period.start, period.end].join(':');
}

function hasKpiRequiredSubmission(evaluatorId, period) {
    return Boolean(getTenantDb().prepare(`
        SELECT id
        FROM kpi_evaluation_submissions
        WHERE required_period_key = ?
        LIMIT 1
    `).get(buildKpiRequiredPeriodKey(evaluatorId, period)));
}

function getKpiEvaluationContext(evaluatorId, at = new Date()) {
    const evaluator = getActiveKpiEmployee(evaluatorId);
    if (!evaluator) {
        throw new Error('Only active employees can submit KPI evaluations.');
    }
    const settings = getKpiEvaluationSettings();
    const period = getKpiEvaluationPeriod(settings, at);
    const peers = listPresentKpiEmployees(period.start).filter((employee) => String(employee.id) !== String(evaluator.id));
    const requiredEnabled = period.active && peers.length > 0;
    const completed = requiredEnabled ? hasKpiRequiredSubmission(evaluator.id, period) : false;
    return {
        evaluator: buildKpiEmployeeSummary(evaluator),
        settings,
        period,
        activeEmployees: peers.map(buildKpiEmployeeSummary),
        requiredEvaluation: {
            enabled: requiredEnabled,
            isDue: requiredEnabled && !completed,
            completed,
            employeeCount: peers.length
        },
        issueEncounter: {
            enabled: false,
            commentRequiredForAll: false
        },
        ratingGuide: Object.entries(KPI_RATING_GUIDE).map(([rating, guide]) => ({
            rating: Number(rating),
            label: guide.label,
            tone: guide.tone
        }))
    };
}

function normalizeKpiEvaluationItems(items, {
    evaluationType,
    evaluator,
    peers,
    requireAllComments = false
} = {}) {
    if (!KPI_EVALUATION_TYPES.has(evaluationType)) {
        throw new Error('Invalid KPI evaluation type.');
    }
    const peerMap = new Map(peers.map((employee) => [String(employee.id), employee]));
    const normalizedItems = [];
    const seenIds = new Set();

    (Array.isArray(items) ? items : []).forEach((item) => {
        const ratedEmployeeId = String(item?.ratedEmployeeId ?? item?.rated_employee_id ?? item?.employeeId ?? '').trim();
        if (!ratedEmployeeId) {
            throw new Error('A rated employee is required.');
        }
        if (ratedEmployeeId === String(evaluator.id)) {
            throw new Error('Employees cannot rate themselves.');
        }
        if (seenIds.has(ratedEmployeeId)) {
            throw new Error('The same employee cannot be rated twice in one submission.');
        }
        const ratedEmployee = peerMap.get(ratedEmployeeId);
        if (!ratedEmployee) {
            throw new Error('Only present employees can be rated.');
        }

        const rating = Number(item?.rating);
        if (!Number.isInteger(rating) || !KPI_RATING_GUIDE[rating]) {
            throw new Error(`Select a 1 to 5 star rating for ${ratedEmployee.name}.`);
        }
        const comment = normalizeMultilineText(item?.comment ?? item?.reason ?? '', 2000);
        seenIds.add(ratedEmployeeId);
        normalizedItems.push({
            ratedEmployee,
            rating,
            ratingLabel: KPI_RATING_GUIDE[rating].label,
            comment,
            evaluationType
        });
    });
    return normalizedItems;
}

function prepareKpiEvaluationSubmission(evaluatorId, payload = {}, at = new Date(), { includeRequired = true } = {}) {
    const context = getKpiEvaluationContext(evaluatorId, at);
    const peers = listPresentKpiEmployees(context.period.start).filter((employee) => String(employee.id) !== String(evaluatorId));
    const evaluator = getActiveKpiEmployee(evaluatorId);
    const requiredInput = payload.requiredEvaluations ?? payload.required_evaluations ?? [];
    const issueInput = payload.issueEncounters ?? payload.issue_encounters ?? [];
    let required = [];

    if (includeRequired && context.requiredEvaluation.isDue) {
        required = normalizeKpiEvaluationItems(requiredInput, {
            evaluationType: 'required_evaluation',
            evaluator,
            peers,
            requireAllComments: false
        });
        const requiredIds = new Set(required.map((item) => String(item.ratedEmployee.id)));
        if (required.length !== peers.length || peers.some((employee) => !requiredIds.has(String(employee.id)))) {
            throw new Error('Rate every present employee before timing out.');
        }
    } else if (includeRequired && Array.isArray(requiredInput) && requiredInput.length) {
        throw new Error(context.requiredEvaluation.completed
            ? 'The required KPI evaluation for this period was already submitted.'
            : 'A required KPI evaluation is not scheduled for this period.');
    }

    const issue = normalizeKpiEvaluationItems(issueInput, {
        evaluationType: 'issue_encounter',
        evaluator,
        peers,
        requireAllComments: context.settings.commentRequiredForAllIssueEncounters
    });
    if (issue.length && !context.issueEncounter.enabled) {
        throw new Error('Issue Encounter submissions are currently disabled.');
    }

    return { context, evaluator, required, issue };
}

function insertKpiEvaluationBatch(db, evaluator, items, evaluationType, period, frequency, submittedAt) {
    if (!items.length) {
        return [];
    }
    const submissionId = generateId('kpi_submission');
    const requiredPeriodKey = evaluationType === 'required_evaluation'
        ? buildKpiRequiredPeriodKey(evaluator.id, period)
        : null;
    db.prepare(`
        INSERT INTO kpi_evaluation_submissions (
            id, evaluator_employee_id, evaluation_type, evaluation_period_start,
            evaluation_period_end, required_period_key, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        submissionId,
        evaluator.id,
        evaluationType,
        period.start,
        period.end,
        requiredPeriodKey,
        submittedAt
    );

    const recordIds = [];
    const insertRecord = db.prepare(`
        INSERT INTO kpi_evaluation_records (
            id, submission_id, evaluator_employee_id, evaluator_name,
            rated_employee_id, rated_employee_name, rated_employee_role,
            rating, rating_label, comment, evaluation_type, evaluation_frequency,
            evaluation_period_start, evaluation_period_end, submitted_at,
            visible_to_admin_only, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'submitted')
    `);
    const insertAudit = db.prepare(`
        INSERT INTO kpi_evaluation_audit_logs (
            id, record_id, actor_user_id, action, previous_status, next_status, note, created_at
        ) VALUES (?, ?, ?, 'submitted', '', 'submitted', '', ?)
    `);
    items.forEach((item) => {
        const recordId = generateId('kpi');
        recordIds.push(recordId);
        insertRecord.run(
            recordId,
            submissionId,
            evaluator.id,
            evaluator.name,
            item.ratedEmployee.id,
            item.ratedEmployee.name,
            item.ratedEmployee.role || item.ratedEmployee.branch_name || '',
            item.rating,
            item.ratingLabel,
            item.comment,
            evaluationType,
            frequency,
            period.start,
            period.end,
            submittedAt
        );
        insertAudit.run(generateId('kpi_audit'), recordId, evaluator.id, submittedAt);
    });
    return recordIds;
}

function insertPreparedKpiSubmission(db, prepared, at = new Date()) {
    const submittedAt = at.toISOString();
    const requiredIds = insertKpiEvaluationBatch(
        db,
        prepared.evaluator,
        prepared.required,
        'required_evaluation',
        prepared.context.period,
        prepared.context.settings.frequency,
        submittedAt
    );
    const issuePeriod = {
        start: getDateKey(at),
        end: getDateKey(at)
    };
    const issueIds = insertKpiEvaluationBatch(
        db,
        prepared.evaluator,
        prepared.issue,
        'issue_encounter',
        issuePeriod,
        'daily',
        submittedAt
    );
    return { requiredIds, issueIds };
}

function serializeKpiEvaluationRecord(row = {}) {
    return {
        id: String(row.id || ''),
        submissionId: String(row.submission_id || ''),
        evaluatorEmployeeId: String(row.evaluator_employee_id || ''),
        evaluatorName: String(row.evaluator_name || row.evaluator_employee_id || ''),
        ratedEmployeeId: String(row.rated_employee_id || ''),
        ratedEmployeeName: String(row.rated_employee_name || row.rated_employee_id || ''),
        ratedEmployeeRole: String(row.rated_employee_role || ''),
        rating: Number(row.rating || 0),
        ratingLabel: String(row.rating_label || ''),
        comment: String(row.comment || ''),
        evaluationType: String(row.evaluation_type || ''),
        evaluationFrequency: String(row.evaluation_frequency || ''),
        evaluationPeriodStart: String(row.evaluation_period_start || ''),
        evaluationPeriodEnd: String(row.evaluation_period_end || ''),
        submittedAt: String(row.submitted_at || ''),
        visibleToAdminOnly: normalizeKpiBoolean(row.visible_to_admin_only, true),
        status: String(row.status || 'submitted'),
        reviewedByAdminId: String(row.reviewed_by_admin_id || ''),
        reviewedAt: String(row.reviewed_at || '')
    };
}

function serializeKpiAuditLog(row = {}) {
    return {
        id: String(row.id || ''),
        recordId: String(row.record_id || ''),
        actorUserId: String(row.actor_user_id || ''),
        action: String(row.action || ''),
        previousStatus: String(row.previous_status || ''),
        nextStatus: String(row.next_status || ''),
        note: String(row.note || ''),
        createdAt: String(row.created_at || '')
    };
}

function listKpiEvaluations({
    dateFrom = '',
    dateTo = '',
    employeeId = '',
    rating = '',
    evaluationType = '',
    frequency = '',
    status = '',
    search = '',
    limit = 2500,
    offset = 0
} = {}) {
    const clauses = ['1 = 1'];
    const params = [];
    const normalizedDateFrom = normalizeDateKey(dateFrom);
    const normalizedDateTo = normalizeDateKey(dateTo);
    if (normalizedDateFrom) {
        clauses.push('evaluation_period_start >= ?');
        params.push(normalizedDateFrom);
    }
    if (normalizedDateTo) {
        clauses.push('evaluation_period_start <= ?');
        params.push(normalizedDateTo);
    }
    if (normalizeText(employeeId)) {
        clauses.push('(evaluator_employee_id = ? OR rated_employee_id = ?)');
        params.push(normalizeText(employeeId), normalizeText(employeeId));
    }
    const normalizedRating = Number(rating);
    if (Number.isInteger(normalizedRating) && KPI_RATING_GUIDE[normalizedRating]) {
        clauses.push('rating = ?');
        params.push(normalizedRating);
    }
    if (KPI_EVALUATION_TYPES.has(String(evaluationType || '').trim().toLowerCase())) {
        clauses.push('evaluation_type = ?');
        params.push(String(evaluationType).trim().toLowerCase());
    }
    if (KPI_FREQUENCIES.has(String(frequency || '').trim().toLowerCase())) {
        clauses.push('evaluation_frequency = ?');
        params.push(String(frequency).trim().toLowerCase());
    }
    if (KPI_REVIEW_STATUSES.has(String(status || '').trim().toLowerCase())) {
        clauses.push('status = ?');
        params.push(String(status).trim().toLowerCase());
    }
    const rows = getTenantDb().prepare(`
        SELECT *
        FROM kpi_evaluation_records
        WHERE ${clauses.join(' AND ')}
        ORDER BY submitted_at DESC, id DESC
    `).all(...params).map(serializeKpiEvaluationRecord);
    const normalizedSearch = normalizeText(search).toLowerCase();
    const filtered = normalizedSearch
        ? rows.filter((row) => [
            row.evaluatorName,
            row.evaluatorEmployeeId,
            row.ratedEmployeeName,
            row.ratedEmployeeId,
            row.comment,
            row.ratingLabel
        ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch)))
        : rows;
    const normalizedOffset = Math.max(0, Number(offset) || 0);
    const normalizedLimit = Math.min(5000, Math.max(1, Number(limit) || 2500));
    return filtered.slice(normalizedOffset, normalizedOffset + normalizedLimit);
}

function getKpiEvaluationById(recordId) {
    const row = getTenantDb().prepare(`
        SELECT *
        FROM kpi_evaluation_records
        WHERE id = ?
        LIMIT 1
    `).get(String(recordId || ''));
    if (!row) {
        throw new Error('KPI evaluation record not found.');
    }
    const auditLog = getTenantDb().prepare(`
        SELECT *
        FROM kpi_evaluation_audit_logs
        WHERE record_id = ?
        ORDER BY created_at DESC, id DESC
    `).all(String(recordId || '')).map(serializeKpiAuditLog);
    return { ...serializeKpiEvaluationRecord(row), auditLog };
}

function clampKpiPercent(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function calculateKpiPercent(part, total, emptyValue) {
    const normalizedTotal = Number(total);
    if (!Number.isFinite(normalizedTotal) || normalizedTotal <= 0) {
        return clampKpiPercent(emptyValue);
    }
    return clampKpiPercent((Number(part || 0) / normalizedTotal) * 100);
}

function calculateKpiTaskPercent(completedCount, assignedCount) {
    const normalizedAssignedCount = Number(assignedCount);
    if (!Number.isFinite(normalizedAssignedCount) || normalizedAssignedCount <= 0) {
        return 0;
    }
    const rawPercent = (Number(completedCount || 0) / normalizedAssignedCount) * 100;
    const clampedPercent = Math.max(0, Math.min(100, rawPercent));
    return Math.round((clampedPercent + Number.EPSILON) * 100) / 100;
}

function calculateKpiPeerEvaluation(ratingTotal, raterCount) {
    const normalizedRaterCount = Math.max(0, Number(raterCount) || 0);
    const normalizedRatingTotal = Math.max(0, Number(ratingTotal) || 0);
    if (!normalizedRaterCount) {
        return { averageRating: 0, peerEvaluationPercent: 0 };
    }
    const rawAverageRating = normalizedRatingTotal / normalizedRaterCount;
    const rawPercent = (rawAverageRating / 5) * 100;
    return {
        averageRating: Math.round((rawAverageRating + Number.EPSILON) * 100) / 100,
        peerEvaluationPercent: Math.round((Math.max(0, Math.min(100, rawPercent)) + Number.EPSILON) * 100) / 100
    };
}

function getKpiPeriodDateKeys(period = {}) {
    const start = normalizeDateKey(period.start || '');
    const end = normalizeDateKey(period.end || '') || start;
    const startDate = kpiDateKeyToUtc(start);
    const endDate = kpiDateKeyToUtc(end);
    if (!start || !startDate || !endDate || end < start) {
        return start ? [start] : [];
    }
    const dayCount = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000);
    return Array.from({ length: Math.min(dayCount + 1, 731) }, (_item, index) => (
        shiftKpiDateKey(start, index)
    )).filter(Boolean);
}

function isKpiWorkingDateForEmployee(employee, dateKey) {
    const scheduleForDate = getUserScheduleForDate(employee, dateKey);
    return !scheduleForDate.is_day_off
        && !getAttendanceAccountStatusLabel(employee, dateKey)
        && !getAttendanceHolidayStatus(dateKey);
}

function isKpiDateReadyForCalculation(employee, dateKey, asOf = new Date()) {
    const normalizedDateKey = normalizeDateKey(dateKey);
    if (!normalizedDateKey || !isKpiWorkingDateForEmployee(employee, normalizedDateKey)) {
        return false;
    }
    const currentDateKey = getDateKey(asOf);
    if (normalizedDateKey < currentDateKey) {
        return true;
    }
    if (normalizedDateKey > currentDateKey) {
        return false;
    }
    const scheduleForDate = getUserScheduleForDate(employee, normalizedDateKey);
    const shiftEndMinutes = parseTimeToMinutes(scheduleForDate.time_out || DEFAULT_EMPLOYEE_TIME_OUT);
    const currentParts = getZonedDateTimeParts(asOf);
    const currentMinutes = currentParts
        ? (Number(currentParts.hour || 0) * 60) + Number(currentParts.minute || 0)
        : null;
    return shiftEndMinutes !== null
        && currentMinutes !== null
        && currentMinutes >= shiftEndMinutes;
}

function buildKpiAttendanceMetrics(employee, periodDateKeys = [], attendanceEntries = []) {
    const entriesByDate = new Map((attendanceEntries || []).map((entry) => [String(entry.dateKey || ''), entry]));
    const workingDateKeys = periodDateKeys.filter((dateKey) => isKpiWorkingDateForEmployee(employee, dateKey));
    const presentDateKeys = workingDateKeys.filter((dateKey) => Boolean(entriesByDate.get(dateKey)?.timeIn));
    const onTimeDateKeys = presentDateKeys.filter((dateKey) => Number(entriesByDate.get(dateKey)?.lateMinutes || 0) <= 0);
    const attendancePolicy = resolveAttendancePolicy({ user: employee });
    const fallbackScheduledMinutes = Math.max(0, Number(attendancePolicy?.dailyTargetHours || 0) * 60);
    let totalScheduledMinutes = 0;
    let earnedPunctualityMinutes = 0;

    workingDateKeys.forEach((dateKey) => {
        const scheduleForDate = getUserScheduleForDate(employee, dateKey);
        const scheduledMinutes = calculateScheduledPaidMinutes(
            scheduleForDate.time_in,
            scheduleForDate.time_out,
            { user: employee, dateKey }
        ) || fallbackScheduledMinutes;
        const normalizedScheduledMinutes = Math.max(0, Number(scheduledMinutes) || 0);
        const attendanceEntry = entriesByDate.get(dateKey);
        const lateMinutes = attendanceEntry?.timeIn
            ? Math.max(0, Number(attendanceEntry.lateMinutes) || 0)
            : normalizedScheduledMinutes;

        totalScheduledMinutes += normalizedScheduledMinutes;
        earnedPunctualityMinutes += Math.max(0, normalizedScheduledMinutes - Math.min(lateMinutes, normalizedScheduledMinutes));
    });

    const punctualityPercent = totalScheduledMinutes > 0
        ? Math.round((((earnedPunctualityMinutes / totalScheduledMinutes) * 100) + Number.EPSILON) * 100) / 100
        : 0;
    return {
        workingDateKeys,
        workingDays: workingDateKeys.length,
        presentDays: presentDateKeys.length,
        onTimeDays: onTimeDateKeys.length,
        attendancePercent: workingDateKeys.length
            ? calculateKpiPercent(presentDateKeys.length, workingDateKeys.length)
            : 0,
        punctualityPercent
    };
}

function getKpiTaskResultNameKey(result = {}) {
    return normalizeTaskName(result.name || result.taskName || result.task_name || '').toLowerCase();
}

function isKpiTaskResultComplete(result = {}) {
    const inputType = normalizeTaskInputType(result.inputType || result.input_type || '');
    if (inputType === 'checklist') {
        return Boolean(result.value) || Number(result.count || 0) > 0;
    }
    if (inputType === 'text') {
        return Boolean(normalizeText(result.value || result.text || result.response || ''));
    }
    return Number(result.count ?? result.value ?? 0) > 0;
}

function buildKpiTaskMetrics(employee, workingDateKeys = [], attendanceEntries = []) {
    const assignedTasks = getAssignedTasksForSerializedUser(employee);
    const mainTasks = assignedTasks.filter((task) => !task.isCustom);
    const specificTasks = assignedTasks.filter((task) => task.isCustom);
    const mainTaskIds = new Set(mainTasks.map((task) => normalizeAssignedTaskId(task.id || '')).filter(Boolean));
    const mainTaskNames = new Set(mainTasks.map((task) => normalizeTaskName(task.name || '').toLowerCase()).filter(Boolean));
    const specificTaskIds = new Set(specificTasks.map((task) => normalizeAssignedTaskId(task.id || '')).filter(Boolean));
    const specificTaskNames = new Set(specificTasks.map((task) => normalizeTaskName(task.name || '').toLowerCase()).filter(Boolean));
    const workingDateSet = new Set(workingDateKeys);
    const expectedMainTaskCount = mainTasks.length * workingDateKeys.length;
    const expectedSpecificTaskCount = specificTasks.length * workingDateKeys.length;
    const completedTimeOutEntries = (attendanceEntries || []).filter((entry) => (
        workingDateSet.has(String(entry.dateKey || ''))
        && Boolean(entry.timeIn)
        && Boolean(entry.timeOut)
    ));
    if (!completedTimeOutEntries.length) {
        return {
            assignedTaskCount: expectedMainTaskCount,
            completedTaskCount: 0,
            specificTaskCount: expectedSpecificTaskCount,
            completedSpecificTaskCount: 0,
            taskCompletionPercent: 0,
            taskQualityPercent: 0,
            initiativeTaskCount: 0,
            initiativePercent: 0
        };
    }
    const completedMainTaskKeys = new Set();
    const completedSpecificTaskKeys = new Set();
    let initiativeTaskCount = 0;

    completedTimeOutEntries.forEach((entry) => {
        (Array.isArray(entry.taskResults) ? entry.taskResults : []).forEach((result) => {
            const resultId = normalizeAssignedTaskId(result.id || result.taskId || result.task_id || '');
            const resultNameKey = getKpiTaskResultNameKey(result);
            const isMainTask = Boolean(
                (resultId && mainTaskIds.has(resultId))
                || (!resultId && resultNameKey && mainTaskNames.has(resultNameKey))
            );
            if (isMainTask) {
                if (isKpiTaskResultComplete(result)) {
                    completedMainTaskKeys.add(`${entry.dateKey}:${resultId || resultNameKey}`);
                }
                return;
            }
            const isSpecificTask = Boolean(
                (resultId && specificTaskIds.has(resultId))
                || (!resultId && resultNameKey && specificTaskNames.has(resultNameKey))
            );
            if (isSpecificTask) {
                if (isKpiTaskResultComplete(result)) {
                    completedSpecificTaskKeys.add(`${entry.dateKey}:${resultId || resultNameKey}`);
                }
                return;
            }
            if (result.isCustom && isKpiTaskResultComplete(result)) {
                initiativeTaskCount += 1;
            }
        });
    });

    const taskCompletionPercent = expectedMainTaskCount
        ? calculateKpiTaskPercent(completedMainTaskKeys.size, expectedMainTaskCount)
        : 0;
    const qualityTaskCount = expectedSpecificTaskCount || expectedMainTaskCount;
    const completedQualityTaskCount = expectedSpecificTaskCount
        ? completedSpecificTaskKeys.size
        : completedMainTaskKeys.size;
    const taskQualityPercent = qualityTaskCount
        ? calculateKpiTaskPercent(completedQualityTaskCount, qualityTaskCount)
        : 0;
    return {
        assignedTaskCount: expectedMainTaskCount,
        completedTaskCount: completedMainTaskKeys.size,
        specificTaskCount: expectedSpecificTaskCount,
        completedSpecificTaskCount: completedSpecificTaskKeys.size,
        taskCompletionPercent,
        taskQualityPercent,
        initiativeTaskCount,
        initiativePercent: initiativeTaskCount > 0 ? 100 : 0
    };
}

function calculateWeightedKpiScorePercent(metrics = {}) {
    const totalWeight = Object.values(KPI_SCORE_WEIGHTS).reduce((total, weight) => total + weight, 0);
    if (!totalWeight) {
        return 0;
    }
    const weightedTotal = (
        Number(metrics.attendancePercent || 0) * KPI_SCORE_WEIGHTS.attendance
        + Number(metrics.punctualityPercent || 0) * KPI_SCORE_WEIGHTS.punctuality
        + Number(metrics.taskCompletionPercent || 0) * KPI_SCORE_WEIGHTS.taskCompletion
        + Number(metrics.taskQualityPercent || 0) * KPI_SCORE_WEIGHTS.taskQuality
        + Number(metrics.peerEvaluationPercent || 0) * KPI_SCORE_WEIGHTS.peerEvaluation
        + Number(metrics.initiativePercent || 0) * KPI_SCORE_WEIGHTS.initiative
    ) / totalWeight;
    return clampKpiPercent(weightedTotal);
}

function buildKpiDailyScoreItems(employee, {
    startDateKey = '',
    endDateKey = '',
    calculationStartDateKey = '',
    attendanceByDate = new Map(),
    ratingsByDate = new Map(),
    asOf = new Date()
} = {}) {
    const employeeId = String(employee?.id || '');
    if (!employeeId || !startDateKey || !endDateKey || startDateKey > endDateKey) {
        return [];
    }
    const dateKeys = getKpiPeriodDateKeys({ start: startDateKey, end: endDateKey }).reverse();
    return dateKeys.reduce((history, dateKey) => {
        const scheduleForDate = getUserScheduleForDate(employee, dateKey);
        if (scheduleForDate.is_day_off) {
            if (dateKey < KPI_DAY_OFF_HISTORY_START_DATE_KEY) {
                return history;
            }
            history.push({
                dateKey,
                employeeId,
                employeeName: String(employee.name || employee.id || ''),
                recordType: 'day_off',
                statusLabel: 'Day Off',
                isDayOff: true,
                isPresent: false,
                isKpiFinalized: false,
                averageRating: null,
                ratingCount: null,
                raterCount: null,
                adminRatingCount: null,
                expectedRaterCount: null,
                completionPercent: null,
                attendancePercent: null,
                punctualityPercent: null,
                taskCompletionPercent: null,
                taskQualityPercent: null,
                peerEvaluationPercent: null,
                initiativePercent: null,
                kpiScorePercent: null
            });
            return history;
        }
        if (calculationStartDateKey && dateKey < calculationStartDateKey) {
            return history;
        }
        if (!isKpiDateReadyForCalculation(employee, dateKey, asOf)) {
            return history;
        }
        const dateAttendanceRows = attendanceByDate.get(dateKey) || [];
        const employeeAttendanceRows = dateAttendanceRows.filter((entry) => String(entry.id || '') === employeeId);
        const score = ratingsByDate.get(dateKey) || {};

        const presentEmployeeIds = new Set(dateAttendanceRows
            .filter((entry) => Boolean(entry.timeIn))
            .map((entry) => String(entry.id || '')));
        const isPresent = presentEmployeeIds.has(employeeId);
        const expectedRaterCount = isPresent ? Math.max(0, presentEmployeeIds.size - 1) : 0;
        const raterCount = Number(score.rater_count || 0);
        const ratingCount = Number(score.rating_count || 0);
        const adminRatingCount = Number(score.admin_rating_count || 0);
        const { averageRating, peerEvaluationPercent } = calculateKpiPeerEvaluation(
            score.rating_total,
            ratingCount
        );
        const attendanceMetrics = buildKpiAttendanceMetrics(employee, [dateKey], employeeAttendanceRows);
        const taskMetrics = buildKpiTaskMetrics(employee, attendanceMetrics.workingDateKeys, employeeAttendanceRows);
        const kpiScorePercent = calculateWeightedKpiScorePercent({
            ...attendanceMetrics,
            ...taskMetrics,
            peerEvaluationPercent
        });

        history.push({
            dateKey,
            employeeId,
            employeeName: String(employee.name || employee.id || ''),
            averageRating,
            ratingCount,
            raterCount,
            adminRatingCount,
            expectedRaterCount,
            completionPercent: isPresent
                ? (expectedRaterCount ? Math.min(100, Math.round((raterCount / expectedRaterCount) * 100)) : 100)
                : 0,
            recordType: 'kpi_score',
            statusLabel: '',
            isDayOff: false,
            isPresent,
            isKpiFinalized: true,
            attendancePercent: attendanceMetrics.attendancePercent,
            punctualityPercent: attendanceMetrics.punctualityPercent,
            taskCompletionPercent: taskMetrics.taskCompletionPercent,
            taskQualityPercent: taskMetrics.taskQualityPercent,
            peerEvaluationPercent,
            initiativePercent: taskMetrics.initiativePercent,
            kpiScorePercent,
            assignedTaskCount: taskMetrics.assignedTaskCount,
            completedTaskCount: taskMetrics.completedTaskCount,
            specificTaskCount: taskMetrics.specificTaskCount,
            completedSpecificTaskCount: taskMetrics.completedSpecificTaskCount,
            initiativeTaskCount: taskMetrics.initiativeTaskCount
        });
        return history;
    }, []);
}

function calculateAverageDailyKpiScore(items = []) {
    const scores = (Array.isArray(items) ? items : [])
        .filter((item) => !item?.isDayOff && item?.kpiScorePercent !== null && item?.kpiScorePercent !== undefined)
        .map((item) => Number(item.kpiScorePercent))
        .filter(Number.isFinite);
    if (!scores.length) {
        return null;
    }
    const average = scores.reduce((total, score) => total + score, 0) / scores.length;
    return Math.round((average + Number.EPSILON) * 100) / 100;
}

function countCalculatedDailyKpiScores(items = []) {
    return (Array.isArray(items) ? items : []).filter((item) => (
        !item?.isDayOff
        && item?.kpiScorePercent !== null
        && item?.kpiScorePercent !== undefined
        && Number.isFinite(Number(item.kpiScorePercent))
    )).length;
}

function getKpiSummaryDateForDateKey(dateKey = '', fallbackAt = new Date()) {
    const normalizedDateKey = normalizeDateKey(dateKey);
    if (!normalizedDateKey) {
        return fallbackAt;
    }
    const fallbackDateKey = getDateKey(fallbackAt);
    if (normalizedDateKey === fallbackDateKey) {
        return fallbackAt;
    }
    const [year, month, day] = normalizedDateKey.split('-').map(Number);
    if (!year || !month || !day) {
        return fallbackAt;
    }
    const isPastDate = normalizedDateKey < fallbackDateKey;
    return new Date(Date.UTC(
        year,
        month - 1,
        day,
        isPastDate ? 15 : 4,
        isPastDate ? 59 : 0,
        isPastDate ? 59 : 0,
        isPastDate ? 999 : 0
    ));
}

function buildKpiSummaryAttendance(entry = null) {
    if (!entry) {
        return null;
    }
    return {
        rowId: entry.rowId ?? null,
        id: String(entry.id || ''),
        name: String(entry.name || ''),
        date: String(entry.date || ''),
        dateKey: String(entry.dateKey || ''),
        displayDate: String(entry.displayDate || ''),
        timeIn: String(entry.timeIn || ''),
        timeOut: String(entry.timeOut || ''),
        workedHours: String(entry.workedHours || '0.00'),
        status: String(entry.status || ''),
        lateMinutes: Number(entry.lateMinutes || 0),
        displayRemarks: String(entry.displayRemarks || ''),
        timeoutIssues: String(entry.timeoutIssues || ''),
        timeoutRemarks: String(entry.timeoutRemarks || ''),
        taskResults: Array.isArray(entry.taskResults) ? entry.taskResults : [],
        scheduledTimeIn: String(entry.scheduledTimeIn || ''),
        scheduledTimeOut: String(entry.scheduledTimeOut || ''),
        isHoliday: Boolean(entry.isHoliday),
        isDayOff: Boolean(entry.isDayOff)
    };
}

function getKpiEvaluationSummary(at = new Date(), { dateKey = '' } = {}) {
    const summaryAt = getKpiSummaryDateForDateKey(dateKey, at);
    const db = getTenantDb();
    const settings = getKpiEvaluationSettings();
    const period = getKpiEvaluationPeriod(settings, summaryAt);
    const activeEmployees = listActiveKpiEmployees();
    const presentEmployees = listPresentKpiEmployees(period.start);
    const presentEmployeeIds = new Set(presentEmployees.map((employee) => String(employee.id || '')));
    const totals = db.prepare(`
        SELECT COUNT(*) AS total,
               AVG(rating) AS average_rating,
               SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) AS low_rating_count,
               SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS excellent_rating_count
        FROM kpi_evaluation_records
        WHERE evaluation_type IN ('required_evaluation', 'admin_evaluation')
          AND evaluation_period_start = ?
          AND evaluation_period_end = ?
    `).get(period.start, period.end) || {};
    const scoreRows = db.prepare(`
        SELECT rated_employee_id,
               MAX(rated_employee_name) AS rated_employee_name,
               SUM(rating) AS rating_total,
               AVG(rating) AS average_rating,
               COUNT(*) AS rating_count,
               COUNT(DISTINCT CASE WHEN evaluation_type = 'required_evaluation' THEN evaluator_employee_id END) AS rater_count,
               SUM(CASE WHEN evaluation_type = 'admin_evaluation' THEN 1 ELSE 0 END) AS admin_rating_count
        FROM kpi_evaluation_records
        WHERE evaluation_type IN ('required_evaluation', 'admin_evaluation')
          AND evaluation_period_start = ?
          AND evaluation_period_end = ?
        GROUP BY rated_employee_id
    `).all(period.start, period.end);
    const scoreMap = new Map(scoreRows.map((row) => [String(row.rated_employee_id), row]));
    const periodDateKeys = getKpiPeriodDateKeys(period);
    const activeEmployeeIds = activeEmployees.map((employee) => String(employee.id || '')).filter(Boolean);
    const activeEmployeeMap = new Map(activeEmployees.map((employee) => [String(employee.id || ''), employee]));
    const attendanceRows = activeEmployeeIds.length
        ? getAttendanceEntriesByFilters({
            userIds: activeEmployeeIds,
            startDateKey: period.start,
            endDateKey: period.end,
            userMap: activeEmployeeMap
        })
        : [];
    const attendanceByEmployee = attendanceRows.reduce((map, entry) => {
        const key = String(entry.id || '');
        if (!map.has(key)) {
            map.set(key, []);
        }
        map.get(key).push(entry);
        return map;
    }, new Map());
    const kpiActivatedDateKey = normalizeDateKey(String(settings.createdAt || '').slice(0, 10)) || period.start;
    const scoreHistoryStartDateKey = kpiActivatedDateKey <= period.start ? kpiActivatedDateKey : period.start;
    const scoreHistoryAttendanceRows = scoreHistoryStartDateKey === period.start
        ? attendanceRows
        : getAttendanceEntriesByFilters({
            userIds: activeEmployeeIds,
            startDateKey: scoreHistoryStartDateKey,
            endDateKey: period.start,
            userMap: activeEmployeeMap
        });
    const scoreHistoryAttendanceByDate = scoreHistoryAttendanceRows.reduce((map, entry) => {
        const dateKey = String(entry.dateKey || '');
        if (!map.has(dateKey)) map.set(dateKey, []);
        map.get(dateKey).push(entry);
        return map;
    }, new Map());
    const scoreHistoryRatingRows = db.prepare(`
        SELECT rated_employee_id,
               evaluation_period_start AS date_key,
               SUM(rating) AS rating_total,
               COUNT(*) AS rating_count,
               COUNT(DISTINCT CASE WHEN evaluation_type = 'required_evaluation' THEN evaluator_employee_id END) AS rater_count,
               SUM(CASE WHEN evaluation_type = 'admin_evaluation' THEN 1 ELSE 0 END) AS admin_rating_count
        FROM kpi_evaluation_records
        WHERE evaluation_type IN ('required_evaluation', 'admin_evaluation')
          AND evaluation_period_start = evaluation_period_end
          AND evaluation_period_start >= ?
          AND evaluation_period_start <= ?
        GROUP BY rated_employee_id, evaluation_period_start
    `).all(scoreHistoryStartDateKey, period.start);
    const scoreHistoryRatingsByEmployee = scoreHistoryRatingRows.reduce((map, row) => {
        const employeeId = String(row.rated_employee_id || '');
        if (!map.has(employeeId)) map.set(employeeId, new Map());
        map.get(employeeId).set(String(row.date_key || ''), row);
        return map;
    }, new Map());
    const dailyEmployeeScores = activeEmployees.map((employee) => {
        const score = scoreMap.get(String(employee.id)) || {};
        const isPresent = presentEmployeeIds.has(String(employee.id));
        const expectedRaterCount = isPresent ? Math.max(0, presentEmployees.length - 1) : 0;
        const raterCount = Number(score.rater_count || 0);
        const ratingCount = Number(score.rating_count || 0);
        const adminRatingCount = Number(score.admin_rating_count || 0);
        const { averageRating, peerEvaluationPercent } = calculateKpiPeerEvaluation(
            score.rating_total,
            ratingCount
        );
        const employeeAttendanceRows = attendanceByEmployee.get(String(employee.id)) || [];
        const attendanceEntry = employeeAttendanceRows.find((entry) => String(entry.dateKey || '') === period.start) || null;
        const attendanceMetrics = buildKpiAttendanceMetrics(employee, periodDateKeys, employeeAttendanceRows);
        const taskMetrics = buildKpiTaskMetrics(employee, attendanceMetrics.workingDateKeys, employeeAttendanceRows);
        const isKpiWorkingDay = isKpiWorkingDateForEmployee(employee, period.start);
        const isKpiFinalized = isKpiDateReadyForCalculation(employee, period.start, summaryAt);
        const kpiScorePercent = isKpiFinalized
            ? calculateWeightedKpiScorePercent({
                ...attendanceMetrics,
                ...taskMetrics,
                peerEvaluationPercent
            })
            : null;
        const employeeCreatedDateKey = normalizeDateKey(String(employee.created_at || '').slice(0, 10));
        const employeeHistoryStartDateKey = [scoreHistoryStartDateKey, employeeCreatedDateKey]
            .filter(Boolean)
            .sort()
            .at(-1) || scoreHistoryStartDateKey;
        const dailyScoreItems = buildKpiDailyScoreItems(employee, {
            startDateKey: employeeHistoryStartDateKey,
            endDateKey: period.start,
            attendanceByDate: scoreHistoryAttendanceByDate,
            ratingsByDate: scoreHistoryRatingsByEmployee.get(String(employee.id || '')) || new Map(),
            asOf: summaryAt
        });
        return {
            employeeId: String(employee.id || ''),
            employeeName: String(employee.name || employee.id || ''),
            averageRating,
            ratingCount,
            raterCount,
            adminRatingCount,
            expectedRaterCount,
            attendance: buildKpiSummaryAttendance(attendanceEntry),
            hasTimeIn: Boolean(attendanceEntry?.timeIn),
            hasTimeOut: Boolean(attendanceEntry?.timeOut),
            completionPercent: isPresent
                ? (expectedRaterCount ? Math.min(100, Math.round((raterCount / expectedRaterCount) * 100)) : 100)
                : 0,
            isPresent,
            isKpiWorkingDay,
            isKpiFinalized,
            attendancePercent: attendanceMetrics.attendancePercent,
            punctualityPercent: attendanceMetrics.punctualityPercent,
            taskCompletionPercent: taskMetrics.taskCompletionPercent,
            taskQualityPercent: taskMetrics.taskQualityPercent,
            peerEvaluationPercent,
            initiativePercent: taskMetrics.initiativePercent,
            kpiScorePercent,
            averageKpiScorePercent: calculateAverageDailyKpiScore(dailyScoreItems),
            kpiScoreDayCount: countCalculatedDailyKpiScores(dailyScoreItems),
            dailyKpiScores: dailyScoreItems,
            workingDays: attendanceMetrics.workingDays,
            presentDays: attendanceMetrics.presentDays,
            onTimeDays: attendanceMetrics.onTimeDays,
            assignedTaskCount: taskMetrics.assignedTaskCount,
            completedTaskCount: taskMetrics.completedTaskCount,
            specificTaskCount: taskMetrics.specificTaskCount,
            completedSpecificTaskCount: taskMetrics.completedSpecificTaskCount,
            initiativeTaskCount: taskMetrics.initiativeTaskCount
        };
    });
    let pendingRequiredEvaluations = 0;
    if (period.active && presentEmployees.length > 1) {
        pendingRequiredEvaluations = presentEmployees.filter((employee) => (
            !hasKpiRequiredSubmission(employee.id, period)
        )).length;
    }
    return {
        totalEvaluations: Number(totals.total || 0),
        averageRating: Math.round((Number(totals.average_rating || 0) + Number.EPSILON) * 100) / 100,
        lowRatingCount: Number(totals.low_rating_count || 0),
        excellentRatingCount: Number(totals.excellent_rating_count || 0),
        pendingRequiredEvaluations,
        currentPeriod: period,
        kpiScoreAverageStartDate: scoreHistoryStartDateKey,
        dailyEmployeeScores
    };
}

function getKpiDailyScoreHistory(employeeId = '', { days = 90, at = new Date() } = {}) {
    const normalizedEmployeeId = normalizeText(employeeId);
    const employee = getActiveKpiEmployee(normalizedEmployeeId);
    if (!employee) {
        throw new Error('Active employee not found.');
    }

    const normalizedDays = Math.min(366, Math.max(1, Number(days) || 90));
    const endDateKey = getDateKey(at);
    const requestedStartDateKey = shiftKpiDateKey(endDateKey, -(normalizedDays - 1));
    const settings = getKpiEvaluationSettings();
    const kpiActivatedDateKey = normalizeDateKey(String(settings.createdAt || '').slice(0, 10));
    const employeeCreatedDateKey = normalizeDateKey(String(employee.created_at || '').slice(0, 10));
    const startDateKey = [requestedStartDateKey, employeeCreatedDateKey]
        .filter(Boolean)
        .sort()
        .at(-1) || requestedStartDateKey;
    const calculationStartDateKey = [startDateKey, kpiActivatedDateKey]
        .filter(Boolean)
        .sort()
        .at(-1) || startDateKey;
    if (startDateKey > endDateKey) {
        return {
            employee: buildKpiEmployeeSummary(employee),
            startDate: startDateKey,
            endDate: endDateKey,
            kpiActivatedDate: kpiActivatedDateKey,
            dayOffHistoryStartDate: KPI_DAY_OFF_HISTORY_START_DATE_KEY,
            items: []
        };
    }
    const activeEmployees = listActiveKpiEmployees();
    const activeEmployeeIds = activeEmployees.map((item) => String(item.id || '')).filter(Boolean);
    const activeEmployeeMap = new Map(activeEmployees.map((item) => [String(item.id || ''), item]));
    const attendanceRows = activeEmployeeIds.length
        ? getAttendanceEntriesByFilters({
            userIds: activeEmployeeIds,
            startDateKey,
            endDateKey,
            userMap: activeEmployeeMap
        })
        : [];
    const attendanceByDate = attendanceRows.reduce((map, entry) => {
        const dateKey = String(entry.dateKey || '');
        if (!map.has(dateKey)) map.set(dateKey, []);
        map.get(dateKey).push(entry);
        return map;
    }, new Map());
    const ratingRows = getTenantDb().prepare(`
        SELECT evaluation_period_start AS date_key,
               SUM(rating) AS rating_total,
               AVG(rating) AS average_rating,
               COUNT(*) AS rating_count,
               COUNT(DISTINCT CASE WHEN evaluation_type = 'required_evaluation' THEN evaluator_employee_id END) AS rater_count,
               SUM(CASE WHEN evaluation_type = 'admin_evaluation' THEN 1 ELSE 0 END) AS admin_rating_count
        FROM kpi_evaluation_records
        WHERE evaluation_type IN ('required_evaluation', 'admin_evaluation')
          AND rated_employee_id = ?
          AND evaluation_period_start = evaluation_period_end
          AND evaluation_period_start >= ?
          AND evaluation_period_start <= ?
        GROUP BY evaluation_period_start
    `).all(normalizedEmployeeId, startDateKey, endDateKey);
    const ratingsByDate = new Map(ratingRows.map((row) => [String(row.date_key || ''), row]));
    const items = buildKpiDailyScoreItems(employee, {
        startDateKey,
        endDateKey,
        calculationStartDateKey,
        attendanceByDate,
        ratingsByDate,
        asOf: at
    });

    return {
        employee: buildKpiEmployeeSummary(employee),
        startDate: startDateKey,
        endDate: endDateKey,
        kpiActivatedDate: kpiActivatedDateKey,
        dayOffHistoryStartDate: KPI_DAY_OFF_HISTORY_START_DATE_KEY,
        items
    };
}

function insertKpiAdminEvaluation(db, {
    actorUserId = '',
    actorName = '',
    allowExternalAdmin = false,
    ratedEmployeeId = '',
    dateKey = '',
    rating = 0,
    comment = '',
    submittedAt = ''
} = {}) {
    const context = requireTenantContext();
    const actorId = normalizeText(actorUserId);
    const actorUser = getScopedUser(context.companyId, actorId);
    if (!actorId || (!allowExternalAdmin && (!actorUser || !isCompanyAdminRole(actorUser.role)))) {
        throw new Error('Only a company admin can submit an Admin Evaluation rating.');
    }
    const ratedEmployee = getActiveKpiEmployee(ratedEmployeeId);
    if (!ratedEmployee) {
        throw new Error('Only an active employee can receive an Admin Evaluation rating.');
    }
    const normalizedDateKey = normalizeDateKey(dateKey);
    if (!normalizedDateKey) {
        throw new Error('A valid Admin Evaluation date is required.');
    }
    if (getUserScheduleForDate(ratedEmployee, normalizedDateKey).is_day_off) {
        throw new Error('An employee cannot receive an Admin Evaluation rating on a scheduled Day Off.');
    }
    const normalizedRating = Number(rating);
    if (!Number.isInteger(normalizedRating) || !KPI_RATING_GUIDE[normalizedRating]) {
        throw new Error('Select a 1 to 5 star Admin Evaluation rating.');
    }

    const normalizedComment = normalizeMultilineText(comment, 2000);
    const timestamp = String(submittedAt || new Date().toISOString());
    const resolvedActorName = String(
        actorUser?.display_name
        || actorUser?.username
        || normalizeText(actorName)
        || actorId
    );
    const existing = db.prepare(`
        SELECT *
        FROM kpi_evaluation_records
        WHERE evaluation_type = 'admin_evaluation'
          AND rated_employee_id = ?
          AND evaluation_period_start = ?
          AND evaluation_period_end = ?
        LIMIT 1
    `).get(String(ratedEmployee.id), normalizedDateKey, normalizedDateKey);

    if (existing) {
        throw new Error('The Admin evaluation for this employee and date was already submitted.');
    }

    const submissionId = generateId('kpi_admin_submission');
    const recordId = generateId('kpi_admin');
    db.prepare(`
        INSERT INTO kpi_evaluation_submissions (
            id, evaluator_employee_id, evaluation_type, evaluation_period_start,
            evaluation_period_end, required_period_key, submitted_at
        ) VALUES (?, ?, 'admin_evaluation', ?, ?, NULL, ?)
    `).run(submissionId, actorId, normalizedDateKey, normalizedDateKey, timestamp);
    db.prepare(`
        INSERT INTO kpi_evaluation_records (
            id, submission_id, evaluator_employee_id, evaluator_name,
            rated_employee_id, rated_employee_name, rated_employee_role,
            rating, rating_label, comment, evaluation_type, evaluation_frequency,
            evaluation_period_start, evaluation_period_end, submitted_at,
            visible_to_admin_only, status, reviewed_by_admin_id, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin_evaluation', 'daily', ?, ?, ?, 1, 'reviewed', ?, ?)
    `).run(
        recordId,
        submissionId,
        actorId,
        resolvedActorName,
        ratedEmployee.id,
        ratedEmployee.name,
        ratedEmployee.role || ratedEmployee.branch_name || '',
        normalizedRating,
        KPI_RATING_GUIDE[normalizedRating].label,
        normalizedComment,
        normalizedDateKey,
        normalizedDateKey,
        timestamp,
        actorId,
        timestamp
    );
    db.prepare(`
        INSERT INTO kpi_evaluation_audit_logs (
            id, record_id, actor_user_id, action, previous_status, next_status, note, created_at
        ) VALUES (?, ?, ?, 'admin_rating_submitted', '', 'reviewed', ?, ?)
    `).run(
        generateId('kpi_audit'),
        recordId,
        actorId,
        normalizedComment,
        timestamp
    );
    return recordId;
}

function submitKpiAdminEvaluation(actorUserId, payload = {}, at = new Date(), {
    allowExternalAdmin = false,
    actorName = ''
} = {}) {
    const ratedEmployeeId = normalizeText(
        payload.ratedEmployeeId ?? payload.rated_employee_id ?? payload.employeeId
    );
    const dateKey = normalizeDateKey(payload.dateKey ?? payload.date_key ?? payload.evaluationDate);
    if (!ratedEmployeeId) {
        throw new Error('Select an employee for the Admin evaluation.');
    }
    if (!dateKey) {
        throw new Error('A valid Admin evaluation date is required.');
    }
    const attendanceEntry = getAttendanceEntriesByFilters({
        userIds: [ratedEmployeeId],
        startDateKey: dateKey,
        endDateKey: dateKey
    }).find((entry) => String(entry.id || '') === ratedEmployeeId && String(entry.dateKey || '') === dateKey);
    if (!attendanceEntry?.timeOut) {
        throw new Error('The employee must complete Time Out before an Admin evaluation can be submitted.');
    }

    const db = getTenantDb();
    const submittedAt = at.toISOString();
    const recordId = db.transaction(() => insertKpiAdminEvaluation(db, {
        actorUserId,
        actorName,
        allowExternalAdmin,
        ratedEmployeeId,
        dateKey,
        rating: payload.rating,
        comment: payload.comment,
        submittedAt
    }))();
    logAudit('kpi.admin_evaluation.submit', 'kpi_evaluation', recordId, {
        rated_employee_id: ratedEmployeeId,
        evaluation_date: dateKey
    });
    return getKpiEvaluationById(recordId);
}

function reviewKpiEvaluation(recordId, {
    status = '',
    note = '',
    actorUserId = ''
} = {}) {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (!['reviewed', 'flagged'].includes(normalizedStatus)) {
        throw new Error('KPI review status must be Reviewed or Flagged.');
    }
    const existing = getKpiEvaluationById(recordId);
    const actor = normalizeText(actorUserId) || normalizeText(getCurrentContext()?.actorUserId) || 'admin';
    const normalizedNote = normalizeMultilineText(note, 1000);
    const reviewedAt = new Date().toISOString();
    const db = getTenantDb();
    db.transaction(() => {
        db.prepare(`
            UPDATE kpi_evaluation_records
            SET status = ?, reviewed_by_admin_id = ?, reviewed_at = ?
            WHERE id = ?
        `).run(normalizedStatus, actor, reviewedAt, String(recordId));
        db.prepare(`
            INSERT INTO kpi_evaluation_audit_logs (
                id, record_id, actor_user_id, action, previous_status, next_status, note, created_at
            ) VALUES (?, ?, ?, 'status_changed', ?, ?, ?, ?)
        `).run(
            generateId('kpi_audit'),
            String(recordId),
            actor,
            existing.status,
            normalizedStatus,
            normalizedNote,
            reviewedAt
        );
    })();
    logAudit('kpi.record.review', 'kpi_evaluation', String(recordId), {
        previous_status: existing.status,
        next_status: normalizedStatus,
        note: normalizedNote
    });
    return getKpiEvaluationById(recordId);
}

function submitKpiIssueEncounter(evaluatorId, payload = {}, at = new Date()) {
    const prepared = prepareKpiEvaluationSubmission(evaluatorId, {
        issueEncounters: payload.issueEncounters ?? payload.issue_encounters ?? payload.items ?? []
    }, at, { includeRequired: false });
    if (!prepared.issue.length) {
        throw new Error('Select at least one present employee for the Issue Encounter.');
    }
    const db = getTenantDb();
    const inserted = db.transaction(() => insertPreparedKpiSubmission(db, prepared, at))();
    logAudit('kpi.issue_encounter.submit', 'kpi_submission', inserted.issueIds[0] || '', {
        evaluator_employee_id: evaluatorId,
        record_count: inserted.issueIds.length
    });
    return inserted.issueIds.map((id) => getKpiEvaluationById(id));
}

function serializeIncidentReport(row = {}) {
    return {
        id: String(row.id || ''),
        date: String(row.incident_date || ''),
        department: String(row.department || ''),
        reasonIncident: String(row.reason_incident || ''),
        actionTaken: String(row.action_taken || ''),
        preparedBy: String(row.prepared_by || ''),
        checkedBy: String(row.checked_by || ''),
        dateChecked: String(row.date_checked || ''),
        resolved: Boolean(Number(row.resolved || 0)),
        status: Number(row.resolved || 0) ? 'resolved' : 'unresolved',
        ownerEmployeeId: String(row.assigned_employee_id || ''),
        ownerEmployeeName: String(row.assigned_employee_name || ''),
        createdByUserId: String(row.created_by_user_id || ''),
        createdAt: String(row.created_at || ''),
        updatedAt: String(row.updated_at || ''),
        resolvedAt: String(row.resolved_at || '')
    };
}

function normalizeIncidentDate(value, label, { required = false } = {}) {
    const normalized = normalizeDateKey(value);
    if (!normalized && (required || normalizeText(value))) {
        throw new Error(`${label} must be a valid date.`);
    }
    return normalized;
}

function resolveIncidentOwner(employeeId = '') {
    const normalizedEmployeeId = normalizeText(employeeId);
    if (!normalizedEmployeeId) {
        throw new Error('Incident report owner is required.');
    }

    const employee = getUserById(normalizedEmployeeId);
    if (
        !employee
        || !isEmployeeLikeRole(employee.role)
        || !employee.is_active
        || String(employee.account_status || '').toLowerCase() !== 'active'
    ) {
        throw new Error('Incident reports are only available to active employee accounts.');
    }

    return {
        id: String(employee.id || ''),
        name: String(employee.name || employee.id || '')
    };
}

function getIncidentReportById(reportId = '') {
    const row = getTenantDb().prepare(`
        SELECT *
        FROM incident_reports
        WHERE id = ?
        LIMIT 1
    `).get(String(reportId || ''));
    if (!row) {
        throw new Error('Incident report not found.');
    }
    return serializeIncidentReport(row);
}

function buildIncidentReportFilters({
    ownerEmployeeId = '',
    status = '',
    search = '',
    dateFrom = '',
    dateTo = ''
} = {}) {
    const clauses = [];
    const params = [];
    const normalizedEmployeeId = normalizeText(ownerEmployeeId);
    const normalizedStatus = normalizeText(status).toLowerCase();
    const normalizedSearch = normalizeText(search);
    const normalizedDateFrom = normalizeIncidentDate(dateFrom, 'Start date');
    const normalizedDateTo = normalizeIncidentDate(dateTo, 'End date');

    if (normalizedEmployeeId) {
        clauses.push('assigned_employee_id = ?');
        params.push(normalizedEmployeeId);
    }
    if (normalizedStatus === 'resolved') {
        clauses.push('resolved = 1');
    } else if (normalizedStatus === 'unresolved') {
        clauses.push('resolved = 0');
    }
    if (normalizedDateFrom) {
        clauses.push('incident_date >= ?');
        params.push(normalizedDateFrom);
    }
    if (normalizedDateTo) {
        clauses.push('incident_date <= ?');
        params.push(normalizedDateTo);
    }
    if (normalizedSearch) {
        const pattern = `%${normalizedSearch}%`;
        clauses.push(`(
            LOWER(department) LIKE LOWER(?)
            OR LOWER(reason_incident) LIKE LOWER(?)
            OR LOWER(action_taken) LIKE LOWER(?)
            OR LOWER(prepared_by) LIKE LOWER(?)
            OR LOWER(checked_by) LIKE LOWER(?)
            OR LOWER(assigned_employee_name) LIKE LOWER(?)
        )`);
        params.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }

    return {
        whereClause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
        params
    };
}

function listIncidentReports(filters = {}) {
    const normalizedLimit = Math.min(2500, Math.max(1, Number(filters.limit) || 500));
    const normalizedOffset = Math.max(0, Number(filters.offset) || 0);
    const { whereClause, params } = buildIncidentReportFilters(filters);
    return getTenantDb().prepare(`
        SELECT *
        FROM incident_reports
        ${whereClause}
        ORDER BY resolved ASC, incident_date DESC, datetime(updated_at) DESC, id DESC
        LIMIT ? OFFSET ?
    `).all(...params, normalizedLimit, normalizedOffset).map(serializeIncidentReport);
}

function getIncidentReportSummary({ ownerEmployeeId = '' } = {}) {
    const normalizedEmployeeId = normalizeText(ownerEmployeeId);
    const whereClause = normalizedEmployeeId ? 'WHERE assigned_employee_id = ?' : '';
    const params = normalizedEmployeeId ? [normalizedEmployeeId] : [];
    const row = getTenantDb().prepare(`
        SELECT
            COUNT(*) AS total_count,
            SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) AS unresolved_count,
            SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) AS resolved_count
        FROM incident_reports
        ${whereClause}
    `).get(...params);
    return {
        total: Number(row?.total_count || 0),
        unresolved: Number(row?.unresolved_count || 0),
        resolved: Number(row?.resolved_count || 0)
    };
}

function createIncidentReport(payload = {}, { actorUserId = '', ownerEmployeeId = '' } = {}) {
    const incidentDate = normalizeIncidentDate(
        payload.date ?? payload.incidentDate ?? payload.incident_date,
        'Incident date',
        { required: true }
    );
    const department = normalizeText(payload.department).slice(0, 160);
    const reasonIncident = normalizeMultilineText(
        payload.reasonIncident ?? payload.reason_incident ?? payload.reason,
        { maxLength: 5000 }
    );
    const actionTaken = normalizeMultilineText(
        payload.actionTaken ?? payload.action_taken ?? payload.action,
        { maxLength: 8000 }
    );
    const preparedBy = normalizeText(payload.preparedBy ?? payload.prepared_by).slice(0, 160);
    const checkedBy = normalizeText(payload.checkedBy ?? payload.checked_by).slice(0, 160);
    const resolved = normalizeKpiBoolean(payload.resolved, false);
    const dateChecked = normalizeIncidentDate(
        payload.dateChecked ?? payload.date_checked,
        'Date checked'
    );
    const owner = resolveIncidentOwner(ownerEmployeeId || actorUserId);

    if (!department) {
        throw new Error('Department is required.');
    }
    if (!reasonIncident) {
        throw new Error('Reason / Incident is required.');
    }
    if (!preparedBy) {
        throw new Error('Prepared By is required.');
    }

    const id = generateId('incident');
    const now = new Date().toISOString();
    getTenantDb().prepare(`
        INSERT INTO incident_reports (
            id, incident_date, department, reason_incident, action_taken,
            prepared_by, checked_by, date_checked, resolved,
            assigned_employee_id, assigned_employee_name, created_by_user_id,
            created_at, updated_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        incidentDate,
        department,
        reasonIncident,
        actionTaken,
        preparedBy,
        checkedBy,
        dateChecked,
        resolved ? 1 : 0,
        owner.id,
        owner.name,
        normalizeText(actorUserId),
        now,
        now,
        resolved ? now : ''
    );
    logAudit('incident_report.create', 'incident_report', id, {
        owner_employee_id: owner.id,
        resolved
    });
    return getIncidentReportById(id);
}

function updateIncidentReport(reportId, payload = {}, { actorUserId = '' } = {}) {
    const existing = getIncidentReportById(reportId);
    const has = (camelKey, snakeKey = '') => (
        Object.prototype.hasOwnProperty.call(payload, camelKey)
        || (snakeKey && Object.prototype.hasOwnProperty.call(payload, snakeKey))
    );
    const read = (camelKey, snakeKey = '') => (
        Object.prototype.hasOwnProperty.call(payload, camelKey)
            ? payload[camelKey]
            : payload[snakeKey]
    );

    const incidentDate = has('date', 'incident_date') || has('incidentDate')
        ? normalizeIncidentDate(
            has('date', 'incident_date') ? read('date', 'incident_date') : payload.incidentDate,
            'Incident date',
            { required: true }
        )
        : existing.date;
    const department = has('department')
        ? normalizeText(payload.department).slice(0, 160)
        : existing.department;
    const reasonIncident = has('reasonIncident', 'reason_incident')
        ? normalizeMultilineText(read('reasonIncident', 'reason_incident'), { maxLength: 5000 })
        : existing.reasonIncident;
    const actionTaken = has('actionTaken', 'action_taken')
        ? normalizeMultilineText(read('actionTaken', 'action_taken'), { maxLength: 8000 })
        : existing.actionTaken;
    const preparedBy = has('preparedBy', 'prepared_by')
        ? normalizeText(read('preparedBy', 'prepared_by')).slice(0, 160)
        : existing.preparedBy;
    const checkedBy = has('checkedBy', 'checked_by')
        ? normalizeText(read('checkedBy', 'checked_by')).slice(0, 160)
        : existing.checkedBy;
    const dateChecked = has('dateChecked', 'date_checked')
        ? normalizeIncidentDate(read('dateChecked', 'date_checked'), 'Date checked')
        : existing.dateChecked;
    const resolved = has('resolved')
        ? normalizeKpiBoolean(payload.resolved, existing.resolved)
        : existing.resolved;
    if (!department) {
        throw new Error('Department is required.');
    }
    if (!reasonIncident) {
        throw new Error('Reason / Incident is required.');
    }
    if (!preparedBy) {
        throw new Error('Prepared By is required.');
    }

    const now = new Date().toISOString();
    const resolvedAt = resolved
        ? (existing.resolvedAt || now)
        : '';
    getTenantDb().prepare(`
        UPDATE incident_reports
        SET incident_date = ?,
            department = ?,
            reason_incident = ?,
            action_taken = ?,
            prepared_by = ?,
            checked_by = ?,
            date_checked = ?,
            resolved = ?,
            updated_at = ?,
            resolved_at = ?
        WHERE id = ?
    `).run(
        incidentDate,
        department,
        reasonIncident,
        actionTaken,
        preparedBy,
        checkedBy,
        dateChecked,
        resolved ? 1 : 0,
        now,
        resolvedAt,
        String(reportId || '')
    );
    logAudit('incident_report.update', 'incident_report', String(reportId || ''), {
        actor_user_id: normalizeText(actorUserId),
        owner_employee_id: existing.ownerEmployeeId,
        previous_resolved: existing.resolved,
        next_resolved: resolved
    });
    return getIncidentReportById(reportId);
}

function recordTimeIn(userId, at = new Date()) {
    const user = getUserById(userId);
    if (!user || !isEmployeeLikeRole(user.role)) {
        throw new Error('Employee not found.');
    }
    const dateKey = getDateKey(at);
    assertAttendanceAccountAvailable(user, dateKey, 'recording attendance');
    const timeNow = formatTimeValue(at);
    const existing = findAttendanceRecord(userId, dateKey);
    if (existing && existing.timeIn) {
        throw new Error(`${user.name} already timed in today.`);
    }

    const scheduleForDate = getUserScheduleForDate(user, dateKey);
    const remarks = buildClockAttendanceRemark(timeNow, scheduleForDate.time_in, { user, dateKey }) || 'On Time';
    const db = getTenantDb();

    if (existing) {
        db.prepare(`
            UPDATE attendance
            SET name = ?, branch_id = ?, date = ?, time_in = ?, remarks = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE rowid = ?
        `).run(user.name, user.branch_id || null, dateKey, timeNow, remarks, existing.rowId);
    } else {
        db.prepare(`
            INSERT INTO attendance (id, branch_id, name, date, time_in, time_out, worked_hours, remarks, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(user.id, user.branch_id || null, user.name, dateKey, timeNow, '', '', remarks);
    }

    return {
        user,
        time: timeNow,
        status: remarks,
        record: findAttendanceRecord(userId, dateKey)
    };
}

function recordTimeOut(userId, at = new Date(), taskPayload = {}) {
    const user = getUserById(userId);
    if (!user || !isEmployeeLikeRole(user.role)) {
        throw new Error('Employee not found.');
    }
    const dateKey = getDateKey(at);
    assertAttendanceAccountAvailable(user, dateKey, 'recording attendance');
    const timeNow = formatTimeValue(at);
    const existing = findAttendanceRecord(userId, dateKey);

    if (!existing || !existing.timeIn) {
        throw new Error('No time-in record found for today.');
    }

    if (existing.timeOut) {
        throw new Error(`${user.name} already timed out today.`);
    }

    const scheduleForDate = getUserScheduleForDate(user, dateKey);
    const scheduledTimeIn = scheduleForDate.is_day_off ? '' : formatTimeValue(scheduleForDate.time_in || '');
    const scheduledTimeOut = scheduleForDate.is_day_off ? '' : formatTimeValue(scheduleForDate.time_out || '');
    const workedHours = calculateWorkedHours(existing.timeIn, timeNow, scheduledTimeIn, scheduledTimeOut) || '0.00';
    const nextRemarks = buildClockAttendanceRemark(existing.timeIn, scheduledTimeIn, { user, dateKey })
        || normalizeStatus(existing.remarksRaw, existing.lateMinutes, Boolean(existing.timeIn))
        || existing.status
        || 'On Time';
    const assignedTasks = getAssignedTasksForSerializedUser(user);
    const taskResults = normalizeTaskResultsPayload(taskPayload, assignedTasks);
    const primaryTaskResult = taskResults[0] || null;
    const timeoutIssues = normalizeMultilineText(
        taskPayload.timeoutIssues ?? taskPayload.timeout_issues ?? taskPayload.issuesEncountered ?? '',
        2000
    );
    const timeoutRemarks = normalizeMultilineText(
        taskPayload.timeoutRemarks ?? taskPayload.timeout_remarks ?? taskPayload.optionalRemarks ?? '',
        2000
    );
    const preparedKpiSubmission = prepareKpiEvaluationSubmission(userId, taskPayload, at);
    const db = getTenantDb();
    let insertedKpi = { requiredIds: [], issueIds: [] };
    db.transaction(() => {
        insertedKpi = insertPreparedKpiSubmission(db, preparedKpiSubmission, at);
        db.prepare(`
            UPDATE attendance
            SET name = ?, time_out = ?, worked_hours = ?, remarks = ?,
                task_id = ?, task_name = ?, task_count = ?, task_results_json = ?,
                timeout_issues = ?, timeout_remarks = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE rowid = ?
        `).run(
            user.name,
            timeNow,
            workedHours,
            nextRemarks,
            primaryTaskResult?.id || '',
            primaryTaskResult?.name || '',
            primaryTaskResult ? Math.max(0, Number(primaryTaskResult.count || 0) || 0) : 0,
            JSON.stringify(taskResults),
            timeoutIssues,
            timeoutRemarks,
            existing.rowId
        );
    })();

    if (insertedKpi.requiredIds.length || insertedKpi.issueIds.length) {
        logAudit('kpi.timeout_submission.create', 'attendance', `${user.id}:${dateKey}`, {
            evaluator_employee_id: user.id,
            required_record_count: insertedKpi.requiredIds.length,
            issue_encounter_record_count: insertedKpi.issueIds.length,
            evaluation_period_start: preparedKpiSubmission.context.period.start,
            evaluation_period_end: preparedKpiSubmission.context.period.end
        });
    }

    return {
        user,
        time: timeNow,
        workedHours,
        task: primaryTaskResult,
        tasks: taskResults,
        kpiEvaluation: {
            requiredRecordIds: insertedKpi.requiredIds,
            issueEncounterRecordIds: insertedKpi.issueIds
        },
        record: findAttendanceRecord(userId, dateKey)
    };
}

function tableExists(db, tableName) {
    return getTableColumns(db, tableName).length > 0;
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
        VALUES (?, NULL, NULL, ?, ?, ?, 1, ?, '', '${DEFAULT_EMPLOYEE_TIME_IN}', '${DEFAULT_EMPLOYEE_TIME_OUT}')
    `).run(
        createUserInternalId('', username),
        username,
        normalizePasswordForStorage(password),
        ROLE_SUPER_ADMIN,
        'Super Admin'
    );
}

function countActiveSuperAdminUsers({ excludeUsername = '' } = {}) {
    ensureSystemReady();
    const normalizedExclude = normalizeText(excludeUsername);
    return countRows(getMasterDb(), `
        SELECT COUNT(*) AS total
        FROM users
        WHERE LOWER(role) = 'super_admin'
          AND COALESCE(is_active, 0) = 1
          AND (? = '' OR LOWER(username) != LOWER(?))
    `, normalizedExclude, normalizedExclude);
}

function listSuperAdminUsers(filter = '') {
    ensureSystemReady();
    const normalizedFilter = normalizeText(filter);
    const params = [];
    let whereClause = `WHERE LOWER(role) = 'super_admin'`;
    if (normalizedFilter) {
        whereClause += `
            AND (
                LOWER(username) LIKE LOWER(?)
                OR LOWER(display_name) LIKE LOWER(?)
                OR LOWER(COALESCE(login_email, '')) LIKE LOWER(?)
            )
        `;
        const likeValue = `%${normalizedFilter}%`;
        params.push(likeValue, likeValue, likeValue);
    }

    const rows = getMasterDb().prepare(`
        SELECT *
        FROM users
        ${whereClause}
        ORDER BY display_name COLLATE NOCASE, username COLLATE NOCASE
    `).all(...params);

    return rows.map((row) => serializeUser(row));
}

function createSuperAdminUser(payload = {}) {
    ensureSystemReady();
    const username = normalizeText(payload.id || payload.username);
    const displayName = normalizeText(payload.name || payload.display_name || username);
    const loginEmail = normalizeEmail(payload.login_email || payload.loginEmail || payload.email || '');
    const passwordHash = normalizePasswordForStorage(payload.password);

    if (!username) {
        throw new Error('Username is required.');
    }
    if (!displayName) {
        throw new Error('Name is required.');
    }
    if (getScopedUser('', username)) {
        throw new Error('Username already exists.');
    }
    if (loginEmail && !isValidEmail(loginEmail)) {
        throw new Error('Valid email is required.');
    }

    const nextAccountStatus = resolveUserAccountStatusPayload(payload);
    const nextIsActive = nextAccountStatus === USER_ACCOUNT_STATUS_ACTIVE;
    const nextSuspendedOn = nextAccountStatus === USER_ACCOUNT_STATUS_SUSPENDED ? getDateKey() : '';
    const nextInactiveOn = nextAccountStatus === USER_ACCOUNT_STATUS_INACTIVE ? getDateKey() : '';

    getMasterDb().prepare(`
        INSERT INTO users (
            id, company_id, branch_id, username, password_hash, role, is_active,
            account_status, suspended_on, inactive_on, display_name, profile_picture, login_email, login_email_verified,
            google_email, google_email_verified, time_in, time_out, schedule_json, feature_access_json
        )
        VALUES (?, NULL, NULL, ?, ?, 'super_admin', ?, ?, ?, ?, '', ?, 0, '', 0, '${DEFAULT_EMPLOYEE_TIME_IN}', '${DEFAULT_EMPLOYEE_TIME_OUT}', '{}', '{}')
    `).run(
        createUserInternalId('', username),
        username,
        passwordHash,
        nextIsActive ? 1 : 0,
        nextAccountStatus,
        nextSuspendedOn,
        nextInactiveOn,
        displayName,
        loginEmail
    );

    logAudit('customer_service.account_create', 'user', username, {
        role: ROLE_SUPER_ADMIN,
        login_email: loginEmail
    });

    return getUserById(username);
}

function updateSuperAdminUser(username = '', payload = {}) {
    ensureSystemReady();
    const user = getScopedUser('', username);
    if (!user || normalizeRole(user.role) !== ROLE_SUPER_ADMIN) {
        throw new Error('Customer service account not found.');
    }

    const currentAccountStatus = getUserAccountStatus(user);
    const nextAccountStatus = resolveUserAccountStatusPayload(payload, currentAccountStatus);
    const nextIsActive = nextAccountStatus === USER_ACCOUNT_STATUS_ACTIVE;
    if (!nextIsActive && countActiveSuperAdminUsers({ excludeUsername: username }) < 1) {
        throw new Error('At least one active customer service admin must remain.');
    }

    const nextName = normalizeText(payload.name || payload.display_name || user.display_name || user.username) || user.username;
    const nextLoginEmail = normalizeEmail(payload.login_email || payload.loginEmail || payload.email || user.login_email || '');
    if (nextLoginEmail && !isValidEmail(nextLoginEmail)) {
        throw new Error('Valid email is required.');
    }
    const finalPassword = normalizeText(payload.password)
        ? normalizePasswordForStorage(payload.password)
        : user.password_hash;
    const nextSuspendedOn = nextAccountStatus === USER_ACCOUNT_STATUS_SUSPENDED
        ? (currentAccountStatus === USER_ACCOUNT_STATUS_SUSPENDED ? (getUserSuspendedOn(user) || getDateKey()) : getDateKey())
        : '';
    const nextInactiveOn = nextAccountStatus === USER_ACCOUNT_STATUS_INACTIVE
        ? (currentAccountStatus === USER_ACCOUNT_STATUS_INACTIVE ? (getUserInactiveOn(user) || getDateKey()) : getDateKey())
        : '';

    getMasterDb().prepare(`
        UPDATE users
        SET display_name = ?,
            password_hash = ?,
            login_email = ?,
            login_email_verified = 0,
            is_active = ?,
            account_status = ?,
            suspended_on = ?,
            inactive_on = ?
        WHERE id = ?
    `).run(
        nextName,
        finalPassword,
        nextLoginEmail,
        nextIsActive ? 1 : 0,
        nextAccountStatus,
        nextSuspendedOn,
        nextInactiveOn,
        user.id
    );

    logAudit('customer_service.account_update', 'user', username, {
        role: ROLE_SUPER_ADMIN,
        is_active: nextIsActive,
        account_status: nextAccountStatus,
        login_email: nextLoginEmail
    });

    if (nextAccountStatus === USER_ACCOUNT_STATUS_INACTIVE) {
        clearUserLoginConnectionsByInternalId(user.id);
    }

    return getUserById(username);
}

function deleteSuperAdminUser(username = '') {
    ensureSystemReady();
    const user = getScopedUser('', username);
    if (!user || normalizeRole(user.role) !== ROLE_SUPER_ADMIN) {
        throw new Error('Customer service account not found.');
    }

    const remainingActive = countActiveSuperAdminUsers({ excludeUsername: username });
    if (Boolean(Number(user.is_active || 0)) && remainingActive < 1) {
        throw new Error('At least one active customer service admin must remain.');
    }

    getMasterDb().prepare('DELETE FROM users WHERE id = ?').run(user.id);
    logAudit('customer_service.account_remove', 'user', username, {
        role: ROLE_SUPER_ADMIN
    });
    return { deleted: true, id: username };
}

function createCompany({
    name,
    companyCode = '',
    subdomain = '',
    customDomain = '',
    planId,
    logoPath = '',
    loginBackgroundPath = '',
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
    const tenantSchema = buildTenantSchemaName(companyId);
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
                logo_path, login_background_path, primary_color, app_name, db_schema
            )
            VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            companyId,
            normalizedName,
            plan.id,
            normalizedCompanyCode,
            normalizedSubdomain,
            normalizedCustomDomain,
            String(logoPath || ''),
            String(loginBackgroundPath || ''),
            normalizeText(primaryColor) || PARENT_BRAND.primaryColor,
            normalizeText(appName),
            tenantSchema
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

    const recommendedWorkspaceConfig = buildRecommendedWorkspaceConfigForPlan(plan, {
        companyName: normalizedName,
        companyCode: normalizedCompanyCode,
        appName: normalizeText(appName)
    });
    if (recommendedWorkspaceConfig) {
        tenantDb.prepare(`
            INSERT INTO tenant_meta (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(WORKSPACE_CONFIG_META_KEY, JSON.stringify(recommendedWorkspaceConfig));
    }

    ensureDefaultTenantTemplate(companyId, getCompanyById(companyId));

    getMasterDb().prepare(`
        INSERT INTO users (
            id, company_id, branch_id, username, password_hash, role, is_active,
            display_name, profile_picture, time_in, time_out
        )
        VALUES (?, ?, ?, ?, ?, 'company_admin', 1, ?, '', '${DEFAULT_EMPLOYEE_TIME_IN}', '${DEFAULT_EMPLOYEE_TIME_OUT}')
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
            login_background_path: row.login_background_path || '',
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
    const hasLoginBackgroundPath = Object.prototype.hasOwnProperty.call(payload, 'login_background_path')
        || Object.prototype.hasOwnProperty.call(payload, 'loginBackgroundPath');
    const logoPath = String(payload.logo_path || payload.logoPath || existing.logo_path || '');
    const loginBackgroundPath = hasLoginBackgroundPath
        ? String(payload.login_background_path ?? payload.loginBackgroundPath ?? '')
        : String(existing.login_background_path || '');
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
                login_background_path = ?,
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
            loginBackgroundPath,
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

    const tenantSchema = getTenantSchema(existing.id);
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

    db.exec(`DROP SCHEMA IF EXISTS "${tenantSchema.replace(/"/g, '""')}" CASCADE`);

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
        SELECT audit_logs.id,
               audit_logs.company_id,
               audit_logs.actor_user_id,
               audit_logs.action,
               audit_logs.target_type,
               audit_logs.target_id,
               audit_logs.details_json,
               audit_logs.created_at,
               companies.name AS company_name,
               companies.company_code AS company_code,
               COALESCE(NULLIF(users.display_name, ''), users.username, audit_logs.actor_user_id) AS actor_name,
               COALESCE(NULLIF(users.role, ''), '') AS actor_role
        FROM audit_logs
        LEFT JOIN companies
          ON companies.id = audit_logs.company_id
        LEFT JOIN users
          ON COALESCE(users.company_id, '') = COALESCE(audit_logs.company_id, '')
         AND LOWER(users.username) = LOWER(COALESCE(audit_logs.actor_user_id, ''))
        ${whereClause}
        ORDER BY audit_logs.id DESC
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

    const LegacySqliteDatabase = getLegacySqliteDatabase();
    const legacyUsersDb = fs.existsSync(legacyPaths.users)
        ? new LegacySqliteDatabase(legacyPaths.users, { readonly: true, fileMustExist: true })
        : null;
    const legacyAttendanceDb = fs.existsSync(legacyPaths.attendance)
        ? new LegacySqliteDatabase(legacyPaths.attendance, { readonly: true, fileMustExist: true })
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
                    formatTimeValue(row.time_in) || DEFAULT_EMPLOYEE_TIME_IN,
                    formatTimeValue(row.time_out) || DEFAULT_EMPLOYEE_TIME_OUT
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
            copySharedColumns(legacyUsersDb, tenantDb, 'customer_credit_ledger', 'customer_credit_ledger');
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

function ensureUserSuspensionDates(masterDb = getMasterDb()) {
    masterDb.prepare(`
        UPDATE users
        SET suspended_on = ?
        WHERE LOWER(TRIM(COALESCE(account_status, ''))) = ?
          AND COALESCE(TRIM(suspended_on), '') = ''
    `).run(getDateKey(), USER_ACCOUNT_STATUS_SUSPENDED);
}

function ensureUserInactiveDates(masterDb = getMasterDb()) {
    masterDb.prepare(`
        UPDATE users
        SET inactive_on = ?
        WHERE LOWER(TRIM(COALESCE(account_status, ''))) = ?
          AND COALESCE(TRIM(inactive_on), '') = ''
    `).run(getDateKey(), USER_ACCOUNT_STATUS_INACTIVE);
}

function ensureUserAccountStatuses(masterDb = getMasterDb()) {
    masterDb.prepare(`
        UPDATE users
        SET account_status = CASE
            WHEN COALESCE(is_active, 0) = 1 THEN ?
            ELSE ?
        END
        WHERE LOWER(TRIM(COALESCE(account_status, ''))) NOT IN (?, ?, ?, ?, ?, ?)
    `).run(
        USER_ACCOUNT_STATUS_ACTIVE,
        USER_ACCOUNT_STATUS_SUSPENDED,
        USER_ACCOUNT_STATUS_ACTIVE,
        USER_ACCOUNT_STATUS_INACTIVE,
        USER_ACCOUNT_STATUS_SUSPENDED,
        USER_ACCOUNT_STATUS_RESIGNED,
        USER_ACCOUNT_STATUS_BANNED,
        USER_ACCOUNT_STATUS_TERMINATED
    );
}

function removeLegacyBlockedDevices(masterDb = getMasterDb()) {
    masterDb.exec('DROP TABLE IF EXISTS blocked_devices');
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
        ensureTableColumn(masterDb, 'users', 'daily_salary', 'REAL NOT NULL DEFAULT 0');
        ensureTableColumn(masterDb, 'users', 'account_status', "TEXT NOT NULL DEFAULT 'active'");
        ensureTableColumn(masterDb, 'users', 'suspended_on', "TEXT NOT NULL DEFAULT ''");
        ensureTableColumn(masterDb, 'users', 'inactive_on', "TEXT NOT NULL DEFAULT ''");
        ensureTableColumn(masterDb, 'users', 'assigned_task_id', "TEXT NOT NULL DEFAULT ''");
        ensureTableColumn(masterDb, 'users', 'assigned_task_ids_json', "TEXT NOT NULL DEFAULT '[]'");
        ensureTableColumn(masterDb, 'users', 'custom_assigned_tasks_json', "TEXT NOT NULL DEFAULT '[]'");
        ensureTableColumn(masterDb, 'users', 'login_email', "TEXT NOT NULL DEFAULT ''");
        ensureTableColumn(masterDb, 'users', 'login_email_verified', 'INTEGER NOT NULL DEFAULT 0');
        ensureTableColumn(masterDb, 'users', 'google_email', "TEXT NOT NULL DEFAULT ''");
        ensureTableColumn(masterDb, 'users', 'google_email_verified', 'INTEGER NOT NULL DEFAULT 0');
        seedDefaultPlans();
        ensureSuperAdminSeed();
        migrateLegacySingleCompany();
        removeLegacyBlockedDevices(masterDb);
        ensureUserAccountStatuses(masterDb);
        ensureUserSuspensionDates(masterDb);
        ensureUserInactiveDates(masterDb);
        clearInactiveUserLoginConnections(masterDb);
        ensureUserWeeklySchedules(masterDb);
        systemReady = true;
    } finally {
        systemInitializing = false;
    }
}

module.exports = {
    ATTENDANCE_TIME_ZONE,
    ROLE_SUPER_ADMIN,
    ROLE_COMPANY_ADMIN,
    ROLE_EMPLOYEE,
    ROLE_STAFF,
    PARENT_BRAND,
    activeDataRoot,
    paths,
    addBranch,
    addClient,
    addCompanyRegistrationRequestMessageByCode,
    addCustomerRequestMessageByCode,
    addEmployee,
    addTask,
    addUser,
    approveSignupRequest,
    assertAiAccess,
    assertBranchLimit,
    assertInvoiceLimit,
    assertModuleAccess,
    assertUserLimit,
    buildAvatarUrl,
    calculateAttendancePayrollSnapshot,
    calculateAttendanceTimeMetrics,
    calculateLateMinutes,
    calculateWorkedMinutes,
    calculateWorkedHours,
    closeAll,
    closeTenantDb,
    createCompany,
    createCompanyRegistrationRequest,
    createCustomerRequest,
    createAttendanceCorrectionRequest,
    createIncidentReport,
    createPlan,
    deleteCompanyById,
    deleteBranch,
    deletePlan,
    deleteEmployee,
    deleteTask,
    deleteUser,
    ensureSystemReady,
    findAttendanceRecord,
    formatDisplayDate,
    formatTimeValue,
    getAttendanceByUser,
    getAttendanceRecordForDate,
    getAttendanceForMonth,
    getAttendanceReport,
    getActiveSubscription,
    getBranchById,
    getClientById,
    getCompanyByCodeOrHost,
    getCompanyByHost,
    getCompanyById,
    getCompanyBulletin,
    getCompanyBulletinFeed,
    getCompanyPricelistConfig,
    getCompanyRegistrationRequestThreadByCode,
    getCompanySettings,
    getCompanyWorkspaceConfig,
    getLbcCollectionAssignees,
    isLbcCollectionAssignee,
    getCustomerServiceConfig,
    getCustomerRequestThreadByCode,
    getCurrentBranding,
    getCurrentContext,
    getDailyAttendanceSnapshot,
    getDateKey,
    getAiChatMemory,
    getInvoiceTemplate,
    getIncidentReportById,
    getIncidentReportSummary,
    getMasterDb,
    getMonthKey,
    getPlanById,
    getPublicBranding,
    getPrimaryCompanyAdminUser,
    getScopedUser,
    getUserCutoffPayrollStatus,
    getUserSemiMonthlyTimeCard,
    getSuperAdminBootstrap,
    getTenantBootstrap,
    getTenantDb,
    getTenantSchema,
    getTenantFeatureState,
    getAttendanceCorrectionRaw,
    getKpiEvaluationById,
    getKpiEvaluationContext,
    getKpiEvaluationSettings,
    getKpiEvaluationSummary,
    getKpiDailyScoreHistory,
    getTodayAttendance,
    getUsageRow,
    getUserByCredentials,
    getUserByLoginHandle,
    getUserById,
    getUserByInternalId,
    linkUserGoogleEmail,
    requestUserConnectionUnlinkVerification,
    unlinkUserGoogleEmail,
    unlinkUserLoginEmail,
    listActiveCompanyCodesByUsername,
    listSignupRequests,
    getUserTimeCard,
    getUserWeeklyTimeCard,
    incrementUsage,
    isCompanyAdminRole,
    listAttendanceEntries,
    listAttendanceCorrections,
    listAttendanceAuditLogs,
    listActiveKpiEmployees,
    listAuditLogs,
    listAccessLogs,
    listBranches,
    listClients,
    listCompanies,
    listCompanyRegistrationRequests,
    listSuperAdminUsers,
    listCustomerRequests,
    listIncidentReports,
    listPlans,
    listKpiEvaluations,
    listTasks,
    listUsers,
    logAccessEvent,
    logAudit,
    recordAuditEvent,
    parseDateValue,
    recordAiRead,
    recordInvoiceCreated,
    recordTimeIn,
    recordTimeOut,
    approveAttendanceCorrection,
    rejectAttendanceCorrection,
    reviewKpiEvaluation,
    requestUserEmailVerification,
    requestPasswordResetCode,
    verifyUserConnectionUnlinkVerification,
    verifyPasswordResetCode,
    runWithTenantContextByCompany,
    saveClientProfile,
    saveAiChatMemory,
    saveUserProfile,
    submitKpiIssueEncounter,
    submitKpiAdminEvaluation,
    setCompanySubscription,
    setDailyAttendanceStatus,
    setManualTimeCardEntry,
    setUserAssignedTask,
    setUserCutoffPayrollStatus,
    setUserCutoffPayslipPhoto,
    upsertCompanyAddon,
    updateCompanyById,
    updateCompanyAdminCredentials,
    updateCompanyAnnouncement,
    addCompanyHoliday,
    updateBranch,
    updateClient,
    updateCompanyHoliday,
    deleteClient,
    deleteCompanyHoliday,
    clearCompanyAnnouncement,
    clearInactiveUserLoginConnections,
    updateCompanySettings,
    updateKpiEvaluationSettings,
    updateCompanyPricelistConfig,
    updateCompanyWorkspaceConfig,
    setLbcCollectionAssignees,
    updateCustomerServiceConfig,
    updateCompanyRegistrationRequestByCode,
    appendCustomerRequestTranscriptByCode,
    updateCustomerRequestByCode,
    updateEmployee,
    updateEmployeeSchedule,
    updateIncidentReport,
    updateInvoiceTemplate,
    updatePlan,
    updateUser,
    rejectSignupRequest,
    setUserLoginEmail,
    resetPasswordWithCode,
    createSuperAdminUser,
    updateSuperAdminUser,
    deleteSuperAdminUser,
    verifyUserEmailVerification,
    getCompanyUsage
};
