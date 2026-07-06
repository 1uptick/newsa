# Deploying Newsa (Firebase Hosting + Cloud Functions)

The app uses **Supabase** for backend data and **Firebase Cloud Functions** for the API. No Render or gcloud needed.

## 1. Run the Supabase schema

In [Supabase Dashboard](https://supabase.com/dashboard) → **SQL Editor**, run the contents of `supabase/schema.sql`.

If the database already had `capital_articles` before portal content editing was added, also run `supabase/alter_capital_articles_portal_content.sql` once so inline images are not wiped by Airtable sync.

## 2. Set Firebase Functions environment variables

**Firebase project must be on the Blaze (pay-as-you-go) plan** for Cloud Functions.

In [Firebase Console](https://console.firebase.google.com) → **Functions** → select the `api` function → **Configuration** → **Environment variables**, add:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `FIREBASE_SERVICE_ACCOUNT` | Full JSON content of your Firebase Admin key file |
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` | `admin@newsa.io` |
| `SMTP_PASS` | Your SMTP password |
| `SMTP_FROM` | `Newsa <admin@newsa.io>` |
| `APP_BASE_URL` | `https://portal.newsa.io` (or your domain) |
| `AIRTABLE_API_KEY` | Your Airtable key |
| `AIRTABLE_BASE_ID` | Your Airtable base ID |
| `AIRTABLE_TABLE_ID` | Your Airtable table ID |
| `AIRTABLE_CAPITAL_TABLE_ID` | Your Capital table ID |
| `REQUESTY_API_KEY` | Requesty AI key for LLM routes (SEO topics, ATFX articles, Twitt). |
| `N8N_APPROVE_WEBHOOK_USER` | Basic Auth user for the n8n **Webhook** node (same as local `.env` if the node has “Authentication” enabled) |
| `N8N_APPROVE_WEBHOOK_PASSWORD` | Basic Auth password for that webhook |

`N8N_APPROVE_WEBHOOK_URL` is optional in code (a default URL is used). If your workflow uses Basic Auth — you will see **401 Authorization is required** from n8n until `USER` and `PASSWORD` are set here.

## 3. Deploy

```bash
npm run build
firebase deploy
```

This deploys:
- **Hosting** (frontend from `dist/`)
- **Functions** (`api` — handles `/api/*`)

Hosting rewrites `/api/**` to the Cloud Function, so the frontend and API are served from the same origin (e.g. `https://portal.newsa.io`). No `VITE_API_BASE_URL` needed.

## 4. Custom domain

In Firebase Console → **Hosting** → **Add custom domain**, add `portal.newsa.io` and update DNS as instructed.

---

**Local dev:** `npm run dev` runs the full server (API + Vite) at `http://localhost:5001`.
