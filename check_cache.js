// Проверка кэша Service Worker
console.log('🔍 ПРОВЕРКА КЭША SERVICE WORKER');
console.log('================================');

// Проверяем доступность caches API
if ('caches' in window) {
  console.log('✅ Caches API доступен');
  
  // Получаем список всех кэшей
  caches.keys().then(cacheNames => {
    console.log('📦 Доступные кэши:', cacheNames);
    
    // Проверяем каждый кэш
    return Promise.all(cacheNames.map(async cacheName => {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      console.log(`\n🗂️ Кэш "${cacheName}":`);
      console.log(`   - Записей: ${keys.length}`);
      
      // Показываем первые 5 записей
      const sampleKeys = keys.slice(0, 5);
      for (const key of sampleKeys) {
        console.log(`   - ${key.url}`);
      }
      
      if (keys.length > 5) {
        console.log(`   - ... и еще ${keys.length - 5} записей`);
      }
      
      return { cacheName, count: keys.length };
    }));
  }).then(results => {
    console.log('\n📊 Сводка кэшей:');
    results.forEach(({ cacheName, count }) => {
      console.log(`   ${cacheName}: ${count} записей`);
    });
  }).catch(error => {
    console.error('❌ Ошибка при проверке кэшей:', error);
  });
} else {
  console.log('❌ Caches API недоступен');
}

// Проверяем Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(registration => {
    console.log('\n🔧 SERVICE WORKER:');
    console.log(`   - Активен: ${registration.active ? 'Да' : 'Нет'}`);
    console.log(`   - Ожидает: ${registration.waiting ? 'Да' : 'Нет'}`);
    console.log(`   - Устанавливается: ${registration.installing ? 'Да' : 'Нет'}`);
    
    if (registration.active) {
      console.log(`   - Скрипт: ${registration.active.scriptURL}`);
    }
  }).catch(error => {
    console.error('❌ Ошибка при проверке SW:', error);
  });
} else {
  console.log('❌ Service Worker API недоступен');
}
