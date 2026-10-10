"use client";

import { LoadingState } from "@/shared/components/ui/LoadingState";

import { memo, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PrimaryButtonLink } from "@/shared/components/ui";
import { useTransition } from "react";
import {
  ArrowForward,
  Favorite as FavoriteIcon,
  FavoriteBorder as FavoriteBorderIcon,
  VisibilityOutlined,
} from "@mui/icons-material";
import { useCSRFStore } from "@gafus/csrf";
import { reportClientError } from "@gafus/error-handling";

import { getCDNUrl } from "@gafus/cdn-upload/utils";
import type { ArticleListDto } from "@gafus/types";

import styles from "./articles.module.css";

interface ArticleCardProps {
  article: ArticleListDto;
  onLike: (id: string) => Promise<void>;
  isPending: boolean;
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
      {article.visibility === "PAID" && <div className={styles.paidBadge}>Платная</div>}
      <Link href={`/articles/${article.slug}`} className={styles.articleLink}>
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
        <div className={styles.articleContent}>
          <h3 className={styles.articleTitle}>{article.title}</h3>
        </div>
      </Link>
      <div className={styles.articleActions}>
        <span className={styles.views}>
          <VisibilityOutlined aria-hidden="true" className={styles.viewsIcon} />
          {formatViews(article.viewCount)}
        </span>
        <button
          type="button"
          className={`${styles.likeButton} ${article.isLiked ? styles.likeButtonLiked : ""}`}
          onClick={() => void onLike(article.id)}
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
        <PrimaryButtonLink href={`/articles/${article.slug}`} className={styles.readLink}>
          Читать <ArrowForward aria-hidden="true" className={styles.readIcon} />
        </PrimaryButtonLink>
      </div>
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
        } catch (error) {
          reportClientError(error instanceof Error ? error : new Error(String(error)), {
            issueKey: "ArticlesClient",
            keys: { operation: "article_like" },
            userId: userId ?? undefined,
          });
        }
      });
    },
    [csrfToken, fetchToken, userId]
  );

  if (initialError) {
    return (
      <div style={{ textAlign: "center", padding: "20px", color: "red" }}>
        Ошибка загрузки: {initialError}
      </div>
    );
  }

  if (articles.length === 0 && !initialArticles) {
    return <LoadingState message="Загрузка статей…" />;
  }

  return (
    <section className={styles.articlesSection} aria-labelledby="articles-heading">
      <ul className={styles.articleList} id="articles-heading">
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
        <div className={styles.emptyState}>
          <p>Пока нет статей</p>
        </div>
      )}
    </section>
  );
}
