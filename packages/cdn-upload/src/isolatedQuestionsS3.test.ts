import { describe, expect, it } from "vitest";
import { isolatedNonprodS3Config } from "./isolatedNonprodS3";
const env = {
  NODE_ENV: "development", GAFUS_LOCAL_ISOLATED_API: "1",
  GAFUS_ISOLATED_NONPROD_S3: "enabled",
  GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000",
  GAFUS_ISOLATED_S3_QUESTIONS_BUCKET: "gafus-refactor-questions-test",
};
describe("Questions separate private localhost bucket is explicit/default-off", () => {
  it("selects exact fixed private questions bucket only after authorization", () => {
    expect(isolatedNonprodS3Config("questions", env)).toMatchObject({
      endpoint: "http://127.0.0.1:9000", bucket: "gafus-refactor-questions-test",
    });
    expect(isolatedNonprodS3Config("questions", {})).toBeNull();
  });
  it.each([
    { NODE_ENV: "production" },
    { GAFUS_LOCAL_ISOLATED_API: undefined },
    { GAFUS_ISOLATED_NONPROD_S3: "false" },
    { GAFUS_ISOLATED_S3_ENDPOINT: "https://s3.cloud.ru" },
    { GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9001" },
    { GAFUS_ISOLATED_S3_QUESTIONS_BUCKET: "gafus-questions-public" },
    { GAFUS_ISOLATED_S3_QUESTIONS_BUCKET: "gafus-refactor-documents-test" },
    { CLOUDRU_S3_ACCESS_KEY_ID: "production" },
    { FEED_S3_SECRET_ACCESS_KEY: "production" },
  ])("denies unsafe Questions S3 environment %o", (bad) => {
    expect(() => isolatedNonprodS3Config("questions", {...env,...bad})).toThrow();
  });
});
