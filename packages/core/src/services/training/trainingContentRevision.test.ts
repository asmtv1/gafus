import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  courseContentSyncEnabled,
  getSharedCourseContentRevision,
  getVerifiedCourseContentRevision,
  publishCourseContentChange,
} from "./trainingContentRevision";

const bridge = vi.hoisted(() => ({
  read: vi.fn(),
  bump: vi.fn(),
}));
const durable = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  prisma: { $queryRaw: (...args: unknown[]) => durable.query(...args) },
}));

vi.mock("@gafus/queues/course-cache-sync", () => ({
  readCourseContentRevision: bridge.read,
  bumpCourseContentRevision: bridge.bump,
}));

const oldSync = process.env.COURSE_CACHE_SYNC_ENABLED;
const oldRedisUrl = process.env.REDIS_URL;

describe("Redis-backed course content revision coordination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COURSE_CACHE_SYNC_ENABLED = "true";
    process.env.REDIS_URL = "redis://unit-test:6379";
    bridge.read.mockResolvedValue("0");
    bridge.bump.mockResolvedValue(undefined);
    durable.query.mockResolvedValue([{ revision: 10n }]);
  });

  afterEach(() => {
    if (oldSync === undefined) delete process.env.COURSE_CACHE_SYNC_ENABLED;
    else process.env.COURSE_CACHE_SYNC_ENABLED = oldSync;
    if (oldRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = oldRedisUrl;
    vi.restoreAllMocks();
  });

  it("requires both a cluster-wide sync flag and explicit REDIS_URL", async () => {
    delete process.env.COURSE_CACHE_SYNC_ENABLED;
    expect(courseContentSyncEnabled()).toBe(false);
    await expect(getSharedCourseContentRevision()).resolves.toBeNull();
    await publishCourseContentChange();

    process.env.COURSE_CACHE_SYNC_ENABLED = "true";
    delete process.env.REDIS_URL;
    expect(courseContentSyncEnabled()).toBe(false);
    await expect(getSharedCourseContentRevision()).resolves.toBeNull();

    expect(bridge.read).not.toHaveBeenCalled();
    expect(bridge.bump).not.toHaveBeenCalled();
  });

  it("checks current shared revision on every reader request", async () => {
    bridge.read.mockResolvedValueOnce("1").mockResolvedValueOnce("2");

    expect(await getSharedCourseContentRevision()).toBe("1");
    expect(await getSharedCourseContentRevision()).toBe("2");
    expect(bridge.read).toHaveBeenCalledTimes(2);
  });

  it("checks committed PostgreSQL revision without reading Redis", async () => {
    expect(await getVerifiedCourseContentRevision()).toBe("10");
    durable.query.mockResolvedValue([{ revision: 11n }]);
    // A committed edit must invalidate even if the Redis INCR was never sent.
    expect(await getVerifiedCourseContentRevision()).toBe("11");
    expect(durable.query).toHaveBeenCalledTimes(2);
    expect(bridge.read).not.toHaveBeenCalled();
  });

  it("bypasses cache if the durable row is missing or invalid", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    durable.query.mockResolvedValue([]);
    await expect(getVerifiedCourseContentRevision()).resolves.toBeNull();
    durable.query.mockResolvedValue([{ revision: null }]);
    await expect(getVerifiedCourseContentRevision()).resolves.toBeNull();
    expect(log).toHaveBeenCalled();
  });

  it("bypasses cache on PostgreSQL revision query failures", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    durable.query.mockRejectedValue(new Error("db unavailable"));
    await expect(getVerifiedCourseContentRevision()).resolves.toBeNull();
    expect(log).toBeDefined();
  });

  it("serves verified PostgreSQL revision even if Redis is completely unavailable", async () => {
    bridge.read.mockRejectedValue(new Error("redis unavailable"));
    await expect(getVerifiedCourseContentRevision()).resolves.toBe("10");
    durable.query.mockResolvedValue([{ revision: 11n }]);
    await expect(getVerifiedCourseContentRevision()).resolves.toBe("11");
    expect(bridge.read).not.toHaveBeenCalled();
    expect(durable.query).toHaveBeenCalledTimes(2);
  });

  it("increments shared revision after a writer finishes a mutation", async () => {
    await publishCourseContentChange();

    expect(bridge.bump).toHaveBeenCalledTimes(1);
  });

  it("fails closed if Redis cannot supply the revision", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    bridge.read.mockRejectedValueOnce(new Error("network down"));

    expect(await getSharedCourseContentRevision()).toBeNull();
    expect(log).toBeDefined();
  });

  it("does not turn an already-committed trainer edit into an error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    bridge.bump.mockRejectedValueOnce(new Error("network down"));

    await expect(publishCourseContentChange()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });
});
