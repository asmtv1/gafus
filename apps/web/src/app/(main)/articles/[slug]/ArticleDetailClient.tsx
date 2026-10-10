"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Favorite as FavoriteIcon,
  FavoriteBorder as FavoriteBorderIcon,
} from "@mui/icons-material";

import { getCDNUrl } from "@gafus/cdn-upload/utils";
import { useCSRFStore } from "@gafus/csrf";
import { reportClientError } from "@gafus/error-handling";
import { trackEvent } from "@gafus/analytics";
import type { ArticleDetailDto } from "@gafus/types";
import { usePathname } from "next/navigation";

import { AppSubscriptionPaywall } from "@/features/app-subscription";
import { PrimaryButtonLink } from "@/shared/components/ui";
import { getOrCreateArticleGuestVisitorKey } from "@/shared/lib/articles/articleGuestVisitorKey";

import styles from "./ArticleDetailClient.module.css";

interface PaidArticleBlockProps {
  article: ArticleDetailDto;
  userId: string | undefined;
}

function PaidArticleBlock({ article, userId }: PaidArticleBlockProps) {
  const isGuest = userId === undefined;

  if (isGuest) {
    return (
      <main className={styles.articleShell}>
        <article className={styles.articleSurface}>
          <h1 className={styles.articleTitle}>{article.title}</h1>
          <div className={styles.accessDeniedBlock}>
            <h2 className={styles.title}>Нужен доступ</h2>
            <p className={styles.subtitle}>Войдите, чтобы оформить подписку и открыть материал.</p>
            <PrimaryButtonLink
              href={`/login?returnUrl=${encodeURIComponent(`/articles/${article.slug}`)}`}
              className={styles.btnPrimary}
            >
              Войти
            </PrimaryButtonLink>
          </div>
        </article>
      </main>
    );
  }

  return (
    <main className={styles.articleShell}>
      <article className={styles.articleSurface}>
      <h1 className={styles.articleTitle}>{article.title}</h1>
      <p className={styles.articleMeta}>
        {article.authorUsername} • {new Date(article.createdAt).toLocaleDateString("ru-RU")}
      </p>
      {article.description && (
        <div className={styles.markdownContent}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.description}</ReactMarkdown>
        </div>
      )}
      <AppSubscriptionPaywall mode="embedded" />
      </article>
    </main>
  );
}

interface ArticleDetailClientProps {
  article: ArticleDetailDto;
  userId?: string;
}

export default function ArticleDetailClient({
  article,
  userId,
}: ArticleDetailClientProps) {
  const pathname = usePathname() ?? `/articles/${article.slug}`;
  const { token: csrfToken, fetchToken } = useCSRFStore();
  const [isLiked, setIsLiked] = useState(article.isLiked);
  const [likeCount, setLikeCount] = useState(article.likeCount);
  const [isPending, startTransition] = useTransition();
  const hasTrackedReadEndRef = useRef(false);

  useEffect(() => {
    if (!csrfToken) void fetchToken();
  }, [csrfToken, fetchToken]);

  useEffect(() => {
    if (!csrfToken) return;
    void fetch(`/api/v1/articles/${article.slug}/view`, {
      method: "POST",
      headers: {
        "x-csrf-token": csrfToken,
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        visitorKey: getOrCreateArticleGuestVisitorKey(),
      }),
    }).catch((err) => {
      reportClientError(err, {
        issueKey: "ArticleDetailClient",
        keys: { operation: "record_article_view" },
      });
    });
  }, [article.slug, csrfToken]);

  useEffect(() => {
    if (article.content === null || hasTrackedReadEndRef.current) {
      return;
    }
    const handleScroll = () => {
      if (hasTrackedReadEndRef.current) {
        return;
      }
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll <= 0) {
        return;
      }
      const progress = window.scrollY / maxScroll;
      if (progress < 0.9) {
        return;
      }
      hasTrackedReadEndRef.current = true;
      trackEvent({
        eventName: "button_click",
        platform: "web",
        pathOrScreen: pathname,
        elementId: "article-read-end",
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [article.content, pathname]);

  const handleLike = () => {
    if (!csrfToken) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/articles/${article.id}/like`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          credentials: "include",
        });
        const data = (await res.json()) as {
          success?: boolean;
          data?: { isLiked: boolean };
        };
        if (data.success && data.data) {
          setIsLiked(data.data.isLiked);
          setLikeCount((c) => (data.data!.isLiked ? c + 1 : c - 1));
        }
      } catch (error) {
        reportClientError(error, {
          issueKey: "ArticleDetailClient",
          keys: { operation: "toggle_article_like" },
        });
      }
    });
  };

  if (article.content === null) {
    return <PaidArticleBlock article={article} userId={userId} />;
  }

  return (
    <main className={styles.articleShell}>
      <article className={styles.articleSurface}>
      <header className={styles.articleHeader}>
      <h1 className={styles.articleTitle}>{article.title}</h1>
      <p className={styles.articleMeta}>
        {article.authorUsername} •{" "}
        {new Date(article.createdAt).toLocaleDateString("ru-RU")}
      </p>

      <button
        type="button"
        onClick={handleLike}
        disabled={isPending}
        aria-pressed={isLiked}
        aria-label={isLiked ? "Убрать лайк" : "Нравится"}
        className={`${styles.likeButton} ${isLiked ? styles.likeButtonActive : ""}`}
      >
        {isLiked ? (
          <FavoriteIcon fontSize="small" color="error" />
        ) : (
          <FavoriteBorderIcon fontSize="small" />
        )}
        <span>{likeCount}</span>
      </button>
      </header>

      {article.imageUrls.length > 0 && (
        <figure className={styles.coverFrame}>
          <Image
            src={
              article.imageUrls[0].startsWith("http")
                ? article.imageUrls[0]
                : getCDNUrl(article.imageUrls[0])
            }
            alt={`Обложка статьи «${article.title}»`}
            width={800}
            height={450}
            className={styles.coverImage}
            unoptimized={article.imageUrls[0].startsWith("http")}
          />
        </figure>
      )}

      {article.videoUrl && (
        <div className={styles.videoFrame}>
          <iframe
            src={article.videoUrl}
            title="Видео"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className={styles.video}
          />
        </div>
      )}

      {article.imageUrls.length > 1 && (
        <div className={styles.imageGallery}>
          {article.imageUrls.slice(1).map((url, i) => (
            <Image
              key={url}
              src={url.startsWith("http") ? url : getCDNUrl(url)}
              alt={`Иллюстрация ${i + 2} к статье «${article.title}»`}
              width={320}
              height={180}
              className={styles.galleryImage}
              unoptimized={url.startsWith("http")}
            />
          ))}
        </div>
      )}

      {article.contentType === "TEXT" ? (
        <div className={styles.markdownContent}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.content ?? ""}</ReactMarkdown>
        </div>
      ) : article.content ? (
        <div
          className={styles.markdownContent}
          dangerouslySetInnerHTML={{ __html: article.content }}
        />
      ) : null}
      </article>
    </main>
  );
}
