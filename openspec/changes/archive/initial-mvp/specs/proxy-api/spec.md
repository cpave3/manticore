## ADDED Requirements

### Requirement: Manticore exposes an OpenAI-compatible chat completions endpoint
The system SHALL expose an HTTP endpoint at `/v1/chat/completions` that accepts requests in the OpenAI chat completions format and returns responses in the same format.

#### Scenario: Valid chat completions request
- **WHEN** a Client sends a POST request to `/v1/chat/completions` with a valid `Authorization: Bearer <api-key>` header and a JSON body containing `model` and `messages`
- **THEN** the system SHALL accept the request and forward it to the resolved Upstream

#### Scenario: Missing API key
- **WHEN** a request is sent to `/v1/chat/completions` without an `Authorization` header
- **THEN** the system SHALL respond with HTTP 401 and an error body in OpenAI-compatible format

#### Scenario: Invalid API key
- **WHEN** a request is sent to `/v1/chat/completions` with an `Authorization` header containing a non-existent API key
- **THEN** the system SHALL respond with HTTP 401 and an error body in OpenAI-compatible format

### Requirement: Model ID routing
The system SHALL parse the `model` field from the request body as a Model ID of the form `{provider}/{model-path}`. The `provider` segment SHALL resolve to a registered Upstream. The `model-path` segment SHALL be passed through to the Upstream unchanged.

#### Scenario: Valid Model ID routes to registered Upstream
- **WHEN** a request specifies `model: "ollama/qwen3:9b"` and an Upstream named `ollama` is registered
- **THEN** the system SHALL forward the request to the `ollama` Upstream's base URL with `model` set to `"qwen3:9b"`

#### Scenario: Unknown provider returns error
- **WHEN** a request specifies `model: "unknown/gpt-4o"` and no Upstream named `unknown` is registered
- **THEN** the system SHALL respond with HTTP 404 and an error body in OpenAI-compatible format

#### Scenario: Model ID without provider segment
- **WHEN** a request specifies `model: "gpt-4o"` without a `{provider}/` prefix
- **THEN** the system SHALL respond with HTTP 400 and an error body in OpenAI-compatible format

### Requirement: Request forwarding preserves OpenAI API shape
The system SHALL forward the request body to the resolved Upstream with all fields intact, except rewriting the `model` field to the provider-specific `model-path`. The system SHALL include any configured Upstream headers (including API key) in the forwarded request.

#### Scenario: Forwarded request includes upstream headers
- **WHEN** a request is forwarded to an Upstream configured with an API key and custom headers
- **THEN** the forwarded request SHALL include those headers and SHALL NOT include the Client's Manticore API key

### Requirement: Streaming responses are forwarded as Server-Sent Events
The system SHALL detect the `stream` field in the request body. When `stream: true`, the system SHALL forward the upstream's SSE stream back to the Client without buffering the full response.

#### Scenario: Streaming request returns SSE
- **WHEN** a Client sends a request with `stream: true`
- **THEN** the system SHALL return an SSE stream to the Client with `Content-Type: text/event-stream`

#### Scenario: Non-streaming request returns JSON
- **WHEN** a Client sends a request with `stream: false` or no `stream` field
- **THEN** the system SHALL return a complete JSON response body

### Requirement: Non-chat endpoints are rejected
The system SHALL reject requests to any path other than `/v1/chat/completions` with HTTP 404 and an informative error message.

#### Scenario: Request to embeddings endpoint
- **WHEN** a Client sends a POST request to `/v1/embeddings`
- **THEN** the system SHALL respond with HTTP 404 and an error indicating only chat completions are supported
