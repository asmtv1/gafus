#!/usr/bin/env node
/**
 * Тест отправки логов csrf в error-dashboard
 *
 * Запуск: node packages/csrf/test-csrf-error-dashboard.js
 */

import { createWebLogger } from "@gafus/logger/dist/index.js";

async function testCSRFErrorDashboard() {
  console.log("🧪 Тестирование отправки логов csrf в error-dashboard...\n");

  try {
    // Тест 1: CSRF Utils логгер
    console.log("1️⃣ Тестируем csrf-utils логгер...");
    const utilsLogger = createWebLogger("csrf-utils");
    await utilsLogger.error("Error generating CSRF token", new Error("Crypto module failed"), {
      secretSize: 32,
      saltSize: 16,
    });
    console.log("✅ CSRF Utils error лог отправлен\n");

    // Тест 2: CSRF Store логгер
    console.log("2️⃣ Тестируем csrf-store логгер...");
    const storeLogger = createWebLogger("csrf-store");
    await storeLogger.error("Ошибка при получении CSRF токена", new Error("Network timeout"), {
      retryCount: 3,
      lastFetched: Date.now(),
    });
    console.log("✅ CSRF Store error лог отправлен\n");

    // Тест 3: CSRF Provider логгер
    console.log("3️⃣ Тестируем csrf-provider логгер...");
    const providerLogger = createWebLogger("csrf-provider");
    await providerLogger.error(
      "CSRF Provider initialization failed",
      new Error("Token validation failed"),
      {
        retryCount: 2,
        maxRetries: 5,
      },
    );
    console.log("✅ CSRF Provider error лог отправлен\n");

    // Тест 4: CSRF Middleware логгер
    console.log("4️⃣ Тестируем csrf-middleware логгер...");
    const middlewareLogger = createWebLogger("csrf-middleware");
    await middlewareLogger.error("Error verifying CSRF token", new Error("Token mismatch"), {
      method: "POST",
      url: "/api/data",
      tokenLength: 64,
    });
    console.log("✅ CSRF Middleware error лог отправлен\n");

    // Тест 5: CSRF Attack Attempt
    console.log("5️⃣ Тестируем CSRF Attack Attempt...");
    middlewareLogger.warn("CSRF Attack Attempt", {
      ip: "192.168.1.100",
      userAgent: "Mozilla/5.0 (Test Browser)",
      method: "POST",
      url: "/api/sensitive-data",
      reason: "Invalid CSRF token",
      token: "present",
      timestamp: new Date().toISOString(),
    });
    console.log("✅ CSRF Attack Attempt warning лог отправлен\n");

    // Тест 6: CSRF Token Validation Success
    console.log("6️⃣ Тестируем CSRF Token Validation Success...");
    middlewareLogger.success("CSRF token validated successfully", {
      method: "POST",
      url: "/api/data",
      tokenLength: 64,
    });
    console.log("✅ CSRF Token Validation Success лог отправлен\n");

    // Тест 7: CSRF Token Warnings (только в production)
    console.log("7️⃣ Тестируем CSRF Token Warnings...");
    utilsLogger.warn("Invalid CSRF token format", {
      tokenLength: 32,
      expectedFormat: "base64.base64",
    });
    console.log("✅ CSRF Token Warning лог отправлен\n");

    // Тест 8: CSRF Store Warnings
    console.log("8️⃣ Тестируем CSRF Store Warnings...");
    storeLogger.warn("Invalid CSRF token, request may fail", {
      tokenLength: 0,
      tokenValue: "invalid",
    });
    console.log("✅ CSRF Store Warning лог отправлен\n");

    console.log("🎉 Все тесты завершены!");
    console.log("\n📊 Проверьте error-dashboard:");
    console.log("   - Reports: http://localhost:3001/reports");
    console.log(
      "   - Ищите логи по контексту: csrf-utils, csrf-store, csrf-provider, csrf-middleware",
    );
    console.log("\n🔍 Ожидаемые логи:");
    console.log("   - CSRF Utils ошибки генерации токенов");
    console.log("   - CSRF Store ошибки получения токенов");
    console.log("   - CSRF Provider ошибки инициализации");
    console.log("   - CSRF Middleware ошибки верификации");
    console.log("   - CSRF Attack Attempt предупреждения");
    console.log("   - CSRF Token Validation Success сообщения");
  } catch (error) {
    console.error("❌ Ошибка при тестировании:", error);
    process.exit(1);
  }
}

// Запускаем тест
testCSRFErrorDashboard()
  .then(() => {
    console.log("\n✨ Тест завершен успешно!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Тест завершился с ошибкой:", error);
    process.exit(1);
  });
