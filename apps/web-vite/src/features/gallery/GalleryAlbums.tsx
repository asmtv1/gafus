import { Loading } from "../../shared/ui";
import { useEffect, useRef, useState, type TouchEvent } from "react";
import {PrimaryButton, SecondaryButton} from "../../shared/ui";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ApiError } from "../../shared/api/client";
import {mediaCdnKindFromSignedUrl,probeCdnOutage}
  from "@gafus/core-client/media-delivery";
import original from "../../brand/LegacyGallery.module.css";
import albumParity from "./GalleryAlbumSourceParity.module.css";
import { RouteLink, galleryAlbumPath, navigate } from "../../shared/router/location";
import {AlbumDelete,AlbumEditor} from "./GalleryManage";
import {GalleryPhotoActionsDialog} from "./GalleryPhotoActionsDialog";
import {GalleryUploadQueue} from "./GalleryUploadQueue";
import {
  getMyAlbum,
  getMyPhoto,
  galleryAlbumCommands,
  galleryCoverAckMatches,
  verifiedGalleryCover,
  listMyAlbums,
  listMyPhotos,
  projectOwnerPhotos,
  requestGalleryMediaFallback,
  signedGalleryImage,
  type AlbumSummary,
  type GalleryPage,
  type AlbumPhoto,
  type GalleryAlbumCommands,
} from "./galleryApi";

const photoStatusText:Record<AlbumPhoto["status"],string>={
  pending:"Ожидает обработки",
  processing:"Обрабатывается…",
  moving:"Перемещается…",
  failed:"Ошибка обработки",
  ready:"Фотография",
};
const errorCopy = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Сессия завершена. Войдите снова.";
    if (error.status === 403) return "Нет доступа к этому альбому.";
    if (error.status === 404) return "Альбом недоступен или удалён.";
  }
  return "Не удалось загрузить фотоальбомы.";
};
export function nextMediaRefresh<T extends { urlsExpireAt: string | null; status?: string }>(
  pages: {items:T[]}[] | undefined,
): number | false {
  const items = pages?.flatMap((p) => p.items);
  // Next periodically checks processing and moving photos even after reload.
  // A page containing no signed URLs must still advance to READY/FAILED.
  if(items?.some(p=>p.status==="pending"||p.status==="processing"||
    p.status==="moving"))return 3000;
  const future = items
    ?.map((p) => (p.urlsExpireAt ? Date.parse(p.urlsExpireAt) : NaN))
    .filter((x) => Number.isFinite(x));
  if (!future?.length) return false;
  // setTimeout accepts only signed 32-bit delay. Without clamping, a
  // far-future expiry wraps to 1ms and floods private Gallery GET requests.
  const untilRefresh = Math.min(...future) - Date.now() - 15_000;
  return Math.max(1000, Math.min(300_000, untilRefresh));
}
/** Verify a CDN 410/5xx for this exact signed media object before requesting
 * a short-lived, authorization-scoped S3 alternative from Hono. Do not use
 * another object's outage circuit to override this object's 403/404. */
async function recoverGalleryImage(source:string,photoId:string,variant:"thumb"|"full"):
Promise<string|null>{
  if(mediaCdnKindFromSignedUrl(source)!=="gallery")return null;
  const outage=await probeCdnOutage(source,{
      timeoutMs:3500,
      fetcher:async(input,init)=>{
        const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;
        return fetch(`/api/v1/media-cdn-probe?url=${encodeURIComponent(url)}`,{
          method:"GET",cache:"no-store",credentials:"same-origin",
          redirect:"error",signal:init?.signal,
        });
      },
    });
  if(!outage)return null;
  try{return await requestGalleryMediaFallback(photoId,variant);}
  catch{return null;}
}
export function GalleryImage({
  url,
  expires,
  alt,
  className,
  emptyLabel = "Нет миниатюры",
  onLoadError,
  photoId,
  variant="thumb",
}: {
  url: string | null;
  expires: string | null;
  alt: string;
  className?: string;
  emptyLabel?: string;
  onLoadError?: () => void;
  photoId?:string;
  variant?:"thumb"|"full";
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const [recovered,setRecovered]=useState<{source:string;url:string}|null>(null);
  // Deduplicate only a request for THIS source. An older image's pending
  // probe must not suppress recovery for a newly selected album/photo.
  const trying=useRef<string|null>(null);
  const current = signedGalleryImage(url, expires);
  const currentSource=useRef(current);
  currentSource.current=current;
  const displayedUrl=current && recovered?.source===current ? recovered.url : current;
  if (!current || broken === current)
    return (
      <span className={`${original.placeholder} ${className??""} gallery-image-placeholder`}
        aria-label="Изображение недоступно">
        <svg className={original.placeholderIcon} aria-hidden="true" viewBox="0 0 24 24"
          width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.7"
          strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="m4 17 5-5 4 4 3-3 4 4M8.5 9h.01"/></svg>
        <span>{emptyLabel}</span>
      </span>
    );
  return (
    <img
      src={displayedUrl ?? undefined}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if(trying.current===current)return;
        if(!photoId||displayedUrl!==current){
          setBroken(current);onLoadError?.();return;
        }
        trying.current=current;
        void recoverGalleryImage(current,photoId,variant)
          .then(next=>{
            if(currentSource.current!==current)return;
            if(next)setRecovered({source:current,url:next});
            else {setBroken(current);onLoadError?.();}
          })
          .catch(()=>{
            if(currentSource.current===current){setBroken(current);onLoadError?.();}
          })
          .finally(()=>{if(trying.current===current)trying.current=null;});
      }}
    />
  );
}
/** Next owner API can provide a ready fallback photo even if album metadata
 * has no usable signed cover. Only first visible tiles perform this bounded GET;
 * no image path is guessed, and owner/album shape is checked again. */
