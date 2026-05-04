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
  Select,
  Switch,
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
  DailyCourseCandidateDto,
  DailyCourseScheduleDto,
} from "@gafus/core/services/dailyCourse";
import {
  deleteDailyCourseScheduleAction,
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
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
        </Box>

        {state.error && <Alert severity="error">{state.error}</Alert>}
        {state.success && <Alert severity="success">Расписание сохранено</Alert>}
        {deleteError && <Alert severity="error">{deleteError}</Alert>}
        {candidates.length === 0 && (
          <Alert severity="warning">
            Нет подходящих связок. Создайте отдельную связку курса дня из 2-5 безопасных
            шагов без дневника, экзаменов и отчётов.
          </Alert>
        )}

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Дата</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Связка</TableCell>
                <TableCell>Публикация</TableCell>
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
                    <TableCell>
                      <Switch checked={item?.isPublished ?? true} disabled />
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
