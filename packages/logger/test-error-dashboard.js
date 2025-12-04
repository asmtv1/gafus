#!/usr/bin/env node
/**
 * Тест отправки логов в error-dashboard
 * 
 * Запуск: node packages/logger/test-error-dashboard.js
 */

import { createWorkerLogger } from './dist/index.js';

async function testErrorDashboard() {
  console.log('🧪 Тестирование отправки логов в error-dashboard...\n');

  const logger = createWorkerLogger('test-suite');

  try {
    // Тест 1: Error уровень
    console.log('1️⃣ Тестируем error уровень...');
    await logger.error('Test error for dashboard integration', new Error('Test error message'), {
      testId: 'error-test-001',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
    console.log('✅ Error лог отправлен\n');

    // Тест 2: Warn уровень
    console.log('2️⃣ Тестируем warn уровень...');
    logger.warn('Test warning for dashboard integration', {
      testId: 'warn-test-002',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
    console.log('✅ Warn лог отправлен\n');

    // Тест 3: Fatal уровень
    console.log('3️⃣ Тестируем fatal уровень...');
    await logger.fatal('Test fatal error for dashboard integration', new Error('Test fatal error'), {
      testId: 'fatal-test-003',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
    console.log('✅ Fatal лог отправлен\n');

    // Тест 4: Info уровень (не должен отправляться)
    console.log('4️⃣ Тестируем info уровень (не должен отправляться)...');
    logger.info('Test info message (should not appear in dashboard)', {
      testId: 'info-test-004',
      timestamp: new Date().toISOString()
    });
    console.log('✅ Info лог отправлен (только в консоль)\n');

    console.log('🎉 Все тесты завершены!');
    console.log('\n📊 Проверьте error-dashboard:');
    console.log('   - Логи контейнеров: http://localhost:3001/container-logs');
    console.log('   - Errors: http://localhost:3001');
    console.log('\n🔍 Ищите логи по тегам: error-test-001, warn-test-002, fatal-test-003');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error);
    process.exit(1);
  }
}

// Запускаем тест
testErrorDashboard().then(() => {
  console.log('\n✨ Тест завершен успешно!');
  process.exit(0);
}).catch((error) => {
  console.error('\n💥 Тест завершился с ошибкой:', error);
  process.exit(1);
});
