/** Only the isolated, pre-verified NEW Gallery CDN may be changed. Never modify old services. */
const id='96cd124e-767e-4af1-a568-c4d1f9b4e73f';
const host='fupiquafifeswu.begetcdn.cloud';
const name='GAFUS Gallery SigV4 Hono Redirect';
if (process.env.GITHUB_REF!=='refs/heads/chore/gallery-cdn-307-migration' ||
  process.env.GITHUB_EVENT_NAME!=='workflow_dispatch' ||
  process.env.GALLERY_CDN_CONFIGURE_CONFIRM!=='SECURE_NEW_GALLERY_CDN_2026_11_01')
  throw Error('GALLERY_CDN_CONFIGURATION_NOT_APPROVED');
const token=process.env.BEGET_CDN_API_TOKEN ?? '';
const edge=process.env.GALLERY_CDN_REDIRECT_SIGNING_SECRET ?? '';
const origin=process.env.GALLERY_CDN_REDIRECT_ORIGIN_SECRET ?? '';
if(token.length<24 || !/^[A-Za-z0-9_-]{24,32}$/.test(edge) ||
    !/^[A-Za-z0-9]{32,128}$/.test(origin) || edge===origin)
  throw Error('GALLERY_CDN_CONFIGURATION_SECRETS_UNAVAILABLE');
async function call(path,method='GET',body){
 const r=await fetch('https://api.beget.com'+path,{
   method,headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},
   body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(12000),
 });
 if(!r.ok){await r.body?.cancel();throw Error('GALLERY_CDN_API_HTTP_'+r.status);}
 return r.json();
}
function verifyIdentity(s){
 if(s?.id!==id || s?.display_name!==name || s?.type!=='CDN' ||
    s?.cdn?.source_domain?.domain!=='api.gafus.ru' ||
    s?.cdn?.source_domain?.source_protocol!=='HTTPS' ||
    !s?.cdn?.resource_domain?.some(v=>v.domain===host)) throw Error('GALLERY_CDN_WRONG_TARGET');
}
let s=(await call('/v1/cloud/'+id)).service;
verifyIdentity(s);
const settings={
  follow_origin_redirect:{enable:true},
  tokenized_url_secure_key:{enable:true,key:edge,include_ip:false},
  static_request_headers:{enabled:true,value:{'x-gafus-gallery-origin-secret':origin}},
  caching_time:600,
  caching_time_browser:{enable:true,time:180},
  stale:{enable:false,type:[]},
  redirect_http_to_https:true,
};
const previous=s.cdn.settings??{};
const expected=previous.tokenized_url_secure_key?.enable===true &&
  previous.tokenized_url_secure_key?.key===edge &&
  previous.static_request_headers?.enabled===true &&
  previous.static_request_headers?.value?.['x-gafus-gallery-origin-secret']===origin &&
  previous.follow_origin_redirect?.enable===true && previous.caching_time===600 &&
  previous.caching_time_browser?.enable===true && previous.caching_time_browser?.time===180 &&
  previous.stale?.enable===false;
if(!expected){
  const result=await call('/v1/cloud/cdn/'+id+'/setting','POST',{service_id:id,settings});
  if(result?.error || !result?.cdn){
   console.log('GALLERY_CDN_SETTINGS_RESULT',Object.keys(result??{}),
     'ERROR_CODE',String(result?.error?.code??'NONE').slice(0,50));
   throw Error('GALLERY_CDN_SETTINGS_CHANGE_UNVERIFIED');
  }
}
s=(await call('/v1/cloud/'+id)).service;
verifyIdentity(s);
const x=s.cdn.settings??{};
if(x.follow_origin_redirect?.enable!==true ||
   x.tokenized_url_secure_key?.enable!==true || x.tokenized_url_secure_key?.key!==edge ||
   x.static_request_headers?.enabled!==true ||
   x.static_request_headers?.value?.['x-gafus-gallery-origin-secret']!==origin ||
   x.caching_time!==600 || x.caching_time_browser?.enable!==true || x.caching_time_browser?.time!==180 ||
   x.stale?.enable!==false || x.redirect_http_to_https!==true)
  throw Error('GALLERY_CDN_SETTINGS_READBACK_FAILED');
console.log('GALLERY_CDN_SECURITY_CONFIGURED_AND_VERIFIED',JSON.stringify({
 id,host,status:s.status,origin:s.cdn.source_domain.domain,
 follow307:true,edgeToken:true,originHeader:true,cacheSeconds:600,browserCacheSeconds:180,
 staleDisabled:true,httpsOnly:true }));
console.log('GALLERY_CDN_STILL_NOT_ACTIVATED_IN_APP');
