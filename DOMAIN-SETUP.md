# Setting up https://portal.newsa.io

Follow these steps so your app and auth work correctly on your custom domain.

---

## 1. Firebase: Authorized domains

Firebase Auth only allows sign-in and redirects on listed domains. Add your portal domain:

1. Open [Firebase Console](https://console.firebase.google.com/) → select project **newsa-ea4dc**.
2. Go to **Authentication** → **Settings** (or **Sign-in method** tab) → **Authorized domains**.
3. Click **Add domain** and enter: `portal.newsa.io`
4. Save.

Without this step, login and password reset will be blocked on portal.newsa.io.

---

## 2. Hosting: Add custom domain

Where you deploy (Vite build → static files + your API) determines how to add the domain.

### Vercel
- Project **Settings** → **Domains** → Add `portal.newsa.io`.
- Add the DNS records Vercel shows (usually a CNAME to `cname.vercel-dns.com` or A records).
- HTTPS is automatic once DNS is correct.

### Netlify
- **Domain management** → **Add custom domain** → `portal.newsa.io`.
- Set DNS: CNAME `portal` → `your-site.netlify.app` (or use Netlify DNS).
- Enable **HTTPS** (Let’s Encrypt).

### Other host (VPS, Cloudflare Pages, etc.)
- Point `portal.newsa.io` to the server (A/CNAME as required).
- Serve the app over HTTPS (e.g. Let’s Encrypt, Cloudflare proxy).

Your app uses relative `/api/...` URLs, so the same origin (portal.newsa.io) will be used for API calls. If your API runs on another subdomain (e.g. `api.newsa.io`), you must allow `https://portal.newsa.io` in that API’s CORS configuration.

---

## 3. Optional: App URL in environment

If you need the public app URL in code (e.g. for emails or redirects), set:

```env
VITE_APP_URL=https://portal.newsa.io
```

Use it in code as `import.meta.env.VITE_APP_URL`. Firebase Auth and your current app logic do not require this for normal login/password reset on portal.newsa.io.

---

## Checklist

- [ ] Add `portal.newsa.io` in Firebase **Authorized domains**.
- [ ] Add `portal.newsa.io` in your hosting provider’s **Domains** and configure DNS.
- [ ] If API is on a different origin: allow `https://portal.newsa.io` in API CORS.
- [ ] (Optional) Set `VITE_APP_URL=https://portal.newsa.io` in production env.
