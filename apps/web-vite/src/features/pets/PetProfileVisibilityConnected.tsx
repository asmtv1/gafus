import {useEffect,useRef,useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {ApiError} from "../../shared/api/client";
import {getMyPet,type PetCard} from "./petApi";
import {updateMyPetAndVerify} from "./petActionsApi";
import styles from "../../brand/LegacyPetList.module.css";
import {PrimaryButton} from "../../shared/ui";

/** Next PetProfileVisibility equivalent over owner-bound Hono PUT + GET.
 * An unknown write must be reconciled by a separate owner GET before retry. */
export function PetProfileVisibilityConnected({ownerId,petId,petName,showInProfile,isCurrent}:{
  ownerId:string;petId:string;petName:string;showInProfile:boolean;
  isCurrent:()=>boolean;
}){
  const cache=useQueryClient();
  const [checked,setChecked]=useState(showInProfile);
  const [busy,setBusy]=useState(false);
  const [unknown,setUnknown]=useState(false);
  const [message,setMessage]=useState("");
  const live=useRef(true);
  const flight=useRef(false);
  const unknownRef=useRef(unknown);
  unknownRef.current=unknown;
  useEffect(()=>{live.current=true;return ()=>{live.current=false;};},[]);
  // Unknown ACK reconciliation must not be overwritten by a stale list prop.
  useEffect(()=>{
    if(!flight.current&&!unknownRef.current)setChecked(showInProfile);
  },[showInProfile]);
  const current=()=>live.current&&isCurrent();
  const syncConfirmedVisibility=(value:boolean)=>{
    if(!current())return;
    const key=["pets","mine",ownerId];
    // The verified owner PUT + exact-pet GET already proved this change.
    // A normal invalidateQueries() starts a whole-list GET; PetCollection
    // hides *all* cards while isFetching, causing a visible flash/remount.
    // Update only the confirmed public visibility bit in the existing owner
    // projection. Do not manufacture a list for an unmounted/other owner.
    if(cache.getQueryData<PetCard[]>(key)?.some(pet=>pet.id===petId)){
      cache.setQueryData<PetCard[]>(key,previous=>previous?.map(pet=>
        pet.id===petId?{...pet,showInProfile:value}:pet));
    }
    // Refresh the list on next navigation, not in the middle of this click.
    void cache.invalidateQueries({queryKey:key,refetchType:"none"});
  };
  const save=async()=>{
    if(flight.current||unknown||!current())return;
    flight.current=true;setBusy(true);setMessage("");
    const wanted=!checked;
    try{
      const verified=await updateMyPetAndVerify(petId,ownerId,{showInProfile:wanted});
      if(!current())return;
      if(verified.showInProfile!==wanted)throw Error("VISIBILITY_READBACK_UNCONFIRMED");
      setChecked(wanted);
      syncConfirmedVisibility(wanted);
      if(current())setMessage("Настройка видимости сохранена.");
    }catch(error){
      if(!current())return;
      const rejected=error instanceof ApiError&&[400,401,403,404,409,429].includes(error.status);
      if(!rejected)setUnknown(true);
      setMessage(rejected?"Не удалось изменить видимость питомца.":
        "Результат сохранения неизвестен. Повтор заблокирован до проверки.");
    }finally{flight.current=false;if(current())setBusy(false);}
  };
  const reconcile=async()=>{
    if(!unknown||flight.current||!current())return;
    flight.current=true;setBusy(true);
    try{
      const verified=await getMyPet(petId);
      if(!current())return;
      setChecked(verified.showInProfile);
      setUnknown(false);
      setMessage("Состояние видимости перепроверено у сервера.");
      syncConfirmedVisibility(verified.showInProfile);
    }catch{
      if(current())setMessage("Не удалось проверить настройку. Повтор остаётся заблокирован.");
    }finally{flight.current=false;if(current())setBusy(false);}
  };
  return <div className={styles.profileVisibility} aria-busy={busy}>
    <button type="button" role="switch" aria-checked={checked}
      aria-label={`Показывать в профиле: ${petName}`} disabled={busy||unknown||!isCurrent()}
      className={styles.profileVisibilityLabel} onClick={()=>void save()}>
      <span className={styles.profileVisibilityIcon} aria-hidden="true">
        {checked?"◉":"◯"}
      </span>
      <span className={styles.profileVisibilityText}>Показывать в профиле</span>
      <span className={`${styles.profileVisibilityTrack} ${checked?
        styles.profileVisibilityTrackActive:""}`} aria-hidden="true">
        <span className={styles.profileVisibilityThumb}/>
      </span>
    </button>
    {message&&<p className={styles.profileVisibilityError} role={unknown?"alert":"status"}>
      {message}</p>}
    {unknown&&<PrimaryButton type="button" disabled={busy||!isCurrent()}
      onClick={()=>void reconcile()}>Перепроверить видимость</PrimaryButton>}
  </div>;
}
