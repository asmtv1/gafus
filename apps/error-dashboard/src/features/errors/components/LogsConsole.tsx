"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import type { ErrorDashboardReport } from "@gafus/types";
import {
  Box,
  Paper,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  IconButton,
  Tooltip,
  Typography,
  Alert,
  CircularProgress,
} from "@mui/material";
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Clear as ClearIcon,
  Search as SearchIcon,
} from "@mui/icons-material";
import {
  formatLogLine,
  getLogLevelColor,
  parseContainerName,
  parseLogLevel,
  getLogMessage,
} from "@shared/lib/utils/logFormatter";

interface ContainerLogAdditionalContext {
  container?: {
    name: string;
    id: string;
    timestamp: string;
    raw: string;
    caller?: string;
    originalMsg?: string;
  };
  parsed?: {
    level: string;
    timestamp?: string;
    caller?: string;
    msg?: string;
  };
  pino?: {
    level: number | string;
    time: string;
    pid: number;
    hostname: string;
    context?: string;
    err?: unknown;
  };
  [key: string]: unknown;
}

const MAX_LOGS = 10000;

export default function LogsConsole() {
  const [logs, setLogs] = useState<ErrorDashboardReport[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<string>("all");
  const [selectedLevel, setSelectedLevel] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [autoScroll, setAutoScroll] = useState(true);

  const eventSourceRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Получаем уникальные контейнеры и уровни из логов
  const containers = useMemo(() => {
    const uniqueContainers = new Set<string>();
    logs.forEach((log) => {
      const context = log.additionalContext as ContainerLogAdditionalContext;
      const containerName = parseContainerName(context);
      if (containerName !== "unknown") {
        uniqueContainers.add(containerName);
      }
    });
    return ["all", ...Array.from(uniqueContainers).sort()];
  }, [logs]);

  const levels = useMemo(() => {
    const uniqueLevels = new Set<string>();
    logs.forEach((log) => {
      const context = log.additionalContext as ContainerLogAdditionalContext;
      const level = parseLogLevel(context, log.tags);
      uniqueLevels.add(level);
    });
    return ["all", ...Array.from(uniqueLevels).sort()];
  }, [logs]);

  // Фильтрация логов на клиенте
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const context = log.additionalContext as ContainerLogAdditionalContext;
      const containerName = parseContainerName(context);
      const level = parseLogLevel(context, log.tags);
      const message = getLogMessage(log);

      // Фильтр по контейнеру
      if (selectedContainer !== "all" && containerName !== selectedContainer) {
        return false;
      }

      // Фильтр по уровню
      if (selectedLevel !== "all" && level !== selectedLevel) {
        return false;
      }

      // Поиск по тексту
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          message.toLowerCase().includes(searchLower) ||
          containerName.toLowerCase().includes(searchLower) ||
          log.message.toLowerCase().includes(searchLower)
        );
      }

      return true;
    });
  }, [logs, selectedContainer, selectedLevel, searchTerm]);

  // Автопрокрутка
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [filteredLogs, autoScroll]);

  // Проверка, находится ли пользователь внизу
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setAutoScroll(isAtBottom);
  }, []);

  // Подключение к SSE потоку
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      return; // Уже подключено
    }

    setIsConnecting(true);
    setError(null);

    const eventSource = new EventSource("/api/container-logs/stream");
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "connected") {
          // Подключение установлено
        } else if (data.type === "log") {
          setLogs((prevLogs) => {
            const newLogs = [...prevLogs, data.data];
            // Ограничиваем количество логов
            if (newLogs.length > MAX_LOGS) {
              return newLogs.slice(-MAX_LOGS);
            }
            return newLogs;
          });
        } else if (data.type === "ping") {
          // Игнорируем ping сообщения
        }
      } catch (parseError) {
        console.error("[LogsConsole] Failed to parse SSE message:", parseError);
      }
    };

    eventSource.onerror = (error) => {
      console.error("[LogsConsole] SSE error:", error);
      setIsConnecting(false);
      setError("Ошибка подключения к потоку логов");
      // Переподключение через 3 секунды
      setTimeout(() => {
        if (eventSourceRef.current) {
          disconnect();
          connect();
        }
      }, 3000);
    };
  }, []);

  // Отключение от потока
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  // Очистка логов
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Подключение при монтировании
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Панель управления */}
      <Paper
        elevation={1}
        sx={{
          p: 2,
          mb: 2,
          display: "flex",
          gap: 2,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <Chip
            label={isConnected ? "Подключено" : isConnecting ? "Подключение..." : "Отключено"}
            color={isConnected ? "success" : isConnecting ? "warning" : "default"}
            size="small"
          />
          {isConnected ? (
            <Tooltip title="Остановить поток">
              <IconButton size="small" onClick={disconnect} color="error">
                <StopIcon />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="Запустить поток">
              <IconButton size="small" onClick={connect} color="primary" disabled={isConnecting}>
                <PlayIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        <Box display="flex" gap={1} flex={1} flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Контейнер</InputLabel>
            <Select
              value={selectedContainer}
              onChange={(e) => setSelectedContainer(e.target.value)}
              label="Контейнер"
            >
              {containers.map((container) => (
                <MenuItem key={container} value={container}>
                  {container === "all" ? "Все контейнеры" : container}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Уровень</InputLabel>
            <Select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              label="Уровень"
            >
              {levels.map((level) => (
                <MenuItem key={level} value={level}>
                  {level === "all" ? "Все уровни" : level}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            placeholder="Поиск..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: "action" }} />,
            }}
            sx={{ flex: 1, minWidth: 200 }}
          />
        </Box>

        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="body2" color="text.secondary">
            {filteredLogs.length} / {logs.length}
          </Typography>
          <Tooltip title="Очистить логи">
            <IconButton size="small" onClick={clearLogs}>
              <ClearIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Paper>

      {/* Консоль с логами */}
      <Paper
        elevation={1}
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          bgcolor: "#1e1e1e",
        }}
      >
        {error && (
          <Alert severity="error" sx={{ m: 2 }}>
            {error}
          </Alert>
        )}

        {isConnecting && (
          <Box display="flex" justifyContent="center" alignItems="center" p={2}>
            <CircularProgress size={24} />
            <Typography variant="body2" sx={{ ml: 2 }}>
              Подключение к потоку логов...
            </Typography>
          </Box>
        )}

        <Box
          ref={containerRef}
          onScroll={handleScroll}
          sx={{
            flex: 1,
            overflow: "auto",
            p: 2,
            fontFamily: '"JetBrains Mono", "Fira Code", Monaco, Consolas, monospace',
            fontSize: "0.875rem",
            lineHeight: 1.6,
          }}
        >
          {filteredLogs.length === 0 ? (
            <Typography
              variant="body2"
              sx={{ color: "#888", textAlign: "center", mt: 4 }}
            >
              {logs.length === 0
                ? "Ожидание логов..."
                : "Логи не найдены по заданным фильтрам"}
            </Typography>
          ) : (
            filteredLogs.map((log, index) => {
              const context = log.additionalContext as ContainerLogAdditionalContext;
              const level = parseLogLevel(context, log.tags);
              const levelColor = getLogLevelColor(level);

              return (
                <Box
                  key={`${log.id}-${index}`}
                  sx={{
                    color: "#d4d4d4",
                    mb: 0.5,
                    "&:hover": {
                      bgcolor: "#2a2a2a",
                    },
                  }}
                >
                  <Box component="span" sx={{ color: levelColor, fontWeight: "bold" }}>
                    {formatLogLine(log)}
                  </Box>
                  {log.stack && (
                    <Box
                      component="pre"
                      sx={{
                        ml: 4,
                        mt: 0.5,
                        color: "#888",
                        fontSize: "0.75rem",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {log.stack}
                    </Box>
                  )}
                </Box>
              );
            })
          )}
          <div ref={logsEndRef} />
        </Box>
      </Paper>
    </Box>
  );
}

