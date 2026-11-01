import {useEffect,useRef,useState} from "react";
import {PrimaryButton, SecondaryButton} from "../../shared/ui";
import {GALLERY_LIMITS,GALLERY_MIME_TYPES} from "@gafus/types";
import {ApiError} from "../../shared/api/client";
import original from "../../brand/LegacyGallery.module.css";
import recovery from "./GalleryUploadQueue.module.css";
import {
  cancelGalleryUpload,confirmGalleryPhoto,galleryUploadStatus,reserveGalleryPhoto,
  retryGalleryUpload,
  type AlbumPhoto,
  uploadGalleryFormWithProgress,uploadReservationValid,
} from "./galleryApi";

type State="queued"|"sending"|"processing"|"ready"|"failed"|"unknown"|"cancelled";
export const GALLERY_WEB_MAX_PARALLEL_UPLOADS=5;
type Entry={id:string;file:File;state:State;uploadId?:string;
  recoveredParentId?:string;
  message?:string;progress?:number;processingStartedAt?:number;transferActive?:boolean;
  pendingRetry?:{parentId:string;requestId:string}};
const mime=(file:File)=>GALLERY_MIME_TYPES.includes(file.type as typeof GALLERY_MIME_TYPES[number]);
async function fileValid(file:File){
  if(!mime(file)||!file.size||file.size>GALLERY_LIMITS.photoBytes||
      !file.name||file.name.length>255)return false;
  const data=new Uint8Array(await file.slice(0,12).arrayBuffer());
  if(file.type==="image/jpeg")return data[0]===255&&data[1]===216&&data[2]===255;
  if(file.type==="image/png")return data[0]===137&&data[1]===80&&data[2]===78&&data[3]===71;
  if(file.type==="image/webp")return String.fromCharCode(...data.slice(0,4))==="RIFF"&&
    String.fromCharCode(...data.slice(8,12))==="WEBP";
  return false;
}
export function galleryProcessingIsSlow(startedAt:number|undefined,now:number):boolean{
  return typeof startedAt==="number"&&Number.isFinite(startedAt)&&
    now-startedAt>=60_000;
}
const labels:Record<State,string>={queued:"В очереди",sending:"Загружается",
  processing:"Ожидает обработки",ready:"Готово",failed:"Не отправлено",
  unknown:"Статус неизвестен",cancelled:"Отменено"};
/** Real multi-select workflow for the original Next UploadQueue.
 * Up to five independent reserve→S3→confirm→GET operations. Each file has
 * its own upload ID, request UUID and AbortController. Never replay uncertain writes.
 * An unknown ACK prevents new work; already running transfers settle independently.
 */
