import { FeedReportButton } from "./FeedPostActions";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { FEED_LIMITS, countFeedCharacters, formatFeedTime, type FeedCommentDto, type FeedReaction } from "@gafus/types";
import { Loading, MascotSpinner } from "@/shared/components";
import { COLORS } from "@/shared/config";
import { useAuthStore } from "@/shared/stores";
import { feedApi, feedEditCommentGuarded, feedDeleteCommentGuarded, feedCommentReactionGuarded } from "@/shared/lib/api/feed";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/error-reporting";
import { FeedCommentAttachments } from "./FeedMediaViewer";
import { s } from "./feedScreenShared";
import { FeedReactionStrip } from "./FeedReactionStrip";
type CommentRowProps = {
  item: FeedCommentDto;
  postId: string;
  onReply: (item: FeedCommentDto) => void;
};

type CommentActor = { ownerId: string; epoch: string };


/** Card identity resets owner mutation locks whenever the principal/epoch changes. */
export function CommentRow(props: CommentRowProps) {
  const ownerId = useAuthStore(state =>
    state.isAuthenticated && !state.isLoading ? state.user?.id : null,
  );
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const actor: CommentActor | null =
    ownerId && binding?.principalId === ownerId && binding.authEpoch
      ? { ownerId, epoch: binding.authEpoch }
      : null;
  return <ActorCommentRow
    key={`${actor?.ownerId ?? "guest"}:${actor?.epoch ?? "none"}:${props.postId}:${props.item.id}`}
    {...props} actor={actor} />;
}


