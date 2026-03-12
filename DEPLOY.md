# Deploying Newsa (Option B: Supabase + Cloud Run)

The app now uses **Supabase** for all backend data (user roles, invitations, groups, password reset tokens). SQLite has been removed.

## 1. Run the Supabase schema

In [Supabase Dashboard](https://supabase.com/dashboard) → **SQL Editor**, run the contents of `supabase/schema.sql`. This creates:

- `groups`
- `user_roles`
- `invitations`
- `password_reset_tokens`
- (and keeps existing `capital_articles`)

## 2. Set environment variables

Ensure these are set where the server runs (local `.env`, Cloud Run, or Render):

- **Required for auth/data:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **Required for Firebase Auth:** `FIREBASE_SERVICE_ACCOUNT` (full JSON string) or path to key file
- **Required for email:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `APP_BASE_URL`
- Plus Airtable, OpenRouter, and VITE_* as in `.env.example`

## 3. Deploy the API (choose one)

### A. Google Cloud Run (works with Firebase Hosting)

1. Install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) and run `gcloud auth login` and `gcloud config set project newsa-ea4dc`.
2. Build and deploy:
   ```bash
   gcloud run deploy newsa-api --source . --region us-central1 --allow-unauthenticated --set-env-vars "NODE_ENV=production"
   ```
   Add all env vars in the Cloud Run console (Variables & Secrets) or via `--set-env-vars "KEY=value"`.
3. Note the Cloud Run URL (e.g. `https://newsa-api-xxxxx-uc.a.run.app`).

### B. Render

1. Connect the GitHub repo at [render.com](https://render.com).
2. New **Web Service** → Build: `npm install && npm run build`, Start: `npm start`.
3. Add all environment variables in the Render dashboard.
4. Set `APP_BASE_URL` to your Render URL (e.g. `https://newsa-api.onrender.com`).

## 4. Point the frontend at the API

- If you use **Firebase Hosting** for the frontend only, set `VITE_API_BASE_URL` to your API URL (Cloud Run or Render) and rebuild:
  ```bash
  VITE_API_BASE_URL=https://your-api-url.run.app npm run build
  firebase deploy
  ```
- Or add Hosting rewrites so `/api` is proxied to Cloud Run (see [Firebase docs](https://firebase.google.com/docs/hosting/cloud-run)).

## 5. Custom domain

Point `portal.newsa.io` (or your domain) to either:

- The Cloud Run / Render URL (if the app serves both SPA and API), or  
- Firebase Hosting (SPA) and set `VITE_API_BASE_URL` to the API URL.

---

**Summary:** Run `supabase/schema.sql` in Supabase, deploy the Node app to Cloud Run or Render with the right env vars, then build the frontend with `VITE_API_BASE_URL` set and deploy to Firebase Hosting (or your host).
