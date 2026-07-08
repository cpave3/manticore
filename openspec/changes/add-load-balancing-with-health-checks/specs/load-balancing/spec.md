## ADDED Requirements

### Requirement: Multiple mappings for the same abstract name are load-balanced with session affinity
The system SHALL support multiple `modelMappings` rows with the same `abstractName`. When a request targets an abstract model name with multiple mappings in the lowest-priority tier, the system SHALL select a mapping using **rendezvous hashing**: compute a hash score for every mapping in the tier using `abstractName + ":" + sessionId` as the key, rank the mappings by score, and select the first-ranked mapping whose upstream is healthy. If the first-ranked mapping's upstream is unhealthy, walk the ranking until a healthy mapping is found.

#### Scenario: Two mappings share load between sessions
- **WHEN** `abstractName = "gpt-4o"` has two mappings at priority 1: one to upstream A, one to upstream B, both healthy
- **AND** two different sessions (session `X` and session `Y`) each request `manticore/gpt-4o`
- **THEN** each session SHALL be consistently routed to the same upstream across all its requests
- **AND** session `X` and session `Y` MAY be routed to different upstreams

#### Scenario: Session returns to primary upstream after it recovers
- **WHEN** session `X` has been routed to upstream A (its highest-ranked mapping)
- **AND** upstream A becomes unhealthy, so session `X` is routed to upstream B
- **AND** upstream A later recovers to healthy
- **THEN** the next request from session `X` SHALL be routed back to upstream A

#### Scenario: Single mapping behaves as before
- **WHEN** `abstractName = "gpt-4o"` has exactly one mapping
- **THEN** every request for that abstract name SHALL route to that single mapping's upstream

### Requirement: Priority tiers act as fallback groups
Mappings with the same `abstractName` SHALL be grouped by `priority`. Routing SHALL first attempt the lowest priority value (primary tier). If all mappings in the primary tier have unhealthy upstreams (or reference deleted upstreams), the system SHALL fall back to the next higher priority tier.

#### Scenario: Fallback to secondary tier when all primary upstreams are unhealthy
- **WHEN** `abstractName = "gpt-4o"` has two mappings at priority 1 (primary tier) and one mapping at priority 2 (secondary tier)
- **AND** both priority-1 upstreams are unhealthy
- **THEN** a request for `manticore/gpt-4o` SHALL route to the priority-2 mapping

#### Scenario: No fallback when at least one primary is healthy
- **WHEN** `abstractName = "gpt-4o"` has two priority-1 mappings, one healthy and one unhealthy
- **THEN** all requests SHALL be routed to the healthy priority-1 mapping only

#### Scenario: Deleted upstream in primary tier triggers fallback
- **WHEN** `abstractName = "gpt-4o"` has two priority-1 mappings, one whose upstream was deleted and one whose upstream is unhealthy
- **THEN** a request for `manticore/gpt-4o` SHALL fall back to the next priority tier

### Requirement: Requests without a session ID are distributed randomly
When `sessionId` is `null`, the system SHALL use a per-request random value as the hash key suffix instead of a session ID, distributing load across the healthy pool without session affinity.

#### Scenario: Null session ID spreads load across healthy pool
- **WHEN** `abstractName = "gpt-4o"` has three healthy mappings at priority 1
- **AND** a request arrives with no `X-Session-Id` header
- **THEN** the request SHALL be routed to one of the three mappings using a per-request random hash, not consistently

### Requirement: Unhealthy upstreams are excluded from the pool
The system SHALL only consider mappings whose upstream has `status = 'healthy'` or `status = 'unknown'` in the load-balanced pool. Mappings whose upstream has `status = 'unhealthy'` SHALL be skipped.

#### Scenario: Unhealthy upstream is skipped
- **WHEN** `abstractName = "gpt-4o"` has three mappings, and one upstream is unhealthy
- **THEN** all requests SHALL be distributed across the two remaining healthy mappings
