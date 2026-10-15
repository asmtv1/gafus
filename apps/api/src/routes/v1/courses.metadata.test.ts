import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { coursesRoutes } from "./courses";

const { getCourseMetadataMock } = vi.hoisted(() => ({
  getCourseMetadataMock: vi.fn(),
}));

vi.mock("@gafus/core/services/course", () => ({
  getCourseMetadata: getCourseMetadataMock,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn() }),
}));

const app = new Hono();
app.route("/api/v1/courses", coursesRoutes);

describe("GET /api/v1/courses/metadata", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not reveal private-course metadata, including video URLs", async () => {
    getCourseMetadataMock.mockResolvedValue({
      id: "private-1", name: "Private title", isPrivate: true,
      description: "Secret lessons", videoUrl: "https://storage.example/private.mp4",
    });
    const response = await app.request("/api/v1/courses/metadata?courseType=private-course");
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).not.toContain("Private title");
    expect(body).not.toContain("Secret lessons");
    expect(body).not.toContain("private.mp4");
  });

  it("keeps public-course metadata available for OG previews", async () => {
    getCourseMetadataMock.mockResolvedValue({
      id: "public-1", name: "Public title", isPrivate: false, isPaid: true,
    });
    const response = await app.request("/api/v1/courses/metadata?courseType=public-course");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    await expect(response.json()).resolves.toMatchObject({
      success: true, data: { name: "Public title" },
    });
  });
});
