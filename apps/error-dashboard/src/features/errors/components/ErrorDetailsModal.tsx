"use client";

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  IconButton,
  Paper,
  Alert,
} from "@mui/material";
import {
  Close as CloseIcon,
  BugReport as BugIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckIcon,
  Person as PersonIcon,
  Computer as ComputerIcon,
  Schedule as ScheduleIcon,
  OpenInNew as OpenIcon,
} from "@mui/icons-material";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import type { ErrorDashboardReport } from "@gafus/types";

interface ErrorDetailsModalProps {
  open: boolean;
  onClose: () => void;
  error: ErrorDashboardReport | null;
}

// Компоненты для безопасного рендеринга
function StackTraceSection({ stack }: { stack: unknown }) {
  if (!stack || typeof stack !== 'string') return null;
  
  return (
    <Paper elevation={0} sx={{ p: 3, mb: 3, bgcolor: "#1a1a1a", borderRadius: 2, border: "1px solid #333" }}>
      <Typography variant="h6" fontWeight="bold" mb={2} color="#fff">
        📍 Stack Trace
      </Typography>
      <Typography 
        component="pre" 
        sx={{ 
          fontFamily: 'monospace', 
          fontSize: '0.8rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          bgcolor: '#1a1a1a',
          color: '#e2e8f0',
          p: 2,
          borderRadius: 1,
          overflow: 'auto',
          maxHeight: '400px',
          border: '1px solid #4a5568'
        }}
      >
        {stack}
      </Typography>
    </Paper>
  );
}

function ComponentStackSection({ componentStack }: { componentStack: unknown }) {
  if (!componentStack || typeof componentStack !== 'string') return null;
  
  return (
    <Paper elevation={0} sx={{ p: 3, mb: 3, bgcolor: "#1a1a1a", borderRadius: 2, border: "1px solid #333" }}>
      <Typography variant="h6" fontWeight="bold" mb={2} color="#fff">
        🧩 Component Stack
      </Typography>
      <Typography 
        component="pre" 
        sx={{ 
          fontFamily: 'monospace', 
          fontSize: '0.8rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          bgcolor: '#1a1a1a',
          color: '#e2e8f0',
          p: 2,
          borderRadius: 1,
          overflow: 'auto',
          maxHeight: '400px',
          border: '1px solid #4a5568'
        }}
      >
        {componentStack}
      </Typography>
    </Paper>
  );
}

function UserAgentSection({ userAgent }: { userAgent: unknown }) {
  if (!userAgent || typeof userAgent !== 'string') return null;
  
  return (
    <Paper elevation={0} sx={{ p: 3, mb: 3, bgcolor: "#f7fafc", borderRadius: 2, border: "1px solid #e2e8f0" }}>
      <Typography variant="h6" fontWeight="bold" mb={2} color="#4a5568">
        🌐 User Agent
      </Typography>
      <Typography 
        sx={{ 
          fontFamily: 'Monaco, Consolas, "Courier New", monospace',
          fontSize: '0.8rem',
          wordBreak: 'break-all',
          bgcolor: '#f7fafc',
          p: 2,
          borderRadius: 1,
          border: '1px solid #e2e8f0'
        }}
      >
        {userAgent}
      </Typography>
    </Paper>
  );
}

function AdditionalContextSection({ additionalContext }: { additionalContext: unknown }) {
  if (!additionalContext) return null;
  
  return (
    <Paper elevation={0} sx={{ p: 3, mb: 3, bgcolor: "#fef5e7", borderRadius: 2, border: "1px solid #f6e05e" }}>
      <Typography variant="h6" fontWeight="bold" mb={2} color="#744210">
        📋 Additional Context
      </Typography>
      <Typography 
        component="pre" 
        sx={{ 
          fontFamily: 'Monaco, Consolas, "Courier New", monospace',
          fontSize: '0.75rem',
          lineHeight: 1.4,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          bgcolor: '#1a1a1a',
          color: '#e2e8f0',
          p: 2,
          borderRadius: 1,
          overflow: 'auto',
          maxHeight: '400px'
        }}
      >
        {JSON.stringify(additionalContext, null, 2)}
      </Typography>
    </Paper>
  );
}

