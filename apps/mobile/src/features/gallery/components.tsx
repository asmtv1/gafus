import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { Loading, TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { AlbumTile } from "./AlbumTile";
export { AlbumTile } from "./AlbumTile";
import { useRouter, type Href } from "expo-router";
import { GALLERY_LIMITS, type GalleryAlbumDto } from "@gafus/types";
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
  const [description, setDescription] = useState(album?.description ?? "");
  const [visible, setVisible] = useState(album?.isVisible ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const { viewer, cache } = useGalleryContext();
  const cancel = () => { if (!busy) close(); };
  const save = async () => {
    setBusy(true); setError(undefined);
    try {
      const input = {
        name: name.trim(),
        description: description.trim() || null,
        isVisible: visible,
      };
      if (album) await galleryApi.updateAlbum(album.id, input); else await galleryApi.createAlbum(input);
      await cache.invalidateQueries({ queryKey: galleryKeys.owner(viewer, owner) }); close();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return <EditorShell title={album ? "Настройки альбома" : "Новый альбом"} close={cancel}>
    <Input
      label="Название альбома"
      value={name}
      onChangeText={setName}
      maxLength={GALLERY_LIMITS.albumName}
      autoCapitalize="sentences"
      editable={!busy}
    />
    <Input
      label="Описание (необязательно)"
      accessibilityLabel="Описание альбома"
      value={description}
      onChangeText={setDescription}
      maxLength={GALLERY_LIMITS.caption}
      multiline
      numberOfLines={3}
      textAlignVertical="top"
      style={s.albumDescriptionInput}
      editable={!busy}
    />
    <Text style={s.albumDescriptionCounter}>
      {description.length} / {GALLERY_LIMITS.caption} символов
    </Text>
    <View style={s.visibilityCard} testID="album-visibility-card">
      <View style={s.visibilityRow}>
        <View style={s.visibilityLabelWrap}>
          <Text style={s.visibilityLabel}>Виден всем авторизованным</Text>
        </View>
        <View style={s.visibilitySwitchSlot}>
          <Switch
            value={visible}
            onValueChange={setVisible}
            disabled={busy}
            accessibilityLabel="Виден всем авторизованным"
            accessibilityHint="Определяет, кто может просматривать альбом и его фотографии"
            trackColor={{ false: "#D6D9CF", true: COLORS.primary }}
            ios_backgroundColor="#D6D9CF"
          />
        </View>
      </View>
      <View style={s.visibilityDivider} />
      <Text style={s.visibilityHint}>
        {visible
          ? "Альбом и фотографии доступны всем авторизованным пользователям GAFUS."
          : "Альбом и фотографии доступны только вам."}
      </Text>
    </View>
    {error ? <Text accessibilityRole="alert" style={s.error}>{galleryError(error)}</Text> : null}
    <View style={s.editorActions}>
      <Button
        label="Сохранить"
        height={52}
        borderRadius={14}
        animatedPress
        loading={busy}
        disabled={busy || !name.trim()}
        onPress={() => void save()}
      />
      <Button
        label="Отмена"
        variant="secondary"
        height={52}
        borderRadius={14}
        animatedPress
        disabled={busy}
        accessibilityHint="Закрыть форму без сохранения изменений"
        onPress={cancel}
      />
    </View>
  </EditorShell>;
}
export function GalleryPreview({ owner, showHeadingIcon = false }: { owner: string; showHeadingIcon?: boolean }) {
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
        <View style={s.galleryPreviewTitleRow}>
          {showHeadingIcon ? (
            <Image
              source={require("../../../assets/images/tab-icons/albums.webp")}
              style={s.galleryPreviewTitleIcon}
              contentFit="contain"
              accessible={false}
            />
          ) : null}
          <Text accessibilityRole="header" style={s.galleryPreviewTitle}>Фотографии</Text>
        </View>
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
    {albums.isPending ? <Loading variant="inline" message="Загрузка альбомов…" /> : null}
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
