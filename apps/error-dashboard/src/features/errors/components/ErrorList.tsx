"use client";

import { BugReport, Visibility } from "@mui/icons-material";
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Alert,
  CircularProgress,
  Card,
  CardContent,
} from "@mui/material";
import { DataGrid, GridActionsCellItem } from "@mui/x-data-grid";
import { useErrors } from "@shared/hooks/useErrors";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useState } from "react";

import type { ErrorDashboardReport } from "@gafus/types";
import type { GridColDef } from "@mui/x-data-grid";

interface ErrorListProps {
  filters?: {
    appName?: string;
    environment?: string;
  };
}

export default function ErrorList({ filters = {} }: ErrorListProps) {
  // Используем TanStack Query для загрузки ошибок
  const { data: errors, error, isLoading } = useErrors({
    ...filters,
    type: "errors" as const,
  });

  // Вспомогательная функция для проверки additionalContext
  const hasAdditionalContext = (error: ErrorDashboardReport): boolean => {
    try {
      const context = error.additionalContext;
      if (typeof context === "string") {
        return context.trim().length > 0;
      }
      return context !== null && context !== undefined;
    } catch {
      return false;
    }
  };

  const [selectedError, setSelectedError] = useState<ErrorDashboardReport | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  // Логи теперь в Loki, удаление через UI недоступно
  // Для удаления используйте Grafana или Loki API

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
        return [
          <GridActionsCellItem
            key="view"
            icon={<Visibility />}
            label="Просмотр"
            onClick={() => {
              setSelectedError(params.row);
              setIsDetailDialogOpen(true);
            }}
          />,
        ];
      },
    },
  ];

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" height={400}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">Ошибка загрузки данных: {error.message}</Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Box display="flex" alignItems="center">
              <BugReport sx={{ mr: 1 }} />
              <Typography variant="h6">
              Список ошибок
              </Typography>
            </Box>
          </Box>

          <Box sx={{ height: 600, width: "100%" }}>
            <DataGrid
              rows={Array.isArray(errors) ? errors : []}
              columns={columns}
              pageSizeOptions={[10, 25, 50]}
              initialState={{
                pagination: {
                  paginationModel: { page: 0, pageSize: 25 },
                },
              }}
              disableRowSelectionOnClick
              getRowId={(row) => row.id}
            />
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

              {selectedError.componentStack && String(selectedError.componentStack).trim() && (
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
                    {String(selectedError.componentStack || "")}
                  </Box>
                </Box>
              )}

              {hasAdditionalContext(selectedError) && (
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
                      if (typeof selectedError.additionalContext === "string") {
                        try {
                          const parsed = JSON.parse(selectedError.additionalContext);
                          return JSON.stringify(parsed, null, 2);
                        } catch {
                          return selectedError.additionalContext;
                        }
                      } else {
                        return JSON.stringify(selectedError.additionalContext, null, 2);
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
    </>
  );
}
