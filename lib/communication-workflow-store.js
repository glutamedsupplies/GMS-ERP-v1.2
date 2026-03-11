const sqliteStore = require('./sqlite');
const salesStore = require('./sales-store');

const schemaReadyDbs = new WeakSet();
const SHIPMENT_TOKENS = new Set(['shipment', 'lbc', 'j&t', 'jt', 'spx', 'victory liner', 'ap cargo']);
const MAX_ATTACHMENT_DATA_URL_LENGTH = 2_800_000;
const STAGE_DEFAULT = 'pending_head_admin';
const HEAD_ADMIN_STATUSES = new Set(['pending', 'confirmed', 'correction', 'rejected']);
const EDITABLE_PENDING_STAGES = new Set(['pending_head_admin', 'for_correction']);

function getDb() {
    sqliteStore.ensureSystemReady?.();
    const db = sqliteStore.getTenantDb();
    ensureSchema(db);
    return db;
}

function ensureTableColumn(db, tableName, columnName, definition) {
    if (db.__isPostgresCompat) {
        return;
    }
    const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const exists = rows.some((row) => String(row.name || '').toLowerCase() === String(columnName || '').toLowerCase());
    if (!exists) {
        db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
    }
}

function ensureSchema(db) {
    if (schemaReadyDbs.has(db)) {
        return;
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS communication_workflow_entries (
            id TEXT PRIMARY KEY,
            order_number TEXT NOT NULL UNIQUE,
            receipt_number TEXT NOT NULL DEFAULT '',
            sales_order_number TEXT NOT NULL DEFAULT '',
            order_date TEXT NOT NULL DEFAULT '',
            branch TEXT NOT NULL DEFAULT '',
            cash_branch TEXT NOT NULL DEFAULT '',
            client_name TEXT NOT NULL DEFAULT '',
            contact_number TEXT NOT NULL DEFAULT '',
            delivery_address TEXT NOT NULL DEFAULT '',
            courier TEXT NOT NULL DEFAULT '',
            fulfillment_type TEXT NOT NULL DEFAULT '',
            fulfillment_option TEXT NOT NULL DEFAULT '',
            payment_method TEXT NOT NULL DEFAULT '',
            payment_type TEXT NOT NULL DEFAULT '',
            admin_name TEXT NOT NULL DEFAULT '',
            sales_representative TEXT NOT NULL DEFAULT '',
            delivery_fee REAL NOT NULL DEFAULT 0,
            handling_fee REAL NOT NULL DEFAULT 0,
            total_amount REAL NOT NULL DEFAULT 0,
            order_items_text TEXT NOT NULL DEFAULT '',
            items_json TEXT NOT NULL DEFAULT '[]',
            payment_receipt_json TEXT NOT NULL DEFAULT 'null',
            staff_receipt_json TEXT NOT NULL DEFAULT 'null',
            prep_photo_json TEXT NOT NULL DEFAULT 'null',
            correction_note TEXT NOT NULL DEFAULT '',
            staff_receipt_note TEXT NOT NULL DEFAULT '',
            prep_note TEXT NOT NULL DEFAULT '',
            stage TEXT NOT NULL DEFAULT 'pending_head_admin',
            head_admin_status TEXT NOT NULL DEFAULT 'pending',
            dispatch_panel TEXT NOT NULL DEFAULT '',
            inventory_deducted INTEGER NOT NULL DEFAULT 0,
            created_by_user_id TEXT NOT NULL DEFAULT '',
            created_by_name TEXT NOT NULL DEFAULT '',
            created_by_role TEXT NOT NULL DEFAULT '',
            confirmed_by_user_id TEXT NOT NULL DEFAULT '',
            confirmed_by_name TEXT NOT NULL DEFAULT '',
            confirmed_at TEXT NOT NULL DEFAULT '',
            staff_receipt_sent_by_user_id TEXT NOT NULL DEFAULT '',
            staff_receipt_sent_by_name TEXT NOT NULL DEFAULT '',
            staff_receipt_sent_at TEXT NOT NULL DEFAULT '',
            prep_completed_by_user_id TEXT NOT NULL DEFAULT '',
            prep_completed_by_name TEXT NOT NULL DEFAULT '',
            prep_completed_at TEXT NOT NULL DEFAULT '',
            inventory_deducted_at TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_comm_workflow_stage
            ON communication_workflow_entries (stage);
        CREATE INDEX IF NOT EXISTS idx_comm_workflow_branch
            ON communication_workflow_entries (branch);
        CREATE INDEX IF NOT EXISTS idx_comm_workflow_dispatch
            ON communication_workflow_entries (dispatch_panel);
        CREATE INDEX IF NOT EXISTS idx_comm_workflow_created_by
            ON communication_workflow_entries (created_by_user_id);
    `);

    ensureTableColumn(db, 'communication_workflow_entries', 'receipt_number', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'communication_workflow_entries', 'sales_order_number', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'communication_workflow_entries', 'payment_receipt_json', "TEXT NOT NULL DEFAULT 'null'");
    ensureTableColumn(db, 'communication_workflow_entries', 'staff_receipt_json', "TEXT NOT NULL DEFAULT 'null'");
    ensureTableColumn(db, 'communication_workflow_entries', 'prep_photo_json', "TEXT NOT NULL DEFAULT 'null'");
    ensureTableColumn(db, 'communication_workflow_entries', 'correction_note', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'communication_workflow_entries', 'staff_receipt_note', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'communication_workflow_entries', 'prep_note', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'communication_workflow_entries', 'dispatch_panel', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'communication_workflow_entries', 'inventory_deducted', 'INTEGER NOT NULL DEFAULT 0');
    ensureTableColumn(db, 'communication_workflow_entries', 'inventory_deducted_at', "TEXT NOT NULL DEFAULT ''");
    ensureTableColumn(db, 'communication_workflow_entries', 'updated_at', "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");

    schemaReadyDbs.add(db);
}

function normalizeText(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeMultilineText(value, { maxLength = 12000 } = {}) {
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

function normalizeStage(value) {
    const normalized = normalizeText(value).toLowerCase();
    if ([
        'pending_head_admin',
        'for_correction',
        'rejected',
        'staff_receipt_pending',
        'prep_pending',
        'delivery_queue',
        'shipping_queue'
    ].includes(normalized)) {
        return normalized;
    }
    return STAGE_DEFAULT;
}

function normalizeHeadAdminStatus(value) {
    const normalized = normalizeText(value).toLowerCase();
    return HEAD_ADMIN_STATUSES.has(normalized) ? normalized : 'pending';
}

function parseNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function parseBoolean(value, fallback = false) {
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

function normalizeAttachment(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const name = normalizeText(value.name);
    const type = normalizeText(value.type);
    const size = Math.max(0, parseNumber(value.size, 0));
    const dataUrl = String(value.dataUrl || '').startsWith('data:')
        ? String(value.dataUrl).slice(0, MAX_ATTACHMENT_DATA_URL_LENGTH)
        : '';
    const previewUrl = String(value.previewUrl || '').startsWith('data:')
        ? String(value.previewUrl).slice(0, MAX_ATTACHMENT_DATA_URL_LENGTH)
        : '';

    if (!name && !type && !size && !dataUrl && !previewUrl) {
        return null;
    }

    return {
        name,
        type,
        size,
        dataUrl,
        previewUrl: previewUrl || dataUrl
    };
}

function parseAttachmentJson(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === 'null') {
        return null;
    }
    try {
        return normalizeAttachment(JSON.parse(raw));
    } catch (_error) {
        return null;
    }
}

function serializeAttachment(value) {
    const normalized = normalizeAttachment(value);
    return normalized ? JSON.stringify(normalized) : 'null';
}

function normalizeItems(items) {
    return (Array.isArray(items) ? items : [])
        .map((item) => {
            const productName = normalizeText(item?.productName || item?.itemSold);
            const setName = normalizeText(item?.setName || item?.itemSet);
            const itemCode = normalizeText(item?.itemCode);
            const helper = normalizeText(item?.helper || [itemCode, setName].filter(Boolean).join(' | '));
            const quantity = Math.max(1, parseNumber(item?.quantity, 1));
            const unitPrice = Math.max(0, parseNumber(item?.unitPrice ?? item?.price, 0));
            const subtotal = Math.max(0, parseNumber(item?.subtotal, quantity * unitPrice));
            return {
                productName,
                itemSold: productName,
                setName,
                itemSet: setName,
                itemCode,
                helper,
                quantity,
                unitPrice,
                subtotal
            };
        })
        .filter((item) => item.productName && item.setName && item.itemCode);
}

function parseItemsJson(value) {
    const raw = String(value || '').trim();
    if (!raw) {
        return [];
    }
    try {
        return normalizeItems(JSON.parse(raw));
    } catch (_error) {
        return [];
    }
}

function serializeItems(items) {
    return JSON.stringify(normalizeItems(items));
}

function createId() {
    return `cwf-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function nowIso() {
    return new Date().toISOString();
}

function normalizeDispatchPanel({ fulfillmentType = '', fulfillmentOption = '', courier = '' } = {}) {
    const values = [fulfillmentType, fulfillmentOption, courier]
        .map((value) => normalizeText(value).toLowerCase())
        .filter(Boolean);
    if (values.some((value) => SHIPMENT_TOKENS.has(value))) {
        return 'shipping';
    }
    return 'delivery';
}

function getRowById(db, id) {
    return db.prepare(`
        SELECT *
        FROM communication_workflow_entries
        WHERE id = ?
        LIMIT 1
    `).get(String(id));
}

function getRowByOrderNumber(db, orderNumber) {
    return db.prepare(`
        SELECT *
        FROM communication_workflow_entries
        WHERE LOWER(order_number) = LOWER(?)
        LIMIT 1
    `).get(String(orderNumber || '').trim());
}

function serializeEntry(row) {
    if (!row) {
        return null;
    }

    const items = parseItemsJson(row.items_json);
    const dispatchPanel = normalizeDispatchPanel({
        fulfillmentType: row.fulfillment_type,
        fulfillmentOption: row.fulfillment_option,
        courier: row.courier
    });

    return {
        id: String(row.id || ''),
        orderNumber: String(row.order_number || ''),
        receiptNumber: String(row.receipt_number || ''),
        salesOrderNumber: String(row.sales_order_number || ''),
        orderDate: String(row.order_date || ''),
        branch: String(row.branch || ''),
        cashBranch: String(row.cash_branch || ''),
        clientName: String(row.client_name || ''),
        contactNumber: String(row.contact_number || ''),
        deliveryAddress: String(row.delivery_address || ''),
        courier: String(row.courier || ''),
        fulfillmentType: String(row.fulfillment_type || ''),
        fulfillmentOption: String(row.fulfillment_option || ''),
        paymentMethod: String(row.payment_method || ''),
        paymentType: String(row.payment_type || ''),
        adminName: String(row.admin_name || ''),
        salesRepresentative: String(row.sales_representative || ''),
        deliveryFee: parseNumber(row.delivery_fee, 0),
        handlingFee: parseNumber(row.handling_fee, 0),
        totalAmount: parseNumber(row.total_amount, 0),
        orderItems: String(row.order_items_text || ''),
        items,
        paymentReceipt: parseAttachmentJson(row.payment_receipt_json),
        staffReceipt: parseAttachmentJson(row.staff_receipt_json),
        prepPhoto: parseAttachmentJson(row.prep_photo_json),
        correctionNote: String(row.correction_note || ''),
        staffReceiptNote: String(row.staff_receipt_note || ''),
        prepNote: String(row.prep_note || ''),
        stage: normalizeStage(row.stage),
        headAdminStatus: normalizeHeadAdminStatus(row.head_admin_status),
        dispatchPanel: String(row.dispatch_panel || dispatchPanel || ''),
        inventoryDeducted: Boolean(Number(row.inventory_deducted || 0)),
        createdByUserId: String(row.created_by_user_id || ''),
        createdByName: String(row.created_by_name || ''),
        createdByRole: String(row.created_by_role || ''),
        confirmedByUserId: String(row.confirmed_by_user_id || ''),
        confirmedByName: String(row.confirmed_by_name || ''),
        confirmedAt: String(row.confirmed_at || ''),
        staffReceiptSentByUserId: String(row.staff_receipt_sent_by_user_id || ''),
        staffReceiptSentByName: String(row.staff_receipt_sent_by_name || ''),
        staffReceiptSentAt: String(row.staff_receipt_sent_at || ''),
        prepCompletedByUserId: String(row.prep_completed_by_user_id || ''),
        prepCompletedByName: String(row.prep_completed_by_name || ''),
        prepCompletedAt: String(row.prep_completed_at || ''),
        inventoryDeductedAt: String(row.inventory_deducted_at || ''),
        createdAt: String(row.created_at || ''),
        updatedAt: String(row.updated_at || '')
    };
}

function buildCounts(entries = []) {
    const counts = {
        total: entries.length,
        pendingHeadAdmin: 0,
        correction: 0,
        rejected: 0,
        staffReceiptPending: 0,
        prepPending: 0,
        deliveryQueue: 0,
        shippingQueue: 0
    };

    entries.forEach((entry) => {
        switch (entry.stage) {
        case 'pending_head_admin':
            counts.pendingHeadAdmin += 1;
            break;
        case 'for_correction':
            counts.correction += 1;
            break;
        case 'rejected':
            counts.rejected += 1;
            break;
        case 'staff_receipt_pending':
            counts.staffReceiptPending += 1;
            break;
        case 'prep_pending':
            counts.prepPending += 1;
            break;
        case 'delivery_queue':
            counts.deliveryQueue += 1;
            break;
        case 'shipping_queue':
            counts.shippingQueue += 1;
            break;
        default:
            break;
        }
    });

    return counts;
}

function listEntries(filters = {}, requestContext = {}) {
    const db = getDb();
    const where = [];
    const params = [];
    const role = normalizeText(requestContext.requestRole).toLowerCase();
    const requestedBranch = normalizeText(filters.branch);
    const requestBranchName = normalizeText(requestContext.requestBranchName);
    const requestUserId = normalizeText(requestContext.requestUserId);
    const search = normalizeText(filters.search);

    if (requestedBranch) {
        where.push('LOWER(branch) = LOWER(?)');
        params.push(requestedBranch);
    }

    if (search) {
        where.push(`(
            LOWER(order_number) LIKE LOWER(?)
            OR LOWER(client_name) LIKE LOWER(?)
            OR LOWER(contact_number) LIKE LOWER(?)
            OR LOWER(courier) LIKE LOWER(?)
        )`);
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (role === 'staff') {
        if (requestBranchName) {
            where.push('LOWER(branch) = LOWER(?)');
            params.push(requestBranchName);
        }
    } else if (role === 'employee') {
        if (!requestUserId) {
            return { items: [], counts: buildCounts([]) };
        }
        where.push('created_by_user_id = ?');
        params.push(requestUserId);
    }

    const sql = `
        SELECT *
        FROM communication_workflow_entries
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY
            CASE stage
                WHEN 'pending_head_admin' THEN 1
                WHEN 'for_correction' THEN 2
                WHEN 'staff_receipt_pending' THEN 3
                WHEN 'prep_pending' THEN 4
                WHEN 'delivery_queue' THEN 5
                WHEN 'shipping_queue' THEN 6
                WHEN 'rejected' THEN 7
                ELSE 8
            END,
            datetime(updated_at) DESC,
            datetime(created_at) DESC
    `;

    const items = db.prepare(sql).all(...params).map((row) => serializeEntry(row));
    return {
        items,
        counts: buildCounts(items)
    };
}

function assertCreateAccess(requestContext = {}) {
    const role = normalizeText(requestContext.requestRole).toLowerCase();
    if (role === 'employee' || role === 'staff' || role === 'head_admin' || role === 'company_admin') {
        return;
    }
    throw new Error('Forbidden.');
}

function assertHeadAdminAccess(requestContext = {}) {
    const role = normalizeText(requestContext.requestRole).toLowerCase();
    if (role === 'head_admin' || role === 'company_admin') {
        return;
    }
    throw new Error('Forbidden.');
}

function assertStaffAccess(requestContext = {}) {
    const role = normalizeText(requestContext.requestRole).toLowerCase();
    if (role === 'staff' || role === 'head_admin' || role === 'company_admin') {
        return;
    }
    throw new Error('Forbidden.');
}

function createEntry(payload = {}, requestContext = {}) {
    assertCreateAccess(requestContext);

    const db = getDb();
    const orderNumber = normalizeText(payload.orderNumber);
    const orderDate = normalizeText(payload.orderDate);
    const branch = normalizeText(payload.branch || requestContext.requestBranchName);
    const cashBranch = normalizeText(payload.cashBranch || branch);
    const clientName = normalizeText(payload.clientName);
    const contactNumber = normalizeText(payload.contactNumber);
    const deliveryAddress = normalizeMultilineText(payload.deliveryAddress, { maxLength: 4000 });
    const courier = normalizeText(payload.courier);
    const fulfillmentType = normalizeText(payload.fulfillmentType);
    const fulfillmentOption = normalizeText(payload.fulfillmentOption || courier);
    const paymentMethod = normalizeText(payload.paymentMethod);
    const paymentType = normalizeText(payload.paymentType);
    const adminName = normalizeText(payload.adminName || requestContext.requestUserName);
    const salesRepresentative = normalizeText(payload.salesRepresentative || requestContext.requestUserName);
    const deliveryFee = Math.max(0, parseNumber(payload.deliveryFee, 0));
    const handlingFee = Math.max(0, parseNumber(payload.handlingFee, 0));
    const items = normalizeItems(payload.items);
    const orderItemsText = normalizeMultilineText(payload.orderItems, { maxLength: 12000 });
    const totalAmount = Math.max(0, parseNumber(payload.totalAmount, 0));
    const paymentReceipt = normalizeAttachment(payload.paymentReceipt);

    if (!orderNumber) throw new Error('Order number is required.');
    if (!orderDate) throw new Error('Order date is required.');
    if (!branch) throw new Error('Branch is required.');
    if (!cashBranch) throw new Error('Cash branch is required.');
    if (!clientName) throw new Error('Client name is required.');
    if (!courier) throw new Error('Courier is required.');
    if (!fulfillmentType) throw new Error('Fulfillment type is required.');
    if (!fulfillmentOption) throw new Error('Fulfillment option is required.');
    if (!paymentMethod) throw new Error('Payment method is required.');
    if (!adminName) throw new Error('Admin name is required.');
    if (!salesRepresentative) throw new Error('Sales representative is required.');
    if (!items.length) throw new Error('At least one item is required.');

    if (getRowByOrderNumber(db, orderNumber)) {
        throw new Error('Order number already exists in workflow.');
    }

    const id = createId();
    const stage = STAGE_DEFAULT;
    const dispatchPanel = normalizeDispatchPanel({ fulfillmentType, fulfillmentOption, courier });
    const createdAt = nowIso();

    db.prepare(`
        INSERT INTO communication_workflow_entries (
            id, order_number, receipt_number, sales_order_number, order_date, branch, cash_branch,
            client_name, contact_number, delivery_address, courier, fulfillment_type, fulfillment_option,
            payment_method, payment_type, admin_name, sales_representative, delivery_fee, handling_fee,
            total_amount, order_items_text, items_json, payment_receipt_json, staff_receipt_json, prep_photo_json,
            correction_note, staff_receipt_note, prep_note, stage, head_admin_status, dispatch_panel,
            inventory_deducted, created_by_user_id, created_by_name, created_by_role, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        orderNumber,
        '',
        '',
        orderDate,
        branch,
        cashBranch,
        clientName,
        contactNumber,
        deliveryAddress,
        courier,
        fulfillmentType,
        fulfillmentOption,
        paymentMethod,
        paymentType,
        adminName,
        salesRepresentative,
        deliveryFee,
        handlingFee,
        totalAmount,
        orderItemsText,
        serializeItems(items),
        serializeAttachment(paymentReceipt),
        'null',
        'null',
        '',
        '',
        '',
        stage,
        'pending',
        dispatchPanel,
        0,
        normalizeText(requestContext.requestUserId),
        normalizeText(requestContext.requestUserName),
        normalizeText(requestContext.requestRole),
        createdAt,
        createdAt
    );

    sqliteStore.logAudit?.('communication_workflow.create', 'communication_workflow_entry', id, {
        order_number: orderNumber,
        branch,
        stage
    });

    return serializeEntry(getRowById(db, id));
}

function ensureExistingEditableStage(entry) {
    if (!EDITABLE_PENDING_STAGES.has(entry.stage)) {
        throw new Error('This order is no longer waiting for Head Admin action.');
    }
}

function confirmEntry(db, row, payload = {}, requestContext = {}) {
    assertHeadAdminAccess(requestContext);

    const entry = serializeEntry(row);
    ensureExistingEditableStage(entry);

    const salesPayload = payload && typeof payload.salesPayload === 'object' && !Array.isArray(payload.salesPayload)
        ? { ...payload.salesPayload }
        : null;
    if (!salesPayload) {
        throw new Error('Sales payload is required for confirmation.');
    }

    const now = nowIso();
    const hasLinkedOrder = Boolean(entry.salesOrderNumber);
    const salesResult = hasLinkedOrder
        ? salesStore.updateSaleOrder(entry.salesOrderNumber, {
            ...salesPayload,
            inventoryDeducted: false,
            orderStatus: salesPayload.orderStatus || 'Pending'
        })
        : salesStore.addSaleEntry({
            ...salesPayload,
            inventoryDeducted: false,
            orderStatus: salesPayload.orderStatus || 'Pending'
        });

    if (!hasLinkedOrder) {
        sqliteStore.recordInvoiceCreated?.();
    }

    db.prepare(`
        UPDATE communication_workflow_entries
        SET
            receipt_number = ?,
            sales_order_number = ?,
            payment_type = ?,
            payment_method = ?,
            total_amount = ?,
            stage = 'staff_receipt_pending',
            head_admin_status = 'confirmed',
            confirmed_by_user_id = ?,
            confirmed_by_name = ?,
            confirmed_at = ?,
            updated_at = ?
        WHERE id = ?
    `).run(
        normalizeText(salesResult?.receiptNumber || entry.receiptNumber || entry.orderNumber),
        normalizeText(salesResult?.orderNumber || entry.salesOrderNumber || entry.orderNumber),
        normalizeText(salesPayload.paymentType || entry.paymentType),
        normalizeText(salesPayload.paymentMethod || entry.paymentMethod),
        Math.max(0, parseNumber(salesResult?.orderTotal, entry.totalAmount)),
        normalizeText(requestContext.requestUserId),
        normalizeText(requestContext.requestUserName),
        now,
        now,
        row.id
    );

    sqliteStore.logAudit?.('communication_workflow.confirm', 'communication_workflow_entry', row.id, {
        order_number: entry.orderNumber,
        sales_order_number: salesResult?.orderNumber || entry.salesOrderNumber || ''
    });

    return serializeEntry(getRowById(db, row.id));
}

function rejectEntry(db, row, payload = {}, requestContext = {}) {
    assertHeadAdminAccess(requestContext);
    const entry = serializeEntry(row);
    ensureExistingEditableStage(entry);
    const note = normalizeMultilineText(payload.note || payload.reason, { maxLength: 4000 });
    const now = nowIso();

    db.prepare(`
        UPDATE communication_workflow_entries
        SET
            stage = 'rejected',
            head_admin_status = 'rejected',
            correction_note = ?,
            updated_at = ?
        WHERE id = ?
    `).run(note, now, row.id);

    sqliteStore.logAudit?.('communication_workflow.reject', 'communication_workflow_entry', row.id, {
        order_number: entry.orderNumber
    });

    return serializeEntry(getRowById(db, row.id));
}

function requestCorrection(db, row, payload = {}, requestContext = {}) {
    assertHeadAdminAccess(requestContext);
    const entry = serializeEntry(row);
    ensureExistingEditableStage(entry);
    const note = normalizeMultilineText(payload.note || payload.reason, { maxLength: 4000 });
    const now = nowIso();

    db.prepare(`
        UPDATE communication_workflow_entries
        SET
            stage = 'for_correction',
            head_admin_status = 'correction',
            correction_note = ?,
            updated_at = ?
        WHERE id = ?
    `).run(note, now, row.id);

    sqliteStore.logAudit?.('communication_workflow.request_correction', 'communication_workflow_entry', row.id, {
        order_number: entry.orderNumber
    });

    return serializeEntry(getRowById(db, row.id));
}

function saveStaffReceipt(db, row, payload = {}, requestContext = {}) {
    assertStaffAccess(requestContext);
    const entry = serializeEntry(row);
    if (entry.stage !== 'staff_receipt_pending') {
        throw new Error('This order is not waiting for the staff receipt yet.');
    }

    const attachment = normalizeAttachment(payload.staffReceipt || payload.attachment);
    if (!attachment) {
        throw new Error('Staff receipt attachment is required.');
    }

    const note = normalizeMultilineText(payload.note, { maxLength: 4000 });
    const now = nowIso();

    db.prepare(`
        UPDATE communication_workflow_entries
        SET
            staff_receipt_json = ?,
            staff_receipt_note = ?,
            stage = 'prep_pending',
            staff_receipt_sent_by_user_id = ?,
            staff_receipt_sent_by_name = ?,
            staff_receipt_sent_at = ?,
            updated_at = ?
        WHERE id = ?
    `).run(
        serializeAttachment(attachment),
        note,
        normalizeText(requestContext.requestUserId),
        normalizeText(requestContext.requestUserName),
        now,
        now,
        row.id
    );

    sqliteStore.logAudit?.('communication_workflow.staff_receipt', 'communication_workflow_entry', row.id, {
        order_number: entry.orderNumber
    });

    return serializeEntry(getRowById(db, row.id));
}

function completePrep(db, row, payload = {}, requestContext = {}) {
    assertStaffAccess(requestContext);
    const entry = serializeEntry(row);
    if (entry.stage !== 'prep_pending') {
        throw new Error('This order is not waiting for prep yet.');
    }
    if (!entry.salesOrderNumber) {
        throw new Error('Linked sales order is missing. Confirm the order again before prep.');
    }
    if (!entry.staffReceipt) {
        throw new Error('Staff receipt is required before preparing this order.');
    }

    const prepPhoto = normalizeAttachment(payload.prepPhoto || payload.attachment);

    const note = normalizeMultilineText(payload.note, { maxLength: 4000 });
    const dispatchPanel = normalizeDispatchPanel(entry);
    const nextStage = dispatchPanel === 'shipping' ? 'shipping_queue' : 'delivery_queue';
    const now = nowIso();
    let salesResult = null;

    if (!entry.inventoryDeducted) {
        salesResult = salesStore.updateSaleOrder(entry.salesOrderNumber, {
            inventoryDeducted: true,
            orderStatus: 'Packed'
        });
    }

    db.prepare(`
        UPDATE communication_workflow_entries
        SET
            receipt_number = ?,
            sales_order_number = ?,
            prep_photo_json = ?,
            prep_note = ?,
            stage = ?,
            dispatch_panel = ?,
            inventory_deducted = 1,
            prep_completed_by_user_id = ?,
            prep_completed_by_name = ?,
            prep_completed_at = ?,
            inventory_deducted_at = COALESCE(NULLIF(inventory_deducted_at, ''), ?),
            updated_at = ?
        WHERE id = ?
    `).run(
        normalizeText(salesResult?.receiptNumber || entry.receiptNumber || entry.orderNumber),
        normalizeText(salesResult?.orderNumber || entry.salesOrderNumber || entry.orderNumber),
        serializeAttachment(prepPhoto || entry.prepPhoto),
        note,
        nextStage,
        dispatchPanel,
        normalizeText(requestContext.requestUserId),
        normalizeText(requestContext.requestUserName),
        now,
        now,
        now,
        row.id
    );

    sqliteStore.logAudit?.('communication_workflow.prep_complete', 'communication_workflow_entry', row.id, {
        order_number: entry.orderNumber,
        dispatch_panel: dispatchPanel
    });

    return serializeEntry(getRowById(db, row.id));
}

function updateEntry(id, payload = {}, requestContext = {}) {
    const db = getDb();
    const row = getRowById(db, id);
    if (!row) {
        throw new Error('Workflow entry not found.');
    }

    const action = normalizeText(payload.action).toLowerCase();
    if (!action) {
        throw new Error('Workflow action is required.');
    }

    if (action === 'confirm') {
        return confirmEntry(db, row, payload, requestContext);
    }
    if (action === 'reject') {
        return rejectEntry(db, row, payload, requestContext);
    }
    if (action === 'request_correction') {
        return requestCorrection(db, row, payload, requestContext);
    }
    if (action === 'staff_receipt') {
        return saveStaffReceipt(db, row, payload, requestContext);
    }
    if (action === 'prep_complete') {
        return completePrep(db, row, payload, requestContext);
    }

    throw new Error('Unsupported workflow action.');
}

module.exports = {
    createEntry,
    listEntries,
    updateEntry
};
