import {createElement,useEffect,useRef,useState,type ReactElement} from "react";
import {readVisibleSteps,type VisibleStepDto} from "./tr013VisibleStepsRead20261022";
import type {PanelActor} from "./consultationContract";
export type VisibleStepTransport=(i:{method:"GET";path:string;signal:AbortSignal})=>Promise<{status:number;headers:Record<string,string>;body:unknown}>;
type Identity={actor:PanelActor;token:string|null;authEpoch?:string};
export type VisibleStepsRouteProps={
 pathname:string;search?:string;actor:PanelActor;token:string|null;authEpoch?:string;
 getCurrentSession?:()=>Identity|null;enableVisibleSteps?:boolean;enableContentManage?:boolean;
 visibleStepsTransport?:VisibleStepTransport;
};
export function TrainerVisibleStepsOptInRoute(p:VisibleStepsRouteProps):ReactElement {
 const [daily,setDaily]=useState(false);
 const [retry,setRetry]=useState(0);
 const [search,setSearch]=useState<{principal:string;value:string}>({principal:"",value:""});
 const [state,setState]=useState<{phase:"idle"|"loading"|"ready"|"error";rows:VisibleStepDto[];scope?:string}>({phase:"idle",rows:[]});
 const currentRef=useRef(p.getCurrentSession);
 currentRef.current=p.getCurrentSession;
 const principal=JSON.stringify([p.actor.id,p.actor.role,p.token,p.authEpoch]);
 const check=()=>{
  const now=currentRef.current?currentRef.current():
   {actor:p.actor,token:p.token,authEpoch:p.authEpoch};
  return !!now&&now.actor.id===p.actor.id&&now.actor.role===p.actor.role&&
   now.token===p.token&&now.authEpoch===p.authEpoch;
 };
 const dailyPath=p.pathname==="/main-panel/daily-course/steps";
 const isDaily=dailyPath?true:daily;
 const scope=JSON.stringify([principal,isDaily]);
 // A retired principal never inherits another actor's local search text.
 const params=new URLSearchParams(p.search??"");
 const query=search.principal===principal?search.value:(params.get("search")??"");
 useEffect(()=>{
  setSearch(previous=>previous.principal===principal?previous:{principal,value:""});
 },[principal]);
 const allowed=(p.pathname==="/main-panel/steps"||dailyPath)&&p.enableVisibleSteps===true&&!!p.token&&!!p.visibleStepsTransport&&
  ["TRAINER","ADMIN","MODERATOR"].includes(p.actor.role)&&check();
 useEffect(()=>{
  let live=true;
  const controller=new AbortController();
  setState({phase:"idle",rows:[]});
  if(!allowed)return ()=>{live=false;controller.abort();};
  setState({phase:"loading",rows:[],scope});
  void readVisibleSteps({enabled:true,actor:{id:p.actor.id,role:p.actor.role},isDailyCourse:isDaily,
   signal:controller.signal,isCurrent:()=>live&&check(),transport:p.visibleStepsTransport!,
  }).then(rows=>{if(live&&check())setState({phase:"ready",rows,scope});})
   .catch(()=>{if(live&&check())setState({phase:"error",rows:[],scope});});
  return ()=>{live=false;controller.abort();};
 // principal changes abort the previous request; do not retain private rows.
 // Preserve original GET frequency and actor fencing; callback dependencies are unstable.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[principal,allowed,isDaily,retry,p.visibleStepsTransport]);
 const visible=allowed&&check();
 const safeState=state.scope===scope?state:{phase:"loading" as const,rows:[]};
 const titleQuery=query.trim().toLocaleLowerCase("ru");
 const onlyOrphans=params.get("onlyOrphanSteps")==="1"||params.get("onlyOrphanSteps")==="true";
 const orderBy=params.get("orderBy")==="title"?"title":"createdAt";
 const order=params.get("order")==="asc"?"asc":"desc";
 const rowsParam=Number(params.get("rowsPerPage"));
 const rowsPerPage=[5,10,25].includes(rowsParam)?rowsParam:5;
 const pageParam=Number(params.get("page"));
 const page=Number.isSafeInteger(pageParam)&&pageParam>=0?pageParam:0;
 const matches=safeState.phase==="ready"
  ?safeState.rows.filter(row=>row.title.toLocaleLowerCase("ru").includes(titleQuery)&&
      (!onlyOrphans||row.stepLinks.length===0)):[];
 // The registered GET already supplies descending createdAt order. Preserve its
 // exact row order unless the URL explicitly overrides table sorting.
 const sorted=params.has("orderBy")||params.has("order")?[...matches].sort((a,b)=>{
   const comparison=orderBy==="title"?a.title.localeCompare(b.title,"ru"):
     a.createdAt.localeCompare(b.createdAt);
   return (order==="asc"?comparison:-comparison)||a.id.localeCompare(b.id);
 }):matches;
 const shown=sorted.slice(page*rowsPerPage,(page+1)*rowsPerPage);
 return createElement("main",{"data-tr013-visible":"read-only"},
  createElement("h1",null,dailyPath?"Созданные шаги курса дня":"Шаги тренировок"),
  !visible?createElement("p",{role:"alert"},"Чтение шагов отключено"):
  createElement("section",null,
   dailyPath?createElement("p",null,"Шаги, созданные с включённой галочкой «Курс дня»"):
    createElement("label",null,"Тип шагов ",createElement("select",{"aria-label":"Тип шагов",value:daily?"daily":"regular",onChange:e=>setDaily((e.currentTarget as HTMLSelectElement).value==="daily")},
     createElement("option",{value:"regular"},"Обычные"),createElement("option",{value:"daily"},"Курс дня"))),
   createElement("label",null,"Поиск шага по названию",
    createElement("input",{type:"search","aria-label":"Поиск шага по названию",
     value:query,onInput:e=>setSearch({principal,value:e.currentTarget.value})})),
   safeState.phase==="ready"?createElement("p",null,
    `Загружено шагов: ${safeState.rows.length}; показано: ${shown.length}`):null,
   safeState.phase==="ready"&&query.length>0?createElement("button",{
    type:"button",onClick:()=>setSearch({principal,value:""}),
   },"Очистить поиск"):null,
   safeState.phase==="loading"?createElement("p",{role:"status"},"Загрузка шагов"):
   safeState.phase==="error"?createElement("div",{role:"alert"},createElement("p",null,"Не удалось получить шаги"),createElement("button",{type:"button",onClick:()=>setRetry(x=>x+1)},"Повторить GET")):
   safeState.phase==="ready"?(safeState.rows.length===0?createElement("p",{role:"status"},"Шагов пока нет"):
    shown.length===0?createElement("p",{role:"status"},"По запросу ничего не найдено"):
    createElement("ul",{"aria-label":"Список шагов"},...shown.map(row=>{
     const seen=new Set<string>();
     const courses=row.stepLinks.flatMap(link=>link.day.dayLinks)
      .filter(({course})=>{
       if(seen.has(course.id))return false;
       seen.add(course.id);
       return true;
      }).map(({course})=>course.name);
     return createElement("li",{key:`${scope}:${row.id}`},
      createElement("details",null,
       createElement("summary",null,row.title," — ",row.author.username),
       createElement("dl",null,
        createElement("dt",null,"Описание"),createElement("dd",null,row.description),
        createElement("dt",null,"Тип"),createElement("dd",null,row.type),
        createElement("dt",null,"Продолжительность"),
        createElement("dd",null,row.durationSec===null?"Не указано":`${row.durationSec} секунд`),
        createElement("dt",null,"Оценочная продолжительность"),
        createElement("dd",null,row.estimatedDurationSec===null?"Не указано":`${row.estimatedDurationSec} секунд`),
        createElement("dt",null,"Курс дня"),createElement("dd",null,row.isDailyCourse?"Да":"Нет")),
       createElement("h3",null,"Связанные курсы"),
       courses.length===0?createElement("p",null,"Нет связанных курсов"):
        createElement("ul",{"aria-label":"Связанные курсы"},
         ...courses.map((name,index)=>createElement("li",{key:index},name))),
       p.enableContentManage === true && (p.actor.role === "ADMIN" ||
         (p.actor.role === "TRAINER" && row.authorId === p.actor.id))
         ? createElement("a",{href:"/main-panel/steps/"+
           encodeURIComponent(row.id)+"/edit"},"Редактировать шаг")
         : null));
    }))):null));
}
