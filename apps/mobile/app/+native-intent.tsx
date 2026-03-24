/**
 * Перехват native intents/deep links.
 * VK OAuth возвращает vk{clientId}://vk.ru/... — expo-router пытается навигировать по этому URL
 * и показывает 404. Возвращаем /(auth)/welcome чтобы остаться на auth экране;
 * useVkLogin обрабатывает redirect через Linking.
 */
/* eslint-disable @gafus/require-client-catch-tracer -- защитный обёрточный catch */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    if (!path || typeof path !== "string") return path;
    // VK redirect: vk54472653://vk.ru/blank.html или vk123://vk.ru?code=...
    if (path.includes("vk.ru")) {
      return "/(auth)/welcome";
    }
    return path;
  } catch {
    return "/(auth)/welcome";
  }
}
/* eslint-enable @gafus/require-client-catch-tracer */
