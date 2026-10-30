import { Loading } from "../../shared/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import "./TrainingStepVideoPlayer.css";
import type Hls from "hls.js";
import { ApiError, apiRequest } from "../../shared/api/client";
import {
  readTrainingVideoProgress, safeTrainingVideoId, writeTrainingVideoProgress,
} from "./trainingVideoProgressApi";

/** Next parity: Core/Hono, not the browser, decides whether a training video
 * can be played. Only ask for a fresh signed URL on the viewer's click.
 * Tokens are held in this mounted component, never persisted or logged.
 */
async function requestTrainingStepPlaybackTicket(originalUrl: string): Promise<{
  url: string; videoId: string | null; posterUrl: string | null;
}> {
  if (!safePlaybackUrl(originalUrl)) throw Error("INVALID_TRAINING_VIDEO_SOURCE");
  const answer = await apiRequest<unknown>("/api/v1/training/video/url", {
    method: "POST", json: { videoUrl: originalUrl }, browserAuth: true,
  });
  if (!answer || typeof answer !== "object" ||
      !("url" in answer) || !safePlaybackUrl(answer.url)) {
    throw Error("INVALID_TRAINING_VIDEO_TICKET");
  }
  const videoId = "videoId" in answer ? safeTrainingVideoId(answer.videoId) : null;
  // Hono sends the same owner-authorized, short-lived signed thumbnail
  // alongside the playback ticket. Never infer or sign object paths in UI.
  const posterUrl = "posterUrl" in answer && safePlaybackUrl(answer.posterUrl)
    ? answer.posterUrl : null;
  return { url: answer.url, videoId, posterUrl };
}

/** Preserve the existing string-result helper for other consumers. */
export async function requestTrainingStepPlayback(originalUrl: string): Promise<string> {
  return (await requestTrainingStepPlaybackTicket(originalUrl)).url;
}

function safePlaybackUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 4096) return false;
  if (value.startsWith("/") && !value.startsWith("//") &&
      !/[\\\r\n]/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      !url.hash && !/[\r\n]/.test(value);
  } catch { return false; }
}

/** Preview metadata is a signed READ, never an implicit playback command. */
export function supportsSignedTrainingVideoPreview(raw: string): boolean {
  if (!safePlaybackUrl(raw) || raw.startsWith("/")) return false;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    return (host === "storage.yandexcloud.net" &&
      url.pathname.startsWith("/gafus-media/uploads/trainers/")) ||
      (host === "gafus-media.storage.yandexcloud.net" &&
        url.pathname.startsWith("/uploads/trainers/"));
  } catch { return false; }
}

function isHls(url: string): boolean {
  try { return new URL(url, window.location.origin).pathname.endsWith(".m3u8"); }
  catch { return false; }
}

/** Ordinary externally hosted MP4s already worked as native controls in
 * Next and Vite; only GAFUS storage/video and HLS require a fresh Hono ticket.
 * Never classify signed/private storage URLs as freely shareable MP4s.
 */
export function isDirectPublicVideo(url: string): boolean {
  if (!safePlaybackUrl(url) || url.startsWith("/")) return false;
  try {
    const parsed = new URL(url);
    if (!/\.(?:mp4|webm|ogv)$/i.test(parsed.pathname) || parsed.search) return false;
    if (parsed.hostname === "storage.yandexcloud.net" ||
        parsed.hostname.endsWith(".storage.yandexcloud.net") ||
        parsed.hostname === "api.gafus.ru" ||
        parsed.hostname.endsWith(".gafus.ru")) return false;
    return true;
  } catch { return false; }
}

/** Allow only known external providers, and rebuild every iframe URL from
 * validated IDs rather than using arbitrary server-returned HTML/iframe URLs.
 */
