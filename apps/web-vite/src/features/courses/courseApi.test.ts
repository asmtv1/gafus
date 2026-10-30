import { afterEach, describe, expect, it, vi } from "vitest";
import { listCourses, setCourseFavorite } from "./courseApi";

const sampleCourse = {
  id: "course-1",
  name: "Основа послушания",
  type: "obedience",
  shortDesc: "Постепенно учимся фокусироваться",
  duration: "14 дней",
  isPaid: true,
  isPrivate: false,
  hasAccess: false,
  isFavorite: true,
  userStatus: "NOT_STARTED",
  trainingLevel: "BEGINNER",
};

afterEach(() => vi.unstubAllGlobals());

describe("Hono /courses API contract consumer", () => {
  it("rejects a path-breaking identifier before any card tries to link it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: [{ ...sampleCourse, id: "../secret" }],
    }), { status: 200 })));
    await expect(listCourses()).rejects.toThrow("некорректный список");
  });

  it("retains numeric Core rating from authorized catalog only",async()=>{
    const fetcher=vi.fn().mockImplementation((_path:string)=>Promise.resolve(new Response(
      JSON.stringify({success:true,data:[{
        ...sampleCourse,isPaid:false,isFavorite:false,hasAccess:true,
        avgRating:4.25,
      }]}),{status:200},
    )));
    vi.stubGlobal("fetch",fetcher);
    expect((await listCourses())[0].avgRating).toBe(4.25);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/courses");
  });
  it("refuses a non-finite or out-of-range authenticated rating",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success:true,data:[{...sampleCourse,avgRating:6}],
    }),{status:200})));
    await expect(listCourses()).rejects.toThrow("некорректный список");
  });
  it("shows source Next dates and participants only from authenticated Core fields", async () => {
    const startedAt = "2026-10-24T10:00:00.000Z";
    const completedAt = "2026-10-26T10:00:00.000Z";
    const backend = { ...sampleCourse, startedAt, completedAt, startedUsersCount: 21,
      isFavorite: false, isPaid: false, hasAccess: true };
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      success: true, data: [backend],
    }), { status: 200 })));
    const [owner] = await listCourses();
    expect(owner).toMatchObject({ startedAt, completedAt, startedUsersCount: 21 });

  });

  it("rejects forged authenticated course dates and participant count", async () => {
    const bad = [{ ...sampleCourse, startedAt: "invalid-date" },
      { ...sampleCourse, startedUsersCount: -1 }];
    for (const row of bad) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
        success: true, data: [row],
      }), { status: 200 })));
      await expect(listCourses()).rejects.toThrow("некорректный список");
    }
  });

  it("reads real Hono-shaped data with cookie transport, no bearer token", async () => {
    const mocked = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [sampleCourse] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mocked);
    expect(await listCourses()).toEqual([sampleCourse]);
    expect(mocked.mock.calls[0][0]).toBe("/api/v1/courses");
    expect(mocked.mock.calls[0][1]).toMatchObject({
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    expect(mocked.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("uses existing Core timestamps for original Next newest-first without leaking extra fields", async () => {
    const fixture = [
      { ...sampleCourse, id: "old", createdAt: "2026-01-01T08:00:00.000Z" },
      { ...sampleCourse, id: "new", createdAt: "2026-10-26T07:00:00.000Z" },
      { ...sampleCourse, id: "middle", createdAt: "2026-06-01T12:00:00.000Z" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: fixture,
    }), { status: 200 })));
    const rows = await listCourses();
    expect(rows.map(course => course.id)).toEqual(["new", "middle", "old"]);
    expect(rows.every(course => !("createdAt" in course))).toBe(true);
  });
  it("keeps server order if Core dates are incomplete instead of inventing missing timestamps", async () => {
    const fixture = [
      { ...sampleCourse, id: "old", createdAt: "2026-01-01T08:00:00.000Z" },
      { ...sampleCourse, id: "missing" },
      { ...sampleCourse, id: "invalid", createdAt: "not-a-date" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: fixture,
    }), { status: 200 })));
    expect((await listCourses()).map(course => course.id)).toEqual(["old", "missing", "invalid"]);
  });
  it("refuses invalid JSON envelopes before rendering private data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [
        { ...sampleCourse, hasAccess: "true" },
      ] }), { status: 200 }),
    ));
    await expect(listCourses()).rejects.toThrow("некорректный список");
  });

  it("preserves 401 as a failed authorized request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401 }),
    ));
    await expect(listCourses()).rejects.toMatchObject({ status: 401 });
  });

  it("catalog calls the authorized endpoint only", async () => {
    const mocked = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mocked);
    expect(await listCourses()).toEqual([]);
    expect(mocked.mock.calls[0][0]).toBe("/api/v1/courses");
    expect(mocked.mock.calls[0][1]?.credentials).toBe("include");
  });

  it("projects allowlisted course images without retaining signed/private URLs", async () => {
    const good = "https://storage.yandexcloud.net/gafus-media/uploads/courses/dog.webp";
    const legacy = "https://storage.yandexcloud.net/gafus-media/uploads/trainers/owner/courses/0478ee02-df96-4f9d-8e30-e050e002faf5/0478ee02-df96-4f9d-8e30-e050e002faf5.blob";
    const signed = good + "?X-Amz-Signature=private";
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      success: true, data: [
        { ...sampleCourse, logoImg: good },
        { ...sampleCourse, id:"course-2",logoImg:signed },
        { ...sampleCourse, id:"course-3",logoImg:legacy },
      ],
    }), { status: 200 })));
    const rows = await listCourses();
    expect(rows[0].logoImg).toBe(good);
    expect(rows[1].logoImg).toBeUndefined();
    expect(rows[2].logoImg).toBe(legacy);
    expect(JSON.stringify(rows)).not.toContain("X-Amz-Signature");
  });

  it("sends explicit, idempotent favorite add/remove through cookie auth", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true, data: { isFavorite: true },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true, data: { isFavorite: false },
      }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    expect(await setCourseFavorite("course-1", true)).toBe(true);
    expect(await setCourseFavorite("course-1", false)).toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
    for (const call of request.mock.calls) {
      expect(call[0]).toBe("/api/v1/courses/favorites");
      expect(call[1]).toMatchObject({
        method: "POST", credentials: "include", cache: "no-store",
      });
    }
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      courseId: "course-1", action: "add",
    });
    expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({
      courseId: "course-1", action: "remove",
    });
  });

  it("rejects suspicious identifiers and invalid favorite acknowledgements", async () => {
    const mocked = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { isFavorite: "yes" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", mocked);
    await expect(setCourseFavorite("../secret", true)).rejects.toThrow("идентификатор");
    expect(mocked).not.toHaveBeenCalled();
    await expect(setCourseFavorite("valid-course", true)).rejects.toThrow("избранное");
  });

  it("keeps only the verified owner catalog projection in memory", async () => {
    const serverRow = {
      ...sampleCourse,
      description: "FULL_INTERNAL_COURSE_DESCRIPTION",
      favoritedBy: [{ userId: "OTHER_USER_SECRET" }],
      dayLinks: [{ day: { title: "PAID_UNLISTED_LESSON" } }],
      userCourses: [{ userId: "ANOTHER_MEMBER" }],
      reviews: [{ user: { email: "hidden@example.test" } }],
      signedUrl: "PRIVATE_SIGNED_CDN_URL",
    };
    const mock = vi.fn(async () =>
      new Response(JSON.stringify({success:true,data:[serverRow]}), {status:200}));
    vi.stubGlobal("fetch", mock);
    const rows = await listCourses();
    expect(rows).toEqual([sampleCourse]);
    const inMemory = JSON.stringify(rows);
    for (const secret of [
      "OTHER_USER_SECRET", "ANOTHER_MEMBER", "hidden@example.test",
      "PAID_UNLISTED_LESSON", "PRIVATE_SIGNED_CDN_URL",
    ]) expect(inMemory).not.toContain(secret);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("does not treat failure or malformed favorites ACK as successful mutation", async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: false, error: "Недостаточно прав",
      }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true, data: { isFavorite: 1 },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true, data: { isFavorite: true },
      }), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    await expect(setCourseFavorite("course-1", true))
      .rejects.toMatchObject({ status: 403 });
    await expect(setCourseFavorite("course-1", true))
      .rejects.toThrow("избранное");
    expect(await setCourseFavorite("course-1", true)).toBe(true);
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it("accepts legitimate empty catalog", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }),
    ));
    expect(await listCourses()).toEqual([]);
  });
});
