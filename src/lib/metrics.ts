/**
 * Generation throughput in completion tokens per second.
 * Returns null when inputs can't yield a meaningful rate
 * (missing values, non-positive latency, or non-positive tokens).
 */
export function tokensPerSecond(
  completionTokens: number | null | undefined,
  latencyMs: number | null | undefined,
): number | null {
  if (completionTokens == null || latencyMs == null) return null;
  if (completionTokens <= 0 || latencyMs <= 0) return null;
  return completionTokens / (latencyMs / 1000);
}
