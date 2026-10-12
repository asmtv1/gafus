import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import {
  GafusError, getGafusStatus, listGafusTransactions, unlockContentWithGafus, listGafusMiniGuides,
  getGafusPostReactionProgress,
  getAuthorizedMiniGuideContent,
} from "@gafus/core/services/gafus";
import {
  getGafusAdminDashboard, updateGafusSettingsAdmin, adjustGafusBalanceAdmin,
} from "@gafus/core/services/adminGafus";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

const unlockSchema = z.object({
  clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  target: z.discriminatedUnion("type", [
    z.object({ type: z.literal("COURSE_STEP"),
      dayOnCourseId: z.string().min(1).max(128),
      stepOnDayId: z.string().min(1).max(128) }).strict(),
    z.object({ type: z.literal("MINI_GUIDE"),
      courseId: z.string().min(1).max(128) }).strict(),
  ]),
}).strict();
const patchSchema = z.object({
  economyEnabled: z.boolean().optional(),
  earningEnabled: z.boolean().optional(),
  spendingEnabled: z.boolean().optional(),
  postReward: z.number().int().min(0).max(100).optional(),
  questionReward: z.number().int().min(0).max(100).optional(),
  answerReward: z.number().int().min(0).max(100).optional(),
  activityLimit: z.number().int().min(0).max(100).optional(),
  activityWindowSeconds: z.number().int().min(1).max(30 * 86400).optional(),
  reactionThreshold: z.number().int().min(1).max(1_000_000).optional(),
  reactionReward: z.number().int().min(0).max(100).optional(),
  bestAnswerReward: z.number().int().min(0).max(100).optional(),
  courseStepCost: z.number().int().min(1).max(100).optional(),
  miniGuideCost: z.number().int().min(1).max(100).optional(),
  accessDurationSeconds: z.number().int().min(1).max(90 * 86400).optional(),
}).strict();

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ success: false, code, error }, { status, headers });
}

function mapError(error: unknown) {
  if (error instanceof z.ZodError) return fail(400, "GAFUS_VALIDATION_ERROR", "Некорректные данные");
  if (error instanceof GafusError) {
    const status = error.code === "GAFUS_DISABLED" ? 503
      : error.code === "GAFUS_INSUFFICIENT_BALANCE" || error.code === "GAFUS_IDEMPOTENCY_CONFLICT" ? 409 : 403;
    return fail(status, error.code, error.message);
  }
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return fail(403, "FORBIDDEN", "Недостаточно прав");
  }
  if (error instanceof Error && /^(SETTINGS_REVISION_CONFLICT|REQUEST_CONFLICT)/.test(error.message)) {
    return fail(409, "GAFUS_CONFLICT", "Конфликт версии или запроса");
  }
  return fail(500, "GAFUS_INTERNAL_ERROR", "Не удалось выполнить операцию");
}

async function handle(request: NextRequest): Promise<NextResponse> {
  let session;
  try {
    session = await getServerSession(authOptions);
  } catch {
    return fail(503, "AUTH_UNAVAILABLE", "Не удалось проверить авторизацию");
  }
  const userId = session?.user?.id;
  if (!userId) return fail(401, "UNAUTHORIZED", "Не авторизован");
  const suffix = request.nextUrl.pathname.slice("/api/v1/gafus".length);
  const path = suffix.split("/").filter(Boolean);
  try {
    if (request.method === "GET" && path[0] === "status" && path.length === 1) {
      return NextResponse.json({ success: true, data: await getGafusStatus(userId) }, { headers });
    }
    if (request.method === "GET" && path[0] === "history" && path.length === 1) {
      const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
      const limit = Number(request.nextUrl.searchParams.get("limit") ?? "20");
      z.object({ cursor: z.string().min(1).max(128).optional(),
        limit: z.number().int().min(1).max(100) }).parse({ cursor, limit });
      const page = await listGafusTransactions({ userId, cursor, limit });
      return NextResponse.json({ success: true, data: {
        items: page.items.map(x => ({
          id: x.id, kind: x.kind, delta: x.delta, balanceAfter: x.balanceAfter,
          createdAt: x.createdAt.toISOString(), rewardKind: x.rewardKind,
          sourceEntityType: x.sourceEntityType, sourceEntityId: x.sourceEntityId,
          targetKey: x.targetKey,
        })),
        nextCursor: page.nextCursor,
      } }, { headers });
    }
    if (request.method === "GET" && path[0] === "reaction-progress" && path.length === 2) {
      const postId = z.string().min(1).max(128).parse(path[1]);
      const data = await getGafusPostReactionProgress(userId, postId);
      return data
        ? NextResponse.json({ success: true, data }, { headers })
        : fail(404, "GAFUS_NOT_FOUND", "Прогресс недоступен");
    }
    if (request.method === "GET" && path.join("/") === "mini-guides") {
      return NextResponse.json({ success: true, data: await listGafusMiniGuides(userId) }, { headers });
    }
    if (request.method === "GET" && path[0] === "mini-guide" && path.length === 2) {
      const courseId = z.string().min(1).max(128).parse(path[1]);
      const guideContent = await getAuthorizedMiniGuideContent({ userId, courseId });
      if (!guideContent) return fail(403, "GAFUS_ACCESS_REQUIRED", "Для доступа к мини-гайду нужен Гафус или подписка");
      return NextResponse.json({ success: true, data: { courseId, guideContent } }, { headers });
    }
    if (request.method === "POST" && path[0] === "unlock" && path.length === 1) {
      const body = unlockSchema.parse(await request.json());
      const result = await unlockContentWithGafus({
        userId, target: body.target, clientRequestId: body.clientRequestId,
      });
      return NextResponse.json({ success: true, data: result }, { headers });
    }
    if (request.method === "GET" && path.join("/") === "admin/dashboard") {
      return NextResponse.json({ success: true, data: await getGafusAdminDashboard(userId) }, { headers });
    }
    if (request.method === "PATCH" && path.join("/") === "admin/settings") {
      const body = z.object({
        patch: patchSchema, expectedRevision: z.number().int().min(1),
        reason: z.string().trim().min(5).max(1000),
      }).strict().parse(await request.json());
      return NextResponse.json({ success: true, data: await updateGafusSettingsAdmin({
        actorId: userId, ...body,
      }) }, { headers });
    }
    if (request.method === "POST" && path.join("/") === "admin/adjust") {
      const body = z.object({
        userId: z.string().min(1).max(128),
        delta: z.number().int().min(-10000).max(10000).refine(x => x !== 0),
        requestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
        reason: z.string().trim().min(5).max(1000),
      }).strict().parse(await request.json());
      return NextResponse.json({ success: true, data: await adjustGafusBalanceAdmin({
        actorId: userId, ...body,
      }) }, { headers });
    }
    return fail(404, "GAFUS_NOT_FOUND", "Маршрут не найден");
  } catch (error) {
    return mapError(error);
  }
}

export const GET = handle;
export const POST = withCSRFProtection(handle);
export const PATCH = withCSRFProtection(handle);
