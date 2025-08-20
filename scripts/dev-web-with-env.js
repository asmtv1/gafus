#!/usr/bin/env node

const { spawn } = require("child_process");
const { loadEnvVars, createChildEnv } = require("./env-loader");

// Загружаем переменные окружения из корня репозитория
const envVars = loadEnvVars();

console.warn("🚀 Запуск web приложения с переменными окружения...\n");

// Проверяем, что web приложение собрано
try {
  console.warn("🔍 Проверка сборки web приложения...");
  execSync("test -f apps/web/.next/BUILD_ID", { stdio: "ignore" });
} catch (error) {
  console.warn("❌ Web приложение не собрано. Собираем...");
  execSync("pnpm --filter @gafus/web build", { stdio: "inherit" });
}

// Освобождаем порт 3002, если занят
try {
  execSync("lsof -ti tcp:3002 | xargs -r kill -9", { stdio: "ignore" });
  console.warn("🔓 Порт 3002 освобожден");
} catch {}

console.warn("✅ Все проверки пройдены!");
console.warn("🚀 Запускаем web приложение...\n");

// Создаем объект окружения с переменными из .env + системными + портом
const childEnv = createChildEnv(envVars, { PORT: "3002" });

const child = spawn("pnpm", ["--filter", "@gafus/web", "dev"], {
  stdio: "inherit",
  env: childEnv,
});

// Обработка сигналов завершения
process.on("SIGINT", () => {
  console.warn("\n🛑 Получен сигнал завершения. Останавливаем web приложение...");
  child.kill("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.warn("\n🛑 Получен сигнал завершения. Останавливаем web приложение...");
  child.kill("SIGTERM");
  process.exit(0);
});

// Обработка завершения процесса
child.on("exit", (code) => {
  if (code !== 0) {
    console.error(`❌ Web приложение завершилось с кодом ${code}`);
    process.exit(code);
  }
  process.exit(0);
});

child.on("error", (error) => {
  console.error("❌ Ошибка запуска web приложения:", error.message);
  process.exit(1);
});

// Выводим информацию о доступном приложении
setTimeout(() => {
  console.warn("\n🌐 Доступное приложение:");
  console.warn("  Web App: http://web.gafus.localhost:3002");
  console.warn("\n💡 Для остановки нажмите Ctrl+C");
}, 3000);
