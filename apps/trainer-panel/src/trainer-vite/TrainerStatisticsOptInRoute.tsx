import {
  createElement, useCallback, useEffect, useMemo, useRef, useState,
  type ChangeEvent, type ReactElement,
} from "react";
import type { PanelActor } from "./consultationContract";
import {
  fetchProposedTrainerStatistics,
  type CourseStatistics, type StatisticsKind, type StatisticsScope,
  type StepStatistics, type TrainerStatisticsDto,
} from "./trainerStatisticsProposedConsumer";

/** AG1 GETs are mounted in source; browser enablement still requires separate consent. */
type LiveSession = {actor:PanelActor;token:string|null;authEpoch?:string}|null;
export type TrainerStatisticsProps = {
  actor:PanelActor; token:string|null; authEpoch?:string;
  getCurrentSession?:()=>LiveSession;
  fetchImpl:typeof fetch;
  enableProposedStatistics?:boolean;
};
type View = {phase:"idle"|"loading"|"ready"|"failed"|"denied";
  principal:string;kind:StatisticsKind;scopeKey:string;data?:TrainerStatisticsDto};
type AdminChoice = {principal:string;scope:StatisticsScope};
const idOk=(s:string)=>/^[A-Za-z0-9_-]{1,128}$/.test(s);

