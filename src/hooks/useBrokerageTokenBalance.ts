import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import type { BrokerageTokenBalance } from "../lib/brokerageTokens";

export function useBrokerageTokenBalance(brokerageId: string | null) {
  const { authFetch } = useAuth();
  const [balance, setBalance] = useState<BrokerageTokenBalance | null>(null);
  const [loading, setLoading] = useState(Boolean(brokerageId));
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!brokerageId) {
      setBalance(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(
        `/api/brokerage/${encodeURIComponent(brokerageId)}/tokens/balance?_=${Date.now()}`,
        { forceRefresh: true }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load token balance");
      }
      setBalance(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load token balance");
    } finally {
      setLoading(false);
    }
  }, [authFetch, brokerageId]);

  const applyBalance = useCallback((next: BrokerageTokenBalance) => {
    setBalance(next);
    setLoading(false);
    setError("");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { balance, loading, error, refresh, applyBalance };
}
