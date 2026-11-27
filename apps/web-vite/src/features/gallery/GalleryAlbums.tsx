import { Loading } from "../../shared/ui";
import { useRef, useState } from "react";
import { PrimaryButton } from "../../shared/ui";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import original from "../../brand/LegacyGallery.module.css";
import albumParity from "./GalleryAlbumSourceParity.module.css";
import { RouteLink, galleryAlbumPath, navigate } from "../../shared/router/location";
import { AlbumEditor } from "./GalleryManage";
import { getMyAlbum, listMyAlbums, listMyPhotos, projectOwnerPhotos, signedGalleryImage, type AlbumSummary, type GalleryPage, type AlbumPhoto, type GalleryAlbumCommands } from "./galleryApi";
import { GalleryImage } from "./GalleryImage";
import { nextMediaRefresh, errorCopy } from "./galleryPresentation";
import { AlbumDetail } from "./GalleryAlbumDetail";
/** Next owner API can provide a ready fallback photo even if album metadata
 * has no usable signed cover. Only first visible tiles perform this bounded GET;
 * no image path is guessed, and owner/album shape is checked again. */
function OwnerAlbumCover({
  album,
  userId,
  username,
  getPhotos,
  canRecover,
  revision,
  onLoadError,
}: {
  album: AlbumSummary;
  userId: string;
  username: string;
  getPhotos: (id: string, cursor: string | null) => Promise<GalleryPage<AlbumPhoto>>;
  canRecover: boolean;
  revision: number;
  onLoadError: () => void;
}) {
  const missing = !signedGalleryImage(album.coverThumbUrl, album.urlsExpireAt);
  const recovery = useQuery({
    queryKey: ["gallery", "missing-cover", userId, username, album.id, revision],
    queryFn: async () => projectOwnerPhotos(await getPhotos(album.id, null), album.id),
    // Synthetic transport must not cause an unexpected second read or cross-owner fetch.
    enabled: missing && album.photoCount > 0 && canRecover && getPhotos === listMyPhotos,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const preferred = album.coverPhotoId;
  const options = recovery.data?.items.filter((photo) => photo.status === "ready") ?? [];
  const candidate = options.find((photo) => photo.id === preferred) ?? options[0];
  const candidateUrl = candidate?.thumbUrl ?? null;
  const photoId = missing ? candidate?.id : preferred;
  return (
    <GalleryImage
      url={missing ? candidateUrl : album.coverThumbUrl}
      expires={missing ? (candidate?.urlsExpireAt ?? null) : album.urlsExpireAt}
      photoId={photoId ?? undefined}
      variant="thumb"
      alt=""
      className={`${original.thumb} ${albumParity.catalogThumb}`}
      emptyLabel="Нет обложки"
      onLoadError={onLoadError}
    />
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
  checkCover?: (
    albumId: string,
    ownerId: string,
    username: string,
    photoId: string | null,
  ) => Promise<boolean>;
}) {
  const coverRetries = useRef(new Set<string>());
  const [creating, setCreating] = useState(false);
  const [coverRevision, setCoverRevision] = useState(0);
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
    <section
      className={`${original.surface} ${
        displayedAlbum
          ? `${original.albumDetail} ${albumParity.detailShell}`
          : `${original.albumsPage} ${albumParity.catalogShell}`
      } gallery-albums next-gallery-albums`}
      aria-label="Фотоальбомы"
      data-next-gallery
    >
      {!displayedAlbum && (
        <div className={`${original.header} ${albumParity.catalogHeader} gallery-header`}>
          <div className={albumParity.catalogHeading}>
            <h1>{creating ? "Новый альбом" : "Фотоальбомы"}</h1>
          </div>
          <div className={`${original.actions} ${albumParity.catalogActions}`}>
            {manage && pageReady && page.data!.pages[0]?.enabled && !creating && (
              <PrimaryButton onClick={() => setCreating(true)}>＋ Создать альбом</PrimaryButton>
            )}
            {!creating && pageReady && all.some((a) => a.photoCount > 0 && !a.coverThumbUrl) && (
              <button
                type="button"
                title="Обновить обложки"
                className={albumParity.catalogRefresh}
                aria-label="Обновить обложки"
                onClick={() => {
                  coverRetries.current.clear();
                  setCoverRevision((value) => value + 1);
                  void page.refetch();
                }}
              >
                ↻
              </button>
            )}
          </div>
        </div>
      )}
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
          onDeleted={() => {
            if (routeMode) navigate("/profile/albums");
            else setSelected(null);
            void page.refetch();
          }}
        />
      ) : (
        <>
          {manage && pageReady && page.data!.pages[0]?.enabled && creating && (
            <div className={`${original.albumCreation} ${albumParity.createShell}`}>
              <p className={original.albumCreationHint}>
                Придумайте название и настройте доступ. После создания вы сможете добавить
                фотографии непосредственно в этот альбом.
              </p>
              <AlbumEditor
                actorId={userId}
                username={username}
                sourceCreate={routeMode}
                commands={commands}
                getAlbum={getAlbum}
                onSaved={(id) => {
                  setCreating(false);
                  void page.refetch();
                  if (routeMode) navigate(galleryAlbumPath(id));
                }}
                onCancel={() => setCreating(false)}
              />
            </div>
          )}
          {!creating && (
            <>
              {page.isPending && <Loading message="Загружаем фотоальбомы…" />}
              {page.isFetching && page.data && (
                <Loading variant="compact" message="Перепроверяем фотоальбомы…" />
              )}
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
                  {all.map((album, index) => (
                    <li key={album.id}>
                      {routeMode ? (
                        <RouteLink
                          to={galleryAlbumPath(album.id)}
                          className={`${original.album} ${albumParity.catalogCard} gallery-album-card`}
                        >
                          <span className={albumParity.catalogCover}>
                            <OwnerAlbumCover
                              key={`${album.id}:${coverRevision}`}
                              album={album}
                              userId={userId}
                              username={username}
                              getPhotos={getPhotos}
                              canRecover={index < 6}
                              revision={coverRevision}
                              onLoadError={() => {
                                const key = userId + ":" + album.id;
                                if (!coverRetries.current.has(key)) {
                                  coverRetries.current.add(key);
                                  void page.refetch();
                                }
                              }}
                            />
                          </span>
                          <span className={albumParity.catalogCardInfo}>
                            <strong title={album.name}>{album.name}</strong>
                            <span className={albumParity.catalogCardMeta}>
                              <span>{album.photoCount} фото</span>
                              {!album.isVisible && (
                                <span className={albumParity.catalogPrivate}>
                                  <svg
                                    aria-hidden="true"
                                    width="13"
                                    height="13"
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
                                  Только вы
                                </span>
                              )}
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
                            <OwnerAlbumCover
                              key={`${album.id}:${coverRevision}`}
                              album={album}
                              userId={userId}
                              username={username}
                              getPhotos={getPhotos}
                              canRecover={index < 6}
                              revision={coverRevision}
                              onLoadError={() => {
                                const key = userId + ":" + album.id;
                                if (!coverRetries.current.has(key)) {
                                  coverRetries.current.add(key);
                                  void page.refetch();
                                }
                              }}
                            />
                          </span>
                          <span className={albumParity.catalogCardInfo}>
                            <strong title={album.name}>{album.name}</strong>
                            <span className={albumParity.catalogCardMeta}>
                              <span>{album.photoCount} фото</span>
                              {!album.isVisible && (
                                <span className={albumParity.catalogPrivate}>
                                  <svg
                                    aria-hidden="true"
                                    width="13"
                                    height="13"
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
                                  Только вы
                                </span>
                              )}
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
            </>
          )}
        </>
      )}
    </section>
  );
}
