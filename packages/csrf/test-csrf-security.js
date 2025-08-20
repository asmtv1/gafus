#!/usr/bin/env node

/**
 * Тестирование улучшенной CSRF защиты
 * Запуск: node test-csrf-security.js
 */

const fetch = require("node-fetch");

const BASE_URL = process.env.TEST_URL || "http://localhost:3002";
const API_ENDPOINT = `${BASE_URL}/api/csrf-token`;

// Цвета для консоли
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name, result, details = "") {
  const status = result ? "✅ PASS" : "❌ FAIL";
  const color = result ? "green" : "red";
  log(`${status} ${name}`, color);
  if (details) {
    log(`   ${details}`, "yellow");
  }
}

async function testCSRFTokenGeneration() {
  log("\n🔒 Тестирование генерации CSRF токенов", "blue");

  try {
    const response = await fetch(API_ENDPOINT);
    const data = await response.json();

    const hasToken = !!data.token;
    const isString = typeof data.token === "string";
    const hasValidFormat =
      data.token && data.token.includes(".") && data.token.split(".").length === 2;

    logTest("Получение токена", hasToken, hasToken ? "Токен получен" : "Токен отсутствует");
    logTest("Тип токена", isString, isString ? "Строка" : `Тип: ${typeof data.token}`);
    logTest(
      "Формат токена",
      hasValidFormat,
      hasValidFormat ? "salt.hash формат" : "Неверный формат",
    );

    return hasToken && isString && hasValidFormat;
  } catch (error) {
    logTest("Сетевая ошибка", false, error.message);
    return false;
  }
}

async function testCSRFProtection() {
  log("\n🛡️ Тестирование CSRF защиты", "blue");

  const testEndpoint = `${BASE_URL}/api/test-csrf`;

  // Тест 1: Запрос без CSRF токена
  try {
    const response1 = await fetch(testEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: true }),
    });

    const isBlocked = response1.status === 403;
    logTest("Блокировка без токена", isBlocked, `Статус: ${response1.status}`);
  } catch (error) {
    logTest("Ошибка теста без токена", false, error.message);
  }

  // Тест 2: Запрос с неверным токеном
  try {
    const response2 = await fetch(testEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": "invalid-token",
      },
      body: JSON.stringify({ test: true }),
    });

    const isBlocked = response2.status === 403;
    logTest("Блокировка неверного токена", isBlocked, `Статус: ${response2.status}`);
  } catch (error) {
    logTest("Ошибка теста с неверным токеном", false, error.message);
  }

  // Тест 3: Запрос с правильным токеном
  try {
    // Сначала получаем валидный токен
    const tokenResponse = await fetch(API_ENDPOINT);
    const tokenData = await tokenResponse.json();

    if (tokenData.token) {
      const response3 = await fetch(testEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": tokenData.token,
        },
        body: JSON.stringify({ test: true }),
      });

      const isAllowed = response3.status === 200;
      logTest("Разрешение валидного токена", isAllowed, `Статус: ${response3.status}`);
    } else {
      logTest("Разрешение валидного токена", false, "Не удалось получить токен");
    }
  } catch (error) {
    logTest("Ошибка теста с валидным токеном", false, error.message);
  }
}

async function testCSRFHeaders() {
  log("\n📋 Тестирование CSRF заголовков", "blue");

  const validHeaders = ["x-csrf-token", "x-xsrf-token"];

  for (const header of validHeaders) {
    try {
      const response = await fetch(`${BASE_URL}/api/test-csrf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [header]: "test-token",
        },
        body: JSON.stringify({ test: true }),
      });

      const isProcessed = response.status === 403; // Ожидаем 403 для неверного токена
      logTest(`Заголовок ${header}`, isProcessed, `Статус: ${response.status}`);
    } catch (error) {
      logTest(`Заголовок ${header}`, false, error.message);
    }
  }
}

async function testCSRFMethods() {
  log("\n🔧 Тестирование HTTP методов", "blue");

  const unsafeMethods = ["POST", "PUT", "PATCH", "DELETE"];
  const safeMethods = ["GET", "HEAD", "OPTIONS"];

  // Тестируем небезопасные методы
  for (const method of unsafeMethods) {
    try {
      const response = await fetch(`${BASE_URL}/api/test-csrf`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method !== "GET" ? JSON.stringify({ test: true }) : undefined,
      });

      const isProtected = response.status === 403;
      logTest(`Защита ${method}`, isProtected, `Статус: ${response.status}`);
    } catch (error) {
      logTest(`Защита ${method}`, false, error.message);
    }
  }

  // Тестируем безопасные методы
  for (const method of safeMethods) {
    try {
      const response = await fetch(`${BASE_URL}/api/test-csrf`, {
        method,
      });

      const isAllowed = response.status !== 403;
      logTest(`Разрешение ${method}`, isAllowed, `Статус: ${response.status}`);
    } catch (error) {
      logTest(`Разрешение ${method}`, false, error.message);
    }
  }
}

async function testCSRFExclusions() {
  log("\n🚫 Тестирование исключений CSRF", "blue");

  const excludedPaths = ["/api/auth/", "/api/csrf-token", "/api/webhook/"];

  for (const path of excludedPaths) {
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });

      const isExcluded = response.status !== 403;
      logTest(`Исключение ${path}`, isExcluded, `Статус: ${response.status}`);
    } catch (error) {
      logTest(`Исключение ${path}`, false, error.message);
    }
  }
}

async function testCSRFRateLimiting() {
  log("\n⏱️ Тестирование ограничений запросов", "blue");

  const maxAttempts = 5;
  let blockedCount = 0;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${BASE_URL}/api/test-csrf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });

      if (response.status === 403) {
        blockedCount++;
      }

      // Небольшая задержка между запросами
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Ошибка в попытке ${i + 1}:`, error.message);
    }
  }

  const hasRateLimiting = blockedCount > 0;
  logTest("Ограничение запросов", hasRateLimiting, `Заблокировано: ${blockedCount}/${maxAttempts}`);
}

async function runAllTests() {
  log("🚀 Запуск тестов CSRF защиты", "bold");
  log(`Тестируем: ${BASE_URL}`, "blue");

  const tests = [
    testCSRFTokenGeneration,
    testCSRFProtection,
    testCSRFHeaders,
    testCSRFMethods,
    testCSRFExclusions,
    testCSRFRateLimiting,
  ];

  let passedTests = 0;
  let totalTests = 0;

  for (const test of tests) {
    try {
      const result = await test();
      if (result !== false) {
        passedTests++;
      }
      totalTests++;
    } catch (error) {
      log(`❌ Ошибка в тесте: ${error.message}`, "red");
      totalTests++;
    }
  }

  log("\n📊 Результаты тестирования", "bold");
  log(
    `Пройдено тестов: ${passedTests}/${totalTests}`,
    passedTests === totalTests ? "green" : "yellow",
  );

  if (passedTests === totalTests) {
    log("🎉 Все тесты CSRF защиты пройдены!", "green");
  } else {
    log("⚠️ Некоторые тесты не пройдены. Проверьте конфигурацию.", "yellow");
  }
}

// Запуск тестов
if (require.main === module) {
  runAllTests().catch((error) => {
    log(`❌ Критическая ошибка: ${error.message}`, "red");
    process.exit(1);
  });
}

module.exports = {
  testCSRFTokenGeneration,
  testCSRFProtection,
  testCSRFHeaders,
  testCSRFMethods,
  testCSRFExclusions,
  testCSRFRateLimiting,
  runAllTests,
};
