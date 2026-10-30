import { BackButton, PrimaryButton, SecondaryButton, Loading } from "../../shared/ui";
import {useEffect,useRef,useState,useSyncExternalStore,type FormEvent} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {AuthUser} from "../../shared/auth/authApi";
import {RouteLink} from "../../shared/router/location";
import type {G04SourceMockConsumer,G04Verdict} from "./g04SourceMockConsumer";

type Phase="start"|"code"|"review"|"pending"|"unknown"|"mock-complete";
type Action="requestCode"|"deleteAccount";
/** Hono-shaped consumer injected by opt-in harness; no real Web route. */
export function AccountDeletionS1Form({
  actorId,hasVerifiedEmail,consumer,requiredUsername,onBack,readback,
}:{
  actorId:string;hasVerifiedEmail:boolean;consumer:G04SourceMockConsumer;
  /** Optional stronger confirmation for WEB-URL-038; G04 is the sole form. */
  requiredUsername?:string;
  onBack?:()=>void;
  readback?:()=>Promise<"active"|"unauthenticated">;
}){
  const cache=useQueryClient();
  const principal=useSyncExternalStore(
    cb=>cache.getQueryCache().subscribe(cb),
    ()=>cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)??null,
    ()=>null,
  );
  const owns=!!actorId&&principal?.id===actorId&&principal.role==="USER";
  const [phase,setPhase]=useState<Phase>("start");
  const [code,setCode]=useState("");
  const [typedUsername,setTypedUsername]=useState("");
  const [manualStatus,setManualStatus]=useState("");
  const [manualPending,setManualPending]=useState(false);
  const manualUsed=useRef(false);
  const [confirmed,setConfirmed]=useState(false);
  const [message,setMessage]=useState("");
  const [action,setAction]=useState<Action|null>(null);
  const inFlight=useRef(false);
  const alive=useRef(true);
  const revision=useRef(0);
  const codeIssuedRevision=useRef<number|null>(null);
  const codeInput=useRef<HTMLInputElement>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{
    alive.current=true;
    const unsubscribe=cache.getQueryCache().subscribe(event=>{
      if(event.query.queryKey.length===CURRENT_USER_QUERY_KEY.length &&
        event.query.queryKey.every((item:unknown,index:number)=>
          item===CURRENT_USER_QUERY_KEY[index]))revision.current++;
    });
    return ()=>{alive.current=false;unsubscribe();};
  },[cache]);
  useEffect(()=>{
    if(owns&&(phase==="unknown"||phase==="mock-complete"))
      heading.current?.focus();
  },[phase,owns]);
  const present=()=>alive.current&&(()=>{
    const current=cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY);
    return current?.id===actorId&&current.role==="USER";
  })();
  async function perform(operation:Action,snapshot?:string){
    if(!owns||!present()||inFlight.current||!hasVerifiedEmail)return;
    const initialRevision=revision.current;
    inFlight.current=true;
    setAction(operation);setPhase("pending");setMessage("");
    let verdict:G04Verdict;
    try {
      verdict=operation==="requestCode"
        ?await consumer.requestCode(actorId)
        :await consumer.deleteAccount(actorId,snapshot??"");
    }catch{
      verdict={kind:"unknown",message:
        "Результат запроса не подтверждён. Не повторяйте действие автоматически."};
    }finally{
      inFlight.current=false;
    }
    if(!alive.current||!present()||revision.current!==initialRevision){
      if(!alive.current)return;
      setCode("");setConfirmed(false);setTypedUsername("");setPhase("unknown");
      setMessage("Сессия изменилась. Результат запроса неизвестен. Повтор заблокирован.");
      return;
    }
    setMessage(verdict.message);
    if(verdict.kind==="accepted"){
      if(operation==="requestCode"){
        codeIssuedRevision.current=revision.current;
        setPhase("code");
      }else{
        // Never claim a real user deletion / trigger logout on synthetic ACK.
        setCode("");setConfirmed(false);setTypedUsername("");setPhase("mock-complete");
      }
    }else if(verdict.kind==="rejected"){
      setPhase(operation==="requestCode"?"start":"review");
    }else{
      // An HTTP result may be lost AFTER SQL COMMIT.
      setCode("");setConfirmed(false);setTypedUsername("");setPhase("unknown");
    }
  }
  function submitCode(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(phase!=="code"||!owns||inFlight.current)return;
    if(codeIssuedRevision.current!==revision.current){
      setCode("");setConfirmed(false);setTypedUsername("");setPhase("unknown");
      setMessage("Сессия изменилась. Старый код нельзя отправить.");return;
    }
    if(!/^[0-9]{6}$/.test(code)){
      setMessage("Введите шесть цифр из письма.");
      codeInput.current?.focus();return;
    }
    setConfirmed(false);setMessage("");setPhase("review");
  }
  function deleteExplicitly(){
    if(phase!=="review"||!confirmed||!owns||!present()||inFlight.current||
      !/^[0-9]{6}$/.test(code)||
      (requiredUsername!==undefined&&typedUsername!==requiredUsername))return;
    if(codeIssuedRevision.current!==revision.current){
      setCode("");setConfirmed(false);setTypedUsername("");setPhase("unknown");
      setMessage("Сессия изменилась. Старый код нельзя отправить.");return;
    }
    void perform("deleteAccount",code);
  }
  async function manualReadback(){
    if(!readback||manualUsed.current||phase!=="unknown"||!present())return;
    manualUsed.current=true;setManualPending(true);
    const at=revision.current;
    try{
      const result=await readback();
      if(!present()||revision.current!==at)return;
      setManualStatus(result==="active"
        ?"Сессия активна. Это не доказывает, что удаление не выполнялось."
        :"Сессия недоступна. Это НЕ подтверждает удаление аккаунта.");
    }catch{
      if(present()&&revision.current===at)
        setManualStatus("Проверка состояния не удалась. Результат неизвестен.");
    }finally{
      if(present()&&revision.current===at)setManualPending(false);
    }
  }
  const back=onBack?<BackButton type="button"
    onClick={onBack}>В профиль</BackButton>:<RouteLink to="/profile">В профиль</RouteLink>;
  if(!owns)return <section aria-label="Удаление аккаунта" className="account-card">
    <p role="alert">Требуется авторизация.</p>
    {back}
  </section>;
  if(!hasVerifiedEmail)return <section className="account-card"
    aria-labelledby="g04-no-email">
    <h2 id="g04-no-email">Удаление аккаунта</h2>
    <p>Чтобы подтвердить удаление, сначала укажите email в профиле.</p>
    <RouteLink to="/profile/change-email">Указать или сменить email</RouteLink>
    <p>{back}</p>
  </section>;
  if(phase==="unknown"||phase==="mock-complete" ||
      ((phase==="code"||phase==="review") &&
       codeIssuedRevision.current!==revision.current))return <section
    className="account-card" aria-label="Результат G04">
    <h2 ref={heading} tabIndex={-1}>
      {phase==="mock-complete"?"Синтетическая проверка завершена":"Проверьте результат"}
    </h2>
    <p role="status">{phase==="unknown"||phase==="mock-complete"?message:
      "Сессия изменилась. Старый код нельзя отправить."}</p>
    <p>В реальном приложении удаление пока отключено. Повторной отправки нет.</p>
    {manualStatus&&<p role="status">{manualStatus}</p>}
    {phase==="unknown"&&readback&&!manualUsed.current&&
      <PrimaryButton type="button" disabled={manualPending}
       onClick={()=>void manualReadback()}>Проверить состояние вручную</PrimaryButton>}
    {back}
  </section>;
  return <section className="account-card" aria-labelledby="g04-title">
    <h2 id="g04-title">Удаление аккаунта</h2>
    <p><strong>Необратимое действие.</strong> После настоящего удаления
      невозможно будет восстановить профиль, тренировки и сессии.</p>
    <p>Для подтверждения требуется шестизначный код из письма.
      Этот экран работает только с синтетическим источником.</p>
    {phase==="start"&&<PrimaryButton type="button" data-testid="g04-request-code"
      disabled={inFlight.current} onClick={()=>void perform("requestCode")}>
      Отправить код на email (mock)
    </PrimaryButton>}
    {phase==="code"&&<form onSubmit={submitCode}>
      <label htmlFor="g04-code">Код из письма</label>
      <input id="g04-code" type="password" inputMode="numeric"
        autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
        value={code} ref={codeInput} onChange={event=>{
          setCode(event.target.value);setMessage("");
        }} />
      <PrimaryButton type="submit">Продолжить</PrimaryButton>
    </form>}
    {phase==="review"&&<>
      <p role="alert">Последнее подтверждение: это удаление необратимо.</p>
      {requiredUsername!==undefined&&<>
        <label htmlFor="g04-confirm-username">Для подтверждения введите: {requiredUsername}</label>
        <input id="g04-confirm-username" autoComplete="off" maxLength={128}
          value={typedUsername} onChange={e=>setTypedUsername(e.target.value)}/>
      </>}
      <label><input type="checkbox" data-testid="g04-confirm-check"
        checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>
        Я понимаю, что восстановление аккаунта невозможно.</label>
      <SecondaryButton variant="red" type="button" data-testid="g04-confirm-delete"
        disabled={!confirmed||inFlight.current||
          (requiredUsername!==undefined&&typedUsername!==requiredUsername)}
        onClick={deleteExplicitly}>Удалить навсегда (только mock)</SecondaryButton>
      <button type="button" className="button-secondary" onClick={()=>{
        setConfirmed(false);setPhase("code");
      }}>Назад к коду</button>
    </>}
    {phase==="pending"&&<Loading variant="compact"
      message={action==="requestCode"?"Проверяем запрос кода…":"Проверяем подтверждение…"} />}
    {message&&<p role="alert">{message}</p>}
    <p>{back}</p>
  </section>;
}
