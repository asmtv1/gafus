#!/usr/bin/env node

/**
 * Тестовый скрипт для проверки отключения логирования
 *
 * Запуск:
 * node test-logging-control.js                    # Обычное логирование
 * DISABLE_LOGGING=true node test-logging-control.js  # Полное отключение
 * DISABLE_CONSOLE_LOGGING=true node test-logging-control.js  # Отключение консоли
 * DISABLE_ERROR_DASHBOARD_LOGGING=true node test-logging-control.js  # Отключение error-dashboard
 */

const { createWebLogger } = require("@gafus/logger");

console.log("🧪 Тестируем управление логированием...\n");

// Показываем текущие переменные окружения
console.log("📋 Текущие настройки:");
console.log(`  NODE_ENV: ${process.env.NODE_ENV || "undefined"}`);
console.log(`  DISABLE_LOGGING: ${process.env.DISABLE_LOGGING || "undefined"}`);
console.log(`  DISABLE_CONSOLE_LOGGING: ${process.env.DISABLE_CONSOLE_LOGGING || "undefined"}`);
console.log(
  `  DISABLE_ERROR_DASHBOARD_LOGGING: ${process.env.DISABLE_ERROR_DASHBOARD_LOGGING || "undefined"}`,
);
console.log(`  ERROR_DASHBOARD_URL: ${process.env.ERROR_DASHBOARD_URL || "undefined"}\n`);

// Создаем логгер
const logger = createWebLogger("logging-control-test");

console.log("📝 Тестируем различные уровни логирования:\n");

// Тестируем все уровни
logger.debug("Debug сообщение - должно быть видно только в development");
logger.info("Info сообщение - общая информация");
logger.warn("Warn сообщение - предупреждение");
logger.error("Error сообщение - ошибка", new Error("Тестовая ошибка"), {
  operation: "test_error",
  testData: { value: 123 },
});
logger.fatal("Fatal сообщение - критическая ошибка", new Error("Критическая ошибка"), {
  operation: "test_fatal",
  critical: true,
});
logger.success("Success сообщение - успешная операция");
logger.dev("Dev сообщение - только в development");

console.log("\n✅ Тест завершен!");
console.log("🔍 Проверьте:");
console.log("  - Какие сообщения появились в консоли");
console.log("  - Какие сообщения отправились в error-dashboard");
console.log("  - Как изменилось поведение при разных переменных окружения");

console.log("\n💡 Попробуйте запустить с разными переменными:");
console.log("  DISABLE_LOGGING=true node test-logging-control.js");
console.log("  DISABLE_CONSOLE_LOGGING=true node test-logging-control.js");
console.log("  DISABLE_ERROR_DASHBOARD_LOGGING=true node test-logging-control.js");
