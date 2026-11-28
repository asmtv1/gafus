/** Minimal pseudonymous installation lifecycle, always labelled client-reported. */
import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { prisma } from "@gafus/prisma";

const UUID = z.string().uuid();
export const otaTelemetrySchema = z.object({
  eventId: UUID,
  installationId: UUID,
  platform: z.enum(["ios", "android"]),
  channel: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,47}$/),
  runtimeVersion: z.string().regex(/^[A-Za-z0-9_.+-]{1,100}$/),
  nativeFingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
  updateId: UUID.optional(),
  event: z.enum(["LAUNCHED", "CHECKED", "DOWNLOADED", "UPDATE_ERROR", "ROLLBACK_DETECTED", "SIGNATURE_REJECTED", "MANDATORY_ATTEMPT", "MANDATORY_INCOMPLETE"]),
  failureCode: z.enum(["CHECK_FAILED", "FETCH_FAILED", "RELOAD_FAILED", "NATIVE_UNAVAILABLE", "OTHER"]).optional(),
}).strict().refine(data => data.event === "UPDATE_ERROR" ? !!data.failureCode : !data.failureCode,
  "Failure code must be provided exactly for UPDATE_ERROR");
export type OtaTelemetryInput = z.infer<typeof otaTelemetrySchema>;
export class OtaTelemetryError extends Error {
  constructor(public readonly code: string) {super(code);}
}
export function hashInstallationForTelemetry(installationId: string, secret: string): string {
  if (secret.length < 32) throw new OtaTelemetryError("TELEMETRY_DISABLED");
  return createHmac("sha256", secret).update(installationId.toLowerCase()).digest("hex");
}
export async function ingestOtaTelemetry(
  event: OtaTelemetryInput,
  environment: "preview" | "production",
  secret: string,
): Promise<{accepted: boolean; replayed: boolean}> {
  const hash = hashInstallationForTelemetry(event.installationId, secret);
  return prisma.$transaction(async tx => {
    const allowed = await tx.$queryRaw<{id:string}[]>`
      SELECT id FROM "MobileNativeRelease"
      WHERE "appId"='gafus' AND platform=${event.platform}
        AND environment=${environment} AND channel=${event.channel}
        AND "runtimeVersion"=${event.runtimeVersion}
        AND "nativeFingerprint"=${event.nativeFingerprint.toLowerCase()} AND verified=true
        AND (${event.updateId ?? null}::uuid IS NULL OR EXISTS (
          SELECT 1 FROM "MobileOtaRelease" r
          WHERE r."nativeReleaseId"="MobileNativeRelease".id
            AND r."updateId"=${event.updateId ?? null}::uuid AND r.state='READY'
        ))
      LIMIT 1
    `;
    if(!allowed[0]) throw new OtaTelemetryError("UNVERIFIED_NATIVE_TELEMETRY");
    // Serialize both the immutable event ID and installation quota before reading.
    // Separate namespaces and a fixed lock order avoid cross-installation lock cycles.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext('gafus-ota-telemetry-event'), hashtext(${event.eventId.toLowerCase()}))`;
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext('gafus-ota-telemetry-quota'), hashtext(${hash}))`;
    const old = await tx.$queryRaw<{
      installationHash:string;platform:string;environment:string;channel:string;
      runtimeVersion:string;nativeFingerprint:string;updateId:string|null;
      event:string;failureCode:string|null;
    }[]>`
      SELECT "installationHash",platform,environment,channel,"runtimeVersion","nativeFingerprint",
        "updateId",event,"failureCode" FROM "MobileOtaTelemetryEvent" WHERE "eventId"=${event.eventId}::uuid
    `;
    if(old[0]) {
      const row=old[0];
      if(row.installationHash!==hash || row.platform!==event.platform ||
         row.environment!==environment || row.channel!==event.channel ||
         row.runtimeVersion!==event.runtimeVersion || row.nativeFingerprint!==event.nativeFingerprint.toLowerCase() ||
         row.updateId!==(event.updateId ?? null) || row.event!==event.event ||
         row.failureCode!==(event.failureCode ?? null))
        throw new OtaTelemetryError("TELEMETRY_EVENT_CONFLICT");
      return {accepted:true,replayed:true};
    }
    // Public endpoint: bound storage amplification per pseudonymous installation/day.
    const counts=await tx.$queryRaw<{count:bigint}[]>`
      SELECT COUNT(*)::bigint as count FROM "MobileOtaTelemetryEvent"
      WHERE "installationHash"=${hash} AND "createdAt"> timezone('UTC', now())-INTERVAL '24 hours'
    `;
    if ((counts[0]?.count ?? 0n) >= 150n) throw new OtaTelemetryError("TELEMETRY_QUOTA_EXCEEDED");
    const inserted=await tx.$queryRaw<{id:string}[]>`
      INSERT INTO "MobileOtaTelemetryEvent"
        (id,"eventId","installationHash",platform,environment,channel,"runtimeVersion",
         "nativeFingerprint","updateId",event,"failureCode","createdAt")
      VALUES (${randomUUID()}::uuid,${event.eventId}::uuid,${hash},${event.platform},
        ${environment},${event.channel},${event.runtimeVersion},${event.nativeFingerprint.toLowerCase()},
        ${event.updateId ?? null}::uuid,${event.event},${event.failureCode ?? null},timezone('UTC', now()))
      ON CONFLICT ("eventId") DO NOTHING RETURNING id
    `;
    // Only the earlier exact payload comparison can acknowledge a replay.
    if (inserted.length !== 1) throw new OtaTelemetryError("TELEMETRY_EVENT_CONFLICT");
    return {accepted:true,replayed:false};
  }, { isolationLevel: "ReadCommitted" });
}
export async function listOtaTelemetrySummaries(): Promise<unknown[]> {
  return prisma.$queryRaw<unknown[]>`
    SELECT platform,environment,channel,"runtimeVersion","updateId",event,"failureCode",
      COUNT(*)::int AS events,COUNT(DISTINCT "installationHash")::int AS installations,
      MAX("createdAt") AS "lastReportedAt"
    FROM "MobileOtaTelemetryEvent"
    WHERE "createdAt">timezone('UTC', now())-INTERVAL '30 days'
    GROUP BY platform,environment,channel,"runtimeVersion","updateId",event,"failureCode"
    ORDER BY "lastReportedAt" DESC LIMIT 200
  `;
}
/** Explicit maintenance entrypoint for future server job; never in a GET or client handler. */
export async function pruneOtaTelemetry(): Promise<number> {
  return prisma.$executeRaw`
    DELETE FROM "MobileOtaTelemetryEvent"
    WHERE "createdAt" < timezone('UTC', now()) - INTERVAL '30 days'
  `;
}

/** Fixed platform/event buckets of deduplicated client-reported events in the last hour.
 * No installation hashes, release IDs or arbitrary client labels leave this query. */
export async function readOtaOperationalTelemetry() {
  return prisma.$queryRaw<{ platform: string; event: string; count: number }[]>`
    SELECT platform, event, count(*)::int AS count
    FROM "MobileOtaTelemetryEvent"
    WHERE "createdAt" > timezone('UTC', now()) - INTERVAL '1 hour' AND environment = 'production'
      AND platform IN ('ios', 'android')
      AND event IN ('LAUNCHED', 'CHECKED', 'DOWNLOADED', 'UPDATE_ERROR', 'ROLLBACK_DETECTED',
        'SIGNATURE_REJECTED', 'MANDATORY_ATTEMPT', 'MANDATORY_INCOMPLETE')
    GROUP BY platform, event
  `;
}
