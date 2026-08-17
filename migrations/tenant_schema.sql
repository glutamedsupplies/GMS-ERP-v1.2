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
  row_id BIGSERIAL PRIMARY KEY,
  id TEXT,
  branch_id TEXT,
  name TEXT,
  date TEXT,
  time_in TEXT,
  time_out TEXT,
  worked_hours TEXT,
  remarks TEXT,
  task_id TEXT NOT NULL DEFAULT '',
  task_name TEXT NOT NULL DEFAULT '',
  task_count INTEGER NOT NULL DEFAULT 0,
  task_results_json TEXT NOT NULL DEFAULT '[]',
  timeout_issues TEXT NOT NULL DEFAULT '',
  timeout_remarks TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_name TEXT NOT NULL UNIQUE,
  input_type TEXT NOT NULL DEFAULT 'numeric',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kpi_evaluation_settings (
  id TEXT PRIMARY KEY,
  frequency TEXT NOT NULL DEFAULT 'daily',
  custom_schedule_type TEXT NOT NULL DEFAULT 'interval',
  custom_interval_days INTEGER NOT NULL DEFAULT 15,
  custom_start_date TEXT NOT NULL DEFAULT '',
  custom_end_date TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'required_all',
  comment_required_for_all_required_evaluations INTEGER NOT NULL DEFAULT 0,
  comment_required_for_issue_encounter_low_rating INTEGER NOT NULL DEFAULT 0,
  comment_required_for_all_issue_encounters INTEGER NOT NULL DEFAULT 0,
  allow_employee_view INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kpi_evaluation_records (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  evaluator_employee_id TEXT NOT NULL,
  evaluator_name TEXT NOT NULL DEFAULT '',
  rated_employee_id TEXT NOT NULL,
  rated_employee_name TEXT NOT NULL DEFAULT '',
  rated_employee_role TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL,
  rating_label TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  evaluation_type TEXT NOT NULL,
  evaluation_frequency TEXT NOT NULL DEFAULT '',
  evaluation_period_start TEXT NOT NULL,
  evaluation_period_end TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  visible_to_admin_only INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'submitted',
  reviewed_by_admin_id TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS kpi_evaluation_submissions (
  id TEXT PRIMARY KEY,
  evaluator_employee_id TEXT NOT NULL,
  evaluation_type TEXT NOT NULL,
  evaluation_period_start TEXT NOT NULL,
  evaluation_period_end TEXT NOT NULL,
  required_period_key TEXT UNIQUE,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kpi_evaluation_audit_logs (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_status TEXT NOT NULL DEFAULT '',
  next_status TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS incident_reports (
  id TEXT PRIMARY KEY,
  incident_date TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  reason_incident TEXT NOT NULL DEFAULT '',
  action_taken TEXT NOT NULL DEFAULT '',
  prepared_by TEXT NOT NULL DEFAULT '',
  checked_by TEXT NOT NULL DEFAULT '',
  date_checked TEXT NOT NULL DEFAULT '',
  resolved INTEGER NOT NULL DEFAULT 0,
  assigned_employee_id TEXT NOT NULL DEFAULT '',
  assigned_employee_name TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  attendance_id INTEGER,
  correction_id TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  requested_date TEXT NOT NULL DEFAULT '',
  requested_type TEXT NOT NULL,
  requested_scanned_at TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'device',
  requested_by TEXT NOT NULL DEFAULT '',
  requested_by_device_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by_user_id TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT NOT NULL DEFAULT '',
  rejection_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, correction_id)
);

CREATE TABLE IF NOT EXISTS attendance_audit_logs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  attendance_id INTEGER,
  correction_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  old_value_json TEXT NOT NULL DEFAULT '{}',
  new_value_json TEXT NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL DEFAULT '',
  actor_type TEXT NOT NULL DEFAULT '',
  actor_id TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

CREATE TABLE IF NOT EXISTS payroll_cutoff_statuses (
  user_id TEXT NOT NULL,
  cutoff_start_date TEXT NOT NULL,
  cutoff_end_date TEXT NOT NULL,
  payout_status TEXT NOT NULL DEFAULT 'pending',
  paid_at TEXT NOT NULL DEFAULT '',
  payslip_photo_data_url TEXT NOT NULL DEFAULT '',
  payslip_photo_name TEXT NOT NULL DEFAULT '',
  payslip_photo_uploaded_at TEXT NOT NULL DEFAULT '',
  payslip_photo_uploaded_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, cutoff_start_date, cutoff_end_date)
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

CREATE INDEX IF NOT EXISTS idx_attendance_date_user
ON attendance (date, id);

CREATE INDEX IF NOT EXISTS idx_attendance_updated_at
ON attendance (updated_at, date, id);

CREATE INDEX IF NOT EXISTS idx_attendance_corrections_attendance
ON attendance_corrections (company_id, attendance_id);

CREATE INDEX IF NOT EXISTS idx_attendance_corrections_status_updated
ON attendance_corrections (company_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_attendance_corrections_updated
ON attendance_corrections (company_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_attendance_audit_attendance
ON attendance_audit_logs (company_id, attendance_id, created_at);

CREATE INDEX IF NOT EXISTS idx_attendance_audit_correction
ON attendance_audit_logs (company_id, correction_id, created_at);

CREATE INDEX IF NOT EXISTS idx_payroll_cutoff_statuses_cutoff
ON payroll_cutoff_statuses (cutoff_start_date, cutoff_end_date, user_id);

CREATE INDEX IF NOT EXISTS idx_task_definitions_active_name
ON task_definitions (is_active, task_name);

CREATE INDEX IF NOT EXISTS idx_kpi_records_period_evaluator
ON kpi_evaluation_records (evaluation_type, evaluation_period_start, evaluation_period_end, evaluator_employee_id);

CREATE INDEX IF NOT EXISTS idx_kpi_submissions_period_evaluator
ON kpi_evaluation_submissions (evaluation_type, evaluation_period_start, evaluation_period_end, evaluator_employee_id);

CREATE INDEX IF NOT EXISTS idx_kpi_records_rated_submitted
ON kpi_evaluation_records (rated_employee_id, submitted_at);

CREATE INDEX IF NOT EXISTS idx_kpi_records_status_rating
ON kpi_evaluation_records (status, rating);

CREATE INDEX IF NOT EXISTS idx_kpi_audit_record_created
ON kpi_evaluation_audit_logs (record_id, created_at);

CREATE INDEX IF NOT EXISTS idx_incident_reports_assignment_status
ON incident_reports (assigned_employee_id, resolved, incident_date);

CREATE INDEX IF NOT EXISTS idx_incident_reports_date
ON incident_reports (incident_date, updated_at);
