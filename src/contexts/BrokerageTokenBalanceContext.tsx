import React, { createContext, useContext, useMemo } from "react";
import { useBrokerageTokenBalance } from "../hooks/useBrokerageTokenBalance";
import type { BrokerageTokenBalance } from "../lib/brokerageTokens";

type BrokerageTokenBalanceContextValue = {
  balance: BrokerageTokenBalance | null;
  loading: boolean;
  refresh: () => Promise<void>;
  applyBalance: (balance: BrokerageTokenBalance) => void;
};

const BrokerageTokenBalanceContext = createContext<BrokerageTokenBalanceContextValue>({
  balance: null,
  loading: false,
  refresh: async () => {},
  applyBalance: () => {},
});

export function BrokerageTokenBalanceProvider({
  brokerageId,
  children,
}: {
  brokerageId: string | null;
  children: React.ReactNode;
}) {
  const { balance, loading, refresh, applyBalance } = useBrokerageTokenBalance(brokerageId);
  const value = useMemo(
    () => ({ balance, loading, refresh, applyBalance }),
    [balance, loading, refresh, applyBalance]
  );
  return (
    <BrokerageTokenBalanceContext.Provider value={value}>{children}</BrokerageTokenBalanceContext.Provider>
  );
}

export function useBrokerageTokenBalanceContext(): BrokerageTokenBalanceContextValue {
  return useContext(BrokerageTokenBalanceContext);
}

/** Call after LLM usage to refresh the navbar token bar. */
export function useBrokerageTokenBalanceRefresh(): () => Promise<void> {
  return useContext(BrokerageTokenBalanceContext).refresh;
}

/** Apply balance returned from a billed API response (avoids stale read). */
export function useBrokerageTokenBalanceApply(): (balance: BrokerageTokenBalance) => void {
  return useContext(BrokerageTokenBalanceContext).applyBalance;
}
