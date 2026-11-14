/** Fail-closed SDK57 diagnostics ingest. Durable ACK is delegated to an atomic
 * repository port. No identity, request payloads or signed URLs cross this port. */
import { createHash, randomBytes } from 'node:crypto';
import { parseMobileTelemetryBatch, type MobileTelemetryBatchV1, type TelemetryPlatform } from '@gafus/types';

import type { TelemetryEnvironment, TelemetryIdentity, UploadGrant, StoreResult, MobileTelemetryRepository } from '@gafus/mobile-ota-server/diagnostics-contracts';
import { MobileTelemetryIngestError } from '@gafus/mobile-ota-server/diagnostics-contracts';
export { MobileTelemetryIngestError } from '@gafus/mobile-ota-server/diagnostics-contracts';
export type { TelemetryEnvironment, TelemetryIdentity, UploadGrant, StoreResult, MobileTelemetryRepository } from '@gafus/mobile-ota-server/diagnostics-contracts';
const FINGERPRINT = /^[a-f\d]{64}$/i;
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const SAFE = /^[a-zA-Z\d_.-]{1,100}$/;
const CHANNEL = /^[a-zA-Z\d_.-]{1,48}$/;
const TOKEN = /^[a-zA-Z\d_-]{43}$/;
const ENVIRONMENTS = new Set(['preview', 'production']);
const PLATFORMS = new Set(['ios', 'android', 'web']);
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

export function parseUploadGrantRequest(input: unknown, environment: TelemetryEnvironment): TelemetryIdentity {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new MobileTelemetryIngestError('BAD_SESSION_BODY', 400);
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some(key => !['platform','appVersion','build','runtime','channel','nativeFingerprint'].includes(key)))
    throw new MobileTelemetryIngestError('SESSION_UNKNOWN_FIELD', 400);
  const {platform, appVersion, build, runtime, channel, nativeFingerprint} = data;
  if (!PLATFORMS.has(platform as string) || typeof appVersion !== 'string' || !VERSION.test(appVersion) ||
      typeof build !== 'string' || !SAFE.test(build) || build.length > 40 ||
      typeof runtime !== 'string' || !SAFE.test(runtime) ||
      typeof channel !== 'string' || !CHANNEL.test(channel) ||
      typeof nativeFingerprint !== 'string' || !FINGERPRINT.test(nativeFingerprint))
    throw new MobileTelemetryIngestError('SESSION_FIELDS_INVALID', 400);
  return {environment, platform: platform as TelemetryPlatform, appVersion, build, runtime,
    channel, nativeFingerprint: nativeFingerprint.toLowerCase()};
}

export function activeTelemetryEnvironment(env: NodeJS.ProcessEnv): TelemetryEnvironment | null {
  if (env.GAFUS_TELEMETRY_INGEST_ENABLED !== 'true') return null;
  const name = env.GAFUS_TELEMETRY_ENVIRONMENT;
  if (!name || !ENVIRONMENTS.has(name)) return null;
  if (name === 'production' && env.GAFUS_TELEMETRY_PRODUCTION_APPROVED !== 'true') return null;
  return name as TelemetryEnvironment;
}

/** Fixed global request ceiling even if Redis/edge is temporarily unavailable.
 * Edge and DB grant budgets are additional independent protections. */
export class TelemetryIngressRateGate {
  private window = 0;
  private global = 0;
  private readonly byPeer = new Map<string, number>();
  constructor(private readonly maxGlobalPerMinute = 240, private readonly maxPeerPerMinute = 20) {}
  consume(peer: string | null, now: number = Date.now()): boolean {
    const slot = Math.floor(now / 60_000);
    if (slot !== this.window) { this.window = slot; this.global = 0; this.byPeer.clear(); }
    if (this.global >= this.maxGlobalPerMinute) return false;
    // Without a trusted, validated reverse-proxy peer identity, apply the
    // global budget only. Otherwise every client shares the 20/min per-peer
    // quota, effectively breaking mobile diagnostics for the entire service.
    if (peer === null) { this.global++; return true; }
    const used = this.byPeer.get(peer) ?? 0;
    if (used >= this.maxPeerPerMinute) return false;
    this.global += 1;
    // Bound map size; overflow consumes only the global budget.
    if (this.byPeer.has(peer) || this.byPeer.size < 5_000) this.byPeer.set(peer, used + 1);
    return true;
  }
}

export function createMobileTelemetryIngest(repository: MobileTelemetryRepository,
  env: NodeJS.ProcessEnv = process.env, now: () => Date = () => new Date()) {
  return {
    async issueUploadGrant(body: unknown): Promise<{token: string; expiresAt: string; maxEvents: number}> {
      const environment = activeTelemetryEnvironment(env);
      if (!environment) throw new MobileTelemetryIngestError('TELEMETRY_DISABLED', 503);
      const identity = parseUploadGrantRequest(body, environment);
      if (!(await repository.isVerifiedRelease(identity)))
        throw new MobileTelemetryIngestError('UNVERIFIED_NATIVE_RELEASE', 403);
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(now().getTime() + 15 * 60_000);
      const eventBudget = 100;
      await repository.createGrant({...identity, tokenHash:sha(token), eventBudget, expiresAt});
      return {token, expiresAt:expiresAt.toISOString(), maxEvents:eventBudget};
    },
    async acceptBatch(authorization: string | undefined, raw: unknown): Promise<StoreResult> {
      const environment = activeTelemetryEnvironment(env);
      if (!environment) throw new MobileTelemetryIngestError('TELEMETRY_DISABLED', 503);
      if (!authorization || !authorization.startsWith('Bearer ') ||
          !TOKEN.test(authorization.slice(7)))
        throw new MobileTelemetryIngestError('TELEMETRY_UPLOAD_GRANT_REQUIRED', 401);
      let batch: MobileTelemetryBatchV1;
      try { batch = parseMobileTelemetryBatch(raw); }
      catch { throw new MobileTelemetryIngestError('TELEMETRY_INVALID_BATCH', 400); }
      try {
        return await repository.persistBatch({tokenHash:sha(authorization.slice(7)), events:batch.events,
          environment, now:now()});
      } catch (error) {
        if (error instanceof MobileTelemetryIngestError) throw error;
        // Repository failure must never report ACK before durable commit.
        throw new MobileTelemetryIngestError('TELEMETRY_STORAGE_UNAVAILABLE', 503);
      }
    },
  };
}
