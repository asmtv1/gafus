import {useRef,useSyncExternalStore} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {AuthUser} from "../../shared/auth/authApi";
import {RouteLink} from "../../shared/router/location";
import type {TrainingDaysOverview,TrainingDaySummary} from "./trainingDaysApi";
import type {TrainingDayDetail} from "./trainingDayApi";
import {TrainingIndex} from "./TrainingIndex";

type Props={
  enabled:boolean;
  userId:string|null;
  courseType:string;
  courseName:string;
  loadDays?:(type:string)=>Promise<TrainingDaysOverview>;
  showStepsOptIn?:boolean;
  loadDay?:(type:string,day:TrainingDaySummary)=>Promise<TrainingDayDetail>;
  routeMode?:boolean;routeDayId?:string|null;
};

/**
 * Owner + authEpoch fence at the actual opt-in mount boundary.
 * In particular A -> B -> A, logout -> login A and same-owner auth
 * revalidation cannot silently retain A's old steps / signed media.
 *
 * A change requires the parent to explicitly re-enter this opt-in screen;
 * the old mounted instance NEVER autonomously re-issues a GET.
 */
function SessionBoundTrainingIndex({
  userId,courseType,courseName,loadDays,showStepsOptIn,loadDay,
  routeMode,routeDayId,
}:Omit<Props,"enabled">){
  const cache=useQueryClient();
  const previousPrincipal=useRef(
    cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)??null);
  const initialOwner=useRef(
    cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id??null,
  );
  const authEpoch=useRef(0);
  const version=useSyncExternalStore(
    callback=>cache.getQueryCache().subscribe(event=>{
      if(event.query.queryKey.length===CURRENT_USER_QUERY_KEY.length &&
        event.query.queryKey.every((part:unknown,index:number)=>
          part===CURRENT_USER_QUERY_KEY[index])){
        const next=cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)??null;
        const prev=previousPrincipal.current;
        if(next?.id!==prev?.id||next?.username!==prev?.username||
          next?.role!==prev?.role||event.type==="removed"){
          previousPrincipal.current=next;
          authEpoch.current+=1;
          callback();
        }
      }
    }),
    ()=>authEpoch.current,
    ()=>authEpoch.current,
  );
  const actualOwner=cache.getQueryData<AuthUser|null>(
    CURRENT_USER_QUERY_KEY,
  )?.id??null;
  if(userId&&(initialOwner.current!==userId||
    actualOwner!==userId||version!==0)){
    return <section className="empty-state" role="alert"
      aria-label="Сессия тренировок изменена">
      <p>Сессия изменилась. Просмотр тренировок закрыт. Откройте курс заново.</p>
      <RouteLink to="/courses">К каталогу курсов</RouteLink>
    </section>;
  }
  return <TrainingIndex userId={userId}
    courseType={courseType} courseName={courseName} loadDays={loadDays}
    showStepsOptIn={showStepsOptIn} loadDay={loadDay}
    routeMode={routeMode} routeDayId={routeDayId}/>;
}

/** Strict opt-in mounted view, NOT an application route or feature flag. */
export function TrainingIndexOptInHarness({
  enabled,userId,courseType,courseName,loadDays,
  showStepsOptIn=false,loadDay,routeMode=false,routeDayId=null,
}:Props){
  if(!enabled)return null;
  return <SessionBoundTrainingIndex
    key={(userId??"unverified")+":"+courseType}
    userId={userId} courseType={courseType} courseName={courseName}
    loadDays={loadDays} showStepsOptIn={showStepsOptIn} loadDay={loadDay}
    routeMode={routeMode} routeDayId={routeDayId}/>;
}
