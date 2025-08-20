#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

console.warn("🔑 Обновление VAPID ключей в .env файле...");

const envPath = path.join(process.cwd(), ".env");
let envContent = fs.readFileSync(envPath, "utf8");

// Обновляем VAPID ключи
const newVapidKeys = `# VAPID Public Key for WebPush
VAPID_PUBLIC_KEY=BBT_uDpKlYRC7kN5SCipr9t5ITLA0ELRfbc2rINy9bRPHjCWYdFw7DTJ5FU3GkUCHt4XlMi1jx0BD_vB0VQJlyk

# VAPID Private Key for WebPush
VAPID_PRIVATE_KEY=7dxaBcK63gPR-dw-i42CArEiwIPJdUFhqpBFerKnH0Q`;

// Заменяем старые VAPID ключи на новые
envContent = envContent.replace(
  /# VAPID Public Key for WebPush\nVAPID_PUBLIC_KEY=.*\n\n# VAPID Private Key for WebPush\nVAPID_PRIVATE_KEY=.*/g,
  newVapidKeys,
);

fs.writeFileSync(envPath, envContent);

console.warn("✅ VAPID ключи обновлены в .env файле");
console.warn(
  "🔑 Public Key: BBT_uDpKlYRC7kN5SCipr9t5ITLA0ELRfbc2rINy9bRPHjCWYdFw7DTJ5FU3GkUCHt4XlMi1jx0BD_vB0VQJlyk",
);
console.warn("🔑 Private Key: 7dxaK63gPR-dw-i42CArEiwIPJdUFhqpBFerKnH0Q");
