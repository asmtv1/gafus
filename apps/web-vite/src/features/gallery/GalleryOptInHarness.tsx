import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {QueryClient,QueryClientProvider,useQueryClient} from "@tanstack/react-query";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {AuthUser} from "../../shared/auth/authApi";
import {RouteLink} from "../../shared/router/location";
import {GalleryAlbums} from "./GalleryAlbums";
import type {AlbumSummary,AlbumPhoto,GalleryPage} from "./galleryApi";

type Props={
  enabled:boolean;userId:string|null;username:string|null;
  listAlbums?:(id:string,username:string,cursor:string|null)=>
    Promise<GalleryPage<AlbumSummary>>;
  getAlbum?:(id:string,ownerId:string,username:string)=>Promise<AlbumSummary>;
  getPhotos?:(id:string,cursor:string|null)=>Promise<GalleryPage<AlbumPhoto>>;
  routeMode?:boolean;routeAlbumId?:string|null;
};
function PrivateGalleryScope({userId,username,listAlbums,getAlbum,getPhotos,
  routeMode,routeAlbumId}:
  Omit<Props,"enabled">){
  // The app's global Query cache can be persisted in future. Never store
  // short-lived private signed links there: create an isolated private client.
  const [galleryCache]=useState(()=>new QueryClient({
    defaultOptions:{queries:{retry:false,gcTime:0,refetchOnWindowFocus:true}},
  }));
  useEffect(()=>()=>{void galleryCache.cancelQueries();galleryCache.clear();},[
    galleryCache,
  ]);
  const authCache=useQueryClient();
  const initialPrincipal=useRef(
    authCache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)??null,
  );
  const epoch=useRef(0);
  const previous=useRef(initialPrincipal.current);
  const revision=useSyncExternalStore(
    callback=>authCache.getQueryCache().subscribe(event=>{
      if(event.query.queryKey.length===CURRENT_USER_QUERY_KEY.length&&
        event.query.queryKey.every((item:unknown,index:number)=>
          item===CURRENT_USER_QUERY_KEY[index])){
        const next=authCache.getQueryData<AuthUser|null>(
          CURRENT_USER_QUERY_KEY)??null;
        const prev=previous.current;
        const stamp=(user:AuthUser|null)=>
          (user as (AuthUser&{sessionRevision?:unknown})|null)?.sessionRevision;
        if(next?.id!==prev?.id||next?.username!==prev?.username||
          next?.role!==prev?.role||stamp(next)!==stamp(prev)||
          event.type==="removed"){
          previous.current=next;epoch.current++;callback();
        }
      }
    }),
    ()=>epoch.current,
    ()=>epoch.current,
  );
  const actual=authCache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY);
  if(!userId||!username)return null;
  if(!initialPrincipal.current||initialPrincipal.current.id!==userId||
    initialPrincipal.current.username!==username||actual?.id!==userId||
    actual.username!==username||revision!==0){
    return <section className="empty-state" role="alert" aria-label="Фотоальбомы">
      <p>Сессия изменилась. Откройте профиль заново.</p>
      <RouteLink to="/profile">Мой профиль</RouteLink>
    </section>;
  }
  return <QueryClientProvider client={galleryCache}>
    <GalleryAlbums userId={userId} username={username}
      listAlbums={listAlbums} getAlbum={getAlbum} getPhotos={getPhotos}
      routeMode={routeMode} routeAlbumId={routeAlbumId}/>
  </QueryClientProvider>;
}
/** Private QueryClient/signed-media boundary for the original owner album routes. */
export function GalleryOptInHarness({enabled,userId,username,
  listAlbums,getAlbum,getPhotos,routeMode=false,routeAlbumId=null,
}:Props){
  if(!enabled)return null;
  return <PrivateGalleryScope key={(userId??"unverified")+":"+(username??"")}
    userId={userId} username={username}
    listAlbums={listAlbums} getAlbum={getAlbum} getPhotos={getPhotos}
    routeMode={routeMode} routeAlbumId={routeAlbumId}/>;
}
