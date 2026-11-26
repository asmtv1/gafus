import { describe, expect, it } from "vitest";
import { advanceTracking, createTrackingCheckpoint } from "./engine";
import { classifyGpsSample, type GpsSample } from "./legacy";
import type { CanonicalPoint, WalkFix } from "./types";

const start = 1_000_000;
const degree = 180 / (Math.PI * 6371008.8);
function fix(seconds: number, x: number, speed: number | null = null, y = 0, accuracy = 8): WalkFix {
  return { timestamp: start + seconds * 1000, latitude: y * degree, longitude: x * degree, accuracy, speed };
}
function replay(fixes: WalkFix[], restore = false, configVersion: 1 | 2 | 3 = 1) {
  let state = createTrackingCheckpoint("test", start, configVersion);
  const points: CanonicalPoint[] = [];
  for (const f of fixes) {
    const r = advanceTracking(state, { type: "fix", epoch: "test", receivedAt: start + 1_000_000, fix: f });
    points.push(...r.points);
    state = restore ? JSON.parse(JSON.stringify(r.checkpoint)) : r.checkpoint;
  }
  const end = advanceTracking(state, { type: "finish", epoch: "test", at: start + 1_000_000 });
  points.push(...end.points);
  return { state: end.checkpoint, points };
}
function legacy(fixes: GpsSample[]) {
  let previous: GpsSample | null = null, meters = 0, segments = 1;
  for (const f of fixes) {
    let decision = classifyGpsSample(previous, f);
    if (decision.reason === "jump" && previous && f.timestamp - previous.timestamp > 90_000) {
      segments++;
      decision = classifyGpsSample(null, f);
    }
    if (decision.accepted) { previous = f; meters += decision.meters; }
  }
  return { meters, segments };
}
describe("GPS replay candidate", () => {
  it("reproduces legacy drift and suppresses alternating 15 m noise", () => {
    const fixes = Array.from({length: 151}, (_, i) => fix(i*4, i%2 ? 7.5 : -7.5, 0));
    expect(legacy(fixes).meters).toBeCloseTo(2250, 6);
    const result = replay(fixes);
    expect(result.state.meters).toBe(0);
    expect(result.state.sufficient).toBe(true);
    expect(result.points).toHaveLength(1);
  });
  it("does not split a continuously observed stop", () => {
    const fixes = Array.from({length:151}, (_, i) => fix(i*4,0,0));
    expect(legacy(fixes).segments).toBe(7);
    const result = replay(fixes);
    expect(result.points.map(p => p.segment)).toEqual([1]);
  });
  it("keeps slow walking within 5 percent", () => {
    const fixes = Array.from({length:151}, (_, i) => fix(i*4,i*1.2,0.3));
    expect(legacy(fixes).meters).toBeCloseTo(169.2, 5);
    expect(replay(fixes).state.meters).toBeGreaterThanOrEqual(171);
    expect(replay(fixes).state.meters).toBeLessThanOrEqual(189);
  });
  it("requires two observations after a signal gap and charges zero for the connection", () => {
    const result = replay([fix(0,0,1),fix(4,5,1),fix(64,85,1),fix(68,90,1),fix(72,95,1)]);
    const starts = result.points.filter(p => p.reason === "first");
    expect(starts.map(p => p.segment)).toEqual([1,2]);
    expect(starts.every(p => p.deltaMeters === 0)).toBe(true);
    expect(result.state.meters).toBeLessThan(20);
  });
  it("is deterministic across checkpoint restoration and duplicate delivery", () => {
    const fixes = Array.from({length:40}, (_, i) => fix(i*4,i*4,1));
    expect(replay(fixes, true)).toEqual(replay(fixes));
    const duplicate = replay(fixes.flatMap(f => [f,f]));
    expect(duplicate.points).toEqual(replay(fixes).points);
    expect(duplicate.state.meters).toEqual(replay(fixes).state.meters);
  });
  it("isolates stale epochs, future fixes and measurements before resume", () => {
    let s = createTrackingCheckpoint("first",start);
    s = advanceTracking(s,{type:"pause",epoch:"first",at:start+10_000}).checkpoint;
    s = advanceTracking(s,{type:"resume",epoch:"first",nextEpoch:"second",at:start+20_000}).checkpoint;
    const old = advanceTracking(s,{type:"fix",epoch:"first",receivedAt:start+30_000,fix:fix(25,100)});
    expect(old.checkpoint).toEqual(s);
    const stale = advanceTracking(s,{type:"fix",epoch:"second",receivedAt:start+30_000,fix:fix(15,100)});
    expect(stale.checkpoint.pending).toHaveLength(0);
    const future = advanceTracking(s,{type:"fix",epoch:"second",receivedAt:start+30_000,fix:fix(60,100)});
    expect(future.checkpoint.pending).toHaveLength(0);
  });
  it("median candidate reduces noisy-square error without losing confirmed reversals", () => {
    const square = Array.from({length:41},(_,i)=>{
      const m=i*4;
      const [x,y]=m<=40?[m,0]:m<=80?[40,m-40]:m<=120?[120-m,40]:[0,160-m];
      return fix(i*4,x!+3*Math.sin(1.7*i),1,y!+3*Math.sin(1.2*i),6);
    });
    const result=replay(square,false,2);
    expect(Math.abs(result.state.meters-160)).toBeLessThan(Math.abs(legacy(square).meters-160)*0.8);
    expect(replay(square,true,2)).toEqual(result);
    expect(result.state.pendingCanonical).toBeNull();
    const reversals=Array.from({length:51},(_,i)=>fix(i*4,i<=25?i*4:200-i*4,1,0,5));
    expect(replay(reversals,false,2).state.meters).toBeCloseTo(200,5);
  });
  it("median candidate flushes each segment without smoothing across a gap", () => {
    const result=replay([fix(0,0,1),fix(4,5,1),fix(64,85,1),fix(68,90,1),fix(72,95,1)],false,2);
    expect(result.state.meters).toBeCloseTo(15,5);
    expect(result.points.filter(p=>p.reason==="first").map(p=>p.deltaMeters)).toEqual([0,0]);
    expect(result.points.at(-1)?.timestamp).toBe(start+72_000);
  });
  it("chooses the better duplicate timestamp in the reorder window", () => {
    const fixes = [fix(0,0,1),fix(4,4,1,0,15),fix(4,5,1,0,4),fix(8,9,1),fix(12,13,1)];
    expect(replay(fixes).points).toEqual(replay([fixes[0]!,fixes[2]!,fixes[1]!,...fixes.slice(3)]).points);
  });
});

