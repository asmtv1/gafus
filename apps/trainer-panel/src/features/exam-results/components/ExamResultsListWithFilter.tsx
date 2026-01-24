"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  FormControlLabel,
  Switch,
  Typography,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@/utils/muiImports";
import { ExamResultsList } from "./ExamResultsList";
import type { ExamResultWithDetails } from "../lib/getExamResults";
import { useRouter, useSearchParams } from "next/navigation";

interface ExamResultsListWithFilterProps {
  initialExamResults: ExamResultWithDetails[];
  initialHideCompleted: boolean;
}

export function ExamResultsListWithFilter({
  initialExamResults,
  initialHideCompleted,
}: ExamResultsListWithFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [examResults, setExamResults] = useState(initialExamResults);
  const [hideCompleted, setHideCompleted] = useState(initialHideCompleted);
  const [sortBy, setSortBy] = useState<"date" | "course">("date");
  const [filterByType, setFilterByType] = useState<"all" | "test" | "written" | "video">("all");

  // Обновляем локальное состояние когда приходят новые данные с сервера
  useEffect(() => {
    setExamResults(initialExamResults);
  }, [initialExamResults]);

  // Синхронизация с localStorage при загрузке
  useEffect(() => {
    // Фильтр "Скрыть зачтённые" по умолчанию включён (true)
    const savedHideCompleted = localStorage.getItem("examResults_hideCompleted");
    const shouldHide = savedHideCompleted !== null ? savedHideCompleted === "true" : true;
    setHideCompleted(shouldHide);

    // Загружаем сортировку
    const savedSortBy = localStorage.getItem("examResults_sortBy") as "date" | "course" | null;
    if (savedSortBy) setSortBy(savedSortBy);

    // Загружаем фильтр по типу
    const savedFilterType = localStorage.getItem("examResults_filterType") as
      | "all"
      | "test"
      | "written"
      | "video"
      | null;
    if (savedFilterType) setFilterByType(savedFilterType);

    // Обновляем URL, если предпочтение отличается от начального значения
    if (shouldHide !== initialHideCompleted) {
      const params = new URLSearchParams(searchParams.toString());
      if (shouldHide) {
        params.set("hideCompleted", "true");
      } else {
        params.delete("hideCompleted");
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.checked;
    setHideCompleted(newValue);
    localStorage.setItem("examResults_hideCompleted", String(newValue));

    const params = new URLSearchParams(searchParams.toString());
    if (newValue) {
      params.set("hideCompleted", "true");
    } else {
      params.delete("hideCompleted");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleSortChange = (
    event:
      | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
      | { target: { value: unknown } },
  ) => {
    const newValue = (event.target as { value: string }).value as "date" | "course";
    setSortBy(newValue);
    localStorage.setItem("examResults_sortBy", newValue);
  };

  const handleFilterTypeChange = (
    event:
      | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
      | { target: { value: unknown } },
  ) => {
    const newValue = (event.target as { value: string }).value as
      | "all"
      | "test"
      | "written"
      | "video";
    setFilterByType(newValue);
    localStorage.setItem("examResults_filterType", newValue);
  };

  // Фильтруем и сортируем результаты на клиенте
  const filteredAndSortedResults = React.useMemo(() => {
    let results = [...examResults];

    // Фильтр по статусу
    if (hideCompleted) {
      results = results.filter((result) => result.userStep.status === "IN_PROGRESS");
    }

    // Фильтр по типу отчёта
    if (filterByType !== "all") {
      results = results.filter((result) => {
        if (filterByType === "test") return result.userStep.stepOnDay.step.hasTestQuestions;
        if (filterByType === "written")
          return result.userStep.stepOnDay.step.requiresWrittenFeedback;
        if (filterByType === "video") return result.userStep.stepOnDay.step.requiresVideoReport;
        return true;
      });
    }

    // Сортировка
    if (sortBy === "date") {
      results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === "course") {
      results.sort((a, b) =>
        a.userStep.userTraining.dayOnCourse.course.name.localeCompare(
          b.userStep.userTraining.dayOnCourse.course.name,
          "ru",
        ),
      );
    }

    return results;
  }, [examResults, hideCompleted, filterByType, sortBy]);

  // Подсчитываем статистику
  const totalResults = examResults.length;
  const pendingCount = examResults.filter((r) => r.userStep.status === "IN_PROGRESS").length;
  const completedCount = totalResults - pendingCount;

  return (
    <Box>
      {/* Панель фильтров и статистики */}
      <Box
        sx={{
          mb: 3,
          p: 2.5,
          backgroundColor: "background.paper",
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
          boxShadow: 1,
        }}
      >
        {/* Статистика */}
        <Box sx={{ mb: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Chip label={`Всего: ${totalResults}`} size="small" variant="outlined" />
          <Chip
            label={`Ожидают: ${pendingCount}`}
            size="small"
            color="warning"
            variant="outlined"
          />
          <Chip
            label={`Зачтены: ${completedCount}`}
            size="small"
            color="success"
            variant="outlined"
          />
          <Chip
            label={`Отображено: ${filteredAndSortedResults.length}`}
            size="small"
            color="primary"
            variant="filled"
          />
        </Box>

        {/* Фильтры и сортировка */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <FormControlLabel
            control={
              <Switch checked={hideCompleted} onChange={handleToggleChange} color="primary" />
            }
            label="Скрыть зачтённые"
            sx={{
              "& .MuiFormControlLabel-label": {
                color: "text.primary",
                fontWeight: 500,
              },
            }}
          />

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Тип отчёта</InputLabel>
            <Select value={filterByType} onChange={handleFilterTypeChange} label="Тип отчёта">
              <MenuItem value="all">Все типы</MenuItem>
              <MenuItem value="test">Тестовые вопросы</MenuItem>
              <MenuItem value="written">Письменная обратная связь</MenuItem>
              <MenuItem value="video">Видео отчёт</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Сортировка</InputLabel>
            <Select value={sortBy} onChange={handleSortChange} label="Сортировка">
              <MenuItem value="date">По дате (новые первые)</MenuItem>
              <MenuItem value="course">По курсу (А-Я)</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      {/* Список результатов */}
      {filteredAndSortedResults.length === 0 ? (
        <Box
          sx={{
            textAlign: "center",
            py: 8,
            color: "text.secondary",
          }}
        >
          <Typography variant="h6" gutterBottom>
            {hideCompleted ? "Нет экзаменов, ожидающих проверки" : "Результатов экзаменов пока нет"}
          </Typography>
          <Typography variant="body2">
            {hideCompleted
              ? "Все экзамены проверены! 🎉"
              : "Результаты появятся, когда студенты начнут сдавать экзамены."}
          </Typography>
          {filterByType !== "all" && (
            <Typography variant="caption" sx={{ mt: 1, display: "block" }}>
              Попробуйте изменить фильтр по типу отчёта
            </Typography>
          )}
        </Box>
      ) : (
        <ExamResultsList examResults={filteredAndSortedResults} />
      )}
    </Box>
  );
}
