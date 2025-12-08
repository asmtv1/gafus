"use client";

import { Container, Box, Paper, Typography } from "@mui/material";
import { Storage as StorageIcon } from "@mui/icons-material";
import { NavigationTabs } from "@shared/components/NavigationTabs";
import LogsConsole from "@features/errors/components/LogsConsole";

export default function ContainerLogsPage() {
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
            background: "linear-gradient(135deg, #e0f7fa 0%, #f3e5f5 100%)",
            border: "1px solid #80deea",
          }}
        >
          <Box display="flex" alignItems="center" gap={2}>
            <StorageIcon sx={{ fontSize: 40, color: "#00acc1" }} />
            <Box>
              <Typography variant="h3" component="h1" fontWeight="bold" color="#00838f">
                Live консоль логов
              </Typography>
              <Typography variant="h6" sx={{ color: "#00acc1" }}>
                Потоковый просмотр логов Docker контейнеров в реальном времени
              </Typography>
            </Box>
          </Box>
        </Paper>

        {/* Live консоль */}
        <Box sx={{ height: "calc(100vh - 300px)", minHeight: 600 }}>
          <LogsConsole />
        </Box>
      </Container>
    </Box>
  );
}

// Отключаем статическую генерацию для real-time данных
export const dynamic = "force-dynamic";
