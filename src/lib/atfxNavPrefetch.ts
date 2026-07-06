import { warmMarketsNavLink } from "./prefetchMarketsPage";
import { warmResearchReportNavLink } from "./prefetchResearchReportPage";
import { prefetchAtfxDashboardWorkspace, warmAtfxDashboardNavLink } from "./prefetchAtfxDashboard";

/** Prefetch ATFX route chunks (and map geography) when hovering nav links. */
export function warmAtfxNavLink(to: string): (() => void) | undefined {
  const dashboard = warmAtfxDashboardNavLink(to);
  const research = warmResearchReportNavLink(to);
  const markets = warmMarketsNavLink(to);
  if (!dashboard && !research && !markets) return undefined;
  return () => {
    dashboard?.();
    research?.();
    markets?.();
  };
}

/** Warm dashboard workspace API from any ATFX page (e.g. on mount). */
export { prefetchAtfxDashboardWorkspace };
