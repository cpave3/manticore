# Manticore

**Manticore** is a self-hosted proxy that sits between AI-powered applications and upstream model providers. It exposes all backends behind a single OpenAI-compatible `/v1/chat/completions` endpoint, attributes every request to a unique **Client**, and records detailed usage data into a local SQLite store. A built-in **Dashboard** served by the same process lets you visualize token consumption, latency, and request history.

> Manticore is a single-user, single-process tool — there is no authentication on the Dashboard or management APIs. See [ADR-0001](docs/adr/0001-single-user-no-auth.md) for the rationale.

---

## Quick start

See [model generation settings](docs/model-settings.md) for capability discovery and Codex translation.

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

# Register a ChatGPT Codex upstream
pnpm cli upstreams create codex --type chatgpt-codex

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

## OpenCode Go as an OpenAI-compatible upstream

Register Go's subscription endpoint as an ordinary upstream (not pay-as-you-go Console).
The key value is stored on the upstream record, like other OpenAI-compatible keys:

```bash
# OPENCODE_GO_API_KEY is a shell variable holding your key, not a stored reference.
pnpm cli upstreams create go https://opencode.ai/inference/go/openai/v1 \
  --api-key "$OPENCODE_GO_API_KEY" \
  --header 'x-opencode-session={sessionId}' \
  --header 'User-Agent=manticore'
pnpm cli model-mappings create go-kimi go kimi-k3
```

