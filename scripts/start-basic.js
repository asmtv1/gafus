#!/usr/bin/env node

const { spawn } = require("child_process");
const { execSync } = require("child_process");

console.log("🚀 Запуск основных приложений Гафус...\n");

// Проверяем, что все приложения собраны
try {
  console.log("🔍 Проверка сборки приложений...");
  execSync("pnpm check:builds", { stdio: "inherit" });
} catch (error) {
  console.log("❌ Некоторые приложения не собраны. Собираем...");
  execSync("pnpm build:all", { stdio: "inherit" });
}

// Проверяем порты
try {
  console.log("\n🔍 Проверка портов...");
  execSync("pnpm check:ports", { stdio: "inherit" });
} catch (error) {
  console.log("❌ Проблемы с портами. Проверьте конфигурацию.");
  process.exit(1);
}

console.log("\n✅ Все проверки пройдены!");
console.log("🚀 Запускаем основные приложения...\n");

// Список основных приложений для запуска
const apps = [
  { name: "Web App", filter: "@gafus/web", port: 3002 },
  { name: "Trainer Panel", filter: "@gafus/trainer-panel", port: 3001 },
  { name: "Error Dashboard", filter: "@gafus/error-dashboard", port: 3005 },
  { name: "Bull Board", filter: "@gafus/bull-board", port: 3004 },
];

// Запускаем основные приложения параллельно
const processes = apps.map((app) => {
  console.log(`🔄 Запуск ${app.name} (порт ${app.port})...`);

  const child = spawn("pnpm", ["--filter", app.filter, "start"], {
    stdio: "pipe",
    shell: true,
    env: { ...process.env },
  });

  // Логируем вывод
  child.stdout.on("data", (data) => {
    const output = data.toString().trim();
    if (output) {
      console.log(`[${app.name}] ${output}`);
    }
  });

  child.stderr.on("data", (data) => {
    const output = data.toString().trim();
    if (output && !output.includes("Warning")) {
      console.error(`[${app.name}] ERROR: ${output}`);
    }
  });

  child.on("error", (error) => {
    console.error(`❌ Ошибка запуска ${app.name}:`, error.message);
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(`❌ ${app.name} завершился с кодом ${code}`);
    } else {
      console.log(`✅ ${app.name} завершен`);
    }
  });

  return child;
});

// Обработка сигналов завершения
process.on("SIGINT", () => {
  console.log("\n🛑 Получен сигнал завершения. Останавливаем приложения...");
  processes.forEach((child) => {
    child.kill("SIGINT");
  });
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Получен сигнал завершения. Останавливаем приложения...");
  processes.forEach((child) => {
    child.kill("SIGTERM");
  });
  process.exit(0);
});

// Выводим информацию о доступных приложениях
setTimeout(() => {
  console.log("\n🌐 Доступные приложения:");
  console.log("  Web App: http://localhost:3002");
  console.log("  Trainer Panel: http://localhost:3001");
  console.log("  Error Dashboard: http://localhost:3005");
  console.log("  Bull Board: http://localhost:3004");
  console.log("\n💡 Для остановки нажмите Ctrl+C");
}, 5000);
