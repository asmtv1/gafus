import { MeasuredVideo } from "../../shared/media/MeasuredVideo";
import { sameOriginCdnProbeFetch } from "../../shared/api/cdnProbe";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { chat2Api, type Chat2Attachment } from "./chat2Api";
import css from "./Chat2Messenger.module.css";
import { VideoQualitySettings } from "../../shared/media/VideoQualitySettings";
import { webMp4Hints, observeWebMp4Start, savedWebMp4Mode, saveWebMp4Mode } from "../../shared/media/videoPlaybackPolicy";
import { reportWebVideoStarted } from "../../shared/media/videoQualityTelemetry";
import { videoServerFailureMessage } from "../../shared/media/videoRetryMessage";
import { chat2ImageSource, chat2VideoSource, chat2HasVideoQuality, chat2MatchedS3Variant, chat2CdnS3FailoverAllowed, type Chat2QualityMode, type Chat2MediaRenditions, type Chat2VideoHints } from "@gafus/chat-media-quality";
/** Access to the message is checked by Chat API before it returns any media URL.
 * Only real encoder renditions from the backend can enable quality controls. */
export function Chat2StoredMedia({ chatId, file }: { chatId: string; file: Chat2Attachment }) {
  type MediaResponse = Awaited<ReturnType<typeof chat2Api.mediaUrl>>;
  const [media, setMedia] = useState<MediaResponse | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [quality, setQuality] = useState<Chat2QualityMode>(savedWebMp4Mode);
  const [usingFallback, setUsingFallback] = useState(false);
  const [posterSource, setPosterSource] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resumeAt = useRef(0);
  const playbackAttempt = useRef<{ at: number; hints: Chat2VideoHints; quality: 360 | 720 } | null>(
    null,
  );
  const reportedRendition = useRef<string | null>(null);
  const playedOnce = useRef(false);
  const resumeAfterAutoSelection = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const pendingSince = useRef(0);
  const [processingTimedOut, setProcessingTimedOut] = useState(false);
  const [fullscreen, setFullscreen] = useState<{
    url: string;
    media: MediaResponse;
    fallback: boolean;
    error: boolean;
  } | null>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const viewerOpen = Boolean(fullscreen);
  useEffect(() => {
    if (!viewerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const triggerButton = openButton.current;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(null);
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = previousOverflow;
      triggerButton?.focus();
    };
  }, [viewerOpen]);
  // Uploaded files appear in the message immediately; poll only pending jobs.
  useEffect(() => {
    if (!pendingStatus || !["QUEUED", "PROCESSING"].includes(pendingStatus) || processingTimedOut)
      return;
    if (pendingSince.current && Date.now() - pendingSince.current > 90_000) {
      setProcessingTimedOut(true);
      setLoadError(true);
      return;
    }
    const timer = window.setTimeout(() => setReload((value) => value + 1), 4000);
    return () => window.clearTimeout(timer);
  }, [pendingStatus, reload, processingTimedOut]);
  useEffect(() => {
    let live = true;
    reportedRendition.current = null;
    void chat2Api
      .mediaUrl(chatId, file.id)
      .then((result) => {
        if (!live) return;
        setMedia(result);
        setPendingStatus(result.status && result.status !== "READY" ? result.status : null);
        if (["QUEUED", "PROCESSING"].includes(result.status ?? "")) {
          if (!pendingSince.current) pendingSince.current = Date.now();
        } else pendingSince.current = 0;
        setUsingFallback(false);
        if (result.status === "FAILED" || result.status === "EXPIRED") {
          setSrc(null);
          setLoadError(true);
          return;
        }
        if (result.status && result.status !== "READY") {
          setSrc(null);
          setLoadError(processingTimedOut);
          return;
        }
        setPosterSource(result.renditions?.poster ?? null);
        const preferred = savedWebMp4Mode();
        setQuality(preferred);
        setSrc(
          file.kind === "image"
            ? (chat2ImageSource(
                result.renditions?.image,
                320,
                window.devicePixelRatio,
                result.renditions?.imageWidths,
              ) ?? result.url)
            : file.kind === "video"
              ? (chat2VideoSource(result.renditions?.video, preferred, videoHints()) ?? result.url)
              : result.url,
        );
        setLoadError(false);
      })
      .catch(() => {
        if (live) {
          setSrc(null);
          setLoadError(true);
        }
      });
    return () => {
      live = false;
    };
  }, [chatId, file.id, file.kind, reload, processingTimedOut]);
  // Browser media onError does not expose HTTP status. Only a verified
  // CDN 410/5xx (or timed-out HEAD) can switch to the matching public S3 key.
  function handleMediaFailure(primary: string, kind: "image" | "video") {
    const fail = () => {
      if (kind === "video") {
        setPlaying(false);
        setLoadError(true);
      }
      setSrc(null);
    };
    if (!media || usingFallback) {
      fail();
      return;
    }
    const fallback = chat2MatchedS3Variant(primary, media);
    void chat2CdnS3FailoverAllowed(primary, fallback, sameOriginCdnProbeFetch)
      .then((allowed) => {
        if (!allowed || !fallback) {
          fail();
          return;
        }
        if (kind === "video") resumeAt.current = videoRef.current?.currentTime ?? 0;
        setUsingFallback(true);
        setSrc(fallback);
        if (kind === "video") setPosterSource(media.fallbackRenditions?.poster ?? null);
      })
      .catch(fail);
  }
  // A broken CDN poster need not break a playable MP4; preflight its actual
  // rendering once and replace only this poster with its exact S3 counterpart.
  useEffect(() => {
    if (file.kind !== "video" || !media?.renditions?.poster || usingFallback) return;
    let active = true;
    const primary = media.renditions.poster;
    const cover = new Image();
    cover.onerror = () => {
      const fallback = chat2MatchedS3Variant(primary, media);
      void chat2CdnS3FailoverAllowed(primary, fallback, sameOriginCdnProbeFetch).then((allowed) => {
        if (active && allowed && fallback) setPosterSource(fallback);
      });
    };
    cover.src = primary;
    return () => {
      active = false;
      cover.onerror = null;
    };
  }, [file.kind, media, usingFallback]);
  function videoHints(): Chat2VideoHints {
    return webMp4Hints(videoRef.current?.clientWidth || 320);
  }
  function switchQuality(mode: Chat2QualityMode) {
    if (!media?.renditions?.video) return;
    const variants = usingFallback ? media.fallbackRenditions?.video : media.renditions.video;
    const next = chat2VideoSource(variants, mode, videoHints());
    if (!next) return;
    if (next !== src) resumeAt.current = videoRef.current?.currentTime ?? 0;
    playbackAttempt.current = null;
    setQuality(mode);
    saveWebMp4Mode(mode);
    setSrc(next);
  }
  function markVideoPlayIntent() {
    if (!media?.renditions?.video || !src) return;
    const variants = usingFallback ? media.fallbackRenditions?.video : media.renditions.video;
    const selected = src === variants?.[720] ? 720 : src === variants?.[360] ? 360 : null;
    if (!selected) return;
    playbackAttempt.current = { at: Date.now(), hints: videoHints(), quality: selected };
  }
  function onVideoPlaying() {
    setPlaying(true);
    playedOnce.current = true;
    if (src && src !== reportedRendition.current && media?.renditions?.video) {
      const variants = usingFallback ? media.fallbackRenditions?.video : media.renditions.video;
      const chosen = src === variants?.[720] ? 720 : src === variants?.[360] ? 360 : null;
      if (chosen) {
        reportedRendition.current = src;
        reportWebVideoStarted({
          surface: "chat",
          quality: chosen,
          mode: quality,
          hints: videoHints(),
          available: media.renditions.video,
          fallback: usingFallback,
        });
      }
    }
    const current = playbackAttempt.current;
    playbackAttempt.current = null;
    if (current && !usingFallback)
      observeWebMp4Start(current.hints, current.quality, Date.now() - current.at);
  }
  function onVideoWaiting() {
    const current = playbackAttempt.current;
    if (!current || Date.now() - current.at < 4000) return;
    playbackAttempt.current = null;
    if (!usingFallback) observeWebMp4Start(current.hints, current.quality, Date.now() - current.at);
  }
  function requestVideoPlayback() {
    if (!playedOnce.current && media?.renditions?.video) {
      const preferred = savedWebMp4Mode();
      const variants = usingFallback ? media.fallbackRenditions?.video : media.renditions.video;
      const wanted = chat2VideoSource(variants, preferred, videoHints());
      if (preferred !== quality) setQuality(preferred);
      // The preview can stay mounted while a user changes Wi-Fi. Re-select
      // exactly once on first Play, never in the middle of a playing MP4.
      if (wanted && wanted !== src) {
        resumeAfterAutoSelection.current = true;
        setSrc(wanted);
        return;
      }
    }
    markVideoPlayIntent();
    void videoRef.current?.play().catch(() => undefined);
  }
  function retryVideo() {
    // Recheck only; no client may falsely pretend this restarts a failed Cloud Job.
    pendingSince.current = 0;
    setProcessingTimedOut(false);
    setLoadError(false);
    setPlaying(false);
    setSrc(null);
    setReload((count) => count + 1);
  }
  async function open() {
    try {
      // Re-authorize on each opening; never reuse an expired signed URL.
      const fresh = await chat2Api.mediaUrl(chatId, file.id);
      if (fresh.status && fresh.status !== "READY") return;
      if (file.kind === "image") {
        const url =
          chat2ImageSource(
            fresh.renditions?.image,
            1200,
            window.devicePixelRatio,
            fresh.renditions?.imageWidths,
          ) ?? fresh.url;
        if (!url) return;
        setFullscreen({ url, media: fresh, fallback: false, error: false });
        return;
      }
      // PDF documents retain their normal external-document behavior.
      if (fresh.url) window.open(fresh.url, "_blank", "noopener,noreferrer");
    } catch {
      setLoadError(true);
    }
  }
  function handleFullscreenFailure() {
    if (!fullscreen) return;
    const original = fullscreen.url;
    if (fullscreen.fallback) {
      setFullscreen((current) =>
        current?.url === original ? { ...current, error: true } : current,
      );
      return;
    }
    const backup = chat2MatchedS3Variant(original, fullscreen.media);
    void chat2CdnS3FailoverAllowed(original, backup, sameOriginCdnProbeFetch)
      .then((allowed) => {
        setFullscreen((current) =>
          current?.url !== original
            ? current
            : allowed && backup
              ? { ...current, url: backup, fallback: true }
              : { ...current, error: true },
        );
      })
      .catch(() =>
        setFullscreen((current) =>
          current?.url === original ? { ...current, error: true } : current,
        ),
      );
  }
  if (file.kind === "video") {
    const variants = media?.renditions?.video;
    const both = chat2HasVideoQuality(variants, 360) && chat2HasVideoQuality(variants, 720);
    return (
      <div className={css.videoAttachment}>
        {src ? (
          <div className={css.videoFrame}>
            <MeasuredVideo frameSurface="chat"
              key={src}
              ref={videoRef}
              src={src}
              controls
              playsInline
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPlaying={onVideoPlaying}
              onWaiting={onVideoWaiting}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              poster={posterSource ?? undefined}
              aria-label={file.name}
              onLoadedMetadata={(event) => {
                if (resumeAfterAutoSelection.current) {
                  resumeAfterAutoSelection.current = false;
                  markVideoPlayIntent();
                  void event.currentTarget.play().catch(() => undefined);
                }
                if (resumeAt.current > 0) {
                  event.currentTarget.currentTime = Math.min(
                    resumeAt.current,
                    Math.max(0, event.currentTarget.duration - 0.1),
                  );
                  resumeAt.current = 0;
                  void event.currentTarget.play().catch(() => undefined);
                }
              }}
              onError={(event) =>
                handleMediaFailure(event.currentTarget.currentSrc || src, "video")
              }
            />
            {!playing && (
              <button
                type="button"
                className={css.videoPlayOverlay}
                aria-label={`Воспроизвести ${file.name}`}
                onClick={requestVideoPlayback}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="m8 5 11 7-11 7V5Z" />
                </svg>
              </button>
            )}
            {both && (
              <VideoQualitySettings value={quality} onChange={switchQuality} available={variants} />
            )}
          </div>
        ) : (
          <div className={css.videoLoadingState} role={loadError ? "alert" : "status"}>
            {loadError ? (
              <>
                <span>
                  {pendingStatus === "FAILED"
                    ? videoServerFailureMessage
                    : processingTimedOut
                      ? "Обработка видео слишком долго не завершается. Сервис обработки может быть недоступен. Сохраните оригинал. Можно проверить состояние ещё раз — это не перезапустит обработку."
                      : "Не удалось загрузить видео. Проверьте интернет и попробуйте открыть его снова."}
                </span>
                {pendingStatus !== "FAILED" && (
                  <button type="button" onClick={retryVideo}>
                    Проверить состояние ещё раз
                  </button>
                )}
              </>
            ) : (
              "Загружаем видео…"
            )}
          </div>
        )}
      </div>
    );
  }
  const imageVariants: Chat2MediaRenditions["image"] = usingFallback
    ? media?.fallbackRenditions?.image
    : media?.renditions?.image;
  const srcset =
    file.kind === "image" && imageVariants
      ? Array.from(
          new Map(
            ([360, 1440] as const)
              .filter((size) => imageVariants[size]?.startsWith("https://"))
              .map(
                (size) =>
                  [media?.renditions?.imageWidths?.[size] ?? size, imageVariants[size]!] as const,
              ),
          ).entries(),
        )
          .map(([width, url]) => `${url} ${width}w`)
          .join(", ")
      : undefined;
  return (
    <>
      <button
        ref={openButton}
        type="button"
        className={css.storedMedia}
        onClick={() => (loadError ? setReload((value) => value + 1) : void open())}
        disabled={!src && !loadError}
        aria-label={loadError ? `Повторить загрузку ${file.name}` : `Открыть ${file.name}`}
      >
        {file.kind === "image" && src ? (
          <img
            src={src}
            srcSet={srcset || undefined}
            sizes={srcset ? "(max-width: 600px) 90vw, 320px" : undefined}
            alt={file.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(event) => handleMediaFailure(event.currentTarget.currentSrc || src, "image")}
          />
        ) : (
          <span role="status">
            {loadError
              ? "Не удалось обработать фото · Повторить"
              : pendingStatus
                ? "Обрабатываем фото…"
                : "Загружаем фото…"}
          </span>
        )}
      </button>
      {fullscreen &&
        createPortal(
          <div
            className={css.mediaLightbox}
            role="presentation"
            onClick={() => setFullscreen(null)}
          >
            <div
              className={css.mediaLightboxInner}
              role="dialog"
              aria-modal="true"
              aria-label="Просмотр фотографии"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                ref={closeButton}
                type="button"
                className={css.mediaLightboxClose}
                aria-label="Закрыть просмотр"
                onClick={() => setFullscreen(null)}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M5 5l14 14M19 5 5 19" />
                </svg>
              </button>
              {fullscreen.error ? (
                <p role="alert">Не удалось открыть фотографию</p>
              ) : (
                <img
                  src={fullscreen.url}
                  alt={file.name}
                  referrerPolicy="no-referrer"
                  onError={handleFullscreenFailure}
                />
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
