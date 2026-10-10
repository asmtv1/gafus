import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuthStore } from "@/shared/stores";
import { COLORS, FONTS, SPACING } from "@/shared/config";
import { galleryApi } from "@/shared/lib/api/gallery";
import { Loading } from "@/shared/components";

/** Only the current user's albums can be selected, including hidden ones. */
export function FeedAlbumPicker({ selected, onChange, disabled }: {
  selected: readonly string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const username = useAuthStore(state => state.user?.username);
  const [albumId, setAlbumId] = useState<string | null>(null);
  const albums = useInfiniteQuery({
    queryKey: ["feed", "own-albums", username],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => galleryApi.listAlbums(username!, { cursor: pageParam }),
    getNextPageParam: page => page.nextCursor,
    enabled: Boolean(username),
  });
  const photos = useInfiniteQuery({
    queryKey: ["feed", "album-photos", albumId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => galleryApi.listPhotos(albumId!, { cursor: pageParam }),
    getNextPageParam: page => page.nextCursor,
    enabled: Boolean(albumId),
  });
  const allAlbums = albums.data?.pages.flatMap(page => page.items) ?? [];
  const allPhotos = photos.data?.pages.flatMap(page => page.items.filter(item => item.status === "ready")) ?? [];
  const toggle = (id: string) => {
    if (disabled) return;
    if (selected.includes(id)) onChange(selected.filter(item => item !== id));
    else if (selected.length < 10) onChange([...selected, id]);
  };
  return <View style={styles.card}>
    <Text style={styles.title}>Фотографии из моих альбомов</Text>
    <Text style={styles.notice}>При публикации будет создана отдельная копия. Даже фотография из скрытого альбома станет видна читателям.</Text>
    {albums.isPending && <Loading variant="inline" message="Загружаем альбомы…" />}
    {albums.isError && <Pressable accessibilityRole="button" onPress={() => void albums.refetch()}>
      <Text style={styles.link}>Не удалось загрузить альбомы. Повторить</Text>
    </Pressable>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
      {allAlbums.map(album => <Pressable key={album.id} accessibilityRole="button"
        accessibilityState={{ selected: album.id === albumId }} disabled={disabled}
        style={[styles.tag, albumId === album.id && styles.selected]} onPress={() => setAlbumId(album.id)}>
        <Text style={styles.body}>{album.name}{album.isVisible ? "" : " · Скрытый"}</Text>
      </Pressable>)}
      {albums.hasNextPage && <Pressable onPress={() => void albums.fetchNextPage()} style={styles.tag}>
        <Text style={styles.link}>Ещё</Text>
      </Pressable>}
    </ScrollView>
    {albumId && <>
      {photos.isPending && <Loading variant="inline" message="Загружаем фотографии…" />}
      {photos.isError && <Pressable accessibilityRole="button" onPress={() => void photos.refetch()}>
        <Text style={styles.link}>Ошибка загрузки фотографий. Повторить</Text>
      </Pressable>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
        {allPhotos.map(photo => <Pressable key={photo.id} accessibilityRole="button"
          accessibilityState={{ selected: selected.includes(photo.id) }} disabled={disabled}
          onPress={() => toggle(photo.id)} style={[styles.photo, selected.includes(photo.id) && styles.selected]}>
          {photo.thumbUrl && <Image source={{ uri: photo.thumbUrl }} style={styles.image} contentFit="cover" />}
          <Text style={styles.notice}>{selected.includes(photo.id) ? "✓ Выбрано" : "Выбрать"}</Text>
        </Pressable>)}
        {photos.hasNextPage && <Pressable onPress={() => void photos.fetchNextPage()} style={styles.tag}>
          <Text style={styles.link}>Ещё фото</Text>
        </Pressable>}
      </ScrollView>
    </>}
    <Text style={styles.notice}>Выбрано фотографий: {selected.length}</Text>
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: SPACING.md, borderRadius: 16, backgroundColor: COLORS.cardBackground, gap: SPACING.sm },
  title: { fontFamily: FONTS.montserratMedium, fontSize: 17, color: COLORS.text },
  notice: { fontFamily: FONTS.montserrat, color: COLORS.textSecondary, fontSize: 12 },
  body: { fontFamily: FONTS.montserrat, color: COLORS.text, fontSize: 13 },
  link: { fontFamily: FONTS.montserratMedium, color: COLORS.primary, fontSize: 14 },
  tag: { borderRadius: 14, backgroundColor: COLORS.background, padding: SPACING.sm, marginRight: SPACING.sm },
  selected: { borderWidth: 2, borderColor: COLORS.primary },
  strip: { flexGrow: 0 },
  photo: { width: 110, marginRight: SPACING.sm, borderRadius: 12, overflow: "hidden", alignItems: "center" },
  image: { width: 110, height: 110 },
});
