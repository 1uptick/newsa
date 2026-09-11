# DNS cutover (kongstocks.com → 72.62.194.142)

Do this only after staging looks correct and `scripts/promote.sh` has been run.

1. Point `staging.kongstocks.com` A record to `72.62.194.142` (can be done first; does not affect the live WordPress site).
2. Issue certs:
   `certbot --nginx -d staging.kongstocks.com`
   then enable `deploy/nginx/staging.kongstocks.com.conf`.
3. After promote + content import, lower TTL on `kongstocks.com` / `www`.
4. Change A/AAAA for `kongstocks.com` and `www.kongstocks.com` to `72.62.194.142`.
5. `certbot --nginx -d kongstocks.com -d www.kongstocks.com`
6. Enable `deploy/nginx/kongstocks.com.conf` and reload nginx.
7. Keep WordPress on `147.93.83.46` read-only for two weeks as fallback.

The VPS nginx configs are already in this repo. Do not flip production DNS until the new homepage and article URLs have been checked on staging.
