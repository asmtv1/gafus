import { Card, CardContent, Box, Typography, Chip, LinearProgress } from "@mui/material";
import {
  Queue as QueueIcon,
  CheckCircle as CompletedIcon,
  Error as FailedIcon,
  HourglassEmpty as WaitingIcon,
  PlayArrow as ActiveIcon,
  Schedule as DelayedIcon,
  Pause as PausedIcon,
} from "@mui/icons-material";

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

interface QueueStatsCardProps {
  stats: QueueStats;
  onClick?: () => void;
}

export function QueueStatsCard({ stats, onClick }: QueueStatsCardProps) {
  const totalJobs = stats.waiting + stats.active + stats.failed + stats.delayed;
  const failureRate =
    stats.completed + stats.failed > 0
      ? (stats.failed / (stats.completed + stats.failed)) * 100
      : 0;

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
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center" gap={1}>
            <QueueIcon sx={{ color: getQueueColor(), fontSize: 28 }} />
            <Typography variant="h6" fontWeight="bold">
              {stats.name}
            </Typography>
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

        {/* Статистика */}
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

        {/* Процент ошибок */}
        {(stats.completed > 0 || stats.failed > 0) && (
          <Box>
            <Box display="flex" justifyContent="space-between" mb={0.5}>
              <Typography variant="caption" color="text.secondary">
                Процент ошибок
              </Typography>
              <Typography variant="caption" fontWeight="bold">
                {failureRate.toFixed(1)}%
              </Typography>
            </Box>
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
      </CardContent>
    </Card>
  );
}

