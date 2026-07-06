/**
 * Top menu configuration.
 * Admin sees all items; items with `children` are group dropdowns.
 * Each group's children become the main menu for that user group.
 */

export type MenuLink = {
  label: string;
  to: string;
  showAtTopLevel?: boolean;
  /** Hidden from client group nav; still shown in admin dropdown. */
  adminOnly?: boolean;
  /** Hidden in production builds (`import.meta.env.PROD`). */
  hideInProduction?: boolean;
  /** Hidden from group nav (real clients + admin “View as”); still in admin group dropdown. */
  hideFromGroupNav?: boolean;
};

export type MenuGroupItem = {
  groupId: string;
  label: string;
  children: MenuLink[];
  /** If set, only these admin emails see this group in the admin top menu and "View as". */
  restrictedToAdminEmails?: string[];
};

export type MenuItem = { label: string; to: string } | MenuGroupItem;

/** Only this admin email sees the 1uptick menu and view-as entry; others do not. */
export const UPTICK_ADMIN_EMAIL = "support@1uptick.com";

export const UPTICK_GROUP_ID = "1uptick";

export const ATFX_GROUP_ID = "atfx";

/** Known client portal group ids (must match `groupId` on `ADMIN_MENU` group entries). */
export const CLIENT_MENU_GROUP_IDS = [UPTICK_GROUP_ID, ATFX_GROUP_ID, "capital"] as const;

export type ClientMenuGroupId = (typeof CLIENT_MENU_GROUP_IDS)[number];

export function isKnownClientMenuGroup(groupId: string | null | undefined): groupId is ClientMenuGroupId {
  if (!groupId) return false;
  return (CLIENT_MENU_GROUP_IDS as readonly string[]).includes(groupId);
}

/** Admin “view as” group, or the signed-in client group, or `"admin"` for full admin menu. */
export function getEffectiveMenuView(
  role: string | null,
  groupName: string | null,
  viewAs: string | null
): string {
  const isAdmin = role === "admin";
  if (isAdmin && viewAs && viewAs !== "admin") return viewAs;
  if (isAdmin) return "admin";
  return groupNameToId(groupName) ?? "";
}

function isMenuGroup(item: MenuItem): item is MenuGroupItem {
  return "groupId" in item;
}

/** Admin menu: top-level items. Those with children are "user groups". */
export const ADMIN_MENU: MenuItem[] = [
  { label: "News", to: "/news" },
  { label: "Topics for Capital", to: "/capital/keywords" },
  {
    groupId: "capital",
    label: "Capital",
    children: [
      { label: "Dashboard", to: "/capital/dashboard" },
      { label: "Topics", to: "/capital/approval" },
      { label: "Articles", to: "/capital" },
    ],
  },
  {
    groupId: UPTICK_GROUP_ID,
    label: "1uptick",
    restrictedToAdminEmails: [UPTICK_ADMIN_EMAIL],
    children: [
      { label: "Topics", to: "/1uptick/topics" },
      { label: "Twitt", to: "/1uptick/twitt" },
      { label: "Articles", to: "/1uptick/articles" },
      { label: "SEO Article", to: "/1uptick/seo" },
      { label: "TradingView", to: "/1uptick/trading-view", adminOnly: true },
    ],
  },
  {
    groupId: ATFX_GROUP_ID,
    label: "ATFX",
    children: [
      { label: "Dashboard", to: "/atfx/dashboard" },
      { label: "Topics", to: "/atfx/approval", hideInProduction: true, hideFromGroupNav: true },
      { label: "Articles", to: "/atfx", hideInProduction: true, hideFromGroupNav: true },
      { label: "Markets", to: "/atfx/markets" },
      { label: "Research Article", to: "/atfx/research-report" },
    ],
  },
];

function adminMaySeeGroup(group: MenuGroupItem, adminEmail: string | null | undefined): boolean {
  if (!group.restrictedToAdminEmails?.length) return true;
  const normalized = adminEmail?.trim().toLowerCase() ?? "";
  if (!normalized) return false;
  return group.restrictedToAdminEmails.some((e) => e.trim().toLowerCase() === normalized);
}

export function isProductionApp(): boolean {
  return import.meta.env.PROD;
}

export function filterMenuLinksForEnvironment(links: MenuLink[]): MenuLink[] {
  if (!isProductionApp()) return links;
  return links.filter((link) => !link.hideInProduction);
}

function withEnvironmentMenuFilters(items: MenuItem[]): MenuItem[] {
  return items.map((item) => {
    if (isMenuGroup(item)) {
      return { ...item, children: filterMenuLinksForEnvironment(item.children) };
    }
    return item;
  });
}

/** Admin navbar + view-as: items this admin is allowed to see. */
export function getAdminMenuForUser(adminEmail: string | null | undefined): MenuItem[] {
  const filtered = ADMIN_MENU.filter((item) => (isMenuGroup(item) ? adminMaySeeGroup(item, adminEmail) : true));
  return withEnvironmentMenuFilters(filtered);
}

/** Top-level links pulled from group menus (e.g. Keywords). Shown in admin menu after News. */
export function getAdminTopLevelGroupLinks(adminEmail?: string | null): MenuLink[] {
  return getAdminMenuForUser(adminEmail).filter(isMenuGroup).flatMap((item) => item.children.filter((c) => c.showAtTopLevel));
}

/** Group IDs for "View as" (respects `restrictedToAdminEmails`). */
export function getMenuGroupIdsForAdminViewAs(adminEmail: string | null | undefined): { id: string; label: string }[] {
  return getAdminMenuForUser(adminEmail).filter(isMenuGroup).map((item) => ({ id: item.groupId, label: item.label }));
}

/** Group IDs derived from full admin menu (not filtered by email). */
export const MENU_GROUP_IDS = ADMIN_MENU.filter(isMenuGroup).map((item) => ({ id: item.groupId, label: item.label }));

/** Get the main menu links for a user group by groupId (e.g. "capital"). */
export function getGroupMenuItems(groupId: string): MenuLink[] {
  const group = ADMIN_MENU.find((item) => isMenuGroup(item) && item.groupId === groupId);
  const children = group && isMenuGroup(group) ? group.children : [];
  return filterMenuLinksForEnvironment(children).filter((link) => !link.hideFromGroupNav);
}

/** Normalize group name from API (e.g. "Capital") to groupId ("capital"). */
export function groupNameToId(groupName: string | null): string | null {
  if (!groupName) return null;
  return groupName.toLowerCase().trim();
}

/** Default landing path after login: first menu item for the user's group (or admin first item). */
export function getDefaultLandingPath(role: string | null, groupName: string | null): string {
  if (role === "admin") {
    const first = ADMIN_MENU[0];
    if (first && "to" in first) return first.to;
    return "/news";
  }
  const groupId = groupNameToId(groupName);
  if (!groupId) return "/";
  const items = getGroupMenuItems(groupId);
  if (items.length > 0) return items[0].to;
  return "/";
}
