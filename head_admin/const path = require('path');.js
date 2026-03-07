const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

const dbDir  = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);
const dbPath = path.join(dbDir, 'users.db');
const db     = new Database(dbPath);