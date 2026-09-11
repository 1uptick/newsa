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

Keep the WordPress n8n nodes disabled (do not delete) until the new site is live, so you can roll back publishing.
