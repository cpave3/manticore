## ADDED Requirements

### Requirement: LogRecords support an optional session ID
The system SHALL persist an optional `sessionId` field in every LogRecord. The field SHALL be populated from the `X-Session-Id` request header when present and SHALL be null when the header is absent.

#### Scenario: Successful request with session ID records session data
- **WHEN** a request completes successfully with `X-Session-Id: thread-42` 
- **THEN** the LogRecord SHALL contain `sessionId = "thread-42"`, along with all other standard fields

#### Scenario: Failed upstream request with session ID records session data
- **WHEN** an upstream returns a 502 error and the request included `X-Session-Id: thread-42`
- **THEN** the LogRecord SHALL contain `sessionId = "thread-42"` and status = error

#### Scenario: Cancelled stream with session ID records session data
- **WHEN** a Client disconnects mid-stream and the request included `X-Session-Id: thread-42`
- **THEN** the LogRecord SHALL contain `sessionId = "thread-42"` and status = cancelled
