#!/usr/bin/env node

const { spawn } = require("child_process");

console.warn("🧪 Тестирование запуска приложений...\n");

// Тестируем только web приложение
const testApp = { name: "Web App", filter: "@gafus/web", port: 3002 };

console.warn(`🔄 Тестируем запуск ${testApp.name} (порт ${testApp.port})...`);

const child = spawn("pnpm", ["--filter", testApp.filter, "start"], {
  stdio: "pipe",
  shell: true,
  env: { ...process.env },
});

// Логируем вывод
child.stdout.on("data", (data) => {
  const output = data.toString().trim();
  if (output) {
    console.warn(`[${testApp.name}] ${output}`);
  }
});

child.stderr.on("data", (data) => {
  const output = data.toString().trim();
  if (output && !output.includes("Warning")) {
    console.error(`[${testApp.name}] ERROR: ${output}`);
  }
});

child.on("error", (error) => {
  console.error(`❌ Ошибка запуска ${testApp.name}:`, error.message);
});

child.on("exit", (code) => {
  if (code !== 0) {
    console.error(`❌ ${testApp.name} завершился с кодом ${code}`);
  } else {
    console.warn(`✅ ${testApp.name} завершен`);
  }
});

// Останавливаем через 10 секунд
setTimeout(() => {
  console.warn("\n🛑 Останавливаем тест...");
  child.kill("SIGINT");
  process.exit(0);
}, 10000);
