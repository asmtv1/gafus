"use client";

import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import Login from "@mui/icons-material/Login";
import PersonAddAlt1 from "@mui/icons-material/PersonAddAlt1";
import PersonOutline from "@mui/icons-material/PersonOutline";
import Refresh from "@mui/icons-material/Refresh";
import SkipNext from "@mui/icons-material/SkipNext";
import Visibility from "@mui/icons-material/Visibility";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { MobileIntroReport as MobileIntroReportData } from "@/features/mobile-intro/lib/mobileIntroReport";
import { MOBILE_INTRO_TIME_ZONE } from "@/features/mobile-intro/lib/dateRange";

const numberFormatter = new Intl.NumberFormat("ru-RU");

function formatRate(value: number, total: number): string {
  return total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "—";
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  color = "primary.main",
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: "100%", minHeight: 132 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h4" fontWeight={750} sx={{ my: 0.5, fontSize: { xs: 28, sm: 34 } }}>
            {numberFormatter.format(value)}
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

function FunnelRow({ label, count, total, color = "primary" }: {
  label: string;
  count: number;
  total: number;
  color?: "primary" | "success" | "warning" | "info" | "secondary";
}) {
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, mb: 0.5 }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" fontWeight={700} sx={{ whiteSpace: "nowrap" }}>
          {numberFormatter.format(count)} · {formatRate(count, total)}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        color={color}
        value={total > 0 ? (count / total) * 100 : 0}
        aria-label={label}
        aria-valuetext={`${numberFormatter.format(count)} установок, ${formatRate(count, total)}`}
        sx={{ height: 9, borderRadius: 999, bgcolor: "action.hover" }}
      />
    </Box>
  );
}

export default function MobileIntroReport({
  report,
  startDate,
  endDate,
}: {
  report: MobileIntroReportData;
  startDate: string;
  endDate: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draftStartDate, setDraftStartDate] = useState(startDate);
  const [draftEndDate, setDraftEndDate] = useState(endDate);
  const [dateError, setDateError] = useState<string | null>(null);
  const openings = report.openings;

  const applyRange = () => {
    if (!draftStartDate || !draftEndDate) {
      setDateError("Укажите обе даты периода.");
      return;
    }
    if (draftStartDate > draftEndDate) {
      setDateError("Дата «С» не может быть позже даты «По».");
      return;
    }
    setDateError(null);
    const params = new URLSearchParams({ start: draftStartDate, end: draftEndDate });
    startTransition(() => router.replace(`/main-panel/mobile-intro?${params.toString()}`));
  };

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            applyRange();
          }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            alignItems={{ xs: "stretch", md: "center" }}
            gap={1.5}
          >
            <TextField
              label="С"
              type="date"
              value={draftStartDate}
              onChange={(event) => setDraftStartDate(event.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: draftEndDate }}
              fullWidth
            />
            <TextField
              label="По"
              type="date"
              value={draftEndDate}
              onChange={(event) => setDraftEndDate(event.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: draftStartDate }}
              fullWidth
            />
            <Button
              type="submit"
              variant="contained"
              startIcon={<Refresh />}
              disabled={isPending}
              sx={{ minWidth: 150, minHeight: 48 }}
            >
              {isPending ? "Обновляем…" : "Применить"}
            </Button>
          </Stack>
          {dateError && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              {dateError}
            </Alert>
          )}
        </Box>
      </Paper>

      <Box>
        <Typography variant="body2" color="text.secondary">
          Период: по первому открытию презентации. Даты включительны, часовой пояс — {MOBILE_INTRO_TIME_ZONE}.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Регистрации и входы учтены на момент обновления отчёта, даже если они произошли после выбранного периода.
        </Typography>
      </Box>

      {openings === 0 && (
        <Alert severity="info">
          За выбранный период нет установок, впервые открывших вступительную презентацию.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <MetricCard label="Открыли презентацию" value={openings} hint="Установки" icon={<Visibility />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <MetricCard
            label="Завершили"
            value={report.completed}
            hint={`${formatRate(report.completed, openings)} от открытий`}
            icon={<CheckCircleOutline />}
            color="success.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <MetricCard
            label="Пропустили"
            value={report.skipped}
            hint={`${formatRate(report.skipped, openings)} от открытий`}
            icon={<SkipNext />}
            color="warning.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <MetricCard
            label="Зарегистрировались"
            value={report.registered}
            hint={`${formatRate(report.registered, openings)} от открытий`}
            icon={<PersonAddAlt1 />}
            color="success.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <MetricCard
            label="Вошли в аккаунт"
            value={report.loggedIn}
            hint={`${formatRate(report.loggedIn, openings)} от открытий`}
            icon={<Login />}
            color="info.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <MetricCard
            label="Пока без авторизации"
            value={report.pendingAuth}
            hint={`${formatRate(report.pendingAuth, openings)} от открытий`}
            icon={<PersonOutline />}
            color="text.secondary"
          />
        </Grid>
      </Grid>

      <Divider />

      <Box>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
          Воронка первого запуска
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Завершение и пропуск — результаты просмотра. Регистрация и вход — независимые результаты авторизации.
        </Typography>
        <Stack spacing={2.25}>
          <FunnelRow label="Открыли презентацию" count={openings} total={openings} />
          <FunnelRow label="Завершили" count={report.completed} total={openings} color="success" />
          <FunnelRow label="Пропустили" count={report.skipped} total={openings} color="warning" />
          <FunnelRow label="Зарегистрировались" count={report.registered} total={openings} color="success" />
          <FunnelRow label="Вошли в существующий аккаунт" count={report.loggedIn} total={openings} color="info" />
          <FunnelRow label="Пока без входа и регистрации" count={report.pendingAuth} total={openings} color="secondary" />
        </Stack>
      </Box>
    </Stack>
  );
}
