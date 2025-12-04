"use client";

import { FilterList, Clear, Delete as DeleteIcon } from "@mui/icons-material";
import {
  Card,
  CardContent,
  TextField,
  Button,
  Box,
  Chip,
  Typography,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Alert,
  CircularProgress,
} from "@mui/material";
import { useFilters } from "@shared/contexts/FilterContext";
import { useRouter } from "next/navigation";
import { useState, useEffect, useTransition } from "react";
import { deleteAllErrors } from "@shared/lib/actions/deleteAllErrors";
import { useErrorsMutation } from "@shared/hooks/useErrors";

export default function ErrorFilters() {
  const router = useRouter();
  const { filters, setFilters } = useFilters();
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { invalidateErrors } = useErrorsMutation();

  const [localFilters, setLocalFilters] = useState({
    app: filters.appName || "",
    environment: filters.environment || "",
  });

  // Синхронизируем локальные фильтры с контекстом
  useEffect(() => {
    setLocalFilters({
      app: filters.appName || "",
      environment: filters.environment || "",
    });
  }, [filters]);

  const handleFilterChange = (field: string, value: string) => {
    const newLocalFilters = { ...localFilters, [field]: value };
    setLocalFilters(newLocalFilters);

    // Обновляем контекст
    const newFilters = {
      appName: newLocalFilters.app || undefined,
      environment: newLocalFilters.environment || undefined,
    };
    setFilters(newFilters);

    // Обновляем URL без перезагрузки страницы
    const params = new URLSearchParams();
    if (newLocalFilters.app) params.set("app", newLocalFilters.app);
    if (newLocalFilters.environment) params.set("env", newLocalFilters.environment);

    const newUrl = params.toString() ? `/?${params.toString()}` : "/";
    router.push(newUrl, { scroll: false });
  };

  const clearFilters = () => {
    setLocalFilters({ app: "", environment: "" });
    setFilters({});
    router.push("/", { scroll: false });
  };

  const hasActiveFilters = localFilters.app || localFilters.environment;

  const handleDeleteAllErrors = () => {
    setIsDeleteAllDialogOpen(true);
    setDeleteAllError(null);
  };

  const handleConfirmDeleteAll = () => {
    setIsDeleteAllDialogOpen(false);
    startTransition(async () => {
      try {
        const result = await deleteAllErrors();
        
        if (result.success) {
          // Инвалидируем все варианты кэша ошибок для обновления списка
          invalidateErrors();
          setDeleteAllError(null);
        } else {
          setDeleteAllError(result.error || 'Не удалось удалить все ошибки');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка при удалении';
        setDeleteAllError(errorMessage);
      }
    });
  };

  const handleCancelDeleteAll = () => {
    setIsDeleteAllDialogOpen(false);
    setDeleteAllError(null);
  };

  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center">
            <FilterList sx={{ mr: 1 }} />
            <Typography variant="h6">Фильтры</Typography>
          </Box>
          
          <Box display="flex" alignItems="center" gap={1}>
            <Tooltip title="Удалить все ошибки">
              <span>
                <IconButton
                  color="error"
                  size="small"
                  onClick={handleDeleteAllErrors}
                  disabled={isPending}
                >
                  {isPending ? <CircularProgress size={20} /> : <DeleteIcon />}
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(3, 1fr)",
            },
          }}
        >
          <Box>
            <TextField
              fullWidth
              label="Приложение"
              value={localFilters.app}
              onChange={(e) => handleFilterChange("app", e.target.value)}
              placeholder="web, trainer-panel..."
            />
          </Box>

          <Box>
            <TextField
              fullWidth
              label="Окружение"
              value={localFilters.environment}
              onChange={(e) => handleFilterChange("environment", e.target.value)}
              placeholder="production, development..."
            />
          </Box>

          <Box display="flex" gap={1} alignItems="center" height="100%">
            <Button
              variant="outlined"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              startIcon={<Clear />}
              fullWidth
            >
              Очистить
            </Button>
          </Box>
        </Box>

        {hasActiveFilters && (
          <Box mt={2} display="flex" gap={1} flexWrap="wrap">
            <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
              Активные фильтры:
            </Typography>
            {localFilters.app && (
              <Chip
                label={`Приложение: ${localFilters.app}`}
                onDelete={() => handleFilterChange("app", "")}
                size="small"
                color="primary"
              />
            )}
            {localFilters.environment && (
              <Chip
                label={`Окружение: ${localFilters.environment}`}
                onDelete={() => handleFilterChange("environment", "")}
                size="small"
                color="primary"
              />
            )}
          </Box>
        )}
      </CardContent>

      {/* Диалог подтверждения удаления всех ошибок */}
      <Dialog
        open={isDeleteAllDialogOpen}
        onClose={handleCancelDeleteAll}
        aria-labelledby="delete-all-dialog-title"
        aria-describedby="delete-all-dialog-description"
      >
        <DialogTitle id="delete-all-dialog-title">
          Удалить все ошибки?
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-all-dialog-description">
            Вы уверены, что хотите удалить все ошибки? Это действие нельзя отменить.
            Все логи ошибок будут безвозвратно удалены из системы.
          </DialogContentText>
          {deleteAllError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteAllError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDeleteAll} disabled={isPending}>
            Отмена
          </Button>
          <Button
            onClick={handleConfirmDeleteAll}
            color="error"
            variant="contained"
            disabled={isPending}
            startIcon={isPending ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {isPending ? 'Удаление...' : 'Удалить все'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
