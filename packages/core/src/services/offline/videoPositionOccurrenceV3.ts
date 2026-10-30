/** OFF021 v3 source-only proof: no app mount, no writes, no schema/client changes.
 * The occurrence links are database identity, not Step.id or Course.id.
 */
import { createHash } from "node:crypto";
import type { Prisma } from "@gafus/prisma";
import {
  resolveCourseStepTargetTx,
  resolveCourseStepAccessTx,
} from "../contentAccess";
import { extractVideoIdFromCdnUrl } from "@gafus/cdn-upload";
import { z } from "zod";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const utc = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const recordedAtSchema = z.string().superRefine((value, ctx) => {
  const ts = Date.parse(value);
  if (
    !utc.test(value) ||
    !Number.isFinite(ts) ||
    new Date(ts).toISOString().slice(0, 19) !== value.slice(0, 19)
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "recordedAt must be a real UTC instant" });
  }
});
const base = z.object({
  eventId: z.string().regex(uuid),
  operation: z.literal("video.position"),
  videoId: z.string().min(1).max(128),
  positionSec: z.number().finite().int().min(0).max(2073600),
  recordedAt: recordedAtSchema,
  expectedRevision: z.number().finite().int().min(0).safe(),
});
export const videoPositionOccurrenceV3Schema = z.discriminatedUnion("scope", [
  base
    .extend({
      scope: z.literal("COURSE_STEP"),
      dayOnCourseId: z.string().cuid(),
      stepOnDayId: z.string().cuid(),
    })
    .strict(),
  base
    .extend({
      scope: z.literal("DAILY_COURSE"),
      scheduleId: z.string().cuid(),
      bundleStepId: z.string().cuid(),
    })
    .strict(),
]);
export type VideoOccurrenceV3 = z.infer<typeof videoPositionOccurrenceV3Schema>;
export type Decision = "ALLOWED" | "DENIED" | "NOT_FOUND";
export const MAX_REVISION = BigInt(Number.MAX_SAFE_INTEGER);
export const MAX_FUTURE_SKEW_MS = 5 * 60_000; // AG4 proposal (not released)

export function canonicalOccurrenceV3(ownerId: string, raw: unknown) {
  if (!ownerId || ownerId.length > 128) throw Error("INVALID_AUTHENTICATED_PRINCIPAL");
  const v = videoPositionOccurrenceV3Schema.parse(raw);
  const occurrence =
    v.scope === "COURSE_STEP"
      ? { scope: v.scope, dayOnCourseId: v.dayOnCourseId, stepOnDayId: v.stepOnDayId }
      : { scope: v.scope, scheduleId: v.scheduleId, bundleStepId: v.bundleStepId };
  const resourceKey =
    v.scope === "COURSE_STEP"
      ? `video:course:${v.dayOnCourseId}:${v.stepOnDayId}:${v.videoId}`
      : `video:daily:${v.scheduleId}:${v.bundleStepId}:${v.videoId}`;
  if (resourceKey.length > 256) throw Error("RESOURCE_KEY_TOO_LONG");
  const recordedAt = new Date(v.recordedAt).toISOString();
  const canonical = {
    ownerId,
    method: "POST",
    operation: v.operation,
    videoId: v.videoId,
    occurrence,
    positionSec: v.positionSec,
    recordedAt,
    expectedRevision: v.expectedRevision,
  };
  const payloadHash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  return { value: v, recordedAt, resourceKey, payloadHash, canonical };
}

/** Accept only a complete *exact* object key. A videoId substring or external URL
 * is NOT proof of the TrainerVideo -> Step.videoUrl association.
 */
export function stepContainsExactTrainerVideoUrl(
  stepVideoUrl: string | null | undefined,
  video: { id: string; relativePath: string },
): boolean {
  if (!stepVideoUrl || !video.relativePath) return false;
  try {
    const url = new URL(stepVideoUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.port
    )
      return false;
    const path = url.pathname.replace(/^\/+/, "");
    const key =
      url.hostname === "gafus-media.storage.yandexcloud.net"
        ? path
        : url.hostname === "storage.yandexcloud.net" && path.startsWith("gafus-media/")
          ? path.slice("gafus-media/".length)
          : null;
    if (!key || key !== video.relativePath.replace(/^\/+/, "")) return false;
    if (extractVideoIdFromCdnUrl(stepVideoUrl) !== video.id) return false;
    return key
      .split("/")
      .some(
        (segment, index, parts) =>
          segment === "videocourses" && parts[index + 1] === video.id && index + 2 < parts.length,
      );
  } catch {
    return false;
  }
}

/** Domain check runs inside SAME transaction as journal claim and video CAS.
 * Strict fail-closed on missing or foreign media and unrelated occurrences.
 */