describe("P0 experimental lock (config 3, not a production writer)", () => {
  it("reproduces the 60 m baseline regression and discards the isolated first fix", () => {
    const fixes = [fix(0,60,0,0,5), ...Array.from({length:10},(_,i)=>fix((i+1)*4,0,0,0,5))];
    expect(replay(fixes,false,2).state.meters).toBeCloseTo(60,5);
    const candidate = replay(fixes,false,3);
    expect(candidate.state.meters).toBe(0);
    expect(candidate.points[0]?.timestamp).toBe(start+4000);
    expect(replay(fixes,true,3)).toEqual(candidate);
  });
  it("preserves clean slow starts and separates reacquisition from the old segment", () => {
    const slow = Array.from({length:151},(_,i)=>fix(i*4,i*1.2,0.3));
    expect(replay(slow,false,3).state.meters).toBeCloseTo(180,5);
    const gap = [fix(0,0,1),fix(4,5,1),fix(64,150,0,0,5),fix(68,85,1,0,5),fix(72,90,1,0,5),fix(76,95,1,0,5)];
    const result = replay(gap,false,3);
    expect(result.state.meters).toBeCloseTo(15,5);
    expect(result.points.filter(p=>p.reason==="first").map(p=>p.deltaMeters)).toEqual([0,0]);
  });
  it("freezes the two ambiguous GPS-only baseline regressions", () => {
    const drift = Array.from({length:21},(_,i)=>fix(i*4,1.2*i,null,0,5));
    const reversal = Array.from({length:13},(_,i)=>fix(i*4,0.7*Math.min(i,12-i),null,0,8));
    expect(replay(drift,false,2).state.meters).toBeCloseTo(16.8,5);
    expect(replay(reversal,false,2).state.meters).toBe(0);
  });
});
