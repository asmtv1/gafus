#!/usr/bin/env node

/**
 * Скрипт для тестирования логики Service Worker в офлайн режиме
 * Проверяет, что Service Worker правильно обрабатывает навигационные запросы
 */

const http = require('http');

const PORT = 3002;
const TEST_URL = `http://localhost:${PORT}`;

console.log('🧪 Тестирование Service Worker офлайн-логики\n');

// Функция для проверки ответа
function testResponse(path, description) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, TEST_URL);
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Test Script)',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`\n📋 ${description}`);
        console.log(`   URL: ${path}`);
        console.log(`   Status: ${res.statusCode} ${res.statusMessage}`);
        console.log(`   Headers:`, res.headers);
        console.log(`   Content-Type: ${res.headers['content-type']}`);
        console.log(`   Content-Length: ${data.length} bytes`);
        
        // Проверяем содержимое
        if (data.includes('window.location.replace')) {
          console.log('   ✅ Содержит JavaScript редирект');
        }
        if (data.includes('/~offline')) {
          console.log('   ✅ Содержит ссылку на страницу офлайна');
        }
        if (data.includes('Нет соединения')) {
          console.log('   ✅ Содержит текст офлайн-страницы');
        }
        
        // Показываем первые 500 символов ответа
        const preview = data.substring(0, 500);
        console.log(`   Preview (first 500 chars):`);
        console.log(`   ${preview.replace(/\n/g, '\\n').substring(0, 200)}...`);
        
        resolve({ status: res.statusCode, data, headers: res.headers });
      });
    });

    req.on('error', (error) => {
      console.error(`   ❌ Ошибка: ${error.message}`);
      reject(error);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    req.end();
  });
}

// Основная функция тестирования
async function runTests() {
  try {
    console.log('1️⃣ Тестирование обычной страницы (должна загрузиться)');
    await testResponse('/', 'Главная страница');
    
    console.log('\n2️⃣ Тестирование страницы офлайна (должна загрузиться)');
    await testResponse('/~offline', 'Страница офлайна');
    
    console.log('\n3️⃣ Тестирование API ping (должен работать)');
    await testResponse('/api/ping', 'API Ping');
    
    console.log('\n✅ Все тесты завершены');
    console.log('\n💡 Примечание: Этот скрипт тестирует только онлайн-режим.');
    console.log('   Для полного тестирования офлайн-режима нужно:');
    console.log('   1. Открыть http://localhost:3002 в браузере');
    console.log('   2. Открыть DevTools → Network → включить "Offline"');
    console.log('   3. Обновить страницу');
    console.log('   4. Проверить в DevTools → Network что возвращается');
    
  } catch (error) {
    console.error('\n❌ Ошибка при тестировании:', error.message);
    process.exit(1);
  }
}

// Запускаем тесты
runTests();
