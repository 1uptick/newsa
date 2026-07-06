import React, { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from "react-router-dom";

import { useAuth } from "./contexts/AuthContext";
import { AppPageLoader } from "./components/AppPageLoader";
import {
  groupNameToId,
  getDefaultLandingPath,
  getMenuGroupIdsForAdminViewAs,
  getEffectiveMenuView,
  UPTICK_ADMIN_EMAIL,
  UPTICK_GROUP_ID,
  ATFX_GROUP_ID,
} from "./config/menu";
import { BROKERAGE_ATFX } from "./lib/brokerageTokens";
import { BrokerageTokenBalanceProvider } from "./contexts/BrokerageTokenBalanceContext";
import { Navbar, VIEW_AS_STORAGE_KEY } from "./components/AppNavbar";
import { NavbarSupplementProvider } from "./contexts/NavbarSupplementContext";

// Direct imports for proper code splitting (avoid barrel file)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const CapitalArticlePage = lazy(() => import("./pages/Capital/capitalarticlePages"));
const CapitalKeywordsPage = lazy(() => import("./pages/Capital/capitalkeywords"));
const CapitalDashboardPage = lazy(() => import("./pages/Capital/capitalDashboard"));
const CapitalApprovalPage = lazy(() => import("./pages/Capital/capitalapproval"));
const AtfxDashboardPage = lazy(() => import("./pages/ATFX/atfxDashboard"));
const AtfxApprovalPage = lazy(() => import("./pages/ATFX/atfxApproval"));
const AtfxArticlePage = lazy(() => import("./pages/ATFX/atfxArticlePages"));
const AtfxResearchReportPage = lazy(() => import("./pages/ATFX/atfxResearchReport"));
const AtfxMarketsPage = lazy(() => import("./pages/ATFX/atfxMarkets"));
const OneUptickTopicsPage = lazy(() => import("./pages/OneUptick/1upticktopics"));
const OneUptickTwittPage = lazy(() => import("./pages/OneUptick/1upticktwitt"));
const OneUptickArticlesPage = lazy(() => import("./pages/OneUptick/1uptickarticles"));
const OneUptickSeoPage = lazy(() => import("./pages/OneUptick/1uptickseo"));
const OneUptickTradingViewPage = lazy(() => import("./pages/OneUptick/1uptickTradingView"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const PasswordResetPage = lazy(() => import("./pages/PasswordResetPage"));
const AdminPanelPage = lazy(() => import("./pages/AdminPanelPage"));
const AdminLayout = lazy(() => import("./pages/AdminLayout"));
const AdminUsersPage = lazy(() => import("./pages/AdminUsersPage"));
const AdminBrokerageTokensPage = lazy(() => import("./pages/AdminBrokerageTokensPage"));
const SettingsLayout = lazy(() => import("./pages/SettingsLayout"));
const ClientSettingsPage = lazy(() => import("./pages/ClientSettingsPage"));
const RemarksPage = lazy(() => import("./pages/RemarksPage"));

const PageFallback = () => <AppPageLoader layout="compact" message="" ariaLabel="Loading page" />;

// --- Protected route: require login
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <AppPageLoader layout="full" message="" ariaLabel="Loading" />;
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

/** 1uptick routes: assigned clients, or admin support@1uptick.com only. */
function OneUptickRoute({ children }: { children: React.ReactNode }) {
  const { user, role, groupName } = useAuth();
  const email = user?.email?.trim().toLowerCase() ?? "";
  if (role === "admin") {
    if (email === UPTICK_ADMIN_EMAIL.toLowerCase()) return <>{children}</>;
    return <Navigate to="/" replace />;
  }
  if (role === "client" && groupNameToId(groupName) === UPTICK_GROUP_ID) return <>{children}</>;
  return <Navigate to="/" replace />;
}

/** ATFX portal: assigned ATFX clients, or any admin. */
function AtfxRoute({ children }: { children: React.ReactNode }) {
  const { role, groupName, loading } = useAuth();
  if (loading) return <PageFallback />;
  if (role === "admin") return <>{children}</>;
  if (role === "client" && groupNameToId(groupName) === ATFX_GROUP_ID) return <>{children}</>;
  return <Navigate to="/" replace />;
}

// --- Guest-only (redirect to app if logged in)
function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <AppPageLoader layout="full" message="" ariaLabel="Loading" />;
  }
  if (user) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

// --- Root route: redirect to first menu item for user's group (e.g. Capital -> Dashboard)
function RootOrRedirect() {
  const location = useLocation();
  const { role, groupName } = useAuth();
  const defaultPath = getDefaultLandingPath(role, groupName);
  if (location.pathname === "/" && defaultPath !== "/") {
    return <Navigate to={defaultPath} replace />;
  }
  return <Dashboard />;
}

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

  useEffect(() => {
    if (role !== "admin" || !viewAs || viewAs === "admin") return;
    const allowed = getMenuGroupIdsForAdminViewAs(user?.email).some((g) => g.id === viewAs);
    if (!allowed) setViewAs("admin");
  }, [role, viewAs, user?.email, setViewAs]);

  const effectiveView = getEffectiveMenuView(role, groupName, viewAs);
  const brokerageTokenId = effectiveView === ATFX_GROUP_ID ? BROKERAGE_ATFX : null;

  return (
    <NavbarSupplementProvider>
      <BrokerageTokenBalanceProvider brokerageId={brokerageTokenId}>
        <Navbar user={user} role={role} groupName={groupName} onLogout={logout} viewAs={viewAs} setViewAs={setViewAs} />
        <Routes>
        <Route path="/" element={<Suspense fallback={<PageFallback />}><RootOrRedirect /></Suspense>} />
        <Route path="/news" element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
        <Route path="/capital" element={<Suspense fallback={<PageFallback />}><CapitalArticlePage /></Suspense>} />
        <Route path="/capital/dashboard" element={<Suspense fallback={<PageFallback />}><CapitalDashboardPage /></Suspense>} />
        <Route path="/capital/keywords" element={<Suspense fallback={<PageFallback />}><CapitalKeywordsPage /></Suspense>} />
        <Route path="/capital/approval" element={<Suspense fallback={<PageFallback />}><CapitalApprovalPage /></Suspense>} />
        <Route
          path="/atfx/markets"
          element={
            <AtfxRoute>
              <Suspense fallback={<PageFallback />}>
                <AtfxMarketsPage />
              </Suspense>
            </AtfxRoute>
          }
        />
        <Route
          path="/atfx/dashboard"
          element={
            <AtfxRoute>
              <Suspense fallback={<PageFallback />}>
                <AtfxDashboardPage />
              </Suspense>
            </AtfxRoute>
          }
        />
        <Route
          path="/atfx/approval"
          element={
            <AtfxRoute>
              <Suspense fallback={<PageFallback />}>
                <AtfxApprovalPage />
              </Suspense>
            </AtfxRoute>
          }
        />
        <Route
          path="/atfx/research-report"
          element={
            <AtfxRoute>
              <Suspense fallback={<PageFallback />}>
                <AtfxResearchReportPage />
              </Suspense>
            </AtfxRoute>
          }
        />
        <Route
          path="/atfx"
          element={
            <AtfxRoute>
              <Suspense fallback={<PageFallback />}>
                <AtfxArticlePage />
              </Suspense>
            </AtfxRoute>
          }
        />
        <Route
          path="/1uptick/topics"
          element={
            <OneUptickRoute>
              <Suspense fallback={<PageFallback />}>
                <OneUptickTopicsPage />
              </Suspense>
            </OneUptickRoute>
          }
        />
        <Route
          path="/1uptick/twitt"
          element={
            <OneUptickRoute>
              <Suspense fallback={<PageFallback />}>
                <OneUptickTwittPage />
              </Suspense>
            </OneUptickRoute>
          }
        />
        <Route
          path="/1uptick/articles"
          element={
            <OneUptickRoute>
              <Suspense fallback={<PageFallback />}>
                <OneUptickArticlesPage />
              </Suspense>
            </OneUptickRoute>
          }
        />
        <Route
          path="/1uptick/seo"
          element={
            <OneUptickRoute>
              <Suspense fallback={<PageFallback />}>
                <OneUptickSeoPage />
              </Suspense>
            </OneUptickRoute>
          }
        />
        <Route
          path="/1uptick/trading-view"
          element={
            <AdminRoute>
              <Suspense fallback={<PageFallback />}>
                <OneUptickTradingViewPage />
              </Suspense>
            </AdminRoute>
          }
        />
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
          <Route path="brokerage-tokens" element={<Suspense fallback={<PageFallback />}><AdminBrokerageTokensPage /></Suspense>} />
        </Route>
        <Route path="/settings" element={<Suspense fallback={<PageFallback />}><SettingsLayout /></Suspense>}>
          <Route index element={<Suspense fallback={<PageFallback />}><ClientSettingsPage /></Suspense>} />
          <Route path="remarks" element={<Suspense fallback={<PageFallback />}><RemarksPage /></Suspense>} />
        </Route>
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
      </BrokerageTokenBalanceProvider>
    </NavbarSupplementProvider>
  );
}

// --- App ---
export default function App() {
  return (
    <Router>
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
    </Router>
  );
}
