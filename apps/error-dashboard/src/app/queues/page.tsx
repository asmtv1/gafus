"use client";

import { useState } from "react";
import {
  Box,
  Container,
  Typography,
  Paper,
  Chip,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Button,
  Card,
  CardContent,
} from "@mui/material";
import {
  Queue as QueueIcon,
  CheckCircle as CheckIcon,
  Refresh as RefreshIcon,
  Schedule as ScheduleIcon,
  PlaylistAddCheck as BulkRetryIcon,
} from "@mui/icons-material";
import { NavigationTabs } from "@shared/components/NavigationTabs";
import { useQueuesStats } from "@shared/hooks/useQueuesStats";
import { useQueueJobs, useBulkRetry } from "@shared/hooks/useQueueJobs";
import { QueueStatsCard } from "@features/queues/components/QueueStatsCard";
import { FailedJobsList } from "@features/queues/components/FailedJobsList";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

// Отключаем статическую генерацию для real-time данных
export const dynamic = "force-dynamic";

export default function QueuesPage() {
  const [selectedQueue, setSelectedQueue] = useState<string | undefined>(undefined);
  const { data: stats, error: statsError, isLoading: statsLoading, refetch: refetchStats } = useQueuesStats();
  const { data: jobs, error: jobsError, isLoading: jobsLoading, refetch: refetchJobs } = useQueueJobs(selectedQueue);
  const bulkRetry = useBulkRetry();

  const handleBulkRetry = async (queueName: string) => {
    try {
      await bulkRetry.mutateAsync({ queueName });
    } catch (error) {
      console.error("Error bulk retrying:", error);
    }
  };

  const handleRefreshAll = () => {
    refetchStats();
    refetchJobs();
  };

  if (statsLoading) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#f8f9fa" }}>
        <Container maxWidth="xl" sx={{ py: 4 }}>
          <NavigationTabs />
          <Box display="flex" justifyContent="center" alignItems="center" height={400}>
            <CircularProgress />
          </Box>
        </Container>
      </Box>
    );
  }

  if (statsError) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#f8f9fa" }}>
        <Container maxWidth="xl" sx={{ py: 4 }}>
          <NavigationTabs />
          <Alert
            severity="error"
            action={
              <IconButton color="inherit" size="small" onClick={() => refetchStats()}>
                <RefreshIcon />
              </IconButton>
            }
          >
            Ошибка загрузки статистики очередей: {statsError.message}
          </Alert>
        </Container>
      </Box>
    );
  }

  if (!stats) {
    return null;
  }

  const totalFailed = stats.totalJobs.failed;
  const isSystemHealthy = totalFailed === 0;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f8f9fa" }}>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        {/* Навигация */}
        <NavigationTabs />

        {/* Заголовок */}
        <Paper
          elevation={1}
          sx={{
            p: 4,
            mb: 4,
            background: "linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)",
            border: "1px solid #9c27b0",
          }}
        >
          <Box display="flex" alignItems="center" gap={2} mb={2}>
            <QueueIcon sx={{ fontSize: 40, color: "#9c27b0" }} />
            <Box flex={1}>
              <Typography variant="h3" component="h1" fontWeight="bold" color="#4a148c">
                Мониторинг очередей
              </Typography>
              <Typography variant="h6" sx={{ color: "#6a1b9a" }}>
                Статистика задач и управление ошибками
              </Typography>
            </Box>
            <Tooltip title="Обновить данные">
              <IconButton onClick={handleRefreshAll} color="primary" size="large">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <Box display="flex" gap={1} flexWrap="wrap">
            <Chip
              icon={<CheckIcon />}
              label={isSystemHealthy ? "Нет ошибок" : `Ошибок: ${totalFailed}`}
              color={isSystemHealthy ? "success" : "error"}
              variant="outlined"
              sx={{
                bgcolor: isSystemHealthy
                  ? "rgba(76, 175, 80, 0.1)"
                  : "rgba(244, 67, 54, 0.1)",
                color: isSystemHealthy ? "#2e7d32" : "#c62828",
              }}
            />
            <Chip
              icon={<ScheduleIcon />}
              label={`Обновлено ${formatDistanceToNow(new Date(stats.timestamp), {
                addSuffix: true,
                locale: ru,
              })}`}
              color="info"
              variant="outlined"
              sx={{ bgcolor: "rgba(33, 150, 243, 0.1)", color: "#1565c0" }}
            />
            <Chip
              label={`В ожидании: ${stats.totalJobs.waiting}`}
              color="primary"
              variant="outlined"
              sx={{ bgcolor: "rgba(33, 150, 243, 0.1)" }}
            />
            <Chip
              label={`Активно: ${stats.totalJobs.active}`}
              color="success"
              variant="outlined"
              sx={{ bgcolor: "rgba(76, 175, 80, 0.1)" }}
            />
          </Box>
        </Paper>

        {/* Общая статистика */}
        <Box mb={4}>
          <Typography variant="h5" fontWeight="bold" mb={2}>
            Общая статистика
          </Typography>
          <Card elevation={1}>
            <CardContent>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "repeat(2, 1fr)",
                    sm: "repeat(3, 1fr)",
                    md: "repeat(5, 1fr)",
                  },
                  gap: 3,
                }}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    В ожидании
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="primary">
                    {stats.totalJobs.waiting}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Активно
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: "#4caf50" }}>
                    {stats.totalJobs.active}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Завершено
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: "#66bb6a" }}>
                    {stats.totalJobs.completed}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Ошибки
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="error">
                    {stats.totalJobs.failed}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Отложено
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" sx={{ color: "#ff9800" }}>
                    {stats.totalJobs.delayed}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Статистика по очередям */}
        <Box mb={4}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography variant="h5" fontWeight="bold">
              Очереди
            </Typography>
            {selectedQueue && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => setSelectedQueue(undefined)}
              >
                Показать все
              </Button>
            )}
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, 1fr)",
                md: "repeat(3, 1fr)",
              },
              gap: 3,
            }}
          >
            {stats.queues.map((queueStats) => (
              <QueueStatsCard
                key={queueStats.name}
                stats={queueStats}
                onClick={() => setSelectedQueue(queueStats.name)}
              />
            ))}
          </Box>
        </Box>

        {/* Список проблемных задач */}
        <Box mb={4}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography variant="h5" fontWeight="bold">
              Проблемные задачи
            </Typography>
            {selectedQueue && jobs && jobs.jobs.length > 0 && (
              <Button
                variant="contained"
                color="primary"
                startIcon={<BulkRetryIcon />}
                onClick={() => handleBulkRetry(selectedQueue)}
                disabled={bulkRetry.isPending}
              >
                Повторить все
              </Button>
            )}
          </Box>

          {jobsLoading && (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          )}

          {jobsError && (
            <Alert severity="error">
              Ошибка загрузки задач: {jobsError.message}
            </Alert>
          )}

          {jobs && <FailedJobsList jobs={jobs.jobs} queueName={selectedQueue} />}
        </Box>
      </Container>
    </Box>
  );
}

