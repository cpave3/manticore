## 1. Project Bootstrap

- [x] 1.1 Initialize TypeScript project with `package.json`, `tsconfig.json`
- [x] 1.2 Install runtime dependencies: `hono` (4.x), `@hono/node-server` (2.x), `ai` (6.x), `drizzle-orm` (0.45.x), `better-sqlite3` (12.x), `zod` (4.x), `@huggingface/transformers` (latest)
- [x] 1.3 Install dev dependencies: `typescript` (6.x), `tsx` (4.x), `vite` (8.x), `@vitejs/plugin-react` (6.x), `drizzle-kit` (0.31.x), `@types/better-sqlite3` (7.x), `@types/node` (22.x)
- [x] 1.4 Install Dashboard dependencies: `react` (19.x), `react-dom` (19.x)
- [x] 1.5 Set up project structure: `src/` (server code), `dashboard/` (Vite + React frontend)
- [x] 1.6 Configure `drizzle.config.ts` for SQLite with `better-sqlite3` driver

## 2. Database Schema and Migrations

- [x] 2.1 Define Drizzle schema: `clients` table (id, name, apiKey, createdAt)
- [x] 2.2 Define Drizzle schema: `upstreams` table (id, name, baseUrl, apiKey, headers, createdAt)
- [x] 2.3 Define Drizzle schema: `logRecords` table (id, clientId, modelId, upstreamId, promptTokens, completionTokens, totalTokens, latencyMs, timeToFirstTokenMs, finishReason, status, createdAt)
- [x] 2.4 Create SQLite database connection utility with `better-sqlite3`
- [x] 2.5 Run initial Drizzle migration to create tables

## 3. Client Management

- [x] 3.1 Implement `POST /api/clients` — create Client with auto-generated API key (prefix + crypto.randomUUID)
- [x] 3.2 Implement `GET /api/clients` — list all Clients with masked API keys
- [x] 3.3 Implement `DELETE /api/clients/:id` — delete Client (soft or hard delete)
- [x] 3.4 Implement API key validation middleware for proxy endpoint
- [x] 3.5 Add Zod schemas for Client CRUD request/response bodies

## 4. Upstream Management

- [x] 4.1 Implement `POST /api/upstreams` — register Upstream with name, baseUrl, apiKey, headers
- [x] 4.2 Implement `GET /api/upstreams` — list all Upstreams with masked API keys
- [x] 4.3 Implement `DELETE /api/upstreams/:id` — delete Upstream
- [x] 4.4 Implement Model ID resolution: split `{provider}/{model-path}`, look up Upstream by provider name
- [x] 4.5 Add Zod schemas for Upstream CRUD request/response bodies

## 5. Proxy API — Request Forwarding

- [x] 5.1 Implement `POST /v1/chat/completions` route with Hono
- [x] 5.2 Extract and validate API key from `Authorization: Bearer <key>` header
- [x] 5.3 Parse `model` field from request body, resolve to Upstream using provider name
- [x] 5.4 Forward request body to resolved Upstream via Vercel AI SDK `streamText` (streaming) or `generateText` (non-streaming)
- [x] 5.5 Rewrite `model` field to provider-specific `model-path` before forwarding
- [x] 5.6 Include configured Upstream headers and API key, exclude Client's Manticore key
- [x] 5.7 Return streamed SSE response for `stream: true` requests
- [x] 5.8 Return complete JSON response for `stream: false` requests
- [x] 5.9 Reject non-chat endpoints with 404

## 6. Request Logging

- [x] 6.1 Intercept proxy requests on entry: record start timestamp, Client ID, Model ID
- [x] 6.2 Count Prompt Tokens: apply chat template using tokenizer or upstream-reported usage
- [x] 6.3 For non-streaming: record total latency, extract `usage` from response, write LogRecord
- [x] 6.4 For streaming: intercept SSE chunks, accumulate completion text, count tokens on the fly
- [x] 6.5 Record time-to-first-token on first SSE chunk received
- [x] 6.6 On stream end or client disconnect: write LogRecord with final token counts and latency
- [x] 6.7 Implement token counting fallback: upstream usage → Hugging Face tokenizer → null
- [x] 6.8 Cache tokenizers in memory keyed by model name to avoid repeated loads
- [x] 6.9 Ensure LogRecord is written even for failed requests (502, timeout, invalid model)

## 7. Dashboard — Frontend Build

- [x] 7.1 Configure Vite for Dashboard with React plugin
- [x] 7.2 Set up Dashboard Dev server and production build output
- [x] 7.3 Create Dashboard API client for fetching usage data from backend endpoints
- [x] 7.4 Implement `/api/dashboard/*` JSON endpoints: aggregates by Client, Model, Upstream, time series
- [x] 7.5 Serve Dashboard static files from Hono in production (`app.get("/", serveStatic)`)

## 8. Dashboard — Visualization

- [x] 8.1 Build summary cards: total requests, total prompt tokens, total completion tokens
- [x] 8.2 Build bar chart / table for token usage by Client
- [x] 8.3 Build bar chart / table for token usage by Model ID
- [x] 8.4 Build bar chart / table for token usage by Upstream
- [x] 8.5 Build time-series chart for requests/token usage over time (hourly/daily buckets)
- [x] 8.6 Build paginated, sortable event log table with all LogRecord columns
- [x] 8.7 Add manual refresh button and optional auto-refresh interval

## 9. Tokenizer Support

- [x] 9.1 Implement `getTokenizer(modelName)` — load from Hugging Face Hub via `@huggingface/transformers`
- [x] 9.2 Implement `countPromptTokens(messages, modelName)` — apply chat template, count tokens
- [x] 9.3 Implement `countCompletionTokens(text, modelName)` — count text tokens
- [x] 9.4 Add `gpt-tokenizer` for exact OpenAI model counting (tiktoken in JS)
- [x] 9.5 Handle tokenizer load failures gracefully (fallback to null counts, log warning)

## 10. CLI and Entry Points

- [x] 10.1 Create `src/index.ts` main entry point: start HTTP server with configurable port
- [x] 10.2 Create `src/cli.ts` CLI entry point for ad-hoc commands (create client, list upstreams, etc.)
- [x] 10.3 Read configuration from environment variables (ports, database path, log level)
- [x] 10.4 Add `start`, `dev`, `build` scripts in `package.json`

## 11. Testing and Integration

- [x] 11.1 Add manual test script: create a Client, register an Ollama Upstream, send a request via curl
- [x] 11.2 Verify streaming and non-streaming paths end-to-end
- [x] 11.3 Verify LogRecords are created for both success and failure cases
- [x] 11.4 Verify Dashboard loads and displays aggregated data
