import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Image,
  PixelRatio,
  Linking,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { VideoView, useVideoPlayer, type VideoPlayer, type VideoThumbnail } from "expo-video";
import { Image as ExpoImage } from "expo-image";
import {
  chat2ImageSource, chat2VideoSource, chat2HasVideoQuality,
  chat2MatchedS3Variant, chat2CdnS3FailoverAllowed,
  type Chat2QualityMode,
} from "@gafus/chat-media-quality";
import { Centrifuge } from "centrifuge";
import { chat2SubscriptionForConnection, chat2SubscriptionTransportOptions } from "@gafus/core-client/chat2/realtime-subscription";
import { useAuthStore } from "@/shared/stores";
import { reportClientError } from "@/shared/lib/tracer";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { TexturedSafeAreaView } from "@/shared/components/TexturedSafeAreaView";
import { chat2, nameFor, type Conversation, type Message, type Attachment } from "./api";
import { Chat2SettingsSheet } from "./Chat2SettingsSheet";
import { isCacheableChat2FinalUrl } from "./publicFinalCache";
import { readProcessedChat2Media } from "./mediaProcessing";
import { Chat2Avatar, Chat2MessageAuthorAvatar } from "./Chat2Avatar";
import { Chat2ReportSheet } from "./Chat2ReportSheet";
import { mergeHistory, shouldFetchOlderAtTop } from "./historyPagination";
import { CHAT2_EMOJIS, updateChat2ReactionSummary } from "./reactionSummary";

const olive = "#78894e",
  muted = "#879182";
