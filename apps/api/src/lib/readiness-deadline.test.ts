/** Pure deadline proof; never imports Hono app, DB or Redis modules. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkReadinessWithinDeadline, READINESS_DEADLINE_MS } from "./readiness-deadline";

const tick = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("single bounded readiness probe timer, no infrastructure imports", () => {
  it("does not complete before 5s and fails closed at one shared deadline", async () => {
    const checkDatabase = vi.fn(() => new Promise<void>(() => undefined));
    const pingRedis = vi.fn(async () => "PONG");
    const observed = checkReadinessWithinDeadline({ checkDatabase, pingRedis });
    const asserted = expect(observed).rejects.toThrow("READINESS_DEADLINE_EXCEEDED");
    await tick();
    expect(checkDatabase).toHaveBeenCalledOnce();
    expect(pingRedis).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(READINESS_DEADLINE_MS - 1);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await asserted;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sync failure of one does not prevent other probe and removes deadline", async () => {
    const pingRedis = vi.fn(async () => "PONG");
    await expect(
      checkReadinessWithinDeadline({
        checkDatabase: () => {
          throw Error("PRIVATE_DB_ERROR");
        },
        pingRedis,
      }),
    ).rejects.toThrow("PRIVATE_DB_ERROR");
    expect(pingRedis).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("both success removes timer and returns without pending resources", async () => {
    const checkDatabase = vi.fn(async () => undefined);
    const pingRedis = vi.fn(async () => "PONG");
    await checkReadinessWithinDeadline({ checkDatabase, pingRedis });
    expect(checkDatabase).toHaveBeenCalledOnce();
    expect(pingRedis).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("late success and rejection never alter timeout outcome or cause unhandled errors", async () => {
    let dbResolve!: () => void;
    let redisReject!: (error: Error) => void;
    const observed = checkReadinessWithinDeadline({
      checkDatabase: () =>
        new Promise<void>((r) => {
          dbResolve = r;
        }),
      pingRedis: () =>
        new Promise<void>((_r, reject) => {
          redisReject = reject;
        }),
    });
    const assertion = expect(observed).rejects.toThrow("READINESS_DEADLINE_EXCEEDED");
    await tick();
    await vi.advanceTimersByTimeAsync(READINESS_DEADLINE_MS);
    await assertion;
    dbResolve();
    redisReject(Error("LATE_PRIVATE_REDIS_TOKEN"));
    await tick();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("repeated successful and timed-out checks do not accumulate timers/listeners", async () => {
    for (let i = 0; i < 16; i += 1) {
      await checkReadinessWithinDeadline({
        checkDatabase: async () => undefined,
        pingRedis: async () => undefined,
      });
      expect(vi.getTimerCount()).toBe(0);
    }
    for (let i = 0; i < 4; i += 1) {
      const pending = checkReadinessWithinDeadline({
        checkDatabase: () => new Promise<void>(() => undefined),
        pingRedis: async () => undefined,
      });
      const assertion = expect(pending).rejects.toThrow("READINESS_DEADLINE_EXCEEDED");
      await vi.advanceTimersByTimeAsync(READINESS_DEADLINE_MS);
      await assertion;
      expect(vi.getTimerCount()).toBe(0);
    }
  });
});
