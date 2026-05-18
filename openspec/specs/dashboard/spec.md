## ADDED Requirements

### Requirement: Dashboard is served alongside the API
The system SHALL serve a web Dashboard from the same process as the API proxy. The Dashboard SHALL be accessible at a configurable path and port.

#### Scenario: User opens Dashboard in browser
- **WHEN** a user navigates to the configured Dashboard URL (e.g., `http://localhost:3456`)
- **THEN** the system SHALL serve the Dashboard web application

### Requirement: Dashboard displays usage aggregations
The Dashboard SHALL display aggregated usage data from the LogRecord store, including total tokens by Client, total tokens by Model ID, total tokens by Upstream, and usage over time.

#### Scenario: Dashboard shows client breakdown
- **WHEN** the Dashboard loads
- **THEN** it SHALL display a breakdown of total Prompt Tokens and Completion Tokens per Client

#### Scenario: Dashboard shows model usage
- **WHEN** the Dashboard loads
- **THEN** it SHALL display usage statistics grouped by Model ID

### Requirement: Dashboard shows a queryable event log
The Dashboard SHALL include a tabular view of individual LogRecords with sortable columns for timestamp, Client, Model ID, Upstream, prompt tokens, completion tokens, latency, and status.

#### Scenario: User views recent requests
- **WHEN** a user navigates to the event log view
- **THEN** they SHALL see a table of recent LogRecords ordered by timestamp with all metadata columns visible

### Requirement: Dashboard data refreshes on page load
The Dashboard SHALL load current data on page load. It MAY support auto-refresh on a configurable interval or provide a manual refresh control.

#### Scenario: User refreshes the page
- **WHEN** a user reloads the Dashboard
- **THEN** it SHALL display the latest LogRecords and aggregations from the database

### Requirement: Dashboard is unauthenticated
The Dashboard SHALL not require authentication. It is intended for local or trusted-network access only.

#### Scenario: Any user accesses Dashboard
- **WHEN** any browser navigates to the Dashboard URL
- **THEN** the Dashboard SHALL load without prompting for credentials
