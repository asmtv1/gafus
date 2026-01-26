"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  Box,
  Button,
  TextField,
  Checkbox,
  FormControlLabel,
  Alert,
  Typography,
  Autocomplete,
  Chip,
  IconButton,
  Paper,
} from "@/utils/muiImports";
import { Add, Delete, DragIndicator } from "@mui/icons-material";
import type { ActionResult } from "@gafus/types";
import StudentSelector from "./StudentSelector";
import { getStudentsByIds } from "@shared/lib/utils/getStudentsByIds";
import type { TrainerNoteEntry } from "../types";

interface NoteFormData {
  title?: string;
  tags: string[];
}

interface NoteFormProps {
  mode?: "create" | "edit";
  initialData?: {
    id?: string;
    studentIds?: string[];
    title?: string | null;
    entries?: TrainerNoteEntry[];
    tags?: string[];
    isVisibleToStudent?: boolean;
  };
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onCancel: () => void;
  onSuccess?: () => void; // Callback для успешного сохранения
}

export default function NoteForm({
  mode = "create",
  initialData,
  onSubmit,
  onCancel,
  onSuccess,
}: NoteFormProps) {
  const [formState, setFormState] = useState<ActionResult>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<{ id: string; username: string }[]>([]);
  const [entries, setEntries] = useState<{ id?: string; content: string; order: number; isVisibleToStudent: boolean }[]>(
    initialData?.entries?.map((e) => ({ 
      id: e.id, 
      content: e.content, 
      order: e.order,
      isVisibleToStudent: e.isVisibleToStudent ?? false,
    })) || [
      { content: "", order: 0, isVisibleToStudent: false },
    ]
  );

  const form = useForm<NoteFormData>({
    mode: "onBlur",
    defaultValues: {
      title: initialData?.title || "",
      tags: initialData?.tags || [],
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        title: initialData.title || "",
        tags: initialData.tags || [],
      });
      // Загружаем выбранных учеников из initialData
      if (initialData.studentIds && initialData.studentIds.length > 0) {
        getStudentsByIds(initialData.studentIds).then((students) => {
          setSelectedStudents(students);
        });
      } else {
        setSelectedStudents([]);
      }
      // Загружаем entries из initialData
      if (initialData.entries && initialData.entries.length > 0) {
        setEntries(initialData.entries.map((e) => ({ 
          id: e.id, 
          content: e.content, 
          order: e.order,
          isVisibleToStudent: e.isVisibleToStudent ?? false,
        })));
      } else {
        setEntries([{ content: "", order: 0, isVisibleToStudent: false }]);
      }
    } else {
      setSelectedStudents([]);
      setEntries([{ content: "", order: 0, isVisibleToStudent: false }]);
    }
  }, [initialData, form]);

  const handleSubmit = async (data: NoteFormData) => {
    if (selectedStudents.length === 0 && mode === "create") {
      setFormState({ success: false, error: "Выберите хотя бы одного ученика" });
      return;
    }

    setIsSubmitting(true);
    setFormState({});

    const formData = new FormData();
    if (mode === "edit" && initialData?.id) {
      formData.append("id", initialData.id);
    }
    formData.append("studentIds", JSON.stringify(selectedStudents.map((s) => s.id)));
    if (data.title) {
      formData.append("title", data.title);
    }
    // Фильтруем пустые записи и обновляем порядок
    const validEntries = entries
      .map((entry, index) => ({ 
        content: entry.content.trim(), 
        order: index,
        isVisibleToStudent: entry.isVisibleToStudent ?? false,
      }))
      .filter((entry) => entry.content.length > 0);
    
    if (validEntries.length === 0) {
      setFormState({ success: false, error: "Добавьте хотя бы одну текстовую запись" });
      return;
    }
    
    formData.append("entries", JSON.stringify(validEntries));
    formData.append("tags", JSON.stringify(data.tags || []));

    try {
      const result = await onSubmit(formData);
      setFormState(result);
      if (result.success) {
        // Форма успешно отправлена, можно закрыть или сбросить
        form.reset();
        setSelectedStudents([]);
        // Вызываем callback для обновления списка заметок
        if (onSuccess) {
          onSuccess();
        }
        // Закрываем форму через небольшую задержку, чтобы пользователь увидел успех
        setTimeout(() => {
          onCancel();
        }, 500);
      }
    } catch (error) {
      setFormState({
        success: false,
        error: error instanceof Error ? error.message : "Неизвестная ошибка",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box component="form" onSubmit={form.handleSubmit(handleSubmit)} sx={{ mt: 2 }}>
      {formState.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {formState.error}
        </Alert>
      )}

      {formState.success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Заметка {mode === "create" ? "создана" : "обновлена"} успешно!
        </Alert>
      )}

      <Typography variant="h6" gutterBottom>
        {mode === "create" ? "Создать заметку" : "Редактировать заметку"}
      </Typography>

      <Box sx={{ mb: 2 }}>
        <StudentSelector
          selectedStudents={selectedStudents}
          onSelect={setSelectedStudents}
          disabled={false}
          error={selectedStudents.length === 0 && mode === "create"}
          helperText={
            selectedStudents.length === 0 && mode === "create"
              ? "Выберите хотя бы одного ученика"
              : undefined
          }
        />
      </Box>

      <TextField
        {...form.register("title", {
          maxLength: { value: 200, message: "Максимум 200 символов" },
        })}
        label="Заголовок (необязательно)"
        placeholder="Краткое описание заметки"
        fullWidth
        error={!!form.formState.errors.title}
        helperText={form.formState.errors.title?.message || `${form.watch("title")?.length || 0}/200`}
        sx={{ mb: 2 }}
      />

      <Box sx={{ mb: 2 }}>
        <Autocomplete
          multiple
          freeSolo
          options={[]}
          value={form.watch("tags") || []}
          onChange={(_event, newValue) => {
            form.setValue(
              "tags",
              newValue.map((tag) => (typeof tag === "string" ? tag.trim() : tag)).filter((tag) => tag.length > 0)
            );
          }}
          renderTags={(value, getTagProps) =>
            value.map((option, index) => (
              <Chip
                variant="outlined"
                label={option}
                size="small"
                {...getTagProps({ index })}
                key={index}
              />
            ))
          }
          renderInput={(params) => (
            <TextField
              {...params}
              label="Теги (необязательно)"
              placeholder="Введите тег и нажмите Enter"
              helperText="Нажмите Enter после ввода тега"
            />
          )}
        />
      </Box>

      {/* Текстовые записи */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          Текстовые записи
        </Typography>
        {entries.map((entry, index) => (
          <Paper key={index} sx={{ p: 2, mb: 2, position: "relative" }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
              <IconButton
                size="small"
                sx={{ mt: 1, cursor: "grab" }}
                disabled
                aria-label="Порядок"
              >
                <DragIndicator fontSize="small" />
              </IconButton>
              <Box sx={{ flex: 1 }}>
                <TextField
                  fullWidth
                  multiline
                  minRows={3}
                  maxRows={8}
                  value={entry.content}
                  onChange={(e) => {
                    const newEntries = [...entries];
                    newEntries[index].content = e.target.value;
                    setEntries(newEntries);
                  }}
                  placeholder={`Запись ${index + 1}`}
                  error={entry.content.trim().length === 0 && entries.length > 1}
                  helperText={
                    entry.content.trim().length === 0 && entries.length > 1
                      ? "Запись не может быть пустой"
                      : `${entry.content.length}/10000`
                  }
                  sx={{ mb: 1 }}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={entry.isVisibleToStudent}
                      onChange={(e) => {
                        const newEntries = [...entries];
                        newEntries[index].isVisibleToStudent = e.target.checked;
                        setEntries(newEntries);
                      }}
                    />
                  }
                  label="Видна ученику"
                />
              </Box>
              <IconButton
                size="small"
                color="error"
                onClick={() => {
                  if (entries.length > 1) {
                    setEntries(entries.filter((_, i) => i !== index));
                  }
                }}
                disabled={entries.length === 1}
                sx={{ mt: 1 }}
                aria-label="Удалить запись"
              >
                <Delete fontSize="small" />
              </IconButton>
            </Box>
          </Paper>
        ))}
        <Button
          type="button"
          variant="outlined"
          startIcon={<Add />}
          onClick={() => {
            setEntries([...entries, { content: "", order: entries.length, isVisibleToStudent: false }]);
          }}
          sx={{ mt: 1 }}
        >
          Добавить запись
        </Button>
      </Box>


      <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
        <Button type="button" onClick={onCancel} disabled={isSubmitting}>
          Отмена
        </Button>
        <Button type="submit" variant="contained" disabled={isSubmitting}>
          {isSubmitting ? "Сохранение..." : mode === "create" ? "Создать" : "Сохранить"}
        </Button>
      </Box>
    </Box>
  );
}
