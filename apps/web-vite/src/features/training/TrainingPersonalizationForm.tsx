import { Loading } from "../../shared/ui";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {PrimaryButton} from "../../shared/ui";
import {useQueryClient} from "@tanstack/react-query";
import {ApiError} from "../../shared/api/client";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {AuthUser} from "../../shared/auth/authApi";
import {RouteLink} from "../../shared/router/location";
import {submitTrainingPersonalization,verifyTrainingPersonalization,
  getSavedTrainingPersonalization,type PersonalizationDraft} from "./trainingDaysApi";

type Phase="loading"|"ready"|"sending"|"checking"|"unknown"|"verified";
const initial:PersonalizationDraft={userDisplayName:"",userGender:"male",petName:"",
  petGender:null,petNameGen:null,petNameDat:null,petNameAcc:null,petNameIns:null,petNamePre:null};
const wordFields=[
  ["petNameGen","Родительный (нет кого?)"],
  ["petNameDat","Дательный (кому?)"],
  ["petNameAcc","Винительный (вижу кого?)"],
  ["petNameIns","Творительный (кем?)"],
  ["petNamePre","Предложный (о ком?)"],
] as const;

/** Uses the original already-registered Hono POST + owner-only raw GET.
 * We never cache a real name/pet name in React Query. Once a POST is sent,
 * only fresh GET can resolve an uncertain ACK; never offer a second POST.
 */
