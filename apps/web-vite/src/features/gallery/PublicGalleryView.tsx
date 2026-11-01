import { Loading } from "../../shared/ui";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {useInfiniteQuery,useQuery} from "@tanstack/react-query";
import {RouteLink} from "../../shared/router/location";
import {ApiError} from "../../shared/api/client";
import original from "../../brand/LegacyGallery.module.css";
import parity from "./GalleryAlbumSourceParity.module.css";
import {GalleryImage,GalleryViewerPhoto,nextMediaRefresh,useGallerySwipe} from "./GalleryAlbums";
import {getPublicAlbum,listPublicAlbums,listPublicPhotos,signedGalleryImage,
  type AlbumPhoto} from "./galleryApi";
import {PrimaryButton} from "../../shared/ui";

const safeId=(v:string)=>/^[A-Za-z0-9_-]{1,128}$/.test(v);
const errorText=(error:unknown)=>error instanceof ApiError&&error.status===401?
  "Сессия завершена. Войдите снова.":
  error instanceof ApiError&&(error.status===403||error.status===404)?
    "Открытые альбомы этого пользователя недоступны.":
    "Не удалось загрузить открытые фотоальбомы.";
/** Original Next GalleryAlbums(public username) — ONLY existing Core-filtered
 * visible foreign album/photos; no owner writes, no public signed URLs cache
 * outside gcTime=0 TanStack Query, and never synthetic permission grants. */
