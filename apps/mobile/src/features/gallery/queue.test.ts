import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GalleryUploadDto } from "@gafus/types";
vi.mock("expo-image", () => ({ Image: { clearMemoryCache: vi.fn().mockResolvedValue(undefined), clearDiskCache: vi.fn().mockResolvedValue(undefined) } }));
import { canDismissUploadTask, clearGallerySession, dismissUploadTask, updateTask, useGallerySession } from "./session";
import { cancelTask, pollTask, runUpload } from "./queue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const dto = (status: GalleryUploadDto["status"], uploadId = "parent"): GalleryUploadDto => ({
  uploadId, albumId: "album", status, postUrl: "https://bucket/upload", postFields: { "Content-Type": "image/jpeg" },
  expiresAt: null, reservationExpiresAt: "2026-10-08T12:00:00Z", photo: null,
});
const api = () => ({
  getUpload: vi.fn().mockResolvedValue(dto("failed")),
  reserveUpload: vi.fn().mockResolvedValue(dto("reserved")),
  retryUpload: vi.fn().mockResolvedValue(dto("reserved", "child")),
  confirmUpload: vi.fn().mockResolvedValue(dto("processing", "child")),
  cancelUpload: vi.fn().mockResolvedValue(dto("cancelled")),
});
const errorText = (error: unknown) => error instanceof Error ? error.message : "network";
function options() {
  const transfer = vi.fn().mockResolvedValue(undefined);
  const dispose = vi.fn();
  return { transfer, dispose, acquire: vi.fn().mockResolvedValue(vi.fn()), active: () => true,
    requestId: vi.fn().mockReturnValue("logical-retry"), errorText,
    prepare: vi.fn().mockResolvedValue({ input: { filename: "photo.jpg", declaredMime: "image/jpeg", declaredBytes: 12 }, transfer, dispose }) };
}
const fence = { epoch: 0, generation: 0 };
const task = () => useGallerySession.getState().tasks[0];
beforeEach(() => {
  useGallerySession.setState({ epoch: 0, tasks: [{ id: "task", owner: "owner", filename: "photo.jpg", generation: 0, status: "failed", upload: dto("failed") }] });
});
describe("native upload queue races", () => {
  it("replays the committed retry pair after lost response and a repick without reading tombstoned parent", async () => {
    const transport = api(); const first = deferred<GalleryUploadDto>(); const firstOptions = options();
    transport.retryUpload.mockImplementationOnce(() => first.promise);
    const running = runUpload("task", fence, transport, firstOptions);
    await vi.waitFor(() => expect(transport.retryUpload).toHaveBeenCalledTimes(1));
    expect(task().retryOperation).toEqual({ parentId: "parent", requestId: "logical-retry" });
    first.reject(new Error("response lost after commit")); await running;
    expect(task().upload?.uploadId).toBe("parent");
    updateTask("task", { generation: 1, filename: "repicked.jpg" }, fence);
    transport.getUpload.mockRejectedValue(new Error("parent tombstoned"));
    const secondOptions = options(); secondOptions.requestId.mockReturnValue("must-not-use");
    await runUpload("task", { epoch: 0, generation: 1 }, transport, secondOptions);
    expect(transport.getUpload).toHaveBeenCalledTimes(1);
    expect(transport.retryUpload.mock.calls).toEqual([
      ["parent", { clientRequestId: "logical-retry" }], ["parent", { clientRequestId: "logical-retry" }],
    ]);
    expect(task().upload?.uploadId).toBe("child"); expect(task().retryOperation).toBeUndefined();
    expect(secondOptions.transfer).toHaveBeenCalledTimes(1);
  });
  it("ignores a late confirm after successful cancellation", async () => {
    const transport = api(); const confirmed = deferred<GalleryUploadDto>();
    transport.getUpload.mockResolvedValue(dto("reserved")); transport.confirmUpload.mockImplementation(() => confirmed.promise);
    const running = runUpload("task", fence, transport, options());
    await vi.waitFor(() => expect(transport.confirmUpload).toHaveBeenCalled());
    await cancelTask("task", 0, transport, errorText);
    confirmed.resolve(dto("processing")); await running;
    expect(task().status).toBe("cancelled"); expect(task().cancelRequested).toBe(true);
  });
  it("ignores an in-flight poll after cancellation", async () => {
    const transport = api(); const polled = deferred<GalleryUploadDto>(); transport.getUpload.mockImplementation(() => polled.promise);
    const pending = pollTask("task", fence, transport);
    await cancelTask("task", 0, transport, errorText);
    polled.resolve(dto("processing")); await pending;
    expect(task().status).toBe("cancelled");
  });
  it("never starts transfer when cancellation arrives during preparation", async () => {
    const transport = api(); const config = options(); const prepared = deferred<Awaited<ReturnType<typeof config.prepare>>>();
    config.prepare.mockImplementation(() => prepared.promise);
    const running = runUpload("task", fence, transport, config);
    await vi.waitFor(() => expect(config.prepare).toHaveBeenCalled());
    await cancelTask("task", 0, transport, errorText);
    prepared.resolve({ input: { filename: "photo.jpg", declaredMime: "image/jpeg", declaredBytes: 12 }, transfer: config.transfer, dispose: config.dispose });
    await running;
    expect(transport.getUpload).not.toHaveBeenCalled(); expect(config.transfer).not.toHaveBeenCalled(); expect(config.dispose).toHaveBeenCalled();
  });
  it("releases a waiting slot without preparation after cancellation", async () => {
    const transport = api(); const config = options(); const acquired = deferred<() => void>();
    const release = vi.fn(); config.acquire.mockImplementation(() => acquired.promise);
    const running = runUpload("task", fence, transport, config);
    await cancelTask("task", 0, transport, errorText);
    acquired.resolve(release); await running;
    expect(config.prepare).not.toHaveBeenCalled(); expect(release).toHaveBeenCalledOnce();
    expect(task().status).toBe("cancelled");
  });
  it("stops before transport when the app backgrounds during preparation", async () => {
    const transport = api(); const config = options();
    const prepared = deferred<Awaited<ReturnType<typeof config.prepare>>>();
    let active = true; config.active = () => active;
    config.prepare.mockImplementation(() => prepared.promise);
    const running = runUpload("task", fence, transport, config);
    await vi.waitFor(() => expect(config.prepare).toHaveBeenCalled());
    active = false;
    prepared.resolve({ input: { filename: "photo.jpg", declaredMime: "image/jpeg", declaredBytes: 12 },
      transfer: config.transfer, dispose: config.dispose });
    await running;
    expect(transport.getUpload).not.toHaveBeenCalled(); expect(config.transfer).not.toHaveBeenCalled();
    expect(task().status).toBe("failed"); expect(config.dispose).toHaveBeenCalledOnce();
  });
  it("reconciles cancellation rejection with server-ready state", async () => {
    const transport = api(); transport.cancelUpload.mockRejectedValue(new Error("already ready")); transport.getUpload.mockResolvedValue(dto("ready"));
    await cancelTask("task", 0, transport, errorText);
    expect(task().status).toBe("ready"); expect(task().cancelRequested).toBe(false);
  });
  it("replays a pending retry to cancel its child and ignores the original late acknowledgement", async () => {
    const transport = api(); const child = deferred<GalleryUploadDto>(); const config = options();
    transport.retryUpload.mockImplementationOnce(() => child.promise);
    transport.cancelUpload.mockResolvedValue(dto("cancelled", "child"));
    const running = runUpload("task", fence, transport, config);
    await vi.waitFor(() => expect(transport.retryUpload).toHaveBeenCalled());
    await cancelTask("task", 0, transport, errorText);
    child.resolve(dto("reserved", "child")); await running;
    expect(transport.retryUpload.mock.calls).toEqual([
      ["parent", { clientRequestId: "logical-retry" }], ["parent", { clientRequestId: "logical-retry" }],
    ]);
    expect(transport.cancelUpload).toHaveBeenCalledExactlyOnceWith("child");
    expect(config.transfer).not.toHaveBeenCalled(); expect(task().status).toBe("cancelled");
  });
  it("cancels a reservation acknowledged after local cancellation without starting transfer", async () => {
    const transport = api(); const reserved = deferred<GalleryUploadDto>(); const config = options();
    updateTask("task", { upload: undefined }, fence);
    transport.reserveUpload.mockImplementation(() => reserved.promise);
    const running = runUpload("task", fence, transport, config);
    await vi.waitFor(() => expect(transport.reserveUpload).toHaveBeenCalled());
    await cancelTask("task", 0, transport, errorText);
    reserved.resolve(dto("reserved")); await running;
    expect(config.transfer).not.toHaveBeenCalled(); expect(transport.cancelUpload).toHaveBeenCalledExactlyOnceWith("parent");
    expect(task().status).toBe("cancelled");
  });
  it("reconciles a lost cancellation response when core reports a tombstoned upload", async () => {
    const transport = api(); transport.cancelUpload.mockRejectedValue(new Error("response lost"));
    transport.getUpload.mockRejectedValue(Object.assign(new Error("not found"), { code: "NOT_FOUND" }));
    await cancelTask("task", 0, transport, errorText); expect(task().status).toBe("cancelled");
  });
  it("keeps an ambiguous retry cancellation pending until the same command acknowledges its child", async () => {
    const transport = api();
    const retryOperation = { parentId: "parent", requestId: "logical-retry" };
    updateTask("task", { retryOperation }, fence);
    transport.retryUpload.mockRejectedValueOnce(new Error("response lost"));
    transport.getUpload.mockRejectedValue(Object.assign(new Error("tombstoned"), { code: "NOT_FOUND" }));
    await cancelTask("task", 0, transport, errorText);
    expect(task().status).toBe("cancelling");
    expect(task().retryOperation).toEqual(retryOperation);
    expect(transport.getUpload).not.toHaveBeenCalled();
    expect(transport.cancelUpload).not.toHaveBeenCalled();
    transport.cancelUpload.mockResolvedValue(dto("cancelled", "child"));
    await cancelTask("task", 0, transport, errorText);
    expect(transport.retryUpload.mock.calls).toEqual([
      ["parent", { clientRequestId: "logical-retry" }], ["parent", { clientRequestId: "logical-retry" }],
    ]);
    expect(transport.cancelUpload).toHaveBeenCalledExactlyOnceWith("child");
    expect(task().status).toBe("cancelled");
  });
  it("retains a cancellation fence when cancellation and reconciliation both lose network", async () => {
    const transport = api(); transport.cancelUpload.mockRejectedValue(new Error("offline")); transport.getUpload.mockRejectedValue(new Error("offline"));
    await cancelTask("task", 0, transport, errorText);
    expect(task().status).toBe("cancelling"); expect(task().cancelRequested).toBe(true);
    transport.cancelUpload.mockResolvedValue(dto("cancelled"));
    await cancelTask("task", 0, transport, errorText); expect(task().status).toBe("cancelled");
  });
  it.each(["cancelled", "failed", "expired"] as const)("maps authoritative %s distinctly", async status => {
    const transport = api(); transport.getUpload.mockResolvedValue(dto(status));
    await pollTask("task", fence, transport); expect(task().status).toBe(status);
  });
  it("fences a response from the previous session", async () => {
    const transport = api(); const polled = deferred<GalleryUploadDto>(); transport.getUpload.mockImplementation(() => polled.promise);
    const pending = pollTask("task", fence, transport); clearGallerySession();
    polled.resolve(dto("processing")); await pending; expect(useGallerySession.getState().tasks).toEqual([]);
  });
  it("ignores a poll from a superseded repick generation", async () => {
    const transport = api(); const polled = deferred<GalleryUploadDto>();
    transport.getUpload.mockImplementation(() => polled.promise);
    const pending = pollTask("task", fence, transport);
    updateTask("task", { generation: 1, status: "queued" }, fence);
    polled.resolve(dto("processing")); await pending;
    expect(task().status).toBe("queued"); expect(task().generation).toBe(1);
  });
  it("never transfers or confirms a reservation from the previous session", async () => {
    const transport = api(); const config = options(); const reserved = deferred<GalleryUploadDto>();
    updateTask("task", { upload: undefined }, fence);
    transport.reserveUpload.mockImplementation(() => reserved.promise);
    const running = runUpload("task", fence, transport, config);
    await vi.waitFor(() => expect(transport.reserveUpload).toHaveBeenCalled());
    clearGallerySession(); reserved.resolve(dto("reserved")); await running;
    expect(config.transfer).not.toHaveBeenCalled(); expect(transport.confirmUpload).not.toHaveBeenCalled();
    expect(useGallerySession.getState().tasks).toEqual([]);
  });
});

describe("upload status notification dismissal", () => {
  it.each(["ready", "cancelled", "failed", "expired"] as const)("can dismiss a finished %s notice", status => {
    updateTask("task", { status }, fence);
    expect(canDismissUploadTask(status)).toBe(true);
    dismissUploadTask("task", fence);
    expect(useGallerySession.getState().tasks).toEqual([]);
  });
  it.each(["queued", "sending", "processing", "cancelling"] as const)("keeps an active %s upload", status => {
    updateTask("task", { status }, fence);
    expect(canDismissUploadTask(status)).toBe(false);
    dismissUploadTask("task", fence);
    expect(task().status).toBe(status);
  });
  it("does not dismiss a newer retry or a different session", () => {
    updateTask("task", { generation: 1, status: "cancelled" }, fence);
    dismissUploadTask("task", fence);
    dismissUploadTask("task", { epoch: 1, generation: 1 });
    expect(task().generation).toBe(1);
    dismissUploadTask("task", { epoch: 0, generation: 1 });
    expect(useGallerySession.getState().tasks).toEqual([]);
  });
});
