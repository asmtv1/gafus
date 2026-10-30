import {describe,it,expect,vi} from 'vitest';
import {createVersionedCourseOperations} from './TR012VersionHttpAdapter20261022';
const body=(version:number)=>JSON.stringify({success:true,data:{id:'course-1',name:'Updated',version}});
const response=(status:number,version=2)=>new Response(body(version),{status,headers:{'cache-control':'private, no-store','content-type':'application/json'}});
describe('TR012 exact registered AG1 HTTP transport surface, injected synthetic fetch',()=>{
 it('GET private version and PATCH exact positive expectedVersion without owner override',async()=>{
  const fetchImpl=vi.fn<typeof fetch>(async()=>response(200,2));
  const ops=createVersionedCourseOperations({token:'synthetic-token',fetchImpl,isCurrent:()=>true});
  expect(await ops.read('course-1',new AbortController().signal)).toEqual({id:'course-1',name:'Updated',version:2});
  expect((await ops.save({courseId:'course-1',name:'Renamed',expectedVersion:2},new AbortController().signal)).status).toBe(200);
  expect(fetchImpl.mock.calls[0]?.[0]).toBe('/api/v1/trainer/courses/course-1/version');
  expect(fetchImpl.mock.calls[1]?.[0]).toBe('/api/v1/trainer/courses/course-1/name');
  const options=fetchImpl.mock.calls[1]?.[1];
  expect(options?.method).toBe('PATCH');expect(options?.cache).toBe('no-store');
  expect(JSON.parse(String(options?.body))).toEqual({name:'Renamed',expectedVersion:2});
 });
 it('409 never promotes to success, invalid revision and session retirement fail closed',async()=>{
  const ops=createVersionedCourseOperations({token:'token',fetchImpl:async()=>response(409),isCurrent:()=>true});
  expect(await ops.save({courseId:'course-1',name:'x',expectedVersion:2},new AbortController().signal)).toEqual({status:409});
  const invalid=createVersionedCourseOperations({token:'token',fetchImpl:async()=>response(200,0),isCurrent:()=>true});
  await expect(invalid.read('course-1',new AbortController().signal)).rejects.toThrow();
  const retired=createVersionedCourseOperations({token:'token',fetchImpl:vi.fn(async()=>response(200)),isCurrent:()=>false});
  await expect(retired.read('course-1',new AbortController().signal)).rejects.toThrow('SESSION_RETIRED');
 });
});
