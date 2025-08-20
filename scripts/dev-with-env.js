#!/usr/bin/env node

const { spawn } = require("child_process");
const { execSync } = require("child_process");
const { loadEnvVars, createChildEnv } = require("./env-loader");

// Загружаем переменные окружения из корня репозитория
const envVars = loadEnvVars();

console.warn("🚀 Запуск dev режима с переменными окружения...\n");

// Проверяем, что все приложения собраны
try {
  console.warn("🔍 Проверка сборки приложений...");
  execSync("pnpm check:builds", { stdio: "inherit" });
} catch (error) {
  console.warn("❌ Некоторые приложения не собраны. Собираем...");
  execSync("pnpm build:all", { stdio: "inherit" });
}

// Проверяем порты
try {
  console.warn("\n🔍 Проверка портов...");
  execSync("pnpm check:ports", { stdio: "inherit" });
} catch (error) {
  console.warn("❌ Проблемы с портами. Проверяем и освобождаем...");
}

console.warn("\n✅ Все проверки пройдены!");
console.warn("🚀 Запускаем приложения в dev режиме...\n");

// Список приложений для запуска в dev режиме
const apps = [
  { name: "Web App", filter: "@gafus/web", port: 3002, type: "next-dev" },
  { name: "Trainer Panel", filter: "@gafus/trainer-panel", port: 3001, type: "next-dev" },
  { name: "Error Dashboard", filter: "@gafus/error-dashboard", port: 3005, type: "next-dev" },
];

// Освобождаем порты, если заняты
apps.forEach((app) => {
  try {
    execSync(`lsof -ti tcp:${app.port} | xargs -r kill -9`, { stdio: "ignore" });
    console.warn(`🔓 Порт ${app.port} освобожден`);
  } catch {}
});

// Запускаем все приложения параллельно
const processes = [];
apps.forEach((app) => {
  console.warn(`🔄 Запуск ${app.name} (порт ${app.port})...`);

  let child;
  if (app.type === "next-dev") {
    // Создаем объект окружения с переменными из .env + системными + портом
    const childEnv = createChildEnv(envVars, { PORT: String(app.port) });

    child = spawn("pnpm", ["--filter", app.filter, "dev"], {
      stdio: "pipe",
      env: childEnv,
    });
  }

  child.stdout.on("data", (data) => {
    const output = data.toString().trim();
    if (output) console.warn(`[${app.name}] ${output}`);
  });

  child.stderr.on("data", (data) => {
    const output = data.toString().trim();
    if (output && !output.includes("Warning")) console.error(`[${app.name}] ERROR: ${output}`);
  });

  child.on("error", (error) => console.error(`❌ Ошибка запуска ${app.name}:`, error.message));
  child.on("exit", (code) => {
    if (code !== 0) console.error(`❌ ${app.name} завершился с кодом ${code}`);
    else console.warn(`✅ ${app.name} завершен`);
  });

  processes.push(child);
});

// Обработка сигналов завершения
process.on("SIGINT", () => {
  console.warn("\n🛑 Получен сигнал завершения. Останавливаем приложения...");
  processes.forEach((child) => {
    child.kill("SIGINT");
  });
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.warn("\n🛑 Получен сигнал завершения. Останавливаем приложения...");
  processes.forEach((child) => {
    child.kill("SIGTERM");
  });
  process.exit(0);
});

// Выводим информацию о доступных приложениях
setTimeout(() => {
  console.warn("\n🌐 Доступные приложения:");
  console.warn("  Web App: http://web.gafus.localhost:3002");
  console.warn("  Trainer Panel: http://trainer.gafus.localhost:3001");
  console.warn("  Error Dashboard: http://errors.gafus.localhost:3005");
  console.warn("\n💡 Для остановки нажмите Ctrl+C");
}, 5000);
