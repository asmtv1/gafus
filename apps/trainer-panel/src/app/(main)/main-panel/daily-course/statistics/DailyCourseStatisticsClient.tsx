"use client";

import { useRouter } from "next/navigation";

import type {
  DailyCourseScheduleDto,
  DailyCourseScheduleStatisticsDto,
} from "@gafus/core/services/dailyCourse";
import PageLayout from "@/shared/components/PageLayout";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  ExpandMoreIcon,
} from "@/utils/muiImports";

interface DailyCourseStatisticsClientProps {
  from: string;
  to: string;
  schedule: DailyCourseScheduleDto[];
  selectedScheduleId: string | null;
  statistics: DailyCourseScheduleStatisticsDto | null;
}

export default function DailyCourseStatisticsClient({
  from,
  to,
  schedule,
  selectedScheduleId,
  statistics,
}: DailyCourseStatisticsClientProps) {
  const router = useRouter();

  const handleScheduleChange = (scheduleId: string) => {
    const params = new URLSearchParams({ from, to, scheduleId });
    router.push(`/main-panel/daily-course/statistics?${params.toString()}`);
  };

  return (
    <PageLayout
      title="Статистика курса дня"
      subtitle="Детальная статистика по пользователям, которые открывали выбранный день"
    >
      <Box sx={{ display: "grid", gap: 3 }}>
        <Box
          component="form"
          sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}
        >
          <TextField name="from" label="С" type="date" defaultValue={from} size="small" />
          <TextField name="to" label="По" type="date" defaultValue={to} size="small" />
          {selectedScheduleId && <input type="hidden" name="scheduleId" value={selectedScheduleId} />}
          <Button type="submit" variant="outlined">
            Показать
          </Button>
        </Box>

        {schedule.length === 0 && (
          <Alert severity="info">В выбранном диапазоне нет запланированных дней курса дня.</Alert>
        )}

        {schedule.length > 0 && (
          <FormControl size="small" sx={{ maxWidth: 520 }}>
            <InputLabel id="daily-course-statistics-schedule">День курса дня</InputLabel>
            <Select
              labelId="daily-course-statistics-schedule"
              label="День курса дня"
              value={selectedScheduleId ?? ""}
              onChange={(event) => handleScheduleChange(event.target.value)}
            >
              {schedule.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.date} · {item.bundle.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {statistics && <StatisticsContent statistics={statistics} />}
      </Box>
    </PageLayout>
  );
}

function StatisticsContent({ statistics }: { statistics: DailyCourseScheduleStatisticsDto }) {
  return (
    <Box sx={{ display: "grid", gap: 3 }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 2,
        }}
      >
        <SummaryCard label="Открыли день" value={statistics.summary.openedUsers} />
        <SummaryCard label="Начали шаги" value={statistics.summary.startedUsers} />
        <SummaryCard label="Завершили день" value={statistics.summary.completedUsers} />
        <SummaryCard
          label="Открыли без старта"
          value={statistics.summary.openedWithoutStartUsers}
        />
      </Box>

      {statistics.users.length === 0 ? (
        <Alert severity="info">Этот день курса дня ещё никто не открывал.</Alert>
      ) : (
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 980 }}>
            <TableHead>
              <TableRow>
                <TableCell>Пользователь</TableCell>
                <TableCell>Открыл</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Прогресс</TableCell>
                <TableCell>Текущий шаг</TableCell>
                <TableCell>Последняя активность</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {statistics.users.map((user) => (
                <TableRow key={user.userId}>
                  <TableCell colSpan={6} sx={{ p: 0, borderBottom: 0 }}>
                    <Accordion disableGutters>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "1.2fr 1fr 0.8fr 0.8fr 1.2fr 1fr",
                            gap: 2,
                            width: "100%",
                            minWidth: 940,
                            alignItems: "center",
                          }}
                        >
                          <Typography fontWeight={600}>{user.username}</Typography>
                          <Typography variant="body2">{formatDateTime(user.openedAt)}</Typography>
                          <StatusChip status={user.status} />
                          <Typography variant="body2">
                            {user.completedSteps}/{user.totalSteps}
                          </Typography>
                          <Typography variant="body2">{user.currentStepTitle ?? "Нет"}</Typography>
                          <Typography variant="body2">
                            {formatDateTime(user.lastActivityAt)}
                          </Typography>
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Шаг</TableCell>
                              <TableCell>Статус</TableCell>
                              <TableCell>Создан</TableCell>
                              <TableCell>Обновлён</TableCell>
                              <TableCell>Таймер</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {user.steps.map((step) => (
                              <TableRow key={step.bundleStepId}>
                                <TableCell>
                                  {step.order + 1}. {step.title}
                                </TableCell>
                                <TableCell>
                                  <StatusChip status={step.status} />
                                </TableCell>
                                <TableCell>{formatNullableDateTime(step.createdAt)}</TableCell>
                                <TableCell>{formatNullableDateTime(step.updatedAt)}</TableCell>
                                <TableCell>
                                  {step.paused
                                    ? `Пауза, осталось ${step.remainingSec ?? 0} сек.`
                                    : "Нет паузы"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </AccordionDetails>
                    </Accordion>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h4" fontWeight={700}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

function StatusChip({ status }: { status: string }) {
  const labelByStatus: Record<string, string> = {
    NOT_STARTED: "Не начато",
    IN_PROGRESS: "В процессе",
    COMPLETED: "Завершено",
    RESET: "Сброшено",
  };
  const colorByStatus: Record<string, "default" | "primary" | "success" | "warning"> = {
    NOT_STARTED: "default",
    IN_PROGRESS: "primary",
    COMPLETED: "success",
    RESET: "warning",
  };

  return (
    <Chip
      size="small"
      label={labelByStatus[status] ?? status}
      color={colorByStatus[status] ?? "default"}
      variant={status === "NOT_STARTED" ? "outlined" : "filled"}
    />
  );
}

function formatNullableDateTime(value: Date | string | null) {
  return value ? formatDateTime(value) : "Нет";
}

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
