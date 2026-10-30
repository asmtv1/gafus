import { describe, expect, it } from "vitest";
import { isolatedLocalApiHostname } from "./api-server-startup";
const base = {
  NODE_ENV: "development" as const, API_HOST: "127.0.0.1", API_PORT: "3501",
  GAFUS_LOCAL_ISOLATED_API: "1", GAFUS_WEB4_ISOLATED_MEDIA: "1",
  DATABASE_URL: "postgresql://gafus_refactor_local_real:nonsecret@127.0.0.1:55921/gafus_refactor_real_work_20261024?schema=public",
  REDIS_URL: "redis://127.0.0.1:55927/1",
  FEED_ENABLED: "true", GALLERY_ENABLED: "true",
  GAFUS_ISOLATED_NONPROD_S3: "enabled", GAFUS_LOCAL_MEDIA_HTTP_ACCEPTANCE: "1",
  GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9500",
  GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET: "gafus-refactor-web4-documents-test",
  GAFUS_ISOLATED_S3_QUESTIONS_BUCKET: "gafus-refactor-web4-questions-test",
  GAFUS_ISOLATED_S3_GALLERY_BUCKET: "gafus-refactor-web4-gallery-test",
  GAFUS_ISOLATED_S3_FEED_BUCKET: "gafus-refactor-web4-feed-test",
  CLOUDRU_MEDIA_JOBS_ENABLED: "false", GALLERY_MEDIA_FALLBACK_ENABLED: "false",
  FEED_MEDIA_FALLBACK_ENABLED: "false", CDN_HEALTH_MONITOR_ENABLED: "false",
};
describe("WEB4 dedicated loopback3501 private S3 profile", () => {
  it("allows only exact private profile", () => {
    expect(isolatedLocalApiHostname(base)).toBe("127.0.0.1");
  });
  it.each([
    { API_PORT: "3301" }, { API_PORT: "3001" }, { API_PORT: "3502" },
    { GAFUS_WEB4_ISOLATED_MEDIA: "0" },
    { GAFUS_WEB4_ISOLATED_MEDIA: undefined },
    { GAFUS_WEB1_ALT_HONO: "1" },
    { API_HOST: "0.0.0.0" },
    { GAFUS_ISOLATED_S3_ENDPOINT: "https://s3.cloud.ru" },
    { GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000" },
    { GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.2:9500" },
    { GAFUS_ISOLATED_S3_FEED_BUCKET: "gafus-refactor-feed-test" },
    { DATABASE_URL: "postgresql://someuser@127.0.0.1:5432/production" },
    { REDIS_URL: "redis://127.0.0.1:6379/0" },
    { CLOUDRU_MEDIA_JOBS_ENABLED: "true" },
  ])("rejects mismatched identity %#", change => {
    expect(() => isolatedLocalApiHostname({ ...base, ...change })).toThrow("LOCAL_API_ISOLATION_PREFLIGHT_DENIED");
  });
});
