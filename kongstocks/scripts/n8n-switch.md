# Switch n8n from WordPress REST to Payload

WordPress currently accepts Application Passwords at `https://kongstocks.com/wp-json/`. Replace those HTTP Request nodes with:

- Method: `POST`
- URL: `https://staging.kongstocks.com/api/n8n/posts` (staging) or `https://kongstocks.com/api/n8n/posts` (after cutover)
- Header: `Authorization: Bearer <PAYLOAD_API_KEY>`
- Body JSON:

```json
{
  "title": "{{ $json.title }}",
  "slug": "{{ $json.slug }}",
  "excerpt": "{{ $json.excerpt }}",
  "bodyHtml": "{{ $json.content }}",
  "publishedAt": "{{ $json.date }}",
  "categorySlugs": ["hk"]
}
```

The API key lives on the VPS in `/opt/kongstocks/deploy/.env.staging` and `.env.prod` as `PAYLOAD_API_KEY`.

## Workflows that still post to WordPress

Leave these **active on WordPress** until `kongstocks.com` DNS is cut over. Switching them now would stop the live site from getting new articles.

| Workflow | n8n id | Current target |
|---|---|---|
| `kong  - aistock pick posting` | `LuLj66TjDXRTylOfwqznZ` | WordPress node + `POST /wp-json/wp/v2/posts/{id}` |
| `Kong HSI end-day` | `HCPl8C0JRPkb_y_9p5k5W` | WordPress node + `POST /wp-json/wp/v2/media` |

After cutover, replace those WordPress / `wp-json` nodes with the Payload ingest above. Keep the old nodes disabled (do not delete) for rollback.

Media uploads (`/wp-json/wp/v2/media`) need a follow-up: post `bodyHtml` with existing `https://kongstocks.com/wp-content/uploads/...` URLs until media is copied to the VPS.

Keep the WordPress n8n nodes disabled (do not delete) until the new site is live, so you can roll back publishing.
