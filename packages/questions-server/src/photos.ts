import { prisma } from "@gafus/prisma";
import { randomUUID } from "node:crypto";
import {
  deleteFileFromCDN,
  parsePrivateMediaLocation,
} from "@gafus/cdn-upload";
import { questionActor, QuestionError } from "./service.js";
import { scheduleQuestionsV2Cleanup } from "@gafus/media-server/question-v2-cleanup";
/** Owner-scoped exact key for retired Questions uploads. Never delete an arbitrary URL,
 * CDN object, or somebody else's object from a malformed persisted row. */
export function validatedLegacyQuestionPhotoLocator(value: string, ownerId: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(ownerId)) throw Error("QUESTIONS_LEGACY_INVALID_OWNER");
  if (typeof value !== "string" || value.length < 1 || value.length > 512)
    throw Error("QUESTIONS_LEGACY_INVALID_LOCATOR");
  const privateValue = parsePrivateMediaLocation(value);
  const key = privateValue?.key ?? value;
  if (privateValue && privateValue.kind !== "questions") throw Error("QUESTIONS_LEGACY_FOREIGN_BUCKET");
  const prefix = privateValue
    ? "questions/uploads/questions/" + ownerId + "/"
    : key.startsWith("uploads/")
      ? "uploads/questions/" + ownerId + "/"
      : "questions/" + ownerId + "/";
  if (!key.startsWith(prefix) ||
    !/^[A-Za-z0-9_.-]{1,128}\.(?:jpg|jpeg|png|webp|gif)$/i.test(key.slice(prefix.length)) ||
    key.includes("../") || key.includes("/..") ||
    key.includes("\\") || key.includes("%") ||
    key.includes("?") || key.includes("#"))
    throw Error("QUESTIONS_LEGACY_UNSAFE_OBJECT");
  return value;
}

/** Only the actor may enqueue an already-detached photo. The photo deletion and
 * physical S3 removal intent must COMMIT or ROLLBACK in the SAME transaction. */
