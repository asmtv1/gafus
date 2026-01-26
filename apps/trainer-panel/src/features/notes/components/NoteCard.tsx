"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
} from "@/utils/muiImports";
import { DialogContentText } from "@mui/material";
import { Edit, Delete, Visibility, VisibilityOff } from "@mui/icons-material";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { TrainerNote } from "../types";
import type { ActionResult } from "@gafus/types";

interface NoteCardProps {
  note: TrainerNote;
  onEdit: (note: TrainerNote) => void;
  onDelete: (noteId: string) => Promise<ActionResult>;
}

export default function NoteCard({ note, onEdit, onDelete }: NoteCardProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
    setDeleteError(null);
  };

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const result = await onDelete(note.id);
      if (result.success) {
        setDeleteDialogOpen(false);
      } else {
        setDeleteError(result.error || "Ошибка при удалении заметки");
      }
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Неизвестная ошибка");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setDeleteError(null);
  };

  return (
    <>
      <Card
        sx={{
          mb: 2,
          transition: "all 0.2s ease-in-out",
          "&:hover": {
            boxShadow: 4,
            transform: "translateY(-2px)",
          },
          borderLeft: "4px solid",
          borderLeftColor: "primary.main",
        }}
      >
        <CardContent sx={{ p: 3 }}>
          {/* Заголовок и метаданные */}
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
            <Box sx={{ flex: 1 }}>
              {note.title && (
                <Typography
                  variant="h6"
                  component="div"
                  sx={{
                    mb: 1,
                    fontWeight: 600,
                    color: "text.primary",
                  }}
                >
                  {note.title}
                </Typography>
              )}
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                  {note.students.map((student, index) => (
                    <Typography key={student.id} variant="subtitle2" color="text.secondary">
                      {student.username}
                      {student.profile?.fullName && ` (${student.profile.fullName})`}
                      {index < note.students.length - 1 && ","}
                    </Typography>
                  ))}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  • Создано: {format(new Date(note.createdAt), "d MMMM yyyy, HH:mm", { locale: ru })}
                </Typography>
              </Box>
              {/* Теги */}
              {note.tags && note.tags.length > 0 && (
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 1 }}>
                  {note.tags.map((tag, index) => (
                    <Chip
                      key={index}
                      label={tag}
                      size="small"
                      variant="outlined"
                      sx={{
                        fontSize: "0.75rem",
                        height: "24px",
                      }}
                    />
                  ))}
                </Box>
              )}
            </Box>
            <Box sx={{ display: "flex", gap: 0.5, alignItems: "flex-start", ml: 2 }}>
              <IconButton
                size="small"
                onClick={() => onEdit(note)}
                aria-label="Редактировать заметку"
              >
                <Edit fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={handleDeleteClick}
                aria-label="Удалить заметку"
                color="error"
              >
                <Delete fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          {/* Содержимое заметки - текстовые записи */}
          {note.entries && note.entries.length > 0 ? (
            <Box sx={{ pt: note.title ? 0 : 1 }}>
              {note.entries.map((entry, index) => (
                <Box
                  key={entry.id || index}
                  sx={{
                    mb: 2,
                    pb: 2,
                    borderBottom: index < note.entries.length - 1 ? "1px solid" : "none",
                    borderColor: "divider",
                    borderLeft: "3px solid",
                    borderLeftColor: entry.isVisibleToStudent ? "success.main" : "transparent",
                    pl: 2,
                  }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                    <Chip
                      icon={entry.isVisibleToStudent ? <Visibility /> : <VisibilityOff />}
                      label={entry.isVisibleToStudent ? "Видна ученику" : "Скрыта"}
                      size="small"
                      color={entry.isVisibleToStudent ? "success" : "default"}
                      sx={{ fontSize: "0.7rem" }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      Создано: {format(new Date(entry.createdAt), "d MMMM yyyy, HH:mm", { locale: ru })}
                      {new Date(entry.updatedAt).getTime() !== new Date(entry.createdAt).getTime() && (
                        <> • Изменено: {format(new Date(entry.updatedAt), "d MMMM yyyy, HH:mm", { locale: ru })}</>
                      )}
                    </Typography>
                  </Box>
                  <Typography
                    variant="body1"
                    sx={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      lineHeight: 1.6,
                      color: "text.primary",
                    }}
                  >
                    {entry.content}
                  </Typography>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ pt: note.title ? 0 : 1, fontStyle: "italic" }}
            >
              Нет текстовых записей
            </Typography>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">Подтверждение удаления</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Вы уверены, что хотите удалить эту заметку? Это действие нельзя отменить.
          </DialogContentText>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={isDeleting}>
            Отмена
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" disabled={isDeleting} variant="contained">
            {isDeleting ? "Удаление..." : "Удалить"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
