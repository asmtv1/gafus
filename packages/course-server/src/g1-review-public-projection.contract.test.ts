/** AG1-COURSE030: actual Core GET reviews projection, injected Prisma rows only. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ course: vi.fn(), userCourse: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    course: { findUnique: m.course },
    userCourse: { findUnique: m.userCourse },
  },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));
import { getCourseReviews } from "./reviewService";

const PRIVATE = "PRIVATE_REVIEW_OWNER_SUBSCRIPTION_MEDICAL_20261021";
const CREATED = new Date("2026-10-19T11:00:00.000Z");
const review = (id: string, userId: string) => ({
  id, rating: 5, comment: "Полезный курс", createdAt: CREATED,
  updatedAt: CREATED, userId, courseId: "course1", moderationReason: PRIVATE,
  accessReceipt: PRIVATE, medicalNotes: PRIVATE,
  user: {
    id: userId, username: "author_" + userId,
    email: PRIVATE, phone: PRIVATE, entitlements: PRIVATE,
    profile: { avatarUrl: null, fullName: PRIVATE, medicalNotes: PRIVATE },
  },
});
const course = () => ({
  id: "course1", name: "Открытый курс",
  reviews: [review("reviewA", "actor-A"), review("reviewB", "actor-B")],
});
beforeEach(() => {
  vi.resetAllMocks();
  m.course.mockResolvedValue(course());
  m.userCourse.mockResolvedValue({ status: "COMPLETED" });
});
describe("AG1-COURSE030 GET reviews exact public author and owner projection", () => {
  it("actor A sees same public reviews, its own review and completion, without private ORM fields", async () => {
    const actual = await getCourseReviews("general", "actor-A");
    expect(actual).toMatchObject({
      courseName: "Открытый курс",
      userStatus: { hasCompleted: true, userReview: { id: "reviewA" } },
    });
    expect(actual?.reviews).toHaveLength(2);
    expect(Object.keys(actual!.reviews[0]!).sort()).toEqual([
      "comment", "createdAt", "id", "rating", "user",
    ]);
    expect(Object.keys(actual!.reviews[0]!.user).sort()).toEqual([
      "id", "profile", "username",
    ]);
    expect(Object.keys(actual!.reviews[0]!.user.profile!)).toEqual(["avatarUrl"]);
    expect(JSON.stringify(actual)).not.toContain(PRIVATE);
    expect(actual?.userStatus.userReview).toEqual(actual?.reviews[0]);
    expect(m.course).toHaveBeenCalledWith(expect.objectContaining({
      where: { type: "general" },
      select: expect.objectContaining({
        reviews: expect.objectContaining({
          orderBy: { createdAt: "desc" },
          select: {
            id: true, rating: true, comment: true, createdAt: true,
            user: { select: {
              id: true, username: true, profile: { select: { avatarUrl: true } },
            } },
          },
        }),
      }),
    }));
    expect(m.userCourse).toHaveBeenCalledExactlyOnceWith({
      where: { userId_courseId: { userId: "actor-A", courseId: "course1" } },
      select: { status: true },
    });
  });
  it("actor B gets its own review only in userStatus, without A's entitlement", async () => {
    m.userCourse.mockResolvedValueOnce({ status: "IN_PROGRESS" });
    const actual = await getCourseReviews("general", "actor-B");
    expect(actual?.userStatus.hasCompleted).toBe(false);
    expect(actual?.userStatus.userReview?.id).toBe("reviewB");
    expect(actual?.reviews.map((r) => r.id)).toEqual(["reviewA", "reviewB"]);
    expect(JSON.stringify(actual)).not.toContain(PRIVATE);
    expect(m.userCourse).toHaveBeenCalledExactlyOnceWith({
      where: { userId_courseId: { userId: "actor-B", courseId: "course1" } },
      select: { status: true },
    });
  });
  it("missing user has public reviews but no owner-completion query", async () => {
    const actual = await getCourseReviews("general");
    expect(actual?.userStatus).toEqual({ hasCompleted: false, userReview: null });
    expect(actual?.reviews).toHaveLength(2);
    expect(JSON.stringify(actual)).not.toContain(PRIVATE);
    expect(m.userCourse).not.toHaveBeenCalled();
  });
  it("empty course reviews retains successful empty DTO and userStatus", async () => {
    m.course.mockResolvedValueOnce({ id: "course1", name: "Пустой курс", reviews: [] });
    m.userCourse.mockResolvedValueOnce(null);
    const actual = await getCourseReviews("empty", "actor-A");
    expect(actual).toEqual({
      courseName: "Пустой курс",
      reviews: [],
      userStatus: { hasCompleted: false, userReview: null },
    });
  });
  it("unknown course returns null without user progress lookup", async () => {
    m.course.mockResolvedValueOnce(null);
    expect(await getCourseReviews("not-found", "actor-A")).toBeNull();
    expect(m.userCourse).not.toHaveBeenCalled();
  });
  it("DB exception propagates, never fabricated successful reviews", async () => {
    m.course.mockRejectedValueOnce(new Error(PRIVATE));
    await expect(getCourseReviews("broken", "actor-A")).rejects.toThrow(PRIVATE);
    expect(m.userCourse).not.toHaveBeenCalled();
  });
});
