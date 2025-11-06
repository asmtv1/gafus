"use client";

import { useState, useTransition } from "react";
import {
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
  Typography,
  Box,
  CircularProgress,
} from "@mui/material";
import { Send as SendIcon } from "@mui/icons-material";
import { sendBroadcastPush } from "../lib/sendBroadcastPush";

interface BroadcastFormProps {
  className?: string;
}

export default function BroadcastForm({ className }: BroadcastFormProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!title.trim()) {
      setMessage({
        type: "error",
        text: "Введите заголовок уведомления",
      });
      return;
    }

    if (!body.trim()) {
      setMessage({
        type: "error",
        text: "Введите текст уведомления",
      });
      return;
    }

    startTransition(async () => {
      try {
        const result = await sendBroadcastPush(
          title.trim(),
          body.trim(),
          url.trim() || undefined
        );

        if (result.success) {
          setMessage({
            type: "success",
            text: `✅ Рассылка завершена! Отправлено: ${result.sentCount} из ${result.totalUsers}. ${
              result.failedCount > 0 ? `Не удалось отправить: ${result.failedCount}` : ""
            }`,
          });
          
          // Очищаем форму после успешной отправки
          setTitle("");
          setBody("");
          setUrl("");
        } else {
          setMessage({
            type: "error",
            text: `❌ Ошибка: ${result.error || "Не удалось отправить уведомления"}`,
          });
        }
      } catch (error) {
        setMessage({
          type: "error",
          text: `❌ Ошибка: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`,
        });
      }
    });
  };

  return (
    <Card className={className}>
      <CardContent>
        <Typography variant="h6" gutterBottom sx={{ mb: 2, fontSize: { xs: "1.1rem", sm: "1.25rem" } }}>
          Массовая рассылка push-уведомлений
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, fontSize: { xs: "0.875rem", sm: "0.875rem" } }}>
          Отправьте push-уведомление всем пользователям, которые разрешили получать уведомления.
          Уведомление будет отправлено на все устройства пользователей.
        </Typography>

        <form onSubmit={handleSubmit}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="Заголовок уведомления"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Новый курс доступен!"
              fullWidth
              required
              disabled={isPending}
              inputProps={{ maxLength: 100 }}
              helperText={`${title.length}/100 символов`}
            />

            <TextField
              label="Текст уведомления"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Например: Мы добавили новый курс по дрессировке щенков. Начните обучение прямо сейчас!"
              fullWidth
              required
              multiline
              rows={4}
              disabled={isPending}
              inputProps={{ maxLength: 300 }}
              helperText={`${body.length}/300 символов`}
            />

            <TextField
              label="URL для перехода (необязательно)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Например: /trainings/group"
              fullWidth
              disabled={isPending}
              helperText="Страница, на которую будет переходить пользователь при клике на уведомление"
            />

            {message && (
              <Alert severity={message.type} onClose={() => setMessage(null)}>
                {message.text}
              </Alert>
            )}

            <Button
              type="submit"
              variant="contained"
              color="primary"
              size="large"
              disabled={isPending}
              fullWidth
              startIcon={isPending ? <CircularProgress size={20} /> : <SendIcon />}
              sx={{ 
                alignSelf: { xs: "stretch", sm: "flex-start" },
                minHeight: { xs: "44px", sm: "auto" },
                "@media (min-width: 769px)": { width: "auto" }
              }}
            >
              {isPending ? "Отправка..." : "Отправить всем"}
            </Button>
          </Box>
        </form>

        <Box sx={{ mt: 3, p: { xs: 1.5, sm: 2 }, bgcolor: "info.light", borderRadius: 1 }}>
          <Typography variant="body2" color="info.dark" sx={{ fontSize: { xs: "0.875rem", sm: "0.875rem" } }}>
            <strong>⚠️ Важно:</strong> Это действие отправит уведомление всем пользователям
            с активными подписками. Используйте эту функцию ответственно и только для важных
            объявлений.
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

