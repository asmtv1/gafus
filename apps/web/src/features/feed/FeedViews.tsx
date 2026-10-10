"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FEED_LIMITS, FEED_REACTIONS, countFeedCharacters, formatFeedTime,
  type FeedPostDto, type FeedCommentDto, type FeedReaction, type FeedSort, type FeedImpressionInput,
} from "@gafus/types";
import { FeedActions, FeedReportForm } from "./FeedActions";
import { publicationPhaseLabel, type PublicationItem } from "@gafus/core/services/feed/publication-client";
import { webFeedPublications } from "./publication";
const EMPTY_PUBLICATIONS: PublicationItem[] = [];
import { feedApi } from "./api";
import { webFeedTelemetry } from "./telemetry";
import { observeFeedVisibility } from "./visibility";
import { uploadFeedBrowserAsset, validateBrowserFeedFiles, type FeedBrowserAsset } from "./upload";
import { FeedVideo } from "./FeedVideo";
import { FeedAlbumPicker } from "./FeedAlbumPicker";
import { FeedTopBar } from "./FeedTopBar";
import { GafusPostProgress } from "@/features/gafus/GafusPostProgress";
import { MOMENTS_HEADER_URI } from "./momentsHeaderArtwork";
import { AppBackButtonLink, LoadingState } from "@/shared/components/ui";
import styles from "./Feed.module.css";