Alternatively, use Dashboard → Upstreams with the same base URL and API key, and
Headers JSON `{"x-opencode-session":"{sessionId}","User-Agent":"manticore"}`.
`kimi-k3` is a model example in the [vendor Go docs](https://opencode.ai/docs/go);
check current availability before using it.

A custom header whose **entire value** is `{sessionId}` is filled from the caller's
existing `X-Session-Id` (trimmed, capped at 1024 characters). Reuse one ID across
turns/retries, and use different IDs for independent conversations. Missing/blank
IDs return HTTP 400: `Upstream 'go' requires X-Session-Id: send a stable conversation ID`.
Fixed header values are unchanged; no fallback identity is generated.

In Chimera's existing Manticore provider configuration, merge
`"headers": {"X-Session-Id":"{{session.id}}"}` (Chimera does not add it automatically).
Keep its Manticore URL and Client key, then select `chimera -m manticore/go-kimi`.
Chimera's `{{session.id}}` expands to its existing conversation identity; Manticore
then remaps it to Go's `x-opencode-session` using `{sessionId}`. No live Go account
smoke test has been performed.

---

## ChatGPT Codex authentication

Manticore can route to Codex models through your ChatGPT Plus/Pro/Teams subscription using ChatGPT OAuth. This is separate from OpenAI Platform API keys.

Register a Codex upstream once:

```bash
pnpm cli upstreams create codex --type chatgpt-codex
```

Then authenticate with one of these modes.

### Browser login

Use this on a local machine where `localhost:1455` can receive the OAuth callback:

```bash
pnpm cli codex login
```

The CLI prints an OpenAI auth URL. Open it in your browser, complete login, and Manticore stores the returned access and refresh tokens in its SQLite database.

### Device-code login

Use this for SSH/headless environments:

```bash
pnpm cli codex login --device-code
```

The CLI prints a verification URL and one-time code. Open the URL in any browser, enter the code, and the CLI polls until authentication completes.

### Status and logout

```bash
pnpm cli codex status
pnpm cli codex logout
```

`status` shows whether credentials are stored and when the access token expires. Manticore refreshes expired access tokens automatically using the stored refresh token.

After registering and authenticating, use Codex through the normal OpenAI-compatible Manticore endpoint:

```bash
curl -s -X POST http://localhost:3456/v1/chat/completions \
  -H "authorization: Bearer $MANTICORE_API_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "model": "codex/gpt-5.5",
    "messages": [{"role":"user","content":"Say hello from Codex"}],
    "stream": false
  }'
```

Streaming works the same way with `"stream": true`.

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

### Session correlation

You can optionally pass an `X-Session-Id` header to group related requests (e.g. a chat thread or multi-turn workflow). The value is persisted in the request's LogRecord for per-session reporting, and is never forwarded to upstream providers.

```bash
curl -s -X POST http://localhost:3456/v1/chat/completions \
  -H "authorization: Bearer $MANTICORE_API_KEY" \
  -H 'content-type: application/json' \
  -H 'x-session-id: thread-42' \
  -d '{
    "model": "ollama/qwen2.5:0.5b",
    "messages": [{"role":"user","content":"Say hello"}],
    "stream": false
  }'
```

> Values over 1024 characters are silently truncated. Empty or whitespace-only values are treated as absent.

---

## Model discovery and limits

`GET /v1/models` (Client API key) lists every routable model reference — aliases under their bare abstract name and upstream catalogue models as `{provider}/{model}` — each with `context`/`input`/`output` limits marked `discovered` or `unknown`:

```bash
curl -s http://localhost:3456/v1/models \
  -H "authorization: Bearer $MANTICORE_API_KEY"
# {"object":"list","data":[{"id":"go-kimi","object":"model","ownedBy":"go","modelPath":"kimi-k3",
#   "limits":{"context":{"status":"discovered","value":262144},"input":{"status":"unknown"},
#             "output":{"status":"discovered","value":32768}}}, …]}
```

Limits are fetched from each upstream's own `/models` catalogue with the upstream's credential, cached per upstream identity for five minutes, and re-verified at most daily; unshareable per-session headers never enter discovery. `GET /v1/model-capabilities?model=` includes the same `limits` block for its resolved route. See [discovered limits](docs/model-settings.md#discovered-limits).

---

## Reporting usage Manticore did not proxy

A Client that must call its model provider directly can still have its usage recorded: it reports each request after the fact to `POST /v1/usage`, with its API key. Manticore stores one LogRecord per reported request, attributed to that Client, and shows it in the Dashboard beside proxied requests. Nothing is forwarded and no message content is sent or stored.

```bash
curl -s -X POST http://localhost:3456/v1/usage \
  -H "authorization: Bearer $MANTICORE_API_KEY" \
  -H 'content-type: application/json' \
  -H 'x-session-id: thread-42' \
  -d '{
    "records": [{
      "id": "thread-42:turn-7:0",
      "model": "claude-opus-5-5",
      "upstream": "anthropic",
      "prompt_tokens": 1200,
      "completion_tokens": 300,
      "cache_read_tokens": 1000,
      "cache_creation_tokens": 150,
      "latency_ms": 4200,
      "time_to_first_token_ms": 800,
      "finish_reason": "end_turn",
      "started_at": 1790000000000
    }]
  }'
# {"accepted":1,"duplicates":0}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `model` | yes | The model that answered, as the reporter names it. Stored as the LogRecord's model. |
| `prompt_tokens`, `completion_tokens` | yes | Token counts. `prompt_tokens` is the whole prompt, cached tokens included. |
| `cache_read_tokens`, `cache_creation_tokens` | no | How much of the prompt the provider's prompt cache served or stored. Together they cannot exceed `prompt_tokens`. |
| `upstream` | no | A label for the provider that served the request. It appears in the upstream breakdown; it does not have to be a registered Upstream. |
| `id` | no | The reporter's own id for the request. A record with an id is stored once per Client however often it is sent, so a report whose answer was lost can be sent again. |
| `latency_ms`, `time_to_first_token_ms`, `finish_reason` | no | As measured by the reporter. `latency_ms` defaults to 0. |
| `started_at` | no | When the request began, in milliseconds since the Unix epoch. Defaults to when the report arrived. |

A report holds 1 to 500 records and is all-or-nothing: one invalid record rejects the whole report with `400`. `X-Session-Id` applies to every record in the report. The response counts the records `accepted` and the `duplicates` that were already stored.

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

## Rebuild, migrate, and restart systemd

From the project directory:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm db:migrate
```

`pnpm db:migrate` uses the same `MANTICORE_DB_PATH` setting as the app, defaulting to `./manticore.db`. If Manticore runs under systemd, inspect the unit first so you run migrations with the same working directory and environment:

```bash
systemctl --user cat manticore.service
# or, for a system service:
sudo systemctl cat manticore.service
```

Restart and watch logs for a user service:

```bash
systemctl --user restart manticore.service
systemctl --user status manticore.service
journalctl --user -u manticore.service -n 100 -f
```

Restart and watch logs for a system service:

```bash
sudo systemctl restart manticore.service
sudo systemctl status manticore.service
sudo journalctl -u manticore.service -n 100 -f
```

The server also runs migrations during startup, but running `pnpm db:migrate` explicitly before restarting makes migration errors easier to diagnose.

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

### Build, tag, and push a new image version

Run these commands from the Manticore repository on your build machine. You need Docker with Buildx and permission to push to the Docker Hub repository. The checked-in Unraid template uses `cpave3/manticore`; change the image name if you publish under another account.

Choose a new, unused version tag for each release. `0.1.2` below is an example, not an automatically selected version. The build uses the current working tree; an image tag does not update `package.json` or create a Git tag.

```bash
MANTICORE_IMAGE=cpave3/manticore
MANTICORE_VERSION=0.1.2

# Check that the working tree contains the changes you want to release.
git status --short

# Authenticate to Docker Hub with an account that can push this image.
docker login

# Build for an x86-64 Unraid server and load the versioned image locally.
docker buildx build \
  --platform linux/amd64 \
  --tag "${MANTICORE_IMAGE}:${MANTICORE_VERSION}" \
  --load \
  .

# Push the versioned image to Docker Hub.
docker push "${MANTICORE_IMAGE}:${MANTICORE_VERSION}"

# Check the published image manifest.
docker buildx imagetools inspect "${MANTICORE_IMAGE}:${MANTICORE_VERSION}"
```

The Dockerfile installs dependencies and builds both the server and dashboard. You do not need to run `pnpm build` separately before building the image. Use a builder that supports `linux/amd64`; an ARM build machine needs cross-platform build support. See the [Unraid deployment guide](docs/unraid-deployment.md#1-publish-the-docker-image) for a multi-platform build-and-push command.

If you also maintain a moving `latest` tag, publish it after verifying the versioned image. This replaces the registry's previous `latest` reference but leaves the versioned tag available:

```bash
docker tag "${MANTICORE_IMAGE}:${MANTICORE_VERSION}" "${MANTICORE_IMAGE}:latest"
docker push "${MANTICORE_IMAGE}:latest"
```

Use the versioned tag in Unraid so publishing `latest` does not change the selected release. Docker documents the commands under [Buildx build](https://docs.docker.com/reference/cli/docker/buildx/build/), [image tag](https://docs.docker.com/reference/cli/docker/image/tag/), and [image push](https://docs.docker.com/reference/cli/docker/image/push/).

### Deploy the new version on Unraid

Publishing an image does not update a running container. After the push succeeds:

1. Make and verify a [database backup](docs/unraid-deployment.md#8-back-up-manticore-on-unraid).
2. Edit the Manticore container in Unraid and set **Repository** to the new tag, for example `cpave3/manticore:0.1.2`.
3. Keep the existing `/data` mount, environment settings, and port mappings unchanged. Select **Apply** to deploy the new image; this replaces the running Manticore container.
4. Check `docker logs --tail 100 Manticore` for startup or migration errors, using your actual container name if different.

Included database migrations run automatically at startup; do not run `drizzle-kit` on Unraid. The model-generation-settings release adds no database migration. Keep the backup for later releases because rolling back an image does not roll back its database migrations. See the [full upgrade instructions](docs/unraid-deployment.md#9-upgrade-manticore) for verification and rollback considerations.

---

## Architecture

Manticore is built with **Hono** (server), **Drizzle ORM + better-sqlite3** (data layer), **Vercel AI SDK** (proxy streaming), and **React + Vite** (Dashboard). It is intentionally minimal: a single Node.js process, no containers required, and no remote dependencies beyond the upstream model providers you choose to register.

---

## License

MIT
