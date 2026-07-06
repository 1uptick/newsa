/** Matches `AppNavbar` inner container (`max-w-[1800px]` + horizontal padding). */
export const ATFX_PAGE_SHELL_CLASS = "w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8";

/** Same width as navbar/content shell with left/right page borders (no horizontal gutter). */
export const ATFX_PAGE_SHELL_BORDER_CLASS =
  "w-full max-w-[1800px] mx-auto border-x border-slate-200";

/** ATFX full-height tool pages — lateral shadows cast outward on both left and right edges. */
export const ATFX_PAGE_SHELL_ELEVATED_CLASS =
  "w-full max-w-[1800px] mx-auto border-x border-slate-200 bg-white shadow-[-10px_0_32px_rgba(15,23,42,0.08),10px_0_32px_rgba(15,23,42,0.08)]";

/** @deprecated Use {@link ATFX_PAGE_SHELL_ELEVATED_CLASS}. */
export const ATFX_RESEARCH_PAGE_SHELL_CLASS = ATFX_PAGE_SHELL_ELEVATED_CLASS;
