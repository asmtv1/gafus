import { describe, it, expect, vi } from "vitest";
import type { GalleryUploadDto } from "@gafus/types";
import { createUploadTask, type UploadEntry } from "./uploadTask";
function dto(
  status: GalleryUploadDto["status"] = "reserved",
  uploadId = "parent",
): GalleryUploadDto {
  return {
    uploadId,
    albumId: "album",
    status,
    postUrl: "https://bucket.test",
    postFields: { key: uploadId },
    expiresAt: null,
    reservationExpiresAt: "2099-01-01",
    photo: null,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  const api = {
    reserveUpload: vi.fn().mockResolvedValue(dto()),
    getUpload: vi.fn().mockResolvedValue(dto()),
    retryUpload: vi.fn().mockResolvedValue(dto("reserved", "child")),
    confirmUpload: vi.fn().mockResolvedValue(dto("processing")),
    cancelUpload: vi.fn().mockResolvedValue(dto("cancelled")),
  };
  const file = { name: "photo.jpg", type: "image/jpeg", size: 1024 } as File;
  const entry: UploadEntry = {
    key: "reservation-key",
    name: file.name,
    file,
    state: "queued",
    progress: 0,
  };
  const transfer = vi.fn().mockResolvedValue(undefined);
  const publish = vi.fn();
  const changed = vi.fn();
  let valid = true;
  const task = createUploadTask({
    api,
    transfer,
    publish,
    changed,
    valid: () => valid,
    abort: vi.fn(),
    message: (error) => String(error),
  });
  return {
    api,
    entry,
    transfer,
    publish,
    changed,
    task,
    expire: () => {
      valid = false;
    },
  };
}
describe("upload operation recovery and cancellation", () => {
  it("replays an ambiguous reservation with the original key", async () => {
    const { api, entry, task } = setup();
    api.reserveUpload.mockRejectedValueOnce(new Error("lost reservation response"));
    await task.run(entry);
    await task.run(entry);
    expect(api.reserveUpload.mock.calls.map(([input]) => input.clientRequestId)).toEqual([
      entry.key,
      entry.key,
    ]);
    expect(api.retryUpload).not.toHaveBeenCalled();
    expect(entry.state).toBe("processing");
  });
  it("reuses signed POST instructions after a lost bucket response", async () => {
    const { api, entry, task, transfer } = setup();
    transfer.mockRejectedValueOnce(new Error("lost POST response"));
    await task.run(entry);
    await task.run(entry);
    expect(api.getUpload).toHaveBeenCalledWith("parent");
    expect(api.retryUpload).not.toHaveBeenCalled();
    expect(transfer.mock.calls.map(([upload]) => upload.uploadId)).toEqual(["parent", "parent"]);
    expect(entry.state).toBe("processing");
  });
  it.each(["uploaded", "processing", "ready"] as const)(
    "adopts server %s before retry",
    async (status) => {
      const { api, entry, task, transfer } = setup();
      entry.uploadId = "parent";
      entry.state = "failed";
      api.getUpload.mockResolvedValue(dto(status));
      await task.run(entry);
      expect(entry.state).toBe(status);
      expect(api.retryUpload).not.toHaveBeenCalled();
      expect(transfer).not.toHaveBeenCalled();
    },
  );
  it("avoids refreshing gallery lists every time a pending state is polled", async () => {
    const { api, entry, task, changed, publish } = setup();
    await task.run(entry);
    const refreshed = changed.mock.calls.length;
    const published = publish.mock.calls.length;
    api.getUpload.mockResolvedValueOnce(dto("processing"));
    await task.poll(entry);
    expect(changed).toHaveBeenCalledTimes(refreshed);
    expect(publish).toHaveBeenCalledTimes(published);
    api.getUpload.mockResolvedValueOnce(dto("ready"));
    await task.poll(entry);
    expect(changed).toHaveBeenCalledTimes(refreshed + 1);
    expect(publish).toHaveBeenCalledTimes(published + 1);
  });
  it("preserves elapsed processing time across status polling and clears it on completion", async () => {
    const { api, entry, task } = setup();
    await task.run(entry);
    expect(entry.state).toBe("processing");
    const started = entry.processingStartedAt;
    expect(started).toEqual(expect.any(Number));
    api.getUpload.mockResolvedValueOnce(dto("processing"));
    await task.poll(entry);
    expect(entry.processingStartedAt).toBe(started);
    api.getUpload.mockResolvedValueOnce(dto("ready"));
    await task.poll(entry);
    expect(entry.processingStartedAt).toBeUndefined();
  });
  it("replays a lost confirm without another bucket POST", async () => {
    const { api, entry, task, transfer } = setup();
    api.confirmUpload.mockRejectedValueOnce(new Error("lost confirm response"));
    await task.run(entry);
    await task.run(entry);
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(api.confirmUpload).toHaveBeenCalledTimes(2);
    expect(api.retryUpload).not.toHaveBeenCalled();
  });
  it("replays the exact lost retry operation before reading its tombstoned parent, including file reselection", async () => {
    const { api, entry, task } = setup();
    entry.uploadId = "parent";
    let committedId: string | undefined;
    api.getUpload.mockImplementation(async () => {
      if (committedId) throw new Error("parent tombstoned: 404");
      return dto("failed");
    });
    api.retryUpload.mockImplementation(async (_parent, operation) => {
      if (!committedId) {
        committedId = operation.clientRequestId;
        throw new Error("child committed, response lost");
      }
      if (operation.clientRequestId !== committedId) throw new Error("REQUEST_CONFLICT");
      return dto("reserved", "child");
    });
    await task.run(entry);
    const operation = { ...entry.pendingRetry! };
    entry.file = { name: "photo.jpg", type: "image/jpeg", size: 1024 } as File;
    api.confirmUpload.mockResolvedValue(dto("processing", "child"));
    await task.run(entry);
    expect(api.retryUpload.mock.calls).toEqual([
      [operation.parentId, { clientRequestId: operation.clientRequestId }],
      [operation.parentId, { clientRequestId: operation.clientRequestId }],
    ]);
    expect(api.getUpload).toHaveBeenCalledTimes(1);
    expect(entry.uploadId).toBe("child");
    expect(entry.pendingRetry).toBeUndefined();
  });
  it("ignores deferred confirm after authoritative cancellation", async () => {
    const { api, entry, task } = setup();
    const confirm = deferred<GalleryUploadDto>();
    api.confirmUpload.mockImplementation(() => confirm.promise);
    const run = task.run(entry);
    await vi.waitFor(() => expect(api.confirmUpload).toHaveBeenCalledTimes(1));
    await task.cancel(entry);
    confirm.resolve(dto("processing"));
    await run;
    expect(entry.state).toBe("cancelled");
    expect(entry.file).toBeUndefined();
  });
  it("ignores deferred poll after cancellation", async () => {
    const { api, entry, task } = setup();
    entry.uploadId = "parent";
    entry.state = "processing";
    const poll = deferred<GalleryUploadDto>();
    api.getUpload.mockImplementationOnce(() => poll.promise);
    const polling = task.poll(entry);
    await task.cancel(entry);
    poll.resolve(dto("ready"));
    await polling;
    expect(entry.state).toBe("cancelled");
  });
  it("reconciles cancellation rejection instead of claiming cancellation", async () => {
    const { api, entry, task } = setup();
    entry.uploadId = "parent";
    entry.state = "processing";
    api.getUpload.mockResolvedValue(dto("processing"));
    api.cancelUpload.mockRejectedValue(new Error("cannot cancel processing"));
    await task.cancel(entry);
    expect(entry.state).toBe("processing");
    expect(entry.error).toContain("cannot cancel");
    expect(entry.file).toBeDefined();
  });
  it("fences a deferred reservation after session expiry", async () => {
    const { api, entry, task, transfer, expire } = setup();
    const reservation = deferred<GalleryUploadDto>();
    api.reserveUpload.mockImplementation(() => reservation.promise);
    const run = task.run(entry);
    expire();
    reservation.resolve(dto());
    await run;
    expect(transfer).not.toHaveBeenCalled();
    expect(entry.uploadId).toBeUndefined();
  });
  it("cancels an ambiguous reservation and ignores its older response", async () => {
    const { api, entry, task, transfer } = setup();
    const pending = deferred<GalleryUploadDto>();
    api.reserveUpload.mockImplementationOnce(() => pending.promise);
    const run = task.run(entry);
    await task.cancel(entry);
    pending.resolve(dto());
    await run;
    expect(api.reserveUpload.mock.calls.map(([input]) => input.clientRequestId)).toEqual([
      entry.key,
      entry.key,
    ]);
    expect(entry.state).toBe("cancelled");
    expect(transfer).not.toHaveBeenCalled();
  });
  it("does not confirm a bucket POST whose response arrives after cancel", async () => {
    const { api, entry, task, transfer } = setup();
    const pending = deferred<void>();
    transfer.mockImplementation(() => pending.promise);
    const run = task.run(entry);
    await vi.waitFor(() => expect(transfer).toHaveBeenCalledOnce());
    await task.cancel(entry);
    pending.resolve(undefined);
    await run;
    expect(api.confirmUpload).not.toHaveBeenCalled();
    expect(entry.state).toBe("cancelled");
  });
  it("reconciles a lost cancel response as authoritative cancelled", async () => {
    const { api, entry, task } = setup();
    entry.uploadId = "parent";
    entry.state = "processing";
    api.getUpload.mockResolvedValueOnce(dto("processing")).mockResolvedValueOnce(dto("cancelled"));
    api.cancelUpload.mockRejectedValueOnce(new Error("cancel committed, response lost"));
    await task.cancel(entry);
    expect(entry.state).toBe("cancelled");
    expect(entry.file).toBeUndefined();
    expect(entry.error).toBeUndefined();
  });
  it("reconciles a committed cancel whose subsequent read is tombstoned", async () => {
    const { api, entry, task } = setup();
    entry.uploadId = "parent";
    entry.state = "processing";
    entry.needsConfirm = true;
    entry.error = "previous failure";
    api.getUpload
      .mockResolvedValueOnce(dto())
      .mockRejectedValue(Object.assign(new Error("tombstoned"), { code: "NOT_FOUND" }));
    api.cancelUpload.mockRejectedValue(new Error("cancel committed, response lost"));
    await task.cancel(entry);
    expect(entry.state).toBe("cancelled");
    expect(entry.file).toBeUndefined();
    expect(entry.upload).toBeUndefined();
    expect(entry.pendingRetry).toBeUndefined();
    expect(entry.needsConfirm).toBe(false);
    expect(entry.reservationStarted).toBe(false);
    expect(entry.error).toBeUndefined();
    expect(entry.generation).toBe(1);
    expect(api.retryUpload).not.toHaveBeenCalled();
  });
  it("keeps unresolved cancellation fenced and allows another explicit cancellation", async () => {
    const { api, entry, task } = setup();
    entry.uploadId = "parent";
    entry.state = "processing";
    api.getUpload
      .mockResolvedValueOnce(dto("processing"))
      .mockRejectedValueOnce(new Error("reconciliation offline"))
      .mockRejectedValueOnce(Object.assign(new Error("tombstoned"), { code: "NOT_FOUND" }));
    api.cancelUpload.mockRejectedValueOnce(new Error("cancel response lost"));
    await task.cancel(entry);
    expect(entry.state).toBe("cancel_unknown");
    expect(entry.error).toContain("reconciliation offline");
    expect(entry.file).toBeDefined();
    expect(entry.generation).toBe(1);
    await task.cancel(entry);
    expect(entry.state).toBe("cancelled");
    expect(entry.error).toBeUndefined();
    expect(entry.file).toBeUndefined();
    expect(entry.generation).toBe(2);
    expect(api.cancelUpload).toHaveBeenCalledOnce();
  });
  it("does not interpret a pending retry POST NOT_FOUND as confirmed cancellation", async () => {
    const { api, entry, task } = setup();
    entry.uploadId = "parent";
    entry.pendingRetry = { parentId: "parent", clientRequestId: "exact-operation" };
    api.retryUpload.mockRejectedValue(
      Object.assign(new Error("retry unavailable"), { code: "NOT_FOUND" }),
    );
    await task.cancel(entry);
    expect(entry.state).toBe("cancel_unknown");
    expect(entry.pendingRetry).toEqual({ parentId: "parent", clientRequestId: "exact-operation" });
    expect(entry.file).toBeDefined();
    expect(api.getUpload).not.toHaveBeenCalled();
    expect(api.retryUpload.mock.calls[0]).toEqual(api.retryUpload.mock.calls[1]);
  });
  it("keeps a deferred confirm fenced even when cancellation cannot be reconciled", async () => {
    const { api, entry, task } = setup();
    const confirm = deferred<GalleryUploadDto>();
    api.confirmUpload.mockImplementation(() => confirm.promise);
    const run = task.run(entry);
    await vi.waitFor(() => expect(api.confirmUpload).toHaveBeenCalledOnce());
    api.getUpload.mockResolvedValueOnce(dto()).mockRejectedValueOnce(new Error("offline"));
    api.cancelUpload.mockRejectedValueOnce(new Error("cancel response lost"));
    await task.cancel(entry);
    expect(entry.state).toBe("cancel_unknown");
    confirm.resolve(dto("processing"));
    await run;
    expect(entry.state).toBe("cancel_unknown");
    expect(entry.error).toContain("offline");
    expect(entry.file).toBeDefined();
  });
  it("ignores a cancellation reconciliation tombstone after session expiry", async () => {
    const { api, entry, task, expire, publish } = setup();
    entry.uploadId = "parent";
    let reject!: (reason: unknown) => void;
    const reconciliation = new Promise<GalleryUploadDto>((_resolve, fail) => {
      reject = fail;
    });
    api.getUpload.mockResolvedValueOnce(dto()).mockImplementationOnce(() => reconciliation);
    api.cancelUpload.mockRejectedValue(new Error("cancel response lost"));
    const cancelling = task.cancel(entry);
    await vi.waitFor(() => expect(api.getUpload).toHaveBeenCalledTimes(2));
    expire();
    const publications = publish.mock.calls.length;
    reject(Object.assign(new Error("tombstoned"), { code: "NOT_FOUND" }));
    await cancelling;
    expect(entry.state).toBe("cancelling");
    expect(entry.file).toBeDefined();
    expect(publish).toHaveBeenCalledTimes(publications);
  });
  it("cancels a child while its first retry response is deferred without reading the tombstoned parent", async () => {
    const { api, entry, task, transfer } = setup();
    entry.uploadId = "parent";
    api.getUpload.mockResolvedValueOnce(dto("failed"));
    const pending = deferred<GalleryUploadDto>();
    api.retryUpload.mockImplementationOnce(() => pending.promise);
    api.cancelUpload.mockResolvedValue(dto("cancelled", "child"));
    const run = task.run(entry);
    await vi.waitFor(() => expect(api.retryUpload).toHaveBeenCalledOnce());
    await task.cancel(entry);
    pending.resolve(dto("reserved", "child"));
    await run;
    expect(api.retryUpload.mock.calls[0]).toEqual(api.retryUpload.mock.calls[1]);
    expect(api.getUpload).toHaveBeenCalledOnce();
    expect(api.cancelUpload).toHaveBeenCalledWith("child");
    expect(entry.state).toBe("cancelled");
    expect(transfer).not.toHaveBeenCalled();
  });
});
