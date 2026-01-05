#!/usr/bin/env node

const { spawn } = require("child_process");
const { execSync } = require("child_process");
const { loadEnvVars, createChildEnv } = require("./env-loader");

// Загружаем переменные окружения из корня репозитория
const envVars = loadEnvVars();

console.warn("🚀 Запуск dev режима с переменными окружения...\n");

// В dev режиме не проверяем сборку - Next.js компилирует на лету
// Это ускоряет запуск и не требует предварительной сборки

// Список приложений для запуска в dev режиме
const apps = [
  { name: "Web App", filter: "@gafus/web", port: 3002, type: "next-dev" },
  //{ name: "Trainer Panel", filter: "@gafus/trainer-panel", port: 3001, type: "next-dev" },
  //{ name: "Admin Panel", filter: "@gafus/admin-panel", port: 3006, type: "next-dev" },
  //{ name: "Error Dashboard", filter: "@gafus/error-dashboard", port: 3005, type: "next-dev" },
  { name: "Push Worker", filter: "@gafus/worker", port: null, type: "worker" },
];

// Освобождаем порты, если заняты (быстро, без вывода)
apps.forEach((app) => {
  if (app.port) {
    try {
      execSync(`lsof -ti tcp:${app.port} | xargs -r kill -9`, { stdio: "ignore" });
    } catch {}
  }
});

console.warn("🚀 Запускаем приложения в dev режиме...\n");

// Запускаем все приложения параллельно
const processes = [];
apps.forEach((app) => {
  console.warn(`🔄 Запуск ${app.name}${app.port ? ` (порт ${app.port})` : ''}...`);

  let child;
  if (app.type === "next-dev") {
    // Создаем объект окружения с переменными из .env + системными + портом
    const childEnv = createChildEnv(envVars, { PORT: String(app.port) });

    child = spawn("pnpm", ["--filter", app.filter, "dev"], {
      stdio: "pipe",
      env: childEnv,
    });
  } else if (app.type === "worker") {
    // Запускаем worker в dev режиме
    const childEnv = createChildEnv(envVars, {});
    
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
  console.warn("  Admin Panel: http://admin.gafus.localhost:3006");
  console.warn("  Error Dashboard: http://errors.gafus.localhost:3005");
  console.warn("  Push Worker: обрабатывает уведомления");
  console.warn("\n💡 Для остановки нажмите Ctrl+C");
}, 5000);
