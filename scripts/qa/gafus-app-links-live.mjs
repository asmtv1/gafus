/** Read-only production smoke, run AFTER publishing .well-known at apex/www.
 * Neither endpoint should redirect or return SPA HTML. No server mutations.
 */
import { readFileSync } from 'node:fs';
export const destinations=['gafus.ru','www.gafus.ru'];
export const associations=[
  '/.well-known/apple-app-site-association',
  '/.well-known/assetlinks.json',
];

export async function verifyLiveDomainLinks({fetchImpl=fetch,expected,
  hosts=destinations,paths=associations}={}) {
  if(!expected) throw Error('APP_LINK_LIVE_EXPECTATIONS_REQUIRED');
  const results=[];
  for(const host of hosts) for(const route of paths) {
    const target=`https://${host}${route}`;
    let response;
    try {
      response=await fetchImpl(target,{method:'GET',redirect:'manual',
        headers:{Accept:'application/json'},signal:AbortSignal.timeout(6000)});
    } catch(e) { throw Error(`APP_LINK_DOMAIN_UNREACHABLE:${host}:${route}`); }
    if(response.status!==200 || response.redirected || response.headers.get('location'))
      throw Error(`APP_LINK_HTTP_NOT_DIRECT_200:${host}:${route}:${response.status}`);
    if(response.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
      throw Error(`APP_LINK_INVALID_CONTENT_TYPE:${host}:${route}`);
    let body;
    try { body=await response.json(); }
    catch { throw Error(`APP_LINK_BODY_NOT_JSON:${host}:${route}`); }
    const reference=expected[route];
    if(JSON.stringify(body)!==JSON.stringify(reference))
      throw Error(`APP_LINK_LIVE_DOCUMENT_MISMATCH:${host}:${route}`);
    results.push(target);
  }
  return results;
}

export function expectedSourceFiles() {
  return {
    [associations[0]]: JSON.parse(readFileSync('apps/web-vite/public/.well-known/apple-app-site-association','utf8')),
    [associations[1]]: JSON.parse(readFileSync('apps/web-vite/public/.well-known/assetlinks.json','utf8')),
  };
}
