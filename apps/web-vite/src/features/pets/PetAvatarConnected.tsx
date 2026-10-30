import { Loading } from "../../shared/ui";
import {useEffect,useRef,useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {ApiError} from "../../shared/api/client";
import {uploadPetAvatarAndVerify} from "./petAvatarApi";
import {getMyPet} from "./petApi";
import {sameTrustedPetPhotoObject,trustedPetPhotoUrl} from "./petPhotoUrl";
import styles from "./PetAvatarConnected.module.css";
import {PrimaryButton} from "../../shared/ui";
export function PetAvatarConnected({petId,ownerId,petType,petName,photoUrl,isCurrent}:{
  petId:string;ownerId:string;petType:"DOG"|"CAT";petName:string;
  photoUrl?:string|null;isCurrent:()=>boolean;
}){
  const cache=useQueryClient();
  const [failed,setFailed]=useState<string|null>(null);
  const [confirmed,setConfirmed]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [unknown,setUnknown]=useState(false);
  const [checking,setChecking]=useState(false);
  const [message,setMessage]=useState("");
  const pending=useRef(false);
  const live=useRef(true);
  const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{live.current=true;return ()=>{live.current=false;};},[]);
  const current=()=>live.current&&isCurrent();
  const fallback=petType==="CAT"?"/images/pet-avatar-cat.png":"/images/pet-avatar-dog.png";
  const candidate=confirmed||photoUrl||fallback;
  const src=failed===candidate?fallback:candidate;
  const send=async(file:File|null)=>{
    if(!file||!current()||pending.current||unknown)return;
    pending.current=true;setBusy(true);setMessage("");
    try{
      const url=await uploadPetAvatarAndVerify(petId,file);
      if(!current())return;
      setConfirmed(url);setFailed(null);
      await Promise.all([
        cache.invalidateQueries({queryKey:["pets","mine",ownerId]}),
        cache.invalidateQueries({queryKey:["pets","detail",ownerId,petId]}),
      ]);
      if(current())setMessage("Фотография питомца обновлена.");
    }catch(error){
      if(!current())return;
      const rejected=error instanceof ApiError&&[400,401,403,404,413,415,429]
        .includes(error.status);
      // Bad file bytes/size fail before POST, and are safe to re-select.
      const invalidFile=error instanceof Error&&
        /Фотография должна|Повреждённое|Не удалось прочитать|уменьшить/.test(error.message);
      if(!rejected&&!invalidFile)setUnknown(true);
      setMessage(error instanceof ApiError&&error.status===401?
        "Сессия завершена. Войдите снова.":rejected||invalidFile?
          "Файл не принят. Проверьте тип и размер фотографии.":
          "Подтверждение загрузки не получено. Повтор заблокирован.");
    }finally{pending.current=false;if(current())setBusy(false);}
  };
  const reconcile=async()=>{
    if(!unknown||pending.current||checking||!current())return;
    pending.current=true;setChecking(true);setMessage("");
    try{
      // READ only. A lost multipart ACK cannot safely trigger another POST.
      const pet=await getMyPet(petId);
      if(!current())return;
      const now=trustedPetPhotoUrl(pet.photoUrl);
      if(!now||sameTrustedPetPhotoObject(now,confirmed||photoUrl)){
        setMessage("Не удалось подтвердить новое фото. Повтор остаётся заблокирован.");
        return;
      }
      setConfirmed(now);setFailed(null);setUnknown(false);
      await Promise.all([
        cache.invalidateQueries({queryKey:["pets","mine",ownerId]}),
        cache.invalidateQueries({queryKey:["pets","detail",ownerId,petId]}),
      ]);
      if(current())setMessage("Фотография подтверждена сервером.");
    }catch{
      if(current())setMessage("Не удалось проверить фотографию. Повтор заблокирован.");
    }finally{pending.current=false;if(current())setChecking(false);}
  };
  return <div className={styles.avatar} aria-label={`Фотография питомца ${petName}`}>
    <img className="gafus-legacy-pet-photo" src={src} alt={`Питомец ${petName}`}
      width={118} height={118} loading="lazy"
      onError={()=>{if(src!==fallback)setFailed(src);}}/>
    <button type="button" className={styles.edit} disabled={busy||unknown||!isCurrent()}
      title="Изменить фотографию питомца" aria-label={`Изменить фотографию ${petName}`}
      onClick={()=>input.current?.click()}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
        stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
        strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M15.5 5.5 18.5 8.5" />
        <path d="m4 20 4.2-1.1L19.3 7.8a2.12 2.12 0 0 0-3-3L5.2 15.9 4 20Z" />
      </svg>
    </button>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
      className={styles.input} disabled={busy||unknown}
      onChange={event=>{
        const file=event.target.files?.item(0)??null;
        event.currentTarget.value="";
        void send(file);
      }}/>
    {busy&&<Loading message="Загружаем фотографию…" className={styles.message} />}
    {message&&<p role={unknown?"alert":"status"} className={styles.message}>{message}</p>}
    {unknown&&<PrimaryButton type="button" disabled={busy||checking||!isCurrent()}
      onClick={()=>void reconcile()}>Проверить фотографию</PrimaryButton>}
  </div>;
}
