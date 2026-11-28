/** Durable account cleanup DB repository. Core is the only provider/worker
 * orchestrator. SQL leases are claimed with SKIP LOCKED and every receipt,
 * progress update, CDN checkpoint and retry is fenced by the exact current
 * attempt token AND an unexpired lease. No foreign owner can be selected by
 * the restricted private diagnostic path. Do not call S3, CDN or Stream here.
 */
import {prisma} from '@gafus/prisma';
export type AccountCleanupJob={
 id:string; ownerId:string;
 scope:'public'|'gallery'|'feed'|'questions'|'documents'|'stream';
 keys:string[];prefixes:string[];keyCursor:number;
 purgeOperations:string[];purgeAfter:Date|null;attempts:number;
};

export async function claimAccountCleanupJob(token:string,selectedOwner:string|null){
 const jobs=await prisma.$queryRaw<AccountCleanupJob[]>`
        UPDATE "AccountStorageCleanup" SET "status" = 'processing', "attemptToken" = ${token},
          "leaseUntil" = timezone('UTC', now()) + interval '5 minutes', "attempts" = "attempts" + 1,
          -- An expired attempt may have deleted late objects without durably
          -- recording the need for a fresh purge. Restart from the first page.
          "keyCursor" = CASE WHEN "errorCode" = 'CLEANUP_SWEEP_UNCERTAIN' THEN 0 ELSE "keyCursor" END,
          "purgeAfter" = CASE WHEN "errorCode" = 'CLEANUP_SWEEP_UNCERTAIN' THEN NULL ELSE "purgeAfter" END,
          "purgeOperations" = CASE WHEN "errorCode" = 'CLEANUP_SWEEP_UNCERTAIN' THEN ARRAY[]::text[] ELSE "purgeOperations" END,
          "updatedAt" = timezone('UTC', now())
        WHERE "id" = (
          SELECT "id" FROM "AccountStorageCleanup"
          WHERE (("status" = 'pending' AND "availableAt" <= timezone('UTC', now()))
              OR ("status" = 'processing' AND "leaseUntil" < timezone('UTC', now())))
            AND (${selectedOwner}::text IS NULL OR "ownerId" = ${selectedOwner})
            AND (${selectedOwner}::text IS NULL OR "scope" IN ('questions', 'documents'))
          ORDER BY "availableAt" FOR UPDATE SKIP LOCKED LIMIT 1
        ) RETURNING *`;
 return jobs[0]??null;
}

export async function accountCleanupOwnerExists(ownerId:string){
 return Boolean(await prisma.user.findUnique({where:{id:ownerId},select:{id:true}}));
}

export async function checkpointAccountStreamJob(job:{id:string},token:string,remaining:string[]){
 return prisma.$executeRaw`UPDATE "AccountStorageCleanup" SET "keys" = ${remaining}::text[],
            "status" = ${remaining.length ? "pending" : "done"}, "availableAt" = timezone('UTC', now()),
            "leaseUntil" = NULL, "attemptToken" = NULL, "errorCode" = NULL, "updatedAt" = timezone('UTC', now())
            WHERE "id" = ${job.id} AND "attemptToken" = ${token} AND "leaseUntil" > timezone('UTC', now())`;
}

/** Commit intent BEFORE the external sweep. A crash after deletion but before
 * the next receipt must never allow an older CDN purge to prove completion. */
export async function beginAccountCleanupSweep(job:{id:string},token:string){
 return prisma.$executeRaw`UPDATE "AccountStorageCleanup"
            SET "errorCode" = 'CLEANUP_SWEEP_UNCERTAIN', "updatedAt" = timezone('UTC', now())
            WHERE "id" = ${job.id} AND "attemptToken" = ${token}
              AND "status" = 'processing' AND "leaseUntil" > timezone('UTC', now())`;
}

