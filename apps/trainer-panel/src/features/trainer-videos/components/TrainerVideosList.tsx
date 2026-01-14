"use client";

import { useState, useTransition, useActionState, useEffect, useRef } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";

import { deleteTrainerVideo } from "../lib/deleteTrainerVideo";
import { updateTrainerVideoName } from "../lib/updateTrainerVideoName";
import { getSignedVideoUrl } from "../lib/getSignedVideoUrl";
import { HLSVideoPlayer } from "@shared/components/video/HLSVideoPlayer";
import { getCDNUrl } from "@gafus/cdn-upload";

import { formatFileSize, formatRuDate } from "../lib/format";
import type { TrainerVideoViewModel } from "../types";
import type { ActionResult } from "@gafus/types";

interface TrainerVideosListProps {
  videos: TrainerVideoViewModel[];
  onVideoDeleted?: (videoId: string) => void;
  onVideoUpdated?: (videoId: string, displayName: string | null) => void;
  isAdmin?: boolean;
}

/**
 * Компонент для отображения видео плеера с поддержкой статусов транскодирования
 */
function VideoPlayerSection({ video }: { video: TrainerVideoViewModel }) {
  const [showPlayer, setShowPlayer] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Загружаем signed URL только при клике на превью
  const handleThumbnailClick = () => {
    if (!signedUrl) {
      setIsLoading(true);
      getSignedVideoUrl(video.id)
        .then((url) => {
          setSignedUrl(url);
          setShowPlayer(true);
        })
        .catch((error) => {
          console.error("[VideoPlayerSection] Ошибка получения signed URL:", error);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setShowPlayer(true);
    }
  };

  // PENDING или PROCESSING - показываем loader
  if (video.transcodingStatus === "PENDING" || video.transcodingStatus === "PROCESSING") {
    return (
      <Box
        sx={{
          height: 220,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "grey.100",
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
        }}
      >
        <Stack alignItems="center" spacing={2}>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary">
            {video.transcodingStatus === "PENDING"
              ? "Видео в очереди на обработку..."
              : "Видео обрабатывается..."}
          </Typography>
        </Stack>
      </Box>
    );
  }

  // FAILED - показываем ошибку
  if (video.transcodingStatus === "FAILED") {
    return (
      <Box
        sx={{
          height: 220,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "grey.100",
          p: 2,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
        }}
      >
        <Alert severity="error" sx={{ width: "100%" }}>
          Ошибка обработки видео
          {video.transcodingError && (
            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
              {video.transcodingError}
            </Typography>
          )}
        </Alert>
      </Box>
    );
  }

  // COMPLETED - показываем thumbnail или плеер
  if (video.transcodingStatus === "COMPLETED") {
    // Если плеер активен и есть signed URL - показываем плеер
    if (showPlayer && signedUrl) {
      return (
        <Box
          sx={{
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            overflow: "hidden",
            aspectRatio: "16/9",
            bgcolor: "black",
          }}
        >
          <HLSVideoPlayer
            src={signedUrl}
            controls
            autoplay={true}
            style={{
              objectFit: "contain",
              width: "100%",
              height: "100%",
            }}
          />
        </Box>
      );
    }

    // Если есть thumbnail - показываем превью
    if (video.thumbnailPath) {
      return (
        <Box
          onClick={handleThumbnailClick}
          sx={{
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            overflow: "hidden",
            aspectRatio: "16/9",
            bgcolor: "black",
            cursor: "pointer",
            position: "relative",
            "&:hover .play-overlay": {
              opacity: 1,
            },
          }}
        >
          <img
            src={getCDNUrl(video.thumbnailPath)}
            alt={video.displayName || video.originalName}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
            onError={(e) => {
              console.error("[VideoPlayerSection] Ошибка загрузки thumbnail:", {
                thumbnailPath: video.thumbnailPath,
                url: video.thumbnailPath ? getCDNUrl(video.thumbnailPath) : null,
                error: e,
              });
            }}
          />
          {/* Оверлей с кнопкой Play */}
          <Box
            className="play-overlay"
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "rgba(0, 0, 0, 0.3)",
              opacity: 0,
              transition: "opacity 0.2s",
            }}
          >
            <PlayArrowIcon sx={{ fontSize: 64, color: "white" }} />
          </Box>
        </Box>
      );
    }

    // Fallback для старых видео без thumbnail
    if (!video.thumbnailPath && video.hlsManifestPath) {
      return (
        <Box
          sx={{
            height: 220,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "grey.100",
            p: 2,
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
          }}
        >
          <Alert severity="warning" sx={{ width: "100%" }}>
            Превью недоступно для этого видео
          </Alert>
        </Box>
      );
    }
  }

  // Если нет HLS - показываем предупреждение (оригинальные файлы уже удалены)
  if (video.transcodingStatus === "COMPLETED" && !video.hlsManifestPath) {
    return (
      <Box
        sx={{
          height: 220,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "grey.100",
          p: 2,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
        }}
      >
        <Alert severity="warning" sx={{ width: "100%" }}>
          Видео недоступно. HLS версия отсутствует.
        </Alert>
      </Box>
    );
  }

  // Загрузка signed URL
  if (isLoading) {
    return (
      <Box
        sx={{
          height: 220,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "grey.100",
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // Fallback для других случаев
  return (
    <Box
      sx={{
        height: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "grey.100",
        p: 2,
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
      }}
    >
      <Alert severity="info" sx={{ width: "100%" }}>
        Видео недоступно
      </Alert>
    </Box>
  );
}

export default function TrainerVideosList({ videos, onVideoDeleted, onVideoUpdated, isAdmin = false }: TrainerVideosListProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState<TrainerVideoViewModel | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deleteState, deleteAction] = useActionState<ActionResult, FormData>(
    deleteTrainerVideo,
    {},
  );
  const [error, setError] = useState<string | null>(null);
  
  // Состояние для редактирования названия
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState<string>("");
  const [isUpdatingName, startUpdateTransition] = useTransition();
  const [updateNameState, updateNameAction] = useActionState<ActionResult, FormData>(
    updateTrainerVideoName,
    {},
  );
  const lastProcessedVideoIdRef = useRef<string | null>(null);
  const isWaitingForUpdateRef = useRef<boolean>(false);
  const lastDeletedVideoIdRef = useRef<string | null>(null);
  const isWaitingForDeleteRef = useRef<boolean>(false);

  const openDeleteDialog = (video: TrainerVideoViewModel) => {
    isWaitingForDeleteRef.current = false;
    setVideoToDelete(video);
    setDeleteDialogOpen(true);
    setError(null);
  };

  const closeDeleteDialog = () => {
    if (!isPending) {
      setDeleteDialogOpen(false);
      setVideoToDelete(null);
      setError(null);
    }
  };

  const confirmDelete = () => {
    if (!videoToDelete) return;

    isWaitingForDeleteRef.current = true;
    lastDeletedVideoIdRef.current = null;

    const formData = new FormData();
    formData.append("videoId", videoToDelete.id);

    startTransition(() => {
      deleteAction(formData);
    });
  };

  // Обрабатываем результат удаления
  useEffect(() => {
    if (
      deleteState.success &&
      videoToDelete &&
      deleteDialogOpen &&
      isWaitingForDeleteRef.current &&
      lastDeletedVideoIdRef.current !== videoToDelete.id
    ) {
      lastDeletedVideoIdRef.current = videoToDelete.id;
      isWaitingForDeleteRef.current = false;
      onVideoDeleted?.(videoToDelete.id);
      setDeleteDialogOpen(false);
      setVideoToDelete(null);
      setError(null);
    } else if (deleteState.error && deleteDialogOpen && isWaitingForDeleteRef.current) {
      isWaitingForDeleteRef.current = false;
      setError(deleteState.error);
    }
  }, [deleteState.success, deleteState.error, videoToDelete, deleteDialogOpen, onVideoDeleted]);

  // Обрабатываем результат обновления названия
  useEffect(() => {
    if (
      updateNameState.success &&
      editingVideoId &&
      isWaitingForUpdateRef.current &&
      lastProcessedVideoIdRef.current !== editingVideoId
    ) {
      // Обрабатываем только если мы ожидаем обновление и это новый результат
      lastProcessedVideoIdRef.current = editingVideoId;
      isWaitingForUpdateRef.current = false;
      const trimmedValue = editNameValue.trim() || null;
      onVideoUpdated?.(editingVideoId, trimmedValue);
      setEditingVideoId(null);
      setEditNameValue("");
    }
  }, [updateNameState.success, editingVideoId, editNameValue, onVideoUpdated]);

  // Функции для редактирования названия
  const startEditing = (video: TrainerVideoViewModel) => {
    // Сбрасываем флаги при начале нового редактирования
    isWaitingForUpdateRef.current = false;
    if (lastProcessedVideoIdRef.current !== video.id) {
      lastProcessedVideoIdRef.current = null;
    }
    setEditingVideoId(video.id);
    setEditNameValue(video.displayName || video.originalName);
  };

  const cancelEditing = () => {
    isWaitingForUpdateRef.current = false;
    setEditingVideoId(null);
    setEditNameValue("");
  };

  const saveName = (videoId: string) => {
    // Устанавливаем флаг ожидания нового результата
    isWaitingForUpdateRef.current = true;
    lastProcessedVideoIdRef.current = null;
    
    const formData = new FormData();
    formData.append("videoId", videoId);
    formData.append("displayName", editNameValue.trim() || "");

    startUpdateTransition(() => {
      updateNameAction(formData);
    });
  };

  if (videos.length === 0) {
    return (
      <Card
        sx={{
          mt: 3,
          p: 4,
          textAlign: "center",
          border: "1px dashed",
          borderColor: "divider",
        }}
      >
        <Typography variant="h6" gutterBottom>
          Видео еще не загружены
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Загрузите первое видео, чтобы использовать его в курсах и экзаменах.
        </Typography>
      </Card>
    );
  }

  return (
    <>
      <Box
        sx={{
          mt: 3,
          display: "grid",
          gap: 3,
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(3, minmax(0, 1fr))",
          },
        }}
      >
        {videos.map((video) => {
          return (
            <Card
              key={video.id}
              sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <VideoPlayerSection video={video} />
              <CardContent sx={{ flexGrow: 1 }}>
                {editingVideoId === video.id ? (
                  <Box sx={{ mb: 2 }}>
                    <TextField
                      fullWidth
                      size="small"
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      placeholder={video.originalName}
                      error={!!updateNameState.error}
                      helperText={updateNameState.error}
                      disabled={isUpdatingName}
                      autoFocus
                      inputProps={{ maxLength: 255 }}
                      sx={{ mb: 1 }}
                    />
                    <Stack direction="row" spacing={1}>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => saveName(video.id)}
                        disabled={isUpdatingName}
                        sx={{ WebkitTapHighlightColor: "transparent" }}
                      >
                        <CheckIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={cancelEditing}
                        disabled={isUpdatingName}
                        sx={{ WebkitTapHighlightColor: "transparent" }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <Typography variant="subtitle1" sx={{ flexGrow: 1 }} noWrap>
                      {video.displayName || video.originalName}
                    </Typography>
                    <Tooltip title="Редактировать название">
                      <IconButton
                        size="small"
                        onClick={() => startEditing(video)}
                        sx={{ WebkitTapHighlightColor: "transparent", minWidth: "32px", minHeight: "32px" }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
                {isAdmin && video.trainer && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Владелец: {video.trainer.fullName || video.trainer.username}
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary">
                  Размер: {formatFileSize(video.fileSize)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Загружено: {formatRuDate(video.createdAt)}
                </Typography>

                <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                  <Tooltip title="Удалить видео">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => openDeleteDialog(video)}
                      sx={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Box>

      {/* Диалог подтверждения удаления */}
      <Dialog
        open={deleteDialogOpen}
        onClose={closeDeleteDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Удалить видео?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Вы уверены, что хотите удалить видео <strong>{videoToDelete?.originalName}</strong>?
            <br />
            Файл будет удалён из CDN и базы данных. Это действие необратимо.
          </DialogContentText>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteDialog} disabled={isPending}>
            Отмена
          </Button>
          <Button
            onClick={confirmDelete}
            color="error"
            variant="contained"
            disabled={isPending}
          >
            {isPending ? "Удаление..." : "Удалить"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
