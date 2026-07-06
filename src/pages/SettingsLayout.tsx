import React from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { ChevronLeft, User, Target } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { groupNameToId } from "../config/menu";

const navItemClass =
  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors";
const navItemInactive =
  "bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800";
const navItemActive =
  "bg-primary text-white hover:bg-primary/90 border border-primary";

export default function SettingsLayout() {
  const { groupName } = useAuth();
  const canSeeCapitalStrategy = groupNameToId(groupName) === "capital";

  return (
    <div className="max-w-[1250px] mx-auto p-6">
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8 md:gap-10 items-start">
        {/* Left column: vertical tabs (screenshot style) */}
        <div className="md:sticky md:top-6">
          <Link
            to="/"
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Settings</span>
          </Link>
          <nav className="flex flex-col gap-1 rounded-xl overflow-hidden">
            <NavLink
              to="/settings"
              end
              className={({ isActive }) =>
                `${navItemClass} ${isActive ? navItemActive : navItemInactive}`
              }
            >
              <User className="w-5 h-5 shrink-0" />
              Profile
            </NavLink>
            {canSeeCapitalStrategy && (
              <NavLink
                to="/settings/remarks"
                className={({ isActive }) =>
                  `${navItemClass} ${isActive ? navItemActive : navItemInactive}`
                }
              >
                <Target className="w-5 h-5 shrink-0" />
                Strategy
              </NavLink>
            )}
          </nav>
        </div>

        {/* Right column: tab content */}
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
