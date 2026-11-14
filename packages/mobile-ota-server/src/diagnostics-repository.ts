/** PostgreSQL adapter: environment- and service-scoped dedup, release-gated
 * anonymous grants and atomic 202 boundary. No Redis/identity dependency. */
import { prisma, Prisma } from '@gafus/prisma';
import type { MobileTelemetryRepository, StoreResult, TelemetryIdentity, UploadGrant, TelemetryEnvironment } from './diagnostics-contracts.js';
import { MobileTelemetryIngestError } from './diagnostics-contracts.js';
import type { MobileTelemetryEventV1 } from '@gafus/types';

const serviceOf = (platform: string) => platform === 'ios' ? 'gafus-mobile-ios'
  : platform === 'android' ? 'gafus-mobile-android' : 'gafus-web';
const DAILY_EVENTS_CAP = 20_000;
const DAILY_BYTES_CAP = 64 * 1024 * 1024;
const retentionMs = (severity: string) => severity === 'DEBUG' || severity === 'INFO'
  ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
const enforceGrantScope = (session: {
  platform: string; appVersion: string; runtimeVersion: string; environment: string;
  build: string; channel: string;
}, e: MobileTelemetryEventV1, environment: string) => {
  if (session.environment !== environment || e.platform !== session.platform ||
      e.appVersion !== session.appVersion || e.runtime !== session.runtimeVersion ||
      e.build !== session.build || e.channel !== session.channel)
    throw new MobileTelemetryIngestError('TELEMETRY_GRANT_SCOPE_MISMATCH', 403);
};

export const prismaMobileTelemetryRepository: MobileTelemetryRepository = {
  async isVerifiedRelease(identity: TelemetryIdentity) {
    if (identity.platform === 'web') return false; // Separate Web trust path required.
    const release = await prisma.mobileNativeRelease.findFirst({
      where: {appId:'gafus', platform:identity.platform, environment:identity.environment,
        appVersion:identity.appVersion, runtimeVersion:identity.runtime,
        buildNumber:identity.build, channel:identity.channel,
        nativeFingerprint:identity.nativeFingerprint, verified:true},
      select: {id:true},
    });
    return Boolean(release);
  },
  async createGrant(input: UploadGrant) {
    await prisma.mobileTelemetryUploadSession.create({data:{
      tokenHash:input.tokenHash, environment:input.environment,
      platform:input.platform, appVersion:input.appVersion,
      build:input.build, channel:input.channel, nativeFingerprint:input.nativeFingerprint,
      runtimeVersion:input.runtime, eventBudget:input.eventBudget,
      expiresAt:input.expiresAt,
    }});
  },
  async persistBatch(input: {tokenHash:string;events:MobileTelemetryEventV1[];
    environment:TelemetryEnvironment;now:Date}):Promise<StoreResult> {
    const session = await prisma.mobileTelemetryUploadSession.findUnique({where:{tokenHash:input.tokenHash}});
    if (!session || session.environment !== input.environment || session.expiresAt <= input.now)
      throw new MobileTelemetryIngestError('TELEMETRY_GRANT_EXPIRED', 401);
    for (const event of input.events) enforceGrantScope(session, event, input.environment);
    for (let retry = 0; retry < 3; retry++) {
      try {
        return await prisma.$transaction(async tx => {
      const existing = await tx.mobileTelemetrySpool.findMany({
        where:{environment:input.environment, service:serviceOf(session.platform),
          eventId:{in:input.events.map(event=>event.eventId)}},select:{eventId:true},
      });
      const found = new Set(existing.map(e=>e.eventId));
      // An HTTP batch may repeat the same UUID. Reserve capacity and quota
      // only for genuinely new unique UUIDs, not duplicate array entries.
      const seen=new Set(found);
      const newEvents=input.events.filter(e=>{
        if(seen.has(e.eventId))return false;
        seen.add(e.eventId);return true;
      });
      if (newEvents.length) {
        const today = input.now.toISOString().slice(0, 10);
        const allocatedBytes = Buffer.byteLength(JSON.stringify(newEvents));
        // Atomic daily quota reservation; PostgreSQL INSERT ON CONFLICT DO UPDATE
        // locks the aggregate row. Never rely on a Redis cache for this gate.
        const reserved = await tx.$executeRaw`
          INSERT INTO "MobileTelemetryDailyQuota"
            ("environment", "day", "acceptedEvents", "acceptedBytes")
          VALUES (${input.environment}, ${today}::date, ${newEvents.length}, ${allocatedBytes})
          ON CONFLICT ("environment", "day") DO UPDATE SET
            "acceptedEvents" = "MobileTelemetryDailyQuota"."acceptedEvents" + EXCLUDED."acceptedEvents",
            "acceptedBytes" = "MobileTelemetryDailyQuota"."acceptedBytes" + EXCLUDED."acceptedBytes"
          WHERE "MobileTelemetryDailyQuota"."acceptedEvents" + EXCLUDED."acceptedEvents" <= ${DAILY_EVENTS_CAP}
            AND "MobileTelemetryDailyQuota"."acceptedBytes" + EXCLUDED."acceptedBytes" <= ${DAILY_BYTES_CAP}
        `;
        if (reserved !== 1) throw new MobileTelemetryIngestError('TELEMETRY_DAILY_BUDGET_EXCEEDED', 429);
        const changed = await tx.mobileTelemetryUploadSession.updateMany({
          where:{id:session.id,expiresAt:{gt:input.now},
            usedEvents:{lte:session.eventBudget-newEvents.length}},
          data:{usedEvents:{increment:newEvents.length}},
        });
        if (changed.count !== 1) throw new MobileTelemetryIngestError('TELEMETRY_GRANT_EXHAUSTED', 429);
        const inserted = await tx.mobileTelemetrySpool.createMany({
          data:newEvents.map(e=>({
            eventId:e.eventId, environment:input.environment,
            service:serviceOf(e.platform), platform:e.platform,
            eventKind:e.kind, severity:e.severity, runtimeVersion:e.runtime,
            updateId:e.updateId, appVersion:e.appVersion,
            payload:e as unknown as Prisma.InputJsonValue,
            retentionUntil:new Date(input.now.getTime()+retentionMs(e.severity)),
          })), skipDuplicates:true,
        });
      }
      return {accepted:[...new Set(input.events.map(e=>e.eventId))],newlyInserted:newEvents.length};
        }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000});
      } catch (error) {
        // P2034: a concurrent batch lost a serializable transaction race.
        // Never retry permanent budget violations or invalid event scope.
        if ((error as {code?: unknown})?.code === 'P2034' && retry < 2) continue;
        throw error;
      }
    }
    throw new MobileTelemetryIngestError('TELEMETRY_TRANSACTION_RETRY_EXHAUSTED', 503);
  },
};
