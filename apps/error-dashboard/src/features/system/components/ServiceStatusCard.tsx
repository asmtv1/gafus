import { Card, CardContent, Box, Typography, Chip, LinearProgress } from "@mui/material";
import {
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  HelpOutline as UnknownIcon,
  Schedule as TimeIcon,
} from "@mui/icons-material";

interface ServiceStatus {
  name: string;
  status: "online" | "offline" | "unknown";
  url?: string;
  responseTime?: number;
  error?: string;
}

interface ServiceStatusCardProps {
  service: ServiceStatus;
}

export function ServiceStatusCard({ service }: ServiceStatusCardProps) {
  const getStatusColor = () => {
    switch (service.status) {
      case "online":
        return "#4caf50";
      case "offline":
        return "#f44336";
      case "unknown":
        return "#9e9e9e";
      default:
        return "#9e9e9e";
    }
  };

  const getStatusBgColor = () => {
    switch (service.status) {
      case "online":
        return "#e8f5e9";
      case "offline":
        return "#ffebee";
      case "unknown":
        return "#f5f5f5";
      default:
        return "#f5f5f5";
    }
  };

  const getStatusIcon = () => {
    switch (service.status) {
      case "online":
        return <CheckIcon sx={{ color: getStatusColor() }} />;
      case "offline":
        return <ErrorIcon sx={{ color: getStatusColor() }} />;
      case "unknown":
        return <UnknownIcon sx={{ color: getStatusColor() }} />;
      default:
        return <UnknownIcon sx={{ color: getStatusColor() }} />;
    }
  };

  const getStatusLabel = () => {
    switch (service.status) {
      case "online":
        return "Онлайн";
      case "offline":
        return "Офлайн";
      case "unknown":
        return "Неизвестно";
      default:
        return "Неизвестно";
    }
  };

  return (
    <Card
      elevation={1}
      sx={{
        height: "100%",
        border: `2px solid ${getStatusColor()}`,
        bgcolor: getStatusBgColor(),
        transition: "all 0.3s ease",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: 4,
        },
      }}
    >
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center" gap={1}>
            {getStatusIcon()}
            <Typography variant="h6" fontWeight="bold">
              {service.name}
            </Typography>
          </Box>
          <Chip
            label={getStatusLabel()}
            size="small"
            sx={{
              bgcolor: getStatusColor(),
              color: "white",
              fontWeight: "bold",
            }}
          />
        </Box>

        {service.responseTime !== undefined && (
          <Box mb={1}>
            <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
              <TimeIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                Время отклика: {service.responseTime}ms
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={Math.min((service.responseTime / 1000) * 100, 100)}
              sx={{
                height: 6,
                borderRadius: 3,
                bgcolor: "#e0e0e0",
                "& .MuiLinearProgress-bar": {
                  bgcolor:
                    service.responseTime < 500
                      ? "#4caf50"
                      : service.responseTime < 1000
                        ? "#ff9800"
                        : "#f44336",
                },
              }}
            />
          </Box>
        )}

        {service.url && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            URL: {service.url}
          </Typography>
        )}

        {service.error && (
          <Typography
            variant="caption"
            color="error"
            sx={{
              display: "block",
              bgcolor: "rgba(244, 67, 54, 0.1)",
              p: 1,
              borderRadius: 1,
              fontFamily: "monospace",
            }}
          >
            {service.error}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
