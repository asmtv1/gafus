"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, useActionState } from "react";

import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@/utils/muiImports";
import PageLayout from "@/shared/components/PageLayout";
import type {
  DailyCourseCleanupMode,
  DailyCourseCandidateDto,
  DailyCourseScheduleDto,
} from "@gafus/core/services/dailyCourse";
import {
  confirmDailyCourseCleanupAction,
  deleteDailyCourseScheduleAction,
  previewDailyCourseCleanupAction,
  upsertDailyCourseScheduleAction,
} from "@/features/daily-course/lib/actions";

interface DailyCourseClientProps {
  from: string;
  to: string;
  today: string;
  schedule: DailyCourseScheduleDto[];
  candidates: DailyCourseCandidateDto[];
}

export default function DailyCourseClient({
  from,
  to,
  today,
  schedule,
  candidates,
}: DailyCourseClientProps) {
  const [state, formAction] = useActionState(upsertDailyCourseScheduleAction, {});
  const [cleanupPreviewState, cleanupPreviewAction, isCleanupPreviewPending] = useActionState(
    previewDailyCourseCleanupAction,
    {},
  );
  const [cleanupConfirmState, cleanupConfirmAction, isCleanupConfirmPending] = useActionState(
    confirmDailyCourseCleanupAction,
    {},
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [cleanupMode, setCleanupMode] = useState<DailyCourseCleanupMode>("future");
  const [cleanupConfirmation, setCleanupConfirmation] = useState("");
  const [isPending, startTransition] = useTransition();

  const scheduleByDate = useMemo(
    () => new Map(schedule.map((item) => [item.date, item])),
    [schedule],
  );
  const dates = useMemo(() => enumerateDates(from, to), [from, to]);

  const handleDelete = (scheduleId: string) => {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteDailyCourseScheduleAction(scheduleId);
      if (!result.success) {
        setDeleteError(result.error ?? "Не удалось удалить курс дня");
      }
    });
  };

  return (
    <PageLayout
      title="Курс дня"
      subtitle="Планирование ежедневных связок, которые меняются в полночь по МСК"
    >
      <Box sx={{ display: "grid", gap: 3 }}>
        <Box
          component="form"
          sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}
        >
          <TextField name="from" label="С" type="date" defaultValue={from} size="small" />
          <TextField name="to" label="По" type="date" defaultValue={to} size="small" />
          <Button type="submit" variant="outlined">
            Показать
          </Button>
          <Button component={Link} href="/main-panel/daily-course/bundles" variant="contained">
            Связки для курса дня
          </Button>
          <Button component={Link} href="/main-panel/daily-course/import" variant="outlined">
            Импорт из файла
          </Button>
        </Box>

        {state.error && <Alert severity="error">{state.error}</Alert>}
        {state.success && <Alert severity="success">Расписание сохранено</Alert>}
        {deleteError && <Alert severity="error">{deleteError}</Alert>}
        {cleanupPreviewState.error && <Alert severity="error">{cleanupPreviewState.error}</Alert>}
        {cleanupConfirmState.error && <Alert severity="error">{cleanupConfirmState.error}</Alert>}
        {cleanupConfirmState.success && cleanupConfirmState.result && (
          <Alert severity="success">
            Очистка выполнена. Удалено расписаний: {cleanupConfirmState.result.deleted.schedules},
            связок: {cleanupConfirmState.result.deleted.bundles}, шагов:{" "}
            {cleanupConfirmState.result.deleted.steps}.
          </Alert>
        )}
        {candidates.length === 0 && (
          <Alert severity="warning">
            Нет подходящих связок. Создайте отдельную связку курса дня из 2-5 безопасных шагов без
            дневника, экзаменов и отчётов.
          </Alert>
        )}

        <Paper variant="outlined" sx={{ p: 2, display: "grid", gap: 2 }}>
          <Box>
            <Typography fontWeight={700}>Очистка курса дня</Typography>
            <Typography variant="body2" color="text.secondary">
              Удаляет только расписание, связки и шаги с отметкой «для курса дня». Обычные курсы,
              дни и шаги не затрагиваются.
            </Typography>
          </Box>

          <Box
            component="form"
            action={cleanupPreviewAction}
            sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}
          >
            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel id="daily-course-cleanup-mode">Режим</InputLabel>
              <Select
                labelId="daily-course-cleanup-mode"
                label="Режим"
                name="mode"
                value={cleanupMode}
                onChange={(event) => {
                  setCleanupMode(event.target.value as DailyCourseCleanupMode);
                  setCleanupConfirmation("");
                }}
              >
                <MenuItem value="future">Очистить будущий курс дня</MenuItem>
                <MenuItem value="all">Полная очистка курса дня</MenuItem>
              </Select>
            </FormControl>
            <Button type="submit" variant="outlined" disabled={isCleanupPreviewPending}>
              Предпросмотр очистки
            </Button>
          </Box>

          {cleanupPreviewState.preview && (
            <Box sx={{ display: "grid", gap: 2 }}>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Chip label={`Расписаний: ${cleanupPreviewState.preview.schedulesToDelete}`} />
                <Chip label={`Связок: ${cleanupPreviewState.preview.bundlesToDelete}`} />
                <Chip
                  color="warning"
                  label={`Шагов: ${cleanupPreviewState.preview.stepsToDelete}`}
                />
                <Chip label={`Прогресс: ${cleanupPreviewState.preview.userTrainingsToDelete}`} />
                <Chip label={`Шаги прогресса: ${cleanupPreviewState.preview.userStepsToDelete}`} />
              </Box>
              {cleanupPreviewState.preview.skippedSteps.length > 0 && (
                <Alert severity="warning">
                  Пропущено daily-course шагов со связями с обычными курсами:{" "}
                  {cleanupPreviewState.preview.skippedSteps.length}. Эти шаги не будут удалены.
                </Alert>
              )}
              <Box
                component="form"
                action={cleanupConfirmAction}
                sx={{ display: "grid", gap: 1, maxWidth: 520 }}
              >
                <input type="hidden" name="mode" value={cleanupPreviewState.preview.mode} />
                <TextField
                  name="confirmation"
                  label='Введите "ОЧИСТИТЬ КУРС ДНЯ"'
                  value={cleanupConfirmation}
                  onChange={(event) => setCleanupConfirmation(event.target.value)}
                  size="small"
                />
                <Button
                  type="submit"
                  color="error"
                  variant="contained"
                  disabled={
                    isCleanupConfirmPending ||
                    cleanupMode !== cleanupPreviewState.preview.mode ||
                    cleanupConfirmation !== "ОЧИСТИТЬ КУРС ДНЯ" ||
                    (cleanupPreviewState.preview.schedulesToDelete === 0 &&
                      cleanupPreviewState.preview.bundlesToDelete === 0 &&
                      cleanupPreviewState.preview.stepsToDelete === 0)
                  }
                >
                  Очистить курс дня
                </Button>
              </Box>
            </Box>
          )}
        </Paper>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Дата</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Связка</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dates.map((date) => {
                const item = scheduleByDate.get(date);
                const selectedBundleId = item?.bundle.id ?? "";
                const isPast = date < today;
                return (
                  <TableRow key={date}>
                    <TableCell>
                      <Typography fontWeight={date === today ? 700 : 500}>{date}</Typography>
                      {date === today && <Chip size="small" label="Сегодня МСК" color="primary" />}
                    </TableCell>
                    <TableCell>
                      {item ? (
                        <Chip
                          size="small"
                          label={item.isPublished ? "Опубликовано" : "Черновик"}
                          color={item.isPublished ? "success" : "default"}
                        />
                      ) : (
                        <Chip size="small" label="Пусто" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Box
                        component="form"
                        action={formAction}
                        sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}
                      >
                        <input type="hidden" name="date" value={date} />
                        <FormControl size="small" sx={{ minWidth: 260 }}>
                          <InputLabel id={`daily-course-bundle-${date}`}>Связка</InputLabel>
                          <Select
                            labelId={`daily-course-bundle-${date}`}
                            label="Связка"
                            name="bundleId"
                            defaultValue={selectedBundleId}
                            disabled={isPast || candidates.length === 0}
                          >
                            {candidates.map((candidate) => (
                              <MenuItem key={candidate.id} value={candidate.id}>
                                {candidate.title} · {candidate.stepsCount} шаг.
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <input type="hidden" name="isPublished" value="true" />
                        <Button
                          type="submit"
                          variant="contained"
                          disabled={isPast || candidates.length === 0}
                        >
                          Сохранить
                        </Button>
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      {item && (
                        <Button
                          color="error"
                          variant="outlined"
                          disabled={isPending || date <= today}
                          onClick={() => handleDelete(item.id)}
                        >
                          Удалить
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </PageLayout>
  );
}

function enumerateDates(from: string, to: string): string[] {
  const result: string[] = [];
  const current = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (current <= end) {
    result.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return result;
}
