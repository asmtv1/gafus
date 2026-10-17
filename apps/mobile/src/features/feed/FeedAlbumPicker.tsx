import { useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useAuthStore } from "@/shared/stores";
import { COLORS, FONTS } from "@/shared/config";
import { galleryApi } from "@/shared/lib/api/gallery";
import { Loading } from "@/shared/components";

const DEFAULT_MAX_PHOTOS = 10;

/** Album selection shares a single ordered selection across all albums. */
export function FeedAlbumPicker({
  selected,
  onChange,
  maxSelectable = DEFAULT_MAX_PHOTOS,
  disabled = false,
}: {
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  /** Remaining attachment capacity after device files, edited media and poll images. */
  maxSelectable?: number;
  disabled?: boolean;
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
  const allAlbums = albums.data?.pages.flatMap(page => page.items) ?? [];
  // Show the first available album without requiring a redundant extra tap.
  const activeAlbumId = albumId ?? allAlbums[0]?.id ?? null;
  const photos = useInfiniteQuery({
    queryKey: ["feed", "album-photos", activeAlbumId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => galleryApi.listPhotos(activeAlbumId!, { cursor: pageParam }),
    getNextPageParam: page => page.nextCursor,
    enabled: Boolean(activeAlbumId),
  });
  const allPhotos = photos.data?.pages.flatMap(page => page.items.filter(item => item.status === "ready")) ?? [];
  const capacity = Math.max(0, Math.min(DEFAULT_MAX_PHOTOS, maxSelectable));

  const toggle = (id: string) => {
    if (disabled) return;
    if (selected.includes(id)) {
      onChange(selected.filter(item => item !== id));
    } else if (selected.length < capacity) {
      onChange([...selected, id]);
    }
  };

  return (
    <View style={styles.card} accessibilityLabel="Выбор фотографий из альбомов">
      <View style={styles.header}>
        <Text style={styles.title}>Из альбомов</Text>
        <Text style={styles.counter} accessibilityLabel={`Выбрано ${selected.length} из ${capacity} фотографий`}>
          {selected.length} из {capacity}
        </Text>
      </View>

      {albums.isPending && <Loading variant="inline" message="Загружаем альбомы…" />}
      {albums.isError && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Не удалось загрузить альбомы. Повторить"
          onPress={() => void albums.refetch()}
          style={styles.retry}
        >
          <Text style={styles.link}>Не удалось загрузить альбомы. Повторить</Text>
        </Pressable>
      )}
      {!albums.isPending && !albums.isError && allAlbums.length === 0 && (
        <Text style={styles.empty}>У вас пока нет альбомов с фотографиями.</Text>
      )}
      {allAlbums.length > 0 && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.albums}
            style={styles.albumsScroll}
            accessibilityLabel="Выберите альбом"
          >
            {allAlbums.map(album => {
              const isActive = album.id === activeAlbumId;
              return (
                <Pressable
                  key={album.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Альбом ${album.name}${album.isVisible ? "" : ", скрытый"}`}
                  accessibilityState={{ selected: isActive, disabled }}
                  disabled={disabled}
                  onPress={() => setAlbumId(album.id)}
                  style={({ pressed }) => [
                    styles.albumChip,
                    isActive && styles.activeAlbum,
                    pressed && styles.pressed,
                  ]}
                >
                  {!album.isVisible && (
                    <MaterialCommunityIcons
                      name="lock-outline"
                      size={13}
                      color={isActive ? COLORS.primary : COLORS.textSecondary}
                      accessible={false}
                    />
                  )}
                  <Text
                    style={[styles.albumName, isActive && styles.activeAlbumName]}
                    numberOfLines={1}
                  >
                    {album.name}
                  </Text>
                </Pressable>
              );
            })}
            {albums.hasNextPage && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Показать ещё альбомы"
                disabled={albums.isFetchingNextPage || disabled}
                onPress={() => void albums.fetchNextPage()}
                style={styles.loadAlbums}
              >
                <Text style={styles.link}>{albums.isFetchingNextPage ? "Загрузка…" : "Ещё альбомы"}</Text>
              </Pressable>
            )}
          </ScrollView>
          {photos.isPending && <Loading variant="inline" message="Загружаем фотографии…" />}
          {photos.isError && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ошибка загрузки фотографий. Повторить"
              style={styles.retry}
              onPress={() => void photos.refetch()}
            >
              <Text style={styles.link}>Ошибка загрузки фотографий. Повторить</Text>
            </Pressable>
          )}
          {!photos.isPending && !photos.isError && allPhotos.length === 0 && (
            <Text style={styles.empty}>В этом альбоме пока нет готовых фотографий.</Text>
          )}

          <View style={styles.photoGrid}>
            {allPhotos.map(photo => {
              const selectionIndex = selected.indexOf(photo.id);
              const isSelected = selectionIndex !== -1;
              const selectionBlocked = disabled || (!isSelected && selected.length >= capacity);
              return (
                <Pressable
                  key={photo.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Фотография ${photo.id}, ${isSelected ? `выбрана под номером ${selectionIndex + 1}` : "выбрать"}`}
                  accessibilityState={{ selected: isSelected, disabled: selectionBlocked }}
                  disabled={selectionBlocked}
                  onPress={() => toggle(photo.id)}
                  style={({ pressed }) => [
                    styles.photoTile,
                    isSelected && styles.selectedTile,
                    pressed && styles.pressed,
                    selectionBlocked && styles.blockedTile,
                  ]}
                >
                  {photo.thumbUrl ? (
                    <Image
                      source={{ uri: photo.thumbUrl }}
                      style={styles.image}
                      contentFit="cover"
                      accessible={false}
                    />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <MaterialCommunityIcons name="image-outline" size={25} color="#969E84" />
                    </View>
                  )}
                  {isSelected && <View style={styles.selectedTint} pointerEvents="none" />}
                  <View
                    style={[styles.check, isSelected && styles.checked]}
                    pointerEvents="none"
                    accessible={false}
                  >
                    {isSelected ? (
                      <Text style={styles.checkNumber}>{selectionIndex + 1}</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          {photos.hasNextPage && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Показать ещё фото"
              disabled={photos.isFetchingNextPage}
              style={styles.morePhotos}
              onPress={() => void photos.fetchNextPage()}
            >
              <Text style={styles.link}>{photos.isFetchingNextPage ? "Загружаем…" : "Показать ещё фото"}</Text>
            </Pressable>
          )}
        </>
      )}

      <View style={styles.hintRow}>
        <MaterialCommunityIcons name="information-outline" size={15} color="#77816B" accessible={false} />
        <Text style={styles.hint}>
          При публикации создаётся копия. Фото станут видны читателям, даже из скрытых альбомов.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12, borderRadius: 16, backgroundColor: "#FFFDF8",
    borderWidth: 1, borderColor: "#E9E5D8", gap: 10,
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12,
  },
  title: { fontFamily: FONTS.montserratBold, fontSize: 14, lineHeight: 20, color: COLORS.text },
  counter: {
    fontFamily: FONTS.montserratMedium, fontSize: 12, lineHeight: 18,
    color: COLORS.primary, backgroundColor: "#EDF1E6", borderRadius: 10,
    paddingVertical: 3, paddingHorizontal: 9, overflow: "hidden",
  },
  link: { fontFamily: FONTS.montserratMedium, color: COLORS.primary, fontSize: 12, lineHeight: 18 },
  retry: { minHeight: 44, justifyContent: "center" },
  albumsScroll: { flexGrow: 0 },
  albums: { alignItems: "center", gap: 7, paddingVertical: 1 },
  albumChip: {
    minHeight: 44, maxWidth: 200, paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: 18, flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#F4F0E5", borderWidth: 1, borderColor: "#E4DDC9",
  },
  activeAlbum: { backgroundColor: "#EDF1E6", borderColor: COLORS.primary },
  albumName: { flexShrink: 1, color: COLORS.text, fontFamily: FONTS.montserrat, fontSize: 12 },
  activeAlbumName: { fontFamily: FONTS.montserratMedium, color: COLORS.primary },
  loadAlbums: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  photoTile: {
    width: "31.5%", maxWidth: 142, aspectRatio: 1, borderRadius: 10,
    overflow: "hidden", borderWidth: 2, borderColor: "transparent",
    position: "relative", backgroundColor: "#EAE8E0",
  },
  selectedTile: { borderColor: COLORS.primary },
  blockedTile: { opacity: 0.55 },
  image: { width: "100%", height: "100%" },
  photoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  selectedTint: {
    ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(77, 92, 45, 0.13)",
  },
  check: {
    position: "absolute", right: 6, top: 6, width: 26, height: 26,
    borderRadius: 13, borderWidth: 2, borderColor: "#FFFFFF",
    backgroundColor: "rgba(40, 42, 38, 0.32)",
    justifyContent: "center", alignItems: "center",
  },
  checked: { backgroundColor: COLORS.primary, borderColor: "#FFFFFF" },
  checkNumber: { fontFamily: FONTS.montserratBold, fontSize: 12, lineHeight: 16, color: "#FFFFFF" },
  morePhotos: {
    alignSelf: "center", minHeight: 44, justifyContent: "center", paddingHorizontal: 14,
  },
  empty: {
    fontFamily: FONTS.montserrat,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textSecondary,
    paddingVertical: 12,
  },
  hintRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  hint: { flex: 1, fontFamily: FONTS.montserrat, color: "#6B7165", fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.75 },
});
