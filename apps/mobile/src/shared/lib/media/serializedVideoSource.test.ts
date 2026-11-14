import { describe, expect, it, vi } from "vitest";
import { SerializedVideoSource } from "./serializedVideoSource";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("SerializedVideoSource", () => {
  it("uses the same native player, drops superseded changes, and preserves latest intent", async () => {
    const waiting = deferred();
    const player = { replaceAsync: vi.fn().mockReturnValueOnce(waiting.promise).mockResolvedValue(undefined),
      pause: vi.fn(), release: vi.fn() };
    const native = new SerializedVideoSource<string>(player);
    const ready = vi.fn();
    const first = native.replace("360", () => ready("360"));
    await Promise.resolve();
    const outdated = native.replace("720", () => ready("720"));
    const latest = native.replace("360-again", () => ready("360-again"));
    waiting.resolve();
    await Promise.all([first, outdated, latest]);
    expect(player.replaceAsync.mock.calls).toEqual([["360"], ["360-again"]]);
    expect(ready.mock.calls).toEqual([["360-again"]]);
    native.dispose();
    await Promise.resolve();
    expect(player.release).toHaveBeenCalledOnce();
  });

  it("waits for a pending iOS replacement before releasing on unmount", async () => {
    const waiting = deferred();
    const player = { replaceAsync: vi.fn().mockReturnValue(waiting.promise),
      pause: vi.fn(), release: vi.fn() };
    const native = new SerializedVideoSource<string>(player);
    const onReady = vi.fn();
    const replacement = native.replace("720", onReady);
    await Promise.resolve();
    native.dispose();
    native.dispose();
    expect(player.release).not.toHaveBeenCalled();
    waiting.resolve();
    await replacement;
    await Promise.resolve();
    expect(onReady).not.toHaveBeenCalled();
    expect(player.pause).toHaveBeenCalledOnce();
    expect(player.release).toHaveBeenCalledOnce();
    await native.replace("360", onReady);
    expect(player.replaceAsync).toHaveBeenCalledTimes(1);
  });

  it("serializes native thumbnail work and waits for it before release", async () => {
    const waiting = deferred();
    const player = { replaceAsync: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(), release: vi.fn() };
    const native = new SerializedVideoSource<string>(player);
    const thumbnail = vi.fn();
    const image = native.perform(() => waiting.promise, thumbnail);
    await Promise.resolve();
    const changed = native.replace("720", () => undefined);
    native.dispose();
    expect(player.release).not.toHaveBeenCalled();
    waiting.resolve();
    await Promise.all([image, changed]);
    await Promise.resolve();
    expect(thumbnail).not.toHaveBeenCalled();
    expect(player.replaceAsync).not.toHaveBeenCalled();
    expect(player.release).toHaveBeenCalledOnce();
  });

  it("continues after a failed source and allows explicit recovery", async () => {
    const player = { replaceAsync: vi.fn().mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined), pause: vi.fn(), release: vi.fn() };
    const native = new SerializedVideoSource<string>(player);
    await expect(native.replace("360", () => undefined)).rejects.toThrow("network");
    const ready = vi.fn();
    await native.replace("720", ready);
    expect(ready).toHaveBeenCalledOnce();
    native.dispose();
    await Promise.resolve();
  });
});
