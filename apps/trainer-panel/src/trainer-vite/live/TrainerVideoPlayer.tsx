import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

/** Playback tokens are short-lived and only kept in mounted player state. */
export default function TrainerVideoPlayer({ src }: { src: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    setError("");
    if (element.canPlayType("application/vnd.apple.mpegurl")) {
      element.src = src;
      void element.play().catch(() => undefined);
      return () => { element.pause(); element.removeAttribute("src"); element.load(); };
    }
    if (!Hls.isSupported()) {
      setError("Этот браузер не поддерживает воспроизведение HLS.");
      return;
    }
    const hls = new Hls({ enableWorker: false });
    hls.loadSource(src);
    hls.attachMedia(element);
    hls.on(Hls.Events.MANIFEST_PARSED, () => { void element.play().catch(() => undefined); });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) setError("Не удалось воспроизвести видео. Попробуйте снова.");
    });
    return () => { element.pause(); hls.destroy(); };
  }, [src]);
  return <div className="trainer-video-player">
    <video ref={video} controls playsInline preload="metadata" aria-label="Проигрыватель видео" />
    {error && <p role="alert">{error}</p>}
  </div>;
}
