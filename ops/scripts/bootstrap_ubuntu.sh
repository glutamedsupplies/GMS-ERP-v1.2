#!/usr/bin/env bash
set -euo pipefail

sudo apt-get update
sudo apt-get install -y \
  python3 python3-pip python3-venv \
  git curl unzip sqlite3 \
  ufw htop cron logrotate

echo "[OK] Base packages installed."
python3 --version
pip3 --version
sqlite3 --version
