import { createHash } from "node:crypto";
import { HttpError } from "../lib/errors.js";
import { codexInputModalities } from "../providers/chatgpt-codex/images.js";

export interface SettingCapability {
  status: "supported" | "unsupported" | "unknown";
  type: "enum" | "number" | "boolean";
  values?: string[];
  min?: number;
  max?: number;
  integer?: boolean;
  default?: string | number | boolean;
  reason?: string;
}

export interface ModelCapabilities {
  inputModalities?: Array<"text" | "image">;
  schemaVersion: 1;
  modelId: string;
  profile: string;
  source: string;
  fingerprint: string;
  settings: Record<string, SettingCapability>;
}

const settingTypes: Record<string, SettingCapability["type"]> = {
  thinking: "enum",
  reasoningEffort: "enum",
  thinkingBudgetTokens: "number",
  reasoningSummary: "enum",
  verbosity: "enum",
  serviceTier: "enum",
  maxOutputTokens: "number",
  temperature: "number",
  topP: "number",
  parallelToolCalls: "boolean",
};

// Exact supported_reasoning_levels from Codex model metadata, 2026-09-06.
// Forward these values unchanged; do not infer support from public API names.
const codexEfforts: Record<string, string[]> = Object.fromEntries([
  ...[
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-6-astra",
    "gpt-6-sol",
    "gpt-6.1-sol",
  ].map((model) => [model, ["low", "medium", "high", "xhigh", "max", "ultra"]]),
  ...["gpt-5.6-luna", "gpt-6-luna", "gpt-reserve", "codex-auto-review"].map(
    (model) => [model, ["low", "medium", "high", "xhigh", "max"]],
  ),
  ...["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex-spark"].map(
    (model) => [model, ["low", "medium", "high", "xhigh"]],
  ),
  ...["gpt-5-codex", "codex-mini-latest"].map((model) => [
    model,
    ["low", "medium", "high"],
  ]),
]);

const choice = (
  values: string[],
  defaultValue?: string,
): SettingCapability => ({
  status: "supported",
  type: "enum",
  values,
  ...(defaultValue === undefined ? {} : { default: defaultValue }),
});

export function describeModelCapabilities(
  modelId: string,
  upstreamType: string,
  baseUrl?: string | null,
): ModelCapabilities {
  const settings = Object.fromEntries(
    Object.entries(settingTypes).map(([key, type]) => [
      key,
      {
        status: "unknown" as const,
        type,
        reason:
          "No verified settings profile. Configure a model profile in Chimera.",
      },
    ]),
  ) as Record<string, SettingCapability>;
  let profile = "unknown";
  let source = "unknown";
  let inputModalities: ModelCapabilities["inputModalities"];
  if (upstreamType === "chatgpt-codex") {
    inputModalities = codexInputModalities(modelId);
    profile = "codex";
    source = "codex-model-metadata-2026-09-06";
    for (const key of [
      "temperature",
      "topP",
      "maxOutputTokens",
      "thinkingBudgetTokens",
    ]) {
      settings[key] = {
        type: settingTypes[key],
        status: "unsupported",
        reason: "The ChatGPT Codex endpoint does not accept this setting.",
      };
    }
    const efforts = codexEfforts[modelId];
    if (efforts) {
      settings.thinking = choice(["on"], "on");
      settings.reasoningEffort = choice(
        efforts,
        modelId === "gpt-5.3-codex-spark" ? "low" : "medium",
      );
      settings.reasoningSummary = choice(
        ["auto", "concise", "detailed", "off"],
        "auto",
      );
      settings.verbosity = choice(["low", "medium", "high"], "low");
      settings.serviceTier = choice(["auto", "default", "priority"]);
      settings.parallelToolCalls = {
        status: "supported",
        type: "boolean",
        default: true,
      };
    }
  } else {
    let host = "";
    try {
      host = new URL(baseUrl ?? "").hostname;
    } catch {
      /* An unknown endpoint has no inferred profile. */
    }
    if (
      [
        "api.synthetic.new",
        "api.moonshot.ai",
        "api.moonshot.cn",
        "api.z.ai",
      ].includes(host) &&
      /(?:^|\/)(?:GLM-(?:4\.[567](?:-(?:flashx?|airx?|x))?|5(?:\.[123])?(?:-flash)?)|kimi-k2\.(?:[56]|7-code(?:-highspeed)?))$/i.test(
        modelId,
      )
    ) {
      profile = "thinking";
      source = "compatible-thinking-profile";
      if (/(?:^|\/)kimi-k2\.[56]$/i.test(modelId))
        inputModalities = ["text", "image"];
      settings.thinking = choice(
        /(?:glm-5\.3|kimi-k2\.7-code)/i.test(modelId) ? ["on"] : ["on", "off"],
      );
      settings.maxOutputTokens = {
        status: "supported",
        type: "number",
        min: 1,
        integer: true,
      };
      if (/(?:^|\/)glm-/i.test(modelId)) {
        settings.temperature = {
          status: "supported",
          type: "number",
          min: 0,
          max: 1,
        };
        settings.topP = {
          status: "supported",
          type: "number",
          min: 0.01,
          max: 1,
        };
        if (/glm-5\.[23]/i.test(modelId))
          settings.reasoningEffort = choice(
            /glm-5\.3/i.test(modelId)
              ? ["low", "high", "max"]
              : ["high", "max"],
            "max",
          );
      } else {
        settings.temperature = {
          status: "unsupported",
          type: "number",
          reason: "Kimi fixes sampling values for each thinking mode.",
        };
        settings.topP = {
          status: "unsupported",
          type: "number",
          reason: "Kimi fixes top-p at 0.95.",
        };
      }
    }
  }
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ modelId, profile, settings, inputModalities }))
    .digest("hex")
    .slice(0, 16);
  return {
    schemaVersion: 1,
    modelId,
    profile,
    source,
    fingerprint,
    settings,
    ...(inputModalities ? { inputModalities } : {}),
  };
}

export function validateCodexSettings(
  modelId: string,
  options: Record<string, unknown>,
): void {
  const capabilities = describeModelCapabilities(modelId, "chatgpt-codex");
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || key === "sessionId") continue;
    const capability =
      capabilities.settings[key === "textVerbosity" ? "verbosity" : key];
    if (!capability) throw settingsError(`Unknown Codex setting: ${key}`);
    if (
      key === "reasoningSummary" &&
      value === null &&
      capability.status === "supported"
    )
      continue;
    if (capability.status !== "supported")
      throw settingsError(`${modelId}: ${key} is ${capability.status}`);
    if (
      capability.type === "enum" &&
      (typeof value !== "string" || !capability.values?.includes(value))
    ) {
      throw settingsError(
        `${modelId}: ${key} must be one of ${capability.values?.join(", ")}`,
      );
    }
    if (capability.type === "boolean" && typeof value !== "boolean")
      throw settingsError(`${key} must be a boolean`);
  }
}

export function settingsError(message: string): HttpError {
  return new HttpError({
    status: 400,
    type: "invalid_request_error",
    code: "invalid_model_settings",
    message,
  });
}
