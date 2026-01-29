"use client";

import { useCSRFStore } from "@gafus/csrf";
import { Button, CircularProgress, SwipeableDrawer, Typography } from "@mui/material";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export interface PaidCourseDrawerCourse {
  id: string;
  name: string;
  type: string;
  priceRub: number;
}

interface PaidCourseDrawerProps {
  open: boolean;
  onClose: () => void;
  course: PaidCourseDrawerCourse | null;
  userId: string | undefined;
}

export function PaidCourseDrawer({ open, onClose, course, userId }: PaidCourseDrawerProps) {
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
    if (!course || !csrfToken || isGuest) return;
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
        body: JSON.stringify({ courseId: course.id }),
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
    } catch {
      setPayError("Ошибка сети");
    } finally {
      setPayLoading(false);
    }
  }, [course, csrfToken, isGuest]);

  if (!course) return null;

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
        {course.name}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {course.priceRub} ₽
      </Typography>

      {isGuest ? (
        <>
          <Typography sx={{ mb: 2 }}>Войдите, чтобы оплатить курс.</Typography>
          <Button
            component={Link}
            href={`/login?returnUrl=${encodeURIComponent("/courses")}`}
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
            startIcon={payLoading || csrfLoading ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {payLoading || csrfLoading ? "Загрузка..." : "Оплатить"}
          </Button>
        </>
      )}

      <Button variant="outlined" fullWidth sx={{ mt: 1 }} onClick={onClose}>
        Закрыть
      </Button>
    </SwipeableDrawer>
  );
}
