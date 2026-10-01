import { describe, expect, it } from "vitest";
import { describeModelCapabilities } from "../../src/services/model-capabilities.js";
import fixture from "../../contracts/model-settings-v1.json";

describe("model capabilities", () => {
  it("reports verified image modalities without guessing unknown Codex models", () => {
    for (const model of ["gpt-5.6-sol", "gpt-5.6-luna", "gpt-6-astra"])
      expect(
        describeModelCapabilities(model, "chatgpt-codex").inputModalities,
      ).toEqual(["text", "image"]);
    expect(
      describeModelCapabilities("gpt-5.3-codex-spark", "chatgpt-codex")
        .inputModalities,
    ).toEqual(["text"]);
    expect(
      describeModelCapabilities("future-codex", "chatgpt-codex")
        .inputModalities,
    ).toBeUndefined();
    expect(
      describeModelCapabilities(
        "kimi-k2.5",
        "openai-compatible",
        "https://api.synthetic.new/v1",
      ).inputModalities,
    ).toEqual(["text", "image"]);
  });
  it("matches the shared Codex capability fixture", () => {
    const capabilities = describeModelCapabilities(
      fixture.state.capabilities.modelId,
      "chatgpt-codex",
    );
    expect(capabilities.settings.reasoningEffort).toEqual(
      fixture.state.capabilities.settings.reasoningEffort,
    );
    expect(capabilities.settings.parallelToolCalls).toEqual(
      fixture.state.capabilities.settings.parallelToolCalls,
    );
  });
  it("accepts settings for gpt-6-sol", () => {
    const settings = describeModelCapabilities(
      "gpt-6-sol",
      "chatgpt-codex",
    ).settings;
    expect(settings.reasoningEffort.values).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ]);
    expect(settings.parallelToolCalls).toEqual({
      status: "supported",
      type: "boolean",
      default: true,
    });
  });
  it("accepts settings for gpt-6.1-sol", () => {
    const settings = describeModelCapabilities(
      "gpt-6.1-sol",
      "chatgpt-codex",
    ).settings;
    expect(settings.reasoningEffort.values).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ]);
    expect(settings.parallelToolCalls).toEqual({
      status: "supported",
      type: "boolean",
      default: true,
    });
  });
  it("accepts settings for gpt-6-luna", () => {
    const settings = describeModelCapabilities(
      "gpt-6-luna",
      "chatgpt-codex",
    ).settings;
    expect(settings.reasoningEffort.values).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(settings.parallelToolCalls).toEqual({
      status: "supported",
      type: "boolean",
      default: true,
    });
  });
  it.each(["GLM-5.3", "kimi-k2.7-code"])(
    "does not offer Thinking Off for %s",
    (modelId) => {
      expect(
        describeModelCapabilities(
          modelId,
          "openai-compatible",
          "https://api.synthetic.new/v1",
        ).settings.thinking.values,
      ).toEqual(["on"]);
    },
  );
  it("describes the resolved Codex model rather than the alias", () => {
    const result = describeModelCapabilities("gpt-5.6-sol", "chatgpt-codex");
    expect(result.settings.reasoningEffort.values).toContain("max");
    expect(result.settings.thinking.values).toEqual(["on"]);
    expect(result.settings.temperature.status).toBe("unsupported");
    expect(result.settings.maxOutputTokens.status).toBe("unsupported");
    expect(result.fingerprint).toBeTruthy();
  });
  it("does not guess capabilities for an unknown endpoint or model", () => {
    const result = describeModelCapabilities(
      "gpt",
      "openai-compatible",
      "http://localhost:1234",
    );
    expect(result.profile).toBe("unknown");
    expect(result.settings.thinking.status).toBe("unknown");
  });
});
