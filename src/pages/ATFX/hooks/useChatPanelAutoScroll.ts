import { useCallback, useEffect, useRef } from "react";

const NEAR_BOTTOM_THRESHOLD_PX = 64;

function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_THRESHOLD_PX;
}

/** Keep a chat scroll container pinned to the latest content when the user is already at the bottom. */
export function useChatPanelAutoScroll(scrollKey: unknown) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastScrollAtRef = useRef(0);
  const pinnedToBottomRef = useRef(true);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    const now = Date.now();
    if (behavior === "smooth" && now - lastScrollAtRef.current < 100) return;
    lastScrollAtRef.current = now;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const scrollToLatestIfPinned = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      if (!pinnedToBottomRef.current) return;
      scrollToLatest(behavior);
    },
    [scrollToLatest]
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      pinnedToBottomRef.current = isNearBottom(el);
    };

    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    scrollToLatestIfPinned("smooth");
  }, [scrollKey, scrollToLatestIfPinned]);

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;

    let raf: number | null = null;
    const ro = new ResizeObserver(() => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        scrollToLatestIfPinned("auto");
      });
    });
    ro.observe(node);

    return () => {
      ro.disconnect();
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [scrollToLatestIfPinned]);

  return { scrollRef, contentRef, scrollToLatest };
};
