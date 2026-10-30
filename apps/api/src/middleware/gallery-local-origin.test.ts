import { afterEach, describe, expect, it, vi } from "vitest";
import { isIsolatedRefactorBrowserOrigin } from "./cors";

afterEach(() => vi.unstubAllEnvs());
const exact = "http://127.0.0.1:5173";
function allowGallery() {
  vi.stubEnv("API_PORT", "3601");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("GAFUS_LOCAL_ISOLATED_API", "1");
  vi.stubEnv("GAFUS_LOCAL_BROWSER_AUTH", "1");
  vi.stubEnv("GAFUS_GALLERY_ISOLATED_HONO", "1");
  vi.stubEnv("GALLERY_ENABLED", "true");
  vi.stubEnv("FEED_ENABLED", "false");
  vi.stubEnv("API_HOST", "127.0.0.1");
}
describe("Gallery-only local Hono cookie Origin", () => {
  it("allows original Vite 5173 only for explicitly opted-in Gallery runtime", () => {
    allowGallery();
    expect(isIsolatedRefactorBrowserOrigin(exact)).toBe(true);
  });
  it.each([
    ["GAFUS_GALLERY_ISOLATED_HONO", "0"],
    ["GALLERY_ENABLED", "false"],
    ["FEED_ENABLED", "true"],
    ["NODE_ENV", "production"],
    ["API_HOST", "0.0.0.0"],
    ["API_PORT", "3002"],
    ["GAFUS_LOCAL_BROWSER_AUTH", "0"],
  ])("rejects invalid local Origin configuration %s", (key, value) => {
    allowGallery(); vi.stubEnv(key, value);
    expect(isIsolatedRefactorBrowserOrigin(exact)).toBe(false);
  });
  it("never admits network, lookalike or production origins", () => {
    allowGallery();
    for (const value of ["http://localhost:5173", "http://127.0.0.1:5174", "http://127.0.0.2:5173", "https://gafus.ru"])
      expect(isIsolatedRefactorBrowserOrigin(value)).toBe(false);
  });
});
