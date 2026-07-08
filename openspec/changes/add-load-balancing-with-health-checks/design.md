## Context

Manticore currently resolves abstract model names to a single upstream via `resolveModelMapping()`, which picks the mapping with the lowest `priority` value. Each abstract name effectively has one upstream target. Users want to run the same model through multiple upstreams (e.g., two OpenAI org accounts, or OpenAI + OpenRouter) for redundancy and load distribution. At the same time, routing the same session to the same upstream increases the chance of provider prompt-token cache hits.

The existing `priority` column on `modelMappings` was designed for failover ordering (1 = primary, higher = fallback). We extend this behavior: mappings with the same abstract name and same (lowest) priority form a load-balanced pool. If all upstreams in the pool are unhealthy, we fall back to the next priority tier.

Health detection must not require scheduled jobs (per ADR-0001, Manticore is a single-user, single-process tool). We derive health from recent LogRecord outcomes, updated on every request completion.

## Goals / Non-Goals

**Goals:**
- Add passive (outcome-based) health tracking per upstream
- Provide session-affinity load balancing across multiple mappings for the same abstract model
- Preserve priority-based fallback when all mappings in a tier are unhealthy
- Expose admin health read/update via API and CLI
- Update the proxy routing to use the new resolver

**Non-Goals:**
- Active health probes or scheduled background tasks
- Internal retry of failed requests within a single proxy call
- Cross-request weighted distribution (e.g., 70/30 split). Weight is determined by mapping count and equality.
- Dashboard health visualization (server-side changes only)

## Decisions

**Decision: `abstractName + sessionId` as affinity key**
- Rationale: Provider prompt-token caches are typically scoped by (provider, model, conversation context), not by session globally. Pinning `kimi-k2.5` session `abc` to one upstream while letting the same session hit a different upstream for `claude-4` avoids polluting the wrong cache.
- Alternative: `sessionId` only — rejected because it would force one upstream per session across all models, reducing pool utilization.

**Decision: Rendezvous hashing over the full tier**
- Rationale: `hash(key) mod poolSize` breaks session affinity every time the healthy pool changes (an upstream going down shifts the modulus for *all* sessions). **Rendezvous hashing** computes a score for *every* mapping in the tier and ranks them. The session's primary choice is the highest-ranked mapping; if that mapping's upstream is unhealthy, we walk the ranking until we find a healthy one. The rankings are stable regardless of which upstreams are healthy, so sessions only deviate when their specific primary choice is down and return immediately upon recovery.
- The hash key is `abstractName + ":" + sessionId` (or `abstractName + ":" + Math.random()` for null sessionId).
- Alternative: Jump consistent hash — rejected because it requires numbering nodes, which doesn't fit our priority-tier grouping.

**Decision: Passive health tracking with a capped-count window**
- Rationale: Manticore intentionally has no background scheduler. We derive health from request outcomes by tracking `request_count` and `error_count` on `upstream_healths`.
- Counting rule: increment `request_count` on every completed request. Increment `error_count` only on upstream failures (non-2xx status, connection error). Do NOT increment `error_count` on client aborts (`status = 'cancelled'`) or pre-forward validation errors (bad JSON, missing model).
- Window rule: when `request_count >= 20`, reset both `request_count` and `error_count` to 0. This gives a sliding window of the last 20 requests.
- Threshold rule: `error_count >= 3` AND `error_count / request_count >= 0.5` → mark `unhealthy`. Otherwise `healthy`.
- Recovery: an upstream stays `unhealthy` until the error rate drops below threshold (new successful requests within the window push `error_count / request_count < 0.5`), or until an admin forces it healthy.
- Admin override: `override` field (`'auto' | 'healthy' | 'unhealthy'`). When `override !== 'auto'`, `status` = override and error counting continues silently in the background. When `override` changes back to `'auto'`, recompute `status` immediately from current counts.

**Decision: Health state stored in `upstream_healths` table, not purely in-memory**
- Rationale: Health needs to survive restarts so the admin doesn't have to re-mark an upstream as down after a crash. SQLite is cheap.
- On server start, `status` is derived from `override`: if `override = 'unhealthy'`, keep `status = 'unhealthy'`; if `override = 'healthy'`, keep `status = 'healthy'`; only if `override = 'auto'` should `status` reset to `'unknown'`.
- `last_checked_at` and `updated_at` timestamps are maintained for visibility.

## Risks / Trade-offs

- [Risk] Stale health after restart → Mitigation: `request_count` and `error_count` are persisted, and override-based statuses are preserved. Auto-derived `status` resets to `'unknown'` and is recomputed on the next request.
- [Risk] All upstreams in a tier become unhealthy at once, swamping the next tier → Mitigation: Acceptable — that's what fallback is for.
- [Risk] Session affinity with null sessionId → Mitigation: Use `Math.random()` as the hash suffix when `sessionId` is null. Requests without affinity are distributed randomly across the healthy pool.
- [Risk] Hash ring is not uniformly distributed for small pools → Mitigation: Rendezvous hashing with `fnv1a` produces adequate distribution for single-user workloads with 2–5 upstreams.

## Migration Plan

1. Run `drizzle-kit generate` to create migration 0004
2. Run `pnpm db:migrate` to apply migration
3. Restart Manticore process
4. Old model mappings continue to work: single mapping = pool size 1 = no change in behavior

## Open Questions

- Should `upstream_healths` rows be auto-created when an upstream is created, or lazily on first request? → Lazy creation on first request is simpler and avoids migration bloat.
- Should health error thresholds (window size 20, 3 errors, 50% rate) be configurable? → Keep hardcoded for now. Add to config if users ask.
