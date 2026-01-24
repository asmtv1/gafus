"use client";

import React, { useState, useTransition } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
  Box,
  Typography,
} from "@/utils/muiImports";
import { saveAIConfig } from "../lib/saveAIConfig";
import { getAIConfig } from "../lib/getAIConfig";

interface AIChatSettingsProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function AIChatSettings({ open, onClose, onSaved }: AIChatSettingsProps) {
  const [isPending, startTransition] = useTransition();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("meta-llama/llama-3.3-70b-instruct");
  const [enabled, setEnabled] = useState(true);
  const [validateKey, setValidateKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Загружаем текущую конфигурацию при открытии
  React.useEffect(() => {
    if (open) {
      setIsLoading(true);
      getAIConfig()
        .then((result) => {
          if (result.success && result.data) {
            setModel(result.data.model || "meta-llama/llama-3.3-70b-instruct");
            setEnabled(result.data.enabled);
            // API ключ не загружаем (безопасность)
            setApiKey("");
          }
        })
        .catch(() => {
          // Игнорируем ошибки загрузки конфигурации
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [open]);

  const handleSave = () => {
    setError(null);
    setSuccess(false);

    if (!apiKey.trim() && enabled) {
      setError("API ключ обязателен для включения чата");
      return;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();
        if (apiKey.trim()) {
          formData.append("apiKey", apiKey.trim());
        }
        formData.append("provider", "openrouter");
        formData.append("model", model);
        formData.append("enabled", enabled ? "true" : "false");
        formData.append("validateKey", validateKey ? "true" : "false");

        const result = await saveAIConfig({ success: false }, formData);

        if (result.success) {
          setSuccess(true);
          setTimeout(() => {
            onSaved?.();
            onClose();
            setApiKey("");
            setError(null);
            setSuccess(false);
          }, 1000);
        } else {
          setError(result.error || "Ошибка при сохранении настроек");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Неизвестная ошибка");
      }
    });
  };

  const handleClose = () => {
    if (!isPending) {
      setApiKey("");
      setError(null);
      setSuccess(false);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Настройки AI чата (OpenRouter)</DialogTitle>
      <DialogContent>
        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}>
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
            {success && <Alert severity="success">Настройки успешно сохранены!</Alert>}

            <TextField
              label="API ключ OpenRouter"
              type="password"
              fullWidth
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-..."
              helperText="Оставьте пустым, чтобы использовать общий ключ из env"
              disabled={isPending}
            />

            <FormControl fullWidth>
              <InputLabel>Модель</InputLabel>
              <Select
                value={model}
                label="Модель"
                onChange={(e) => setModel(e.target.value)}
                disabled={isPending}
              >
                <MenuItem value="meta-llama/llama-3.3-70b-instruct">meta-llama/llama-3.3-70b-instruct</MenuItem>
                <MenuItem value="deepseek/deepseek-r1">deepseek/deepseek-r1</MenuItem>
                <MenuItem value="qwen/qwen-2.5-72b-instruct">qwen/qwen-2.5-72b-instruct</MenuItem>
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Switch
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  disabled={isPending}
                />
              }
              label="Включить AI чат"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={validateKey}
                  onChange={(e) => setValidateKey(e.target.checked)}
                  disabled={isPending}
                />
              }
              label="Проверить ключ перед сохранением"
            />

            <Typography variant="caption" color="text.secondary">
              Получить API ключ OpenRouter можно на{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                openrouter.ai
              </a>
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isPending}>
          Отмена
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={isPending}>
          {isPending ? <CircularProgress size={20} /> : "Сохранить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
