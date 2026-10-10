import { useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { Menu, Text } from "react-native-paper";
import type { GalleryAlbumDto, GalleryPhotoDto } from "@gafus/types";
import { COLORS, FONTS } from "@/shared/config";
import { galleryApi } from "@/shared/lib/api/gallery";
import { galleryError, galleryKeys, requestId, useAlbums, useGalleryContext } from "./data";
import { UploadControls } from "./uploads";

type Mode = "actions" | "caption" | "albums" | "retry";

/** Anchored to the pencil on one thumbnail; only mounted for the active photo. */
export function PhotoActionsMenu({ photo, album, onDismiss }: {
  photo: GalleryPhotoDto;
  album: GalleryAlbumDto;
  onDismiss: () => void;
}) {
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>("actions");
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const { viewer, cache } = useGalleryContext();
  // This query is only mounted for the opened menu, not for every thumbnail.
  const albums = useAlbums(album.ownerUsername);
  const otherAlbums = albums.data?.pages.flatMap(page => page.items)
    .filter(item => item.id !== album.id && item.canEdit) ?? [];
  const panelWidth = Math.min(282, width - 32);
  const hasCaptionChanges = caption.trim() !== (photo.caption ?? "").trim();

  const openMode = (next: Mode) => {
    if (busy) return;
    setError(undefined);
    setMode(next);
  };
  const execute = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await action();
      await cache.invalidateQueries({ queryKey: galleryKeys.owner(viewer, album.ownerUsername) });
      onDismiss();
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
    }
  };
  const confirmDelete = () => {
    if (busy) return;
    Alert.alert(
      "Удалить фотографию?",
      "Фотография будет удалена из галереи.",
      [
        { text: "Отмена", style: "cancel" },
        { text: "Удалить", style: "destructive",
          onPress: () => void execute(() => galleryApi.deletePhoto(photo.id)) },
      ],
    );
  };

  return (
    <Menu
      visible
      onDismiss={() => { if (!busy) onDismiss(); }}
      anchorPosition="bottom"
      contentStyle={[styles.menu, { width: panelWidth }]}
      anchor={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Настройки фотографии"
          accessibilityState={{ expanded: true }}
          hitSlop={6}
          style={styles.anchor}
          onPress={onDismiss}
        >
          <MaterialCommunityIcons name="pencil" size={17} color={COLORS.primary} />
        </Pressable>
      }
    >
      {mode === "actions" ? (
        <>
          <Menu.Item leadingIcon="pencil-outline" title="Изменить подпись" disabled={busy}
            onPress={() => openMode("caption")} />
          {photo.status === "ready" ? (
            <>
              <Menu.Item leadingIcon="image-edit-outline"
                title={album.coverPhotoId === photo.id ? "Убрать обложку" : "Сделать обложкой"}
                disabled={busy}
                onPress={() => void execute(() =>
                  galleryApi.setCover(album.id, { photoId: album.coverPhotoId === photo.id ? null : photo.id }))} />
              <Menu.Item leadingIcon="folder-move-outline" title="Переместить в альбом"
                disabled={busy} onPress={() => openMode("albums")} />
            </>
          ) : (
            <>
              <Text style={styles.status}>
                {photo.status === "failed" ? "Ошибка обработки" : "Фотография обрабатывается"}
              </Text>
              {photo.uploadId && (photo.status === "failed" || photo.status === "pending") ? (
                <Menu.Item leadingIcon="refresh" title="Выбрать файл заново"
                  disabled={busy} onPress={() => openMode("retry")} />
              ) : null}
            </>
          )}
          <Menu.Item leadingIcon="delete-outline" title="Удалить фотографию"
            titleStyle={styles.deleteText} disabled={busy} onPress={confirmDelete} />
        </>
      ) : (
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="К действиям"
              disabled={busy} style={styles.back} onPress={() => openMode("actions")}>
              <MaterialCommunityIcons name="chevron-left" size={24} color={COLORS.primary} />
            </Pressable>
            <Text style={styles.panelTitle}>
              {mode === "caption" ? "Подпись" : mode === "albums" ? "Выберите альбом" : "Повторить загрузку"}
            </Text>
          </View>
          {mode === "caption" ? (
            <>
              <TextInput
                accessibilityLabel="Подпись к фотографии"
                multiline
                textAlignVertical="top"
                placeholder="Добавьте подпись"
                placeholderTextColor="#77746B"
                maxLength={2000}
                value={caption}
                onChangeText={setCaption}
                editable={!busy}
                style={styles.input}
              />
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" style={styles.cancel}
                  disabled={busy} onPress={() => openMode("actions")}>
                  <Text style={styles.cancelText}>Отмена</Text>
                </Pressable>
                <Pressable accessibilityRole="button" style={[styles.save, (!hasCaptionChanges || busy) && styles.disabled]}
                  disabled={!hasCaptionChanges || busy}
                  onPress={() => void execute(() => galleryApi.updatePhoto(photo.id, { caption: caption.trim() || null }))}>
                  {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveText}>Сохранить</Text>}
                </Pressable>
              </View>
            </>
          ) : null}
          {mode === "albums" ? (
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.albumScroll}>
              {albums.isPending ? <ActivityIndicator color={COLORS.primary} /> : null}
              {albums.isError ? (
                <Pressable accessibilityRole="button" style={styles.albumRow} onPress={() => void albums.refetch()}>
                  <Text style={styles.errorText}>Не удалось загрузить альбомы. Повторить</Text>
                </Pressable>
              ) : null}
              {otherAlbums.map(item => (
                <Pressable key={item.id} accessibilityRole="button"
                  accessibilityLabel={`Переместить в альбом ${item.name}`}
                  disabled={busy}
                  style={styles.albumRow}
                  onPress={() => void execute(() =>
                    galleryApi.movePhoto(photo.id, { albumId: item.id, clientRequestId: requestId() }))}>
                  <Text numberOfLines={2} style={styles.albumName}>{item.name}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.primary} />
                </Pressable>
              ))}
              {!albums.isPending && !albums.isError && !otherAlbums.length && !albums.hasNextPage ? (
                <Text style={styles.status}>Других альбомов пока нет</Text>
              ) : null}
              {albums.hasNextPage ? (
                <Pressable accessibilityRole="button" style={styles.albumRow}
                  disabled={busy || albums.isFetchingNextPage}
                  onPress={() => void albums.fetchNextPage()}>
                  <Text style={styles.albumName}>
                    {albums.isFetchingNextPage ? "Загрузка…" : "Ещё альбомы"}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          ) : null}
          {mode === "retry" && photo.uploadId ? (
            <UploadControls owner={album.ownerUsername} albumId={album.id}
              retryUploadId={photo.uploadId} onRetried={onDismiss} compact />
          ) : null}
        </View>
      )}
      {error ? <Text accessibilityRole="alert" style={styles.errorText}>{galleryError(error)}</Text> : null}
      {busy && mode !== "caption" ? <ActivityIndicator style={styles.busy} color={COLORS.primary} /> : null}
    </Menu>
  );
}

