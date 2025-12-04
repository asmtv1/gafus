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
  Checkbox,
  Paper,
} from "@mui/material";
import {
  BugReport as BugIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  Person as PersonIcon,
  Computer as ComputerIcon,
  ContentCopy as CopyIcon,
  Download as DownloadIcon,
  SelectAll as SelectAllIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import { useErrors, useErrorsMutation } from "@shared/hooks/useErrors";
import { useFilters } from "@shared/contexts/FilterContext";
import { formatDistanceToNow, format } from "date-fns";
import { ru } from "date-fns/locale";
import { useState, useTransition } from "react";
import ErrorDetailsModal from "./ErrorDetailsModal";
import { Snackbar } from "@mui/material";
import { Alert } from "@mui/material";
import { deleteError } from "@shared/lib/actions/deleteError";
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
  error: ErrorDashboardReport;
  onViewDetails: () => void;
  onDelete?: (id: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  selectionMode?: boolean;
  isDeleting?: boolean;
  isPending?: boolean;
}

/**
 * Проверяет, является ли ошибка fatal
 */
function isFatalError(error: ErrorDashboardReport): boolean {
  const lowerMessage = error.message.toLowerCase();
  const hasFatalInMessage = lowerMessage.includes('fatal') || lowerMessage.includes('critical');
  const hasFatalTag = error.tags?.includes('fatal') || error.tags?.includes('critical');
  return hasFatalInMessage || hasFatalTag;
}

function RecentErrorItem({ error, onViewDetails, onDelete, isSelected, onToggleSelect, selectionMode, isDeleting, isPending }: RecentErrorItemProps) {
  const getSeverityIcon = (error: ErrorDashboardReport) => {
    if (isFatalError(error)) {
      return <ErrorIcon />;
    }
    const lowerMessage = error.message.toLowerCase();
    if (lowerMessage.includes('warning') || lowerMessage.includes('deprecated')) {
      return <WarningIcon />;
    }
    return <BugIcon />;
  };

  const getSeverityColor = (error: ErrorDashboardReport) => {
    if (isFatalError(error)) {
      return '#d32f2f';
    }
    const lowerMessage = error.message.toLowerCase();
    if (lowerMessage.includes('warning') || lowerMessage.includes('deprecated')) {
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

  const isFatal = isFatalError(error);
  const severityColor = getSeverityColor(error);

  return (
    <ListItem
      sx={{
        borderRadius: 2,
        mb: 1,
        bgcolor: isSelected 
          ? 'action.selected' 
          : isFatal 
            ? 'rgba(211, 47, 47, 0.05)' 
            : 'background.paper',
        border: '1px solid',
        borderColor: isSelected 
          ? '#667eea' 
          : isFatal 
            ? '#d32f2f' 
            : '#ffcdd2',
        transition: 'all 0.2s ease',
        '&:hover': {
          transform: 'translateX(2px)',
          boxShadow: 1,
          borderColor: isSelected 
            ? '#5a67d8' 
            : isFatal 
              ? '#b71c1c' 
              : '#ef9a9a',
          bgcolor: isFatal ? 'rgba(211, 47, 47, 0.08)' : undefined,
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
            bgcolor: severityColor,
            width: 40,
            height: 40,
          }}
        >
          {getSeverityIcon(error)}
        </Avatar>
      </ListItemAvatar>

      <ListItemText
        primary={
          <Box component="span" display="flex" alignItems="center" gap={1} mb={0.5}>
            <Typography variant="body2" fontWeight="medium" sx={{ flex: 1 }}>
              {truncateMessage(error.message)}
            </Typography>
            
            <Box component="span" display="flex" alignItems="center" gap={0.5}>
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

        {onDelete && (
          <Tooltip title="Удалить ошибку">
            <span>
              <IconButton
                size="small"
                onClick={() => onDelete(error.id)}
                color="error"
                disabled={isDeleting || isPending}
              >
                {isDeleting ? <CircularProgress size={16} /> : <DeleteIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>
    </ListItem>
  );
}

export default function RecentErrors() {
  const { filters } = useFilters();
  
  const errorFilters = {
    ...filters,
    limit: 50,
    offset: 0,
    type: "errors" as const,
  };
  
  // Логирование для диагностики
  console.warn('[RecentErrors] Calling useErrors with filters:', JSON.stringify(errorFilters));
  
  const { data: errors, error, isLoading, refetch } = useErrors(errorFilters);
  
  // Логирование результатов
  console.warn('[RecentErrors] useErrors result:', {
    isLoading,
    hasError: !!error,
    errorMessage: error?.message,
    errorsCount: errors?.length || 0,
    sampleErrors: errors?.slice(0, 2).map(e => ({ id: e.id, appName: e.appName, message: e.message.substring(0, 30) })),
  });
  
  // Логирование результатов
  if (process.env.NODE_ENV === 'development') {
    console.warn('[RecentErrors] useErrors result:', {
      isLoading,
      hasError: !!error,
      errorMessage: error?.message,
      errorsCount: errors?.length || 0,
      sampleErrors: errors?.slice(0, 3).map(e => ({ id: e.id, appName: e.appName, message: e.message.substring(0, 30) })),
    });
  }
  const [showAll, setShowAll] = useState(false);
  const [selectedError, setSelectedError] = useState<ErrorDashboardReport | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });
  
  // Batch selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Delete state
  const [isPending, startTransition] = useTransition();
  const [deletingErrorId, setDeletingErrorId] = useState<string | null>(null);
  const { invalidateErrors } = useErrorsMutation();

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

  const handleDeleteError = (errorId: string) => {
    // Найдем ошибку для отображения информации
    const error = errors?.find(e => e.id === errorId);
    const confirmMessage = error 
      ? `Вы уверены, что хотите удалить эту ошибку?\n\nПриложение: ${error.appName}\nСообщение: ${error.message.substring(0, 100)}${error.message.length > 100 ? '...' : ''}\n\nЭто действие нельзя отменить.`
      : 'Вы уверены, что хотите удалить эту ошибку? Это действие нельзя отменить.';
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    const errorBeforeDeletion = errors?.find(e => e.id === errorId);
    const operationStartTime = Date.now();
    const operationStartIso = new Date().toISOString();
    
    // Вспомогательная функция для безопасного преобразования createdAt в ISO строку
    const toIsoString = (date: Date | string | undefined): string | undefined => {
      if (!date) return undefined;
      if (date instanceof Date) return date.toISOString();
      if (typeof date === 'string') return date;
      return new Date(date).toISOString();
    };
    
    const errorLabels = errorBeforeDeletion?.labels || {};
    const createdAtIso = toIsoString(errorBeforeDeletion?.createdAt);
    
    console.warn('[RecentErrors] Начало удаления ошибки:', { 
      errorId,
      operationStartTime: operationStartIso,
      errorBeforeDeletion: errorBeforeDeletion ? {
        id: errorBeforeDeletion.id,
        appName: errorBeforeDeletion.appName,
        createdAt: createdAtIso,
        timestampNs: errorBeforeDeletion.timestampNs,
        message: errorBeforeDeletion.message.substring(0, 100),
        environment: errorBeforeDeletion.environment,
        context: errorLabels.context,
        serviceName: errorLabels.service_name || errorLabels.serviceName,
        container: errorLabels.container_name || errorLabels.container,
        labels: errorBeforeDeletion.labels,
        allLabels: errorBeforeDeletion.labels ? Object.keys(errorBeforeDeletion.labels) : [],
        labelValues: errorBeforeDeletion.labels || {},
      } : null,
      totalErrorsInList: errors?.length || 0,
      errorExistsInList: !!errorBeforeDeletion,
    });
    
    setDeletingErrorId(errorId);
    startTransition(async () => {
      const startTime = Date.now();
      
      try {
        const deleteActionStartTime = Date.now();
        const deleteActionStartIso = new Date().toISOString();
        
        console.warn('[RecentErrors] Вызов deleteError server action...', {
          errorId,
          deleteActionStartTime: deleteActionStartIso,
          timeSinceOperationStartMs: deleteActionStartTime - operationStartTime,
          errorBeforeDeletion: errorBeforeDeletion ? {
            appName: errorBeforeDeletion.appName,
            createdAt: createdAtIso,
            timestampNs: errorBeforeDeletion.timestampNs,
            environment: errorBeforeDeletion.environment,
            context: errorLabels.context,
            serviceName: errorLabels.service_name || errorLabels.serviceName,
            labels: errorBeforeDeletion.labels,
          } : null,
        });
        
        const result = await deleteError(errorId);
        const deleteActionEndTime = Date.now();
        const deleteActionEndIso = new Date().toISOString();
        const deleteActionDuration = deleteActionEndTime - deleteActionStartTime;
        const duration = deleteActionEndTime - startTime;
        
        console.warn('[RecentErrors] Результат deleteError:', {
          success: result.success,
          message: result.message,
          error: result.error,
          deleteActionStartTime: deleteActionStartIso,
          deleteActionEndTime: deleteActionEndIso,
          deleteActionDurationMs: deleteActionDuration,
          totalDurationMs: duration,
          timeSinceOperationStartMs: deleteActionEndTime - operationStartTime,
        });
        
        if (result.success) {
          setSnackbar({
            open: true,
            message: result.message || 'Ошибка успешно удалена',
            severity: 'success',
          });
          
          const cacheInvalidationStartTime = Date.now();
          const cacheInvalidationStartIso = new Date().toISOString();
          
          console.warn('[RecentErrors] Инвалидация кэша ошибок...', {
            errorId,
            cacheInvalidationStartTime: cacheInvalidationStartIso,
            timeSinceDeleteActionMs: cacheInvalidationStartTime - deleteActionEndTime,
            timeSinceOperationStartMs: cacheInvalidationStartTime - operationStartTime,
          });
          
          // Даём Loki применить удаление, затем принудительно обновляем кэш
          await new Promise((resolve) => setTimeout(resolve, 600));
          await invalidateErrors(errorFilters);
          
          const refetchStartTime = Date.now();
          const refetchStartIso = new Date().toISOString();
          await refetch();
          const refetchEndTime = Date.now();
          const refetchEndIso = new Date().toISOString();
          const refetchDuration = refetchEndTime - refetchStartTime;
          
          // Проверяем, осталась ли ошибка в списке после удаления
          const verificationTime = Date.now();
          const verificationIso = new Date().toISOString();
          const errorsAfterDeletion = errors;
          const errorStillInList = errorsAfterDeletion?.some(e => e.id === errorId);
          const foundErrorAfterDeletion = errorsAfterDeletion?.find(e => e.id === errorId);
          const totalErrorsAfter = errorsAfterDeletion?.length || 0;
          
          console.warn('[RecentErrors] Состояние после удаления и refetch:', {
            errorId,
            verificationTime: verificationIso,
            deleteActionDurationMs: deleteActionDuration,
            refetchStartTime: refetchStartIso,
            refetchEndTime: refetchEndIso,
            refetchDurationMs: refetchDuration,
            timeSinceDeleteActionMs: verificationTime - deleteActionEndTime,
            timeSinceOperationStartMs: verificationTime - operationStartTime,
            totalDurationMs: duration,
            errorStillInList,
            totalErrorsAfter,
            totalErrorsBefore: errors?.length || 0,
            errorBeforeDeletion: errorBeforeDeletion ? {
              appName: errorBeforeDeletion.appName,
              createdAt: createdAtIso,
              timestampNs: errorBeforeDeletion.timestampNs,
              environment: errorBeforeDeletion.environment,
              context: errorLabels.context,
              serviceName: errorLabels.service_name || errorLabels.serviceName,
              container: errorLabels.container_name || errorLabels.container,
              labels: errorBeforeDeletion.labels,
            } : null,
            errorAfterDeletion: foundErrorAfterDeletion ? {
              id: foundErrorAfterDeletion.id,
              appName: foundErrorAfterDeletion.appName,
              createdAt: toIsoString(foundErrorAfterDeletion.createdAt),
              timestampNs: foundErrorAfterDeletion.timestampNs,
              environment: foundErrorAfterDeletion.environment,
              context: (foundErrorAfterDeletion.labels || {}).context,
              serviceName: (foundErrorAfterDeletion.labels || {}).service_name || (foundErrorAfterDeletion.labels || {}).serviceName,
              container: (foundErrorAfterDeletion.labels || {}).container_name || (foundErrorAfterDeletion.labels || {}).container,
              labels: foundErrorAfterDeletion.labels,
              allLabels: foundErrorAfterDeletion.labels ? Object.keys(foundErrorAfterDeletion.labels) : [],
              labelValues: foundErrorAfterDeletion.labels || {},
              message: foundErrorAfterDeletion.message.substring(0, 200),
            } : null,
          });
          
          if (errorStillInList && foundErrorAfterDeletion) {
            console.error('[RecentErrors] ОШИБКА ВСЁ ЕЩЁ В СПИСКЕ ПОСЛЕ УДАЛЕНИЯ!', {
              errorId,
              verificationTime: verificationIso,
              timeSinceDeleteActionMs: verificationTime - deleteActionEndTime,
              timeSinceOperationStartMs: verificationTime - operationStartTime,
            errorDetails: {
              id: foundErrorAfterDeletion.id,
              appName: foundErrorAfterDeletion.appName,
              createdAt: toIsoString(foundErrorAfterDeletion.createdAt),
              timestampNs: foundErrorAfterDeletion.timestampNs,
              environment: foundErrorAfterDeletion.environment,
              context: (foundErrorAfterDeletion.labels || {}).context,
              serviceName: (foundErrorAfterDeletion.labels || {}).service_name || (foundErrorAfterDeletion.labels || {}).serviceName,
              container: (foundErrorAfterDeletion.labels || {}).container_name || (foundErrorAfterDeletion.labels || {}).container,
              labels: foundErrorAfterDeletion.labels,
              allLabels: foundErrorAfterDeletion.labels ? Object.keys(foundErrorAfterDeletion.labels) : [],
              labelValues: foundErrorAfterDeletion.labels || {},
              message: foundErrorAfterDeletion.message,
            },
            comparisonWithOriginal: {
              timestampsMatch: errorBeforeDeletion?.timestampNs === foundErrorAfterDeletion.timestampNs,
              labelsMatch: JSON.stringify(errorBeforeDeletion?.labels || {}) === JSON.stringify(foundErrorAfterDeletion.labels || {}),
              originalTimestampNs: errorBeforeDeletion?.timestampNs,
              foundTimestampNs: foundErrorAfterDeletion.timestampNs,
              originalLabels: errorBeforeDeletion?.labels || {},
              foundLabels: foundErrorAfterDeletion.labels || {},
            },
            });
          } else {
            console.warn('[RecentErrors] Ошибка успешно удалена из списка', {
              errorId,
              durationMs: duration,
            });
          }
        } else {
          // Показываем конкретную ошибку пользователю
          const errorMessage = result.error || 'Не удалось удалить ошибку';
          
          console.error('[RecentErrors] Не удалось удалить ошибку:', {
            errorId,
            error: errorMessage,
            durationMs: duration,
          });
          
          setSnackbar({
            open: true,
            message: errorMessage,
            severity: 'error',
          });
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка при удалении';
        
        console.error('[RecentErrors] Исключение при удалении ошибки:', {
          errorId,
          error,
          errorMessage,
          durationMs: duration,
        });
        
        setSnackbar({
          open: true,
          message: `Ошибка удаления: ${errorMessage}`,
          severity: 'error',
        });
      } finally {
        setDeletingErrorId(null);
        const operationEndTime = Date.now();
        const operationEndIso = new Date().toISOString();
        const totalOperationDuration = operationEndTime - operationStartTime;
        
        console.warn('[RecentErrors] Завершение удаления ошибки', {
          errorId,
          operationStartTime: operationStartIso,
          operationEndTime: operationEndIso,
          totalDurationMs: totalOperationDuration,
          totalDurationFromStartMs: Date.now() - startTime,
        });
      }
    });
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
            Нет недавних ошибок
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const displayedErrors = showAll ? errors : errors.slice(0, 20);

  return (
    <Card elevation={2}>
      <CardContent sx={{ p: 3 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="h5" component="h3" fontWeight="bold">
            Список ошибок
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

        <List sx={{ p: 0 }}>
          {displayedErrors.map((err, index) => (
            <Box key={err.id}>
              <RecentErrorItem 
                error={err} 
                onViewDetails={() => setSelectedError(err)}
                onDelete={handleDeleteError}
                selectionMode={selectionMode}
                isSelected={selectedIds.has(err.id)}
                onToggleSelect={handleToggleSelect}
                isDeleting={deletingErrorId === err.id}
                isPending={isPending}
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