function ActorCommentRow({
  item, postId, onReply, actor,
}: CommentRowProps & { actor: CommentActor | null }) {
  const router = useRouter();
  const cache = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [busy, setBusy] = useState(false);
  const [confirmedReaction, setConfirmedReaction] =
    useState<FeedReaction | null | undefined>(undefined);
  const reactionFlight = useRef(false);
  const reactionUnknown = useRef(false);
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [deletedLocal, setDeletedLocal] = useState(false);
  const [confirmedText, setConfirmedText] = useState<string | null>(null);
  const [showReplies, setShowReplies] = useState(false);
  const repliesPageFlight = useRef<{
    commentId: string;
    postId: string;
    ownerId: string | null;
    epoch: string | null;
  } | null>(null);
  const mounted = useRef(true);
  const ownerFlight = useRef(false);
  const ownerUnknown = useRef(false);
  const deletedAcknowledged = useRef(false);
  const editAcknowledged = useRef<string | null>(null);
  const menuIssued = useRef(false);
  const confirmationId = useRef<number | null>(null);
  const nextConfirmationId = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; confirmationId.current = null; };
  }, []);
  const currentOwner = () => {
    const state = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    return mounted.current && actor !== null && state.isAuthenticated &&
      !state.isLoading && state.user?.id === actor.ownerId &&
      item.author.id === actor.ownerId && item.postId === postId &&
      binding?.principalId === actor.ownerId && binding.authEpoch === actor.epoch;
  };
  const canManage = currentOwner() && !item.deleted && !deletedAcknowledged.current;
  const currentReactionActor = () => {
    const state = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    return mounted.current && actor !== null && state.isAuthenticated &&
      !state.isLoading && state.user?.id === actor.ownerId &&
      item.postId === postId && !item.deleted && !deletedAcknowledged.current &&
      binding?.principalId === actor.ownerId && binding.authEpoch === actor.epoch;
  };
  const replies = useInfiniteQuery({
    queryKey: ["feed", "replies", item.id],
    queryFn: ({ pageParam }) => feedApi.listReplies(item.id, { cursor: pageParam }),
    refetchInterval: query => showReplies && query.state.data?.pages.some(page =>
      page.items.some(reply => reply.media?.some(media =>
        ["reserved", "uploaded", "processing"].includes(media.status)))) ? 5000 : false,
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor,
    enabled: showReplies && !item.rootId,
  });
  const currentRepliesReader = () => {
    const state = useAuthStore.getState();
    const verified = newOnlyV2NativeQueues.getVerifiedBinding();
    const activeOwner = state.isAuthenticated && !state.isLoading ? state.user?.id : null;
    const activeEpoch = activeOwner && verified?.principalId === activeOwner
      ? verified.authEpoch : null;
    return mounted.current && item.postId === postId &&
      (actor?.ownerId ?? null) === (activeEpoch ? activeOwner : null) &&
      (actor?.epoch ?? null) === activeEpoch;
  };
  const nextRepliesPage = () => {
    if (!currentRepliesReader() || !replies.hasNextPage || replies.isFetchingNextPage ||
      repliesPageFlight.current ||
      (replies.isError && !replies.isFetchNextPageError)) return;
    const flight = {
      commentId: item.id,
      postId,
      ownerId: actor?.ownerId ?? null,
      epoch: actor?.epoch ?? null,
    };
    repliesPageFlight.current = flight;
    void replies.fetchNextPage().then(
      () => { if (repliesPageFlight.current === flight) repliesPageFlight.current = null; },
      () => { if (repliesPageFlight.current === flight) repliesPageFlight.current = null; },
    );
  };
  const runReaction = async (reaction: FeedReaction) => {
    if (reactionFlight.current || reactionUnknown.current || ownerFlight.current ||
        !currentReactionActor()) return;
    const previous = confirmedReaction !== undefined ? confirmedReaction : item.myReaction;
    const next = previous === reaction ? null : reaction;
    reactionFlight.current = true;
    setBusy(true);
    try {
      const ack = await feedCommentReactionGuarded(item.id, next, currentReactionActor);
      if (!currentReactionActor()) return;
      if (!ack || ack.id !== item.id || ack.postId !== postId ||
          ack.deleted || ack.myReaction !== next) throw new Error("FEED_COMMENT_REACTION_ACK_MISMATCH");
      setConfirmedReaction(next);
      try { await cache.invalidateQueries({ queryKey: ["feed"] }); }
      catch { reportClientError(new Error("FEED_COMMENT_REACTION_CACHE_FAILURE"), {
        issueKey: "FeedCommentReaction", keys: { operation: "reaction_cache" },
      }); }
    } catch {
      if (!currentReactionActor()) return;
      reactionUnknown.current = true;
      reportClientError(new Error("FEED_COMMENT_REACTION_UNCONFIRMED"), {
        issueKey: "FeedCommentReaction", keys: { operation: "comment_reaction" },
      });
      Alert.alert("Комментарий", "Результат реакции неизвестен. Проверьте результат перед повторной попыткой.");
    } finally {
      reactionFlight.current = false;
      if (currentReactionActor()) setBusy(false);
    }
  };
  const saveEdit = async () => {
    if (reactionFlight.current) return;
    const text = draft;
    if (!item.canEdit || !canManage || !currentOwner() ||
        ownerFlight.current || ownerUnknown.current || deletedAcknowledged.current ||
        !text.trim() || countFeedCharacters(text) > FEED_LIMITS.commentCharacters ||
        editAcknowledged.current === text) return;
    ownerFlight.current = true;
    setOwnerBusy(true);
    try {
      const ack = await feedEditCommentGuarded(item.id, { text }, currentOwner);
      if (!currentOwner()) return;
      if (!ack || ack.id !== item.id || ack.postId !== postId ||
          ack.author?.id !== actor?.ownerId || ack.deleted || typeof ack.text !== "string")
        throw new Error("FEED_COMMENT_EDIT_ACK_MISMATCH");
      editAcknowledged.current = text;
      setConfirmedText(ack.text);
      setEditing(false);
      try { await cache.invalidateQueries({ queryKey: ["feed"] }); }
      catch { reportClientError(new Error("FEED_COMMENT_EDIT_CACHE_FAILURE"), {
        issueKey: "FeedCommentOwner", keys: { operation: "edit_cache" },
      }); }
    } catch {
      if (!currentOwner()) return;
      ownerUnknown.current = true;
      reportClientError(new Error("FEED_COMMENT_EDIT_RESULT_UNCONFIRMED"), {
        issueKey: "FeedCommentOwner", keys: { operation: "edit_comment" },
      });
      Alert.alert("Комментарий", "Результат изменения комментария неизвестен. Проверьте результат перед повторной попыткой.");
    } finally {
      ownerFlight.current = false;
      if (currentOwner()) setOwnerBusy(false);
    }
  };
  const deleteConfirmed = async () => {
    if (reactionFlight.current || !item.canDelete || !currentOwner() || ownerFlight.current ||
        ownerUnknown.current || deletedAcknowledged.current) return;
    ownerFlight.current = true;
    setOwnerBusy(true);
    try {
      const ack = await feedDeleteCommentGuarded(item.id, currentOwner);
      if (!currentOwner()) return;
      if (!ack || ack.id !== item.id) throw new Error("FEED_COMMENT_DELETE_ACK_MISMATCH");
      deletedAcknowledged.current = true;
      setDeletedLocal(true);
      setEditing(false);
      try { await cache.invalidateQueries({ queryKey: ["feed"] }); }
      catch { reportClientError(new Error("FEED_COMMENT_DELETE_CACHE_FAILURE"), {
        issueKey: "FeedCommentOwner", keys: { operation: "delete_cache" },
      }); }
    } catch {
      if (!currentOwner()) return;
      ownerUnknown.current = true;
      reportClientError(new Error("FEED_COMMENT_DELETE_RESULT_UNCONFIRMED"), {
        issueKey: "FeedCommentOwner", keys: { operation: "delete_comment" },
      });
      Alert.alert("Комментарий", "Результат удаления комментария неизвестен. Проверьте результат перед повторной попыткой.");
    } finally {
      ownerFlight.current = false;
      if (currentOwner()) setOwnerBusy(false);
    }
  };
  const requestDelete = () => {
    if (reactionFlight.current || !item.canDelete || !currentOwner() || ownerFlight.current ||
        ownerUnknown.current || deletedAcknowledged.current ||
        confirmationId.current !== null) return;
    const token = ++nextConfirmationId.current;
    confirmationId.current = token;
    Alert.alert("Удалить комментарий?", "Отменить удаление будет нельзя.", [
      { text: "Отмена", style: "cancel", onPress: () => {
        if (confirmationId.current === token) confirmationId.current = null;
      } },
      { text: "Удалить", style: "destructive", onPress: () => {
        if (confirmationId.current !== token) return;
        confirmationId.current = null;
        if (currentOwner()) void deleteConfirmed();
      } },
    ]);
  };
  const openActions = () => {
    if (busy || ownerBusy || ownerFlight.current || ownerUnknown.current || reactionFlight.current ||
        menuIssued.current || confirmationId.current !== null || !canManage ||
        (!item.canEdit && !item.canDelete)) return;
    menuIssued.current = true;
    const options: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [];
    if (item.canEdit) options.push({ text: "Изменить", onPress: () => {
      menuIssued.current = false;
      if (!currentOwner() || ownerUnknown.current) return;
      setDraft(editAcknowledged.current ?? confirmedText ?? item.text);
      setEditing(true);
    } });
    if (item.canDelete) options.push({ text: "Удалить", style: "destructive", onPress: () => {
      menuIssued.current = false;
      requestDelete();
    } });
    options.push({ text: "Отмена", style: "cancel", onPress: () => { menuIssued.current = false; } });
    Alert.alert("Комментарий", undefined, options);
  };
  const goProfile = () => router.push({
    pathname: "/profile/[username]", params: { username: item.author.username },
  } as Href);
  return <View style={s.comment}>
    <View style={s.commentLine}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Профиль ${item.author.name}`}
        style={s.commentAvatarTap} onPress={goProfile}>
        {item.author.avatarUrl
          ? <Image source={{ uri: item.author.avatarUrl }} style={s.commentAvatar} cachePolicy="memory" />
          : <View style={[s.commentAvatar, s.avatarFallback]}>
              <Text style={s.commentAvatarInitial}>{item.author.name.slice(0, 1)}</Text>
            </View>}
      </Pressable>
      <View style={s.commentContent}>
        <View style={s.commentMetaRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Профиль ${item.author.name}`}
            style={s.commentAuthorTap} onPress={goProfile}>
            <Text numberOfLines={1} style={s.commentAuthorName}>{item.author.name}</Text>
          </Pressable>
          <Text numberOfLines={1} style={s.commentTime}>
            {formatFeedTime(item.createdAt)}{item.editedAt ? " · изм." : ""}
          </Text>
          {canManage && !ownerUnknown.current && (item.canEdit || item.canDelete) &&
            <Pressable accessibilityRole="button" accessibilityLabel="Действия с комментарием"
              style={s.commentMenuButton} disabled={busy || ownerBusy} onPress={openActions}>
              <MaterialCommunityIcons name="dots-horizontal" size={20} color={COLORS.textSecondary} />
            </Pressable>}
        </View>
        {item.replyToName && <Text numberOfLines={1} style={s.commentReplyLabel}>↪ {item.replyToName}</Text>}
        {editing && canManage && !ownerUnknown.current
          ? <View style={s.inlineEditor}>
              <TextInput style={s.inlineEditInput} multiline value={draft} onChangeText={setDraft}
                placeholder="Изменить комментарий" placeholderTextColor={COLORS.textSecondary} />
              <View style={s.inlineEditActions}>
                <Pressable accessibilityRole="button" onPress={() => setEditing(false)} style={s.commentAction}>
                  <Text style={s.commentActionText}>Отмена</Text>
                </Pressable>
                <Pressable accessibilityRole="button"
                  disabled={busy || ownerBusy || !draft.trim() ||
                    countFeedCharacters(draft) > FEED_LIMITS.commentCharacters}
                  onPress={() => void saveEdit()} style={s.commentAction}>
                  <Text style={s.commentActionText}>Сохранить</Text>
                </Pressable>
              </View>
            </View>
          : <Pressable onLongPress={openActions} disabled={!canManage || (!item.canEdit && !item.canDelete)}>
              <Text style={[s.commentBody, (item.deleted || deletedLocal) && s.deletedComment]}>
                {(item.deleted || deletedLocal) ? "Комментарий удалён" : (confirmedText ?? item.text)}
              </Text>
            </Pressable>}
        {!item.deleted && !deletedLocal && !!item.media?.length &&
          <FeedCommentAttachments postId={item.postId} media={item.media} />}
        {!item.deleted && !deletedLocal && !item.canEdit && <FeedReportButton type="comment" id={item.id} authorId={item.author.id} />}
        {!item.deleted && !deletedLocal && !editing && <View style={s.commentActions}>
          <FeedReactionStrip reactions={item.reactions}
            myReaction={confirmedReaction !== undefined ? confirmedReaction : item.myReaction}
            busy={busy || reactionUnknown.current || ownerBusy || !currentReactionActor()}
            onSelect={async emoji => { await runReaction(emoji); }} />
          <Pressable accessibilityRole="button" style={s.commentReplyButton}
            onPress={() => onReply(item)}>
            <Text style={s.commentActionText}>Ответить</Text>
          </Pressable>
        </View>}
        {!item.rootId && item.replyCount > 0 && <Pressable accessibilityRole="button"
          style={s.showRepliesButton} onPress={() => setShowReplies(previous => !previous)}>
          <MaterialCommunityIcons name={showReplies ? "chevron-up" : "reply-outline"}
            size={17} color={COLORS.primary} />
          <Text style={s.more}>{showReplies ? "Скрыть ответы" : `Ответы · ${item.replyCount}`}</Text>
        </Pressable>}
      </View>
    </View>
    {showReplies && <View style={s.threadReplies}>
      {replies.isPending && <Loading variant="inline" message="Загружаем ответы…" />}
      {replies.isError && !replies.isFetchNextPageError && <Pressable accessibilityRole="button"
        accessibilityLabel="Повторить загрузку ответов"
        onPress={() => void replies.refetch()} style={s.moreComments}>
        <Text style={s.more}>Повторить загрузку ответов</Text>
      </Pressable>}
      {replies.data?.pages.flatMap(page => page.items).map(reply =>
        <CommentRow key={reply.id} item={reply} postId={postId} onReply={onReply} />)}
      {replies.isFetchNextPageError && <Text accessibilityRole="alert" style={s.error}>
        Не удалось загрузить следующую страницу ответов. Уже загруженные ответы доступны.
      </Text>}
      {replies.hasNextPage && <Pressable accessibilityRole="button"
        accessibilityLabel={replies.isFetchNextPageError
          ? "Повторить страницу ответов ветки" : "Ещё ответы ветки"}
        style={s.moreComments} disabled={replies.isFetchingNextPage}
        onPress={nextRepliesPage}>
        <Text style={s.more}>{replies.isFetchingNextPage ? "Загрузка…"
          : replies.isFetchNextPageError ? "Повторить страницу ответов" : "Ещё ответы"}</Text>
      </Pressable>}
      {replies.isFetchingNextPage && <MascotSpinner />}
    </View>}
  </View>;
}
