"use client";

import { reportClientError } from "@gafus/error-handling";
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
import { getCDNUrl } from "@gafus/cdn-upload";

import { uploadArticleLogoServerAction } from "../lib/uploadArticleLogoServerAction";

const logger = createTrainerPanelLogger("trainer-panel-article-logo-uploader");

interface ArticleLogoUploaderProps {
  value: string;
  onChange: (url: string) => void;
  articleId: string;
}

export default function ArticleLogoUploader({ value, onChange, articleId }: ArticleLogoUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = event.target.files?.[0];

    if (!file) return;

    setIsUploading(true);

    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Файл слишком большой. Максимум: 5MB");
      }

      let processed = file;
      if (file.type === "image/webp") {
        processed = await imageCompression(file, {
          maxSizeMB: 2.0,
          maxWidthOrHeight: 1200,
          useWebWorker: true,
        });
      } else {
        processed = await imageCompression(file, {
          maxSizeMB: 1.0,
          maxWidthOrHeight: 1000,
          useWebWorker: true,
        });
      }

      const formData = new FormData();
      formData.append("image", processed, file.name);
      const url = await uploadArticleLogoServerAction(formData, articleId);
      onChange(url);
    } catch (err) {
      reportClientError(err as Error, { issueKey: "ArticleLogoUpload" });
      logger.error("Ошибка загрузки логотипа статьи", err as Error);
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const previewUrl = value ? (value.startsWith("http") ? value : getCDNUrl(value)) : null;

  return (
    <Card sx={{ maxWidth: 345, mb: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Логотип статьи
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel htmlFor="logo-upload"></InputLabel>
          <OutlinedInput
            id="logo-upload"
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
            alt="Логотип"
            sx={{ objectFit: "cover" }}
          />
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          JPEG, PNG, WebP. Макс. 5MB.
        </Typography>
      </CardContent>
    </Card>
  );
}
