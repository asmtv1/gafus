import { Loading } from "../../shared/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import "./ArticleNextMainGeometry.css";
import { useRef, useState } from "react";
import { listMyArticles, toggleMyArticleLike, type ArticleCard } from "./articleApi";
import { ApiError } from "../../shared/api/client";
import { articlePath, RouteLink } from "../../shared/router/location";
import styles from "../../brand/ArticleCard.module.css";
import page from "../../brand/LegacyCoursesPage.module.css";
import { ArticleLikeIcon } from "./ArticleLikeIcon";
import { PrimaryButton, PrimaryButtonLink } from "../../shared/ui";

/** Russian view-count inflection matching original Next ArticlesClient.
 * Missing server counts remain unknown; no fabricated zero-valued counters. */
export function formatArticleViews(n: number): string {
  const last = n % 10;
  const last2 = n % 100;
  if (last2 >= 11 && last2 <= 19) return String(n) + " просмотров";
  if (last === 1) return String(n) + " просмотр";
  if (last >= 2 && last <= 4) return String(n) + " просмотра";
  return String(n) + " просмотров";
}

/** A listed public article cover can disappear from the CDN; when it does,
 * the retained Next articleLogoPlaceholder must replace the broken <img>.
 */
function ArticleCover({url,title}:{url?:string;title:string}){
  const [failed,setFailed]=useState<string|null>(null);
  return url&&url!==failed ? <img src={url}
    className={`${styles.articleLogo} article-catalog-cover-image`}
    alt={`Обложка статьи «${title}»`} loading="lazy" decoding="async"
    onError={()=>setFailed(url)}/> :
    <div className={styles.articleLogoPlaceholder} aria-hidden="true"/>;
}

