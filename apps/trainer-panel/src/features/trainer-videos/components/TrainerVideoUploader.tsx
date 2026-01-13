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

interface FileUploadState {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "processing" | "completed" | "error";
  error?: string;
}

const ACCEPTED_TYPES = "video/mp4,video/webm,video/quicktime";
const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB
const MAX_FILES = 5;

export default function TrainerVideoUploader({ onUploaded }: TrainerVideoUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRefsRef = useRef<Map<number, XMLHttpRequest>>(new Map());

  const [files, setFiles] = useState<FileUploadState[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      // Отменяем все активные загрузки при размонтировании
      xhrRefsRef.current.forEach((xhr) => xhr.abort());
    };
  }, []);

  useEffect(() => {
    if (!success) return;
    const timeout = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(timeout);
  }, [success]);

  // Валидация файлов
  const validateFiles = (fileList: FileList | File[]): { valid: File[]; errors: string[] } => {
    const filesArray = Array.from(fileList);
    const errors: string[] = [];
    const valid: File[] = [];

    if (filesArray.length > MAX_FILES) {
      errors.push(`Максимум ${MAX_FILES} файлов за раз`);
      return { valid: [], errors };
    }

    filesArray.forEach((file) => {
      if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
        errors.push(`${file.name}: неподдерживаемый формат`);
      } else if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`${file.name}: превышен лимит 500 МБ`);
      } else {
        valid.push(file);
      }
    });

    return { valid, errors };
  };

  const triggerFileDialog = () => {
    setError(null);
    inputRef.current?.click();
  };

  // Обработка выбора файлов через input
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const { valid, errors } = validateFiles(fileList);
    
    if (errors.length > 0) {
      setError(errors.join("; "));
    }

    if (valid.length > 0) {
      setFiles(valid.map((file) => ({
        file,
        progress: 0,
        status: "pending",
      })));
      setError(null);
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  // Drag-and-drop обработчики
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length === 0) return;

    const { valid, errors } = validateFiles(droppedFiles);
    
    if (errors.length > 0) {
      setError(errors.join("; "));
    }

    if (valid.length > 0) {
      setFiles(valid.map((file) => ({
        file,
        progress: 0,
        status: "pending",
      })));
      setError(null);
    }
  };

  // Загрузка одного файла
  const uploadSingleFile = (file: File, index: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("video", file);

      const xhr = new XMLHttpRequest();
      xhrRefsRef.current.set(index, xhr);
      
      xhr.open("POST", "/main-panel/my-videos/upload");
      xhr.withCredentials = true;

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setFiles((prev) => prev.map((f, idx) => 
            idx === index ? { ...f, progress: percent } : f
          ));
          
          if (percent >= 100) {
            setFiles((prev) => prev.map((f, idx) => 
              idx === index ? { ...f, status: "processing" } : f
            ));
          }
        }
      };

      xhr.onload = () => {
        xhrRefsRef.current.delete(index);
        
        try {
          const response = JSON.parse(xhr.responseText ?? "{}") as UploadResponse;

          if (xhr.status < 200 || xhr.status >= 300) {
            throw new Error(response?.error || "Сервер отклонил загрузку");
          }

          if (!response.success || !response.video) {
            throw new Error(response.error || "Не удалось загрузить видео");
          }

          onUploaded(response.video);
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      xhr.onerror = () => {
        xhrRefsRef.current.delete(index);
        reject(new Error("Сеть недоступна"));
      };

      xhr.send(formData);
    });
  };

  // Последовательная загрузка файлов
  const handleUploadAll = async () => {
    if (files.length === 0) {
      setError("Сначала выберите файлы");
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccess(null);

    const uploadResults: { completed: number; failed: number } = { completed: 0, failed: 0 };

    for (let i = 0; i < files.length; i++) {
      // Обновляем статус на "uploading"
      setFiles((prev) => prev.map((f, idx) => 
        idx === i ? { ...f, status: "uploading", progress: 0 } : f
      ));

      try {
        await uploadSingleFile(files[i].file, i);
        
        // Обновляем статус на "completed"
        setFiles((prev) => prev.map((f, idx) => 
          idx === i ? { ...f, status: "completed", progress: 100 } : f
        ));
        
        uploadResults.completed++;
      } catch (error) {
        // Обновляем статус на "error"
        setFiles((prev) => prev.map((f, idx) => 
          idx === i ? { 
            ...f, 
            status: "error", 
            error: error instanceof Error ? error.message : "Ошибка загрузки" 
          } : f
        ));
        
        uploadResults.failed++;
      }

      // Небольшая задержка между загрузками
      if (i < files.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    setIsUploading(false);
    
    // Показываем результаты
    if (uploadResults.completed > 0) {
      setSuccess(`Успешно загружено: ${uploadResults.completed} из ${files.length}`);
    }
    if (uploadResults.failed > 0) {
      setError(`Ошибки загрузки: ${uploadResults.failed} файлов`);
    }

    // Очищаем список через 3 секунды после последней загрузки
    if (uploadResults.completed > 0) {
      setTimeout(() => {
        setFiles([]);
        setSuccess(null);
        setError(null);
        router.refresh();
      }, 3000);
    }
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
        Поддерживаемые форматы: MP4, WebM, MOV. Максимальный размер — 500 МБ. До {MAX_FILES} файлов за раз.
      </Typography>

      <input
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        hidden
        ref={inputRef}
        onChange={handleFileChange}
      />

      {/* Drag-and-Drop зона */}
      <Box
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={triggerFileDialog}
        sx={{
          p: 4,
          mb: 2,
          borderRadius: 2,
          border: "2px dashed",
          borderColor: isDragging ? "primary.main" : "divider",
          backgroundColor: isDragging ? "action.hover" : "background.default",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.2s",
          "&:hover": {
            borderColor: "primary.main",
            backgroundColor: "action.hover",
          },
        }}
      >
        <CloudUploadIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
        <Typography variant="body1" sx={{ mb: 0.5 }}>
          {isDragging ? "Отпустите файлы здесь" : "Перетащите видео сюда"}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          или нажмите для выбора
        </Typography>
      </Box>

      {/* Список выбранных файлов */}
      {files.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Выбрано файлов: {files.length}
          </Typography>
          <Stack spacing={1}>
            {files.map((fileState, index) => (
              <Box
                key={index}
                sx={{
                  p: 2,
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "divider",
                  backgroundColor: "background.paper",
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="body2" noWrap sx={{ flexGrow: 1, mr: 2 }}>
                    {fileState.file.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatFileSize(fileState.file.size)}
                  </Typography>
                </Stack>

                {fileState.status === "uploading" && (
                  <LinearProgress variant="determinate" value={fileState.progress} sx={{ mb: 0.5 }} />
                )}
                {fileState.status === "processing" && (
                  <LinearProgress variant="indeterminate" sx={{ mb: 0.5 }} />
                )}

                <Typography variant="caption" color="text.secondary">
                  {fileState.status === "pending" && "Ожидание..."}
                  {fileState.status === "uploading" && `Загрузка: ${fileState.progress}%`}
                  {fileState.status === "processing" && "Обработка на сервере..."}
                  {fileState.status === "completed" && "✓ Загружено"}
                  {fileState.status === "error" && `✗ Ошибка: ${fileState.error}`}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {/* Кнопки */}
      <Stack direction="row" spacing={2}>
        <Button
          variant="outlined"
          startIcon={<CloudUploadIcon />}
          onClick={triggerFileDialog}
          disabled={isUploading}
          sx={{ flexGrow: 1 }}
        >
          Выбрать файлы
        </Button>
        <Button
          variant="contained"
          startIcon={<SendIcon />}
          onClick={handleUploadAll}
          disabled={files.length === 0 || isUploading}
        >
          Загрузить все
        </Button>
      </Stack>

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
