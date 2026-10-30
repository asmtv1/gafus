import { BackButton } from "../../shared/ui";
import {useEffect,useRef,useState} from "react";
import {navigate} from "../../shared/router/location";
import {buildExcuseRequest,EXCUSE_OPTIONS,projectExcuseResult,
 type ExcuseFixture,type ExcuseResult,type ExcuseSituation} from "./excuseSourceMock";
type Stage="idle"|"pending"|"done"|"error";
function Generator({fixture,onBack}:{fixture:ExcuseFixture;onBack:()=>void}){
 const [selected,setSelected]=useState<ExcuseSituation>("late-work");
 const [stage,setStage]=useState<Stage>("idle");
 const [result,setResult]=useState<ExcuseResult|null>(null);
 const [error,setError]=useState("");
 const [copy,setCopy]=useState<"idle"|"copied"|"failed">("idle");
 const mounted=useRef(true);
 const generation=useRef(0);
 const pending=useRef(false);
 const active=useRef<AbortController|null>(null);
 useEffect(()=>()=>{mounted.current=false;generation.current++;active.current?.abort();},[]);
 const change=(s:ExcuseSituation)=>{
  if(selected===s)return;
  generation.current++;active.current?.abort();active.current=null;
  pending.current=false;setSelected(s);setStage("idle");
  setResult(null);setError("");setCopy("idle");
 };
 async function generate(){
  if(pending.current)return;
  pending.current=true;const seq=++generation.current;
  const controller=new AbortController();active.current=controller;
  setStage("pending");setError("");setResult(null);setCopy("idle");
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const response=await Promise.race([
    fixture.generate(buildExcuseRequest(selected,controller.signal)),
    new Promise<never>((_,reject)=>{timer=setTimeout(()=>{
     controller.abort();reject(Error("EXCUSE_TIMEOUT"));
    },20000);}),
   ]);
   if(!mounted.current||seq!==generation.current)return;
   setResult(projectExcuseResult(response));setStage("done");
  }catch(e){
   if(!mounted.current||seq!==generation.current)return;
   setError(e instanceof Error&&e.message==="EXCUSE_TIMEOUT"?
    "Генерация заняла слишком много времени. Попробуйте ещё раз.":
    "Не удалось сгенерировать отмазку. Попробуйте позже.");
   setStage("error");
  }finally{
   if(timer)clearTimeout(timer);
   if(seq===generation.current){pending.current=false;active.current=null;}
  }
 }
 async function copyText(){
  if(!result||!mounted.current)return;
  try{await navigator.clipboard.writeText(result.excuse);
   if(mounted.current)setCopy("copied");
  }catch{if(mounted.current)setCopy("failed");}
 }
 return <section className="excuses-panel" aria-label="Генератор отмазок (макет)">
  <header><h2>Генератор отмазок</h2><BackButton type="button"
   onClick={onBack}>Назад</BackButton></header>
  <p className="note">Публичный синтетический режим. AI-провайдер не вызывается.</p>
  <div className="excuses-options" role="group" aria-label="Выберите ситуацию">
   {EXCUSE_OPTIONS.map(option=><button key={option.id} type="button"
     aria-pressed={selected===option.id} onClick={()=>change(option.id)}>
     {option.label}</button>)}
  </div>
  <p>{EXCUSE_OPTIONS.find(option=>option.id===selected)?.description}</p>
  <button type="button" disabled={stage==="pending"}
   onClick={()=>void generate()}>
   {stage==="pending"?"Генерируем…":"Сгенерировать"}
  </button>
  {stage==="pending"&&<p role="status">Ожидаем синтетический ответ…</p>}
  {stage==="error"&&<p role="alert">{error}</p>}
  {result&&<article aria-label="Сгенерированный текст">
   <p data-testid="excuse-text">{result.excuse}</p>
   <p>Правдоподобность: {result.plausibility}%</p>
   <progress aria-label="Правдоподобность" max={100} value={result.plausibility}/>
   <p>Тон: {result.tone}</p>
   <button type="button" onClick={()=>void copyText()}>
    {copy==="copied"?"Скопировано":copy==="failed"?
     "Не удалось скопировать":"Скопировать"}
   </button>
  </article>}
 </section>;
}
/** Explicit public WEB-URL-051 source-only route, never a live provider. */
export function ExcusesOptIn({enabled,fixture,routeMode=false}:{
 enabled:boolean;fixture?:ExcuseFixture;routeMode?:boolean;
}){
 const [open,setOpen]=useState(routeMode);
 if(!enabled||fixture?.fixtureKind!=="AG2_PUBLIC_EXCUSES_SYNTHETIC_PROVIDER_ONLY")
  return null;
 if(!open)return <section className="excuses-entry">
  <button type="button" onClick={()=>setOpen(true)}>
   Генератор отмазок (макет)</button>
 </section>;
 return <Generator fixture={fixture} onBack={()=>{
  if(routeMode)navigate("/");else setOpen(false);
 }}/>;
}
