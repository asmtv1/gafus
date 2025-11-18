"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import SendIcon from "@mui/icons-material/Send";
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";

import { formatFileSize } from "../lib/format";
import type { TrainerVideoViewModel } from "../types";

interface TrainerVideoUploaderProps {
  onUploaded: (video: TrainerVideoViewModel) => void;
}

interface UploadResponse {
  success?: boolean;
  video?: TrainerVideoViewModel;
  error?: string;
}

const ACCEPTED_TYPES = "video/mp4,video/webm,video/quicktime";

export default function TrainerVideoUploader({ onUploaded }: TrainerVideoUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const processingStartedRef = useRef<boolean>(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      xhrRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!success) return;

    const timeout = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(timeout);
  }, [success]);

  const triggerFileDialog = () => {
    setError(null);
    inputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setError(null);
    setSuccess(null);
  };

  const handleUpload = () => {
    if (!selectedFile) {
      setError("Сначала выберите видеофайл.");
      return;
    }

    setIsUploading(true);
    setIsProcessing(false);
    setProgress(0);
    setError(null);
    processingStartedRef.current = false;

    const formData = new FormData();
    formData.append("video", selectedFile);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", "/main-panel/my-videos/upload");
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setProgress(percent);
        
        // При достижении 100% переключаемся на фазу обработки на сервере
        if (percent >= 100 && !processingStartedRef.current) {
          processingStartedRef.current = true;
          setIsProcessing(true);
        }
      } else {
        setProgress(0);
      }
    };

    xhr.onload = () => {
      setIsUploading(false);
      setIsProcessing(false);
      processingStartedRef.current = false;

      try {
        const response = JSON.parse(xhr.responseText ?? "{}") as UploadResponse;

        if (xhr.status < 200 || xhr.status >= 300) {
          throw new Error(response?.error || "Сервер отклонил загрузку");
        }

        if (!response.success || !response.video) {
          throw new Error(response.error || "Не удалось загрузить видео");
        }

        setSuccess("Видео успешно загружено.");
        setSelectedFile(null);
        setProgress(0);
        if (inputRef.current) {
          inputRef.current.value = "";
        }

        onUploaded(response.video);
        router.refresh();
      } catch (parseError) {
        setError(
          parseError instanceof Error ? parseError.message : "Ошибка обработки ответа сервера",
        );
      }
    };

    xhr.onerror = () => {
      setIsUploading(false);
      setIsProcessing(false);
      processingStartedRef.current = false;
      setError("Сеть недоступна. Попробуйте еще раз.");
    };

    xhr.send(formData);
  };

  return (
    <Box
      sx={{
        p: 3,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        backgroundColor: "background.paper",
      }}
    >
      <Typography variant="h6" sx={{ mb: 1 }}>
        Загрузка видео
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Поддерживаемые форматы: MP4, WebM, MOV. Максимальный размер — 500 МБ.
      </Typography>

      <input
        type="file"
        accept={ACCEPTED_TYPES}
        hidden
        ref={inputRef}
        onChange={handleFileChange}
      />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="stretch">
        <Button
          variant="outlined"
          startIcon={<CloudUploadIcon />}
          onClick={triggerFileDialog}
          disabled={isUploading || isProcessing}
          sx={{ flexGrow: 1 }}
        >
          Выбрать файл
        </Button>
        <Button
          variant="contained"
          startIcon={<SendIcon />}
          onClick={handleUpload}
          disabled={!selectedFile || isUploading || isProcessing}
          sx={{ flexGrow: { xs: 1, sm: 0 } }}
        >
          Загрузить
        </Button>
      </Stack>

      {selectedFile && (
        <Typography variant="body2" sx={{ mt: 2 }}>
          Выбрано: <strong>{selectedFile.name}</strong> ({formatFileSize(selectedFile.size)})
        </Typography>
      )}

      {isUploading && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress
            variant={isProcessing ? "indeterminate" : progress > 0 ? "determinate" : "indeterminate"}
            value={isProcessing ? undefined : progress}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            {isProcessing
              ? "Обработка на сервере... Загрузка в CDN и сохранение в базу данных"
              : progress > 0
                ? `Загружено ${progress}%`
                : "Оцениваем размер файла..."}
          </Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {success}
        </Alert>
      )}
    </Box>
  );
}

