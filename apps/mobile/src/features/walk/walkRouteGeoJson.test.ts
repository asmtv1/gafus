import { describe, expect, it } from 'vitest';
import { toWalkGeoJson } from './walkRouteGeoJson';
import type { StoredGpsPoint } from './walkGpsStorage';
const p=(segment:number,seq:number,accepted=true):StoredGpsPoint=>({segment,seq,accepted,latitude:53+seq/100,longitude:50,timestamp:seq*1000,accuracy:5,speed:1,reason:'ok',deltaMeters:10});
describe('walk route segments',()=>{
 it('never connects paused segments and excludes rejected points',()=>{
   const route=toWalkGeoJson([p(1,1),p(1,2),p(1,3,false),p(2,4),p(2,5)]);
   expect(route.features).toHaveLength(2);
   expect(route.features[0]!.geometry.coordinates).toEqual([[50,53.01],[50,53.02]]);
   expect(route.features[1]!.geometry.coordinates).toEqual([[50,53.04],[50,53.05]]);
 });
});
