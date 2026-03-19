"use client";

import { memo, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTransition } from "react";
import { Favorite as FavoriteIcon, FavoriteBorder as FavoriteBorderIcon } from "@mui/icons-material";
import { useCSRFStore } from "@gafus/csrf";

import { getCDNUrl } from "@gafus/cdn-upload";
import type { ArticleListDto } from "@gafus/types";
import { CoursesSkeleton } from "@shared/components/ui/Skeleton";

import courseStyles from "../courses/courses.module.css";
import styles from "./articles.module.css";

interface ArticleCardProps {
  article: ArticleListDto;
  onLike: (id: string) => Promise<void>;
  isPending: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatViews(n: number | undefined): string {
  const val = n ?? 0;
  const last = val % 10;
  const last2 = val % 100;
  if (last2 >= 11 && last2 <= 19) return `${val} просмотров`;
  if (last === 1) return `${val} просмотр`;
  if (last >= 2 && last <= 4) return `${val} просмотра`;
  return `${val} просмотров`;
}

const ArticleCard = memo(function ArticleCard({ article, onLike, isPending }: ArticleCardProps) {
  const rawCover = article.logoImg || article.imageUrls?.[0];
  const coverUrl = rawCover ? (rawCover.startsWith("http") ? rawCover : getCDNUrl(rawCover)) : null;

  return (
    <li className={styles.articleCard}>
      <Link href={`/articles/${article.slug}`} className={styles.articleLink}>
        {article.visibility === "PAID" && <div className={styles.paidBadge}>Платная</div>}
        <div className={styles.articleLogoBox}>
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt={article.title ? `Обложка статьи «${article.title}»` : ""}
              width={80}
              height={80}
              className={styles.articleLogo}
              unoptimized={coverUrl.startsWith("http")}
            />
          ) : (
            <div className={styles.articleLogoPlaceholder} aria-hidden />
          )}
        </div>
        <div className={styles.articleRight}>
          <h3 className={styles.articleTitle}>{article.title}</h3>
          <div className={styles.articleMeta}>
            <span>{article.authorUsername}</span>
            <span>{formatViews(article.viewCount)}</span>
            <span>{formatDate(article.createdAt)}</span>
          </div>
        </div>
      </Link>
      <button
        type="button"
        className={styles.likeButton}
        onClick={(e) => {
          e.preventDefault();
          void onLike(article.id);
        }}
        disabled={isPending}
        aria-label={article.isLiked ? "Убрать лайк" : "Нравится"}
      >
        {article.isLiked ? (
          <FavoriteIcon fontSize="small" color="error" />
        ) : (
          <FavoriteBorderIcon fontSize="small" />
        )}
        <span>{article.likeCount}</span>
      </button>
    </li>
  );
});

interface ArticlesClientProps {
  initialArticles: ArticleListDto[] | null;
  initialError: string | null;
  userId?: string;
}

export default function ArticlesClient({
  initialArticles,
  initialError,
  userId,
}: ArticlesClientProps) {
  const { token: csrfToken, fetchToken } = useCSRFStore();
  const [articles, setArticles] = useState<ArticleListDto[]>(initialArticles ?? []);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!csrfToken) void fetchToken();
  }, [csrfToken, fetchToken]);

  const handleLike = useCallback(
    async (articleId: string) => {
      startTransition(async () => {
        try {
          if (!csrfToken) await fetchToken();
          const token = csrfToken ?? useCSRFStore.getState().token;
          if (!token) return;
          const res = await fetch(`/api/v1/articles/${articleId}/like`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": token,
            },
            credentials: "include",
          });
          const data = (await res.json()) as { success?: boolean; data?: { isLiked: boolean } };
          if (data.success && data.data) {
            setArticles((prev) =>
              prev.map((a) =>
                a.id === articleId
                  ? {
                      ...a,
                      isLiked: data.data!.isLiked,
                      likeCount: a.likeCount + (data.data!.isLiked ? 1 : -1),
                    }
                  : a
              )
            );
          }
        } catch {
          /* ignore */
        }
      });
    },
    [csrfToken, fetchToken]
  );

  if (initialError) {
    return (
      <div style={{ textAlign: "center", padding: "20px", color: "red" }}>
        Ошибка загрузки: {initialError}
      </div>
    );
  }

  if (articles.length === 0 && !initialArticles) {
    return <CoursesSkeleton />;
  }

  return (
    <section className={courseStyles.guidesSection} aria-labelledby="articles-heading">
      <ul className={courseStyles.courseList} id="articles-heading">
        {articles.map((article) => (
          <ArticleCard
            key={article.id}
            article={article}
            onLike={handleLike}
            isPending={isPending}
          />
        ))}
      </ul>
      {articles.length === 0 && (
        <div className={courseStyles.emptyState}>
          <p>Пока нет статей</p>
        </div>
      )}
    </section>
  );
}
