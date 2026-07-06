import { useEffect, useRef, useState } from "react";

/** Reveal `fullText` character-by-character when `animate` is true. Catches up when `fullText` grows. */
export function useTypingText(fullText: string, animate: boolean, charsPerTick = 3): string {
  const [visible, setVisible] = useState(() => (animate ? "" : fullText));
  const visibleLenRef = useRef(animate ? 0 : fullText.length);

  useEffect(() => {
    if (!animate) {
      visibleLenRef.current = fullText.length;
      setVisible(fullText);
      return;
    }
    if (!fullText) {
      visibleLenRef.current = 0;
      setVisible("");
      return;
    }
    if (fullText.length < visibleLenRef.current) {
      visibleLenRef.current = 0;
      setVisible("");
    }

    const id = window.setInterval(() => {
      if (visibleLenRef.current >= fullText.length) {
        window.clearInterval(id);
        return;
      }
      visibleLenRef.current = Math.min(visibleLenRef.current + charsPerTick, fullText.length);
      setVisible(fullText.slice(0, visibleLenRef.current));
    }, 20);

    return () => window.clearInterval(id);
  }, [fullText, animate, charsPerTick]);

  return visible;
}
