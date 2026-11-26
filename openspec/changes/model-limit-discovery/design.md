## Context

Manticore routes `{provider}/{model}` IDs and alias mappings to OpenAI-compatible upstreams. OpenCode Go documents `GET <base>/models` returning OpenAI list shapes whose entries carry `limit.context`, `limit.input`, and `limit.output`. Chat base URLs can include protocol segments (the documented Go config is `https://opencode.ai/inference/go/openai/v1`), so discovery fetches the chat base URL plus `/models` — verified against the live endpoint for that config — and treats any non-list response as a failure.

## Goals / Non-Goals

- Goals: expose discovered limits under public model references clients already use; keep unknown limits explicitly unknown; bound refresh cost; isolate catalogues by credential; never forward per-session headers into shared discovery.
- Non-goals: load balancing, routing changes, persistent storage for the catalogue, extending the cross-repo `contracts/model-settings-v1.json` fixture, Chimera-side consumption.

## Decisions

### Cache identity

One catalogue entry per upstream identity — base URL plus API key plus static headers (values other than the `{sessionId}` template). Two upstream records with the same identity share one fetch; any endpoint, credential, or header change is a new identity, so no stale entry can be served under a new configuration. Per-session `{sessionId}` headers are omitted from both the identity and the request.

### Await policy

A request with nothing fresh to serve (cold identity, unseen model path, or a discovery past its max verified age) blocks on the single in-flight fetch so the first good response recovers the data. A request holding fresh values serves them immediately and refreshes behind the response. Attempts are throttled to one per refresh interval, counted from the attempt's start, so a slow or failing fetch is never hammered.

### Age semantics

Each limit field stores its own verification time. A successful catalogue read renews only the fields it reports as valid positive integers; failed reads and omitted or invalid fields keep their previous value and age. A field older than the max verified age (24 h) serves `unknown`. Models that disappear from the catalogue keep their last-known fields until every field ages out, then are dropped, so a catalogue's worth of dead entries cannot accumulate.

### Capabilities compatibility

The `limits` block on `/v1/model-capabilities` is additive: `schemaVersion`, `profile`, `source`, `settings`, `inputModalities`, and the fingerprint are unchanged, and limits do not participate in the fingerprint (they refresh on their own cadence and would otherwise churn it).

## Risks / Trade-offs

- The catalogue is in-memory, so a restart re-discovers on first request. Acceptable for advisory metadata; persistence would require a migration and CRUD surface for little gain.
- A cold or expired request can wait up to the fetch timeout (10 s). Acceptable: it is bounded, single-flight, and throttled, and it is the only way the first caller sees real data.
- Upstreams whose `/models` endpoint differs from the chat protocol path will report `unknown` limits; the cache never fabricates values to compensate.
