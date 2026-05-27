import { beforeEach, describe, expect, it, vi } from "vitest";

const { batchUpsertMock, reportClientErrorMock } = vi.hoisted(() => ({
  batchUpsertMock: vi.fn(),
  reportClientErrorMock: vi.fn(),
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

  it("clears queue and returns unauthorized on session expiration", async () => {
    usePreventionSyncStore.getState().addToQueue("pet-1", entryData, "client-1");
    batchUpsertMock.mockResolvedValueOnce({ success: false, code: "SESSION_EXPIRED" });

    await expect(usePreventionSyncStore.getState().processQueue()).resolves.toBe("unauthorized");

    expect(usePreventionSyncStore.getState().queue).toEqual([]);
  });
});
