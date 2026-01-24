#!/usr/bin/env node

/**
 * Тестовый скрипт для проверки отправки логов web приложения в error-dashboard
 *
 * Запуск: node test-web-error-dashboard.js
 */

const { createWebLogger } = require("@gafus/logger");

console.log("🧪 Тестируем отправку логов web приложения в error-dashboard...\n");

// Создаем логгер для web приложения
const logger = createWebLogger("web-test");

// Тестируем различные уровни логирования
console.log("📝 Тестируем различные уровни логирования:");

logger.info("Web App: Пользователь зашел на страницу курсов", {
  operation: "page_view",
  page: "/courses",
  userId: "user-123",
  sessionId: "session-456",
});

logger.warn("Web App: Предупреждение о медленной загрузке", {
  operation: "slow_loading",
  page: "/profile",
  loadTime: 3500,
  threshold: 3000,
});

logger.error("Web App: Ошибка при загрузке курса", new Error("Network timeout"), {
  operation: "course_load_error",
  courseId: "course-789",
  userId: "user-123",
  retryCount: 3,
});

logger.success("Web App: Курс успешно завершен", {
  operation: "course_completed",
  courseId: "course-456",
  userId: "user-789",
  completionTime: "2024-01-15T10:30:00Z",
});

logger.fatal("Web App: Критическая ошибка базы данных", new Error("Connection pool exhausted"), {
  operation: "database_error",
  component: "prisma",
  connectionCount: 100,
  maxConnections: 100,
});

logger.dev("Web App: Отладочная информация", {
  operation: "debug_info",
  component: "training-store",
  state: { currentStep: 5, totalSteps: 10 },
});

console.log("\n✅ Все тестовые логи отправлены!");
console.log("🔍 Проверьте error-dashboard на наличие новых записей");
console.log("📊 Ожидаемые записи:");
console.log("   - web-test: Пользователь зашел на страницу курсов (info)");
console.log("   - web-test: Предупреждение о медленной загрузке (warn)");
console.log("   - web-test: Ошибка при загрузке курса (error)");
console.log("   - web-test: Курс успешно завершен (success)");
console.log("   - web-test: Критическая ошибка базы данных (fatal)");
console.log("   - web-test: Отладочная информация (dev)");
console.log("\n🎯 Все логи должны быть отправлены в error-dashboard с контекстом web");
