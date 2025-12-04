#!/usr/bin/env node
/**
 * Тест отправки логов webpush в error-dashboard
 * 
 * Запуск: node packages/webpush/test-webpush-error-dashboard.js
 */

import { createWorkerLogger } from '@gafus/logger/dist/index.js';

async function testWebpushErrorDashboard() {
  console.log('🧪 Тестирование отправки логов webpush в error-dashboard...\n');

  // Создаем логгеры для разных компонентов webpush
  const serviceLogger = createWorkerLogger('webpush-service');
  const deviceLogger = createWorkerLogger('device-manager');

  try {
    // Тест 1: Service ошибка
    console.log('1️⃣ Тестируем webpush-service error...');
    await serviceLogger.error('Failed to send push notification', new Error('WebPush API error'), {
      endpoint: 'https://fcm.googleapis.com/fcm/send/...',
      userId: 'user-123',
      notificationId: 'notif-456',
      retryCount: 3
    });
    console.log('✅ Service error лог отправлен\n');

    // Тест 2: Device manager ошибка
    console.log('2️⃣ Тестируем device-manager error...');
    await deviceLogger.error('Failed to create device subscription', new Error('ServiceWorker not available'), {
      deviceId: 'device-789',
      deviceType: 'chrome',
      platform: 'android'
    });
    console.log('✅ Device manager error лог отправлен\n');

    // Тест 3: Service предупреждение
    console.log('3️⃣ Тестируем webpush-service warning...');
    serviceLogger.warn('Safari created FCM endpoint instead of APNS', {
      endpoint: 'https://fcm.googleapis.com/fcm/send/...',
      deviceType: 'safari',
      suggestion: 'Reload in PWA mode'
    });
    console.log('✅ Service warning лог отправлен\n');

    // Тест 4: Device manager предупреждение
    console.log('4️⃣ Тестируем device-manager warning...');
    deviceLogger.warn('Failed to save to localStorage', {
      operation: 'save',
      deviceCount: 5,
      error: 'QuotaExceededError'
    });
    console.log('✅ Device manager warning лог отправлен\n');

    // Тест 5: Service успешная операция
    console.log('5️⃣ Тестируем webpush-service success...');
    serviceLogger.success('Push notification sent successfully', {
      endpoint: 'https://fcm.googleapis.com/fcm/send/...',
      userId: 'user-123',
      notificationId: 'notif-456',
      duration: '150ms'
    });
    console.log('✅ Service success лог отправлен\n');

    // Тест 6: Device manager успешная операция
    console.log('6️⃣ Тестируем device-manager success...');
    deviceLogger.success('Device subscription created successfully', {
      deviceId: 'device-789',
      deviceType: 'chrome',
      platform: 'android',
      endpoint: 'https://fcm.googleapis.com/fcm/send/...'
    });
    console.log('✅ Device manager success лог отправлен\n');

    console.log('🎉 Все тесты завершены!');
    console.log('\n📊 Проверьте error-dashboard:');
    console.log('   - Логи контейнеров: http://localhost:3001/container-logs');
    console.log('   - Ищите логи по контексту: webpush-service, device-manager');
    console.log('\n🔍 Ожидаемые логи:');
    console.log('   - Service errors с endpoint и notificationId');
    console.log('   - Device manager errors с deviceId и deviceType');
    console.log('   - Warnings для Safari и localStorage');
    console.log('   - Success сообщения для операций');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error);
    process.exit(1);
  }
}

// Запускаем тест
testWebpushErrorDashboard().then(() => {
  console.log('\n✨ Тест завершен успешно!');
  process.exit(0);
}).catch((error) => {
  console.error('\n💥 Тест завершился с ошибкой:', error);
  process.exit(1);
});
