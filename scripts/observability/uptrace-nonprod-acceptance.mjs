#!/usr/bin/env node
/**
 * Explicit synthetic cloud acceptance (project 9383 ONLY).
 * 3-signal OTLP + Prometheus Remote Write, then independently read back
 * the freshly ingested log, span and both metrics via Viewer API.
 * No production DSN, raw payload, viewer credential or vendor response
 * content is ever printed. Not a test of a deployed continuous collector.
 */
import {homedir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runCanary} from './uptrace-nonprod-canary.mjs';
import {sendRemoteWrite} from './uptrace-nonprod-remote-write.mjs';
import {readViewerToken,fetchReadOnlyJson,makeReadUrl} from './uptrace-read.mjs';
const PROJECT='9383';
const SIGNALS=Object.freeze({
  trace:'gafus.nonprod.canary.trace',
  log:'GAFUS_NONPROD_SYNTHETIC_ERROR',
  otlp:'gafus_nonprod_canary_delivery',
  remote:'gafus_nonprod_prom_rw_canary',
});
function queryUrl(name) {
  const url=new URL('https://api.uptrace.dev/api/prometheus/'+PROJECT+'/api/v1/query');
  if(name!==SIGNALS.otlp && name!==SIGNALS.remote)
    throw Error('METRIC_NAME_NOT_ALLOWED');
  url.searchParams.set('query',name);
  return url;
}
export function verifyMetricReadback(body,now=Date.now(),startedAt=now-180_000) {
  if(!body||body.status!=='success'||!Array.isArray(body.data?.result))return false;
  return body.data.result.some(row=>{
    const value=row.value;
    if(!Array.isArray(value)||value.length!==2)return false;
    const at=Number(value[0])*1000;
    // Uptrace's evaluation instant can be slightly later than our local
    // read-call start. Bound positive and negative clock/indexing skew.
    const ageMs=now-at;
    return Number(value[1])===1&&Number.isFinite(at)&&
      ageMs>=-60_000&&ageMs<=180_000&&at>=startedAt-5_000;
  });
}
export function verifySpanAndLogReadback(body,traceId) {
  if(!body||!Array.isArray(body.spans)||
    typeof traceId!=='string'||!/^[0-9a-f]{32}$/.test(traceId))
    return {trace:false,log:false};
  // Distinguish this run from a previous successful canary in the same window.
  const scoped=body.spans.filter(row=>row?.traceId===traceId);
  const text=JSON.stringify(scoped);
  return {trace:text.includes(SIGNALS.trace),log:text.includes(SIGNALS.log)};
}
export async function acceptance({
  emitOtlp=runCanary,
  emitProm=sendRemoteWrite,
  read=fetchReadOnlyJson,
  viewerFile=join(homedir(),'.config/gafus-observability/uptrace-read.token'),
  now=()=>Date.now(),
  pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
}={}) {
  const viewer=await readViewerToken(viewerFile);
  const startedAt=now();
  const sent=await emitOtlp();
  const remote=await emitProm();
  if(!sent?.allAccepted || sent.project!==9383 ||
     !/^[0-9a-f]{32}$/.test(sent.traceId??'') ||
     !remote?.accepted || remote.project!==9383)
    return {project:9383,accepted:false,readback:false,signals:{trace:false,log:false,otlp:false,remote:false}};
  const statuses={trace:false,log:false,otlp:false,remote:false};
  for(let attempt=0;attempt<4;attempt++){
    if(attempt>0)await pause(attempt*2000);
    const then=now();
    const spans=await read(makeReadUrl('spans',PROJECT,then,5),viewer);
    const stored=verifySpanAndLogReadback(spans,sent.traceId);
    statuses.trace ||=stored.trace;
    statuses.log ||=stored.log;
    for(const key of ['otlp','remote']) {
      if(statuses[key])continue;
      const metric=await read(queryUrl(SIGNALS[key]),viewer);
      statuses[key]=verifyMetricReadback(metric,then,startedAt);
    }
    if(Object.values(statuses).every(Boolean))break;
  }
  return {project:9383,accepted:true,readback:Object.values(statuses).every(Boolean),signals:statuses};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  acceptance().then(result=>{
    console.log(JSON.stringify(result));
    if(!result.readback)process.exitCode=3;
  }).catch(()=>{
    console.error('NONPROD_ACCEPTANCE_UNAVAILABLE');
    process.exitCode=4;
  });
}
