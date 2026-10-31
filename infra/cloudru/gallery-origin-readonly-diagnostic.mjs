/** Read-only inspection of the existing Cloud.ru Gallery Origin.
 * Never log credential values, signed URLs, or full provider JSON.
 */
const e=process.env;
if(!e.CLOUDRU_KEY_ID||!e.CLOUDRU_KEY_SECRET||!e.CLOUDRU_PROJECT_ID)
  throw Error('CLOUDRU_ORIGIN_DIAG_MISSING_CREDENTIALS');
const auth=await fetch('https://iam.api.cloud.ru/api/v1/auth/token',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({keyId:e.CLOUDRU_KEY_ID,secret:e.CLOUDRU_KEY_SECRET}),
  signal:AbortSignal.timeout(12000)
});
if(!auth.ok)throw Error('CLOUDRU_IAM_HTTP_'+auth.status);
const bearer=(await auth.json()).access_token;
if(!bearer)throw Error('CLOUDRU_IAM_NO_ACCESS_TOKEN');
for(const name of ['gafus-gallery-origin','gafus-feed-origin']){
  const url=new URL('https://containers.api.cloud.ru/v1/containers/'+name);
  url.searchParams.set('projectId',e.CLOUDRU_PROJECT_ID);
  const res=await fetch(url,{headers:{authorization:'Bearer '+bearer},signal:AbortSignal.timeout(15000)});
  if(!res.ok){console.log(JSON.stringify({name,getHttp:res.status}));continue;}
  const json=await res.json();
  const cn=json.template?.containers?.[0]??{};
  const env=Object.fromEntries((cn.env??[]).filter(x=>x.name).map(x=>[x.name,x.value]));
  const target=name.includes('gallery')?'GALLERY':'FEED';
  console.log(JSON.stringify({
    name,getHttp:res.status,remoteStatus:json.status,
    imageHasDigest:/@sha256:[a-f0-9]{64}$/.test(cn.image??''),
    imageRepository:(cn.image??'').split('@')[0].split(':')[0],
    configuredBucket:env[target+'_BUCKET']??null,
    configuredEndpoint:env[target+'_S3_ENDPOINT']??null,
    s3AccessKeyPresent:Boolean(env[target+'_S3_ACCESS_KEY_ID']),
    s3SecretPresent:Boolean(env[target+'_S3_SECRET_ACCESS_KEY']),
    originHeaderSecretPresent:Boolean(env[target+'_ORIGIN_SECRET']),
    cdnSecretPresent:Boolean(env[target+'_CDN_SECRET']),
    replicaMin:json.template?.scaling?.minInstanceCount??null,
    replicaMax:json.template?.scaling?.maxInstanceCount??null
  }));
}

// Route discovery with OPTIONS only: NEVER invoke a mutating endpoint.
const candidateRoutes=[
 '/v1/containers/gafus-gallery-origin/resume',
 '/v2/containers/gafus-gallery-origin/resume',
 '/v1/containers/gafus-gallery-origin:start',
 '/v2/containers/gafus-gallery-origin:start',
 '/v1/containers/gafus-gallery-origin:resume',
 '/v2/containers/gafus-gallery-origin:resume',
 '/v1/containers/gafus-gallery-origin/start',
 '/v2/containers/gafus-gallery-origin/start',
];
for(const route of candidateRoutes){
  try{
    const url='https://containers.api.cloud.ru'+route+'?projectId='+encodeURIComponent(e.CLOUDRU_PROJECT_ID);
    const response=await fetch(url,{method:'OPTIONS',headers:{authorization:'Bearer '+bearer},signal:AbortSignal.timeout(8000)});
    console.log(JSON.stringify({method:'OPTIONS',route,status:response.status,
      allow:response.headers.get('allow')}));
    await response.body?.cancel();
  }catch(ex){console.log(JSON.stringify({method:'OPTIONS',route,errorType:ex?.name??'unknown'}));}
}

// GET discovery only. No POST/PATCH until a documented exact action is confirmed.
for(const route of [
 '/v1/containers/gafus-gallery-origin',
 '/v2/containers/gafus-gallery-origin',
 '/v1/containers/gafus-gallery-origin/resume',
 '/v2/containers/gafus-gallery-origin/resume',
 '/v1/containers/gafus-gallery-origin:resume',
 '/v2/containers/gafus-gallery-origin:resume'
]){
  const url='https://containers.api.cloud.ru'+route+'?projectId='+encodeURIComponent(e.CLOUDRU_PROJECT_ID);
  try{
    const r=await fetch(url,{method:'GET',headers:{authorization:'Bearer '+bearer},redirect:'error',signal:AbortSignal.timeout(9000)});
    console.log(JSON.stringify({method:'GET',route,http:r.status,allow:r.headers.get('allow')}));
    await r.body?.cancel();
  }catch(x){console.log(JSON.stringify({method:'GET',route,error:x?.name??'unknown'}));}
}
