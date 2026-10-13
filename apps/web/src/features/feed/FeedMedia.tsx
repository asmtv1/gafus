"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeftRounded, ChevronRightRounded, CloseRounded } from "@mui/icons-material";
import type { FeedPostDto } from "@gafus/types";
import { CdnImage } from "@/shared/components/media/CdnImage";
import { FeedVideo } from "./FeedVideo";
import { feedApi } from "./api";
import styles from "./FeedMedia.module.css";

/**
 * Feed: compact, uncropped photo preview. Full-resolution viewer is portalled
 * into body so profile and feed card stacking contexts never offset the modal.
 */
export function FeedMedia({ post }: { post: FeedPostDto }) {
  const [position, setPosition] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const items = post.attachments;
  const index = Math.min(position, items.length - 1);
  const item = items[index];
  const photoUrl = item?.kind === "photo" ? (item.fullUrl ?? item.thumbUrl) : null;
  const total = items.length;

  const move = (delta: number) => {
    if (total > 1) setPosition(value => (value + delta + total) % total);
  };

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (viewerOpen && !dialog.open) dialog.showModal();
    if (!viewerOpen && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [viewerOpen, portalTarget]);

  if (!item) return null;

  const requestFallback = () =>
    feedApi.requestMediaFallback(item.id, item.fullUrl ? "full" : "thumb");

  const counter = "Фото " + (index + 1) + " из " + total;

  return (
    <>
      <div
        className={styles.carousel}
        role="region"
        aria-roledescription="Карусель"
        aria-label="Вложения публикации"
        tabIndex={total > 1 ? 0 : undefined}
        onKeyDown={event => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            move(event.key === "ArrowRight" ? 1 : -1);
          }
        }}
      >
        <div className={styles.frame}>
          {total > 1 && (
            <button
              type="button"
              className={[styles.arrow, styles.arrowPrevious].join(" ")}
              aria-label="Предыдущее вложение"
              onClick={() => move(-1)}
            >
              <ChevronLeftRounded aria-hidden="true" />
            </button>
          )}
          <div className={styles.mediaItem} aria-live="polite">
            {photoUrl ? (
              <button
                type="button"
                className={styles.photoTrigger}
                aria-label={"Увеличить фотографию " + (index + 1)}
                onClick={() => setViewerOpen(true)}
              >
                <CdnImage
                  key={item.id + ":preview"}
                  source={photoUrl}
                  requestFallback={requestFallback}
                  alt={"Фото " + (index + 1) + " из " + total}
                  loading="lazy"
                  className={styles.previewImage}
                />
                <span className={styles.zoomHint}>Увеличить</span>
              </button>
            ) : item.kind === "video" ? (
              <div className={styles.videoPreview}>
                <FeedVideo key={item.id} mediaId={item.id} poster={item.posterUrl} />
              </div>
            ) : (
              <span className={styles.processing}>Файл обрабатывается</span>
            )}
          </div>
          {total > 1 && (
            <button
              type="button"
              className={[styles.arrow, styles.arrowNext].join(" ")}
              aria-label="Следующее вложение"
              onClick={() => move(1)}
            >
              <ChevronRightRounded aria-hidden="true" />
            </button>
          )}
        </div>
        {total > 1 && (
          <div className={styles.pagination} role="status" aria-label={"Вложение " + (index + 1) + " из " + total}>
            {items.map((attachment, dot) => (
              <span
                key={attachment.id}
                aria-hidden="true"
                className={[styles.dot, dot === index ? styles.dotActive : ""].filter(Boolean).join(" ")}
              />
            ))}
          </div>
        )}
      </div>
      {portalTarget && createPortal(
        <dialog
          ref={dialogRef}
          className={styles.viewer}
          aria-label="Просмотр фотографии"
          onClose={() => setViewerOpen(false)}
          onClick={event => {
            if (event.target === event.currentTarget) setViewerOpen(false);
          }}
          onKeyDown={event => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              move(event.key === "ArrowRight" ? 1 : -1);
            }
          }}
        >
          <div className={styles.viewerToolbar}>
            <span className={styles.viewerCounter}>{counter}</span>
            <button
              type="button"
              className={styles.closeButton}
              aria-label="Закрыть просмотр"
              onClick={() => setViewerOpen(false)}
            >
              <CloseRounded aria-hidden="true" />
            </button>
          </div>
          <div className={styles.viewerBody}>
            {photoUrl ? (
              <CdnImage
                key={item.id + ":full"}
                source={photoUrl}
                requestFallback={requestFallback}
                alt={"Фото " + (index + 1) + " из " + total}
                className={styles.viewerImage}
              />
            ) : (
              <span>Видео можно посмотреть в публикации</span>
            )}
          </div>
          {total > 1 && (
            <div className={styles.viewerFooter}>
              <button type="button" className={styles.viewerNav}
                aria-label="Предыдущее фото" onClick={() => move(-1)}>
                <ChevronLeftRounded aria-hidden="true" /> Назад
              </button>
              <span>{index + 1} / {total}</span>
              <button type="button" className={styles.viewerNav}
                aria-label="Следующее фото" onClick={() => move(1)}>
                Далее <ChevronRightRounded aria-hidden="true" />
              </button>
            </div>
          )}
        </dialog>,
        portalTarget,
      )}
    </>
  );
}
