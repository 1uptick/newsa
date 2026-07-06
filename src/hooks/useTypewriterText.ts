import { useEffect, useState } from "react";

type UseTypewriterTextOptions = {
  enabled?: boolean;
  /** Milliseconds between character steps */
  intervalMs?: number;
  /** Characters revealed per step (higher = faster) */
  charsPerStep?: number;
};

export function useTypewriterText(
  fullText: string,
  { enabled = true, intervalMs = 10, charsPerStep = 4 }: UseTypewriterTextOptions = {}
): { text: string; isTyping: boolean } {
  const source = fullText.trim();
  const [visibleLength, setVisibleLength] = useState(() => (enabled ? 0 : source.length));

  useEffect(() => {
    if (!enabled) {
      setVisibleLength(source.length);
      return;
    }
    if (!source) {
      setVisibleLength(0);
      return;
    }

    setVisibleLength(0);
    const timer = window.setInterval(() => {
      setVisibleLength((prev) => {
        if (prev >= source.length) {
          window.clearInterval(timer);
          return source.length;
        }
        return Math.min(source.length, prev + charsPerStep);
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [source, enabled, intervalMs, charsPerStep]);

  const text = enabled ? source.slice(0, visibleLength) : source;
  return { text, isTyping: enabled && visibleLength < source.length };
}
