/** Shared protocol contracts for the server-only telemetry persistence adapter.
 * Browser/mobile consumers must never import the Prisma implementation. */
import type { MobileTelemetryBatchV1, MobileTelemetryEventV1, TelemetryPlatform } from '@gafus/types';

export type TelemetryEnvironment = 'preview' | 'production';
export type TelemetryIdentity = {
  environment: TelemetryEnvironment;
  platform: TelemetryPlatform;
  appVersion: string;
  build: string;
  runtime: string;
  channel: string;
  nativeFingerprint: string;
};
export type UploadGrant = TelemetryIdentity & {
  tokenHash: string;
  eventBudget: number;
  expiresAt: Date;
};
export type StoreResult = { accepted: string[]; newlyInserted: number };
export interface MobileTelemetryRepository {
  isVerifiedRelease(identity: TelemetryIdentity): Promise<boolean>;
  createGrant(input: UploadGrant): Promise<void>;
  persistBatch(input: {tokenHash: string; events: MobileTelemetryBatchV1['events'];
    environment: TelemetryEnvironment; now: Date}): Promise<StoreResult>;
}
export class MobileTelemetryIngestError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

export type ObserveReleaseScope={
  platform:'ios'|'android';appVersion:string;build:string;
  runtime:string;channel:string;environment:'preview';
};

export class ObservePreviewStoreError extends Error {
  constructor(readonly code:string,readonly status:number){super(code);}
}

export interface ObservePreviewRepository {
  store(events:MobileTelemetryEventV1[], scopes:ObserveReleaseScope[],now?:Date):Promise<number>;
}