export function safeTrainingVideoEmbed(raw: string): string | null {
  if (!safePlaybackUrl(raw) || raw.startsWith("/")) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (["youtube.com", "www.youtube.com", "m.youtube.com",
      "youtu.be", "www.youtu.be", "youtube-nocookie.com",
      "www.youtube-nocookie.com"].includes(host)) {
      const path = url.pathname;
      const id = host.endsWith("youtu.be")
        ? path.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1]
        : path === "/watch" ? url.searchParams.get("v")
          : path.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
      return id && /^[A-Za-z0-9_-]{11}$/.test(id)
        ? "https://www.youtube-nocookie.com/embed/" + id : null;
    }
    if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) {
      const id = url.pathname.match(/^\/(?:video\/)?([0-9]{1,15})\/?$/)?.[1];
      return id ? "https://player.vimeo.com/video/" + id : null;
    }
    if (["rutube.ru", "www.rutube.ru"].includes(host)) {
      const id = url.pathname.match(
        /^\/(?:video\/|play\/embed\/)([a-fA-F0-9-]{16,40})\/?$/,
      )?.[1];
      return id ? "https://rutube.ru/play/embed/" + id : null;
    }
    if (["vk.com", "www.vk.com", "vkvideo.ru", "www.vkvideo.ru"].includes(host)) {
      const video = url.pathname.match(/^\/video(-?[0-9]{1,18})_([0-9]{1,18})\/?$/);
      const oid = video?.[1] ?? (url.pathname === "/video_ext.php"
        ? url.searchParams.get("oid") : null);
      const id = video?.[2] ?? (url.pathname === "/video_ext.php"
        ? url.searchParams.get("id") : null);
      if (oid && id && /^-?[0-9]{1,18}$/.test(oid) && /^[0-9]{1,18}$/.test(id)) {
        return "https://vkvideo.ru/video_ext.php?oid=" + oid + "&id=" + id;
      }
    }
    return null;
  } catch { return null; }
}

