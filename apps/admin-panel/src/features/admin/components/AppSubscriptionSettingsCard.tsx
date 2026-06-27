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
  Divider,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { updateAppSubscriptionSettingsAction } from "@/shared/lib/actions/appSubscriptionAdminActions";

interface AppSubscriptionSettingsCardProps {
  actorRole: string;
  initialWeeklyEnabled: boolean;
  initialMonthlyEnabled: boolean;
  initialYookassaWeeklyPriceRub: number;
  initialYookassaMonthlyPriceRub: number;
  initialWeeklyIntervalDays: number;
  initialMonthlyIntervalDays: number;
  initialWeeklyAppleProductId: string | null;
  initialMonthlyAppleProductId: string | null;
}

export function AppSubscriptionSettingsCard({
  actorRole,
  initialWeeklyEnabled,
  initialMonthlyEnabled,
  initialYookassaWeeklyPriceRub,
  initialYookassaMonthlyPriceRub,
  initialWeeklyIntervalDays,
  initialMonthlyIntervalDays,
  initialWeeklyAppleProductId,
  initialMonthlyAppleProductId,
}: AppSubscriptionSettingsCardProps) {
  const [weeklyEnabled, setWeeklyEnabled] = useState(initialWeeklyEnabled);
  const [monthlyEnabled, setMonthlyEnabled] = useState(initialMonthlyEnabled);
  const [weeklyPrice, setWeeklyPrice] = useState(String(initialYookassaWeeklyPriceRub));
  const [monthlyPrice, setMonthlyPrice] = useState(String(initialYookassaMonthlyPriceRub));
  const [weeklyIntervalDays, setWeeklyIntervalDays] = useState(String(initialWeeklyIntervalDays));
  const [monthlyIntervalDays, setMonthlyIntervalDays] = useState(
    String(initialMonthlyIntervalDays),
  );
  const [weeklyAppleProductId, setWeeklyAppleProductId] = useState(
    initialWeeklyAppleProductId ?? "",
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
          weeklyEnabled,
          monthlyEnabled,
          yookassaWeeklyPriceRub: Number(weeklyPrice),
          yookassaMonthlyPriceRub: Number(monthlyPrice),
          weeklyIntervalDays: Number(weeklyIntervalDays),
          monthlyIntervalDays: Number(monthlyIntervalDays),
          weeklyAppleProductId: weeklyAppleProductId.trim() ? weeklyAppleProductId.trim() : null,
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
      <CardHeader title="Настройки подписки" subheader="Тарифы YooKassa и Apple Product ID" />
      <CardContent>
        <Stack spacing={3}>
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={700}>
              Недельный тариф
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={weeklyEnabled}
                  onChange={(e) => setWeeklyEnabled(e.target.checked)}
                  disabled={!isAdmin || isPending}
                />
              }
              label="Показывать тариф"
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="YooKassa price (RUB)"
                type="number"
                value={weeklyPrice}
                onChange={(e) => setWeeklyPrice(e.target.value)}
                disabled={!isAdmin || isPending}
                fullWidth
              />
              <TextField
                label="Дней"
                type="number"
                value={weeklyIntervalDays}
                onChange={(e) => setWeeklyIntervalDays(e.target.value)}
                disabled={!isAdmin || isPending}
                fullWidth
              />
            </Stack>
            <TextField
              label="Apple Product ID"
              value={weeklyAppleProductId}
              onChange={(e) => setWeeklyAppleProductId(e.target.value)}
              disabled={!isAdmin || isPending}
            />
          </Stack>

          <Divider />

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
                label="YooKassa price (RUB)"
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
