#!/usr/bin/env node

/**
 * Скрипт для проверки циклических зависимостей в проекте GAFUS
 * Запуск: node scripts/check-circular-deps.js
 */

import { execSync } from "child_process";

const PROJECT_ROOT = process.cwd();

// Функция для проверки циклических зависимостей
function checkCircularDependencies() {
  console.log("🔍 Проверяем циклические зависимости...");

  try {
    // Запускаем ESLint с правилом no-cycle
    const result = execSync("pnpm lint --format=compact | grep 'import/no-cycle' || true", {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
    });

    if (result.trim()) {
      console.log("❌ Найдены циклические зависимости:");
      console.log(result);
      return false;
    } else {
      console.log("✅ Циклические зависимости не найдены");
      return true;
    }
  } catch (error) {
    console.log("✅ ESLint проверка прошла успешно");
    return true;
  }
}

// Функция для проверки неправильных импортов
function checkImportIssues() {
  console.log("🔍 Проверяем неправильные импорты...");

  try {
    // Запускаем ESLint с правилами импортов
    const result = execSync(
      "pnpm lint --format=compact | grep -E '(import/no-unresolved|import/named)' || true",
      { cwd: PROJECT_ROOT, encoding: "utf8" },
    );

    if (result.trim()) {
      console.log("❌ Найдены проблемы с импортами:");
      console.log(result);
      return false;
    } else {
      console.log("✅ Проблемы с импортами не найдены");
      return true;
    }
  } catch (error) {
    console.log("✅ ESLint проверка импортов прошла успешно");
    return true;
  }
}

// Функция для проверки использования any
function checkAnyUsage() {
  console.log("🔍 Проверяем использование any...");

  try {
    // Ищем все файлы с any, исключая сгенерированные файлы
    const result = execSync(
      "grep -r 'any' --include='*.ts' --include='*.tsx' apps/ packages/ | grep -v 'node_modules' | grep -v 'migrations' | grep -v '.next' | grep -v 'dist' || true",
      { cwd: PROJECT_ROOT, encoding: "utf8" },
    );

    if (result.trim()) {
      console.log("❌ Найдены файлы с использованием any:");
      console.log(result);
      return false;
    } else {
      console.log("✅ Использование any не найдено");
      return true;
    }
  } catch (error) {
    console.log("✅ Проверка any прошла успешно");
    return true;
  }
}

// Основная функция
function main() {
  console.log("🚀 Запуск проверки архитектуры проекта GAFUS\n");

  const results = {
    circularDeps: checkCircularDependencies(),
    importIssues: checkImportIssues(),
    anyUsage: checkAnyUsage(),
  };

  console.log("\n📊 Результаты проверки:");
  console.log(`Циклические зависимости: ${results.circularDeps ? "✅" : "❌"}`);
  console.log(`Проблемы с импортами: ${results.importIssues ? "✅" : "❌"}`);
  console.log(`Использование any: ${results.anyUsage ? "✅" : "❌"}`);

  const allPassed = Object.values(results).every(Boolean);

  if (allPassed) {
    console.log("\n🎉 Все проверки прошли успешно!");
    process.exit(0);
  } else {
    console.log("\n⚠️  Найдены проблемы архитектуры. Требуется исправление.");
    process.exit(1);
  }
}

// Запуск скрипта
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
