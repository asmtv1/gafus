"use client";

import { useState, useTransition } from "react";
import { reportClientError } from "@gafus/error-handling";
import { Alert, Button, Card, CardContent, CardHeader, Stack, TextField } from "@mui/material";

import { updateAppSubscriptionSettingsAction } from "@/shared/lib/actions/appSubscriptionAdminActions";

interface AppSubscriptionSettingsCardProps {
  actorRole: string;
  initialYookassaWeeklyPriceRub: number;
  initialAppleProductId: string | null;
}

export function AppSubscriptionSettingsCard({
  actorRole,
  initialYookassaWeeklyPriceRub,
  initialAppleProductId,
}: AppSubscriptionSettingsCardProps) {
  const [price, setPrice] = useState(String(initialYookassaWeeklyPriceRub));
  const [appleProductId, setAppleProductId] = useState(initialAppleProductId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isAdmin = actorRole === "ADMIN";

  const onSave = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const result = await updateAppSubscriptionSettingsAction({
          yookassaWeeklyPriceRub: Number(price),
          appleProductId: appleProductId.trim() ? appleProductId.trim() : null,
        });
        if (!result.success) {
          setError(result.error ?? "Не удалось сохранить");
          return;
        }
        setSuccess("Сохранено");
      } catch (err) {
        reportClientError(err, { issueKey: "AppSubscriptionSettingsCard" });
        setError(err instanceof Error ? err.message : "Ошибка сохранения");
      }
    });
  };

  return (
    <Card>
      <CardHeader title="Настройки подписки" subheader="YooKassa и Apple product id" />
      <CardContent>
        <Stack spacing={2}>
          <TextField
            label="YooKassa weekly price (RUB)"
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={!isAdmin || isPending}
          />
          <TextField
            label="Apple Product ID"
            value={appleProductId}
            onChange={(e) => setAppleProductId(e.target.value)}
            disabled={!isAdmin || isPending}
          />
          <Button variant="contained" onClick={onSave} disabled={!isAdmin || isPending}>
            Сохранить
          </Button>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {success ? <Alert severity="success">{success}</Alert> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
