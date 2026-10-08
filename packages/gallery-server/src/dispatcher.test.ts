import { describe, expect, it, vi } from "vitest";
import { createGalleryClient, type GalleryTransport } from "@gafus/types";
import { dispatchGalleryRequest, galleryHttpError } from "./index.js";
import type { GalleryService } from "@gafus/core/services/gallery";
import { createGalleryRequestVerifier, signGalleryRequest } from "@gafus/gallery-storage/hmac";

function fakeGallery() {
  const calls: unknown[][] = [];
  const gallery = new Proxy({}, { get: (_target, name) => (...args: unknown[]) => { calls.push([name, ...args]); return { called: name }; } }) as GalleryService;
  return { gallery, calls };
}

describe("gallery HTTP dispatch", () => {
  it("dispatches typed client methods to the core service and returns their DTO values", async () => {
    const { gallery, calls } = fakeGallery();
    const invoke = vi.fn(async (method: string, path: string, body?: unknown) => {
      const request = new Request(`https://example.test/api/v1/gallery/${path}`, {
        method,
        ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
      const suffix = new URL(request.url).pathname.slice("/api/v1/gallery".length);
      return dispatchGalleryRequest("actor-1", request, suffix, gallery);
    });
    const transport: GalleryTransport = (path, options) => invoke(options?.method ?? "GET", path, options?.body) as never;
    const client = createGalleryClient(transport);
    await client.setCover("album-1", { photoId: "photo-1" });
    expect(calls[0]?.[0]).toBe("setCover");
    expect(calls[0]?.[1]).toBe("actor-1");
    expect(calls[0]?.[2]).toBe("album-1");
    expect((await client.getAlbum("album-1")).called).toBe("getAlbum");
    expect(calls[1]?.[0]).toBe("getAlbum");
    await client.listAlbums("gallery_qa_owner", { cursor: "cursor-token", pageSize: 20 });
    expect(invoke).toHaveBeenLastCalledWith("GET", "profiles/gallery_qa_owner/albums?cursor=cursor-token&pageSize=20", undefined);
    expect(calls[2]?.[0]).toBe("listAlbums");
    expect(calls[2]?.[2]).toMatchObject({ username: "gallery_qa_owner", cursor: "cursor-token", pageSize: 20 });
  });

  it("rejects unsupported methods, unknown paths, malformed identifiers, and oversized JSON", async () => {
    const { gallery } = fakeGallery();
    const methodError = await dispatchGalleryRequest("actor", new Request("https://x/albums", { method: "OPTIONS" }), "/albums", gallery).catch(galleryHttpError);
    expect(methodError.status).toBe(405);
    const pathError = await dispatchGalleryRequest("actor", new Request("https://x/nope"), "/nope", gallery).catch(galleryHttpError);
    expect(pathError.status).toBe(404);
    const idError = await dispatchGalleryRequest("actor", new Request("https://x/albums/bad!"), "/albums/bad!", gallery).catch(galleryHttpError);
    expect(idError.status).toBe(400);
    const huge = "x".repeat(16_385);
    const bodyError = await dispatchGalleryRequest("actor", new Request("https://x/albums", { method: "POST", headers: { "content-type": "application/json" }, body: huge }), "/albums", gallery).catch(galleryHttpError);
    expect(bodyError.status).toBe(413);
  });

  it("rejects unsupported or oversized mutation bodies before calling core, including body-ignoring commands", async () => {
    const { gallery, calls } = fakeGallery();
    const multipart = await dispatchGalleryRequest("actor", new Request("https://x/uploads/u1/complete", {
      method: "POST", headers: { "content-type": "multipart/form-data; boundary=x" }, body: "--x--",
    }), "/uploads/u1/complete", gallery).catch(galleryHttpError);
    expect(multipart.status).toBe(415);
    expect(multipart.body.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(calls).toHaveLength(0);

    const oversized = await dispatchGalleryRequest("actor", new Request("https://x/uploads/u1/complete", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: "x".repeat(16_385) }),
    }), "/uploads/u1/complete", gallery).catch(galleryHttpError);
    expect(oversized.status).toBe(413);
    expect(calls).toHaveLength(0);

    const unknownCommandParam = await dispatchGalleryRequest("actor", new Request("https://x/uploads/u1/complete", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ unexpected: true }),
    }), "/uploads/u1/complete", gallery).catch(galleryHttpError);
    expect(unknownCommandParam.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("delegates ownership decisions to core and preserves core error codes", async () => {
    const { GalleryError } = await import("@gafus/core/services/gallery");
    const denied = new GalleryError("FORBIDDEN", "forbidden", 403);
    const gallery = new Proxy({}, { get: () => async () => { throw denied; } }) as GalleryService;
    const error = await dispatchGalleryRequest("actor", new Request("https://x/albums/album-1"), "/albums/album-1", gallery).catch(galleryHttpError);
    expect(error.status).toBe(403);
    expect(error.body.code).toBe("FORBIDDEN");
    expect(error.body.error).toBe("forbidden");
  });
});

describe("gallery internal request HMAC", () => {
  it("rejects replay, body tampering, and path tampering using an atomic nonce store", async () => {
    const secret = "s".repeat(32);
    const seen = new Set<string>();
    const verifier = createGalleryRequestVerifier({
      secret,
      nonces: { async consume(nonce) { if (seen.has(nonce)) return false; seen.add(nonce); return true; } },
    });
    const body = JSON.stringify({ uploadId: "u1" });
    const headers = signGalleryRequest({ method: "POST", path: "/internal/gallery/uploads/complete", body, secret, nonce: "nonce_12345678901234567890" });
    const request = { method: "POST", path: "/internal/gallery/uploads/complete", body, headers };
    expect(await verifier(request)).toBe(true);
    expect(await verifier(request)).toBe(false);
    const alteredHeaders = signGalleryRequest({ method: "POST", path: "/internal/gallery/uploads/complete", body, secret, nonce: "nonce_22345678901234567890" });
    expect(await verifier({ ...request, headers: alteredHeaders, body: `${body} ` })).toBe(false);
    const pathHeaders = signGalleryRequest({ method: "POST", path: "/internal/gallery/uploads/complete", body, secret, nonce: "nonce_32345678901234567890" });
    expect(await verifier({ ...request, path: "/internal/gallery/uploads/fail", headers: pathHeaders })).toBe(false);
  });
});
