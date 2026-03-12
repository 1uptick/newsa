# Security

## API and secrets architecture

- **All external APIs and secrets are centralized on the server** in `server/config.ts`. The client never receives API keys, Supabase service role key, OpenRouter, Airtable, SMTP passwords, or Firebase Admin credentials.
- **Client → server only**: The frontend talks to your backend via `/api/*` (e.g. `apiUrl("/api/news")`, `authFetch("/api/capitalkeywords")`). All secret-backed operations (Airtable, Supabase, OpenRouter, email, Firebase Admin) run in `server.ts` and use `server/config.ts`.

## What is allowed on the client

- **`import.meta.env.VITE_*`** only. Vite exposes only variables prefixed with `VITE_` to the client bundle. Used for:
  - `VITE_API_BASE_URL` – optional; backend URL when frontend is hosted separately.
  - `VITE_FIREBASE_*` – Firebase client SDK config (API key, project ID, etc.). These are **public** by design; restrict your Firebase API key by domain in the Firebase Console.

## What must never be exposed to the client

- `AIRTABLE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT` (or path to the JSON key file)
- `SMTP_PASS`, `SMTP_USER`, and any other secrets

Do **not** inject these via `vite.config.ts` `define` or any build step into the client bundle.

## Security check

Run the script to detect accidental exposure of server-only env vars in client code and to ensure `.env` is gitignored:

```bash
npm run security-check
```
(Uses `scripts/security-check.cjs`.)

It checks:

1. No `process.env.*` or non-`VITE_` `import.meta.env.*` in `src/`
2. `.gitignore` includes `.env` (or `.env*`)
3. `vite.config.ts` does not inject server secret names into the client

## Good practices

- Keep `.env` out of version control (use `.env.example` with placeholders only).
- In production, use environment variables or a secrets manager; do not commit `.env`.
- Restrict Firebase API key by authorized domains in Firebase Console.
- Use HTTPS in production; the app uses cookies/headers for auth.
- Admin-only routes are protected by `requireAdmin`; sensitive operations (invitations, user list, etc.) are behind `/api/admin/*` and Firebase ID token verification.
