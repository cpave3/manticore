## ADDED Requirements

### Requirement: Clients can be created with unique API keys
The system SHALL allow creation of Clients. Each Client SHALL have a unique, unguessable API key and a display name for identification.

#### Scenario: Create a new Client
- **WHEN** a user creates a Client with the name "My Coding Agent"
- **THEN** the system SHALL generate a unique API key and persist the Client

#### Scenario: API key uniqueness
- **WHEN** the system generates an API key for a new Client
- **THEN** that key SHALL NOT collide with any existing Client's API key

### Requirement: Clients can be listed
The system SHALL provide a way to list all created Clients with their names, API key prefixes (for identification), and creation dates.

#### Scenario: List all Clients
- **WHEN** a user requests the list of Clients
- **THEN** the system SHALL return all Clients ordered by creation date

### Requirement: Clients can be deleted
The system SHALL allow deletion of Clients. Deleting a Client SHALL NOT delete associated LogRecords — historical usage data SHALL remain queryable.

#### Scenario: Delete a Client
- **WHEN** a user deletes a Client
- **THEN** the Client's API key SHALL be invalidated, but existing LogRecords for that Client SHALL remain in the database

### Requirement: API keys are validated on every request
The system SHALL validate the API key from the `Authorization: Bearer <key>` header on every request to the chat completions endpoint.

#### Scenario: Valid API key
- **WHEN** a request includes a valid API key belonging to an existing Client
- **THEN** the request SHALL be accepted and attributed to that Client

#### Scenario: Revoked or deleted API key
- **WHEN** a request includes an API key belonging to a deleted Client
- **THEN** the system SHALL respond with HTTP 401
