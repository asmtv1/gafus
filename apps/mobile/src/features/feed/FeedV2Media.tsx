import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Modal, PixelRatio, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SwipeDismissMedia } from "@/shared/components/media/SwipeDismissMedia";
import { useVideoPlayer, VideoView } from "expo-video";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useAuthStore } from "@/shared/stores";
import { VideoQualitySettings, type VideoQualityMode } from "@/shared/components/media/VideoQualitySettings";
import { SocialVideoControls } from "@/shared/components/media/SocialVideoControls";
import { feedApi } from "@/shared/lib/api/feed";
import { CdnImage, isSignedCloudruFallback } from "@/shared/components/media/CdnImage";
import { prefersCloudruMedia } from "@/shared/lib/media/serverHealth";
import { isLongLivedPublicFeedCdnUrl } from "@/shared/components/media/scopedMediaCache";
import { mediaCdnKindFromSignedUrl, probeCdnOutage } from "@gafus/core-client/media-delivery";
import type { FeedV2ImageMedia, FeedV2VideoMedia } from "@gafus/types";
import { selectMp4Quality, type Mp4NetworkHints, type Mp4Quality } from "@gafus/chat-media-quality";
import { nativeMp4Hints, observeNativeMp4Start, useNativeMp4Mode, loadNativeMp4Mode } from "@/shared/lib/media/videoPlaybackPolicy";
import { reportNativeVideoStarted } from "@/shared/lib/media/videoQualityTelemetry";
import { feedV2PreviewHeight } from "./feedV2PreviewHeight";

/** Single progressive-MP4 player across all visible Moments, no HLS or playback tickets. */
let active: { stop: () => void; postId: string } | undefined;
export function stopFeedV2OutsidePosts(visible: Set<string>) {
  if (active && !visible.has(active.postId)) active.stop();
}

export function FeedV2Image({ media, width }: { media: FeedV2ImageMedia; width: number }) {
  const [full, setFull] = useState(false);
  const pixels = width * Math.min(3, PixelRatio.get());
  const source = pixels > 720 ? media.urls.large : pixels > 360 ? media.urls.medium : media.urls.small;
  const variant = pixels > 720 ? "full" : "thumb";
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel="Открыть фотографию"
      onPress={() => setFull(true)}>
      <CdnImage cdnUrl={source}
        requestFallback={() => feedApi.requestMediaFallback(media.id, variant)}
        contentFit="contain"
        style={{ width, aspectRatio: media.width / media.height }} />
    </Pressable>
    {full && <Modal visible transparent animationType="fade"
      onRequestClose={() => setFull(false)} statusBarTranslucent>
      <GestureHandlerRootView style={s.modal}>
        <SwipeDismissMedia onDismiss={() => setFull(false)}>
          <Pressable style={s.modal} onPress={() => setFull(false)} accessibilityRole="button"
            accessibilityLabel="Закрыть просмотр">
        <CdnImage cdnUrl={media.urls.large}
          requestFallback={() => feedApi.requestMediaFallback(media.id, "full")}
          contentFit="contain" style={s.fullImage} />
        <View style={s.close}><Text style={s.closeText}>×</Text></View>
          </Pressable>
        </SwipeDismissMedia>
      </GestureHandlerRootView>
    </Modal>}
  </View>;
}

