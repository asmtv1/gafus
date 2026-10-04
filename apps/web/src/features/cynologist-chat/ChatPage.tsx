"use client";

import { ChatQuotedReply } from "./ChatQuotedReply";
import { LoadingState } from "@/shared/components/ui/LoadingState";
import { reportClientError } from "@gafus/error-handling";
import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ReplyIcon from "@mui/icons-material/Reply";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import SendIcon from "@mui/icons-material/Send";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckIcon from "@mui/icons-material/Check";
import { useQuery } from "@tanstack/react-query";
import { getPublicProfileAction } from "@/shared/server-actions/user";
import {
  Chat,
  Channel,
  Window,
  MessageList,
  MessageUI,
  Avatar,
  ComponentProvider,
  useMessageContext,
  useCreateChatClient,
  Streami18n,
} from "stream-chat-react";
import type {
  CynologistChatStateDto,
  CynologistChatSessionDto,
  CynologistIntake,
} from "@gafus/consultation-shared";
import {
  cynologistIntakeSchema,
  INTAKE_FIELDS,
  CHAT_ROLE_LABELS,
  CHAT_REPLY_COPY,
  CHAT_HOURS_COPY,
} from "@gafus/consultation-shared";
import { PrimaryButton } from "@/shared/components/ui/PrimaryButton";
import { useChatResource } from "./useChatResource";
import { chatApi } from "./api";
import styles from "./chat.module.css";
import { ChatReactionContext, ChatReactionPicker, ChatReactionList } from "./ChatReactions";
import "stream-chat-react/css/index.css";

const chatI18n = new Streami18n({ language: "ru" });

const MessageManagementContext = createContext<{
  userId: string;
  disabled: boolean;
  edit: (id: string, text: string) => void;
  remove: (id: string) => void;
  reply: (message: { id: string; text?: string; user?: { name?: string } | null }) => void;
  canReply: boolean;
} | null>(null);

function useChatAuthorProfile(username?: string) {
  return useQuery({
    queryKey: ["chat-public-profile", username],
    enabled: !!username,
    staleTime: 60 * 1000,
    queryFn: () => getPublicProfileAction(username!),
  });
}
function GafusAvatar(props: React.ComponentProps<typeof Avatar>) {
  const router = useRouter();
  const { data } = useChatAuthorProfile(props.userName);
  return (
    <Avatar
      {...props}
      imageUrl={props.imageUrl || data?.profile?.avatarUrl || undefined}
      role={props.userName ? "link" : props.role}
      tabIndex={props.userName ? 0 : props.tabIndex}
      aria-label={props.userName ? `Открыть профиль ${props.userName}` : props["aria-label"]}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      style={{ ...props.style, cursor: props.userName ? "pointer" : props.style?.cursor }}
      onClick={(event) => {
        event.stopPropagation();
        if (props.userName) router.push(`/profile?username=${encodeURIComponent(props.userName)}`);
      }}
      onKeyDown={(event) => {
        if (props.userName && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.stopPropagation();
          router.push(`/profile?username=${encodeURIComponent(props.userName)}`);
        }
      }}
    />
  );
}

