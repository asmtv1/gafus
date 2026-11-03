import {createElement,useEffect,useRef,useState,type ReactElement} from "react";
import {readVisibleSteps,type VisibleStepDto} from "./tr013VisibleStepsRead20261022";
import type {PanelActor} from "./consultationContract";
import type {TrainerContentWriteTransport} from "./TrainerContentEditorRoute";
import {TrainerStepsLibraryView} from "./live/TrainerStepsLibraryView";
export type VisibleStepTransport=(i:{method:"GET";path:string;signal:AbortSignal})=>Promise<{status:number;headers:Record<string,string>;body:unknown}>;
type Identity={actor:PanelActor;token:string|null;authEpoch?:string};
export type VisibleStepsRouteProps={
 pathname:string;search?:string;actor:PanelActor;token:string|null;authEpoch?:string;
 getCurrentSession?:()=>Identity|null;enableVisibleSteps?:boolean;enableContentManage?:boolean;
 visibleStepsTransport?:VisibleStepTransport;
 contentWriteTransport?:TrainerContentWriteTransport;
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
 const changeQuery=(value:string)=>setSearch({principal,value});
 return createElement("main",{className:"trainer-catalog", "data-tr013-visible":"read-only"},
  createElement("header",{className:"trainer-catalog-heading"},
   createElement("div",null,
    createElement("span",{className:"trainer-catalog-eyebrow"},"Управление тренировками"),
    createElement("h1",null,dailyPath?"Созданные шаги курса дня":"Шаги тренировок"),
    createElement("p",null,"Поиск, сортировка, связи и управление вашими материалами")),
   p.enableContentManage&&p.actor.role!=="MODERATOR"
    ?createElement("a",{href:"/steps/new",className:"trainer-catalog-create"},"＋ Создать шаг")
    :null),
  !visible?createElement("p",{role:"alert"},"Чтение шагов отключено"):
   safeState.phase==="loading"||safeState.phase==="idle"
    ?createElement("p",{role:"status"},"Загрузка шагов"):
   safeState.phase==="error"
    ?createElement("div",{className:"trainer-catalog-empty",role:"alert"},
      createElement("p",null,"Не удалось получить шаги"),
      createElement("button",{type:"button",onClick:()=>setRetry(x=>x+1)},"Повторить GET")):
   createElement(TrainerStepsLibraryView,{
    key:scope, rows:safeState.rows, actor:p.actor, query, onQuery:changeQuery,
    isDaily, dailyPath, onDaily:setDaily, search:p.search,
    canEdit:p.enableContentManage===true, write:p.contentWriteTransport,
    transport:p.visibleStepsTransport!,current:check,
    onRefresh:()=>setRetry(x=>x+1),
   }));
}
