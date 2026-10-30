import {TrainerVisibleDaysChooser20261022} from "./TrainerVisibleDaysChooser20261022";
import type {VisibleDaysTransport} from "./trainerVisibleDaysRead20261022";
import {createElement,useCallback,useEffect,useMemo,useRef,useState,type ReactElement} from "react";
import type {PanelActor} from "./consultationContract";
import {
 extractCourseDraftId,readTrainerCourseDraft,
 type TrainerCourseDraft,
} from "./trainerCourseDraftReadContract";

/** TR012 READ-ONLY opt-in source fixture: no edit/upload/delete controls, no default HTTP. */
type Live={actor:PanelActor;token:string|null;authEpoch?:string}|null;
export type TrainerCourseDraftReadProps={
 pathname:string;actor:PanelActor;token:string|null;authEpoch?:string;
 getCurrentSession?:()=>Live;fetchImpl:typeof fetch;
 enableProposedCourseDraft?:boolean;
 enableVisibleDays?:boolean;visibleDaysTransport?:VisibleDaysTransport;
};
type View={
 phase:"idle"|"loading"|"ready"|"notfound"|"failed";
 requestKey:string;dto?:TrainerCourseDraft;
};
const safeActor=/^[A-Za-z0-9_-]{1,128}$/;
export function TrainerCourseDraftReadOptInRoute(p:TrainerCourseDraftReadProps):ReactElement {
 const {actor,token,authEpoch,fetchImpl}=p;
 const stableActor=useMemo<PanelActor>(()=>({id:actor.id,role:actor.role}),
  [actor.id,actor.role]);
 const principal=JSON.stringify([actor.id,actor.role,token,authEpoch]);
 const reader=useRef(p.getCurrentSession);
 reader.current=p.getCurrentSession;
 const fallback=useRef<Live>(null);
 fallback.current={actor:stableActor,token,authEpoch};
 const readCurrent=useCallback(()=>reader.current?reader.current():fallback.current,[]);
 const isVerified=useCallback(()=>{
  const now=readCurrent();
  return !!now && !!token && !!authEpoch && safeActor.test(stableActor.id) &&
   (stableActor.role==="TRAINER"||stableActor.role==="ADMIN") &&
   now.actor.id===stableActor.id && now.actor.role===stableActor.role &&
   now.token===token && now.authEpoch===authEpoch;
 },[readCurrent,stableActor,token,authEpoch]);
 const courseId=extractCourseDraftId(p.pathname);
 const enabled=p.enableProposedCourseDraft===true;
 const requestKey=JSON.stringify([principal,courseId,enabled]);
 const [version,setVersion]=useState(0);
 const [view,setView]=useState<View>({phase:"idle",requestKey:""});
 const requestSerial=useRef(0);
 const pending=useRef(false);
 useEffect(()=>{
  const requestRef=requestSerial;
  const serial=++requestRef.current;
  const controller=new AbortController();
  pending.current=false;
  if(!enabled||!courseId||!isVerified()){
   setView({phase:"idle",requestKey});
   return()=>{controller.abort();requestRef.current++;pending.current=false;};
  }
  pending.current=true;
  setView({phase:"loading",requestKey});
  void readTrainerCourseDraft({
   actor:stableActor,token:token!,courseId,fetchImpl,signal:controller.signal,
   isCurrent:()=>requestRef.current===serial&&isVerified(),
  }).then(dto=>{
   if(requestRef.current===serial&&isVerified()&&!controller.signal.aborted){
    setView({phase:"ready",requestKey,dto});
   }
  }).catch((error:unknown)=>{
   if(requestRef.current===serial&&isVerified()&&!controller.signal.aborted){
    setView({phase:error instanceof Error&&error.message==="HTTP_404"?
      "notfound":"failed",requestKey});
   }
  }).finally(()=>{
   if(requestRef.current===serial)pending.current=false;
  });
  return()=>{controller.abort();requestRef.current++;pending.current=false;};
 },[enabled,courseId,requestKey,version,stableActor,token,fetchImpl,isVerified]);
 if(!isVerified())return createElement("main",null,
  createElement("h1",null,"Черновик курса"),
  createElement("p",{role:"alert"},"Доступ к курсу не подтверждён"));
 if(!courseId)return createElement("main",null,
  createElement("h1",null,"Черновик курса"),
  createElement("p",{role:"alert"},"Недопустимый ID курса"));
 const visible=view.requestKey===requestKey?view:{phase:"idle" as const,requestKey};
 return createElement("main",{"data-ag4-course-draft":"read-only",style:{padding:12,maxWidth:900,margin:"auto"}},
  createElement("h1",null,"Черновик курса"),
  createElement("nav",{"aria-label":"Навигация курса"},
   createElement("a",{href:"/main-panel/courses"},"К курсам"),
   createElement("a",{href:p.pathname,"aria-current":"page"},"Черновик")),
  !enabled?createElement("p",{role:"status"},
   "Просмотр черновика в браузере пока выключен. Запросы отключены."):null,
  enabled&&visible.phase==="loading"?createElement("p",{role:"status"},"Загрузка черновика"):null,
  enabled&&visible.phase==="notfound"?createElement("p",{role:"alert"},
   "Курс не найден или нет доступа"):null,
  enabled&&visible.phase==="failed"?createElement("section",null,
   createElement("p",{role:"alert"},"Не удалось загрузить черновик"),
   createElement("button",{type:"button","aria-label":"Повторить чтение черновика",
    onClick:()=>{if(!pending.current&&isVerified()){
     pending.current=true;setVersion(v=>v+1);
    }}},"Повторить загрузку")):null,
  enabled&&visible.phase==="ready"&&visible.dto?
   renderDraft(visible.dto):null,
  createElement(TrainerVisibleDaysChooser20261022,{actor:stableActor,enabled:p.enableVisibleDays===true,transport:p.visibleDaysTransport,isCurrent:isVerified,key:principal}),
 );
}
function renderDraft(dto:TrainerCourseDraft):ReactElement {
 return createElement("section",{"aria-label":"Данные черновика"},
  createElement("h2",null,dto.name),
  createElement("p",null,"Длительность: "+dto.duration),
  createElement("p",null,"Уровень: "+dto.trainingLevel),
  createElement("p",null,dto.isPrivate?"Приватный курс":"Публичный курс"),
  createElement("p",null,dto.isPaid?"Платный":"Бесплатный"),
  createElement("p",null,"Тренировочных дней: "+dto.dayLinks.length),
  dto.dayLinks.length?createElement("ol",null,...dto.dayLinks.map((link,i)=>
   createElement("li",{key:link.id+"-"+i},link.day.title))):
   createElement("p",{role:"status"},"Тренировочные дни не добавлены"),
  dto.isPrivate?createElement("p",null,"Пользователей с доступом: "+dto.access.length):null,
  createElement("p",{role:"status"},
   "Только просмотр. Редактирование и загрузка изображений пока отключены."),
 );
}