function ActiveFeedV2Player({ url, publicMedia, onError, onReady, onStarted, fullscreen, quality, variants, onQualityChange }: {
  url: string; publicMedia: boolean; onError: () => void; onReady: () => void; onStarted: (url:string)=>void; fullscreen: boolean;
  quality: VideoQualityMode; variants: FeedV2VideoMedia["mp4"];
  onQualityChange: (mode: VideoQualityMode) => void;
}) {
  const initialSource = useRef({ uri: url, contentType: "progressive" as const,
    useCaching: publicMedia && isLongLivedPublicFeedCdnUrl(url) });
  const player = useVideoPlayer(initialSource.current, instance => {
    instance.staysActiveInBackground = false;
    instance.showNowPlayingNotification = false;
    instance.play();
  });
  // Both inline and fullscreen views use one seekable touch layer. Native
  // playback chrome is disabled to avoid duplicate/hidden controls.
  const [isPlaying, setIsPlaying] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const loadedUrl = useRef(url);
  // A quality selection must reuse the same native player: preserve current
  // second and playing/paused state rather than remounting/starting at zero.
  useEffect(() => {
    if (loadedUrl.current === url) return;
    loadedUrl.current = url;
    const position = player.currentTime;
    const resume = player.playing;
    let live = true;
    void player.replaceAsync({ uri: url, contentType: "progressive",
      useCaching: publicMedia && isLongLivedPublicFeedCdnUrl(url) })
      .then(() => {
        if (!live) return;
        if (Number.isFinite(position) && position > 0) {
          const duration = player.duration;
          player.currentTime = Number.isFinite(duration)
            ? Math.min(position, Math.max(0, duration - 0.1)) : position;
        }
        if (resume) player.play();
      }).catch(() => { if (live) onError(); });
    return () => { live = false; };
  }, [url, player, publicMedia, onError]);
  useEffect(() => {
    const statusListener = player.addListener("statusChange", event => {
      if (event.status === "error") onError();
      else if (event.status === "readyToPlay") {
        onReady();
        if (player.playing) onStarted(loadedUrl.current);
      }
    });
    if (player.status === "readyToPlay") onReady();
    const playingListener = player.addListener("playingChange", event => {
      setIsPlaying(event.isPlaying);
      if (event.isPlaying && player.status === "readyToPlay") onStarted(loadedUrl.current);
    });
    return () => { statusListener.remove(); playingListener.remove(); };
  }, [player, onError, onReady, onStarted]);
  const togglePlayback = () => {
    if (isPlaying) player.pause(); else player.play();
    setIsPlaying(!isPlaying);
  };
  const qualityControl = <VideoQualitySettings embedded value={quality}
    available={variants} onChange={onQualityChange} />;
  return <View style={s.videoFrame}>
    {!expanded && <>
      <VideoView player={player} style={s.videoFrame} contentFit="contain"
        nativeControls={false} fullscreenOptions={{ enable: false }}
        allowsPictureInPicture={false}
        surfaceType={Platform.OS === "android" ? "textureView" : undefined} />
      <SocialVideoControls player={player} playing={isPlaying} onToggle={togglePlayback}
        qualityControl={qualityControl}
        onExpand={fullscreen ? undefined : () => setExpanded(true)} label="Момент" />
    </>}
    {expanded && <Modal visible animationType="fade" presentationStyle="fullScreen"
      onRequestClose={() => setExpanded(false)}>
      <GestureHandlerRootView style={s.modal}>
        <SwipeDismissMedia onDismiss={() => setExpanded(false)}>
          <View style={s.expandedVideoContainer}>
            <VideoView player={player} style={s.expandedVideo} contentFit="contain"
              nativeControls={false} fullscreenOptions={{ enable: false }}
              allowsPictureInPicture={false}
              surfaceType={Platform.OS === "android" ? "textureView" : undefined} />
            <SocialVideoControls player={player} playing={isPlaying}
              onToggle={togglePlayback} qualityControl={qualityControl} label="Момент" />
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть видео"
              onPress={() => setExpanded(false)} style={s.expandedVideoClose}>
              <MaterialCommunityIcons name="close" size={26} color="#fff" />
            </Pressable>
          </View>
        </SwipeDismissMedia>
      </GestureHandlerRootView>
    </Modal>}
  </View>;
}

