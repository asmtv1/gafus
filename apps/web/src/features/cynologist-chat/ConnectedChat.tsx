"use client";
import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ReplyIcon from "@mui/icons-material/Reply";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import SendIcon from "@mui/icons-material/Send";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckIcon from "@mui/icons-material/Check";
import {
  Chat,
  Channel,
  Window,
  MessageList,
  ComponentProvider,
  DateSeparator,
  type DateSeparatorProps,
  useCreateChatClient,
  Streami18n,
} from "stream-chat-react";
import type { CynologistChatStateDto, CynologistChatSessionDto } from "@gafus/consultation-shared";
import {
  CHAT_LIMITS,
  CHAT_ATTACHMENT_ACCEPT,
  chatAttachmentKind,
} from "@gafus/consultation-shared";
import { LoadingState } from "@/shared/components/ui/LoadingState";
import { reportClientError } from "@gafus/error-handling";
import { ChatQuotedReply } from "./ChatQuotedReply";
import { ChatReactionContext, ChatReactionList } from "./ChatReactions";
import { MessageManagementContext, GafusAvatar, GafusMessageUI } from "./ChatMessageUI";
import { chatApi } from "./api";
import styles from "./chat.module.css";
import "stream-chat-react/css/index.css";
const chatI18n = new Streami18n({ language: "ru" });

function ChatDateSeparator(props: DateSeparatorProps) {
  return (
    <DateSeparator
      {...props}
      formatDate={(date) =>
        date
          .toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
          .replace(/\s*г\.$/, "")
      }
    />
  );
}

