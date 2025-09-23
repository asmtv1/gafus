#!/usr/bin/env node
/**
 * Тест отправки логов telegram-bot в error-dashboard
 * 
 * Запуск: node apps/telegram-bot/test-telegram-bot-error-dashboard.js
 */

import { createTelegramBotLogger } from '@gafus/logger/dist/index.js';

async function testTelegramBotErrorDashboard() {
  console.log('🧪 Тестирование отправки логов telegram-bot в error-dashboard...\n');

  try {
    // Тест 1: Telegram Bot логгер
    console.log('1️⃣ Тестируем telegram-bot логгер...');
    const botLogger = createTelegramBotLogger('telegram-bot');
    
    // Тест инициализации бота
    botLogger.info('Telegram bot initializing', {
      environment: 'production',
      hasToken: true,
      tokenLength: 45
    });
    console.log('✅ Bot initialization info лог отправлен\n');

    // Тест успешного запуска бота
    botLogger.success('Telegram bot launched successfully', {
      environment: 'production',
      botUsername: 'gafus_bot'
    });
    console.log('✅ Bot launch success лог отправлен\n');

    // Тест 2: Bot Error
    console.log('2️⃣ Тестируем Bot Error...');
    await botLogger.error('Bot error', new Error('Webhook validation failed'), {
      chatId: 123456789,
      userId: 987654321,
      username: 'testuser',
      messageType: 'text',
      updateId: 12345
    });
    console.log('✅ Bot error лог отправлен\n');

    // Тест 3: User Not Found Warning
    console.log('3️⃣ Тестируем User Not Found Warning...');
    botLogger.warn('Пользователь с номером не найден в базе данных', {
      chatId: 123456789,
      phone: '+79198031371',
      operation: 'find_user_by_phone'
    });
    console.log('✅ User not found warning лог отправлен\n');

    // Тест 4: User Confirmation Success
    console.log('4️⃣ Тестируем User Confirmation Success...');
    botLogger.success('Пользователь успешно подтвержден через Telegram', {
      chatId: 123456789,
      phone: '+79198031371',
      userId: 'user-123',
      username: 'testuser',
      operation: 'confirm_user_telegram'
    });
    console.log('✅ User confirmation success лог отправлен\n');

    // Тест 5: Database Update Error
    console.log('5️⃣ Тестируем Database Update Error...');
    await botLogger.error('Ошибка при обновлении пользователя', new Error('Database connection timeout'), {
      chatId: 123456789,
      phone: '+79198031371',
      hasUser: true,
      operation: 'update_user_telegram_id'
    });
    console.log('✅ Database update error лог отправлен\n');

    // Тест 6: Bot Launch Failure
    console.log('6️⃣ Тестируем Bot Launch Failure...');
    await botLogger.fatal('Failed to launch Telegram bot', new Error('Invalid bot token'), {
      environment: 'production',
      hasToken: false
    });
    console.log('✅ Bot launch failure лог отправлен\n');

    // Тест 7: Missing Token Fatal
    console.log('7️⃣ Тестируем Missing Token Fatal...');
    await botLogger.fatal('TELEGRAM_BOT_TOKEN не задан в переменных окружения', new Error('Missing Telegram Bot Token'), {
      environment: 'production',
      hasToken: false
    });
    console.log('✅ Missing token fatal лог отправлен\n');

    // Тест 8: Graceful Shutdown Info
    console.log('8️⃣ Тестируем Graceful Shutdown Info...');
    botLogger.info('Received SIGINT, stopping bot gracefully');
    console.log('✅ Graceful shutdown info лог отправлен\n');

    // Тест 9: Message Processing Error
    console.log('9️⃣ Тестируем Message Processing Error...');
    await botLogger.error('Message processing failed', new Error('Invalid message format'), {
      chatId: 123456789,
      userId: 987654321,
      messageType: 'unknown',
      updateId: 12346
    });
    console.log('✅ Message processing error лог отправлен\n');

    // Тест 10: Webhook Error
    console.log('🔟 Тестируем Webhook Error...');
    await botLogger.error('Webhook validation failed', new Error('Invalid webhook signature'), {
      chatId: 123456789,
      userId: 987654321,
      messageType: 'webhook',
      updateId: 12347
    });
    console.log('✅ Webhook error лог отправлен\n');

    // Тест 11: Rate Limit Warning
    console.log('1️⃣1️⃣ Тестируем Rate Limit Warning...');
    botLogger.warn('Rate limit exceeded for user', {
      chatId: 123456789,
      userId: 987654321,
      username: 'testuser',
      operation: 'send_message',
      retryAfter: 60
    });
    console.log('✅ Rate limit warning лог отправлен\n');

    // Тест 12: Contact Processing Success
    console.log('1️⃣2️⃣ Тестируем Contact Processing Success...');
    botLogger.success('Contact processed successfully', {
      chatId: 123456789,
      phone: '+79198031371',
      userId: 'user-123',
      username: 'testuser',
      operation: 'process_contact'
    });
    console.log('✅ Contact processing success лог отправлен\n');

    // Тест 13: Database Connection Error
    console.log('1️⃣3️⃣ Тестируем Database Connection Error...');
    await botLogger.error('Database connection failed', new Error('Connection pool exhausted'), {
      chatId: 123456789,
      phone: '+79198031371',
      operation: 'find_user_by_phone',
      retryCount: 3
    });
    console.log('✅ Database connection error лог отправлен\n');

    // Тест 14: Bot Info Update
    console.log('1️⃣4️⃣ Тестируем Bot Info Update...');
    botLogger.info('Bot info updated successfully', {
      botUsername: 'gafus_bot',
      botId: 123456789,
      environment: 'production'
    });
    console.log('✅ Bot info update лог отправлен\n');

    // Тест 15: Message Sent Success
    console.log('1️⃣5️⃣ Тестируем Message Sent Success...');
    botLogger.success('Message sent successfully', {
      chatId: 123456789,
      userId: 987654321,
      messageType: 'confirmation',
      operation: 'send_confirmation_message'
    });
    console.log('✅ Message sent success лог отправлен\n');

    console.log('🎉 Все тесты завершены!');
    console.log('\n📊 Проверьте error-dashboard:');
    console.log('   - Reports: http://localhost:3001/reports');
    console.log('   - Ищите логи по контексту: telegram-bot');
    console.log('\n🔍 Ожидаемые логи:');
    console.log('   - Bot initialization info сообщения');
    console.log('   - Bot launch success сообщения');
    console.log('   - Bot error сообщения');
    console.log('   - User not found warning сообщения');
    console.log('   - User confirmation success сообщения');
    console.log('   - Database update error сообщения');
    console.log('   - Bot launch failure fatal сообщения');
    console.log('   - Missing token fatal сообщения');
    console.log('   - Graceful shutdown info сообщения');
    console.log('   - Message processing error сообщения');
    console.log('   - Webhook error сообщения');
    console.log('   - Rate limit warning сообщения (только в production)');
    console.log('   - Contact processing success сообщения');
    console.log('   - Database connection error сообщения');
    console.log('   - Bot info update сообщения');
    console.log('   - Message sent success сообщения');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error);
    process.exit(1);
  }
}

// Запускаем тест
testTelegramBotErrorDashboard().then(() => {
  console.log('\n✨ Тест завершен успешно!');
  process.exit(0);
}).catch((error) => {
  console.error('\n💥 Тест завершился с ошибкой:', error);
  process.exit(1);
});
