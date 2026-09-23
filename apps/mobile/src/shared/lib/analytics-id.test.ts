import { expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ getItem: vi.fn().mockResolvedValue(null), setItem: vi.fn().mockResolvedValue(undefined) }));
const uuid = vi.hoisted(() => vi.fn(() => "same-installation"));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));
vi.mock("expo-crypto", () => ({ randomUUID: uuid }));
it("shares one installation ID across simultaneous analytics callers", async () => {
  const { getOrCreateMobileAnalyticsId } = await import("./analytics-id");
  expect(await Promise.all(Array.from({ length: 10 }, getOrCreateMobileAnalyticsId))).toEqual(Array(10).fill("same-installation"));
  expect(uuid).toHaveBeenCalledTimes(1);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
});
