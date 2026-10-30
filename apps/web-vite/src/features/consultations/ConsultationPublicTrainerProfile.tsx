import { Loading } from "../../shared/ui";
import { BackButton, PrimaryButton } from "../../shared/ui";
import {useQuery} from "@tanstack/react-query";
import {ApiError} from "../../shared/api/client";
import {type Catalog,type Specialist} from "./consultationReadApi";

const idPattern=/^[A-Za-z0-9_-]{1,128}$/;

/** WEB-URL-009 source-only detail of a *listed* cynologist.
 * Existing Hono GET /consultations/cynologists is authoritative. There is no
 * public GET /cynologists/:id profile endpoint. Never call slot/booking/payment.
 */
export function projectListedTrainer(catalog:Catalog,userId:string):
  Pick<Specialist,"userId"|"username"|"name"|"about"|"slotDurationMin">|null{
  if(!idPattern.test(userId)||userId==="."||userId==="..")return null;
  const source=catalog.items.find(item=>item.userId===userId);
  if(!source||!idPattern.test(source.userId)||!idPattern.test(source.username)||
    typeof source.name!=="string"||!source.name.trim()||
    !(source.about===null||typeof source.about==="string")||
    !Number.isInteger(source.slotDurationMin)||source.slotDurationMin<1||
    source.slotDurationMin>180)return null;
  // Deliberately discard arbitrary fields (staff contacts, token, private intake).
  return {userId:source.userId,username:source.username,
    name:source.name,about:source.about,slotDurationMin:source.slotDurationMin};
}
const errorCopy=(error:unknown)=>{
  if(error instanceof ApiError){
    if(error.status===401)return "Сессия завершена. Войдите снова.";
    if(error.status===402)return "Для просмотра данных нужен доступ.";
    if(error.status===403)return "Нет доступа к профилю кинолога.";
    if(error.status===404)return "Кинолог больше не опубликован.";
  }
  return "Не удалось загрузить профиль кинолога.";
};
export function ConsultationPublicTrainerProfile({viewerId,userId,load,isCurrent,
  onBack,onSlots,
}:{
  viewerId:string;userId:string;load:()=>Promise<Catalog>;
  isCurrent:()=>boolean;onBack:()=>void;onSlots?:()=>void;
}){
  const valid=idPattern.test(userId)&&idPattern.test(viewerId)&&
    userId!==".."&&viewerId!=="..";
  const query=useQuery({
    queryKey:["consultations","listed-trainer",viewerId,userId],
    queryFn:async()=>{
      const catalog=await load();
      if(!isCurrent())throw Error("SESSION_CHANGED");
      return projectListedTrainer(catalog,userId);
    },
    enabled:valid&&isCurrent(),retry:false,staleTime:0,gcTime:0,
  });
  if(!isCurrent())return <section className="empty-state" role="alert">
    Сессия изменилась. Откройте профиль заново.
  </section>;
  return <section aria-label="Профиль кинолога" className="consultation-trainer-detail">
    <BackButton type="button" onClick={onBack}>К специалистам</BackButton>
    <h3>Профиль кинолога</h3>
    <p className="note">Предварительный просмотр опубликованных данных.
      Без записи, оплаты и просмотра закрытых слотов.</p>
    {!valid&&<p role="alert">Некорректный адрес специалиста.</p>}
    {valid&&query.isPending&&<Loading message="Загружаем профиль кинолога…" />}
    {valid&&query.isError&&<div role="alert" className="empty-state">
      <p>{errorCopy(query.error)}</p>
      <PrimaryButton type="button" onClick={()=>void query.refetch()}>Повторить</PrimaryButton>
    </div>}
    {valid&&query.isSuccess&&!query.data&&<p role="status" className="empty-state">
      Этот кинолог не найден в опубликованном списке.
    </p>}
    {valid&&query.isSuccess&&query.data&&<article className="consultation-specialist-card">
      <div className="consultation-specialist-symbol" aria-hidden>
        {query.data.name.trim().slice(0,1).toUpperCase()}
      </div>
      <h4>{query.data.name}</h4>
      <p className="note">@{query.data.username}</p>
      {query.data.about?<p className="consultation-trainer-about">
        {query.data.about}</p>:
        <p className="note">Описание специалиста пока не опубликовано.</p>}
      <p className="note">Длительность консультации: {query.data.slotDurationMin} мин.</p>
      <p className="note">Доступность записи проверяется отдельно на сервере.</p>
      {onSlots&&<button type="button" onClick={onSlots}>
        Посмотреть свободное время
      </button>}
    </article>}
  </section>;
}
