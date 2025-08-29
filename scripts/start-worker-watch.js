#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Запускаю worker в watch mode...');
console.log('📁 Отслеживаю изменения в:', path.resolve('packages/worker/dist'));

// Запускаем nodemon для worker'а
const workerProcess = spawn('npx', [
  'nodemon',
  'packages/worker/dist/worker/src/start-worker.js',
  '--watch', 'packages/worker/dist',
  '--ext', 'js',
  '--ignore', 'packages/worker/dist/**/*.map',
  '--delay', '1000',
  '--verbose'
], {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd()
});

// Обработка завершения процесса
workerProcess.on('close', (code) => {
  console.log(`\n🔄 Worker завершен с кодом: ${code}`);
  if (code !== 0) {
    console.log('⚠️  Worker завершился с ошибкой, перезапускаю через 3 секунды...');
    setTimeout(() => {
      console.log('🔄 Перезапускаю worker...');
      // Рекурсивно перезапускаем
      require('./start-worker-watch.js');
    }, 3000);
  }
});

// Обработка сигналов
process.on('SIGINT', () => {
  console.log('\n🛑 Получен SIGINT, останавливаю worker...');
  workerProcess.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Получен SIGTERM, останавливаю worker...');
  workerProcess.kill('SIGTERM');
  process.exit(0);
});

console.log('✅ Worker запущен в watch mode');
console.log('💡 Для остановки нажмите Ctrl+C');

