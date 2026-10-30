import { Loading } from "../../shared/ui";
import { BackButton, PrimaryButton } from "../../shared/ui";
import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {QueryClient,QueryClientProvider,useQuery,useQueryClient}
 from "@tanstack/react-query";
import type {AuthUser} from "../../shared/auth/authApi";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {projectVetVisits,type VetVisitsSourceWire} from "./vetVisitsSourceMock";
import {projectHonoVetList,projectHonoVetDetail,vetReadFailure,
 type VetHonoSourceReadWire} from "./vetVisitsHonoReadConsumer";
import type {VetVisitSafe} from "./vetVisitsSourceMock";

type Props={
 enabled:boolean;ownerId:string;petId:string;
 transport?:VetVisitsSourceWire;
 honoTransport?:VetHonoSourceReadWire;
 selectedVisitId?:string|null;
 badDeepLink?:boolean;
 onSelectVisit?:(visitId:string|null)=>void;
};
function Visits({petId,wire,hono,current,onClose,selectedId,onSelect}:{petId:string;
 wire:VetVisitsSourceWire|VetHonoSourceReadWire;
 hono:boolean;current:()=>boolean;onClose:()=>void;
 selectedId:string|null;onSelect?:(visitId:string|null)=>void;
}){
 const [expanded,setExpanded]=useState<string|null>(null);
 const visits=useQuery({
  queryKey:["vet-visits",hono?"hono-contract":"legacy-next-synthetic",petId],
  queryFn:async()=>{
   const rows=hono?projectHonoVetList(await wire.list(petId),petId):
    projectVetVisits(await wire.list(petId),petId);
   if(!current())throw Error("STALE_OWNER");
   return rows;
  },
  retry:false,gcTime:0,staleTime:0,
 });
 const chosen=visits.data?.find(v=>v.id===selectedId);
 const detailWire=hono?wire as VetHonoSourceReadWire:null;
 const detail=useQuery({
  queryKey:["vet-visits","hono-detail",petId,selectedId],
  queryFn:async()=>{
   if(!selectedId||!detailWire||!current())
    throw Error("STALE_OWNER");
   const data=projectHonoVetDetail(
    await detailWire.detail(petId,selectedId),petId,selectedId);
   if(!current())throw Error("STALE_OWNER");
   return data;
  },
  enabled:hono&&visits.isSuccess&&!!selectedId&&!!chosen&&!!detailWire,
  retry:false,gcTime:0,staleTime:0,
 });
 if(!current())return <p role="alert">
  Сессия изменилась. Откройте питомца заново.</p>;
 const listError=visits.isError?vetReadFailure(visits.error):null;
 const detailError=detail.isError?vetReadFailure(detail.error):null;
 const medical=(visit:VetVisitSafe)=><section aria-label="Медицинские сведения">
  {visit.diagnosis&&<p>Диагноз: {visit.diagnosis}</p>}
  {visit.conclusion&&<p>Заключение: {visit.conclusion}</p>}
  {visit.notes&&<p>Заметки: {visit.notes}</p>}
  {visit.attachments.length>0&&<div>
   <h5>Вложения: {visit.attachments.length}</h5>
   <ul>{visit.attachments.map(file=><li key={file.id}>
    {file.name} · {file.mimeType}
    {file.previewProcessing?" · обработка превью":""}
   </li>)}</ul>
  </div>}
 </section>;
 return <section className="vet-readonly"
  aria-label={hono?"История посещений врача (Hono макет)":
   "История посещений врача (макет)"}>
  <header><h3>История посещений врача</h3>
   <BackButton type="button" onClick={onClose}>К карточке питомца</BackButton></header>
  <p className="note">Только чтение, синтетические данные.
   Медицинские сведения и вложения не отправляются и не изменяются.</p>
  {visits.isPending&&<Loading message="Загружаем приёмы…" />}
  {visits.isError&&<div role="alert">
   <p>{listError==="NOT_FOUND"?"История питомца не найдена.":
    listError==="UNAUTHORIZED"&&hono?"Нет доступа к истории питомца.":
    "Не удалось получить посещения врача. Проверьте доступ к питомцу."}</p>
   <PrimaryButton type="button" onClick={()=>void visits.refetch()}>
    Повторить чтение</PrimaryButton>
  </div>}
  {visits.isSuccess&&visits.data.length===0&&!!selectedId&&
   <p role="alert">Посещение не найдено.</p>}
  {visits.isSuccess&&visits.data.length===0&&!selectedId&&
   <p role="status">Записей о посещениях пока нет.</p>}
  {visits.isSuccess&&!!selectedId&&!chosen&&visits.data.length>0&&
   <p role="alert">Посещение не найдено.</p>}
  {hono&&selectedId&&chosen&&<>
   {detail.isPending&&<Loading message="Проверяем выбранное посещение…" />}
   {detail.isError&&<div role="alert">
    <p>{detailError==="NOT_FOUND"?"Посещение не найдено.":
     detailError==="UNAUTHORIZED"?"Нет доступа к посещению.":
      "Не удалось загрузить посещение врача."}</p>
    <PrimaryButton type="button" onClick={()=>void detail.refetch()}>
     Повторить чтение посещения</PrimaryButton>
   </div>}
   {detail.isSuccess&&medical(detail.data)}
   {onSelect&&<BackButton type="button"
     onClick={()=>onSelect(null)}>К истории посещений</BackButton>}
  </>}
  {visits.isSuccess&&<ol className="vet-visits-list">
   {visits.data.map(visit=><li key={visit.id} className="compact-card">
    <h4>{visit.visitedOn} · {visit.specialty||"Приём врача"}</h4>
    {visit.doctorName&&<p>Врач: {visit.doctorName}</p>}
    {visit.clinic&&<p>Клиника: {visit.clinic}</p>}
    {hono?
      <button type="button" onClick={()=>onSelect?.(visit.id)}
       aria-pressed={selectedId===visit.id}>
       {selectedId===visit.id?"Посещение выбрано":"Открыть посещение"}</button>:
      <>
       <button type="button" onClick={()=>setExpanded(old=>
        old===visit.id?null:visit.id)} aria-expanded={expanded===visit.id}>
        {expanded===visit.id?"Скрыть медицинские сведения":
         "Показать медицинские сведения"}</button>
       {expanded===visit.id&&medical(visit)}
      </>}
   </li>)}
  </ol>}
 </section>;
}
const fingerprint=(u:AuthUser|null)=>u&&JSON.stringify([
 u.id,u.username,u.role,
 (u as AuthUser&{sessionRevision?:unknown}).sessionRevision??null,
]);
function Bound({owner,petId,wire,hono,selectedId,onSelect}:{
 owner:string;petId:string;wire:VetVisitsSourceWire|VetHonoSourceReadWire;
 hono:boolean;selectedId:string|null;onSelect?:(id:string|null)=>void;
}){
 const global=useQueryClient();
 const read=()=>global.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)??null;
 const initial=useRef(read());
 const epoch=useRef(0),last=useRef(initial.current);
 const version=useSyncExternalStore(cb=>global.getQueryCache().subscribe(event=>{
  if(event.query.queryKey.length===CURRENT_USER_QUERY_KEY.length&&
   event.query.queryKey.every((part:unknown,i:number)=>
    part===CURRENT_USER_QUERY_KEY[i])){
   const next=read();
   if(fingerprint(next)!==fingerprint(last.current)||event.type==="removed"){
    last.current=next;epoch.current++;cb();
   }
  }
 }),()=>epoch.current,()=>epoch.current);
 const [open,setOpen]=useState(!!selectedId);
 const [privateClient]=useState(()=>new QueryClient({defaultOptions:{
  queries:{retry:false,gcTime:0,staleTime:0,refetchOnWindowFocus:false},
 }}));
 useEffect(()=>()=>{void privateClient.cancelQueries();privateClient.clear();},[
  privateClient,
 ]);
 const current=()=>epoch.current===0&&fingerprint(read())===
  fingerprint(initial.current)&&read()?.id===owner;
 if(initial.current?.id!==owner||version!==0||!current())
  return <p role="alert">Сессия изменилась. Откройте питомца заново.</p>;
 if(!open)return <button type="button" onClick={()=>setOpen(true)}>
  {hono?"История приёмов (Hono макет)":"История приёмов (макет)"}</button>;
 return <QueryClientProvider client={privateClient}>
  <Visits petId={petId} wire={wire} hono={hono}
   current={current} selectedId={selectedId} onSelect={onSelect}
   onClose={()=>{void privateClient.cancelQueries();
    privateClient.clear();setOpen(false);onSelect?.(null);}}/>
 </QueryClientProvider>;
}
export function VetVisitsReadOptIn({enabled,ownerId,petId,transport,
 honoTransport,selectedVisitId=null,badDeepLink=false,onSelectVisit}:Props){
 if(!enabled||!/^[a-zA-Z0-9_-]{1,128}$/.test(ownerId)||
  !/^[a-zA-Z0-9_-]{1,128}$/.test(petId)||badDeepLink)
  return badDeepLink&&enabled?<p role="alert">
   Некорректная ссылка на посещение врача.</p>:null;
 const hono=honoTransport?.fixtureKind===
  "AG2_VET_HONO_LIST_DETAIL_SYNTHETIC_ONLY";
 const wire=hono?honoTransport:transport?.fixtureKind===
  "AG2_VET_VISITS_LEGACY_NEXT_GET_SYNTHETIC"?transport:null;
 if(!wire)return null;
 return <Bound key={petId+":"+ownerId+":"+(hono?"hono":"next")}
  owner={ownerId} petId={petId} wire={wire} hono={hono}
  selectedId={hono?selectedVisitId:null} onSelect={hono?onSelectVisit:undefined}/>;
}
