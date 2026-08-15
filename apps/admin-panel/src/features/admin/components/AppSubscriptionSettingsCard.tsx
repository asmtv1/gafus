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

type PlanDraft = {
  enabled: boolean;
  priceRub: string;
  intervalDays: string;
};

interface AppSubscriptionSettingsCardProps {
  actorRole: string;
  initialTwoWeeksEnabled: boolean;
  initialYookassaTwoWeeksPriceRub: number;
  initialTwoWeeksIntervalDays: number;
  initialMonthlyEnabled: boolean;
  initialYookassaMonthlyPriceRub: number;
  initialMonthlyIntervalDays: number;
  initialThreeMonthsEnabled: boolean;
  initialYookassaThreeMonthsPriceRub: number;
  initialThreeMonthsIntervalDays: number;
  initialMonthlyAppleProductId: string | null;
}

function PlanSettingsSection({
  title,
  draft,
  disabled,
  onChange,
  appleProductId,
  onAppleProductIdChange,
}: {
  title: string;
  draft: PlanDraft;
  disabled: boolean;
  onChange: (next: PlanDraft) => void;
  appleProductId?: string;
  onAppleProductIdChange?: (value: string) => void;
}) {
  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1" fontWeight={700}>
        {title}
      </Typography>
      <FormControlLabel
        control={
          <Checkbox
            checked={draft.enabled}
            onChange={(event) => onChange({ ...draft, enabled: event.target.checked })}
            disabled={disabled}
          />
        }
        label="Показывать в ЮKassa"
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="Цена YooKassa (₽)"
          type="number"
          value={draft.priceRub}
          onChange={(event) => onChange({ ...draft, priceRub: event.target.value })}
          slotProps={{ htmlInput: { min: 1, max: 100000, step: 1 } }}
          disabled={disabled}
          fullWidth
        />
        <TextField
          label="Количество дней"
          type="number"
          value={draft.intervalDays}
          onChange={(event) => onChange({ ...draft, intervalDays: event.target.value })}
          slotProps={{ htmlInput: { min: 1, max: 366, step: 1 } }}
          disabled={disabled}
          fullWidth
        />
      </Stack>
      {onAppleProductIdChange ? (
        <TextField
          label="Apple Product ID"
          value={appleProductId ?? ""}
          onChange={(event) => onAppleProductIdChange(event.target.value)}
          helperText="Используется только App Store для месячного тарифа"
          disabled={disabled}
          fullWidth
        />
      ) : null}
    </Stack>
  );
}

export function AppSubscriptionSettingsCard({
  actorRole,
  initialTwoWeeksEnabled,
  initialYookassaTwoWeeksPriceRub,
  initialTwoWeeksIntervalDays,
  initialMonthlyEnabled,
  initialYookassaMonthlyPriceRub,
  initialMonthlyIntervalDays,
  initialThreeMonthsEnabled,
  initialYookassaThreeMonthsPriceRub,
  initialThreeMonthsIntervalDays,
  initialMonthlyAppleProductId,
}: AppSubscriptionSettingsCardProps) {
  const [twoWeeks, setTwoWeeks] = useState<PlanDraft>({
    enabled: initialTwoWeeksEnabled,
    priceRub: String(initialYookassaTwoWeeksPriceRub),
    intervalDays: String(initialTwoWeeksIntervalDays),
  });
  const [monthly, setMonthly] = useState<PlanDraft>({
    enabled: initialMonthlyEnabled,
    priceRub: String(initialYookassaMonthlyPriceRub),
    intervalDays: String(initialMonthlyIntervalDays),
  });
  const [threeMonths, setThreeMonths] = useState<PlanDraft>({
    enabled: initialThreeMonthsEnabled,
    priceRub: String(initialYookassaThreeMonthsPriceRub),
    intervalDays: String(initialThreeMonthsIntervalDays),
  });
  const [monthlyAppleProductId, setMonthlyAppleProductId] = useState(
    initialMonthlyAppleProductId ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isAdmin = actorRole === "ADMIN";
  const controlsDisabled = !isAdmin || isPending;

  const onSave = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const result = await updateAppSubscriptionSettingsAction({
          twoWeeksEnabled: twoWeeks.enabled,
          yookassaTwoWeeksPriceRub: Number(twoWeeks.priceRub),
          twoWeeksIntervalDays: Number(twoWeeks.intervalDays),
          monthlyEnabled: monthly.enabled,
          yookassaMonthlyPriceRub: Number(monthly.priceRub),
          monthlyIntervalDays: Number(monthly.intervalDays),
          threeMonthsEnabled: threeMonths.enabled,
          yookassaThreeMonthsPriceRub: Number(threeMonths.priceRub),
          threeMonthsIntervalDays: Number(threeMonths.intervalDays),
          monthlyAppleProductId: monthlyAppleProductId.trim() || null,
        });
        if (!result.success) {
          setError(result.error ?? "Не удалось сохранить");
          return;
        }
        setSuccess("Настройки тарифов сохранены");
      } catch (err) {
        reportClientError(err, { issueKey: "AppSubscriptionSettingsCard" });
        setError(err instanceof Error ? err.message : "Ошибка сохранения");
      }
    });
  };

  return (
    <Card>
      <CardHeader
        title="Настройки тарифов Premium"
        subheader="ЮKassa: три тарифа; App Store: только месячный. Отключение тарифа останавливает новые продажи, но не продления."
      />
      <CardContent>
        <Stack spacing={3}>
          <PlanSettingsSection
            title="2 недели"
            draft={twoWeeks}
            disabled={controlsDisabled}
            onChange={setTwoWeeks}
          />
          <PlanSettingsSection
            title="1 месяц"
            draft={monthly}
            disabled={controlsDisabled}
            onChange={setMonthly}
            appleProductId={monthlyAppleProductId}
            onAppleProductIdChange={setMonthlyAppleProductId}
          />
          <PlanSettingsSection
            title="3 месяца"
            draft={threeMonths}
            disabled={controlsDisabled}
            onChange={setThreeMonths}
          />
          {!isAdmin ? (
            <Alert severity="info">Только ADMIN может изменять настройки тарифов.</Alert>
          ) : null}
          <Button variant="contained" onClick={onSave} disabled={controlsDisabled}>
            Сохранить
          </Button>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {success ? <Alert severity="success">{success}</Alert> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
