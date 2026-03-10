# GMS Local Deployment Guide

## Scope

This guide is for the current GMS repo as it exists today:

- backend runtime: Node.js
- web server: built-in HTTP server from `server.js`
- database: local SQLite files
- public access: Cloudflare Tunnel
- backup/replication: SQLite snapshots plus Litestream to Cloudflare R2

If you later migrate the app to FastAPI, keep [SERVER_STACK_CHECKLIST.md](SERVER_STACK_CHECKLIST.md) as the infrastructure reference. This file is the repo-compatible deployment runbook for the current app.

## Recommended Final Setup

- Ubuntu Server LTS
- Node.js 22
- SQLite in WAL mode
- Cloudflare Tunnel
- Litestream
- Cloudflare R2
- systemd
- cron
- logrotate
- `ufw`

## Directory Layout

Use one consistent root such as `/srv/gms`:

```text
/srv/gms/
  app/        # cloned repo
  data/       # master.db and tenant dbs
  backups/    # daily SQLite snapshot backups
  exports/    # daily CSV exports
  logs/       # app, backup, export, integrity logs
  scripts/    # optional host-level helper scripts
  .env        # production environment file
```

Expected SQLite layout for this app:

```text
/srv/gms/data/master.db
/srv/gms/data/tenants/*.db
```

## 1. Install Core Packages

