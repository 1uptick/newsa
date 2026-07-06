/**
 * n8n Webhook node auth: standard Basic Auth plus a `Credential: user:password` header
 * for workflows that read a custom header instead of Authorization.
 */
export function appendN8nCredentialHeaders(
  headers: Record<string, string>,
  user: string,
  password: string
): void {
  const u = user?.trim() ?? "";
  const p = password ?? "";
  if (!u || !p) return;
  headers.Authorization = `Basic ${Buffer.from(`${u}:${p}`, "utf8").toString("base64")}`;
  headers.Credential = `${u}:${p}`;
}
