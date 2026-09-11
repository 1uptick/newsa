# KongStocks

Next.js + Payload CMS + Postgres. Hosted on Hostinger VPS `72.62.194.142`.

This phase uses a **plain layout**. The design system is intentionally deferred until after WordPress migration.

## Local

```bash
cp .env.example .env
npm install
npm run dev
```

## VPS layout

| Path | Role |
|---|---|
| `/opt/kongstocks/app` | Application source |
| `/opt/kongstocks/deploy/.env.staging` / `.env.prod` / `.env.postgres` | Secrets (not in git) |
| `127.0.0.1:5433` | Staging Postgres |
| `127.0.0.1:5434` | Production Postgres |
| `127.0.0.1:3010` | Staging Next.js |
| `127.0.0.1:3011` | Production Next.js |
| `/var/backups/kongstocks` | Nightly `pg_dump` (7 days) |

Nginx is used instead of Caddy because this VPS already terminates TLS on nginx for 1uptick sites.

## Deploy

```bash
# on the VPS
/opt/kongstocks/app/scripts/deploy-staging.sh
/opt/kongstocks/app/scripts/promote.sh   # 1-click go-live
```

## n8n

Point workflows at `POST /api/n8n/posts` with `Authorization: Bearer $PAYLOAD_API_KEY`. See [scripts/n8n-switch.md](scripts/n8n-switch.md).

## WordPress import

```bash
WP_EXPORT=/path/to/wp-posts.json npm run import:wp
```
