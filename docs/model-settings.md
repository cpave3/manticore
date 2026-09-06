# Model generation settings

Manticore exposes authenticated capability discovery at `GET /v1/model-capabilities?model=<reference>`. Use an inference client API key. The route resolves aliases with the same helper as Chat Completions. It returns the requested alias, resolved model ID, request profile, capability source, fingerprint, and setting descriptors.

Each setting reports `supported`, `unsupported`, or `unknown`, plus its type, choices, bounds, and known default. Unknown upstreams remain routable. Manticore does not infer capabilities from alias names.

## Codex translation

Chat Completions accepts `reasoning_effort`, `reasoning_summary`, `verbosity` (or the existing `text_verbosity`), `service_tier`, and `parallel_tool_calls`. Conflicting verbosity fields return 400. Both streaming and non-streaming requests use the same validation.

Reasoning efforts use exact Codex model metadata observed on 2026-09-06. Sol, Terra, and Astra include `ultra`; Luna, reserve, and auto-review stop at `max`. Older profiles have smaller lists. Unknown Codex model choices are not advertised. Omitted requests keep the previous provider defaults. There is no `minimal` to `low` substitution.

Known Codex profiles require thinking. An explicit `none` effort or disabled thinking returns `invalid_model_settings` before an upstream request. Summary `off` or explicit null suppresses summaries without disabling reasoning. Explicit `parallel_tool_calls: false` reaches the backend. Service tiers remain subject to upstream account restrictions.

The Codex backend does not enforce Chat Completions output caps or accept sampling parameters. Capabilities report these limits. Legacy `max_tokens`/`max_completion_tokens` fields remain ignored for existing clients; new Chimera settings do not advertise them as enforced. Explicit sampling selections return 400.

Reasoning summaries use `reasoning_content`. Opaque continuation items use the `codex_reasoning` extension and are returned on tool calls. Clients must retain that metadata on the matching assistant tool call. Manticore restores validated reasoning items before the next function call. Encrypted content never becomes assistant display text.

## Compatible upstreams

Ordinary forwarding retains generation fields while replacing the routed model and credentials. Known GLM and Kimi endpoints expose conservative profiles. GLM-5.3 and Kimi K2.7 Code require thinking; Kimi sampling values are fixed. Unknown servers need explicit Chimera declarations.

Sources: [GLM parameters](https://docs.z.ai/api-reference/llm/chat-completion), [Kimi K2.6](https://platform.kimi.ai/docs/guide/kimi-k2-6-quickstart), [Kimi K2.7 Code](https://platform.kimi.ai/docs/guide/kimi-k2-7-code-quickstart). Profile and translation tests include actual serialized requests, aliases that change target, false/null values, and both response modes.

## Coordinated release

Release Manticore before enabling `capabilitySource: "manticore"` in Chimera's provider configuration. Release Chimera before the Legato settings panel. No database migration is required. No running process is restarted by these source changes.

`contracts/model-settings-v1.json` is the shared wire fixture. Keep it identical in all three repositories. Do not add cross-repository runtime imports.
