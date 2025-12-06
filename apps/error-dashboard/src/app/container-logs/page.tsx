"use client";

import type { ErrorDashboardReport } from "@gafus/types";
import { useErrors } from "@shared/hooks/useErrors";
import { useEffect, useState, useMemo } from "react";
import { NavigationTabs } from "@shared/components/NavigationTabs";
import {
  Box,
  Container,
  Typography,
  Paper,
  Card,
  CardContent,
  Chip,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Divider,
  Collapse,
  Button,
  Snackbar,
} from "@mui/material";
import {
  Storage as StorageIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  CheckCircle as CheckIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  Search as SearchIcon,
  Schedule as ScheduleIcon,
  Computer as ComputerIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  BugReport as BugReportIcon,
  ContentCopy as CopyIcon,
  Code as CodeIcon,
  LocationOn as LocationIcon,
} from "@mui/icons-material";
import { formatDistanceToNow, format } from "date-fns";
import { ru } from "date-fns/locale";

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

export default function ContainerLogsPage() {
  const [filteredLogs, setFilteredLogs] = useState<ErrorDashboardReport[]>([]);
  const [selectedContainer, setSelectedContainer] = useState<string>("all");
  const [selectedLevel, setSelectedLevel] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [visibleLogsCount, setVisibleLogsCount] = useState<number>(100);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  // Получаем логи контейнеров с фильтром по тегу
  // Используем лимит 5000 (максимум для Loki)
  const {
    data: containerLogs,
    error,
    isLoading,
    refetch,
  } = useErrors({
    tags: ["container-logs"],
    limit: 5000,
  });

  // Получаем уникальные значения для фильтров
  const containers = useMemo(() => {
    const uniqueContainers = new Set<string>();
    if (!containerLogs) return [];
    containerLogs.forEach((log) => {
      const context = log.additionalContext as ContainerLogAdditionalContext;
      const containerName = context?.container?.name;
      if (containerName) {
        uniqueContainers.add(containerName);
      }
      // Также проверяем теги вида container:name
      log.tags?.forEach((tag) => {
        if (tag.startsWith("container:")) {
          uniqueContainers.add(tag.replace("container:", ""));
        }
      });
    });
    return ["all", ...Array.from(uniqueContainers).sort()];
  }, [containerLogs]);

  const levels = useMemo(() => {
    const uniqueLevels = new Set<string>();
    if (!containerLogs) return ["all"];
    containerLogs.forEach((log) => {
      const context = log.additionalContext as ContainerLogAdditionalContext;
      const pinoLevel = context?.pino?.level;
      if (pinoLevel) {
        // Маппим числовые уровни Pino в строковые
        const levelMap: Record<string, string> = {
          "10": "debug",
          "20": "info",
          "30": "warn",
          "40": "error",
          "50": "fatal",
        };
        const levelStr = typeof pinoLevel === "string" 
          ? levelMap[pinoLevel] || pinoLevel 
          : levelMap[String(pinoLevel)] || String(pinoLevel);
        uniqueLevels.add(levelStr);
      }
      // Также проверяем теги вида level:name
      log.tags?.forEach((tag) => {
        if (tag.startsWith("level:")) {
          uniqueLevels.add(tag.replace("level:", ""));
        }
      });
    });
    return ["all", ...Array.from(uniqueLevels).sort()];
  }, [containerLogs]);

  // Фильтруем логи (только по контейнеру, уровню и поиску)
  useEffect(() => {
    if (!containerLogs || containerLogs.length === 0) {
      setFilteredLogs([]);
      return;
    }

    let filtered = containerLogs;

    // Фильтр по контейнеру
    if (selectedContainer !== "all") {
      filtered = filtered.filter((log) => {
        const context = log.additionalContext as ContainerLogAdditionalContext;
        const containerName = context?.container?.name;
        return (
          containerName === selectedContainer ||
          log.tags?.some((tag) => tag === `container:${selectedContainer}`)
        );
      });
    }

    // Фильтр по уровню
    if (selectedLevel !== "all") {
      filtered = filtered.filter((log) => {
        const context = log.additionalContext as ContainerLogAdditionalContext;
        const pinoLevel = context?.pino?.level;
        if (pinoLevel) {
          const levelMap: Record<string, string> = {
            "10": "debug",
            "20": "info",
            "30": "warn",
            "40": "error",
            "50": "fatal",
          };
          const levelStr = typeof pinoLevel === "string" 
            ? levelMap[pinoLevel] || pinoLevel 
            : levelMap[String(pinoLevel)] || String(pinoLevel);
          return levelStr === selectedLevel;
        }
        return log.tags?.some((tag) => tag === `level:${selectedLevel}`);
      });
    }

    // Фильтр по поиску
    if (searchTerm) {
      filtered = filtered.filter((log) => {
        const context = log.additionalContext as ContainerLogAdditionalContext;
        return (
          log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
          context?.container?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          context?.pino?.context?.toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
          log.stack?.toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
    }

    setFilteredLogs(filtered);
    // Сбрасываем счетчик видимых логов при изменении фильтров
    setVisibleLogsCount(100);
  }, [containerLogs, selectedContainer, selectedLevel, searchTerm]);

  // Статистика
  const stats = useMemo(() => {
    if (!containerLogs) {
      return { total: 0, byLevel: {}, byContainer: {} };
    }
    const total = containerLogs.length;
    const byLevel: Record<string, number> = {};
    const byContainer: Record<string, number> = {};

    containerLogs.forEach((log) => {
      const context = log.additionalContext as ContainerLogAdditionalContext;
      const containerName = context?.container?.name || "unknown";
      const pinoLevel = context?.pino?.level;
      
      // Подсчет по контейнерам
      byContainer[containerName] = (byContainer[containerName] || 0) + 1;

      // Подсчет по уровням
      if (pinoLevel) {
        const levelMap: Record<string, string> = {
          "10": "debug",
          "20": "info",
          "30": "warn",
          "40": "error",
          "50": "fatal",
        };
        const levelStr = typeof pinoLevel === "string" 
          ? levelMap[pinoLevel] || pinoLevel 
          : levelMap[String(pinoLevel)] || String(pinoLevel);
        byLevel[levelStr] = (byLevel[levelStr] || 0) + 1;
      } else {
        log.tags?.forEach((tag) => {
          if (tag.startsWith("level:")) {
            const level = tag.replace("level:", "");
            byLevel[level] = (byLevel[level] || 0) + 1;
          }
        });
      }
    });

    return { total, byLevel, byContainer };
  }, [containerLogs]);

  const getLevelIcon = (level: string) => {
    switch (level.toLowerCase()) {
      case "error":
      case "40":
        return <ErrorIcon />;
      case "warn":
      case "warning":
      case "30":
        return <WarningIcon />;
      case "info":
      case "20":
        return <InfoIcon />;
      case "success":
        return <CheckIcon />;
      case "fatal":
      case "50":
        return <BugReportIcon />;
      default:
        return <InfoIcon />;
    }
  };

  const getLevelColor = (level: string | number | undefined) => {
    if (typeof level === "number") {
      level = String(level);
    }
    if (typeof level === "string") {
      const levelMap: Record<string, string> = {
        "10": "#90a4ae",
        "20": "#7986cb",
        "30": "#ffb74d",
        "40": "#f48fb1",
        "50": "#e91e63",
        debug: "#90a4ae",
        info: "#7986cb",
        warn: "#ffb74d",
        warning: "#ffb74d",
        error: "#f48fb1",
        fatal: "#e91e63",
      };
      return levelMap[level] || "#90a4ae";
    }
    return "#90a4ae";
  };

  const getLevelBgColor = (level: string | number | undefined) => {
    if (typeof level === "number") {
      level = String(level);
    }
    if (typeof level === "string") {
      const levelMap: Record<string, string> = {
        "10": "#f5f5f5",
        "20": "#e3f2fd",
        "30": "#fff8e1",
        "40": "#ffebee",
        "50": "#fce4ec",
        debug: "#f5f5f5",
        info: "#e3f2fd",
        warn: "#fff8e1",
        warning: "#fff8e1",
        error: "#ffebee",
        fatal: "#fce4ec",
      };
      return levelMap[level] || "#f5f5f5";
    }
    return "#f5f5f5";
  };

  const toggleExpanded = (logId: string) => {
    setExpandedLogs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  // Видимые логи (с учетом пагинации)
  const visibleLogs = useMemo(() => {
    return filteredLogs.slice(0, visibleLogsCount);
  }, [filteredLogs, visibleLogsCount]);

  const hasMoreLogs = filteredLogs.length > visibleLogsCount;
  const remainingLogs = filteredLogs.length - visibleLogsCount;

  // Функция копирования всех видимых логов
  const copyAllVisibleLogs = async () => {
    try {
      const lines: string[] = [];
      lines.push("=== Логи контейнеров ===\n");
      lines.push(`Всего логов: ${visibleLogs.length}\n`);
      lines.push("=".repeat(50) + "\n\n");

      visibleLogs.forEach((log, index) => {
        const context = log.additionalContext as ContainerLogAdditionalContext;
        const containerName = context?.container?.name || "unknown";
        
        // Определяем уровень
        let levelStr = "info";
        if (context?.parsed?.level) {
          levelStr = context.parsed.level;
        } else {
          const pinoLevel = context?.pino?.level;
          if (typeof pinoLevel === "number" || typeof pinoLevel === "string") {
            if (typeof pinoLevel === "number") {
              const levelMap: Record<string, string> = {
                "10": "debug",
                "20": "info",
                "30": "warn",
                "40": "error",
                "50": "fatal",
              };
              levelStr = levelMap[String(pinoLevel)] || String(pinoLevel);
            } else {
              levelStr = pinoLevel;
            }
          } else {
            levelStr = log.tags?.find((tag) => tag.startsWith("level:"))?.replace("level:", "") || "info";
          }
        }

        const timestamp = format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss", { locale: ru });
        const message = context?.parsed?.msg || context?.container?.originalMsg || log.message;

        lines.push(`[${timestamp}] [${levelStr.toUpperCase()}] [${containerName}]`);
        lines.push(`Сообщение: ${message}`);

        if (context?.parsed?.caller) {
          lines.push(`Caller: ${context.parsed.caller}`);
        }

        if (context?.pino?.context) {
          lines.push(`Context: ${context.pino.context}`);
        }

        if (context?.pino?.hostname) {
          lines.push(`Hostname: ${context.pino.hostname}`);
        }

        if (context?.container?.raw) {
          lines.push(`Raw: ${context.container.raw}`);
        }

        if (log.stack) {
          lines.push(`Stack:\n${log.stack}`);
        }

        if (index < visibleLogs.length - 1) {
          lines.push("\n" + "-".repeat(50) + "\n");
        }
      });

      const text = lines.join("\n");
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
    } catch (error) {
      console.error("Ошибка при копировании логов:", error);
    }
  };

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
            Ошибка загрузки логов контейнеров: {error.message}
          </Alert>
        </Container>
      </Box>
    );
  }

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
          <Box display="flex" alignItems="center" gap={2} mb={2}>
            <StorageIcon sx={{ fontSize: 40, color: "#00acc1" }} />
            <Box>
              <Typography variant="h3" component="h1" fontWeight="bold" color="#00838f">
                Логи контейнеров
              </Typography>
              <Typography variant="h6" sx={{ color: "#00acc1" }}>
                Мониторинг логов Docker контейнеров через Promtail
              </Typography>
            </Box>
          </Box>

          <Box display="flex" gap={1} flexWrap="wrap">
            <Chip
              icon={<ScheduleIcon />}
              label="Real-time логи"
              color="info"
              variant="outlined"
              sx={{ bgcolor: "rgba(0, 172, 193, 0.1)", color: "#00838f" }}
            />
            <Chip
              icon={<FilterIcon />}
              label="Фильтрация"
              color="info"
              variant="outlined"
              sx={{ bgcolor: "rgba(0, 172, 193, 0.1)", color: "#00838f" }}
            />
            <Chip
              icon={<SearchIcon />}
              label="Поиск"
              color="info"
              variant="outlined"
              sx={{ bgcolor: "rgba(0, 172, 193, 0.1)", color: "#00838f" }}
            />
          </Box>
        </Paper>

        {/* Статистика */}
        <Box
          display="grid"
          gridTemplateColumns={{
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            md: "repeat(4, 1fr)",
          }}
          gap={3}
          sx={{ mb: 4 }}
        >
          <Card elevation={1}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Avatar sx={{ bgcolor: "#00acc1" }}>
                  <StorageIcon />
                </Avatar>
                <Box>
                  <Typography variant="h4" fontWeight="bold" color="#00acc1">
                    {stats.total}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Всего логов
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {Object.entries(stats.byLevel).slice(0, 4).map(([level, count]) => {
            const levelColor = getLevelColor(level);
            return (
              <Card elevation={1} key={level}>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={2}>
                    <Avatar sx={{ bgcolor: levelColor }}>
                      {getLevelIcon(level)}
                    </Avatar>
                    <Box>
                      <Typography variant="h4" fontWeight="bold" sx={{ color: levelColor }}>
                        {count}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {level}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>

        {/* Фильтры */}
        <Card elevation={1} sx={{ mb: 4 }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight="bold" mb={3}>
              Фильтры и поиск
            </Typography>

            <Box
              display="grid"
              gridTemplateColumns={{
                xs: "1fr",
                sm: "repeat(2, 1fr)",
                md: "repeat(3, 1fr)",
              }}
              gap={3}
              alignItems="center"
            >
              <Box>
                <FormControl fullWidth size="small">
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
              </Box>

              <Box>
                <FormControl fullWidth size="small">
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
              </Box>

              <Box>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Поиск по сообщению, контейнеру или контексту..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
                  }}
                />
              </Box>
            </Box>

            <Box display="flex" alignItems="center" justifyContent="space-between" mt={3}>
              <Typography variant="body2" color="text.secondary">
                Найдено: {filteredLogs.length} из {containerLogs?.length || 0} логов
              </Typography>

              <Tooltip title="Обновить логи">
                <IconButton onClick={() => refetch()} color="primary">
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </CardContent>
        </Card>

        {/* Список логов */}
        <Card elevation={1}>
          <CardContent sx={{ p: 3 }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
              <Typography variant="h6" fontWeight="bold">
                Логи контейнеров
              </Typography>
              <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
                  Показано: {visibleLogs.length} из {filteredLogs.length}
                </Typography>
                <Tooltip title="Копировать все видимые логи">
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<CopyIcon />}
                    onClick={copyAllVisibleLogs}
                  >
                    Копировать все
                  </Button>
                </Tooltip>
              </Box>
            </Box>

            {filteredLogs.length === 0 ? (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                Логи не найдены
              </Alert>
            ) : (
              <>
                <List sx={{ p: 0 }}>
                  {visibleLogs.map((log, index) => {
                  const context = log.additionalContext as ContainerLogAdditionalContext;
                  const containerName = context?.container?.name || "unknown";
                  
                  // Определяем уровень логирования: сначала из parsed, потом из pino, потом из tags
                  let levelStr = "info";
                  if (context?.parsed?.level) {
                    levelStr = context.parsed.level;
                  } else {
                    const pinoLevel = context?.pino?.level;
                    if (typeof pinoLevel === "number" || typeof pinoLevel === "string") {
                      if (typeof pinoLevel === "number") {
                        const levelMap: Record<string, string> = {
                          "10": "debug",
                          "20": "info",
                          "30": "warn",
                          "40": "error",
                          "50": "fatal",
                        };
                        levelStr = levelMap[String(pinoLevel)] || String(pinoLevel);
                      } else {
                        levelStr = pinoLevel;
                      }
                    } else {
                      const tagLevel = log.tags?.find((tag) => 
                        ["debug", "info", "warn", "error", "fatal"].includes(tag)
                      );
                      levelStr = tagLevel || log.tags?.find((tag) => tag.startsWith("level:"))?.replace("level:", "") || "info";
                    }
                  }
                  
                  const levelColor = getLevelColor(levelStr);
                  const levelBgColor = getLevelBgColor(levelStr);
                  const isExpanded = expandedLogs.has(log.id);

                  return (
                    <Box key={log.id}>
                      <ListItem
                        sx={{
                          borderRadius: 2,
                          mb: 1,
                          bgcolor: levelBgColor,
                          border: "1px solid",
                          borderColor: `${levelColor}30`,
                          transition: "all 0.2s ease",
                          "&:hover": {
                            transform: "translateX(2px)",
                            boxShadow: 1,
                            borderColor: `${levelColor}50`,
                          },
                        }}
                      >
                        <ListItemAvatar>
                          <Avatar sx={{ bgcolor: levelColor, width: 40, height: 40 }}>
                            {getLevelIcon(levelStr)}
                          </Avatar>
                        </ListItemAvatar>

                        <ListItemText
                          primary={
                            <Box>
                              {/* Основное сообщение - выделено */}
                              <Typography 
                                variant="body1" 
                                fontWeight="600" 
                                sx={{ 
                                  mb: 1.5,
                                  color: "text.primary",
                                  lineHeight: 1.5,
                                }}
                              >
                                {context?.parsed?.msg || context?.container?.originalMsg || log.message}
                              </Typography>

                              {/* Метаданные в компактной форме */}
                              <Box display="flex" flexWrap="wrap" alignItems="center" gap={1.5} mb={1}>
                                <Chip
                                  label={levelStr}
                                  size="small"
                                  sx={{
                                    bgcolor: `${levelColor}20`,
                                    color: levelColor,
                                    fontWeight: "bold",
                                    border: `1px solid ${levelColor}30`,
                                  }}
                                />

                                <Chip
                                  label={containerName}
                                  size="small"
                                  variant="outlined"
                                  icon={<ComputerIcon />}
                                  sx={{ fontWeight: "medium" }}
                                />

                                <Box display="flex" alignItems="center" gap={0.5}>
                                  <ScheduleIcon fontSize="small" color="action" />
                                  <Typography variant="caption" color="text.secondary">
                                    {formatDistanceToNow(new Date(log.createdAt), {
                                      addSuffix: true,
                                      locale: ru,
                                    })}
                                  </Typography>
                                </Box>
                              </Box>
                            </Box>
                          }
                          secondary={
                            <Box>
                              {/* Дополнительные метаданные с иконками */}
                              <Box display="flex" flexWrap="wrap" alignItems="center" gap={1.5} mt={0.5}>
                                {context?.parsed?.caller && (
                                  <Box display="flex" alignItems="center" gap={0.5}>
                                    <LocationIcon fontSize="small" color="action" sx={{ fontSize: "0.875rem" }} />
                                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", fontSize: "0.7rem" }}>
                                      {String(context.parsed.caller)}
                                    </Typography>
                                  </Box>
                                )}

                                {context?.pino?.context && (
                                  <Box display="flex" alignItems="center" gap={0.5}>
                                    <CodeIcon fontSize="small" color="action" sx={{ fontSize: "0.875rem" }} />
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                                      {String(context.pino.context)}
                                    </Typography>
                                  </Box>
                                )}

                                {context?.pino?.hostname && (
                                  <Box display="flex" alignItems="center" gap={0.5}>
                                    <ComputerIcon fontSize="small" color="action" sx={{ fontSize: "0.875rem" }} />
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                                      {String(context.pino.hostname)}
                                    </Typography>
                                  </Box>
                                )}
                              </Box>

                              {/* Теги */}
                              {log.tags && log.tags.length > 0 && (
                                <Box display="flex" flexWrap="wrap" gap={0.5} mt={1}>
                                  {log.tags
                                    .filter((tag) => !tag.startsWith("container:") && !tag.startsWith("level:"))
                                    .map((tag, tagIndex) => (
                                      <Chip
                                        key={tagIndex}
                                        label={tag}
                                        size="small"
                                        variant="outlined"
                                        sx={{ fontSize: "0.65rem", height: "20px" }}
                                      />
                                    ))}
                                </Box>
                              )}
                            </Box>
                          }
                        />

                        <Box display="flex" alignItems="center" gap={0.5}>
                          <Tooltip title={isExpanded ? "Свернуть" : "Развернуть"}>
                            <IconButton
                              size="small"
                              onClick={() => toggleExpanded(log.id)}
                              color="primary"
                            >
                              {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </ListItem>

                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ pl: 9, pr: 2, pb: 2 }}>
                          <Paper
                            elevation={0}
                            sx={{
                              p: 2,
                              bgcolor: "#fafafa",
                              border: "1px solid #e0e0e0",
                              borderRadius: 1,
                            }}
                          >
                            {log.stack && (
                              <Box mb={2}>
                                <Typography variant="subtitle2" fontWeight="bold" mb={1} display="flex" alignItems="center" gap={0.5}>
                                  <BugReportIcon fontSize="small" />
                                  Stack Trace
                                </Typography>
                                <Typography
                                  variant="body2"
                                  component="pre"
                                  sx={{
                                    fontFamily: '"JetBrains Mono", "Fira Code", Monaco, Consolas, monospace',
                                    fontSize: "0.7rem",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                    bgcolor: "#1e1e1e",
                                    color: "#d4d4d4",
                                    p: 1.5,
                                    borderRadius: 1,
                                    border: "1px solid #333",
                                    maxHeight: 300,
                                    overflow: "auto",
                                    lineHeight: 1.5,
                                  }}
                                >
                                  {log.stack}
                                </Typography>
                              </Box>
                            )}

                            {context?.container?.raw && (
                              <Box mb={2}>
                                <Typography variant="subtitle2" fontWeight="bold" mb={1} display="flex" alignItems="center" gap={0.5}>
                                  <CodeIcon fontSize="small" />
                                  Raw Log
                                </Typography>
                                <Typography
                                  variant="body2"
                                  component="pre"
                                  sx={{
                                    fontFamily: '"JetBrains Mono", "Fira Code", Monaco, Consolas, monospace',
                                    fontSize: "0.7rem",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                    bgcolor: "#1e1e1e",
                                    color: "#d4d4d4",
                                    p: 1.5,
                                    borderRadius: 1,
                                    border: "1px solid #333",
                                    maxHeight: 200,
                                    overflow: "auto",
                                    lineHeight: 1.5,
                                  }}
                                >
                                  {context.container.raw}
                                </Typography>
                              </Box>
                            )}

                            {context?.pino && (
                              <Box>
                                <Typography variant="subtitle2" fontWeight="bold" mb={1} display="flex" alignItems="center" gap={0.5}>
                                  <InfoIcon fontSize="small" />
                                  Pino Metadata
                                </Typography>
                                <Typography
                                  variant="body2"
                                  component="pre"
                                  sx={{
                                    fontFamily: '"JetBrains Mono", "Fira Code", Monaco, Consolas, monospace',
                                    fontSize: "0.7rem",
                                    whiteSpace: "pre-wrap",
                                    bgcolor: "#1e1e1e",
                                    color: "#d4d4d4",
                                    p: 1.5,
                                    borderRadius: 1,
                                    border: "1px solid #333",
                                    maxHeight: 200,
                                    overflow: "auto",
                                    lineHeight: 1.5,
                                  }}
                                >
                                  {JSON.stringify(context.pino, null, 2)}
                                </Typography>
                              </Box>
                            )}
                          </Paper>
                        </Box>
                      </Collapse>

                      {index < visibleLogs.length - 1 && <Divider sx={{ my: 1 }} />}
                    </Box>
                  );
                })}
                </List>

                {/* Кнопка "Показать ещё 100" */}
                {hasMoreLogs && (
                  <Box display="flex" justifyContent="center" mt={3}>
                    <Button
                      variant="outlined"
                      onClick={() => setVisibleLogsCount((prev) => Math.min(prev + 100, filteredLogs.length))}
                      sx={{ minWidth: 200 }}
                    >
                      Показать ещё 100 {remainingLogs > 0 && `(осталось ${remainingLogs})`}
                    </Button>
                  </Box>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Уведомление об успешном копировании */}
        <Snackbar
          open={copySuccess}
          autoHideDuration={3000}
          onClose={() => setCopySuccess(false)}
          message="Логи скопированы в буфер обмена"
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        />
      </Container>
    </Box>
  );
}

// Отключаем статическую генерацию для real-time данных
export const dynamic = "force-dynamic";

