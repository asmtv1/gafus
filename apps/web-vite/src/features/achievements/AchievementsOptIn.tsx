import { Loading } from "../../shared/ui";
import { BackButton, PrimaryButton } from "../../shared/ui";
import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {ApiError} from "../../shared/api/client";
import {QueryClient,QueryClientProvider,useQuery,useQueryClient} from "@tanstack/react-query";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {AuthUser} from "../../shared/auth/authApi";
import {
 ACHIEVEMENTS_ENTITLEMENT_PATH,projectAchievementsEntitlement,
 type ServerAchievementsEntitlementWire,
} from "./achievementsEntitlement";
import {
  projectAchievementStats,projectTrainingDates,type AchievementSnapshot,
  type SyntheticAchievementTransport,
} from "./achievementsApi";

const safeId=(id:unknown):id is string=>
  typeof id==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(id);
const label:Record<string,string>={
  courses:"Курсы",progress:"Прогресс",streak:"Серии",
  social:"Сообщество",special:"Особые",
};
/** Explicitly isolated opt-in GETs. Ordinary App route remains disabled. */
const readFailure=(error:unknown):string=>{
  // Only numeric protocol status is used, never raw payment/server errors.
  const status=error instanceof ApiError?error.status:
    (error!==null&&typeof error==="object"&&"status" in error&&
     typeof error.status==="number"?error.status:null);
  if(status===401)return "Сессия завершена. Войдите снова.";
  if(status===403)return "Нет доступа к достижениям. Проверьте подписку.";
  if(status===503)return "Проверка доступа на сервере недоступна. Попробуйте позже.";
  return "Не удалось получить достижения. Проверьте доступ и сессию.";
};
function AchievementsScreen({ownerId,wire,isCurrent,onClose}:{
  ownerId:string;wire:SyntheticAchievementTransport;
  isCurrent:()=>boolean;onClose:()=>void;
}){
  const query=useQuery({
    queryKey:["achievements","owner",ownerId],
    queryFn:async():Promise<AchievementSnapshot>=>{
      // React Query's shared cache never stores raw envelopes/private fields.
      const stats=projectAchievementStats(await wire.stats({
        ownerId,method:"GET",path:"/api/v1/achievements"}));
      if(!isCurrent())throw Error("ACHIEVEMENTS_AUTH_STALE");
      const trainingDates=projectTrainingDates(await wire.dates({
        ownerId,method:"GET",path:"/api/v1/achievements/training-dates"}));
      if(!isCurrent())throw Error("ACHIEVEMENTS_AUTH_STALE");
      return {stats,trainingDates};
    },
    retry:false,staleTime:0,gcTime:0,
  });
  if(!isCurrent())return <p role="alert">
    Сессия изменилась. Откройте свой профиль заново.
  </p>;
  const synthetic=wire.fixtureKind==="AG2_ACHIEVEMENTS_OWNER_SYNTHETIC_ONLY";
  return <section className="achievements-panel"
    aria-label={synthetic?"Мои достижения (макет)":"Мои достижения"}>
    <header><h3>Мои достижения</h3>
      <BackButton type="button" onClick={onClose}>Мой профиль</BackButton></header>
    {synthetic?<p className="note">Только синтетические данные. Реальные
      достижения и изменение прогресса здесь не подключены.</p>:
      <p className="note">Только просмотр. Каждый защищённый запрос проверяет
        доступ на сервере; изменение прогресса здесь недоступно.</p>}
    {query.isPending&&<Loading message="Загружаем достижения…" />}
    {query.isError&&<div role="alert" className="empty-state">
      <p>{readFailure(query.error)}</p>
      <PrimaryButton type="button" onClick={()=>void query.refetch()}>
        {synthetic?"Повторить чтение (макет)":"Повторить чтение"}
      </PrimaryButton>
    </div>}
    {query.isSuccess&&!query.isFetching&&<div className="achievements-content">
      <dl className="achievements-totals">
        <div><dt>Курсов начато</dt><dd>{query.data.stats.totalCourses}</dd></div>
        <div><dt>Курсов завершено</dt><dd>{query.data.stats.completedCourses}</dd></div>
        <div><dt>В процессе</dt><dd>{query.data.stats.inProgressCourses}</dd></div>
        <div><dt>Дней завершено</dt><dd>{query.data.stats.totalCompletedDays}</dd></div>
        <div><dt>Общий прогресс</dt><dd>{query.data.stats.overallProgress}%</dd></div>
        <div><dt>Текущая серия</dt><dd>{query.data.stats.currentStreak} дней</dd></div>
      </dl>
      {query.data.stats.achievements.length===0?
        <p role="status" className="empty-state">
          Достижений пока нет. Продолжайте тренировки.
        </p>:<ul className="achievements-grid">
          {query.data.stats.achievements.map(entry=><li key={entry.id}
            className="compact-card">
            <h4>{entry.icon} {entry.title}</h4>
            <p>{entry.description}</p>
            <p className="note">{label[entry.category]}</p>
            <progress value={entry.progress} max={100}
              aria-label={"Прогресс: "+entry.title}/>
            <span>{entry.progress}% · {entry.unlocked?"Получено":"В процессе"}</span>
          </li>)}
        </ul>}
      <p className="note">Дат тренировок: {query.data.trainingDates.dates.length}.
        Точные временные отметки не показываются публично.</p>
    </div>}
  </section>;
}
/** The subscription status is optional presentation, NEVER a permission
 * prerequisite. Both protected GETs enforce Core's current flag/actor access.
 * A private query client with gcTime 0 owns status and snapshot read.
 */
