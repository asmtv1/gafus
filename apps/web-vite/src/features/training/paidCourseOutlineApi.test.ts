import { afterEach, describe, expect, it, vi } from "vitest";
import { getPaidCourseOutline, projectPaidCourseOutline } from "./paidCourseOutlineApi";

const raw = (override: Record<string, unknown> = {}) => ({
  courseId: "course_1", courseType: "DOG_TRAINING", name: "Платный курс",
  description: "Курс для воспитания", equipment: "Поводок", trainingLevel: "BEGINNER",
  outline: [{ id: "clwdayoc0000000000000001", title: "День 1", order: 1 }],
  userId: "PRIVATE_USERNAME", videoUrl: "SECRET_VIDEO", ...override,
});
const reply = (data: unknown) => new Response(
  JSON.stringify({ success: true, data }), { status: 200 },
);
afterEach(() => vi.unstubAllGlobals());

describe("public paid outline isolated API consumer", () => {
  it("uses only public GET without cookie or private HTTP and drops extra fields", async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(raw()));
    vi.stubGlobal("fetch", fetcher);
    const projected = await getPaidCourseOutline("DOG_TRAINING");
    expect(projected.outline).toEqual([{ id: "clwdayoc0000000000000001",
      title: "День 1", order: 1 }]);
    expect(JSON.stringify(projected)).not.toMatch(/PRIVATE_|SECRET_/);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/public/paid-course-outline/DOG_TRAINING",
      expect.objectContaining({ method: "GET", credentials: "omit", cache: "no-store" }),
    );
    expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty("X-Gafus-Auth-Transport");
  });
  it("invalid course type fails before HTTP request", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(getPaidCourseOutline("../private")).rejects.toThrow("INVALID_PAID_COURSE_TYPE");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects mismatched type, duplicate day IDs, malformed title and too-large lists", () => {
    for (const data of [
      raw({ courseType: "PRIVATE" }),
      raw({ outline: [
        { id: "same", title: "One", order: 1 },
        { id: "same", title: "Two", order: 2 },
      ] }),
      raw({ outline: [{ id: "bad", title: "", order: 0 }] }),
      raw({ outline: Array.from({ length: 501 }, (_, i) => ({
        id: "day_" + i, title: "Day " + i, order: i,
      })) }),
      raw({ description: { secret: "PRIVATE" } }),
    ]) expect(() => projectPaidCourseOutline(data, "DOG_TRAINING")).toThrow();
  });
});
