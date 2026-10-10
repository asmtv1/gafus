import { useCallback, useState } from "react";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Alert, FlatList, Platform, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Menu, Text } from "react-native-paper";
import { AppBackButton, Loading, MascotSpinner, TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GalleryImage } from "./image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { galleryApi } from "@/shared/lib/api/gallery";
import { Button } from "@/shared/components/ui";
import { COLORS, FONTS } from "@/shared/config";
import { AlbumEditor, AlbumTile, Failure } from "./components";
import { galleryError, galleryKeys, useAlbums, useForeground, useGalleryContext } from "./data";
import { UploadControls } from "./uploads";
import { PhotoViewer } from "./viewer";
import { PhotoActionsMenu } from "./PhotoActionsMenu";
import { styles as s } from "./styles";
const param = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export function GalleryAlbumsScreen() {
  const params = useLocalSearchParams<{ username?: string | string[] }>();
  const { username } = useGalleryContext();
  const owner = param(params.username) ?? username;
  const albums = useAlbums(owner);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshAlbums = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await albums.refetch(); }
    finally { setRefreshing(false); }
  };
  const meta = albums.data?.pages[0];
  const items = albums.data?.pages.flatMap(page => page.items) ?? [];
  return <SafeAreaView edges={[]} style={s.screen}>
    <StatusBar style="dark" translucent backgroundColor="transparent" />
    <FlatList data={items} numColumns={2} columnWrapperStyle={{ gap: 12, marginBottom: 8 }} keyExtractor={a => a.id}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      contentInset={{ top: 0, bottom: 0 }}
      automaticallyAdjustsScrollIndicatorInsets={false}
      contentContainerStyle={[s.content, s.albumsListContent]} renderItem={({ item }) => <AlbumTile album={item} refresh={() => void albums.refetch()} compact />} refreshing={refreshing} onRefresh={() => void refreshAlbums()} onEndReached={() => { if (albums.hasNextPage && !albums.isFetchingNextPage) void albums.fetchNextPage(); }} onEndReachedThreshold={0.5}
      ListHeaderComponent={<>
        <Image
          source={require("../../../assets/images/albums-header.webp")}
          style={s.albumsHeaderImage}
          contentFit="cover"
          contentPosition="center"
          accessible
          accessibilityLabel="Альбомы. Сохраняйте и упорядочивайте фотографии ваших питомцев"
        />
        <View style={s.albumsToolbar}>
        {meta && !meta.isOwner ? <Text accessibilityRole="header" style={s.albumsPageTitle}>Альбомы {owner}</Text> : null}
        {meta?.enabled === false ? <Text style={s.text}>Галерея пока недоступна.</Text> : null}
        {meta?.isOwner && meta.enabled ? <>
          <Text style={s.albumsQuota}>{meta.usedSlots} из 200 фотографий</Text>
          <UploadControls
            owner={owner}
            usedSlots={meta.usedSlots}
            inlineHeader
            leadingAction={<Button
              label="Создать альбом"
              variant="caramel"
              fontSize={13}
              lineHeight={18}
              height={44}
              borderRadius={14}
              horizontalPadding={0}
              verticalPadding={0}
              labelStyle={{ marginHorizontal: 0, marginVertical: 0 }}
              onPress={() => setCreating(true)}
              animatedPress
            />}
          />
        </> : null}
        {albums.isError ? <Failure error={albums.error} retry={() => void albums.refetch()} /> : null}
      </View></>}
      ListEmptyComponent={albums.isPending ? <Loading variant="inline" size="large" message="Загрузка альбомов…" /> : meta?.enabled ? <Text style={s.muted}>Альбомов пока нет.</Text> : null}
      ListFooterComponent={albums.isFetchingNextPage ? <MascotSpinner size="small" /> : null} />
    {creating ? <AlbumEditor owner={owner} close={() => setCreating(false)} /> : null}
  </SafeAreaView>;
}
const photoStatus = { pending: "Ожидает загрузки", processing: "Обрабатывается…", moving: "Перемещается…", failed: "Ошибка обработки", ready: "" };
export function GalleryAlbumScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ albumId: string | string[]; username?: string | string[] }>();
  const { username, viewer, cache } = useGalleryContext();
  const albumId = param(params.albumId) ?? "";
  const ownerHint = param(params.username) ?? username;
  const foreground = useForeground();
  const router = useRouter();
  const album = useQuery({ queryKey: [...galleryKeys.album(viewer, ownerHint, albumId), "metadata"], queryFn: () => galleryApi.getAlbum(albumId), enabled: !!viewer && !!albumId && foreground, gcTime: 0, retry: 1 });
  const owner = album.data?.ownerUsername ?? ownerHint;
  const photos = useInfiniteQuery({ queryKey: [...galleryKeys.album(viewer, owner, albumId), "photos"], initialPageParam: null as string | null, queryFn: ({ pageParam }) => galleryApi.listPhotos(albumId, { cursor: pageParam, pageSize: 30 }), getNextPageParam: page => page.nextCursor ?? undefined, enabled: !!viewer && !!album.data && foreground, gcTime: 0, retry: 1,
    refetchInterval: query => foreground && query.state.data?.pages.some(p => p.items.some(photo => ["pending", "processing", "moving"].includes(photo.status))) ? 5000 : false });
  const [editing, setEditing] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [choosingCover, setChoosingCover] = useState(false);
  const [savingCover, setSavingCover] = useState(false);
  const [coverError, setCoverError] = useState<unknown>();
  const chooseCover = async (photoId: string) => {
    if (savingCover || !album.data?.canEdit) return;
    setSavingCover(true); setCoverError(undefined);
    try {
      await galleryApi.setCover(albumId, { photoId });
      await cache.invalidateQueries({ queryKey: galleryKeys.owner(viewer, owner) });
      setChoosingCover(false);
    } catch (error) { setCoverError(error); }
    finally { setSavingCover(false); }
  };
  const [activePhotoMenuId, setActivePhotoMenuId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>();
  const closeViewer = useCallback(() => setViewing(null), []);
  const items = photos.data?.pages.flatMap(p => p.items) ?? [];
  const ready = items.filter(p => p.status === "ready");
  const meta = photos.data?.pages[0];
  const more = () => { if (photos.hasNextPage && !photos.isFetchingNextPage) void photos.fetchNextPage(); };
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await Promise.all([album.refetch(), photos.refetch()]); }
    finally { setRefreshing(false); }
  };
  // Deep links may open an album without a previous screen in the native stack.
  const backToAlbums = () => router.dismissTo({
    pathname: "/(main)/(tabs)/albums",
    params: { username: owner },
  });
  const remove = () => Alert.alert("Удалить альбом?", "Все фотографии в этом альбоме также будут удалены.", [{ text: "Отмена", style: "cancel" }, { text: "Удалить", style: "destructive", onPress: () => {
    setDeleting(true); setDeleteError(undefined);
    void galleryApi.deleteAlbum(albumId).then(async () => { await cache.invalidateQueries({ queryKey: galleryKeys.owner(viewer, owner) }); backToAlbums(); }).catch(setDeleteError).finally(() => setDeleting(false));
  } }]);
  return <SafeAreaView edges={["bottom", "left", "right"]} style={s.screen}>
    <StatusBar style="dark" translucent backgroundColor="transparent" />
    <Stack.Screen options={{
      headerShown: true,
      title: album.data?.name ?? "Альбом",
      headerTransparent: true,
      headerBackground: () => null,
      headerStyle: { backgroundColor: "transparent" },
      headerTintColor: COLORS.text,
      headerShadowVisible: false,
      headerBackVisible: false,
      headerLeft: () => <AppBackButton onPress={backToAlbums} />,
    }} />
    <FlatList data={meta?.enabled === false ? [] : items} numColumns={3} keyExtractor={p => p.id} contentContainerStyle={[s.content, styles.albumList, { paddingTop: insets.top + (Platform.OS === "ios" ? 48 : 56) }]} onRefresh={() => void refresh()} refreshing={refreshing}
      automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never" onEndReached={more} onEndReachedThreshold={0.5}
      ListHeaderComponent={<View style={styles.albumHeader}>
        {album.isPending ? <Loading variant="inline" size="large" message="Загрузка альбома…" /> : null}
        {album.isError ? <Failure error={album.error} retry={() => void album.refetch()} /> : null}
        {album.data ? <View style={styles.albumToolbar}>
          <Text style={styles.albumMeta} numberOfLines={2}>
            {album.data.photoCount} фото · {album.data.isVisible ? "Виден в GAFUS" : "Только для вас"}
            {album.data.canEdit && meta?.enabled ? ` · ${meta.usedSlots}/200 занято` : ""}
          </Text>
          {album.data.canEdit && meta?.enabled ? <Menu
            visible={actionsOpen}
            onDismiss={() => setActionsOpen(false)}
            contentStyle={styles.albumActionsMenu}
            anchor={<Pressable
              accessibilityRole="button"
              accessibilityLabel="Действия с альбомом"
              accessibilityState={{ expanded: actionsOpen }}
              onPress={() => setActionsOpen(true)}
              style={styles.albumMore}
            ><MaterialCommunityIcons name="dots-horizontal" size={24} color={COLORS.primary} /></Pressable>}
          >
            <Menu.Item leadingIcon="cog-outline" title="Настройки альбома" onPress={() => { setActionsOpen(false); setEditing(true); }} />
            <Menu.Item
              leadingIcon="image-edit-outline"
              title={choosingCover ? "Отменить выбор обложки" : album.data.coverPhotoId ? "Изменить обложку" : "Выбрать обложку"}
              disabled={savingCover || !album.data.photoCount}
              onPress={() => { setActionsOpen(false); setCoverError(undefined); setChoosingCover(value => !value); }}
            />
            <Menu.Item leadingIcon="information-outline" title="Правила загрузки" onPress={() => {
              setActionsOpen(false);
              Alert.alert("Загрузка фотографий", "JPG, PNG и WebP до 10 МиБ. HEIC преобразуется в JPG. Не закрывайте приложение до завершения загрузки.");
            }} />
            <Menu.Item leadingIcon="delete-outline" title="Удалить альбом" titleStyle={styles.albumDeleteText} disabled={deleting}
              onPress={() => { setActionsOpen(false); remove(); }} />
          </Menu> : null}
        </View> : null}
        {meta?.enabled === false ? <Text style={s.text}>Галерея пока недоступна.</Text> : null}
        {album.data?.canEdit && meta?.enabled ? <>
          <UploadControls owner={owner} albumId={albumId} usedSlots={meta.usedSlots} minimal />
          {choosingCover ? <View style={styles.albumCoverHint}>
            <Text style={styles.albumCoverHintText}>Выберите фото для обложки</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Отменить выбор обложки"
              onPress={() => setChoosingCover(false)} style={styles.albumCoverCancel}>
              <Text style={styles.albumCoverCancelText}>Отмена</Text>
            </Pressable>
          </View> : null}
        </> : null}
        {coverError ? <Text accessibilityRole="alert" style={s.error}>{galleryError(coverError)}</Text> : null}
        {deleteError ? <Text style={s.error}>{galleryError(deleteError)}</Text> : null}
        {photos.isError ? <Failure error={photos.error} retry={() => void photos.refetch()} /> : null}
      </View>}
      renderItem={({ item }) => <View style={[s.grid, styles.albumPhotoCell, { width: (width - 32) / 3 - 8 }]}>
        <Pressable style={styles.albumPhotoTap} accessibilityRole="button" accessibilityLabel={item.status === "ready" ? choosingCover ? "Сделать обложкой фотографию" : item.caption ?? "Открыть фотографию" : photoStatus[item.status]} disabled={item.status !== "ready" || (choosingCover && savingCover)} onPress={() => { if (choosingCover) void chooseCover(item.id); else setViewing(ready.findIndex(p => p.id === item.id)); }}>
          {item.thumbUrl ? <GalleryImage source={{ uri: item.thumbUrl }} style={s.thumb} contentFit="cover" refresh={() => void photos.refetch()} /> : <View style={[s.thumb, s.placeholder]}><Text style={s.muted}>{photoStatus[item.status]}</Text></View>}
        </Pressable>
        {item.status !== "ready" && item.thumbUrl ? <Text style={s.muted}>{photoStatus[item.status]}</Text> : null}
        {item.status === "failed" ? <Text accessibilityRole="alert" style={s.error}>{item.errorMessage ?? "Не удалось обработать фото."}</Text> : null}
        {album.data?.coverPhotoId === item.id ? <View pointerEvents="none" style={styles.albumCoverBadge}>
          <MaterialCommunityIcons name="image-check-outline" size={16} color={COLORS.primary} />
          <Text style={styles.albumCoverBadgeText}>Обложка</Text>
        </View> : null}
        {item.canEdit && album.data && !choosingCover ? (
          <View style={styles.albumPhotoEdit}>
            {activePhotoMenuId === item.id ? (
              <PhotoActionsMenu
                photo={item}
                album={album.data}
                onDismiss={() => setActivePhotoMenuId(null)}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Настройки фотографии"
                accessibilityState={{ expanded: false }}
                hitSlop={6}
                style={styles.albumPhotoEditTrigger}
                onPress={() => setActivePhotoMenuId(item.id)}
              >
                <MaterialCommunityIcons name="pencil" size={17} color={COLORS.primary} />
              </Pressable>
            )}
          </View>
        ) : null}
      </View>}
      ListEmptyComponent={photos.isPending && album.data ? <Loading variant="inline" size="large" message="Загрузка фотографий…" /> : meta?.enabled && !album.isPending ? <Text style={s.text}>В альбоме пока нет фотографий.</Text> : null}
      ListFooterComponent={photos.isFetchingNextPage ? <MascotSpinner size="small" /> : null} />
    {editing && album.data ? <AlbumEditor owner={owner} album={album.data} close={() => setEditing(false)} /> : null}
    {viewing !== null && viewing >= 0 && ready.length ? <PhotoViewer photos={ready} start={viewing} owner={owner} total={album.data?.photoCount ?? ready.length} more={more} close={closeViewer} /> : null}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  albumList: { gap: 8 },
  albumHeader: { gap: 8, marginBottom: 4 },
  albumToolbar: { flexDirection: "row", alignItems: "center", minHeight: 44, gap: 8 },
  albumMeta: { flex: 1, fontFamily: FONTS.montserrat, fontSize: 12, lineHeight: 18, color: COLORS.textSecondary },
  albumMore: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: COLORS.cardBackground },
  albumActionsMenu: { backgroundColor: COLORS.cardBackground },
  albumDeleteText: { color: "#A53825" },
  albumCoverHint: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.cardBackground, paddingLeft: 12, borderRadius: 12 },
  albumCoverHintText: { flex: 1, fontFamily: FONTS.montserratMedium, fontSize: 12, color: COLORS.text },
  albumCoverCancel: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12 },
  albumCoverCancelText: { fontFamily: FONTS.montserratMedium, fontSize: 12, color: COLORS.primary },
  albumPhotoCell: { flex: 0, aspectRatio: 1, minHeight: 0 },
  albumPhotoTap: { flex: 1 },
  albumCoverBadge: { position: "absolute", top: 4, left: 4, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: COLORS.cardBackground, paddingVertical: 2, paddingHorizontal: 4, borderRadius: 6 },
  albumCoverBadgeText: { fontFamily: FONTS.montserratMedium, fontSize: 9, color: COLORS.primary },
  albumPhotoEdit: { position: "absolute", bottom: 4, right: 4, width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: COLORS.cardBackground },
  albumPhotoEditTrigger: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
});
