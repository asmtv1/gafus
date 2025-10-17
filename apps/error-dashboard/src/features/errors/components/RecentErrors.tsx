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
  Button
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
  Computer as ComputerIcon
} from "@mui/icons-material";
import { useErrors, useErrorsMutation } from "@shared/hooks/useErrors";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { useState } from "react";
import ErrorDetailsModal from "./ErrorDetailsModal";
import { Snackbar } from "@mui/material";
import { Alert } from "@mui/material";
import type { ErrorDashboardReport } from "@gafus/types";

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
}

function RecentErrorItem({ error, onViewDetails, onResolveSuccess, onResolveError }: RecentErrorItemProps) {
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
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: error.resolved ? '#c8e6c9' : '#ffcdd2',
        opacity: error.resolved ? 0.8 : 1,
        transition: 'all 0.2s ease',
        '&:hover': {
          transform: 'translateX(2px)',
          boxShadow: 1,
          borderColor: error.resolved ? '#a5d6a7' : '#ef9a9a',
        }
      }}
    >
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
  const { data: errors, error, isLoading, refetch } = useErrors({ 
    limit: 50,
    offset: 0 
  });
  const [showAll, setShowAll] = useState(false);
  const [selectedError, setSelectedError] = useState<ErrorDashboardReport | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });

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
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
          <Typography variant="h5" component="h3" fontWeight="bold">
            Список ошибок
          </Typography>
          
          <Box display="flex" alignItems="center" gap={1}>
            <Tooltip title="Обновить список">
              <IconButton color="primary" size="small" onClick={() => refetch()}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <List sx={{ p: 0 }}>
          {displayedErrors.map((error, index) => (
            <Box key={error.id}>
              <RecentErrorItem 
                error={error} 
                onViewDetails={() => setSelectedError(error)}
                onResolveSuccess={(message) => {
                  setSnackbar({ open: true, message, severity: 'success' });
                }}
                onResolveError={(message) => {
                  setSnackbar({ open: true, message, severity: 'error' });
                }}
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
