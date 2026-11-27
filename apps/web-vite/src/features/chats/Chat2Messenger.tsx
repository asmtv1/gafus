import { Loading } from "../../shared/ui";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "../../shared/auth/useAuth";
import { GafusHeader } from "../../brand/GafusHeader";
import { RouteLink, navigate, useRoutePath, useRouteSearch } from "../../shared/router/location";
import { BackButton, CaramelButton, PrimaryButton } from "../../shared/ui";
import { chat2Api, type Chat2Kind } from "./chat2Api";
import { Chat2StaffQueue } from "./Chat2StaffQueue";
import css from "./Chat2Messenger.module.css";
import { errorText, roomName, Chat2Avatar, timestamp } from "./chat2Presentation";
import { Chat2GroupAvatarEditor } from "./Chat2RoomSettings";
import { Chat2Room } from "./Chat2Room";
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

const roomPath = (id: string) => `/chats/${id}` as const;


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
