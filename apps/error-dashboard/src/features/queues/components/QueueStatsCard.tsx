import { Card, CardContent, Box, Typography, Chip, LinearProgress, Tooltip } from "@mui/material";
import {
  Queue as QueueIcon,
  CheckCircle as CompletedIcon,
  Error as FailedIcon,
  HourglassEmpty as WaitingIcon,
  PlayArrow as ActiveIcon,
  Schedule as DelayedIcon,
  Pause as PausedIcon,
  Notifications as PushIcon,
  Campaign as ReengagementIcon,
  DeleteSweep as CleanupIcon,
  Info as InfoIcon,
} from "@mui/icons-material";

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  // Дополнительные метрики из Prometheus
  throughput?: number; // Задач в секунду
  averageDuration?: number; // Среднее время обработки в секундах
  errorRate?: number; // Процент ошибок (0-100)
}

interface QueueStatsCardProps {
  stats: QueueStats;
  onClick?: () => void;
}

// Конфигурация очередей с понятными названиями и описаниями
const QUEUE_CONFIG: Record<string, { title: string; description: string; icon: React.ReactNode }> = {
  push: {
    title: "Push-уведомления",
    description: "Отправка push-уведомлений пользователям о шагах тренировок и других событиях",
    icon: <PushIcon />,
  },
  reengagement: {
    title: "Re-engagement",
    description: "Повторное вовлечение неактивных пользователей через персонализированные уведомления",
    icon: <ReengagementIcon />,
  },
  examCleanup: {
    title: "Очистка экзаменов",
    description: "Автоматическое удаление старых видео экзаменов для освобождения места",
    icon: <CleanupIcon />,
  },
};

