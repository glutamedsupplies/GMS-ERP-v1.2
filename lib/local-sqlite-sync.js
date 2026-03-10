const fs = require('fs');
const os = require('os');
const path = require('path');
const BetterSqlite3 = require('better-sqlite3');

function resolveDefaultDataRoot() {
    const explicitRoot = String(process.env.ATTENDANCE_DATA_DIR || '').trim();
    if (explicitRoot) {
        return path.resolve(explicitRoot);
    }

    const desktopDataRoot = path.join(os.homedir(), 'AttendanceApp');
    if (fs.existsSync(path.join(desktopDataRoot, 'data', 'master.db'))) {
        return desktopDataRoot;
    }

    return path.resolve(__dirname, '..');
}

function ensureDirectory(targetPath) {
    fs.mkdirSync(targetPath, { recursive: true });
}

function resolveDbFilePath(key = '') {
    const normalizedKey = String(key || '').trim();
    const dataRoot = resolveDefaultDataRoot();
    const dataDir = path.join(dataRoot, 'data');
    const tenantsDir = path.join(dataDir, 'tenants');
    ensureDirectory(dataDir);
    ensureDirectory(tenantsDir);

    if (normalizedKey === 'master') {
        return path.join(dataDir, 'master.db');
    }

    if (normalizedKey.startsWith('tenant:')) {
        const tenantId = normalizedKey.slice('tenant:'.length).trim();
        if (!tenantId) {
            throw new Error('Tenant database key is missing its company id.');
        }
        return path.join(tenantsDir, `${tenantId}.db`);
    }

    throw new Error(`Unsupported local SQLite database key: ${normalizedKey}`);
}

class PreparedStatement {
    constructor(database, statement) {
        this.database = database;
        this.statement = statement;
    }

    normalizeParams(args) {
        if (args.length === 0) {
            return undefined;
        }
        if (args.length === 1) {
            return args[0];
        }
        return [...args];
    }

    all(...args) {
        const params = this.normalizeParams(args);
        return params === undefined ? this.statement.all() : this.statement.all(params);
    }

    get(...args) {
        const params = this.normalizeParams(args);
        return params === undefined ? this.statement.get() : this.statement.get(params);
    }

    run(...args) {
        const params = this.normalizeParams(args);
        return params === undefined ? this.statement.run() : this.statement.run(params);
    }
}

class LocalSqliteDatabase {
    constructor({ key, schema = 'main' } = {}) {
        this.key = String(key || '').trim();
        this.schema = String(schema || 'main').trim() || 'main';
        this.__isPostgresCompat = false;

        if (!this.key) {
            throw new Error('Database key is required.');
        }

        this.filePath = resolveDbFilePath(this.key);
        this.db = new BetterSqlite3(this.filePath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('busy_timeout = 5000');
    }

    pragma(...args) {
        return this.db.pragma(...args);
    }

    exec(sql) {
        return this.db.exec(String(sql || ''));
    }

    prepare(sql) {
        return new PreparedStatement(this, this.db.prepare(String(sql || '')));
    }

    transaction(fn) {
        return this.db.transaction(fn);
    }

    close() {
        this.db.close();
    }
}

function closeAllConnections() {
    return { closed: 0 };
}

module.exports = LocalSqliteDatabase;
module.exports.closeAllConnections = closeAllConnections;
