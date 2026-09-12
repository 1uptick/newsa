# Local staging (live database)

Staging runs **on your machine** and connects to the **same Supabase, Firebase, and Airtable** as production (`portal.newsa.io`). Production stays on the VPS.

| Environment | Where it runs | Database / services |
|-------------|---------------|---------------------|
| **Production** | VPS (`portal.newsa.io`) | Live Supabase, Firebase, Airtable |
| **Staging** | Local (`http://localhost:5001`) | **Same live** Supabase, Firebase, Airtable |
| **Local dev (optional)** | Local with `.env` | Your choice (can use separate sandbox projects) |

---

## Migration checklist (VPS staging → local staging)

### 1. Copy production secrets to your laptop

On the VPS (or from your password manager), copy the production `.env` values into a new local file:

```bash
cp .env.staging.example .env.staging
```

Fill in **production** values for:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_FIREBASE_*`, `FIREBASE_SERVICE_ACCOUNT`
- `AIRTABLE_*`
- `OPENROUTER_API_KEY` (if used)

Keep these staging-specific defaults:

```env
NEW_SA_ENV=staging
APP_BASE_URL=http://localhost:5001
SMTP_DISABLED=true
```

Do **not** set `VITE_API_BASE_URL` — the dev server serves both the SPA and `/api/*` on one port.

### 2. Firebase: allow localhost

1. [Firebase Console](https://console.firebase.google.com/) → project **newsa-ea4dc**
2. **Authentication** → **Settings** → **Authorized domains**
3. Ensure `localhost` is listed (usually added by default)

### 3. Run local staging

```bash
npm install
npm run dev:staging
```

Open **http://localhost:5001**. Log in with your production Firebase account.

You should see in the terminal:

```
Server running on http://localhost:5001 (staging)
STAGING MODE: connected to live Supabase/Airtable/Firebase. Writes affect production data.
```

### 4. Decommission VPS staging

After local staging works:

1. Stop the staging process on the VPS (pm2, systemd, or whatever you used).
2. Remove staging nginx vhost / DNS (e.g. `staging.newsa.io`) if you had one.
3. Keep **only** the production vhost for `portal.newsa.io`.
4. Optionally delete the staging app directory on the VPS to avoid confusion.

Production deploy flow is unchanged — see [DEPLOY.md](./DEPLOY.md).

---

## Safety when using the live database locally

Local staging writes go to **real production data**.

| Action | Effect |
|--------|--------|
| Edit capital articles | Updates live Supabase + may sync to live Airtable |
| Invite / delete users | Changes live `user_roles`, Firebase users |
| SEO topic generation | Creates records in live Airtable |
| Password reset / invitations | Sends real emails **unless** `SMTP_DISABLED=true` |
| Image uploads | Writes to live Supabase Storage (`article-images`) |

**Recommendations:**

- Keep `SMTP_DISABLED=true` unless you are deliberately testing email.
- Coordinate with anyone else using production before destructive tests.
- Use a separate Firebase test account if you need to test registration flows.

---

## Scripts

| Command | Env file | Use case |
|---------|----------|----------|
| `npm run dev` | `.env` | General local development |
| `npm run dev:staging` | `.env.staging` | Local staging against live DB |
| `npm run build && npm start` | host env / `.env` | Production on VPS |

---

## Troubleshooting

**Supabase connection fails**

- Confirm `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` match production exactly.
- Check Supabase project is not paused.

**Firebase login blocked on localhost**

- Add `localhost` under Firebase **Authorized domains**.

**API calls 404 or wrong host**

- Do not set `VITE_API_BASE_URL` for unified local staging.
- Use `http://localhost:5001`, not the production URL.

**Accidentally sent emails**

- Set `SMTP_DISABLED=true` in `.env.staging` and restart the dev server.

**Port already in use**

- Change `PORT=5002` in `.env.staging` and open `http://localhost:5002`.
