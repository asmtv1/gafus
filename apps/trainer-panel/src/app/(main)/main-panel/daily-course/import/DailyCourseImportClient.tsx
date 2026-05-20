"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Paper,
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
import type { DailyCourseImportPreviewDayDto } from "@gafus/core/services/dailyCourse";
import {
  confirmDailyCourseImportAction,
  previewDailyCourseImportAction,
} from "@/features/daily-course/lib/actions";

export default function DailyCourseImportClient() {
  const [content, setContent] = useState("");
  const [replaceConflicts, setReplaceConflicts] = useState(false);
  const [previewState, previewAction, isPreviewPending] = useActionState(
    previewDailyCourseImportAction,
    {},
  );
  const [confirmState, confirmAction, isConfirmPending] = useActionState(
    confirmDailyCourseImportAction,
    {},
  );

  const preview = previewState.preview;
  const hasConflicts = (preview?.summary.conflictDays ?? 0) > 0;
  const daysWithReplace = useMemo(
    () => preview?.days.filter((day) => canImportAfterReplace(day, replaceConflicts)).length ?? 0,
    [preview, replaceConflicts],
  );

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setContent(await file.text());
  };

  return (
    <PageLayout
      title="Импорт курса дня"
      subtitle="Загрузите один markdown или txt файл, проверьте предпросмотр и подтвердите публикацию расписания"
    >
      <Box sx={{ display: "grid", gap: 3 }}>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button component={Link} href="/main-panel/daily-course" variant="outlined">
            Вернуться к расписанию
          </Button>
          <Button component={Link} href="/main-panel/daily-course/bundles" variant="outlined">
            Связки
          </Button>
        </Box>

        <Box component="form" action={previewAction} sx={{ display: "grid", gap: 2 }}>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            <Button component="label" variant="contained">
              Выбрать .md/.txt
              <input
                hidden
                name="file"
                type="file"
                accept=".md,.txt,text/markdown,text/plain"
                onChange={handleFileChange}
              />
            </Button>
            <Button
              type="submit"
              variant="outlined"
              disabled={isPreviewPending || content.trim().length === 0}
            >
              Показать предпросмотр
            </Button>
          </Box>

          <TextField
            name="content"
            label="Содержимое файла"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            multiline
            minRows={10}
            helperText="Можно выбрать файл или вставить текст вручную."
          />
        </Box>

        {previewState.error && <Alert severity="error">{previewState.error}</Alert>}
        {confirmState.error && <Alert severity="error">{confirmState.error}</Alert>}

        {confirmState.success && confirmState.result && (
          <Alert severity="success">
            Импортировано дат: {confirmState.result.importedDates.length}
            {confirmState.result.skippedDates.length > 0
              ? `. Пропущено: ${confirmState.result.skippedDates.length}.`
              : "."}
          </Alert>
        )}

        {preview && (
          <Box sx={{ display: "grid", gap: 2 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography fontWeight={700} sx={{ mb: 1 }}>
                Предпросмотр
              </Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Chip label={`Дней: ${preview.summary.totalDays}`} />
                <Chip label={`Пустых: ${preview.summary.emptyDays}`} />
                <Chip color="success" label={`Готовы: ${preview.summary.importableDays}`} />
                <Chip color="warning" label={`Конфликты: ${preview.summary.conflictDays}`} />
                <Chip color="error" label={`С ошибками: ${preview.summary.errorDays}`} />
              </Box>
            </Paper>

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Дата</TableCell>
                    <TableCell>Статус</TableCell>
                    <TableCell>Связка</TableCell>
                    <TableCell>Шаги</TableCell>
                    <TableCell>Ошибки</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.days.map((day) => (
                    <TableRow key={day.date}>
                      <TableCell>{day.date}</TableCell>
                      <TableCell>
                        <DayStatusChip day={day} replaceConflicts={replaceConflicts} />
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight={700}>{day.bundleTitle || "—"}</Typography>
                        {day.description && (
                          <Typography variant="body2" color="text.secondary">
                            {day.description}
                          </Typography>
                        )}
                        {day.conflict && (
                          <Typography variant="body2" color="warning.main">
                            Уже стоит: {day.conflict.bundleTitle}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                          {day.steps.map((step) => (
                            <Chip
                              key={`${day.date}-${step.order}`}
                              size="small"
                              color={step.errors.length > 0 ? "error" : "default"}
                              label={`${step.order}. ${step.title || "Без названия"} · ${step.type}`}
                            />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <ErrorList day={day} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Box
              component="form"
              action={confirmAction}
              sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}
            >
              <input type="hidden" name="content" value={content} />
              <input
                type="hidden"
                name="replaceConflicts"
                value={hasConflicts && replaceConflicts ? "true" : "false"}
              />
              {hasConflicts && (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={replaceConflicts}
                      onChange={(event) => setReplaceConflicts(event.target.checked)}
                    />
                  }
                  label="Заменить уже выставленные будущие даты"
                />
              )}
              <Button
                type="submit"
                variant="contained"
                disabled={isConfirmPending || daysWithReplace === 0}
              >
                Подтвердить импорт ({daysWithReplace})
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </PageLayout>
  );
}

function DayStatusChip({
  day,
  replaceConflicts,
}: {
  day: DailyCourseImportPreviewDayDto;
  replaceConflicts: boolean;
}) {
  const hasErrors = hasDayErrors(day);
  if (day.isEmpty) return <Chip size="small" label="Пусто" variant="outlined" />;
  if (hasErrors) return <Chip size="small" color="error" label="Ошибка" />;
  if (day.isPast) return <Chip size="small" color="error" label="Прошедшая дата" />;
  if (day.conflict && replaceConflicts && day.canReplaceConflict) {
    return <Chip size="small" color="warning" label="Будет заменено" />;
  }
  if (day.conflict) return <Chip size="small" color="warning" label="Конфликт" />;
  return <Chip size="small" color="success" label="Готово" />;
}

function ErrorList({ day }: { day: DailyCourseImportPreviewDayDto }) {
  const errors = [
    ...day.errors,
    ...day.steps.flatMap((step) => step.errors.map((error) => `Шаг ${step.order}: ${error}`)),
  ];
  if (errors.length === 0) return <Typography variant="body2">—</Typography>;
  return (
    <Box component="ul" sx={{ m: 0, pl: 2 }}>
      {errors.map((error) => (
        <Typography component="li" variant="body2" color="error" key={error}>
          {error}
        </Typography>
      ))}
    </Box>
  );
}

function hasDayErrors(day: DailyCourseImportPreviewDayDto): boolean {
  return day.errors.length > 0 || day.steps.some((step) => step.errors.length > 0);
}

function canImportAfterReplace(
  day: DailyCourseImportPreviewDayDto,
  replaceConflicts: boolean,
): boolean {
  if (day.canImport) return true;
  return Boolean(
    replaceConflicts &&
      day.conflict &&
      day.canReplaceConflict &&
      !hasDayErrors(day) &&
      !day.isEmpty,
  );
}