export async function deleteUnusedQuestionPhoto(userId: string, id: string) {
  await questionActor(userId);
  const photo = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR NO KEY UPDATE`;
    const row = await tx.questionPhoto.findFirst({
      where: { id, ownerId: userId, questionId: null, answerId: null },
    });
    if (!row) throw new QuestionError("PHOTO_FORBIDDEN", "Фото недоступно", 403);
    if (row.storagePath.startsWith("questions-v2:")) {
      await scheduleQuestionsV2Cleanup(tx,[id]);
      await tx.questionPhoto.delete({where:{id}});
    } else {
      // Old uploads are retired. Do NOT perform an irreversible remote DELETE
      // inside PostgreSQL transaction: commit a durable deletion intent instead.
      const locator = validatedLegacyQuestionPhotoLocator(
        parsePrivateMediaLocation(row.url) ? row.url : row.storagePath, userId,
      );
      await tx.questionLegacyPhotoDeletion.create({
        data: { id, ownerId: userId, locator },
      });
      await tx.questionPhoto.delete({ where: { id } });
    }
    return row;
  });
  return { id: photo.id };
}
export async function cleanupUnusedQuestionPhotos() {
  const photos = await prisma.questionPhoto.findMany({
    where: { questionId: null, answerId: null, createdAt: { lt: new Date(Date.now() - 86400000) } },
    take: 100,
  });
  for (const photo of photos) {
    try {
      await deleteUnusedQuestionPhoto(photo.ownerId, photo.id);
    } catch {
      /* Retry on the next worker run; attached photos stay protected. */
    }
  }
}

/** Worker-only execution, never invoked in the Hono request path. At-least-once
 * S3 DeleteObject is idempotent; lease fencing protects PostgreSQL state.
 * Requires the additive QuestionLegacyPhotoDeletion migration first. */
export async function processDueLegacyQuestionPhotoDeletions(options: {
  now?: () => Date;
  deleteObject?: (locator: string) => Promise<void>;
  limit?: number;
} = {}) {
  const now = options.now?.() ?? new Date();
  const limit = Math.min(30, Math.max(1, Math.trunc(options.limit ?? 10)));
  const result = { claimed: 0, done: 0, retry: 0, failed: 0 };
  const rows = await prisma.questionLegacyPhotoDeletion.findMany({
    where: {
      attempts: { lt: 5 },
      OR: [
        { status: "PENDING", availableAt: { lte: now } },
        { status: "PROCESSING", leaseUntil: { lt: now } },
      ],
    },
    select: { id: true, ownerId: true, locator: true, attempts: true },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });
  for (const row of rows) {
    const token = randomUUID();
    const fenced = await prisma.questionLegacyPhotoDeletion.updateMany({
      where: {
        id: row.id,
        attempts: { lt: 5 },
        OR: [
          { status: "PENDING", availableAt: { lte: now } },
          { status: "PROCESSING", leaseUntil: { lt: now } },
        ],
      },
      data: {
        status: "PROCESSING",
        attemptToken: token,
        leaseUntil: new Date(now.getTime() + 10 * 60_000),
        attempts: { increment: 1 },
        errorCode: null,
      },
    });
    if (fenced.count !== 1) continue;
    result.claimed++;
    try {
      const exact = validatedLegacyQuestionPhotoLocator(row.locator, row.ownerId);
      await (options.deleteObject ?? deleteFileFromCDN)(exact);
      const ack = await prisma.questionLegacyPhotoDeletion.updateMany({
        where: {
          id: row.id,
          attemptToken: token,
          status: "PROCESSING",
          leaseUntil: { gt: options.now?.() ?? new Date() },
        },
        data: {
          status: "DONE", attemptToken: null, leaseUntil: null,
          errorCode: null,
          // No operational need to retain a deleted owner's object key forever.
          ownerId: "", locator: "",
        },
      });
      if (ack.count === 1) result.done++;
      // If the lease was lost, a new Worker can replay this exact S3 DeleteObject.
    } catch {
      const terminal = row.attempts + 1 >= 5;
      const failed = await prisma.questionLegacyPhotoDeletion.updateMany({
        where: {
          id: row.id, attemptToken: token, status: "PROCESSING",
          leaseUntil: { gt: options.now?.() ?? new Date() },
        },
        data: {
          status: terminal ? "FAILED" : "PENDING",
          attemptToken: null, leaseUntil: null,
          errorCode: "QUESTIONS_LEGACY_DELETE_FAILED",
          availableAt: new Date(now.getTime() +
            Math.min(3_600_000, 60_000 * 2 ** row.attempts)),
        },
      });
      if (failed.count === 1) {
        if (terminal) result.failed++;
        else result.retry++;
      }
    }
  }
  return result;
}

/** Anonymous low-cardinality metrics; never expose photo IDs, owner IDs or S3 keys.
 * An unexpanded production DB is intentionally NOT queried until the opt-in
 * migration-first Worker flag is explicitly enabled.
 * With flag enabled, SQL failures propagate to /metrics/media -> HTTP 503,
 * which activates the existing worker scrape-unavailable alert.
 */
export async function renderQuestionsLegacyDeletionMetricsPrometheus(
  now = new Date(),
  env: Record<string, string | undefined> = process.env,
): Promise<string> {
  const enabled = env.QUESTIONS_LEGACY_PHOTO_DELETE_WORKER_ENABLED === "true";
  let pending = 0;
  let processing = 0;
  let failed = 0;
  let oldestAgeSeconds = 0;
  if (enabled) {
    const [groups, oldest] = await Promise.all([
      prisma.questionLegacyPhotoDeletion.groupBy({
        by: ["status"],
        where: { status: { in: ["PENDING", "PROCESSING", "FAILED"] } },
        _count: { _all: true },
      }),
      prisma.questionLegacyPhotoDeletion.findFirst({
        where: { status: { in: ["PENDING", "PROCESSING"] } },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    for (const group of groups) {
      if (group.status === "PENDING") pending = group._count._all;
      if (group.status === "PROCESSING") processing = group._count._all;
      if (group.status === "FAILED") failed = group._count._all;
    }
    oldestAgeSeconds = oldest
      ? Math.max(0, (now.getTime() - oldest.createdAt.getTime()) / 1000) : 0;
  }
  return [
    "# HELP gafus_questions_legacy_delete_enabled Worker flag implies expanded PostgreSQL schema is required",
    "# TYPE gafus_questions_legacy_delete_enabled gauge",
    "gafus_questions_legacy_delete_enabled " + Number(enabled),
    "# HELP gafus_questions_legacy_delete_pending Pending S3 deletion intents",
    "# TYPE gafus_questions_legacy_delete_pending gauge",
    "gafus_questions_legacy_delete_pending " + pending,
    "# HELP gafus_questions_legacy_delete_processing Leased S3 deletion intents",
    "# TYPE gafus_questions_legacy_delete_processing gauge",
    "gafus_questions_legacy_delete_processing " + processing,
    "# HELP gafus_questions_legacy_delete_failed Terminal S3 deletion intents requiring manual review",
    "# TYPE gafus_questions_legacy_delete_failed gauge",
    "gafus_questions_legacy_delete_failed " + failed,
    "# HELP gafus_questions_legacy_delete_oldest_age_seconds Age of oldest pending or leased intent",
    "# TYPE gafus_questions_legacy_delete_oldest_age_seconds gauge",
    "gafus_questions_legacy_delete_oldest_age_seconds " + oldestAgeSeconds,
  ].join("\n") + "\n";
}
