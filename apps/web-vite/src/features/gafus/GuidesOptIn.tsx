import { Loading } from "../../shared/ui";
import { BackButton, PrimaryButton } from "../../shared/ui";
import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {QueryClient,QueryClientProvider,useQuery,useQueryClient} from
  "@tanstack/react-query";
import type {AuthUser} from "../../shared/auth/authApi";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {navigate} from "../../shared/router/location";
import {projectMiniGuides,projectGuideRead,
  type GuidesSourceMock,type GuideListItem} from "./guidesReadApi";

function GuideListPanel({owner,wire,isCurrent,onClose}:{
  owner:string;wire:GuidesSourceMock;
  isCurrent:()=>boolean;onClose:()=>void;
}){
  const privateCache=useQueryClient();
  const [opened,setOpened]=useState<string|null>(null);
  const list=useQuery({
    queryKey:["guides","owner",owner,"catalog"],
    queryFn:async()=>{
      const value=projectMiniGuides(await wire.list());
      if(!isCurrent())throw Error("STALE_GUIDE_LIST");
      return value;
    },
    retry:false,staleTime:0,gcTime:0,
  });
  const active=list.data?.find(item=>item.courseId===opened&&item.unlocked)??null;
  const content=useQuery({
    queryKey:["guides","owner",owner,"read",active?.courseId],
    queryFn:async()=>{
      if(!active||!active.unlocked||!isCurrent())throw Error("ACCESS_DENIED");
      const result=projectGuideRead(await wire.read(active.courseId),active.courseId);
      if(!isCurrent())throw Error("STALE_GUIDE_CONTENT");
      return result;
    },
    enabled:active!==null,retry:false,staleTime:0,gcTime:0,
  });
  const tryOpen=(item:GuideListItem)=>{
    if(!isCurrent()||!item.unlocked)return;
    setOpened(item.courseId);
  };
  const returnToList=()=>{
    void privateCache.cancelQueries({queryKey:["guides","owner",owner,"read"]});
    privateCache.removeQueries({queryKey:["guides","owner",owner,"read"]});
    setOpened(null);
  };
  if(!isCurrent())return <p role="alert">
    Сессия изменилась. Откройте профиль заново.
  </p>;
  return <section className="guides-panel" aria-label="Мои мини-гайды (макет)">
    <header><h3>Мини-гайды</h3><BackButton type="button"
      onClick={onClose}>Мой профиль</BackButton></header>
    <p className="note">Только чтение синтетических данных.
      Открытие за гафусы и проверки подписки здесь не выполняются.</p>
    {list.isPending&&<Loading message="Загружаем мини-гайды…" />}
    {list.isError&&<div role="alert"><p>Не удалось загрузить мини-гайды.</p>
      <PrimaryButton type="button" onClick={()=>void list.refetch()}>Повторить список</PrimaryButton>
    </div>}
    {list.isSuccess&&list.data.length===0&&
      <p role="status">Мини-гайды пока не опубликованы.</p>}
    {list.isSuccess&&active!==null?<div className="guides-reader">
      <BackButton type="button" onClick={returnToList}>К мини-гайдам</BackButton>
      <h4>{active.title}</h4>
      {content.isPending&&<Loading message="Открываем доступный мини-гайд…" />}
      {content.isError&&<div role="alert">
        <p>Не удалось прочитать мини-гайд. Доступ проверяется сервером.</p>
        <PrimaryButton type="button" onClick={()=>void content.refetch()}>
          Повторить чтение
        </PrimaryButton>
      </div>}
      {content.isSuccess&&<div className="guides-content" aria-label="Содержание мини-гайда">
        {content.data.text||"Содержание пока не опубликовано."}
      </div>}
    </div>:list.isSuccess&&<ul className="guides-grid">
      {list.data.map(item=><li className="compact-card" key={item.courseId}>
        <h4>{item.title}</h4><p>{item.description}</p>
        {item.unlocked?<p className="note">{item.expiresAt
          ? `Доступ до ${new Date(item.expiresAt).toLocaleDateString("ru-RU")}`
          : "Доступно по подписке или действующему открытию"}</p>
          :<p className="note">
            {item.canPurchase?`Цена: ${item.price} гафус`:
              "Открытие пока недоступно"}
          </p>}
        {item.unlocked?<button type="button"
          onClick={()=>tryOpen(item)}>Читать</button>:
          <span className="note">Для открытия требуется доступ</span>}
      </li>)}
    </ul>}
  </section>;
}
function OwnerOnlyGuide({owner,wire,routeMode}:{
  owner:string;wire:GuidesSourceMock;routeMode:boolean;
}){
  const global=useQueryClient();
  const initial=useRef(global.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id??null);
  const epoch=useRef(0);
  const last=useRef(initial.current);
  const version=useSyncExternalStore(callback=>global.getQueryCache().subscribe(event=>{
    if(event.query.queryKey.length===CURRENT_USER_QUERY_KEY.length&&
      event.query.queryKey.every((key:unknown,i:number)=>key===CURRENT_USER_QUERY_KEY[i])){
      const now=global.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id??null;
      if(now!==last.current&&(now!==null||event.type==="removed"||
        event.query.state.data===null)){
        last.current=now;epoch.current++;callback();
      }
    }
  }),()=>epoch.current,()=>epoch.current);
  const [open,setOpen]=useState(routeMode);
  const mounted=useRef(true);
  const [privateCache]=useState(()=>new QueryClient({
    defaultOptions:{queries:{retry:false,staleTime:0,gcTime:0,
      refetchOnWindowFocus:false}},
  }));
  useEffect(()=>{
    mounted.current=true;
    return ()=>{mounted.current=false;
      void privateCache.cancelQueries();privateCache.clear();};
  },[privateCache]);
  const current=()=>mounted.current&&epoch.current===0&&
    global.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id===owner;
  if(initial.current!==owner||version!==0||!current())return <p role="alert">
    Сессия изменилась. Откройте профиль заново.</p>;
  if(!open)return <div className="guides-entry">
    <button type="button" onClick={()=>setOpen(true)}>
      Мини-гайды за гафусы (макет)
    </button>
  </div>;
  return <QueryClientProvider client={privateCache}>
    <GuideListPanel owner={owner} wire={wire} isCurrent={current}
      onClose={()=>{void privateCache.cancelQueries();privateCache.clear();
        if(routeMode)navigate("/profile");else setOpen(false);}}/>
  </QueryClientProvider>;
}
/** WEB-URL-026: explicit source-only route; no real unlock or default cutover. */
export function GuidesOptIn({enabled,ownerId,transport,routeMode=false}:{
  enabled:boolean;ownerId:string;transport?:GuidesSourceMock;
  routeMode?:boolean;
}){
  if(!enabled||!(/^[A-Za-z0-9_-]{1,128}$/).test(ownerId)||
    transport?.fixtureKind!=="AG2_GUIDES_SYNTHETIC_GET_ONLY")return null;
  return <OwnerOnlyGuide key={ownerId+":"+String(routeMode)}
    owner={ownerId} wire={transport} routeMode={routeMode}/>;
}
