"use client";

import { 
  Card, 
  CardContent, 
  Typography, 
  Box, 
  LinearProgress,
  CircularProgress,
  Alert,
  Chip,
  Avatar,
  Tooltip,
  IconButton
} from "@mui/material";
import { 
  BugReport as BugIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  TrendingUp as TrendingIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon
} from "@mui/icons-material";
import { useErrorStats } from "@shared/hooks/useErrorStats";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface StatCardProps {
  title: string;
  value: number;
  change?: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'stable';
}

function StatCard({ title, value, change, icon, color, bgColor, subtitle, trend }: StatCardProps) {
  const formatChange = (change?: number) => {
    if (!change) return null;
    const sign = change > 0 ? '+' : '';
    return `${sign}${change}%`;
  };

  const getTrendColor = (trend?: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return 'error';
      case 'down': return 'success';
      case 'stable': return 'info';
      default: return 'default';
    }
  };

  return (
    <Card 
      elevation={1}
      sx={{ 
        height: '100%',
        background: `linear-gradient(135deg, ${bgColor}15 0%, ${bgColor}08 100%)`,
        border: `1px solid ${color}25`,
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: `0 4px 12px ${color}25`,
        }
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Avatar 
            sx={{ 
              bgcolor: color,
              width: 48,
              height: 48,
              boxShadow: `0 2px 8px ${color}30`
            }}
          >
            {icon}
          </Avatar>
          
          {change !== undefined && (
            <Chip
              label={formatChange(change)}
              color={getTrendColor(trend)}
              size="small"
              icon={trend === 'up' ? <TrendingIcon /> : undefined}
              sx={{ 
                fontWeight: 'bold',
                transform: trend === 'down' ? 'rotate(180deg)' : 'none'
              }}
            />
          )}
        </Box>

        <Typography variant="h3" component="div" fontWeight="bold" color={color} mb={1}>
          {value.toLocaleString('ru-RU')}
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

  if (isLoading) {
    return (
      <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }} gap={3}>
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

  if (!stats || !stats.success || !stats.stats) {
    return (
      <Alert severity="info">
        Статистика недоступна
      </Alert>
    );
  }

  const { total, unresolved } = stats.stats;
  const resolvedCount = total - unresolved;
  const resolvedPercentage = total > 0 ? (resolvedCount / total) * 100 : 0;
  const critical = Math.floor(unresolved * 0.2); // Примерно 20% от нерешенных - критические
  const criticalPercentage = total > 0 ? (critical / total) * 100 : 0;

  // Симулируем изменения (в реальном приложении это будет из API)
  const mockChanges = {
    total: Math.floor(Math.random() * 20) - 10, // -10% to +10%
    unresolved: Math.floor(Math.random() * 15) - 5,
    resolved: Math.floor(Math.random() * 10),
    critical: Math.floor(Math.random() * 25) - 15,
  };

  const getTrend = (change: number): 'up' | 'down' | 'stable' => {
    if (change > 5) return 'up';
    if (change < -5) return 'down';
    return 'stable';
  };

  const statCards = [
    {
      title: "Всего ошибок",
      value: total,
      change: mockChanges.total,
      trend: getTrend(mockChanges.total),
      icon: <BugIcon />,
      color: "#7986cb",
      bgColor: "#7986cb",
      subtitle: `За все время`
    },
    {
      title: "Активных ошибок",
      value: unresolved,
      change: mockChanges.unresolved,
      trend: getTrend(mockChanges.unresolved),
      icon: <WarningIcon />,
      color: "#ffb74d",
      bgColor: "#ffb74d",
      subtitle: `Требуют внимания`
    },
    {
      title: "Критических ошибок",
      value: critical,
      change: mockChanges.critical,
      trend: getTrend(mockChanges.critical),
      icon: <BugIcon />,
      color: "#f48fb1",
      bgColor: "#f48fb1",
      subtitle: `${criticalPercentage.toFixed(1)}% от общего числа`
    },
    {
      title: "Разрешено",
      value: resolvedCount,
      change: mockChanges.resolved,
      trend: getTrend(mockChanges.resolved),
      icon: <CheckIcon />,
      color: "#81c784",
      bgColor: "#81c784",
      subtitle: `${resolvedPercentage.toFixed(1)}% успешности`
    }
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

      <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }} gap={3}>
        {statCards.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </Box>

      {/* Прогресс-бар общего здоровья системы */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography variant="h6" fontWeight="bold">
              Здоровье системы
            </Typography>
            <Chip 
              label={`${(100 - (unresolved / total) * 100).toFixed(1)}%`}
              color={resolvedPercentage > 80 ? "success" : resolvedPercentage > 60 ? "warning" : "error"}
              variant="outlined"
            />
          </Box>
          
          <LinearProgress
            variant="determinate"
            value={resolvedPercentage}
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor: 'grey.200',
              '& .MuiLinearProgress-bar': {
                borderRadius: 4,
                background: `linear-gradient(90deg, ${
                  resolvedPercentage > 80 ? '#4caf50' : 
                  resolvedPercentage > 60 ? '#ff9800' : '#f44336'
                } 0%, ${
                  resolvedPercentage > 80 ? '#8bc34a' : 
                  resolvedPercentage > 60 ? '#ffc107' : '#e91e63'
                } 100%)`
              }
            }}
          />
          
          <Box display="flex" justifyContent="space-between" mt={1}>
            <Typography variant="body2" color="text.secondary">
              Последнее обновление: {formatDistanceToNow(new Date(), { addSuffix: true, locale: ru })}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {resolvedCount} из {total} ошибок разрешено
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

// Skeleton компонент для Suspense
ModernErrorStats.Skeleton = function ModernErrorStatsSkeleton() {
  return (
    <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }} gap={3}>
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
