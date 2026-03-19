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
import { useState, useRef } from "react";
import { createTrainerPanelLogger } from "@gafus/logger";
import { getCDNUrl } from "@gafus/cdn-upload";

import { uploadArticleImageServerAction } from "../lib/uploadArticleImageServerAction";

const logger = createTrainerPanelLogger("trainer-panel-article-image-uploader");

interface ArticleImageUploaderProps {
  value: string[];
  onChange: (urls: string[]) => void;
  articleId?: string;
  maxImages?: number;
}

export default function ArticleImageUploader({
  value,
  onChange,
  articleId,
  maxImages = 10,
}: ArticleImageUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const newFiles = Array.from(event.target.files || []);

    if (newFiles.length === 0) return;

    if (value.length + newFiles.length > maxImages) {
      setError(`Максимум ${maxImages} изображений.`);
      return;
    }

    setIsUploading(true);

    try {
      const newUrls: string[] = [];
      for (const file of newFiles) {
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(`Файл ${file.name} больше 5MB`);
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
        const url = await uploadArticleImageServerAction(formData, articleId);
        newUrls.push(url);
      }

      onChange([...value, ...newUrls]);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      reportClientError(err as Error, { issueKey: "ArticleImageUpload" });
      logger.error("Ошибка загрузки изображения статьи", err as Error);
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = (index: number) => {
    const next = value.filter((_, i) => i !== index);
    onChange(next);
  };

  const total = value.length;

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        Медиа файлы Изображения ({total}/{maxImages})
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Первое изображение используется как обложка на карточке статьи
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <input
        accept="image/jpeg,image/jpg,image/png,image/webp"
        style={{ display: "none" }}
        multiple
        type="file"
        onChange={handleFileChange}
        disabled={isUploading || total >= maxImages}
        ref={fileInputRef}
      />
      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        disabled={isUploading || total >= maxImages}
        onClick={() => fileInputRef.current?.click()}
        sx={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
      >
        Добавить изображения
      </Button>

      {isUploading && (
        <Box sx={{ display: "flex", alignItems: "center", mb: 2, mt: 2 }}>
          <CircularProgress size={20} sx={{ mr: 1 }} />
          <Typography variant="body2">Загрузка...</Typography>
        </Box>
      )}

      {total > 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
            gap: 2,
            mt: 2,
          }}
        >
          {value.map((url, index) => (
            <Card key={url} sx={{ position: "relative" }}>
              <CardMedia
                component="img"
                height="200"
                image={getCDNUrl(url)}
                alt={`Изображение ${index + 1}`}
                sx={{ objectFit: "cover" }}
              />
              <CardContent sx={{ p: 1 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="caption" color="text.secondary">
                    Изображение {index + 1}
                  </Typography>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleRemove(index)}
                    disabled={isUploading}
                    aria-label="Удалить"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {total === 0 && !isUploading && (
        <Card sx={{ p: 3, textAlign: "center", border: "2px dashed", borderColor: "divider", mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Изображения не добавлены
          </Typography>
        </Card>
      )}
    </Box>
  );
}
