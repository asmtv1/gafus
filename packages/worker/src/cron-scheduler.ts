/**
 * Cron-планировщик для периодических задач
 * Запускает re-engagement планировщик ежедневно
 */

import cron from 'node-cron';
import { scheduleReengagementCampaigns } from '@gafus/reengagement';
import { recordDailyMetrics } from '@gafus/reengagement';
import { createWorkerLogger } from '@gafus/logger';
import { sendTrainingReminders } from './training-reminders-sender';

const logger = createWorkerLogger('cron-scheduler');

/**
 * Запустить все cron задачи
 */
export function startCronJobs(): void {
  logger.info('Запуск cron-планировщика...');

  // Задача 1: Re-engagement планировщик (ежедневно в 8:00 МСК)
  cron.schedule('0 8 * * *', async () => {
    logger.info('Запуск re-engagement планировщика по расписанию');
    
    try {
      const result = await scheduleReengagementCampaigns();
      
      logger.success('Re-engagement планировщик завершил работу', result);
    } catch (error) {
      logger.error('Ошибка выполнения re-engagement планировщика', error as Error);
    }
  }, {
    timezone: 'Europe/Moscow'
  });

  // Задача 2: Сбор ежедневных метрик (ежедневно в 23:55 МСК)
  cron.schedule('55 23 * * *', async () => {
    logger.info('Запуск сбора ежедневных метрик по расписанию');
    
    try {
      await recordDailyMetrics();
      
      logger.success('Ежедневные метрики успешно записаны');
    } catch (error) {
      logger.error('Ошибка записи ежедневных метрик', error as Error);
    }
  }, {
    timezone: 'Europe/Moscow'
  });

  // Задача 3: Отправка напоминаний о тренировках (каждые 10 минут)
  cron.schedule('*/10 * * * *', async () => {
    logger.info('Запуск проверки напоминаний о тренировках');
    
    try {
      const result = await sendTrainingReminders();
      
      logger.success('Проверка напоминаний завершена', {
        sent: result.sent,
        skipped: result.skipped,
        errors: result.errors
      });
    } catch (error) {
      logger.error('Ошибка при проверке напоминаний', error as Error);
    }
  });

  logger.success('Cron-планировщик запущен', {
    tasks: [
      'Re-engagement планировщик: ежедневно в 8:00 МСК',
      'Сбор метрик: ежедневно в 23:55 МСК',
      'Напоминания о тренировках: каждые 10 минут'
    ]
  });
}

