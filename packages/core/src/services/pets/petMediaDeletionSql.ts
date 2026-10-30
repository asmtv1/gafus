/** WEB2 transaction-scoped SQL adapter for per-pet provider-aware media GC.
 * Intentionally NEVER executes Prisma migrate/generate or starts a worker.
 * Source migration 20261026074500 must be separately reviewed and applied
 * before any producer or worker entry point is enabled.
 */
import { randomUUID } from "node:crypto";
import type { Prisma } from "@gafus/prisma";
import { describePetMediaLocator, petMediaDedupeKey,
  runClaimedPetMediaDeletion, type PetMediaIntent, type PetMediaReason,
  type PetMediaDeletionPort, type PetMediaProvider, type PetMediaRunResult,
} from "./petMediaDeletionOutbox";

/** Refactor rollout stays off until the additive DDL has been reviewed/applied.
 * Refuse typos; never silently delete without outbox on an invalid setting. */
export function petMediaOutboxEnabled(): boolean {
  const flag = process.env.PET_MEDIA_DELETION_OUTBOX_ENABLED;
  if (flag !== undefined && flag !== "true" && flag !== "false")
    throw new Error("PET_MEDIA_OUTBOX_CONFIGURATION_INVALID");
  return flag === "true";
}

type Executor = Pick<Prisma.TransactionClient, "$executeRaw">;
type SqlTx = Pick<Prisma.TransactionClient, "$executeRaw" | "$queryRaw" | "pet" | "petDocument">;
type Db = {
  $executeRaw: Prisma.TransactionClient["$executeRaw"];
  $queryRaw: Prisma.TransactionClient["$queryRaw"];
  $transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: {timeout?: number},
  ): Promise<T>;
};

/** Always called inside the same owner-locked transaction as the mutation.
 * Duplicate lost ACK/repeated requests cannot create duplicate delete jobs.
 * A candidate reservation is created BEFORE any provider PUT, delayed to
 * allow bounded uploads/SQL ACK recovery. No network work here.
 */
export async function enqueuePetMediaDeletionIntent(
  tx: Executor,
  ownerId: string, petId: string, locator: string,
  reason: PetMediaReason, availableAt = new Date(),
): Promise<string> {
  const { provider } = describePetMediaLocator(ownerId,petId,locator);
  const dedupe = petMediaDedupeKey(ownerId,locator);
  await tx.$executeRaw`
    INSERT INTO "PetMediaDeletionIntent" (
      "id","ownerId","petId","dedupeKey","provider","locator","reason",
      "status","attempts","availableAt","createdAt","updatedAt"
    ) VALUES (
      ${randomUUID()}::uuid, ${ownerId}, ${petId}, ${dedupe}, ${provider},
      ${locator}, ${reason}, 'pending', 0, ${availableAt},
      timezone('UTC',now()),timezone('UTC',now())
    ) ON CONFLICT ("ownerId","dedupeKey") DO NOTHING`;
  return dedupe;
}

/** Must be in SAME transaction as the successful Pet.photoUrl or
 * PetDocument insert. If candidate lease was already claimed (or expired),
 * fail the write rather than introduce an object the worker may delete.
 */
export async function consumePetMediaUploadReservation(
  tx: Executor, ownerId: string, locator: string,
): Promise<void> {
  const dedupe = petMediaDedupeKey(ownerId,locator);
  const consumed = await tx.$executeRaw`
    DELETE FROM "PetMediaDeletionIntent"
    WHERE "ownerId" = ${ownerId} AND "dedupeKey" = ${dedupe}
      AND "status" = 'pending' AND "reason" = 'candidate'
      AND "availableAt" > timezone('UTC',now())`;
  if (consumed !== 1) throw new Error("PET_MEDIA_CANDIDATE_RESERVATION_UNSAFE");
}

