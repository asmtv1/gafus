import {describe,it,expect} from "vitest";
import {filterWalkDisplay} from "./experimentalFilters";
import type {FilterInput} from "./experimentalFilters";
const start=1_800_000_000_000;
const fix=(t:number,longitude:number,segment=1):FilterInput=>({latitude:0,longitude,timestamp:start+t*1000,accuracy:5,speed:1,segment});
describe("experimental filter isolation",()=>{
  for(const kind of ["alpha-beta","robust-kalman"] as const) {
    it(kind+" is deterministic, measurement-only and segment bounded",()=>{
      const input=[fix(0,179.9999),fix(4,-179.99999),fix(8,-179.9999),fix(60,10,2),fix(64,10.00001,2)];
      const saved=JSON.stringify(input);
      const output=filterWalkDisplay(input,kind);
      expect(output.map(x=>x.timestamp)).toEqual(input.map(x=>x.timestamp));
      expect(output[3]).toMatchObject({longitude:10,latitude:0,segment:2});
      expect(Math.abs(output[1]!.longitude)).toBeGreaterThan(179);
      expect(output).toEqual(filterWalkDisplay(input,kind));
      expect(JSON.stringify(input)).toBe(saved);
    });
  }
});
