#!/usr/bin/env node
/**
 * Скрипт для очистки всех логов из Loki
 * 
 * Использование:
 *   node scripts/clean-loki.js --force
 * 
 * Без флага --force требует подтверждения пользователя
 */

import readline from 'readline';

const LOKI_URL = process.env.LOKI_URL || 'http://localhost:3100';

/**
 * Удаляет все логи из Loki
 */
async function deleteAllLogs() {
  try {
    // Формируем запрос для удаления всех логов
    const query = '{app=~".+"}'; // Все приложения
    const now = Date.now();
    // Увеличиваем диапазон до 365 дней в прошлое, чтобы захватить все логи
    const startTime = now - (365 * 24 * 60 * 60 * 1000); // Последние 365 дней
    const endTime = now - 1000; // -1 секунда от текущего времени (Loki не позволяет удалять в будущем)
    
    const startSeconds = Math.floor(startTime / 1000);
    const endSeconds = Math.ceil(endTime / 1000);
    
    const url = `${LOKI_URL}/loki/api/v1/delete?query=${encodeURIComponent(query)}&start=${startSeconds}&end=${endSeconds}`;
    
    console.log('Параметры удаления:');
    console.log(`  Query: ${query}`);
    console.log(`  Time range: ${new Date(startTime).toISOString()} - ${new Date(endTime).toISOString()}`);
    console.log(`  Start (seconds): ${startSeconds}`);
    console.log(`  End (seconds): ${endSeconds}`);
    console.log(`  Loki URL: ${LOKI_URL}`);
    console.log();
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const responseText = await response.text().catch(() => '');
    
    if (response.status === 204 || response.ok) {
      console.log('✅ Запрос на удаление принят Loki');
      if (responseText) {
        console.log(`   Response: ${responseText}`);
      }
      return { success: true };
    }
    
    console.error(`❌ Ошибка при удалении логов: ${response.status} ${response.statusText}`);
    if (responseText) {
      console.error(`   Response: ${responseText}`);
    }
    return { success: false, error: responseText || response.statusText };
    
  } catch (error) {
    console.error('❌ Исключение при удалении логов:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Запрашивает подтверждение у пользователя
 */
function askForConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'да');
    });
  });
}

/**
 * Проверяет доступность Loki
 */
async function checkLokiAvailability() {
  try {
    const response = await fetch(`${LOKI_URL}/ready`);
    if (response.ok) {
      console.log('✅ Loki доступен');
      return true;
    }
    console.error('❌ Loki недоступен:', response.status);
    return false;
  } catch (error) {
    console.error('❌ Не удалось подключиться к Loki:', error.message);
    return false;
  }
}

/**
 * Получает статистику логов в Loki
 */
async function getLogsStats() {
  try {
    const query = '{app=~".+"}';
    const endTime = Date.now();
    const startTime = endTime - (30 * 24 * 60 * 60 * 1000);
    
    const startNs = startTime * 1000000;
    const endNs = endTime * 1000000;
    
    const url = `${LOKI_URL}/loki/api/v1/query_range?query=${encodeURIComponent(query)}&limit=1000&start=${startNs}&end=${endNs}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    const streams = data.data?.result || [];
    const totalEntries = streams.reduce((sum, stream) => sum + (stream.values?.length || 0), 0);
    
    return {
      streams: streams.length,
      totalEntries,
    };
  } catch (error) {
    console.error('Ошибка получения статистики:', error.message);
    return null;
  }
}

async function main() {
  console.log('🧹 Скрипт очистки всех логов из Loki\n');
  
  // Проверяем флаг --force
  const forceMode = process.argv.includes('--force');
  
  // Проверяем доступность Loki
  console.log('Проверка доступности Loki...');
  const isAvailable = await checkLokiAvailability();
  
  if (!isAvailable) {
    console.error('\n❌ Loki недоступен. Убедитесь, что Loki запущен.');
    console.error('   Для локальной разработки: LOKI_URL=http://localhost:3100');
    console.error('   Проверка: curl http://localhost:3100/ready');
    process.exit(1);
  }
  
  // Получаем статистику перед удалением
  console.log('\nПолучение статистики логов...');
  const stats = await getLogsStats();
  
  if (stats) {
    console.log(`📊 Текущая статистика:`);
    console.log(`   Streams: ${stats.streams}`);
    console.log(`   Total entries: ${stats.totalEntries}`);
    console.log();
  }
  
  // Запрашиваем подтверждение, если не force режим
  if (!forceMode) {
    console.log('⚠️  ВНИМАНИЕ: Это действие удалит ВСЕ логи из Loki.');
    console.log('   Это необратимая операция!');
    console.log();
    
    const confirmed = await askForConfirmation('Вы уверены, что хотите продолжить? (y/n): ');
    
    if (!confirmed) {
      console.log('❌ Операция отменена пользователем');
      process.exit(0);
    }
  }
  
  console.log('\n🚀 Начинаем удаление всех логов...\n');
  
  // Выполняем удаление несколько раз для надежности
  let attempts = 3;
  let lastResult = null;
  
  for (let i = 1; i <= attempts; i++) {
    console.log(`Попытка ${i}/${attempts}...`);
    lastResult = await deleteAllLogs();
  
    if (lastResult.success) {
      console.log(`✅ Попытка ${i} успешна`);
    } else {
      console.log(`⚠️  Попытка ${i} завершилась с ошибкой: ${lastResult.error}`);
    }
    
    // Ждём между попытками
    if (i < attempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  if (lastResult.success) {
    console.log('\n✨ Операция завершена успешно!');
    
    // Проверяем статистику после удаления (несколько раз с задержкой)
    console.log('\nПроверка после удаления...');
    for (let i = 1; i <= 3; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Ждём 2 секунды
      console.log(`Проверка ${i}/3...`);
    const statsAfter = await getLogsStats();
    if (statsAfter) {
        console.log(`📊 Статистика после удаления (проверка ${i}):`);
      console.log(`   Streams: ${statsAfter.streams}`);
      console.log(`   Total entries: ${statsAfter.totalEntries}`);
        
        if (statsAfter.totalEntries === 0 && statsAfter.streams === 0) {
          console.log('✅ Все логи успешно удалены!');
          break;
        }
      }
    }
    
    process.exit(0);
  } else {
    console.log('\n❌ Операция завершилась с ошибкой');
    console.log(`   Последняя ошибка: ${lastResult.error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('💥 Критическая ошибка:', error);
  process.exit(1);
});

