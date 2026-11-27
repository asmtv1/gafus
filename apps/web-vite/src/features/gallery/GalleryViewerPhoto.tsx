import { Loading } from "../../shared/ui";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../shared/api/client";
import { getMyPhoto, signedGalleryImage, type AlbumPhoto } from "./galleryApi";
import { GalleryImage } from "./GalleryImage";
/** A failed full image is not a successful load. Re-read this exact photo
 * through the owner's Hono ACL once (Next PhotoViewer also refreshes its GET).
 * Never reuse the old signed URL on 401/403/404 or a mismatched photo read.
 * An unconfirmed CDN outage does NOT authorize direct S3 fallback. */
export function GalleryViewerPhoto({
  photo,
  albumId,
  verifyOnOpen = false,
  readPhoto = getMyPhoto,
}: {
  photo: AlbumPhoto;
  albumId: string;
  verifyOnOpen?: boolean;
  readPhoto?: (id: string, albumId: string) => Promise<AlbumPhoto>;
}) {
  const [resolved, setResolved] = useState<AlbumPhoto | null>(verifyOnOpen ? null : photo);
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(verifyOnOpen);
  const attempted = useRef(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const listUrl = useRef(photo.fullUrl);
  // React StrictMode's mount/cleanup/remount rehearsal must restore liveness.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Gallery polling may renew short-lived media signatures while the viewer
  // stays on the same photo ID. Do not keep the expired initial URL indefinitely.
  useEffect(() => {
    if (verifyOnOpen || listUrl.current === photo.fullUrl) return;
    listUrl.current = photo.fullUrl;
    attempted.current = false;
    setResolved(photo);
    setMessage(null);
  }, [photo, verifyOnOpen]);
  // Original Next PhotoViewer first performs an authorized GET. On a real
  // album route, never materialize the list-provided full URL before that GET.
  useEffect(() => {
    if (!verifyOnOpen) return;
    let cancelled = false;
    setChecking(true);
    setResolved(null);
    setMessage(null);
    attempted.current = false;
    void readPhoto(photo.id, albumId)
      .then((updated) => {
        if (
          updated.id !== photo.id ||
          updated.albumId !== albumId ||
          updated.status !== "ready" ||
          !signedGalleryImage(updated.fullUrl, updated.urlsExpireAt)
        )
          throw Error("GALLERY_VIEWER_OWNER_READ_MISMATCH");
        if (!cancelled) setResolved(updated);
      })
      .catch((error) => {
        if (!cancelled)
          setMessage(
            error instanceof ApiError && error.status === 401
              ? "Сессия завершена. Войдите снова."
              : "Фото недоступно. Проверьте доступ или обновите ссылку.",
          );
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [verifyOnOpen, photo.id, photo.fullUrl, albumId, readPhoto]);
  async function refresh() {
    if (busy.current || !mounted.current) return;
    busy.current = true;
    setChecking(true);
    try {
      const updated = await readPhoto(photo.id, albumId);
      if (
        updated.id !== photo.id ||
        updated.albumId !== albumId ||
        updated.status !== "ready" ||
        !signedGalleryImage(updated.fullUrl, updated.urlsExpireAt)
      )
        throw Error("GALLERY_VIEWER_OWNER_READ_MISMATCH");
      if (!mounted.current) return;
      if (updated.fullUrl === resolved?.fullUrl) {
        setMessage("Фотография не загрузилась. Обновите ссылку позже.");
      } else {
        setResolved(updated);
        setMessage(null);
      }
    } catch (error) {
      if (mounted.current)
        setMessage(
          error instanceof ApiError && error.status === 401
            ? "Сессия завершена. Войдите снова."
            : "Фото недоступно. Проверьте доступ или обновите ссылку.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setChecking(false);
    }
  }
  return (
    <>
      {!message && resolved && (
        <GalleryImage
          url={resolved.fullUrl}
          expires={resolved.urlsExpireAt}
          alt={resolved.caption ?? "Фото в альбоме"}
          photoId={resolved.id}
          variant="full"
          onLoadError={() => {
            if (attempted.current) {
              setMessage("Фотография не загрузилась. Попробуйте обновить ссылку.");
              return;
            }
            attempted.current = true;
            void refresh();
          }}
        />
      )}
      {checking && (
        <Loading
          variant="compact"
          message={
            verifyOnOpen && !resolved ? "Загрузка фотографии…" : "Обновляем ссылку на фотографию…"
          }
        />
      )}
      {message && (
        <div role="alert">
          <p>{message}</p>
          <button
            type="button"
            className="button-secondary"
            disabled={checking}
            onClick={() => void refresh()}
          >
            Обновить ссылку
          </button>
        </div>
      )}
    </>
  );
}