function message(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось загрузить данные.";
}
function Access({ children }: { children: React.ReactNode }) {
  return <div className={styles.card}>{children}</div>;
}
function useFeedEnabled() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const enabled = useQuery({
    queryKey: ["feed-availability", userId],
    queryFn: () => feedApi.status(),
    enabled: !!userId && status === "authenticated",
    retry: 1,
    staleTime: 30_000,
  });
  return { status, userId, enabled };
}
function LoadingOrDenied({ status, enabled }: ReturnType<typeof useFeedEnabled>) {
  if (status === "loading") return <Access><LoadingState variant="inline" message="Проверяем доступность «Моментов»…" /></Access>;
  if (status !== "authenticated") return <Access><p>Войдите в аккаунт, чтобы открыть «Моменты».</p></Access>;
  if (enabled.isPending) return <Access><LoadingState variant="inline" message="Проверяем доступность «Моментов»…" /></Access>;
  if (enabled.isError) return <Access><p role="alert">{message(enabled.error)}</p><button type="button" className={styles.secondary} onClick={() => void enabled.refetch()}>Повторить</button></Access>;
  return <Access><p>Раздел «Моменты» пока недоступен. Ваши публикации и альбомы не затронуты.</p></Access>;
}
function FeedMedia({ post }: { post: FeedPostDto }) {
  const [position, setPosition] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const items = post.attachments;
  const currentIndex = Math.min(position, items.length - 1);
  const item = items[currentIndex];
  const move = (delta: number) => setPosition(value => (value + delta + items.length) % items.length);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (viewerOpen && !element.open) element.showModal();
    if (!viewerOpen && element.open) element.close();
    return () => { if (element.open) element.close(); };
  }, [viewerOpen]);
  if (!items.length || !item) return null;
  const photoSrc = item.kind === "photo" ? item.fullUrl ?? item.thumbUrl : null;
  const dotCount = Math.min(items.length, 5);
  const firstDot = Math.max(0, Math.min(currentIndex - 2, items.length - dotCount));
  return <>
    <div className={styles.carousel} role="region" aria-roledescription="Карусель"
      aria-label="Вложения публикации" tabIndex={0}
      onKeyDown={event => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1);
        }
      }}>
      <div className={styles.media}>
        {items.length > 1 && <button type="button" className={styles.carouselArrow}
          aria-label="Предыдущее вложение" onClick={() => move(-1)}>‹</button>}
        <div className={styles.mediaItem} aria-live="polite">
          {photoSrc ?
            <button type="button" className={styles.openPhoto}
              aria-label={`Увеличить фотографию ${currentIndex + 1}`}
              onClick={() => setViewerOpen(true)}>
              {/* Signed CDN media cannot use Next image optimization. */}
              <img src={photoSrc} alt={`Фото ${currentIndex + 1} из ${items.length}`}
                loading="lazy" referrerPolicy="no-referrer" />
            </button> :
            item.kind === "video" ?
              <FeedVideo key={item.id} mediaId={item.id} poster={item.posterUrl} /> :
              <span className={styles.muted}>Файл обрабатывается</span>}
        </div>
        {items.length > 1 && <button type="button" className={styles.carouselArrow}
          aria-label="Следующее вложение" onClick={() => move(1)}>›</button>}
      </div>
      {items.length > 1 && <div className={styles.carouselDots}
        role="status" aria-label={`Вложение ${currentIndex + 1} из ${items.length}`}>
        {Array.from({ length: dotCount }, (_, offset) => firstDot + offset).map((index, offset) => (
          <span key={index} aria-hidden="true" className={[
            styles.carouselDot,
            index === currentIndex ? styles.carouselDotActive : "",
            index !== currentIndex && (
              (offset === 0 && firstDot > 0) ||
              (offset === dotCount - 1 && firstDot + dotCount < items.length)
            ) ? styles.carouselDotEdge : "",
          ].filter(Boolean).join(" ")} />
        ))}
      </div>}
    </div>
    <dialog ref={dialog} className={styles.photoDialog} aria-label="Просмотр фотографии"
      onClose={() => setViewerOpen(false)}>
      <div className={styles.dialogActions}>
        <button type="button" className={styles.secondary} onClick={() => setViewerOpen(false)}>Закрыть ×</button>
      </div>
      {photoSrc && <img src={photoSrc} alt={`Фото ${currentIndex + 1} из ${items.length}`}
        referrerPolicy="no-referrer" />}
      {items.length > 1 && <div className={styles.dialogActions}>
        <button type="button" className={styles.secondary} onClick={() => move(-1)}>← Назад</button>
        <span>{currentIndex + 1} / {items.length}</span>
        <button type="button" className={styles.secondary} onClick={() => move(1)}>Далее →</button>
      </div>}
    </dialog>
  </>;
}
type ImpressionContext = Omit<FeedImpressionInput, "eventId" | "visibleMs">;
function sendFeedOutcome(impression: ImpressionContext | undefined, kind: "dwell" | "post_open" | "profile_open", durationMs = 0, ownerId?: string) {
  if (!impression?.exposureToken || !ownerId) return;
  const telemetry = webFeedTelemetry(ownerId);
  telemetry.enqueueOutcome({
    ...impression, eventId: crypto.randomUUID(), exposureToken: impression.exposureToken,
    kind, durationMs: Math.min(120000, Math.max(0, Math.round(durationMs))),
  });
  void telemetry.flush();
}
function ViewObserver({ post, impression, ownerId }: { post: FeedPostDto; impression?: ImpressionContext; ownerId?: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (post.canDelete) return;
    const element = marker.current?.closest("article");
    if (!element) return;
    return observeFeedVisibility(element, {
      visibleFraction: FEED_LIMITS.viewVisibleFraction,
      qualifiedAfterMs: FEED_LIMITS.viewVisibleMilliseconds,
      onQualified: () => {
        void feedApi.recordView(post.id).catch(() => {});
        if (impression?.exposureToken && ownerId) {
          const telemetry = webFeedTelemetry(ownerId);
          telemetry.enqueueImpression({
            ...impression, eventId: crypto.randomUUID(),
            visibleMs: FEED_LIMITS.viewVisibleMilliseconds,
          });
          void telemetry.flush();
        }
      },
      onDwell: ms => sendFeedOutcome(impression, "dwell", ms, ownerId),
    });
  }, [post.id, post.canDelete, impression?.rankingSessionId, impression?.rank,
    impression?.algorithmVersion, impression?.exposureToken, ownerId]);
  return <span ref={marker} hidden />;
}
export function FeedCard({ post, compact = false, impression, ownerId }: { post: FeedPostDto; compact?: boolean; impression?: ImpressionContext; ownerId?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [reactionOpen, setReactionOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const cache = useQueryClient();
  const long = countFeedCharacters(post.text) > 300;
  const date = post.publishedAt ?? post.createdAt;
  const react = async (reaction: FeedReaction) => {
    setProcessing(true);
    try {
      if (post.myReaction === reaction) await feedApi.removePostReaction(post.id);
      else await feedApi.setPostReaction(post.id, reaction);
      await cache.invalidateQueries({ queryKey: ["feed"] });
    } catch (err) { window.alert(message(err)); }
    finally { setProcessing(false); }
  };
  const people = useQuery({
    queryKey: ["feed", "reactions", post.id],
    queryFn: () => feedApi.listPostReactions(post.id),
    enabled: reactionOpen,
  });
  return <article className={styles.card} aria-label="Публикация">
    <ViewObserver post={post} impression={impression} ownerId={ownerId} />
    <div className={styles.meta}>
      <span className={styles.avatar}>{post.author.avatarUrl ?
        // Signed CDN media must load directly without Next Image optimization.
        <img src={post.author.avatarUrl} alt="" /> : "🐾"}</span>
      <span><Link className={styles.author} href={`/profile?username=${encodeURIComponent(post.author.username)}`} onClick={() => sendFeedOutcome(impression, "profile_open", 0, ownerId)}>{post.author.name}</Link>
        <time className={styles.time} dateTime={date}>{formatFeedTime(date)}{post.editedAt ? " · Изменён" : ""}</time></span>
    </div>
    {post.moderationState && post.moderationState !== "visible" && <p role="status" className={styles.error}>
      {post.moderationState === "removed" ? "Публикация удалена" : "Публикация скрыта"} из-за жалобы. {post.moderationReason}
    </p>}
    <FeedActions post={post} />
    <FeedMedia post={post} />
    {post.text && <div><p className={`${styles.postText} ${!expanded && !compact ? styles.clamped : ""}`}>{post.text}</p>
      {long && !compact && <button className={styles.textButton} type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Свернуть" : "Ещё"}</button>}</div>}
    {!compact && <div className={styles.reactions} aria-label="Реакции">
      {FEED_REACTIONS.map(reaction => <button key={reaction} type="button" className={styles.reaction}
        aria-label={`Реакция ${reaction}`} aria-pressed={post.myReaction === reaction} disabled={processing}
        onClick={() => void react(reaction)}>
        {reaction} {post.reactions.find(item => item.emoji === reaction)?.count ?? ""}
      </button>)}
    </div>}
    <div className={styles.stats}>
      <span aria-label="Просмотры">{post.viewCount} 👁</span>
      <Link href={`/feed/${encodeURIComponent(post.id)}`} onClick={() => sendFeedOutcome(impression, "post_open", 0, ownerId)}>{post.commentCount} комментариев</Link>
      {!compact && <button type="button" className={styles.textButton} onClick={() => setReactionOpen(!reactionOpen)}>Кто отреагировал</button>}
      {post.canEdit && <Link href={`/feed/create?edit=${encodeURIComponent(post.id)}`}>Изменить</Link>}
    </div>
    {reactionOpen && <div className={styles.comment} aria-label="Пользователи, поставившие реакции">
      {people.isPending ? <LoadingState variant="inline" message="Загрузка реакций…" /> : people.isError ? message(people.error) : !people.data?.items.length ? "Нет реакций" :
        people.data.items.map(entry => <p key={entry.user.id}><Link href={`/profile?username=${encodeURIComponent(entry.user.username)}`}>{entry.user.name}</Link> {entry.reaction}</p>)}
    </div>}
  </article>;
}
function FeedPendingPosts() {
  const { data: session } = useSession();
  const local = useSyncExternalStore(webFeedPublications.subscribe, webFeedPublications.getSnapshot,
    () => EMPTY_PUBLICATIONS).filter(item => item.ownerId === session?.user?.id);
  const pending = useQuery({
    queryKey: ["feed", "pending", session?.user?.id],
    queryFn: () => feedApi.listPendingPosts(),
    enabled: Boolean(session?.user?.id),
    refetchInterval: 20_000,
  });
  const serverOnly = (pending.data?.items ?? []).filter(post => !local.some(item => item.postId === post.id));
  if (!local.length && !serverOnly.length && !pending.isError) return null;
  return <section className={styles.pendingSection} aria-label="Мои публикации в обработке">
    {local.map(item => <article key={item.id} className={styles.pendingPost} aria-live="polite">
      <div className={styles.pendingMedia}>
        {item.previewUri && <img src={item.previewUri} alt="" />}
        {item.phase !== "failed" && item.phase !== "published" && <LoadingState variant="inline" message="" />}
      </div>
      <div className={styles.pendingBody}>
        <strong>{publicationPhaseLabel(item)}</strong>
        {item.text && <p className={styles.pendingExcerpt}>{item.text}</p>}
        {item.phase === "uploading" && item.progress !== null && <div className={styles.pendingTrack}
          role="progressbar" aria-label="Загрузка вложений" aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${item.progress}%` }} />
        </div>}
        {item.error && <p role="alert" className={styles.error}>{item.error}</p>}
        {item.phase === "failed" && <div className={styles.actions}>
          <button className={styles.primary} type="button" onClick={() => webFeedPublications.retry(item.id)}>Повторить</button>
          <button className={styles.secondary} type="button" onClick={() => webFeedPublications.dismiss(item.id)}>Скрыть</button>
        </div>}
      </div>
    </article>)}
    {serverOnly.length > 0 && <strong className={styles.pendingRecovered}>Незавершённые публикации</strong>}
    {pending.isError && <p role="alert">Не удалось проверить статус. <button type="button"
      className={styles.secondary} onClick={() => void pending.refetch()}>Повторить</button></p>}
    {serverOnly.map(post => <div className={styles.comment} key={post.id}>
      <span>{post.text ? post.text.slice(0, 100) : "Публикация с вложениями"}</span>
      <span className={styles.muted}>{post.status === "pending" ? "Обрабатывается…" :
        post.status === "failed" ? "Ошибка обработки" : "Черновик"}</span>
      <Link href={`/feed/create?edit=${encodeURIComponent(post.id)}`}>Продолжить</Link>
    </div>)}
  </section>;
}
export function FeedListPage() {
  const access = useFeedEnabled();
  const cache = useQueryClient();
  const publishing = useSyncExternalStore(webFeedPublications.subscribe,
    webFeedPublications.getSnapshot, () => EMPTY_PUBLICATIONS)
    .some(item => item.ownerId === access.userId && item.phase !== "published");
  useEffect(() => {
    const seen = new Set<string>();
    return webFeedPublications.subscribe(() => {
      for (const item of webFeedPublications.getSnapshot()) {
        if (item.ownerId !== access.userId || item.phase !== "published" || !item.postId || seen.has(item.id)) continue;
        seen.add(item.id);
        void cache.invalidateQueries({ queryKey: ["feed"] });
      }
    });
  }, [cache, access.userId]);
  const [sort, setSort] = useState<FeedSort>("new");
  useEffect(() => {
    if (!access.userId) { setSort("new"); return; }
    const saved = localStorage.getItem(`gafus:feed:sort:${access.userId}`);
    if (saved === "new" || saved === "popular" || saved === "discussed" ||
      (saved === "smart" && access.enabled.data?.smartEnabled)) setSort(saved);
    else setSort(access.enabled.data?.smartEnabled ? "smart" : "new");
  }, [access.userId, access.enabled.data?.smartEnabled]);
  const [showPersonalization, setShowPersonalization] = useState(false);
  const [personalizationError, setPersonalizationError] = useState("");
  const personalization = useQuery({
    queryKey: ["feed", "personalization", access.userId],
    queryFn: () => feedApi.getPersonalization(),
    enabled: access.enabled.data?.smartEnabled === true,
  });
  const updatePersonalization = async (key: "enabled" | "useCity" | "usePets" | "useBehavior" | "exploration", value: boolean) => {
    try {
      setPersonalizationError("");
      await feedApi.setPersonalization({ [key]: value });
      cache.removeQueries({ queryKey: ["feed", "posts", access.userId, "smart"] });
      await cache.invalidateQueries({ queryKey: ["feed", "personalization", access.userId] });
      await cache.invalidateQueries({ queryKey: ["feed", "posts", access.userId] });
    } catch (error) { setPersonalizationError(message(error)); }
  };
  const [hiddenAuthor, setHiddenAuthor] = useState<{ id: string; name: string } | null>(null);
  const [undoError, setUndoError] = useState("");
  useEffect(() => {
    const listener = (event: Event) => setHiddenAuthor((event as CustomEvent<{ id: string; name: string }>).detail);
    window.addEventListener("feed-author-hidden", listener);
    return () => window.removeEventListener("feed-author-hidden", listener);
  }, []);
  const query = useInfiniteQuery({
    queryKey: ["feed", "posts", access.userId, sort],
    queryFn: ({ pageParam }) => feedApi.listPosts({ cursor: pageParam, sort }),
    refetchInterval: 90_000,
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor,
    enabled: access.enabled.data?.enabled === true,
    gcTime: 30_000,
  });
  const posts = query.data?.pages.flatMap(page => page.items) ?? [];
  return <main className={`${styles.surface} ${styles.momentsSurface}`}>
    <div className={styles.momentsHero}>
      <Image
        src={MOMENTS_HEADER_URI}
        className={styles.momentsHeroImage}
        alt="Моменты. Делитесь фотографиями, видео и историями о своих питомцах"
        width={1200}
        height={556}
        priority
        unoptimized
      />
    </div>
    <FeedTopBar active="feed" showActions={access.enabled.data?.enabled === true} />
    {!access.enabled.data?.enabled ? <LoadingOrDenied {...access} /> :
      <div className={styles.feed}>
        <div className={styles.feedSortToolbar}>
          <label htmlFor="feed-sort" className={styles.feedSortLabel}>Сортировка</label>
          <select id="feed-sort" className={styles.feedSortSelect} value={sort}
            onChange={event => {
              const next = event.target.value as FeedSort;
              setSort(next);
              if (access.userId) localStorage.setItem(`gafus:feed:sort:${access.userId}`, next);
            }}>
            {access.enabled.data?.smartEnabled && <option value="smart">Для вас</option>}
            <option value="new">Сначала новые</option>
            <option value="popular">Сначала популярные</option>
            <option value="discussed">Сначала резонансные</option>
          </select>
          {access.enabled.data?.smartEnabled && <button type="button" className={styles.secondary}
            aria-expanded={showPersonalization} onClick={() => setShowPersonalization(value => !value)}>
            Настроить
          </button>}
        </div>
        {showPersonalization && <section className={styles.card} aria-label="Настройки ленты">
          <h2>Персонализация</h2>
          {personalization.isPending ? <LoadingState variant="inline" message="Загружаем настройки…" /> :
            personalization.isError ? <p role="alert">{message(personalization.error)}</p> :
            ([
              ["enabled", "Персональные рекомендации"],
              ["useCity", "Мой город"],
              ["usePets", "Мои питомцы"],
              ["useBehavior", "Моя активность"],
              ["exploration", "Новые авторы"],
            ] as const).map(([key, label]) => <label key={key}
              style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <input type="checkbox" checked={personalization.data?.[key] ?? true}
                disabled={key !== "enabled" && !personalization.data?.enabled}
                onChange={event => void updatePersonalization(key, event.target.checked)} />
              {label}
            </label>)}
          <button type="button" className={styles.secondary} onClick={async () => {
            if (!window.confirm("Сбросить рекомендации? Реакции, комментарии и закладки сохранятся.")) return;
            try {
              setPersonalizationError("");
              await feedApi.resetPersonalization();
              cache.removeQueries({ queryKey: ["feed", "posts", access.userId, "smart"] });
              await cache.invalidateQueries({ queryKey: ["feed", "posts", access.userId] });
            } catch (error) { setPersonalizationError(message(error)); }
          }}>Сбросить рекомендации</button>
          {personalizationError && <p role="alert">{personalizationError}</p>}
        </section>}
        {sort === "smart" && query.data?.pages.some(page => page.feedMeta?.fallback === "new") &&
          <p className={styles.muted}>Персонализация сейчас недоступна. Показываем новые публикации.</p>}
        {hiddenAuthor && <div className={styles.card} role="status">Публикации автора {hiddenAuthor.name} скрыты.
          <button className={styles.textButton} type="button" onClick={async () => {
            try { await feedApi.setAuthorPreference(hiddenAuthor.id, { hidden: false }); setHiddenAuthor(null); await cache.invalidateQueries({ queryKey: ["feed"] }); }
            catch (error) { setUndoError(message(error)); }
          }}>Отменить</button>
          {undoError && <p role="alert">{undoError}</p>}
        </div>}
        <FeedPendingPosts />
        {query.isPending && <LoadingState variant="inline" message="Загрузка публикаций…" />}
        {query.isError && <p role="alert" className={styles.error}>{message(query.error)} <button type="button" onClick={() => void query.refetch()}>Повторить</button></p>}
        {query.isSuccess && posts.length === 0 && !publishing && <div className={styles.card}><p className={styles.empty}>Здесь пока нет публикаций. Расскажите о своём питомце!</p></div>}
        {posts.map(post => {
          const meta = query.data?.pages[0]?.feedMeta;
          const impression = sort === "smart" && meta?.algorithmVersion &&
            (post.recommendationSessionId ?? meta.rankingSessionId) && post.recommendationRank !== undefined
            ? { postId: post.id, rankingSessionId: (post.recommendationSessionId ?? meta.rankingSessionId)!,
                algorithmVersion: meta.algorithmVersion, rank: post.recommendationRank,
                exposureToken: post.recommendationExposureToken } : undefined;
          return <FeedCard post={post} key={post.id} impression={impression} ownerId={access.userId} />;
        })}
        {query.hasNextPage && <button className={styles.secondary} type="button" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Показать ещё</button>}
        {query.isFetchingNextPage && <LoadingState variant="inline" message="Загружаем публикации…" />}
      </div>}
  </main>;
}
export function FeedComposePage({ editId }: { editId?: string }) {
  const router = useRouter();
  const access = useFeedEnabled();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<FeedBrowserAsset[]>([]);
  const [albumPhotoIds, setAlbumPhotoIds] = useState<string[]>([]);
  const [progress, setProgress] = useState("");
  const completed = useRef(new Map<string, string>());
  const albumCopies = useRef(new Map<string, { requestId: string; mediaId?: string }>());
  const requestId = useRef(typeof crypto !== "undefined" ? crypto.randomUUID() : "");
  const draft = useRef<string | null>(editId ?? null);
  const original = useQuery({ queryKey: ["feed", "editor", editId, access.userId], queryFn: () => feedApi.getEditor(editId!), enabled: !!editId && !!access.enabled.data?.enabled });
  useEffect(() => { if (original.data) setText(original.data.pendingRevision?.text ?? original.data.text); }, [original.data]);
  const selectFiles = (selected: FileList | null) => {
    const additions = Array.from(selected ?? []).map(file => ({ file, requestId: crypto.randomUUID() }));
    try {
      const next = [...files, ...additions];
      validateBrowserFeedFiles(next, [...(original.data?.attachments.map(item => item.kind) ?? []), ...albumPhotoIds.map(() => "photo" as const)]);
      setFiles(next); setError("");
    } catch (err) { setError(message(err)); }
  };
  const moveFile = (index: number, direction: number) => setFiles(items => {
    const next = [...items];
    const to = index + direction;
    if (to < 0 || to >= next.length) return items;
    [next[index], next[to]] = [next[to]!, next[index]!];
    return next;
  });
  const submit = async () => {
    if (busy) return;
    if (!text.trim() && !files.length && !albumPhotoIds.length && !(original.data?.pendingRevision?.attachmentIds.length ||
        original.data?.attachments.length)) { setError("Добавьте текст или вложение."); return; }
    setBusy(true); setError("");
    if (!editId) {
      try {
        validateBrowserFeedFiles(files, albumPhotoIds.map(() => "photo" as const));
        const uploadFiles = files.map((asset, index) => ({
          ...asset, bytes: asset.file.size,
          previewUri: index === 0 && asset.file.type.startsWith("image/")
            ? URL.createObjectURL(asset.file) : undefined,
        }));
        webFeedPublications.enqueue({ ownerId: access.userId!, text, files: uploadFiles, albumPhotoIds });
        router.replace("/feed");
      } catch (err) { setError(message(err)); setBusy(false); }
      return;
    }
    try {
      const post = draft.current ? await feedApi.getEditor(draft.current) : await feedApi.createPost({ clientRequestId: requestId.current });
      draft.current = post.id;
      validateBrowserFeedFiles(files, [...post.attachments.map(item => item.kind), ...albumPhotoIds.map(() => "photo" as const)]);
      const ids = [...(post.pendingRevision?.attachmentIds ?? post.attachments.map(item => item.id))];
      for (const [index, asset] of files.entries()) {
        setProgress(`Загружаем вложение ${index + 1} из ${files.length}…`);
        let id = completed.current.get(asset.requestId);
        if (!id) {
          id = await uploadFeedBrowserAsset(post.id, asset);
          completed.current.set(asset.requestId, id);
        }
        if (!ids.includes(id)) ids.push(id);
      }
      for (const photoId of albumPhotoIds) {
        setProgress("Копируем фотографию из альбома…");
        const previous = albumCopies.current.get(photoId) ?? { requestId: crypto.randomUUID() };
        albumCopies.current.set(photoId, previous);
        if (!previous.mediaId) {
          const asset = await feedApi.copyAlbumPhoto(post.id, { photoId, clientRequestId: previous.requestId });
          previous.mediaId = asset.id;
        }
        if (!ids.includes(previous.mediaId)) ids.push(previous.mediaId);
      }
      setProgress("Сохраняем публикацию…");
      await feedApi.saveRevision(post.id, {
        clientRequestId: crypto.randomUUID(), expectedVersion: post.version,
        text, attachmentIds: ids,
      });
      await feedApi.publishPost(post.id, { clientRequestId: crypto.randomUUID() });
      router.replace(files.length || albumPhotoIds.length ? "/feed?pending=1" : `/feed/${encodeURIComponent(post.id)}`);
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); setProgress(""); }
  };
  return <main className={styles.surface}><div className={styles.header}><h1 className={styles.title}>{editId ? "Изменить публикацию" : "Новая публикация"}</h1><AppBackButtonLink href="/feed">Назад в «Моменты»</AppBackButtonLink></div>
    {!access.enabled.data?.enabled ? <LoadingOrDenied {...access} /> :
      <div className={styles.card}>
        {original.isPending && editId ? <LoadingState variant="inline" message="Загружаем редактор…" /> :
        <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit(); }}>
          <label htmlFor="feed-text">Текст публикации</label>
          <textarea id="feed-text" className={styles.input} value={text} onChange={event => setText(event.target.value)} maxLength={10_000} placeholder="Расскажите о своём питомце…" />
          <div className={styles.counter}>{countFeedCharacters(text)} / {FEED_LIMITS.postCharacters}</div>
          <label htmlFor="feed-files">Фото и видео: максимум 10 вложений, не более 3 видео</label>
          <input id="feed-files" type="file" multiple disabled={busy}
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            onChange={event => { selectFiles(event.target.files); event.target.value = ""; }} />
          {files.map((asset, index) => <div key={asset.requestId} className={styles.actions}>
            <span>{asset.file.name} · {Math.ceil(asset.file.size / 1024)} КиБ</span>
            <button className={styles.textButton} type="button" disabled={busy || index === 0}
              onClick={() => moveFile(index, -1)}>↑</button>
            <button className={styles.textButton} type="button" disabled={busy || index === files.length - 1}
              onClick={() => moveFile(index, 1)}>↓</button>
            <button className={styles.textButton} type="button" disabled={busy}
              onClick={() => setFiles(items => items.filter(item => item.requestId !== asset.requestId))}>Удалить</button>
          </div>)}
          <FeedAlbumPicker selected={albumPhotoIds} disabled={busy}
            onChange={ids => {
              if (ids.length + files.length + (original.data?.attachments.length ?? 0) > FEED_LIMITS.maxAttachments) {
                setError("Максимум 10 вложений."); return;
              }
              setAlbumPhotoIds(ids); setError("");
            }} />
          {albumPhotoIds.length > 0 && <p className={styles.muted}>Выбрано из альбомов: {albumPhotoIds.length}</p>}
          {progress && <p role="status" className={styles.muted}>{progress}</p>}
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <button className={styles.primary} type="submit"
            disabled={busy || (!text.trim() && !files.length && !albumPhotoIds.length && !original.data?.attachments.length &&
              !original.data?.pendingRevision?.attachmentIds.length) ||
              countFeedCharacters(text) > FEED_LIMITS.postCharacters}>
            {busy ? "Публикуем…" : "Опубликовать"}
          </button>
        </form>}
      </div>}
  </main>;
}
export function FeedPostPage({ postId, commentId }: { postId: string; commentId?: string }) {
  const access = useFeedEnabled();
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cache = useQueryClient();
  const post = useQuery({ queryKey: ["feed", "post", postId, access.userId], queryFn: () => feedApi.getPost(postId), refetchInterval: 90_000, enabled: !!access.enabled.data?.enabled });
  const comments = useInfiniteQuery({ queryKey: ["feed", "comments", postId, access.userId],
    queryFn: ({ pageParam }) => feedApi.listComments(postId, { cursor: pageParam }),
    initialPageParam: null as string | null, getNextPageParam: page => page.nextCursor,
    enabled: !!access.enabled.data?.enabled });
  const focused = useQuery({ queryKey: ["feed", "comment", commentId, access.userId],
    queryFn: () => feedApi.getComment(commentId!), enabled: !!commentId && access.enabled.data?.enabled === true, retry: false });
  const focusedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused.data?.postId === postId) focusedRef.current?.scrollIntoView({ block: "center" });
  }, [focused.data, postId]);
  const send = async () => {
    if (!comment.trim()) return;
    setBusy(true); setError("");
    try {
      await feedApi.createComment(postId, { text: comment, replyToId: replyTo, clientRequestId: crypto.randomUUID() });
      setComment(""); setReplyTo(null);
      await Promise.all([cache.invalidateQueries({ queryKey: ["feed", "comments", postId] }), cache.invalidateQueries({ queryKey: ["feed", "post", postId] })]);
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm("Удалить публикацию?")) return;
    try { await feedApi.deletePost(postId); window.location.assign("/feed"); }
    catch (err) { setError(message(err)); }
  };
  return <main className={styles.surface}><div className={styles.header}><AppBackButtonLink href="/feed">Моменты</AppBackButtonLink>{post.data?.canDelete && <button className={styles.textButton} onClick={() => void remove()}>Удалить публикацию</button>}</div>
    {!access.enabled.data?.enabled ? <LoadingOrDenied {...access} /> :
      <div className={styles.feed}>
        {post.isPending && <LoadingState variant="inline" message="Загрузка публикации…" />}
        {post.isError && <p className={styles.error} role="alert">{message(post.error)}</p>}
        {post.data && <FeedCard key={post.data.id} post={post.data} />}
        {post.data?.canDelete && <GafusPostProgress postId={post.data.id} />}
        <section className={styles.card} aria-label="Комментарии">
          <h2>Комментарии</h2>
          {commentId && <div ref={focusedRef} tabIndex={-1} aria-label="Комментарий из уведомления">
            <h3>Комментарий из уведомления</h3>
            {focused.isPending && <LoadingState variant="inline" message="Загрузка комментария…" />}
            {(focused.isError || (focused.data && focused.data.postId !== postId)) && <p role="status">Комментарий недоступен.</p>}
            {focused.data?.postId === postId && <FeedCommentRow item={focused.data} onReply={setReplyTo} />}
          </div>}
          {comments.isPending && <LoadingState variant="inline" message="Загрузка комментариев…" />}
          {comments.isError && <p role="alert" className={styles.error}>{message(comments.error)}</p>}
          {comments.data?.pages.flatMap(page => page.items).map(item => <FeedCommentRow key={item.id} item={item} onReply={setReplyTo} />)}
          {comments.hasNextPage && <button type="button" className={styles.secondary} disabled={comments.isFetchingNextPage} onClick={() => void comments.fetchNextPage()}>Ещё комментарии</button>}
          {comments.isFetchingNextPage && <LoadingState variant="inline" message="Загружаем комментарии…" />}
          {replyTo && <p className={styles.muted}>Ответ на комментарий <button type="button" className={styles.textButton} onClick={() => setReplyTo(null)}>Отменить</button></p>}
          <form className={styles.form} onSubmit={event => { event.preventDefault(); void send(); }}>
            <label htmlFor="feed-comment">Добавить комментарий</label>
            <textarea id="feed-comment" className={styles.input} value={comment} onChange={event => setComment(event.target.value)} maxLength={4_000} />
            {error && <p role="alert" className={styles.error}>{error}</p>}
            <button className={styles.primary} disabled={busy || !comment.trim() || countFeedCharacters(comment) > 2000}>{busy ? "Отправляем…" : "Отправить"}</button>
          </form>
        </section>
      </div>}
  </main>;
}
function FeedCommentRow({ item, onReply }: { item: FeedCommentDto; onReply: (id: string) => void }) {
  const [showReplies, setShowReplies] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cache = useQueryClient();
  const replies = useInfiniteQuery({
    queryKey: ["feed", "replies", item.id],
    queryFn: ({ pageParam }) => feedApi.listReplies(item.id, { cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor,
    enabled: showReplies && !item.rootId,
  });
  const update = async (action: "edit" | "delete" | "react", reaction?: FeedReaction) => {
    setBusy(true); setError("");
    try {
      if (action === "edit") {
        await feedApi.editComment(item.id, { text: draft });
        setEditing(false);
      } else if (action === "delete") {
        if (!window.confirm("Удалить комментарий?")) return;
        await feedApi.deleteComment(item.id);
      } else if (reaction) {
        if (item.myReaction === reaction) await feedApi.removeCommentReaction(item.id);
        else await feedApi.setCommentReaction(item.id, reaction);
      }
      await cache.invalidateQueries({ queryKey: ["feed"] });
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  };
  const [reportOpen, setReportOpen] = useState(false);
  const { data: commentSession } = useSession();
  return <div className={`${styles.comment} ${item.rootId ? styles.reply : ""}`}>
    <Link href={`/profile?username=${encodeURIComponent(item.author.username)}`} className={styles.author}>
      {item.author.name}
    </Link>
    <span className={styles.time}>{formatFeedTime(item.createdAt)}{item.editedAt ? " · Изменён" : ""}</span>
    {item.replyToName && <p className={styles.muted}>Ответ для {item.replyToName}</p>}
    {editing ? <form className={styles.form} onSubmit={event => {
      event.preventDefault(); void update("edit");
    }}>
      <textarea className={styles.input} value={draft} onChange={event => setDraft(event.target.value)}
        maxLength={4000} aria-label="Изменить комментарий" />
      <button type="submit" className={styles.secondary} disabled={busy || !draft.trim() ||
        countFeedCharacters(draft) > FEED_LIMITS.commentCharacters}>Сохранить</button>
      <button type="button" className={styles.textButton} onClick={() => setEditing(false)}>Отменить</button>
    </form> :
      <p className={styles.commentBody}>{item.deleted ? "Комментарий удалён" : item.text}</p>}
    {!item.deleted && <div className={styles.actions}>
      <button className={styles.textButton} type="button" disabled={busy} onClick={() => onReply(item.id)}>Ответить</button>
      {item.author.id !== commentSession?.user?.id && <button className={styles.textButton} type="button" onClick={() => setReportOpen(true)}>Пожаловаться</button>}
      {reportOpen && <FeedReportForm type="comment" id={item.id} onClose={() => setReportOpen(false)} />}
      {item.canEdit && <button className={styles.textButton} type="button" disabled={busy}
        onClick={() => { setDraft(item.text); setEditing(true); }}>Изменить</button>}
      {item.canDelete && <button className={styles.textButton} type="button" disabled={busy}
        onClick={() => void update("delete")}>Удалить</button>}
      {FEED_REACTIONS.map(emoji => <button key={emoji} type="button"
        className={styles.reaction} aria-pressed={item.myReaction === emoji} disabled={busy}
        onClick={() => void update("react", emoji)}>{emoji} {item.reactions.find(r => r.emoji === emoji)?.count ?? ""}</button>)}
    </div>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!item.rootId && item.replyCount > 0 && <button className={styles.textButton} type="button"
      onClick={() => setShowReplies(!showReplies)}>
      {showReplies ? "Скрыть ответы" : `Ответы (${item.replyCount})`}
    </button>}
    {showReplies && (replies.isPending ? <LoadingState variant="inline" message="Загрузка ответов…" /> :
      replies.isError ? <p role="alert" className={styles.error}>Не удалось загрузить ответы.
        <button type="button" onClick={() => void replies.refetch()}>Повторить</button></p> :
      <>
        {replies.data?.pages.flatMap(page => page.items).map(reply =>
          <FeedCommentRow key={reply.id} item={reply} onReply={onReply} />)}
        {replies.hasNextPage && <button type="button" className={styles.secondary}
          onClick={() => void replies.fetchNextPage()} disabled={replies.isFetchingNextPage}>Ещё ответы</button>}
      </>)}
  </div>;
}
export function FeedAuthorPostsPage({ username }: { username: string }) {
  const access = useFeedEnabled();
  const posts = useInfiniteQuery({
    queryKey: ["feed", "profile-posts", access.userId, username],
    queryFn: ({ pageParam }) => feedApi.listProfilePosts(username, { cursor: pageParam }),
    refetchInterval: 90_000,
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor,
    enabled: access.enabled.data?.enabled === true && Boolean(username),
  });
  const items = posts.data?.pages.flatMap(page => page.items) ?? [];
  return <main className={styles.surface}>
    <div className={styles.header}>
      <h1 className={styles.title}>Публикации пользователя</h1>
      <AppBackButtonLink href={`/profile?username=${encodeURIComponent(username)}`}>Профиль</AppBackButtonLink>
    </div>
    {!access.enabled.data?.enabled ? <LoadingOrDenied {...access} /> :
      <div className={styles.feed}>
        {posts.isPending && <LoadingState variant="inline" message="Загружаем публикации…" />}
        {posts.isError && <p className={styles.error} role="alert">Не удалось загрузить публикации. <button className={styles.secondary} type="button" onClick={() => void posts.refetch()}>Повторить</button></p>}
        {posts.isSuccess && items.length === 0 && <section className={styles.card}>Публикаций пока нет.</section>}
        {items.map(post => <FeedCard key={post.id} post={post} />)}
        {posts.hasNextPage && <button className={styles.secondary} type="button" disabled={posts.isFetchingNextPage} onClick={() => void posts.fetchNextPage()}>Показать ещё</button>}
        {posts.isFetchingNextPage && <LoadingState variant="inline" message="Загружаем публикации…" />}
      </div>}
  </main>;
}

export function FeedNotificationsPage() {
  const access = useFeedEnabled();
  const notifications = useQuery({ queryKey: ["feed", "notifications", access.userId], queryFn: () => feedApi.listNotifications(), enabled: !!access.enabled.data?.enabled });
  const cache = useQueryClient();
  return <main className={styles.surface}><FeedTopBar active="notifications" showActions={access.enabled.data?.enabled === true} />
    {!access.enabled.data?.enabled ? <LoadingOrDenied {...access} /> :
      <div className={styles.card}>
        <button className={styles.secondary} onClick={() => void feedApi.markAllNotificationsRead().then(() => cache.invalidateQueries({ queryKey: ["feed", "notifications"] }))}>Прочитать всё</button>
        {notifications.isPending && <LoadingState variant="inline" message="Загрузка уведомлений…" />}
        {notifications.isError && <p role="alert">{message(notifications.error)}</p>}
        {notifications.data?.items.length === 0 && <p className={styles.empty}>Пока нет уведомлений.</p>}
        {notifications.data?.items.map(event => <div key={event.id} className={styles.comment}>
          <p>{event.actors.map(actor => actor.name).join(", ")} · {event.kind === "comment" ? "комментарий" : event.kind === "reply" ? "ответ" : "реакция"}</p>
          {event.targetAvailable ? <Link href={`/feed/${encodeURIComponent(event.postId)}`}>Открыть публикацию</Link> : <span className={styles.muted}>Публикация удалена</span>}
          {!event.readAt && <button className={styles.textButton} onClick={() => void feedApi.markNotificationRead(event.id).then(() => cache.invalidateQueries({ queryKey: ["feed", "notifications"] }))}>Прочитано</button>}
        </div>)}
      </div>}
  </main>;
}
