import { publicationPhaseLabel } from "@gafus/core-client/feed/publication-client";
import { mobileFeedPublications } from "./publication";
import { videoRetryMessage, videoServerFailureMessage } from "@/shared/lib/media/videoRetryMessage";
import { photoRetryMessage } from "@/shared/lib/media/photoRetryMessage";
import { mobilePendingRefreshInterval } from "./pendingRefresh";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getFeedUploadedFilesPercent, type FeedPostDto } from "@gafus/types";
import { COLORS } from "@/shared/config";
import { feedApi } from "@/shared/lib/api/feed";
import { FeedPublicationProgress } from "./FeedPublicationProgress";
import { FeedDraftDeleteButton } from "./FeedDraftDeleteButton";
import { getFeedPublicationPercent } from "./publicationProgressState";
import { s, EMPTY_PUBLICATIONS } from "./feedScreenShared";
function RecoveredDraftExcerpt({ post, ownerId }: {
  post: FeedPostDto; ownerId?: string;
}) {
  const details = useQuery({
    queryKey: ["feed", "recovered-draft", ownerId, post.id],
    queryFn: () => feedApi.getEditor(post.id),
    enabled: !!ownerId && post.author?.id === ownerId && post.status !== "pending" && !post.text,
    staleTime: 30_000,
  });
  const recoveredText = details.data?.id === post.id && details.data.author.id === ownerId
    ? details.data.pendingRevision?.text : undefined;
  const text = post.text || recoveredText;
  return <Text style={s.publicationExcerpt} numberOfLines={2}>
    {text || "Не все вложения были загружены. Добавьте файл заново или удалите черновик."}
  </Text>;
}


