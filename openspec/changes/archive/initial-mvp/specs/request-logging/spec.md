## ADDED Requirements

### Requirement: Every request produces a LogRecord
The system SHALL persist a LogRecord for every HTTP request received at the chat completions endpoint, regardless of success, failure, or completion status.

#### Scenario: Successful request creates LogRecord
- **WHEN** a request completes successfully and returns a 200 response
- **THEN** a LogRecord SHALL be created with the Client ID, Model ID, Upstream name, timestamps, token counts, latency, and status

#### Scenario: Failed upstream request creates LogRecord
- **WHEN** an upstream returns a 502 error before sending any content
- **THEN** a LogRecord SHALL still be created with zero prompt and completion tokens

#### Scenario: Cancelled stream creates LogRecord
- **WHEN** a Client disconnects mid-stream after receiving 50 completion tokens
- **THEN** a LogRecord SHALL be created recording those 50 completion tokens

### Requirement: Token counting uses a priority fallback
The system SHALL count Prompt Tokens and Completion Tokens using the following priority: upstream-reported usage metadata first, Hugging Face tokenizer second, null counts as final fallback.

#### Scenario: Upstream reports usage metadata
- **WHEN** an upstream returns a response with `usage.prompt_tokens` and `usage.completion_tokens`
- **THEN** the LogRecord SHALL use those exact values

#### Scenario: Upstream does not report usage but tokenizer is available
- **WHEN** an upstream does not include usage metadata but a Hugging Face tokenizer is loaded for the model
- **THEN** the system SHALL count tokens locally using the tokenizer and record the counts

#### Scenario: No counting method available
- **WHEN** neither upstream usage nor a local tokenizer is available
- **THEN** the LogRecord SHALL be created with null token counts and the request SHALL still be fulfilled

### Requirement: Prompt Tokens include the rendered chat template
The system SHALL count Prompt Tokens from the request body after applying the model's chat template (role markers, formatting, special tokens).

#### Scenario: Messages with system and user roles
- **WHEN** a request contains messages with `system`, `user`, and `assistant` roles
- **THEN** the Prompt Token count SHALL include the tokens from the formatted template, not just the raw message text

### Requirement: Latency metrics are recorded per Request
The system SHALL record multiple latency metrics for each Request: total end-to-end latency and time-to-first-token (or first byte for non-streaming).

#### Scenario: Streaming request records TTF
- **WHEN** a streaming request returns its first SSE chunk
- **THEN** the LogRecord SHALL record the time elapsed from request receipt to first chunk as time-to-first-token

#### Scenario: Non-streaming request records latency
- **WHEN** a non-streaming request returns a complete JSON response
- **THEN** the LogRecord SHALL record the total elapsed time and the time-to-first-byte

### Requirement: LogRecords contain only metadata
The system SHALL NOT store request or response content (messages, completions) in LogRecords. Only metadata fields are persisted.

#### Scenario: Request with private data
- **WHEN** a request contains sensitive information in the messages array
- **THEN** the LogRecord SHALL NOT contain any message content, only the Client ID, Model ID, timestamps, token counts, latency, finish reason, and status
