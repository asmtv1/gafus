"use client";

import { useCSRFStore } from "@gafus/csrf";
import { reportClientError } from "@gafus/error-handling";
import {
  Button,
  CircularProgress,
  Link as MuiLink,
  SwipeableDrawer,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export interface PaidArticleDrawerArticle {
  id: string;
  title: string;
  slug: string;
  priceRub: number;
}

interface PaidArticleDrawerProps {
  open: boolean;
  onClose: () => void;
  article: PaidArticleDrawerArticle | null;
  userId: string | undefined;
}

export function PaidArticleDrawer({
  open,
  onClose,
  article,
  userId,
}: PaidArticleDrawerProps) {
  const { token: csrfToken, loading: csrfLoading, fetchToken } = useCSRFStore();
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const isGuest = userId === undefined;

  useEffect(() => {
    if (open && userId && !csrfToken && !csrfLoading) {
      void fetchToken();
    }
  }, [open, userId, csrfToken, csrfLoading, fetchToken]);

  const resetState = useCallback(() => {
    setPayError(null);
    setPayLoading(false);
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  const handlePay = useCallback(async () => {
    if (!article || !csrfToken || isGuest) return;
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
        return;
      }
      setPayError("Нет ссылки на оплату");
    } catch (err) {
      reportClientError(err, { issueKey: "PaidArticleDrawer", keys: { operation: "pay" } });
      setPayError("Ошибка сети");
    } finally {
      setPayLoading(false);
    }
  }, [article, csrfToken, isGuest]);

  if (!article) return null;

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={() => {}}
      disableSwipeToOpen
      PaperProps={{
        sx: { borderTopLeftRadius: 12, borderTopRightRadius: 12, px: 2, pt: 2, pb: 3 },
      }}
    >
      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        {article.title}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {article.priceRub} ₽
      </Typography>

      {isGuest ? (
        <>
          <Typography sx={{ mb: 2 }}>Войдите, чтобы оплатить статью.</Typography>
          <Button
            component={Link}
            href={`/login?returnUrl=${encodeURIComponent(`/articles/${article.slug}`)}`}
            variant="contained"
            fullWidth
            onClick={onClose}
          >
            Войти
          </Button>
        </>
      ) : (
        <>
          {payError && (
            <Typography color="error" sx={{ mb: 1 }}>
              {payError}
            </Typography>
          )}
          <Button
            variant="contained"
            fullWidth
            disabled={payLoading || csrfLoading}
            onClick={handlePay}
            startIcon={
              payLoading || csrfLoading ? (
                <CircularProgress size={20} color="inherit" />
              ) : null
            }
          >
            {payLoading || csrfLoading ? "Загрузка..." : "Оплатить статью"}
          </Button>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", textAlign: "center", mt: 0.5, mb: 1 }}
          >
            Нажимая кнопку, я соглашаюсь с условиями{" "}
            <MuiLink
              href="/oferta.html"
              target="_blank"
              rel="noopener noreferrer"
              underline="always"
              color="text.secondary"
            >
              Оферты
            </MuiLink>
          </Typography>
        </>
      )}

      <Button variant="outlined" fullWidth sx={{ mt: 1 }} onClick={onClose}>
        Закрыть
      </Button>
    </SwipeableDrawer>
  );
}
