import { describe, expect, it, vi } from "vitest";
import { deletedMediaPurgePaths, enqueueDeletedMediaPurge } from "./purgeQueue";
const gallery = "albums/owner/album/photos/p/thumb.webp";
const galleryVet = "users/owner/pets/p/vet-visits/v/a/thumb.webp";
const feed = "posts/owner/post/attachments/m/full.webp";
const segment = "posts/owner/post/attachments/m/hls/segment-000.ts";
describe("transactional media edge purge outbox", () => {
  it("includes only valid cached final objects, including vet thumbs and HLS segments", () => {
    expect(deletedMediaPurgePaths("gallery", [gallery, galleryVet, gallery])).toEqual(["/" + gallery, "/" + galleryVet]);
    expect(deletedMediaPurgePaths("feed", [feed, segment, "posts/owner/post/attachments/m/hls/playlist.m3u8"])).toEqual(["/" + feed, "/" + segment, "/posts/owner/post/attachments/m/hls/playlist.m3u8"]);
    const question = "questions/uploads/questions/owner/uuid-123.jpg";
    const full = "questions/uploads/questions/owner/uuid-123/full.webp";
    const thumb = "questions/uploads/questions/owner/uuid-123/thumb.webp";
    expect(deletedMediaPurgePaths("questions", [full, thumb])).toEqual(["/" + full, "/" + thumb]);
    expect(deletedMediaPurgePaths("questions", [question, question,
      "questions/uploads/questions/owner/../private.pdf"])).toEqual(["/" + question]);
    expect(deletedMediaPurgePaths("gallery", [feed, "albums/owner/album/incoming/u/source.jpg"]))
      .toEqual([]);
    expect(() => deletedMediaPurgePaths("gallery", Array(1025).fill(gallery))).toThrow("MEDIA_PURGE_TOO_MANY_KEYS");
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
  it("checkpoints a Questions CDN erasure only with verified public bucket and edge", async () => {
    const sql = vi.fn().mockResolvedValue(1);
    const tx = { $executeRaw: sql } as never;
    const key = "questions/uploads/questions/owner/uuid-123.jpg";
    await expect(enqueueDeletedMediaPurge(tx, "questions", "photo123", [key], {
      QUESTIONS_CDN_PROVIDER: "beget", QUESTIONS_PUBLIC_S3_BUCKET: "gafus-questions-public",
      QUESTIONS_CDN_BASE_URL: "https://ebiteskukingusk.begetcdn.cloud",
      QUESTIONS_CDN_LIVE_VERIFIED: "false",
    })).rejects.toThrow("MEDIA_PURGE_STORAGE_UNVERIFIED");
    expect(sql).not.toHaveBeenCalled();
    await enqueueDeletedMediaPurge(tx, "questions", "photo123", [key], {
      QUESTIONS_CDN_PROVIDER: "beget", QUESTIONS_PUBLIC_S3_BUCKET: "gafus-questions-public",
      QUESTIONS_CDN_BASE_URL: "https://ebiteskukingusk.begetcdn.cloud",
      QUESTIONS_CDN_LIVE_VERIFIED: "true",
    });
    expect(sql).toHaveBeenCalledOnce();
    expect(sql.mock.calls[0]!.slice(1)).toEqual(["questions:photo123", "questions", ["/" + key]]);
  });
  it("never schedules CDN purge for noncacheable source uploads", async () => {
    const sql = vi.fn();
    await enqueueDeletedMediaPurge({ $executeRaw: sql } as never, "feed", "job-id", [
      "posts/owner/post/incoming/id/source.jpg",
      "posts/owner/post/incoming/id/attempts/at/hls/playlist.m3u8",
    ], { FEED_CDN_PROVIDER: "beget", FEED_S3_ENDPOINT: "https://s3.cloud.ru" });
    expect(sql).not.toHaveBeenCalled();
  });
});
