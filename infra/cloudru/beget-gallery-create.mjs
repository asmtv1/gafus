/** Create exactly one UNUSED CDN pointed to Hono API. Existing CDNs are NEVER edited. */
const mode = process.argv[2] ?? '--plan';
if (!['--plan','--apply'].includes(mode) || process.argv.length > 3)
  throw Error('INVALID_GALLERY_CDN_CREATE_MODE');
const NAME = 'GAFUS Gallery SigV4 Hono Redirect';
const ORIGIN = 'api.gafus.ru';
const SOURCE = { source_service_type: 'DOMAIN', domain: ORIGIN, source_protocol: 'HTTPS' };
if (mode === '--plan') {
  console.log(JSON.stringify({mode,createsAtMost:1, name:NAME, origin:ORIGIN,
    resource:'CDN', privateBucketUnchanged:true, existingCdnsUntouched:true}));
  process.exit(0);
}
if (process.env.GITHUB_REF !== 'refs/heads/chore/gallery-cdn-307-migration' ||
    process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    process.env.GALLERY_CDN_CREATE_CONFIRM !== 'CREATE_ISOLATED_GALLERY_CDN_2026_11_01')
  throw Error('GALLERY_CDN_CREATE_NOT_APPROVED');
const token=process.env.BEGET_CDN_API_TOKEN ?? '';
if (token.length<24) throw Error('GALLERY_CDN_NO_API_TOKEN');
async function api(path,method='GET',body) {
  const response=await fetch('https://api.beget.com'+path,{
    method, headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},
    body:body ? JSON.stringify(body) : undefined,
    redirect:'error',signal:AbortSignal.timeout(12000),
  });
  if(!response.ok){await response.body?.cancel();throw Error('BEGET_CDN_HTTP_'+response.status);}
  return await response.json();
}
function inspect(row){
  return {id:row.id,name:row.display_name,status:row.status,
    origin:row.cdn?.source_domain?.domain, protocol:row.cdn?.source_domain?.source_protocol,
    host:row.cdn?.resource_domain?.find(v=>v.domain?.endsWith('.begetcdn.cloud'))?.domain};
}
const list=(await api('/v1/cloud')).service ?? [];
if (!Array.isArray(list)) throw Error('BEGET_CDN_LIST_INVALID');
const current=list.filter(row=>row?.type==='CDN'&&row.display_name===NAME);
if (current.length>1) throw Error('GALLERY_CDN_DUPLICATE_NAME');
if(current.length===1){
  const v=inspect(current[0]);
  if(v.origin!==ORIGIN||v.protocol!=='HTTPS'||!v.id||!v.host) throw Error('GALLERY_CDN_EXISTING_MISMATCH');
  console.log('GALLERY_CDN_EXISTS_SAFE',JSON.stringify(v));process.exit(0);
}
const data=await api('/v1/cloud','POST',{
  configuration_id:'cdn_v1',display_name:NAME,
  cdn_params:{source_params:SOURCE},
});
if(data?.cdn_error || !data?.service?.id) {
  // Beget may respond 200 with a structured validation error. Never expose
  // user-entered strings, credentials, full payloads, or arbitrary server text.
  console.log('CREATE_RESPONSE_SHAPE',Object.keys(data??{}));
  const err=data?.cdn_error;
  if(err) console.log('CREATE_ERROR_SHAPE',Object.keys(err),
    'ERROR_TYPE',typeof err.error,'ERROR_CODE',String(err.error?.code??'none').slice(0,50),
    'DOMAIN_ERROR_COUNT',Array.isArray(err.domain_error)?err.domain_error.length:0);
  throw Error('GALLERY_CDN_CREATE_UNVERIFIED');
}
const id=data.service.id;
if(!/^[a-f0-9-]{36}$/.test(id)) throw Error('GALLERY_CDN_CREATE_INVALID_ID');
const detail=(await api('/v1/cloud/'+id)).service;
if(!detail || detail.type!=='CDN' || detail.display_name!==NAME ||
   detail.cdn?.source_domain?.domain!==ORIGIN ||
   detail.cdn?.source_domain?.source_protocol!=='HTTPS') throw Error('GALLERY_CDN_CREATE_READBACK_MISMATCH');
const view=inspect(detail);
console.log('GALLERY_CDN_CREATED_UNCONFIGURED',JSON.stringify(view));
console.log('GALLERY_CDN_NOT_READY_FOR_VIEWERS');
