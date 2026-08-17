# GMS

## Infrastructure Baseline (Ubuntu + SQLite + Cloudflare)

If you want the production server baseline for this repo, use:

- Main deployment guide: `DEPLOYMENT.md`
- Full infrastructure checklist: `SERVER_STACK_CHECKLIST.md`
- App service template: `ops/gms.service`
- Cloudflare Tunnel template: `ops/cloudflared-config.yml`
- Litestream service template: `ops/litestream.service`
- Log rotation template: `ops/logrotate-gms`
- Cron template: `ops/cron-gms`
- Backup/export scripts: `scripts/backup-sqlite.sh`, `scripts/export-sqlite-csv.sh`, `scripts/export-sqlite-schema.sh`

## Windows Quick Run

For your local-PC SQLite setup with Cloudflare Tunnel:

- `run-local-server.cmd`: start the local server only
- `run-public-tunnel.cmd`: start the local server plus a temporary Cloudflare public tunnel
- `stop-local-server.cmd`: stop the managed local server started by the tunnel launcher

Runtime defaults are stored in `local-runtime.config.json`.
