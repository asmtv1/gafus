/** OFF021 video.position v3 corrected Core patch, NOT exported to active application.
 * Requires AG4-approved additive schema and separate realPG validation.
 * Never import this module into the live offline v2 router under SOURCE_ONLY grant.
 */
import { randomUUID } from "node:crypto";
import { prisma, Prisma } from "@gafus/prisma";
import { z } from "zod/v3";
import {
  authorizeVideoOccurrenceV3,
  canonicalOccurrenceV3,
  MAX_FUTURE_SKEW_MS,
  MAX_REVISION,
  type VideoOccurrenceV3,
} from "./videoPositionOccurrenceV3";

export type VideoPositionInput = VideoOccurrenceV3;

/** Owner is authenticated and injected by Hono; never read user ID from JSON. */
export type VideoPositionReceipt = {
  success: true;
  ack: {
    protocol: 2;
    eventId: string;
    operation: "video.position";
    state: "COMMITTED";
    replayed: boolean;
    serverRevision: string;
    result: { videoId: string; positionSec: number; recordedAt: string };
  };
};
export class VideoPositionV3Error extends Error {
  constructor(
    public readonly code:
      | "VIDEO_ACCESS_DENIED"
      | "VIDEO_NOT_FOUND"
      | "IDEMPOTENCY_KEY_CONFLICT"
      | "STALE_VIDEO_REVISION"
      | "VIDEO_POSITION_JOURNAL_UNAVAILABLE"
      | "FUTURE_VIDEO_TIMESTAMP",
  ) {
    super(code);
  }
}
const forbidden = (code: VideoPositionV3Error["code"]): never => {
  throw new VideoPositionV3Error(code);
};

/** Pure canonical digest. Key is owner-scoped at SQL index, never input JSON.
 * A different eventID with same command is a NEW event and must revalidate revision.
 */
function normalize(ownerId: string, validated: VideoPositionInput) {
  return canonicalOccurrenceV3(ownerId, validated);
}
type StoredReceipt = {
  method: string;
  operation: string;
  resourceKey: string;
  payloadHash: string;
  state: string;
  responseStatus: number | null;
  responseBody: VideoPositionReceipt | null;
};
type Revision = {
  revision: bigint;
  videoLastPositionSec: number | null;
  videoRecordedAt: Date | null;
};

/**
 * All mutation effects (event claim -> resource lock/CAS -> persisted ACK)
 * are inside ONE real PostgreSQL transaction. Caller supplies the existing
 * occurrence+exact-video entitlement validator bound to THIS transaction.
 * That validator's implementation/mapping is deliberately an AG4 decision:
 * no permissive fallback, no claim of production-ready course access.
 *
 * Strictly no legacy UserVideoProgress UPSERT: that table is global user/video while
 * proposed resourceKey is per video/course/step. Dual-write projection MUST be
 * explicitly designed before this proposal can become a live handler.
 */
