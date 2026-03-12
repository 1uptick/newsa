import React from "react";
import type { LucideIcon } from "lucide-react";

type PageHeaderProps = {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
};

export function PageHeader({ icon: Icon, title, subtitle }: PageHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-8">
      <div className="p-2 rounded-lg bg-primary/10">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-slate-500 text-sm">{subtitle}</p>}
      </div>
    </div>
  );
}
