## ADDED Requirements

### Requirement: Upstreams can be registered
The system SHALL allow registration of Upstreams with a unique provider name, base URL, optional API key, and optional custom headers.

#### Scenario: Register an Ollama Upstream
- **WHEN** a user registers an Upstream with provider name `ollama`, base URL `http://localhost:11434`, and no API key
- **THEN** the system SHALL persist the Upstream and make it available for routing

#### Scenario: Register an OpenAI-compatible Upstream
- **WHEN** a user registers an Upstream with provider name `openai`, base URL `https://api.openai.com/v1`, and an API key
- **THEN** the system SHALL persist the Upstream and include the API key in forwarded request headers

### Requirement: Provider names are unique within the instance
The system SHALL enforce that each provider name is unique within the Manticore instance.

#### Scenario: Duplicate provider name rejected
- **WHEN** a user attempts to register an Upstream with a provider name that already exists
- **THEN** the system SHALL reject the request with an error

### Requirement: Upstreams can be listed
The system SHALL provide a way to list all registered Upstreams with their provider names, base URLs, and creation dates. API keys SHALL be masked (e.g., last 4 characters only).

#### Scenario: List all Upstreams
- **WHEN** a user requests the list of Upstreams
- **THEN** the system SHALL return all Upstreams ordered by creation date with masked API keys

### Requirement: Upstreams can be deleted
The system SHALL allow deletion of Upstreams. Deleting an Upstream SHALL NOT delete associated LogRecords.

#### Scenario: Delete an Upstream
- **WHEN** a user deletes an Upstream
- **THEN** subsequent requests targeting that provider name SHALL return HTTP 404

### Requirement: Upstream configuration persists across restarts
The system SHALL store Upstream registrations in the local SQLite database so they survive process restarts.

#### Scenario: Restart after registering Upstream
- **WHEN** the Manticore process restarts after Upstreams have been registered
- **THEN** those Upstreams SHALL be available without re-registration
