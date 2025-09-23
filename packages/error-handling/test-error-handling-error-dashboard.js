#!/usr/bin/env node
/**
 * Тест отправки логов error-handling в error-dashboard
 * 
 * Запуск: node packages/error-handling/test-error-handling-error-dashboard.js
 */

import { createLogger, ErrorReporter } from '@gafus/error-handling/dist/index.js';

async function testErrorHandlingErrorDashboard() {
  console.log('🧪 Тестирование отправки логов error-handling в error-dashboard...\n');

  try {
    // Тест 1: Error-dashboard логгер (не должен отправлять в себя)
    console.log('1️⃣ Тестируем error-dashboard логгер...');
    const dashboardLogger = createLogger('error-dashboard-app', 'production');
    await dashboardLogger.error('Failed to process error report', new Error('Invalid JSON format'), {
      reportId: 'report-123',
      source: 'web-app',
      timestamp: Date.now()
    });
    console.log('✅ Error-dashboard error лог отправлен (не в себя)\n');

    // Тест 2: Web логгер через error-handling
    console.log('2️⃣ Тестируем web логгер через error-handling...');
    const webLogger = createLogger('web-app', 'production');
    await webLogger.error('Failed to load user data', new Error('Network timeout'), {
      userId: 'user-123',
      endpoint: '/api/user',
      retryCount: 3
    });
    console.log('✅ Web error лог отправлен\n');

    // Тест 3: Trainer panel логгер через error-handling
    console.log('3️⃣ Тестируем trainer panel логгер через error-handling...');
    const trainerLogger = createLogger('trainer-panel-app', 'production');
    await trainerLogger.error('Failed to save training data', new Error('Validation error'), {
      trainingId: 'training-456',
      userId: 'trainer-789',
      errors: ['Invalid exercise type', 'Missing duration']
    });
    console.log('✅ Trainer panel error лог отправлен\n');

    // Тест 4: Worker логгер через error-handling
    console.log('4️⃣ Тестируем worker логгер через error-handling...');
    const workerLogger = createLogger('worker-app', 'production');
    await workerLogger.error('Failed to process queue job', new Error('Database connection failed'), {
      jobId: 'job-123',
      queueName: 'notifications',
      attempt: 2
    });
    console.log('✅ Worker error лог отправлен\n');

    // Тест 5: Telegram bot логгер через error-handling
    console.log('5️⃣ Тестируем telegram bot логгер через error-handling...');
    const botLogger = createLogger('telegram-bot-app', 'production');
    await botLogger.error('Failed to send message', new Error('API rate limit exceeded'), {
      chatId: 'chat-456',
      messageType: 'notification',
      userId: 'user-789'
    });
    console.log('✅ Telegram bot error лог отправлен\n');

    // Тест 6: ErrorReporter класс
    console.log('6️⃣ Тестируем ErrorReporter класс...');
    const errorReporter = new ErrorReporter({
      appName: 'test-app',
      environment: 'production',
      logToConsole: true
    });

    const testError = new Error('Test error for ErrorReporter');
    const errorInfo = {
      componentStack: 'TestComponent -> ErrorBoundary',
      errorBoundaryName: 'TestErrorBoundary',
      appName: 'test-app',
      url: 'http://localhost:3000/test',
      userAgent: 'Mozilla/5.0 (Test Browser)',
      timestamp: Date.now(),
      userId: 'user-123',
      sessionId: 'session-456'
    };

    const success = await errorReporter.reportError(testError, errorInfo, {
      additionalData: 'test data',
      customField: 'custom value'
    });
    console.log(`✅ ErrorReporter test completed: ${success}\n`);

    // Тест 7: Предупреждения (только в production)
    console.log('7️⃣ Тестируем предупреждения...');
    webLogger.warn('Slow API response detected', {
      endpoint: '/api/data',
      responseTime: 5000,
      threshold: 3000
    });
    console.log('✅ Warning лог отправлен\n');

    // Тест 8: Успешные операции
    console.log('8️⃣ Тестируем успешные операции...');
    webLogger.success('User data loaded successfully', {
      userId: 'user-123',
      dataSize: '2.5KB',
      duration: '150ms'
    });
    console.log('✅ Success лог отправлен\n');

    console.log('🎉 Все тесты завершены!');
    console.log('\n📊 Проверьте error-dashboard:');
    console.log('   - Reports: http://localhost:3001/reports');
    console.log('   - Push Logs: http://localhost:3001/push-logs');
    console.log('   - Ищите логи по контексту: error-handling-*, web-app, trainer-panel-app, etc.');
    console.log('\n🔍 Ожидаемые логи:');
    console.log('   - Web ошибки в /api/report');
    console.log('   - Worker ошибки в /api/push-logs');
    console.log('   - Telegram bot ошибки в /api/report');
    console.log('   - Error-dashboard ошибки НЕ отправляются в себя');
    console.log('   - ErrorReporter ошибки в соответствующие endpoint\'ы');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error);
    process.exit(1);
  }
}

// Запускаем тест
testErrorHandlingErrorDashboard().then(() => {
  console.log('\n✨ Тест завершен успешно!');
  process.exit(0);
}).catch((error) => {
  console.error('\n💥 Тест завершился с ошибкой:', error);
  process.exit(1);
});
