import { beforeEach, describe, expect, it, vi } from "vitest";

const { batchUpsertMock, reportClientErrorMock } = vi.hoisted(() => ({
  batchUpsertMock: vi.fn(),
  reportClientErrorMock: vi.fn(),
}));

// Test historical transport behavior only; runtime legacy safety gate is always false.
vi.mock("./legacyOfflineReplayQuarantine", () => ({
  canDispatchOwnerlessLegacyOfflineQueue: () => true,
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    removeItem: vi.fn().mockResolvedValue(undefined),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: reportClientErrorMock,
}));

vi.mock("@/shared/lib/api/pets", () => ({
  petsApi: {
    batchUpsertPreventionEntries: batchUpsertMock,
  },
}));

import { usePreventionSyncStore } from "./preventionSyncStore";

const entryData = {
  category: "vaccination",
  date: "2026-05-24",
  note: "done",
} as never;

describe("mobile prevention sync store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T10:00:00.000Z"));
    vi.clearAllMocks();
    usePreventionSyncStore.setState({ queue: [] });
  });

  it("adds entries with a stable provided client id", () => {
    const clientId = usePreventionSyncStore.getState().addToQueue("pet-1", entryData, "client-1");

    expect(clientId).toBe("client-1");
    expect(usePreventionSyncStore.getState().queue).toHaveLength(1);
    expect(usePreventionSyncStore.getState().queue[0]).toMatchObject({
      petId: "pet-1",
      data: { clientId: "client-1" },
      createdAt: Date.now(),
    });
  });

  it("batch syncs entries by pet and removes successful items", async () => {
    usePreventionSyncStore.getState().addToQueue("pet-1", entryData, "client-1");
    usePreventionSyncStore.getState().addToQueue("pet-1", entryData, "client-2");
    batchUpsertMock.mockResolvedValueOnce({ success: true });

    await expect(usePreventionSyncStore.getState().processQueue()).resolves.toBe("ok");

    expect(batchUpsertMock).toHaveBeenCalledWith("pet-1", [
      expect.objectContaining({ clientId: "client-1" }),
      expect.objectContaining({ clientId: "client-2" }),
    ]);
    expect(usePreventionSyncStore.getState().queue).toEqual([]);
  });

  it("preserves non-ACK entries and returns unauthorized on session expiration", async () => {
    usePreventionSyncStore.getState().addToQueue("pet-1", entryData, "client-1");
    batchUpsertMock.mockResolvedValueOnce({ success: false, code: "SESSION_EXPIRED" });

    await expect(usePreventionSyncStore.getState().processQueue()).resolves.toBe("unauthorized");

    expect(usePreventionSyncStore.getState().queue).toHaveLength(1);
  });
});

describe("AG3 G1 native prevention ACK boundary", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    usePreventionSyncStore.setState({ queue: [] });
  });

  it("keeps pending prevention records when backend responds 401", async () => {
    usePreventionSyncStore.getState().addToQueue("pet-A", entryData, "client-A");
    const before = usePreventionSyncStore.getState().queue;
    batchUpsertMock.mockResolvedValueOnce({ success: false, code: "UNAUTHORIZED" });

    await expect(usePreventionSyncStore.getState().processQueue()).resolves.toBe("unauthorized");
    expect(usePreventionSyncStore.getState().queue).toEqual(before);
  });

  it("keeps 500 queued and clears the batch only after server ACK", async () => {
    usePreventionSyncStore.getState().addToQueue("pet-A", entryData, "client-A");
    batchUpsertMock.mockResolvedValueOnce({ success: false, code: "INTERNAL_ERROR" });
    await expect(usePreventionSyncStore.getState().processQueue()).resolves.toBe("retry");
    expect(usePreventionSyncStore.getState().queue).toHaveLength(1);

    batchUpsertMock.mockResolvedValueOnce({
      success: true,
      data: { created: 1, updated: 0, errors: [] },
    });
    await expect(usePreventionSyncStore.getState().processQueue()).resolves.toBe("ok");
    expect(usePreventionSyncStore.getState().queue).toHaveLength(0);
    expect(batchUpsertMock.mock.calls[1]?.[1]).toEqual(batchUpsertMock.mock.calls[0]?.[1]);
  });

  it("does not ACK a partial batch response containing errors", async () => {
    usePreventionSyncStore.getState().addToQueue("pet-A", entryData, "client-A");
    batchUpsertMock.mockResolvedValueOnce({
      success: true,
      data: { created: 0, updated: 0, errors: ["unprocessed test fixture"] },
    });

    await expect(usePreventionSyncStore.getState().processQueue()).resolves.toBe("retry");
    expect(usePreventionSyncStore.getState().queue).toHaveLength(1);
  });

  it("ACKs successful pets but preserves a failed pet batch", async () => {
    usePreventionSyncStore.getState().addToQueue("pet-A", entryData, "client-A");
    usePreventionSyncStore.getState().addToQueue("pet-B", entryData, "client-B");
    batchUpsertMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, code: "RATE_LIMITED" });

    await expect(usePreventionSyncStore.getState().processQueue()).resolves.toBe("retry");
    expect(usePreventionSyncStore.getState().queue).toMatchObject([
      { petId: "pet-B", data: { clientId: "client-B" } },
    ]);
  });
});

describe("AG3 G1 prevention single-flight", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    usePreventionSyncStore.setState({ queue: [] });
  });

  it("does not batch-send the same pet record twice while the first request is pending", async () => {
    usePreventionSyncStore.getState().addToQueue("pet-A", entryData, "idempotency-A");
    let acknowledge!: (value: { success: boolean }) => void;
    const pending = new Promise<{ success: boolean }>((resolve) => {
      acknowledge = resolve;
    });
    batchUpsertMock.mockReturnValue(pending);

    const first = usePreventionSyncStore.getState().processQueue();
    const second = usePreventionSyncStore.getState().processQueue();
    acknowledge({ success: true });

    expect(await Promise.all([first, second])).toEqual(["ok", "ok"]);
    expect(batchUpsertMock).toHaveBeenCalledTimes(1);
    expect(usePreventionSyncStore.getState().queue).toEqual([]);
  });

  it("retries the same stable clientId only after the previous attempt finishes", async () => {
    usePreventionSyncStore.getState().addToQueue("pet-A", entryData, "idempotency-A");
    let rejectTemporary!: (value: { success: boolean; code: string }) => void;
    const pending = new Promise<{ success: boolean; code: string }>((resolve) => {
      rejectTemporary = resolve;
    });
    batchUpsertMock.mockReturnValueOnce(pending).mockResolvedValueOnce({ success: true });

    const first = usePreventionSyncStore.getState().processQueue();
    const second = usePreventionSyncStore.getState().processQueue();
    rejectTemporary({ success: false, code: "RATE_LIMITED" });

    expect(await Promise.all([first, second])).toEqual(["retry", "retry"]);
    expect(usePreventionSyncStore.getState().queue).toHaveLength(1);
    await expect(usePreventionSyncStore.getState().processQueue()).resolves.toBe("ok");
    expect(batchUpsertMock).toHaveBeenCalledTimes(2);
    expect(batchUpsertMock.mock.calls[1]?.[1]).toEqual(batchUpsertMock.mock.calls[0]?.[1]);
  });
});
