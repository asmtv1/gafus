import type {WalkFix} from "./types";
import {validFix} from "./motion";

export type FilterKind="alpha-beta"|"robust-kalman";
export type FilterInput=WalkFix&{segment:number};
export type FilteredDisplayPoint=FilterInput&{source:"display-candidate"};
const DEG=Math.PI*6371008.8/180;
const wrap=(x:number)=>((x+540)%360)-180;
interface Axis {p:number;v:number;p00:number;p01:number;p11:number}
const init=():Axis=>({p:0,v:0,p00:25,p01:0,p11:4});
function alphaBeta(axis:Axis,z:number,dt:number,r:number,stationary:boolean):Axis {
  const predicted=axis.p+(stationary?0:axis.v)*dt;
  const residual=z-predicted;
  const alpha=Math.max(.15,Math.min(.85,1/(1+Math.sqrt(r)/5)));
  return {...axis,p:predicted+alpha*residual,
    v:stationary?0:Math.max(-7,Math.min(7,axis.v+.12*residual/dt))};
}
function kalman(axis:Axis,z:number,dt:number,r:number,stationary:boolean):Axis {
  const q=stationary?.05:.7;
  const p=axis.p+(stationary?0:axis.v)*dt,v=stationary?0:axis.v;
  const p00=axis.p00+2*dt*axis.p01+dt*dt*axis.p11+q*dt**4/4;
  const p01=axis.p01+dt*axis.p11+q*dt**3/2;
  const p11=axis.p11+q*dt**2;
  const residual=z-p;
  // Huber-style covariance inflation for a large innovation. Do not reject
  // observations entirely: the position can reacquire after systematic shifts.
  const normalized=Math.abs(residual)/Math.sqrt(Math.max(1,p00+r));
  const inflated=r*Math.max(1,Math.min(16,normalized/2.5));
  const k0=p00/(p00+inflated),k1=p01/(p00+inflated);
  return {p:p+k0*residual,v:stationary?0:Math.max(-7,Math.min(7,v+k1*residual)),
    p00:Math.max(.01,(1-k0)*p00),p01:(1-k0)*p01,p11:Math.max(.01,p11-k1*p01)};
}
/** Experimental causal smoothers on the same admitted observations. Only
 * measurement timestamps produce display points. Gaps/segments reset velocity;
 * these functions never supply canonical distance or predicted-only vertices. */
export function filterWalkDisplay(inputs:readonly FilterInput[],kind:FilterKind):FilteredDisplayPoint[] {
  let origin:FilterInput|null=null,last:FilterInput|null=null,x=init(),y=init();
  const result:FilteredDisplayPoint[]=[];
  for(const fix of inputs) {
    if(!validFix(fix)) continue;
    if(last&&fix.segment===last.segment&&fix.timestamp<=last.timestamp) continue;
    const dt=last?(fix.timestamp-last.timestamp)/1000:0;
    if(!origin||!last||last.segment!==fix.segment||dt>35||dt<=0||
      Math.abs(origin.latitude)>89.5||Math.abs(wrap(fix.longitude-origin.longitude))*DEG>20_000||
      Math.abs(fix.latitude-origin.latitude)*DEG>20_000) {
      origin=fix;last=fix;x=init();y=init();
      result.push({...fix,source:"display-candidate"});
      continue;
    }
    const cos=Math.cos(origin.latitude*Math.PI/180);
    const zX=wrap(fix.longitude-origin.longitude)*DEG*cos,zY=(fix.latitude-origin.latitude)*DEG;
    const r=Math.max(4,Math.min(625,(fix.accuracy??25)**2));
    const stationary=fix.speed!=null&&fix.speed>=0&&fix.speed<.1;
    const update=kind==="alpha-beta"?alphaBeta:kalman;
    x=update(x,zX,dt,r,stationary);y=update(y,zY,dt,r,stationary);
    result.push({...fix,latitude:Math.max(-90,Math.min(90,origin.latitude+y.p/DEG)),
      longitude:wrap(origin.longitude+x.p/(DEG*cos)),source:"display-candidate"});
    last=fix;
  }
  return result;
}
