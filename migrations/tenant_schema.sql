-- Tenant database schema for multi-tenant mode.
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
  remarks TEXT
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  normalized_contact_number TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_name TEXT NOT NULL,
  item_code TEXT NOT NULL,
  set_name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
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
  underpayment_amount REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expense_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_date TEXT NOT NULL,
  branch TEXT NOT NULL,
  about TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  note TEXT,
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

CREATE INDEX IF NOT EXISTS idx_clients_name
ON clients (name);

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

CREATE INDEX IF NOT EXISTS idx_expense_entries_date
ON expense_entries (expense_date);

CREATE INDEX IF NOT EXISTS idx_expense_entries_branch
ON expense_entries (branch);

CREATE INDEX IF NOT EXISTS idx_cash_income_entries_date
ON cash_income_entries (income_date);

CREATE INDEX IF NOT EXISTS idx_cash_income_entries_branch
ON cash_income_entries (branch);

CREATE INDEX IF NOT EXISTS idx_attendance_user_date
ON attendance (id, date);
