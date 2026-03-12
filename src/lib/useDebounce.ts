import { useState, useEffect } from "react";

/**
 * Debounce a value by delaying updates until after a specified delay.
 * Useful for search inputs to avoid excessive re-renders/API calls.
 */
export function useDebounce<T>(value: T, delayMs: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}
