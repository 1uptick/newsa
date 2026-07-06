import React from "react";
import { BrandedSpinner } from "./BrandedSpinner";

export type AppPageLoaderLayout = "full" | "app" | "compact";

type AppPageLoaderProps = {
  message?: string;
  layout?: AppPageLoaderLayout;
  className?: string;
  ariaLabel?: string;
};

const LAYOUT_CLASS: Record<AppPageLoaderLayout, string> = {
  full: "min-h-screen w-full",
  app: "min-h-[calc(100vh-4rem)] h-[calc(100vh-4rem)] w-full flex-1",
  compact: "min-h-[50vh] w-full flex-1",
};

export function AppPageLoader({
  message = "Loading…",
  layout = "app",
  className = "",
  ariaLabel = "Loading page",
}: AppPageLoaderProps) {
  return (
    <div
      className={`flex items-center justify-center bg-[var(--color-page-bg)] ${LAYOUT_CLASS[layout]} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <div className="flex flex-col items-center gap-5">
        <BrandedSpinner size="lg" label={ariaLabel} />
        {message ? <p className="text-sm font-medium tracking-wide text-slate-500">{message}</p> : null}
      </div>
    </div>
  );
}
