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

/** A limit as it appears on the public surface: discovered or explicitly unknown. */
export type LimitDescriptor = { status: 'discovered'; value: number } | { status: 'unknown' };

export type ModelLimitsDescriptor = {
  context: LimitDescriptor;
  input: LimitDescriptor;
  output: LimitDescriptor;
};

export function unknownLimits(): ModelLimitsDescriptor {
  return {
    context: { status: 'unknown' },
    input: { status: 'unknown' },
    output: { status: 'unknown' },
  };
}

/** One discovered limit value: the value and when it was last verified. */
type CachedLimit = {
  value: number;
  discoveredAt: number;
};

/** Per-model cached limits. A `null` field was never validly discovered. */
type CachedModel = {
  context: CachedLimit | null;
  input: CachedLimit | null;
  output: CachedLimit | null;
  created: number | undefined;
};

/** The fetched catalogue for one upstream identity. */
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
 * share one catalogue; any endpoint or credential change produces a new
 * identity, so a stale entry can never be served under a new configuration.
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

/** An upstream we can never discover limits from (no OpenAI-compatible list endpoint). */
function isUndiscoverable(upstream: RawUpstream): boolean {
  return upstream.type === 'chatgpt-codex' || !upstream.baseUrl;
}

/**
 * Limits for one model path behind one upstream. A cold identity blocks on a
 * single catalogue fetch so the first caller sees real data; once data is
 * cached, a stale identity refreshes in the background and the last known
 * values are served.
 */
export async function getModelLimits(
  upstream: RawUpstream,
  modelPath: string
): Promise<ModelLimitsDescriptor> {
  if (isUndiscoverable(upstream)) return unknownLimits();
  const entry = await ensureCatalogue(upstream);
  const model = entry.models.get(modelPath);
  if (!model) return unknownLimits();
  return serveModelLimits(model, Date.now());
}

/**
 * The full cached catalogue of one upstream: every model id ever seen in a
 * successful list response, with per-field limit descriptors. Returns `null`
 * for upstreams with no OpenAI-compatible models endpoint.
 */
