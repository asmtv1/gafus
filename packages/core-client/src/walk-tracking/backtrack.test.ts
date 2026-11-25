import {describe,it,expect} from "vitest";
import {createBacktrackPlan,advanceBacktrack,initialBacktrackProgress,backtrackOfflineLine} from "./backtrack";
const d=180/(Math.PI*6371008.8),t=1_800_000_000_000;
const point=(seq:number,x:number,y=0,segment=1)=>({seq,longitude:x*d,latitude:y*d,segment,accepted:true});
const fix=(x:number,y=0,sec=0,accuracy=3)=>({longitude:x*d,latitude:y*d,timestamp:t+sec*1000,accuracy});
describe("back to start without tiles",()=>{
  it("tracks reversed progress on the known line without mutating the input",()=>{
    const points=Array.from({length:21},(_,i)=>point(i+1,i*5));
    const saved=JSON.stringify(points),plan=createBacktrackPlan(points)!;
    expect(plan.meters).toBeCloseTo(100,6);
    let progress=initialBacktrackProgress();
    for(let i=0;i<=10;i++){
      const now=t+i*10000,step=advanceBacktrack(plan,progress,fix(100-i*10,0,i*10),now);
      expect(step.remainingMeters).toBeCloseTo(100-i*10,4);
      progress=step.progress;
      if(i===10)expect(step.status).toBe("arrived");
    }
    expect(backtrackOfflineLine(plan).points).not.toBe("");
    expect(JSON.stringify(points)).toBe(saved);
  });
  it("stops at a gap and never searches an older segment",()=>{
    const plan=createBacktrackPlan([point(1,0),point(2,50),point(3,80,0,2),point(4,90,0,2),point(5,100,0,2)])!;
    const first=advanceBacktrack(plan,initialBacktrackProgress(),fix(100),t);
    const second=advanceBacktrack(plan,first.progress,fix(90,0,10),t+10000);
    const third=advanceBacktrack(plan,second.progress,fix(80,0,20),t+20000);
    expect(third).toMatchObject({status:"gap",remainingMeters:0,next:null});
    expect(plan.vertices.map(v=>v.seq)).toEqual([5,4,3]);
  });
  it("does not jump to the overlapping opposite leg or extrapolate a stale fix",()=>{
    const plan=createBacktrackPlan([point(1,0),point(2,10),point(3,20),point(4,30),point(5,20),point(6,10),point(7,0)])!;
    const first=advanceBacktrack(plan,initialBacktrackProgress(),fix(0),t);
    expect(first.progress.offset).toBe(0);
    const second=advanceBacktrack(plan,first.progress,fix(10,0,10),t+10000);
    expect(second.progress.offset).toBeCloseTo(10,4);
    expect(advanceBacktrack(plan,second.progress,fix(20,0,10),t+30000).status).toBe("stale");
  });
});