export async function authorizeVideoOccurrenceV3(
  tx: Prisma.TransactionClient,
  ownerId: string,
  v: VideoOccurrenceV3,
  now = new Date(),
): Promise<Decision> {
  const video = await tx.trainerVideo.findUnique({
    where: { id: v.videoId },
    select: { id: true, relativePath: true },
  });
  if (!video) return "NOT_FOUND";
  if (v.scope === "COURSE_STEP") {
    const target = await resolveCourseStepTargetTx(tx, v.dayOnCourseId, v.stepOnDayId);
    if (!target || target.dayOnCourseId !== v.dayOnCourseId || target.stepOnDayId !== v.stepOnDayId)
      return "NOT_FOUND";
    const step = await tx.stepOnDay.findUnique({
      where: { id: v.stepOnDayId },
      select: { dayId: true, step: { select: { videoUrl: true } } },
    });
    const day = await tx.dayOnCourse.findUnique({
      where: { id: v.dayOnCourseId },
      select: { dayId: true },
    });
    if (
      !day ||
      !step ||
      step.dayId !== day.dayId ||
      !stepContainsExactTrainerVideoUrl(step.step.videoUrl, video)
    )
      return "NOT_FOUND";
    const access = await resolveCourseStepAccessTx(tx, ownerId, target, now);
    if (access.allowed) return "ALLOWED";
    // Retired rewarded-ad grants are never educational entitlements.
    // Only current Premium, a valid Gafus unlock, or free/assigned access
    // from the shared content policy can authorize an offline video update.
    return "DENIED";
  }
  // Moscow calendar day is the existing daily-course publication rule.
  const msk = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => msk.find((x) => x.type === type)?.value;
  const today = new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00.000Z`);
  if (!Number.isFinite(today.getTime())) throw Error("DAILY_CALENDAR_UNAVAILABLE");
  const schedule = await tx.dailyCourseSchedule.findFirst({
    where: { id: v.scheduleId, isPublished: true, date: { lte: today } },
    select: { bundleId: true },
  });
  if (!schedule) return "NOT_FOUND";
  const bundleStep = await tx.dailyCourseBundleStep.findUnique({
    where: { id: v.bundleStepId },
    select: { bundleId: true, step: { select: { videoUrl: true } } },
  });
  if (
    !bundleStep ||
    bundleStep.bundleId !== schedule.bundleId ||
    !stepContainsExactTrainerVideoUrl(bundleStep.step.videoUrl, video)
  )
    return "NOT_FOUND";
  return "ALLOWED";
}

export type CandidateRevision = {
  ownerId: string;
  resourceKey: string;
  revision: bigint;
  recordedAt: string | null;
  positionSec: number;
};
export type CandidateReceipt = {
  ownerId: string;
  eventId: string;
  resourceKey: string;
  payloadHash: string;
  ack: {
    eventId: string;
    serverRevision: string;
    positionSec: number;
    recordedAt: string;
    replayed: boolean;
  };
};
export type CandidateDecision =
  | { status: 200; state: CandidateRevision; receipt: CandidateReceipt; replayed: boolean }
  | { status: 400 | 403 | 404 | 409 | 503; reason: string };
/** No durable commit is claimed: this pure evaluator models transaction conditions. */
export function evaluateOccurrenceV3(input: {
  ownerId: string;
  request: unknown;
  now: Date;
  prior: CandidateRevision;
  storedReceipt?: CandidateReceipt;
  access: Decision;
}): CandidateDecision {
  let p: ReturnType<typeof canonicalOccurrenceV3>;
  try {
    p = canonicalOccurrenceV3(input.ownerId, input.request);
  } catch {
    return { status: 400, reason: "INVALID_VIDEO_DTO" };
  }
  if (input.access === "DENIED") return { status: 403, reason: "VIDEO_ACCESS_DENIED" };
  if (input.access === "NOT_FOUND") return { status: 404, reason: "VIDEO_NOT_FOUND" };
  if (input.prior.ownerId !== input.ownerId || input.prior.resourceKey !== p.resourceKey)
    return { status: 409, reason: "RESOURCE_IDENTITY_CONFLICT" };
  if (input.storedReceipt) {
    const row = input.storedReceipt;
    if (
      row.ownerId !== input.ownerId ||
      row.eventId !== p.value.eventId ||
      row.resourceKey !== p.resourceKey ||
      row.payloadHash !== p.payloadHash
    )
      return { status: 409, reason: "IDEMPOTENCY_KEY_CONFLICT" };
    return {
      status: 200,
      state: input.prior,
      receipt: { ...row, ack: { ...row.ack, replayed: true } },
      replayed: true,
    };
  }
  const now = input.now.getTime(),
    at = Date.parse(p.recordedAt);
  if (!Number.isFinite(now) || at > now + MAX_FUTURE_SKEW_MS)
    return { status: 400, reason: "FUTURE_VIDEO_TIMESTAMP" };
  if (
    input.prior.revision >= MAX_REVISION ||
    BigInt(p.value.expectedRevision) !== input.prior.revision ||
    (input.prior.recordedAt !== null && at <= Date.parse(input.prior.recordedAt))
  )
    return { status: 409, reason: "STALE_VIDEO_REVISION" };
  const revision = input.prior.revision + 1n;
  const state = {
    ownerId: input.ownerId,
    resourceKey: p.resourceKey,
    revision,
    recordedAt: p.recordedAt,
    positionSec: p.value.positionSec,
  };
  const receipt = {
    ownerId: input.ownerId,
    eventId: p.value.eventId,
    resourceKey: p.resourceKey,
    payloadHash: p.payloadHash,
    ack: {
      eventId: p.value.eventId,
      serverRevision: String(revision),
      positionSec: p.value.positionSec,
      recordedAt: p.recordedAt,
      replayed: false,
    },
  };
  return { status: 200, state, receipt, replayed: false };
}
