# Ubuntu FastAPI Production Baseline (Cloudflare Tunnel + Litestream + R2)

This guide converts your requirements into a **ready baseline** so you only need to focus on app modules/UI.

## 1) Server packages

Use the bootstrap script:

```bash
bash ops/scripts/bootstrap_ubuntu.sh
```

It installs/validates:

- python3, pip, python3-venv
- git, curl, unzip, sqlite3
- ufw, htop
- cron, logrotate

---

## 2) Project layout

Create this structure under your app root (example: `/opt/gms`):

```text
/opt/gms
├─ app/
├─ venv/
├─ .env
├─ database/
├─ exports/
├─ backups/
├─ logs/
├─ scripts/
└─ ops/
```

---

## 3) Python backend stack

Inside your project root:

```bash
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install fastapi uvicorn gunicorn sqlalchemy pydantic alembic \
            passlib[bcrypt] python-jose[cryptography] argon2-cffi
```

---

## 4) SQLite WAL mode

In your app startup, execute:

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
```

This improves reliability and concurrency for SQLite.

---

## 5) Systemd service (FastAPI + Gunicorn/Uvicorn worker)

Copy and adjust the service template:

```bash
sudo cp ops/templates/gms-fastapi.service /etc/systemd/system/gms-fastapi.service
sudo systemctl daemon-reload
sudo systemctl enable --now gms-fastapi
sudo systemctl status gms-fastapi
```

---

## 6) Cloudflare Tunnel

1. Install `cloudflared`.
2. Authenticate and create tunnel.
3. Route DNS hostname to tunnel.
4. Use a config that forwards traffic to local app (`127.0.0.1:8000`).

Recommended: manage cloudflared as `systemd` service.

---

## 7) Litestream + Cloudflare R2 replication

Use template `ops/templates/litestream.yml` and set:

- `<R2_BUCKET_NAME>`
- `<R2_ACCOUNT_ID>`
- environment variables:
  - `LITESTREAM_ACCESS_KEY_ID`
  - `LITESTREAM_SECRET_ACCESS_KEY`

Run Litestream as a service so SQLite is continuously replicated.

---

## 8) Daily backup/export automation

Scripts included:

- `ops/scripts/daily_sqlite_backup.sh`
- `ops/scripts/daily_csv_export.sh`
- `ops/scripts/export_sql_schema.sh`

Example cron entries (run as app user):

```cron
# Daily SQLite backup at 1:00 AM
0 1 * * * /opt/gms/ops/scripts/daily_sqlite_backup.sh >> /opt/gms/logs/backup.log 2>&1

# Daily CSV export at 1:30 AM
30 1 * * * /opt/gms/ops/scripts/daily_csv_export.sh >> /opt/gms/logs/export.log 2>&1

# Daily SQL schema dump at 2:00 AM
0 2 * * * /opt/gms/ops/scripts/export_sql_schema.sh >> /opt/gms/logs/schema.log 2>&1
```

---

## 9) Firewall and SSH baseline

- Disable password auth for SSH (use keys).
- Open only needed ports:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status verbose
```

When using Cloudflare Tunnel, you can keep app port private.

---

## 10) Operations checklist

Use these commands for diagnostics:

- `systemctl status gms-fastapi`
- `journalctl -u gms-fastapi -n 200 --no-pager`
- `systemctl status cloudflared`
- `systemctl status litestream`
- `df -h`
- `free -m`
- `htop`

---

## 11) Required application modules (target)

- Authentication
- Users
- Roles
- Clients
- Products / Inventory
- Sales
- Payments
- Deliveries
- Reports
- Exports
- Audit logs

---

## 12) Final stack summary

- Ubuntu Server LTS
- FastAPI
- SQLite (WAL mode)
- Cloudflare Tunnel
- Litestream
- Cloudflare R2
- systemd
- cron
- logrotate
- UPS + SSD

