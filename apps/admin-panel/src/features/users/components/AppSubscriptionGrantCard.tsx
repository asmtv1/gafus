"use client";

import { useEffect, useState, useTransition } from "react";
import { useCSRFStore } from "@gafus/csrf";
import { reportClientError } from "@gafus/error-handling";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  TextField,
  Typography,
} from "@mui/material";

type Summary = {
  hasActiveSubscription: boolean;
  provider: "YOOKASSA" | "APPLE" | "MANUAL" | null;
  status: string | null;
  isLifetime: boolean;
  activeUntil: string | null;
  cancelAtPeriodEnd: boolean;
  paymentMethod: string | null;
  paymentChannel: string | null;
};

interface AppSubscriptionGrantCardProps {
  userId: string;
  actorRole: string;
}

export function AppSubscriptionGrantCard({ userId, actorRole }: AppSubscriptionGrantCardProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [paidUntil, setPaidUntil] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { token: csrfToken, loading: csrfLoading, fetchToken } = useCSRFStore();
  const canCancelYookassaRenewal =
    actorRole === "ADMIN" &&
    summary?.provider === "YOOKASSA" &&
    summary.status === "ACTIVE" &&
    !summary.isLifetime &&
    !summary.cancelAtPeriodEnd;

  useEffect(() => {
    if (!csrfToken && !csrfLoading) {
      void fetchToken();
    }
  }, [csrfToken, csrfLoading, fetchToken]);

  const reload = async () => {
    try {
      const response = await fetch(`/api/users/${userId}/app-subscription`, { method: "GET" });
      const result = await response.json();
      if (result.success) {
        setSummary(result.data);
      } else {
        setError(result.error ?? "Не удалось загрузить статус подписки");
      }
    } catch (err) {
      reportClientError(err, { issueKey: "AppSubscriptionGrantCard", keys: { operation: "load" } });
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const postAction = (payload: Record<string, unknown>) => {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/users/${userId}/app-subscription`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
          },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!result.success) {
          setError(result.error ?? "Не удалось сохранить");
          return;
        }
        await reload();
      } catch (err) {
        reportClientError(err, {
          issueKey: "AppSubscriptionGrantCard",
          keys: { operation: "grant" },
        });
        setError(err instanceof Error ? err.message : "Ошибка сохранения");
      }
    });
  };

  return (
    <Card sx={{ mt: 2 }}>
      <CardHeader title="Подписка приложения" subheader="Ручное управление доступом" />
      <CardContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Активна: {summary?.hasActiveSubscription ? "да" : "нет"}; источник:{" "}
          {summary?.paymentChannel ?? summary?.provider ?? "-"}; статус: {summary?.status ?? "-"}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Lifetime: {summary?.isLifetime ? "да" : "нет"}; activeUntil: {summary?.activeUntil ?? "-"}
        </Typography>
        {summary?.provider === "YOOKASSA" ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Способ оплаты: {summary.paymentMethod ?? "—"}; автопродление:{" "}
            {summary.cancelAtPeriodEnd ? "отменено" : "включено"}
          </Typography>
        ) : null}

        {actorRole === "ADMIN" ? (
          <>
            <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
              <TextField
                type="datetime-local"
                label="Оплачено до"
                value={paidUntil}
                onChange={(e) => setPaidUntil(e.target.value)}
                fullWidth
                disabled={isPending}
                InputLabelProps={{ shrink: true }}
              />
            </Box>
            <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
              <TextField
                label="Причина (опционально)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                fullWidth
                disabled={isPending}
              />
            </Box>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <Button
                variant="contained"
                disabled={isPending || csrfLoading || !csrfToken || !paidUntil}
                onClick={() =>
                  postAction({
                    action: "paid_until",
                    paidUntil: new Date(paidUntil).toISOString(),
                    reason,
                  })
                }
              >
                Оплачено до даты
              </Button>
              <Button
                variant="contained"
                color="success"
                disabled={isPending || csrfLoading || !csrfToken}
                onClick={() => postAction({ action: "lifetime", reason })}
              >
                Оплачено навсегда
              </Button>
              <Button
                variant="outlined"
                color="warning"
                disabled={isPending || csrfLoading || !csrfToken}
                onClick={() => postAction({ action: "clear" })}
              >
                Снять ручной доступ
              </Button>
              {canCancelYookassaRenewal ? (
                <Button
                  variant="outlined"
                  color="warning"
                  disabled={isPending || csrfLoading || !csrfToken}
                  onClick={() => postAction({ action: "cancel_yookassa_renewal" })}
                >
                  Отменить продление
                </Button>
              ) : null}
            </Box>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Только просмотр. Изменение доступно роли ADMIN.
          </Typography>
        )}

        {error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
