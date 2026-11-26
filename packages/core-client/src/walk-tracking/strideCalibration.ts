export type StrideTempo="slow"|"walking"|"running";
export interface StrideScope {ownerId:string;deviceId:string;source:string}
export interface StrideWindow extends StrideScope {
  identity:string;walkId:string;from:number;to:number;tempo:StrideTempo;
  steps:number;gpsMeters:number;complete:boolean;reliableGps:boolean;
  mixedTempo:boolean;hasPauseOrGap:boolean;usedStepEstimate:boolean;
}
export interface StrideBucket {metersPerStep:number;windows:number;walks:number;spread:number|null;ready:boolean;updatedAt:number|null}
export interface StrideModel {version:1;scope:StrideScope;prior:number;buckets:Record<StrideTempo,StrideBucket>;}
const tempos:StrideTempo[]=["slow","walking","running"];
const median=(values:number[])=>{const a=[...values].sort((x,y)=>x-y),i=Math.floor(a.length/2);return a.length%2?a[i]!:(a[i-1]!+a[i]!)/2;};
const sameScope=(a:StrideScope,b:StrideScope)=>a.ownerId===b.ownerId&&a.deviceId===b.deviceId&&a.source===b.source;
/** Pure calibration over immutable qualified windows. Replays are idempotent.
 * No window with estimated distance can train the model. */
export function calibrateStride(scope:StrideScope,windows:readonly StrideWindow[],prior=.8):StrideModel {
  if(!Number.isFinite(prior)||prior<.2||prior>2.5) throw new Error("INVALID_STRIDE_PRIOR");
  const dedup=new Map<string,StrideWindow>(),conflicts=new Set<string>();
  for(const w of windows) {
    if(!sameScope(w,scope)||!w.identity||!w.walkId||!tempos.includes(w.tempo)||!Number.isFinite(w.from)||!Number.isFinite(w.to)||
      w.to-w.from<30_000||w.to-w.from>120_000||!Number.isSafeInteger(w.steps)||w.steps<30||
      !Number.isFinite(w.gpsMeters)||w.gpsMeters<=0||!w.complete||!w.reliableGps||w.mixedTempo||w.hasPauseOrGap||w.usedStepEstimate) continue;
    const ratio=w.gpsMeters/w.steps;
    if(ratio<.2||ratio>2.5) continue;
    const old=dedup.get(w.identity);
    if(old&&(old.walkId!==w.walkId||old.from!==w.from||old.to!==w.to||old.tempo!==w.tempo||old.steps!==w.steps||old.gpsMeters!==w.gpsMeters)) conflicts.add(w.identity);
    else dedup.set(w.identity,w);
  }
  const valid=[...dedup.values()].filter(w=>!conflicts.has(w.identity)).sort((a,b)=>a.walkId.localeCompare(b.walkId)||a.from-b.from||a.to-b.to||a.identity.localeCompare(b.identity));
  // Reject every overlapping training window, including windows of other tempi.
  const disjoint=valid.filter((w,i)=>!valid.some((v,j)=>j!==i&&v.walkId===w.walkId&&v.from<w.to&&v.to>w.from));
  const buckets={} as Record<StrideTempo,StrideBucket>;
  for(const tempo of tempos) {
    const eligible=disjoint.filter(w=>w.tempo===tempo);
    const count=eligible.length,walks=new Set(eligible.map(w=>w.walkId)).size;
    const values=eligible.map(w=>w.gpsMeters/w.steps);
    const center=count?median(values):prior;
    const spread=count?median(values.map(x=>Math.abs(x-center))):null;
    const ready=count>=5&&walks>=2&&spread!==null&&spread<=center*.2;
    buckets[tempo]={metersPerStep:ready?center:prior,windows:count,walks,spread,ready,updatedAt:count?Math.max(...eligible.map(w=>w.to)):null};
  }
  return {version:1,scope:{...scope},prior,buckets};
}
