/** Best-effort message from a failed JSON API response body. */
export function parseHttpErrorJsonDetail(status: number, errText: string): string {
  let detail = `Request failed (${status})`;
  const raw = (errText || "").trim();
  // Hosting/proxy can return HTML (e.g. Google 502 page). Don't surface the whole document.
  if (raw.startsWith("<!DOCTYPE html") || raw.toLowerCase().startsWith("<html")) {
    const title = raw.match(/<title>\s*([^<]+?)\s*<\/title>/i)?.[1]?.trim();
    return title ? `${title} (HTTP ${status})` : `Upstream gateway error (HTTP ${status}). Please retry.`;
  }
  try {
    const j = JSON.parse(raw) as { error?: unknown; message?: string };
    if (typeof j.error === "string" && j.error) detail = j.error;
    else if (j.error && typeof j.error === "object" && j.error !== null && "message" in j.error) {
      detail = String((j.error as { message?: string }).message || detail);
    } else if (typeof j.message === "string" && j.message) detail = j.message;
  } catch {
    if (raw) detail = raw.slice(0, 400);
  }
  return detail;
}
