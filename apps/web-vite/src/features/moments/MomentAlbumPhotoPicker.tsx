import { Loading } from "../../shared/ui";
import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { FEED_LIMITS } from "@gafus/types";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { ApiError } from "../../shared/api/client";
import type { AuthUser } from "../../shared/auth/authApi";
import { listMyAlbums, listMyPhotos } from "../gallery/galleryApi";
import { canAppendMomentMedia, appendMomentMediaRevision, type MomentEditor } from
  "./momentComposerApi";
import { feedClient } from "./feedClient";
import styles from "./MomentAlbumPhotoPicker.module.css";
import { PrimaryButton, SelectChevron } from "../../shared/ui";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
type Attempt = { fingerprint: string; copyRequestId: string;
  revisionRequestId: string; mediaId: string | null };

type EditorCopyMode = {
  editor: MomentEditor;
  onSaved: (next: MomentEditor) => void;
  selectedPhotoIds?: never;
  onSelectLocal?: never;
};
type BeforeDraftMode = {
  editor?: never;
  onSaved?: never;
  selectedPhotoIds: readonly string[];
  onSelectLocal: (photoId: string) => void;
};
type PickerProps = (EditorCopyMode | BeforeDraftMode) & {
  userId: string;
  onBusy: (busy: boolean) => void;
  disabled?: boolean;
};

