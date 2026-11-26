import { describe, expect, it } from "vitest";
import { appendWalkTrackPage, WALK_TRACK_PAGE_SIZE } from "./pagination";
describe("walk route cursor",()=>{
  it("reads past 10,000 rows including an exact page boundary",()=>{
    const target:{seq:number}[]=[];
    let after=0;
    for(let i=0;i<50;i++) after=appendWalkTrackPage(target,Array.from({length:WALK_TRACK_PAGE_SIZE},(_,j)=>({seq:after+j+1})),after);
    expect(after).toBe(10000);
    after=appendWalkTrackPage(target,[{seq:10001}],after);
    expect(after).toBe(10001);
    expect(target.at(-1)?.seq).toBe(10001);
  });
  it("rejects duplicates and non advancing pages without modifying the collected data",()=>{
    const target=[{seq:1}];
    expect(()=>appendWalkTrackPage(target,[{seq:2},{seq:2}],1)).toThrow("WALK_TRACK_CURSOR");
    expect(target).toEqual([{seq:1}]);
  });
});
