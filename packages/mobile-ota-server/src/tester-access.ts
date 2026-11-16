/** Short-lived HMAC grant for the two explicitly authorized GAFUS test accounts.
 * The anonymous Expo manifest endpoint NEVER trusts a username from the client.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const B64 = /^[a-zA-Z0-9_-]{1,600}$/;
const TTL_SECONDS = 15 * 60;
const FINGERPRINT = /^[a-f0-9]{64}$/i;
const RUNTIME = /^\d+\.\d+\.\d+$/;
export const OTA_TESTER_EXTRA_PARAM = 'gafus-tester-grant';
export const OTA_TESTER_ACCOUNTS = ['admin', 'asmtv1'] as const;

export function isOtaTesterAccount(username: string | null | undefined): boolean {
  return username === 'admin' || username === 'asmtv1';
}
function key(secret: string): Buffer | null {
  if (secret.length < 32) return null;
  return createHmac('sha256', secret).update('gafus-ota-tester-grant-v1').digest();
}
function signature(content: string, secret: Buffer): string {
  return createHmac('sha256', secret).update(content).digest('base64url');
}
export function issueOtaTesterGrant(input: {
  userId: string; username: string; installationId: string;
  platform: 'ios'|'android'; runtimeVersion: string; nativeFingerprint: string;
}, secret: string, nowSeconds = Math.floor(Date.now()/1000)): string | null {
  const k=key(secret);
  if (!k || !isOtaTesterAccount(input.username) || !input.userId || input.userId.length>128 ||
      !UUID.test(input.installationId) || !['ios','android'].includes(input.platform) ||
      !RUNTIME.test(input.runtimeVersion) || !FINGERPRINT.test(input.nativeFingerprint)) return null;
  const payload = Buffer.from(JSON.stringify({v:1,sub:input.userId,
    installationId:input.installationId.toLowerCase(),platform:input.platform,
    runtime:input.runtimeVersion,fingerprint:input.nativeFingerprint.toLowerCase(),exp:nowSeconds+TTL_SECONDS})).toString('base64url');
  const signed=`v1.${payload}`;
  return `${signed}.${signature(signed,k)}`;
}
export function verifyOtaTesterGrant(token: string | null | undefined,
  installationId: string | null, secret: string,
  context: {platform:'ios'|'android';runtimeVersion:string;nativeFingerprint:string},
  nowSeconds = Math.floor(Date.now()/1000)): boolean {
  const k=key(secret);
  if (!k || !installationId || !UUID.test(installationId) || !token || token.length > 768) return false;
  const parts=token.split('.');
  if (parts.length!==3 || parts[0]!=='v1' || !B64.test(parts[1]!) || !/^[\w-]{43}$/.test(parts[2]!)) return false;
  const supplied=Buffer.from(parts[2]!, 'base64url');
  const expected=Buffer.from(signature(`v1.${parts[1]}`,k),'base64url');
  if (supplied.length!==expected.length || !timingSafeEqual(supplied,expected)) return false;
  try {
    const parsed:unknown=JSON.parse(Buffer.from(parts[1]!,'base64url').toString('utf8'));
    if (!parsed || typeof parsed!=='object' || Array.isArray(parsed)) return false;
    const p=parsed as Record<string,unknown>;
    return p.v===1 && typeof p.sub==='string' && !!p.sub &&
      p.installationId===installationId.toLowerCase() &&
      p.platform===context.platform && p.runtime===context.runtimeVersion &&
      p.fingerprint===context.nativeFingerprint.toLowerCase() &&
      typeof p.exp==='number' && Number.isSafeInteger(p.exp) &&
      p.exp > nowSeconds && p.exp <= nowSeconds + TTL_SECONDS;
  } catch { return false; }
}
/** Expo sends a Structured Field Values dictionary. Ignore malformed/duplicate grants. */
export function parseOtaTesterGrant(params: string | undefined): string | null {
  if (!params || params.length > 1400 || /[\r\n]/.test(params)) return null;
  const entries=params.split(',').map(s=>s.trim());
  const relevant=entries.filter(item=>item.startsWith(OTA_TESTER_EXTRA_PARAM) &&
    /^[a-z-]+(?:\s|=)/.test(item));
  if (relevant.length!==1) return null;
  const match=new RegExp(`^${OTA_TESTER_EXTRA_PARAM}="([A-Za-z0-9_.-]{1,768})"$`).exec(relevant[0]!);
  return match?.[1] ?? null;
}
