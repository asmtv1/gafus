"use client";

import { reportClientError } from "@gafus/error-handling";
import { useEffect, useMemo, useState, useTransition } from "react";

import type {
  MobileReleaseControlDto,
  MobileVersionedFeatureValues,
} from "@gafus/core/services/appFeatureFlags";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { CheckCircle, ExpandMore, Science, Security, Storefront } from "@mui/icons-material";

import { updateMobileReleaseControlAction } from "@/shared/lib/actions/mobileAppFeatureFlagsActions";

type FeatureKey = keyof MobileVersionedFeatureValues;

const FEATURES: {
  key: FeatureKey;
  title: string;
  description: string;
}[] = [
  {
    key: "vkLogin",
    title: "VK ID",
    description: "Вход, регистрация и подключение VK в профиле на iOS.",
  },
  {
    key: "iosRuCardPayment",
    title: "ЮKassa: кнопка оплаты",
    description: "Переход к оплате подписки российской картой.",
  },
  {
    key: "iosRuCardPaymentHint",
    title: "ЮKassa: подсказка",
    description: "Подсказка об оплате российской картой в каталоге курсов.",
  },
  {
    key: "subscriptionPromoCodes",
    title: "Промокоды на iOS",
    description: "Поле промокода для первой оплаты Premium через ЮKassa на iOS.",
  },
  {
    key: "rewardedAds",
    title: "Rewarded-реклама",
    description: "Просмотр рекламы для доступа к материалу на 7 дней на iOS.",
  },
];

function cloneConfig(config: MobileReleaseControlDto): MobileReleaseControlDto {
  return {
    ...config,
    released: { ...config.released },
    review: { ...config.review },
    global: { ...config.global },
    rewardedAds: { ...config.rewardedAds },
    updatedBy: config.updatedBy ? { ...config.updatedBy } : null,
  };
}

function FeatureSwitch({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: string;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Switch
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        inputProps={{ "aria-label": label }}
      />
      <Chip
        size="small"
        color={checked ? "success" : "default"}
        variant={checked ? "filled" : "outlined"}
        label={checked ? "Включено" : "Выключено"}
      />
    </Stack>
  );
}

function FeatureDescription({ title, description }: { title: string; description: string }) {
  return (
    <Box>
      <Typography fontWeight={600}>{title}</Typography>
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>
    </Box>
  );
}

