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

/** 24-hour observed JS cohorts only. Native crashes cannot be reliably joined
 * to the JS session ID and therefore must not enter a crash-free denominator.
 * Pseudonyms remain inside SQL; the admin receives only aggregate counts. */
export async function listOtaDiagnosticQuality() {
  return prisma.$queryRaw<{
    platform:string; runtimeVersion:string; revision:number; updateId:string;
    build:string; nativeReleaseId:string; sessions:number; installations:number; errorSessions:number;
    fatalEvents:number; errors:number; launchedInstallations:number; otaFailureInstallations:number;
    downloadedInstallations:number; launchedAfterDownload:number;
  }[]>`
    WITH observed AS (
      SELECT s.platform,s."updateId",s."eventKind",s.severity,
        s.payload->>'appStartId' AS session_id,
        s.payload->>'installationId' AS installation_id,
        CASE WHEN (s.payload->>'occurrences') ~ '^[1-9][0-9]{0,3}$'
          THEN LEAST(1000,(s.payload->>'occurrences')::int) ELSE 1 END AS occurrences
      FROM "MobileTelemetrySpool" s
      JOIN "MobileOtaRelease" r ON r."updateId"::text=s."updateId" AND r.platform=s.platform
        AND r.environment=s.environment AND r."runtimeVersion"=s."runtimeVersion"
      JOIN "MobileNativeRelease" n ON n.id=r."nativeReleaseId" AND n.verified=true
        AND n."appVersion"=s."appVersion" AND n."buildNumber"=s.payload->>'build'
        AND n.channel=s.payload->>'channel'
      WHERE s.environment='production' AND s.platform IN ('ios','android')
        AND s."createdAt">timezone('UTC', now())-INTERVAL '24 hours'
        AND s."retentionUntil">timezone('UTC', now())
    ), sessions AS (
      SELECT "updateId",platform,COUNT(DISTINCT session_id)::int AS sessions,
        COUNT(DISTINCT installation_id)::int AS installations
      FROM observed WHERE "eventKind"='session_start' AND session_id IS NOT NULL
      GROUP BY "updateId",platform
    ), failures AS (
      SELECT o."updateId",o.platform,
        COUNT(DISTINCT o.session_id) FILTER (WHERE o.severity IN ('ERROR','FATAL') AND EXISTS (
          SELECT 1 FROM observed start
          WHERE start."eventKind"='session_start' AND start.session_id=o.session_id
            AND start."updateId"=o."updateId" AND start.platform=o.platform
        ))::int AS "errorSessions",
        COALESCE(SUM(o.occurrences) FILTER (WHERE o.severity='FATAL'),0)::int AS "fatalEvents",
        COALESCE(SUM(o.occurrences) FILTER (WHERE o.severity IN ('ERROR','FATAL')),0)::int AS errors
      FROM observed o GROUP BY o."updateId",o.platform
    ), ota_installation AS (
      SELECT "updateId",platform,"installationHash",
        MIN("createdAt") FILTER (WHERE event='DOWNLOADED') AS download_at,
        MAX("createdAt") FILTER (WHERE event='LAUNCHED') AS launch_at,
        BOOL_OR(event IN ('UPDATE_ERROR','SIGNATURE_REJECTED','MANDATORY_INCOMPLETE')) AS failed
      FROM "MobileOtaTelemetryEvent"
      WHERE environment='production' AND "createdAt">timezone('UTC', now())-INTERVAL '24 hours'
        AND "updateId" IS NOT NULL
      GROUP BY "updateId",platform,"installationHash"
    ), lifecycle AS (
      SELECT "updateId",platform,
        COUNT(*) FILTER (WHERE launch_at IS NOT NULL)::int AS "launchedInstallations",
        COUNT(*) FILTER (WHERE failed)::int AS "otaFailureInstallations",
        COUNT(*) FILTER (WHERE download_at IS NOT NULL)::int AS "downloadedInstallations",
        COUNT(*) FILTER (WHERE download_at IS NOT NULL AND launch_at>=download_at)::int AS "launchedAfterDownload"
      FROM ota_installation
      GROUP BY "updateId",platform
    )
    SELECT r.platform,r."runtimeVersion",r.revision,r."updateId",n."buildNumber" AS build,n.id AS "nativeReleaseId",
      COALESCE(s.sessions,0)::int AS sessions,COALESCE(s.installations,0)::int AS installations,
      COALESCE(f."errorSessions",0)::int AS "errorSessions",
      COALESCE(f."fatalEvents",0)::int AS "fatalEvents",COALESCE(f.errors,0)::int AS errors,
      COALESCE(l."launchedInstallations",0)::int AS "launchedInstallations",
      COALESCE(l."otaFailureInstallations",0)::int AS "otaFailureInstallations",
      COALESCE(l."downloadedInstallations",0)::int AS "downloadedInstallations",
      COALESCE(l."launchedAfterDownload",0)::int AS "launchedAfterDownload"
    FROM "MobileOtaRelease" r JOIN "MobileNativeRelease" n ON n.id=r."nativeReleaseId"
    LEFT JOIN sessions s ON s."updateId"=r."updateId"::text AND s.platform=r.platform
    LEFT JOIN failures f ON f."updateId"=r."updateId"::text AND f.platform=r.platform
    LEFT JOIN lifecycle l ON l."updateId"=r."updateId" AND l.platform=r.platform
    WHERE r.environment='production' AND r."appId"='gafus' AND r.state='READY' AND n.verified=true
    ORDER BY r."createdAt" DESC LIMIT 100
  `;
}
