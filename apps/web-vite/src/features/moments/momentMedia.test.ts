// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://127.0.0.1:5173"}
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadMomentMedia } from "./momentMedia";

function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: status === 200, data }), { status });
}
afterEach(() => vi.unstubAllGlobals());

describe("Moment media ephemeral signed delivery", () => {
  it("fetches fresh authorized detail and keeps only safe ready display URLs", async () => {
    const fake = vi.fn().mockResolvedValue(envelope({
      id: "post-1", status: "published",
      attachments: [
        { id: "photo-1", kind: "photo", status: "ready",
          thumbUrl: "https://cdn.example/thumb?signature=SECRET",
          fullUrl: "https://cdn.example/full?token=SECRET",
          internalS3Key: "PRIVATE_NEVER_EXPOSE" },
        { id: "video-1", kind: "video", status: "ready",
          posterUrl: "https://cdn.example/poster?expires=123",
          mp4Urls: { "360": "https://cdn.example/video-360.mp4?token=SIGNED" } },
        { id: "photo-2", kind: "photo", status: "processing",
          thumbUrl: "https://cdn.example/queued" },
      ],
    }));
    vi.stubGlobal("fetch", fake);
    const media = await loadMomentMedia("post-1");
    expect(fake.mock.calls[0][0]).toBe("/api/v1/feed/posts/post-1");
    expect(fake.mock.calls[0][1]).toMatchObject({
      method: "GET", credentials: "include", cache: "no-store",
    });
    expect(media).toHaveLength(2);
    expect(media[0]).toMatchObject({ id: "photo-1", kind: "photo",
      url: "https://cdn.example/thumb?signature=SECRET",
      mediumUrl: "https://cdn.example/thumb?signature=SECRET",
      fullUrl: "https://cdn.example/full?token=SECRET" });
    expect(media[1]).toMatchObject({ id: "video-1", kind: "video",
      url: "https://cdn.example/poster?expires=123",
      mp4Urls: { 360: "https://cdn.example/video-360.mp4?token=SIGNED" } });
    // New Feed V2 keeps separate full-resolution and MP4 variants for viewers;
    // only approved delivery URLs, never private S3 object metadata, survive.
    expect(JSON.stringify(media)).not.toContain("PRIVATE_NEVER_EXPOSE");
  });

  it("accepts only explicitly signed isolated loopback Feed media, never naked or foreign HTTP", async () => {
    const signed="http://127.0.0.1:9000/gafus-refactor-feed-test/feed/photo.webp"+
      "?X-Amz-Expires=60&X-Amz-Signature=synthetic";
    const photo = (url: string) => envelope({id:"post-1",status:"published",
      attachments:[{id:"photo-1",kind:"photo",status:"ready",thumbUrl:url}]});
    vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(photo(signed))
      .mockResolvedValueOnce(photo(signed.replace("test/","prod/")))
      .mockResolvedValueOnce(photo(signed.split("?")[0]!)));
    const media=await loadMomentMedia("post-1");
    expect(media).toHaveLength(1);
    expect(media[0]?.kind).toBe("photo");
    await expect(loadMomentMedia("post-1")).rejects.toThrow("Недопустимый");
    await expect(loadMomentMedia("post-1")).rejects.toThrow("Недопустимый");
  });
  it("rejects unsupported protocols and foreign HTTP links", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(envelope({ id: "post-1", status: "published",
        attachments: [{ id: "photo-1", kind: "photo", status: "ready",
          thumbUrl: "javascript:alert(1)" }] }))
      .mockResolvedValueOnce(envelope({ id: "post-1", status: "published",
        attachments: [{ id: "photo-1", kind: "photo", status: "ready",
          thumbUrl: "http://attacker.example/file" }] }));
    vi.stubGlobal("fetch", fake);
    await expect(loadMomentMedia("post-1")).rejects.toThrow("Недопустимый");
    await expect(loadMomentMedia("post-1")).rejects.toThrow("Недопустимый");
  });

  it("rejects invalid route ids, duplicate assets and unpublished private posts", async () => {
    const fake = vi.fn()
      .mockResolvedValueOnce(envelope({ id: "post-1", status: "draft",
        attachments: [] }))
      .mockResolvedValueOnce(envelope({ id: "post-1", status: "published",
        attachments: [{ id: "x", kind: "photo", status: "ready",
          thumbUrl: "https://cdn.example/a" },
        { id: "x", kind: "photo", status: "ready",
          thumbUrl: "https://cdn.example/b" }] }));
    vi.stubGlobal("fetch", fake);
    await expect(loadMomentMedia("../private")).rejects.toThrow("Некорректная");
    expect(fake).not.toHaveBeenCalled();
    await expect(loadMomentMedia("post-1")).rejects.toThrow("Медиа недоступно");
    await expect(loadMomentMedia("post-1")).rejects.toThrow("Медиа недоступно");
  });

  it("server auth refusal cannot be mistaken for an empty photo gallery", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(envelope(null, 403)));
    await expect(loadMomentMedia("post-1")).rejects.toThrow("Медиа недоступно");
  });
});
