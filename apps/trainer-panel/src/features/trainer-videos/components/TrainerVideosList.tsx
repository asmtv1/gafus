"use client";

import { useState, useTransition, useActionState, useEffect, useRef } from "react";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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

import { getCDNUrl } from "@gafus/cdn-upload";
import { deleteTrainerVideo } from "../lib/deleteTrainerVideo";
import { updateTrainerVideoName } from "../lib/updateTrainerVideoName";

import { formatFileSize, formatRuDate } from "../lib/format";
import type { TrainerVideoViewModel } from "../types";
import type { ActionResult } from "@gafus/types";

interface TrainerVideosListProps {
  videos: TrainerVideoViewModel[];
  onVideoDeleted?: (videoId: string) => void;
  onVideoUpdated?: (videoId: string, displayName: string | null) => void;
}

export default function TrainerVideosList({ videos, onVideoDeleted, onVideoUpdated }: TrainerVideosListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
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

  const handleCopy = async (videoId: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(videoId);
      setTimeout(() => setCopiedId((current) => (current === videoId ? null : current)), 1500);
    } catch (copyError) {
      console.error("Не удалось скопировать ссылку:", copyError);
    }
  };

  const handleOpen = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openDeleteDialog = (video: TrainerVideoViewModel) => {
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

    const formData = new FormData();
    formData.append("videoId", videoToDelete.id);

    startTransition(() => {
      deleteAction(formData);
    });
  };

  // Обрабатываем результат удаления
  useEffect(() => {
    if (deleteState.success && videoToDelete && deleteDialogOpen) {
      onVideoDeleted?.(videoToDelete.id);
      setDeleteDialogOpen(false);
      setVideoToDelete(null);
      setError(null);
    } else if (deleteState.error && deleteDialogOpen) {
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
          const cdnUrl = getCDNUrl(video.relativePath);
          const isCopied = copiedId === video.id;

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
              <Box
                component="video"
                src={cdnUrl}
                controls
                preload="metadata"
                sx={{ width: "100%", height: 220, borderTopLeftRadius: 8, borderTopRightRadius: 8 }}
              >
                <source src={cdnUrl} type={video.mimeType} />
                Ваш браузер не поддерживает видео.
              </Box>
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
                <Typography variant="body2" color="text.secondary">
                  Размер: {formatFileSize(video.fileSize)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Загружено: {formatRuDate(video.createdAt)}
                </Typography>

                <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                  <Tooltip title={isCopied ? "Скопировано" : "Скопировать ссылку"}>
                    <IconButton
                      size="small"
                      onClick={() => handleCopy(video.id, cdnUrl)}
                      sx={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Открыть в новой вкладке">
                    <IconButton
                      size="small"
                      onClick={() => handleOpen(cdnUrl)}
                      sx={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      <OpenInNewIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
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
