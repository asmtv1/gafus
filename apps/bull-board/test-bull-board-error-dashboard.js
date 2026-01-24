#!/usr/bin/env node
/**
 * Тест отправки логов bull-board в error-dashboard
 *
 * Запуск: node apps/bull-board/test-bull-board-error-dashboard.js
 */

import { createBullBoardLogger } from "@gafus/logger/dist/index.js";

async function testBullBoardErrorDashboard() {
  console.log("🧪 Тестирование отправки логов bull-board в error-dashboard...\n");

  try {
    // Тест 1: Bull Board логгер
    console.log("1️⃣ Тестируем bull-board логгер...");
    const boardLogger = createBullBoardLogger("bull-board");

    // Тест инициализации
    boardLogger.info("Bull-Board initializing", {
      environment: "production",
      port: 3004,
      basePath: "/admin/queues",
    });
    console.log("✅ Board initialization info лог отправлен\n");

    // Тест успешного создания Bull Board
    boardLogger.success("Bull Board created successfully", {
      queueCount: 1,
      queueName: "pushQueue",
      basePath: "/admin/queues",
      operation: "create_bull_board",
    });
    console.log("✅ Board creation success лог отправлен\n");

    // Тест успешного запуска сервера
    boardLogger.success("Bull-Board запущен: http://localhost:3004/admin/queues", {
      port: 3004,
      environment: "production",
      basePath: "/admin/queues",
      operation: "start_server",
    });
    console.log("✅ Server start success лог отправлен\n");

    // Тест 2: Bull Board Creation Error
    console.log("2️⃣ Тестируем Bull Board Creation Error...");
    await boardLogger.error("Ошибка при создании Bull Board", new Error("Queue adapter failed"), {
      environment: "production",
      port: 3004,
      operation: "create_bull_board",
    });
    console.log("✅ Board creation error лог отправлен\n");

    // Тест 3: Health Check Info
    console.log("3️⃣ Тестируем Health Check Info...");
    boardLogger.info("Health check requested", {
      timestamp: new Date().toISOString(),
      operation: "health_check",
    });
    console.log("✅ Health check info лог отправлен\n");

    // Тест 4: Graceful Shutdown Info
    console.log("4️⃣ Тестируем Graceful Shutdown Info...");
    boardLogger.info("Received SIGINT, shutting down gracefully");
    console.log("✅ Graceful shutdown info лог отправлен\n");

    // Тест 5: Queue Connection Error
    console.log("5️⃣ Тестируем Queue Connection Error...");
    await boardLogger.error("Queue connection failed", new Error("Redis connection timeout"), {
      queueName: "pushQueue",
      operation: "connect_queue",
      retryCount: 3,
    });
    console.log("✅ Queue connection error лог отправлен\n");

    // Тест 6: Express Server Error
    console.log("6️⃣ Тестируем Express Server Error...");
    await boardLogger.error("Express server error", new Error("Port already in use"), {
      port: 3004,
      environment: "production",
      operation: "start_server",
    });
    console.log("✅ Express server error лог отправлен\n");

    // Тест 7: Bull Board API Error
    console.log("7️⃣ Тестируем Bull Board API Error...");
    await boardLogger.error("Bull Board API error", new Error("Invalid queue configuration"), {
      queueCount: 1,
      queueName: "pushQueue",
      operation: "configure_queues",
    });
    console.log("✅ Bull Board API error лог отправлен\n");

    // Тест 8: Queue Monitoring Warning
    console.log("8️⃣ Тестируем Queue Monitoring Warning...");
    boardLogger.warn("Queue monitoring disabled", {
      queueName: "pushQueue",
      reason: "Redis connection unstable",
      operation: "monitor_queue",
    });
    console.log("✅ Queue monitoring warning лог отправлен\n");

    // Тест 9: Bull Board Route Access
    console.log("9️⃣ Тестируем Bull Board Route Access...");
    boardLogger.info("Bull Board route accessed", {
      path: "/admin/queues",
      method: "GET",
      userAgent: "Mozilla/5.0",
      operation: "access_dashboard",
    });
    console.log("✅ Route access info лог отправлен\n");

    // Тест 10: Queue Job Processing Success
    console.log("🔟 Тестируем Queue Job Processing Success...");
    boardLogger.success("Queue job processed successfully", {
      queueName: "pushQueue",
      jobId: "job-123",
      jobType: "push_notification",
      duration: 150,
      operation: "process_job",
    });
    console.log("✅ Job processing success лог отправлен\n");

    // Тест 11: Bull Board Configuration Update
    console.log("1️⃣1️⃣ Тестируем Bull Board Configuration Update...");
    boardLogger.info("Bull Board configuration updated", {
      queueCount: 2,
      queueNames: ["pushQueue", "emailQueue"],
      basePath: "/admin/queues",
      operation: "update_configuration",
    });
    console.log("✅ Configuration update info лог отправлен\n");

    // Тест 12: Queue Statistics Success
    console.log("1️⃣2️⃣ Тестируем Queue Statistics Success...");
    boardLogger.success("Queue statistics retrieved", {
      queueName: "pushQueue",
      activeJobs: 5,
      completedJobs: 150,
      failedJobs: 2,
      operation: "get_statistics",
    });
    console.log("✅ Queue statistics success лог отправлен\n");

    // Тест 13: Bull Board Middleware Error
    console.log("1️⃣3️⃣ Тестируем Bull Board Middleware Error...");
    await boardLogger.error("Bull Board middleware error", new Error("Authentication failed"), {
      path: "/admin/queues",
      method: "GET",
      operation: "middleware_auth",
    });
    console.log("✅ Middleware error лог отправлен\n");

    // Тест 14: Queue Cleanup Success
    console.log("1️⃣4️⃣ Тестируем Queue Cleanup Success...");
    boardLogger.success("Queue cleanup completed", {
      queueName: "pushQueue",
      cleanedJobs: 25,
      operation: "cleanup_queue",
    });
    console.log("✅ Queue cleanup success лог отправлен\n");

    // Тест 15: Bull Board Performance Warning
    console.log("1️⃣5️⃣ Тестируем Bull Board Performance Warning...");
    boardLogger.warn("Bull Board performance degraded", {
      responseTime: 5000,
      threshold: 1000,
      queueCount: 1,
      operation: "performance_check",
    });
    console.log("✅ Performance warning лог отправлен\n");

    console.log("🎉 Все тесты завершены!");
    console.log("\n📊 Проверьте error-dashboard:");
    console.log("   - Reports: http://localhost:3001/reports");
    console.log("   - Ищите логи по контексту: bull-board");
    console.log("\n🔍 Ожидаемые логи:");
    console.log("   - Board initialization info сообщения");
    console.log("   - Board creation success сообщения");
    console.log("   - Server start success сообщения");
    console.log("   - Board creation error сообщения");
    console.log("   - Health check info сообщения");
    console.log("   - Graceful shutdown info сообщения");
    console.log("   - Queue connection error сообщения");
    console.log("   - Express server error сообщения");
    console.log("   - Bull Board API error сообщения");
    console.log("   - Queue monitoring warning сообщения (только в production)");
    console.log("   - Route access info сообщения");
    console.log("   - Job processing success сообщения");
    console.log("   - Configuration update info сообщения");
    console.log("   - Queue statistics success сообщения");
    console.log("   - Middleware error сообщения");
    console.log("   - Queue cleanup success сообщения");
    console.log("   - Performance warning сообщения (только в production)");
  } catch (error) {
    console.error("❌ Ошибка при тестировании:", error);
    process.exit(1);
  }
}

// Запускаем тест
testBullBoardErrorDashboard()
  .then(() => {
    console.log("\n✨ Тест завершен успешно!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Тест завершился с ошибкой:", error);
    process.exit(1);
  });
