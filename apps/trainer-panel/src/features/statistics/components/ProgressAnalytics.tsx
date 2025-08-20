import { Speed, TrendingDown, Repeat, EmojiEvents, Timeline } from "@mui/icons-material";

import { Typography, Box, Paper, Chip, LinearProgress } from "@/utils/muiImports";

interface ProgressAnalyticsProps {
  progressAnalytics: {
    averageCompletionTime: number;
    dropoutPoints: { dayOrder: number; dropoutRate: number }[];
    repeatUsers: number;
    achievements: { type: string; count: number }[];
  };
}

export default function ProgressAnalytics({ progressAnalytics }: ProgressAnalyticsProps) {
  const { averageCompletionTime, dropoutPoints, repeatUsers, achievements } = progressAnalytics;

  // Находим критическую точку отсева (без ошибки на пустом массиве)
  const criticalDropoutPoint =
    dropoutPoints && dropoutPoints.length > 0
      ? dropoutPoints.reduce((max, point) => (point.dropoutRate > max.dropoutRate ? point : max))
      : null;

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Прогресс и достижения
      </Typography>

      {/* Основные метрики */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 3 }}>
        <Box sx={{ flex: "1 1 250px", minWidth: 0 }}>
          <Paper sx={{ p: 2, textAlign: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
              <Speed sx={{ color: "primary.main", mr: 1 }} />
              <Typography variant="h5" color="primary" fontWeight="bold">
                {averageCompletionTime}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Среднее время (дни)
            </Typography>
            <Chip label="завершения курса" size="small" color="primary" variant="outlined" />
          </Paper>
        </Box>

        <Box sx={{ flex: "1 1 250px", minWidth: 0 }}>
          <Paper sx={{ p: 2, textAlign: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
              <TrendingDown sx={{ color: "error.main", mr: 1 }} />
              <Typography variant="h5" color="error" fontWeight="bold">
                {criticalDropoutPoint ? `День ${criticalDropoutPoint.dayOrder}` : "Нет данных"}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Критическая точка
            </Typography>
            {criticalDropoutPoint && (
              <Chip
                label={`${criticalDropoutPoint.dropoutRate}% отсев`}
                size="small"
                color="error"
                variant="outlined"
              />
            )}
          </Paper>
        </Box>

        <Box sx={{ flex: "1 1 250px", minWidth: 0 }}>
          <Paper sx={{ p: 2, textAlign: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
              <Repeat sx={{ color: "secondary.main", mr: 1 }} />
              <Typography variant="h5" color="secondary" fontWeight="bold">
                {repeatUsers}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Повторные прохождения
            </Typography>
            <Chip label="пользователей" size="small" color="secondary" variant="outlined" />
          </Paper>
        </Box>

        <Box sx={{ flex: "1 1 250px", minWidth: 0 }}>
          <Paper sx={{ p: 2, textAlign: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
              <EmojiEvents sx={{ color: "warning.main", mr: 1 }} />
              <Typography variant="h5" color="warning" fontWeight="bold">
                {achievements.length}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Типов достижений
            </Typography>
            <Chip label="доступно" size="small" color="warning" variant="outlined" />
          </Paper>
        </Box>
      </Box>

      {/* Точки отсева */}
      <Typography variant="subtitle1" gutterBottom>
        Анализ точек отсева
      </Typography>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <Timeline sx={{ color: "error.main" }} />
          <Typography variant="subtitle2" color="error.main" fontWeight="bold">
            Процент отсева по дням курса
          </Typography>
        </Box>
        <Box sx={{ maxHeight: 200, overflowY: "auto" }}>
          {dropoutPoints.map((point, index) => (
            <Box key={index} sx={{ mb: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  День {point.dayOrder}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {point.dropoutRate}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={point.dropoutRate}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: "grey.200",
                  "& .MuiLinearProgress-bar": {
                    borderRadius: 3,
                    backgroundColor:
                      point.dropoutRate >= 50
                        ? "error.main"
                        : point.dropoutRate >= 25
                          ? "warning.main"
                          : "info.main",
                  },
                }}
              />
            </Box>
          ))}
        </Box>
      </Paper>

      {/* Достижения */}
      <Typography variant="subtitle1" gutterBottom>
        Достижения пользователей
      </Typography>
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
          {achievements.map((achievement, index) => (
            <Box key={index} sx={{ flex: "1 1 200px", minWidth: 0 }}>
              <Box sx={{ textAlign: "center", p: 2 }}>
                <Box
                  sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}
                >
                  <EmojiEvents sx={{ color: "warning.main", mr: 1 }} />
                  <Typography variant="h6" color="warning.main" fontWeight="bold">
                    {achievement.count}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {achievement.type}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Paper>
    </Box>
  );
}
