import { useScreenDataReady } from "@/shared/lib/telemetry/useScreenDataReady";
import { videoRetryMessage } from "@/shared/lib/media/videoRetryMessage";
import { photoRetryMessage } from "@/shared/lib/media/photoRetryMessage";
import { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FEED_LIMITS, countFeedCharacters, type FeedCommentDto } from "@gafus/types";
import { AppBackButton, Loading, MascotSpinner, TexturedSafeAreaView } from "@/shared/components";
import { COLORS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { feedApi, feedCreateCommentGuarded } from "@/shared/lib/api/feed";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/error-reporting";
import { pickFeedMedia, uploadPickedFeedMedia, checkFeedPickedMedia, releaseFeedPickedMedia, type FeedPickedMedia } from "./uploads";
import { GafusReactionProgress } from "./GafusReactionProgress";
import { useFeedStatus, errorMessage, s, Status, Muted } from "./feedScreenShared";
import { FeedPostCard } from "./FeedPostCard";
import { CommentRow } from "./FeedCommentRow";
type FeedDetailActor = { ownerId: string; epoch: string };

type FeedDetailProps = { id: string; commentId?: string };


/** Each composer is scoped to a verified native principal, auth epoch and post. */
export function FeedDetailScreen(props: FeedDetailProps) {
  const ownerId = useAuthStore(state =>
    state.isAuthenticated && !state.isLoading ? state.user?.id : null,
  );
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const actor: FeedDetailActor | null =
    ownerId && binding?.principalId === ownerId && binding.authEpoch
      ? { ownerId, epoch: binding.authEpoch }
      : null;
  return <ActorFeedDetailScreen
    key={`${actor?.ownerId ?? "guest"}:${actor?.epoch ?? "unverified"}:${props.id}`}
    {...props} actor={actor} />;
}


function ActorFeedDetailScreen({
  id, commentId, actor,
}: FeedDetailProps & {actor: FeedDetailActor|null}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const status = useFeedStatus();
  const userId = useAuthStore(state => state.user?.id);
  const [body, setBody] = useState("");
  const [commentFiles, setCommentFiles] = useState<FeedPickedMedia[]>([]);
  const [commentFileFailures,setCommentFileFailures] = useState<Record<string,string>>({});
  // Keep server-confirmed media IDs for this on-screen draft. Retrying one
  // image never re-transcodes/re-sends already accepted neighbor attachments.
  const confirmedCommentMedia = useRef(new Map<string,string>());
  const [uploadCount, setUploadCount] = useState(0);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyToName, setReplyToName] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const commentsPageFlight = useRef<{
    postId: string;
    ownerId: string | null;
    epoch: string | null;
  } | null>(null);
  const flight = useRef(false);
  const unknown = useRef(false);
  const composerRevision = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const currentActor = () => {
    const state = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    return mounted.current && actor !== null && state.isAuthenticated &&
      !state.isLoading && state.user?.id === actor.ownerId &&
      binding?.principalId === actor.ownerId && binding.authEpoch === actor.epoch;
  };
  const changeBody = (value: string) => {
    composerRevision.current += 1;
    setBody(value);
  };
  const composerRef = useRef<TextInput>(null);
  const client = useQueryClient();
  const post = useQuery({ queryKey: ["feed","post",id,userId], queryFn: () => feedApi.getPost(id), refetchInterval: 90_000, enabled: status.data?.enabled === true });
  const comments = useInfiniteQuery({ queryKey: ["feed","comments",id,userId],
    queryFn: ({ pageParam }) => feedApi.listComments(id, { cursor: pageParam }),
    refetchInterval: query => query.state.data?.pages.some(page =>
      page.items.some(item => item.media?.some(media =>
        ["reserved", "uploaded", "processing"].includes(media.status)))) ? 5000 : false,
    initialPageParam: null as string | null, getNextPageParam: page => page.nextCursor,
    enabled: status.data?.enabled === true });
  const currentCommentsReader = () => {
    const state = useAuthStore.getState();
    const verified = newOnlyV2NativeQueues.getVerifiedBinding();
    const activeOwner = state.isAuthenticated && !state.isLoading ? state.user?.id : null;
    const activeEpoch = activeOwner && verified?.principalId === activeOwner
      ? verified.authEpoch : null;
    return mounted.current && (actor?.ownerId ?? null) ===
      (activeEpoch ? activeOwner : null) && (actor?.epoch ?? null) === activeEpoch;
  };
  const nextCommentsPage = () => {
    if (!currentCommentsReader() || !comments.hasNextPage || comments.isFetchingNextPage ||
      commentsPageFlight.current ||
      (comments.isError && !comments.isFetchNextPageError)) return;
    const pending = { postId: id, ownerId: actor?.ownerId ?? null, epoch: actor?.epoch ?? null };
    commentsPageFlight.current = pending;
    void comments.fetchNextPage().then(
      () => { if (commentsPageFlight.current === pending) commentsPageFlight.current = null; },
      () => { if (commentsPageFlight.current === pending) commentsPageFlight.current = null; },
    );
  };
  const focused = useQuery({ queryKey: ["feed", "comment", commentId, userId], queryFn: () => feedApi.getComment(commentId!), enabled: !!commentId && status.data?.enabled === true, retry: false });
  useScreenDataReady("SCREEN_FEED_DETAIL_DATA_READY",
    currentActor() && status.data?.enabled === true && !status.isError &&
      !post.isPending && !post.isError && !!post.data &&
      !comments.isPending && (!comments.isError || comments.isFetchNextPageError) &&
      !!comments.data?.pages[0] &&
      (!commentId || (!focused.isPending && !focused.isError && focused.data?.postId === id)),
    JSON.stringify([id, commentId, userId, actor?.epoch]));
  const scroll = useRef<ScrollView>(null);
  const focusedY = useRef(0);
  useEffect(() => {
    if (focused.data?.postId === id) scroll.current?.scrollTo({ y: focusedY.current, animated: true });
  }, [focused.data, id]);
  const startReply = (item: FeedCommentDto) => {
    if (!currentActor() || item.postId !== id || item.deleted) return;
    composerRevision.current += 1;
    setReplyTo(item.id);
    setReplyToName(item.author.name);
    composerRef.current?.focus();
  };
  const cancelReply = () => {
    composerRevision.current += 1;
    setReplyTo(null);
    setReplyToName("");
  };
  const attachMedia = async (source: "camera-photo" | "camera-video" | "library") => {
    if (!currentActor() || busy || flight.current) return;
    let picked: FeedPickedMedia[] = [];
    try {
      picked = await pickFeedMedia(source);
      if (!currentActor()) return;
      if (!picked.length) return;
      const next = [...commentFiles, ...picked];
      checkFeedPickedMedia(next);
      composerRevision.current += 1;
      setCommentFiles(next);
      picked = []; // Retain prepared copies for this comment until sent/removed.
    } catch (error) { reportClientError(error, {issueKey:"FeedCommentAttachment",keys:{operation:"pick"},severity:"warning"});
      if (currentActor()) Alert.alert("Вложения", errorMessage(error));
    } finally {
      for (const file of picked) releaseFeedPickedMedia(file);
    }
  };
  const retryCommentPhoto = async(requestId:string)=>{
    if(flight.current||busy||unknown.current||!currentActor())return;
    const selected=commentFiles.find(file=>file.requestId===requestId&&file.kind==="photo");
    if(!selected||!commentFileFailures[requestId])return;
    flight.current=true;
    setBusy(true);
    setCommentFileFailures(prev=>{const next={...prev};delete next[requestId];return next;});
    try{
      const mediaId=await uploadPickedFeedMedia(id,selected,undefined,"comment");
      confirmedCommentMedia.current.set(requestId,mediaId);
    }catch(cause){ reportClientError(cause, {issueKey:"FeedCommentPhoto",keys:{operation:"retry"},severity:"warning"});
      if(currentActor())setCommentFileFailures(prev=>({...prev,[requestId]:photoRetryMessage(cause)}));
    }finally{
      flight.current=false;
      if(currentActor())setBusy(false);
    }
  };
  const send = async () => {
    const text = body.trim();
    if (!currentActor() || status.data?.enabled !== true || flight.current || unknown.current ||
        Object.keys(commentFileFailures).length>0 ||
        (!text && !commentFiles.length) ||
        countFeedCharacters(text) > FEED_LIMITS.commentCharacters) return;
    const submissionRevision = composerRevision.current;
    const selectedFiles = [...commentFiles];
    const replyToId = replyTo;
    const clientRequestId = Crypto.randomUUID();
    flight.current = true;
    setBusy(true);
    let commentPostAttempted=false;
    try {
      const mediaIds: string[] = [];
      for (let index = 0; index < selectedFiles.length; index++) {
        if (!currentActor()) return;
        setUploadCount(index);
        const file=selectedFiles[index]!;
        let mediaId=confirmedCommentMedia.current.get(file.requestId);
        if(!mediaId){
          try{
            mediaId=await uploadPickedFeedMedia(id,file,undefined,"comment");
            confirmedCommentMedia.current.set(file.requestId,mediaId);
            setCommentFileFailures(previous=>{
              const next={...previous};delete next[file.requestId];return next;
            });
          }catch(cause){
            if(currentActor())setCommentFileFailures(previous=>({...previous,
              [file.requestId]:file.kind==="photo"?photoRetryMessage(cause):videoRetryMessage(cause),
            }));
            throw cause;
          }
        }
        mediaIds.push(mediaId);
      }
      if (!currentActor()) return;
      commentPostAttempted=true;
      const ack = await feedCreateCommentGuarded(id,
        { text: body, replyToId, clientRequestId, ...(mediaIds.length ? { mediaIds } : {}) },
        currentActor);
      if (!currentActor()) return;
      if (!ack || typeof ack.id !== "string" || !ack.id.trim() ||
          ack.postId !== id || ack.author?.id !== actor?.ownerId ||
          ack.deleted || ack.replyToId !== replyToId || ack.text !== text) {
        throw new Error("FEED_CREATE_COMMENT_ACK_MISMATCH");
      }
      if (composerRevision.current === submissionRevision) {
        composerRevision.current += 1;
        setBody("");
        setCommentFiles([]);
        confirmedCommentMedia.current.clear();
        setCommentFileFailures({});
        for (const file of selectedFiles) releaseFeedPickedMedia(file);
        setUploadCount(0);
        setReplyTo(null);
        setReplyToName("");
      }
      try {
        await client.invalidateQueries({ queryKey: ["feed"] });
      } catch {
        if (currentActor()) reportClientError(new Error("FEED_CREATE_COMMENT_CACHE_FAILURE"), {
          issueKey: "FeedDetailComment", keys: { operation: "create_comment_cache" },
        });
      }
    } catch {
      if (!currentActor()) return;
      if(!commentPostAttempted){
        // A device WebP/S3 error has not sent the comment. Keep all original
        // files and confirmed photo IDs, allow the failed tile to retry.
        return;
      }
      unknown.current = true;
      reportClientError(new Error("FEED_CREATE_COMMENT_RESULT_UNCONFIRMED"), {
        issueKey: "FeedDetailComment", keys: { operation: "create_comment" },
      });
      Alert.alert("Комментарий", "Результат отправки комментария неизвестен. Проверьте публикацию перед повторной попыткой.");
    } finally {
      flight.current = false;
      if (currentActor()) setBusy(false);
    }
  };
  const sendDisabled = busy || flight.current || unknown.current ||
    Object.keys(commentFileFailures).length>0 || !currentActor() ||
    (!body.trim() && !commentFiles.length) ||
    countFeedCharacters(body) > FEED_LIMITS.commentCharacters;
  return <TexturedSafeAreaView style={s.screen} edges={["top","left","right"]}>
    <KeyboardAvoidingView style={s.screen} behavior="padding">
      <View style={s.detailHeader}>
        <AppBackButton onPress={() => router.back()} />
        <Text style={s.detailHeading}>Публикация</Text>
      </View>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        contentContainerStyle={s.detailContent}>
        {status.data?.enabled !== true ? <Status status={status} /> : <>
          {post.isPending && <Loading variant="inline" message="Загрузка публикации…" />}
          {post.isError && <Text style={s.error}>{errorMessage(post.error)}</Text>}
          {post.data && <FeedPostCard post={post.data} detailed />}
          {post.data?.canDelete && <GafusReactionProgress postId={post.data.id} />}
          <View style={s.commentsBlock} onLayout={event => {
            focusedY.current = event.nativeEvent.layout.y;
            if (focused.data?.postId === id) scroll.current?.scrollTo({ y: focusedY.current, animated: true });
          }}>
            <Text style={s.commentsHeading}>Комментарии{post.data ? ` · ${post.data.commentCount}` : ""}</Text>
            {commentId && <View accessibilityLabel="Комментарий из уведомления" style={s.focusedComment}>
              {focused.isPending && <Loading variant="inline" message="Загрузка комментария…" />}
              {(focused.isError || (focused.data && focused.data.postId !== id)) && <Muted>Комментарий недоступен.</Muted>}
              {focused.data?.postId === id && <CommentRow item={focused.data} postId={id} onReply={startReply} />}
            </View>}
            {comments.isPending && <Loading variant="inline" message="Загрузка комментариев…" />}
            {comments.isError && !comments.isFetchNextPageError && <>
              <Text style={s.error}>{errorMessage(comments.error)}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Повторить загрузку комментариев"
                style={s.moreComments} onPress={() => void comments.refetch()}>
                <Text style={s.more}>Повторить загрузку комментариев</Text>
              </Pressable>
            </>}
            {comments.data?.pages.flatMap(page => page.items)
              .filter(item => item.id !== (focused.data?.postId === id ? commentId : null))
              .map(item => <CommentRow key={item.id} item={item} postId={id} onReply={startReply} />)}
            {comments.isFetchNextPageError && <Text accessibilityRole="alert" style={s.error}>
              Не удалось загрузить следующую страницу комментариев.{" "}
              Уже показанные комментарии доступны.
            </Text>}
            {comments.hasNextPage && <Pressable accessibilityRole="button" style={s.moreComments}
              accessibilityLabel={comments.isFetchNextPageError
                ? "Повторить страницу комментариев" : "Показать ещё комментарии"}
              disabled={comments.isFetchingNextPage} onPress={nextCommentsPage}>
              <Text style={s.more}>{comments.isFetchingNextPage ? "Загрузка…"
                : comments.isFetchNextPageError ? "Повторить страницу комментариев"
                  : "Показать ещё комментарии"}</Text>
            </Pressable>}
            {comments.isFetchingNextPage && <MascotSpinner />}
            {!comments.isPending && !comments.isError && !comments.data?.pages.flatMap(page => page.items).length && !focused.data &&
              <Muted>Пока нет комментариев. Напишите первым.</Muted>}
          </View>
        </>}
      </ScrollView>
      {status.data?.enabled === true && <View style={[s.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {commentFiles.length > 0 && <ScrollView horizontal keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 90 }} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
          {commentFiles.map((file, index) => <View key={file.requestId}
            style={{ width: 80, height: 80, borderRadius: 10, overflow: "hidden",
              backgroundColor: COLORS.background, justifyContent: "center" }}>
            {file.kind === "photo"
              ? <Image source={{ uri: file.uri }} style={{ width: 80, height: 80 }} />
              : <MaterialCommunityIcons name="video" size={32} color={COLORS.primary}
                  style={{ alignSelf: "center" }} />}
            {file.kind === "photo" && commentFileFailures[file.requestId] &&
              <Pressable accessibilityRole="button"
                accessibilityLabel={`Повторить обработку фото ${file.filename}`}
                disabled={busy} onPress={()=>void retryCommentPhoto(file.requestId)}
                style={{position:"absolute",left:14,top:14,width:50,height:50,
                  borderRadius:25,backgroundColor:"#17211def",borderWidth:1,
                  borderColor:"#ffffffcc",alignItems:"center",justifyContent:"center"}}>
                <MaterialCommunityIcons name="refresh" size={29} color="#fff"/>
              </Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel={"Убрать вложение " + (index + 1)}
              disabled={busy} onPress={() => {
                composerRevision.current += 1;
                confirmedCommentMedia.current.delete(file.requestId);
                setCommentFileFailures(previous=>{
                  const next={...previous};delete next[file.requestId];return next;
                });
                setCommentFiles(list => {
                  for (const item of list) if (item.requestId === file.requestId) releaseFeedPickedMedia(item);
                  return list.filter(item => item.requestId !== file.requestId);
                });
              }} style={{ position: "absolute", right: 0, top: 0, backgroundColor: "#242424AA",
                borderRadius: 12, padding: 2 }}>
              <MaterialCommunityIcons name="close" size={15} color="#fff" />
            </Pressable>
          </View>)}
        </ScrollView>}
        {commentFiles.some(file=>commentFileFailures[file.requestId]) &&
          <Text accessibilityRole="alert" style={{color:"#923b22",fontSize:12,lineHeight:18,
            marginBottom:6}}>
            {commentFiles.filter(file=>commentFileFailures[file.requestId]).map(file=>
              `${file.filename}: ${commentFileFailures[file.requestId]}`).join(" ")}
          </Text>}
        {busy && commentFiles.length > 0 && <Text accessibilityRole="text"
          style={s.composerLimit}>Загружаем вложения: {Math.min(uploadCount + 1, commentFiles.length)}/{commentFiles.length}</Text>}
        {replyTo && <View style={s.replyBanner}>
          <MaterialCommunityIcons name="reply" size={16} color={COLORS.primary} />
          <Text numberOfLines={1} style={s.replyBannerText}>Ответ для {replyToName}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Отменить ответ"
            style={s.replyCancel} onPress={cancelReply}>
            <MaterialCommunityIcons name="close" size={18} color={COLORS.textSecondary} />
          </Pressable>
        </View>}
        <View style={s.composerRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Прикрепить фото или видео"
            disabled={busy} onPress={() => Alert.alert("Прикрепить медиа",
              "Выберите источник фото или видео", [
                { text: "Галерея", onPress: () => void attachMedia("library") },
                { text: "Сделать фото", onPress: () => void attachMedia("camera-photo") },
                { text: "Снять видео", onPress: () => void attachMedia("camera-video") },
                { text: "Отмена", style: "cancel" },
              ])}
            style={{ padding: 8 }}>
            <MaterialCommunityIcons name="paperclip" size={24} color={COLORS.primary} />
          </Pressable>
          <TextInput ref={composerRef} value={body} onChangeText={changeBody}
            multiline textAlignVertical="center" style={s.composerInput}
            accessibilityLabel="Написать комментарий"
            placeholder={replyTo ? "Написать ответ…" : "Комментарий…"}
            placeholderTextColor={COLORS.textSecondary} />
          <Pressable accessibilityRole="button"
            accessibilityLabel={busy ? "Отправка…" : "Отправить комментарий"}
            accessibilityState={{ disabled: sendDisabled }}
            style={[s.composerSend, sendDisabled && s.composerSendDisabled]}
            disabled={sendDisabled}
            onPress={() => void send()}>
            <MaterialCommunityIcons name="arrow-up" size={22} color="#fff" />
          </Pressable>
        </View>
        {countFeedCharacters(body) > FEED_LIMITS.commentCharacters &&
          <Text style={s.composerLimit}>Максимум {FEED_LIMITS.commentCharacters} символов</Text>}
      </View>}
    </KeyboardAvoidingView>
  </TexturedSafeAreaView>;
}
