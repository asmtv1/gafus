// Synthetic fixtures only. No user coordinates, no native access, no rollout.
import { advanceTracking, createTrackingCheckpoint, classifyGpsSample, stepEvidence, classifySmartWindow } from "../../packages/core-client/dist/walk-tracking/index.js";
const start = 1_800_000_000_000;
const degree = 180 / (Math.PI * 6371008.8);
const fixture = (name, expectedMeters, xs, speed, accuracy, stepIntervals = []) => ({
  name, expectedMeters, stepIntervals,
  observations: xs.map((x,i) => ({xMeters:x,yMeters:0,measuredAt:start+i*4000,receivedAt:start+i*4000,speed,accuracy}))
});
const fixtures = [
  fixture("false_initial_fix",0,[60,...Array(10).fill(0)],0,5),
  fixture("coherent_drift",0,Array.from({length:21},(_,i)=>i*1.2),null,5,[{from:start,to:start+80_000,delta:0,complete:true}]),
  fixture("short_out_and_back",8.4,Array.from({length:13},(_,i)=>.7*Math.min(i,12-i)),null,8,[{from:start,to:start+48_000,delta:12,complete:true}]),
  fixture("clean_slow",180,Array.from({length:151},(_,i)=>i*1.2),.3,8),
  fixture("stationary_alternating",0,Array.from({length:151},(_,i)=>i%2?7.5:-7.5),0,8),
];
const toFix = o => ({timestamp:o.measuredAt,latitude:o.yMeters*degree,longitude:o.xMeters*degree,accuracy:o.accuracy,speed:o.speed});
function legacy(observations) {
  let previous=null, meters=0;
  for(const observation of observations) {
    const fix=toFix(observation);
    const decision=classifyGpsSample(previous,fix);
    if(decision.accepted) { previous=fix; meters+=decision.meters; }
  }
  return meters;
}
function replay(observations,config) {
  let state=createTrackingCheckpoint("synthetic-stage2",start,config);
  for(const o of observations) {
    state=advanceTracking(state,{type:"fix",epoch:state.epoch,receivedAt:o.receivedAt,fix:toFix(o)}).checkpoint;
    state=JSON.parse(JSON.stringify(state));
  }
  return advanceTracking(state,{type:"finish",epoch:state.epoch,at:observations.at(-1).measuredAt}).checkpoint.meters;
}
const round = x => Number(x.toFixed(3));
const scope={ownerId:"synthetic",walkId:"stage2",epoch:"synthetic",clockGeneration:"simulated",source:"android-counter"};
const rows=fixtures.map(f=>({
  name:f.name,truth:f.expectedMeters,v1:round(legacy(f.observations)),v2:round(replay(f.observations,1)),
  v2Median:round(replay(f.observations,2)),lockCandidate:round(replay(f.observations,3)),
  stepEvidence:stepEvidence(scope,f.observations[0].measuredAt,f.observations.at(-1).measuredAt,
    f.stepIntervals.map((i,index)=>({...scope,identity:String(index),...i}))),
  motionCandidate:classifySmartWindow(f.observations.map(toFix),stepEvidence(scope,f.observations[0].measuredAt,f.observations.at(-1).measuredAt,f.stepIntervals.map((i,index)=>({...scope,identity:String(index),...i})))),
  stepEvidenceIncludedInEngine:false,
}));
const checks={
  baselineFalseStart: rows[0].v2Median===60,
  candidateFalseStart: rows[0].lockCandidate===0,
  baselineCoherentDrift: rows[1].v2Median===16.8,
  baselineShortReversal: rows[2].v2Median===0,
  cleanSlow: Math.abs(rows[3].lockCandidate-180)<=9,
  stationary: rows[4].lockCandidate===0,
  completeZeroSteps:rows[1].stepEvidence.kind==="no-steps",
  completePositiveSteps:rows[2].stepEvidence.kind==="steps-detected",
  driftUncertain:rows[1].motionCandidate.distance==="unknown",
  shortMotionDetectedWithoutMeters:rows[2].motionCandidate.motion==="possible_movement"&&rows[2].motionCandidate.observedMeters===null,
};
console.log(JSON.stringify({fixtureVersion:2,coordinateSystem:"local synthetic meters at equator",rows,checks,syntheticPass:Object.values(checks).every(Boolean),fieldAcceptance:"not_run",releaseReady:false,limitations:"Step evidence and confidence are calculated by the offline candidate; not fed into the stable motion gate. No measured field improvement, no live writer selection."},null,2));
if(process.argv.includes("--require-synthetic") && !Object.values(checks).every(Boolean)) process.exitCode=1;
