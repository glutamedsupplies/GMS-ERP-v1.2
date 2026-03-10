const { parentPort } = require('worker_threads');
const { Client, types } = require('pg');
const { buildMissingDatabaseUrlMessage, getDatabaseConnectionString } = require('./database-config');

types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(21, (value) => Number(value));
types.setTypeParser(23, (value) => Number(value));
types.setTypeParser(700, (value) => Number(value));
types.setTypeParser(701, (value) => Number(value));
types.setTypeParser(1700, (value) => Number(value));

const RESPONSE_STATUS = Object.freeze({
    success: 1,
    error: 2
});
const HEADER_SIZE = 8;
const dbEntries = new Map();
const columnCache = new Map();

function serializeError(error) {
    return {
        name: String(error?.name || 'Error'),
        message: String(error?.message || error || 'Unknown worker error'),
        stack: String(error?.stack || ''),
        code: typeof error?.code === 'string' ? error.code : '',
        details: error?.details ?? null
    };
}

function writeResponse(sab, status, payload) {
    const header = new Int32Array(sab, 0, 2);
    const body = new Uint8Array(sab, HEADER_SIZE);
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8');

    if (encoded.length > body.length) {
        const compactPayload = {
            error: {
                code: 'BUFFER_TOO_SMALL',
                message: 'Worker response exceeded the shared buffer size.',
                requiredSize: encoded.length + HEADER_SIZE
            }
        };
        const compactEncoded = Buffer.from(JSON.stringify(compactPayload), 'utf8');
        body.fill(0);
        body.set(compactEncoded.subarray(0, body.length));
        Atomics.store(header, 1, Math.min(compactEncoded.length, body.length));
        Atomics.store(header, 0, RESPONSE_STATUS.error);
        Atomics.notify(header, 0, 1);
        return;
    }

    body.fill(0);
    body.set(encoded);
    Atomics.store(header, 1, encoded.length);
    Atomics.store(header, 0, status);
    Atomics.notify(header, 0, 1);
}

function quoteIdentifier(value) {
    return `"${String(value || '').replace(/"/g, '""')}"`;
}

function normalizeSslSetting(connectionString) {
    const rawMode = String(process.env.DATABASE_SSL_MODE || 'auto').trim().toLowerCase();
    if (rawMode === 'disable' || rawMode === 'off' || rawMode === 'false' || rawMode === '0') {
        return false;
    }

    if (rawMode === 'require' || rawMode === 'on' || rawMode === 'true' || rawMode === '1') {
        return { rejectUnauthorized: false };
    }

    const parsed = new URL(connectionString);
    const hostname = String(parsed.hostname || '').trim().toLowerCase();
    if (
        hostname === 'localhost'
        || hostname === '127.0.0.1'
        || hostname === '::1'
        || hostname.endsWith('.local')
    ) {
        return false;
    }

    return { rejectUnauthorized: false };
}

function getClientConfig() {
    const connectionString = getDatabaseConnectionString();
    if (!connectionString) {
        const error = new Error(buildMissingDatabaseUrlMessage('runtime'));
        error.code = 'DATABASE_URL_REQUIRED';
        throw error;
    }

    return {
        connectionString,
        ssl: normalizeSslSetting(connectionString)
    };
}

async function ensureDbEntry(dbKey, schema = 'public') {
    const normalizedKey = String(dbKey || '').trim();
    const normalizedSchema = String(schema || 'public').trim() || 'public';
    if (!normalizedKey) {
        throw new Error('Database key is required.');
    }

    let entry = dbEntries.get(normalizedKey);
    if (entry) {
        return entry;
    }

    const client = new Client(getClientConfig());
    await client.connect();
    if (normalizedSchema !== 'public') {
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(normalizedSchema)}`);
    }
    await client.query(`SET search_path TO ${quoteIdentifier(normalizedSchema)}, public`);

    entry = {
        client,
        schema: normalizedSchema,
        txDepth: 0
    };
    dbEntries.set(normalizedKey, entry);
    return entry;
}

async function tableColumns(entry, tableName) {
    const normalizedTable = String(tableName || '').trim().replace(/^["']|["']$/g, '');
    if (!normalizedTable) {
        return [];
    }

    const cacheKey = `${entry.schema}:${normalizedTable}`;
    if (columnCache.has(cacheKey)) {
        return columnCache.get(cacheKey);
    }

    const result = await entry.client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
        ORDER BY ordinal_position
    `, [normalizedTable]);
    const columns = result.rows.map((row) => String(row.column_name || ''));
    columnCache.set(cacheKey, columns);
    return columns;
}

