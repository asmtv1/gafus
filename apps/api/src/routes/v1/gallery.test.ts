import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const { dispatchMock } = vi.hoisted(() => ({ dispatchMock: vi.fn(async (_actor: string, _request: Request, path: string) => ({ path })) }));
vi.mock("@gafus/gallery-server", () => ({
  GALLERY_MAX_BODY_BYTES: 16_384,
  dispatchGalleryRequest: dispatchMock,
  galleryHttpError: (error: unknown) => ({ status: 500, body: { success: false, error: String(error), code: "INTERNAL_ERROR" } }),
}));
import { galleryRoutes } from "./gallery.js";

describe("gallery Hono adapter security", () => {
  it("requires an authenticated actor and marks the 401 response no-store", async () => {
    const response = await galleryRoutes.request("/api/v1/gallery/albums");
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).code).toBe("UNAUTHORIZED");
  });

  it("preserves profile usernames containing the gallery prefix and pagination", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("user" as never, { id: "actor-1" } as never);
      await next();
    });
    app.route("/", galleryRoutes);
    const response = await app.request("/api/v1/gallery/profiles/gallery_qa_owner/albums?cursor=next-token&pageSize=20");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { path: "/profiles/gallery_qa_owner/albums" } });
    expect(dispatchMock.mock.calls.at(-1)?.[2]).toBe("/profiles/gallery_qa_owner/albums");
    expect(dispatchMock.mock.calls.at(-1)?.[1].url).toContain("cursor=next-token&pageSize=20");
  });
});
