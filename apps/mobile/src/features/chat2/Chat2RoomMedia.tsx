import { MeasuredVideoView } from "@/shared/components/MeasuredVideoView";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, PixelRatio, Linking, Text, View, ActivityIndicator, Alert, Modal } from "react-native";
import { createVideoPlayer, type VideoPlayer, type VideoThumbnail } from "expo-video";
import { SerializedVideoSource } from "@/shared/lib/media/serializedVideoSource";
import { playVideoFromBeginningIfEnded } from "@/shared/lib/media/replayVideo";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SwipeDismissMedia } from "@/shared/components/media/SwipeDismissMedia";
import { VideoQualitySettings } from "@/shared/components/media/VideoQualitySettings";
import { SocialVideoControls } from "@/shared/components/media/SocialVideoControls";
import { nativeMp4Hints, observeNativeMp4Start, loadNativeMp4Mode, useNativeMp4Mode } from "@/shared/lib/media/videoPlaybackPolicy";
import { reportNativeVideoStarted } from "@/shared/lib/media/videoQualityTelemetry";
import { videoServerFailureMessage } from "@/shared/lib/media/videoRetryMessage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { chat2ImageSource, chat2VideoSource, chat2MatchedS3Variant, chat2CdnS3FailoverAllowed, type Chat2QualityMode } from "@gafus/chat-media-quality";
import { reportClientError } from "@/shared/lib/error-reporting";
import { Chat2ImageBrowse } from "./Chat2ImageBrowse";
import { chat2, type Attachment } from "./api";
import { isCacheableChat2FinalUrl } from "./publicFinalCache";
import { chatVideoFrameHeight } from "./chatVideoFrame";
import { readProcessedChat2Media } from "./mediaProcessing";
import { olive } from "./chat2RoomStyles";
/** Images use API-authorized CDN/S3 pairs. Fullscreen stays inside the app. */
export function NativeChat2Media({ conversationId, file, images }: {
  conversationId: string; file: Attachment; images: Attachment[];
}) {
  if (file.kind === "video") return <NativeChat2Video conversationId={conversationId} file={file} />;
  if (file.kind === "file") return <NativeChat2Document conversationId={conversationId} file={file} />;
  return <NativeChat2Image conversationId={conversationId} file={file} images={images} />;
}


/** Existing PDF attachments retain the authenticated external document viewer. */
function NativeChat2Document({ conversationId, file }: {
  conversationId: string; file: Attachment;
}) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const media = await chat2.media(conversationId, file.id);
      if (!media.url) throw new Error("CHAT2_DOCUMENT_UNAVAILABLE");
      await Linking.openURL(media.url);
    } catch {
      reportClientError(new Error("CHAT2_DOCUMENT_OPEN_FAILED"), {
        issueKey: "Chat2Room", keys: { operation: "document_open" },
      });
      Alert.alert("Вложение недоступно", "Попробуйте обновить чат");
    } finally { setBusy(false); }
  };
  return <Pressable accessibilityRole="button" onPress={() => void open()}
    accessibilityLabel={`Открыть документ ${file.name}`}
    disabled={busy} style={{ paddingVertical: 12 }}>
    <Text style={{ color: olive, fontSize: 12 }}>
      {busy ? "Открываем документ…" : `📎 ${file.name}`}
    </Text>
  </Pressable>;
}


type Chat2ImageViewer = {
  url: string;
  fallbackUrl: string | null;
  triedFallback: boolean;
  failed: boolean;
};

