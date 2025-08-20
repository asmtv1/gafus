import { BugReport, Warning, CheckCircle, Apps } from "@mui/icons-material";
import { Card, CardContent, Typography, Box, LinearProgress } from "@mui/material";

interface ErrorStatsProps {
  stats: {
    total: number;
    unresolved: number;
    byApp: { appName: string; _count: { id: number } }[];
    byEnvironment: { environment: string; _count: { id: number } }[];
  };
}

export default function ErrorStats({ stats }: ErrorStatsProps) {
  const resolvedCount = stats.total - stats.unresolved;
  const resolvedPercentage = stats.total > 0 ? (resolvedCount / stats.total) * 100 : 0;

  const statCards = [
    {
      title: "Всего ошибок",
      value: stats.total,
      icon: <BugReport />,
      color: "error" as const,
      progress: null,
    },
    {
      title: "Неразрешенных",
      value: stats.unresolved,
      icon: <Warning />,
      color: "warning" as const,
      progress: stats.total > 0 ? (stats.unresolved / stats.total) * 100 : 0,
    },
    {
      title: "Разрешенных",
      value: resolvedCount,
      icon: <CheckCircle />,
      color: "success" as const,
      progress: resolvedPercentage,
    },
    {
      title: "Приложений",
      value: stats.byApp.length,
      icon: <Apps />,
      color: "info" as const,
      progress: null,
    },
  ];

  return (
    <Box
      sx={{
        display: "grid",
        gap: 3,
        gridTemplateColumns: {
          xs: "1fr",
          sm: "repeat(2, 1fr)",
          md: "repeat(4, 1fr)",
        },
      }}
    >
      {statCards.map((card, index) => (
        <Box key={index}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Box
                  sx={{
                    backgroundColor: `${card.color}.light`,
                    color: `${card.color}.main`,
                    borderRadius: 1,
                    p: 1,
                    mr: 2,
                  }}
                >
                  {card.icon}
                </Box>
                <Box flex={1}>
                  <Typography variant="h4" component="div" fontWeight="bold">
                    {card.value}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {card.title}
                  </Typography>
                </Box>
              </Box>

              {card.progress !== null && (
                <Box mt={2}>
                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography variant="caption" color="text.secondary">
                      Процент
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {card.progress.toFixed(1)}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={card.progress}
                    color={card.color}
                    sx={{ height: 6, borderRadius: 3 }}
                  />
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      ))}
    </Box>
  );
}