function GafusMessageUI(props: React.ComponentProps<typeof MessageUI>) {
  const { message, isMyMessage, groupStyles } = useMessageContext();
  const { data: authorProfile } = useChatAuthorProfile(message.user?.name);
  const authorRole =
    authorProfile?.role === "ADMIN"
      ? "admin"
      : authorProfile?.role === "TRAINER"
        ? "trainer"
        : authorProfile?.chatRole;
  const management = useContext(MessageManagementContext);
  const reactions = useContext(ChatReactionContext);
  const age = Date.now() - new Date(message.created_at ?? "").getTime();
  const own =
    !message.id.startsWith("intake-") &&
    message.user?.id === management?.userId &&
    message.type !== "deleted" &&
    message.type !== "system" &&
    age >= 0 &&
    age < 86400000;
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  function closeMenu() {
    setMenuPosition(null);
    previousFocus.current?.focus();
  }
  function openMenu(x: number, y: number) {
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMenuPosition({
      x: Math.max(8, Math.min(x, window.innerWidth - 248)),
      y: Math.max(8, Math.min(y, window.innerHeight - 360)),
    });
  }
  useEffect(() => {
    if (!menuPosition) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const fitMenu = () => {
      const rect = menuRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPosition((position) => {
        if (!position) return null;
        const x = Math.max(8, Math.min(position.x, window.innerWidth - rect.width - 8));
        const y = Math.max(8, Math.min(position.y, window.innerHeight - rect.height - 8));
        return x === position.x && y === position.y ? position : { x, y };
      });
    };
    const observer = new ResizeObserver(fitMenu);
    if (menuRef.current) observer.observe(menuRef.current);
    fitMenu();
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuPosition(null);
    };
    const closeOnScroll = () => setMenuPosition(null);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnScroll);
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnScroll);
    };
  }, [menuPosition]);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const canOpenMenu =
    message.type !== "deleted" &&
    message.type !== "system" &&
    Boolean(message.text || own || management?.canReply || reactions?.enabled) &&
    !management?.disabled;
  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );
  const cancelHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  return (
    <div
      className={styles.messageWrapper}
      onContextMenu={(event) => {
        if (canOpenMenu) {
          event.preventDefault();
          openMenu(event.clientX, event.clientY);
        }
      }}
      onDoubleClick={(event) => {
        if (
          !reactions?.enabled ||
          message.type === "deleted" ||
          message.type === "system" ||
          (event.target as HTMLElement).closest("button, a, input, textarea, video")
        )
          return;
        reactions.change(
          message.id,
          "like",
          message.own_reactions?.some((reaction) => reaction.type === "like") ?? false,
        );
      }}
      onPointerDown={(event) => {
        if (
          event.pointerType === "touch" &&
          canOpenMenu &&
          !(event.target as HTMLElement).closest("button, a, input, textarea, video")
        ) {
          cancelHold();
          swiped.current = false;
          const { clientX, clientY } = event;
          touchStart.current = { x: clientX, y: clientY };
          holdTimer.current = setTimeout(() => {
            touchStart.current = null;
            openMenu(clientX, clientY);
          }, 450);
        }
      }}
      onPointerUp={(event) => {
        cancelHold();
        const start = touchStart.current;
        touchStart.current = null;
        if (!start || !management?.canReply) return;
        const dx = event.clientX - start.x;
        const dy = Math.abs(event.clientY - start.y);
        if (dx > 60 && dx > dy * 1.5) {
          swiped.current = true;
          management.reply(message);
        }
      }}
      onPointerMove={(event) => {
        const start = touchStart.current;
        if (!start) return;
        if (Math.abs(event.clientX - start.x) > 10 || Math.abs(event.clientY - start.y) > 10)
          cancelHold();
        if (Math.abs(event.clientY - start.y) > 30) touchStart.current = null;
      }}
      onPointerCancel={() => {
        cancelHold();
        touchStart.current = null;
      }}
      onClickCapture={(event) => {
        if (swiped.current) {
          event.preventDefault();
          event.stopPropagation();
          swiped.current = false;
        }
      }}
    >
      {message.type !== "deleted" &&
        message.user?.name &&
        (!groupStyles?.length || groupStyles.includes("top") || groupStyles.includes("single")) && (
          <div
            className={styles.authorName}
            style={{ justifyContent: isMyMessage() ? "flex-end" : "flex-start" }}
          >
            <Link
              href={{ pathname: "/profile", query: { username: message.user.name } }}
              style={{ color: "inherit", textDecoration: "none" }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              {message.user.name}
            </Link>
            {!!authorRole && (
              <span className={styles.authorRole}>{CHAT_ROLE_LABELS[authorRole]}</span>
            )}
          </div>
        )}
      {canOpenMenu && (
        <button
          type="button"
          className={styles.messageMenuTrigger}
          aria-label="Действия с сообщением"
          aria-haspopup="menu"
          aria-expanded={menuPosition !== null}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            openMenu(rect.left, rect.bottom + 4);
          }}
        >
          <MoreHorizIcon fontSize="small" />
        </button>
      )}
      {menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.messageMenu}
            role="menu"
            aria-label="Действия с сообщением"
            style={{ left: menuPosition.x, top: menuPosition.y }}
            onKeyDown={(event) => {
              const buttons = Array.from(
                menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
              );
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                buttons[
                  (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length
                ]?.focus();
              }
            }}
          >
            <ChatReactionPicker close={closeMenu} />
            {management?.canReply && message.type !== "deleted" && message.type !== "system" && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu();
                  management.reply(message);
                }}
              >
                <ReplyIcon fontSize="small" />
                Ответить
              </button>
            )}
            {message.text && (
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(message.text!);
                    closeMenu();
                  } catch {
                    /* Leave the menu open if clipboard permission is unavailable. */
                  }
                }}
              >
                <ContentCopyIcon fontSize="small" />
                Копировать
              </button>
            )}
            {own && age < 900000 && (
              <button
                type="button"
                role="menuitem"
                disabled={management?.disabled}
                onClick={() => {
                  closeMenu();
                  management?.edit(message.id, message.text ?? "");
                }}
              >
                <EditOutlinedIcon fontSize="small" />
                Редактировать
              </button>
            )}
            {own && (
              <button
                type="button"
                role="menuitem"
                className={styles.deleteMessageAction}
                disabled={management?.disabled}
                onClick={() => {
                  closeMenu();
                  if (window.confirm("Удалить сообщение у всех участников чата?"))
                    management?.remove(message.id);
                }}
              >
                <DeleteOutlineIcon fontSize="small" />
                Удалить у всех
              </button>
            )}
          </div>,
          document.body,
        )}
      <MessageUI {...props} />
    </div>
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
    if (operation.current || retrying || !state.canSend || files.length >= 5) return;
    const image = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    const video = ["video/mp4", "video/quicktime"].includes(file.type);
    if ((!image && !video) || file.size > (image ? 10 : 100) * 1024 * 1024) {
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
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
              aria-label="Прикрепить фото или видео"
              disabled={busy || retrying || !!editingId || files.length >= 5 || !state.canSend}
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
              disabled={busy || retrying || !!editingId || files.length >= 5 || !state.canSend}
              onClick={() => attachmentInputRef.current?.click()}
            >
              <AttachFileIcon />
            </button>
            <textarea
              ref={messageInputRef}
              aria-label="Сообщение"
              maxLength={5000}
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
export default function ChatPage({ chatId }: { chatId?: string }) {
  const { accountId, state, session, error, setError, refresh } =
    useChatResource<CynologistChatStateDto>({ chatId });
  const [busy, setBusy] = useState(false);
  const startInFlight = useRef(false);
  const [intake, setIntake] = useState<Record<string, string>>({ petGender: "" });
  async function start() {
    if (startInFlight.current) return;
    const parsed = cynologistIntakeSchema.safeParse(state?.chat?.intake ?? intake);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    startInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await chatApi<CynologistChatStateDto>("start", {
        method: "POST",
        body: parsed.data as CynologistIntake,
      });
      await refresh();
    } catch (e) {
      reportClientError(e, { issueKey: "ChatPage", keys: { operation: "request" } });
      setError((e as Error).message);
    } finally {
      startInFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <main className={styles.page}>
      <h1>Чат с кинологом</h1>
      <p>{CHAT_REPLY_COPY}</p>
      <p>{CHAT_HOURS_COPY}</p>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void refresh()}>
            Повторить загрузку
          </button>
        </div>
      )}
      {!state && !error && <LoadingState message="Загрузка сообщений…" />}
      {state && !state.chat && !state.canUseCynologistChat && (
        <p>
          Чат входит в месячный и трёхмесячный тариф.{" "}
          <Link href="/subscription">Выбрать тариф</Link>
        </p>
      )}
      {state && !state.enabled && <p>Новые сообщения временно недоступны.</p>}
      {state &&
        state.canUseCynologistChat &&
        state.enabled &&
        (!state.chat || state.chat.provisionStatus !== "READY") && (
          <form
            className={styles.intake}
            onSubmit={(e) => {
              e.preventDefault();
              void start();
            }}
          >
            <p>Заполните анкету один раз. Она станет первым сообщением кинологу.</p>
            {!state.chat &&
              INTAKE_FIELDS.map(([key, label, max]) => (
                <label key={key}>
                  {label}
                  {key === "petGender" ? (
                    <select
                      required
                      value={intake[key] ?? ""}
                      onChange={(e) => setIntake({ ...intake, [key]: e.target.value })}
                    >
                      <option value="">Выберите пол</option>
                      <option value="MALE">Мальчик</option>
                      <option value="FEMALE">Девочка</option>
                    </select>
                  ) : (
                    <textarea
                      required
                      maxLength={max}
                      value={intake[key] ?? ""}
                      onChange={(e) => setIntake({ ...intake, [key]: e.target.value })}
                    />
                  )}
                </label>
              ))}
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? "Создание диалога…" : state.chat ? "Продолжить создание" : "Начать переписку"}
            </PrimaryButton>
          </form>
        )}
      {state && session && session.userId === `gafus-${accountId}` && (
        <ConnectedChat
          key={`${session.userId}:${session.channelId}`}
          state={state}
          session={session}
          refresh={refresh}
          chatId={chatId}
        />
      )}
      {state?.chat?.provisionStatus === "READY" && !session && !error && (
        <LoadingState message="Подключение…" />
      )}
    </main>
  );
}
