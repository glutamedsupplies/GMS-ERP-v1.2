#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/opt/gms"
DB_PATH="$BASE_DIR/database/app.db"
BACKUP_DIR="$BASE_DIR/backups/schema"
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%F_%H-%M-%S)"
OUT="$BACKUP_DIR/schema_${STAMP}.sql"

sqlite3 "$DB_PATH" ".schema" > "$OUT"
gzip -f "$OUT"

find "$BACKUP_DIR" -name '*.sql.gz' -mtime +30 -delete

echo "Schema export complete: ${OUT}.gz"
