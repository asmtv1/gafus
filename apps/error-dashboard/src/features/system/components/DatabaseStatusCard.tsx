import { Card, CardContent, Box, Typography, Chip, Divider, LinearProgress } from "@mui/material";
import {
  Storage as StorageIcon,
  Schedule as TimeIcon,
  Memory as MemoryIcon,
  Speed as SpeedIcon,
  Warning as WarningIcon,
} from "@mui/icons-material";

interface DatabaseStatus {
  name: string;
  status: "online" | "offline" | "error";
  responseTime?: number;
  error?: string;
  details?: {
    version?: string;
    connections?: number;
    // PostgreSQL расширенные метрики
    databaseSize?: number;
    cacheHitRatio?: number;
    transactions?: {
      commits?: number;
      rollbacks?: number;
    };
    queries?: {
      selects?: number;
      inserts?: number;
      updates?: number;
      deletes?: number;
    };
    deadlocks?: number;
    waitingQueries?: number;
    // Redis расширенные метрики
    memory?: {
      used?: number;
      max?: number;
      percentage?: number;
    };
    keys?: {
      total?: number;
      expired?: number;
      evicted?: number;
    };
    cache?: {
      hits?: number;
      misses?: number;
      hitRatio?: number;
    };
    commands?: {
      processed?: number;
      perSecond?: number;
    };
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
              {/* Базовая информация */}
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
                <Box display="flex" justifyContent="space-between" mb={0.5}>
                  <Typography variant="body2" color="text.secondary">
                    Подключения:
                  </Typography>
                  <Typography variant="body2" fontWeight="medium">
                    {database.details.connections}
                  </Typography>
                </Box>
              )}

              {/* PostgreSQL расширенные метрики */}
              {database.name === "PostgreSQL" && (
                <>
                  {database.details.databaseSize !== undefined && (
                    <Box mb={1}>
                      <Box display="flex" justifyContent="space-between" mb={0.5}>
                        <Typography variant="body2" color="text.secondary">
                          Размер БД:
                        </Typography>
                        <Typography variant="body2" fontWeight="medium">
                          {(database.details.databaseSize / 1024 / 1024 / 1024).toFixed(2)} GB
                        </Typography>
                      </Box>
                    </Box>
                  )}
                  {database.details.cacheHitRatio !== undefined && (
                    <Box mb={1}>
                      <Box display="flex" justifyContent="space-between" mb={0.5}>
                        <Typography variant="body2" color="text.secondary">
                          Cache Hit Ratio:
                        </Typography>
                        <Typography
                          variant="body2"
                          fontWeight="medium"
                          color={database.details.cacheHitRatio > 95 ? "success.main" : "warning.main"}
                        >
                          {database.details.cacheHitRatio.toFixed(1)}%
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={database.details.cacheHitRatio}
                        sx={{
                          height: 4,
                          borderRadius: 2,
                          bgcolor: "rgba(0,0,0,0.1)",
                          "& .MuiLinearProgress-bar": {
                            bgcolor: database.details.cacheHitRatio > 95 ? "success.main" : "warning.main",
                          },
                        }}
                      />
                    </Box>
                  )}
                  {database.details.transactions && (
                    <Box mb={1}>
                      <Typography variant="body2" color="text.secondary" mb={0.5}>
                        Транзакции:
                      </Typography>
                      <Box display="flex" gap={1}>
                        {database.details.transactions.commits !== undefined && (
                          <Chip
                            label={`Commits: ${database.details.transactions.commits}/s`}
                            size="small"
                            color="success"
                            variant="outlined"
                          />
                        )}
                        {database.details.transactions.rollbacks !== undefined && (
                          <Chip
                            label={`Rollbacks: ${database.details.transactions.rollbacks}/s`}
                            size="small"
                            color="error"
                            variant="outlined"
                          />
                        )}
                      </Box>
                    </Box>
                  )}
                  {database.details.deadlocks !== undefined && database.details.deadlocks > 0 && (
                    <Box display="flex" alignItems="center" gap={0.5} mb={1}>
                      <WarningIcon fontSize="small" color="error" />
                      <Typography variant="body2" color="error">
                        Deadlocks: {database.details.deadlocks.toFixed(2)}/s
                      </Typography>
                    </Box>
                  )}
                  {database.details.waitingQueries !== undefined && database.details.waitingQueries > 0 && (
                    <Box display="flex" alignItems="center" gap={0.5} mb={1}>
                      <WarningIcon fontSize="small" color="warning" />
                      <Typography variant="body2" color="warning.main">
                        Ожидающих запросов: {database.details.waitingQueries}
                      </Typography>
                    </Box>
                  )}
                </>
              )}

              {/* Redis расширенные метрики */}
              {database.name === "Redis" && (
                <>
                  {database.details.memory && (
                    <Box mb={1}>
                      <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                        <MemoryIcon fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          Память:
                        </Typography>
                        <Typography variant="body2" fontWeight="medium" sx={{ ml: "auto" }}>
                          {database.details.memory.used !== undefined &&
                            (database.details.memory.used / 1024 / 1024).toFixed(1)}{" "}
                          MB
                          {database.details.memory.max !== undefined &&
                            ` / ${(database.details.memory.max / 1024 / 1024).toFixed(1)} MB`}
                        </Typography>
                      </Box>
                      {database.details.memory.percentage !== undefined && (
                        <LinearProgress
                          variant="determinate"
                          value={database.details.memory.percentage}
                          sx={{
                            height: 4,
                            borderRadius: 2,
                            bgcolor: "rgba(0,0,0,0.1)",
                            "& .MuiLinearProgress-bar": {
                              bgcolor:
                                database.details.memory.percentage > 90
                                  ? "error.main"
                                  : database.details.memory.percentage > 75
                                    ? "warning.main"
                                    : "success.main",
                            },
                          }}
                        />
                      )}
                    </Box>
                  )}
                  {database.details.keys && (
                    <Box mb={1}>
                      <Typography variant="body2" color="text.secondary" mb={0.5}>
                        Ключи:
                      </Typography>
                      <Box display="flex" gap={1} flexWrap="wrap">
                        {database.details.keys.total !== undefined && (
                          <Chip
                            label={`Всего: ${database.details.keys.total.toLocaleString()}`}
                            size="small"
                            variant="outlined"
                          />
                        )}
                        {database.details.keys.evicted !== undefined && database.details.keys.evicted > 0 && (
                          <Chip
                            label={`Evicted: ${database.details.keys.evicted}`}
                            size="small"
                            color="error"
                            variant="outlined"
                          />
                        )}
                      </Box>
                    </Box>
                  )}
                  {database.details.cache && (
                    <Box mb={1}>
                      <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                        <SpeedIcon fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          Cache Hit Ratio:
                        </Typography>
                        <Typography
                          variant="body2"
                          fontWeight="medium"
                          sx={{ ml: "auto" }}
                          color={database.details.cache.hitRatio && database.details.cache.hitRatio > 80 ? "success.main" : "warning.main"}
                        >
                          {database.details.cache.hitRatio?.toFixed(1)}%
                        </Typography>
                      </Box>
                      {database.details.cache.hitRatio !== undefined && (
                        <LinearProgress
                          variant="determinate"
                          value={database.details.cache.hitRatio}
                          sx={{
                            height: 4,
                            borderRadius: 2,
                            bgcolor: "rgba(0,0,0,0.1)",
                            "& .MuiLinearProgress-bar": {
                              bgcolor:
                                database.details.cache.hitRatio > 80 ? "success.main" : "warning.main",
                            },
                          }}
                        />
                      )}
                    </Box>
                  )}
                  {database.details.commands && (
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Команд: {database.details.commands.perSecond?.toFixed(0) || 0}/s
                      </Typography>
                    </Box>
                  )}
                </>
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

