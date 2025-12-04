#!/usr/bin/env node
/**
 * Тест записи error/fatal логов в PostgreSQL
 * 
 * Запуск: node packages/logger/test-database-logging.js
 * 
 * Этот скрипт проверяет, что error и fatal логи записываются в таблицу ErrorLog
 */

import { createWebLogger, createWorkerLogger } from './dist/index.js';
import { prisma } from '@gafus/prisma';

async function testDatabaseLogging() {
  console.log('🧪 Тестирование записи логов в PostgreSQL (ErrorLog)...\n');

  try {
    // Создаем логгеры для разных приложений
    const webLogger = createWebLogger('test-web-app');
    const workerLogger = createWorkerLogger('test-worker');

    // Тест 1: Error уровень из web приложения
    console.log('1️⃣ Тестируем error уровень (web app)...');
    const error1 = new Error('Test error message for database logging');
    error1.stack = 'Error: Test error message for database logging\n    at testDatabaseLogging (test-database-logging.js:25:15)';
    
    await webLogger.error('Test error for database integration', error1, {
      testId: 'db-test-error-001',
      userId: 'test-user-123',
      sessionId: 'test-session-456',
      url: '/test/error-endpoint',
      componentStack: 'TestComponent -> ErrorBoundary',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      additionalData: {
        requestId: 'req-789',
        userAgent: 'Mozilla/5.0 (Test Browser)',
      },
    });
    console.log('✅ Error лог отправлен\n');

    // Небольшая задержка для записи в БД
    await new Promise(resolve => setTimeout(resolve, 500));

    // Тест 2: Fatal уровень из worker
    console.log('2️⃣ Тестируем fatal уровень (worker)...');
    const fatalError = new Error('Test fatal error - critical system failure');
    fatalError.stack = 'Error: Test fatal error - critical system failure\n    at testDatabaseLogging (test-database-logging.js:40:15)\n    at processQueue (worker.js:123:45)';
    
    await workerLogger.fatal('Test fatal error for database integration', fatalError, {
      testId: 'db-test-fatal-002',
      jobId: 'job-999',
      queueName: 'test-queue',
      retryAttempt: 3,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      critical: true,
      systemComponent: 'queue-processor',
    });
    console.log('✅ Fatal лог отправлен\n');

    // Задержка для записи в БД
    await new Promise(resolve => setTimeout(resolve, 500));

    // Проверяем, что ошибки записались в БД
    console.log('3️⃣ Проверяем записи в БД...\n');
    
    const recentErrors = await prisma.errorLog.findMany({
      where: {
        OR: [
          { message: { contains: 'Test error for database integration' } },
          { message: { contains: 'Test fatal error for database integration' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (recentErrors.length === 0) {
      console.log('⚠️  Ошибки не найдены в БД. Возможные причины:');
      console.log('   - Логи ещё не записались (попробуйте подождать 1-2 секунды)');
      console.log('   - DATABASE_URL не настроен');
      console.log('   - Таблица ErrorLog не создана');
      console.log('   - Логгер не настроен для записи в БД\n');
    } else {
      console.log(`✅ Найдено ${recentErrors.length} ошибок в БД:\n`);
      
      recentErrors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.level.toUpperCase()}: ${error.message.substring(0, 60)}...`);
        console.log(`      App: ${error.appName}, Env: ${error.environment}`);
        console.log(`      ID: ${error.id}`);
        console.log(`      Created: ${error.createdAt.toISOString()}`);
        console.log(`      Status: ${error.status}`);
        if (error.context) {
          console.log(`      Context: ${error.context}`);
        }
        console.log('');
      });
    }

    // Статистика
    console.log('4️⃣ Статистика по ошибкам в БД:\n');
    const stats = await prisma.errorLog.groupBy({
      by: ['level', 'appName'],
      _count: true,
      where: {
        createdAt: {
          gte: new Date(Date.now() - 5 * 60 * 1000), // Последние 5 минут
        },
      },
    });

    if (stats.length > 0) {
      console.log('   Последние 5 минут:');
      stats.forEach(stat => {
        console.log(`   - ${stat.level} (${stat.appName}): ${stat._count} ошибок`);
      });
    } else {
      console.log('   Нет ошибок за последние 5 минут');
    }

    console.log('\n🎉 Тест завершен!');
    console.log('\n📊 Проверьте Error Dashboard:');
    console.log('   - http://localhost:3000 (или ваш URL error-dashboard)');
    console.log('\n💡 Ошибки должны отображаться в списке и их можно удалить через UI');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error);
    if (error.message?.includes('DATABASE_URL') || error.message?.includes('connect')) {
      console.error('\n💡 Убедитесь, что:');
      console.error('   - DATABASE_URL настроен в .env');
      console.error('   - PostgreSQL запущен и доступен');
      console.error('   - Таблица ErrorLog создана (выполните prisma db push)');
    }
    process.exit(1);
  } finally {
    // Закрываем соединение с БД
    await prisma.$disconnect();
  }
}

// Запускаем тест
testDatabaseLogging()
  .then(() => {
    console.log('\n✨ Тест завершен успешно!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Тест завершился с ошибкой:', error);
    process.exit(1);
  });

