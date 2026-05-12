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
  setAppSubscriptionGatingEnabledAction,
  setAppSubscriptionPaywallEnabledAction,
  setMobileIosRuCardPaymentEnabledAction,
  setMobileIosRuCardPaymentHintAction,
  setMobileVkLoginOnIosAction,
} from "@/shared/lib/actions/mobileAppFeatureFlagsActions";

interface MobileAppFeaturesCardProps {
  actorRole: string;
  initialVkLoginOnIos: boolean;
  initialIosRuCardPaymentHintEnabled: boolean;
  initialIosRuCardPaymentEnabled: boolean;
  initialAppSubscriptionPaywallEnabled: boolean;
  initialAppSubscriptionGatingEnabled: boolean;
}

/**
 * Управление публичными флагами мобильного клиента (читаются через API без JWT).
 */
export function MobileAppFeaturesCard({
  actorRole,
  initialVkLoginOnIos,
  initialIosRuCardPaymentHintEnabled,
  initialIosRuCardPaymentEnabled,
  initialAppSubscriptionPaywallEnabled,
  initialAppSubscriptionGatingEnabled,
}: MobileAppFeaturesCardProps) {
  const [vkChecked, setVkChecked] = useState(initialVkLoginOnIos);
  const [iosRuCardHintChecked, setIosRuCardHintChecked] = useState(
    initialIosRuCardPaymentHintEnabled,
  );
  const [iosRuCardChecked, setIosRuCardChecked] = useState(initialIosRuCardPaymentEnabled);
  const [appSubPaywallChecked, setAppSubPaywallChecked] = useState(
    initialAppSubscriptionPaywallEnabled,
  );
  const [appSubGatingChecked, setAppSubGatingChecked] = useState(
    initialAppSubscriptionGatingEnabled,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isAdmin = actorRole === "ADMIN";

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

  const handleIosRuCardChange = (_event: unknown, next: boolean) => {
    setError(null);
    const previous = iosRuCardChecked;
    setIosRuCardChecked(next);
    startTransition(async () => {
      try {
        const result = await setMobileIosRuCardPaymentEnabledAction(next);
        if (!result.success) {
          setIosRuCardChecked(previous);
          setError(result.error ?? "Не удалось сохранить");
        }
      } catch (err) {
        reportClientError(err, {
          issueKey: "MobileAppFeaturesCard",
          keys: { operation: "setMobileIosRuCardPaymentEnabled" },
        });
        setIosRuCardChecked(previous);
        setError(err instanceof Error ? err.message : "Ошибка сохранения");
      }
    });
  };

  const handleAppSubPaywallChange = (_event: unknown, next: boolean) => {
    setError(null);
    const previous = appSubPaywallChecked;
    setAppSubPaywallChecked(next);
    startTransition(async () => {
      try {
        const result = await setAppSubscriptionPaywallEnabledAction(next);
        if (!result.success) {
          setAppSubPaywallChecked(previous);
          setError(result.error ?? "Не удалось сохранить");
        }
      } catch (err) {
        reportClientError(err, {
          issueKey: "MobileAppFeaturesCard",
          keys: { operation: "setAppSubscriptionPaywallEnabled" },
        });
        setAppSubPaywallChecked(previous);
        setError(err instanceof Error ? err.message : "Ошибка сохранения");
      }
    });
  };

  const handleAppSubGatingChange = (_event: unknown, next: boolean) => {
    setError(null);
    const previous = appSubGatingChecked;
    setAppSubGatingChecked(next);
    startTransition(async () => {
      try {
        const result = await setAppSubscriptionGatingEnabledAction(next);
        if (!result.success) {
          setAppSubGatingChecked(previous);
          setError(result.error ?? "Не удалось сохранить");
        }
      } catch (err) {
        reportClientError(err, {
          issueKey: "MobileAppFeaturesCard",
          keys: { operation: "setAppSubscriptionGatingEnabled" },
        });
        setAppSubGatingChecked(previous);
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
        <FormControlLabel
          control={
            <Switch
              checked={iosRuCardChecked}
              onChange={handleIosRuCardChange}
              disabled={isPending || !isAdmin}
              color="primary"
            />
          }
          label="Показывать кнопку «Оплатить картой РФ» на iOS paywall (ADMIN)"
        />
        <FormControlLabel
          control={
            <Switch
              checked={appSubPaywallChecked}
              onChange={handleAppSubPaywallChange}
              disabled={isPending || !isAdmin}
              color="primary"
            />
          }
          label="Показывать paywall подписки (ADMIN)"
        />
        <FormControlLabel
          control={
            <Switch
              checked={appSubGatingChecked}
              onChange={handleAppSubGatingChange}
              disabled={isPending || !isAdmin}
              color="primary"
            />
          }
          label="Блокировать платные действия без подписки (ADMIN)"
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
