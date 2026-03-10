#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/opt/gms"
DB_PATH="$BASE_DIR/database/app.db"
BACKUP_DIR="$BASE_DIR/backups"
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%F_%H-%M-%S)"
OUT="$BACKUP_DIR/app_${STAMP}.db"

sqlite3 "$DB_PATH" ".backup '$OUT'"

gzip -f "$OUT"
find "$BACKUP_DIR" -name '*.db.gz' -mtime +14 -delete

echo "Backup complete: ${OUT}.gz"
