import { BackButton, BackButtonLink } from "../../shared/ui";
import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {QueryClient,QueryClientProvider,useQueryClient} from "@tanstack/react-query";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {AuthUser} from "../../shared/auth/authApi";
import {RouteLink,type ConsultationRouteView}
  from "../../shared/router/location";
import type {BookingSourceMockTransport} from "./bookingSourceMock";
import {ConsultationReadOnlyPanel,type ConsultationsReadLoaders}
  from "./ConsultationReadOnlyPanel";

/** Explicit source opt-in, App route remains 404 without injection.
 * The isolated nonpersisted query cache carries only sanitized booking fields,
 * no intake phone, payment references, call credentials or signing secrets.
 */
function BoundConsultations({userId,username,loaders,now,
  bookingMockTransport,routeMode=false,routeView=null,
}:{
  userId:string|null;username:string|null;
  loaders?:ConsultationsReadLoaders;now?:Date;
  bookingMockTransport?:BookingSourceMockTransport;
  routeMode?:boolean;routeView?:ConsultationRouteView|null;
}){
  const auth=useQueryClient();
  const first=useRef(auth.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)??null);
  const [privateCache]=useState(()=>new QueryClient({
    defaultOptions:{queries:{retry:false,gcTime:0,refetchOnWindowFocus:false}},
  }));
  useEffect(()=>()=>{void privateCache.cancelQueries();privateCache.clear();},
    [privateCache]);
  const [open,setOpen]=useState(false);
  // Persist only synthetic one-shot slot IDs in the App-owned QueryClient,
  // across route chunks. The principal fence removes all non-auth queries on
  // session revocation; never use browser storage, media or server credentials.
  const mockAttemptsKey=["consultations","synthetic-attempted-slots",userId,username] as const;
  const [attempted,setAttempted]=useState<Set<string>>(()=>{
    const cached=routeMode &&
      bookingMockTransport?.fixtureKind==="AG2_BOOKING_SYNTHETIC_ONLY"
      ? auth.getQueryData<unknown>(mockAttemptsKey) : null;
    return new Set(Array.isArray(cached)
      ? cached.filter((id):id is string=>typeof id==="string"&&id.length<=128).slice(0,100)
      : []);
  });
  const seq=useRef(0);
  const previous=useRef(first.current);
  const revision=useSyncExternalStore(callback=>
    auth.getQueryCache().subscribe(event=>{
      if(event.query.queryKey.length===CURRENT_USER_QUERY_KEY.length&&
        event.query.queryKey.every((value:unknown,index:number)=>
          value===CURRENT_USER_QUERY_KEY[index])){
        const next=auth.getQueryData<AuthUser|null>(
          CURRENT_USER_QUERY_KEY)??null;
        const prev=previous.current;
        const currentRevision=(user:AuthUser|null)=>
          (user as (AuthUser&{sessionRevision?:unknown})|null)?.sessionRevision;
        if(next?.id!==prev?.id||next?.username!==prev?.username||
          next?.role!==prev?.role||
          currentRevision(next)!==currentRevision(prev)||
          event.type==="removed"){
          previous.current=next;seq.current++;callback();
        }
      }
    }),()=>seq.current,()=>seq.current);
  const current=auth.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY);
  if(!userId||!username)return null;
  if(!first.current||first.current.id!==userId||
    first.current.username!==username||current?.id!==userId||
    current.username!==username||revision!==0){
    return <div role="alert" className="empty-state">
      <p>Сессия изменилась. Откройте профиль заново.</p>
      <RouteLink to="/profile">Мой профиль</RouteLink>
    </div>;
  }
  // Guard each async boundary even before React completes unmount.
  const isSessionCurrent=()=>seq.current===0&&
    auth.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id===userId&&
    auth.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.username===username;
  if(!open&&!routeMode)return <div className="consultations-entry">
    <button type="button" onClick={()=>setOpen(true)}>
      Консультации с кинологом
    </button>
    <p className="note">Доступные специалисты и ваши записи</p>
  </div>;
  return <QueryClientProvider client={privateCache}>
    <div className="consultations-opt-in">
      {routeMode?
        <p><BackButtonLink to="/profile">Вернуться в профиль</BackButtonLink></p>:
        <BackButton type="button"
          onClick={()=>setOpen(false)}>Вернуться в профиль</BackButton>}
      <ConsultationReadOnlyPanel userId={userId} username={username}
        loaders={loaders} now={now}
        bookingMockTransport={bookingMockTransport}
        isSessionCurrent={isSessionCurrent}
        attemptedMockSlots={attempted}
        onAttemptMockSlot={slotId=>{
          const next=new Set([...attempted,slotId]);
          if(routeMode && bookingMockTransport?.fixtureKind==="AG2_BOOKING_SYNTHETIC_ONLY" &&
             isSessionCurrent()) auth.setQueryData(mockAttemptsKey,[...next]);
          setAttempted(next);
        }}
        routeMode={routeMode} routeView={routeView}/>
    </div>
  </QueryClientProvider>;
}
export function ConsultationOptInHarness({enabled,userId,username,
  loaders,now,bookingMockTransport,routeMode=false,routeView=null,
}:{
  enabled:boolean;userId:string|null;username:string|null;
  loaders?:ConsultationsReadLoaders;now?:Date;
  bookingMockTransport?:BookingSourceMockTransport;
  routeMode?:boolean;routeView?:ConsultationRouteView|null;
}){
  if(!enabled)return null;
  return <BoundConsultations
    key={(userId??"unverified")+":"+(username??"")}
    userId={userId} username={username} loaders={loaders} now={now}
    bookingMockTransport={bookingMockTransport}
    routeMode={routeMode} routeView={routeView}/>;
}
