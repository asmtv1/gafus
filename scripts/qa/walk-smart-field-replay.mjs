// Local, opt-in replay of an exported QA recording. Never emit coordinates,
// exact timestamps, account IDs, capture IDs or raw source contents.
import {readFileSync} from "node:fs";
import {advanceTracking,createTrackingCheckpoint,classifyGpsSample,haversineMeters,
  classifySmartWindow,stepEvidence,filterWalkDisplay,summarizeDistanceCoverage} from "../../packages/core-client/dist/walk-tracking/index.js";
const captureIndex=process.argv.indexOf("--capture");
if(captureIndex<0||!process.argv[captureIndex+1]) {
  console.error("Usage: node scripts/qa/walk-smart-field-replay.mjs --capture /private/path/record.json [--reference /private/path/windows.json]");
  process.exit(2);
}
function fail(){console.error("Invalid QA capture/reference (details omitted to protect private data).");process.exit(2);}
let capture,reference=[];
try {
  capture=JSON.parse(readFileSync(process.argv[captureIndex+1],"utf8"));
  const ri=process.argv.indexOf("--reference");
  if(ri>=0) reference=JSON.parse(readFileSync(process.argv[ri+1],"utf8"));
} catch {fail();}
if(capture?.schema!==1||!Array.isArray(capture.batches)||capture.batches.length>21000||!Array.isArray(reference)) fail();
const scopes=new Map();
for(const b of capture.batches) {
  if(!Number.isSafeInteger(b.generation)||b.generation<1) fail();
  let s=scopes.get(b.generation);
  if(!s){s={startedAt:null,closedAt:null,events:[],sensorRecords:0};scopes.set(b.generation,s);}
  if(b.kind==="open"||b.kind==="close"){
    if(!Number.isFinite(b.at))fail();
    if(b.kind==="open")s.startedAt=b.at;else s.closedAt=b.at;
    continue;
  }
  if(!Array.isArray(b.fixes)||b.fixes.length>256||!Number.isFinite(b.receivedAt))fail();
  if(s.startedAt==null&&Number.isFinite(b.epochStartedAt))s.startedAt=b.epochStartedAt;
  if(b.stepObservation?.kind!=="unknown"&&b.stepObservation)s.sensorRecords++;
  for(const f of b.fixes) {
    if(!Number.isFinite(f.measuredAt)||!Number.isFinite(f.latitude)||!Number.isFinite(f.longitude))fail();
    s.events.push({receivedAt:b.receivedAt,fix:{timestamp:f.measuredAt,latitude:f.latitude,longitude:f.longitude,
      accuracy:f.accuracy??null,speed:f.speed??null,course:f.course??null}});
  }
}
function pipeline(s,config) {
  const start=s.startedAt??Math.min(...s.events.map(e=>e.fix.timestamp));
  if(!Number.isFinite(start)) return {meters:0,points:[]};
  const end=s.closedAt==null?Math.max(start,...s.events.map(e=>e.fix.timestamp))+1:s.closedAt;
  const eligible=s.events.filter(e=>e.fix.timestamp>=start&&e.fix.timestamp<end);
  if(config===0) {
    let previous=null,meters=0,segment=1;const points=[];
    const ordered=[...eligible].sort((a,b)=>a.fix.timestamp-b.fix.timestamp);
    for(const {fix} of ordered){
      let decision=classifyGpsSample(previous,fix);
      if(decision.reason==="jump"&&previous&&fix.timestamp-previous.timestamp>90000){segment++;decision=classifyGpsSample(null,fix);}
      if(decision.accepted){meters+=decision.meters;previous=fix;points.push({...fix,segment});}
    }
    return {meters,points};
  }
  let checkpoint=createTrackingCheckpoint("qa",start,config);
  const points=[];
  for(const e of eligible){
    const next=advanceTracking(checkpoint,{type:"fix",epoch:"qa",...e});
    checkpoint=next.checkpoint;points.push(...next.points);
  }
  const finish=advanceTracking(checkpoint,{type:"finish",epoch:"qa",at:end-1});
  points.push(...finish.points);
  return {meters:finish.checkpoint.meters,points};
}
const length=points=>points.reduce((sum,p,i)=>sum+(i&&points[i-1].segment===p.segment?haversineMeters(points[i-1],p):0),0);
const sum={legacy:0,v2:0,median:0,lock:0,alphaBetaDisplay:0,robustKalmanDisplay:0,observations:0,epochs:0,sensorRecords:0};
let openEpochs=0;
for(const s of scopes.values()) {
  if(s.closedAt==null)openEpochs++;
  const [v1,v2,median,lock]=[0,1,2,3].map(c=>pipeline(s,c));
  sum.legacy+=v1.meters;sum.v2+=v2.meters;sum.median+=median.meters;sum.lock+=lock.meters;
  sum.alphaBetaDisplay+=length(filterWalkDisplay(v2.points,"alpha-beta"));
  sum.robustKalmanDisplay+=length(filterWalkDisplay(v2.points,"robust-kalman"));
  sum.observations+=s.events.length;sum.epochs++;sum.sensorRecords+=s.sensorRecords;
}
// A separate, independently annotated reference is required before any step
// interval is treated as complete. Native request-time snapshots never suffice.
const evidenceCounts={},coverage=[];
let referenceMeters=0,referenceWindows=0;
for(const w of reference) {
  if(!Number.isSafeInteger(w.generation)||!Number.isFinite(w.from)||!Number.isFinite(w.to)||w.to<=w.from||
     !Number.isSafeInteger(w.steps)||w.steps<0||typeof w.complete!=="boolean")fail();
  const s=scopes.get(w.generation);
  if(!s)fail();
  const scope={ownerId:"qa",walkId:"qa",epoch:String(w.generation),clockGeneration:"annotated",source:"ios-pedometer"};
  const evidence=stepEvidence(scope,w.from,w.to,[{...scope,identity:"reference",from:w.from,to:w.to,delta:w.steps,complete:w.complete}]);
  const fixes=s.events.filter(e=>e.fix.timestamp>=w.from&&e.fix.timestamp<=w.to).map(e=>e.fix);
  const result=classifySmartWindow(fixes,evidence);
  evidenceCounts[result.motion]=(evidenceCounts[result.motion]??0)+1;
  coverage.push({from:w.from,to:w.to,gpsMeters:result.observedMeters,steps:evidence,
    displacementCorroborated:w.displacementCorroborated===true&&result.displacementCorroborated});
  if(Number.isFinite(w.expectedMeters)&&w.expectedMeters>=0){referenceMeters+=w.expectedMeters;referenceWindows++;}
}
let coverageSummary=null;
try{if(coverage.length)coverageSummary=summarizeDistanceCoverage(coverage,.8);}catch{fail();}
const rounded=Object.fromEntries(Object.entries(sum).map(([k,v])=>[k,Math.round(v*1000)/1000]));
console.log(JSON.stringify({schema:1,profile:capture.profile??"unknown",truncated:!!capture.truncated,openEpochs,
  totals:rounded,evidenceCounts,coverageSummary,referenceWindows,referenceMeters,
  fieldAcceptance:"requires-independent-qa",releaseReady:false,
  limitations:"Only observed epochs; display candidate lengths are not user distance. Reference windows require independent validation. No coordinates or timestamps in output."},null,2));
