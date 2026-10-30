import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PrimaryButton, SecondaryButton } from "../../shared/ui";
import { RouteLink, petPath } from "../../shared/router/location";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { AuthUser } from "../../shared/auth/authApi";
import formStyles from "./PetCreateLegacy.module.css";
import typeStyles from "./PetCreateTypeSelector.module.css";
import fieldStyles from "./PetCreateFields.module.css";
import {
  emptyPetDraft, interpretPetCreateReply, mapPetCreateDraft,
  type PetCreateDraft, type PetCreateField,
  type PetReply, type PetResult,
} from "./petCreateS1";
import {
  confirmPetIntentWithVerifiedReplyS1, markPetIntentS1, newPetCreateIntentS1,
  newSyntheticUuidV4, prepareSyntheticFirstAttemptS1,
  prepareSyntheticManualRetryS1, toPetCreateJsonProposalS1,
  type PetCreateIntentS1, type PetCreateJsonProposalS1, type SyntheticAttemptS1,
} from "./petCreateIntentS1";

type SubmitMockOnly = (
  json: PetCreateJsonProposalS1, identity: PetCreateIntentS1,
) => Promise<PetReply>;
type Stage = "edit" | "pending" | "confirmed" | "unknown" | "denied" |
  "conflict" | "reauth" | "refreshing";
type Props = {
  actorId: string;
  submitSynthetic: SubmitMockOnly;
  /** Optional explicit refresh control, never an automatic pet POST retry. */
  refreshForManualRetry?: (expectedOwnerId:string)=>Promise<boolean>;
  onCancelIntent: () => void;
  connected?: boolean;
};
/** S1 contract preview only. No production submitter and NOT mounted in App.
 * Key by owner even if an eventual parent forgets to key its subtree:
 * A's input and pending/terminal state must never be visible to B.
 */
