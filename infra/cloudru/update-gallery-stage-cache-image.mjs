const e=process.env;
const name='gafus-gallery-origin-staging';
if(e.GAFUS_STAGE_ORIGIN_UPDATE!=='synthetic-only' || !e.CLOUDRU_PROJECT_ID)throw Error('NO_STAGING_CONFIRM');
const auth=await fetch('https://iam.api.cloud.ru/api/v1/auth/token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({keyId:e.CLOUDRU_KEY_ID,secret:e.CLOUDRU_KEY_SECRET})});if(!auth.ok)throw Error('IAM_FAILED');
const token=(await auth.json()).access_token;
const get=`https://containers.api.cloud.ru/v1/containers/${name}?projectId=${e.CLOUDRU_PROJECT_ID}`;
const patch=`https://containers.api.cloud.ru/v2/containers/${name}?projectId=${e.CLOUDRU_PROJECT_ID}`;
const r=await fetch(get,{headers:{authorization:'Bearer '+token}});if(!r.ok)throw Error('STAGE_GET_FAILED');
const data=await r.json();
if(data.name!==name || data.template?.containers?.[0]?.image?.includes('gafus-gallery-origin-stageonly@sha256:')!==true ||
 data.template.containers[0].env.find(x=>x.name==='GAFUS_STAGING_ORIGIN_MODE')?.value!=='validation-only')throw Error('UNSAFE_STAGE_RESOURCE');
data.template.containers[0].image='gafus.cr.cloud.ru/gafus-gallery-origin-stageonly:stg-metrics-20261012-05c5b67f';
const result=await fetch(patch,{method:'PATCH',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(25000)});
if(!result.ok){console.log('DEPLOY_STATUS',result.status);throw Error('STAGE_PATCH_FAILED');}
console.log(JSON.stringify({name,updated:true,operationId:(await result.json()).id??null,productionAffected:false}));
