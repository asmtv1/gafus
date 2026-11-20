import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicWebBaseUrl } from "./publicWebBaseUrl";

describe("public web URL used in outbound emails", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to the public GAFUS origin if no site setting was supplied", () => {
    vi.stubEnv("WEB_APP_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
    expect(getPublicWebBaseUrl()).toBe("https://gafus.ru");
  });

  it("uses NEXT_PUBLIC_SITE_URL when the server-side override is missing", () => {
    vi.stubEnv("WEB_APP_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://website.example.test/");
    expect(getPublicWebBaseUrl()).toBe("https://website.example.test");
  });

  it("prefers the explicit server-side URL and trims its trailing slash", () => {
    vi.stubEnv("WEB_APP_URL", "https://admin.example.test/");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ignored.example.test/");
    expect(getPublicWebBaseUrl()).toBe("https://admin.example.test");
  });
});
