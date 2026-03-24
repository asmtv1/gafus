"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Favorite as FavoriteIcon,
  FavoriteBorder as FavoriteBorderIcon,
} from "@mui/icons-material";

import { getCDNUrl } from "@gafus/cdn-upload";
import { useCSRFStore } from "@gafus/csrf";
import { reportClientError } from "@gafus/error-handling";
import type { ArticleDetailDto } from "@gafus/types";

import { getOrCreateArticleGuestVisitorKey } from "@/shared/lib/articles/articleGuestVisitorKey";

import styles from "./ArticleDetailClient.module.css";

interface PaidArticleBlockProps {
  article: ArticleDetailDto;
  userId: string | undefined;
  csrfToken: string | null;
}

function PaidArticleBlock({
  article,
  userId,
  csrfToken,
}: PaidArticleBlockProps) {
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const isGuest = userId === undefined;

  const handlePay = useCallback(async () => {
    if (!csrfToken || isGuest) return;
    setPayError(null);
    setPayLoading(true);
    try {
      const res = await fetch("/api/v1/payments/create", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ articleId: article.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPayError(data.error ?? "Ошибка создания платежа");
        return;
      }
      if (data.confirmationUrl) {
        window.location.href = data.confirmationUrl;
      } else {
        setPayError("Нет ссылки на оплату");
      }
    } catch (error) {
      reportClientError(error, { issueKey: "ArticleDetailClient", keys: { operation: "pay_article" } });
      setPayError("Ошибка сети");
    } finally {
      setPayLoading(false);
    }
  }, [article.id, csrfToken, isGuest]);

  return (
    <main style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
      <h1>{article.title}</h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
        {article.authorUsername} • {new Date(article.createdAt).toLocaleDateString("ru-RU")}
      </p>
      {article.description && (
        <div className={styles.markdownContent} style={{ marginBottom: 24 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.description}</ReactMarkdown>
        </div>
      )}
      <div className={styles.accessDeniedBlock}>
        <h2 className={styles.title}>Платная статья</h2>
        <p className={styles.subtitle}>
          Оплатите «{article.title}» для доступа к содержимому.
          {(article.priceRub ?? 0) > 0 && ` Стоимость: ${article.priceRub} ₽.`}
        </p>
        {isGuest ? (
          <Link
            href={`/login?returnUrl=${encodeURIComponent(`/articles/${article.slug}`)}`}
            className={styles.btnPrimary}
          >
            Войти
          </Link>
        ) : (
          <div className={styles.buttonsRow}>
            {payError && <p style={{ color: "red", width: "100%", margin: 0 }}>{payError}</p>}
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={payLoading}
              onClick={handlePay}
            >
              {payLoading ? "Загрузка…" : "Оплатить статью"}
            </button>
            <a href="/oferta.html" target="_blank" rel="noopener noreferrer" className={styles.btnOutline}>
              Оферта
            </a>
          </div>
        )}
      </div>
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
  const { token: csrfToken, fetchToken } = useCSRFStore();
  const [isLiked, setIsLiked] = useState(article.isLiked);
  const [likeCount, setLikeCount] = useState(article.likeCount);
  const [isPending, startTransition] = useTransition();

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
    return (
      <PaidArticleBlock
        article={article}
        userId={userId}
        csrfToken={csrfToken}
      />
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <h1>{article.title}</h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
        {article.authorUsername} •{" "}
        {new Date(article.createdAt).toLocaleDateString("ru-RU")}
      </p>

      <button
        type="button"
        onClick={handleLike}
        disabled={isPending}
        aria-label={isLiked ? "Убрать лайк" : "Нравится"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          marginBottom: 24,
          border: "none",
          borderRadius: 8,
          background: "var(--bg-2)",
          cursor: isPending ? "not-allowed" : "pointer",
        }}
      >
        {isLiked ? (
          <FavoriteIcon fontSize="small" color="error" />
        ) : (
          <FavoriteBorderIcon fontSize="small" />
        )}
        <span>{likeCount}</span>
      </button>

      {article.imageUrls.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Image
            src={
              article.imageUrls[0].startsWith("http")
                ? article.imageUrls[0]
                : getCDNUrl(article.imageUrls[0])
            }
            alt={`Обложка статьи «${article.title}»`}
            width={800}
            height={450}
            style={{ width: "100%", height: "auto", objectFit: "cover", borderRadius: 8 }}
            unoptimized={article.imageUrls[0].startsWith("http")}
          />
        </div>
      )}

      {article.videoUrl && (
        <div style={{ marginBottom: 24 }}>
          <iframe
            src={article.videoUrl}
            title="Видео"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ width: "100%", aspectRatio: "16/9", border: "none" }}
          />
        </div>
      )}

      {article.imageUrls.length > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
          {article.imageUrls.map((url, i) => (
            <Image
              key={url}
              src={url.startsWith("http") ? url : getCDNUrl(url)}
              alt={`Иллюстрация ${i + 1} к статье «${article.title}»`}
              width={320}
              height={180}
              style={{ objectFit: "cover", borderRadius: 8 }}
              unoptimized={url.startsWith("http")}
            />
          ))}
        </div>
      )}

      {article.contentType === "TEXT" ? (
        <div className={styles.markdownContent} style={{ marginBottom: 24 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.content ?? ""}</ReactMarkdown>
        </div>
      ) : article.content ? (
        <div
          className={styles.markdownContent}
          style={{ marginBottom: 24 }}
          dangerouslySetInnerHTML={{ __html: article.content }}
        />
      ) : null}
    </main>
  );
}
