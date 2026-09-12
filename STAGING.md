# Local staging (live database)

Staging runs **on your machine** and connects to the **same data** as production (`portal.newsa.io`). Production stays on the VPS.

| Environment | Where it runs | Data |
|-------------|---------------|------|
| **Production** | VPS (`portal.newsa.io`) | Live Airtable + Supabase (or legacy SQLite) + Firebase |
| **Staging** | Local (`http://localhost:5001`) | **Same live** services as production |
| **Local dev** | Local with `.env` | Optional sandbox projects |

---

## Which services do you need?

| Service | Required to start latest code? | When you need it |
|---------|-------------------------------|------------------|
| **Supabase** | **Yes** — app exits without it | User roles, invitations, groups, password-reset tokens, capital article edits, image uploads |
| **Firebase** | No (warns only) | Login, register, admin panel, protected routes |
| **Airtable** | No (warns only) | News feed, capital keywords, SEO topic generation |
| **SMTP** | No | Invitation and password-reset emails |

**History:** Older production used a local **SQLite file** (`newsa.db`) on the VPS. Commit `7f67417` moved app data to **Supabase**. Latest code requires Supabase.

---

## Step 0: Audit production (run on VPS)

SSH into the VPS and run:

```bash
cd /path/to/newsa
./scripts/audit-production.sh
```

This reports **Path A** (SQLite) or **Path B** (Supabase) and checks Firebase/Airtable connectivity.

---

## Path A — Production still on SQLite (`newsa.db`)

Use this if the audit finds `newsa.db` and no `SUPABASE_URL` in `.env`.

### A1. Back up and copy the live database

On the VPS:

```bash
cp newsa.db newsa.db.backup-$(date +%Y%m%d)
```

Copy to your laptop (secure channel):

```bash
scp user@vps:/path/to/newsa/newsa.db ./newsa.db
```

### A2. Migrate SQLite → Supabase (one-time, recommended)

Latest code will not start without Supabase. Migrate once, then both production and local staging use the same Supabase project.

1. Create a [Supabase](https://supabase.com) project (or use existing).
2. Run [`supabase/schema.sql`](supabase/schema.sql) in Supabase SQL Editor.
3. Create Storage bucket **`article-images`** (public).
4. Add to VPS `.env` and local `.env`:
   ```env
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```
5. Run migration from your laptop (with `newsa.db` copied locally):
   ```bash
   npm run migrate:sqlite
   ```
6. Deploy latest code to VPS with Supabase env vars. Verify login and admin users.
7. Back up then remove `newsa.db` on VPS after verification.

### A3. Local staging after Supabase migration

Follow **Path B** below — you now share the same Supabase project as production.

---

## Path B — Production on Supabase (or after A2 migration)

Use this if the audit finds `SUPABASE_URL` in `.env`.

### B1. Copy production secrets locally

```bash
cp .env.staging.example .env.staging
```

Fill in **the same values as VPS production** for:

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Live database (required) |
| `AIRTABLE_*` | Live news / capital content |
| `VITE_FIREBASE_*`, `FIREBASE_SERVICE_ACCOUNT` | Login (if you use auth) |
| `OPENROUTER_API_KEY` | SEO generation (optional) |

Keep these staging-specific values:

```env
NEW_SA_ENV=staging
APP_BASE_URL=http://localhost:5001
SMTP_DISABLED=true
```

Do **not** set `VITE_API_BASE_URL`.

### B2. Firebase: allow localhost

[Firebase Console](https://console.firebase.google.com/) → **Authentication** → **Authorized domains** → ensure `localhost` is listed.

### B3. Run local staging

```bash
npm install
npm run dev:staging
```

Open **http://localhost:5001**.

---

## Decommission VPS staging

After local staging works:

1. Stop the staging process on the VPS (pm2, systemd, etc.).
2. Remove staging nginx vhost / DNS (e.g. `staging.newsa.io`).
3. Keep **only** production for `portal.newsa.io`.
4. Optionally delete the staging app directory on the VPS.

Production deploy: see [DEPLOY.md](./DEPLOY.md) and `./scripts/deploy-production.sh`.

---

## Safety (live data)

Local staging writes affect **real production data**.

| Action | Effect |
|--------|--------|
| Edit capital articles | Live Supabase + may sync to Airtable |
| Invite / delete users | Live `user_roles`, Firebase users |
| SEO topic generation | Live Airtable records |
| Password reset / invitations | Real emails unless `SMTP_DISABLED=true` |
| Image uploads | Live Supabase Storage |

Keep `SMTP_DISABLED=true` unless deliberately testing email.

---

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev:staging` | Local staging (loads `.env.staging`) |
| `npm run dev` | Local dev (loads `.env`) |
| `npm run migrate:sqlite` | One-time SQLite → Supabase migration |
| `./scripts/audit-production.sh` | Run on VPS to detect Path A vs B |

---

## Troubleshooting

**App won't start — Supabase required**

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Run `supabase/schema.sql` if tables are missing.

**Login returns 503 / Auth not configured**

Set `FIREBASE_SERVICE_ACCOUNT` (server) and `VITE_FIREBASE_*` (client). Add `localhost` to Firebase authorized domains.

**News feed empty / Airtable errors**

Set all `AIRTABLE_*` vars. Test with `curl http://localhost:5001/api/airtable/check` (while app is running).

**Only Airtable in .env today**

You likely use content features only. Add Supabase (Path A2 migration) and Firebase (if login is needed) before running latest code.
