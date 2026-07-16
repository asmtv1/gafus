"use client";

import { useState, useTransition } from "react";
import { reportClientError } from "@gafus/error-handling";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { updateAppSubscriptionSettingsAction } from "@/shared/lib/actions/appSubscriptionAdminActions";

interface AppSubscriptionSettingsCardProps {
  actorRole: string;
  initialMonthlyEnabled: boolean;
  initialYookassaMonthlyPriceRub: number;
  initialMonthlyIntervalDays: number;
  initialMonthlyAppleProductId: string | null;
}

export function AppSubscriptionSettingsCard({
  actorRole,
  initialMonthlyEnabled,
  initialYookassaMonthlyPriceRub,
  initialMonthlyIntervalDays,
  initialMonthlyAppleProductId,
}: AppSubscriptionSettingsCardProps) {
  const [monthlyEnabled, setMonthlyEnabled] = useState(initialMonthlyEnabled);
  const [monthlyPrice, setMonthlyPrice] = useState(String(initialYookassaMonthlyPriceRub));
  const [monthlyIntervalDays, setMonthlyIntervalDays] = useState(
    String(initialMonthlyIntervalDays),
  );
  const [monthlyAppleProductId, setMonthlyAppleProductId] = useState(
    initialMonthlyAppleProductId ?? "",
  );
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
          monthlyEnabled,
          yookassaMonthlyPriceRub: Number(monthlyPrice),
          monthlyIntervalDays: Number(monthlyIntervalDays),
          monthlyAppleProductId: monthlyAppleProductId.trim() ? monthlyAppleProductId.trim() : null,
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
      <CardHeader
        title="Настройки подписки"
        subheader="Месячный тариф: нативный СБП через YooKassa на iOS/Android и отдельный Apple IAP на iOS"
      />
      <CardContent>
        <Stack spacing={3}>
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={700}>
              Месячный тариф
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={monthlyEnabled}
                  onChange={(e) => setMonthlyEnabled(e.target.checked)}
                  disabled={!isAdmin || isPending}
                />
              }
              label="Показывать тариф"
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Цена подписки через YooKassa, ₽"
                type="number"
                value={monthlyPrice}
                onChange={(e) => setMonthlyPrice(e.target.value)}
                disabled={!isAdmin || isPending}
                fullWidth
              />
              <TextField
                label="Дней"
                type="number"
                value={monthlyIntervalDays}
                onChange={(e) => setMonthlyIntervalDays(e.target.value)}
                disabled={!isAdmin || isPending}
                fullWidth
              />
            </Stack>
            <TextField
              label="Apple Product ID"
              value={monthlyAppleProductId}
              onChange={(e) => setMonthlyAppleProductId(e.target.value)}
              disabled={!isAdmin || isPending}
            />
          </Stack>

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
