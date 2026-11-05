import { useEffect, useRef, useState } from "react";
import type { FeedV2VideoMedia } from "@gafus/types";
import { selectMp4Quality, type Mp4NetworkHints, type Mp4Quality } from "@gafus/chat-media-quality";
import { webMp4Hints, observeWebMp4Start, savedWebMp4Mode, saveWebMp4Mode } from "../../shared/media/videoPlaybackPolicy";
import { reportWebVideoStarted } from "../../shared/media/videoQualityTelemetry";
import {mediaCdnKindFromSignedUrl,probeCdnOutage} from "@gafus/core-client/media-delivery";
import {sameOriginCdnProbeFetch} from "../../shared/api/cdnProbe";
import {FeedCdnImage,requestFeedImageFallback} from "./FeedCdnImage";
import "./feed-v2-media.css";
import { VideoQualitySettings, type VideoQualityMode } from "../../shared/media/VideoQualitySettings";

// One active native MP4 player globally; never preload other videos in the feed.
let activeVideo: { element: HTMLVideoElement; stop: () => void } | null = null;
export function FeedV2Video({ media, visible = true, saveData = false }: {
  media: FeedV2VideoMedia; visible?: boolean; saveData?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [quality, setQuality] = useState<VideoQualityMode>(savedWebMp4Mode);
  const [error, setError] = useState("");
  const fallbackAttempted=useRef(false);
  const playIntent=useRef(false);
  const generation=useRef(0);
  const startup = useRef<{at:number; quality:Mp4Quality; hints:Mp4NetworkHints} | null>(null);
  const trackedStart = useRef<{quality:Mp4Quality; mode:VideoQualityMode; hints:Mp4NetworkHints;
    fallback:boolean; sent:boolean}|null>(null);
  const stop = () => {
    generation.current++;
    playIntent.current=false;
    startup.current=null;
    trackedStart.current=null;
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
    trackedStart.current=null;
    const element=ref.current;
    if(element){element.pause();element.removeAttribute("src");element.load();
      if(activeVideo?.element===element)activeVideo=null;}
    setPlaying(false);setError("");setQuality(savedWebMp4Mode());
  }, [media.id]);
  useEffect(() => { if (!visible) stop(); }, [visible]);
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  function qualityUrl(mode: VideoQualityMode, element: HTMLVideoElement, saveDataMode: boolean) {
    const hints = webMp4Hints(element.clientWidth || Math.min(720, window.innerWidth || 720), saveDataMode);
    const selected = selectMp4Quality(mode, hints);
    return {url: media.mp4[selected] ?? media.mp4[selected === 360 ? 720 : 360] ?? null,
      quality: (media.mp4[selected] ? selected : selected === 360 ? 720 : 360) as Mp4Quality,
      hints};
  }
  function switchQuality(mode: VideoQualityMode) {
    if (mode === quality) return;
    setQuality(mode);
    saveWebMp4Mode(mode);
    const element = ref.current;
    if (!element || !element.hasAttribute("src")) return; // no autoplay on a preview
    const selected = qualityUrl(mode, element, saveData);
    const next = selected.url;
    if (!next) { stop(); setError("Видео недоступно."); return; }
    if (next === element.src || next === element.getAttribute("src")) return;
    const time = element.currentTime;
    const resume = !element.paused;
    const current = ++generation.current;
    fallbackAttempted.current = false;
    startup.current = null; // A manual switch must not be mistaken for an automatic startup.
    trackedStart.current = {quality:selected.quality,mode,hints:selected.hints,fallback:false,sent:false};
    element.addEventListener("loadedmetadata", () => {
      if (current !== generation.current || ref.current !== element) return;
      if (Number.isFinite(time) && time > 0) {
        const duration = element.duration;
        element.currentTime = Number.isFinite(duration)
          ? Math.min(time, Math.max(0, duration - 0.1)) : time;
      }
      if (resume) void element.play().catch(() => onPlaybackError());
    }, { once: true });
    element.src = next;
    element.load();
  }
  const start = async () => {
    const element = ref.current;
    if (!element || !visible || playing) return;
    if (activeVideo && activeVideo.element !== element) activeVideo.stop();
    activeVideo = { element, stop };
    fallbackAttempted.current=false;
    playIntent.current=true;
    // Re-read persisted choice: another player may have changed it since mount.
    const preferred = savedWebMp4Mode();
    if (preferred !== quality) setQuality(preferred);
    const selected = qualityUrl(preferred, element, saveData);
    if (!selected.url) { stop(); setError("Видео недоступно."); return; }
    startup.current = {at: Date.now(), quality: selected.quality, hints: selected.hints};
    trackedStart.current = {quality:selected.quality,mode:preferred,hints:selected.hints,
      fallback:false,sent:false};
    element.src = selected.url;
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
      if(!["360","720"].includes(quality))throw Error("INVALID_QUALITY");
      const fallback=await requestFeedImageFallback(
        media.id,`video${quality}` as "video360"|"video720");
      if(current!==generation.current||ref.current!==element)return;
      startup.current=null; // An origin failure is not evidence of a slow connection.
      if (trackedStart.current && !trackedStart.current.sent) trackedStart.current.fallback=true;
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
  function onActualPlayback() {
    const sample=trackedStart.current;
    if (!sample || sample.sent || !playIntent.current) return;
    sample.sent=true;
    reportWebVideoStarted({surface:"moments",quality:sample.quality,mode:sample.mode,
      hints:sample.hints,fallback:sample.fallback,available:media.mp4});
  }
  function onFirstFrame() {
    const attempt = startup.current;
    if (!attempt || !playIntent.current || fallbackAttempted.current) return;
    startup.current = null;
    observeWebMp4Start(attempt.hints, attempt.quality, Date.now() - attempt.at);
  }
  function onBuffering() {
    const attempt = startup.current;
    // One startup stall is useful negative evidence; never switch a playing MP4.
    if (!attempt || !playIntent.current || Date.now() - attempt.at < 4000) return;
    startup.current = null;
    observeWebMp4Start(attempt.hints, attempt.quality, Date.now() - attempt.at);
  }
  // A portrait clip should not occupy a whole feed viewport. Preserve its
  // source aspect and let users enter fullscreen via the native video control.
  const orientation = media.height > media.width ? "portrait" :
    media.height === media.width ? "square" : "landscape";
  return <div className="feed-v2-video-shell" data-orientation={orientation}>
    <video ref={ref} preload="none" playsInline controls={playing}
      onLoadedData={onFirstFrame} onWaiting={onBuffering} onPlaying={onActualPlayback}
      onEnded={stop} onError={onPlaybackError}
      aria-label="Видео публикации" />
    {!playing && media.posterUrl && <div className="feed-v2-video-poster">
      <FeedCdnImage url={media.posterUrl} mediaId={media.id} variant="poster" alt="Обложка видео" />
    </div>}
    {!playing && <button type="button" onClick={() => void start()} disabled={!visible}
      className="feed-v2-video-play" aria-label="Воспроизвести видео">▶</button>}
    <VideoQualitySettings key={media.id} value={quality} onChange={switchQuality}
      available={media.mp4} />
    {error && <p role="alert">{error}</p>}
  </div>;
}
