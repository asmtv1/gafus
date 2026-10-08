"use client";
import { reportClientError } from "@gafus/error-handling";
import { useEffect, useRef, useState } from "react";
import { Button, Dialog } from "@mui/material";
import type { GalleryPhotoDto } from "@gafus/types";
import { galleryApi } from "./api";
import { galleryMessage, refreshDelay, useGalleryIdentity } from "./hooks";
import styles from "./Gallery.module.css";
export function PhotoViewer({
  photos,
  selected,
  close,
}: {
  photos: GalleryPhotoDto[];
  selected: string | null;
  close: () => void;
}) {
  const { authenticated, visible } = useGalleryIdentity();
  const [id, setId] = useState(selected);
  const [fresh, setFresh] = useState<GalleryPhotoDto | null>(null);
  const [error, setError] = useState("");
  const retriedUrl = useRef<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const index = photos.findIndex((photo) => photo.id === id);
  const photo = fresh?.id === id ? fresh : photos[index];
  useEffect(() => {
    retriedUrl.current = null;
    setId(selected);
    setFresh(null);
    setError("");
  }, [selected]);
  useEffect(() => {
    if (!authenticated) {
      setFresh(null);
      close();
    }
  }, [authenticated, close]);
  useEffect(() => {
    if (!id || !authenticated || !visible) return;
    let stopped = false;
    setError("");
    void galleryApi
      .getPhoto(id)
      .then((result) => {
        if (!stopped) setFresh(result);
      })
      .catch((error) => {
        reportClientError(error, { issueKey: "Gallery", keys: { operation: "getPhoto" } });
        if (!stopped) setError(galleryMessage(error));
      });
    return () => {
      stopped = true;
    };
  }, [id, refresh, authenticated, visible]);
  useEffect(() => {
    if (!id || !visible || !photo?.urlsExpireAt) return;
    const timer = window.setTimeout(
      () => setRefresh((value) => value + 1),
      refreshDelay([photo.urlsExpireAt]) || 105000,
    );
    return () => clearTimeout(timer);
  }, [id, visible, photo?.urlsExpireAt, refresh]);
  const move = (delta: number) => {
    const next = photos[index + delta];
    if (next) {
      setFresh(null);
      setError("");
      setId(next.id);
    }
  };
  return (
    <Dialog
      className={styles.dialog}
      open={!!selected && authenticated}
      onClose={close}
      maxWidth="lg"
      fullWidth
      aria-label="Просмотр фотографии"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(-1);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          move(1);
        }
      }}
    >
      <div className={styles.viewer}>
        <div className={styles.viewerControls}>
          <span>
            {index + 1} / {photos.length}
          </span>
          <Button autoFocus onClick={close} aria-label="Закрыть просмотр фотографии">
            Закрыть
          </Button>
        </div>
        {error ? (
          <p role="alert">
            {error}
            <Button onClick={() => setRefresh((value) => value + 1)}>Повторить</Button>
          </p>
        ) : photo?.fullUrl ? (
          <img
            className={styles.full}
            src={photo.fullUrl}
            alt={photo.caption || "Фотография из альбома"}
            referrerPolicy="no-referrer"
            onError={() => {
              setError("Не удалось открыть фотографию. Обновите ссылку.");
              if (retriedUrl.current !== photo.id) {
                retriedUrl.current = photo.id;
                setRefresh((value) => value + 1);
              }
            }}
          />
        ) : (
          <p role="status">Загрузка фотографии…</p>
        )}
        {photo?.caption && <p className={styles.caption}>{photo.caption}</p>}
        <div className={styles.viewerControls}>
          <Button disabled={index <= 0} onClick={() => move(-1)} aria-label="Предыдущая фотография">
            Назад
          </Button>
          <Button
            disabled={index >= photos.length - 1}
            onClick={() => move(1)}
            aria-label="Следующая фотография"
          >
            Далее
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
