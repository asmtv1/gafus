import { Card, CardContent, Box, Typography, LinearProgress, Divider } from "@mui/material";
import {
  Memory as MemoryIcon,
  Speed as CpuIcon,
  AccessTime as UptimeIcon,
} from "@mui/icons-material";

interface SystemMetrics {
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  cpu: {
    count: number;
    model: string;
    usage: number;
  };
  uptime: number;
}

interface SystemMetricsCardProps {
  metrics: SystemMetrics;
}

// Форматирование байтов в читаемый формат
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

// Форматирование времени работы
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}д`);
  if (hours > 0) parts.push(`${hours}ч`);
  if (minutes > 0) parts.push(`${minutes}м`);

  return parts.join(" ") || "< 1м";
}

export function SystemMetricsCard({ metrics }: SystemMetricsCardProps) {
  const memoryPercentage = metrics.memory.percentage;
  const memoryColor =
    memoryPercentage < 70 ? "#4caf50" : memoryPercentage < 85 ? "#ff9800" : "#f44336";

  const cpuPercentage = (metrics.cpu.usage / metrics.cpu.count) * 100;
  const cpuColor = cpuPercentage < 70 ? "#4caf50" : cpuPercentage < 85 ? "#ff9800" : "#f44336";

  return (
    <Card
      elevation={1}
      sx={{
        height: "100%",
        border: "2px solid #2196f3",
        bgcolor: "#e3f2fd",
        transition: "all 0.3s ease",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: 4,
        },
      }}
    >
      <CardContent>
        <Typography variant="h6" fontWeight="bold" mb={2}>
          Системные метрики
        </Typography>

        {/* Memory */}
        <Box mb={2}>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <MemoryIcon color="primary" />
            <Typography variant="body1" fontWeight="medium">
              Память
            </Typography>
          </Box>
          <Box mb={0.5}>
            <LinearProgress
              variant="determinate"
              value={memoryPercentage}
              sx={{
                height: 10,
                borderRadius: 5,
                bgcolor: "#e0e0e0",
                "& .MuiLinearProgress-bar": {
                  bgcolor: memoryColor,
                },
              }}
            />
          </Box>
          <Box display="flex" justifyContent="space-between" mb={0.5}>
            <Typography variant="caption" color="text.secondary">
              Использовано: {formatBytes(metrics.memory.used)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {memoryPercentage.toFixed(1)}%
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            Всего: {formatBytes(metrics.memory.total)} | Свободно:{" "}
            {formatBytes(metrics.memory.free)}
          </Typography>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* CPU */}
        <Box mb={2}>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <CpuIcon color="primary" />
            <Typography variant="body1" fontWeight="medium">
              CPU
            </Typography>
          </Box>
          <Box mb={0.5}>
            <LinearProgress
              variant="determinate"
              value={Math.min(cpuPercentage, 100)}
              sx={{
                height: 10,
                borderRadius: 5,
                bgcolor: "#e0e0e0",
                "& .MuiLinearProgress-bar": {
                  bgcolor: cpuColor,
                },
              }}
            />
          </Box>
          <Box display="flex" justifyContent="space-between" mb={0.5}>
            <Typography variant="caption" color="text.secondary">
              Средняя загрузка: {metrics.cpu.usage.toFixed(2)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {cpuPercentage.toFixed(1)}%
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            Ядер: {metrics.cpu.count}
          </Typography>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Uptime */}
        <Box>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <UptimeIcon color="primary" />
            <Typography variant="body1" fontWeight="medium">
              Время работы
            </Typography>
          </Box>
          <Typography variant="h5" fontWeight="bold" color="primary">
            {formatUptime(metrics.uptime)}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

