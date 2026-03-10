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

find "$DATA_DIR" -type f -name '*.db' | sort | while read -r db; do
  echo "enabling WAL: $db"
  sqlite3 "$db" "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;"
done
