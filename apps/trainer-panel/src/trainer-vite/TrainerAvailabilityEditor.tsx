import {createElement,useCallback,useEffect,useMemo,useRef,useState,type ChangeEvent,type ReactElement} from "react";
import {callTrainerConsultationMethod} from "./consultationHttpConsumer";
import {trainerStaffMethods,type PanelActor} from "./consultationContract";

type Session={actor:PanelActor;token:string|null;authEpoch?:string};
type Rule={id?:string;weekday:number;startTime:string;endTime:string;isWorkingDay:boolean};
type DayOff={id:string;date:string;reason:string|null};
type Exception={id:string;startAtUtc:string;endAtUtc:string;reason:string|null};
type Availability={slotDurationMin:number;rules:Rule[];dayOffs:DayOff[];exceptions:Exception[]};
export type AvailabilityProps={
 actor:PanelActor;token:string|null;authEpoch?:string;fetchImpl:typeof fetch;
 getCurrentSession?:()=>Session|null;
 /** ADMIN-only explicit trainer selection, resolved against Admin catalog. */
 targetTrainerId?:string;
};
type Phase="idle"|"loading"|"ready"|"error"|"pending"|"verifying"|"saved"|"unknown";
const weekdays=["Воскресенье","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"];
const clock=/^([01]\d|2[0-3]):[0-5]\d$/;
const minutes=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3,5));
const valid=(rules:Rule[])=>rules.length>0&&rules.length<=70&&rules.every(rule=>
 Number.isInteger(rule.weekday)&&rule.weekday>=0&&rule.weekday<=6&&
 clock.test(rule.startTime)&&clock.test(rule.endTime)&&
 minutes(rule.endTime)>minutes(rule.startTime)&&typeof rule.isWorkingDay==="boolean");
const calendarDate=(value:unknown):value is string=>{
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [year,month,day]=value.split("-").map(Number);
 const date=new Date(Date.UTC(year,month-1,day));
 return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===value;
};
const utcTime=(v:unknown):v is string=>{
 if(typeof v!=="string"||!calendarDate(v.slice(0,10)))return false;
 const pattern=new RegExp(
  String.raw`^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})`+
  String.raw`(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$`
 );
 const m=pattern.exec(v);
 return !!m&&Number(m[1])<=23&&Number(m[2])<=59&&Number(m[3])<=59&&
  Number.isFinite(Date.parse(v));
};
const uniqueIds=(items:{id:string}[])=>new Set(items.map(item=>item.id)).size===items.length;
const readAvailability=(x:unknown):x is Availability=>{
 if(!x||typeof x!=="object")return false;
 const a=x as Availability;
 if(!Number.isSafeInteger(a.slotDurationMin)||a.slotDurationMin<=0||
    !Array.isArray(a.rules)||a.rules.length>70||
    !Array.isArray(a.dayOffs)||a.dayOffs.length>500||
    !Array.isArray(a.exceptions)||a.exceptions.length>500)return false;
 if(!a.rules.every(r=>r&&Number.isInteger(r.weekday)&&r.weekday>=0&&r.weekday<=6&&
    clock.test(r.startTime)&&clock.test(r.endTime)&&
    minutes(r.endTime)>minutes(r.startTime)&&typeof r.isWorkingDay==="boolean"))return false;
 if(!a.dayOffs.every(d=>d&&typeof d.id==="string"&&!!d.id&&
    calendarDate(d.date)&&
    (d.reason===null||typeof d.reason==="string")))return false;
 if(!a.exceptions.every(e=>e&&typeof e.id==="string"&&!!e.id&&
    utcTime(e.startAtUtc)&&utcTime(e.endAtUtc)&&
    Date.parse(e.endAtUtc)>Date.parse(e.startAtUtc)&&
    (e.reason===null||typeof e.reason==="string")))return false;
 return uniqueIds(a.dayOffs)&&uniqueIds(a.exceptions);
};
const snapshot=(rules:Rule[])=>JSON.stringify(rules.map(r=>({
 weekday:r.weekday,startTime:r.startTime,endTime:r.endTime,isWorkingDay:r.isWorkingDay
})).sort((a,b)=>a.weekday-b.weekday||
 a.startTime.localeCompare(b.startTime)||a.endTime.localeCompare(b.endTime)||
 Number(a.isWorkingDay)-Number(b.isWorkingDay)));
// A weekly-rule PUT must preserve all unrelated day-offs, exceptions and slot duration.
const collateral=(a:Pick<Availability,"slotDurationMin"|"dayOffs"|"exceptions">)=>
 JSON.stringify({slotDurationMin:a.slotDurationMin,
  dayOffs:a.dayOffs.map(({id,date,reason})=>({id,date,reason}))
   .sort((x,y)=>x.id.localeCompare(y.id)),
  exceptions:a.exceptions.map(({id,startAtUtc,endAtUtc,reason})=>({
   id,startAtUtc,endAtUtc,reason
  })).sort((x,y)=>x.id.localeCompare(y.id))
 });
