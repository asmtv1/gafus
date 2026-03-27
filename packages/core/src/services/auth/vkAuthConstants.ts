/**
 * Константы VK ID для клиента (Expo) и сервера.
 * Отдельный файл без Node/prisma — не тянуть crypto в React Native.
 */

/** Права VK ID для authorize: почта в ответе user_info (как в кабинете приложения VK). */
export const VK_ID_OAUTH_SCOPE = "email";
