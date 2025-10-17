"use client";

import type { ErrorDashboardReport } from "@gafus/types";
import { useErrors } from "@shared/hooks/useErrors";
import { useEffect, useState } from "react";
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
} from "@mui/material";
import {
  Notifications as NotificationsIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  CheckCircle as CheckIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  Search as SearchIcon,
  OpenInNew as OpenIcon,
  Schedule as ScheduleIcon,
  Person as PersonIcon,
  Computer as ComputerIcon
} from "@mui/icons-material";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface PushSpecificContext {
  context: string;
  service: string;
  notificationId?: string;
  endpoint?: string;
  level: string;
  timestamp: string;
}

interface PushLogAdditionalContext {
  pushSpecific: PushSpecificContext;
  [key: string]: unknown;
}

export default function PushLogsPage() {
  const [filteredLogs, setFilteredLogs] = useState<ErrorDashboardReport[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<string>("all");
  const [selectedContext, setSelectedContext] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Получаем все push-логи
  const {
    data: allLogs,
    error,
    isLoading,
    refetch,
  } = useErrors({
    appName: "push-notifications",
    limit: 1000,
  });

  // Фильтруем логи
  useEffect(() => {
    if (!allLogs) return;

    let filtered = allLogs;

    // Фильтр по уровню
    if (selectedLevel !== "all") {
      filtered = filtered.filter((log) => {
        const additionalContext = log.additionalContext as PushLogAdditionalContext;
        return additionalContext?.pushSpecific?.level === selectedLevel;
      });
    }

    // Фильтр по контексту
    if (selectedContext !== "all") {
      filtered = filtered.filter((log) => {
        const additionalContext = log.additionalContext as PushLogAdditionalContext;
        return additionalContext?.pushSpecific?.context === selectedContext;
      });
    }

    // Фильтр по поиску
    if (searchTerm) {
      filtered = filtered.filter((log) => {
        const additionalContext = log.additionalContext as PushLogAdditionalContext;
        return (
          log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
          additionalContext?.pushSpecific?.context?.toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
    }

    setFilteredLogs(filtered);
  }, [allLogs, selectedLevel, selectedContext, searchTerm]);

  // Получаем уникальные значения для фильтров
  const levels = [
    "all",
    ...Array.from(
      new Set(
        allLogs
          ?.map((log) => {
            const additionalContext = log.additionalContext as PushLogAdditionalContext;
            return additionalContext?.pushSpecific?.level;
          })
          .filter(Boolean) || [],
      ),
    ),
  ];

  const contexts = [
    "all",
    ...Array.from(
      new Set(
        allLogs
          ?.map((log) => {
            const additionalContext = log.additionalContext as PushLogAdditionalContext;
            return additionalContext?.pushSpecific?.context;
          })
          .filter(Boolean) || [],
      ),
    ),
  ];

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "error": return <ErrorIcon />;
      case "warn": return <WarningIcon />;
      case "info": return <InfoIcon />;
      case "success": return <CheckIcon />;
      default: return <InfoIcon />;
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case "error": return "#f48fb1";
      case "warn": return "#ffb74d";
      case "info": return "#7986cb";
      case "success": return "#81c784";
      default: return "#90a4ae";
    }
  };

  const getLevelBgColor = (level: string) => {
    switch (level) {
      case "error": return "#ffebee";
      case "warn": return "#fff8e1";
      case "info": return "#e3f2fd";
      case "success": return "#e8f5e8";
      default: return "#f5f5f5";
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#f8f9fa" }}>
        <Container maxWidth="xl" sx={{ py: 4 }}>
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
          <Alert 
            severity="error"
            action={
              <IconButton color="inherit" size="small" onClick={() => refetch()}>
                <RefreshIcon />
              </IconButton>
            }
          >
            Ошибка загрузки push-логов: {error.message}
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
        <Paper elevation={1} sx={{ 
          p: 4, 
          mb: 4, 
          background: "linear-gradient(135deg, #e8f5e8 0%, #f3e5f5 100%)",
          border: "1px solid #c8e6c9"
        }}>
          <Box display="flex" alignItems="center" gap={2} mb={2}>
            <NotificationsIcon sx={{ fontSize: 40, color: "#4caf50" }} />
            <Box>
              <Typography variant="h3" component="h1" fontWeight="bold" color="#2e7d32">
                Push-логи
              </Typography>
              <Typography variant="h6" sx={{ color: "#4caf50" }}>
                Мониторинг уведомлений и push-сообщений
              </Typography>
            </Box>
          </Box>
          
          <Box display="flex" gap={1} flexWrap="wrap">
            <Chip 
              icon={<ScheduleIcon />} 
              label="Real-time логи" 
              color="success" 
              variant="outlined"
              sx={{ bgcolor: "rgba(76, 175, 80, 0.1)", color: "#2e7d32" }}
            />
            <Chip 
              icon={<FilterIcon />} 
              label="Фильтрация" 
              color="info" 
              variant="outlined"
              sx={{ bgcolor: "rgba(33, 150, 243, 0.1)", color: "#1565c0" }}
            />
            <Chip 
              icon={<SearchIcon />} 
              label="Поиск" 
              color="warning" 
              variant="outlined"
              sx={{ bgcolor: "rgba(255, 152, 0, 0.1)", color: "#ef6c00" }}
            />
          </Box>
        </Paper>

        {/* Фильтры */}
        <Card elevation={1} sx={{ mb: 4 }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight="bold" mb={3}>
              Фильтры и поиск
            </Typography>
            
            <Box display="grid" gridTemplateColumns={{ xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" }} gap={3} alignItems="center">
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
                <FormControl fullWidth size="small">
                  <InputLabel>Контекст</InputLabel>
                  <Select
                    value={selectedContext}
                    onChange={(e) => setSelectedContext(e.target.value)}
                    label="Контекст"
                  >
                    {contexts.map((context) => (
                      <MenuItem key={context} value={context}>
                        {context === "all" ? "Все контексты" : context}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <Box>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Поиск по сообщению или контексту..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />
                  }}
                />
              </Box>
            </Box>

            <Box display="flex" alignItems="center" justifyContent="space-between" mt={3}>
              <Typography variant="body2" color="text.secondary">
                Найдено: {filteredLogs.length} из {allLogs?.length || 0} логов
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
            <Typography variant="h6" fontWeight="bold" mb={3}>
              Логи push-уведомлений
            </Typography>

            {filteredLogs.length === 0 ? (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                Логи не найдены
              </Alert>
            ) : (
              <List sx={{ p: 0 }}>
                {filteredLogs.map((log, index) => {
                  const additionalContext = log.additionalContext as PushLogAdditionalContext;
                  const pushSpecific = additionalContext?.pushSpecific;
                  const level = pushSpecific?.level || "unknown";
                  const levelColor = getLevelColor(level);
                  const levelBgColor = getLevelBgColor(level);

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
                          '&:hover': {
                            transform: 'translateX(2px)',
                            boxShadow: 1,
                            borderColor: `${levelColor}50`,
                          }
                        }}
                      >
                        <ListItemAvatar>
                          <Avatar sx={{ bgcolor: levelColor, width: 40, height: 40 }}>
                            {getLevelIcon(level)}
                          </Avatar>
                        </ListItemAvatar>

                        <ListItemText
                          primary={
                            <Box display="flex" alignItems="center" gap={2} mb={1}>
                              <Typography variant="body1" fontWeight="medium" sx={{ flex: 1 }}>
                                {log.message}
                              </Typography>
                              
                              <Box display="flex" alignItems="center" gap={1}>
                                <Chip
                                  label={level}
                                  size="small"
                                  sx={{
                                    bgcolor: `${levelColor}20`,
                                    color: levelColor,
                                    fontWeight: 'bold',
                                    border: `1px solid ${levelColor}30`
                                  }}
                                />
                                
                                {pushSpecific?.context && (
                                  <Chip
                                    label={pushSpecific.context}
                                    size="small"
                                    variant="outlined"
                                    sx={{ fontWeight: 'bold' }}
                                  />
                                )}
                              </Box>
                            </Box>
                          }
                          secondary={
                            <Box>
                              <Box display="flex" alignItems="center" gap={2} mb={1}>
                                <Box display="flex" alignItems="center" gap={0.5}>
                                  <ScheduleIcon fontSize="small" color="action" />
                                  <Typography variant="caption" color="text.secondary">
                                    {formatDistanceToNow(new Date(pushSpecific?.timestamp || log.createdAt), { 
                                      addSuffix: true, 
                                      locale: ru 
                                    })}
                                  </Typography>
                                </Box>

                                {pushSpecific?.service && (
                                  <Box display="flex" alignItems="center" gap={0.5}>
                                    <ComputerIcon fontSize="small" color="action" />
                                    <Typography variant="caption" color="text.secondary">
                                      {pushSpecific.service}
                                    </Typography>
                                  </Box>
                                )}

                                {log.userId && (
                                  <Box display="flex" alignItems="center" gap={0.5}>
                                    <PersonIcon fontSize="small" color="action" />
                                    <Typography variant="caption" color="text.secondary">
                                      Пользователь
                                    </Typography>
                                  </Box>
                                )}
                              </Box>

                              {pushSpecific?.endpoint && (
                                <Typography 
                                  variant="caption" 
                                  color="text.secondary"
                                  sx={{ 
                                    display: 'block',
                                    fontFamily: 'monospace',
                                    fontSize: '0.7rem',
                                    mb: 0.5
                                  }}
                                >
                                  Endpoint: {pushSpecific.endpoint.substring(0, 60)}...
                                </Typography>
                              )}

                              {pushSpecific?.notificationId && (
                                <Typography 
                                  variant="caption" 
                                  color="text.secondary"
                                  sx={{ 
                                    display: 'block',
                                    fontFamily: 'monospace',
                                    fontSize: '0.7rem',
                                    mb: 0.5
                                  }}
                                >
                                  Notification ID: {pushSpecific.notificationId}
                                </Typography>
                              )}

                              {log.tags && log.tags.length > 0 && (
                                <Box display="flex" flexWrap="wrap" gap={0.5} mt={1}>
                                  {log.tags.map((tag, tagIndex) => (
                                    <Chip
                                      key={tagIndex}
                                      label={tag}
                                      size="small"
                                      variant="outlined"
                                      sx={{ fontSize: '0.7rem' }}
                                    />
                                  ))}
                                </Box>
                              )}
                            </Box>
                          }
                        />

                        <Box display="flex" alignItems="center" gap={0.5}>
                          {pushSpecific?.endpoint && (
                            <Tooltip title="Открыть endpoint">
                              <IconButton size="small" color="info">
                                <OpenIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </ListItem>
                      
                      {index < filteredLogs.length - 1 && <Divider sx={{ my: 1 }} />}
                    </Box>
                  );
                })}
              </List>
            )}
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}