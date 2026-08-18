const db = require('better-sqlite3')('.runtime-data/data/master.db');
console.log('Tables in database:');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;").all();
console.log(tables);
console.log('\nCompanies table:');
const companies = db.prepare('SELECT * FROM companies').all();
console.log('Total companies:', companies.length);
companies.forEach((c, i) => {
  console.log(`${i+1}. ID: ${c.id}, name: ${c.name}, company_code: ${c.company_code}, status: ${c.status}`);
});
console.log('\nUsers table:');
const users = db.prepare('SELECT * FROM users').all();
console.log('Total users:', users.length);
users.forEach((u, i) => {
  console.log(`${i+1}. ID: ${u.id}, username: ${u.username}, company_id: ${u.company_id}, role: ${u.role}, is_active: ${u.is_active}`);
});