#!/usr/bin/env tsx

/**
 * Characterization Tests для модуля Notifications (StepNotification)
 *
 * Эти тесты фиксируют текущее поведение критичных функций уведомлений.
 * Они должны проходить ДО и ПОСЛЕ рефакторинга.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

function log(message: string) {
  console.log(`🧪 ${message}`);
}

function success(message: string) {
  console.log(`✅ ${message}`);
}

function error(message: string) {
  console.error(`❌ ${message}`);
}

function warn(message: string) {
  console.warn(`⚠️ ${message}`);
}

// Characterization Test 1: Проверка сигнатур функций
function testFunctionSignatures() {
  log("Проверка сигнатур функций модуля Notifications...");

  const functionsToCheck = [
    {
      file: "apps/web/src/shared/lib/StepNotification/createStepNotification.ts",
      expected: "export async function createStepNotification",
    },
    {
      file: "apps/web/src/shared/lib/StepNotification/toggleStepNotificationPause.ts",
      expected: "export async function toggleStepNotificationPause",
    },
    {
      file: "apps/web/src/shared/lib/StepNotification/manageStepNotification.ts",
      expected: "export async function",
    },
  ];

  for (const { file, expected } of functionsToCheck) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), "utf-8");
      if (content.includes(expected)) {
        success(`Функция найдена: ${file}`);
      } else {
        error(`Функция не найдена или изменилась: ${file}`);
      }
    } catch (err) {
      error(`Ошибка чтения файла ${file}: ${err.message}`);
    }
  }
}

// Characterization Test 2: Проверка структур ответов
function testResponseStructures() {
  log("Проверка структур ответов функций...");

  const structuresToCheck = [
    {
      file: "apps/web/src/shared/lib/StepNotification/createStepNotification.ts",
      expectedStructure: "return stepNotification;",
    },
    {
      file: "apps/web/src/shared/lib/StepNotification/toggleStepNotificationPause.ts",
      expectedStructure: "return updatedNotification;",
    },
  ];

  for (const { file, expectedStructure } of structuresToCheck) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), "utf-8");
      if (content.includes(expectedStructure)) {
        success(`Структура ответа найдена: ${expectedStructure} в ${file}`);
      } else {
        warn(`Структура ответа не найдена: ${expectedStructure} в ${file}`);
      }
    } catch (err) {
      error(`Ошибка чтения файла ${file}: ${err.message}`);
    }
  }
}

// Characterization Test 3: Проверка импортов
function testImports() {
  log("Проверка импортов в модуле Notifications...");

  const filesToCheck = [
    {
      file: "apps/web/src/shared/lib/StepNotification/createStepNotification.ts",
      expectedImports: ["prisma", "createWebLogger"],
    },
    {
      file: "apps/web/src/shared/lib/StepNotification/toggleStepNotificationPause.ts",
      expectedImports: ["prisma", "createWebLogger"],
    },
  ];

  for (const { file, expectedImports } of filesToCheck) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), "utf-8");
      for (const imp of expectedImports) {
        if (content.includes(imp)) {
          success(`Импорт найден: ${imp} в ${file}`);
        } else {
          warn(`Импорт не найден: ${imp} в ${file}`);
        }
      }
    } catch (err) {
      error(`Ошибка чтения файла ${file}: ${err.message}`);
    }
  }
}

// Characterization Test 4: Проверка обработки ошибок
function testErrorHandling() {
  log("Проверка обработки ошибок...");

  const errorFiles = [
    "apps/web/src/shared/lib/StepNotification/createStepNotification.ts",
    "apps/web/src/shared/lib/StepNotification/toggleStepNotificationPause.ts",
  ];

  for (const file of errorFiles) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), "utf-8");
      if (content.includes("logger.error") || content.includes("throw new Error")) {
        success(`Обработка ошибок найдена в: ${file}`);
      } else {
        warn(`Обработка ошибок не найдена в: ${file}`);
      }
    } catch (err) {
      error(`Ошибка чтения файла ${file}: ${err.message}`);
    }
  }
}

// Characterization Test 5: Проверка использования prisma
function testPrismaUsage() {
  log("Проверка использования Prisma в модуле Notifications...");

  const prismaFiles = [
    "apps/web/src/shared/lib/StepNotification/createStepNotification.ts",
    "apps/web/src/shared/lib/StepNotification/toggleStepNotificationPause.ts",
  ];

  for (const file of prismaFiles) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), "utf-8");
      if (
        (content.includes("prisma.") && content.includes("create")) ||
        content.includes("update")
      ) {
        success(`Использование Prisma найдено в: ${file}`);
      } else {
        warn(`Использование Prisma не найдено в: ${file}`);
      }
    } catch (err) {
      error(`Ошибка чтения файла ${file}: ${err.message}`);
    }
  }
}

// Основная функция
function runCharacterizationTests() {
  console.log("🚀 ЗАПУСК CHARACTERIZATION TESTS ДЛЯ NOTIFICATIONS MODULE\n");

  try {
    testFunctionSignatures();
    console.log("");

    testResponseStructures();
    console.log("");

    testImports();
    console.log("");

    testErrorHandling();
    console.log("");

    testPrismaUsage();
    console.log("");

    success("✅ CHARACTERIZATION TESTS ЗАВЕРШЕНЫ!");
    console.log("\n💡 Эти тесты фиксируют текущее поведение.");
    console.log("   Они должны проходить ДО и ПОСЛЕ рефакторинга.");
  } catch (err) {
    error(`Критическая ошибка: ${err.message}`);
    process.exit(1);
  }
}

// Запуск
runCharacterizationTests();
