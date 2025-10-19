"use client";
import { uploadCourseImageServerAction } from "@features/courses/lib/uploadCourseImageServerAction";
import {
  Card,
  CardContent,
  CardMedia,
  FormControl,
  InputLabel,
  OutlinedInput,
  Typography,
  Alert,
  CircularProgress,
} from "@mui/material";
import imageCompression from "browser-image-compression";
import { useState } from "react";
import { createTrainerPanelLogger } from "@gafus/logger";

// Создаем логгер для CourseMediaUploader
const logger = createTrainerPanelLogger('trainer-panel-course-media-uploader');

export default function CourseMediaUploader({
  onUploadComplete,
  courseId,
}: {
  onUploadComplete: (url: string) => void;
  courseId?: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = event.target.files?.[0];

    if (!file) return;

    setIsUploading(true);

    try {
      // Проверяем размер файла (максимум 10MB)
      if (file.size > 10 * 1024 * 1024) {
        throw new Error("Файл слишком большой. Максимальный размер: 10MB");
      }

      let processedFile = file;
      
      // Для WebP файлов применяем легкое сжатие
      if (file.type === "image/webp") {
        processedFile = await imageCompression(file, {
          maxSizeMB: 2.0, // Больше для WebP
          maxWidthOrHeight: 1200, // Больше разрешение для WebP
          useWebWorker: true,
        });
      } else {
        // Для JPG/PNG применяем стандартное сжатие
        processedFile = await imageCompression(file, {
          maxSizeMB: 1.0, // Увеличиваем до 1MB
          maxWidthOrHeight: 1000, // Увеличиваем разрешение
          useWebWorker: true,
        });
      }

      const preview = URL.createObjectURL(processedFile);
      setPreviewUrl(preview);

      const formData = new FormData();
      // Сохраняем оригинальное расширение файла
      const extension = file.name.split('.').pop() || 'jpg';
      const fileName = `course_${Date.now()}.${extension}`;
      formData.append("image", processedFile, fileName);

          const imageUrl = await uploadCourseImageServerAction(formData, courseId);
      onUploadComplete(imageUrl);
    } catch (err) {
      logger.error("Ошибка загрузки изображения курса", err as Error, {
        operation: 'course_image_upload_error'
      });
      setError(err instanceof Error ? err.message : "Не удалось загрузить изображение");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card sx={{ maxWidth: 345, mb: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Логотип курса *
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel htmlFor="image-upload"></InputLabel>
          <OutlinedInput
            id="image-upload"
            type="file"
            inputProps={{
              accept: "image/*",
              onChange: handleFileChange,
            }}
            disabled={isUploading}
            startAdornment={isUploading ? <CircularProgress size={20} sx={{ mr: 1 }} /> : undefined}
          />
        </FormControl>

        {previewUrl && (
          <CardMedia
            component="img"
            height="200"
            image={previewUrl}
            alt="Preview"
            sx={{ objectFit: "cover" }}
          />
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Поддерживаемые форматы: JPEG, PNG, WebP. Максимальный размер: 5MB.
        </Typography>
      </CardContent>
    </Card>
  );
}
