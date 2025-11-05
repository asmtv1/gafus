"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  Typography,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
  CircularProgress,
  Alert,
  Button,
  Chip
} from "@mui/material";
import {
  Visibility,
  People,
  AccessTime,
  TrendingUp,
  Language,
  Refresh,
  Link as LinkIcon
} from "@mui/icons-material";
import {
  getPresentationStats,
  type PresentationStats
} from "../lib/getPresentationStats";

/**
 * Компонент отображения статистики по presentation.html
 * Только для администраторов
 */
export default function PresentationStatsMonitor() {
  const [stats, setStats] = useState<PresentationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await getPresentationStats();
      
      if (result.success && result.data) {
        setStats(result.data);
      } else {
        setError(result.error || "Не удалось загрузить статистику");
      }
    } catch {
      setError("Произошла ошибка при загрузке статистики");
    } finally {
      setLoading(false);
    }
  };

  // Форматирование времени
  const formatTime = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds} сек`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
      return `${minutes} мин ${remainingSeconds} сек`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours} ч ${remainingMinutes} мин`;
  };


  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !stats) {
    return (
      <Alert severity="error" onClose={() => setError(null)}>
        {error || "Нет данных"}
      </Alert>
    );
  }

  return (
    <Box>
      <Box 
        display="flex" 
        justifyContent="space-between" 
        alignItems={{ xs: "flex-start", sm: "center" }}
        flexDirection={{ xs: "column", sm: "row" }}
        gap={{ xs: 2, sm: 0 }}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h5" gutterBottom sx={{ fontSize: { xs: "1.25rem", sm: "1.5rem" } }}>
            Статистика по презентации
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: "0.875rem", sm: "0.875rem" } }}>
            Аналитика просмотров presentation.html
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={loadStats}
          disabled={loading}
          fullWidth
          sx={{ 
            "@media (min-width: 600px)": { 
              width: "auto",
              alignSelf: "flex-start"
            } 
          }}
        >
          Обновить
        </Button>
      </Box>

      {/* Общая статистика */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Всего просмотров
                  </Typography>
                  <Typography variant="h4">
                    {stats.overview.totalViews}
                  </Typography>
                </Box>
                <Visibility color="primary" sx={{ fontSize: 48 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Уникальных посетителей
                  </Typography>
                  <Typography variant="h4">
                    {stats.overview.uniqueVisitors || stats.overview.uniqueSessions}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Сессий: {stats.overview.uniqueSessions}
                  </Typography>
                </Box>
                <People color="primary" sx={{ fontSize: 48 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Глубокая вовлечённость
                  </Typography>
                  <Typography variant="h4">
                    {stats.engagement.deepEngagement}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {stats.overview.totalViews > 0 
                      ? Math.round((stats.engagement.deepEngagement / stats.overview.totalViews) * 100 * 10) / 10 
                      : 0}%
                  </Typography>
                </Box>
                <TrendingUp color="primary" sx={{ fontSize: 48 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Клики по CTA
                  </Typography>
                  <Typography variant="h4">
                    {stats.engagement.clickedCTA}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {Math.round(stats.engagement.avgClicksPerSession * 10) / 10} на сессию
                  </Typography>
                </Box>
                <LinkIcon color="primary" sx={{ fontSize: 48 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Метрики вовлечённости */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Дочитали до конца
                  </Typography>
                  <Typography variant="h4">
                    {stats.engagement.readToEnd}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {stats.overview.totalViews > 0 
                      ? Math.round((stats.engagement.readToEnd / stats.overview.totalViews) * 100 * 10) / 10 
                      : 0}%
                  </Typography>
                </Box>
                <TrendingUp color="primary" sx={{ fontSize: 48 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Провели 5+ минут
                  </Typography>
                  <Typography variant="h4">
                    {stats.engagement.stayedLong}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {stats.overview.totalViews > 0 
                      ? Math.round((stats.engagement.stayedLong / stats.overview.totalViews) * 100 * 10) / 10 
                      : 0}%
                  </Typography>
                </Box>
                <AccessTime color="primary" sx={{ fontSize: 48 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Среднее время
                  </Typography>
                  <Typography variant="h4">
                    {formatTime(Math.round(stats.overview.avgTimeOnPage))}
                  </Typography>
                </Box>
                <AccessTime color="primary" sx={{ fontSize: 48 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Средняя прокрутка
                  </Typography>
                  <Typography variant="h4">
                    {stats.overview.avgScrollDepth}%
                  </Typography>
                </Box>
                <TrendingUp color="primary" sx={{ fontSize: 48 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Статистика по источникам */}
      {stats.byReferrer.length > 0 && (
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: "1.1rem", sm: "1.25rem" } }}>
              Статистика по источникам (Referrer)
            </Typography>

            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Домен</TableCell>
                    <TableCell align="center">Просмотров</TableCell>
                    <TableCell align="center">Уникальных сессий</TableCell>
                    <TableCell align="center">Среднее время</TableCell>
                    <TableCell align="center">Вовлечённость</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.byReferrer.map((ref, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        {ref.domain ? (
                          <Box display="flex" alignItems="center" gap={1}>
                            <Language fontSize="small" />
                            {ref.domain}
                          </Box>
                        ) : (
                          <Typography color="text.secondary">Прямой переход</Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">{ref.views}</TableCell>
                      <TableCell align="center">{ref.uniqueSessions}</TableCell>
                      <TableCell align="center">
                        {ref.avgTimeOnPage > 0 ? formatTime(Math.round(ref.avgTimeOnPage)) : '-'}
                      </TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={`${ref.deepEngagementRate}%`} 
                          size="small" 
                          color={ref.deepEngagementRate > 30 ? "success" : ref.deepEngagementRate > 15 ? "warning" : "default"}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Воронка вовлечённости */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: "1.1rem", sm: "1.25rem" } }}>
            Воронка вовлечённости по секциям
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {[
              { name: 'Hero', value: stats.funnel.hero, label: 'Начало просмотра' },
              { name: 'Problem', value: stats.funnel.problem, label: 'Проблемы' },
              { name: 'Solution', value: stats.funnel.solution, label: 'Решение' },
              { name: 'Features', value: stats.funnel.features, label: 'Возможности' },
              { name: 'Comparison', value: stats.funnel.comparison, label: 'Сравнение' },
              { name: 'Goals', value: stats.funnel.goals, label: 'Цели' },
              { name: 'Contact', value: stats.funnel.contact, label: 'Контакты' },
            ].map((section, index) => {
              const percentage = stats.funnel.hero > 0 
                ? Math.round((section.value / stats.funnel.hero) * 100 * 10) / 10 
                : 0;
              return (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={index}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle1" gutterBottom>
                      {section.name}
                    </Typography>
                    <Typography variant="h6" color="primary">
                      {section.value} ({percentage}%)
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {section.label}
                    </Typography>
                    <Box
                      sx={{
                        mt: 1,
                        height: 8,
                        bgcolor: 'primary.main',
                        borderRadius: 1,
                        width: `${percentage}%`
                      }}
                    />
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        </CardContent>
      </Card>

      {/* Вехи прокрутки */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: "1.1rem", sm: "1.25rem" } }}>
            Вехи прокрутки
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {stats.scrollMilestones.map((milestone, index) => (
              <Grid size={{ xs: 12, sm: 6, md: 3 }} key={index}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h6" color="primary">
                    {milestone.milestone}%
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {milestone.reached} пользователей
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {milestone.percentage}% от всех
                  </Typography>
                  <Box
                    sx={{
                      mt: 1,
                      height: 8,
                      bgcolor: 'primary.main',
                      borderRadius: 1,
                      width: `${milestone.percentage}%`,
                      mx: 'auto'
                    }}
                  />
                </Paper>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Статистика по устройствам */}
      {stats.byDevice.length > 0 && (
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: "1.1rem", sm: "1.25rem" } }}>
              Статистика по устройствам
            </Typography>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Устройство</TableCell>
                    <TableCell align="center">Просмотров</TableCell>
                    <TableCell align="center">Среднее время</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.byDevice.map((device, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        {device.deviceType || 'Неизвестно'}
                      </TableCell>
                      <TableCell align="center">{device.views}</TableCell>
                      <TableCell align="center">
                        {device.avgTimeOnPage > 0 ? formatTime(Math.round(device.avgTimeOnPage)) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Статистика по UTM меткам */}
      {stats.byUTM.length > 0 && (
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: "1.1rem", sm: "1.25rem" } }}>
              Статистика по UTM меткам
            </Typography>

            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Source</TableCell>
                    <TableCell>Medium</TableCell>
                    <TableCell>Campaign</TableCell>
                    <TableCell align="center">Просмотров</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.byUTM.map((utm, index) => (
                    <TableRow key={index}>
                      <TableCell>{utm.source || '-'}</TableCell>
                      <TableCell>{utm.medium || '-'}</TableCell>
                      <TableCell>{utm.campaign || '-'}</TableCell>
                      <TableCell align="center">{utm.views}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Последние просмотры */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: "1.1rem", sm: "1.25rem" } }}>
            Последние просмотры
          </Typography>

          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Дата</TableCell>
                    <TableCell>Источник</TableCell>
                    <TableCell align="center">Время</TableCell>
                    <TableCell align="center">Прокрутка</TableCell>
                    <TableCell align="center">Клики CTA</TableCell>
                    <TableCell align="center">Устройство</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stats.recentViews.map((view) => (
                  <TableRow key={view.id}>
                    <TableCell>
                      {new Date(view.firstViewAt).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </TableCell>
                    <TableCell>
                      {view.referrerDomain ? (
                        <Chip 
                          label={view.referrerDomain} 
                          size="small" 
                          icon={<LinkIcon />}
                        />
                      ) : (
                        <Typography color="text.secondary" variant="body2">
                          Прямой переход
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {view.timeOnPage ? formatTime(view.timeOnPage) : '-'}
                    </TableCell>
                    <TableCell align="center">
                      {view.scrollDepth !== null ? `${view.scrollDepth}%` : '-'}
                    </TableCell>
                    <TableCell align="center">
                      {view.ctaClicks > 0 ? (
                        <Chip label={view.ctaClicks} size="small" color="primary" />
                      ) : '-'}
                    </TableCell>
                    <TableCell align="center">
                      {view.deviceType || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Распределение по времени суток */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: "1.1rem", sm: "1.25rem" } }}>
            Распределение просмотров по времени суток
          </Typography>

          <Grid container spacing={2} sx={{ mt: 1 }}>
            {stats.timeDistribution.map((item) => (
              <Grid size={{ xs: 6, sm: 4, md: 3 }} key={item.hour}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h6" color="primary">
                    {item.hour}:00
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {item.views} просмотров
                  </Typography>
                  <Box
                    sx={{
                      mt: 1,
                      height: 8,
                      bgcolor: 'primary.main',
                      borderRadius: 1,
                      width: `${(item.views / Math.max(...stats.timeDistribution.map(t => t.views))) * 100}%`
                    }}
                  />
                </Paper>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}

