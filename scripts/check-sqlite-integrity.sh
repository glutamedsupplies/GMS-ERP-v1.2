#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${1:-}"

if [[ -z "$DATA_DIR" ]]; then
  echo "usage: $0 /path/to/data" >&2
  exit 1
fi

if [[ ! -d "$DATA_DIR" ]]; then
  echo "data directory not found: $DATA_DIR" >&2
  exit 1
fi

failed=0

while read -r db; do
  result="$(sqlite3 "$db" "PRAGMA quick_check;")"
  echo "$db: $result"
  if [[ "$result" != "ok" ]]; then
    failed=1
  fi
done < <(find "$DATA_DIR" -type f -name '*.db' | sort)

if [[ "$failed" -ne 0 ]]; then
  echo "integrity check failed" >&2
  exit 1
fi

echo "all sqlite databases passed integrity check"
