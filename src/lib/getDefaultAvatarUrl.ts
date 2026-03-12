/**
 * Default profile images are in public/profile/ (WebP format).
 * - Admin: use "newsa logo" (newsa logo.webp)
 * - Other groups: use image file with same name as group (e.g. capital → profile/capital.webp)
 */
function getGroupSlug(groupName: string | null): string | null {
  if (!groupName || !groupName.trim()) return null;
  const slug = groupName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return slug || null;
}

export function getDefaultAvatarUrl(
  role: string | null,
  groupName: string | null
): string | null {
  if (role === "admin") {
    return "/profile/newsa%20logo.webp";
  }
  const slug = getGroupSlug(groupName);
  if (slug) return `/profile/${slug}.webp`;
  return null;
}

/** Fallback URL for group default avatar (same as default; kept for API compatibility). */
export function getDefaultAvatarUrlJpg(
  role: string | null,
  groupName: string | null
): string | null {
  return getDefaultAvatarUrl(role, groupName);
}
