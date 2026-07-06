# Security audit notes

Findings from checking production-facing APIs and config. Address these in production.

---

## 1. API exposure and auth

### Fixed in this pass

- **`GET /api/airtable/check`** — Was unauthenticated and returned `baseId`, `tableId`, and record count. **Change:** Now protected with `authenticateToken` + `requireAdmin`. Only admins can call it.
- **`GET /api/smtp/status`** — Was unauthenticated and could reveal SMTP configured/verified status and error details. **Change:** Now protected with `authenticateToken` + `requireAdmin`. Only admins can call it.

### Intentionally public (no auth)

- **`GET /api/ping`** — Returns `{ pong: true }`. Safe for health checks and load balancers; no secrets.
- **`GET /api/auth/status`** — Returns Firebase Admin readiness. Needed for login flow; no secrets.
- **`POST /api/auth/verify-invitation`**, **`/api/auth/use-invitation`**, **`/api/auth/forgot-password`**, **`/api/auth/reset-password`** — Auth flows; no token required by design. All are rate-limited where applicable.

### Protected (auth and/or admin)

- All other `/api/*` routes use `authenticateToken`. Admin-only routes also use `requireAdmin` (e.g. `/api/admin/*`, `/api/airtable/check`, `/api/smtp/status`, capital sync, cache management).

---

## 2. Recommendations

1. **Environment variables**  
   Never commit `.env` or put secrets in client bundles. Ensure production uses env vars (e.g. Cloud Run/Firebase env config) and that `VITE_*` is the only prefix exposed to the client.

2. **Rate limiting**  
   Auth endpoints use limiters; consider adding a general rate limit for `/api` to reduce abuse (e.g. brute force, scraping).

3. **CORS**  
   If the app is served from a different origin than the API, configure CORS explicitly for that origin instead of allowing all.

4. **Sensitive endpoints**  
   If you add more “status” or “check” endpoints that expose config or infrastructure details, protect them with `authenticateToken` and `requireAdmin` (or equivalent) before deploying to production.

---

## 3. Quick reference

| Endpoint                 | Auth        | Notes                    |
|--------------------------|------------|---------------------------|
| `GET /api/ping`          | None       | Health check only         |
| `GET /api/auth/status`   | None       | Firebase readiness        |
| `GET /api/airtable/check`| Admin only | Was public; now fixed     |
| `GET /api/smtp/status`   | Admin only | Was public; now fixed     |
| All other `/api/*`       | Token ± Admin | Per-route middleware |