type SqlJob = Omit<PetMediaIntent, "status"> & {
  status: "pending" | "processing" | "done";
};
/** A concurrent worker cannot claim the same entry until lease expiry. */
export async function claimOnePetMediaDeletion(db: Db): Promise<PetMediaIntent | null> {
  const token = randomUUID();
  const rows = await db.$queryRaw<SqlJob[]>`
    UPDATE "PetMediaDeletionIntent" SET
      "status"='processing',"attemptToken"=${token}::uuid,
      "leaseUntil"=timezone('UTC',now()) + interval '90 seconds',
      "attempts"="attempts"+1,"updatedAt"=timezone('UTC',now())
    WHERE "id"=(SELECT "id" FROM "PetMediaDeletionIntent"
      WHERE (("status"='pending' AND "availableAt" <= timezone('UTC',now()))
        OR ("status"='processing' AND "leaseUntil" <= timezone('UTC',now())))
      ORDER BY "availableAt","id" FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING "id","ownerId","petId","dedupeKey","provider","locator",
      "reason","status","attemptToken","leaseUntil","attempts"`;
  return rows[0] ?? null;
}

/** One port per claimed job. The exact account namespace is always fenced by
 * an advisory xact lock. For a live owner, keep the existing User FOR UPDATE
 * contract. When account deletion has already committed, the durable
 * AccountStorageCleanup(public) witness takes its place (same transaction as
 * User.delete, no FK to that User). Never fabricate a missing owner witness.
 * The row lock coordinates with AccountCleanup's SQL claim/checkpoints, while
 * global Pet/PetDocument reference checks cover other owners as well.
 * Physical provider IO is held inside this transaction until job CAS commit.
 * DO NOT run against provider from in-process test doubles.
 */
