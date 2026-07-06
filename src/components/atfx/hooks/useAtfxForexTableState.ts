import { useCallback, useEffect, useMemo, useState } from "react";
import {
  filterForexHiddenRows,
  loadForexCustomPairs,
  loadForexHiddenPairs,
  mergeForexTableRows,
  parseForexPairInput,
  saveForexCustomPairs,
  saveForexHiddenPairs,
} from "../../../lib/atfxForexCustomPairs";
import {
  applyForexPairOrder,
  loadForexPairOrder,
  saveForexPairOrder,
  type ForexTableKind,
} from "../../../lib/atfxForexTableOrder";
import { fetchForexPairQuotes, type MarketMoverEntry, type MarketMoversData } from "../../../lib/atfxMarketMoversService";

type AuthFetch = (url: string, options?: RequestInit) => Promise<Response>;

export function useAtfxForexTableState(
  authFetch: AuthFetch,
  options: { enabled: boolean; moversData: MarketMoversData | null }
) {
  const [forexMajorOrder, setForexMajorOrder] = useState<string[]>(() => loadForexPairOrder("major"));
  const [forexCrossOrder, setForexCrossOrder] = useState<string[]>(() => loadForexPairOrder("cross"));
  const [forexCustomMajor, setForexCustomMajor] = useState<string[]>(() => loadForexCustomPairs("major"));
  const [forexCustomCross, setForexCustomCross] = useState<string[]>(() => loadForexCustomPairs("cross"));
  const [forexHiddenMajor, setForexHiddenMajor] = useState<string[]>(() => loadForexHiddenPairs("major"));
  const [forexHiddenCross, setForexHiddenCross] = useState<string[]>(() => loadForexHiddenPairs("cross"));
  const [customForexQuotes, setCustomForexQuotes] = useState<MarketMoverEntry[]>([]);
  const [addPairKind, setAddPairKind] = useState<ForexTableKind | null>(null);
  const [addPairInput, setAddPairInput] = useState("");
  const [addPairError, setAddPairError] = useState<string | null>(null);

  const handleForexOrderChange = useCallback((kind: ForexTableKind, order: string[]) => {
    if (kind === "major") setForexMajorOrder(order);
    else setForexCrossOrder(order);
    saveForexPairOrder(kind, order);
  }, []);

  const forexMajorRows = useMemo(() => {
    const merged = mergeForexTableRows(
      options.moversData?.gainers ?? [],
      options.moversData?.losers ?? [],
      forexCustomMajor,
      customForexQuotes
    );
    const ordered = applyForexPairOrder(merged, forexMajorOrder);
    return filterForexHiddenRows(ordered, forexHiddenMajor);
  }, [
    options.moversData?.gainers,
    options.moversData?.losers,
    forexCustomMajor,
    customForexQuotes,
    forexMajorOrder,
    forexHiddenMajor,
  ]);

  const forexCrossRows = useMemo(() => {
    const merged = mergeForexTableRows(
      options.moversData?.losers ?? [],
      options.moversData?.gainers ?? [],
      forexCustomCross,
      customForexQuotes
    );
    const ordered = applyForexPairOrder(merged, forexCrossOrder);
    return filterForexHiddenRows(ordered, forexHiddenCross);
  }, [
    options.moversData?.gainers,
    options.moversData?.losers,
    forexCustomCross,
    customForexQuotes,
    forexCrossOrder,
    forexHiddenCross,
  ]);

  useEffect(() => {
    if (!options.enabled) return;

    const symbols = [...new Set([...forexCustomMajor, ...forexCustomCross])];
    if (symbols.length === 0) {
      setCustomForexQuotes([]);
      return;
    }

    let cancelled = false;
    void fetchForexPairQuotes(authFetch, symbols)
      .then((quotes) => {
        if (!cancelled) setCustomForexQuotes(quotes);
      })
      .catch(() => {
        if (!cancelled) setCustomForexQuotes([]);
      });

    return () => {
      cancelled = true;
    };
  }, [authFetch, options.enabled, forexCustomMajor, forexCustomCross]);

  const openAddPairModal = useCallback((kind: ForexTableKind) => {
    setAddPairKind(kind);
    setAddPairInput("");
    setAddPairError(null);
  }, []);

  const closeAddPairModal = useCallback(() => {
    setAddPairKind(null);
    setAddPairInput("");
    setAddPairError(null);
  }, []);

  const submitAddForexPair = useCallback(() => {
    if (!addPairKind) return;

    const parsed = parseForexPairInput(addPairInput);
    if (!parsed) {
      setAddPairError("Enter a valid pair (e.g. EUR/USD or EURUSD).");
      return;
    }

    const display = parsed.displaySymbol;
    const rows = addPairKind === "major" ? forexMajorRows : forexCrossRows;
    if (rows.some((r) => r.symbol === display)) {
      setAddPairError(`${display} is already in this table.`);
      return;
    }

    if (addPairKind === "major") {
      const nextCustom = [...forexCustomMajor, display];
      const nextHidden = forexHiddenMajor.filter((s) => s !== display);
      setForexCustomMajor(nextCustom);
      setForexHiddenMajor(nextHidden);
      saveForexCustomPairs("major", nextCustom);
      saveForexHiddenPairs("major", nextHidden);
      const nextOrder = forexMajorOrder.includes(display) ? forexMajorOrder : [...forexMajorOrder, display];
      handleForexOrderChange("major", nextOrder);
    } else {
      const nextCustom = [...forexCustomCross, display];
      const nextHidden = forexHiddenCross.filter((s) => s !== display);
      setForexCustomCross(nextCustom);
      setForexHiddenCross(nextHidden);
      saveForexCustomPairs("cross", nextCustom);
      saveForexHiddenPairs("cross", nextHidden);
      const nextOrder = forexCrossOrder.includes(display) ? forexCrossOrder : [...forexCrossOrder, display];
      handleForexOrderChange("cross", nextOrder);
    }

    closeAddPairModal();
  }, [
    addPairInput,
    addPairKind,
    closeAddPairModal,
    forexCrossOrder,
    forexCrossRows,
    forexCustomCross,
    forexCustomMajor,
    forexHiddenCross,
    forexHiddenMajor,
    forexMajorOrder,
    forexMajorRows,
    handleForexOrderChange,
  ]);

  const removeForexPair = useCallback(
    (kind: ForexTableKind, symbol: string) => {
      if (kind === "major") {
        const nextCustom = forexCustomMajor.filter((s) => s !== symbol);
        const nextHidden = [...new Set([...forexHiddenMajor, symbol])];
        const nextOrder = forexMajorOrder.filter((s) => s !== symbol);
        setForexCustomMajor(nextCustom);
        setForexHiddenMajor(nextHidden);
        saveForexCustomPairs("major", nextCustom);
        saveForexHiddenPairs("major", nextHidden);
        handleForexOrderChange("major", nextOrder);
      } else {
        const nextCustom = forexCustomCross.filter((s) => s !== symbol);
        const nextHidden = [...new Set([...forexHiddenCross, symbol])];
        const nextOrder = forexCrossOrder.filter((s) => s !== symbol);
        setForexCustomCross(nextCustom);
        setForexHiddenCross(nextHidden);
        saveForexCustomPairs("cross", nextCustom);
        saveForexHiddenPairs("cross", nextHidden);
        handleForexOrderChange("cross", nextOrder);
      }
    },
    [
      forexCrossOrder,
      forexCustomCross,
      forexCustomMajor,
      forexHiddenCross,
      forexHiddenMajor,
      forexMajorOrder,
      handleForexOrderChange,
    ]
  );

  return {
    forexMajorRows,
    forexCrossRows,
    addPairKind,
    addPairInput,
    addPairError,
    setAddPairInput,
    setAddPairError,
    openAddPairModal,
    closeAddPairModal,
    submitAddForexPair,
    removeForexPair,
    handleForexOrderChange,
  };
}
