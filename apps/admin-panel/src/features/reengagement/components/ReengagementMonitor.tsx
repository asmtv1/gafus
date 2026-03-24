"use client";

import { reportClientError } from "@gafus/error-handling";
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
  Button,
} from "@mui/material";
import {
  TrendingUp,
  Notifications,
  People,
  TouchApp,
  PersonOff,
  PlayArrow,
  Refresh,
} from "@mui/icons-material";
import { getReengagementMetrics, type ReengagementMetrics } from "../lib/getReengagementMetrics";
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
        setError(!result.success ? result.error : "Не удалось загрузить метрики");
      }
    } catch (err) {
      reportClientError(err, { issueKey: "ReengagementMonitor", keys: { operation: "load_metrics" } });
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
          "✅ Планировщик выполнен успешно!\n" +
            `🆕 Новых кампаний: ${result.result.newCampaigns}\n` +
            `📨 Уведомлений запланировано: ${result.result.scheduledNotifications}\n` +
            `✔️ Кампаний закрыто: ${result.result.closedCampaigns}`,
        );

        // Перезагрузить метрики через 2 секунды
        setTimeout(() => {
          loadMetrics();
        }, 2000);
      } else {
        setTriggerResult(`❌ Ошибка: ${result.error || "Неизвестная ошибка"}`);
      }
    } catch (err) {
      reportClientError(err, {
        issueKey: "ReengagementMonitor",
        keys: { operation: "trigger_scheduler" },
      });
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
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: { xs: "0.875rem", sm: "0.875rem" } }}
          >
            Аналитика системы возвращения неактивных пользователей
          </Typography>
        </Box>
        <Box
          display="flex"
          gap={2}
          flexDirection={{ xs: "column", sm: "row" }}
          width={{ xs: "100%", sm: "auto" }}
        >
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={loadMetrics}
            disabled={loading}
            fullWidth
            sx={{
              minHeight: { xs: "44px", sm: "auto" },
              "@media (min-width: 600px)": { width: "auto" },
            }}
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
            sx={{
              minHeight: { xs: "44px", sm: "auto" },
              "@media (min-width: 600px)": { width: "auto" },
            }}
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
      <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    color="text.secondary"
                    gutterBottom
                    sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                  >
                    Всего кампаний
                  </Typography>
                  <Typography variant="h4" sx={{ fontSize: { xs: "1.5rem", sm: "2rem" } }}>
                    {metrics.overview.totalCampaigns}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="primary"
                    sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                  >
                    Активных: {metrics.overview.activeCampaigns}
                  </Typography>
                </Box>
                <People
                  color="primary"
                  sx={{ fontSize: { xs: 32, sm: 48 }, flexShrink: 0, ml: 1 }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    color="text.secondary"
                    gutterBottom
                    sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                  >
                    Уведомления
                  </Typography>
                  <Typography variant="h4" sx={{ fontSize: { xs: "1.5rem", sm: "2rem" } }}>
                    {metrics.overview.totalNotificationsSent}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="success.main"
                    sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                  >
                    Открыто: {metrics.overview.clickedNotifications}
                  </Typography>
                </Box>
                <Notifications
                  color="primary"
                  sx={{ fontSize: { xs: 32, sm: 48 }, flexShrink: 0, ml: 1 }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    color="text.secondary"
                    gutterBottom
                    sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                  >
                    CTR (Click Rate)
                  </Typography>
                  <Typography variant="h4" sx={{ fontSize: { xs: "1.5rem", sm: "2rem" } }}>
                    {metrics.overview.clickRate.toFixed(1)}%
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                  >
                    Процент открытий
                  </Typography>
                </Box>
                <TouchApp
                  color="primary"
                  sx={{ fontSize: { xs: 32, sm: 48 }, flexShrink: 0, ml: 1 }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    color="text.secondary"
                    gutterBottom
                    sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                  >
                    Вернулись
                  </Typography>
                  <Typography variant="h4" sx={{ fontSize: { xs: "1.5rem", sm: "2rem" } }}>
                    {metrics.overview.returnedUsers}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="success.main"
                    sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                  >
                    {metrics.overview.returnRate.toFixed(1)}% от всех
                  </Typography>
                </Box>
                <TrendingUp
                  color="success"
                  sx={{ fontSize: { xs: 32, sm: 48 }, flexShrink: 0, ml: 1 }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    color="text.secondary"
                    gutterBottom
                    sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                  >
                    Отписались
                  </Typography>
                  <Typography variant="h4" sx={{ fontSize: { xs: "1.5rem", sm: "2rem" } }}>
                    {metrics.overview.unsubscribedUsers}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="error.main"
                    sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                  >
                    Не хотят получать
                  </Typography>
                </Box>
                <PersonOff
                  color="error"
                  sx={{ fontSize: { xs: 32, sm: 48 }, flexShrink: 0, ml: 1 }}
                />
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

          <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
                <Typography
                  variant="subtitle1"
                  gutterBottom
                  sx={{ fontSize: { xs: "0.875rem", sm: "1rem" } }}
                >
                  Уровень 1 (мягкое напоминание)
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  Отправлено: {metrics.byLevel.level1.sent}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  Открыто: {metrics.byLevel.level1.clicked}
                </Typography>
                <Typography
                  variant="body2"
                  color="primary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  CTR: {metrics.byLevel.level1.clickRate.toFixed(1)}%
                </Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
                <Typography
                  variant="subtitle1"
                  gutterBottom
                  sx={{ fontSize: { xs: "0.875rem", sm: "1rem" } }}
                >
                  Уровень 2 (персональное)
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  Отправлено: {metrics.byLevel.level2.sent}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  Открыто: {metrics.byLevel.level2.clicked}
                </Typography>
                <Typography
                  variant="body2"
                  color="primary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  CTR: {metrics.byLevel.level2.clickRate.toFixed(1)}%
                </Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
                <Typography
                  variant="subtitle1"
                  gutterBottom
                  sx={{ fontSize: { xs: "0.875rem", sm: "1rem" } }}
                >
                  Уровень 3 (эмоциональное)
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  Отправлено: {metrics.byLevel.level3.sent}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  Открыто: {metrics.byLevel.level3.clicked}
                </Typography>
                <Typography
                  variant="body2"
                  color="primary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
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

          <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
                <Typography
                  variant="subtitle1"
                  gutterBottom
                  sx={{ fontSize: { xs: "0.875rem", sm: "1rem" } }}
                >
                  Поддержание навыков
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  Отправлено: {metrics.byType.skillMaintenance.sent}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  Открыто: {metrics.byType.skillMaintenance.clicked}
                </Typography>
                <Typography
                  variant="body2"
                  color="primary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  CTR: {metrics.byType.skillMaintenance.clickRate.toFixed(1)}%
                </Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
                <Typography
                  variant="subtitle1"
                  gutterBottom
                  sx={{ fontSize: { xs: "0.875rem", sm: "1rem" } }}
                >
                  Мы скучаем
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  Отправлено: {metrics.byType.weMissYou.sent}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  Открыто: {metrics.byType.weMissYou.clicked}
                </Typography>
                <Typography
                  variant="body2"
                  color="primary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  CTR: {metrics.byType.weMissYou.clickRate.toFixed(1)}%
                </Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
                <Typography
                  variant="subtitle1"
                  gutterBottom
                  sx={{ fontSize: { xs: "0.875rem", sm: "1rem" } }}
                >
                  Развитие собаки
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  Отправлено: {metrics.byType.dogDevelopment.sent}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
                  Открыто: {metrics.byType.dogDevelopment.clicked}
                </Typography>
                <Typography
                  variant="body2"
                  color="primary"
                  sx={{ fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                >
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

          {/* Десктопная таблица */}
          <TableContainer
            sx={{
              overflowX: "auto",
              display: { xs: "none", sm: "block" },
            }}
          >
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
                {metrics.recentCampaigns.map((campaign: ReengagementMetrics["recentCampaigns"][number]) => (
                  <TableRow key={campaign.id}>
                    <TableCell>{campaign.userName || "Неизвестен"}</TableCell>
                    <TableCell>
                      {new Date(campaign.campaignStartDate).toLocaleDateString("ru-RU")}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={`Уровень ${campaign.level}`}
                        size="small"
                        color={
                          campaign.level === 1
                            ? "default"
                            : campaign.level === 2
                              ? "primary"
                              : "secondary"
                        }
                      />
                    </TableCell>
                    <TableCell align="center">{campaign.notificationsSent}</TableCell>
                    <TableCell align="center">{campaign.clicked}</TableCell>
                    <TableCell align="center">
                      {campaign.returned && <Chip label="Вернулся" size="small" color="success" />}
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

          {/* Мобильные карточки */}
          <Box sx={{ display: { xs: "block", sm: "none" } }}>
            {metrics.recentCampaigns.map((campaign: ReengagementMetrics["recentCampaigns"][number]) => (
              <Paper
                key={campaign.id}
                sx={{
                  p: 2,
                  mb: 2,
                  borderRadius: 2,
                  boxShadow: 1,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    mb: 1.5,
                  }}
                >
                  <Typography variant="subtitle1" fontWeight="medium">
                    {campaign.userName || "Неизвестен"}
                  </Typography>
                  <Chip
                    label={`Уровень ${campaign.level}`}
                    size="small"
                    color={
                      campaign.level === 1
                        ? "default"
                        : campaign.level === 2
                          ? "primary"
                          : "secondary"
                    }
                  />
                </Box>

                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Дата старта
                    </Typography>
                    <Typography variant="body2">
                      {new Date(campaign.campaignStartDate).toLocaleDateString("ru-RU")}
                    </Typography>
                  </Box>

                  <Box sx={{ display: "flex", gap: 2 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Отправлено
                      </Typography>
                      <Typography variant="body2" fontWeight="medium">
                        {campaign.notificationsSent}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Открыто
                      </Typography>
                      <Typography variant="body2" fontWeight="medium">
                        {campaign.clicked}
                      </Typography>
                    </Box>
                  </Box>

                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Статус
                    </Typography>
                    <Box sx={{ mt: 0.5 }}>
                      {campaign.returned && <Chip label="Вернулся" size="small" color="success" />}
                      {campaign.unsubscribed && (
                        <Chip label="Отписался" size="small" color="error" />
                      )}
                      {campaign.isActive && !campaign.returned && !campaign.unsubscribed && (
                        <Chip label="Активна" size="small" color="primary" />
                      )}
                      {!campaign.isActive && !campaign.returned && !campaign.unsubscribed && (
                        <Chip label="Завершена" size="small" color="default" />
                      )}
                    </Box>
                  </Box>
                </Box>
              </Paper>
            ))}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
