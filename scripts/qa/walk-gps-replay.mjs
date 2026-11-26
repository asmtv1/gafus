// Deterministic, synthetic GPS replay. Run after building @gafus/core-client.
// Coordinates are generated around the equator; no real user route is used.
import { advanceTracking, createTrackingCheckpoint, classifyGpsSample, haversineMeters, toWalkGeoJson } from "../../packages/core-client/dist/walk-tracking/index.js";
const version = 1;
const start = 1_800_000_000_000;
const degree = 180 / (Math.PI * 6371008.8);
const fix = (t,x,y=0,speed=null,accuracy=8) => ({
  timestamp:start+t*1000, longitude:x*degree, latitude:y*degree, speed, accuracy,
});
function v1(fixes) {
  let previous=null, meters=0, segment=1;
  const points=[];
  for (const f of fixes) {
    let d=classifyGpsSample(previous,f);
    if(d.reason==="jump" && previous && f.timestamp-previous.timestamp>90_000) {
      segment++; d=classifyGpsSample(null,f);
    }
    if(d.accepted) {
      meters+=d.meters; previous=f;
      points.push({...f,segment,accepted:true,deltaMeters:d.meters});
    }
  }
  return {meters,segments:segment,points};
}
function v2(fixes,configVersion=1) {
  let state=createTrackingCheckpoint("synthetic",start,configVersion);
  const points=[];
  for(const f of fixes) {
    const r=advanceTracking(state,{type:"fix",epoch:"synthetic",receivedAt:start+2_000_000,fix:f});
    state=JSON.parse(JSON.stringify(r.checkpoint));
    points.push(...r.points);
  }
  const end=advanceTracking(state,{type:"finish",epoch:"synthetic",at:start+2_000_000});
  points.push(...end.points);
  return {meters:end.checkpoint.meters,segments:new Set(points.map(p=>p.segment)).size,points};
}
const square = Array.from({length:41},(_,i)=>{
  const m=i*4;
  return m<=40?[m,0]:m<=80?[40,m-40]:m<=120?[120-m,40]:[0,160-m];
});
const noisySquare=square.map(([x,y],i)=>[x+3*Math.sin(1.7*i),y+3*Math.sin(1.2*i)]);
const fixtures=[
  {name:"stationary_alternating",expected:0,fixes:Array.from({length:151},(_,i)=>fix(i*4,i%2?7.5:-7.5,0,0))},
  {name:"stationary_exact",expected:0,fixes:Array.from({length:151},(_,i)=>fix(i*4,0,0,0))},
  {name:"slow_straight",expected:180,fixes:Array.from({length:151},(_,i)=>fix(i*4,i*1.2,0,0.3))},
  {name:"square_clean",expected:160,fixes:square.map(([x,y],i)=>fix(i*4,x,y,1,6))},
  {name:"square_noisy",expected:160,fixes:noisySquare.map(([x,y],i)=>fix(i*4,x,y,1,6))},
  {name:"gap_60s_with_recovery",expected:15,fixes:[fix(0,0,0,1),fix(4,5,0,1),fix(64,85,0,1),fix(68,90,0,1),fix(72,95,0,1)]},
  {name:"running",expected:600,fixes:Array.from({length:31},(_,i)=>fix(i*4,i*20,0,5,5))},
  {name:"out_and_back",expected:200,fixes:Array.from({length:51},(_,i)=>fix(i*4,i<=25?i*4:200-i*4,0,1,5))},
];
const round = x=>Number(x.toFixed(3));
const rows=fixtures.map(f=>{
  const a=v1(f.fixes), b=v2(f.fixes), c=v2(f.fixes,2);
  return {scenario:f.name,expectedObservedMeters:f.expected,v1Meters:round(a.meters),v2Meters:round(b.meters),
    medianMeters:round(c.meters),v1Segments:a.segments,v2Segments:b.segments,medianSegments:c.segments,raw:f.fixes.length,medianAccepted:c.points.length,medianDisplay:toWalkGeoJson(c.points,2).features.reduce((sum,feature)=>sum+feature.geometry.coordinates.length,0),acceptedV2:b.points.length,
    displayV2:toWalkGeoJson(b.points,2).features.reduce((sum,feature)=>sum+feature.geometry.coordinates.length,0)};
});
// Replay-only alternatives. They are not enabled in the writer.
// Compare geometry and length rather than selecting solely by distance.
function ema(points,alpha) {
  let last;
  return points.map(p=>last=last?p.map((x,i)=>alpha*x+(1-alpha)*last[i]):p);
}
function median(points) {
  return points.map((p,i)=>i===0||i===points.length-1?p:[0,1].map(axis=>
    [points[i-1][axis],p[axis],points[i+1][axis]].sort((a,b)=>a-b)[1]));
}
function kalman(points,adaptive) {
  const dt=4, R=16;
  const axes=points[0].map(x=>({x,v:0,p00:16,p01:0,p11:4}));
  return points.map((point,i)=>{
    if(i===0)return point;
    return axes.map((s,axis)=>{
      const prediction=s.x+dt*s.v;
      const residual=point[axis]-prediction;
      const sigma=adaptive&&Math.abs(residual)>Math.sqrt(s.p00+R)*1.5?1.5:0.6;
      const q=sigma*sigma;
      const p00=s.p00+2*dt*s.p01+dt*dt*s.p11+q*dt**4/4;
      const p01=s.p01+dt*s.p11+q*dt**3/2;
      const p11=s.p11+q*dt*dt;
      const k0=p00/(p00+R), k1=p01/(p00+R);
      s.x=prediction+k0*residual; s.v+=k1*residual;
      s.p00=(1-k0)*p00; s.p01=(1-k0)*p01; s.p11=p11-k1*p01;
      return s.x;
    });
  });
}
function measure(name,points) {
  let meters=0, squared=0, corner=0;
  points.forEach((p,i)=>{
    if(i) meters+=Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1]);
    const error=Math.hypot(p[0]-square[i][0],p[1]-square[i][1]);
    squared+=error*error;
    if([10,20,30].includes(i))corner=Math.max(corner,error);
  });
  return {candidate:name,meters:round(meters),positionRMSE:round(Math.sqrt(squared/points.length)),maxCornerError:round(corner)};
}
const smoothing=[
  measure("raw",noisySquare),
  measure("EMA_0.5",ema(noisySquare,0.5)),
  measure("median_3_centered_one_fix_delay",median(noisySquare)),
  measure("Kalman_fixed",kalman(noisySquare,false)),
  measure("Kalman_adaptive_residual",kalman(noisySquare,true)),
];
const medianCanonical=v2(fixtures.find(f=>f.name==="square_noisy").fixes,2).points;
const errors=medianCanonical.map(p=>{
  const i=(p.timestamp-start)/4000;
  return {i,error:Math.hypot(p.longitude/degree-square[i][0],p.latitude/degree-square[i][1])};
});
const corners=errors.filter(e=>[10,20,30].includes(e.i));
const medianActualShape={positionRMSE:round(Math.sqrt(errors.reduce((s,e)=>s+e.error**2,0)/errors.length)),
  maxCornerError:corners.length===3?round(Math.max(...corners.map(e=>e.error))):null,cornerCount:corners.length};
const row=name=>rows.find(r=>r.scenario===name);
const syntheticChecks={
  stationary:row("stationary_alternating").medianMeters===0,
  slow:Math.abs(row("slow_straight").medianMeters-180)<=9,
  gap:row("gap_60s_with_recovery").medianMeters===15 && row("gap_60s_with_recovery").medianSegments===2,
  noisyImprovement:Math.abs(row("square_noisy").medianMeters-160)<=Math.abs(row("square_noisy").v1Meters-160)*0.8,
  corners:medianActualShape.cornerCount===3 && medianActualShape.maxCornerError<=5,
  reversal:Math.abs(row("out_and_back").medianMeters-200)<=0.01,
};
const syntheticPass=Object.values(syntheticChecks).every(Boolean);
const report={fixtureVersion:version,config:"v2 baseline / v2 median",rows,smoothing,medianActualShape,syntheticChecks,syntheticPass,fieldAcceptance:"not_run",releaseReady:false,limitations:"Synthetic only. Gap truth counts observed segments, not an invented route across missing GPS. Smoothers are offline candidates, not production selections."};
console.log(JSON.stringify(report,null,2));
if(process.argv.includes("--require-synthetic") && !syntheticPass) process.exitCode=1;
