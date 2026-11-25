/** Experimental offline contracts. No OS, network, or production writer dependency. */
export interface StepScope {
  ownerId: string;
  walkId: string;
  epoch: string;
  clockGeneration: string;
  source: "android-counter" | "android-detector" | "ios-pedometer";
}
export interface StepInterval extends StepScope {
  identity: string;
  from: number;
  to: number;
  delta: number;
  complete: boolean;
}
export type StepEvidence =
  | { kind: "unknown"; reason: "invalid-window" | "incomplete" | "conflict" | "gap" }
  | { kind: "no-steps" | "steps-detected"; steps: number };

function sameScope(a: StepScope,b: StepScope): boolean {
  return a.ownerId===b.ownerId && a.walkId===b.walkId && a.epoch===b.epoch &&
    a.clockGeneration===b.clockGeneration && a.source===b.source;
}
function validInterval(i:StepInterval):boolean {
  return !!i.identity && Number.isFinite(i.from) && Number.isFinite(i.to) && i.to>i.from &&
    Number.isSafeInteger(i.delta) && i.delta>=0 && i.complete===true;
}
/** Only exact, complete, non-overlapping intervals in the same clock/session.
 * Never prorate a total across an uncovered or partially intersected interval. */
export function stepEvidence(scope:StepScope,from:number,to:number,intervals:readonly StepInterval[]):StepEvidence {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to<=from) return {kind:"unknown",reason:"invalid-window"};
  const selected=intervals.filter(i=>sameScope(i,scope) && i.from<to && i.to>from);
  const unique=new Map<string,StepInterval>();
  for(const i of selected) {
    if (!validInterval(i) || i.from<from || i.to>to) return {kind:"unknown",reason:"incomplete"};
    const prior=unique.get(i.identity);
    if(prior && (prior.from!==i.from || prior.to!==i.to || prior.delta!==i.delta)) return {kind:"unknown",reason:"conflict"};
    unique.set(i.identity,i);
  }
  const ordered=[...unique.values()].sort((a,b)=>a.from-b.from || a.to-b.to);
  let cursor=from,steps=0;
  for(const i of ordered) {
    if(i.from<cursor) return {kind:"unknown",reason:"conflict"};
    if(i.from>cursor) return {kind:"unknown",reason:"gap"};
    cursor=i.to;
    steps+=i.delta;
    if(!Number.isSafeInteger(steps)) return {kind:"unknown",reason:"conflict"};
  }
  if(cursor!==to) return {kind:"unknown",reason:"gap"};
  return {kind:steps===0?"no-steps":"steps-detected",steps};
}
export interface DistanceCoverageInterval {
  from:number;
  to:number;
  /** GPS null means no reliable distance; zero means measured stationary. */
  gpsMeters:number|null;
  steps:StepEvidence;
  /** Positive steps alone do not prove displacement (e.g. stepping in place). */
  displacementCorroborated:boolean;
}
export interface ExperimentalDistanceSummary {
  confirmedGpsMeters:number|null;
  gapEstimatedMeters:number;
  unknownDurationMs:number;
  gpsCoverageMs:number;
  activeDurationMs:number;
  estimated:boolean;
}
export function summarizeDistanceCoverage(intervals:readonly DistanceCoverageInterval[],strideMeters:number):ExperimentalDistanceSummary {
  if(!Number.isFinite(strideMeters)||strideMeters<=0||strideMeters>3) throw new Error("INVALID_STRIDE");
  let confirmedGpsMeters:number|null=null,gapEstimatedMeters=0,unknownDurationMs=0,gpsCoverageMs=0,activeDurationMs=0;
  let lastTo=-Infinity;
  for(const i of [...intervals].sort((a,b)=>a.from-b.from)) {
    if(!Number.isFinite(i.from)||!Number.isFinite(i.to)||i.to<=i.from||i.from<lastTo) throw new Error("INVALID_COVERAGE_INTERVALS");
    lastTo=i.to;
    const duration=i.to-i.from;
    activeDurationMs+=duration;
    if(i.gpsMeters!==null) {
      if(!Number.isFinite(i.gpsMeters)||i.gpsMeters<0) throw new Error("INVALID_GPS_DISTANCE");
      confirmedGpsMeters=(confirmedGpsMeters??0)+i.gpsMeters;
      gpsCoverageMs+=duration;
    } else if(i.steps.kind==="steps-detected" && i.displacementCorroborated &&
      Number.isSafeInteger(i.steps.steps) && i.steps.steps>0) {
      gapEstimatedMeters+=i.steps.steps*strideMeters;
    } else {
      unknownDurationMs+=duration;
    }
  }
  return {confirmedGpsMeters,gapEstimatedMeters,unknownDurationMs,gpsCoverageMs,activeDurationMs,estimated:gapEstimatedMeters>0};
}
