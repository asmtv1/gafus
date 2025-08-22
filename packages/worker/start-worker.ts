#!/usr/bin/env node

// Загружаем переменные окружения из корневой директории
import "dotenv/config";

// Запускаем основной worker
import "./src/push-worker.ts";
