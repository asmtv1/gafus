"use client";

import {
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Avatar,
  Tooltip,
  IconButton,
} from "@mui/material";
import {
  BugReport as BugIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
} from "@mui/icons-material";
import { useErrorStats } from "@shared/hooks/useErrorStats";

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  subtitle?: string;
}

function StatCard({ title, value, icon, color, bgColor, subtitle }: StatCardProps) {
  return (
    <Card
      elevation={1}
      sx={{
        height: "100%",
        background: `linear-gradient(135deg, ${bgColor}15 0%, ${bgColor}08 100%)`,
        border: `1px solid ${color}25`,
        transition: "all 0.3s ease",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: `0 4px 12px ${color}25`,
        },
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Avatar
            sx={{
              bgcolor: color,
              width: 48,
              height: 48,
              boxShadow: `0 2px 8px ${color}30`,
            }}
          >
            {icon}
          </Avatar>
        </Box>

        <Typography variant="h3" component="div" fontWeight="bold" color={color} mb={1}>
          {value.toLocaleString("ru-RU")}
        </Typography>

        <Typography variant="h6" color="text.secondary" mb={1}>
          {title}
        </Typography>

        {subtitle && (
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function ModernErrorStats() {
  const { data: stats, error, isLoading, refetch } = useErrorStats();

  // Детальное логирование для диагностики
  console.warn("[ModernErrorStats] Component rendered:", {
    isLoading,
    hasError: !!error,
    errorMessage: error?.message,
    hasStats: !!stats,
    statsSuccess: stats?.success,
    statsTotal: stats?.stats?.total,
    statsUnresolved: stats?.stats?.unresolved,
    fullStats: stats ? JSON.stringify(stats) : "null",
  });

  if (isLoading) {
    return (
      <Box
        display="grid"
        gridTemplateColumns={{ xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }}
        gap={3}
      >
        {[1, 2, 3, 4].map((index) => (
          <Card key={index}>
            <CardContent sx={{ p: 3 }}>
              <Box display="flex" justifyContent="center" alignItems="center" height={120}>
                <CircularProgress />
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <IconButton color="inherit" size="small" onClick={() => refetch()}>
            <RefreshIcon />
          </IconButton>
        }
      >
        Ошибка загрузки статистики: {error.message}
      </Alert>
    );
  }

  // Улучшенная проверка доступности статистики
  // Проверяем структуру данных более детально
  const isStatsValid =
    stats &&
    stats.success === true &&
    stats.stats &&
    typeof stats.stats === "object" &&
    typeof stats.stats.total === "number" &&
    typeof stats.stats.critical === "number";

  console.warn("[ModernErrorStats] Stats validation:", {
    hasStats: !!stats,
    statsSuccess: stats?.success,
    hasStatsObject: !!stats?.stats,
    statsObjectType: typeof stats?.stats,
    hasTotalField: stats?.stats && "total" in stats.stats,
    totalType: typeof stats?.stats?.total,
    isStatsValid,
  });

  if (!isStatsValid) {
    return <Alert severity="info">Статистика недоступна</Alert>;
  }

  const { total, unresolved, critical } = stats.stats || { total: 0, unresolved: 0, critical: 0 };
  const criticalPercentage = total > 0 ? (critical / total) * 100 : 0;

  const statCards = [
    {
      title: "Всего ошибок",
      value: total,
      icon: <BugIcon />,
      color: "#7986cb",
      bgColor: "#7986cb",
      subtitle: `За все время`,
    },
    {
      title: "Активных ошибок",
      value: unresolved,
      icon: <WarningIcon />,
      color: "#ffb74d",
      bgColor: "#ffb74d",
      subtitle: `Требуют внимания`,
    },
    {
      title: "Критических ошибок",
      value: critical,
      icon: <BugIcon />,
      color: "#f48fb1",
      bgColor: "#f48fb1",
      subtitle: `${criticalPercentage.toFixed(1)}% от общего числа`,
    },
  ];

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Typography variant="h4" component="h2" fontWeight="bold">
          Общая статистика
        </Typography>

        <Box display="flex" alignItems="center" gap={2}>
          <Tooltip title="Обновить статистику">
            <IconButton onClick={() => refetch()} color="primary">
              <RefreshIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="Информация о статистике">
            <IconButton color="info">
              <InfoIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box
        display="grid"
        gridTemplateColumns={{ xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }}
        gap={3}
      >
        {statCards.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </Box>
    </Box>
  );
}

// Skeleton компонент для Suspense
ModernErrorStats.Skeleton = function ModernErrorStatsSkeleton() {
  return (
    <Box
      display="grid"
      gridTemplateColumns={{ xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }}
      gap={3}
    >
      {[1, 2, 3, 4].map((index) => (
        <Card key={index}>
          <CardContent sx={{ p: 3 }}>
            <Box display="flex" justifyContent="center" alignItems="center" height={120}>
              <CircularProgress />
            </Box>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
};

export default ModernErrorStats;
