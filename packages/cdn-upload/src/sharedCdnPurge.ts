import { createHash } from 'node:crypto';
import { beginBegetCdnPurge, begetCdnPurgeDone, isBegetCacheableObjectKey } from './begetCdnPurge';
import { cdnRequest } from './yandexCdnRequest';

type Scope = 'gallery' | 'feed';
const resource = 'bc8rr3yxsrkobnonoi2w';
const sharedHost = 'https://cdn.gafus.ru';
const receipt = /^yandex:([a-f0-9]{64}):([A-Za-z0-9_-]{1,128}):(\d{13}):(gallery|feed):([A-Za-z0-9_-]+)$/;
const hash = (scope: Scope, paths: string[]) => createHash('sha256').update(JSON.stringify({resource, scope, paths})).digest('hex');
function validate(scope: Scope, paths: string[]) {
  if (!paths.length || paths.some(p => typeof p !== 'string' || !p.startsWith('/') || !isBegetCacheableObjectKey(scope, p.slice(1))))
    throw Error('SHARED_CDN_UNSAFE_PATH');
}
function configured(scope: Scope, env: NodeJS.ProcessEnv = process.env) {
  const prefix = scope.toUpperCase();
  if (env.YANDEX_SHARED_CDN_RESOURCE_ID !== resource || env.YANDEX_SHARED_CDN_PURGE_VERIFIED !== 'true' ||
      env.YANDEX_SHARED_CDN_EDGE_VERIFIED !== 'true' || !(env.CDN_CLEANUP_SERVICE_ACCOUNT_KEY_B64 || env.CDN_CLEANUP_SERVICE_ACCOUNT_KEY) ||
      (env[`${prefix}_CDN_PROVIDER`] === 'yandex' && env[`${prefix}_CDN_BASE_URL`] !== sharedHost))
    throw Error('SHARED_CDN_PURGE_UNVERIFIED');
}
// During a temporary migration, both edges may retain bytes. Always retain
// the old Beget proof; the additional exact-path Yandex receipt is durable.
export function requiresSharedCdnPurge(scope: Scope, env: NodeJS.ProcessEnv = process.env) {
  return env[`${scope.toUpperCase()}_CDN_PROVIDER`] === 'yandex' || env.YANDEX_SHARED_CDN_DUAL_PURGE === 'true';
}
export async function beginSharedCdnPurge(scope: Scope, paths: string[], existing: string[],
  checkpoint?: (operations: string[]) => Promise<void>): Promise<string[]> {
  validate(scope, paths);
  const shared = requiresSharedCdnPurge(scope) || existing.some(op => op.replace(/^done:/, '').startsWith('yandex:'));
  const operations = [...existing];
  if (shared) {
    configured(scope);
    for (let i=0; i<paths.length; i+=10) {
      const batch = paths.slice(i,i+10), digest = hash(scope,batch);
      if (operations.some(op => op.replace(/^done:/,'').startsWith(`yandex:${digest}:`))) continue;
      const result = await cdnRequest(`cache/${resource}:purge`, {paths:batch});
      if (!result.id || !/^[A-Za-z0-9_-]{1,128}$/.test(result.id)) throw Error('SHARED_CDN_INVALID_OPERATION');
      operations.push(`yandex:${digest}:${result.id}:${Date.now()}:${scope}:${Buffer.from(JSON.stringify(batch)).toString('base64url')}`);
      await checkpoint?.([...operations]);
    }
  }
  return beginBegetCdnPurge(scope,paths,operations,checkpoint);
}
export function expectedSharedCdnReceipts(scope: Scope, paths: string[], operations: string[]) {
  return Math.ceil(paths.length/10) * (requiresSharedCdnPurge(scope) || operations.some(op => op.replace(/^done:/,'').startsWith('yandex:')) ? 2 : 1);
}
export async function sharedCdnPurgeDone(operation: string, now = Date.now(), env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!operation.startsWith('yandex:')) return begetCdnPurgeDone(operation,now,env,fetcher);
  const m = receipt.exec(operation);
  if (!m) throw Error('SHARED_CDN_INVALID_OPERATION');
  const scope=m[4] as Scope, created=Number(m[3]);
  let paths: unknown;
  try { paths=JSON.parse(Buffer.from(m[5]!, 'base64url').toString('utf8')); } catch { throw Error('SHARED_CDN_INVALID_OPERATION'); }
  if (!Array.isArray(paths) || paths.length>10) throw Error('SHARED_CDN_INVALID_OPERATION');
  validate(scope,paths);
  if (hash(scope,paths)!==m[1] || created>now || created<1_600_000_000_000) throw Error('SHARED_CDN_INVALID_OPERATION');
  configured(scope,env);
  if (!(await cdnRequest(`operations/${m[2]}`)).done || now-created<900_000) return false;
  const secret=scope==='gallery' ? env.GALLERY_CDN_REDIRECT_SIGNING_SECRET : env.FEED_CDN_SECRET;
  if (!secret || !/^[A-Za-z0-9_-]{24,32}$/.test(secret)) throw Error('SHARED_CDN_EDGE_PROOF_UNAVAILABLE');
  const expires=Math.floor(now/1000)+90;
  for (const path of paths) {
    const md5=createHash('md5').update(`${expires}${path} ${secret}`).digest('base64url');
    const url=`${sharedHost}${path}?md5=${md5}&expires=${expires}`;
    for (const candidate of scope==='feed' ? [url, `${sharedHost}${path}`] : [url]) {
      for (const method of ['HEAD','GET'] as const) {
        const r=await fetcher(candidate,{method,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(7000)});
        void r.body?.cancel();
        if (r.status!==404) return false;
      }
    }
  }
  return true;
}