export function GalleryUploadQueue({albumId,usedSlots,onRefresh,failedPhotos=[],autoUpload=false}:{
  albumId:string;usedSlots:number;onRefresh:()=>void;
  failedPhotos?:AlbumPhoto[];
  /** Original Next starts the user-selected queue without a second submit. */
  autoUpload?:boolean;
}){
  const [entries,setEntries]=useState<Entry[]>([]);
  const entriesRef=useRef<Entry[]>([]);
  const [busy,setBusy]=useState(false);
  const busyRef=useRef(false);
  const [notice,setNotice]=useState("");
  const [clock,setClock]=useState(()=>Date.now());
  const live=useRef(true);
  const active=useRef(new Map<string,AbortController|null>());
  const preparingRecovery=useRef(false);
  const autoPaused=useRef(false);
  const picker=useRef<HTMLInputElement|null>(null);
  const refreshRef=useRef(onRefresh);
  refreshRef.current=onRefresh;
  const update=(id:string,patch:Partial<Entry>)=>{
    entriesRef.current=entriesRef.current.map(e=>e.id===id?{...e,...patch}:e);
    if(live.current)setEntries(entriesRef.current);
  };
  useEffect(()=>{
    live.current=true;
    const controllers=active.current;
    return ()=>{live.current=false;for(const ctrl of controllers.values())ctrl?.abort();};
  },[]);
  const locked=entries.some(e=>e.state==="unknown");
  const pendingIds=entries.filter(e=>e.state==="processing"&&e.uploadId)
    .map(e=>e.id).join(":");
  const uncertainIds=entries.filter(e=>e.state==="unknown"&&e.uploadId&&!e.pendingRetry)
    .map(e=>e.id).join(":");
  useEffect(()=>{
    if(!pendingIds)return;
    setClock(Date.now());
    const timer=window.setInterval(()=>setClock(Date.now()),10_000);
    return ()=>window.clearInterval(timer);
  },[pendingIds]);
  useEffect(()=>{
    if(!pendingIds)return;
    // Next polls processing photos while the tab is visible. This is a
    // read-only status check; it can never accidentally replay POST/confirm.
    let checking=false;
    const timer=window.setInterval(()=>{
      if(checking||!live.current||busyRef.current||document.visibilityState!=="visible")
        return;
      checking=true;
      void Promise.all(entriesRef.current.filter(e=>e.state==="processing"&&e.uploadId)
        .map(async entry=>{
          try{
            const fresh=await galleryUploadStatus(entry.uploadId!);
            if(!live.current||fresh.uploadId!==entry.uploadId||fresh.albumId!==albumId)return;
            if(fresh.status==="ready"){
              update(entry.id,{state:"ready"});refreshRef.current();
            }else if(["failed","cancelled","expired"].includes(fresh.status)){
              update(entry.id,{state:"failed",message:"Обработка не завершена. Проверьте альбом."});
              refreshRef.current();
            }
          }catch{/* Temporary GET failure does not replay any write. */}
        })).finally(()=>{checking=false;});
    },3000);
    return ()=>window.clearInterval(timer);
  },[albumId,pendingIds]);
  useEffect(()=>{
    if(!uncertainIds)return;
    // An expired reservation is terminal, but the previous Web queue kept it
    // "unknown" forever until the user pressed a manual button. GET is
    // idempotent, verifies the owner's upload and expires stale reservations
    // on the server; NEVER replay an uncertain S3 POST or /complete here.
    let checking=false;
    const timer=window.setInterval(()=>{
      if(checking||!live.current||busyRef.current||active.current.size>0||
        document.visibilityState!=="visible")return;
      checking=true;
      void Promise.all(entriesRef.current.filter(e=>e.state==="unknown"&&
        e.uploadId&&!e.pendingRetry).map(async entry=>{
        try{
          const fresh=await galleryUploadStatus(entry.uploadId!);
          if(!live.current||fresh.uploadId!==entry.uploadId||fresh.albumId!==albumId)return;
          if(fresh.status==="reserved")return; // Must await expiration/owner action.
          if(fresh.status==="cancelled")update(entry.id,{state:"cancelled",message:undefined});
          else if(fresh.status==="expired"||fresh.status==="failed")
            update(entry.id,{state:"failed",message:
              "Срок загрузки истёк или файл не принят. Можно выбрать файл и повторить."});
          else if(["uploaded","processing","ready"].includes(fresh.status))
            update(entry.id,{state:fresh.status==="ready"?"ready":"processing",
              processingStartedAt:Date.now(),message:undefined});
          else return;
          refreshRef.current();
        }catch{/* An unavailable owner GET must preserve the uncertain state. */}
      })).finally(()=>{checking=false;});
    },5000);
    return ()=>window.clearInterval(timer);
  },[albumId,uncertainIds]);
  const pick=(files:FileList|null)=>{
    if(!files||busyRef.current||entriesRef.current.some(e=>e.state==="unknown"))return;
    const available=Math.max(0,200-usedSlots-entriesRef.current.filter(e=>
      e.state==="queued"||e.state==="sending").length);
    const added=Array.from(files).slice(0,available).map(file=>({
      id:crypto.randomUUID(),file,state:"queued" as const,
    }));
    entriesRef.current=[...entriesRef.current,...added];setEntries(entriesRef.current);
    if(files.length>available)setNotice("Для части фотографий превышен лимит альбома (200). ");
    else setNotice("");
    if(autoUpload&&added.length>0){
      autoPaused.current=false;
      queueMicrotask(()=>{if(live.current)sendQueued();});
    }
  };
  // Reserve each slot before its first await: rapid selections cannot exceed five.
  function sendQueued(){
    if(!live.current||busyRef.current||autoPaused.current||
      entriesRef.current.some(entry=>entry.state==="unknown"))return;
    while(active.current.size<GALLERY_WEB_MAX_PARALLEL_UPLOADS){
      const next=entriesRef.current.find(e=>e.state==="queued"&&!active.current.has(e.id));
      if(!next)return;
      active.current.set(next.id,null);
      update(next.id,{state:"sending",progress:0});
      setBusy(true);
      void sendOne(next).finally(()=>{
        active.current.delete(next.id);
        if(!live.current)return;
        setBusy(active.current.size>0||busyRef.current);
        if(!autoPaused.current)sendQueued();
      });
    }
  }
  async function sendOne(entry:Entry){
    let reservationId:string|undefined;
    try{
      if(!await fileValid(entry.file)){
        update(entry.id,{state:"failed",message:"Нужен настоящий JPG, PNG или WebP до 10 МиБ."});
        return;
      }
      if(!live.current)return;
      // Stable per-file UUID: server can safely recognize an earlier reserve.
      const reserved=await reserveGalleryPhoto(albumId,entry.file,null,entry.id);
      if(!live.current)return;
      if(!uploadReservationValid(reserved,albumId))throw Error("GALLERY_RESERVE_UNKNOWN");
      reservationId=reserved.uploadId;
      update(entry.id,{uploadId:reservationId});
      const controller=new AbortController();
      active.current.set(entry.id,controller);
      update(entry.id,{transferActive:true});
      await uploadGalleryFormWithProgress(reserved,entry.file,controller.signal,
        progress=>{if(live.current)update(entry.id,{progress});});
      if(!live.current)return;
      const completed=await confirmGalleryPhoto(reservationId);
      if(completed.uploadId!==reservationId||completed.albumId!==albumId||
        !["uploaded","processing","ready"].includes(completed.status))
        throw Error("GALLERY_CONFIRM_UNKNOWN");
      const fresh=await galleryUploadStatus(reservationId);
      if(fresh.uploadId!==reservationId||fresh.albumId!==albumId||
        !["uploaded","processing","ready"].includes(fresh.status))
        throw Error("GALLERY_READBACK_UNKNOWN");
      update(entry.id,{state:fresh.status==="ready"?"ready":"processing",
        processingStartedAt:fresh.status==="ready"?undefined:Date.now()});
      onRefresh();
    }catch(error){
      if(!live.current)return;
      const rejected=!reservationId&&error instanceof ApiError&&
        [400,401,403,404,409,413,415,429].includes(error.status);
      update(entry.id,{state:rejected?"failed":"unknown",uploadId:reservationId,
        message:rejected?"Сервер отклонил файл. Исправьте ошибку перед новой отправкой.":
          "Не повторяйте запись: подтверждение сервера или хранилища потеряно."});
      // Freeze unstarted tasks. Active S3 transfers settle independently to
      // avoid turning valid uploads into additional unknown outcomes.
      autoPaused.current=true;
    }finally{
      if(live.current)update(entry.id,{transferActive:false});
    }
  }
  async function reconcile(entry:Entry){
    if(!entry.uploadId||busyRef.current)return;
    if(entry.pendingRetry){
      setNotice("Проверка родительской записи не докажет состояние повтора. "+
        "Восстановите запрос с тем же ключом без создания другого.");
      return;
    }
    busyRef.current=true;setBusy(true);
    try{
      const fresh=await galleryUploadStatus(entry.uploadId);
      if(!live.current)return;
      if(fresh.uploadId!==entry.uploadId||fresh.albumId!==albumId)
        throw Error("GALLERY_UPLOAD_SCOPE_UNKNOWN");
      if(fresh.status==="reserved"){
        // An S3 write might already be committed. Never send it again.
        setNotice("Сервер всё ещё ожидает файл. Можно отменить резервирование, "+
          "но нельзя автоматически повторить загрузку.");
        return;
      }
      if(fresh.status==="cancelled"){
        update(entry.id,{state:"cancelled",message:undefined});
      }else if(["failed","expired"].includes(fresh.status)){
        update(entry.id,{state:"failed",message:"Обработка не удалась; проверьте альбом."});
      }else if(["uploaded","processing","ready"].includes(fresh.status)){
        update(entry.id,{state:fresh.status==="ready"?"ready":"processing",
          processingStartedAt:fresh.status==="ready"?undefined:entry.processingStartedAt??Date.now(),
          message:undefined});
      }else throw Error("GALLERY_UPLOAD_NOT_CONFIRMED");
      if(live.current)onRefresh();
    }catch{
      if(live.current)setNotice("Загрузка не подтверждена. Очередь остаётся заблокированной.");
    }finally{busyRef.current=false;if(live.current)setBusy(false);}
  }
  async function recoverReservation(entry:Entry){
    if(entry.state!=="unknown"||entry.uploadId||busyRef.current||!live.current)return;
    busyRef.current=true;setBusy(true);setNotice("");
    try{
      // The initial reservation may already exist. The original clientRequestId
      // is an idempotency key, and NO storage POST occurred without its ACK.
      const recovered=await reserveGalleryPhoto(albumId,entry.file,null,entry.id);
      if(!live.current)return;
      if(!uploadReservationValid(recovered,albumId))
        throw Error("GALLERY_RESERVATION_RECOVERY_UNCONFIRMED");
      update(entry.id,{state:"queued",uploadId:recovered.uploadId,message:undefined});
      setNotice("Резервирование подтверждено. Отправьте файл отдельным действием.");
    }catch{
      if(live.current)setNotice("Резервирование не подтверждено. Очередь остаётся заблокированной.");
    }finally{busyRef.current=false;if(live.current)setBusy(false);}
  }
  /** Next shows server-persisted processing failures after a full reload.
   * Only reuse the failed upload's actor-scoped ID, never reserve a new one.
   * The existing retry() verifies the owner GET before a single idempotent POST.
   */
  async function recoverFailedPhoto(photo:AlbumPhoto,files:FileList|null){
    if(!files?.length||!photo.uploadId||photo.albumId!==albumId||
      photo.status!=="failed"||busyRef.current||preparingRecovery.current||
      entriesRef.current.some(e=>e.state==="unknown"||
        e.uploadId===photo.uploadId||e.recoveredParentId===photo.uploadId))return;
    const file=files[0];
    if(!file)return;
    preparingRecovery.current=true;
    try{
      if(!await fileValid(file)){
        if(live.current)setNotice("Нужен настоящий JPG, PNG или WebP до 10 МиБ.");
        return;
      }
      if(!live.current||busyRef.current)return;
      const entry:Entry={id:crypto.randomUUID(),file,state:"failed",
        uploadId:photo.uploadId,recoveredParentId:photo.uploadId};
      entriesRef.current=[...entriesRef.current,entry];
      setEntries(entriesRef.current);
      void retry(entry);
    }finally{preparingRecovery.current=false;}
  }
  async function retry(entry:Entry){
    if(!["failed","unknown"].includes(entry.state)||!entry.uploadId||busyRef.current||
      active.current.size>0||
      entry.state==="unknown"&&!entry.pendingRetry||
      !live.current||!await fileValid(entry.file))return;
    busyRef.current=true;setBusy(true);setNotice("");
    let replacementId:string|undefined;
    try{
      let operation=entry.pendingRetry;
      if(!operation){
        const old=await galleryUploadStatus(entry.uploadId);
        if(!live.current)return;
        if(old.uploadId!==entry.uploadId||old.albumId!==albumId||
          !["failed","expired"].includes(old.status))
          throw Error("GALLERY_RETRY_NOT_TERMINAL");
        operation={parentId:entry.uploadId,requestId:crypto.randomUUID()};
        update(entry.id,{pendingRetry:operation});
      }
      // Replaying the exact retry operation is safe by Core's clientRequestId,
      // unlike creating a second child. This is only a deliberate user action.
      const replacement=await retryGalleryUpload(operation.parentId,operation.requestId);
      if(!live.current)return;
      if(!uploadReservationValid(replacement,albumId))
        throw Error("GALLERY_RETRY_RESERVATION_UNKNOWN");
      replacementId=replacement.uploadId;
      update(entry.id,{state:"sending",uploadId:replacementId,progress:0,
        message:undefined,pendingRetry:undefined});
      const controller=new AbortController();active.current.set(entry.id,controller);
      update(entry.id,{transferActive:true});
      await uploadGalleryFormWithProgress(replacement,entry.file,controller.signal,
        value=>{if(live.current)update(entry.id,{progress:value});});
      if(!live.current)return;
      const confirmed=await confirmGalleryPhoto(replacementId);
      if(confirmed.albumId!==albumId||confirmed.uploadId!==replacementId||
        !["uploaded","processing","ready"].includes(confirmed.status))
        throw Error("GALLERY_RETRY_CONFIRM_UNCERTAIN");
      const fresh=await galleryUploadStatus(replacementId);
      if(fresh.albumId!==albumId||fresh.uploadId!==replacementId||
        !["uploaded","processing","ready"].includes(fresh.status))
        throw Error("GALLERY_RETRY_READBACK_UNCERTAIN");
      update(entry.id,{state:fresh.status==="ready"?"ready":"processing",
        processingStartedAt:fresh.status==="ready"?undefined:entry.processingStartedAt??Date.now(),
        message:undefined});
      if(live.current)onRefresh();
    }catch{
      update(entry.id,{state:"unknown",uploadId:replacementId??entry.uploadId,
        message:"Статус повтора неизвестен. Нельзя автоматически отправлять файл снова."});
    }finally{
      active.current.delete(entry.id);busyRef.current=false;
      if(live.current){update(entry.id,{transferActive:false});setBusy(active.current.size>0);}

    }
  }
  async function cancel(entry:Entry){
    // Before a reserve, removing a queued file has no server-side effects.
    if(entry.state==="queued"){
      entriesRef.current=entriesRef.current.filter(item=>item.id!==entry.id);
      setEntries(entriesRef.current);
      return;
    }
    if(!entry.uploadId||busyRef.current||active.current.has(entry.id)||entry.pendingRetry||
      entry.state==="ready"||entry.state==="cancelled")return;
    busyRef.current=true;setBusy(true);setNotice("");
    try{
      // Only a real server-side upload ID can be cancelled. First verify
      // its album owner scope, then request exactly one DELETE tombstone.
      const current=await galleryUploadStatus(entry.uploadId);
      if(!live.current)return;
      if(current.albumId!==albumId||current.uploadId!==entry.uploadId)
        throw Error("GALLERY_CANCEL_SCOPE_MISMATCH");
      if(current.status==="cancelled"){
        update(entry.id,{state:"cancelled",message:undefined});onRefresh();return;
      }
      if(current.status==="ready"){
        update(entry.id,{state:"ready",message:undefined});onRefresh();return;
      }
      const ack=await cancelGalleryUpload(entry.uploadId);
      if(ack.albumId!==albumId||ack.uploadId!==entry.uploadId||
        ack.status!=="cancelled")throw Error("GALLERY_CANCEL_ACK_UNKNOWN");
      const verified=await galleryUploadStatus(entry.uploadId);
      if(verified.albumId!==albumId||verified.uploadId!==entry.uploadId||
        verified.status!=="cancelled")throw Error("GALLERY_CANCEL_UNCONFIRMED");
      update(entry.id,{state:"cancelled",message:undefined});
      if(live.current)onRefresh();
    }catch{
      // The DELETE might have committed. Require owner GET / manual review;
      // replaying it from a button would be unsafe after a lost ACK.
      update(entry.id,{state:"unknown",message:
        "Отмена не подтверждена. Проверьте состояние без повторного удаления."});
    }finally{busyRef.current=false;if(live.current)setBusy(false);}
  }
  return <form className={autoUpload?original.albumUpload:"gallery-upload"}
    onSubmit={event=>{event.preventDefault();autoPaused.current=false;sendQueued();}}>
    {autoUpload?<>
      <div className={original.albumUploadBar}>
        <PrimaryButton className={original.uploadPrimary}
          disabled={locked||usedSlots>=200} onClick={()=>picker.current?.click()}>
          Добавить фотографии
        </PrimaryButton>
        <input ref={picker} type="file" hidden accept="image/jpeg,image/png,image/webp"
          multiple disabled={locked||usedSlots>=200}
          onChange={e=>{pick(e.target.files);e.currentTarget.value="";}}/>
        <span className={original.uploadCount} role="status">{usedSlots} / 200 фотографий</span>
      </div>
      <p className={original.uploadHint}>JPG, PNG или WebP · до 10 МиБ за файл.
        Можно выбрать несколько фотографий, до 5 загружаются одновременно.
        {usedSlots>=200?" Лимит заполнен — удалите ненужные фотографии.":""}
      </p>
    </>:<>
      <h4>Добавить фотографии</h4>
      <label>Выберите несколько JPG, PNG или WebP (до 10 МиБ каждый)
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple
          disabled={busy||locked||usedSlots>=200}
          onChange={e=>{pick(e.target.files);e.currentTarget.value="";}}/>
      </label>
      <p role="status">{usedSlots} / 200 фотографий</p>
    </>}
    <ul className={autoUpload?original.queue:undefined}
      aria-label="Очередь фотографий">
      {entries.map(entry=><li key={entry.id}>
        <span>{entry.file.name} — {labels[entry.state]}</span>
        {entry.state==="sending"&&
          <progress max={100} value={entry.progress??0}
            aria-label={`Загрузка ${entry.file.name}: ${entry.progress??0}%`}/>}
        {entry.state==="processing"&&<>
          <progress max={100} aria-label={`${entry.file.name}: обрабатывается`}/>
          {galleryProcessingIsSlow(entry.processingStartedAt,clock)&&
            <p className={original.uploadDelayHint} role="status">
              Обработка занимает больше обычного. Фотография появится после завершения.
            </p>}
        </>}
        {entry.message&&<p role="alert">{entry.message}</p>}
        {entry.state==="queued"&&!busy&&<SecondaryButton variant="red" className="gafus-inline-red-action" type="button" onClick={()=>{
          entriesRef.current=entriesRef.current.filter(e=>e.id!==entry.id);
          setEntries(entriesRef.current);
        }}>Убрать из очереди</SecondaryButton>}
        {entry.state==="unknown"&&entry.uploadId&&
          <PrimaryButton type="button" disabled={busy} onClick={()=>void reconcile(entry)}>
            Проверить состояние загрузки
          </PrimaryButton>}
        {entry.pendingRetry&&!busy&&
          <PrimaryButton type="button" onClick={()=>void retry(entry)}>
            Восстановить запрос повтора
          </PrimaryButton>}
        {entry.state==="failed"&&entry.uploadId&&!entry.pendingRetry&&!busy&&
          <PrimaryButton type="button" onClick={()=>void retry(entry)}>
            Повторить после ошибки
          </PrimaryButton>}
        {entry.state==="sending"&&entry.transferActive&&
          <SecondaryButton variant="red" type="button" onClick={()=>active.current.get(entry.id)?.abort()}>
            Прервать передачу
          </SecondaryButton>}
        {entry.uploadId&&!entry.pendingRetry&&!busy&&
          entry.state!=="ready"&&entry.state!=="cancelled"&&
          <SecondaryButton variant="red" type="button" disabled={busy} onClick={()=>void cancel(entry)}>
            Отменить загрузку
          </SecondaryButton>}
        {entry.state==="unknown"&&!entry.uploadId&&<>
          <p role="alert">Идентификатор загрузки не получен. Не создавайте новый файл.</p>
          <button type="button" disabled={busy}
            onClick={()=>void recoverReservation(entry)}>Восстановить резервирование</button>
        </>}
      </li>)}
    </ul>
    {(!autoUpload||autoPaused.current&&entries.some(e=>e.state==="queued"))&&
      <PrimaryButton type="submit" disabled={locked||busyRef.current||
        !entries.some(e=>e.state==="queued")}>
        {busy?"Загружаем…":autoUpload?"Продолжить очередь":"Загрузить фотографии"}
      </PrimaryButton>}
    {failedPhotos.filter(photo=>photo.status==="failed"&&photo.albumId===albumId&&
      !!photo.uploadId&&!entries.some(entry=>entry.uploadId===photo.uploadId||
        entry.recoveredParentId===photo.uploadId)).map(photo=><div
        key={photo.id} className="gallery-failed-photo-retry">
        <p role="alert">{photo.errorMessage||"Обработка фотографии не удалась."}</p>
        <label className={recovery.recoveryPicker}>
          <span>Выбрать файл и повторить</span>
          <input type="file" accept="image/jpeg,image/png,image/webp"
            data-gallery-retry-upload-id={photo.uploadId??undefined}
            disabled={busy||locked}
            onChange={event=>{
              void recoverFailedPhoto(photo,event.currentTarget.files);
              event.currentTarget.value="";
            }}/>
        </label>
      </div>)}
    {locked&&<p role="alert">Статус отправки неизвестен. Остальная очередь заблокирована —
      повторная отправка может создать дубликат.</p>}
    {notice&&<p role="status">{notice}</p>}
  </form>;
}
