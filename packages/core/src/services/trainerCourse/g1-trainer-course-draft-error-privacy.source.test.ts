/**
 * Actual CURRENT Core source redaction, not stale compiled dist.
 * Injected Prisma and captured logger: no real database, mail or network.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  find: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(),
  write: vi.fn(), logError: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    course: {
      findUnique: m.find, create: m.create, update: m.update, delete: m.remove,
    },
    $transaction: m.write,
  },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    error: m.logError, warn: vi.fn(), info: vi.fn(), success: vi.fn(),
  }),
}));
vi.mock("@gafus/core/errors", () => ({ handlePrismaError: vi.fn() }));
vi.mock("../training/trainingDayContent", () => ({
  invalidateCourseContentCache: vi.fn(),
}));
vi.mock("../training/trainingContentRevision", () => ({
  publishCourseContentChange: vi.fn(),
}));
import { getCourseDraftWithRelations } from "./trainerCourseService";

const secret = "PRIVATE_COURSE_DB_RECEIPT_STUDENT_EMAIL_AND_TOKEN";
beforeEach(() => vi.resetAllMocks());
describe("TR012 real Core source read exception redaction", () => {
  it("masks thrown Prisma message/stack/actor, preserves null→HTTP404 contract", async () => {
    const failure = new Error(secret);
    failure.stack = "Error: " + secret + "\n    at user@private.example";
    m.find.mockRejectedValueOnce(failure);
    expect(await getCourseDraftWithRelations("course_A", "trainer_A", {
      allowAdmin: false,
    })).toBeNull();
    expect(m.logError).toHaveBeenCalledExactlyOnceWith(
      "TRAINER_COURSE_DRAFT_READ_FAILED",
    );
    const captured = JSON.stringify(m.logError.mock.calls);
    expect(captured).not.toContain(secret);
    expect(captured).not.toContain("trainer_A");
    expect(captured).not.toContain("course_A");
    expect(captured).not.toContain("private.example");
    expect(captured).not.toContain("stack");
    expect(m.create).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.write).not.toHaveBeenCalled();
  });
  it("missing row stays null without error log or writes", async () => {
    m.find.mockResolvedValueOnce(null);
    expect(await getCourseDraftWithRelations("missing", "trainer_A")).toBeNull();
    expect(m.logError).not.toHaveBeenCalled();
    expect(m.write).not.toHaveBeenCalled();
  });
});
