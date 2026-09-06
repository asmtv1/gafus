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

import { initializeOfflineStore, setOfflineSyncOwner, useOfflineStore } from "./offlineStore";

describe("web offline store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T10:00:00.000Z"));
    vi.clearAllMocks();
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: () => "action-1" },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: globalThis.localStorage },
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });
    globalThis.localStorage.clear();
    setOfflineSyncOwner("user-1");
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
        ownerId: "user-1",
        retryCount: 0,
        timestamp: Date.now(),
        type: "favorite-toggle",
      }),
    ]);
  });

  it("does not queue an action whose payload belongs to another user", () => {
    useOfflineStore.getState().addToSyncQueue({
      data: { content: "test", courseId: "course-1", userId: "user-2" },
      maxRetries: 1,
      type: "comment",
    });

    expect(useOfflineStore.getState().syncQueue).toEqual([]);
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

  it("keeps actions older than seven days until the server confirms them", () => {
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
      expect.objectContaining({ id: "old" }),
      expect.objectContaining({ id: "fresh" }),
    ]);
  });

  it("does not send another user's persisted action", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    useOfflineStore.setState({
      isOnline: true,
      lastSyncAttempt: null,
      syncCooldown: 0,
      syncQueue: [
        { data: {}, id: "other-user", maxRetries: 1, ownerId: "user-2", retryCount: 0, timestamp: Date.now(), type: "comment" },
      ] as never,
    });

    await useOfflineStore.getState().syncOfflineActions();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useOfflineStore.getState().syncQueue).toHaveLength(1);
  });

  it("keeps an owned action when the server does not confirm it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Unavailable",
      text: vi.fn().mockResolvedValue("temporary failure"),
    });
    vi.stubGlobal("fetch", fetchMock);
    useOfflineStore.setState({
      isOnline: true,
      lastSyncAttempt: null,
      syncCooldown: 0,
      maxRetries: 1,
      syncQueue: [
        {
          data: { content: "test", courseId: "course-1", userId: "user-1" },
          id: "retry-me",
          maxRetries: 1,
          ownerId: "user-1",
          retryCount: 0,
          timestamp: Date.now(),
          type: "comment",
        },
      ] as never,
    });

    await useOfflineStore.getState().syncOfflineActions();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(useOfflineStore.getState().syncQueue).toEqual([expect.objectContaining({ id: "retry-me" })]);
  });

  it("does not sync while another tab holds the localStorage lease", async () => {
    vi.stubGlobal("fetch", vi.fn());
    globalThis.localStorage.setItem(
      "gafus-offline-sync-lock",
      JSON.stringify({ token: "other-tab", expiresAt: Date.now() + 30_000 }),
    );
    useOfflineStore.setState({
      isOnline: true,
      lastSyncAttempt: null,
      syncCooldown: 0,
      syncQueue: [
        {
          data: { content: "test", courseId: "course-1", userId: "user-1" },
          id: "locked",
          maxRetries: 1,
          ownerId: "user-1",
          retryCount: 0,
          timestamp: Date.now(),
          type: "comment",
        },
      ] as never,
    });

    await useOfflineStore.getState().syncOfflineActions();

    expect(fetch).not.toHaveBeenCalled();
    expect(useOfflineStore.getState().syncQueue).toHaveLength(1);
  });

  it("registers online/offline recovery listeners and removes them on cleanup", () => {
    const listeners = new Map<string, () => void>();
    const addEventListener = vi.fn((event: string, listener: () => void) => {
      listeners.set(event, listener);
    });
    const removeEventListener = vi.fn((event: string, listener: () => void) => {
      if (listeners.get(event) === listener) listeners.delete(event);
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { addEventListener, localStorage: globalThis.localStorage, removeEventListener },
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { onLine: false },
    });

    const cleanup = initializeOfflineStore();

    expect(addEventListener).toHaveBeenCalledWith("online", expect.any(Function));
    expect(addEventListener).toHaveBeenCalledWith("offline", expect.any(Function));
    cleanup?.();
    expect(removeEventListener).toHaveBeenCalledWith("online", expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith("offline", expect.any(Function));
  });
});
