import { Loading } from "../../shared/ui";
import {useEffect,useRef,useState,useSyncExternalStore,type FormEvent} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {AuthUser} from "../../shared/auth/authApi";
import type {PetDetails} from "./petApi";
import {classifyPetEditAck,classifyPetReadback,
  petEditErrorCopy,petEditPath,toDraft,validatePetEdit,
  type PetEditDraft,type PetEditPatch,type PetEditWire,
  type PetEditOutcome} from "./petEditSourceMock";
import {PrimaryButton, SecondaryButton} from "../../shared/ui";
type Phase="form"|"result";
const numbers=[
  ["weightKg","Вес, кг"],["heightCm","Рост, см"],
  ["neckGirthCm","Обхват шеи, см"],["muzzleGirthCm","Обхват морды, см"],
  ["bellyGirthCm","Обхват живота, см"],
] as const;
function ActualPetForm({ownerId,pet,transport,isCurrent,onExit,onAttempt}:{
  ownerId:string;pet:PetDetails;transport:PetEditWire;
  isCurrent:()=>boolean;onExit:()=>void;onAttempt:()=>void;
}){
  const [draft,setDraft]=useState<PetEditDraft>(()=>toDraft(pet));
  const [error,setError]=useState("");
  const [phase,setPhase]=useState<Phase>("form");
  const [busy,setBusy]=useState(false);
  const [outcome,setOutcome]=useState<PetEditOutcome|null>(null);
  const [readback,setReadback]=useState<"idle"|"loading"|"match"|"unproven">("idle");
  const submitted=useRef(false);
  const alive=useRef(true);
  const currentRef=useRef(isCurrent);currentRef.current=isCurrent;
  const lastPatch=useRef<PetEditPatch|null>(null);
  const readRequested=useRef(false);
  useEffect(()=>()=>{alive.current=false;},[]);
  const safe=()=>alive.current&&currentRef.current();
  const change=<K extends keyof PetEditDraft>(field:K,value:PetEditDraft[K])=>
    setDraft(prev=>({...prev,[field]:value}));
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(phase!=="form"||submitted.current||!safe())return;
    const check=validatePetEdit(pet,draft);
    if(!check.ok){setError(check.message);return;}
    if(transport.fixtureKind!=="AG2_PET_EDIT_SYNTHETIC_ONLY")return;
    submitted.current=true;lastPatch.current=check.patch;
    onAttempt();
    setBusy(true);setError("");
    try{
      const result=await transport.update({ownerId,method:"PUT",
        path:petEditPath(pet.id),body:check.patch});
      if(!safe())return;
      setOutcome(classifyPetEditAck(result,pet.id,check.patch));
      setPhase("result");
    }catch{
      if(safe()){setOutcome({kind:"UNKNOWN"});setPhase("result");}
    }finally{if(safe())setBusy(false);}
  };
  const checkAfter=async()=>{
    if(!lastPatch.current||readRequested.current||!safe())return;
    readRequested.current=true;setReadback("loading");
    try{
      const petResult=await transport.readback({ownerId,method:"GET",
        path:petEditPath(pet.id)});
      if(!safe())return;
      setReadback(classifyPetReadback(petResult,pet.id,lastPatch.current)==="MATCH_MOCK"?
        "match":"unproven");
    }catch{
      if(safe())setReadback("unproven");
    }
  };
  if(phase==="result")return <section className="pet-edit-result" aria-label="Результат редактирования">
    <h3>Результат сохранения</h3>
    {outcome?.kind==="ACK_MOCK"?
      <p role="status">Получен ACK только синтетического обновления. Настоящие данные не изменены.</p>:
      outcome?.kind==="REJECTED"?
        <p role="alert">{petEditErrorCopy(outcome.status)} Это не подтверждает сохранение.</p>:
        <p role="alert">Результат неизвестен. Повторять сохранение автоматически небезопасно.</p>}
    {readback==="idle"&&<PrimaryButton type="button" onClick={()=>void checkAfter()}>
      Проверить карточку (макет)
    </PrimaryButton>}
    {readback==="loading"&&<Loading message="Проверяем данные питомца…" />}
    {readback==="match"&&<p role="status">
      Значения совпадают только в синтетическом readback. Это не подтверждает реальное сохранение.
    </p>}
    {readback==="unproven"&&<p role="status">
      Сохранение не подтверждено. Отсутствие изменений в карточке не доказывает неуспех операции.
    </p>}
    <button type="button" className="button-secondary" onClick={onExit}>
      К карточке питомца
    </button>
  </section>;
  return <form className="pet-edit-form" aria-label="Редактирование питомца"
    onSubmit={event=>void submit(event)}>
    <h3>Редактирование: {pet.name}</h3>
    <p className="note">Только демонстрационный макет — реальные изменения не отправляются.</p>
    <label htmlFor="pet-editor-name">Кличка</label>
    <input id="pet-editor-name" name="name" maxLength={50} required
      value={draft.name} onChange={e=>change("name",e.target.value)} disabled={busy}/>
    <label htmlFor="pet-editor-type">Вид</label>
    <select id="pet-editor-type" name="type" value={draft.type}
      onChange={e=>change("type",e.target.value as PetEditDraft["type"])} disabled={busy}>
      <option value="DOG">Собака</option><option value="CAT">Кошка</option>
    </select>
    <label htmlFor="pet-editor-breed">Порода</label>
    <input id="pet-editor-breed" name="breed" maxLength={50} value={draft.breed}
      onChange={e=>change("breed",e.target.value)} disabled={busy}/>
    <label htmlFor="pet-editor-birth">Дата рождения</label>
    <input id="pet-editor-birth" name="birthDate" type="date" value={draft.birthDate}
      onChange={e=>change("birthDate",e.target.value)} disabled={busy}/>
    <div className="pet-edit-measurements">{numbers.map(([key,label])=><div key={key}>
      <label htmlFor={"pet-editor-"+key}>{label}</label>
      <input id={"pet-editor-"+key} name={key} type="text" inputMode="decimal"
        value={draft[key]} disabled={busy}
        onChange={e=>change(key,e.target.value)}/>
    </div>)}</div>
    <label htmlFor="pet-editor-notes">Заметки</label>
    <textarea id="pet-editor-notes" name="notes" maxLength={500} rows={3}
      value={draft.notes} onChange={e=>change("notes",e.target.value)} disabled={busy}/>
    <label className="pet-edit-visibility">
      <input type="checkbox" name="showInProfile"
        checked={draft.showInProfile} disabled={busy}
        onChange={e=>change("showInProfile",e.target.checked)}/>
      Показывать питомца в профиле
    </label>
    {error&&<p role="alert">{error}</p>}
    <div className="profile-edit-actions">
      <PrimaryButton type="submit" disabled={busy}>
        {busy?"Проверяем макет…":"Сохранить (макет)"}
      </PrimaryButton>
      <SecondaryButton variant="red" type="button"  disabled={busy}
        onClick={onExit}>Отмена</SecondaryButton>
    </div>
  </form>;
}
/** Requires current owner and explicit synthetic PUT transport.
 * The owner authEpoch fence survives A→B→A and keeps late private ACK inert.
 */
