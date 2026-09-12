# Deploying Newsa (production on VPS)

Production runs on your **VPS** at **https://portal.newsa.io**. Staging is **local only** and uses the live database — see [STAGING.md](./STAGING.md).

The app uses **Supabase** for backend data (user roles, invitations, groups, password reset tokens). SQLite has been removed.

## Architecture

```
Production (VPS)                         Shared services
┌─────────────────────────┐              ┌─────────────┐
│  Node (server.ts)       │─────────────▶│  Supabase   │
│  SPA (dist/) + /api/*   │              │  PostgreSQL │
│  portal.newsa.io        │              │  + Storage  │
└─────────────────────────┘              └─────────────┘
         │                               ┌─────────────┐
         └──────────────────────────────▶│  Firebase   │
                                         │  Auth       │
                                         └─────────────┘
                                         ┌─────────────┐
                                         └─────────────▶│  Airtable   │
                                                      └─────────────┘

Local staging (developer laptop)
┌─────────────────────────┐
│  npm run dev:staging    │── same Supabase / Firebase / Airtable as above
│  localhost:5001         │
└─────────────────────────┘
```

## 1. Run the Supabase schema (one-time)

In [Supabase Dashboard](https://supabase.com/dashboard) → **SQL Editor**, run `supabase/schema.sql`.

## 2. Production environment on the VPS

Create `.env` on the server (never commit it). Copy from `.env.example` and set:

| Variable | Production value |
|----------|------------------|
| `NODE_ENV` | `production` (set by start command or systemd) |
| `PORT` | `5001` (or your internal port) |
| `APP_BASE_URL` | `https://portal.newsa.io` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Live Supabase project |
| `FIREBASE_SERVICE_ACCOUNT` | Live Firebase service account JSON |
| `VITE_FIREBASE_*` | Live Firebase client config (needed at **build** time) |
| `AIRTABLE_*` | Live Airtable base |
| `SMTP_*` | Hostinger / production mail |
| `OPENROUTER_API_KEY` | If using SEO generation |

Do **not** set `VITE_API_BASE_URL` on the VPS — the unified server serves API and SPA on the same origin.

## 3. First deploy on the VPS

```bash
git clone <your-repo-url> newsa
cd newsa
cp .env.example .env   # edit with production secrets
npm ci
npm run build
NODE_ENV=production PORT=5001 npm start
```

Put nginx (or Caddy) in front with HTTPS:

- `portal.newsa.io:443` → `http://127.0.0.1:5001`
- Proxy headers: `X-Forwarded-For`, `X-Forwarded-Proto`

Use **pm2** or **systemd** to keep the process running. Example pm2:

```bash
pm2 start npm --name newsa -- start
pm2 save
```

Subsequent deploys:

```bash
./scripts/deploy-production.sh
```

## 4. Custom domain & Firebase

See [DOMAIN-SETUP.md](./DOMAIN-SETUP.md):

- Add `portal.newsa.io` to Firebase **Authorized domains**
- Point DNS to the VPS and enable HTTPS (Let's Encrypt)

## 5. Local staging (not on VPS)

Developers run staging locally against the **live** database:

```bash
cp .env.staging.example .env.staging
# fill with production credentials
npm run dev:staging
```

Full guide: [STAGING.md](./STAGING.md).

---

## Alternative hosts (optional)

The repo also includes configs for **Cloud Run**, **Render**, and **Firebase Hosting** (split frontend/API). The recommended setup for this project is the **unified VPS** model above.
