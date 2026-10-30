import { describe, it, expect, vi } from "vitest";
import {
  makeReminderV2IndexedDbReview,
  REMINDER_IDB_REVIEW_KIND,
  REMINDER_IDB_REVIEW_DB,
} from "./reminderV2IndexedDbReview";
const ctx = (overrides: Record<string, unknown> = {}) => {
  const idb = {
    open: vi.fn(() => {
      throw Error("MUST_NOT_OPEN");
    }),
  };
  const locks = {
    request: vi.fn(() => {
      throw Error("MUST_NOT_LOCK");
    }),
  };
  const deps = {
    permit: { kind: REMINDER_IDB_REVIEW_KIND, isCurrent: () => false },
    idb: idb as unknown as IDBFactory,
    locks: locks as unknown as LockManager,
    origin: () => "http://127.0.0.1:5227/",
    ...overrides,
  };
  return { deps, idb, locks, store: makeReminderV2IndexedDbReview(deps) };
};
describe("AG4 IndexedDB source-only review gate, NO real browser origin storage", () => {
  it("IDB01 default denied, no API open/lock or network", async () => {
    const { store, idb, locks } = ctx();
    await expect(store.read()).rejects.toThrow("REVIEW_NOT_GRANTED");
    await expect(store.compareAndSwap(null, {} as never)).rejects.toThrow("REVIEW_NOT_GRANTED");
    expect(idb.open).not.toHaveBeenCalled();
    expect(locks.request).not.toHaveBeenCalled();
  });
  it.each([
    "https://gafus.ru",
    "file:///tmp/index.html",
    "https://localhost.example.com",
    "http://127.0.0.1.evil.test",
    "http://127.0.0.1:5227/path",
    "http://localhost:5227/?token=SECRET",
  ])("IDB02 %s not review origin", async (origin) => {
    const x = ctx({
      permit: { kind: REMINDER_IDB_REVIEW_KIND, isCurrent: () => true },
      origin: () => origin,
    });
    await expect(x.store.read()).rejects.toThrow("REVIEW_NOT_GRANTED");
    expect(x.idb.open).not.toHaveBeenCalled();
    expect(x.locks.request).not.toHaveBeenCalled();
  });
  it("IDB03 unavailable lock refuses without opening IndexedDB", async () => {
    const x = ctx({
      permit: { kind: REMINDER_IDB_REVIEW_KIND, isCurrent: () => true },
      locks: {
        request: vi.fn(
          async (_name: string, _opts: unknown, fn: (lock: Lock | null) => Promise<unknown>) =>
            fn(null),
        ),
      } as unknown as LockManager,
    });
    await expect(x.store.read()).rejects.toThrow("REVIEW_LOCK_UNAVAILABLE");
    expect(x.idb.open).not.toHaveBeenCalled();
  });
  it("IDB04 lock acquired but lease expired before opening => denied", async () => {
    let checks = 0;
    const lockMock = {
      request: vi.fn(
        async (_name: string, _opts: unknown, fn: (lock: Lock | null) => Promise<unknown>) =>
          fn({ name: "mock" } as Lock),
      ),
    } as unknown as LockManager;
    const x = ctx({
      permit: { kind: REMINDER_IDB_REVIEW_KIND, isCurrent: () => ++checks === 1 },
      locks: lockMock,
    });
    await expect(x.store.read()).rejects.toThrow("REVIEW_NOT_GRANTED");
    expect(x.idb.open).not.toHaveBeenCalled();
  });
  it("IDB05 no fallback to ordinary localStorage or API and separate DB name", () => {
    expect(REMINDER_IDB_REVIEW_DB).toBe("ag2-v2-reminder-review-only");
    expect(REMINDER_IDB_REVIEW_DB).not.toContain("production");
  });
});
