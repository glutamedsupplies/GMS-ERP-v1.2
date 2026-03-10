#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/opt/gms"
DB_PATH="$BASE_DIR/database/app.db"
EXPORT_DIR="$BASE_DIR/exports/$(date +%F)"
mkdir -p "$EXPORT_DIR"

# Add/update tables as needed.
TABLES=(users clients products sales payments deliveries audit_logs)

for tbl in "${TABLES[@]}"; do
  sqlite3 -header -csv "$DB_PATH" "SELECT * FROM ${tbl};" > "$EXPORT_DIR/${tbl}.csv" || true
done

find "$BASE_DIR/exports" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +

echo "CSV export complete: $EXPORT_DIR"
