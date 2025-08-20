const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:password@localhost:5432/dog_trainer",
    },
  },
});

async function testErrorReporting() {
  try {
    console.warn("🧪 Тестируем отправку ошибки через Prisma...");

    const errorReport = await prisma.errorReport.create({
      data: {
        message: "Тестовая ошибка из Prisma",
        stack: "Error: Test error\n    at test-prisma-error.js:10:1",
        appName: "test-app",
        environment: "development",
        url: "http://localhost:3000/test",
        userAgent: "Test-Agent/1.0",
        userId: null,
        sessionId: null,
        componentStack: null,
        additionalContext: JSON.stringify({
          test: true,
          source: "prisma-test",
          timestamp: new Date().toISOString(),
        }),
        tags: ["test", "prisma", "manual"],
        resolved: false,
      },
    });

    console.warn("✅ Ошибка успешно сохранена!");
    console.warn("Error ID:", errorReport.id);
    console.warn("Message:", errorReport.message);
    console.warn("Created at:", errorReport.createdAt);

    // Получаем все ошибки
    const allErrors = await prisma.errorReport.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    console.warn("\n📊 Последние 5 ошибок:");
    allErrors.forEach((error, index) => {
      console.warn(`${index + 1}. ${error.message} (${error.appName}) - ${error.createdAt}`);
    });
  } catch (error) {
    console.error("💥 Ошибка в тесте:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testErrorReporting();
