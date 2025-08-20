#!/usr/bin/env node

const crypto = require("crypto");

console.log("🔐 Генерация NextAuth секрета...");

const secret = crypto.randomBytes(32).toString("base64");

console.log("\n✅ NextAuth секрет сгенерирован:");
console.log("\n📋 Скопируйте эту строку в ваш .env файл:");
console.log("\n" + "=".repeat(50));
console.log(`NEXTAUTH_SECRET="${secret}"`);
console.log("=".repeat(50));
console.log("\n💡 Не забудьте добавить этот секрет в ваш .env файл!");
