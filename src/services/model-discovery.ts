import { createHash } from 'node:crypto';
import type { RawUpstream } from './upstreams.js';

/**
 * Tuning knobs for the in-memory upstream model-limit discovery cache.
 * Exported so tests can assert against the documented values.
 */
export const DISCOVERY_CACHE_CONSTANTS = {
  /** How long a discovered limit stays served without a newer verification. */
  maxStaleMs: 24 * 60 * 60 * 1000,
  /** Minimum spacing between catalogue fetch attempts for one upstream identity. */
  refreshIntervalMs: 5 * 60 * 1000,
  /** Upper bound on a single catalogue fetch. */
  fetchTimeoutMs: 10 * 1000,
  /** Catalogue identities retained at once; least recently attempted evicted first. */
  maxIdentities: 64,
  /** A catalogue identity not attempted for this long is dropped wholesale. */
  pruneAgeMs: 48 * 60 * 60 * 1000,
} as const;

/** One discovered limit value: where it came from and when it was verified. */
type CachedLimit = {
  value: number;
  discoveredAt: number;
};

/** Per-model cached limits. `null` means never discovered (or expired). */
type CachedModel = {
  context: CachedLimit | null;
  input: CachedLimit | null;
  output: CachedLimit | null;
};

/** A fetched catalogue for one upstream identity. */
type CatalogueEntry = {
  models: Map<string, CachedModel>;
  lastAttemptAt: number;
  inflight: Promise<void> | null;
};

const cache = new Map<string, CatalogueEntry>();

/**
 * Identity of the upstream catalogue: base URL plus the credentials and the
 * static headers a discovery request would carry. Session-templated headers
 * (`{sessionId}`) never participate: they are per-conversation and must not
 * leak into shared discovery. Two upstream records with the same identity
 * share one catalogue; any credential or endpoint change is a new identity,
 * so stale entries can never be served under a new configuration.
 */
export function upstreamIdentity(upstream: RawUpstream): string {
  const staticHeaders: Record<string, string> = {};
  if (upstream.headers) {
    for (const [key, value] of Object.entries(upstream.headers)) {
      if (value !== '{sessionId}') staticHeaders[key] = value;
    }
  }
  return createHash('sha256')
    .update(
      JSON.stringify({
        baseUrl: upstream.baseUrl ?? '',
        apiKey: upstream.apiKey ?? '',
        headers: staticHeaders,
      })
    )
    .digest('hex');
}

/** Clears the discovery cache between tests (mirrors resetDbForTesting). */
export function resetModelDiscoveryForTesting(): void {
  cache.clear();
}
