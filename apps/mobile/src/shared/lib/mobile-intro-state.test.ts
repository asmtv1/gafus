import { beforeEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));
beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); storage.getItem.mockResolvedValue(null); storage.setItem.mockResolvedValue(undefined); });
describe("mobile intro persistence", () => {
  it.each([null, "null", "[]", "false", "broken", '{"index":"2","finished":"true"}'])("recovers invalid state %s", async (raw) => {
    const { parseMobileIntroState } = await import("./mobile-intro-state");
    expect(parseMobileIntroState(raw)).toEqual({ index: 0, finished: false });
  });
  it("clamps old slide indexes and preserves completion", async () => {
    const { parseMobileIntroState } = await import("./mobile-intro-state");
    expect(parseMobileIntroState('{"index":99,"finished":true}')).toEqual({ index: 5, finished: true });
    expect(parseMobileIntroState('{"index":-4}').index).toBe(0);
  });
  it("serializes rapid changes before completion and navigation reads", async () => {
    const { saveMobileIntroState, readMobileIntroState } = await import("./mobile-intro-state");
    let release!: () => void;
    storage.setItem.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const first = saveMobileIntroState({ index: 2, finished: false });
    const last = saveMobileIntroState({ index: 5, finished: true });
    await Promise.resolve();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(await readMobileIntroState()).toEqual({ index: 5, finished: true });
    release(); await Promise.all([first, last]);
    expect(JSON.parse(storage.setItem.mock.calls[1][1])).toEqual({ index: 5, finished: true });
  });
  it("retains session completion and allows retry after failed storage", async () => {
    const { saveMobileIntroState, readMobileIntroState } = await import("./mobile-intro-state");
    storage.setItem.mockRejectedValueOnce(new Error("disk"));
    await expect(saveMobileIntroState({ index: 5, finished: true })).rejects.toThrow("disk");
    expect((await readMobileIntroState()).finished).toBe(true);
    await expect(saveMobileIntroState({ index: 5, finished: true })).resolves.toBeUndefined();
  });
  it("does not let a stale initialization overwrite completion", async () => {
    let release!: (raw: string) => void;
    storage.getItem.mockImplementationOnce(() => new Promise<string>((resolve) => { release = resolve; }));
    const { saveMobileIntroState, readMobileIntroState } = await import("./mobile-intro-state");
    const read = readMobileIntroState();
    await saveMobileIntroState({ index: 5, finished: true });
    release('{"index":1,"finished":false}');
    expect((await read).finished).toBe(true);
  });
});