const styles = StyleSheet.create({
  menu: { backgroundColor: COLORS.cardBackground, borderRadius: 12, paddingVertical: 4 },
  anchor: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  status: { color: COLORS.textSecondary, fontFamily: FONTS.montserrat, fontSize: 12, padding: 10 },
  panel: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  panelHeader: { minHeight: 35, flexDirection: "row", gap: 4, alignItems: "center" },
  back: { width: 35, height: 35, justifyContent: "center" },
  panelTitle: { fontFamily: FONTS.montserratMedium, fontSize: 14, color: COLORS.text },
  input: {
    minHeight: 75, maxHeight: 130, backgroundColor: "#FAF7EF",
    borderWidth: 1, borderColor: "#AAA791", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    fontFamily: FONTS.montserrat, fontSize: 14, lineHeight: 20, color: COLORS.text,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "flex-end" },
  cancel: { minHeight: 44, paddingHorizontal: 10, justifyContent: "center" },
  cancelText: { fontFamily: FONTS.montserratMedium, fontSize: 13, color: COLORS.primary },
  save: { minHeight: 44, minWidth: 105, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: COLORS.primary },
  saveText: { fontFamily: FONTS.montserratBold, fontSize: 13, color: "#F6F0DF" },
  disabled: { opacity: 0.5 },
  albumScroll: { maxHeight: 210 },
  albumRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 5 },
  albumName: { flex: 1, color: COLORS.text, fontFamily: FONTS.montserrat, fontSize: 13 },
  deleteText: { color: "#A83C24" },
  errorText: { color: "#922D38", fontFamily: FONTS.montserrat, fontSize: 12, padding: 10 },
  busy: { padding: 10 },
});
