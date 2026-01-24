"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
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
import {
  CancelIcon,
  CheckCircleIcon,
  EditIcon,
} from "@/utils/muiImports";
import PageLayout from "@/shared/components/PageLayout";
import { updateTrainerAIConfig } from "@/features/ai-chat/lib/updateTrainerAIConfig";
import type { TrainerAIConfigData } from "@/features/ai-chat/lib/getTrainerAIConfigs";

interface TrainerAIConfigsClientProps {
  configs: TrainerAIConfigData[];
}

export default function TrainerAIConfigsClient({ configs: initialConfigs }: TrainerAIConfigsClientProps) {
  const router = useRouter();
  const [configs, setConfigs] = useState(initialConfigs);
  const [editingConfig, setEditingConfig] = useState<TrainerAIConfigData | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Состояние формы
  const [formApiKey, setFormApiKey] = useState("");
  const [formModel, setFormModel] = useState("meta-llama/llama-3.3-70b-instruct");
  const [formEnabled, setFormEnabled] = useState(true);
  const [formValidateKey, setFormValidateKey] = useState(false);

  const handleEdit = (config: TrainerAIConfigData) => {
    setEditingConfig(config);
    setFormApiKey(""); // Не показываем существующий ключ (безопасность)
    setFormModel(config.model || "meta-llama/llama-3.3-70b-instruct");
    setFormEnabled(config.enabled ?? false);
    setFormValidateKey(false);
    setError(null);
    setSuccess(false);
    setIsDialogOpen(true);
  };

  const handleClose = () => {
    if (!isPending) {
      setIsDialogOpen(false);
      setEditingConfig(null);
      setFormApiKey("");
      setError(null);
      setSuccess(false);
    }
  };

  const handleSave = () => {
    if (!editingConfig) return;

    setError(null);
    setSuccess(false);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("trainerId", editingConfig.trainerId);
        if (formApiKey.trim()) {
          formData.append("apiKey", formApiKey.trim());
        }
        formData.append("provider", "openrouter");
        formData.append("model", formModel);
        formData.append("enabled", formEnabled ? "true" : "false");
        formData.append("validateKey", formValidateKey ? "true" : "false");

        const result = await updateTrainerAIConfig({ success: false }, formData);

        if (result.success) {
          setSuccess(true);
          // Обновляем список конфигураций
          router.refresh(); // Перезагружаем данные с сервера
          setTimeout(() => {
            handleClose();
          }, 1000);
        } else {
          setError(result.error || "Ошибка при сохранении настроек");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Неизвестная ошибка");
      }
    });
  };

  return (
    <PageLayout
      title="Управление AI чатом тренеров"
      subtitle="Настройка API ключей и параметров AI чата для тренеров"
    >
      <Box>
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            <strong>Общий ключ:</strong> Если для тренера не указан индивидуальный API ключ, будет
            использоваться общий ключ из переменной окружения <code>OPENROUTER_API_KEY</code>.
          </Typography>
        </Alert>

        <TableContainer component={Card}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Тренер</TableCell>
                <TableCell>Индивидуальный ключ</TableCell>
                <TableCell>Модель</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Обновлено</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {configs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography variant="body2" color="text.secondary">
                      Нет тренеров
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                configs.map((config) => (
                  <TableRow key={config.trainerId}>
                    <TableCell>{config.trainerUsername}</TableCell>
                    <TableCell>
                      {config.hasIndividualApiKey ? (
                        <Chip label="Есть" color="success" size="small" />
                      ) : (
                        <Chip label="Используется общий" color="default" size="small" />
                      )}
                    </TableCell>
                    <TableCell>{config.model}</TableCell>
                    <TableCell>
                      {config.enabled ? (
                        <Chip icon={<CheckCircleIcon />} label="Включен" color="success" size="small" />
                      ) : (
                        <Chip icon={<CancelIcon />} label="Отключен" color="error" size="small" />
                      )}
                    </TableCell>
                    <TableCell>
                      {config.id
                        ? new Date(config.updatedAt).toLocaleDateString("ru-RU", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => handleEdit(config)}>
                        <EditIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Dialog open={isDialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
          <DialogTitle>
            Редактирование конфигурации: {editingConfig?.trainerUsername}
          </DialogTitle>
          <DialogContent>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}>
              {error && (
                <Alert severity="error" onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}
              {success && <Alert severity="success">Настройки успешно сохранены!</Alert>}

              <TextField
                label="Индивидуальный API ключ OpenRouter (опционально)"
                type="password"
                fullWidth
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
                placeholder="sk-or-... (оставьте пустым для использования общего ключа)"
                helperText="Оставьте пустым, чтобы использовать общий ключ из env. Укажите ключ для индивидуального доступа."
                disabled={isPending}
              />

              <FormControl fullWidth>
                <InputLabel>Модель</InputLabel>
                <Select
                  value={formModel}
                  label="Модель"
                  onChange={(e) => setFormModel(e.target.value)}
                  disabled={isPending}
                >
                  <MenuItem value="meta-llama/llama-3.3-70b-instruct">meta-llama/llama-3.3-70b-instruct</MenuItem>
                  <MenuItem value="deepseek/deepseek-r1">deepseek/deepseek-r1</MenuItem>
                  <MenuItem value="meta-llama/llama-3.1-405b-instruct">meta-llama/llama-3.1-405b-instruct</MenuItem>
                </Select>
              </FormControl>

              <FormControlLabel
                control={
                  <Switch
                    checked={formEnabled}
                    onChange={(e) => setFormEnabled(e.target.checked)}
                    disabled={isPending}
                  />
                }
                label="Включить AI чат для этого тренера"
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={formValidateKey}
                    onChange={(e) => setFormValidateKey(e.target.checked)}
                    disabled={isPending}
                  />
                }
                label="Проверить ключ перед сохранением (если указан)"
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
      </Box>
    </PageLayout>
  );
}