export function FeedPublicationQueue({ ownerId }: { ownerId?: string }) {
  const router = useRouter();
  const cache = useQueryClient();
  const previousPending = useRef<{ ownerId: string; ids: Set<string> } | null>(null);
  const local = useSyncExternalStore(mobileFeedPublications.subscribe,
    mobileFeedPublications.getSnapshot, () => EMPTY_PUBLICATIONS)
    .filter(item => item.ownerId === ownerId);
  const pending = useQuery({
    queryKey: ["feed", "pending", ownerId],
    queryFn: () => feedApi.listPendingPosts(),
    enabled: !!ownerId,
    refetchInterval: query => mobilePendingRefreshInterval(query.state.data?.items),
  });
  useEffect(() => {
    // Only a fresh, successful owner-scoped server snapshot can tell us that
    // an accepted post has left the processing queue. The feed GET itself
    // remains authoritative for publication/visibility.
    if (!ownerId || !pending.isSuccess || pending.isFetching || !pending.data) return;
    const ids = new Set(pending.data.items
      .filter(post => post.status === "pending").map(post => post.id));
    const previous = previousPending.current;
    previousPending.current = { ownerId, ids };
    if (!previous || previous.ownerId !== ownerId ||
      ![...previous.ids].some(id => !ids.has(id))) return;
    void cache.invalidateQueries({ queryKey: ["feed", "posts", ownerId] });
  }, [cache, ownerId, pending.isSuccess, pending.isFetching, pending.dataUpdatedAt]);
  const recovered = (pending.data?.items ?? [])
    .filter(post => !local.some(item => item.postId === post.id));
  if (!local.length && !recovered.length) return null;
  return <View style={s.publicationQueue} accessibilityLabel="Мои публикации в обработке">
    {local.map(item => <View key={item.id} style={s.publicationCard}>
      <View style={s.publicationMedia}>
        {item.previewUri && <Image source={{ uri: item.previewUri }} style={s.publicationPreview}
          contentFit="cover" />}
        {(item.phase === "uploading" || item.phase === "processing") &&
          <ActivityIndicator size="small" color={COLORS.primary}
            accessibilityLabel="Обрабатываем публикацию" />}
      </View>
      <View style={s.publicationBody} accessibilityLiveRegion="polite">
        <Text style={s.publicationTitle}>{publicationPhaseLabel(item)}</Text>
        {!!item.text && <Text numberOfLines={2} style={s.publicationExcerpt}>{item.text}</Text>}
        {item.phase === "uploading" &&
          getFeedPublicationPercent("uploading", item.progress) !== null &&
          <Text style={s.publicationProgressLabel}>
            Загрузка: {Math.round(getFeedPublicationPercent("uploading", item.progress) ?? 0)}%
          </Text>}
        {(item.phase === "uploading" || item.phase === "processing") && (
          <FeedPublicationProgress phase={item.phase} progress={item.progress} />
        )}
        {item.files?.map(file => <View key={file.requestId} style={{
          flexDirection: "row", gap: 10, alignItems: "center", marginTop: 9,
          padding: 8, backgroundColor: "#eef0e8", borderRadius: 12,
        }}>
          <View style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: "#17211d",
            alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {file.previewUri ? <Image source={{ uri: file.previewUri }}
              style={{ width: 64, height: 64 }} contentFit="cover" /> :
              <MaterialCommunityIcons name={file.kind === "video" ? "video-outline" : "image-outline"}
                size={26} color="#fff" />}
            {(file.kind === "video" || file.kind === "photo") && file.phase === "failed" &&
              <Pressable accessibilityRole="button"
                accessibilityLabel={`Повторить обработку ${file.kind === "photo" ? "фото" : "видео"} ${file.name ?? ""}`}
                onPress={() => mobileFeedPublications.retryFile(item.id, file.requestId)}
                style={{ position: "absolute", width: 50, height: 50, borderRadius: 25,
                  backgroundColor: "#17211de9", borderColor: "#fffb", borderWidth: 1,
                  alignItems: "center", justifyContent: "center" }}>
                <MaterialCommunityIcons name="refresh" size={29} color="#fff" />
              </Pressable>}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "600", color: "#283f2b" }}>
              {file.name ?? (file.kind === "video" ? "Видео" : "Фото")}</Text>
            <Text style={{ fontSize: 12, color: file.phase === "failed" ? "#a23f27" : "#4b5947" }}>
              {file.phase === "failed" ? "Не удалось обработать или отправить" :
                file.phase === "ready" ? "Передано" :
                file.phase === "uploading" ? "Подготовка и отправка…" : "Ожидает отправки"}
            </Text>
            {file.phase === "failed" && <Text accessibilityRole="alert" style={{
              fontSize: 12, color: "#83301e", lineHeight: 17, marginTop: 3 }}>
              {file.kind === "video" ? videoRetryMessage(file.error) : photoRetryMessage(file.error)}
            </Text>}
          </View>
        </View>)}
        {item.phase === "failed" && !item.files?.some(file => file.phase === "failed") &&
          <Text accessibilityRole="alert" style={s.error}>
            {item.files?.some(file => file.kind === "video") ? videoServerFailureMessage :
              "Не удалось завершить обработку вложений. Проверьте состояние черновика."}
            {" "}Откройте черновик для исправления.
          </Text>}
        {item.phase === "failed" && <View style={s.publicationActions}>
          {item.files?.some(file => file.phase === "failed") ?
            <Text style={s.publicationExcerpt}>
              Нажмите круглую стрелку на неудавшемся файле. Уже переданные вложения повторно не отправятся.
            </Text> : item.files?.some(file => file.phase === "waiting") ?
            <Pressable accessibilityRole="button" accessibilityLabel="Продолжить оставшиеся вложения"
              onPress={() => mobileFeedPublications.retry(item.id)}>
              <Text style={s.publicationLink}>Продолжить оставшиеся вложения</Text>
            </Pressable> :
            !!item.postId && <Pressable accessibilityRole="button"
              accessibilityLabel="Открыть черновик для исправления"
              onPress={() => router.push({ pathname: "/(main)/feed/create",
                params: { edit: item.postId! } } as Href)}>
              <Text style={s.publicationLink}>Открыть черновик</Text>
            </Pressable>}
          <FeedDraftDeleteButton ownerId={item.ownerId} postId={item.postId}
            onDeleted={() => mobileFeedPublications.dismiss(item.id)} />
        </View>}
      </View>
    </View>)}
    {recovered.map(post => {
      const uploadedPercent = getFeedUploadedFilesPercent(post.attachments);
      return <View key={post.id} style={s.publicationCard}>
      <MaterialCommunityIcons name={post.status === "pending" ? "clock-outline" : "file-document-edit-outline"}
        size={26} color={COLORS.primary} />
      <View style={s.publicationBody}>
        <Text style={s.publicationTitle}>{post.status === "pending"
          ? "Обрабатываем публикацию…" : post.status === "failed"
            ? "Ошибка обработки" : "Черновик публикации"}</Text>
        {post.status === "failed" && <Text accessibilityRole="alert" style={s.error}>
          {post.attachments.some(media => media.kind === "video") ? videoServerFailureMessage :
            "Сервер не завершил обработку вложений. Откройте черновик для исправления."}
        </Text>}
        {post.status !== "pending" ? <RecoveredDraftExcerpt post={post} ownerId={ownerId} />
          : !!post.text && <Text style={s.publicationExcerpt} numberOfLines={2}>{post.text}</Text>}
        {uploadedPercent !== null && post.status !== "failed" && <>
          <Text style={s.publicationProgressLabel}>Файлы загружены: {uploadedPercent}%</Text>
          <FeedPublicationProgress phase="uploading" progress={uploadedPercent} />
          {post.status === "pending" && <Text style={s.publicationExcerpt}>
            Обработка продолжается. Если видео долго не готово, сервис может быть недоступен.
            Сохраните исходник: повторная проверка не перезапускает обработку.
          </Text>}
        </>}
        {post.status === "pending" && uploadedPercent === null &&
          <FeedPublicationProgress phase="processing" />}
        {post.status !== "pending" && <View style={s.publicationActions}>
          <Pressable accessibilityRole="button"
            accessibilityLabel="Продолжить незавершённую публикацию"
            onPress={() => router.push({ pathname: "/(main)/feed/create", params: { edit: post.id } } as Href)}>
            <Text style={s.publicationLink}>Продолжить редактирование</Text>
          </Pressable>
          {post.author?.id === ownerId && <FeedDraftDeleteButton
            ownerId={post.author.id} postId={post.id}
            onDeleted={() => undefined} />}
        </View>}
      </View>
    </View>;
    })}
  </View>;
}
