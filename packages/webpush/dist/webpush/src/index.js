"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web_push_1 = __importDefault(require("web-push"));
/**
 * Перед запуском убедитесь, что в .env заданы:
 * VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT_EMAIL
 */
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("⚠️ VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is missing in environment variables");
    console.warn("Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env");
}
else {
    // При первом запуске сгенерируйте ключи командой:
    // npx web-push generate-vapid-keys
    // и запишите их в .env: VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY
    web_push_1.default.setVapidDetails("https://gafus.ru", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    console.warn("✅ VAPID keys configured");
}
exports.default = web_push_1.default;
