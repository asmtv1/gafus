"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  Typography,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Box,
  CircularProgress
} from "@mui/material";
import {
  getReengagementSettings,
  updateReengagementSettings
} from "@shared/lib/actions/updateReengagementSettings";

export default function ReengagementSettings() {
  const [enabled, setEnabled] = useState(true);
  const [preferredTime, setPreferredTime] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Загрузить текущие настройки
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const result = await getReengagementSettings();

      if (result.success && result.data) {
        setEnabled(result.data.enabled);
        setPreferredTime(result.data.preferredTime || "");
      }
    } catch (error) {
      console.error("Ошибка загрузки настроек:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    const newEnabled = !enabled;
    setSaving(true);
    setMessage(null);

    try {
      const result = await updateReengagementSettings(newEnabled, preferredTime || undefined);

      if (result.success) {
        setEnabled(newEnabled);
        setMessage({
          type: "success",
          text: newEnabled
            ? "Напоминания о тренировках включены"
            : "Напоминания о тренировках отключены"
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Не удалось обновить настройки"
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: "Произошла ошибка при сохранении"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTimeChange = async (time: string) => {
    setPreferredTime(time);
    setSaving(true);
    setMessage(null);

    try {
      const result = await updateReengagementSettings(enabled, time || undefined);

      if (result.success) {
        setMessage({
          type: "success",
          text: "Предпочитаемое время обновлено"
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Не удалось обновить настройки"
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: "Произошла ошибка при сохранении"
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" p={3}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Напоминания о тренировках
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Если вы не будете заниматься с питомцем несколько дней, мы отправим напоминание
          о продолжении тренировок
        </Typography>

        {message && (
          <Alert
            severity={message.type}
            onClose={() => setMessage(null)}
            sx={{ mb: 2 }}
          >
            {message.text}
          </Alert>
        )}

        <FormControlLabel
          control={
            <Switch
              checked={enabled}
              onChange={handleToggle}
              disabled={saving}
            />
          }
          label="Получать напоминания о возвращении к тренировкам"
        />

        {enabled && (
          <Box sx={{ mt: 3 }}>
            <FormControl fullWidth disabled={saving}>
              <InputLabel id="preferred-time-label">
                Предпочитаемое время получения уведомлений
              </InputLabel>
              <Select
                labelId="preferred-time-label"
                value={preferredTime}
                label="Предпочитаемое время получения уведомлений"
                onChange={(e) => handleTimeChange(e.target.value)}
              >
                <MenuItem value="">
                  <em>Любое время</em>
                </MenuItem>
                <MenuItem value="09:00">Утро (9:00-11:00)</MenuItem>
                <MenuItem value="14:00">День (14:00-16:00)</MenuItem>
                <MenuItem value="18:00">Вечер (18:00-20:00)</MenuItem>
              </Select>
            </FormControl>

            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
              Мы постараемся отправлять уведомления в выбранное время
            </Typography>
          </Box>
        )}

        <Box sx={{ mt: 3, p: 2, bgcolor: "info.light", borderRadius: 1 }}>
          <Typography variant="body2" color="info.dark">
            <strong>ℹ️ Как это работает:</strong> Если вы не будете завершать шаги тренировок
            несколько дней, мы отправим дружеское напоминание. Вы всегда можете отключить
            эту функцию.
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