```bash
sudo apt update
sudo apt install -y curl git unzip sqlite3 ufw htop ca-certificates gnupg logrotate cron
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Optional but useful:

- `python3`
- `python3-pip`
- `python3-venv`

## 2. Create Service User And Folders

```bash
sudo useradd --system --create-home --home-dir /srv/gms --shell /bin/bash gms || true
sudo mkdir -p /srv/gms/app /srv/gms/data/tenants /srv/gms/backups /srv/gms/exports /srv/gms/logs /srv/gms/scripts
sudo chown -R gms:gms /srv/gms
```

## 3. Clone The Repo

```bash
sudo -u gms git clone https://github.com/JethroVillareal/GMS.git /srv/gms/app
cd /srv/gms/app
sudo -u gms npm ci --omit=dev
```

## 4. Create The Production Env File

Copy the repo template:

```bash
sudo -u gms cp /srv/gms/app/.env.example /srv/gms/.env
sudo chmod 600 /srv/gms/.env
```

Minimum required values inside `/srv/gms/.env`:

```dotenv
ATTENDANCE_DB_BACKEND=sqlite
ATTENDANCE_DATA_DIR=/srv/gms/data
ATTENDANCE_BIND_HOST=127.0.0.1
ATTENDANCE_PORT=3000
ATTENDANCE_PUBLIC_URL=https://gms.example.com
ATTENDANCE_TRUST_PROXY=true
ATTENDANCE_SECURE_COOKIES=true
ATTENDANCE_TIME_ZONE=Asia/Manila
ATTENDANCE_SESSION_SECRET=replace-with-a-long-random-secret
```

Notes:

- Keep `ATTENDANCE_BIND_HOST=127.0.0.1` when Cloudflare Tunnel is the public entry point.
- Set `ATTENDANCE_BIND_HOST=0.0.0.0` only if you intentionally expose it on the LAN.
- `ATTENDANCE_DATA_DIR` must point to the host path that contains `master.db` and `tenants/*.db`.

## 5. Copy Your Existing Data

From your current PC or old host, move the live SQLite data into `/srv/gms/data`.

Expected files:

- `/srv/gms/data/master.db`
- `/srv/gms/data/tenants/company_*.db`

Before copying from the old machine, close the old running GMS/Electron app so SQLite is not locked.

## 6. Enable WAL Mode

The repo now includes a helper:

```bash
cd /srv/gms/app
sudo bash ./scripts/enable-sqlite-wal.sh /srv/gms/data
```

This sets:

- `PRAGMA journal_mode=WAL`
- `PRAGMA synchronous=NORMAL`

## 7. Start The App Manually Once

```bash
cd /srv/gms/app
sudo -u gms --preserve-env=HOME bash -lc 'set -a; source /srv/gms/.env; set +a; node server.js'
```

Quick checks:

- `curl http://127.0.0.1:3000/api/server-info`
- login works locally
- correct Philippine time is shown for attendance

## 8. Install The systemd Service

Copy the bundled unit:

```bash
sudo cp /srv/gms/app/ops/gms.service /etc/systemd/system/gms.service
sudo systemctl daemon-reload
sudo systemctl enable --now gms.service
```

Useful commands:

```bash
sudo systemctl status gms
sudo journalctl -u gms -n 200 --no-pager
```

## 9. Set Up Cloudflare Tunnel

Install `cloudflared` on Ubuntu, authenticate with your Cloudflare account, then create a named tunnel.

Template config is provided at:

- `ops/cloudflared-config.yml`

Suggested ingress target:

```text
http://127.0.0.1:3000
```

After the tunnel is created, set your real public hostname in `/srv/gms/.env`:

```dotenv
ATTENDANCE_PUBLIC_URL=https://gms.example.com
```

Restart the app after changing the public URL:

```bash
sudo systemctl restart gms
```

## 10. Configure Litestream To Cloudflare R2

This repo includes a generator for multi-database Litestream configs:

```bash
cd /srv/gms/app
sudo node scripts/generate-litestream-config.js \
  --data-dir /srv/gms/data \
  --bucket your-r2-bucket \
  --account-id your-cloudflare-account-id \
  --access-key-id your-r2-access-key-id \
  --secret-access-key your-r2-secret-access-key \
  --output /etc/litestream.yml
sudo chmod 600 /etc/litestream.yml
```

Then install Litestream and the provided service unit:

```bash
sudo cp /srv/gms/app/ops/litestream.service /etc/systemd/system/litestream.service
sudo systemctl daemon-reload
sudo systemctl enable --now litestream.service
```

Useful checks:

```bash
sudo systemctl status litestream
sudo journalctl -u litestream -n 200 --no-pager
```

Important:

- Regenerate `/etc/litestream.yml` whenever a new tenant database file is created.
- The config generator includes `master.db` and every `tenants/*.db`.

## 11. Schedule Backups, Exports, And Integrity Checks

Repo-provided scripts:

- `scripts/backup-sqlite.sh`
- `scripts/export-sqlite-csv.sh`
- `scripts/export-sqlite-schema.sh`
- `scripts/check-sqlite-integrity.sh`

Cron template:

```bash
sudo cp /srv/gms/app/ops/cron-gms /etc/cron.d/gms
sudo chmod 644 /etc/cron.d/gms
```

What the cron template does:

- nightly SQLite backup snapshots
- nightly CSV exports
- weekly schema exports
- nightly integrity checks
- weekly deletion of old local backups and exports

## 12. Enable Log Rotation

Copy the included template:

```bash
sudo cp /srv/gms/app/ops/logrotate-gms /etc/logrotate.d/gms
sudo chmod 644 /etc/logrotate.d/gms
```

This rotates:

- `/srv/gms/logs/server.log`
- `/srv/gms/logs/server-error.log`
- `/srv/gms/logs/backup.log`
- `/srv/gms/logs/export.log`
- `/srv/gms/logs/integrity.log`

## 13. Lock Down The Server

Suggested minimum firewall:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw enable
```

If Cloudflare Tunnel is your only public entry path, you usually do not need to open port `3000`.

## 14. Verification Checklist

- `sudo systemctl status gms` is `active (running)`
- `sudo systemctl status litestream` is `active (running)`
- `curl http://127.0.0.1:3000/api/server-info` returns JSON
- login works through the Cloudflare hostname
- attendance uses Philippine time
- `/srv/gms/backups` receives nightly `.db` snapshots
- `/srv/gms/exports` receives nightly CSV files
- R2 replication is advancing
- `journalctl -u gms` shows no crash loop

## 15. Restore Drill

At least once, test this sequence on a separate VM or test folder:

1. stop `gms`
2. restore a snapshot from `/srv/gms/backups`
3. or restore from Litestream into a new folder
4. point `ATTENDANCE_DATA_DIR` to the restored copy
5. start the app and verify login, users, attendance, and sales

If you never test restore, your backups are only assumptions.
