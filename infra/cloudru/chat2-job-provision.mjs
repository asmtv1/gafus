/**
 * GAFUS Refactor only. FOUR dormant chat media Jobs, mirroring Feed resources.
 * --check only reads the Cloud.ru project. --create is opt-in and requires
 * DIGEST-PINNED real photo/video OCI images and verified nonproduction Core.
 * Never starts execution, overwrites an existing Job or changes other Jobs.
 */
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {request} from 'node:https';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
const PROJECT='6777bd18-4ee9-4d15-bb1b-134f7a18ed3a';
const BUCKET='gafus-chat2-media-2026';
const mode=process.argv[2]??'--check';
const defs=Object.freeze([
 {name:'gafus-chat-photo',kind:'image',cpu:'1',memory:'2048Mi',timeout:240},
 {name:'gafus-chat-photo-2',kind:'image',cpu:'1',memory:'2048Mi',timeout:240},
 {name:'gafus-chat-video',kind:'video',cpu:'2',memory:'8192Mi',timeout:650},
 {name:'gafus-chat-video-2',kind:'video',cpu:'2',memory:'8192Mi',timeout:650},
]);
if(!['--check','--create'].includes(mode))throw Error('CHAT2_JOBS_USAGE_CHECK_OR_CREATE');
if(realpathSync(process.cwd())!==ROOT ||
 execFileSync('git',['-C',ROOT,'rev-parse','--show-toplevel'],{encoding:'utf8'}).trim()!==ROOT ||
 execFileSync('git',['-C',ROOT,'branch','--show-current'],{encoding:'utf8'}).trim()!=='vite')
 throw Error('CHAT2_JOBS_INVALID_PROJECT_DIRECTORY_OR_BRANCH');
const credPath=ROOT+'/.local-pg-scratch/cloudru/refactor-api-credentials.json';
if(lstatSync(credPath).isSymbolicLink()||!realpathSync(credPath).startsWith(ROOT+'/'))
 throw Error('CHAT2_JOBS_CREDENTIAL_PATH');
const c=JSON.parse(readFileSync(credPath,'utf8'));
if(c.project_id!==PROJECT||c.service_account!=='gafus-refactor-api')throw Error('CHAT2_JOBS_PROJECT_MISMATCH');
const ip=execFileSync('ipconfig',['getifaddr','en0'],{encoding:'utf8'}).trim();
if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip))throw Error('CHAT2_JOBS_NO_EN0');
async function cloud(url,method='GET',payload,access){
 const u=new URL(url),body=payload?JSON.stringify(payload):'';
 if(u.protocol!=='https:'||!['iam.api.cloud.ru','containers.api.cloud.ru'].includes(u.hostname))
  throw Error('CHAT2_JOBS_API_ORIGIN_FORBIDDEN');
 return new Promise((resolve,reject)=>{
  const req=request({hostname:u.hostname,path:u.pathname+u.search,method,localAddress:ip,family:4,timeout:25000,
   headers:{...(access?{authorization:'Bearer '+access}:{}),
     ...(body?{'content-type':'application/json','content-length':Buffer.byteLength(body)}:{})}},res=>{
    let size=0;const chunks=[];
    res.on('data',x=>{size+=x.length;if(size<=200000)chunks.push(x)});
    res.on('end',()=>{if(size>200000){reject(Error('CHAT2_JOBS_RESPONSE_TOO_LARGE'));return;}
      let data={};try{data=JSON.parse(Buffer.concat(chunks).toString())}catch{}
      resolve({status:res.statusCode??0,data});});
   });req.on('error',reject);req.on('timeout',()=>req.destroy(Error('CHAT2_JOBS_API_TIMEOUT')));req.end(body);
 });
}
const auth=await cloud('https://iam.api.cloud.ru/api/v2/auth/token','POST',
 {keyId:c.key_id,secret:c.key_secret});