export function TrainerStatisticsOptInRoute(props:TrainerStatisticsProps):ReactElement {
  const {actor,token,authEpoch,getCurrentSession,fetchImpl}=props;
  const stableActor=useMemo<PanelActor>(()=>({id:actor.id,role:actor.role}),
    [actor.id,actor.role]);
  const principal=JSON.stringify([actor.id,actor.role,authEpoch,token]);
  const readerRef=useRef(getCurrentSession);
  readerRef.current=getCurrentSession;
  const fallbackRef=useRef<LiveSession>(null);
  fallbackRef.current={actor:stableActor,token,authEpoch};
  const readCurrent=useCallback(()=>readerRef.current?
    readerRef.current():fallbackRef.current,[]);
  const verified=useCallback(()=>{
    const now=readCurrent();
    return !!token && !!authEpoch && idOk(stableActor.id) &&
      (stableActor.role==="TRAINER"||stableActor.role==="ADMIN") &&
      !!now && now.actor.id===stableActor.id && now.actor.role===stableActor.role &&
      now.token===token && now.authEpoch===authEpoch;
  },[readCurrent,stableActor,token,authEpoch]);
  const allowed=verified();
  const [kind,setKind]=useState<StatisticsKind>("courses");
  const [adminChoice,setAdminChoice]=useState<AdminChoice|null>(null);
  const [targetInput,setTargetInput]=useState("");
  const [retryVersion,setRetryVersion]=useState(0);
  const [view,setView]=useState<View>({phase:"idle",principal:"",kind:"courses",scopeKey:""});
  const activeRequest=useRef(0);
  const scope=useMemo<StatisticsScope|null>(()=>{
    if(stableActor.role==="TRAINER")return {kind:"own"};
    if(stableActor.role!=="ADMIN"||adminChoice?.principal!==principal)return null;
    return adminChoice.scope;
  },[stableActor,adminChoice,principal]);
  const scopeKey=scope?.kind==="trainer"?"trainer:"+scope.trainerUserId:scope?.kind??"";
  const proposedEnabled=props.enableProposedStatistics===true;
  useEffect(()=>{
    const requestRef=activeRequest;
    const serial=++requestRef.current;
    const abort=new AbortController();
    if(!proposedEnabled || !verified() || !scope){
      setView({phase:"idle",principal,kind,scopeKey});
      return ()=>{abort.abort();requestRef.current++;};
    }
    setView({phase:"loading",principal,kind,scopeKey});
    void fetchProposedTrainerStatistics({
      actor:stableActor,token:token!,kind,scope,fetchImpl,signal:abort.signal,
      isCurrent:()=>serial===requestRef.current && verified(),
    }).then(data=>{
      if(serial===requestRef.current&&verified()&&!abort.signal.aborted){
        setView({phase:"ready",data,principal,kind,scopeKey});
      }
    }).catch((error:unknown)=>{
      if(serial===requestRef.current&&verified()&&!abort.signal.aborted){
        const selfDenied=stableActor.role==="TRAINER"&&scope.kind==="own"&&
          error instanceof Error&&error.message==="HTTP_403";
        setView({phase:selfDenied?"denied":"failed",principal,kind,scopeKey});
      }
    });
    return ()=>{abort.abort();requestRef.current++;};
  },[proposedEnabled,stableActor,token,authEpoch,kind,scope,scopeKey,
    principal,retryVersion,fetchImpl,verified]);
  const visible=view.principal===principal&&view.kind===kind&&view.scopeKey===scopeKey;
  const safeView=visible?view:{phase:"idle" as const,principal,kind,scopeKey};
  const changeKind=(next:StatisticsKind)=>{
    if(!verified()||!proposedEnabled)return;
    setKind(next);
  };
  const setScope=(next:StatisticsScope)=>{
    if(!verified()||stableActor.role!=="ADMIN"||!proposedEnabled)return;
    setAdminChoice({principal,scope:next});
  };
  if(!allowed)return createElement("main",null,
    createElement("h1",null,"Статистика"),
    createElement("p",{role:"alert"},"Доступ к статистике не подтверждён"));
  return createElement("main",{"data-ag4-trainer-statistics":"opt-in",style:{maxWidth:960,margin:"0 auto",padding:12}},
    createElement("h1",null,"Статистика"),
    createElement("nav",{"aria-label":"Разделы статистики"},
      createElement("a",{href:"/main-panel"},"Назад в панель тренера"),
      createElement("a",{href:"/main-panel/statistics","aria-current":"page"},"Обновить страницу")),
    !proposedEnabled?createElement("p",{role:"status"},
      "Статистика пока выключена в браузере. Запросы отключены."):
      createElement("section",null,
        createElement("div",{"aria-label":"Вид статистики"},
          createElement("button",{type:"button","aria-pressed":kind==="courses",
            onClick:()=>changeKind("courses")},"Курсы"),
          createElement("button",{type:"button","aria-pressed":kind==="steps",
            onClick:()=>changeKind("steps")},"Шаги")),
        stableActor.role==="ADMIN"?createElement("section",{"aria-label":"Область статистики администратора"},
          createElement("button",{type:"button",onClick:()=>setScope({kind:"all"})},"Все тренеры"),
          createElement("input",{type:"text",value:targetInput,
            "aria-label":"ID кинолога для статистики",maxLength:128,
            onChange:(e:ChangeEvent<HTMLInputElement>)=>setTargetInput(e.target.value)}),
          createElement("button",{type:"button",onClick:()=>{
            if(idOk(targetInput))setScope({kind:"trainer",trainerUserId:targetInput});
          }},"Показать кинолога"),
          !scope?createElement("p",{role:"status"},"Выберите область статистики"):
            createElement("p",{role:"status"},scopeKey==="all"?
              "Область: все тренеры":"Область: конкретный кинолог")) : null,
        scope&&safeView.phase==="loading"?createElement("p",{role:"status"},"Загрузка статистики"):null,
        scope&&stableActor.role==="TRAINER"&&scope.kind==="own"&&
        safeView.phase==="denied"?createElement("p",{role:"alert"},
          "Нет доступа к своей статистике"):null,
        scope&&safeView.phase==="failed"?createElement("div",null,
          createElement("p",{role:"alert"},"Не удалось загрузить статистику"),
          createElement("button",{type:"button","aria-label":"Повторить чтение статистики",
            onClick:()=>{if(verified())setRetryVersion(x=>x+1);}},"Повторить загрузку")):null,
        scope&&safeView.phase==="ready"&&safeView.data?
          renderStatistics(kind,safeView.data):null,
      ),
  );
}
function renderStatistics(kind:StatisticsKind,data:TrainerStatisticsDto):ReactElement {
  if(kind==="courses"){
    const stats=data as CourseStatistics;
    return createElement("section",{"aria-label":"Статистика курсов"},
      createElement("p",null,"Курсов: "+stats.totalCourses),
      createElement("p",null,"Дней тренировок: "+stats.totalDays),
      createElement("p",null,"Активность: "+(stats.totalCourses>0?Math.round(stats.totalDays/stats.totalCourses*10)/10:0)+" дней/курс"),
      stats.courses.length===0?createElement("p",{role:"status"},"Курсы не найдены"):
        createElement("ul",null,...stats.courses.map(c=>createElement("li",{key:c.id},
          createElement("strong",null,c.name),
          createElement("span",null,
            ` — участников: ${c.totalUsers}, завершили: ${c.completedUsers}, `+
            `в процессе: ${c.inProgressUsers}, не начали: ${c.notStartedUsers}`),
          createElement("p",null,`Завершение: ${c.totalUsers>0?Math.round(c.completedUsers/c.totalUsers*100):0}%`),
          createElement("p",null,`Уровень: ${c.trainingLevel}; ${c.isPaid?"платный":c.isPrivate?"приватный":"публичный"}; ${c.isPersonalized?"персонализированный":"обычный"}; рейтинг: ${c.avgRating===null?"нет оценок":c.avgRating.toFixed(1)}`)))),
    );
  }
  const stats=data as StepStatistics;
  return createElement("section",{"aria-label":"Статистика шагов"},
    createElement("p",null,"Шагов: "+stats.totalSteps),
    createElement("p",null,"Прогресс пользователей для шагов не рассчитывается"),
    stats.steps.length===0?createElement("p",{role:"status"},"Шагов пока нет"):
      createElement("ul",null,...stats.steps.map(s=>createElement("li",{key:s.id},
        createElement("strong",null,s.title),
        createElement("span",null,
          ` — используется в днях: ${s.usedInDaysCount}, в курсах: ${s.usedInCoursesCount}`)))),
  );
}
