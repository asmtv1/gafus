import { describe, expect, it } from "vitest";
import { isolatedNonprodS3Config } from "./isolatedNonprodS3";
import { privateMediaEnabled } from "./privateUserMedia";

const env = {
  NODE_ENV: "development", GAFUS_LOCAL_ISOLATED_API: "1",
  GAFUS_ISOLATED_NONPROD_S3: "enabled",
  GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000",
  GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET: "gafus-refactor-documents-test",
};
describe("pet documents isolated S3 credentials and gate", () => {
  it("defaults off and restricts locally enabled documents", () => {
    expect(privateMediaEnabled({})).toBe(false);
    expect(privateMediaEnabled(env)).toBe(true);
    const config = isolatedNonprodS3Config("documents", env)!;
    expect(config.endpoint).toBe("http://127.0.0.1:9000");
    expect(config.bucket).toBe("gafus-refactor-documents-test");
  });
  it.each([
    { NODE_ENV: "production" },
    { GAFUS_LOCAL_ISOLATED_API: undefined },
    { GAFUS_ISOLATED_NONPROD_S3: "1" },
    { GAFUS_ISOLATED_S3_ENDPOINT: "https://127.0.0.1:9000" },
    { GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET: "gafus-documents-private" },
    { CLOUDRU_S3_ACCESS_KEY_ID: "production" },
  ])("never falls back to production %o", (bad) => {
    expect(() => privateMediaEnabled({ ...env, ...bad })).toThrow();
  });
});
