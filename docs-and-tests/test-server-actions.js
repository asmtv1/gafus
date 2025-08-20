const { reportErrorToDashboard } = require("./apps/web/src/lib/actions/reportError.ts");

async function testErrorReporting() {
  try {
    console.warn("🧪 Тестируем отправку ошибки через Server Action...");

    const result = await reportErrorToDashboard({
      message: "Тестовая ошибка из Server Action",
      stack: "Error: Test error\n    at test-server-actions.js:10:1",
      appName: "test-app",
      environment: "development",
      url: "http://localhost:3000/test",
      userAgent: "Test-Agent/1.0",
      additionalContext: {
        test: true,
        source: "server-action-test",
        timestamp: new Date().toISOString(),
      },
      tags: ["test", "server-action", "manual"],
    });

    console.warn("✅ Результат:", result);

    if (result.success) {
      console.warn("🎉 Ошибка успешно отправлена! Error ID:", result.errorId);
    } else {
      console.warn("❌ Ошибка при отправке:", result.error);
    }
  } catch (error) {
    console.error("💥 Ошибка в тесте:", error);
  }
}

testErrorReporting();