function BoundPetEdit({userId,pet,transport}:{
  userId:string;pet:PetDetails;transport:PetEditWire;
}){
  const auth=useQueryClient();
  const first=useRef(auth.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)??null);
  const [open,setOpen]=useState(false);
  const [attempted,setAttempted]=useState(false);
  const epoch=useRef(0);
  const version=useSyncExternalStore(callback=>
    auth.getQueryCache().subscribe(e=>{
      if(e.query.queryKey.length===CURRENT_USER_QUERY_KEY.length&&
        e.query.queryKey.every((part:unknown,i:number)=>part===CURRENT_USER_QUERY_KEY[i])){
        epoch.current++;callback();
      }
    }),()=>epoch.current,()=>epoch.current);
  const current=auth.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY);
  if(!first.current||first.current.id!==userId||
    current?.id!==userId||version!==0)return <p role="alert">
      Сессия изменилась. Откройте карточку питомца заново.
    </p>;
  const isCurrent=()=>epoch.current===0&&
    auth.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id===userId;
  return <div className="pet-edit-optin">
    {!open&&(!attempted?
      <button type="button" onClick={()=>setOpen(true)}>Редактировать питомца (макет)</button>:
      <p role="status">Попытка изменения уже завершена или проверяется.
        Для предотвращения повторной отправки вернитесь к списку.</p>)}
    {open&&<ActualPetForm ownerId={userId} pet={pet}
      transport={transport} isCurrent={isCurrent}
      onAttempt={()=>setAttempted(true)}
      onExit={()=>setOpen(false)}/>}
  </div>;
}
export function PetEditOptIn({enabled,userId,pet,transport}:{
  enabled:boolean;userId:string;pet:PetDetails;transport?:PetEditWire;
}){
  if(!enabled||transport?.fixtureKind!=="AG2_PET_EDIT_SYNTHETIC_ONLY")return null;
  return <BoundPetEdit key={userId+":"+pet.id}
    userId={userId} pet={pet} transport={transport}/>;
}
