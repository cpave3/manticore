# Manticore

**Manticore** is a self-hosted proxy that sits between AI-powered applications and upstream model providers. It exposes all backends behind a single OpenAI-compatible `/v1/chat/completions` endpoint, attributes every request to a unique **Client**, and records detailed usage data into a local SQLite store. A built-in **Dashboard** served by the same process lets you visualize token consumption, latency, and request history.

> Manticore is a single-user, single-process tool — there is no authentication on the Dashboard or management APIs. See [ADR-0001](docs/adr/0001-single-user-no-auth.md) for the rationale.

---

## Quick start

```bash
# Install dependencies
pnpm install

# Run migrations to create the SQLite schema
pnpm db:migrate

# Start the API server (default port 3456)
pnpm dev

# In another shell, start the dashboard dev server (port 5173)
pnpm dashboard:dev
```

---

## Creating a Client and Upstream via CLI

```bash
# Create a client — note the full API key (shown once)
pnpm cli clients create my-app

# Register an Ollama upstream
pnpm cli upstreams create ollama http://localhost:11434

# List clients
pnpm cli clients list

# List upstreams
pnpm cli upstreams list
```

You can also use the REST API directly:

```bash
curl -s -X POST http://localhost:3456/api/clients \
  -H 'content-type: application/json' \
  -d '{"name":"my-app"}'

curl -s -X POST http://localhost:3456/api/upstreams \
  -H 'content-type: application/json' \
  -d '{"name":"ollama","baseUrl":"http://localhost:11434"}'
```

---

## Making proxy requests

The `/v1/chat/completions` endpoint accepts the standard OpenAI payload, with the `model` field encoded as `{provider}/{model-path}` (e.g. `ollama/qwen2.5:0.5b`).

### Non-streaming

```bash
curl -s -X POST http://localhost:3456/v1/chat/completions \
  -H "authorization: Bearer $MANTICORE_API_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "model": "ollama/qwen2.5:0.5b",
    "messages": [{"role":"user","content":"Say hello"}],
    "stream": false
  }'
```

### Streaming (SSE)

```bash
curl -s -X POST http://localhost:3456/v1/chat/completions \
  -H "authorization: Bearer $MANTICORE_API_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "model": "ollama/qwen2.5:0.5b",
    "messages": [{"role":"user","content":"Say hello"}],
    "stream": true
  }'
```

---

## Dashboard

When running in production mode (`NODE_ENV=production` or when a `dashboard/dist/index.html` exists), Manticore serves the dashboard static files alongside the API.

- **Production**: open `http://localhost:3456/` in a browser.
- **Development**: run `pnpm dashboard:dev` and visit `http://localhost:5173`.

The dashboard shows aggregated summary cards, time-series charts, and a paginated event log.

---

## Environment variables

| Variable            | Default           | Description                                    |
|---------------------|-------------------|------------------------------------------------|
| `MANTICORE_PORT`    | `3456`            | HTTP server port                               |
| `MANTICORE_DB_PATH` | `./manticore.db`  | SQLite database file path                      |
| `MANTICORE_LOG_LEVEL` | `info`          | One of `debug`, `info`, `warn`, `error`        |
| `MANTICORE_HOST`    | `127.0.0.1`       | Bind address (set to `0.0.0.0` for Docker)     |
| `NODE_ENV`          | `development`     | Triggers dashboard build vs. dev message        |

---

## Docker

Build and run in one go:

```bash
docker build -t manticore .
docker run -p 3456:3456 -v $(pwd)/data:/data manticore
```

The container:
- mounts `/data` as a volume for the SQLite database,
- binds to `0.0.0.0:3456`,
- runs migrations automatically on startup.

---

## Architecture

Manticore is built with **Hono** (server), **Drizzle ORM + better-sqlite3** (data layer), **Vercel AI SDK** (proxy streaming), and **React + Vite** (Dashboard). It is intentionally minimal: a single Node.js process, no containers required, and no remote dependencies beyond the upstream model providers you choose to register.

---

## License

MIT
