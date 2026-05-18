# Manticore Context

Manticore is a self-hosted proxy that sits between AI-powered applications and upstream model providers. It exposes all backends behind a single OpenAI-compatible chat completions endpoint, attributes every request to a unique client, and records detailed usage data into a local queryable store.

## Language

**Client**:
A unique caller of the Manticore API. The unit of accountability — all usage is attributed to a Client. A Client has one or more API keys; keys can be created and revoked independently to support rotation. Requests are authenticated by key but attributed to the owning Client, so rotation does not break historical usage data.
_Avoid_: App, application, consumer

**Request**:
A single HTTP call from a Client to the Manticore `/v1/chat/completions` endpoint. Manticore does not support other OpenAI endpoints (embeddings, image generation, etc.). A Request may involve one or more internal upstream attempts.
_Avoid_: Call, invocation, query

**Attempt**:
A single upstream forwarding try within a Request. Manticore delegates retry logic to the Vercel AI SDK; Attempts are surfaced and recorded only to the extent the SDK exposes them. If retries are opaque to Manticore, a Request may be recorded as a single Attempt regardless of internal retry count.
_Avoid_: Retry, upstream call

**Model ID**:
A globally-qualified identifier of the form `{provider}/{model-path}`. The `provider` segment is a registered Upstream name. Everything after the first `/` is passed through to that Upstream unchanged. Manticore does not maintain a per-model registry.
_Avoid_: Model name, model string

**Upstream**:
A backend model provider that receives forwarded Requests from Manticore. Must expose an OpenAI-compatible chat completions endpoint.
_Avoid_: Provider, backend, endpoint

**Prompt Token**:
A token counted from the Request body before forwarding. Includes the rendered chat template (role markers, formatting, special tokens). Counted identically for streaming and non-streaming Requests.
_Avoid_: Input token

**Completion Token**:
A token counted from the response content. For streaming Requests, each text delta is run through the Tokenizer as it passes through the proxy. For non-streaming Requests, the full response content is tokenized after receipt. Completion Token counts may overcount slightly (typically 2-5%) for streaming due to chunk-boundary misalignment.
_Avoid_: Output token, response token

**Tokenizer**:
A Hugging Face model tokenizer loaded by name from the Transformers ecosystem. Used by Manticore for local Prompt Token and Completion Token counting. Each distinct model family may require its own Tokenizer.
_Avoid_: Encoder, vocabulary

**LogRecord**:
The persisted record of a single Request. Contains metadata only: Client, Model ID, Upstream, timestamps, token counts, latency metrics, finish reason, and status. Request and response content (messages, completions) are not stored.
_Avoid_: Log entry, event

**Dashboard**:
A web application served by the Manticore process alongside the API endpoint. Unauthenticated, intended for local or trusted-network access. Shows current usage data queried from the local store on page load; may auto-refresh on a configurable interval or provide a manual refresh control.
_Avoid_: UI, web UI, admin panel

## Upstream Registration

An Upstream is registered by a unique provider name, a base URL, an optional API key, and any provider-specific headers. Registration is persisted in the local Manticore store. Provider names are unique within a Manticore instance. Multiple Upstreams may share the same base URL. Hot editing (adding, updating, or removing Upstreams without restarting Manticore) is not required for the initial version.

## Relationships

- A **Client** makes zero or more **Requests**
- A **Request** produces exactly one **LogRecord**
- A **Request** contains one or more **Attempts**
- An **Attempt** targets exactly one **Upstream**
- A **Request** specifies exactly one **Model ID**
- A **Model ID** resolves to an **Upstream** by its provider name; the model-path is passed through unchanged
- Token counts on a **Request** are best-effort. If no counting method succeeds, the Request is still fulfilled and a LogRecord is created with null token counts
- Token counting priority: upstream-reported usage metadata → Hugging Face tokenizer → fallback to null counts

## Example dialogue

> **Dev:** "When a Client cancels a streaming Request mid-generation, do we still count the Completion Tokens?"
>
> **Domain expert:** "Yes — any tokens that pass through the proxy are recorded on the LogRecord. Cancellation is a Client action, not a refund. The LogRecord always reflects the actual tokens consumed, not whether the Client considered the response complete."
>
> **Dev:** "And if the upstream returns a 502 before sending any content?"
>
> **Domain expert:** "Then the Request produces a LogRecord with zero prompt and completion tokens. It's still recorded — just empty. If we retry internally, each Attempt is tracked, but the Client still sees it as one Request."
>
> **Dev:** "Where do I go to see all this data?"
>
> **Domain expert:** "The Dashboard — it's served by the same Manticore process, built into the binary. Open your browser at the configured port. No separate deployment needed."

## Decided out of scope

**Cost / Spend**: Not tracked in v1. LogRecords contain token counts only. Billing models vary by Upstream (per-token, flat-rate, time-window, free) and would require a configurable cost engine per provider. Token volume provides sufficient visibility for the initial use case.

**Rate Limiting**: Not enforced in v1. Manticore forwards all Client requests to the upstream; upstream rate limits and 429 responses are treated as normal Attempt failures.

## Flagged ambiguities

- "app" was used informally to describe callers — resolved: the canonical term is **Client**
- tokens are counted regardless of stream completion — resolved: consumption and success are independent concerns
- "provider" was overloaded to mean both the Manticore-registered name and the backend service — resolved: **Upstream** is the Manticore concept; the backend company (OpenAI, Anthropic, Ollama) is just an implementation detail
