import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type SetCenterSupplement = (value: string | null) => void;

/** Reader context: changes whenever the supplement text changes (only the navbar status strip reads it). */
const NavbarSupplementValueContext = createContext<string | null>(null);
/** Writer context: a stable setter so pages that only push status text never re-render on text changes. */
const NavbarSupplementSetterContext = createContext<SetCenterSupplement>(() => {});

export function NavbarSupplementProvider({ children }: { children: React.ReactNode }) {
  const [centerSupplement, setCenterSupplementState] = useState<string | null>(null);
  const setCenterSupplement = useCallback<SetCenterSupplement>((value) => {
    setCenterSupplementState(value);
  }, []);

  return (
    <NavbarSupplementSetterContext.Provider value={setCenterSupplement}>
      <NavbarSupplementValueContext.Provider value={centerSupplement}>
        {children}
      </NavbarSupplementValueContext.Provider>
    </NavbarSupplementSetterContext.Provider>
  );
}

/** Read the current supplement text (subscribes to changes). Use in the navbar status strip. */
export function useNavbarSupplementValue(): string | null {
  return useContext(NavbarSupplementValueContext);
}

/** Get the stable setter only (never re-renders when the supplement text changes). Use in pages. */
export function useSetNavbarSupplement(): SetCenterSupplement {
  return useContext(NavbarSupplementSetterContext);
}

/** Backwards-compatible combined hook (reader + setter). Prefer the split hooks above. */
export function useNavbarSupplement(): { centerSupplement: string | null; setCenterSupplement: SetCenterSupplement } {
  const centerSupplement = useContext(NavbarSupplementValueContext);
  const setCenterSupplement = useContext(NavbarSupplementSetterContext);
  return useMemo(() => ({ centerSupplement, setCenterSupplement }), [centerSupplement, setCenterSupplement]);
}
