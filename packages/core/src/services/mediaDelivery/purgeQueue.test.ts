import { describe, expect, it, vi } from "vitest";
import { deletedMediaPurgePaths, enqueueDeletedMediaPurge } from "./purgeQueue";
import { verifyEdgePurgeJob } from "./purgeWorker";
const gallery = "albums/owner/album/photos/p/thumb.webp";
const galleryVet = "users/owner/pets/p/vet-visits/v/a/thumb.webp";
const galleryV2Thumb = "gallery/owner/media/p/v2/thumb.webp";
const galleryV2Full = "gallery/owner/media/p/v2/full.webp";
const feed = "media/v2/m/v1/image/l.webp";
const video = "media/v2/m/v1/video/360.mp4";
describe("transactional media edge purge outbox", () => {
  it("includes only valid cached final objects, including vet thumbs and MP4 renditions", () => {
    expect(deletedMediaPurgePaths("gallery", [gallery, galleryVet, gallery])).toEqual(["/" + gallery, "/" + galleryVet]);
    expect(deletedMediaPurgePaths("feed", [feed, video, "posts/owner/post/attachments/m/hls/playlist.m3u8"])).toEqual(["/" + feed, "/" + video]);
    expect(deletedMediaPurgePaths("gallery", [feed, "albums/owner/album/incoming/u/source.jpg"]))
      .toEqual([]);
    expect(() => deletedMediaPurgePaths("gallery", Array(1025).fill(gallery))).toThrow("MEDIA_PURGE_TOO_MANY_KEYS");
  });
  it("purges only Gallery V2 public renditions, not uploads, temp files or other owners", () => {
    expect(deletedMediaPurgePaths("gallery", [
      galleryV2Thumb, galleryV2Full, galleryV2Thumb,
      "gallery/owner/media/p/v2/source.jpg",
      "gallery/owner/media/p/v2/extra.webp",
      "gallery/owner/media/p/v2/thumb.webp/child",
      "gallery/owner/media/../v2/thumb.webp",
      "albums/owner/album/incoming/id/source.jpg",
      "albums/owner/album/incoming/id/attempts/token/full.webp",
      "media/v2/p/v1/image/l.webp",
    ])).toEqual(["/" + galleryV2Thumb, "/" + galleryV2Full]);
  });
  it("persists both Gallery V2 CDN purge paths atomically with an S3-delete callback", async () => {
    const sql = vi.fn().mockResolvedValue(1);
    await enqueueDeletedMediaPurge(
      { $executeRaw: sql } as never, "gallery", "v2-delete-job",
      [galleryV2Thumb, galleryV2Full, galleryV2Thumb],
      { GALLERY_CDN_PROVIDER: "beget", GALLERY_S3_ENDPOINT: "https://s3.cloud.ru" },
    );
    expect(sql).toHaveBeenCalledOnce();
    expect(sql.mock.calls[0]!.slice(1)).toEqual([
      "gallery:v2-delete-job", "gallery", ["/" + galleryV2Thumb, "/" + galleryV2Full],
    ]);
  });
  it("never enqueues until Beget on exact Cloud.ru backend is explicitly enabled", async () => {
    const sql = vi.fn().mockResolvedValue(1);
    const tx = { $executeRaw: sql } as never;
    await enqueueDeletedMediaPurge(tx, "gallery", "job", [gallery], {});
    await enqueueDeletedMediaPurge(tx, "gallery", "job", [gallery], { GALLERY_CDN_PROVIDER: "yandex" });
    expect(sql).not.toHaveBeenCalled();
    await expect(enqueueDeletedMediaPurge(tx, "gallery", "job", [gallery], {
      GALLERY_CDN_PROVIDER: "beget", GALLERY_S3_ENDPOINT: "https://storage.yandexcloud.net",
    })).rejects.toThrow("MEDIA_PURGE_STORAGE_UNVERIFIED");
    expect(sql).not.toHaveBeenCalled();
    await enqueueDeletedMediaPurge(tx, "gallery", "job-1", [gallery, galleryVet], {
      GALLERY_CDN_PROVIDER: "beget", GALLERY_S3_ENDPOINT: "https://s3.cloud.ru",
    });
    expect(sql).toHaveBeenCalledOnce();
    const strings = sql.mock.calls[0]![0] as TemplateStringsArray;
    expect(strings.join(" ")).toContain('ON CONFLICT ("id") DO NOTHING');
    expect(sql.mock.calls[0]!.slice(1)).toEqual(["gallery:job-1", "gallery", ["/" + gallery, "/" + galleryVet]]);
  });
  it("accepts Gallery V2 final objects through the actual edge purge worker gate", () => {
    const job = {
      id: "gallery:v2-delete-job", scope: "gallery",
      paths: ["/" + galleryV2Thumb, "/" + galleryV2Full],
      purgeOperations: [], attempts: 1,
      attemptToken: "11111111-1111-4111-8111-111111111111",
    };
    expect(() => verifyEdgePurgeJob(job)).not.toThrow();
    expect(() => verifyEdgePurgeJob({
      ...job, paths: ["/gallery/owner/media/p/v2/source.jpg"],
    })).toThrow("MEDIA_PURGE_JOB_UNTRUSTED");
  });
  it("never schedules CDN purge for noncacheable source uploads", async () => {
    const sql = vi.fn();
    await enqueueDeletedMediaPurge({ $executeRaw: sql } as never, "feed", "job-id", [
      "posts/owner/post/incoming/id/source.jpg",
      "posts/owner/post/attachments/id/hls/playlist.m3u8",
    ], { FEED_CDN_PROVIDER: "beget", FEED_S3_ENDPOINT: "https://s3.cloud.ru" });
    expect(sql).not.toHaveBeenCalled();
  });
});
