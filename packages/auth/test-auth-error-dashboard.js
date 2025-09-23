#!/usr/bin/env node
/**
 * Тест отправки логов auth в error-dashboard
 * 
 * Запуск: node packages/auth/test-auth-error-dashboard.js
 */

import { createWebLogger } from '@gafus/logger/dist/index.js';

async function testAuthErrorDashboard() {
  console.log('🧪 Тестирование отправки логов auth в error-dashboard...\n');

  try {
    // Тест 1: Auth Telegram логгер
    console.log('1️⃣ Тестируем auth-telegram логгер...');
    const telegramLogger = createWebLogger('auth-telegram');
    await telegramLogger.error('Telegram ID не найден для пользователя', new Error('User not found'), {
      username: 'testuser',
      hasUser: false,
      hasTelegramId: false
    });
    console.log('✅ Auth Telegram error лог отправлен\n');

    // Тест 2: Auth Owner Check логгер
    console.log('2️⃣ Тестируем auth-owner-check логгер...');
    const ownerLogger = createWebLogger('auth-owner-check');
    await ownerLogger.error('Error in getIsOwner', new Error('Session validation failed'), {
      profileUsername: 'testuser',
      hasReq: true,
      hasQueryUsername: false
    });
    console.log('✅ Auth Owner Check error лог отправлен\n');

    // Тест 3: Telegram Bot Token Error
    console.log('3️⃣ Тестируем Telegram Bot Token Error...');
    await telegramLogger.error('TELEGRAM_BOT_TOKEN не задан', new Error('Missing bot token'), {
      hasBotToken: false,
      environment: 'production'
    });
    console.log('✅ Telegram Bot Token error лог отправлен\n');

    // Тест 4: Telegram API Error
    console.log('4️⃣ Тестируем Telegram API Error...');
    await telegramLogger.error('Не удалось отправить сообщение в Telegram', new Error('HTTP 400: Bad Request'), {
      status: 400,
      statusText: 'Bad Request',
      responseBody: '{"error_code":400,"description":"Bad Request: chat not found"}',
      username: 'testuser',
      telegramId: '123456789'
    });
    console.log('✅ Telegram API error лог отправлен\n');

    // Тест 5: Повторный запрос Warning
    console.log('5️⃣ Тестируем повторный запрос warning...');
    telegramLogger.warn('Повторный запрос слишком рано', {
      username: 'testuser',
      timeSinceLastRequest: 30000,
      minInterval: 60000
    });
    console.log('✅ Повторный запрос warning лог отправлен\n');

    // Тест 6: Session Error
    console.log('6️⃣ Тестируем Session Error...');
    await ownerLogger.error('Session validation failed', new Error('Invalid session token'), {
      profileUsername: 'testuser',
      hasReq: false,
      hasQueryUsername: false
    });
    console.log('✅ Session error лог отправлен\n');

    // Тест 7: Auth Success (если есть)
    console.log('7️⃣ Тестируем Auth Success...');
    telegramLogger.success('Password reset request sent successfully', {
      username: 'testuser',
      telegramId: '123456789',
      tokenGenerated: true
    });
    console.log('✅ Auth Success лог отправлен\n');

    // Тест 8: Owner Check Success
    console.log('8️⃣ Тестируем Owner Check Success...');
    ownerLogger.success('User is owner of profile', {
      profileUsername: 'testuser',
      currentUsername: 'testuser',
      isOwner: true
    });
    console.log('✅ Owner Check Success лог отправлен\n');

    console.log('🎉 Все тесты завершены!');
    console.log('\n📊 Проверьте error-dashboard:');
    console.log('   - Reports: http://localhost:3001/reports');
    console.log('   - Ищите логи по контексту: auth-telegram, auth-owner-check');
    console.log('\n🔍 Ожидаемые логи:');
    console.log('   - Telegram ID не найден для пользователя');
    console.log('   - TELEGRAM_BOT_TOKEN не задан');
    console.log('   - Не удалось отправить сообщение в Telegram');
    console.log('   - Error in getIsOwner');
    console.log('   - Повторный запрос слишком рано (только в production)');
    console.log('   - Success сообщения для успешных операций');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error);
    process.exit(1);
  }
}

// Запускаем тест
testAuthErrorDashboard().then(() => {
  console.log('\n✨ Тест завершен успешно!');
  process.exit(0);
}).catch((error) => {
  console.error('\n💥 Тест завершился с ошибкой:', error);
  process.exit(1);
});
