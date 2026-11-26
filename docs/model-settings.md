# Model generation settings

Manticore exposes authenticated capability discovery at `GET /v1/model-capabilities?model=<reference>`. Use an inference client API key. The route resolves aliases with the same helper as Chat Completions. It returns the requested alias, resolved model ID, request profile, capability source, fingerprint, and setting descriptors.

Each setting reports `supported`, `unsupported`, or `unknown`, plus its type, choices, bounds, and known default. Unknown upstreams remain routable. Manticore does not infer capabilities from alias names.

## Discovered limits

`GET /v1/models` (Client API key) lists every public model reference Manticore can route: alias mappings under their bare abstract name, and every model seen in an upstream's OpenAI-compatible catalogue as `{provider}/{model}` direct routes. Both spellings of an alias route identically; a direct spelling a mapping intercepts is listed only as that mapping. Each entry carries `ownedBy` (the upstream that would serve it), `modelPath` (what actually gets routed), an optional `created`, and a `limits` block:

```json
{
  "id": "go-kimi",
  "object": "model",
  "ownedBy": "go",
  "modelPath": "kimi-k3",
  "limits": {
    "context": { "status": "discovered", "value": 262144 },
    "input": { "status": "unknown" },
    "output": { "status": "discovered", "value": 32768 }
  }
}
```

Every limit is `{ "status": "discovered", "value": … }` or explicitly `{ "status": "unknown" }` — never invented. `GET /v1/model-capabilities?model=` includes the same `limits` block for its resolved route; the block is additive and does not participate in the fingerprint, so existing capability consumers are unaffected.

Limits come from each upstream's own `GET <chat base URL>/models` response (`limit.context` / `limit.input` / `limit.output`). A base URL that includes protocol segments keeps them; the catalogue is fetched at the base URL plus `/models`. Discovery requests carry the upstream's own credential and its static headers; per-session `{sessionId}` headers are never forwarded into shared discovery. Values are accepted only as positive integers — anything missing, zero, negative, fractional, or non-finite is treated as absent.

Catalogues are cached in memory, one entry per upstream identity (base URL plus credential plus static headers), so a credential or endpoint change never inherits another configuration's values. One fetch serves requests for five minutes; after that, refreshes run behind responses while last-known values keep being served. A discovery stays trustworthy for 24 hours from its last verification: failed or omitted values never renew that age, so a limit that stops being verifiable turns `unknown` rather than being resurrected. A request that has nothing fresh to serve (a cold identity, an unseen model, an expired discovery) waits on the single in-flight fetch, bounded by a 10-second timeout, so one good upstream response recovers it. ChatGPT Codex upstreams have no compatible list endpoint and stay explicitly `unknown`.

## Codex translation

Chat Completions accepts `reasoning_effort`, `reasoning_summary`, `verbosity` (or the existing `text_verbosity`), `service_tier`, and `parallel_tool_calls`. Conflicting verbosity fields return 400. Both streaming and non-streaming requests use the same validation.

Reasoning efforts use exact Codex model metadata observed on 2026-09-06. Sol, Terra, and Astra include `ultra`; Luna, reserve, and auto-review stop at `max`. Older profiles have smaller lists. Unknown Codex model choices are not advertised. Omitted requests keep the previous provider defaults. There is no `minimal` to `low` substitution.

Known Codex profiles require thinking. An explicit `none` effort or disabled thinking returns `invalid_model_settings` before an upstream request. Summary `off` or explicit null suppresses summaries without disabling reasoning. Explicit `parallel_tool_calls: false` reaches the backend. Service tiers remain subject to upstream account restrictions.

The Codex backend does not enforce Chat Completions output caps or accept sampling parameters. Capabilities report these limits. Legacy `max_tokens`/`max_completion_tokens` fields remain ignored for existing clients; new Chimera settings do not advertise them as enforced. Explicit sampling selections return 400.

Reasoning summaries use `reasoning_content`. Opaque continuation items use the `codex_reasoning` extension and are returned on tool calls. Clients must retain that metadata on the matching assistant tool call. Manticore restores validated reasoning items before the next function call. Encrypted content never becomes assistant display text.

## Image input

Discovery includes optional `inputModalities` for verified resolved models. `['text', 'image']` enables vision, `['text']` declares text-only, and an absent field means unknown. Modalities are part of the fingerprint. Alias remapping updates the resolved profile; alias names do not imply support. Exact Codex metadata includes Sol, Terra, Luna, Astra, reserve, GPT-5.5, GPT-5.4 Mini, and auto-review as image-capable, with Spark text-only. Other Codex models remain unknown until verified.

Codex Chat Completions accepts mixed user text and `image_url` parts. PNG, JPEG, WebP, and GIF data URIs retain their payloads. HTTP(S) URLs pass to the backend without a Manticore download; local paths and credential-bearing URLs are rejected. Direct SDK callers can also supply image bytes or base64 data. Both response modes produce structured `input_image` items without flattening or double-encoding, and preserve image history alongside opaque reasoning and tool calls.

Optional detail values are `auto`, `low`, and `high`; `original` requires a verified supporting Codex profile. Omission uses the backend default. Malformed parts, invalid base64, unsupported media types/detail values, and known text-only models return HTTP 400 with `invalid_image_input` before generation. This adds image understanding, not image generation or document uploads. See OpenAI's [image input format](https://developers.openai.com/api/docs/guides/images-vision).

Local prompt token estimates are unavailable for image-bearing requests; upstream usage remains authoritative. Image payloads are not sent to text tokenizers. Ordinary compatible forwarding preserves the original image parts.

## Compatible upstreams

Ordinary forwarding retains generation fields while replacing the routed model and credentials. Known GLM and Kimi endpoints expose conservative profiles. GLM-5.3 and Kimi K2.7 Code require thinking; Kimi sampling values are fixed. Unknown servers need explicit Chimera declarations.

Sources: [GLM parameters](https://docs.z.ai/api-reference/llm/chat-completion), [Kimi K2.6](https://platform.kimi.ai/docs/guide/kimi-k2-6-quickstart), [Kimi K2.7 Code](https://platform.kimi.ai/docs/guide/kimi-k2-7-code-quickstart). Profile and translation tests include actual serialized requests, aliases that change target, false/null values, and both response modes.

## Coordinated release

Release Manticore before enabling `capabilitySource: "manticore"` in Chimera's provider configuration. Release Chimera before the Legato settings panel. No database migration is required. No running process is restarted by these source changes.

`contracts/model-settings-v1.json` is the shared wire fixture. Keep it identical in all three repositories. Do not add cross-repository runtime imports.
