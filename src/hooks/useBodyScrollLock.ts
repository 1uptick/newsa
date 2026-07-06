import { useEffect } from "react";

/**
 * Lock background scroll on `document.body` while `locked` is true (e.g. a mobile slide-up sheet
 * or modal is open). Restores scrolling on unlock/unmount. Extracted from the duplicated
 * `document.body.style.overflow` effects on the OneUptick article pages.
 */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [locked]);
}
