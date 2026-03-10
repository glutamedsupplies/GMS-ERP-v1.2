#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${1:-}"
EXPORT_ROOT="${2:-}"

if [[ -z "$DATA_DIR" || -z "$EXPORT_ROOT" ]]; then
  echo "usage: $0 /path/to/data /path/to/exports" >&2
  exit 1
fi

if [[ ! -d "$DATA_DIR" ]]; then
  echo "data directory not found: $DATA_DIR" >&2
  exit 1
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
target_dir="$EXPORT_ROOT/csv-$timestamp"
mkdir -p "$target_dir"

find "$DATA_DIR" -type f -name '*.db' | sort | while read -r db; do
  db_name="$(basename "$db" .db)"
  db_dir="$target_dir/$db_name"
  mkdir -p "$db_dir"

  sqlite3 "$db" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;" | while read -r table_name; do
    [[ -z "$table_name" ]] && continue
    output_file="$db_dir/$table_name.csv"
    echo "export: $db -> $output_file"
    sqlite3 -header -csv "$db" "SELECT * FROM \"$table_name\";" > "$output_file"
  done
done

echo "csv export completed: $target_dir"
