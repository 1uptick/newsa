/**
 * Default display name from email: use the part before @ with first letter capitalized.
 * e.g. support@1uptick.com → "Support"
 */
export function getDefaultDisplayName(email: string | null | undefined): string {
  if (!email || !email.includes("@")) return "";
  const prefix = email.split("@")[0].trim();
  if (!prefix) return "";
  return prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase();
}