export function QueueStatsCard({ stats, onClick }: QueueStatsCardProps) {
  const totalJobs = stats.waiting + stats.active + stats.failed + stats.delayed;
  const hasAnyJobs = totalJobs > 0 || stats.completed > 0;
  
  // Используем errorRate из Prometheus, если доступен, иначе вычисляем локально
  const failureRate = stats.errorRate !== undefined 
    ? stats.errorRate 
    : (stats.completed + stats.failed > 0
        ? (stats.failed / (stats.completed + stats.failed)) * 100
        : 0);

  const queueConfig = QUEUE_CONFIG[stats.name] || {
    title: stats.name,
    description: "Очередь задач",
    icon: <QueueIcon />,
  };

  const getQueueColor = () => {
    if (stats.paused) return "#9e9e9e";
    if (stats.failed > 10) return "#f44336";
    if (stats.failed > 0) return "#ff9800";
    return "#4caf50";
  };

  const getQueueBgColor = () => {
    if (stats.paused) return "#f5f5f5";
    if (stats.failed > 10) return "#ffebee";
    if (stats.failed > 0) return "#fff3e0";
    return "#e8f5e9";
  };

  return (
    <Card
      elevation={1}
      onClick={onClick}
      sx={{
        height: "100%",
        border: `2px solid ${getQueueColor()}`,
        bgcolor: getQueueBgColor(),
        transition: "all 0.3s ease",
        cursor: onClick ? "pointer" : "default",
        "&:hover": onClick
          ? {
              transform: "translateY(-4px)",
              boxShadow: 4,
            }
          : {},
      }}
    >
      <CardContent>
        <Box display="flex" alignItems="flex-start" justifyContent="space-between" mb={2}>
          <Box flex={1}>
            <Box display="flex" alignItems="center" gap={1} mb={0.5}>
              <Box sx={{ color: getQueueColor(), display: "flex", alignItems: "center" }}>
                {queueConfig.icon}
              </Box>
              <Typography variant="h6" fontWeight="bold">
                {queueConfig.title}
              </Typography>
            </Box>
            <Tooltip title={queueConfig.description} arrow>
              <Box display="flex" alignItems="center" gap={0.5}>
                <InfoIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
                  {queueConfig.description}
                </Typography>
              </Box>
            </Tooltip>
          </Box>
          {stats.paused && (
            <Chip
              icon={<PausedIcon />}
              label="Приостановлена"
              size="small"
              sx={{
                bgcolor: "#9e9e9e",
                color: "white",
                fontWeight: "bold",
              }}
            />
          )}
        </Box>

        {!hasAnyJobs && (
          <Box
            sx={{
              p: 2,
              mb: 2,
              bgcolor: "grey.100",
              borderRadius: 1,
              textAlign: "center",
            }}
          >
            <Typography variant="body2" color="text.secondary" fontWeight="medium">
              Нет активных задач в очереди
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              {stats.paused 
                ? "Очередь приостановлена. Задачи не будут обрабатываться до возобновления."
                : "Очередь работает нормально. Задачи на паузе или отложенные задачи не отображаются здесь, так как они временно удалены из очереди."}
            </Typography>
          </Box>
        )}

        {/* Статистика */}
        {hasAnyJobs && (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 1.5,
              mb: 2,
            }}
          >
          <Box>
            <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
              <WaitingIcon fontSize="small" sx={{ color: "#2196f3" }} />
              <Typography variant="caption" color="text.secondary">
                В ожидании
              </Typography>
            </Box>
            <Typography variant="h6" fontWeight="bold">
              {stats.waiting}
            </Typography>
          </Box>

          <Box>
            <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
              <ActiveIcon fontSize="small" sx={{ color: "#4caf50" }} />
              <Typography variant="caption" color="text.secondary">
                Активно
              </Typography>
            </Box>
            <Typography variant="h6" fontWeight="bold">
              {stats.active}
            </Typography>
          </Box>

          <Box>
            <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
              <CompletedIcon fontSize="small" sx={{ color: "#66bb6a" }} />
              <Typography variant="caption" color="text.secondary">
                Завершено
              </Typography>
            </Box>
            <Typography variant="h6" fontWeight="bold">
              {stats.completed}
            </Typography>
          </Box>

          <Box>
            <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
              <FailedIcon fontSize="small" sx={{ color: "#f44336" }} />
              <Typography variant="caption" color="text.secondary">
                Ошибки
              </Typography>
            </Box>
            <Typography variant="h6" fontWeight="bold" color="error">
              {stats.failed}
            </Typography>
          </Box>

          <Box>
            <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
              <DelayedIcon fontSize="small" sx={{ color: "#ff9800" }} />
              <Typography variant="caption" color="text.secondary">
                Отложено
              </Typography>
            </Box>
            <Typography variant="h6" fontWeight="bold">
              {stats.delayed}
            </Typography>
          </Box>

          <Box>
            <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
              <QueueIcon fontSize="small" sx={{ color: "#9c27b0" }} />
              <Typography variant="caption" color="text.secondary">
                Всего
              </Typography>
            </Box>
            <Typography variant="h6" fontWeight="bold">
              {totalJobs}
            </Typography>
          </Box>
        </Box>
        )}

        {/* Процент ошибок */}
        {(stats.completed > 0 || stats.failed > 0) && (
          <Box mb={1.5}>
            <Tooltip title="Процент задач, которые завершились с ошибкой от общего числа завершенных задач" arrow>
              <Box display="flex" justifyContent="space-between" mb={0.5}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  Процент ошибок
                  <InfoIcon sx={{ fontSize: 12 }} />
                </Typography>
                <Typography variant="caption" fontWeight="bold">
                  {failureRate.toFixed(1)}%
                </Typography>
              </Box>
            </Tooltip>
            <LinearProgress
              variant="determinate"
              value={Math.min(failureRate, 100)}
              sx={{
                height: 6,
                borderRadius: 3,
                bgcolor: "#e0e0e0",
                "& .MuiLinearProgress-bar": {
                  bgcolor: failureRate > 10 ? "#f44336" : failureRate > 5 ? "#ff9800" : "#4caf50",
                },
              }}
            />
          </Box>
        )}

        {/* Дополнительные метрики из Prometheus */}
        {hasAnyJobs && (stats.throughput !== undefined || stats.averageDuration !== undefined) && (
          <Box sx={{ mt: 1.5, pt: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
            {stats.throughput !== undefined && stats.throughput > 0 && (
              <Tooltip title="Сколько задач обрабатывается в секунду (рассчитывается на основе завершенных задач за последние 5 минут)" arrow>
                <Box display="flex" justifyContent="space-between" mb={0.5}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    Производительность:
                    <InfoIcon sx={{ fontSize: 12 }} />
                  </Typography>
                  <Typography variant="caption" fontWeight="medium">
                    {stats.throughput.toFixed(2)} задач/с
                  </Typography>
                </Box>
              </Tooltip>
            )}
            {stats.averageDuration !== undefined && stats.averageDuration > 0 && (
              <Tooltip title="Среднее время обработки одной задачи" arrow>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    Среднее время:
                    <InfoIcon sx={{ fontSize: 12 }} />
                  </Typography>
                  <Typography variant="caption" fontWeight="medium">
                    {stats.averageDuration.toFixed(2)}с
                  </Typography>
                </Box>
              </Tooltip>
            )}
          </Box>
        )}

        {/* Информация об отложенных задачах */}
        {stats.delayed > 0 && (
          <Box
            sx={{
              mt: 1.5,
              p: 1.5,
              bgcolor: "warning.light",
              borderRadius: 1,
              border: "1px solid",
              borderColor: "warning.main",
            }}
          >
            <Box display="flex" alignItems="center" gap={1} mb={0.5}>
              <DelayedIcon sx={{ fontSize: 16, color: "warning.dark" }} />
              <Typography variant="caption" fontWeight="bold" color="warning.dark">
                Отложено: {stats.delayed} {stats.delayed === 1 ? "задача" : stats.delayed < 5 ? "задачи" : "задач"}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Задача запланирована на выполнение в будущем. Она будет обработана автоматически в назначенное время.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

