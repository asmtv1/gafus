import { Loading } from "../../shared/ui";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Chat2Composer } from "./Chat2Composer";
import { createChat2Draft } from "@gafus/core-client/chat2/draft";
import { CHAT2_EMOJIS, updateChat2ReactionSummary } from "./messageReactions";
import { reserveChatSendAttempt, type ChatSendAttempt } from "@gafus/core-client/chat2/send-attempt";
import { Centrifuge } from "centrifuge";
import { chat2SubscriptionForConnection, chat2SubscriptionTransportOptions } from "@gafus/core-client/chat2/realtime-subscription";
import { chat2Api, type Chat2Conversation, type Chat2Message, type Chat2Attachment, type Chat2BrowserPreparedPhoto } from "./chat2Api";
import css from "./Chat2Messenger.module.css";
import { videoRetryMessage } from "../../shared/media/videoRetryMessage";
import { photoRetryMessage } from "../../shared/media/photoRetryMessage";
import { prepareBrowserPhotoWebp } from "../../shared/media/browserPhotoWebp";
import { prepareBrowserVideo720 } from "../../shared/media/browserVideo720";
import { prepareBrowserVideoPoster } from "../../shared/media/browserVideoPoster";
import { errorText, roomName, Chat2Avatar, Chat2MessageAvatar, timestamp } from "./chat2Presentation";
import { Chat2RoomSettings } from "./Chat2RoomSettings";
import { Chat2StoredMedia } from "./Chat2StoredMedia";
export function Chat2Room({
  ownerId,
  id,
  room,
  onBack,
  onRefresh,
  initialDraft,
  onDraftChange,
}: {
  ownerId: string;
  id: string;
  room?: Chat2Conversation;
  onBack: () => void;
  onRefresh: () => void;
  initialDraft: string;
  onDraftChange: (value: string) => void;
}) {
  const cache = useQueryClient();
  const timeline = useQuery({
    queryKey: ["chat2", "messages", ownerId, id],
    queryFn: () => chat2Api.messages(id),
    retry: 1,
    refetchInterval: 12000,
  });
  const [older, setOlder] = useState<Chat2Message[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [draftState] = useState(() => createChat2Draft(initialDraft));
  const writeDraft = (value: string) => {
    draftState.set(value);
    onDraftChange(value);
  };
  const [pendingMedia, setPendingMedia] = useState<
    {
      localId: string;
      name: string;
      preview: string | null;
      kind: "image" | "video" | "file";
      file: File;
      attachment?: Chat2Attachment;
      failure?: string;
      uploading?: boolean;
      preparedPhoto?: boolean;
      preparedVideo?: { file: File; poster: File };
    }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const preparedPhotos = useRef(new Map<string, Chat2BrowserPreparedPhoto>());
  const activePhotos = useRef(new Set<string>());
  const sendInFlight = useRef(false);
  const [reply, setReply] = useState<Chat2Message | null>(null);
  const [reactionPickerId, setReactionPickerId] = useState<string | null>(null);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<"SPAM" | "ABUSE" | "OTHER">("SPAM");
  const [reportComment, setReportComment] = useState("");
  const [reportNotice, setReportNotice] = useState("");
  const pendingSend = useRef<ChatSendAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<Chat2Message | null>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "fallback">("connecting");
  const scroll = useRef<HTMLDivElement | null>(null);
  const bottom = useRef(true);
  const lastScrollTop = useRef(0);
  const olderRequest = useRef(false);
  const lastFetchedBefore = useRef<string | null>(null);
  const pendingScrollAnchor = useRef<{ top: number; height: number } | null>(null);
  const merged = useMemo(() => {
    const result = new Map<string, Chat2Message>();
    for (const msg of older) result.set(msg.id, msg);
    for (const msg of timeline.data ?? []) result.set(msg.id, msg);
    return [...result.values()].sort((a, b) => (BigInt(a.sequence) < BigInt(b.sequence) ? -1 : 1));
  }, [older, timeline.data]);
  async function react(messageId: string, emoji: string) {
    if (reactingId) return;
    setReactingId(messageId);
    setError("");
    try {
      const result = await chat2Api.react(id, messageId, emoji);
      // Keep paginated older messages in sync without reloading the entire room.
      setOlder((previous) =>
        previous.map((message) =>
          message.id === messageId
            ? {
                ...message,
                reactions: updateChat2ReactionSummary(message.reactions, emoji, result.active),
              }
            : message,
        ),
      );
      setReactionPickerId(null);
      await cache.invalidateQueries({ queryKey: ["chat2", "messages", ownerId, id] });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setReactingId(null);
    }
  }
  function replyTo(message: Chat2Message) {
    setReply(message);
    setEdit(null);
    setReactionPickerId(null);
    requestAnimationFrame(() =>
      document.querySelector<HTMLTextAreaElement>('[aria-label="Текст сообщения"]')?.focus(),
    );
  }
  // A single authorized socket for this active chat. HTTP polling is the fallback.
  useEffect(() => {
    let disposed = false;
    let socket: Centrifuge | undefined;
    async function connect() {
      try {
        const connection = await chat2Api.connect();
        if (disposed) return;
        const subscription = await chat2SubscriptionForConnection(connection, id);
        if (disposed) return;
        socket = new Centrifuge(connection.wsUrl, {
          token: connection.token,
          getToken: async () => (await chat2Api.connect()).token,
        });
        socket.on("connected", () => {
          if (!disposed) {
            // Connection alone does not grant room access; only subscribed does.
            void cache.invalidateQueries({ queryKey: ["chat2", "messages", ownerId, id] });
          }
        });
        socket.on("disconnected", () => {
          if (!disposed) setStatus("fallback");
        });
        // Proxy-only is authorized on every new subscribe/reconnect by Core
        // readGate in the internal broker callback. Never send a stale room JWT.
        const sub = socket.newSubscription(
          subscription.channel,
          chat2SubscriptionTransportOptions(subscription),
        );
        sub.on("publication", () => {
          if (!disposed) {
            void cache.invalidateQueries({ queryKey: ["chat2", "messages", ownerId, id] });
            void cache.invalidateQueries({ queryKey: ["chat2", "list", ownerId] });
          }
        });
        sub.on("subscribed", () => {
          if (!disposed) setStatus("live");
        });
        sub.on("unsubscribed", () => {
          if (!disposed) setStatus("fallback");
        });
        sub.on("error", () => {
          if (!disposed) setStatus("fallback");
        });
        sub.subscribe();
        socket.connect();
      } catch {
        if (!disposed) setStatus("fallback");
      }
    }
    void connect();
    return () => {
      disposed = true;
      socket?.disconnect();
    };
  }, [id, ownerId, cache]);
  // Historical messages are prepended without moving the item the reader was viewing.
  // Layout effects run after the DOM changes but before paint, preventing a visible jump.
  useLayoutEffect(() => {
    const anchor = pendingScrollAnchor.current;
    if (!anchor || !scroll.current) return;
    const el = scroll.current;
    el.scrollTop = anchor.top + el.scrollHeight - anchor.height;
    lastScrollTop.current = el.scrollTop;
    pendingScrollAnchor.current = null;
  }, [older]);
  useEffect(() => {
    if (timeline.isSuccess && older.length === 0 && (timeline.data?.length ?? 0) < 60) {
      setHasMore(false);
    }
  }, [timeline.isSuccess, timeline.data, older.length]);
  // Unsent drafts stay tied to this room. Keep them out of durable browser storage.
  const oldScroll = useRef<string | null>(null);
  useEffect(() => {
    if (scroll.current && bottom.current && oldScroll.current !== merged.at(-1)?.id) {
      scroll.current.scrollTop = scroll.current.scrollHeight;
      lastScrollTop.current = scroll.current.scrollTop;
    }
    oldScroll.current = merged.at(-1)?.id ?? null;
  }, [merged]);
  const newestSequence = merged.at(-1)?.sequence;
  useEffect(() => {
    if (!newestSequence || document.visibilityState !== "visible") return;
    void chat2Api
      .read(id, newestSequence)
      .then(onRefresh)
      .catch(() => {
        // The next focus or poll will retry this non-critical read marker.
        setStatus("fallback");
      });
  }, [id, newestSequence, onRefresh]);
  async function loadOlder() {
    // The ref locks synchronously: two scroll events in one render cannot fetch twice.
    if (
      olderRequest.current ||
      !hasMore ||
      !merged.length ||
      lastFetchedBefore.current === merged[0].sequence
    )
      return;
    olderRequest.current = true;
    setMoreLoading(true);
    setError("");
    try {
      const fetched = await chat2Api.messages(id, { before: merged[0].sequence });
      if (fetched.length < 60) setHasMore(false);
      const known = new Set(merged.map((message) => message.id));
      const unseen = fetched.filter((message) => !known.has(message.id));
      lastFetchedBefore.current = merged[0].sequence;
      if (!unseen.length) {
        setHasMore(false); // Avoid retrying a stale page forever.
        return;
      }
      const el = scroll.current;
      if (el) pendingScrollAnchor.current = { top: el.scrollTop, height: el.scrollHeight };
      setOlder((previous) => [...unseen, ...previous]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      olderRequest.current = false;
      setMoreLoading(false);
    }
  }
  // Never reserve server media on file selection. Browser produces two WebP copies now.
  async function preparePendingPhoto(localId: string, file: File) {
    setPendingMedia((previous) =>
      previous.map((item) =>
        item.localId === localId ? { ...item, uploading: true, failure: undefined } : item,
      ),
    );
    try {
      const prepared = await prepareBrowserPhotoWebp(file, { small: 360, medium: 1440 });
      if (!activePhotos.current.has(localId)) return;
      preparedPhotos.current.set(localId, prepared);
      setPendingMedia((previous) =>
        previous.map((item) =>
          item.localId === localId
            ? { ...item, uploading: false, preparedPhoto: true, failure: undefined }
            : item,
        ),
      );
    } catch (reason) {
      if (activePhotos.current.has(localId))
        setPendingMedia((previous) =>
          previous.map((item) =>
            item.localId === localId
              ? {
                  ...item,
                  uploading: false,
                  preparedPhoto: false,
                  failure: photoRetryMessage(reason),
                }
              : item,
          ),
        );
    }
  }
  useEffect(() => {
    const active = activePhotos.current;
    const prepared = preparedPhotos.current;
    return () => {
      active.clear();
      prepared.clear();
    };
  }, []);
  async function preparePendingVideo(localId: string, file: File) {
    // Only local H264/720p and one poster; never reserve or write S3 on selection.
    setPendingMedia((previous) =>
      previous.map((item) =>
        item.localId === localId ? { ...item, failure: undefined, uploading: true } : item,
      ),
    );
    try {
      const prepared = await prepareBrowserVideo720(file, undefined, true);
      const poster = await prepareBrowserVideoPoster(prepared);
      setPendingMedia((previous) =>
        previous.map((item) =>
          item.localId === localId
            ? {
                ...item,
                preparedVideo: { file: prepared, poster },
                uploading: false,
                failure: undefined,
              }
            : item,
        ),
      );
    } catch (reason) {
      setPendingMedia((previous) =>
        previous.map((item) =>
          item.localId === localId
            ? { ...item, uploading: false, failure: videoRetryMessage(reason) }
            : item,
        ),
      );
    }
  }
  async function uploadPendingFile(
    localId: string,
    file: File,
    preparedVideo?: { file: File; poster: File },
  ) {
    setPendingMedia((previous) =>
      previous.map((item) =>
        item.localId === localId ? { ...item, failure: undefined, uploading: true } : item,
      ),
    );
    try {
      const attachment = await chat2Api.upload(
        id,
        file,
        preparedPhotos.current.get(localId),
        preparedVideo,
      );
      setPendingMedia((previous) =>
        previous.map((item) =>
          item.localId === localId
            ? { ...item, attachment, uploading: false, failure: undefined }
            : item,
        ),
      );
      return attachment;
    } catch (reason) {
      setPendingMedia((previous) =>
        previous.map((item) =>
          item.localId === localId
            ? {
                ...item,
                uploading: false,
                failure:
                  item.kind === "video"
                    ? videoRetryMessage(reason)
                    : item.kind === "image"
                      ? photoRetryMessage(reason)
                      : errorText(reason),
              }
            : item,
        ),
      );
      throw reason;
    }
  }
  async function selectFiles(files: FileList | null) {
    if (!files || uploading || busy) return;
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files).slice(0, 8 - pendingMedia.length)) {
        const localId = crypto.randomUUID();
        const kind = file.type.startsWith("image/")
          ? "image"
          : file.type.startsWith("video/")
            ? "video"
            : "file";
        const preview = kind !== "file" ? URL.createObjectURL(file) : null;
        setPendingMedia((previous) => [
          ...previous,
          { localId, name: file.name, preview, kind, file, uploading: true },
        ]);
        if (kind === "image") {
          activePhotos.current.add(localId);
          await preparePendingPhoto(localId, file);
        } else if (kind === "video") {
          await preparePendingVideo(localId, file);
        } else await uploadPendingFile(localId, file).catch(() => undefined);
      }
    } finally {
      setUploading(false);
    }
  }
  function retryPendingFile(localId: string) {
    if (uploading || busy) return;
    const target = pendingMedia.find((item) => item.localId === localId);
    if (!target || !target.failure || target.attachment || target.uploading) return;
    setUploading(true);
    const retry =
      target.kind === "image" && !target.preparedPhoto
        ? preparePendingPhoto(localId, target.file)
        : target.kind === "video" && !target.preparedVideo
          ? preparePendingVideo(localId, target.file)
          : uploadPendingFile(localId, target.file, target.preparedVideo);
    void retry.catch(() => undefined).finally(() => setUploading(false));
  }
  function removeMedia(media: {
    localId: string;
    preview: string | null;
    attachment?: Chat2Attachment;
  }) {
    if (busy) return;
    activePhotos.current.delete(media.localId);
    preparedPhotos.current.delete(media.localId);
    if (media.preview) URL.revokeObjectURL(media.preview);
    setPendingMedia((previous) => previous.filter((x) => x.localId !== media.localId));
    if (media.attachment)
      void chat2Api
        .discard(id, media.attachment.id)
        .catch(() => setError("Не удалось отменить загрузку"));
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    const submittedDraft = draftState.getSnapshot();
    const text = submittedDraft.trim();
    if (
      (!text && !pendingMedia.length) ||
      busy ||
      sendInFlight.current ||
      uploading ||
      pendingMedia.some((x) => !x.attachment && !x.preparedPhoto && !x.preparedVideo)
    )
      return;
    sendInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const confirmed = [...pendingMedia];
      for (const [index, item] of confirmed.entries()) {
        if (item.attachment) continue;
        if (item.kind === "video") {
          if (!item.preparedVideo) throw Error("Видео ещё не готово. Повторите подготовку.");
          try {
            const attachment = await uploadPendingFile(item.localId, item.file, item.preparedVideo);
            confirmed[index] = { ...item, attachment, failure: undefined };
          } catch {
            throw Error("Видео не отправилось. Проверьте интернет и нажмите «Отправить» ещё раз.");
          }
          continue;
        }
        if (item.kind !== "image") continue;
        const prepared = preparedPhotos.current.get(item.localId);
        if (!prepared) throw Error("Фото ещё не подготовлено. Повторите подготовку.");
        try {
          // Upload to S3 only after Send, using previously prepared WebP bytes.
          const attachment = await chat2Api.upload(id, item.file, prepared);
          confirmed[index] = { ...item, attachment, failure: undefined };
          setPendingMedia((previous) =>
            previous.map((file) =>
              file.localId === item.localId ? { ...file, attachment, failure: undefined } : file,
            ),
          );
        } catch (reason) {
          setPendingMedia((previous) =>
            previous.map((file) =>
              file.localId === item.localId
                ? { ...file, failure: photoRetryMessage(reason) }
                : file,
            ),
          );
          throw Error("Фото не загрузилось. Проверьте интернет и нажмите «Отправить» ещё раз.");
        }
      }
      const attachmentIds = confirmed.flatMap((item) =>
        item.attachment ? [item.attachment.id] : [],
      );
      const quoted = reply?.id;
      const attempt = reserveChatSendAttempt(
        pendingSend.current,
        { actorId: ownerId, conversationId: id, text, replyToId: quoted, attachmentIds },
        () => crypto.randomUUID(),
      );
      pendingSend.current = attempt;
      const clientMessageId = attempt.clientMessageId;
      await chat2Api.send(id, {
        text,
        clientMessageId,
        attachmentIds,
        ...(quoted ? { replyToId: quoted } : {}),
      });
      for (const media of pendingMedia) if (media.preview) URL.revokeObjectURL(media.preview);
      pendingSend.current = null;
      activePhotos.current.clear();
      preparedPhotos.current.clear();
      setPendingMedia([]);
      if (draftState.getSnapshot() === submittedDraft) writeDraft("");
      setReply(null);
      bottom.current = true;
      await cache.invalidateQueries({ queryKey: ["chat2", "messages", ownerId, id] });
      onRefresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      sendInFlight.current = false;
      setBusy(false);
    }
  }
  async function editOwn(e: FormEvent) {
    e.preventDefault();
    const submittedDraft = draftState.getSnapshot();
    if (!edit || busy || !submittedDraft.trim()) return;
    setBusy(true);
    setError("");
    try {
      await chat2Api.edit(id, edit.id, submittedDraft.trim());
      setEdit(null);
      if (draftState.getSnapshot() === submittedDraft) writeDraft("");
      await cache.invalidateQueries({ queryKey: ["chat2", "messages", ownerId, id] });
      onRefresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function submitReport(e: FormEvent, messageId: string) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setReportNotice("");
    try {
      await chat2Api.report(id, messageId, { reason: reportReason, comment: reportComment.trim() });
      setReportingId(null);
      setReportComment("");
      setReportNotice("Жалоба отправлена модераторам.");
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function deleteOwn(messageId: string) {
    if (busy || !window.confirm("Удалить сообщение?")) return;
    setBusy(true);
    setError("");
    try {
      await chat2Api.remove(id, messageId);
      await cache.invalidateQueries({ queryKey: ["chat2", "messages", ownerId, id] });
      onRefresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const title = room ? roomName(room, ownerId) : "Переписка";
  const members = new Map(room?.members.map((m) => [m.userId, m]) ?? []);
  return (
    <>
      <header className={css.roomHeader}>
        <button
          className={css.roomBack}
          type="button"
          aria-label="Назад к сообщениям"
          onClick={onBack}
        >
          ←
        </button>
        <Chat2Avatar room={room} ownerId={ownerId} />
        <div className={css.roomHeading}>
          <strong>{title}</strong>
          <span>
            {room?.members.length ?? 0} участников ·{" "}
            {status === "live" ? "онлайн" : "синхронизация"}
          </span>
        </div>
        <button
          title="Обновить переписку"
          type="button"
          aria-label="Обновить"
          onClick={() => void timeline.refetch()}
        >
          ↻
        </button>
        {room && (
          <details className={css.infoDropdown}>
            <summary title="Участники и настройки чата" aria-label="Настройки чата">
              ⋯
            </summary>
            <Chat2RoomSettings
              key={id}
              id={id}
              me={ownerId}
              info={room}
              onRefresh={onRefresh}
              onExit={onBack}
            />
          </details>
        )}
      </header>
      {reportNotice && (
        <p className={css.note} role="status">
          {reportNotice}
        </p>
      )}
      {timeline.isLoading && (
        <p className={css.note} role="status">
          Получаем сообщения…
        </p>
      )}
      {timeline.isError && (
        <div className={css.note} role="alert">
          Не удалось загрузить историю.{" "}
          <button onClick={() => void timeline.refetch()}>Повторить</button>
        </div>
      )}
      <div
        className={css.messages}
        ref={scroll}
        onScroll={(e) => {
          const el = e.currentTarget;
          bottom.current = el.scrollHeight - el.clientHeight - el.scrollTop < 100;
          const movingUp = el.scrollTop < lastScrollTop.current - 1;
          lastScrollTop.current = el.scrollTop;
          // Do not page on initial layout, programmatic scroll or the unread stream.
          if (movingUp && el.scrollTop <= 140 && el.scrollHeight > el.clientHeight + 40) {
            void loadOlder();
          }
        }}
        aria-live="polite"
      >
        {moreLoading && (
          <Loading variant="compact" className={css.historyLoading} message="Загружаем историю…" />
        )}
        {timeline.isSuccess && merged.length === 0 && (
          <div className={css.empty}>
            <span>🐶</span>
            <p>Здесь пока нет сообщений. Начните разговор!</p>
          </div>
        )}
        {merged.map((m, i) => {
          const own = m.authorId === ownerId;
          const previous = merged[i - 1];
          const date = new Date(m.createdAt).toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          });
          const previousDate =
            previous &&
            new Date(previous.createdAt).toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            });
          const quoted = m.replyToId ? merged.find((x) => x.id === m.replyToId) : null;
          return (
            <div key={m.id}>
              {date !== previousDate && <div className={css.date}>{date}</div>}
              <div className={`${css.message} ${own ? css.own : ""}`}>
                {!own && <Chat2MessageAvatar avatarUrl={members.get(m.authorId)?.avatarUrl} />}
                <div
                  className={css.bubble}
                  onContextMenu={(event) => {
                    if (m.deletedAt) return;
                    event.preventDefault();
                    setReactionPickerId(m.id);
                  }}
                >
                  {!own && room?.kind !== "DIRECT" && (
                    <b className={css.author}>{members.get(m.authorId)?.username ?? "Участник"}</b>
                  )}
                  {quoted && (
                    <div className={css.quote}>
                      ↳ {quoted.deletedAt ? "Сообщение удалено" : quoted.text.slice(0, 110)}
                    </div>
                  )}
                  <div className={css.bodyText}>
                    {m.deletedAt ? <em>Сообщение удалено</em> : m.text}
                  </div>
                  {!m.deletedAt &&
                    (m.attachments ?? []).map((file) => (
                      <Chat2StoredMedia key={file.id} chatId={id} file={file} />
                    ))}
                  <div className={css.bubbleBottom}>
                    <time>{timestamp(m.createdAt)}</time>
                    {m.editedAt && !m.deletedAt && <small>изм.</small>}
                  </div>
                  {!m.deletedAt && Boolean(m.reactions?.length) && (
                    <div className={css.reactionBadges} aria-label="Реакции на сообщение">
                      {m.reactions?.map((reaction) => (
                        <button
                          type="button"
                          key={reaction.emoji}
                          className={reaction.mine ? css.reactionMine : ""}
                          disabled={Boolean(reactingId)}
                          aria-label={`${reaction.emoji}, ${reaction.count}, ${reaction.mine ? "убрать мою реакцию" : "поставить реакцию"}`}
                          onClick={() => void react(m.id, reaction.emoji)}
                        >
                          {reaction.emoji} <span>{reaction.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!m.deletedAt && (
                    <div className={css.messageActions}>
                      <button
                        type="button"
                        aria-label="Ответить на сообщение"
                        title="Ответить на сообщение"
                        onClick={() => replyTo(m)}
                      >
                        ↩ Ответить
                      </button>
                      <button
                        type="button"
                        title="Поставить реакцию"
                        aria-label="Поставить реакцию на сообщение"
                        onClick={() =>
                          setReactionPickerId((current) => (current === m.id ? null : m.id))
                        }
                      >
                        ☺ Реакция
                      </button>
                      {!own && (
                        <button
                          type="button"
                          onClick={() => {
                            setReportingId(m.id);
                            setReportReason("SPAM");
                            setReportComment("");
                            setReportNotice("");
                          }}
                        >
                          Пожаловаться
                        </button>
                      )}
                      {own && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              writeDraft(m.text);
                              setEdit(m);
                              setReply(null);
                            }}
                          >
                            Изменить
                          </button>
                          <button type="button" onClick={() => void deleteOwn(m.id)}>
                            Удалить
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {reactionPickerId === m.id && !m.deletedAt && (
                    <div className={css.reactionPicker} aria-label="Выбор реакции">
                      {CHAT2_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          disabled={Boolean(reactingId)}
                          aria-label={`Поставить реакцию ${emoji}`}
                          onClick={() => void react(m.id, emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        type="button"
                        aria-label="Закрыть реакции"
                        onClick={() => setReactionPickerId(null)}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {!own && reportingId === m.id && !m.deletedAt && (
                    <form className={css.reportForm} onSubmit={(e) => void submitReport(e, m.id)}>
                      <strong>Жалоба на сообщение</strong>
                      <label>
                        Причина
                        <select
                          value={reportReason}
                          onChange={(e) => setReportReason(e.target.value as typeof reportReason)}
                        >
                          <option value="SPAM">Спам</option>
                          <option value="ABUSE">Оскорбления или травля</option>
                          <option value="OTHER">Другое нарушение</option>
                        </select>
                      </label>
                      <label>
                        Комментарий (необязательно)
                        <textarea
                          rows={2}
                          maxLength={500}
                          value={reportComment}
                          onChange={(e) => setReportComment(e.target.value)}
                        />
                      </label>
                      <div>
                        <button type="submit" disabled={busy}>
                          Отправить
                        </button>
                        <button type="button" onClick={() => setReportingId(null)}>
                          Отмена
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className={css.composerWrap}>
        {(reply || edit) && (
          <div className={css.reply}>
            ↳ {edit ? "Редактирование" : `Ответ на: ${reply?.text.slice(0, 90)}`}
            <button
              type="button"
              aria-label="Отменить"
              onClick={() => {
                setReply(null);
                setEdit(null);
                writeDraft("");
              }}
            >
              ×
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className={css.error}>
            {error}
          </p>
        )}
        {pendingMedia.length > 0 && (
          <div className={css.pendingMedia} aria-label="Вложения">
            {pendingMedia.map((item) => (
              <div className={css.pendingFile} key={item.localId}>
                <div className={css.pendingFileMedia}>
                  {item.preview && item.kind === "image" ? (
                    <img src={item.preview} alt={item.name} />
                  ) : item.preview && item.kind === "video" ? (
                    <video
                      src={item.preview}
                      muted
                      playsInline
                      preload="metadata"
                      aria-label={item.name}
                    />
                  ) : (
                    <span>📄</span>
                  )}
                  {item.failure && (item.kind === "video" || item.kind === "image") && (
                    <button
                      type="button"
                      className={css.retryVideoOverlay}
                      aria-label={`Повторить обработку ${item.kind === "image" ? "фото" : "видео"} ${item.name}`}
                      title={`Повторить подготовку и загрузку только этого ${item.kind === "image" ? "фото" : "видео"}`}
                      disabled={busy || uploading}
                      onClick={() => retryPendingFile(item.localId)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 11a8 8 0 1 0-2.3 6M20 4v7h-7" />
                      </svg>
                    </button>
                  )}
                </div>
                <span>{item.name}</span>
                <small>
                  {item.attachment
                    ? "Загружено"
                    : item.failure
                      ? "Ошибка"
                      : item.preparedPhoto || item.preparedVideo
                        ? "Готово к отправке"
                        : item.kind === "image"
                          ? "Подготавливаем на устройстве…"
                          : item.kind === "video"
                            ? "Подготавливаем видео на устройстве…"
                            : "Загружаем файл…"}
                </small>
                {item.failure && (
                  <small role="alert" className={css.pendingFileError}>
                    {item.failure}
                  </small>
                )}
                <button
                  type="button"
                  aria-label={`Удалить ${item.name}`}
                  onClick={() => removeMedia(item)}
                  disabled={busy}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <Chat2Composer
          draftState={draftState}
          onDraftChange={writeDraft}
          onSubmit={(e) => void (edit ? editOwn(e) : send(e))}
          onFiles={(files) => void selectFiles(files)}
          editing={Boolean(edit)}
          busy={busy}
          uploading={uploading}
          mediaCount={pendingMedia.length}
          hasUnpreparedMedia={pendingMedia.some(
            (x) => !x.attachment && !x.preparedPhoto && !x.preparedVideo,
          )}
        />
      </div>
    </>
  );
}
