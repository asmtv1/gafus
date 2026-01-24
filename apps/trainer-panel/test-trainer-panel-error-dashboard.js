#!/usr/bin/env node

/**
 * Тестовый скрипт для проверки отправки логов trainer-panel в error-dashboard
 *
 * Запуск: node test-trainer-panel-error-dashboard.js
 */

const { createTrainerPanelLogger } = require("@gafus/logger");

console.log("🧪 Тестируем отправку логов trainer-panel в error-dashboard...\n");

// Создаем логгер для trainer-panel
const logger = createTrainerPanelLogger("trainer-panel-test");

// Тестируем различные уровни логирования
console.log("📝 Тестируем различные уровни логирования:");

logger.info("Trainer Panel: Тестовая информация", {
  operation: "test_info",
  testData: { userId: "test-user-123", courseId: "course-456" },
});

logger.warn("Trainer Panel: Предупреждение о валидации", {
  operation: "test_warning",
  validationErrors: ['Поле "название" обязательно', 'Поле "описание" слишком короткое'],
});

logger.error("Trainer Panel: Тестовая ошибка", new Error("Ошибка при создании курса"), {
  operation: "test_error",
  courseData: { title: "Тестовый курс", description: "Описание курса" },
  userId: "trainer-789",
});

logger.success("Trainer Panel: Успешное создание курса", {
  operation: "test_success",
  courseId: "course-123",
  title: "Новый курс",
  userId: "trainer-456",
});

logger.fatal("Trainer Panel: Критическая ошибка системы", new Error("База данных недоступна"), {
  operation: "test_fatal",
  systemComponent: "database",
  retryCount: 3,
});

console.log("\n✅ Все тестовые логи отправлены!");
console.log("🔍 Проверьте error-dashboard на наличие новых записей");
console.log("📊 Ожидаемые записи:");
console.log("   - trainer-panel-test: Тестовая информация (info)");
console.log("   - trainer-panel-test: Предупреждение о валидации (warn)");
console.log("   - trainer-panel-test: Тестовая ошибка (error)");
console.log("   - trainer-panel-test: Успешное создание курса (success)");
console.log("   - trainer-panel-test: Критическая ошибка системы (fatal)");
console.log("\n🎯 Все логи должны быть отправлены в error-dashboard с контекстом trainer-panel");
