import { describe, expect, it, vi } from "vitest";

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("@gafus/gallery-server", () => ({
  GALLERY_MAX_BODY_BYTES: 16_384,
  dispatchGalleryInternalRequest: dispatch,
  galleryHttpError: () => ({ status: 403, body: { code: "FORBIDDEN" } }),
}));
import { internalGalleryRoutes } from "./gallery.js";

describe("cloud gallery response contract", () => {
  it.each([
    ["/uploads/claim", null],
    ["/jobs/claim", []],
    ["/maintenance", { expiredUploads: 0, reconciledJobs: 0, recoveredCleanupJobs: 0, processUploadIds: ["upload-1"] }],
  ])("returns the bare core DTO for %s", async (path, dto) => {
    dispatch.mockResolvedValueOnce(dto);
    const response = await internalGalleryRoutes.request(`/internal/gallery${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(dto);
  });

  it("preserves rejection of unauthorized cloud requests", async () => {
    dispatch.mockRejectedValueOnce(new Error("Invalid signature"));
    const response = await internalGalleryRoutes.request("/internal/gallery/uploads/claim", { method: "POST" });
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
