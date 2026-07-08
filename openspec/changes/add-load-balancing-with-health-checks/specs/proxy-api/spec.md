## MODIFIED Requirements

### Requirement: Model ID routing
The system SHALL parse the `model` field from the request body as a Model ID of the form `{upstream}/{model-path}`. The upstream name segment SHALL resolve to a registered Upstream. For `manticore/{abstract-name}`, the system SHALL resolve the abstract name to a mapping using session-affinity load balancing across healthy mappings, falling back to the next priority tier if necessary. The `model-path` segment SHALL be passed through to the Upstream unchanged.

#### Scenario: Valid Model ID routes to registered Upstream
- **WHEN** a request specifies `model: "ollama/qwen3:9b"` and an Upstream named `ollama` is registered
- **THEN** the system SHALL forward the request to the `ollama` Upstream's base URL with `model` set to `"qwen3:9b"`

#### Scenario: Unknown upstream name returns error
- **WHEN** a request specifies `model: "unknown/gpt-4o"` and no Upstream named `unknown` is registered
- **THEN** the system SHALL respond with HTTP 404 and an error body in OpenAI-compatible format

#### Scenario: Model ID without upstream segment
- **WHEN** a request specifies `model: "gpt-4o"` without a `{upstream}/` prefix
- **THEN** the system SHALL respond with HTTP 400 and an error body in OpenAI-compatible format

#### Scenario: Abstract model resolves via load-balanced mapping
- **WHEN** a request specifies `model: "manticore/gpt-4o"` and `gpt-4o` has multiple healthy mappings across different upstreams
- **AND** the request includes an `X-Session-Id` header
- **THEN** the system SHALL consistently route the same session to the same upstream among the healthy pool
- **AND** the forwarded request SHALL use the mapped `model-path`

#### Scenario: Abstract model with all unhealthy upstreams falls back to next priority tier
- **WHEN** a request specifies `model: "manticore/gpt-4o"` and all primary-tier mappings are unhealthy, but a secondary-tier mapping exists
- **THEN** the system SHALL route to the secondary-tier mapping

#### Scenario: No healthy mapping returns 404
- **WHEN** a request specifies `model: "manticore/gpt-4o"` and all mappings are unhealthy (or none exist)
- **THEN** the system SHALL respond with HTTP 404