function EntitledAchievements({ownerId,wire,entitlement,isCurrent,onClose}:{
 ownerId:string;wire:SyntheticAchievementTransport;
 entitlement:ServerAchievementsEntitlementWire;
 isCurrent:()=>boolean;onClose:()=>void;
}){
 const check=useQuery({
  queryKey:["achievements","server-entitlement",ownerId],
  queryFn:async()=>{
   const response=await entitlement.load({
    ownerId,method:"GET",path:ACHIEVEMENTS_ENTITLEMENT_PATH,
   });
   if(!isCurrent())throw Error("ACHIEVEMENTS_ENTITLEMENT_STALE");
   return projectAchievementsEntitlement(response);
  },
  retry:false,gcTime:0,staleTime:0,refetchOnWindowFocus:false,
 });
 if(!isCurrent())return <p role="alert">
  Сессия изменилась. Откройте свой профиль заново.</p>;
 // Status is PRESENTATION only: an explicitly disabled server flag lets
 // protected GETs succeed even when subscription status reports inactive.
 // A revoked/expired subscription with gating on still produces 403 on EACH
 // protected GET; never suppress or grant data based on this status query.
 const statusText=check.isPending?"Проверяем состояние подписки…":
  check.isError?"Состояние подписки сейчас недоступно.":
  check.data.allowed?"Подписка активна.":"Активная подписка не найдена.";
 return <section aria-label="Достижения: серверные GET">
   <p role="status">{statusText}</p>
   {check.isError&&<PrimaryButton type="button" onClick={()=>void check.refetch()}>
     Повторить проверку состояния подписки
   </PrimaryButton>}
   <AchievementsScreen ownerId={ownerId} wire={wire}
     isCurrent={isCurrent} onClose={onClose}/>
 </section>;
}
function BoundAchievements({ownerId,wire,entitlement}:{
 ownerId:string;wire:SyntheticAchievementTransport;
 entitlement:ServerAchievementsEntitlementWire;
}){
  const global=useQueryClient();
  const start=useRef(global.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id??null);
  const epoch=useRef(0);
  const lastPrincipal=useRef(start.current);
  const rev=useSyncExternalStore(callback=>
    global.getQueryCache().subscribe(event=>{
      if(event.query.queryKey.length===CURRENT_USER_QUERY_KEY.length&&
        event.query.queryKey.every((k:unknown,i:number)=>k===CURRENT_USER_QUERY_KEY[i])){
        const current=global.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id??null;
        if(current!==lastPrincipal.current&&(current!==null||
          event.type==="removed"||event.query.state.data===null)){
          lastPrincipal.current=current;epoch.current++;callback();
        }
      }
    }),()=>epoch.current,()=>epoch.current);
  const [opened,setOpened]=useState(false);
  const [privateCache]=useState(()=>new QueryClient({defaultOptions:{queries:{
    retry:false,gcTime:0,refetchOnWindowFocus:false,
  }}}));
  useEffect(()=>{
    if(rev!==0){void privateCache.cancelQueries();privateCache.clear();}
  },[rev,privateCache]);
  useEffect(()=>()=>{void privateCache.cancelQueries();privateCache.clear();},
    [privateCache]);
  const current=()=>epoch.current===0&&
    global.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id===ownerId;
  if(start.current!==ownerId||rev!==0||!current())return <p role="alert">
    Сессия изменилась. Откройте свой профиль заново.
  </p>;
  if(!opened)return <section className="achievements-entry" aria-label="Достижения">
    <button type="button" onClick={()=>setOpened(true)}>
      {wire.fixtureKind==="AG2_ACHIEVEMENTS_OWNER_SYNTHETIC_ONLY"
        ?"Достижения и прогресс (макет)":"Достижения и прогресс"}
    </button>
    <p className="note">Изолированный просмотр собственного прогресса</p>
  </section>;
  return <QueryClientProvider client={privateCache}>
    <EntitledAchievements ownerId={ownerId} wire={wire}
      entitlement={entitlement} isCurrent={current}
      onClose={()=>{void privateCache.cancelQueries();privateCache.clear();setOpened(false);}}/>
  </QueryClientProvider>;
}
export function AchievementsOptIn({enabled,ownerId,transport,entitlement}:{
  enabled:boolean;ownerId:string;
  transport?:SyntheticAchievementTransport;
  entitlement?:ServerAchievementsEntitlementWire;
}){
  if(!enabled||!safeId(ownerId)||
    !(transport?.fixtureKind==="AG2_ACHIEVEMENTS_OWNER_SYNTHETIC_ONLY"||
      transport?.fixtureKind==="AG2_ACHIEVEMENTS_HONO_GET_ONLY")||
    !(entitlement?.fixtureKind===
        "AG2_ACHIEVEMENTS_SERVER_ENTITLEMENT_SYNTHETIC_GET_ONLY"||
      entitlement?.fixtureKind===
        "AG2_ACHIEVEMENTS_HONO_STATUS_PRESENTATION_GET_ONLY"))return null;
  return <BoundAchievements ownerId={ownerId} wire={transport}
    entitlement={entitlement}/>;
}
