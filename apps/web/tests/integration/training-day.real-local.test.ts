/**
 * Opt-in real PostgreSQL+Redis integration contract for the Web route.
 * The ONLY mocked dependency is next-auth session (bypassing cookie issuance).
 * Run with COURSE_CACHE_HTTP_SMOKE=1 and the STRICT isolated local DB/Redis.
 * Default CI runs skip this file; no external or production data access.
 */
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { prisma as PrismaInstance } from "@gafus/prisma";
import type { connection as RedisInstance } from "@gafus/queues";
import type { GET as WebDayGet } from "../../src/app/api/v1/training/day/route";

const auth = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: auth.getServerSession }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));

const enabled = process.env.COURSE_CACHE_HTTP_SMOKE === "1";
const isolated = describe.skipIf(!enabled);

isolated("GET /api/v1/training/day with real local Prisma and Redis", () => {
  let prisma: typeof PrismaInstance;
  let connection: typeof RedisInstance;
  let GET: typeof WebDayGet;
  let alice: string;
  let bob: string;
  let withoutPersonalization: string;
  let firstCourseType: string;
  let firstLinkId: string;
  let paidType: string;
  let paidLink: string;
  let paidCourseId: string;
  let stepId: string;

  beforeAll(async () => {
    if (
      process.env.DATABASE_URL !==
        "postgresql://asmtv1@127.0.0.1:5432/gafus_course_cache_live_20261015" ||
      process.env.REDIS_URL !== "redis://127.0.0.1:6379/14" ||
      process.env.COURSE_CACHE_SYNC_ENABLED !== "true" ||
      process.env.ENABLE_COURSE_CACHE !== "true"
    ) {
      throw new Error("LIVE_WEB_ROUTE_REFUSED_NON_ISOLATED_LOCAL_DATABASE");
    }
    ({ prisma } = await import("@gafus/prisma"));
    ({ connection } = await import("@gafus/queues"));
    ({ GET } = await import("../../src/app/api/v1/training/day/route"));

    const id = randomUUID().slice(0, 8);
    const author = await prisma.user.create({
      data: { username: "wroute-trainer-" + id, password: "local-test-only", role: "TRAINER" },
    });
    const a = await prisma.user.create({
      data: { username: "wroute-alice-" + id, password: "local-test-only" },
    });
    const b = await prisma.user.create({
      data: { username: "wroute-bob-" + id, password: "local-test-only" },
    });
    const outsider = await prisma.user.create({
      data: { username: "wroute-new-" + id, password: "local-test-only" },
    });
    alice = a.id;
    bob = b.id;
    withoutPersonalization = outsider.id;
    const step = await prisma.step.create({
      data: {
        title: "Local web step",
        description: "Web до {{userName}}",
        type: "BREAK",
        authorId: author.id,
      },
    });
    stepId = step.id;
    const day = await prisma.trainingDay.create({
      data: {
        title: "Локальный веб-день {{userName}}",
        authorId: author.id,
        stepLinks: { create: { stepId: step.id, order: 0 } },
      },
    });
    const course = await prisma.course.create({
      data: {
        name: "Web local",
        type: "wroute-public-" + id,
        duration: "5",
        logoImg: "",
        authorId: author.id,
        trainingLevel: "BEGINNER",
        isPersonalized: true,
        dayLinks: { create: { dayId: day.id, order: 0 } },
      },
      include: { dayLinks: true },
    });
    firstCourseType = course.type;
    firstLinkId = course.dayLinks[0].id;
    await prisma.userCourse.createMany({
      data: [
        { userId: alice, courseId: course.id, userDisplayName: "Алиса", userGender: "female" },
        { userId: bob, courseId: course.id, userDisplayName: "Борис", userGender: "male" },
      ],
    });
    const paid = await prisma.course.create({
      data: {
        name: "Web protected",
        type: "wroute-paid-" + id,
        duration: "5",
        logoImg: "",
        authorId: author.id,
        trainingLevel: "BEGINNER",
        isPrivate: true,
        isPaid: true,
        dayLinks: { create: { dayId: day.id, order: 0 } },
      },
      include: { dayLinks: true },
    });
    paidType = paid.type;
    paidLink = paid.dayLinks[0].id;
    paidCourseId = paid.id;
  }, 20000);

  function request(courseType = firstCourseType, dayId = firstLinkId) {
    return new NextRequest(
      "http://127.0.0.1:32021/api/v1/training/day?" +
        new URLSearchParams({ courseType, dayOnCourseId: dayId }),
    );
  }

  it("returns 401 without Web session", async () => {
    auth.getServerSession.mockResolvedValueOnce(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
  });

  it("returns personalized content separately for Alice and Bob, with hot cache", async () => {
    auth.getServerSession.mockResolvedValueOnce({ user: { id: alice } });
    const a = await GET(request());
    expect(a.status).toBe(200);
    const aData = await a.json();
    expect(aData.data.title).toBe("Локальный веб-день Алиса");
    auth.getServerSession.mockResolvedValueOnce({ user: { id: bob } });
    const b = await GET(request());
    expect(b.status).toBe(200);
    const bData = await b.json();
    expect(bData.data.title).toBe("Локальный веб-день Борис");
  });

  it("requires fresh personalization even when other users already warmed the shared cache", async () => {
    auth.getServerSession.mockResolvedValueOnce({ user: { id: withoutPersonalization } });
    const response = await GET(request());
    expect(response.status).toBe(428);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "PERSONALIZATION_REQUIRED",
    });
  });

  it("enforces paid private access and revocation with warmed content", async () => {
    auth.getServerSession.mockResolvedValueOnce({ user: { id: alice } });
    expect((await GET(request(paidType, paidLink))).status).toBe(403);
    await prisma.courseAccess.create({ data: { userId: alice, courseId: paidCourseId } });
    auth.getServerSession.mockResolvedValueOnce({ user: { id: alice } });
    expect((await GET(request(paidType, paidLink))).status).toBe(200);
    await prisma.courseAccess.delete({
      where: { courseId_userId: { courseId: paidCourseId, userId: alice } },
    });
    auth.getServerSession.mockResolvedValueOnce({ user: { id: alice } });
    expect((await GET(request(paidType, paidLink))).status).toBe(403);
  });

  it("invalidates real Web route response immediately on PostgreSQL commit without Redis INCR", async () => {
    auth.getServerSession.mockResolvedValueOnce({ user: { id: alice } });
    const before = await GET(request());
    expect(before.status).toBe(200);
    const oldText = (await before.json()).data.steps[0].description;
    expect(oldText).toBe("Web до Алиса");

    const redisBefore = await connection.get("gafus:training-content:revision:v1");
    await prisma.step.update({
      where: { id: stepId },
      data: { description: "Web после {{userName}}" },
    });
    expect(await connection.get("gafus:training-content:revision:v1")).toBe(redisBefore);

    auth.getServerSession.mockResolvedValueOnce({ user: { id: alice } });
    const after = await GET(request());
    expect(after.status).toBe(200);
    expect((await after.json()).data.steps[0].description).toBe("Web после Алиса");
  });

  it("validates day CUID before consulting the database", async () => {
    auth.getServerSession.mockResolvedValueOnce({ user: { id: alice } });
    const response = await GET(request(firstCourseType, "invalid"));
    expect(response.status).toBe(400);
  });
});
