import { mobileFeedPublications } from "./publication";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import * as Crypto from "expo-crypto";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FEED_LIMITS, countFeedCharacters, validateFeedPollDraft, type FeedMediaDto } from "@gafus/types";
import { AppBackButton, Loading, TexturedSafeAreaView } from "@/shared/components";
import { COLORS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { Button } from "@/shared/components";
import { feedApi, feedSaveRevisionGuarded, feedPublishPostGuarded } from "@/shared/lib/api/feed";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/error-reporting";
import { pickFeedMedia, pickFeedPollOptionPhoto, uploadPickedFeedMedia, checkFeedPickedMedia, releaseFeedPickedMedia, feedAssetForPublication, type FeedPickedMedia } from "./uploads";
import { FeedAlbumPicker } from "./FeedAlbumPicker";
import { FeedDraftDeleteButton } from "./FeedDraftDeleteButton";
import { FeedPollComposer, type MobileFeedPollDraft } from "./FeedPollComposer";
import { SortableMediaStrip } from "./SortableMediaStrip";
import { composeToolIconUri } from "./composeToolIconData";
import { useFeedStatus, errorMessage, s, Status } from "./feedScreenShared";
type FeedEditorActor = { ownerId:string; epoch:string; editId:string };


/** Key edit-only composer lifetime to verified native actor+epoch; new-post queue unchanged. */
export function FeedComposeScreen() {
  const {edit}=useLocalSearchParams<{edit?:string|string[]}>();
  const editId=typeof edit==="string" && /^[A-Za-z0-9_-]{1,128}$/.test(edit)?edit:undefined;
  const ownerId=useAuthStore(state=>state.isAuthenticated && !state.isLoading?state.user?.id:null);
  const binding=newOnlyV2NativeQueues.getVerifiedBinding();
  const actor:FeedEditorActor|null=editId && ownerId &&
    binding?.principalId===ownerId && binding.authEpoch
    ? {ownerId,epoch:binding.authEpoch,editId}:null;
  return <ActorFeedComposeScreen
    key={editId ? `${editId}:${actor?.ownerId??"guest"}:${actor?.epoch??"unverified"}` : "new-post"}
    editActor={actor} />;
}


function ActorFeedComposeScreen({editActor}:{editActor:FeedEditorActor|null}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { edit } = useLocalSearchParams<{ edit?: string | string[] }>();
  const editId = typeof edit === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(edit) ? edit : undefined;
  const isEditing = !!editId;
  const userId = useAuthStore(state => state.user?.id);
  const cache = useQueryClient();
  const status = useFeedStatus();
  const original = useQuery({
    queryKey: ["feed", "editor", editId, userId],
    queryFn: () => feedApi.getEditor(editId!),
    enabled: !!editId && status.data?.enabled === true,
    retry: 1,
  });
  // Historical links into an already accepted, processing publication should
  // return to the feed's existing progress widget, not reopen a dead editor.
  // Published posts stay editable through their explicit edit action.
  useEffect(() => {
    if (!editId || !editActor || !original.data ||
        original.data.id !== editId || original.data.author.id !== editActor.ownerId ||
        original.data.status !== "pending") return;
    router.replace("/(main)/(tabs)/feed" as Href);
  }, [editId, editActor?.ownerId, original.data?.id, original.data?.author.id,
    original.data?.status, router.replace]);
  const [text, setText] = useState("");
  const [poll, setPoll] = useState<MobileFeedPollDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const editMounted=useRef(true);
  const editFlight=useRef(false);
  const editUnknown=useRef(false);
  const editAcknowledged=useRef(false);
  useEffect(()=>{
    editMounted.current=true;
    return ()=>{editMounted.current=false;};
  },[]);
  const currentEditActor=()=>{
    const state=useAuthStore.getState();
    const binding=newOnlyV2NativeQueues.getVerifiedBinding();
    return editMounted.current && isEditing && editId !== undefined && editActor !== null &&
      editActor.editId===editId && state.isAuthenticated && !state.isLoading &&
      state.user?.id===editActor.ownerId &&
      binding?.principalId===editActor.ownerId && binding.authEpoch===editActor.epoch &&
      original.data?.id===editId && original.data?.author.id===editActor.ownerId &&
      original.data?.canEdit===true;
  };
  const [progress, setProgress] = useState("");
  const [picked, setPicked] = useState<FeedPickedMedia[]>([]);
  const [albumPhotoIds, setAlbumPhotoIds] = useState<string[]>([]);
  const [albumsOpen, setAlbumsOpen] = useState(false);
  const [existingMediaIds, setExistingMediaIds] = useState<string[]>([]);
  const hydratedEditor = useRef<string | null>(null);
  const copied = useRef(new Map<string, { requestId: string; mediaId?: string }>());
  const draft = useRef<string | null>(null);
  const completed = useRef(new Map<string, string>());
  useEffect(() => {
    if (!editId || !original.data || hydratedEditor.current === editId) return;
    hydratedEditor.current = editId;
    setText(original.data.pendingRevision?.text ?? original.data.text);
    setExistingMediaIds(original.data.pendingRevision?.attachmentIds ??
      original.data.attachments.map(asset => asset.id));
    draft.current = editId;
  }, [editId, original.data]);
  const existingMedia = (original.data?.attachments ?? [])
    .filter(asset => existingMediaIds.includes(asset.id))
    .sort((a, b) => existingMediaIds.indexOf(a.id) - existingMediaIds.indexOf(b.id));
  const attachedCount = existingMediaIds.length + picked.length + albumPhotoIds.length;
  const existingVideoCount = existingMedia.filter(asset => asset.kind === "video").length;
  const canSubmit = (!isEditing || (!!original.data && original.data.canEdit)) &&
    (Boolean(text.trim()) || attachedCount > 0 || !!poll) &&
    countFeedCharacters(text) <= FEED_LIMITS.postCharacters;
  const pick = async (source: "library" | "camera-photo" | "camera-video") => {
    let assets: FeedPickedMedia[] = [];
    try {
      assets = await pickFeedMedia(source);
      const next = [...picked, ...assets];
      checkFeedPickedMedia(next);
      if (next.length + albumPhotoIds.length + existingMediaIds.length > FEED_LIMITS.maxAttachments) {
        throw new Error("Максимум 10 вложений.");
      }
      if (existingVideoCount + next.filter(item => item.kind === "video").length > FEED_LIMITS.maxVideos) {
        throw new Error("Максимум три видео.");
      }
      setPicked(next);
      assets = []; // Ownership moved into composer state (or the background publication manager).
    } catch (error) {
      for (const asset of assets) releaseFeedPickedMedia(asset);
      Alert.alert("Не удалось выбрать файл", errorMessage(error));
    }
  };
  const move = (index: number, destination: number) => {
    setPicked(items => {
      if (index === destination || index < 0 || index >= items.length ||
          destination < 0 || destination >= items.length) return items;
      const next = [...items];
      const [item] = next.splice(index, 1);
      if (!item) return items;
      next.splice(destination, 0, item);
      return next;
    });
  };
  const moveExisting = (index: number, destination: number) => {
    setExistingMediaIds(items => {
      if (index === destination || index < 0 || index >= items.length ||
          destination < 0 || destination >= items.length) return items;
      const next = [...items];
      const [item] = next.splice(index, 1);
      if (!item) return items;
      next.splice(destination, 0, item);
      return next;
    });
  };
  const choosePollImage = async (index: number) => {
    try {
      const photo = await pickFeedPollOptionPhoto();
      if (!photo) return;
      setPoll(current => {
        if (!current) { releaseFeedPickedMedia(photo); return current; }
        const previous = current.options[index]?.imageAsset;
        if (previous) releaseFeedPickedMedia(previous);
        return { ...current, options: current.options.map((option, i) =>
          i === index ? { ...option, imageAsset: photo } : option) };
      });
    } catch (error) { Alert.alert("Не удалось выбрать фото", errorMessage(error)); }
  };
  const removePollImage = (index: number) => {
    setPoll(current => {
      if (!current) return current;
      const previous = current.options[index]?.imageAsset;
      if (previous) releaseFeedPickedMedia(previous);
      return { ...current, options: current.options.map((option, i) =>
        i === index ? { ...option, imageAsset: undefined } : option) };
    });
  };
  const submit = async () => {
    if (!canSubmit || busy || (isEditing && original.isPending) ||
        (isEditing && (!currentEditActor() || editFlight.current ||
          editUnknown.current || editAcknowledged.current))) return;
    if (poll) {
      const issue = validateFeedPollDraft(poll);
      if (issue) { Alert.alert("Проверьте опрос", issue); return; }
      const count = poll.options.filter(option => option.imageAsset).length;
      if (count + picked.length + existingMediaIds.length + albumPhotoIds.length > FEED_LIMITS.maxAttachments) {
        Alert.alert("Слишком много фото", "Всего можно добавить максимум 10 вложений, включая варианты опроса.");
        return;
      }
    }
    if (isEditing) editFlight.current=true;
    setBusy(true);
    if (!isEditing) {
      try {
        mobileFeedPublications.enqueue({
          ownerId: userId!, text,
          // Keep the original mutable media object: native HEVC→H.264
          // preparation updates it asynchronously. A spread copy retains
          // the 22 MB HEVC URI/size and breaks the signed S3 reservation.
          files: picked.map(feedAssetForPublication),
          albumPhotoIds,
          ...(poll ? {
            poll: { ...poll, options: poll.options.map(({ imageAsset: _imageAsset, ...option }) => option) },
            pollOptionImages: poll.options.flatMap((option, optionIndex) =>
              option.imageAsset ? [{ optionIndex, asset: {
                ...option.imageAsset, previewUri: option.imageAsset.uri,
              } }] : []),
          } : {}),
        });
        router.replace("/(main)/(tabs)/feed" as Href);
      } catch (error) {
        Alert.alert("Не удалось опубликовать", errorMessage(error));
        setBusy(false);
      }
      return;
    }
    try {
      // New posts already return through the existing offline enqueue branch above.
      // Never create another post when editing an existing post.
      if (!currentEditActor() || !editId || draft.current !== editId) return;
      const created = await feedApi.getEditor(editId);
      if (!currentEditActor()) return;
      if (created.id !== editId || created.author.id !== editActor?.ownerId ||
          !created.canEdit || !Number.isSafeInteger(created.version) || created.version < 1)
        throw new Error("FEED_EDIT_EDITOR_IDENTITY_UNCONFIRMED");
      const attachmentIds: string[] = [...existingMediaIds];
      for (const [index, asset] of picked.entries()) {
        if (!currentEditActor()) return;
        setProgress(`Загружаем ${index + 1} из ${picked.length}…`);
        let id = completed.current.get(asset.requestId);
        if (!id) {
          id = await uploadPickedFeedMedia(created.id, asset);
          if (!currentEditActor()) return;
          completed.current.set(asset.requestId, id);
        }
        attachmentIds.push(id);
      }
      for (const photoId of albumPhotoIds) {
        if (!currentEditActor()) return;
        setProgress("Копируем фотографию из альбома…");
        const previous = copied.current.get(photoId) ?? { requestId: Crypto.randomUUID() };
        copied.current.set(photoId, previous);
        if (!previous.mediaId) {
          const result = await feedApi.copyAlbumPhoto(created.id, {
            photoId, clientRequestId: previous.requestId,
          });
          if (!currentEditActor()) return;
          previous.mediaId = result.id;
        }
        attachmentIds.push(previous.mediaId);
      }
      if (!currentEditActor()) return;
      setProgress("Сохраняем публикацию…");
      const saved = await feedSaveRevisionGuarded(editId, {
        clientRequestId: Crypto.randomUUID(), expectedVersion: created.version,
        text, attachmentIds,
      }, currentEditActor);
      if (!currentEditActor()) return;
      const revision = saved?.pendingRevision;
      if (!saved || saved.id !== editId || saved.author.id !== editActor?.ownerId ||
          saved.version !== created.version + 1 || !revision ||
          revision.status !== "draft" || revision.text !== text.trim() ||
          revision.attachmentIds.length !== attachmentIds.length ||
          revision.attachmentIds.some((id, index) => id !== attachmentIds[index]))
        throw new Error("FEED_EDIT_REVISION_ACK_MISMATCH");
      const published = await feedPublishPostGuarded(editId, {
        clientRequestId: Crypto.randomUUID(),
      }, currentEditActor);
      if (!currentEditActor()) return;
      if (!published || published.id !== editId || published.author.id !== editActor?.ownerId ||
          published.version !== saved.version ||
          (published.status !== "pending" && published.status !== "published") ||
          (published.pendingRevision !== null &&
            published.pendingRevision?.status !== "pending"))
        throw new Error("FEED_EDIT_PUBLISH_ACK_MISMATCH");
      // Same as Web: an accepted revision returns straight to Moments.
      // The feed shows server-owned progress; the post is NOT declared ready.
      editAcknowledged.current = true;
      if (currentEditActor()) {
        for (const asset of picked) releaseFeedPickedMedia(asset);
        for (const option of poll?.options ?? []) {
          if (option.imageAsset) releaseFeedPickedMedia(option.imageAsset);
        }
        router.replace("/(main)/(tabs)/feed" as Href);
        void cache.invalidateQueries({ queryKey: ["feed"] }).catch(() => {
          reportClientError(new Error("FEED_EDIT_CACHE_REFRESH_FAILED"), {
            issueKey: "FeedComposeEdit", keys: { operation: "edit_cache" },
          });
        });
      }
    } catch {
      if (!currentEditActor()) return;
      editUnknown.current = true;
      reportClientError(new Error("FEED_EDIT_RESULT_UNCONFIRMED"), {
        issueKey: "FeedComposeEdit", keys: { operation: "edit_revision_publish" },
      });
      Alert.alert("Моменты", "Результат редактирования публикации неизвестен. Проверьте публикацию перед повторной попыткой.");
    } finally {
      editFlight.current = false;
      if (currentEditActor()) { setBusy(false); setProgress(""); }
    }
  };
  return <TexturedSafeAreaView style={s.screen} edges={["left","right"]}>
    <StatusBar style="dark" />
    <Stack.Screen options={{ headerShown: false }} />
    <View style={[s.composeTopBar, { paddingTop: insets.top + 8 }]}>
      <AppBackButton onPress={() => router.back()} />
      <Text accessibilityRole="header" numberOfLines={1} style={s.composeTopTitle}>
        {isEditing ? "Редактирование публикации" : "Новая публикация"}
      </Text>
    </View>
    <ScrollView
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={s.composeContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
      {status.isPending ? <Loading variant="inline" message="Проверяем доступность «Моментов»…" /> :
        status.data?.enabled ? isEditing && original.isPending ? <Loading variant="inline" message="Загружаем публикацию…" />
        : isEditing && (original.isError || !original.data?.canEdit)
          ? <View style={s.card}>
              <Text style={s.error}>{original.isError ? errorMessage(original.error) : "Редактирование этой публикации недоступно."}</Text>
              <AppBackButton onPress={() => router.back()} />
            </View>
        : <>
        <View style={s.composeEditor}>
          <TextInput value={text} onChangeText={setText} multiline textAlignVertical="top"
            placeholder="Расскажите о своём питомце…" placeholderTextColor={COLORS.textSecondary}
            style={s.composeInput} maxLength={10_000} />
          <Text style={[s.composeCounter, countFeedCharacters(text) > FEED_LIMITS.postCharacters && s.error]}>
            {countFeedCharacters(text)} / {FEED_LIMITS.postCharacters}
          </Text>
        </View>
        {isEditing && existingMediaIds.length > 0 && <View style={s.composeAttachments}>
          <Text style={s.composeAttachmentsTitle}>Вложения публикации · {existingMediaIds.length}</Text>
          <SortableMediaStrip
            items={existingMediaIds.map(id => {
              const asset: FeedMediaDto | undefined = original.data?.attachments.find(item => item.id === id);
              return { id, kind: asset?.kind === "video" ? "video" : "photo", uri: asset?.thumbUrl ?? asset?.posterUrl ?? asset?.fullUrl };
            })}
            onMove={moveExisting}
            onRemove={id => setExistingMediaIds(items => items.filter(value => value !== id))}
            disabled={busy}
          />
          {existingMediaIds.length > 1 && <Text style={s.composeReorderHint}>Удерживайте фотографию и перетаскивайте</Text>}
        </View>}
        <View style={s.composeTools}>
          {([
            ["library", "Галерея"],
            ["camera-photo", "Фото"],
            ["camera-video", "Видео"],
          ] as const).map(([source, label]) => (
            <Pressable key={source} accessibilityRole="button" accessibilityLabel={label}
              disabled={busy} onPress={() => void pick(source)}
              style={({ pressed }) => [s.composeTool, (pressed || busy) && s.composeToolPressed]}>
              <Image source={{ uri: composeToolIconUri[source] }} style={s.composeToolIcon} contentFit="contain" />
              <Text style={s.composeToolText}>{label}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel="Фотографии из альбомов"
            accessibilityState={{ expanded: albumsOpen }} disabled={busy}
            onPress={() => setAlbumsOpen(open => !open)}
            style={({ pressed }) => [s.composeTool, albumsOpen && s.composeToolSelected, (pressed || busy) && s.composeToolPressed]}>
            <Image source={{ uri: composeToolIconUri.album }} style={s.composeToolIcon} contentFit="contain" />
            <Text style={s.composeToolText}>Альбомы</Text>
            {albumPhotoIds.length > 0 && <View style={s.composeToolDot} />}
          </Pressable>
        </View>
        {picked.length > 0 && <View style={s.composeAttachments}>
          <Text style={s.composeAttachmentsTitle}>С устройства · {picked.length}</Text>
          <SortableMediaStrip
            items={picked.map(asset => ({ id: asset.requestId, kind: asset.kind,
              uri: asset.previewUri ?? (asset.kind === "photo" ? asset.uri : null) }))}
            onMove={move}
            onRemove={id => setPicked(items => {
              for (const item of items) if (item.requestId === id) releaseFeedPickedMedia(item);
              return items.filter(item => item.requestId !== id);
            })}
            disabled={busy}
          />
          {picked.length > 1 && <Text style={s.composeReorderHint}>Удерживайте фотографию и перетаскивайте</Text>}
        </View>}
        {albumPhotoIds.length > 0 && !albumsOpen &&
          <Text style={s.composeAlbumCount}>Из альбомов: {albumPhotoIds.length} фото</Text>}
        {albumsOpen && <FeedAlbumPicker selected={albumPhotoIds} disabled={busy} onChange={ids => {
          if (ids.length + picked.length + existingMediaIds.length > FEED_LIMITS.maxAttachments) {
            Alert.alert("Слишком много вложений", "Максимум 10 вложений."); return;
          }
          setAlbumPhotoIds(ids);
        }} />}
        {!isEditing && status.data?.enabled && <FeedPollComposer value={poll} onChange={setPoll} disabled={busy}
          onPickImage={index => void choosePollImage(index)} onRemoveImage={removePollImage} />}
        {isEditing && original.data?.hasPoll && <Text style={s.composeAlbumCount}>
          Опрос остаётся без изменений. После публикации варианты нельзя редактировать.
        </Text>}
        {progress ? <Text accessibilityRole="alert" style={s.composeAlbumCount}>{progress}</Text> : null}
        <Button label={busy ? (isEditing ? "Сохраняем…" : "Публикуем…") : isEditing ? "Сохранить изменения" : "Опубликовать"} variant="primary"
          height={46} fontSize={15} lineHeight={20} borderRadius={14} animatedPress
          disabled={busy || !canSubmit ||
            (isEditing && (!currentEditActor() || editFlight.current ||
              editUnknown.current || editAcknowledged.current))}
          onPress={() => void submit()} />
        {isEditing && editActor && editId &&
          (original.data?.status === "draft" || original.data?.status === "failed") &&
          <View style={{ alignItems: "center" }}>
            <FeedDraftDeleteButton ownerId={editActor.ownerId} postId={editId}
              onDeleted={() => router.replace("/(main)/(tabs)/feed" as Href)} />
          </View>}
      </> : <Status status={status} />}
    </ScrollView>
  </TexturedSafeAreaView>;
}
