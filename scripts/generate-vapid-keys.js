#!/usr/bin/env node

const webpush = require("web-push");

console.warn("🔑 Генерация VAPID ключей...");

const vapidKeys = webpush.generateVAPIDKeys();

console.warn("\n✅ VAPID ключи сгенерированы:");
console.warn("\n📋 Скопируйте эти строки в ваш .env файл:");
console.warn("\n" + "=".repeat(50));
console.warn(`VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
console.warn(`VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"`);
console.warn("=".repeat(50));
console.warn("\n💡 Не забудьте добавить эти ключи в ваш .env файл!");