export function TrainingStepVideo({ originalUrl, title }: {
  originalUrl: string; title: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const inFlight = useRef(false);
  const epoch = useRef(0);
  const [loadingFor, setLoadingFor] = useState<string | null>(null);
  const [ticket, setTicket] = useState<{
    original: string; url: string; videoId: string | null;
    posterUrl: string | null; resumePosition: number | null;
  } | null>(null);
  const lastSavedPosition = useRef<number | null>(null);
  const writeInFlight = useRef(false);
  const lastWrite = useRef<Promise<void>>(Promise.resolve());
  const ended = useRef(false);
  const [issue, setIssue] = useState<{ original: string; message: string } | null>(null);
  const [preview, setPreview] = useState<{ original: string; posterUrl: string } | null>(null);
  // Never show a previous signed URL/error while the same step changes media.
  const source = ticket?.original === originalUrl ? ticket.url : null;
  const loading = loadingFor === originalUrl;
  const error = issue?.original === originalUrl ? issue.message : "";
  const stop = useCallback(() => {
    epoch.current++;
    inFlight.current = false;
    ended.current = false;
  }, []);
  useEffect(() => stop, [stop, originalUrl]);
  const directPublic = isDirectPublicVideo(originalUrl);
  const externalEmbed = source ? safeTrainingVideoEmbed(source) : null;
  // Load a restricted thumbnail without requesting video playback. A stale
  // result must never repaint the preview of a different training step.
  useEffect(() => {
    if (!supportsSignedTrainingVideoPreview(originalUrl)) return;
    let current = true;
    const url = "/api/v1/training/video/preview?videoUrl=" + encodeURIComponent(originalUrl);
    void apiRequest<unknown>(url, { method: "GET", browserAuth: true }).then(value => {
      if (!current || !value || typeof value !== "object" ||
          !("posterUrl" in value) || !safePlaybackUrl(value.posterUrl)) return;
      const signed = value.posterUrl;
      if (signed.startsWith("/") || !signed.startsWith("https://")) return;
      setPreview({ original: originalUrl, posterUrl: signed });
    }).catch(() => {
      // Denied, missing or incomplete thumbnails retain the neutral player.
      // Never surface a signed URL, object key or provider error to the user.
    });
    return () => { current = false; };
  }, [originalUrl]);

  useEffect(() => {
    if (!source || !isHls(source) || !video.current) return;
    const element = video.current;
    let cancelled = false;
    let instance: Hls | undefined;
    let recoveredNetwork = false;
    let recoveredMedia = false;
    const setup = async () => {
      try {
        const { default: HlsPlayer } = await import("hls.js");
        if (cancelled) return;
        if (HlsPlayer.isSupported()) {
          instance = new HlsPlayer({
            maxBufferLength: 15,
            backBufferLength: 0,
            // Signed playback resources, not browser cookies or CDN caches.
            fetchSetup: (context, init) => new Request(context.url, {
              ...init, credentials: "omit", cache: "no-store",
            }),
          });
          instance.on(HlsPlayer.Events.ERROR, (_event, data) => {
            if (!data.fatal || cancelled) return;
            // Same one-time network/media recovery as retained Next's player.
            // Never retry a denied ticket, only hls.js buffer/transport errors.
            if (data.type && data.type === HlsPlayer.ErrorTypes.NETWORK_ERROR &&
                !recoveredNetwork) {
              recoveredNetwork = true;
              instance?.startLoad();
              return;
            }
            if (data.type && data.type === HlsPlayer.ErrorTypes.MEDIA_ERROR &&
                !recoveredMedia) {
              recoveredMedia = true;
              instance?.recoverMediaError();
              return;
            }
            setIssue({ original: originalUrl,
              message: "Видео не загрузилось. Запросите новую ссылку." });
            setTicket(null);
          });
          instance.loadSource(source);
          instance.attachMedia(element);
        } else if (element.canPlayType("application/vnd.apple.mpegurl")) {
          element.src = source; // Safari/iOS native HLS.
          // preload="none" otherwise requires a second tap on native controls
          // even after the reader pressed our Next-style play overlay.
          try { void element.play().catch(() => undefined); }
          catch { /* autoplay can be denied; native controls stay visible */ }
        } else {
          setIssue({ original: originalUrl,
            message: "Этот браузер не поддерживает HLS-видео." });
        }
      } catch {
        if (!cancelled) setIssue({ original: originalUrl,
          message: "Не удалось подготовить видеоплеер." });
      }
    };
    void setup();
    return () => {
      cancelled = true;
      instance?.destroy();
      element.removeAttribute("src");
    };
  }, [source, originalUrl]);

  // Native MP4 with preload="none" does not reliably issue a media fetch just
  // because React mounted <video>. After the real Hono-authorized user play
  // request, start playback explicitly; Next's player likewise calls play().
  useEffect(() => {
    if (!source || externalEmbed || isHls(source) || !video.current) return;
    try { void video.current.play().catch(() => undefined); }
    catch { /* autoplay can be denied: native controls remain available */ }
  }, [source, externalEmbed]);

  const openVideo = async () => {
    if (inFlight.current || source) return;
    inFlight.current = true;
    const currentEpoch = epoch.current;
    setLoadingFor(originalUrl);
    setIssue(null);
    try {
      const signed = await requestTrainingStepPlaybackTicket(originalUrl);
      if (currentEpoch !== epoch.current) return;
      // Only authenticated Hono-issued TrainerVideo IDs can load/save owner
      // progress. A third-party embed/direct media URL has no progress write.
      const resumePosition = signed.videoId
        ? await readTrainingVideoProgress(signed.videoId).catch(() => null) : null;
      if (currentEpoch !== epoch.current) return;
      lastSavedPosition.current = resumePosition;
      setTicket({ original: originalUrl, url: signed.url,
        videoId: signed.videoId, posterUrl: signed.posterUrl, resumePosition });
    } catch (error) {
      if (currentEpoch === epoch.current) {
        // Translate only stable API codes; never display raw upstream errors,
        // signed URLs, video paths or stack traces.
        let message = "Не удалось загрузить видео. Попробуйте ещё раз.";
        if (error instanceof ApiError) {
          if (error.code === "SUBSCRIPTION_OR_CREDITS_REQUIRED") {
            message = "Для просмотра нужна подписка или доступ к шагу.";
          } else if (error.status === 401) {
            message = "Войдите в аккаунт, чтобы посмотреть видео.";
          } else if (error.status === 403) {
            message = "Нет доступа к этому видео.";
          } else if (error.status === 404) {
            message = "Видеофайл не найден или ещё обрабатывается.";
          } else if (error.code === "SERVICE_NOT_CONFIGURED" || error.status >= 500) {
            message = "Видеосервис временно недоступен. Повторите позже.";
          }
        }
        setIssue({ original: originalUrl, message });
      }
    } finally {
      if (currentEpoch === epoch.current) {
        inFlight.current = false;
        setLoadingFor(null);
      }
    }
  };

  const persistPosition = (force: boolean) => {
    if (!ticket || ticket.original !== originalUrl || !ticket.videoId ||
        ended.current || writeInFlight.current || !video.current) return;
    const seconds = Math.floor(video.current.currentTime);
    if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 86_400 * 24 ||
        seconds === lastSavedPosition.current ||
        (lastSavedPosition.current === null && seconds === 0) ||
        (!force && lastSavedPosition.current !== null &&
          Math.abs(seconds - lastSavedPosition.current) < 15)) return;
    writeInFlight.current = true;
    lastSavedPosition.current = seconds;
    const id = ticket.videoId;
    const generation = epoch.current;
    lastWrite.current = writeTrainingVideoProgress(id, seconds).catch(() => {
      if (generation === epoch.current) setIssue({ original: originalUrl,
        message: "Позицию просмотра не удалось сохранить. Следующая позиция сохранится отдельно." });
    }).finally(() => { writeInFlight.current = false; });
  };

  const finishPlayback = () => {
    if (ended.current || !ticket || ticket.original !== originalUrl || !ticket.videoId) return;
    ended.current = true;
    lastSavedPosition.current = 0;
    const generation = epoch.current;
    const id = ticket.videoId;
    // Next resets persisted position after completing a video. Serialize with
    // the last progress POST, so a slower 15-second save cannot restore an
    // obsolete near-end position after we already reached the end.
    lastWrite.current = lastWrite.current.catch(() => undefined).then(async () => {
      if (generation === epoch.current) await writeTrainingVideoProgress(id, 0);
    }).catch(() => {
      if (generation === epoch.current) setIssue({ original: originalUrl,
        message: "Не удалось сбросить позицию просмотра. Повторите видео позже." });
    });
  };

  // Match the retained Next VideoPlayerSection/CourseVideoPlayer geometry:
  // a visible 16:9 video surface is present from first render. Private URLs
  // and provider iframes still never enter the DOM before Hono authorizes play.
  return <section className="training-step-media training-video-section"
    aria-label={"Видео: " + title}>
    <div className="training-video-player" data-state={
      directPublic || source ? "ready" : error ? "error" : loading ? "loading" : "preview"}>
      {directPublic ? <video className="training-video-element" controls playsInline preload="none"
        src={originalUrl} aria-label={"Плеер: " + title} /> :
      externalEmbed ? <iframe className="training-video-element training-video-embed"
        title={"Видео: " + title} src={externalEmbed} loading="lazy"
        referrerPolicy="no-referrer" allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        allow="fullscreen; encrypted-media; picture-in-picture" /> :
      source ? <video className="training-video-element" ref={video} controls playsInline preload="none"
        poster={ticket?.posterUrl ?? undefined}
        src={isHls(source) ? undefined : source} aria-label={"Плеер: " + title}
        onLoadedMetadata={() => {
          if (!ticket || ticket.original !== originalUrl || !video.current) return;
          if (ticket.resumePosition !== null) {
            const duration = video.current.duration;
            if (Number.isFinite(duration) && duration > 0) {
              video.current.currentTime = ticket.resumePosition > 0 &&
                ticket.resumePosition < duration - 5 ? ticket.resumePosition : 0;
            }
          }
          // The click requesting playback is a real user gesture. Browsers may
          // still block async autoplay after a network round-trip; native
          // controls remain available and the rejected promise is expected.
          try {
            void video.current.play().catch(() => undefined);
          } catch { /* browser denied play */ }
        }}
        onTimeUpdate={() => persistPosition(false)}
        onPause={() => persistPosition(true)}
        onPlay={() => { ended.current = false; }}
        onEnded={finishPlayback}
        onError={() => {
          setIssue({ original: originalUrl,
            message: "Видео не загрузилось. Запросите новую ссылку." });
          setTicket(null);
        }} /> :
      <div className="training-video-preview" aria-hidden="true">
        {preview?.original === originalUrl && <img className="training-video-poster"
          src={preview.posterUrl} alt="" loading="lazy"
          referrerPolicy="no-referrer" draggable={false} />}
        <svg className="training-video-preview-mark" viewBox="0 0 64 64" fill="none"
          aria-hidden="true"><circle cx="32" cy="32" r="28" stroke="currentColor" strokeOpacity=".3" />
          <path d="M26 19.5 45 32 26 44.5V19.5Z" fill="currentColor" fillOpacity=".18" />
        </svg>
      </div>}
      {!directPublic && !source && (error ?
        <div className="training-video-error" role="alert">
          <span>{error}</span>
          <button type="button" className="training-video-retry"
            onClick={() => void openVideo()}>Повторить видео</button>
        </div> :
        <button type="button" className="training-video-play-overlay"
          aria-label={loading ? "Проверяем доступ к видео…" : "Смотреть видео"}
          disabled={loading} onClick={() => void openVideo()}>
          {loading ? <Loading variant="icon" message="" /> :
            <svg aria-hidden="true" className="training-video-play-icon"
              viewBox="0 0 48 48" fill="none"><path d="M15 7 40 24 15 41V7Z"
                fill="currentColor" /></svg>}
          <span className="gafus-visually-hidden">
            {loading ? "Проверяем доступ к видео…" : "Смотреть видео"}
          </span>
        </button>)}
    </div>
    {source && error && <p className="training-video-progress-error" role="alert">{error}</p>}
    {externalEmbed && source && <p className="training-video-provider-link">
      <a href={source} target="_blank" rel="noopener noreferrer"
        referrerPolicy="no-referrer">Открыть у видеохостинга</a>
    </p>}
  </section>;
}
