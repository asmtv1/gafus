import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  canReadCourseCacheMetrics,
  getCourseCacheMetricsSnapshot,
  observeCourseContentDbRead,
  recordCourseCacheEvent,
  resetCourseCacheMetricsForTests,
} from "./trainingContentMetrics";

const savedToken = process.env.COURSE_CACHE_METRICS_TOKEN;
const savedEnable = process.env.ENABLE_COURSE_CACHE;
const savedSync = process.env.COURSE_CACHE_SYNC_ENABLED;
const savedRedisUrl = process.env.REDIS_URL;

describe("course cache process metrics", () => {
  beforeEach(() => {
    resetCourseCacheMetricsForTests();
    delete process.env.COURSE_CACHE_METRICS_TOKEN;
    delete process.env.ENABLE_COURSE_CACHE;
    delete process.env.COURSE_CACHE_SYNC_ENABLED;
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    if (savedToken === undefined) delete process.env.COURSE_CACHE_METRICS_TOKEN;
    else process.env.COURSE_CACHE_METRICS_TOKEN = savedToken;
    if (savedEnable === undefined) delete process.env.ENABLE_COURSE_CACHE;
    else process.env.ENABLE_COURSE_CACHE = savedEnable;
    if (savedSync === undefined) delete process.env.COURSE_CACHE_SYNC_ENABLED;
    else process.env.COURSE_CACHE_SYNC_ENABLED = savedSync;
    if (savedRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = savedRedisUrl;
  });

  it("has fixed-cardinality counters and latency buckets without user data", () => {
    recordCourseCacheEvent("hit");
    recordCourseCacheEvent("hit");
    recordCourseCacheEvent("miss");
    recordCourseCacheEvent("redisPublishFailure");
    observeCourseContentDbRead(4);
    observeCourseContentDbRead(65);
    observeCourseContentDbRead(1300);
    const snapshot = getCourseCacheMetricsSnapshot();

    expect(snapshot.counters).toMatchObject({
      hit: 2,
      miss: 1,
      redisPublishFailure: 1,
      bypassRedis: 0,
    });
    expect(snapshot.prismaRead).toMatchObject({
      count: 3,
      averageMs: 1369 / 3,
      maxMs: 1300,
      histogram: expect.objectContaining({ "5": 1, "100": 1 }),
      over1000Ms: 1,
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/userId|courseId|videoUrl/);
  });

  it("snapshots never expose mutable internal counters", () => {
    const snapshot = getCourseCacheMetricsSnapshot();
    recordCourseCacheEvent("hit");
    expect(snapshot.counters.hit).toBe(0);
    expect(getCourseCacheMetricsSnapshot().counters.hit).toBe(1);
  });

  it("exposes only boolean configuration state, never the Redis password", () => {
    process.env.ENABLE_COURSE_CACHE = "true";
    process.env.COURSE_CACHE_SYNC_ENABLED = "true";
    process.env.REDIS_URL = "redis://secret-password@host:6379";
    const snapshot = getCourseCacheMetricsSnapshot();
    expect(snapshot.flags).toEqual({ enabled: true, syncEnabled: true });
    expect(JSON.stringify(snapshot)).not.toContain("secret-password");
  });

  it("denies absent and weak metrics secrets", () => {
    expect(canReadCourseCacheMetrics("Bearer anything")).toBe(false);
    process.env.COURSE_CACHE_METRICS_TOKEN = "short";
    expect(canReadCourseCacheMetrics("Bearer short")).toBe(false);
  });

  it("requires a full exact bearer token", () => {
    const token = "unit-test-strong-token-not-production";
    process.env.COURSE_CACHE_METRICS_TOKEN = token;
    expect(canReadCourseCacheMetrics(null)).toBe(false);
    expect(canReadCourseCacheMetrics(token)).toBe(false);
    expect(canReadCourseCacheMetrics(`Bearer ${token.slice(0, -1)}`)).toBe(false);
    expect(canReadCourseCacheMetrics(`Bearer ${token}x`)).toBe(false);
    expect(canReadCourseCacheMetrics(`Bearer ${token}`)).toBe(true);
  });

  it("ignores negative and non-finite read durations", () => {
    observeCourseContentDbRead(NaN);
    observeCourseContentDbRead(-12);
    observeCourseContentDbRead(Infinity);
    expect(getCourseCacheMetricsSnapshot().prismaRead.count).toBe(0);
  });
});
