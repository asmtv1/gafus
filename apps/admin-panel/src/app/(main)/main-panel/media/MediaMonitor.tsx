"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Alert, Box, Chip, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from "@mui/material";

type Data = Awaited<ReturnType<
  typeof import("@gafus/core/services/systemHealth").getAdminMediaDashboard
>>;
const title: Record<string, string> = {
  gallery: "Фотоальбомы",
  "feed-photo": "Моменты · фото",
  "feed-video": "Моменты · видео",
  questions: "Вопросы · фото",
};
const time = (ms: number | null) => {
  if (ms === null) return "—";
  return ms >= 60_000 ? (ms / 60_000).toFixed(1) + " мин"
    : (ms / 1000).toFixed(1) + " с";
};
const stamp = (value: string) => new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/Moscow",
}).format(new Date(value));

export default function MediaMonitor({ data }: { data: Data }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [router]);

  const pending = data.rows.reduce((n, row) => n + row.pending, 0);
  const stuck = data.rows.reduce((n, row) => n + row.stuck, 0);
  const errors = data.rows.reduce((n, row) => n +
    (row.errors?.["499"] ?? 0) + (row.errors?.["429"] ?? 0) +
    (row.errors?.["5xx"] ?? 0) + (row.errors?.timeout ?? 0), 0);
  const retries = data.rows.reduce((n, row) => n + row.retries24h, 0);
  const idle = data.rows.reduce((n, row) => n + (row.emptyRuns24h ?? 0), 0);
  const tiles = [
    ["В очередях", pending],
    ["Зависшие", stuck],
    ["Ошибки Cloud.ru · 24 ч", errors],
    ["С повторной обработкой · 24 ч", retries],
    ["Пустые выборки · 24 ч", data.telemetryAvailable ? String(idle) : "—"],
  ] as const;

  return <Box sx={{ maxWidth: 1340, mx: "auto", p: { xs: 2, sm: 3 } }}>
    <Typography variant="h4" component="h1" fontWeight={700}>Обработка медиа</Typography>
    <Typography color="text.secondary" sx={{ my: 1, mb: 3 }}>
      Cloud.ru Jobs · каждые 30 секунд · обновлено {stamp(data.updatedAt)} МСК
    </Typography>

    {data.attention.length > 0
      ? <Alert severity="error" sx={{ mb: 2 }}>
        Обработка требует внимания: {data.attention.map(kind => title[kind]).join(", ")}.
        Проверьте зависшие задачи и ошибки запуска.
      </Alert>
      : <Alert severity="success" sx={{ mb: 2 }}>
        Критических признаков остановки обработки в отслеживаемых очередях нет.
      </Alert>}
    {data.workerMonitorState !== "alive" && <Alert severity="warning" sx={{ mb: 2 }}>
      {data.workerMonitorState === "stale"
        ? "Монитор обработки не присылал сигнал более 12 минут. Проверьте gafus-worker."
        : "Монитор обработки ещё не прислал сигнал. Это не подтверждение исправной работы Worker."}
    </Alert>}
    {!data.telemetryAvailable && <Alert severity="warning" sx={{ mb: 2 }}>
      Redis-телеметрия Cloud.ru недоступна. Число ошибок и пустых выборок неизвестно, а не равно нулю.
    </Alert>}

    <Box sx={{ display: "grid",
      gridTemplateColumns: { xs: "repeat(2, minmax(0,1fr))",
        md: "repeat(5, minmax(0,1fr))" },
      gap: 1.5, mb: 3 }}>
      {tiles.map(([name, value]) => <Paper key={name} variant="outlined"
        sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="caption" color="text.secondary">{name}</Typography>
        <Typography variant="h4" fontWeight={700}>{value}</Typography>
      </Paper>)}
    </Box>

    <Stack spacing={2}>
      {data.rows.map(row => {
        const need = data.attention.includes(row.kind);
        return <Paper key={row.kind} variant="outlined"
          sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between"
            flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
            <Typography variant="h6" fontWeight={700}>{title[row.kind]}</Typography>
            <Chip size="small" color={need ? "error" : "success"}
              label={need ? "Нужна проверка" : "В норме"} />
          </Stack>
          <TableContainer>
            <Table size="small" aria-label={title[row.kind]}>
              <TableHead><TableRow>
                <TableCell>Ожидают</TableCell><TableCell>Обрабатываются</TableCell>
                <TableCell>Зависшие</TableCell><TableCell>Ошибки в БД</TableCell>
                <TableCell>Повторы · 24 ч</TableCell><TableCell>Завершено · 24 ч*</TableCell>
                <TableCell>Среднее*</TableCell><TableCell>Максимум*</TableCell>
              </TableRow></TableHead>
              <TableBody><TableRow>
                <TableCell>{row.pending}</TableCell>
                <TableCell>{row.kind === "questions" ? "—" : row.processing}</TableCell>
                <TableCell>{row.kind === "questions" ? "—" : row.stuck}</TableCell>
                <TableCell>{row.kind === "questions" ? "—" : row.failed}</TableCell>
                <TableCell>{row.kind === "questions" ? "—" : row.retries24h}</TableCell>
                <TableCell>{row.kind === "questions" ? "—" : row.completed24h}</TableCell>
                <TableCell>{time(row.averageEndToEndMs)}</TableCell>
                <TableCell>{time(row.maxEndToEndMs)}</TableCell>
              </TableRow></TableBody>
            </Table>
          </TableContainer>
          <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
            Cloud.ru API · запуски за 24 часа
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            <Chip size="small" variant="outlined"
              label={`Запущено: ${row.launches24h ?? "—"}`} />
            <Chip size="small" variant="outlined"
              label={`Время ответа API: ${time(row.launchAverageMs)}`} />
            <Chip size="small" color={row.errors?.["499"] ? "error" : "default"}
              label={`499: ${row.errors?.["499"] ?? "—"}`} />
            <Chip size="small" label={`429: ${row.errors?.["429"] ?? "—"}`} />
            <Chip size="small" label={`5xx: ${row.errors?.["5xx"] ?? "—"}`} />
            <Chip size="small" label={`Таймауты: ${row.errors?.timeout ?? "—"}`} />
            <Chip size="small" label={`Пустые выборки: ${row.emptyRuns24h ?? "—"}`} />
          </Stack>
          {row.oldestPendingMinutes !== null && <Typography variant="caption"
            color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Самое старое ожидание: {row.oldestPendingMinutes} мин
          </Typography>}
        </Paper>;
      })}
    </Stack>
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 3 }}>
      * Среднее и максимум — время от создания задания до завершения, включая ожидание,
      повторы и обработку. По последним 250 завершённым заданиям за 24 часа.
      У Questions очередь включает ожидающие подтверждения записи; история времени
      обработки пока не сохраняется. «Пустые выборки» — ответы обработчиков
      без полученных заданий, а не подтверждённые нулевые расходы Cloud.ru.
      Если сбор телеметрии ещё не начался, нули отражают только период после её включения.
    </Typography>
  </Box>;
}
