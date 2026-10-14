"use client";
import { reportClientError } from "@gafus/error-handling";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { useQueryClient } from "@tanstack/react-query";
import { GalleryScope } from "./GalleryScope";
import { galleryApi } from "./api";
import { galleryMessage, useGalleryAlbums } from "./hooks";
import { AlbumForm } from "./AlbumForm";
import {
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  SecondaryButtonLink,
} from "@/shared/components/ui";
import styles from "./Gallery.module.css";
import { AlbumCover } from "./AlbumCover";

function AlbumsContent({ username, preview = false }: { username: string; preview?: boolean }) {
  const { query, albums, info, authenticated, viewerId } = useGalleryAlbums(username, preview);
  const imageRetries = useRef(new Set<string>());
  const cache = useQueryClient();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  if (!authenticated || info?.enabled === false)
    return preview ? null : (
      <main className={styles.surface}>
        <h1>Фотоальбомы</h1>
        <p>Галерея пока недоступна.</p>
      </main>
    );

  return (
    <section
      className={`${styles.surface} ${preview ? styles.preview : styles.albumsPage}`}
      aria-label="Фотоальбомы"
    >
      <div className={styles.header}>
        {preview ? <h2>Фотоальбомы</h2> : <h1>{creating ? "Новый альбом" : "Фотоальбомы"}</h1>}
        {preview && (
          <SecondaryButtonLink href={`/profile/albums?username=${encodeURIComponent(username)}`}>
            Все альбомы
          </SecondaryButtonLink>
        )}
        {!preview && info?.isOwner && !creating && (
          <PrimaryButton
            onClick={() => {
              setError("");
              setCreating(true);
            }}
          >
            <AddRoundedIcon aria-hidden="true" /> Создать альбом
          </PrimaryButton>
        )}
      </div>

      {creating && info?.isOwner ? (
        <div className={styles.albumCreation}>
          <p className={styles.albumCreationHint}>
            Придумайте название и настройте доступ. После создания вы сможете добавить фотографии
            непосредственно в этот альбом.
          </p>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <AlbumForm
            cancel={() => {
              setError("");
              setCreating(false);
            }}
            save={async (input) => {
              setError("");
              try {
                const album = await galleryApi.createAlbum(input);
                void cache.invalidateQueries({ queryKey: ["gallery", viewerId] });
                router.push(`/profile/albums/${encodeURIComponent(album.id)}`);
              } catch (error) {
                reportClientError(error, {
                  issueKey: "Gallery",
                  keys: { operation: "GalleryAlbums" },
                });
                setError(galleryMessage(error));
              }
            }}
          />
        </div>
      ) : (
        <>
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
          {!query.isPending && !query.error && info && !albums.length && (
            <p className={styles.empty}>
              {info.isOwner
                ? "Пока нет альбомов. Создайте первый, чтобы добавить в него фотографии."
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
        </>
      )}
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
