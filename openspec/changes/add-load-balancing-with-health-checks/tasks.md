## 1. Database & Schema

- [ ] 1.1 Create `upstream_healths` table migration (`migrations/0004_add_upstream_health.sql`)
- [ ] 1.2 Add `upstreamHealths` table definition to `src/db/schema.ts`
- [ ] 1.3 Update `src/types/api.ts` with `UpstreamHealthResponse` type

## 2. Core Health Service

- [ ] 2.1 Create `src/services/upstream-health.ts` with functions:
  - `recordRequestOutcome(upstreamId, success)` — increment counts and compute status
  - `getUpstreamHealth(upstreamId)` — read health record (lazy-create if missing)
  - `setHealthOverride(upstreamId, override)` — admin set healthy/unhealthy/auto
  - `computeStatus(errorCount, requestCount)` — determine status from counts
- [ ] 2.2 Export health status in `listUpstreams()` via `src/services/upstreams.ts`

## 3. Load Balancer Service

- [ ] 3.1 Create `src/services/load-balancer.ts` with:
  - `hashSessionToScore(key, seed)` — rendezvous hash scoring function (fnv1a)
  - `resolveMappingForRequest(abstractName, sessionId)` — score & rank all mappings in tier, walk ranking to find first healthy, fall back to next tier. Skip mappings whose upstream has been deleted (treat as unhealthy).
  - `groupMappingsByPriority(mappings)` — group by priority tier
- [ ] 3.2 Update `src/services/model-mappings.ts`:
  - Replace `resolveModelMapping` with new LB-aware resolver
  - Keep backward-compatible single-mapping behavior

## 4. Proxy Integration

- [ ] 4.1 Update `src/routes/proxy.ts`:
  - Replace `resolveModelMapping` call with `resolveMappingForRequest`
  - Wire `recordRequestOutcome` into request lifecycle:
    - `forward()` success → `recordRequestOutcome(upstream.id, true)`
    - `forward()` throws or returns non-2xx → `recordRequestOutcome(upstream.id, false)`
    - client abort (stream cancelled) → do NOT call health tracking
    - pre-forward errors (bad JSON, invalid model) → do NOT call health tracking

## 5. Admin API & CLI

- [ ] 5.1 Add `GET /api/upstreams/:id/health` route to `src/routes/upstreams.ts`
- [ ] 5.2 Add `PATCH /api/upstreams/:id/health` route to `src/routes/upstreams.ts`
- [ ] 5.3 Add `upstreams health <id> <healthy|unhealthy|auto>` subcommand to `src/cli.ts`
- [ ] 5.4 Add validation schemas in `src/schemas/upstreams.ts` for health endpoints

## 6. Testing

- [ ] 6.1 Add unit tests for rendezvous hash scoring in `tests/unit/load-balancer.test.ts`
- [ ] 6.2 Add unit tests for `computeStatus` in `tests/unit/upstream-health.test.ts`
- [ ] 6.3 Add service tests for `getUpstreamHealth` and `setHealthOverride` in `tests/services/upstream-health.test.ts`
- [ ] 6.4 Add service tests for `resolveMappingForRequest` in `tests/services/load-balancer.test.ts`
- [ ] 6.5 Add proxy integration tests for session-affinity LB in `tests/integration/proxy.test.ts`
- [ ] 6.6 Add proxy integration tests for priority-tier fallback
- [ ] 6.7 Add proxy integration tests for deleted upstream skip (`modelMappings` referencing a deleted upstream)
- [ ] 6.8 Add upstream health route tests in `tests/routes/upstreams.test.ts`
