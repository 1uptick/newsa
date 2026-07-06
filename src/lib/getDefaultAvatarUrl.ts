/**
 * Default profile images are in public/profile/.
 * - Admin: use "newsa logo" (newsa logo.webp)
 * - ATFX group: profile/atfx.jpg
 * - Other groups: profile/{slug}.webp (slug from group name, e.g. capital → capital.webp)
 */
import { ATFX_GROUP_ID, groupNameToId } from "../config/menu";

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
  if (groupNameToId(groupName) === ATFX_GROUP_ID) {
    return "/profile/atfx.jpg";
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