export function TrainerAvailabilityEditor({
 actor,token,authEpoch,fetchImpl,getCurrentSession,targetTrainerId
}:AvailabilityProps):ReactElement{
 const stableActor=useMemo<PanelActor>(()=>({id:actor.id,role:actor.role}),
  [actor.id,actor.role]);
 const readerRef=useRef(getCurrentSession);
 readerRef.current=getCurrentSession;
 const [phase,setPhase]=useState<Phase>("idle");
 const [rules,setRules]=useState<Rule[]>([]);
 const [dayOffs,setDayOffs]=useState<DayOff[]>([]);
 const [exceptions,setExceptions]=useState<Exception[]>([]);
 const [slotMinutes,setSlotMinutes]=useState(0);
 const [error,setError]=useState("");
 const [readRetry,setReadRetry]=useState(0);
 const current=useRef<Session>({actor:stableActor,token,authEpoch});
 current.current={actor:stableActor,token,authEpoch};
 const readLive=useCallback(()=>readerRef.current
  ?readerRef.current():current.current,[]);
 const epoch=useRef(0);
 const inFlight=useRef(false);
 const mounted=useRef(true);
 const live=useCallback(()=>{
  const s=readLive();
  return !!s&&s.actor.role===stableActor.role&&s.actor.id===stableActor.id&&
    s.token===token&&s.authEpoch===authEpoch;
 },[stableActor,token,authEpoch,readLive]);
 const permitted=!!token&&(actor.role==="TRAINER"&&!targetTrainerId||
    actor.role==="ADMIN"&&!!targetTrainerId&&/^[A-Za-z0-9_-]{1,128}$/.test(targetTrainerId));
 useEffect(()=>{
  const generation=++epoch.current;
  const ownedEpochRef=epoch;
  const teardownEpoch=generation+1;
  mounted.current=true;
  const controller=new AbortController();
  const fresh=()=>mounted.current&&epoch.current===generation&&live();
  setPhase("idle");setRules([]);setDayOffs([]);setExceptions([]);setError("");
  if(!permitted||!live())return()=>{
   controller.abort();ownedEpochRef.current=teardownEpoch;mounted.current=false;
  };
  setPhase("loading");
  void callTrainerConsultationMethod({
    descriptor:trainerStaffMethods[5],actor:stableActor,accessToken:token!,
    targetTrainerId,fetchImpl,signal:controller.signal
  }).then(response=>{
    if(!fresh())return;
    if(!readAvailability(response))throw Error("INVALID_AVAILABILITY");
    setRules(response.rules.map(r=>({...r})));
    setDayOffs(response.dayOffs);setExceptions(response.exceptions);
    setSlotMinutes(response.slotDurationMin);setPhase("ready");
  }).catch(()=>{if(fresh()){setError("Не удалось загрузить расписание");setPhase("error");}});
  return()=>{controller.abort();ownedEpochRef.current=teardownEpoch;mounted.current=false;};
 },[stableActor,token,authEpoch,fetchImpl,permitted,live,targetTrainerId,readRetry]);
 const busy=phase==="pending"||phase==="verifying";
 const edit=(index:number,patch:Partial<Rule>)=>{
  if(busy||phase==="unknown"||!live())return;
  setRules(old=>old.map((r,i)=>i===index?{...r,...patch}:r));
  if(phase==="saved")setPhase("ready");
 };
 const save=async()=>{
  if(!permitted||!live()||inFlight.current||busy||
    phase==="unknown"||!(phase==="ready"||phase==="saved"))return;
  if(!valid(rules)){setError("Проверьте время интервалов и дни недели");return;}
  const ownerEpoch=epoch.current;
  const unchanged=()=>mounted.current&&ownerEpoch===epoch.current&&live();
  const payload=rules.map(r=>({
    weekday:r.weekday,startTime:r.startTime,endTime:r.endTime,isWorkingDay:r.isWorkingDay
  }));
  const collateralBefore=collateral({slotDurationMin:slotMinutes,dayOffs,exceptions});
  const controller=new AbortController();
  inFlight.current=true;setPhase("pending");setError("");
  try{
   await callTrainerConsultationMethod({
    descriptor:trainerStaffMethods[6],actor,accessToken:token!,
    targetTrainerId,body:{rules:payload},fetchImpl,signal:controller.signal
   });
   if(!unchanged())return;
   setPhase("verifying");
   const result=await callTrainerConsultationMethod({
    descriptor:trainerStaffMethods[5],actor:stableActor,accessToken:token!,
    targetTrainerId,fetchImpl,signal:controller.signal
   });
   if(!unchanged())return;
   if(!readAvailability(result)||snapshot(result.rules)!==snapshot(payload)||
      collateral(result)!==collateralBefore){
    throw Error("READBACK_MISMATCH");
   }
   setRules(result.rules.map(r=>({...r})));setDayOffs(result.dayOffs);
   setExceptions(result.exceptions);setSlotMinutes(result.slotDurationMin);
   setPhase("saved");
  }catch(err){
   if(unchanged()){
    setPhase("unknown");
    setError(err instanceof Error&&err.message==="STAFF_HTTP_409"?
     "Конфликт при сохранении. Проверьте расписание вручную, без повторной отправки.":
     "Результат сохранения неизвестен. Проверьте расписание; повторный PUT автоматически не выполняется.");
   }
  }finally{
   inFlight.current=false;
   controller.abort();
  }
 };
 const ready=phase==="ready"||phase==="saved"||busy||phase==="unknown";
 const verifiedNow=permitted&&live();
 return createElement("section",{"data-trainer-availability":"opt-in"},
  createElement("h2",null,"Моё расписание"),
  !verifiedNow?createElement("p",{role:"alert"},"Нет доступа к расписанию кинолога"):null,
  verifiedNow&&phase==="loading"?createElement("p",{role:"status"},"Загрузка расписания"):null,
  verifiedNow&&phase==="error"?createElement("p",{role:"alert"},error):null,
  verifiedNow&&phase==="error"?createElement("button",{
    type:"button","aria-label":"Повторить загрузку расписания",
    onClick:()=>{if(permitted&&live()&&!inFlight.current)setReadRetry(n=>n+1);},
  },"Повторить загрузку"):null,
  verifiedNow&&ready?createElement("div",null,
   createElement("p",null,"Продолжительность слота: "+slotMinutes+" мин."),
   createElement("p",null,"Изменение интервалов перестраивает свободные слоты на сервере."),
   createElement("div",{"aria-label":"Недельные интервалы"},
    rules.length===0?createElement("p",{role:"note"},
      "Недельных интервалов пока нет. Добавьте интервал, чтобы настроить приём."):null,
    ...rules.map((rule,index)=>createElement("fieldset",{key:index,disabled:busy||phase==="unknown"},
     createElement("legend",null,"Интервал "+(index+1)),
     createElement("label",null,"День недели",
      createElement("select",{"aria-label":"День недели "+(index+1),
       value:rule.weekday,onChange:(e:ChangeEvent<HTMLSelectElement>)=>
        edit(index,{weekday:Number(e.target.value)})},
       ...weekdays.map((name,day)=>createElement("option",{key:day,value:day},name))
      )),
     createElement("label",null,"Начало",
      createElement("input",{type:"time","aria-label":"Начало "+(index+1),
       value:rule.startTime,onChange:e=>edit(index,{startTime:e.target.value})})),
     createElement("label",null,"Окончание",
      createElement("input",{type:"time","aria-label":"Окончание "+(index+1),
       value:rule.endTime,onChange:e=>edit(index,{endTime:e.target.value})})),
     createElement("label",null,"Рабочий день",
      createElement("input",{type:"checkbox","aria-label":"Рабочий день "+(index+1),
       checked:rule.isWorkingDay,onChange:e=>edit(index,{isWorkingDay:e.target.checked})})),
     createElement("button",{type:"button",disabled:rules.length===1,
      onClick:()=>{if(!busy&&phase!=="unknown"&&live()){
       setRules(old=>old.filter((_,i)=>i!==index));setPhase("ready");
      }}},"Удалить интервал")
    ))
   ),
   createElement("button",{type:"button",disabled:busy||phase==="unknown"||rules.length>=70,
    onClick:()=>{if(live()){
      setRules(old=>[...old,{weekday:1,startTime:"09:00",endTime:"10:00",isWorkingDay:true}]);
      setPhase("ready");
    }}},"Добавить интервал"),
   createElement("button",{type:"button",disabled:busy||phase==="unknown",
    onClick:()=>void save()},"Сохранить расписание"),
   phase==="pending"?createElement("p",{role:"status"},"Сохраняем расписание"):null,
   phase==="verifying"?createElement("p",{role:"status"},"Проверяем расписание на сервере"):null,
   phase==="saved"?createElement("p",{role:"status"},"Расписание подтверждено сервером"):null,
   error?createElement("p",{role:"alert"},error):null,
   createElement("h3",null,"Выходные дни"),
   ...dayOffs.map(item=>createElement("p",{key:item.id},
    item.date+(item.reason?" — "+item.reason:""))),
   dayOffs.length===0?createElement("p",null,"Выходных дней пока нет"):null,
   createElement("h3",null,"Исключения"),
   ...exceptions.map(item=>createElement("p",{key:item.id},
    item.startAtUtc+" — "+item.endAtUtc+(item.reason?" · "+item.reason:""))),
   exceptions.length===0?createElement("p",null,"Исключений пока нет"):null,
   createElement("p",null,"Выходные и исключения показываются без изменения.")
  ):null
 );
}
