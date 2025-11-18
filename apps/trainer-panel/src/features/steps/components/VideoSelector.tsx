"use client";

import { useState, useEffect } from "react";
import {
  Box,
  TextField,
  Typography,
  Tabs,
  Tab,
  Card,
  CardContent,
  CardMedia,
  CardActionArea,
  Chip,
  Stack,
  Alert,
} from "@mui/material";
import LinkIcon from "@mui/icons-material/Link";
import VideoLibraryIcon from "@mui/icons-material/VideoLibrary";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

import type { TrainerVideoDto } from "@gafus/types";

interface VideoSelectorProps {
  value?: string | null;
  onChange: (value: string) => void;
  trainerVideos: TrainerVideoDto[];
  error?: string;
  helperText?: string;
}

type VideoMode = "external" | "library";

/**
 * Компонент для выбора видео: внешняя ссылка или из библиотеки
 */
export default function VideoSelector({
  value,
  onChange,
  trainerVideos,
  error,
  helperText,
}: VideoSelectorProps) {
  // Определяем режим на основе текущего значения
  const getInitialMode = (): VideoMode => {
    if (!value) return "external";
    return value.includes("gafus-media.storage.yandexcloud.net") ? "library" : "external";
  };

  const [mode, setMode] = useState<VideoMode>(getInitialMode());
  const [externalUrl, setExternalUrl] = useState("");
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

  // Инициализация значений при монтировании
  useEffect(() => {
    if (value) {
      if (value.includes("gafus-media.storage.yandexcloud.net")) {
        // Это видео из библиотеки - находим его ID
        const video = trainerVideos.find((v) =>
          value.includes(v.relativePath.replace("uploads/", ""))
        );
        if (video) {
          setSelectedVideoId(video.id);
        }
      } else {
        // Это внешняя ссылка
        setExternalUrl(value);
      }
    }
  }, [value, trainerVideos]);

  const handleModeChange = (_event: React.SyntheticEvent, newMode: VideoMode) => {
    setMode(newMode);
    // При переключении режима сбрасываем значение
    if (newMode === "external") {
      setSelectedVideoId(null);
      onChange(externalUrl);
    } else {
      setExternalUrl("");
      if (selectedVideoId) {
        const video = trainerVideos.find((v) => v.id === selectedVideoId);
        if (video) {
          onChange(getCdnUrl(video));
        }
      } else {
        onChange("");
      }
    }
  };

  const handleExternalUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setExternalUrl(newValue);
    onChange(newValue);
  };

  const handleVideoSelect = (video: TrainerVideoDto) => {
    setSelectedVideoId(video.id);
    onChange(getCdnUrl(video));
  };

  const getCdnUrl = (video: TrainerVideoDto): string => {
    // relativePath уже содержит "uploads/..."
    return `https://gafus-media.storage.yandexcloud.net/${video.relativePath}`;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Box>
      <Tabs value={mode} onChange={handleModeChange} sx={{ mb: 2 }}>
        <Tab
          value="external"
          label="Внешняя ссылка"
          icon={<LinkIcon />}
          iconPosition="start"
        />
        <Tab
          value="library"
          label="Мои видео"
          icon={<VideoLibraryIcon />}
          iconPosition="start"
        />
      </Tabs>

      {mode === "external" ? (
        <TextField
          fullWidth
          value={externalUrl}
          onChange={handleExternalUrlChange}
          placeholder="https://youtube.com/..., https://rutube.ru/..."
          error={!!error}
          helperText={error || helperText || "Поддерживаются: YouTube, Rutube, Vimeo, VK Video"}
          variant="outlined"
        />
      ) : (
        <Box>
          {trainerVideos.length === 0 ? (
            <Alert severity="info">
              У вас пока нет загруженных видео. Загрузите видео в разделе{" "}
              <strong>&quot;Мои видео&quot;</strong>.
            </Alert>
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  md: "repeat(3, 1fr)",
                },
                gap: 2,
              }}
            >
              {trainerVideos.map((video) => {
                const isSelected = selectedVideoId === video.id;
                const cdnUrl = getCdnUrl(video);

                return (
                  <Box key={video.id}>
                    <Card
                      sx={{
                        position: "relative",
                        border: isSelected ? "2px solid" : "1px solid",
                        borderColor: isSelected ? "primary.main" : "divider",
                        transition: "all 0.2s",
                        "&:hover": {
                          borderColor: "primary.main",
                          boxShadow: 2,
                        },
                      }}
                    >
                      <CardActionArea onClick={() => handleVideoSelect(video)}>
                        <CardMedia
                          component="video"
                          src={cdnUrl}
                          sx={{
                            height: 140,
                            objectFit: "cover",
                            backgroundColor: "grey.900",
                          }}
                        />
                        <CardContent>
                          <Stack spacing={1}>
                            <Typography variant="subtitle2" noWrap>
                              {video.displayName || video.originalName}
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap">
                              <Chip
                                label={formatFileSize(video.fileSize)}
                                size="small"
                                variant="outlined"
                              />
                              {video.durationSec && (
                                <Chip
                                  label={formatDuration(video.durationSec)}
                                  size="small"
                                  variant="outlined"
                                />
                              )}
                            </Stack>
                          </Stack>
                        </CardContent>
                      </CardActionArea>
                      {isSelected && (
                        <Box
                          sx={{
                            position: "absolute",
                            top: 8,
                            right: 8,
                            backgroundColor: "primary.main",
                            borderRadius: "50%",
                            p: 0.5,
                            display: "flex",
                          }}
                        >
                          <CheckCircleIcon sx={{ color: "white", fontSize: 24 }} />
                        </Box>
                      )}
                    </Card>
                  </Box>
                );
              })}
            </Box>
          )}
          {error && (
            <Typography color="error" variant="caption" sx={{ mt: 1, display: "block" }}>
              {error}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

