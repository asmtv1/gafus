import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, View, useWindowDimensions } from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { GalleryImage } from "./image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { GalleryAlbumDto, GalleryPhotoDto } from "@gafus/types";
import { galleryApi } from "@/shared/lib/api/gallery";
import { Button, Input } from "@/shared/components/ui";
import { COLORS } from "@/shared/config";
import { AlbumEditor, AlbumTile, EditorShell, Failure } from "./components";
import { galleryError, galleryKeys, requestId, useAlbums, useForeground, useGalleryContext } from "./data";
import { UploadControls } from "./uploads";
import { PhotoViewer } from "./viewer";
import { styles as s } from "./styles";
const param = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export function GalleryAlbumsScreen() {
  const params = useLocalSearchParams<{ username?: string | string[] }>();
  const { username } = useGalleryContext();
  const owner = param(params.username) ?? username;
  const albums = useAlbums(owner);
  const [creating, setCreating] = useState(false);
  const meta = albums.data?.pages[0];
  const items = albums.data?.pages.flatMap(page => page.items) ?? [];
  return <SafeAreaView edges={["bottom", "left", "right"]} style={s.screen}>
    <Stack.Screen options={{ headerShown: true, title: "Альбомы", headerStyle: { backgroundColor: COLORS.background }, headerTintColor: COLORS.text }} />
    <FlatList data={items} numColumns={2} columnWrapperStyle={{ gap: 12, marginBottom: 12 }} keyExtractor={a => a.id} contentContainerStyle={s.content} renderItem={({ item }) => <AlbumTile album={item} refresh={() => void albums.refetch()} />} refreshing={albums.isRefetching} onRefresh={() => void albums.refetch()} onEndReached={() => { if (albums.hasNextPage && !albums.isFetchingNextPage) void albums.fetchNextPage(); }} onEndReachedThreshold={0.5}
      ListHeaderComponent={<View style={s.section}><Text style={s.heading}>Альбомы {owner}</Text>{meta?.enabled === false ? <Text style={s.text}>Галерея пока недоступна.</Text> : null}{meta?.isOwner && meta.enabled ? <><Text style={s.muted}>{meta.usedSlots}/200 фотографий</Text><Button label="Создать альбом" variant="outline" onPress={() => setCreating(true)} /><UploadControls owner={owner} usedSlots={meta.usedSlots} /></> : null}{albums.isError ? <Failure error={albums.error} retry={() => void albums.refetch()} /> : null}</View>}
      ListEmptyComponent={albums.isPending ? <ActivityIndicator color={COLORS.primary} /> : meta?.enabled ? <Text style={s.text}>Альбомов пока нет.</Text> : null}
      ListFooterComponent={albums.isFetchingNextPage ? <ActivityIndicator color={COLORS.primary} /> : null} />
    {creating ? <AlbumEditor owner={owner} close={() => setCreating(false)} /> : null}
  </SafeAreaView>;
}
function PhotoEditor({ photo, album, close }: { photo: GalleryPhotoDto; album: GalleryAlbumDto; close: () => void }) {
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const { viewer, cache } = useGalleryContext();
  const albums = useAlbums(album.ownerUsername);
  const execute = async (action: () => Promise<unknown>) => {
    setBusy(true); setError(undefined);
    try { await action(); await cache.invalidateQueries({ queryKey: galleryKeys.owner(viewer, album.ownerUsername) }); close(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };
  return <EditorShell title="Фотография" close={close}>
    {photo.status !== "ready" ? <Text style={s.muted}>{photoStatus[photo.status]}</Text> : null}
    {photo.status === "failed" ? <Text accessibilityRole="alert" style={s.error}>{photo.errorMessage ?? "Не удалось обработать фотографию. Выберите файл заново."}</Text> : null}
    {photo.uploadId && ["failed", "pending"].includes(photo.status) ? <UploadControls owner={album.ownerUsername} albumId={album.id} retryUploadId={photo.uploadId} onRetried={close} compact /> : null}
    <Input label="Подпись" value={caption} onChangeText={setCaption} multiline maxLength={2000} />
    {error ? <Text style={s.error} accessibilityRole="alert">{galleryError(error)}</Text> : null}
    <Button label="Сохранить подпись" loading={busy} disabled={busy} onPress={() => void execute(() => galleryApi.updatePhoto(photo.id, { caption: caption.trim() || null }))} />
    {photo.status === "ready" ? <Button label={album.coverPhotoId === photo.id ? "Убрать обложку" : "Сделать обложкой"} variant="outline" disabled={busy} onPress={() => void execute(() => galleryApi.setCover(album.id, { photoId: album.coverPhotoId === photo.id ? null : photo.id }))} /> : null}
    {photo.status === "ready" ? <><Text style={s.heading}>Переместить в альбом</Text>{albums.isError ? <Failure error={albums.error} retry={() => void albums.refetch()} /> : null}{albums.isPending ? <ActivityIndicator color={COLORS.primary} /> : null}{albums.data?.pages.flatMap(p => p.items).filter(a => a.id !== album.id && a.canEdit).map(a => <Button key={a.id} label={a.name} variant="outline" disabled={busy} onPress={() => void execute(() => galleryApi.movePhoto(photo.id, { albumId: a.id, clientRequestId: requestId() }))} />)}{albums.hasNextPage ? <Button label="Ещё альбомы" variant="outline" loading={albums.isFetchingNextPage} onPress={() => void albums.fetchNextPage()} /> : null}</> : null}
    <Button label="Удалить фотографию" variant="danger" disabled={busy} onPress={() => Alert.alert("Удалить фотографию?", "Фотография будет удалена из галереи.", [{ text: "Отмена", style: "cancel" }, { text: "Удалить", style: "destructive", onPress: () => void execute(() => galleryApi.deletePhoto(photo.id)) }])} />
  </EditorShell>;
}
const photoStatus = { pending: "Ожидает загрузки", processing: "Обрабатывается…", moving: "Перемещается…", failed: "Ошибка обработки", ready: "" };
export function GalleryAlbumScreen() {
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ albumId: string | string[]; username?: string | string[] }>();
  const { username, viewer, cache } = useGalleryContext();
  const albumId = param(params.albumId) ?? "";
  const ownerHint = param(params.username) ?? username;
  const foreground = useForeground();
  const router = useRouter();
  const album = useQuery({ queryKey: [...galleryKeys.album(viewer, ownerHint, albumId), "metadata"], queryFn: () => galleryApi.getAlbum(albumId), enabled: !!viewer && !!albumId && foreground, gcTime: 0, retry: 1 });
  const owner = album.data?.ownerUsername ?? ownerHint;
  const photos = useInfiniteQuery({ queryKey: [...galleryKeys.album(viewer, owner, albumId), "photos"], initialPageParam: null as string | null, queryFn: ({ pageParam }) => galleryApi.listPhotos(albumId, { cursor: pageParam, pageSize: 30 }), getNextPageParam: page => page.nextCursor ?? undefined, enabled: !!viewer && !!album.data && foreground, gcTime: 0, retry: 1,
    refetchInterval: query => foreground && query.state.data?.pages.some(p => p.items.some(photo => ["pending", "processing", "moving"].includes(photo.status))) ? 3000 : false });
  const [editing, setEditing] = useState(false);
  const [photoEdit, setPhotoEdit] = useState<GalleryPhotoDto | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>();
  const closeViewer = useCallback(() => setViewing(null), []);
  const items = photos.data?.pages.flatMap(p => p.items) ?? [];
  const ready = items.filter(p => p.status === "ready");
  const meta = photos.data?.pages[0];
  const more = () => { if (photos.hasNextPage && !photos.isFetchingNextPage) void photos.fetchNextPage(); };
  const refresh = () => { void album.refetch(); void photos.refetch(); };
  const remove = () => Alert.alert("Удалить альбом?", "Все фотографии в этом альбоме также будут удалены.", [{ text: "Отмена", style: "cancel" }, { text: "Удалить", style: "destructive", onPress: () => {
    setDeleting(true); setDeleteError(undefined);
    void galleryApi.deleteAlbum(albumId).then(async () => { await cache.invalidateQueries({ queryKey: galleryKeys.owner(viewer, owner) }); router.back(); }).catch(setDeleteError).finally(() => setDeleting(false));
  } }]);
  return <SafeAreaView edges={["bottom", "left", "right"]} style={s.screen}>
    <Stack.Screen options={{ headerShown: true, title: album.data?.name ?? "Альбом", headerStyle: { backgroundColor: COLORS.background }, headerTintColor: COLORS.text }} />
    <FlatList data={meta?.enabled === false ? [] : items} numColumns={3} keyExtractor={p => p.id} contentContainerStyle={s.content} onRefresh={refresh} refreshing={photos.isRefetching} onEndReached={more} onEndReachedThreshold={0.5}
      ListHeaderComponent={<View style={s.section}>
        {album.isPending ? <ActivityIndicator color={COLORS.primary} /> : null}
        {album.isError ? <Failure error={album.error} retry={() => void album.refetch()} /> : null}
        {album.data ? <><Text style={s.heading}>{album.data.name}</Text><Text style={s.muted}>{album.data.photoCount} фото · {album.data.isVisible ? "Виден всем авторизованным" : "Только для вас"}</Text></> : null}
        {meta?.enabled === false ? <Text style={s.text}>Галерея пока недоступна.</Text> : null}
        {album.data?.canEdit && meta?.enabled ? <><Text style={s.muted}>{meta.usedSlots}/200 фотографий</Text><Button label="Настройки альбома" variant="outline" onPress={() => setEditing(true)} /><UploadControls owner={owner} albumId={albumId} usedSlots={meta.usedSlots} /><Button label="Удалить альбом" variant="danger" loading={deleting} disabled={deleting} onPress={remove} /></> : null}
        {deleteError ? <Text style={s.error}>{galleryError(deleteError)}</Text> : null}
        {photos.isError ? <Failure error={photos.error} retry={() => void photos.refetch()} /> : null}
      </View>}
      renderItem={({ item }) => <View style={[s.grid, { flex: 0, width: (width - 32) / 3 - 8, aspectRatio: undefined, minHeight: 120 }]}>
        <Pressable style={{ aspectRatio: 1 }} accessibilityRole="button" accessibilityLabel={item.status === "ready" ? item.caption ?? "Открыть фотографию" : photoStatus[item.status]} disabled={item.status !== "ready"} onPress={() => setViewing(ready.findIndex(p => p.id === item.id))}>
          {item.thumbUrl ? <GalleryImage source={{ uri: item.thumbUrl }} style={s.thumb} contentFit="cover" refresh={() => void photos.refetch()} /> : <View style={[s.thumb, s.placeholder]}><Text style={s.muted}>{photoStatus[item.status]}</Text></View>}
        </Pressable>
        {item.status !== "ready" && item.thumbUrl ? <Text style={s.muted}>{photoStatus[item.status]}</Text> : null}
        {item.status === "failed" ? <Text accessibilityRole="alert" style={s.error}>{item.errorMessage ?? "Не удалось обработать фото."}</Text> : null}
        {item.canEdit ? <Pressable accessibilityRole="button" accessibilityLabel="Настройки фотографии" style={[s.close, { alignItems: "center" }]} onPress={() => setPhotoEdit(item)}><Text style={s.muted}>Изменить</Text></Pressable> : null}
      </View>}
      ListEmptyComponent={photos.isPending && album.data ? <ActivityIndicator color={COLORS.primary} /> : meta?.enabled ? <Text style={s.text}>В альбоме пока нет фотографий.</Text> : null}
      ListFooterComponent={photos.isFetchingNextPage ? <ActivityIndicator color={COLORS.primary} /> : null} />
    {editing && album.data ? <AlbumEditor owner={owner} album={album.data} close={() => setEditing(false)} /> : null}
    {photoEdit && album.data ? <PhotoEditor photo={photoEdit} album={album.data} close={() => setPhotoEdit(null)} /> : null}
    {viewing !== null && viewing >= 0 && ready.length ? <PhotoViewer photos={ready} start={viewing} owner={owner} total={album.data?.photoCount ?? ready.length} more={more} close={closeViewer} /> : null}
  </SafeAreaView>;
}
