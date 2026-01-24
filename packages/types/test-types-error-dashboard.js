#!/usr/bin/env node
/**
 * Тест отправки логов types в error-dashboard
 *
 * Запуск: node packages/types/test-types-error-dashboard.js
 */

import { createLogger } from "@gafus/types/dist/utils/logger.js";

async function testTypesErrorDashboard() {
  console.log("🧪 Тестирование отправки логов types в error-dashboard...\n");

  try {
    // Тест 1: Web логгер
    console.log("1️⃣ Тестируем web логгер...");
    const webLogger = createLogger("web-client");
    await webLogger.error("Failed to load user data", new Error("Network timeout"), {
      userId: "user-123",
      endpoint: "/api/user",
      retryCount: 3,
    });
    console.log("✅ Web error лог отправлен\n");

    // Тест 2: Trainer panel логгер
    console.log("2️⃣ Тестируем trainer panel логгер...");
    const trainerLogger = createLogger("trainer-panel");
    await trainerLogger.error("Failed to save training data", new Error("Validation error"), {
      trainingId: "training-456",
      userId: "trainer-789",
      errors: ["Invalid exercise type", "Missing duration"],
    });
    console.log("✅ Trainer panel error лог отправлен\n");

    // Тест 3: Worker логгер
    console.log("3️⃣ Тестируем worker логгер...");
    const workerLogger = createLogger("worker-processor");
    await workerLogger.error(
      "Failed to process queue job",
      new Error("Database connection failed"),
      {
        jobId: "job-123",
        queueName: "notifications",
        attempt: 2,
      },
    );
    console.log("✅ Worker error лог отправлен\n");

    // Тест 4: Telegram bot логгер
    console.log("4️⃣ Тестируем telegram bot логгер...");
    const botLogger = createLogger("telegram-bot");
    await botLogger.error("Failed to send message", new Error("API rate limit exceeded"), {
      chatId: "chat-456",
      messageType: "notification",
      userId: "user-789",
    });
    console.log("✅ Telegram bot error лог отправлен\n");

    // Тест 5: Error dashboard логгер (не должен отправлять в себя)
    console.log("5️⃣ Тестируем error dashboard логгер...");
    const dashboardLogger = createLogger("error-dashboard");
    await dashboardLogger.error("Failed to process error report", new Error("Invalid JSON"), {
      reportId: "report-123",
      source: "web-app",
    });
    console.log("✅ Error dashboard error лог отправлен (не в себя)\n");

    // Тест 6: Bull board логгер
    console.log("6️⃣ Тестируем bull board логгер...");
    const bullLogger = createLogger("bull-board");
    await bullLogger.error("Failed to load queue stats", new Error("Redis connection lost"), {
      queueName: "notifications",
      statsType: "failed",
    });
    console.log("✅ Bull board error лог отправлен\n");

    // Тест 7: Предупреждения (только в production)
    console.log("7️⃣ Тестируем предупреждения...");
    webLogger.warn("Slow API response detected", {
      endpoint: "/api/data",
      responseTime: 5000,
      threshold: 3000,
    });
    console.log("✅ Warning лог отправлен\n");

    // Тест 8: Успешные операции
    console.log("8️⃣ Тестируем успешные операции...");
    webLogger.success("User data loaded successfully", {
      userId: "user-123",
      dataSize: "2.5KB",
      duration: "150ms",
    });
    console.log("✅ Success лог отправлен\n");

    console.log("🎉 Все тесты завершены!");
    console.log("\n📊 Проверьте error-dashboard:");
    console.log("   - Reports: http://localhost:3001/reports");
    console.log("   - Логи контейнеров: http://localhost:3001/container-logs");
    console.log("   - Ищите логи по контексту: web-client, trainer-panel, worker-processor, etc.");
    console.log("\n🔍 Ожидаемые логи:");
    console.log("   - Web ошибки в разделе отчетов");
    console.log("   - Worker ошибки в разделе «Логи контейнеров»");
    console.log("   - Telegram bot ошибки в разделе отчетов");
    console.log("   - Error dashboard ошибки НЕ отправляются в себя");
  } catch (error) {
    console.error("❌ Ошибка при тестировании:", error);
    process.exit(1);
  }
}

// Запускаем тест
testTypesErrorDashboard()
  .then(() => {
    console.log("\n✨ Тест завершен успешно!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Тест завершился с ошибкой:", error);
    process.exit(1);
  });
