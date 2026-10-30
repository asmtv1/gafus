import {useRef,useSyncExternalStore} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {AuthUser} from "../../shared/auth/authApi";
import {RouteLink} from "../../shared/router/location";
import {DailyCoursePanel,type DailyReadOnlyLoader} from "./DailyCoursePanel";
import type {DailyToday} from "./dailyCourseApi";

type Props={
  enabled:boolean;userId:string|null;
  loadToday?:()=>Promise<DailyToday>;
  loadDay?:DailyReadOnlyLoader;
  routeMode?:boolean;routeScheduleId?:string|null;enableConnectedProgress?:boolean;
  catalogCard?:boolean;
};
function VerifiedDailyCourse({userId,loadToday,loadDay,
  routeMode,routeScheduleId,enableConnectedProgress,catalogCard}:Omit<Props,"enabled">){
  const cache=useQueryClient();
  const previousPrincipal=useRef(
    cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)??null);
  const initialOwner=useRef(
    cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id??null,
  );
  const revision=useRef(0);
  const currentRevision=useSyncExternalStore(
    callback=>cache.getQueryCache().subscribe(event=>{
      if(event.query.queryKey.length===CURRENT_USER_QUERY_KEY.length&&
        event.query.queryKey.every((value:unknown,index:number)=>
          value===CURRENT_USER_QUERY_KEY[index])){
        const next=cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)??null;
        const prev=previousPrincipal.current;
        if(next?.id!==prev?.id||next?.username!==prev?.username||
          next?.role!==prev?.role||event.type==="removed"){
          previousPrincipal.current=next;
          revision.current++;
          callback();
        }
      }
    }),
    ()=>revision.current,
    ()=>revision.current,
  );
  const actualOwner=cache.getQueryData<AuthUser|null>(
    CURRENT_USER_QUERY_KEY,
  )?.id??null;
  if(!userId)return null;
  if(!initialOwner.current||initialOwner.current!==userId||
    actualOwner!==userId||currentRevision!==0)
    return <section role="alert" className="empty-state" aria-label="Курс дня">
      <p>Сессия изменилась. Откройте каталог заново для просмотра курса дня.</p>
      <RouteLink to="/courses">Все курсы</RouteLink>
    </section>;
  return <DailyCoursePanel userId={userId} loadToday={loadToday}
    loadDay={loadDay} routeMode={routeMode} routeScheduleId={routeScheduleId}
    enableConnectedProgress={enableConnectedProgress} catalogCard={catalogCard}/>;
}
/** Strict component-level opt-in; App mounts only with explicit source fixtures.
 * Daily /day loader must be injected; server createIfMissing=false is
 * NOT proven side-effect free for existing partial userTrainings.
 */
export function DailyCourseOptInHarness({enabled,userId,loadToday,loadDay,
  routeMode=false,routeScheduleId=null,enableConnectedProgress=false,catalogCard=false}:Props){
  if(!enabled)return null;
  return <VerifiedDailyCourse key={userId??"unverified"}
    userId={userId} loadToday={loadToday} loadDay={loadDay}
    routeMode={routeMode} routeScheduleId={routeScheduleId}
    enableConnectedProgress={enableConnectedProgress} catalogCard={catalogCard}/>;
}
