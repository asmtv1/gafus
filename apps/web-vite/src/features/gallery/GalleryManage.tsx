import {useEffect,useRef,useState,type FormEvent} from "react";
import {useInfiniteQuery} from "@tanstack/react-query";
import {ApiError} from "../../shared/api/client";
import {GALLERY_LIMITS} from "@gafus/types";
import {galleryAlbumPath,RouteLink} from "../../shared/router/location";
import original from "../../brand/LegacyGallery.module.css";
import {
  albumDraftMatches,albumWriteAck,deleteAckMatches,galleryAlbumCommands,
  getMyAlbum,getMyPhoto,listMyAlbums,confirmGalleryPhoto,galleryUploadStatus,
  reserveGalleryPhoto,uploadGalleryForm,uploadReservationValid,
  galleryCoverAckMatches,verifiedGalleryCover,
  type AlbumDraft,type AlbumPhoto,type AlbumSummary,type GalleryAlbumCommands,
  type GalleryPage,
} from "./galleryApi";
import {PrimaryButton,SecondaryButton} from "../../shared/ui";

type Commands=GalleryAlbumCommands;
const message=(error:unknown)=>error instanceof ApiError&&
  [400,401,403,404,409,413,415,429].includes(error.status)?
  "Операция отклонена сервером. Проверьте данные и доступ.":
  "Результат неизвестен. Проверьте данные перед новой попыткой.";
/** One write in flight per control; no automatic POST/DELETE replay.
 * Parent principal-bound gallery scope unmounts this action on session change.
 */
