## 1. Schema & Migration

- [x] 1.1 Add `sessionId: text('session_id')` column to `logRecords` table in `src/db/schema.ts`
- [x] 1.2 Add `index('log_records_session_id_idx').on(table.sessionId)` to `logRecords` table definition
- [x] 1.3 Create SQL migration file `migrations/0003_add_session_id.sql` adding column and index to existing tables
- [x] 1.4 Update `migrations/meta/_journal.json` with new migration entry

## 2. Session Extraction Middleware

- [x] 2.1 Create `src/middleware/session.ts` with `extractSessionId()` middleware using Hono's `createMiddleware`
- [x] 2.2 Implement header extraction via `c.req.header('X-Session-Id')` (case-insensitive)
- [x] 2.3 Implement 1K max length truncation, store result on `c.var.sessionId`
- [x] 2.4 Register `sessionId` in Hono's `ContextVariableMap` via module declaration

## 3. Logging Service

- [x] 3.1 Add optional `sessionId?: string | null` parameter to `buildLogRecord()` in `src/services/logging.ts`
- [x] 3.2 Include `sessionId: params.sessionId ?? null` in the returned `LogRecordInsert` object

## 4. Proxy Route Integration

- [x] 4.1 Import `extractSessionId` middleware in `src/routes/proxy.ts`
- [x] 4.2 Add middleware to `/chat/completions` route: `app.use('/chat/completions', apiKeyAuth(), extractSessionId())`
- [x] 4.3 Thread `sessionId: c.var.sessionId` through all `buildLogRecord` calls (unknown upstream, upstream error, fetch throw, streaming success/error/cancelled, non-streaming success/error)
- [x] 4.4 Leave `onError` handler's log record without sessionId (runs before middleware)

## 5. Testing

- [x] 5.1 Create `tests/middleware/session.test.ts` testing: absent header → null, present header → value, truncation, empty string → null
- [x] 5.2 Update `tests/services/logging.test.ts` to verify `buildLogRecord` accepts and returns `sessionId`
- [x] 5.3 Update `tests/integration/proxy.test.ts` with tests for session ID on success, error, and streaming paths
- [x] 5.4 Run `pnpm test` to verify all existing tests still pass
