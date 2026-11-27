import { Loading } from "../../shared/ui";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { PrimaryButton, SecondaryButton } from "../../shared/ui";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import original from "../../brand/LegacyGallery.module.css";
import albumParity from "./GalleryAlbumSourceParity.module.css";
import { RouteLink } from "../../shared/router/location";
import { AlbumDelete, AlbumEditor } from "./GalleryManage";
import { GalleryPhotoActionsDialog } from "./GalleryPhotoActionsDialog";
import { GalleryUploadQueue } from "./GalleryUploadQueue";
import { getMyAlbum, galleryAlbumCommands, galleryCoverAckMatches, verifiedGalleryCover, listMyPhotos, projectOwnerPhotos, signedGalleryImage, type AlbumSummary, type GalleryPage, type AlbumPhoto, type GalleryAlbumCommands } from "./galleryApi";
import { nextMediaRefresh, useGallerySwipe, errorCopy } from "./galleryPresentation";
import { GalleryImage } from "./GalleryImage";
// Keep full-photo ACL and recovery logic out of the grid's initial chunk.
const GalleryViewerPhoto = lazy(() =>
  import("./GalleryViewerPhoto").then(({ GalleryViewerPhoto }) => ({ default: GalleryViewerPhoto })),
);
const photoStatusText: Record<AlbumPhoto["status"], string> = {
  pending: "Ожидает обработки",
  processing: "Обрабатывается…",
  moving: "Перемещается…",
  failed: "Ошибка обработки",
  ready: "Фотография",
};

