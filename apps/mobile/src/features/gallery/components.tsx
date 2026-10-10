import { memo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, View } from "react-native";
import { IconButton, Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { Loading, TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { GalleryImage } from "./image";
import { useRouter, type Href } from "expo-router";
import type { GalleryAlbumDto } from "@gafus/types";
import { Button, Input } from "@/shared/components/ui";
import { galleryApi } from "@/shared/lib/api/gallery";
import { COLORS } from "@/shared/config";
import { galleryError, galleryKeys, useAlbums, useGalleryContext } from "./data";
import { UploadControls } from "./uploads";
import { styles as s } from "./styles";

export function Failure({ error, retry }: { error: unknown; retry: () => void }) {
  return <View style={s.card}><Text accessibilityRole="alert" style={s.error}>{galleryError(error)}</Text><Button label="Повторить" variant="outline" onPress={retry} /></View>;
}
export function EditorShell({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={s.modal} edges={["top", "bottom", "left", "right"]}>
          <View style={s.editorHeader}>
            <Text accessibilityRole="header" style={[s.heading, s.editorTitle]}>{title}</Text>
            <IconButton
              icon="close"
              iconColor={COLORS.primary}
              size={24}
              style={s.editorClose}
              accessibilityLabel="Закрыть"
              onPress={close}
            />
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={s.content}
            >
              {children}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
export function AlbumEditor({ owner, album, close }: { owner: string; album?: GalleryAlbumDto; close: () => void }) {
  const [name, setName] = useState(album?.name ?? "");
  const [visible, setVisible] = useState(album?.isVisible ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const { viewer, cache } = useGalleryContext();
  const save = async () => {
    setBusy(true); setError(undefined);
    try {
      const input = { name: name.trim(), isVisible: visible };
      if (album) await galleryApi.updateAlbum(album.id, input); else await galleryApi.createAlbum(input);
      await cache.invalidateQueries({ queryKey: galleryKeys.owner(viewer, owner) }); close();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return <EditorShell title={album ? "Настройки альбома" : "Новый альбом"} close={close}>
    <Input label="Название альбома" value={name} onChangeText={setName} maxLength={120} autoCapitalize="sentences" />
    <View style={s.visibilityRow}>
      <Text style={[s.text, { flex: 1 }]}>Виден всем авторизованным</Text>
      <Switch
        value={visible}
        onValueChange={setVisible}
        accessibilityLabel="Виден всем авторизованным"
        trackColor={{ true: COLORS.primary }}
      />
    </View>
    <Text style={s.muted}>Если отключить, альбом и фотографии будут доступны только вам.</Text>
    {error ? <Text accessibilityRole="alert" style={s.error}>{galleryError(error)}</Text> : null}
    <Button label="Сохранить" loading={busy} disabled={busy || !name.trim()} onPress={() => void save()} />
  </EditorShell>;
}
export const AlbumTile = memo(function AlbumTile({ album, refresh, compact = false }: { album: GalleryAlbumDto; refresh: () => void; compact?: boolean }) {
  const router = useRouter();
  return <Pressable style={compact ? s.albumCompact : s.album} accessibilityRole="button" accessibilityLabel={`${album.name}, фотографий: ${album.photoCount}${album.isVisible ? "" : ", только для вас"}`} onPress={() => router.push({ pathname: "/profile/albums/[albumId]", params: { albumId: album.id, username: album.ownerUsername } })}>
    {album.coverThumbUrl ? <GalleryImage source={{ uri: album.coverThumbUrl }} style={compact ? s.coverCompact : s.cover} contentFit="cover" refresh={refresh} /> : <View style={[compact ? s.coverCompact : s.cover, s.placeholder]}>{compact ? <MaterialCommunityIcons name="image-outline" size={28} color={COLORS.textSecondary} /> : <Text style={s.muted}>Нет обложки</Text>}</View>}
    <Text numberOfLines={2} style={compact ? s.albumCompactName : s.text}>{album.name}</Text><Text style={s.muted}>{album.photoCount} фото{album.isVisible ? "" : " · Только для вас"}</Text>
  </Pressable>;
});
export function GalleryPreview({ owner }: { owner: string }) {
  const albums = useAlbums(owner);
  const [creating, setCreating] = useState(false);
  const meta = albums.data?.pages[0];
  const items = albums.data?.pages.flatMap(p => p.items).slice(0, 4) ?? [];
  const router = useRouter();
  if (!owner || meta?.enabled === false) return null;
  const openAlbums = () => router.navigate({
    pathname: "/(main)/(tabs)/albums",
    params: { username: owner },
  } as Href);
  return <View style={s.galleryPreviewCard}>
    <View style={s.galleryPreviewHeader}>
      <View style={s.galleryPreviewHeading}>
        <Text accessibilityRole="header" style={s.galleryPreviewTitle}>Фотографии</Text>
        {meta?.isOwner ? (
          <Text style={s.galleryPreviewQuota}>{meta.usedSlots} из 200 фотографий</Text>
        ) : null}
      </View>
      {meta ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Все альбомы"
          onPress={openAlbums}
          style={({ pressed }) => [s.galleryPreviewAll, pressed && { opacity: 0.6 }]}
        >
          <Text style={s.galleryPreviewAllText}>Все альбомы</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.primary} />
        </Pressable>
      ) : null}
    </View>
    {albums.isPending ? <Loading variant="inline" size="small" message="Загрузка альбомов…" /> : null}
    {albums.isError ? <Failure error={albums.error} retry={() => void albums.refetch()} /> : null}
    {items.length > 0 ? (
      <View style={s.galleryPreviewGrid}>
        {[0, 2].map(start => items[start] ? (
          <View key={start} style={s.galleryPreviewRow}>
            {items.slice(start, start + 2).map(album =>
              <AlbumTile key={album.id} album={album} refresh={() => void albums.refetch()} compact />)}
            {!items[start + 1] ? <View style={{ flex: 1 }} /> : null}
          </View>
        ) : null)}
      </View>
    ) : null}
    {meta && !items.length ? (
      <Text style={s.galleryPreviewEmpty}>
        {meta.isOwner ? "Добавьте фотографии — первый альбом появится автоматически." : "Здесь пока нет доступных альбомов."}
      </Text>
    ) : null}
    {meta?.isOwner ? (
      <View style={s.galleryPreviewFooter}>
        <UploadControls
          owner={owner}
          usedSlots={meta.usedSlots}
          inlineHeader
          leadingAction={
            <Button
              label="Новый альбом"
              accessibilityLabel="Создать альбом"
              variant="caramel"
              height={44}
              fontSize={13}
              lineHeight={18}
              horizontalPadding={0}
              verticalPadding={0}
              labelStyle={{ marginHorizontal: 0, marginVertical: 0 }}
              borderRadius={14}
              animatedPress
              onPress={() => setCreating(true)}
            />
          }
        />
      </View>
    ) : null}
    {creating ? <AlbumEditor owner={owner} close={() => setCreating(false)} /> : null}
  </View>;
}
