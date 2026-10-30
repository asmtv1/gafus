import { Loading } from "../../shared/ui";
import { useContext, useRef, useState } from "react";
import { MomentsNotificationsOptIn } from "./MomentsNotificationsOptIn";
import { HiddenAuthorsOptIn } from "./HiddenAuthorsOptIn";
import { PostDetailOptIn } from "./PostDetailOptIn";
import type { DetailWire } from "./postDetailReadApi";
import type { HiddenAuthorsSyntheticTransport } from "./hiddenAuthorsReadApi";
import type { NotificationReadWire } from "./notificationsReadApi";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FEED_LIMITS, FEED_SORT_OPTIONS, type FeedSort, type FeedPersonalizationSettings } from "@gafus/types";
import { getMomentsStatus, listMoments } from "./momentsApi";
import { MomentSummary } from "./MomentSummary";
import { MomentPendingPosts } from "./MomentPendingPosts";
import "./web4-social-visual-parity.css";
import "./moment-feed-refresh.css";
import "./moments-next-shell.css";
import { feedClient } from "./feedClient";
import { RouteLink } from "../../shared/router/location";
import { ApiError } from "../../shared/api/client";
import next from "../../brand/LegacyFeedLayout.module.css";
import { CourseViewSessionContext } from "../courses/courseCatalogFilters";
import { DEFAULT_MOMENTS_VIEW, readMomentsHistoryView,
  saveMomentsHistoryView } from "../readListHistoryView";
import {PrimaryButton, SecondaryButton} from "../../shared/ui";

const labels: Record<FeedSort, string> = {
  smart: "Для вас",
  new: "Новые",
  popular: "Популярные",
  discussed: "Обсуждаемые",
};

/** Next FeedTopBar sections rendered as resolution-independent icons. */
function FeedSectionIcon({ section }: { section: "feed" | "saved" | "hidden" }) {
  return <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    {section === "feed" && <>
      <rect x="5" y="3" width="14" height="18" rx="1" />
      <path d="M8 8h8M8 12h8M8 16h6" />
    </>}
    {section === "saved" && <path d="M6.5 4h11v16l-5.5-3.5L6.5 20V4Z" />}
    {section === "hidden" && <>
      <path d="M4 4l16 16M15.3 8.8a4 4 0 0 0-6.9-3.2M8.6 10.8A4 4 0 0 0 14 11.4" />
      <path d="M4.5 20v-1.2a5 5 0 0 1 7-4.6M15.9 14.4a5 5 0 0 1 3.6 4.4V20" />
    </>}
  </svg>;
}

type MomentsCatalogProps = {
  userId: string;
  showNotificationsOptIn?: boolean;
  notificationSyntheticTransport?: NotificationReadWire;
  showHiddenAuthorsOptIn?: boolean;
  hiddenAuthorsSyntheticTransport?: HiddenAuthorsSyntheticTransport;
  showPostDetailOptIn?: boolean;
  postDetailSyntheticTransport?: DetailWire;
};

export function MomentsCatalog(props: MomentsCatalogProps) {
  const generation = useContext(CourseViewSessionContext);
  return <MomentsCatalogForScope key={JSON.stringify([props.userId, generation])}
    {...props} generation={generation}/>;
}

