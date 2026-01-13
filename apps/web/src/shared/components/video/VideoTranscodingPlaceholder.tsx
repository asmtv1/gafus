"use client";

import { Box, CircularProgress, Typography, LinearProgress } from "@mui/material";
import { Videocam as VideocamIcon } from "@mui/icons-material";

interface VideoTranscodingPlaceholderProps {
  status: "PENDING" | "PROCESSING" | "FAILED";
  error?: string | null;
}

/**
 * Плейсхолдер для видео в процессе транскодирования
 */
export function VideoTranscodingPlaceholder({
  status,
  error,
}: VideoTranscodingPlaceholderProps) {
  if (status === "FAILED") {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
          bgcolor: "grey.900",
          borderRadius: 1,
          p: 3,
          textAlign: "center",
        }}
      >
        <VideocamIcon sx={{ fontSize: 60, color: "error.main", mb: 2 }} />
        <Typography variant="h6" color="error.main" gutterBottom>
          Ошибка обработки видео
        </Typography>
        {error && (
          <Typography variant="body2" color="text.secondary">
            {error}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Обратитесь к администратору
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 300,
        bgcolor: "grey.900",
        borderRadius: 1,
        p: 3,
        textAlign: "center",
      }}
    >
      <CircularProgress size={60} sx={{ mb: 3 }} />
      
      <Typography variant="h6" gutterBottom>
        {status === "PENDING" ? "Видео в очереди на обработку" : "Обработка видео"}
      </Typography>
      
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Это может занять несколько минут
      </Typography>
      
      <Box sx={{ width: "100%", maxWidth: 400, mt: 2 }}>
        <LinearProgress />
      </Box>
      
      <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>
        Обновите страницу через пару минут
      </Typography>
    </Box>
  );
}
