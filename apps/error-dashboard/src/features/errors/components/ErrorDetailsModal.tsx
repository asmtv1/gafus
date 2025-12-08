"use client";

import { useState } from "react";
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
  Snackbar,
  Tooltip,
} from "@mui/material";
import {
  Close as CloseIcon,
  BugReport as BugIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Person as PersonIcon,
  Computer as ComputerIcon,
  Schedule as ScheduleIcon,
  OpenInNew as OpenIcon,
  ContentCopy as CopyIcon,
  Download as DownloadIcon,
  NewReleases as NewReleasesIcon,
  VisibilityOutlined as VisibilityOutlinedIcon,
  CheckCircle as CheckCircleIcon,
  Archive as ArchiveIcon,
} from "@mui/icons-material";
import { formatDistanceToNow, format } from "date-fns";
import { ru } from "date-fns/locale";
import type { ErrorDashboardReport } from "@gafus/types";
import { updateErrorStatusAction } from "@shared/lib/actions/updateErrorStatus";
import { useTransition } from "react";

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
  
  if (error.sessionId) {
    lines.push(`**Session ID:** \`${error.sessionId}\``);
  }
  
  if (error.stack) {
    lines.push('');
    lines.push('## Stack Trace');
    lines.push('```');
    lines.push(error.stack);
    lines.push('```');
  }
  
  if (error.componentStack) {
    lines.push('');
    lines.push('## Component Stack');
    lines.push('```');
    lines.push(error.componentStack);
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
  
  if (error.userAgent) {
    lines.push('');
    lines.push('## User Agent');
    lines.push(`\`${error.userAgent}\``);
  }
  
  return lines.join('\n');
}

/**
 * Форматирует ошибку в JSON для экспорта
 */
function formatErrorAsJSON(error: ErrorDashboardReport): string {
  return JSON.stringify({
    id: error.id,
    message: error.message,
    appName: error.appName,
    environment: error.environment,
    url: error.url,
    stack: error.stack,
    componentStack: error.componentStack,
    additionalContext: error.additionalContext,
    tags: error.tags,
    userId: error.userId,
    sessionId: error.sessionId,
    userAgent: error.userAgent,
    createdAt: error.createdAt,
    updatedAt: error.updatedAt,
  }, null, 2);
}

interface ErrorDetailsModalProps {
  open: boolean;
  onClose: () => void;
  error: ErrorDashboardReport | null;
  onStatusChange?: () => void;
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

/**
 * Подсвечивает синтаксис в stack trace
 */
function highlightStackTrace(stack: string): React.ReactNode {
  const lines = stack.split('\n');
  
  return lines.map((line, index) => {
    // Подсветка файла и номера строки (например: at Component (file.tsx:123:45))
    const fileMatch = line.match(/\(([^)]+):(\d+):(\d+)\)/);
    const atMatch = line.match(/^\s*at\s+/);
    
    if (fileMatch) {
      const [fullMatch, filePath, lineNum, colNum] = fileMatch;
      const beforeMatch = line.substring(0, line.indexOf(fullMatch));
      const afterMatch = line.substring(line.indexOf(fullMatch) + fullMatch.length);
      
      return (
        <Box key={index} component="span" sx={{ display: 'block' }}>
          <Box component="span" sx={{ color: atMatch ? '#a78bfa' : '#e2e8f0' }}>
            {beforeMatch}
          </Box>
          <Box component="span" sx={{ color: '#6b7280' }}>(</Box>
          <Box component="span" sx={{ color: '#60a5fa' }}>{filePath}</Box>
          <Box component="span" sx={{ color: '#6b7280' }}>:</Box>
          <Box component="span" sx={{ color: '#fbbf24' }}>{lineNum}</Box>
          <Box component="span" sx={{ color: '#6b7280' }}>:</Box>
          <Box component="span" sx={{ color: '#fbbf24' }}>{colNum}</Box>
          <Box component="span" sx={{ color: '#6b7280' }}>)</Box>
          <Box component="span" sx={{ color: '#e2e8f0' }}>{afterMatch}</Box>
          {'\n'}
        </Box>
      );
    }
    
    // Подсветка ошибки в начале (Error: message)
    if (line.match(/^(Error|TypeError|ReferenceError|SyntaxError|RangeError):/)) {
      const colonIndex = line.indexOf(':');
      return (
        <Box key={index} component="span" sx={{ display: 'block' }}>
          <Box component="span" sx={{ color: '#f87171', fontWeight: 'bold' }}>
            {line.substring(0, colonIndex + 1)}
          </Box>
          <Box component="span" sx={{ color: '#fca5a5' }}>
            {line.substring(colonIndex + 1)}
          </Box>
          {'\n'}
        </Box>
      );
    }
    
    // at Function/Method
    if (atMatch) {
      return (
        <Box key={index} component="span" sx={{ display: 'block' }}>
          <Box component="span" sx={{ color: '#a78bfa' }}>    at </Box>
          <Box component="span" sx={{ color: '#34d399' }}>
            {line.replace(/^\s*at\s+/, '')}
          </Box>
          {'\n'}
        </Box>
      );
    }
    
    return (
      <Box key={index} component="span" sx={{ display: 'block', color: '#e2e8f0' }}>
        {line}
        {'\n'}
      </Box>
    );
  });
}

