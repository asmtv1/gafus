import { beforeEach, describe, expect, it, vi } from "vitest";

const { records, syncVideoProgressFromLocal } = vi.hoisted(() => ({
  records: new Map<string, Record<string, unknown>>(),
  syncVideoProgressFromLocal: vi.fn(),
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@gafus/error-handling", () => ({ reportClientError: vi.fn() }));
vi.mock("./videoProgressActions", () => ({ syncVideoProgressFromLocal }));

import {
  getLocalVideoProgress,
  saveLocalVideoProgress,
  setVideoProgressOwner,
  syncVideoProgressFromIndexedDB,
} from "./videoProgressStorage";

function request(result: unknown) {
  const value: { result: unknown; error: null; onsuccess?: () => void; onerror?: () => void } = {
    result,
    error: null,
  };
  queueMicrotask(() => value.onsuccess?.());
  return value;
}

function installIndexedDb() {
  const store = {
    get: (key: string) => request(records.get(key)),
    getAll: () => request([...records.values()]),
    put: (entry: Record<string, unknown>) => {
      records.set(entry.videoId as string, entry);
      return request(undefined);
    },
    delete: (key: string) => {
      records.delete(key);
      return request(undefined);
    },
  };
  const db = {
    objectStoreNames: { contains: () => true },
    transaction: () => ({ objectStore: () => store }),
  };
  const indexedDB = { open: () => request(db) };
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDB });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { indexedDB } });
}

describe("video progress IndexedDB sync", () => {
  beforeEach(() => {
    records.clear();
    vi.clearAllMocks();
    installIndexedDb();
    setVideoProgressOwner("user-1");
  });

  it("does not delete a newer local position after an older snapshot is confirmed", async () => {
    await saveLocalVideoProgress("video-1", 10);
    syncVideoProgressFromLocal.mockImplementationOnce(async () => {
      records.set("video-1", {
        videoId: "video-1",
        lastPositionSec: 20,
        ownerId: "user-1",
        updatedAt: Date.now() + 1,
      });
      return { success: true, confirmedVideoIds: ["video-1"] };
    });

    await syncVideoProgressFromIndexedDB();

    expect(await getLocalVideoProgress("video-1")).toBe(20);
  });
});
