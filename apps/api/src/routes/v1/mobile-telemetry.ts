import { Hono, type Context } from 'hono';
import {
  activeTelemetryEnvironment, createMobileTelemetryIngest,
  MobileTelemetryIngestError, TelemetryIngressRateGate,
} from '../../modules/mobile-telemetry/ingest.js';
import { prismaMobileTelemetryRepository } from '../../modules/mobile-telemetry/prisma-repository.js';

const MAX_SESSION_BYTES = 2048;
const MAX_BATCH_BYTES = 256 * 1024;
const defaultRateGate = new TelemetryIngressRateGate();

class InvalidTelemetryBody extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
export async function decodeBoundedJson(request: Request, limit: number): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.toLowerCase().split(';')[0]?.trim();
  if (contentType !== 'application/json' ||
    (request.headers.get('content-encoding') ?? 'identity').toLowerCase() !== 'identity')
    throw new InvalidTelemetryBody(415, 'TELEMETRY_UNSUPPORTED_CONTENT_TYPE');
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d{1,9}$/.test(declared) || Number(declared) > limit))
    throw new InvalidTelemetryBody(413, 'TELEMETRY_PAYLOAD_TOO_LARGE');
  const stream = request.body;
  if (!stream) throw new InvalidTelemetryBody(400, 'TELEMETRY_EMPTY_BODY');
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > limit) { void reader.cancel(); throw new InvalidTelemetryBody(413, 'TELEMETRY_PAYLOAD_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!bytes) throw new InvalidTelemetryBody(400, 'TELEMETRY_EMPTY_BODY');
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(combined)); }
  catch { throw new InvalidTelemetryBody(400, 'TELEMETRY_JSON_INVALID'); }
}

/** Routes stay disabled without explicit environment-scoped server switch.
 * This path is independent from login/refresh/payment/GPS APIs. */
export function createMobileTelemetryRoutes(options: {
  ingest?: ReturnType<typeof createMobileTelemetryIngest>;
  rateGate?: TelemetryIngressRateGate;
  env?: NodeJS.ProcessEnv;
} = {}) {
  const env = options.env ?? process.env;
  const ingest = options.ingest ?? createMobileTelemetryIngest(prismaMobileTelemetryRepository, env);
  const rate = options.rateGate ?? defaultRateGate;
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store, max-age=0');
    c.header('Pragma', 'no-cache');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Content-Type-Options', 'nosniff');
    await next();
  });
  async function accept(c: Context, kind: 'session'|'batch') {
    if (!activeTelemetryEnvironment(env)) return c.json({error:'TELEMETRY_DISABLED'}, 503);
    // Edge must strip or overwrite these headers before enabling trust.
    const peer = env.GAFUS_TELEMETRY_TRUST_PROXY_PEER === 'true'
      ? c.req.header('CF-Connecting-IP') ?? null
      : null;
    if (!rate.consume(peer)) {
      c.header('Retry-After', '60');
      return c.json({error:'TELEMETRY_RATE_LIMITED'}, 429);
    }
    try {
      const payload = await decodeBoundedJson(c.req.raw, kind === 'session' ? MAX_SESSION_BYTES : MAX_BATCH_BYTES);
      if (kind === 'session') {
        const grant = await ingest.issueUploadGrant(payload);
        return c.json(grant, 201);
      }
      const stored = await ingest.acceptBatch(c.req.header('Authorization'), payload);
      // IDs only, no echo of stack/message/context from the request.
      return c.json({schemaVersion:1, durable:true, accepted:stored.accepted}, 202);
    } catch (error) {
      if (error instanceof MobileTelemetryIngestError) return c.json({error:error.code}, error.status as 400);
      if (error instanceof InvalidTelemetryBody) return c.json({error:error.code}, error.status as 400);
      // Do not log raw errors or input: DB/provider messages may contain PII.
      return c.json({error:'TELEMETRY_TEMPORARILY_UNAVAILABLE'}, 503);
    }
  }
  app.post('/mobile/session', c => accept(c, 'session'));
  app.post('/mobile', c => accept(c, 'batch'));
  return app;
}

export const mobileTelemetryRoutes = createMobileTelemetryRoutes();
