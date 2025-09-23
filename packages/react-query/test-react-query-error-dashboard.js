#!/usr/bin/env node
/**
 * Тест отправки логов react-query в error-dashboard
 * 
 * Запуск: node packages/react-query/test-react-query-error-dashboard.js
 */

import { createWebLogger } from '@gafus/logger/dist/index.js';

async function testReactQueryErrorDashboard() {
  console.log('🧪 Тестирование отправки логов react-query в error-dashboard...\n');

  try {
    // Тест 1: React Query Optimized логгер
    console.log('1️⃣ Тестируем react-query-optimized логгер...');
    const optimizedLogger = createWebLogger('react-query-optimized');
    
    // Тест Courses Data
    optimizedLogger.info('Courses loaded: courses-list', {
      dataType: 'courses',
      key: 'courses-list',
      hasData: true,
      strategy: 'courses'
    });
    console.log('✅ Courses data info лог отправлен\n');

    // Тест User Profile Data
    optimizedLogger.info('User profile loaded: user-123', {
      dataType: 'user-profile',
      key: 'user-123',
      hasData: true,
      strategy: 'user-profile'
    });
    console.log('✅ User profile data info лог отправлен\n');

    // Тест Statistics Data
    optimizedLogger.info('Statistics loaded: stats-dashboard', {
      dataType: 'statistics',
      key: 'stats-dashboard',
      hasData: true,
      strategy: 'statistics'
    });
    console.log('✅ Statistics data info лог отправлен\n');

    // Тест Search Data
    optimizedLogger.info('Search data loaded: search-results', {
      dataType: 'search',
      key: 'search-results',
      hasData: true,
      strategy: 'search'
    });
    console.log('✅ Search data info лог отправлен\n');

    // Тест Real-time Data
    optimizedLogger.info('Real-time data loaded: live-updates', {
      dataType: 'real-time',
      key: 'live-updates',
      hasData: true,
      strategy: 'real-time'
    });
    console.log('✅ Real-time data info лог отправлен\n');

    // Тест Optimized Data
    optimizedLogger.info('Data loaded with courses strategy: optimized-courses', {
      dataType: 'optimized',
      key: 'optimized-courses',
      hasData: true,
      strategy: 'courses'
    });
    console.log('✅ Optimized data info лог отправлен\n');

    // Тест 2: React Query Error (если есть)
    console.log('2️⃣ Тестируем React Query Error...');
    await optimizedLogger.error('React Query fetch failed', new Error('Network timeout'), {
      queryKey: 'courses-list',
      dataType: 'courses',
      strategy: 'courses',
      retryCount: 3
    });
    console.log('✅ React Query error лог отправлен\n');

    // Тест 3: Cache Miss Warning
    console.log('3️⃣ Тестируем Cache Miss Warning...');
    optimizedLogger.warn('Cache miss for query', {
      queryKey: 'user-profile-456',
      dataType: 'user-profile',
      strategy: 'user-profile',
      cacheAge: 0
    });
    console.log('✅ Cache miss warning лог отправлен\n');

    // Тест 4: Query Success
    console.log('4️⃣ Тестируем Query Success...');
    optimizedLogger.success('Query completed successfully', {
      queryKey: 'statistics-summary',
      dataType: 'statistics',
      strategy: 'statistics',
      duration: '150ms',
      dataSize: '2.5KB'
    });
    console.log('✅ Query success лог отправлен\n');

    // Тест 5: Stale Data Warning
    console.log('5️⃣ Тестируем Stale Data Warning...');
    optimizedLogger.warn('Stale data detected', {
      queryKey: 'search-results',
      dataType: 'search',
      strategy: 'search',
      staleTime: 1000,
      lastUpdated: Date.now() - 5000
    });
    console.log('✅ Stale data warning лог отправлен\n');

    console.log('🎉 Все тесты завершены!');
    console.log('\n📊 Проверьте error-dashboard:');
    console.log('   - Reports: http://localhost:3001/reports');
    console.log('   - Ищите логи по контексту: react-query-optimized');
    console.log('\n🔍 Ожидаемые логи:');
    console.log('   - Courses loaded info сообщения');
    console.log('   - User profile loaded info сообщения');
    console.log('   - Statistics loaded info сообщения');
    console.log('   - Search data loaded info сообщения');
    console.log('   - Real-time data loaded info сообщения');
    console.log('   - Data loaded with strategy info сообщения');
    console.log('   - React Query fetch failed error сообщения');
    console.log('   - Cache miss warning сообщения (только в production)');
    console.log('   - Query completed successfully success сообщения');
    console.log('   - Stale data detected warning сообщения (только в production)');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error);
    process.exit(1);
  }
}

// Запускаем тест
testReactQueryErrorDashboard().then(() => {
  console.log('\n✨ Тест завершен успешно!');
  process.exit(0);
}).catch((error) => {
  console.error('\n💥 Тест завершился с ошибкой:', error);
  process.exit(1);
});
