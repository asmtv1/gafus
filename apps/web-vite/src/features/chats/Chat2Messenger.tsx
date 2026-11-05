import { sameOriginCdnProbeFetch } from "../../shared/api/cdnProbe";
import { Loading } from "../../shared/ui";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { CHAT2_EMOJIS, updateChat2ReactionSummary } from "./messageReactions";
import { Centrifuge } from "centrifuge";
import { chat2SubscriptionForConnection, chat2SubscriptionTransportOptions } from "@gafus/core-client/chat2/realtime-subscription";
import { useCurrentUser } from "../../shared/auth/useAuth";
import { GafusHeader } from "../../brand/GafusHeader";
import { RouteLink, navigate, useRoutePath, useRouteSearch } from "../../shared/router/location";
import { BackButton, CaramelButton, PrimaryButton } from "../../shared/ui";
import {
  chat2Api,
  type Chat2Conversation,
  type Chat2Message,
  type Chat2Kind,
  type Chat2Attachment,
  type Chat2Member,
} from "./chat2Api";
import { Chat2ReportQueue } from "./Chat2ReportQueue";
import { Chat2StaffQueue } from "./Chat2StaffQueue";
import css from "./Chat2Messenger.module.css";
import { VideoQualitySettings } from "../../shared/media/VideoQualitySettings";
import { webMp4Hints, observeWebMp4Start, savedWebMp4Mode, saveWebMp4Mode } from "../../shared/media/videoPlaybackPolicy";
import { reportWebVideoStarted } from "../../shared/media/videoQualityTelemetry";
import { videoRetryMessage, videoServerFailureMessage } from "../../shared/media/videoRetryMessage";
import { photoRetryMessage } from "../../shared/media/photoRetryMessage";
import {
  chat2ImageSource, chat2VideoSource, chat2HasVideoQuality,
  chat2MatchedS3Variant, chat2CdnS3FailoverAllowed,
  type Chat2QualityMode, type Chat2MediaRenditions, type Chat2VideoHints,
} from "@gafus/chat-media-quality";
import { publicImageUrl } from "../profile/publicProfileApi";
import { isolatedNonprodBrowserS3Url } from "../../shared/api/client";

const timestamp = (raw: string) =>
  new Date(raw).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const kindLabel: Record<Chat2Kind, string> = {
  DIRECT: "Личный",
  CYNOLOGIST: "Кинолог",
  COMMUNITY: "Общий",
  COURSE: "Курс",
  COURSE_TOPIC: "Курс",
  CITY: "Город",
  BREED: "Порода",
  GROUP: "Группа",
};
const kindEmoji: Record<Chat2Kind, string> = {
  DIRECT: "👤",
  CYNOLOGIST: "🐕",
  COMMUNITY: "🐾",
  COURSE: "🎓",
  COURSE_TOPIC: "📚",
  CITY: "🏙️",
  BREED: "🐶",
  GROUP: "👥",
};
const roomName = (room: Pick<Chat2Conversation, "kind" | "name" | "members">, me: string) =>
  room.name ||
  (room.kind === "CYNOLOGIST"
    ? "Чат с кинологом"
    : room.kind === "DIRECT"
      ? room.members.find((m) => m.userId !== me)?.username || "Личная переписка"
      : "Сообщество");
const roomPath = (id: string) => `/chats/${id}` as const;
/** Only a room-scoped signed Refactor image URL may bypass the public avatar filter. */
function chat2ImageUrl(raw: string | null): string | null {
  if (!raw) return null;
  if (isolatedNonprodBrowserS3Url(raw, "documents", "signed-get")) {
    const url = new URL(raw);
    if (
      /^\/gafus-refactor-documents-test\/chat2\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/.test(
        url.pathname,
      )
    )
      return url.href;
  }
  return publicImageUrl(raw);
}
/** Direct chats show the other participant's photo; groups show the room avatar. */
function Chat2Avatar({
  room,
  ownerId,
}: {
  room: Pick<Chat2Conversation, "kind" | "members" | "avatarUrl"> | undefined;
  ownerId: string;
}) {
  const raw =
    room && (room.kind === "DIRECT" || room.kind === "CYNOLOGIST")
      ? (room.members.find((member) => member.userId !== ownerId)?.avatarUrl ?? null)
      : (room?.avatarUrl ?? null);
  const url = chat2ImageUrl(raw);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <span className={css.avatar}>
      {url && !failed ? (
        <img
          className={css.avatarImage}
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : room ? (
        kindEmoji[room.kind]
      ) : (
        "💬"
      )}
    </span>
  );
}
/** Show the actual author's profile photo in message threads, with a safe fallback. */
function Chat2MessageAvatar({ avatarUrl }: { avatarUrl?: string | null }) {
  const src = chat2ImageUrl(avatarUrl ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <span className={css.miniAvatar} aria-hidden="true">
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : "👤"}
    </span>
  );
}

