/** Temporary min-one-instance for Cloud.ru TEST feed Origin; not production. */
const e=process.env;
const name='gafus-feed-origin-staging';
const action=process.argv[2];
if(!['--warm','--idle'].includes(action) ||
 e.CLOUDRU_STAGING_WARM_CONFIRM!=='temporary-feed-only')throw Error('WARM_NOT_APPROVED');
const a=await fetch('https://iam.api.cloud.ru/api/v1/auth/token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({keyId:e.CLOUDRU_KEY_ID,secret:e.CLOUDRU_KEY_SECRET})});if(!a.ok)throw Error('AUTH_DENIED');const token=(await a.json()).access_token;
const url=`https://containers.api.cloud.ru/v2/containers/${name}?projectId=${e.CLOUDRU_PROJECT_ID}`;
const getUrl=`https://containers.api.cloud.ru/v1/containers/${name}?projectId=${e.CLOUDRU_PROJECT_ID}`;
const request=async(method,target,body)=>{
 const r=await fetch(target,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
 if(!r.ok){console.log('WARM_HTTP_ERROR',r.status);throw Error('WARM_API_DENIED')}
 return r.json();
};
const current=await request('GET',getUrl);
if(current.name!==name||!current.template?.containers?.[0]?.image?.includes('gafus-feed-origin-stageonly@sha256:')||
 current.configuration?.ingress?.publiclyAccessible!==true)throw Error('UNEXPECTED_ORIGIN_IMAGE_OR_SCOPE');
const expected=action==='--warm'?1:0;
const previous=current.template.scaling.minInstanceCount;
if(![0,1].includes(previous))throw Error('UNEXPECTED_SCALING');
if(previous===expected){console.log(JSON.stringify({name,minInstances:expected,alreadyCorrect:true}));process.exit(0);}
current.template.scaling.minInstanceCount=expected;
const op=await request('PATCH',url,current);
console.log(JSON.stringify({name,from:previous,to:expected,operationId:op.id??null}));
