import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { CdnImage } from "@/shared/components/media/CdnImage";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer, VideoView } from "expo-video";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { FeedMediaDto } from "@gafus/types";
import { API_BASE_URL, FONTS } from "@/shared/config";
import { feedApi } from "@/shared/lib/api/feed";
import { cloudruFallbackManifestUrl, probeHlsCdnOutage } from "@gafus/core/services/mediaDelivery";

function FullscreenVideo({ media, active }: { media: FeedMediaDto; active: boolean }) {
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const currentManifest = useRef<string | null>(null);
  const triedDirect = useRef(false);

  useEffect(() => {
    if (!active) {
      currentManifest.current = null;
      setUri(null);
      return;
    }
    let mounted = true;
    currentManifest.current = null;
    triedDirect.current = false;
    setUri(null);
    setError("");
    setLoading(true);
    void feedApi.requestPlayback(media.id).then(ticket => {
      if (!mounted) return;
      if (!/^\/api\/v1\/feed-playback\/[A-Za-z0-9_-]+\?ticket=/.test(ticket.manifestUrl)) {
        throw new Error("Не удалось открыть видео.");
      }
      currentManifest.current = ticket.manifestUrl;
      setUri(API_BASE_URL.replace(/\/$/, "") + ticket.manifestUrl);
    }).catch(reason => {
      if (mounted) setError(reason instanceof Error ? reason.message : "Не удалось загрузить видео.");
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [media.id, active, attempt]);

  return (
    <View style={styles.media}>
      {media.posterUrl && !uri && (
        <CdnImage cdnUrl={media.posterUrl} requestFallback={() => feedApi.requestMediaFallback(media.id, "poster")}
          contentFit="contain" style={StyleSheet.absoluteFill} />
      )}
      {uri && active ? (
        <PlayingVideo key={uri} uri={uri} onError={() => {
          const original = currentManifest.current;
          if (triedDirect.current || !original) {
            setUri(null); setError("Видео не загрузилось. Попробуйте ещё раз."); return;
          }
          triedDirect.current = true;
          void (async () => {
            const outage = await probeHlsCdnOutage(API_BASE_URL.replace(/\/$/, "") + original, { nativeNetwork: true });
            if (!active || currentManifest.current !== original) return;
            if (outage) {
              setUri(API_BASE_URL.replace(/\/$/, "") + cloudruFallbackManifestUrl(original));
              return;
            }
            setUri(null); setError("Видео не загрузилось. Попробуйте ещё раз.");
          })().catch(() => { setUri(null); setError("Видео не загрузилось. Попробуйте ещё раз."); });
        }} />
      ) : (
        <View style={styles.videoFallback}>
          {loading ? (
            <>
              <ActivityIndicator color="#FFF8EB" size="large" />
              <Text style={styles.message}>Загружаем видео…</Text>
            </>
          ) : error ? (
            <>
              <Text accessibilityRole="alert" style={styles.message}>{error}</Text>
              <Pressable style={styles.retry} onPress={() => setAttempt(value => value + 1)}
                accessibilityRole="button" accessibilityLabel="Повторить загрузку видео">
                <Text style={styles.retryText}>Повторить</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}

function PlayingVideo({ uri, onError }: { uri: string; onError: () => void }) {
  const player = useVideoPlayer({ uri, contentType: "hls", useCaching: false }, instance => {
    instance.staysActiveInBackground = false;
    instance.showNowPlayingNotification = false;
    instance.play();
  });
  useEffect(() => {
    const subscription = player.addListener("statusChange", ({ status }) => {
      if (status === "error") onError();
    });
    return () => subscription.remove();
  }, [onError, player]);
  return <VideoView player={player} style={styles.media} contentFit="contain"
    nativeControls allowsPictureInPicture={false} />;
}

/** Full-screen swipeable viewer for a post's photos and videos, without navigating to the post again. */
export function FeedMediaViewer({
  postId,
  initialMedia,
  start,
  close,
}: {
  postId: string;
  initialMedia: FeedMediaDto[];
  start: number;
  close: () => void;
}) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(start);
  // Refresh signed photo links when opening: feed media URLs have a short lifetime.
  const fresh = useQuery({
    queryKey: ["feed", "media-viewer", postId],
    queryFn: () => feedApi.getPost(postId),
    staleTime: 0,
    retry: 1,
  });
  const media = (fresh.data?.attachments ?? initialMedia).filter(item => item.status === "ready");
  const position = Math.min(Math.max(0, index), Math.max(0, media.length - 1));
  const closeViewer = () => close();

  return (
    <Modal visible presentationStyle="fullScreen" animationType="fade"
      onRequestClose={closeViewer} supportedOrientations={["portrait", "landscape"]}>
      <StatusBar hidden />
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen} edges={["top", "bottom", "left", "right"]}>
          <View style={styles.toolbar}>
            <Text accessibilityLiveRegion="polite" style={styles.counter}>
              {media.length ? `${position + 1} / ${media.length}` : ""}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть просмотр"
              hitSlop={12} onPress={closeViewer} style={styles.close}>
              <MaterialCommunityIcons name="close" size={24} color="#FFF8EB" />
            </Pressable>
          </View>
          <FlatList
            key={width}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={media}
            keyExtractor={item => item.id}
            initialScrollIndex={position}
            getItemLayout={(_, i) => ({ length: width, offset: i * width, index: i })}
            onMomentumScrollEnd={event => setIndex(
              Math.max(0, Math.min(media.length - 1, Math.round(event.nativeEvent.contentOffset.x / width))),
            )}
            windowSize={3}
            maxToRenderPerBatch={3}
            renderItem={({ item, index: itemIndex }) => (
              <View style={[styles.slide, { width }]}>
                {item.kind === "photo" ? (
                  item.fullUrl || item.thumbUrl ? (
                    <CdnImage cdnUrl={item.fullUrl ?? item.thumbUrl ?? ""}
                      requestFallback={() => feedApi.requestMediaFallback(item.id, item.fullUrl ? "full" : "thumb")}
                      style={styles.media} contentFit="contain"
                      accessibilityLabel={`Фотография ${itemIndex + 1}`} />
                  ) : <Text style={styles.message}>Фотография недоступна.</Text>
                ) : (
                  <FullscreenVideo media={item} active={itemIndex === position} />
                )}
              </View>
            )}
          />
          {media.length > 1 && <Text style={styles.hint}>Листайте, чтобы посмотреть остальные вложения</Text>}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#11140F" },
  toolbar: { height: 54, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  counter: { color: "#FFF8EB", fontFamily: FONTS.montserratMedium, fontSize: 14 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.13)" },
  slide: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  media: { width: "100%", height: "100%" },
  videoFallback: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center", gap: 14, padding: 24 },
  message: { color: "#FFF8EB", fontFamily: FONTS.montserrat, fontSize: 14, textAlign: "center" },
  retry: { backgroundColor: "#4D5C2D", borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 },
  retryText: { color: "#FFF8EB", fontFamily: FONTS.montserratMedium, fontSize: 14 },
  hint: { paddingVertical: 8, textAlign: "center", color: "#B7BBAA", fontFamily: FONTS.montserrat, fontSize: 11 },
});
