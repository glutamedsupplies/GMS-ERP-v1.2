# Multi-Tenant Migrations

## Files
- `master_schema.sql`: master DB schema snapshot.
- `tenant_schema.sql`: tenant DB schema snapshot.
- `run-migrations.js`: idempotent schema runner with backup + `system_meta.schema_version`.
- `legacy-import.js`: one-time legacy import trigger from:
  - `head_admin/data/users.db`
  - `employee/data/attendance.db`

## Commands
- `npm run migrate:multi-tenant`
- `npm run migrate:legacy`

Use `--force` to re-apply schema snapshots:
- `node migrations/run-migrations.js --force`

Use `--skip-backup` only if backups are handled externally.