export default function ErrorDetailsModal({ open, onClose, error }: ErrorDetailsModalProps) {
  if (!error) return null;

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
      return "#f48fb1";
    } else if (lowerMessage.includes('warning') || lowerMessage.includes('deprecated')) {
      return "#ffb74d";
    }
    return "#7986cb";
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

  const severityColor = getSeverityColor(error.message);
  const appColor = getAppColor(error.appName);

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="lg" 
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2, maxHeight: '90vh' }
      }}
    >
      <DialogTitle sx={{ 
        pb: 1,
        background: "linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)",
        borderBottom: "1px solid #dee2e6"
      }}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={2}>
            <Box 
              sx={{ 
                p: 1, 
                borderRadius: 2, 
                bgcolor: `${severityColor}20`,
                border: `1px solid ${severityColor}30`
              }}
            >
              {getSeverityIcon(error.message)}
            </Box>
            <Box>
              <Typography variant="h6" fontWeight="bold">
                Детали ошибки
              </Typography>
              <Typography variant="body2" color="text.secondary">
                ID: {error.id}
              </Typography>
            </Box>
          </Box>
          
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 3, overflow: 'auto' }}>
        <Paper elevation={0} sx={{ p: 3, mb: 3, bgcolor: "#fafafa", borderRadius: 2 }}>
          <Typography variant="h6" fontWeight="bold" mb={2}>
            {error.message}
          </Typography>
          
          <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
            <Chip
              icon={getSeverityIcon(error.message)}
              label="Тип ошибки"
              size="small"
              sx={{
                bgcolor: `${severityColor}20`,
                color: severityColor,
                fontWeight: 'bold'
              }}
            />
            
            <Chip
              label={error.appName}
              size="small"
              sx={{
                bgcolor: `${appColor}20`,
                color: appColor,
                fontWeight: 'bold'
              }}
            />
            
            <Chip
              label={error.environment}
              size="small"
              variant="outlined"
            />
            
            {error.resolved && (
              <Chip
                icon={<CheckIcon />}
                label="Решено"
                size="small"
                color="success"
                variant="outlined"
              />
            )}
          </Box>

          <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "repeat(2, 1fr)" }} gap={2}>
            <Box>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <ScheduleIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  Создано: {formatDistanceToNow(new Date(error.createdAt), { addSuffix: true, locale: ru })}
                </Typography>
              </Box>
              
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <ComputerIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  URL: {error.url}
                </Typography>
                <IconButton 
                  size="small" 
                  onClick={() => window.open(error.url, '_blank')}
                  sx={{ ml: 1 }}
                >
                  <OpenIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
            
            <Box>
              {error.userId && (
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <PersonIcon fontSize="small" color="action" />
                  <Typography variant="body2" color="text.secondary">
                    Пользователь: {error.userId}
                  </Typography>
                </Box>
              )}
              
              {error.sessionId && (
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <ComputerIcon fontSize="small" color="action" />
                  <Typography variant="body2" color="text.secondary">
                    Сессия: {error.sessionId.substring(0, 8)}...
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Paper>




        {/* Stack Trace */}
        <StackTraceSection stack={error.stack} />

        {/* Component Stack */}
        <ComponentStackSection componentStack={error.componentStack} />

        {/* User Agent */}
        <UserAgentSection userAgent={error.userAgent} />

        {/* Additional Context */}
        <AdditionalContextSection additionalContext={error.additionalContext} />

        {/* Полная информация о времени */}
        <Paper elevation={0} sx={{ p: 3, mb: 3, bgcolor: "#edf2f7", borderRadius: 2, border: "1px solid #cbd5e0" }}>
          <Typography variant="h6" fontWeight="bold" mb={2} color="#2d3748">
            ⏰ Временные метки
          </Typography>
          <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "repeat(2, 1fr)" }} gap={2}>
            <Box>
              <Typography variant="body2" fontWeight="medium" mb={1}>
                Создано:
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                {new Date(error.createdAt).toLocaleString('ru-RU', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  timeZoneName: 'short'
                })}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                ({formatDistanceToNow(new Date(error.createdAt), { addSuffix: true, locale: ru })})
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="body2" fontWeight="medium" mb={1}>
                Обновлено:
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                {new Date(error.updatedAt || error.createdAt).toLocaleString('ru-RU', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  timeZoneName: 'short'
                })}
              </Typography>
            </Box>

            {error.resolvedAt && (
              <Box>
                <Typography variant="body2" fontWeight="medium" mb={1}>
                  Разрешено:
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  {new Date(error.resolvedAt).toLocaleString('ru-RU', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    timeZoneName: 'short'
                  })}
                </Typography>
                {error.resolvedBy && (
                  <Typography variant="caption" color="text.secondary">
                    Пользователем: {error.resolvedBy}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        </Paper>

        {/* Техническая информация */}
        <Paper elevation={0} sx={{ p: 3, mb: 3, bgcolor: "#f0f9ff", borderRadius: 2, border: "1px solid #7dd3fc" }}>
          <Typography variant="h6" fontWeight="bold" mb={2} color="#0369a1">
            🔧 Техническая информация
          </Typography>
          <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "repeat(2, 1fr)" }} gap={2}>
            <Box>
              <Typography variant="body2" fontWeight="medium" mb={1}>
                ID ошибки:
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {error.id}
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="body2" fontWeight="medium" mb={1}>
                Приложение:
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {error.appName}
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="body2" fontWeight="medium" mb={1}>
                Окружение:
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {error.environment}
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="body2" fontWeight="medium" mb={1}>
                Статус:
              </Typography>
              <Typography variant="body2" color={error.resolved ? "success.main" : "error.main"}>
                {error.resolved ? "✅ Решено" : "❌ Не решено"}
              </Typography>
            </Box>
          </Box>
        </Paper>

        {/* Информация о пользователе */}
        <Paper elevation={0} sx={{ p: 3, mb: 3, bgcolor: "#f0fff4", borderRadius: 2, border: "1px solid #68d391" }}>
          <Typography variant="h6" fontWeight="bold" mb={2} color="#22543d">
            👤 Информация о пользователе
          </Typography>
          <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "repeat(2, 1fr)" }} gap={2}>
            {error.userId ? (
              <Box>
                <Typography variant="body2" fontWeight="medium" mb={1}>
                  ID пользователя:
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {error.userId}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  💡 Используйте этот ID для поиска пользователя в системе
                </Typography>
              </Box>
            ) : (
              <Box>
                <Typography variant="body2" fontWeight="medium" mb={1}>
                  ID пользователя:
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Не указан (анонимная ошибка)
                </Typography>
              </Box>
            )}
            
            {error.sessionId ? (
              <Box>
                <Typography variant="body2" fontWeight="medium" mb={1}>
                  ID сессии:
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {error.sessionId}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  💡 Полезно для отслеживания действий пользователя
                </Typography>
              </Box>
            ) : (
              <Box>
                <Typography variant="body2" fontWeight="medium" mb={1}>
                  ID сессии:
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Не указан
                </Typography>
              </Box>
            )}
          </Box>
        </Paper>

        {/* Теги */}
        {error.tags && error.tags.length > 0 && (
          <Paper elevation={0} sx={{ p: 3, mb: 3, bgcolor: "#fdf2f8", borderRadius: 2, border: "1px solid #f9a8d4" }}>
            <Typography variant="h6" fontWeight="bold" mb={2} color="#be185d">
              🏷️ Теги
            </Typography>
            <Box display="flex" flexWrap="wrap" gap={0.5}>
              {error.tags.map((tag, index) => (
                <Chip
                  key={index}
                  label={tag}
                  size="small"
                  sx={{
                    bgcolor: "#fce7f3",
                    color: "#be185d",
                    fontWeight: 'medium',
                    border: "1px solid #f9a8d4"
                  }}
                />
              ))}
            </Box>
          </Paper>
        )}

        {/* Статус разрешения */}
        {error.resolved && error.resolvedAt && (
          <Alert severity="success" sx={{ borderRadius: 2 }}>
            <Typography variant="body2">
              Эта ошибка была решена {formatDistanceToNow(new Date(error.resolvedAt), { addSuffix: true, locale: ru })}
              {error.resolvedBy && ` пользователем ${error.resolvedBy}`}
            </Typography>
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 0 }}>
        <Button onClick={onClose} variant="outlined">
          Закрыть
        </Button>
        <Button 
          onClick={() => window.open(error.url, '_blank')} 
          variant="contained"
          startIcon={<OpenIcon />}
        >
          Открыть в новой вкладке
        </Button>
      </DialogActions>
    </Dialog>
  );
}