/** Consistent, decorative line icons for chat navigation shortcuts. */
function ChatShortcutIcon({
  kind,
}: {
  kind: "moderation" | "cynologist" | "courses" | "discover";
}) {
  return (
    <span className={css.shortcutIcon} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
        aria-hidden="true"
      >
        {kind === "moderation" && (
          <>
            <path d="M5 21V5m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0" />
          </>
        )}
        {kind === "cynologist" && (
          <>
            <path d="m5 16 2-5 4-2 2-4 3 2 3 5-1 6h-4l-1-3-4 3H5Z" />
            <circle cx="15.5" cy="10.5" r=".7" fill="currentColor" stroke="none" />
          </>
        )}
        {kind === "courses" && (
          <>
            <path d="m2 10 10-6 10 6-10 6-10-6ZM6 12.5V17c4 3 8 3 12 0v-4.5M22 10v7" />
          </>
        )}
        {kind === "discover" && (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
          </>
        )}
      </svg>
    </span>
  );
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Операция не выполнена");

/** Shared accessible avatar picker: the actual file input stays keyboard focusable but invisible. */
function Chat2GroupAvatarEditor({
  src,
  onSelect,
  onRemove,
  onInvalid,
  disabled = false,
}: {
  src: string | null;
  onSelect: (file: File) => void;
  onRemove?: () => void;
  onInvalid: (message: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={css.avatarEditor}>
      <label className={css.avatarPicker}>
        <input
          className={css.avatarFileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label={src ? "Заменить аватарку группы" : "Добавить аватарку группы"}
          disabled={disabled}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            if (
              !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
              file.size < 10 ||
              file.size > 5 * 1024 * 1024
            ) {
              onInvalid("Аватарка: JPG, PNG или WebP до 5 МБ");
              return;
            }
            onSelect(file);
          }}
        />
        <span className={css.avatarPreview} aria-hidden="true">
          {src ? <img src={src} alt="" /> : "👥"}
          <span className={css.avatarCamera}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 7h4l2-2h4l2 2h4v12H4V7Z" />
              <circle cx="12" cy="13" r="3.25" />
            </svg>
          </span>
        </span>
        <span className={css.avatarCopy}>
          <strong>Фото группы</strong>
          <span>{src ? "Заменить фотографию" : "Добавить фотографию"}</span>
          <small>Необязательно · JPG, PNG, WebP · до 5 МБ</small>
        </span>
      </label>
      {onRemove && (
        <button type="button" className={css.avatarRemove} disabled={disabled} onClick={onRemove}>
          Удалить фото
        </button>
      )}
    </div>
  );
}

/** One user-specific Web messenger UI, independent of legacy Stream widgets. */
export function Chat2Messenger() {
  const identity = useCurrentUser();
  return (
    <div className={`gafus-app ${css.appViewport}`}>
      <GafusHeader authenticated={Boolean(identity.data?.id)} role={identity.data?.role} />
      {!identity.data?.id ? (
        <main className="shell">
          <p role="alert">Для просмотра сообщений войдите в GAFUS.</p>
          <RouteLink to="/login">Войти</RouteLink>
        </main>
      ) : (
        <Chat2Owned
          key={`${identity.data.id}:${identity.data.role}`}
          ownerId={identity.data.id}
          staff={identity.data.role === "ADMIN" || identity.data.role === "MODERATOR"}
          trainer={identity.data.role === "TRAINER"}
        />
      )}
    </div>
  );
}
function Chat2Owned({
  ownerId,
  staff,
  trainer,
}: {
  ownerId: string;
  staff: boolean;
  trainer: boolean;
}) {
  const route = useRoutePath();
  const routeSearch = useRouteSearch();
  const chosen = route?.startsWith("/chats/") ? route.slice("/chats/".length) : null;
  const cache = useQueryClient();
  const drafts = useRef(new Map<string, string>());
  const refreshList = useCallback(() => {
    void cache.invalidateQueries({ queryKey: ["chat2", "list", ownerId] });
  }, [cache, ownerId]);
  const [tab, setTab] = useState<"all" | "direct" | "group" | "unread" | "cynologist">("all");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<
    "list" | "users" | "create" | "discover" | "courses" | "moderation"
  >("list");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [createAvatar, setCreateAvatar] = useState<File | null>(null);
  const [createAvatarPreview, setCreateAvatarPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!createAvatar) {
      setCreateAvatarPreview(null);
      return;
    }
    const url = URL.createObjectURL(createAvatar);
    setCreateAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [createAvatar]);
  const [description, setDescription] = useState("");
  const [groupKind, setGroupKind] = useState<"GROUP" | "CITY" | "BREED" | "COURSE_TOPIC">("GROUP");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = useQuery({
    queryKey: ["chat2", "list", ownerId],
    queryFn: chat2Api.list,
    retry: 1,
    refetchInterval: 15000,
  });
  const detail = useQuery({
    queryKey: ["chat2", "detail", ownerId, chosen],
    queryFn: () => chat2Api.detail(chosen!),
    enabled: !!chosen,
    retry: false,
    refetchInterval: 8 * 60 * 1000,
  });
  const room = useMemo(
    () => (chosen ? (list.data?.find((x) => x.id === chosen) ?? detail.data) : undefined),
    [chosen, list.data, detail.data],
  );
  const users = useQuery({
    queryKey: ["chat2", "users", ownerId, peopleSearch],
    queryFn: () => chat2Api.users(peopleSearch.trim()),
    enabled: mode === "users" && peopleSearch.trim().length >= 2,
    retry: false,
  });
  const discovered = useQuery({
    queryKey: ["chat2", "discover", ownerId, search],
    queryFn: () => chat2Api.discover(search.trim()),
    enabled: mode === "discover",
    retry: false,
  });
  const recipientHandle = new URLSearchParams(routeSearch).get("to");
  const handledRecipient = useRef<string | null>(null);
  // StrictMode replays mount effects: share one in-flight POST for the same DM.
  const recipientOpening = useRef<{
    key: string;
    promise: ReturnType<typeof chat2Api.directByUsername>;
  } | null>(null);
  const [recipientRetry, setRecipientRetry] = useState(0);
  const [recipientError, setRecipientError] = useState<string | null>(null);
  useEffect(() => {
    if (!recipientHandle) {
      handledRecipient.current = null;
      setRecipientError(null);
      return;
    }
    if (
      !/^[A-Za-z0-9_-]{2,128}$/.test(recipientHandle) ||
      handledRecipient.current === recipientHandle
    )
      return;
    handledRecipient.current = recipientHandle;
    let active = true;
    setBusy(true);
    setError("");
    setRecipientError(null);
    const openingKey = `${ownerId}:${recipientHandle}`;
    const opening =
      recipientOpening.current?.key === openingKey
        ? recipientOpening.current.promise
        : chat2Api.directByUsername(recipientHandle);
    recipientOpening.current = { key: openingKey, promise: opening };
    void opening
      .then((created) => {
        if (!active) return;
        void cache.invalidateQueries({ queryKey: ["chat2", "list", ownerId] });
        navigate(roomPath(created.conversationId));
      })
      .catch((e) => {
        if (!active) return;
        handledRecipient.current = null;
        setMode("users");
        setPeopleSearch(recipientHandle);
        const isTimeout =
          e !== null &&
          typeof e === "object" &&
          "name" in e &&
          (e.name === "TimeoutError" || e.name === "AbortError");
        const message = isTimeout
          ? "Сервер чата долго не отвечает. Повторите попытку."
          : errorText(e);
        setError(message);
        setRecipientError(message);
      })
      .finally(() => {
        if (recipientOpening.current?.promise === opening) recipientOpening.current = null;
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      // StrictMode dev effect replay must not suppress the second mount.
      if (handledRecipient.current === recipientHandle) handledRecipient.current = null;
    };
  }, [recipientHandle, ownerId, cache, recipientRetry]);
  const courses = useQuery({
    queryKey: ["chat2", "courses", ownerId],
    queryFn: chat2Api.courseOptions,
    enabled: mode === "courses",
    retry: false,
  });
  const filtered = (list.data ?? []).filter((c) => {
    if (tab === "direct" && !["DIRECT", "CYNOLOGIST"].includes(c.kind)) return false;
    if (tab === "group" && ["DIRECT", "CYNOLOGIST"].includes(c.kind)) return false;
    if (tab === "unread" && c.unreadCount === 0) return false;
    if (tab === "cynologist" && c.kind !== "CYNOLOGIST") return false;
    return `${roomName(c, ownerId)} ${c.lastMessage?.text ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
  });
  const go = (id: string) => {
    setError("");
    setMode("list");
    navigate(roomPath(id));
  };
  async function action(fn: () => Promise<{ conversationId: string }>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const created = await fn();
      await cache.invalidateQueries({ queryKey: ["chat2", "list", ownerId] });
      go(created.conversationId);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function create(e: FormEvent) {
    e.preventDefault();
    await action(async () => {
      const created = await chat2Api.create(
        groupName.trim(),
        groupKind,
        visibility,
        description.trim(),
      );
      if (createAvatar) {
        try {
          await chat2Api.setAvatar(created.conversationId, createAvatar);
        } catch (error) {
          window.alert(
            `Чат создан, но аватарка не загружена: ${errorText(error)}. Её можно добавить в настройках.`,
          );
        }
      }
      setCreateAvatar(null);
      return created;
    });
  }
  return (
    <main className={`shell ${css.page}`}>
      <section className={css.shell} aria-label="Сообщения GAFUS">
        <aside className={`${css.sidebar} ${chosen ? css.mobileHide : ""}`}>
          <header className={css.sidebarHead}>
            <h1>Сообщения</h1>
            <div className={css.actions}>
              <CaramelButton
                type="button"
                title="Новое сообщение"
                aria-label="Новое сообщение"
                onClick={() => {
                  setMode("users");
                  setError("");
                }}
                className={css.iconAction}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M12 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6" />
                  <path d="m16 4 4 4-9 9-4 1 1-4 9-9a2.83 2.83 0 0 1 4 4" />
                </svg>
              </CaramelButton>
              <PrimaryButton
                type="button"
                title="Создать группу"
                aria-label="Создать группу"
                onClick={() => {
                  setMode("create");
                  setError("");
                }}
                className={css.iconAction}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </PrimaryButton>
            </div>
          </header>
          <label className={css.search}>
            <svg
              className={css.searchIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="10.8" cy="10.8" r="6.7" />
              <path d="m16 16 4.1 4.1" />
            </svg>
            <input
              value={mode === "users" ? peopleSearch : search}
              onChange={(e) =>
                mode === "users" ? setPeopleSearch(e.target.value) : setSearch(e.target.value)
              }
              placeholder={mode === "users" ? "Найти пользователя" : "Поиск по чатам"}
              aria-label="Поиск"
            />
          </label>
          {error && (
            <div className={css.inlineError} role="alert">
              <span>{error}</span>
              <button
                type="button"
                aria-label="Закрыть сообщение об ошибке"
                onClick={() => setError("")}
              >
                ×
              </button>
            </div>
          )}
          {mode === "list" && (
            <>
              <nav className={css.tabs} aria-label="Категории чатов">
                {(
                  [
                    ["all", "Все"],
                    ["direct", "Личные"],
                    ["group", "Группы"],
                    ["unread", "Новые"],
                  ] as const
                ).map(([id, title]) => (
                  <button
                    key={id}
                    type="button"
                    className={tab === id ? css.activeTab : ""}
                    onClick={() => setTab(id)}
                    aria-pressed={tab === id}
                  >
                    {title}
                  </button>
                ))}
                {trainer && (
                  <button
                    type="button"
                    className={tab === "cynologist" ? css.activeTab : ""}
                    onClick={() => setTab("cynologist")}
                    aria-pressed={tab === "cynologist"}
                  >
                    Кинолог
                  </button>
                )}
              </nav>
              <div className={css.chatList}>
                {list.isPending && (
                  <Loading variant="compact" message="Загружаем чаты…" className={css.note} />
                )}
                {list.isError && (
                  <p className={css.note} role="alert">
                    Не удалось загрузить список.{" "}
                    <button onClick={() => void list.refetch()}>Повторить</button>
                  </p>
                )}
                {list.isSuccess && filtered.length === 0 && (
                  <p className={css.note}>Здесь пока нет переписок.</p>
                )}
                {filtered.map((c) => (
                  <button
                    className={`${css.chatRow} ${c.id === chosen ? css.selected : ""}`}
                    type="button"
                    key={c.id}
                    onClick={() => go(c.id)}
                  >
                    <Chat2Avatar room={c} ownerId={ownerId} />
                    <span className={css.chatMeta}>
                      <strong>{roomName(c, ownerId)}</strong>
                      <span>{c.lastMessage?.text ?? kindLabel[c.kind]}</span>
                    </span>
                    <span className={css.chatTail}>
                      {c.lastMessage && <small>{timestamp(c.lastMessage.createdAt)}</small>}
                      {c.unreadCount > 0 && <b>{c.unreadCount}</b>}
                    </span>
                  </button>
                ))}
              </div>
              <div className={css.shortcuts}>
                {staff && (
                  <button type="button" onClick={() => setMode("moderation")}>
                    <ChatShortcutIcon kind="moderation" />
                    <span>Модерация жалоб</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (trainer) {
                      setError("");
                      setMode("list");
                      setTab("cynologist");
                      return;
                    }
                    void action(chat2Api.cynologist);
                  }}
                  disabled={busy}
                >
                  <ChatShortcutIcon kind="cynologist" />
                  <span>{trainer ? "Диалоги с клиентами" : "Чат с кинологом"}</span>
                </button>
                <button type="button" onClick={() => setMode("courses")}>
                  <ChatShortcutIcon kind="courses" />
                  <span>Чаты курсов</span>
                </button>
                <button type="button" onClick={() => setMode("discover")}>
                  <ChatShortcutIcon kind="discover" />
                  <span>Найти сообщества</span>
                </button>
              </div>
            </>
          )}
          {mode !== "list" && (
            <section className={css.drawer}>
              <BackButton
                type="button"
                className={css.drawerBack}
                onClick={() => {
                  setMode("list");
                  setError("");
                }}
              >
                К перепискам
              </BackButton>
              {mode === "moderation" && staff && (
                <Chat2StaffQueue enabled={mode === "moderation"} />
              )}
              {mode === "users" && (
                <>
                  <h2>Написать пользователю</h2>
                  <p>Найдите человека по имени пользователя.</p>
                  {users.isFetching && <p role="status">Ищем…</p>}
                  {(users.data ?? []).map((u) => (
                    <button
                      className={css.catalogRow}
                      type="button"
                      key={u.id}
                      disabled={busy}
                      onClick={() => void action(() => chat2Api.direct(u.id))}
                    >
                      <span className={css.avatar}>👤</span>
                      <strong>{u.username}</strong>
                      <span>Написать</span>
                    </button>
                  ))}
                  {peopleSearch.trim().length < 2 && <p>Введите минимум две буквы.</p>}
                </>
              )}
              {mode === "create" && (
                <form onSubmit={(e) => void create(e)} className={css.form}>
                  <h2>Новый групповой чат</h2>
                  <Chat2GroupAvatarEditor
                    src={createAvatarPreview}
                    onSelect={(file) => {
                      setCreateAvatar(file);
                      setError("");
                    }}
                    onInvalid={setError}
                    onRemove={createAvatar ? () => setCreateAvatar(null) : undefined}
                    disabled={busy}
                  />
                  <label>
                    Название *
                    <input
                      required
                      minLength={2}
                      maxLength={120}
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                    />
                  </label>
                  <label>
                    Тематика
                    <select
                      value={groupKind}
                      onChange={(e) => setGroupKind(e.target.value as typeof groupKind)}
                    >
                      <option value="GROUP">Группа</option>
                      <option value="CITY">Город</option>
                      <option value="BREED">Порода</option>
                      <option value="COURSE_TOPIC">Курс</option>
                    </select>
                  </label>
                  <label>
                    Кому виден
                    <select
                      value={visibility}
                      onChange={(e) => setVisibility(e.target.value as typeof visibility)}
                    >
                      <option value="PUBLIC">Всем (можно вступить)</option>
                      <option value="PRIVATE">По приглашению</option>
                    </select>
                  </label>
                  <label>
                    Описание
                    <textarea
                      value={description}
                      maxLength={2000}
                      rows={3}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>
                  <PrimaryButton disabled={busy} type="submit">
                    {busy ? "Создаём…" : "Создать чат"}
                  </PrimaryButton>
                </form>
              )}
              {mode === "courses" && (
                <>
                  <h2>Чаты ваших курсов</h2>
                  {courses.isLoading && <p role="status">Ищем доступные курсы…</p>}
                  {courses.isError && (
                    <button type="button" onClick={() => void courses.refetch()}>
                      Обновить список
                    </button>
                  )}
                  {courses.data?.length === 0 && <p>Пока нет доступных курсов.</p>}
                  {(courses.data ?? []).map((course) => (
                    <button
                      type="button"
                      className={css.catalogRow}
                      key={course.id}
                      title={course.name}
                      aria-label={`Открыть чат курса «${course.name}»`}
                      disabled={busy}
                      onClick={() => void action(() => chat2Api.course(course.id))}
                    >
                      <span className={css.avatar}>🎓</span>
                      <strong>{course.name}</strong>
                      <span>Открыть чат</span>
                    </button>
                  ))}
                </>
              )}
              {mode === "discover" && (
                <>
                  <h2>Сообщества</h2>
                  {discovered.isLoading && <Loading message="Загружаем сообщества…" />}
                  {discovered.isError && (
                    <button onClick={() => void discovered.refetch()}>Повторить</button>
                  )}
                  {(discovered.data ?? []).map((c) => (
                    <div className={css.catalogRow} key={c.id}>
                      <Chat2Avatar
                        room={{ kind: c.kind, members: [], avatarUrl: c.avatarUrl }}
                        ownerId={ownerId}
                      />
                      <span className={css.chatMeta}>
                        <strong>{c.name}</strong>
                        <span>{c.memberCount} участников</span>
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          c.joined ? go(c.id) : void action(() => chat2Api.join(c.id))
                        }
                      >
                        {c.joined ? "Открыть" : "Вступить"}
                      </button>
                    </div>
                  ))}
                </>
              )}
            </section>
          )}
        </aside>
        <section className={`${css.room} ${chosen ? css.mobileShow : ""}`} aria-label="Переписка">
          {chosen ? (
            <Chat2Room
              key={`${ownerId}:${chosen}`}
              ownerId={ownerId}
              id={chosen}
              room={room}
              initialDraft={drafts.current.get(chosen) ?? ""}
              onDraftChange={(value) => {
                drafts.current.set(chosen, value);
              }}
              onBack={() => navigate("/chats")}
              onRefresh={refreshList}
            />
          ) : (
            <div className={css.empty}>
              <span>🐾</span>
              <h2>
                {busy && recipientHandle
                  ? "Открываем переписку…"
                  : recipientError && recipientHandle
                    ? "Не удалось открыть переписку"
                    : "Ваши сообщения"}
              </h2>
              <p role={recipientError && recipientHandle ? "alert" : undefined}>
                {busy && recipientHandle
                  ? "Готовим личный чат с @" + recipientHandle
                  : recipientError && recipientHandle
                    ? recipientError
                    : "Выберите диалог или начните новое общение."}
              </p>
              {recipientError && recipientHandle && !busy && (
                <div className={css.recipientActions}>
                  <PrimaryButton
                    type="button"
                    onClick={() => {
                      setMode("list");
                      setError("");
                      setRecipientError(null);
                      setRecipientRetry((count) => count + 1);
                    }}
                  >
                    Повторить
                  </PrimaryButton>
                  <BackButton type="button" onClick={() => navigate("/chats")}>
                    К сообщениям
                  </BackButton>
                </div>
              )}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function Chat2Room({
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
  const [draft, setDraft] = useState(initialDraft);
  const writeDraft = (value: string) => {
    setDraft(value);
    onDraftChange(value);
  };
  const [pendingMedia, setPendingMedia] = useState<
    { localId: string; name: string; preview: string | null; kind: "image" | "video" | "file";
      file: File; attachment?: Chat2Attachment; failure?: string; uploading?: boolean }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [reply, setReply] = useState<Chat2Message | null>(null);
  const [reactionPickerId, setReactionPickerId] = useState<string | null>(null);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<"SPAM" | "ABUSE" | "OTHER">("SPAM");
  const [reportComment, setReportComment] = useState("");
  const [reportNotice, setReportNotice] = useState("");
  const pendingSend = useRef<{ fingerprint: string; clientMessageId: string } | null>(null);
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
      setOlder((previous) => previous.map((message) =>
        message.id === messageId ? {
          ...message,
          reactions: updateChat2ReactionSummary(message.reactions, emoji, result.active),
        } : message,
      ));
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
        const sub = socket.newSubscription(subscription.channel,
          chat2SubscriptionTransportOptions(subscription));
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
    if (olderRequest.current || !hasMore || !merged.length ||
        lastFetchedBefore.current === merged[0].sequence) return;
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
  async function uploadPendingFile(localId: string, file: File) {
    // This is an actual second local encode + S3 upload of ONE retained File.
    // It never retries unrelated attachments or just re-queries a failed job.
    setPendingMedia(previous => previous.map(item => item.localId === localId
      ? { ...item, failure: undefined, uploading: true } : item));
    try {
      const attachment = await chat2Api.upload(id, file);
      setPendingMedia(previous => previous.map(item => item.localId === localId
        ? { ...item, attachment, uploading: false, failure: undefined } : item));
    } catch (reason) {
      setPendingMedia(previous => previous.map(item => item.localId === localId
        ? { ...item, uploading: false,
          failure: item.kind === "video" ? videoRetryMessage(reason)
            : item.kind === "image" ? photoRetryMessage(reason) : errorText(reason) } : item));
    }
  }
  async function selectFiles(files: FileList | null) {
    if (!files || uploading || busy) return;
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files).slice(0, 8 - pendingMedia.length)) {
        const localId = crypto.randomUUID();
        const kind = file.type.startsWith("image/") ? "image" :
          file.type.startsWith("video/") ? "video" : "file";
        const preview = kind !== "file" ? URL.createObjectURL(file) : null;
        setPendingMedia(previous => [...previous, { localId, name: file.name, preview,
          kind, file, uploading: true }]);
        await uploadPendingFile(localId, file);
      }
    } finally { setUploading(false); }
  }
  function retryPendingFile(localId: string) {
    if (uploading || busy) return;
    const target = pendingMedia.find(item => item.localId === localId);
    if (!target || !target.failure || target.attachment || target.uploading) return;
    setUploading(true);
    void uploadPendingFile(localId, target.file).finally(() => setUploading(false));
  }
  function removeMedia(media: {
    localId: string;
    preview: string | null;
    attachment?: Chat2Attachment;
  }) {
    if (media.preview) URL.revokeObjectURL(media.preview);
    setPendingMedia((previous) => previous.filter((x) => x.localId !== media.localId));
    if (media.attachment)
      void chat2Api
        .discard(id, media.attachment.id)
        .catch(() => setError("Не удалось отменить загрузку"));
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (
      (!text && !pendingMedia.length) ||
      busy ||
      uploading ||
      pendingMedia.some((x) => !x.attachment)
    )
      return;
    const attachmentIds = pendingMedia.flatMap((x) => (x.attachment ? [x.attachment.id] : []));
    const quoted = reply?.id;
    const fingerprint = JSON.stringify([id, text, quoted ?? null, attachmentIds]);
    const clientMessageId =
      pendingSend.current?.fingerprint === fingerprint
        ? pendingSend.current.clientMessageId
        : crypto.randomUUID();
    pendingSend.current = { fingerprint, clientMessageId };
    setBusy(true);
    setError("");
    try {
      await chat2Api.send(id, {
        text,
        clientMessageId,
        attachmentIds,
        ...(quoted ? { replyToId: quoted } : {}),
      });
      for (const media of pendingMedia) if (media.preview) URL.revokeObjectURL(media.preview);
      pendingSend.current = null;
      setPendingMedia([]);
      writeDraft("");
      setReply(null);
      bottom.current = true;
      await cache.invalidateQueries({ queryKey: ["chat2", "messages", ownerId, id] });
      onRefresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function editOwn(e: FormEvent) {
    e.preventDefault();
    if (!edit || busy || !draft.trim()) return;
    setBusy(true);
    setError("");
    try {
      await chat2Api.edit(id, edit.id, draft.trim());
      setEdit(null);
      writeDraft("");
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
                <div className={css.bubble} onContextMenu={(event) => {
                  if (m.deletedAt) return;
                  event.preventDefault();
                  setReactionPickerId(m.id);
                }}>
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
                        <button type="button" key={reaction.emoji}
                          className={reaction.mine ? css.reactionMine : ""}
                          disabled={Boolean(reactingId)}
                          aria-label={`${reaction.emoji}, ${reaction.count}, ${reaction.mine ? "убрать мою реакцию" : "поставить реакцию"}`}
                          onClick={() => void react(m.id, reaction.emoji)}>
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
                      <button type="button" title="Поставить реакцию"
                        aria-label="Поставить реакцию на сообщение"
                        onClick={() => setReactionPickerId((current) => current === m.id ? null : m.id)}>
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
                        <button key={emoji} type="button" disabled={Boolean(reactingId)}
                          aria-label={`Поставить реакцию ${emoji}`}
                          onClick={() => void react(m.id, emoji)}>{emoji}</button>
                      ))}
                      <button type="button" aria-label="Закрыть реакции"
                        onClick={() => setReactionPickerId(null)}>×</button>
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
                  {item.preview && item.kind === "image" ? <img src={item.preview} alt={item.name} /> :
                    item.preview && item.kind === "video" ? <video src={item.preview} muted playsInline preload="metadata" aria-label={item.name} /> : <span>📄</span>}
                  {item.failure && (item.kind === "video" || item.kind === "image") && <button type="button"
                    className={css.retryVideoOverlay}
                    aria-label={`Повторить обработку ${item.kind === "image" ? "фото" : "видео"} ${item.name}`}
                    title={`Повторить подготовку и загрузку только этого ${item.kind === "image" ? "фото" : "видео"}`}
                    disabled={busy || uploading} onClick={() => retryPendingFile(item.localId)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 11a8 8 0 1 0-2.3 6M20 4v7h-7" />
                    </svg>
                  </button>}
                </div>
                <span>{item.name}</span>
                <small>{item.attachment ? "Готово" : item.failure ? "Ошибка" : "Подготавливаем и загружаем…"}</small>
                {item.failure && <small role="alert" className={css.pendingFileError}>{item.failure}</small>}
                <button
                  type="button"
                  aria-label={`Удалить ${item.name}`}
                  onClick={() => removeMedia(item)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <form className={css.composer} onSubmit={(e) => void (edit ? editOwn(e) : send(e))}>
          <div className={css.composerField}>
            {!edit && (
              <label className={css.attachButton} title="Добавить фото, видео MP4 или PDF">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m20.8 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
                </svg>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf"
                  multiple
                  disabled={busy || uploading || pendingMedia.length >= 8}
                  onChange={(e) => {
                    void selectFiles(e.target.files);
                    e.target.value = "";
                  }}
                  aria-label="Прикрепить фото, видео или PDF"
                />
              </label>
            )}
            <textarea
              aria-label="Текст сообщения"
              rows={1}
              maxLength={8000}
              value={draft}
              placeholder="Напишите сообщение…"
              onChange={(e) => writeDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
          </div>
          <button
            className={css.send}
            type="submit"
            disabled={
              busy ||
              uploading ||
              (!draft.trim() && !pendingMedia.length) ||
              pendingMedia.some((x) => !x.attachment)
            }
            aria-label={edit ? "Сохранить сообщение" : "Отправить сообщение"}
          >
            {edit ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m5 12 4 4L19 6" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m22 2-7 20-4-9-9-4L22 2ZM22 2 11 13" />
              </svg>
            )}
          </button>
        </form>
      </div>
    </>
  );
}

/** Access to the message is checked by Chat API before it returns any media URL.
 * Only real encoder renditions from the backend can enable quality controls. */
function Chat2StoredMedia({ chatId, file }: { chatId: string; file: Chat2Attachment }) {
  type MediaResponse = Awaited<ReturnType<typeof chat2Api.mediaUrl>>;
  const [media, setMedia] = useState<MediaResponse | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [quality, setQuality] = useState<Chat2QualityMode>(savedWebMp4Mode);
  const [usingFallback, setUsingFallback] = useState(false);
  const [posterSource, setPosterSource] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resumeAt = useRef(0);
  const playbackAttempt = useRef<{at:number; hints:Chat2VideoHints; quality:360|720}|null>(null);
  const reportedRendition = useRef<string|null>(null);
  const playedOnce = useRef(false);
  const resumeAfterAutoSelection = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const pendingSince = useRef(0);
  const [processingTimedOut, setProcessingTimedOut] = useState(false);
  const [fullscreen, setFullscreen] = useState<{
    url: string; media: MediaResponse; fallback: boolean; error: boolean;
  } | null>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const viewerOpen = Boolean(fullscreen);
  useEffect(() => {
    if (!viewerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(null);
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = previousOverflow;
      openButton.current?.focus();
    };
  }, [viewerOpen]);
  // Uploaded files appear in the message immediately; poll only pending jobs.
  useEffect(() => {
    if (!pendingStatus || !["QUEUED", "PROCESSING"].includes(pendingStatus) || processingTimedOut) return;
    if (pendingSince.current && Date.now() - pendingSince.current > 90_000) {
      setProcessingTimedOut(true);
      setLoadError(true);
      return;
    }
    const timer = window.setTimeout(() => setReload(value => value + 1), 4000);
    return () => window.clearTimeout(timer);
  }, [pendingStatus, reload, processingTimedOut]);
  useEffect(() => {
    let live = true;
    reportedRendition.current = null;
    void chat2Api.mediaUrl(chatId, file.id)
      .then((result) => {
        if (!live) return;
        setMedia(result);
        setPendingStatus(result.status && result.status !== "READY" ? result.status : null);
        if (["QUEUED", "PROCESSING"].includes(result.status ?? "")) {
          if (!pendingSince.current) pendingSince.current = Date.now();
        } else pendingSince.current = 0;
        setUsingFallback(false);
        if (result.status === "FAILED" || result.status === "EXPIRED") {
          setSrc(null);
          setLoadError(true);
          return;
        }
        if (result.status && result.status !== "READY") {
          setSrc(null);
          setLoadError(processingTimedOut);
          return;
        }
        setPosterSource(result.renditions?.poster ?? null);
        const preferred = savedWebMp4Mode();
        setQuality(preferred);
        setSrc(file.kind === "image"
          ? chat2ImageSource(result.renditions?.image, 320, window.devicePixelRatio, result.renditions?.imageWidths) ?? result.url
          : file.kind === "video"
            ? chat2VideoSource(result.renditions?.video, preferred, videoHints()) ?? result.url
            : result.url);
        setLoadError(false);
      })
      .catch(() => { if (live) { setSrc(null); setLoadError(true); } });
    return () => { live = false; };
  }, [chatId, file.id, file.kind, reload]);
  // Browser media onError does not expose HTTP status. Only a verified
  // CDN 410/5xx (or timed-out HEAD) can switch to the matching public S3 key.
  function handleMediaFailure(primary: string, kind: "image" | "video") {
    const fail = () => {
      if (kind === "video") { setPlaying(false); setLoadError(true); }
      setSrc(null);
    };
    if (!media || usingFallback) { fail(); return; }
    const fallback = chat2MatchedS3Variant(primary, media);
    void chat2CdnS3FailoverAllowed(primary, fallback, sameOriginCdnProbeFetch)
      .then(allowed => {
        if (!allowed || !fallback) { fail(); return; }
        if (kind === "video") resumeAt.current = videoRef.current?.currentTime ?? 0;
        setUsingFallback(true);
        setSrc(fallback);
        if (kind === "video") setPosterSource(media.fallbackRenditions?.poster ?? null);
      })
      .catch(fail);
  }
  // A broken CDN poster need not break a playable MP4; preflight its actual
  // rendering once and replace only this poster with its exact S3 counterpart.
  useEffect(() => {
    if (file.kind !== "video" || !media?.renditions?.poster || usingFallback) return;
    let active = true;
    const primary = media.renditions.poster;
    const cover = new Image();
    cover.onerror = () => {
      const fallback = chat2MatchedS3Variant(primary, media);
      void chat2CdnS3FailoverAllowed(primary, fallback, sameOriginCdnProbeFetch)
        .then(allowed => { if (active && allowed && fallback) setPosterSource(fallback); });
    };
    cover.src = primary;
    return () => { active = false; cover.onerror = null; };
  }, [file.kind, media, usingFallback]);
  function videoHints(): Chat2VideoHints {
    return webMp4Hints(videoRef.current?.clientWidth || 320);
  }
  function switchQuality(mode: Chat2QualityMode) {
    if (!media?.renditions?.video) return;
    const variants = usingFallback ? media.fallbackRenditions?.video : media.renditions.video;
    const next = chat2VideoSource(variants, mode, videoHints());
    if (!next) return;
    if (next !== src) resumeAt.current = videoRef.current?.currentTime ?? 0;
    playbackAttempt.current = null;
    setQuality(mode);
    saveWebMp4Mode(mode);
    setSrc(next);
  }
  function markVideoPlayIntent() {
    if (!media?.renditions?.video || !src) return;
    const variants = usingFallback ? media.fallbackRenditions?.video : media.renditions.video;
    const selected = src === variants?.[720] ? 720 : src === variants?.[360] ? 360 : null;
    if (!selected) return;
    playbackAttempt.current = {at:Date.now(),hints:videoHints(),quality:selected};
  }
  function onVideoPlaying() {
    setPlaying(true);
    playedOnce.current = true;
    if (src && src !== reportedRendition.current && media?.renditions?.video) {
      const variants = usingFallback ? media.fallbackRenditions?.video : media.renditions.video;
      const chosen = src === variants?.[720] ? 720 : src === variants?.[360] ? 360 : null;
      if (chosen) {
        reportedRendition.current = src;
        reportWebVideoStarted({surface:"chat",quality:chosen,mode:quality,
          hints:videoHints(),available:media.renditions.video,fallback:usingFallback});
      }
    }
    const current = playbackAttempt.current;
    playbackAttempt.current = null;
    if (current && !usingFallback) observeWebMp4Start(current.hints, current.quality, Date.now() - current.at);
  }
  function onVideoWaiting() {
    const current = playbackAttempt.current;
    if (!current || Date.now() - current.at < 4000) return;
    playbackAttempt.current = null;
    if (!usingFallback) observeWebMp4Start(current.hints, current.quality, Date.now() - current.at);
  }
  function requestVideoPlayback() {
    if (!playedOnce.current && media?.renditions?.video) {
      const preferred = savedWebMp4Mode();
      const variants = usingFallback ? media.fallbackRenditions?.video : media.renditions.video;
      const wanted = chat2VideoSource(variants, preferred, videoHints());
      if (preferred !== quality) setQuality(preferred);
      // The preview can stay mounted while a user changes Wi-Fi. Re-select
      // exactly once on first Play, never in the middle of a playing MP4.
      if (wanted && wanted !== src) {
        resumeAfterAutoSelection.current = true;
        setSrc(wanted);
        return;
      }
    }
    markVideoPlayIntent();
    void videoRef.current?.play().catch(() => undefined);
  }
  function retryVideo() {
    // Recheck only; no client may falsely pretend this restarts a failed Cloud Job.
    pendingSince.current = 0;
    setProcessingTimedOut(false);
    setLoadError(false);
    setPlaying(false);
    setSrc(null);
    setReload((count) => count + 1);
  }
  async function open() {
    try {
      // Re-authorize on each opening; never reuse an expired signed URL.
      const fresh = await chat2Api.mediaUrl(chatId, file.id);
      if (fresh.status && fresh.status !== "READY") return;
      if (file.kind === "image") {
        const url = chat2ImageSource(fresh.renditions?.image, 1200,
          window.devicePixelRatio, fresh.renditions?.imageWidths) ?? fresh.url;
        if (!url) return;
        setFullscreen({ url, media: fresh, fallback: false, error: false });
        return;
      }
      // PDF documents retain their normal external-document behavior.
      if (fresh.url) window.open(fresh.url, "_blank", "noopener,noreferrer");
    } catch { setLoadError(true); }
  }
  function handleFullscreenFailure() {
    if (!fullscreen) return;
    const original = fullscreen.url;
    if (fullscreen.fallback) {
      setFullscreen(current => current?.url === original ? {...current,error:true} : current);
      return;
    }
    const backup = chat2MatchedS3Variant(original, fullscreen.media);
    void chat2CdnS3FailoverAllowed(original, backup, sameOriginCdnProbeFetch).then(allowed => {
      setFullscreen(current => current?.url !== original ? current :
        allowed && backup ? {...current,url:backup,fallback:true} : {...current,error:true});
    }).catch(() => setFullscreen(current => current?.url === original ? {...current,error:true} : current));
  }
  if (file.kind === "video") {
    const variants = media?.renditions?.video;
    const both = chat2HasVideoQuality(variants, 360) && chat2HasVideoQuality(variants, 720);
    return (
      <div className={css.videoAttachment}>
        {src ? (
          <div className={css.videoFrame}>
          <video key={src} ref={videoRef} src={src} controls playsInline preload="metadata"
            onPlay={() => setPlaying(true)} onPlaying={onVideoPlaying} onWaiting={onVideoWaiting}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            poster={posterSource ?? undefined} aria-label={file.name}
            onLoadedMetadata={(event) => {
              if (resumeAfterAutoSelection.current) {
                resumeAfterAutoSelection.current = false;
                markVideoPlayIntent();
                void event.currentTarget.play().catch(() => undefined);
              }
              if (resumeAt.current > 0) {
                event.currentTarget.currentTime = Math.min(resumeAt.current, Math.max(0, event.currentTarget.duration - 0.1));
                resumeAt.current = 0;
                void event.currentTarget.play().catch(() => undefined);
              }
            }}
            onError={(event) => handleMediaFailure(event.currentTarget.currentSrc || src, "video")} />
          {!playing && (
            <button type="button" className={css.videoPlayOverlay}
              aria-label={`Воспроизвести ${file.name}`}
              onClick={requestVideoPlayback}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="m8 5 11 7-11 7V5Z" />
              </svg>
            </button>
          )}
            {both && <VideoQualitySettings value={quality} onChange={switchQuality}
              available={variants} />}
          </div>
        ) : (
          <div className={css.videoLoadingState} role={loadError ? "alert" : "status"}>
            {loadError ? <><span>{pendingStatus === "FAILED" ? videoServerFailureMessage :
              processingTimedOut ?
              "Обработка видео слишком долго не завершается. Сервис обработки может быть недоступен. Сохраните оригинал. Можно проверить состояние ещё раз — это не перезапустит обработку." :
              "Не удалось загрузить видео. Проверьте интернет и попробуйте открыть его снова."}</span>
              {pendingStatus !== "FAILED" && <button type="button" onClick={retryVideo}>Проверить состояние ещё раз</button>}</>
              : "Загружаем видео…"}
          </div>
        )}
      </div>
    );
  }
  const imageVariants: Chat2MediaRenditions["image"] =
    usingFallback ? media?.fallbackRenditions?.image : media?.renditions?.image;
  const srcset = file.kind === "image" && imageVariants
    ? Array.from(new Map(([360, 1440] as const)
        .filter((size) => imageVariants[size]?.startsWith("https://"))
        .map((size) => [media?.renditions?.imageWidths?.[size] ?? size, imageVariants[size]!] as const))
        .entries()).map(([width, url]) => `${url} ${width}w`).join(", ")
    : undefined;
  return <>
    <button ref={openButton} type="button" className={css.storedMedia}
      onClick={() => loadError ? setReload(value => value + 1) : void open()}
      disabled={!src && !loadError}
      aria-label={loadError ? `Повторить загрузку ${file.name}` : `Открыть ${file.name}`}>
      {file.kind === "image" && src ? (
        <img src={src} srcSet={srcset || undefined}
          sizes={srcset ? "(max-width: 600px) 90vw, 320px" : undefined}
          alt={file.name} loading="lazy" referrerPolicy="no-referrer"
          onError={(event) => handleMediaFailure(event.currentTarget.currentSrc || src, "image")} />
      ) : <span role="status">{loadError ? "Не удалось обработать фото · Повторить" :
          pendingStatus ? "Обрабатываем фото…" : "Загружаем фото…"}</span>}
    </button>
    {fullscreen && createPortal(
      <div className={css.mediaLightbox} role="presentation" onClick={() => setFullscreen(null)}>
        <div className={css.mediaLightboxInner} role="dialog" aria-modal="true"
          aria-label="Просмотр фотографии" onClick={event => event.stopPropagation()}>
          <button ref={closeButton} type="button" className={css.mediaLightboxClose}
            aria-label="Закрыть просмотр" onClick={() => setFullscreen(null)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
              stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"
              aria-hidden="true" focusable="false">
              <path d="M5 5l14 14M19 5 5 19" />
            </svg>
          </button>
          {fullscreen.error ? <p role="alert">Не удалось открыть фотографию</p> :
            <img src={fullscreen.url} alt={file.name} referrerPolicy="no-referrer"
              onError={handleFullscreenFailure} />}
        </div>
      </div>, document.body,
    )}
  </>;
}

function Chat2RoomSettings({
  id,
  me,
  info,
  onRefresh,
  onExit,
}: {
  id: string;
  me: string;
  info: Chat2Conversation;
  onRefresh: () => void;
  onExit: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [name, setName] = useState(info.name ?? ""),
    [description, setDescription] = useState(info.description ?? "");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE" | "UNLISTED">(info.visibility);
  const [search, setSearch] = useState("");
  const [silenced, setSilenced] = useState(info.muted ?? false);
  const [settings, setSettings] = useState(false);
  const cache = useQueryClient();
  const people = useQuery({
    queryKey: ["chat2", "invite", id, search],
    queryFn: () => chat2Api.users(search.trim()),
    enabled: search.trim().length >= 2,
    retry: false,
  });
  const room = useQuery({
    queryKey: ["chat2", "settings", id],
    queryFn: () => chat2Api.detail(id),
    retry: false,
  });
  const actual = room.data ?? info;
  const own = actual.role === "OWNER",
    moderator = own || actual.role === "ADMIN";
  const group = ["GROUP", "CITY", "BREED", "COURSE_TOPIC"].includes(actual.kind);
  async function act(run: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await run();
      await room.refetch();
      onRefresh();
      await cache.invalidateQueries({ queryKey: ["chat2", "list", me] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const safeChange = (person: Chat2Member, action: "BAN" | "KICK" | "PROMOTE" | "DEMOTE") => {
    if (
      !window.confirm(
        `${action === "BAN" ? "Заблокировать" : action === "KICK" ? "Удалить" : action === "PROMOTE" ? "Назначить администратором" : "Снять права администратора"} ${person.username}?`,
      )
    )
      return;
    void act(() => chat2Api.moderate(id, person.userId, action));
  };
  return (
    <section className={css.settings} aria-label="Настройки переписки">
      <h3>{actual.name ?? "Информация о чате"}</h3>
      {group &&
        (moderator ? (
          <Chat2GroupAvatarEditor
            src={chat2ImageUrl(actual.avatarUrl ?? null)}
            onSelect={(file) => void act(() => chat2Api.setAvatar(id, file))}
            onInvalid={setError}
            onRemove={
              actual.avatarUrl
                ? () => {
                    if (window.confirm("Удалить аватарку группы?"))
                      void act(() => chat2Api.removeAvatar(id));
                  }
                : undefined
            }
            disabled={busy}
          />
        ) : (
          <div className={css.avatarEditor}>
            <span className={css.avatarPreview}>
              {chat2ImageUrl(actual.avatarUrl ?? null) ? (
                <img src={chat2ImageUrl(actual.avatarUrl ?? null)!} alt="Аватарка группы" />
              ) : (
                kindEmoji[actual.kind]
              )}
            </span>
          </div>
        ))}
      {actual.description && <p>{actual.description}</p>}
      {error && (
        <p className={css.error} role="alert">
          {error}
        </p>
      )}
      <div className={css.settingsActions}>
        <button
          type="button"
          onClick={() =>
            void act(async () => {
              await chat2Api.mute(id, !silenced);
              setSilenced(!silenced);
            })
          }
          disabled={busy}
        >
          {silenced ? "Включить уведомления" : "Отключить уведомления"}
        </button>
        {actual.kind !== "DIRECT" && actual.kind !== "CYNOLOGIST" && actual.role !== "OWNER" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Выйти из чата?"))
                void act(async () => {
                  await chat2Api.leave(id);
                  onExit();
                });
            }}
          >
            Выйти из чата
          </button>
        )}
        {group && moderator && (
          <button type="button" onClick={() => setSettings(!settings)}>
            {settings ? "Закрыть настройки" : "Настроить группу"}
          </button>
        )}
      </div>
      {settings && group && moderator && (
        <form
          className={css.roomEdit}
          onSubmit={(e) => {
            e.preventDefault();
            void act(() =>
              chat2Api.updateGroup(id, {
                name: name.trim(),
                description: description.trim(),
                visibility,
              }),
            );
          }}
        >
          <label>
            Название
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={120}
              required
            />
          </label>
          <label>
            Описание
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </label>
          <label>
            Видимость
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as typeof visibility)}
            >
              <option value="PUBLIC">Открытая</option>
              <option value="PRIVATE">По приглашению</option>
              <option value="UNLISTED">По ссылке или приглашению</option>
            </select>
          </label>
          <button type="submit" disabled={busy || name.trim().length < 2}>
            Сохранить
          </button>
        </form>
      )}
      {moderator &&
        ["GROUP", "CITY", "BREED", "COURSE_TOPIC", "COMMUNITY", "COURSE"].includes(actual.kind) && (
          <Chat2ReportQueue id={id} visible={moderator} />
        )}
      <h4>Участники · {actual.members.length}</h4>
      <div className={css.settingMembers}>
        {actual.members.map((member) => (
          <div className={css.settingMember} key={member.userId}>
            <span>
              👤 {member.username} {member.userId === me ? "(вы)" : ""}
            </span>
            <small>
              {member.role === "OWNER"
                ? "Владелец"
                : member.role === "ADMIN"
                  ? "Админ"
                  : "Участник"}
            </small>
            {group && moderator && member.userId !== me && member.role !== "OWNER" && (
              <div className={css.memberActions}>
                {own && member.role === "MEMBER" && (
                  <button type="button" onClick={() => safeChange(member, "PROMOTE")}>
                    Админ
                  </button>
                )}
                {own && member.role === "ADMIN" && (
                  <button type="button" onClick={() => safeChange(member, "DEMOTE")}>
                    Снять
                  </button>
                )}
                <button type="button" onClick={() => safeChange(member, "KICK")}>
                  Исключить
                </button>
                <button type="button" onClick={() => safeChange(member, "BAN")}>
                  Блокировать
                </button>
                {own && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Передать владельца группы?"))
                        void act(() => chat2Api.transfer(id, member.userId));
                    }}
                  >
                    Передать группу
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {group && moderator && (
        <div className={css.roomEdit}>
          <h4>Пригласить</h4>
          <label>
            Поиск пользователя
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Имя пользователя"
            />
          </label>
          {(people.data ?? [])
            .filter((p) => !actual.members.some((m) => m.userId === p.id))
            .map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={() => void act(() => chat2Api.invite(id, p.id))}
              >
                ＋ {p.username}
              </button>
            ))}
        </div>
      )}
    </section>
  );
}
