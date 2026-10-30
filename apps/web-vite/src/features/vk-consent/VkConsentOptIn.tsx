import { Loading } from "../../shared/ui";
import { BackButton, PrimaryButton } from "../../shared/ui";
import {useEffect,useRef,useState,useSyncExternalStore,type FormEvent} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {AuthUser} from "../../shared/auth/authApi";
import {buildVkConsentAttempt,isDefiniteVkConsentDenial,
  projectVkConsentCompletion,projectVkConsentSummary,
  validateVkConsentContext,type VkConsentWire} from "./vkConsentSource";

type Outcome="idle"|"pending"|"denied"|"unknown"|"accepted"|"checked";
function VkConsentForm({contextToken,state,transport,alive,onBack}:{
  contextToken:string;state:string;transport:VkConsentWire;
  alive:()=>boolean;onBack:()=>void;
}){
  const [consents,setConsents]=useState({acceptPersonalData:false,
    acceptPrivacyPolicy:false,acceptDataDistribution:false});
  const [promoCode,setPromoCode]=useState("");
  const [outcome,setOutcome]=useState<Outcome>("idle");
  const [readback,setReadback]=useState("");
  const attempted=useRef(false),checked=useRef(false),mounted=useRef(true);
  useEffect(()=>()=>{mounted.current=false;},[]);
  const current=()=>mounted.current&&alive();
  const summary=useQuery({
    queryKey:["vk-consent","synthetic-context",contextToken,state],
    queryFn:async()=>{
      const v=projectVkConsentSummary(await transport.inspect(contextToken,state));
      if(!alive())throw Error("STALE_VK_CONTEXT");
      return v;
    },enabled:alive(),retry:false,staleTime:0,gcTime:0,
  });
  const accepted=Object.values(consents).every(Boolean);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(attempted.current||!current()||!summary.isSuccess||
      summary.data.completed||!accepted)return;
    let payload;
    try{payload=buildVkConsentAttempt(contextToken,state,consents,promoCode);}
    catch{setReadback("Проверьте согласия и промокод.");return;}
    attempted.current=true;
    setReadback("");setOutcome("pending");
    try{
      const result=await transport.submit(payload);
      if(!current())return;
      projectVkConsentCompletion(result); // Never expose or store bearer/refresh tokens.
      setOutcome("accepted");
    }catch(e){
      if(!current())return;
      const definite=isDefiniteVkConsentDenial(e);
      setOutcome(definite?"denied":"unknown");
      setReadback(definite?
        "Сервер отклонил подтверждение. Начните новый вход через VK.":
        "Результат подтверждения неизвестен. Не отправляйте согласия повторно.");
    }
  }
  async function manualReadback(){
    if(checked.current||!attempted.current||!current()||
      !["denied","unknown"].includes(outcome))return;
    checked.current=true;setOutcome("pending");
    try{
      const v=projectVkConsentSummary(await transport.inspect(contextToken,state));
      if(!current())return;
      setOutcome("checked");
      setReadback(v.completed?
        "Сервер сообщает, что контекст завершён. Вход в Web не подтверждён.":
        "Контекст ещё не завершён. Повторная отправка запрещена; начните новый вход.");
    }catch{
      if(!current())return;
      setOutcome("unknown");
      setReadback("Не удалось уточнить статус. Не отправляйте согласия повторно.");
    }
  }
  if(!alive())return <p role="alert">
    Сессия изменилась. Начните авторизацию заново.</p>;
  return <section className="vk-consent-panel" aria-label="Согласия VK (макет)">
    <header><h2>Согласия для регистрации через VK</h2>
      <BackButton type="button" onClick={onBack}>К регистрации</BackButton></header>
    <p className="note">Изолированный макет. Учетная запись и вход не создаются.</p>
    {summary.isPending&&<Loading message="Проверяем контекст…" />}
    {summary.isError&&<div role="alert">
      <p>Ссылка VK недействительна или срок её действия истёк.</p>
      <PrimaryButton type="button" onClick={()=>void summary.refetch()}>Повторить проверку</PrimaryButton>
    </div>}
    {summary.isSuccess&&summary.data.completed&&<p role="status">
      Этот контекст уже завершён. Начните новый вход через VK.</p>}
    {summary.isSuccess&&!summary.data.completed&&<>
      <form onSubmit={event=>void submit(event)}>
        {([
          ["acceptPersonalData","Согласие на обработку персональных данных",
            "/personal.html"],
          ["acceptPrivacyPolicy","Политика конфиденциальности",
            "/policy.html"],
          ["acceptDataDistribution","Согласие на размещение данных в публичном профиле",
            "/personal-distribution.html"],
        ] as const).map(([key,label,href])=><label key={key} className="vk-consent-row">
          <input type="checkbox" checked={consents[key]}
            disabled={attempted.current}
            onChange={event=>setConsents(old=>({...old,[key]:event.target.checked}))}/>
          <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>
        </label>)}
        <label htmlFor="vk-consent-promo">Промокод (необязательно)</label>
        <input id="vk-consent-promo" value={promoCode} maxLength={64}
          autoCapitalize="characters" autoComplete="off"
          disabled={attempted.current}
          onChange={event=>setPromoCode(event.target.value)}/>
        {summary.data.savedPromoCode&&<p className="note">
          Сохранённый сервером промокод: {summary.data.savedPromoCode}</p>}
        <PrimaryButton type="submit" disabled={!accepted||attempted.current}>
          {outcome==="pending"?"Подтверждаем…":"Принять и продолжить"}
        </PrimaryButton>
      </form>
      {outcome==="accepted"&&<p role="status">
        Синтетическое подтверждение принято. Web-вход не выполнялся.</p>}
      {(outcome==="denied"||outcome==="unknown"||outcome==="checked")&&
        <div role="alert"><p>{readback}</p>
          {!checked.current&&outcome!=="checked"&&<PrimaryButton type="button"
            onClick={()=>void manualReadback()}>Проверить статус вручную</PrimaryButton>}
        </div>}
    </>}
  </section>;
}
function GuestBound({contextToken,state,transport}:{
  contextToken:string;state:string;transport:VkConsentWire;
}){
  const cache=useQueryClient();
  const first=useRef(cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id??null);
  const epoch=useRef(0),last=useRef(first.current);
  const version=useSyncExternalStore(cb=>cache.getQueryCache().subscribe(event=>{
    if(event.query.queryKey.length===CURRENT_USER_QUERY_KEY.length&&
      event.query.queryKey.every((part:unknown,i:number)=>part===CURRENT_USER_QUERY_KEY[i])){
      const now=cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id??null;
      if(now!==last.current&&(now!==null||event.type==="removed"||
        event.query.state.data===null)){
        last.current=now;epoch.current++;cb();
      }
    }
  }),()=>epoch.current,()=>epoch.current);
  const [open,setOpen]=useState(false);
  const guest=()=>epoch.current===0&&
    cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)===null;
  if(first.current!==null||version!==0||!guest())return <p role="alert">
    Сессия изменилась. Начните авторизацию заново.</p>;
  if(!open)return <div className="vk-consent-entry">
    <button type="button" onClick={()=>setOpen(true)}>
      Согласия VK (макет)</button></div>;
  return <VkConsentForm contextToken={contextToken} state={state}
    transport={transport} alive={guest} onBack={()=>setOpen(false)}/>;
}
/** Guest-only explicit opt-in; never mounted on normal /vk-consent route. */
export function VkConsentOptIn({enabled,contextToken,state,transport}:{
  enabled:boolean;contextToken?:string;state?:string;transport?:VkConsentWire;
}){
  if(!enabled||transport?.fixtureKind!=="AG2_VK_CONSENT_SYNTHETIC_NO_REAL_AUTH"||
    !contextToken||!state)return null;
  try{validateVkConsentContext(contextToken,state);}
  catch{return null;}
  return <GuestBound key={contextToken+":"+state}
    contextToken={contextToken} state={state} transport={transport}/>;
}
