## Why

Manticore currently has no way to correlate multiple requests into a logical "session" for external reporting and cost analysis. We need to support a `X-Session-Id` header so callers can group requests (e.g., a chat thread, a tool invocation, or a multi-turn workflow) and later report on per-session token usage, latency, and error rates.

## What Changes

- Accept an optional `X-Session-Id` HTTP header on `/v1/chat/completions` requests.
- Persist the session ID in `LogRecord` rows in the database.
- Add a database index on `log_records.session_id` to support efficient per-session queries.
- Thread the session ID through all proxy log paths (success, error, cancelled, unhandled-error).
- Do **not** forward the header to upstream providers; it is for Manticore-internal observability only.

## Capabilities

### New Capabilities

- `session-id-header-support`: Accept, validate, and persist a client-supplied session ID for request correlation.

### Modified Capabilities

- `request-logging`: Extend `LogRecord` schema to include an optional `sessionId` field and index it.

## Impact

- **`src/routes/proxy.ts`**: Thread `sessionId` through `buildLogRecord` calls in both streaming and non-streaming paths, plus the error handler.
- **`src/services/logging.ts`**: Accept optional `sessionId` parameter in `buildLogRecord`.
- **`src/db/schema.ts`**: Add `sessionId` column and index to `logRecords` table.
- **`src/middleware/session.ts`**: New middleware to extract `X-Session-Id` from request headers.
- **Migration**: Add SQL migration for new column and index.
- **Tests**: Add coverage for header extraction, truncation, and null-when-absent behavior.
