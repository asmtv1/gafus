import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, View, useWindowDimensions } from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import type { GalleryPhotoDto } from "@gafus/types";
import { galleryApi } from "@/shared/lib/api/gallery";
import { galleryKeys, useForeground, useGalleryContext } from "./data";
import { registerGalleryCleanup } from "./session";
import { Failure } from "./components";
import { styles as s } from "./styles";

function FullPhoto({ photo, owner, active, width }: { photo: GalleryPhotoDto; owner: string; active: boolean; width: number }) {
  const { viewer } = useGalleryContext();
  const foreground = useForeground();
  const lastRefresh = useRef(0);
  const full = useQuery({ queryKey: [...galleryKeys.album(viewer, owner, photo.albumId), "full", photo.id], queryFn: () => galleryApi.getPhoto(photo.id), enabled: !!viewer && active && foreground, staleTime: 0, gcTime: 0, retry: 1 });
  useEffect(() => {
    if (!active || !foreground || !full.data?.urlsExpireAt) return;
    const timer = setTimeout(() => void full.refetch(), Math.max(1000, Date.parse(full.data.urlsExpireAt) - Date.now() - 5000));
    return () => clearTimeout(timer);
  }, [active, foreground, full.data?.urlsExpireAt, full.refetch]);
  const refresh = () => { if (Date.now() - lastRefresh.current > 5000) { lastRefresh.current = Date.now(); void full.refetch(); } };
  return <View style={{ width, flex: 1, padding: 16 }}>
    {full.isPending ? <ActivityIndicator color="white" accessibilityLabel="Загрузка фотографии" /> : null}
    {full.isError ? <Failure error={full.error} retry={() => void full.refetch()} /> : null}
    {full.data?.fullUrl ? <Image source={{ uri: full.data.fullUrl }} style={{ flex: 1, width: "100%" }} contentFit="contain" cachePolicy="memory" onError={refresh} accessibilityLabel={photo.caption ?? "Фотография"} /> : null}
    {photo.caption ? <Text style={[s.viewerText, { marginTop: 12 }]} numberOfLines={4}>{photo.caption}</Text> : null}
  </View>;
}
export function PhotoViewer({ photos, start, owner, total, more, close }: { photos: GalleryPhotoDto[]; start: number; owner: string; total: number; more: () => void; close: () => void }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(start);
  useEffect(() => registerGalleryCleanup(close), [close]);
  return <Modal visible animationType="fade" onRequestClose={close} supportedOrientations={["portrait", "landscape"]}>
    <SafeAreaView style={s.viewer}>
      <View style={s.viewerBar}><Text accessibilityLiveRegion="polite" style={s.viewerText}>{index + 1} / {total}</Text><Pressable accessibilityRole="button" accessibilityLabel="Закрыть просмотр фотографии" style={s.close} onPress={close}><Text style={s.viewerText}>Закрыть ✕</Text></Pressable></View>
      <FlatList key={width} horizontal pagingEnabled data={photos} initialScrollIndex={Math.min(index, photos.length - 1)} keyExtractor={p => p.id} getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })} onMomentumScrollEnd={event => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))} renderItem={({ item, index: i }) => <FullPhoto photo={item} owner={owner} active={i === index} width={width} />} onEndReached={more} onEndReachedThreshold={0.5} windowSize={3} maxToRenderPerBatch={3} />
    </SafeAreaView>
  </Modal>;
}
