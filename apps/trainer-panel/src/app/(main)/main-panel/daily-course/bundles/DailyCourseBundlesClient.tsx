"use client";

import Link from "next/link";
import { useState, useTransition, useActionState } from "react";

import {
  Alert,
  Box,
  Button,
  Chip,
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
import DualListSelector from "@/shared/components/common/DualListSelector";
import type {
  DailyCourseBundleDto,
  DailyCourseStepCandidateDto,
} from "@gafus/core/services/dailyCourse";
import {
  deleteDailyCourseBundleAction,
  upsertDailyCourseBundleAction,
} from "@/features/daily-course/lib/actions";

interface DailyCourseBundlesClientProps {
  bundles: DailyCourseBundleDto[];
  steps: DailyCourseStepCandidateDto[];
  today: string;
}

export default function DailyCourseBundlesClient({
  bundles,
  steps,
  today,
}: DailyCourseBundlesClientProps) {
  const [state, formAction] = useActionState(upsertDailyCourseBundleAction, {});
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editing, setEditing] = useState<DailyCourseBundleDto | null>(null);
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const beginEdit = (bundle: DailyCourseBundleDto) => {
    setEditing(bundle);
    setSelectedStepIds(bundle.steps.map((step) => step.id));
  };

  const resetForm = () => {
    setEditing(null);
    setSelectedStepIds([]);
  };

  const handleDelete = (bundleId: string) => {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteDailyCourseBundleAction(bundleId);
      if (!result.success) {
        setDeleteError(result.error ?? "Не удалось удалить связку");
      }
    });
  };

  return (
    <PageLayout
      title="Связки для курса дня"
      subtitle={`Отдельные связки из 2-5 шагов. В обычных днях курсов они не отображаются. Сегодня по МСК: ${today}`}
    >
      <Box sx={{ display: "grid", gap: 3 }}>
        <Box>
          <Button component={Link} href="/main-panel/daily-course" variant="outlined">
            Вернуться к расписанию
          </Button>
        </Box>

        {state.error && <Alert severity="error">{state.error}</Alert>}
        {state.success && <Alert severity="success">Связка сохранена</Alert>}
        {deleteError && <Alert severity="error">{deleteError}</Alert>}
        {steps.length === 0 && (
          <Alert severity="warning">
            Нет доступных шагов. Создайте шаги типа тренировка, практика, теория, экзамен или
            перерыв с отметкой «Для курса дня».
          </Alert>
        )}

        <Box
          component="form"
          action={formAction}
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            p: 2,
            border: "1px solid #ddd",
            borderRadius: 2,
          }}
        >
          <input type="hidden" name="id" value={editing?.id ?? ""} />
          <TextField
            name="title"
            label="Название связки"
            defaultValue={editing?.title ?? ""}
            required
          />
          <TextField name="equipment" label="Инвентарь" defaultValue={editing?.equipment ?? ""} />
          <TextField
            name="description"
            label="Описание"
            defaultValue={editing?.description ?? ""}
            multiline
            minRows={3}
            sx={{ gridColumn: { xs: "auto", md: "1 / -1" } }}
          />
          <input type="hidden" name="type" value={editing?.type ?? "daily_course"} />
          <Box sx={{ gridColumn: { xs: "auto", md: "1 / -1" } }}>
            <DualListSelector<DailyCourseStepCandidateDto>
              allItems={steps}
              selectedItems={selectedStepIds
                .map((stepId) => steps.find((step) => step.id === stepId))
                .filter((step): step is DailyCourseStepCandidateDto => Boolean(step))}
              onSelectionChange={(selected) => setSelectedStepIds(selected.map((step) => step.id))}
              getItemId={(step) => step.id}
              getItemLabel={(step) => step.title}
              getItemSearchText={(step) => step.title}
              getItemSecondaryText={(step) => `${step.type} · ${step.durationSec ?? 0} сек.`}
              title="Шаги связки"
              allowDuplicates
            />
          </Box>
          {selectedStepIds.map((stepId) => (
            <input key={stepId} type="hidden" name="stepIds" value={stepId} />
          ))}
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              type="submit"
              variant="contained"
              disabled={steps.length === 0 || selectedStepIds.length < 2}
            >
              {editing ? "Сохранить связку" : "Создать связку"}
            </Button>
            {editing && (
              <Button type="button" variant="outlined" onClick={resetForm}>
                Отменить
              </Button>
            )}
          </Box>
        </Box>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Связка</TableCell>
                <TableCell>Шаги</TableCell>
                <TableCell>Автор</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bundles.map((bundle) => (
                <TableRow key={bundle.id}>
                  <TableCell>
                    <Typography fontWeight={700}>{bundle.title}</Typography>
                    {bundle.description && (
                      <Typography variant="body2" color="text.secondary">
                        {bundle.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                      {bundle.steps.map((step) => (
                        <Chip
                          key={`${bundle.id}-${step.id}-${step.order}`}
                          size="small"
                          label={`${step.order}. ${step.title}`}
                        />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>{bundle.authorUsername}</TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                      <Button variant="outlined" onClick={() => beginEdit(bundle)}>
                        Изменить
                      </Button>
                      <Button
                        color="error"
                        variant="outlined"
                        disabled={isPending}
                        onClick={() => handleDelete(bundle.id)}
                      >
                        Удалить
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </PageLayout>
  );
}
