import { Loading } from "../../shared/ui";
import { BackButton, PrimaryButton } from "../../shared/ui";
import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {QueryClient,QueryClientProvider,useQuery,useQueryClient} from "@tanstack/react-query";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {AuthUser} from "../../shared/auth/authApi";
import {navigate} from "../../shared/router/location";
import {formatKopecks,projectPartnerDashboard,safePartnerReferralLink,
 type PartnerSourceWire} from "./partnerReadApi";

function Dashboard({owner,wire,current,onBack}:{
 owner:string;wire:PartnerSourceWire;current:()=>boolean;onBack:()=>void;
}){
 const info=useQuery({queryKey:["partner","owner",owner],
  queryFn:async()=>{
   const data=projectPartnerDashboard(await wire.get());
   if(!current())throw Error("STALE_PARTNER_SESSION");
   return data;
  },retry:false,gcTime:0,staleTime:0});
 if(!current())return <p role="alert">Сессия изменилась.
  Откройте профиль заново.</p>;
 return <section className="partner-panel" aria-label="Партнёрская программа (макет)">
  <header><h3>Партнёрская программа</h3>
   <BackButton type="button" onClick={onBack}>Мой профиль</BackButton>
  </header>
  <p className="note">Изолированный просмотр кабинета.
   Создание заявок на выплаты и реальные платежи здесь выключены.</p>
  {info.isPending&&<Loading message="Загружаем кабинет партнёра…" />}
  {info.isError&&<div role="alert"><p>Кабинет партнёра недоступен.
   Возможно, у вас нет партнёрских прав.</p>
   <PrimaryButton type="button" onClick={()=>void info.refetch()}>Повторить проверку</PrimaryButton>
  </div>}
  {info.isSuccess&&<>
   {!info.data.active&&<p role="status">Партнёрская программа неактивна.</p>}
   <label htmlFor="partner-readonly-link">Ваша ссылка для приглашения</label>
   <input id="partner-readonly-link" readOnly aria-label="Ваша партнёрская ссылка"
    value={safePartnerReferralLink(info.data.referralCode,window.location.origin)}/>
   <dl className="partner-stats">
    <div><dt>Приглашено учеников</dt><dd>{info.data.referrals}</dd></div>
    <div><dt>Начислено</dt><dd>{formatKopecks(info.data.earnedKopecks)}</dd></div>
    <div><dt>В заявках</dt><dd>{formatKopecks(info.data.reservedKopecks)}</dd></div>
    <div><dt>Доступно к выплате</dt><dd>{formatKopecks(info.data.availableKopecks)}</dd></div>
   </dl>
   <p className="note" aria-label="Выплаты недоступны">
    Заявка на выплату недоступна до разрешённой проверки POST и
    защиты от повторной отправки.</p>
  </>}
 </section>;
}
function OwnerBoundary({owner,wire,routeMode}:{
 owner:string;wire:PartnerSourceWire;routeMode:boolean;
}){
 const global=useQueryClient();
 const first=useRef(global.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY));
 const original=first.current?.id??null;
 const signature=(u:AuthUser|null|undefined)=>u?.id+":"+u?.role;
 const epoch=useRef(0),last=useRef(signature(first.current));
 const version=useSyncExternalStore(cb=>global.getQueryCache().subscribe(event=>{
  if(event.query.queryKey.length===CURRENT_USER_QUERY_KEY.length&&
    event.query.queryKey.every((k:unknown,i:number)=>k===CURRENT_USER_QUERY_KEY[i])){
   const user=global.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY);
   const next=signature(user);
   if(next!==last.current&&(user!==null||event.type==="removed"||
     event.query.state.data===null)){
    last.current=next;epoch.current++;cb();
   }
  }
 }),()=>epoch.current,()=>epoch.current);
 const [opened,setOpened]=useState(routeMode);
 const mounted=useRef(true);
 const [ownCache]=useState(()=>new QueryClient({defaultOptions:{
  queries:{retry:false,staleTime:0,gcTime:0,refetchOnWindowFocus:false},
 }}));
 useEffect(()=>{
  mounted.current=true;
  return ()=>{mounted.current=false;void ownCache.cancelQueries();ownCache.clear();};
 },[ownCache]);
 const current=()=>{
  const user=global.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY);
  return mounted.current&&epoch.current===0&&user?.id===owner&&user.role==="PARTNER";
 };
 if(original!==owner||first.current?.role!=="PARTNER"||
    version!==0||!current())return <p role="alert">
     Сессия изменилась или у вас нет партнёрских прав.</p>;
 if(!opened)return <div className="partner-entry">
  <button type="button" onClick={()=>setOpened(true)}>
   Партнёрский кабинет (макет)</button>
 </div>;
 return <QueryClientProvider client={ownCache}>
  <Dashboard owner={owner} wire={wire} current={current} onBack={()=>{
   void ownCache.cancelQueries();ownCache.clear();
   if(routeMode)navigate("/profile");else setOpened(false);
  }}/>
 </QueryClientProvider>;
}
/** WEB-URL-028 opt-in source-only route, no live transport or payout. */
export function PartnerOptIn({enabled,ownerId,transport,routeMode=false}:{
 enabled:boolean;ownerId:string;transport?:PartnerSourceWire;routeMode?:boolean;
}){
 if(!enabled||!/^[a-zA-Z0-9_-]{1,128}$/.test(ownerId)||
  transport?.fixtureKind!=="AG2_PARTNER_READONLY_SYNTHETIC")return null;
 return <OwnerBoundary key={ownerId+":"+String(routeMode)} owner={ownerId}
  wire={transport} routeMode={routeMode}/>;
}
