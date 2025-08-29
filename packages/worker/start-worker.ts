#!/usr/bin/env node

import path from "path";
import { config } from "dotenv";

// Загружаем переменные окружения из корневой директории проекта
config({ path: path.resolve(__dirname, "../../.env.local") });
config({ path: path.resolve(__dirname, "../../.env") });

// Запускаем основной worker
import "./src/push-worker.ts";
