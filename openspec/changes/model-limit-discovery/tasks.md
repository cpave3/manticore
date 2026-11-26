## 1. Discovery service

- [x] 1.1 Create `src/services/model-discovery.ts` with `DISCOVERY_CACHE_CONSTANTS` (5 min refresh interval, 24 h max verified age, 10 s fetch timeout, identity prune bounds)
- [x] 1.2 `upstreamIdentity()` hashing base URL + API key + static headers (never `{sessionId}` templates)
- [x] 1.3 Single-flight catalogue fetch of `<chat base URL>/models` with `AbortSignal.timeout`, upstream credential, static headers only
- [x] 1.4 Merge semantics: valid positive-integer limits renew their field age; failures and omissions keep last known without renewal; disappeared models age out
- [x] 1.5 `getModelLimits()` / `getUpstreamCatalogue()` with await-on-nothing-fresh, serve-behind-when-fresh; codex and empty base URL stay unknown with no fetch
- [x] 1.6 `resetModelDiscoveryForTesting()`

## 2. HTTP surface

- [x] 2.1 `GET /v1/models` behind client API-key auth, listing bare alias names and `{provider}/{model}` direct routes through `resolveRoute`
- [x] 2.2 `GET /v1/model-capabilities` gains the additive `limits` block for its resolved route
- [x] 2.3 `listRawUpstreams()` in `src/services/upstreams.ts` for unmasked proxy-side reads

## 3. Tests (`tests/integration/models-discovery.test.ts`)

- [x] 3.1 Auth: 401 missing/invalid key; empty store lists nothing
- [x] 3.2 Tracer: alias resolves and discovers limits end-to-end; session header omitted from discovery; one fetch per identity
- [x] 3.3 Direct routes; mapping-intercepted spellings; codex and empty-base-URL unknown paths; absent and invalid values stay unknown
- [x] 3.4 Cache: throttle window, background refresh serving last-known, failure retention with throttling, max-age expiry with same-request recovery, single-flight concurrency, identity sharing/isolation, remap invalidation, omission retention without age renewal, disappeared-model aging
- [x] 3.5 Capability-consumer compatibility: existing fields intact, codex profile unchanged, fingerprint stable across limit refreshes

## 4. Documentation

- [x] 4.1 `docs/model-settings.md` "Discovered limits" section
- [x] 4.2 `README.md` model discovery section

## 5. Review pass 1 fixes

- [x] 5.1 Bulk catalogue freshness from cached fields, so a direct-only listing with every field past the max verified age awaits the refresh and recovers on the same request (new direct-only test with a delayed successful refresh)
- [x] 5.2 Suppress direct entries whose public id a mapping already owns, even when both resolve to the same route (new collision test)
- [x] 5.3 README states the five-minute refresh interval and the 24-hour max verified age separately
