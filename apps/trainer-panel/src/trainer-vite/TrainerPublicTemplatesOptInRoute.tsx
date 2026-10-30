import {createElement,useEffect,useRef,useState,type ReactElement} from "react";
import {readPublicTemplates,type PublicTemplateListItem} from "./tr013TemplateListRead20261022";
import type {PanelActor} from "./consultationContract";
export type PublicTemplateTransport=(path:string,signal:AbortSignal)=>Promise<{
 status:number;headers:Record<string,string>;body:unknown;
}>;
export type PublicTemplatesProps={
 pathname:string;actor:PanelActor;token:string|null;authEpoch?:string;
 enablePublicTemplates?:boolean;publicTemplateTransport?:PublicTemplateTransport;
 getCurrentSession?:()=>{
  actor:PanelActor;token:string|null;authEpoch?:string;
 }|null;
};
export function TrainerPublicTemplatesOptInRoute(p:PublicTemplatesProps):ReactElement{
 // Category state is scoped to its principal: a new actor starts at All,
 // never with a former actor's selected filtered query.
 const [selectedCategory,setSelectedCategory]=useState<{principal:string;value:string}>({principal:"",value:""});
 const [confirmedCategories,setConfirmedCategories]=useState<{
  principal:string;rows:{id:string;name:string}[];
 }|null>(null);
 const [retry,setRetry]=useState(0);
 // Only an explicitly focused manual retry can request a result-region focus.
 const retryFocus=useRef<{scope:string;attempt:number}|null>(null);
 const finishedRetry=useRef<{scope:string;attempt:number}|null>(null);
 const resultsRef=useRef<HTMLElement|null>(null);
 const [search,setSearch]=useState<{principal:string;value:string}>({principal:"",value:""});
 const [selected,setSelected]=useState<string|null>(null);
 const [state,setState]=useState<{scope:string;kind:"loading"|"ready"|"error";rows:PublicTemplateListItem[]}>({scope:"",kind:"loading",rows:[]});
 const principal=JSON.stringify([p.actor.id,p.actor.role,p.token,p.authEpoch]);
 const category=selectedCategory.principal===principal?selectedCategory.value:"";
 const query=search.principal===principal?search.value:"";
 const scope=JSON.stringify([principal,category]);
 const check=()=>{
  const n=p.getCurrentSession?.()??{actor:p.actor,token:p.token,authEpoch:p.authEpoch};
  return !!n&&n.actor.id===p.actor.id&&n.actor.role===p.actor.role&&
   n.token===p.token&&n.authEpoch===p.authEpoch;
 };
 const allowed=p.pathname==="/main-panel/templates"&&p.enablePublicTemplates===true&&!!p.token&&!!p.publicTemplateTransport&&["TRAINER","ADMIN","MODERATOR"].includes(p.actor.role)&&check();
 // Retire a pending focus recovery on principal/category/permission transition.
 useEffect(()=>{
  retryFocus.current=null;
  finishedRetry.current=null;
 },[scope,allowed]);
 // Do not retain confirmed choices or old search text after principal retirement.
 useEffect(()=>{
  setConfirmedCategories(null);
  setSearch(previous=>previous.principal===principal?previous:{principal,value:""});
 },[principal]);
 useEffect(()=>{
  let live=true;const ac=new AbortController();
  setSelected(null);setState({scope,kind:"loading",rows:[]});
  if(allowed)void readPublicTemplates({enabled:true,role:p.actor.role as "TRAINER"|"ADMIN"|"MODERATOR",actorId:p.actor.id,categoryId:category,signal:ac.signal,isCurrent:()=>live&&check(),transport:p.publicTemplateTransport!})
   .then(rows=>{if(live&&check()){
    if(!category){
     const known=Array.from(new Map(rows.filter(r=>r.category).map(r=>[
      r.category!.id,{id:r.category!.id,name:r.category!.name},
     ] as const)).values());
     setConfirmedCategories({principal,rows:known});
    }
    if(retryFocus.current?.scope===scope&&retryFocus.current.attempt===retry)
     finishedRetry.current={scope,attempt:retry};
    setState({scope,kind:"ready",rows});
   }})
   .catch(()=>{if(live&&check()){
    if(retryFocus.current?.scope===scope&&retryFocus.current.attempt===retry)
     finishedRetry.current={scope,attempt:retry};
    setState({scope,kind:"error",rows:[]});
   }});
  return ()=>{live=false;ac.abort();};
 // Preserve the existing effect trigger list and original check() closure semantics.
 // Adding unstable callback dependencies would silently repeat live GETs.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[scope,allowed,retry,p.publicTemplateTransport]);
 // A retry's response may be immediate; this runs only after that attempt settles.
 // If the user moved focus to search/category/another control, leave it alone.
 useEffect(()=>{
  const expected=retryFocus.current;
  if(!allowed||!expected||expected.scope!==scope||expected.attempt!==retry||
    finishedRetry.current?.scope!==scope||finishedRetry.current.attempt!==retry||
    state.scope!==scope||state.kind==="loading")return;
  retryFocus.current=null;
  finishedRetry.current=null;
  const region=resultsRef.current;
  if(region?.isConnected&&region.ownerDocument.activeElement===region.ownerDocument.body)
   region.focus();
 },[scope,allowed,retry,state]);
 if(!allowed||!check())return createElement("main",null,createElement("p",{role:"alert"},"Библиотека шаблонов отключена"));
 const view=state.scope===scope?state:{kind:"loading" as const,rows:[]};
 const categories=confirmedCategories?.principal===principal
  ?confirmedCategories.rows
  :view.kind==="ready"&&category
   ?Array.from(new Map(view.rows.filter(r=>r.category?.id===category).map(r=>[
     r.category!.id,{id:r.category!.id,name:r.category!.name},
    ] as const)).values())
   :view.kind==="ready"&&!category
    ?Array.from(new Map(view.rows.filter(r=>r.category).map(r=>[
      r.category!.id,{id:r.category!.id,name:r.category!.name},
     ] as const)).values())
    :[];
 const titleQuery=query.trim().toLocaleLowerCase("ru");
 const shown=view.kind==="ready"
  ?view.rows.filter(r=>r.title.toLocaleLowerCase("ru").includes(titleQuery)):[];
 const detail=shown.find(r=>r.id===selected);
 return createElement("main",{"data-tr013-templates":"read-only"},createElement("h1",null,"Библиотека шаблонов"),
  createElement("label",null,"Категория ",createElement("select",{"aria-label":"Категория",value:category,onChange:e=>setSelectedCategory({principal,value:(e.currentTarget as HTMLSelectElement).value})},createElement("option",{value:""},"Все"),...categories.map(c=>createElement("option",{key:c.id,value:c.id},c.name)))),
  createElement("label",null,"Поиск шаблона по названию",
   createElement("input",{type:"search","aria-label":"Поиск шаблона по названию",
    value:query,onInput:e=>setSearch({principal,value:e.currentTarget.value})})),
  view.kind==="ready"?createElement("p",null,
   `Загружено шаблонов: ${view.rows.length}; показано: ${shown.length}`):null,
  view.kind==="ready"&&category?createElement("p",null,
   "Поиск только среди шаблонов выбранной категории"):null,
  view.kind==="ready"&&query.length>0?createElement("button",{
   type:"button",onClick:()=>setSearch({principal,value:""}),
  },"Очистить поиск"):null,
  createElement("section",{ref:resultsRef,tabIndex:-1,"aria-label":"Результаты библиотеки шаблонов"},
  view.kind==="loading"?createElement("p",{role:"status"},"Загрузка шаблонов"):view.kind==="error"?createElement("div",{role:"alert"},"Не удалось получить шаблоны",createElement("button",{type:"button",onClick:e=>{
   retryFocus.current=e.currentTarget.ownerDocument.activeElement===e.currentTarget
    ?{scope,attempt:retry+1}:null;
   finishedRetry.current=null;
   setRetry(x=>x+1);
  }},"Повторить GET")):view.rows.length===0?createElement("p",{role:"status"},"Шаблонов нет"):shown.length===0?createElement("p",{role:"status"},"По запросу ничего не найдено"):createElement("ul",{"aria-label":"Публичные шаблоны"},...shown.map(item=>createElement("li",{key:item.id},createElement("button",{type:"button",onClick:()=>setSelected(item.id)},item.title),createElement("span",null," — ",item.author.username," / ",item.category?.name??"Без категории")))),
  detail?createElement("section",{"aria-label":"Просмотр шаблона"},
   createElement("h2",null,detail.title),
   createElement("p",null,detail.description),
   createElement("p",null,"Автор: ",detail.author.username),
   createElement("p",null,"Тип: ",detail.type),
   createElement("p",null,"Длительность: ",
    detail.durationSec===null?"Не указано":`${detail.durationSec} секунд`),
   createElement("p",null,"Категория: ",detail.category?.name??"Без категории"),
   createElement("p",null,"Теги: ",detail.tags.length?detail.tags.join(", "):"Нет тегов"),
   createElement("p",null,"Использований: ",String(detail.usageCount)),
   createElement("p",null,"Тестовые вопросы: ",detail.hasTestQuestions?"Да":"Нет"),
   createElement("p",null,"Письменный отчёт: ",detail.requiresWrittenFeedback?"Да":"Нет"),
   createElement("p",null,"Видеоотчёт: ",detail.requiresVideoReport?"Да":"Нет")):null));
}
