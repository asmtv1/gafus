"use client";

import { reportClientError } from "@gafus/error-handling";
import { useState, useTransition } from "react";

import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  FormControlLabel,
  Switch,
  Typography,
} from "@mui/material";

import {
  setMobileIosRuCardPaymentHintAction,
  setMobileVkLoginOnIosAction,
} from "@/shared/lib/actions/mobileAppFeatureFlagsActions";

interface MobileAppFeaturesCardProps {
  initialVkLoginOnIos: boolean;
  initialIosRuCardPaymentHintEnabled: boolean;
}

/**
 * Управление публичными флагами мобильного клиента (читаются через API без JWT).
 */
export function MobileAppFeaturesCard({
  initialVkLoginOnIos,
  initialIosRuCardPaymentHintEnabled,
}: MobileAppFeaturesCardProps) {
  const [vkChecked, setVkChecked] = useState(initialVkLoginOnIos);
  const [iosRuCardHintChecked, setIosRuCardHintChecked] = useState(
    initialIosRuCardPaymentHintEnabled,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleVkChange = (_event: unknown, next: boolean) => {
    setError(null);
    const previous = vkChecked;
    setVkChecked(next);
    startTransition(async () => {
      try {
        const result = await setMobileVkLoginOnIosAction(next);
        if (!result.success) {
          setVkChecked(previous);
          setError(result.error ?? "Не удалось сохранить");
        }
      } catch (err) {
        reportClientError(err, {
          issueKey: "MobileAppFeaturesCard",
          keys: { operation: "setMobileVkLoginOnIos" },
        });
        setVkChecked(previous);
        setError(err instanceof Error ? err.message : "Ошибка сохранения");
      }
    });
  };

  const handleIosRuCardHintChange = (_event: unknown, next: boolean) => {
    setError(null);
    const previous = iosRuCardHintChecked;
    setIosRuCardHintChecked(next);
    startTransition(async () => {
      try {
        const result = await setMobileIosRuCardPaymentHintAction(next);
        if (!result.success) {
          setIosRuCardHintChecked(previous);
          setError(result.error ?? "Не удалось сохранить");
        }
      } catch (err) {
        reportClientError(err, {
          issueKey: "MobileAppFeaturesCard",
          keys: { operation: "setMobileIosRuCardPaymentHint" },
        });
        setIosRuCardHintChecked(previous);
        setError(err instanceof Error ? err.message : "Ошибка сохранения");
      }
    });
  };

  return (
    <Card>
      <CardHeader
        title="Мобильное приложение"
        subheader="Переключатели для клиента Gafus (данные отдаёт публичный API)"
      />
      <CardContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          На iOS кнопка «Продолжить через VK» на экране приветствия по умолчанию скрыта. Включите
          переключатель, чтобы показывать её пользователям iOS (например, после согласования с
          модерацией или обновления VK SDK).
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={vkChecked}
              onChange={handleVkChange}
              disabled={isPending}
              color="primary"
            />
          }
          label="Показывать вход через VK на iOS"
        />
        <FormControlLabel
          control={
            <Switch
              checked={iosRuCardHintChecked}
              onChange={handleIosRuCardHintChange}
              disabled={isPending}
              color="primary"
            />
          }
          label="Показывать подсказку «Оплата картами РФ доступна на сайте» в платных курсах iOS"
        />
        {error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
