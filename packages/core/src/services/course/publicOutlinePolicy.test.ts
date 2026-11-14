import { describe, expect, it } from "vitest";
import { isPublicPaidCourse, projectPublicPaidCourseOutline } from "./publicOutlinePolicy";

const metadata = {
  id: "course-1", name: "Публичный курс", description: "Описание", shortDesc: "Кратко",
  equipment: "Поводок", trainingLevel: "BEGINNER", isPrivate: false, isPaid: true,
  ownerId: "PRIVATE_OWNER_ID", videoUrl: "PRIVATE_SIGNED_VIDEO_URL",
};
const day = { id: "day-1", title: "Первый день", order: 0, type: "REGULAR",
  equipment: "", estimatedDuration: 12, theoryMinutes: 2,
  privateTrainingStep: "PRIVATE_STEP", privateOwnerId: "OWNER_ID" };

describe("Core pure public paid-course outline and owner isolation", () => {
  it("denies missing, private and free courses before days are requested", () => {
    expect(isPublicPaidCourse(null)).toBe(false);
    expect(isPublicPaidCourse(undefined)).toBe(false);
    expect(isPublicPaidCourse({ ...metadata, isPrivate: true })).toBe(false);
    expect(isPublicPaidCourse({ ...metadata, isPaid: false })).toBe(false);
    expect(isPublicPaidCourse(metadata)).toBe(true);
  });
  it("projects only whitelisted marketing fields", () => {
    const result = projectPublicPaidCourseOutline("DOG", metadata, [day]);
    expect(result).toEqual({ courseId: "course-1", courseType: "DOG",
      name: "Публичный курс", description: "Описание", equipment: "Поводок",
      trainingLevel: "BEGINNER", outline: [{ id: "day-1", title: "Первый день",
        order: 0, type: "REGULAR", equipment: "", estimatedDuration: 12, theoryMinutes: 2 }],
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|privateTrainingStep|ownerId|videoUrl/);
  });
  it("denies invalid and duplicate day identities instead of partial output", () => {
    expect(() => projectPublicPaidCourseOutline("DOG", metadata, [day, day]))
      .toThrow("DUPLICATE_OUTLINE_DAY");
    expect(() => projectPublicPaidCourseOutline("DOG", metadata, [{ ...day, id: "../private" }]))
      .toThrow("INVALID_COURSE_OUTLINE");
    expect(() => projectPublicPaidCourseOutline("DOG", metadata, [{ ...day, order: -1 }]))
      .toThrow("INVALID_COURSE_OUTLINE");
  });
});
