"use strict";
// src/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
console.warn("🟢 [Worker] Bootstrapping...");
// Импортируем основную логику воркера
require("./push-worker");
console.warn("🟢 [Worker] Worker is up and running 🚀");
