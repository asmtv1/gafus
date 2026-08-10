"use client";

import AdsClick from "@mui/icons-material/AdsClick";
import Android from "@mui/icons-material/Android";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import ErrorOutline from "@mui/icons-material/ErrorOutline";
import Groups from "@mui/icons-material/Groups";
import PhoneIphone from "@mui/icons-material/PhoneIphone";
import Refresh from "@mui/icons-material/Refresh";
import SkipNext from "@mui/icons-material/SkipNext";
import Visibility from "@mui/icons-material/Visibility";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import type {
  RewardedAdsAdminDashboard,
  RewardedAdsSummary,
} from "@gafus/core/services/adminRewardedAds";

const DEFAULT_ECPM_RUB = 500;
const ECPM_STORAGE_KEY = "gafus:admin:rewarded-ads:ecpm-rub:v1";

const numberFormatter = new Intl.NumberFormat("ru-RU");
const moneyFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Moscow",
});
const dayFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

function estimateRevenue(impressions: number, ecpmRub: number): number {
  return Math.round(((impressions * ecpmRub) / 1000) * 100) / 100;
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  color = "primary.main",
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: "100%", minHeight: 126 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h4" fontWeight={750} sx={{ my: 0.5, fontSize: { xs: 28, sm: 34 } }}>
            {value}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        </Box>
        <Box sx={{ color, flexShrink: 0, "& svg": { fontSize: 38 } }}>{icon}</Box>
      </Box>
    </Paper>
  );
}

function FunnelRow({
  label,
  count,
  rate,
  max,
}: {
  label: string;
  count: number;
  rate: number | null;
  max: number;
}) {
  const width = max > 0 ? Math.max(3, (count / max) * 100) : 0;
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, mb: 0.5 }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" fontWeight={700} sx={{ whiteSpace: "nowrap" }}>
          {numberFormatter.format(count)}
          {rate == null ? "" : ` · ${rate.toFixed(1)}%`}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={width}
        aria-label={label}
        aria-valuetext={`${numberFormatter.format(count)} сессий${rate == null ? "" : `, конверсия ${rate.toFixed(1)}%`}`}
        sx={{ height: 9, borderRadius: 999, bgcolor: "action.hover" }}
      />
    </Box>
  );
}

function PlatformCard({
  platform,
  metrics,
}: {
  platform: "ANDROID" | "IOS";
  metrics: RewardedAdsSummary;
}) {
  const Icon = platform === "ANDROID" ? Android : PhoneIphone;
  return (
    <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          {platform === "ANDROID" ? "Android" : "iOS"}
        </Typography>
        <Icon color="primary" />
      </Stack>
      <Stack spacing={0.75}>
        <Typography variant="body2">Сессий: {numberFormatter.format(metrics.sessions)}</Typography>
        <Typography variant="body2">Показов: {numberFormatter.format(metrics.shown)}</Typography>
        <Typography variant="body2">
          Досмотрели: {numberFormatter.format(metrics.rewarded)} (
          {metrics.completionRate.toFixed(1)}%)
        </Typography>
        <Typography variant="body2" color={metrics.skipRate > 25 ? "warning.main" : "text.primary"}>
          Скипнули: {numberFormatter.format(metrics.skipped)} ({metrics.skipRate.toFixed(1)}%)
        </Typography>
        <Typography variant="body2" color={metrics.failed > 0 ? "error.main" : "text.primary"}>
          Ошибок: {numberFormatter.format(metrics.failed)}
        </Typography>
      </Stack>
    </Paper>
  );
}

