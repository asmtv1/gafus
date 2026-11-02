import { useEffect, useRef, useState } from "react";
import { selectFeedV2VideoUrl, type FeedV2VideoMedia } from "@gafus/types";
import {mediaCdnKindFromSignedUrl,probeCdnOutage} from "@gafus/core-client/media-delivery";
import {sameOriginCdnProbeFetch} from "../../shared/api/cdnProbe";
import {FeedCdnImage,requestFeedImageFallback} from "./FeedCdnImage";
import "./feed-v2-media.css";

// One active native MP4 player globally; never preload other videos in the feed.
let activeVideo: { element: HTMLVideoElement; stop: () => void } | null = null;
export function FeedV2Video({ media, visible = true, saveData = false }: {
  media: FeedV2VideoMedia; visible?: boolean; saveData?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const fallbackAttempted=useRef(false);
  const playIntent=useRef(false);
  const generation=useRef(0);
  const stop = () => {
    generation.current++;
    playIntent.current=false;
    const element = ref.current;
    if (element) {
      element.pause(); element.removeAttribute("src"); element.load();
      if (activeVideo?.element === element) activeVideo = null;
    }
    setPlaying(false);
  };
  useEffect(() => {
    const element = ref.current;
    return () => { playIntent.current=false; if (element) { element.pause(); element.removeAttribute("src");
      if (activeVideo?.element === element) activeVideo = null; } };
  }, []);
  // A virtualized feed can reuse the same video component for another post.
  // Invalidate old HEAD/fallback promises before loading the replacement video.
  useEffect(() => {
    generation.current++;
    playIntent.current=false;
    fallbackAttempted.current=false;
    const element=ref.current;
    if(element){element.pause();element.removeAttribute("src");element.load();
      if(activeVideo?.element===element)activeVideo=null;}
    setPlaying(false);setError("");
  }, [media.id]);
  useEffect(() => { if (!visible) stop(); }, [visible]);
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  const start = async () => {
    const element = ref.current;
    if (!element || !visible || playing) return;
    if (activeVideo && activeVideo.element !== element) activeVideo.stop();
    activeVideo = { element, stop };
    fallbackAttempted.current=false;
    playIntent.current=true;
    const preference = saveData || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ? "save-data" : "auto";
    element.src = selectFeedV2VideoUrl(media, { viewportWidth: element.clientWidth || 720,
      devicePixelRatio: window.devicePixelRatio, preference });
    element.load();
    setError(""); setPlaying(true);
    try { await element.play(); } catch {
      // Some browsers reject play() before dispatching the media error event.
      // Keep the failing CDN source intact so its exact variant can recover.
      if(playIntent.current && !fallbackAttempted.current)onPlaybackError();
    }
  };
  const onPlaybackError=()=>{
    const element=ref.current;
    if(!playIntent.current||!element||fallbackAttempted.current)return;
    const failedUrl=element.src;
    if(mediaCdnKindFromSignedUrl(failedUrl)!=="feed"){
      stop();setError("Видео недоступно.");return;
    }
    fallbackAttempted.current=true;
    const current=generation.current;
    const time=element.currentTime;
    void (async()=>{
      if(!await probeCdnOutage(failedUrl,{fetcher:sameOriginCdnProbeFetch,timeoutMs:8500}))
        throw Error("CDN_NOT_DOWN");
      const quality=(Object.entries(media.mp4) as [string,string][])
        .find(([,value])=>value===failedUrl)?.[0]??"360";
      if(!["360","720","1080"].includes(quality))throw Error("INVALID_QUALITY");
      const fallback=await requestFeedImageFallback(
        media.id,`video${quality}` as "video360"|"video720"|"video1080");
      if(current!==generation.current||ref.current!==element)return;
      element.src=fallback;
      element.load();
      if(Number.isFinite(time)&&time>0){
        element.addEventListener("loadedmetadata",()=>{
          if(current===generation.current&&ref.current===element){
            const duration=element.duration;
            element.currentTime=Number.isFinite(duration)
              ? Math.min(time,Math.max(0,duration-0.1)) : time;
          }
        },{once:true});
      }
      await element.play();
    })().catch(()=>{
      if(current===generation.current){stop();setError("Видео недоступно.");}
    });
  };
  // A portrait clip should not occupy a whole feed viewport. Preserve its
  // source aspect and let users enter fullscreen via the native video control.
  const orientation = media.height > media.width ? "portrait" :
    media.height === media.width ? "square" : "landscape";
  return <div className="feed-v2-video-shell" data-orientation={orientation}>
    <video ref={ref} preload="none" playsInline controls={playing}
      onEnded={stop} onError={onPlaybackError}
      aria-label="Видео публикации" />
    {!playing && media.posterUrl && <div className="feed-v2-video-poster">
      <FeedCdnImage url={media.posterUrl} mediaId={media.id} variant="poster" alt="Обложка видео" />
    </div>}
    {!playing && <button type="button" onClick={() => void start()} disabled={!visible}
      className="feed-v2-video-play" aria-label="Воспроизвести видео">▶</button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