export function PetCreateS1Form(props: Props) {
  return <ActorPetCreateForm key={props.actorId} {...props}/>;
}
function ActorPetCreateForm({
  actorId, submitSynthetic, refreshForManualRetry, onCancelIntent, connected = false,
}: Props) {
  const cache = useQueryClient();
  // Subscribe to the existing current principal, WITHOUT initiating a /me
  // request. This isolated S1 component does not conduct network operations.
  const principal = useSyncExternalStore(
    callback => cache.getQueryCache().subscribe(callback),
    () => cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY) ?? null,
    () => null,
  );
  const owns = !!actorId && principal?.id === actorId;
  const [draft, setDraft] = useState<PetCreateDraft>({...emptyPetDraft});
  const [stage,setStage] = useState<Stage>("edit");
  const [fieldError,setFieldError] = useState<{field:PetCreateField;message:string}|null>(null);
  const [message,setMessage] = useState("");
  const [petId,setPetId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  const terminal = useRef(false);
  const alive = useRef(true);
  const latestActor = useRef(actorId);
  latestActor.current = actorId;
  const principalVersion = useRef(0);
  const sessionScope = useRef<string | null>(null);
  const createIntent = useRef<PetCreateIntentS1 | null>(null);
  useEffect(()=>{
    alive.current = true;
    // The identity can change A -> B -> A (or A -> guest -> A)
    // before a synthetic pending write resolves. Equal actor ID is NOT
    // sufficient. Cache events fence ALL intervening auth transitions,
    // including when Query structural sharing restores the same A object.
    const unsubscribe=cache.getQueryCache().subscribe(event=>{
      if(event.query.queryKey.length===CURRENT_USER_QUERY_KEY.length &&
        event.query.queryKey.every((key:unknown,i:number)=>key===CURRENT_USER_QUERY_KEY[i]))
        principalVersion.current++;
    });
    return ()=>{alive.current=false;unsubscribe();};
  },[cache]);
  useEffect(()=>{
    // After a complete React commit, put keyboard/screen-reader focus on
    // newly displayed mutation results. Never focus while pending.
    if(owns && (stage==="confirmed" || stage==="unknown" || stage==="denied" ||
        stage==="conflict" || stage==="reauth"))
      resultHeadingRef.current?.focus();
    else if(owns && stage==="edit" && message && !fieldError)
      errorRef.current?.focus();
  },[owns,stage,message,fieldError]);
  function sameActor(submittedBy:string):boolean {
    return alive.current && latestActor.current===submittedBy &&
      cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id===submittedBy;
  }
  function edit(field:PetCreateField,value:string) {
    if (terminal.current || inFlight.current || !owns) return;
    setDraft(previous=>({...previous,[field]:value}));
    setFieldError(null);
    setMessage("");
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!owns || inFlight.current || terminal.current || stage!=="edit" ||
        !sameActor(actorId)) return;
    const plan = mapPetCreateDraft(draft);
    if(!plan.ok){
      setFieldError(plan);
      setMessage(plan.message);
      const fieldName=plan.field==="type"?"petType":plan.field;
      formRef.current?.querySelector<HTMLInputElement>(
        '[name="'+fieldName+'"]',
      )?.focus();
      return;
    }
    const submissionActor=actorId;
    const submitPrincipalVersion=principalVersion.current;
    let intent:PetCreateIntentS1;
    try {
      sessionScope.current ??= newSyntheticUuidV4();
      intent=newPetCreateIntentS1(plan.body,{
        ownerId:submissionActor,
        authEpoch:submitPrincipalVersion,
        sessionScope:sessionScope.current,
      });
    } catch {
      terminal.current=true;
      setStage("denied");
      setMessage("Невозможно безопасно подготовить создание питомца.");
      return;
    }
    createIntent.current=intent;
    const attempt=prepareSyntheticFirstAttemptS1(intent,intent.binding);
    if (!attempt) throw new Error("Cannot prepare mock create attempt");
    await executeAttempt(intent,attempt);
  }
  async function manualRetry() {
    if(!owns || stage!=="unknown" || inFlight.current || !sameActor(actorId)) return;
    const intent=createIntent.current;
    if(!intent)return;
    const binding={
      ownerId:actorId,
      authEpoch:principalVersion.current,
      sessionScope:sessionScope.current ?? "",
    };
    const attempt=prepareSyntheticManualRetryS1(intent,binding,true);
    if(!attempt){
      // In particular, actor A -> B -> A is never the original auth epoch.
      terminal.current=true;
      setStage("denied");
      setMessage("Сессия изменилась. Проверьте список питомцев и войдите заново.");
      return;
    }
    await executeAttempt(intent,attempt);
  }
  async function refreshAfter401() {
    if (!refreshForManualRetry || !owns || stage!=="reauth" ||
        inFlight.current || !sameActor(actorId)) return;
    const intent=createIntent.current;
    if (!intent || intent.state!=="unknown") return;
    if(principalVersion.current!==intent.binding.authEpoch){
      terminal.current=true;
      setStage("denied");
      setMessage("Сессия изменилась. Результат создания не подтверждён.");
      return;
    }
    inFlight.current=true;
    setStage("refreshing");
    setMessage("Проверяем сессию. Создание питомца не повторяется автоматически.");
    let verified=false;
    try{
      verified=await refreshForManualRetry(intent.binding.ownerId)===true;
    }catch{
      verified=false;
    }finally{
      inFlight.current=false;
    }
    // A -> B -> A can preserve the same user ID but NOT auth epoch. An
    // unmounted component must not update UI/cache or navigate.
    if(!alive.current)return;
    if(!sameActor(intent.binding.ownerId) ||
        principalVersion.current!==intent.binding.authEpoch){
      terminal.current=true;
      setStage("denied");
      setMessage("Сессия изменилась. Результат создания не подтверждён.");
      return;
    }
    if(!verified){
      terminal.current=true;
      setStage("denied");
      setMessage("Не удалось подтвердить текущую сессию. Проверьте список питомцев.");
      return;
    }
    setStage("unknown");
    setMessage("Сессия подтверждена. Проверьте список питомцев; повтор возможен только вручную.");
  }
  async function executeAttempt(intent:PetCreateIntentS1,attempt:SyntheticAttemptS1) {
    const submissionActor=intent.binding.ownerId;
    const submitPrincipalVersion=intent.binding.authEpoch;
    if (inFlight.current || !sameActor(submissionActor) ||
        principalVersion.current!==submitPrincipalVersion) return;
    inFlight.current=true;
    setStage("pending");
    setFieldError(null);
    setMessage("");
    let result:PetResult | {kind:"reauth-required";message:string};
    try {
      // Injected S1 callback receives literal proposal JSON with the
      // SAME key/snapshot for manual retry. No fetch or wire headers exist.
      const json=toPetCreateJsonProposalS1(attempt);
      const reply=await submitSynthetic(json,intent);
      result=reply.status===401 && refreshForManualRetry
        ? {kind:"reauth-required",message:
            "Сессия требует обновления. Создание не повторяется автоматически."}
        : interpretPetCreateReply(reply,submissionActor,intent.body);
    } catch {
      result={kind:"unknown",message:
        "Результат создания не подтверждён. Проверьте список питомцев перед повторной попыткой."};
    } finally {
      inFlight.current=false;
    }
    if (!sameActor(submissionActor) || principalVersion.current!==submitPrincipalVersion) {
      // The HTTP operation may already have COMMITTED. Never accept its late
      // ACK and never display a manual retry for a superseded auth epoch.
      createIntent.current=markPetIntentS1(intent,"unknown");
      if (!alive.current) return;
      terminal.current=true;
      setStage("denied");
      setMessage("Сессия изменилась. Результат создания не подтверждён. Проверьте список питомцев.");
      return;
    }
    if(result.kind==="confirmed"){
      createIntent.current=confirmPetIntentWithVerifiedReplyS1(intent,result);
      terminal.current=true;
      setPetId(result.pet.id);
      setStage("confirmed");
      setMessage("Питомец создан. Проверьте список питомцев.");
    } else if(result.kind==="reauth-required"){
      createIntent.current=markPetIntentS1(intent,"unknown");
      terminal.current=true;
      setStage("reauth");
      setMessage(result.message);
    } else if(result.kind==="unknown" || result.kind==="denied" ||
        result.kind==="conflict"){
      createIntent.current=markPetIntentS1(intent,
        result.kind==="unknown"?"unknown":"abandoned");
      terminal.current=true;
      setStage(result.kind);
      setMessage(result.message);
    } else {
      createIntent.current=markPetIntentS1(intent,"abandoned");
      terminal.current=false;
      setStage("edit");
      setMessage(result.message);
    }
    // No Query writes or navigation until AG4's separate Web route gate.
  }
  const formFields: readonly {key:PetCreateField;label:string;required?:boolean}[]=[
    {key:"name",label:"Имя питомца",required:true},
    {key:"breed",label:"Порода",required:true},
    {key:"birthDate",label:"Дата рождения",required:true},
    {key:"heightCm",label:"Рост (см)"},
    {key:"neckGirthCm",label:"Обхват шеи (см)"},
    {key:"muzzleGirthCm",label:"Обхват морды (см)"},
    {key:"bellyGirthCm",label:"Обхват живота (см)"},
    {key:"notes",label:"Заметки"},
  ];
  const renderField=({key,label,required}:typeof formFields[number])=>
    <label key={key} className={fieldStyles.field} htmlFor={"g05-"+key}>
      <span>{label}</span>
      {key==="notes" ?
        <textarea id={"g05-"+key} name={key} rows={3} maxLength={500}
          autoComplete="off" disabled={stage==="pending"}
          aria-invalid={fieldError?.field===key}
          aria-describedby={fieldError?.field===key?"g05-error":undefined}
          placeholder="По желанию" value={draft[key]}
          onChange={event=>edit(key,event.target.value)}/> :
        <input id={"g05-"+key} name={key} type="text" required={required}
          autoComplete={key==="birthDate"?"bday":"off"}
          placeholder={key==="birthDate"?"ДД.ММ.ГГГГ":
            key==="name"?"Кличка":key==="breed"?"Например, лабрадор":"Необязательно"}
          inputMode={key.endsWith("Cm")?"decimal":"text"} disabled={stage==="pending"}
          aria-invalid={fieldError?.field===key}
          aria-describedby={fieldError?.field===key?"g05-error":undefined}
          value={draft[key]} onChange={event=>edit(key,event.target.value)}/>}
      {key==="birthDate" && <small className={fieldStyles.help}>Формат: ДД.ММ.ГГГГ</small>}
    </label>;
  const icon=<svg viewBox="0 0 24 24" width="28" height="28" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
    <ellipse cx="12" cy="16.5" rx="5.4" ry="4.3"/>
    <ellipse cx="5" cy="9.5" rx="1.8" ry="2.5"/>
    <ellipse cx="10" cy="6.5" rx="1.8" ry="2.5"/>
    <ellipse cx="15.5" cy="6.5" rx="1.8" ry="2.5"/>
    <ellipse cx="20" cy="9.5" rx="1.8" ry="2.5"/>
  </svg>;
  const frame=(content:ReactNode, labelledBy?:string)=>
    <main className={formStyles.page}>
      <section className={formStyles.card}
        aria-labelledby={labelledBy} aria-label={labelledBy?undefined:"Создание питомца (S1)"}>
        {content}
      </section>
    </main>;
  if(!owns)return frame(<p role="alert">Требуется авторизация. Действие недоступно.</p>);
  if(stage==="confirmed")return frame(<>
    <div className={formStyles.iconWrap}>{icon}</div>
    <h2 ref={resultHeadingRef} tabIndex={-1}>Питомец создан</h2>
    <p role="status">{message}</p>
    {!connected && <p data-testid="mock-created-pet-id">ID: {petId}</p>}
    {connected && petId && <RouteLink to={petPath(petId)}>Открыть карточку питомца</RouteLink>}
    <div className={formStyles.actions}>
      <button type="button" className={formStyles.cancel} onClick={onCancelIntent}>
        {connected?"К моим питомцам":"Вернуться"}
      </button>
    </div>
  </>);
  if(stage==="unknown"||stage==="denied"||stage==="conflict"||
      stage==="reauth"||stage==="refreshing")return frame(<>
    <h2 ref={resultHeadingRef} tabIndex={-1}>Проверьте результат</h2>
    <p role="alert" className={formStyles.errorBox}>{message}</p>
    <p>Автоматической повторной отправки нет. Перед ручным повтором проверьте список питомцев.</p>
    <div className={formStyles.actions}>
      {stage==="reauth" && <button type="button" data-testid="g05-refresh-session"
        className={fieldStyles.submit} onClick={()=>void refreshAfter401()}>
        {connected?"Обновить сессию":"Обновить сессию (mock)"}
      </button>}
      {stage==="unknown" && <button type="button" data-testid="g05-manual-retry"
        className={fieldStyles.submit} onClick={()=>void manualRetry()}>
        {connected?"Повторить вручную":"Повторить вручную (mock)"}
      </button>}
      <button type="button" className={formStyles.cancel}
        disabled={stage==="refreshing"} onClick={onCancelIntent}>Вернуться</button>
    </div>
  </>);
  return frame(<>
    <div className={formStyles.iconWrap}>{icon}</div>
    <h1 id="g05-form-title" className={`${formStyles.title} ${fieldStyles.sourceTitle}`}>Добавить питомца</h1>
    <p className={formStyles.lead}>Заполните данные о питомце. Дату рождения укажите как
      ДД.ММ.ГГГГ (например, 15.03.2020).</p>
    {!connected && <p className={`${formStyles.loadingHint} note`}>Это локальная проверка формы.
      Серверное создание питомца ещё не подключено.</p>}
    <form ref={formRef} className={fieldStyles.originalForm} noValidate
      onSubmit={event=>void submit(event)}
      aria-busy={stage==="pending"}>
      <p className={formStyles.sectionTitle}>Основная информация</p>
      <div className={formStyles.fields}>
        {formFields.slice(0,1).map(renderField)}
        <fieldset className={typeStyles.group} disabled={stage==="pending"}>
          <legend>Тип питомца</legend>
          <div className={typeStyles.choices}>
            {(["DOG","CAT"] as const).map(type=><label key={type} className={typeStyles.choice}>
              <input type="radio" name="petType" value={type}
                aria-invalid={fieldError?.field==="type"}
                aria-describedby={fieldError?.field==="type"?"g05-error":undefined}
                checked={draft.type===type} onChange={()=>edit("type",type)}/>
              <img src={`/images/pet-type-${type==="DOG"?"dog":"cat"}.webp`} alt=""
                width="48" height="48" loading="lazy"/>
              <span>{type==="DOG"?"Собака":"Кошка"}</span>
            </label>)}
          </div>
        </fieldset>
        {formFields.slice(1,3).map(renderField)}
      </div>
      <p className={formStyles.sectionTitle}>Физические характеристики</p>
      <div className={formStyles.fields}>{formFields.slice(3,7).map(renderField)}</div>
      <p className={formStyles.sectionTitle}>Дополнительно</p>
      <div className={formStyles.fields}>{formFields.slice(7).map(renderField)}</div>
      {message && <p role="alert" id="g05-error" className={formStyles.errorBox}
        ref={errorRef} tabIndex={-1}>{message}</p>}
      {stage==="pending" && <p role="status" className={formStyles.loadingHint}>Сохраняем…</p>}
      <div className={formStyles.actions}>
        <PrimaryButton type="submit" fullWidth disabled={stage==="pending"}>
          Добавить питомца
        </PrimaryButton>
        <SecondaryButton type="button" variant="red" fullWidth
          disabled={stage==="pending"} onClick={onCancelIntent}>
          Отмена
        </SecondaryButton>
      </div>
    </form>
  </>,"g05-form-title");
}
