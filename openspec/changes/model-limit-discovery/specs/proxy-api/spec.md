## MODIFIED Requirements

### Requirement: Manticore exposes an OpenAI-compatible chat completions endpoint
The system SHALL expose an HTTP endpoint at `/v1/chat/completions` that accepts requests in the OpenAI chat completions format and returns responses in the same format. `GET /v1/model-capabilities` responses SHALL additionally carry a `limits` block (`context`, `input`, `output` descriptors) resolved through the same route selection; the block SHALL be additive and SHALL NOT change the existing capability fields or the fingerprint.

#### Scenario: Valid chat completions request
- **WHEN** a Client sends a POST request to `/v1/chat/completions` with a valid `Authorization: Bearer <api-key>` header and a JSON body containing `model` and `messages`
- **THEN** the system SHALL accept the request and forward it to the resolved Upstream

#### Scenario: Missing API key
- **WHEN** a request is sent to `/v1/chat/completions` without an `Authorization` header
- **THEN** the system SHALL respond with HTTP 401 and an error body in OpenAI-compatible format

#### Scenario: Invalid API key
- **WHEN** a request is sent to `/v1/chat/completions` with an `Authorization` header containing a non-existent API key
- **THEN** the system SHALL respond with HTTP 401 and an error body in OpenAI-compatible format

#### Scenario: Capabilities response keeps its existing shape
- **WHEN** a Client requests `/v1/model-capabilities?model=<reference>` for a route with discovered limits
- **THEN** the response SHALL contain the same `schemaVersion`, `modelId`, `requestedModel`, `profile`, `source`, `fingerprint`, and `settings` as before, plus the new `limits` block, and the fingerprint SHALL NOT change when only the discovered limits change