export default function RewardedAdsMonitor({
  dashboard,
}: {
  dashboard: RewardedAdsAdminDashboard;
}) {
  const [ecpmRub, setEcpmRub] = useState(DEFAULT_ECPM_RUB);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const rawSaved = window.localStorage.getItem(ECPM_STORAGE_KEY);
    if (rawSaved === null) return;
    const saved = Number(rawSaved);
    if (Number.isFinite(saved) && saved >= 0) setEcpmRub(saved);
  }, []);

  const revenue = useMemo(
    () => ({
      today: estimateRevenue(dashboard.today.shown, ecpmRub),
      period: estimateRevenue(dashboard.period.shown, ecpmRub),
    }),
    [dashboard.period.shown, dashboard.today.shown, ecpmRub],
  );
  const recentDaily = dashboard.daily.slice(-14);
  const maxDailyRewarded = Math.max(0, ...recentDaily.map((point) => point.rewarded));
  const funnelMax = dashboard.period.sessions;

  const handleEcpmChange = (value: string) => {
    const next = Number(value);
    if (!Number.isFinite(next) || next < 0) return;
    setEcpmRub(next);
    window.localStorage.setItem(ECPM_STORAGE_KEY, String(next));
  };

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", md: "center" }}
        gap={2}
      >
        <Box>
          <Typography variant="h5" fontWeight={750}>
            Сегодня по Москве
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Обновлено {dateTimeFormatter.format(new Date(dashboard.generatedAt))}
          </Typography>
          <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 1 }}>
            <Chip
              size="small"
              color={dashboard.settings.androidEnabled ? "success" : "default"}
              variant="outlined"
              label={`Android: ${dashboard.settings.androidEnabled ? "включена" : "выключена"}`}
            />
            <Chip
              size="small"
              color={dashboard.settings.iosEnabled ? "success" : "default"}
              variant="outlined"
              label={`iOS: ${dashboard.settings.iosEnabled ? "включена" : "выключена"}`}
            />
            <Chip
              size="small"
              color={dashboard.settings.testMode ? "warning" : "success"}
              variant="outlined"
              label={dashboard.settings.testMode ? "Тестовый режим" : "Боевой режим"}
            />
          </Stack>
        </Box>
        <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
          {[7, 30, 90].map((days) => (
            <Button
              key={days}
              component={Link}
              href={`/main-panel/rewarded-ads?period=${days}`}
              variant={dashboard.range.days === days ? "contained" : "outlined"}
              size="small"
            >
              {days} дней
            </Button>
          ))}
          <Button
            variant="outlined"
            size="small"
            startIcon={<Refresh />}
            disabled={isRefreshing}
            onClick={() => startRefreshTransition(() => router.refresh())}
          >
            {isRefreshing ? "Обновление…" : "Обновить"}
          </Button>
        </Stack>
      </Stack>

      {dashboard.settings.testMode ? (
        <Alert severity="warning">
          Сейчас включён тестовый режим рекламы. Исторические сессии не хранят снимок test mode,
          поэтому отделить тестовые показы от боевых задним числом нельзя.
        </Alert>
      ) : null}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <MetricCard
            label="Пользователи досмотрели"
            value={numberFormatter.format(dashboard.today.uniqueRewardedUsers)}
            hint={`${numberFormatter.format(dashboard.today.rewarded)} завершённых просмотров`}
            icon={<Groups />}
            color="success.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <MetricCard
            label="Начали смотреть"
            value={numberFormatter.format(dashboard.today.uniqueShownUsers)}
            hint={`${numberFormatter.format(dashboard.today.shown)} показов началось сегодня`}
            icon={<Visibility />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <MetricCard
            label="Скипнули"
            value={numberFormatter.format(dashboard.today.uniqueSkippedUsers)}
            hint={`${numberFormatter.format(dashboard.today.skipped)} показов закрыто без награды`}
            icon={<SkipNext />}
            color="warning.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <MetricCard
            label="Доступ выдан"
            value={numberFormatter.format(dashboard.today.granted)}
            hint="Выдач доступа за сегодняшний день"
            icon={<CheckCircleOutline />}
            color="success.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <MetricCard
            label="Ошибки рекламы"
            value={numberFormatter.format(dashboard.today.failed)}
            hint="Ошибок загрузки или показа сегодня"
            icon={<ErrorOutline />}
            color={dashboard.today.failed > 0 ? "error.main" : "text.secondary"}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <MetricCard
            label="Оценка выручки сегодня"
            value={`≈ ${moneyFormatter.format(revenue.today)}`}
            hint={`По ${numberFormatter.format(dashboard.today.shown)} показам при eCPM ${numberFormatter.format(ecpmRub)} ₽`}
            icon={<AdsClick />}
            color="success.main"
          />
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", md: "center" }}
          gap={2}
        >
          <Box>
            <Typography variant="h6" fontWeight={700}>
              Сценарная оценка выручки
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 760 }}>
              Фактическую выручку рекламная сеть пока не передаёт в Gafus. Оценка считается как
              зафиксированные начала показа × eCPM / 1000 и нужна для сравнения сценариев, а не для
              бухгалтерского учёта.
            </Typography>
          </Box>
          <TextField
            label="Ожидаемый eCPM, ₽"
            type="number"
            size="small"
            value={ecpmRub}
            onChange={(event) => handleEcpmChange(event.target.value)}
            slotProps={{ htmlInput: { min: 0, step: 50 } }}
            sx={{ width: { xs: "100%", md: 210 }, flexShrink: 0 }}
          />
        </Stack>
        <Typography variant="h4" fontWeight={750} color="success.main" sx={{ mt: 2 }}>
          ≈ {moneyFormatter.format(revenue.period)} за {dashboard.range.days} дней
        </Typography>
      </Paper>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
              Воронка сессий за {dashboard.range.days} дней
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
              Когорта сессий, начатых в выбранном периоде. Процент — конверсия с предыдущего этапа.
            </Typography>
            <Stack spacing={2}>
              <FunnelRow
                label="Создали сессию"
                count={dashboard.period.sessions}
                rate={null}
                max={funnelMax}
              />
              <FunnelRow
                label="Реклама загрузилась"
                count={dashboard.period.loaded}
                rate={dashboard.period.loadRate}
                max={funnelMax}
              />
              <FunnelRow
                label="Показ начался"
                count={dashboard.period.shown}
                rate={dashboard.period.showRate}
                max={funnelMax}
              />
              <FunnelRow
                label="Досмотрели до награды"
                count={dashboard.period.rewarded}
                rate={dashboard.period.completionRate}
                max={funnelMax}
              />
              <FunnelRow
                label="Доступ выдан"
                count={dashboard.period.granted}
                rate={dashboard.period.grantRate}
                max={funnelMax}
              />
            </Stack>
            <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 2.5 }}>
              <Chip
                color="warning"
                variant="outlined"
                label={`Скипы: ${dashboard.period.skipped}`}
              />
              <Chip color="error" variant="outlined" label={`Ошибки: ${dashboard.period.failed}`} />
              <Chip variant="outlined" label={`Пользователей: ${dashboard.period.uniqueUsers}`} />
            </Stack>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Grid container spacing={2} sx={{ height: "100%" }}>
            {dashboard.byPlatform.map((platform) => (
              <Grid key={platform.platform} size={{ xs: 12, sm: 6, lg: 12 }}>
                <PlatformCard platform={platform.platform} metrics={platform} />
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="h6" fontWeight={700}>
          Досмотры по дням
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Последние {recentDaily.length} дней; сессия относится ко дню, когда пользователь запустил
          рекламу.
        </Typography>
        <Stack spacing={1.25}>
          {recentDaily.map((point) => (
            <Box
              key={point.date}
              sx={{
                display: "grid",
                gridTemplateColumns: "52px 1fr auto",
                gap: 1.5,
                alignItems: "center",
              }}
            >
              <Typography variant="caption">
                {dayFormatter.format(new Date(`${point.date}T00:00:00Z`))}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={maxDailyRewarded > 0 ? (point.rewarded / maxDailyRewarded) * 100 : 0}
                aria-label={`Досмотры ${dayFormatter.format(new Date(`${point.date}T00:00:00Z`))}`}
                aria-valuetext={`${point.rewarded} досмотров из ${point.shown} начатых показов`}
                color="success"
                sx={{ height: 9, borderRadius: 999, bgcolor: "action.hover" }}
              />
              <Typography
                variant="body2"
                fontWeight={700}
                sx={{ minWidth: 82, textAlign: "right" }}
              >
                {point.rewarded} / {point.shown}
              </Typography>
            </Box>
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
          Формат справа: досмотрели / начали смотреть.
        </Typography>
      </Paper>

      <Paper variant="outlined" sx={{ overflow: "hidden" }}>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="h6" fontWeight={700}>
            Эффективность по материалам
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Какие шаги и статьи чаще открывают за рекламу и где пользователи уходят.
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small" sx={{ minWidth: 940 }}>
            <TableHead>
              <TableRow>
                <TableCell>Материал</TableCell>
                <TableCell align="right">Сессии</TableCell>
                <TableCell align="right">Показы</TableCell>
                <TableCell align="right">Досмотры</TableCell>
                <TableCell align="right">Конверсия</TableCell>
                <TableCell align="right">Скипы</TableCell>
                <TableCell align="right">Ошибки</TableCell>
                <TableCell align="right">Оценка</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dashboard.byTarget.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 5, color: "text.secondary" }}>
                    За выбранный период рекламных сессий ещё не было.
                  </TableCell>
                </TableRow>
              ) : (
                dashboard.byTarget.map((target) => (
                  <TableRow key={`${target.targetType}:${target.targetId}`} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={650}>
                        {target.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {target.context ?? target.targetType}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{target.sessions}</TableCell>
                    <TableCell align="right">{target.shown}</TableCell>
                    <TableCell align="right">{target.rewarded}</TableCell>
                    <TableCell align="right">{target.completionRate.toFixed(1)}%</TableCell>
                    <TableCell align="right">{target.skipped}</TableCell>
                    <TableCell align="right">{target.failed}</TableCell>
                    <TableCell align="right">
                      ≈ {moneyFormatter.format(estimateRevenue(target.shown, ecpmRub))}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {dashboard.failures.length > 0 ? (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>
            Основные ошибки
          </Typography>
          <Stack direction="row" gap={1} flexWrap="wrap">
            {dashboard.failures.map((failure) => (
              <Chip
                key={failure.code}
                color="error"
                variant="outlined"
                label={`${failure.code}: ${failure.count}`}
              />
            ))}
          </Stack>
        </Paper>
      ) : null}

      <Alert severity="info">
        SHOWN используется как приближение рекламного показа и приходит с мобильного клиента, а не
        из отчёта Яндекса. Для сверки фактической выручки понадобится импорт отчёта рекламной сети;
        этот экран показывает продуктовую воронку и сценарную оценку. Исторические тестовые и боевые
        показы также нельзя надёжно разделить: снимок режима пока не хранится в рекламной сессии.
      </Alert>
    </Stack>
  );
}
