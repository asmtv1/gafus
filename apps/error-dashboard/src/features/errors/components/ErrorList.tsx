"use client";

import { BugReport, CheckCircle, Delete, Visibility } from "@mui/icons-material";
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Alert,
  Card,
  CardContent,
} from "@mui/material";
import { DataGrid, GridActionsCellItem } from "@mui/x-data-grid";
import { resolveError, deleteError } from "@shared/lib/actions/errors";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useState, useEffect } from "react";

import type { ErrorDashboardReport, ErrorListProps } from "@gafus/types";
import type { GridColDef } from "@mui/x-data-grid";

export default function ErrorList({ errors }: ErrorListProps) {
  const [selectedError, setSelectedError] = useState<ErrorDashboardReport | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isResolveDialogOpen, setIsResolveDialogOpen] = useState(false);
  const [resolveNote, setResolveNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleResolve = async () => {
    if (!selectedError) return;

    setLoading(true);
    setError(null);

    try {
      const result = await resolveError(selectedError.id, `admin-${Date.now()}`);
      if (result.success) {
        setIsResolveDialogOpen(false);
        setSelectedError(null);
        setResolveNote("");
        // Перезагружаем страницу для обновления данных
        window.location.reload();
      } else {
        setError(result.error || "Не удалось разрешить ошибку");
      }
    } catch {
      setError("Произошла ошибка при разрешении");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await deleteError(id);
      if (result.success) {
        // Перезагружаем страницу для обновления данных
        window.location.reload();
      } else {
        setError(result.error || "Не удалось удалить ошибку");
      }
    } catch {
      setError("Произошла ошибка при удалении");
    } finally {
      setLoading(false);
    }
  };

  const columns: GridColDef[] = [
    {
      field: "message",
      headerName: "Сообщение",
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <Box>
          <Typography variant="body2" noWrap>
            {params.value || "Нет сообщения"}
          </Typography>
        </Box>
      ),
    },
    {
      field: "appName",
      headerName: "Приложение",
      width: 120,
      renderCell: (params) => (
        <Chip
          label={params.value || "Неизвестно"}
          size="small"
          color="primary"
          variant="outlined"
        />
      ),
    },
    {
      field: "environment",
      headerName: "Окружение",
      width: 120,
      renderCell: (params) => (
        <Chip
          label={params.value || "Неизвестно"}
          size="small"
          color={params.value === "production" ? "error" : "warning"}
        />
      ),
    },
    {
      field: "createdAt",
      headerName: "Время",
      width: 150,
      valueFormatter: (params) => {
        const value = (params as { value?: string | number | Date }).value;
        if (!value) return "";
        try {
          const date = new Date(value);
          if (isNaN(date.getTime())) return "";
          return format(date, "dd.MM.yyyy HH:mm", { locale: ru });
        } catch (error) {
          console.error("Error formatting date:", value, error);
          return "";
        }
      },
    },
    {
      field: "resolved",
      headerName: "Статус",
      width: 120,
      renderCell: (params) => (
        <Chip
          label={params.value ? "Разрешена" : "Неразрешена"}
          color={params.value ? "success" : "error"}
          size="small"
        />
      ),
    },
    {
      field: "tags",
      headerName: "Теги",
      width: 150,
      renderCell: (params) => {
        const tags = params.value || [];
        return (
          <Box display="flex" gap={0.5} flexWrap="wrap">
            {tags.slice(0, 2).map((tag: string, index: number) => (
              <Chip key={index} label={tag} size="small" variant="outlined" />
            ))}
            {tags.length > 2 && (
              <Chip label={`+${tags.length - 2}`} size="small" variant="outlined" />
            )}
          </Box>
        );
      },
    },
    {
      field: "actions",
      type: "actions",
      headerName: "Действия",
      width: 120,
      getActions: (params) => {
        const actions = [
          <GridActionsCellItem
            key="view"
            icon={<Visibility />}
            label="Просмотр"
            onClick={() => {
              setSelectedError(params.row);
              setIsDetailDialogOpen(true);
            }}
          />,
          <GridActionsCellItem
            key="delete"
            icon={<Delete />}
            label="Удалить"
            onClick={() => handleDelete(params.id as string)}
          />,
        ];

        if (!params.row.resolved) {
          actions.splice(
            1,
            0,
            <GridActionsCellItem
              key="resolve"
              icon={<CheckCircle />}
              label="Разрешить"
              onClick={() => {
                setSelectedError(params.row);
                setIsResolveDialogOpen(true);
              }}
            />,
          );
        }

        return actions;
      },
    },
  ];

  return (
    <>
      <Card>
        <CardContent>
          <Box display="flex" alignItems="center" mb={2}>
            <BugReport sx={{ mr: 1 }} />
            <Typography variant="h6">Список ошибок</Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box sx={{ height: 600, width: "100%" }}>
            {isMounted ? (
              <DataGrid
                rows={errors}
                columns={columns}
                pageSizeOptions={[10, 25, 50]}
                initialState={{
                  pagination: {
                    paginationModel: { page: 0, pageSize: 25 },
                  },
                }}
                disableRowSelectionOnClick
                getRowClassName={(params) =>
                  params.row.resolved ? "resolved-row" : "unresolved-row"
                }
              />
            ) : (
              <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                <Typography>Загрузка...</Typography>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Диалог деталей ошибки */}
      <Dialog
        open={isDetailDialogOpen}
        onClose={() => setIsDetailDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Детали ошибки</DialogTitle>
        <DialogContent>
          {selectedError && (
            <Box>
              <Typography variant="h6" gutterBottom>
                {selectedError.message}
              </Typography>

              <Box display="flex" gap={1} mb={2}>
                <Chip label={selectedError.appName} color="primary" />
                <Chip
                  label={selectedError.environment}
                  color={selectedError.environment === "production" ? "error" : "warning"}
                />
                <Chip
                  label={selectedError.resolved ? "Разрешена" : "Неразрешена"}
                  color={selectedError.resolved ? "success" : "error"}
                />
              </Box>

              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>URL:</strong> {selectedError.url}
              </Typography>

              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>User Agent:</strong> {selectedError.userAgent}
              </Typography>

              {selectedError.userId && (
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>User ID:</strong> {selectedError.userId}
                </Typography>
              )}

              {selectedError.stack && (
                <Box mt={2}>
                  <Typography variant="subtitle2" gutterBottom>
                    Stack Trace:
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      backgroundColor: "grey.100",
                      p: 2,
                      borderRadius: 1,
                      fontSize: "0.875rem",
                      overflow: "auto",
                      maxHeight: 200,
                    }}
                  >
                    {selectedError.stack}
                  </Box>
                </Box>
              )}

              {selectedError.componentStack && (
                <Box mt={2}>
                  <Typography variant="subtitle2" gutterBottom>
                    Component Stack:
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      backgroundColor: "grey.100",
                      p: 2,
                      borderRadius: 1,
                      fontSize: "0.875rem",
                      overflow: "auto",
                      maxHeight: 200,
                    }}
                  >
                    {selectedError.componentStack}
                  </Box>
                </Box>
              )}

              {selectedError.additionalContext != null && (
                <Box mt={2}>
                  <Typography variant="subtitle2" gutterBottom>
                    Дополнительный контекст:
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      backgroundColor: "grey.100",
                      p: 2,
                      borderRadius: 1,
                      fontSize: "0.875rem",
                      overflow: "auto",
                      maxHeight: 200,
                    }}
                  >
                    {(() => {
                      const context = selectedError.additionalContext;
                      if (typeof context === "string") {
                        try {
                          const parsed = JSON.parse(context);
                          return JSON.stringify(parsed, null, 2);
                        } catch {
                          return context;
                        }
                      } else if (context && typeof context === "object") {
                        return JSON.stringify(context, null, 2);
                      } else {
                        return String(context);
                      }
                    })()}
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDetailDialogOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      {/* Диалог разрешения ошибки */}
      <Dialog
        open={isResolveDialogOpen}
        onClose={() => setIsResolveDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Разрешить ошибку</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Вы уверены, что хотите отметить эту ошибку как разрешенную?
          </Typography>

          <TextField
            fullWidth
            label="Примечание (необязательно)"
            multiline
            rows={3}
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsResolveDialogOpen(false)} disabled={loading}>
            Отмена
          </Button>
          <Button
            onClick={handleResolve}
            variant="contained"
            color="success"
            disabled={loading}
            startIcon={<CheckCircle />}
          >
            Разрешить
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
