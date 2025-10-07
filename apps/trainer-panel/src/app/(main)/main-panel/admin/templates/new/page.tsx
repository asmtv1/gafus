"use client";

import { useActionState } from "react";
import { Box, TextField, Button, MenuItem, Alert, Paper } from "@mui/material";
import { Save as SaveIcon } from "@mui/icons-material";
import FormPageLayout from "@shared/components/FormPageLayout";
import { createStepTemplate } from "@features/steps/lib/manageTemplates";

export default function NewTemplatePage() {
  const [state, formAction] = useActionState(createStepTemplate, { success: false, message: "" });

  return (
    <FormPageLayout
      title="Создание шаблона"
      subtitle="Создайте новый шаблон шага тренировки"
    >
      {state.message && (
        <Alert severity={state.success ? "success" : "error"} sx={{ mb: 3 }}>
          {state.message}
        </Alert>
      )}

      <Paper sx={{ p: 3 }}>
        <form action={formAction}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <TextField
              name="title"
              label="Название шаблона"
              required
              fullWidth
              helperText="Краткое и понятное название"
            />

            <TextField
              name="description"
              label="Описание"
              required
              multiline
              rows={8}
              fullWidth
              helperText="Подробное описание методики (поддерживается Markdown)"
            />

            <TextField
              name="type"
              label="Тип шага"
              select
              required
              defaultValue="TRAINING"
              fullWidth
            >
              <MenuItem value="TRAINING">Тренировочный</MenuItem>
              <MenuItem value="EXAMINATION">Экзаменационный</MenuItem>
            </TextField>

            <TextField
              name="durationSec"
              label="Длительность (в секундах)"
              type="number"
              fullWidth
              helperText="Необязательно для экзаменационных шагов"
            />

            <TextField
              name="videoUrl"
              label="Ссылка на видео"
              fullWidth
              helperText="YouTube, Rutube или Vimeo"
            />

            <TextField
              name="tags"
              label="Теги"
              fullWidth
              helperText="Через запятую: базовые команды, щенки, социализация"
            />

            <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
              <Button variant="outlined" href="/main-panel/admin/templates">
                Отмена
              </Button>
              <Button
                type="submit"
                variant="contained"
                startIcon={<SaveIcon />}
              >
                Создать шаблон
              </Button>
            </Box>
          </Box>
        </form>
      </Paper>
    </FormPageLayout>
  );
}

