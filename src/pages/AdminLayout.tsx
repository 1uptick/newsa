import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { UserPlus, Users } from "lucide-react";

export default function AdminLayout() {
  return (
    <div className="max-w-[1250px] mx-auto p-6">
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-8 md:gap-12 items-start">
        {/* Left column: Admin Panel nav */}
        <div className="md:sticky md:top-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-6">Admin Panel</h1>
          <nav className="flex flex-col gap-1">
            <NavLink
              to="/admin"
              end
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`
              }
            >
              <UserPlus className="w-4 h-4" />
              Invitations
            </NavLink>
            <NavLink
              to="/admin/users"
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`
              }
            >
              <Users className="w-4 h-4" />
              Users
            </NavLink>
          </nav>
        </div>
        {/* Right column: content */}
        <div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
