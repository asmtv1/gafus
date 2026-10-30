import { useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { CdnImage } from "@/shared/components/media/CdnImage";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { FeedMediaDto } from "@gafus/types";
import { FONTS } from "@/shared/config";
import { feedApi } from "@/shared/lib/api/feed";
import { FeedV2Image, FeedV2Video } from "./FeedV2Media";

/** The feed already contains authorized MP4 URLs; fullscreen opens without a ticket. */
function FullscreenVideo({ postId, media, active }: { postId: string; media: FeedMediaDto; active: boolean }) {
  if (!media.mp4Urls?.[360]) return <Text style={styles.message}>Видео недоступно.</Text>;
  return <FeedV2Video postId={postId} visible={active} fullscreen media={{
    id: media.id, kind: "video", status: "ready", width: media.width ?? 1280,
    height: media.height ?? 720, durationSeconds: media.durationSeconds ?? 0,
    access: "viewer", expiresAt: media.urlsExpireAt, placeholder: null,
    posterUrl: media.posterUrl ?? "", mp4: media.mp4Urls,
  }} />;
}

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
  const expired = initialMedia.some(item =>
    item.urlsExpireAt && Date.parse(item.urlsExpireAt) <= Date.now() + 15_000);
  const fresh = useQuery({
    queryKey: ["feed", "media-viewer", postId],
    queryFn: () => feedApi.getPost(postId), enabled: expired,
    staleTime: 0, retry: 1,
  });
  const media = (expired ? fresh.data?.attachments ?? [] : initialMedia)
    .filter(item => item.status === "ready");
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
                  <FullscreenVideo postId={postId} media={item} active={itemIndex === position} />
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

/** Inline comment gallery uses the same CDN-first V2 players as post media. */
export function FeedCommentAttachments({ postId, media }: {
  postId: string; media: FeedMediaDto[];
}) {
  return <View style={{ gap: 8, marginTop: 6 }}>
          {media.map(media => media.status === "ready" ? <View key={media.id}
            style={{ width: "100%", maxWidth: 290, borderRadius: 10, overflow: "hidden" }}>
            {media.kind === "photo" && (media.thumbUrl || media.smallUrl || media.fullUrl)
              ? <FeedV2Image width={260} media={{
                  id: media.id, kind: "image", status: "ready",
                  width: media.width ?? 720, height: media.height ?? 720,
                  access: "viewer", expiresAt: media.urlsExpireAt, placeholder: null,
                  urls: { small: media.smallUrl ?? media.thumbUrl ?? media.fullUrl ?? "",
                    medium: media.thumbUrl ?? media.fullUrl ?? media.smallUrl ?? "",
                    large: media.fullUrl ?? media.thumbUrl ?? media.smallUrl ?? "" },
                }} />
              : media.kind === "video" && media.mp4Urls?.[360]
                ? <FeedV2Video postId={postId} visible media={{
                    id: media.id, kind: "video", status: "ready",
                    width: media.width ?? 1280, height: media.height ?? 720,
                    durationSeconds: media.durationSeconds ?? 0,
                    access: "viewer", expiresAt: media.urlsExpireAt, placeholder: null,
                    posterUrl: media.posterUrl ?? "", mp4: media.mp4Urls,
                  }} />
                : <Text style={styles.message}>Медиа недоступно</Text>}
          </View> : <Text key={media.id} style={styles.message}>
            {media.status === "failed" ? "Ошибка обработки вложения"
              : "Обрабатываем вложение…"}
          </Text>)}
  </View>;
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
