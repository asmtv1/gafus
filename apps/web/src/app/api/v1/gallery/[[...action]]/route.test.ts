import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { dispatchMock } = vi.hoisted(() => ({ dispatchMock: vi.fn(async (_actor: string, _request: Request, path: string) => ({ path })) }));
vi.mock("@gafus/gallery-server", () => ({
  dispatchGalleryRequest: dispatchMock,
  galleryHttpError: (error: unknown) => ({ status: 404, body: { success: false, error: String(error), code: "NOT_FOUND" } }),
}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => ({ user: { id: "actor-1" } })) }));
vi.mock("@gafus/csrf/middleware", () => ({
  withCSRFProtection: (handler: (request: NextRequest) => Promise<NextResponse>) => async (request: NextRequest) => {
    if (!request.headers.get("x-csrf-token")) return NextResponse.json({ success: false, error: "CSRF token required", code: "CSRF_TOKEN_MISSING" }, { status: 403 });
    return handler(request);
  },
}));

import { GET, POST } from "./route";

describe("gallery Next adapter security", () => {
  it("keeps CSRF mutation failures no-store", async () => {
    const response = await POST(new NextRequest("https://example.test/api/v1/gallery/albums", { method: "POST" }));
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps dispatcher errors no-store", async () => {
    dispatchMock.mockRejectedValueOnce(new Error("not found"));
    const response = await GET(new NextRequest("https://example.test/api/v1/gallery/unsupported"));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("preserves profile usernames containing the gallery prefix and pagination", async () => {
    const response = await GET(new NextRequest("https://example.test/api/v1/gallery/profiles/gallery_qa_owner/albums?cursor=next-token&pageSize=20"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { path: "/profiles/gallery_qa_owner/albums" } });
    expect(dispatchMock.mock.calls.at(-1)?.[2]).toBe("/profiles/gallery_qa_owner/albums");
    expect(dispatchMock.mock.calls.at(-1)?.[1].url).toContain("cursor=next-token&pageSize=20");
  });
});
