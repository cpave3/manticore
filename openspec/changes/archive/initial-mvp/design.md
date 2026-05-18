## Context

Manticore is a self-hosted proxy that exposes multiple upstream LLM providers behind a single OpenAI-compatible chat completions endpoint. It tracks per-Client usage metadata (tokens, latency, status) in a local SQLite database and serves a web Dashboard for visualization. This is the initial MVP — a greenfield TypeScript project.

## Goals / Non-Goals

**Goals:**
- Single-node TypeScript application serving both the proxy API and Dashboard
- OpenAI-compatible `/v1/chat/completions` endpoint with model routing
- Per-request metadata logging (tokens, latency, status) to SQLite
- Web Dashboard for usage querying and visualization
- Client and Upstream management via admin surface
- Support streaming and non-streaming requests
- Best-effort token counting (upstream usage → Hugging Face tokenizer → null)

**Non-Goals:**
- Multi-user tenancy or authentication
- Rate limiting
- Cost / spend tracking
- Non-chat endpoints (embeddings, image generation, etc.)
- Hot-reloading of Upstreams without restart
- Distributed deployment or horizontal scaling
- Request/response content storage

## Decisions

### Hono + @hono/node-server for HTTP

**Rationale:** Hono is lightweight, fast, and has excellent middleware and SSE support built-in. It works natively with Node.js via `@hono/node-server` and has a clean, Express-like API. Unlike Express, it has first-class streaming support and is actively maintained.

**Alternatives considered:**
- Express: heavier, slower, streaming support is second-class
- Fastify: faster but more verbose; Hono strikes the right balance for a small proxy
- Native `node:http`: too low-level, would need to re-implement routing

### Vercel AI SDK (`ai` package) for LLM calls

**Rationale:** Provides consistent OpenAI-compatible abstractions for streaming and non-streaming (`generateText`, `streamText`), automatic retry logic, usage metadata extraction, and pluggable provider support. Using `ai` means we don't hand-roll HTTP to upstreams.

**Alternatives considered:**
- Raw `fetch` to each upstream: would need to handle retries, SSE parsing, usage extraction ourselves
- LangChain: overkill for a proxy; heavier framework with opinions we don't need

### Drizzle ORM with `better-sqlite3` for data layer

**Rationale:** Drizzle is lightweight, type-safe, and has excellent SQLite support. `better-sqlite3` is a mature, synchronous SQLite driver for Node.js (faster than `sqlite3` for read-heavy workloads). Together they give us a schema-first data layer with migrations.

**Alternatives considered:**
- Prisma: heavier, requires engine binary, overkill for SQLite
- Raw SQLite: no type safety, no migrations, more boilerplate
- `sqlite3` driver: async API is slower than `better-sqlite3` for our use case

### Vite + React for Dashboard

**Rationale:** Vite is the standard modern build tool — fast HMR, simple config. React 19 is the latest stable release. The Dashboard is a read-heavy data visualization surface; React with a lightweight data-fetching approach (no heavy state library needed initially) is sufficient.

**Alternatives considered:**
- Svelte: excellent but smaller ecosystem
- Solid: fast but less familiar for most contributors
- HTMX + server-rendered: simpler but less flexible for interactive visualizations

### Token counting: `gpt-tokenizer` + model-specific Hugging Face tokenizers

**Rationale:** For OpenAI models, `gpt-tokenizer` (tiktoken in JS) is accurate. For other models, we'll use `@huggingface/transformers` tokenizer loading. When a tokenizer can't be found, we fall back to null counts — always fulfilling the request.

**Trade-off:** Loading HF tokenizers requires downloading ~10-100MB per model. This is acceptable for a self-hosted tool but means first use of a new model family is slow.

### Single SQLite database file (default: `./manticore.db`)

**Rationale:** Zero-config, single-file, portable. The entire database is one file on disk. Suitable for a personal tool handling thousands to millions of requests.

**Trade-off:** Concurrent writes from multiple processes could cause locking. For a single-node deployment behind one Manticore process, this is fine.

## Risks / Trade-offs

**[Risk]** SQLite becomes a bottleneck at very high request volume → **Mitigation:** SQLite can handle thousands of writes/second; if we outgrow it, migrating to Postgres is straightforward with Drizzle's multi-dialect support.

**[Risk]** Token counting overcounts by 2-5% for streaming due to chunk boundary misalignment → **Mitigation:** Documented and accepted. Non-streaming uses exact counts from upstream when available.

**[Risk]** Vercel AI SDK retry logic is opaque — Manticore may not see individual retry Attempts → **Mitigation:** Attempt concept is relaxed for v1. A Request may map to a single Attempt even if the SDK retried internally. We revisit if users need retry visibility.

**[Risk]** No authentication on Dashboard — anyone on the network can see all usage → **Mitigation:** Documented as intentional. Dashboard binds to localhost by default; users must explicitly expose it.

**[Trade-off]** Dashboard is bundled into the same process as the API. This simplifies deployment but couples their lifecycles. If Dashboard crashes, API goes down. Acceptable for a single-node personal tool.

## Migration Plan

Not applicable — greenfield project with no existing deployment.

## Open Questions

1. **Admin surface parity**: Should CLI and Dashboard have feature parity for Client/Upstream CRUD, or is one the primary interface? (Decision deferred — start with both, see which gets used.)
2. **Dashboard path**: Should API and Dashboard share the same port with path routing (`/` = Dashboard, `/v1/*` = API), or separate ports? (TBD during implementation — separate ports is simpler for now.)
3. **Tokenizer caching**: Should tokenizers be cached in memory across requests, or loaded per-request? (Decision: cache in memory — tokenizers are stateless and expensive to load.)
