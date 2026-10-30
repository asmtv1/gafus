import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  chat2V2ClassifySource, chat2V2FinalKeys, chat2V2SourceKey,
  validateChat2V2Job, validateChat2V2Manifest, CHAT2_V2_IMAGE_EDGES, CHAT2_V2_VIDEO_QUALITIES,
  CHAT2_V2_MAX_DURATION_SECONDS,
} from "./chat2-v2.js";

const id = "room_1", owner = "actor_1", mediaId = randomUUID();
describe("Chat 2.0 Moments V2 future-job contract", () => {
  it("uses the same image dimensions, video tiers and duration cap as Moments", () => {
    expect(CHAT2_V2_IMAGE_EDGES).toEqual({ small: 360, medium: 720 });
    expect(CHAT2_V2_VIDEO_QUALITIES).toEqual([360, 720]);
    expect(CHAT2_V2_MAX_DURATION_SECONDS).toBe(120);
  });
  it("reserves strictly isolated originals and immutable WebP/MP4 variants", () => {
    expect(chat2V2SourceKey(id, owner, mediaId, "video/quicktime"))
      .toBe(`chat2/${id}/${owner}/${mediaId}/incoming/source.mov`);
    const keys = chat2V2FinalKeys(id, owner, mediaId);
    expect(keys.image.medium).toBe(`chat2/${id}/${owner}/${mediaId}/v1/image/m.webp`);
    expect(keys.video.variants[720]).toBe(`chat2/${id}/${owner}/${mediaId}/v1/video/720.mp4`);
    expect(keys.video.poster).toMatch(/\/v1\/poster\.webp$/);
  });
  it("denies partial, foreign or forged video output before READY", () => {
    const job = { conversationId: id, ownerId: owner, mediaId,
      sourceMime: "video/quicktime" as const, sourceBytes: 128,
      sourceKey: chat2V2SourceKey(id, owner, mediaId, "video/quicktime") };
    const keys = chat2V2FinalKeys(id, owner, mediaId);
    const output = { kind: "video" as const, width: 640, height: 360,
      durationSeconds: 25, posterKey: keys.video.poster,
      renditions: [{ quality: 360 as const, key: keys.video.variants[360],
        width: 640, height: 360, bytes: 2000 }] };
    expect(() => validateChat2V2Manifest(job, output)).not.toThrow();
    expect(() => validateChat2V2Manifest(job, { ...output, posterKey: "other/poster.webp" }))
      .toThrow("CHAT2_V2_INVALID_MANIFEST");
    expect(() => validateChat2V2Manifest(job, { ...output, renditions: [] }))
      .toThrow("CHAT2_V2_INVALID_MANIFEST");
    expect(() => validateChat2V2Manifest(job, { ...output, durationSeconds: 121 }))
      .toThrow("CHAT2_V2_INVALID_MANIFEST");
    expect(() => validateChat2V2Manifest(job, { ...output,
      renditions: [{ ...output.renditions[0], key: keys.video.variants[720] }] }))
      .toThrow("CHAT2_V2_INVALID_MANIFEST");
  });
  it("accepts Moments input formats and rejects forged identity, mime and sizes", () => {
    for (const mime of ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
      "video/mp4", "video/quicktime", "video/webm"]) {
      expect(chat2V2ClassifySource(mime, 128).ext).toBeTruthy();
    }
    expect(() => chat2V2ClassifySource("image/gif", 128)).toThrow();
    expect(() => chat2V2ClassifySource("video/mp4", 201 * 1024 * 1024)).toThrow();
    expect(() => chat2V2ClassifySource("image/png", 11 * 1024 * 1024)).toThrow();
    expect(() => chat2V2SourceKey("../escape", owner, mediaId, "video/mp4")).toThrow();
    expect(() => chat2V2SourceKey(id, owner, "a" + mediaId, "video/mp4")).toThrow();
    const job = { conversationId: id, ownerId: owner, mediaId, sourceMime: "video/webm" as const,
      sourceBytes: 128, sourceKey: chat2V2SourceKey(id, owner, mediaId, "video/webm") };
    expect(validateChat2V2Job(job).kind).toBe("video");
    expect(() => validateChat2V2Job({ ...job, sourceKey: job.sourceKey.replace(owner, "other") }))
      .toThrow("CHAT2_V2_UNTRUSTED_SOURCE_KEY");
  });
});
