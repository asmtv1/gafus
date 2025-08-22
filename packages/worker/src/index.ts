#!/usr/bin/env node

// Загружаем переменные окружения из корневой директории
import "dotenv/config";

console.warn("🟢 [Worker] Bootstrapping...");

// Импортируем основную логику воркера
import "./push-worker";

console.warn("🟢 [Worker] Worker is up and running 🚀");