/** Owner-only preselection before a draft or Core copy + CAS on an existing draft. */
export function MomentAlbumPhotoPicker(props: PickerProps) {
  const { userId, editor, onBusy, disabled = false } = props;
  const selectedPhotoIds = props.selectedPhotoIds ?? [];
  const cache = useQueryClient();
  const principal = cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY);
  const username = principal?.id === userId ? principal.username : null;
  const [retired, setRetired] = useState(false);
  const allowed = !retired && !!username && ID.test(username) &&
    (editor ? canAppendMomentMedia(editor) : typeof props.onSelectLocal === "function");
  const [albumId, setAlbumId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const flight = useRef(false);
  const attempt = useRef<Attempt | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = cache.getQueryCache().subscribe(event => {
      if (event.query.queryKey.length !== CURRENT_USER_QUERY_KEY.length ||
          !event.query.queryKey.every(
            (part: unknown, i: number) => part === CURRENT_USER_QUERY_KEY[i],
          )) return;
      const next = cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY);
      if (next?.id !== userId || next.username !== username) setRetired(true);
    });
    return () => { mounted.current = false; unsubscribe(); };
  }, [cache, userId, username]);
  const alive = () => !retired && mounted.current &&
    cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id === userId &&
    cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.username === username;

  const albums = useInfiniteQuery({
    queryKey: ["moments", "copy-albums", userId, username],
    queryFn: ({ pageParam }) => listMyAlbums(userId, username!, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: allowed && open, staleTime: 0, retry: false,
  });
  const photos = useInfiniteQuery({
    queryKey: ["moments", "copy-photos", userId, username, albumId],
    queryFn: ({ pageParam }) => listMyPhotos(albumId!, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: allowed && open && !!albumId, staleTime: 0, retry: false,
  });
  const denied = (error: unknown) => error instanceof ApiError &&
    [401, 403, 404].includes(error.status);
  // No private stale pages during revalidation or following owner denial.
  const albumsReady = allowed && !denied(albums.error) &&
    (albums.isSuccess || albums.isFetchNextPageError) &&
    (!albums.isFetching || albums.isFetchingNextPage);
  const photosReady = allowed && !denied(photos.error) &&
    (photos.isSuccess || photos.isFetchNextPageError) &&
    (!photos.isFetching || photos.isFetchingNextPage);
  const allAlbums = albumsReady
    ? albums.data?.pages.flatMap(page => page.items) ?? [] : [];
  const allPhotos = photosReady
    ? photos.data?.pages.flatMap(page => page.items) ?? [] : [];
  const loadMore = (part: "albums" | "photos") => {
    if (!allowed || busy || disabled || !alive()) return;
    const query = part === "albums" ? albums : photos;
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    void query.fetchNextPage({ cancelRefetch: false });
  };
  const select = (photoId: string) => {
    if (!ID.test(photoId) || busy || disabled || flight.current || !allowed ||
        !alive() || !albumId ||
        !allPhotos.some(p => p.id === photoId && p.albumId === albumId &&
          p.status === "ready")) return;
    if (!editor) {
      // Selection stays local; NO copy, reserve or revision before the primary
      // source-style publish action. Core rechecks ownership at copy time.
      if (!selectedPhotoIds.includes(photoId) &&
          selectedPhotoIds.length >= FEED_LIMITS.maxAttachments) return;
      props.onSelectLocal?.(photoId);
      setProblem("");
      setMessage("");
      return;
    }
    flight.current = true;
    setBusy(true);
    setBusyPhoto(photoId);
    setMessage("");
    setProblem("");
    onBusy(true);
    const fingerprint = JSON.stringify([userId, editor.id, editor.version, photoId]);
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
      attempt.current = {
        fingerprint, copyRequestId: crypto.randomUUID(),
        revisionRequestId: crypto.randomUUID(), mediaId: null,
      };
    }
    const current = attempt.current;
    void (async () => {
      try {
        // Copy request id stays identical after ambiguous response; never reserve twice.
        if (!current.mediaId) {
          const copied = await feedClient.copyAlbumPhoto(editor.id, {
            photoId, clientRequestId: current.copyRequestId,
          });
          if (!ID.test(copied?.id ?? "") || copied?.kind !== "photo") throw Error("COPY_ACK_MISMATCH");
          current.mediaId = copied.id;
        }
        const next = await appendMomentMediaRevision({
          editor, mediaId: current.mediaId, clientRequestId: current.revisionRequestId,
        });
        if (!alive()) return;
        attempt.current = null;
        setMessage("Фото из альбома добавлено в черновик.");
        props.onSaved?.(next);
      } catch {
        if (alive()) setProblem(
          "Не удалось подтвердить копирование. Повтор использует тот же запрос.",
        );
      } finally {
        flight.current = false;
        if (mounted.current) {
          setBusy(false);
          setBusyPhoto(null);
          onBusy(false);
        }
      }
    })();
  };
  if (!allowed) return null;
  const linked = editor?.pendingRevision?.attachmentIds.length ?? selectedPhotoIds.length;
  return <section className={styles.composeAlbums} aria-label="Фото из альбомов">
    <button type="button" className={styles.composeAlbumsToggle}
      aria-expanded={open} disabled={busy || disabled}
      onClick={() => setOpen(value => !value)}>
      <span>Из моих фотоальбомов</span>
      <span className={styles.composeAlbumsCount}>
        {selectedPhotoIds.length ? `Выбрано: ${selectedPhotoIds.length}` : "Добавить из альбомов"}
        <SelectChevron expanded={open} />
      </span>
    </button>
    {open && <div className={styles.composeAlbumsBody}>
    <p>Можно добавить готовые фотографии, до {FEED_LIMITS.maxAttachments} вложений
      на публикацию. Сейчас: {linked}.</p>
    {albums.isPending && <Loading message="Загружаем альбомы…" />}
    {albums.isError && <p role="alert">Не удалось загрузить ваши альбомы.
      <PrimaryButton type="button" onClick={() => void albums.refetch()}>Повторить</PrimaryButton></p>}
    {albums.isSuccess && allAlbums.length === 0 && <p>Нет альбомов с фотографиями.</p>}
    <div className={styles.composeAlbumTabs} role="group" aria-label="Выбрать альбом">
      {allAlbums.map(album => <button key={album.id} type="button"
        className={albumId === album.id
          ? styles.composeAlbumTab + " " + styles.composeAlbumTabActive
          : styles.composeAlbumTab}
        disabled={busy || disabled}
        aria-pressed={albumId === album.id}
        onClick={() => { setAlbumId(album.id); setProblem(""); setMessage(""); }}>
        {album.name}{album.isVisible ? "" : " · Скрытый"}
      </button>)}
    </div>
    {albums.hasNextPage && <button type="button" disabled={busy || disabled ||
      albums.isFetchingNextPage} onClick={() => loadMore("albums")}>
      Ещё альбомы</button>}
    {albumId && <>
      {photos.isPending && <Loading message="Загружаем фотографии…" />}
      {photos.isError && <p role="alert">Не удалось загрузить фотографии.
        <PrimaryButton type="button" onClick={() => void photos.refetch()}>Повторить</PrimaryButton></p>}
      <div className={styles.composeAlbumGrid}>
        {allPhotos.filter(p => p.status === "ready").map(photo =>
          <button key={photo.id} type="button"
            className={styles.composeAlbumPhoto}
            disabled={busy || disabled || !alive()}
            onClick={() => select(photo.id)}>
            {photo.thumbUrl && <img src={photo.thumbUrl} alt={photo.caption ?? "Фото альбома"}
              loading="lazy" referrerPolicy="no-referrer" />}
            <span>{busyPhoto === photo.id ? "Копируем…" : !editor && selectedPhotoIds.includes(photo.id)
              ? "✓ Выбрано" : !editor ? "Выбрать" : "Добавить фото"}</span>
          </button>)}
      </div>
      {photos.isSuccess && allPhotos.every(p => p.status !== "ready") &&
        <p>В этом альбоме пока нет готовых фото.</p>}
      {photos.hasNextPage && <button type="button" disabled={busy || disabled ||
        photos.isFetchingNextPage} onClick={() => loadMore("photos")}>
        Ещё фотографии</button>}
    </>}
    {problem && <p role="alert">{problem}</p>}
    {message && <p role="status">{message}</p>}
    </div>}
  </section>;
}
