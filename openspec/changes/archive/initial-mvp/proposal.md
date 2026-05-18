## Why

Developers running real AI stacks have no visibility into their token usage. Provider dashboards lump everything together, making it impossible to tell which app, script, or model drove last month's bill. Manticore gives every app a unique API key, logs every request, and turns usage into something you can actually query — all self-hosted, all local.

## What Changes

- Create a single Manticore TypeScript application with three surfaces: a proxy API (`/v1/chat/completions`), a web Dashboard, and a CLI.
- Implement OpenAI-compatible chat completions forwarding with model routing by `{provider}/{model-path}`.
- Capture per-request metadata (timestamps, token counts, latency, finish reason, status) into a local SQLite database.
- Serve a web Dashboard for visualizing usage data with aggregations by Client, Model ID, Upstream, and time window.
- Support both streaming and non-streaming requests via Vercel AI SDK.
- Use best-effort token counting: upstream-reported usage first, Hugging Face tokenizer fallback, null counts if neither works.
- Create a simple admin surface (Dashboard or CLI) for managing Clients (unique API keys) and Upstreams (provider registrations).

## Capabilities

### New Capabilities
- `proxy-api`: OpenAI-compatible chat completions endpoint with model routing and request forwarding.
- `request-logging`: Capture metadata for every request into SQLite with token counting and latency tracking.
- `dashboard`: Web application served alongside the API for querying and visualizing usage data.
- `client-management`: Create and manage Clients with unique API keys for usage attribution.
- `upstream-management`: Register and configure backend providers with base URLs, API keys, and headers.

### Modified Capabilities
- _(none — greenfield project)_

## Impact

- New Node.js/TypeScript application using Hono for HTTP, Vercel AI SDK for LLM calls, Drizzle ORM for SQLite, and a React-based Dashboard.
- Single binary / Docker image; no external dependencies beyond the host machine.
- Dashboard is unauthenticated (trusted-network access only).
- No rate limiting, cost tracking, multi-user tenancy, or non-chat endpoint support in v1.
