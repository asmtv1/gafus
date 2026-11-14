#!/usr/bin/env node
/** Explicit synthetic Nonprod (project 9383) OTLP three-signal canary.
 * Reads ONLY private credentials from disk. No raw response, DSN, event payload
 * or secrets ever go to stdout, stderr, loggers or command-line arguments.
 */
import { randomBytes,randomUUID } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HOST='https://api.uptrace.dev';
const SIGNALS=['traces','logs','metrics'];
const resource={attributes:[
 {key:'service.name',value:{stringValue:'gafus-nonprod-canary'}},
 {key:'service.namespace',value:{stringValue:'gafus'}},
 {key:'deployment.environment.name',value:{stringValue:'preview'}},
 {key:'gafus.canary',value:{boolValue:true}},
]};
const safeString=(v)=>typeof v==='string'&&/^[A-Za-z0-9_-]{12,}$/.test(v);
export async function readCanaryDsn({
 privatePath=join(homedir(),'.config/gafus-observability/uptrace-nonprod-ingest.dsn'),
 prodPath=join(homedir(),'.config/gafus-observability/uptrace-ingest.dsn'),
}={}) {
 const st=await lstat(privatePath);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||st.size<20||st.size>512)
   throw Error('NONPROD_SECRET_FILE_UNSAFE');
 const dsn=(await readFile(privatePath,'utf8')).trim();
 let url;
 try{url=new URL(dsn);}catch{throw Error('NONPROD_SECRET_SCHEMA_INVALID');}
 if(url.protocol!=='https:'||url.hostname!=='api.uptrace.dev'||
   !safeString(url.username)||url.password||url.pathname!=='/'||
   url.search!=='?grpc=4317'||url.hash)
   throw Error('NONPROD_SECRET_SCHEMA_INVALID');
 const prod=(await readFile(prodPath,'utf8')).trim();
 if(dsn===prod)throw Error('PROD_CREDENTIAL_FORBIDDEN');
 return dsn;
}
function exportSamples(now=Date.now()) {
 const timeUnixNano=(BigInt(now)*1_000_000n).toString();
 const traceId=randomBytes(16).toString('hex');
 const spanId=randomBytes(8).toString('hex');
 const requestId=randomUUID();
 const common={scope:{name:'gafus.uptrace.nonprod-canary',version:'1'},};
 return {
   traces:{resourceSpans:[{resource,scopeSpans:[{...common,spans:[{
     traceId,spanId,name:'gafus.nonprod.canary.trace',kind:1,
     startTimeUnixNano:timeUnixNano,endTimeUnixNano:(BigInt(timeUnixNano)+3_000_000n).toString(),
     attributes:[{key:'gafus.canary.kind',value:{stringValue:'synthetic'}}],
     status:{code:1},
   }]}]}]},
   logs:{resourceLogs:[{resource,scopeLogs:[{...common,logRecords:[{
     timeUnixNano,severityNumber:17,severityText:'ERROR',
     body:{stringValue:'GAFUS_NONPROD_SYNTHETIC_ERROR'},
     attributes:[{key:'gafus.error_code',value:{stringValue:'CANARY_SYNTHETIC'}}],
     traceId,spanId,
   }]}]}]},
   metrics:{resourceMetrics:[{resource,scopeMetrics:[{...common,metrics:[{
     name:'gafus.nonprod.canary.delivery',unit:'1',description:'Synthetic pipeline probe',
     gauge:{dataPoints:[{timeUnixNano,asInt:'1',attributes:[]}]},
   }]}]}]},
   requestId,traceId,
 };
}
export async function runCanary({fetchImpl=fetch,dsn,now=Date.now()}={}) {
 if(!dsn)dsn=await readCanaryDsn();
 const sample=exportSamples(now);
 const result={project:9383,environment:'preview',service:'gafus-nonprod-canary',
   // Synthetic run correlation; never derived from a user/session/device.
   traceId:sample.traceId,signals:{},signalCount:0};
 for(const signal of SIGNALS) {
   const body=JSON.stringify(sample[signal]);
   let status=0;
   try {
     const response=await fetchImpl(HOST+'/v1/'+signal,{
       method:'POST',
       headers:{'content-type':'application/json','uptrace-dsn':dsn},
       redirect:'error',signal:AbortSignal.timeout(8000),body,
     });
     status=response.status;
   }catch{status=0;}
   result.signals[signal]=status;
   if(status>=200&&status<300)result.signalCount++;
 }
 result.allAccepted=result.signalCount===3;
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 runCanary().then(result=>{
   console.log(JSON.stringify(result));
   if(!result.allAccepted)process.exitCode=3;
 }).catch(error=>{
   console.error(['NONPROD_SECRET_FILE_UNSAFE','NONPROD_SECRET_SCHEMA_INVALID',
     'PROD_CREDENTIAL_FORBIDDEN'].includes(error?.message)?error.message:'CANARY_SETUP_ERROR');
   process.exitCode=4;
 });
}
