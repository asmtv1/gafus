"use client";

import { reportClientError } from "@gafus/error-handling";
import {
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Typography,
  Alert,
  CircularProgress,
  IconButton,
} from "@mui/material";
import { Delete as DeleteIcon, Add as AddIcon } from "@mui/icons-material";
import imageCompression from "browser-image-compression";
import { useState, useRef, useEffect } from "react";
import { createTrainerPanelLogger } from "@gafus/logger";
import { getCDNUrl } from "@gafus/cdn-upload";

const logger = createTrainerPanelLogger("trainer-panel-step-image-uploader");

interface StepImageUploaderProps {
  onImagesChange: (files: File[]) => void;
  onDeletedImagesChange?: (deletedImages: string[]) => void; // Новый колбэк для удаленных изображений
  initialImages?: string[];
  _stepId?: string; // Префикс _ для неиспользуемого параметра
  maxImages?: number;
}

export default function StepImageUploader({
  onImagesChange,
  onDeletedImagesChange,
  initialImages = [],
  _stepId,
  maxImages = 10,
}: StepImageUploaderProps) {
  const [images, setImages] = useState<string[]>(initialImages);
  const [files, setFiles] = useState<File[]>([]);
  const [deletedImages, setDeletedImages] = useState<string[]>([]); // Новое состояние для удаленных изображений
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setImages(initialImages);
  }, [initialImages]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const newFiles = Array.from(event.target.files || []);

    if (newFiles.length === 0) return;

    // Проверяем общее количество изображений
    if (images.length + files.length + newFiles.length > maxImages) {
      setError(`Вы можете загрузить не более ${maxImages} изображений.`);
      return;
    }

    // Проверяем общий размер файлов (максимум 50MB для всех файлов)
    const totalSize = newFiles.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > 50 * 1024 * 1024) {
      setError("Общий размер файлов слишком большой. Максимальный размер: 50MB");
      return;
    }

    setIsProcessing(true);

    try {
      const processedFiles: File[] = [];
      for (const file of newFiles) {
        if (file.size > 5 * 1024 * 1024) {
          // Максимум 5MB для шагов
          throw new Error(`Файл ${file.name} слишком большой. Максимальный размер: 5MB`);
        }

        let processedFile = file;
        if (file.type === "image/webp") {
          processedFile = await imageCompression(file, {
            maxSizeMB: 2.0,
            maxWidthOrHeight: 1200,
            useWebWorker: true,
          });
        } else {
          processedFile = await imageCompression(file, {
            maxSizeMB: 1.0,
            maxWidthOrHeight: 1000,
            useWebWorker: true,
          });
        }
        processedFiles.push(processedFile);
      }

      // Добавляем новые файлы к существующим
      const updatedFiles = [...files, ...processedFiles];
      setFiles(updatedFiles);

      // Уведомляем родительский компонент о новых файлах
      onImagesChange(updatedFiles);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      reportClientError(error, { issueKey: "StepImageUpload", keys: { operation: "upload" } });
      logger.error("Ошибка обработки изображений шага", error, {
        operation: "step_images_processing_error",
      });
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    // Если это существующее изображение из БД
    if (index < images.length) {
      const imageUrlToDelete = images[index];

      // Добавляем в список удаленных (НЕ удаляем из CDN сразу!)
      const newDeletedImages = [...deletedImages, imageUrlToDelete];
      setDeletedImages(newDeletedImages);

      // Уведомляем родительский компонент об удаленных изображениях
      onDeletedImagesChange?.(newDeletedImages);

      // Убираем из отображаемых изображений
      const newImages = images.filter((_, i) => i !== index);
      setImages(newImages);

      logger.info(`🗑️ Изображение помечено для удаления: ${imageUrlToDelete}`);
    } else {
      // Если это новый файл (еще не загруженный в CDN)
      const fileIndex = index - images.length;
      const newFiles = files.filter((_, i) => i !== fileIndex);
      setFiles(newFiles);
      onImagesChange(newFiles);
    }

    logger.info(`🗑️ Удалено изображение шага (индекс: ${index})`, {
      operation: "step_image_remove",
      remainingCount: images.length + files.length - 1,
    });
  };

  const handleAddImages = (event: React.MouseEvent) => {
    event.preventDefault();
    fileInputRef.current?.click();
  };

  const totalImages = images.length + files.length;

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        Изображения шага ({totalImages}/{maxImages})
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <input
        accept="image/jpeg,image/jpg,image/png,image/webp"
        style={{ display: "none" }}
        multiple
        type="file"
        onChange={handleFileChange}
        disabled={isProcessing || totalImages >= maxImages}
        ref={fileInputRef}
      />
      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        disabled={isProcessing || totalImages >= maxImages}
        onClick={handleAddImages}
        sx={{
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
          minHeight: { xs: "44px", sm: "auto" },
        }}
      >
        Добавить изображения
      </Button>

      {isProcessing && (
        <Box sx={{ display: "flex", alignItems: "center", mb: 2, mt: 2 }}>
          <CircularProgress size={20} sx={{ mr: 1 }} />
          <Typography variant="body2">Обработка изображений...</Typography>
        </Box>
      )}

      {/* Галерея изображений */}
      {totalImages > 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
            gap: 2,
            mt: 2,
          }}
        >
          {/* Существующие изображения из БД */}
          {images.map((imageUrl, index) => (
            <Card key={`existing-${index}`} sx={{ position: "relative" }}>
              <CardMedia
                component="img"
                height="200"
                image={getCDNUrl(imageUrl)}
                alt={`Изображение ${index + 1}`}
                sx={{ objectFit: "cover" }}
              />
              <CardContent sx={{ p: 1 }}>
                <Box
                  sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Изображение {index + 1}
                  </Typography>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleRemoveImage(index)}
                    disabled={isProcessing}
                    sx={{
                      WebkitTapHighlightColor: "transparent",
                      touchAction: "manipulation",
                      minWidth: "44px",
                      minHeight: "44px",
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </CardContent>
            </Card>
          ))}

          {/* Новые файлы (еще не загруженные) */}
          {files.map((file, index) => (
            <Card key={`new-${index}`} sx={{ position: "relative" }}>
              <CardMedia
                component="img"
                height="200"
                image={URL.createObjectURL(file)}
                alt={`Новое изображение ${index + 1}`}
                sx={{ objectFit: "cover" }}
              />
              <CardContent sx={{ p: 1 }}>
                <Box
                  sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Новое изображение {index + 1}
                  </Typography>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleRemoveImage(images.length + index)}
                    disabled={isProcessing}
                    sx={{
                      WebkitTapHighlightColor: "transparent",
                      touchAction: "manipulation",
                      minWidth: "44px",
                      minHeight: "44px",
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Сообщение если нет изображений */}
      {totalImages === 0 && !isProcessing && (
        <Card sx={{ p: 3, textAlign: "center", border: "2px dashed #ccc" }}>
          <Typography variant="body2" color="text.secondary">
            Изображения не добавлены
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            Нажмите "Добавить изображения" для загрузки
          </Typography>
        </Card>
      )}
    </Box>
  );
}
