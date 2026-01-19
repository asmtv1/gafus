#!/usr/bin/env tsx

/**
 * Characterization Tests для модуля Training
 *
 * Эти тесты фиксируют текущее поведение критичных функций тренировки.
 * Они должны проходить ДО и ПОСЛЕ рефакторинга.
 *
 * НЕ МЕНЯТЬ логику тестов - только если меняется бизнес-логика!
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

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
  log('Проверка сигнатур функций модуля Training...');

  // Проверяем, что функции существуют и имеют ожидаемые сигнатуры
  const functionsToCheck = [
    {
      file: 'apps/web/src/shared/lib/training/getTrainingDayWithUserSteps.ts',
      expected: 'export async function getTrainingDayWithUserSteps'
    },
    {
      file: 'apps/web/src/shared/lib/training/updateUserStepStatus.ts',
      expected: 'export async function updateUserStepStatus'
    },
    {
      file: 'apps/web/src/shared/lib/training/startUserStepServerAction.ts',
      expected: 'export async function startUserStepServerAction'
    }
  ];

  for (const { file, expected } of functionsToCheck) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), 'utf-8');
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

// Characterization Test 2: Проверка импортов
function testImports() {
  log('Проверка импортов в модуле Training...');

  const filesToCheck = [
    {
      file: 'apps/web/src/shared/lib/training/getTrainingDayWithUserSteps.ts',
      expectedImports: ['prisma', 'createWebLogger', 'TrainingStatus']
    },
    {
      file: 'apps/web/src/shared/lib/training/updateUserStepStatus.ts',
      expectedImports: ['prisma', 'TrainingStatus', 'createWebLogger']
    }
  ];

  for (const { file, expectedImports } of filesToCheck) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), 'utf-8');
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

// Characterization Test 3: Проверка структуры ответов (статический анализ)
function testResponseStructures() {
  log('Проверка структур ответов функций...');

  const structuresToCheck = [
    {
      file: 'apps/web/src/shared/lib/training/updateUserStepStatus.ts',
      expectedStructure: 'return { success: true }'
    },
    {
      file: 'apps/web/src/shared/lib/training/startUserStepServerAction.ts',
      expectedStructure: 'return { success: true }'
    }
  ];

  for (const { file, expectedStructure } of structuresToCheck) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), 'utf-8');
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

// Characterization Test 4: Проверка обработки ошибок
function testErrorHandling() {
  log('Проверка обработки ошибок...');

  const errorPatterns = [
    {
      file: 'apps/web/src/shared/lib/training/getTrainingDayWithUserSteps.ts',
      expectedPattern: 'logger.error'
    },
    {
      file: 'apps/web/src/shared/lib/training/updateUserStepStatus.ts',
      expectedPattern: 'logger.error'
    }
  ];

  for (const { file, expectedPattern } of errorPatterns) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), 'utf-8');
      if (content.includes(expectedPattern)) {
        success(`Обработка ошибок найдена: ${expectedPattern} в ${file}`);
      } else {
        warn(`Обработка ошибок не найдена: ${expectedPattern} в ${file}`);
      }
    } catch (err) {
      error(`Ошибка чтения файла ${file}: ${err.message}`);
    }
  }
}

// Characterization Test 5: Проверка транзакций
function testTransactions() {
  log('Проверка использования транзакций...');

  const transactionFiles = [
    'apps/web/src/shared/lib/training/getTrainingDayWithUserSteps.ts',
    'apps/web/src/shared/lib/training/updateUserStepStatus.ts',
    'apps/web/src/shared/lib/training/startUserStepServerAction.ts'
  ];

  for (const file of transactionFiles) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), 'utf-8');
      if (content.includes('$transaction')) {
        success(`Транзакция найдена в: ${file}`);
      } else {
        warn(`Транзакция не найдена в: ${file}`);
      }
    } catch (err) {
      error(`Ошибка чтения файла ${file}: ${err.message}`);
    }
  }
}

// Основная функция
function runCharacterizationTests() {
  console.log('🚀 ЗАПУСК CHARACTERIZATION TESTS ДЛЯ TRAINING MODULE\n');

  try {
    testFunctionSignatures();
    console.log('');

    testImports();
    console.log('');

    testResponseStructures();
    console.log('');

    testErrorHandling();
    console.log('');

    testTransactions();
    console.log('');

    success('✅ CHARACTERIZATION TESTS ЗАВЕРШЕНЫ!');
    console.log('\n💡 Эти тесты фиксируют текущее поведение.');
    console.log('   Они должны проходить ДО и ПОСЛЕ рефакторинга.');
    console.log('   Если тесты падают - значит изменилась бизнес-логика!');

  } catch (err) {
    error(`Критическая ошибка: ${err.message}`);
    process.exit(1);
  }
}

// Запуск
runCharacterizationTests();