import { useCallback, useEffect, useRef, useState } from "react";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Alert, FlatList, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Menu, Text } from "react-native-paper";
import {
  AppBackButton,
  Loading,
  MascotSpinner,
  TexturedSafeAreaView as SafeAreaView,
} from "@/shared/components";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GalleryImage } from "./image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Button } from "@/shared/components/ui";
import { COLORS, FONTS } from "@/shared/config";
import { AlbumEditor, AlbumTile, Failure } from "./components";
import { galleryKeys, useAlbums, useForeground, useGalleryContext } from "./data";
import {
  galleryExpiryDelay,
  privateGalleryReads,
  projectGalleryPage,
  publicGalleryAlbum,
  publicGalleryPhoto,
  sameGalleryActor,
} from "./privateRead";
import { UploadControls } from "./uploads";
import { PhotoViewer } from "./viewer";
import { PhotoActionsMenu } from "./PhotoActionsMenu";
import { styles as s } from "./styles";
import { reportClientError } from "@/shared/lib/tracer";
import { deleteAlbumAndConfirm } from "./albumDelete";
import { setAlbumCoverAndReadback } from "./albumMutation";
import { useAuthStore } from "@/shared/stores/authStore";
const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

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
    try {
      await albums.refetch();
    } finally {
      setRefreshing(false);
    }
  };
  const meta = albums.data?.pages[0];
  const items =
    albums.data?.pages.flatMap((page) => page.items.map((item) => publicGalleryAlbum(item))) ?? [];
  return (
    <SafeAreaView edges={[]} style={s.screen}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <FlatList
        data={items}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, marginBottom: 8 }}
        keyExtractor={(a) => a.id}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        contentInset={{ top: 0, bottom: 0 }}
        automaticallyAdjustsScrollIndicatorInsets={false}
        contentContainerStyle={[s.content, s.albumsListContent]}
        renderItem={({ item }) => (
          <AlbumTile album={item} refresh={() => void albums.refetch()} compact />
        )}
        refreshing={refreshing}
        onRefresh={() => void refreshAlbums()}
        onEndReached={() => {
          if (albums.hasNextPage && !albums.isFetchingNextPage && !albums.isFetchNextPageError)
            void albums.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <>
            <Image
              source={require("../../../assets/images/albums-header.webp")}
              style={s.albumsHeaderImage}
              contentFit="cover"
              contentPosition="center"
              accessible
              accessibilityLabel="Альбомы. Сохраняйте и упорядочивайте фотографии ваших питомцев"
            />
            <View style={s.albumsToolbar}>
              {meta && !meta.isOwner ? (
                <Text accessibilityRole="header" style={s.albumsPageTitle}>
                  Альбомы {owner}
                </Text>
              ) : null}
              {meta?.enabled === false ? (
                <Text style={s.text}>Галерея пока недоступна.</Text>
              ) : null}
              {meta?.isOwner && meta.enabled ? (
                <>
                  <Text style={s.albumsQuota}>{meta.usedSlots} из 200 фотографий</Text>
                  <UploadControls
                    owner={owner}
                    usedSlots={meta.usedSlots}
                    inlineHeader
                    leadingAction={
                      <Button
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
                      />
                    }
                  />
                </>
              ) : null}
              {albums.isError && !albums.isFetchNextPageError ? (
                <Failure error={albums.error} retry={() => void albums.refetch()} />
              ) : null}
            </View>
          </>
        }
        ListEmptyComponent={
          albums.isPending ? (
            <Loading variant="inline" message="Загрузка альбомов…" />
          ) : !albums.isError && meta?.enabled ? (
            <Text style={s.muted}>Альбомов пока нет.</Text>
          ) : null
        }
        ListFooterComponent={
          albums.isFetchingNextPage ? (
            <MascotSpinner />
          ) : albums.isFetchNextPageError ? (
            <View style={s.card}>
              <Text accessibilityRole="alert" style={s.error}>
                Не удалось загрузить следующую страницу. Уже загруженные альбомы доступны.
              </Text>
              <Button
                label="Повторить страницу"
                variant="outline"
                onPress={() => void albums.fetchNextPage()}
              />
            </View>
          ) : null
        }
      />
      {creating ? <AlbumEditor owner={owner} close={() => setCreating(false)} /> : null}
    </SafeAreaView>
  );
}
const photoStatus = {
  pending: "Ожидает загрузки",
  processing: "Обрабатывается…",
  moving: "Перемещается…",
  failed: "Ошибка обработки",
  ready: "",
};
export function GalleryAlbumScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    albumId: string | string[];
    username?: string | string[];
  }>();
  const { username, viewer, actor, cache } = useGalleryContext();
  const albumId = param(params.albumId) ?? "";
  const ownerHint = param(params.username) ?? username;
  const foreground = useForeground();
  const router = useRouter();
  const album = useQuery({
    queryKey: [...galleryKeys.album(viewer, ownerHint, albumId), "metadata"],
    queryFn: async () => {
      if (!actor || !sameGalleryActor(actor)) throw new Error("GALLERY_SESSION_CHANGED");
      const data = await privateGalleryReads(actor).getAlbum(albumId);
      if (!sameGalleryActor(actor) || data.id !== albumId) throw new Error("GALLERY_READ_UNKNOWN");
      return publicGalleryAlbum(data);
    },
    enabled: !!actor && !!albumId && foreground,
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });
  const owner = album.data?.ownerUsername ?? ownerHint;
  const photos = useInfiniteQuery({
    queryKey: [...galleryKeys.album(viewer, owner, albumId), "photos"],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!actor || !sameGalleryActor(actor)) throw new Error("GALLERY_SESSION_CHANGED");
      const data = await privateGalleryReads(actor).listPhotos(albumId, {
        cursor: pageParam,
        pageSize: 30,
      });
      if (!sameGalleryActor(actor)) throw new Error("GALLERY_SESSION_CHANGED");
      return projectGalleryPage(data, "photos");
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!actor && !!album.data && foreground,
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchInterval: (query) =>
      foreground && !query.state.error &&
      query.state.data?.pages.some((p) =>
        p.items.some((photo) => ["pending", "processing", "moving"].includes(photo.status)),
      )
        ? 5000
        : false,
  });
  const photoExpiryDelay = galleryExpiryDelay(photos.data?.pages.flatMap((p) => p.items) ?? []);
  const refetchPhotos = photos.refetch;
  const refetchAlbum = album.refetch;
  useEffect(() => {
    if (!actor || !foreground || photoExpiryDelay == null) return;
    const timer = setTimeout(() => {
      if (sameGalleryActor(actor)) void refetchPhotos();
    }, photoExpiryDelay);
    return () => clearTimeout(timer);
  }, [actor, foreground, photoExpiryDelay, refetchPhotos]);
  useEffect(() => {
    if (!actor || !foreground || !album.data?.urlsExpireAt) return;
    const remaining = Date.parse(album.data.urlsExpireAt) - Date.now() - 5_000;
    if (!Number.isFinite(remaining)) return;
    const timer = setTimeout(
      () => {
        if (sameGalleryActor(actor)) void refetchAlbum();
      },
      Math.max(1000, remaining),
    );
    return () => clearTimeout(timer);
  }, [actor, foreground, album.data?.urlsExpireAt, refetchAlbum]);
  const [editing, setEditing] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [choosingCover, setChoosingCover] = useState(false);
  const [savingCover, setSavingCover] = useState(false);
  const [coverError, setCoverError] = useState<unknown>();
  const coverFlight = useRef(false);
  // No second PUT on an unconfirmed network ACK, even for a different photo.
  // A new independently mounted page constitutes a new explicit user attempt.
  const coverUnknown = useRef(false);
  const chooseCover = async (photoId: string) => {
    const currentAlbum = album.data;
    const live = () => !!actor && sameGalleryActor(actor) &&
      mounted.current && routeIdRef.current === albumId;
    if (!live() || coverFlight.current || coverUnknown.current ||
        !currentAlbum?.canEdit || currentAlbum.ownerId !== actor!.ownerId ||
        !currentAlbum.ownerUsername ||
        !photos.data?.pages.some(page => page.items.some(item =>
          item.id === photoId && item.status === "ready" && item.canEdit))) return;
    coverFlight.current = true;
    setSavingCover(true);
    setCoverError(undefined);
    try {
      const result = await setAlbumCoverAndReadback({
        actor: actor!, ownerUsername: currentAlbum.ownerUsername,
        album: currentAlbum, photoId, live,
      });
      if (!live()) return;
      if (result.status === "confirmed") {
        cache.setQueryData([...galleryKeys.album(viewer, ownerHint, albumId), "metadata"],
          result.album);
        await cache.invalidateQueries({queryKey: galleryKeys.owner(viewer, owner),
          refetchType: "none"});
        if (!live()) return;
        setChoosingCover(false);
      } else if (result.status === "stale") {
        return;
      } else {
        coverUnknown.current = result.status === "unknown";
        setCoverError(new Error(result.status === "rejected"
          ? "Сервер отклонил смену обложки. Проверьте доступ и попробуйте позже."
          : "Сохранение обложки не подтверждено. Проверьте альбом. Повтор заблокирован."));
      }
    } catch {
      if (!live()) return;
      coverUnknown.current = true;
      setCoverError(new Error("Сохранение обложки не подтверждено. Повтор заблокирован."));
      reportClientError(new Error("GALLERY_COVER_WRITE_UNKNOWN"), {
        issueKey: "GalleryAlbumScreen", keys: { operation: "set_cover" },
      });
    } finally {
      coverFlight.current = false;
      if (live()) setSavingCover(false);
    }
  };
  const [activePhotoMenuId, setActivePhotoMenuId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteUnknown, setDeleteUnknown] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteInFlight = useRef(false);
  const deleteUnknownRef = useRef(false);
  const mounted = useRef(true);
  const routeIdRef = useRef(albumId);
  routeIdRef.current = albumId;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const closeViewer = useCallback(() => setViewing(null), []);
  const items =
    photos.data?.pages.flatMap((p) => p.items.map((item) => publicGalleryPhoto(item))) ?? [];
  const ready = items.filter((p) => p.status === "ready");
  const meta = photos.data?.pages[0];
  const more = () => {
    if (photos.hasNextPage && !photos.isFetchingNextPage) void photos.fetchNextPage();
  };
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([album.refetch(), photos.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };
  // Deep links may open an album without a previous screen in the native stack.
  const backToAlbums = () =>
    router.dismissTo({
      pathname: "/(main)/(tabs)/albums",
      params: { username: owner },
    });
  const deleteLive = (id: string, expectedOwner: string) =>
    mounted.current &&
    routeIdRef.current === id &&
    useAuthStore.getState().user?.username === expectedOwner;
  const remove = () => {
    if (
      deleteInFlight.current ||
      deleteUnknownRef.current ||
      !actor ||
      !sameGalleryActor(actor) ||
      !album.data?.canEdit ||
      album.data.ownerId !== actor.ownerId ||
      owner !== username
    )
      return;
    const capturedActor = actor;
    const capturedAlbumId = albumId;
    const capturedOwner = owner;
    Alert.alert("Удалить альбом?", "Все фотографии в этом альбоме также будут удалены.", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => {
          // Alert may be accepted after logout/owner switch.
          const live = () => deleteLive(capturedAlbumId, capturedOwner);
          if (
            deleteInFlight.current ||
            deleteUnknownRef.current ||
            !live() ||
            !sameGalleryActor(capturedActor)
          )
            return;
          deleteInFlight.current = true;
          setDeleting(true);
          setDeleteError(null);
          void (async () => {
            try {
              const status = await deleteAlbumAndConfirm({
                actor: capturedActor,
                albumId: capturedAlbumId,
                live,
              });
              if (!live() || !sameGalleryActor(capturedActor)) return;
              if (status === "confirmed") {
                await cache.invalidateQueries({
                  queryKey: galleryKeys.owner(viewer, capturedOwner),
                });
                if (live() && sameGalleryActor(capturedActor)) backToAlbums();
              } else if (status === "unknown") {
                deleteUnknownRef.current = true;
                setDeleteUnknown(true);
                setDeleteError(
                  "Результат удаления неизвестен. Проверьте список альбомов перед повторной попыткой.",
                );
              } else if (status === "rejected") {
                setDeleteError("Не удалось удалить альбом. Проверьте доступ и повторите позднее.");
              }
            } finally {
              deleteInFlight.current = false;
              if (live() && sameGalleryActor(capturedActor)) setDeleting(false);
            }
          })();
        },
      },
    ]);
  };
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={s.screen}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.albumNavigation, { paddingTop: insets.top + 8 }]}>
        <AppBackButton onPress={backToAlbums} />
        <Text accessibilityRole="header" numberOfLines={1} style={styles.albumNavigationTitle}>
          {album.data?.name ?? "Альбом"}
        </Text>
      </View>
      <FlatList
        data={meta?.enabled === false ? [] : items}
        numColumns={3}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[s.content, styles.albumList]}
        onRefresh={() => void refresh()}
        refreshing={refreshing}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        onEndReached={more}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={styles.albumHeader}>
            {album.isPending ? <Loading variant="inline" message="Загрузка альбома…" /> : null}
            {album.isError ? (
              <Failure error={album.error} retry={() => void album.refetch()} />
            ) : null}
            {album.data ? (
              <View style={styles.albumToolbar}>
                <Text style={styles.albumMeta} numberOfLines={2}>
                  {album.data.photoCount} фото ·{" "}
                  {album.data.isVisible ? "Виден в GAFUS" : "Только для вас"}
                  {album.data.canEdit && meta?.enabled ? ` · ${meta.usedSlots}/200 занято` : ""}
                </Text>
                {album.data.canEdit && meta?.enabled ? (
                  <Menu
                    visible={actionsOpen}
                    onDismiss={() => setActionsOpen(false)}
                    contentStyle={styles.albumActionsMenu}
                    anchor={
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Действия с альбомом"
                        accessibilityState={{ expanded: actionsOpen }}
                        onPress={() => setActionsOpen(true)}
                        style={styles.albumMore}
                      >
                        <MaterialCommunityIcons
                          name="dots-horizontal"
                          size={24}
                          color={COLORS.primary}
                        />
                      </Pressable>
                    }
                  >
                    <Menu.Item
                      leadingIcon="cog-outline"
                      title="Настройки альбома"
                      titleStyle={styles.albumActionText}
                      onPress={() => {
                        setActionsOpen(false);
                        setEditing(true);
                      }}
                    />
                    <Menu.Item
                      leadingIcon="image-edit-outline"
                      titleStyle={styles.albumActionText}
                      title={
                        choosingCover
                          ? "Отменить выбор обложки"
                          : album.data.coverPhotoId
                            ? "Изменить обложку"
                            : "Выбрать обложку"
                      }
                      disabled={savingCover || !album.data.photoCount}
                      onPress={() => {
                        setActionsOpen(false);
                        setCoverError(undefined);
                        setChoosingCover((value) => !value);
                      }}
                    />
                    <Menu.Item
                      leadingIcon="information-outline"
                      title="Правила загрузки"
                      titleStyle={styles.albumActionText}
                      onPress={() => {
                        setActionsOpen(false);
                        Alert.alert(
                          "Загрузка фотографий",
                          "JPG, PNG и WebP до 10 МиБ. HEIC преобразуется в JPG. Не закрывайте приложение до завершения загрузки.",
                        );
                      }}
                    />
                    <Menu.Item
                      leadingIcon="delete-outline"
                      title="Удалить альбом"
                      titleStyle={styles.albumDeleteText}
                      disabled={deleting || deleteUnknown}
                      onPress={() => {
                        setActionsOpen(false);
                        remove();
                      }}
                    />
                  </Menu>
                ) : null}
              </View>
            ) : null}
            {meta?.enabled === false ? <Text style={s.text}>Галерея пока недоступна.</Text> : null}
            {album.data?.canEdit && meta?.enabled ? (
              <>
                <UploadControls
                  owner={owner}
                  albumId={albumId}
                  usedSlots={meta.usedSlots}
                  minimal
                />
                {choosingCover ? (
                  <View style={styles.albumCoverHint}>
                    <Text style={styles.albumCoverHintText}>Выберите фото для обложки</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Отменить выбор обложки"
                      onPress={() => setChoosingCover(false)}
                      style={styles.albumCoverCancel}
                    >
                      <Text style={styles.albumCoverCancelText}>Отмена</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : null}
            {coverError ? (
              <Text accessibilityRole="alert" style={s.error}>
                {coverUnknown.current
                  ? "Сохранение обложки не подтверждено. Проверьте альбом. Повтор заблокирован."
                  : "Не удалось сменить обложку. Проверьте доступ."}
              </Text>
            ) : null}
            {deleteError ? (
              <Text accessibilityRole="alert" style={s.error}>
                {deleteError}
              </Text>
            ) : null}
            {photos.isError ? (
              <Failure error={photos.error} retry={() => void photos.refetch()} />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[s.grid, styles.albumPhotoCell, { width: (width - 32) / 3 - 8 }]}>
            <Pressable
              style={styles.albumPhotoTap}
              accessibilityRole="button"
              accessibilityLabel={
                item.status === "ready"
                  ? choosingCover
                    ? "Сделать обложкой фотографию"
                    : (item.caption ?? "Открыть фотографию")
                  : photoStatus[item.status]
              }
              disabled={item.status !== "ready" ||
                (choosingCover && (savingCover || coverUnknown.current))}
              onPress={() => {
                if (choosingCover) void chooseCover(item.id);
                else setViewing(ready.findIndex((p) => p.id === item.id));
              }}
            >
              {item.thumbUrl ? (
                <GalleryImage
                  photoId={item.id}
                  source={{ uri: item.thumbUrl }}
                  style={s.thumb}
                  contentFit="cover"
                  refresh={() => void photos.refetch()}
                />
              ) : (
                <View style={[s.thumb, s.placeholder]}>
                  <Text style={s.muted}>{photoStatus[item.status]}</Text>
                </View>
              )}
            </Pressable>
            {item.status !== "ready" && item.thumbUrl ? (
              <Text style={s.muted}>{photoStatus[item.status]}</Text>
            ) : null}
            {item.status === "failed" ? (
              <Text accessibilityRole="alert" style={s.error}>
                {item.errorMessage ?? "Не удалось обработать фото."}
              </Text>
            ) : null}
            {album.data?.coverPhotoId === item.id ? (
              <View pointerEvents="none" style={styles.albumCoverBadge}>
                <MaterialCommunityIcons
                  name="image-check-outline"
                  size={16}
                  color={COLORS.primary}
                />
                <Text style={styles.albumCoverBadgeText}>Обложка</Text>
              </View>
            ) : null}
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
          </View>
        )}
        ListEmptyComponent={
          photos.isPending && album.data ? (
            <Loading variant="inline" message="Загрузка фотографий…" />
          ) : !album.isError && !photos.isError && meta?.enabled && !album.isPending ? (
            <Text style={s.text}>В альбоме пока нет фотографий.</Text>
          ) : null
        }
        ListFooterComponent={photos.isFetchingNextPage ? <MascotSpinner /> : null}
      />
      {editing && album.data ? (
        <AlbumEditor owner={owner} album={album.data} close={() => setEditing(false)} />
      ) : null}
      {viewing !== null && viewing >= 0 && ready.length ? (
        <PhotoViewer
          photos={ready}
          start={viewing}
          owner={owner}
          total={album.data?.photoCount ?? ready.length}
          more={more}
          close={closeViewer}
        />
      ) : null}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  albumNavigation: {
    position: "relative",
    minHeight: 52,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  albumNavigationTitle: {
    position: "absolute",
    left: 132,
    right: 132,
    bottom: 19,
    fontFamily: FONTS.montserratMedium,
    fontSize: 16,
    lineHeight: 22,
    includeFontPadding: false,
    color: COLORS.text,
    textAlign: "center",
  },
  albumList: { gap: 8 },
  albumHeader: { gap: 8, marginBottom: 4 },
  albumToolbar: { flexDirection: "row", alignItems: "center", minHeight: 44, gap: 8 },
  albumMeta: {
    flex: 1,
    fontFamily: FONTS.montserrat,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textSecondary,
  },
  albumMore: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: COLORS.cardBackground,
  },
  albumActionsMenu: { backgroundColor: COLORS.cardBackground },
  albumActionText: { color: "#000000" },
  albumDeleteText: { color: "#A53825" },
  albumCoverHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.cardBackground,
    paddingLeft: 12,
    borderRadius: 12,
  },
  albumCoverHintText: {
    flex: 1,
    fontFamily: FONTS.montserratMedium,
    fontSize: 12,
    color: COLORS.text,
  },
  albumCoverCancel: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12 },
  albumCoverCancelText: { fontFamily: FONTS.montserratMedium, fontSize: 12, color: COLORS.primary },
  albumPhotoCell: { flex: 0, aspectRatio: 1, minHeight: 0 },
  albumPhotoTap: { flex: 1 },
  albumCoverBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: COLORS.cardBackground,
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  albumCoverBadgeText: { fontFamily: FONTS.montserratMedium, fontSize: 9, color: COLORS.primary },
  albumPhotoEdit: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: COLORS.cardBackground,
  },
  albumPhotoEditTrigger: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
});
