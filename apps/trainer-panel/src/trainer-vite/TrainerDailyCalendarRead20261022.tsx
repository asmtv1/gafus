import {readCalendarCandidates,type CalendarCandidate} from "./tr014CalendarCandidatesRead20261022";
import {createElement,useEffect,useState} from "react";
import {readRange,shift,type Schedule,type ScheduleTransport} from "./tr014ScheduleRangeRead20261022";
import type {PanelActor} from "./consultationContract";
// Existing single-line component signature, preserved for scope compatibility.
// eslint-disable-next-line max-len
export function TrainerDailyCalendarRead20261022(p:{pathname:string;actor:PanelActor;token:string|null;authEpoch?:string;enabled?:boolean;transport?:ScheduleTransport;initialFrom:string;getCurrentSession?:()=>{actor:PanelActor;token:string|null;authEpoch?:string}|null}){
 const [candidateState,setCandidateState]=useState<{scope:string;phase:"loading"|"ready"|"error";rows:CalendarCandidate[]}>({scope:"",phase:"loading",rows:[]});
 // Preserve independent retry triggers without changing the request effects.
 // eslint-disable-next-line max-len
 const [from,setFrom]=useState(p.initialFrom);const [rangeRetry,setRangeRetry]=useState(0);const [candidatesRetry,setCandidatesRetry]=useState(0);
 const [state,setState]=useState<{scope:string;phase:"loading"|"ready"|"error";rows:Schedule[]}>({scope:"",phase:"loading",rows:[]});
 const to=shift(from,29),scope=JSON.stringify([p.actor.id,p.actor.role,p.token,p.authEpoch,from]);
 // Existing live-session closure guards are intentionally unchanged.
 // eslint-disable-next-line max-len
 const validSession=()=>{const s=p.getCurrentSession?p.getCurrentSession():{actor:p.actor,token:p.token,authEpoch:p.authEpoch};return !!s&&s.actor.id===p.actor.id&&s.actor.role===p.actor.role&&s.token===p.token&&s.authEpoch===p.authEpoch;};
 const allowed=p.pathname==="/main-panel/daily-course"&&p.enabled===true&&!!p.transport&&!!p.token&&!!p.authEpoch&&["TRAINER","ADMIN","MODERATOR"].includes(p.actor.role)&&validSession();
 // Keep the original session/actor effect boundaries; adding closure dependencies
 // would change request timing beyond this read-recovery scope.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{let live=true;const ac=new AbortController();setState({scope,phase:"loading",rows:[]});if(allowed)void readRange({from,to,transport:p.transport!,signal:ac.signal,isCurrent:()=>live&&validSession()}).then(rows=>{if(live&&validSession())setState({scope,phase:"ready",rows});}).catch(()=>{if(live&&validSession())setState({scope,phase:"error",rows:[]});});return()=>{live=false;ac.abort();};},[scope,allowed,rangeRetry,p.transport]);
 // Keep candidate requests bound to their own retry, scope and existing fencing.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{let live=true;const ac=new AbortController();setCandidateState({scope,phase:"loading",rows:[]});if(allowed)void readCalendarCandidates({actorId:p.actor.id,role:p.actor.role as "TRAINER"|"ADMIN"|"MODERATOR",transport:p.transport!,signal:ac.signal,isCurrent:()=>live&&validSession()}).then(rows=>{if(live&&validSession())setCandidateState({scope,phase:"ready",rows});}).catch(()=>{if(live&&validSession())setCandidateState({scope,phase:"error",rows:[]});});return()=>{live=false;ac.abort();};},[scope,allowed,candidatesRetry,p.transport]);
 if(!allowed)return createElement("main",null,createElement("p",{role:"alert"},"Календарь недоступен"));
 const candidates=candidateState.scope===scope?candidateState:{phase:"loading" as const,rows:[]};
 const v:{phase:"loading"|"ready"|"error";rows:Schedule[]}=state.scope===scope?state:{phase:"loading",rows:[]};
 return createElement("main",{"data-readonly-calendar":true},createElement("h1",null,"Курс дня — календарь"),createElement("nav",{"aria-label":"Диапазоны"},createElement("button",{type:"button",onClick:()=>setFrom(shift(from,-30))},"Предыдущие даты"),createElement("span",null,`${from} — ${to}`),createElement("button",{type:"button",onClick:()=>setFrom(shift(from,30))},"Следующие даты")),
 v.phase==="loading"?createElement("p",{role:"status","aria-busy":true},"Загрузка расписания"):v.phase==="error"?createElement("div",{role:"alert"},"Ошибка расписания",createElement("button",{type:"button","aria-label":"Повторить загрузку расписания",onClick:()=>{if(validSession())setRangeRetry(x=>x+1);}},"Повторить расписание")):v.rows.length===0?createElement("p",{role:"status"},"Расписания нет"):createElement("ul",{"aria-label":"Календарное расписание"},...v.rows.map(x=>createElement("li",{key:x.id},x.date," — ",x.bundle.title," — ",x.isPublished?"Опубликовано":"Черновик"," — ",x.bundle.stepsCount," шагов"))),
 createElement("section",{"aria-label":"Доступные связки календаря","aria-busy":candidates.phase==="loading"},createElement("h2",null,"Подходящие связки"),candidates.phase==="loading"?createElement("p",{role:"status"},"Загрузка связок"):candidates.phase==="error"?createElement("div",{role:"alert"},"Ошибка чтения связок",createElement("button",{type:"button","aria-label":"Повторить загрузку связок календаря",onClick:()=>{if(validSession())setCandidatesRetry(x=>x+1);}},"Повторить связки")):candidates.rows.length===0?createElement("p",{role:"status"},"Подходящих связок нет"):createElement("ul",null,...candidates.rows.map(x=>createElement("li",{key:x.id},x.title," — ",x.stepsCount," шагов — ",x.authorUsername)))));
}
