#!/usr/bin/env node
/** Read-only parity evaluation for eight existing Yandex mobile dashboard cards.
 * Input is bounded, sanitized numeric snapshots, NOT raw provider API exports.
 * No claim of 14-day acceptance is made without 14 days of recorded evidence.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const MOBILE_ALIASES=Object.freeze([
  'gafus_web_up','gafus_api_up','gafus_worker_up','gafus_bull_board_up',
  'gafus_postgres_up','gafus_cpu_percent','gafus_ram_percent','gafus_disk_free_percent',
]);
const PROBES=new Set(MOBILE_ALIASES.slice(0,5));
export function parseParitySnapshot(obj) {
  if(!obj||typeof obj!=='object'||Array.isArray(obj)||
      Object.keys(obj).some(k=>!['time','values','source'].includes(k))||
      !['yandex','uptrace'].includes(obj.source)||
      typeof obj.time!=='string'||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(obj.time)||
      !Number.isFinite(Date.parse(obj.time))||
      typeof obj.values!=='object'||!obj.values||Array.isArray(obj.values)||
      Object.keys(obj.values).some(k=>!MOBILE_ALIASES.includes(k)))
    throw Error('PARITY_SNAPSHOT_INVALID');
  const values={};
  for(const alias of MOBILE_ALIASES) {
    const value=obj.values[alias];
    if(value===null||value===undefined)values[alias]=null;
    else if(typeof value==='number'&&Number.isFinite(value)&&
      value>=0&&value<=100)values[alias]=value;
    else throw Error('PARITY_VALUE_INVALID');
    if(PROBES.has(alias)&&value!==null&&value!==undefined&&![0,1].includes(value))
      throw Error('PARITY_PROBE_INVALID');
  }
  return {time:new Date(obj.time).toISOString(),source:obj.source,values};
}
export function compareMobileSnapshots(left,right) {
  const a=parseParitySnapshot(left),b=parseParitySnapshot(right);
  if(a.source!=='yandex'||b.source!=='uptrace')throw Error('PARITY_SOURCES_INVALID');
  const skewMs=Math.abs(Date.parse(a.time)-Date.parse(b.time));
  if(skewMs>120_000)throw Error('PARITY_WINDOW_MISMATCH');
  const results=MOBILE_ALIASES.map(alias=>{
    const yc=a.values[alias],up=b.values[alias];
    if(yc===null||up===null)return {alias,status:'NO_DATA'};
    if(PROBES.has(alias))return {alias,status:yc===up?'PASS':'FAIL'};
    const delta=Math.abs(yc-up);
    const tolerance=Math.max(0.02,Math.abs(yc)*0.02);
    return {alias,status:delta<=tolerance?'PASS':'FAIL',deltaPercent:Math.round(delta*1000)/1000};
  });
  return {time:a.time,results,passed:results.every(r=>r.status==='PASS')};
}
export function verifyParityHistory(pairs,{now=Date.now(),minDays=14,maxGapHours=6}={}) {
  if(!Array.isArray(pairs)||pairs.length>10_000||
      !Number.isFinite(now)||!Number.isFinite(minDays)||minDays<14||
      !Number.isFinite(maxGapHours)||maxGapHours<=0||maxGapHours>6)
    throw Error('PARITY_HISTORY_INVALID');
  const checks=pairs.map(p=>compareMobileSnapshots(p.yandex,p.uptrace));
  if(!checks.length)return {passed:false,reason:'NO_EVIDENCE',samples:0};
  const stamps=checks.map(c=>Date.parse(c.time)).sort((a,b)=>a-b);
  // A future timestamp or a sample replayed at the same time must never
  // count as measured elapsed days. Allow at most two minutes clock skew.
  const future=stamps.some(at=>at>now+120_000);
  const duplicate=stamps.some((at,i)=>i>0&&at===stamps[i-1]);
  const complete=stamps.every((at,i)=>i===0||at-stamps[i-1]<=maxGapHours*3_600_000);
  const coverage=stamps.at(-1)-stamps[0]>=minDays*86_400_000;
  const fresh=now-stamps.at(-1)>=-120_000&&now-stamps.at(-1)<=maxGapHours*3_600_000;
  return {passed:!future&&!duplicate&&complete&&coverage&&fresh&&checks.every(c=>c.passed),
    reason:future?'FUTURE_EVIDENCE':duplicate?'DUPLICATE_TIME':
      !coverage?'INSUFFICIENT_DAYS':!complete?'GAP':!fresh?'STALE':
      checks.some(c=>!c.passed)?'MISMATCH':'PASS',
    samples:checks.length,firstAt:new Date(stamps[0]).toISOString(),
    lastAt:new Date(stamps.at(-1)).toISOString()};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [filename]=process.argv.slice(2);
  if(!filename||!filename.endsWith('.json')){console.error('PARITY_INPUT_REQUIRED');process.exit(4);}
  try {
    const input=await readFile(filename);
    if(input.length>1024*1024)throw Error('PARITY_INPUT_TOO_LARGE');
    const result=verifyParityHistory(JSON.parse(input.toString()));
    console.log(JSON.stringify(result));
    if(!result.passed)process.exitCode=3;
  }catch{console.error('PARITY_INVALID_OR_UNREADABLE');process.exitCode=4;}
}
