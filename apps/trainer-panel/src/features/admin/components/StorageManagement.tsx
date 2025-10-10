"use client";

import { Box, Card, CardContent, Typography, Chip, Divider } from "@/utils/muiImports";
import type { StorageStats } from "../lib/getStorageStats";

interface StorageManagementProps {
  stats: StorageStats;
}

export default function StorageManagement({ stats }: StorageManagementProps) {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Управление хранилищем видео
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Статистика и мониторинг хранения видео экзаменов
      </Typography>

      {/* Общая статистика */}
      <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
        Общая статистика
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mb: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h4" color="primary">
              {stats.totalExamResults}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Всего экзаменов
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h4" color="success.main">
              {stats.withVideo}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              С видео (активных)
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h4" color="text.secondary">
              {stats.withoutVideo}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Без видео
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h4" color="warning.main">
              {stats.deletedVideos}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Видео удалено
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Статистика по статусам */}
      <Typography variant="h6" gutterBottom>
        По статусам экзаменов
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 2, mb: 3 }}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h5" color="success.main">
                {stats.completedWithVideo}
              </Typography>
              <Chip label="Зачтено" color="success" size="small" />
            </Box>
            <Typography variant="body2" color="text.secondary">
              Зачтенные экзамены с видео
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Хранятся 30 дней
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h5" color="warning.main">
                {stats.pendingWithVideo}
              </Typography>
              <Chip label="Ожидает проверки" color="warning" size="small" />
            </Box>
            <Typography variant="body2" color="text.secondary">
              Незачтенные экзамены с видео
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Хранятся 90 дней
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Кандидаты на удаление */}
      <Typography variant="h6" gutterBottom>
        Кандидаты на автоудаление
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 2, mb: 3 }}>
        <Card sx={{ border: '1px solid', borderColor: 'error.light' }}>
          <CardContent>
            <Typography variant="h5" color="error.main">
              {stats.completedOlderThan30Days}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Зачтенные старше 30 дней
            </Typography>
            <Typography variant="caption" color="error.main">
              Будут удалены при следующей очистке
            </Typography>
          </CardContent>
        </Card>

        <Card sx={{ border: '1px solid', borderColor: 'error.light' }}>
          <CardContent>
            <Typography variant="h5" color="error.main">
              {stats.pendingOlderThan90Days}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Незачтенные старше 90 дней
            </Typography>
            <Typography variant="caption" color="error.main">
              Будут удалены при следующей очистке
            </Typography>
          </CardContent>
        </Card>
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* История удалений */}
      <Typography variant="h6" gutterBottom>
        История удалений
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 2 }}>
        <Card>
          <CardContent>
            <Typography variant="h5">
              {stats.deletedByReplacement}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Удалено при перезаписи
            </Typography>
            <Chip label="replaced" size="small" sx={{ mt: 1 }} />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h5">
              {stats.deletedByAutoCleanupCompleted}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Зачтенные (автоочистка)
            </Typography>
            <Chip label="auto_cleanup_completed" size="small" sx={{ mt: 1 }} />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h5">
              {stats.deletedByAutoCleanupPending}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Незачтенные (автоочистка)
            </Typography>
            <Chip label="auto_cleanup_pending" size="small" sx={{ mt: 1 }} />
          </CardContent>
        </Card>
      </Box>

      <Box sx={{ mt: 3, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
        <Typography variant="body2" color="info.dark">
          ℹ️ Автоматическая очистка запускается каждый день в 03:00 MSK
        </Typography>
        <Typography variant="caption" color="info.dark" sx={{ display: 'block', mt: 1 }}>
          • Зачтенные экзамены: удаление через 30 дней после зачета<br />
          • Незачтенные экзамены: удаление через 90 дней после создания<br />
          • При перезаписи: старое видео удаляется немедленно
        </Typography>
      </Box>
    </Box>
  );
}

