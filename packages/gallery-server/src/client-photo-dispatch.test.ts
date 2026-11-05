import { describe, expect, it, vi } from "vitest";
import { dispatchGalleryRequest } from "./index.js";
import type { GalleryService } from "@gafus/core/services/gallery";

const upload = "8dc418f6-97da-42be-ab73-b3c172c95ccd";
const invoke = (path: string, body = "{}") => new Request(`https://x${path}`, {
  method: "POST", headers: { "content-type": "application/json" }, body,
});

describe("Gallery Mobile client photo routes", () => {
  it("dispatches S3 client-reserve to the guarded core method", async () => {
    const reserveClientUpload = vi.fn().mockResolvedValue({ uploadId: upload });
    const gallery = { reserveClientUpload } as unknown as GalleryService;
    const input = { filename: "photo.webp", declaredMime: "image/webp",
      declaredBytes: 45678, clientRequestId: "89c418f6-97da-42be-ab73-b3c172c95ccd" };
    const result = await dispatchGalleryRequest("owner", invoke("/uploads/client-reserve",
      JSON.stringify(input)), "/uploads/client-reserve", gallery);
    expect(result).toEqual({ uploadId: upload });
    expect(reserveClientUpload).toHaveBeenCalledOnce();
    expect(reserveClientUpload).toHaveBeenCalledWith("owner", input);
  });
  it("renews only the owner-scoped thumbnail POST after a retry, without enqueue", async () => {
    const getClientThumbUpload = vi.fn().mockResolvedValue({ method: "POST", url: "https://s3.invalid/", fields: {} });
    const enqueue = vi.fn();
    const gallery = { getClientThumbUpload } as unknown as GalleryService;
    await expect(dispatchGalleryRequest("owner", invoke(`/uploads/${upload}/client-thumb`),
      `/uploads/${upload}/client-thumb`, gallery, enqueue))
      .resolves.toMatchObject({ method: "POST" });
    expect(getClientThumbUpload).toHaveBeenCalledExactlyOnceWith("owner", upload);
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("completes a phone-prepared picture as READY without signaling Cloud.ru Jobs", async () => {
    const confirmClientUpload = vi.fn().mockResolvedValue({ uploadId: upload, status: "ready" });
    const enqueue = vi.fn();
    const gallery = { confirmClientUpload } as unknown as GalleryService;
    const result = await dispatchGalleryRequest("owner", invoke(`/uploads/${upload}/client-complete`),
      `/uploads/${upload}/client-complete`, gallery, enqueue);
    expect(result).toMatchObject({ status: "ready" });
    expect(confirmClientUpload).toHaveBeenCalledExactlyOnceWith("owner", upload);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
