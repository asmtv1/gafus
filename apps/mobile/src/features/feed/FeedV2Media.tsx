import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Modal, PixelRatio, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useFocusEffect } from "expo-router";
import { useAuthStore } from "@/shared/stores";
import { feedApi } from "@/shared/lib/api/feed";
import { CdnImage, isSignedCloudruFallback } from "@/shared/components/media/CdnImage";
import { prefersCloudruMedia } from "@/shared/lib/media/serverHealth";
import { isLongLivedPublicFeedCdnUrl } from "@/shared/components/media/scopedMediaCache";
import { mediaCdnKindFromSignedUrl, probeCdnOutage } from "@gafus/core-client/media-delivery";
import { selectFeedV2VideoUrl, type FeedV2ImageMedia, type FeedV2VideoMedia } from "@gafus/types";
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
      <Pressable style={s.modal} onPress={() => setFull(false)} accessibilityRole="button"
        accessibilityLabel="Закрыть просмотр">
        <CdnImage cdnUrl={media.urls.large}
          requestFallback={() => feedApi.requestMediaFallback(media.id, "full")}
          contentFit="contain" style={s.fullImage} />
        <View style={s.close}><Text style={s.closeText}>×</Text></View>
      </Pressable>
    </Modal>}
  </View>;
}

function ActiveFeedV2Player({ url, publicMedia, onError }: {
  url: string; publicMedia: boolean; onError: () => void;
}) {
  const player = useVideoPlayer({ uri: url, contentType: "progressive", useCaching: publicMedia && isLongLivedPublicFeedCdnUrl(url) }, instance => {
    instance.staysActiveInBackground = false;
    instance.showNowPlayingNotification = false;
    instance.play();
  });
  useEffect(() => {
    const listener = player.addListener("statusChange", event => {
      if (event.status === "error") onError();
    });
    return () => listener.remove();
  }, [player, onError]);
  return <VideoView player={player} style={s.videoFrame} contentFit="contain"
    nativeControls fullscreenOptions={{ enable: true }}
    allowsPictureInPicture={false} />;
}

export function FeedV2Video({ postId, media, visible, fullscreen = false }: {
  postId: string; media: FeedV2VideoMedia; visible: boolean; fullscreen?: boolean;
}) {
  const userId = useAuthStore(state => state.user?.id);
  const { width, height } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const previewWidth = measuredWidth > 0 ? measuredWidth : width;
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const fallbackAttempted = useRef(false);
  const recoveryInProgress = useRef(false);
  const stop = useCallback(() => {
    generation.current++;
    recoveryInProgress.current = false;
    setUrl(null);
    if (active?.stop === stop) active = undefined;
  }, []);
  useEffect(() => {
    const listener = AppState.addEventListener("change", state => { if (state !== "active") stop(); });
    return () => { listener.remove(); stop(); };
  }, [stop, userId]);
  useFocusEffect(useCallback(() => () => stop(), [stop]));
  useEffect(() => { if (!visible) stop(); }, [visible, stop]);
  const play = () => {
    active?.stop(); active = { stop, postId };
    const current = ++generation.current;
    fallbackAttempted.current = false;
    recoveryInProgress.current = false;
    setError("");
    const primary = selectFeedV2VideoUrl(media, { viewportWidth: previewWidth,
      preference: "auto", devicePixelRatio: 1 });
    const quality = (Object.entries(media.mp4) as [string, string][])
      .find(([, value]) => value === primary)?.[0];
    // When the server already knows the CDN is down, don't make the native
    // player fail first. Resolve an ACL-checked per-object S3 URL directly.
    void (async () => {
      if (mediaCdnKindFromSignedUrl(primary) === "feed" &&
          quality && ["360", "720", "1080"].includes(quality) &&
          await prefersCloudruMedia("feed")) {
        try {
          const fallback = await feedApi.requestMediaFallback(media.id,
            `video${quality}` as "video360" | "video720" | "video1080");
          if (current !== generation.current) return;
          if (isSignedCloudruFallback(fallback.url)) {
            fallbackAttempted.current = true;
            setUrl(fallback.url);
            return;
          }
        } catch { /* No bypass without an authorized signed link. */ }
      }
      if (current === generation.current) setUrl(primary);
    })().catch(() => { if (current === generation.current) setUrl(primary); });
  };
  // A native player hides the HTTP status: probe the signed CDN URL
  // before issuing an authorized, short-lived S3 fallback. Never retry twice.
  const onPlaybackError = useCallback(() => {
    const failedUrl = url;
    if (recoveryInProgress.current) return;
    if (!failedUrl || fallbackAttempted.current) {
      stop(); setError("Видео недоступно."); return;
    }
    fallbackAttempted.current = true;
    recoveryInProgress.current = true;
    const current = generation.current;
    void (async () => {
      if (mediaCdnKindFromSignedUrl(failedUrl) !== "feed") return false;
      const outage = await probeCdnOutage(failedUrl, { nativeNetwork: true, timeoutMs: 8500 });
      if (!outage) return false;
      const quality = (Object.entries(media.mp4) as [string, string][])
        .find(([, value]) => value === failedUrl)?.[0];
      if (!quality || !["360", "720", "1080"].includes(quality)) return false;
      const fallback = await feedApi.requestMediaFallback(
        media.id, `video${quality}` as "video360" | "video720" | "video1080");
      if (!isSignedCloudruFallback(fallback.url) || current !== generation.current) return false;
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
      onError={onPlaybackError} /> :
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
  play: { position: "absolute", alignSelf: "center", top: "42%", width: 50, height: 50,
    borderRadius: 25, backgroundColor: "#222b", alignItems: "center", justifyContent: "center" },
  playText: { color: "#fff", fontSize: 24 },
  error: { color: "#fff", padding: 12 },
  modal: { flex: 1, backgroundColor: "#101010", justifyContent: "center" },
  fullImage: { width: "100%", height: "100%" },
  close: { position: "absolute", top: 8, right: 8, zIndex: 101, padding: 12 },
  closeText: { fontSize: 30, color: "#fff" },
});
