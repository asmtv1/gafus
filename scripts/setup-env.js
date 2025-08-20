#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

console.warn("🔧 Настройка переменных окружения...\n");

// Проверяем существование .env файла
const envPath = path.join(process.cwd(), ".env");
const envExists = fs.existsSync(envPath);

if (!envExists) {
  console.warn("📝 Создаем .env файл...");
  fs.writeFileSync(envPath, "");
}

// Читаем текущий .env файл
let envContent = "";
if (envExists) {
  envContent = fs.readFileSync(envPath, "utf8");
}

// Функция для добавления переменной в .env
function addEnvVariable(key, value, comment = "") {
  const lines = envContent.split("\n");
  const existingIndex = lines.findIndex((line) => line.startsWith(`${key}=`));

  const newLine = comment ? `# ${comment}\n${key}=${value}` : `${key}=${value}`;

  if (existingIndex !== -1) {
    lines[existingIndex] = newLine;
  } else {
    lines.push(newLine);
  }

  envContent = lines.join("\n");
}

// Добавляем базовые переменные окружения
console.warn("🔧 Настройка базовых переменных...");

// DATABASE_URL
if (!envContent.includes("DATABASE_URL=")) {
  addEnvVariable(
    "DATABASE_URL",
    "postgresql://postgres:1488@localhost:5432/dog_trainer",
    "Database connection string",
  );
}

// REDIS_URL
if (!envContent.includes("REDIS_URL=")) {
  addEnvVariable("REDIS_URL", "redis://localhost:6379", "Redis connection string");
}

// NEXTAUTH_SECRET
if (!envContent.includes("NEXTAUTH_SECRET=")) {
  addEnvVariable("NEXTAUTH_SECRET", "your-secret-key-here", "NextAuth secret key");
}

// NEXTAUTH_URL
if (!envContent.includes("NEXTAUTH_URL=")) {
  addEnvVariable("NEXTAUTH_URL", "http://localhost:3002", "NextAuth URL");
}

// Генерируем VAPID ключи
console.warn("🔑 Генерация VAPID ключей...");

try {
  // Проверяем, установлен ли web-push
  try {
    execSync("web-push generate-vapid-keys", { stdio: "pipe" });
  } catch (error) {
    console.warn("📦 Устанавливаем web-push...");
    execSync("npm install -g web-push", { stdio: "inherit" });
  }

  // Генерируем ключи
  const vapidOutput = execSync("web-push generate-vapid-keys", { encoding: "utf8" });
  const lines = vapidOutput.trim().split("\n");

  let publicKey = "";
  let privateKey = "";

  lines.forEach((line) => {
    if (line.includes("Public Key:")) {
      publicKey = line.split(":")[1].trim();
    } else if (line.includes("Private Key:")) {
      privateKey = line.split(":")[1].trim();
    }
  });

  if (publicKey && privateKey) {
    addEnvVariable("VAPID_PUBLIC_KEY", publicKey, "VAPID Public Key for WebPush");
    addEnvVariable("VAPID_PRIVATE_KEY", privateKey, "VAPID Private Key for WebPush");
    console.warn("✅ VAPID ключи сгенерированы и добавлены в .env");
  } else {
    console.warn("⚠️ Не удалось извлечь VAPID ключи из вывода команды");
    console.warn("📋 Добавьте ключи вручную в .env файл:");
    console.warn("VAPID_PUBLIC_KEY=your_public_key_here");
    console.warn("VAPID_PRIVATE_KEY=your_private_key_here");
  }
} catch (error) {
  console.warn("⚠️ Не удалось сгенерировать VAPID ключи автоматически");
  console.warn("📋 Добавьте ключи вручную в .env файл:");
  console.warn("VAPID_PUBLIC_KEY=your_public_key_here");
  console.warn("VAPID_PRIVATE_KEY=your_private_key_here");
}

// Записываем обновленный .env файл
fs.writeFileSync(envPath, envContent);

console.warn("\n✅ Настройка завершена!");
console.warn("📁 Файл .env обновлен");

// Проверяем, что все необходимые переменные есть
const requiredVars = [
  "DATABASE_URL",
  "REDIS_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
];

console.warn("\n🔍 Проверка переменных окружения:");
requiredVars.forEach((varName) => {
  const hasVar = envContent.includes(`${varName}=`);
  console.warn(`${hasVar ? "✅" : "❌"} ${varName}`);
});

console.warn("\n📋 Следующие шаги:");
console.warn("1. Убедитесь, что PostgreSQL запущен на localhost:5432");
console.warn("2. Убедитесь, что Redis запущен на localhost:6379");
console.warn("3. Запустите приложения: pnpm start:basic");
console.warn("4. Для полного запуска: pnpm start:all");
