import { Loading } from "../../shared/ui";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {syncVerifiedPetCount} from "./petListCountSync";
import {ApiError} from "../../shared/api/client";
import {
  createPetPrevention,deletePetPrevention,listPetPrevention,updatePetPrevention,
  type PreventionDraft,type PreventionEntry,type PreventionType,
} from "./petPreventionApi";
import styles from "./PetPrevention.module.css";
import { PetActionDialog } from "./PetActionDialog";
import { PrimaryButton, SecondaryButton, CaramelButton } from "../../shared/ui";

const names:Record<PreventionType,string>={
  VACCINATION:"Прививка",DEWORMING:"Глистогонка",TICKS_FLEAS:"Клещи и блохи",
};
const days:Record<PreventionType,number>={VACCINATION:365,DEWORMING:90,TICKS_FLEAS:30};
const today=()=>new Date().toISOString().slice(0,10);
const date=(value:string)=>value.slice(0,10);
const initial=(entry?:PreventionEntry):PreventionDraft=>({
  type:entry?.type??"VACCINATION",performedAt:entry?date(entry.performedAt):today(),
  productName:entry?.productName??"",notes:entry?.notes??"",
  reminderEnabled:entry?.reminderEnabled??true,
  reminderKind:entry?.reminderKind??"AFTER_DAYS",
  reminderDaysAfter:entry?.reminderDaysAfter??days[entry?.type??"VACCINATION"],
  reminderOnDate:entry?.reminderOnDate?date(entry.reminderOnDate):today(),
  reminderTimes:entry?.reminderTimes??["09:00"],
});
const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  !Number.isNaN(Date.parse(value))&&new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;
const validTime=(value:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const message=(error:unknown)=>error instanceof ApiError&&error.status===401?
  "Сессия завершена. Войдите снова.":error instanceof ApiError&&error.status===403?
  "Нет доступа к журналу процедур.":error instanceof ApiError&&error.status===404?
  "Питомец или запись не найдены.":"Не удалось подтвердить изменение. Проверьте журнал.";

/** Owner-only Next prevention journal. Unknown mutations never auto replay. */
export function PetPrevention({ownerId,petId,isCurrent,inCard=false}:{
  ownerId:string;petId:string;isCurrent:()=>boolean;inCard?:boolean;
}){
  const cache=useQueryClient();
  const [open,setOpen]=useState(inCard);
  const [editing,setEditing]=useState<string|null>(null);
  const [draft,setDraft]=useState<PreventionDraft>(()=>initial());
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [unknown,setUnknown]=useState(false);
  const [deleteId,setDeleteId]=useState<string|null>(null);
  const [badDate,setBadDate]=useState(false);
  const attemptedDeletes=useRef(new Set<string>());
  const flight=useRef(false);
  const live=useRef(true);
  useEffect(()=>{live.current=true;return ()=>{live.current=false;};},[]);
  const current=()=>live.current&&isCurrent();
  const entries=useQuery({queryKey:["pets","prevention",ownerId,petId],
    queryFn:async()=>{
      if(!current())throw Error("SESSION_CHANGED");
      const items=await listPetPrevention(petId);
      if(!current())throw Error("SESSION_CHANGED");
      return items;
    },enabled:open,retry:false,staleTime:0,gcTime:0});
  function start(entry?:PreventionEntry){
    if(flight.current||unknown)return;
    setDraft(initial(entry));setBadDate(false);
    setEditing(entry?.id??"new");setNotice("");setDeleteId(null);
  }
  const refresh=async()=>{
    const result=await entries.refetch();
    if(!current()||!result.isSuccess||!result.data)throw Error("READBACK_FAILED");
    return result.data;
  };
  const write=async(event:FormEvent)=>{
    event.preventDefault();
    if(flight.current||unknown||!current()||!editing)return;
    const input={...draft,
      performedAt:validDate(draft.performedAt)?draft.performedAt:"",
      productName:draft.productName?.trim()||undefined,
      notes:draft.notes?.trim()||undefined,
      reminderDaysAfter:draft.reminderEnabled&&draft.reminderKind==="AFTER_DAYS"?
        draft.reminderDaysAfter:null,
      reminderOnDate:draft.reminderEnabled&&draft.reminderKind==="ON_DATE"?
        draft.reminderOnDate:null,
      reminderTimes:draft.reminderTimes.map(t=>t.trim()),
    };
    if(!input.performedAt||!validDate(input.performedAt)||
      input.productName&&input.productName.length>200||
      input.notes&&input.notes.length>2000||
      input.reminderTimes.length<1||input.reminderTimes.length>5||
      input.reminderTimes.some(t=>!validTime(t))||
      input.reminderEnabled&&input.reminderKind==="AFTER_DAYS"&&
      (!Number.isInteger(input.reminderDaysAfter)||
        Number(input.reminderDaysAfter)<1||Number(input.reminderDaysAfter)>1095)||
      input.reminderEnabled&&input.reminderKind==="ON_DATE"&&
        !validDate(input.reminderOnDate??"")){
      setBadDate(true);setNotice("Проверьте дату, препарат, заметки и времена напоминаний.");
      return;
    }
    flight.current=true;setBusy(true);setNotice("");setBadDate(false);
    try{
      const accepted=editing==="new"?await createPetPrevention(petId,input):
        await updatePetPrevention(petId,editing,input);
      if(!current())return;
      if(editing!=="new"&&accepted.id!==editing)
        throw Error("PREVENTION_ACK_MISMATCH");
      const fresh=await refresh();
      if(!fresh.some(e=>e.id===accepted.id&&e.type===input.type&&
        date(e.performedAt)===input.performedAt))throw Error("PREVENTION_UNCONFIRMED");
      if(!current())return;
      syncVerifiedPetCount(cache,ownerId,petId,"preventionCount",fresh.length);
      setEditing(null);setNotice("Запись о процедуре сохранена.");
    }catch(error){
      if(!current())return;
      if(!(error instanceof ApiError&&[400,401,403,404,409,429].includes(error.status)))
        setUnknown(true);
      setNotice(message(error));
      void entries.refetch();
    }finally{flight.current=false;if(current())setBusy(false);}
  };
  async function remove(id:string){
    if(!current()||unknown||flight.current||attemptedDeletes.current.has(id)||
      !entries.data?.some(entry=>entry.id===id))return;
    attemptedDeletes.current.add(id);flight.current=true;
    setBusy(true);setNotice("");setDeleteId(null);
    try{
      await deletePetPrevention(petId,id);
      if(!current())return;
      const fresh=await refresh();
      if(fresh.some(e=>e.id===id))throw Error("DELETE_NOT_VERIFIED");
      syncVerifiedPetCount(cache,ownerId,petId,"preventionCount",fresh.length);
      setNotice("Запись удалена.");
    }catch(error){
      if(!current())return;
      setNotice(message(error)+" Повторное удаление заблокировано.");
      if(!(error instanceof ApiError&&[400,401,403,404,409,429].includes(error.status)))
        setUnknown(true);
      void entries.refetch();
    }finally{flight.current=false;if(current())setBusy(false);}
  }
  const form = editing ? (
    <form className={`${styles.form} ${inCard ? styles.nextModalForm : ""}`}
      onSubmit={e=>void write(e)}>
        <div className={inCard ? styles.nextModalFields : styles.plainFields}>
        {!inCard&&<h3>{editing==="new"?"Добавить запись":"Редактировать запись"}</h3>}
        <p className={inCard ? styles.nextDisclaimer : undefined}>
          Это не замена консультации ветеринара: дозировки и сроки назначает только врач.
        </p>
        <label>{inCard ? "Тип" : "Тип процедуры"}
          <select autoFocus={inCard} value={draft.type} disabled={busy} onChange={e=>{
            const type=e.target.value as PreventionType;
            setDraft(d=>({...d,type,reminderDaysAfter:days[type]}));
          }}>{Object.entries(names).map(([key,name])=><option key={key} value={key}>
            {name}</option>)}</select>
        </label>
        <label>{inCard ? "Дата" : "Дата процедуры"}
          <input required type="date" value={draft.performedAt} disabled={busy}
            onChange={e=>setDraft(d=>({...d,performedAt:e.target.value}))}/></label>
        <label>Препарат <input maxLength={200}
          placeholder={inCard ? "Название препарата (опционально)" : undefined}
          value={draft.productName??""} disabled={busy}
          onChange={e=>setDraft(d=>({...d,productName:e.target.value}))}/></label>
        <label>Заметки <textarea maxLength={2000} rows={2}
          placeholder={inCard ? "Дополнительные заметки" : undefined}
          value={draft.notes??""} disabled={busy}
          onChange={e=>setDraft(d=>({...d,notes:e.target.value}))}/></label>
        <label className={`${styles.inline} ${inCard ? styles.nextSwitch : ""}`}>
          <input type="checkbox" role={inCard ? "switch" : undefined}
          checked={draft.reminderEnabled}
          disabled={busy} onChange={e=>setDraft(d=>({...d,reminderEnabled:e.target.checked}))}/>
          Push-напоминание</label>
        {draft.reminderEnabled&&<>
          <label>Когда напомнить
            <select value={draft.reminderKind} disabled={busy}
              onChange={e=>setDraft(d=>({...d,reminderKind:e.target.value as
                PreventionDraft["reminderKind"]}))}>
              <option value="AFTER_DAYS">Через N дней после даты сделанного</option>
              <option value="ON_DATE">В конкретную дату</option>
            </select></label>
          {draft.reminderKind==="AFTER_DAYS"?<label>Дней после процедуры
            <input type="number" min={1} max={1095} required
              value={draft.reminderDaysAfter??""} disabled={busy}
              onChange={e=>setDraft(d=>({...d,reminderDaysAfter:Number(e.target.value)}))}/>
          </label>:<label>Дата напоминания
            <input type="date" required value={draft.reminderOnDate??""}
              disabled={busy} onChange={e=>setDraft(d=>({...d,reminderOnDate:e.target.value}))}/>
          </label>}
          <fieldset className={inCard ? styles.nextTimes : undefined}>
            <legend>Во сколько напомнить</legend>
            {inCard && <p className={styles.nextCaption}>
              Можно несколько раз в день (например, утром и вечером). Время — по Москве,
              как в расписании отправки.
            </p>}
            {draft.reminderTimes.map((time,i)=><div key={i}
              className={inCard ? styles.nextTimeRow : undefined}>
              <label>Время {i+1}
                <input type="time" required value={time} disabled={busy}
                  onChange={e=>setDraft(d=>({...d,reminderTimes:d.reminderTimes.map(
                    (v,index)=>index===i?e.target.value:v)}))}/>
              </label>
              {draft.reminderTimes.length>1&&<SecondaryButton variant="red" type="button"
                disabled={busy}
                className={inCard ? [styles.nextRemoveTime, "gafus-inline-red-icon"].join(" ") : "gafus-inline-red-action"}
                aria-label={`Убрать время ${i+1}`} title={`Убрать время ${i+1}`}
                onClick={()=>setDraft(d=>({...d,reminderTimes:d.reminderTimes.filter(
                  (_,index)=>index!==i)}))}>
                {inCard ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false">
                  <path d="M6 6 18 18M18 6 6 18" />
                </svg> : "Убрать время"}
              </SecondaryButton>}
            </div>)}
            {draft.reminderTimes.length<5&&(inCard ?
              <button type="button" className={styles.nextAddTime} disabled={busy}
                onClick={()=>setDraft(d=>({...d,reminderTimes:[...d.reminderTimes,"18:00"]}))}>
                <span aria-hidden="true">+</span> Ещё одно напоминание
              </button> :
              <PrimaryButton type="button" disabled={busy}
                onClick={()=>setDraft(d=>({...d,reminderTimes:[...d.reminderTimes,"09:00"]}))}>
                Добавить время
              </PrimaryButton>)}
          </fieldset>
        </>}
        </div>
        <div className={`${styles.actions} ${inCard ? styles.nextModalActions : ""}`}>
          {inCard && <SecondaryButton variant="red" type="button"
            disabled={busy} onClick={()=>setEditing(null)}>Отмена</SecondaryButton>}
          <PrimaryButton type="submit" disabled={busy||unknown}
            className={inCard ? styles.nextSave : undefined}>
            {inCard ? "Сохранить" : "Сохранить процедуру"}
          </PrimaryButton>
          {!inCard && <SecondaryButton variant="red" type="button" disabled={busy}
            onClick={()=>setEditing(null)}>Отмена</SecondaryButton>}
        </div>
      </form>
  ) : null;
  return <section className={styles.section} aria-label="Записи о процедурах">
    {!inCard && <button type="button" className="button-secondary" onClick={()=>{
      setOpen(value=>!value);setEditing(null);setNotice("");
    }}>{open?"Скрыть процедуры":"Записи о процедурах"}</button>}
    {open&&<div className={styles.content}>
      <p>Прививки, глистогонка, обработки от клещей и блох.</p>
      {entries.isPending&&<Loading message="Загружаем записи…" />}
      {entries.isError&&<div role="alert">{message(entries.error)}
        <PrimaryButton type="button" onClick={()=>void entries.refetch()}>Повторить</PrimaryButton>
      </div>}
      {notice&&<p role={unknown||badDate?"alert":"status"}>{notice}</p>}
      {unknown&&<p role="alert">Результат предыдущей операции неизвестен.
        Повторные изменения заблокированы во избежание дублей.
        <PrimaryButton type="button" onClick={()=>void entries.refetch()}>
          Перечитать журнал без повторной записи
        </PrimaryButton>
      </p>}
      {entries.isSuccess&&!entries.isFetching&&<>
        {inCard&&!editing&&<PrimaryButton type="button" disabled={busy||unknown}
          onClick={()=>start()} className={styles.addButton}>
          <span aria-hidden="true">+</span> Добавить запись
        </PrimaryButton>}
        {entries.data.length===0&&<p>Записей пока нет.</p>}
        <ul className={styles.list}>{entries.data.map(entry=><li key={entry.id}>
          <strong>{names[entry.type]}</strong> · {date(entry.performedAt)}
          {entry.productName&&<p>{entry.productName}</p>}
          {entry.notes&&<p>{entry.notes}</p>}
          {entry.reminderEnabled&&entry.remindAt&&<p>Напоминание: {date(entry.remindAt)}
            {entry.reminderTimes.length>0?" в "+entry.reminderTimes.join(", "):""}</p>}
          <div className={styles.actions}>
            <CaramelButton disabled={busy||unknown} onClick={()=>start(entry)}>
              Редактировать</CaramelButton>
            <SecondaryButton variant="red" disabled={busy||unknown||attemptedDeletes.current.has(entry.id)}
              onClick={()=>setDeleteId(entry.id)}>Удалить</SecondaryButton>
          </div>
          {deleteId===entry.id&&<div role="group" aria-label="Подтверждение удаления процедуры">
            <p>Удалить эту запись?</p>
            <SecondaryButton variant="red" disabled={busy} onClick={()=>void remove(entry.id)}>
              Да, удалить запись</SecondaryButton>
            <SecondaryButton variant="red" type="button" disabled={busy} onClick={()=>setDeleteId(null)}>
              Отмена</SecondaryButton>
          </div>}
        </li>)}</ul>
        {!inCard&&!editing&&<PrimaryButton type="button" disabled={busy||unknown}
          onClick={()=>start()}>Добавить запись</PrimaryButton>}
      </>}
      {editing&&(inCard ? <PetActionDialog
        title={editing==="new"?"Добавить запись":"Редактировать запись"}
        busy={busy} onClose={()=>setEditing(null)} variant="prevention">
        {form}</PetActionDialog> : form)}
    </div>}
  </section>;
}