function useOwnerAction(){
  const live=useRef(true);
  const pending=useRef(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  // The dev app runs React.StrictMode: its setup→cleanup→setup rehearsal
  // must not permanently disable every owner write before the user clicks.
  // A real unmount still revokes callbacks from outstanding requests.
  useEffect(()=>{live.current=true;return ()=>{live.current=false;};},[]);
  const run=async(task:()=>Promise<string|void>)=>{
    if(pending.current||!live.current)return false;
    pending.current=true;setBusy(true);setNotice("");
    try{
      const result=await task();
      if(!live.current)return false;
      setNotice(result??"Сервер подтвердил действие.");
      return true;
    }catch(e){
      if(live.current)setNotice(message(e));
      return false;
    }finally{
      pending.current=false;
      if(live.current)setBusy(false);
    }
  };
  return {run,busy,notice,setNotice,live:()=>live.current};
}
export function AlbumEditor({actorId,username,existing,commands=galleryAlbumCommands,
  onSaved,onCancel,getAlbum=getMyAlbum,listAlbums=listMyAlbums,sourceCreate=false,sourceEdit=false}:{
  actorId:string;username:string;existing?:AlbumSummary;commands?:Commands;
  sourceCreate?:boolean;sourceEdit?:boolean;
  onSaved:(id:string)=>void;onCancel:()=>void;
  getAlbum?:(albumId:string,actorId:string,username:string)=>Promise<AlbumSummary>;
  listAlbums?:(ownerId:string,ownerUsername:string,cursor:string|null)=>
    Promise<GalleryPage<AlbumSummary>>;
}){
  const [name,setName]=useState(existing?.name??"");
  const [description,setDescription]=useState(existing?.description??"");
  const [isVisible,setIsVisible]=useState(existing?.isVisible??true);
  const action=useOwnerAction();
  // Album creation lacks a durable Core idempotency receipt. A lost ACK may
  // follow a committed POST, so another submit must NOT create a second album.
  const [uncertain,setUncertain]=useState<AlbumDraft|null>(null);
  const [possibleAlbumId,setPossibleAlbumId]=useState<string|null>(null);
  const valid=name.trim().length>0&&name.trim().length<=GALLERY_LIMITS.albumName&&
    description.length<=GALLERY_LIMITS.caption;
  async function submit(e:FormEvent){
    e.preventDefault();
    if(!valid||uncertain)return;
    const draft:AlbumDraft={name:name.trim(),description:description.trim()||null,isVisible};
    await action.run(async()=>{
      try{
        const response=existing?await commands.update(existing.id,draft):
          await commands.create(draft);
        const ack=albumWriteAck(response,actorId,username,existing?.id);
        if(!albumDraftMatches(ack,draft))throw Error("GALLERY_ACK_MISMATCH");
        const fresh=await getAlbum(ack.id,actorId,username);
        if(!action.live()||fresh.id!==ack.id||fresh.ownerId!==actorId||
          fresh.ownerUsername!==username||fresh.canEdit!==true||
          !albumDraftMatches(fresh,draft))throw Error("GALLERY_READBACK_MISMATCH");
        onSaved(fresh.id);
      }catch(error){
        // Validation/access errors deterministically reject the POST.
        // All network, timeout, malformed ACK or failed readback outcomes
        // remain unknown. Never release the original create submission.
        if(!existing && !(error instanceof ApiError &&
            [400,401,403,404,409,413,415,429].includes(error.status)) &&
            action.live())setUncertain(draft);
        throw error;
      }
    });
  }
  async function checkUncertain(){
    const draft=uncertain;
    if(!draft)return;
    await action.run(async()=>{
      let cursor:string|null=null;
      const seen=new Set<string>();
      const matches:AlbumSummary[]=[];
      // Search owner-projected pages only. If pagination is incomplete,
      // refuse to infer the write's outcome from a partial list.
      let complete=false;
      for(let pageNumber=0;pageNumber<20;pageNumber++){
        const result=await listAlbums(actorId,username,cursor);
        if(result.isOwner!==true||result.enabled!==true)throw Error("GALLERY_NOT_OWNER");
        for(const item of result.items){
          if(item.ownerId!==actorId||item.ownerUsername!==username||!item.canEdit||
              seen.has(item.id))throw Error("GALLERY_BAD_OWNER_LIST");
          seen.add(item.id);
          if(albumDraftMatches(item,draft))matches.push(item);
        }
        if(!result.nextCursor){complete=true;break;}
        if(result.nextCursor===cursor)throw Error("GALLERY_CURSOR_LOOP");
        cursor=result.nextCursor;
      }
      if(!action.live())return;
      setPossibleAlbumId(complete&&matches.length===1?matches[0]!.id:null);
      if(!complete)return "Список неполный. Повторная отправка отключена.";
      if(matches.length===1)return "Найден похожий альбом. Проверьте его вручную: запись не повторена.";
      if(matches.length>1)return "Найдены несколько похожих альбомов. Проверьте список вручную.";
      return "Совпадений пока нет. Результат записи неизвестен, повторная отправка отключена.";
    });
  }
  const sourceForm=sourceCreate||sourceEdit;
  return <form className={`${sourceForm?original.albumForm+" ":""}gallery-editor`}
    onSubmit={e=>void submit(e)}>
    {!sourceForm && <h3>{existing?"Редактировать альбом":"Новый альбом"}</h3>}
    <div className={sourceForm?original.albumFields:undefined}>
      <label>{sourceForm?"Название альбома":"Название"}
        <input required maxLength={GALLERY_LIMITS.albumName} value={name}
          disabled={action.busy||!!uncertain} onChange={e=>setName(e.target.value)}/>
      </label>
      <label>{sourceForm?"Описание (необязательно)":"Описание"}
        <textarea maxLength={GALLERY_LIMITS.caption} value={description}
          disabled={action.busy||!!uncertain} onChange={e=>setDescription(e.target.value)}/>
        {sourceForm && <small>{description.length} / {GALLERY_LIMITS.caption} символов</small>}
      </label>
    </div>
    <div className={sourceForm?original.albumVisibility:undefined}>
      <label className="gallery-check">
        <input type="checkbox" checked={isVisible} disabled={action.busy||!!uncertain}
          onChange={e=>setIsVisible(e.target.checked)}/>
        {sourceForm?"Виден всем авторизованным":"Показывать альбом другим пользователям"}
      </label>
      {sourceForm && <p>Если выключить, альбом и фотографии будут доступны только вам.</p>}
    </div>
    <div className={sourceForm?original.albumFormActions:"gallery-controls"}>
      <PrimaryButton type="submit" disabled={!valid||action.busy||!!uncertain}>
        {action.busy?(sourceForm?"Сохранение…":"Сохраняем…"):
          sourceCreate?"Создать альбом":sourceEdit?"Сохранить изменения":"Сохранить альбом"}</PrimaryButton>
      <SecondaryButton variant="red" type="button"  disabled={action.busy}
        onClick={onCancel}>Отмена</SecondaryButton>
    </div>
    {uncertain&&<div role="status" className="gallery-write-uncertain">
      <p>Сервер не подтвердил создание альбома. Повторная отправка заблокирована:
        альбом уже мог сохраниться.</p>
      <button type="button" className="button-secondary" disabled={action.busy}
        onClick={()=>void checkUncertain()}>Проверить мои альбомы без повторной записи</button>
      {possibleAlbumId&&<RouteLink to={galleryAlbumPath(possibleAlbumId)}>
        Открыть найденный похожий альбом
      </RouteLink>}
    </div>}
    {action.notice&&<p role="status">{action.notice}</p>}
  </form>;
}
export function AlbumDelete({album,commands=galleryAlbumCommands,onDeleted,
  getAlbum=getMyAlbum}:{
  album:AlbumSummary;commands?:Commands;onDeleted:()=>void;
  getAlbum?:(id:string,actorId:string,username:string)=>Promise<AlbumSummary>;
}){
  const [armed,setArmed]=useState(false);
  const action=useOwnerAction();
  return <div className="gallery-delete">
    {!armed?<SecondaryButton variant="red" type="button"
      onClick={()=>setArmed(true)}>Удалить альбом</SecondaryButton>:
      <div role="group" aria-label="Подтверждение удаления альбома">
        <p>Удалить альбом «{album.name}» вместе с фотографиями? Это необратимо.</p>
        <SecondaryButton variant="red" type="button" disabled={action.busy}
          onClick={()=>void action.run(async()=>{
            const ack=await commands.remove(album.id);
            if(!deleteAckMatches(ack,album.id))throw Error("GALLERY_DELETE_ACK_UNKNOWN");
            try{await getAlbum(album.id,album.ownerId,album.ownerUsername);}
            catch(e){
              if(e instanceof ApiError&&e.status===404){
                if(action.live())onDeleted();
                return "Альбом удалён.";
              }
              throw e;
            }
            throw Error("GALLERY_DELETE_NOT_CONFIRMED");
          })}>Да, удалить альбом</SecondaryButton>
        <SecondaryButton variant="red" type="button"  disabled={action.busy}
          onClick={()=>setArmed(false)}>Не удалять</SecondaryButton>
      </div>}
    {action.notice&&<p role="status">{action.notice}</p>}
  </div>;
}

export function PhotoManagement({album,photo,commands=galleryAlbumCommands,
  onChanged,checkCover=verifiedGalleryCover,getPhoto=getMyPhoto,sourceDialog=false}:{
  album:AlbumSummary;photo:AlbumPhoto;commands?:Commands;onChanged:()=>void;
  checkCover?:(id:string,userId:string,username:string,photoId:string)=>Promise<boolean>;
  getPhoto?:(id:string,albumId:string)=>Promise<AlbumPhoto>;
  sourceDialog?:boolean;
}){
  const action=useOwnerAction();
  const [editing,setEditing]=useState(sourceDialog);
  const [caption,setCaption]=useState(photo.caption??"");
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [moving,setMoving]=useState(sourceDialog);
  const [destination,setDestination]=useState("");
  // A lost move ACK must never generate a different client request ID on retry.
  const moveIntent=useRef<{destination:string;key:string}|null>(null);
  const destinations=useInfiniteQuery({
    queryKey:["gallery","destinations",album.ownerId,album.ownerUsername],
    initialPageParam:null as string|null,
    queryFn:({pageParam})=>listMyAlbums(album.ownerId,album.ownerUsername,pageParam),
    getNextPageParam:p=>p.nextCursor??undefined,
    enabled:moving,staleTime:0,retry:false,gcTime:0,
  });
  async function edit(e:FormEvent){
    e.preventDefault();
    if(caption.length>GALLERY_LIMITS.caption)return;
    if(await action.run(async()=>{
      const value=caption.trim()||null;
      await commands.updateCaption(photo.id,value);
      const readback=await getPhoto(photo.id,album.id);
      if(!action.live()||readback.caption!==value)
        throw Error("GALLERY_PHOTO_READBACK_UNKNOWN");
      onChanged();
    }))setEditing(false);
  }
  return <div className="gallery-photo-actions">
    {!editing?<button type="button" className="button-secondary"
      disabled={action.busy} onClick={()=>setEditing(true)}>Изменить подпись</button>:
      <form onSubmit={e=>void edit(e)}>
        <label>{sourceDialog?"Подпись":"Подпись к фотографии"}
          {sourceDialog?
            <textarea rows={3} maxLength={GALLERY_LIMITS.caption} value={caption}
              disabled={action.busy} onChange={e=>setCaption(e.target.value)}/>:
            <input maxLength={GALLERY_LIMITS.caption} value={caption}
              disabled={action.busy} onChange={e=>setCaption(e.target.value)}/>}
        </label>
        <PrimaryButton type="submit" disabled={action.busy}>Сохранить подпись</PrimaryButton>
        {!sourceDialog && <SecondaryButton variant="red" type="button"  disabled={action.busy}
          onClick={()=>setEditing(false)}>Отмена</SecondaryButton>}
      </form>}
    {photo.status==="ready"&&
      <button type="button" className="button-secondary" disabled={action.busy}
        onClick={()=>void action.run(async()=>{
          const response=await commands.setCover(album.id,photo.id);
          if(!galleryCoverAckMatches(response,album.ownerId,
            album.ownerUsername,album.id,photo.id))
            throw Error("GALLERY_COVER_ACK_UNKNOWN");
          if(!await checkCover(album.id,album.ownerId,album.ownerUsername,photo.id)||
            !action.live())throw Error("GALLERY_COVER_READBACK_UNKNOWN");
          onChanged();
        })}>Сделать обложкой</button>}
    {photo.status==="ready"&&(!moving?<button type="button" className="button-secondary" disabled={action.busy}
      onClick={()=>setMoving(true)}>Переместить</button>:
      <div role="group" aria-label="Переместить фотографию">
        <select value={destination} disabled={action.busy||destinations.isPending}
          onChange={e=>{setDestination(e.target.value);moveIntent.current=null;}}>
          <option value="">Выберите альбом</option>
          {destinations.data?.pages.flatMap(page=>page.items)
            .filter(a=>a.id!==album.id&&a.ownerId===album.ownerId)
            .map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {destinations.hasNextPage&&<button type="button" className="button-secondary"
          onClick={()=>void destinations.fetchNextPage()}>Другие альбомы</button>}
        {destinations.isError&&<p role="alert">Не удалось загрузить другие альбомы.</p>}
        <button type="button" disabled={!destination||action.busy}
          onClick={()=>void action.run(async()=>{
            if(photo.status!=="ready"||!destination||destination===album.id)
              throw Error("GALLERY_MOVE_INVALID_TARGET");
            if(!moveIntent.current||moveIntent.current.destination!==destination)
              moveIntent.current={destination,key:crypto.randomUUID()};
            const ack=await commands.movePhoto(photo.id,destination,moveIntent.current.key);
            const queued=!!ack&&typeof ack==="object"&&
              "photo" in ack&&ack.photo!==null&&typeof ack.photo==="object"&&
              "status" in ack.photo&&ack.photo.status==="moving"&&
              "albumId" in ack.photo&&ack.photo.albumId===album.id;
            const direct=!!ack&&typeof ack==="object"&&
              "photo" in ack&&ack.photo!==null&&typeof ack.photo==="object"&&
              "status" in ack.photo&&ack.photo.status==="ready"&&
              "albumId" in ack.photo&&ack.photo.albumId===destination;
            if(!ack||typeof ack!=="object"||!("jobId" in ack)||
              typeof ack.jobId!=="string"||!ack.jobId||
              !("photo" in ack)||!ack.photo||typeof ack.photo!=="object"||
              !("id" in ack.photo)||ack.photo.id!==photo.id||
              (!queued&&!direct))
              throw Error("GALLERY_MOVE_ACK_UNKNOWN");
            // Worker may finish before owner GET. First check source (moving),
            // then destination (ready). Both are authenticated scoped GETs.
            let confirmed="";
            if(queued)try{
              const source=await getPhoto(photo.id,album.id);
              if(source.id===photo.id&&source.status==="moving")confirmed="moving";
            }catch(error){
              if(error instanceof ApiError&&[401,403].includes(error.status))throw error;
            }
            if(!confirmed){
              const target=await getPhoto(photo.id,destination);
              if(target.id===photo.id&&target.albumId===destination&&target.status==="ready")
                confirmed="ready";
            }
            if(!action.live()||!confirmed)
              throw Error("GALLERY_MOVE_READBACK_UNKNOWN");
            moveIntent.current=null;
            onChanged();
            return confirmed==="ready"?"Фото перенесено.":
              "Перемещение запущено. Проверьте альбом позже.";
          })}>Переместить фото</button>
        <SecondaryButton variant="red" type="button"  disabled={action.busy}
          onClick={()=>setMoving(false)}>Отмена</SecondaryButton>
      </div>)}
    {!confirmDelete?<SecondaryButton variant="red" type="button"
      disabled={action.busy} onClick={()=>setConfirmDelete(true)}>Удалить фото</SecondaryButton>:
      <div role="group" aria-label="Удаление фотографии">
        <p>Удалить эту фотографию без возможности восстановления?</p>
        <SecondaryButton variant="red" type="button" disabled={action.busy}
          onClick={()=>void action.run(async()=>{
            const ack=await commands.removePhoto(photo.id);
            if(!deleteAckMatches(ack,photo.id))throw Error("GALLERY_DELETE_ACK_UNKNOWN");
            try{await getPhoto(photo.id,album.id);}
            catch(e){
              if(e instanceof ApiError&&e.status===404){
                if(action.live())onChanged();
                return "Фото удалено.";
              }
              throw e;
            }
            throw Error("GALLERY_DELETE_NOT_CONFIRMED");
          })}>Да, удалить фото</SecondaryButton>
        <SecondaryButton variant="red" type="button"  disabled={action.busy}
          onClick={()=>setConfirmDelete(false)}>Отмена</SecondaryButton>
      </div>}
    {action.notice&&<p role="status">{action.notice}</p>}
  </div>;
}

async function imageTypeOk(file:File):Promise<boolean>{
  const b=new Uint8Array(await file.slice(0,12).arrayBuffer());
  if(file.type==="image/jpeg")return b[0]===255&&b[1]===216&&b[2]===255;
  if(file.type==="image/png")return b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71;
  if(file.type==="image/webp")return String.fromCharCode(...b.slice(0,4))==="RIFF"&&
    String.fromCharCode(...b.slice(8,12))==="WEBP";
  return false;
}
export function GalleryUpload({albumId,onRefresh}:{
  albumId:string;onRefresh:()=>void;
}){
  const [file,setFile]=useState<File|null>(null);
  const [caption,setCaption]=useState("");
  const [lastId,setLastId]=useState<string|null>(null);
  const [uncertain,setUncertain]=useState(false);
  const action=useOwnerAction();
  const abort=useRef<AbortController|null>(null);
  const preparing=useRef(false);
  useEffect(()=>()=>{abort.current?.abort();},[]);
  async function upload(e:FormEvent){
    e.preventDefault();
    if(preparing.current||uncertain||action.busy||!file||
      file.size>GALLERY_LIMITS.photoBytes||file.size===0||
      caption.length>GALLERY_LIMITS.caption)return;
    // Synchronous fence before the async MIME sniff; double submit must
    // never create two independent reservations from one selected file.
    preparing.current=true;
    try{
      if(!await imageTypeOk(file)){
        action.setNotice("Выберите настоящий файл JPG, PNG или WebP до 10 МиБ.");
        return;
      }
      await action.run(async()=>{
        // Non-idempotent S3 upload may commit before the browser loses ACK.
        // No second reservation or POST until the original upload is verified.
        setUncertain(true);setLastId(null);
        const requestId=crypto.randomUUID();
        const reserved=await reserveGalleryPhoto(albumId,file,caption.trim()||null,requestId);
        if(!uploadReservationValid(reserved,albumId))throw Error("GALLERY_RESERVE_UNKNOWN");
        setLastId(reserved.uploadId);
        const ctrl=new AbortController();abort.current=ctrl;
        await uploadGalleryForm(reserved,file,ctrl.signal);
        if(!action.live())return;
        const result=await confirmGalleryPhoto(reserved.uploadId);
        if(result.uploadId!==reserved.uploadId||
          !["uploaded","processing","ready"].includes(result.status))
          throw Error("GALLERY_CONFIRM_UNKNOWN");
        const verified=await galleryUploadStatus(reserved.uploadId);
        if(!action.live()||verified.uploadId!==reserved.uploadId||
          verified.albumId!==albumId||
          !["uploaded","processing","ready"].includes(verified.status))
          throw Error("GALLERY_READBACK_UNKNOWN");
        setUncertain(false);onRefresh();setFile(null);setCaption("");
        return verified.status==="ready"?"Фото добавлено.":
          "Загрузка подтверждена. Фото появится после обработки.";
      });
    }finally{preparing.current=false;}
  }
  return <form className="gallery-upload" onSubmit={e=>void upload(e)}>
    <h4>Добавить фотографию</h4>
    <label>Файл JPG, PNG или WebP
      <input type="file" accept="image/jpeg,image/png,image/webp"
        disabled={action.busy||uncertain}
        onChange={e=>setFile(e.target.files?.[0]??null)}/>
    </label>
    <label>Подпись
      <input maxLength={GALLERY_LIMITS.caption} value={caption}
        disabled={action.busy} onChange={e=>setCaption(e.target.value)}/>
    </label>
    <PrimaryButton type="submit" disabled={!file||action.busy||uncertain}>
      {action.busy?"Отправляем…":"Загрузить фото"}</PrimaryButton>
    {lastId&&<button type="button" className="button-secondary"
      disabled={action.busy}
      onClick={()=>void action.run(async()=>{
        const verified=await galleryUploadStatus(lastId);
        if(verified.albumId!==albumId||verified.uploadId!==lastId)
          throw Error("GALLERY_UPLOAD_SCOPE_UNKNOWN");
        if(["uploaded","processing","ready"].includes(verified.status)){
          setUncertain(false);setFile(null);setCaption("");onRefresh();
          return verified.status==="ready"?"Фотография готова.":
            "Загрузка подтверждена. Фото появится после обработки.";
        }
        return "Обработка не подтверждена: "+verified.status+
          ". Повторная отправка отключена.";
      })}>Проверить состояние загрузки</button>}
    {uncertain&&<p role="alert">Статус отправки файла неизвестен.
      Повторная загрузка заблокирована, чтобы не создать дубль.
      {lastId?" Проверьте состояние по кнопке выше.":
        " Идентификатор загрузки не получен — проверьте альбом вручную."}
    </p>}
    {action.notice&&<p role="status">{action.notice}</p>}
  </form>;
}
