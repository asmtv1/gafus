export interface RoutePoint {
  accepted: boolean;
  segment: number;
  latitude: number;
  longitude: number;
}
type Coordinate = [number, number];
const METERS_PER_DEGREE = Math.PI * 6371008.8 / 180;
const CHUNK_SIZE = 256;

function longitudeDelta(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}
function localMeters(origin: Coordinate, p: Coordinate): Coordinate {
  return [
    longitudeDelta(p[0], origin[0]) * METERS_PER_DEGREE * Math.cos(origin[1] * Math.PI / 180),
    (p[1] - origin[1]) * METERS_PER_DEGREE,
  ];
}
function pointDistance(p: Coordinate, a: Coordinate, b: Coordinate): number {
  const [px,py] = localMeters(a,p);
  const [bx,by] = localMeters(a,b);
  const length2 = bx*bx + by*by;
  const t = length2 ? Math.max(0,Math.min(1,(px*bx + py*by)/length2)) : 0;
  return Math.hypot(px-t*bx,py-t*by);
}
function isTurn(a: Coordinate, b: Coordinate, c: Coordinate): boolean {
  const before = localMeters(b,a), after = localMeters(b,c);
  const first = Math.hypot(...before), second = Math.hypot(...after);
  if (first < 2 || second < 2) return false;
  // The vectors point away from the vertex; a straight route has cos=-1.
  return (before[0]*after[0] + before[1]*after[1]) / (first*second) > -0.5;
}
function simplifyChunk(coords: Coordinate[], tolerance: number): Coordinate[] {
  const retained = new Set<number>([0,coords.length-1]);
  for (let i=1;i<coords.length-1;i++) {
    if (isTurn(coords[i-1]!,coords[i]!,coords[i+1]!)) retained.add(i);
  }
  const anchors = [...retained].sort((a,b)=>a-b);
  const stack: [number,number][] = [];
  for (let i=1;i<anchors.length;i++) stack.push([anchors[i-1]!,anchors[i]!]);
  while (stack.length) {
    const [first,last] = stack.pop()!;
    let furthest = -1, distance = tolerance;
    for (let i=first+1;i<last;i++) {
      const d = pointDistance(coords[i]!,coords[first]!,coords[last]!);
      if (d > distance) { distance=d; furthest=i; }
    }
    if (furthest >= 0) {
      retained.add(furthest);
      stack.push([first,furthest],[furthest,last]);
    }
  }
  return [...retained].sort((a,b)=>a-b).map(i=>coords[i]!);
}

/** Bounded RDP in local meters. Endpoints, chunk boundaries and sharp turns are fixed. */
export function simplifyWalkCoordinates(coords: Coordinate[], toleranceMeters = 0): Coordinate[] {
  if (!Number.isFinite(toleranceMeters) || toleranceMeters <= 0 || coords.length < 3) return coords;
  const result: Coordinate[] = [];
  for (let i=0;i<coords.length-1;i+=CHUNK_SIZE-1) {
    const chunk = simplifyChunk(coords.slice(i,i+CHUNK_SIZE),toleranceMeters);
    result.push(...(i ? chunk.slice(1) : chunk));
  }
  return result;
}

/** One LineString per segment; rejected fixes and pauses never create false connections. */
export function toWalkGeoJson(points: readonly RoutePoint[], toleranceMeters = 0) {
  const groups = new Map<number, Coordinate[]>();
  for (const p of points) {
    if (!p.accepted || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) ||
        Math.abs(p.latitude)>90 || Math.abs(p.longitude)>180) continue;
    const group = groups.get(p.segment) ?? [];
    group.push([p.longitude, p.latitude]);
    groups.set(p.segment, group);
  }
  return {
    type: "FeatureCollection" as const,
    features: [...groups.entries()]
      .filter(([, coords]) => coords.length > 1)
      .map(([segment, coordinates]) => ({
        type: "Feature" as const,
        properties: { segment },
        geometry: { type: "LineString" as const, coordinates: simplifyWalkCoordinates(coordinates,toleranceMeters) },
      })),
  };
}

export type WalkGeoJson=ReturnType<typeof toWalkGeoJson>;
interface GeometrySegment {
  segment:number; fixed:Coordinate[][]; tail:Coordinate[];
}
/** Append-only cache of completed RDP chunks. Finished chunks are never
 * re-simplified; materialization still creates a GeoJSON array for MapLibre. */
export class WalkGeometryCache {
  private readonly groups=new Map<number,GeometrySegment>();
  private count=0;
  constructor(private readonly toleranceMeters:number) {}
  append(points:readonly RoutePoint[]) {
    for(const p of points) {
      if(!p.accepted||!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||Math.abs(p.latitude)>90||Math.abs(p.longitude)>180) continue;
      if(this.count>=100_000) throw new Error("WALK_TRACK_LIMIT");
      this.count++;
      let group=this.groups.get(p.segment);
      if(!group) {group={segment:p.segment,fixed:[],tail:[]};this.groups.set(p.segment,group);}
      group.tail.push([p.longitude,p.latitude]);
      if(group.tail.length===CHUNK_SIZE) {
        group.fixed.push(simplifyWalkCoordinates(group.tail,this.toleranceMeters));
        group.tail=[group.tail.at(-1)!];
      }
    }
  }
  snapshot():WalkGeoJson {
    return {type:"FeatureCollection",features:[...this.groups.values()].flatMap(group=>{
      const coordinates:Coordinate[]=[];
      for(const chunk of group.fixed) coordinates.push(...(coordinates.length?chunk.slice(1):chunk));
      const tail=simplifyWalkCoordinates(group.tail,this.toleranceMeters);
      coordinates.push(...(coordinates.length?tail.slice(1):tail));
      return coordinates.length>1?[{type:"Feature" as const,properties:{segment:group.segment},geometry:{type:"LineString" as const,coordinates}}]:[];
    })};
  }
}
/** Same version on mobile and web. It is display-only and does not replace
 * canonical coordinates or the corresponding distance summary. */
export const WALK_DISPLAY_GEOMETRY_VERSION=1;
export function finalizeWalkDisplay(points:readonly RoutePoint[],toleranceMeters=2) {
  const cache=new WalkGeometryCache(toleranceMeters);
  cache.append(points);
  return {version:WALK_DISPLAY_GEOMETRY_VERSION,toleranceMeters,geometry:cache.snapshot()};
}
