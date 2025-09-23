import { TrendingUp, TrendingDown, Speed, CheckCircle, Warning } from "@mui/icons-material";

import { Typography, Box, Paper, Chip, LinearProgress } from "@/utils/muiImports";

interface DayAnalyticsProps {
  dayAnalytics: {
    dayId: string;
    dayTitle: string;
    dayOrder: number;
    totalSteps: number;
    completedSteps: number;
    completionRate: number;
    averageTimePerStep: number;
    difficultyScore: number;
  }[];
}

export default function DayAnalytics({ dayAnalytics }: DayAnalyticsProps) {
  if (!dayAnalytics || dayAnalytics.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          Нет данных для анализа дней
        </Typography>
      </Paper>
    );
  }

  // Сортируем дни по сложности
  const sortedByDifficulty = [...dayAnalytics].sort(
    (a, b) => b.difficultyScore - a.difficultyScore,
  );
  const hardestDay = sortedByDifficulty[0];
  const easiestDay = sortedByDifficulty[sortedByDifficulty.length - 1];

  return (
    <Box>
      <Typography variant="h6" gutterBottom color="text.primary">
        Аналитика по дням
      </Typography>

      {/* Самые сложные и легкие дни */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 3 }}>
        <Box sx={{ flex: "1 1 300px", minWidth: 0 }}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <Warning sx={{ color: "error.main" }} />
              <Typography variant="subtitle1" fontWeight="bold" color="error.main">
                Самый сложный день
              </Typography>
            </Box>
            <Typography variant="h6" gutterBottom>
              {hardestDay?.dayTitle}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              День {hardestDay?.dayOrder} • {hardestDay?.completionRate}% завершения
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Сложность:
              </Typography>
              <Chip
                label={`${hardestDay?.difficultyScore}%`}
                size="small"
                color="error"
                variant="outlined"
              />
            </Box>
          </Paper>
        </Box>

        <Box sx={{ flex: "1 1 300px", minWidth: 0 }}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <CheckCircle sx={{ color: "success.main" }} />
              <Typography variant="subtitle1" fontWeight="bold" color="success.main">
                Самый легкий день
              </Typography>
            </Box>
            <Typography variant="h6" gutterBottom>
              {easiestDay?.dayTitle}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              День {easiestDay?.dayOrder} • {easiestDay?.completionRate}% завершения
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Сложность:
              </Typography>
              <Chip
                label={`${easiestDay?.difficultyScore}%`}
                size="small"
                color="success"
                variant="outlined"
              />
            </Box>
          </Paper>
        </Box>
      </Box>

      {/* Детальная статистика по дням */}
      <Typography variant="subtitle1" gutterBottom color="text.primary">
        Детальная статистика по дням
      </Typography>
      <Box sx={{ maxHeight: 400, overflowY: "auto" }}>
        {dayAnalytics.map((day, index) => (
          <Paper key={`${day.dayId}-${index}`} sx={{ p: 2, mb: 2 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                mb: 2,
              }}
            >
              <Box>
                <Typography variant="h6" gutterBottom color="text.primary">
                  День {day.dayOrder}: {day.dayTitle}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {day.completedSteps} из {day.totalSteps} шагов завершено
                </Typography>
              </Box>
              <Chip
                label={`${day.completionRate}%`}
                color={
                  day.completionRate >= 80
                    ? "success"
                    : day.completionRate >= 50
                      ? "warning"
                      : "error"
                }
                variant="outlined"
              />
            </Box>

            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Прогресс
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {day.completionRate}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={day.completionRate}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: "grey.200",
                  "& .MuiLinearProgress-bar": {
                    borderRadius: 4,
                  },
                }}
              />
            </Box>

            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
              <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>
                <Box sx={{ textAlign: "center" }}>
                  <Box
                    sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}
                  >
                    <Speed sx={{ color: "info.main", mr: 1 }} />
                    <Typography variant="h6" color="text.primary" fontWeight="bold">
                      {day.averageTimePerStep}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    Среднее время (сек)
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>
                <Box sx={{ textAlign: "center" }}>
                  <Box
                    sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}
                  >
                    {day.difficultyScore >= 70 ? (
                      <TrendingDown sx={{ color: "error.main", mr: 1 }} />
                    ) : day.difficultyScore >= 40 ? (
                      <Warning sx={{ color: "warning.main", mr: 1 }} />
                    ) : (
                      <TrendingUp sx={{ color: "success.main", mr: 1 }} />
                    )}
                    <Typography
                      variant="h6"
                      color={
                        day.difficultyScore >= 70
                          ? "error.main"
                          : day.difficultyScore >= 40
                            ? "warning.main"
                            : "success.main"
                      }
                      fontWeight="bold"
                    >
                      {day.difficultyScore}%
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    Сложность
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}
