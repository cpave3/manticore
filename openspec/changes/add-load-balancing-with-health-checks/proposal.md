## Why

Manticore currently forwards all requests for a mapped model to a single upstream, with priority-based failover. Users need to distribute load across multiple upstreams (e.g., multiple OpenAI org accounts or different providers) while leveraging provider prompt-token caching by pinning sessions to the same upstream. We also need to detect and avoid routing to unhealthy upstreams without requiring active probes.

## What Changes

- **Passive upstream health tracking**: Track request/error counts from LogRecords per upstream. Auto-mark upstreams unhealthy when error rate exceeds threshold. Admin can override to force-healthy, force-unhealthy, or reset to auto.
- **Session-affinity load balancing**: When an abstract model name has multiple mappings (same or different upstreams), hash `abstractName + sessionId` to consistently select among healthy mappings in the lowest-priority tier. Falls back to the next priority tier if all mappings in a tier are unhealthy.
- **Admin health API**: `GET /api/upstreams/:id/health` returns current health status. `PATCH /api/upstreams/:id/health` allows admin override.
- **Admin health CLI**: `manticore upstreams health <id> <healthy|unhealthy|auto>`.
- **Proxy routing change**: Requests with `manticore/{abstract}` or bare abstract names now use the LB resolver instead of picking the single highest-priority mapping.
- **No internal retry on request failure**: If a selected upstream fails during a request, return 502. The *next* request sees updated health state and routes elsewhere.

## Capabilities

### New Capabilities
- `upstream-health`: Passive error-rate health tracking with admin override for upstreams
- `load-balancing`: Session-affinity hash-based load balancing across multiple model mappings per abstract name, with priority-tier fallback

### Modified Capabilities
- `proxy-api`: Model resolution now includes health-aware LB routing across multiple mappings
- `upstream-management`: Adds health status read/update endpoints and CLI commands

## Impact

- New `upstream_healths` table in SQLite schema
- New `src/services/upstream-health.ts` service
- New `src/services/load-balancer.ts` service
- Changes to `resolveModelMapping()` → new `resolveMappingForRequest()` 
- Proxy request lifecycle updated to bump request/error counts for health tracking
- New CLI subcommand under `upstreams`
- New API route: `PATCH /api/upstreams/:id/health`
- Dashboard may read upstream health status (future work)
