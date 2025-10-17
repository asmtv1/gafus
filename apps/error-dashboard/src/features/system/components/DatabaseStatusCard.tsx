import { Card, CardContent, Box, Typography, Chip, Divider } from "@mui/material";
import {
  Storage as StorageIcon,
  Schedule as TimeIcon,
} from "@mui/icons-material";

interface DatabaseStatus {
  name: string;
  status: "online" | "offline" | "error";
  responseTime?: number;
  error?: string;
  details?: {
    version?: string;
    connections?: number;
  };
}

interface DatabaseStatusCardProps {
  database: DatabaseStatus;
}

export function DatabaseStatusCard({ database }: DatabaseStatusCardProps) {
  const getStatusColor = () => {
    switch (database.status) {
      case "online":
        return "#4caf50";
      case "offline":
        return "#f44336";
      case "error":
        return "#ff9800";
      default:
        return "#9e9e9e";
    }
  };

  const getStatusBgColor = () => {
    switch (database.status) {
      case "online":
        return "#e8f5e9";
      case "offline":
        return "#ffebee";
      case "error":
        return "#fff3e0";
      default:
        return "#f5f5f5";
    }
  };

  const getStatusLabel = () => {
    switch (database.status) {
      case "online":
        return "Онлайн";
      case "offline":
        return "Офлайн";
      case "error":
        return "Ошибка";
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
            <StorageIcon sx={{ color: getStatusColor(), fontSize: 28 }} />
            <Typography variant="h6" fontWeight="bold">
              {database.name}
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

        {database.responseTime !== undefined && (
          <Box display="flex" alignItems="center" gap={0.5} mb={1}>
            <TimeIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              Время отклика: {database.responseTime}ms
            </Typography>
          </Box>
        )}

        {database.details && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Box>
              {database.details.version && (
                <Box display="flex" justifyContent="space-between" mb={0.5}>
                  <Typography variant="body2" color="text.secondary">
                    Версия:
                  </Typography>
                  <Typography variant="body2" fontWeight="medium">
                    {database.details.version}
                  </Typography>
                </Box>
              )}
              {database.details.connections !== undefined && (
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    Подключения:
                  </Typography>
                  <Typography variant="body2" fontWeight="medium">
                    {database.details.connections}
                  </Typography>
                </Box>
              )}
            </Box>
          </>
        )}

        {database.error && (
          <Typography
            variant="caption"
            color="error"
            sx={{
              display: "block",
              bgcolor: "rgba(244, 67, 54, 0.1)",
              p: 1,
              borderRadius: 1,
              fontFamily: "monospace",
              mt: 1,
            }}
          >
            {database.error}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

