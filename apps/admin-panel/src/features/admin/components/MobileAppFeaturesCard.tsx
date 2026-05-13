"use client";

import { reportClientError } from "@gafus/error-handling";
import { useState, useTransition } from "react";

import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  Box,
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
  const flagLabel = (title: string, description: string) => (
    <Box>
      <Typography component="span" variant="body1">
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>
    </Box>
  );

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
        title="Фича флаги"
        subheader="Переключатели для мобильного клиента Gafus и серверных проверок подписки"
      />
      <CardContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={vkChecked}
                onChange={handleVkChange}
                disabled={isPending}
                color="primary"
              />
            }
            label={flagLabel(
              "Показывать вход через VK на iOS",
              "Управляет кнопкой «Продолжить через VK» на welcome-экране iOS-приложения.",
            )}
            sx={{ alignItems: "flex-start" }}
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
            label={flagLabel(
              "Показывать подсказку про оплату картами РФ на iOS",
              "Добавляет в платных курсах iOS текст, что оплата картами РФ доступна на сайте.",
            )}
            sx={{ alignItems: "flex-start" }}
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
            label={flagLabel(
              "Показывать кнопку «Оплатить картой РФ» на iOS paywall",
              "Включает отдельную кнопку перехода к оплате российской картой. Доступно только ADMIN.",
            )}
            sx={{ alignItems: "flex-start" }}
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
            label={flagLabel(
              "Показывать paywall подписки",
              "Разрешает клиентам автоматически показывать экран покупки подписки. Доступно только ADMIN.",
            )}
            sx={{ alignItems: "flex-start" }}
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
            label={flagLabel(
              "Блокировать платные действия без подписки",
              "Включает серверную проверку подписки для платных действий. Доступно только ADMIN.",
            )}
            sx={{ alignItems: "flex-start" }}
          />
        </Box>
        {error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
