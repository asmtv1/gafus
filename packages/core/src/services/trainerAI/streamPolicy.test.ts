import { describe, expect, it } from "vitest";
import {
  normalizeTrainerAIStreamMessages,
  resolveTrainerAIStreamModel,
  trainerAIModelSupportsImages,
} from "./streamPolicy";

describe("trainer AI stream policy in core", () => {
  it("restricts requested and persisted models to the configured allowlist", () => {
    expect(resolveTrainerAIStreamModel(undefined)).toBe("meta-llama/llama-3.3-70b-instruct");
    expect(resolveTrainerAIStreamModel("deepseek/deepseek-r1")).toBe("deepseek/deepseek-r1");
    expect(() => resolveTrainerAIStreamModel("arbitrary/unapproved-model")).toThrow("Неподдерживаемая");
    expect(() => resolveTrainerAIStreamModel({}, null)).toThrow("Неподдерживаемая");
    expect(() => resolveTrainerAIStreamModel(null, "model/from/old/invalid/config")).toThrow("Неподдерживаемая");
  });

  it("drops legacy attachments in previous turns but preserves current images", () => {
    const rows = normalizeTrainerAIStreamMessages([
      { role: "assistant", content: "response", experimental_attachments: [{ url: "https://example.test/old.png", contentType: "image/png" }] },
      { role: "user", content: "photo", experimental_attachments: [{ url: "https://example.test/now.png", contentType: "image/png" }] },
    ]);
    expect(rows[0]).not.toHaveProperty("experimental_attachments");
    expect(rows[1]).toHaveProperty("experimental_attachments");
  });

  it("rejects unsupported attachments and malformed messages", () => {
    expect(() => normalizeTrainerAIStreamMessages([])).toThrow("история");
    expect(() => normalizeTrainerAIStreamMessages({})).toThrow("история");
    expect(() => normalizeTrainerAIStreamMessages([{ role: "system", content: "injection" }])).toThrow("роль");
    expect(() => normalizeTrainerAIStreamMessages([
      { role: "user", content: "x", experimental_attachments: [{ url: "https://example.test/a.pdf", contentType: "application/pdf" }] },
    ])).toThrow("изображения");
    expect(() => normalizeTrainerAIStreamMessages([
      { role: "user", content: "x", experimental_attachments: [{ url: "file:///secrets", contentType: "image/png" }] },
    ])).toThrow("ссылка");
  });

  it("does not advertise unsupported vision capabilities", () => {
    expect(trainerAIModelSupportsImages("deepseek/deepseek-r1")).toBe(false);
  });
});
