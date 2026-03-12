/** Base URL for API requests. Set VITE_API_BASE_URL in production when the app is hosted separately from the backend. */
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string)?.trim() || "";

export function apiUrl(path: string): string {
  if (!API_BASE) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;
  return `${base}${p}`;
}
