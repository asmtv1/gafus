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

import { setMobileVkLoginOnIosAction } from "@/shared/lib/actions/mobileAppFeatureFlagsActions";

interface MobileAppFeaturesCardProps {
  initialVkLoginOnIos: boolean;
}

/**
 * Управление публичными флагами мобильного клиента (читаются через API без JWT).
 */
export function MobileAppFeaturesCard({ initialVkLoginOnIos }: MobileAppFeaturesCardProps) {
  const [checked, setChecked] = useState(initialVkLoginOnIos);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleChange = (_event: unknown, next: boolean) => {
    setError(null);
    const previous = checked;
    setChecked(next);
    startTransition(async () => {
      try {
        const result = await setMobileVkLoginOnIosAction(next);
        if (!result.success) {
          setChecked(previous);
          setError(result.error ?? "Не удалось сохранить");
        }
      } catch (err) {
        reportClientError(err, {
          issueKey: "MobileAppFeaturesCard",
          keys: { operation: "setMobileVkLoginOnIos" },
        });
        setChecked(previous);
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
              checked={checked}
              onChange={handleChange}
              disabled={isPending}
              color="primary"
            />
          }
          label="Показывать вход через VK на iOS"
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
