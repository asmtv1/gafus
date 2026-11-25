import {haversineMeters} from "./legacy";
import {validFix,plausible} from "./motion";
import type {WalkFix} from "./types";
import type {StepEvidence} from "./stepEvidence";

export type ConfidenceClass="reliable"|"low"|"estimated"|"unknown";
export type SmartMotion="unknown"|"possible_stop"|"stationary"|"slow"|"walking"|"running"|"possible_movement";
export interface SmartWindowEvidence {
  motion:SmartMotion;
  position:ConfidenceClass;
  distance:ConfidenceClass;
  motionConfidence:ConfidenceClass;
  reasons:string[];
  observedMeters:number|null;
  steps:StepEvidence;
  displacementCorroborated:boolean;
}
/** Offline/shadow candidate: rules deliberately refuse unsupported distance.
 * The step interval must exactly cover the GPS window; caller uses stepEvidence. */
export function classifySmartWindow(fixes:readonly WalkFix[],steps:StepEvidence):SmartWindowEvidence {
  const unknown:SmartWindowEvidence={motion:"unknown",position:"unknown",distance:"unknown",motionConfidence:"unknown",
    reasons:[],observedMeters:null,steps,displacementCorroborated:false};
  if(fixes.length<2||fixes.length>64) return {...unknown,reasons:["insufficient-observations"]};
  const sorted=[...fixes].sort((a,b)=>a.timestamp-b.timestamp);
  if(sorted.some(f=>!validFix(f))) return {...unknown,reasons:["invalid-or-low-accuracy"]};
  const start=sorted[0]!,end=sorted.at(-1)!;
  const duration=(end.timestamp-start.timestamp)/1000;
  if(duration<=0||duration>300) return {...unknown,reasons:["invalid-window"]};
  let path=0,maxExcursion=0,maxAccuracy=0;
  const speeds:number[]=[];
  for(let i=0;i<sorted.length;i++) {
    const f=sorted[i]!;
    maxAccuracy=Math.max(maxAccuracy,f.accuracy!);
    maxExcursion=Math.max(maxExcursion,haversineMeters(start,f));
    if(f.speed!=null&&Number.isFinite(f.speed)&&f.speed>=0&&f.speed<=7) speeds.push(f.speed);
    if(i) {
      const prev=sorted[i-1]!;
      if(f.timestamp-prev.timestamp>35_000||!plausible(prev,f)) return {...unknown,reasons:["gap-or-outlier"]};
      path+=haversineMeters(prev,f);
    }
  }
  const net=haversineMeters(start,end);
  const speed=speeds.length>=Math.ceil(sorted.length/2)?[...speeds].sort((a,b)=>a-b)[Math.floor(speeds.length/2)]!:null;
  const spatial= Math.max(4,maxAccuracy*1.5);
  const cluster=maxExcursion<=spatial;
  const speedSupports=speed!=null&&speed>=.2;
  const displacement=maxExcursion>spatial||speedSupports&&maxExcursion>=Math.max(2,maxAccuracy*.35);
  const position:ConfidenceClass=maxAccuracy<=10?"reliable":"low";
  const base={...unknown,position};
  if(steps.kind==="no-steps"&&!speedSupports) {
    if(maxAccuracy<=10&&maxExcursion<=Math.min(8,Math.max(3,maxAccuracy*.75))) return {...base,motion:"stationary",motionConfidence:"reliable",distance:"reliable",observedMeters:0,reasons:["complete-zero-steps","stationary-cluster"]};
    return {...base,motion:"unknown",position:"low",reasons:["complete-zero-steps","gps-displacement-conflict"]};
  }
  if(steps.kind==="steps-detected"&&!displacement) {
    return {...base,motion:"possible_movement",motionConfidence:"low",reasons:["steps-detected","displacement-unresolved"]};
  }
  if(cluster&&!speedSupports) {
    return {...base,motion:"possible_stop",motionConfidence:"low",reasons:["position-cluster","step-evidence-unknown"]};
  }
  if(!speedSupports&&steps.kind!=="steps-detected") {
    return {...base,motion:"unknown",reasons:["gps-only-displacement","motion-ambiguous"]};
  }
  if(!displacement) return {...base,reasons:["displacement-unresolved"]};
  // Distance remains the candidate GPS geometry's job. The raw path is only
  // evidence, never the final meters (especially on noisy or reversing tracks).
  const pace=speed??(net/duration);
  return {...base,motion:pace>=2.5?"running":pace<.65?"slow":"walking",motionConfidence:steps.kind==="steps-detected"?"reliable":"low",
    distance:"low",observedMeters:null,displacementCorroborated:true,reasons:["motion-supported","candidate-geometry-required"]};
}

export interface DisplayFix {
  latitude:number;longitude:number;timestamp:number;accuracy:number|null;
}
/** Historical eligibility does not imply freshness for the live marker. */
export function displayFixStatus(fix:DisplayFix|null,now:number,staleAfterMs=10_000) {
  if(!fix||!Number.isFinite(now)||!Number.isFinite(fix.timestamp)||fix.timestamp>now+1000||
    !Number.isFinite(fix.latitude)||Math.abs(fix.latitude)>90||
    !Number.isFinite(fix.longitude)||Math.abs(fix.longitude)>180) return null;
  const ageMs=Math.max(0,now-fix.timestamp);
  return {fix,ageMs,stale:ageMs>staleAfterMs,accuracyRadius:fix.accuracy!=null&&Number.isFinite(fix.accuracy)&&fix.accuracy>=0?fix.accuracy:null};
}
