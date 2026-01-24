#!/usr/bin/env node
/**
 * Тест отправки логов queues в error-dashboard
 *
 * Запуск: node packages/queues/test-queues-error-dashboard.js
 */

import { createWorkerLogger } from "@gafus/logger/dist/index.js";

async function testQueuesErrorDashboard() {
  console.log("🧪 Тестирование отправки логов queues в error-dashboard...\n");

  // Создаем логгер для redis-connection
  const logger = createWorkerLogger("redis-connection");

  try {
    // Тест 1: Ошибка отсутствия REDIS_URL
    console.log("1️⃣ Тестируем ошибку отсутствия REDIS_URL...");
    await logger.error(
      "REDIS_URL is not set in environment variables",
      new Error("Missing REDIS_URL"),
      {
        availableRedisVars: ["REDIS_HOST", "REDIS_PORT"],
        environment: "test",
      },
    );
    console.log("✅ REDIS_URL error лог отправлен\n");

    // Тест 2: Ошибка подключения к Redis
    console.log("2️⃣ Тестируем ошибку подключения к Redis...");
    await logger.error("Redis connection error", new Error("ECONNREFUSED"), {
      url: "redis://localhost:6379",
      errorCode: "ECONNREFUSED",
      errno: -61,
    });
    console.log("✅ Redis connection error лог отправлен\n");

    // Тест 3: Предупреждение о закрытии соединения
    console.log("3️⃣ Тестируем предупреждение о закрытии соединения...");
    logger.warn("Redis connection closed", {
      url: "redis://localhost:6379",
      reason: "Client disconnected",
    });
    console.log("✅ Redis connection closed warning лог отправлен\n");

    // Тест 4: Информация о подключении
    console.log("4️⃣ Тестируем информацию о подключении...");
    logger.info("Redis connection established", {
      url: "redis://localhost:6379",
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    console.log("✅ Redis connection established info лог отправлен\n");

    // Тест 5: Успешное подключение
    console.log("5️⃣ Тестируем успешное подключение...");
    logger.success("Redis connection is ready", {
      url: "redis://localhost:6379",
      version: "6.2.6",
    });
    console.log("✅ Redis connection ready success лог отправлен\n");

    // Тест 6: Переподключение
    console.log("6️⃣ Тестируем переподключение...");
    logger.info("Redis reconnecting", {
      url: "redis://localhost:6379",
      attempt: 3,
      delay: 1000,
    });
    console.log("✅ Redis reconnecting info лог отправлен\n");

    console.log("🎉 Все тесты завершены!");
    console.log("\n📊 Проверьте error-dashboard:");
    console.log("   - Логи контейнеров: http://localhost:3001/container-logs");
    console.log("   - Ищите логи по контексту: redis-connection");
    console.log("\n🔍 Ожидаемые логи:");
    console.log("   - Ошибки подключения с errorCode и errno");
    console.log("   - Предупреждения о закрытии соединения");
    console.log("   - Информация о состоянии подключения");
    console.log("   - Success сообщения для готовности");
  } catch (error) {
    console.error("❌ Ошибка при тестировании:", error);
    process.exit(1);
  }
}

// Запускаем тест
testQueuesErrorDashboard()
  .then(() => {
    console.log("\n✨ Тест завершен успешно!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Тест завершился с ошибкой:", error);
    process.exit(1);
  });
