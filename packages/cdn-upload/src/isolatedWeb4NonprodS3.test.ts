import { describe, expect, it } from "vitest";
import { isolatedNonprodS3Config } from "./isolatedNonprodS3";
const base = {
  NODE_ENV: "development", GAFUS_LOCAL_ISOLATED_API: "1",
  GAFUS_WEB4_ISOLATED_MEDIA: "1", GAFUS_ISOLATED_NONPROD_S3: "enabled",
  GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9500",
  GAFUS_ISOLATED_S3_FEED_BUCKET: "gafus-refactor-web4-feed-test",
};
describe("WEB4 distinct nonproduction MinIO profile", () => {
  it("accepts own private profile without returning credentials", () => {
    const config=isolatedNonprodS3Config("feed",base);
    expect(config).toMatchObject({endpoint:"http://127.0.0.1:9500",bucket:"gafus-refactor-web4-feed-test"});
    expect(config?.accessKeyId.length).toBe(32);
    expect(config?.secretAccessKey.length).toBe(64);
  });
  it.each([
    { GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000" },
    { GAFUS_ISOLATED_S3_ENDPOINT: "http://localhost:9500" },
    { GAFUS_ISOLATED_S3_FEED_BUCKET: "gafus-refactor-feed-test" },
    { GAFUS_ISOLATED_NONPROD_S3: undefined },
    { GAFUS_WEB4_ISOLATED_MEDIA: undefined },
    { NODE_ENV: "production" },
  ])("denies other endpoint/profile %#", change => {
    expect(() => isolatedNonprodS3Config("feed",{...base,...change})).toThrow();
  });
});
