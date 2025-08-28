#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

/**
 * Загружает переменные окружения из .env файлов
 * @param {string} rootDir - Корневая директория проекта
 * @returns {Object} Объект с переменными окружения
 */
function loadEnvVars(rootDir = process.cwd()) {
  const envVars = {};

  try {
    // Загружаем .env.local если существует (с приоритетом)
    const envLocalPath = path.join(rootDir, ".env.local");
    if (fs.existsSync(envLocalPath)) {
      const envLocalContent = fs.readFileSync(envLocalPath, "utf8");
      parseEnvContent(envLocalContent, envVars);
    }

    // Загружаем .env файл (базовые значения)
    const envPath = path.join(rootDir, ".env");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf8");
      parseEnvContent(envContent, envVars);
    }

    console.warn("🔑 ENV загружен из .env.local (приоритет) и .env");
    console.warn(`📋 Загружено ${Object.keys(envVars).length} переменных окружения`);
  } catch (error) {
    console.warn("⚠️ Ошибка загрузки .env файлов:", error.message);
  }

  return envVars;
}

/**
 * Парсит содержимое .env файла
 * @param {string} content - Содержимое файла
 * @param {Object} envVars - Объект для сохранения переменных
 */
function parseEnvContent(content, envVars) {
  content.split("\n").forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith("#") && trimmedLine.includes("=")) {
      const [key, ...valueParts] = trimmedLine.split("=");
      const value = valueParts.join("=").replace(/^["']|["']$/g, "");
      if (key && value !== undefined) {
        envVars[key.trim()] = value.trim();
      }
    }
  });
}

/**
 * Создает объект окружения для дочерних процессов
 * @param {Object} envVars - Переменные из .env файлов
 * @param {Object} additionalVars - Дополнительные переменные
 * @returns {Object} Объект окружения
 */
function createChildEnv(envVars, additionalVars = {}) {
  return {
    ...process.env, // Системные переменные
    ...envVars, // Переменные из .env файлов
    NODE_ENV: "development", // Явно устанавливаем NODE_ENV
    ...additionalVars, // Дополнительные переменные (например, PORT)
  };
}

module.exports = {
  loadEnvVars,
  createChildEnv,
  parseEnvContent,
};
