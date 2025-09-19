#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// Список приложений для проверки
const appsToCheck = [
  { name: "@gafus/web", path: "apps/web/.next", type: "next" },
  { name: "@gafus/trainer-panel", path: "apps/trainer-panel/.next", type: "next" },
  { name: "@gafus/error-dashboard", path: "apps/error-dashboard/.next", type: "next" },
  { name: "@gafus/telegram-bot", path: "apps/telegram-bot/dist", type: "dist" },
  { name: "@gafus/bull-board", path: "apps/bull-board/dist", type: "dist" },

  { name: "@gafus/webpush", path: "packages/webpush/dist", type: "dist" },
];

console.log("🔍 Проверка сборки приложений...\n");

let allBuilt = true;
const results = [];

appsToCheck.forEach((app) => {
  const fullPath = path.join(process.cwd(), app.path);
  const exists = fs.existsSync(fullPath);

  if (exists) {
    const stats = fs.statSync(fullPath);
    const size = stats.isDirectory() ? fs.readdirSync(fullPath).length : stats.size;

    results.push({
      name: app.name,
      status: "✅",
      path: app.path,
      size: size,
      type: app.type,
    });
  } else {
    results.push({
      name: app.name,
      status: "❌",
      path: app.path,
      size: 0,
      type: app.type,
    });
    allBuilt = false;
  }
});

// Выводим результаты
results.forEach((result) => {
  const sizeInfo = result.type === "next" ? `${result.size} файлов` : `${result.size} байт`;

  console.log(`${result.status} ${result.name}: ${result.path} (${sizeInfo})`);
});

console.log("\n📊 Результат:");
if (allBuilt) {
  console.log("✅ Все приложения собраны!");
  console.log("🚀 Можно запускать: pnpm start:all");
} else {
  console.log("❌ Некоторые приложения не собраны!");
  console.log("🔨 Соберите все приложения: pnpm build:all");

  const notBuilt = results.filter((r) => r.status === "❌");
  console.log("\nНе собраны:");
  notBuilt.forEach((app) => {
    console.log(`  - ${app.name}`);
  });
}

console.log("\n📋 Команды для сборки:");
console.log("  pnpm build:all          # Сборка всех приложений");
console.log("  pnpm --filter @gafus/web build        # Сборка только web");
console.log("  pnpm --filter @gafus/trainer-panel build  # Сборка только trainer-panel");

process.exit(allBuilt ? 0 : 1);
