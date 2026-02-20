import { describe, expect, it } from "vitest";

import {
  normalizeTelegramInput,
  normalizeInstagramInput,
  normalizeWebsiteUrl,
  getTelegramUrl,
  getInstagramUrl,
} from "./social";

describe("normalizeTelegramInput", () => {
  it("returns lowercase username without @", () => {
    expect(normalizeTelegramInput("myusername")).toBe("myusername");
    expect(normalizeTelegramInput("@myusername")).toBe("myusername");
  });

  it("extracts username from full URL", () => {
    expect(normalizeTelegramInput("https://t.me/myusername")).toBe("myusername");
  });

  it("throws for too short username (< 5 chars)", () => {
    expect(() => normalizeTelegramInput("abc")).toThrow();
    expect(() => normalizeTelegramInput("ab")).toThrow();
  });

  it("throws for invalid characters", () => {
    expect(() => normalizeTelegramInput("user@name")).toThrow();
  });

  it("returns empty string for empty input", () => {
    expect(normalizeTelegramInput("")).toBe("");
  });
});

describe("normalizeInstagramInput", () => {
  it("returns lowercase username without @", () => {
    expect(normalizeInstagramInput("myusername")).toBe("myusername");
    expect(normalizeInstagramInput("@myusername")).toBe("myusername");
  });

  it("extracts username from URL", () => {
    expect(normalizeInstagramInput("https://instagram.com/myusername/")).toBe(
      "myusername",
    );
  });

  it("throws when username ends with dot", () => {
    expect(() => normalizeInstagramInput("user.name.")).toThrow();
  });

  it("returns empty string for empty input", () => {
    expect(normalizeInstagramInput("")).toBe("");
  });
});

describe("normalizeWebsiteUrl", () => {
  it("adds https for URL without protocol", () => {
    expect(normalizeWebsiteUrl("example.com")).toMatch(/^https:\/\/example\.com/);
  });

  it("strips www and trailing slash", () => {
    expect(normalizeWebsiteUrl("https://www.example.com/")).toContain(
      "https://example.com",
    );
  });

  it("keeps http when present", () => {
    expect(normalizeWebsiteUrl("http://example.com")).toContain("http://");
  });

  it("throws for invalid URL", () => {
    expect(() => normalizeWebsiteUrl("://invalid")).toThrow();
  });

  it("returns empty string for empty input", () => {
    expect(normalizeWebsiteUrl("")).toBe("");
  });
});

describe("getTelegramUrl", () => {
  it("returns full t.me URL", () => {
    expect(getTelegramUrl("myusername")).toBe("https://t.me/myusername");
  });

  it("returns empty for empty username", () => {
    expect(getTelegramUrl("")).toBe("");
  });
});

describe("getInstagramUrl", () => {
  it("returns full instagram URL", () => {
    expect(getInstagramUrl("myusername")).toBe(
      "https://www.instagram.com/myusername/",
    );
  });

  it("returns empty for empty username", () => {
    expect(getInstagramUrl("")).toBe("");
  });
});
