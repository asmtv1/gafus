import { mobileDiagnosticRoutes } from '@gafus/types';

const routes: Readonly<Record<string,string>> = mobileDiagnosticRoutes;
const ring: {screen:string;at:number}[] = [];
let current: string | undefined;

/** Segments are checked against exact build-time templates. No raw path is retained. */
export function recordDiagnosticNavigation(segments: readonly string[], now=Date.now()): void {
  const key=segments.join('/');
  const screen=Object.prototype.hasOwnProperty.call(routes,key)?routes[key]:undefined;
  if(screen===current)return;
  current=screen;
  if(!screen)return;
  ring.push({screen,at:now});
  if(ring.length>12)ring.shift();
}
export function snapshotDiagnosticContext(now=Date.now()) {
  return {
    ...(current?{routeScreen:current}:{}),
    breadcrumbs:ring.filter(e=>now>=e.at && now-e.at<=1_800_000)
      .map(e=>({screen:e.screen,ageMs:now-e.at})),
  };
}
