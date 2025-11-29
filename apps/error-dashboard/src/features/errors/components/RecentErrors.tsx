"use client";

import {
  Card,
  CardContent,
  Typography,
  Box,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Chip,
  IconButton,
  Tooltip,
  Divider,
  CircularProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Tabs,
  Tab,
  Checkbox,
  Paper,
} from "@mui/material";
import {
  BugReport as BugIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  OpenInNew as OpenIcon,
  Person as PersonIcon,
  Computer as ComputerIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
  Download as DownloadIcon,
  SelectAll as SelectAllIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import { useErrors, useErrorsMutation } from "@shared/hooks/useErrors";
import { useFilters } from "@shared/contexts/FilterContext";
import { formatDistanceToNow, format } from "date-fns";
import { ru } from "date-fns/locale";
import { useState } from "react";
import ErrorDetailsModal from "./ErrorDetailsModal";
import { Snackbar } from "@mui/material";
import { Alert } from "@mui/material";
import type { ErrorDashboardReport } from "@gafus/types";

/**
 * Форматирует ошибку в Markdown для AI-анализа
 */
function formatErrorForAI(error: ErrorDashboardReport): string {
  const lines: string[] = [];
  
  lines.push(`# Ошибка: ${error.message}`);
  lines.push('');
  lines.push(`**ID:** \`${error.id}\``);
  lines.push(`**Приложение:** ${error.appName}`);
  lines.push(`**Окружение:** ${error.environment}`);
  lines.push(`**Дата:** ${format(new Date(error.createdAt), 'dd.MM.yyyy HH:mm:ss', { locale: ru })}`);
  lines.push(`**URL:** ${error.url}`);
  lines.push(`**Статус:** ${error.resolved ? '✅ Решено' : '❌ Не решено'}`);
  
  if (error.userId) {
    lines.push(`**User ID:** \`${error.userId}\``);
  }
  
  if (error.stack) {
    lines.push('');
    lines.push('## Stack Trace');
    lines.push('```');
    lines.push(error.stack);
    lines.push('```');
  }
  
  if (error.additionalContext) {
    lines.push('');
    lines.push('## Дополнительный контекст');
    lines.push('```json');
    lines.push(JSON.stringify(error.additionalContext, null, 2));
    lines.push('```');
  }
  
  if (error.tags && error.tags.length > 0) {
    lines.push('');
    lines.push(`## Теги`);
    lines.push(error.tags.map(tag => `- ${tag}`).join('\n'));
  }
  
  return lines.join('\n');
}

/**
 * Форматирует несколько ошибок для AI
 */
function formatMultipleErrorsForAI(errors: ErrorDashboardReport[]): string {
  const header = `# Экспорт ошибок (${errors.length})\n\nДата экспорта: ${format(new Date(), 'dd.MM.yyyy HH:mm:ss', { locale: ru })}\n\n---\n\n`;
  const body = errors.map(error => formatErrorForAI(error)).join('\n\n---\n\n');
  return header + body;
}

interface RecentErrorItemProps {
  error: {
    id: string;
    message: string;
    appName: string;
    environment: string;
    createdAt: Date;
    resolved: boolean;
    userId?: string | null;
    url: string;
    stack?: string | null;
  };
  onViewDetails: () => void;
  onResolveSuccess: (message: string) => void;
  onResolveError: (message: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  selectionMode?: boolean;
}

function RecentErrorItem({ error, onViewDetails, onResolveSuccess, onResolveError, isSelected, onToggleSelect, selectionMode }: RecentErrorItemProps) {
  const { resolveError, unresolveError } = useErrorsMutation();
  const [isResolving, setIsResolving] = useState(false);
  const getSeverityIcon = (message: string) => {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('critical') || lowerMessage.includes('fatal')) {
      return <ErrorIcon />;
    } else if (lowerMessage.includes('warning') || lowerMessage.includes('deprecated')) {
      return <WarningIcon />;
    }
    return <BugIcon />;
  };

  const getSeverityColor = (message: string) => {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('critical') || lowerMessage.includes('fatal')) {
      return '#f48fb1';
    } else if (lowerMessage.includes('warning') || lowerMessage.includes('deprecated')) {
      return '#ffb74d';
    }
    return '#7986cb';
  };

  const getAppColor = (appName: string) => {
    const colors = {
      'web': '#7986cb',
      'trainer-panel': '#81c784',
      'telegram-bot': '#ba68c8',
      'error-dashboard': '#ffb74d',
      'bull-board': '#f48fb1'
    };
    return colors[appName as keyof typeof colors] || '#90a4ae';
  };

  const truncateMessage = (message: string, maxLength: number = 80) => {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  };

  const timeAgo = formatDistanceToNow(new Date(error.createdAt), { 
    addSuffix: true, 
    locale: ru 
  });

  const handleResolve = async () => {
    if (isResolving) return;
    
    setIsResolving(true);
    try {
      if (error.resolved) {
        const result = await unresolveError(error.id);
        onResolveSuccess(result.message || "Ошибка помечена как не решенная");
      } else {
        const result = await resolveError(error.id);
        onResolveSuccess(result.message || "Ошибка помечена как решенная");
      }
    } catch (error) {
      console.error("Failed to resolve error:", error);
      onResolveError("Не удалось изменить статус ошибки");
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <ListItem
      sx={{
        borderRadius: 2,
        mb: 1,
        bgcolor: isSelected ? 'action.selected' : 'background.paper',
        border: '1px solid',
        borderColor: isSelected ? '#667eea' : (error.resolved ? '#c8e6c9' : '#ffcdd2'),
        opacity: error.resolved ? 0.8 : 1,
        transition: 'all 0.2s ease',
        '&:hover': {
          transform: 'translateX(2px)',
          boxShadow: 1,
          borderColor: isSelected ? '#5a67d8' : (error.resolved ? '#a5d6a7' : '#ef9a9a'),
        }
      }}
    >
      {selectionMode && (
        <Checkbox
          checked={isSelected}
          onChange={() => onToggleSelect?.(error.id)}
          sx={{ mr: 1 }}
        />
      )}
      <ListItemAvatar>
        <Avatar
          sx={{
            bgcolor: getSeverityColor(error.message),
            width: 40,
            height: 40,
          }}
        >
          {getSeverityIcon(error.message)}
        </Avatar>
      </ListItemAvatar>

      <ListItemText
        primary={
          <Box component="span" display="flex" alignItems="center" gap={1} mb={0.5}>
            <Typography variant="body2" fontWeight="medium" sx={{ flex: 1 }}>
              {truncateMessage(error.message)}
            </Typography>
            
            <Box component="span" display="flex" alignItems="center" gap={0.5}>
              {error.resolved && (
                <Chip
                  icon={<CheckIcon />}
                  label="Решено"
                  size="small"
                  color="success"
                  variant="outlined"
                />
              )}
              
              <Chip
                label={error.appName}
                size="small"
                sx={{
                  bgcolor: `${getAppColor(error.appName)}15`,
                  color: getAppColor(error.appName),
                  fontWeight: 'bold',
                  border: `1px solid ${getAppColor(error.appName)}30`
                }}
              />
            </Box>
          </Box>
        }
        secondary={
          <Box component="span">
            <Box component="span" display="flex" alignItems="center" gap={2} mb={0.5}>
              <Box component="span" display="flex" alignItems="center" gap={0.5}>
                <ComputerIcon fontSize="small" color="action" />
                <Typography variant="caption" color="text.secondary">
                  {error.environment}
                </Typography>
              </Box>
              
              {error.userId && (
                <Box component="span" display="flex" alignItems="center" gap={0.5}>
                  <PersonIcon fontSize="small" color="action" />
                  <Typography variant="caption" color="text.secondary">
                    Пользователь
                  </Typography>
                </Box>
              )}
              
              <Typography variant="caption" color="text.secondary">
                {timeAgo}
              </Typography>
            </Box>
            
            {error.url && (
              <Typography 
                variant="caption" 
                color="text.secondary"
                sx={{ 
                  display: 'block',
                  fontFamily: 'monospace',
                  fontSize: '0.7rem'
                }}
              >
                {error.url.length > 50 ? `...${error.url.slice(-47)}` : error.url}
              </Typography>
            )}
          </Box>
        }
      />

      <Box display="flex" alignItems="center" gap={0.5}>
        <Tooltip title="Подробнее">
          <IconButton size="small" onClick={onViewDetails} color="primary">
            <ViewIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title={error.resolved ? "Пометить как не решенную" : "Пометить как решенную"}>
          <IconButton 
            size="small" 
            onClick={handleResolve} 
            color={error.resolved ? "warning" : "success"}
            disabled={isResolving}
          >
            <CheckIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        
        <Tooltip title="Открыть URL">
          <IconButton size="small" onClick={() => window.open(error.url, '_blank')} color="info">
            <OpenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </ListItem>
  );
}

export default function RecentErrors() {
  const [tabValue, setTabValue] = useState<"errors" | "logs">("errors");
  const { filters } = useFilters();
  const { data: errors, error, isLoading, refetch } = useErrors({ 
    ...filters,
    limit: 50,
    offset: 0,
    type: tabValue
  });
  const { deleteAll } = useErrorsMutation();
  const [showAll, setShowAll] = useState(false);
  const [selectedError, setSelectedError] = useState<ErrorDashboardReport | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });
  
  // Batch selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleTabChange = (_event: React.SyntheticEvent, newValue: "errors" | "logs") => {
    setTabValue(newValue);
    setShowAll(false);
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!errors) return;
    const displayedErrors = showAll ? errors : errors.slice(0, 20);
    if (selectedIds.size === displayedErrors.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedErrors.map(e => e.id)));
    }
  };

  const handleCancelSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleCopySelectedForAI = async () => {
    if (!errors) return;
    const selectedErrors = errors.filter(e => selectedIds.has(e.id));
    if (selectedErrors.length === 0) return;

    try {
      const markdown = formatMultipleErrorsForAI(selectedErrors);
      await navigator.clipboard.writeText(markdown);
      setSnackbar({ 
        open: true, 
        message: `Скопировано ${selectedErrors.length} ошибок для AI`, 
        severity: 'success' 
      });
      handleCancelSelection();
    } catch (err) {
      console.error('Failed to copy:', err);
      setSnackbar({ open: true, message: 'Не удалось скопировать', severity: 'error' });
    }
  };

  const handleDownloadSelectedJSON = () => {
    if (!errors) return;
    const selectedErrors = errors.filter(e => selectedIds.has(e.id));
    if (selectedErrors.length === 0) return;

    try {
      const json = JSON.stringify({
        exportedAt: new Date().toISOString(),
        count: selectedErrors.length,
        errors: selectedErrors,
      }, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `errors-export-${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSnackbar({ 
        open: true, 
        message: `Экспортировано ${selectedErrors.length} ошибок в JSON`, 
        severity: 'success' 
      });
      handleCancelSelection();
    } catch (err) {
      console.error('Failed to download:', err);
      setSnackbar({ open: true, message: 'Не удалось скачать файл', severity: 'error' });
    }
  };

  const handleDownloadSelectedMarkdown = () => {
    if (!errors) return;
    const selectedErrors = errors.filter(e => selectedIds.has(e.id));
    if (selectedErrors.length === 0) return;

    try {
      const markdown = formatMultipleErrorsForAI(selectedErrors);
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `errors-export-${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSnackbar({ 
        open: true, 
        message: `Экспортировано ${selectedErrors.length} ошибок в Markdown`, 
        severity: 'success' 
      });
      handleCancelSelection();
    } catch (err) {
      console.error('Failed to download:', err);
      setSnackbar({ open: true, message: 'Не удалось скачать файл', severity: 'error' });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" height={200}>
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
          <Alert 
            severity="error"
            action={
              <IconButton color="inherit" size="small" onClick={() => refetch()}>
                <RefreshIcon />
              </IconButton>
            }
          >
            Ошибка загрузки: {error.message}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!errors || errors.length === 0) {
    return (
      <Card>
        <CardContent>
          <Alert severity="info">
            {tabValue === "errors" ? "Нет недавних ошибок" : "Нет недавних логов"}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const displayedErrors = showAll ? errors : errors.slice(0, 20);

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteAll();
      setDeleteDialogOpen(false);
      setSnackbar({ 
        open: true, 
        message: result.message || "Все ошибки успешно удалены", 
        severity: 'success' 
      });
      refetch();
    } catch (error) {
      console.error("Failed to delete all errors:", error);
      setSnackbar({ 
        open: true, 
        message: "Не удалось удалить все ошибки", 
        severity: 'error' 
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card elevation={2}>
      <CardContent sx={{ p: 3 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="h5" component="h3" fontWeight="bold">
            {tabValue === "errors" ? "Список ошибок" : "Список логов"}
          </Typography>
          
          <Box display="flex" alignItems="center" gap={1}>
            <Tooltip title={selectionMode ? "Отменить выбор" : "Выбрать для экспорта"}>
              <IconButton 
                color={selectionMode ? "secondary" : "default"}
                size="small" 
                onClick={() => selectionMode ? handleCancelSelection() : setSelectionMode(true)}
                disabled={!errors || errors.length === 0}
              >
                {selectionMode ? <CloseIcon /> : <SelectAllIcon />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Обновить список">
              <IconButton color="primary" size="small" onClick={() => refetch()}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={`Очистить все ${tabValue === "errors" ? "ошибки" : "логи"}`}>
              <IconButton 
                color="error" 
                size="small" 
                onClick={() => setDeleteDialogOpen(true)}
                disabled={!errors || errors.length === 0}
              >
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Selection toolbar */}
        {selectionMode && (
          <Paper 
            elevation={3} 
            sx={{ 
              p: 2, 
              mb: 2, 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              borderRadius: 2,
            }}
          >
            <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
              <Box display="flex" alignItems="center" gap={2}>
                <Checkbox
                  checked={errors ? selectedIds.size === (showAll ? errors : errors.slice(0, 20)).length : false}
                  indeterminate={selectedIds.size > 0 && errors && selectedIds.size < (showAll ? errors : errors.slice(0, 20)).length}
                  onChange={handleSelectAll}
                  sx={{ color: 'white', '&.Mui-checked': { color: 'white' } }}
                />
                <Typography variant="body2">
                  {selectedIds.size > 0 
                    ? `Выбрано: ${selectedIds.size}` 
                    : 'Выберите ошибки для экспорта'}
                </Typography>
              </Box>
              
              <Box display="flex" alignItems="center" gap={1}>
                <Tooltip title="Копировать для AI (Markdown)">
                  <span>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<CopyIcon />}
                      onClick={handleCopySelectedForAI}
                      disabled={selectedIds.size === 0}
                      sx={{ 
                        bgcolor: 'rgba(255,255,255,0.2)', 
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' },
                        textTransform: 'none',
                      }}
                    >
                      Для AI
                    </Button>
                  </span>
                </Tooltip>
                
                <Tooltip title="Скачать как JSON">
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<DownloadIcon />}
                      onClick={handleDownloadSelectedJSON}
                      disabled={selectedIds.size === 0}
                      sx={{ 
                        color: 'white', 
                        borderColor: 'rgba(255,255,255,0.5)',
                        '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' },
                        textTransform: 'none',
                      }}
                    >
                      JSON
                    </Button>
                  </span>
                </Tooltip>
                
                <Tooltip title="Скачать как Markdown">
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<DownloadIcon />}
                      onClick={handleDownloadSelectedMarkdown}
                      disabled={selectedIds.size === 0}
                      sx={{ 
                        color: 'white', 
                        borderColor: 'rgba(255,255,255,0.5)',
                        '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' },
                        textTransform: 'none',
                      }}
                    >
                      MD
                    </Button>
                  </span>
                </Tooltip>
              </Box>
            </Box>
          </Paper>
        )}

        <Tabs 
          value={tabValue} 
          onChange={handleTabChange}
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Ошибки" value="errors" />
          <Tab label="Логи" value="logs" />
        </Tabs>

        <List sx={{ p: 0 }}>
          {displayedErrors.map((err, index) => (
            <Box key={err.id}>
              <RecentErrorItem 
                error={err} 
                onViewDetails={() => setSelectedError(err)}
                onResolveSuccess={(message) => {
                  setSnackbar({ open: true, message, severity: 'success' });
                }}
                onResolveError={(message) => {
                  setSnackbar({ open: true, message, severity: 'error' });
                }}
                selectionMode={selectionMode}
                isSelected={selectedIds.has(err.id)}
                onToggleSelect={handleToggleSelect}
              />
              {index < displayedErrors.length - 1 && <Divider sx={{ my: 1 }} />}
            </Box>
          ))}
        </List>

        {errors.length > 20 && (
          <Box mt={2} textAlign="center">
            <Button
              variant="outlined"
              size="small"
              onClick={() => setShowAll(!showAll)}
              sx={{ textTransform: 'none' }}
            >
              {showAll ? 'Показать меньше' : `Показать все (${errors.length})`}
            </Button>
          </Box>
        )}
      </CardContent>

      {/* Модальное окно с деталями ошибки */}
      <ErrorDetailsModal
        open={!!selectedError}
        onClose={() => setSelectedError(null)}
        error={selectedError}
      />

      {/* Диалог подтверждения удаления */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => !isDeleting && setDeleteDialogOpen(false)}
      >
        <DialogTitle>Подтверждение удаления</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Вы уверены, что хотите удалить все {tabValue === "errors" ? "ошибки" : "логи"} из базы данных? 
            Это действие нельзя отменить.
            {errors && errors.length > 0 && (
              <Box component="span" display="block" mt={1} fontWeight="bold">
                Будет удалено {tabValue === "errors" ? "ошибок" : "логов"}: {errors.length}
              </Box>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setDeleteDialogOpen(false)} 
            disabled={isDeleting}
          >
            Отмена
          </Button>
          <Button 
            onClick={handleDeleteAll} 
            color="error" 
            variant="contained"
            disabled={isDeleting}
            startIcon={isDeleting ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {isDeleting ? 'Удаление...' : 'Удалить все'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar для уведомлений */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Card>
  );
}

// Skeleton компонент для Suspense
RecentErrors.Skeleton = function RecentErrorsSkeleton() {
  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="center" alignItems="center" height={200}>
          <CircularProgress />
        </Box>
      </CardContent>
    </Card>
  );
};
