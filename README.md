# Newsa Portal

React + Express app for financial content and market intelligence. Backend data lives in **Supabase**; auth in **Firebase**; news content in **Airtable**.

## Quick start (local staging against live DB)

```bash
npm install
cp .env.staging.example .env.staging   # fill with production credentials
npm run dev:staging
```

Open http://localhost:5001. See [STAGING.md](./STAGING.md) for the full migration guide from VPS staging.

## Other commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Local dev using `.env` |
| `npm run build` | Build SPA to `dist/` |
| `npm start` | Production server (SPA + API) |
| `npm run security-check` | Check for secret exposure in client code |

## Documentation

- [STAGING.md](./STAGING.md) — local staging with live database
- [DEPLOY.md](./DEPLOY.md) — production VPS deployment
- [DOMAIN-SETUP.md](./DOMAIN-SETUP.md) — `portal.newsa.io` and Firebase domains
- [SECURITY.md](./SECURITY.md) — secret handling
