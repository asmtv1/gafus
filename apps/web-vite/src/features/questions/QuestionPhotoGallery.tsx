import { Loading } from "../../shared/ui";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  fetchQuestionPhotoRenditions,
  type PhotoLocation,
  type QuestionPhotoRendition,
} from "./questionPhotoRead";
import "./QuestionPhotoGallery.css";
import { allowQuestionsS3Fallback } from "./questionPhotoCdnFallback";
import { sameOriginCdnProbeFetch } from "../../shared/api/cdnProbe";

/** A changed discussion/photo owner retires old signed URLs and viewer state. */
export function QuestionPhotoGallery({
  location,
  manual = false,
}: {
  location: PhotoLocation;
  manual?: boolean;
}) {
  if (location.photoIds.length === 0) return null;
  return (
    <PhotoGallery
      key={JSON.stringify([
        location.questionId,
        location.answerId,
        location.rootId,
        location.page,
        location.photoIds,
        manual,
      ])}
      location={location}
      manual={manual}
    />
  );
}

/** VK-style visible media previews. Signed URLs stay in component memory only. */
function PhotoGallery({ location, manual }: { location: PhotoLocation; manual: boolean }) {
  const { questionId, answerId, rootId, page, photoIds } = location;
  const photoKey = photoIds.join(",");
  const holder = useRef<HTMLDivElement>(null);
  const openedBy = useRef<HTMLButtonElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [sources, setSources] = useState<string[]>([]);
  const [details, setDetails] = useState<QuestionPhotoRendition[]>([]);
  const [waiting, setWaiting] = useState(false);
  const [broken, setBroken] = useState<string[]>([]);
  const [s3Fallback, setS3Fallback] = useState<string[]>([]);
  const [previewFallbackUrls, setPreviewFallbackUrls] = useState<Record<string, string>>({});
  const [viewerFallback, setViewerFallback] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewerSources, setViewerSources] = useState<string[]>([]);
  const [viewerDetails, setViewerDetails] = useState<QuestionPhotoRendition[]>([]);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState(false);
  const [viewerRetry, setViewerRetry] = useState(0);
  const viewerOpen = viewerIndex !== null;
  const failed = details.some((item) => item.status === "FAILED");
  const unavailable = details.some((item) => item.status === "UNAVAILABLE");
  const overdue = waiting && retry >= 45;

  useEffect(() => {
    const node = holder.current;
    if (!node || manual) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [manual]);

  useEffect(() => {
    if (!visible) {
      setSources([]);
      setDetails([]);
      setWaiting(false);
      setBroken([]);
      setS3Fallback([]);
      setPreviewFallbackUrls({});
      setError(false);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setSources([]);
    setDetails([]);
    setWaiting(false);
    setBroken([]);
    setS3Fallback([]);
    setPreviewFallbackUrls({});
    setError(false);
    setLoading(true);
    void fetchQuestionPhotoRenditions(
      {
        questionId,
        answerId,
        rootId,
        page,
        photoIds: photoKey.split(","),
      },
      controller.signal,
    )
      .then((items) => {
        if (!controller.signal.aborted) {
          setSources(items.map((item) => item.small));
          setDetails(items);
          setWaiting(
            items.some((item) =>
              ["AWAITING_UPLOAD", "QUEUED", "PROCESSING"].includes(item.status ?? ""),
            ),
          );
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [visible, questionId, answerId, rootId, page, photoKey, retry]);

  // Only pending jobs poll; an image already READY makes zero extra requests.
  // 3 minute maximum. Never show a permanent processing state if a worker is down.
  useEffect(() => {
    if (!visible || !waiting || retry >= 45) return;
    const timer = window.setTimeout(() => setRetry((n) => n + 1), 4000);
    return () => window.clearTimeout(timer);
  }, [visible, waiting, retry]);

  // Fresh authorization and signed URLs for each new fullscreen opening.
  // A failed re-read never reuses an old thumbnail signature in the viewer.
  useEffect(() => {
    if (!viewerOpen) {
      setViewerSources([]);
      setViewerFallback([]);
      setViewerDetails([]);
      setViewerError(false);
      setViewerLoading(false);
      return;
    }
    const controller = new AbortController();
    setViewerSources([]);
    setViewerFallback([]);
    setViewerDetails([]);
    setViewerError(false);
    setViewerLoading(true);
    void fetchQuestionPhotoRenditions(
      {
        questionId,
        answerId,
        rootId,
        page,
        photoIds: photoKey.split(","),
      },
      controller.signal,
    )
      .then((items) => {
        if (!controller.signal.aborted) {
          setViewerSources(items.map((item) => item.medium));
          setViewerDetails(items);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setViewerError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setViewerLoading(false);
      });
    return () => controller.abort();
  }, [viewerOpen, questionId, answerId, rootId, page, photoKey, viewerRetry]);

  useEffect(() => {
    if (!viewerOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setViewerIndex(null);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setViewerIndex((index) => (index === null ? null : (index + 1) % photoIds.length));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setViewerIndex((index) =>
          index === null ? null : (index - 1 + photoIds.length) % photoIds.length,
        );
      } else if (event.key === "Tab") {
        const buttons = Array.from(
          document.querySelectorAll<HTMLButtonElement>(
            ".question-photo-lightbox button:not(:disabled)",
          ),
        );
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      if (openedBy.current?.isConnected) openedBy.current.focus();
    };
  }, [viewerOpen, photoIds.length]);

  const open = (event: MouseEvent<HTMLButtonElement>, index: number) => {
    openedBy.current = event.currentTarget;
    setViewerIndex(index);
  };
  const single = photoIds.length === 1;

  return (
    <div ref={holder} className="question-photo-preview" aria-label="Фотографии">
      {manual && (
        <button
          type="button"
          className="question-photo-manual-toggle"
          aria-expanded={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? "Скрыть фотографии" : `Фотографии · ${photoIds.length}`}
        </button>
      )}
      {(!manual || visible) && (
        <div
          className={`question-photo-preview-grid${single ? "question-photo-preview-single" : ""}`}
        >
          {photoIds.map((id, index) => {
            const src = s3Fallback.includes(id)
              ? (previewFallbackUrls[id] ?? details[index]?.fallbackSmall ?? sources[index])
              : sources[index];
            const isBroken = !!src && broken.includes(src);
            return (
              <div className="question-photo-preview-cell" key={id}>
                {src && !isBroken ? (
                  <button
                    type="button"
                    className="question-photo-preview-tile"
                    onClick={(event) => open(event, index)}
                    aria-label={`Открыть фотографию ${index + 1} из ${photoIds.length}`}
                  >
                    <img
                      src={src}
                      alt={"Фотография " + (index + 1)}
                      srcSet={
                        !s3Fallback.includes(id) &&
                        details[index]?.smallWidth &&
                        details[index]?.width &&
                        details[index]?.medium !== details[index]?.small
                          ? details[index]!.small +
                            " " +
                            details[index]!.smallWidth +
                            "w, " +
                            details[index]!.medium +
                            " " +
                            details[index]!.width +
                            "w"
                          : undefined
                      }
                      sizes="(max-width: 600px) 45vw, 180px"
                      width={details[index]?.smallWidth}
                      height={details[index]?.smallHeight}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={(event) => {
                        if (s3Fallback.includes(id)) {
                          setBroken((current) => [...current, src]);
                          return;
                        }
                        // srcSet can select medium even when src is the small variant.
                        // Probe the URL which actually failed, with its matching S3 key.
                        const failedSrc = event.currentTarget.currentSrc || src;
                        const backup =
                          failedSrc === details[index]?.medium
                            ? details[index]?.fallbackMedium
                            : details[index]?.fallbackSmall;
                        void allowQuestionsS3Fallback(
                          failedSrc,
                          backup,
                          sameOriginCdnProbeFetch,
                        ).then((allowed) => {
                          if (allowed && backup) {
                            // Retain the exact failed srcSet variant: a retina browser
                            // may have loaded medium, not the small src attribute.
                            setPreviewFallbackUrls((current) => ({ ...current, [id]: backup }));
                            setS3Fallback((current) =>
                              current.includes(id) ? current : [...current, id],
                            );
                          } else
                            setBroken((current) =>
                              current.includes(src) ? current : [...current, src],
                            );
                        });
                      }}
                    />
                    {photoIds.length > 1 && (
                      <span className="question-photo-preview-order" aria-hidden="true">
                        {index + 1}/{photoIds.length}
                      </span>
                    )}
                  </button>
                ) : (
                  <div className="question-photo-preview-placeholder" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <path d="m5 17 5-5 4 4 3-3 4 4M8 8h.01" />
                    </svg>
                    <span>
                      {isBroken
                        ? "Не загрузилось"
                        : loading
                          ? "Загрузка…"
                          : error
                            ? "Ошибка загрузки"
                            : details[index]?.status === "FAILED"
                              ? "Ошибка обработки"
                              : details[index]?.status === "UNAVAILABLE"
                                ? "Фото недоступно"
                                : waiting && !src
                                  ? "Обрабатываем фото…"
                                  : "Фото"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {(error || broken.length > 0 || failed || unavailable || overdue) && (
        <div className="question-photo-preview-error" role="alert">
          <span>
            {unavailable
              ? "Фотография из прежнего хранилища недоступна в локальной копии. Для её восстановления нужен исходный файл."
              : failed
                ? "Фото не удалось обработать. Повторное обновление страницы не исправит файл — замените его при редактировании ответа или вопроса."
                : error
                  ? "Не удалось загрузить фотографии."
                  : overdue
                    ? "Обработка фото затянулась. Можно повторно проверить статус, фотографию загружать заново не нужно."
                    : "Некоторые фотографии не загрузились."}
          </span>
          {(error || broken.length > 0 || overdue) && (
            <button
              type="button"
              onClick={() => {
                if (overdue) setRetry(0);
                else setRetry((value) => value + 1);
              }}
            >
              {overdue ? "Проверить статус" : "Повторить загрузку"}
            </button>
          )}
        </div>
      )}
      {viewerIndex !== null &&
        createPortal(
          <div
            className="question-photo-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Просмотр фотографий"
            onClick={(event) => {
              // Content spans the viewport, so checking target === backdrop
              // misses most dark-area clicks. Only the photo and real controls
              // keep the viewer open; any surrounding empty area dismisses it.
              const target = event.target;
              if (
                target instanceof Element &&
                target.closest(".question-photo-lightbox-image, button")
              )
                return;
              setViewerIndex(null);
            }}
          >
            <div className="question-photo-lightbox-content">
              <button
                ref={closeButton}
                type="button"
                className="question-photo-lightbox-close"
                aria-label="Закрыть просмотр"
                onClick={() => setViewerIndex(null)}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
              {viewerLoading && <Loading message="Загружаем фотографию…" />}
              {viewerError && (
                <div role="alert" className="question-photo-lightbox-error">
                  <p>Фотография недоступна. Попробуйте ещё раз.</p>
                  <button type="button" onClick={() => setViewerRetry((value) => value + 1)}>
                    Повторить загрузку
                  </button>
                </div>
              )}
              {!viewerLoading && !viewerError && viewerSources[viewerIndex] && (
                <img
                  className="question-photo-lightbox-image"
                  srcSet={
                    !viewerFallback.includes(photoIds[viewerIndex]) &&
                    viewerDetails[viewerIndex]?.smallWidth &&
                    viewerDetails[viewerIndex]?.width &&
                    viewerDetails[viewerIndex]?.medium !== viewerDetails[viewerIndex]?.small
                      ? viewerDetails[viewerIndex]!.small +
                        " " +
                        viewerDetails[viewerIndex]!.smallWidth +
                        "w, " +
                        viewerDetails[viewerIndex]!.medium +
                        " " +
                        viewerDetails[viewerIndex]!.width +
                        "w"
                      : undefined
                  }
                  sizes="100vw"
                  width={viewerDetails[viewerIndex]?.width}
                  height={viewerDetails[viewerIndex]?.height}
                  src={
                    viewerFallback.includes(photoIds[viewerIndex]) &&
                    viewerDetails[viewerIndex]?.fallbackMedium
                      ? viewerDetails[viewerIndex]!.fallbackMedium
                      : viewerSources[viewerIndex]
                  }
                  alt={`Фотография ${viewerIndex + 1}`}
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    const id = photoIds[viewerIndex];
                    if (viewerFallback.includes(id)) {
                      setViewerError(true);
                      return;
                    }
                    const failedSrc = event.currentTarget.currentSrc || event.currentTarget.src;
                    const backup =
                      failedSrc === viewerDetails[viewerIndex]?.small
                        ? viewerDetails[viewerIndex]?.fallbackSmall
                        : viewerDetails[viewerIndex]?.fallbackMedium;
                    void allowQuestionsS3Fallback(failedSrc, backup, sameOriginCdnProbeFetch).then(
                      (allowed) => {
                        if (allowed)
                          setViewerFallback((current) =>
                            current.includes(id) ? current : [...current, id],
                          );
                        else setViewerError(true);
                      },
                    );
                  }}
                />
              )}
              <div className="question-photo-lightbox-bottom">
                {photoIds.length > 1 && (
                  <button
                    type="button"
                    aria-label="Предыдущая фотография"
                    onClick={() =>
                      setViewerIndex((viewerIndex - 1 + photoIds.length) % photoIds.length)
                    }
                  >
                    <span aria-hidden="true">‹</span>
                  </button>
                )}
                <span>
                  {viewerIndex + 1} из {photoIds.length}
                </span>
                {photoIds.length > 1 && (
                  <button
                    type="button"
                    aria-label="Следующая фотография"
                    onClick={() => setViewerIndex((viewerIndex + 1) % photoIds.length)}
                  >
                    <span aria-hidden="true">›</span>
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
