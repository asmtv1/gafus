import { describe, expect, it, vi } from "vitest";
import { createGalleryWorkerOperations } from "./worker";
import type { GalleryContext } from "./context";

const at = new Date("2026-10-12T07:00:00.000Z");
const original = "users/o/pets/p/vet-visits/v/attach/original.jpg";
const preview = "users/o/pets/p/vet-visits/v/attach/thumb.webp";
const etag = `"${"a".repeat(32)}"`;
const previewEtag = `"${"b".repeat(32)}"`;

function setup(attachmentExists = true, enabled = false) {
  const attachment = attachmentExists ? { id: "attach", previewKey: null as string | null } : null;
  const job = {
    id: "job",
    dedupeKey: "vet-preview:attach",
    ownerId: "o",
    photoId: null,
    uploadId: null,
    destinationAlbumId: null,
    kind: "vetPreview" as const,
    sourceKeys: [original],
    sourceETags: [etag],
    targetKeys: [preview],
    status: "pending" as "pending" | "processing" | "done" | "cancelled",
    availableAt: at,
    attempts: 0,
    attemptToken: null as null | string,
    leaseUntil: null as Date | null,
  };
  const deleteSnapshots: string[][] = [];
  const tx = {
    user: { findUnique: vi.fn(async () => ({ id: "o" })) },
    $queryRaw: vi.fn(async () => [{ id: "o" }]),
    galleryStorageJob: {
      findUnique: vi.fn(async () => job),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(job, {
          ...data,
          attempts: typeof data.attempts === "object" ? job.attempts + 1 : job.attempts,
        });
        return job;
      }),
      upsert: vi.fn(async ({ create }: { create: { sourceKeys: string[] } }) => {
        deleteSnapshots.push(create.sourceKeys);
      }),
    },
    petVetAttachment: {
      findFirst: vi.fn(async () => attachment),
      updateMany: vi.fn(async ({ data }: { data: { previewKey: string } }) => {
        if (!attachment || attachment.previewKey !== null) return { count: 0 };
        attachment.previewKey = data.previewKey;
        return { count: 1 };
      }),
    },
  };
  const storage = {
    enabled,
    head: vi.fn(async (key: string) =>
      key === original
        ? { etag, bytes: 12, contentType: "image/jpeg" }
        : key === preview
          ? { etag: previewEtag, bytes: 40, contentType: "image/webp" }
          : null,
    ),
  };
  const ctx = {
    db: {
      galleryStorageJob: { findMany: vi.fn(async () => (job.status === "pending" ? [job] : [])) },
      $transaction: (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx),
    },
    storage,
    now: () => at,
  } as unknown as GalleryContext;
  return {
    worker: createGalleryWorkerOperations(ctx),
    tx,
    job,
    attachment,
    storage,
    deleteSnapshots,
  };
}

describe("core veterinary preview durable queue", () => {
  it("can claim and finish vet previews while the gallery product is disabled", async () => {
    const x = setup();
    const [claim] = await x.worker.claimStorageJobs({ limit: 1 });
    expect(claim).toMatchObject({
      kind: "vetPreview",
      sourceKeys: [original],
      targetKeys: [preview],
      sourceETags: [etag],
      writeMode: "create-if-absent",
    });
    expect(x.deleteSnapshots).toContainEqual([preview]);
    expect(
      await x.worker.completeStorageJob({ jobId: "job", attemptToken: claim!.attemptToken }),
    ).toEqual({ accepted: true, status: "done" });
    expect(x.attachment?.previewKey).toBe(preview);
    expect(x.job.status).toBe("done");
    expect(
      await x.worker.completeStorageJob({ jobId: "job", attemptToken: claim!.attemptToken }),
    ).toEqual({ accepted: true, status: "done" });
  });
  it("refuses to publish when the attachment was already deleted", async () => {
    const x = setup(false);
    expect(await x.worker.claimStorageJobs({ limit: 1 })).toEqual([]);
    expect(x.job.status).toBe("cancelled");
    expect(x.deleteSnapshots).toContainEqual([preview]);
    expect(x.tx.petVetAttachment.updateMany).not.toHaveBeenCalled();
  });
  it("cancels completion if the veterinary attachment disappeared after claiming", async () => {
    const x = setup();
    const [claim] = await x.worker.claimStorageJobs({ limit: 1 });
    vi.mocked(x.tx.petVetAttachment.findFirst).mockResolvedValue(null);
    expect(
      await x.worker.completeStorageJob({ jobId: "job", attemptToken: claim!.attemptToken }),
    ).toEqual({ accepted: false, status: "cancelled" });
    expect(x.job.status).toBe("cancelled");
    expect(x.tx.petVetAttachment.updateMany).not.toHaveBeenCalled();
    expect(x.deleteSnapshots).toContainEqual([preview]);
  });
  it("persists failed previews for deletion while retaining the original veterinary file", async () => {
    const x = setup();
    const [claim] = await x.worker.claimStorageJobs({ limit: 1 });
    expect(
      await x.worker.failStorageJob({
        jobId: "job",
        attemptToken: claim!.attemptToken,
        errorCode: "IMAGE_FORMAT",
        retryable: false,
      }),
    ).toEqual({ accepted: true, status: "failed" });
    expect(x.deleteSnapshots).toContainEqual([preview]);
    expect(x.deleteSnapshots).not.toContainEqual([original]);
    expect(x.attachment?.previewKey).toBeNull();
  });
  it("refuses a corrupted worker source key before any S3 side effects", async () => {
    const x = setup();
    x.job.sourceKeys[0] = "users/other/pets/p/vet-visits/v/attach/original.jpg";
    await expect(x.worker.claimStorageJobs({ limit: 1 })).rejects.toMatchObject({
      code: "UNTRUSTED_CLAIM",
    });
    expect(x.storage.head).not.toHaveBeenCalled();
    expect(x.tx.petVetAttachment.updateMany).not.toHaveBeenCalled();
  });
});
