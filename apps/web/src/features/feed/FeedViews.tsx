"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FEED_LIMITS, FEED_REACTIONS, countFeedCharacters, formatFeedTime,
  type FeedPostDto, type FeedCommentDto, type FeedReaction,
} from "@gafus/types";
import { FeedActions, FeedReportForm } from "./FeedActions";
import { feedApi } from "./api";
import { uploadFeedBrowserAsset, validateBrowserFeedFiles, type FeedBrowserAsset } from "./upload";
import { FeedVideo } from "./FeedVideo";
import { FeedAlbumPicker } from "./FeedAlbumPicker";
import { LoadingState } from "@/shared/components/ui";
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
  if (status === "loading") return <Access><LoadingState variant="inline" size="large" message="Проверяем доступность ленты…" /></Access>;
  if (status !== "authenticated") return <Access><p>Войдите в аккаунт, чтобы пользоваться лентой.</p></Access>;
  if (enabled.isPending) return <Access><LoadingState variant="inline" size="large" message="Проверяем доступность ленты…" /></Access>;
  if (enabled.isError) return <Access><p role="alert">{message(enabled.error)}</p><button type="button" className={styles.secondary} onClick={() => void enabled.refetch()}>Повторить</button></Access>;
  return <Access><p>Лента пока недоступна. Ваши публикации и альбомы не затронуты.</p></Access>;
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
function ViewObserver({ post }: { post: FeedPostDto }) {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (post.canDelete) return;
    const element = marker.current?.closest("article");
    if (!element) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let counted = false;
    const stop = () => { if (timeout) clearTimeout(timeout); timeout = undefined; };
    const observer = new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= FEED_LIMITS.viewVisibleFraction);
      stop();
      if (visible && document.visibilityState === "visible" && !counted) {
        timeout = setTimeout(() => {
          if (document.visibilityState !== "visible" || counted) return;
          counted = true;
          void feedApi.recordView(post.id).catch(() => { counted = false; });
        }, FEED_LIMITS.viewVisibleMilliseconds);
      }
    }, { threshold: [0, FEED_LIMITS.viewVisibleFraction, 1] });
    observer.observe(element);
    document.addEventListener("visibilitychange", stop);
    return () => { stop(); observer.disconnect(); document.removeEventListener("visibilitychange", stop); };
  }, [post.id, post.canDelete]);
  return <span ref={marker} hidden />;
}
export function FeedCard({ post, compact = false }: { post: FeedPostDto; compact?: boolean }) {
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
    <ViewObserver post={post} />
    <div className={styles.meta}>
      <span className={styles.avatar}>{post.author.avatarUrl ?
        // Signed CDN media must load directly without Next Image optimization.
        <img src={post.author.avatarUrl} alt="" /> : "🐾"}</span>
      <span><Link className={styles.author} href={`/profile?username=${encodeURIComponent(post.author.username)}`}>{post.author.name}</Link>
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
      <Link href={`/feed/${encodeURIComponent(post.id)}`}>{post.commentCount} комментариев</Link>
      {!compact && <button type="button" className={styles.textButton} onClick={() => setReactionOpen(!reactionOpen)}>Кто отреагировал</button>}
      {post.canEdit && <Link href={`/feed/create?edit=${encodeURIComponent(post.id)}`}>Изменить</Link>}
    </div>
    {reactionOpen && <div className={styles.comment} aria-label="Пользователи, поставившие реакции">
      {people.isPending ? <LoadingState variant="inline" size="small" message="Загрузка реакций…" /> : people.isError ? message(people.error) : !people.data?.items.length ? "Нет реакций" :
        people.data.items.map(entry => <p key={entry.user.id}><Link href={`/profile?username=${encodeURIComponent(entry.user.username)}`}>{entry.user.name}</Link> {entry.reaction}</p>)}
    </div>}
  </article>;
}
function FeedPendingPosts() {
  const { data: session } = useSession();
  const pending = useQuery({
    queryKey: ["feed", "pending", session?.user?.id],
    queryFn: () => feedApi.listPendingPosts(),
    enabled: Boolean(session?.user?.id),
    refetchInterval: 20_000,
  });
  if (!pending.data?.items.length && !pending.isError) return null;
  return <section className={styles.card} aria-label="Мои черновики и обработка">
    <h2>Мои незавершённые публикации</h2>
    {pending.isError && <p role="alert">Не удалось проверить статус. <button type="button"
      className={styles.secondary} onClick={() => void pending.refetch()}>Повторить</button></p>}
    {pending.data?.items.map(post => <div className={styles.comment} key={post.id}>
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
  const [hiddenAuthor, setHiddenAuthor] = useState<{ id: string; name: string } | null>(null);
  const [undoError, setUndoError] = useState("");
  useEffect(() => {
    const listener = (event: Event) => setHiddenAuthor((event as CustomEvent<{ id: string; name: string }>).detail);
    window.addEventListener("feed-author-hidden", listener);
    return () => window.removeEventListener("feed-author-hidden", listener);
  }, []);
  const query = useInfiniteQuery({
    queryKey: ["feed", "posts", access.userId],
    queryFn: ({ pageParam }) => feedApi.listPosts({ cursor: pageParam }),
    refetchInterval: 90_000,
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor,
    enabled: access.enabled.data?.enabled === true,
    gcTime: 30_000,
  });
  const posts = query.data?.pages.flatMap(page => page.items) ?? [];
  return <main className={styles.surface}>
    <div className={styles.header}>
      <h1 className={styles.title}>Лента</h1>
      {access.enabled.data?.enabled && <nav className={styles.actions}>
        <Link className={styles.secondary} href="/feed/saved">Закладки</Link>
        <Link className={styles.secondary} href="/feed/hidden-authors">Скрытые авторы</Link>
        <Link className={styles.secondary} href="/feed/notifications">Уведомления</Link>
        <Link className={styles.primary} href="/feed/create">Создать пост</Link>
      </nav>}
    </div>
    {!access.enabled.data?.enabled ? <LoadingOrDenied {...access} /> :
      <div className={styles.feed}>
        {hiddenAuthor && <div className={styles.card} role="status">Публикации автора {hiddenAuthor.name} скрыты.
          <button className={styles.textButton} type="button" onClick={async () => {
            try { await feedApi.setAuthorPreference(hiddenAuthor.id, { hidden: false }); setHiddenAuthor(null); await cache.invalidateQueries({ queryKey: ["feed"] }); }
            catch (error) { setUndoError(message(error)); }
          }}>Отменить</button>
          {undoError && <p role="alert">{undoError}</p>}
        </div>}
        <FeedPendingPosts />
        {query.isPending && <LoadingState variant="inline" size="large" message="Загрузка публикаций…" />}
        {query.isError && <p role="alert" className={styles.error}>{message(query.error)} <button type="button" onClick={() => void query.refetch()}>Повторить</button></p>}
        {query.isSuccess && posts.length === 0 && <div className={styles.card}><p className={styles.empty}>Здесь пока нет публикаций. Расскажите о своём питомце!</p></div>}
        {posts.map(post => <FeedCard post={post} key={post.id} />)}
        {query.hasNextPage && <button className={styles.secondary} type="button" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Показать ещё</button>}
        {query.isFetchingNextPage && <LoadingState variant="inline" size="small" message="Загружаем публикации…" />}
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
    if (!text.trim() && !files.length && !albumPhotoIds.length && !(original.data?.pendingRevision?.attachmentIds.length ||
        original.data?.attachments.length)) { setError("Добавьте текст или вложение."); return; }
    setBusy(true); setError("");
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
  return <main className={styles.surface}><div className={styles.header}><h1 className={styles.title}>{editId ? "Изменить публикацию" : "Новая публикация"}</h1><Link href="/feed">Назад в ленту</Link></div>
    {!access.enabled.data?.enabled ? <LoadingOrDenied {...access} /> :
      <div className={styles.card}>
        {original.isPending && editId ? <LoadingState variant="inline" size="large" message="Загружаем редактор…" /> :
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
  return <main className={styles.surface}><div className={styles.header}><Link href="/feed">← Лента</Link>{post.data?.canDelete && <button className={styles.textButton} onClick={() => void remove()}>Удалить публикацию</button>}</div>
    {!access.enabled.data?.enabled ? <LoadingOrDenied {...access} /> :
      <div className={styles.feed}>
        {post.isPending && <LoadingState variant="inline" size="large" message="Загрузка публикации…" />}
        {post.isError && <p className={styles.error} role="alert">{message(post.error)}</p>}
        {post.data && <FeedCard key={post.data.id} post={post.data} />}
        <section className={styles.card} aria-label="Комментарии">
          <h2>Комментарии</h2>
          {commentId && <div ref={focusedRef} tabIndex={-1} aria-label="Комментарий из уведомления">
            <h3>Комментарий из уведомления</h3>
            {focused.isPending && <LoadingState variant="inline" size="small" message="Загрузка комментария…" />}
            {(focused.isError || (focused.data && focused.data.postId !== postId)) && <p role="status">Комментарий недоступен.</p>}
            {focused.data?.postId === postId && <FeedCommentRow item={focused.data} onReply={setReplyTo} />}
          </div>}
          {comments.isPending && <LoadingState variant="inline" size="small" message="Загрузка комментариев…" />}
          {comments.isError && <p role="alert" className={styles.error}>{message(comments.error)}</p>}
          {comments.data?.pages.flatMap(page => page.items).map(item => <FeedCommentRow key={item.id} item={item} onReply={setReplyTo} />)}
          {comments.hasNextPage && <button type="button" className={styles.secondary} disabled={comments.isFetchingNextPage} onClick={() => void comments.fetchNextPage()}>Ещё комментарии</button>}
          {comments.isFetchingNextPage && <LoadingState variant="inline" size="small" message="Загружаем комментарии…" />}
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
    {showReplies && (replies.isPending ? <LoadingState variant="inline" size="small" message="Загрузка ответов…" /> :
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
      <Link href={`/profile?username=${encodeURIComponent(username)}`}>← Профиль</Link>
    </div>
    {!access.enabled.data?.enabled ? <LoadingOrDenied {...access} /> :
      <div className={styles.feed}>
        {posts.isPending && <LoadingState variant="inline" size="large" message="Загружаем публикации…" />}
        {posts.isError && <p className={styles.error} role="alert">Не удалось загрузить публикации. <button className={styles.secondary} type="button" onClick={() => void posts.refetch()}>Повторить</button></p>}
        {posts.isSuccess && items.length === 0 && <section className={styles.card}>Публикаций пока нет.</section>}
        {items.map(post => <FeedCard key={post.id} post={post} />)}
        {posts.hasNextPage && <button className={styles.secondary} type="button" disabled={posts.isFetchingNextPage} onClick={() => void posts.fetchNextPage()}>Показать ещё</button>}
        {posts.isFetchingNextPage && <LoadingState variant="inline" size="small" message="Загружаем публикации…" />}
      </div>}
  </main>;
}

export function FeedNotificationsPage() {
  const access = useFeedEnabled();
  const notifications = useQuery({ queryKey: ["feed", "notifications", access.userId], queryFn: () => feedApi.listNotifications(), enabled: !!access.enabled.data?.enabled });
  const cache = useQueryClient();
  return <main className={styles.surface}><div className={styles.header}><h1 className={styles.title}>Уведомления</h1><Link href="/feed">← Лента</Link></div>
    {!access.enabled.data?.enabled ? <LoadingOrDenied {...access} /> :
      <div className={styles.card}>
        <button className={styles.secondary} onClick={() => void feedApi.markAllNotificationsRead().then(() => cache.invalidateQueries({ queryKey: ["feed", "notifications"] }))}>Прочитать всё</button>
        {notifications.isPending && <LoadingState variant="inline" size="large" message="Загрузка уведомлений…" />}
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
