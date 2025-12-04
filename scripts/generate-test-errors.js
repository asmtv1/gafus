#!/usr/bin/env node
/**
 * Универсальный скрипт для генерации тестовых ошибок в error-dashboard
 * 
 * Использование:
 *   node scripts/generate-test-errors.js              # Все ошибки
 *   node scripts/generate-test-errors.js web          # Только web ошибки
 *   node scripts/generate-test-errors.js logger       # Только logger ошибки
 *   node scripts/generate-test-errors.js --help       # Список доступных тестов
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

const TEST_SCRIPTS = {
  logger: "packages/logger/test-error-dashboard.js",
  "error-handling": "packages/error-handling/test-error-handling-error-dashboard.js",
  auth: "packages/auth/test-auth-error-dashboard.js",
  prisma: "packages/prisma/test-prisma-error-dashboard.js",
  queues: "packages/queues/test-queues-error-dashboard.js",
  webpush: "packages/webpush/test-webpush-error-dashboard.js",
  csrf: "packages/csrf/test-csrf-error-dashboard.js",
  types: "packages/types/test-types-error-dashboard.js",
  "react-query": "packages/react-query/test-react-query-error-dashboard.js",
  web: "apps/web/test-web-error-dashboard.js",
  "trainer-panel": "apps/trainer-panel/test-trainer-panel-error-dashboard.js",
  "telegram-bot": "apps/telegram-bot/test-telegram-bot-error-dashboard.js",
  "bull-board": "apps/bull-board/test-bull-board-error-dashboard.js",
};

function showHelp() {
  console.log("🧪 Генератор тестовых ошибок для error-dashboard\n");
  console.log("Доступные тесты:");
  Object.keys(TEST_SCRIPTS).forEach((key) => {
    console.log(`  - ${key}`);
  });
  console.log("\nИспользование:");
  console.log("  node scripts/generate-test-errors.js [тест]");
  console.log("\nПримеры:");
  console.log("  node scripts/generate-test-errors.js              # Все тесты");
  console.log("  node scripts/generate-test-errors.js web         # Только web");
  console.log("  node scripts/generate-test-errors.js logger     # Только logger");
  console.log("  node scripts/generate-test-errors.js --help      # Эта справка");
}

function runTest(testName) {
  return new Promise((resolve, reject) => {
    const scriptPath = TEST_SCRIPTS[testName];
    if (!scriptPath) {
      reject(new Error(`Тест "${testName}" не найден`));
      return;
    }

    const fullPath = join(rootDir, scriptPath);
    console.log(`\n🚀 Запуск теста: ${testName}`);
    console.log(`📄 Скрипт: ${scriptPath}\n`);

    const child = spawn("node", [fullPath], {
      cwd: rootDir,
      stdio: "inherit",
      shell: false,
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`\n✅ Тест "${testName}" завершен успешно\n`);
        resolve();
      } else {
        console.log(`\n❌ Тест "${testName}" завершился с кодом ${code}\n`);
        reject(new Error(`Тест завершился с кодом ${code}`));
      }
    });

    child.on("error", (error) => {
      console.error(`\n❌ Ошибка при запуске теста "${testName}":`, error);
      reject(error);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const testName = args[0];

  if (testName === "--help" || testName === "-h") {
    showHelp();
    process.exit(0);
  }

  try {
    if (testName) {
      // Запуск конкретного теста
      if (!TEST_SCRIPTS[testName]) {
        console.error(`❌ Тест "${testName}" не найден\n`);
        showHelp();
        process.exit(1);
      }
      await runTest(testName);
    } else {
      // Запуск всех тестов последовательно
      console.log("🧪 Запуск всех тестов для генерации ошибок...\n");
      console.log("📊 После завершения проверьте error-dashboard:");
      console.log("   http://localhost:3001\n");

      const testNames = Object.keys(TEST_SCRIPTS);
      for (const name of testNames) {
        try {
          await runTest(name);
          // Небольшая задержка между тестами
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`⚠️  Пропуск теста "${name}" из-за ошибки`);
        }
      }

      console.log("\n🎉 Все тесты завершены!");
      console.log("\n📊 Проверьте error-dashboard:");
      console.log("   - Главная страница: http://localhost:3001");
      console.log("   - Логи контейнеров: http://localhost:3001/container-logs");
      console.log("   - Статистика: http://localhost:3001/stats");
    }
  } catch (error) {
    console.error("\n💥 Критическая ошибка:", error);
    process.exit(1);
  }
}

main();
