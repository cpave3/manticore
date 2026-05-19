## Context

Manticore is an LLM proxy that routes chat completions requests to upstream providers. Every request produces a `LogRecord` in SQLite for observability. Currently, LogRecords can be grouped by client or upstream, but there is no way for callers to tag requests with a logical session ID (e.g., a chat thread, a tool invocation, or a multi-turn workflow). This makes per-session cost and token analysis impossible without re-building correlation outside of Manticore.

## Goals / Non-Goals

**Goals:**
- Accept an optional `X-Session-Id` header on `/v1/chat/completions` 
- Persist the session ID in `LogRecord` rows
- Index `session_id` in the database for efficient per-session reporting

**Non-Goals:**
- Adding a dashboard UI for session-based reporting (raw log rows only)
- Forwarding `X-Session-Id` to upstream providers
- Auto-generating session IDs when the header is absent
- Session-level rate limiting or quotas

## Decisions

### Header name: `X-Session-Id`
- **Rationale**: Standard `X-*` naming convention for non-standard HTTP headers. Hono's `c.req.header()` is case-insensitive by HTTP spec.
- **Alternative considered**: `X-Manticore-Session` — rejected as unnecessarily vendor-specific.

### Optional, nullable in DB
- **Rationale**: Not all callers have a session concept. Forcing a session ID would break existing clients and require a default/fallback value.
- **Alternative considered**: Auto-generate a UUID per request — rejected because it would create noise and defeat the purpose of caller-defined correlation.

### Dedicated middleware after auth
- **Rationale**: Only authenticated requests should contribute to session stats. Auth failures (401) should not create log rows with session IDs.
- **Location**: `app.use('/chat/completions', apiKeyAuth(), extractSessionId())` in `proxy.ts`.

### Max length 1K, silently truncated
- **Rationale**: Prevents index bloat and abuse while staying permissive for practical session identifiers (UUIDs, composite keys, ULIDs).
- **Behavior**: Values over 1024 characters are truncated; empty strings are treated as absent (null).

### SQLite `text` with index
- **Rationale**: Session IDs are opaque strings — no fixed format enforced. An index supports `WHERE session_id = ?` and `GROUP BY session_id` queries for per-session reports.
- **Location**: `log_records.session_id` column + `log_records_session_id_idx`.

### Do not forward to upstreams
- **Rationale**: Upstream providers may reject unknown headers. The session ID is purely for Manticore's own event log.

## Risks / Trade-offs

- **Index overhead on large tables** → `session_id` is nullable; SQLite handles sparse indexes efficiently.
- **Header collision** → `X-Session-Id` is a widely used header name; callers that already use it for other purposes will have it captured here. This is acceptable — the header is optional and the semantics are aligned.