export function FeedV2Video({ postId, media, visible, fullscreen = false }: {
  postId: string; media: FeedV2VideoMedia; visible: boolean; fullscreen?: boolean;
}) {
  const userId = useAuthStore(state => state.user?.id);
  const { width, height } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const previewWidth = measuredWidth > 0 ? measuredWidth : width;
  const [url, setUrl] = useState<string | null>(null);
  const [quality, setQuality] = useNativeMp4Mode();
  const [error, setError] = useState("");
  const generation = useRef(0);
  const fallbackAttempted = useRef(false);
  const recoveryInProgress = useRef(false);
  const startup = useRef<{at:number; quality:Mp4Quality; hints:Mp4NetworkHints}|null>(null);
  const delivered = useRef<{source:string; quality:Mp4Quality; mode:VideoQualityMode;
    hints:Mp4NetworkHints; fallback:boolean; reported:boolean}|null>(null);
  const stop = useCallback(() => {
    generation.current++;
    recoveryInProgress.current = false;
    startup.current = null;
    delivered.current = null;
    setUrl(null);
    if (active?.stop === stop) active = undefined;
  }, []);
  useEffect(() => {
    const listener = AppState.addEventListener("change", state => { if (state !== "active") stop(); });
    return () => { listener.remove(); stop(); };
  }, [stop, userId]);
  useFocusEffect(useCallback(() => () => stop(), [stop]));
  // A manual 360p/720p choice persists across posts and app launches.
  useEffect(() => { if (!visible) stop(); }, [visible, stop]);
  const chosenUrl = (mode: VideoQualityMode) => {
    const hints = nativeMp4Hints(previewWidth);
    const selected = selectMp4Quality(mode, hints);
    const resolved = media.mp4[selected] ? selected : selected === 360 ? 720 : 360;
    return {url: media.mp4[resolved] ?? null, quality:resolved as Mp4Quality, hints};
  };
  const chooseQuality = (mode: VideoQualityMode) => {
    if (mode === quality) return;
    setQuality(mode);
    startup.current = null; // Changing quality manually is not a network startup sample.
    if (url) {
      // Only an explicit user selection replaces the playing MP4.
      // A newly completed 360p never interrupts an existing 720p stream.
      const chosen = chosenUrl(mode);
      if (chosen.url) {
        if (chosen.url !== url) delivered.current = {source:chosen.url,quality:chosen.quality,
          mode,hints:chosen.hints,fallback:false,reported:false};
        setUrl(chosen.url);
      }
      else { stop(); setError("Видео недоступно."); }
      fallbackAttempted.current = false;
    }
  };
  const play = () => {
    active?.stop(); active = { stop, postId };
    const current = ++generation.current;
    fallbackAttempted.current = false;
    recoveryInProgress.current = false;
    delivered.current = null;
    setError("");
    void (async () => {
      // Read persisted preference even on a tap immediately after app startup.
      const preferred = await loadNativeMp4Mode();
      if (current !== generation.current) return;
      if (quality !== preferred) setQuality(preferred);
      const chosen = chosenUrl(preferred);
      const primary = chosen.url;
      if (!primary) { setError("Видео недоступно."); return; }
      if (mediaCdnKindFromSignedUrl(primary) === "feed" &&
          await prefersCloudruMedia("feed")) {
        try {
          const fallback = await feedApi.requestMediaFallback(media.id,
            ("video" + chosen.quality) as "video360" | "video720");
          if (current !== generation.current) return;
          if (isSignedCloudruFallback(fallback.url)) {
            fallbackAttempted.current = true;
            delivered.current = {source:fallback.url,quality:chosen.quality,mode:preferred,
              hints:chosen.hints,fallback:true,reported:false};
            setUrl(fallback.url);
            return;
          }
        } catch { /* Only the API may authorize a Cloud.ru fallback. */ }
      }
      if (current !== generation.current) return;
      startup.current = {at:Date.now(), quality:chosen.quality, hints:chosen.hints};
      delivered.current = {source:primary,quality:chosen.quality,mode:preferred,
        hints:chosen.hints,fallback:false,reported:false};
      setUrl(primary);
    })().catch(() => {
      if (current !== generation.current) return;
      const chosen = chosenUrl(quality);
      if (!chosen.url) { setError("Видео недоступно."); return; }
      startup.current = {at:Date.now(), quality:chosen.quality, hints:chosen.hints};
      delivered.current = {source:chosen.url,quality:chosen.quality,mode:quality,
        hints:chosen.hints,fallback:false,reported:false};
      setUrl(chosen.url);
    });
  };
  const onVideoStarted = useCallback((playedUrl: string) => {
    const sample = delivered.current;
    if (!sample || sample.source !== playedUrl || sample.reported) return;
    sample.reported = true;
    reportNativeVideoStarted({surface:"moments",quality:sample.quality,mode:sample.mode,
      available:media.mp4,hints:sample.hints,fallback:sample.fallback});
  }, [media.mp4]);
  const onVideoReady = useCallback(() => {
    const current = startup.current;
    if (!current || fallbackAttempted.current) return;
    startup.current = null;
    observeNativeMp4Start(current.hints,current.quality,Date.now()-current.at);
  }, []);
  // A native player hides the HTTP status: probe the signed CDN URL
  // before issuing an authorized, short-lived S3 fallback. Never retry twice.
  const onPlaybackError = useCallback(() => {
    const failedUrl = url;
    if (recoveryInProgress.current) return;
    if (!failedUrl || fallbackAttempted.current) {
      stop(); setError("Видео недоступно."); return;
    }
    fallbackAttempted.current = true;
    startup.current = null;
    recoveryInProgress.current = true;
    const current = generation.current;
    void (async () => {
      if (mediaCdnKindFromSignedUrl(failedUrl) !== "feed") return false;
      const outage = await probeCdnOutage(failedUrl, { nativeNetwork: true, timeoutMs: 8500 });
      if (!outage) return false;
      const quality = (Object.entries(media.mp4) as [string, string][])
        .find(([, value]) => value === failedUrl)?.[0];
      if (!quality || !["360", "720"].includes(quality)) return false;
      const fallback = await feedApi.requestMediaFallback(
        media.id, `video${quality}` as "video360" | "video720");
      if (!isSignedCloudruFallback(fallback.url) || current !== generation.current) return false;
      const sample = delivered.current;
      if (sample) delivered.current = {...sample,source:fallback.url,
        fallback:true,reported:false};
      setUrl(fallback.url);
      return true;
    })().then(recovered => {
      if (!recovered && current === generation.current) { stop(); setError("Видео недоступно."); }
    }).catch(() => {
      if (current === generation.current) { stop(); setError("Видео недоступно."); }
    }).finally(() => {
      if (current === generation.current) recoveryInProgress.current = false;
    });
  }, [url, media.id, media.mp4, stop]);
  const frameHeight = fullscreen ? Math.max(1, Math.round(height * 0.78))
    : feedV2PreviewHeight(media, previewWidth, height);
  return <View style={[s.video, { height: frameHeight }]}
    onLayout={event => {
      const next = Math.max(1, Math.round(event.nativeEvent.layout.width));
      setMeasuredWidth(previous => Math.abs(previous - next) > 1 ? next : previous);
    }}>
    {url ? <ActiveFeedV2Player url={url} publicMedia={isLongLivedPublicFeedCdnUrl(url)}
      onError={onPlaybackError} onReady={onVideoReady} onStarted={onVideoStarted}
      fullscreen={fullscreen} quality={quality}
      variants={media.mp4} onQualityChange={chooseQuality} /> :
      <Pressable style={s.videoFrame} accessibilityRole="button"
        accessibilityLabel="Воспроизвести видео"
        disabled={!visible} onPress={event => { event.stopPropagation(); play(); }}>
        <CdnImage cdnUrl={media.posterUrl}
          requestFallback={() => feedApi.requestMediaFallback(media.id, "poster")}
          contentFit="contain" style={s.videoFrame} />
        <View style={s.play}><Text style={s.playText}>▶</Text></View>
      </Pressable>}
    {error !== "" && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
}
const s = StyleSheet.create({
  video: { width: "100%", overflow: "hidden", backgroundColor: "#151515" },
  videoFrame: { width: "100%", height: "100%", backgroundColor: "#151515" },
  expandedVideoContainer: { flex: 1, backgroundColor: "#101010", justifyContent: "center" },
  expandedVideo: { width: "100%", height: "100%" },
  expandedVideoClose: { position: "absolute", top: 54, right: 16, zIndex: 2,
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.7)" },
  play: { position: "absolute", alignSelf: "center", top: "42%", width: 50, height: 50,
    borderRadius: 25, backgroundColor: "#222b", alignItems: "center", justifyContent: "center" },
  playText: { color: "#fff", fontSize: 24 },
  error: { color: "#fff", padding: 12 },
  modal: { flex: 1, backgroundColor: "#101010", justifyContent: "center" },
  fullImage: { width: "100%", height: "100%" },
  close: { position: "absolute", top: 8, right: 8, zIndex: 101, padding: 12 },
  closeText: { fontSize: 30, color: "#fff" },
});