function MomentsCatalogForScope({
  userId,
  showNotificationsOptIn = false,
  notificationSyntheticTransport,
  showHiddenAuthorsOptIn = false,
  hiddenAuthorsSyntheticTransport,
  showPostDetailOptIn = false,
  postDetailSyntheticTransport,
  generation,
}: MomentsCatalogProps & { generation: string | null }) {
  const scope = { principal: userId, generation };
  const [sort, setSort] = useState<FeedSort>(() =>
    readMomentsHistoryView(scope)?.sort ?? DEFAULT_MOMENTS_VIEW.sort);
  const changeSort = (next: FeedSort) => {
    if (!FEED_SORT_OPTIONS.includes(next)) return;
    saveMomentsHistoryView(scope, { sort: next });
    setSort(next);
  };
  const cache = useQueryClient();
  const [showPersonalization, setShowPersonalization] = useState(false);
  const status = useQuery({
    queryKey: ["moments", "status", userId],
    queryFn: getMomentsStatus,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  // Cached rollout status must not authorize a new post GET or mutation UI.
  const statusReady = status.isSuccess && !status.isFetching;
  const smartOpen = statusReady && status.data.enabled &&
    status.data.smartEnabled && showPersonalization;
  const personalization = useQuery({
    queryKey: ["moments", "personalization", userId],
    queryFn: () => feedClient.getPersonalization(),
    enabled: Boolean(smartOpen),
    retry: false, staleTime: 0, gcTime: 0,
  });
  const personalizationPatch = useMutation({
    mutationFn: (body: Partial<FeedPersonalizationSettings>) => feedClient.setPersonalization(body),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["moments", "personalization", userId] });
      await cache.invalidateQueries({ queryKey: ["moments", "list", userId] });
    },
  });
  const personalizationReset = useMutation({
    mutationFn: () => feedClient.resetPersonalization(),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["moments", "personalization", userId] });
      await cache.invalidateQueries({ queryKey: ["moments", "list", userId] });
    },
  });
  const feed = useInfiniteQuery({
    queryKey: ["moments", "list", userId, sort],
    queryFn: ({ pageParam }) => listMoments(sort, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: statusReady && status.data.enabled === true,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    // Renew signed image/MP4 links before their five-minute deadline in one batch.
    refetchInterval: Math.floor(FEED_LIMITS.mediaUrlSeconds * 1000 * 0.8),
  });
  // The query observer's fetching flag is updated after a React commit.
  // Guard double clicks synchronously, keyed to current actor and feed sort.
  const pageKey = JSON.stringify([userId, sort]);
  const flightRef = useRef<{ key: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const pageBusy = busyKey === pageKey || feed.isFetchingNextPage;
  const requestNextPage = () => {
    if (flightRef.current?.key === pageKey || feed.isFetchingNextPage) return;
    const flight = { key: pageKey };
    flightRef.current = flight;
    setBusyKey(pageKey);
    const release = () => {
      if (flightRef.current !== flight) return;
      flightRef.current = null;
      setBusyKey((current) => current === pageKey ? null : current);
    };
    void feed.fetchNextPage({ cancelRefetch: false }).then(release, release);
  };
  const feedUnauthenticated = feed.error instanceof ApiError && feed.error.status === 401;
  const feedForbidden = feed.error instanceof ApiError && feed.error.status === 403;
  const feedNotFound = feed.error instanceof ApiError && feed.error.status === 404;
  const feedDenied = feed.isError && (feedUnauthenticated || feedForbidden || feedNotFound);
  const feedPageDenied = feed.isFetchNextPageError && feedDenied;
  const showFeedError = feed.isError && (!feed.isFetchNextPageError || feedPageDenied);
  // Keep verified earlier pages on transient next-page failures only; a 401,
  // 403 or 404 must hide cached posts and actions until another authorized GET.
  const feedReady =
    statusReady &&
    status.data.enabled &&
    !feedDenied &&
    // A first-page revalidation invalidates the authority of cached posts.
    // Scrolling for NEXT page is different: earlier pages remain verified.
    (!feed.isFetching || feed.isFetchingNextPage) &&
    (feed.isSuccess || (feed.isFetchNextPageError && !feedPageDenied));
  const seen = new Set<string>();
  const posts = (feedReady ? feed.data!.pages.flatMap((page) => page.items) : []).filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
  const expired = status.error instanceof ApiError && status.error.status === 401;

  return (
    <section className={`${next.surface} ${next.momentsSurface} collection-section next-feed-page`}
      aria-label="Моменты" data-next-feed>
      <header className={next.feedTopBar}>
        <div className={next.feedTopBarMain}>
          <div className={next.feedHeading}>
            <span className={next.feedEyebrow}>Сообщество GAFUS</span>
            <h1 className={next.feedTopBarTitle}>Моменты</h1>
            <p className={next.feedTopBarDescription}>
              Истории, фотографии и видео о жизни с питомцами.
            </p>
          </div>
          {statusReady && status.data.enabled && !feedDenied &&
            <div className={next.feedTopBarActions}>
              <RouteLink to="/feed/notifications" className={next.feedNotifications}
                aria-label="Уведомления">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                  strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>
              </RouteLink>
              <RouteLink className={`${next.feedCreate} next-feed-create-link`} to="/moments/new"
                aria-label="Создать публикацию">
                <span className="next-feed-create-plus" aria-hidden="true">＋</span>
                <span className="next-feed-create-text">Новая публикация</span>
              </RouteLink>
            </div>}
        </div>
        {statusReady && status.data.enabled && !feedDenied &&
          <nav className={next.feedNav} aria-label="Разделы «Моментов»">
            <RouteLink to="/moments" className={`${next.feedNavItem} ${next.feedNavItemActive}`}
              current><FeedSectionIcon section="feed" />Лента</RouteLink>
            <RouteLink to="/moments/saved" className={next.feedNavItem}>
              <FeedSectionIcon section="saved" />Сохранённое</RouteLink>
            <RouteLink to="/feed/hidden-authors" className={next.feedNavItem}>
              <FeedSectionIcon section="hidden" />Скрытые авторы</RouteLink>
          </nav>}
      </header>
      {status.isPending && <Loading message="Проверяем доступность «Моментов»…" />}
      {status.isFetching && status.data && (
        <Loading variant="compact" message="Перепроверяем доступность «Моментов»…" />
      )}
      {status.isError && (
        <div role="alert">
          <p>
            {expired
              ? "Сессия завершена. Войдите снова."
              : "Не удалось проверить доступность «Моментов»."}
          </p>
          {expired ? (
            <RouteLink to="/login">Войти</RouteLink>
          ) : (
            <PrimaryButton type="button" onClick={() => void status.refetch()}>
              Повторить
            </PrimaryButton>
          )}
        </div>
      )}
      {statusReady && !status.data.enabled && <p role="status">Моменты сейчас недоступны.</p>}
      {statusReady && status.data.enabled && (
        <>
          {!feedDenied && (
            <>
              <MomentPendingPosts userId={userId} />
              <MomentsNotificationsOptIn
                enabled={showNotificationsOptIn}
                ownerId={userId}
                transport={notificationSyntheticTransport}
              />
              <HiddenAuthorsOptIn
                enabled={showHiddenAuthorsOptIn}
                ownerId={userId}
                transport={hiddenAuthorsSyntheticTransport}
              />
              <div className={`${next.feedSortToolbar} next-feed-sort`}>
                <div className={next.feedSortHeader}>
                  <h2 className={next.feedSortHeading}>Лента публикаций</h2>
                  <span className={next.feedSortLabel}>Сортировать по</span>
                </div>
                <div className={next.feedSortControls}>
                  <div className={next.feedSortOptions} role="group" aria-label="Сортировка публикаций">
                    {FEED_SORT_OPTIONS.filter(value => value !== "smart" || status.data.smartEnabled)
                      .map(value => <button key={value} type="button"
                        className={next.feedSortOption} data-feed-sort={value}
                        aria-pressed={sort === value}
                        onClick={() => changeSort(value)}>{labels[value]}</button>)}
                  </div>
                  {status.data.smartEnabled && <button className={next.feedSettingsButton}
                    type="button" aria-expanded={showPersonalization}
                    aria-controls="web4-feed-personalization"
                    onClick={() => setShowPersonalization(current => !current)}>Настроить</button>}
                </div>
              </div>
              {smartOpen && <section id="web4-feed-personalization"
                className="web4-feed-personalization" aria-label="Настройки ленты">
                <h2>Персонализация</h2>
                {personalization.isPending && <Loading message="Загружаем настройки…" />}
                {personalization.isError && <p role="alert">Не удалось загрузить настройки.</p>}
                {personalization.isSuccess && !personalization.isFetching &&
                  ([
                    ["enabled", "Персональные рекомендации"],
                    ["useCity", "Мой город"],
                    ["usePets", "Мои питомцы"],
                    ["useBehavior", "Моя активность"],
                    ["exploration", "Новые авторы"],
                  ] as const).map(([key, label]) => <label key={key}>
                    <input type="checkbox" checked={personalization.data[key]}
                      disabled={personalizationPatch.isPending || personalizationReset.isPending ||
                        (key !== "enabled" && !personalization.data.enabled)}
                      onChange={event =>
                        personalizationPatch.mutate({ [key]: event.target.checked })} />
                    {label}
                  </label>)}
                <SecondaryButton variant="red" type="button" disabled={personalizationPatch.isPending ||
                  personalizationReset.isPending} onClick={() => {
                    if (window.confirm("Сбросить рекомендации? Реакции, комментарии и закладки сохранятся."))
                      personalizationReset.mutate();
                  }}>Сбросить рекомендации</SecondaryButton>
                {(personalizationPatch.isError || personalizationReset.isError) &&
                  <p role="alert">Не удалось сохранить настройки. Обновите страницу перед повтором.</p>}
              </section>}
            </>
          )}
          {feed.isPending && <Loading message="Загружаем публикации…" />}
          {feed.isFetching && feed.data && !feed.isFetchingNextPage && (
            <Loading variant="compact" message="Перепроверяем публикации…" />
          )}
          {showFeedError && (
            <div role="alert">
              <p>
                {feedUnauthenticated
                  ? "Сессия завершена. Войдите снова."
                  : feedForbidden
                    ? "Нет доступа к публикациям."
                    : feedNotFound
                      ? "Раздел недоступен."
                      : "Не удалось загрузить публикации."}
              </p>
              {feedUnauthenticated ? (
                <RouteLink to="/login">Войти</RouteLink>
              ) : (
                !feedForbidden && !feedNotFound && (
                  <PrimaryButton type="button" onClick={() => void feed.refetch()}>
                    Повторить
                  </PrimaryButton>
                )
              )}
            </div>
          )}
          {feedReady && posts.length === 0 && <p className="empty-state">Публикаций пока нет.</p>}
          {feedReady && posts.length > 0 && (
            <PostDetailOptIn
              enabled={showPostDetailOptIn}
              ownerId={userId}
              postId={posts[0].id}
              transport={postDetailSyntheticTransport}
            />
          )}
          {feedReady && posts.length > 0 && (
            <ul className="compact-grid moments-catalog-grid">
              {posts.map((post) => (
                <MomentSummary post={post} userId={userId} key={post.id} />
              ))}
            </ul>
          )}
          {feedReady && feed.hasNextPage && !feed.isFetchNextPageError && (
            <PrimaryButton
              type="button"
              disabled={pageBusy}
              onClick={requestNextPage}
            >
              {pageBusy ? "Загрузка…" : "Ещё публикации"}
            </PrimaryButton>
          )}
          {feedReady && feed.isFetchNextPageError && (
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