export default function Chat2RoomScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id =
    typeof params.id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(params.id) ? params.id : null;
  const owner = useAuthStore((s) =>
    s.isAuthenticated && !s.isLoading ? (s.user?.id ?? null) : null,
  );
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  if (!id || !owner || binding?.principalId !== owner || !binding.authEpoch)
    return <Text accessibilityRole="alert">Диалог недоступен. Войдите в аккаунт.</Text>;
  return (
    <Chat2RoomOwned
      key={`${owner}:${binding.authEpoch}:${id}`}
      id={id}
      owner={owner}
      epoch={binding.authEpoch}
    />
  );
}
function Chat2RoomOwned({ id, owner, epoch }: { id: string; owner: string; epoch: string }) {
  const router = useRouter();
  const [room, setRoom] = useState<Conversation | null>(null),
    [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true),
    [pending, setPending] = useState(false),
    [olderPending, setOlderPending] = useState(false);
  const [more, setMore] = useState(true),
    [error, setError] = useState("");
  const [text, setText] = useState(""),
    [reply, setReply] = useState<Message | null>(null),
    [editing, setEditing] = useState<Message | null>(null);
  const [media, setMedia] = useState<
      { localId: string; name: string; uri: string; attachment?: Attachment }[]
    >([]),
    [uploading, setUploading] = useState(false);
  const [connection, setConnection] = useState<"connecting" | "online" | "fallback">("connecting");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportNotice, setReportNotice] = useState("");
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const touchOrigin = useRef<{ messageId: string; x: number; y: number } | null>(null);
  const swipeReplyId = useRef<string | null>(null);
  const mounted = useRef(true),
    lastRead = useRef("0"),
    listRef = useRef<FlatList<Message> | null>(null);
  const initialHistorySeen = useRef(false);
  const initialScrollDone = useRef(false);
  const olderRequest = useRef(false);
  const lastFetchedBefore = useRef<string | null>(null);
  const lastScrollY = useRef(0);
  const nearBottom = useRef(true);
  const current = useCallback(() => {
    const state = useAuthStore.getState();
    const bound = newOnlyV2NativeQueues.getVerifiedBinding();
    return (
      state.isAuthenticated &&
      !state.isLoading &&
      state.user?.id === owner &&
      bound?.principalId === owner &&
      bound.authEpoch === epoch
    );
  }, [owner, epoch]);
  const refresh = useCallback(async () => {
    try {
      const [info, history] = await Promise.all([chat2.room(id), chat2.messages(id)]);
      if (!mounted.current || !current()) return;
      setRoom(info);
      if (!initialHistorySeen.current) {
        initialHistorySeen.current = true;
        setMore(history.length === 60);
      }
      setMessages((previous) => mergeHistory(previous, history));
      setError("");
    } catch (e) {
      reportClientError(new Error("CHAT2_REFRESH_FAILED"), {
        issueKey: "Chat2Room",
        keys: { operation: "refresh" },
      });
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Не удалось загрузить сообщения");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [id, current]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const poll = setInterval(() => {
      if (AppState.currentState === "active") void refresh();
    }, 12000);
    return () => {
      mounted.current = false;
      clearInterval(poll);
    };
  }, [refresh]);
  useEffect(() => {
    if (!messages.length || AppState.currentState !== "active") return;
    const last = messages[messages.length - 1].sequence;
    if (BigInt(last) <= BigInt(lastRead.current)) return;
    lastRead.current = last;
    void chat2.read(id, last).catch(() => {
      reportClientError(new Error("CHAT2_READ_FAILED"), {
        issueKey: "Chat2Room",
        keys: { operation: "read" },
      });
      lastRead.current = "0";
    });
  }, [messages, id]);
  useEffect(() => {
    let live = true,
      client: Centrifuge | undefined;
    async function connect() {
      if (!live || AppState.currentState !== "active") return;
      try {
        const connection = await chat2.connect();
        if (!live) return;
        const subscription = await chat2SubscriptionForConnection(connection, id,
          () => chat2.subscription(id));
        if (!live) return;
        client = new Centrifuge(connection.wsUrl, {
          token: connection.token,
          getToken: async () => (await chat2.connect()).token,
          websocket: WebSocket,
        });
        client.on("connected", () => {
          if (live) {
            // A connection is not proof of a permitted room subscription.
            void refresh();
          }
        });
        client.on("disconnected", () => {
          if (live) setConnection("fallback");
        });
        // No legacy room token, including app-resume reconnect, when the API
        // advertises the broker-verified proxy-only subscription mode.
        const sub = client.newSubscription(subscription.channel,
          chat2SubscriptionTransportOptions(subscription,
            () => chat2.refreshSubscription(id)));
        sub.on("subscribed", () => {
          if (live) setConnection("online");
        });
        sub.on("unsubscribed", () => {
          if (live) setConnection("fallback");
        });
        sub.on("publication", () => {
          if (live) void refresh();
        });
        sub.on("error", () => {
          if (live) setConnection("fallback");
        });
        sub.subscribe();
        client.connect();
      } catch {
        reportClientError(new Error("CHAT2_REALTIME_CONNECT_FAILED"), {
          issueKey: "Chat2Room",
          keys: { operation: "realtime" },
        });
        if (live) setConnection("fallback");
      }
    }
    void connect();
    const app = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        client?.disconnect();
        return;
      }
      if (!live) return;
      if (client) client.connect();
      else void connect();
      void refresh();
    });
    return () => {
      live = false;
      app.remove();
      client?.disconnect();
    };
  }, [id, owner, refresh]);
  const latestMessageId = messages.at(-1)?.id;
  useEffect(() => {
    if (!latestMessageId || !initialScrollDone.current || !nearBottom.current ||
        olderRequest.current) return;
    const frame = requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [latestMessageId]);

  async function loadOlder() {
    // FlatList scroll events can arrive many times in one frame; lock immediately.
    if (olderRequest.current || !more || !messages.length || !current() ||
        lastFetchedBefore.current === messages[0].sequence) return;
    olderRequest.current = true;
    setOlderPending(true);
    try {
      const page = await chat2.messages(id, messages[0].sequence);
      if (!mounted.current || !current()) return;
      if (page.length < 60) setMore(false);
      const known = new Set(messages.map((message) => message.id));
      const unseen = page.filter((message) => !known.has(message.id));
      lastFetchedBefore.current = messages[0].sequence;
      if (!unseen.length) {
        setMore(false);
        return;
      }
      setMessages((previous) => mergeHistory(unseen, previous));
    } catch (e) {
      reportClientError(new Error("CHAT2_OLDER_FAILED"), {
        issueKey: "Chat2Room",
        keys: { operation: "older" },
      });
      if (mounted.current && current())
        setError(e instanceof Error ? e.message : "Не удалось загрузить историю");
    } finally {
      olderRequest.current = false;
      if (mounted.current) setOlderPending(false);
    }
  }
  async function pick(kind: "image" | "video" | "pdf") {
    if (pending || uploading || media.length >= 8) return;
    setUploading(true);
    setError("");
    try {
      let asset: { uri: string; name: string; mime: string; size: number } | null = null;
      if (kind === "image" || kind === "video") {
        const selection = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: kind === "video" ? ["videos"] : ["images"],
          quality: 0.85,
          allowsMultipleSelection: false,
        });
        if (!selection.canceled) {
          const f = selection.assets[0];
          asset = {
            uri: f.uri,
            name: f.fileName ?? (kind === "video" ? `video-${Crypto.randomUUID()}.mp4` : `photo-${Crypto.randomUUID()}.jpg`),
            mime: f.mimeType ?? (kind === "video" ? "video/mp4" : "image/jpeg"),
            size: f.fileSize ?? 0,
          };
        }
      } else {
        const selection = await DocumentPicker.getDocumentAsync({
          type: "application/pdf",
          copyToCacheDirectory: true,
        });
        if (!selection.canceled) {
          const f = selection.assets[0];
          asset = {
            uri: f.uri,
            name: f.name,
            mime: f.mimeType ?? "application/pdf",
            size: f.size ?? 0,
          };
        }
      }
      if (!asset) return;
      const localId = Crypto.randomUUID();
      setMedia((previous) => [...previous, { localId, name: asset!.name, uri: asset!.uri }]);
      try {
        const attachment = await chat2.upload(id, asset);
        if (mounted.current)
          setMedia((previous) =>
            previous.map((x) => (x.localId === localId ? { ...x, attachment } : x)),
          );
      } catch (e) {
        reportClientError(new Error("CHAT2_UPLOAD_FAILED"), {
          issueKey: "Chat2Room",
          keys: { operation: "upload" },
        });
        if (mounted.current) {
          setError(e instanceof Error ? e.message : "Не удалось загрузить файл");
          setMedia((previous) => previous.filter((x) => x.localId !== localId));
        }
      }
    } catch (e) {
      reportClientError(new Error("CHAT2_PICK_FAILED"), {
        issueKey: "Chat2Room",
        keys: { operation: "pick" },
      });
      setError(e instanceof Error ? e.message : "Не удалось выбрать файл");
    } finally {
      if (mounted.current) setUploading(false);
    }
  }
  function removeMedia(file: { localId: string; attachment?: Attachment }) {
    setMedia((previous) => previous.filter((x) => x.localId !== file.localId));
    if (file.attachment)
      void chat2
        .discard(id, file.attachment.id)
        .catch(() => setError("Не удалось отменить вложение"));
  }
  async function send() {
    const value = text.trim();
    if ((!value && !media.length) || pending || uploading || media.some((x) => !x.attachment))
      return;
    setPending(true);
    setError("");
    // Each confirmed logical send has one UUID; retain the same on an ambiguous failure.
    const attachmentIds = media.flatMap((x) => (x.attachment ? [x.attachment.id] : []));
    const requestId =
      retry.current?.text === value &&
      retry.current?.replyToId === reply?.id &&
      retry.current?.attachmentIds.join("|") === attachmentIds.join("|")
        ? retry.current.clientMessageId
        : Crypto.randomUUID();
    retry.current = {
      text: value,
      replyToId: reply?.id,
      clientMessageId: requestId,
      attachmentIds,
    };
    try {
      if (editing) await chat2.edit(id, editing.id, value);
      else await chat2.send(id, value, requestId, reply?.id, attachmentIds);
      retry.current = null;
      setText("");
      setReply(null);
      setEditing(null);
      setMedia([]);
      await refresh();
      listRef.current?.scrollToEnd({ animated: true });
    } catch (e) {
      reportClientError(new Error("CHAT2_SEND_FAILED"), {
        issueKey: "Chat2Room",
        keys: { operation: "send" },
      });
      setError(e instanceof Error ? e.message : "Сообщение не отправлено. Повторите.");
    } finally {
      setPending(false);
    }
  }
  const retry = useRef<{
    text: string;
    replyToId?: string;
    clientMessageId: string;
    attachmentIds: string[];
  } | null>(null);
  function replyTo(message: Message) {
    if (message.deletedAt) return;
    setReply(message);
    setEditing(null);
    setActionMessage(null);
  }
  function showActions(message: Message) {
    if (!message.deletedAt) setActionMessage(message);
  }
  async function react(messageId: string, emoji: string) {
    if (reactingId || !current()) return;
    setReactingId(messageId);
    setActionMessage(null);
    try {
      const result = await chat2.react(id, messageId, emoji);
      if (!mounted.current || !current()) return;
      setMessages((previous) => previous.map((message) =>
        message.id === messageId ? {
          ...message,
          reactions: updateChat2ReactionSummary(message.reactions, emoji, result.active),
        } : message,
      ));
      void refresh();
    } catch {
      reportClientError(new Error("CHAT2_REACTION_FAILED"), {
        issueKey: "Chat2Room",
        keys: { operation: "reaction" },
      });
      if (mounted.current) setError("Не удалось изменить реакцию");
    } finally {
      if (mounted.current) setReactingId(null);
    }
  }
  function editOwn(message: Message) {
    setEditing(message);
    setReply(null);
    setText(message.text);
    setActionMessage(null);
  }
  function deleteOwn(message: Message) {
    setActionMessage(null);
    Alert.alert("Удалить сообщение?", "", [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: () =>
        void chat2.remove(id, message.id).then(refresh).catch(() =>
          setError("Не удалось удалить сообщение")),
      },
    ]);
  }
  return (
    <TexturedSafeAreaView edges={["top", "bottom"]} style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Назад к списку чатов"
            onPress={() => router.back()}
            style={styles.back}
          >
            <Text style={styles.backLabel}>←</Text>
          </Pressable>
          <View style={styles.avatar}>
            <Chat2Avatar room={room} ownerId={owner}>
              <Text style={styles.emoji}>
                {room?.kind === "CITY" ? "🏙️" : room?.kind === "DIRECT" ? "👤" : "🐕"}
              </Text>
            </Chat2Avatar>
          </View>
          <View style={styles.heading}>
            <Text style={styles.title} numberOfLines={1}>
              {room ? nameFor(room, owner) : "Сообщения"}
            </Text>
            <Text style={styles.subtitle}>
              {room?.members.length ?? 0} участников ·{" "}
              {connection === "online" ? "подключено" : "синхронизация"}
            </Text>
          </View>
          <Pressable onPress={() => void refresh()} accessibilityLabel="Обновить переписку">
            <Text style={styles.reload}>↻</Text>
          </Pressable>
          {room && (
            <Pressable
              accessibilityLabel="Настройки переписки"
              onPress={() => setSettingsOpen(true)}
            >
              <Text style={styles.reload}>⋯</Text>
            </Pressable>
          )}
        </View>
        {room && (
          <Chat2SettingsSheet
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            id={id}
            room={room}
            owner={owner}
            onRefresh={refresh}
            onLeave={() => {
              setSettingsOpen(false);
              router.back();
            }}
          />
        )}
        <Chat2ReportSheet
          id={id}
          messageId={reportingId}
          onClose={() => setReportingId(null)}
          onSuccess={() => setReportNotice("Жалоба отправлена модераторам.")}
        />
        {!!reportNotice && (
          <Text accessibilityRole="alert" style={styles.error}>
            {reportNotice}
          </Text>
        )}
        {loading && <ActivityIndicator color={olive} style={styles.loading} />}
        {!!error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          // Native anchor preservation when older rows arrive at the beginning.
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          scrollEventThrottle={16}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            const y = Math.max(0, contentOffset.y);
            const movingUp = y < lastScrollY.current - 2;
            nearBottom.current = contentSize.height - layoutMeasurement.height - y < 120;
            lastScrollY.current = y;
            if (shouldFetchOlderAtTop({
              initialReady: initialScrollDone.current,
              movingUp,
              offsetY: y,
              contentHeight: contentSize.height,
              viewportHeight: layoutMeasurement.height,
            })) void loadOlder();
          }}
          onContentSizeChange={() => {
            if (!initialScrollDone.current && !loading && messages.length > 0) {
              initialScrollDone.current = true;
              listRef.current?.scrollToEnd({ animated: false });
            }
          }}
          ListHeaderComponent={olderPending ? (
            <ActivityIndicator
              size="small"
              color={olive}
              accessibilityLabel="Загружаем историю сообщений"
              style={styles.olderLoading}
            />
          ) : null}
          ListEmptyComponent={
            !loading ? <Text style={styles.empty}>Напишите первое сообщение 🐾</Text> : null
          }
          renderItem={({ item, index }) => {
            const own = item.authorId === owner,
              quoted = item.replyToId ? messages.find((m) => m.id === item.replyToId) : undefined;
            const day = new Date(item.createdAt).toLocaleDateString("ru-RU");
            const prev =
              index > 0
                ? new Date(messages[index - 1].createdAt).toLocaleDateString("ru-RU")
                : null;
            return (
              <View>
                {day !== prev && <Text style={styles.day}>{day}</Text>}
                <Pressable
                  accessibilityLabel={own ? "Моё сообщение" : "Сообщение участника"}
                  onPress={() => {
                    if (swipeReplyId.current === item.id) {
                      swipeReplyId.current = null;
                      return;
                    }
                    showActions(item);
                  }}
                  onLongPress={() => showActions(item)}
                  onTouchStart={(event) => {
                    touchOrigin.current = {
                      messageId: item.id,
                      x: event.nativeEvent.pageX,
                      y: event.nativeEvent.pageY,
                    };
                  }}
                  onTouchEnd={(event) => {
                    const first = touchOrigin.current;
                    touchOrigin.current = null;
                    if (!first || first.messageId !== item.id || item.deletedAt) return;
                    const dx = event.nativeEvent.pageX - first.x;
                    const dy = event.nativeEvent.pageY - first.y;
                    if (dx > 70 && Math.abs(dy) < 45) {
                      swipeReplyId.current = item.id;
                      replyTo(item);
                    }
                  }}
                  style={[styles.message, own && styles.myMessage]}
                >
                  {!own && (
                    <View style={styles.smallAvatar}>
                      <Chat2MessageAuthorAvatar room={room} authorId={item.authorId}>
                        <Text>👤</Text>
                      </Chat2MessageAuthorAvatar>
                    </View>
                  )}
                  <View style={[styles.bubble, own && styles.myBubble]}>
                    {!own && room?.kind !== "DIRECT" && (
                      <Text style={styles.sender}>
                        {room?.members.find((m) => m.userId === item.authorId)?.username ??
                          "Участник"}
                      </Text>
                    )}
                    {quoted && (
                      <Text style={styles.quote}>
                        ↳ {quoted.deletedAt ? "Удалено" : quoted.text.slice(0, 90)}
                      </Text>
                    )}
                    <Text style={[styles.body, item.deletedAt && styles.deleted]}>
                      {item.deletedAt ? "Сообщение удалено" : item.text}
                    </Text>
                    {!item.deletedAt &&
                      (item.attachments ?? []).map((file) => (
                        <NativeChat2Media key={file.id} conversationId={id} file={file} />
                      ))}
                    {!item.deletedAt && Boolean(item.reactions?.length) && (
                      <View style={styles.reactionBadges}>
                        {item.reactions?.map((reaction) => (
                          <Pressable key={reaction.emoji}
                            accessibilityRole="button"
                            accessibilityLabel={`${reaction.emoji}: ${reaction.count}; ${reaction.mine ? "Убрать мою реакцию" : "Поставить реакцию"}`}
                            disabled={Boolean(reactingId)}
                            onPress={(event) => {
                              event.stopPropagation();
                              void react(item.id, reaction.emoji);
                            }}
                            style={[styles.reactionBadge, reaction.mine && styles.myReactionBadge]}>
                            <Text style={styles.reactionBadgeText}>
                              {reaction.emoji} {reaction.count}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                    <Text style={styles.time}>
                      {new Date(item.createdAt).toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {item.editedAt ? " · изм." : ""}
                    </Text>
                  </View>
                </Pressable>
              </View>
            );
          }}
        />
        <Modal transparent visible={Boolean(actionMessage)} animationType="fade"
          onRequestClose={() => setActionMessage(null)}>
          <Pressable style={styles.actionBackdrop} onPress={() => setActionMessage(null)}>
            <Pressable style={styles.actionSheet} onPress={(event) => event.stopPropagation()}>
              <Text style={styles.actionTitle} numberOfLines={2}>
                {actionMessage?.text || "Сообщение"}
              </Text>
              <View style={styles.quickReactions}>
                {CHAT2_EMOJIS.map((emoji) => (
                  <Pressable key={emoji} accessibilityRole="button"
                    accessibilityLabel={`Поставить реакцию ${emoji}`}
                    disabled={Boolean(reactingId)}
                    onPress={() => { if (actionMessage) void react(actionMessage.id, emoji); }}
                    style={styles.quickReactionButton}>
                    <Text style={styles.quickReactionEmoji}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={styles.actionLine}
                accessibilityLabel="Ответить на сообщение"
                onPress={() => { if (actionMessage) replyTo(actionMessage); }}>
                <Text style={styles.actionLineText}>↩  Ответить</Text>
              </Pressable>
              {actionMessage?.authorId === owner && (
                <>
                  <Pressable style={styles.actionLine}
                    onPress={() => { if (actionMessage) editOwn(actionMessage); }}>
                    <Text style={styles.actionLineText}>✎  Изменить</Text>
                  </Pressable>
                  <Pressable style={styles.actionLine}
                    onPress={() => { if (actionMessage) deleteOwn(actionMessage); }}>
                    <Text style={styles.actionDanger}>Удалить сообщение</Text>
                  </Pressable>
                </>
              )}
              {actionMessage && actionMessage.authorId !== owner && (
                <Pressable style={styles.actionLine} onPress={() => {
                  setReportingId(actionMessage.id);
                  setReportNotice("");
                  setActionMessage(null);
                }}>
                  <Text style={styles.actionLineText}>Пожаловаться</Text>
                </Pressable>
              )}
              <Text style={styles.actionHint}>Свайп вправо по сообщению — быстрый ответ</Text>
            </Pressable>
          </Pressable>
        </Modal>
        {(reply || editing) && (
          <View style={styles.reply}>
            <Text numberOfLines={1} style={styles.replyText}>
              {editing ? "Редактирование" : `Ответ: ${reply?.text}`}
            </Text>
            <Pressable
              accessibilityLabel="Отменить ответ"
              onPress={() => {
                setReply(null);
                setEditing(null);
                setText("");
              }}
            >
              <Text style={styles.cancel}>×</Text>
            </Pressable>
          </View>
        )}
        {media.length > 0 && (
          <View style={styles.mediaPending}>
            {media.map((file) => (
              <View key={file.localId} style={styles.mediaChip}>
                {file.attachment?.kind === "image" || file.uri.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                  <Image
                    source={{ uri: file.uri }}
                    style={styles.mediaThumb}
                    resizeMode="contain"
                  />
                ) : file.attachment?.kind === "video" || /\.mp4$/i.test(file.name) ? (
                  <Text>Video</Text>
                ) : (
                  <Text>📄</Text>
                )}
                <Text numberOfLines={1} style={styles.mediaLabel}>
                  {file.name}
                </Text>
                <Text style={styles.mediaSmall}>{file.attachment ? "Готово" : "Загрузка…"}</Text>
                <Pressable onPress={() => removeMedia(file)} accessibilityLabel="Удалить вложение">
                  <Text style={styles.mediaClose}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
        <View style={styles.composer}>
          {!editing && (
            <Pressable
              accessibilityLabel="Прикрепить фото, видео или PDF"
              onPress={() =>
                Alert.alert("Вложение", "", [
                  { text: "Фото", onPress: () => void pick("image") },
                  { text: "Видео MP4", onPress: () => void pick("video") },
                  { text: "PDF", onPress: () => void pick("pdf") },
                  { text: "Отмена", style: "cancel" },
                ])
              }
            >
              <Text style={styles.attach}>📎</Text>
            </Pressable>
          )}
          <TextInput
            multiline
            maxLength={8000}
            value={text}
            onChangeText={setText}
            placeholder="Напишите сообщение…"
            style={styles.input}
            accessibilityLabel="Текст сообщения"
          />
          <Pressable
            style={[
              styles.send,
              ((!text.trim() && !media.length) ||
                pending ||
                uploading ||
                media.some((x) => !x.attachment)) &&
                styles.disabled,
            ]}
            onPress={() => void send()}
            disabled={
              (!text.trim() && !media.length) ||
              pending ||
              uploading ||
              media.some((x) => !x.attachment)
            }
            accessibilityLabel="Отправить сообщение"
          >
            <Text style={styles.sendText}>{pending ? "…" : "➤"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </TexturedSafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fffdf8" },
  flex: { flex: 1 },
  header: {
    minHeight: 65,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: "#e6eee0",
    borderBottomWidth: 2,
    borderColor: "#a6b991",
    shadowColor: "#384e2c",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.13,
    shadowRadius: 8,
    elevation: 3,
    zIndex: 2,
  },
  back: { padding: 8 },
  backLabel: { fontSize: 25, color: olive },
  avatar: {
    width: 39,
    height: 39,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#e5ebdc",
  },
  emoji: { fontSize: 22 },
  heading: { flex: 1, gap: 3 },
  title: { color: "#263a21", fontSize: 16, fontWeight: "700" },
  subtitle: { color: "#496142", fontSize: 11 },
  reload: { fontSize: 25, color: olive },
  list: { flex: 1 },
  listContent: { padding: 13, flexGrow: 1 },
  loading: { margin: 18 },
  error: { fontSize: 12, color: "#ae493c", paddingHorizontal: 16, paddingVertical: 7 },
  empty: { textAlign: "center", marginTop: 75, color: muted },
  olderLoading: { height: 0, zIndex: 2, alignSelf: "center" },
  day: {
    alignSelf: "center",
    fontSize: 11,
    color: muted,
    backgroundColor: "#edf1e5",
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 5,
    marginVertical: 15,
  },
  message: { flexDirection: "row", alignItems: "flex-end", marginVertical: 5, gap: 7 },
  myMessage: { justifyContent: "flex-end" },
  smallAvatar: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "#e7eddf",
    alignItems: "center",
    justifyContent: "center",
  },
  reactionBadges: { flexDirection: "row", gap: 5, flexWrap: "wrap", marginTop: 6 },
  reactionBadge: {
    backgroundColor: "#f6f8f2", borderColor: "#dae2d2", borderWidth: 1,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, minHeight: 28,
  },
  myReactionBadge: { backgroundColor: "#e0eacb", borderColor: "#a6bb87" },
  reactionBadgeText: { color: "#35482e", fontSize: 12 },
  actionBackdrop: {
    flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.28)",
  },
  actionSheet: {
    backgroundColor: "#fbfcf6", borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 18, paddingTop: 15, paddingBottom: 34, gap: 6,
  },
  actionTitle: { color: "#526147", fontSize: 13, marginBottom: 10 },
  quickReactions: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  quickReactionButton: { padding: 8, minWidth: 43, alignItems: "center" },
  quickReactionEmoji: { fontSize: 25 },
  actionLine: {
    paddingVertical: 14, paddingHorizontal: 10, borderBottomWidth: 1,
    borderBottomColor: "#e6eadf",
  },
  actionLineText: { color: "#293c21", fontSize: 16, fontWeight: "500" },
  actionDanger: { color: "#b54539", fontSize: 16 },
  actionHint: { fontSize: 12, color: "#78866d", textAlign: "center", marginTop: 12 },
  bubble: {
    backgroundColor: "#eff2eb",
    borderRadius: 15,
    borderBottomLeftRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    maxWidth: "80%",
    minWidth: 65,
  },
  myBubble: { backgroundColor: "#e6edd9", borderBottomLeftRadius: 15, borderBottomRightRadius: 5 },
  sender: { fontSize: 12, fontWeight: "700", color: olive, marginBottom: 5 },
  body: { fontSize: 14, lineHeight: 21, color: "#333f2b" },
  deleted: { color: muted, fontStyle: "italic" },
  quote: {
    borderLeftWidth: 3,
    borderColor: olive,
    paddingHorizontal: 9,
    marginBottom: 6,
    color: "#667658",
    fontSize: 12,
  },
  time: { fontSize: 10, color: muted, textAlign: "right", marginTop: 5 },
  reply: {
    paddingHorizontal: 17,
    paddingVertical: 7,
    flexDirection: "row",
    backgroundColor: "#eef1e8",
    alignItems: "center",
  },
  replyText: { flex: 1, fontSize: 12, color: olive },
  cancel: { fontSize: 22, color: olive },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginHorizontal: 10,
    marginBottom: 8,
    padding: 7,
    backgroundColor: "#f5f7f0",
    borderRadius: 17,
    borderColor: "#e0e8d8",
    borderWidth: 1,
  },
  input: {
    flex: 1,
    maxHeight: 130,
    minHeight: 34,
    paddingHorizontal: 9,
    paddingVertical: 7,
    textAlignVertical: "center",
    fontSize: 14,
    color: "#333f2b",
  },
  send: {
    width: 39,
    height: 39,
    borderRadius: 20,
    backgroundColor: olive,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.5 },
  sendText: { color: "white", fontWeight: "700", fontSize: 20 },
  attach: { fontSize: 23, padding: 7, color: olive },
  mediaPending: { paddingHorizontal: 10, paddingVertical: 8, gap: 5, maxHeight: 90 },
  mediaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#edf1e4",
    borderRadius: 9,
    padding: 4,
  },
  mediaThumb: { width: 45, height: 45, borderRadius: 7 },
  mediaLabel: { flex: 1, fontSize: 12, color: olive },
  mediaSmall: { fontSize: 10, color: muted },
  mediaClose: { fontSize: 22, color: "#ab4736", paddingHorizontal: 8 },
});

/** Images use API-authorized CDN/S3 pairs. Fullscreen stays inside the app. */
function NativeChat2Media({ conversationId, file }: { conversationId: string; file: Attachment }) {
  if (file.kind === "video") return <NativeChat2Video conversationId={conversationId} file={file} />;
  if (file.kind === "file") return <NativeChat2Document conversationId={conversationId} file={file} />;
  return <NativeChat2Image conversationId={conversationId} file={file} />;
}

/** Existing PDF attachments retain the authenticated external document viewer. */
function NativeChat2Document({ conversationId, file }: {
  conversationId: string; file: Attachment;
}) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const media = await chat2.media(conversationId, file.id);
      if (!media.url) throw new Error("CHAT2_DOCUMENT_UNAVAILABLE");
      await Linking.openURL(media.url);
    } catch {
      reportClientError(new Error("CHAT2_DOCUMENT_OPEN_FAILED"), {
        issueKey: "Chat2Room", keys: { operation: "document_open" },
      });
      Alert.alert("Вложение недоступно", "Попробуйте обновить чат");
    } finally { setBusy(false); }
  };
  return <Pressable accessibilityRole="button" onPress={() => void open()}
    accessibilityLabel={`Открыть документ ${file.name}`}
    disabled={busy} style={{ paddingVertical: 12 }}>
    <Text style={{ color: olive, fontSize: 12 }}>
      {busy ? "Открываем документ…" : `📎 ${file.name}`}
    </Text>
  </Pressable>;
}

type Chat2ImageViewer = {
  url: string;
  fallbackUrl: string | null;
  triedFallback: boolean;
  failed: boolean;
};
function NativeChat2Image({ conversationId, file }: { conversationId: string; file: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [pending, setPending] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [viewer, setViewer] = useState<Chat2ImageViewer | null>(null);
  const triedFallback = useRef(false);
  const requestGeneration = useRef(0);
  useEffect(() => {
    const generation = ++requestGeneration.current;
    let live = true;
    const controller = new AbortController();
    setPending(true);
    setProcessing(false);
    setFailed(false);
    setUrl(null);
    setFallbackUrl(null);
    setUsingFallback(false);
    triedFallback.current = false;
    void readProcessedChat2Media(
      () => chat2.media(conversationId, file.id), controller.signal,
      () => { if (live) setProcessing(true); },
    ).then(result => {
        if (!live || requestGeneration.current !== generation) return;
        const primary = file.kind === "image"
          ? chat2ImageSource(result.renditions?.image, 220, PixelRatio.get(),
              result.renditions?.imageWidths) ?? result.url
          : result.url;
        setFallbackUrl(chat2MatchedS3Variant(primary, result));
        setUrl(primary);
      })
      .catch(() => {
        if (!live || requestGeneration.current !== generation) return;
        reportClientError(new Error("CHAT2_MEDIA_FETCH_FAILED"), {
          issueKey: "Chat2Room", keys: { operation: "media_fetch" },
        });
        setFailed(true);
      })
      .finally(() => {
        if (live && requestGeneration.current === generation) setPending(false);
      });
    const currentGeneration = requestGeneration;
    return () => {
      live = false;
      controller.abort();
      currentGeneration.current++;
    };
  }, [conversationId, file.id, file.kind, reload]);
  const retry = () => {
    setViewer(null);
    setReload(previous => previous + 1);
  };
  const thumbnailFailure = () => {
    if (triedFallback.current || !url || !fallbackUrl || usingFallback) {
      setFailed(true);
      return;
    }
    triedFallback.current = true;
    const generation = requestGeneration.current;
    const original = url;
    void chat2CdnS3FailoverAllowed(original, fallbackUrl, fetch, true)
      .then(allowed => {
        if (requestGeneration.current !== generation) return;
        if (allowed) { setUsingFallback(true); setUrl(fallbackUrl); }
        else setFailed(true);
      })
      .catch(() => {
        if (requestGeneration.current === generation) setFailed(true);
      });
  };
  async function open() {
    if (pending || failed) return;
    const generation = requestGeneration.current;
    try {
      // Obtain fresh URLs: a message may have been visible longer than its signed TTL.
      const refreshed = await chat2.media(conversationId, file.id);
      if (requestGeneration.current !== generation) return;
      const primary = refreshed.renditions?.image?.[720] ?? refreshed.url;
      const fallback = chat2MatchedS3Variant(primary, refreshed);
      setViewer({ url: primary, fallbackUrl: fallback, triedFallback: false, failed: false });
    } catch {
      if (requestGeneration.current !== generation) return;
      reportClientError(new Error("CHAT2_MEDIA_OPEN_FAILED"), {
        issueKey: "Chat2Room", keys: { operation: "media_open" },
      });
      Alert.alert("Вложение недоступно", "Попробуйте обновить фотографию");
    }
  }
  const fullscreenFailure = () => {
    if (!viewer || viewer.triedFallback || !viewer.fallbackUrl) {
      setViewer(previous => previous ? { ...previous, failed: true } : previous);
      return;
    }
    const { url: original, fallbackUrl: backup } = viewer;
    const generation = requestGeneration.current;
    setViewer(previous => previous?.url === original
      ? { ...previous, triedFallback: true } : previous);
    void chat2CdnS3FailoverAllowed(original, backup, fetch, true)
      .then(allowed => {
        if (requestGeneration.current !== generation) return;
        setViewer(previous => previous?.url !== original ? previous :
          allowed ? { ...previous, url: backup, triedFallback: true } :
            { ...previous, failed: true });
      })
      .catch(() => {
        if (requestGeneration.current !== generation) return;
        setViewer(previous => previous?.url === original
          ? { ...previous, failed: true } : previous);
      });
  };
  return <>
    <Pressable accessibilityRole="button"
      accessibilityLabel={failed ? `Повторить загрузку ${file.name}` : `Открыть ${file.name}`}
      onPress={failed ? retry : () => void open()}
      disabled={pending}
      style={{ marginTop: 8 }}>
      {file.kind === "image" && url && !failed ? <ExpoImage
        source={{ uri: url }}
        cachePolicy={isCacheableChat2FinalUrl(url) ? "memory-disk" : "memory"}
        onError={thumbnailFailure}
        contentFit="contain"
        style={{ width: 220, height: 180, borderRadius: 12, backgroundColor: "#fff" }}
      /> : <View style={{ width: 220, minHeight: 96, alignItems: "center",
        justifyContent: "center", backgroundColor: "#edf1e4", borderRadius: 12, padding: 10 }}>
        {pending ? <View style={{ alignItems: "center", gap: 6 }}>
          <ActivityIndicator color={olive} />
          <Text style={{ color: olive, fontSize: 12 }}>
            {processing ? "Обрабатываем фото…" : "Загружаем фото…"}
          </Text>
        </View> :
          <Text style={{ color: olive, fontSize: 12 }}>
            {failed ? "Не удалось загрузить фото · Повторить" : `📎 ${file.name}`}
          </Text>}
      </View>}
    </Pressable>
    <Modal visible={Boolean(viewer)} transparent animationType="fade"
      statusBarTranslucent onRequestClose={() => setViewer(null)}>
      <View style={{ flex: 1, backgroundColor: "#000e", justifyContent: "center" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть фотографию"
          onPress={() => setViewer(null)}
          style={{ position: "absolute", top: 55, right: 20, zIndex: 2,
            backgroundColor: "#243127", width: 44, height: 44, borderRadius: 22,
            alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontSize: 28, lineHeight: 34 }}>×</Text>
        </Pressable>
        {viewer?.failed ? <Pressable accessibilityRole="button"
          accessibilityLabel="Повторить открытие фотографии"
          onPress={() => { setViewer(null); void open(); }}
          style={{ padding: 20, alignItems: "center" }}>
          <Text accessibilityRole="alert" style={{ color: "#fff", textAlign: "center" }}>
            Не удалось открыть фотографию · Повторить
          </Text>
        </Pressable> : viewer && <ExpoImage source={{ uri: viewer.url }}
          cachePolicy={isCacheableChat2FinalUrl(viewer.url) ? "memory-disk" : "memory"}
          contentFit="contain" onError={fullscreenFailure}
          style={{ width: "100%", height: "82%" }} />}
      </View>
    </Modal>
  </>;
}

/** Mount the paused native player with the message: it can render the first frame
 * even for legacy MP4s that do not have a separately processed poster. */
function NativeChat2VideoPlayer({
  url, onError, seekTo, onPlayer, onPlayingChange, resumeOnReady, controlsVisible,
  requestThumbnail, onThumbnail,
}: {
  url: string;
  onError: () => void;
  seekTo: number;
  onPlayer: (player: VideoPlayer | null) => void;
  onPlayingChange: (playing: boolean) => void;
  resumeOnReady: boolean;
  controlsVisible: boolean;
  requestThumbnail: boolean;
  onThumbnail: (url: string, frame: VideoThumbnail) => void;
}) {
  const player = useVideoPlayer({ uri: url, contentType: "progressive",
    useCaching: isCacheableChat2FinalUrl(url) }, instance => {
    instance.staysActiveInBackground = false;
    instance.showNowPlayingNotification = false;
    instance.pause(); // Never autoplay when entering the chat.
  });
  useEffect(() => {
    onPlayer(player);
    return () => onPlayer(null);
  }, [player, onPlayer]);
  useEffect(() => {
    let sought = false;
    let resumed = false;
    let failed = false;
    let thumbnailRequested = false;
    let live = true;
    const onStatus = (status: string) => {
      if (status === "error" && !failed) { failed = true; onError(); }
      if (status !== "readyToPlay") return;
      if (requestThumbnail && !thumbnailRequested) {
        thumbnailRequested = true;
        // Legacy Chat2 MP4s do not have a poster object. Extract a single
        // still using the native decoder; the paused VideoView remains a fallback.
        void player.generateThumbnailsAsync(0, { maxWidth: 440, maxHeight: 440 })
          .then(frames => { if (live && frames[0]) onThumbnail(url, frames[0]); })
          .catch(() => undefined);
      }
      if (!sought) {
        if (seekTo > 0) player.currentTime = Math.min(seekTo, Math.max(0, player.duration - 0.1));
        sought = true;
      }
      if (resumeOnReady && !resumed) {
        resumed = true;
        player.play();
      }
    };
    const statusListener = player.addListener("statusChange", ({ status }) => onStatus(status));
    const playingListener = player.addListener("playingChange", ({ isPlaying }) =>
      onPlayingChange(isPlaying));
    onStatus(player.status);
    return () => { live = false; statusListener.remove(); playingListener.remove(); };
  }, [player, onError, onPlayingChange, seekTo, resumeOnReady, requestThumbnail, onThumbnail, url]);
  return <VideoView player={player}
    style={{ width: 220, height: 220, backgroundColor: "#17211d" }}
    contentFit="contain" nativeControls={controlsVisible} allowsPictureInPicture={false}
    surfaceType={Platform.OS === "android" ? "textureView" : undefined} />;
}

function NativeChat2Video({ conversationId, file }: { conversationId: string; file: Attachment }) {
  type MediaResponse = Awaited<ReturnType<typeof chat2.media>>;
  const [media, setMedia] = useState<MediaResponse | null>(null);
  const [quality, setQuality] = useState<Chat2QualityMode>("auto");
  const [seekTo, setSeekTo] = useState(0);
  const [resumeOnReady, setResumeOnReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [everPlayed, setEverPlayed] = useState(false);
  const [thumbnail, setThumbnail] = useState<{ url: string; frame: VideoThumbnail } | null>(null);
  const [posterFailed, setPosterFailed] = useState(false);
  const [posterViaS3, setPosterViaS3] = useState(false);
  const playerRef = useRef<VideoPlayer | null>(null);
  const signedAt = useRef(0);
  const [pending, setPending] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [usingFallback, setUsingFallback] = useState(false);
  const recoveryInProgress = useRef(false);
  const playIntent = useRef(false);
  const recoveryGeneration = useRef(0);

  // Same lifecycle as Web: fetch the authorized media/cover immediately on mount.
  // Keep the player paused until a user explicitly taps Play.
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const generation = ++recoveryGeneration.current;
    recoveryInProgress.current = false;
    playIntent.current = false;
    setPending(true);
    setProcessing(false);
    setError(false);
    setMedia(null);
    void readProcessedChat2Media(
      () => chat2.media(conversationId, file.id), controller.signal,
      () => { if (live) setProcessing(true); },
    ).then(result => {
        if (!live) return;
        signedAt.current = Date.now();
        setMedia(result);
        setPosterFailed(false);
        setPosterViaS3(false);
        setQuality("auto");
        setUsingFallback(false);
        setSeekTo(0);
        setResumeOnReady(false);
        setPlaying(false);
        setEverPlayed(false);
      })
      .catch(() => {
        if (!live) return;
        reportClientError(new Error("CHAT2_VIDEO_MEDIA_FETCH_FAILED"), {
          issueKey: "Chat2Room", keys: { operation: "video_media_fetch" },
        });
        setMedia(null);
        setError(true);
      })
      .finally(() => { if (live) setPending(false); });
    const recoveryRef = recoveryGeneration;
    return () => {
      live = false;
      controller.abort();
      recoveryRef.current = generation + 1;
    };
  }, [conversationId, file.id, reload]);

  const onPlayingChange = useCallback((isPlaying: boolean) => {
    setPlaying(isPlaying);
    if (isPlaying) setEverPlayed(true);
  }, []);
  const onPlayer = useCallback((player: VideoPlayer | null) => { playerRef.current = player; }, []);
  const onThumbnail = useCallback((url: string, frame: VideoThumbnail) => {
    setThumbnail({ url, frame });
  }, []);
  const onError = useCallback(() => {
    // Native players can emit multiple status errors during a single failed load.
    if (recoveryInProgress.current) return;
    const fail = () => { setPlaying(false); setError(true); setMedia(null); };
    if (usingFallback || !media) { fail(); return; }
    const primary = chat2VideoSource(media.renditions?.video, quality, { width: 220 }) ?? media.url;
    const backup = chat2MatchedS3Variant(primary, media);
    recoveryInProgress.current = true;
    const generation = recoveryGeneration.current;
    void chat2CdnS3FailoverAllowed(primary, backup, fetch, true)
      .then(allowed => {
        if (recoveryGeneration.current !== generation) return;
        if (!allowed) { fail(); return; }
        setSeekTo(playerRef.current?.currentTime ?? 0);
        setResumeOnReady(playIntent.current || Boolean(playerRef.current?.playing));
        setUsingFallback(true);
        setPosterViaS3(true);
        setPlaying(false);
      })
      .catch(() => {
        if (recoveryGeneration.current === generation) fail();
      })
      .finally(() => {
        if (recoveryGeneration.current === generation) recoveryInProgress.current = false;
      });
  }, [usingFallback, media, quality]);
  async function play() {
    if (!media || pending) return;
    playIntent.current = true;
    // The inline signed URL can expire while a user reads an older chat history.
    // Refresh only if it is stale, rather than fetching again on every tap.
    if (signedAt.current && Date.now() - signedAt.current >=
        Math.max(0, media.expiresIn - 30) * 1000) {
      setPending(true);
      try {
        const refreshed = await chat2.media(conversationId, file.id);
        signedAt.current = Date.now();
        setSeekTo(0);
        setQuality("auto");
        setUsingFallback(false);
        setPosterViaS3(false);
        setResumeOnReady(true);
        setMedia(refreshed);
        setError(false);
      } catch {
        reportClientError(new Error("CHAT2_VIDEO_SIGNED_URL_RENEW_FAILED"), {
          issueKey: "Chat2Room", keys: { operation: "video_url_renew" },
        });
        setError(true);
        setMedia(null);
      } finally { setPending(false); }
      return;
    }
    playerRef.current?.play();
  }
  function choose(mode: Chat2QualityMode) {
    if (mode === quality) return;
    setSeekTo(playerRef.current?.currentTime ?? 0);
    setResumeOnReady(playerRef.current?.playing ?? false);
    setQuality(mode);
  }
  function retry() {
    playIntent.current = false;
    recoveryInProgress.current = false;
    setMedia(null);
    setPlaying(false);
    setError(false);
    setReload(value => value + 1);
  }
  const variants = usingFallback ? media?.fallbackRenditions?.video : media?.renditions?.video;
  const url = media ? chat2VideoSource(variants, quality, { width: 220 }) ??
    (usingFallback ? media.fallbackUrl ?? null : media.url) : null;
  const posterUrl = usingFallback || posterViaS3
    ? media?.fallbackRenditions?.poster ?? media?.renditions?.poster
    : media?.renditions?.poster;
  const poster = posterFailed ? null : posterUrl;
  const multiple = chat2HasVideoQuality(variants, 360) && chat2HasVideoQuality(variants, 720);
  return <View style={{ marginTop: 8, width: 220 }}>
    {url ? <View style={{ width: 220, height: 220, borderRadius: 12,
        overflow: "hidden", backgroundColor: "#17211d", position: "relative" }}>
      <NativeChat2VideoPlayer key={url} url={url} onError={onError} seekTo={seekTo}
        resumeOnReady={resumeOnReady} onPlayer={onPlayer} onPlayingChange={onPlayingChange}
        controlsVisible={everPlayed} requestThumbnail={!poster} onThumbnail={onThumbnail} />
      {!everPlayed && !playing && (poster || thumbnail?.url === url) && <View pointerEvents="none"
        style={{ position: "absolute", width: 220, height: 220 }}>
        {poster ? <ExpoImage source={{ uri: poster }} contentFit="contain"
          cachePolicy={isCacheableChat2FinalUrl(poster) ? "memory-disk" : "memory"}
          onError={() => {
            if (usingFallback || posterViaS3 || !media) {setPosterFailed(true);return;}
            const fallback = chat2MatchedS3Variant(poster, media);
            void chat2CdnS3FailoverAllowed(poster, fallback, fetch, true)
              .then(allowed => {
                if (allowed && fallback) setPosterViaS3(true);
                else setPosterFailed(true);
              }).catch(() => setPosterFailed(true));
          }}
          style={{ width: 220, height: 220 }} /> :
          thumbnail?.url === url && <ExpoImage source={thumbnail.frame}
            contentFit="contain" style={{ width: 220, height: 220 }} />}
      </View>}
      {!everPlayed && !playing && <Pressable accessibilityRole="button"
        accessibilityLabel={`Воспроизвести ${file.name}`}
        onPress={() => void play()} disabled={pending}
        style={{ position: "absolute", left: 82, top: 82,
          width: 56, height: 56, borderRadius: 28,
          borderWidth: 1, borderColor: "#ffffff99", backgroundColor: "#17211dd4",
          alignItems: "center", justifyContent: "center" }}>
        {pending ? <ActivityIndicator color="#fff" /> :
          <Text style={{ color: "#fff", fontSize: 27, marginLeft: 4 }}>▶</Text>}
      </Pressable>}
    </View> : <View style={{ width: 220, minHeight: 180, borderRadius: 12,
      backgroundColor: "#17211d", alignItems: "center", justifyContent: "center", padding: 16, gap: 12 }}>
      {pending ? <><ActivityIndicator color="#fff" />
        <Text style={{ color: "#fff", fontSize: 12 }}>
          {processing ? "Обрабатываем видео…" : "Загружаем видео…"}
        </Text></> :
        <><Text style={{ color: "#fff", fontSize: 12, textAlign: "center" }}>
          {error ? "Не удалось загрузить видео" : "Видео недоступно"}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Повторить загрузку видео"
            onPress={retry} style={{ paddingVertical: 7, paddingHorizontal: 14,
              backgroundColor: olive, borderRadius: 8 }}>
            <Text style={{ color: "#fff", fontSize: 12 }}>Повторить</Text>
          </Pressable></>}
    </View>}
    {multiple && url && <View accessibilityLabel="Качество видео"
      style={{ flexDirection: "row", gap: 4, padding: 5, marginTop: 4, borderRadius: 8, backgroundColor: "#25352c" }}>
      {(["auto", 360, 720] as const).map(mode => (
        <Pressable key={mode} accessibilityRole="button" accessibilityState={{ selected: quality === mode }}
          onPress={() => choose(mode)}
          style={{ flex: 1, borderRadius: 6, paddingVertical: 6, alignItems: "center",
            backgroundColor: quality === mode ? olive : "transparent" }}>
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>
            {mode === "auto" ? "Авто" : `${mode}p`}
          </Text>
        </Pressable>
      ))}
    </View>}
  </View>;
}
