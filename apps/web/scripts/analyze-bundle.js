#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🔍 Анализ размера бандла...");

try {
  // Запускаем сборку с анализатором
  console.log("📦 Сборка с Bundle Analyzer...");
  execSync("ANALYZE=true npm run build", {
    stdio: "inherit",
    env: { ...process.env, ANALYZE: "true" },
  });

  console.log("\n✅ Анализ завершен!");
  console.log("📊 Результаты сохранены в .next/analyze/");

  // Показываем размеры основных файлов
  const analyzeDir = path.join(".next", "analyze");
  if (fs.existsSync(analyzeDir)) {
    const files = fs.readdirSync(analyzeDir);
    console.log("\n📈 Основные файлы:");

    let totalSize = 0;
    files.forEach((file) => {
      const stats = fs.statSync(path.join(analyzeDir, file));
      const sizeKB = (stats.size / 1024).toFixed(2);
      totalSize += stats.size;
      console.log(`  ${file}: ${sizeKB} KB`);
    });

    console.log(`\n📊 Общий размер: ${(totalSize / 1024).toFixed(2)} KB`);

    // Анализ проблемных зависимостей
    console.log("\n🔍 Потенциальные проблемы:");
    console.log("  - Проверьте размер MUI компонентов");
    console.log("  - Убедитесь в использовании tree shaking");
    console.log("  - Рассмотрите lazy loading для тяжелых компонентов");
  }
} catch (error) {
  console.error("❌ Ошибка при анализе:", error.message);
} finally {
  // Удаляем временный файл
  if (fs.existsSync("next.config.analyze.js")) {
    fs.unlinkSync("next.config.analyze.js");
  }
}