export function createPetMediaDeletionSqlPort(
  db: Db, deleteAndVerify: (provider: PetMediaProvider, locator: string) => Promise<void>,
): PetMediaDeletionPort {
  let currentTx: SqlTx | null = null;
  const query = () => currentTx ?? db;
  return {
    async withOwnerFence<T>(ownerId: string, task: () => Promise<T>): Promise<T> {
      return db.$transaction(async tx => {
        // Unique per owner namespace. All PetMedia workers use this even when
        // the User row was deleted; it also serializes jobs for the same owner.
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended('pet-media-owner:' || ${ownerId}, 0))`;
        const users = await tx.$queryRaw<{id:string}[]>`
          SELECT "id" FROM "User" WHERE "id"=${ownerId} FOR UPDATE`;
        const account = await tx.$queryRaw<{
          id:string;scope:string;status:string;leaseUntil:Date|null;
        }[]>`
          SELECT "id","scope","status","leaseUntil" FROM "AccountStorageCleanup"
          WHERE "ownerId"=${ownerId} AND "scope" IN ('public','documents')
          ORDER BY "scope" FOR UPDATE`;
        // The public row survives the User cascade and proves the immutable
        // original account namespace. Existing user + tombstone = ID reuse;
        // neither = no trustworthy namespace witness. Fail before provider IO.
        const originalDeleted = account.some(row=>row.scope==="public");
        if ((users.length > 0) === originalDeleted)
          throw new Error("PET_MEDIA_OWNER_NAMESPACE_UNVERIFIED");
        // The independent AccountCleanup worker claims a documents/public
        // scope with SKIP LOCKED, then may sweep outside its claim transaction.
        // Holding both rows stops NEW claims; when either scope is already
        // processing under a live lease, we defer and retry instead of racing.
        if (account.some(row=>row.status==="processing" && row.leaseUntil &&
            row.leaseUntil.getTime()>Date.now()))
          throw new Error("PET_MEDIA_ACCOUNT_CLEANUP_IN_FLIGHT");
        if (originalDeleted) {
          // A tombstone alone cannot block a new User(id=deletedId) INSERT
          // racing between our absent-User check and provider HEAD. Require
          // the separately reviewed *deferred constraint trigger* on User;
          // only an actual installed/enabled schema guard may admit cleanup.
          const guard=await tx.$queryRaw<{ready:boolean}[]>`
            SELECT EXISTS (SELECT 1 FROM pg_trigger t
              WHERE t.tgrelid = to_regclass('"User"')
                AND t.tgname = 'pet_media_owner_namespace_guard'
                AND t.tgfoid = to_regprocedure('"pet_media_owner_namespace_guard_fn"()')
                AND t.tgenabled = 'O' AND t.tgdeferrable
                AND t.tginitdeferred) AS "ready"`;
          if (guard.length !== 1 || guard[0]?.ready !== true)
            throw new Error("PET_MEDIA_OWNER_REUSE_GUARD_NOT_INSTALLED");
        }
        currentTx=tx;
        try { return await task(); } finally { currentTx=null; }
      },{timeout:120_000});
    },
    async isLeaseCurrent(id,token) {
      if (currentTx) {
        // The short SKIP LOCKED claim does not protect a slow provider call.
        // Lock the SAME intent row until provider HEAD + final CAS commit:
        // an expired competing lease cannot claim mid-DELETE. Renewal stays
        // within the existing 120s SQL transaction timeout; on rollback its
        // updated lease also rolls back, allowing a safe idempotent retry.
        const renewed = await currentTx.$executeRaw`
          UPDATE "PetMediaDeletionIntent" SET
            "leaseUntil"=timezone('UTC',clock_timestamp()) + interval '120 seconds',
            "updatedAt"=timezone('UTC',clock_timestamp())
          WHERE "id"=${id}::uuid AND "attemptToken"=${token}::uuid
            AND "status"='processing' AND "leaseUntil">timezone('UTC',clock_timestamp())`;
        return renewed === 1;
      }
      const rows = await db.$queryRaw<{id:string}[]>`
        SELECT "id" FROM "PetMediaDeletionIntent"
        WHERE "id"=${id}::uuid AND "attemptToken"=${token}::uuid
          AND "status"='processing' AND "leaseUntil">timezone('UTC',clock_timestamp())`;
      return rows.length === 1;
    },
    async hasActiveReference(locator) {
      if (!currentTx) throw new Error("PET_MEDIA_OWNER_FENCE_REQUIRED");
      // Check every account, not only the deleting owner: malformed legacy
      // references must never be deleted while any live row still uses them.
      const photos=await currentTx.pet.count({where:{photoUrl:locator}});
      if (photos>0) return true;
      const documents=await currentTx.petDocument.count({where:{url:locator}});
      return documents>0;
    },
    deleteAndVerify,
    async complete(id,token) {
      if (!currentTx) throw new Error("PET_MEDIA_OWNER_FENCE_REQUIRED");
      const count=await currentTx.$executeRaw`
        UPDATE "PetMediaDeletionIntent" SET "status"='done',
          "leaseUntil"=NULL,"attemptToken"=NULL,"errorCode"=NULL,
          "updatedAt"=timezone('UTC',clock_timestamp())
        WHERE "id"=${id}::uuid AND "attemptToken"=${token}::uuid
          AND "status"='processing' AND "leaseUntil">timezone('UTC',clock_timestamp())`;
      return count===1;
    },
    async release(id,token,retryAfterMs) {
      await query().$executeRaw`
        UPDATE "PetMediaDeletionIntent" SET "status"='pending',
          "attemptToken"=NULL,"leaseUntil"=NULL,
          "availableAt"=${new Date(Date.now()+retryAfterMs)},
          "errorCode"='RETRY_REQUIRED',"updatedAt"=timezone('UTC',clock_timestamp())
        WHERE "id"=${id}::uuid AND "attemptToken"=${token}::uuid
          AND "status"='processing' AND "leaseUntil">timezone('UTC',clock_timestamp())`;
    },
  };
}
export async function runOnePetMediaDeletionSql(
  db: Db, provider: (type: PetMediaProvider, locator: string) => Promise<void>,
): Promise<PetMediaRunResult | "empty"> {
  const job=await claimOnePetMediaDeletion(db);
  return job ? runClaimedPetMediaDeletion(job,createPetMediaDeletionSqlPort(db,provider)) : "empty";
}
