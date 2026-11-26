import { describe, expect, it } from "vitest";
import { simplifyWalkCoordinates, toWalkGeoJson, WalkGeometryCache, finalizeWalkDisplay } from "./geometry";
const d = 180 / (Math.PI*6371008.8);
const xy = (x:number,y:number):[number,number] => [x*d,y*d];
describe("canonical walk geometry", () => {
  it("retains endpoints, square corners and a 180-degree reversal", () => {
    const square = [...Array.from({length:10},(_,i)=>xy(i*4,0)),...Array.from({length:10},(_,i)=>xy(40,i*4)),xy(40,40),xy(40,20),xy(40,0)];
    const reduced = simplifyWalkCoordinates(square,2);
    expect(reduced).toEqual([xy(0,0),xy(40,0),xy(40,40),xy(40,0)]);
  });
  it("simplifies long straight lines without dropping the tail or changing segments", () => {
    const points = Array.from({length:10001},(_,i)=>({accepted:true,segment:i<9000?1:2,longitude:i*d,latitude:0,deltaMeters:1}));
    const meters = points.reduce((s,p)=>s+p.deltaMeters,0);
    const result = toWalkGeoJson(points,2);
    expect(result.features).toHaveLength(2);
    const last = result.features[1]!.geometry.coordinates.at(-1);
    expect(last).toEqual([10000*d,0]);
    expect(result.features.flatMap(f=>f.geometry.coordinates).length).toBeLessThan(100);
    expect(points.reduce((s,p)=>s+p.deltaMeters,0)).toBe(meters);
  });
});

describe("incremental and final display",()=>{
  it("matches full geometry across chunk and segment boundaries, including antimeridian",()=>{
    const points=Array.from({length:10001},(_,i)=>({
      accepted:i%31!==0,segment:i<5010?1:2,latitude:Math.sin(i*.1)*5*d,
      longitude:((179.999+i*d+540)%360)-180,deltaMeters:1,
    }));
    const cache=new WalkGeometryCache(2);
    for(let i=0;i<points.length;i+=137) cache.append(points.slice(i,i+137));
    expect(cache.snapshot()).toEqual(toWalkGeoJson(points,2));
    expect(finalizeWalkDisplay(points).geometry).toEqual(cache.snapshot());
    expect(points.reduce((s,p)=>s+p.deltaMeters,0)).toBe(10001);
  });
  it("keeps the exact 100000 point boundary and fails explicitly above it",()=>{
    const points=Array.from({length:100000},(_,i)=>({accepted:true,segment:1,latitude:0,longitude:i*d}));
    const cache=new WalkGeometryCache(2);
    cache.append(points);
    expect(cache.snapshot().features[0]?.geometry.coordinates.at(-1)).toEqual([99999*d,0]);
    expect(()=>cache.append([points[0]!])).toThrow("WALK_TRACK_LIMIT");
  });
});
