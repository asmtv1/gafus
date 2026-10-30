import { BackButton } from "../../shared/ui";
import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {QueryClient,QueryClientProvider,useQueryClient} from "@tanstack/react-query";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {AuthUser} from "../../shared/auth/authApi";
import {RouteLink} from "../../shared/router/location";
import {SubscriptionReadPanel} from "./SubscriptionReadPanel";
import type {SubscriptionReadLoader} from "./subscriptionReadMock";

/** Private nonpersistent source-only opt-in, no real GET/payment. */
function Bound({userId,loader}:{
  userId:string|null;loader:SubscriptionReadLoader;
}){
  const outer=useQueryClient();
  const first=useRef(outer.getQueryData<AuthUser|null>(
    CURRENT_USER_QUERY_KEY)?.id??null);
  const [isolated]=useState(()=>new QueryClient({defaultOptions:{
    queries:{retry:false,gcTime:0,refetchOnWindowFocus:false},
  }}));
  useEffect(()=>()=>{void isolated.cancelQueries();isolated.clear();},
    [isolated]);
  const [open,setOpen]=useState(false);
  const epoch=useRef(0);
  const revision=useSyncExternalStore(callback=>
    outer.getQueryCache().subscribe(event=>{
      if(event.query.queryKey.length===CURRENT_USER_QUERY_KEY.length&&
        event.query.queryKey.every((value:unknown,index:number)=>
          value===CURRENT_USER_QUERY_KEY[index])){
        epoch.current++;callback();
      }
    }),()=>epoch.current,()=>epoch.current);
  const current=outer.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY);
  if(!userId)return null;
  if(!first.current||first.current!==userId||
    current?.id!==userId||revision!==0)return <div role="alert">
      <p>Сессия изменилась. Откройте профиль заново.</p>
      <RouteLink to="/profile">Мой профиль</RouteLink>
    </div>;
  if(!open)return <div className="subscription-optin-entry">
    <button type="button" onClick={()=>setOpen(true)}>Моя подписка</button>
    <p className="note">Посмотреть доступ и тарифы</p>
  </div>;
  return <QueryClientProvider client={isolated}>
    <div className="subscription-optin">
      <BackButton type="button"
        onClick={()=>setOpen(false)}>Вернуться в профиль</BackButton>
      <SubscriptionReadPanel userId={userId} loadSnapshot={loader}/>
    </div>
  </QueryClientProvider>;
}
export function SubscriptionOptInHarness({enabled,userId,loadSnapshot}:{
  enabled:boolean;userId:string|null;loadSnapshot?:SubscriptionReadLoader;
}){
  if(!enabled||!loadSnapshot)return null;
  return <Bound key={userId??"unverified"}
    userId={userId} loader={loadSnapshot}/>;
}
