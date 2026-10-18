/** Mandatory pre-deploy, READ ONLY configuration check. Validates the NEW Beget
 * private Gallery CDN before the same commit deploys its GAFUS API origin.
 */
import {pathToFileURL} from 'node:url';
const ID='10530e64-21b7-4352-8366-806c79c2f1b7';
const HOST='dikinuneceswe.begetcdn.cloud';
export async function checkGalleryNewEdgeSettings(env=process.env, fetchImpl=fetch){
  if(env.GALLERY_CDN_REDIRECT_ENABLED!=='true') return {enabled:false};
  const key=env.GALLERY_CDN_REDIRECT_SIGNING_SECRET??'';
  const originSecret=env.GALLERY_CDN_REDIRECT_ORIGIN_SECRET??'';
  const apiToken=env.BEGET_CDN_API_TOKEN??'';
  if(env.GALLERY_CDN_ORIGIN_ROUTE_ENABLED!=='true'||
    !/^[A-Za-z0-9]{24,128}$/.test(key)||
    !/^[A-Za-z0-9]{32,128}$/.test(originSecret)||apiToken.length<24)
    throw Error('GALLERY_NEW_EDGE_REQUIRED_SECRETS_OR_ROUTE_MISSING');
  const r=await fetchImpl(`https://api.beget.com/v1/cloud/${ID}`,{
    headers:{Authorization:`Bearer ${apiToken}`},signal:AbortSignal.timeout(12000),
  });
  if(r.status!==200)throw Error(`GALLERY_NEW_EDGE_API_${r.status}`);
  const obj=await r.json();const cdn=obj.service?.cdn,s=cdn?.settings;
  if(obj.service?.display_name!=='GAFUS Gallery S3 redirect test'||
    cdn?.source_domain?.domain!=='api.gafus.ru'||
    !cdn.resource_domain?.some(x=>x.domain===HOST&&x.status==='WORKING')||
    s?.follow_origin_redirect?.enable!==true||
    s?.tokenized_url_secure_key?.enable!==true||
    s.tokenized_url_secure_key.key!==key||
    s?.static_request_headers?.enabled!==true||
    s.static_request_headers.value?.['x-gafus-gallery-origin-secret']!==originSecret||
    s.caching_time!==600||s?.caching_time_browser?.enable!==false||
    s?.static_response_headers?.enable!==false)
    throw Error('GALLERY_NEW_EDGE_CONFIG_MISMATCH');
  return {enabled:true,https:'WORKING',origin:'api.gafus.ru',secureToken:true,
    secureOriginHeader:true,follows307:true,edgeCacheSeconds:600};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log('GALLERY_NEW_EDGE_PREFLIGHT_PASS',JSON.stringify(await checkGalleryNewEdgeSettings()));}
  catch(e){console.error('GALLERY_NEW_EDGE_PREFLIGHT_BLOCKED',e instanceof Error?e.message:'UNKNOWN');process.exitCode=1;}
}
