import {
  assertBrokerageTokensAvailable,
  brokerageTokenErrorResponse,
  captureBrokerageFallbackUsage,
  finalizeBrokerageUsage,
  isBrokerageTokenError,
  brokerageUsageStorage,
  runWithBrokerageUsageContext,
  runWithBrokerageUsageTracking,
  type BrokerageTokenSource,
} from "./brokerageTokenBilling.js";

export async function withBrokerageTokenBilling<T>(
  brokerageId: string,
  source: BrokerageTokenSource,
  fn: () => Promise<T>,
  opts?: {
    firebaseUid?: string;
    referenceId?: string;
    symbol?: string;
    estimatedTokens?: number;
    /** Bill at least a minimum charge when the handler succeeds but no LLM usage was captured. */
    ensureBilledOnSuccess?: (result: T) => boolean;
    fallbackModel?: string;
  }
): Promise<T> {
  await assertBrokerageTokensAvailable(brokerageId, opts?.estimatedTokens ?? 1);
  const { result, accumulator } = await runWithBrokerageUsageTracking(() =>
    runWithBrokerageUsageContext(
      {
        source,
        firebaseUid: opts?.firebaseUid,
        referenceId: opts?.referenceId,
        symbol: opts?.symbol,
      },
      async () => {
        const value = await fn();
        const acc = brokerageUsageStorage.getStore();
        if (acc?.isEmpty() && opts?.ensureBilledOnSuccess?.(value)) {
          captureBrokerageFallbackUsage({
            source,
            firebaseUid: opts?.firebaseUid,
            symbol: opts?.symbol,
            referenceId: opts?.referenceId,
            model: opts?.fallbackModel,
          });
        }
        return value;
      }
    )
  );

  await finalizeBrokerageUsage(brokerageId, accumulator, { firebaseUid: opts?.firebaseUid, defaultSource: source });
  return result;
}

export function respondBrokerageTokenError(res: import("express").Response, err: unknown): boolean {
  if (!isBrokerageTokenError(err)) return false;
  res.status(402).json(brokerageTokenErrorResponse(err));
  return true;
}
