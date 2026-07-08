## ADDED Requirements

### Requirement: Upstream list includes health status
The system SHALL include the current health `status` in the upstream listing response.

#### Scenario: List upstreams shows health
- **WHEN** a user lists all upstreams
- **THEN** each upstream SHALL include a `healthStatus` field with value `'healthy'`, `'unhealthy'`, or `'unknown'`

### Requirement: Health status can be read and updated
The system SHALL provide endpoints to read and update an upstream's health override.

#### Scenario: Read upstream health
- **WHEN** a user requests `GET /api/upstreams/:id/health`
- **THEN** the system SHALL return the upstream's `status`, `override`, `error_count`, and `request_count`

#### Scenario: Update upstream health override
- **WHEN** a user sends `PATCH /api/upstreams/:id/health` with `{ "override": "unhealthy" }`
- **THEN** the system SHALL set `override` to `'unhealthy'` and `status` to `'unhealthy'`

## MODIFIED Requirements

### Requirement: Upstreams can be listed
The system SHALL provide a way to list all registered Upstreams with their provider names, base URLs, creation dates, and health status. API keys SHALL be masked (e.g., last 4 characters only).

#### Scenario: List all Upstreams
- **WHEN** a user requests the list of Upstreams
- **THEN** the system SHALL return all Upstreams ordered by creation date with masked API keys and a `healthStatus` field reflecting the current health state
