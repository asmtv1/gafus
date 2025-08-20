#!/usr/bin/env node

const { execSync } = require("child_process");

// Конфигурация портов для каждого приложения
const appPorts = {
  "@gafus/web": 3002,
  "@gafus/trainer-panel": 3001,
  "@gafus/error-dashboard": 3005,
  "@gafus/telegram-bot": 3003,
  "@gafus/bull-board": 3004,

  "@gafus/webpush": 3007,
};

console.log("🔍 Проверка конфигурации портов...\n");

// Проверяем, что порты не конфликтуют
const usedPorts = new Set();
const conflicts = [];

Object.entries(appPorts).forEach(([app, port]) => {
  if (usedPorts.has(port)) {
    conflicts.push({ app, port });
  } else {
    usedPorts.add(port);
  }
});

if (conflicts.length > 0) {
  console.log("❌ Обнаружены конфликты портов:");
  conflicts.forEach(({ app, port }) => {
    console.log(`  ${app}: порт ${port} уже используется`);
  });
  process.exit(1);
}

console.log("✅ Все порты уникальны:");
Object.entries(appPorts).forEach(([app, port]) => {
  console.log(`  ${app}: http://localhost:${port}`);
});

console.log("\n📋 Инструкции по запуску:");
console.log("1. Убедитесь, что все зависимости установлены: pnpm install");
console.log("2. Соберите все приложения: pnpm build:all");
console.log("3. Запустите все приложения: pnpm start:all");
console.log("4. Или запустите только основные: pnpm start");

console.log("\n🌐 Доступные приложения после запуска:");
console.log("  Web App: http://localhost:3002");
console.log("  Trainer Panel: http://localhost:3001");
console.log("  Error Dashboard: http://localhost:3005");
console.log("  Bull Board: http://localhost:3004");
console.log("  Telegram Bot: работает на порту 3003");

console.log("  WebPush: работает на порту 3007");
