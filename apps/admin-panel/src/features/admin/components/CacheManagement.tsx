"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Typography,
} from "@mui/material";
import { invalidateCoursesCacheAction } from "@/shared/lib/actions/invalidateCacheActions";

interface CacheManagementProps {
  className?: string;
}

export default function CacheManagement({ className }: CacheManagementProps) {
  const { data: session } = useSession();
  const [isInvalidating, setIsInvalidating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Проверяем права администратора
  const isAdmin = session?.user?.role && ["ADMIN", "MODERATOR"].includes(session.user.role);

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
      setMessage(`❌ Ошибка: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsInvalidating(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <Typography variant="h6" component="h2">
          Управление кэшем
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Управление серверным кэшированием данных
        </Typography>
      </CardHeader>
      <CardContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box>
            <Button
              variant="contained"
              color="primary"
              onClick={handleInvalidateCoursesCache}
              disabled={isInvalidating}
              sx={{ mb: 1 }}
            >
              {isInvalidating ? "⏳ Обновление..." : "🔄 Обновить кэш курсов"}
            </Button>
            <Typography variant="body2" color="text.secondary">
              Принудительно обновляет кэш всех курсов на сервере. Используйте после массовых изменений курсов.
            </Typography>
          </Box>

          {message && (
            <Alert 
              severity={message.startsWith("✅") ? "success" : "error"}
              sx={{ mt: 2 }}
            >
              {message}
            </Alert>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

