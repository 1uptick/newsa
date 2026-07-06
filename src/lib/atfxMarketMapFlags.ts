export function normalizeCountryCode(country: string): string {
  const raw = (country || "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  const code = upper === "UK" ? "GB" : upper;
  if (/^[A-Z]{2}$/.test(code)) return code;
  return "";
}

export function getFlagImageUrl(country: string, width = 24): string {
  const code = normalizeCountryCode(country);
  if (!code) return "";
  return `https://flagcdn.com/w${width}/${code.toLowerCase()}.png`;
}