export function ArticleCatalog({ userId }: { userId: string | null }) {
  const queryClient = useQueryClient();
  const catalogKey = ["articles", "catalog", userId ?? "unverified"] as const;
  const [pendingLikeId, setPendingLikeId] = useState<string | null>(null);
  const [likeError, setLikeError] = useState("");
  // Like is a toggle, not an idempotent PUT. Lock synchronously against
  // double-click and never resend an ambiguous POST automatically.
  const likeInFlight = useRef(false);
  const currentOwner = useRef(userId);
  currentOwner.current = userId;
  const query = useQuery({
    queryKey: catalogKey,
    queryFn: () => listMyArticles(),
    enabled: Boolean(userId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  // A previously cached `hasAccess` is NOT a current entitlement check.
  // During refetch or a failed refetch, keep the private owner-scoped list
  // out of the DOM until the current session has a successful response.
  const ready = query.isSuccess && !query.isFetching;
  const unauthenticated = query.error instanceof ApiError && query.error.status === 401;
  const forbidden = query.error instanceof ApiError && query.error.status === 403;

  const handleLike = async (articleId: string) => {
    if (!userId || !ready || likeInFlight.current) return;
    const before = query.data.find((article) => article.id === articleId);
    if (!before) return;
    likeInFlight.current = true;
    setPendingLikeId(articleId);
    setLikeError("");
    try {
      const ack = await toggleMyArticleLike(articleId);
      if (currentOwner.current !== userId) return;
      // Next updates only the liked card after the acknowledged toggle.
      // An entire-catalog refetch would hide every card during isFetching.
      if (ack.isLiked === (before.isLiked === true)) {
        setLikeError("Не удалось подтвердить лайк. Обновите статьи перед повтором.");
      } else {
        queryClient.setQueryData<ArticleCard[]>(catalogKey, (current) =>
          current?.map((card) => card.id === articleId &&
            card.isLiked === before.isLiked
            ? { ...card, isLiked: ack.isLiked,
                likeCount: Math.max(0, card.likeCount + (ack.isLiked ? 1 : -1)) }
            : card,
          ),
        );
      }
    } catch (error) {
      // Even a failed network request may have been applied by the server.
      // Read once (GET), never replay an unknown toggle acknowledgement.
      await query.refetch().catch(() => undefined);
      if (currentOwner.current !== userId) return;
      setLikeError(error instanceof ApiError && error.status === 402
        ? "Для лайка нужен доступ к статье."
        : "Не удалось подтвердить лайк. Проверьте его состояние перед повтором.");
    } finally {
      likeInFlight.current = false;
      setPendingLikeId(null);
    }
  };

  if (!userId) return null;

  // Next's page.tsx owns the h1 outside ArticlesClient's catalog section.
  // Keeping it inside the section made its 58px/30px top margin part of the
  // grid surface and introduced additional section-height/spacing.
  return (
    <>
    <h1 className={`${page.title} next-articles-heading`}>Статьи</h1>
    <section className={`${page.container} collection-section article-catalog next-articles-index ${styles.articlesSection}`} aria-label="Статьи" data-next-articles>
      {query.isPending && <Loading message="Загружаем статьи…" />}
      {query.isFetching && query.data && <p role="status">Обновляем список статей…</p>}
      {query.isError && (
        <div role="alert">
          <p>
            {unauthenticated
              ? "Сессия завершена. Войдите снова."
              : forbidden
                ? "Нет доступа к разделу статей."
                : "Не удалось загрузить статьи."}
          </p>
          {unauthenticated ? (
            <RouteLink to="/login">Войти</RouteLink>
          ) : (
            !forbidden && (
              <PrimaryButton type="button" onClick={() => void query.refetch()}>
                Повторить
              </PrimaryButton>
            )
          )}
        </div>
      )}
      {likeError && <p role="alert">{likeError}</p>}
      {ready && query.data.length === 0 && <p className="empty-state">Статей пока нет.</p>}
      {ready && query.data.length > 0 && (
        <ul className={`${styles.articleList} article-catalog-grid`}>
          {query.data.map((article) => (
            <li key={article.id} className={`${styles.articleCard} article-catalog-card`}>
              {/* Original Next shows the same badge on every article,
                  never leaking entitlement through alternate card copy. */}
              <span className={styles.paidBadge}>По подписке</span>
              <RouteLink to={articlePath(article.slug)} className={styles.articleLink}>
                <div className={`${styles.articleLogoBox} article-catalog-cover`}>
                  <ArticleCover url={article.logoImg} title={article.title}/>
                </div>
                <div className={styles.articleContent}>
                  <h3 className={styles.articleTitle}>{article.title}</h3>
                </div>
              </RouteLink>
              <div className={styles.articleActions}>
                <span className={styles.views}>
                  {article.viewCount !== undefined && <svg
                    className={styles.viewsIcon} aria-hidden="true" viewBox="0 0 24 24">
                    <path fill="currentColor"
                      d="M12 6.5c3.79 0 7.17 2.13 8.82 5.5-1.65 3.37-5.03 5.5-8.82 5.5S4.83 15.37 3.18 12C4.83 8.63 8.21 6.5 12 6.5m0-2C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5m0-2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z"/>
                  </svg>}
                  {article.viewCount === undefined
                    ? "Автор: " + article.authorUsername
                    : formatArticleViews(article.viewCount)}
                </span>
                <button type="button" className={[
                  styles.likeButton, article.isLiked ? styles.likeButtonLiked : "",
                ].filter(Boolean).join(" ")}
                  disabled={pendingLikeId !== null || query.isFetching}
                  aria-pressed={article.isLiked === true}
                  aria-label={article.isLiked ? "Убрать лайк" : "Нравится"}
                  onClick={() => void handleLike(article.id)}>
                  <ArticleLikeIcon liked={article.isLiked === true} />
                  <span>{article.likeCount}</span>
                </button>
                <PrimaryButtonLink href={articlePath(article.slug)}
                  className={styles.readLink}>
                  Читать <svg className={styles.readIcon} aria-hidden="true" viewBox="0 0 24 24"
                    focusable="false" fill="currentColor">
                    <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                  </svg>
                </PrimaryButtonLink>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
    </>
  );
}
