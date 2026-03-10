# GMS Server Stack Checklist

## Current Repo Reality

The current GMS repo is not a FastAPI project. It runs on Node.js with SQLite. If your goal is to deploy this exact repo, follow [DEPLOYMENT.md](DEPLOYMENT.md).

Keep this file as the complete infrastructure checklist for the server you described, including items that also apply if you later rebuild the backend with FastAPI.

## Final Stack Summary

- Ubuntu Server LTS
- SQLite with WAL mode
- Cloudflare Tunnel
- Cloudflare R2
- Litestream
- systemd
- cron
- logrotate
- `ufw`
- SSH with keys
- static local IP or DHCP reservation
- SSD storage
- UPS

## Operating System

- Ubuntu Server LTS
- `openssh-server`
- `git`
- `curl`
- `unzip`
- `sqlite3`
- `ufw`
- `htop`
- `cron`
- `logrotate`

## Runtime

If deploying this repo now:

- Node.js 22
- npm

If later migrating to Python/FastAPI:

- `python3`
- `pip`
- `python3-venv`
- FastAPI
- Uvicorn
- Gunicorn
- SQLAlchemy
- Pydantic
- Alembic

## Authentication And Security Libraries

If you later build the Python stack:

- Argon2 or bcrypt
- `python-jose` or `PyJWT`
- `passlib`

For the current repo:

- set a strong `ATTENDANCE_SESSION_SECRET`
- keep cookies secure behind HTTPS
- keep `ATTENDANCE_TIME_ZONE=Asia/Manila`

## Database

- SQLite
- WAL mode enabled
- `master.db`
- `tenants/*.db`
- daily integrity check
- regular restore test

## Remote Access

- Cloudflare account
- domain name in Cloudflare DNS
- Cloudflare Tunnel
- public hostname pointed to the tunnel

## Replication And Backup

- Litestream continuous replication
- Cloudflare R2 bucket
- R2 access key
- R2 secret key
- nightly local SQLite snapshots
- nightly CSV exports
- periodic SQL schema export

## Process Management

- `systemd` service for GMS app
- `systemd` service for Litestream
- `cloudflared` service or named tunnel install

## Scheduling

- `cron` for backups
- `cron` for exports
- `cron` for integrity checks
- `cron` for old backup cleanup

## Logging

- systemd journal for live service logs
- `logrotate` for file logs
- separate logs for server, backup, export, integrity

## Monitoring And Diagnostics

- `systemctl`
- `journalctl`
- `df -h`
- `free -h`
- `htop`
- optional simple health check script

## Server Security

- SSH enabled
- SSH keys only
- disable password login if possible
- `ufw` enabled
- keep app bound to `127.0.0.1` when using Cloudflare Tunnel
- keep tunnel origin on localhost only

## Project Structure

```text
/srv/gms/
  app/
  data/
    master.db
    tenants/
  exports/
  backups/
  logs/
  scripts/
  .env
```

## Application Modules To Verify After Every Restore

- Authentication
- Users
- Roles
- Clients
- Products and inventory
- Sales
- Payments
- Deliveries
- Reports
- Exports
- Audit logs

## Maintenance Checklist

- verify free disk space weekly
- verify latest backup exists daily
- verify latest CSV export exists daily
- verify Litestream replication status daily
- test restore monthly
- update Ubuntu packages regularly
- keep a second copy of critical secrets offline

## Minimum Done State

You are in a good state when all of these are true:

- app starts on boot through `systemd`
- login works through the Cloudflare hostname
- SQLite is in WAL mode
- daily backups run
- daily CSV exports run
- Litestream replicates to R2
- restores have been tested
- firewall is enabled
- SSH uses keys
- logs rotate automatically
