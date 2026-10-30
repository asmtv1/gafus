import { afterEach, describe, expect, it, vi } from "vitest";
import { listCourses, setCourseFavorite } from "./courseApi";
const course = {
  id: "course_01",
  name: "Обучение",
  type: "obedience",
  shortDesc: "Курс",
  duration: "14 дней",
  isPaid: true,
  isPrivate: false,
  hasAccess: true,
  isFavorite: false,
  userStatus: "NOT_STARTED",
  trainingLevel: "BEGINNER",
};
const envelope = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), { status: 200 });
afterEach(() => vi.unstubAllGlobals());
describe("COURSE-010 owner DTO and favorite ACK", () => {
  it("C-A01 opposite boolean ACK never confirms explicit favorite add or remove", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(envelope({ isFavorite: false }))
      .mockResolvedValueOnce(envelope({ isFavorite: true }));
    vi.stubGlobal("fetch", fetcher);
    await expect(setCourseFavorite("course_01", true)).rejects.toThrow("не подтвердил");
    await expect(setCourseFavorite("course_01", false)).rejects.toThrow("не подтвердил");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("C-A02 duplicate IDs fail closed before caching the owner course list", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          envelope([course, { ...course, name: "Other course, same identifier" }]),
        ),
    );
    await expect(listCourses()).rejects.toThrow("некорректный список");
  });
  it.each(["../secrets", "training/new", "", "bad type", "A".repeat(129)])(
    "C-A03 rejects unsafe training course type %s before deep-link render",
    async (type) => {
      const fetcher = vi.fn().mockResolvedValue(envelope([{ ...course, type }]));
      vi.stubGlobal("fetch", fetcher);
      await expect(listCourses()).rejects.toThrow("некорректный список");
    },
  );
  it.each(["PRIVATE_SQL_STACK", "", "IN PROGRESS", "SUPERADMIN", null])(
    "C-A04 refuses non-enum userStatus %s",
    async (userStatus) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(envelope([{ ...course, userStatus }])));
      await expect(listCourses()).rejects.toThrow("некорректный список");
    },
  );
  it("C-A05 accepts each existing shared TrainingStatus enum value", async () => {
    const known = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "PAUSED", "RESET"];
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          envelope(
            known.map((userStatus, index) => ({ ...course, id: `course_${index}`, userStatus })),
          ),
        ),
    );
    const data = await listCourses();
    expect(data.map((item) => item.userStatus)).toEqual(known);
  });
});
