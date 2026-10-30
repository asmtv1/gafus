import { afterEach, describe, expect, it, vi } from "vitest";
import { isIsolatedRefactorBrowserOrigin } from "./cors";

afterEach(() => vi.unstubAllEnvs());
const origin = "http://127.0.0.1:5507";
function enableQa() {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("GAFUS_LOCAL_ISOLATED_API", "1");
  vi.stubEnv("GAFUS_LOCAL_BROWSER_AUTH", "1");
  vi.stubEnv("API_HOST", "127.0.0.1");
  vi.stubEnv("API_PORT", "3002");
  vi.stubEnv("GAFUS_QUESTIONS_ISOLATED_QA", "1");
  vi.stubEnv("QUESTIONS_V2_S3_ENDPOINT", "http://127.0.0.1:9000");
  vi.stubEnv("QUESTIONS_V2_S3_BUCKET", "gafus-refactor-questions-test");
}
describe("Questions V2 local QA origin is fail-closed", () => {
  it("allows exact 5507 only for explicitly isolated MinIO on 3002", () => {
    enableQa();
    expect(isIsolatedRefactorBrowserOrigin(origin)).toBe(true);
  });
  it.each([
    ["NODE_ENV", "production"],
    ["GAFUS_LOCAL_ISOLATED_API", "0"],
    ["GAFUS_LOCAL_BROWSER_AUTH", "0"],
    ["API_HOST", "0.0.0.0"],
    ["API_PORT", "3001"],
    ["GAFUS_QUESTIONS_ISOLATED_QA", "0"],
    ["QUESTIONS_V2_S3_ENDPOINT", "https://s3.cloud.ru"],
    ["QUESTIONS_V2_S3_BUCKET", "gafus-questions-public"],
  ])("denies mismatched gate %s", (name,value) => {
    enableQa(); vi.stubEnv(name,value);
    expect(isIsolatedRefactorBrowserOrigin(origin)).toBe(false);
  });
  it("rejects lookalikes and non-local origins", () => {
    enableQa();
    for(const untrusted of ["http://localhost:5507", "http://127.0.0.1:5173",
      "http://127.0.0.2:5507", "http://127.0.0.1:5507.evil.example",
      "https://gafus.ru", "null"])
      expect(isIsolatedRefactorBrowserOrigin(untrusted)).toBe(false);
  });
});
