import { Loading } from "../../shared/ui";
import { BackButtonLink, PrimaryButton } from "../../shared/ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { AuthUser } from "../../shared/auth/authApi";
import { getMomentsStatus, listProfileMoments, isSafeMomentUsername } from "./momentsApi";
import { MomentSummary } from "./MomentSummary";
import { RouteLink } from "../../shared/router/location";
import { ApiError } from "../../shared/api/client";
import styles from "./MomentsProfile.module.css";

export function MomentsProfile({ userId, username }: { userId: string; username: string }) {
  const cache = useQueryClient();
  const initial = useRef(cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id ?? null);
  const epoch = useRef(0);
  const last = useRef(initial.current);
  const revision = useSyncExternalStore(
    (cb) =>
      cache.getQueryCache().subscribe((event) => {
        if (
          event.query.queryKey.length === CURRENT_USER_QUERY_KEY.length &&
          event.query.queryKey.every(
            (part: unknown, i: number) => part === CURRENT_USER_QUERY_KEY[i],
          )
        ) {
          const now = cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id ?? null;
          if (
            now !== last.current &&
            (now !== null || event.type === "removed" || event.query.state.data === null)
          ) {
            last.current = now;
            epoch.current++;
            cb();
          }
        }
      }),
    () => epoch.current,
    () => epoch.current,
  );
  const alive = () =>
    epoch.current === 0 &&
    cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id === userId;
  const validUsername = isSafeMomentUsername(username);
  const allowed = initial.current === userId && revision === 0 && alive() && validUsername;
  // Drop only this author's scoped query state when the viewer session changes.
  useEffect(() => {
    if (allowed) return;
    void cache.cancelQueries({ queryKey: ["moments", "profile", userId, username] });
    cache.removeQueries({ queryKey: ["moments", "profile", userId, username] });
  }, [allowed, cache, userId, username]);
  const status = useQuery({
    queryKey: ["moments", "status", userId],
    queryFn: getMomentsStatus,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    enabled: allowed,
  });
  const statusReady = allowed && status.isSuccess && !status.isFetching;
  const posts = useInfiniteQuery({
    queryKey: ["moments", "profile", userId, username],
    queryFn: ({ pageParam }) => listProfileMoments(username, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: statusReady && status.data.enabled === true,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  // Same-turn next/retry clicks must share a flight. Scope it to the
  // current viewer and author, so a previous author's flight cannot block this one.
  const pageKey = JSON.stringify([userId, username]);
  const flightRef = useRef<{ key: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const pageBusy = busyKey === pageKey || posts.isFetchingNextPage;
  const requestNextPage = () => {
    if (flightRef.current?.key === pageKey || posts.isFetchingNextPage) return;
    const flight = { key: pageKey };
    flightRef.current = flight;
    setBusyKey(pageKey);
    const release = () => {
      if (flightRef.current !== flight) return;
      flightRef.current = null;
      setBusyKey((current) => (current === pageKey ? null : current));
    };
    void posts.fetchNextPage({ cancelRefetch: false }).then(release, release);
  };
  const postExpired = posts.error instanceof ApiError && posts.error.status === 401;
  const postForbidden = posts.error instanceof ApiError && posts.error.status === 403;
  const postMissing = posts.error instanceof ApiError && posts.error.status === 404;
  const postPageDenied = posts.isFetchNextPageError &&
    (postExpired || postForbidden || postMissing);
  const showPostError = posts.isError && (!posts.isFetchNextPageError || postPageDenied);
  // Only a currently accepted status and a settled GET can publish author
  // posts. A denied next page hides cards; 500/503 retain them for manual retry.
  const postsReady =
    statusReady &&
    status.data.enabled &&
    (posts.isSuccess || (posts.isFetchNextPageError && !postPageDenied)) &&
    (!posts.isFetching || posts.isFetchingNextPage);
  const seen = new Set<string>();
  const items = (postsReady ? posts.data!.pages.flatMap((page) => page.items) : []).filter(
    (item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    },
  );
  const sessionExpired = status.error instanceof ApiError && status.error.status === 401;
  if (!validUsername) return <section role="alert">Недопустимое имя автора публикаций.</section>;
  if (!allowed)
    return <section role="alert">Сессия изменилась. Откройте профиль автора заново.</section>;
  return (
    <section className="collection-section" aria-label={"Моменты пользователя @" + username}>
      <p>
        <BackButtonLink to="/moments">Моменты</BackButtonLink>
      </p>
      <h2>Публикации @{username}</h2>
      {status.isPending && <Loading message="Проверяем доступ…" />}
      {status.isFetching && status.data && <Loading variant="compact" message="Перепроверяем доступ…" />}
      {status.isError && (
        <div role="alert">
          <p>
            {sessionExpired
              ? "Сессия завершена. Войдите снова."
              : "Не удалось проверить доступность."}
          </p>
          {sessionExpired ? (
            <RouteLink to="/login">Войти</RouteLink>
          ) : (
            <PrimaryButton type="button" onClick={() => void status.refetch()}>
              Повторить проверку
            </PrimaryButton>
          )}
        </div>
      )}
      {statusReady && !status.data.enabled && <p role="status">Моменты сейчас недоступны.</p>}
      {statusReady && status.data.enabled && (
        <>
          {posts.isPending && <Loading message="Загружаем публикации…" />}
          {posts.isFetching && posts.data && !posts.isFetchingNextPage && (
            <Loading variant="compact" message="Перепроверяем публикации…" />
          )}
          {showPostError && (
            <div role="alert">
              <p>
                {postExpired
                  ? "Сессия завершена. Войдите снова."
                  : postForbidden
                    ? "Публикации пользователя недоступны. Профиль может быть удалён, закрыт или недоступен вам."
                    : postMissing
                      ? "Публикации автора недоступны."
                      : "Публикации пользователя недоступны. Профиль может быть удалён, закрыт или недоступен вам."}
              </p>
              {postExpired ? (
                <RouteLink to="/login">Войти</RouteLink>
              ) : (
                !postForbidden && !postMissing && (
                  <PrimaryButton type="button" onClick={() => void posts.refetch()}>
                    Повторить
                  </PrimaryButton>
                )
              )}
            </div>
          )}
          {postsReady && items.length === 0 && (
            <div className={styles.emptyState} data-profile-moments-empty role="status">
              <span className={styles.emptyIcon} aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none" focusable="false">
                  <rect x="10" y="7" width="28" height="34" rx="6" stroke="currentColor" strokeWidth="2" />
                  <circle cx="20" cy="19" r="3" stroke="currentColor" strokeWidth="2" />
                  <path d="M16 32l8-8 5 5 3-3 3 3" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h3 className={styles.emptyTitle}>Публикаций пока нет</h3>
              <p className={styles.emptyDescription}>Нет доступных публикаций этого автора.</p>
            </div>
          )}
          {postsReady && items.length > 0 && (
            <ul className="compact-grid moments-catalog-grid">
              {items.map((post) => (
                <MomentSummary key={post.id} post={post} userId={userId} />
              ))}
            </ul>
          )}
          {postsReady && posts.hasNextPage && !posts.isFetchNextPageError && (
            <PrimaryButton
              type="button"
              disabled={pageBusy}
              onClick={requestNextPage}
            >
              {pageBusy ? "Загрузка…" : "Ещё публикации"}
            </PrimaryButton>
          )}
          {postsReady && posts.isFetchNextPageError && (
            <div role="alert">
              <p>Не удалось загрузить следующую страницу.</p>
              <PrimaryButton type="button" disabled={pageBusy} onClick={requestNextPage}>
                {pageBusy ? "Загрузка…" : "Повторить страницу"}
              </PrimaryButton>
            </div>
          )}
        </>
      )}
    </section>
  );
}
