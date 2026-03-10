-- Master database schema for multi-tenant mode.
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
  app_name TEXT NOT NULL DEFAULT '',
  db_schema TEXT NOT NULL DEFAULT ''
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
  time_out TEXT NOT NULL DEFAULT '17:00'
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
  PRIMARY KEY(company_id, month_key)
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
ON users ((COALESCE(company_id, '')), username);
