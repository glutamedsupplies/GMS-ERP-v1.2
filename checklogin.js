const db = require('better-sqlite3')('.runtime-data/data/master.db');
const company = db.prepare("SELECT id, name, company_code, status FROM companies WHERE LOWER(company_code) = 'gms'").all();
console.log('COMPANY:', company);
if (company.length) {
  const users = db.prepare('SELECT id, username, login_email, role, is_active FROM users WHERE company_id = ?').all(company[0].id);
  console.log('USERS:', users);
}
