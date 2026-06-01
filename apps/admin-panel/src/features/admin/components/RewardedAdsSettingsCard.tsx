"use client";

import { useState, useTransition } from "react";
import { reportClientError } from "@gafus/error-handling";
import type { RewardedAdSettingsDto } from "@gafus/core/services/rewardedCredits";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";

import { updateRewardedAdSettingsAction } from "@/shared/lib/actions/rewardedAdsAdminActions";

interface RewardedAdsSettingsCardProps {
  actorRole: string;
  initialSettings: RewardedAdSettingsDto;
}

export function RewardedAdsSettingsCard({
  actorRole,
  initialSettings,
}: RewardedAdsSettingsCardProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isAdmin = actorRole === "ADMIN";

  const setBool = (key: keyof RewardedAdSettingsDto) => (value: boolean) =>
    setSettings((current) => ({ ...current, [key]: value }));
  const setText = (key: keyof RewardedAdSettingsDto) => (value: string) =>
    setSettings((current) => ({ ...current, [key]: value }));

  const onSave = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const result = await updateRewardedAdSettingsAction({
          ...settings,
          yandexAndroidPlacementId: settings.yandexAndroidPlacementId?.trim() || null,
          yandexIosPlacementId: settings.yandexIosPlacementId?.trim() || null,
          yandexWebDesktopBlockId: settings.yandexWebDesktopBlockId?.trim() || null,
          yandexWebTouchBlockId: settings.yandexWebTouchBlockId?.trim() || null,
        });
        if (!result.success) {
          setError(result.error ?? "Не удалось сохранить");
          return;
        }
        setSuccess("Сохранено");
      } catch (err) {
        reportClientError(err, { issueKey: "RewardedAdsSettingsCard" });
        setError(err instanceof Error ? err.message : "Ошибка сохранения");
      }
    });
  };

  return (
    <Card>
      <CardHeader title="Rewarded Ads" subheader="Платформы, лимиты и Yandex placement IDs" />
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.androidEnabled}
                  onChange={(event) => setBool("androidEnabled")(event.target.checked)}
                  disabled={!isAdmin || isPending}
                />
              }
              label="Android"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.iosEnabled}
                  onChange={(event) => setBool("iosEnabled")(event.target.checked)}
                  disabled={!isAdmin || isPending}
                />
              }
              label="iOS"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.webDesktopEnabled}
                  onChange={(event) => setBool("webDesktopEnabled")(event.target.checked)}
                  disabled={!isAdmin || isPending}
                />
              }
              label="Web desktop"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.webTouchEnabled}
                  onChange={(event) => setBool("webTouchEnabled")(event.target.checked)}
                  disabled={!isAdmin || isPending}
                />
              }
              label="Web touch"
            />
          </Stack>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.paywallCtaEnabled}
                  onChange={(event) => setBool("paywallCtaEnabled")(event.target.checked)}
                  disabled={!isAdmin || isPending}
                />
              }
              label="Paywall CTA"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.testMode}
                  onChange={(event) => setBool("testMode")(event.target.checked)}
                  disabled={!isAdmin || isPending}
                />
              }
              label="Test mode"
            />
            <TextField
              select
              label="Daily ad limit"
              value={settings.dailyAdLimit}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  dailyAdLimit: Number(event.target.value) as 1 | 2 | 3,
                }))
              }
              disabled={!isAdmin || isPending}
              sx={{ minWidth: 180 }}
            >
              {[1, 2, 3].map((value) => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            label="Yandex Android placement ID"
            value={settings.yandexAndroidPlacementId ?? ""}
            onChange={(event) => setText("yandexAndroidPlacementId")(event.target.value)}
            disabled={!isAdmin || isPending}
          />
          <TextField
            label="Yandex iOS placement ID"
            value={settings.yandexIosPlacementId ?? ""}
            onChange={(event) => setText("yandexIosPlacementId")(event.target.value)}
            disabled={!isAdmin || isPending}
          />
          <TextField
            label="Yandex web desktop block ID"
            value={settings.yandexWebDesktopBlockId ?? ""}
            onChange={(event) => setText("yandexWebDesktopBlockId")(event.target.value)}
            disabled={!isAdmin || isPending}
          />
          <TextField
            label="Yandex web touch block ID"
            value={settings.yandexWebTouchBlockId ?? ""}
            onChange={(event) => setText("yandexWebTouchBlockId")(event.target.value)}
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
