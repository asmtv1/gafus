import webpush from "web-push";
import "dotenv/config";
/**
 * Перед запуском убедитесь, что в .env заданы:
 * VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT_EMAIL
 */
if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  throw new Error("VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is missing in .env");
}
// При первом запуске сгенерируйте ключи командой:
// npx web-push generate-vapid-keys
// и запишите их в .env: VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY
webpush.setVapidDetails(
  "https://gafus.ru",
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);
export default webpush;
