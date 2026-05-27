import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock("@gafus/error-handling", () => ({
  reportClientError: vi.fn(),
}));

vi.mock("@gafus/core/utils/retry", () => ({
  retryWithBackoff: (fn: () => Promise<void>) => fn(),
}));

import { useOfflineStore } from "./offlineStore";

describe("web offline store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T10:00:00.000Z"));
    vi.clearAllMocks();
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: () => "action-1" },
    });
    useOfflineStore.setState({
      activeDownloads: 0,
      isOnline: false,
      lastSyncAttempt: null,
      lastSyncTime: null,
      maxRetries: 3,
      syncCooldown: 60_000,
      syncErrors: [],
      syncQueue: [],
    });
  });

  it("tracks active download count without going below zero", () => {
    useOfflineStore.getState().startDownload();
    useOfflineStore.getState().startDownload();
    useOfflineStore.getState().finishDownload();
    useOfflineStore.getState().finishDownload();
    useOfflineStore.getState().finishDownload();

    expect(useOfflineStore.getState().activeDownloads).toBe(0);
  });

  it("adds metadata when queueing offline actions", () => {
    useOfflineStore.getState().addToSyncQueue({
      data: { courseId: "course-1", action: "add" },
      maxRetries: 3,
      type: "favorite-toggle",
    });

    expect(useOfflineStore.getState().syncQueue).toEqual([
      expect.objectContaining({
        id: "action-1",
        retryCount: 0,
        timestamp: Date.now(),
        type: "favorite-toggle",
      }),
    ]);
  });

  it("removes queued actions and clears the queue", () => {
    useOfflineStore.setState({
      syncQueue: [
        { data: {}, id: "a", retryCount: 0, timestamp: Date.now(), type: "comment" },
        { data: {}, id: "b", retryCount: 0, timestamp: Date.now(), type: "comment" },
      ] as never,
    });

    useOfflineStore.getState().removeFromSyncQueue("a");
    expect(useOfflineStore.getState().syncQueue).toEqual([expect.objectContaining({ id: "b" })]);

    useOfflineStore.getState().clearSyncQueue();
    expect(useOfflineStore.getState().syncQueue).toEqual([]);
  });

  it("cleans up actions older than seven days", () => {
    useOfflineStore.setState({
      syncQueue: [
        {
          data: {},
          id: "old",
          retryCount: 0,
          timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000,
          type: "comment",
        },
        {
          data: {},
          id: "fresh",
          retryCount: 0,
          timestamp: Date.now(),
          type: "comment",
        },
      ] as never,
    });

    useOfflineStore.getState().cleanupOldActions();

    expect(useOfflineStore.getState().syncQueue).toEqual([
      expect.objectContaining({ id: "fresh" }),
    ]);
  });
});
