#!/usr/bin/env node

const { spawn } = require("child_process");
const { execSync } = require("child_process");
const path = require("path");
const dotenv = require("dotenv");

// Загружаем переменные окружения только из .env.local
try {
  const rootDir = process.cwd();
  dotenv.config({ path: path.join(rootDir, ".env.local") });
  // eslint-disable-next-line no-console
  console.warn("🔑 ENV загружен из .env.local");
} catch {}

console.warn("🚀 Запуск всех приложений Гафус...\n");

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
  console.warn("❌ Проблемы с портами. Проверьте конфигурацию.");
  process.exit(1);
}

console.warn("\n✅ Все проверки пройдены!");
console.warn("🚀 Запускаем приложения...\n");

// Список приложений для запуска с их портами
const apps = [
  { name: "Web App", filter: "@gafus/web", port: 3002, type: "next" },
  { name: "Trainer Panel", filter: "@gafus/trainer-panel", port: 3001, type: "next" },
  { name: "Error Dashboard", filter: "@gafus/error-dashboard", port: 3005, type: "next" },
  { name: "Telegram Bot", filter: "@gafus/telegram-bot", port: 3003, type: "node" },
  { name: "Bull Board", filter: "@gafus/bull-board", port: 3004, type: "node" },
  { name: "Worker", filter: "@gafus/worker", port: null, type: "worker", delay: 5000 },
];

function ensureBuilt(app) {
  if (app.type === "worker") {
    // Для worker'а ВСЕГДА пересобираем для актуальности
    const cwd = "packages/worker";
    console.warn(`[${app.name}] Пересобираю worker для актуальности...`);
    execSync(`pnpm --filter ${app.filter} build`, { stdio: "inherit" });
    // Ждем завершения сборки
    execSync("sleep 3", { stdio: "ignore" });
    return;
  }

  if (app.type !== "next") return;
  const cwd =
    app.filter === "@gafus/web"
      ? "apps/web"
      : app.filter === "@gafus/trainer-panel"
        ? "apps/trainer-panel"
        : app.filter === "@gafus/error-dashboard"
          ? "apps/error-dashboard"
          : null;
  if (!cwd) return;

  // Проверяем наличие всех необходимых файлов для production
  const requiredFiles = [".next/BUILD_ID", ".next/prerender-manifest.json", ".next/static"];

  let needsBuild = false;
  for (const file of requiredFiles) {
    try {
      execSync(`test -e ${file}`, { cwd, stdio: "ignore" });
    } catch (e) {
      needsBuild = true;
      break;
    }
  }

  if (needsBuild) {
    console.warn(`[${app.name}] Не все файлы сборки найдены. Выполняю сборку...`);
    execSync(`pnpm --filter ${app.filter} build`, { stdio: "inherit" });
    // Ждем завершения сборки
    execSync("sleep 2", { stdio: "ignore" });
  }
}

// Запускаем все приложения параллельно
const processes = [];
apps.forEach((app) => {
  if (app.requireEnv) {
    const missing = app.requireEnv.filter((k) => !process.env[k]);
    if (missing.length) {
      console.warn(`⚠️  Пропускаю ${app.name}: отсутствуют переменные ${missing.join(", ")}`);
      return;
    }
  }

  ensureBuilt(app);

  // Освобождаем порт, если занят (только для приложений с портами)
  if (app.port) {
    try {
      execSync(`lsof -ti tcp:${app.port} | xargs -r kill -9`, { stdio: "ignore" });
    } catch {}
  }

  console.warn(`🔄 Запуск ${app.name}${app.port ? ` (порт ${app.port})` : ""}...`);

  // Для worker'а добавляем задержку чтобы дождаться завершения сборки
  if (app.delay) {
    console.warn(`⏳ Ждем ${app.delay}ms для завершения сборки ${app.name}...`);
    execSync(`sleep ${app.delay / 1000}`, { stdio: "ignore" });
  }

  let child;
  child = spawn("pnpm", ["--filter", app.filter, "start"], {
    stdio: "pipe",
    shell: true,
    env: { ...process.env },
  });

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
  console.warn("  Web App: http://localhost:3002");
  console.warn("  Trainer Panel: http://localhost:3001");
  console.warn("  Error Dashboard: http://localhost:3005");
  console.warn("  Bull Board: http://localhost:3004");
  console.warn("  Telegram Bot: работает на порту 3003");

  console.warn("\n💡 Для остановки нажмите Ctrl+C");
}, 5000);
