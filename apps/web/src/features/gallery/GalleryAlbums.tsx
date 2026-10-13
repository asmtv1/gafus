"use client";
import { reportClientError } from "@gafus/error-handling";
import { useRef, useState } from "react";
import Link from "next/link";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { useQueryClient } from "@tanstack/react-query";
import { GalleryScope } from "./GalleryScope";
import { galleryApi } from "./api";
import { galleryMessage, useGalleryAlbums } from "./hooks";
import { AlbumForm } from "./AlbumForm";
import { UploadQueue } from "./UploadQueue";
import {
  AppBackButtonLink,
  LoadingState,
  SecondaryButton,
  SecondaryButtonLink,
} from "@/shared/components/ui";
import styles from "./Gallery.module.css";
import { AlbumCover } from "./AlbumCover";

function AlbumsContent({ username, preview = false }: { username: string; preview?: boolean }) {
  const { query, albums, info, authenticated, viewerId } = useGalleryAlbums(username, preview);
  const imageRetries = useRef(new Set<string>());
  const cache = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const changed = () => {
    void cache.invalidateQueries({ queryKey: ["gallery", viewerId] });
  };
  if (!authenticated || info?.enabled === false)
    return preview ? null : (
      <main className={styles.surface}>
        <h1>Фотоальбомы</h1>
        <p>Галерея пока недоступна.</p>
        <AppBackButtonLink href="/profile">В профиль</AppBackButtonLink>
      </main>
    );
  return (
    <section
      className={`${styles.surface} ${preview ? styles.preview : styles.albumsPage}`}
      aria-label="Фотоальбомы"
    >
      {!preview && (
        <div className={styles.albumBack}>
          <AppBackButtonLink href={`/profile?username=${encodeURIComponent(username)}`}>
            В профиль
          </AppBackButtonLink>
        </div>
      )}
      <div className={styles.header}>
        {preview ? <h2>Фотоальбомы</h2> : <h1>Фотоальбомы</h1>}
        {preview && (
          <SecondaryButtonLink href={`/profile/albums?username=${encodeURIComponent(username)}`}>
            Все альбомы
          </SecondaryButtonLink>
        )}
        {!preview && info?.isOwner && (
          <SecondaryButton aria-expanded={creating} onClick={() => setCreating((value) => !value)}>
            <AddRoundedIcon aria-hidden="true" /> Создать альбом
          </SecondaryButton>
        )}
      </div>
      {query.isPending && <LoadingState variant="inline" message="Загрузка альбомов…" />}
      {(query.error || error) && (
        <p role="alert" className={styles.error}>
          {error || galleryMessage(query.error)}{" "}
          <SecondaryButton
            onClick={() => {
              setError("");
              void query.refetch();
            }}
          >
            Повторить
          </SecondaryButton>
        </p>
      )}
      {info?.isOwner && preview && (
        <div className={styles.actions}>
          <SecondaryButton aria-expanded={creating} onClick={() => setCreating((value) => !value)}>
            <AddRoundedIcon aria-hidden="true" /> Создать альбом
          </SecondaryButton>
          <span className={styles.muted}>{info.usedSlots} / 200 фотографий</span>
        </div>
      )}
      {creating && (
        <AlbumForm
          cancel={() => setCreating(false)}
          save={async (input) => {
            try {
              await galleryApi.createAlbum(input);
              setCreating(false);
              changed();
            } catch (error) {
              reportClientError(error, {
                issueKey: "Gallery",
                keys: { operation: "GalleryAlbums" },
              });
              setError(galleryMessage(error));
            }
          }}
        />
      )}
      {info && !albums.length && (
        <p className={styles.empty}>
          {info.isOwner
            ? "Сохраните первые фотографии. Для первой загрузки появится альбом «Фотографии»."
            : "Пока нет доступных фотоальбомов."}
        </p>
      )}
      <div className={styles.grid}>
        {(preview ? albums.slice(0, 4) : albums).map((album) => (
          <Link
            key={album.id}
            href={`/profile/albums/${encodeURIComponent(album.id)}`}
            className={styles.album}
          >
            <AlbumCover
              albumId={album.id}
              coverPhotoId={album.coverDisplayPhotoId ?? album.coverPhotoId}
              url={album.coverThumbUrl}
              onLoadError={(id) => {
                if (!imageRetries.current.has(id)) {
                  imageRetries.current.add(id);
                  void query.refetch();
                }
              }}
            />
            <strong>{album.name}</strong>
            <span className={styles.muted}>
              {album.photoCount} фото{album.canEdit && !album.isVisible ? " · Только вы" : ""}
            </span>
          </Link>
        ))}
      </div>
      {!preview && query.hasNextPage && (
        <div className={styles.actions}>
          <SecondaryButton
            disabled={query.isFetchingNextPage}
            onClick={() => {
              void query.fetchNextPage();
            }}
          >
            Показать ещё альбомы
          </SecondaryButton>
        </div>
      )}
      {info?.isOwner && <UploadQueue usedSlots={info.usedSlots} changed={changed} />}
    </section>
  );
}
export function GalleryAlbums(props: { username: string; preview?: boolean }) {
  return (
    <GalleryScope>
      <AlbumsContent {...props} />
    </GalleryScope>
  );
}
export function GalleryPreview({ username }: { username: string }) {
  return <GalleryAlbums username={username} preview />;
}
