import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
  NavLink,
  useLocation,
} from "react-router-dom";
import { LogOut, Loader2, ChevronDown, Shield, Settings, User, Eye } from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";

import { AuthProvider, useAuth } from "./contexts/AuthContext";
import {
  ADMIN_MENU,
  MENU_GROUP_IDS,
  getAdminTopLevelGroupLinks,
  getGroupMenuItems,
  groupNameToId,
} from "./config/menu";
import { getDefaultAvatarUrl, getDefaultAvatarUrlJpg } from "./lib/getDefaultAvatarUrl";
import { getDefaultDisplayName } from "./lib/getDefaultDisplayName";

// Direct imports for proper code splitting (avoid barrel file)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const CapitalArticlePage = lazy(() => import("./pages/Capital/capitalarticlePages"));
const CapitalKeywordsPage = lazy(() => import("./pages/Capital/capitalkeywords"));
const CapitalApprovalPage = lazy(() => import("./pages/Capital/capitalapproval"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const PasswordResetPage = lazy(() => import("./pages/PasswordResetPage"));
const AdminPanelPage = lazy(() => import("./pages/AdminPanelPage"));
const AdminLayout = lazy(() => import("./pages/AdminLayout"));
const AdminUsersPage = lazy(() => import("./pages/AdminUsersPage"));
const ClientSettingsPage = lazy(() => import("./pages/ClientSettingsPage"));

const PageFallback = () => (
  <div className="min-h-[50vh] flex items-center justify-center">
    <Loader2 className="w-10 h-10 text-primary animate-spin" />
  </div>
);

// --- Protected route: require login
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

// --- Admin-only route
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  if (role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

// --- Guest-only (redirect to app if logged in)
function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }
  if (user) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

const VIEW_AS_STORAGE_KEY = "newsa_admin_view_as";

// --- Navbar ---
const Navbar = ({
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [viewAsOpen, setViewAsOpen] = useState(false);
  const [avatarFallback, setAvatarFallback] = useState(0);
  const profileRef = useRef<HTMLDivElement>(null);
  const viewAsRef = useRef<HTMLDivElement>(null);
  const defaultAvatarPng = getDefaultAvatarUrl(role, groupName);
  const defaultAvatarJpg = getDefaultAvatarUrlJpg(role, groupName);
  const hasDefaultAvatar = defaultAvatarPng || defaultAvatarJpg;
  const showAvatarImg = Boolean(user?.photoURL || (hasDefaultAvatar && avatarFallback < 2));
  const avatarSrc =
    user?.photoURL ||
    (avatarFallback === 0 ? (defaultAvatarPng ?? defaultAvatarJpg) : defaultAvatarJpg ?? defaultAvatarPng);

  // Effective menu view: admin sees full menu unless "view as" a group; clients see their group menu
  const isAdmin = role === "admin";
  const effectiveView: "admin" | string =
    isAdmin && viewAs && viewAs !== "admin" ? viewAs : isAdmin ? "admin" : groupNameToId(groupName) ?? "admin";

  const isAdminMenu = effectiveView === "admin";
  const groupMenuItems = !isAdminMenu ? getGroupMenuItems(effectiveView) : [];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
      if (viewAsRef.current && !viewAsRef.current.contains(target)) setViewAsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setAvatarFallback(0);
  }, [user?.photoURL, role, groupName]);

  return (
    <nav className="sticky top-0 z-50 bg-black border-b border-white/10">
      <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link to="/" className="flex items-center">
            <img
              src="/newsa%20app%20logo.webp"
              alt="Newsa.io"
              className="h-10 w-auto object-contain"
              width={120}
              height={40}
            />
          </Link>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-4 text-sm font-medium">
              {isAdminMenu ? (
                <>
                  {ADMIN_MENU.filter((item): item is { label: string; to: string } => "to" in item).map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/" ? true : undefined}
                      className={({ isActive }) =>
                        `transition-colors ${
                          isActive ? "text-primary font-semibold" : "text-white hover:text-primary"
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                  {getAdminTopLevelGroupLinks().map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      className={({ isActive }) =>
                        `transition-colors ${
                          isActive ? "text-primary font-semibold" : "text-white hover:text-primary"
                        }`
                      }
                    >
                      {link.label}
                    </NavLink>
                  ))}
                  {ADMIN_MENU.filter(
                    (item): item is { groupId: string; label: string; children: { label: string; to: string; showAtTopLevel?: boolean }[] } =>
                      "groupId" in item && "children" in item
                  ).map((item) => {
                    const dropdownChildren = item.children.filter((c) => !c.showAtTopLevel);
                    const groupActive = item.children.some(
                      (c) =>
                        location.pathname === c.to ||
                        (c.to !== "/" && location.pathname.startsWith(c.to + "/"))
                    );
                    return (
                      <div key={item.groupId} className="relative group">
                        <NavLink
                          to={dropdownChildren[0]?.to ?? item.children[0]?.to ?? "/"}
                          className={() =>
                            `inline-flex items-center gap-1 transition-colors ${
                              groupActive ? "text-primary font-semibold" : "text-white hover:text-primary"
                            }`
                          }
                        >
                          {item.label}
                          <ChevronDown className="w-4 h-4 opacity-80 group-hover:rotate-180 transition-transform" />
                        </NavLink>
                        <div className="absolute left-0 top-full pt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                          <div className="py-2 min-w-[11rem] rounded-lg bg-slate-900 border border-white/10 shadow-xl">
                            {dropdownChildren.map((child) => (
                              <NavLink
                                key={child.to}
                                to={child.to}
                                end={child.to === "/capital"}
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
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  {groupMenuItems.length > 0 ? (
                    groupMenuItems.map((link) => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        end={link.to === "/capital"}
                        className={({ isActive }) =>
                          `transition-colors ${
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
                        `transition-colors ${
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
            <div className="h-6 w-px bg-slate-600 hidden md:block" />
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
                    View as: {viewAs === "admin" || !viewAs ? "Admin" : MENU_GROUP_IDS.find((g) => g.id === viewAs)?.label ?? viewAs}
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
                    {MENU_GROUP_IDS.map((g) => (
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
                <div className="absolute right-0 top-full mt-1 py-2 min-w-[11rem] rounded-lg bg-slate-900 border border-white/10 shadow-xl z-50">
                  <NavLink
                    to="/settings"
                    onClick={() => setProfileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                        isActive
                          ? "text-primary font-semibold bg-white/5"
                          : "text-white hover:bg-white/10"
                      }`
                    }
                  >
                    <Settings className="w-4 h-4 shrink-0" />
                    Settings
                  </NavLink>
                  {role === "admin" && (
                    <NavLink
                      to="/admin"
                      onClick={() => setProfileOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
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
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

// --- Layout with navbar for protected app
function AppLayout() {
  const { user, role, groupName, logout } = useAuth();
  const [viewAs, setViewAsState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(VIEW_AS_STORAGE_KEY);
  });
  const setViewAs = useCallback((value: string | null) => {
    setViewAsState(value);
    if (value != null) localStorage.setItem(VIEW_AS_STORAGE_KEY, value);
    else localStorage.removeItem(VIEW_AS_STORAGE_KEY);
  }, []);
  return (
    <>
      <Navbar user={user} role={role} groupName={groupName} onLogout={logout} viewAs={viewAs} setViewAs={setViewAs} />
      <Routes>
        <Route path="/" element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
        <Route path="/news" element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
        <Route path="/capital" element={<Suspense fallback={<PageFallback />}><CapitalArticlePage /></Suspense>} />
        <Route path="/capital/keywords" element={<Suspense fallback={<PageFallback />}><CapitalKeywordsPage /></Suspense>} />
        <Route path="/capital/approval" element={<Suspense fallback={<PageFallback />}><CapitalApprovalPage /></Suspense>} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <Suspense fallback={<PageFallback />}><AdminLayout /></Suspense>
            </AdminRoute>
          }
        >
          <Route index element={<Suspense fallback={<PageFallback />}><AdminPanelPage /></Suspense>} />
          <Route path="users" element={<Suspense fallback={<PageFallback />}><AdminUsersPage /></Suspense>} />
        </Route>
        <Route path="/settings" element={<Suspense fallback={<PageFallback />}><ClientSettingsPage /></Suspense>} />
        <Route
          path="*"
          element={
            <div className="p-8 max-w-lg mx-auto text-center">
              <p className="text-gray-600 mb-4">This page doesn’t exist.</p>
              <Link to="/" className="text-primary underline">
                Back to Dashboard
              </Link>
            </div>
          }
        />
      </Routes>
    </>
  );
}

// --- App ---
export default function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="min-h-screen bg-[var(--color-page-bg)] selection:bg-primary/20">
          <Routes>
            <Route
              path="/login"
              element={
                <GuestRoute>
                  <Suspense fallback={<PageFallback />}><LoginPage /></Suspense>
                </GuestRoute>
              }
            />
            <Route
              path="/register"
              element={
                <GuestRoute>
                  <Suspense fallback={<PageFallback />}><RegisterPage /></Suspense>
                </GuestRoute>
              }
            />
            <Route
              path="/reset-password"
              element={
                <GuestRoute>
                  <Suspense fallback={<PageFallback />}><PasswordResetPage /></Suspense>
                </GuestRoute>
              }
            />
            <Route
              path="*"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </AuthProvider>
    </Router>
  );
}
