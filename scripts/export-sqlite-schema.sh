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
target_dir="$EXPORT_ROOT/schema-$timestamp"
mkdir -p "$target_dir"

find "$DATA_DIR" -type f -name '*.db' | sort | while read -r db; do
  relative_path="${db#$DATA_DIR/}"
  output_file="$target_dir/${relative_path%.db}.sql"
  mkdir -p "$(dirname "$output_file")"
  echo "schema: $db -> $output_file"
  sqlite3 "$db" ".schema" > "$output_file"
done

echo "schema export completed: $target_dir"
