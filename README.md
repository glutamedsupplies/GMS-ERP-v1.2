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