export function TrainingPersonalizationForm({ownerId,courseId,courseType,onVerified,
  editMode=false}:{
  ownerId:string;courseId:string;courseType:string;onVerified():void;
  editMode?:boolean;
}){
  const cache=useQueryClient();
  const first=useRef(cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY));
  const revoked=useRef(false);
  const inFlight=useRef(false);
  const attempted=useRef(false);
  const [revokedState,setRevokedState]=useState(false);
  const [values,setValues]=useState<PersonalizationDraft>(initial);
  const [phase,setPhase]=useState<Phase>(editMode?"loading":"ready");
  const [message,setMessage]=useState("");
  const sameOwner=useCallback(()=>{
    const now=cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY);
    const before=first.current;
    const epoch=(p:AuthUser|null|undefined)=>
      (p as (AuthUser&{sessionRevision?:unknown})|undefined)?.sessionRevision;
    return !revoked.current&&!!before&&!!now&&before.id===ownerId&&
      now.id===ownerId&&now.username===before.username&&
      now.role===before.role&&epoch(now)===epoch(before);
  },[cache,ownerId]);
  useEffect(()=>{
    const unsubscribe=cache.getQueryCache().subscribe(event=>{
      if(event.query.queryKey.length!==CURRENT_USER_QUERY_KEY.length||
        event.query.queryKey.some((item:unknown,index:number)=>
          item!==CURRENT_USER_QUERY_KEY[index]))return;
      if(event.type==="removed"||!sameOwner()){
        revoked.current=true;
        setRevokedState(true);
        setValues(initial);
        setMessage("");
      }
    });
    return unsubscribe;
  },[cache,ownerId,sameOwner]);
  useEffect(()=>{
    if(!editMode||!sameOwner())return;
    let active=true;
    void getSavedTrainingPersonalization(courseType,courseId).then(saved=>{
      if(!active||!sameOwner())return;
      setValues(saved);
      setPhase("ready");
    }).catch(()=>{
      if(!active||!sameOwner())return;
      setPhase("loading");
      setMessage("Не удалось загрузить текущую персонализацию. Откройте курс заново.");
    });
    return ()=>{active=false;};
  },[editMode,sameOwner,courseType,courseId]);
  const available=sameOwner()&&!revokedState;
  const update=(name:keyof PersonalizationDraft,value:string)=>{
    if(!available||phase!=="ready")return;
    setValues(previous=>({...previous,[name]:name==="userGender"?
      (value==="female"?"female":"male"):
      name==="petGender"?(value==="male"||value==="female"?value:null):value}));
  };
  const verified=()=>{
    if(!sameOwner())return;
    setPhase("verified");setMessage("Персонализация сохранена и проверена.");
    onVerified();
  };
  const check=async()=>{
    if(inFlight.current||!sameOwner()||!attempted.current||
      phase==="verified")return;
    inFlight.current=true;
    setPhase("checking");setMessage("");
    try{
      const match=await verifyTrainingPersonalization(courseType,courseId,values);
      if(!sameOwner())return;
      if(match){verified();return;}
      setPhase("unknown");
      setMessage("Сервер пока не подтверждает эти данные. Не отправляйте форму ещё раз.");
    }catch{
      if(sameOwner()){
        setPhase("unknown");
        setMessage("Не удалось проверить сохранение. Повторная отправка запрещена.");
      }
    }finally{inFlight.current=false;}
  };
  const save=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(inFlight.current||attempted.current||phase!=="ready"||!sameOwner())return;
    if(!values.userDisplayName.trim()||!values.petName.trim()){
      setMessage("Заполните ваше имя и кличку питомца.");return;
    }
    inFlight.current=true;
    attempted.current=true;
    setPhase("sending");setMessage("");
    let acknowledged=false;
    try{
      await submitTrainingPersonalization(courseId,values);
      acknowledged=true;
    }catch(error){
      if(!sameOwner())return;
      const known=error instanceof ApiError&&
        [400,401,403,404,409,422,429].includes(error.status);
      if(known){
        // These are definitive rejected HTTP statuses, not missing ACKs.
        attempted.current=false;
        setPhase("ready");
        setMessage(error.status===429?"Слишком много запросов. Попробуйте позже.":
          error.status===401?"Сессия завершена. Войдите снова.":
            "Сервер отклонил персонализацию. Проверьте доступ и поля.");
        return;
      }
    }finally{inFlight.current=false;}
    if(!sameOwner())return;
    setPhase("unknown");
    setMessage(acknowledged?"Проверяем, сохранились ли данные…":
      "Ответ сохранения неизвестен. Не отправляйте форму повторно.");
    // Even a confirmed 200 is not success until an independent owner GET
    // verifies all fields; a lost ACK can also be settled read-only.
    await Promise.resolve();
    if(sameOwner())void check();
  };
  if(revokedState||!available)return <section role="alert">
    Сессия изменилась. Откройте курс заново, чтобы персонализировать его.
  </section>;
  return <section className="training-personalization" aria-label="Персонализация курса">
    <h3>Персонализация курса</h3>
    <p>Эти данные помогут обращаться к вам и вашему питомцу по имени в заданиях.</p>
    {phase==="loading"&&<p role={message?"alert":"status"}>
      {message||"Загружаем текущую персонализацию…"}
    </p>}
    <form onSubmit={event=>void save(event)} aria-label="Форма персонализации курса">
      <label htmlFor="training-personal-user">Ваше имя *</label>
      <input id="training-personal-user" value={values.userDisplayName}
        required maxLength={100} autoComplete="given-name" disabled={phase!=="ready"}
        onChange={event=>update("userDisplayName",event.target.value)}/>
      <label htmlFor="training-personal-gender">Ваш пол *</label>
      <select id="training-personal-gender" value={values.userGender}
        disabled={phase!=="ready"}
        onChange={event=>update("userGender",event.target.value)}>
        <option value="male">Мужской</option><option value="female">Женский</option>
      </select>
      <label htmlFor="training-personal-pet">Кличка питомца *</label>
      <input id="training-personal-pet" value={values.petName} required
        maxLength={100} disabled={phase!=="ready"}
        onChange={event=>update("petName",event.target.value)}/>
      <label htmlFor="training-personal-pet-gender">Пол питомца</label>
      <select id="training-personal-pet-gender" value={values.petGender??""}
        disabled={phase!=="ready"}
        onChange={event=>update("petGender",event.target.value)}>
        <option value="">Не указан</option><option value="male">Мужской</option>
        <option value="female">Женский</option>
      </select>
      <p>Если кличка склоняется, заполните формы для правильного текста уроков.</p>
      {wordFields.map(([name,label])=><label key={name} htmlFor={`training-personal-${name}`}>
        {label}
        <input id={`training-personal-${name}`} value={values[name]??""}
          maxLength={100} disabled={phase!=="ready"}
          onChange={event=>update(name,event.target.value)}/>
      </label>)}
      {phase==="ready"&&<PrimaryButton type="submit">
        Сохранить персонализацию
      </PrimaryButton>}
      {phase==="sending"&&<p role="status">Отправляем персонализацию…</p>}
      {phase==="checking"&&<Loading message="Проверяем сохранение…" />}
      {phase==="unknown"&&<button type="button" className="button-secondary"
        onClick={()=>void check()} disabled={inFlight.current}>Проверить сохранение</button>}
      {message&&<p role={phase==="verified"?"status":"alert"}>{message}</p>}
      <RouteLink to="/courses">Вернуться к курсам</RouteLink>
    </form>
  </section>;
}