export function AlbumDetail({
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
  verifyPhotoOnOpen?: boolean;
  commands?: GalleryAlbumCommands;
  onDeleted?: () => void;
  checkCover?: (
    albumId: string,
    ownerId: string,
    username: string,
    photoId: string | null,
  ) => Promise<boolean>;
}) {
  const [editingAlbum, setEditingAlbum] = useState(false);
  const [choosingCover, setChoosingCover] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState("");
  const coverPending = useRef(false);
  // PUT cover is followed by a fresh principal-scoped GET, not an optimistic DOM change.
  // No automatic retry after an unknown ACK: the write may already have committed.
  async function changeCover(photoId: string | null) {
    if (coverPending.current || !album.data?.canEdit) return;
    coverPending.current = true;
    setCoverBusy(true);
    setCoverError("");
    try {
      const response = await (commands ?? galleryAlbumCommands).setCover(albumId, photoId);
      if (
        !galleryCoverAckMatches(response, viewerId, ownerUsername, albumId, photoId) ||
        !(await checkCover(albumId, viewerId, ownerUsername, photoId))
      )
        throw Error("GALLERY_COVER_READBACK_UNKNOWN");
      setChoosingCover(false);
      await album.refetch();
      await photos.refetch();
    } catch {
      setCoverError(
        "Не удалось подтвердить изменение обложки. Проверьте альбом перед повторной попыткой.",
      );
    } finally {
      coverPending.current = false;
      setCoverBusy(false);
    }
  }
  // A cached Query result is not permission for this *mount*. Require a
  // successful owner-scoped GET first, then allow background revalidations to
  // keep the management dialog mounted. Auth-epoch changes invalidate scope.
  const approvedOwnerRead = useRef<{ ownerId: string; username: string; albumId: string } | null>(
    null,
  );
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
      approvedOwnerRead.current = { ownerId: viewerId, username: ownerUsername, albumId };
      return data;
    },
    staleTime: 0,
    retry: false,
    gcTime: 0,
  });
  // Keep verified controls during background GETs, but never expose an
  // initial cached result. On a rejected GET isSuccess becomes false, hiding
  // stale data; a changed owner/album key cannot reuse another scope's proof.
  const albumReady =
    album.isSuccess &&
    approvedOwnerRead.current?.ownerId === viewerId &&
    approvedOwnerRead.current?.username === ownerUsername &&
    approvedOwnerRead.current?.albumId === albumId;
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
    refetchInterval: (q) => (q.state.error ? false : nextMediaRefresh(q.state.data?.pages)),
    refetchIntervalInBackground: false,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [mediaRevision, setMediaRevision] = useState(0);
  const [failedMedia, setFailedMedia] = useState<Set<string>>(new Set());
  const thumbnailRetries = useRef(new Set<string>());
  const photoTrigger = useRef<HTMLButtonElement | null>(null);
  const viewerDialog = useRef<HTMLDivElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const previousButton = useRef<HTMLButtonElement | null>(null);
  const nextButton = useRef<HTMLButtonElement | null>(null);
  // Keep previously owner-verified photo rows mounted during a background
  // photo GET: dropping the grid also drops an in-progress delete/rename dialog.
  // Parent albumReady still gates permission and signedGalleryImage rejects
  // expired media; the first successful owner-scoped page remains mandatory.
  // A failed NEXT page may keep already confirmed earlier pages visible.
  const photoReady = albumReady && (photos.isSuccess || photos.isFetchNextPageError);
  const displayed = photoReady ? photos.data!.pages.flatMap((p) => p.items) : [];
  // Skip pending/failed photos and already expired signed links rather than
  // navigating the fullscreen viewer to an image that cannot be displayed.
  const viewable = displayed.filter(
    (p) => p.status === "ready" && signedGalleryImage(p.fullUrl, p.urlsExpireAt) !== null,
  );
  const viewIndex = viewable.findIndex((p) => p.id === selected);
  const chosen = viewIndex >= 0 ? viewable[viewIndex] : undefined;
  const swipe = useGallerySwipe((delta) => {
    const target = viewable[viewIndex + delta];
    if (target) setSelected(target.id);
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
        const controls = [closeButton.current, previousButton.current, nextButton.current].filter(
          (button): button is HTMLButtonElement => Boolean(button && !button.disabled),
        );
        if (!controls.length) return;
        const active = controls.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          active === -1
            ? 0
            : (active + (event.shiftKey ? controls.length - 1 : 1)) % controls.length;
        event.preventDefault();
        controls[next].focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [selected, chosen, viewIndex, viewable]);
  return (
    <section
      className={`${albumParity.scope} gallery-album-detail`}
      aria-label="Фотографии альбома"
    >
      {!album.isError && (
        <button type="button" className={`${original.albumBack} button-secondary`} onClick={onBack}>
          Все альбомы
        </button>
      )}
      {album.isPending && <Loading message="Загружаем альбом…" />}
      {album.isFetching && album.data && (
        <Loading variant="compact" message="Перепроверяем альбом…" />
      )}
      {album.isError && (
        <div className="empty-state">
          <h1>Альбом недоступен</h1>
          <p role="alert">{errorCopy(album.error)}</p>
          <PrimaryButton type="button" onClick={() => void album.refetch()}>
            Повторить
          </PrimaryButton>
          <RouteLink to="/profile">В профиль</RouteLink>
        </div>
      )}
      {albumReady && (
        <>
          <header className={`${original.albumHero} gallery-detail-heading`}>
            <div className={original.albumIdentity}>
              <span className={original.albumEyebrow}>Фотоальбом</span>
              <h1>{album.data.name}</h1>
              <div className={albumParity.detailOverview}>
                {album.data.description && (
                  <div className={albumParity.detailAbout} aria-label="Описание альбома">
                    <span className={albumParity.detailAboutLabel}>Об альбоме</span>
                    <p>{album.data.description}</p>
                  </div>
                )}
                <dl className={albumParity.detailFacts} aria-label="Информация об альбоме">
                  <div className={albumParity.detailFact}>
                    <dt>
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="4" width="18" height="16" rx="3" />
                        <circle cx="8.5" cy="9" r="1.5" />
                        <path d="m4 17 5-5 4 4 3-3 4 4" />
                      </svg>
                      Фотографии
                    </dt>
                    <dd>{album.data.photoCount} фото</dd>
                  </div>
                  {album.data.canEdit && (
                    <div className={albumParity.detailFact}>
                      <dt>
                        {album.data.isVisible ? (
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7-10-7-10-7Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        ) : (
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect x="5" y="10" width="14" height="11" rx="2" />
                            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                          </svg>
                        )}
                        Кто видит альбом
                      </dt>
                      <dd>{album.data.isVisible ? "Пользователи GAFUS" : "Только вы"}</dd>
                      <small>
                        {album.data.isVisible
                          ? "Доступен после входа в аккаунт"
                          : "Другие пользователи не видят альбом"}
                      </small>
                    </div>
                  )}
                </dl>
              </div>
            </div>
            {manage && album.data.canEdit && (
              <SecondaryButton
                variant={editingAlbum ? "red" : "default"}
                className={original.editAlbumButton}
                aria-expanded={editingAlbum}
                onClick={() => setEditingAlbum((value) => !value)}
              >
                {editingAlbum ? "Закрыть настройки" : "Настройки альбома"}
              </SecondaryButton>
            )}
          </header>
          {manage && album.data.canEdit && editingAlbum && (
            <section className={original.albumEditor} aria-label="Настройки альбома">
              <div className={original.sectionIntro}>
                <h2>Настройки альбома</h2>
                <p>Измените информацию об альбоме и выберите, кто может его видеть.</p>
              </div>
              <AlbumEditor
                key={album.data.id}
                actorId={viewerId}
                username={ownerUsername}
                existing={album.data}
                sourceEdit
                commands={commands}
                getAlbum={getAlbum}
                onSaved={() => {
                  setEditingAlbum(false);
                  void album.refetch();
                  void photos.refetch();
                }}
                onCancel={() => setEditingAlbum(false)}
              />
              <div className={original.albumDangerZone}>
                <div>
                  <h3>Удаление альбома</h3>
                  <p>
                    Альбом и все фотографии из него будут удалены без возможности восстановления.
                  </p>
                </div>
                <AlbumDelete
                  album={album.data}
                  commands={commands}
                  getAlbum={getAlbum}
                  onDeleted={onDeleted ?? onBack}
                />
              </div>
            </section>
          )}
          <section className={original.albumPhotosSection}>
            <div className={original.photosHeading}>
              <div>
                <h2>Фотографии</h2>
                <p className={albumParity.srOnly}>Все снимки этого альбома в одном месте</p>
              </div>
              {manage && album.data.canEdit && (
                <div className={original.photosToolbar}>
                  <SecondaryButton
                    variant={choosingCover ? "red" : "default"}
                    disabled={coverBusy || album.data.photoCount === 0}
                    aria-pressed={choosingCover}
                    onClick={() => setChoosingCover((value) => !value)}
                  >
                    {choosingCover ? "Отменить выбор" : "Выбрать обложку"}
                  </SecondaryButton>
                  {album.data.coverPhotoId && (
                    <SecondaryButton
                      variant="default"
                      type="button"
                      disabled={coverBusy}
                      onClick={() => void changeCover(null)}
                    >
                      Убрать обложку
                    </SecondaryButton>
                  )}
                </div>
              )}
            </div>
            {choosingCover && (
              <div className={original.coverNotice} role="status">
                Выберите фотографию ниже — она станет обложкой альбома.
              </div>
            )}
            {coverError && <p role="alert">{coverError}</p>}
            {manage &&
              album.data.canEdit &&
              photos.isSuccess &&
              photos.data.pages[0]?.enabled === true && (
                <GalleryUploadQueue
                  key={albumId}
                  albumId={albumId}
                  autoUpload
                  usedSlots={photos.data.pages[0].usedSlots}
                  failedPhotos={
                    photoReady ? displayed.filter((photo) => photo.status === "failed") : []
                  }
                  onRefresh={() => {
                    void album.refetch();
                    void photos.refetch();
                  }}
                />
              )}
            {photos.isPending && <Loading message="Загружаем фотографии…" />}
            {photos.isFetching && photos.data && (
              <Loading variant="compact" message="Перепроверяем фотографии…" />
            )}
            {photos.isError && (
              <div role="alert" className="empty-state">
                <p>{errorCopy(photos.error)}</p>
                <PrimaryButton type="button" onClick={() => void photos.refetch()}>
                  Повторить
                </PrimaryButton>
              </div>
            )}
            {(photoReady &&
              displayed.some(
                (photo) =>
                  photo.status === "ready" &&
                  !signedGalleryImage(photo.thumbUrl, photo.urlsExpireAt),
              )) ||
            failedMedia.size > 0 ? (
              <div className={albumParity.mediaRetry} role="status">
                <span>Часть фотографий не загрузилась.</span>
                <button
                  type="button"
                  onClick={() => {
                    thumbnailRetries.current.clear();
                    setFailedMedia(new Set());
                    setMediaRevision((value) => value + 1);
                    void photos.refetch();
                    void album.refetch();
                  }}
                >
                  Обновить изображения
                </button>
              </div>
            ) : null}
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
                        aria-label={
                          (choosingCover ? "Сделать обложкой фотографию " : "Открыть фотографию ") +
                          (photo.caption ?? "без подписи")
                        }
                        disabled={
                          coverBusy ||
                          photo.status !== "ready" ||
                          (!choosingCover && !signedGalleryImage(photo.fullUrl, photo.urlsExpireAt))
                        }
                        onClick={(event) => {
                          if (choosingCover && manage && album.data.canEdit) {
                            void changeCover(photo.id);
                          } else {
                            photoTrigger.current = event.currentTarget;
                            setSelected(photo.id);
                          }
                        }}
                      >
                        <GalleryImage
                          key={`${photo.id}:${mediaRevision}`}
                          url={photo.thumbUrl}
                          expires={photo.urlsExpireAt}
                          photoId={photo.id}
                          variant="thumb"
                          alt={photo.caption ?? "Фото в альбоме"}
                          emptyLabel={
                            photo.status === "ready"
                              ? "Нет миниатюры"
                              : photoStatusText[photo.status]
                          }
                          onLoadError={() => {
                            setFailedMedia((previous) => new Set(previous).add(photo.id));
                            if (!thumbnailRetries.current.has(photo.id)) {
                              thumbnailRetries.current.add(photo.id);
                              void photos.refetch();
                            }
                          }}
                        />
                      </button>
                      {photo.caption && <p>{photo.caption}</p>}
                      {album.data.coverPhotoId === photo.id && (
                        <span className="gallery-cover-tag">Обложка</span>
                      )}
                      {photo.status !== "ready" && (
                        <p role="status" className="note">
                          {photoStatusText[photo.status]}
                        </p>
                      )}
                      {manage && album.data.canEdit && (
                        <GalleryPhotoActionsDialog
                          album={album.data}
                          photo={photo}
                          commands={commands}
                          onChanged={() => {
                            void album.refetch();
                            void photos.refetch();
                          }}
                        />
                      )}
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
                  onClick={(event) => {
                    if (event.target === event.currentTarget) closeViewer();
                  }}
                >
                  <div className="gallery-image-viewer-inner" {...swipe}>
                    <button
                      className="gallery-image-viewer-close"
                      ref={closeButton}
                      type="button"
                      aria-label="Закрыть фотографию"
                      title="Закрыть"
                      onClick={closeViewer}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                        <path
                          d="M5 5l14 14M19 5L5 19"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="gafus-visually-hidden">Закрыть фотографию</span>
                    </button>
                    <Suspense fallback={<Loading />}>
                      <GalleryViewerPhoto
                        key={chosen.id}
                        photo={chosen}
                        albumId={albumId}
                        verifyOnOpen={verifyPhotoOnOpen}
                      />
                    </Suspense>
                    {chosen.caption && <p>{chosen.caption}</p>}
                    <div className="gallery-image-viewer-actions">
                      <button
                        ref={previousButton}
                        type="button"
                        className="gallery-image-viewer-nav"
                        aria-label="Предыдущая фотография"
                        disabled={viewIndex === 0}
                        onClick={() => setSelected(viewable[viewIndex - 1].id)}
                      >
                        <span aria-hidden="true">←</span>
                      </button>
                      <span aria-live="polite">
                        {viewIndex + 1} / {viewable.length}
                      </span>
                      <button
                        ref={nextButton}
                        type="button"
                        className="gallery-image-viewer-nav"
                        aria-label="Следующая фотография"
                        disabled={viewIndex === viewable.length - 1}
                        onClick={() => setSelected(viewable[viewIndex + 1].id)}
                      >
                        <span aria-hidden="true">→</span>
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
