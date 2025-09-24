"use client";

import { Suspense } from "react";
import { Box, Container, Typography, Paper, Chip } from "@mui/material";
import { 
  Dashboard as DashboardIcon,
  CheckCircle as CheckIcon,
  TrendingUp as TrendingIcon,
  Schedule as ScheduleIcon
} from "@mui/icons-material";

import { FilterProvider } from "@shared/contexts/FilterContext";
import ModernErrorStats from "@features/errors/components/ModernErrorStats";
import RecentErrors from "@features/errors/components/RecentErrors";
import ErrorFiltersWrapper from "@features/errors/components/ErrorFiltersWrapper";

// Отключаем статическую генерацию для real-time данных
export const dynamic = "force-dynamic";

export default function ModernDashboardPage() {
  return (
    <FilterProvider>
      <Box sx={{ 
        minHeight: "100vh", 
        bgcolor: "#f8f9fa",
      }}>
        <Container maxWidth="xl" sx={{ py: 4 }}>
          {/* Заголовок с пастельными цветами */}
          <Paper elevation={1} sx={{ 
            p: 4, 
            mb: 4, 
            background: "linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%)",
            border: "1px solid #e1bee7"
          }}>
            <Box display="flex" alignItems="center" gap={2} mb={2}>
              <DashboardIcon sx={{ fontSize: 40, color: "#7b1fa2" }} />
              <Box>
                <Typography variant="h3" component="h1" fontWeight="bold" color="#4a148c">
                  Gafus Error Dashboard
                </Typography>
                <Typography variant="h6" sx={{ color: "#6a1b9a" }}>
                  Мониторинг ошибок и система логирования
                </Typography>
              </Box>
            </Box>
            
            {/* Статус системы */}
            <Box display="flex" gap={1} flexWrap="wrap">
              <Chip 
                icon={<CheckIcon />} 
                label="Система работает" 
                color="success" 
                variant="outlined"
                sx={{ bgcolor: "rgba(76, 175, 80, 0.1)", color: "#2e7d32" }}
              />
              <Chip 
                icon={<ScheduleIcon />} 
                label="Real-time мониторинг" 
                color="info" 
                variant="outlined"
                sx={{ bgcolor: "rgba(33, 150, 243, 0.1)", color: "#1565c0" }}
              />
              <Chip 
                icon={<TrendingIcon />} 
                label="Аналитика активна" 
                color="warning" 
                variant="outlined"
                sx={{ bgcolor: "rgba(255, 152, 0, 0.1)", color: "#ef6c00" }}
              />
            </Box>
          </Paper>

          {/* Основная статистика */}
          <Suspense fallback={<ModernErrorStats.Skeleton />}>
            <Box mb={4}>
              <ModernErrorStats />
            </Box>
          </Suspense>

          {/* Фильтры */}
          <Box mb={3}>
            <ErrorFiltersWrapper />
          </Box>

          {/* Список ошибок - основной контент */}
          <Box mb={3}>
            <Suspense fallback={<RecentErrors.Skeleton />}>
              <RecentErrors />
            </Suspense>
          </Box>
        </Container>
      </Box>
    </FilterProvider>
  );
}