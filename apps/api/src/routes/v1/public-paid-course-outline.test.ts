import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCourseMetadata, getCourseOutline } from "@gafus/core/services/course";
import { publicPaidCourseOutlineRoutes } from "./public-paid-course-outline";

vi.mock("@gafus/core/services/course", () => ({
  getCourseMetadata: vi.fn(), getCourseOutline: vi.fn(),
}));
const dayFields = { type: "regular", equipment: "Поводок", estimatedDuration: 10, theoryMinutes: 2 };
const metadata = vi.mocked(getCourseMetadata);
const outline = vi.mocked(getCourseOutline);
const course = {
  id: "course1", name: "Занятия с собакой", shortDesc: "Программа",
  description: "Чему научим", isPrivate: false, isPaid: true,
  videoUrl: "PRIVATE_SIGNED_VIDEO_URL", equipment: "Поводок",
  trainingLevel: "BEGINNER" as const, logoImg: "PRIVATE_LOGO_URL",
  userCourses: [{ userId: "PRIVATE_OWNER" }],
};
beforeEach(() => {
  vi.resetAllMocks();
  metadata.mockResolvedValue(course);
  outline.mockResolvedValue([{ id: "clwdayoc0000000000000001", title: "День первый", order: 1, type: "regular", equipment: "Поводок", estimatedDuration: 10, theoryMinutes: 2 }]);
});

describe("anonymous Next paid-course outline public Hono projection", () => {
  it("returns only marketing metadata and ordered titles, never signed media or user data", async () => {
    const response = await publicPaidCourseOutlineRoutes.request("/DOG_TRAINING");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json() as { success: true; data: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      courseId: "course1", courseType: "DOG_TRAINING", name: "Занятия с собакой",
      outline: [{ id: "clwdayoc0000000000000001", title: "День первый", order: 1, type: "regular", equipment: "Поводок", estimatedDuration: 10, theoryMinutes: 2 }],
    });
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE_|videoUrl|userCourses|logoImg|stepLinks/);
    expect(metadata).toHaveBeenCalledExactlyOnceWith("DOG_TRAINING");
    expect(outline).toHaveBeenCalledExactlyOnceWith("DOG_TRAINING");
  });
  it("fails closed for private, nonpaid and missing courses before reading outline", async () => {
    for (const value of [{ ...course, isPrivate: true },
      { ...course, isPaid: false }, null]) {
      metadata.mockResolvedValueOnce(value);
      expect((await publicPaidCourseOutlineRoutes.request("/DOG_TRAINING")).status).toBe(404);
    }
    expect(outline).not.toHaveBeenCalled();
  });
  it("rejects invalid ID and duplicate day rows without returning unsafe partial content", async () => {
    expect((await publicPaidCourseOutlineRoutes.request("/unsafe.dot")).status).toBe(400);
    expect(metadata).not.toHaveBeenCalled();
    outline.mockResolvedValueOnce([{ id: "../bad", title: "Private", order: 0, ...dayFields }]);
    const bad = await publicPaidCourseOutlineRoutes.request("/DOG_TRAINING");
    expect(bad.status).toBe(500);
    expect(await bad.text()).not.toContain("Private");
    outline.mockResolvedValueOnce([
      { id: "same", title: "D1", order: 0, ...dayFields },
      { id: "same", title: "D2", order: 1, ...dayFields },
    ]);
    expect((await publicPaidCourseOutlineRoutes.request("/DOG_TRAINING")).status).toBe(500);
  });
  it("unexpected provider error is generic and never leaks stack, credentials or user info", async () => {
    metadata.mockRejectedValueOnce(Error("PRIVATE_DB_CREDENTIALS"));
    const response = await publicPaidCourseOutlineRoutes.request("/DOG_TRAINING");
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("PRIVATE_DB_CREDENTIALS");
  });
});
