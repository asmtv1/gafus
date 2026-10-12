import { useEffect, useRef, useState } from "react";
import { FlatList, Modal, Pressable, View, useWindowDimensions } from "react-native";
import { Text } from "react-native-paper";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { CdnImage } from "@/shared/components/media/CdnImage";
import { useQuery } from "@tanstack/react-query";
import type { GalleryPhotoDto } from "@gafus/types";
import { galleryApi } from "@/shared/lib/api/gallery";
import { galleryKeys, useForeground, useGalleryContext } from "./data";
import { registerGalleryCleanup } from "./session";
import { Failure } from "./components";
import { Loading } from "@/shared/components";
import { styles as s } from "./styles";

function FullPhoto({ photo, owner, active, width, close }: { photo: GalleryPhotoDto; owner: string; active: boolean; width: number; close: () => void }) {
  const { viewer } = useGalleryContext();
  const foreground = useForeground();
  const { height } = useWindowDimensions();
  const lastRefresh = useRef(0);
  const dragY = useSharedValue(0);
  const full = useQuery({ queryKey: [...galleryKeys.album(viewer, owner, photo.albumId), "full", photo.id], queryFn: () => galleryApi.getPhoto(photo.id), enabled: !!viewer && active && foreground, staleTime: 0, gcTime: 0, retry: 1 });
  useEffect(() => {
    if (!active || !foreground || !full.data?.urlsExpireAt) return;
    const timer = setTimeout(() => void full.refetch(), Math.max(1000, Date.parse(full.data.urlsExpireAt) - Date.now() - 5000));
    return () => clearTimeout(timer);
  }, [active, foreground, full.data?.urlsExpireAt, full.refetch]);
  const refresh = () => { if (Date.now() - lastRefresh.current > 5000) { lastRefresh.current = Date.now(); void full.refetch(); } };
  // Vertical drag dismisses the viewer, while horizontal swipes still belong to FlatList.
  const drag = Gesture.Pan()
    .enabled(active && !!full.data?.fullUrl)
    .activeOffsetY([-20, 20])
    .failOffsetX([-24, 24])
    .onUpdate(event => {
      dragY.value = event.translationY;
    })
    .onEnd(event => {
      const distance = Math.abs(event.translationY);
      const shouldClose = distance > 120 || (distance > 45 && Math.abs(event.velocityY) > 1000);
      if (shouldClose) {
        dragY.value = withTiming(event.translationY >= 0 ? height : -height, { duration: 170 }, finished => {
          if (finished) runOnJS(close)();
        });
      } else {
        dragY.value = withSpring(0, { damping: 20, stiffness: 240 });
      }
    })
    .onFinalize((_event, success) => {
      if (!success) dragY.value = withSpring(0, { damping: 20, stiffness: 240 });
    });
  const photoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: dragY.value },
      { scale: Math.max(0.92, 1 - Math.abs(dragY.value) / 1600) },
    ],
  }));
  return <GestureDetector gesture={drag}><Animated.View style={[{ width, flex: 1, padding: 16 }, photoStyle]}>
    {full.isPending ? <Loading variant="inline" message="Загрузка фотографии…" /> : null}
    {full.isError ? <Failure error={full.error} retry={() => void full.refetch()} /> : null}
    {full.data?.fullUrl ? <CdnImage cdnUrl={full.data.fullUrl} requestFallback={() => galleryApi.requestMediaFallback(photo.id, "full")}
      style={{ flex: 1, width: "100%" }} contentFit="contain" onError={refresh}
      accessibilityLabel={photo.caption ?? "Фотография"} /> : null}
    {photo.caption ? <Text style={[s.viewerText, { marginTop: 12 }]} numberOfLines={4}>{photo.caption}</Text> : null}
  </Animated.View></GestureDetector>;
}
export function PhotoViewer({ photos, start, owner, total, more, close }: { photos: GalleryPhotoDto[]; start: number; owner: string; total: number; more: () => void; close: () => void }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(start);
  useEffect(() => registerGalleryCleanup(close), [close]);
  return <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={close} supportedOrientations={["portrait", "landscape"]}>
    <StatusBar hidden />
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SafeAreaView edges={["top", "bottom", "left", "right"]} style={s.viewer}>
        <View style={s.viewerBar}>
          <Text accessibilityLiveRegion="polite" style={s.viewerText}>{index + 1} / {total}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Закрыть просмотр фотографии" style={s.close} onPress={close}>
            <Text style={s.viewerText}>Закрыть ✕</Text>
          </Pressable>
        </View>
        <FlatList key={width} horizontal pagingEnabled data={photos} initialScrollIndex={Math.min(index, photos.length - 1)} keyExtractor={p => p.id} getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })} onMomentumScrollEnd={event => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))} renderItem={({ item, index: i }) => <FullPhoto photo={item} owner={owner} active={i === index} width={width} close={close} />} onEndReached={more} onEndReachedThreshold={0.5} windowSize={3} maxToRenderPerBatch={3} />
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  </Modal>;
}
