#!/usr/bin/env node

const { spawn } = require("child_process");
const { loadEnvVars, createChildEnv } = require("./env-loader");

// Загружаем переменные окружения из корня репозитория
const envVars = loadEnvVars();

console.warn("🚀 Запуск trainer-panel с переменными окружения...\n");

// Проверяем, что trainer-panel собрано
try {
  console.warn("🔍 Проверка сборки trainer-panel...");
  execSync("test -f apps/trainer-panel/.next/BUILD_ID", { stdio: "ignore" });
} catch (error) {
  console.warn("❌ Trainer-panel не собрано. Собираем...");
  execSync("pnpm --filter @gafus/trainer-panel build", { stdio: "inherit" });
}

// Освобождаем порт 3001, если занят
try {
  execSync("lsof -ti tcp:3001 | xargs -r kill -9", { stdio: "ignore" });
  console.warn("🔓 Порт 3001 освобожден");
} catch {}

console.warn("✅ Все проверки пройдены!");
console.warn("🚀 Запускаем trainer-panel...\n");

// Создаем объект окружения с переменными из .env + системными + портом
const childEnv = createChildEnv(envVars, { PORT: "3001" });

const child = spawn("pnpm", ["--filter", "@gafus/trainer-panel", "dev"], {
  stdio: "inherit",
  env: childEnv,
});

// Обработка сигналов завершения
process.on("SIGINT", () => {
  console.warn("\n🛑 Получен сигнал завершения. Останавливаем trainer-panel...");
  child.kill("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.warn("\n🛑 Получен сигнал завершения. Останавливаем trainer-panel...");
  child.kill("SIGTERM");
  process.exit(0);
});

// Обработка завершения процесса
child.on("exit", (code) => {
  if (code !== 0) {
    console.error(`❌ Trainer-panel завершился с кодом ${code}`);
    process.exit(code);
  }
  process.exit(0);
});

child.on("error", (error) => {
  console.error("❌ Ошибка запуска trainer-panel:", error.message);
  process.exit(1);
});

// Выводим информацию о доступном приложении
setTimeout(() => {
  console.warn("\n🌐 Доступное приложение:");
  console.warn("  Trainer Panel: http://trainer.gafus.localhost:3001");
  console.warn("\n💡 Для остановки нажмите Ctrl+C");
}, 3000);
