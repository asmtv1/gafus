"use client";

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
} from "@mui/material";
import {
  SettingsSystemDaydream as SystemIcon,
  CheckCircle as CheckIcon,
  Refresh as RefreshIcon,
  Schedule as ScheduleIcon,
} from "@mui/icons-material";
import { NavigationTabs } from "@shared/components/NavigationTabs";
import { useSystemStatus } from "@shared/hooks/useSystemStatus";
import { ServiceStatusCard } from "@features/system/components/ServiceStatusCard";
import { DatabaseStatusCard } from "@features/system/components/DatabaseStatusCard";
import { SystemMetricsCard } from "@features/system/components/SystemMetricsCard";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

// Отключаем статическую генерацию для real-time данных
export const dynamic = "force-dynamic";

export default function SystemStatusPage() {
  const { data, error, isLoading, refetch } = useSystemStatus();

  if (isLoading) {
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

  if (error) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#f8f9fa" }}>
        <Container maxWidth="xl" sx={{ py: 4 }}>
          <NavigationTabs />
          <Alert
            severity="error"
            action={
              <IconButton color="inherit" size="small" onClick={() => refetch()}>
                <RefreshIcon />
              </IconButton>
            }
          >
            Ошибка загрузки статуса системы: {error.message}
          </Alert>
        </Container>
      </Box>
    );
  }

  if (!data) {
    return null;
  }

  // Подсчет количества онлайн сервисов
  const onlineServices = data.services.filter((s) => s.status === "online").length;
  const totalServices = data.services.length;

  // Подсчет количества онлайн баз данных
  const onlineDatabases = data.databases.filter((d) => d.status === "online").length;
  const totalDatabases = data.databases.length;

  // Общий статус системы
  const isSystemHealthy = onlineServices === totalServices && onlineDatabases === totalDatabases;

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
            background: "linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)",
            border: "1px solid #ffb74d",
          }}
        >
          <Box display="flex" alignItems="center" gap={2} mb={2}>
            <SystemIcon sx={{ fontSize: 40, color: "#ff9800" }} />
            <Box flex={1}>
              <Typography variant="h3" component="h1" fontWeight="bold" color="#e65100">
                Статус системы
              </Typography>
              <Typography variant="h6" sx={{ color: "#f57c00" }}>
                Мониторинг сервисов, баз данных и ресурсов
              </Typography>
            </Box>
            <Tooltip title="Обновить данные">
              <IconButton onClick={() => refetch()} color="primary" size="large">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <Box display="flex" gap={1} flexWrap="wrap">
            <Chip
              icon={<CheckIcon />}
              label={
                isSystemHealthy
                  ? "Все системы в норме"
                  : "Обнаружены проблемы"
              }
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
              label={`Обновлено ${formatDistanceToNow(new Date(data.timestamp), {
                addSuffix: true,
                locale: ru,
              })}`}
              color="info"
              variant="outlined"
              sx={{ bgcolor: "rgba(33, 150, 243, 0.1)", color: "#1565c0" }}
            />
            <Chip
              label={`Сервисов онлайн: ${onlineServices}/${totalServices}`}
              color="primary"
              variant="outlined"
              sx={{ bgcolor: "rgba(33, 150, 243, 0.1)" }}
            />
            <Chip
              label={`БД онлайн: ${onlineDatabases}/${totalDatabases}`}
              color="primary"
              variant="outlined"
              sx={{ bgcolor: "rgba(33, 150, 243, 0.1)" }}
            />
          </Box>
        </Paper>

        {/* Системные метрики */}
        <Box mb={4}>
          <Typography variant="h5" fontWeight="bold" mb={2}>
            Системные ресурсы
          </Typography>
          <SystemMetricsCard metrics={data.metrics} error={data.metricsError} />
        </Box>

        {/* Статус баз данных */}
        <Box mb={4}>
          <Typography variant="h5" fontWeight="bold" mb={2}>
            Базы данных
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, 1fr)",
              },
              gap: 3,
            }}
          >
            {data.databases.map((database) => (
              <DatabaseStatusCard key={database.name} database={database} />
            ))}
          </Box>
        </Box>

        {/* Статус сервисов */}
        <Box mb={4}>
          <Typography variant="h5" fontWeight="bold" mb={2}>
            Сервисы приложений
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, 1fr)",
                md: "repeat(3, 1fr)",
                lg: "repeat(4, 1fr)",
              },
              gap: 3,
            }}
          >
            {data.services.map((service) => (
              <ServiceStatusCard key={service.name} service={service} />
            ))}
          </Box>
        </Box>
      </Container>
    </Box>
  );
}

