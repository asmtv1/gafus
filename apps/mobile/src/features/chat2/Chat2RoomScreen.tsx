import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, FlatList, ScrollView, KeyboardAvoidingView, Platform, Pressable, Image, Text, View, ActivityIndicator, Alert, Modal } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import type * as ImagePicker from "expo-image-picker";
import { prepareUploadPhoto } from "@/shared/lib/media/prepareUploadPhoto";
import { prepareUploadWebpVariants } from "@/shared/lib/media/prepareUploadWebp";
import { iosCompatiblePhotoPicker } from "@/shared/lib/media/iosCompatiblePhotoPicker";
import { pickMedia } from "@/shared/lib/media/mediaPicker";
import { photoRetryMessage, photoFailureCode } from "@/shared/lib/media/photoRetryMessage";
import { prepareVideoPosterWebp } from "@/shared/lib/media/prepareVideoPosterWebp";
import { prepareUploadVideo720, type PreparedUploadVideo720, type Video720Failure } from "@/shared/lib/media/prepareUploadVideo720";
import * as DocumentPicker from "expo-document-picker";
import { videoRetryMessage } from "@/shared/lib/media/videoRetryMessage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Centrifuge } from "centrifuge";
import { chat2SubscriptionForConnection, chat2SubscriptionTransportOptions } from "@gafus/core-client/chat2/realtime-subscription";
import { createChat2Draft } from "@gafus/core-client/chat2/draft";
import { reserveChatSendAttempt, type ChatSendAttempt } from "@gafus/core-client/chat2/send-attempt";
import { useAuthStore } from "@/shared/stores";
import { reportClientError } from "@/shared/lib/error-reporting";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { TexturedSafeAreaView } from "@/shared/components/TexturedSafeAreaView";
import { SwipeDismissHandle } from "@/shared/components/gestures/SwipeDismissHandle";
import { SwipeReplyMessage } from "./SwipeReplyMessage";
import { chat2, nameFor, type Conversation, type Message, type Attachment, type Chat2PreparedPhotoVariants } from "./api";
import { Chat2S3UploadError } from "./s3Upload";
import { Chat2SettingsSheet } from "./Chat2SettingsSheet";
import { Chat2Avatar, Chat2MessageAuthorAvatar } from "./Chat2Avatar";
import { Chat2ReportSheet } from "./Chat2ReportSheet";
import { mergeHistory, shouldFetchOlderAtTop } from "./historyPagination";
import { CHAT2_EMOJIS, updateChat2ReactionSummary } from "./reactionSummary";
import { styles, olive } from "./chat2RoomStyles";
import { NativeChat2Media } from "./Chat2RoomMedia";
import { Chat2RoomComposer } from "./Chat2RoomComposer";
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
  const [draftState] = useState(() => createChat2Draft("")),
    [reply, setReply] = useState<Message | null>(null),
    [editing, setEditing] = useState<Message | null>(null);
  const [media, setMedia] = useState<
      { localId: string; name: string; uri: string; attachment?: Attachment;
        sourceVideo?: ImagePicker.ImagePickerAsset; sourcePhoto?: ImagePicker.ImagePickerAsset;
        failure?: string; uploading?: boolean; preparedPhoto?: boolean; preparedVideo?: boolean }[]
    >([]),
    [uploading, setUploading] = useState(false);
  const [connection, setConnection] = useState<"connecting" | "online" | "fallback">("connecting");
  const imageAttachments = useMemo(() => messages.flatMap(message => message.deletedAt
    ? [] : (message.attachments ?? []).filter(file => file.kind === "image")), [messages]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportNotice, setReportNotice] = useState("");
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const swipeReplyId = useRef<string | null>(null);
  const mounted = useRef(true),
    lastRead = useRef("0"),
    listRef = useRef<FlatList<Message> | null>(null);
  // Keep locally encoded photo renditions until send/cancel. No S3 call on selection.
  const preparedPhotos = useRef(new Map<string, Chat2PreparedPhotoVariants>());
  const activePhotos = useRef(new Set<string>());
  const preparedVideos = useRef(new Map<string, PreparedUploadVideo720>());
  const preparedVideoPosters = useRef(new Map<string, Awaited<ReturnType<typeof prepareVideoPosterWebp>>>());
  const activeVideos = useRef(new Set<string>());
  const sendingRef = useRef(false);
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
    const drafts = preparedPhotos.current;
    const draftIds = activePhotos.current;
    const videoDrafts = preparedVideos.current;
    const videoPosterDrafts = preparedVideoPosters.current;
    const videoIds = activeVideos.current;
    void refresh();
    const poll = setInterval(() => {
      if (AppState.currentState === "active") void refresh();
    }, 12000);
    return () => {
      mounted.current = false;
      clearInterval(poll);
      draftIds.clear();
      for (const variants of drafts.values())
        for (const item of Object.values(variants)) item.dispose();
      drafts.clear();
      videoIds.clear();
      for (const prepared of videoDrafts.values()) prepared.dispose();
      videoDrafts.clear();
      for (const poster of videoPosterDrafts.values()) poster.dispose();
      videoPosterDrafts.clear();
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
        const subscription = await chat2SubscriptionForConnection(connection, id);
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
          chat2SubscriptionTransportOptions(subscription));
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
  async function prepareOnePhoto(localId: string, source: ImagePicker.ImagePickerAsset) {
    // Encode JPEG and both WebP renditions now. Only a send tap may reserve/upload to S3.
    let prepared: Awaited<ReturnType<typeof prepareUploadPhoto>> | null = null;
    let variants: Chat2PreparedPhotoVariants | null = null;
    setMedia(previous => previous.map(item => item.localId === localId
      ? { ...item, uploading: true, failure: undefined, preparedPhoto: false } : item));
    try {
      prepared = await prepareUploadPhoto(source);
      variants = await prepareUploadWebpVariants(prepared, { small: 360, medium: 1440 });
      if (!mounted.current || !activePhotos.current.has(localId)) return;
      preparedPhotos.current.set(localId, variants);
      variants = null; // The composer now owns the variants until send/cancel.
      setMedia(previous => previous.map(item => item.localId === localId
        ? { ...item, uploading: false, preparedPhoto: true, failure: undefined } : item));
    } catch (cause) {
      reportClientError(new Error("CHAT2_PHOTO_PREPARE_FAILED"), {
        issueKey: "Chat2Room", keys: { operation: "photo_prepare", reason: photoFailureCode(cause) },
      });
      if (mounted.current && activePhotos.current.has(localId))
        setMedia(previous => previous.map(item => item.localId === localId
          ? { ...item, uploading: false, preparedPhoto: false,
            failure: photoRetryMessage(cause) } : item));
    } finally {
      prepared?.dispose();
      if (variants) for (const variant of Object.values(variants)) variant.dispose();
    }
  }
  function retryOnePhoto(localId: string) {
    if (uploading || pending) return;
    const item = media.find(value => value.localId === localId);
    if (!item?.sourcePhoto || !item.failure || item.preparedPhoto || item.uploading) return;
    setUploading(true);
    void prepareOnePhoto(localId, item.sourcePhoto).finally(() => {
      if (mounted.current) setUploading(false);
    });
  }
  async function prepareOneVideo(localId: string, source: ImagePicker.ImagePickerAsset) {
    // Encode only on selection. No reservation, attach or S3 write before Send.
    let prepared: PreparedUploadVideo720 | null = null;
    let failureCode: Video720Failure | undefined;
    setMedia(previous => previous.map(item => item.localId === localId
      ? { ...item, failure: undefined, uploading: true, preparedVideo: false } : item));
    try {
      prepared = await prepareUploadVideo720(source, undefined, undefined, code => {
        failureCode = code;
      });
      if (!prepared) throw new Error(failureCode ?? "VIDEO720_NATIVE_ERROR");
      const poster = await prepareVideoPosterWebp(prepared.uri);
      if (!mounted.current || !activeVideos.current.has(localId)) {
        poster.dispose();
        return;
      }
      preparedVideos.current.get(localId)?.dispose();
      preparedVideoPosters.current.get(localId)?.dispose();
      preparedVideos.current.set(localId, prepared);
      preparedVideoPosters.current.set(localId, poster);
      prepared = null; // The composer owns the encoded file and cover until send/cancel.
      setMedia(previous => previous.map(item => item.localId === localId
        ? { ...item, uploading: false, preparedVideo: true, failure: undefined } : item));
    } catch (cause) {
      reportClientError(new Error("CHAT2_VIDEO_PREPARE_FAILED"), {
        issueKey: "Chat2Room", keys: { operation: "video_prepare",
          reason: failureCode ?? "VIDEO720_NATIVE_ERROR" },
      });
      if (mounted.current && activeVideos.current.has(localId))
        setMedia(previous => previous.map(item => item.localId === localId
          ? { ...item, uploading: false, preparedVideo: false,
            failure: videoRetryMessage(cause) } : item));
    } finally { prepared?.dispose(); }
  }
  function retryOneVideo(localId: string) {
    if (uploading || pending) return;
    const item = media.find(value => value.localId === localId);
    if (!item?.sourceVideo || !item.failure || item.preparedVideo || item.attachment || item.uploading) return;
    setUploading(true);
    void prepareOneVideo(localId, item.sourceVideo).finally(() => {
      if (mounted.current) setUploading(false);
    });
  }
  async function pick(kind: "image" | "video" | "pdf") {
    if (pending || uploading) return;
    if (media.length >= 10) {
      Alert.alert("Лимит вложений", "В одном сообщении можно отправить не более 10 файлов.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      let asset: { uri: string; name: string; mime: string; size: number;
        width?: number; height?: number } | null = null;
      let previewUri: string | undefined;
      if (kind === "image" || kind === "video") {
        const selection = await pickMedia({
          mediaTypes: kind === "video" ? ["videos"] : ["images"],
          // Image bytes are encoded once by the shared JPEG 0.8 / 1920px path.
          quality: 1,
          ...(kind === "image" ? iosCompatiblePhotoPicker() : {}),
          allowsMultipleSelection: kind === "image",
          ...(kind === "image" ? { selectionLimit: 10 - media.length } : {}),
        });
        if (!selection.canceled && selection.assets[0]) {
          const f = selection.assets[0];
          if (kind === "image") {
            const photos = selection.assets.slice(0, 10 - media.length);
            const queued = photos.map(photo => ({ localId: Crypto.randomUUID(), photo }));
            for (const { localId } of queued) activePhotos.current.add(localId);
            setMedia(previous => [...previous, ...queued.map(({ localId, photo }) => ({
              localId, name: photo.fileName ?? "Фотография", uri: photo.uri,
              sourcePhoto: photo, uploading: true,
            }))]);
            // Process sequentially to avoid memory spikes from ten large originals.
            // No network upload happens until the user explicitly sends the message.
            for (const { localId, photo } of queued) await prepareOnePhoto(localId, photo);
            return;
          } else {
            const localId = Crypto.randomUUID();
            activeVideos.current.add(localId);
            setMedia(previous => [...previous, { localId,
              name: f.fileName ?? "Видео", uri: f.uri, sourceVideo: f, uploading: true }]);
            await prepareOneVideo(localId, f);
            return;
          }
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
      setMedia((previous) => [...previous, { localId, name: asset!.name,
        uri: previewUri ?? asset!.uri }]);
      try {
        const attachment = await chat2.upload(id, asset);
        if (mounted.current)
          setMedia((previous) =>
            previous.map((x) => (x.localId === localId ? { ...x, attachment } : x)),
          );
      } catch (e) {
        reportClientError(new Error("CHAT2_UPLOAD_FAILED"), {
          issueKey: "Chat2Room",
          keys: {
            operation: "upload",
            ...(e instanceof Chat2S3UploadError
              ? { httpStatus: String(e.status), s3Code: e.s3Code ?? "unknown" }
              : {}),
          },
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
    if (pending) return;
    activePhotos.current.delete(file.localId);
    activeVideos.current.delete(file.localId);
    preparedVideos.current.get(file.localId)?.dispose();
    preparedVideos.current.delete(file.localId);
    preparedVideoPosters.current.get(file.localId)?.dispose();
    preparedVideoPosters.current.delete(file.localId);
    const variants = preparedPhotos.current.get(file.localId);
    if (variants) for (const item of Object.values(variants)) item.dispose();
    preparedPhotos.current.delete(file.localId);
    setMedia((previous) => previous.filter((x) => x.localId !== file.localId));
    if (file.attachment)
      void chat2
        .discard(id, file.attachment.id)
        .catch(() => setError("Не удалось отменить вложение"));
  }
  async function send() {
    const submittedDraft = draftState.getSnapshot();
    const value = submittedDraft.trim();
    if ((!value && !media.length) || pending || sendingRef.current || uploading ||
      media.some(file => !file.attachment && !file.preparedPhoto && !file.preparedVideo)) return;
    sendingRef.current = true;
    setPending(true);
    setError("");
    try {
      // Create S3 objects only after the user explicitly tapped Send.
      // Previously completed attachments survive a failed send/retry.
      const confirmed = [...media];
      for (const [index, file] of confirmed.entries()) {
        if (file.attachment) continue;
        if (file.sourceVideo) {
          const prepared = preparedVideos.current.get(file.localId);
          const poster = preparedVideoPosters.current.get(file.localId);
          if (!prepared || !poster) throw new Error("Видео или обложка не готовы. Повторите подготовку.");
          try {
            const attachment = await chat2.upload(id, {
              uri: prepared.uri, name: "video-" + Crypto.randomUUID() + ".mp4",
              mime: prepared.mime, size: prepared.bytes, preparedPoster: poster,
            });
            confirmed[index] = { ...file, attachment, failure: undefined };
            if (mounted.current) setMedia(previous => previous.map(item =>
              item.localId === file.localId
                ? { ...item, attachment, failure: undefined } : item));
          } catch (cause) {
            reportClientError(new Error("CHAT2_VIDEO_UPLOAD_FAILED"), {
              issueKey: "Chat2Room", keys: { operation: "video_upload" },
            });
            if (mounted.current) setMedia(previous => previous.map(item =>
              item.localId === file.localId
                ? { ...item, failure: "Видео не отправилось. Проверьте интернет и нажмите «Отправить» ещё раз." }
                : item));
            throw cause;
          }
          continue;
        }
        if (!file.sourcePhoto) continue;
        const variants = preparedPhotos.current.get(file.localId);
        if (!variants) throw new Error("Фотография не готова. Подготовьте её повторно.");
        try {
          const attachment = await chat2.upload(id, {
            uri: variants.medium.uri, name: file.name, mime: "image/webp",
            size: variants.medium.bytes, width: variants.medium.width,
            height: variants.medium.height, preparedVariants: variants,
          });
          confirmed[index] = { ...file, attachment, failure: undefined };
          if (mounted.current) setMedia(previous => previous.map(item =>
            item.localId === file.localId
              ? { ...item, attachment, failure: undefined } : item));
        } catch (cause) {
          reportClientError(new Error("CHAT2_PHOTO_UPLOAD_FAILED"), {
            issueKey: "Chat2Room", keys: { operation: "photo_upload", reason: photoFailureCode(cause) },
          });
          if (mounted.current) setMedia(previous => previous.map(item =>
            item.localId === file.localId
              ? { ...item, failure: "Фото не отправилось. Проверьте соединение и нажмите «Отправить» ещё раз." }
              : item));
          throw cause;
        }
      }
      const attachmentIds = confirmed.flatMap(file => file.attachment ? [file.attachment.id] : []);
      if (editing) {
        await chat2.edit(id, editing.id, value);
      } else {
        const attempt = reserveChatSendAttempt(
          retry.current,
          { actorId: owner, conversationId: id, text: value, replyToId: reply?.id, attachmentIds },
          () => Crypto.randomUUID(),
        );
        retry.current = attempt;
        await chat2.send(id, value, attempt.clientMessageId, reply?.id, attachmentIds);
      }
      retry.current = null;
      if (draftState.getSnapshot() === submittedDraft) draftState.set("");
      setReply(null);
      setEditing(null);
      setMedia([]);
      activePhotos.current.clear();
      for (const variants of preparedPhotos.current.values())
        for (const item of Object.values(variants)) item.dispose();
      preparedPhotos.current.clear();
      activeVideos.current.clear();
      for (const prepared of preparedVideos.current.values()) prepared.dispose();
      preparedVideos.current.clear();
      for (const poster of preparedVideoPosters.current.values()) poster.dispose();
      preparedVideoPosters.current.clear();
      await refresh();
      listRef.current?.scrollToEnd({ animated: true });
    } catch (e) {
      reportClientError(new Error("CHAT2_SEND_FAILED"), {
        issueKey: "Chat2Room", keys: { operation: "send" },
      });
      setError(e instanceof Error ? e.message : "Сообщение не отправлено. Повторите.");
    } finally {
      sendingRef.current = false;
      setPending(false);
    }
  }
  const retry = useRef<ChatSendAttempt | null>(null);
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
    draftState.set(message.text);
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
        // Expo Android edge-to-edge does not resize the window for the IME.
        // Padding must be enabled on both platforms so the composer stays visible.
        behavior="padding"
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
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
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
                <SwipeReplyMessage enabled={!item.deletedAt} onReply={() => {
                  swipeReplyId.current = item.id;
                  // The gesture normally cancels Pressable; do not suppress a later real tap.
                  setTimeout(() => {
                    if (swipeReplyId.current === item.id) swipeReplyId.current = null;
                  }, 280);
                  replyTo(item);
                }}>
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
                        <NativeChat2Media key={file.id} conversationId={id} file={file}
                          images={imageAttachments} />
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
                </SwipeReplyMessage>
              </View>
            );
          }}
        />
        <Modal transparent visible={Boolean(actionMessage)} animationType="fade"
          onRequestClose={() => setActionMessage(null)}>
          <Pressable style={styles.actionBackdrop} onPress={() => setActionMessage(null)}>
            <Pressable style={styles.actionSheet} onPress={(event) => event.stopPropagation()}>
              <SwipeDismissHandle close={() => setActionMessage(null)} disabled={Boolean(reactingId)} />
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
                draftState.set("");
              }}
            >
              <Text style={styles.cancel}>×</Text>
            </Pressable>
          </View>
        )}
        {media.length > 0 && (
          <ScrollView style={styles.mediaPending} contentContainerStyle={styles.mediaPendingContent}
            keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={media.length > 2}>
            {media.map((file) => (
              <View key={file.localId} style={styles.mediaChip}>
                <View style={styles.mediaChipTop}>
                {file.sourcePhoto || file.attachment?.kind === "image" || file.uri.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                  <>
                  <Image
                    source={{ uri: file.uri }}
                    style={styles.mediaThumb}
                    resizeMode="contain"
                  />
                  {file.failure && file.sourcePhoto && !file.preparedPhoto && <Pressable accessibilityRole="button"
                    accessibilityLabel={`Повторить обработку фото ${file.name}`}
                    disabled={uploading || pending} onPress={() => retryOnePhoto(file.localId)}
                    style={{position:"absolute",left:4,top:4,width:44,height:44,
                      borderRadius:22,backgroundColor:"#17211def",borderWidth:1,
                      borderColor:"#ffffffae",alignItems:"center",justifyContent:"center"}}>
                    <MaterialCommunityIcons name="refresh" size={28} color="#fff" />
                  </Pressable>}
                  </>
                ) : file.sourceVideo || file.attachment?.kind === "video" || /\.mp4$/i.test(file.name) ? (
                  <View style={{ width: 52, height: 52, borderRadius: 12,
                    backgroundColor: "#25352c", alignItems: "center", justifyContent: "center" }}>
                    <MaterialCommunityIcons name="video-outline" size={27} color="#fff" />
                    {file.failure && file.sourceVideo && !file.preparedVideo && <Pressable accessibilityRole="button"
                      accessibilityLabel={`Повторить обработку видео ${file.name}`}
                      disabled={uploading || pending} onPress={() => retryOneVideo(file.localId)}
                      style={{ position: "absolute", width: 46, height: 46,
                        borderRadius: 23, borderWidth: 1, borderColor: "#fff8",
                        backgroundColor: "#17211def", alignItems: "center", justifyContent: "center" }}>
                      <MaterialCommunityIcons name="refresh" size={29} color="#fff" />
                    </Pressable>}
                  </View>
                ) : (
                  <Text>📄</Text>
                )}
                <Text numberOfLines={1} style={styles.mediaLabel}>
                  {file.name}
                </Text>
                <Pressable onPress={() => removeMedia(file)} disabled={pending}
                  accessibilityLabel="Удалить вложение">
                  <Text style={styles.mediaClose}>×</Text>
                </Pressable>
                </View>
                <Text style={styles.mediaSmall}>{file.attachment ? "Загружено" :
                  file.failure ? (file.preparedPhoto ? "Ошибка загрузки" : "Ошибка подготовки") :
                  file.preparedPhoto ? (pending ? "Загружаем после отправки…" :
                    "Готово к отправке") : "Подготавливаем на телефоне…"}</Text>
                {!!file.failure && <Text accessibilityRole="alert" style={styles.mediaFailure}>
                  {file.failure}
                </Text>}

              </View>
            ))}
          </ScrollView>
        )}
        <Chat2RoomComposer
          draftState={draftState}
          editing={Boolean(editing)}
          pending={pending}
          uploading={uploading}
          mediaCount={media.length}
          hasUnpreparedMedia={media.some(x => !x.attachment && !x.preparedPhoto && !x.preparedVideo)}
          onPick={(kind) => void pick(kind)}
          onSend={() => void send()}
        />
      </KeyboardAvoidingView>
    </TexturedSafeAreaView>
  );
}
