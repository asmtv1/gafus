import { Schedule, CalendarToday, AccessTime } from "@mui/icons-material";

import { Typography, Box, Paper, Chip } from "@/utils/muiImports";

interface TimeAnalyticsProps {
  timeAnalytics: {
    activityByDayOfWeek: Record<string, number>;
    activityByHour: Record<string, number>;
    activityByMonth: Record<string, number>;
    averageTimeBetweenSessions: number;
  };
}

export default function TimeAnalytics({ timeAnalytics }: TimeAnalyticsProps) {
  const { activityByDayOfWeek, activityByHour, activityByMonth, averageTimeBetweenSessions } =
    timeAnalytics;

  // Находим пиковые дни и часы
  const peakDay = Object.entries(activityByDayOfWeek).reduce((a, b) => (a[1] > b[1] ? a : b));
  const peakHour = Object.entries(activityByHour).reduce((a, b) => (a[1] > b[1] ? a : b));
  const _peakMonth = Object.entries(activityByMonth).reduce((a, b) => (a[1] > b[1] ? a : b));

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Временная аналитика
      </Typography>

      {/* Основные метрики */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 3 }}>
        <Box sx={{ flex: "1 1 250px", minWidth: 0 }}>
          <Paper sx={{ p: 2, textAlign: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
              <CalendarToday sx={{ color: "primary.main", mr: 1 }} />
              <Typography variant="h5" color="primary" fontWeight="bold">
                {peakDay[0]}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Самый активный день
            </Typography>
            <Chip
              label={`${peakDay[1]} активностей`}
              size="small"
              color="primary"
              variant="outlined"
            />
          </Paper>
        </Box>

        <Box sx={{ flex: "1 1 250px", minWidth: 0 }}>
          <Paper sx={{ p: 2, textAlign: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
              <AccessTime sx={{ color: "secondary.main", mr: 1 }} />
              <Typography variant="h5" color="secondary" fontWeight="bold">
                {peakHour[0]}:00
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Пиковое время
            </Typography>
            <Chip
              label={`${peakHour[1]} активностей`}
              size="small"
              color="secondary"
              variant="outlined"
            />
          </Paper>
        </Box>

        <Box sx={{ flex: "1 1 250px", minWidth: 0 }}>
          <Paper sx={{ p: 2, textAlign: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
              <Schedule sx={{ color: "info.main", mr: 1 }} />
              <Typography variant="h5" color="info" fontWeight="bold">
                {averageTimeBetweenSessions}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Средний интервал (часы)
            </Typography>
            <Chip label="между занятиями" size="small" color="info" variant="outlined" />
          </Paper>
        </Box>
      </Box>

      {/* Активность по дням недели */}
      <Typography variant="subtitle1" gutterBottom>
        Активность по дням недели
      </Typography>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {Object.entries(activityByDayOfWeek).map(([day, count]) => (
            <Box key={day} sx={{ flex: "1 1 120px", minWidth: 0 }}>
              <Box sx={{ textAlign: "center", p: 1 }}>
                <Typography variant="h6" color="primary" fontWeight="bold">
                  {count}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {day}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Paper>

      {/* Активность по часам */}
      <Typography variant="subtitle1" gutterBottom>
        Активность по времени суток
      </Typography>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {Object.entries(activityByHour).map(([hour, count]) => (
            <Box key={hour} sx={{ flex: "1 1 80px", minWidth: 0 }}>
              <Box sx={{ textAlign: "center", p: 1 }}>
                <Typography variant="h6" color="secondary" fontWeight="bold">
                  {count}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {hour}:00
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Paper>

      {/* Активность по месяцам */}
      <Typography variant="subtitle1" gutterBottom>
        Сезонная активность
      </Typography>
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {Object.entries(activityByMonth).map(([month, count]) => (
            <Box key={month} sx={{ flex: "1 1 120px", minWidth: 0 }}>
              <Box sx={{ textAlign: "center", p: 1 }}>
                <Typography variant="h6" color="success.main" fontWeight="bold">
                  {count}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {month}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Paper>
    </Box>
  );
}
