/** Guarded one-shot start of the existing suspended Gallery Origin only. */
const e=process.env,name='gafus-gallery-origin',mode=process.argv[2];
if(!['--plan','--start'].includes(mode)||process.argv.length!==3)throw Error('INVALID_MODE');
if(e.GITHUB_REF!=='refs/heads/ops/resume-gallery-origin-20261101'||
 e.GITHUB_EVENT_NAME!=='workflow_dispatch'||
 !e.CLOUDRU_PROJECT_ID||!e.CLOUDRU_KEY_ID||!e.CLOUDRU_KEY_SECRET)
 throw Error('UNAUTHORIZED_GALLERY_RECOVERY');
if(mode==='--start'&&e.GALLERY_RECOVERY_CONFIRM!=='START_EXISTING_SUSPENDED_GALLERY_ORIGIN')
 throw Error('GALLERY_RECOVERY_CONFIRM_MISSING');
const a=await fetch('https://iam.api.cloud.ru/api/v1/auth/token',{
 method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({keyId:e.CLOUDRU_KEY_ID,secret:e.CLOUDRU_KEY_SECRET}),
 signal:AbortSignal.timeout(13000)});
if(!a.ok)throw Error('IAM_HTTP_'+a.status);
const bearer=(await a.json()).access_token;
if(!bearer)throw Error('NO_IAM_TOKEN');
const suffix=name+'?projectId='+encodeURIComponent(e.CLOUDRU_PROJECT_ID);
async function get(){
 const r=await fetch('https://containers.api.cloud.ru/v1/containers/'+suffix,{
  headers:{authorization:'Bearer '+bearer},signal:AbortSignal.timeout(15000)});
 if(r.status!==200)throw Error('ORIGIN_READ_HTTP_'+r.status);
 const app=await r.json();
 const c=app.template?.containers?.[0];
 const env=Object.fromEntries((c?.env??[]).filter(v=>v.name).map(v=>[v.name,v.value]));
 if(app.name!==name ||
  !/^gafus\.cr\.cloud\.ru\/gafus-gallery-origin@sha256:[a-f0-9]{64}$/.test(c?.image??'')||
  env.GALLERY_BUCKET!=='gafus-gallery-private' ||
  env.GALLERY_S3_ENDPOINT!=='https://s3.cloud.ru' ||
  !env.GALLERY_ORIGIN_SECRET || !env.GALLERY_CDN_SECRET ||
  !env.GALLERY_S3_ACCESS_KEY_ID || !env.GALLERY_S3_SECRET_ACCESS_KEY ||
  app.template?.scaling?.minInstanceCount!==1 ||
  app.template?.scaling?.maxInstanceCount!==1 ||
  app.configuration?.ingress?.publiclyAccessible!==true)
   throw Error('GALLERY_ORIGIN_UNEXPECTED_CONFIGURATION');
 return app;
}
const initial=await get();
console.log(JSON.stringify({name,mode,status:initial.status,
 imagesChanged:false,jobsChanged:false,s3Changed:false}));
if(mode==='--plan')process.exit(0);
if(initial.status==='running'){
 console.log('GALLERY_ORIGIN_ALREADY_RUNNING_NO_ACTION');
 process.exit(0);
}
if(initial.status!=='suspended')throw Error('REFUSE_START_UNEXPECTED_STATUS_'+initial.status);
const url='https://containers.api.cloud.ru/v2/containers/'+name+':start?projectId='+encodeURIComponent(e.CLOUDRU_PROJECT_ID);
const start=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+bearer},
 signal:AbortSignal.timeout(20000)});
if(![200,201,202].includes(start.status)){
  let info;
  try {
    const provider=await start.json();
    const clean=v=>typeof v==='string'
      ? v.slice(0,160).replace(/[A-Za-z0-9_:-]{24,}/g,'[redacted]')
      : null;
    info={status:start.status,
      code:clean(provider.code??provider.error?.code??provider.errorCode),
      message:clean(provider.message??provider.error?.message??provider.error)};
  }catch{info={status:start.status,unparseableBody:true};}
  console.error('GALLERY_START_PROVIDER_ERROR',JSON.stringify(info));
  throw Error('GALLERY_START_HTTP_'+start.status);
}
await start.body?.cancel();
console.log('GALLERY_START_ACCEPTED');
for(let i=0;i<30;i++){
 await new Promise(resolve=>setTimeout(resolve,4000));
 const status=(await get()).status;
 if(status==='running'){
  console.log('GALLERY_ORIGIN_RUNNING_CONFIRMED');
  process.exit(0);
 }
 if(['rejected','deleted','suspended_product'].includes(status))
  throw Error('GALLERY_START_FAILED_'+status);
}
throw Error('GALLERY_START_WAIT_EXPIRED');
