import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ExcuseGeneratorError,
  generateExcuseForSituation,
  normalizePlausibility,
  parseOpenRouterContent,
} from "./server";

describe("excuse generator server helpers", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes plausibility into a believable display range", () => {
    expect(normalizePlausibility(12)).toBe(35);
    expect(normalizePlausibility(101)).toBe(96);
    expect(normalizePlausibility(82.7)).toBe(83);
    expect(normalizePlausibility("not-a-number")).toBe(72);
  });

  it("parses OpenRouter JSON content and normalizes the score", () => {
    const result = parseOpenRouterContent(`
      \`\`\`json
      {
        "excuse": "Я уже выехал, но по дороге пришлось срочно разбираться с аварийной ситуацией у подъезда.",
        "plausibility": 99,
        "tone": "спокойно-деловая"
      }
      \`\`\`
    `);

    expect(result).toEqual({
      excuse:
        "Я уже выехал, но по дороге пришлось срочно разбираться с аварийной ситуацией у подъезда.",
      plausibility: 96,
      tone: "спокойно-деловая",
    });
  });

  it("rejects unknown situation ids before calling OpenRouter", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn();

    await expect(generateExcuseForSituation("unknown", fetchMock)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls OpenRouter with the selected situation and returns generated data", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                excuse:
                  "Я задержался, потому что у дома прорвало трубу, и пришлось дождаться аварийную службу, чтобы не оставить соседей без доступа.",
                plausibility: 84,
                tone: "ответственно-деловая",
              }),
            },
          },
        ],
      }),
    });

    const result = await generateExcuseForSituation("late-work", fetchMock);

    expect(result).toEqual({
      excuse:
        "Я задержался, потому что у дома прорвало трубу, и пришлось дождаться аварийную службу, чтобы не оставить соседей без доступа.",
      plausibility: 84,
      tone: "ответственно-деловая",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    });

    const payload = JSON.parse(String(init.body)) as {
      model: string;
      messages: { role: string; content: string }[];
      response_format: { type: string };
    };
    expect(payload.model).toBe("meta-llama/llama-3.3-70b-instruct");
    expect(payload.response_format).toEqual({ type: "json_object" });
    expect(payload.messages[1]?.content).toContain("опоздал на работу");
    expect(payload.messages[1]?.content).toContain("реальный человек в мессенджере");
  });

  it("throws a configuration error when the shared key is missing", async () => {
    const fetchMock = vi.fn();

    await expect(generateExcuseForSituation("late-work", fetchMock)).rejects.toBeInstanceOf(
      ExcuseGeneratorError,
    );
    await expect(generateExcuseForSituation("late-work", fetchMock)).rejects.toMatchObject({
      code: "CONFIGURATION_ERROR",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
