import { useCallback, useEffect, useRef } from "react";

/** Scroll target into view at most once per `minIntervalMs` (rAF-coalesced). */
export function useThrottledScrollIntoView(minIntervalMs = 350) {
  const targetRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastScrollRef = useRef(0);

  const scrollToTarget = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const run = () => {
        rafRef.current = null;
        const now = Date.now();
        if (now - lastScrollRef.current < minIntervalMs) return;
        lastScrollRef.current = now;
        targetRef.current?.scrollIntoView({ behavior });
      };
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(run);
    },
    [minIntervalMs]
  );

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  return { targetRef, scrollToTarget };
}