export async function getUpstreamCatalogue(
  upstream: RawUpstream
): Promise<Array<{ id: string; created?: number; limits: ModelLimitsDescriptor }> | null> {
  if (isUndiscoverable(upstream)) return null;
  const entry = await ensureCatalogue(upstream);
  const now = Date.now();
  return [...entry.models.entries()]
    .map(([id, model]) => ({ id, created: model.created, limits: serveModelLimits(model, now) }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

async function ensureCatalogue(upstream: RawUpstream): Promise<CatalogueEntry> {
  const identity = upstreamIdentity(upstream);
  let entry = cache.get(identity);
  if (!entry) {
    prune();
    entry = { models: new Map(), lastAttemptAt: 0, inflight: null };
    cache.set(identity, entry);
  }
  if (Date.now() - entry.lastAttemptAt >= DISCOVERY_CACHE_CONSTANTS.refreshIntervalMs) {
    if (entry.models.size === 0) {
      // Nothing verified yet: the caller waits for the single-flight fetch.
      await refreshEntry(entry, upstream);
    } else {
      // Last known values exist: refresh behind the response.
      void refreshEntry(entry, upstream);
    }
  } else if (entry.inflight && entry.models.size === 0) {
    // Within the throttle window, but the first fetch is still running and
    // there is nothing to serve yet: wait for it instead of answering unknown.
    await entry.inflight;
  }
  return entry;
}

function refreshEntry(entry: CatalogueEntry, upstream: RawUpstream): Promise<void> {
  if (entry.inflight) return entry.inflight;
  // Throttle from the attempt's start, not its completion.
  entry.lastAttemptAt = Date.now();
  const attempt = fetchCatalogue(entry, upstream).finally(() => {
    entry.inflight = null;
  });
  entry.inflight = attempt;
  return attempt;
}

/**
 * Fetch `<chat base URL>/models` and merge the response into the entry.
 * Failures never reject and never renew ages: retained values keep their
 * original discovery time, so `maxStaleMs` eventually turns them unknown.
 */
async function fetchCatalogue(entry: CatalogueEntry, upstream: RawUpstream): Promise<void> {
  try {
    const base = upstream.baseUrl!.replace(/\/$/, '');
    const headers = new Headers();
    if (upstream.apiKey) headers.set('Authorization', `Bearer ${upstream.apiKey}`);
    if (upstream.headers) {
      for (const [key, value] of Object.entries(upstream.headers)) {
        if (value !== '{sessionId}') headers.set(key, value);
      }
    }
    const response = await fetch(`${base}/models`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(DISCOVERY_CACHE_CONSTANTS.fetchTimeoutMs),
    });
    if (!response.ok) return;
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !Array.isArray((body as { data: unknown }).data)) {
      return;
    }
    const now = Date.now();
    const items = (body as { data: unknown[] }).data;
    const seen = new Set<string>();
    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue;
      const raw = item as Record<string, unknown>;
      const id = raw.id;
      if (typeof id !== 'string' || !id) continue;
      seen.add(id);
      const rawLimit =
        typeof raw.limit === 'object' && raw.limit !== null
          ? (raw.limit as Record<string, unknown>)
          : {};
      const previous: CachedModel = entry.models.get(id) ?? {
        context: null,
        input: null,
        output: null,
        created: undefined,
      };
      const created =
        typeof raw.created === 'number' && Number.isFinite(raw.created)
          ? raw.created
          : previous.created;
      entry.models.set(id, {
        context: mergeField(previous.context, rawLimit.context, now),
        input: mergeField(previous.input, rawLimit.input, now),
        output: mergeField(previous.output, rawLimit.output, now),
        created,
      });
    }
    // Models that disappeared from the catalogue keep their last known values
    // only while at least one field is still within maxStaleMs; then they are
    // dropped so a catalogue's worth of dead entries cannot accumulate.
    for (const [id, model] of entry.models) {
      if (seen.has(id)) continue;
      if (!hasFreshField(model, now)) entry.models.delete(id);
    }
  } catch {
    // Network error, timeout, or undecodable body: keep last known values.
  }
}

function mergeField(
  previous: CachedLimit | null,
  value: unknown,
  now: number
): CachedLimit | null {
  // Upstream limits are trusted only as positive finite integers; anything
  // else is an omission, not a value, and keeps the previous discovery.
  return isValidLimit(value) ? { value, discoveredAt: now } : previous;
}

function isValidLimit(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0
  );
}

function hasFreshField(model: CachedModel, now: number): boolean {
  return [model.context, model.input, model.output].some(
    (field) => field !== null && now - field.discoveredAt <= DISCOVERY_CACHE_CONSTANTS.maxStaleMs
  );
}

function serveModelLimits(model: CachedModel, now: number): ModelLimitsDescriptor {
  return {
    context: serveLimit(model.context, now),
    input: serveLimit(model.input, now),
    output: serveLimit(model.output, now),
  };
}

function serveLimit(cached: CachedLimit | null, now: number): LimitDescriptor {
  if (cached && now - cached.discoveredAt <= DISCOVERY_CACHE_CONSTANTS.maxStaleMs) {
    return { status: 'discovered', value: cached.value };
  }
  return { status: 'unknown' };
}

function prune(): void {
  const now = Date.now();
  for (const [identity, entry] of cache) {
    if (now - entry.lastAttemptAt > DISCOVERY_CACHE_CONSTANTS.pruneAgeMs) cache.delete(identity);
  }
  if (cache.size > DISCOVERY_CACHE_CONSTANTS.maxIdentities) {
    const oldest = [...cache.entries()].sort(
      (a, b) => a[1].lastAttemptAt - b[1].lastAttemptAt
    );
    for (let i = 0; i < oldest.length - DISCOVERY_CACHE_CONSTANTS.maxIdentities; i++) {
      cache.delete(oldest[i][0]);
    }
  }
}

/** Clears the discovery cache between tests (mirrors resetDbForTesting). */
export function resetModelDiscoveryForTesting(): void {
  cache.clear();
}