function OwnerAlbumCover({album,userId,username,getPhotos,canRecover,revision,onLoadError}:{
  album:AlbumSummary;userId:string;username:string;
  getPhotos:(id:string,cursor:string|null)=>Promise<GalleryPage<AlbumPhoto>>;
  canRecover:boolean;revision:number;onLoadError:()=>void;
}){
  const missing=!signedGalleryImage(album.coverThumbUrl,album.urlsExpireAt);
  const recovery=useQuery({
    queryKey:["gallery","missing-cover",userId,username,album.id,revision],
    queryFn:async()=>projectOwnerPhotos(await getPhotos(album.id,null),album.id),
    // Synthetic transport must not cause an unexpected second read or cross-owner fetch.
    enabled:missing&&album.photoCount>0&&canRecover&&getPhotos===listMyPhotos,
    retry:false,staleTime:60_000,refetchOnWindowFocus:false,
  });
  const preferred=album.coverPhotoId;
  const options=recovery.data?.items.filter(photo=>photo.status==="ready")??[];
  const candidate=options.find(photo=>photo.id===preferred)??options[0];
  const candidateUrl=candidate?.thumbUrl??candidate?.fullUrl??null;
  const photoId=missing?candidate?.id:preferred;
  return <GalleryImage
    url={missing?candidateUrl:album.coverThumbUrl}
    expires={missing?candidate?.urlsExpireAt??null:album.urlsExpireAt}
    photoId={photoId??undefined}
    variant={missing&&!candidate?.thumbUrl?"full":"thumb"}
    alt="" className={`${original.thumb} ${albumParity.catalogThumb}`}
    emptyLabel="Нет обложки"
    onLoadError={onLoadError}/>;
}

/** Finger swipe on the fullscreen image surface only, never on dialog controls.
 * Long vertical drags, taps and multi-touch gestures must not change photos. */
export function useGallerySwipe(move:(delta:-1|1)=>void){
  const start=useRef<{x:number;y:number}|null>(null);
  return {
    onTouchStart:(event:TouchEvent<HTMLDivElement>)=>{
      const target=event.target;
      if(event.touches.length!==1||
        target instanceof Element&&target.closest("button,a,input,select,textarea")){
        start.current=null;return;
      }
      const point=event.touches[0];
      if(point)start.current={x:point.clientX,y:point.clientY};
    },
    onTouchEnd:(event:TouchEvent<HTMLDivElement>)=>{
      const initial=start.current;
      start.current=null;
      if(!initial||event.changedTouches.length!==1||event.touches.length!==0)return;
      const point=event.changedTouches[0];
      if(!point)return;
      const dx=point.clientX-initial.x;
      const dy=point.clientY-initial.y;
      if(Math.abs(dx)>=56&&Math.abs(dx)>Math.abs(dy)*1.25){
        move(dx<0?1:-1);
      }
    },
    onTouchCancel:()=>{start.current=null;},
  };
}

/** A failed full image is not a successful load. Re-read this exact photo
 * through the owner's Hono ACL once (Next PhotoViewer also refreshes its GET).
 * Never reuse the old signed URL on 401/403/404 or a mismatched photo read.
 * An unconfirmed CDN outage does NOT authorize direct S3 fallback. */
