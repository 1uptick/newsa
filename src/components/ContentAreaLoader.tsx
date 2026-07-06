import React from "react";
import { BrandedSpinner, type BrandedSpinnerSize } from "./BrandedSpinner";

export type ContentAreaLoaderVariant =
  /** Full page below the navbar */
  | "page"
  /** Primary column in a split layout */
  | "main"
  /** Detail/editor panel that should fill available height */
  | "panel"
  /** Card, table, or section body */
  | "card"
  /** Compact sidebar widget area */
  | "compact"
  /** Drawer or sheet scroll region */
  | "drawer"
  /** Flex child that should grow and center (e.g. stats panel) */
  | "inline";

const VARIANT_CLASS: Record<ContentAreaLoaderVariant, string> = {
  page: "min-h-[calc(100vh-4rem)] w-full flex flex-col items-center justify-center",
  main: "flex-1 min-h-[calc(100vh-8rem)] w-full flex flex-col items-center justify-center",
  panel: "flex-1 min-h-[min(420px,calc(100vh-12rem))] w-full flex flex-col items-center justify-center",
  card: "min-h-[12rem] w-full flex flex-col items-center justify-center",
  compact: "flex-1 min-h-[140px] w-full flex items-center justify-center",
  drawer: "min-h-[min(480px,calc(100vh-10rem))] w-full flex flex-col items-center justify-center",
  inline: "flex-1 min-h-[8rem] w-full flex items-center justify-center",
};

type ContentAreaLoaderProps = {
  size?: BrandedSpinnerSize;
  message?: string;
  variant?: ContentAreaLoaderVariant;
  className?: string;
  messageClassName?: string;
  pulseMessage?: boolean;
  /** Wrap page variant in the standard max-width page container */
  constrained?: boolean;
  ariaLabel?: string;
};

export function ContentAreaLoader({
  size = "md",
  message,
  variant = "main",
  className = "",
  messageClassName = "",
  pulseMessage = variant === "main",
  constrained = false,
  ariaLabel,
}: ContentAreaLoaderProps) {
  const hasMessage = Boolean(message?.trim());
  const gapClass = size === "sm" ? "gap-3" : "gap-4";
  const showColumn = hasMessage || variant !== "compact";

  const inner = (
    <div
      className={`${VARIANT_CLASS[variant]} ${showColumn ? `flex-col ${gapClass}` : ""} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel ?? message ?? "Loading"}
    >
      <BrandedSpinner size={size} />
      {hasMessage ? (
        <p
          className={`text-slate-500 text-sm ${pulseMessage ? "animate-pulse" : ""} ${messageClassName}`.trim()}
        >
          {message}
        </p>
      ) : null}
    </div>
  );

  if (constrained && variant === "page") {
    return (
      <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        {inner}
      </div>
    );
  }

  return inner;
}