if(auth.status!==200||!auth.data.access_token)throw Error('CHAT2_JOBS_IAM_UNAVAILABLE');
const access=auth.data.access_token,base='https://containers.api.cloud.ru/v2/jobs';
const found=await cloud(base+'?projectId='+PROJECT+'&pageSize=100','GET',undefined,access);
if(found.status!==200||!Array.isArray(found.data.data??found.data.jobs))throw Error('CHAT2_JOBS_LIST_FAILED');
const jobs=found.data.data??found.data.jobs;
const status=defs.map(d=>({name:d.name,kind:d.kind,cpu:d.cpu,memory:d.memory,
  timeout:d.timeout,maxRetries:3,exists:jobs.some(job=>job.name===d.name)}));
console.log(JSON.stringify({mode,projectId:PROJECT,existingJobs:jobs.length,desired:status,
  runImmediately:false,mutations:mode==='--check'?0:'require-explicit-create-gate'}));
if(mode==='--check')process.exit(0);
if(defs.some(d=>jobs.some(job=>job.name===d.name)))
 throw Error('CHAT2_JOB_EXISTS_REFUSE_OVERWRITE_OR_PARTIAL_CREATE');
if(process.env.GAFUS_CHAT2_JOB_CREATE_CONFIRM!=='four-dormant-refactor-chat-jobs')
 throw Error('CHAT2_JOBS_CREATE_NOT_CONFIRMED');
const imageFor={image:process.env.CHAT2_PHOTO_JOB_IMAGE??'',video:process.env.CHAT2_VIDEO_JOB_IMAGE??''};
// Only digest-pinned images from the *separate* private Refactor registry.
const refactorRegistry='gafus-chat2-20261028.cr.cloud.ru';
for(const [kind,image] of Object.entries(imageFor)){
 const suffix=kind==='image'?'photo':'video';
 const prefix=`${refactorRegistry}/gafus-chat-${suffix}@sha256:`;
 if(!image.startsWith(prefix)||!/^[a-f0-9]{64}$/.test(image.slice(prefix.length)))
  throw Error('CHAT2_JOBS_VERIFIED_'+suffix.toUpperCase()+'_PRIVATE_DIGEST_REQUIRED');
}
const backend=process.env.CHAT2_NONPROD_CORE_BASE_URL??'';
let endpoint;try{endpoint=new URL(backend)}catch{throw Error('CHAT2_JOBS_NONPROD_CORE_REQUIRED')}
if(endpoint.protocol!=='https:'||endpoint.pathname!=='/'||endpoint.search||endpoint.hash||
 endpoint.username||endpoint.password||!endpoint.hostname.endsWith('.containerapps.ru')||
 process.env.CHAT2_NONPROD_CORE_VERIFIED!=='true')
 throw Error('CHAT2_JOBS_UNVERIFIED_NONPROD_CORE');
// No broad S3 credentials or HMAC secret stored in Container Job spec.
// Secrets management is an independent prerequisite for activation.
for(const d of defs){
 const image=imageFor[d.kind];
 const spec={projectId:PROJECT,name:d.name,
  description:`GAFUS Refactor dormant chat ${d.kind} V2 pool, independent of Feed`,
  runImmediately:false,configuration:{privileged:false},
  template:{timeout:d.timeout,maxRetries:3,containers:[{
   name:d.name,image,resources:{cpu:d.cpu,memory:d.memory},
   env:[
    {name:'CHAT2_JOB_ENABLED',value:'false'},
    {name:'CHAT2_JOB_KIND',value:d.kind},
    {name:'CHAT2_JOB_VCPU',value:d.cpu},
    {name:'CHAT2_VIDEO_TRANSCODE_MODE',value:'sequential'},
    {name:'CHAT2_S3_ENDPOINT',value:'https://s3.cloud.ru'},
    {name:'CHAT2_S3_BUCKET',value:BUCKET},
    {name:'CHAT2_JOB_WORK_ROOT',value:'/app/work'},
    {name:'CHAT2_INTERNAL_BASE_URL',value:endpoint.origin+'/'},
   ],
  }]}};
 const created=await cloud(base,'POST',spec,access);
 if(![200,201,202].includes(created.status))throw Error('CHAT2_JOBS_CREATE_FAILED_'+d.name+'_'+created.status);
 console.log(JSON.stringify({createdName:d.name,resource:d.cpu+'vCPU/'+d.memory,dormant:true,
  runImmediately:false}));
}
