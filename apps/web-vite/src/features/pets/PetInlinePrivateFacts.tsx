import { Loading } from "../../shared/ui";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMyPet } from "./petApi";
import { PetEditConnected } from "./PetEditConnected";
import { PetDeleteConnected } from "./PetDeleteConnected";
import layout from "./PetExpandedNext.module.css";
import { ApiError } from "../../shared/api/client";
import styles from "../../brand/LegacyPetList.module.css";

/** Next PetCard renders the owner's private measurements and notes inside an
 * expanded card. Never request or hold them in the public/list projection:
 * this exact-pet GET is enabled only while the card is actually expanded. */
export function PetInlinePrivateFacts({ownerId,petId,isCurrent}:{
  ownerId:string;petId:string;isCurrent:()=>boolean;
}){
  const mounted=useRef(true);
  useEffect(()=>{
    mounted.current=true;
    return ()=>{mounted.current=false;};
  },[]);
  const authorized=()=>mounted.current&&isCurrent();
  const detail=useQuery({
    queryKey:["pets","detail",ownerId,petId],
    queryFn:async()=>{
      if(!authorized())throw Error("PET_OWNER_CHANGED");
      const row=await getMyPet(petId);
      if(!authorized()||row.id!==petId)throw Error("PET_OWNER_CHANGED");
      return row;
    },
    enabled:authorized(),staleTime:0,gcTime:0,retry:false,
  });
  if(!authorized())return null;
  if(detail.isPending||detail.isFetching)return <Loading message="Загружаем данные питомца…" />;
  if(detail.isError)return <p role="alert">{
    detail.error instanceof ApiError&&detail.error.status===401?
      "Сессия завершена. Войдите снова.":
    detail.error instanceof ApiError&&[403,404].includes(detail.error.status)?
      "Данные питомца недоступны.":
      "Не удалось загрузить дополнительные данные питомца."
  }</p>;
  const pet=detail.data;
  const facts=[
    pet.neckGirthCm!=null?`Обхват шеи: ${pet.neckGirthCm} см`:null,
    pet.muzzleGirthCm!=null?`Обхват морды: ${pet.muzzleGirthCm} см`:null,
    pet.bellyGirthCm!=null?`Обхват живота: ${pet.bellyGirthCm} см`:null,
    pet.notes?`Заметки: ${pet.notes}`:null,
  ].filter((value):value is string=>value!==null);
  return <>
    {facts.length>0&&<div className={styles.petExtra}>
      {facts.map((value,i)=><span key={i}>{value}</span>)}
    </div>}
    <div className={layout.actions} data-next-pet-actions>
      <PetEditConnected key={pet.id} pet={pet} ownerId={ownerId}
        buttonLabel="Изменить данные" isCurrent={authorized} modal/>
      <PetDeleteConnected ownerId={ownerId} petId={pet.id} petName={pet.name}
        isCurrent={authorized} modal/>
    </div>
  </>;
}
