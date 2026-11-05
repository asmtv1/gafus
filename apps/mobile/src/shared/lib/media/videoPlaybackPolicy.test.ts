import { describe, expect, it, vi } from "vitest";
import { selectMp4Quality } from "@gafus/chat-media-quality";

const storage = vi.hoisted(() => ({ value: '720', writes: [] as string[] }));
vi.mock("react-native", () => ({ PixelRatio: { get: () => 3 } }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => storage.value),
    setItem: vi.fn(async (_key: string, value: string) => {
      storage.writes.push(value);
      storage.value = value;
    }),
  },
}));
import {
  loadNativeMp4Mode, nativeMp4Hints, saveNativeMp4Mode, updateNativeMp4Network,
} from "./videoPlaybackPolicy";

describe("Mobile MP4 quality preferences and NetInfo", () => {
  it("restores a saved manual quality, persists a new one and honors Wi-Fi data", async () => {
    expect(await loadNativeMp4Mode()).toBe(720);
    saveNativeMp4Mode(360);
    // AsyncStorage writes run serially.
    await vi.waitFor(() => expect(storage.value).toBe('360'));
    expect(await loadNativeMp4Mode()).toBe(360);
    updateNativeMp4Network({
      type: "wifi", isConnected: true, details: { isConnectionExpensive: false },
    } as never);
    const hints = nativeMp4Hints(220);
    expect(hints.devicePixelRatio).toBe(3);
    expect(hints.connectionType).toBe("wifi");
    expect(selectMp4Quality("auto", hints)).toBe(720);
    expect(selectMp4Quality(360, hints)).toBe(360);
  });
  it("treats 3G as slow, and 5G as fast when not in data saving mode", () => {
    updateNativeMp4Network({
      type: "cellular", isConnected: true, details: {
        cellularGeneration: "3g", isConnectionExpensive: true,
      },
    } as never);
    expect(selectMp4Quality("auto", nativeMp4Hints(390))).toBe(360);
    updateNativeMp4Network({
      type: "cellular", isConnected: true, details: {
        cellularGeneration: "5g", isConnectionExpensive: true,
      },
    } as never);
    expect(selectMp4Quality("auto", nativeMp4Hints(390))).toBe(720);
  });
});
