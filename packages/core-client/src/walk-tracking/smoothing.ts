import { haversineMeters } from "./legacy";
import type { WalkFix } from "./types";
const median = (a:number,b:number,c:number) => a+b+c-Math.min(a,b,c)-Math.max(a,b,c);
const wrapLongitude = (x:number) => ((x+540)%360)-180;
const relativeLongitude = (x:number,origin:number) => wrapLongitude(x-origin);
function courseChange(a:WalkFix,b:WalkFix) {
  if (a.course == null || b.course == null || (a.speed ?? 0)<0.35 || (b.speed ?? 0)<0.35 ||
      (a.accuracy ?? Infinity)>10 || (b.accuracy ?? Infinity)>10) return 0;
  return Math.abs(wrapLongitude(b.course-a.course));
}
/** Experimental centered three-fix median, with one accepted-fix latency.
 * Actual observed reversals and trusted native course changes retain the vertex. */
export function medianWalkFix(previous:WalkFix, current:WalkFix, next:WalkFix):WalkFix {
  const a=haversineMeters(previous,current), b=haversineMeters(current,next);
  const retrace=haversineMeters(previous,next);
  if ((Math.min(a,b)>=Math.max(2,(current.accuracy ?? 0)*0.5) && retrace<=Math.min(a,b)*0.5) ||
      courseChange(previous,next)>=60) return current;
  const latitude=median(previous.latitude,current.latitude,next.latitude);
  const longitude=wrapLongitude(current.longitude+median(
    relativeLongitude(previous.longitude,current.longitude),0,relativeLongitude(next.longitude,current.longitude),
  ));
  return {...current,latitude,longitude};
}