export async function resetAccountCdnPurge(job:{id:string},token:string){
 return prisma.$executeRaw`UPDATE "AccountStorageCleanup" SET "purgeOperations" = ARRAY[]::text[],
            "purgeAfter" = NULL WHERE "id" = ${job.id} AND "attemptToken" = ${token} AND "leaseUntil" > timezone('UTC', now())`;
}

export async function checkpointAccountKeysCursor(job:{id:string},token:string,nextCursor:number,removed:number){
 return prisma.$executeRaw`UPDATE "AccountStorageCleanup" SET "keyCursor" = ${nextCursor},
            "purgeAfter" = CASE WHEN ${removed > 0} THEN NULL ELSE "purgeAfter" END,
            "status" = 'pending', "availableAt" = timezone('UTC', now()), "leaseUntil" = NULL, "attemptToken" = NULL,
            "errorCode" = NULL, "updatedAt" = timezone('UTC', now())
            WHERE "id" = ${job.id} AND "attemptToken" = ${token} AND "leaseUntil" > timezone('UTC', now())`;
}

export async function completeAccountPrivateScope(job:{id:string},token:string){
 return prisma.$executeRaw`UPDATE "AccountStorageCleanup" SET
            "status" = 'done', "keys" = ARRAY[]::text[], "keyCursor" = 0,
            "purgeOperations" = ARRAY[]::text[], "purgeAfter" = NULL,
            "errorCode" = NULL, "leaseUntil" = NULL, "attemptToken" = NULL,
            "updatedAt" = timezone('UTC', now())
            WHERE "id" = ${job.id} AND "attemptToken" = ${token} AND "leaseUntil" > timezone('UTC', now())`;
}

export async function checkpointAccountCdnOperations(job:{id:string},token:string,operations:string[]){
 return prisma.$executeRaw`UPDATE "AccountStorageCleanup"
              SET "purgeOperations" = ${operations}::text[], "updatedAt" = timezone('UTC', now())
              WHERE "id" = ${job.id} AND "attemptToken" = ${token} AND "leaseUntil" > timezone('UTC', now())`;
}

export async function scheduleAccountCdnPurge(job:{id:string},token:string,operations:string[],after:Date){
 return prisma.$executeRaw`UPDATE "AccountStorageCleanup"
            SET "purgeOperations" = ${operations}::text[], "purgeAfter" = ${after}, "keyCursor" = 0,
              "availableAt" = ${after}, "status" = 'pending', "leaseUntil" = NULL,
              "attemptToken" = NULL, "errorCode" = NULL, "updatedAt" = timezone('UTC', now())
            WHERE "id" = ${job.id} AND "attemptToken" = ${token} AND "leaseUntil" > timezone('UTC', now())`;
}

export async function completeAccountStorageJob(job:{id:string},token:string){
 return prisma.$executeRaw`UPDATE "AccountStorageCleanup"
            SET "status" = 'done', "keys" = ARRAY[]::text[], "errorCode" = NULL,
              "leaseUntil" = NULL, "attemptToken" = NULL, "updatedAt" = timezone('UTC', now())
            WHERE "id" = ${job.id} AND "attemptToken" = ${token} AND "leaseUntil" > timezone('UTC', now())`;
}

export async function retryAccountStorageJob(job:{id:string},token:string,next:Date,code:string,resetPurge:boolean,resetOperations:boolean){
 return prisma.$executeRaw`UPDATE "AccountStorageCleanup" SET "status" = 'pending',
          "purgeAfter" = CASE WHEN ${resetPurge} THEN NULL ELSE "purgeAfter" END,
          "purgeOperations" = CASE WHEN ${resetOperations} THEN ARRAY[]::text[] ELSE "purgeOperations" END,
          "keyCursor" = CASE WHEN ${resetPurge} THEN 0 ELSE "keyCursor" END,
          "availableAt" = ${next}, "errorCode" = ${code}, "leaseUntil" = NULL,
          "attemptToken" = NULL, "updatedAt" = timezone('UTC', now())
          WHERE "id" = ${job.id} AND "attemptToken" = ${token} AND "leaseUntil" > timezone('UTC', now())`;
}