export function ConnectedChat({
  state,
  session,
  refresh,
  chatId,
  community = false,
}: {
  state: Pick<CynologistChatStateDto, "canSend">;
  session: CynologistChatSessionDto;
  refresh: () => Promise<void>;
  chatId?: string;
  community?: boolean;
}) {
  const userData = useMemo(() => ({ id: session.userId }), [session.userId]);
  const tokenOrProvider = useCallback(
    async () =>
      (await chatApi<CynologistChatSessionDto>("session", { method: "POST", chatId, community }))
        .token,
    [chatId, community],
  );
  const client = useCreateChatClient({ apiKey: session.apiKey, userData, tokenOrProvider });
  const channel = useMemo(
    () => client?.channel(session.channelType, session.channelId),
    [client, session.channelType, session.channelId],
  );
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [reply, setReply] = useState<{ id: string; text: string; name: string } | null>(null);
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [retrying, setRetrying] = useState(false);
  const operation = useRef(false);
  useEffect(() => {
    const input = messageInputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(160, Math.max(48, input.scrollHeight))}px`;
  }, [text, state.canSend, editingId]);
  async function send() {
    if (operation.current || (!state.canSend && !editingId) || (!text.trim() && !files.length))
      return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      if (editingId) {
        await chatApi("message-actions", {
          method: "POST",
          chatId,
          community,
          body: { action: "edit", messageId: editingId, text },
        });
        setEditingId(null);
        setText("");
        setRetrying(false);
        return;
      }
      if (reply && channel?.getConfig()?.quotes !== true)
        throw new Error(
          "Ответы с цитатой пока недоступны: требуется обновление настроек чата. Ваш черновик сохранён.",
        );
      await chatApi("messages", {
        method: "POST",
        chatId,
        community,
        body: {
          clientMessageId: requestId,
          text,
          attachmentIds: files.map((f) => f.id),
          ...(reply ? { quotedMessageId: reply.id } : {}),
        },
      });
      setText("");
      setReply(null);
      setFiles([]);
      setRequestId(crypto.randomUUID());
      setRetrying(false);
    } catch (e) {
      reportClientError(e, { issueKey: "ChatPage", keys: { operation: "request" } });
      setRetrying(true);
      setError((e as Error).message);
      await refresh().catch(() => undefined);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function removeMessage(messageId: string) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      await chatApi("message-actions", {
        method: "POST",
        chatId,
        community,
        body: { action: "delete", messageId },
      });
      if (editingId === messageId) {
        setEditingId(null);
        setText("");
        setRetrying(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (
      operation.current ||
      retrying ||
      !state.canSend ||
      files.length >= CHAT_LIMITS.attachmentsPerMessage
    )
      return;
    const kind = chatAttachmentKind(file.type);
    if (!kind || file.size > (kind === "image" ? CHAT_LIMITS.imageBytes : CHAT_LIMITS.videoBytes)) {
      setError("Выберите фото до 10 МБ или видео до 100 МБ.");
      return;
    }
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await chatApi<{ id: string; name: string }>("attachments", {
        method: "POST",
        chatId,
        community,
        body,
      });
      setFiles((prev) => [...prev, result]);
    } catch (e) {
      reportClientError(e, { issueKey: "ChatPage", keys: { operation: "request" } });
      setError((e as Error).message);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  const reactionLock = useRef(false);
  const [reactionPending, setReactionPending] = useState(false);
  async function changeReaction(messageId: string, type: string, remove: boolean) {
    if (!state.canSend || reactionLock.current) return;
    reactionLock.current = true;
    setReactionPending(true);
    try {
      await chatApi("reactions", {
        method: "POST",
        chatId,
        community,
        body: { messageId, type, action: remove ? "remove" : "set" },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      reactionLock.current = false;
      setReactionPending(false);
    }
  }
  if (!client || !channel) return <LoadingState message="Подключение к диалогу…" />;
  return (
    <div className={styles.dialog}>
      <MessageManagementContext.Provider
        value={{
          userId: session.userId,
          disabled: busy || retrying,
          canReply: state.canSend && !busy && !retrying && !editingId,
          reply: (message) => {
            messageInputRef.current?.focus();
            setReply({
              id: message.id,
              text: message.text || "Фото или видео",
              name: message.user?.name || "Пользователь",
            });
          },
          edit: (id, value) => {
            if (files.length || text.trim()) {
              setError("Отправьте или очистите черновик перед редактированием.");
              return;
            }
            setReply(null);
            setEditingId(id);
            setText(value);
          },
          remove: (id) => {
            void removeMessage(id);
          },
        }}
      >
        <ChatReactionContext.Provider
          value={{
            enabled: state.canSend,
            pending: reactionPending,
            change: (id, type, remove) => {
              void changeReaction(id, type, remove);
            },
          }}
        >
          <Chat client={client} i18nInstance={chatI18n}>
            <ComponentProvider
              value={{
                DateSeparator: ChatDateSeparator,
                MessageUI: GafusMessageUI,
                QuotedMessage: ChatQuotedReply,
                MessageReactions: ChatReactionList,
                Avatar: GafusAvatar,
              }}
            >
              <Channel
                channel={channel}
                markReadOnMount={!community}
                doMarkReadRequest={community ? () => undefined : undefined}
              >
                <Window>
                  <MessageList
                    messageActions={[]}
                    maxTimeBetweenGroupedMessages={Number.MAX_SAFE_INTEGER}
                    formatDate={(date) =>
                      `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
                    }
                  />
                </Window>
              </Channel>
            </ComponentProvider>
          </Chat>
        </ChatReactionContext.Provider>
      </MessageManagementContext.Provider>
      {!state.canSend && !editingId ? (
        <p>
          {community ? (
            "Общий чат временно недоступен."
          ) : (
            <>
              История доступна. <Link href="/subscription">Продлите тариф</Link>, чтобы отправлять
              сообщения.
            </>
          )}
        </p>
      ) : (
        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          {reply && (
            <div className={styles.replyPreview}>
              <ReplyIcon />
              <div>
                <strong>{reply.name}</strong>
                <p>{reply.text}</p>
              </div>
              <button
                type="button"
                aria-label="Отменить ответ"
                disabled={busy || retrying}
                onClick={() => setReply(null)}
              >
                ×
              </button>
            </div>
          )}
          {editingId && (
            <div className={styles.replyPreview}>
              Редактирование сообщения{" "}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditingId(null);
                  setText("");
                  setRetrying(false);
                }}
              >
                Отменить
              </button>
            </div>
          )}
          {files.map((f) => (
            <span className={styles.attachmentDraft} key={f.id}>
              {f.name}{" "}
              <button
                type="button"
                aria-label={`Убрать ${f.name}`}
                disabled={busy || retrying}
                onClick={() => setFiles((old) => old.filter((file) => file.id !== f.id))}
              >
                ×
              </button>
            </span>
          ))}
          <div className={styles.composerRow}>
            <input
              ref={attachmentInputRef}
              className={styles.hiddenAttachmentInput}
              type="file"
              accept={CHAT_ATTACHMENT_ACCEPT}
              aria-label="Прикрепить фото или видео"
              disabled={
                busy ||
                retrying ||
                !!editingId ||
                files.length >= CHAT_LIMITS.attachmentsPerMessage ||
                !state.canSend
              }
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className={styles.composerIconButton}
              aria-label="Прикрепить фото или видео"
              title="Фото до 10 МБ · видео до 100 МБ и двух минут"
              disabled={
                busy ||
                retrying ||
                !!editingId ||
                files.length >= CHAT_LIMITS.attachmentsPerMessage ||
                !state.canSend
              }
              onClick={() => attachmentInputRef.current?.click()}
            >
              <AttachFileIcon />
            </button>
            <textarea
              ref={messageInputRef}
              aria-label="Сообщение"
              maxLength={CHAT_LIMITS.textLength}
              rows={1}
              placeholder="Напишите сообщение"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
              value={text}
              disabled={busy || retrying}
              onChange={(e) => {
                setText(e.target.value);
                void channel?.keystroke().catch(() => undefined);
              }}
            />
            <button
              type="submit"
              className={`${styles.composerIconButton} ${styles.sendButton}`}
              disabled={busy || (!text.trim() && !files.length)}
              aria-label={
                busy
                  ? "Отправка…"
                  : retrying
                    ? "Повторить отправку"
                    : editingId
                      ? "Сохранить"
                      : "Отправить"
              }
              title={retrying ? "Повторить отправку" : editingId ? "Сохранить" : "Отправить"}
            >
              {busy ? (
                <span className={styles.sendingSpinner} />
              ) : retrying ? (
                <RefreshIcon />
              ) : editingId ? (
                <CheckIcon />
              ) : (
                <SendIcon />
              )}
            </button>
          </div>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
