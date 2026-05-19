## ADDED Requirements

### Requirement: Requests can include a Session ID header
The system SHALL accept an optional `X-Session-Id` HTTP header on requests to `/v1/chat/completions`. The header value SHALL be persisted in the request's LogRecord and SHALL NOT be forwarded to upstream providers.

#### Scenario: Request with session ID header
- **WHEN** a Client sends a POST request to `/v1/chat/completions` with a valid API key and an `X-Session-Id: abc-123` header
- **THEN** the created LogRecord SHALL contain `sessionId = "abc-123"`

#### Scenario: Request without session ID header
- **WHEN** a Client sends a POST request to `/v1/chat/completions` with a valid API key and no `X-Session-Id` header
- **THEN** the created LogRecord SHALL contain `sessionId = null`

#### Scenario: Request with session ID over maximum length
- **WHEN** a Client sends a POST request with an `X-Session-Id` header value exceeding 1024 characters
- **THEN** the system SHALL silently truncate the value to 1024 characters before persisting it

#### Scenario: Session ID is not forwarded to upstream
- **WHEN** a Client sends a request with `X-Session-Id: my-session-1`
- **THEN** the forwarded request to the upstream provider SHALL NOT contain the `X-Session-Id` header

### Requirement: Session ID is only captured for authenticated requests
The system SHALL only extract and store the session ID for requests that pass API key authentication. Failed authentication SHALL not produce a LogRecord with a session ID.

#### Scenario: Failed authentication with session ID header
- **WHEN** a request with an invalid API key and `X-Session-Id: abc-123` is sent
- **THEN** the system SHALL return a 401 error and SHALL NOT create a LogRecord with `sessionId = "abc-123"`
