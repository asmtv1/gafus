// src/index.ts
console.log("🟢 [Worker] Bootstrapping...");
// Загружаем переменные окружения
import "dotenv/config";
// Импортируем основную логику воркера
import "./push-worker.js";
console.log("🟢 [Worker] Worker is up and running 🚀");
