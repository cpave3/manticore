## Why

Clients such as Chimera currently configure upstream context/input/output limits by hand for every Manticore alias. OpenAI-compatible upstreams (e.g. OpenCode Go) already publish a `GET /models` catalogue with `limit.context/input/output`; Manticore can discover and cache it so clients read limits through the same aliases they already use for chat.

## What Changes

- New authenticated `GET /v1/models` endpoint (Client API key) listing every routable public model reference: alias mappings under their bare abstract name, and upstream catalogue models as `{provider}/{model}` direct routes, each with a `limits` block.
- Every limit is `{ status: "discovered", value }` or explicitly `{ status: "unknown" }` — never invented. ChatGPT Codex upstreams and empty base URLs stay unknown with no fetch.
- New in-memory discovery cache (`src/services/model-discovery.ts`) keyed by upstream identity (base URL + credential + static headers): one catalogue fetch serves five minutes, refreshes then run behind responses, a discovery stays trustworthy for 24 hours, and failed or omitted values never renew that age.
- `GET /v1/model-capabilities?model=` gains the same `limits` block for its resolved route; the block is additive and does not participate in the fingerprint.
- Discovery fetches `<chat base URL>/models` with the upstream's own credential and static headers only; per-session `{sessionId}` headers are never forwarded into shared discovery. Fetches are single-flight per identity with a bounded timeout.

## Capabilities

### New Capabilities

- `model-limit-discovery`: Discover upstream model limits through authenticated, cached catalogue reads and expose them under resolved public model IDs and aliases.

### Modified Capabilities

- `proxy-api`: `GET /v1/model-capabilities` responses gain an additive `limits` block; the existing fields and fingerprint are unchanged.

## Impact

- **`src/services/model-discovery.ts`** (new): identity computation, single-flight catalogue fetch, merge/serve/prune semantics, test reset hook.
- **`src/routes/proxy.ts`**: `/v1/models` route with alias and direct listing; `/v1/model-capabilities` handler becomes async and adds `limits`.
- **`src/services/upstreams.ts`**: `listRawUpstreams()` for proxy-side reads with unmasked credentials.
- **`docs/model-settings.md`, `README.md`**: document discovered limits.
- **No database changes**: the cache is in-memory; no migration is required.
- **Tests**: `tests/integration/models-discovery.test.ts` covers auth, alias and direct discovery, unknown paths, cache behaviour (throttle, background refresh, failure retention, max-age expiry and recovery, single-flight, identity isolation, remap invalidation), and capability-consumer compatibility.
- **Not in scope**: Chimera-side consumption of the endpoint; extending the shared `contracts/model-settings-v1.json` fixture (needs coordinated changes in all three repositories); load balancing; routing changes.
