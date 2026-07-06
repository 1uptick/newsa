import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { LogOut, ChevronDown, Shield, Settings, User, Eye, Menu, X, Sparkles } from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import {
  getAdminMenuForUser,
  getAdminTopLevelGroupLinks,
  getMenuGroupIdsForAdminViewAs,
  getGroupMenuItems,
  groupNameToId,
  getEffectiveMenuView,
  ATFX_GROUP_ID,
} from "../config/menu";
import { getDefaultAvatarUrl, getDefaultAvatarUrlJpg } from "../lib/getDefaultAvatarUrl";
import { getDefaultDisplayName } from "../lib/getDefaultDisplayName";
import { warmAtfxNavLink } from "../lib/atfxNavPrefetch";
import { BrokerageTokenUsageBox } from "./brokerage/BrokerageTokenUsageBox";
import { NavbarBackendStatus } from "./NavbarBackendStatus";
import { useBrokerageTokenBalanceContext } from "../contexts/BrokerageTokenBalanceContext";

export const VIEW_AS_STORAGE_KEY = "newsa_admin_view_as";

// --- Navbar ---
export const Navbar = ({
  user,
  role,
  groupName,
  onLogout,
  viewAs,
  setViewAs,
}: {
  user: FirebaseUser | null;
  role: string | null;
  groupName: string | null;
  onLogout: () => void;
  viewAs: string | null;
  setViewAs: (value: string | null) => void;
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [viewAsOpen, setViewAsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openNavGroup, setOpenNavGroup] = useState<string | null>(null);
  const [avatarFallback, setAvatarFallback] = useState(0);
  const profileRef = useRef<HTMLDivElement>(null);
  const viewAsRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const navGroupRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const navGroupCloseTimer = useRef<number | null>(null);
  const defaultAvatarPng = getDefaultAvatarUrl(role, groupName);
  const defaultAvatarJpg = getDefaultAvatarUrlJpg(role, groupName);
  const hasDefaultAvatar = defaultAvatarPng || defaultAvatarJpg;
  const showAvatarImg = Boolean(user?.photoURL || (hasDefaultAvatar && avatarFallback < 2));
  const avatarSrc =
    user?.photoURL ||
    (avatarFallback === 0 ? (defaultAvatarPng ?? defaultAvatarJpg) : defaultAvatarJpg ?? defaultAvatarPng);

  // Effective menu: admins see full menu (or “view as” preview); clients see only their group links.
  const isAdmin = role === "admin";
  const effectiveView = getEffectiveMenuView(role, groupName, viewAs);
  const isAdminMenu = isAdmin && effectiveView === "admin";
  const { balance: tokenBalance, loading: tokenBalanceLoading } = useBrokerageTokenBalanceContext();
  const showAtfxTokenBar = effectiveView === ATFX_GROUP_ID;

  const groupMenuItems = isAdminMenu ? [] : getGroupMenuItems(effectiveView);
  const groupNavLinksForClientBar = groupMenuItems.filter((link) => !link.adminOnly || isAdmin);
  /** Profile “Guide tour”: real Capital-group clients, plus admins previewing as Capital. */
  const showCapitalGuideTour =
    groupNameToId(groupName) === "capital" || (isAdmin && viewAs === "capital");
  const showAtfxGuideTour =
    groupNameToId(groupName) === ATFX_GROUP_ID || (isAdmin && viewAs === ATFX_GROUP_ID);
  const showNavbarBackendStatus = effectiveView !== ATFX_GROUP_ID;
  const filteredAdminMenu = getAdminMenuForUser(user?.email);
  const menuGroupIdsForViewAs = getMenuGroupIdsForAdminViewAs(user?.email);
  const articlesNavLinkEnd = (path: string) =>
    path === "/capital" ||
    path === "/atfx" ||
    path === "/1uptick/articles" ||
    path === "/1uptick/seo" ||
    path === "/1uptick/trading-view";

  const clearNavGroupCloseTimer = useCallback(() => {
    if (navGroupCloseTimer.current != null) {
      window.clearTimeout(navGroupCloseTimer.current);
      navGroupCloseTimer.current = null;
    }
  }, []);

  const openNavGroupMenu = useCallback(
    (groupId: string) => {
      clearNavGroupCloseTimer();
      setOpenNavGroup(groupId);
    },
    [clearNavGroupCloseTimer]
  );

  const scheduleNavGroupClose = useCallback(() => {
    clearNavGroupCloseTimer();
    navGroupCloseTimer.current = window.setTimeout(() => {
      setOpenNavGroup(null);
      navGroupCloseTimer.current = null;
    }, 160);
  }, [clearNavGroupCloseTimer]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
      if (viewAsRef.current && !viewAsRef.current.contains(target)) setViewAsOpen(false);
      if (openNavGroup) {
        let insideNavGroup = false;
        for (const node of navGroupRefs.current.values()) {
          if (node.contains(target)) {
            insideNavGroup = true;
            break;
          }
        }
        if (!insideNavGroup) setOpenNavGroup(null);
      }
      if (
        mobileMenuOpen &&
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(target) &&
        !hamburgerRef.current?.contains(target)
      ) {
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mobileMenuOpen, openNavGroup]);

  useEffect(() => {
    setAvatarFallback(0);
  }, [user?.photoURL, role, groupName]);

  useEffect(() => {
    setOpenNavGroup(null);
  }, [location.pathname]);

  useEffect(() => () => clearNavGroupCloseTimer(), [clearNavGroupCloseTimer]);

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  return (
    <nav
      className={`sticky top-0 bg-black border-b border-white/10 overflow-visible ${
        mobileMenuOpen ? "z-[110]" : "z-[100]"
      }`}
    >
      <div className="relative w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center gap-2 min-w-0">
          <div className="flex items-center gap-4 lg:gap-6 min-w-0 flex-1">
            <Link to="/" className="flex items-center shrink-0">
              <img
                src="/newsa%20app%20logo.webp"
                alt="Newsa.io"
                className="h-10 w-auto object-contain"
                width={120}
                height={40}
              />
            </Link>

            <div className="hidden md:flex items-center gap-5 lg:gap-6 text-sm font-medium min-w-0">
              {isAdminMenu ? (
                <>
                  {filteredAdminMenu.filter((item): item is { label: string; to: string } => "to" in item).map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/" ? true : undefined}
                      className={({ isActive }) =>
                        `whitespace-nowrap transition-colors ${
                          isActive ? "text-primary font-semibold" : "text-white hover:text-primary"
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                  {getAdminTopLevelGroupLinks(user?.email).map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      className={({ isActive }) =>
                        `whitespace-nowrap transition-colors ${
                          isActive ? "text-primary font-semibold" : "text-white hover:text-primary"
                        }`
                      }
                    >
                      {link.label}
                    </NavLink>
                  ))}
                  {filteredAdminMenu.filter(
                    (item): item is { groupId: string; label: string; children: { label: string; to: string; showAtTopLevel?: boolean }[] } =>
                      "groupId" in item && "children" in item
                  ).map((item) => {
                    const dropdownChildren = item.children.filter((c) => !c.showAtTopLevel);
                    const groupActive = item.children.some(
                      (c) =>
                        location.pathname === c.to ||
                        (c.to !== "/" && location.pathname.startsWith(c.to + "/"))
                    );
                    const menuOpen = openNavGroup === item.groupId;
                    return (
                      <div
                        key={item.groupId}
                        ref={(node) => {
                          if (node) navGroupRefs.current.set(item.groupId, node);
                          else navGroupRefs.current.delete(item.groupId);
                        }}
                        className="relative shrink-0"
                        onMouseEnter={() => openNavGroupMenu(item.groupId)}
                        onMouseLeave={scheduleNavGroupClose}
                      >
                        <button
                          type="button"
                          aria-expanded={menuOpen}
                          aria-haspopup="true"
                          onClick={() => setOpenNavGroup((current) => (current === item.groupId ? null : item.groupId))}
                          className={`inline-flex items-center gap-1 whitespace-nowrap transition-colors ${
                            groupActive ? "text-primary font-semibold" : "text-white hover:text-primary"
                          }`}
                        >
                          {item.label}
                          <ChevronDown
                            className={`w-4 h-4 opacity-80 transition-transform ${menuOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                        {menuOpen ? (
                          <div className="absolute left-0 top-full pt-1 z-[100]">
                            <div className="py-2 min-w-[11rem] rounded-lg bg-slate-900 border border-white/10 shadow-xl">
                              {dropdownChildren.map((child) => (
                                <NavLink
                                  key={child.to}
                                  to={child.to}
                                  end={articlesNavLinkEnd(child.to)}
                                  onMouseEnter={warmAtfxNavLink(child.to)}
                                  onFocus={warmAtfxNavLink(child.to)}
                                  onClick={() => setOpenNavGroup(null)}
                                  className={({ isActive }) =>
                                    `block px-4 py-2.5 text-sm transition-colors ${
                                      isActive
                                        ? "text-primary font-semibold bg-white/5"
                                        : "text-white hover:bg-white/10"
                                    }`
                                  }
                                >
                                  {child.label}
                                </NavLink>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  {groupNavLinksForClientBar.length > 0 ? (
                    groupNavLinksForClientBar.map((link) => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        end={articlesNavLinkEnd(link.to)}
                        onMouseEnter={warmAtfxNavLink(link.to)}
                        onFocus={warmAtfxNavLink(link.to)}
                        className={({ isActive }) =>
                          `whitespace-nowrap px-1 py-1.5 transition-colors ${
                            isActive ? "text-primary font-semibold" : "text-white hover:text-primary"
                          }`
                        }
                      >
                        {link.label}
                      </NavLink>
                    ))
                  ) : (
                    <NavLink
                      to="/"
                      className={({ isActive }) =>
                        `whitespace-nowrap px-1 py-1.5 transition-colors ${
                          isActive ? "text-primary font-semibold" : "text-white hover:text-primary"
                        }`
                      }
                    >
                      Dashboard
                    </NavLink>
                  )}
                </>
              )}
            </div>
          </div>

          {showNavbarBackendStatus ? <NavbarBackendStatus /> : null}

          <div className="flex items-center gap-2 sm:gap-4 shrink-0 min-w-0">
            <button
              ref={hamburgerRef}
              type="button"
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="md:hidden flex items-center justify-center p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              aria-expanded={mobileMenuOpen}
              aria-label="Open menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            {showAtfxTokenBar ? (
              <BrokerageTokenUsageBox
                balance={tokenBalance}
                loading={tokenBalanceLoading}
                compact
                theme="navbar"
                className="hidden md:inline-flex"
              />
            ) : null}
            {isAdmin && (
              <div className="relative hidden md:block" ref={viewAsRef}>
                <button
                  type="button"
                  onClick={() => setViewAsOpen((o) => !o)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors border border-white/10"
                  aria-expanded={viewAsOpen}
                  aria-haspopup="true"
                  aria-label="Switch menu view"
                >
                  <Eye className="w-4 h-4 shrink-0" />
                  <span>
                    View as: {viewAs === "admin" || !viewAs ? "Admin" : menuGroupIdsForViewAs.find((g) => g.id === viewAs)?.label ?? viewAs}
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${viewAsOpen ? "rotate-180" : ""}`} />
                </button>
                {viewAsOpen && (
                  <div className="absolute right-0 top-full mt-1 py-2 min-w-[10rem] rounded-lg bg-slate-900 border border-white/10 shadow-xl z-50">
                    <button
                      type="button"
                      onClick={() => {
                        setViewAs("admin");
                        setViewAsOpen(false);
                      }}
                      className={`block w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        effectiveView === "admin"
                          ? "text-primary font-semibold bg-white/5"
                          : "text-white hover:bg-white/10"
                      }`}
                    >
                      Admin
                    </button>
                    {menuGroupIdsForViewAs.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          setViewAs(g.id);
                          setViewAsOpen(false);
                        }}
                        className={`block w-full text-left px-4 py-2.5 text-sm transition-colors ${
                          effectiveView === g.id ? "text-primary font-semibold bg-white/5" : "text-white hover:bg-white/10"
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="h-6 w-px bg-slate-600 hidden md:block" />
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((o) => !o)}
                className="flex items-center gap-2 p-2 pr-2.5 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition-all outline-none focus:ring-2 focus:ring-primary/50"
                aria-expanded={profileOpen}
                aria-haspopup="true"
                aria-label="Profile menu"
              >
                <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
                  {showAvatarImg && avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt=""
                      className="w-full h-full object-cover"
                      width={36}
                      height={36}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarFallback((f) => (f < 2 ? f + 1 : 2))}
                    />
                  ) : (
                    <User className="w-5 h-5" />
                  )}
                </div>
                <span className="text-xs font-semibold text-white leading-tight hidden sm:block">
                  {getDefaultDisplayName(user?.email) || "User"}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 transition-transform hidden sm:block ${
                    profileOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-full mt-1 py-2 min-w-[16rem] rounded-lg bg-slate-900 border border-white/10 shadow-xl z-50">
                  <NavLink
                    to="/settings"
                    onClick={() => setProfileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-4 py-2.5 text-sm whitespace-nowrap transition-colors ${
                        isActive
                          ? "text-primary font-semibold bg-white/5"
                          : "text-white hover:bg-white/10"
                      }`
                    }
                  >
                    <Settings className="w-4 h-4 shrink-0" />
                    Settings
                  </NavLink>
                  {showCapitalGuideTour && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        navigate("/capital/dashboard?capitaltour");
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm whitespace-nowrap text-slate-300 hover:bg-white/10 hover:text-white transition-colors text-left"
                    >
                      <Sparkles className="w-4 h-4 shrink-0 text-primary" />
                      Guide tour
                    </button>
                  )}
                  {showAtfxGuideTour && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        navigate("/atfx/approval?atfxtour");
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm whitespace-nowrap text-slate-300 hover:bg-white/10 hover:text-white transition-colors text-left"
                    >
                      <Sparkles className="w-4 h-4 shrink-0 text-primary" />
                      Guide tour (ATFX Topics)
                    </button>
                  )}
                  {role === "admin" && (
                    <NavLink
                      to="/admin"
                      onClick={() => setProfileOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-4 py-2.5 text-sm whitespace-nowrap transition-colors ${
                          isActive
                            ? "text-primary font-semibold bg-white/5"
                            : "text-white hover:bg-white/10"
                        }`
                      }
                    >
                      <Shield className="w-4 h-4 shrink-0" />
                      Admin Panel
                    </NavLink>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onLogout();
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm whitespace-nowrap text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed top-16 left-0 right-0 bottom-0 z-0 bg-black/30 backdrop-blur-sm md:hidden"
              aria-label="Close menu"
              onClick={closeMobileMenu}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              ref={mobileMenuRef}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="md:hidden absolute left-0 right-0 top-16 z-10 border-t border-white/10 bg-black overflow-hidden"
            >
            <div className="py-4 px-4 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <div className="flex flex-col gap-1 text-sm font-medium">
              {isAdminMenu ? (
                <>
                  {filteredAdminMenu.filter((item): item is { label: string; to: string } => "to" in item).map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/" ? true : undefined}
                      onClick={closeMobileMenu}
                      className={({ isActive }) =>
                        `block px-4 py-3 rounded-lg transition-colors ${
                          isActive ? "text-primary font-semibold bg-white/10" : "text-white hover:bg-white/10"
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                  {getAdminTopLevelGroupLinks(user?.email).map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      onClick={closeMobileMenu}
                      className={({ isActive }) =>
                        `block px-4 py-3 rounded-lg transition-colors ${
                          isActive ? "text-primary font-semibold bg-white/10" : "text-white hover:bg-white/10"
                        }`
                      }
                    >
                      {link.label}
                    </NavLink>
                  ))}
                  {filteredAdminMenu.filter(
                    (item): item is { groupId: string; label: string; children: { label: string; to: string; showAtTopLevel?: boolean }[] } =>
                      "groupId" in item && "children" in item
                  ).map((item) => {
                    const dropdownChildren = item.children.filter((c) => !c.showAtTopLevel);
                    return (
                      <div key={item.groupId} className="pt-2">
                        <span className="block px-4 py-2 text-slate-400 text-xs font-semibold uppercase tracking-wide">
                          {item.label}
                        </span>
                        {dropdownChildren.map((child) => (
                          <NavLink
                            key={child.to}
                            to={child.to}
                            end={articlesNavLinkEnd(child.to)}
                            onMouseEnter={warmAtfxNavLink(child.to)}
                            onFocus={warmAtfxNavLink(child.to)}
                            onClick={closeMobileMenu}
                            className={({ isActive }) =>
                              `block px-4 py-2.5 rounded-lg transition-colors ${
                                isActive ? "text-primary font-semibold bg-white/10" : "text-white hover:bg-white/10"
                              }`
                            }
                          >
                            {child.label}
                          </NavLink>
                        ))}
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  {groupNavLinksForClientBar.length > 0 ? (
                    groupNavLinksForClientBar.map((link) => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        end={articlesNavLinkEnd(link.to)}
                        onMouseEnter={warmAtfxNavLink(link.to)}
                        onFocus={warmAtfxNavLink(link.to)}
                        onClick={closeMobileMenu}
                        className={({ isActive }) =>
                          `block px-4 py-3 rounded-lg transition-colors ${
                            isActive ? "text-primary font-semibold bg-white/10" : "text-white hover:bg-white/10"
                          }`
                        }
                      >
                        {link.label}
                      </NavLink>
                    ))
                  ) : (
                    <NavLink
                      to="/"
                      onClick={closeMobileMenu}
                      className={({ isActive }) =>
                        `block px-4 py-3 rounded-lg transition-colors ${
                          isActive ? "text-primary font-semibold bg-white/10" : "text-white hover:bg-white/10"
                        }`
                      }
                    >
                      Dashboard
                    </NavLink>
                  )}
                </>
              )}
            </div>
            {isAdmin && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <span className="block px-4 py-2 text-slate-400 text-xs font-semibold uppercase tracking-wide">
                  View as
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setViewAs("admin");
                    setViewAsOpen(false);
                    closeMobileMenu();
                  }}
                  className={`block w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors ${
                    effectiveView === "admin" ? "text-primary font-semibold bg-white/10" : "text-white hover:bg-white/10"
                  }`}
                >
                  Admin
                </button>
                {menuGroupIdsForViewAs.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setViewAs(g.id);
                      setViewAsOpen(false);
                      closeMobileMenu();
                    }}
                    className={`block w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors ${
                      effectiveView === g.id ? "text-primary font-semibold bg-white/10" : "text-white hover:bg-white/10"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            )}
            </div>
          </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
};
