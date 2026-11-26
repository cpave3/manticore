## ADDED Requirements

### Requirement: Manticore lists routable models with discovered limits
The system SHALL expose `GET /v1/models` authenticated by a Client API key. The response SHALL be an OpenAI-style list whose entries carry the public model reference, the upstream that would serve it (`ownedBy`), the resolved `modelPath`, and a `limits` block with `context`, `input`, and `output` descriptors.

#### Scenario: Mapped alias lists discovered limits
- **WHEN** a mapping `go-kimi → go/kimi-k3` exists and the `go` upstream's catalogue reports `limit: {context: 262144, output: 32768}`
- **THEN** `GET /v1/models` SHALL list `id: "go-kimi"` with `ownedBy: "go"`, `modelPath: "kimi-k3"`, `limits.context` `{status: "discovered", value: 262144}`, `limits.input` `{status: "unknown"}`, and `limits.output` `{status: "discovered", value: 32768}`

#### Scenario: Catalogue models list as direct routes
- **WHEN** the `go` upstream's catalogue contains model `kimi-k3`
- **THEN** `GET /v1/models` SHALL list `id: "go/kimi-k3"` with the same discovered limits, provided that direct spelling routes to the `go` upstream unchanged

#### Scenario: Missing or invalid client key
- **WHEN** `GET /v1/models` is called without an `Authorization` header or with an unknown key
- **THEN** the system SHALL respond with HTTP 401

### Requirement: Unknown limits stay explicitly unknown
The system SHALL report every undiscovered limit as `{status: "unknown"}` and SHALL NOT invent values. ChatGPT Codex upstreams and upstreams without a base URL SHALL NOT trigger any catalogue fetch.

#### Scenario: Codex alias
- **WHEN** a mapping resolves to a `chatgpt-codex` upstream
- **THEN** the alias SHALL be listed with all three limits `{status: "unknown"}` and no catalogue fetch SHALL occur

#### Scenario: Invalid upstream values
- **WHEN** a catalogue reports a limit value that is not a positive finite integer
- **THEN** the system SHALL treat that field as omitted and keep any previously discovered value

### Requirement: Discovery is cached per upstream identity and bounded
The system SHALL cache catalogues in memory, one entry per upstream identity (chat base URL, upstream credential, and static headers). Session-templated headers SHALL NOT be forwarded into discovery requests. A successful read SHALL serve subsequent requests for the refresh interval; later requests SHALL refresh behind the response while serving last-known values. A discovered value SHALL NOT be served past its max verified age, and failed or omitted values SHALL NOT renew that age. Concurrent requests with nothing fresh to serve SHALL share a single in-flight fetch bounded by a timeout.

#### Scenario: Failure keeps last known
- **WHEN** a refresh attempt fails while fresh values are cached
- **THEN** the response SHALL serve the last-known discovered values and the failing upstream SHALL NOT be retried within the refresh interval

#### Scenario: Max verified age
- **WHEN** a discovered limit is older than the max verified age and cannot be re-verified
- **THEN** the response SHALL report `{status: "unknown"}` for that limit

#### Scenario: Repointed mapping
- **WHEN** a mapping is changed to a different upstream
- **THEN** subsequent discovery SHALL read only the new upstream's identity and catalogue
