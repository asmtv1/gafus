import { memo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { GalleryImage } from "./image";
import { useRouter } from "expo-router";
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
  return <Modal visible animationType="slide" onRequestClose={close}>
    <SafeAreaView style={s.modal}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <View style={s.row}><Text accessibilityRole="header" style={[s.heading, { flex: 1 }]}>{title}</Text><Button label="Закрыть" variant="outline" fullWidth={false} onPress={close} /></View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
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
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: visible }} accessibilityLabel="Виден всем авторизованным" onPress={() => setVisible(v => !v)} style={[s.row, { minHeight: 48 }]}>
      <Text style={[s.heading, { color: COLORS.primary }]}>{visible ? "☑" : "☐"}</Text><Text style={[s.text, { flex: 1 }]}>Виден всем авторизованным</Text>
    </Pressable>
    <Text style={s.muted}>Если отключить, альбом и фотографии будут доступны только вам.</Text>
    {error ? <Text accessibilityRole="alert" style={s.error}>{galleryError(error)}</Text> : null}
    <Button label="Сохранить" loading={busy} disabled={busy || !name.trim()} onPress={() => void save()} />
  </EditorShell>;
}
export const AlbumTile = memo(function AlbumTile({ album, refresh }: { album: GalleryAlbumDto; refresh: () => void }) {
  const router = useRouter();
  return <Pressable style={s.album} accessibilityRole="button" accessibilityLabel={`${album.name}, фотографий: ${album.photoCount}${album.isVisible ? "" : ", только для вас"}`} onPress={() => router.push({ pathname: "/profile/albums/[albumId]", params: { albumId: album.id, username: album.ownerUsername } })}>
    {album.coverThumbUrl ? <GalleryImage source={{ uri: album.coverThumbUrl }} style={s.cover} contentFit="cover" refresh={refresh} /> : <View style={[s.cover, s.placeholder]}><Text style={s.muted}>Нет обложки</Text></View>}
    <Text numberOfLines={2} style={s.text}>{album.name}</Text><Text style={s.muted}>{album.photoCount} фото{album.isVisible ? "" : " · Только для вас"}</Text>
  </Pressable>;
});
export function GalleryPreview({ owner }: { owner: string }) {
  const albums = useAlbums(owner);
  const [creating, setCreating] = useState(false);
  const meta = albums.data?.pages[0];
  const items = albums.data?.pages.flatMap(p => p.items).slice(0, 4) ?? [];
  const router = useRouter();
  if (!owner || meta?.enabled === false) return null;
  return <View style={s.section}>
    <Text accessibilityRole="header" style={s.heading}>Фотографии</Text>
    {albums.isPending ? <ActivityIndicator color={COLORS.primary} accessibilityLabel="Загрузка альбомов" /> : null}
    {albums.isError ? <Failure error={albums.error} retry={() => void albums.refetch()} /> : null}
    {meta?.isOwner ? <Text style={s.muted}>{meta.usedSlots}/200 фотографий</Text> : null}
    {[0, 2].map(start => items[start] ? <View key={start} style={[s.row, { alignItems: "stretch" }]}>{items.slice(start, start + 2).map(album => <AlbumTile key={album.id} album={album} refresh={() => void albums.refetch()} />)}{!items[start + 1] ? <View style={{ flex: 1 }} /> : null}</View> : null)}
    {meta && !items.length ? <Text style={s.text}>{meta.isOwner ? "Добавьте первые фотографии — альбом появится автоматически." : "Здесь пока нет доступных альбомов."}</Text> : null}
    {meta ? <Button label="Все альбомы" variant="outline" onPress={() => router.push({ pathname: "/profile/albums", params: { username: owner } })} /> : null}
    {meta?.isOwner ? <><Button label="Создать альбом" variant="outline" onPress={() => setCreating(true)} /><UploadControls owner={owner} usedSlots={meta.usedSlots} /></> : null}
    {creating ? <AlbumEditor owner={owner} close={() => setCreating(false)} /> : null}
  </View>;
}
