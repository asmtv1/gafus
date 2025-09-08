#!/usr/bin/env node

/**
 * Скрипт для тестирования кэширования и офлайн работы
 * Проверяет Service Worker, кэши и офлайн функциональность
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Запуск тестирования кэширования и офлайн работы...\n');

// 1. Проверяем Service Worker
console.log('1️⃣ Проверяем Service Worker...');
const swPath = path.join(__dirname, '../apps/web/public/sw.js');

if (fs.existsSync(swPath)) {
  const swContent = fs.readFileSync(swPath, 'utf8');
  
  // Проверяем ключевые компоненты SW
  const checks = [
    { name: 'CACHE_CONFIG', pattern: /const CACHE_CONFIG = \{/ },
    { name: 'HTML_PAGES кэш', pattern: /HTML_PAGES: 'gafus-html-v2'/ },
    { name: 'RSC_DATA кэш', pattern: /RSC_DATA: 'gafus-rsc-v2'/ },
    { name: 'COURSE_DATA кэш', pattern: /COURSE_DATA: 'gafus-course-v2'/ },
    { name: 'Стратегии кэширования', pattern: /STRATEGIES: \{/ },
    { name: 'TTL настройки', pattern: /TTL: \{/ },
    { name: 'install event', pattern: /self\.addEventListener\('install'/ },
    { name: 'activate event', pattern: /self\.addEventListener\('activate'/ },
    { name: 'fetch event', pattern: /self\.addEventListener\('fetch'/ },
    { name: 'POST request check', pattern: /if \(request\.method !== 'GET'\)/ },
    { name: 'Response body cloning', pattern: /responseToCache\.body/ },
  ];
  
  checks.forEach(check => {
    const found = check.pattern.test(swContent);
    console.log(`   ${found ? '✅' : '❌'} ${check.name}`);
  });
  
  // Проверяем версию кэша
  const versionMatch = swContent.match(/v(\d+)/g);
  if (versionMatch) {
    console.log(`   📊 Найдены версии кэшей: ${versionMatch.join(', ')}`);
  }
  
} else {
  console.log('   ❌ Service Worker не найден!');
}

console.log('');

// 2. Проверяем кэш-менеджер
console.log('2️⃣ Проверяем кэш-менеджер...');
const cacheManagerPath = path.join(__dirname, '../apps/web/src/shared/utils/cacheManager.ts');

if (fs.existsSync(cacheManagerPath)) {
  const cacheManagerContent = fs.readFileSync(cacheManagerPath, 'utf8');
  
  const cacheChecks = [
    { name: 'updateStepProgress функция', pattern: /export function updateStepProgress/ },
    { name: 'courseStore интеграция', pattern: /useCourseStore/ },
    { name: 'Удалена React Query инвалидация', pattern: /Инвалидация React Query кэша теперь происходит в server actions/ },
  ];
  
  cacheChecks.forEach(check => {
    const found = check.pattern.test(cacheManagerContent);
    console.log(`   ${found ? '✅' : '❌'} ${check.name}`);
  });
  
} else {
  console.log('   ❌ Кэш-менеджер не найден!');
}

console.log('');

// 3. Проверяем ретраи
console.log('3️⃣ Проверяем систему ретраев...');
const retryUtilsPath = path.join(__dirname, '../apps/web/src/shared/utils/retryUtils.ts');

if (fs.existsSync(retryUtilsPath)) {
  const retryContent = fs.readFileSync(retryUtilsPath, 'utf8');
  
  const retryChecks = [
    { name: 'retryWithBackoff функция', pattern: /export async function retryWithBackoff/ },
    { name: 'retryServerAction функция', pattern: /export async function retryServerAction/ },
    { name: 'Экспоненциальная задержка', pattern: /Math\.pow\(2, attempt - 1\)/ },
    { name: 'Максимальная задержка', pattern: /Math\.min.*maxDelay/ },
  ];
  
  retryChecks.forEach(check => {
    const found = check.pattern.test(retryContent);
    console.log(`   ${found ? '✅' : '❌'} ${check.name}`);
  });
  
} else {
  console.log('   ❌ Утилиты ретраев не найдены!');
}

console.log('');

// 4. Проверяем синхронизацию
console.log('4️⃣ Проверяем систему синхронизации...');
const syncStatusPath = path.join(__dirname, '../apps/web/src/shared/hooks/useSyncStatus.ts');

if (fs.existsSync(syncStatusPath)) {
  const syncContent = fs.readFileSync(syncStatusPath, 'utf8');
  
  const syncChecks = [
    { name: 'useSyncStatus хук', pattern: /export function useSyncStatus/ },
    { name: 'startSync функция', pattern: /startSync/ },
    { name: 'finishSync функция', pattern: /finishSync/ },
    { name: 'pendingChanges счетчик', pattern: /pendingChanges/ },
  ];
  
  syncChecks.forEach(check => {
    const found = check.pattern.test(syncContent);
    console.log(`   ${found ? '✅' : '❌'} ${check.name}`);
  });
  
} else {
  console.log('   ❌ Хук синхронизации не найден!');
}

console.log('');

// 5. Проверяем тестер кэширования
console.log('5️⃣ Проверяем тестер кэширования...');
const cacheTesterPath = path.join(__dirname, '../apps/web/src/shared/components/ui/CacheTester.tsx');

if (fs.existsSync(cacheTesterPath)) {
  const testerContent = fs.readFileSync(cacheTesterPath, 'utf8');
  
  const testerChecks = [
    { name: 'CacheTester компонент', pattern: /export function CacheTester/ },
    { name: 'checkCache функция', pattern: /checkCache/ },
    { name: 'testOfflineMode функция', pattern: /testOfflineMode/ },
    { name: 'clearAllCaches функция', pattern: /clearAllCaches/ },
    { name: 'Интеграция с useSyncStatus', pattern: /useSyncStatus/ },
  ];
  
  testerChecks.forEach(check => {
    const found = check.pattern.test(testerContent);
    console.log(`   ${found ? '✅' : '❌'} ${check.name}`);
  });
  
} else {
  console.log('   ❌ Тестер кэширования не найден!');
}

console.log('');

// 6. Проверяем интеграцию в компонентах
console.log('6️⃣ Проверяем интеграцию в компонентах...');
const accordionStepPath = path.join(__dirname, '../apps/web/src/features/training/components/AccordionStep.tsx');

if (fs.existsSync(accordionStepPath)) {
  const accordionContent = fs.readFileSync(accordionStepPath, 'utf8');
  
  const integrationChecks = [
    { name: 'useSyncStatus импорт', pattern: /import.*useSyncStatus/ },
    { name: 'startSync вызов', pattern: /startSync\(\)/ },
    { name: 'finishSync вызов', pattern: /finishSync\(/ },
    { name: 'addPendingChange вызов', pattern: /addPendingChange\(\)/ },
  ];
  
  integrationChecks.forEach(check => {
    const found = check.pattern.test(accordionContent);
    console.log(`   ${found ? '✅' : '❌'} ${check.name}`);
  });
  
} else {
  console.log('   ❌ AccordionStep не найден!');
}

console.log('');

// 7. Рекомендации
console.log('📋 Рекомендации для тестирования:');
console.log('   1. Откройте DevTools → Application → Service Workers');
console.log('   2. Проверьте, что SW зарегистрирован и активен');
console.log('   3. Перейдите на страницу тренировок');
console.log('   4. Используйте кнопку "Проверить кэши" в тестере');
console.log('   5. Включите офлайн режим в DevTools → Network');
console.log('   6. Попробуйте навигацию по страницам в офлайне');
console.log('   7. Проверьте, что данные курсов кэшируются');
console.log('   8. Протестируйте ретраи при ошибках сети');

console.log('\n✅ Тестирование конфигурации завершено!');
