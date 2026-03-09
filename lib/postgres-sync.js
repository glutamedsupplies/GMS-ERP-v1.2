const path = require('path');
const { Worker } = require('worker_threads');

const WORKER_PATH = path.join(__dirname, 'postgres-worker.js');
const HEADER_SIZE = 8;
const INITIAL_BUFFER_SIZE = 1024 * 1024;
const MAX_BUFFER_SIZE = 64 * 1024 * 1024;
const RESPONSE_STATUS = Object.freeze({
    success: 1,
    error: 2
});

let worker = null;
let requestCounter = 0;

function getWorker() {
    if (!worker) {
        worker = new Worker(WORKER_PATH);
    }

    return worker;
}

function encodeRequest(command, payload, bufferSize) {
    const sab = new SharedArrayBuffer(bufferSize);
    const header = new Int32Array(sab, 0, 2);
    header[0] = 0;
    header[1] = 0;
    getWorker().postMessage({
        id: ++requestCounter,
        command,
        payload,
        sab
    });
    return sab;
}

function decodeResponse(sab) {
    const header = new Int32Array(sab, 0, 2);
    const body = new Uint8Array(sab, HEADER_SIZE);
    const status = Atomics.load(header, 0);
    const length = Atomics.load(header, 1);
    const responseText = Buffer.from(body.slice(0, length)).toString('utf8');
    const payload = responseText ? JSON.parse(responseText) : {};
    if (status === RESPONSE_STATUS.success) {
        return payload.data;
    }

    const errorPayload = payload.error || {};
    const error = new Error(String(errorPayload.message || 'PostgreSQL worker request failed.'));
    error.name = String(errorPayload.name || 'Error');
    error.code = String(errorPayload.code || '');
    error.stack = errorPayload.stack || error.stack;
    error.details = errorPayload.details ?? null;
    error.requiredSize = Number(errorPayload.requiredSize || 0);
    throw error;
}

function callWorker(command, payload, timeoutMs = 120000) {
    let bufferSize = INITIAL_BUFFER_SIZE;

    while (bufferSize <= MAX_BUFFER_SIZE) {
        const sab = encodeRequest(command, payload, bufferSize);
        const header = new Int32Array(sab, 0, 2);
        const waitResult = Atomics.wait(header, 0, 0, timeoutMs);
        if (waitResult === 'timed-out') {
            const error = new Error(`PostgreSQL worker timed out while handling ${command}.`);
            error.code = 'POSTGRES_WORKER_TIMEOUT';
            throw error;
        }

        try {
            return decodeResponse(sab);
        } catch (error) {
            if (error.code === 'BUFFER_TOO_SMALL' && error.requiredSize > bufferSize && error.requiredSize <= MAX_BUFFER_SIZE) {
                bufferSize = error.requiredSize;
                continue;
            }
            throw error;
        }
    }

    const error = new Error('PostgreSQL worker response exceeded maximum buffer size.');
    error.code = 'POSTGRES_WORKER_BUFFER_LIMIT';
    throw error;
}

class PreparedStatement {
    constructor(database, sql) {
        this.database = database;
        this.sql = String(sql || '');
    }

    normalizeParams(args) {
        if (args.length === 1 && args[0] && !Array.isArray(args[0]) && typeof args[0] === 'object') {
            return args[0];
        }
        if (args.length === 1 && Array.isArray(args[0])) {
            return args[0];
        }
        return [...args];
    }

    all(...args) {
        return callWorker('query_sql', {
            dbKey: this.database.key,
            schema: this.database.schema,
            sql: this.sql,
            params: this.normalizeParams(args),
            mode: 'all'
        });
    }

    get(...args) {
        return callWorker('query_sql', {
            dbKey: this.database.key,
            schema: this.database.schema,
            sql: this.sql,
            params: this.normalizeParams(args),
            mode: 'get'
        });
    }

    run(...args) {
        return callWorker('query_sql', {
            dbKey: this.database.key,
            schema: this.database.schema,
            sql: this.sql,
            params: this.normalizeParams(args),
            mode: 'run'
        });
    }
}

class PostgresDatabase {
    constructor({ key, schema = 'public' } = {}) {
        this.key = String(key || '').trim();
        this.schema = String(schema || 'public').trim() || 'public';
        this.__isPostgresCompat = true;
        if (!this.key) {
            throw new Error('Database key is required.');
        }

        callWorker('open_db', {
            dbKey: this.key,
            schema: this.schema
        });
    }

    pragma() {
        return null;
    }

    exec(sql) {
        return callWorker('exec_sql', {
            dbKey: this.key,
            schema: this.schema,
            sql: String(sql || '')
        });
    }

    prepare(sql) {
        return new PreparedStatement(this, sql);
    }

    transaction(fn) {
        return (...args) => {
            callWorker('begin_tx', {
                dbKey: this.key,
                schema: this.schema
            });

            try {
                const result = fn(...args);
                callWorker('commit_tx', {
                    dbKey: this.key,
                    schema: this.schema
                });
                return result;
            } catch (error) {
                try {
                    callWorker('rollback_tx', {
                        dbKey: this.key,
                        schema: this.schema
                    });
                } catch (_rollbackError) {
                    // Keep the original error as the primary failure.
                }
                throw error;
            }
        };
    }

    close() {
        return callWorker('close_db', {
            dbKey: this.key,
            schema: this.schema
        });
    }
}

function closeAllConnections() {
    if (!worker) {
        return { closed: 0 };
    }

    const result = callWorker('close_all', {});
    worker.terminate();
    worker = null;
    return result;
}

module.exports = PostgresDatabase;
module.exports.closeAllConnections = closeAllConnections;