function NativeChat2Image({ conversationId, file, images }: {
  conversationId: string; file: Attachment; images: Attachment[];
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [pending, setPending] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [viewer, setViewer] = useState<Chat2ImageViewer | null>(null);
  const [viewerFileId, setViewerFileId] = useState(file.id);
  const [viewerLoading, setViewerLoading] = useState(false);
  const viewerFlight = useRef(0);
  const closeViewer = () => { viewerFlight.current++; setViewer(null); setViewerLoading(false); };
  const triedFallback = useRef(false);
  const requestGeneration = useRef(0);
  useEffect(() => {
    const generation = ++requestGeneration.current;
    let live = true;
    const controller = new AbortController();
    setPending(true);
    setProcessing(false);
    setFailed(false);
    setUrl(null);
    setFallbackUrl(null);
    setUsingFallback(false);
    triedFallback.current = false;
    void readProcessedChat2Media(
      () => chat2.media(conversationId, file.id), controller.signal,
      () => { if (live) setProcessing(true); },
      2500, 36, // 90s bounded wait: never strand a video behind an absent Job.
    ).then(result => {
        if (!live || requestGeneration.current !== generation) return;
        const primary = file.kind === "image"
          ? chat2ImageSource(result.renditions?.image, 220, PixelRatio.get(),
              result.renditions?.imageWidths) ?? result.url
          : result.url;
        setFallbackUrl(chat2MatchedS3Variant(primary, result));
        setUrl(primary);
      })
      .catch(() => {
        if (!live || requestGeneration.current !== generation) return;
        reportClientError(new Error("CHAT2_MEDIA_FETCH_FAILED"), {
          issueKey: "Chat2Room", keys: { operation: "media_fetch" },
        });
        setFailed(true);
      })
      .finally(() => {
        if (live && requestGeneration.current === generation) setPending(false);
      });
    const currentGeneration = requestGeneration;
    return () => {
      live = false;
      controller.abort();
      currentGeneration.current++;
    };
  }, [conversationId, file.id, file.kind, reload]);
  const retry = () => {
    closeViewer();
    setReload(previous => previous + 1);
  };
  const thumbnailFailure = () => {
    if (triedFallback.current || !url || !fallbackUrl || usingFallback) {
      setFailed(true);
      return;
    }
    triedFallback.current = true;
    const generation = requestGeneration.current;
    const original = url;
    void chat2CdnS3FailoverAllowed(original, fallbackUrl, fetch, true)
      .then(allowed => {
        if (requestGeneration.current !== generation) return;
        if (allowed) { setUsingFallback(true); setUrl(fallbackUrl); }
        else setFailed(true);
      })
      .catch(() => {
        if (requestGeneration.current === generation) setFailed(true);
      });
  };
  async function open() {
    if (pending || failed) return;
    const viewerRequest = ++viewerFlight.current;
    const generation = requestGeneration.current;
    try {
      // Obtain fresh URLs: a message may have been visible longer than its signed TTL.
      const refreshed = await chat2.media(conversationId, file.id);
      if (requestGeneration.current !== generation ||
          viewerFlight.current !== viewerRequest) return;
      const primary = refreshed.renditions?.image?.[1440] ?? refreshed.url;
      const fallback = chat2MatchedS3Variant(primary, refreshed);
      setViewerFileId(file.id);
      setViewer({ url: primary, fallbackUrl: fallback, triedFallback: false, failed: false });
    } catch {
      if (requestGeneration.current !== generation ||
          viewerFlight.current !== viewerRequest) return;
      reportClientError(new Error("CHAT2_MEDIA_OPEN_FAILED"), {
        issueKey: "Chat2Room", keys: { operation: "media_open" },
      });
      Alert.alert("Вложение недоступно", "Попробуйте обновить фотографию");
    }
  }
  async function navigateImageAt(targetId: string) {
    if (!images.some(item => item.id === targetId) || !viewer) return;
    const generation = requestGeneration.current;
    const viewerRequest = ++viewerFlight.current;
    setViewerFileId(targetId);
    setViewerLoading(true);
    setViewer({ url: "", fallbackUrl: null, triedFallback: false, failed: false });
    try {
      // Every photo must be authorized independently; never reuse thumbnail URLs.
      const fresh = await chat2.media(conversationId, targetId);
      if (generation !== requestGeneration.current ||
          viewerFlight.current !== viewerRequest) return;
      const primary = fresh.renditions?.image?.[1440] ?? fresh.url;
      setViewer({ url: primary, fallbackUrl: chat2MatchedS3Variant(primary, fresh),
        triedFallback: false, failed: false });
    } catch {
      if (generation !== requestGeneration.current ||
          viewerFlight.current !== viewerRequest) return;
      reportClientError(new Error("CHAT2_IMAGE_BROWSE_FAILED"), {
        issueKey: "Chat2Room", keys: { operation: "browse_image" },
      });
      setViewer({ url: "", fallbackUrl: null, triedFallback: false, failed: true });
    } finally {
      if (generation === requestGeneration.current && viewerFlight.current === viewerRequest)
        setViewerLoading(false);
    }
  }
  const navigateImage = (direction: -1 | 1) => {
    const currentIndex = images.findIndex(item => item.id === viewerFileId);
    const target = images[currentIndex + direction];
    if (currentIndex >= 0 && target) void navigateImageAt(target.id);
  };
  const fullscreenFailure = (failedUrl: string) => {
    if (!viewer || viewer.url !== failedUrl) return;
    if (viewer.triedFallback || !viewer.fallbackUrl) {
      setViewer(previous => previous?.url === failedUrl
        ? { ...previous, failed: true } : previous);
      return;
    }
    const { url: original, fallbackUrl: backup } = viewer;
    const generation = requestGeneration.current;
    setViewer(previous => previous?.url === original
      ? { ...previous, triedFallback: true } : previous);
    void chat2CdnS3FailoverAllowed(original, backup, fetch, true)
      .then(allowed => {
        if (requestGeneration.current !== generation) return;
        setViewer(previous => previous?.url !== original ? previous :
          allowed ? { ...previous, url: backup, triedFallback: true } :
            { ...previous, failed: true });
      })
      .catch(() => {
        if (requestGeneration.current !== generation) return;
        setViewer(previous => previous?.url === original
          ? { ...previous, failed: true } : previous);
      });
  };
  return <>
    <Pressable accessibilityRole="button"
      accessibilityLabel={failed ? `Повторить загрузку ${file.name}` : `Открыть ${file.name}`}
      onPress={failed ? retry : () => void open()}
      disabled={pending}
      style={{ marginTop: 8 }}>
      {file.kind === "image" && url && !failed ? <ExpoImage
        source={{ uri: url }}
        cachePolicy={isCacheableChat2FinalUrl(url) ? "memory-disk" : "memory"}
        onError={thumbnailFailure}
        contentFit="contain"
        style={{ width: 220, height: 180, borderRadius: 12, backgroundColor: "#fff" }}
      /> : <View style={{ width: 220, minHeight: 96, alignItems: "center",
        justifyContent: "center", backgroundColor: "#edf1e4", borderRadius: 12, padding: 10 }}>
        {pending ? <View style={{ alignItems: "center", gap: 6 }}>
          <ActivityIndicator color={olive} />
          <Text style={{ color: olive, fontSize: 12 }}>
            {processing ? "Обрабатываем фото…" : "Загружаем фото…"}
          </Text>
        </View> :
          <Text style={{ color: olive, fontSize: 12 }}>
            {failed ? "Не удалось загрузить фото · Повторить" : `📎 ${file.name}`}
          </Text>}
      </View>}
    </Pressable>
    <Modal visible={Boolean(viewer)} transparent animationType="fade"
      statusBarTranslucent onRequestClose={closeViewer}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000e" }}>
        <SwipeDismissMedia onDismiss={closeViewer}>
          <View style={{ flex: 1, justifyContent: "center" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть фотографию"
          onPress={closeViewer}
          style={{ position: "absolute", top: 55, right: 20, zIndex: 2,
            backgroundColor: "#243127", width: 44, height: 44, borderRadius: 22,
            alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontSize: 28, lineHeight: 34 }}>×</Text>
        </Pressable>
        {viewer && images.length > 1 && <View style={{ position: "absolute", top: 65,
          left: 18, zIndex: 2 }} pointerEvents="none">
          <Text style={{ color: "#fff", fontSize: 14 }}>
            {Math.max(1, images.findIndex(item => item.id === viewerFileId) + 1)} / {images.length}
          </Text>
        </View>}
        <Chat2ImageBrowse enabled={Boolean(viewer) && !viewerLoading && images.length > 1}
          onNavigate={navigateImage}>
        {viewerLoading ? <ActivityIndicator color="#fff" size="large" /> : null}
        {viewer?.failed ? <Pressable accessibilityRole="button"
          accessibilityLabel="Повторить открытие фотографии"
          onPress={() => void navigateImageAt(viewerFileId)}
          style={{ padding: 20, alignItems: "center" }}>
          <Text accessibilityRole="alert" style={{ color: "#fff", textAlign: "center" }}>
            Не удалось открыть фотографию · Повторить
          </Text>
        </Pressable> : viewer && <ExpoImage source={{ uri: viewer.url }}
          cachePolicy={isCacheableChat2FinalUrl(viewer.url) ? "memory-disk" : "memory"}
          contentFit="contain" onError={() => fullscreenFailure(viewer.url)}
          style={{ width: "100%", height: "82%" }} />}
        </Chat2ImageBrowse>
          </View>
        </SwipeDismissMedia>
      </GestureHandlerRootView>
    </Modal>
  </>;
}


/** Mount the paused native player with the message: it can render the first frame
 * even for legacy MP4s that do not have a separately processed poster. */
function NativeChat2VideoPlayer({
  url, onError, onReady, seekTo, onPlayer, onPlayingChange, onPlaybackEnd, resumeOnReady,
  requestThumbnail, onThumbnail, hideView = false, frameHeight = 220, onDimensions,
}: {
  url: string;
  onError: () => void;
  onReady: (elapsedMs: number) => void;
  seekTo: number;
  onPlayer: (player: VideoPlayer | null) => void;
  onPlayingChange: (playing: boolean) => void;
  onPlaybackEnd: () => void;
  resumeOnReady: boolean;
  requestThumbnail: boolean;
  onThumbnail: (url: string, frame: VideoThumbnail) => void;
  hideView?: boolean;
  frameHeight?: number;
  onDimensions: (width: number, height: number) => void;
}) {
  const startupAt = useRef(Date.now());
  const readyRecorded = useRef(false);
  const thumbnailRequested = useRef(false);
  const firstUrl = useRef(url);
  const loadedUrl = useRef(firstUrl.current);
  const requestedUrl = useRef(firstUrl.current);
  const replacing = useRef(false);
  const seekOnReady = useRef<{url: string; time: number; resume: boolean} | null>(
    { url: firstUrl.current, time: seekTo, resume: resumeOnReady });
  const mounted = useRef(false);
  // SDK 55's useVideoPlayer releases the SharedObject on unmount even when an
  // asynchronous replacement is running. Own it explicitly and release only
  // after the last replaceAsync settles, not while iOS is still loading an item.
  const [owned, setOwned] = useState<{
    player: VideoPlayer;
    source: SerializedVideoSource<{ uri: string; contentType: "progressive"; useCaching: boolean }>;
  } | null>(null);
  const latest = useRef({ url, onError, onReady, onPlayingChange, onPlaybackEnd,
    onDimensions, onThumbnail, requestThumbnail });
  latest.current = { url, onError, onReady, onPlayingChange, onPlaybackEnd,
    onDimensions, onThumbnail, requestThumbnail };
  const onNativeStatus = useRef<(status: string) => void>(() => undefined);

  useEffect(() => {
    mounted.current = true;
    const player = createVideoPlayer({ uri: firstUrl.current, contentType: "progressive",
      useCaching: isCacheableChat2FinalUrl(firstUrl.current) });
    player.staysActiveInBackground = false;
    player.showNowPlayingNotification = false;
    player.pause(); // The chat preview never autoplays.
    const source = new SerializedVideoSource(player);
    setOwned({ player, source });
    return () => {
      mounted.current = false;
      source.dispose();
    };
  }, []);
  const player = owned?.player;

  useEffect(() => {
    if (!player) return;
    onPlayer(player);
    return () => onPlayer(null);
  }, [player, onPlayer]);

  // One native player/VideoView survives every 360p ↔ 720p change. Rapid
  // selections are serialized and superseded work is dropped. A source change
  // restores the captured position and playing state after the new MP4 is ready.
  useEffect(() => {
    if (!owned || requestedUrl.current === url) return;
    requestedUrl.current = url;
    replacing.current = true;
    seekOnReady.current = { url, time: seekTo, resume: resumeOnReady };
    void owned.source.replace({ uri: url, contentType: "progressive",
      useCaching: isCacheableChat2FinalUrl(url) }, () => {
      loadedUrl.current = url;
      replacing.current = false;
      onNativeStatus.current(owned.player.status);
    }).catch(() => {
      if (mounted.current && requestedUrl.current === url) {
        replacing.current = false;
        latest.current.onError();
      }
    });
  }, [owned, url, seekTo, resumeOnReady]);

  useEffect(() => {
    if (!owned) return;
    const player = owned.player;
    let failedUrl: string | null = null;
    const onStatus = (status: string) => {
      if (!mounted.current || replacing.current || loadedUrl.current !== latest.current.url) return;
      if (status === "error") {
        if (failedUrl !== loadedUrl.current) {
          failedUrl = loadedUrl.current;
          latest.current.onError();
        }
        return;
      }
      if (status !== "readyToPlay") return;
      const size = player.videoTrack?.size;
      if (size?.width && size?.height) latest.current.onDimensions(size.width, size.height);
      if (!readyRecorded.current) {
        readyRecorded.current = true;
        latest.current.onReady(Date.now() - startupAt.current);
      }
      const pendingSeek = seekOnReady.current;
      if (pendingSeek?.url === loadedUrl.current) {
        seekOnReady.current = null;
        if (pendingSeek.time > 0) {
          const duration = player.duration;
          player.currentTime = Number.isFinite(duration)
            ? Math.min(pendingSeek.time, Math.max(0, duration - 0.1)) : pendingSeek.time;
        }
        if (pendingSeek.resume) player.play();
      }
      // A thumbnail is generated at most once for this message. Generating
      // again while changing the player item can overlap the iOS generator.
      if (latest.current.requestThumbnail && !thumbnailRequested.current) {
        thumbnailRequested.current = true;
        void owned.source.perform(
          () => player.generateThumbnailsAsync(0, { maxWidth: 440, maxHeight: 440 }),
          frames => {
            if (mounted.current && frames[0]) {
              latest.current.onThumbnail(loadedUrl.current, frames[0]);
            }
          },
        ).catch(() => undefined);
      }
    };
    onNativeStatus.current = onStatus;
    const statusListener = player.addListener("statusChange", ({ status }) => onStatus(status));
    const playingListener = player.addListener("playingChange", ({ isPlaying }) =>
      latest.current.onPlayingChange(isPlaying));
    const endedListener = player.addListener("playToEnd", () => latest.current.onPlaybackEnd());
    onStatus(player.status);
    return () => {
      onNativeStatus.current = () => undefined;
      statusListener.remove(); playingListener.remove(); endedListener.remove();
    };
  }, [owned]);
  if (hideView) return null; // Modal takes sole ownership of this native VideoView.
  return <MeasuredVideoView frameSurface="chat" player={player ?? null}
    style={{ width: 220, height: frameHeight, backgroundColor: "#17211d" }}
    contentFit="contain" nativeControls={false} allowsPictureInPicture={false}
    surfaceType={Platform.OS === "android" ? "textureView" : undefined} />;
}


function NativeChat2Video({ conversationId, file }: { conversationId: string; file: Attachment }) {
  type MediaResponse = Awaited<ReturnType<typeof chat2.media>>;
  const [media, setMedia] = useState<MediaResponse | null>(null);
  const [quality, setQuality] = useNativeMp4Mode();
  // Freeze automatic selection for this file so a mid-playback network change cannot
  // silently swap progressive MP4 URLs.
  const qualityHints = useRef(nativeMp4Hints(220));
  const [, refreshAutoSelection] = useState(0);
  const [seekTo, setSeekTo] = useState(0);
  const [resumeOnReady, setResumeOnReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playbackEnded = useRef(false);
  const [everPlayed, setEverPlayed] = useState(false);
  const [thumbnail, setThumbnail] = useState<{ url: string; frame: VideoThumbnail } | null>(null);
  const [posterFailed, setPosterFailed] = useState(false);
  const [posterViaS3, setPosterViaS3] = useState(false);
  const playerRef = useRef<VideoPlayer | null>(null);
  const [controlPlayer, setControlPlayer] = useState<VideoPlayer | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [trackSize, setTrackSize] = useState<{ width: number; height: number } | null>(null);
  const signedAt = useRef(0);
  const [pending, setPending] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(false);
  const [processingFailure, setProcessingFailure] = useState(false);
  const [reload, setReload] = useState(0);
  const [usingFallback, setUsingFallback] = useState(false);
  const recoveryInProgress = useRef(false);
  const playIntent = useRef(false);
  const reportedRendition = useRef<string|null>(null);
  const recoveryGeneration = useRef(0);

  // Same lifecycle as Web: fetch the authorized media/cover immediately on mount.
  // Keep the player paused until a user explicitly taps Play.
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const generation = ++recoveryGeneration.current;
    recoveryInProgress.current = false;
    playIntent.current = false;
    reportedRendition.current = null;
    setPending(true);
    setProcessing(false);
    setError(false);
    setProcessingFailure(false);
    setMedia(null);
    void readProcessedChat2Media(
      () => chat2.media(conversationId, file.id), controller.signal,
      () => { if (live) setProcessing(true); },
    ).then(result => {
        if (!live) return;
        signedAt.current = Date.now();
        qualityHints.current = nativeMp4Hints(220);
        setMedia(result);
        setPosterFailed(false);
        setPosterViaS3(false);
        setUsingFallback(false);
        setSeekTo(0);
        setResumeOnReady(false);
        setPlaying(false);
        setEverPlayed(false);
      })
      .catch(cause => {
        if (!live) return;
        setProcessingFailure(cause instanceof Error &&
          ["CHAT2_MEDIA_NOT_READY", "CHAT2_MEDIA_PROCESSING_TIMEOUT"].includes(cause.message));
        reportClientError(new Error("CHAT2_VIDEO_MEDIA_FETCH_FAILED"), {
          issueKey: "Chat2Room", keys: { operation: "video_media_fetch" },
        });
        setMedia(null);
        setError(true);
      })
      .finally(() => { if (live) setPending(false); });
    const recoveryRef = recoveryGeneration;
    return () => {
      live = false;
      controller.abort();
      recoveryRef.current = generation + 1;
    };
  }, [conversationId, file.id, reload]);

  const onPlayingChange = useCallback((isPlaying: boolean) => {
    setPlaying(isPlaying);
    if (!isPlaying) return;
    setEverPlayed(true);
    if (!media?.renditions?.video) return;
    const variants = usingFallback ? media.fallbackRenditions?.video : media.renditions.video;
    const source = chat2VideoSource(variants, quality, qualityHints.current);
    const selected = source === variants?.[720] ? 720 : source === variants?.[360] ? 360 : null;
    if (!source || !selected || reportedRendition.current === source) return;
    reportedRendition.current = source;
    reportNativeVideoStarted({surface:"chat",quality:selected,mode:quality,
      available:media.renditions.video,hints:qualityHints.current,fallback:usingFallback});
  }, [media, quality, usingFallback]);
  const onPlayer = useCallback((player: VideoPlayer | null) => {
    if (player && playerRef.current !== player) playbackEnded.current = false;
    playerRef.current = player;
    setControlPlayer(player);
  }, []);
  const onPlaybackEnd = useCallback(() => {
    playbackEnded.current = true;
    playIntent.current = false;
    setPlaying(false);
  }, []);
  const onDimensions = useCallback((width: number, height: number) => {
    setTrackSize(previous => previous?.width === width && previous?.height === height
      ? previous : { width, height });
  }, []);
  const onThumbnail = useCallback((url: string, frame: VideoThumbnail) => {
    setThumbnail({ url, frame });
  }, []);
  const onVideoReady = useCallback((elapsedMs: number) => {
    // A paused player may defer decoding until the user taps Play minutes later.
    // Never interpret that idle time as a slow network.
    if (usingFallback || !media || elapsedMs > 15_000) return;
    const available = media.renditions?.video;
    const source = chat2VideoSource(available, quality, qualityHints.current);
    const selected = source === available?.[720] ? 720 : source === available?.[360] ? 360 : null;
    if (selected) observeNativeMp4Start(qualityHints.current, selected, elapsedMs);
  }, [usingFallback, media, quality]);
  const onError = useCallback(() => {
    // Native players can emit multiple status errors during a single failed load.
    if (recoveryInProgress.current) return;
    const fail = () => { setPlaying(false); setError(true); setMedia(null); };
    if (usingFallback || !media) { fail(); return; }
    const primary = chat2VideoSource(media.renditions?.video, quality, qualityHints.current) ?? media.url;
    const backup = chat2MatchedS3Variant(primary, media);
    recoveryInProgress.current = true;
    const generation = recoveryGeneration.current;
    void chat2CdnS3FailoverAllowed(primary, backup, fetch, true)
      .then(allowed => {
        if (recoveryGeneration.current !== generation) return;
        if (!allowed) { fail(); return; }
        setSeekTo(playerRef.current?.currentTime ?? 0);
        setResumeOnReady(playIntent.current || Boolean(playerRef.current?.playing));
        setUsingFallback(true);
        setPosterViaS3(true);
        setPlaying(false);
      })
      .catch(() => {
        if (recoveryGeneration.current === generation) fail();
      })
      .finally(() => {
        if (recoveryGeneration.current === generation) recoveryInProgress.current = false;
      });
  }, [usingFallback, media, quality]);
  async function play() {
    if (!media || pending) return;
    playIntent.current = true;
    // The inline signed URL can expire while a user reads an older chat history.
    // Refresh only if it is stale, rather than fetching again on every tap.
    if (signedAt.current && Date.now() - signedAt.current >=
        Math.max(0, media.expiresIn - 30) * 1000) {
      setPending(true);
      try {
        const refreshed = await chat2.media(conversationId, file.id);
        signedAt.current = Date.now();
        setSeekTo(0);
        qualityHints.current = nativeMp4Hints(220);
        setUsingFallback(false);
        setPosterViaS3(false);
        setResumeOnReady(true);
        setMedia(refreshed);
        setError(false);
      } catch {
        reportClientError(new Error("CHAT2_VIDEO_SIGNED_URL_RENEW_FAILED"), {
          issueKey: "Chat2Room", keys: { operation: "video_url_renew" },
        });
        setError(true);
        setMedia(null);
      } finally { setPending(false); }
      return;
    }
    if (!everPlayed) {
      const remembered = await loadNativeMp4Mode();
      const variants = usingFallback ? media.fallbackRenditions?.video : media.renditions?.video;
      const currentSource = chat2VideoSource(variants, quality, qualityHints.current);
      // Network may have changed while the paused chat preview was visible.
      // Re-evaluate exactly once on first Play, never during playback.
      qualityHints.current = nativeMp4Hints(220);
      const wanted = chat2VideoSource(variants, remembered, qualityHints.current);
      if (remembered !== quality) setQuality(remembered);
      if (wanted && wanted !== currentSource) {
        setResumeOnReady(true);
        if (remembered === quality) refreshAutoSelection(value => value + 1);
        return;
      }
    }
    if (playerRef.current) {
      playVideoFromBeginningIfEnded(playerRef.current, playbackEnded.current);
      playbackEnded.current = false;
    }
  }
  function togglePlayback() {
    const player = playerRef.current;
    if (!player) return;
    if (playing) {
      playIntent.current = false;
      player.pause();
      setPlaying(false);
    } else {
      void play();
    }
  }
  function choose(mode: Chat2QualityMode) {
    if (mode === quality) return;
    setSeekTo(playerRef.current?.currentTime ?? 0);
    setResumeOnReady(playerRef.current?.playing ?? false);
    setQuality(mode);
  }
  function retry() {
    // Status check, not a queue restart. Only a retained local source can
    // actually rerun native encoding/upload (see uploadOneVideo above).
    setProcessingFailure(false);
    playIntent.current = false;
    recoveryInProgress.current = false;
    setMedia(null);
    setPlaying(false);
    setError(false);
    setReload(value => value + 1);
  }
  const variants = usingFallback ? media?.fallbackRenditions?.video : media?.renditions?.video;
  const url = media ? chat2VideoSource(variants, quality, qualityHints.current) ??
    (usingFallback ? media.fallbackUrl ?? null : media.url) : null;
  const posterUrl = usingFallback || posterViaS3
    ? media?.fallbackRenditions?.poster ?? media?.renditions?.poster
    : media?.renditions?.poster;
  const poster = posterFailed ? null : posterUrl;
  const previewHeight = chatVideoFrameHeight(220, trackSize?.width, trackSize?.height);
  return <View style={{ marginTop: 8, width: 220 }}>
    {url ? <View style={{ width: 220, height: previewHeight, borderRadius: 12,
        overflow: "hidden", backgroundColor: "#17211d", position: "relative" }}>
      <NativeChat2VideoPlayer url={url} onError={onError} onReady={onVideoReady} seekTo={seekTo}
        resumeOnReady={resumeOnReady} onPlayer={onPlayer} onPlayingChange={onPlayingChange}
        onPlaybackEnd={onPlaybackEnd}
        requestThumbnail={!poster} onThumbnail={onThumbnail} hideView={expanded}
        frameHeight={previewHeight} onDimensions={onDimensions} />
      {!everPlayed && !playing && (poster || thumbnail) && <View pointerEvents="none"
        style={{ position: "absolute", width: 220, height: previewHeight }}>
        {poster ? <ExpoImage source={{ uri: poster }} contentFit="contain"
          cachePolicy={isCacheableChat2FinalUrl(poster) ? "memory-disk" : "memory"}
          onError={() => {
            if (usingFallback || posterViaS3 || !media) {setPosterFailed(true);return;}
            const fallback = chat2MatchedS3Variant(poster, media);
            void chat2CdnS3FailoverAllowed(poster, fallback, fetch, true)
              .then(allowed => {
                if (allowed && fallback) setPosterViaS3(true);
                else setPosterFailed(true);
              }).catch(() => setPosterFailed(true));
          }}
          style={{ width: 220, height: previewHeight }} /> :
          thumbnail && <ExpoImage source={thumbnail.frame}
            contentFit="contain" style={{ width: 220, height: previewHeight }} />}
      </View>}
      {!expanded && <SocialVideoControls player={controlPlayer} playing={playing}
        onToggle={togglePlayback} label={file.name}
        onExpand={() => setExpanded(true)}
        qualityControl={<VideoQualitySettings embedded value={quality}
          onChange={choose} available={variants} />} />}
    </View> : <View style={{ width: 220, minHeight: 180, borderRadius: 12,
      backgroundColor: "#17211d", alignItems: "center", justifyContent: "center", padding: 16, gap: 12 }}>
      {pending ? <><ActivityIndicator color="#fff" />
        <Text style={{ color: "#fff", fontSize: 12 }}>
          {processing ? "Обрабатываем видео…" : "Загружаем видео…"}
        </Text></> :
        <><Text style={{ color: "#fff", fontSize: 12, textAlign: "center" }}>
          {error ? (processingFailure ? videoServerFailureMessage :
            "Не удалось открыть видео. Проверьте интернет. Если сервер не завершил обработку, сохраните оригинал и отправьте заново после восстановления сервиса.") :
            "Видео пока недоступно. Возможно, обработка ещё выполняется."}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Проверить доступность видео ещё раз"
            onPress={retry} style={{ paddingVertical: 7, paddingHorizontal: 14,
              backgroundColor: olive, borderRadius: 8 }}>
            <Text style={{ color: "#fff", fontSize: 12 }}>Проверить снова</Text>
          </Pressable></>}
    </View>}
    {expanded && controlPlayer && url && <Modal visible animationType="fade"
      presentationStyle="fullScreen" onRequestClose={() => setExpanded(false)}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#101010" }}>
        <SwipeDismissMedia onDismiss={() => setExpanded(false)}>
          <View style={{ flex: 1, backgroundColor: "#101010" }}>
            <MeasuredVideoView frameSurface="chat" player={controlPlayer} style={{ width: "100%", height: "100%" }}
              contentFit="contain" nativeControls={false} allowsPictureInPicture={false}
              surfaceType={Platform.OS === "android" ? "textureView" : undefined} />
            <SocialVideoControls player={controlPlayer} playing={playing} onToggle={togglePlayback}
              label={file.name} qualityControl={<VideoQualitySettings embedded value={quality}
                onChange={choose} available={variants} />} />
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть видео"
              onPress={() => setExpanded(false)} style={{ position: "absolute", top: 48,
                right: 15, width: 44, height: 44, borderRadius: 22,
                backgroundColor: "#00000099", alignItems: "center", justifyContent: "center" }}>
              <MaterialCommunityIcons name="close" color="#fff" size={25} />
            </Pressable>
          </View>
        </SwipeDismissMedia>
      </GestureHandlerRootView>
    </Modal>}
  </View>;
}
