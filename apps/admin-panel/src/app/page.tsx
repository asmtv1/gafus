"use client";

import { Box, Container, Typography, Paper, Chip } from "@mui/material";
import { 
  AdminPanelSettings as AdminIcon,
  CheckCircle as CheckIcon,
  Schedule as ScheduleIcon,
  Security as SecurityIcon
} from "@mui/icons-material";

// Отключаем статическую генерацию для real-time данных
export const dynamic = "force-dynamic";

export default function AdminPanelPage() {
  return (
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
            <AdminIcon sx={{ fontSize: 40, color: "#7b1fa2" }} />
            <Box>
              <Typography variant="h3" component="h1" fontWeight="bold" color="#4a148c">
                Gafus Admin Panel
              </Typography>
              <Typography variant="h6" sx={{ color: "#6a1b9a" }}>
                Панель администратора
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
              icon={<SecurityIcon />} 
              label="Защищено" 
              color="warning" 
              variant="outlined"
              sx={{ bgcolor: "rgba(255, 152, 0, 0.1)", color: "#ef6c00" }}
            />
          </Box>
        </Paper>

        {/* Основной контент */}
        <Paper elevation={1} sx={{ p: 4 }}>
          <Typography variant="h5" gutterBottom>
            Добро пожаловать в панель администратора
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Здесь будет размещен функционал для управления системой Gafus.
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
}

