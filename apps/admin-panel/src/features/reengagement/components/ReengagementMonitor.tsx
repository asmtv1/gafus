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
  Chip,
  Box,
  CircularProgress,
  Alert,
  Button
} from "@mui/material";
import {
  TrendingUp,
  Notifications,
  People,
  TouchApp,
  PersonOff,
  PlayArrow,
  Refresh
} from "@mui/icons-material";
import {
  getReengagementMetrics,
  type ReengagementMetrics
} from "../lib/getReengagementMetrics";
import { triggerReengagementScheduler } from "../lib/triggerScheduler";

/**
 * Компонент мониторинга re-engagement системы
 * Только для администраторов
 */
export default function ReengagementMonitor() {
  const [metrics, setMetrics] = useState<ReengagementMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await getReengagementMetrics();
      
      if (result.success && result.data) {
        setMetrics(result.data);
      } else {
        setError(result.error || "Не удалось загрузить метрики");
      }
    } catch {
      setError("Произошла ошибка при загрузке метрик");
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerScheduler = async () => {
    try {
      setTriggering(true);
      setTriggerResult(null);
      
      const result = await triggerReengagementScheduler();
      
      if (result.success && result.result) {
        setTriggerResult(
          `✅ Планировщик выполнен успешно!\n` +
          `🆕 Новых кампаний: ${result.result.newCampaigns}\n` +
          `📨 Уведомлений запланировано: ${result.result.scheduledNotifications}\n` +
          `✔️ Кампаний закрыто: ${result.result.closedCampaigns}`
        );
        
        // Перезагрузить метрики через 2 секунды
        setTimeout(() => {
          loadMetrics();
        }, 2000);
      } else {
        setTriggerResult(`❌ Ошибка: ${result.error || "Неизвестная ошибка"}`);
      }
    } catch {
      setTriggerResult("❌ Произошла ошибка при запуске планировщика");
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !metrics) {
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
            Мониторинг Re-engagement
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: "0.875rem", sm: "0.875rem" } }}>
            Аналитика системы возвращения неактивных пользователей
          </Typography>
        </Box>
        <Box display="flex" gap={2} flexDirection={{ xs: "column", sm: "row" }} width={{ xs: "100%", sm: "auto" }}>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={loadMetrics}
            disabled={loading}
            fullWidth
            sx={{ "@media (min-width: 600px)": { width: "auto" } }}
          >
            Обновить
          </Button>
          <Button
            variant="contained"
            startIcon={<PlayArrow />}
            onClick={handleTriggerScheduler}
            disabled={triggering || loading}
            color="primary"
            fullWidth
            sx={{ "@media (min-width: 600px)": { width: "auto" } }}
          >
            {triggering ? "Запуск..." : "Запустить планировщик"}
          </Button>
        </Box>
      </Box>

      {triggerResult && (
        <Alert 
          severity={triggerResult.includes("✅") ? "success" : "error"}
          onClose={() => setTriggerResult(null)}
          sx={{ mb: 3, whiteSpace: "pre-line" }}
        >
          {triggerResult}
        </Alert>
      )}

      {/* Общая статистика */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Всего кампаний
                  </Typography>
                  <Typography variant="h4">
                    {metrics.overview.totalCampaigns}
                  </Typography>
                  <Typography variant="body2" color="primary">
                    Активных: {metrics.overview.activeCampaigns}
                  </Typography>
                </Box>
                <People color="primary" sx={{ fontSize: 48 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Уведомления
                  </Typography>
                  <Typography variant="h4">
                    {metrics.overview.totalNotificationsSent}
                  </Typography>
                  <Typography variant="body2" color="success.main">
                    Открыто: {metrics.overview.clickedNotifications}
                  </Typography>
                </Box>
                <Notifications color="primary" sx={{ fontSize: 48 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    CTR (Click Rate)
                  </Typography>
                  <Typography variant="h4">
                    {metrics.overview.clickRate.toFixed(1)}%
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Процент открытий
                  </Typography>
                </Box>
                <TouchApp color="primary" sx={{ fontSize: 48 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Вернулись
                  </Typography>
                  <Typography variant="h4">
                    {metrics.overview.returnedUsers}
                  </Typography>
                  <Typography variant="body2" color="success.main">
                    {metrics.overview.returnRate.toFixed(1)}% от всех
                  </Typography>
                </Box>
                <TrendingUp color="success" sx={{ fontSize: 48 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Отписались
                  </Typography>
                  <Typography variant="h4">
                    {metrics.overview.unsubscribedUsers}
                  </Typography>
                  <Typography variant="body2" color="error.main">
                    Не хотят получать
                  </Typography>
                </Box>
                <PersonOff color="error" sx={{ fontSize: 48 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Метрики по уровням */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: "1.1rem", sm: "1.25rem" } }}>
            Эффективность по уровням
          </Typography>
          
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Уровень 1 (мягкое напоминание)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Отправлено: {metrics.byLevel.level1.sent}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Открыто: {metrics.byLevel.level1.clicked}
                </Typography>
                <Typography variant="body2" color="primary">
                  CTR: {metrics.byLevel.level1.clickRate.toFixed(1)}%
                </Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Уровень 2 (персональное)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Отправлено: {metrics.byLevel.level2.sent}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Открыто: {metrics.byLevel.level2.clicked}
                </Typography>
                <Typography variant="body2" color="primary">
                  CTR: {metrics.byLevel.level2.clickRate.toFixed(1)}%
                </Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Уровень 3 (эмоциональное)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Отправлено: {metrics.byLevel.level3.sent}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Открыто: {metrics.byLevel.level3.clicked}
                </Typography>
                <Typography variant="body2" color="primary">
                  CTR: {metrics.byLevel.level3.clickRate.toFixed(1)}%
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Метрики по типам сообщений */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: "1.1rem", sm: "1.25rem" } }}>
            Эффективность по типам сообщений
          </Typography>
          
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Поддержание навыков
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Отправлено: {metrics.byType.skillMaintenance.sent}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Открыто: {metrics.byType.skillMaintenance.clicked}
                </Typography>
                <Typography variant="body2" color="primary">
                  CTR: {metrics.byType.skillMaintenance.clickRate.toFixed(1)}%
                </Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Мы скучаем
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Отправлено: {metrics.byType.weMissYou.sent}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Открыто: {metrics.byType.weMissYou.clicked}
                </Typography>
                <Typography variant="body2" color="primary">
                  CTR: {metrics.byType.weMissYou.clickRate.toFixed(1)}%
                </Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Развитие собаки
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Отправлено: {metrics.byType.dogDevelopment.sent}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Открыто: {metrics.byType.dogDevelopment.clicked}
                </Typography>
                <Typography variant="body2" color="primary">
                  CTR: {metrics.byType.dogDevelopment.clickRate.toFixed(1)}%
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Последние кампании */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: "1.1rem", sm: "1.25rem" } }}>
            Последние кампании
          </Typography>

          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Пользователь</TableCell>
                  <TableCell>Дата старта</TableCell>
                  <TableCell>Уровень</TableCell>
                  <TableCell align="center">Отправлено</TableCell>
                  <TableCell align="center">Открыто</TableCell>
                  <TableCell align="center">Статус</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {metrics.recentCampaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>{campaign.userName || "Неизвестен"}</TableCell>
                    <TableCell>
                      {new Date(campaign.campaignStartDate).toLocaleDateString('ru-RU')}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={`Уровень ${campaign.level}`} 
                        size="small" 
                        color={
                          campaign.level === 1 ? 'default' :
                          campaign.level === 2 ? 'primary' :
                          'secondary'
                        }
                      />
                    </TableCell>
                    <TableCell align="center">{campaign.notificationsSent}</TableCell>
                    <TableCell align="center">{campaign.clicked}</TableCell>
                    <TableCell align="center">
                      {campaign.returned && (
                        <Chip label="Вернулся" size="small" color="success" />
                      )}
                      {campaign.unsubscribed && (
                        <Chip label="Отписался" size="small" color="error" />
                      )}
                      {campaign.isActive && !campaign.returned && !campaign.unsubscribed && (
                        <Chip label="Активна" size="small" color="primary" />
                      )}
                      {!campaign.isActive && !campaign.returned && !campaign.unsubscribed && (
                        <Chip label="Завершена" size="small" color="default" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
}

