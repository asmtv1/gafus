import { Loading } from "../../shared/ui";
import { BackButtonLink, PrimaryButton } from "../../shared/ui";
import { useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getMomentsStatus, listSavedMoments } from "./momentsApi";
import { MomentSummary } from "./MomentSummary";
// Share the EXACT card style context with MomentsCatalog: both pages render
// MomentSummary, not separate saved-card implementations.
import "./web4-social-visual-parity.css";
import "./moment-feed-refresh.css";
import "./moments-next-shell.css";
import { RouteLink } from "../../shared/router/location";
import { ApiError } from "../../shared/api/client";
import styles from "./MomentsSaved.module.css";

export function MomentsSaved({ userId }: { userId: string }) {
  const status = useQuery({
    queryKey: ["moments", "status", userId],
    queryFn: getMomentsStatus,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  // Cached rollout permission must not authorize private bookmarks while its
  // current-session status is still being revalidated or has failed.
  const statusReady = status.isSuccess && status.fetchStatus === "idle";
  const accessEnabled = statusReady && status.data.enabled;
  const page = useInfiniteQuery({
    queryKey: ["moments", "saved", userId],
    queryFn: ({ pageParam }) => listSavedMoments(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (value) => value.nextCursor ?? undefined,
    enabled: accessEnabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  // React commits fetching state asynchronously: block same-turn next/retry
  // synchronously, scoped to this owner's saved-post query identity.
  const pageKey = JSON.stringify([userId]);
  const flightRef = useRef<{ key: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const pageBusy = busyKey === pageKey || page.isFetchingNextPage;
  const requestNextPage = () => {
    if (flightRef.current?.key === pageKey || page.isFetchingNextPage) return;
    const flight = { key: pageKey };
    flightRef.current = flight;
    setBusyKey(pageKey);
    const release = () => {
      if (flightRef.current !== flight) return;
      flightRef.current = null;
      setBusyKey((current) => (current === pageKey ? null : current));
    };
    void page.fetchNextPage({ cancelRefetch: false }).then(release, release);
  };
  const sessionExpired = status.error instanceof ApiError && status.error.status === 401;
  const savedExpired = page.error instanceof ApiError && page.error.status === 401;
  const savedForbidden = page.error instanceof ApiError && page.error.status === 403;
  const savedMissing = page.error instanceof ApiError && page.error.status === 404;
  // A denied next-page GET invalidates displayed bookmarks. Only transient
  // page failures retain verified older pages and the manual cursor retry.
  const pageDenied = page.isFetchNextPageError &&
    (savedExpired || savedForbidden || savedMissing);
  const showPageError = page.isError && (!page.isFetchNextPageError || pageDenied);
  const pageReady =
    accessEnabled &&
    (page.isSuccess || (page.isFetchNextPageError && !pageDenied)) &&
    (!page.isFetching || page.isFetchingNextPage);
  const seen = new Set<string>();
  const posts = (pageReady ? page.data!.pages.flatMap((p) => p.items) : []).filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
  return (
    <section className="collection-section next-feed-page moments-saved-page" aria-label="Закладки «Моментов»">
      <p>
        <BackButtonLink to="/moments">Моменты</BackButtonLink>
      </p>
      <h2>Сохранённые публикации</h2>
      {(status.isPending || status.isFetching) && <Loading message="Проверяем доступ…" />}
      {status.isError && (
        <div role="alert">
          <p>
            {sessionExpired
              ? "Сессия завершена. Войдите снова."
              : "Не удалось проверить доступность раздела."}
          </p>
          {sessionExpired ? (
            <RouteLink to="/login">Войти</RouteLink>
          ) : (
            <PrimaryButton type="button" onClick={() => void status.refetch()}>
              Проверить снова
            </PrimaryButton>
          )}
        </div>
      )}
      {statusReady && !status.data.enabled && <p>Моменты сейчас недоступны.</p>}
      {accessEnabled && (
        <>
          {page.isPending && <Loading message="Загружаем закладки…" />}
          {page.isFetching && page.data && !page.isFetchingNextPage && (
            <Loading variant="compact" message="Перепроверяем закладки…" />
          )}
          {showPageError && (
            <div role="alert">
              <p>
                {savedExpired
                  ? "Сессия завершена. Войдите снова."
                  : savedForbidden
                    ? "Нет доступа к сохранённым публикациям."
                    : savedMissing
                      ? "Сохранённые публикации недоступны."
                      : "Не удалось загрузить закладки."}
              </p>
              {savedExpired ? (
                <RouteLink to="/login">Войти</RouteLink>
              ) : (
                !savedForbidden && !savedMissing && (
                  <PrimaryButton type="button" onClick={() => void page.refetch()}>
                    Повторить
                  </PrimaryButton>
                )
              )}
            </div>
          )}
          {pageReady && posts.length === 0 && (
            <p className={styles.emptyState}>Сохранённых публикаций пока нет.</p>
          )}
          {pageReady && posts.length > 0 && (
            <ul className="compact-grid moments-catalog-grid">
              {posts.map((post) => (
                <MomentSummary key={post.id} userId={userId} post={post} />
              ))}
            </ul>
          )}
          {pageReady && page.hasNextPage && !page.isFetchNextPageError && (
            <PrimaryButton
              type="button"
              disabled={pageBusy}
              onClick={requestNextPage}
            >
              {pageBusy ? "Загрузка…" : "Ещё закладки"}
            </PrimaryButton>
          )}
          {pageReady && page.isFetchNextPageError && (
            <div role="alert">
              <p>Не удалось загрузить следующую страницу.</p>
              <PrimaryButton
                type="button"
                disabled={pageBusy}
                onClick={requestNextPage}
              >
                {pageBusy ? "Загрузка…" : "Повторить страницу"}
              </PrimaryButton>
            </div>
          )}
        </>
      )}
    </section>
  );
}
