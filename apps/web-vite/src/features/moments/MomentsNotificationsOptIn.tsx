import { Loading } from "../../shared/ui";
import { BackButton, PrimaryButton } from "../../shared/ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiError } from "../../shared/api/client";
import type { AuthUser } from "../../shared/auth/authApi";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import { RouteLink, momentPath, momentCommentPath, momentProfilePath, navigate } from
  "../../shared/router/location";
import {
  projectNotificationPage,
  projectNotificationStatus,
  type NotificationReadWire,
  notificationHonoReadWire,
  markMomentNotificationRead,
  markAllMomentNotificationsRead,
} from "./notificationsReadApi";
import "./MomentsNotifications.css";

const labels = {
  author_post: "Новая публикация",
  comment: "Комментарий",
  reply: "Ответ",
  post_reaction: "Реакция на публикацию",
  comment_reaction: "Реакция на комментарий",
};
/** A local monogram is safe even when the notification source has no public avatar. */
function notificationInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts.slice(0, 2).map((part) => part[0]).join("") :
    parts[0]?.slice(0, 2) ?? "Г").toLocaleUpperCase("ru-RU");
}

function NotificationSymbol({ kind }: { kind: keyof typeof labels }) {
  const reaction = kind === "post_reaction" || kind === "comment_reaction";
  const reply = kind === "reply";
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {reaction ? <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 1 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/> :
      reply ? <><path d="M9 10 4 15l5 5"/><path d="M4 15h9a7 7 0 0 0 7-7V5"/></> :
      <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-9.5A7.5 7.5 0 0 1 10.5 4h2A7.5 7.5 0 0 1 20 11.5Z"/>}
  </svg>;
}

function History({
  owner,
  wire,
  alive,
  onClose,
  onRead,
}: {
  owner: string;
  wire: NotificationReadWire;
  alive: () => boolean;
  onClose: () => void;
  onRead: () => Promise<unknown>;
}) {
  const status = useQuery({
    queryKey: ["feed", "notifications", "access", owner],
    queryFn: async () => {
      const d = projectNotificationStatus(await wire.status());
      if (!alive()) throw Error("STALE_AUTH");
      return d;
    },
    gcTime: 0,
    retry: false,
    staleTime: 0,
  });
  // A cached enabled flag cannot authorize a new owner history request.
  const statusReady = status.isSuccess && !status.isFetching;
  const history = useInfiniteQuery({
    queryKey: ["feed", "notifications", "history", owner],
    queryFn: async ({ pageParam }) => {
      const page = projectNotificationPage(await wire.list(pageParam));
      if (!alive()) throw Error("STALE_AUTH");
      if (pageParam !== null && page.nextCursor === pageParam)
        throw Error("INVALID_NOTIFICATION_REPEAT_CURSOR");
      return page;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: statusReady && status.data.enabled === true,
    gcTime: 0,
    retry: false,
    staleTime: 0,
  });
  // A transient next-page error may retain verified prior rows. A terminal
  // owner denial on any page must retire them immediately.
  const denied = history.error instanceof ApiError &&
    [401, 403, 404].includes(history.error.status);
  const pageDenied = history.isFetchNextPageError && denied;
  const historyReady =
    statusReady &&
    status.data.enabled &&
    (!history.isFetching || history.isFetchingNextPage) &&
    (history.isSuccess || (history.isFetchNextPageError && !pageDenied));
  const live = wire.fixtureKind === "AG2_FEED_NOTIFICATIONS_HONO_GET_ONLY";
  const inFlight = useRef(false);
  const [readBusy, setReadBusy] = useState<string | null>(null);
  const [readError, setReadError] = useState("");
  const markRead = async (notificationId: string | null) => {
    if (!live || inFlight.current || !alive() || !statusReady ||
        status.data.enabled !== true) return;
    inFlight.current = true;
    setReadError("");
    setReadBusy(notificationId ?? "all");
    try {
      if (notificationId === null) await markAllMomentNotificationsRead();
      else await markMomentNotificationRead(notificationId);
      if (!alive()) return;
      // Server ACK is insufficient; refresh the owner-scoped history before UI.
      const refreshed = await history.refetch();
      if (refreshed.isError) throw Error("NOTIFICATION_READ_RECHECK_FAILED");
      if (alive()) await onRead();
    } catch {
      if (alive()) setReadError(
        "Не удалось подтвердить прочтение. Обновите историю перед повтором.",
      );
    } finally {
      inFlight.current = false;
      if (alive()) setReadBusy(null);
    }
  };
  const ids = new Set<string>();
  const rows = (historyReady ? history.data!.pages.flatMap((page) => page.items) : []).filter(
    (item) => {
      if (ids.has(item.id)) return false;
      ids.add(item.id);
      return true;
    },
  );
  if (!alive())
    return <section role="alert">Сессия изменилась. Откройте «Моменты» заново.</section>;
  const unreadCount = rows.filter((row) => !row.readAt).length;
  return (
    <section aria-label={wire.fixtureKind === "AG2_FEED_NOTIFICATIONS_SYNTHETIC_GET_ONLY"
      ? "История уведомлений (макет)" : "История уведомлений"}
      className="notification-history notification-history--modern">
      <header className="notification-history__header">
        <div className="notification-history__identity">
          <span className="notification-history__eyebrow">Активность</span>
          <h3>Уведомления «Моментов»</h3>
        </div>
        <BackButton type="button" onClick={onClose}>К «Моментам»</BackButton>
      </header>
      {!live && (
        <div className="notification-history__message notification-history__message--info" role="note">
          Только просмотр. Отметки о прочтении недоступны в макете.
        </div>
      )}
      {readError && <div className="notification-history__message notification-history__message--error" role="alert">{readError}</div>}
      {status.isPending && <Loading message="Проверяем доступность уведомлений…" className="notification-history__message" />}
      {status.isFetching && status.data && (
        <Loading variant="compact" message="Перепроверяем доступность уведомлений…" className="notification-history__message" />
      )}
      {status.isError && (
        <div className="notification-history__message notification-history__message--error" role="alert">
          <p>Не удалось проверить доступ.</p>
          <PrimaryButton type="button" onClick={() => void status.refetch()}>
            Повторить проверку
          </PrimaryButton>
        </div>
      )}
      {statusReady && !status.data.enabled && (
        <p className="notification-history__message" role="status">Раздел «Моменты» сейчас недоступен.</p>
      )}
      {statusReady && status.data.enabled && (
        <>
          {historyReady && rows.length > 0 && (
            <div className="notification-history__toolbar">
              <span className="notification-history__counter" aria-live="polite">
                <span className="notification-history__counter-dot" aria-hidden="true" />
                {unreadCount ? `Новых: ${unreadCount}` : "Всё прочитано"}
              </span>
              {live && unreadCount > 0 && (
                <button type="button" className="notification-history__read-all"
                  disabled={readBusy !== null} onClick={() => void markRead(null)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="m3 12 5 5 7-8M13 17l8-9" />
                  </svg>
                  {readBusy === "all" ? "Отмечаем…" : "Прочитать всё"}
                </button>
              )}
            </div>
          )}
          {history.isPending && <Loading message="Загружаем историю уведомлений…" className="notification-history__message" />}
          {history.isError && (!history.isFetchNextPageError || pageDenied) && (
            <div className="notification-history__message notification-history__message--error" role="alert">
              <p>{denied ? "Доступ к уведомлениям закрыт." :
                "Не удалось загрузить уведомления."}</p>
              {!denied && <PrimaryButton type="button" onClick={() => void history.refetch()}>
                Повторить чтение
              </PrimaryButton>}
            </div>
          )}
          {historyReady && rows.length === 0 && (
            <div role="status" className="notification-history__empty">
              <span className="notification-history__empty-icon" aria-hidden="true">✓</span>
              <strong>Уведомлений пока нет</strong>
              <span>Здесь появятся реакции, комментарии и ответы на ваши публикации.</span>
            </div>
          )}
          {historyReady && rows.length > 0 && (
            <ul className="notification-history-list">
              {rows.map((row) => {
                const actor = row.actorProfiles[0];
                const actorName = actor?.name ?? "Участник сообщества";
                const momentUrl = row.kind === "reply" && row.commentId
                  ? momentCommentPath(row.postId, row.commentId)
                  : momentPath(row.postId);
                const isRead = Boolean(row.readAt);
                return <li key={row.id} className={`notification-history__item${isRead ? " is-read" : " is-unread"}`}>
                  <div className="notification-history__avatar" aria-hidden="true">
                    {notificationInitials(actorName)}
                    <span className={`notification-history__type notification-history__type--${row.kind}`}>
                      <NotificationSymbol kind={row.kind} />
                    </span>
                  </div>
                  <div className="notification-history__details">
                    <div className="notification-history__topline">
                      <strong className="notification-history__title">{labels[row.kind]}</strong>
                      <time className="notification-history__time" dateTime={row.createdAt}
                        title={new Date(row.createdAt).toLocaleString("ru-RU")}>
                        {new Date(row.createdAt).toLocaleString("ru-RU", {
                          day: "numeric", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </time>
                    </div>
                    <div className="notification-history__actors">
                      {row.actorProfiles.length > 0
                        ? row.actorProfiles.map((profile, index) =>
                          <span key={profile.username + ":" + index}>
                            {index > 0 ? ", " : ""}
                            <RouteLink to={momentProfilePath(profile.username)}>
                              {profile.name}
                            </RouteLink>
                          </span>)
                        : actorName}
                      {row.actorCount > row.actorProfiles.length &&
                        <span className="notification-history__more">
                          {" "}и ещё {row.actorCount - row.actorProfiles.length}
                        </span>}
                    </div>
                    <div className="notification-history__actions">
                      {row.targetAvailable ? (
                        <RouteLink className="notification-history__open" to={momentUrl}>
                          {row.kind === "reply" ? "Открыть публикацию с ответом" : "Открыть публикацию"}
                          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 5 7 7-7 7" />
                          </svg>
                        </RouteLink>
                      ) : <span className="notification-history__unavailable">Публикация удалена</span>}
                      {live && !isRead && (
                        <button type="button" className="notification-history__mark-read"
                          title="Отметить как прочитанное" disabled={readBusy !== null}
                          onClick={() => void markRead(row.id)}>
                          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="m5 12 4 4 10-10" />
                          </svg>
                          {readBusy === row.id ? "Отмечаем…" : "Прочитано"}
                        </button>
                      )}
                    </div>
                  </div>
                  <span className={`notification-history__state${isRead ? " is-read" : ""}`}
                    aria-label={isRead ? "Прочитано" : "Не прочитано"}>
                    {!isRead && <><span className="notification-history__state-dot" aria-hidden="true" />
                      <span className="notification-history__sr-only">Не прочитано</span></>}
                    {isRead && <span className="notification-history__sr-only">Прочитано</span>}
                  </span>
                </li>;
              })}
            </ul>
          )}
          {historyReady && history.hasNextPage && !history.isFetchNextPageError && (
            <div className="notification-history__pagination">
              <button type="button" disabled={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}>
                {history.isFetchingNextPage ? "Загружаем…" : "Ещё уведомления"}
              </button>
            </div>
          )}
          {historyReady && history.isFetchNextPageError && (
            <div className="notification-history__message notification-history__message--error" role="alert">
              <p>Не удалось загрузить следующую страницу.</p>
              <PrimaryButton type="button" onClick={() => void history.fetchNextPage()}>
                Повторить страницу уведомлений
              </PrimaryButton>
            </div>
          )}
        </>
      )}
    </section>
  );
}
function SessionBound({ owner, wire, routeMode }: {
  owner: string; wire: NotificationReadWire; routeMode: boolean;
}) {
  const global = useQueryClient();
  const initial = useRef(global.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id ?? null);
  const epoch = useRef(0);
  const last = useRef(initial.current);
  const revision = useSyncExternalStore(
    (cb) =>
      global.getQueryCache().subscribe((e) => {
        if (
          e.query.queryKey.length === CURRENT_USER_QUERY_KEY.length &&
          e.query.queryKey.every((part: unknown, i: number) => part === CURRENT_USER_QUERY_KEY[i])
        ) {
          const next = global.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id ?? null;
          if (
            next !== last.current &&
            (next !== null || e.type === "removed" || e.query.state.data === null)
          ) {
            last.current = next;
            epoch.current++;
            cb();
          }
        }
      }),
    () => epoch.current,
    () => epoch.current,
  );
  const [open, setOpen] = useState(routeMode);
  const mounted = useRef(true);
  const [privateCache] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            gcTime: 0,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  useEffect(
    () => {
      mounted.current = true;
      return () => {
        mounted.current = false;
        void privateCache.cancelQueries();
        privateCache.clear();
      };
    },
    [privateCache],
  );
  const alive = () =>
    mounted.current && epoch.current === 0 &&
    global.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id === owner;
  if (initial.current !== owner || revision !== 0 || !alive())
    return <p role="alert">Сессия изменилась. Откройте «Моменты» заново.</p>;
  if (!open)
    return (
      <div className="notification-history-entry">
        <button type="button" onClick={() => setOpen(true)}>
          История уведомлений (макет)
        </button>
      </div>
    );
  return (
    <QueryClientProvider client={privateCache}>
      <History
        owner={owner}
        wire={wire}
        alive={alive}
        onRead={() => global.invalidateQueries({ queryKey: ["feed", "notifications"] })}
        onClose={() => {
          void privateCache.cancelQueries();
          privateCache.clear();
          if (routeMode) navigate("/moments");
          else setOpen(false);
        }}
      />
    </QueryClientProvider>
  );
}
export function MomentsNotificationsOptIn({
  enabled,
  ownerId,
  transport,
  routeMode = false,
}: {
  enabled: boolean;
  ownerId: string;
  transport?: NotificationReadWire;
  routeMode?: boolean;
}) {
  if (
    !enabled ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(ownerId) ||
    (transport !== undefined &&
      transport.fixtureKind !== "AG2_FEED_NOTIFICATIONS_SYNTHETIC_GET_ONLY" &&
      transport.fixtureKind !== "AG2_FEED_NOTIFICATIONS_HONO_GET_ONLY")
  )
    return null;
  return <SessionBound key={ownerId + ":" + String(routeMode)}
    owner={ownerId} wire={transport??notificationHonoReadWire} routeMode={routeMode} />;
}
