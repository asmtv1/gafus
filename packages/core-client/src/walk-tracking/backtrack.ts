import {haversineMeters} from "./legacy";
import {displayFixStatus,type DisplayFix} from "./smartMotion";
import type {RoutePoint} from "./geometry";
export interface BacktrackPoint extends RoutePoint {seq:number}
interface Vertex {seq:number;latitude:number;longitude:number;offset:number}
export interface BacktrackPlan {segment:number;vertices:Vertex[];meters:number;hasEarlierSegments:boolean}
export interface BacktrackProgress {offset:number;timestamp:number;lastFix:DisplayFix|null;offRouteCount?:number}
export type BacktrackResult={
  status:"tracking"|"ambiguous"|"off-route"|"stale"|"gap"|"arrived";
  progress:BacktrackProgress;remainingMeters:number;next:Vertex|null;crossTrackMeters:number|null;
};
const DEG=Math.PI*6371008.8/180;
const local=(origin:Pick<DisplayFix,"latitude"|"longitude">,p:Pick<DisplayFix,"latitude"|"longitude">)=>[
  ((p.longitude-origin.longitude+540)%360-180)*DEG*Math.cos(origin.latitude*Math.PI/180),
  (p.latitude-origin.latitude)*DEG,
] as const;
const valid=(p:RoutePoint)=>p.accepted&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180;
/** Take the most recent contiguous recorded segment, in reverse sequence.
 * Never use a nearest point from an older segment, even when it is adjacent. */
export function createBacktrackPlan(points:readonly BacktrackPoint[]):BacktrackPlan|null {
  const accepted=points.filter(valid).sort((a,b)=>a.seq-b.seq);
  if(!accepted.length) return null;
  if(accepted.some((p,i)=>!Number.isSafeInteger(p.seq)||p.seq<=0||(i>0&&p.seq<=accepted[i-1]!.seq))) throw new Error("INVALID_BACKTRACK_SEQUENCE");
  const segment=accepted.at(-1)!.segment;
  let start=accepted.length-1;
  while(start>0&&accepted[start-1]!.segment===segment) start--;
  const vertices:Vertex[]=[];
  let meters=0;
  for(let i=accepted.length-1;i>=start;i--) {
    const p=accepted[i]!,previous=vertices.at(-1);
    if(previous) meters+=haversineMeters(previous,p);
    vertices.push({seq:p.seq,latitude:p.latitude,longitude:p.longitude,offset:meters});
  }
  return {segment,vertices,meters,hasEarlierSegments:start>0};
}
export const initialBacktrackProgress=():BacktrackProgress=>({offset:0,timestamp:0,lastFix:null});
function project(fix:DisplayFix,a:Vertex,b:Vertex) {
  const [px,py]=local(a,fix),[bx,by]=local(a,b),d=bx*bx+by*by;
  const t=d?Math.max(0,Math.min(1,(px*bx+py*by)/d)):0;
  return {offset:a.offset+t*(b.offset-a.offset),error:Math.hypot(px-t*bx,py-t*by),next:b};
}
/** Progress is sequence-aware and bounded by time/displacement, not global
 * nearest-neighbor matching. Ambiguity keeps the last safe progress. */
export function advanceBacktrack(plan:BacktrackPlan,previous:BacktrackProgress,fix:DisplayFix|null,now:number):BacktrackResult {
  const offset=Math.min(plan.meters,Math.max(0,previous.offset));
  const held=(status:BacktrackResult["status"],crossTrackMeters:number|null=null):BacktrackResult=>({
    status,progress:previous,remainingMeters:Math.max(0,plan.meters-offset),
    next:plan.vertices.find(v=>v.offset>offset+.1)??plan.vertices.at(-1)??null,crossTrackMeters,
  });
  const display=displayFixStatus(fix,now);
  if(!display||display.stale||display.accuracyRadius==null||display.accuracyRadius>25||!fix||fix.timestamp<=previous.timestamp) return held("stale");
  const accuracy=Math.max(3,display.accuracyRadius);
  const elapsed=previous.timestamp?(fix.timestamp-previous.timestamp)/1000:0;
  const physical=previous.lastFix?haversineMeters(previous.lastFix,fix):0;
  // First position must be near the recorded endpoint. After a long outage
  // do not leap across loops; the user can restart backtracking explicitly.
  const allowance=previous.timestamp?Math.min(60,Math.max(12,Math.min(elapsed*3+accuracy*2,physical+accuracy*2))):Math.max(12,accuracy*2);
  const low=Math.max(0,offset-Math.min(12,accuracy)),high=Math.min(plan.meters,offset+allowance);
  const matches:{offset:number;error:number;next:Vertex}[]=[];
  if(plan.vertices.length===1) {
    const p=plan.vertices[0]!;
    matches.push({offset:0,error:haversineMeters(fix,p),next:p});
  } else {
    let left=1,right=plan.vertices.length;
    while(left<right){const mid=(left+right)>>1;if(plan.vertices[mid]!.offset<low)left=mid+1;else right=mid;}
    for(let i=left;i<plan.vertices.length;i++) {
    const a=plan.vertices[i-1]!,b=plan.vertices[i]!;
    if(a.offset>high) break;
    if(b.offset<low) continue;
    const candidate=project(fix,a,b);
    if(candidate.offset<low||candidate.offset>high) continue;
    matches.push(candidate);
    }
  }
  matches.sort((a,b)=>a.error-b.error||Math.abs(a.offset-offset)-Math.abs(b.offset-offset));
  const best=matches[0];
  if(!best||best.error>Math.max(10,accuracy*2)) {
    const count=(previous.offRouteCount??0)+1;
    return {...held(count>=2?"off-route":"ambiguous",best?.error??null),
      progress:{...previous,timestamp:fix.timestamp,offRouteCount:count}};
  }
  const ambiguous=matches.some(c=>Math.abs(c.offset-best.offset)>Math.max(12,accuracy*2)&&c.error-best.error<Math.max(3,accuracy*.75));
  if(ambiguous) return held("ambiguous",best.error);
  const nextOffset=Math.max(offset,best.offset);
  const remaining=Math.max(0,plan.meters-nextOffset);
  const atEnd=remaining<=Math.max(3,accuracy)&&haversineMeters(fix,plan.vertices.at(-1)!)<=Math.max(5,accuracy);
  return {status:atEnd?(plan.hasEarlierSegments?"gap":"arrived"):"tracking",
    progress:{offset:nextOffset,timestamp:fix.timestamp,lastFix:fix,offRouteCount:0},
    remainingMeters:atEnd?0:remaining,next:atEnd?null:plan.vertices.find(v=>v.offset>nextOffset+.1)??null,crossTrackMeters:best.error};
}
/** Fixed local coordinates for an offline line; no map tiles are required. */
export function backtrackOfflineLine(plan:BacktrackPlan,width=300,height=180) {
  if(!plan.vertices.length) return {points:"",project:(_fix:DisplayFix)=>null};
  const origin=plan.vertices[0]!;
  const coords=plan.vertices.map(p=>local(origin,p));
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const [x,y] of coords) {minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  const scale=Math.min((width-24)/Math.max(1,maxX-minX),(height-24)/Math.max(1,maxY-minY));
  const convert=(x:number,y:number)=>[width/2+(x-(minX+maxX)/2)*scale,height/2-(y-(minY+maxY)/2)*scale] as const;
  return {points:coords.map(([x,y])=>convert(x,y).join(",")).join(" "),project:(fix:DisplayFix)=>convert(...local(origin,fix))};
}
