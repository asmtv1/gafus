import { Loading } from "../../shared/ui";
import { BackButtonLink, PrimaryButton } from "../../shared/ui";
import { useEffect, useRef, useState } from "react";
import "./ArticleNextMainGeometry.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getMyArticle, registerMyArticleView, toggleMyArticleLike, type ArticleDetails as ArticleRecord } from "./articleApi";
import { ApiError } from "../../shared/api/client";
import { RouteLink } from "../../shared/router/location";
import styles from "../../brand/LegacyArticleDetail.module.css";
import { ArticleEmbeddedPaywall } from "./ArticleEmbeddedPaywall";
import { ArticleGafusUnlock } from "./ArticleGafusUnlock";
import { ArticleLikeIcon } from "./ArticleLikeIcon";

export function ArticleDetails({ userId, slug }: { userId: string | null; slug: string }) {
  const queryClient = useQueryClient();
  const detailKey = ["articles", "detail", userId ?? "unverified", slug] as const;
  const [pendingLike, setPendingLike] = useState(false);
  const [likeError, setLikeError] = useState("");
  const running = useRef(false);
  const recordedViews = useRef(new Set<string>());
  const currentIdentity = useRef(userId + "\0" + slug);
  currentIdentity.current = userId + "\0" + slug;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const query = useQuery({
    queryKey: detailKey,
    queryFn: () => getMyArticle(slug),
    enabled: Boolean(userId),
    staleTime: 0,
    // Paid HTML should not outlive the mounted screen in React Query memory.
    gcTime: 0,
    retry: false,
  });

  const notFound =
    query.isError &&
    typeof query.error === "object" &&
    query.error !== null &&
    "status" in query.error &&
    query.error.status === 404;

  const unauthenticated = query.error instanceof ApiError && query.error.status === 401;
  const forbidden = query.error instanceof ApiError && query.error.status === 403;
  // Entitled HTML is a short-lived view of current server authorization, not
  // a persisted permission. Never show cached paid content during a refetch.
  const ready = query.isSuccess && !query.isFetching;
  // Next registered view semantics: read a real current owner's detail first,
  // then one non-idempotent POST for this owner+slug lifetime. 401/5xx and
  // ambiguous network acknowledgement never cause an automatic resend.
  useEffect(() => {
    if (!userId || !ready || query.data?.slug !== slug || !alive.current) return;
    const identity = userId + "\0" + slug;
    if (recordedViews.current.has(identity)) return;
    recordedViews.current.add(identity);
    void registerMyArticleView(slug).catch(() => {
      // Nonessential analytics must not reveal remote exception details, and
      // a lost ACK must never schedule a duplicate counter mutation.
    });
  }, [ready, query.data?.slug, slug, userId]);
  const toggleLike = async () => {
    if (!ready || !query.data.hasAccess || running.current) return;
    running.current = true; setPendingLike(true); setLikeError("");
    const previouslyLiked = query.data.isLiked;
    const requestedIdentity = userId + "\0" + slug;
    try {
      // Like Next, apply the server's toggle acknowledgement to just the like
      // controls. Refetching the entire detail would unmount the article, its
      // media and scroll position while `ready` is false.
      const articleId = query.data.id;
      const ack = await toggleMyArticleLike(articleId);
      if (!alive.current || currentIdentity.current !== requestedIdentity) return;
      if (ack.isLiked === previouslyLiked) {
        setLikeError("Не удалось подтвердить лайк. Перечитайте статью перед повтором.");
      } else {
        queryClient.setQueryData<ArticleRecord>(detailKey, (current) =>
          current?.id === articleId && current.hasAccess && current.isLiked === previouslyLiked
            ? { ...current, isLiked: ack.isLiked,
                likeCount: Math.max(0, current.likeCount + (ack.isLiked ? 1 : -1)) }
            : current,
        );
      }
    } catch (error) {
      const fresh = await query.refetch().catch(() => null);
      if (!alive.current || currentIdentity.current !== requestedIdentity) return;
      setLikeError(error instanceof ApiError && error.status === 402
        ? "Для лайка требуется доступ к статье."
        : fresh?.isSuccess
          ? "Проверьте актуальное состояние лайка перед повтором."
          : "Не удалось подтвердить изменение лайка. Повторная отправка не выполнена.");
    } finally { running.current = false; if (alive.current) setPendingLike(false); }
  };
  const media = ready && query.data.hasAccess ? query.data.imageUrls : [];

  if (!userId) return null;

  return (
    <section className={`collection-section article-detail ${styles.articleShell}`} aria-label="Статья">
      {!ready && <p>
        <BackButtonLink to="/articles">К статьям</BackButtonLink>
      </p>}
      {query.isPending && <Loading message="Загружаем статью…" />}
      {query.isFetching && query.data && <Loading message="Проверяем доступ к статье…" />}
      {query.isError && (
        <div role="alert">
          <p>
            {notFound
              ? "Статья не найдена."
              : unauthenticated
                ? "Сессия завершена. Войдите снова."
                : forbidden
                  ? "Нет доступа к статье."
                  : "Не удалось открыть статью."}
          </p>
          {unauthenticated ? (
            <RouteLink to="/login">Войти</RouteLink>
          ) : (
            !notFound &&
            !forbidden && (
              <PrimaryButton type="button" onClick={() => void query.refetch()}>
                Повторить
              </PrimaryButton>
            )
          )}
        </div>
      )}
      {ready && (
        <article className={`${styles.articleSurface} article-detail-card`}>
          <header className={query.data.hasAccess ? styles.articleHeader : undefined}>
            <h1 className={styles.articleTitle}>{query.data.title}</h1>
            {(userId || query.data.hasAccess) && <p className={styles.articleMeta}>
              {query.data.authorUsername}
              {query.data.createdAt && " • " +
                new Date(query.data.createdAt).toLocaleDateString("ru-RU")}
            </p>}
            {userId && query.data.hasAccess && <button type="button"
              className={`${styles.likeButton} ${query.data.isLiked ? styles.likeButtonActive : ""}`}
              disabled={pendingLike} aria-pressed={query.data.isLiked}
              aria-label={query.data.isLiked ? "Убрать лайк" : "Нравится"}
              onClick={() => void toggleLike()}>
              <ArticleLikeIcon liked={query.data.isLiked} />
              <span>{query.data.likeCount}</span>
            </button>}
            {likeError && <p role="alert">{likeError}</p>}
          </header>
          {media.length > 0 && <figure className={styles.coverFrame}>
            <img className={styles.coverImage} src={media[0]}
              alt={"Обложка статьи «" + query.data.title + "»"}
              loading="lazy" decoding="async" referrerPolicy="no-referrer"/>
          </figure>}
          {query.data.hasAccess && query.data.videoUrl &&
            <div className={styles.videoFrame}>
              <iframe className={styles.video} src={query.data.videoUrl}
                title={"Видео статьи «" + query.data.title + "»"}
                loading="lazy" referrerPolicy="no-referrer" allowFullScreen
                sandbox="allow-scripts allow-same-origin allow-presentation"
                allow="autoplay; encrypted-media; picture-in-picture"/>
            </div>}
          {media.length > 1 && <div className={styles.imageGallery}>
            {media.slice(1).map((url, i) => <img key={url} src={url}
              className={styles.galleryImage} loading="lazy" decoding="async"
              referrerPolicy="no-referrer"
              alt={"Иллюстрация " + (i + 2) + " к статье «" + query.data.title + "»"}/>)}
          </div>}
          {!query.data.hasAccess ? (
            <>
              {userId && query.data.description && <div className={`${styles.markdownContent} article-description`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{query.data.description}</ReactMarkdown>
              </div>}
              <ArticleGafusUnlock key={userId + ":" + query.data.id}
                userId={userId} articleId={query.data.id}
                onVerify={async () => {
                  const verified = await query.refetch();
                  return verified.isSuccess && verified.data?.hasAccess === true;
                }}/>
              <ArticleEmbeddedPaywall onRecheck={() => void query.refetch()}/>
            </>
          ) : query.data.contentType === "HTML" && query.data.content ? (
            // Core sanitizes article HTML on EVERY read, including old content,
            // using sanitize-html with an explicit tag/attribute/scheme allowlist.
            <div
              className={`${styles.markdownContent} article-body` }
              dangerouslySetInnerHTML={{ __html: query.data.content }}
            />
          ) : (
            <div className={`${styles.markdownContent} article-body`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {query.data.content ?? ""}
              </ReactMarkdown>
            </div>
          )}
        </article>
      )}

    </section>
  );
}
