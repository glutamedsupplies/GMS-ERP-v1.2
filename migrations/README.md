# Multi-Tenant Migrations

## Files
- `master_schema.sql`: master DB schema snapshot.
- `tenant_schema.sql`: tenant DB schema snapshot.
- `run-migrations.js`: idempotent schema runner with backup + `system_meta.schema_version`.
- `legacy-import.js`: one-time legacy import trigger from:
  - `head_admin/data/users.db`
  - `employee/data/attendance.db`
- `import-sqlite-to-postgres.js`: one-time export/import of master, tenant, and legacy SQLite data into PostgreSQL schema tables.
- `import-sqlite-to-runtime-postgres.js`: one-time import of live SQLite `master.db` and `tenants/*.db` into the app runtime PostgreSQL schemas used by Vercel/Supabase.

## Commands
- `npm run migrate:multi-tenant`
- `npm run migrate:legacy`
- `npm run migrate:postgres`
- `npm run migrate:postgres-live`
- `npm run migrate:postgres-live-verify`

Use `--force` to re-apply schema snapshots:
- `node migrations/run-migrations.js --force`
- `node migrations/import-sqlite-to-postgres.js --force`

Use `--skip-backup` only if backups are handled externally.
