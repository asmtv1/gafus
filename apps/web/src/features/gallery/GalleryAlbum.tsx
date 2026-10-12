"use client";
import { reportClientError } from "@gafus/error-handling";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GalleryPhotoDto } from "@gafus/types";
import { GalleryScope } from "./GalleryScope";
import { AppBackButtonLink, LoadingState } from "@/shared/components/ui";
import { galleryApi } from "./api";
import { galleryMessage, refreshDelay, useGalleryAlbums, useGalleryIdentity } from "./hooks";
import { AlbumForm } from "./AlbumForm";
import { PhotoViewer } from "./PhotoViewer";
import { UploadQueue } from "./UploadQueue";
import { CdnImage } from "@/shared/components/media/CdnImage";
import styles from "./Gallery.module.css";
function AlbumContent({ albumId }: { albumId: string }) {
  const identity = useGalleryIdentity();
  const imageRetries = useRef(new Set<string>());
  const cache = useQueryClient();
  const router = useRouter();
  const albumQuery = useQuery({
    queryKey: ["gallery", identity.viewerId, "album", albumId],
    queryFn: () => galleryApi.getAlbum(albumId),
    enabled: identity.authenticated,
    gcTime: 0,
    retry: false,
  });
  const album = albumQuery.data;
  const ownAlbums = useGalleryAlbums(album?.canEdit ? album.ownerUsername : "");
  const photosQuery = useInfiniteQuery({
    queryKey: ["gallery", identity.viewerId, album?.ownerUsername, albumId, "photos"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => galleryApi.listPhotos(albumId, { cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: identity.authenticated && !!album,
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => {
      if (!identity.visible) return false;
      const items = query.state.data?.pages.flatMap((page) => page.items) ?? [];
      return items.some((photo) => ["pending", "processing", "moving"].includes(photo.status))
        ? 3000
        : refreshDelay(items.map((photo) => photo.urlsExpireAt));
    },
    refetchIntervalInBackground: false,
  });
  const photos = photosQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const closeViewer = useCallback(() => setSelected(null), []);
  const [editing, setEditing] = useState(false);
  const [choosingCover, setChoosingCover] = useState(false);
  const [editPhoto, setEditPhoto] = useState<GalleryPhotoDto | null>(null);
  const [caption, setCaption] = useState("");
  const [destination, setDestination] = useState("");
  const [confirm, setConfirm] = useState<{ photo?: GalleryPhotoDto } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const changed = useCallback(() => {
    void cache.invalidateQueries({ queryKey: ["gallery", identity.viewerId] });
  }, [cache, identity.viewerId]);
  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      changed();
      return true;
    } catch (error) {
      reportClientError(error, { issueKey: "Gallery", keys: { operation: "GalleryAlbum" } });
      setError(galleryMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!identity.authenticated)
    return (
      <main className={styles.surface}>
        <p>Войдите, чтобы открыть фотоальбом.</p>
      </main>
    );
  if (albumQuery.isPending)
    return (
      <main className={styles.surface}>
        <LoadingState variant="inline" message="Загрузка альбома…" />
      </main>
    );
  if (!album)
    return (
      <main className={styles.surface}>
        <h1>Альбом недоступен</h1>
        <p role="alert">{galleryMessage(albumQuery.error)}</p>
        <Button
          onClick={() => {
            void albumQuery.refetch();
          }}
        >
          Повторить
        </Button>
        <AppBackButtonLink href="/profile">В профиль</AppBackButtonLink>
      </main>
    );
  return (
    <main className={styles.surface}>
      <AppBackButtonLink href={`/profile/albums?username=${encodeURIComponent(album.ownerUsername)}`}>
        Все альбомы
      </AppBackButtonLink>
      <div className={styles.header}>
        <h1>{album.name}</h1>
        {album.canEdit && (
          <Button onClick={() => setEditing((value) => !value)}>Изменить альбом</Button>
        )}
      </div>
      {album.description && <p className={styles.caption}>{album.description}</p>}
      <p className={styles.muted}>
        {album.photoCount} фото{album.canEdit && !album.isVisible ? " · Доступен только вам" : ""}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {editing && album.canEdit && (
        <>
          <AlbumForm
            album={album}
            cancel={() => setEditing(false)}
            save={async (input) => {
              if (await perform(() => galleryApi.updateAlbum(albumId, input))) setEditing(false);
            }}
          />
          <div className={styles.actions}>
            <Button
              disabled={busy}
              onClick={() => {
                void perform(() => galleryApi.setCover(albumId, { photoId: null }));
              }}
            >
              Убрать обложку
            </Button>
            <Button color="error" onClick={() => setConfirm({})}>
              Удалить альбом
            </Button>
          </div>
        </>
      )}
      {album.canEdit && (
        <div className={styles.actions}>
          <Button disabled={busy || !album.photoCount} onClick={() => setChoosingCover((value) => !value)}>
            {choosingCover ? "Отменить выбор обложки" : album.coverPhotoId ? "Изменить обложку" : "Выбрать обложку"}
          </Button>
          {choosingCover && <p role="status">Нажмите на фотографию, чтобы сделать её обложкой.</p>}
          {!album.photoCount && <p className={styles.muted}>Добавьте фотографии, чтобы выбрать обложку.</p>}
        </div>
      )}
      {album.canEdit && (
        <UploadQueue
          albumId={albumId}
          usedSlots={photosQuery.data?.pages[0]?.usedSlots ?? 0}
          changed={changed}
          failedPhotos={photos.filter((photo) => photo.status === "failed")}
        />
      )}
      {photosQuery.isPending && <LoadingState variant="inline" message="Загрузка фотографий…" />}
      {photosQuery.error && (
        <p role="alert" className={styles.error}>
          {galleryMessage(photosQuery.error)}
          <Button
            onClick={() => {
              void photosQuery.refetch();
            }}
          >
            Повторить
          </Button>
        </p>
      )}
      {!photosQuery.isPending && !photosQuery.error && !photos.length && (
        <p className={styles.empty}>В альбоме пока нет фотографий.</p>
      )}
      <div className={styles.grid}>
        {photos.map((photo) => (
          <div key={photo.id}>
            <button
              className={styles.photo}
              disabled={photo.status !== "ready" || (choosingCover && busy)}
              aria-label={`${choosingCover ? "Сделать обложкой фотографию" : "Открыть фотографию"} ${photo.caption || "без подписи"}`}
              onClick={async () => {
                if (choosingCover && album.canEdit) {
                  if (await perform(() => galleryApi.setCover(albumId, { photoId: photo.id }))) setChoosingCover(false);
                } else setSelected(photo.id);
              }}
            >
              {photo.thumbUrl ? (
                <CdnImage
                  source={photo.thumbUrl}
                  requestFallback={() => galleryApi.requestMediaFallback(photo.id, "thumb")}
                  className={styles.thumb}
                  alt={photo.caption || "Фотография"}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => {
                    if (!imageRetries.current.has(photo.id)) {
                      imageRetries.current.add(photo.id);
                      void photosQuery.refetch();
                    }
                  }}
                />
              ) : (
                <div className={`${styles.thumb} ${styles.placeholder}`}>
                  {
                    {
                      pending: "Ожидает обработки",
                      processing: "Обрабатывается…",
                      moving: "Перемещается…",
                      failed: "Не удалось обработать",
                      ready: "Фотография",
                    }[photo.status]
                  }
                </div>
              )}
              {photo.status !== "ready" && (
                <span role="status">
                  {
                    {
                      pending: "Ожидает обработки",
                      processing: "Обрабатывается…",
                      moving: "Перемещается…",
                      failed: "Ошибка обработки",
                    }[photo.status]
                  }
                </span>
              )}
              {photo.caption && <span className={styles.caption}>{photo.caption}</span>}
            </button>
            {album.coverPhotoId === photo.id && <p className={styles.muted}>Обложка альбома</p>}
            {photo.canEdit && (
              <Button
                size="small"
                onClick={() => {
                  setEditPhoto(photo);
                  setCaption(photo.caption ?? "");
                  setDestination("");
                }}
              >
                Управление фото
              </Button>
            )}
          </div>
        ))}
      </div>
      {photosQuery.hasNextPage && (
        <div className={styles.actions}>
          <Button
            disabled={photosQuery.isFetchingNextPage}
            onClick={() => {
              void photosQuery.fetchNextPage();
            }}
          >
            Показать ещё фотографии
          </Button>
        </div>
      )}
      {photosQuery.isFetchingNextPage && <LoadingState variant="inline" message="Загружаем фотографии…" />}
      <PhotoViewer
        photos={photos.filter((photo) => photo.status === "ready")}
        selected={selected}
        close={closeViewer}
      />
      <Dialog
        className={styles.dialog}
        open={!!editPhoto && identity.authenticated}
        onClose={() => setEditPhoto(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Фотография</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            label="Подпись"
            value={caption}
            inputProps={{ maxLength: 2000 }}
            onChange={(e) => setCaption(e.target.value)}
            margin="normal"
          />
          <div className={styles.actions}>
            <Button
              disabled={busy}
              onClick={async () => {
                if (
                  editPhoto &&
                  (await perform(() =>
                    galleryApi.updatePhoto(editPhoto.id, { caption: caption.trim() || null }),
                  ))
                )
                  setEditPhoto(null);
              }}
            >
              Сохранить подпись
            </Button>
            <Button
              disabled={busy || editPhoto?.status !== "ready"}
              onClick={async () => {
                if (
                  editPhoto &&
                  (await perform(() => galleryApi.setCover(albumId, { photoId: editPhoto.id })))
                )
                  setEditPhoto(null);
              }}
            >
              Сделать обложкой
            </Button>
          </div>
          <label htmlFor="gallery-destination">Переместить в альбом</label>
          <select
            id="gallery-destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            style={{ width: "100%", minHeight: 44 }}
          >
            <option value="">Выберите альбом</option>
            {ownAlbums.albums
              .filter((item) => item.id !== albumId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
          {ownAlbums.query.hasNextPage && (
            <Button
              onClick={() => {
                void ownAlbums.query.fetchNextPage();
              }}
            >
              Показать ещё альбомы
            </Button>
          )}
          <div className={styles.actions}>
            <Button
              disabled={busy || !destination || editPhoto?.status !== "ready"}
              onClick={async () => {
                if (
                  editPhoto &&
                  (await perform(() =>
                    galleryApi.movePhoto(editPhoto.id, {
                      albumId: destination,
                      clientRequestId: crypto.randomUUID(),
                    }),
                  ))
                )
                  setEditPhoto(null);
              }}
            >
              Переместить
            </Button>
            <Button
              color="error"
              disabled={busy}
              onClick={() => {
                if (editPhoto) {
                  setConfirm({ photo: editPhoto });
                  setEditPhoto(null);
                }
              }}
            >
              Удалить фото
            </Button>
          </div>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditPhoto(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        className={styles.dialog}
        open={!!confirm && identity.authenticated}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
        aria-labelledby="gallery-delete-title"
      >
        <DialogTitle id="gallery-delete-title">
          {confirm?.photo ? "Удалить фотографию?" : "Удалить альбом?"}
        </DialogTitle>
        <DialogContent>
          {confirm?.photo
            ? "Фотография будет удалена без возможности восстановления."
            : "Все фотографии этого альбома будут удалены без возможности восстановления."}
          {error && <p role="alert">{error}</p>}
        </DialogContent>
        <DialogActions>
          <Button autoFocus disabled={busy} onClick={() => setConfirm(null)}>
            Отмена
          </Button>
          <Button
            color="error"
            disabled={busy}
            onClick={async () => {
              const photo = confirm?.photo;
              if (
                await perform(() =>
                  photo ? galleryApi.deletePhoto(photo.id) : galleryApi.deleteAlbum(albumId),
                )
              ) {
                setConfirm(null);
                if (!photo)
                  router.push(
                    `/profile/albums?username=${encodeURIComponent(album.ownerUsername)}`,
                  );
              }
            }}
          >
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </main>
  );
}

export function GalleryAlbum(props: { albumId: string }) {
  return (
    <GalleryScope>
      <AlbumContent {...props} />
    </GalleryScope>
  );
}