export function GalleryViewerPhoto({photo,albumId,verifyOnOpen=false,readPhoto=getMyPhoto}:{
  photo:AlbumPhoto;albumId:string;verifyOnOpen?:boolean;
  readPhoto?:(id:string,albumId:string)=>Promise<AlbumPhoto>;
}) {
  const [resolved,setResolved]=useState<AlbumPhoto|null>(verifyOnOpen?null:photo);
  const [message,setMessage]=useState<string|null>(null);
  const [checking,setChecking]=useState(verifyOnOpen);
  const attempted=useRef(false);
  const busy=useRef(false);
  const mounted=useRef(true);
  const listUrl=useRef(photo.fullUrl);
  // React StrictMode's mount/cleanup/remount rehearsal must restore liveness.
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  // Gallery polling may renew short-lived media signatures while the viewer
  // stays on the same photo ID. Do not keep the expired initial URL indefinitely.
  useEffect(()=>{
    if(verifyOnOpen||listUrl.current===photo.fullUrl)return;
    listUrl.current=photo.fullUrl;
    attempted.current=false;
    setResolved(photo);
    setMessage(null);
  },[photo,verifyOnOpen]);
  // Original Next PhotoViewer first performs an authorized GET. On a real
  // album route, never materialize the list-provided full URL before that GET.
  useEffect(()=>{
    if(!verifyOnOpen)return;
    let cancelled=false;
    setChecking(true);
    setResolved(null);
    setMessage(null);
    attempted.current=false;
    void readPhoto(photo.id,albumId).then(updated=>{
      if(updated.id!==photo.id||updated.albumId!==albumId||updated.status!=="ready"||
        !signedGalleryImage(updated.fullUrl,updated.urlsExpireAt))
        throw Error("GALLERY_VIEWER_OWNER_READ_MISMATCH");
      if(!cancelled)setResolved(updated);
    }).catch(error=>{
      if(!cancelled)setMessage(error instanceof ApiError&&error.status===401?
        "Сессия завершена. Войдите снова.":
        "Фото недоступно. Проверьте доступ или обновите ссылку.");
    }).finally(()=>{if(!cancelled)setChecking(false);});
    return ()=>{cancelled=true;};
  },[verifyOnOpen,photo.id,photo.fullUrl,albumId,readPhoto]);
  async function refresh(){
    if(busy.current||!mounted.current)return;
    busy.current=true;setChecking(true);
    try{
      const updated=await readPhoto(photo.id,albumId);
      if(updated.id!==photo.id||updated.albumId!==albumId||
        updated.status!=="ready"||!signedGalleryImage(updated.fullUrl,updated.urlsExpireAt))
        throw Error("GALLERY_VIEWER_OWNER_READ_MISMATCH");
      if(!mounted.current)return;
      if(updated.fullUrl===resolved?.fullUrl){
        setMessage("Фотография не загрузилась. Обновите ссылку позже.");
      }else{
        setResolved(updated);
        setMessage(null);
      }
    }catch(error){
      if(mounted.current)setMessage(error instanceof ApiError&&error.status===401?
        "Сессия завершена. Войдите снова.":
        "Фото недоступно. Проверьте доступ или обновите ссылку.");
    }finally{
      busy.current=false;
      if(mounted.current)setChecking(false);
    }
  }
  return <>
    {!message&&resolved&&<GalleryImage url={resolved.fullUrl} expires={resolved.urlsExpireAt}
      alt={resolved.caption??"Фото в альбоме"}
      photoId={resolved.id} variant="full"
      onLoadError={()=>{
        if(attempted.current){setMessage("Фотография не загрузилась. Попробуйте обновить ссылку.");return;}
        attempted.current=true;
        void refresh();
      }}/>}
    {checking&&<Loading variant="compact" message={verifyOnOpen&&!resolved?
      "Загрузка фотографии…":"Обновляем ссылку на фотографию…"} />}
    {message&&<div role="alert"><p>{message}</p>
      <button type="button" className="button-secondary" disabled={checking}
        onClick={()=>void refresh()}>Обновить ссылку</button>
    </div>}
  </>;
}
function AlbumDetail({
  viewerId,
  ownerUsername,
  albumId,
  onBack,
  getAlbum = getMyAlbum,
  getPhotos = listMyPhotos,
  manage = false,
  commands,
  onDeleted,
  checkCover = verifiedGalleryCover,
  verifyPhotoOnOpen = false,
}: {
  viewerId: string;
  ownerUsername: string;
  albumId: string;
  onBack: () => void;
  getAlbum?: (id: string, ownerId: string, username: string) => Promise<AlbumSummary>;
  getPhotos?: (id: string, cursor: string | null) => Promise<GalleryPage<AlbumPhoto>>;
  manage?: boolean;
  verifyPhotoOnOpen?:boolean;
  commands?: GalleryAlbumCommands;
  onDeleted?: () => void;
  checkCover?: (albumId: string, ownerId: string, username: string, photoId: string | null) => Promise<boolean>;
}) {
  const [editingAlbum,setEditingAlbum]=useState(false);
  const [choosingCover,setChoosingCover]=useState(false);
  const [coverBusy,setCoverBusy]=useState(false);
  const [coverError,setCoverError]=useState("");
  const coverPending=useRef(false);
  // PUT cover is followed by a fresh principal-scoped GET, not an optimistic DOM change.
  // No automatic retry after an unknown ACK: the write may already have committed.
  async function changeCover(photoId:string|null){
    if(coverPending.current||!album.data?.canEdit)return;
    coverPending.current=true;
    setCoverBusy(true);
    setCoverError("");
    try{
      const response=await (commands??galleryAlbumCommands).setCover(albumId,photoId);
      if(!galleryCoverAckMatches(response,viewerId,ownerUsername,albumId,photoId)||
        !(await checkCover(albumId,viewerId,ownerUsername,photoId)))
        throw Error("GALLERY_COVER_READBACK_UNKNOWN");
      setChoosingCover(false);
      await album.refetch();
      await photos.refetch();
    }catch{
      setCoverError("Не удалось подтвердить изменение обложки. Проверьте альбом перед повторной попыткой.");
    }finally{
      coverPending.current=false;
      setCoverBusy(false);
    }
  }
  const album = useQuery({
    queryKey: ["gallery", "album", viewerId, ownerUsername, albumId],
    queryFn: async () => {
      const data = await getAlbum(albumId, viewerId, ownerUsername);
      // HTTP projection enforces owner already, but injected read-only
      // synthetic transports MUST meet the same boundary too.
      if (
        data.id !== albumId ||
        data.ownerId !== viewerId ||
        data.ownerUsername !== ownerUsername ||
        data.canEdit !== true
      )
        throw Error("GALLERY_OWNER_OR_SHAPE_MISMATCH");
      return data;
    },
    staleTime: 0,
    retry: false,
    gcTime: 0,
  });
  // Cached owner approval is not current permission for signed photo GETs.
  const albumReady = album.isSuccess && !album.isFetching;
  const photos = useInfiniteQuery({
    queryKey: ["gallery", "photos", viewerId, ownerUsername, albumId],
    initialPageParam: null as string | null,
    // The actual Hono adapter projects photo scope, but injectable read-only
    // transports must pass the same owner/album/shape validation before DOM.
    queryFn: async ({ pageParam }) =>
      projectOwnerPhotos(await getPhotos(albumId, pageParam), albumId),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: albumReady && album.data.canEdit,
    staleTime: 0,
    retry: false,
    gcTime: 0,
    refetchInterval: (q) => q.state.error ? false : nextMediaRefresh(q.state.data?.pages),
    refetchIntervalInBackground: false,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [mediaRevision,setMediaRevision]=useState(0);
  const [failedMedia,setFailedMedia]=useState<Set<string>>(new Set());
  const thumbnailRetries = useRef(new Set<string>());
  const photoTrigger = useRef<HTMLButtonElement | null>(null);
  const viewerDialog = useRef<HTMLDivElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const previousButton = useRef<HTMLButtonElement | null>(null);
  const nextButton = useRef<HTMLButtonElement | null>(null);
  // Even a valid cached signed URL stays out of the DOM during revalidation.
  // A failed NEXT page may keep already confirmed earlier pages visible.
  const photoReady =
    albumReady && !photos.isFetching && (photos.isSuccess || photos.isFetchNextPageError);
  const displayed = photoReady ? photos.data!.pages.flatMap((p) => p.items) : [];
  // Skip pending/failed photos and already expired signed links rather than
  // navigating the fullscreen viewer to an image that cannot be displayed.
  const viewable = displayed.filter((p) =>
    p.status === "ready" && signedGalleryImage(p.fullUrl, p.urlsExpireAt) !== null,
  );
  const viewIndex = viewable.findIndex((p) => p.id === selected);
  const chosen = viewIndex >= 0 ? viewable[viewIndex] : undefined;
  const swipe=useGallerySwipe(delta=>{
    const target=viewable[viewIndex+delta];
    if(target)setSelected(target.id);
  });
  const closeViewer = () => {
    setSelected(null);
    photoTrigger.current?.focus();
  };
  useEffect(() => {
    if (!selected || !chosen) return;
    if (!viewerDialog.current?.contains(document.activeElement)) closeButton.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelected(null);
        photoTrigger.current?.focus();
      } else if (event.key === "ArrowLeft" && viewIndex > 0) {
        event.preventDefault();
        setSelected(viewable[viewIndex - 1].id);
      } else if (event.key === "ArrowRight" && viewIndex < viewable.length - 1) {
        event.preventDefault();
        setSelected(viewable[viewIndex + 1].id);
      } else if (event.key === "Tab") {
        const controls = [closeButton.current, previousButton.current, nextButton.current]
          .filter((button): button is HTMLButtonElement => Boolean(button && !button.disabled));
        if (!controls.length) return;
        const active = controls.indexOf(document.activeElement as HTMLButtonElement);
        const next = active === -1 ? 0 :
          (active + (event.shiftKey ? controls.length - 1 : 1)) % controls.length;
        event.preventDefault();
        controls[next].focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [selected, chosen, viewIndex, viewable]);
  return (
    <section className={`${albumParity.scope} gallery-album-detail`}
      aria-label="Фотографии альбома">
      {!album.isError && <button type="button"
        className={`${original.albumBack} button-secondary`}
        onClick={onBack}>Все альбомы</button>}
      {album.isPending && <Loading message="Загружаем альбом…" />}
      {album.isFetching && album.data && <Loading variant="compact" message="Перепроверяем альбом…" />}
      {album.isError && <div className="empty-state">
        <h1>Альбом недоступен</h1>
        <p role="alert">{errorCopy(album.error)}</p>
        <PrimaryButton type="button" onClick={() => void album.refetch()}>
          Повторить</PrimaryButton>
        <RouteLink to="/profile">В профиль</RouteLink>
      </div>}
      {albumReady && (
        <>
          <header className={`${original.albumHero} gallery-detail-heading`}>
            <div className={original.albumIdentity}>
              <span className={original.albumEyebrow}>Фотоальбом</span>
              <h1>{album.data.name}</h1>
              <div className={albumParity.detailOverview}>
                {album.data.description && <div className={albumParity.detailAbout}
                  aria-label="Описание альбома">
                  <span className={albumParity.detailAboutLabel}>Об альбоме</span>
                  <p>{album.data.description}</p>
                </div>}
                <dl className={albumParity.detailFacts} aria-label="Информация об альбоме">
                  <div className={albumParity.detailFact}>
                    <dt>
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                        strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/>
                        <circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/>
                      </svg>
                      Фотографии
                    </dt>
                    <dd>{album.data.photoCount} фото</dd>
                  </div>
                  {album.data.canEdit && <div className={albumParity.detailFact}>
                    <dt>
                      {album.data.isVisible
                        ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                          strokeLinejoin="round"><path d="M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7-10-7-10-7Z"/>
                          <circle cx="12" cy="12" r="3"/></svg>
                        : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                          strokeLinejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/>
                          <path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>}
                      Кто видит альбом
                    </dt>
                    <dd>{album.data.isVisible ? "Пользователи GAFUS" : "Только вы"}</dd>
                    <small>{album.data.isVisible
                      ? "Доступен после входа в аккаунт"
                      : "Другие пользователи не видят альбом"}</small>
                  </div>}
                </dl>
              </div>
            </div>
            {manage && album.data.canEdit &&
              <SecondaryButton variant={editingAlbum ? "red" : "default"} className={original.editAlbumButton}
                aria-expanded={editingAlbum} onClick={()=>setEditingAlbum(value=>!value)}>
                {editingAlbum?"Закрыть настройки":"Настройки альбома"}
              </SecondaryButton>}
          </header>
          {manage && album.data.canEdit && editingAlbum &&
            <section className={original.albumEditor} aria-label="Настройки альбома">
              <div className={original.sectionIntro}>
                <h2>Настройки альбома</h2>
                <p>Измените информацию об альбоме и выберите, кто может его видеть.</p>
              </div>
              <AlbumEditor key={album.data.id} actorId={viewerId}
                username={ownerUsername} existing={album.data} sourceEdit
                commands={commands} getAlbum={getAlbum}
                onSaved={()=>{setEditingAlbum(false);void album.refetch();void photos.refetch();}}
                onCancel={()=>setEditingAlbum(false)}/>
              <div className={original.albumDangerZone}>
                <div><h3>Удаление альбома</h3>
                  <p>Альбом и все фотографии из него будут удалены без возможности восстановления.</p>
                </div>
                <AlbumDelete album={album.data} commands={commands}
                  getAlbum={getAlbum} onDeleted={onDeleted??onBack}/>
              </div>
            </section>}
          <section className={original.albumPhotosSection}>
            <div className={original.photosHeading}>
              <div><h2>Фотографии</h2>
                <p className={albumParity.srOnly}>Все снимки этого альбома в одном месте</p>
              </div>
              {manage && album.data.canEdit &&
                <div className={original.photosToolbar}>
                  <SecondaryButton variant={choosingCover ? "red" : "default"}
                    disabled={coverBusy||album.data.photoCount===0}
                    aria-pressed={choosingCover}
                    onClick={()=>setChoosingCover(value=>!value)}>
                    {choosingCover?"Отменить выбор":"Выбрать обложку"}
                  </SecondaryButton>
                  {album.data.coverPhotoId &&
                    <SecondaryButton variant="default" type="button"
                      disabled={coverBusy} onClick={()=>void changeCover(null)}>
                      Убрать обложку
                    </SecondaryButton>}
                </div>}
            </div>
            {choosingCover && <div className={original.coverNotice} role="status">
              Выберите фотографию ниже — она станет обложкой альбома.
            </div>}
            {coverError && <p role="alert">{coverError}</p>}
            {manage && album.data.canEdit && photos.isSuccess &&
              photos.data.pages[0]?.enabled === true &&
              <GalleryUploadQueue key={albumId} albumId={albumId} autoUpload
                usedSlots={photos.data.pages[0].usedSlots}
                failedPhotos={photoReady?displayed.filter(photo=>photo.status==="failed"):[]}
                onRefresh={()=>{void album.refetch();void photos.refetch();}}/>}
          {photos.isPending && <Loading message="Загружаем фотографии…" />}
          {photos.isFetching && photos.data && <Loading variant="compact" message="Перепроверяем фотографии…" />}
          {photos.isError && (
            <div role="alert" className="empty-state">
              <p>{errorCopy(photos.error)}</p>
              <PrimaryButton type="button" onClick={() => void photos.refetch()}>
                Повторить
              </PrimaryButton>
            </div>
          )}
          {photoReady && displayed.some(photo=>photo.status==="ready"&&
            !signedGalleryImage(photo.thumbUrl??photo.fullUrl,photo.urlsExpireAt)) ||
            failedMedia.size>0 ?
            <div className={albumParity.mediaRetry} role="status">
              <span>Часть фотографий не загрузилась.</span>
              <button type="button" onClick={()=>{
                thumbnailRetries.current.clear();
                setFailedMedia(new Set());
                setMediaRevision(value=>value+1);
                void photos.refetch();
                void album.refetch();
              }}>Обновить изображения</button>
            </div>:null}
          {photoReady && !photos.data!.pages[0]?.enabled && (
            <p role="status">Галерея пока недоступна.</p>
          )}
          {photoReady && photos.data!.pages[0]?.enabled && displayed.length === 0 && (
            <p className="empty-state" role="status">
              В альбоме пока нет фотографий. Добавьте первые снимки выше.
            </p>
          )}
          {photoReady && photos.data!.pages[0]?.enabled && displayed.length > 0 && (
            <ul className="gallery-photo-grid">
              {displayed.map((photo) => (
                <li key={photo.id}>
                  <article className="gallery-photo-card">
                    <button
                      type="button"
                      aria-label={(choosingCover?"Сделать обложкой фотографию ":"Открыть фотографию ") + (photo.caption ?? "без подписи")}
                      disabled={
                        coverBusy || photo.status !== "ready" ||
                        (!choosingCover && !signedGalleryImage(photo.fullUrl, photo.urlsExpireAt))
                      }
                      onClick={(event) => {
                        if(choosingCover && manage && album.data.canEdit){
                          void changeCover(photo.id);
                        }else{
                          photoTrigger.current = event.currentTarget;
                          setSelected(photo.id);
                        }
                      }}
                    >
                      <GalleryImage
                        key={`${photo.id}:${mediaRevision}`}
                        url={photo.thumbUrl ?? photo.fullUrl}
                        expires={photo.urlsExpireAt}
                        photoId={photo.id} variant={photo.thumbUrl?"thumb":"full"}
                        alt={photo.caption ?? "Фото в альбоме"}
                        emptyLabel={photo.status==="ready"?"Нет миниатюры":photoStatusText[photo.status]}
                        onLoadError={()=>{
                          setFailedMedia(previous=>new Set(previous).add(photo.id));
                          if(!thumbnailRetries.current.has(photo.id)){
                            thumbnailRetries.current.add(photo.id);
                            void photos.refetch();
                          }
                        }}
                      />
                    </button>
                    {photo.caption && <p>{photo.caption}</p>}
                    {album.data.coverPhotoId === photo.id &&
                      <span className="gallery-cover-tag">Обложка</span>}
                    {photo.status !== "ready" && (
                      <p role="status" className="note">{photoStatusText[photo.status]}</p>
                    )}
                    {manage && album.data.canEdit &&
                      <GalleryPhotoActionsDialog album={album.data} photo={photo}
                        commands={commands}
                        onChanged={()=>{void album.refetch();void photos.refetch();}}/>}
                  </article>
                </li>
              ))}
            </ul>
          )}
          {photoReady && photos.hasNextPage && photos.data!.pages[0]?.enabled && (
            <button
              type="button"
              className="button-secondary"
              disabled={photos.isFetchingNextPage}
              onClick={() => void photos.fetchNextPage()}
            >
              {photos.isFetchingNextPage ? "Загружаем…" : "Показать ещё фотографии"}
            </button>
          )}
          {photoReady &&
            selected &&
            chosen &&
            signedGalleryImage(chosen.fullUrl, chosen.urlsExpireAt) && (
              <div
                ref={viewerDialog}
                className="gallery-image-viewer"
                role="dialog"
                aria-modal="true"
                aria-label="Просмотр фотографии"
                onClick={event=>{
                  if(event.target===event.currentTarget)closeViewer();
                }}
              >
                <div className="gallery-image-viewer-inner" {...swipe}>
                  <SecondaryButton variant="red"
                    ref={closeButton}
                    type="button"

                    onClick={closeViewer}
                  >
                    Закрыть фотографию
                  </SecondaryButton>
                  <GalleryViewerPhoto key={chosen.id} photo={chosen} albumId={albumId}
                    verifyOnOpen={verifyPhotoOnOpen}/>
                  {chosen.caption && <p>{chosen.caption}</p>}
                  <div className="gallery-image-viewer-actions">
                    <button
                      ref={previousButton}
                      type="button"
                      className="button-secondary"
                      aria-label="Предыдущая фотография"
                      disabled={viewIndex === 0}
                      onClick={() => setSelected(viewable[viewIndex - 1].id)}
                    >
                      Назад
                    </button>
                    <span aria-live="polite">{viewIndex + 1} / {viewable.length}</span>
                    <button
                      ref={nextButton}
                      type="button"
                      className="button-secondary"
                      aria-label="Следующая фотография"
                      disabled={viewIndex === viewable.length - 1}
                      onClick={() => setSelected(viewable[viewIndex + 1].id)}
                    >
                      Далее
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
/** Original owner gallery: server-verified albums and owner-managed photos.
 * Signed private covers remain volatile; no S3 path guessing or blind writes.
 */
export function GalleryAlbums({
  userId,
  username,
  listAlbums = listMyAlbums,
  getAlbum = getMyAlbum,
  getPhotos = listMyPhotos,
  routeMode = false,
  routeAlbumId = null,
  manage = routeMode,
  commands,
  checkCover,
}: {
  userId: string;
  username: string;
  listAlbums?: (
    id: string,
    username: string,
    cursor: string | null,
  ) => Promise<GalleryPage<AlbumSummary>>;
  getAlbum?: (id: string, ownerId: string, username: string) => Promise<AlbumSummary>;
  getPhotos?: (id: string, cursor: string | null) => Promise<GalleryPage<AlbumPhoto>>;
  routeMode?: boolean;
  routeAlbumId?: string | null;
  manage?: boolean;
  commands?: GalleryAlbumCommands;
  checkCover?: (albumId:string,ownerId:string,username:string,photoId:string|null)=>Promise<boolean>;
}) {
  const coverRetries=useRef(new Set<string>());
  const [creating,setCreating]=useState(false);
  const [coverRevision,setCoverRevision]=useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const displayedAlbum = routeMode ? routeAlbumId : selected;
  const page = useInfiniteQuery({
    queryKey: ["gallery", "albums", userId, username],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const result = await listAlbums(userId, username, pageParam);
      if (
        result.isOwner !== true ||
        result.items.some(
          (a) => a.ownerId !== userId || a.ownerUsername !== username || a.canEdit !== true,
        )
      )
        throw Error("GALLERY_OWNER_OR_SHAPE_MISMATCH");
      return result;
    },
    getNextPageParam: (result) => result.nextCursor ?? undefined,
    enabled: !routeMode || !routeAlbumId,
    staleTime: 0,
    retry: false,
    gcTime: 0,
    refetchInterval: (q) => nextMediaRefresh(q.state.data?.pages),
    refetchIntervalInBackground: false,
  });
  const pageReady = !page.isFetching && (page.isSuccess || page.isFetchNextPageError);
  const all = pageReady ? page.data!.pages.flatMap((p) => p.items) : [];
  return (
    <section className={`${original.surface} ${displayedAlbum
      ? `${original.albumDetail} ${albumParity.detailShell}`
      : `${original.albumsPage} ${albumParity.catalogShell}`} gallery-albums next-gallery-albums`}
      aria-label="Фотоальбомы" data-next-gallery>
      {!displayedAlbum && <div className={`${original.header} ${albumParity.catalogHeader} gallery-header`}>
        <div className={albumParity.catalogHeading}>
          <h1>{creating?"Новый альбом":"Фотоальбомы"}</h1>
        </div>
        <div className={`${original.actions} ${albumParity.catalogActions}`}>
          {manage && pageReady && page.data!.pages[0]?.enabled && !creating &&
            <PrimaryButton onClick={()=>setCreating(true)}>＋ Создать альбом</PrimaryButton>}
          {!creating && pageReady && all.some(a => a.photoCount > 0 && !a.coverThumbUrl) &&
            <button type="button" title="Обновить обложки"
              className={albumParity.catalogRefresh}
              aria-label="Обновить обложки"
              onClick={() => {
                coverRetries.current.clear(); setCoverRevision(value => value + 1);
                void page.refetch();
              }}>↻</button>}
        </div>
      </div>}
      {displayedAlbum ? (
        <AlbumDetail
          key={displayedAlbum}
          albumId={displayedAlbum}
          viewerId={userId}
          ownerUsername={username}
          onBack={() => (routeMode ? navigate("/profile/albums") : setSelected(null))}
          getAlbum={getAlbum}
          getPhotos={getPhotos}
          manage={manage}
          verifyPhotoOnOpen={routeMode}
          commands={commands}
          checkCover={checkCover}
          onDeleted={()=>{
            if(routeMode)navigate("/profile/albums");
            else setSelected(null);
            void page.refetch();
          }}
        />
      ) : (
        <>
          {manage && pageReady && page.data!.pages[0]?.enabled && creating &&
            <div className={`${original.albumCreation} ${albumParity.createShell}`}>
              <p className={original.albumCreationHint}>
                Придумайте название и настройте доступ. После создания вы сможете добавить
                фотографии непосредственно в этот альбом.
              </p>
              <AlbumEditor actorId={userId} username={username}
                sourceCreate={routeMode}
                commands={commands} getAlbum={getAlbum}
                onSaved={(id)=>{setCreating(false);void page.refetch();
                  if(routeMode)navigate(galleryAlbumPath(id));}}
                onCancel={()=>setCreating(false)}/>
            </div>}
          {!creating && <>
          {page.isPending && <Loading message="Загружаем фотоальбомы…" />}
          {page.isFetching && page.data && <Loading variant="compact" message="Перепроверяем фотоальбомы…" />}
          {page.isError && (
            <div role="alert" className="empty-state">
              <p>{errorCopy(page.error)}</p>
              <PrimaryButton type="button" onClick={() => void page.refetch()}>
                Повторить
              </PrimaryButton>
            </div>
          )}
          {pageReady && !page.data!.pages[0]?.enabled && (
            <p role="status">Галерея пока недоступна.</p>
          )}
          {pageReady && page.data!.pages[0]?.enabled && all.length === 0 && (
            <p role="status" className="empty-state">
              {manage
                ? "Пока нет альбомов. Создайте первый, чтобы добавить в него фотографии."
                : "Пока нет доступных фотоальбомов."}
            </p>
          )}
          {pageReady && page.data!.pages[0]?.enabled && all.length > 0 && (
            <ul className={`${original.grid} ${albumParity.catalogGrid} gallery-album-grid`}>
              {all.map((album,index) => (
                <li key={album.id}>
                  {routeMode ? (
                    <RouteLink to={galleryAlbumPath(album.id)} className={`${original.album} ${albumParity.catalogCard} gallery-album-card`}>
                      <span className={albumParity.catalogCover}>
                        <OwnerAlbumCover key={`${album.id}:${coverRevision}`}
                          album={album} userId={userId} username={username}
                          getPhotos={getPhotos} canRecover={index<6} revision={coverRevision}
                          onLoadError={()=>{
                            const key=userId+":"+album.id;
                            if(!coverRetries.current.has(key)){
                              coverRetries.current.add(key);void page.refetch();
                            }
                          }}/>
                      </span>
                      <span className={albumParity.catalogCardInfo}>
                        <strong title={album.name}>{album.name}</strong>
                        <span className={albumParity.catalogCardMeta}>
                          <span>{album.photoCount} фото</span>
                          {!album.isVisible && <span className={albumParity.catalogPrivate}>
                            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24"
                              fill="none" stroke="currentColor" strokeWidth="1.8"
                              strokeLinecap="round" strokeLinejoin="round">
                              <rect x="5" y="10" width="14" height="11" rx="2"/>
                              <path d="M8 10V7a4 4 0 0 1 8 0v3"/>
                            </svg>
                            Только вы
                          </span>}
                        </span>
                      </span>
                    </RouteLink>
                  ) : (
                    <button
                      type="button"
                      className={`${original.album} ${albumParity.catalogCard} gallery-album-card`}
                      onClick={() => setSelected(album.id)}
                      aria-label={"Открыть альбом " + album.name}
                    >
                      <span className={albumParity.catalogCover}>
                        <OwnerAlbumCover key={`${album.id}:${coverRevision}`}
                          album={album} userId={userId} username={username}
                          getPhotos={getPhotos} canRecover={index<6} revision={coverRevision}
                          onLoadError={()=>{
                            const key=userId+":"+album.id;
                            if(!coverRetries.current.has(key)){
                              coverRetries.current.add(key);void page.refetch();
                            }
                          }}/>
                      </span>
                      <span className={albumParity.catalogCardInfo}>
                        <strong title={album.name}>{album.name}</strong>
                        <span className={albumParity.catalogCardMeta}>
                          <span>{album.photoCount} фото</span>
                          {!album.isVisible && <span className={albumParity.catalogPrivate}>
                            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24"
                              fill="none" stroke="currentColor" strokeWidth="1.8"
                              strokeLinecap="round" strokeLinejoin="round">
                              <rect x="5" y="10" width="14" height="11" rx="2"/>
                              <path d="M8 10V7a4 4 0 0 1 8 0v3"/>
                            </svg>
                            Только вы
                          </span>}
                        </span>
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {pageReady && page.hasNextPage && page.data!.pages[0]?.enabled && (
            <button
              type="button"
              className="button-secondary"
              disabled={page.isFetchingNextPage}
              onClick={() => void page.fetchNextPage()}
            >
              {page.isFetchingNextPage ? "Загружаем…" : "Показать ещё альбомы"}
            </button>
          )}
          </>}
        </>
      )}
    </section>
  );
}
