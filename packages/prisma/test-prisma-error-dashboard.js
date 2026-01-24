#!/usr/bin/env node
/**
 * Тест отправки логов prisma в error-dashboard
 *
 * Запуск: node packages/prisma/test-prisma-error-dashboard.js
 */

import { createWebLogger } from "@gafus/logger/dist/index.js";

async function testPrismaErrorDashboard() {
  console.log("🧪 Тестирование отправки логов prisma в error-dashboard...\n");

  try {
    // Тест 1: Prisma Client логгер
    console.log("1️⃣ Тестируем prisma-client логгер...");
    const clientLogger = createWebLogger("prisma-client");

    // Тест инициализации клиента
    clientLogger.info("Prisma client initialized", {
      databaseUrl: "configured",
      environment: "production",
      logLevel: "error",
    });
    console.log("✅ Prisma client initialization лог отправлен\n");

    // Тест 2: Prisma Seed логгер
    console.log("2️⃣ Тестируем prisma-seed логгер...");
    const seedLogger = createWebLogger("prisma-seed");

    // Тест начала сидирования
    seedLogger.info("Начинаем сидирование базы данных", {
      environment: "production",
      databaseUrl: "configured",
    });
    console.log("✅ Seed start info лог отправлен\n");

    // Тест создания админа
    seedLogger.success("Админ создан или найден", {
      username: "admin",
      phone: "+79198031371",
      role: "ADMIN",
      isConfirmed: true,
    });
    console.log("✅ Admin creation success лог отправлен\n");

    // Тест создания курсов
    seedLogger.success("Курсы созданы", {
      courseCount: 4,
      courseTypes: ["home", "street", "puppy", "author"],
    });
    console.log("✅ Courses creation success лог отправлен\n");

    // Тест создания шагов
    seedLogger.success("Базовые шаги созданы", {
      stepCount: 15,
      stepTypes: ["sit", "stay", "come", "heel", "down"],
    });
    console.log("✅ Steps creation success лог отправлен\n");

    // Тест связки шагов с днем
    seedLogger.success("Связка шагов с базовым днём выполнена", {
      dayId: "day-123",
      stepCount: 15,
    });
    console.log("✅ Steps linking success лог отправлен\n");

    // Тест добавления дня в курсы
    seedLogger.success("Базовый день добавлен в курсы на 14 дней", {
      dayId: "day-123",
      courseCount: 4,
      durationDays: 14,
    });
    console.log("✅ Day addition success лог отправлен\n");

    // Тест добавления щенячьего дня
    seedLogger.success("Щенячий день добавлен в курс", {
      dayId: "puppy-day-456",
      courseType: "puppy",
      stepCount: 8,
    });
    console.log("✅ Puppy day addition success лог отправлен\n");

    // Тест добавления авторского дня
    seedLogger.success("Авторский день добавлен в курс", {
      dayId: "author-day-789",
      courseType: "author",
      stepCount: 12,
    });
    console.log("✅ Author day addition success лог отправлен\n");

    // Тест добавления в избранное
    seedLogger.success("Курсы добавлены в избранное", {
      userId: "user-123",
      favoriteCount: 4,
      courseTypes: ["home", "street", "puppy", "author"],
    });
    console.log("✅ Favorites addition success лог отправлен\n");

    // Тест добавления отзывов
    seedLogger.success("Отзывы добавлены", {
      reviewCount: 20,
      averageRating: 4.5,
    });
    console.log("✅ Reviews addition success лог отправлен\n");

    // Тест обновления рейтингов
    seedLogger.success("Средние рейтинги обновлены", {
      courseCount: 4,
      averageRatings: [
        { id: "course-1", rating: 4.2 },
        { id: "course-2", rating: 4.8 },
        { id: "course-3", rating: 4.5 },
        { id: "course-4", rating: 4.7 },
      ],
    });
    console.log("✅ Ratings update success лог отправлен\n");

    // Тест создания тренера
    seedLogger.success("Тренер создан", {
      trainerId: "trainer-123",
      username: "trainer",
      phone: "+79198031372",
      role: "TRAINER",
    });
    console.log("✅ Trainer creation success лог отправлен\n");

    // Тест создания шагов тренера
    seedLogger.success("Шаги тренера созданы", {
      trainerId: "trainer-123",
      stepCount: 10,
      stepTypes: [
        "sit",
        "stay",
        "come",
        "heel",
        "down",
        "roll",
        "shake",
        "speak",
        "quiet",
        "fetch",
      ],
    });
    console.log("✅ Trainer steps creation success лог отправлен\n");

    // Тест создания дней тренера
    seedLogger.success("Дни тренера со связанными шагами созданы", {
      trainerId: "trainer-123",
      dayCount: 7,
      totalSteps: 70,
    });
    console.log("✅ Trainer days creation success лог отправлен\n");

    // Тест создания курсов тренера
    seedLogger.success("Курсы тренера созданы и дни добавлены в них", {
      trainerId: "trainer-123",
      courseCount: 3,
      totalDays: 21,
    });
    console.log("✅ Trainer courses creation success лог отправлен\n");

    // Тест завершения сидирования
    seedLogger.success("Seed успешно выполнен", {
      totalOperations: 15,
      duration: 2500,
      environment: "production",
    });
    console.log("✅ Seed completion success лог отправлен\n");

    // Тест 3: Prisma Database Error
    console.log("3️⃣ Тестируем Prisma Database Error...");
    await clientLogger.error("Database connection failed", new Error("Connection timeout"), {
      databaseUrl: "postgresql://user:pass@localhost:5432/db",
      environment: "production",
      retryCount: 3,
    });
    console.log("✅ Database connection error лог отправлен\n");

    // Тест 4: Prisma Query Error
    console.log("4️⃣ Тестируем Prisma Query Error...");
    await clientLogger.error("Query execution failed", new Error("Invalid query syntax"), {
      query: "SELECT * FROM users WHERE",
      table: "users",
      operation: "SELECT",
    });
    console.log("✅ Query execution error лог отправлен\n");

    // Тест 5: Prisma Migration Error
    console.log("5️⃣ Тестируем Prisma Migration Error...");
    await clientLogger.error("Migration failed", new Error("Schema validation error"), {
      migrationName: "add_user_table",
      environment: "production",
      schemaChanges: ["CREATE TABLE users"],
    });
    console.log("✅ Migration error лог отправлен\n");

    // Тест 6: Prisma Seed Error
    console.log("6️⃣ Тестируем Prisma Seed Error...");
    await seedLogger.error(
      "Ошибка при сидировании",
      new Error("Foreign key constraint violation"),
      {
        environment: "production",
        databaseUrl: "configured",
        operation: "create_admin",
      },
    );
    console.log("✅ Seed error лог отправлен\n");

    // Тест 7: Prisma Transaction Error
    console.log("7️⃣ Тестируем Prisma Transaction Error...");
    await clientLogger.error("Transaction rollback", new Error("Deadlock detected"), {
      transactionId: "tx-123",
      operations: ["create_user", "create_course"],
      retryCount: 2,
    });
    console.log("✅ Transaction error лог отправлен\n");

    // Тест 8: Prisma Connection Pool Warning
    console.log("8️⃣ Тестируем Prisma Connection Pool Warning...");
    clientLogger.warn("Connection pool exhausted", {
      activeConnections: 10,
      maxConnections: 10,
      pendingQueries: 5,
      environment: "production",
    });
    console.log("✅ Connection pool warning лог отправлен\n");

    // Тест 9: Prisma Performance Warning
    console.log("9️⃣ Тестируем Prisma Performance Warning...");
    clientLogger.warn("Slow query detected", {
      query: "SELECT * FROM users WHERE created_at > ?",
      duration: 5000,
      threshold: 1000,
      table: "users",
    });
    console.log("✅ Slow query warning лог отправлен\n");

    // Тест 10: Prisma Cache Hit Success
    console.log("🔟 Тестируем Prisma Cache Hit Success...");
    clientLogger.success("Query cache hit", {
      query: "SELECT * FROM courses WHERE type = ?",
      cacheKey: "courses-home",
      duration: 5,
      table: "courses",
    });
    console.log("✅ Cache hit success лог отправлен\n");

    console.log("🎉 Все тесты завершены!");
    console.log("\n📊 Проверьте error-dashboard:");
    console.log("   - Reports: http://localhost:3001/reports");
    console.log("   - Ищите логи по контексту: prisma-client, prisma-seed");
    console.log("\n🔍 Ожидаемые логи:");
    console.log("   - Prisma client initialization info сообщения");
    console.log("   - Seed operations success сообщения");
    console.log("   - Database connection error сообщения");
    console.log("   - Query execution error сообщения");
    console.log("   - Migration error сообщения");
    console.log("   - Seed error сообщения");
    console.log("   - Transaction error сообщения");
    console.log("   - Connection pool warning сообщения (только в production)");
    console.log("   - Slow query warning сообщения (только в production)");
    console.log("   - Cache hit success сообщения");
  } catch (error) {
    console.error("❌ Ошибка при тестировании:", error);
    process.exit(1);
  }
}

// Запускаем тест
testPrismaErrorDashboard()
  .then(() => {
    console.log("\n✨ Тест завершен успешно!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Тест завершился с ошибкой:", error);
    process.exit(1);
  });
