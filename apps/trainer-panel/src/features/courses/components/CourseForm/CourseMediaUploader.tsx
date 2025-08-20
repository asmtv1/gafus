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

export default function CourseMediaUploader({
  onUploadComplete,
}: {
  onUploadComplete: (url: string) => void;
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
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.6,
        maxWidthOrHeight: 800,
        useWebWorker: true,
      });

      const preview = URL.createObjectURL(compressed);
      setPreviewUrl(preview);

      const formData = new FormData();
      formData.append("image", compressed, file.name);

      const imageUrl = await uploadCourseImageServerAction(formData);
      onUploadComplete(imageUrl);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Не удалось загрузить изображение");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card sx={{ maxWidth: 345, mb: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Логотип курса
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
