/** Real Yandex CDN failure statuses against shared Web/Mobile classification. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import { probeCdnOutage } from '../../packages/core/src/services/mediaDelivery/index';
const env=parse(await readFile(new URL('../../.env', import.meta.url)));const secret=env.TF_VAR_cdn_secret;
if(!/^[A-Za-z0-9_-]{6,32}$/.test(secret??''))throw Error('STAGING_CDN_SECRET_MISSING');
const path='/albums/isolated_probe/absent/photos/no_object/full.webp';
const exp=Math.floor(Date.now()/1000)+100;
function url(expires:number,md5=createHash('md5').update(`${expires}${path} ${secret}`).digest('base64url')){
  return `https://gallery-dev.gafus.ru${path}?md5=${md5}&expires=${expires}`;
}
const cases=[['valid_missing',url(exp)],['expired',url(exp-220)],['tampered',url(exp,'A'.repeat(22))]];
for(const [kind,target] of cases){
 const r=await fetch(target,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(16000)});
 const fallback=await probeCdnOutage(target,{timeoutMs:9000});
 const expected=r.status>=500&&r.status<600;
 console.log(JSON.stringify({case:kind,status:r.status,shouldFallback:expected,actualFallback:fallback}));
 if(expected!==fallback)throw Error('LIVE_CLIENT_FALLBACK_CLASSIFICATION_MISMATCH');
}
console.log('REAL_YANDEX_CDN_WEB_MOBILE_OUTAGE_CLASSIFICATION=PASS');
