"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
import { feedApi } from "./api";
import styles from "./Feed.module.css";
let stopActiveVideo: (() => void) | undefined;

export function FeedVideo({ mediaId, poster }: { mediaId: string; poster: string | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const hls = useRef<Hls | null>(null);
  const generation = useRef(0);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stop = useCallback(() => {
    generation.current++;
    if (expiryTimer.current) clearTimeout(expiryTimer.current);
    hls.current?.destroy(); hls.current = null;
    const element = video.current;
    if (element) { element.pause(); element.removeAttribute("src"); element.load(); }
    setActive(false); setBusy(false);
    if (stopActiveVideo === stop) stopActiveVideo = undefined;
  }, []);
  useEffect(() => {
    const visibility = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(entries => {
      if (entries.every(entry => !entry.isIntersecting)) stop();
    });
    if (root.current) observer.observe(root.current);
    return () => { document.removeEventListener("visibilitychange", visibility); observer.disconnect(); stop(); };
  }, [stop]);
  const play = async () => {
    stopActiveVideo?.(); stopActiveVideo = stop;
    const current = ++generation.current;
    setBusy(true); setError("");
    try {
      const ticket = await feedApi.requestPlayback(mediaId);
      if (generation.current !== current) return;
      const element = video.current;
      if (!element) return;
      setActive(true);
      expiryTimer.current = setTimeout(stop, 110_000);
      const url = ticket.manifestUrl;
      if (!/^\/api\/v1\/feed-playback\/[A-Za-z0-9_-]+\?ticket=/.test(url)) throw new Error("Не удалось открыть видео.");
      if (element.canPlayType("application/vnd.apple.mpegurl")) {
        element.src = url;
        await element.play();
      } else {
        const { default: HlsPlayer } = await import("hls.js");
        if (generation.current !== current) return;
        if (!HlsPlayer.isSupported()) throw new Error("Этот браузер не поддерживает воспроизведение видео.");
        const player = new HlsPlayer({ maxBufferLength: 15, backBufferLength: 0,
          fetchSetup: (context, init) => new Request(context.url, { ...init, cache: "no-store", credentials: "omit" }),
        });
        hls.current = player;
        player.on(HlsPlayer.Events.ERROR, (_event, data) => {
          if (data.fatal && generation.current === current) { stop(); setError("Видео не загрузилось. Попробуйте ещё раз."); }
        });
        player.on(HlsPlayer.Events.MANIFEST_PARSED, () => {
          if (generation.current === current) void element.play().catch(() => {
            if (generation.current === current) setError("Нажмите воспроизведение в плеере.");
          });
        });
        player.loadSource(url); player.attachMedia(element);
      }
    } catch (failure) {
      if (generation.current === current) { stop(); setError(failure instanceof Error ? failure.message : "Не удалось открыть видео."); }
    } finally { if (generation.current === current) setBusy(false); }
  };
  return <div ref={root} className={styles.videoStatus}>
    <video ref={video} controls={active} hidden={!active} playsInline preload="none"
      poster={poster ?? undefined} aria-label="Видео публикации" onError={() => { if (active) { stop(); setError("Видео не загрузилось. Попробуйте ещё раз."); } }} />
    {!active && <>
      {poster && <img src={poster} alt="" referrerPolicy="no-referrer" loading="lazy" />}
      <button type="button" className={styles.secondary} disabled={busy} onClick={() => void play()}>
        {busy ? "Загружаем видео…" : error ? "Повторить воспроизведение" : "Смотреть видео"}
      </button>
    </>}
    {!!error && <p role="alert" className={styles.muted}>{error}</p>}
  </div>;
}