/**
 * Подсвечивает синтаксис JSON
 */
function highlightJSON(json: string): React.ReactNode {
  // Простая подсветка JSON с помощью regex
  const highlighted = json
    .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="json-string">"$1"</span>')
    .replace(/: (\d+)/g, ': <span class="json-number">$1</span>')
    .replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>')
    .replace(/: (null)/g, ': <span class="json-null">$1</span>');
  
  return (
    <Box
      component="pre"
      sx={{
        '& .json-key': { color: '#60a5fa' },
        '& .json-string': { color: '#34d399' },
        '& .json-number': { color: '#fbbf24' },
        '& .json-boolean': { color: '#a78bfa' },
        '& .json-null': { color: '#f87171' },
      }}
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
}

// Компоненты для безопасного рендеринга
function StackTraceSection({ stack, onCopy }: { stack: unknown; onCopy?: (text: string) => void }) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  if (!stack || typeof stack !== 'string') return null;
  
  return (
    <Paper elevation={0} sx={{ p: 3, mb: 3, bgcolor: "#0f0f0f", borderRadius: 2, border: "1px solid #333" }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography 
          variant="h6" 
          fontWeight="bold" 
          color="#fff" 
          sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1 }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          📍 Stack Trace
          <Chip 
            label={isExpanded ? "▼" : "▶"} 
            size="small" 
            sx={{ bgcolor: '#333', color: '#fff', height: 20, fontSize: '0.7rem' }} 
          />
        </Typography>
        {onCopy && (
          <Tooltip title="Копировать stack trace">
            <IconButton 
              size="small" 
              onClick={() => onCopy(stack)}
              sx={{ color: '#9ca3af', '&:hover': { color: '#fff' } }}
            >
              <CopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {isExpanded && (
        <Box
          sx={{ 
            fontFamily: '"JetBrains Mono", "Fira Code", Monaco, Consolas, monospace', 
            fontSize: '0.75rem',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            bgcolor: '#0a0a0a',
            p: 2,
            borderRadius: 1,
            overflow: 'auto',
            maxHeight: '400px',
            border: '1px solid #2d2d2d'
          }}
        >
          {highlightStackTrace(stack)}
        </Box>
      )}
    </Paper>
  );
}

function ComponentStackSection({ componentStack, onCopy }: { componentStack: unknown; onCopy?: (text: string) => void }) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  if (!componentStack || typeof componentStack !== 'string') return null;
  
  // Подсветка React компонентов в component stack
  const highlightComponentStack = (stack: string) => {
    const lines = stack.split('\n');
    return lines.map((line, index) => {
      // Подсвечиваем названия компонентов (в угловых скобках)
      const componentMatch = line.match(/<([A-Z][a-zA-Z0-9]*)/);
      if (componentMatch) {
        const [, componentName] = componentMatch;
        return (
          <Box key={index} component="span" sx={{ display: 'block' }}>
            <Box component="span" sx={{ color: '#6b7280' }}>&lt;</Box>
            <Box component="span" sx={{ color: '#60a5fa', fontWeight: 'bold' }}>{componentName}</Box>
            <Box component="span" sx={{ color: '#e2e8f0' }}>{line.substring(line.indexOf(componentName) + componentName.length)}</Box>
            {'\n'}
          </Box>
        );
      }
      return (
        <Box key={index} component="span" sx={{ display: 'block', color: '#a78bfa' }}>
          {line}
          {'\n'}
        </Box>
      );
    });
  };
  
  return (
    <Paper elevation={0} sx={{ p: 3, mb: 3, bgcolor: "#0f0f0f", borderRadius: 2, border: "1px solid #333" }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography 
          variant="h6" 
          fontWeight="bold" 
          color="#fff" 
          sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1 }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          🧩 Component Stack
          <Chip 
            label={isExpanded ? "▼" : "▶"} 
            size="small" 
            sx={{ bgcolor: '#333', color: '#fff', height: 20, fontSize: '0.7rem' }} 
          />
        </Typography>
        {onCopy && (
          <Tooltip title="Копировать component stack">
            <IconButton 
              size="small" 
              onClick={() => onCopy(componentStack)}
              sx={{ color: '#9ca3af', '&:hover': { color: '#fff' } }}
            >
              <CopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {isExpanded && (
        <Box
          sx={{ 
            fontFamily: '"JetBrains Mono", "Fira Code", Monaco, Consolas, monospace', 
            fontSize: '0.75rem',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            bgcolor: '#0a0a0a',
            p: 2,
            borderRadius: 1,
            overflow: 'auto',
            maxHeight: '400px',
            border: '1px solid #2d2d2d'
          }}
        >
          {highlightComponentStack(componentStack)}
        </Box>
      )}
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

function AdditionalContextSection({ additionalContext, onCopy }: { additionalContext: unknown; onCopy?: (text: string) => void }) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  if (!additionalContext) return null;
  
  const jsonString = JSON.stringify(additionalContext, null, 2);
  
  // Подсветка JSON синтаксиса
  const renderJsonWithHighlight = (json: string) => {
    const lines = json.split('\n');
    return lines.map((line, index) => {
      // Ключ: "key":
      let highlighted = line.replace(
        /"([^"]+)":/g, 
        '<span style="color: #60a5fa">"$1"</span>:'
      );
      // Строковое значение: "value"
      highlighted = highlighted.replace(
        /: "([^"]*)"/g, 
        ': <span style="color: #34d399">"$1"</span>'
      );
      // Числовое значение
      highlighted = highlighted.replace(
        /: (\d+\.?\d*)/g, 
        ': <span style="color: #fbbf24">$1</span>'
      );
      // Boolean значения
      highlighted = highlighted.replace(
        /: (true|false)/g, 
        ': <span style="color: #a78bfa">$1</span>'
      );
      // null
      highlighted = highlighted.replace(
        /: (null)/g, 
        ': <span style="color: #f87171">$1</span>'
      );
      
      return (
        <Box 
          key={index} 
          component="div"
          sx={{ minHeight: '1.2em' }}
          dangerouslySetInnerHTML={{ __html: highlighted || '&nbsp;' }}
        />
      );
    });
  };
  
  return (
    <Paper elevation={0} sx={{ p: 3, mb: 3, bgcolor: "#1a1a0a", borderRadius: 2, border: "1px solid #3d3d00" }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography 
          variant="h6" 
          fontWeight="bold" 
          color="#fbbf24" 
          sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1 }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          📋 Additional Context
          <Chip 
            label={isExpanded ? "▼" : "▶"} 
            size="small" 
            sx={{ bgcolor: '#3d3d00', color: '#fbbf24', height: 20, fontSize: '0.7rem' }} 
          />
          <Chip 
            label={`${Object.keys(additionalContext as object).length} полей`} 
            size="small" 
            sx={{ bgcolor: '#3d3d00', color: '#fbbf24', height: 20, fontSize: '0.65rem' }} 
          />
        </Typography>
        {onCopy && (
          <Tooltip title="Копировать JSON">
            <IconButton 
              size="small" 
              onClick={() => onCopy(jsonString)}
              sx={{ color: '#9ca3af', '&:hover': { color: '#fbbf24' } }}
            >
              <CopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {isExpanded && (
        <Box
          sx={{ 
            fontFamily: '"JetBrains Mono", "Fira Code", Monaco, Consolas, monospace',
            fontSize: '0.75rem',
            lineHeight: 1.5,
            whiteSpace: 'pre',
            bgcolor: '#0a0a0a',
            color: '#e2e8f0',
            p: 2,
            borderRadius: 1,
            overflow: 'auto',
            maxHeight: '400px',
            border: '1px solid #2d2d2d'
          }}
        >
          {renderJsonWithHighlight(jsonString)}
        </Box>
      )}
    </Paper>
  );
}

export default function ErrorDetailsModal({ open, onClose, error, onStatusChange }: ErrorDetailsModalProps) {
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });
  const [isPending, startTransition] = useTransition();

  if (!error) return null;

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'new':
        return '#d32f2f';
      case 'viewed':
        return '#1976d2';
      case 'resolved':
        return '#2e7d32';
      case 'archived':
        return '#757575';
      default:
        return '#d32f2f';
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'new':
        return 'Новая';
      case 'viewed':
        return 'Просмотрена';
      case 'resolved':
        return 'Решена';
      case 'archived':
        return 'Архивирована';
      default:
        return 'Новая';
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'new':
        return <NewReleasesIcon fontSize="small" />;
      case 'viewed':
        return <VisibilityOutlinedIcon fontSize="small" />;
      case 'resolved':
        return <CheckCircleIcon fontSize="small" />;
      case 'archived':
        return <ArchiveIcon fontSize="small" />;
      default:
        return <NewReleasesIcon fontSize="small" />;
    }
  };

  const handleStatusChange = (newStatus: 'new' | 'viewed' | 'resolved' | 'archived') => {
    if (!error) return;
    
    startTransition(async () => {
      try {
        const result = await updateErrorStatusAction(error.id, newStatus);
        if (result.success) {
          setSnackbar({
            open: true,
            message: `Статус изменен на "${getStatusLabel(newStatus)}"`,
            severity: 'success',
          });
          onStatusChange?.();
        } else {
          setSnackbar({
            open: true,
            message: result.error || 'Не удалось изменить статус',
            severity: 'error',
          });
        }
      } catch (err) {
        console.error('Failed to update status:', err);
        setSnackbar({
          open: true,
          message: 'Не удалось изменить статус',
          severity: 'error',
        });
      }
    });
  };

  const handleCopyForAI = async () => {
    try {
      const markdown = formatErrorForAI(error);
      await navigator.clipboard.writeText(markdown);
      setSnackbar({ open: true, message: 'Скопировано для AI! Вставьте в чат.', severity: 'success' });
    } catch (err) {
      console.error('Failed to copy:', err);
      setSnackbar({ open: true, message: 'Не удалось скопировать', severity: 'error' });
    }
  };

  const handleCopyJSON = async () => {
    try {
      const json = formatErrorAsJSON(error);
      await navigator.clipboard.writeText(json);
      setSnackbar({ open: true, message: 'JSON скопирован в буфер обмена', severity: 'success' });
    } catch (err) {
      console.error('Failed to copy:', err);
      setSnackbar({ open: true, message: 'Не удалось скопировать JSON', severity: 'error' });
    }
  };

  const handleDownloadJSON = () => {
    try {
      const json = formatErrorAsJSON(error);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `error-${error.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSnackbar({ open: true, message: 'JSON файл скачан', severity: 'success' });
    } catch (err) {
      console.error('Failed to download:', err);
      setSnackbar({ open: true, message: 'Не удалось скачать файл', severity: 'error' });
    }
  };

  const handleDownloadMarkdown = () => {
    try {
      const markdown = formatErrorForAI(error);
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `error-${error.id}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSnackbar({ open: true, message: 'Markdown файл скачан', severity: 'success' });
    } catch (err) {
      console.error('Failed to download:', err);
      setSnackbar({ open: true, message: 'Не удалось скачать файл', severity: 'error' });
    }
  };

  const handleCopyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setSnackbar({ open: true, message: 'Скопировано в буфер обмена', severity: 'success' });
    } catch (err) {
      console.error('Failed to copy:', err);
      setSnackbar({ open: true, message: 'Не удалось скопировать', severity: 'error' });
    }
  };

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
      return "#d32f2f";
    }
    const lowerMessage = error.message.toLowerCase();
    if (lowerMessage.includes('warning') || lowerMessage.includes('deprecated')) {
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

  const severityColor = getSeverityColor(error);
  const appColor = getAppColor(error.appName);
  const isFatal = isFatalError(error);

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
        background: isFatal 
          ? "linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%)"
          : "linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)",
        borderBottom: isFatal 
          ? `2px solid ${severityColor}`
          : "1px solid #dee2e6"
      }}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={2}>
            <Box 
              sx={{ 
                p: 1, 
                borderRadius: 2, 
                bgcolor: `${severityColor}20`,
                border: `1px solid ${severityColor}${isFatal ? '80' : '30'}`
              }}
            >
              {getSeverityIcon(error)}
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
              icon={getSeverityIcon(error)}
              label={isFatal ? "FATAL" : "Тип ошибки"}
              size="small"
              sx={{
                bgcolor: `${severityColor}20`,
                color: severityColor,
                fontWeight: 'bold',
                border: isFatal ? `1px solid ${severityColor}` : 'none'
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
            
            <Chip
              icon={getStatusIcon(error.status)}
              label={getStatusLabel(error.status)}
              size="small"
              sx={{
                bgcolor: `${getStatusColor(error.status)}15`,
                color: getStatusColor(error.status),
                fontWeight: 'medium',
                border: `1px solid ${getStatusColor(error.status)}30`,
              }}
            />
          </Box>
          
          {error.status === 'resolved' && error.resolvedAt && (
            <Box mt={2}>
              <Typography variant="body2" color="text.secondary">
                <CheckCircleIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5, color: '#2e7d32' }} />
                Решена {formatDistanceToNow(new Date(error.resolvedAt), { addSuffix: true, locale: ru })}
                {error.resolvedBy && ` пользователем ${error.resolvedBy}`}
                {' '}({format(new Date(error.resolvedAt), 'dd.MM.yyyy HH:mm:ss', { locale: ru })})
              </Typography>
            </Box>
          )}

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

        {/* Управление статусом */}
        <Paper elevation={0} sx={{ p: 3, mb: 3, bgcolor: "#fff9e6", borderRadius: 2, border: "1px solid #ffd54f" }}>
          <Typography variant="h6" fontWeight="bold" mb={2} color="#e65100">
            📋 Управление статусом
          </Typography>
          
          <Box display="flex" alignItems="center" gap={2} mb={2}>
            <Typography variant="body2" fontWeight="medium">
              Текущий статус:
            </Typography>
            <Chip
              icon={getStatusIcon(error.status)}
              label={getStatusLabel(error.status)}
              size="medium"
              sx={{
                bgcolor: `${getStatusColor(error.status)}20`,
                color: getStatusColor(error.status),
                fontWeight: 'bold',
                border: `2px solid ${getStatusColor(error.status)}`,
                fontSize: '0.875rem',
              }}
            />
          </Box>

          <Box display="flex" flexWrap="wrap" gap={1}>
            <Button
              variant={error.status === 'viewed' ? 'contained' : 'outlined'}
              size="small"
              startIcon={<VisibilityOutlinedIcon />}
              onClick={() => handleStatusChange('viewed')}
              disabled={error.status === 'viewed' || isPending}
              sx={{ textTransform: 'none' }}
            >
              Отметить просмотренной
            </Button>
            
            <Button
              variant={error.status === 'resolved' ? 'contained' : 'outlined'}
              size="small"
              color="success"
              startIcon={<CheckCircleIcon />}
              onClick={() => handleStatusChange('resolved')}
              disabled={error.status === 'resolved' || isPending}
              sx={{ textTransform: 'none' }}
            >
              Решить
            </Button>
            
            <Button
              variant={error.status === 'archived' ? 'contained' : 'outlined'}
              size="small"
              color="inherit"
              startIcon={<ArchiveIcon />}
              onClick={() => handleStatusChange('archived')}
              disabled={error.status === 'archived' || isPending}
              sx={{ textTransform: 'none' }}
            >
              Архивировать
            </Button>
            
            <Button
              variant={error.status === 'new' ? 'contained' : 'outlined'}
              size="small"
              color="error"
              startIcon={<NewReleasesIcon />}
              onClick={() => handleStatusChange('new')}
              disabled={error.status === 'new' || isPending}
              sx={{ textTransform: 'none' }}
            >
              Вернуть в новые
            </Button>
          </Box>
        </Paper>

        {/* Stack Trace */}
        <StackTraceSection stack={error.stack} onCopy={handleCopyText} />

        {/* Component Stack */}
        <ComponentStackSection componentStack={error.componentStack} onCopy={handleCopyText} />

        {/* User Agent */}
        <UserAgentSection userAgent={error.userAgent} />

        {/* Additional Context */}
        <AdditionalContextSection additionalContext={error.additionalContext} onCopy={handleCopyText} />

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
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 0, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', flex: 1 }}>
          <Tooltip title="Копировать в формате Markdown для вставки в AI чат">
            <Button 
              onClick={handleCopyForAI} 
              variant="contained"
              color="secondary"
              startIcon={<CopyIcon />}
              sx={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                '&:hover': { background: 'linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%)' }
              }}
            >
              Копировать для AI
            </Button>
          </Tooltip>
          
          <Tooltip title="Копировать как JSON">
            <Button 
              onClick={handleCopyJSON} 
              variant="outlined"
              startIcon={<CopyIcon />}
            >
              JSON
            </Button>
          </Tooltip>
          
          <Tooltip title="Скачать как JSON файл">
            <Button 
              onClick={handleDownloadJSON} 
              variant="outlined"
              startIcon={<DownloadIcon />}
            >
              Скачать JSON
            </Button>
          </Tooltip>
          
          <Tooltip title="Скачать как Markdown файл">
            <Button 
              onClick={handleDownloadMarkdown} 
              variant="outlined"
              startIcon={<DownloadIcon />}
            >
              Скачать MD
            </Button>
          </Tooltip>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose} variant="outlined">
            Закрыть
          </Button>
        </Box>
      </DialogActions>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))} 
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Dialog>
  );
}