export async function submitVideoPositionV2Proposal(input: {
  authenticatedOwnerId: string;
  request: unknown;
}): Promise<VideoPositionReceipt> {
  const derived = canonicalOccurrenceV3(input.authenticatedOwnerId, input.request);
  const parsed = derived.value;
  if (!input.authenticatedOwnerId) forbidden("VIDEO_ACCESS_DENIED");
  const ownerId = input.authenticatedOwnerId;
  const { resourceKey, recordedAt, payloadHash } = normalize(ownerId, parsed);
  const now = new Date();
  if (Date.parse(recordedAt) > now.getTime() + MAX_FUTURE_SKEW_MS)
    forbidden("FUTURE_VIDEO_TIMESTAMP");
  const response = await prisma.$transaction(
    async (tx) => {
      // Access checked even on a duplicate receipt, so revoked video entitlement
      // cannot leak the prior ACK/result. Require video-course-step correspondence.
      const access = await authorizeVideoOccurrenceV3(tx, ownerId, parsed, now);
      if (access === "NOT_FOUND") forbidden("VIDEO_NOT_FOUND");
      if (access !== "ALLOWED") forbidden("VIDEO_ACCESS_DENIED");

      // Event claim uses UNIQUE(ownerId,eventId) with conflict waiting for
      // in-flight commit. PostgreSQL READ COMMITTED gives fresh snapshot on retry.
      const claim = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO "OfflineMutationReceipt"
        ("id","ownerId","eventId","method","operation","resourceKey","payloadHash","state")
      VALUES (CAST(${randomUUID()} AS uuid),${ownerId},CAST(${parsed.eventId} AS uuid),
        'POST','video.position',${resourceKey},${payloadHash},'RESERVED')
      ON CONFLICT ("ownerId","eventId") DO NOTHING RETURNING "id"
    `);
      if (claim.length === 0) {
        const stored = await tx.$queryRaw<StoredReceipt[]>(Prisma.sql`
        SELECT "method","operation","resourceKey","payloadHash","state","responseStatus","responseBody"
        FROM "OfflineMutationReceipt" WHERE "ownerId"=${ownerId}
          AND "eventId"=CAST(${parsed.eventId} AS uuid)
      `);
        const row = stored[0];
        if (!row) forbidden("VIDEO_POSITION_JOURNAL_UNAVAILABLE");
        if (
          row.method !== "POST" ||
          row.operation !== "video.position" ||
          row.resourceKey !== resourceKey ||
          row.payloadHash !== payloadHash
        )
          forbidden("IDEMPOTENCY_KEY_CONFLICT");
        if (
          row.state !== "COMMITTED" ||
          row.responseStatus !== 200 ||
          !row.responseBody?.ack ||
          row.responseBody.ack.eventId !== parsed.eventId
        )
          forbidden("VIDEO_POSITION_JOURNAL_UNAVAILABLE");
        return { success: true as const, ack: { ...row.responseBody!.ack, replayed: true } };
      }
      // An insert-if-absent revision row permits exact FOR UPDATE serialization
      // of competing DIFFERENT eventIds on this same owner+resource.
      await tx.$executeRaw(Prisma.sql`
      INSERT INTO "OfflineResourceRevision" ("ownerId","resourceKey","revision")
      VALUES (${ownerId},${resourceKey},0)
      ON CONFLICT ("ownerId","resourceKey") DO NOTHING
    `);
      const revisions = await tx.$queryRaw<Revision[]>(Prisma.sql`
      SELECT "revision","videoLastPositionSec","videoRecordedAt"
      FROM "OfflineResourceRevision"
      WHERE "ownerId"=${ownerId} AND "resourceKey"=${resourceKey} FOR UPDATE
    `);
      const before = revisions[0];
      if (!before) forbidden("VIDEO_POSITION_JOURNAL_UNAVAILABLE");
      // Record time never determines position monotonicity; backwards seek with a
      // NEW revision is valid. Stale clock/revision is an explicit 409.
      if (
        before.revision >= MAX_REVISION ||
        before.revision !== BigInt(parsed.expectedRevision) ||
        (before.videoRecordedAt && new Date(recordedAt) <= before.videoRecordedAt)
      )
        forbidden("STALE_VIDEO_REVISION");
      const next = before.revision + 1n;
      const updated = await tx.$executeRaw(Prisma.sql`
      UPDATE "OfflineResourceRevision" SET
        "revision"=${next},"videoLastPositionSec"=${parsed.positionSec},
        "videoRecordedAt"=CAST(${recordedAt} AS timestamptz)
      WHERE "ownerId"=${ownerId} AND "resourceKey"=${resourceKey}
        AND "revision"=${before.revision}
    `);
      if (updated !== 1) forbidden("STALE_VIDEO_REVISION");
      const ack: VideoPositionReceipt = {
        success: true,
        ack: {
          protocol: 2,
          eventId: parsed.eventId,
          operation: "video.position",
          state: "COMMITTED",
          replayed: false,
          serverRevision: String(next),
          result: { videoId: parsed.videoId, positionSec: parsed.positionSec, recordedAt },
        },
      };
      const committed = await tx.$executeRaw(Prisma.sql`
      UPDATE "OfflineMutationReceipt" SET "state"='COMMITTED',"revision"=${next},
        "responseStatus"=200,"responseBody"=CAST(${JSON.stringify(ack)} AS jsonb),
        "committedAt"=CURRENT_TIMESTAMP
      WHERE "id"=CAST(${claim[0]!.id} AS uuid) AND "ownerId"=${ownerId}
        AND "state"='RESERVED'
    `);
      if (committed !== 1) forbidden("VIDEO_POSITION_JOURNAL_UNAVAILABLE");
      return ack;
    },
    { timeout: 10000 },
  );
  return response;
}

/** Proposed Hono failure adapter; no exception/SQL diagnostics in responses. */
export function videoPositionV3ErrorEnvelope(error: unknown) {
  if (error instanceof z.ZodError)
    return { status: 400, body: { success: false, code: "INVALID_VIDEO_DTO" } };
  const code =
    error instanceof VideoPositionV3Error ? error.code : "VIDEO_POSITION_JOURNAL_UNAVAILABLE";
  const status =
    code === "VIDEO_ACCESS_DENIED"
      ? 403
      : code === "VIDEO_NOT_FOUND"
        ? 404
        : code === "IDEMPOTENCY_KEY_CONFLICT" || code === "STALE_VIDEO_REVISION"
          ? 409
          : code === "FUTURE_VIDEO_TIMESTAMP"
            ? 400
            : 503;
  return { status, body: { success: false, code } };
}
