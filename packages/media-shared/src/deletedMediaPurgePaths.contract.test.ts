import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { deletedMediaPurgePaths } from "./deletedMediaPurgePaths";

describe("pure CDN edge purge allowlist", () => {
  const feedVideo = "media/v2/m/v1/video/720.mp4";
  const galleryPhoto = "gallery/owner/media/p/v2/full.webp";

  it("permits only published final objects for the selected scope", () => {
    expect(deletedMediaPurgePaths("feed", [feedVideo, galleryPhoto, feedVideo])).toEqual([
      "/" + feedVideo,
    ]);
    expect(deletedMediaPurgePaths("gallery", [galleryPhoto, feedVideo])).toEqual([
      "/" + galleryPhoto,
    ]);
  });

  it("rejects legacy HLS playlists, private source uploads and provider URLs", () => {
    const forbidden = [
      "posts/owner/post/attachments/m/hls/playlist.m3u8",
      "gallery/owner/media/p/v2/source.jpg",
      "https://s3.cloud.ru/bucket/media/v2/m/v1/video/720.mp4",
      "media/v2/m/v1/video/720.mp4?X-Amz-Signature=secret",
      "../media/v2/m/v1/video/720.mp4",
    ];
    expect(deletedMediaPurgePaths("feed", forbidden)).toEqual([]);
    expect(deletedMediaPurgePaths("gallery", forbidden)).toEqual([]);
  });

  it("enforces bounded input lists before deduplication", () => {
    expect(() => deletedMediaPurgePaths("feed", Array(1025).fill(feedVideo))).toThrow(
      "MEDIA_PURGE_TOO_MANY_KEYS",
    );
  });

  it("has no ORM, provider or network dependency", () => {
    const code = readFileSync(join(import.meta.dirname, "deletedMediaPurgePaths.ts"), "utf8");
    const source = ts.createSourceFile(
      "deletedMediaPurgePaths.ts",
      code,
      ts.ScriptTarget.Latest,
      true,
    );
    expect(source.statements.filter(ts.isImportDeclaration)).toHaveLength(0);
    expect(code).not.toMatch(/\bfetch\s*\(|\bprisma\s*\.|@gafus\/.*-server/);
  });
});
