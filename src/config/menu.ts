/**
 * Top menu configuration.
 * Admin sees all items; items with `children` are group dropdowns.
 * Each group's children become the main menu for that user group.
 */

export type MenuLink = { label: string; to: string; showAtTopLevel?: boolean };

export type MenuItem =
  | { label: string; to: string }
  | { groupId: string; label: string; children: MenuLink[] };

/** Admin menu: top-level items. Those with children are "user groups". */
export const ADMIN_MENU: MenuItem[] = [
  { label: "Dashboard", to: "/" },
  { label: "News", to: "/news" },
  {
    groupId: "capital",
    label: "Capital",
    children: [
      { label: "Keywords", to: "/capital/keywords", showAtTopLevel: true },
      { label: "Pending Approval", to: "/capital/approval" },
      { label: "Articles", to: "/capital" },
    ],
  },
  // Future groups go here, e.g.:
  // { groupId: "other", label: "Other Group", children: [...] },
];

/** Top-level links pulled from group menus (e.g. Keywords). Shown in admin menu after News. */
export function getAdminTopLevelGroupLinks(): MenuLink[] {
  return ADMIN_MENU.filter(
    (item): item is MenuItem & { groupId: string; children: MenuLink[] } =>
      "groupId" in item && "children" in item
  ).flatMap((item) => item.children.filter((c) => c.showAtTopLevel));
}

/** Group IDs derived from admin menu (for view-as switcher and mapping). */
export const MENU_GROUP_IDS = ADMIN_MENU.filter(
  (item): item is MenuItem & { groupId: string; children: MenuLink[] } =>
    "groupId" in item && "children" in item
).map((item) => ({ id: item.groupId, label: item.label }));

/** Get the main menu links for a user group by groupId (e.g. "capital"). */
export function getGroupMenuItems(groupId: string): MenuLink[] {
  const group = ADMIN_MENU.find(
    (item): item is MenuItem & { groupId: string; children: MenuLink[] } =>
      "groupId" in item && item.groupId === groupId
  );
  return group?.children ?? [];
}

/** Normalize group name from API (e.g. "Capital") to groupId ("capital"). */
export function groupNameToId(groupName: string | null): string | null {
  if (!groupName) return null;
  return groupName.toLowerCase().trim();
}
