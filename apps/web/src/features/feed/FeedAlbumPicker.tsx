"use client";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { GalleryScope } from "@/features/gallery/GalleryScope";
import { galleryApi } from "@/features/gallery/api";
import { LoadingState } from "@/shared/components/ui";
import styles from "./Feed.module.css";
import { CdnImage } from "@/shared/components/media/CdnImage";

/** Album access is resolved as the authenticated owner, including hidden albums. */
function Picker({ selected, onChange, disabled }: {
  selected: readonly string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const { data: session } = useSession();
  const username = session?.user?.username ?? "";
  const [albumId, setAlbumId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const albums = useInfiniteQuery({
    queryKey: ["feed-gallery", "own-albums", username],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => galleryApi.listAlbums(username, { cursor: pageParam }),
    getNextPageParam: page => page.nextCursor,
    enabled: !!username,
  });
  const photos = useInfiniteQuery({
    queryKey: ["feed-gallery", "photos", albumId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => galleryApi.listPhotos(albumId!, { cursor: pageParam }),
    getNextPageParam: page => page.nextCursor,
    enabled: Boolean(albumId),
  });
  const allAlbums = albums.data?.pages.flatMap(page => page.items) ?? [];
  const allPhotos = photos.data?.pages.flatMap(page => page.items).filter(photo => photo.status === "ready") ?? [];
  const toggle = (id: string) => {
    if (disabled) return;
    if (selected.includes(id)) onChange(selected.filter(value => value !== id));
    else if (selected.length < 10) onChange([...selected, id]);
  };
  return <section className={styles.composeAlbums} aria-label="Выбрать фотографию из своего альбома">
    <button
      type="button"
      className={styles.composeAlbumsToggle}
      aria-expanded={expanded}
      onClick={() => setExpanded(value => !value)}
    >
      <span>Из моих фотоальбомов</span>
      <span className={styles.composeAlbumsCount}>
        {selected.length ? "Выбрано: " + selected.length : "Добавить из альбомов"}
        <span aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
      </span>
    </button>
    {expanded && <div className={styles.composeAlbumsBody}>
    <p className={styles.muted}>При публикации создаётся отдельная копия фотографии, доступная читателям.</p>
    {albums.isPending && <LoadingState variant="inline" message="Загружаем альбомы…" />}
    {albums.isError && <button type="button" className={styles.secondary} onClick={() => void albums.refetch()}>Повторить загрузку альбомов</button>}
    <div className={styles.composeAlbumTabs}>
      {allAlbums.map(album => <button type="button" key={album.id} disabled={disabled}
        className={[styles.composeAlbumTab, albumId === album.id && styles.composeAlbumTabActive]
          .filter(Boolean).join(" ")}
        onClick={() => setAlbumId(album.id)}>{album.name}{album.isVisible ? "" : " · Скрытый"}</button>)}
    </div>
    {albums.hasNextPage && <button type="button" className={styles.secondary}
      disabled={albums.isFetchingNextPage} onClick={() => void albums.fetchNextPage()}>Ещё альбомы</button>}
    {albums.isFetchingNextPage && <LoadingState variant="inline" message="Загружаем альбомы…" />}
    {albumId && <>
      {photos.isPending && <LoadingState variant="inline" message="Загружаем фотографии…" />}
      {photos.isError && <button type="button" className={styles.secondary} onClick={() => void photos.refetch()}>Повторить загрузку фото</button>}
      <div className={styles.composeAlbumGrid}>
        {allPhotos.map(photo => <button type="button" key={photo.id}
          disabled={disabled || (!selected.includes(photo.id) && selected.length >= 10)}
          className={[styles.composeAlbumPhoto, selected.includes(photo.id) && styles.composeAlbumPhotoSelected]
            .filter(Boolean).join(" ")} aria-pressed={selected.includes(photo.id)}
          onClick={() => toggle(photo.id)}>
          {photo.thumbUrl &&
            <CdnImage key={photo.id} source={photo.thumbUrl}
              requestFallback={() => galleryApi.requestMediaFallback(photo.id, "thumb")}
              alt={photo.caption ?? "Фотография альбома"} loading="lazy" />}
          <span>{selected.includes(photo.id) ? "✓ Выбрано" : "Выбрать"}</span>
        </button>)}
      </div>
      {photos.isSuccess && allPhotos.length === 0 && <p>В альбоме нет готовых фотографий.</p>}
      {photos.hasNextPage && <button type="button" className={styles.secondary}
        disabled={photos.isFetchingNextPage} onClick={() => void photos.fetchNextPage()}>Ещё фотографии</button>}
    </>}
    </div>}
  </section>;
}
export function FeedAlbumPicker(props: {
  selected: readonly string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  return <GalleryScope><Picker {...props} /></GalleryScope>;
}
