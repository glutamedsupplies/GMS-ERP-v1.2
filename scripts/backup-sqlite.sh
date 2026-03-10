#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${1:-}"
BACKUP_ROOT="${2:-}"

if [[ -z "$DATA_DIR" || -z "$BACKUP_ROOT" ]]; then
  echo "usage: $0 /path/to/data /path/to/backups" >&2
  exit 1
fi

if [[ ! -d "$DATA_DIR" ]]; then
  echo "data directory not found: $DATA_DIR" >&2
  exit 1
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
target_dir="$BACKUP_ROOT/sqlite-$timestamp"
mkdir -p "$target_dir"

find "$DATA_DIR" -type f -name '*.db' | sort | while read -r db; do
  relative_path="${db#$DATA_DIR/}"
  target_path="$target_dir/$relative_path"
  mkdir -p "$(dirname "$target_path")"
  echo "backup: $db -> $target_path"
  sqlite3 "$db" ".timeout 5000" ".backup '$target_path'"
done

if command -v sha256sum >/dev/null 2>&1; then
  (
    cd "$target_dir"
    find . -type f -name '*.db' | sort | xargs sha256sum
  ) > "$target_dir/SHA256SUMS"
fi

echo "backup completed: $target_dir"
