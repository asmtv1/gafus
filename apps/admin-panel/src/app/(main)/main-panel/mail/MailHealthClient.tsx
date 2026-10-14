"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Chip, Paper, Stack, Typography } from "@mui/material";

type Dashboard = Awaited<ReturnType<typeof import("@gafus/core/services/systemHealth").getAdminMailDashboard>>;

function fmt(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

export default function MailHealthClient({ data }: { data: Dashboard }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [router]);

  const { summary } = data;
  const metrics = [
    ["Нужны действия", summary.attention, summary.attention > 0 ? "error" : "success"],
    ["В очереди", summary.pending, "default"],
    ["Отправляется", summary.processing, "default"],
    ["Принято за 24 ч", summary.sent24h, "success"],
    ["Неопределённые", summary.unknown, summary.unknown ? "warning" : "success"],
    ["Ошибки / истекли", summary.failed + summary.expired, summary.failed + summary.expired ? "error" : "success"],
    ["Сбои доставки за 24 ч", summary.deliveryFailures24h, summary.deliveryFailures24h ? "error" : "success"],
  ] as const;

  return (
    <Box sx={{ maxWidth: 1180, mx: "auto", p: { xs: 2, sm: 3 } }}>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 1 }}>Почта и алерты</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Resend · обновление каждые 30 секунд · последнее обновление {fmt(data.updatedAt)} МСК
      </Typography>
      {summary.attention > 0 ? (
        <Alert severity="warning" sx={{ mb: 2 }}>Есть проблемные отправки. Проверьте детали ниже; старые и просроченные письма автоматически не пересылаются.</Alert>
      ) : (
        <Alert severity="success" sx={{ mb: 2 }}>Активных ошибок доставки и зависших попыток нет.</Alert>
      )}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 1.5, mb: 3 }}>
        {metrics.map(([label, value, color]) => (
          <Paper key={label} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography variant="h4" fontWeight={700} color={color === "error" ? "error.main" : "text.primary"}>{value}</Typography>
          </Paper>
        ))}
      </Box>
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>Очередь писем</Typography>
          {data.outbox.length === 0 ? <Typography color="text.secondary">Проблемных и ожидающих писем нет.</Typography> :
            <Stack spacing={1}>
              {data.outbox.map((row) => (
                <Box key={row.id} sx={{ display: "flex", gap: 1.5, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                  <Box sx={{ minWidth: 180 }}>
                    <Typography fontWeight={600}>{row.category} · {row.id}…</Typography>
                    <Typography variant="caption" color="text.secondary">Создано: {fmt(row.createdAt)} · попыток: {row.attempts}</Typography>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    {row.code && <Typography variant="caption" color="text.secondary">{row.code}</Typography>}
                    <Chip size="small" color={row.status === "FAILED" || row.status === "EXPIRED" ? "error" : row.status === "PROCESSING" ? "info" : "warning"} label={row.status} />
                  </Stack>
                </Box>
              ))}
            </Stack>}
        </Paper>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>Неопределённые и неудачные обращения к Resend</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            UNKNOWN означает, что ответ провайдера не был получен; это не доказательство потери письма.
          </Typography>
          {data.attempts.length === 0 ? <Typography color="text.secondary">Ошибок нет.</Typography> :
            <Stack spacing={1}>
              {data.attempts.map((row) => (
                <Box key={row.id} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, borderBottom: "1px solid", borderColor: "divider", py: 1 }}>
                  <Typography variant="body2">{fmt(row.createdAt)} · {row.id}…</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="caption">{row.code ?? "—"}</Typography>
                    <Chip size="small" color={row.status === "FAILED" ? "error" : "warning"} label={row.status} />
                  </Stack>
                </Box>
              ))}
            </Stack>}
        </Paper>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>Отказы доставки от Resend (24 часа)</Typography>
          {data.events.length === 0 ? <Typography color="text.secondary">Событий отказа нет.</Typography> :
            <Stack spacing={1}>{data.events.map((event, i) =>
              <Typography key={i} variant="body2">{fmt(event.receivedAt)} · {event.type} · {event.code ?? "без кода"}</Typography>,
            )}</Stack>}
        </Paper>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
        Администратору доступны только технические коды и агрегаты. Адреса получателей, вложения, токены и тексты писем скрыты.
      </Typography>
    </Box>
  );
}
