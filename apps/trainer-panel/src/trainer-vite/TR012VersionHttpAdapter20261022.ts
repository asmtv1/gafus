/** AG1 registered name-only Course.version CAS transport, injection-only; no automatic enablement. */
import {z} from 'zod';
import type {VersionedCourseOperations,VersionedName} from './TrainerCourseVersionEditor20261022';
const dto=z.object({id:z.string().min(1),name:z.string().min(1).max(500),version:z.number().int().min(1).max(2147483647)}).strict();
const success=z.object({success:z.literal(true),data:dto}).strict();
const id=/^[A-Za-z0-9_-]{1,128}$/;
export function createVersionedCourseOperations(input:{token:string;fetchImpl:typeof fetch;isCurrent:()=>boolean}):VersionedCourseOperations{
 const call=async(courseId:string,signal:AbortSignal,method:'GET'|'PATCH',payload?:{name:string;expectedVersion:number})=>{
  if(!id.test(courseId)||signal.aborted||!input.isCurrent())throw Error('SESSION_RETIRED');
  const path=`/api/v1/trainer/courses/${courseId}/${method==='GET'?'version':'name'}`;
  const response=await input.fetchImpl(path,{method,signal,cache:'no-store',referrerPolicy:'no-referrer',headers:{authorization:`Bearer ${input.token}`,...(payload?{'content-type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
  if(signal.aborted||!input.isCurrent())throw Error('SESSION_RETIRED');
  const cache=(response.headers.get('cache-control')??'').toLowerCase().split(',').map(x=>x.trim());
  if(!cache.includes('private')||!cache.includes('no-store')||cache.includes('public'))throw Error('UNSAFE_CACHE');
  if(response.status===409&&method==='PATCH')return {status:409 as const};
  if(response.status!==200)return {status:response.status as 401|403|404|500};
  const parsed=success.parse(await response.json());
  if(signal.aborted||!input.isCurrent()||parsed.data.id!==courseId)throw Error('INVALID_RESPONSE');
  return {status:200 as const,data:parsed.data as VersionedName};
 };
 return {
  read:async(courseId,signal)=>{const r=await call(courseId,signal,'GET');if(r.status!==200)throw Error(`HTTP_${r.status}`);return r.data;},
  save:async(payload,signal)=>call(payload.courseId,signal,'PATCH',{name:payload.name,expectedVersion:payload.expectedVersion}),
 };
}
