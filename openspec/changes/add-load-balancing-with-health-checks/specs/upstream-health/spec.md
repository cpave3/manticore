## ADDED Requirements

### Requirement: Upstream health is tracked passively from request outcomes
The system SHALL maintain a health record per upstream derived from recent LogRecord outcomes. Health status SHALL be computed from the `error_count` and `request_count` fields on the `upstream_healths` table.

#### Scenario: Upstream starts with unknown status
- **WHEN** an upstream has been registered but has not yet received any requests
- **THEN** its health status SHALL be `'unknown'` until the first request completes

#### Scenario: Upstream becomes unhealthy after consecutive errors
- **WHEN** an upstream accumulates `error_count >= 3` and `error_count / request_count >= 0.5`
- **THEN** the system SHALL set its health `status` to `'unhealthy'`

#### Scenario: Upstream recovers through successful requests
- **WHEN** an upstream with `status = 'unhealthy'` processes several successful requests such that `error_count / request_count < 0.5`
- **THEN** the system SHALL set `status` to `'healthy'`

#### Scenario: Upstream stays healthy with occasional errors
- **WHEN** an upstream has `error_count = 1` and `request_count = 5`
- **THEN** its health `status` SHALL remain `'healthy'`

#### Scenario: Client abort does not count as error
- **WHEN** a streaming request is cancelled by the client mid-stream
- **THEN** the system SHALL NOT increment `error_count` for that upstream

#### Scenario: Window resets after 20 requests
- **WHEN** an upstream's `request_count` reaches 20
- **THEN** both `request_count` and `error_count` SHALL be reset to 0

### Requirement: Health records persist across restarts
The system SHALL store health counts and status in the `upstream_healths` table. On restart, persisted counts SHALL be retained. Status SHALL be preserved according to the admin override: if `override = 'unhealthy'`, status stays `'unhealthy'`; if `override = 'healthy'`, status stays `'healthy'`; only if `override = 'auto'` should `status` reset to `'unknown'`.

#### Scenario: Restart preserves admin override
- **WHEN** the Manticore process restarts and an upstream had `override = 'unhealthy'`, `error_count = 2`, `request_count = 4` before restart
- **THEN** the system SHALL restore `error_count = 2`, `request_count = 4`, and `status = 'unhealthy'`

#### Scenario: Restart resets auto-derived status to unknown
- **WHEN** the Manticore process restarts and an upstream had `override = 'auto'`, `error_count = 2`, `request_count = 4` before restart
- **THEN** the system SHALL restore `error_count = 2`, `request_count = 4`, but set `status` to `'unknown'`

### Requirement: Admin can override health status
The system SHALL allow an admin to force an upstream's health `status` to `'healthy'`, `'unhealthy'`, or `'auto'` (derive from outcomes). When `override` is not `'auto'`, the forced status SHALL be used for routing regardless of error counts.

#### Scenario: Admin forces upstream unhealthy
- **WHEN** an admin sets an upstream's health override to `'unhealthy'`
- **THEN** the system SHALL set `status` to `'unhealthy'` and route no traffic to that upstream

#### Scenario: Admin forces healthy override
- **WHEN** an admin sets an upstream's health override to `'healthy'`
- **THEN** the system SHALL set `status` to `'healthy'` and route traffic to that upstream

#### Scenario: Admin clears override to auto
- **WHEN** an admin clears an override to `'auto'`
- **THEN** the system SHALL recompute `status` from current `error_count` and `request_count` immediately
