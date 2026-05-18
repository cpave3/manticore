# Single-User, No Authentication

Manticore is a single-user system. There is no authentication on the Dashboard or for API management. The instance is assumed to run on localhost or behind a trusted network boundary. The only credential is the per-Client API key, which protects the inference endpoint (chat completions) but not the administrative surface.

We considered multi-user tenancy with per-user scoping for Clients, Upstreams, and LogRecords. Rejected for the initial version because the complexity (auth system, session management, password resets or OAuth, per-user query scoping) far outstrips the benefit for a tool whose primary use case is a single developer monitoring their own AI stack. Multi-user can be revisited when there's a concrete need (e.g., a team server) without changing the core data model — adding a `user_id` column retroactively is straightforward.

Consequence: anyone who can reach the Manticore host can view the Dashboard and manage Clients and Upstreams. This is intentional — Manticore is a personal tool, not a shared service.
