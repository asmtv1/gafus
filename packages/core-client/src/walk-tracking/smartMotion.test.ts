import {describe,it,expect} from "vitest";
import {classifySmartWindow,displayFixStatus} from "./smartMotion";
import {calibrateStride,type StrideWindow} from "./strideCalibration";
import type {WalkFix} from "./types";
const d=180/(Math.PI*6371008.8),t=1_800_000_000_000;
const fixes=(xs:number[],accuracy=5,speed:number|null=null):WalkFix[]=>xs.map((x,i)=>({latitude:0,longitude:x*d,timestamp:t+i*4000,accuracy,speed}));
const zero={kind:"no-steps" as const,steps:0};
const positive={kind:"steps-detected" as const,steps:12};
const unknown={kind:"unknown" as const,reason:"gap" as const};
describe("smart motion evidence",()=>{
  it("does not trust coherent drift against complete zero steps",()=>{
    const trace=fixes(Array.from({length:21},(_,i)=>i*1.2));
    expect(classifySmartWindow(trace,zero)).toMatchObject({motion:"unknown",distance:"unknown",observedMeters:null});
    expect(classifySmartWindow(trace,unknown)).toMatchObject({motion:"unknown",observedMeters:null});
  });
  it("recognizes stationary coverage and never converts steps in place or short ambiguous turns into a line",()=>{
    expect(classifySmartWindow(fixes([0,0,0]),zero)).toMatchObject({motion:"stationary",observedMeters:0});
    expect(classifySmartWindow(fixes(Array.from({length:13},(_,i)=>.7*Math.min(i,12-i)),8),positive)).toMatchObject({motion:"possible_movement",observedMeters:null,displacementCorroborated:false});
    expect(classifySmartWindow(fixes([0,0,0]),positive)).toMatchObject({observedMeters:null,displacementCorroborated:false});
  });
  it("distinguishes slow motion, gaps, and live position freshness",()=>{
    expect(classifySmartWindow(fixes([0,1.2,2.4,3.6,4.8],5,.3),positive)).toMatchObject({motion:"slow",displacementCorroborated:true});
    expect(classifySmartWindow([fixes([0])[0]!,{...fixes([10])[0]!,timestamp:t+60000}],positive).distance).toBe("unknown");
    expect(displayFixStatus(fixes([0])[0]!,t+11000)).toMatchObject({stale:true,ageMs:11000,accuracyRadius:5});
  });
});
describe("stride calibration",()=>{
  const scope={ownerId:"a",deviceId:"phone",source:"ios-pedometer"};
  const w=(i:number,overrides:Partial<StrideWindow>={}):StrideWindow=>({...scope,identity:String(i),walkId:i<3?"a":"b",from:i*60000,to:i*60000+60000,tempo:"walking",steps:60,gpsMeters:42,complete:true,reliableGps:true,mixedTempo:false,hasPauseOrGap:false,usedStepEstimate:false,...overrides});
  it("needs independent windows in two walks; deduplication and replay are stable",()=>{
    const windows=Array.from({length:5},(_,i)=>w(i));
    expect(calibrateStride(scope,windows.slice(0,4)).buckets.walking.ready).toBe(false);
    const result=calibrateStride(scope,windows);
    expect(result.buckets.walking).toMatchObject({ready:true,metersPerStep:.7,windows:5,walks:2});
    expect(calibrateStride(scope,[...windows,...windows].reverse())).toEqual(result);
    expect(result.buckets.running.metersPerStep).toBe(.8);
  });
  it("excludes other owners, estimates, duplicate conflicts and overlapping windows",()=>{
    const windows=Array.from({length:5},(_,i)=>w(i));
    expect(calibrateStride(scope,[...windows,w(5,{ownerId:"b"}),w(6,{usedStepEstimate:true}),w(7,{complete:false})]).buckets.walking.windows).toBe(5);
    expect(calibrateStride(scope,[...windows,w(0,{gpsMeters:50})]).buckets.walking.ready).toBe(false);
    expect(calibrateStride(scope,[...windows,w(9,{walkId:"a",from:10000,to:50000})]).buckets.walking.ready).toBe(false);
  });
});