function maybeTranslateAttendanceCreate(sql) {
    return sql.replace(
        /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+attendance\s*\(\s*id\s+TEXT\s*,/i,
        "CREATE TABLE IF NOT EXISTS attendance (\n            row_id BIGSERIAL PRIMARY KEY,\n            id TEXT,"
    );
}

function maybeTranslateExpressionIndex(sql) {
    return sql.replace(
        /ON\s+users\s*\(\s*COALESCE\s*\(\s*company_id\s*,\s*''\s*\)\s*,\s*username\s*\)/i,
        "ON users ((COALESCE(company_id, '')), username)"
    );
}

function replacePlaceholders(sql, params) {
    let parameterIndex = 0;
    let inString = false;
    let previousCharacter = '';
    let result = '';
    const orderedParams = [];
    const namedParams = params && !Array.isArray(params) && typeof params === 'object'
        ? params
        : null;
    const positionalParams = Array.isArray(params) ? params : [];
    let positionalIndex = 0;

    for (let index = 0; index < sql.length; index += 1) {
        const character = sql[index];
        if (character === "'" && previousCharacter !== '\\') {
            inString = !inString;
            result += character;
            previousCharacter = character;
            continue;
        }

        if (!inString && character === '?') {
            parameterIndex += 1;
            result += `$${parameterIndex}`;
            orderedParams.push(positionalParams[positionalIndex]);
            positionalIndex += 1;
            previousCharacter = character;
            continue;
        }

        if (!inString && namedParams && character === '@') {
            const nameMatch = sql.slice(index + 1).match(/^[A-Za-z_][A-Za-z0-9_]*/);
            if (nameMatch) {
                parameterIndex += 1;
                result += `$${parameterIndex}`;
                orderedParams.push(namedParams[nameMatch[0]]);
                index += nameMatch[0].length;
                previousCharacter = character;
                continue;
            }
        }

        if (!inString && character === ':' && namedParams) {
            const nameMatch = sql.slice(index + 1).match(/^[A-Za-z_][A-Za-z0-9_]*/);
            if (nameMatch) {
                parameterIndex += 1;
                result += `$${parameterIndex}`;
                orderedParams.push(namedParams[nameMatch[0]]);
                index += nameMatch[0].length;
                previousCharacter = character;
                continue;
            }
        }

        if (!inString && character === '$' && namedParams) {
            const nameMatch = sql.slice(index + 1).match(/^[A-Za-z_][A-Za-z0-9_]*/);
            if (nameMatch) {
                parameterIndex += 1;
                result += `$${parameterIndex}`;
                orderedParams.push(namedParams[nameMatch[0]]);
                index += nameMatch[0].length;
                previousCharacter = character;
                continue;
            }
        }

        if (!inString && character === '?' && namedParams) {
            parameterIndex += 1;
            result += `$${parameterIndex}`;
            orderedParams.push(undefined);
            previousCharacter = character;
            continue;
        }

        result += character;
        previousCharacter = character;
    }

    return {
        sql: result,
        params: namedParams ? orderedParams : (Array.isArray(params) ? orderedParams : params)
    };
}

function detectPragmaTableInfo(sql) {
    const match = String(sql || '').trim().match(/^PRAGMA\s+table_info\s*\(\s*("?)([A-Za-z0-9_]+)\1\s*\)\s*;?$/i);
    if (!match) {
        return null;
    }

    return match[2];
}

function detectSqliteMasterLookup(sql) {
    if (!/FROM\s+sqlite_master/i.test(sql)) {
        return false;
    }

    return /WHERE\s+type\s*=\s*['"]table['"]/i.test(sql);
}

function extractInsertTarget(sql) {
    const match = String(sql || '').match(/^\s*INSERT\s+INTO\s+("?)([A-Za-z0-9_]+)\1/i);
    return match ? match[2] : '';
}

function translateSql(sql, mode = 'all', params = []) {
    const rawSql = String(sql || '').trim();
    const pragmaTable = detectPragmaTableInfo(rawSql);
    if (pragmaTable) {
        return {
            kind: 'pragma_table_info',
            tableName: pragmaTable
        };
    }

    if (detectSqliteMasterLookup(rawSql)) {
        return {
            kind: 'sqlite_master_lookup'
        };
    }

    const insertOrIgnore = /^\s*INSERT\s+OR\s+IGNORE\s+INTO/i.test(rawSql);
    let translated = rawSql
        .replace(/\browid\b/gi, 'row_id')
        .replace(/\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, 'BIGSERIAL PRIMARY KEY')
        .replace(/\bAUTOINCREMENT\b/gi, '')
        .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO')
        .replace(/\s+COLLATE\s+NOCASE\b/gi, '')
        .replace(/\bdatetime\s*\(([^)]+)\)/gi, '$1')
        .replace(/TEXT\s+NOT\s+NULL\s+DEFAULT\s+CURRENT_TIMESTAMP/gi, "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text");

    translated = maybeTranslateAttendanceCreate(translated);
    translated = maybeTranslateExpressionIndex(translated);
    translated = translated.replace(/;\s*$/, '');
    const placeholderResult = replacePlaceholders(translated, params);
    translated = placeholderResult.sql;

    const insertTarget = extractInsertTarget(translated);
    return {
        kind: 'sql',
        sql: translated,
        insertOrIgnore,
        isInsert: /^\s*INSERT\b/i.test(translated),
        isSchemaMutation: /^\s*(CREATE|ALTER|DROP)\b/i.test(translated),
        insertTarget,
        mode,
        params: placeholderResult.params
    };
}

async function queryPragmaTableInfo(entry, tableName) {
    const result = await entry.client.query(`
        SELECT
            c.ordinal_position - 1 AS cid,
            c.column_name AS name,
            c.data_type AS type,
            CASE WHEN c.is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
            c.column_default AS dflt_value,
            CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN 1 ELSE 0 END AS pk
        FROM information_schema.columns c
        LEFT JOIN information_schema.key_column_usage kcu
            ON c.table_schema = kcu.table_schema
           AND c.table_name = kcu.table_name
           AND c.column_name = kcu.column_name
        LEFT JOIN information_schema.table_constraints tc
            ON kcu.constraint_name = tc.constraint_name
           AND kcu.table_schema = tc.table_schema
           AND tc.constraint_type = 'PRIMARY KEY'
        WHERE c.table_schema = current_schema()
          AND c.table_name = $1
        ORDER BY c.ordinal_position
    `, [tableName]);

    return result.rows.map((row) => ({
        cid: Number(row.cid || 0),
        name: String(row.name || ''),
        type: String(row.type || ''),
        notnull: Number(row.notnull || 0),
        dflt_value: row.dflt_value == null ? null : String(row.dflt_value),
        pk: Number(row.pk || 0)
    }));
}

async function querySqliteMaster(entry, params = []) {
    const tableName = String(params[0] || '').trim();
    const rows = await queryPragmaTableInfo(entry, tableName);
    return rows.length ? [{ name: tableName }] : [];
}

async function maybeAppendReturningId(entry, translated) {
    if (!translated.isInsert || translated.mode !== 'run' || /\bRETURNING\b/i.test(translated.sql)) {
        return translated.sql;
    }

    const columns = await tableColumns(entry, translated.insertTarget);
    const identityColumn = columns.includes('id')
        ? 'id'
        : (columns.includes('row_id') ? 'row_id' : '');

    if (!identityColumn) {
        return translated.sql;
    }

    return `${translated.sql} RETURNING ${quoteIdentifier(identityColumn)} AS inserted_id`;
}

async function executeSql(entry, translated, params = []) {
    try {
        if (translated.kind === 'pragma_table_info') {
            const rows = await queryPragmaTableInfo(entry, translated.tableName);
            return {
                rowCount: rows.length,
                rows
            };
        }

        if (translated.kind === 'sqlite_master_lookup') {
            const rows = await querySqliteMaster(entry, params);
            return {
                rowCount: rows.length,
                rows
            };
        }

        let sql = translated.sql;
        if (translated.insertOrIgnore && !/\bON\s+CONFLICT\b/i.test(sql)) {
            sql = `${sql} ON CONFLICT DO NOTHING`;
        }

        sql = await maybeAppendReturningId(entry, translated);
        return entry.client.query(sql, Array.isArray(translated.params) ? translated.params : params);
    } catch (error) {
        error.details = {
            ...(error.details && typeof error.details === 'object' ? error.details : {}),
            schema: entry.schema,
            sql: translated.kind === 'sql' ? translated.sql : translated.kind,
            params
        };
        throw error;
    }
}

async function beginTransaction(payload) {
    const entry = await ensureDbEntry(payload.dbKey, payload.schema);
    const nextDepth = entry.txDepth + 1;
    if (entry.txDepth === 0) {
        await entry.client.query('BEGIN');
    } else {
        await entry.client.query(`SAVEPOINT ${quoteIdentifier(`sp_${nextDepth}`)}`);
    }
    entry.txDepth = nextDepth;
    return { depth: entry.txDepth };
}

async function commitTransaction(payload) {
    const entry = await ensureDbEntry(payload.dbKey, payload.schema);
    if (entry.txDepth < 1) {
        throw new Error('No active transaction to commit.');
    }

    if (entry.txDepth === 1) {
        await entry.client.query('COMMIT');
    } else {
        await entry.client.query(`RELEASE SAVEPOINT ${quoteIdentifier(`sp_${entry.txDepth}`)}`);
    }
    entry.txDepth -= 1;
    return { depth: entry.txDepth };
}

async function rollbackTransaction(payload) {
    const entry = await ensureDbEntry(payload.dbKey, payload.schema);
    if (entry.txDepth < 1) {
        throw new Error('No active transaction to roll back.');
    }

    if (entry.txDepth === 1) {
        await entry.client.query('ROLLBACK');
    } else {
        const savepoint = quoteIdentifier(`sp_${entry.txDepth}`);
        await entry.client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await entry.client.query(`RELEASE SAVEPOINT ${savepoint}`);
    }
    entry.txDepth -= 1;
    return { depth: entry.txDepth };
}

async function closeDb(payload) {
    const key = String(payload.dbKey || '').trim();
    const entry = dbEntries.get(key);
    if (!entry) {
        return { closed: false };
    }

    await entry.client.end();
    dbEntries.delete(key);
    [...columnCache.keys()]
        .filter((cacheKey) => cacheKey.startsWith(`${entry.schema}:`))
        .forEach((cacheKey) => columnCache.delete(cacheKey));
    return { closed: true };
}

async function closeAll() {
    const entries = [...dbEntries.entries()];
    for (const [dbKey, entry] of entries) {
        await entry.client.end();
        dbEntries.delete(dbKey);
    }
    columnCache.clear();
    return { closed: entries.length };
}

async function handleMessage(message) {
    const payload = message?.payload || {};
    switch (message?.command) {
    case 'open_db':
        await ensureDbEntry(payload.dbKey, payload.schema);
        return {
            dbKey: String(payload.dbKey || ''),
            schema: String(payload.schema || 'public')
        };
    case 'close_db':
        return closeDb(payload);
    case 'close_all':
        return closeAll();
    case 'begin_tx':
        return beginTransaction(payload);
    case 'commit_tx':
        return commitTransaction(payload);
    case 'rollback_tx':
        return rollbackTransaction(payload);
    case 'exec_sql': {
        const entry = await ensureDbEntry(payload.dbKey, payload.schema);
        await executeSql(entry, translateSql(payload.sql, 'exec'), []);
        columnCache.clear();
        return { ok: true };
    }
    case 'query_sql': {
        const entry = await ensureDbEntry(payload.dbKey, payload.schema);
        const translated = translateSql(payload.sql, payload.mode, payload.params);
        const result = await executeSql(entry, translated, translated.params);
        if (translated.isSchemaMutation) {
            columnCache.clear();
        }
        const rows = Array.isArray(result.rows) ? result.rows : [];
        if (payload.mode === 'get') {
            return rows[0] || null;
        }
        if (payload.mode === 'run') {
            return {
                changes: Number(result.rowCount || 0),
                lastInsertRowid: rows[0]?.inserted_id ?? null
            };
        }
        return rows;
    }
    default:
        throw new Error(`Unsupported worker command: ${message?.command || ''}`);
    }
}

parentPort.on('message', async (message) => {
    try {
        const data = await handleMessage(message);
        writeResponse(message.sab, RESPONSE_STATUS.success, { data });
    } catch (error) {
        writeResponse(message.sab, RESPONSE_STATUS.error, { error: serializeError(error) });
    }
});
