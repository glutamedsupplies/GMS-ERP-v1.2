const fs = require('fs');
const os = require('os');
const path = require('path');

const sqliteStore = require('./sqlite');

const ROOT_DIR = path.resolve(__dirname, '..');
const INVENTORY_FILE_NAME = 'February 2026 - INVENTORY.csv';
const SET_OPTIONS = ['M', 'P', 'P W C', 'T', 'D B 100', 'D B 50', 'D C 100', 'D C 50', 'D B', 'D C'];
const INVENTORY_CSV_PATHS = [
    process.env.ATTENDANCE_INVENTORY_CSV || '',
    path.join(ROOT_DIR, 'head_admin', 'data', INVENTORY_FILE_NAME),
    path.join(ROOT_DIR, INVENTORY_FILE_NAME),
    path.join(os.homedir(), 'Downloads', INVENTORY_FILE_NAME)
].filter(Boolean);

let schemaReady = false;
let seedSyncComplete = false;

function normalizeText(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeHeaderToken(value) {
    return normalizeText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function normalizeSetName(value) {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue) {
        return '';
    }

    const matchedOption = SET_OPTIONS.find((option) => option.toLowerCase() === normalizedValue.toLowerCase());
    return matchedOption || normalizedValue;
}

function parseNumber(value) {
    const cleanedValue = String(value || '').replace(/[^0-9.-]/g, '');
    if (!cleanedValue || cleanedValue === '-' || cleanedValue === '.' || cleanedValue === '-.') {
        return 0;
    }

    const parsedValue = Number(cleanedValue);
    return Number.isFinite(parsedValue) ? parsedValue : 0;
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

function buildHelper(itemCode, setName) {
    return [normalizeText(itemCode), normalizeSetName(setName)].filter(Boolean).join(' | ');
}

function getSeedPath() {
    return INVENTORY_CSV_PATHS.find((candidate) => candidate && fs.existsSync(candidate)) || '';
}

function isAutoSeedEnabled() {
    const rawValue = String(process.env.ATTENDANCE_AUTO_SEED || '').trim().toLowerCase();
    return rawValue === '1' || rawValue === 'true' || rawValue === 'yes';
}

function getDb({ skipSeedSync = false } = {}) {
    sqliteStore.ensureSystemReady?.();
    const db = sqliteStore.getTenantDb();
    if (db.__isPostgresCompat) {
        schemaReady = true;
    } else {
        ensureSchema(db);
    }

    if (!skipSeedSync) {
        ensureSeedData();
    }

    return db;
}

function ensureSchema(db) {
    if (schemaReady) {
        return;
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS inventory_variants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_name TEXT NOT NULL,
            item_code TEXT NOT NULL,
            set_name TEXT NOT NULL,
            price REAL NOT NULL,
            source TEXT NOT NULL DEFAULT 'manual',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(product_name, set_name)
        );

        CREATE INDEX IF NOT EXISTS idx_inventory_variants_product_name
        ON inventory_variants (product_name);

        CREATE INDEX IF NOT EXISTS idx_inventory_variants_set_name
        ON inventory_variants (set_name);

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

        CREATE INDEX IF NOT EXISTS idx_product_catalog_name
        ON product_catalog (product_name);

        CREATE INDEX IF NOT EXISTS idx_product_catalog_code_set
        ON product_catalog (item_code, item_set);
    `);

    schemaReady = true;
}

function ensureSeedData() {
    if (seedSyncComplete) {
        return;
    }

    if (!isAutoSeedEnabled()) {
        seedSyncComplete = true;
        return;
    }

    importInventoryVariantsFromCsv({ suppressMissingFile: true });
    seedSyncComplete = true;
}

function findHeaderRow(rows) {
    const aliases = {
        product_name: new Set(['productname', 'product', 'product_name']),
        item_code: new Set(['itemcode', 'item_code', 'itemcodeno', 'code']),
        set_name: new Set(['set', 'setname', 'set_name']),
        price: new Set(['price', 'srp', 'amount'])
    };

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const tokens = rows[rowIndex].map(normalizeHeaderToken);
        const productIndex = tokens.findIndex((token) => aliases.product_name.has(token));
        const itemCodeIndex = tokens.findIndex((token) => aliases.item_code.has(token));
        const setIndex = tokens.findIndex((token) => aliases.set_name.has(token));
        const priceIndex = tokens.findIndex((token) => aliases.price.has(token));

        if (productIndex !== -1 && itemCodeIndex !== -1 && setIndex !== -1 && priceIndex !== -1) {
            return {
                rowIndex,
                indexes: {
                    product_name: productIndex,
                    item_code: itemCodeIndex,
                    set_name: setIndex,
                    price: priceIndex
                }
            };
        }
    }

    throw new Error('Inventory CSV header row was not found.');
}

function readInventoryVariantsFromCsv(filePath) {
    const csvContent = fs.readFileSync(filePath, 'utf8');
    const rows = parseCsvRows(csvContent);
    const headerRow = findHeaderRow(rows);
    let currentProductName = '';
    const dedupedRows = new Map();

    rows.slice(headerRow.rowIndex + 1).forEach((columns) => {
        const rawProductName = normalizeText(columns[headerRow.indexes.product_name]);
        if (rawProductName) {
            currentProductName = rawProductName;
        }

        const productName = currentProductName;
        const itemCode = normalizeText(columns[headerRow.indexes.item_code]);
        const setName = normalizeSetName(columns[headerRow.indexes.set_name]);
        const price = parseNumber(columns[headerRow.indexes.price]);

        if (!productName || !itemCode || !setName) {
            return;
        }

        const key = `${productName.toLowerCase()}||${setName.toLowerCase()}`;
        dedupedRows.set(key, {
            productName,
            itemCode,
            setName,
            price
        });
    });

    return Array.from(dedupedRows.values());
}

function findVariantById(db, id) {
    return db.prepare(`
        SELECT id, product_name, item_code, set_name, price, source, created_at, updated_at
        FROM inventory_variants
        WHERE id = ?
        LIMIT 1
    `).get(Number(id));
}

function findVariantByProductAndSet(db, productName, setName) {
    return db.prepare(`
        SELECT id, product_name, item_code, set_name, price, source, created_at, updated_at
        FROM inventory_variants
        WHERE LOWER(product_name) = LOWER(?)
          AND LOWER(set_name) = LOWER(?)
        LIMIT 1
    `).get(normalizeText(productName), normalizeSetName(setName));
}

function normalizeVariantPayload(payload = {}) {
    const productName = normalizeText(payload.product_name || payload.productName);
    const itemCode = normalizeText(payload.item_code || payload.itemCode);
    const setName = normalizeSetName(payload.set_name || payload.setName || payload.item_set || payload.itemSet);
    const price = parseNumber(payload.price);

    if (!productName) {
        throw new Error('Product name is required.');
    }

    if (!itemCode) {
        throw new Error('Item code is required.');
    }

    if (!setName) {
        throw new Error('Set is required.');
    }

    if (!Number.isFinite(price) || price < 0) {
        throw new Error('Price must be a valid positive number.');
    }

    return {
        productName,
        itemCode,
        setName,
        price
    };
}

function syncLegacyProductCatalogRow(db, entry, source = 'manual') {
    const productName = normalizeText(entry.productName || entry.product_name);
    const itemCode = normalizeText(entry.itemCode || entry.item_code);
    const setName = normalizeSetName(entry.setName || entry.set_name || entry.item_set);
    const price = parseNumber(entry.price);
    const helper = buildHelper(itemCode, setName);

    db.prepare(`
        DELETE FROM product_catalog
        WHERE helper = ?
          AND NOT (
              LOWER(product_name) = LOWER(?)
              AND LOWER(item_set) = LOWER(?)
          )
    `).run(helper, productName, setName);

    const existingRows = db.prepare(`
        SELECT id
        FROM product_catalog
        WHERE LOWER(product_name) = LOWER(?)
          AND LOWER(item_set) = LOWER(?)
        ORDER BY id ASC
    `).all(productName, setName);

    if (existingRows.length) {
        const primaryRowId = existingRows[0].id;
        db.prepare(`
            UPDATE product_catalog
            SET product_name = ?,
                item_code = ?,
                item_set = ?,
                helper = ?,
                price = ?,
                source = ?
            WHERE id = ?
        `).run(productName, itemCode, setName, helper, price, source, primaryRowId);

        db.prepare(`
            DELETE FROM product_catalog
            WHERE LOWER(product_name) = LOWER(?)
              AND LOWER(item_set) = LOWER(?)
              AND id != ?
        `).run(productName, setName, primaryRowId);

        return;
    }

    db.prepare(`
        INSERT INTO product_catalog (product_name, item_code, item_set, helper, price, source)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(productName, itemCode, setName, helper, price, source);
}

function removeLegacyProductCatalogRow(db, productName, setName) {
    db.prepare(`
        DELETE FROM product_catalog
        WHERE LOWER(product_name) = LOWER(?)
          AND LOWER(item_set) = LOWER(?)
    `).run(normalizeText(productName), normalizeSetName(setName));
}

function importInventoryVariantsFromCsv({ filePath = '', suppressMissingFile = false } = {}) {
    const db = getDb({ skipSeedSync: true });
    const resolvedPath = filePath || getSeedPath();

    if (!resolvedPath) {
        if (suppressMissingFile) {
            return {
                filePath: '',
                totalRows: 0,
                inserted: 0,
                updated: 0,
                unchanged: 0
            };
        }

        throw new Error('Inventory CSV file was not found.');
    }

    const csvRows = readInventoryVariantsFromCsv(resolvedPath);
    const existingRows = db.prepare(`
        SELECT id, product_name, item_code, set_name, price
        FROM inventory_variants
    `).all();
    const existingByKey = new Map(
        existingRows.map((row) => [`${row.product_name.toLowerCase()}||${row.set_name.toLowerCase()}`, row])
    );

    const insertVariant = db.prepare(`
        INSERT INTO inventory_variants (product_name, item_code, set_name, price, source)
        VALUES (?, ?, ?, ?, 'seed')
    `);
    const updateVariant = db.prepare(`
        UPDATE inventory_variants
        SET item_code = ?,
            price = ?,
            source = 'seed',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `);

    const stats = {
        filePath: resolvedPath,
        totalRows: csvRows.length,
        inserted: 0,
        updated: 0,
        unchanged: 0
    };

    db.transaction((entries) => {
        entries.forEach((entry) => {
            const key = `${entry.productName.toLowerCase()}||${entry.setName.toLowerCase()}`;
            const existingRow = existingByKey.get(key);

            if (!existingRow) {
                insertVariant.run(entry.productName, entry.itemCode, entry.setName, entry.price);
                stats.inserted += 1;
            } else if (normalizeText(existingRow.item_code) !== entry.itemCode || Number(existingRow.price) !== Number(entry.price)) {
                updateVariant.run(entry.itemCode, entry.price, existingRow.id);
                stats.updated += 1;
            } else {
                stats.unchanged += 1;
            }

            syncLegacyProductCatalogRow(db, entry, 'seed');
        });
    })(csvRows);

    seedSyncComplete = true;
    return stats;
}

function listInventoryVariants({ productName = '', setName = '', search = '' } = {}) {
    const db = getDb();
    const clauses = [];
    const params = [];

    if (normalizeText(productName)) {
        clauses.push('LOWER(product_name) LIKE LOWER(?)');
        params.push(`%${normalizeText(productName)}%`);
    }

    if (normalizeText(setName)) {
        clauses.push('LOWER(set_name) LIKE LOWER(?)');
        params.push(`%${normalizeText(setName)}%`);
    }

    if (normalizeText(search)) {
        clauses.push(`
            (
                LOWER(product_name) LIKE LOWER(?)
                OR item_code LIKE ?
                OR LOWER(set_name) LIKE LOWER(?)
            )
        `);
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    return db.prepare(`
        SELECT id, product_name, item_code, set_name, price, source, created_at, updated_at
        FROM inventory_variants
        ${whereClause}
        ORDER BY product_name COLLATE NOCASE, set_name COLLATE NOCASE, item_code COLLATE NOCASE
    `).all(...params);
}

function createInventoryVariant(payload) {
    const db = getDb();
    const variant = normalizeVariantPayload(payload);
    const existingRow = findVariantByProductAndSet(db, variant.productName, variant.setName);
    if (existingRow) {
        throw new Error(`A variant for ${variant.productName} (${variant.setName}) already exists.`);
    }

    const result = db.transaction(() => {
        const insertResult = db.prepare(`
            INSERT INTO inventory_variants (product_name, item_code, set_name, price, source)
            VALUES (?, ?, ?, ?, 'manual')
        `).run(variant.productName, variant.itemCode, variant.setName, variant.price);

        syncLegacyProductCatalogRow(db, variant, 'manual');
        return insertResult.lastInsertRowid;
    })();

    return findVariantById(db, result);
}

function updateInventoryVariant(id, payload) {
    const db = getDb();
    const existingRow = findVariantById(db, id);
    if (!existingRow) {
        throw new Error('Inventory variant not found.');
    }

    const variant = normalizeVariantPayload(payload);
    const duplicateRow = findVariantByProductAndSet(db, variant.productName, variant.setName);
    if (duplicateRow && Number(duplicateRow.id) !== Number(id)) {
        throw new Error(`A variant for ${variant.productName} (${variant.setName}) already exists.`);
    }

    db.transaction(() => {
        db.prepare(`
            UPDATE inventory_variants
            SET product_name = ?,
                item_code = ?,
                set_name = ?,
                price = ?,
                source = 'manual',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(variant.productName, variant.itemCode, variant.setName, variant.price, Number(id));

        if (
            existingRow.product_name.toLowerCase() !== variant.productName.toLowerCase()
            || existingRow.set_name.toLowerCase() !== variant.setName.toLowerCase()
        ) {
            removeLegacyProductCatalogRow(db, existingRow.product_name, existingRow.set_name);
        }

        syncLegacyProductCatalogRow(db, variant, 'manual');
    })();

    return findVariantById(db, id);
}

function deleteInventoryVariant(id) {
    const db = getDb();
    const existingRow = findVariantById(db, id);
    if (!existingRow) {
        throw new Error('Inventory variant not found.');
    }

    db.transaction(() => {
        db.prepare('DELETE FROM inventory_variants WHERE id = ?').run(Number(id));
        removeLegacyProductCatalogRow(db, existingRow.product_name, existingRow.set_name);
    })();

    return {
        deleted: true,
        id: Number(id)
    };
}

function listInventoryProductNames() {
    const db = getDb();

    return db.prepare(`
        SELECT DISTINCT product_name
        FROM inventory_variants
        ORDER BY product_name COLLATE NOCASE
    `).all().map((row) => row.product_name);
}

function listInventorySetsByProduct(productName) {
    const normalizedProductName = normalizeText(productName);
    if (!normalizedProductName) {
        return [];
    }

    const db = getDb();
    return db.prepare(`
        SELECT DISTINCT set_name
        FROM inventory_variants
        WHERE LOWER(product_name) = LOWER(?)
        ORDER BY set_name COLLATE NOCASE
    `).all(normalizedProductName).map((row) => row.set_name);
}

function resolveInventoryVariant({ productName = '', setName = '' } = {}) {
    const db = getDb();
    const row = findVariantByProductAndSet(db, productName, setName);

    if (!row) {
        return null;
    }

    return {
        ...row,
        helper: buildHelper(row.item_code, row.set_name)
    };
}

module.exports = {
    createInventoryVariant,
    deleteInventoryVariant,
    importInventoryVariantsFromCsv,
    listInventoryProductNames,
    listInventorySetsByProduct,
    listInventoryVariants,
    resolveInventoryVariant,
    updateInventoryVariant
};
