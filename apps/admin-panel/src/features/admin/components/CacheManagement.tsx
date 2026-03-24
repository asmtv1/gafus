"use client";

import { reportClientError } from "@gafus/error-handling";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { Alert, Box, Button, Card, CardContent, CardHeader, Typography } from "@mui/material";
import { invalidateCoursesCacheAction } from "@/shared/lib/actions/invalidateCacheActions";
import { invalidateAllCache } from "@/shared/lib/actions/invalidateAllCache";

interface CacheManagementProps {
  className?: string;
}

export default function CacheManagement({ className }: CacheManagementProps) {
  const { data: session } = useSession();
  const [isInvalidating, setIsInvalidating] = useState(false);
  const [isInvalidatingAll, setIsInvalidatingAll] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Проверяем права администратора
  const isAdmin = session?.user?.role && ["ADMIN", "MODERATOR"].includes(session.user.role);
  const isSuperAdmin = session?.user?.role === "ADMIN";

  if (!isAdmin) {
    return null;
  }

  const handleInvalidateCoursesCache = async () => {
    setIsInvalidating(true);
    setMessage(null);

    try {
      const result = await invalidateCoursesCacheAction();

      if (result.success) {
        setMessage(`✅ ${result.message}`);
      } else {
        setMessage(`❌ Ошибка: ${result.error}`);
      }
    } catch (error) {
      reportClientError(error, {
        issueKey: "CacheManagement",
        keys: { operation: "invalidateCoursesCache" },
      });
      setMessage(`❌ Ошибка: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsInvalidating(false);
    }
  };

  const handleInvalidateAllCache = async () => {
    if (
      !confirm(
        "⚠️ Вы уверены? Это сбросит весь кэш для ВСЕХ пользователей. Они получат обновленные данные при следующей загрузке приложения (браузер и PWA).",
      )
    ) {
      return;
    }

    setIsInvalidatingAll(true);
    setMessage(null);

    try {
      const result = await invalidateAllCache();

      if (result.success) {
        setMessage(`✅ ${result.message}`);
      } else {
        setMessage(`❌ Ошибка: ${result.error}`);
      }
    } catch (error) {
      reportClientError(error, {
        issueKey: "CacheManagement",
        keys: { operation: "invalidateAllCache" },
      });
      setMessage(`❌ Ошибка: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsInvalidatingAll(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <Typography variant="h6" component="h2" sx={{ fontSize: { xs: "1.1rem", sm: "1.25rem" } }}>
          Управление кэшем
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontSize: { xs: "0.875rem", sm: "0.875rem" } }}
        >
          Управление серверным кэшированием данных
        </Typography>
      </CardHeader>
      <CardContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {/* Сброс всего кэша (только для ADMIN) */}
          {isSuperAdmin && (
            <Box>
              <Button
                variant="contained"
                color="error"
                onClick={handleInvalidateAllCache}
                disabled={isInvalidatingAll || isInvalidating}
                fullWidth
                sx={{
                  mb: 1,
                  minHeight: { xs: "44px", sm: "auto" },
                  "@media (min-width: 769px)": { width: "auto" },
                }}
              >
                {isInvalidatingAll
                  ? "⏳ Сброс кэша..."
                  : "🗑️ Сбросить весь кэш для всех пользователей"}
              </Button>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: { xs: "0.875rem", sm: "0.875rem" } }}
              >
                <strong>⚠️ Важно:</strong> Эта кнопка сбрасывает ВСЕ данные кэша для всех
                пользователей. Используйте после крупных обновлений функционала. Пользователи
                автоматически получат обновленные данные при следующей загрузке приложения (браузер
                и PWA).
              </Typography>
            </Box>
          )}

          {/* Обновление кэша курсов */}
          <Box>
            <Button
              variant="contained"
              color="primary"
              onClick={handleInvalidateCoursesCache}
              disabled={isInvalidating || isInvalidatingAll}
              fullWidth
              sx={{
                mb: 1,
                minHeight: { xs: "44px", sm: "auto" },
                "@media (min-width: 769px)": { width: "auto" },
              }}
            >
              {isInvalidating ? "⏳ Обновление..." : "🔄 Обновить кэш курсов"}
            </Button>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: { xs: "0.875rem", sm: "0.875rem" } }}
            >
              Принудительно обновляет кэш всех курсов на сервере. Используйте после массовых
              изменений курсов.
            </Typography>
          </Box>

          {message && (
            <Alert severity={message.startsWith("✅") ? "success" : "error"} sx={{ mt: 2 }}>
              {message}
            </Alert>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