function ProfileCard({
  title,
  subtitle,
  color,
  values,
  disabled,
  onChange,
}: {
  title: string;
  subtitle: string;
  color: "success" | "warning";
  values: MobileVersionedFeatureValues;
  disabled: boolean;
  onChange: (key: FeatureKey, checked: boolean) => void;
}) {
  return (
    <Card variant="outlined">
      <CardHeader
        title={<Chip color={color} label={title} />}
        subheader={subtitle}
        titleTypographyProps={{ component: "div" }}
      />
      <CardContent>
        <Stack spacing={2.5}>
          {FEATURES.map((feature) => (
            <Box key={feature.key}>
              <FeatureDescription title={feature.title} description={feature.description} />
              <Box sx={{ mt: 0.75 }}>
                <FeatureSwitch
                  checked={values[feature.key]}
                  disabled={disabled}
                  label={`${title}: ${feature.title}`}
                  onChange={(checked) => onChange(feature.key, checked)}
                />
              </Box>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function formatSavedAt(value: string | null): string {
  if (!value) return "ещё не сохранялось";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "дата неизвестна" : date.toLocaleString("ru-RU");
}

function parseDailyAdLimit(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed <= 100 ? parsed : null;
}

function buildDiff(saved: MobileReleaseControlDto, draft: MobileReleaseControlDto): string[] {
  const lines: string[] = [];
  if (saved.iosReviewVersion !== draft.iosReviewVersion) {
    lines.push(
      `Версия на ревью: ${saved.iosReviewVersion ?? "нет"} → ${draft.iosReviewVersion ?? "нет"}`,
    );
  }
  for (const profile of ["released", "review"] as const) {
    for (const feature of FEATURES) {
      if (saved[profile][feature.key] !== draft[profile][feature.key]) {
        lines.push(
          `${profile === "released" ? "App Store" : "Ревью"} · ${feature.title}: ${
            draft[profile][feature.key] ? "включить" : "выключить"
          }`,
        );
      }
    }
  }
  if (saved.global.appSubscriptionPaywall !== draft.global.appSubscriptionPaywall) {
    lines.push(
      `Paywall подписки: ${draft.global.appSubscriptionPaywall ? "включить" : "выключить"}`,
    );
  }
  if (saved.global.appSubscriptionGating !== draft.global.appSubscriptionGating) {
    lines.push(
      `Серверная блокировка: ${draft.global.appSubscriptionGating ? "включить" : "выключить"}`,
    );
  }
  if (saved.rewardedAds.dailyAdLimit !== draft.rewardedAds.dailyAdLimit) {
    lines.push(
      `Дневной лимит рекламы: ${saved.rewardedAds.dailyAdLimit} → ${draft.rewardedAds.dailyAdLimit}`,
    );
  }
  const rewardedAdsDetailsChanged =
    saved.rewardedAds.androidEnabled !== draft.rewardedAds.androidEnabled ||
    saved.rewardedAds.yandexAndroidPlacementId !== draft.rewardedAds.yandexAndroidPlacementId ||
    saved.rewardedAds.yandexIosPlacementId !== draft.rewardedAds.yandexIosPlacementId ||
    saved.rewardedAds.testMode !== draft.rewardedAds.testMode;
  if (rewardedAdsDetailsChanged) {
    lines.push("Изменить расширенные настройки рекламы");
  }
  return lines;
}

export function MobileReleaseControl({
  actorRole,
  initialConfig,
}: {
  actorRole: string;
  initialConfig: MobileReleaseControlDto;
}) {
  const [saved, setSaved] = useState(() => cloneConfig(initialConfig));
  const [draft, setDraft] = useState(() => cloneConfig(initialConfig));
  const [dailyAdLimitInput, setDailyAdLimitInput] = useState(() =>
    String(initialConfig.rewardedAds.dailyAdLimit),
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isAdmin = actorRole === "ADMIN";
  const dailyAdLimit = parseDailyAdLimit(dailyAdLimitInput);
  const dailyAdLimitValid = dailyAdLimit !== null;
  const dirty =
    JSON.stringify(saved) !== JSON.stringify(draft) ||
    dailyAdLimitInput !== String(saved.rewardedAds.dailyAdLimit);
  const versionValid =
    draft.iosReviewVersion === null ||
    draft.iosReviewVersion === "" ||
    /^\d+\.\d+\.\d+$/.test(draft.iosReviewVersion);
  const diff = useMemo(() => buildDiff(saved, draft), [saved, draft]);

  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const updateProfile = (profile: "released" | "review", key: FeatureKey, checked: boolean) => {
    setDraft((current) => ({
      ...current,
      [profile]: { ...current[profile], [key]: checked },
    }));
    setError(null);
    setSuccess(null);
  };

  const openConfirmation = () => {
    if (!versionValid) {
      setError("Версия должна быть в формате 1.6.7");
      return;
    }
    if (!dailyAdLimitValid) {
      setError("Введите целое число от 0 до 100.");
      return;
    }
    setConfirmOpen(true);
  };

  const save = () => {
    if (dailyAdLimit === null) {
      setError("Введите целое число от 0 до 100.");
      return;
    }
    setConfirmOpen(false);
    setError(null);
    setSuccess(null);
    setStale(false);
    startTransition(async () => {
      try {
        const payload = {
          ...draft,
          iosReviewVersion: draft.iosReviewVersion?.trim() || null,
          rewardedAds: {
            ...draft.rewardedAds,
            dailyAdLimit,
            yandexAndroidPlacementId: draft.rewardedAds.yandexAndroidPlacementId?.trim() || null,
            yandexIosPlacementId: draft.rewardedAds.yandexIosPlacementId?.trim() || null,
          },
        };
        const result = await updateMobileReleaseControlAction(payload);
        if (!result.success) {
          setError(result.error);
          setStale(result.code === "STALE_CONFIG");
          return;
        }
        const next = cloneConfig(result.data);
        setSaved(next);
        setDraft(cloneConfig(next));
        setDailyAdLimitInput(String(next.rewardedAds.dailyAdLimit));
        setSuccess("Настройки применены атомарно ко всем мобильным профилям.");
      } catch (saveError) {
        reportClientError(saveError, {
          issueKey: "MobileReleaseControl",
          keys: { operation: "save" },
        });
        setError(saveError instanceof Error ? saveError.message : "Ошибка сохранения");
      }
    });
  };

  const disabled = !isAdmin || isPending;
  const reviewVersionLabel = draft.iosReviewVersion?.trim() || "версия не выбрана";

  return (
    <Stack spacing={2.5}>
      {!isAdmin ? (
        <Alert severity="info">
          Режим просмотра: применять релизные настройки может только ADMIN.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          avatar={<Science color="warning" />}
          title="Версия iOS на проверке"
          subheader="Только точное совпадение версии получает профиль «На ревью»."
        />
        <CardContent>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ sm: "flex-start" }}
          >
            <TextField
              label="Версия на ревью"
              placeholder="1.6.7"
              value={draft.iosReviewVersion ?? ""}
              disabled={disabled}
              error={!versionValid}
              helperText={
                versionValid
                  ? "Формат x.y.z. Пустое поле отключает review-профиль."
                  : "Например: 1.6.7"
              }
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  iosReviewVersion: event.target.value || null,
                }))
              }
              sx={{ minWidth: { sm: 280 } }}
            />
            <Chip
              color={draft.iosReviewVersion ? "warning" : "default"}
              label={
                draft.iosReviewVersion
                  ? `Review-профиль: ${draft.iosReviewVersion}`
                  : "Review-профиль не активен"
              }
              sx={{ mt: { sm: 1 } }}
            />
            <Button
              color="inherit"
              disabled={disabled || !draft.iosReviewVersion}
              onClick={() => setDraft((current) => ({ ...current, iosReviewVersion: null }))}
              sx={{ mt: { sm: 0.5 } }}
            >
              Снять с ревью
            </Button>
          </Stack>
          {saved.iosReviewVersion &&
          draft.iosReviewVersion &&
          saved.iosReviewVersion !== draft.iosReviewVersion ? (
            <Alert severity="warning" sx={{ mt: 2 }}>
              После сохранения {saved.iosReviewVersion} перейдёт на профиль «В App Store», а{" "}
              {draft.iosReviewVersion} — на профиль «На ревью».
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          avatar={<Storefront color="success" />}
          title="Сравнение профилей"
          subheader={`Review-колонка применяется только к ${reviewVersionLabel}.`}
          action={
            <Button
              variant="outlined"
              color="warning"
              disabled={disabled}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  review: {
                    vkLogin: false,
                    iosRuCardPayment: false,
                    iosRuCardPaymentHint: false,
                    subscriptionPromoCodes: false,
                    rewardedAds: false,
                  },
                }))
              }
            >
              Безопасный профиль ревью
            </Button>
          }
        />
        <CardContent>
          <Box sx={{ display: { xs: "none", md: "block" } }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "minmax(280px, 1.5fr) 1fr 1fr",
                gap: 2,
                alignItems: "center",
              }}
            >
              <Typography color="text.secondary">Функция</Typography>
              <Chip color="success" label="В App Store" sx={{ justifySelf: "start" }} />
              <Chip
                color="warning"
                label={`На ревью · ${reviewVersionLabel}`}
                sx={{ justifySelf: "start" }}
              />
              {FEATURES.map((feature) => (
                <Box key={feature.key} sx={{ display: "contents" }}>
                  <FeatureDescription title={feature.title} description={feature.description} />
                  <FeatureSwitch
                    checked={draft.released[feature.key]}
                    disabled={disabled}
                    label={`В App Store: ${feature.title}`}
                    onChange={(checked) => updateProfile("released", feature.key, checked)}
                  />
                  <FeatureSwitch
                    checked={draft.review[feature.key]}
                    disabled={disabled}
                    label={`На ревью: ${feature.title}`}
                    onChange={(checked) => updateProfile("review", feature.key, checked)}
                  />
                </Box>
              ))}
            </Box>
          </Box>

          <Box
            sx={{
              display: { xs: "grid", md: "none" },
              gridTemplateColumns: "1fr",
              gap: 2,
            }}
          >
            <ProfileCard
              title="В App Store"
              subtitle={`Все версии, кроме ${reviewVersionLabel}.`}
              color="success"
              values={draft.released}
              disabled={disabled}
              onChange={(key, checked) => updateProfile("released", key, checked)}
            />
            <ProfileCard
              title="На ревью"
              subtitle={`Только ${reviewVersionLabel}.`}
              color="warning"
              values={draft.review}
              disabled={disabled}
              onChange={(key, checked) => updateProfile("review", key, checked)}
            />
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          avatar={<Security color="primary" />}
          title="Глобальные ограничения"
          subheader="Эти настройки действуют для всех версий и платформ."
        />
        <CardContent>
          <Stack spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={draft.global.appSubscriptionPaywall}
                  disabled={disabled}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      global: {
                        ...current.global,
                        appSubscriptionPaywall: event.target.checked,
                      },
                    }))
                  }
                />
              }
              label="Показывать paywall подписки"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={draft.global.appSubscriptionGating}
                  disabled={disabled}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      global: {
                        ...current.global,
                        appSubscriptionGating: event.target.checked,
                      },
                    }))
                  }
                />
              }
              label="Блокировать платные действия без подписки"
            />
            {!draft.global.appSubscriptionGating ? (
              <Alert severity="error">
                Серверная блокировка отключена: платные действия будут доступны без подписки во всех
                версиях.
              </Alert>
            ) : null}
          </Stack>
        </CardContent>
      </Card>

      <Accordion>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box>
            <Typography fontWeight={600}>Расширенные настройки рекламы</Typography>
            <Typography variant="body2" color="text.secondary">
              Android, тестовый режим, дневной лимит и Yandex placement ID.
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={draft.rewardedAds.androidEnabled}
                    disabled={disabled}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        rewardedAds: {
                          ...current.rewardedAds,
                          androidEnabled: event.target.checked,
                        },
                      }))
                    }
                  />
                }
                label="Реклама на Android"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={draft.rewardedAds.testMode}
                    disabled={disabled}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        rewardedAds: {
                          ...current.rewardedAds,
                          testMode: event.target.checked,
                        },
                      }))
                    }
                  />
                }
                label="Тестовый режим"
              />
              <TextField
                type="number"
                label="Лимит просмотров в сутки"
                value={dailyAdLimitInput}
                disabled={disabled}
                error={!dailyAdLimitValid}
                helperText={
                  dailyAdLimitValid
                    ? "От 0 до 100 на одного пользователя. 0 — полностью отключить просмотры рекламы."
                    : "Введите целое число от 0 до 100."
                }
                onChange={(event) => {
                  const value = event.target.value;
                  setDailyAdLimitInput(value);
                  const parsed = parseDailyAdLimit(value);
                  if (parsed !== null) {
                    setDraft((current) => ({
                      ...current,
                      rewardedAds: {
                        ...current.rewardedAds,
                        dailyAdLimit: parsed,
                      },
                    }));
                  }
                  setError(null);
                  setSuccess(null);
                }}
                slotProps={{
                  htmlInput: { min: 0, max: 100, step: 1, inputMode: "numeric" },
                }}
                sx={{ width: { xs: "100%", sm: 260 } }}
              />
            </Stack>
            {dailyAdLimitValid && dailyAdLimit === 0 ? (
              <Alert severity="warning">
                После сохранения просмотр рекламы будет недоступен всем пользователям.
              </Alert>
            ) : null}
            <TextField
              label="Yandex Android placement ID"
              value={draft.rewardedAds.yandexAndroidPlacementId ?? ""}
              disabled={disabled}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  rewardedAds: {
                    ...current.rewardedAds,
                    yandexAndroidPlacementId: event.target.value || null,
                  },
                }))
              }
            />
            <TextField
              label="Yandex iOS placement ID"
              value={draft.rewardedAds.yandexIosPlacementId ?? ""}
              disabled={disabled}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  rewardedAds: {
                    ...current.rewardedAds,
                    yandexIosPlacementId: event.target.value || null,
                  },
                }))
              }
            />
          </Stack>
        </AccordionDetails>
      </Accordion>

      {error ? (
        <Alert
          severity="error"
          action={
            stale ? (
              <Button color="inherit" size="small" onClick={() => window.location.reload()}>
                Обновить
              </Button>
            ) : undefined
          }
        >
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert icon={<CheckCircle fontSize="inherit" />} severity="success">
          {success}
        </Alert>
      ) : null}

      <Card
        sx={{
          position: "sticky",
          bottom: 16,
          zIndex: 5,
          boxShadow: 6,
        }}
      >
        <CardContent>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ sm: "center" }}
            spacing={2}
          >
            <Box>
              <Typography fontWeight={600}>
                {dirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Последнее сохранение: {formatSavedAt(saved.updatedAt)}
                {saved.updatedBy ? ` · ${saved.updatedBy.username}` : ""}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button
                disabled={disabled || !dirty}
                onClick={() => {
                  setDraft(cloneConfig(saved));
                  setDailyAdLimitInput(String(saved.rewardedAds.dailyAdLimit));
                  setError(null);
                  setSuccess(null);
                }}
              >
                Отменить
              </Button>
              <Button
                variant="contained"
                disabled={disabled || !dirty || !versionValid || !dailyAdLimitValid}
                onClick={openConfirmation}
              >
                {isPending ? "Сохранение…" : "Сохранить"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Применить изменения?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.25} sx={{ mt: 0.5 }}>
            {diff.map((line) => (
              <Typography key={line}>• {line}</Typography>
            ))}
            {!draft.global.appSubscriptionGating ? (
              <>
                <Divider />
                <Alert severity="error">
                  Внимание: серверная блокировка подписки будет отключена глобально.
                </Alert>
              </>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Вернуться</Button>
          <Button variant="contained" onClick={save}>
            Применить
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
