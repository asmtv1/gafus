"use client";
import { reportClientError } from "@gafus/error-handling";
import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { GalleryScope } from "./GalleryScope";
import { galleryApi } from "./api";
import { galleryMessage, useGalleryAlbums } from "./hooks";
import { AlbumForm } from "./AlbumForm";
import { UploadQueue } from "./UploadQueue";
import { LoadingState } from "@/shared/components/ui";
import styles from "./Gallery.module.css";
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
        <Link href="/profile">Вернуться в профиль</Link>
      </main>
    );
  return (
    <section
      className={`${styles.surface} ${preview ? styles.preview : ""}`}
      aria-label="Фотоальбомы"
    >
      {!preview && (
        <Link href={`/profile?username=${encodeURIComponent(username)}`}>Вернуться в профиль</Link>
      )}
      <div className={styles.header}>
        {preview ? <h2>Фотоальбомы</h2> : <h1>Фотоальбомы</h1>}
        {preview && (
          <Link href={`/profile/albums?username=${encodeURIComponent(username)}`}>Все альбомы</Link>
        )}
      </div>
      {query.isPending && <LoadingState variant="inline" size={preview ? "small" : "large"} message="Загрузка альбомов…" />}
      {(query.error || error) && (
        <p role="alert" className={styles.error}>
          {error || galleryMessage(query.error)}{" "}
          <Button
            onClick={() => {
              setError("");
              void query.refetch();
            }}
          >
            Повторить
          </Button>
        </p>
      )}
      {info?.isOwner && (
        <div className={styles.actions}>
          <Button variant="outlined" onClick={() => setCreating((value) => !value)}>
            Создать альбом
          </Button>
          {preview && <span className={styles.muted}>{info.usedSlots} / 200 фотографий</span>}
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
            {album.coverThumbUrl ? (
              <img
                src={album.coverThumbUrl}
                alt=""
                className={styles.thumb}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => {
                  if (!imageRetries.current.has(album.id)) {
                    imageRetries.current.add(album.id);
                    void query.refetch();
                  }
                }}
              />
            ) : (
              <div className={`${styles.thumb} ${styles.placeholder}`}>Нет обложки</div>
            )}
            <strong>{album.name}</strong>
            <span className={styles.muted}>
              {album.photoCount} фото{album.canEdit && !album.isVisible ? " · Только вы" : ""}
            </span>
          </Link>
        ))}
      </div>
      {!preview && query.hasNextPage && (
        <div className={styles.actions}>
          <Button
            disabled={query.isFetchingNextPage}
            onClick={() => {
              void query.fetchNextPage();
            }}
          >
            Показать ещё альбомы
          </Button>
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