export function PublicGalleryView({viewerId,ownerUsername,routeAlbumId,isCurrent}:{
  viewerId:string;ownerUsername:string;routeAlbumId:string|null;isCurrent():boolean;
}) {
  const [selected,setSelected]=useState<string|null>(null);
  const modalRef=useRef<HTMLDivElement|null>(null);
  const closeRef=useRef<HTMLButtonElement|null>(null);
  const triggerRef=useRef<HTMLButtonElement|null>(null);
  const prevRef=useRef<HTMLButtonElement|null>(null);
  const nextRef=useRef<HTMLButtonElement|null>(null);
  const coverRetries=useRef(new Set<string>());
  const thumbnailRetries=useRef(new Set<string>());
  const closeViewer=useCallback(()=>{
    setSelected(null);
    triggerRef.current?.focus();
  },[]);
  const albumReady=routeAlbumId===null;
  const allowed=isCurrent()&&safeId(viewerId)&&safeId(ownerUsername);
  const albums=useInfiniteQuery({
    queryKey:["gallery","public-albums",viewerId,ownerUsername],
    initialPageParam:null as string|null,
    queryFn:async({pageParam})=>{
      const page=await listPublicAlbums(viewerId,ownerUsername,pageParam);
      if(!isCurrent())throw Error("PUBLIC_GALLERY_ACTOR_CHANGED");
      return page;
    },
    getNextPageParam:page=>page.nextCursor??undefined,
    enabled:allowed&&albumReady,retry:false,staleTime:0,gcTime:0,
    refetchInterval:q=>nextMediaRefresh(q.state.data?.pages),
    refetchIntervalInBackground:false,
  });
  const album=useQuery({
    queryKey:["gallery","public-album",viewerId,ownerUsername,routeAlbumId],
    queryFn:async()=>{
      const verified=await getPublicAlbum(routeAlbumId!,viewerId,ownerUsername);
      if(!isCurrent())throw Error("PUBLIC_GALLERY_ACTOR_CHANGED");
      return verified;
    },
    enabled:allowed&&!albumReady&&!!routeAlbumId&&safeId(routeAlbumId),
    retry:false,staleTime:0,gcTime:0,
    refetchInterval:q=>nextMediaRefresh(q.state.data?[{items:[q.state.data]}]:undefined),
    refetchIntervalInBackground:false,
  });
  const confirmed=album.isSuccess&&!album.isFetching&&
    album.data.canEdit===false&&album.data.isVisible===true;
  const photos=useInfiniteQuery({
    queryKey:["gallery","public-photos",viewerId,ownerUsername,routeAlbumId],
    initialPageParam:null as string|null,
    queryFn:async({pageParam})=>{
      const page=await listPublicPhotos(routeAlbumId!,pageParam);
      if(!isCurrent())throw Error("PUBLIC_GALLERY_ACTOR_CHANGED");
      return page;
    },
    getNextPageParam:page=>page.nextCursor??undefined,
    enabled:allowed&&confirmed&&!!routeAlbumId,
    retry:false,staleTime:0,gcTime:0,
    refetchInterval:q=>nextMediaRefresh(q.state.data?.pages),
    refetchIntervalInBackground:false,
  });
  const publicRoot="/profile/albums?username="+encodeURIComponent(ownerUsername);
  const pageReady=albums.isSuccess&&!albums.isFetching;
  const photoReady=confirmed&&photos.isSuccess&&!photos.isFetching;
  const visible=useMemo(()=>photoReady?
    photos.data.pages.flatMap(p=>p.items).filter(p=>
      p.status==="ready"&&signedGalleryImage(p.fullUrl,p.urlsExpireAt)!==null):[],
  [photoReady,photos.data]);
  const chosenIndex=visible.findIndex(p=>p.id===selected);
  const chosen:AlbumPhoto|undefined=chosenIndex<0?undefined:visible[chosenIndex];
  const swipe=useGallerySwipe(delta=>{
    const target=visible[chosenIndex+delta];
    if(target)setSelected(target.id);
  });
  useEffect(()=>{
    if(!chosen)return;
    closeRef.current?.focus();
    const keyboard=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){
        event.preventDefault();closeViewer();
      }else if(event.key==="ArrowRight"&&chosenIndex<visible.length-1){
        event.preventDefault();setSelected(visible[chosenIndex+1].id);
      }else if(event.key==="ArrowLeft"&&chosenIndex>0){
        event.preventDefault();setSelected(visible[chosenIndex-1].id);
      }else if(event.key==="Tab"){
        const controls=[closeRef.current,prevRef.current,nextRef.current]
          .filter((button):button is HTMLButtonElement=>!!button&&!button.disabled);
        if(!controls.length)return;
        const current=controls.indexOf(document.activeElement as HTMLButtonElement);
        const next=current<0?0:(current+(event.shiftKey?controls.length-1:1))%controls.length;
        event.preventDefault();controls[next].focus();
      }
    };
    document.addEventListener("keydown",keyboard);
    return ()=>document.removeEventListener("keydown",keyboard);
  },[chosen,chosenIndex,visible,closeViewer]);
  if(!allowed)return <section role="alert">Сессия изменилась. Откройте альбомы заново.</section>;
  return <section
    className={`${original.surface} ${albumReady ? original.albumsPage :
      `${original.albumDetail} ${parity.detailShell}`} gallery-public-albums next-gallery-albums`}
    aria-label={`Открытые фотоальбомы @${ownerUsername}`}>
    {albumReady ? <>
      <h1>Фотоальбомы @{ownerUsername}</h1>
      <p><RouteLink to="/profile">Мой профиль</RouteLink></p>
      {(albums.isPending||albums.isFetching)&&<Loading message="Загружаем открытые фотоальбомы…" />}
      {albums.isError&&<p role="alert">{errorText(albums.error)}</p>}
      {pageReady&&albums.data.pages.flatMap(p=>p.items).length===0&&
        <p role="status">У пользователя нет открытых фотоальбомов.</p>}
      {pageReady&&<ul className={`${original.grid} gallery-album-grid`}>
        {albums.data.pages.flatMap(p=>p.items).map(item=><li key={item.id}>
          <a href={`/profile/albums/${item.id}?username=${encodeURIComponent(ownerUsername)}`}
            className={`${original.album} gallery-album-card`}>
            <GalleryImage url={item.coverThumbUrl} expires={item.urlsExpireAt}
              alt="" className={original.thumb} emptyLabel="Нет обложки"
              onLoadError={()=>{
                if(!coverRetries.current.has(item.id)){
                  coverRetries.current.add(item.id);void albums.refetch();
                }
              }}/>

            <strong>{item.name}</strong><span>{item.photoCount} фото</span>
          </a>
        </li>)}
      </ul>}
      {pageReady&&albums.hasNextPage&&<button type="button" className="button-secondary"
        disabled={albums.isFetchingNextPage}
        onClick={()=>void albums.fetchNextPage()}>Показать ещё альбомы</button>}
    </> : <>
      {!album.isError&&<a href={publicRoot}
        className={`${original.albumBack} button-secondary`}>Все альбомы</a>}
      {(album.isPending||album.isFetching)&&<Loading message="Проверяем доступ к альбому…" />}
      {album.isError&&<div className="empty-state">
        <h1>Альбом недоступен</h1>
        <p role="alert">{errorText(album.error)}</p>
        <PrimaryButton type="button" onClick={()=>void album.refetch()}>Повторить</PrimaryButton>
        <RouteLink to="/profile">В профиль</RouteLink>
      </div>}
      {confirmed&&<header className={`${original.albumHero} ${parity.scope}`}>
        <div className={original.albumIdentity}>
          <span className={original.albumEyebrow}>Фотоальбом</span>
          <h1>{album.data.name}</h1>
          {album.data.description&&<p className={original.albumDescription}>
            {album.data.description}
          </p>}
          <div className={original.albumMeta}>
            <span>{album.data.photoCount} фото</span>
          </div>
        </div>
      </header>}
      {confirmed&&<section className={original.albumPhotosSection}>
        <div className={original.photosHeading}>
          <div><h2>Фотографии</h2>
            <p className={original.sectionSubtitle}>Все снимки этого альбома в одном месте</p>
          </div>
        </div>
      {(photos.isPending||photos.isFetching)&&confirmed&&
        <Loading message="Загружаем фотографии…" />}
      {photos.isError&&confirmed&&<p role="alert">{errorText(photos.error)}</p>}
      {photoReady&&photos.data.pages.flatMap(p=>p.items).length===0&&
        <p role="status">В альбоме пока нет опубликованных фотографий.</p>}
      {photoReady&&<ul className={`${original.grid} gallery-photo-grid`}>
        {photos.data.pages.flatMap(p=>p.items).map(p=><li key={p.id}>
          <button type="button" onClick={event=>{
            triggerRef.current=event.currentTarget;
            setSelected(p.id);
          }} aria-label={`Открыть фотографию ${p.caption??p.id}`}>
            <GalleryImage url={p.thumbUrl} expires={p.urlsExpireAt}
              alt={p.caption??"Фото в альбоме"}
              onLoadError={()=>{
                if(!thumbnailRetries.current.has(p.id)){
                  thumbnailRetries.current.add(p.id);void photos.refetch();
                }
              }}/>

          </button>
          {p.caption&&<p>{p.caption}</p>}
        </li>)}
      </ul>}
      {photoReady&&photos.hasNextPage&&<button type="button" className="button-secondary"
        disabled={photos.isFetchingNextPage}
        onClick={()=>void photos.fetchNextPage()}>Показать ещё фотографии</button>}
      {photoReady&&chosen&&<div role="dialog" aria-modal="true"
        ref={modalRef} aria-label="Просмотр фотографии" className="gallery-image-viewer"
        onClick={event=>{
          if(event.target===event.currentTarget)closeViewer();
        }}>
        <div className="gallery-image-viewer-inner" {...swipe}>
          <button className="gallery-image-viewer-close" ref={closeRef} type="button"
            aria-label="Закрыть фотографию" title="Закрыть" onClick={closeViewer}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            <span className="gafus-visually-hidden">Закрыть фотографию</span>
          </button>
          <GalleryViewerPhoto key={chosen.id} photo={chosen} albumId={routeAlbumId!}/>
          {chosen.caption&&<p>{chosen.caption}</p>}
          <div className="gallery-image-viewer-actions">
            <button className="gallery-image-viewer-nav" aria-label="Предыдущая фотография" ref={prevRef} type="button" disabled={chosenIndex<=0}
              onClick={()=>setSelected(visible[chosenIndex-1]?.id??null)}><span aria-hidden="true">←</span></button>
            <button className="gallery-image-viewer-nav" aria-label="Следующая фотография" ref={nextRef} type="button" disabled={chosenIndex>=visible.length-1}
              onClick={()=>setSelected(visible[chosenIndex+1]?.id??null)}><span aria-hidden="true">→</span></button>
          </div>
        </div>
      </div>}
      </section>}
    </>}
  </section>;
}
