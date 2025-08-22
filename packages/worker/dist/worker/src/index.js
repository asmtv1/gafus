#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Загружаем переменные окружения из корневой директории
require("dotenv/config");
console.warn("🟢 [Worker] Bootstrapping...");
// Импортируем основную логику воркера
require("./push-worker");
console.warn("🟢 [Worker] Worker is up and running 🚀");
